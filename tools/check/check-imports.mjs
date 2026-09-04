// 校验 1：所有 .js 的相对 import/export from 路径必须解析到存在的文件
import fs from "node:fs";
import path from "node:path";

const repo = process.argv[2] ?? process.cwd();
let errors = 0, checked = 0;

function walk(dir) {
	if (!fs.existsSync(dir)) return [];
	const out = [];
	for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
		const p = path.join(dir, e.name);
		if (e.isDirectory()) out.push(...walk(p));
		else if (e.name.endsWith(".js")) out.push(p);
	}
	return out;
}

const files = walk(repo);
const importRe = /(?:^|[;\s}])(?:import|export)\s+(?:[\s\S]*?from\s+)?["'](\.[^"']+)["']/g;

for (const file of files) {
	const src = fs.readFileSync(file, "utf8");
	const dir = path.dirname(file);
	let m;
	importRe.lastIndex = 0;
	while ((m = importRe.exec(src))) {
		checked++;
		const target = path.resolve(dir, m[1]);
		if (!fs.existsSync(target)) {
			errors++;
			const line = src.slice(0, m.index).split("\n").length;
			console.log(`MISSING import: ${path.relative(repo, file)}:${line} -> ${m[1]}`);
		}
	}
}

console.log(`check-imports: files=${files.length} imports=${checked} errors=${errors}`);
if (errors > 0) process.exit(1);
