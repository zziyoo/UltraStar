// 失败结算：无尽删档、闯关扣货币、货币不足时的 fallback 惩罚；
// 外加**统一的「真正失去技能」操作**（loseSkill / loseSkills）：从背包删除、已装备的一并卸下、
// 按持有的遗忘之石/贪食魔盒（当前品质）结算金币与经验。纯函数。
//
// 规格书对「货币不足」未给出精确判据，本文件的实现是：
// 按比例算下来一项都扣不动（所有货币都已为 0）→ 视为不足 → 走 fallback。
// 只要还有任何一项货币能扣，就按正常比例扣，关卡不后退、不降级、不删技能。

import { CURRENCIES, FAILURE_POLICY, RUN_MODE, STAT_IDS } from "./config.js";
import { getSkillLossRewardExp, getSkillLossRewardGold } from "./curioManager.js";
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

/** 可执行的 fallback 惩罚；都没有时返回全 false，上层据此跳过惩罚。技能按**完整背包**算（含未装备的） */
export function getFallbackOptions(run) {
	return {
		canLoseSkill: (run?.skillInventory?.length ?? 0) > 0,
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

/**
 * 统一的「真正失去技能」操作（v14）：**所有**真正删除技能的路径都走这里，别再各写一套。
 * 语义（缺一不可）：
 *   · 只从 run.skillInventory 删除——那才是「拥有」的权威列表；run.skills 只是装备视图；
 *   · 被删的技能若当前装备着，同时从 run.skills 卸下（装备 ⊆ 背包的不变量继续成立）；
 *   · 每失去一个技能按**当前持有的奇物与品质**结算一次奖励：遗忘之石发本层胜利金币 ×N（goldOnSkillLoss）、
 *     贪食魔盒发本层胜利经验 ×N（expOnSkillLoss）——一次删 N 个就发 N 次，绝不合并成一次、
 *     也不叠加 Boss 倍率（基准口径见 curioManager.getSkillLossRewardGold/Exp）；
 *   · 没有任何技能真的被删（未拥有/空列表）时 ok:false、零副作用、一分钱不发；
 *   · 只卸下装备（unequipSkill）不算失去，不走这里。
 * 返回 { ok, error, run, removed: string[], gold, exp, lines }：奖励已并进 run.currency，
 * 删除与奖励是同一次提交的一部分，调用方落盘一次即全部生效（绝不重复发奖）。
 * @param {string[]} skillIds 想失去的技能；其中未拥有的会被忽略
 * @param {number} [level] 奖励基准关卡；省略时取 run.level。
 *   **Boss 胜利流程必须显式传「刚打赢的那一关」**：胜利结算已经把 run.level 推进到下一关，
 *   不传就会拿下一关的基准发遗石/魔盒奖励（其余路径传不传都一样，因为它们的 run.level 没被推进过）
 */
export function loseSkills(run, skillIds, now = 0, level = run?.level) {
	const inventory = Array.isArray(run?.skillInventory) ? run.skillInventory : [];
	const removed = [];
	for (const raw of Array.isArray(skillIds) ? skillIds : []) {
		const skillId = typeof raw === "string" ? raw : "";
		if (skillId && inventory.includes(skillId) && !removed.includes(skillId)) {
			removed.push(skillId);
		}
	}
	if (!removed.length) {
		return { ok: false, error: "没有可失去的技能", run, removed: [], gold: 0, exp: 0, lines: [] };
	}
	const removedSet = new Set(removed);
	const next = {
		...run,
		skillInventory: inventory.filter(id => !removedSet.has(id)),
		skills: (Array.isArray(run.skills) ? run.skills : []).filter(id => !removedSet.has(id)),
		currency: { ...run.currency },
		updatedAt: now,
	};
	// 按件结算：每失去一个技能各算一次（Boss 一次清除 3 个装备技能 = 3 次技能失去奖励）
	const gold = removed.length * getSkillLossRewardGold(run, level);
	const exp = removed.length * getSkillLossRewardExp(run, level);
	if (gold > 0) {
		next.currency.gold = (next.currency.gold ?? 0) + gold;
	}
	if (exp > 0) {
		next.currency.exp = (next.currency.exp ?? 0) + exp;
	}
	const lines = [];
	if (gold > 0) {
		lines.push(`遗忘之石把失去的技能折成了 ${gold} 金币。`);
	}
	if (exp > 0) {
		lines.push(`贪食魔盒吞下失去的技能，吐回 ${exp} 点经验。`);
	}
	return { ok: true, error: null, run: next, removed, gold, exp, lines };
}

/** loseSkills 的单件版：失去一个指定技能（失败也走同一条：不可失去时 ok:false、零副作用）；基准关卡的语义见 loseSkills */
export function loseSkill(run, skillId, now = 0, level = run?.level) {
	const result = loseSkills(run, [skillId], now, level);
	if (!result.ok) {
		return { ok: false, error: "并未拥有该技能", run, removed: null, gold: 0, exp: 0, lines: [] };
	}
	return { ...result, removed: result.removed[0] };
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

/**
 * Boss 惩罚的候选名单：只报这一份存档此刻真实持有的东西。
 * v14 起技能惩罚不再需要玩家挑选（Boss 胜利当场自动失去**全部装备技能**），
 * 所以这里的 skills 只作「当前装备的是哪几个」的读数（结算与迁移清算都用 run.skills 现取）；
 * 玩家还要自己选的是奇物：curios 只认 run.curios。
 * 返回的是新建数组，调用方怎么排布都不会污染 run。
 */
export function getBossPenaltyTargets(run) {
	return {
		skills: (Array.isArray(run?.skills) ? run.skills : []).slice(0),
		curios: (Array.isArray(run?.curios) ? run.curios : []).slice(0),
	};
}

/**
 * v13 旧档迁移专用：从**已经推进过**的存档里还原「刚打赢的那一关」，用作失去技能的奖励基准。
 * 旧版的待处理 Boss 惩罚是在胜利结算、关卡推进之后才写进存档的（档案里没有 wonLevel），
 * 但推进规则是确定的，照它反推即可：
 *   · 无尽：每胜利必 +1 → 刚打赢的那一关 = level - 1；
 *   · 闯关没打完最后一关（cleared 为假）：同样 +1 → level - 1；
 *   · 闯关刚好打通最后一关：level 原地不动、只记 cleared → 刚打赢的那一关 = level 本身。
 * 只服务这一条迁移路径；正常 Boss 胜利流程手里就有 wonLevel，不许拿它反推、更不许拿它当通用口径。
 * 下限夹到第 1 关（异常存档不返回 0 或负数）。
 */
export function recoverBossWonLevel(run) {
	const level = Number.isFinite(run?.level) ? Math.max(1, Math.floor(run.level)) : 1;
	if (run?.mode === RUN_MODE.challenge && run?.cleared === true) {
		return level;
	}
	return Math.max(1, level - 1);
}

/**
 * Boss 战胜利惩罚之二（玩家自选版）：失去指定的那一件已拥有奇物。
 * 与 loseCurio / 奇物商店的清理纪律同一条：`curioQuality` 里那一条一并删掉（不留悬挂覆盖表项），
 * 图鉴 `collection.curios` 的「曾经拥有过」一个字都不动；未拥有时 ok:false 且零副作用。
 */
export function loseCurio(run, curioId, now = 0) {
	const curios = Array.isArray(run?.curios) ? run.curios : [];
	if (!curios.includes(curioId)) {
		return { ok: false, error: "并未拥有该奇物", run, removed: null };
	}
	const next = {
		...run,
		curios: curios.filter(id => id !== curioId),
		curioQuality: { ...(run.curioQuality ?? {}) },
		collection: {
			events: (run.collection?.events ?? []).slice(0),
			curios: (run.collection?.curios ?? []).slice(0),
		},
		updatedAt: now,
	};
	delete next.curioQuality[curioId];
	return { ok: true, error: null, run: next, removed: curioId };
}
