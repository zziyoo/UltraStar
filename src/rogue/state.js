// 存档数据层：六槽容器的读取、校验、迁移与序列化。
// 本文件不碰 game / lib / DOM，纯函数，可在 Node 里直接测。

import {
	BATTLE_STATUS,
	CHALLENGE_TOTAL_LEVELS,
	CURRENCIES,
	RUN_MODE,
	RUN_VERSION,
	SKILL_SLOTS,
	SLOT_COUNT,
	STAT_IDS,
} from "./config.js";
import { stats } from "./data/stats.js";

const RUN_MODE_KEYS = Object.keys(RUN_MODE);

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
		if (!skillId || seen.has(skillId)) {
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

	const groupId = sanitizeString(raw.currentBattle?.groupId);
	const currentBattle = groupId && raw.currentBattle?.status === BATTLE_STATUS.battle
		? { groupId, status: BATTLE_STATUS.battle }
		: null;

	const shopOffers = [];
	for (const offer of Array.isArray(raw.shopOffers) ? raw.shopOffers : []) {
		const id = sanitizeString(offer?.id);
		if (!id) {
			continue;
		}
		shopOffers.push({ id, price: clampInt(offer?.price, 0, Number.MAX_SAFE_INTEGER, 0), sold: !!offer?.sold });
	}

	const totalLevels = mode === RUN_MODE.endless
		? 0
		: Math.max(1, toInt(raw.totalLevels, CHALLENGE_TOTAL_LEVELS));
	const level = clampInt(raw.level, 1, mode === RUN_MODE.endless ? Number.MAX_SAFE_INTEGER : Math.max(totalLevels, 1), 1);

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
		cleared: !!raw.cleared,
		createdAt: Math.max(0, toInt(raw.createdAt, 0)),
		updatedAt: Math.max(0, toInt(raw.updatedAt, 0)),
	};
}

/** 新档：闯关与无尽共用同一结构，只靠 mode 与 totalLevels 区分 */
export function createRun(mode, characterId, now) {
	const run = normalizeRun({
		version: RUN_VERSION,
		mode: RUN_MODE_KEYS.includes(mode) ? mode : RUN_MODE.challenge,
		characterId,
		level: 1,
		totalLevels: mode === RUN_MODE.endless ? 0 : CHALLENGE_TOTAL_LEVELS,
	});
	run.createdAt = now;
	run.updatedAt = now;
	return run;
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

