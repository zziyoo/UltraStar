// EventManager：无尽模式战斗胜利后的事件系统。纯函数，可在 Node 里直接测。
//
// 触发流程（mode.js 编排）：
//   战斗胜利 → settleVictory 结算战斗奖励 → maybeCreatePendingEvent 按概率生成待处理事件
//   → 事件页展示 pendingEvent.choices（玩家选择）→ resolveEventChoice 结算事件奖励 → 返回营地
//   带 action 的选项不在这里落地：resolveEventChoice 只回一句「该交回 mode.js 了」，
//   由 mode.js 编排子页面（商人 / 技能熔炉 / 奇物融合炉）或立刻开一场深渊裂隙战。
//   带 followUp 的选项同理分两趟：第一趟只把追问那一句回给流程层（钱不扣、事件挂着），
//   玩家答完再进来一趟，ctx.followUpTaken 为真时两口并成一次结算（经验泉的「再饮一口」）。
//
// 按钮文案：消耗类选项的价钱在构建期追加（作者写 hideCost 的除外——属性训练场只留「接受训练」，
// 价钱仍照实写在图鉴里）。
//
// 存档保证：事件与随机结果在生成时就地定死写进存档（run.pendingEvent），读档恢复优先展示事件页，
// 绝不重新触发、绝不重掷——中途关游戏再回来，看到的还是同一个事件、同一批结果。
// 交互型选项同理：掷哪件货、裂隙几个敌人、融合炉要多少钱，全部在构建期定死；
// 但**钱要等玩家真选定才扣**，所以这类选项的 reward 留空，花费记在 action 上并写进选项文案。
//
// 两种「不可用」是两回事，不要混：
//   · 钱不够 → 选项置灰，点了毫无反应（isChoiceAffordable 判费用、canChooseChoice 判能否点；
//     reward 负数、流浪商人标价、融合炉经验费统一折算成 getChoiceCost 一份）；
//   · 没有可作用的对象（属性已满 / 没技能可熔 / 没奇物可融合）→ 选项照常可点，
//     点下去只弹作者写的 blockedText 一句话，一个钱都不扣（getBlockedMessage）。

import {
	EVENT_TRIGGER_RATE,
	FORGE_EXP_MULTIPLIER,
	RIFT_EXTRA_AFFIXES,
	RIFT_TIERS,
	RUN_MODE,
	SKILL_SLOTS,
	SPRING_DEBT_AFFIXES,
	STAT_IDS,
} from "./config.js";
import { events, getEvent, eventIds } from "./data/events.js";
import { getCurio, CURIOSITY_RARITY } from "./data/curios.js";
import { getEndlessReward, sumEndlessRewards } from "./data/rewards.js";
import { stats } from "./data/stats.js";
import { ABYSS_DEBT_MAX } from "./endless/abyssConfig.js";
import {
	getBonus,
	getCurioQuality,
	getMerchantPrice,
	getUpgradableCurios,
	isCurioMaxQuality,
	grantRandomCurio,
	grantCurioById,
	hasGrantableCurio,
	pickUnownedCurioOfRarity,
	rollMerchantCurio,
} from "./curioManager.js";
import { getOwnedSkillIds, isEndlessRun } from "./shop.js";

/** 战斗胜利后是否触发事件（rng 可注入，方便测试） */
export function shouldTriggerEvent(rng = Math.random) {
	return rng() < EVENT_TRIGGER_RATE;
}

/** 从事件池随机抽一个事件 id（全部同概率） */
export function rollEventId(rng = Math.random) {
	const list = eventIds;
	return list[Math.floor(rng() * list.length)] ?? null;
}

function isObject(value) {
	return !!value && typeof value === "object" && !Array.isArray(value);
}

function toInt(value, fallback) {
	const num = Number(value);
	return Number.isFinite(num) ? Math.floor(num) : fallback;
}

function clampInt(value, min, max, fallback) {
	const num = toInt(value, fallback);
	return Number.isFinite(num) ? Math.min(max, Math.max(min, num)) : fallback;
}

/**
 * 交互型选项的参数清洗：只认这五种 kind，形状不对或引用已下架就整个丢弃（该选项退回普通奖励流程）。
 * 裂隙的敌人数与奖励、商人的货与价、融合炉的费用都在构建期算好写死，读档只还原、绝不重掷。
 */
export function normalizeEventAction(raw) {
	if (!isObject(raw) || typeof raw.kind !== "string") {
		return null;
	}
	switch (raw.kind) {
		case "abyssDebt": {
			// perEnemy 的上限读 abyssConfig.ABYSS_DEBT_MAX（= 通用池大小 − 满层前常规随机最多 1 个）：
			// 记下更多也兑现不了，构建期就按同一条边界收口（与存档清洗、结算封顶同一常量）
			const built = { kind: "abyssDebt", perEnemy: clampInt(raw.perEnemy, 0, ABYSS_DEBT_MAX, SPRING_DEBT_AFFIXES) };
			// requireCurio（黑市契约·深渊契约）：这笔债以同选项 curioRarity 掷定的奇物真发到手为前提，
			// 只认 true——写了才是契约，别的深渊债（经验泉/悬赏/极限训练）照旧无条件兑现
			if (raw.requireCurio === true) {
				built.requireCurio = true;
			}
			return built;
		}
		case "bloodDebt":
			// 黑市契约·鲜血契约：下一场正式战斗开始时当前体力置 1。它只服务于这份契约，
			// 标的耦合是它的本义，所以 requireCurio 默认就带（显式写 false 才脱钩）
			return { kind: "bloodDebt", requireCurio: raw.requireCurio !== false };
		case "skillForge": {
			const built = { kind: "skillForge", grant: raw.grant === "skill" ? "skill" : "exp" };
			// 子页那两句话随存档定死：读档回到事件页再点子页，显示的还是构建期那一份
			const subtitle = typeof raw.subtitle === "string" ? raw.subtitle.trim() : "";
			if (subtitle) {
				built.subtitle = subtitle;
			}
			const pickLabel = typeof raw.pickLabel === "string" ? raw.pickLabel.trim() : "";
			if (pickLabel) {
				built.pickLabel = pickLabel;
			}
			return built;
		}
		case "rift": {
			const tier = clampInt(raw.tier, 0, RIFT_TIERS.length - 1, 0);
			const level = clampInt(raw.level, 1, Number.MAX_SAFE_INTEGER, 1);
			return {
				kind: "rift",
				tier,
				level,
				enemies: clampInt(raw.enemies, 1, 99, RIFT_TIERS[tier].enemies),
				affixes: clampInt(raw.affixes, 0, 10, RIFT_EXTRA_AFFIXES),
				gold: clampInt(raw.gold, 0, Number.MAX_SAFE_INTEGER, 0),
				exp: clampInt(raw.exp, 0, Number.MAX_SAFE_INTEGER, 0),
			};
		}
		case "merchant": {
			if (raw.soldOut === true) {
				return { kind: "merchant", soldOut: true };
			}
			const curioId = typeof raw.curioId === "string" ? raw.curioId.trim() : "";
			if (!getCurio(curioId)) {
				// 旧档里的商品定义已失效：保留「点一下提示并结束事件」的空档，不退回普通奖励
				return { kind: "merchant", soldOut: true };
			}
			return { kind: "merchant", curioId, price: toInt(raw.price, 0) };
		}
		case "curioForge":
			return { kind: "curioForge", costExp: clampInt(raw.costExp, 0, Number.MAX_SAFE_INTEGER, 0) };
		default:
			return null;
	}
}

/**
 * 事件奖励在生成（预掷）与读档（清洗）共用的白名单校验。
 * goldByWin / expByWin 已换算成固定值，不会出现在清洗结果里；
 * curio/skill 引用具体 id 时若已不存在则剔除该键。
 * curioRarity / expIfNoCurioByWin 只存在于事件定义里，构建期就展开成 curio(具体 id) + 固定 exp，
 * 所以它们永远不会出现在这里，也不会进存档。
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
	// 倍率允许小数（2.2 / 1.02）：只收敛精度，不能像 gold/exp 那样 floor 成整数
	const decimal = value => Math.round(Number(value) * 10000) / 10000;
	for (const key of ["gold", "exp"]) {
		const value = raw[key];
		if (Number.isFinite(Number(value))) {
			reward[key] = int(value);
		}
	}
	// goldPct（按当前金币的百分比投入/获得）与 goldPayout（赢时按投入额的几倍返还）
	// 依赖「点击那一刻」的金币数，不能像 goldByWin 那样在生成时换算成固定值，原样保留百分比。
	// 百分比夹在 ±100：超过 100% 的投入没有意义（也不该允许倒扣成负余额）。
	if (Number.isFinite(Number(raw.goldPct))) {
		reward.goldPct = Math.min(100, Math.max(-100, int(raw.goldPct)));
	}
	if (Number.isFinite(Number(raw.goldPayout))) {
		reward.goldPayout = Math.max(0, decimal(raw.goldPayout));
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
	// 跳关（虫洞）：正整数才有意义，夹到 99；0 与非法值一律剔除（等于没写这个键）
	if (Number.isFinite(Number(raw.skipLevels))) {
		const skip = Math.floor(Number(raw.skipLevels));
		if (skip > 0) {
			reward.skipLevels = Math.min(99, skip);
		}
	}
	return reward;
}

/**
 * 历史存档兼容：许愿池的中奖结果在生成期就已预掷定死（存档里只剩命中倍率或 0）。
 * 读档时保留「命中/落空」本身，只把命中项的返还倍率换成当前事件表里同一投入档位的值，
 * 避免旧档继续按 100 倍结算，也不重新随机。
 */
export function migrateEventReward(eventId, reward) {
	if (eventId !== "wishing_pool" || !(Number(reward?.goldPayout) > 0)) {
		return reward;
	}
	for (const choice of events.wishing_pool?.choices ?? []) {
		const outcomes = Array.isArray(choice.outcomes) && choice.outcomes.length
			? choice.outcomes
			: [{ reward: choice.reward }];
		for (const item of outcomes) {
			const candidate = item?.reward;
			if (candidate?.goldPct === reward.goldPct && Number(candidate.goldPayout) > 0) {
				return { ...reward, goldPayout: candidate.goldPayout };
			}
		}
	}
	return reward;
}

/** 某项属性此刻是否还没满（还能再 +1） */
function statHasRoom(statLevels, id) {
	return (Number(statLevels?.[id]) || 0) < (stats[id]?.maxLevel ?? 0);
}

/** 三项属性是否全部满级；拿不到属性时按「未满」处理，不凭猜测改奖励 */
export function allStatsMaxed(statLevels) {
	if (!statLevels || typeof statLevels !== "object") {
		return false;
	}
	return STAT_IDS.every(id => !statHasRoom(statLevels, id));
}

/**
 * 三扇门那类奖励：按**初始品质**在构建期就掷定「给哪一件」，掷不到就当场换成经验补偿。
 * 放在构建期而不是结算期，是为了守住「结果生成时定死、读档不重掷」这条既有契约——
 * 和未知实验室「属性全满就把 statUp 换成随机奇物」是同一个理由。
 * 必须排在 scaleReward 之后：这里直接往固定的 exp 上累加，而 scaleReward 是**整份覆盖** exp 的。
 */
function resolveCurioRarity(reward, base, ownedCurios, rng) {
	if (!reward || typeof reward !== "object") {
		return reward;
	}
	const { curioRarity, expIfNoCurioByWin, ...rest } = reward;
	if (typeof curioRarity !== "string" || !CURIOSITY_RARITY[curioRarity]) {
		return rest;
	}
	const picked = pickUnownedCurioOfRarity({ curios: ownedCurios }, curioRarity, rng);
	if (picked) {
		rest.curio = picked;
		return rest;
	}
	const extra = Number(expIfNoCurioByWin);
	if (Number.isFinite(extra)) {
		rest.exp = Math.max(0, (Number(rest.exp) || 0) + Math.round((Number(base?.exp) || 0) * extra));
	}
	return rest;
}

/** 交互型选项在构建期落地成具体参数（掷货、算钱、按档位表摊开敌人数与奖励倍率） */
function buildEventAction(raw, base, level, rng, run = null) {
	if (!isObject(raw)) {
		return null;
	}
	switch (raw.kind) {
		case "abyssDebt": {
			// perEnemy：事件可以显式指定每名敌人追加几个（极限模拟训练的 1 / 2）；
			// 不写的（经验泉）照旧吃 config.SPRING_DEBT_AFFIXES 的默认值。清洗口径与 normalizeEventAction 一致
			const built = { kind: "abyssDebt", perEnemy: clampInt(raw.perEnemy, 0, ABYSS_DEBT_MAX, SPRING_DEBT_AFFIXES) };
			// requireCurio（黑市契约·深渊契约）随存档定死：读档后结算层仍按它判「标的没发出去整单作废」
			if (raw.requireCurio === true) {
				built.requireCurio = true;
			}
			return built;
		}
		case "bloodDebt":
			// 黑市契约·鲜血契约：与读档清洗同一口径，requireCurio 默认就带
			return { kind: "bloodDebt", requireCurio: raw.requireCurio !== false };
		case "skillForge": {
			const built = { kind: "skillForge", grant: raw.grant === "skill" ? "skill" : "exp" };
			// 子页的两句话：标题恒为事件名（UI 侧现读），subtitle / pickLabel 作者写了才带上，
			// 不写由 UI 回落到技能熔炉的默认文案——随存档定死，读档后子页面显示不变
			const subtitle = typeof raw.subtitle === "string" ? raw.subtitle.trim() : "";
			if (subtitle) {
				built.subtitle = subtitle;
			}
			const pickLabel = typeof raw.pickLabel === "string" ? raw.pickLabel.trim() : "";
			if (pickLabel) {
				built.pickLabel = pickLabel;
			}
			return built;
		}
		case "rift": {
			const tier = clampInt(raw.tier, 0, RIFT_TIERS.length - 1, 0);
			const conf = RIFT_TIERS[tier];
			return {
				kind: "rift",
				tier,
				level,
				enemies: conf.enemies,
				affixes: RIFT_EXTRA_AFFIXES,
				gold: Math.round((Number(base?.gold) || 0) * conf.multiplier),
				exp: Math.round((Number(base?.exp) || 0) * conf.multiplier),
			};
		}
		case "merchant": {
			const curioId = rollMerchantCurio(run, rng);
			if (!curioId) {
				// 全部奇物都已拥有且满级：不编造商品，留一个只负责提示并结束事件的空档
				return { kind: "merchant", soldOut: true };
			}
			return { kind: "merchant", curioId, price: getMerchantPrice(level) };
		}
		case "curioForge":
			return { kind: "curioForge", costExp: Math.round((Number(base?.exp) || 0) * FORGE_EXP_MULTIPLIER) };
		default:
			return null;
	}
}

/**
 * 交互型选项把「要点开才知道的价钱与后果」写进文案，好让玩家在点之前就看到。
 * 这些花费不走 reward：reward 里的负数意味着「点了即扣」，而这类要等子页面里真选定才扣。
 */
function withActionText(text, action) {
	switch (action.kind) {
		case "merchant":
			return action.soldOut === true ? text : `${text}（一件货 · 标价 ${action.price} 金币）`;
		case "curioForge":
			return `${text}（消耗 ${action.costExp} 经验）`;
		case "rift":
			// 敌人数已写在按钮文案里（打一个/五个/十个），括号里只留胜利奖励
			return `${text}（胜利 ${action.gold} 金币 ${action.exp} 经验）`;
		case "abyssDebt":
			return action.perEnemy > 0 ? `${text}（下一场每个敌人 +${action.perEnemy} 个深渊强化）` : text;
		case "bloodDebt":
			// 黑市契约·鲜血契约：把后果写在按钮上，点之前就看得见要拿体力换什么
			return `${text}（下一场正式战斗开始时体力变为 1）`;
		default:
			return text;
	}
}

/**
 * 构建一个待处理事件：按胜利奖励基准把 goldByWin / expByWin 换算成固定值，
 * outcomes 当场预掷出唯一结果（写进存档，读档不重掷），statUp/statDown 的具体属性也当场定死。
 * @param {string} eventId 事件 id
 * @param {number} wonLevel 刚刚打赢的关卡编号（奖励基准 = 该关的无尽胜利奖励）
 * @param {() => number} [rng] 可注入的随机源
 * @param {number} [now] createdAt 时间戳
 * @param {{ level?: number, statLevels?: object, curios?: string[], run?: object }} [context]
 *        玩家当前关卡、属性等级与已拥有奇物：属性全满、某品质奇物全拥有这两件事都在这里现查，
 *        好把结果当场定死；run（完整存档）只有生产路径会给，用来判「此刻有没有可作用的对象」
 *        （没有的选项不该在按钮上标价）——测试里只塞 statLevels/curios 的场合照旧不做这一步
 */
export function buildPendingEvent(eventId, wonLevel, rng = Math.random, now = 0, context = null) {
	const event = getEvent(eventId);
	if (!event || !Array.isArray(event.choices) || !event.choices.length) {
		return null;
	}
	const level = Number.isFinite(wonLevel) ? Math.max(1, Math.floor(wonLevel)) : 1;
	const base = getEndlessReward(level, ["gold", "exp"]);
	const statLevels = isObject(context) ? context.statLevels : context;
	const ownedCurios = Array.isArray(isObject(context) ? context.curios : null) ? context.curios : [];
	// 跳关的起跳点 = 接下来要打的那一关（刚打赢 level 之后就是 level + 1）
	const nextLevel = Math.max(1, Math.floor(Number(context?.level) || level + 1));
	const runLike = isObject(context?.run) ? context.run : null;
	const env = { base, level, nextLevel, statLevels, ownedCurios, runLike, rng };
	const choices = [];
	for (const choice of event.choices) {
		const built = buildEventChoice(choice, env);
		if (built) {
			choices.push(built);
		}
	}
	if (!choices.length) {
		return null;
	}
	return { id: event.id, choices, createdAt: Math.max(0, Math.floor(Number(now) || 0)) };
}

/**
 * 构建一个选项。主选项与它的 followUp（追问那一句，经验泉的「再饮一口」）走这同一份代码，
 * 好让「生成时就地定死」的口径只有一份：倍率换算、三扇门与随机属性的掷定、白名单清洗、文案追加全一样。
 * 随机数在这里消费，顺序按选项在定义里的先后排定，追问句紧跟它的主选项。
 */
function buildEventChoice(choice, env) {
	const { base, level, nextLevel, statLevels, ownedCurios, runLike, rng } = env;
	if (!choice || typeof choice.text !== "string" || !choice.text.trim()) {
		return null;
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
	// 先按本次胜利奖励换算倍率（goldByWin / expByWin → 固定值），再把三扇门掷定，
	// 最后走白名单清洗：存档里只允许出现固定值，绝不保存倍率、品质名与随机态
	const scaled = resolveCurioRarity(scaleReward(reward, base), base, ownedCurios, rng);
	const clean = normalizeEventReward(scaled);
	// 跳关（虫洞）：把「接下来 N 关」的无尽基础奖励逐关求和，并进 gold/exp 固定值——与裂隙同一套
	// 「构建期定死、读档不重掷」，基础口径、不吃奇物加成。skipLevels 本身也留着，结算层按它推关卡
	if (clean.skipLevels) {
		const gain = sumEndlessRewards(nextLevel, clean.skipLevels);
		for (const [key, value] of Object.entries(gain)) {
			clean[key] = (Number(clean[key]) || 0) + value;
		}
	}
	// statUp/statDown 的 "random" 就地解析成具体属性（消费 rng），与 outcomes 预掷同属生成期随机，
	// 存档里只保存定死后的属性 id，读档不重掷
	for (const key of ["statUp", "statDown"]) {
		if (clean[key] !== "random") {
			continue;
		}
		// statUp 只从「还能升」的属性里掷：抽中已满项等于让玩家白付代价（训练场要扣经验）。
		// 三项全满时没有候选、退回全体——结果无所谓：写了 blockedText 的会被拦下弹提示，
		// 没写的一律在下面被改写成随机奇物。statDown 保持全体：它是惩罚向，掷空对玩家有利
		const pool = key === "statUp" && isObject(statLevels)
			? STAT_IDS.filter(id => statHasRoom(statLevels, id))
			: [];
		const list = pool.length ? pool : STAT_IDS;
		clean[key] = list[Math.floor(rng() * list.length)];
	}
	const blockedText = typeof choice.blockedText === "string" ? choice.blockedText.trim() : "";
	// 属性全满时 statUp 必然落空，换成随机奇物；放在生成期是为了随存档定死、读档不重掷。
	// 作者为这个选项写了 blockedText 就不换——他要的是「点了弹一句、钱也不扣」，不是白得一个奇物。
	if (clean.statUp && !blockedText && allStatsMaxed(statLevels)) {
		delete clean.statUp;
		clean.curio = "random";
	}
	const action = buildEventAction(choice.action, base, level, rng, {
		curios: ownedCurios,
		curioQuality: runLike?.curioQuality,
	});
	const built = { text: choice.text.trim(), reward: clean };
	// 预掷赌局的「最多扣光」安全阀：随存档定死，事件页与结算层都按它放行/收窄（见文件头与 events.js）
	if (choice.clampLoss === true) {
		built.clampLoss = true;
	}
	if (action) {
		built.action = action;
	}
	if (blockedText) {
		built.blockedText = blockedText;
	}
	// 追问句要说的那句话（只有 followUp 用得上）：作者写的原话，随存档定死
	const question = typeof choice.question === "string" ? choice.question.trim() : "";
	if (question) {
		built.question = question;
	}
	// 「此刻没有可作用的对象」（属性已满 / 没技能 / 没奇物）的选项点下去一个钱都不扣，
	// 所以也不该在按钮上标价——标了等于骗玩家点。判据与事件页、结算层共用 getBlockedMessage 一份
	const blockedNow = runLike ? !!getBlockedMessage(runLike, built) : false;
	// 消耗类选项把价钱写进文案：倍率是按本次胜利奖励现算的，玩家点之前就该看到要花多少，
	// 而不是结算完才发现。文案随存档定死，读档后显示不变。
	// 作者写了 hideCost 的（属性训练场）不在按钮上标价，只留选项名——价钱在图鉴里照实写全
	const fromOutcomes = Array.isArray(choice.outcomes) && choice.outcomes.length > 0;
	let text = blockedNow || choice.hideCost === true
		? built.text
		: withCostText(built.text, clean, fromOutcomes);
	if (action && !blockedNow) {
		text = withActionText(text, action);
	}
	built.text = text;
	// 追问句：与主选项同一条构建路径，随存档定死。只认一层——followUp 里再嵌 followUp 不认
	if (isObject(choice.followUp)) {
		const followUp = buildEventChoice(choice.followUp, env);
		if (followUp) {
			delete followUp.followUp;
			built.followUp = followUp;
		}
	}
	return built;
}

/**
 * 给选项文案补上消耗金额：「购买奇怪物品」→「购买奇怪物品（-86 金币）」，
 * 「接受训练」→「接受训练（-10 经验）」——本轮开始有花经验的事件，两种货币都要写。
 * 奖励为正（白拿钱）不加后缀；没有消耗则原样返回。
 * 百分比投入（goldPct）金额取决于点击那一刻的金币数，此时算不准，只在文案里保留百分比说明。
 * 带 outcomes 的赌局选项（isOutcome）不加金额后缀：负结果是预掷出来的，写出来等于剧透。
 */
function withCostText(text, reward, isOutcome) {
	const pct = reward?.goldPct;
	if (Number.isFinite(pct) && pct) {
		return `${text}（投入 ${Math.abs(pct)}% 金币）`;
	}
	if (isOutcome) {
		return text;
	}
	const parts = [];
	for (const [key, label] of [["gold", "金币"], ["exp", "经验"]]) {
		const cost = reward?.[key];
		if (Number.isFinite(cost) && cost < 0) {
			parts.push(`${cost} ${label}`);
		}
	}
	return parts.length ? `${text}（${parts.join(" / ")}）` : text;
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
	const pendingEvent = buildPendingEvent(eventId, wonLevel, rng, now, {
		level: run.level,
		statLevels: run.stats,
		curios: run.curios,
		run,
	});
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

/**
 * 这个选项「此刻没有可作用的对象」吗？是则返回要对玩家说的那句话，否则返回 null。
 * 判据一律现读存档（不缓存渲染时的布尔值），因为玩家可能在同一个事件页停留期间被别处改动过。
 *
 * 这条与「钱不够」是两回事：钱不够走 isChoiceAffordable 置灰、点了毫无反应；
 * 没对象可作用**照常可点**，点下去只弹这一句、一个钱都不扣。作者没写 blockedText 的选项一律不拦。
 */
export function getBlockedMessage(run, choice) {
	const text = typeof choice?.blockedText === "string" ? choice.blockedText.trim() : "";
	if (!text) {
		return null;
	}
	const kind = choice?.action?.kind;
	if (kind === "skillForge") {
		// 按「当前拥有」判：无尽=完整背包（没装备的同样能投），闯关=技能栏本身
		return getOwnedSkillIds(run).length ? null : text;
	}
	if (kind === "curioForge") {
		return getUpgradableCurios(run).length ? null : text;
	}
	if (kind === "merchant") {
		// soldOut（全满/旧档商品失效）没有可卖的东西：点一下只弹这句并收掉事件，绝不进空商品子页
		if (choice.action.soldOut === true || !getCurio(choice.action.curioId)) {
			return text;
		}
		const curioId = choice.action.curioId;
		// 已拥有且已经升到最高一档：买回去也升不了级，这才是「没有可作用的对象」；
		// 已拥有但还能升级正是流浪商人的卖点，绝不能拦
		if ((run?.curios ?? []).includes(curioId) && isCurioMaxQuality(curioId, run?.curioQuality)) {
			return text;
		}
		return null;
	}
	if (choice?.reward?.statUp) {
		return allStatsMaxed(run?.stats) ? text : null;
	}
	return null;
}

/**
 * 选项的**确定费用**（不含随机结果）：reward 里的负数（点了即扣）与交互型 action 上的
 * 标价/融合费（子页里真选定才扣）统一折算成 { gold?, exp? }，值恒为正。
 * 交互型选项的钱虽要等子页里真选定才扣，但「付不付得起」在事件主页就该判——
 * 事件页置灰与结算层最终校验都按这一份，收费规则只有一处。
 */
export function getChoiceCost(choice) {
	const cost = {};
	const reward = choice?.reward ?? {};
	for (const key of ["gold", "exp"]) {
		const value = Number(reward[key]);
		if (Number.isFinite(value) && value < 0) {
			cost[key] = (cost[key] ?? 0) - value;
		}
	}
	const action = choice?.action;
	// 流浪商人的标价与融合炉的经验费：负价/0 一律当不收费（旧档清洗后可能出现 0）
	if (action?.kind === "merchant" && action.soldOut !== true) {
		const price = Number(action.price);
		if (Number.isFinite(price) && price > 0) {
			cost.gold = (cost.gold ?? 0) + price;
		}
	}
	if (action?.kind === "curioForge") {
		const exp = Number(action.costExp);
		if (Number.isFinite(exp) && exp > 0) {
			cost.exp = (cost.exp ?? 0) + exp;
		}
	}
	return cost;
}

/**
 * 事件页判断某个选项是否付得起：确定费用（见 getChoiceCost）超过持有量时置灰。
 * 兼容两种入参：完整选项（`{ reward, action }`，新口径，含商人标价/融合费）或裸 reward（历史调用）。
 * 「随机给一个奇物」且图鉴已集齐的选项一律可选——它不会扣任何货币（走跳过分支），
 * 否则选项会被置灰且点不动，事件永远关不掉。
 * 写了 clampLoss 的选项（预掷赌局）不对「付不起」负责：失手是掷出来的，置灰等于剧透，
 * 调用方用 canChooseChoice / 结算层的 clampLoss 分支放行，扣款按「最多扣光」收窄。
 */
export function isChoiceAffordable(run, choiceOrReward) {
	const isChoice = isObject(choiceOrReward) && ("reward" in choiceOrReward || "action" in choiceOrReward);
	const choice = isChoice ? choiceOrReward : null;
	const reward = isChoice ? choice.reward : choiceOrReward;
	if (reward && typeof reward === "object") {
		if (reward.curio === "random" && !hasGrantableCurio(run)) {
			return true;
		}
		// 百分比投入（许愿池）：只要手上还有金币就一定能投，10% 投得起、50% 也投得起。
		// 只拦 0 金币这一头，费用仍要走下面的统一判定（未来若与 action 费用叠加也不会漏）
		if (Number.isFinite(reward.goldPct) && reward.goldPct && (run?.currency?.gold ?? 0) <= 0) {
			return false;
		}
	}
	const cost = getChoiceCost(choice ?? { reward });
	for (const [key, value] of Object.entries(cost)) {
		if ((run?.currency?.[key] ?? 0) < value) {
			return false;
		}
	}
	return true;
}

/**
 * 事件页与结算层共用的「这个选项此刻能不能选」：
 *   · 没有可作用的对象（属性满 / 没技能 / 没奇物）→ 可点，点下去只弹作者那句话，不花钱；
 *   · clampLoss 的预掷赌局 → 可点（失手是掷出来的，置灰会剧透），结算最多扣光；
 *   · 其余按 getChoiceCost 的确定费用判余额。
 * UI 的按钮状态、点击守卫与 resolveEventChoice 的最终校验都走这一份。
 */
export function canChooseChoice(run, choice) {
	if (!choice) {
		return false;
	}
	if (getBlockedMessage(run, choice)) {
		return true;
	}
	if (choice.clampLoss === true) {
		return true;
	}
	return isChoiceAffordable(run, choice);
}

/**
 * 预掷赌局的扣款安全阀（选项声明了 clampLoss）：选项永不因「钱不够」置灰（负结果是生成期掷定的，
 * 置灰等于把结果提前漏给玩家），结算时把负值收窄到「最多扣光手上持有的」，绝不为负。
 * 返回的可能是原对象（没裁到）或裁过的新对象——调用方拿它走 applyEventCurrency，
 * 账目行与余额因此是同一份收窄后的数字。只对声明了 clampLoss 的选项生效，正常收费事件的支付规则一个字不动。
 */
function capLossToHeld(run, reward) {
	let capped = null;
	for (const key of ["gold", "exp"]) {
		const value = reward?.[key];
		const held = run?.currency?.[key] ?? 0;
		if (Number.isFinite(value) && value < 0 && held < -value) {
			(capped ??= { ...reward })[key] = -held;
		}
	}
	return capped ?? reward;
}

/**
 * 记忆棱镜：事件结算时对**正数经验奖励**按当前品质额外加成一次（稀有 +25% / 史诗 +50%）。
 * 只在「事件真正入账」的两条路调用（resolveEventChoice 与技能熔炉子页的 skillForgeFlow），所以：
 *   · 普通/Boss/裂隙战斗的胜利经验走 reward.js 的结算，碰不到这里；
 *   · 经验消耗是负值、原样保留；没有这块奇物（加成为 0）返回原对象；
 *   · 虫洞「跳过十关」的基础奖励汇总带 skipLevels——整批不吃加成，免得跳过十关被异常放大；
 *   · 追问句（经验泉的「再饮一口」）在 mergeSips 并成一口之后才进这里，所以只算一次。
 * 取整用 Math.round（与倍率换算同一口径）；加成结果只出现在这一次入账里，读档重开算不出第二个数。
 */
export function boostEventExp(run, reward) {
	const rate = getBonus(run?.curios ?? [], "eventExpRate", run?.curioQuality);
	const value = Number(reward?.exp);
	if (!(rate > 0) || !(Number.isFinite(value) && value > 0)) {
		return reward;
	}
	if (Number.isFinite(reward.skipLevels) && reward.skipLevels > 0) {
		return reward;
	}
	return { ...reward, exp: Math.round(value * (1 + rate)) };
}

/**
 * 把固定额度的金币/经验加进存档，并生成结算行。事件结算与交互型选项（技能熔炉）共用这一份，
 * 免得两处对「+40 还是 获得 40」写出两种口径。
 * @param {boolean} [asGain] 正向奖励写成「获得 40 经验」而不是账目体的「经验 +40」
 */
export function applyEventCurrency(run, reward, asGain = false) {
	const next = { ...run, currency: { ...run.currency } };
	const lines = [];
	for (const key of ["gold", "exp"]) {
		const value = reward?.[key];
		if (!Number.isFinite(value) || !value) {
			continue;
		}
		next.currency[key] = Math.max(0, (next.currency[key] ?? 0) + value);
		const label = key === "gold" ? "金币" : "经验";
		if (asGain && value > 0) {
			lines.push(`获得 ${value} ${label}`);
		} else {
			lines.push(`${label} ${value > 0 ? "+" : ""}${value}`);
		}
	}
	return { run: next, lines };
}

/**
 * 从商店候选池里随机挑一个「当前角色自带」与「已拥有」都排除掉的技能 id；池子空了返回 null。
 * 事件奖励的「随机给技能」与技能熔炉的「换一个随机新技能」共用这一份判据，免得两处各自漂移。
 * @param {object} run 存档（拥有列表按模式取：无尽=完整背包，闯关=技能栏）
 * @param {{ candidates?: {id:string}[], characterSkills?: string[] }} [ctx] 由 mode.js 从 lib 现算后传入
 */
export function pickRandomSkillId(run, ctx = {}, rng = Math.random) {
	const excluded = new Set([
		...getOwnedSkillIds(run),
		...(Array.isArray(ctx.characterSkills) ? ctx.characterSkills : []),
	]);
	const pool = (Array.isArray(ctx.candidates) ? ctx.candidates : [])
		.map(item => item?.id)
		.filter(id => typeof id === "string" && id && !excluded.has(id));
	if (!pool.length) {
		return null;
	}
	return pool[Math.floor(rng() * pool.length)];
}

/**
 * 把「主选项 + 玩家答应的那一句追问」并成一次结算用的选项（经验泉两口 → 一口总额）。
 * 只合并货币：gold/exp 相加，其余键以追问那一句为准（现在用 followUp 的只有经验泉，写的全是 expByWin）。
 * 合并而不是分两次扣，是为了守住「一次点击 = 一遍 applyEventCurrency = 一行账」的既有口径。
 */
function mergeSips(choice, followUp) {
	const first = choice.reward ?? {};
	const second = followUp.reward ?? {};
	const reward = { ...first, ...second };
	for (const key of ["gold", "exp"]) {
		if (Number.isFinite(first[key]) || Number.isFinite(second[key])) {
			reward[key] = (Number(first[key]) || 0) + (Number(second[key]) || 0);
		}
	}
	return {
		text: followUp.text ?? choice.text,
		reward,
		action: followUp.action ?? choice.action,
		blockedText: followUp.blockedText ?? choice.blockedText,
	};
}

/**
 * 玩家选择后结算事件奖励。返回 { ok, error, run, lines, skillId?, curioId?, action?, followUp? }；
 * 失败时 run 与传入的 run 是同一份未修改数据。普通选项成功时 pendingEvent 清空。
 *
 * 带 action 的选项是个例外：这里**一律不扣钱、不清事件**，只把参数原样回给调用方，
 * 由 mode.js 编排子页面或裂隙战，玩家真选定那一刻才落地——
 * 中途关游戏时 pendingEvent 还挂着，回来仍是这个事件，不会白点一次。
 * 唯一的前置是**支付校验**：商人标价 / 融合费付不起就在这里整单拒绝（与事件页同一判定），
 * 不开子页面、不动存档。
 * @param {object} run 存档
 * @param {number} choiceIndex 玩家点选的选项下标
 * @param {{ candidates?: {id:string}[], characterSkills?: string[], followUpTaken?: boolean }} [ctx]
 *        技能奖励的候选池与当前角色原生技能（由 mode.js 从 lib 现算后传入，保持本文件纯逻辑）；
 *        followUpTaken 是玩家对「追问那一句」答的那声要不要——字段缺失＝还没问过，
 *        带 followUp 的选项这一趟只把追问回给调用方，一个钱都不扣
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
	// 「没有可作用的对象」排在扣钱与 action 之前：只回一句作者写的话，存档只把事件收掉
	const blocked = getBlockedMessage(run, choice);
	if (blocked) {
		return {
			ok: true,
			error: null,
			run: { ...run, pendingEvent: null },
			lines: [blocked],
			skillId: null,
			curioId: null,
			action: null,
		};
	}
	// abyssDebt 与 bloodDebt（黑市契约·鲜血契约）不需要玩家再挑东西（就是记一笔债 + 照发 reward），
	// 所以它们留在这里一起结算；其余四类都要开子页面或开战斗，一律原样回给 mode.js，一个钱都不扣。
	// 交互型选项也要做最终支付校验：UI 置灰只是展示，直接调用（或停在旧余额上的子页入口）
	// 不能绕过——不够就整单拒绝，不扣钱、不清 pendingEvent、也不进子页面。
	if (choice.action && choice.action.kind !== "abyssDebt" && choice.action.kind !== "bloodDebt") {
		if (!canChooseChoice(run, choice)) {
			return { ok: false, error: "货币不足，无法选择该项", run };
		}
		return { ok: true, error: null, run, lines: [], skillId: null, curioId: null, action: choice.action };
	}
	// 带追问句的选项（经验泉：页面上只有「饮用」，点完才问「再饮一口」）分两趟走：
	// 第一趟 ctx.followUpTaken 是 undefined，这里一个钱都不扣、事件照旧挂着，只把追问那一句回给流程层；
	// 玩家答了再进来一次，ctx.followUpTaken 带布尔值才真落地。与商人/熔炉/裂隙「未落地前事件挂着」同一条纪律。
	// **例外**：追问那一口的深渊债已经记不下（已达 ABYSS_DEBT_MAX）时**不问这一句**——
	// 问了玩家答应也只会喝到第一口，直接按第一口结算并在账目里写明（见 followUpDebtSkipped），
	// 省一次必落空的问答；第一口的奖励是玩家点主选项那一刻就应得的，绝不被第二口的代价连坐取消
	let followUpDebtSkipped = false;
	if (isObject(choice.followUp) && ctx?.followUpTaken === undefined) {
		const followUp = choice.followUp;
		const debtBlocked = followUp.action?.kind === "abyssDebt"
			&& followUp.action.perEnemy > 0
			&& Math.max(0, Math.floor(Number(run.abyssDebt) || 0)) + followUp.action.perEnemy > ABYSS_DEBT_MAX;
		if (!debtBlocked) {
			return { ok: true, error: null, run, lines: [], skillId: null, curioId: null, action: null, followUp: choice.followUp };
		}
		// 追问那一口装不下：跳过追问，只结第一口（followUpDebtSkipped 在结算账目里说明）
		followUpDebtSkipped = true;
	}
	// 答应了就把两口并成一次结算：货币相加、深渊债照原路径兑现，一条账只走一遍 applyEventCurrency。
	// 双保险：合并后的债若仍记不下（第一趟已拦住，债在事件页挂着的期间不可能变化），退回只结第一口
	let sip = ctx?.followUpTaken === true && isObject(choice.followUp) ? mergeSips(choice, choice.followUp) : choice;
	if (sip !== choice && sip.action?.kind === "abyssDebt" && sip.action.perEnemy > 0) {
		const before = Math.max(0, Math.floor(Number(run.abyssDebt) || 0));
		if (before + sip.action.perEnemy > ABYSS_DEBT_MAX) {
			sip = choice;
			followUpDebtSkipped = true;
		}
	}
	const reward = sip.reward ?? {};
	// 随机奇物不可得（图鉴已集齐）时整个选项落空：不扣任何货币、不入袋，
	// 只提示一句并照常关闭事件（神秘商人「拥有所有奇物则不扣金币直接跳过」走的就是这条）。
	// 必须排在 isChoiceAffordable 之前：跳过分支不花钱，不能因为金币不够就把选项卡死。
	if (reward.curio === "random" && !hasGrantableCurio(run)) {
		const skipped = {
			...run,
			collection: {
				events: (run.collection?.events ?? []).slice(0),
				curios: (run.collection?.curios ?? []).slice(0),
			},
			pendingEvent: null,
		};
		// 神秘商人那句「不收货币」只属于它；其它事件（废弃补给站的深入搜寻）照实说没找到，
		// 避免把商人台词套到别的事件页上。
		const message = pendingEvent.id === "mystery_merchant"
			? "奇物图鉴已集齐，他没有可出售的东西，这次不收货币。"
			: "奇物图鉴已集齐，这次什么也没有找到。";
		return { ok: true, error: null, run: skipped, lines: [message], skillId: null, curioId: null, action: null };
	}
	// 预掷赌局的失手分支（clampLoss）不能用「钱不够」拒绝——负结果是预掷出来的，拒绝/置灰都等于剧透；
	// 它照常放行，扣款在下面按「最多扣光」收窄（capLossToHeld）
	const clampLoss = choice.clampLoss === true;
	if (!clampLoss && !isChoiceAffordable(run, sip)) {
		return { ok: false, error: "货币不足，无法选择该项", run };
	}

	// 深渊债的统一前置校验（**所有** abyssDebt 选项一条：经验泉追问 / 极限训练 / 深空悬赏 / 深渊契约）：
	// 已有债加上本次要记的个数装不进 ABYSS_DEBT_MAX（记不满额）就整项拒绝——债是这些选项的代价，
	// 半份债等于白拿奖励，与「货币不足」「没有可学技能」同一条失败纪律：不发金币/经验/技能/奇物、
	// 不动已有债务、不清 pendingEvent，玩家关掉提示仍留在事件页可改选别的选项
	if (sip.action?.kind === "abyssDebt" && sip.action.perEnemy > 0) {
		const before = Math.max(0, Math.floor(Number(run.abyssDebt) || 0));
		if (before + sip.action.perEnemy > ABYSS_DEBT_MAX) {
			return {
				ok: false,
				error: `深渊债务最多记 ${ABYSS_DEBT_MAX} 个，本次的 ${sip.action.perEnemy} 个强化记不下了，无法选择该项。`,
				run,
			};
		}
	}

	// 深空悬赏这类「随机技能 + 下一场深渊债」的选项：先把技能候选定下来。
	// 没有可学技能时按**失败**返回（而不是成功地把事件收掉）：flow/event.js 的 !ok 路径
	// 只弹 showNotice、不 commit、不关事件，玩家关掉提示后仍能在同一页改选「领取普通报酬」或「离开」。
	// 这一步在 applyEventCurrency 之前，确保失败时货币、技能、abyssDebt 一个字节都不动。
	const needsSkillForDebt = sip.action?.kind === "abyssDebt" && reward.skill === "random";
	let plannedSkillId = null;
	if (needsSkillForDebt) {
		// 与后面实际发技能同一条判据（无尽无装备位上限；闯关满槽视为学不会）
		if (!isEndlessRun(run) && (run.skills?.length ?? 0) >= SKILL_SLOTS) {
			return { ok: false, error: "没有可学的技能，无法接受悬赏", run };
		}
		plannedSkillId = pickRandomSkillId(run, ctx, rng);
		if (!plannedSkillId) {
			return { ok: false, error: "没有可学的技能，无法接受悬赏", run };
		}
	}

	// 黑市契约（鲜血/深渊）的标的校验：奇物发不出去整单作废——不给奇物、不施加任何代价、
	// 事件留着可改选别的契约（与深空悬赏「没有可学技能」同一条失败纪律，run 原样返回零副作用）。
	// 标的在构建期就按品质掷定了（品质池空时 reward 里根本没有 curio 键），所以这里拦住的
	// 几乎只剩「该品质已集齐」一种情况；bloodDebt 是契约本尊，标的耦合默认就带。
	// 深渊契约「债装不下」的拒绝在上面那条统一前置校验里，这里不再另写一份
	const contractCurio = sip.action?.requireCurio === true || sip.action?.kind === "bloodDebt";
	if (contractCurio) {
		const target = reward.curio;
		if (!target || !getCurio(target) || (run.curios ?? []).includes(target)) {
			return { ok: false, error: "该品质的奇物已全部集齐，这份契约无法签订。", run };
		}
	}

	// 收窄只对 clampLoss 选项生效；记忆棱镜在这里给事件自己发的正数经验加成一次
	// （另一条路是技能熔炉子页的 skillForgeFlow），账目行与余额吃的是同一份加成后的数字
	const paid = clampLoss ? capLossToHeld(run, reward) : reward;
	const credited = applyEventCurrency(run, boostEventExp(run, paid));
	const next = {
		...credited.run,
		skills: (run.skills ?? []).slice(0),
		skillInventory: (run.skillInventory ?? []).slice(0),
		stats: { ...run.stats },
		collection: {
			events: (run.collection?.events ?? []).slice(0),
			curios: (run.collection?.curios ?? []).slice(0),
		},
	};
	const lines = credited.lines;
	let skillId = null;
	let curioId = null;

	// 经验泉「再饮一口」因债务上限没喝上时的说明行：紧跟第一口的经验账目，让玩家知道少喝了哪一口
	if (followUpDebtSkipped) {
		lines.push(`深渊债务最多记 ${ABYSS_DEBT_MAX} 个，「${choice.followUp.text}」记不下了，本次只结算第一口。`);
	}

	// 许愿池：按「点击那一刻」的金币数算投入额，所以必须在这里（而不是生成事件时）换算。
	// 先扣掉投入，再按 goldPayout 倍返还——赢了净赚 (倍率-1)×投入，输了全丢。
	if (Number.isFinite(reward.goldPct) && reward.goldPct) {
		const held = next.currency.gold ?? 0;
		const wager = Math.min(held, Math.round((held * Math.abs(reward.goldPct)) / 100));
		if (wager <= 0) {
			lines.push("金币不足，无法投入");
		} else {
			next.currency.gold = held - wager;
			lines.push(`投入金币 -${wager}`);
			const payout = Math.round((wager * (reward.goldPayout ?? 0)) / 1);
			if (payout > 0) {
				next.currency.gold += payout;
				lines.push(`愿望达成，获得 ${payout} 金币（${reward.goldPayout} 倍）`);
			} else {
				lines.push("愿望落空，投入化为乌有");
			}
		}
	}

	if (reward.curio === "random") {
		const granted = grantRandomCurio(next, rng);
		if (granted.ok) {
			next.curios = granted.run.curios;
			next.collection.curios = granted.run.collection.curios;
			// grantRandomCurio 会把送出的奇物从商店候选里撤下并当场补摇新货
			// （已拥有的不得再挂在奇物商店，非空货架保持满员——旧版只撤不补，货架会缩水成两个）
			next.curioOffers = granted.run.curioOffers;
			curioId = granted.curioId;
			lines.push(`获得奇物：${getCurio(curioId)?.name ?? curioId}`);
		} else {
			lines.push(granted.error);
		}
	} else if (typeof reward.curio === "string" && reward.curio) {
		// 古代遗迹三扇门在构建期就掷定了给哪一件（读档不重掷），这里照单发放
		const granted = grantCurioById(next, reward.curio, rng);
		if (granted.ok) {
			next.curios = granted.run.curios;
			next.collection.curios = granted.run.collection.curios;
			// 撤下并补货的规矩与上面随机送同一条（grantCurioById 内部处理）
			next.curioOffers = granted.run.curioOffers;
			curioId = granted.curioId;
			lines.push(`获得奇物：${getCurio(curioId)?.name ?? curioId}`);
		} else {
			lines.push(granted.error);
		}
	}

	if (reward.skill === "random") {
		if (!isEndlessRun(next) && next.skills.length >= SKILL_SLOTS) {
			// 闯关（旧版机制）：技能栏就是全部持有，满了就学不会——不替换、不进任何背包
			lines.push("技能槽已满，未能学会技能");
		} else {
			// needsSkillForDebt 时复用上面已经掷定的那一个：不二次消费随机源，也保证
			// 「候选检查」与「真正发放」始终是同一个技能。
			skillId = plannedSkillId ?? pickRandomSkillId(next, ctx, rng);
			if (skillId) {
				if (isEndlessRun(next)) {
					// 无尽：技能一律进背包，装备位满也不落空、也不自动装备
					next.skillInventory.push(skillId);
				} else {
					next.skills.push(skillId);
					if (!next.skillInventory.includes(skillId)) {
						next.skillInventory.push(skillId);
					}
				}
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

	// 经验泉「再饮一口」欠下的债：只记在存档上，开战那一刻消费并清零（见 mode.js:startBattle）。
	// 累加而不是覆盖——连着喝两次的债不该被后一次抹掉。黑市契约·深渊契约走的就是这一条（perEnemy 2），
	// 与其它来源的债自然累加，绝不互相覆盖。
	// 上限口径只有一份（abyssConfig.ABYSS_DEBT_MAX）：**上面的统一前置校验已保证装得下**
	// （已有债 + perEnemy ≤ 上限，装不下的选项整项被拒），所以这里必然全额兑现，
	// 不存在「部分入账/满上限硬记」的分支；存档清洗夹同一条边界，内存与读档永一致
	if (sip.action?.kind === "abyssDebt" && sip.action.perEnemy > 0) {
		next.abyssDebt = (Number(run.abyssDebt) || 0) + sip.action.perEnemy;
		lines.push(`下一场战斗每个敌人获得 ${next.abyssDebt} 个随机深渊强化`);
	}

	// 黑市契约·鲜血契约：下一场**正式**战斗开始时当前体力直接置为 1（上限不动，战斗内照常回复）。
	// 只记账不消费：开战（含失败重试、中途退出的恢复）每次正式进场都按它初始化体力，
	// 正式战斗胜利结算时才解除（见 reward.settleVictory）；深渊裂隙不是正式战斗，不吃也不清
	if (sip.action?.kind === "bloodDebt") {
		next.bloodDebt = true;
		lines.push("下一场正式战斗开始时，你的体力将变为 1");
	}

	// 虫洞跳关：关数在结算这一刻一次性推进——跳过的那几关不落任何账、也不触发事件与奇物商店；
	// 期间该拿的金币与经验已在构建期并进 reward，上面照常入账。读的是存档里定死的 skipLevels，
	// 起跳点是 run.level（事件挂着的期间关卡不会变：读档恢复先回事件页，见 mode.js 的页面路由）
	if (Number.isFinite(reward.skipLevels) && reward.skipLevels > 0) {
		next.level = Math.max(1, Math.floor(Number(next.level) || 1)) + reward.skipLevels;
		lines.push(`跳过 ${reward.skipLevels} 关，直接来到第 ${next.level} 关`);
	}

	next.pendingEvent = null;
	return { ok: true, error: null, run: next, lines, skillId, curioId, action: null };
}

export { events, eventIds, getEvent };
