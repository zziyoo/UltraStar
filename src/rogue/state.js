// 存档数据层：六槽容器的读取、校验、迁移与序列化。
// 本文件不碰 game / lib / DOM，纯函数，可在 Node 里直接测。

import {
	BATTLE_STATUS,
	CHALLENGE_TOTAL_LEVELS,
	CURRENCIES,
	ENDLESS_STAT_UPGRADE_BASE,
	INITIAL_CURRENCY,
	RUN_MODE,
	RUN_VERSION,
	SKILL_REFRESH_PER_LEVEL,
	SKILL_SLOTS,
	SLOT_COUNT,
	STAT_IDS,
} from "./config.js";
import { getEnemyGroup } from "./data/enemyGroups.js";
import { stats } from "./data/stats.js";

const RUN_MODE_KEYS = Object.keys(RUN_MODE);

/**
 * 已下架的肉鸽专属原创技能（v2.2.0 移除，商店不再出现，定义也不再注册）。
 * 读档时从 skills / shopOffers / 敌方阵容里清掉，把技能槽与候选位原样腾出来。
 */
const DEPRECATED_SKILLS = new Set(["rogue_xushui", "rogue_jiema", "rogue_guiyuan"]);

function isDeprecatedSkill(id) {
	return DEPRECATED_SKILLS.has(id);
}

function isPlainObject(value) {
	return !!value && typeof value === "object" && !Array.isArray(value);
}

function toInt(value, fallback) {
	const num = Number(value);
	return Number.isFinite(num) ? Math.floor(num) : fallback;
}

function clampInt(value, min, max, fallback) {
	const num = toInt(value, fallback);
	if (!Number.isFinite(num)) {
		return fallback;
	}
	return Math.min(max, Math.max(min, num));
}

function sanitizeString(value) {
	return typeof value === "string" ? value.trim() : "";
}

/** 清洗一个敌方阵容条目：只有白名单字段，且全部是可序列化标量 */
function normalizeBattleEnemy(entry) {
	if (!isPlainObject(entry)) {
		return null;
	}
	const characterId = sanitizeString(entry.characterId);
	if (!characterId) {
		return null;
	}
	const statLevels = {};
	for (const key of STAT_IDS) {
		const maxLevel = Number.isFinite(stats[key]?.maxLevel) ? Math.max(0, Math.floor(stats[key].maxLevel)) : 0;
		statLevels[key] = clampInt(entry.stats?.[key], 0, maxLevel, 0);
	}
		const skills = [];
		for (const id of Array.isArray(entry.skills) ? entry.skills : []) {
			const skillId = sanitizeString(id);
			if (skillId && !isDeprecatedSkill(skillId)) {
				skills.push(skillId);
			}
		}
	return {
		characterId,
		stats: statLevels,
		skills,
		maxHp: toInt(entry.maxHp, 0),
		hp: Math.max(0, toInt(entry.hp, 0)),
	};
}

function normalizeBattleEnemies(list) {
	const enemies = [];
	for (const entry of Array.isArray(list) ? list : []) {
		const enemy = normalizeBattleEnemy(entry);
		if (enemy) {
			enemies.push(enemy);
		}
	}
	return enemies;
}

/**
 * 进行中的战斗要保存「已解析完成的敌方阵容」：角色 + 三项属性在开战前定死并落盘，
 * 恢复战斗原样重打，绝不重掷（否则随机出的敌人会因中途退出而变化）。
 * v2 及更早的旧档只存了 groupId：按当时的组合配置还原出阵容，同样不重掷；
 * 组合也没了（配置被删）才视为没有未完成战斗。
 */
function normalizeCurrentBattle(rawBattle) {
	if (!isPlainObject(rawBattle) || rawBattle.status !== BATTLE_STATUS.battle) {
		return null;
	}
	const enemies = normalizeBattleEnemies(rawBattle.enemies);
	if (enemies.length) {
		return { status: BATTLE_STATUS.battle, enemies };
	}
	const legacy = getEnemyGroup(sanitizeString(rawBattle.groupId));
	if (legacy) {
		return {
			status: BATTLE_STATUS.battle,
			enemies: normalizeBattleEnemies(legacy.enemies.map(enemy => ({
				characterId: enemy?.characterId,
				stats: {
					defense: enemy?.overrides?.defense,
					draw: enemy?.overrides?.draw,
					attack: enemy?.overrides?.attack,
				},
				skills: Array.isArray(enemy?.skills) ? enemy.skills : [],
				maxHp: enemy?.overrides?.maxHp,
				hp: enemy?.overrides?.hp,
			}))),
		};
	}
	return null;
}

/**
 * 把任意来路的数据重建为合法存档。
 * 采用白名单重建而非展开原对象，保证结果只含 JSON 可序列化的标量与数组，
 * Player / Card / 函数 / 循环引用都进不了存档。
 */
export function normalizeRun(raw) {
	if (!isPlainObject(raw)) {
		return null;
	}

	const mode = RUN_MODE_KEYS.includes(raw.mode) ? raw.mode : RUN_MODE.challenge;

	const currency = {};
	for (const key of CURRENCIES) {
		currency[key] = clampInt(raw.currency?.[key], 0, Number.MAX_SAFE_INTEGER, 0);
	}

		const seen = new Set();
		const skills = [];
		for (const id of Array.isArray(raw.skills) ? raw.skills : []) {
			const skillId = sanitizeString(id);
			if (!skillId || seen.has(skillId) || isDeprecatedSkill(skillId)) {
				continue;
			}
			seen.add(skillId);
			skills.push(skillId);
			if (skills.length >= SKILL_SLOTS) {
				break;
			}
		}

	const statLevels = {};
	for (const key of STAT_IDS) {
		const maxLevel = Number.isFinite(stats[key]?.maxLevel) ? Math.max(0, Math.floor(stats[key].maxLevel)) : 0;
		statLevels[key] = clampInt(raw.stats?.[key], 0, maxLevel, 0);
	}

	const currentBattle = normalizeCurrentBattle(raw.currentBattle);

		const shopOffers = [];
		for (const offer of Array.isArray(raw.shopOffers) ? raw.shopOffers : []) {
			const id = sanitizeString(offer?.id);
			if (!id || isDeprecatedSkill(id)) {
				continue;
			}
			shopOffers.push({ id, price: clampInt(offer?.price, 0, Number.MAX_SAFE_INTEGER, 0), sold: !!offer?.sold });
		}

	const totalLevels = mode === RUN_MODE.endless
		? 0
		: Math.max(1, toInt(raw.totalLevels, CHALLENGE_TOTAL_LEVELS));
	const level = clampInt(raw.level, 1, mode === RUN_MODE.endless ? Number.MAX_SAFE_INTEGER : Math.max(totalLevels, 1), 1);

	// 旧存档（v1）没有这个字段时补满；已经刷成 0 的原样保留，不然重读存档就等于白送次数
	const shopRefreshesRemaining = clampInt(raw.shopRefreshesRemaining, 0, SKILL_REFRESH_PER_LEVEL, SKILL_REFRESH_PER_LEVEL);

	return {
		version: RUN_VERSION,
		mode,
		characterId: sanitizeString(raw.characterId),
		level,
		totalLevels,
		currency,
		skills,
		stats: statLevels,
		currentBattle,
		shopOffers,
		shopRefreshesRemaining,
		cleared: !!raw.cleared,
		createdAt: Math.max(0, toInt(raw.createdAt, 0)),
		updatedAt: Math.max(0, toInt(raw.updatedAt, 0)),
	};
}

/** 新档：闯关与无尽共用同一结构，只靠 mode 与 totalLevels 区分。初始资源与免费刷新次数只看新建时的配置（旧档不会被补发资源，但会被补刷新次数字段） */
export function createRun(mode, characterId, now) {
	const run = normalizeRun({
		version: RUN_VERSION,
		mode: RUN_MODE_KEYS.includes(mode) ? mode : RUN_MODE.challenge,
		characterId,
		level: 1,
		totalLevels: mode === RUN_MODE.endless ? 0 : CHALLENGE_TOTAL_LEVELS,
		// 无尽的首级升级价是 20（floor(ENDLESS_STAT_UPGRADE_BASE×√1)），初始经验跟着对平——
		// 与闯关「初始 2 = 首级 2」同一个道理，新档开局即可升一次属性
		currency: { ...INITIAL_CURRENCY, exp: mode === RUN_MODE.endless ? ENDLESS_STAT_UPGRADE_BASE : INITIAL_CURRENCY.exp },
		shopRefreshesRemaining: SKILL_REFRESH_PER_LEVEL,
	});
	run.createdAt = now;
	run.updatedAt = now;
	return run;
}

/**
 * 无尽模式历史最高记录：独立于六个存档槽（无尽失败删档不清它）。
 * 只记录“已经成功通关过的最高一关”，返回 null 表示暂无记录。
 */
export function normalizeBest(raw) {
	if (!isPlainObject(raw)) {
		return null;
	}
	const level = clampInt(raw.level, 0, Number.MAX_SAFE_INTEGER, 0);
	if (level <= 0) {
		return null;
	}
	return {
		level,
		characterId: sanitizeString(raw.characterId),
		updatedAt: Math.max(0, toInt(raw.updatedAt, 0)),
	};
}

/** 只在真的通关了某一关时调用：level 是刚刚打赢的那一关，低于纪录时原样返回 */
export function updateBest(best, level, characterId, now) {
	const current = normalizeBest(best);
	const won = Math.floor(Number(level) || 0);
	if (won <= 0 || (current && current.level >= won)) {
		return current;
	}
	return { level: won, characterId: sanitizeString(characterId), updatedAt: now };
}

/**
 * 版本迁移：只允许单步前进，缺迁移函数时报错而不是崩溃。
 * 返回 { slots, errors }，errors 供上层提示玩家。
 */
export function migrateSlots(raw) {
	const errors = [];
	const list = Array.isArray(raw) ? raw : [];
	const slots = [];
	for (let i = 0; i < SLOT_COUNT; i++) {
		const data = list[i];
		if (data == null) {
			slots.push(null);
			continue;
		}
		if (!isPlainObject(data)) {
			slots.push(null);
			errors.push(`存档${i + 1}：数据格式无法识别，已按空存档处理`);
			continue;
		}
		const version = Number.isFinite(data.version) ? Math.floor(data.version) : RUN_VERSION;
		if (version > RUN_VERSION) {
			slots.push(null);
			errors.push(`存档${i + 1}：版本(${version})高于当前支持的版本(${RUN_VERSION})，请更新扩展后再读取`);
			continue;
		}
		const run = normalizeRun(data);
		if (run && !run.characterId) {
			slots.push(null);
			errors.push(`存档${i + 1}：缺少角色，已按空存档处理`);
			continue;
		}
		if (!run) {
			slots.push(null);
			errors.push(`存档${i + 1}：无法迁移，已按空存档处理`);
			continue;
		}
		if (version < RUN_VERSION) {
			errors.push(`存档${i + 1}：已从版本${version}迁移到${RUN_VERSION}`);
		}
		slots.push(run);
	}
	if (list.length > SLOT_COUNT) {
		errors.push(`存档槽位超出${SLOT_COUNT}个，多余数据已忽略`);
	}
	return { slots, errors };
}

export function setSlot(slots, index, run, now) {
	const next = slots.slice(0);
	next[index] = run ? { ...run, updatedAt: now } : null;
	while (next.length < SLOT_COUNT) {
		next.push(null);
	}
	return next;
}

/** 深拷贝，避免结算时把内存中的 run 与存档容器指向同一个对象 */
export function cloneRun(run) {
	return run ? normalizeRun(run) : null;
}

/** 存档写入前的最后一道关：确认整份数据 JSON 可序列化 */
export function toSerializable(slots) {
	try {
		const text = JSON.stringify(slots);
		if (text === undefined) {
			return { ok: false, error: "存档数据无法序列化" };
		}
		return { ok: true, data: JSON.parse(text) };
	} catch (error) {
		return { ok: false, error: error?.message ?? String(error) };
	}
}

