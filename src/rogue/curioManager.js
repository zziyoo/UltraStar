// CurioManager：奇物的效果查询与商店逻辑。纯函数，可在 Node 里直接测。
//
// 统一接口（不为每个奇物写独立代码）：
//   sumCurioEffects(ids)   把若干奇物的 effect 对象按键叠加成一张总表
//   getBonus(ids, type)    查某一类效果的累计值，如 getBonus(run.curios, "extraDraw") → 1
//   describeCurioEffects   效果总表 → 玩家可读的一行一条文案（营地/商店/标记说明共用）
//
// 战斗内的效果（extraPhase/extraDraw/dyingSave/roundHeal）由 battle.js 建局时把总表一次性写进
// player.storage.rogue_curio，由 data/skills.js 的机制技 rogue_curio 承载；
// 结算类效果（expRate/goldRate）在 reward.js 胜利结算时用 getBonus 现查。
// 商店侧：候选与售价在战斗胜利时定死写进存档（curioOffers），本文件负责生成与购买。

import { CURIO_BASE_PRICE, CURIO_OFFER_COUNT, CURIO_PRICE_SPREAD, SKILL_REFRESH_PER_LEVEL } from "./config.js";
import { curios, getCurio, curioIds, CURIOSITY_RARITY, CURIOSITY_RARITY_PRICE } from "./data/curios.js";

/** effect 里已知的键：战斗内四项 + 结算两项 + 刷新次数一项。数据自检保证 curios.json 不写出未知键 */
export const CURIOSITY_EFFECT_KEYS = ["extraPhase", "extraDraw", "dyingSave", "roundHeal", "expRate", "goldRate", "extraShopRefresh"];

/** effect 里属于战斗内的键：有任意一项才需要在建局时挂 rogue_curio 技能 */
export const CURIOSITY_BATTLE_KEYS = ["extraPhase", "extraDraw", "dyingSave", "roundHeal"];

/**
 * 把若干奇物的 effect 叠加成一张总表。
 * 未知键原样累加透传（getBonus 是通用接口，不把类型写死在这份清单里）。
 */
export function sumCurioEffects(ids) {
	const total = {};
	for (const id of Array.isArray(ids) ? ids : []) {
		const def = getCurio(id);
		if (!def || typeof def.effect !== "object" || !def.effect) {
			continue;
		}
		for (const [key, value] of Object.entries(def.effect)) {
			if (!Number.isFinite(value)) {
				continue;
			}
			total[key] = (total[key] ?? 0) + value;
		}
	}
	return total;
}

/** 查某一类效果的累计值：返回所有奇物在该键上的合计，没有则 0 */
export function getBonus(ids, type) {
	return sumCurioEffects(ids)[type] ?? 0;
}

/** 单键效果文案；0 值不显示，负值显示为减益（负面奇物）。与 curios.js 的 effectText 字段同源 */
const EFFECT_TEXT = {
	extraPhase: value => `游戏开始时，获得 ${value} 个额外的出牌阶段`,
	extraDraw: value => `摸牌阶段额外摸 ${value} 张牌`,
	dyingSave: value => `每局游戏首次进入濒死状态时，回复体力值至 1（共 ${value} 次）`,
	roundHeal: value => `每轮结束时回复 ${value} 点体力`,
	expRate: value => `经验获取 ${value >= 0 ? "+" : "-"}${Math.round(Math.abs(value) * 100)}%`,
	goldRate: value => `金币获取 ${value >= 0 ? "+" : "-"}${Math.round(Math.abs(value) * 100)}%`,
	extraShopRefresh: value => `每场战斗结束后，额外获得 ${value} 次技能商城刷新机会`,
};

/** 效果总表 → 一行一条的说明，顺序按 EFFECT_TEXT 的键序稳定输出 */
export function describeCurioEffects(effects) {
	const lines = [];
	for (const key of Object.keys(EFFECT_TEXT)) {
		const value = effects?.[key];
		if (Number.isFinite(value) && value !== 0) {
			lines.push(EFFECT_TEXT[key](value));
		}
	}
	return lines;
}

/** 单个奇物的效果行：优先用作者写的 effectText，留空则按 effect 自动生成 */
export function describeCurio(id) {
	const def = getCurio(id);
	if (!def) {
		return [];
	}
	const lines = def.effectText ? [def.effectText] : describeCurioEffects(def.effect);
	return lines.length ? lines : ["（该奇物暂无效果）"];
}

/** 奇物基准价：round(50 × √当前关卡)。参考技能定价（floor），这里按规格用 round；level 缺失按第 1 关 */
export function getCurioBasePrice(level = 1) {
	const n = Number.isFinite(level) ? Math.max(1, Math.floor(level)) : 1;
	return Math.round(CURIO_BASE_PRICE * Math.sqrt(n));
}

/**
 * 一局最多可能攒到的技能商城刷新次数：基础额度 + 全部「循环按钮」类奇物的加成。
 * 存档清洗要拿它当 clamp 上限——写死基础额度会把奇物给的额外次数读档时夹掉。
 */
export function getMaxShopRefreshes() {
	return SKILL_REFRESH_PER_LEVEL + curioIds.reduce((sum, id) => sum + Math.max(0, getBonus([id], "extraShopRefresh")), 0);
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
 */
export function rollCurioOffers(run, rng = Math.random) {
	const level = Number.isFinite(run?.level) ? run.level : 1;
	const owned = new Set(Array.isArray(run?.curios) ? run.curios : []);
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
	return { ok: true, error: null, run: next, curioId: offerId };
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

export { getCurio, curios, curioIds, CURIOSITY_RARITY };
