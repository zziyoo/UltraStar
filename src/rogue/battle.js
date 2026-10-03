// 战斗落地：全部用本体事件系统（prepareArena → init → gameDraw → phaseLoop），
// 不自建第二套回合系统。敌人与玩家的强化只作用在当前 Player 上，
// 绝不写 lib.character / lib.skill。

import { lib, game, _status } from "../../../../noname.js";
import { ROSTER_WHITE_LIST } from "./config.js";
import { sumStatEffects } from "./data/stats.js";
import { isEnemyUsable } from "./enemy.js";

export { isEnemyUsable };

const BASE_START_HAND = 4;

function characterExists(id) {
	return typeof id === "string" && !!id && !!lib.character[id];
}

/** 玩家侧能否用这个角色：选将页与商店候选池（skillPool.js）共用同一套判断 */
export function isPlayerUsable(id) {
	if (!characterExists(id)) {
		return false;
	}
	const info = lib.character[id];
	if (info.isBoss === true || info.isHiddenBoss === true) {
		return false;
	}
	if (typeof lib.filter?.characterDisabled2 === "function") {
		try {
			if (lib.filter.characterDisabled2(id)) {
				return false;
			}
		} catch (error) {
			console.error("[rogue] 角色过滤失败，按可选处理：", id, error);
		}
	}
	return true;
}

/** 玩家可选角色：白名单优先，否则按通用规则从 lib.character 里筛 */
export function getRoster() {
	const source = Array.isArray(ROSTER_WHITE_LIST) && ROSTER_WHITE_LIST.length
		? ROSTER_WHITE_LIST
		: Object.keys(lib.character);
	const list = [];
	for (const id of source) {
		if (isPlayerUsable(id) && !list.includes(id)) {
			list.push(id);
		}
	}
	return list;
}

/**
 * 数值型强化（摸牌/手牌上限/杀伤害/出杀次数）统一由一个机制技能承载：
 * 四项数值一次性写进 player.storage.rogue_stat，只 addSkill 一次——
 * 玩家旁边因此只有一个「强化」标记，也不会因为重复调用而叠加。
 */
const STAT_BUFF_SKILL = "rogue_stat";
const STAT_BUFF_KEYS = ["extraDraw", "handLimit", "shaDamage", "shaLimit"];

/**
 * 运行时给一个 Player 发技能：先过本体 `game.expandSkills` 把 `group` 伙伴补齐再挂上。
 * 本体角色正常初始化走的就是同一条（`player.js:13210` 的 `game.expandSkills(lib.character[name][3].slice(0))`），
 * 而 `player.addSkill` 自己不会带出 `group` 伙伴（本体的 `group` 只在 `disableSkill` 里被读一次），
 * 所以少了这一步，买到的带 group 技能就只剩主技能那半边。
 * expandSkills 是「原地去重追加同一个数组」（`Array.prototype.add` 自带 includes 判断），
 * 只展开一层、group 写字符串或数组都吃，这里不自己重写一遍 group 解析。
 * 展开出来的伙伴技能只活在当前 Player 上：不写回 run.skills / 敌人配置 / 属性表，也就一个都不占肉鸽技能槽。
 * @param {object} player 目标 Player
 * @param {string[]} skillIds 调用方给的技能 id（来自存档、敌人配置或属性表）
 * @param {string} missingLabel 未注册 id 的警告文案前缀，保持原来的三种提示不变
 * @returns {string[]} 实际挂上去的技能 id（含 group 展开部分）
 */
export function grantSkills(player, skillIds, missingLabel) {
	const list = [];
	for (const id of Array.isArray(skillIds) ? skillIds : []) {
		if (typeof id !== "string" || !id) {
			continue;
		}
		if (!lib.skill[id]) {
			console.warn(`[rogue] ${missingLabel}：${id}`);
			continue;
		}
		if (!list.includes(id)) {
			list.push(id);
		}
	}
	if (!list.length) {
		return list;
	}
	for (const id of game.expandSkills(list)) {
		player.addSkill(id);
	}
	return list;
}

/** 把属性表算出的效果施加到具体 Player 上 */
function applyEffects(player, effects) {
	if (effects.maxHp) {
		player.maxHp += effects.maxHp;
		if (effects.maxHp > 0) {
			player.hp += effects.maxHp;
		} else if (player.hp > player.maxHp) {
			player.hp = player.maxHp;
		}
	}
	if (effects.armor) {
		player.hujia = (player.hujia || 0) + effects.armor;
	}
	grantSkills(player, effects.extraSkills, "属性效果引用的技能不存在");
	const statStorage = {};
	let hasStat = false;
	for (const key of STAT_BUFF_KEYS) {
		const value = Math.floor(effects[key] ?? 0);
		statStorage[key] = value > 0 ? value : 0;
		if (value > 0) {
			hasStat = true;
		}
	}
	if (hasStat) {
		if (lib.skill[STAT_BUFF_SKILL]) {
			// 赋值而不是累加：同一场战斗里重复调用也只保留这一份最终结果
			player.storage[STAT_BUFF_SKILL] = statStorage;
			player.addSkill(STAT_BUFF_SKILL);
		} else {
			console.warn(`[rogue] 属性强化技能未注册：${STAT_BUFF_SKILL}`);
		}
	}
	player.update();
}

/**
 * 敌人自身的 Roguelike 强化：属性等级复用玩家的同一张效果表（data/stats.js），
 * 旧档迁移来的阵容可能还带 maxHp/hp 覆盖与额外技能，一并作用在该 Player 上。
 * 绝不写 lib.character / 全局技能。
 */
function applyEnemyModifiers(player, entry) {
	applyEffects(player, sumStatEffects(entry.stats));

	const deltaMaxHp = Number.isFinite(entry.maxHp) ? Math.floor(entry.maxHp) : 0;
	if (deltaMaxHp) {
		player.maxHp += deltaMaxHp;
		if (deltaMaxHp > 0) {
			player.hp += deltaMaxHp;
		}
	}
	const fixedHp = Number.isFinite(entry.hp) ? Math.floor(entry.hp) : 0;
	if (fixedHp > 0) {
		player.hp = Math.min(fixedHp, player.maxHp);
	}

	grantSkills(player, entry.skills, "敌人额外技能不存在");
	player.update();
}

/**
 * 建局前置校验：run 里已定死的敌方阵容 + 玩家角色是否可用。
 * 单个敌人当前不可用就跳过它；全不可用才报错。返回可用阵容与缺失数，供上层给出明确提示。
 */
export function resolveBattle(run, enemies) {
	if (!Array.isArray(enemies) || !enemies.length) {
		return { ok: false, error: "本关敌方阵容为空，请重新开始本关" };
	}
	if (!isPlayerUsable(run.characterId)) {
		return { ok: false, error: `角色「${run.characterId || "未选择"}」当前不可用，请重新选择角色` };
	}
	const usable = enemies.filter(entry => entry?.characterId && isEnemyUsable(entry.characterId));
	if (!usable.length) {
		return { ok: false, error: "敌方阵容里没有当前可用的角色，请重新开始本关" };
	}
	return { ok: true, enemies: usable, missing: enemies.length - usable.length };
}

/**
 * 正式开一局。调用方（mode.js）负责在这之前把 currentBattle（含敌方阵容）写进存档，
 * 因此中途刷新/崩溃也不会重掷敌人。
 * @param {object} event 承载本局的 GameEvent
 */
export async function beginBattle(event, run, enemies) {
	game.prepareArena(1 + enemies.length);

	// prepareArena 走的 ui.create.players 不会分配 playerid，而本体 addSkill 里
	// 只有 playerid 存在才会把技能写进 lib.hook / lib.hookmap（player.js:11088），
	// 缺了它所有触发类技能都不会触发。
	assignPlayerIds();
	game.me.init(run.characterId);
	// 买来的技能在这里展开 group 伙伴；存档与技能槽统计始终只看 run.skills 本身
	grantSkills(game.me, run.skills, "存档里的技能未注册");
	const bonuses = sumStatEffects(run.stats);
	applyEffects(game.me, bonuses);
	game.zhu = game.me;
	markSides(game.me, game.players.slice(1));

	for (let i = 0; i < enemies.length; i++) {
		const player = game.players[i + 1];
		if (!player) {
			continue;
		}
		player.init(enemies[i].characterId);
		applyEnemyModifiers(player, enemies[i]);
	}
	game.me.update();

	const startHand = BASE_START_HAND + bonuses.startHand;
	// 与身份模式一致：先 gameStart，再起手牌，最后进回合循环
	await event.trigger("gameStart");
	game.gameDraw(game.me, player => (player === game.me ? startHand : BASE_START_HAND));
	game.phaseLoop(game.me);
	return { enemies: enemies.length };
}

export const SIDE_PLAYER = 0;
export const SIDE_ENEMY = 1;

/**
 * 阵营必须记在 Player 对象上，而不是比较对象身份。
 * 本体五个模式都是这么做的（versus 比较 `from.side == to.side`、identity 比较 identity、chess 比较 side）：
 * 身份比较在跨域/克隆出来的 player 副本上会失效，一旦失效所有人都会被判成同一阵营，
 * 所有「找敌人」的技能（get.attitude(...) < 0）就都找不到目标、无法发动。
 */
export function markSides(me, enemies) {
	if (me) {
		me.rogueSide = SIDE_PLAYER;
	}
	for (const enemy of enemies) {
		enemy.rogueSide = SIDE_ENEMY;
	}
}

export function sideOf(player) {
	if (player?.rogueSide === SIDE_PLAYER || player?.rogueSide === SIDE_ENEMY) {
		return player.rogueSide;
	}
	// 兜底：中途加入的玩家没有标记时按是否本人判断
	return game.me && player === game.me ? SIDE_PLAYER : SIDE_ENEMY;
}

/**
 * 阵营态度：玩家一方为友、其余为敌。量级参照 versus（自己 7、同阵营 6、敌对 -6）。
 * 本体 get.attitude 会无条件调用 get.rawAttitude（get/index.js:6251），
 * 五个本体模式全都提供它——缺了会在 AI 评估出牌目标时直接抛错。
 */
export function rawAttitude(from, to) {
	if (!from || !to) {
		return 0;
	}
	if (from === to) {
		return 7;
	}
	return sideOf(from) === sideOf(to) ? 6 : -6;
}

/** 给场上每个座位分配 playerid——触发类技能登记钩子的前提 */
export function assignPlayerIds() {
	for (const player of game.players) {
		if (player && !player.playerid && typeof player.getId === "function") {
			player.getId();
		}
	}
}

/** 胜负只认「玩家死 / 所有敌人死」，不依赖身份 */
export function checkResult() {
	if (_status.over || !game.me) {
		return;
	}
	// 死亡者会从 game.players 移入 game.dead，两侧都要看，否则全灭时反而判不出胜利
	const foes = game.players.concat(game.dead).filter(player => player !== game.me);
	if (!game.me.isAlive()) {
		game.over(false);
		return;
	}
	if (foes.length && foes.every(player => !player.isAlive())) {
		game.over(true);
	}
}
