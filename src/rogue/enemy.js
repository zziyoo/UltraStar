// 敌方随机生成：数量、角色池、属性点分配。纯逻辑（只读 lib），可在 Node 里直接测。
//
// 两个模式两张池，绝不混用：
//   闯关 = 只从本扩展（奥特之星）实际注册的角色里随机；
//   无尽 = 本体全部未禁用角色（运行时从 lib.character 全集扣除本扩展角色得到，不复制静态名单）。
//
// 敌人的 Roguelike 属性与玩家同一套定义（data/stats.js）：这里只负责把「总点数」随机分配成
// defense / draw / attack 三个等级，效果施加统一走 battle.js 的 applyEffects。

import { lib } from "../../../../noname.js";

import { packages } from "../core/loader.js";
import { isAbyssStage, rollAbyssAffixes } from "./endless/abyss.js";
import { RUN_MODE } from "./config.js";
import { getBannedCharacterIds } from "./skillPool.js";

/** 单项属性上限，与 data/stats.js 各属性的 maxLevel 一致 */
export const ENEMY_STAT_MAX = 10;
/** 属性总点数上限：三项各 10 */
export const ENEMY_TOTAL_MAX = ENEMY_STAT_MAX * 3;

function characterExists(id) {
	return typeof id === "string" && !!id && !!lib.character?.[id];
}

/**
 * 敌方侧能否用这个角色：AI 不可操控（forbidai / isAiForbidden）、本体判为不可用
 * （isUnseen、全局禁将、模式角色过滤等，见 lib.filter.characterDisabled）都不进池。
 */
export function isEnemyUsable(id) {
	if (!characterExists(id)) {
		return false;
	}
	if (lib.config.forbidai?.includes(id) || lib.character[id]?.isAiForbidden) {
		return false;
	}
	if (typeof lib.filter?.characterDisabled === "function") {
		try {
			if (lib.filter.characterDisabled(id)) {
				return false;
			}
		} catch (error) {
			console.error("[rogue] 敌方过滤失败，按可用处理：", id, error);
		}
	}
	return true;
}

/** 本扩展实际提供（随 registry.buildPackage 注册）的全部角色 id，与角色包同源、不硬编码名单 */
export function getExtensionCharacterIds() {
	const ids = new Set();
	for (const pkg of packages) {
		for (const id of Object.keys(pkg.characters ?? {})) {
			ids.add(id);
		}
	}
	return ids;
}

/** 闯关模式敌方池 */
export function getChallengeEnemyPool() {
	const pool = [];
	for (const id of getExtensionCharacterIds()) {
		if (characterExists(id) && isEnemyUsable(id) && !pool.includes(id)) {
			pool.push(id);
		}
	}
	return pool;
}

/**
 * 无尽模式敌方池：本体全部未禁用角色。
 * 运行时用「lib.character 全集 − 本扩展角色」得到；禁用判定复用本体口径
 * （isEnemyUsable 的 characterDisabled，含全局禁将）加上项目已有的各模式禁将名单并集。
 * 若玩家还装了其他扩展，其角色同样是「当前游戏未禁用的可用角色」，一并作为候选；本扩展角色绝不混入。
 */
export function getEndlessEnemyPool() {
	const extensionIds = getExtensionCharacterIds();
	const banned = getBannedCharacterIds();
	const pool = [];
	for (const id of Object.keys(lib.character ?? {})) {
		if (extensionIds.has(id) || banned.has(id)) {
			continue;
		}
		if (isEnemyUsable(id) && !pool.includes(id)) {
			pool.push(id);
		}
	}
	return pool;
}

/** 按模式取敌方池；未知模式按闯关处理 */
export function getEnemyPool(mode) {
	return mode === RUN_MODE.endless ? getEndlessEnemyPool() : getChallengeEnemyPool();
}

/**
 * 每关敌人数（闯关与无尽同一张表）：
 *   1~10 关 1 个、11~20 关 2 个、21~30 关 3 个；无尽第 31 关起固定 3 个，不再增加。
 * mode 参数只为让调用点语义完整，当前两模式共用同一张表。
 */
export function getEnemyCount(level, mode = RUN_MODE.challenge) {
	void mode;
	const n = Math.max(1, Math.floor(Number(level) || 1));
	if (n <= 10) {
		return 1;
	}
	if (n <= 20) {
		return 2;
	}
	return 3;
}

/**
 * 把 totalPoints 随机分配到 defense / draw / attack 三项，每项 ≤10，总和恰为 min(totalPoints, 30)。
 * 用「带上限的顺序分配」：每一步只在「剩余点数仍恰好分得完」的区间内随机，不重试、无偏差死角。
 * 每个敌人独立调用一次；同一 rng 序列下结果可复现（便于测试）。
 */
export function allocateEnemyStats(totalPoints, rng = Math.random) {
	const remainingTotal = Math.max(0, Math.min(ENEMY_TOTAL_MAX, Math.floor(Number(totalPoints) || 0)));
	const keys = ["defense", "draw", "attack"];
	const result = { defense: 0, draw: 0, attack: 0 };
	let remaining = remainingTotal;
	for (let i = 0; i < keys.length; i++) {
		const slotsLeft = keys.length - i - 1;
		// 后面的项最多各 ENEMY_STAT_MAX 点，必须先给它们留够；同时本项不能超过上限与剩余点数
		const low = Math.max(0, remaining - slotsLeft * ENEMY_STAT_MAX);
		const high = Math.min(ENEMY_STAT_MAX, remaining);
		const value = low + Math.floor(rng() * (high - low + 1));
		result[keys[i]] = value;
		remaining -= value;
	}
	return result;
}

/** 从池子里随机挑 count 个不重复角色；池子比敌人数还小时允许重复兜底（两个池都是大池，正常到不了这里） */
function sampleCharacters(pool, count, rng) {
	const bag = pool.slice();
	const picked = [];
	for (let i = 0; i < count; i++) {
		if (!bag.length) {
			const repeat = picked[Math.floor(rng() * picked.length) % Math.max(1, picked.length)];
			if (typeof repeat === "string") {
				picked.push(repeat);
			}
			continue;
		}
		const index = Math.floor(rng() * bag.length) % bag.length;
		picked.push(bag[index]);
		bag.splice(index, 1);
	}
	return picked;
}

/**
 * 生成本关敌方阵容：数量按关卡定，逐个从模式对应池子里随机挑角色，
 * 每人独立随机分配「恰好 level 点」属性（超过 30 按 30），
 * 无尽模式从第 abyssConfig.ABYSS_START_LEVEL 层起再各自独立掷一次深渊词缀。
 * 结果会原样写进存档 currentBattle.enemies——创建本关战斗前就定死，重载/恢复不重掷。
 * 失败（池子为空）返回空数组，由调用方提示。
 */
export function createEnemyConfigs(level, mode, rng = Math.random) {
	const count = getEnemyCount(level, mode);
	const pool = getEnemyPool(mode);
	const characters = sampleCharacters(pool, count, rng);
	const points = Math.max(0, Math.min(ENEMY_TOTAL_MAX, Math.floor(Number(level) || 0)));
	// 深渊化的门槛（层数 + 只有无尽）在这里判一次；闯关模式恒为 false，一行随机都不会跑
	const abyssStage = isAbyssStage(level, mode);
	return characters.map(characterId => ({
		characterId,
		stats: allocateEnemyStats(points, rng),
		abyss: abyssStage ? rollAbyssAffixes(level, rng, { mode }) : [],
		skills: [],
		maxHp: 0,
		hp: 0,
	}));
}
