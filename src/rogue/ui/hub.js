// 肉鸽 Hub、商店与替换技能页。同样只画界面，一切数据变更走 api 交给 mode.js。
// 排版：所有条目平铺在 dialog.content 下，见 ui/common.js 顶部的说明。

import {
	CURRENCIES,
	CURRENCY_LABEL,
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
import { addGap, addLine, addButton, currentScreenNode, openScreen, skillInfo, skillName, skillOwner, translateCharacter } from "./common.js";

const moneyName = key => CURRENCY_LABEL[key] ?? key;

/** 商店页的活节点，供购买/升级后原位刷新 */
let shopView = null;

function statRow(run) {
	return STAT_IDS.map(id => `${stats[id].name} Lv.${run.stats[id] ?? 0}`).join("　");
}

/** 某项属性升到 level 后的累计加成文案 */
function statBonusText(statId, level) {
	const bonus = sumStatEffects({ [statId]: level });
	const parts = [];
	if (bonus.armor) {
		parts.push(`初始护甲${bonus.armor}`);
	}
	if (bonus.maxHp) {
		parts.push(`体力上限+${bonus.maxHp}`);
	}
	if (bonus.startHand) {
		parts.push(`起手手牌+${bonus.startHand}`);
	}
	if (bonus.extraDraw) {
		parts.push(`摸牌阶段+${bonus.extraDraw}张`);
	}
	if (bonus.handLimit) {
		parts.push(`手牌上限+${bonus.handLimit}`);
	}
	if (bonus.shaDamage) {
		parts.push(`杀伤害+${bonus.shaDamage}`);
	}
	if (bonus.shaLimit) {
		parts.push(`出杀次数+${bonus.shaLimit}`);
	}
	return parts.length ? parts.join("，") : "尚无加成";
}

export function showHub(api) {
	const run = api.run;
	const content = openScreen(MODE_TRANSLATE);

	addLine(content, `<b>${translateCharacter(run.characterId)}</b>`);
	const levelText = run.mode === RUN_MODE.endless
		? `第 ${run.level} 关 / 无尽`
		: `第 ${run.level} / ${run.totalLevels} 关${run.cleared ? "（已通关）" : ""}`;
	addLine(content, `${RUN_MODE_LABEL[run.mode]}　${levelText}`);
	addLine(content, CURRENCIES.map(key => `${moneyName(key)}：${run.currency[key] ?? 0}`).join("　"));
	addLine(content, statRow(run));
	addLine(content, `技能（${run.skills.length}/${SKILL_SLOTS}）：${run.skills.length ? run.skills.map(skillName).join("、") : "无"}`);
	addGap(content);

	const canFight = run.mode === RUN_MODE.challenge ? run.level <= run.totalLevels : true;
	if (run.mode === RUN_MODE.challenge && run.cleared) {
		addButton("重复挑战", content, () => api.startBattle());
	} else {
		addButton(canFight ? "开始下一关" : "开始战斗", content, () => api.startBattle());
	}
	addButton("商店", content, () => api.openShop());
	addButton("存档", content, () => api.backToSlots());
	addButton("退出肉鸽模式", content, () => api.leaveMode());
	if (!canFight) {
		addLine(content, "关卡数已超过配置的总关卡数，请检查 data/stages.js 与 config.js。");
	}
}

export function showShop(api) {
	const run = api.run;
	const content = openScreen("商店");
	const dialog = currentScreenNode();
	const header = addLine(content, shopHeader(run));

	const offerRows = [];
	addLine(content, "点击技能按钮购买");
	for (const offer of run.shopOffers) {
		const cardRow = ui.create.div(".buttons", content);
		const owner = skillOwner(offer.id);
		if (owner) {
			// 武将牌是出处展示：noClick 让它不挂本体的 ui.click.button
			ui.create.button(owner, "character", cardRow, true);
		}
		const button = ui.create.button([offer.id, skillName(offer.id)], "tdnodes", cardRow, true);
		const line = addLine(content, "");
		addLine(content, skillInfo(offer.id));
		const row = { id: offer.id, line, button };
		button.listen(() => {
			if (paintOffer(row, api.getRun()) === "buy") {
				api.buySkill(row.id);
			}
		});
		offerRows.push(row);
		addGap(content);
	}

	const statRows = [];
	addLine(content, "属性强化");
	for (const statId of STAT_IDS) {
		const line = addLine(content, "");
		const row = { statId, line, button: null };
		row.button = addButton("升级", content, () => {
			if (paintStat(row, api.getRun(), api.checkStatUpgrade).ok) {
				api.upgradeStat(statId);
			}
		});
		statRows.push(row);
	}

	addGap(content);
	addButton("返回", content, () => api.backToHub());

	const paintAll = current => {
		const soldOut = isSoldOut(current);
		header.innerHTML = shopHeader(current);
		for (const row of offerRows) {
			paintOffer(row, current, soldOut);
		}
		for (const row of statRows) {
			paintStat(row, current, api.checkStatUpgrade);
		}
	};
	shopView = { dialog, refresh: paintAll };
	paintAll(run);
}

/**
 * 原位刷新商店页（购买/升级后不重开窗口，重开会把滚动位置甩回顶部）。
 * @returns {boolean} 页面还是当初那个商店、已刷新为 true；否则 false，调用方退回整页重绘
 */
export function refreshShop(run) {
	if (!shopView || currentScreenNode() !== shopView.dialog) {
		shopView = null;
		return false;
	}
	shopView.refresh(run);
	return true;
}

/** 本次商店是否已买过技能（SKILL_PURCHASE_COUNT=1 时其余候选算已售罄） */
function isSoldOut(run) {
	return SKILL_PURCHASE_COUNT <= 1 && run.shopOffers.some(offer => offer.sold);
}

function shopHeader(run) {
	const money = CURRENCIES.map(key => `${moneyName(key)} ${run.currency[key] ?? 0}`).join("　");
	return `持有：${money}　技能（${run.skills.length}/${SKILL_SLOTS}）`;
}

/** 画一个技能候选，返回它当前的状态。offer 按 id 从当前存档里取——buySkill 返回的是新对象，握住旧引用会永远读不到 sold */
function paintOffer(row, run, soldOut = isSoldOut(run)) {
	const offer = run.shopOffers.find(item => item.id === row.id);
	const held = run.currency[SKILL_CURRENCY] ?? 0;
	const state = offer.sold ? "sold" : held < offer.price ? "poor" : soldOut ? "soldOut" : "buy";
	const tags = {
		sold: "已购买",
		poor: `余额不足（售价 ${offer.price}，持有 ${held}）`,
		soldOut: "已售罄（本次商店只能购买一个技能）",
		buy: "",
	};
	row.line.innerHTML = `${moneyName(SKILL_CURRENCY)}：${offer.price}${tags[state] ? `　${tags[state]}` : ""}`;
	setBuyable(row.button, state === "buy");
	return state;
}

/** 画一个属性条目，返回升级检查结果 */
function paintStat(row, run, checkStatUpgrade) {
	const check = checkStatUpgrade(row.statId);
	const level = run.stats[row.statId] ?? 0;
	const cfg = stats[row.statId];
	const desc = `${cfg.name} Lv.${level}/${cfg.maxLevel}（${statBonusText(row.statId, level)}）`;
	const held = run.currency[STAT_CURRENCY] ?? 0;
	const tag = Number.isFinite(check.price) ? `${check.error}（需 ${check.price}，持有 ${held}）` : check.error;
	row.line.innerHTML = check.ok ? desc : `${desc}　${tag}`;
	row.button.innerHTML = check.ok ? `升级（${moneyName(STAT_CURRENCY)} ${check.price}）` : "升级";
	setBuyable(row.button, check.ok);
	return check;
}

/** 不可点的条目：本体只有 .menubutton.large.disabled 有灰样式，技能按钮这里补一层透明度 */
function setBuyable(node, buyable) {
	node.classList[buyable ? "remove" : "add"]("disabled");
	node.style.opacity = buyable ? "" : "0.45";
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
