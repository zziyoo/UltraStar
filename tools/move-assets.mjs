// 一次性脚本：assets 素材分类归位（mp3 → audio/，图片 → image/，子目录随类型归位）
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const assets = path.resolve(fileURLToPath(new URL("../assets", import.meta.url)));
const audioDir = path.join(assets, "audio");
const imageDir = path.join(assets, "image");
fs.mkdirSync(audioDir, { recursive: true });
fs.mkdirSync(imageDir, { recursive: true });

const counts = { audio: 0, image: 0 };
let failed = 0;
for (const e of fs.readdirSync(assets, { withFileTypes: true })) {
	if (e.name === "audio" || e.name === "image") continue;
	const src = path.join(assets, e.name);
	if (e.isDirectory()) {
		// camp / tierlist 为图片目录，easteregg 为音频目录
		const dest = e.name === "easteregg" ? path.join(audioDir, e.name) : path.join(imageDir, e.name);
		fs.renameSync(src, dest);
		console.log(`DIR  ${e.name}/ -> assets/${path.relative(assets, dest).split(path.sep).join("/")}/`);
		continue;
	}
	const isAudio = e.name.toLowerCase().endsWith(".mp3");
	const isImage = [".jpg", ".jpeg", ".png", ".gif", ".webp"].includes(path.extname(e.name).toLowerCase());
	if (!isAudio && !isImage) {
		console.log(`SKIP (unknown type): ${e.name}`);
		failed++;
		continue;
	}
	const dest = isAudio ? path.join(audioDir, e.name) : path.join(imageDir, e.name);
	if (fs.existsSync(dest)) {
		console.log(`CONFLICT: ${e.name}`);
		failed++;
		continue;
	}
	fs.renameSync(src, dest);
	counts[isAudio ? "audio" : "image"]++;
}
console.log(`moved: ${counts.audio} audio, ${counts.image} image, failures=${failed}`);
