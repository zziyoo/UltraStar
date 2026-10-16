// 「故人的心」（史诗奇物）：每场战斗的游戏开始时，玩家可以失去任意个技能，
// 令任意名敌方角色失去**等量**个技能。结算只发生在当前这一场战斗的 Player 上。
//
// 三条纪律：
//   1. 只动战斗里的 Player，绝不碰存档——run.skills / run.skillInventory 一个字都不改，
//      所以下一场战斗按存档重新 grantSkills，奇物又能再来一次；也不会误触发
//      遗忘之石 / 贪食魔盒（那两条奖励只认 penalty.loseSkills 对背包的删除）。
//   2. 真失去走本体的 `player.removeSkill(id, true)`（断肠 clearSkills 的同一套底层）：
//      摘触发器、摘子技能、清可清的状态；持恒技（persevereSkill）不吃任何保护——
//      removeSkill 只拦 `fixed`，那类内部技在下面的枚举里就已经被筛掉了。
//   3. 失去之后要把挂在别处的展示与持续状态一起收掉：深渊徽记（storage.abyss_affix / rogueEnhanceInfo）、
//      Boss 复制技能徽记（storage.rogue_copy），以及污染 / 虚无留在**玩家**身上的封牌与屏蔽器。
//      判据一律是「这个技能此刻还在不在身上」，不另记一份名单。

import { lib, game, get } from "../../../../noname.js";

import { COPY_MARK_SKILL } from "./data/skills.js";
import { ABYSS_MARK_SKILL, hasAffixHolder, releaseWuranLocks, releaseXuwuBlocks } from "./endless/abyssAffixes.js";
import { showSkillSacrifice } from "./ui/skillSacrifice.js";

/** 污染 / 虚无：作用落在别的角色身上的两条词缀，失去后要按「还有没有人带着」决定放不放开 */
const WURAN_AFFIX = "abyss_wuran";
const XUWU_AFFIX = "abyss_xuwu";

/**
 * 不许拿来做筹码的技能：肉鸽自己的载体与标记。
 * 其余内部技（缺翻译、unique / temp / sub / fixed / vanish）由本体 `lib.filter.skillDisabled` 挡掉，
 * 与本体「选择获得技能」的口径同一条；持恒技**不在**任何一份排除名单里——深渊强化正是要被夺走的那一类。
 */
const UNSELECTABLE_SKILLS = new Set([
	"rogue_stat",
	"rogue_curio",
	"rogue_copy",
	ABYSS_MARK_SKILL,
	"abyss_xuwu_blocker",
	"abyss_xuwu_release",
	"abyss_wuran_lock",
]);

/** 一名 Player 此刻身上（不含装备技能）的技能 id。剥离屏蔽/禁用：被按住或禁掉的技能本来就不算「拥有中」 */
function playerSkillIds(player) {
	if (!player || typeof player.getSkills !== "function") {
		return [];
	}
	const list = player.getSkills(null, false);
	return Array.isArray(list) ? list.filter(id => typeof id === "string" && id) : [];
}

/** 单条技能能不能选：本体口径 + 肉鸽载体黑名单 */
function isChoosableSkill(id) {
	if (typeof id !== "string" || !id || UNSELECTABLE_SKILLS.has(id)) {
		return false;
	}
	if (typeof lib.filter?.skillDisabled === "function") {
		return !lib.filter.skillDisabled(id);
	}
	const info = lib.skill[id];
	return !!info && !!lib.translate[id] && !info.unique && !info.temp && !info.sub && !info.fixed && !info.vanish;
}

/**
 * 这些技能是**别人带出来的伙伴**（`group` 展开的：本体 addSkill 前会走 game.expandSkills）。
 * 它们跟着主技能一起失去，自己不出独立条目——否则同一个「空城」会被算成两个筹码。
 * 注意：扩展发技能走的就是 battle.js 的 grantSkills（同一套 expandSkills），所以伙伴一定在主技能之后挂上。
 */
function groupPartnerIds(owned) {
	const partners = new Set();
	for (const id of owned) {
		const group = lib.skill[id]?.group;
		if (!group) {
			continue;
		}
		for (const partner of Array.isArray(group) ? group : [group]) {
			if (typeof partner === "string" && partner) {
				partners.add(partner);
			}
		}
	}
	return partners;
}

/**
 * 这名角色此刻可以失去哪些技能（敌方与己方同一套口径）。
 * 返回的每条都是「上层技能」：选中它 = 它连同自己的 group 伙伴一起失去。
 * @param {object} player 战斗中的 Player
 * @returns {string[]} 技能 id 列表（原样保留 getSkills 的顺序）
 */
export function listChoosableSkills(player) {
	const owned = playerSkillIds(player);
	const partners = groupPartnerIds(owned);
	const list = [];
	for (const id of owned) {
		if (partners.has(id) || !isChoosableSkill(id)) {
			continue;
		}
		list.push(id);
	}
	return list;
}

/** 主技能被摘时跟着走的伙伴（只摘真正在身上的那些） */
function removeWithPartners(player, id) {
	const group = lib.skill[id]?.group;
	player.removeSkill(id, true);
	for (const partner of Array.isArray(group) ? group : group ? [group] : []) {
		if (typeof partner === "string" && partner && playerSkillIds(player).includes(partner)) {
			player.removeSkill(partner, true);
		}
	}
}

/**
 * 列表里还留在身上的那些，顺带去重：同一条强化只算一件（存档清洗本来就该去重，
 * 这里再兜一道是为了「按实际生效的技能计数」这条纪律不依赖上游）。
 */
function keepOwnedUnique(stored, owned) {
	const kept = [];
	const seen = new Set();
	for (const id of stored) {
		if (!owned.has(id) || seen.has(id)) {
			continue;
		}
		seen.add(id);
		kept.push(id);
	}
	return kept;
}

/**
 * 把挂在别处的展示同步一遍：两条徽记（深渊 / 复制技能）的 id 列表按「此刻还在不在身上」过滤。
 * 列表空了就把徽记本体也摘掉——点开只剩「无深渊强化」的空徽记不如不收。
 * 徽记说明与面板数据都读这两处，所以这里改一次，界面自然同步，不存在第二份名单。
 */
function syncEnhanceMarks(player) {
	const owned = new Set(playerSkillIds(player));
	const info = player.rogueEnhanceInfo;
	const marks = [
		{ skill: ABYSS_MARK_SKILL, field: "abyss" },
		{ skill: COPY_MARK_SKILL, field: "copySkills" },
	];
	for (const { skill, field } of marks) {
		// 这个 Player 身上既没有这枚徽记、也没有它的列表 → 这条链与他无关，一个字节都不写
		// （玩家侧就没有深渊/复制两枚徽记，别顺手给他补一个空列表）
		if (!owned.has(skill) && !Array.isArray(player.storage?.[skill])) {
			continue;
		}
		const stored = Array.isArray(player.storage?.[skill]) ? player.storage[skill] : [];
		const kept = keepOwnedUnique(stored, owned);
		if (kept.length === stored.length && kept.length) {
			continue;
		}
		player.storage[skill] = kept;
		if (info && Array.isArray(info[field])) {
			info[field] = kept;
		}
		if (!kept.length && owned.has(skill)) {
			player.removeSkill(skill, true);
		}
	}
}

/**
 * 失去技能的统一入口：真正移除（含 group 伙伴）→ 同步两条徽记 → 刷新这个 Player。
 * @returns {string[]} 实际失去的技能 id（上层技能，不含跟着走的伙伴）
 */
export function loseSkillsForBattle(player, ids) {
	const removed = [];
	for (const id of Array.isArray(ids) ? ids : []) {
		if (!playerSkillIds(player).includes(id)) {
			continue;
		}
		removeWithPartners(player, id);
		removed.push(id);
	}
	if (removed.length) {
		syncEnhanceMarks(player);
		player.update?.();
	}
	return removed;
}

/**
 * 场上已经没人带着污染 / 虚无时，把这两条留在别处的持续状态放开。
 * 还有别的敌人带着同一条词缀时一动不动——那份状态是活的，放开等于替它免了效果。
 */
export function releaseLostAffixEffects() {
	if (!hasAffixHolder(WURAN_AFFIX)) {
		releaseWuranLocks();
	}
	if (!hasAffixHolder(XUWU_AFFIX)) {
		releaseXuwuBlocks();
	}
}

/**
 * 开局流程：先看两边有没有可失去的技能，再开选择界面，最后统一结算。
 * 任何一侧没有可选的技能就整件事跳过（不开界面、不报错），绝不拦住这一场战斗。
 * @param {object} me 玩家 Player
 * @param {object[]} enemies 敌方 Player 列表
 * @returns {Promise<{skipped?: string, cancelled?: boolean, mine?: string[], theirs?: {player: object, removed: string[]}[]}>}
 */
export async function runSkillSacrifice(me, enemies) {
	let mine;
	let targets;
	try {
		mine = listChoosableSkills(me);
		if (!mine.length) {
			return { skipped: "no-player-skills" };
		}
		targets = (Array.isArray(enemies) ? enemies : [])
			.filter(Boolean)
			.map(player => ({ player, skills: listChoosableSkills(player) }))
			.filter(target => target.skills.length);
		if (!targets.length) {
			return { skipped: "no-enemy-skills" };
		}
		const choice = await showSkillSacrifice({ me, mine, targets });
		if (!choice || choice.cancelled) {
			return { cancelled: true };
		}
		const result = { mine: [], theirs: [] };
		const lostMine = loseSkillsForBattle(me, choice.mine);
		result.mine = lostMine;
		for (const pick of choice.theirs) {
			result.theirs.push({ player: pick.player, removed: loseSkillsForBattle(pick.player, pick.ids) });
		}
		releaseLostAffixEffects();
		logLosses(me, result);
		return result;
	} catch (error) {
		// 这是「锦上添花」的一步：界面或结算出任何意外都不该把这一场战斗卡死在开局
		console.error("[rogue] 故人的心结算失败，按未发动继续：", error);
		return { error: `${error?.message ?? error}` };
	}
}

/** 战斗日志：失去了哪些技能（本体 removeSkill 自己不写日志，谁在用谁负责说清楚） */
function logLosses(me, result) {
	if (typeof game.log !== "function") {
		return;
	}
	const name = id => `【${get.translation(id)}】`;
	if (result.mine.length) {
		game.log(me, "失去了技能", ...result.mine.map(name));
	}
	for (const entry of result.theirs) {
		if (entry.removed.length) {
			game.log(entry.player, "失去了技能", ...entry.removed.map(name));
		}
	}
}
