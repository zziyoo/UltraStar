// 失败结算：无尽删档、闯关扣货币、货币不足时的 fallback 惩罚。纯函数。
//
// 规格书对「货币不足」未给出精确判据，本文件的实现是：
// 按比例算下来一项都扣不动（所有货币都已为 0）→ 视为不足 → 走 fallback。
// 只要还有任何一项货币能扣，就按正常比例扣，关卡不后退、不降级、不删技能。

import { CURRENCIES, FAILURE_POLICY, RUN_MODE, STAT_IDS } from "./config.js";
import { stats } from "./data/stats.js";

function rateFor(policy, key) {
	const rate = policy?.currencyLossRate;
	if (Number.isFinite(rate)) {
		return Math.min(1, Math.max(0, rate));
	}
	if (rate && typeof rate === "object") {
		const value = Number(rate[key]);
		return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
	}
	return 0;
}

/** 可执行的 fallback 惩罚；都没有时返回全 false，上层据此跳过惩罚 */
export function getFallbackOptions(run) {
	return {
		canLoseSkill: (run?.skills?.length ?? 0) > 0,
		canLowerStat: STAT_IDS.some(id => (run?.stats?.[id] ?? 0) > 0),
	};
}

/**
 * 失败结算入口。
 * 返回 { kind }：
 *   "delete"   无尽模式，整个存档作废（调用方清空该槽并立即保存）
 *   "currency" 已按比例扣除货币
 *   "fallback" 货币清零，需要玩家选择失去技能或属性降级（run 已含清零结果）
 */
export function settleDefeat(run, now, policy = FAILURE_POLICY) {
	if (run.mode === RUN_MODE.endless) {
		return { kind: "delete", run: null, lost: {}, fallback: getFallbackOptions(run) };
	}

	const currency = { ...run.currency };
	const lost = {};
	let totalPlanned = 0;
	for (const key of CURRENCIES) {
		const value = Number.isFinite(currency[key]) ? Math.max(0, Math.floor(currency[key])) : 0;
		const loss = Math.min(value, Math.ceil(value * rateFor(policy, key)));
		if (loss > 0) {
			lost[key] = loss;
			totalPlanned += loss;
		}
		currency[key] = value - loss;
	}

	const applied = { ...run, currency, currentBattle: null, updatedAt: now };

	if (totalPlanned > 0) {
		return { kind: "currency", run: applied, lost, fallback: getFallbackOptions(applied) };
	}

	const fallback = getFallbackOptions(applied);
	if (!fallback.canLoseSkill && !fallback.canLowerStat) {
		return { kind: "none", run: applied, lost, fallback };
	}
	return { kind: "fallback", run: applied, lost, fallback };
}

/** fallback 之一：失去一个指定技能 */
export function loseSkill(run, skillId, now) {
	if (!run.skills.includes(skillId)) {
		return { ok: false, error: "并未拥有该技能", run };
	}
	return {
		ok: true,
		run: { ...run, skills: run.skills.filter(id => id !== skillId), updatedAt: now },
		removed: skillId,
	};
}

/**
 * Boss 战胜利的强制惩罚之一：随机失去一个已购买技能。
 * 只动 run.skills（肉鸽技能槽，本来就只装购买技能），绝不碰角色本体技能；
 * 一个购买技能都没有时 ok:false 原样返回，不报错、不凑数。
 * 被丢掉的技能不做任何「历史记录」：下次商店仍可再刷出来（当前持有状态过滤，见 shop.js）。
 */
export function loseRandomSkill(run, rng = Math.random, now = 0) {
	const skills = Array.isArray(run?.skills) ? run.skills : [];
	if (!skills.length) {
		return { ok: false, error: "没有可失去的已购买技能", run, removed: null };
	}
	const removed = skills[Math.floor(rng() * skills.length) % skills.length];
	return {
		ok: true,
		error: null,
		run: { ...run, skills: skills.filter(id => id !== removed), updatedAt: now },
		removed,
	};
}

/**
 * Boss 战胜利的强制惩罚之一：随机失去一件已拥有的奇物。
 * 只动 run.curios 与它的品质覆盖表（curioQuality 里那一条一并清掉，别留悬挂数据）；
 * 图鉴（collection.curios 记「曾经拥有过」）不受影响，一件奇物都没有时 ok:false 原样返回。
 */
export function loseRandomCurio(run, rng = Math.random, now = 0) {
	const curios = Array.isArray(run?.curios) ? run.curios : [];
	if (!curios.length) {
		return { ok: false, error: "没有可失去的奇物", run, removed: null };
	}
	const removed = curios[Math.floor(rng() * curios.length) % curios.length];
	const next = {
		...run,
		curios: curios.filter(id => id !== removed),
		curioQuality: { ...(run.curioQuality ?? {}) },
		collection: {
			events: (run.collection?.events ?? []).slice(0),
			curios: (run.collection?.curios ?? []).slice(0),
		},
		updatedAt: now,
	};
	delete next.curioQuality[removed];
	return { ok: true, error: null, run: next, removed };
}

/** fallback 之一：指定属性等级 -1 */
export function lowerStat(run, statId, now) {
	const level = run.stats?.[statId] ?? 0;
	if (!STAT_IDS.includes(statId) || level <= 0) {
		return { ok: false, error: `${stats[statId]?.name ?? statId}已是最低等级`, run };
	}
	return {
		ok: true,
		run: { ...run, stats: { ...run.stats, [statId]: level - 1 }, updatedAt: now },
		statId,
		from: level,
		to: level - 1,
	};
}
