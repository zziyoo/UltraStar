// 肉鸽 Hub、商店与替换技能页。同样只画界面，一切数据变更走 api 交给 mode.js。
// 各页面都是自建浮层 + wm-rogue-* 样式（见 ui/common.js 顶部说明）；
// 替换页与商店共用同一套技能卡渲染（addSkillHead / wm-rogue-shop-desc / sanitizeSkillText）。

import {
	CURIO_SHOP_RATE,
	CURRENCIES,
	CURRENCY_LABEL,
	LIBRARY_TEXT,
	MODE_TRANSLATE,
	RUN_MODE,
	RUN_MODE_LABEL,
	SKILL_CURRENCY,
	SKILL_PURCHASE_COUNT,
	SKILL_REFRESH_PER_LEVEL,
	SKILL_SLOTS,
	STAT_CURRENCY,
	STAT_IDS,
} from "../config.js";
import { getPurchasedCount, getRefreshesRemaining } from "../shop.js";
import { canLockShop, checkCurioUpgrade, describeCurio, describeCurioEffects, getCurio, getCurioEffectAt, getCurioOffer, getCurioQuality, getNextCurioQuality, getUpgradableCurios, isShopLocked, CURIOSITY_RARITY } from "../curioManager.js";
import { describeStatEffects, stats, sumStatEffects } from "../data/stats.js";
import { ui } from "../../../../../noname.js";
import {
	addOverlayButton,
	addResBar,
	addResCell,
	bindOverlayTap,
	currentScreenNode,
	openOverlay,
	showNotice,
	skillInfo,
	skillName,
	skillOwner,
	translateCharacter,
} from "./common.js";

const moneyName = key => CURRENCY_LABEL[key] ?? key;

/**
 * 奇物商店的刷新概率文案：百分比一律按 config.CURIO_SHOP_RATE 现算。
 * 这个数字以前在界面上手写过三遍「10%」，改配置就会说瞎话——现在只有配置一处。
 */
const curioRateText = noun => `每关胜利后有 ${Math.round(CURIO_SHOP_RATE * 100)}% 概率刷新${noun}`;

/** 商店页的活节点，供购买/升级后原位刷新 */
let shopView = null;

/** 奇物管理页的活节点，供升级后原位刷新 */
let curioView = null;

/** 某项属性升到 level 后的累计效果，一行一条；文案在 data/stats.js，与战斗中的「强化」标记共用 */
function statEffectLines(statId, level) {
	const lines = describeStatEffects(sumStatEffects({ [statId]: level }));
	return lines.length ? lines : ["暂无加成"];
}

export function showHub(api) {
	const run = api.run;
	const stage = openOverlay("wm-rogue-hub-overlay");
	const panel = ui.create.div(".wm-rogue-hub", stage);

	const titlebar = ui.create.div(".wm-rogue-titlebar", panel);
	ui.create.div(".wm-rogue-title", MODE_TRANSLATE, titlebar);

	const body = ui.create.div(".wm-rogue-hub-body", panel);
	const canFight = run.mode === RUN_MODE.challenge ? run.level <= run.totalLevels : true;
	const levelText = run.mode === RUN_MODE.endless
		? `第 ${run.level} 关 / 无尽`
		: `第 ${run.level} / ${run.totalLevels} 关${run.cleared ? "（已通关）" : ""}`;
	ui.create.div(".wm-rogue-hub-level", levelText, body);
	ui.create.div(".wm-rogue-hub-mode", RUN_MODE_LABEL[run.mode], body);

	const res = ui.create.div(".wm-rogue-res", body);
	for (const key of CURRENCIES) {
		addResCell(res, moneyName(key)).innerHTML = `${run.currency[key] ?? 0}`;
	}

	ui.create.div(".wm-rogue-hub-section-title", "当前成长", body);
	ui.create.div(".wm-rogue-hub-who", translateCharacter(run.characterId), body);
	const statRow = ui.create.div(".wm-rogue-stat-cards", body);
	for (const statId of STAT_IDS) {
		buildStatSummary(statRow, run, statId);
	}

	// 动作区分两行：第一行是「继续玩」（开始/商店/图鉴），第二行才是离开当前局（返回存档/退出）
	const actions = ui.create.div(".wm-rogue-hub-actions", body);
	const mainRow = ui.create.div(".wm-rogue-hub-row", actions);
	const exitRow = ui.create.div(".wm-rogue-hub-row", actions);
	const fightLabel = run.mode === RUN_MODE.challenge && run.cleared ? "重复挑战" : canFight ? "开始下一关" : "开始战斗";
	addOverlayButton(fightLabel, mainRow, () => api.startBattle(), "wm-rogue-hub-primary");
	addOverlayButton("商店", mainRow, () => api.openShop(), "wm-rogue-hub-shop");
	// 图鉴是六个存档共有的收集册：闯关自己不产出内容，但照样能翻开看别的存档解锁了什么
	addOverlayButton("图鉴", mainRow, () => api.openCollection(), "wm-rogue-hub-index");
	addOverlayButton("返回存档", exitRow, () => api.backToSlots(), "wm-rogue-hub-secondary");
	addOverlayButton("退出肉鸽模式", exitRow, () => api.leaveMode(), "wm-rogue-hub-secondary");
	if (!canFight) {
		ui.create.div(".wm-rogue-hub-hint", "关卡数已超过配置的总关卡数，请检查 config.js 的 CHALLENGE_TOTAL_LEVELS。", body);
	}
}

/** 只读的技能查看页：只展示已购买技能，不买卖、不写存档 */
export function showSkills(api) {
	const run = api.run;
	const stage = openOverlay("wm-rogue-skills-overlay");
	const panel = ui.create.div(".wm-rogue-skills", stage);

	const titlebar = ui.create.div(".wm-rogue-titlebar", panel);
	ui.create.div(".wm-rogue-title", `技能（${run.skills.length}/${SKILL_SLOTS}）`, titlebar);
	addOverlayButton(LIBRARY_TEXT.back, ui.create.div(".wm-rogue-back", titlebar), () => api.back());

	const body = ui.create.div(".wm-rogue-skills-body", panel);
	if (!run.skills.length) {
		ui.create.div(".wm-rogue-skills-empty", "当前没有已购买技能", body);
		ui.create.div(".wm-rogue-skills-hint", "回到营地后可以进商店购买。", body);
		return;
	}
	const cardRow = ui.create.div(".wm-rogue-shop-cards", body);
	for (const id of run.skills) {
		const card = ui.create.div(".wm-rogue-shop-card.wm-rogue-shop-card-read", cardRow);
		addSkillHead(card, id);
		ui.create.div(".wm-rogue-shop-desc.wm-rogue-desc-full", skillInfo(id), card);
	}
}

/**
 * 奇物管理页（入口在商店顶部的「奇物」资源块）：花经验把已拥有的奇物逐级升品质。
 * 每张卡给出「当前品质 + 当前效果」与「下一品质 + 下一品质效果 + 升级费用」；
 * 品质、效果与费用一律问 curioManager，UI 不自己算（升级后原地重画就是反馈）。
 * 史诗已达到链尾，只写「已达最高品质」、不给按钮；负面奇物照样能升，按钮不隐藏。
 */
export function showCurios(api) {
	const run = api.run;
	const owned = Array.isArray(run.curios) ? run.curios : [];
	const stage = openOverlay("wm-rogue-curios-overlay");
	const panel = ui.create.div(".wm-rogue-curios", stage);

	const titlebar = ui.create.div(".wm-rogue-titlebar", panel);
	ui.create.div(".wm-rogue-title", `奇物（${owned.length}）`, titlebar);
	addOverlayButton(LIBRARY_TEXT.back, ui.create.div(".wm-rogue-back", titlebar), () => api.back());

	const body = ui.create.div(".wm-rogue-curios-body", panel);
	if (!owned.length) {
		ui.create.div(".wm-rogue-skills-empty", "当前没有奇物", body);
		ui.create.div(".wm-rogue-skills-hint", `${curioRateText("奇物商店")}，事件也可能送奇物。`, body);
		return;
	}
	const cardRow = ui.create.div(".wm-rogue-shop-cards", body);
	const rows = owned.map(id => buildCurioManageCard(cardRow, id, api));
	curioView = { node: currentScreenNode(), paint: current => rows.forEach(row => paintCurioManage(row, current)) };
	curioView.paint(run);
}

/**
 * 原位刷新奇物管理页（升级后不重开窗口，重开会把滚动位置甩回顶部）。
 * @returns {boolean} 页面还是当初那个管理页、已刷新为 true；否则 false，调用方退回整页重绘
 */
export function refreshCurios(run) {
	if (!curioView || currentScreenNode() !== curioView.node) {
		curioView = null;
		return false;
	}
	curioView.paint(run);
	return true;
}

/** 管理页的一张奇物卡：品质标签 + 描述 + 当前效果 + 下一品质预览 + 升级价与按钮 */
function buildCurioManageCard(parent, id, api) {
	const def = getCurio(id);
	const card = ui.create.div(".wm-rogue-shop-card.wm-rogue-curio-card.wm-rogue-curio-manage", parent);
	const top = ui.create.div(".wm-rogue-shop-top", card);
	const art = ui.create.div(".wm-rogue-curio-art", top);
	if (def?.image) {
		art.style.backgroundImage = `url("${def.image}")`;
	}
	ui.create.div(".wm-rogue-shop-name", def?.name ?? id, top);
	const rarity = addCurioRarity(top, def);
	const desc = ui.create.div(".wm-rogue-shop-desc", def?.description ?? "", card);
	if (def?.description) {
		desc.title = def.description;
	}
	const effect = ui.create.div(".wm-rogue-curio-effect", "", card);
	const next = ui.create.div(".wm-rogue-curio-next", "", card);
	const foot = ui.create.div(".wm-rogue-shop-foot", card);
	const price = ui.create.div(".wm-rogue-shop-price", "", foot);
	const row = { id, card, rarity, effect, next, price, button: null };
	row.button = addOverlayButton("升级", foot, () => {
		if (paintCurioManage(row, api.getRun()).ok) {
			api.upgradeCurio(id);
		}
	}, "wm-rogue-curio-up");
	return row;
}

/** 画一张奇物卡，返回升级检查结果（ok 为假时按钮点不动，与属性升级同一套口径） */
function paintCurioManage(row, run) {
	const check = checkCurioUpgrade(run, row.id);
	paintCurioRarity(row.rarity, getCurioQuality(row.id, run.curioQuality));
	row.effect.textContent = describeCurio(row.id, run.curioQuality).join("\n");
	const nextQuality = getNextCurioQuality(row.id, run.curioQuality);
	if (!nextQuality) {
		// 链尾：没有下一档可看，也不给按钮——这是「练满了」，不是「买不起」，所以不把卡片置灰
		row.next.textContent = "";
		row.price.innerHTML = "已达最高品质";
		row.button.classList.add("wm-rogue-hidden");
		return check;
	}
	row.next.textContent = [`下一品质：${CURIOSITY_RARITY[nextQuality]}`, ...describeCurioEffects(getCurioEffectAt(row.id, nextQuality))].join("\n");
	row.button.classList.remove("wm-rogue-hidden");
	const money = moneyName(STAT_CURRENCY);
	const held = run.currency[STAT_CURRENCY] ?? 0;
	row.price.innerHTML = check.ok ? `升级 ${check.cost} ${money}` : `升级 ${check.cost} ${money}（持有 ${held}）`;
	row.button.innerHTML = check.ok ? "升级" : `${money}不足`;
	setBuyable(row, check.ok);
	return check;
}

/** 品质标签就地改档：先摘掉所有档位的类，再挂上新的（商店/图鉴按初始品质画，不走这里） */
function paintCurioRarity(node, quality) {
	if (!node) {
		return;
	}
	for (const tier of Object.keys(CURIOSITY_RARITY)) {
		node.classList.remove(`wm-rogue-rarity-${tier}`);
	}
	node.classList.add(`wm-rogue-rarity-${quality}`);
	node.textContent = CURIOSITY_RARITY[quality] ?? quality;
}

export function showShop(api) {
	const run = api.run;
	// 与存档页同一套自建浮层：标题与资源栏固定、中间滚动，返回固定在标题栏右上角
	const stage = openOverlay("wm-rogue-shop-overlay");
	const shop = ui.create.div(".wm-rogue-shop", stage);

	const head = ui.create.div(".wm-rogue-shop-head", shop);
	const titlebar = ui.create.div(".wm-rogue-titlebar", head);
	ui.create.div(".wm-rogue-title", "商店", titlebar);
	addOverlayButton(LIBRARY_TEXT.back, ui.create.div(".wm-rogue-back", titlebar), () => api.backToHub());

	const res = ui.create.div(".wm-rogue-res", head);
	const goldCell = addResCell(res, moneyName(SKILL_CURRENCY));
	const expCell = addResCell(res, moneyName(STAT_CURRENCY));
	const skillNum = addResCell(res, "技能");
	// 第三块「技能 n/3」本身是入口：点它查看已购买技能（只读，不买卖、不写存档）
	const skillCell = skillNum.parentNode;
	skillCell.classList.add("wm-rogue-res-skill");
	bindOverlayTap(skillCell, () => api.openSkills());
	const resCells = [
		{ node: goldCell, read: current => current.currency[SKILL_CURRENCY] ?? 0 },
		{ node: expCell, read: current => current.currency[STAT_CURRENCY] ?? 0 },
		{ node: skillNum, read: current => `${current.skills.length}/${SKILL_SLOTS}` },
	];
	// 无尽模式第四块「奇物 n」：与「技能」同一套入口样式，点开只读查看已拥有奇物
	if (run.mode === RUN_MODE.endless) {
		const curioNum = addResCell(res, "奇物");
		const curioCell = curioNum.parentNode;
		curioCell.classList.add("wm-rogue-res-curio");
		bindOverlayTap(curioCell, () => api.openCurios());
		resCells.push({ node: curioNum, read: current => `${(current.curios ?? []).length}` });
	}

	const body = ui.create.div(".wm-rogue-shop-body", shop);
	// 刷新按钮属于「技能商店」这一分区：紧贴标题右侧，不放页面顶部、也不跟右上角的返回挤在一起
	const offerHead = ui.create.div(".wm-rogue-shop-section-row", body);
	ui.create.div(".wm-rogue-shop-section-title", "技能商店", offerHead);
	const refreshButton = addOverlayButton("", offerHead, () => api.refreshSkills(), "wm-rogue-shop-refresh");
	// 收藏家的橱窗：持有锁定能力时，分区标题右侧多一枚 🔓/🔒 开关（点一下切换；锁住的那一类商店
	// 下一场战斗结束时不再自动刷新）。没那件奇物就不画——玩家看不到自己用不上的东西
	const skillLock = buildShopLock(offerHead, run, "skill", "技能商店", () => api.toggleLock("skill"));
	ui.create.div(".wm-rogue-shop-subtitle", `每次进店最多购买 ${SKILL_PURCHASE_COUNT} 个技能　点卡片可看完整描述`, body);
	const offerRow = ui.create.div(".wm-rogue-shop-cards", body);
	const offerCards = run.shopOffers.map(offer => buildOfferCard(offerRow, offer, api));

	// 奇物商店：无尽模式专属分区。候选由每关胜利按概率生成并连价定死写进存档，进店/重载都不重掷。
	// 无候选（未刷新/已买完/已集齐）时整个分区隐藏——不留「已购买」残卡
	const isEndless = run.mode === RUN_MODE.endless;
	let curioSection = null;
	let curioHint = null;
	let curioRow = null;
	let curioLock = null;
	const curioCards = [];
	if (isEndless) {
		curioSection = ui.create.div(".wm-rogue-curio-section", body);
		const curioHead = ui.create.div(".wm-rogue-shop-section-row", curioSection);
		ui.create.div(".wm-rogue-shop-section-title", "奇物商店", curioHead);
		curioLock = buildShopLock(curioHead, run, "curio", "奇物商店", () => api.toggleLock("curio"));
		curioHint = ui.create.div(".wm-rogue-shop-subtitle", "", curioSection);
		curioRow = ui.create.div(".wm-rogue-shop-cards", curioSection);
	}

	ui.create.div(".wm-rogue-shop-section-title", "属性强化", body);
	const statRow = ui.create.div(".wm-rogue-stat-cards", body);
	const statCards = STAT_IDS.map(statId => buildStatCard(statRow, statId, api));

	/** 刷新换的是候选 id，不只是价格：卡片要跟着重建，否则留着旧技能的头像、描述和点击回调 */
	const syncOffers = current => {
		const live = offerCards.map(row => row.id).join(",");
		if (current.shopOffers.map(offer => offer.id).join(",") === live) {
			return;
		}
		for (const row of offerCards) {
			row.card.remove();
		}
		offerCards.length = 0;
		for (const offer of current.shopOffers) {
			offerCards.push(buildOfferCard(offerRow, offer, api));
		}
	};

	/** 奇物候选同理：胜利重掷后按 id 重建卡片 */
	const syncCurios = current => {
		if (!curioRow) {
			return;
		}
		const offers = Array.isArray(current.curioOffers) ? current.curioOffers : [];
		if (offers.map(offer => offer.id).join(",") === curioCards.map(row => row.id).join(",")) {
			return;
		}
		for (const row of curioCards) {
			row.card.remove();
		}
		curioCards.length = 0;
		for (const offer of offers) {
			curioCards.push(buildCurioCard(curioRow, offer, api));
		}
	};

	const paint = current => {
		syncOffers(current);
		syncCurios(current);
		for (const cell of resCells) {
			cell.node.innerHTML = `${cell.read(current)}`;
		}
		const soldOut = isSoldOut(current);
		for (const row of offerCards) {
			paintOffer(row, current, soldOut);
		}
		for (const row of curioCards) {
			paintCurio(row, current);
		}
		for (const row of statCards) {
			paintStat(row, current, api.checkStatUpgrade);
		}
		paintRefresh(refreshButton, current, soldOut);
		paintShopLock(skillLock, current, "skill");
		paintShopLock(curioLock, current, "curio");
		if (curioSection) {
			const offers = Array.isArray(current.curioOffers) ? current.curioOffers : [];
			curioSection.classList[offers.length ? "remove" : "add"]("wm-rogue-hidden");
			// 黄金罗盘额外那批：买完当前这批会自动提上货架（curioManager.buyCurio 负责搬运），
			// 队列里还压着货时得让玩家知道「还能再买一次」，否则看着像商店出故障了
			if (curioHint) {
				const queued = (Array.isArray(current.curioOfferQueue) ? current.curioOfferQueue : []).filter(batch => batch.length).length;
				curioHint.innerHTML = queued
					? `${curioRateText("候选")}　每次最多购买 1 个　黄金罗盘另指了 ${queued} 批，买完这批接着上`
					: `${curioRateText("候选")}　每次最多购买 1 个`;
			}
		}
	};
	// 记浮层根节点用于原位刷新的存活判断（openOverlay 返回的是里面的居中层）
	shopView = { node: currentScreenNode(), paint };
	paint(run);
}

/** 刷新按钮的文字与可用性：本局购买额度用光就彻底锁死——重掷会把 sold 换成 false，放行等于绕过一局购买上限 */
function paintRefresh(node, run, soldOut) {
	const remaining = getRefreshesRemaining(run);
	node.innerHTML = soldOut ? "本局已购买" : `刷新 ${remaining}/${SKILL_REFRESH_PER_LEVEL}`;
	node.classList[soldOut || remaining <= 0 ? "add" : "remove"]("wm-rogue-disabled");
}

/**
 * 商店锁的开关（收藏家的橱窗）：🔓 未锁 / 🔒 已锁。
 * 只有持有对应能力时才创建（没有那件奇物就返回 null，页面上不出现点不动的空图标）；
 * 当前状态一律由 paint 现读存档，不吃渲染时缓存的布尔值。
 */
function buildShopLock(parent, run, kind, label, onToggle) {
	if (!canLockShop(run, kind)) {
		return null;
	}
	const node = addOverlayButton("🔓", parent, onToggle, "wm-rogue-shop-lock");
	node.title = `锁定${label}：锁定后，下一场战斗结束时不刷新${label}的候选`;
	return node;
}

/** 把一枚锁图标画成当前状态；节点不存在（没能力）时什么都不做 */
function paintShopLock(node, run, kind) {
	if (!node) {
		return;
	}
	const locked = isShopLocked(run, kind);
	node.innerHTML = locked ? "🔒" : "🔓";
	node.classList[locked ? "add" : "remove"]("wm-rogue-lock-on");
}

/** 技能卡的「头」：出处小头像 + 技能名 + 出自行；商店与技能查看页共用同一视觉语言。
 * 没有出处的技能（变身/阶段技等）不画头像也不标来源，商店只卖真实技能。 */
function addSkillHead(card, id) {
	const top = ui.create.div(".wm-rogue-shop-top", card);
	const owner = skillOwner(id);
	if (owner) {
		// 本体给任意 div 都提供了 setBackground（HTMLDivElement.prototype），直接拿它画头像
		ui.create.div(".wm-rogue-shop-avatar", top).setBackground(owner, "character");
	}
	ui.create.div(".wm-rogue-shop-name", skillName(id), top);
	if (owner) {
		ui.create.div(".wm-rogue-shop-owner", `出自 ${translateCharacter(owner)}`, card);
	}
}

/** 等级 + 逐行累计效果；商店与主界面共用 */
function paintStatBody(levelNode, effectsNode, statId, level) {
	levelNode.innerHTML = `Lv.${level}/${stats[statId].maxLevel}`;
	effectsNode.innerHTML = statEffectLines(statId, level)
		.map(line => `<div class="wm-rogue-stat-effect${level ? "" : " wm-rogue-none"}">${line}</div>`)
		.join("");
}

/** 主界面的只读属性卡：没有升级价与按钮 */
function buildStatSummary(parent, run, statId) {
	const card = ui.create.div(".wm-rogue-stat-card.wm-rogue-stat-read", parent);
	const head = ui.create.div(".wm-rogue-stat-head", card);
	ui.create.div(".wm-rogue-stat-name", stats[statId].name, head);
	const level = ui.create.div(".wm-rogue-stat-level", "", head);
	const effects = ui.create.div(".wm-rogue-stat-effects", card);
	paintStatBody(level, effects, statId, run.stats[statId] ?? 0);
}

/** 一张技能卡：出处头像 + 技能名 + 描述 + 售价 + 购买按钮 */
function buildOfferCard(parent, offer, api) {
	const card = ui.create.div(".wm-rogue-shop-card", parent);
	addSkillHead(card, offer.id);
	const intro = skillInfo(offer.id);
	const desc = ui.create.div(".wm-rogue-shop-desc", intro, card);
	desc.title = intro;
	// 卡面只显示 5 行，点卡片看完整说明（按钮上的点击会阻止冒泡，不会连带打开）
	bindOverlayTap(card, () => showNotice([skillName(offer.id), intro || "（该技能没有描述）"]));

	const foot = ui.create.div(".wm-rogue-shop-foot", card);
	const price = ui.create.div(".wm-rogue-shop-price", "", foot);
	const row = { id: offer.id, card, price, button: null };
	row.button = addOverlayButton("购买", foot, () => {
		if (paintOffer(row, api.getRun()) === "buy") {
			api.buySkill(offer.id);
		}
	}, "wm-rogue-shop-buy");
	return row;
}

/** 一张属性卡：属性名 + 等级 + 当前累计效果 + 升级价 + 升级按钮 */
function buildStatCard(parent, statId, api) {
	const card = ui.create.div(".wm-rogue-stat-card", parent);
	const head = ui.create.div(".wm-rogue-stat-head", card);
	ui.create.div(".wm-rogue-stat-name", stats[statId].name, head);
	const level = ui.create.div(".wm-rogue-stat-level", "", head);
	const effects = ui.create.div(".wm-rogue-stat-effects", card);
	const foot = ui.create.div(".wm-rogue-stat-foot", card);
	const price = ui.create.div(".wm-rogue-stat-price", "", foot);
	const row = { statId, card, level, effects, price, button: null };
	row.button = addOverlayButton("升级", foot, () => {
		if (paintStat(row, api.getRun(), api.checkStatUpgrade).ok) {
			api.upgradeStat(statId);
		}
	}, "wm-rogue-stat-up");
	return row;
}

/** 奇物稀有度标签：按档位着色（史诗/稀有/普通/负面） */
function addCurioRarity(parent, def) {
	if (!def?.rarity || !CURIOSITY_RARITY[def.rarity]) {
		return null;
	}
	return ui.create.div(`.wm-rogue-curio-rarity.wm-rogue-rarity-${def.rarity}`, CURIOSITY_RARITY[def.rarity], parent);
}

/** 一张奇物卡：方形图 + 名称 + 稀有度 + 效果 + 售价 + 购买按钮 */
function buildCurioCard(parent, offer, api) {
	const def = getCurio(offer.id);
	const card = ui.create.div(".wm-rogue-shop-card.wm-rogue-curio-card", parent);
	const top = ui.create.div(".wm-rogue-shop-top", card);
	const art = ui.create.div(".wm-rogue-curio-art", top);
	if (def?.image) {
		art.style.backgroundImage = `url("${def.image}")`;
	}
	ui.create.div(".wm-rogue-shop-name", def?.name ?? offer.id, top);
	addCurioRarity(top, def);
	const lines = describeCurio(offer.id);
	const desc = ui.create.div(".wm-rogue-shop-desc", def?.description ?? "", card);
	if (def?.description) {
		desc.title = def.description;
	}
	// 卡面上已经写着奇物名：弹层只讲描述与效果，不重复自己的名字
	bindOverlayTap(card, () => showNotice([def?.description ?? "", ...lines].filter(Boolean)));
	ui.create.div(".wm-rogue-curio-effect", lines.join("\n"), card);

	const foot = ui.create.div(".wm-rogue-shop-foot", card);
	const price = ui.create.div(".wm-rogue-shop-price", "", foot);
	const row = { id: offer.id, card, price, button: null };
	row.button = addOverlayButton("购买", foot, () => {
		if (paintCurio(row, api.getRun()) === "buy") {
			api.buyCurio(offer.id);
		}
	}, "wm-rogue-shop-buy");
	return row;
}

/** 画一张奇物卡的状态，返回它当前的状态。offer 按 id 从当前存档里取——buyCurio 返回的是新对象，
 * 买到即整批下架，所以只有「买得起 / 金币不足」两种可展示状态 */
function paintCurio(row, run) {
	const offer = getCurioOffer(run, row.id) ?? {};
	const held = run.currency[SKILL_CURRENCY] ?? 0;
	const state = held < offer.price ? "poor" : "buy";
	const text = {
		poor: { price: `${offer.price} 金币（持有 ${held}）`, button: "金币不足" },
		buy: { price: `${offer.price} 金币`, button: "购买" },
	}[state];
	row.price.innerHTML = text.price;
	row.button.innerHTML = text.button;
	setBuyable(row, state === "buy");
	return state;
}

/**
 * 原位刷新商店页（购买/升级后不重开窗口，重开会把滚动位置甩回顶部）。
 * @returns {boolean} 页面还是当初那个商店、已刷新为 true；否则 false，调用方退回整页重绘
 */
export function refreshShop(run) {
	if (!shopView || currentScreenNode() !== shopView.node) {
		shopView = null;
		return false;
	}
	shopView.paint(run);
	return true;
}

/**
 * 本局购买额度是否已用光：次数上限由 SKILL_PURCHASE_COUNT 真正驱动（与 buySkill 同一套记数），
 * 用光后其余候选一律显示「本次商店已售罄」。改常量即可改上限，不用再动这里。
 */
function isSoldOut(run) {
	return getPurchasedCount(run) >= SKILL_PURCHASE_COUNT;
}

/** 画一张技能卡的状态，返回它当前的状态。offer 按 id 从当前存档里取——buySkill 返回的是新对象，握住旧引用会永远读不到 sold */
function paintOffer(row, run, soldOut = isSoldOut(run)) {
	const offer = run.shopOffers.find(item => item.id === row.id);
	const held = run.currency[SKILL_CURRENCY] ?? 0;
	const state = offer.sold ? "sold" : held < offer.price ? "poor" : soldOut ? "soldOut" : "buy";
	const money = moneyName(SKILL_CURRENCY);
	const text = {
		sold: { price: `${offer.price} ${money}`, button: "已购买" },
		poor: { price: `${offer.price} ${money}（持有 ${held}）`, button: `${money}不足` },
		soldOut: { price: `${offer.price} ${money}`, button: "本次商店已售罄" },
		// 价格已经在上一行的价格里，按钮只写动作
		buy: { price: `${offer.price} ${money}`, button: "购买" },
	}[state];
	row.price.innerHTML = text.price;
	row.button.innerHTML = text.button;
	setBuyable(row, state === "buy");
	return state;
}

/** 画一张属性卡，返回升级检查结果 */
function paintStat(row, run, checkStatUpgrade) {
	const check = checkStatUpgrade(row.statId);
	const level = run.stats[row.statId] ?? 0;
	paintStatBody(row.level, row.effects, row.statId, level);
	const held = run.currency[STAT_CURRENCY] ?? 0;
	const money = moneyName(STAT_CURRENCY);
	if (check.ok) {
		row.price.innerHTML = `升级 ${check.price} ${money}`;
		row.button.innerHTML = "升级";
	} else if (Number.isFinite(check.price)) {
		row.price.innerHTML = `升级 ${check.price} ${money}（持有 ${held}）`;
		row.button.innerHTML = `${money}不足`;
	} else {
		row.price.innerHTML = check.error;
		row.button.innerHTML = "已满级";
	}
	setBuyable(row, check.ok);
	return check;
}

function setBuyable(row, buyable) {
	row.button.classList[buyable ? "remove" : "add"]("wm-rogue-disabled");
	row.card.classList[buyable ? "remove" : "add"]("wm-rogue-off");
}

/**
 * 技能槽满时的替换页：上方居中突出新技能，下方三张已有技能卡横排，点「替换此技能」让位。
 * 纯 UI：替换走 api.confirmReplace(offerId, 被替换的技能)，返回商店走 api.backToShop；
 * 技能卡复用商店渲染（addSkillHead + sanitize 后的描述），没有出处的不标来源。
 */
export function showReplace(api, offerId) {
	const run = api.run;
	const stage = openOverlay("wm-rogue-replace-overlay");
	const panel = ui.create.div(".wm-rogue-replace", stage);

	// 返回固定在标题栏右上角，与商店/技能查看页同一设计，不再额外铺底部取消按钮
	const titlebar = ui.create.div(".wm-rogue-titlebar", panel);
	ui.create.div(".wm-rogue-title", "选择要替换的技能", titlebar);
	addOverlayButton(LIBRARY_TEXT.back, ui.create.div(".wm-rogue-back", titlebar), () => api.backToShop());

	const body = ui.create.div(".wm-rogue-replace-body", panel);
	ui.create.div(".wm-rogue-replace-subtitle", "技能槽已满，请选择一个已有技能进行替换", body);

	// 新技能：整页重点——加大卡居中，强调边框，完整描述
	const newHead = ui.create.div(".wm-rogue-shop-section-row", body);
	ui.create.div(".wm-rogue-shop-section-title", "新技能", newHead);
	ui.create.div(".wm-rogue-replace-slot", `技能槽 ${run.skills.length}/${SKILL_SLOTS}`, newHead);
	const newCard = ui.create.div(".wm-rogue-shop-card.wm-rogue-replace-new", body);
	addSkillHead(newCard, offerId);
	ui.create.div(".wm-rogue-shop-desc.wm-rogue-desc-full", skillInfo(offerId) || "（该技能没有描述）", newCard);

	ui.create.div(".wm-rogue-replace-arrow", "↓ 选择一个要被替换的技能 ↓", body);

	// 已有技能：三张等宽卡横排（窄屏自动换行），描述限高，按钮钉在卡片底部对齐
	const cards = ui.create.div(".wm-rogue-replace-cards", body);
	for (const id of run.skills) {
		const card = ui.create.div(".wm-rogue-shop-card.wm-rogue-replace-card", cards);
		addSkillHead(card, id);
		const intro = skillInfo(id);
		const desc = ui.create.div(".wm-rogue-shop-desc", intro, card);
		desc.title = intro;
		// 与商店一致：点卡片看完整描述，按钮上的点击会阻止冒泡，不会连带打开
		bindOverlayTap(card, () => showNotice([skillName(id), intro || "（该技能没有描述）"]));
		const foot = ui.create.div(".wm-rogue-shop-foot", card);
		addOverlayButton("替换此技能", foot, () => api.confirmReplace(offerId, id), "wm-rogue-replace-btn");
	}
}

// ---------------------------------------------------------------- 事件子页面
//
// 流浪商人 / 技能熔炉 / 奇物融合炉：共同点是「先挑对象，挑中那一刻才扣钱」，
// 所以页面只拿 getRun + 一个动作回调，任何按钮都不许自己改存档（一律交给 mode.js）。
// 版式复用替换页那一套居中层 + 卡片横排，不新造 class：同一视觉语言，样式加固也一行都不用动。
//
// 置灰与可点的分界与事件页一致，不许混：
//   · 钱不够 → 置灰，点了毫无反应（回调里现读存档再判一次，双判）；
//   · 东西本身没法用（商人那件已是最高品质）→ 照常可点，由结算层弹一句、钱一个不动。

/** 子页骨架：居中面板 + 标题 + 右上角返回 + 说明 + 金币经验条 + 正文。返回就是「这个事件我不想再动了」 */
function openEventSubPage(api, overlayClass, title, subtitle) {
	const stage = openOverlay(overlayClass);
	const panel = ui.create.div(".wm-rogue-replace", stage);
	const titlebar = ui.create.div(".wm-rogue-titlebar", panel);
	ui.create.div(".wm-rogue-title", title, titlebar);
	addOverlayButton(LIBRARY_TEXT.back, ui.create.div(".wm-rogue-back", titlebar), () => api.leave());
	const body = ui.create.div(".wm-rogue-replace-body", panel);
	ui.create.div(".wm-rogue-replace-subtitle", subtitle, body);
	addResBar(body, api.getRun());
	return body;
}

/** 一张奇物卡的壳子（图 + 名 + 品质标签 + 描述 + 效果 + 下一档预览 + 价钱 + 按钮），商人与融合炉共用 */
function buildCurioChoiceCard(parent, curioId, buttonLabel, onPick) {
	const def = getCurio(curioId);
	const card = ui.create.div(".wm-rogue-shop-card.wm-rogue-curio-card.wm-rogue-replace-card", parent);
	const top = ui.create.div(".wm-rogue-shop-top", card);
	const art = ui.create.div(".wm-rogue-curio-art", top);
	if (def?.image) {
		art.style.backgroundImage = `url("${def.image}")`;
	}
	ui.create.div(".wm-rogue-shop-name", def?.name ?? curioId, top);
	const rarity = addCurioRarity(top, def);
	const desc = ui.create.div(".wm-rogue-shop-desc", def?.description ?? "", card);
	if (def?.description) {
		desc.title = def.description;
	}
	const effect = ui.create.div(".wm-rogue-curio-effect", "", card);
	const next = ui.create.div(".wm-rogue-curio-next", "", card);
	const foot = ui.create.div(".wm-rogue-shop-foot", card);
	const price = ui.create.div(".wm-rogue-shop-price", "", foot);
	const row = { id: curioId, card, rarity, effect, next, price, button: null };
	row.button = addOverlayButton(buttonLabel, foot, () => onPick(row), "wm-rogue-replace-btn");
	return row;
}

/**
 * 流浪商人：他只带一件货，价恒为奇物基准价 ×4，与奇物商店的区别是**允许买已经拥有的**——
 * 买回去是把那一件升一级品质，不是多一件。已拥有且已经练到最高档才是「没得可作用」，
 * 所以那一档按钮保持可点，交给 mode.js 弹一句并把金币留在口袋里。
 */
export function showMerchant(api) {
	const body = openEventSubPage(api, "wm-rogue-merchant-overlay", "流浪商人", "他只带了一件货，价钱按奇物基准价的四倍咬死，不还价。");
	const action = api.action;
	const card = ui.create.div(".wm-rogue-replace-cards", body);
	const row = buildCurioChoiceCard(card, action.curioId, "买下", target => {
		const state = paintMerchant(target, api.getRun(), action);
		if (state === "buy" || state === "maxed") {
			api.buy();
		}
	});
	paintMerchant(row, api.getRun(), action);
}

/** 画商人那一件货的价签与按钮，返回当前状态 buy / poor / maxed */
function paintMerchant(row, run, action) {
	const held = run.currency?.gold ?? 0;
	const owned = (run.curios ?? []).includes(action.curioId);
	const nextQuality = owned ? getNextCurioQuality(action.curioId, run.curioQuality) : null;
	paintCurioRarity(row.rarity, getCurioQuality(action.curioId, run.curioQuality));
	row.effect.textContent = describeCurio(action.curioId, run.curioQuality).join("\n");
	row.next.textContent = nextQuality
		? [`买回去直接升为：${CURIOSITY_RARITY[nextQuality]}`, ...describeCurioEffects(getCurioEffectAt(action.curioId, nextQuality))].join("\n")
		: (owned ? "这一件你已经练到最高品质了。" : "这一件你还没有。");
	const state = owned && !nextQuality ? "maxed" : held < action.price ? "poor" : "buy";
	const text = {
		// 练满了不是「买不起」，所以按钮不置灰：点了由结算层说明为什么做不成这笔买卖
		maxed: { price: `${action.price} 金币（已有最高品质）`, button: "买下" },
		poor: { price: `${action.price} 金币（持有 ${held}）`, button: "金币不足" },
		buy: { price: `${action.price} 金币`, button: owned ? "买下并升级" : "买下" },
	}[state];
	row.price.innerHTML = text.price;
	row.button.innerHTML = text.button;
	setBuyable(row, state !== "poor");
	return state;
}

/**
 * 技能熔炉：挑一个已有技能投进炉子。模式层已经拦掉「一个技能都没有」的情况，
 * 这里的空列表只是兜底（比如子页停着的时候技能被别处扣光）。
 */
export function showSkillForge(api) {
	const run = api.getRun();
	const body = openEventSubPage(api, "wm-rogue-skill-forge-overlay", "技能熔炉", "炉子吃一个技能，吐一样东西回来。选一个投进去。");
	if (!run.skills.length) {
		ui.create.div(".wm-rogue-skills-empty", "当前没有技能", body);
		return;
	}
	const cards = ui.create.div(".wm-rogue-replace-cards", body);
	for (const id of run.skills) {
		const card = ui.create.div(".wm-rogue-shop-card.wm-rogue-replace-card", cards);
		addSkillHead(card, id);
		const intro = skillInfo(id);
		const desc = ui.create.div(".wm-rogue-shop-desc", intro, card);
		desc.title = intro;
		// 与商店/替换页一致：点卡片看完整描述，按钮上的点击会阻止冒泡，不会连带打开
		bindOverlayTap(card, () => showNotice([skillName(id), intro || "（该技能没有描述）"]));
		const foot = ui.create.div(".wm-rogue-shop-foot", card);
		addOverlayButton("熔炼此技能", foot, () => api.pick(id), "wm-rogue-replace-btn");
	}
}

/**
 * 奇物融合炉：已拥有的奇物各画一张卡，卡上写着「现在什么效果 / 融完升为什么」。
 * 融合费是事件在构建期就定死的数，页面上不重算；经验不够只置灰，钱不够不弹提示。
 */
export function showCurioForge(api) {
	const run = api.getRun();
	const cost = api.action.costExp;
	const body = openEventSubPage(api, "wm-rogue-curio-forge-overlay", "奇物融合炉", `放进炉子的那一件直接升一级品质，融合费 ${cost} 经验。`);
	const list = getUpgradableCurios(run);
	if (!list.length) {
		ui.create.div(".wm-rogue-skills-empty", "没有还能往上融合的奇物", body);
		return;
	}
	const cards = ui.create.div(".wm-rogue-replace-cards", body);
	for (const id of list) {
		const row = buildCurioChoiceCard(cards, id, "融合", target => {
			// 现读存档判经验：够才交回模式层，不够就是置灰、点了毫无反应
			if ((api.getRun().currency?.exp ?? 0) >= cost) {
				api.forge(id);
			}
		});
		paintForge(row, run, cost);
	}
}

/** 画融合炉的一张奇物卡：当前品质 + 当前效果 + 下一档预览 + 融合费 */
function paintForge(row, run, cost) {
	const held = run.currency?.exp ?? 0;
	const nextQuality = getNextCurioQuality(row.id, run.curioQuality);
	paintCurioRarity(row.rarity, getCurioQuality(row.id, run.curioQuality));
	row.effect.textContent = describeCurio(row.id, run.curioQuality).join("\n");
	row.next.textContent = [`融完升为：${CURIOSITY_RARITY[nextQuality] ?? nextQuality}`, ...describeCurioEffects(getCurioEffectAt(row.id, nextQuality))].join("\n");
	const money = moneyName(STAT_CURRENCY);
	const enough = held >= cost;
	row.price.innerHTML = enough ? `融合 ${cost} ${money}` : `融合 ${cost} ${money}（持有 ${held}）`;
	row.button.innerHTML = enough ? "融合" : `${money}不足`;
	setBuyable(row, enough);
}
