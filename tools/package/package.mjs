// 手动打包脚本：完整包 / 增补包
// 配合 .github/workflows/package.yml 在 GitHub Actions 上运行，也可在本地执行（需 git）
//
// 版本模型（两套逻辑严格分离）：
//   完整包 = 当前 main HEAD 快照
//     - 数据来源唯一：本次 checkout 的 HEAD（git archive HEAD），与任何 Tag 无关
//     - 版本号取 HEAD 的 info.json.version，仅用于命名与展示，不作为打包条件
//     - 不做 Tag↔info.json 一致性校验（完整包不使用 Tag）
//   增补包 = 两个正式版本 Tag 之间的正向差异
//     - 数据来源：git diff 旧Tag 新Tag，文件内容取自新 Tag 的树
//     - 新旧 Tag 必须真实存在、不得相同或反向，且各自与 info.json 版本号一致
//
// 用法：
//   node tools/package/package.mjs --type 完整包
//   node tools/package/package.mjs --type 增补包 [--old 上一版 | v2.1.1] [--new 最新版 | v2.1.2]
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { deflateRawSync } from "node:zlib";

// 打包排除项：开发/CI 文件不进入发布包
const EXCLUDED_PATHS = [".github", "tools", "node_modules"];
const EXCLUDED_FILES = ["Thumbs.db", ".DS_Store"];
const ARCHIVE_EXCLUDES = [
	":(exclude).github",
	":(exclude)tools",
	":(exclude)node_modules",
	":(exclude,glob)**/Thumbs.db",
	":(exclude,glob)**/.DS_Store",
];

function fail(msg) {
	console.error(`[打包失败] ${msg}`);
	process.exit(1);
}

function parseArgs(argv) {
	const args = { type: "", old: "", new: "", outDir: "dist" };
	for (let i = 0; i < argv.length; i += 2) {
		const key = argv[i];
		const val = argv[i + 1] ?? "";
		if (!key || !key.startsWith("--")) fail(`未知参数：${key ?? "(空)"}`);
		switch (key) {
			case "--type": args.type = val; break;
			case "--old": args.old = val; break;
			case "--new": args.new = val; break;
			case "--out-dir": args.outDir = val; break;
			default: fail(`未知参数：${key}`);
		}
	}
	return args;
}

function git(args, opts = {}) {
	return execFileSync("git", args, { encoding: "utf8", maxBuffer: 512 * 1024 * 1024, ...opts });
}

function listVersionTags() {
	return git(["tag", "--list", "v*", "--sort=-v:refname"]).split("\n").map(t => t.trim()).filter(Boolean);
}

function verCmp(a, b) {
	const toNums = t => t.replace(/^v/, "").split(".").map(n => {
		const v = Number.parseInt(n, 10);
		if (Number.isNaN(v)) fail(`版本号「${t}」无法解析为 vX.Y.Z 形式`);
		return v;
	});
	const x = toNums(a), y = toNums(b);
	for (let i = 0; i < 3; i++) {
		const d = (x[i] ?? 0) - (y[i] ?? 0);
		if (d) return d;
	}
	return 0;
}

// 增补包专用：把旧/新版本输入解析为真实存在的版本 Tag。
// 输入规则：空/"最新版" → 最新 v* Tag；"上一版" → 次新 v* Tag；"2.1.1"/"v2.1.1" → 必须真实存在。
// 不存在时直接失败并列出有效 Tag（workflow 不维护 Tag 列表，一切以运行时为准）。
// 完整包不经过此函数——它只打包当前 HEAD，与 Tag 无关。
function resolveTagInput(raw, tags, label, emptyMode) {
	const input = (raw ?? "").trim();
	if (!input || input === "最新版" || input === "上一版") {
		const wantPrev = input === "上一版" || (input === "" && emptyMode === "prev");
		const tag = tags[wantPrev ? 1 : 0];
		if (!tag) {
			fail(wantPrev
				? `无法确定${label}「上一版」：仓库至少需要两个 v* Tag（当前：${tags[0] ?? "无"}）。`
				: `无法确定${label}：仓库中没有任何 v* Tag。`);
		}
		return tag;
	}
	const tag = input.startsWith("v") ? input : `v${input}`;
	if (!tags.includes(tag)) {
		const hint = tags.slice(0, 20).join(", ") || "（当前仓库没有任何 v* Tag）";
		fail(`增补包${label}「${input}」不是有效的版本 Tag。可用版本：${hint}\n创建并推送 Tag：git tag ${tag} && git push origin ${tag}`);
	}
	return tag;
}

// 增补包专用：正式 Tag 必须与其 info.json 的版本号一致（Tag v2.1.2 ⇔ "version": "2.1.2"），
// 防止"Tag 已推进但 info.json 未同步"的错版增补
function checkTagVersionConsistency(tag) {
	let infoVersion;
	try {
		infoVersion = JSON.parse(git(["show", `${tag}:info.json`])).version;
	} catch (e) {
		fail(`无法读取 Tag ${tag} 中的 info.json：${e.message}`);
	}
	const expected = tag.replace(/^v/, "");
	if (infoVersion !== expected) {
		fail(`Tag 与项目版本号不一致，拒绝打包增补包：\n  Tag = ${tag}\n  该 Tag 内 info.json version = ${infoVersion}\n\n增补包以 Git Tag 为版本边界，请修正 Tag 或 info.json 后重试。`);
	}
}

function isExcluded(p) {
	if (EXCLUDED_PATHS.some(d => p === d || p.startsWith(d + "/"))) return true;
	return EXCLUDED_FILES.some(f => p === f || p.endsWith("/" + f));
}

// 直接解析 zip 中央目录取条目名：避免外部列表工具在 Windows 上的控制台编码问题
function listZip(zipPath) {
	const buf = fs.readFileSync(zipPath);
	let eocd = -1;
	for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--) {
		if (buf.readUInt32LE(i) === 0x06054b50) {
			eocd = i;
			break;
		}
	}
	if (eocd < 0) fail(`无效的 zip 文件（未找到中央目录结尾）：${zipPath}`);
	const count = buf.readUInt16LE(eocd + 10);
	if (count === 0xffff) fail(`zip 条目数超出普通 zip 上限：${zipPath}`);
	let off = buf.readUInt32LE(eocd + 16);
	const names = [];
	for (let n = 0; n < count; n++) {
		if (off + 46 > buf.length || buf.readUInt32LE(off) !== 0x02014b50) fail(`zip 中央目录损坏：${zipPath}`);
		const flags = buf.readUInt16LE(off + 8);
		const nameLen = buf.readUInt16LE(off + 28);
		const extraLen = buf.readUInt16LE(off + 30);
		const commentLen = buf.readUInt16LE(off + 32);
		const nameBuf = buf.subarray(off + 46, off + 46 + nameLen);
		let name = nameBuf.toString("utf8");
		if (!(flags & 0x800) && name.includes("\uFFFD")) name = nameBuf.toString("latin1");
		names.push(name);
		off += 46 + nameLen + extraLen + commentLen;
	}
	return names;
}

function compareSets(expected, actual, label) {
	const norm = p => p.replace(/^\.\//, "");
	const exp = new Set(expected.filter(p => !p.endsWith("/") && norm(p) !== "."));
	const act = new Set(actual.filter(p => !p.endsWith("/") && norm(p) !== ".").map(norm));
	const missing = [...exp].filter(p => !act.has(p));
	const extra = [...act].filter(p => !exp.has(p));
	if (missing.length || extra.length) {
		fail(`zip 内容与预期不一致（${label}）\n  缺少（${missing.length}）：${missing.slice(0, 10).join(", ")}\n  多余（${extra.length}）：${extra.slice(0, 10).join(", ")}`);
	}
	return exp.size;
}

// 解析 git archive 的 tar 并取出指定成员内容（兼容 ustar prefix、GNU longname、pax path）
function collectTarMembers(tarBuf, want) {
	const entries = [];
	const found = new Set();
	let off = 0;
	let pendingName = null;
	while (off + 512 <= tarBuf.length) {
		const header = tarBuf.subarray(off, off + 512);
		if (header.every(b => b === 0)) break;
		const sizeRaw = header.subarray(124, 136).toString("utf8").replace(/[^0-7]/g, "");
		const size = sizeRaw ? Number.parseInt(sizeRaw, 8) : 0;
		const typeCode = header[156];
		const type = typeCode === 0 ? "0" : String.fromCharCode(typeCode);
		const dataStart = off + 512;
		const dataEnd = dataStart + size;
		if (type === "L") {
			pendingName = tarBuf.subarray(dataStart, dataEnd).toString("utf8").replace(/\0+$/, "");
			off = dataEnd + ((512 - (dataEnd - dataStart) % 512) % 512);
			continue;
		}
		if (type === "x" || type === "g") {
			if (type === "x") {
				const m = tarBuf.subarray(dataStart, dataEnd).toString("utf8").match(/(?:^|\n)\d+ path=([^\n]+)\n/);
				if (m) pendingName = m[1];
			}
			off = dataEnd + ((512 - (dataEnd - dataStart) % 512) % 512);
			continue;
		}
		const nameField = header.subarray(0, 100).toString("utf8").replace(/\0+$/, "");
		let name = nameField;
		if (header.subarray(257, 263).toString("utf8").startsWith("ustar")) {
			const prefix = header.subarray(345, 500).toString("utf8").replace(/\0+$/, "");
			if (prefix) name = `${prefix}/${nameField}`;
		}
		if (pendingName) {
			name = pendingName;
			pendingName = null;
		}
		if ((type === "0" || type === "7") && want.has(name)) {
			entries.push({ name, data: tarBuf.subarray(dataStart, dataEnd) });
			found.add(name);
		}
		off = dataEnd + ((512 - (dataEnd - dataStart) % 512) % 512);
	}
	const missing = [...want].filter(p => !found.has(p));
	if (missing.length) fail(`新版本 tar 中缺少成员（${missing.length}）：${missing.slice(0, 5).join(", ")}`);
	return entries;
}

// 纯 Node 写 zip（deflate + UTF-8 文件名），避免外部 zip 工具的编码与平台差异
const CRC_TABLE = (() => {
	const t = new Int32Array(256);
	for (let n = 0; n < 256; n++) {
		let c = n;
		for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		t[n] = c;
	}
	return t;
})();

function crc32(buf) {
	let c = -1;
	for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
	return (c ^ -1) >>> 0;
}

function createZip(entries, outPath) {
	const chunks = [];
	const central = [];
	let offset = 0;
	for (const { name, data } of entries) {
		const nameBuf = Buffer.from(name, "utf8");
		const crc = crc32(data);
		const deflated = deflateRawSync(data, { level: 9 });
		const method = deflated.length < data.length ? 8 : 0;
		const payload = method === 8 ? deflated : data;
		const local = Buffer.alloc(30);
		local.writeUInt32LE(0x04034b50, 0);
		local.writeUInt16LE(20, 4);
		local.writeUInt16LE(0x0800, 6);
		local.writeUInt16LE(method, 8);
		local.writeUInt16LE(0, 10);
		local.writeUInt16LE(0x21, 12);
		local.writeUInt32LE(crc, 14);
		local.writeUInt32LE(payload.length, 18);
		local.writeUInt32LE(data.length, 22);
		local.writeUInt16LE(nameBuf.length, 26);
		chunks.push(local, nameBuf, payload);
		const cen = Buffer.alloc(46);
		cen.writeUInt32LE(0x02014b50, 0);
		cen.writeUInt16LE(20, 4);
		cen.writeUInt16LE(20, 6);
		cen.writeUInt16LE(0x0800, 8);
		cen.writeUInt16LE(method, 10);
		cen.writeUInt16LE(0, 12);
		cen.writeUInt16LE(0x21, 14);
		cen.writeUInt32LE(crc, 16);
		cen.writeUInt32LE(payload.length, 20);
		cen.writeUInt32LE(data.length, 24);
		cen.writeUInt16LE(nameBuf.length, 28);
		cen.writeUInt32LE(offset, 42);
		central.push(Buffer.concat([cen, nameBuf]));
		offset += 30 + nameBuf.length + payload.length;
	}
	const cd = Buffer.concat(central);
	const eocd = Buffer.alloc(22);
	eocd.writeUInt32LE(0x06054b50, 0);
	eocd.writeUInt16LE(entries.length, 8);
	eocd.writeUInt16LE(entries.length, 10);
	eocd.writeUInt32LE(cd.length, 12);
	eocd.writeUInt32LE(offset, 16);
	fs.writeFileSync(outPath, Buffer.concat([...chunks, cd, eocd]));
}

// GitHub 资产名不支持非 ASCII（上传与 PATCH 更新都会剥离，2026-09-06 实测），
// 因此磁盘文件名（即实际下载文件名）用英文；中文名通过 asset label 在 Release 页面展示，
// package.yml 会先尝试 PATCH 中文名，失败则回退为此方案并在 Release 正文注明
function readProjectNameEn() {
	try {
		const url = git(["remote", "get-url", "origin"]).trim();
		const m = url.match(/\/([^\/]+?)(?:\.git)?$/);
		return m ? m[1] : "UltraStar";
	} catch {
		return "UltraStar";
	}
}

function readProjectName(ref) {
	try {
		return JSON.parse(git(["show", `${ref}:info.json`])).name || "奥特之星";
	} catch {
		return "奥特之星";
	}
}

// 完整包：当前 HEAD 快照。唯一数据来源 = 本次 checkout 的 HEAD，与 Tag/历史版本完全无关；
// 版本号取 HEAD 的 info.json.version，仅用于命名与展示
function packageFull(outDir, nameEn, nameCn) {
	let version;
	try {
		version = JSON.parse(git(["show", "HEAD:info.json"])).version;
	} catch (e) {
		fail(`无法读取当前 HEAD 的 info.json：${e.message}`);
	}
	if (!version) fail("当前 HEAD 的 info.json 缺少 version 字段，无法命名完整包");
	const commit = git(["rev-parse", "--short", "HEAD"]).trim();
	const expected = git(["ls-tree", "-r", "--name-only", "-z", "HEAD"]).split("\0").filter(Boolean).filter(p => !isExcluded(p));
	if (!expected.length) fail("当前 HEAD 的树内容为空");
	const outZip = path.join(outDir, `${nameEn}-v${version}-full.zip`);
	fs.rmSync(outZip, { force: true });
	git(["-c", "core.autocrlf=false", "archive", "--format=zip", `--output=${outZip}`, "HEAD", "--", ".", ...ARCHIVE_EXCLUDES]);
	const count = compareSets(expected, listZip(outZip), "完整包 HEAD");
	return { outZip, label: `${nameCn}-v${version}-完整包.zip`, version, commit, count };
}

// 增补包：旧 Tag → 新 Tag 的正向差异（两个正式版本之间的更新文件）
function packagePatch(oldTag, newTag, outDir, nameEn, nameCn) {
	if (oldTag === newTag) fail(`旧版本与新版本相同（${oldTag}）：增补包要求选择两个不同的版本`);
	const cmp = verCmp(oldTag, newTag);
	if (cmp > 0) fail(`旧版本（${oldTag}）晚于新版本（${newTag}）：增补包只支持 旧版本 → 新版本 的正向差异，请交换两个版本后重试`);
	if (cmp === 0) fail(`旧版本与新版本号相同（${oldTag} = ${newTag}）`);

	const raw = git(["diff", "--name-status", "-z", "--find-renames", oldTag, newTag]);
	const tokens = raw.split("\0");
	const added = [], modified = [], renamed = [], copied = [], deleted = [];
	for (let i = 0; i < tokens.length;) {
		const st = tokens[i++];
		if (!st) continue;
		const op = st[0];
		if (op === "R" || op === "C") {
			const from = tokens[i++];
			const to = tokens[i++];
			(op === "R" ? renamed : copied).push({ from, to });
		} else {
			const p = tokens[i++];
			if (op === "A") added.push(p);
			else if (op === "M" || op === "T") modified.push(p);
			else if (op === "D") deleted.push(p);
			else fail(`未知的 diff 状态「${st}」（文件：${p}）`);
		}
	}

	const includeAll = [...added, ...modified, ...renamed.map(r => r.to), ...copied.map(c => c.to)];
	const excludedDev = includeAll.filter(isExcluded);
	const include = includeAll.filter(p => !isExcluded(p));
	if (!include.length) fail(`版本 ${oldTag} → ${newTag} 之间没有可打包的变更文件`);

	// 从新版本的 git 树中提取文件内容（不使用工作区，保证内容与版本一致）
	// tar 解析与 zip 写入均在 Node 内完成，避免外部工具的编码与平台差异
	const tarBuf = git(["-c", "core.autocrlf=false", "archive", "--format=tar", newTag], { encoding: "buffer" });
	const entries = collectTarMembers(tarBuf, new Set(include));

	const outZip = path.join(outDir, `${nameEn}-${oldTag}-to-${newTag}-patch.zip`);
	fs.rmSync(outZip, { force: true });
	createZip(entries, outZip);

	const count = compareSets(include, listZip(outZip), `增补包 ${oldTag} → ${newTag}`);
	if (count !== include.length) fail(`增补包内部错误：打包数量 ${count} 与预期 ${include.length} 不符`);
	const newCommit = git(["rev-parse", "--short", `${newTag}^{commit}`]).trim();
	return {
		outZip,
		label: `${nameCn}-${oldTag}到${newTag}-增补包.zip`,
		newCommit,
		stats: { added, modified, renamed, copied, deleted, excludedDev, packaged: include.length },
		include,
	};
}

function writeSummary(md) {
	const p = process.env.GITHUB_STEP_SUMMARY;
	if (p) {
		try {
			fs.appendFileSync(p, md + "\n", "utf8");
		} catch {}
	}
	console.log(md);
}

// releaseTag：完整包 = "v" + HEAD 的 info.json.version（由 release 步骤在该 commit 上自动建 Tag，
//   仅作打包产物标识，不是版本来源）；增补包 = 新版本 Tag
function writeOutputs(outZip, label, releaseTag) {
	const ghEnv = process.env.GITHUB_ENV;
	if (!ghEnv) return;
	try {
		fs.appendFileSync(ghEnv, `zip_name=${path.basename(outZip)}\nzip_path=${outZip.replaceAll("\\", "/")}\nzip_label=${label}\nrelease_tag=${releaseTag}\n`, "utf8");
	} catch {}
}

function main() {
	const args = parseArgs(process.argv.slice(2));
	const TYPE_MAP = { "完整包": "full", "增补包": "patch", full: "full", patch: "patch" };
	args.type = TYPE_MAP[args.type] ?? args.type;
	if (args.type !== "full" && args.type !== "patch") {
		fail(`打包类型必须是 完整包 或 增补包，收到：${args.type || "(空)"}`);
	}
	if (!fs.existsSync("info.json")) fail("请在仓库根目录运行本脚本（未找到 info.json）");
	fs.mkdirSync(args.outDir, { recursive: true });
	const nameEn = readProjectNameEn();

	// ---------- 完整包：当前 main HEAD 快照，不依赖任何 Tag ----------
	if (args.type === "full") {
		const { outZip, label, version, commit, count } = packageFull(args.outDir, nameEn, "奥特之星");
		writeSummary([
			"## 打包结果",
			"",
			"| 项目 | 值 |",
			"| --- | --- |",
			"| 打包类型 | 完整包 |",
			"| 内容来源 | main 当前 HEAD |",
			`| Commit | ${commit} |`,
			`| 项目版本 | ${version} |`,
			`| 文件数量 | ${count} |`,
			`| 输出文件 | \`${label}\` |`,
			"",
			"压缩包将发布到对应版本的 Release 页面，打包完成后点击下方链接下载。",
		].join("\n"));
		writeOutputs(outZip, label, `v${version}`);
		console.log(`[打包完成] ${outZip}（${count} 个文件）`);
		return;
	}

	// ---------- 增补包：旧 Tag → 新 Tag 的正向差异 ----------
	const tags = listVersionTags();
	const newTag = resolveTagInput(args.new, tags, "新版本", "latest");
	const oldTag = resolveTagInput(args.old, tags, "旧版本", "prev");
	checkTagVersionConsistency(newTag);
	checkTagVersionConsistency(oldTag);
	const { outZip, label, newCommit, stats, include } = packagePatch(oldTag, newTag, args.outDir, nameEn, readProjectName(newTag));
	const fileList = include.slice(0, 50).map(p => `- ${p}`).join("\n")
		+ (include.length > 50 ? `\n- ...等共 ${include.length} 个文件` : "");
	writeSummary([
		"## 打包结果",
		"",
		"| 项目 | 值 |",
		"| --- | --- |",
		"| 打包类型 | 增补包 |",
		`| 旧版本 | ${oldTag} |`,
		`| 新版本 | ${newTag}（${newCommit}） |`,
		`| 输出文件 | \`${label}\` |`,
		"",
		"| 统计 | 数量 |",
		"| --- | --- |",
		`| 新增 | ${stats.added.length} |`,
		`| 修改 | ${stats.modified.length} |`,
		`| 重命名 | ${stats.renamed.length} |`,
		`| 复制 | ${stats.copied.length} |`,
		`| 删除（不入包） | ${stats.deleted.length} |`,
		`| 排除（开发文件） | ${stats.excludedDev.length} |`,
		`| 最终打包 | ${stats.packaged} |`,
		"",
		"### 变更文件清单",
		"",
		fileList,
		"",
		"压缩包将上传到新版本对应的 Release 页面，打包完成后点击下方链接下载。",
	].join("\n"));
	writeOutputs(outZip, label, newTag);
	console.log(`[打包完成] ${outZip}（新增 ${stats.added.length} / 修改 ${stats.modified.length} / 重命名 ${stats.renamed.length} / 删除 ${stats.deleted.length}（不入包）/ 最终打包 ${stats.packaged}）`);
}

main();
