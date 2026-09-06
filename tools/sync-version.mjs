// 从 CHANGELOG.md 顶部条目生成 src/core/version.js，并回写 info.json 的 version 字段
// 用法：node tools/sync-version.mjs          同步一次
//       node tools/sync-version.mjs --watch  监听 CHANGELOG.md，变更即自动同步
import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const root = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "..");
const changelogPath = path.join(root, "CHANGELOG.md");
const versionJsPath = path.join(root, "src", "core", "version.js");
const infoJsonPath = path.join(root, "info.json");

function sync() {
	const md = fs.readFileSync(changelogPath, "utf8").replace(/^\uFEFF/, "");
	const head = md.match(/^##\s*v(\d+\.\d+\.\d+)[^\n]*$/m);
	if (!head) {
		throw new Error("CHANGELOG.md 顶部未找到版本条目（## vX.Y.Z）");
	}
	const version = head[1];
	const rest = md.slice(head.index + head[0].length);
	const noteLine = rest.split(/\r?\n/).find(l => l.trim());
	if (!noteLine) {
		throw new Error("CHANGELOG.md 版本条目下未找到更新说明行");
	}
	const note = noteLine.replace(/^#+\s*/, "").trim();

	const banner = "// 本文件由 tools/sync-version.mjs 从 CHANGELOG.md 自动生成，请勿手动编辑\n";
	fs.writeFileSync(
		versionJsPath,
		`${banner}export const VERSION = ${JSON.stringify(version)};\nexport const VERSION_NOTE = ${JSON.stringify(note)};\n`,
		"utf8"
	);

	let info = fs.readFileSync(infoJsonPath, "utf8").replace(/^\uFEFF/, "");
	const infoRe = /("version"\s*:\s*")[^"]*(")/;
	if (infoRe.test(info)) {
		info = info.replace(infoRe, `$1${version}$2`);
	} else {
		const parsed = JSON.parse(info);
		const ordered = {};
		let inserted = false;
		for (const [k, v] of Object.entries(parsed)) {
			if (k === "version") continue;
			ordered[k] = v;
			if (k === "name") {
				ordered.version = version;
				inserted = true;
			}
		}
		if (!inserted) {
			ordered.version = version;
		}
		info = JSON.stringify(ordered, null, 2) + "\n";
	}
	fs.writeFileSync(infoJsonPath, info, "utf8");

	console.log(`版本已同步：${version}（${note}）`);
}

if (process.argv.includes("--watch")) {
	let timer = null;
	fs.watch(changelogPath, () => {
		clearTimeout(timer);
		timer = setTimeout(() => {
			try {
				sync();
			} catch (e) {
				console.error(`同步失败：${e.message}`);
			}
		}, 200);
	});
	console.log("正在监听 CHANGELOG.md，变更后自动同步（Ctrl+C 退出）");
	sync();
} else {
	sync();
}
