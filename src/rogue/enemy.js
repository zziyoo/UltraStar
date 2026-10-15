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
import { perfCount, perfMark } from "./perf.js";
import { appendAbyssAffixes, isAbyssStage, rollAbyssAffixes } from "./endless/abyss.js";
import { BOSS_AFFIX_TAG } from "./endless/abyssConfig.js";
import { BOSS_EXTRA_AFFIXES, BOSS_PITY_BATTLES, BOSS_RUN_RATE, BOSS_SKILL_DONOR_COUNT, CHALLENGE_COMBO_LEVELS, CHALLENGE_STAGE_LEVELS, CHALLENGE_TOTAL_LEVELS, RUN_MODE, STAT_IDS } from "./config.js";
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
 * 这一场新建的常规战斗要不要判成 Boss 战（纯函数，rng 与概率都可注入，方便测试）。
 * 两条互相独立的路径：
 *   1. 保底：当前关卡 - 上一次 Boss 触发的关卡 ≥ BOSS_PITY_BATTLES → 必定 Boss，**不消费随机源**
 *      ——概率掷了多少次没命中都不会影响它，第 15 关一定出；判据是关卡而不是场次，
 *      所以虫洞这类一次跳过多关的推进照样计入保底；
 *   2. 概率：Math.random() < BOSS_RUN_RATE（严格小于，与逐场判定的原口径一致）。
 * @param {number} level 即将开打的这一场所在的关卡（run.level）
 * @param {number} lastBossLevel run.bossPityLevel：上一次 Boss 战实际触发的关卡，0 = 还没出过
 * @param {() => number} [rng] 随机源；只有未到保底时才会被调用一次
 * @param {number} [rate] 判定概率；生产走 BOSS_RUN_RATE，测试可注入其它概率验证「未命中」路径
 */
export function shouldBossBattle(level, lastBossLevel, rng = Math.random, rate = BOSS_RUN_RATE) {
	const current = Math.max(1, Math.floor(Number(level) || 0));
	const since = Math.max(0, Math.floor(Number(lastBossLevel) || 0));
	if (current - since >= BOSS_PITY_BATTLES) {
		return true;
	}
	return rng() < rate;
}

/**
 * 技能来源角色的准入：拦「AI 操控不了」与「被禁将」两类。
 * 来源角色在本场战斗里**不出场**，只贡献技能表，所以这里刻意不调 isEnemyUsable()——
 * 那道闸还额外包含本体角色可用性（characterDisabled/isUnseen），会把来源范围收得比规格要求的更窄。
 * 但 forbidai / isAiForbidden 是另一回事：Boss 由 AI 操控，
 * 一个角色之所以被列进 forbidai 就是因为 AI 碰它会出问题，它的技能绝不能抄给 Boss。
 */
function isBossSkillDonorBlocked(id, info, banned) {
	if (banned.has(id)) {
		return true;
	}
	if (Array.isArray(lib.config?.forbidai) && lib.config.forbidai.includes(id)) {
		return true;
	}
	return info?.isAiForbidden === true;
}

/**
 * 「别的角色」资格池：除 Boss 本人外的全部可用来源——**禁将角色不供能**（禁将名单与商店同一份
 * `getBannedCharacterIds`，任一模式禁过就算禁将）。
 * 这里**只看身份类闸门，不碰技能表**：技能兼容性校验（`isRogueSkillAllowed`）是全链最贵的一步
 * （要扫技能定义的源码），留到随机顺序定下来之后、只对真正会被抽中的前几名按需做——见
 * `pickBossSkillDonors`。禁将只看**来源武将本身**（`isBossSkillDonorBlocked` 已经拦下禁将来源，
 * 所以这里不再逐条查技能属于不属于别的禁将角色——那是商店的口径，共享技能会因为「别人也拥有」被连带误杀）。
 */
export function getBossSkillDonorIdPool(bossId) {
	const banned = getBannedCharacterIds();
	const pool = [];
	for (const [id, info] of Object.entries(lib.character ?? {})) {
		if (id === bossId || isBossSkillDonorBlocked(id, info, banned)) {
			continue;
		}
		pool.push(id);
	}
	return pool;
}

/**
 * 单个来源角色的可用技能表：每条技能都要过兼容性校验（`isRogueSkillAllowed`，与商城同一道安全闸），
 * 一条可用技能都没有的角色当不了来源。stats 传入时顺带累计「真查过多少条技能」供性能日志用。
 */
function usableDonorSkills(id, stats = null) {
	const skills = [];
	for (const skill of skillsOf(lib.character?.[id])) {
		if (typeof skill !== "string" || !skill || skills.includes(skill)) {
			continue;
		}
		if (stats) {
			stats.checked++;
		}
		if (isRogueSkillAllowed(skill)) {
			skills.push(skill);
		}
	}
	return skills;
}

/**
 * 完整候选列表：资格池里每位带一份可用技能表（一条可用技能都没有的角色当不了来源）。
 * 会为**每一个**资格角色做技能兼容性校验——保留给测试/自检的穷举口径；
 * 实战开局走 `pickBossSkillDonors` 的按需抽取，不在这里全量扫。
 */
export function getBossSkillDonorCandidates(bossId) {
	const candidates = [];
	for (const id of getBossSkillDonorIdPool(bossId)) {
		const skills = usableDonorSkills(id);
		if (skills.length) {
			candidates.push({ id, skills });
		}
	}
	return candidates;
}

/**
 * Boss 技能来源的按需抽取：先对资格池做一次无偏随机排列（Fisher-Yates；与旧实现同一套洗牌，
 * 只是旧实现先穷举全部合法来源再洗牌，这里对更大的资格池洗牌），然后**按随机顺序逐个**
 * 做技能兼容性校验，凑够 count 名拥有合法技能的不同来源就立即停手，不再往后扫。
 *
 * 公平性：均匀随机排列里「前 count 名拥有合法技能的来源」这一子序列，恰好是从全部合法来源里
 * 无放回均匀抽样——每个合法来源出现在任何名次的概率相同，所以来源组合与旧实现分布一致；
 * 来源顺序也一致（按在排列里的先后依次供能，同名技能先到先得）。
 *
 * 合法来源不足 count 时继续检查完剩余候选，最终用上全部合法来源——不凑数、不重复（与旧实现相同）。
 * 技能定义与禁将名单都现读，不引用任何历史判定结果。
 */
export function pickBossSkillDonors(bossId, rng = Math.random, count = BOSS_SKILL_DONOR_COUNT) {
	const pool = getBossSkillDonorIdPool(bossId);
	for (let i = pool.length - 1; i > 0; i--) {
		const j = Math.floor(rng() * (i + 1));
		[pool[i], pool[j]] = [pool[j], pool[i]];
	}
	const wanted = Math.max(0, Math.floor(Number(count) || 0));
	if (!wanted) {
		return [];
	}
	const donors = [];
	const stats = { checked: 0, scanned: 0 };
	for (const id of pool) {
		if (donors.length >= wanted) {
			break;
		}
		stats.scanned++;
		const skills = usableDonorSkills(id, stats);
		if (skills.length) {
			donors.push({ id, skills });
		}
	}
	perfCount("来源候选池", pool.length);
	perfCount("实际扫描人数", stats.scanned);
	perfCount("兼容性检查技能条数", stats.checked);
	return donors;
}

/**
 * 生成 Boss 战的单人阵容（创建那场战斗时逐场掷中 Boss 才走这里，见 flow/battle.js 的 isBossBattle 分支）：
 *   · 只有 1 名敌人，角色从当前模式敌方池再按统一禁将名单（getBannedCharacterIds）过滤后随机
 *     ——禁将绝不入选担当 Boss（闯关池本身刻意不拦禁将，那是固定配置「照打」的口径，这里不适用）；
 *   · 额外获得另外三个不同角色（不与 Boss 本体重复）的全部技能，全部随阵容落盘、
 *     由 battle.js 的 grantSkills 真正挂到 Player 上（不是 UI 摆设）；
 *     （来源角色的两道闸：forbidai / isAiForbidden 的角色不当来源（Boss 由 AI 操控），
 *      禁将角色同样不当来源；每条技能还要过 isRogueSkillAllowed——禁将只卡来源武将本身）
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
	perfMark("Boss 敌方池构建");
	if (!pool.length) {
		return [];
	}
	const characterId = pool[Math.floor(rng() * pool.length) % pool.length];
	perfMark("Boss 角色抽取");
	// 三个不同来源：对资格池无偏随机排列后按序现查技能，凑够 BOSS_SKILL_DONOR_COUNT 名立即停
	// （不足三个就用现有全部，不凑数、不重复）——不再为了抽三个来源而扫全库技能
	const candidates = pickBossSkillDonors(characterId, rng);
	perfMark("来源角色筛选（含兼容性检测）");
	// 本体直接已有的技能不再重复列进复制技能：只按角色的**直接技能表**比对，
	// 不自己展开 group / derivation——展开是本体 grantSkills 的事，这里展开会误删本体技的合法伙伴。
	const native = new Set(skillsOf(lib.character?.[characterId] ?? [])
		.filter(id => typeof id === "string" && id));
	const skills = [];
	const skillSources = {};
	for (const donor of candidates.slice(0, BOSS_SKILL_DONOR_COUNT)) {
		for (const skill of donor.skills) {
			if (native.has(skill) || skills.includes(skill)) {
				continue;
			}
			skills.push(skill);
			// 记下是谁供的能（同名技能先到先得，与 skills 的顺序一致）：只给「复制技能」徽记当展示数据，
			// 战斗判定一律不看它。
			skillSources[skill] = donor.id;
		}
	}
	perfMark("复制技能整理去重");
	const points = Math.max(0, Math.min(ENEMY_TOTAL_MAX, Math.floor(Number(level) || 0)));
	const extra = Math.floor(Number(options?.extraAffixes));
	// 常规随机（含经验泉的债）照走正常关卡口径，**不带** boss 标签：带上它 Boss 就只能从专属强化里挑，
	// 常规那一份的数量与概率口径也会跟着变。Boss 自带的那个在此之外单独追加，那一份才带标签。
	const abyssStage = isAbyssStage(level, mode);
	let abyss = rollEnemyAffixes(level, mode, abyssStage, extra, rng);
	abyss = appendAbyssAffixes(abyss, BOSS_EXTRA_AFFIXES, rng, { mode, tags: [BOSS_AFFIX_TAG] });
	perfMark("深渊强化结算");
	// 属性分配与深渊强化是同一条 rng 序列上的先后两步（先词缀后属性，顺序不能换）
	const stats = allocateEnemyStats(points, rng);
	perfMark("属性分配");
	return [{
		characterId,
		stats,
		abyss,
		skills,
		skillSources,
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
