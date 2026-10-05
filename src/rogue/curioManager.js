// CurioManager：奇物的效果查询、品质升级与商店逻辑。纯函数，可在 Node 里直接测。
//
// 统一接口（不为每个奇物写独立代码）：
//   sumCurioEffects(ids, qualityMap)   把若干奇物的「当前品质」效果按键叠加成一张总表
//   getBonus(ids, type, qualityMap)    查某一类效果的累计值，如 getBonus(run.curios, "extraDraw", run.curioQuality) → 1
//   describeCurioEffects               效果总表 → 玩家可读的一行一条文案（营地/商店/标记说明共用）
//
// 品质：def.rarity 是「初始品质」，run.curioQuality[id] 是「这个存档里的当前品质」。
// 二者必须分开——新获得的奇物永远从初始品质开始（见 getInitialQuality 的注释），
// 升级只写 run.curioQuality。battle.js / reward.js 一律用 getCurioEffect，不自己判品质。
//
// 战斗内的效果（extraPhase/extraDraw/dyingSave/dyingRecoverToRatio/roundHeal/turnHeal）由 battle.js
// 建局时把总表一次性写进 player.storage.rogue_curio，由 data/skills.js 的机制技 rogue_curio 承载；
// 结算类效果（expRate/goldRate/goldRateSpread）在 reward.js 胜利结算时用 getBonus 现查。
// 商店侧：候选与售价在战斗胜利时定死写进存档（curioOffers），本文件负责生成与购买。

import { CURIO_BASE_PRICE, CURIO_OFFER_COUNT, CURIO_PRICE_SPREAD, CURIO_UPGRADE_PRICE_MULTIPLIER, MERCHANT_PRICE_MULTIPLIER, SKILL_REFRESH_PER_LEVEL } from "./config.js";
import { getEndlessReward } from "./data/rewards.js";
import { curios, getCurio, curioIds, CURIOSITY_RARITY, CURIOSITY_RARITY_PRICE, CURIOSITY_QUALITY_CHAIN } from "./data/curios.js";

/**
 * effect 里已知的键：战斗内六项 + 结算两项（+ 金币波动一项）+ 刷新次数三项。
 * 其中 unrespondableLowHp / unrespondableCardDamage 是 unrespondable 的配套键，自己不出文案行
 * （与 dyingRecoverToRatio 之于 dyingSave 同一套做法）。
 * 数据自检保证 curios.js 不写出未知键。
 */
export const CURIOSITY_EFFECT_KEYS = [
	"extraPhase", "extraDraw", "dyingSave", "dyingRecoverToRatio", "roundHeal", "turnHeal",
	"firstDamageBonus", "unrespondable", "unrespondableLowHp", "unrespondableCardDamage",
	"hurtDamageNext", "hurtDamageRound", "hurtDamageGame",
	"expRate", "goldRate", "goldRateSpread",
	"extraShopRefresh", "extraCurioShopChance", "goldOfHeld", "goldOnReplace",
];

/**
 * effect 里属于战斗内的键：有任意一项才需要在建局时挂 rogue_curio 技能。
 * **配套键也算在这一栏里**（`dyingRecoverToRatio` 一直是这么处理的）：战斗面板按这张表把效果切成
 * 「战斗内 / 结算时」两组分别渲染，配套键漏在栏外就会被切掉，合成句因此缺半截——
 * 血怒核心会显示成「你使用的牌无法被响应」，把体力条件与「此牌伤害 +1」整个丢掉。
 */
export const CURIOSITY_BATTLE_KEYS = [
	"extraPhase", "extraDraw", "dyingSave", "dyingRecoverToRatio", "roundHeal", "turnHeal",
	"firstDamageBonus", "unrespondable", "unrespondableLowHp", "unrespondableCardDamage",
	"hurtDamageNext", "hurtDamageRound", "hurtDamageGame",
];

/**
 * 需要搬进 `player.storage.rogue_curio` 的键：就是上面这张战斗内表。
 * 新增战斗内效果只要登记进这两张表，battle.js 一个字都不用改——
 * 那里以前是逐个键手写清单，忘了同步就是「技能挂上了、数值全是 0」，真机上表现为效果完全没生效。
 */
export const CURIOSITY_STORAGE_KEYS = CURIOSITY_BATTLE_KEYS;

/** 品质链的终点（升到它就没有下一档了） */
const MAX_QUALITY = CURIOSITY_QUALITY_CHAIN[CURIOSITY_QUALITY_CHAIN.length - 1];

/** 奇物的初始品质：定义里的 rarity。**新获得的奇物永远从这里开始**，与图鉴/别的存档无关 */
export function getInitialQuality(id) {
	return getCurio(id)?.rarity ?? null;
}

/**
 * 奇物在某个存档里的当前品质：curioQuality 记了就用它，没记就是初始品质。
 * qualityMap 就是 run.curioQuality（允许缺省，全部按初始品质算）。
 */
export function getCurioQuality(id, qualityMap) {
	const raw = qualityMap?.[id];
	return typeof raw === "string" && CURIOSITY_QUALITY_CHAIN.includes(raw) ? raw : getInitialQuality(id);
}

/** 下一档品质；已在链尾（史诗）返回 null */
export function getNextCurioQuality(id, qualityMap) {
	const index = CURIOSITY_QUALITY_CHAIN.indexOf(getCurioQuality(id, qualityMap));
	return index >= 0 && index + 1 < CURIOSITY_QUALITY_CHAIN.length ? CURIOSITY_QUALITY_CHAIN[index + 1] : null;
}

export function isCurioMaxQuality(id, qualityMap) {
	return getNextCurioQuality(id, qualityMap) === null;
}

/** 指定品质下的效果表：qualityEffects 里写了就整份替换 effect，没写就沿用初始效果 */
export function getCurioEffectAt(id, quality) {
	const def = getCurio(id);
	if (!def) {
		return {};
	}
	const override = def.qualityEffects?.[quality];
	return override && typeof override === "object" ? override : (def.effect ?? {});
}

/** 当前品质下的效果表。战斗/结算一律走它，不要在 battle/reward 里自己判品质 */
export function getCurioEffect(id, qualityMap) {
	return getCurioEffectAt(id, getCurioQuality(id, qualityMap));
}

/**
 * 把若干奇物的当前品质效果叠加成一张总表。
 * @param {string[]} ids 已拥有的奇物 id
 * @param {object} [qualityMap] run.curioQuality
 */
export function sumCurioEffects(ids, qualityMap) {
	const total = {};
	for (const id of Array.isArray(ids) ? ids : []) {
		for (const [key, value] of Object.entries(getCurioEffect(id, qualityMap))) {
			if (!Number.isFinite(value)) {
				continue;
			}
			total[key] = (total[key] ?? 0) + value;
		}
	}
	return total;
}

export function getBonus(ids, type, qualityMap) {
	return sumCurioEffects(ids, qualityMap)[type] ?? 0;
}

/**
 * 百分比类效果文案：有配套的 `<key>Spread` 时写成区间（「金币获取 -10%~+10%」），
 * 那个 key 单独不出一行——它只是 base 的波动半径。
 */
function rateLine(key, noun, effects) {
	const value = effects[key];
	const spread = Math.abs(effects[`${key}Spread`] ?? 0);
	const pct = v => `${v >= 0 ? "+" : "-"}${Math.round(Math.abs(v) * 100)}%`;
	return `${noun}获取 ${spread > 0 ? `${pct(value - spread)}~${pct(value + spread)}` : pct(value)}`;
}

/**
 * 单键效果文案；0 值不显示，负值显示为减益（负面奇物）。界面文案的唯一来源就是这张表。
 * 第二参是整张效果表：濒死回复比例、金币波动半径这类配套键要靠它才能渲染。
 */
const EFFECT_TEXT = {
	extraPhase: value => `游戏开始时，获得 ${value} 个额外的出牌阶段`,
	extraDraw: value => `摸牌阶段额外摸 ${value} 张牌`,
	// 回复目标由 dyingRecoverToRatio 决定：写 0.5 就是「体力上限的 50%」，缺省回 1
	dyingSave: (value, effects) => {
		const ratio = effects?.dyingRecoverToRatio;
		const target = Number.isFinite(ratio) && ratio > 0 ? `体力上限的 ${Math.round(ratio * 100)}%` : "1";
		// 「首次」本身就是一次，只有真给到多次才补次数，否则每次濒死都多挂一句废话
		const count = value > 1 ? `（共 ${value} 次）` : "";
		return `每局游戏首次进入濒死状态时，回复体力值至${target}${count}`;
	},
	roundHeal: value => `每轮结束时回复 ${value} 点体力`,
	turnHeal: value => `每回合结束时回复 ${value} 点体力`,
	firstDamageBonus: value => `每回合首次造成伤害后，本回合你造成的伤害 +${value}`,
	// 血怒核心：两个配套键自己不出行，合成一条句子——分成两行会读成两件不相干的事
	unrespondable: (value, effects) => {
		const lowHp = (effects?.unrespondableLowHp ?? 0) > 0;
		const damage = effects?.unrespondableCardDamage ?? 0;
		const head = lowHp ? "体力低于体力上限的一半（向上取整）时，你使用的牌无法被响应" : "你使用的牌无法被响应";
		return damage > 0 ? `${head}，且此牌造成的伤害 +${damage}` : head;
	},
	hurtDamageNext: value => `当你受到伤害后，你下一次造成的伤害 +${value}`,
	hurtDamageRound: value => `当你受到伤害后，本回合你造成的伤害 +${value}`,
	hurtDamageGame: value => `当你受到伤害后，本局游戏你造成的伤害 +${value}`,
	expRate: (value, effects) => rateLine("expRate", "经验", effects),
	goldRate: (value, effects) => rateLine("goldRate", "金币", effects),
	extraShopRefresh: value => `每场战斗结束后，额外获得 ${value} 次技能商城刷新机会`,
	extraCurioShopChance: value => `每次战斗胜利后有 ${Math.round(Math.abs(value) * 100)}% 概率额外刷出一批奇物商店候选`,
	// 与 goldRate 分开写：那条乘的是本关基础奖励，这条乘的是你手上已有的总额，两者会叠乘
	goldOfHeld: value => `战斗结束后额外获得当前持有金币的 ${Math.round(Math.abs(value) * 100)}%`,
	goldOnReplace: value => `每次替换技能时获得本层基准金币的 ${value} 倍`,
};

/**
 * 效果总表 → 「键 / 文案」单元格。比纯文案多留一个 key：图鉴要拿它做逐档比对，
 * 才写得出「上一档：摸牌阶段额外摸 1 张牌」这种变化注记。
 * 单条文案生成失败不连累整张表——那一行退化成裸键值，页面照样打得开。
 */
function effectCells(effects) {
	const cells = [];
	for (const key of Object.keys(EFFECT_TEXT)) {
		const value = effects?.[key];
		if (!Number.isFinite(value)) {
			continue;
		}
		// 0 值本身不出行，除非有配套波动半径（-10%~+10% 这种档位）
		if (value === 0 && !Math.abs(effects?.[`${key}Spread`] ?? 0)) {
			continue;
		}
		let text;
		try {
			text = EFFECT_TEXT[key](value, effects);
		} catch {
			text = `${key}：${value}`;
		}
		cells.push({ key, text });
	}
	return cells;
}

/** 效果总表 → 一行一条的说明，顺序按 EFFECT_TEXT 的键序稳定输出 */
export function describeCurioEffects(effects) {
	return effectCells(effects).map(cell => cell.text);
}

/**
 * 图鉴用的完整升级路线：**只读奇物定义**，与玩家持有状态无关
 * （没拥有、只升到一半，图鉴都给全链路——图鉴是资料册，不是状态面板）。
 * 从初始品质沿 CURIOSITY_QUALITY_CHAIN 一路到链尾，负面奇物因此也一路净化到史诗。
 * 每档 = { quality, label, lines: [{ text, prev }], changed }：prev 是上一档同一条效果的文案，
 * 变了由界面补一句「上一档：…」，整档没变就是「与上一档相同」。
 * 新增奇物按 curios.js 的字段填即可进图鉴，这里不维护第二份效果表。
 */
export function getCurioUpgradeTrack(id) {
	const def = getCurio(id);
	if (!def) {
		return [];
	}
	const start = Math.max(0, CURIOSITY_QUALITY_CHAIN.indexOf(def.rarity));
	const steps = [];
	let prev = null;
	for (const quality of CURIOSITY_QUALITY_CHAIN.slice(start)) {
		const cells = effectCells(getCurioEffectAt(id, quality));
		const lines = cells.map(cell => ({ text: cell.text, prev: prev?.[cell.key] ?? null }));
		const before = prev;
		prev = Object.fromEntries(cells.map(cell => [cell.key, cell.text]));
		steps.push({
			quality,
			label: CURIOSITY_RARITY[quality] ?? quality,
			lines,
			// 新出现的项、删掉的项、改过的文案，都算这一档有变化
			changed: before !== null && (
				lines.some(line => line.prev === null || line.prev !== line.text)
				|| Object.keys(before).some(key => !cells.some(cell => cell.key === key))
			),
		});
	}
	return steps;
}

/**
 * 单个奇物的效果行：一律按当前品质的效果表自动生成。
 * 不再有「作者手写文案」这条分支——同一个奇物各档之间、各奇物之间必须是同一种句式，
 * 否则升一级就换一套措辞（「摸1张牌」→「摸 2 张牌」），读起来像两个东西。
 */
export function describeCurio(id, qualityMap) {
	const lines = describeCurioEffects(getCurioEffect(id, qualityMap));
	return lines.length ? lines : ["（该奇物暂无效果）"];
}

/** 奇物基准价：round(50 × √当前关卡)。参考技能定价（floor），这里按规格用 round；level 缺失按第 1 关 */
export function getCurioBasePrice(level = 1) {
	const n = Number.isFinite(level) ? Math.max(1, Math.floor(level)) : 1;
	return Math.round(CURIO_BASE_PRICE * Math.sqrt(n));
}

/**
 * 某件奇物沿品质链能达到的最大值：取「初始品质及其之后所有档位」里该项的最大值。
 * 存档清洗的 clamp 上限必须用它，否则循环按钮升到史诗后 +2 会被读档夹回 +1。
 */
export function getMaxCurioEffect(id, key) {
	const def = getCurio(id);
	if (!def) {
		return 0;
	}
	const start = Math.max(0, CURIOSITY_QUALITY_CHAIN.indexOf(def.rarity));
	let max = 0;
	for (const quality of CURIOSITY_QUALITY_CHAIN.slice(start)) {
		const value = getCurioEffectAt(id, quality)[key];
		if (Number.isFinite(value)) {
			max = Math.max(max, value);
		}
	}
	return max;
}

/**
 * 一局最多可能攒到的技能商城刷新次数：基础额度 + 全部「循环按钮」类奇物的**最高品质**加成。
 * 存档清洗要拿它当 clamp 上限——写死基础额度会把奇物给的额外次数读档时夹掉。
 */
export function getMaxShopRefreshes() {
	return SKILL_REFRESH_PER_LEVEL + curioIds.reduce((sum, id) => sum + Math.max(0, getMaxCurioEffect(id, "extraShopRefresh")), 0);
}

/**
 * 奇物品质升级价：5 × round(50×√升级时的关卡)。等级越高越贵，
 * 且永远按**当前升级时**的关卡现算，与当初买它花多少无关。
 */
export function getCurioUpgradePrice(run, id) {
	if (!getCurio(id)) {
		return null;
	}
	return CURIO_UPGRADE_PRICE_MULTIPLIER * getCurioBasePrice(run?.level ?? 1);
}

/**
 * 能否升级：奇物存在、当前持有、还有下一档、经验够。UI 拿它决定按钮状态与价签，结算层再验一次。
 * 返回 { ok, error, cost, from, to }，任何失败都不带副作用。
 * 只有「经验不足」这一种失败会带上完整的 from/to/cost——UI 正需要照着它显示价签与下一档预览。
 * @param {number} [priceOverride] 覆盖升级价（奇物融合炉用事件里定死的那个数，不走商店的 5× 基准价）
 */
export function checkCurioUpgrade(run, id, priceOverride = null) {
	const fail = error => ({ ok: false, error, cost: null, from: null, to: null });
	if (!getCurio(id)) {
		return fail("该奇物已下架");
	}
	if (!(run?.curios ?? []).includes(id)) {
		return fail("未拥有该奇物");
	}
	const from = getCurioQuality(id, run?.curioQuality);
	const to = getNextCurioQuality(id, run?.curioQuality);
	if (!to) {
		return fail("已达最高品质");
	}
	const cost = Number.isFinite(priceOverride) ? Math.max(0, Math.floor(priceOverride)) : getCurioUpgradePrice(run, id);
	if ((run.currency?.exp ?? 0) < cost) {
		return { ok: false, error: "经验不足", cost, from, to };
	}
	return { ok: true, error: null, cost, from, to };
}

/**
 * 花经验把一件已拥有的奇物升一档。只改 currency.exp 与 curioQuality 两项，且绝不修改传入的 run。
 * 失败时原 run 原样返回，经验与品质都不动。
 * @param {number} [priceOverride] 升级价覆盖值；省略时按商店价（5× 当前关奇物基准价）
 */
export function upgradeCurio(run, id, priceOverride = null) {
	const check = checkCurioUpgrade(run, id, priceOverride);
	if (!check.ok) {
		return { ok: false, error: check.error, run, curioId: id, from: null, to: null, cost: null };
	}
	const next = {
		...run,
		currency: { ...run.currency, exp: Math.max(0, (run.currency?.exp ?? 0) - check.cost) },
		curioQuality: { ...(run.curioQuality ?? {}) },
	};
	next.curioQuality[id] = check.to;
	return { ok: true, error: null, run: next, curioId: id, from: check.from, to: check.to, cost: check.cost };
}

/**
 * 奇物实际售价：round(基准价 × random(1±CURIO_PRICE_SPREAD) × 品质倍率 × priceMultiplier)。
 * 品质倍率来自 CURIOSITY_RARITY_PRICE（普通 ×2 / 稀有 ×5 / 史诗 ×10 / 负面 ×-5），
 * 负面奇物价格为负：购买反而获得金币。rng 可注入，方便测试；priceMultiplier 缺失按 1。
 * @param {number} level 当前关卡（基准价 = round(50×√level)）
 * @param {object} [def] 奇物定义（用 rarity 与 priceMultiplier；缺失按 ×1 兜底，不是普通档）
 * @param {() => number} [rng]
 */
export function getCurioPrice(level, def, rng = Math.random) {
	const base = getCurioBasePrice(level);
	const rarityMult = CURIOSITY_RARITY_PRICE[def?.rarity] ?? 1;
	const mult = rarityMult * (Number.isFinite(def?.priceMultiplier) && def.priceMultiplier >= 0 ? def.priceMultiplier : 1);
	const min = base * (1 - CURIO_PRICE_SPREAD);
	const max = base * (1 + CURIO_PRICE_SPREAD);
	const raw = Math.round((min + rng() * (max - min)) * mult);
	// 正价至少 1；负价（负面奇物）至多 -1，购买时反得金币
	return raw > 0 ? Math.max(1, raw) : Math.min(-1, raw);
}

/**
 * 战斗胜利后随机生成 CURIO_OFFER_COUNT 个奇物候选。
 * 随机池是整个 curios.json，排除已经拥有的奇物；第一版全部同概率（品质只影响售价与展示）。
 * 池子被排空时返回更少的候选（不重复填充、不死循环）；售价与候选一起定死，写进存档后不再重掷。
 * @param {object} run 存档（只读 run.level 与 run.curios）
 * @param {() => number} [rng] 可注入的随机源
 * @param {string[]} [exclude] 额外排除的奇物 id：连着摇第二批时，别让同一件货在两家货架上重复出现
 */
export function rollCurioOffers(run, rng = Math.random, exclude = []) {
	const level = Number.isFinite(run?.level) ? run.level : 1;
	const owned = new Set(Array.isArray(run?.curios) ? run.curios : []);
	for (const id of Array.isArray(exclude) ? exclude : []) {
		owned.add(id);
	}
	const pool = curioIds.filter(id => !owned.has(id));
	const picked = [];
	for (let i = pool.length - 1; i > 0; i--) {
		const j = Math.floor(rng() * (i + 1));
		[pool[i], pool[j]] = [pool[j], pool[i]];
	}
	for (const id of pool.slice(0, CURIO_OFFER_COUNT)) {
		picked.push({ id, price: getCurioPrice(level, curios[id], rng) });
	}
	return picked;
}

function hasCurrency(run, currency, amount) {
	return (run.currency?.[currency] ?? 0) >= amount;
}

export function getCurioOffer(run, offerId) {
	return (run?.curioOffers ?? []).find(offer => offer.id === offerId) ?? null;
}

/**
 * 购买奇物：扣金币、写入 run.curios 与图鉴（collection.curios 记录「曾经拥有过」，
 * 之后丢弃也不会从图鉴消失）。一批只卖一个：**买到即整批下架**——curioOffers 清空，
 * 商店里不留「已购买」残卡，下一批要等 CURIO_SHOP_RATE 命中重新摇。
 * 返回 { ok, error, run, curioId }；失败时 run 与传入的 run 是同一份未修改数据。
 */
export function buyCurio(run, offerId) {
	const fail = error => ({ ok: false, error, run });
	const offer = getCurioOffer(run, offerId);
	if (!offer) {
		return fail("该奇物不在本次候选中");
	}
	if (!Number.isFinite(offer.price) || !hasCurrency(run, "gold", offer.price)) {
		return fail("金币不足");
	}
	if ((run.curios ?? []).includes(offerId)) {
		return fail("已拥有该奇物");
	}
	const def = getCurio(offerId);
	if (!def) {
		return fail("该奇物已下架");
	}

	const next = {
		...run,
		currency: { ...run.currency },
		curios: (run.curios ?? []).slice(0),
		collection: {
			events: (run.collection?.events ?? []).slice(0),
			curios: (run.collection?.curios ?? []).slice(0),
		},
	};
	next.currency.gold = Math.max(0, (next.currency.gold ?? 0) - offer.price);
	next.curios.push(offerId);
	if (!next.collection.curios.includes(offerId)) {
		next.collection.curios.push(offerId);
	}
	next.curioOffers = [];
	next.curioOfferQueue = [];
	// 黄金罗盘多给的那一批：买到即整批下架后自动提上货架，于是同一关能买两次。
	// 队列要从传入的 run 里取（next 上刚被我们清成空表），但过滤得用 next.curios——
	// 刚买掉的这件已经进袋了，不能再从队列里出现在货架上
	const drained = takeNextCurioBatch({ ...run, curios: next.curios });
	if (drained.offers.length) {
		next.curioOffers = drained.offers;
		next.curioOfferQueue = drained.queue;
	}
	return { ok: true, error: null, run: next, curioId: offerId };
}

/**
 * 从 curioOfferQueue 里取出下一批奇物候选（黄金罗盘给的额外批次）。
 * 逐批过一遍「已拥有 / 已下架就不上架」的清洗，空批直接跳过；返回的 offers 与 queue 都是新建数组，
 * 不与传入的 run 共享引用（肉鸽层所有「改存档」的函数都靠这一点保证不原地污染）。
 */
export function takeNextCurioBatch(run) {
	const owned = new Set(Array.isArray(run?.curios) ? run.curios : []);
	const batches = [];
	for (const batch of Array.isArray(run?.curioOfferQueue) ? run.curioOfferQueue : []) {
		const offers = (Array.isArray(batch) ? batch : [])
			.filter(offer => getCurio(offer?.id) && !owned.has(offer.id))
			.map(offer => ({ id: offer.id, price: Math.round(Number(offer.price) || 0) }));
		if (offers.length) {
			batches.push(offers);
		}
	}
	return { offers: batches[0] ?? [], queue: batches.slice(1) };
}

/** 是否还有「未拥有、可随机获得」的奇物（事件奖励与神秘商人跳过判定共用） */
export function hasGrantableCurio(run) {
	const owned = new Set(Array.isArray(run?.curios) ? run.curios : []);
	return curioIds.some(id => !owned.has(id));
}

/**
 * 随机获得一个未拥有的奇物（事件奖励用）：与 rollCurioOffers 同一条排除规则。
 * 若送出的奇物还挂在商店候选里（生成候选时还没拥有），把它整条撤下——
 * 已拥有的奇物不得再出现在奇物商店。全部集齐时 ok:false，调用方给玩家写明落空原因。
 */
export function grantRandomCurio(run, rng = Math.random) {
	const owned = new Set(Array.isArray(run?.curios) ? run.curios : []);
	const pool = curioIds.filter(id => !owned.has(id));
	if (!pool.length) {
		return { ok: false, error: "奇物图鉴已集齐", run };
	}
	const curioId = pool[Math.floor(rng() * pool.length)];
	const next = {
		...run,
		curios: (run.curios ?? []).slice(0),
		curioOffers: (run.curioOffers ?? []).map(item => ({ ...item })),
		collection: {
			events: (run.collection?.events ?? []).slice(0),
			curios: (run.collection?.curios ?? []).slice(0),
		},
	};
	next.curios.push(curioId);
	next.curioOffers = next.curioOffers.filter(offer => offer.id !== curioId);
	if (!next.collection.curios.includes(curioId)) {
		next.collection.curios.push(curioId);
	}
	return { ok: true, error: null, run: next, curioId };
}

/**
 * 按初始品质挑一件「还没拥有」的奇物（古代遗迹三扇门在生成期定死结果用）。
 * 纯查询、不改 run，也不落袋——落袋由结算层按定死后的具体 id 执行。池子空了返回 null，调用方据此换成经验补偿。
 */
export function pickUnownedCurioOfRarity(run, rarity, rng = Math.random) {
	const owned = new Set(Array.isArray(run?.curios) ? run.curios : []);
	const pool = curioIds.filter(id => getCurio(id)?.rarity === rarity && !owned.has(id));
	if (!pool.length) {
		return null;
	}
	return pool[Math.floor(rng() * pool.length)];
}

/**
 * 把指定 id 的奇物放进背包（事件在生成期就定死了给哪一件，结算只负责落地）。
 * 与 grantRandomCurio 同一条规矩：已拥有的不得再挂在奇物商店，图鉴记「曾经拥有过」。
 * 已拥有 / 已下架时 ok:false 且不产生任何副作用。
 */
export function grantCurioById(run, curioId) {
	if (!getCurio(curioId)) {
		return { ok: false, error: "该奇物已下架", run, curioId: null };
	}
	if ((run?.curios ?? []).includes(curioId)) {
		return { ok: false, error: "已拥有该奇物", run, curioId };
	}
	const next = {
		...run,
		curios: (run.curios ?? []).slice(0),
		curioOffers: (run.curioOffers ?? []).map(item => ({ ...item })),
		collection: {
			events: (run.collection?.events ?? []).slice(0),
			curios: (run.collection?.curios ?? []).slice(0),
		},
	};
	next.curios.push(curioId);
	next.curioOffers = next.curioOffers.filter(offer => offer.id !== curioId);
	if (!next.collection.curios.includes(curioId)) {
		next.collection.curios.push(curioId);
	}
	return { ok: true, error: null, run: next, curioId };
}

/**
 * 遗忘之石「替换技能时」该发的金币 = 本层基准金币 × 效果值。
 * 关卡取 run.level，与商店给技能定价用的是同一个「当前关卡」口径（两处数字才对得上）。
 * 没有这块奇物（加成为 0）一律返回 0；调用方只在**真的发生了替换**（槽满让位）时才发这笔钱。
 */
export function getReplaceRewardGold(run) {
	const mult = getBonus(run?.curios ?? [], "goldOnReplace", run?.curioQuality);
	if (!(mult > 0)) {
		return 0;
	}
	const level = Number.isFinite(run?.level) ? Math.max(1, Math.floor(run.level)) : 1;
	const base = getEndlessReward(level, ["gold"]).gold ?? 0;
	return Math.max(0, Math.round(base * mult));
}

/** 还能往上升级的已拥有奇物（奇物融合炉的候选名单）：一件都没有、或全部已到顶，都返回空表 */
export function getUpgradableCurios(run) {
	return (run?.curios ?? []).filter(id => !isCurioMaxQuality(id, run?.curioQuality));
}

/** 流浪商人的恒定售价：奇物基准价 ×MERCHANT_PRICE_MULTIPLIER。不打 ±25% 波动，也不乘品质倍率 */
export function getMerchantPrice(level = 1) {
	return getCurioBasePrice(level) * MERCHANT_PRICE_MULTIPLIER;
}

/**
 * 流浪商人带来的那件货：从**全部**奇物里随机，明确不排除已拥有的——
 * 「买已经有的那件」就是这家商人的卖点（买完自动升一级），所以这里必须允许命中已拥有的。
 */
export function rollMerchantCurio(rng = Math.random) {
	if (!curioIds.length) {
		return null;
	}
	return curioIds[Math.floor(rng() * curioIds.length)] ?? null;
}

export { getCurio, curios, curioIds, CURIOSITY_RARITY, CURIOSITY_QUALITY_CHAIN };
