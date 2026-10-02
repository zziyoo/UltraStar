// 肉鸽 Hub、商店与替换技能页。同样只画界面，一切数据变更走 api 交给 mode.js。
// Hub 与替换页是本体 Dialog（条目平铺在 dialog.content 下，见 ui/common.js 顶部说明）；
// 商店是自建浮层 + wm-rogue-shop-* / wm-rogue-stat-* 样式，与存档页同一套承载方式。

import {
	CURRENCIES,
	CURRENCY_LABEL,
	LIBRARY_TEXT,
	MODE_TRANSLATE,
	RUN_MODE,
	RUN_MODE_LABEL,
	SKILL_CURRENCY,
	SKILL_PURCHASE_COUNT,
	SKILL_SLOTS,
	STAT_CURRENCY,
	STAT_IDS,
} from "../config.js";
import { stats, sumStatEffects } from "../data/stats.js";
import { ui } from "../../../../../noname.js";
import {
	addButton,
	addGap,
	addLine,
	addOverlayButton,
	bindOverlayTap,
	currentScreenNode,
	openOverlay,
	openScreen,
	showNotice,
	skillInfo,
	skillName,
	skillOwner,
	translateCharacter,
} from "./common.js";

const moneyName = key => CURRENCY_LABEL[key] ?? key;

/** 商店页的活节点，供购买/升级后原位刷新 */
let shopView = null;

/** 某项属性升到 level 后的累计效果，一行一条。防御的「体力上限」在这里显示，不拆成独立属性 */
function statEffectLines(statId, level) {
	const bonus = sumStatEffects({ [statId]: level });
	const lines = [];
	if (bonus.armor) {
		lines.push(`初始护甲 +${bonus.armor}`);
	}
	if (bonus.maxHp) {
		lines.push(`体力上限 +${bonus.maxHp}`);
	}
	if (bonus.startHand) {
		lines.push(`起手手牌 +${bonus.startHand}`);
	}
	if (bonus.extraDraw) {
		lines.push(`摸牌阶段 +${bonus.extraDraw} 张`);
	}
	if (bonus.handLimit) {
		lines.push(`手牌上限 +${bonus.handLimit}`);
	}
	if (bonus.shaDamage) {
		lines.push(`杀伤害 +${bonus.shaDamage}`);
	}
	if (bonus.shaLimit) {
		lines.push(`出杀次数 +${bonus.shaLimit}`);
	}
	return lines.length ? lines : ["暂无加成"];
}

export function showHub(api) {
	const run = api.run;
	// 肉鸽营地：与商店、技能页同一套自建浮层视觉语言
	const stage = openOverlay("wm-rogue-hub-overlay");
	const panel = ui.create.div(".wm-rogue-hub", stage);

	const titlebar = ui.create.div(".wm-rogue-titlebar", panel);
	ui.create.div(".wm-rogue-hub-who", translateCharacter(run.characterId), titlebar);
	ui.create.div(".wm-rogue-title", MODE_TRANSLATE, titlebar);
	addOverlayButton(
		"技能",
		ui.create.div(".wm-rogue-back", titlebar),
		() => api.openSkills(),
		"wm-rogue-small"
	);

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
		ui.create.div(".wm-rogue-hub-hint", "关卡数已超过配置的总关卡数，请检查 data/stages.js 与 config.js。", body);
	}
}

/** 只读的技能查看页：只展示已购买技能，不买卖、不写存档 */
export function showSkills(api) {
	const run = api.run;
	const stage = openOverlay("wm-rogue-skills-overlay");
	const panel = ui.create.div(".wm-rogue-skills", stage);

	const titlebar = ui.create.div(".wm-rogue-titlebar", panel);
	ui.create.div(".wm-rogue-title", `技能（${run.skills.length}/${SKILL_SLOTS}）`, titlebar);
	addOverlayButton(LIBRARY_TEXT.back, ui.create.div(".wm-rogue-back", titlebar), () => api.backToHub());

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
	const resCells = [
		{ node: addResCell(res, moneyName(SKILL_CURRENCY)), read: current => current.currency[SKILL_CURRENCY] ?? 0 },
		{ node: addResCell(res, moneyName(STAT_CURRENCY)), read: current => current.currency[STAT_CURRENCY] ?? 0 },
		{ node: addResCell(res, "技能"), read: current => `${current.skills.length}/${SKILL_SLOTS}` },
	];

	const body = ui.create.div(".wm-rogue-shop-body", shop);
	ui.create.div(".wm-rogue-shop-section-title", "技能商店", body);
	ui.create.div(".wm-rogue-shop-subtitle", `每次进店最多购买 ${SKILL_PURCHASE_COUNT} 个技能　点卡片可看完整描述`, body);
	const offerRow = ui.create.div(".wm-rogue-shop-cards", body);
	const offerCards = run.shopOffers.map(offer => buildOfferCard(offerRow, offer, api));

	ui.create.div(".wm-rogue-shop-section-title", "属性强化", body);
	const statRow = ui.create.div(".wm-rogue-stat-cards", body);
	const statCards = STAT_IDS.map(statId => buildStatCard(statRow, statId, api));

	const paint = current => {
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
	};
	// 记浮层根节点用于原位刷新的存活判断（openOverlay 返回的是里面的居中层）
	shopView = { node: currentScreenNode(), paint };
	paint(run);
}

function addResCell(parent, label) {
	const cell = ui.create.div(".wm-rogue-res-cell", parent);
	const num = ui.create.div(".wm-rogue-res-num", "", cell);
	ui.create.div(".wm-rogue-res-label", label, cell);
	return num;
}

/** 技能卡的「头」：出处小头像 + 技能名 + 出自行；商店与技能查看页共用同一视觉语言 */
function addSkillHead(card, id) {
	const top = ui.create.div(".wm-rogue-shop-top", card);
	const owner = skillOwner(id);
	if (owner) {
		// 本体给任意 div 都提供了 setBackground（HTMLDivElement.prototype），直接拿它画头像
		ui.create.div(".wm-rogue-shop-avatar", top).setBackground(owner, "character");
	}
	ui.create.div(".wm-rogue-shop-name", skillName(id), top);
	ui.create.div(".wm-rogue-shop-owner", owner ? `出自 ${translateCharacter(owner)}` : "肉鸽专属技能", card);
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
		buy: { price: `${offer.price} ${money}`, button: `购买 · ${offer.price}${money}` },
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

/** 技能槽满时的替换页：选一个已有技能让位 */
export function showReplace(api, offerId) {
	const run = api.run;
	const content = openScreen("选择要替换的技能");

	addLine(content, `新技能：${skillName(offerId)}（槽位 ${run.skills.length}/${SKILL_SLOTS}，必须移除一个）`);
	addGap(content);
	for (const id of run.skills) {
		addLine(content, `<b>${skillName(id)}</b>`);
		addLine(content, skillInfo(id));
		addButton("用新技能替换它", content, () => api.confirmReplace(offerId, id));
		addGap(content);
	}
	addButton("取消购买", content, () => api.backToShop());
}
