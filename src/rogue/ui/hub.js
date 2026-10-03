// 肉鸽 Hub、商店与替换技能页。同样只画界面，一切数据变更走 api 交给 mode.js。
// 各页面都是自建浮层 + wm-rogue-* 样式（见 ui/common.js 顶部说明）；
// 替换页与商店共用同一套技能卡渲染（addSkillHead / wm-rogue-shop-desc / sanitizeSkillText）。

import {
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
import { getRefreshesRemaining } from "../shop.js";
import { describeStatEffects, stats, sumStatEffects } from "../data/stats.js";
import { ui } from "../../../../../noname.js";
import {
	addOverlayButton,
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

/** 商店页的活节点，供购买/升级后原位刷新 */
let shopView = null;

/** 某项属性升到 level 后的累计效果，一行一条；文案在 data/stats.js，与战斗中的「强化」标记共用 */
function statEffectLines(statId, level) {
	const lines = describeStatEffects(sumStatEffects({ [statId]: level }));
	return lines.length ? lines : ["暂无加成"];
}

export function showHub(api) {
	const run = api.run;
	// 肉鸽营地：与商店、技能页同一套自建浮层视觉语言
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

	const actions = ui.create.div(".wm-rogue-hub-actions", body);
	const fightLabel = run.mode === RUN_MODE.challenge && run.cleared ? "重复挑战" : canFight ? "开始下一关" : "开始战斗";
	addOverlayButton(fightLabel, actions, () => api.startBattle(), "wm-rogue-hub-primary");
	addOverlayButton("商店", actions, () => api.openShop(), "wm-rogue-hub-shop");
	addOverlayButton("返回存档", actions, () => api.backToSlots(), "wm-rogue-small");
	addOverlayButton("退出肉鸽模式", actions, () => api.leaveMode(), "wm-rogue-small");
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

	const body = ui.create.div(".wm-rogue-shop-body", shop);
	// 刷新按钮属于「技能商店」这一分区：紧贴标题右侧，不放页面顶部、也不跟右上角的返回挤在一起
	const offerHead = ui.create.div(".wm-rogue-shop-section-row", body);
	ui.create.div(".wm-rogue-shop-section-title", "技能商店", offerHead);
	const refreshButton = addOverlayButton("", offerHead, () => api.refreshSkills(), "wm-rogue-shop-refresh");
	ui.create.div(".wm-rogue-shop-subtitle", `每次进店最多购买 ${SKILL_PURCHASE_COUNT} 个技能　点卡片可看完整描述`, body);
	const offerRow = ui.create.div(".wm-rogue-shop-cards", body);
	const offerCards = run.shopOffers.map(offer => buildOfferCard(offerRow, offer, api));

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

	const paint = current => {
		syncOffers(current);
		for (const cell of resCells) {
			cell.node.innerHTML = `${cell.read(current)}`;
		}
		const soldOut = isSoldOut(current);
		for (const row of offerCards) {
			paintOffer(row, current, soldOut);
		}
		for (const row of statCards) {
			paintStat(row, current, api.checkStatUpgrade);
		}
		paintRefresh(refreshButton, current, soldOut);
	};
	// 记浮层根节点用于原位刷新的存活判断（openOverlay 返回的是里面的居中层）
	shopView = { node: currentScreenNode(), paint };
	paint(run);
}

/** 刷新按钮的文字与可用性：本局买过技能就彻底锁死——重掷会把 sold 换成 false，放行等于绕过一局限买一个 */
function paintRefresh(node, run, soldOut) {
	const remaining = getRefreshesRemaining(run);
	node.innerHTML = soldOut ? "本局已购买" : `刷新 ${remaining}/${SKILL_REFRESH_PER_LEVEL}`;
	node.classList[soldOut || remaining <= 0 ? "add" : "remove"]("wm-rogue-disabled");
}

function addResCell(parent, label) {
	const cell = ui.create.div(".wm-rogue-res-cell", parent);
	const num = ui.create.div(".wm-rogue-res-num", "", cell);
	ui.create.div(".wm-rogue-res-label", label, cell);
	return num;
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

/** 本次商店是否已买过技能（SKILL_PURCHASE_COUNT=1 时其余候选算已售罄） */
function isSoldOut(run) {
	return SKILL_PURCHASE_COUNT <= 1 && run.shopOffers.some(offer => offer.sold);
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
