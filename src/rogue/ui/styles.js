// 肉鸽自定义样式：存档页「存档记录」面板。
//
// 为什么不做在 #window 内的对话框里：本体与主题（十周年UI 等）大量样式作用于
// #window 下的对话框后代，grid 布局与 max-width 会被更高优先级甚至 !important 的规则压掉
// （真机上试过两轮：class 规则和内联样式都被压）。所以改走 src/ui/overlay.js 已验证的路线：
// 浮层挂 document.body，自带作用域为 .wm-rogue-* 的样式表，触摸用 bindTap + touch 隔离。

const STYLE_ID = "wm-rogue-styles";

const CSS = `
/* 浮层只负责遮罩与滚动；居中是里面 .wm-rogue-stage 的事，两者分开 */
.wm-rogue-overlay { position: fixed; left: 0; top: 0; width: 100%; height: 100%; z-index: 9998;
	background: rgba(0,0,0,0.55); overflow-y: auto; -webkit-overflow-scrolling: touch;
	font-size: 16px; line-height: 1.5;
	font-family: 'STXinwei', 'xinwei', 'Microsoft YaHei', sans-serif; }
/* 居中层：内容矮时 margin:auto 把它放在正中；内容比视口高时 auto 外边距归零，
   从顶部开始正常滚动（用 align-items:center / 固定 top / transform 都会把溢出部分顶出视口） */
.wm-rogue-stage { display: flex; box-sizing: border-box; width: 100%; min-height: 100%; padding: 30px 0; }
.wm-rogue-panel { margin: auto; padding: 0; box-sizing: border-box; }
.wm-rogue-titlebar { position: relative; display: flex; align-items: center; justify-content: center;
	min-height: 48px; margin-bottom: 14px; border-radius: 6px;
	background: linear-gradient(rgba(255,255,255,0.16), rgba(255,255,255,0.06));
	border: 1px solid rgba(255,255,255,0.14); }
.wm-rogue-title { font-size: 24px; font-weight: bold; color: #fff; letter-spacing: 4px;
	text-shadow: 0 2px 4px rgba(0,0,0,0.85); }
/* 返回定位在标题栏内（titlebar 是 relative），所以永远不会贴到屏幕边缘 */
.wm-rogue-back { position: absolute; right: 8px; top: 3px; }
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
.wm-rogue-btn { display: inline-block; padding: 6px 18px; border-radius: 4px; cursor: pointer;
	font-size: 18px; color: #fff; white-space: nowrap; user-select: none;
	background: linear-gradient(rgba(90,90,90,0.9), rgba(50,50,50,0.95));
	border: 1px solid rgba(255,255,255,0.28); box-shadow: 0 1px 3px rgba(0,0,0,0.6); }
.wm-rogue-btn:hover { border-color: rgba(255,200,120,0.9); }
.wm-rogue-btn.wm-rogue-small { padding: 4px 14px; font-size: 15px; }
.wm-rogue-btn.wm-rogue-danger { background: linear-gradient(rgba(150,60,50,0.92), rgba(90,30,25,0.95)); }
/* 浮层内的自建弹层：本体对话框会被浮层（z-index 9998）压住，所以浮层当前时用这个 */
.wm-rogue-popup { position: fixed; left: 0; top: 0; width: 100%; height: 100%; z-index: 9999;
	background: rgba(0,0,0,0.45); display: flex; align-items: center; justify-content: center; }
/* 弹层限高可滚：技能完整描述可能很长 */
.wm-rogue-popup-box { min-width: 280px; max-width: 560px; max-height: 72%; overflow-y: auto;
	padding: 18px 20px; border-radius: 8px;
	background: linear-gradient(rgba(28,28,28,0.96), rgba(12,12,12,0.98));
	border: 1px solid rgba(255,255,255,0.18); box-shadow: 0 6px 24px rgba(0,0,0,0.6); }
.wm-rogue-popup-line { font-size: 17px; color: #fff; line-height: 1.6; margin-bottom: 6px; }
.wm-rogue-popup-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 12px; }

/* ---- 商店：固定「标题 + 资源栏」，中间滚动，返回固定在标题栏右上角 ----
   字号层级（由大到小）：标题 30 → 区域标题 24 → 资源数值 26 → 技能名 22 / 属性名 21
   → 等级与价格 18 → 描述 17 / 属性效果 16 → 出处与说明 14 */
/* 商店是整屏布局：浮层不滚、居中层撑满，滚动交给 .wm-rogue-shop-body */
.wm-rogue-shop-overlay { overflow: hidden; }
#wm-rogue-overlay.wm-rogue-shop-overlay .wm-rogue-stage { height: 100%; min-height: 0; padding: 14px 0; }
#wm-rogue-overlay.wm-rogue-shop-overlay .wm-rogue-title { font-size: 30px; letter-spacing: 6px; }
.wm-rogue-shop { display: flex; flex-direction: column; width: min(1100px, calc(100% - 24px));
	height: 100%; margin: 0 auto; }
.wm-rogue-shop-head { flex: none; }
.wm-rogue-shop-body { flex: 1 1 auto; overflow-y: auto; -webkit-overflow-scrolling: touch; padding: 0 4px 10px 2px; }
/* 资源块：数字大、标签小，三块等宽并排 */
.wm-rogue-res { display: flex; gap: 10px; margin-bottom: 10px; }
.wm-rogue-res-cell { flex: 1 1 0; min-width: 0; padding: 8px 12px 6px; border-radius: 6px; text-align: center;
	background: linear-gradient(rgba(255,255,255,0.15), rgba(255,255,255,0.05));
	border: 1px solid rgba(255,255,255,0.16); }
.wm-rogue-res-num { font-size: 26px; line-height: 1.15; font-weight: bold; color: #ffd479;
	text-shadow: 0 1px 3px rgba(0,0,0,0.9); }
.wm-rogue-res-label { font-size: 13px; color: rgba(255,255,255,0.62); letter-spacing: 2px; }
.wm-rogue-shop-section-title { margin: 14px 0 5px; font-size: 24px; font-weight: bold; color: #fff;
	letter-spacing: 4px; text-shadow: 0 2px 4px rgba(0,0,0,0.9); }
.wm-rogue-shop-subtitle { margin-bottom: 9px; font-size: 14px; color: rgba(255,255,255,0.58); }
/* 三张技能卡：一行放得下就横排，窄屏自动换行 */
.wm-rogue-shop-cards, .wm-rogue-stat-cards { display: flex; flex-wrap: wrap; gap: 12px; }
.wm-rogue-shop-card, .wm-rogue-stat-card { flex: 1 1 300px; min-width: 0; box-sizing: border-box;
	padding: 12px 14px; border-radius: 8px; display: flex; flex-direction: column;
	background: linear-gradient(rgba(22,22,22,0.80), rgba(0,0,0,0.86));
	border: 1px solid rgba(255,255,255,0.14); box-shadow: 0 2px 10px rgba(0,0,0,0.5); }
.wm-rogue-shop-card { cursor: pointer; }
.wm-rogue-shop-card:hover { border-color: rgba(255,180,80,0.7); }
.wm-rogue-shop-card.wm-rogue-off, .wm-rogue-stat-card.wm-rogue-off { opacity: 0.62; }
.wm-rogue-shop-top { display: flex; align-items: center; gap: 10px; }
/* 出处头像只做“这技能来自谁”的提示，比选将页的武将牌小得多 */
.wm-rogue-shop-avatar { flex: none; width: 48px; height: 64px; border-radius: 4px;
	border: 1px solid rgba(255,255,255,0.25); background-size: cover; background-position: center; }
.wm-rogue-shop-name { font-size: 22px; font-weight: bold; color: #fff; line-height: 1.25;
	text-shadow: 0 1px 3px rgba(0,0,0,0.9); }
.wm-rogue-shop-owner { margin-top: 7px; font-size: 14px; color: rgba(255,255,255,0.6); }
/* 描述限高约 5 行：超长描述不会撑高整张卡；完整文本点卡片看（title 只是给鼠标用户的顺带） */
.wm-rogue-shop-desc { margin-top: 7px; font-size: 17px; line-height: 1.5; color: rgba(255,255,255,0.88);
	max-height: 7.5em; overflow: hidden; }
.wm-rogue-shop-foot, .wm-rogue-stat-foot { display: flex; align-items: center; justify-content: space-between;
	gap: 10px; margin-top: auto; padding-top: 12px; }
.wm-rogue-shop-price { font-size: 18px; color: #ffd479; }
.wm-rogue-shop-buy, .wm-rogue-stat-up { flex: none; }
.wm-rogue-btn.wm-rogue-disabled { opacity: 0.45; cursor: default; border-color: rgba(255,255,255,0.18); }
.wm-rogue-btn.wm-rogue-disabled:hover { border-color: rgba(255,255,255,0.18); }
.wm-rogue-stat-head { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
.wm-rogue-stat-name { font-size: 21px; font-weight: bold; color: #fff; text-shadow: 0 1px 3px rgba(0,0,0,0.9); }
.wm-rogue-stat-level { font-size: 18px; color: #ffd479; }
.wm-rogue-stat-effects { margin-top: 7px; }
.wm-rogue-stat-effect { font-size: 16px; line-height: 1.55; color: rgba(255,255,255,0.88); }
.wm-rogue-stat-effect.wm-rogue-none { color: rgba(255,255,255,0.5); }
.wm-rogue-stat-price { font-size: 18px; color: #ffd479; }

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
#wm-rogue-overlay .wm-rogue-card,
#wm-rogue-overlay .wm-rogue-titlebar { position: relative !important; }
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
#wm-rogue-overlay .wm-rogue-stage { display: flex !important; }
#wm-rogue-overlay .wm-rogue-btn { display: inline-block !important; }
/* 商店：布局语义同样钉死——主题的裸 div 规则会把它们变成 inline-block 并排，卡片就不再是竖直卡片 */
#wm-rogue-overlay.wm-rogue-shop-overlay { overflow: hidden !important; }
#wm-rogue-overlay .wm-rogue-shop,
#wm-rogue-overlay .wm-rogue-shop-card,
#wm-rogue-overlay .wm-rogue-stat-card { display: flex !important; flex-direction: column !important; }
#wm-rogue-overlay .wm-rogue-shop-cards,
#wm-rogue-overlay .wm-rogue-stat-cards,
#wm-rogue-overlay .wm-rogue-res { display: flex !important; flex-wrap: wrap !important; }
#wm-rogue-overlay .wm-rogue-shop-top,
#wm-rogue-overlay .wm-rogue-shop-foot,
#wm-rogue-overlay .wm-rogue-stat-head,
#wm-rogue-overlay .wm-rogue-stat-foot { display: flex !important; flex-wrap: nowrap !important; }
#wm-rogue-overlay .wm-rogue-shop-head,
#wm-rogue-overlay .wm-rogue-shop-body,
#wm-rogue-overlay .wm-rogue-res-cell,
#wm-rogue-overlay .wm-rogue-shop-avatar,
#wm-rogue-overlay .wm-rogue-stat-effects { display: block !important; }
#wm-rogue-overlay .wm-rogue-shop-section-title,
#wm-rogue-overlay .wm-rogue-shop-subtitle,
#wm-rogue-overlay .wm-rogue-shop-name,
#wm-rogue-overlay .wm-rogue-shop-owner,
#wm-rogue-overlay .wm-rogue-shop-desc,
#wm-rogue-overlay .wm-rogue-shop-price,
#wm-rogue-overlay .wm-rogue-stat-name,
#wm-rogue-overlay .wm-rogue-stat-level,
#wm-rogue-overlay .wm-rogue-stat-effect,
#wm-rogue-overlay .wm-rogue-stat-price,
#wm-rogue-overlay .wm-rogue-res-num,
#wm-rogue-overlay .wm-rogue-res-label { display: block !important; }
#wm-rogue-overlay .wm-rogue-shop-desc,
#wm-rogue-overlay .wm-rogue-shop-owner,
#wm-rogue-overlay .wm-rogue-shop-subtitle,
#wm-rogue-overlay .wm-rogue-stat-effect { white-space: normal !important; overflow-wrap: break-word !important; }
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
