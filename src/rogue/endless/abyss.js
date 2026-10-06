// Abyss：无尽模式的深渊化强化「随机 + 存档」层。纯逻辑，不碰 game / lib / DOM，可在 Node 里直接测。
//
// 分工：
//   abyssConfig.js  层数门限、词缀池、上限等机制参数
//   abyss.js（本文件）算某个敌人该拿几个、随机出哪几个、以及把读档来的数据清洗回合法形状
//   abyssAffixes.js 九个词缀的技能本体与文案（由 mode.js 随模式注册，battle.js 挂到敌人身上）
//
// 随机只发生在「本关开战前」：enemy.js 生成阵容时调用一次，结果原样写进
// currentBattle.enemies[i].abyss，之后重载/异常退出恢复战斗都从这里取，绝不重掷。
// 低于起始层、或不是无尽模式时返回空数组——普通模式与闯关模式因此一行代码都不会执行到。

import { RUN_MODE } from "../config.js";
import {
	ABYSS_ENABLED,
	ABYSS_FULL_LEVEL,
	ABYSS_MAX_AFFIXES,
	ABYSS_START_LEVEL,
	AFFIX_POOL,
} from "./abyssConfig.js";

/** 词缀池里当前可随机的条目（enabled 为 false 的条目不再随机，旧档由 normalizeAbyssIds 清掉） */
export function getAbyssAffixDefs(context = {}) {
	if (!ABYSS_ENABLED) {
		return [];
	}
	const tags = Array.isArray(context.tags) ? context.tags : [];
	return AFFIX_POOL.filter(item => {
		if (!item || !item.id || item.enabled === false) {
			return false;
		}
		// 没写 tags 的词缀是通用词缀，任何场合都能随机到；
		// 写了 tags 的（Boss 专属等）只有调用方把对应标签放进 context.tags 时才进池。
		if (!Array.isArray(item.tags) || !item.tags.length) {
			return true;
		}
		return item.tags.some(tag => tags.includes(tag));
	});
}

export function getAbyssPoolIds(context) {
	return getAbyssAffixDefs(context).map(item => item.id);
}

/** 这个词缀 id 是否还在池子里（存档清洗用） */
export function isAbyssAffixId(id, context) {
	return getAbyssPoolIds(context).includes(id);
}

export function isAbyssStage(level, mode) {
	if (!ABYSS_ENABLED || mode !== RUN_MODE.endless) {
		return false;
	}
	return toStage(level) >= ABYSS_START_LEVEL;
}

function toStage(level) {
	const num = Number(level);
	return Number.isFinite(num) ? Math.floor(num) : 0;
}

/** 单个敌人的词缀数量上限：配置的 ABYSS_MAX_AFFIXES，没配就只受词缀池大小限制（不重复地全拿） */
function getAffixCap(poolSize) {
	const cap = Number.isFinite(ABYSS_MAX_AFFIXES) && ABYSS_MAX_AFFIXES > 0
		? Math.floor(ABYSS_MAX_AFFIXES)
		: Number.POSITIVE_INFINITY;
	return Math.max(0, Math.min(cap, poolSize));
}

/**
 * 每个敌人独立掷的「该拿几个」。规格的两段规则在这里逐条对应：
 *   31~99 层：stage% 概率拿 1 个（31 层 31%，50 层 50%）；
 *   100 层起：必定 floor(stage / 100) 个，再按 (stage % 100)% 概率多拿 1 个
 *            （100 层必定 1 个；234 层必定 2 个 + 34% 概率第 3 个）。
 * rng 可注入，测试靠它把概率分支钉成确定值。
 */
export function rollAbyssAffixCount(level, rng = Math.random) {
	const stage = toStage(level);
	if (!ABYSS_ENABLED || stage < ABYSS_START_LEVEL) {
		return 0;
	}
	if (stage < ABYSS_FULL_LEVEL) {
		return rng() < stage / 100 ? 1 : 0;
	}
	const guaranteed = Math.floor(stage / ABYSS_FULL_LEVEL);
	const remainder = stage % ABYSS_FULL_LEVEL;
	return guaranteed + (rng() < remainder / 100 ? 1 : 0);
}

/** 按 weight 做一次不放回抽样；权重全相等时等价于等概率 */
function pickWeighted(pool, rng) {
	let total = 0;
	for (const item of pool) {
		total += Math.max(0, Number(item.weight) || 0);
	}
	if (total <= 0) {
		return pool[0];
	}
	let roll = rng() * total;
	for (const item of pool) {
		roll -= Math.max(0, Number(item.weight) || 0);
		if (roll < 0) {
			return item;
		}
	}
	return pool[pool.length - 1];
}

/**
 * 生成本关某一个敌人的深渊词缀 id 列表（不放回、不重复，数量受词缀池大小与上限约束）。
 * 词缀池被排空时返回更少的条目，不重复填充、不死循环。
 * @param {number} level 当前无尽层数
 * @param {() => number} [rng] 可注入随机源
 * @param {{ mode?: string, tags?: string[] }} [context] 随机上下文；tags 为空时只取通用词缀
 */
export function rollAbyssAffixes(level, rng = Math.random, context = {}) {
	const count = rollAbyssAffixCount(level, rng);
	if (count <= 0) {
		return [];
	}
	const defs = getAbyssAffixDefs(context);
	if (!defs.length) {
		return [];
	}
	const bag = defs.slice(0);
	const picked = [];
	while (picked.length < count && picked.length < getAffixCap(defs.length) && bag.length) {
		const chosen = pickWeighted(bag, rng);
		const index = bag.indexOf(chosen);
		if (index < 0) {
			break;
		}
		bag.splice(index, 1);
		picked.push(chosen.id);
	}
	return picked;
}

/**
 * 往某个敌人已有的词缀上再追加 N 个（深渊裂隙必给的那一条、经验泉欠下的债都走这里）。
 * 与 rollAbyssAffixes 同一条不放回规则：已经在他身上的不会再被抽到，所以「额外自带一个」
 * 永远是**新**的一条强化，不会和常规随机的结果重叠计数。
 * 词缀池被抽干（或 ABYSS_ENABLED 关掉、池子为空）时就少加，不死循环也不造空条目。
 * @param {string[]} existing 该敌人已随机到的词缀 id
 * @param {number} count 要追加几个
 * @param {() => number} [rng]
 * @param {{ mode?: string, tags?: string[] }} [context]
 */
export function appendAbyssAffixes(existing, count, rng = Math.random, context = {}) {
	const list = Array.isArray(existing) ? existing.slice(0) : [];
	const extra = Math.floor(Number(count) || 0);
	if (extra <= 0) {
		return list;
	}
	const bag = getAbyssAffixDefs(context).filter(item => !list.includes(item.id));
	let added = 0;
	while (added < extra && bag.length) {
		const chosen = pickWeighted(bag, rng);
		const index = bag.indexOf(chosen);
		if (index < 0) {
			break;
		}
		bag.splice(index, 1);
		list.push(chosen.id);
		added += 1;
	}
	return list;
}

/**
 * 把读档来的词缀数据重建为合法数组：只留还在池子里的 id、去重、按配置顺序稳定排列、夹到上限。
 * 数组为空时返回空数组（不是 undefined），保证存档里永远有这一个字段。
 */
export function normalizeAbyssIds(raw, context = {}) {
	const pool = getAbyssAffixDefs(context);
	if (!pool.length || !Array.isArray(raw)) {
		return [];
	}
	const order = new Map(pool.map((item, index) => [item.id, index]));
	const seen = new Set();
	const list = [];
	for (const id of raw) {
		const clean = typeof id === "string" ? id.trim() : "";
		if (!clean || seen.has(clean) || !order.has(clean)) {
			continue;
		}
		seen.add(clean);
		list.push(clean);
	}
	list.sort((a, b) => order.get(a) - order.get(b));
	return list.slice(0, getAffixCap(pool.length));
}
