// 胜利结算：入账奖励、推进关卡、清理进行中的战斗标记、按概率刷新奇物候选。纯函数。

import { BOSS_EXP_MULTIPLIER, BOSS_REWARD_MULTIPLIER, CURRENCIES, RUN_MODE, SKILL_REFRESH_PER_LEVEL } from "./config.js";
import { getChallengeReward, getEndlessReward } from "./data/rewards.js";
import { getBonus, getCurioShopChance, isShopLocked, rollCurioOffers, takeNextCurioBatch } from "./curioManager.js";
import { hasBuyableSkillOffer } from "./shop.js";

/**
 * 奖励一律按「本次刚刚完成的关卡编号」计算：下面的 run.level 在推进之前就是刚打赢的那一关，
 * 所以先取奖励、再推进，绝不能拿递增后的 level 值倒算（无尽 √奖励对这点尤其敏感）。
 *
 * Boss 战（本场战斗 currentBattle.isBossBattle，创建战斗时逐场判定）的胜利奖励 = 本关胜利金币基准 ×BOSS_REWARD_MULTIPLIER、
 * 本关胜利经验基准 ×BOSS_EXP_MULTIPLIER。
 * 倍率只乘「基准」这一次：不再叠加奇物的金币/经验加成（goldRate / expRate / 波动半径），
 * 与深渊裂隙同一条「胜利加成不生效」的口径——绝不把固定倍率乘到经加成放大后的最终值上。
 * 其余结算（推关卡、刷新次数恢复、储蓄罐、事件判定）与普通胜利保持一致。
 *
 * 胜利奖励先按奇物加成（getBonus("goldRate") / getBonus("expRate")，按 run.curioQuality 取当前品质）
 * 放大再入账；加成只看这一局开始前就已持有的奇物（run.curios），本局胜利刚换到的不算。
 * 诅咒金币的波动档（goldRate + goldRateSpread）在这里掷一次：只在真有波动半径时才消费 rng，
 * 别的存档的随机序列不受影响。
 *
 * 闯关：未到总关卡数则进下一关，到达则置 cleared 且关卡不越界（Hub 提供重复挑战）。
 * 无尽：关卡无上限地推进；胜利后先掷奇物商店（概率 = curioManager.getCurioShopChance(本存档)，
 * mode.js 里随后的事件判定排在它之后——先奇物商店、再事件）。未锁定时命中才重摇，未命中清空；
 * 已锁定时保留同一批已购/未购卡，只有未购卡可在后续关卡继续购买。
 * Boss 战胜利**不再**特殊刷新奇物商店：这一掷与普通胜利同一条概率、同一个分支。
 * 两种玩法都会清掉 currentBattle 与上一次的商店候选；唯一例外是收藏家的橱窗锁住的那一类：
 * 技能商店锁着就保留这批候选（买过的那张继续挂在货架上显示「已购买」，只是打上 carried 不再吃
 * 新的一局的购买额度，免费刷新次数照常刷新），奇物商店锁着就整批留货（不再掷刷新概率、不置空）；
 * 锁着但货架本来就是空的一律照常走原流程。
 * 免费刷新次数只在「真的通关并进入下一局」时恢复：失败还是同一关，次数必须保持原样，
 * 否则玩家可以靠反复失败白刷商店。
 */
export function settleVictory(run, now, rng = Math.random) {
	// 本场是不是 Boss 战：必须在下面把 currentBattle 置空之前取出来。它只属于刚打完的这一场，
	// 下一场由 flow/battle.js 独立重掷，所以这里绝不能反过来把它写回 next。
	const isBossBattle = run.currentBattle?.isBossBattle === true;
	// 万象武装匣：这一场临时装备的技能 id 也必须在 currentBattle 清空前取出。
	// Boss 胜利时它要和 run.skills 一起走 loseSkills 永久失去；普通胜利则随 currentBattle 丢弃。
	const tempSkill = typeof run.currentBattle?.tempSkill === "string" ? run.currentBattle.tempSkill : null;
	const base = run.mode === RUN_MODE.endless
		? getEndlessReward(run.level, CURRENCIES)
		: getChallengeReward(run.level);
	// Boss 战：先在基准上按货币各乘一次固定倍率，下面的加成分支全部按 1 处理（见顶部说明）
	if (isBossBattle) {
		for (const [key, value] of Object.entries(base)) {
			base[key] = value * (key === "exp" ? BOSS_EXP_MULTIPLIER : BOSS_REWARD_MULTIPLIER);
		}
	}
	const quality = run.curioQuality;
	const spread = isBossBattle ? 0 : Math.abs(getBonus(run.curios, "goldRateSpread", quality));
	const goldRate = isBossBattle ? 1 : 1 + getBonus(run.curios, "goldRate", quality) + (spread > 0 ? (rng() * 2 - 1) * spread : 0);
	const expRate = isBossBattle ? 1 : 1 + getBonus(run.curios, "expRate", quality);
	const gained = {};
	for (const [key, value] of Object.entries(base)) {
		const rate = key === "gold" ? goldRate : key === "exp" ? expRate : 1;
		gained[key] = Math.max(0, Math.round(value * rate));
	}
	// 技能商店：锁着且还有「仍有购买价值」的候选才保留这一批；
	// 已全售出/已拥有/失效时同一个判据同时清空候选并解除锁定。
	// 本局次数与金币不足不在判据里——它们只是暂时买不了，不能因此丢掉锁着的货。
	const keepSkillOffers = isShopLocked(run, "skill") && hasBuyableSkillOffer(run);
	const next = {
		...run,
		currency: { ...run.currency },
		// 收藏家的橱窗锁着技能商店：这一批候选连价格一起留到下一关，**买过的那张也留在货架上，
		// 照旧显示「已购买」**（用户定稿：下次刷新时那个技能仍要保留，和正常购买一样显示已购买）。
		// 但留货不能连购买额度一起留：新的一局等于新的一次进店，所以本关买掉的那些打上 carried，
		// 由 shop.js 的 getPurchasedCount 排除在「本局购买数」之外，别把整排货架锁死
		// （旧规格原话：免费的刷新次数要刷新，只是三个技能不刷新。v15 起这条只对「解锁」状态成立：
		//  技能商店锁着时连免费刷新也用不了，见 shop.refreshSkillOffers 的第一道门槛）。
		// 全售罄/空货架时不再保留，并当场解锁；下一次真正胜利后由 openShop 现摇新一批
		shopOffers: keepSkillOffers
			? run.shopOffers.map(offer => ({ ...offer, carried: offer.sold === true }))
			: [],
		skillShopLocked: keepSkillOffers,
		// 循环按钮：每场战斗结束额外补一次刷新（只看开战前已持有的奇物，本局换到的不算）
		shopRefreshesRemaining: SKILL_REFRESH_PER_LEVEL + getBonus(run.curios, "extraShopRefresh", quality),
		// 只在真正通关后恢复本次技能/奇物购买机会，裂隙与失败不重置。
		skillPurchasedThisRound: 0,
		curioBoughtThisRound: false,
		// 黑市契约·鲜血契约的体力债在「正式战斗胜利」此刻解除：失败重试、中途退出的恢复进场
		// 都还按 1 体力开局（见 battle.beginBattle），只有打赢这一场才算把契约还清
		bloodDebt: false,
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

	// 奇物商店：每关胜利后按 getCurioShopChance(run) 掷一次骰（mode.js 的事件判定在它之后，先奇物商店、再事件）。
	// 命中就整批重摇（排除已拥有的、按推进后的新关卡定价），**未命中直接清空**——
	// 旧版本把没买的候选一直留着，结果同一批奇物能挂十几关不动，商店看着像坏了；
	// 现在「看得见商店」等价于「这一关刚刷出新货」。闯关没有奇物商店。
	//
	// 概率只有一处、只掷一次：getCurioShopChance 把黄金罗盘的 extraCurioShopChance 当**百分点**
	// 累加到 CURIO_SHOP_RATE 上（旧写法是在基础批之外再单独掷一次 10%，两次独立合并等于
	// 1-(1-0.2)(1-0.1)=28%，而界面上任何一处都没说过 28%，玩家读到的是 20%、吃到的是 28%）。
	//
	// Boss 战胜利**不再**刷新奇物商店（旧规格是「必刷一次、不吃概率也不吃橱窗锁」）：
	// 这一掷与普通胜利走完全同一条概率、同一个分支。
	if (run.mode === RUN_MODE.endless) {
		// 锁定时仅保留尚有未售奇物的批次（已购买卡继续显示，但不会重新出售）。
		// 全部售罄或空货架时恢复正常概率；购完自动解锁由 buyCurio 当场处理，旧档异常状态在此兜底。
		const hasUnsold = (run.curioOffers ?? []).some(offer => offer.sold !== true);
		if (isShopLocked(run, "curio") && hasUnsold) {
			next.curioOffers = run.curioOffers.map(offer => ({ ...offer }));
			next.curioOfferQueue = (run.curioOfferQueue ?? []).map(batch => batch.map(offer => ({ ...offer })));
		} else {
			if (isShopLocked(run, "curio") && (run.curioOffers ?? []).length && !hasUnsold) {
				next.curioShopLocked = false;
			}
			// 旧版黄金罗盘可能已生成后续批次：此前可在同关连续购买，
			// 新规则一场只能购买一件，因此改成下一次真正胜利才上架，绝不浪费老存档的货。
			const legacyQueued = (run.curioOfferQueue ?? []).length > 0
				&& (run.curioBoughtThisRound === true || !hasUnsold);
			const queued = legacyQueued ? takeNextCurioBatch(run) : null;
			if (queued?.offers.length) {
				next.curioOffers = queued.offers;
				next.curioOfferQueue = queued.queue;
			} else {
				next.curioOffers = rng() < getCurioShopChance(run) ? rollCurioOffers(next, rng) : [];
				next.curioOfferQueue = [];
			}
		}
	} else {
		next.curioOffers = [];
		next.curioOfferQueue = [];
	}

	// isBossBattle 与 tempSkill 一并回传给调用方：next 里的 currentBattle 已经被清空，
	// 惩罚、结算页标题与「本场临时技能也要永久失去」只能从这里拿（见 flow/result.js）
	return { run: next, gained, isBossBattle, tempSkill };
}
