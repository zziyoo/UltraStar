// 胜利结算：入账奖励、推进关卡、清理进行中的战斗标记、按概率刷新奇物候选。纯函数。

import { CURRENCIES, CURIO_SHOP_RATE, RUN_MODE, SKILL_REFRESH_PER_LEVEL } from "./config.js";
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
 * 无尽：关卡无上限地推进；胜利后先掷奇物商店（CURIO_SHOP_RATE，mode.js 里随后的
 * 事件判定排在它之后——先奇物商店、再事件），命中才整批重摇候选，未命中保留上一批没买的。
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

	// 奇物商店：每关胜利后按 CURIO_SHOP_RATE 掷骰（mode.js 的事件判定在它之后，先奇物商店、再事件）。
	// 命中才整批重摇（排除已拥有的、按推进后的新关卡定价）；未命中保留上一批没买的候选；闯关没有奇物商店
	if (run.mode === RUN_MODE.endless) {
		next.curioOffers = rng() < CURIO_SHOP_RATE ? rollCurioOffers(next, rng) : (run.curioOffers ?? []);
	} else {
		next.curioOffers = [];
	}

	return { run: next, gained };
}
