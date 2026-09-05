// 校验 2：素材引用与磁盘一致、清单与磁盘一致、无旧路径残留
import fs from "node:fs";
import path from "node:path";

const repo = process.argv[2] ?? process.cwd();
let errors = 0;

// 重构前（git HEAD）即缺失的上游素材：代码有引用但仓库从未包含，保持引用不动
const KNOWN_MISSING = new Set([
	"assets/misc/image/爻袁术.jpg",
	"assets/misc/audio/die/爻袁术.mp3",
	"assets/ultraman/audio/die/黑暗迪迦.mp3",
]);

function walk(dir, filter) {
	if (!fs.existsSync(dir)) return [];
	const out = [];
	for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
		const p = path.join(dir, e.name);
		if (e.isDirectory()) out.push(...walk(p, filter));
		else if (!filter || filter(e.name)) out.push(p);
	}
	return out;
}
const jsFiles = walk(repo, n => n.endsWith(".js") || n.endsWith(".mjs"));
const read = f => fs.readFileSync(f, "utf8");

// ---- 1. 代码中的 assets 引用必须在磁盘存在（模板串动态引用除外）----
const refRe = /(?:ext:奥特之星|extension\/奥特之星)\/(assets\/[^"'`\s\])+]+)/g;
const refs = new Set();
for (const f of jsFiles) {
	const src = read(f);
	let m;
	refRe.lastIndex = 0;
	while ((m = refRe.exec(src))) {
		const r = m[1].replace(/[)\]]+$/, "");
		if (r.includes("${")) continue;
		// 引用引号后紧跟 "+" 为动态拼接（如 kanpo + 随机数），无法静态定位具体文件，跳过
		const after = src.slice(m.index + m[0].length).replace(/^["'`]/, "").trimStart();
		if (after.startsWith("+")) continue;
		refs.add(r);
	}
}
for (const ref of refs) {
	if (KNOWN_MISSING.has(ref)) continue;
	const base = path.join(repo, ref);
	const candidates = [base, base + ".mp3", base + ".jpg", base + ".png"];
	if (!candidates.some(c => fs.existsSync(c))) {
		errors++;
		console.log(`MISSING asset ref: ${ref}`);
	}
}
console.log(`asset refs checked: ${refs.size} (dynamic \${} refs skipped)`);

// ---- 1b. 彩蛋音频值专项校验（eggPlayAudio 拼接 ultraman/audio/easterEggs/<audio>）----
const eggFile = jsFiles.find(f => f.endsWith("easterEgg.js"));
if (eggFile) {
	const src = read(eggFile);
	const audRe = /audio:\s*["']([^"']+)["']/g;
	let m, count = 0;
	while ((m = audRe.exec(src))) {
		count++;
		const p = path.join(repo, "assets", "ultraman", "audio", "easterEggs", m[1]);
		if (!fs.existsSync(p)) {
			errors++;
			console.log(`MISSING easterEgg audio: ${m[1]}`);
		}
	}
	console.log(`easterEgg audio checked: ${count}`);
}

// ---- 2. BGM 数据：相对 assets/ 的每个值必须存在 ----
const bgmFile = path.join(repo, "data/bgm/bgmList.js");
if (fs.existsSync(bgmFile)) {
	const src = read(bgmFile);
	const valRe = /["']([\w./-]+\/(?:audio|image)\/[^"']+)["']/g;
	let m, bgmCount = 0;
	while ((m = valRe.exec(src))) {
		bgmCount++;
		const p = path.join(repo, "assets", m[1]);
		if (!fs.existsSync(p) && !fs.existsSync(p + ".mp3")) {
			errors++;
			console.log(`MISSING bgm asset: ${m[1]}`);
		}
	}
	console.log(`bgm entries checked: ${bgmCount}`);
}

// ---- 3. 清单条目必须在磁盘存在；磁盘额外文件仅提示（旧项目即有清单外文件）----
const manifestFile = path.join(repo, "data/manifests/assets.js");
const manifestSrc = read(manifestFile);
const listRe = /["'](assets\/[^"']+)["']/g;
const listed = new Set();
let lm;
while ((lm = listRe.exec(manifestSrc))) listed.add(lm[1].replaceAll("\\", "/"));

const onDisk = new Set();
const assetsDir = path.join(repo, "assets");
for (const f of walk(assetsDir)) {
	onDisk.add(path.relative(repo, f).split(path.sep).join("/"));
}
for (const item of listed) {
	if (!onDisk.has(item)) {
		errors++;
		console.log(`MANIFEST-DISK MISMATCH (listed, not on disk): ${item}`);
	}
}
const extra = [...onDisk].filter(x => !listed.has(x));
console.log(`manifest entries=${listed.size}, disk files=${onDisk.size}, extra-on-disk=${extra.length}`);
for (const x of extra) console.log(`  NOTE extra (not in manifest, legacy): ${x}`);

// ---- 4. 全局文本：无旧路径/无名扩展残留（CHANGELOG 历史与 tools/ 脚本本身除外）----
const allText = walk(repo, n => /\.(js|mjs|json|md|txt)$/.test(n));
const oldPathRe = /奥特之星\/(image|audio|card)\//;
const wmRe = /无名扩展/;
for (const f of allText) {
	const rel = path.relative(repo, f).split(path.sep).join("/");
	if (rel === "CHANGELOG.md" || rel.startsWith("tools/")) continue;
	const src = read(f);
	const lines = src.split("\n");
	for (let i = 0; i < lines.length; i++) {
		if (oldPathRe.test(lines[i])) {
			errors++;
			console.log(`OLD PATH residue: ${rel}:${i + 1}`);
		}
		if (wmRe.test(lines[i])) {
			errors++;
			console.log(`无名扩展 residue: ${rel}:${i + 1}`);
		}
	}
}

console.log(`check-assets: errors=${errors}`);
if (errors > 0) process.exit(1);
