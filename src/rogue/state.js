// 存档数据层：六槽容器的读取、校验、迁移与序列化。
// 本文件不碰 game / lib / DOM，纯函数，可在 Node 里直接测。

import {
	BATTLE_STATUS,
	CHALLENGE_COMBO_LEVELS,
	CHALLENGE_STAGE_LEVELS,
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
import { getEvent } from "./data/events.js";
import { getCurio, CURIOSITY_QUALITY_CHAIN } from "./data/curios.js";
import { getMaxShopRefreshes, canLockShop } from "./curioManager.js";
import { normalizeEventReward, normalizeEventAction } from "./eventManager.js";
import { normalizeAbyssIds } from "./endless/abyss.js";
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
		// 深渊词缀：只认还在池子里的 id（下架的自动剔除），且**绝不重掷**——
		// 开战前定死落盘，读档原样还原，中途退出再进来还是同一批强化。
		abyss: normalizeAbyssIds(entry.abyss),
		skills,
		// Boss 战标记（v11）：建局时定死，读档原样还原。旧档缺字段按普通敌人处理（战斗层不翻倍体力）
		boss: entry.boss === true,
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
 * 深渊裂隙那一场的参数（v7）：事件在构建期把敌人数与奖励定死，开战时抄进 currentBattle.rift。
 * 为什么要单独存一份——选下「打五个」的瞬间 pendingEvent 就被清掉了，中途刷新再进来时
 * 「这场该发多少金币经验」只能从正在进行的战斗本身读出来。
 */
function normalizeRift(raw) {
	if (!isPlainObject(raw)) {
		return null;
	}
	return {
		level: clampInt(raw.level, 1, Number.MAX_SAFE_INTEGER, 1),
		enemies: clampInt(raw.enemies, 1, 99, 1),
		affixes: clampInt(raw.affixes, 0, 10, 0),
		gold: clampInt(raw.gold, 0, Number.MAX_SAFE_INTEGER, 0),
		exp: clampInt(raw.exp, 0, Number.MAX_SAFE_INTEGER, 0),
	};
}

/**
 * 进行中的战斗要保存「已解析完成的敌方阵容」：角色 + 三项属性在开战前定死并落盘，
 * 恢复战斗原样重打，绝不重掷（否则随机出的敌人会因中途退出而变化）。
 * v2 及更早的旧档只存了 groupId：按当时的组合配置还原出阵容，同样不重掷；
 * 组合也没了（配置被删）才视为没有未完成战斗。
 * v7 起额外携带 rift：有它 = 这一场是深渊裂隙，结算走「只发定死的倍率奖励、不推进关卡、不掷事件与奇物商店」。
 */
function normalizeCurrentBattle(rawBattle) {
	if (!isPlainObject(rawBattle) || rawBattle.status !== BATTLE_STATUS.battle) {
		return null;
	}
	const rift = normalizeRift(rawBattle.rift);
	const enemies = normalizeBattleEnemies(rawBattle.enemies);
	if (enemies.length) {
		return { status: BATTLE_STATUS.battle, enemies, rift };
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
			rift,
		};
	}
	return null;
}

/**
 * 无尽模式待处理事件（战斗胜利触发）：id + 已定死的选项与结果 + 生成时间。
 * 事件定义已删除（下架）时整个事件丢弃；选项与奖励按白名单重建，形状非法的条目剔除。
 * action（交互型选项的参数）与 blockedText（「此刻没有对象可作用」要对玩家说的话）同样随存档定死——
 * 商人手里那件货、裂隙的五个敌人、融合炉的融合费，读档恢复时都必须是同一个。
 * 只要这里还能还原出合法事件，读档就优先回到事件页——绝不重新触发、绝不重掷。
 */
function normalizePendingEvent(raw) {
	if (!isPlainObject(raw)) {
		return null;
	}
	const id = sanitizeString(raw.id);
	if (!getEvent(id)) {
		return null;
	}
	const choices = [];
	for (const choice of Array.isArray(raw.choices) ? raw.choices : []) {
		if (!isPlainObject(choice)) {
			continue;
		}
		const text = sanitizeString(choice.text);
		if (!text) {
			continue;
		}
		const built = { text, reward: normalizeEventReward(choice.reward) };
		const action = normalizeEventAction(choice.action);
		if (action) {
			built.action = action;
		}
		const blockedText = sanitizeString(choice.blockedText);
		if (blockedText) {
			built.blockedText = blockedText;
		}
		choices.push(built);
		if (choices.length >= 6) {
			break;
		}
	}
	if (!choices.length) {
		return null;
	}
	return { id, choices, createdAt: Math.max(0, toInt(raw.createdAt, 0)) };
}

/** 图鉴：已发现事件 + 曾经拥有过的奇物（卖掉/丢弃也留在图鉴里），只记有效 id 并去重 */
export function normalizeCollection(raw) {
	const collection = { events: [], curios: [] };
	if (!isPlainObject(raw)) {
		return collection;
	}
	for (const [key, lookup] of [["events", getEvent], ["curios", getCurio]]) {
		const seen = new Set();
		for (const id of Array.isArray(raw[key]) ? raw[key] : []) {
			const clean = sanitizeString(id);
			if (!clean || seen.has(clean) || !lookup(clean)) {
				continue;
			}
			seen.add(clean);
			collection[key].push(clean);
		}
	}
	return collection;
}

/** 图鉴并集：去重与「只认还存在的 id」都复用 normalizeCollection，下架条目会被自然剔掉 */
export function mergeCollections(a, b) {
	const left = normalizeCollection(a);
	const right = normalizeCollection(b);
	return normalizeCollection({
		events: [...left.events, ...right.events],
		curios: [...left.curios, ...right.curios],
	});
}

/** 已拥有的奇物：只收有效 id，去重、不排序（保序） */
function normalizeCurios(raw) {
	const list = [];
	const seen = new Set();
	for (const id of Array.isArray(raw) ? raw : []) {
		const clean = sanitizeString(id);
		if (!clean || seen.has(clean) || !getCurio(clean)) {
			continue;
		}
		seen.add(clean);
		list.push(clean);
	}
	return list;
}

/**
 * 奇物当前品质覆盖表：只记「高于初始品质」的档位，与初始品质相同就不记（存档精简）。
 * 这份数据属于当前 run（不进图鉴、不跨存档）。这里只做清洗，**绝不因为读到旧档就把奇物升级**：
 * 低于初始品质的（负向降级）、等于初始品质的、未拥有的、不认识的品质一律清掉。
 */
function normalizeCurioQuality(raw, owned = []) {
	const map = {};
	if (!isPlainObject(raw)) {
		return map;
	}
	const ownedSet = new Set(Array.isArray(owned) ? owned : []);
	for (const [id, value] of Object.entries(raw)) {
		const def = getCurio(id);
		if (!def || !ownedSet.has(id) || typeof value !== "string") {
			continue;
		}
		const start = CURIOSITY_QUALITY_CHAIN.indexOf(def.rarity);
		const index = CURIOSITY_QUALITY_CHAIN.indexOf(value);
		// 链上、且严格高于初始品质；index > start 同时挡掉了「等于初始品质」与「反向降级」
		if (start < 0 || index <= start) {
			continue;
		}
		map[id] = value;
	}
	return map;
}

/**
 * 奇物商店候选：{ id, price }，无效条目剔除。
 * 已拥有的奇物一律剔除（无论来源：买到即整批下架、事件送出会撤下，这里兜底清洗旧档残留）——
 * 已拥有的奇物不得再以任何形式挂在商店里。
 */
function normalizeCurioOffers(raw, owned = []) {
	const ownedSet = new Set(Array.isArray(owned) ? owned : []);
	const offers = [];
	for (const offer of Array.isArray(raw) ? raw : []) {
		if (!isPlainObject(offer)) {
			continue;
		}
		const id = sanitizeString(offer.id);
		if (!id || !getCurio(id) || ownedSet.has(id)) {
			continue;
		}
		// 负面奇物售价为负（购买反得金币），下界必须放到负数，否则读档后被夹成 0、白送一个奇物
		offers.push({ id, price: clampInt(offer.price, -Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, 0) });
	}
	return offers;
}

/**
 * 「第 N 关 → 第 N 个配置/组合」位置表的通用清洗（v8 challengeStages / v10 challengeComboStages 共用）：
 * 只把数据洗成干净的字符串数组——**不按配置池校验、不剔「不在池里」的 id、不去重**：
 * 这是位置表，剔掉任何一项都会让后面的关卡整体前移，读档就等于换敌人（规格明令禁止）；
 * 配置被改/删的关卡由开战时明确报错，而不是悄悄换人。
 * 只有非字符串（损坏数据）才剔除，超过关数上限的截断。
 */
function normalizeStageIdList(raw, cap) {
	const stages = [];
	for (const id of Array.isArray(raw) ? raw : []) {
		if (typeof id !== "string") {
			continue;
		}
		const clean = id.trim();
		if (clean) {
			stages.push(clean);
		}
		if (stages.length >= cap) {
			break;
		}
	}
	return stages;
}

/** v8：闯关前 10 关的关卡配置抽取结果（enemy.ensureChallengeStages 生成，本层只清洗） */
function normalizeChallengeStages(raw) {
	return normalizeStageIdList(raw, CHALLENGE_STAGE_LEVELS);
}

/**
 * v10：闯关第 11~30 关的双人组合抽取结果（enemy.ensureChallengeComboStages 生成，本层只清洗）。
 * 第 21~30 关复用第 11~20 关的抽取结果，所以这份表永远只有 CHALLENGE_COMBO_LEVELS 项；
 * 与 challengeStages 同一条纪律：只清不掷，旧档缺字段按空数组补齐，首次进入 11~30 关时补抽。
 */
function normalizeChallengeComboStages(raw) {
	return normalizeStageIdList(raw, CHALLENGE_COMBO_LEVELS);
}

/**
 * 把任意来路的数据重建为合法存档。
 * 采用白名单重建而非展开原对象，保证结果只含 JSON 可序列化的标量与数组，
 * Player / Card / 函数 / 循环引用都进不了存档。
 *
 * @param {object} raw
 * @param {{ isSkillAllowed?: (id: string) => boolean }} [options]
 *        isSkillAllowed 由调用方注入（mode.js 传技能池的判定；不传就只做形状清洗）。
 *        存档里的 shopOffers 可能来自旧版本/被改过：技能可能已下架、被判肉鸽不兼容、
 *        甚至根本不存在——读档这里先清一遍，免得过期候选绕过技能池规则。
 *        只清 shopOffers，**不动 skills**：已买到的技能属于玩家既有进度，
 *        就算后来被判不兼容也得继续带着（商店规则变了不该回头抢走玩家手里的东西）。
 */
export function normalizeRun(raw, options = {}) {
	if (!isPlainObject(raw)) {
		return null;
	}
	const isSkillAllowed = typeof options.isSkillAllowed === "function" ? options.isSkillAllowed : null;

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

	const curios = normalizeCurios(raw.curios);

	const shopOffers = [];
	for (const offer of Array.isArray(raw.shopOffers) ? raw.shopOffers : []) {
		const id = sanitizeString(offer?.id);
		if (!id || isDeprecatedSkill(id)) {
			continue;
		}
		if (isSkillAllowed && !isSkillAllowed(id)) {
			// 已下架 / 肉鸽不兼容 / 定义已消失：这一格干脆不还原，玩家看到的是更少的候选而不是坏候选
			continue;
		}
		// carried：收藏家的橱窗留到下一关的「已购买」那张——只占货架、不吃新的一局的购买额度，
		// 读档必须原样带回来，否则重进商店它就又算成本局买过的，整排货架被锁死
		shopOffers.push({
			id,
			price: clampInt(offer?.price, 0, Number.MAX_SAFE_INTEGER, 0),
			sold: !!offer?.sold,
			carried: !!offer?.carried,
		});
	}

	const totalLevels = mode === RUN_MODE.endless
		? 0
		: Math.max(1, toInt(raw.totalLevels, CHALLENGE_TOTAL_LEVELS));
	const level = clampInt(raw.level, 1, mode === RUN_MODE.endless ? Number.MAX_SAFE_INTEGER : Math.max(totalLevels, 1), 1);

	// v7：黄金罗盘多刷出来的那几批奇物候选。逐批走与当前批次同一套清洗
	// （已拥有的不上架、已下架的剔除），空批直接丢掉，免得货架上出现一格什么都不买的空白
	const curioOfferQueue = [];
	for (const batch of Array.isArray(raw.curioOfferQueue) ? raw.curioOfferQueue : []) {
		const offers = normalizeCurioOffers(batch, curios);
		if (offers.length) {
			curioOfferQueue.push(offers);
		}
	}

	// v6：奇物当前品质覆盖表。后文与商店锁都要用它，所以先算出来
	const curioQuality = normalizeCurioQuality(raw.curioQuality, curios);

	// 旧存档（v1）没有这个字段时补满；已经刷成 0 的原样保留，不然重读存档就等于白送次数。
	// 上限用「基础 + 全部刷新类奇物加成」，否则循环按钮给的额外次数读档后会被夹掉。
	const shopRefreshesRemaining = clampInt(raw.shopRefreshesRemaining, 0, getMaxShopRefreshes(), SKILL_REFRESH_PER_LEVEL);

	return {
		version: RUN_VERSION,
		mode,
		characterId: sanitizeString(raw.characterId),
		level,
		totalLevels,
		// v11：本局是否为 Boss 战。建局时按 BOSS_RUN_RATE 一次性判定并落盘，
		// 读档/重进/重新开战都只认这个字段，绝不重新随机；旧档缺字段按普通局（false）补齐
		bossRun: raw.bossRun === true,
		// v8：闯关前 10 关的敌方配置抽取结果（challenge 模式专用；由 enemy.ensureChallengeStages 生成，本层只清洗）
		challengeStages: normalizeChallengeStages(raw.challengeStages),
		// v10：闯关第 11~30 关的双人组合抽取结果（同上由 enemy.ensureChallengeComboStages 生成；旧档按空数组补齐）
		challengeComboStages: normalizeChallengeComboStages(raw.challengeComboStages),
		currency,
		skills,
		stats: statLevels,
		currentBattle,
		shopOffers,
		shopRefreshesRemaining,
		// v4：无尽模式的事件 / 图鉴 / 奇物。旧档（v3 及更早）没有这些字段时按默认值补齐，不影响读取
		pendingEvent: normalizePendingEvent(raw.pendingEvent),
		collection: normalizeCollection(raw.collection),
		curios,
		// v6：奇物品质升级。旧档（v5 及更早）没有这个字段时按空表补齐 = 全部停在初始品质
		curioQuality,
		curioOffers: normalizeCurioOffers(raw.curioOffers, curios),
		// v7：奇物商店的额外批次队列（黄金罗盘给的，买完当前这批才提上货架）
		curioOfferQueue,
		// v9：商店锁（收藏家的橱窗）。**只有当前确实持有对应锁定能力**才保留，否则一律清零——
		// 没有那件奇物时这两个字段对玩家不可见（商店里没有锁图标），留着就是一颗不知道什么时候会响的雷
		skillShopLocked: canLockShop({ curios, curioQuality }, "skill") && raw.skillShopLocked === true,
		curioShopLocked: canLockShop({ curios, curioQuality }, "curio") && raw.curioShopLocked === true,
		// v7：经验泉「再饮一口」欠下的债——下一场每名敌人追加几个深渊强化。旧档按「没有债」补齐，不重掷
		abyssDebt: clampInt(raw.abyssDebt, 0, 10, 0),
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
 * 闯关模式历史最高记录：与无尽同一套「独立存储键、删档不清」，但记的是**资源**而不是关卡数——
 * 金币与经验各取各的历史最大（用户定稿：「金币 100 经验 10」与「金币 50 经验 20」并成
 * 最高金币 100 / 最高经验 20）。两项都不是正数（= 没通过过闯关）返回 null，界面就不画那一行。
 */
export function normalizeBestChallenge(raw) {
	if (!isPlainObject(raw)) {
		return null;
	}
	const gold = clampInt(raw.gold, 0, Number.MAX_SAFE_INTEGER, 0);
	const exp = clampInt(raw.exp, 0, Number.MAX_SAFE_INTEGER, 0);
	if (gold <= 0 && exp <= 0) {
		return null;
	}
	return {
		gold,
		exp,
		characterId: sanitizeString(raw.characterId),
		updatedAt: Math.max(0, toInt(raw.updatedAt, 0)),
	};
}

/**
 * 只在「刚好打通最后一关」那一刻调用（通关后的重复挑战由调用方挡在这里之外）。
 * 两项都没涨时原样返回传进来的 best——调用方靠引用是否变化决定要不要落盘；
 * 涨了就只换涨的那一项，另一项保住历史最大，角色记破纪录这一把用的那个人。
 */
export function updateBestChallenge(best, currency, characterId, now) {
	const current = normalizeBestChallenge(best);
	const gold = clampInt(currency?.gold, 0, Number.MAX_SAFE_INTEGER, 0);
	const exp = clampInt(currency?.exp, 0, Number.MAX_SAFE_INTEGER, 0);
	if (!current) {
		return gold > 0 || exp > 0 ? { gold, exp, characterId: sanitizeString(characterId), updatedAt: now } : best;
	}
	if (current.gold >= gold && current.exp >= exp) {
		return best;
	}
	return {
		gold: Math.max(current.gold, gold),
		exp: Math.max(current.exp, exp),
		characterId: sanitizeString(characterId),
		updatedAt: now,
	};
}

/**
 * 版本迁移：只允许单步前进，缺迁移函数时报错而不是崩溃。
 * 返回 { slots, errors }，errors 供上层提示玩家。
 */
export function migrateSlots(raw, options = {}) {
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
		const run = normalizeRun(data, options);
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
export function cloneRun(run, options = {}) {
	return run ? normalizeRun(run, options) : null;
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

