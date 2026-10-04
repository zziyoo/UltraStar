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
.wm-rogue-name { font-size: 21px; font-weight: bold; color: #fff;
	text-shadow: 0 1px 2px rgba(0,0,0,0.9); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.wm-rogue-time { font-size: 14px; color: rgba(255,255,255,0.62); margin-top: 4px; }
.wm-rogue-meta { font-size: 15px; color: rgba(255,255,255,0.86); margin-top: 4px;
	white-space: normal; overflow-wrap: anywhere; }
.wm-rogue-flag { font-size: 14px; color: #ffb347; margin-top: 4px; }
.wm-rogue-hint { font-size: 15px; color: #ffd08a; margin-top: 7px; }
.wm-rogue-tag { position: absolute; right: 10px; top: 8px; font-size: 13px; color: rgba(255,255,255,0.45); }
/* 删除做成卡内文字链接：不再有按钮盒，也就不会被卡片边缘压住 */
.wm-rogue-link { position: absolute; right: 10px; bottom: 8px; font-size: 15px; cursor: pointer;
	color: rgba(255,150,140,0.9); text-decoration: underline; user-select: none; }
.wm-rogue-link:hover { color: #ff6b57; }
/* 按钮统一用 flex 居中：inline-block + line-height 在主题环境里不能保证文字在盒子正中 */
.wm-rogue-btn { display: inline-flex; align-items: center; justify-content: center; box-sizing: border-box;
	padding: 6px 18px; border-radius: 4px; cursor: pointer; text-align: center;
	font-size: 18px; line-height: 1.2; color: #fff; white-space: nowrap; user-select: none;
	background: linear-gradient(rgba(90,90,90,0.9), rgba(50,50,50,0.95));
	border: 1px solid rgba(255,255,255,0.28); box-shadow: 0 1px 3px rgba(0,0,0,0.6); }
.wm-rogue-btn:hover { border-color: rgba(255,200,120,0.9); }
.wm-rogue-btn.wm-rogue-small { padding: 4px 14px; font-size: 15px; }
.wm-rogue-btn.wm-rogue-danger { background: linear-gradient(rgba(150,60,50,0.92), rgba(90,30,25,0.95)); }
#wm-rogue-overlay.wm-rogue-stat-overlay .wm-rogue-stage { padding: 20px 12px; }
#wm-rogue-overlay.wm-rogue-stat-overlay .wm-rogue-stat-panel { width: min(520px, calc(100% - 24px)); padding: 20px; border-radius: 8px; background: linear-gradient(rgba(28,28,28,0.96), rgba(12,12,12,0.98)); border: 1px solid rgba(255,255,255,0.18); box-shadow: 0 6px 24px rgba(0,0,0,0.6); }
#wm-rogue-overlay.wm-rogue-stat-overlay .wm-rogue-stat-title { display: block !important; margin: 0; text-align: center; font-size: 26px; line-height: 1.3; font-weight: bold; letter-spacing: 5px; color: #fff; text-shadow: 0 2px 4px rgba(0,0,0,0.85); }
#wm-rogue-overlay.wm-rogue-stat-overlay .wm-rogue-stat-divider { display: block !important; height: 1px; margin: 14px 0 18px; background: rgba(255,255,255,0.22); }
#wm-rogue-overlay.wm-rogue-stat-overlay .wm-rogue-stat-detail { display: block !important; margin-top: 16px; padding-top: 0; border-top: 0; }
#wm-rogue-overlay.wm-rogue-stat-overlay .wm-rogue-stat-detail-name { display: block !important; }
#wm-rogue-overlay.wm-rogue-stat-overlay .wm-rogue-stat-detail-name { font-size: 19px; font-weight: bold; color: #ffd479; }
#wm-rogue-overlay.wm-rogue-stat-overlay .wm-rogue-stat-detail-effect { margin-top: 4px; font-size: 16px; color: rgba(255,255,255,0.88); }

/* 浮层内的自建弹层：本体对话框会被浮层（z-index 9998）压住，所以浮层当前时改用自建弹层 */
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
/* 分区标题行：标题靠左、该分区的操作按钮靠右，刷新按钮就属于「技能商店」这一区 */
.wm-rogue-shop-section-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.wm-rogue-shop-section-row .wm-rogue-shop-section-title { margin-right: auto; }
/* 宽度按「本局已购买」这种最长文案定，切换状态时不跟着抖 */
.wm-rogue-shop-refresh { flex: none; min-width: 116px; }
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

/* ---- 选择玩法：两张卡，点整张卡即选中 ---- */
.wm-rogue-modes { display: flex; flex-direction: column; margin: auto; width: min(860px, calc(100% - 24px)); }
.wm-rogue-mode-cards { display: flex; flex-wrap: wrap; gap: 16px; }
.wm-rogue-mode-card { flex: 1 1 340px; min-width: 0; box-sizing: border-box; padding: 20px 22px; border-radius: 10px;
	cursor: pointer; text-align: center;
	background: linear-gradient(rgba(22,22,22,0.82), rgba(0,0,0,0.88));
	border: 1px solid rgba(255,255,255,0.14); box-shadow: 0 2px 10px rgba(0,0,0,0.5); }
.wm-rogue-mode-card:hover { border-color: rgba(255,180,80,0.75); }
.wm-rogue-mode-name { font-size: 26px; font-weight: bold; color: #fff; letter-spacing: 4px;
	text-shadow: 0 2px 5px rgba(0,0,0,0.9); }
.wm-rogue-mode-line { margin-top: 10px; font-size: 16px; color: rgba(255,255,255,0.85); }
.wm-rogue-mode-best { margin-top: 10px; font-size: 16px; color: #ffd479; }
.wm-rogue-mode-go { display: inline-flex; align-items: center; justify-content: center; margin-top: 16px;
	padding: 10px 40px; border-radius: 4px; font-size: 19px; color: #fff;
	background: linear-gradient(rgba(150,105,40,0.95), rgba(100,65,20,0.95));
	border: 1px solid rgba(255,200,120,0.75); }
/* 商店资源栏第三块「技能 n/3」是入口：给足可点的视觉反馈 */
.wm-rogue-res-cell.wm-rogue-res-skill { cursor: pointer; }
.wm-rogue-res-cell.wm-rogue-res-skill:hover { border-color: rgba(255,200,120,0.8); }
.wm-rogue-res-cell.wm-rogue-res-skill:active { opacity: 0.8; }
.wm-rogue-res-cell.wm-rogue-res-skill .wm-rogue-res-label { color: #ffd479; }

/* ---- 肉鸽营地（主界面）：同一条视觉语言，居中一张营地卡 ---- */
/* margin:auto 让它在居中层里真正居中（flex 的 align-items:stretch 会把它拉满高、顶到最上面） */
.wm-rogue-hub { display: flex; flex-direction: column; margin: auto; width: min(760px, calc(100% - 24px)); }
/* 角色名跟在「当前成长」标题下面，作为这一块的归属说明 */
.wm-rogue-hub-who { margin: -2px 0 10px; font-size: 16px; color: #ffd479; letter-spacing: 1px; }
.wm-rogue-hub-level { margin-top: 8px; font-size: 30px; font-weight: bold; color: #fff; text-align: center;
	letter-spacing: 2px; text-shadow: 0 2px 5px rgba(0,0,0,0.9); }
.wm-rogue-hub-mode { margin-top: 5px; font-size: 15px; color: rgba(255,255,255,0.62); text-align: center;
	letter-spacing: 4px; }
.wm-rogue-hub-section-title { margin: 18px 0 8px; font-size: 20px; font-weight: bold; color: #fff;
	letter-spacing: 3px; text-shadow: 0 2px 4px rgba(0,0,0,0.9); }
.wm-rogue-hub-actions { display: flex; flex-wrap: wrap; justify-content: center; gap: 12px; margin-top: 20px; }
.wm-rogue-btn.wm-rogue-hub-primary { padding: 12px 44px; font-size: 22px; border-color: rgba(255,200,120,0.8);
	background: linear-gradient(rgba(160,110,40,0.95), rgba(110,70,20,0.95)); }
/* 商店用蓝：与金色的「开始下一关」分开，也不再和灰色次级按钮混在一起 */
.wm-rogue-btn.wm-rogue-hub-shop { padding: 12px 34px; font-size: 20px; border-color: rgba(150,205,255,0.75);
	background: linear-gradient(rgba(62,116,168,0.95), rgba(30,64,104,0.95)); }
/* 营地两个次级按钮：比 wm-rogue-small 更长，字号比商店（20）小两号，尺寸旋钮就这一行（padding 的左右值管长度，font-size 一起管字与高） */
.wm-rogue-btn.wm-rogue-hub-secondary { padding: 8px 40px; font-size: 18px; }
.wm-rogue-hub-hint { margin-top: 10px; font-size: 14px; color: #ffb347; text-align: center; }
/* 营地窄一些，属性卡三张要排成一行 */
.wm-rogue-hub .wm-rogue-stat-card { flex: 1 1 200px; }
/* 营地的属性卡是只读的：去掉底部操作行后整体更矮 */
.wm-rogue-stat-card.wm-rogue-stat-read { padding-bottom: 12px; }

/* ---- 技能查看页（只读）：复用商店卡片 ---- */
.wm-rogue-skills { display: flex; flex-direction: column; margin: auto; width: min(1100px, calc(100% - 24px)); }
.wm-rogue-skills-empty { margin: 34px 0 0; font-size: 20px; color: rgba(255,255,255,0.72); text-align: center; }
.wm-rogue-skills-hint { margin-top: 10px; font-size: 15px; color: rgba(255,255,255,0.5); text-align: center; }
/* 查看页显示完整描述，不再限 5 行 */
.wm-rogue-shop-desc.wm-rogue-desc-full { max-height: none; }
.wm-rogue-shop-card.wm-rogue-shop-card-read { cursor: default; }

/* ---- 战斗结算页：大标题 + 奖励分行 ---- */
.wm-rogue-result { margin: auto; width: min(620px, calc(100% - 24px)); padding: 30px 34px 26px; border-radius: 10px;
	text-align: center; box-sizing: border-box;
	background: linear-gradient(rgba(24,24,24,0.92), rgba(8,8,8,0.95));
	border: 1px solid rgba(255,255,255,0.16); box-shadow: 0 6px 26px rgba(0,0,0,0.65); }
.wm-rogue-result-mark { font-size: 56px; line-height: 1; font-weight: bold; }
.wm-rogue-result.wm-rogue-win .wm-rogue-result-mark { color: #7ee08a; text-shadow: 0 0 18px rgba(120,240,140,0.5); }
.wm-rogue-result.wm-rogue-lose .wm-rogue-result-mark { color: #ff7a6b; text-shadow: 0 0 18px rgba(255,110,90,0.45); }
.wm-rogue-result-title { margin-top: 10px; font-size: 34px; font-weight: bold; color: #fff;
	letter-spacing: 6px; text-shadow: 0 2px 6px rgba(0,0,0,0.9); }
.wm-rogue-result-sub { margin-top: 8px; font-size: 17px; color: rgba(255,255,255,0.72); }
.wm-rogue-result-section { margin-top: 22px; font-size: 15px; color: rgba(255,255,255,0.55); letter-spacing: 4px; }
.wm-rogue-result-row { margin-top: 8px; font-size: 26px; font-weight: bold; color: #ffd479;
	text-shadow: 0 1px 4px rgba(0,0,0,0.9); }
.wm-rogue-result-line { margin-top: 10px; font-size: 16px; color: rgba(255,255,255,0.82); }
.wm-rogue-result-next { margin-top: 20px; font-size: 19px; color: #fff; letter-spacing: 2px; }
.wm-rogue-result-actions { display: flex; justify-content: center; margin-top: 24px; }
.wm-rogue-btn.wm-rogue-result-btn { padding: 12px 46px; font-size: 21px; border-color: rgba(255,200,120,0.75);
	background: linear-gradient(rgba(150,105,40,0.95), rgba(100,65,20,0.95)); }

/* ---- 替换技能页：新技能居中突出，下面三张已有技能卡等宽横排 ----
   层级：标题 28 > 新技能卡（名 26、强调边框光晕）> 区域标题 24 > 已有卡（名 22）
   > 描述 17 / 箭头与说明 14~15 */
.wm-rogue-replace { display: flex; flex-direction: column; margin: auto; width: min(1100px, calc(100% - 24px)); }
#wm-rogue-overlay.wm-rogue-replace-overlay .wm-rogue-title { font-size: 28px; letter-spacing: 5px; }
.wm-rogue-replace-subtitle { margin: 0 0 12px; font-size: 14px; color: rgba(255,255,255,0.58); text-align: center; }
.wm-rogue-replace-slot { margin-left: auto; font-size: 16px; color: #ffd479; }
/* 新技能卡：加宽居中 + 暖色边框光晕，名字随卡片放大 */
.wm-rogue-replace-new { width: min(640px, 100%); margin: 0 auto; cursor: default;
	border-color: rgba(255,200,120,0.6);
	box-shadow: 0 0 18px rgba(255,180,80,0.15), 0 2px 10px rgba(0,0,0,0.5); }
.wm-rogue-replace-new .wm-rogue-shop-name { font-size: 26px; color: #ffe2a8; }
.wm-rogue-replace-arrow { margin: 16px 0 10px; font-size: 15px; letter-spacing: 4px; text-align: center;
	color: rgba(255,255,255,0.55); }
/* 三张已有技能卡：等宽横排、窄屏换行；描述限高防止一张卡把别张挤乱，按钮钉底对齐 */
.wm-rogue-replace-cards { display: flex; flex-wrap: wrap; gap: 12px; align-items: stretch; }
.wm-rogue-replace-card { flex: 1 1 260px; transition: transform 0.12s ease, border-color 0.12s ease; }
.wm-rogue-replace-card:hover { border-color: rgba(255,180,80,0.75); transform: translateY(-2px); }
.wm-rogue-replace-card:active { transform: translateY(0); }
.wm-rogue-btn.wm-rogue-replace-btn { flex: 1 1 auto; padding: 8px 12px; font-size: 17px; }

/* ---- 战斗恢复页：未正常结算的战斗原样恢复；琥珀色提示是「待恢复」而非报错 ----
   层级：标题 32 > 信息卡（关 30 > 提示 15 > 敌人/规则 14~15）> 按钮
   高度旋钮（手机端整框偏高/偏矮只改这几处）：面板 padding、mark 字号、card 的 margin/padding、actions 的 margin-top */
.wm-rogue-resume { display: flex; flex-direction: column; margin: auto; width: min(620px, calc(100% - 24px));
	padding: 22px 26px 20px; border-radius: 10px; text-align: center; box-sizing: border-box;
	background: linear-gradient(rgba(24,24,24,0.92), rgba(8,8,8,0.95));
	border: 1px solid rgba(255,255,255,0.16); box-shadow: 0 6px 26px rgba(0,0,0,0.65); }
.wm-rogue-resume-mark { font-size: 38px; line-height: 1; font-weight: bold; color: #ffb347;
	text-shadow: 0 0 16px rgba(255,180,80,0.4); }
.wm-rogue-resume-title { margin-top: 6px; font-size: 32px; font-weight: bold; color: #fff;
	letter-spacing: 5px; text-shadow: 0 2px 6px rgba(0,0,0,0.9); }
/* 状态卡：边框用琥珀色与普通卡片区分，整体仍是半透明深色面板 */
.wm-rogue-resume-card { margin-top: 14px; padding: 14px 16px; border-radius: 8px;
	background: linear-gradient(rgba(22,22,22,0.8), rgba(0,0,0,0.86));
	border: 1px solid rgba(255,180,80,0.4); box-shadow: 0 2px 10px rgba(0,0,0,0.5); }
.wm-rogue-resume-mode { font-size: 14px; color: rgba(255,255,255,0.62); letter-spacing: 4px; }
.wm-rogue-resume-level { margin-top: 6px; font-size: 30px; font-weight: bold; color: #fff;
	text-shadow: 0 2px 5px rgba(0,0,0,0.9); }
.wm-rogue-resume-hint { margin-top: 8px; font-size: 15px; color: #ffd08a; }
.wm-rogue-resume-section { margin-top: 14px; font-size: 14px; color: rgba(255,255,255,0.55); letter-spacing: 3px; }
/* 敌人：只读展示存档里保存的角色（头像复用商店的 .wm-rogue-shop-avatar） */
.wm-rogue-resume-enemies { display: flex; flex-wrap: wrap; justify-content: center; gap: 12px; margin-top: 10px; }
.wm-rogue-resume-enemy { display: flex; flex-direction: column; align-items: center; gap: 5px; width: 64px; }
.wm-rogue-resume-enemy-name { max-width: 64px; font-size: 14px; color: rgba(255,255,255,0.85);
	overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wm-rogue-resume-actions { display: flex; flex-direction: column; align-items: center; gap: 12px; margin-top: 16px; }
.wm-rogue-btn.wm-rogue-resume-primary { padding: 11px 46px; font-size: 21px; border-color: rgba(255,200,120,0.75);
	background: linear-gradient(rgba(150,105,40,0.95), rgba(100,65,20,0.95)); }

/* ---- 事件页：胜利后触发的随机事件。大图 + 名称 + 描述 + 纵排选项 ---- */
.wm-rogue-event { display: flex; flex-direction: column; align-items: center; margin: auto;
	width: min(560px, calc(100% - 24px)); padding: 26px 28px 24px; border-radius: 10px;
	text-align: center; box-sizing: border-box;
	background: linear-gradient(rgba(24,24,24,0.92), rgba(8,8,8,0.95));
	border: 1px solid rgba(255,255,255,0.16); box-shadow: 0 6px 26px rgba(0,0,0,0.65); }
.wm-rogue-event-art { width: 200px; height: 200px; border-radius: 10px; margin-bottom: 16px;
	background-size: cover; background-position: center;
	border: 1px solid rgba(255,200,120,0.45); box-shadow: 0 0 22px rgba(120,110,255,0.25), 0 2px 10px rgba(0,0,0,0.6); }
.wm-rogue-event-name { font-size: 30px; font-weight: bold; color: #fff; letter-spacing: 5px;
	text-shadow: 0 2px 6px rgba(0,0,0,0.9); }
.wm-rogue-event-desc { margin-top: 10px; font-size: 17px; line-height: 1.6; color: rgba(255,255,255,0.85); }
.wm-rogue-event-actions { display: flex; flex-direction: column; align-items: stretch; gap: 10px;
	margin-top: 22px; width: 100%; }
.wm-rogue-btn.wm-rogue-event-choice { padding: 11px 18px; font-size: 19px; border-color: rgba(255,200,120,0.55);
	background: linear-gradient(rgba(70,62,96,0.92), rgba(40,36,64,0.95)); }
.wm-rogue-btn.wm-rogue-event-choice:hover { border-color: rgba(255,200,120,0.9); }

/* ---- 图鉴页：已发现事件 + 曾拥有过的奇物，未收录的条目显示剪影 ---- */
.wm-rogue-index { display: flex; flex-direction: column; margin: auto; width: min(1100px, calc(100% - 24px)); }
.wm-rogue-index-body { padding: 0 4px 10px 2px; }
.wm-rogue-index-sub { margin-bottom: 4px; font-size: 15px; color: rgba(255,255,255,0.6); letter-spacing: 3px; }
.wm-rogue-index-section { margin: 14px 0 8px; font-size: 22px; font-weight: bold; color: #fff;
	letter-spacing: 3px; text-shadow: 0 2px 4px rgba(0,0,0,0.9); }
.wm-rogue-index-cards { display: flex; flex-wrap: wrap; gap: 12px; }
.wm-rogue-index-card { flex: 1 1 190px; min-width: 0; box-sizing: border-box; padding: 12px;
	border-radius: 8px; text-align: center;
	background: linear-gradient(rgba(22,22,22,0.80), rgba(0,0,0,0.86));
	border: 1px solid rgba(255,255,255,0.14); box-shadow: 0 2px 10px rgba(0,0,0,0.5); }
.wm-rogue-index-card.wm-rogue-index-known { border-color: rgba(255,200,120,0.55); }
.wm-rogue-index-art { width: 96px; height: 96px; margin: 0 auto 10px; border-radius: 8px;
	background-size: cover; background-position: center; display: flex; align-items: center; justify-content: center;
	border: 1px solid rgba(255,255,255,0.18); background-color: rgba(255,255,255,0.06); }
.wm-rogue-index-known .wm-rogue-index-art { border-color: rgba(255,200,120,0.6);
	box-shadow: 0 0 14px rgba(255,180,80,0.18); }
.wm-rogue-index-unknown { font-size: 22px; letter-spacing: 3px; color: rgba(255,255,255,0.4); }
.wm-rogue-index-name { font-size: 19px; font-weight: bold; color: #fff; text-shadow: 0 1px 3px rgba(0,0,0,0.9); }
.wm-rogue-index-tag { display: inline-flex; margin-top: 5px; padding: 1px 10px; border-radius: 10px;
	font-size: 13px; color: #ffd479; border: 1px solid rgba(255,200,120,0.5); }
.wm-rogue-index-desc { margin-top: 7px; font-size: 14px; line-height: 1.5; color: rgba(255,255,255,0.72); }

/* ---- 奇物查看页（只读，入口在商店顶部「奇物 n」资源块）：复用商店卡片 ---- */
.wm-rogue-curios { display: flex; flex-direction: column; margin: auto; width: min(1100px, calc(100% - 24px)); }
.wm-rogue-curios-body { padding: 0 4px 10px 2px; }

/* ---- 奇物卡（商店内与查看页共用）---- */
.wm-rogue-curio-art { flex: none; width: 64px; height: 64px; border-radius: 6px;
	background-size: cover; background-position: center;
	border: 1px solid rgba(255,255,255,0.25); box-shadow: 0 0 12px rgba(120,110,255,0.22); }
.wm-rogue-curio-rarity { margin-left: auto; padding: 1px 10px; border-radius: 10px; font-size: 13px;
	color: #ffd479; border: 1px solid rgba(255,200,120,0.5); white-space: nowrap; }
.wm-rogue-curio-effect { margin-top: 7px; font-size: 15px; line-height: 1.5; color: #9fd8ff;
	white-space: pre-line; }
.wm-rogue-shop-subtitle.wm-rogue-curio-hint { color: rgba(255,180,80,0.85); }
/* 商店资源行第四块「奇物 n」：与「技能 n/3」同一套入口视觉 */
.wm-rogue-res-cell.wm-rogue-res-curio { cursor: pointer; }
.wm-rogue-res-cell.wm-rogue-res-curio:hover { border-color: rgba(255,200,120,0.8); }
.wm-rogue-res-cell.wm-rogue-res-curio:active { opacity: 0.8; }
.wm-rogue-res-cell.wm-rogue-res-curio .wm-rogue-res-label { color: #9fd8ff; }

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
/* 弹层的盒与行必须钉回 block：主题的裸 div{display:inline-block} 会把多行提示挤成一行
   （真机实录：奇物弹层的「名称行」与「效果行」并排成了一句） */
#wm-rogue-overlay .wm-rogue-popup-box,
#wm-rogue-overlay .wm-rogue-popup-line { display: block !important; }
#wm-rogue-overlay .wm-rogue-popup-actions { display: flex !important; }
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
#wm-rogue-overlay .wm-rogue-shop-section-row { display: flex !important; align-items: center !important; justify-content: space-between !important; }
.wm-rogue-btn { display: inline-flex !important; align-items: center !important; justify-content: center !important;
	text-align: center !important; box-sizing: border-box !important; line-height: 1.2 !important; }
/* 返回按钮：尺寸写死成固定盒子。想继续调大调小，只改这里的 width/height/font-size 三个数 */
#wm-rogue-overlay .wm-rogue-back .wm-rogue-btn {
	display: inline-flex !important;
	align-items: center !important;
	justify-content: center !important;
	box-sizing: border-box !important;
	width: 96px !important;
	height: 42px !important;
	font-size: 21px !important;
	padding: 0 !important;
	margin: 0 !important;
	min-width: 0 !important;
	min-height: 0 !important;
	text-align: center !important;
}
#wm-rogue-overlay.wm-rogue-shop-overlay { overflow: hidden !important; }
#wm-rogue-overlay .wm-rogue-shop,
#wm-rogue-overlay .wm-rogue-shop-card,
#wm-rogue-overlay .wm-rogue-stat-card,
#wm-rogue-overlay .wm-rogue-hub,
#wm-rogue-overlay .wm-rogue-skills,
#wm-rogue-overlay .wm-rogue-curios,
#wm-rogue-overlay .wm-rogue-replace,
#wm-rogue-overlay .wm-rogue-resume,
#wm-rogue-overlay .wm-rogue-event,
#wm-rogue-overlay .wm-rogue-index,
#wm-rogue-overlay .wm-rogue-modes { display: flex !important; flex-direction: column !important; }
#wm-rogue-overlay .wm-rogue-shop-cards,
#wm-rogue-overlay .wm-rogue-stat-cards,
#wm-rogue-overlay .wm-rogue-hub-actions,
#wm-rogue-overlay .wm-rogue-mode-cards,
#wm-rogue-overlay .wm-rogue-replace-cards,
#wm-rogue-overlay .wm-rogue-resume-enemies,
#wm-rogue-overlay .wm-rogue-index-cards,
#wm-rogue-overlay .wm-rogue-res { display: flex !important; flex-wrap: wrap !important; }
#wm-rogue-overlay .wm-rogue-resume-enemy,
#wm-rogue-overlay .wm-rogue-resume-actions,
#wm-rogue-overlay .wm-rogue-event-actions { display: flex !important; flex-direction: column !important;
	align-items: center !important; }
#wm-rogue-overlay .wm-rogue-event-actions { align-items: stretch !important; }
#wm-rogue-overlay .wm-rogue-shop-top,
#wm-rogue-overlay .wm-rogue-shop-foot,
#wm-rogue-overlay .wm-rogue-stat-head,
#wm-rogue-overlay .wm-rogue-stat-foot,
#wm-rogue-overlay .wm-rogue-result-actions { display: flex !important; flex-wrap: nowrap !important; }
#wm-rogue-overlay .wm-rogue-shop-head,
#wm-rogue-overlay .wm-rogue-shop-body,
#wm-rogue-overlay .wm-rogue-hub-body,
#wm-rogue-overlay .wm-rogue-skills-body,
#wm-rogue-overlay .wm-rogue-curios-body,
#wm-rogue-overlay .wm-rogue-replace-body,
#wm-rogue-overlay .wm-rogue-index-body,
#wm-rogue-overlay .wm-rogue-res-cell,
#wm-rogue-overlay .wm-rogue-shop-avatar,
#wm-rogue-overlay .wm-rogue-stat-effects,
#wm-rogue-overlay .wm-rogue-event-art,
#wm-rogue-overlay .wm-rogue-index-art,
#wm-rogue-overlay .wm-rogue-curio-art { display: block !important; }
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
#wm-rogue-overlay .wm-rogue-res-label,
#wm-rogue-overlay .wm-rogue-hub-level,
#wm-rogue-overlay .wm-rogue-hub-mode,
#wm-rogue-overlay .wm-rogue-hub-section-title,
#wm-rogue-overlay .wm-rogue-hub-hint,
#wm-rogue-overlay .wm-rogue-skills-empty,
#wm-rogue-overlay .wm-rogue-skills-hint,
#wm-rogue-overlay .wm-rogue-replace-subtitle,
#wm-rogue-overlay .wm-rogue-replace-slot,
#wm-rogue-overlay .wm-rogue-replace-arrow,
#wm-rogue-overlay .wm-rogue-resume-mark,
#wm-rogue-overlay .wm-rogue-resume-title,
#wm-rogue-overlay .wm-rogue-resume-card,
#wm-rogue-overlay .wm-rogue-resume-mode,
#wm-rogue-overlay .wm-rogue-resume-level,
#wm-rogue-overlay .wm-rogue-resume-hint,
#wm-rogue-overlay .wm-rogue-resume-section,
#wm-rogue-overlay .wm-rogue-resume-enemy-name,
#wm-rogue-overlay .wm-rogue-result,
#wm-rogue-overlay .wm-rogue-result-mark,
#wm-rogue-overlay .wm-rogue-result-title,
#wm-rogue-overlay .wm-rogue-result-sub,
#wm-rogue-overlay .wm-rogue-result-section,
#wm-rogue-overlay .wm-rogue-result-row,
#wm-rogue-overlay .wm-rogue-result-line,
#wm-rogue-overlay .wm-rogue-result-next,
#wm-rogue-overlay .wm-rogue-event-name,
#wm-rogue-overlay .wm-rogue-event-desc,
#wm-rogue-overlay .wm-rogue-index-sub,
#wm-rogue-overlay .wm-rogue-index-section,
#wm-rogue-overlay .wm-rogue-index-unknown,
#wm-rogue-overlay .wm-rogue-index-name,
#wm-rogue-overlay .wm-rogue-index-desc,
#wm-rogue-overlay .wm-rogue-curio-effect,
#wm-rogue-overlay .wm-rogue-mode-name,
#wm-rogue-overlay .wm-rogue-mode-line,
#wm-rogue-overlay .wm-rogue-mode-best { display: block !important; }
#wm-rogue-overlay .wm-rogue-mode-go { display: inline-flex !important; align-items: center !important; justify-content: center !important; }
#wm-rogue-overlay .wm-rogue-hub-who { display: block !important; }
#wm-rogue-overlay .wm-rogue-shop-desc,
#wm-rogue-overlay .wm-rogue-shop-owner,
#wm-rogue-overlay .wm-rogue-shop-subtitle,
#wm-rogue-overlay .wm-rogue-stat-effect,
#wm-rogue-overlay .wm-rogue-hub-hint,
#wm-rogue-overlay .wm-rogue-skills-empty,
#wm-rogue-overlay .wm-rogue-skills-hint,
#wm-rogue-overlay .wm-rogue-replace-subtitle,
#wm-rogue-overlay .wm-rogue-replace-arrow,
#wm-rogue-overlay .wm-rogue-resume-hint,
#wm-rogue-overlay .wm-rogue-event-desc,
#wm-rogue-overlay .wm-rogue-index-desc,
#wm-rogue-overlay .wm-rogue-result-line,
#wm-rogue-overlay .wm-rogue-mode-line,
#wm-rogue-overlay .wm-rogue-mode-best { white-space: normal !important; overflow-wrap: break-word !important; }
#wm-rogue-overlay .wm-rogue-name { white-space: nowrap !important; }
#wm-rogue-overlay .wm-rogue-no { white-space: nowrap !important; }
#wm-rogue-overlay .wm-rogue-resume-enemy-name { white-space: nowrap !important; }
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
