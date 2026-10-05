// 肉鸽页面共用的骨架。两种承载方式，二选一：
//
// A. 本体 Dialog（openScreen / adoptScreen）——适合内容简单的页面（Hub、商店、结果、选角色）。
//    注意本体 layout.css：.dialog .content { font-size:0 }，只有 .content > * 才拿回字号，
//    所以条目要平铺成 dialog.content 的直接子节点，别套自定义布局容器。
//
// B. 自建浮层（openOverlay）——适合需要自定义版式的页面（存档页的卡片网格）。
//    挂在 document.body 上、用 src/ui/overlay.js 的 bindTap + isolateOverlayTouch，
//    与那里的更新日志浮层同一套机制；这样不会被 #window 内的主题样式压掉（真机踩过两轮）。
//
// 两种方式共用一套页面栈：同一时刻只有一个肉鸽页面存在。

import { lib, ui, get } from "../../../../../noname.js";
import { bindTap, isolateOverlayTouch } from "../../ui/overlay.js";
import { ensureRogueStyles } from "./styles.js";
import { STAT_IDS } from "../config.js";
import { describeStat } from "../data/stats.js";
import { abyssAffixInfo } from "../endless/abyssAffixes.js";

/** @type {{ node: any, kind: "dialog" | "overlay", page: string } | null} */
let currentScreen = null;
/** 上一次页面关闭时的滚动位置，只在同一页重绘后还回去（换页该从顶部开始） */
let lastScroll = null;

/** 关闭当前页面 */
export function closeScreen() {
	if (!currentScreen) {
		return;
	}
	const { node, kind, page } = currentScreen;
	currentScreen = null;
	const scroller = kind === "overlay" ? node : node.contentContainer;
	lastScroll = { page, top: Math.max(0, scroller?.scrollTop ?? 0) };
	if (kind === "overlay") {
		node.remove();
	} else {
		node.delete();
	}
}

/** 重绘后把滚动位置还回去（内容变短时浏览器会自动夹紧） */
function restoreScroll(node, kind, page) {
	if (!lastScroll || lastScroll.page !== page || !lastScroll.top) {
		return;
	}
	const top = lastScroll.top;
	const scroller = kind === "overlay" ? node : node.contentContainer;
	setTimeout(() => {
		if (scroller) {
			scroller.scrollTop = top;
		}
	}, 0);
}

/** 当前页面根节点（对话框或浮层），测试与调试用 */
export function currentScreenNode() {
	return currentScreen ? currentScreen.node : null;
}

/**
 * 打开一个本体对话框页面。
 * @param {string} [title] 顶部标题；传空则不画标题行（页面自带标题栏时用）
 * @returns {object} 直接往里挂条目的容器（dialog.content）
 */
export function openScreen(title) {
	closeScreen();
	const dialog = ui.create.dialog("hidden");
	dialog.classList.add("fixed");
	dialog.classList.add("fullwidth");
	dialog.classList.add("fullheight");
	dialog.classList.add("noupdate");
	if (title) {
		dialog.addText(title, true);
		dialog.add(ui.create.div(".placeholder"));
	}
	currentScreen = { node: dialog, kind: "dialog", page: title ?? "" };
	dialog.open();
	restoreScroll(dialog, "dialog", title ?? "");
	return dialog.content;
}

/**
 * 接管一个本体自建的对话框（如 ui.create.characterDialog）作为当前页面。
 */
export function adoptScreen(dialog, page = "adopt") {
	closeScreen();
	currentScreen = { node: dialog, kind: "dialog", page };
	dialog.open();
	restoreScroll(dialog, "dialog", page);
	return dialog;
}

/**
 * 打开一个自建浮层页面（挂 document.body）。
 * 结构分两层：浮层自己只负责滚动与遮罩，里面再套一层 .wm-rogue-stage 做居中——
 * 滚动层与居中层分开，内容矮时居中、内容高时从顶部开始滚动，不用固定 top/transform。
 * @param {string} [extraClass] 追加到浮层根节点的类名（如手机窄屏、商店）
 * @returns {HTMLDivElement} .wm-rogue-stage，往里挂 .wm-rogue-* 结构
 */
export function openOverlay(extraClass) {
	closeScreen();
	ensureRogueStyles();
	// 清掉可能残留的旧浮层（重复进入、异常退出都可能留下）
	for (const node of document.querySelectorAll(".wm-rogue-overlay")) {
		node.remove();
	}
	const overlay = document.createElement("div");
	overlay.id = "wm-rogue-overlay";
	overlay.className = extraClass ? `wm-rogue-overlay ${extraClass}` : "wm-rogue-overlay";
	document.body.appendChild(overlay);
	// 本体在 document 上无条件 preventDefault 所有 touchmove，会让浮层内的原生滚动失效，
	// 也会把滑动记成全局手势；这里按 overlay.js 的做法把浮层内的触摸事件隔离掉
	isolateOverlayTouch(overlay);
	const stage = document.createElement("div");
	stage.className = "wm-rogue-stage";
	overlay.appendChild(stage);
	const page = `overlay:${extraClass ?? ""}`;
	currentScreen = { node: overlay, kind: "overlay", page };
	restoreScroll(overlay, "overlay", page);
	return stage;
}

/** 一行文字：正文自己带 <b>，说明行不带 */
export function addLine(parent, html) {
	return ui.create.div(".text", html, parent);
}

/** 分组之间的空行 */
export function addGap(parent) {
	return ui.create.div(".placeholder", parent);
}

/**
 * 浮层的「点框外退出」：目标是否在面板内按父链判断，不依赖 DOM contains；
 * 事件缺失（测试桩直接调监听）按框外处理。
 */
function bindOutsideTapClose(overlay, panel) {
	bindTap(overlay, event => {
		for (let node = event?.target; node; node = node.parentNode) {
			if (node === panel) {
				return;
			}
		}
		closeScreen();
	});
}

/** 「防御 Lv.3」标题 + 逐条效果，玩家与敌人的面板共用同一版式 */
function addStatDetail(parent, info) {
	const section = document.createElement("div");
	section.className = "wm-rogue-stat-detail";
	const heading = document.createElement("div");
	heading.className = "wm-rogue-stat-detail-name";
	heading.textContent = `${info.name} Lv.${info.level}`;
	section.appendChild(heading);
	for (const line of info.lines) {
		const effect = document.createElement("div");
		effect.className = "wm-rogue-stat-detail-effect";
		effect.textContent = line;
		section.appendChild(effect);
	}
	parent.appendChild(section);
}

/** 玩家战斗里的属性强化面板 */
export function showBattleStats(run) {
	const stage = openOverlay("wm-rogue-stat-overlay");
	const panel = document.createElement("div");
	panel.className = "wm-rogue-panel wm-rogue-stat-panel";
	stage.appendChild(panel);
	const title = document.createElement("div");
	title.className = "wm-rogue-stat-title";
	title.textContent = "属性强化";
	panel.appendChild(title);
	const divider = document.createElement("div");
	divider.className = "wm-rogue-stat-divider";
	panel.appendChild(divider);
	for (const statId of STAT_IDS) {
		addStatDetail(panel, describeStat(statId, run?.stats?.[statId]));
	}
	// 没有「关闭」按钮：点面板以外的遮罩区域直接退出（轻触/点击都走 bindTap）
	bindOutsideTapClose(stage.parentNode, panel);
	return stage;
}

/**
 * 敌人身上「强化」徽记点开的面板：属性强化与玩家那份同一个版式，
 * 再补一段深渊词缀——先一排徽记给出「［深渊·坚壁］［深渊·狂热］」的总览，下面逐条给描述。
 * 数据全部取自这个 Player（battle.js 在 applyEnemyModifiers 里写进 rogueEnhanceInfo），
 * 所以异常退出恢复战斗之后，显示的内容和开战当时完全一致。
 * @param {object} player 敌方 Player
 */
export function showEnemyEnhance(player) {
	const stage = openOverlay("wm-rogue-stat-overlay");
	const panel = document.createElement("div");
	panel.className = "wm-rogue-panel wm-rogue-stat-panel";
	stage.appendChild(panel);
	const info = player?.rogueEnhanceInfo ?? {};
	const title = document.createElement("div");
	title.className = "wm-rogue-stat-title";
	title.textContent = translateCharacter(player?.name ?? "");
	panel.appendChild(title);
	const subtitle = document.createElement("div");
	subtitle.className = "wm-rogue-stat-subtitle";
	subtitle.textContent = "敌人强化";
	panel.appendChild(subtitle);
	const divider = document.createElement("div");
	divider.className = "wm-rogue-stat-divider";
	panel.appendChild(divider);

	for (const statId of STAT_IDS) {
		addStatDetail(panel, describeStat(statId, info.stats?.[statId]));
	}

	const ids = Array.isArray(info.abyss) ? info.abyss : [];
	const sectionTitle = document.createElement("div");
	sectionTitle.className = "wm-rogue-stat-section-title";
	sectionTitle.textContent = "深渊强化";
	panel.appendChild(sectionTitle);
	if (!ids.length) {
		const none = document.createElement("div");
		none.className = "wm-rogue-stat-detail-effect";
		none.textContent = "未被深渊强化";
		panel.appendChild(none);
	} else {
		// 徽记行：一眼看全这个敌人身上有哪几个词缀
		const badges = document.createElement("div");
		badges.className = "wm-rogue-abyss-badges";
		for (const id of ids) {
			const affix = abyssAffixInfo(id);
			const badge = document.createElement("div");
			badge.className = "wm-rogue-abyss-badge";
			badge.textContent = `［${affix ? affix.name : id}］`;
			badges.appendChild(badge);
		}
		panel.appendChild(badges);
		for (const id of ids) {
			const affix = abyssAffixInfo(id);
			const section = document.createElement("div");
			section.className = "wm-rogue-stat-detail";
			const heading = document.createElement("div");
			heading.className = "wm-rogue-stat-detail-name";
			heading.textContent = affix ? affix.name : id;
			section.appendChild(heading);
			const effect = document.createElement("div");
			effect.className = "wm-rogue-stat-detail-effect";
			effect.textContent = affix ? affix.desc : "（该深渊强化已下架）";
			section.appendChild(effect);
			panel.appendChild(section);
		}
	}
	bindOutsideTapClose(stage.parentNode, panel);
	return stage;
}

/**
 * 本体对话框里的按钮：.menubutton.large + listen()，带同入保护。
 * 浮层里的按钮请用 addOverlayButton。
 */
export function addButton(label, parent, onClick) {
	const node = ui.create.div(".menubutton.large", label, parent);
	let busy = false;
	node.listen(event => {
		if (busy) {
			return;
		}
		busy = true;
		try {
			onClick(node, event);
		} finally {
			busy = false;
		}
	});
	return node;
}

/** 不可点的按钮（用本体 .disabled 灰样式），原因写在下一行 */
export function addDisabledButton(label, parent, reason) {
	const node = ui.create.div(".menubutton.large", label, parent);
	node.classList.add("disabled");
	if (reason) {
		addLine(parent, reason);
	}
	return node;
}

/**
 * 浮层里的按钮：bindTap（PC click / 触摸轻触，自带去重）+ 阻止冒泡，
 * 避免点卡片上的按钮时连带触发“点卡片读取”。
 */
export function addOverlayButton(label, parent, onClick, extraClass) {
	const node = document.createElement("div");
	node.className = extraClass ? `wm-rogue-btn ${extraClass}` : "wm-rogue-btn";
	node.innerHTML = label;
	parent.appendChild(node);
	bindTap(node, event => {
		event?.stopPropagation?.();
		onClick(node, event);
	});
	return node;
}

/** 浮层里的普通点击（无按钮外观），例如整张存档卡片 */
export function bindOverlayTap(node, onClick) {
	bindTap(node, event => onClick(node, event));
	return node;
}

export function translateCharacter(id) {
	if (!id) {
		return "未选择角色";
	}
	return get.translation(id) || id;
}

/** 技能出处（lib.character 第三项是技能表）；商店候选用它显示武将牌，找不到返回空串 */
const skillOwnerCache = new Map();
export function skillOwner(skillId) {
	if (skillOwnerCache.has(skillId)) {
		return skillOwnerCache.get(skillId);
	}
	let owner = "";
	for (const [id, info] of Object.entries(lib.character)) {
		if (Array.isArray(info?.[3]) && info[3].includes(skillId)) {
			owner = id;
			break;
		}
	}
	skillOwnerCache.set(skillId, owner);
	return owner;
}

/** 技能整段翻译（名称<hr>描述） */
export function skillLabel(id) {
	return lib.translate[id] || `${id}<hr>（无描述）`;
}

const POPTIP_TAG = /<noname-poptip\b([^>]*?)(?:\/>|>([\s\S]*?)<\/noname-poptip>)/gi;
const POPTIP_ID = /poptip\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i;
const BR_TAG = /<br\s*\/?>/gi;
const HTML_TAG = /<\/?[a-z][^>]*>/gi;

/**
 * 把 `<noname-poptip poptip="id"></noname-poptip>` 换成玩家能读的文字。
 * 本体这个标签不带名字——`get.poptip()` 输出的是空壳，名字要按 id 去 `lib.poptip` 查
 * （本体 HTMLPoptipElement.connectedCallback 也是这么做的）。装饰与本体一致：
 * 技能 〖名〗、卡牌 【名】、其它类型直接写名字。
 * 查不到 id 时优先用标签里的内部文本，再退回 id——正文一个字都不能丢。
 */
function poptipLabel(attrs, inner) {
	const matched = POPTIP_ID.exec(attrs ?? "");
	const id = (matched ? matched.slice(1).find(Boolean) : "") ?? "";
	const trimmed = String(id).trim();
	const name = trimmed && typeof lib.poptip?.getName === "function" ? `${lib.poptip.getName(trimmed)}` : "";
	if (!name || name === trimmed) {
		return (inner ?? "").trim() || name || trimmed;
	}
	const type = typeof lib.poptip?.getType === "function" ? lib.poptip.getType(trimmed) : "rule";
	if (type === "skill") {
		return `〖${name}〗`;
	}
	if (type === "card") {
		return `【${name}】`;
	}
	return name;
}

/**
 * 技能文本的显示层清洗。
 * 本体的 poptip 标记在纯文本弹层里会连标签一起显示，这里把它换成可读文字（见 poptipLabel）；
 * <br> 换成换行；其它标签兜底剥离（同样只去标签，不删一个字）。
 * 只作用于肉鸽界面展示，不改 lib.translate 原文，也不影响本体界面。
 */
export function sanitizeSkillText(text) {
	if (typeof text !== "string") {
		return "";
	}
	if (!text.includes("<")) {
		return text;
	}
	return text
		.replace(POPTIP_TAG, (match, attrs, inner) => poptipLabel(attrs, inner))
		.replace(BR_TAG, "\n")
		.replace(HTML_TAG, "");
}

/** 技能名 */
export function skillName(id) {
	const full = lib.translate[id];
	return typeof full === "string" ? sanitizeSkillText(full.split("<hr>")[0]) || id : id;
}

/** 技能描述：兼容两种翻译格式——肉鸽技能的「名<hr>描述」单键，与分包技能的 id_info 双键 */
export function skillInfo(id) {
	const intro = skillLabel(id).split("<hr>")[1];
	return sanitizeSkillText(intro || lib.translate[`${id}_info`] || "");
}

/**
 * 浮层内的弹窗：本体对话框在 #window 里，会被挂在 body 的浮层（z-index 9998）压在下面，
 * 玩家看不到也点不到；所以浮层当前时改用自建弹层，挂在浮层内部（继承同一套加固样式）。
 */
function overlayPopup(lines, options) {
	const host = currentScreen && currentScreen.kind === "overlay" ? currentScreen.node : document.body;
	const popup = document.createElement("div");
	popup.className = "wm-rogue-popup";
	const box = document.createElement("div");
	box.className = "wm-rogue-popup-box";
	popup.appendChild(box);
	for (const line of lines) {
		const node = document.createElement("div");
		node.className = "wm-rogue-popup-line";
		node.textContent = line;
		box.appendChild(node);
	}
	const actions = document.createElement("div");
	actions.className = "wm-rogue-popup-actions";
	box.appendChild(actions);
	for (const option of options) {
		addOverlayButton(option.label, actions, () => {
			popup.remove();
			option.onClick();
		});
	}
	host.appendChild(popup);
	return popup;
}

/** 当前页面是否是自建浮层 */
function isOverlayCurrent() {
	return !!currentScreen && currentScreen.kind === "overlay";
}

/** 弹一个只有确认键的提示；用于报错与迁移说明 */
export function showNotice(lines, onDone) {
	if (isOverlayCurrent()) {
		overlayPopup(lines, [
			{
				label: "确定",
				onClick: () => {
					if (typeof onDone === "function") {
						onDone();
					}
				},
			},
		]);
		return;
	}
	const dialog = new lib.element.Dialog("hidden");
	dialog.addText(lines.map(line => `${line}`).join("<br>"), false);
	dialog.add(ui.create.div(".placeholder"));
	addButton("确定", dialog.content, () => {
		dialog.delete();
		if (typeof onDone === "function") {
			onDone();
		}
	});
	dialog.open();
}

/**
 * 带若干选项的询问框，用于“未完成战斗恢复”“删除确认”这类分叉。
 * @param {string[]} lines 说明文字
 * @param {{ label: string, onClick: Function }[]} options 按钮，按顺序排列
 */
export function showChoice(lines, options) {
	if (isOverlayCurrent()) {
		return overlayPopup(lines, options);
	}
	const dialog = new lib.element.Dialog("hidden");
	dialog.addText(lines.map(line => `${line}`).join("<br>"), false);
	dialog.add(ui.create.div(".placeholder"));
	for (const option of options) {
		addButton(option.label, dialog.content, () => {
			dialog.delete();
			option.onClick();
		});
	}
	dialog.open();
	return dialog;
}
