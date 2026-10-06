// 图鉴页：公有图鉴的只读展示，不写任何数据。
// 记的是「曾经拥有过」而不是「当前持有」——奇物卖掉/丢弃/被替换后仍留在图鉴里。
// 未收录的条目不挂监听（点了毫无反应），已收录的点开看详情。
// 事件与奇物用顶部的页签二选一显示（每次进图鉴都停在「事件」），两个列表不再纵向连排。

import { events, eventIds } from "../data/events.js";
import { curioIds, getCurio, CURIOSITY_RARITY } from "../data/curios.js";
import { describeCurio, getCurioUpgradeTrack } from "../curioManager.js";
import { FORGE_EXP_MULTIPLIER, MERCHANT_PRICE_MULTIPLIER, RIFT_EXTRA_AFFIXES, RIFT_TIERS, SPRING_DEBT_AFFIXES } from "../config.js";
import { stats } from "../data/stats.js";
import { ui } from "../../../../../noname.js";
import { addOverlayButton, bindOverlayTap, openDetailPopup, openOverlay, showNotice, skillName } from "./common.js";

const signed = value => `${value > 0 ? "+" : ""}${value}`;
const byWin = (factor, noun) => `${factor >= 0 ? "获得" : "消耗"} ${Math.abs(factor)} 倍胜利${noun}`;
/** 只保留一位小数：0.35 → 35%，也躲开 30.000000000000004% 这种浮点尾巴 */
function percentText(chance) {
	if (!Number.isFinite(chance)) {
		return "?%";
	}
	return `${Math.round(chance * 1000) / 10}%`;
}

/**
 * 把一项奖励定义念成人话：读的是事件里的原始键，goldByWin 倍率与 "random" 都还没换算。
 * 第二参是该选项（可省）：statUp 的「全满改送奇物」只在没有 blockedText 的选项上发生，
 * 写了 blockedText 的选项（属性训练场）全满时是「弹提示、什么都不给」，注记不能乱写。
 */
function rewardBrief(reward, choice = null) {
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
	// 古代遗迹三扇门：按初始品质掷一件没拥有的奇物，掷不到折成胜利经验（构建期定死，折算含原 expByWin）。
	// 只在定义里真的写了 expIfNoCurioByWin 时才写「改为」——黑门没写，收集齐了也只是照拿原经验
	if (reward.curioRarity && CURIOSITY_RARITY[reward.curioRarity]) {
		const keep = Number.isFinite(reward.expByWin) ? reward.expByWin : 0;
		const extra = Number.isFinite(reward.expIfNoCurioByWin) ? reward.expIfNoCurioByWin : 0;
		const note = Number.isFinite(reward.expIfNoCurioByWin) && keep + extra > 0
			? `（该品质已集齐时改为获得 ${keep + extra} 倍胜利经验）`
			: "";
		parts.push(`获得一件${CURIOSITY_RARITY[reward.curioRarity]}奇物${note}`);
	} else if (Number.isFinite(reward.expIfNoCurioByWin)) {
		parts.push(byWin(reward.expIfNoCurioByWin, "经验"));
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
		const note = verb > 0
			? (choice?.blockedText ? `（属性已满时：${choice.blockedText}）` : "（三项属性已满时改送一个随机奇物）")
			: "";
		parts.push(`${name} ${verb > 0 ? "+1" : "-1"}${note}`);
	}
	return parts.length ? parts.join("，") : "无奖励";
}

/**
 * 交互型选项（action）在图鉴里的说明：这类选项的奖励不走 reward——构建期才按
 * config 的档位表与当前关卡基准算成固定值，所以这里按**规则**展示，数字一律读 config
 * （RIFT_TIERS / 各倍率），不在图鉴里抄第二份。没有可说的返回 null。
 */
function actionBrief(action) {
	if (!action || typeof action !== "object") {
		return null;
	}
	switch (action.kind) {
		case "rift": {
			const tier = RIFT_TIERS[action.tier];
			if (!tier) {
				return null;
			}
			const affix = RIFT_EXTRA_AFFIXES > 0 ? `，每名敌人自带 ${RIFT_EXTRA_AFFIXES} 个深渊强化` : "";
			return `开一场 ${tier.enemies} 名敌人的裂隙战（不算层数），胜利得本层基准 ${tier.multiplier} 倍金币与经验${affix}`;
		}
		case "merchant":
			return `只卖一件奇物，标价 = 奇物基准价 ×${MERCHANT_PRICE_MULTIPLIER}；买下已拥有的那件会直接升一级品质`;
		case "curioForge":
			return `选一件奇物升一级品质，融合费 = 本层基准经验 ×${FORGE_EXP_MULTIPLIER}`;
		case "abyssDebt":
			return SPRING_DEBT_AFFIXES > 0 ? `下一场战斗每名敌人追加 ${SPRING_DEBT_AFFIXES} 个深渊强化` : null;
		case "skillForge":
			return action.grant === "skill" ? "失去一个技能，换一个随机新技能" : null;
		default:
			return null;
	}
}

/** 奖励与交互说明拼一行：真有奖励就两者都写；纯交互选项不再显示干巴巴的「无奖励」 */
function joinBrief(brief, note) {
	if (!note) {
		return brief;
	}
	return brief === "无奖励" ? note : `${brief}；${note}`;
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
	const note = actionBrief(choice.action);
	const all = Array.isArray(choice.outcomes) ? choice.outcomes : null;
	if (!all || !all.length) {
		return [label, `　${joinBrief(rewardBrief(choice.reward, choice), note)}`];
	}
	const shown = all.filter(item => !isWagerMiss(item?.reward));
	const list = shown.length ? shown : all;
	const head = note ? [label, `　${note}`] : [label];
	return [...head, ...list.map(item => `　${percentText(item?.chance)}：${rewardBrief(item?.reward, choice)}`)];
}

function eventLines(def) {
	// 详情只列选项与结果：名称/介绍卡片上已有，弹层里不再重复
	const lines = [];
	for (const choice of def.choices ?? []) {
		lines.push(...choiceLines(choice));
	}
	return lines;
}

/**
 * 奇物详情：初始效果 + 沿品质链每一档的实际效果，数据一律来自 curioManager 的升级路线，
 * 这里不认识任何一件奇物（新增奇物只要按 curios.js 填字段，图鉴自动就有完整路线）。
 * 只在点击时才建这一份 DOM——列表里十几件奇物的全档位详情不预先生成。
 */
function showCurioDetail(id) {
	const def = getCurio(id);
	if (!def) {
		return;
	}
	const { head, body } = openDetailPopup();
	const art = ui.create.div(".wm-rogue-detail-art", head);
	art.style.backgroundImage = def.image ? `url("${def.image}")` : "none";
	ui.create.div(".wm-rogue-detail-name", def.name, head);
	const rarity = CURIOSITY_RARITY[def.rarity];
	if (rarity) {
		ui.create.div(`.wm-rogue-detail-rarity.wm-rogue-rarity-${def.rarity}`, `初始品质：${rarity}`, head);
	}
	if (def.description) {
		ui.create.div(".wm-rogue-detail-desc", def.description, body);
	}
	const track = getCurioUpgradeTrack(id);
	if (!track.length) {
		ui.create.div(".wm-rogue-detail-same", "（该奇物暂无效果）", body);
		return;
	}
	track.forEach((step, index) => {
		const section = ui.create.div(".wm-rogue-detail-step", body);
		// 首档是「初始」，其余档只有品质名（品质就是本项目的等级）
		const mark = index === 0 ? "初始" : "";
		ui.create.div(
			`.wm-rogue-detail-step-name.wm-rogue-rarity-${step.quality}`,
			mark ? `【${step.label}】 ${mark}` : `【${step.label}】`,
			section,
		);
		if (!step.lines.length) {
			ui.create.div(".wm-rogue-detail-effect", "（该档暂无效果）", section);
		}
		for (const line of step.lines) {
			ui.create.div(".wm-rogue-detail-effect", line.text, section);
		}
		if (index > 0 && !step.changed) {
			ui.create.div(".wm-rogue-detail-same", "（与上一档相同）", section);
		}
	});
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
		bindOverlayTap(card, () => onTap());
	}
	return card;
}

/** 图鉴顶部的分类页签：以后要加第三个分类，在这里多加一行、下面多建一个 pane 就行 */
const INDEX_TABS = [
	{ id: "event", label: "事件" },
	{ id: "relic", label: "奇物" },
];

export function showCollection(api) {
	const stage = openOverlay("wm-rogue-index-overlay");
	const panel = ui.create.div(".wm-rogue-index", stage);

	const titlebar = ui.create.div(".wm-rogue-titlebar", panel);
	ui.create.div(".wm-rogue-title", "图鉴", titlebar);
	addOverlayButton("返回", ui.create.div(".wm-rogue-back", titlebar), () => api.back());

	// 分类页签：只是本页内的显隐开关，点击不换页、不重开浮层，也不碰到卡片
	const tabsBar = ui.create.div(".wm-rogue-index-tabs", panel);
	const tabNodes = {};
	for (const tab of INDEX_TABS) {
		const node = ui.create.div(".wm-rogue-index-tab", tab.label, tabsBar);
		tabNodes[tab.id] = node;
		bindOverlayTap(node, () => setTab(tab.id));
	}

	const body = ui.create.div(".wm-rogue-index-body", panel);

	// 每个分类各自包一个 pane：卡片与监听只建一次，切换只是在 pane 上加减 .wm-rogue-hidden
	const panes = {};
	const collection = api.collection ?? {};
	const discovered = new Set(Array.isArray(collection.events) ? collection.events : []);
	const eventPane = ui.create.div(".wm-rogue-index-pane", body);
	ui.create.div(".wm-rogue-index-section", `事件（${discovered.size}/${eventIds.length}）`, eventPane);
	const eventRow = ui.create.div(".wm-rogue-index-cards", eventPane);
	for (const id of eventIds) {
		const def = events[id];
		buildEntry(eventRow, {
			name: def.name,
			image: def.image,
			desc: def.description,
			known: discovered.has(id),
			onTap: () => showNotice(eventLines(def)),
		});
	}
	panes.event = eventPane;

	const owned = new Set(Array.isArray(collection.curios) ? collection.curios : []);
	const curioPane = ui.create.div(".wm-rogue-index-pane", body);
	ui.create.div(".wm-rogue-index-section", `奇物（${owned.size}/${curioIds.length}）`, curioPane);
	const curioRow = ui.create.div(".wm-rogue-index-cards", curioPane);
	for (const id of curioIds) {
		const def = getCurio(id);
		buildEntry(curioRow, {
			name: def.name,
			image: def.image,
			desc: describeCurio(id).join("；"),
			known: owned.has(id),
			tag: CURIOSITY_RARITY[def.rarity] ?? "",
			tagClass: def.rarity && CURIOSITY_RARITY[def.rarity] ? `wm-rogue-rarity-${def.rarity}` : "",
			onTap: () => showCurioDetail(id),
		});
	}
	panes.relic = curioPane;

	// 页签显隐：按 INDEX_TABS 全量刷新一遍，不写分支链。
	// 默认停在「事件」；每次切换把内容区滚回页首（浮层根节点就是本页的滚动容器）
	const scroller = stage.parentNode;
	function setTab(activeId) {
		for (const tab of INDEX_TABS) {
			const active = tab.id === activeId;
			const tabNode = tabNodes[tab.id];
			const pane = panes[tab.id];
			if (active) {
				tabNode.classList.add("wm-rogue-index-tab-active");
				pane.classList.remove("wm-rogue-hidden");
			} else {
				tabNode.classList.remove("wm-rogue-index-tab-active");
				pane.classList.add("wm-rogue-hidden");
			}
		}
		scroller.scrollTop = 0;
	}
	setTab("event");
}
