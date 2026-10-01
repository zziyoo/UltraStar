// 胜利结算：入账奖励、推进关卡、清理进行中的战斗标记。纯函数。

import { CURRENCIES, RUN_MODE } from "./config.js";
import { getRewardForLevel } from "./data/rewards.js";

/**
 * 闯关：未到总关卡数则进下一关，到达则置 cleared 且关卡不越界（Hub 提供重复挑战）。
 * 无尽：关卡无上限地推进。
 * 两种玩法都会清掉 currentBattle 与上一次的商店候选。
 */
export function settleVictory(run, now) {
	const gained = getRewardForLevel(run.level, CURRENCIES);
	const next = {
		...run,
		currency: { ...run.currency },
		shopOffers: [],
		currentBattle: null,
		updatedAt: now,
	};

	for (const key of Object.keys(gained)) {
		next.currency[key] = (next.currency[key] ?? 0) + gained[key];
	}

	if (run.mode === RUN_MODE.challenge) {
		if (run.level >= run.totalLevels) {
			next.cleared = true;
		} else {
			next.level = run.level + 1;
		}
	} else {
		next.level = run.level + 1;
	}

	return { run: next, gained };
}
