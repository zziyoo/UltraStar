import { lib, game, ui, get, ai, _status } from "../../../../noname.js";

import { characterAnalysis, calculateCharacterScore } from "../../data/characterAnalysis.js";
import { bindTap, isolateOverlayTouch } from "./overlay.js";

// ===== 六维定义（顺时针：上→右上→右下→下→左下→左上）=====
const DIMENSIONS = [
	{ key: "output", name: "输出" },
	{ key: "defense", name: "防御" },
	{ key: "control", name: "控制" },
	{ key: "operation", name: "运营" },
	{ key: "support", name: "辅助" },
	{ key: "development", name: "发育" },
];
const GRADES = ["S", "A", "B", "C", "D", "E"];
const GRADE_VALUES = { S: 6, A: 5, B: 4, C: 3, D: 2, E: 1 };
const DEFAULT_GRADE = "C";

// ===== 样式（命名空间 .wm-character-analysis-*，挂载到 head，仅注入一次）=====
const ensureAnalysisStyles = () => {
	if (document.getElementById("wm-character-analysis-styles")) return;
	const style = document.createElement("style");
	style.id = "wm-character-analysis-styles";
	style.textContent = `@keyframes wmAnalysisFadeIn{from{opacity:0}to{opacity:1}}
						@keyframes wmAnalysisPanelIn{from{transform:scale(0.86) translateY(-60px);opacity:0}to{transform:scale(1) translateY(0);opacity:1}}
						.wm-character-analysis-overlay div:not(.wm-character-analysis-big):not(.wm-character-analysis-close):not(.wm-character-analysis-header):not(.wm-character-analysis-body):not(.wm-character-analysis-left):not(.wm-character-analysis-right):not(.wm-character-analysis-photo):not(.wm-character-analysis-footer){position:relative !important;display:block !important;}
						.wm-character-analysis-overlay{position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.78);z-index:100200;display:flex;align-items:center;justify-content:center;animation:wmAnalysisFadeIn 0.35s ease-in-out;user-select:none;-webkit-user-select:none;}
						.wm-character-analysis-frame{position:relative;display:block;width:min(92vw,880px);max-height:92vh;overflow-y:auto;overflow-x:hidden;box-sizing:border-box;padding:2px;background:linear-gradient(135deg,rgba(111,216,255,0.55),rgba(255,255,255,0.12) 30%,rgba(255,85,96,0.45) 70%,rgba(255,215,0,0.4));clip-path:polygon(20px 0,100% 0,100% calc(100% - 20px),calc(100% - 20px) 100%,0 100%,0 20px);-webkit-overflow-scrolling:touch;}
						.wm-character-analysis-box{position:relative;display:block;box-sizing:border-box;background:radial-gradient(circle at 18% 12%,rgba(111,216,255,0.10),transparent 42%),radial-gradient(circle at 85% 82%,rgba(255,85,96,0.09),transparent 42%),repeating-linear-gradient(45deg,rgba(255,255,255,0.022) 0 2px,transparent 2px 7px),#0c0f15;clip-path:polygon(20px 0,100% 0,100% calc(100% - 20px),calc(100% - 20px) 100%,0 100%,0 20px);animation:wmAnalysisPanelIn 0.4s cubic-bezier(0.68,-0.4,0.3,1.3);overflow:hidden;}
						.wm-character-analysis-big{position:absolute;right:10px;bottom:-18px;font-size:150px;line-height:1;font-weight:900;font-style:italic;color:rgba(255,255,255,0.045);pointer-events:none;letter-spacing:-6px;}
						.wm-character-analysis-close{position:absolute;top:8px;right:12px;z-index:5;color:rgba(255,255,255,0.7);font-size:24px;line-height:1;padding:6px 12px;cursor:pointer;text-shadow:1px 1px 3px rgba(0,0,0,0.9);}
						.wm-character-analysis-close:hover{color:#ffd700;}
						.wm-character-analysis-header{position:relative;display:flex;flex-direction:column;align-items:center;padding:16px 46px 2px;}
						.wm-character-analysis-title{font-size:21px;font-weight:900;font-style:italic;letter-spacing:7px;color:rgba(255,255,255,0.93);text-shadow:0 0 16px rgba(111,216,255,0.4),2px 2px 0 rgba(0,0,0,0.8);}
						.wm-character-analysis-sub{margin-top:3px;font-size:11px;letter-spacing:4px;color:rgba(111,216,255,0.6);}
						.wm-character-analysis-body{position:relative;display:flex;gap:16px;align-items:stretch;padding:8px 24px 4px;}
						.wm-character-analysis-left{position:relative;flex:0 0 56%;min-width:0;display:flex;align-items:center;justify-content:center;}
						.wm-character-analysis-right{flex:1 1 auto;min-width:0;position:relative;display:flex;align-items:center;justify-content:center;}
						.wm-character-analysis-radar{width:100%;max-width:390px;height:auto;display:block;}
						.wm-character-analysis-radar .grid{fill:none;stroke:rgba(150,170,200,0.26);stroke-width:1;}
						.wm-character-analysis-radar .grid.outer{stroke:rgba(200,220,255,0.45);stroke-width:1.6;}
						.wm-character-analysis-radar .axis{stroke:rgba(150,170,200,0.22);stroke-width:1;}
						.wm-character-analysis-radar .data{fill:rgba(111,216,255,0.28);stroke:#6fd8ff;stroke-width:2.2;stroke-linejoin:round;filter:drop-shadow(0 0 6px rgba(111,216,255,0.55));}
						.wm-character-analysis-radar .dot{fill:#fff;stroke:#6fd8ff;stroke-width:1.5;}
						.wm-character-analysis-radar .dimname{fill:rgba(255,255,255,0.88);font-size:15px;font-weight:bold;text-shadow:1px 1px 2px rgba(0,0,0,0.9);}
						.wm-character-analysis-radar .grade{font-size:18px;font-weight:900;font-style:italic;text-shadow:1px 1px 0 rgba(0,0,0,0.85);}
						.wm-character-analysis-radar .grade-S{fill:#ffd700;}
						.wm-character-analysis-radar .grade-A{fill:#ff5560;}
						.wm-character-analysis-radar .grade-B{fill:#ffa02e;}
						.wm-character-analysis-radar .grade-C{fill:#7dd87d;}
						.wm-character-analysis-radar .grade-D{fill:#5cb3ff;}
						.wm-character-analysis-radar .grade-E{fill:#98a2b3;}
						.wm-character-analysis-empty{color:rgba(255,255,255,0.55);font-size:15px;letter-spacing:2px;border:1px dashed rgba(255,255,255,0.25);padding:30px 24px;}
						.wm-character-analysis-photo{position:relative;width:100%;height:100%;max-height:430px;display:flex;align-items:center;justify-content:center;}
						.wm-character-analysis-photo img{max-width:100%;max-height:430px;object-fit:contain;filter:drop-shadow(0 4px 14px rgba(0,0,0,0.7)) drop-shadow(0 0 16px rgba(111,216,255,0.22));}
						.wm-character-analysis-photo.noimg::before{content:"无图";display:flex;align-items:center;justify-content:center;width:70%;aspect-ratio:3/4;border:1px dashed rgba(255,255,255,0.3);color:rgba(255,255,255,0.5);font-size:14px;}
						.wm-character-analysis-footer{position:relative;display:flex;justify-content:center;padding:8px 18px 20px;}
						.wm-character-analysis-name{transform:skewX(-12deg);border:1px solid rgba(255,215,0,0.55);border-left:4px solid rgba(255,85,96,0.75);background:linear-gradient(90deg,rgba(255,85,96,0.16),rgba(111,216,255,0.13));padding:7px 30px;color:#fff;font-size:20px;font-weight:bold;letter-spacing:2px;text-shadow:1px 1px 3px rgba(0,0,0,0.9);}
						.wm-character-analysis-name > span{display:inline-block;transform:skewX(12deg);}
						@media (max-width:640px){
							.wm-character-analysis-body{flex-direction:column;gap:6px;padding:4px 14px;}
							.wm-character-analysis-left{flex:none;width:100%;}
							.wm-character-analysis-photo{max-height:36vh;}
							.wm-character-analysis-photo img{max-height:36vh;}
							.wm-character-analysis-title{font-size:16px;letter-spacing:4px;}
							.wm-character-analysis-big{font-size:90px;}
						}`;
	document.head.appendChild(style);
};

// ===== 雷达图（SVG 动态生成）=====
const RADAR_SIZE = 320;
const RADAR_CENTER = 160;
const RADAR_RADIUS = 100;

const hexVertex = (index, radius) => {
	const angle = ((-90 + index * 60) * Math.PI) / 180;
	return [RADAR_CENTER + radius * Math.cos(angle), RADAR_CENTER + radius * Math.sin(angle)];
};
const toPoints = coords => coords.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ");

const buildRadar = grades => {
	const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
	svg.setAttribute("viewBox", `0 0 ${RADAR_SIZE} ${RADAR_SIZE}`);
	svg.classList.add("wm-character-analysis-radar");
	const make = (tag, attrs) => {
		const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
		for (const key in attrs) {
			el.setAttribute(key, attrs[key]);
		}
		return el;
	};
	// 六层六边形背景网格（内层 F → 外层 A）
	for (let level = 1; level <= 6; level++) {
		const radius = (RADAR_RADIUS * level) / 6;
		svg.appendChild(
			make("polygon", {
				points: toPoints(DIMENSIONS.map((_, i) => hexVertex(i, radius))),
				class: "grid" + (level === 6 ? " outer" : ""),
			})
		);
	}
	// 六条属性轴
	for (let i = 0; i < 6; i++) {
		const [x, y] = hexVertex(i, RADAR_RADIUS);
		svg.appendChild(make("line", { x1: RADAR_CENTER, y1: RADAR_CENTER, x2: x, y2: y, class: "axis" }));
	}
	// 能力区域
	const dataCoords = grades.map((grade, i) => hexVertex(i, (RADAR_RADIUS * GRADE_VALUES[grade]) / 6));
	svg.appendChild(make("polygon", { points: toPoints(dataCoords), class: "data" }));
	for (const [x, y] of dataCoords) {
		svg.appendChild(make("circle", { cx: x, cy: y, r: 3, class: "dot" }));
	}
	// 顶点评级字母：固定排在数据区外一圈，任意评级下与属性名保持恒定间距
	grades.forEach((grade, i) => {
		const [x, y] = hexVertex(i, RADAR_RADIUS + 15);
		const text = make("text", { x: x, y: y, class: `grade grade-${grade}`, "text-anchor": "middle", dy: "0.35em" });
		text.textContent = grade;
		svg.appendChild(text);
	});
	// 属性名称
	DIMENSIONS.forEach((dim, i) => {
		const [x, y] = hexVertex(i, RADAR_RADIUS + 45);
		const text = make("text", { x: x, y: y, class: "dimname", "text-anchor": "middle", dy: "0.35em" });
		text.textContent = dim.name;
		svg.appendChild(text);
	});
	return svg;
};

// ===== 面板 =====
export const openCharacterAnalysis = (id, info) => {
	if (document.querySelector(".wm-character-analysis-overlay")) return;
	ensureAnalysisStyles();
	const data = characterAnalysis?.[id] ?? null;
	const grades = data
		? DIMENSIONS.map(dim => (GRADES.includes(data[dim.key]) ? data[dim.key] : DEFAULT_GRADE))
		: null;
	// 总分与排行榜共用 calculateCharacterScore，保证两处显示完全一致
	const score = calculateCharacterScore(data);

	const overlay = document.createElement("div");
	overlay.className = "wm-character-analysis-overlay";
	const frame = document.createElement("div");
	frame.className = "wm-character-analysis-frame";
	const box = document.createElement("div");
	box.className = "wm-character-analysis-box";
	const big = document.createElement("div");
	big.className = "wm-character-analysis-big";
	big.textContent = "S";
	const close = document.createElement("div");
	close.className = "wm-character-analysis-close";
	close.textContent = "✕";
	const header = document.createElement("div");
	header.className = "wm-character-analysis-header";
	const title = document.createElement("div");
	title.className = "wm-character-analysis-title";
	title.textContent = "CHARACTER ANALYSIS";
	const sub = document.createElement("div");
	sub.className = "wm-character-analysis-sub";
	sub.textContent = "— ULTRA STAR · 六维能力档案 —";
	header.appendChild(title);
	header.appendChild(sub);
	const body = document.createElement("div");
	body.className = "wm-character-analysis-body";
	const left = document.createElement("div");
	left.className = "wm-character-analysis-left";
	if (grades) {
		left.appendChild(buildRadar(grades));
	} else {
		const empty = document.createElement("div");
		empty.className = "wm-character-analysis-empty";
		empty.textContent = "暂无分析数据";
		left.appendChild(empty);
	}
	const right = document.createElement("div");
	right.className = "wm-character-analysis-right";
	const photo = document.createElement("div");
	photo.className = "wm-character-analysis-photo";
	const url = typeof info?.img === "string" && info.img ? lib.assetURL + info.img : null;
	if (url) {
		const img = document.createElement("img");
		img.src = url;
		img.addEventListener("error", () => {
			console.warn(`[奥特之星][角色分析] 角色图片加载失败：${id} -> ${url}`);
			img.remove();
			photo.classList.add("noimg");
		});
		photo.appendChild(img);
	} else {
		photo.classList.add("noimg");
	}
	right.appendChild(photo);
	body.appendChild(left);
	body.appendChild(right);
	const footer = document.createElement("div");
	footer.className = "wm-character-analysis-footer";
	const name = document.createElement("div");
	name.className = "wm-character-analysis-name";
	const nameText = document.createElement("span");
	nameText.textContent = (lib.translate[id] ?? id) + (score != null ? ` ${score}分` : "");
	name.appendChild(nameText);
	footer.appendChild(name);
	box.appendChild(big);
	box.appendChild(close);
	box.appendChild(header);
	box.appendChild(body);
	box.appendChild(footer);
	frame.appendChild(box);
	overlay.appendChild(frame);
	isolateOverlayTouch(overlay);
	bindTap(close, () => overlay.remove());
	bindTap(overlay, e => {
		if (e.target === overlay) overlay.remove();
	});
	// 挂载到 document.body：与 changelog/tierlist/easterEgg 的 Overlay 一致，
	// 避免本体 ui.window 内作用于任意后代 div 的样式干扰布局
	document.body.appendChild(overlay);
};
