// 胜利结算：入账奖励、推进关卡、清理进行中的战斗标记、按概率刷新奇物候选。纯函数。

import { CURRENCIES, CURIO_SHOP_RATE, RUN_MODE, SKILL_REFRESH_PER_LEVEL } from "./config.js";
import { getChallengeReward, getEndlessReward } from "./data/rewards.js";
import { getBonus, rollCurioOffers } from "./curioManager.js";

/**
 * 奖励一律按「本次刚刚完成的关卡编号」计算：下面的 run.level 在推进之前就是刚打赢的那一关，
 * 所以先取奖励、再推进，绝不能拿递增后的 level 值倒算（无尽 √奖励对这点尤其敏感）。
 *
 * 胜利奖励先按奇物加成（getBonus("goldRate") / getBonus("expRate")，按 run.curioQuality 取当前品质）
 * 放大再入账；加成只看这一局开始前就已持有的奇物（run.curios），本局胜利刚换到的不算。
 * 诅咒金币的波动档（goldRate + goldRateSpread）在这里掷一次：只在真有波动半径时才消费 rng，
 * 别的存档的随机序列不受影响。
 *
 * 闯关：未到总关卡数则进下一关，到达则置 cleared 且关卡不越界（Hub 提供重复挑战）。
 * 无尽：关卡无上限地推进；胜利后先掷奇物商店（CURIO_SHOP_RATE，mode.js 里随后的
 * 事件判定排在它之后——先奇物商店、再事件），命中才整批重摇候选，未命中清空（不留旧批次）。
 * 两种玩法都会清掉 currentBattle 与上一次的商店候选。
 * 免费刷新次数只在「真的通关并进入下一局」时恢复：失败还是同一关，次数必须保持原样，
 * 否则玩家可以靠反复失败白刷商店。
 */
export function settleVictory(run, now, rng = Math.random) {
	const base = run.mode === RUN_MODE.endless
		? getEndlessReward(run.level, CURRENCIES)
		: getChallengeReward(run.level);
	const quality = run.curioQuality;
	const spread = Math.abs(getBonus(run.curios, "goldRateSpread", quality));
	const goldRate = 1 + getBonus(run.curios, "goldRate", quality) + (spread > 0 ? (rng() * 2 - 1) * spread : 0);
	const expRate = 1 + getBonus(run.curios, "expRate", quality);
	const gained = {};
	for (const [key, value] of Object.entries(base)) {
		const rate = key === "gold" ? goldRate : key === "exp" ? expRate : 1;
		gained[key] = Math.max(0, Math.round(value * rate));
	}
	const next = {
		...run,
		currency: { ...run.currency },
		shopOffers: [],
		// 循环按钮：每场战斗结束额外补一次刷新（只看开战前已持有的奇物，本局换到的不算）
		shopRefreshesRemaining: SKILL_REFRESH_PER_LEVEL + getBonus(run.curios, "extraShopRefresh", quality),
		currentBattle: null,
		updatedAt: now,
	};

	for (const key of Object.keys(gained)) {
		next.currency[key] = (next.currency[key] ?? 0) + gained[key];
	}

	// 储蓄罐：乘的是「此刻手上的金币总额」，不是本关基础奖励，所以必须排在上面入账之后
	// （两者会叠乘：先被 goldRate 放大、再按放大后的余额抽一成，这是刻意的）。
	// 向下取整，余额不足 1/比例 时一分钱也不额外给。
	const ofHeld = getBonus(run.curios, "goldOfHeld", quality);
	if (ofHeld > 0) {
		const bonus = Math.floor((next.currency.gold ?? 0) * ofHeld);
		if (bonus > 0) {
			next.currency.gold += bonus;
			gained.gold = (gained.gold ?? 0) + bonus;
		}
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
	// 命中就整批重摇（排除已拥有的、按推进后的新关卡定价），**未命中直接清空**——
	// 旧版本把没买的候选一直留着，结果同一批奇物能挂十几关不动，商店看着像坏了；
	// 现在「看得见商店」等价于「这一关刚刷出新货」。闯关没有奇物商店。
	//
	// 黄金罗盘再单独掷一次，命中就多出一批：两批互不排斥，所以同一关可能「买完一批还有一批」——
	// 第一批被买走时整批下架，队列里的第二批随即提上货架（见 curioManager.buyCurio）。
	// 第二批摇的时候把第一批已挂出去的 id 一起排掉，免得同一件货在两家货架上重复出现。
	if (run.mode === RUN_MODE.endless) {
		const batches = [];
		if (rng() < CURIO_SHOP_RATE) {
			batches.push(rollCurioOffers(next, rng));
		}
		const compass = getBonus(run.curios, "extraCurioShopChance", quality);
		if (compass > 0 && rng() < compass) {
			const first = batches[0] ?? [];
			batches.push(rollCurioOffers(next, rng, first.map(item => item?.id)));
		}
		const stocked = batches.filter(batch => batch.length);
		next.curioOffers = stocked[0] ?? [];
		next.curioOfferQueue = stocked.slice(1);
	} else {
		next.curioOffers = [];
		next.curioOfferQueue = [];
	}

	return { run: next, gained };
}
