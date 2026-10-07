// 敌方生成：随机池、关卡配置池、属性点分配。纯逻辑（只读 lib），可在 Node 里直接测。
//
// 闯关前 10 关：敌人来自 data/challengeStages.js 配置池——建局时一次性不重复抽出 10 个配置
// 存进 run.challengeStages（ensureChallengeStages），每关按 challengeStages[level-1] 生成阵容
// （createStageEnemyConfigs，single/group 统一按 players 解析）。随机只发生在抽取那一刻，
// 之后读档/重进/失败重战都沿用存档里已定死的结果，绝不重掷。
//
// 闯关第 11~30 关：敌人来自 data/challengeCombos.js 双人组合池——首次进入 11~30 关时一次性
// 不重复抽出 10 个组合存进 run.challengeComboStages（ensureChallengeComboStages，存档 v10）。
// 第 11~20 关按 challengeComboStages[level-11] 生成双人阵容；第 21~30 关不重新抽，复用同一
// 结果：第 N 关 = challengeComboStages[N-21] 的双人组合 + 扩展角色池随机第三人
// （createChallengeComboConfigs，第三人位置随机但保持组合的左右顺序，随 currentBattle.enemies
// 一起落盘，恢复战斗绝不重掷）。
//
// 其余关卡两张池，绝不混用：
//   无尽 = 本体全部未禁用角色（运行时从 lib.character 全集扣除本扩展角色得到，不复制静态名单）。
//
// 敌人的 Roguelike 属性与玩家同一套定义（data/stats.js）：这里只负责把「总点数」随机分配成
// defense / draw / attack 三个等级，效果施加统一走 battle.js 的 applyEffects。

import { lib } from "../../../../noname.js";

import { packages } from "../core/loader.js";
import { appendAbyssAffixes, isAbyssStage, rollAbyssAffixes } from "./endless/abyss.js";
import { BOSS_EXTRA_AFFIXES, CHALLENGE_COMBO_LEVELS, CHALLENGE_STAGE_LEVELS, CHALLENGE_TOTAL_LEVELS, RUN_MODE, STAT_IDS } from "./config.js";
import { drawChallengeStageIds } from "./data/challengeStages.js";
import { drawChallengeComboIds } from "./data/challengeCombos.js";
import { getBannedCharacterIds, isRogueSkillAllowed, skillsOf } from "./skillPool.js";

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
 * 某个敌人最终携带的词缀 = 常规随机 + 事件强制追加的那几个。
 * 追加与常规随机同一条不放回规则，所以深渊裂隙「额外自带一个」一定是**新**的一条强化，
 * 不会把已经随到的那条重复计数。词缀总开关关着时池子是空的，追加一个也加不上——
 * 裂隙与泉水都不会绕过 ABYSS_ENABLED。
 */
function rollEnemyAffixes(level, mode, abyssStage, extra, rng) {
	const rolled = abyssStage ? rollAbyssAffixes(level, rng, { mode }) : [];
	if (!(extra > 0)) {
		return rolled;
	}
	return appendAbyssAffixes(rolled, extra, rng, { mode });
}

/**
 * 生成本关敌方阵容：数量按关卡定，逐个从模式对应池子里随机挑角色，
 * 每人独立随机分配「恰好 level 点」属性（超过 30 按 30），
 * 无尽模式从第 abyssConfig.ABYSS_START_LEVEL 层起再各自独立掷一次深渊词缀。
 * 结果会原样写进存档 currentBattle.enemies——创建本关战斗前就定死，重载/恢复不重掷。
 * 失败（池子为空）返回空数组，由调用方提示。
 * @param {{ enemies?: number, extraAffixes?: number }} [options] 深渊裂隙用的两个覆盖：
 *        enemies 直接指定敌人数（不走 getEnemyCount 那张层数表），
 *        extraAffixes 是每名敌人**额外必给**的词缀个数（裂隙自带的 + 经验泉欠的债）
 */
export function createEnemyConfigs(level, mode, rng = Math.random, options = {}) {
	const wanted = Math.floor(Number(options?.enemies));
	const count = wanted > 0 ? wanted : getEnemyCount(level, mode);
	const pool = getEnemyPool(mode);
	const characters = sampleCharacters(pool, count, rng);
	const points = Math.max(0, Math.min(ENEMY_TOTAL_MAX, Math.floor(Number(level) || 0)));
	// 深渊化的门槛（层数 + 只有无尽）在这里判一次；闯关模式恒为 false，一行随机都不会跑
	const abyssStage = isAbyssStage(level, mode);
	const extra = Math.floor(Number(options?.extraAffixes));
	return characters.map(characterId => ({
		characterId,
		stats: allocateEnemyStats(points, rng),
		abyss: rollEnemyAffixes(level, mode, abyssStage, extra, rng),
		skills: [],
		maxHp: 0,
		hp: 0,
	}));
}

// ---------------------------------------------------------------- Boss 战

/**
 * 「别的角色」候选：除 Boss 本人外的全部角色（禁将也可以当技能来源——规格明确不加这条限制），
 * 每人带一份过兼容性校验（isRogueSkillAllowed，与商城同一道安全闸）后的可用技能表；
 * 一条可用技能都没有的角色当不了来源。
 */
function getBossSkillDonorCandidates(bossId) {
	const candidates = [];
	for (const [id, info] of Object.entries(lib.character ?? {})) {
		if (id === bossId) {
			continue;
		}
		const skills = [];
		for (const skill of skillsOf(info)) {
			if (typeof skill !== "string" || !skill || skills.includes(skill)) {
				continue;
			}
			if (isRogueSkillAllowed(skill)) {
				skills.push(skill);
			}
		}
		if (skills.length) {
			candidates.push({ id, skills });
		}
	}
	return candidates;
}

/**
 * 生成 Boss 战的单人阵容（Boss 战整局替换普通关卡，见 flow/battle.js 的 bossRun 分支）：
 *   · 只有 1 名敌人，角色从当前模式敌方池再按统一禁将名单（getBannedCharacterIds）过滤后随机
 *     ——禁将绝不入选担当 Boss（闯关池本身刻意不拦禁将，那是固定配置「照打」的口径，这里不适用）；
 *   · 额外获得另外两个不同角色（不与 Boss 本体重复）的全部技能，全部随阵容落盘、
 *     由 battle.js 的 grantSkills 真正挂到 Player 上（不是 UI 摆设）；
 *   · 深渊强化 = 当前关卡正常计算的那一份 + Boss 固定追加的 BOSS_EXTRA_AFFIXES 个
 *     （appendAbyssAffixes 不放回，追加的永远是新的强化，也不占正常计算的数量）；
 *   · 体力 ×2 不在这里做：存档只记 boss 标记，battle.js 建局初始化该 Player 时翻倍一次。
 * 结果随 currentBattle.enemies 一起写进存档，重载/恢复绝不重掷。
 * 池子为空（全体禁用）返回空数组，由调用方提示。
 */
export function createBossEnemyConfig(level, mode, rng = Math.random, options = {}) {
	// Boss 必须来自「当前非禁将角色」：在模式池之上再统一按禁将名单过滤一道
	// （getChallengeEnemyPool 刻意不拦禁将——那是闯关固定配置「照打」的口径，Boss 不适用）
	const banned = getBannedCharacterIds();
	const pool = getEnemyPool(mode).filter(id => !banned.has(id));
	if (!pool.length) {
		return [];
	}
	const characterId = pool[Math.floor(rng() * pool.length) % pool.length];
	// 两个不同来源：先洗牌再取前两个（不足两个就用现有全部，不凑数、不重复）
	const candidates = getBossSkillDonorCandidates(characterId);
	for (let i = candidates.length - 1; i > 0; i--) {
		const j = Math.floor(rng() * (i + 1));
		[candidates[i], candidates[j]] = [candidates[j], candidates[i]];
	}
	const skills = [];
	for (const donor of candidates.slice(0, 2)) {
		for (const skill of donor.skills) {
			if (!skills.includes(skill)) {
				skills.push(skill);
			}
		}
	}
	const points = Math.max(0, Math.min(ENEMY_TOTAL_MAX, Math.floor(Number(level) || 0)));
	const extra = Math.floor(Number(options?.extraAffixes));
	// 常规随机（含经验泉的债）照走正常关卡口径；Boss 自带的那个在此之外单独追加
	const abyssStage = isAbyssStage(level, mode);
	let abyss = rollEnemyAffixes(level, mode, abyssStage, extra, rng);
	abyss = appendAbyssAffixes(abyss, BOSS_EXTRA_AFFIXES, rng, { mode });
	return [{
		characterId,
		stats: allocateEnemyStats(points, rng),
		abyss,
		skills,
		maxHp: 0,
		hp: 0,
		boss: true,
	}];
}

// ---------------------------------------------------------------- 闯关前 10 关：关卡配置池

/**
 * 关卡配置能否参与抽取：每个成员角色都真实存在（lib.character 里有）。
 * 注意与 isEnemyUsable 的区别——**禁将不拦抽取**（定稿：关卡配置池的角色即使被禁将
 * 也照抽照打，battle.js 的 resolveBattle 对这一路以 allowBanned 放行）；只有角色
 * 根本不存在的配置才跳过（抽进来那一关就永远开不了战）。
 */
export function isStageConfigDrawable(config) {
	const players = Array.isArray(config?.players) ? config.players : [];
	return players.length > 0 && players.every(player => characterExists(player?.character));
}

/**
 * 抽取结果的状态：
 *   ready         —— 已经有完整的前 10 关结果，什么都不用做；
 *   generated     —— 本次真的抽了（新局建好 / 旧档补抽）；
 *   insufficient   —— 可用配置不足 CHALLENGE_STAGE_LEVELS：明确判为配置不足，
 *                     不生成、不循环补齐，由调用方提示并阻止开局；
 *   skipped       —— 无尽模式 / 关卡不在前 10 关内，本函数不参与。
 */
export const CHALLENGE_STAGE_STATE = {
	ready: "ready",
	generated: "generated",
	insufficient: "insufficient",
	skipped: "skipped",
};

/**
 * 建局时一次性抽出闯关前 10 关的配置并写进 run.challengeStages（存档 v8 字段）。
 *
 * 只在「闯关模式 + 当前关卡在前 10 关内」时考虑生成。两种需要生成的情况：
 *   1. 新局（createRun 之后）challengeStages 还是空的；
 *   2. challengeStages 只有 1~9 项——**这是残缺存档**（旧版本写了一半、被外部改过、
 *      或者上一次就是在「配置不足」的状态下存的），明确判为损坏并重新抽一次，
 *      绝不因为它「非空」就当作已经抽好（那样第 10 关会永远开不了战，玩家只看到一句莫名的报错）。
 * 抽满之后读档、重进、失败重战都原样沿用，本函数与随机流程都不再碰它。
 *
 * 可用配置不足 10 个时**不写回**任何东西：返回 insufficient 与可用条数，交给上层提示玩家补配置。
 * isAvailable 可注入（Node 测试用），默认 isStageConfigDrawable。
 * @returns {{ run: object, generated: boolean, status: string, available?: number }}
 *          generated = 本次是否真的抽了；status 见 CHALLENGE_STAGE_STATE
 */
export function ensureChallengeStages(run, rng = Math.random, isAvailable = isStageConfigDrawable) {
	if (!run || run.mode !== RUN_MODE.challenge) {
		return { run, generated: false, status: CHALLENGE_STAGE_STATE.skipped };
	}
	const level = Math.floor(Number(run.level) || 0);
	if (!(level >= 1 && level <= CHALLENGE_STAGE_LEVELS)) {
		return { run, generated: false, status: CHALLENGE_STAGE_STATE.skipped };
	}
	const current = Array.isArray(run.challengeStages) ? run.challengeStages : [];
	if (current.length >= CHALLENGE_STAGE_LEVELS) {
		return { run, generated: false, status: CHALLENGE_STAGE_STATE.ready };
	}
	// 走到这里：0 项（旧档/新局）或 1~9 项（残缺）——一律重抽，绝不循环补齐
	const drawn = drawChallengeStageIds(rng, isAvailable);
	if (drawn.length < CHALLENGE_STAGE_LEVELS) {
		return {
			run,
			generated: false,
			status: CHALLENGE_STAGE_STATE.insufficient,
			available: drawn.length,
		};
	}
	return {
		run: { ...run, challengeStages: drawn },
		generated: true,
		status: CHALLENGE_STAGE_STATE.generated,
	};
}

// ---------------------------------------------------------------- 闯关第 11~30 关：双人组合池

/**
 * 建局时一次性抽出闯关第 11~20 关的双人组合并写进 run.challengeComboStages（存档 v10 字段）。
 *
 * 只在「闯关模式 + 当前关卡在 11~30 关内」时考虑生成（21~30 关复用同一份抽取结果，
 * 所以进入 21 关前它必然已存在）。两种需要生成的情况：
 *   1. 新局一路打到第 11 关（challengeComboStages 还是空的）；
 *   2. 只有 1~9 项——**这是残缺存档**（与 challengeStages 同一条纪律），明确判为损坏
 *      并重新抽一次，绝不因为它「非空」就当作已经抽好（那样第 20 关会永远开不了战）。
 * 抽满之后读档、重进、失败重战都原样沿用，本函数与随机流程都不再碰它。
 *
 * 可用组合不足 10 个时**不写回**任何东西：返回 insufficient 与可用条数，交给上层提示玩家补配置。
 * isAvailable 可注入（Node 测试用），默认 isStageConfigDrawable（与关卡配置同一条闸门：
 * 只看成员角色是否存在，禁将不拦——battle.js 的 resolveBattle 对固定配置这一路以 allowBanned 放行）。
 * @returns {{ run: object, generated: boolean, status: string, available?: number }}
 */
export function ensureChallengeComboStages(run, rng = Math.random, isAvailable = isStageConfigDrawable) {
	if (!run || run.mode !== RUN_MODE.challenge) {
		return { run, generated: false, status: CHALLENGE_STAGE_STATE.skipped };
	}
	const level = Math.floor(Number(run.level) || 0);
	if (!(level > CHALLENGE_STAGE_LEVELS && level <= CHALLENGE_TOTAL_LEVELS)) {
		return { run, generated: false, status: CHALLENGE_STAGE_STATE.skipped };
	}
	const current = Array.isArray(run.challengeComboStages) ? run.challengeComboStages : [];
	if (current.length >= CHALLENGE_COMBO_LEVELS) {
		return { run, generated: false, status: CHALLENGE_STAGE_STATE.ready };
	}
	// 走到这里：0 项（打到第 11 关的旧档/新局）或 1~9 项（残缺）——一律重抽，绝不循环补齐
	const drawn = drawChallengeComboIds(rng, isAvailable);
	if (drawn.length < CHALLENGE_COMBO_LEVELS) {
		return {
			run,
			generated: false,
			status: CHALLENGE_STAGE_STATE.insufficient,
			available: drawn.length,
		};
	}
	return {
		run: { ...run, challengeComboStages: drawn },
		generated: true,
		status: CHALLENGE_STAGE_STATE.generated,
	};
}

/**
 * 第 21~30 关的敌方阵容：对应双人组合 + 扩展角色池随机第三人。
 *
 * 第三人的规则（缺一不可）：
 *   · 来自本扩展的角色池（getChallengeEnemyPool，已含存在性与 isEnemyUsable 判定），
 *     options.pool 可注入（Node 测试用），传数组用数组、传函数用返回值；
 *   · 不得与组合的两名固定角色重复（就算组合自己撞名也一样）；
 *   · 位置在 [第三人,左,右] / [左,第三人,右] / [左,右,第三人] 里随机，但左右相对顺序永远不变；
 *   · 找不到合法第三人时明确返回失败，由上层阻止本关开始——绝不偷偷复制固定角色凑数。
 * 生成后由调用方随 currentBattle.enemies 一起落盘：中途刷新/崩溃恢复沿用原第三人，绝不重掷。
 * 属性分配走 createStageEnemyConfigs 的原路径：3 名敌人（含第三人）各自独立吃一份完整等级预算。
 * @returns {{ ok: true, enemies: object[], third: string, position: number }
 *           | { ok: false, error: string }}
 */
export function createChallengeComboConfigs(config, level, rng = Math.random, options = {}) {
	const players = Array.isArray(config?.players) ? config.players : [];
	const fixed = players
		.map(player => (typeof player?.character === "string" ? player.character.trim() : ""))
		.filter(id => id);
	const source = typeof options.pool === "function" ? options.pool() : options.pool;
	const candidates = (Array.isArray(source) ? source : getChallengeEnemyPool()).filter(id => !fixed.includes(id));
	if (!candidates.length) {
		return { ok: false, error: "扩展角色池里没有能当第三人的可用角色（都被禁用或与固定角色重复）" };
	}
	const third = candidates[Math.floor(rng() * candidates.length) % candidates.length];
	// 三个空位随机：0 = 最前、1 = 中间、2 = 最后；splice 不移动已有的相对顺序
	const position = Math.floor(rng() * 3) % 3;
	const ordered = players.slice();
	ordered.splice(Math.min(position, ordered.length), 0, { character: third });
	return {
		ok: true,
		third,
		position,
		enemies: createStageEnemyConfigs({ ...config, players: ordered }, level, rng, options),
	};
}

/** 成员指定的固定属性：只认三项、夹到 0..ENEMY_STAT_MAX，缺省键按 0（不再随机） */
function fixedPlayerStats(raw) {
	const source = raw && typeof raw === "object" ? raw : {};
	const result = {};
	for (const key of STAT_IDS) {
		const value = Math.floor(Number(source[key]));
		result[key] = Number.isFinite(value) ? Math.min(ENEMY_STAT_MAX, Math.max(0, value)) : 0;
	}
	return result;
}

/**
 * 关卡配置 → 敌方阵容：single 与 group 统一按 players 逐个生成，随机系统不感知配置类型，
 * 未来加组合 / 指定属性 / 指定技能都只改 data/challengeStages.js 的数据，不改这里。
 * 属性预算按「每个敌人一份」计：关卡等级决定的是每个敌人的独立预算，不随人数摊薄——
 *   · 写了固定 stats 的成员照用配置值（fixedPlayerStats）；
 *   · 没写的成员各自独立随机分配「恰好 level 点」（与 createEnemyConfigs 完全同一条
 *     allocateEnemyStats）：第 N 关每名敌人都是 N 点，多人关卡不共享、不切分预算。
 * 深渊词缀与常规随机同一条路径（闯关恒为空数组；经验泉的债照常透传，闯关正常恒为 0）。
 * @param {object} config data/challengeStages.js 里的一个配置（getChallengeStageConfig 的返回值）
 * @returns {object[]} 形状与 createEnemyConfigs 一致的敌方阵容，直接进 currentBattle.enemies 落盘
 */
export function createStageEnemyConfigs(config, level, rng = Math.random, options = {}) {
	const players = Array.isArray(config?.players) ? config.players : [];
	const points = Math.max(0, Math.min(ENEMY_TOTAL_MAX, Math.floor(Number(level) || 0)));
	const extra = Math.floor(Number(options?.extraAffixes));
	const enemies = [];
	for (const player of players) {
		const characterId = typeof player?.character === "string" ? player.character.trim() : "";
		if (!characterId) {
			continue;
		}
		// 固定 stats 照用配置值；没写的成员各自独立吃一份完整等级预算（多人不共享）
		const stats = player.stats && typeof player.stats === "object"
			? fixedPlayerStats(player.stats)
			: allocateEnemyStats(points, rng);
		enemies.push({
			characterId,
			stats,
			abyss: rollEnemyAffixes(level, RUN_MODE.challenge, false, extra, rng),
			skills: Array.isArray(player.skills) ? player.skills.filter(id => typeof id === "string" && id) : [],
			maxHp: Number.isFinite(Number(player.maxHp)) ? Math.floor(Number(player.maxHp)) : 0,
			hp: Number.isFinite(Number(player.hp)) ? Math.floor(Number(player.hp)) : 0,
		});
	}
	return enemies;
}
