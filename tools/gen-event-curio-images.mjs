// 无尽模式事件/奇物占位图生成器：node tools/gen-event-curio-images.mjs
//   加 --preview 顺手导出一张「每条目的真实 64px 样子」拼表（tools/preview-sheet.png），
//   奇物卡面上只有 64px，看原图会一路绿灯、进游戏全是糊的，验收只看这张拼表。
//
// 用纯 Node（zlib + 手写 PNG 编码）生成 assets/events/*.png（512x512）与 assets/curios/*.png（256x256）。
// 风格：粗描边徽章/贴纸风 —— 每个条目一套专属对角双色底 + 斜切亮带 + 彩色粒子 + 暗角 + 徽章框，
// 主体为「深色外轮廓 + 左上亮→右下暗的渐变填充 + 明确高光」，缩到 64px（奇物卡实际显示尺寸）仍然抢眼。
// 正式美术资源到位后直接覆盖同名文件即可，代码不用改；重跑本脚本会把占位图再生成一遍。
//
// 生成后记得把新文件登记进 data/assets.js（node tools/update-manifest.mjs <文件...>）。
// 文件名与尺寸不变时清单无需改动。

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EVENTS_DIR = path.join(root, "assets", "events");
const CURIOS_DIR = path.join(root, "assets", "curios");

// ---------------------------------------------------------------- 可调旋钮
//
// 整体变浓变淡只改这里，不必逐个图形动坐标。数值都是「占画面宽度比例」。

const STYLE = {
	ink: 0.019, // 贴纸外轮廓厚度：0.019 → 256px 图上约 5px，缩到 64px 仍留 1px 线
	inkColor: "#08050f", // 外轮廓 / 内凹阴影色
	gradLight: 0.26, // 主体渐变亮端：向白混合的比例（调高会变粉彩、掉饱和）
	gradDark: 0.58, // 主体渐变暗端：向 ink 混合的比例（越大越立体，越大越脏）
	band: 0.1, // 背景斜切亮带强度
	particles: 40, // 背景粒子数量
	sparkles: 3, // 背景四芒闪光星数量
	vignette: 0.7, // 暗角强度
	glow: 0.3, // 背景主色光晕强度
	bgTint: 0.34, // 背景吃主色的比例。过高会让黄变芥末、橙变棕，且同色主体糊进底里
};

// ---------------------------------------------------------------- 极简画布

const hex = text => {
	const n = parseInt(text.slice(1), 16);
	return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => v / 255);
};

const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
/** 图形包围盒：外扩 1px 保住抗锯齿的羽化带，避免被裁成硬边 */
const box = (cx, cy, hw, hh) => [cx - hw - 1, cy - hh - 1, cx + hw + 1, cy + hh + 1];

/** 由条目主色推出整套配色，绘图时写 BODY 即取「亮端→暗端」渐变 */
function palette(hue) {
	const ink = hex(STYLE.inkColor);
	return {
		hue,
		ink,
		hi: mix(hue, [1, 1, 1], STYLE.gradLight),
		lo: mix(hue, ink, STYLE.gradDark),
		deep: mix(hue, ink, 0.78), // 内凹、面板、阴影
		pale: mix(hue, [1, 1, 1], 0.66), // 徽章框亮线、粒子
		warm: mix(hue, [1, 1, 1], 0.88), // 高光、星芒
		bgA: mix(hue, [0.05, 0.04, 0.11], 1 - STYLE.bgTint), // 底图亮角
		bgB: mix(hue, ink, 0.94), // 底图暗角
	};
}

/** 传给绘图原语表示「按本图形的包围盒做主体渐变」 */
const BODY = "body";

class Canvas {
	constructor(size, ss = 4) {
		this.size = size;
		this.ss = ss;
		this.w = size * ss;
		this.data = new Float64Array(this.w * this.w * 4);
		this.rec = null; // 非 null 时原语只记录不落笔，供 inked() 做整体外轮廓
		this.p = palette(hex("#8e8ea8"));
	}

	/**
	 * 唯一的落笔出口。coverage = clamp(0.5 - sdf, 0, 1)：sdf 为负在内部，1px 羽化抗锯齿。
	 * bbox 把遍历限制在图形覆盖的像素上 —— 全画布遍历是这里的性能热点。
	 * color 传 BODY 时按 bbox 做「左上亮 → 右下暗」线性渐变填充（贴纸体的立体感来源）。
	 */
	paint(sdf, color, alpha, bbox) {
		if (this.rec) {
			this.rec.push({ sdf, color, alpha, bbox });
			return;
		}
		const data = this.data;
		const w = this.w;
		let x0 = 0;
		let y0 = 0;
		let x1 = w;
		let y1 = w;
		if (bbox) {
			x0 = Math.max(0, Math.floor(bbox[0]));
			y0 = Math.max(0, Math.floor(bbox[1]));
			x1 = Math.min(w, Math.ceil(bbox[2]));
			y1 = Math.min(w, Math.ceil(bbox[3]));
		}
		const body = color === BODY;
		const hi = body ? this.p.hi : color;
		const dr = body ? this.p.lo[0] - this.p.hi[0] : 0;
		const dg = body ? this.p.lo[1] - this.p.hi[1] : 0;
		const db = body ? this.p.lo[2] - this.p.hi[2] : 0;
		const span = x1 - x0 + (y1 - y0) || 1;
		for (let y = y0; y < y1; y++) {
			for (let x = x0; x < x1; x++) {
				const cov = Math.min(1, Math.max(0, 0.5 - sdf(x + 0.5, y + 0.5))) * alpha;
				if (cov <= 0) {
					continue;
				}
				const t = body ? clamp01((x - x0 + (y - y0)) / span) : 0;
				const i = (y * w + x) * 4;
				data[i] += (hi[0] + dr * t - data[i]) * cov;
				data[i + 1] += (hi[1] + dg * t - data[i + 1]) * cov;
				data[i + 2] += (hi[2] + db * t - data[i + 2]) * cov;
			}
		}
	}

	/** 无包围盒信息时的落笔入口（背景、渐变底之类别用 BODY） */
	blend(sdf, color, alpha = 1) {
		this.paint(sdf, color, alpha, null);
	}

	/**
	 * 贴纸描边：fn 内画的所有图形先整体按外扩 STYLE.ink 落成暗色剪影，再画本体。
	 * 只包结构件；高光和粒子要画在外面，否则高光会带一圈难看的暗晕。
	 * scale < 1 用于内凹件 / 部件分隔线（描边比外轮廓细）。不要嵌套调用：
	 * 内层会在外层落本体之前就画完，直接被外层盖掉。
	 */
	inked(fn, scale = 1) {
		const saved = this.rec;
		const ops = [];
		this.rec = ops;
		fn(this);
		this.rec = saved;
		const t = STYLE.ink * this.w * scale;
		for (const op of ops) {
			const grown = op.bbox && [op.bbox[0] - t, op.bbox[1] - t, op.bbox[2] + t, op.bbox[3] + t];
			this.paint((x, y) => op.sdf(x, y) + t, this.p.ink, 1, grown);
		}
		for (const op of ops) {
			this.paint(op.sdf, op.color, op.alpha, op.bbox);
		}
	}

	/** 全幅线性渐变底：从 (ax,ay) 的 a 到 (bx,by) 的 b */
	linear(ax, ay, bx, by, a, b) {
		const data = this.data;
		const w = this.w;
		const dx = bx - ax;
		const dy = by - ay;
		const inv = 1 / (dx * dx + dy * dy || 1);
		for (let y = 0; y < w; y++) {
			for (let x = 0; x < w; x++) {
				const t = clamp01(((x + 0.5 - ax) * dx + (y + 0.5 - ay) * dy) * inv);
				const i = (y * w + x) * 4;
				data[i] = a[0] + (b[0] - a[0]) * t;
				data[i + 1] = a[1] + (b[1] - a[1]) * t;
				data[i + 2] = a[2] + (b[2] - a[2]) * t;
			}
		}
	}

	/** 暗角：离中心越远压得越暗，把视线收回徽章中央 */
	vignette(strength) {
		const data = this.data;
		const w = this.w;
		const c = w / 2;
		const max = Math.hypot(c, c);
		for (let y = 0; y < w; y++) {
			for (let x = 0; x < w; x++) {
				const d = Math.hypot(x + 0.5 - c, y + 0.5 - c) / max;
				const k = 1 - strength * Math.pow(clamp01((d - 0.4) / 0.6), 2);
				if (k >= 1) {
					continue;
				}
				const i = (y * w + x) * 4;
				data[i] *= k;
				data[i + 1] *= k;
				data[i + 2] *= k;
			}
		}
	}

	/** 大光晕：中心亮、按平方衰减 */
	glow(cx, cy, r, color, strength = 0.5) {
		const data = this.data;
		const w = this.w;
		const [r0, g0, b0] = color;
		const x0 = Math.max(0, Math.floor(cx - r));
		const y0 = Math.max(0, Math.floor(cy - r));
		const x1 = Math.min(w, Math.ceil(cx + r));
		const y1 = Math.min(w, Math.ceil(cy + r));
		for (let y = y0; y < y1; y++) {
			for (let x = x0; x < x1; x++) {
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
		this.paint((x, y) => Math.hypot(x - cx, y - cy) - radius, color, alpha,
			box(cx, cy, radius, radius));
	}

	/** 椭圆（rx 横向半径、ry 纵向半径）：兜帽开口、面具这类需要「圆脸」的场合 */
	ellipse(cx, cy, rx, ry, color, alpha = 1) {
		this.paint((x, y) => {
			const dx = (x - cx) / Math.max(rx, 1e-6);
			const dy = (y - cy) / Math.max(ry, 1e-6);
			return (Math.hypot(dx, dy) - 1) * Math.min(rx, ry);
		}, color, alpha, box(cx, cy, rx, ry));
	}

	ring(cx, cy, radius, halfWidth, color, alpha = 1) {
		const r = radius + halfWidth;
		this.paint((x, y) => Math.abs(Math.hypot(x - cx, y - cy) - radius) - halfWidth, color, alpha,
			box(cx, cy, r, r));
	}

	roundBox(cx, cy, hw, hh, round, color, alpha = 1) {
		this.paint((x, y) => {
			const dx = Math.abs(x - cx) - hw + round;
			const dy = Math.abs(y - cy) - hh + round;
			const outside = Math.hypot(Math.max(dx, 0), Math.max(dy, 0));
			return outside + Math.min(Math.max(dx, dy), 0) - round;
		}, color, alpha, box(cx, cy, hw, hh));
	}

	segment(ax, ay, bx, by, halfWidth, color, alpha = 1) {
		this.paint((x, y) => {
			const vx = bx - ax;
			const vy = by - ay;
			const wx = x - ax;
			const wy = y - ay;
			const len2 = vx * vx + vy * vy || 1;
			const t = Math.min(1, Math.max(0, (wx * vx + wy * vy) / len2));
			return Math.hypot(x - (ax + vx * t), y - (ay + vy * t)) - halfWidth;
		}, color, alpha, [
			Math.min(ax, bx) - halfWidth - 1, Math.min(ay, by) - halfWidth - 1,
			Math.max(ax, bx) + halfWidth + 1, Math.max(ay, by) + halfWidth + 1,
		]);
	}

	polygon(points, color, alpha = 1) {
		let x0 = Infinity;
		let y0 = Infinity;
		let x1 = -Infinity;
		let y1 = -Infinity;
		for (const [px, py] of points) {
			x0 = Math.min(x0, px);
			y0 = Math.min(y0, py);
			x1 = Math.max(x1, px);
			y1 = Math.max(y1, py);
		}
		this.paint((x, y) => {
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
		}, color, alpha, [x0 - 1, y0 - 1, x1 + 1, y1 + 1]);
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

/**
 * 徽章底：对角双色渐变 + 主色光晕 + 斜切亮带 + 彩色粒子 + 四芒星 + 暗角 + 徽章框。
 * 每个条目吃自己的主色，12 张图不再共用同一个深紫底。
 */
function backdrop(canvas, hue, seed) {
	const s = canvas.w;
	const c = s / 2;
	const P = canvas.p;
	canvas.linear(0, 0, s, s, P.bgA, P.bgB);
	// 光源偏左上：光晕、渐变、高光三处方向必须一致，否则立体感互相打架
	canvas.glow(c * 0.88, c * 0.78, s * 0.54, hue, STYLE.glow);

	// 斜切亮带：沿 45° 扫过画面，给纯渐变底一个方向
	const R = Math.SQRT1_2;
	const band = (off, half, color, alpha) => {
		const ox = c + R * off;
		const oy = c + R * off;
		const L = s * 1.5;
		canvas.polygon(
			[[-L, -half], [L, -half], [L, half], [-L, half]].map(([u, v]) => [ox + R * (u + v), oy + R * (v - u)]),
			color, alpha);
	};
	band(-s * 0.17, s * 0.12, P.pale, STYLE.band * 0.45);
	band(s * 0.21, s * 0.03, P.warm, STYLE.band);

	const rng = makeRng(seed);
	// 粒子：数量比旧版多但都小，配合暗角收成「星尘」而不是噪点
	for (let i = 0; i < STYLE.particles; i++) {
		const x = rng() * s;
		const y = rng() * s;
		const r = (0.45 + rng() * 1.7) * canvas.ss;
		canvas.dot(x, y, r, rng() < 0.5 ? P.pale : [1, 1, 1], 0.18 + rng() * 0.5);
	}
	// 四芒闪光星：十字细条 + 亮心，比一片白点更像「发光」
	for (let i = 0; i < STYLE.sparkles; i++) {
		const x = s * (0.1 + rng() * 0.8);
		const y = s * (0.08 + rng() * 0.34);
		const L = s * (0.018 + rng() * 0.02);
		canvas.segment(x - L, y, x + L, y, s * 0.0045, P.warm, 0.85);
		canvas.segment(x, y - L, x, y + L, s * 0.0045, P.warm, 0.85);
		canvas.dot(x, y, s * 0.0085, [1, 1, 1], 1);
	}
	canvas.vignette(STYLE.vignette);

	// 徽章框：深色底槽 + 亮线 + 外细环。用明度而不是同色同亮和主体区分，避免框和主体糊成一块
	canvas.ring(c, c, s * 0.44, canvas.ss * 2.6, P.deep, 0.85);
	canvas.ring(c, c, s * 0.44, canvas.ss * 1.2, P.pale, 0.6);
	canvas.ring(c, c, s * 0.478, canvas.ss * 0.8, hue, 0.4);
}

/**
 * 一缕上升的气流 / 热气：沿正弦采样成平滑细线，越往上越细越淡。
 * 旧版用三段直线拼，缩到 64px 看着像字母而不像气。
 */
function wisp(cv, x0, bottom, top, amp, width, color) {
	const s = cv.w;
	const c = s / 2;
	for (let i = 0; i <= 24; i++) {
		const t = i / 24;
		// x 的偏移量按整幅宽度算（和 wisp 调用方一致），y 按半径 c 算 —— 两者单位不同，别混
		cv.dot(c + s * (x0 + Math.sin(t * Math.PI * 1.5) * amp), c * (bottom - (bottom - top) * t),
			s * width * (1 - t * 0.5), color, 0.85 * (1 - t * 0.72));
	}
}

const draw = {
	lost_robot(cv, hue) {
		const s = cv.w;
		const c = s / 2;
		const P = cv.p;
		// 手臂改成「肩关节 + 上臂」两段并接在躯干上。旧版是两块悬空胶囊，读不出手臂。
		cv.inked(() => {
			cv.roundBox(c - s * 0.26, c * 1.04, s * 0.052, s * 0.052, s * 0.024, BODY);
			cv.roundBox(c - s * 0.262, c * 1.25, s * 0.044, s * 0.14, s * 0.022, BODY);
			cv.roundBox(c + s * 0.26, c * 1.02, s * 0.052, s * 0.052, s * 0.024, BODY);
			cv.roundBox(c + s * 0.252, c * 0.86, s * 0.044, s * 0.13, s * 0.022, BODY);
			cv.roundBox(c - s * 0.12, c * 1.42, s * 0.062, s * 0.13, s * 0.025, BODY);
			cv.roundBox(c + s * 0.12, c * 1.42, s * 0.062, s * 0.13, s * 0.025, BODY);
			cv.roundBox(c, c * 1.18, s * 0.24, s * 0.16, s * 0.05, BODY);
			cv.roundBox(c, c * 0.87, s * 0.2, s * 0.145, s * 0.05, BODY);
			cv.segment(c - s * 0.09, c * 0.78, c - s * 0.12, c * 0.68, s * 0.013, BODY);
			cv.dot(c - s * 0.12, c * 0.665, s * 0.026, BODY);
			cv.segment(c + s * 0.09, c * 0.78, c + s * 0.12, c * 0.68, s * 0.013, BODY);
			cv.dot(c + s * 0.12, c * 0.665, s * 0.026, BODY);
		});
		// 面罩与胸板：内凹件，描边比外轮廓细，当作部件分隔线
		cv.inked(() => cv.roundBox(c, c * 0.88, s * 0.155, s * 0.1, s * 0.038, P.deep, 0.97), 0.5);
		cv.inked(() => cv.roundBox(c, c * 1.18, s * 0.15, s * 0.085, s * 0.03, P.deep, 0.97), 0.5);
		cv.dot(c - s * 0.07, c * 0.85, s * 0.034, P.warm, 1);
		cv.dot(c + s * 0.07, c * 0.85, s * 0.034, P.warm, 1);
		cv.roundBox(c, c * 0.952, s * 0.066, s * 0.011, s * 0.006, P.warm, 0.85);
		// 胸口能源核心
		cv.dot(c, c * 1.18, s * 0.058, P.warm, 1);
		cv.dot(c, c * 1.18, s * 0.026, [1, 1, 1], 1);
		cv.dot(c - s * 0.115, c * 0.79, s * 0.03, [1, 1, 1], 0.5);
		// 断口火花：抬起的右臂末端几点，表示「还在勉强运行」
		for (let i = 0; i < 5; i++) {
			cv.dot(c + s * (0.28 + (i % 3) * 0.035), c * (0.72 - i * 0.03), s * 0.014, [1, 0.9, 0.4], 0.9);
		}
	},
	mystery_merchant(cv, hue) {
		const s = cv.w;
		const c = s / 2;
		const P = cv.p;
		// 摊子立在商人后面：横板 + 两侧立柱，颜色压到主色的暗调，不再抢主体
		cv.inked(() => {
			cv.roundBox(c, c * 1.3, s * 0.34, s * 0.028, s * 0.012, mix(hue, P.ink, 0.5));
			cv.roundBox(c - s * 0.32, c * 1.12, s * 0.022, s * 0.2, s * 0.01, mix(hue, P.ink, 0.58));
			cv.roundBox(c + s * 0.32, c * 1.12, s * 0.022, s * 0.2, s * 0.01, mix(hue, P.ink, 0.58));
		});
		// 摊上三件怪货：各用一种互补色，比全用主色更像「杂货摊」
		cv.inked(() => cv.dot(c - s * 0.2, c * 1.22, s * 0.05, [0.45, 0.85, 0.9]), 0.55);
		cv.inked(() => cv.roundBox(c - s * 0.03, c * 1.24, s * 0.045, s * 0.035, s * 0.012, [0.98, 0.8, 0.4]), 0.55);
		cv.inked(() => cv.polygon([
			[c + s * 0.14, c * 1.28],
			[c + s * 0.24, c * 1.28],
			[c + s * 0.19, c * 1.17],
		], [0.78, 0.52, 0.95]), 0.55);
		// 商人：斗篷 + 兜帽尖。脸改成「兜帽里的黑洞 + 两只发光窄眼」——
		// 旧版那块大白蛋在紫斗篷上读成幽灵，不像摊主
		cv.inked(() => {
			cv.polygon([
				[c - s * 0.15, c * 1.06],
				[c + s * 0.15, c * 1.06],
				[c + s * 0.2, c * 0.62],
				[c, c * 0.52],
				[c - s * 0.2, c * 0.62],
			], BODY);
			cv.polygon([
				[c - s * 0.11, c * 0.54],
				[c + s * 0.11, c * 0.54],
				[c, c * 0.42],
			], BODY);
		});
		cv.inked(() => cv.ellipse(c, c * 0.68, s * 0.1, s * 0.11, P.ink, 0.98), 0.45);
		cv.segment(c - s * 0.052, c * 0.655, c - s * 0.016, c * 0.685, s * 0.012, P.warm, 1);
		cv.segment(c + s * 0.052, c * 0.655, c + s * 0.016, c * 0.685, s * 0.012, P.warm, 1);
		// 摊主的手：起点落在斗篷内部。旧版从轮廓外起笔，看着像一根悬空胶囊
		cv.inked(() => {
			cv.segment(c + s * 0.09, c * 0.96, c + s * 0.255, c * 1.11, s * 0.022, BODY);
			cv.dot(c + s * 0.27, c * 1.125, s * 0.032, BODY);
		}, 0.6);
	},
	lucky_coin(cv, hue) {
		const s = cv.w;
		const c = s / 2;
		const P = cv.p;
		// 币体：外轮廓 + 整体渐变，缩到 64px 时靠轮廓保住「圆币」的形
		cv.inked(() => cv.dot(c, c, s * 0.31, BODY));
		for (let i = 0; i < 18; i++) {
			const a = (Math.PI * 2 * i) / 18;
			cv.dot(c + Math.cos(a) * s * 0.295, c + Math.sin(a) * s * 0.295, s * 0.014, P.warm, 0.75);
		}
		// 币面：向暗端压出凹陷，再描一圈亮线
		cv.dot(c, c, s * 0.255, mix(hue, P.ink, 0.6), 1);
		cv.ring(c, c, s * 0.225, s * 0.012, P.pale, 0.75);
		// 中央四芒星：8 顶点（四尖 + 四腰）。旧版两个多边形顶点集相同，第二个纯盖掉第一个
		const tip = (angle, len) => [c + Math.cos(angle) * s * len, c + Math.sin(angle) * s * len];
		const points = [];
		for (let i = 0; i < 8; i++) {
			points.push(tip((Math.PI / 4) * i - Math.PI / 2, i % 2 ? 0.075 : 0.205));
		}
		cv.inked(() => cv.polygon(points, P.warm), 0.4);
		cv.dot(c, c, s * 0.032, [1, 1, 1], 1);
		// 左上高光
		cv.dot(c - s * 0.15, c - s * 0.16, s * 0.038, [1, 1, 1], 0.5);
	},
	wishing_pool(cv, hue) {
		const s = cv.w;
		const c = s / 2;
		const P = cv.p;
		const water = mix(hue, P.ink, 0.66);
		// 许愿人先画、池子后画：下半身被池沿挡住才读得出「跪在池边」。
		// 旧版画成正视同心圆 + 池子中间一个举手的黑块，缩到 200px 像靶子也像虫子
		cv.inked(() => {
			cv.ellipse(c, c * 0.58, s * 0.048, s * 0.055, P.ink, 0.98);
			cv.polygon([
				[c - s * 0.075, c * 1.02],
				[c + s * 0.075, c * 1.02],
				[c + s * 0.05, c * 0.7],
				[c - s * 0.05, c * 0.7],
			], P.ink, 0.98);
			cv.segment(c - s * 0.045, c * 0.76, c - s * 0.085, c * 0.58, s * 0.015, P.ink, 0.98);
			cv.segment(c + s * 0.045, c * 0.76, c + s * 0.085, c * 0.58, s * 0.015, P.ink, 0.98);
		}, 0.4);
		// 池体：斜俯视的扁椭圆，露出前侧一圈池壁
		cv.inked(() => cv.ellipse(c, c * 1.14, s * 0.33, s * 0.2, BODY));
		// 水面：内缩一档并压暗，做出凹陷
		cv.ellipse(c, c * 1.08, s * 0.27, s * 0.148, water, 1);
		// 波纹：扁椭圆环（画一个亮环再挖掉中心），不再用正圆环
		for (const [rx, ry, a] of [[0.205, 0.11, 0.45], [0.125, 0.065, 0.32]]) {
			cv.ellipse(c, c * 1.08, s * rx, s * ry, P.warm, a);
			cv.ellipse(c, c * 1.08, s * (rx - 0.014), s * (ry - 0.009), water, 1);
		}
		// 沉在池底的金币
		for (const [dx, dy] of [[-0.14, 1.1], [0.13, 1.05], [0.01, 1.16]]) {
			cv.dot(c + s * dx, c * dy, s * 0.036, [1, 0.82, 0.32], 1);
			cv.dot(c + s * dx, c * dy, s * 0.017, [1, 0.96, 0.72], 1);
		}
		// 愿望升上去的那颗星：偏到左上，画在头顶上会和剪影撞成一顶帽子
		const sx = c - s * 0.16;
		const sy = c * 0.34;
		cv.dot(sx, sy, s * 0.022, [1, 1, 1], 1);
		cv.segment(sx - s * 0.05, sy, sx + s * 0.05, sy, s * 0.006, P.warm, 0.9);
		cv.segment(sx, sy - s * 0.05, sx, sy + s * 0.05, s * 0.006, P.warm, 0.9);
	},
	loop_button(cv, hue) {
		const s = cv.w;
		const c = s / 2;
		const P = cv.p;
		// 按钮：粗外环 + 内凹盘一起描边，得到完整徽章剪影
		cv.inked(() => {
			cv.ring(c, c, s * 0.33, s * 0.055, BODY);
			cv.dot(c, c, s * 0.275, mix(hue, P.ink, 0.78));
		});
		cv.ring(c, c, s * 0.275, s * 0.014, P.pale, 0.6);
		// 循环箭头：两段粗圆弧 + 两个实心三角箭头，缺口在右上与左下
		const R = s * 0.2;
		const arc = (from, to) => {
			const steps = 34;
			for (let i = 0; i <= steps; i++) {
				const a = from + ((to - from) * i) / steps;
				cv.dot(c + Math.cos(a) * R, c + Math.sin(a) * R, s * 0.028, P.warm, 1);
			}
		};
		const head = angle => {
			const x = c + Math.cos(angle) * R;
			const y = c + Math.sin(angle) * R;
			const t = angle + Math.PI / 2;
			cv.polygon([
				[x + Math.cos(angle) * s * 0.05, y + Math.sin(angle) * s * 0.05],
				[x + Math.cos(t + 2.3) * s * 0.085, y + Math.sin(t + 2.3) * s * 0.085],
				[x + Math.cos(t - 2.3) * s * 0.085, y + Math.sin(t - 2.3) * s * 0.085],
			], P.warm, 1);
		};
		arc(Math.PI * 0.32, Math.PI * 1.32);
		head(Math.PI * 1.32);
		arc(Math.PI * 1.32, Math.PI * 0.32 + Math.PI * 2);
		head(Math.PI * 2.32);
		// 中心闪电：明确表达「电力 / 能量」
		cv.inked(() => cv.polygon([
			[c + s * 0.03, c - s * 0.1],
			[c - s * 0.06, c + s * 0.015],
			[c - s * 0.005, c + s * 0.015],
			[c - s * 0.035, c + s * 0.11],
			[c + s * 0.065, c - s * 0.02],
			[c + s * 0.005, c - s * 0.02],
		], [1, 0.92, 0.35]), 0.35);
		cv.dot(c - s * 0.16, c - s * 0.19, s * 0.038, [1, 1, 1], 0.5);
	},
	unknown_lab(cv, hue) {
		const s = cv.w;
		const c = s / 2;
		const P = cv.p;
		// 三只烧瓶：玻璃半透明 + 高饱和液体，细描边保住瓶子的轮廓
		const flask = (x, scale, liquid) => {
			cv.inked(() => {
				cv.polygon([
					[c + s * x - s * 0.02 * scale, c * (0.68 - 0.06 * scale)],
					[c + s * x + s * 0.02 * scale, c * (0.68 - 0.06 * scale)],
					[c + s * x + s * 0.09 * scale, c * (0.95 + 0.16 * scale)],
					[c + s * x - s * 0.09 * scale, c * (0.95 + 0.16 * scale)],
				], [0.86, 0.94, 1], 0.4);
				cv.polygon([
					[c + s * x - s * 0.072 * scale, c * (0.9 + 0.05 * scale)],
					[c + s * x + s * 0.072 * scale, c * (0.9 + 0.05 * scale)],
					[c + s * x + s * 0.09 * scale, c * (0.95 + 0.16 * scale)],
					[c + s * x - s * 0.09 * scale, c * (0.95 + 0.16 * scale)],
				], liquid);
			}, 0.45);
			cv.roundBox(c + s * x, c * (0.68 - 0.06 * scale), s * 0.024 * scale, s * 0.012 * scale, s * 0.005, [1, 1, 1], 0.6);
		};
		flask(-0.19, 0.72, [0.35, 0.9, 0.5]);
		flask(0, 1, [0.45, 1, 0.4]);
		flask(0.19, 0.8, [0.92, 0.95, 0.35]);
		// 气泡：瓶里上浮的小点
		cv.dot(c - s * 0.19, c * 0.98, s * 0.016, [1, 1, 1], 0.7);
		cv.dot(c, c * 0.92, s * 0.02, [1, 1, 1], 0.75);
		cv.dot(c + s * 0.19, c * 1.0, s * 0.014, [1, 1, 1], 0.7);
		// 架子
		cv.inked(() => cv.roundBox(c, c * 1.18, s * 0.33, s * 0.022, s * 0.01, mix(hue, P.ink, 0.45)), 0.5);
		// 实验者：头缩小并补上肩膀才读成「一个人」，旧版那颗大蛋加两条黑眼像虫子
		cv.inked(() => {
			cv.polygon([
				[c - s * 0.17, c * 1.78],
				[c + s * 0.17, c * 1.78],
				[c + s * 0.1, c * 1.6],
				[c - s * 0.1, c * 1.6],
			], BODY);
			cv.ellipse(c, c * 1.43, s * 0.09, s * 0.1, BODY);
		}, 0.6);
		cv.inked(() => cv.roundBox(c, c * 1.4, s * 0.075, s * 0.026, s * 0.011, P.ink, 0.96), 0.3);
		cv.dot(c - s * 0.036, c * 1.4, s * 0.016, P.warm, 1);
		cv.dot(c + s * 0.036, c * 1.4, s * 0.016, P.warm, 1);
		cv.inked(() => cv.roundBox(c, c * 1.52, s * 0.068, s * 0.03, s * 0.012, P.deep, 0.96), 0.3);
	},
	broken_watch(cv, hue) {
		const s = cv.w;
		const c = s / 2;
		const P = cv.p;
		// 表冠 + 挂环 + 表壳一起描边，先立起「怀表」剪影
		cv.inked(() => {
			cv.roundBox(c, c * 0.72, s * 0.045, s * 0.03, s * 0.012, BODY);
			cv.ring(c, c * 1.36, s * 0.045, s * 0.014, BODY);
			cv.dot(c, c * 1.06, s * 0.3, BODY);
		});
		// 盘面压暗做内凹，再描一圈亮线
		cv.dot(c, c * 1.06, s * 0.255, mix(hue, P.ink, 0.8), 1);
		cv.ring(c, c * 1.06, s * 0.2, s * 0.012, P.pale, 0.5);
		// 刻度：12 点、3 点、6 点、9 点
		for (const [dx, dy] of [[0, -0.185], [0.185, 0], [0, 0.185], [-0.185, 0]]) {
			cv.segment(c + s * dx, c * 1.06 + s * dy, c + s * dx * 0.78, c * 1.06 + s * dy * 0.78, s * 0.011, P.warm, 0.85);
		}
		// 指针：时针指向 10 点、分针指向 2 点（经典的「破损停摆」姿态）
		cv.segment(c, c * 1.06, c - s * 0.1, c * 0.95, s * 0.016, [1, 1, 1], 0.98);
		cv.segment(c, c * 1.06, c + s * 0.12, c * 1.15, s * 0.012, P.warm, 0.98);
		cv.dot(c, c * 1.06, s * 0.028, P.warm, 1);
		// 裂痕：贯穿盘面的折线
		for (const [ax, ay, bx, by, w] of [
			[-0.19, 1.0, -0.05, 1.09, 0.011],
			[-0.05, 1.09, 0.03, 1.18, 0.011],
			[0.16, 1.13, 0.08, 1.02, 0.009],
		]) {
			cv.segment(c + s * ax, c * ay, c + s * bx, c * by, s * w, P.ink, 0.95);
		}
		// 表壳外沿崩掉一块：直接用描边色盖掉，暗示「破损」
		cv.dot(c + s * 0.23, c * 0.86, s * 0.05, P.ink, 0.92);
	},
	lucky_stone(cv, hue) {
		const s = cv.w;
		const c = s / 2;
		const P = cv.p;
		// 不规则石块：七个顶点打乱对称，看起来像天然石头而不是菱形宝石。
		// 整体尺寸按 64px 缩略图定 —— 石形一旦小于画面一半就整个丢掉
		const stone = [
			[c, c * 0.6],
			[c + s * 0.24, c * 0.8],
			[c + s * 0.285, c * 1.13],
			[c + s * 0.115, c * 1.38],
			[c - s * 0.135, c * 1.36],
			[c - s * 0.285, c * 1.09],
			[c - s * 0.22, c * 0.78],
		];
		cv.inked(() => cv.polygon(stone, BODY));
		// 受光面：左上内缩多边形，做出切面的体积感
		cv.polygon([
			[c, c * 0.72],
			[c + s * 0.17, c * 0.88],
			[c + s * 0.11, c * 1.15],
			[c - s * 0.09, c * 1.22],
			[c - s * 0.19, c * 1.04],
			[c - s * 0.15, c * 0.84],
		], P.warm, 0.28);
		// 四叶草：改成亮色叶瓣并放大。深绿四叶压在绿石面上，缩到 64px 只剩一团暗斑
		const leaf = (dx, dy) => cv.dot(c + s * dx, c * 1.02 + s * dy, s * 0.086, P.warm);
		cv.inked(() => {
			leaf(-0.09, -0.09);
			leaf(0.09, -0.09);
			leaf(-0.09, 0.09);
			leaf(0.09, 0.09);
			cv.segment(c, c * 1.09, c, c * 1.3, s * 0.016, P.warm);
		}, 0.45);
		cv.dot(c, c * 1.02, s * 0.026, mix(P.warm, P.ink, 0.5), 1);
		// 左上高光
		cv.dot(c - s * 0.14, c * 0.76, s * 0.05, [1, 1, 1], 0.5);
	},
	breath_belt(cv, hue) {
		const s = cv.w;
		const c = s / 2;
		const P = cv.p;
		// 带身改成横放的腰带 + 右侧下垂的带尾，尺寸按 64px 缩略图定：
		// 旧版那圈圆环和能量环类奇物撞形，带身一细下来又被气流抢戏
		cv.inked(() => {
			cv.roundBox(c, c * 1.14, s * 0.32, s * 0.11, s * 0.03, BODY);
			cv.roundBox(c + s * 0.21, c * 1.4, s * 0.062, s * 0.18, s * 0.02, BODY);
		});
		// 带孔：带尾一列
		for (let i = 0; i < 3; i++) {
			cv.dot(c + s * 0.21, c * (1.3 + i * 0.09), s * 0.017, P.ink, 0.92);
		}
		// 缝线：带身上下各一排短段
		for (let i = 0; i < 7; i++) {
			const x = c - s * 0.26 + i * s * 0.088;
			cv.roundBox(x, c * 1.0, s * 0.026, s * 0.006, s * 0.003, P.warm, 0.5);
			cv.roundBox(x, c * 1.28, s * 0.026, s * 0.006, s * 0.003, P.warm, 0.32);
		}
		// 带扣：金色外框 + 深色内框 + 一根扣舌
		cv.inked(() => cv.roundBox(c - s * 0.08, c * 1.14, s * 0.105, s * 0.145, s * 0.028, [1, 0.87, 0.45]));
		cv.roundBox(c - s * 0.08, c * 1.14, s * 0.062, s * 0.1, s * 0.018, mix(hue, P.ink, 0.72), 1);
		cv.segment(c - s * 0.08, c * 0.98, c - s * 0.08, c * 1.3, s * 0.013, [1, 0.95, 0.68], 0.95);
		// 气息：两缕就够，画多了会把带子挤成背景
		for (const [x0, amp] of [[-0.02, 0.028], [0.17, -0.03]]) {
			wisp(cv, x0, 0.86, 0.34, amp, 0.012, [1, 0.97, 0.92]);
		}
	},
	energy_core(cv, hue) {
		const s = cv.w;
		const c = s / 2;
		const P = cv.p;
		// 外层六边形护壳
		const hexPoints = r => Array.from({ length: 6 }, (_, i) => {
			const angle = (Math.PI / 3) * i - Math.PI / 6;
			return [c + Math.cos(angle) * r, c + Math.sin(angle) * r];
		});
		cv.inked(() => cv.polygon(hexPoints(s * 0.32), BODY));
		cv.polygon(hexPoints(s * 0.255), mix(hue, P.ink, 0.82), 1);
		// 内环：能量被约束在环里
		cv.ring(c, c, s * 0.2, s * 0.022, hue, 0.95);
		// 核心：亮核 + 白心
		cv.dot(c, c, s * 0.125, P.warm, 1);
		cv.dot(c, c, s * 0.06, [1, 1, 1], 1);
		// 等离子弧：四条从核心射向护壳的电弧
		for (let i = 0; i < 4; i++) {
			const a = (Math.PI / 2) * i + Math.PI / 4;
			cv.segment(c + Math.cos(a) * s * 0.09, c + Math.sin(a) * s * 0.09, c + Math.cos(a) * s * 0.19, c + Math.sin(a) * s * 0.19, s * 0.014, P.warm, 0.9);
		}
		// 护壳上的六颗铆钉
		for (let i = 0; i < 6; i++) {
			const a = (Math.PI / 3) * i;
			cv.dot(c + Math.cos(a) * s * 0.288, c + Math.sin(a) * s * 0.288, s * 0.018, [1, 1, 1], 0.85);
		}
		// 左上高光
		cv.dot(c - s * 0.13, c - s * 0.15, s * 0.035, [1, 1, 1], 0.5);
	},
	leftover_rice(cv, hue) {
		const s = cv.w;
		const c = s / 2;
		const P = cv.p;
		// 碗：碗身 + 碗沿 + 底座一起描边，读作一件器物而不是三个色块
		cv.inked(() => {
			cv.polygon([
				[c - s * 0.27, c * 0.94],
				[c + s * 0.27, c * 0.94],
				[c + s * 0.19, c * 1.24],
				[c - s * 0.19, c * 1.24],
			], BODY);
			cv.roundBox(c, c * 1.26, s * 0.115, s * 0.028, s * 0.014, BODY);
			cv.roundBox(c, c * 0.93, s * 0.285, s * 0.028, s * 0.014, BODY);
		});
		// 碗口内阴影：让碗口看起来是凹的
		cv.roundBox(c, c * 0.945, s * 0.235, s * 0.016, s * 0.008, P.ink, 0.7);
		// 米饭：堆成一座小丘，底下压在碗沿上
		cv.inked(() => cv.polygon([
			[c - s * 0.215, c * 0.945],
			[c + s * 0.215, c * 0.945],
			[c + s * 0.1, c * 0.84],
			[c - s * 0.02, c * 0.79],
			[c - s * 0.13, c * 0.85],
		], [1, 0.97, 0.9]), 0.4);
		// 米粒纹理：几颗更亮的点，暗示是一粒粒米而不是一块白饼
		for (const [dx, dy, r] of [[-0.12, 0.9, 0.026], [-0.02, 0.86, 0.022], [0.08, 0.885, 0.024], [0.15, 0.915, 0.02], [0.03, 0.925, 0.02]]) {
			cv.dot(c + s * dx, c * dy, s * r, [1, 1, 1], 0.85);
		}
		// 筷子：斜搭在碗沿上，指向右上
		cv.inked(() => {
			cv.segment(c + s * 0.04, c * 0.9, c + s * 0.26, c * 0.66, s * 0.016, [0.62, 0.38, 0.16]);
			cv.segment(c + s * 0.09, c * 0.925, c + s * 0.3, c * 0.7, s * 0.014, [0.46, 0.27, 0.1]);
		}, 0.4);
		// 热气：三缕平滑摆动的上升气流。旧版的三段折线在 64px 上读成「SSS」字母
		for (const [x0, amp] of [[-0.15, 0.05], [-0.02, -0.055], [0.11, 0.05]]) {
			wisp(cv, x0, 0.78, 0.5, amp, 0.011, [1, 0.96, 0.88]);
		}
	},
	cursed_coin(cv, hue) {
		const s = cv.w;
		const c = s / 2;
		const P = cv.p;
		// 尖刺和币体同批描边：炸开的棱角与圆币连成一个剪影，才读得出「诅咒之物」
		cv.inked(() => {
			for (let i = 0; i < 8; i++) {
				const a = (Math.PI * 2 * i) / 8 + Math.PI / 8;
				cv.segment(
					c + Math.cos(a) * s * 0.3,
					c + Math.sin(a) * s * 0.3,
					c + Math.cos(a) * s * 0.4,
					c + Math.sin(a) * s * 0.4,
					s * 0.016,
					BODY
				);
			}
			cv.dot(c, c, s * 0.29, BODY);
		});
		// 币面：暗盘 + 一圈齿纹
		cv.dot(c, c, s * 0.245, mix(hue, P.ink, 0.72), 1);
		for (let i = 0; i < 16; i++) {
			const a = (Math.PI * 2 * i) / 16;
			cv.dot(c + Math.cos(a) * s * 0.268, c + Math.sin(a) * s * 0.268, s * 0.013, [1, 0.55, 0.45], 0.6);
		}
		// 鬼面：亮脸盘 + 深色五官（反过来画才看得清，深脸配深眼在小图上糊成一团）
		cv.inked(() => cv.dot(c, c, s * 0.2, mix(hue, [1, 1, 1], 0.34)), 0.4);
		cv.inked(() => {
			cv.ellipse(c - s * 0.075, c * 0.95, s * 0.05, s * 0.062, P.ink, 0.96);
			cv.ellipse(c + s * 0.075, c * 0.95, s * 0.05, s * 0.062, P.ink, 0.96);
		}, 0.3);
		cv.dot(c - s * 0.075, c * 0.945, s * 0.024, [1, 0.85, 0.2], 1);
		cv.dot(c + s * 0.075, c * 0.945, s * 0.024, [1, 0.85, 0.2], 1);
		// 嘴：上下各一排锯齿，读作「鬼脸」而不是一个洞
		cv.inked(() => {
			for (let i = -2; i <= 2; i++) {
				cv.polygon([
					[c + s * (i * 0.042 - 0.02), c * 1.09],
					[c + s * (i * 0.042 + 0.02), c * 1.09],
					[c + s * i * 0.042, c * 1.15],
				], P.ink, 0.96);
			}
			cv.roundBox(c, c * 1.1, s * 0.105, s * 0.02, s * 0.008, P.ink, 0.92);
		}, 0.3);
		// 左上高光
		cv.dot(c - s * 0.15, c * 0.82, s * 0.04, [1, 0.8, 0.8], 0.4);
	},
	// ---------------------------------------------------------------- 本轮新增：七个事件图
	spring_of_wisdom(cv, hue) {
		const s = cv.w;
		const c = s / 2;
		const P = cv.p;
		const water = mix(hue, P.ink, 0.64);
		// 泉眼：扁椭圆的石沿 + 内潭。正圆会读成「一口井」，扁下去才像积住的一汪水
		cv.inked(() => cv.ellipse(c, c * 1.16, s * 0.33, s * 0.19, BODY));
		cv.ellipse(c, c * 1.1, s * 0.27, s * 0.145, water, 1);
		cv.glow(c, c * 1.08, s * 0.2, hue, 0.5);
		// 波纹：亮环挖心，连画两层做前后景
		for (const [rx, ry, a] of [[0.205, 0.108, 0.4], [0.125, 0.062, 0.3]]) {
			cv.ellipse(c, c * 1.08, s * rx, s * ry, P.warm, a);
			cv.ellipse(c, c * 1.08, s * (rx - 0.013), s * (ry - 0.008), water, 1);
		}
		// 升起的光泡：三颗大小不一，「刺激精神成长」的那点光就是从这儿冒出来的
		for (const [dx, r, top, alpha] of [[-0.1, 0.034, 0.84, 0.85], [0.015, 0.05, 0.64, 1], [0.12, 0.026, 0.76, 0.8]]) {
			cv.dot(c + s * dx, c * top, s * r, P.warm, alpha);
			cv.dot(c + s * dx - s * r * 0.32, c * (top - r * 0.34), s * r * 0.32, [1, 1, 1], 0.85);
		}
		// 泉沿压角的石头：不画的话整个画面只剩一个椭圆，认不出是野外的一处泉
		cv.inked(() => {
			cv.polygon([[c - s * 0.31, c * 1.26], [c - s * 0.2, c * 1.3], [c - s * 0.25, c * 1.44]], mix(hue, P.ink, 0.48));
			cv.polygon([[c + s * 0.31, c * 1.3], [c + s * 0.2, c * 1.34], [c + s * 0.26, c * 1.46]], mix(hue, P.ink, 0.54));
		}, 0.5);
		// 顶上那颗四芒星：与许愿池的星同一种画法，但放在正中泉口上方
		cv.dot(c, c * 0.38, s * 0.02, [1, 1, 1], 1);
		cv.segment(c - s * 0.055, c * 0.38, c + s * 0.055, c * 0.38, s * 0.006, P.warm, 0.9);
		cv.segment(c, c * 0.325, c, c * 0.435, s * 0.006, P.warm, 0.9);
	},
	skill_forge(cv, hue) {
		const s = cv.w;
		const c = s / 2;
		const P = cv.p;
		// 炉体 + 烟囱：先立起「一座大炉子」的剪影，门和火都压在它身上
		cv.inked(() => {
			cv.roundBox(c - s * 0.2, c * 0.72, s * 0.036, s * 0.15, s * 0.012, mix(hue, P.ink, 0.44));
			cv.roundBox(c, c * 1.14, s * 0.26, s * 0.24, s * 0.05, BODY);
		});
		// 炉门：拱形内凹，比炉体暗两档，火才有地方待
		cv.inked(() => cv.polygon([
			[c - s * 0.16, c * 1.3],
			[c + s * 0.16, c * 1.3],
			[c + s * 0.16, c * 1.02],
			[c, c * 0.86],
			[c - s * 0.16, c * 1.02],
		], mix(hue, P.ink, 0.84)), 0.35);
		// 三层舌焰：外层最宽最暗，芯子最亮——一坨纯色会被读成色块而不是火
		for (const [dx, w, h, color] of [[0, 0.1, 0.3, [1, 0.5, 0.14]], [-0.065, 0.045, 0.18, [1, 0.76, 0.3]], [0.065, 0.042, 0.16, [1, 0.9, 0.48]]]) {
			cv.polygon([
				[c + s * dx - s * w, c * 1.3],
				[c + s * dx + s * w, c * 1.3],
				[c + s * dx + s * w * 0.42, c * (1.3 - h * 0.55)],
				[c + s * dx, c * (1.3 - h)],
				[c + s * dx - s * w * 0.42, c * (1.3 - h * 0.62)],
			], color, 0.95);
		}
		// 被熔掉的那张技能卷：压在右上，明确「炉子吃的是技能」
		cv.inked(() => {
			cv.roundBox(c + s * 0.2, c * 0.72, s * 0.082, s * 0.048, s * 0.014, P.warm);
			cv.dot(c + s * 0.282, c * 0.72, s * 0.024, mix(hue, P.ink, 0.4));
			cv.dot(c + s * 0.118, c * 0.72, s * 0.024, mix(hue, P.ink, 0.4));
		}, 0.5);
		// 火星与底座
		for (const [dx, dy, r] of [[-0.15, 0.6, 0.012], [0.05, 0.54, 0.01], [-0.02, 0.48, 0.008], [0.13, 0.62, 0.009]]) {
			cv.dot(c + s * dx, c * dy, s * r, [1, 0.85, 0.35], 0.9);
		}
		cv.inked(() => cv.roundBox(c, c * 1.44, s * 0.31, s * 0.035, s * 0.014, mix(hue, P.ink, 0.58)), 0.5);
	},
	stat_training_ground(cv, hue) {
		const s = cv.w;
		const c = s / 2;
		const P = cv.p;
		// 后景靶环：偏心放左上半，主体是让两把剑交叉
		cv.inked(() => cv.ring(c, c * 1.04, s * 0.3, s * 0.032, mix(hue, P.ink, 0.5)));
		cv.ring(c, c * 1.04, s * 0.3, s * 0.014, P.pale, 0.55);
		cv.dot(c, c * 1.04, s * 0.16, mix(hue, P.ink, 0.76), 1);
		cv.dot(c, c * 1.04, s * 0.062, P.warm, 0.9);
		/** 一把剑：剑身 + 垂直护手 + 柄头。angle 用「起止点」而不是旋转，画起来不易歪 */
		const sword = (from, to, tint) => {
			const ax = c + s * from[0];
			const ay = c * (1 + from[1]);
			const bx = c + s * to[0];
			const by = c * (1 + to[1]);
			const vx = -(by - ay);
			const vy = bx - ax;
			const L = Math.hypot(vx, vy) || 1;
			const gx = ax + (bx - ax) * 0.2;
			const gy = ay + (by - ay) * 0.2;
			cv.inked(() => {
				cv.segment(ax, ay, bx, by, s * 0.022, tint);
				cv.segment(gx - (vx / L) * s * 0.05, gy - (vy / L) * s * 0.05, gx + (vx / L) * s * 0.05, gy + (vy / L) * s * 0.05, s * 0.014, P.warm);
				cv.dot(ax, ay, s * 0.026, P.warm);
			}, 0.42);
			// 剑尖：把末端收成一颗亮点，剑才不是两根等粗的棍子
			cv.dot(bx, by, s * 0.012, [1, 1, 1], 0.9);
		};
		sword([-0.26, 0.36], [0.24, -0.3], [0.88, 0.93, 1]);
		sword([0.26, 0.36], [-0.24, -0.3], [0.74, 0.8, 0.94]);
		// 地上那道练功痕：一条横压的暗带，把两把剑「放」在场景里而不是飘着
		cv.inked(() => cv.roundBox(c, c * 1.5, s * 0.3, s * 0.026, s * 0.012, mix(hue, P.ink, 0.62)), 0.4);
	},
	abyss_rift(cv, hue) {
		const s = cv.w;
		const c = s / 2;
		const P = cv.p;
		// 一条**纵向**裂缝：两侧压暗的岩壁、中间接近黑的洞、洞边各描一条亮线。
		// 上一版往整幅打主色光晕，64px 上读成「一条紫色横幅」而不是「地裂开了」，
		// 所以这版光晕只留在缝里那一小块。
		const jag = [[0.04, -0.44], [-0.05, -0.22], [0.07, 0.0], [-0.05, 0.22], [0.04, 0.44]];
		const half = 0.062;
		const left = jag.map(([dx, dy]) => [c + s * (dx - half), c * (1 + dy)]);
		const right = jag.map(([dx, dy]) => [c + s * (dx + half), c * (1 + dy)]);
		// 岩壁：左亮右暗，给画面一个光源方向，两块墙才不是一块背景
		cv.inked(() => {
			cv.polygon([[0, 0], ...left, [0, s]], mix(hue, P.ink, 0.34));
			cv.polygon([[s, 0], ...right, [s, s]], mix(hue, P.ink, 0.52));
		}, 0.3);
		// 洞：接近纯黑的楔形，压在两壁之间
		cv.polygon([...left, ...right.slice().reverse()], P.ink, 1);
		cv.glow(c, c, s * 0.11, hue, 0.75);
		// 亮边：左暖右冷，缝才有「裂开的口子」而不是「画了一条线」
		cv.inked(() => {
			for (let i = 0; i < jag.length - 1; i++) {
				cv.segment(left[i][0], left[i][1], left[i + 1][0], left[i + 1][1], s * 0.016, P.warm, 1);
				cv.segment(right[i][0], right[i][1], right[i + 1][0], right[i + 1][1], s * 0.016, hue, 1);
			}
		}, 0.35);
		// 缝里冒出来的三点光：「令人不安的力量」得有个出处
		for (const [dx, dy, r] of [[-0.02, 0.3, 0.026], [0.03, 0.0, 0.018], [-0.01, -0.3, 0.013]]) {
			cv.dot(c + s * dx, c * (1 + dy), s * r, P.warm, 0.9);
		}
		// 崩起来的三块碎石：带亮边的菱形，压在两壁上
		for (const [dx, dy, r] of [[-0.22, -0.26, 0.035], [0.24, -0.16, 0.026], [0.19, 0.34, 0.03]]) {
			const x = c + s * dx;
			const y = c * (1 + dy);
			cv.inked(() => cv.polygon([[x, y - s * r], [x + s * r, y], [x, y + s * r], [x - s * r, y]], mix(hue, P.ink, 0.2)), 0.4);
		}
	},
	wandering_merchant(cv, hue) {
		const s = cv.w;
		const c = s / 2;
		const P = cv.p;
		// 斗笠而不是兜帽：与「神秘商人」必须一眼分得开，两张图撞形就是设计事故
		cv.inked(() => {
			cv.polygon([[c - s * 0.24, c * 0.68], [c + s * 0.24, c * 0.68], [c, c * 0.44]], BODY);
			cv.roundBox(c, c * 0.7, s * 0.27, s * 0.026, s * 0.012, BODY);
			cv.ellipse(c, c * 0.9, s * 0.11, s * 0.09, BODY);
			cv.polygon([[c - s * 0.13, c * 1.44], [c + s * 0.13, c * 1.44], [c + s * 0.1, c * 1.06], [c - s * 0.1, c * 1.06]], BODY);
		});
		// 背后的包袱：比主色暗一档，压在身后而不是身上，读得出「行脚」
		cv.inked(() => {
			cv.dot(c - s * 0.17, c * 1.1, s * 0.11, mix(hue, P.ink, 0.42));
			cv.segment(c - s * 0.17, c * 0.98, c - s * 0.11, c * 0.9, s * 0.02, mix(hue, P.ink, 0.42));
		}, 0.5);
		// 抬起的那只手 + 手心唯一的一件货
		cv.inked(() => {
			cv.segment(c + s * 0.1, c * 1.14, c + s * 0.26, c * 1.0, s * 0.024, BODY);
			cv.dot(c + s * 0.28, c * 0.97, s * 0.03, BODY);
		}, 0.5);
		cv.dot(c + s * 0.285, c * 0.86, s * 0.046, P.warm, 1);
		cv.dot(c + s * 0.285, c * 0.86, s * 0.02, [1, 1, 1], 1);
		// 斗笠下两只眼睛：不画的话这张脸就是一个黑三角
		cv.dot(c - s * 0.04, c * 0.9, s * 0.015, P.warm, 1);
		cv.dot(c + s * 0.04, c * 0.9, s * 0.015, P.warm, 1);
	},
	curio_forge(cv, hue) {
		const s = cv.w;
		const c = s / 2;
		const P = cv.p;
		// 坩埚 + 支脚：与技能熔炉的「方炉体 + 烟囱」区分开，一个是锻技能的炉子、一个是融奇物的锅
		cv.inked(() => {
			cv.polygon([[c - s * 0.24, c * 1.04], [c + s * 0.24, c * 1.04], [c + s * 0.16, c * 1.36], [c - s * 0.16, c * 1.36]], BODY);
			cv.roundBox(c, c * 1.44, s * 0.1, s * 0.03, s * 0.012, mix(hue, P.ink, 0.5));
		});
		// 锅里熔着的料：凹面压暗 + 一层亮液
		cv.ellipse(c, c * 1.06, s * 0.21, s * 0.058, mix(hue, P.ink, 0.8), 1);
		cv.ellipse(c, c * 1.06, s * 0.18, s * 0.044, [0.95, 0.55, 1], 0.95);
		// 紫焰三舌
		for (const [dx, w, h, color] of [[0, 0.09, 0.32, [0.76, 0.38, 1]], [-0.075, 0.04, 0.2, [0.88, 0.6, 1]], [0.075, 0.04, 0.2, [0.88, 0.6, 1]]]) {
			cv.polygon([
				[c + s * dx - s * w, c * 1.02],
				[c + s * dx + s * w, c * 1.02],
				[c + s * dx + s * w * 0.45, c * (1.02 - h * 0.55)],
				[c + s * dx, c * (1.02 - h)],
				[c + s * dx - s * w * 0.45, c * (1.02 - h * 0.62)],
			], color, 0.92);
		}
		// 顶上那颗「升了一档」的宝石：菱形 + 白心 + 十字光，把结果直接画在画面上
		cv.inked(() => cv.polygon([[c, c * 0.34], [c + s * 0.095, c * 0.48], [c, c * 0.62], [c - s * 0.095, c * 0.48]], P.warm), 0.4);
		cv.dot(c, c * 0.48, s * 0.022, [1, 1, 1], 1);
		cv.segment(c - s * 0.15, c * 0.48, c + s * 0.15, c * 0.48, s * 0.005, P.warm, 0.8);
		cv.segment(c, c * 0.32, c, c * 0.64, s * 0.005, P.warm, 0.8);
	},
	ancient_ruins(cv, hue) {
		const s = cv.w;
		const c = s / 2;
		const P = cv.p;
		// 一堵残墙上开三个拱门：白 / 紫 / 黑，各透各的光
		cv.inked(() => cv.roundBox(c, c * 1.06, s * 0.34, s * 0.3, s * 0.022, BODY));
		const door = (dx, tint, glowColor, glow) => {
			const x = c + s * dx;
			cv.polygon([[x - s * 0.078, c * 1.32], [x + s * 0.078, c * 1.32], [x + s * 0.078, c * 0.98], [x, c * 0.82], [x - s * 0.078, c * 0.98]], tint, 1);
			if (glow > 0) {
				cv.glow(x, c * 1.12, s * 0.075, glowColor, glow);
			}
		};
		door(-0.2, [0.9, 0.94, 1], [1, 1, 1], 0.5);
		door(0, [0.62, 0.38, 1], [0.72, 0.46, 1], 0.55);
		// 黑门里什么都不透出——三扇门必须读得出明暗差，最后那扇就是「不安」
		door(0.2, [0.08, 0.07, 0.14], [0.4, 0.2, 0.5], 0.12);
		// 门框亮线：三扇都描一遍，压在暗门洞外沿上
		for (const dx of [-0.2, 0, 0.2]) {
			const x = c + s * dx;
			cv.polygon([
				[x - s * 0.082, c * 1.32], [x + s * 0.082, c * 1.32], [x + s * 0.082, c * 0.97], [x, c * 0.8], [x - s * 0.082, c * 0.97],
				[x - s * 0.07, c * 0.99], [x, c * 0.85], [x + s * 0.07, c * 0.99], [x + s * 0.07, c * 1.3], [x - s * 0.07, c * 1.3],
			], P.pale, 0.4);
		}
		// 塌了一半的墙顶 + 一块歪出去的石料
		cv.inked(() => {
			cv.roundBox(c - s * 0.05, c * 0.72, s * 0.3, s * 0.036, s* 0.01, mix(hue, P.ink, 0.4));
			cv.polygon([[c + s * 0.26, c * 0.66], [c + s * 0.37, c * 0.72], [c + s * 0.3, c * 0.8]], mix(hue, P.ink, 0.5));
		}, 0.45);
	},
	// ---------------------------------------------------------------- 本轮新增：六件奇物图
	berserker_badge(cv, hue) {
		const s = cv.w;
		const c = s / 2;
		const P = cv.p;
		// 盾牌：上宽下尖，缩到 64px 仍是一个整体轮廓
		cv.inked(() => cv.polygon([
			[c - s * 0.26, c * 0.64], [c + s * 0.26, c * 0.64], [c + s * 0.24, c * 1.12], [c, c * 1.46], [c - s * 0.24, c * 1.12],
		], BODY));
		cv.polygon([
			[c - s * 0.2, c * 0.74], [c + s * 0.2, c * 0.74], [c + s * 0.18, c * 1.08], [c, c * 1.32], [c - s * 0.18, c * 1.08],
		], mix(hue, P.ink, 0.74), 1);
		// 中央一柄双刃斧：「狂战」的标志，斧刃左右两片、斧柄穿下来
		cv.inked(() => {
			cv.segment(c, c * 0.76, c, c * 1.32, s * 0.022, P.warm);
			cv.polygon([[c - s * 0.13, c * 0.8], [c, c * 0.88], [c, c * 1.04], [c - s * 0.13, c * 1.08]], [0.9, 0.94, 1]);
			cv.polygon([[c + s * 0.13, c * 0.8], [c, c * 0.88], [c, c * 1.04], [c + s * 0.13, c * 1.08]], [0.78, 0.84, 0.94]);
		}, 0.42);
		// 两道血痕斜压盾面：升史诗就是「更上头」，靠血痕而不是换个盾形来表达
		for (const [dx, dy, len] of [[-0.17, 1.18, 0.3], [-0.1, 1.26, 0.24]]) {
			cv.segment(c + s * dx, c * dy, c + s * (dx + len), c * (dy - 0.09), s * 0.017, [0.86, 0.12, 0.2], 0.9);
		}
		cv.dot(c - s * 0.15, c * 0.72, s * 0.038, [1, 1, 1], 0.45);
	},
	blood_rage_core(cv, hue) {
		const s = cv.w;
		const c = s / 2;
		const P = cv.p;
		// 心脏：两个心房 + 下面一个尖，比画一个圆球更像「血」的东西
		cv.inked(() => {
			cv.dot(c - s * 0.12, c * 0.84, s * 0.14, BODY);
			cv.dot(c + s * 0.12, c * 0.84, s * 0.14, BODY);
			cv.polygon([[c - s * 0.24, c * 0.92], [c + s * 0.24, c * 0.92], [c, c * 1.42]], BODY);
		});
		cv.dot(c, c * 1.02, s * 0.12, P.warm, 1);
		cv.dot(c, c * 1.02, s * 0.05, [1, 1, 1], 1);
		// 裂纹：从顶端炸开的两条折线
		for (const [ax, ay, bx, by, cx2, cy2] of [[-0.1, 0.68, -0.01, 0.9, -0.05, 0.8], [0.12, 0.72, 0.05, 0.94, 0.11, 0.84]]) {
			cv.segment(c + s * ax, c * ay, c + s * bx, c * by, s * 0.013, P.ink, 0.95);
			cv.segment(c + s * bx, c * by, c + s * cx2, c * cy2, s * 0.011, P.ink, 0.9);
		}
		// 底下三滴血：血越少越怒，所以血是「掉出去」的
		for (const [dx, dy, r] of [[-0.12, 1.52, 0.034], [0.0, 1.62, 0.044], [0.12, 1.5, 0.03]]) {
			cv.dot(c + s * dx, c * dy, s * r, [0.86, 0.14, 0.24], 1);
			cv.dot(c + s * dx - s * r * 0.3, c * (dy - r * 0.3), s * r * 0.28, [1, 0.6, 0.65], 0.7);
		}
	},
	counter_amulet(cv, hue) {
		const s = cv.w;
		const c = s / 2;
		const P = cv.p;
		// 挂链：顶上一排由中间向两侧抬高的环
		for (let i = -2; i <= 2; i++) {
			cv.dot(c + s * 0.032 * i, c * 0.62 + s * Math.abs(i) * 0.012, s * 0.014, P.warm, 0.9);
		}
		// 符体：一圈向外的尖刺 + 粗环，与「破损怀表」那种素圆环区分
		cv.inked(() => {
			for (let i = 0; i < 12; i++) {
				const a = (Math.PI * 2 * i) / 12;
				cv.segment(
					c + Math.cos(a) * s * 0.24, c * 1.08 + Math.sin(a) * s * 0.24,
					c + Math.cos(a) * s * 0.3, c * 1.08 + Math.sin(a) * s * 0.3,
					s * 0.013, BODY);
			}
			cv.ring(c, c * 1.08, s * 0.21, s * 0.05, BODY);
		});
		cv.dot(c, c * 1.08, s * 0.165, mix(hue, P.ink, 0.78), 1);
		cv.ring(c, c * 1.08, s * 0.165, s * 0.011, P.pale, 0.55);
		// 符面中央那根「还回去」的尖刺：菱形竖着放
		cv.inked(() => cv.polygon([[c, c * 0.9], [c + s * 0.075, c * 1.14], [c, c * 1.28], [c - s * 0.075, c * 1.14]], P.warm), 0.35);
		cv.dot(c, c * 1.09, s * 0.03, [1, 1, 1], 1);
	},
	golden_compass(cv, hue) {
		const s = cv.w;
		const c = s / 2;
		const P = cv.p;
		// 壳 + 挂环：怀表有表冠和停摆的指针，罗盘则是八向刻度 + 一根歪着的针
		cv.inked(() => {
			cv.roundBox(c, c * 0.72, s * 0.05, s * 0.03, s * 0.012, BODY);
			cv.dot(c, c * 1.06, s * 0.3, BODY);
		});
		cv.dot(c, c * 1.06, s * 0.25, mix(hue, P.ink, 0.82), 1);
		for (let i = 0; i < 8; i++) {
			const a = (Math.PI * i) / 4;
			const r0 = 0.215;
			const r1 = i % 2 ? 0.178 : 0.135;
			cv.segment(
				c + Math.cos(a) * s * r0, c * 1.06 + Math.sin(a) * s * r0,
				c + Math.cos(a) * s * r1, c * 1.06 + Math.sin(a) * s * r1,
				s * 0.01, P.warm, 0.8);
		}
		// 指针不指北，指向压在壳角上的那枚金币
		cv.inked(() => cv.polygon([[c + s * 0.19, c * 1.19], [c - s * 0.05, c * 1.13], [c - s * 0.12, c * 0.99], [c + s * 0.13, c * 1.05]], P.warm), 0.35);
		cv.dot(c, c * 1.06, s * 0.03, [1, 1, 1], 1);
		cv.inked(() => {
			cv.dot(c + s * 0.23, c * 1.32, s * 0.062, [1, 0.8, 0.3]);
			cv.ring(c + s * 0.23, c * 1.32, s * 0.062, s * 0.012, [1, 0.94, 0.6], 0.9);
		}, 0.4);
	},
	piggy_bank(cv, hue) {
		const s = cv.w;
		const c = s / 2;
		const P = cv.p;
		// 罐身 + 两条短腿 + 顶上的盖子
		cv.inked(() => {
			cv.ellipse(c, c * 1.14, s * 0.29, s * 0.21, BODY);
			cv.roundBox(c - s * 0.02, c * 0.9, s * 0.1, s * 0.032, s * 0.014, BODY);
			cv.roundBox(c - s * 0.19, c * 1.38, s * 0.05, s * 0.045, s * 0.015, BODY);
			cv.roundBox(c + s * 0.15, c * 1.38, s * 0.05, s * 0.045, s * 0.015, BODY);
		});
		// 投币口那条缝
		cv.roundBox(c - s * 0.02, c * 0.9, s * 0.075, s * 0.012, s * 0.006, P.ink, 0.92);
		// 鼻 + 两个鼻孔 + 一只眼
		cv.inked(() => cv.ellipse(c + s * 0.25, c * 1.14, s * 0.075, s * 0.06, mix(hue, P.ink, 0.24)), 0.45);
		cv.dot(c + s * 0.235, c * 1.12, s * 0.012, P.ink, 0.9);
		cv.dot(c + s * 0.27, c * 1.16, s * 0.012, P.ink, 0.9);
		cv.dot(c + s * 0.12, c * 1.04, s * 0.022, P.ink, 0.95);
		// 一枚金币正被塞进去：画面有动作才读得出「储蓄」
		cv.inked(() => {
			cv.dot(c + s * 0.02, c * 0.64, s * 0.072, [1, 0.82, 0.32]);
			cv.ring(c + s * 0.02, c * 0.64, s * 0.072, s * 0.013, [1, 0.95, 0.6], 0.9);
		}, 0.4);
		cv.dot(c + s * 0.02, c * 0.64, s * 0.03, [1, 0.96, 0.72], 1);
	},
	oblivion_stone(cv, hue) {
		const s = cv.w;
		const c = s / 2;
		const P = cv.p;
		// 一块顶部被啃掉的不规则石碑
		cv.inked(() => cv.polygon([
			[c - s * 0.22, c * 0.74], [c - s * 0.04, c * 0.6], [c + s * 0.07, c * 0.7], [c + s * 0.22, c * 0.8],
			[c + s * 0.18, c * 1.36], [c - s * 0.19, c * 1.38],
		], BODY));
		cv.polygon([
			[c - s * 0.16, c * 0.84], [c + s * 0.15, c * 0.92], [c + s * 0.12, c * 1.3], [c - s * 0.13, c * 1.3],
		], mix(hue, P.ink, 0.76), 1);
		// 碑面三行字只剩淡痕：被抹掉的技能连名字都不留
		for (const [dy, len] of [[1.0, 0.22], [1.1, 0.18], [1.2, 0.2]]) {
			cv.roundBox(c - s * 0.02, c * dy, s * len, s * 0.011, s * 0.006, P.pale, 0.32);
		}
		// 一道横扫的擦痕压在字上，才是「抹掉」这个动作本身
		cv.inked(() => cv.polygon([
			[c - s * 0.24, c * 1.04], [c + s * 0.24, c * 0.96], [c + s * 0.24, c * 1.02], [c - s * 0.24, c * 1.1],
		], P.warm), 0.3);
		// 飘走的灰烬：越往上越小越淡
		for (const [dx, dy, r] of [[-0.1, 0.5, 0.02], [0.03, 0.42, 0.016], [0.14, 0.5, 0.013], [0.06, 0.34, 0.01]]) {
			cv.dot(c + s * dx, c * dy, s * r, P.warm, 0.6);
		}
		cv.dot(c - s * 0.12, c * 0.76, s * 0.035, [1, 1, 1], 0.45);
	},
};

// ---------------------------------------------------------------- 生成

// 主色一律选高饱和亮色：底色吃同色相的暗调，主体靠明度跨度 + 深色外轮廓跳出来，
// 缩小到 64px（奇物卡的显示尺寸）也认得出形状。
const IMAGES = [
	["events", 512, "lost_robot", "#5ce1ff", 11],
	["events", 512, "mystery_merchant", "#c08cff", 23],
	["events", 512, "lucky_coin", "#ffd23f", 37],
	["events", 512, "unknown_lab", "#5fff9e", 41],
	["events", 512, "wishing_pool", "#54c8ff", 43],
	["curios", 256, "broken_watch", "#ff7a8a", 53],
	["curios", 256, "lucky_stone", "#4fe06a", 67],
	["curios", 256, "breath_belt", "#ff8a5c", 71],
	["curios", 256, "energy_core", "#4d9bff", 83],
	["curios", 256, "leftover_rice", "#ffb63f", 97],
	["curios", 256, "cursed_coin", "#ff5470", 109],
	["curios", 256, "loop_button", "#3fe8b0", 113],
	["events", 512, "spring_of_wisdom", "#59f2d0", 131],
	["events", 512, "skill_forge", "#ff9440", 137],
	["events", 512, "stat_training_ground", "#a8e05c", 149],
	["events", 512, "abyss_rift", "#8c6cff", 157],
	["events", 512, "wandering_merchant", "#ffd97a", 163],
	["events", 512, "curio_forge", "#c86cff", 173],
	["events", 512, "ancient_ruins", "#9fd8ff", 181],
	["curios", 256, "berserker_badge", "#ff5c3c", 191],
	["curios", 256, "blood_rage_core", "#ff3c6c", 197],
	["curios", 256, "counter_amulet", "#7ac8ff", 211],
	["curios", 256, "golden_compass", "#ffc93c", 223],
	["curios", 256, "piggy_bank", "#ffa8c8", 227],
	["curios", 256, "oblivion_stone", "#a0a8c8", 233],
];

/** 盒式降采样：把 size×size 的 RGBA 收成 to×to。用来还原奇物在界面上的真实尺寸（64px） */
function shrink(pixels, size, to) {
	const k = Math.round(size / to);
	const out = new Uint8Array(to * to * 4);
	for (let y = 0; y < to; y++) {
		for (let x = 0; x < to; x++) {
			let r = 0;
			let g = 0;
			let b = 0;
			for (let sy = 0; sy < k; sy++) {
				for (let sx = 0; sx < k; sx++) {
					const i = ((y * k + sy) * size + x * k + sx) * 4;
					r += pixels[i];
					g += pixels[i + 1];
					b += pixels[i + 2];
				}
			}
			const o = (y * to + x) * 4;
			out[o] = Math.round(r / (k * k));
			out[o + 1] = Math.round(g / (k * k));
			out[o + 2] = Math.round(b / (k * k));
			out[o + 3] = 255;
		}
	}
	return out;
}

// 自检用拼表：把所有条目的「真实 64px 样子」放大两倍排进一张 4×4 网格。
// 奇物界面里只有 64px，直接看 256px 原图会一路绿灯、进游戏全是糊的（踩过），所以必须看这张。
const PREVIEW = process.argv.includes("--preview");
const PREVIEW_TILE = 64;
const PREVIEW_ZOOM = 2;
// 5×5 格、每格放大两倍 → 640×640；全部条目（12 事件 + 13 奇物 = 25 张）一张放完
const PREVIEW_COLS = 5;
const SHEET = PREVIEW_COLS * PREVIEW_TILE * PREVIEW_ZOOM;
const sheet = PREVIEW ? new Uint8Array(SHEET * SHEET * 4).fill(24) : null;

let index = 0;
for (const [dir, size, name, colorText, seed] of IMAGES) {
	const color = hex(colorText);
	const canvas = new Canvas(size, size > 400 ? 3 : 4);
	canvas.p = palette(color);
	backdrop(canvas, color, seed);
	draw[name](canvas, color);
	const pixels = canvas.pixels();
	const png = encodePNG(pixels, size);
	const outDir = dir === "events" ? EVENTS_DIR : CURIOS_DIR;
	fs.mkdirSync(outDir, { recursive: true });
	const file = path.join(outDir, `${name}.png`);
	fs.writeFileSync(file, png);
	console.log(`生成 ${path.relative(root, file)}（${size}x${size}，${png.length} 字节）`);
	if (PREVIEW) {
		const tiny = shrink(pixels, size, PREVIEW_TILE);
		const ox = (index % PREVIEW_COLS) * PREVIEW_TILE * PREVIEW_ZOOM;
		const oy = Math.floor(index / PREVIEW_COLS) * PREVIEW_TILE * PREVIEW_ZOOM;
		for (let y = 0; y < PREVIEW_TILE; y++) {
			for (let x = 0; x < PREVIEW_TILE; x++) {
				const i = (y * PREVIEW_TILE + x) * 4;
				for (let sy = 0; sy < PREVIEW_ZOOM; sy++) {
					for (let sx = 0; sx < PREVIEW_ZOOM; sx++) {
						const o = ((oy + y * PREVIEW_ZOOM + sy) * SHEET + ox + x * PREVIEW_ZOOM + sx) * 4;
						sheet[o] = tiny[i];
						sheet[o + 1] = tiny[i + 1];
						sheet[o + 2] = tiny[i + 2];
						sheet[o + 3] = 255;
					}
				}
			}
		}
		index += 1;
	}
}

if (PREVIEW) {
	const sheetFile = path.join(root, "tools", "preview-sheet.png");
	fs.writeFileSync(sheetFile, encodePNG(sheet, SHEET));
	console.log(`拼表（每格 = 真实 64px，放大两倍便于查看）：${path.relative(root, sheetFile)}`);
}
