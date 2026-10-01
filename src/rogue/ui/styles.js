// 肉鸽自定义样式：存档页「存档记录」面板。
//
// 为什么不做在 #window 内的对话框里：本体与主题（十周年UI 等）大量样式作用于
// #window 下的对话框后代，grid 布局与 max-width 会被更高优先级甚至 !important 的规则压掉
// （真机上试过两轮：class 规则和内联样式都被压）。所以改走 src/ui/overlay.js 已验证的路线：
// 浮层挂 document.body，自带作用域为 .wm-rogue-* 的样式表，触摸用 bindTap + touch 隔离。

const STYLE_ID = "wm-rogue-styles";

const CSS = `
/* 竖直方向用「flex 列 + 面板 margin:auto」居中：空间够时上下留白，不够时从顶部开始并可滚动 */
.wm-rogue-overlay { position: fixed; left: 0; top: 0; width: 100%; height: 100%; z-index: 9998;
	background: rgba(0,0,0,0.55); display: flex; flex-direction: column; align-items: center;
	overflow-y: auto; -webkit-overflow-scrolling: touch; font-size: 16px; line-height: 1.5;
	font-family: 'STXinwei', 'xinwei', 'Microsoft YaHei', sans-serif; }
.wm-rogue-panel { margin: auto 0; padding: 0; box-sizing: border-box; }
.wm-rogue-titlebar { position: relative; display: flex; align-items: center; justify-content: center;
	min-height: 48px; margin-bottom: 14px; border-radius: 6px;
	background: linear-gradient(rgba(255,255,255,0.16), rgba(255,255,255,0.06));
	border: 1px solid rgba(255,255,255,0.14); }
.wm-rogue-title { font-size: 24px; font-weight: bold; color: #fff; letter-spacing: 4px;
	text-shadow: 0 2px 4px rgba(0,0,0,0.85); }
.wm-rogue-back { position: absolute; right: 8px; top: 7px; }
/* 两列由 <table> 承载（见 slots.js 的 buildSlotTable），这里只负责卡片与文字的外观 */
.wm-rogue-card { position: relative; min-height: 104px; padding: 12px 14px; border-radius: 8px;
	text-align: left; box-sizing: border-box;
	background: linear-gradient(rgba(22,22,22,0.78), rgba(0,0,0,0.85));
	border: 1px solid rgba(255,255,255,0.14); box-shadow: 0 2px 10px rgba(0,0,0,0.55);
	cursor: pointer; }
.wm-rogue-card:not(.wm-rogue-empty):hover { border-color: rgba(255,180,80,0.75); }
.wm-rogue-card.wm-rogue-empty { border-style: dashed; opacity: 0.9; }
.wm-rogue-no { padding-top: 2px; font-size: 32px; line-height: 1; font-weight: bold;
	font-family: Impact, "Arial Black", sans-serif; color: #ff7a18;
	text-shadow: 0 2px 3px rgba(0,0,0,0.9); }
/* 编号与正文由卡片内的两格表格分列（见 slots.js 的 buildCardContent），不用 float/flex */
.wm-rogue-body { min-width: 0; }
.wm-rogue-name { font-size: 20px; font-weight: bold; color: #fff;
	text-shadow: 0 1px 2px rgba(0,0,0,0.9); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.wm-rogue-time { font-size: 13px; color: rgba(255,255,255,0.6); margin-top: 3px; }
.wm-rogue-meta { font-size: 13px; color: rgba(255,255,255,0.85); margin-top: 3px;
	white-space: normal; overflow-wrap: anywhere; }
.wm-rogue-flag { font-size: 13px; color: #ffb347; margin-top: 3px; }
.wm-rogue-hint { font-size: 13px; color: #ffd08a; margin-top: 6px; }
.wm-rogue-tag { position: absolute; right: 10px; top: 8px; font-size: 12px; color: rgba(255,255,255,0.45); }
/* 删除做成卡内文字链接：不再有按钮盒，也就不会被卡片边缘压住 */
.wm-rogue-link { position: absolute; right: 10px; bottom: 8px; font-size: 13px; cursor: pointer;
	color: rgba(255,150,140,0.9); text-decoration: underline; user-select: none; }
.wm-rogue-link:hover { color: #ff6b57; }
.wm-rogue-btn { display: inline-block; padding: 4px 14px; border-radius: 4px; cursor: pointer;
	font-size: 14px; color: #fff; white-space: nowrap; user-select: none;
	background: linear-gradient(rgba(90,90,90,0.9), rgba(50,50,50,0.95));
	border: 1px solid rgba(255,255,255,0.28); box-shadow: 0 1px 3px rgba(0,0,0,0.6); }
.wm-rogue-btn:hover { border-color: rgba(255,200,120,0.9); }
.wm-rogue-btn.wm-rogue-small { padding: 3px 12px; font-size: 13px; }
.wm-rogue-btn.wm-rogue-danger { background: linear-gradient(rgba(150,60,50,0.92), rgba(90,30,25,0.95)); }
/* 浮层内的自建弹层：本体对话框会被浮层（z-index 9998）压住，所以浮层当前时用这个 */
.wm-rogue-popup { position: fixed; left: 0; top: 0; width: 100%; height: 100%; z-index: 9999;
	background: rgba(0,0,0,0.45); display: flex; align-items: center; justify-content: center; }
.wm-rogue-popup-box { min-width: 280px; max-width: 520px; padding: 18px 20px; border-radius: 8px;
	background: linear-gradient(rgba(28,28,28,0.96), rgba(12,12,12,0.98));
	border: 1px solid rgba(255,255,255,0.18); box-shadow: 0 6px 24px rgba(0,0,0,0.6); }
.wm-rogue-popup-line { font-size: 16px; color: #fff; line-height: 1.6; margin-bottom: 6px; }
.wm-rogue-popup-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 12px; }

/* ---- 加固块 ----
   本体 CSS 里存在大量 writing-mode: vertical-rl（竖排名字），主题也会用 !important 改
   table/td 的 display 与文本换行；这些都会被浮层里的普通类规则继承或压掉。
   这里用 id 前缀（优先级 1,0,0 起）+ !important 把关键语义钉死。 */
#wm-rogue-overlay, #wm-rogue-overlay * {
	writing-mode: horizontal-tb !important;
	-webkit-writing-mode: horizontal-tb !important;
	text-orientation: mixed !important;
}
#wm-rogue-overlay table, #wm-rogue-overlay tbody, #wm-rogue-overlay tr, #wm-rogue-overlay td {
	display: revert !important;
	position: static !important;
	float: none !important;
}
#wm-rogue-overlay .wm-rogue-content { width: 100% !important; }
#wm-rogue-overlay .wm-rogue-body,
#wm-rogue-overlay .wm-rogue-time,
#wm-rogue-overlay .wm-rogue-meta,
#wm-rogue-overlay .wm-rogue-hint,
#wm-rogue-overlay .wm-rogue-flag {
	white-space: normal !important;
	word-break: normal !important;
	overflow-wrap: break-word !important;
	writing-mode: horizontal-tb !important;
}
/* 真凶（探针实录）：主题里有一条裸 div 的全局规则
   「div { display: inline-block; position: absolute; transition: .5s }」
   —— 所有没有自带定位的 div 都会变成「绝对定位 + 收缩到内容宽」，
   中文的最小内容宽是 1 个字，于是每个字独占一行（13px 宽、竖排堆叠）。
   这也是前几轮 grid 容器 0px、卡片 29px、浮动卡片不渲染的同一个原因。
   下面把浮层内的定位语义钉死，只保留刻意绝对定位的几个元素。 */
#wm-rogue-overlay div { position: static !important; }
#wm-rogue-overlay .wm-rogue-popup { position: fixed !important; }
#wm-rogue-overlay .wm-rogue-card { position: relative !important; }
#wm-rogue-overlay .wm-rogue-tag,
#wm-rogue-overlay .wm-rogue-link,
#wm-rogue-overlay .wm-rogue-back { position: absolute !important; }
#wm-rogue-overlay .wm-rogue-no,
#wm-rogue-overlay .wm-rogue-body,
#wm-rogue-overlay .wm-rogue-name,
#wm-rogue-overlay .wm-rogue-time,
#wm-rogue-overlay .wm-rogue-meta,
#wm-rogue-overlay .wm-rogue-hint,
#wm-rogue-overlay .wm-rogue-flag,
#wm-rogue-overlay .wm-rogue-panel { display: block !important; }
#wm-rogue-overlay .wm-rogue-titlebar { display: flex !important; }
#wm-rogue-overlay .wm-rogue-btn { display: inline-block !important; }
/* 返回按钮：尺寸写死成固定盒子。想继续调大调小，只改这里的 width/height/line-height/font-size 四个数 */
#wm-rogue-overlay .wm-rogue-back .wm-rogue-btn {
	display: inline-block !important;
	box-sizing: border-box !important;
	width: 96px !important;
	height: 42px !important;
	line-height: 40px !important;
	font-size: 21px !important;
	padding: 0 !important;
	margin: 0 !important;
	min-width: 0 !important;
	min-height: 0 !important;
	text-align: center !important;
}
#wm-rogue-overlay .wm-rogue-name { white-space: nowrap !important; }
#wm-rogue-overlay .wm-rogue-no { white-space: nowrap !important; }
`;

export function ensureRogueStyles() {
	if (document.getElementById(STYLE_ID)) {
		return;
	}
	const style = document.createElement("style");
	style.id = STYLE_ID;
	style.textContent = CSS;
	document.head.appendChild(style);
}
