// 胜利结算：入账奖励、推进关卡、清理进行中的战斗标记、生成奇物候选。纯函数。

import { CURRENCIES, RUN_MODE, SKILL_REFRESH_PER_LEVEL } from "./config.js";
import { getChallengeReward, getEndlessReward } from "./data/rewards.js";
import { getBonus, rollCurioOffers } from "./curioManager.js";

/**
 * 奖励一律按「本次刚刚完成的关卡编号」计算：下面的 run.level 在推进之前就是刚打赢的那一关，
 * 所以先取奖励、再推进，绝不能拿递增后的 level 值倒算（无尽 √奖励对这点尤其敏感）。
 *
 * 胜利奖励先按奇物加成（getBonus("goldRate") / getBonus("expRate")）放大再入账；
 * 加成只看这一局开始前就已持有的奇物（run.curios），本局胜利刚换到的不算。
 *
 * 闯关：未到总关卡数则进下一关，到达则置 cleared 且关卡不越界（Hub 提供重复挑战）。
 * 无尽：关卡无上限地推进，胜利后按候选池随机生成三个奇物（价格定死写进存档）。
 * 两种玩法都会清掉 currentBattle 与上一次的商店候选。
 * 免费刷新次数只在「真的通关并进入下一局」时恢复：失败还是同一关，次数必须保持原样，
 * 否则玩家可以靠反复失败白刷商店。
 */
export function settleVictory(run, now, rng = Math.random) {
	const base = run.mode === RUN_MODE.endless
		? getEndlessReward(run.level, CURRENCIES)
		: getChallengeReward(run.level);
	const bonuses = getBonus(run.curios, "goldRate");
	const expBonus = getBonus(run.curios, "expRate");
	const gained = {};
	for (const [key, value] of Object.entries(base)) {
		const rate = key === "gold" ? 1 + bonuses : key === "exp" ? 1 + expBonus : 1;
		gained[key] = Math.max(0, Math.round(value * rate));
	}
	const next = {
		...run,
		currency: { ...run.currency },
		shopOffers: [],
		shopRefreshesRemaining: SKILL_REFRESH_PER_LEVEL,
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

	// 奇物候选每次胜利重掷（排除已拥有的），失败保持原样；闯关模式没有奇物商店。
	// 售价按推进后的新关卡算：这批候选是给下一局的商店用的
	next.curioOffers = run.mode === RUN_MODE.endless ? rollCurioOffers(next, rng) : [];

	return { run: next, gained };
}
