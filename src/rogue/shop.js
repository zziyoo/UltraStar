// 商店逻辑：技能候选随机、购买、满槽替换、属性升级。纯函数，可在 Node 里直接测。
// 候选结果由调用方写进存档（shopOffers），本文件不碰 game。

import {
	ALLOW_DUPLICATE_SKILLS,
	CURRENCY_LABEL,
	SKILL_CURRENCY,
	SKILL_OFFER_COUNT,
	SKILL_PRICE_PER_LEVEL,
	SKILL_PRICE_SPREAD,
	SKILL_SLOTS,
	STAT_CURRENCY,
	STAT_IDS,
} from "./config.js";
import { pool } from "./data/skills.js";
import { getStatPrice, stats } from "./data/stats.js";

const SKILL_CURRENCY_NAME = CURRENCY_LABEL[SKILL_CURRENCY] ?? SKILL_CURRENCY;
const STAT_CURRENCY_NAME = CURRENCY_LABEL[STAT_CURRENCY] ?? STAT_CURRENCY;

function shuffle(list, rng) {
	const out = list.slice(0);
	for (let i = out.length - 1; i > 0; i--) {
		const j = Math.floor(rng() * (i + 1));
		const keep = out[i];
		out[i] = out[j];
		out[j] = keep;
	}
	return out;
}

function hasCurrency(run, currency, amount) {
	return (run.currency?.[currency] ?? 0) >= amount;
}

function spend(run, currency, amount) {
	run.currency[currency] = Math.max(0, (run.currency?.[currency] ?? 0) - amount);
}

/** 技能基准价：第 level 局 = round(5 × sqrt(level)) */
export function getSkillBasePrice(level) {
	const n = Math.max(1, Math.floor(Number(level) || 1));
	return Math.round(SKILL_PRICE_PER_LEVEL * Math.sqrt(n));
}

/** 实际售价：基准价 ±25% 内随机，至少 1。rng 可注入，方便测试 */
export function getRandomSkillPrice(level, rng = Math.random) {
	const base = getSkillBasePrice(level);
	const min = base * (1 - SKILL_PRICE_SPREAD);
	const max = base * (1 + SKILL_PRICE_SPREAD);
	return Math.max(1, Math.round(min + rng() * (max - min)));
}

/**
 * 定价用的“本局编号”。胜利结算会把 run.level 推进到下一关（第 2 局打完 level 已经是 3），
 * 而价格要按已经打过的第 2 局算，所以取 level-1；新建后还没打过任何一关时至少按第 1 局。
 */
export function getPricingLevel(run) {
	return Math.max(1, (Number(run?.level) || 1) - 1);
}

/** 每次进商店随机 SKILL_OFFER_COUNT 个候选；默认排除已拥有的技能 */
export function rollSkillOffers(run, rng = Math.random) {
	const owned = new Set(run?.skills ?? []);
	const candidates = pool.filter(entry => {
		if (!entry || typeof entry.id !== "string" || !entry.id) {
			return false;
		}
		return ALLOW_DUPLICATE_SKILLS || !owned.has(entry.id);
	});
	// 售价在生成候选时随机定死并写进存档：重载、重进商店、刷新 UI 都不再重掷
	const level = getPricingLevel(run);
	const picked = shuffle(candidates, rng).slice(0, Math.max(0, SKILL_OFFER_COUNT));
	return picked.map(entry => ({ id: entry.id, price: getRandomSkillPrice(level, rng), sold: false }));
}

/** 商店里是否还有买得起的候选 */
export function getOffer(run, offerId) {
	return (run?.shopOffers ?? []).find(offer => offer.id === offerId) ?? null;
}

/**
 * 购买技能。槽位满时必须给出合法的 replaceId（已有技能之一）。
 * 返回 { ok, error, run }；失败时 run 与传入的 run 是同一份未修改数据。
 */
export function buySkill(run, offerId, replaceId = null) {
	const offer = getOffer(run, offerId);
	if (!offer) {
		return { ok: false, error: "该技能不在本次商店候选中" };
	}
	if (offer.sold) {
		return { ok: false, error: "本次商店已购买过技能" };
	}
	if (!Number.isFinite(offer.price) || !hasCurrency(run, SKILL_CURRENCY, offer.price)) {
		return { ok: false, error: `${SKILL_CURRENCY_NAME}不足` };
	}
	if (run.skills.includes(offerId) && !ALLOW_DUPLICATE_SKILLS) {
		return { ok: false, error: "已拥有该技能" };
	}

	const next = { ...run, skills: run.skills.slice(0), currency: { ...run.currency }, shopOffers: run.shopOffers.map(item => ({ ...item })) };

	if (next.skills.length >= SKILL_SLOTS) {
		if (!replaceId || !next.skills.includes(replaceId)) {
			return { ok: false, error: `技能槽已满（${next.skills.length}/${SKILL_SLOTS}），需要先替换一个已有技能` };
		}
		next.skills = next.skills.filter(id => id !== replaceId);
	}

	next.skills.push(offerId);
	spend(next, SKILL_CURRENCY, offer.price);
	const target = next.shopOffers.find(item => item.id === offerId);
	if (target) {
		target.sold = true;
	}

	return { ok: true, error: null, run: next, removed: replaceId ?? null };
}

/** 属性升级检查：当前等级、上限、货币三项一起判 */
export function checkStatUpgrade(run, statId) {
	if (!STAT_IDS.includes(statId)) {
		return { ok: false, error: "没有该属性" };
	}
	const cfg = stats[statId];
	const level = run?.stats?.[statId] ?? 0;
	if (level >= cfg.maxLevel) {
		return { ok: false, error: "已达最高等级", level, maxLevel: cfg.maxLevel };
	}
	const price = getStatPrice(statId, level + 1);
	if (!Number.isFinite(price)) {
		return { ok: false, error: "该属性尚未配置升级价格", level, maxLevel: cfg.maxLevel };
	}
	if (!hasCurrency(run, STAT_CURRENCY, price)) {
		return { ok: false, error: `${STAT_CURRENCY_NAME}不足`, level, maxLevel: cfg.maxLevel, price };
	}
	return { ok: true, error: null, level, maxLevel: cfg.maxLevel, price };
}

export function upgradeStat(run, statId) {
	const check = checkStatUpgrade(run, statId);
	if (!check.ok) {
		return { ok: false, error: check.error, run };
	}
	const next = { ...run, stats: { ...run.stats, [statId]: run.stats[statId] + 1 }, currency: { ...run.currency } };
	spend(next, STAT_CURRENCY, check.price);
	return { ok: true, error: null, run: next, price: check.price };
}
