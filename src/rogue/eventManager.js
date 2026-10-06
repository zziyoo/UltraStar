// EventManager：无尽模式战斗胜利后的事件系统。纯函数，可在 Node 里直接测。
//
// 触发流程（mode.js 编排）：
//   战斗胜利 → settleVictory 结算战斗奖励 → maybeCreatePendingEvent 按概率生成待处理事件
//   → 事件页展示 pendingEvent.choices（玩家选择）→ resolveEventChoice 结算事件奖励 → 返回营地
//   带 action 的选项不在这里落地：resolveEventChoice 只回一句「该交回 mode.js 了」，
//   由 mode.js 编排子页面（商人 / 技能熔炉 / 奇物融合炉）或立刻开一场深渊裂隙战。
//
// 存档保证：事件与随机结果在生成时就地定死写进存档（run.pendingEvent），读档恢复优先展示事件页，
// 绝不重新触发、绝不重掷——中途关游戏再回来，看到的还是同一个事件、同一批结果。
// 交互型选项同理：掷哪件货、裂隙几个敌人、融合炉要多少钱，全部在构建期定死；
// 但**钱要等玩家真选定才扣**，所以这类选项的 reward 留空，花费记在 action 上并写进选项文案。
//
// 两种「不可用」是两回事，不要混：
//   · 钱不够 → 选项置灰，点了毫无反应（isChoiceAffordable）；
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
import {
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
		case "abyssDebt":
			return { kind: "abyssDebt", perEnemy: clampInt(raw.perEnemy, 0, 10, SPRING_DEBT_AFFIXES) };
		case "skillForge":
			return { kind: "skillForge", grant: raw.grant === "skill" ? "skill" : "exp" };
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
			const curioId = typeof raw.curioId === "string" ? raw.curioId.trim() : "";
			if (!getCurio(curioId)) {
				return null;
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
		reward.goldPayout = Math.max(0, int(raw.goldPayout));
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
function buildEventAction(raw, base, level, rng) {
	if (!isObject(raw)) {
		return null;
	}
	switch (raw.kind) {
		case "abyssDebt":
			return { kind: "abyssDebt", perEnemy: SPRING_DEBT_AFFIXES };
		case "skillForge":
			return { kind: "skillForge", grant: raw.grant === "skill" ? "skill" : "exp" };
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
			const curioId = rollMerchantCurio(rng);
			if (!curioId) {
				return null;
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
			return `${text}（一件货 · 标价 ${action.price} 金币）`;
		case "curioForge":
			return `${text}（消耗 ${action.costExp} 经验）`;
		case "rift":
			return `${text}（${action.enemies} 名敌人 · 胜利 ${action.gold} 金币 ${action.exp} 经验）`;
		case "abyssDebt":
			return action.perEnemy > 0 ? `${text}（下一场每个敌人 +${action.perEnemy} 个深渊强化）` : text;
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
		const action = buildEventAction(choice.action, base, level, rng);
		const built = { text: choice.text.trim(), reward: clean };
		if (action) {
			built.action = action;
		}
		if (blockedText) {
			built.blockedText = blockedText;
		}
		// 「此刻没有可作用的对象」（属性已满 / 没技能 / 没奇物）的选项点下去一个钱都不扣，
		// 所以也不该在按钮上标价——标了等于骗玩家点。判据与事件页、结算层共用 getBlockedMessage 一份
		const blockedNow = runLike ? !!getBlockedMessage(runLike, built) : false;
		// 消耗类选项把价钱写进文案：倍率是按本次胜利奖励现算的，玩家点之前就该看到要花多少，
		// 而不是结算完才发现。文案随存档定死，读档后显示不变。
		const fromOutcomes = Array.isArray(choice.outcomes) && choice.outcomes.length > 0;
		let text = blockedNow ? built.text : withCostText(built.text, clean, fromOutcomes);
		if (action && !blockedNow) {
			text = withActionText(text, action);
		}
		built.text = text;
		choices.push(built);
	}
	if (!choices.length) {
		return null;
	}
	return { id: event.id, choices, createdAt: Math.max(0, Math.floor(Number(now) || 0)) };
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
		return (run?.skills ?? []).length ? null : text;
	}
	if (kind === "curioForge") {
		return getUpgradableCurios(run).length ? null : text;
	}
	if (kind === "merchant") {
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
 * 事件页判断某个选项是否可选：负向货币（消耗）超过持有量时置灰。
 * 「随机给一个奇物」且图鉴已集齐的选项一律可选——它不会扣任何货币（走跳过分支），
 * 否则选项会被置灰且点不动，事件永远关不掉。
 * 带 action 的选项在这里永远可选：它们的价钱不写在 reward 而记在 action 上，
 * 真正确定要付是子页面里点下那一件/那一级的时刻， affordability 由子页面自己判。
 */
export function isChoiceAffordable(run, reward) {
	if (!reward || typeof reward !== "object") {
		return true;
	}
	if (reward.curio === "random" && !hasGrantableCurio(run)) {
		return true;
	}
	// 百分比投入（许愿池）：只要手上还有金币就一定能投，10% 投得起、50% 也投得起
	if (Number.isFinite(reward.goldPct) && reward.goldPct) {
		return (run.currency?.gold ?? 0) > 0;
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
 * 从商店候选池里随机挑一个「当前角色自带」与「已持有」都排除掉的技能 id；池子空了返回 null。
 * 事件奖励的「随机给技能」与技能熔炉的「换一个随机新技能」共用这一份判据，免得两处各自漂移。
 * @param {object} run 存档（读 run.skills）
 * @param {{ candidates?: {id:string}[], characterSkills?: string[] }} [ctx] 由 mode.js 从 lib 现算后传入
 */
export function pickRandomSkillId(run, ctx = {}, rng = Math.random) {
	const excluded = new Set([
		...(Array.isArray(run?.skills) ? run.skills : []),
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
 * 玩家选择后结算事件奖励。返回 { ok, error, run, lines, skillId?, curioId?, action? }；
 * 失败时 run 与传入的 run 是同一份未修改数据。普通选项成功时 pendingEvent 清空。
 *
 * 带 action 的选项是个例外：这里**一律不扣钱、不清事件**，只把参数原样回给调用方，
 * 由 mode.js 编排子页面或裂隙战，玩家真选定那一刻才落地——
 * 中途关游戏时 pendingEvent 还挂着，回来仍是这个事件，不会白点一次。
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
	// abyssDebt 不需要玩家再挑东西（就是记一笔债 + 照发 reward），所以它留在这里一起结算；
	// 其余四类都要开子页面或开战斗，一律原样回给 mode.js，一个钱都不扣
	if (choice.action && choice.action.kind !== "abyssDebt") {
		return { ok: true, error: null, run, lines: [], skillId: null, curioId: null, action: choice.action };
	}
	const reward = choice.reward ?? {};
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
		return { ok: true, error: null, run: skipped, lines: ["奇物图鉴已集齐，他没有可出售的东西，这次不收货币。"], skillId: null, curioId: null, action: null };
	}
	if (!isChoiceAffordable(run, reward)) {
		return { ok: false, error: "货币不足，无法选择该项", run };
	}

	const credited = applyEventCurrency(run, reward);
	const next = {
		...credited.run,
		skills: (run.skills ?? []).slice(0),
		stats: { ...run.stats },
		collection: {
			events: (run.collection?.events ?? []).slice(0),
			curios: (run.collection?.curios ?? []).slice(0),
		},
	};
	const lines = credited.lines;
	let skillId = null;
	let curioId = null;

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
			// grantRandomCurio 会把送出的奇物从商店候选里撤下（已拥有的不得再挂在奇物商店）
			next.curioOffers = granted.run.curioOffers;
			curioId = granted.curioId;
			lines.push(`获得奇物：${getCurio(curioId)?.name ?? curioId}`);
		} else {
			lines.push(granted.error);
		}
	} else if (typeof reward.curio === "string" && reward.curio) {
		// 古代遗迹三扇门在构建期就掷定了给哪一件（读档不重掷），这里照单发放
		const granted = grantCurioById(next, reward.curio);
		if (granted.ok) {
			next.curios = granted.run.curios;
			next.collection.curios = granted.run.collection.curios;
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
			skillId = pickRandomSkillId(next, ctx, rng);
			if (skillId) {
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

	// 经验泉「再饮一口」欠下的债：只记在存档上，开战那一刻消费并清零（见 mode.js:startBattle）。
	// 累加而不是覆盖——连着喝两次的债不该被后一次抹掉。
	if (choice.action?.kind === "abyssDebt" && choice.action.perEnemy > 0) {
		next.abyssDebt = (Number(run.abyssDebt) || 0) + choice.action.perEnemy;
		lines.push(`下一场战斗每个敌人获得 ${next.abyssDebt} 个随机深渊强化`);
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
