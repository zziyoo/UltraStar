// 无尽模式事件/奇物占位图生成器：node tools/gen-event-curio-images.mjs
//
// 用纯 Node（zlib + 手写 PNG 编码）生成 assets/events/*.png（512x512）与 assets/curios/*.png（256x256）。
// 风格参考模拟宇宙的简洁图标：深色星空底 + 大光晕 + 每个条目一个发光几何徽记（4 倍超采样抗锯齿）。
// 正式美术资源到位后直接覆盖同名文件即可，代码不用改；重跑本脚本会把占位图再生成一遍。
//
// 生成后记得把新文件登记进 data/assets.js（node tools/update-manifest.mjs <文件...>）。

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EVENTS_DIR = path.join(root, "assets", "events");
const CURIOS_DIR = path.join(root, "assets", "curios");

// ---------------------------------------------------------------- 极简画布

const hex = text => {
	const n = parseInt(text.slice(1), 16);
	return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => v / 255);
};

class Canvas {
	constructor(size, ss = 4) {
		this.size = size;
		this.ss = ss;
		this.w = size * ss;
		this.data = new Float64Array(this.w * this.w * 4);
	}

	/** coverage = clamp(0.5 - sdf, 0, 1)：sdf 为负在内部，1px 羽化抗锯齿 */
	blend(sdf, color, alpha = 1) {
		const [r, g, b] = color;
		const data = this.data;
		const w = this.w;
		for (let y = 0; y < w; y++) {
			for (let x = 0; x < w; x++) {
				const cov = Math.min(1, Math.max(0, 0.5 - sdf(x + 0.5, y + 0.5))) * alpha;
				if (cov <= 0) {
					continue;
				}
				const i = (y * w + x) * 4;
				data[i] += (r - data[i]) * cov;
				data[i + 1] += (g - data[i + 1]) * cov;
				data[i + 2] += (b - data[i + 2]) * cov;
			}
		}
	}

	/** 全幅径向渐变背景（inner 在圆心，outer 到达半径 r） */
	radial(cx, cy, r, inner, outer) {
		const data = this.data;
		const w = this.w;
		for (let y = 0; y < w; y++) {
			for (let x = 0; x < w; x++) {
				const t = Math.min(1, Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / r);
				const i = (y * w + x) * 4;
				data[i] = inner[0] + (outer[0] - inner[0]) * t;
				data[i + 1] = inner[1] + (outer[1] - inner[1]) * t;
				data[i + 2] = inner[2] + (outer[2] - inner[2]) * t;
			}
		}
	}

	/** 大光晕：中心亮、按平方衰减 */
	glow(cx, cy, r, color, strength = 0.5) {
		const data = this.data;
		const w = this.w;
		const [r0, g0, b0] = color;
		for (let y = 0; y < w; y++) {
			for (let x = 0; x < w; x++) {
				const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / r;
				if (d >= 1) {
					continue;
				}
				const cov = strength * (1 - d) * (1 - d);
				const i = (y * w + x) * 4;
				data[i] += (r0 - data[i]) * cov;
				data[i + 1] += (g0 - data[i + 1]) * cov;
				data[i + 2] += (b0 - data[i + 2]) * cov;
			}
		}
	}

	dot(cx, cy, radius, color, alpha = 1) {
		this.blend((x, y) => Math.hypot(x - cx, y - cy) - radius, color, alpha);
	}

	ring(cx, cy, radius, halfWidth, color, alpha = 1) {
		this.blend((x, y) => Math.abs(Math.hypot(x - cx, y - cy) - radius) - halfWidth, color, alpha);
	}

	roundBox(cx, cy, hw, hh, round, color, alpha = 1) {
		this.blend((x, y) => {
			const dx = Math.abs(x - cx) - hw + round;
			const dy = Math.abs(y - cy) - hh + round;
			const outside = Math.hypot(Math.max(dx, 0), Math.max(dy, 0));
			return outside + Math.min(Math.max(dx, dy), 0) - round;
		}, color, alpha);
	}

	segment(ax, ay, bx, by, halfWidth, color, alpha = 1) {
		this.blend((x, y) => {
			const vx = bx - ax;
			const vy = by - ay;
			const wx = x - ax;
			const wy = y - ay;
			const len2 = vx * vx + vy * vy || 1;
			const t = Math.min(1, Math.max(0, (wx * vx + wy * vy) / len2));
			return Math.hypot(x - (ax + vx * t), y - (ay + vy * t)) - halfWidth;
		}, color, alpha);
	}

	polygon(points, color, alpha = 1) {
		this.blend((x, y) => {
			let inside = false;
			let edge = Infinity;
			for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
				const [xi, yi] = points[i];
				const [xj, yj] = points[j];
				if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
					inside = !inside;
				}
				const t = Math.min(1, Math.max(0, ((x - xi) * (xj - xi) + (y - yi) * (yj - yi)) / ((xj - xi) ** 2 + (yj - yi) ** 2 || 1)));
				edge = Math.min(edge, Math.hypot(x - (xi + (xj - xi) * t), y - (yi + (yj - yi) * t)));
			}
			return inside ? -edge : edge;
		}, color, alpha);
	}

	/** 4 倍超采样盒式降采样 → 8bit RGBA */
	pixels() {
		const out = new Uint8Array(this.size * this.size * 4);
		const k = this.ss * this.ss;
		for (let y = 0; y < this.size; y++) {
			for (let x = 0; x < this.size; x++) {
				let r = 0;
				let g = 0;
				let b = 0;
				for (let sy = 0; sy < this.ss; sy++) {
					for (let sx = 0; sx < this.ss; sx++) {
						const i = ((y * this.ss + sy) * this.w + x * this.ss + sx) * 4;
						r += this.data[i];
						g += this.data[i + 1];
						b += this.data[i + 2];
					}
				}
				const o = (y * this.size + x) * 4;
				out[o] = Math.round(Math.min(255, (r / k) * 255));
				out[o + 1] = Math.round(Math.min(255, (g / k) * 255));
				out[o + 2] = Math.round(Math.min(255, (b / k) * 255));
				out[o + 3] = 255;
			}
		}
		return out;
	}
}

// ---------------------------------------------------------------- PNG 编码（RGBA8，filter 0）

const CRC_TABLE = (() => {
	const table = new Uint32Array(256);
	for (let n = 0; n < 256; n++) {
		let c = n;
		for (let k = 0; k < 8; k++) {
			c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		}
		table[n] = c >>> 0;
	}
	return table;
})();

function crc32(buffer) {
	let c = 0xffffffff;
	for (const byte of buffer) {
		c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
	}
	return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
	const length = Buffer.alloc(4);
	length.writeUInt32BE(data.length);
	const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
	const crc = Buffer.alloc(4);
	crc.writeUInt32BE(crc32(body));
	return Buffer.concat([length, body, crc]);
}

function encodePNG(pixels, size) {
	const ihdr = Buffer.alloc(13);
	ihdr.writeUInt32BE(size, 0);
	ihdr.writeUInt32BE(size, 4);
	ihdr[8] = 8; // bit depth
	ihdr[9] = 6; // RGBA
	const raw = Buffer.alloc((size * 4 + 1) * size);
	for (let y = 0; y < size; y++) {
		raw[y * (size * 4 + 1)] = 0; // filter: none
		pixels.copy ? pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4)
			: raw.set(pixels.subarray(y * size * 4, (y + 1) * size * 4), y * (size * 4 + 1) + 1);
	}
	return Buffer.concat([
		Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
		chunk("IHDR", ihdr),
		chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
		chunk("IEND", Buffer.alloc(0)),
	]);
}

// ---------------------------------------------------------------- 公共底图与图标

/** 确定性伪随机（星星位置固定，重跑不变化） */
function makeRng(seed) {
	let value = seed;
	return () => {
		value = (value * 1103515245 + 12345) % 2147483648;
		return value / 2147483648;
	};
}

/** 深色星空底 + 主色大光晕 + 装饰环 */
function backdrop(canvas, hue, seed) {
	const s = canvas.w;
	const c = s / 2;
	canvas.radial(c, c, s * 0.75, hex("#241a3f"), hex("#08060f"));
	const rng = makeRng(seed);
	for (let i = 0; i < 46; i++) {
		const x = rng() * s;
		const y = rng() * s;
		const r = (0.6 + rng() * 1.4) * canvas.ss;
		canvas.dot(x, y, r, [1, 1, 1], 0.25 + rng() * 0.5);
	}
	canvas.glow(c, c * 0.96, s * 0.42, hue, 0.34);
	canvas.ring(c, c, s * 0.415, canvas.ss * 1.1, hue, 0.5);
	canvas.ring(c, c, s * 0.455, canvas.ss * 0.7, hue, 0.28);
}

const draw = {
	lost_robot(cv, hue) {
		const s = cv.w;
		const c = s / 2;
		cv.roundBox(c, c * 1.06, s * 0.22, s * 0.185, s * 0.06, hue, 0.95);
		cv.roundBox(c, c * 1.06, s * 0.175, s * 0.14, s * 0.045, [0.02, 0.03, 0.06], 0.9);
		cv.dot(c - s * 0.08, c * 1.04, s * 0.032, hue);
		cv.dot(c + s * 0.08, c * 1.04, s * 0.032, hue);
		cv.segment(c, c * 0.82, c, c * 0.7, s * 0.014, hue, 0.9);
		cv.dot(c, c * 0.685, s * 0.026, hue);
		cv.segment(c - s * 0.05, c * 1.15, c + s * 0.05, c * 1.15, s * 0.012, hue, 0.7);
	},
	mystery_merchant(cv, hue) {
		const s = cv.w;
		const c = s / 2;
		cv.polygon([
			[c - s * 0.2, c * 0.82],
			[c + s * 0.2, c * 0.82],
			[c + s * 0.15, c * 1.2],
			[c, c * 1.28],
			[c - s * 0.15, c * 1.2],
		], hue, 0.95);
		cv.polygon([
			[c - s * 0.12, c * 1.0],
			[c - s * 0.03, c * 0.95],
			[c - s * 0.04, c * 1.06],
		], [0.03, 0.02, 0.07], 0.95);
		cv.polygon([
			[c + s * 0.12, c * 1.0],
			[c + s * 0.03, c * 0.95],
			[c + s * 0.04, c * 1.06],
		], [0.03, 0.02, 0.07], 0.95);
		cv.segment(c - s * 0.06, c * 1.18, c + s * 0.06, c * 1.16, s * 0.01, [0.03, 0.02, 0.07], 0.8);
	},
	lucky_coin(cv, hue) {
		const s = cv.w;
		const c = s / 2;
		cv.dot(c, c, s * 0.26, hue, 0.95);
		cv.ring(c, c, s * 0.2, s * 0.016, [0.25, 0.16, 0.02], 0.9);
		const star = angle => [c + Math.cos(angle) * s * 0.13, c + Math.sin(angle) * s * 0.13];
		cv.polygon([star(-Math.PI / 2), star(Math.PI / 4), star((Math.PI * 3) / 4)], hue, 1);
		cv.polygon([star(Math.PI / 2), star((-Math.PI * 3) / 4), star(-Math.PI / 4)], [1, 0.93, 0.6], 0.9);
	},
	unknown_lab(cv, hue) {
		const s = cv.w;
		const c = s / 2;
		cv.polygon([
			[c - s * 0.055, c * 0.72],
			[c + s * 0.055, c * 0.72],
			[c + s * 0.055, c * 0.84],
			[c + s * 0.2, c * 1.22],
			[c - s * 0.2, c * 1.22],
			[c - s * 0.055, c * 0.84],
		], hue, 0.95);
		cv.segment(c - s * 0.11, c * 1.13, c + s * 0.11, c * 1.13, s * 0.02, [0.03, 0.08, 0.04], 0.9);
		cv.dot(c - s * 0.03, c * 1.07, s * 0.024, [0.03, 0.08, 0.04], 0.9);
		cv.dot(c + s * 0.055, c * 1.02, s * 0.017, [0.03, 0.08, 0.04], 0.9);
		cv.roundBox(c - s * 0.085, c * 0.71, s * 0.05, s * 0.014, s * 0.008, hue, 0.9);
	},
	broken_watch(cv, hue) {
		const s = cv.w;
		const c = s / 2;
		cv.dot(c, c * 1.04, s * 0.27, hue, 0.95);
		cv.dot(c, c * 1.04, s * 0.225, [0.04, 0.05, 0.1], 0.95);
		cv.segment(c, c * 1.04, c, c * 0.88, s * 0.014, hue, 0.95);
		cv.segment(c, c * 1.04, c + s * 0.11, c * 1.1, s * 0.012, hue, 0.95);
		cv.roundBox(c, c * 0.74, s * 0.05, s * 0.028, s * 0.012, hue, 0.9);
		cv.segment(c - s * 0.02, c * 1.12, c + s * 0.05, c * 0.92, s * 0.008, [0.02, 0.02, 0.05], 0.95);
	},
	lucky_stone(cv, hue) {
		const s = cv.w;
		const c = s / 2;
		cv.polygon([
			[c, c * 0.72],
			[c + s * 0.2, c * 1.0],
			[c, c * 1.3],
			[c - s * 0.2, c * 1.0],
		], hue, 0.95);
		cv.polygon([
			[c, c * 0.82],
			[c + s * 0.13, c * 1.0],
			[c, c * 1.18],
			[c - s * 0.13, c * 1.0],
		], [0.9, 1, 0.92], 0.5);
		cv.segment(c - s * 0.2, c, c + s * 0.2, c, s * 0.008, [0.05, 0.12, 0.06], 0.8);
		cv.dot(c, c * 0.72, s * 0.03, [1, 1, 1], 0.9);
	},
	breath_belt(cv, hue) {
		const s = cv.w;
		const c = s / 2;
		cv.ring(c, c, s * 0.23, s * 0.05, hue, 0.95);
		cv.roundBox(c, c, s * 0.09, s * 0.13, s * 0.02, hue, 0.9);
		cv.roundBox(c, c, s * 0.05, s * 0.1, s * 0.01, [0.05, 0.02, 0.02], 0.9);
		cv.segment(c - s * 0.23, c, c - s * 0.09, c, s * 0.03, [0.04, 0.02, 0.02], 0.9);
		cv.segment(c + s * 0.09, c, c + s * 0.23, c, s * 0.03, [0.04, 0.02, 0.02], 0.9);
	},
	energy_core(cv, hue) {
		const s = cv.w;
		const c = s / 2;
		const hexPoints = r => Array.from({ length: 6 }, (_, i) => {
			const angle = (Math.PI / 3) * i - Math.PI / 6;
			return [c + Math.cos(angle) * r, c + Math.sin(angle) * r];
		});
		cv.polygon(hexPoints(s * 0.27), hue, 0.95);
		cv.polygon(hexPoints(s * 0.2), [0.03, 0.06, 0.12], 0.9);
		cv.dot(c, c, s * 0.1, hue, 1);
		cv.dot(c, c, s * 0.045, [1, 1, 1], 0.9);
	},
	leftover_rice(cv, hue) {
		const s = cv.w;
		const c = s / 2;
		cv.polygon([
			[c - s * 0.26, c * 0.92],
			[c + s * 0.26, c * 0.92],
			[c + s * 0.18, c * 1.26],
			[c - s * 0.18, c * 1.26],
		], hue, 0.95);
		cv.dot(c, c * 0.88, s * 0.2, [1, 0.98, 0.92], 0.95);
		for (const [dx, dy] of [[-0.09, -0.05], [0.02, -0.09], [0.1, -0.02], [-0.02, 0]]) {
			cv.dot(c + s * dx, c * 0.88 + s * dy, s * 0.045, [1, 0.98, 0.92], 0.9);
		}
		cv.segment(c - s * 0.3, c * 0.92, c + s * 0.3, c * 0.92, s * 0.016, hue, 0.95);
	},
};

// ---------------------------------------------------------------- 生成

const IMAGES = [
	["events", 512, "lost_robot", "#6fd8ff", 11],
	["events", 512, "mystery_merchant", "#b48cff", 23],
	["events", 512, "lucky_coin", "#ffd45e", 37],
	["events", 512, "unknown_lab", "#7dffa8", 41],
	["curios", 256, "broken_watch", "#cfd8ff", 53],
	["curios", 256, "lucky_stone", "#9dffb0", 67],
	["curios", 256, "breath_belt", "#ff8a7a", 71],
	["curios", 256, "energy_core", "#7ab8ff", 83],
	["curios", 256, "leftover_rice", "#ffc98a", 97],
];

for (const [dir, size, name, colorText, seed] of IMAGES) {
	const color = hex(colorText);
	const canvas = new Canvas(size, size > 400 ? 3 : 4);
	backdrop(canvas, color, seed);
	draw[name](canvas, color);
	const png = encodePNG(canvas.pixels(), size);
	const outDir = dir === "events" ? EVENTS_DIR : CURIOS_DIR;
	fs.mkdirSync(outDir, { recursive: true });
	const file = path.join(outDir, `${name}.png`);
	fs.writeFileSync(file, png);
	console.log(`生成 ${path.relative(root, file)}（${size}x${size}，${png.length} 字节）`);
}
