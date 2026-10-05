// 图鉴页：公有图鉴的只读展示，不写任何数据。
// 记的是「曾经拥有过」而不是「当前持有」——奇物卖掉/丢弃/被替换后仍留在图鉴里。
// 未收录的条目不挂监听（点了毫无反应），已收录的点开看详情。

import { events, eventIds } from "../data/events.js";
import { curioIds, getCurio, CURIOSITY_RARITY } from "../data/curios.js";
import { describeCurio } from "../curioManager.js";
import { stats } from "../data/stats.js";
import { ui } from "../../../../../noname.js";
import { addOverlayButton, bindOverlayTap, openOverlay, showNotice, skillName } from "./common.js";

const signed = value => `${value > 0 ? "+" : ""}${value}`;
const byWin = (factor, noun) => `${factor >= 0 ? "获得" : "消耗"} ${Math.abs(factor)} 倍胜利${noun}`;
/** 只保留一位小数：0.35 → 35%，也躲开 30.000000000000004% 这种浮点尾巴 */
function percentText(chance) {
	if (!Number.isFinite(chance)) {
		return "?%";
	}
	return `${Math.round(chance * 1000) / 10}%`;
}

/** 把一项奖励定义念成人话：读的是事件里的原始键，goldByWin 倍率与 "random" 都还没换算 */
function rewardBrief(reward) {
	if (!reward || typeof reward !== "object") {
		return "无奖励";
	}
	const parts = [];
	if (Number.isFinite(reward.gold)) {
		parts.push(`金币 ${signed(reward.gold)}`);
	}
	if (Number.isFinite(reward.exp)) {
		parts.push(`经验 ${signed(reward.exp)}`);
	}
	if (Number.isFinite(reward.goldByWin)) {
		parts.push(byWin(reward.goldByWin, "金币"));
	}
	if (Number.isFinite(reward.expByWin)) {
		parts.push(byWin(reward.expByWin, "经验"));
	}
	if (Number.isFinite(reward.goldPct) && reward.goldPct) {
		const wager = `投入当前金币的 ${Math.abs(reward.goldPct)}%`;
		const payout = reward.goldPayout;
		parts.push(Number.isFinite(payout) && payout > 0 ? `${wager}，愿望达成按 ${payout} 倍返还` : `${wager}，愿望落空、投入全丢`);
	}
	if (reward.curio === "random") {
		parts.push("获得一个随机奇物");
	} else if (reward.curio) {
		parts.push(`获得奇物：${getCurio(reward.curio)?.name ?? reward.curio}`);
	}
	if (reward.skill === "random") {
		parts.push("学习一个随机技能");
	} else if (reward.skill) {
		parts.push(`学习技能：${skillName(reward.skill)}`);
	}
	for (const [key, verb] of [["statUp", 1], ["statDown", -1]]) {
		const statId = reward[key];
		if (!statId) {
			continue;
		}
		const name = statId === "random" ? "随机一项属性" : (stats[statId]?.name ?? statId);
		const note = verb > 0 ? "（三项属性已满时改送一个随机奇物）" : "";
		parts.push(`${name} ${verb > 0 ? "+1" : "-1"}${note}`);
	}
	return parts.length ? parts.join("，") : "无奖励";
}

/** 赌局里「投入了但没中」那一支：投入已写在命中行里，图鉴不再重复失败结果 */
function isWagerMiss(reward) {
	return Number.isFinite(reward?.goldPct) && !!reward.goldPct
		&& !(Number.isFinite(reward?.goldPayout) && reward.goldPayout > 0);
}

/**
 * 选项名单独一行，会拿到什么缩进写在下面；固定奖励与赌局的每一支同版式。
 * 概率照写不藏——图鉴是收集册，事件页才讲「不剧透」。
 */
function choiceLines(choice) {
	const label = `「${choice.text}」`;
	const all = Array.isArray(choice.outcomes) ? choice.outcomes : null;
	if (!all || !all.length) {
		return [label, `　${rewardBrief(choice.reward)}`];
	}
	const shown = all.filter(item => !isWagerMiss(item?.reward));
	const list = shown.length ? shown : all;
	return [label, ...list.map(item => `　${percentText(item?.chance)}：${rewardBrief(item?.reward)}`)];
}

function eventLines(def) {
	const lines = [def.name];
	if (def.description) {
		lines.push(def.description);
	}
	for (const choice of def.choices ?? []) {
		lines.push(...choiceLines(choice));
	}
	return lines;
}

function curioLines(id) {
	const def = getCurio(id);
	const rarity = CURIOSITY_RARITY[def.rarity];
	const lines = [rarity ? `${def.name}（${rarity}）` : def.name];
	if (def.description) {
		lines.push(def.description);
	}
	lines.push(...describeCurio(id));
	return lines;
}

function buildEntry(parent, { name, image, desc, known, tag, tagClass, onTap }) {
	const classes = [".wm-rogue-index-card"];
	if (known) {
		classes.push(".wm-rogue-index-known", ".wm-rogue-index-clickable");
	}
	const card = ui.create.div(classes.join(""), parent);
	const art = ui.create.div(".wm-rogue-index-art", card);
	if (known && image) {
		art.style.backgroundImage = `url("${image}")`;
	} else {
		art.style.backgroundImage = "none";
		ui.create.div(".wm-rogue-index-unknown", "？？？", art);
	}
	ui.create.div(".wm-rogue-index-name", known ? name : "未发现", card);
	if (known && tag) {
		ui.create.div(tagClass ? `.wm-rogue-index-tag.${tagClass}` : ".wm-rogue-index-tag", tag, card);
	}
	ui.create.div(".wm-rogue-index-desc", known ? desc : "尚未遇见的际遇。", card);
	if (known && onTap) {
		bindOverlayTap(card, () => showNotice(onTap()));
	}
	return card;
}

export function showCollection(api) {
	const stage = openOverlay("wm-rogue-index-overlay");
	const panel = ui.create.div(".wm-rogue-index", stage);

	const titlebar = ui.create.div(".wm-rogue-titlebar", panel);
	ui.create.div(".wm-rogue-title", "图鉴", titlebar);
	addOverlayButton("返回", ui.create.div(".wm-rogue-back", titlebar), () => api.back());

	const body = ui.create.div(".wm-rogue-index-body", panel);

	const collection = api.collection ?? {};
	const discovered = new Set(Array.isArray(collection.events) ? collection.events : []);
	ui.create.div(".wm-rogue-index-section", `事件（${discovered.size}/${eventIds.length}）`, body);
	const eventRow = ui.create.div(".wm-rogue-index-cards", body);
	for (const id of eventIds) {
		const def = events[id];
		buildEntry(eventRow, {
			name: def.name,
			image: def.image,
			desc: def.description,
			known: discovered.has(id),
			onTap: () => eventLines(def),
		});
	}

	const owned = new Set(Array.isArray(collection.curios) ? collection.curios : []);
	ui.create.div(".wm-rogue-index-section", `奇物（${owned.size}/${curioIds.length}）`, body);
	const curioRow = ui.create.div(".wm-rogue-index-cards", body);
	for (const id of curioIds) {
		const def = getCurio(id);
		buildEntry(curioRow, {
			name: def.name,
			image: def.image,
			desc: describeCurio(id).join("；"),
			known: owned.has(id),
			tag: CURIOSITY_RARITY[def.rarity] ?? "",
			tagClass: def.rarity && CURIOSITY_RARITY[def.rarity] ? `wm-rogue-rarity-${def.rarity}` : "",
			onTap: () => curioLines(id),
		});
	}
}
