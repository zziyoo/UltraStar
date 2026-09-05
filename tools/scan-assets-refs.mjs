// 临时扫描脚本：统计 assets/ 引用模式与文件编码特征
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const exts = [".js", ".mjs", ".json", ".md", ".txt"];
const files = [];
(function walk(d) {
	for (const e of fs.readdirSync(d, { withFileTypes: true })) {
		if (e.name === ".git" || e.name === "node_modules" || e.name === "tmp") continue;
		const p = path.join(d, e.name);
		if (e.isDirectory()) walk(p);
		else if (exts.includes(path.extname(e.name))) files.push(p);
	}
})(repo);

let withBom = 0, withCrlf = 0;
const groups = new Map();
for (const f of files) {
	const s = fs.readFileSync(f, "utf8");
	if (s.charCodeAt(0) === 0xfeff) withBom++;
	if (/\r\n/.test(s)) withCrlf++;
	const re = /.{20}assets\/.{0,44}/g;
	let m;
	while ((m = re.exec(s))) {
		const t = m[0].replaceAll("\n", "\\n");
		let k;
		if (/assets\/camp\//.test(t)) k = "subdir:camp/";
		else if (/assets\/easteregg\//.test(t)) k = "subdir:easteregg/";
		else if (/assets\/tierlist\//.test(t)) k = "subdir:tierlist/";
		else if (/assets\/\$\{/.test(t)) k = "template";
		else if (/assets\/[^\x00-\x7f]+\.(jpg|png|mp3)/.test(t)) k = "chinese+ext";
		else if (/assets\/[a-zA-Z0-9_-]+\.mp3/.test(t)) k = "ascii.mp3";
		else if (/assets\/[a-zA-Z0-9_-]+\.(jpg|png)/.test(t)) k = "ascii.img";
		else if (/assets\/[a-zA-Z0-9_-]+["'`]/.test(t)) k = "ascii.bare";
		else k = "OTHER";
		if (!groups.has(k)) groups.set(k, []);
		if (groups.get(k).length < 8) groups.get(k).push(path.relative(repo, f).replaceAll("\\", "/") + "  |  " + t);
		else if (groups.get(k).length === 8) groups.get(k).push("...(more)");
	}
}
for (const [k, v] of groups) {
	console.log(`\n== ${k}`);
	for (const x of v) console.log("   " + x);
}
console.log(`\nfiles: ${files.length}, withBOM: ${withBom}, withCRLF: ${withCrlf}`);
