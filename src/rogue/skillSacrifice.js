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
 * 其余判据见 `isChoosableSkill`——**刻意不照搬技能商店的 `lib.filter.skillDisabled`**：
 * 那条口径是「选择**获得**技能」（unique / vanish / temp 一律不可选，因为左慈化身之类的获取手段不能拿），
 * 而这里是「失去**已经拥有**的技能」。本体真正做这件事的四个技能（迎乡 clanyingxiang / 恤民 clanxumin /
 * 合韵 potheyun / 脱难 yjtuonan）用的都是 `getSkills(null, false, false)` + 只剔 `charlotte` 与空文案，
 * 所以限定技（shenfen）、觉醒技（drlt_hongju）、`unique` 技、一次性技全都照常可选。
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

/** 技能在界面上读得出名字与描述吗（本体那四个技能用的是同一条判据：文案为空的内部技不给选） */
function hasReadableText(id) {
	const full = lib.translate[id];
	if (typeof full !== "string" || !full.trim()) {
		return false;
	}
	const desc = full.split("<hr>")[1] || lib.translate[`${id}_info`] || "";
	return !!`${desc}`.trim();
}

/**
 * 单条技能能不能选。
 * 保护的是「内部」与「摘不掉」这两类，不是「本体认为不能获得」：
 *   · 无定义 / 没文案：内部技（玩家在界面上一眼看不出它会失去什么）；
 *   · `charlotte`（本体自己的内部痕记，如 tianxiang2、各 `${主}_used`）/ `superCharlotte`：系统载体；
 *   · `fixed`：固有技，本体 `removeSkill` 自己就拒摘（这是唯一一处硬拦截）；
 *   · 肉鸽载体黑名单：上面那张表。
 * 相反地，`unique`、`vanish`、`temp`、`persevereSkill`、锁定技/限定技/觉醒技**都放行**——
 * 它们要么是玩家正常拥有的技能，要么正是要被夺走的那一类（深渊强化的持恒技）。
 */
function isChoosableSkill(id) {
	if (typeof id !== "string" || !id || UNSELECTABLE_SKILLS.has(id)) {
		return false;
	}
	const info = lib.skill[id];
	if (!info || info.charlotte || info.superCharlotte || info.fixed) {
		return false;
	}
	return hasReadableText(id);
}

/**
 * 这些技能带出来的跟随件（都必须在身上才算）：`group` 伙伴，以及 `subSkill` 子技能
 * （本体注册成 `${主}_${子}` 并打上 `sub: true` + `sourceSkill: 父技能`）。
 * 列表用它把跟随件折进主技能，摘除用它找出该跟着走的那几件——两边同一份判据，
 * 所以「折进列表的」和「跟着一起失去的」永远是同一批：只摘主技能会留下还在响的子技能，
 * 那正是「已经失去了但效果还在」。
 */
function dependentsOf(player, ids) {
	const owned = new Set(playerSkillIds(player));
	const dependents = new Set();
	for (const id of Array.isArray(ids) ? ids : []) {
		const info = lib.skill[id];
		if (!info) {
			continue;
		}
		for (const partner of Array.isArray(info.group) ? info.group : info.group ? [info.group] : []) {
			if (typeof partner === "string" && partner && partner !== id && owned.has(partner)) {
				dependents.add(partner);
			}
		}
		for (const other of owned) {
			if (other !== id && lib.skill[other]?.sourceSkill === id) {
				dependents.add(other);
			}
		}
	}
	return dependents;
}

/**
 * 一名「跟随件」此刻还被别的已拥有技能依赖吗：别的技能把它写进 `group`，
 * 或者把它当 `sourceSkill` 父技能。还有人在用就不能跟着走。
 */
function isStillNeeded(player, id) {
	for (const other of playerSkillIds(player)) {
		if (other === id) {
			continue;
		}
		const info = lib.skill[other];
		if (!info) {
			continue;
		}
		if (info.sourceSkill === id) {
			return true;
		}
		const group = Array.isArray(info.group) ? info.group : info.group ? [info.group] : [];
		if (group.includes(id)) {
			return true;
		}
	}
	return false;
}

/**
 * 这名角色此刻可以失去哪些技能（敌方与己方同一套口径）。
 * 返回的每条都是「上层技能」：选中它 = 它连同自己的 group 伙伴 / 子技能一起失去。
 * @param {object} player 战斗中的 Player
 * @returns {string[]} 技能 id 列表（原样保留 getSkills 的顺序）
 */
export function listChoosableSkills(player) {
	const owned = playerSkillIds(player);
	const dependents = dependentsOf(player, owned);
	const list = [];
	for (const id of owned) {
		// 子技能（`sub`）永远不出独立条目：它只是父技能在跑的那半边
		if (dependents.has(id) || lib.skill[id]?.sub || !isChoosableSkill(id)) {
			continue;
		}
		list.push(id);
	}
	return list;
}

/**
 * 摘掉一个上层技能，以及**该跟着走的**那些跟随件。
 * 跟随件被别的已拥有技能依赖时原地留下（共享伙伴：两个主技能声明同一个 group 成员）——
 * 少清一件共享件只是留点残留，误摘却会把别人还在用的那半边一起打掉。
 */
function removeWithDependents(player, id) {
	const dependents = [...dependentsOf(player, [id])].filter(dependent => dependent !== id);
	player.removeSkill(id, true);
	for (const dependent of dependents) {
		if (!playerSkillIds(player).includes(dependent) || isStillNeeded(player, dependent)) {
			continue;
		}
		player.removeSkill(dependent, true);
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
 * 失去技能的统一入口：真正移除（含该跟着走的跟随件）→ 同步两条徽记 → 刷新这个 Player。
 * **单个技能出意外不连累其余的**：本体的 removeSkill 会调技能自己的 onremove，
 * 别人的 onremove 抛错不该把这一批剩下的技能一起吞掉（那才会造成「两边数量对不上」）。
 * @returns {string[]} 实际失去的技能 id（上层技能，不含跟着走的跟随件）
 */
export function loseSkillsForBattle(player, ids) {
	const removed = [];
	for (const id of Array.isArray(ids) ? ids : []) {
		if (!playerSkillIds(player).includes(id)) {
			continue;
		}
		try {
			removeWithDependents(player, id);
			removed.push(id);
		} catch (error) {
			console.error(`[rogue] 失去技能失败（${id}），继续结算其余技能：`, error);
			// 本体的 removeSkill 是「先从技能表摘掉、再走触发清理与 onremove」，所以抛错也可能是
			// 「已经摘掉了、只是收尾没跑完」：按技能表此刻的真实情况记账，两边的数量才对得上
			if (!playerSkillIds(player).includes(id)) {
				removed.push(id);
			}
		}
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
 * 结算：把界面上谈好的这一笔账落到双方身上，**与界面分开导出**（不需要 DOM，可以单测）。
 * 数量纪律：敌方的总失去数按**己方实际失去数**发放（`quota`）——
 * 玩家选中的技能若在这一刻已经不在了（被别处先摘掉），就用那名角色**此刻还能失去的**技能按名单顺序顶替，
 * 尽量让两边真失去的数量相等；绝不反过来动玩家没选的技能。
 * @param {object} me 玩家 Player
 * @param {{mine: string[], theirs: {player: object, ids: string[]}[]}} choice 界面给出的选择（两侧数量已相等）
 * @returns {{mine: string[], theirs: {player: object, removed: string[]}[]}} 双方**实际**失去的技能
 */
export function settleSkillSacrifice(me, choice) {
	const mine = loseSkillsForBattle(me, choice?.mine);
	let quota = mine.length;
	const theirs = [];
	for (const pick of Array.isArray(choice?.theirs) ? choice.theirs : []) {
		if (quota <= 0) {
			break;
		}
		const picked = pick.ids.slice(0, quota);
		const removed = loseSkillsForBattle(pick.player, picked);
		quota -= removed.length;
		const short = picked.length - removed.length;
		if (short > 0) {
			// 顶替只从「这名角色还剩的筹码」里挑，不碰它已经没被选中的那些
			const backups = listChoosableSkills(pick.player).filter(id => !removed.includes(id)).slice(0, short);
			const extra = loseSkillsForBattle(pick.player, backups);
			removed.push(...extra);
			quota -= extra.length;
		}
		if (removed.length) {
			theirs.push({ player: pick.player, removed });
		}
	}
	return { mine, theirs };
}

/**
 * 开局流程：先看两边有没有可失去的技能，再开选择界面，最后统一结算。
 * 任何一侧没有可选的技能就整件事跳过（不开界面、不报错），绝不拦住这一场战斗。
 * **界面与结算的错误分开处理**：选完之后的结算里玩家可能已经失去了技能，
 * 那时绝不能因为后面出意外就报成「未发动」——实际失去什么就报什么。
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
	} catch (error) {
		// 还没有动过任何 Player：报错就是没发动，这一场照常开打
		console.error("[rogue] 故人的心：枚举可失去技能失败，按未发动继续：", error);
		return { error: `${error?.message ?? error}` };
	}
	const choice = await showSkillSacrifice({ me, mine, targets });
	if (!choice || choice.cancelled) {
		return { cancelled: true };
	}
	// 界面之后才开始动 Player；从这里起无论出什么意外都要如实回报实际失去的技能
	const result = settleSkillSacrifice(me, choice);
	try {
		releaseLostAffixEffects();
		logLosses(me, result);
	} catch (error) {
		console.error("[rogue] 故人的心：失去技能之后的收尾失败（技能已失去）：", error);
	}
	return result;
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
