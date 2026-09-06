// 将新增素材登记进 data/assets.js 素材清单（CI 在检测到推送新增图片/语音后自动调用）
// 用法: node tools/update-manifest.mjs <新增文件...>（相对仓库根，如 assets/audio/dieaudio/角色名.mp3）
// 规则：仅接受 assets/ 下的图片/音频扩展名；已在清单中的跳过；
//       按文件名（不含扩展名）排序插入——中文文件名用拼音序（Intl.Collator zh），
//       ASCII 文件名用字典序；只做插入，不重排既有条目；无变化时不写文件。
import fs from "node:fs";
import path from "node:path";

const repo = process.cwd();
const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp"]);
const AUDIO_EXT = new Set([".mp3", ".wav", ".ogg"]);
const cjkRe = /[\u4e00-\u9fff]/;
const collator = new Intl.Collator("zh");

const files = process.argv.slice(2);
if (files.length === 0) {
	console.error("用法: node tools/update-manifest.mjs <新增文件...>");
	process.exit(1);
}

const manifestPath = path.join(repo, "data", "assets.js");
let text = fs.readFileSync(manifestPath, "utf8");
const bom = text.startsWith("\uFEFF") ? "\uFEFF" : "";
if (bom) text = text.slice(1);
const eol = text.includes("\r\n") ? "\r\n" : "\n";
const lines = text.split("\n");

// 既有条目收集
const entryRe = /^\t"(assets\/[^"]+)",\s*$/;
const existing = new Set();
const entryIdx = [];
lines.forEach((line, i) => {
	const m = line.match(entryRe);
	if (m) {
		entryIdx.push({ i, entry: m[1] });
		existing.add(m[1]);
	}
});
if (entryIdx.length === 0) {
	console.error("data/assets.js 中未解析到任何清单条目，中止");
	process.exit(1);
}

const keyOf = p => path.parse(p).name.toLowerCase();
const isCjk = p => cjkRe.test(path.parse(p).name);
function compare(a, b) {
	const ka = keyOf(a);
	const kb = keyOf(b);
	let c;
	if (cjkRe.test(ka) || cjkRe.test(kb)) {
		c = collator.compare(ka, kb);
	} else {
		c = ka < kb ? -1 : ka > kb ? 1 : 0;
		if (c === 0) c = a < b ? -1 : a > b ? 1 : 0;
	}
	return c === 0 ? (a < b ? -1 : a > b ? 1 : 0) : c;
}

// 稳定合并：既有序不重排，新条目按 key 插到首个更大条目之前
function merge(existingEntries, addEntries) {
	const out = [];
	let i = 0;
	let j = 0;
	while (i < existingEntries.length && j < addEntries.length) {
		if (compare(addEntries[j], existingEntries[i].entry) < 0) {
			out.push({ entry: addEntries[j++], isNew: true });
		} else {
			out.push({ entry: existingEntries[i++].entry, isNew: false });
		}
	}
	while (i < existingEntries.length) out.push({ entry: existingEntries[i++].entry, isNew: false });
	while (j < addEntries.length) out.push({ entry: addEntries[j++], isNew: true });
	return out;
}

// 过滤出有效新增文件
const adds = [];
for (const raw of files) {
	const p = raw.replaceAll("\\", "/");
	const ext = path.extname(p).toLowerCase();
	if (!p.startsWith("assets/") || (!IMAGE_EXT.has(ext) && !AUDIO_EXT.has(ext))) {
		console.log(`跳过（非 assets/ 下图片/语音）: ${p}`);
		continue;
	}
	if (existing.has(p)) {
		console.log(`跳过（已在清单中）: ${p}`);
		continue;
	}
	if (!adds.includes(p)) adds.push(p);
}

if (adds.length === 0) {
	console.log("没有需要登记的新素材，清单保持不变");
	process.exit(0);
}

// 中文段在前、ASCII 段在后，与清单现有布局一致
const firstAscii = entryIdx.findIndex(e => !isCjk(e.entry));
const cjkExisting = firstAscii === -1 ? entryIdx : entryIdx.slice(0, firstAscii);
const asciiExisting = firstAscii === -1 ? [] : entryIdx.slice(firstAscii);
const cjkMerged = merge(cjkExisting, adds.filter(isCjk));
const asciiMerged = merge(asciiExisting, adds.filter(p => !isCjk(p)));
if (firstAscii === -1) {
	console.error("清单缺少 ASCII 段落，布局异常，中止");
	process.exit(1);
}

// 重建文件：头部 + 中文段 + ASCII 段 + 尾部，新行沿用现有缩进与换行风格
const head = lines.slice(0, cjkExisting[0].i);
const tail = lines.slice(asciiExisting[asciiExisting.length - 1].i + 1);
const render = items => items.map(x => `\t"${x.entry}",` + (eol === "\r\n" ? "\r" : ""));
const outLines = [
	...head,
	...render(cjkMerged),
	...render(asciiMerged),
	...tail,
];
const outText = outLines.join("\n");

for (const item of [...cjkMerged, ...asciiMerged]) {
	if (item.isNew) console.log(`已登记: ${item.entry}`);
}

if (outText === text) {
	console.log("清单内容无变化");
	process.exit(0);
}
fs.writeFileSync(manifestPath, bom + outText, "utf8");
console.log(`完成：新增 ${adds.length} 条，清单共 ${cjkMerged.length + asciiMerged.length} 条`);
