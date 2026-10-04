// EventManager：无尽模式战斗胜利后的事件系统。纯函数，可在 Node 里直接测。
//
// 触发流程（mode.js 编排）：
//   战斗胜利 → settleVictory 结算战斗奖励 → maybeCreatePendingEvent 按概率生成待处理事件
//   → 事件页展示 pendingEvent.choices（玩家选择）→ resolveEventChoice 结算事件奖励 → 返回营地
//
// 存档保证：事件与随机结果在生成时就地定死写进存档（run.pendingEvent），读档恢复优先展示事件页，
// 绝不重新触发、绝不重掷——中途关游戏再回来，看到的还是同一个事件、同一批结果。

import { EVENT_TRIGGER_RATE, RUN_MODE, SKILL_SLOTS } from "./config.js";
import { events, getEvent, eventIds } from "./data/events.js";
import { getCurio } from "./data/curios.js";
import { getEndlessReward } from "./data/rewards.js";
import { stats } from "./data/stats.js";
import { STAT_IDS } from "./config.js";
import { grantRandomCurio } from "./curioManager.js";

/** 战斗胜利后是否触发事件（rng 可注入，方便测试） */
export function shouldTriggerEvent(rng = Math.random) {
	return rng() < EVENT_TRIGGER_RATE;
}

/** 从事件池随机抽一个事件 id（第一版全部同概率） */
export function rollEventId(rng = Math.random) {
	const list = eventIds;
	return list[Math.floor(rng() * list.length)] ?? null;
}

/**
 * 事件奖励在生成（预掷）与读档（清洗）共用的白名单清洗。
 * goldByWin / expByWin 已换算成固定值，不会出现在清洗结果里；
 * curio/skill 引用具体 id 时若已不存在则剔除该键。
 */
export function normalizeEventReward(raw) {
	const reward = {};
	if (!raw || typeof raw !== "object") {
		return reward;
	}
	const int = value => {
		const num = Number(value);
		return Number.isFinite(num) ? Math.floor(num) : 0;
	};
	if (Number.isFinite(Number(raw.gold))) {
		reward.gold = int(raw.gold);
	}
	if (Number.isFinite(Number(raw.exp))) {
		reward.exp = int(raw.exp);
	}
	for (const key of ["curio", "skill"]) {
		const value = raw[key];
		if (value === "random") {
			reward[key] = "random";
		} else if (typeof value === "string" && value) {
			if (key === "curio" ? getCurio(value) : true) {
				reward[key] = value;
			}
		}
	}
	for (const key of ["statUp", "statDown"]) {
		const value = raw[key];
		if (value === "random") {
			reward[key] = "random";
		} else if (STAT_IDS.includes(value)) {
			reward[key] = value;
		}
	}
	return reward;
}

/**
 * 构建一个待处理事件：按胜利奖励基准把 goldByWin / expByWin 换算成固定值，
 * outcomes 当场预掷出唯一结果（写进存档，读档不重掷），statUp/statDown 的具体属性也当场定死。
 * @param {string} eventId 事件 id
 * @param {number} wonLevel 刚刚打赢的关卡编号（奖励基准 = 该关的无尽胜利奖励）
 * @param {() => number} [rng] 可注入的随机源
 * @param {number} [now] createdAt 时间戳
 */
export function buildPendingEvent(eventId, wonLevel, rng = Math.random, now = 0) {
	const event = getEvent(eventId);
	if (!event || !Array.isArray(event.choices) || !event.choices.length) {
		return null;
	}
	const level = Number.isFinite(wonLevel) ? Math.max(1, Math.floor(wonLevel)) : 1;
	const base = getEndlessReward(level, ["gold", "exp"]);
	const choices = [];
	for (const choice of event.choices) {
		if (!choice || typeof choice.text !== "string" || !choice.text.trim()) {
			continue;
		}
		let reward = {};
		if (Array.isArray(choice.outcomes) && choice.outcomes.length) {
			// 预掷：chance 依次累计，落在哪段就取哪段的结果（写进存档后永远是这一个）
			const total = choice.outcomes.reduce((sum, item) => sum + (Number.isFinite(item?.chance) ? item.chance : 0), 0);
			const roll = total > 0 ? rng() * total : 0;
			let acc = 0;
			let picked = choice.outcomes[0]?.reward ?? {};
			for (const item of choice.outcomes) {
				acc += Number.isFinite(item?.chance) ? item.chance : 0;
				if (roll <= acc) {
					picked = item?.reward ?? {};
					break;
				}
			}
			reward = picked;
		} else {
			reward = choice.reward;
		}
		// 先按本次胜利奖励换算倍率（goldByWin / expByWin → 固定值），再走白名单清洗：
		// 存档里只允许出现固定值，绝不保存倍率与随机态
		const clean = normalizeEventReward(scaleReward(reward, base));
		choices.push({ text: choice.text.trim(), reward: clean });
	}
	if (!choices.length) {
		return null;
	}
	return { id: event.id, choices, createdAt: Math.max(0, Math.floor(Number(now) || 0)) };
}

/**
 * 换算倍率奖励：在 normalizeEventReward 之前调用，把 goldByWin / expByWin 折算成固定值。
 * 单独拆出来是为了让 buildPendingEvent 的流程可读：倍率只存在于事件定义里，存档里永远是固定值。
 */
export function scaleReward(reward, base) {
	if (!reward || typeof reward !== "object") {
		return reward;
	}
	const scaled = { ...reward };
	for (const [key, currency] of [["goldByWin", "gold"], ["expByWin", "exp"]]) {
		if (!Number.isFinite(scaled[key])) {
			continue;
		}
		const factor = scaled[key];
		delete scaled[key];
		const baseValue = Number.isFinite(base?.[currency]) ? base[currency] : 0;
		scaled[currency] = Math.round(baseValue * factor);
	}
	return scaled;
}

/**
 * 战斗胜利后调用：无尽模式按概率把刚打赢的关卡换成一个待处理事件。
 * 返回新 run（已写入 pendingEvent 与图鉴「已发现事件」）；未触发时原样返回。
 * 已有待处理事件时绝不重新触发（读档恢复的场景）。
 */
export function maybeCreatePendingEvent(run, wonLevel, now, rng = Math.random) {
	if (!run || run.mode !== RUN_MODE.endless || run.pendingEvent) {
		return run;
	}
	if (!shouldTriggerEvent(rng)) {
		return run;
	}
	const eventId = rollEventId(rng);
	const pendingEvent = buildPendingEvent(eventId, wonLevel, rng, now);
	if (!pendingEvent) {
		return run;
	}
	return {
		...run,
		pendingEvent,
		collection: {
			events: (run.collection?.events ?? []).includes(eventId)
				? (run.collection?.events ?? []).slice(0)
				: [...(run.collection?.events ?? []), eventId],
			curios: (run.collection?.curios ?? []).slice(0),
		},
	};
}

/** 事件页判断某个选项是否可选：负向货币（消耗）超过持有量时置灰 */
export function isChoiceAffordable(run, reward) {
	if (!reward || typeof reward !== "object") {
		return true;
	}
	for (const key of ["gold", "exp"]) {
		const cost = reward[key];
		if (Number.isFinite(cost) && cost < 0 && (run.currency?.[key] ?? 0) < -cost) {
			return false;
		}
	}
	return true;
}

/**
 * 玩家选择后结算事件奖励。返回 { ok, error, run, lines, skillId?, curioId? }；
 * 失败时 run 与传入的 run 是同一份未修改数据。成功时 pendingEvent 清空。
 * @param {object} run 存档
 * @param {number} choiceIndex 玩家点选的选项下标
 * @param {{ candidates?: {id:string}[], characterSkills?: string[] }} [ctx]
 *        技能奖励的候选池与当前角色原生技能（由 mode.js 从 lib 现算后传入，保持本文件纯逻辑）
 * @param {() => number} [rng] 随机奇物/技能的抽取源
 */
export function resolveEventChoice(run, choiceIndex, ctx = {}, rng = Math.random) {
	const pendingEvent = run?.pendingEvent;
	if (!pendingEvent) {
		return { ok: false, error: "当前没有待处理的事件", run };
	}
	const choice = pendingEvent.choices?.[choiceIndex];
	if (!choice) {
		return { ok: false, error: "该选项不存在", run };
	}
	const reward = choice.reward ?? {};
	if (!isChoiceAffordable(run, reward)) {
		return { ok: false, error: "货币不足，无法选择该项", run };
	}

	const next = {
		...run,
		currency: { ...run.currency },
		skills: (run.skills ?? []).slice(0),
		stats: { ...run.stats },
		collection: {
			events: (run.collection?.events ?? []).slice(0),
			curios: (run.collection?.curios ?? []).slice(0),
		},
	};
	const lines = [];
	let skillId = null;
	let curioId = null;

	for (const key of ["gold", "exp"]) {
		const value = reward[key];
		if (!Number.isFinite(value) || !value) {
			continue;
		}
		next.currency[key] = Math.max(0, (next.currency[key] ?? 0) + value);
		const label = { gold: "金币", exp: "经验" }[key];
		lines.push(`${label} ${value > 0 ? "+" : ""}${value}`);
	}

	if (reward.curio === "random") {
		const granted = grantRandomCurio(next, rng);
		if (granted.ok) {
			next.curios = granted.run.curios;
			next.collection.curios = granted.run.collection.curios;
			// grantRandomCurio 会把送出的奇物从商店候选里撤下（已拥有的不得再挂在奇物商店）
			next.curioOffers = granted.run.curioOffers;
			curioId = granted.curioId;
			lines.push(`获得奇物：${getCurio(curioId)?.name ?? curioId}`);
		} else {
			lines.push(granted.error);
		}
	}

	if (reward.skill === "random") {
		if (next.skills.length >= SKILL_SLOTS) {
			lines.push("技能槽已满，未能学会技能");
		} else {
			const excluded = new Set([...next.skills, ...(Array.isArray(ctx.characterSkills) ? ctx.characterSkills : [])]);
			const pool = (Array.isArray(ctx.candidates) ? ctx.candidates : [])
				.map(item => item?.id)
				.filter(id => typeof id === "string" && id && !excluded.has(id));
			if (pool.length) {
				skillId = pool[Math.floor(rng() * pool.length)];
				next.skills.push(skillId);
				lines.push("获得一个随机技能");
			} else {
				lines.push("没有可学的技能");
			}
		}
	}

	for (const [key, verb] of [["statUp", 1], ["statDown", -1]]) {
		const statId = reward[key];
		if (!STAT_IDS.includes(statId)) {
			continue;
		}
		const cfg = stats[statId];
		const from = next.stats[statId] ?? 0;
		const to = Math.min(cfg.maxLevel, Math.max(0, from + verb));
		next.stats[statId] = to;
		const label = cfg.name ?? statId;
		if (to === from) {
			lines.push(verb > 0 ? `${label}已达最高等级，未生效` : `${label}已是最低等级，未生效`);
		} else {
			lines.push(`${label} Lv.${from} → Lv.${to}`);
		}
	}

	next.pendingEvent = null;
	return { ok: true, error: null, run: next, lines, skillId, curioId };
}

export { events, eventIds, getEvent };
