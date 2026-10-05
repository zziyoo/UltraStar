// 战斗落地：全部用本体事件系统（prepareArena → init → gameDraw → phaseLoop），
// 不自建第二套回合系统。敌人与玩家的强化只作用在当前 Player 上，
// 绝不写 lib.character / lib.skill。

import { lib, game, _status } from "../../../../noname.js";
import { ROSTER_WHITE_LIST } from "./config.js";
import { sumStatEffects } from "./data/stats.js";
import { sumCurioEffects, CURIOSITY_BATTLE_KEYS, CURIOSITY_STORAGE_KEYS } from "./curioManager.js";
import { normalizeAbyssIds } from "./endless/abyss.js";
import { isEnemyUsable } from "./enemy.js";
import { showBattleCurios, showBattleStats, showEnemyAbyss, showEnemyEnhance } from "./ui/common.js";

export { isEnemyUsable };

const BASE_START_HAND = 4;
let rogueBattleEnemies = [];

export function clearBattleState() {
	rogueBattleEnemies = [];
}

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
 * 数值型强化（摸牌/手牌上限/伤害概率/出杀次数）统一由一个机制技能承载：
 * 四项数值一次性写进 player.storage.rogue_stat，只 addSkill 一次——
 * 玩家旁边因此只有一个「强化」标记，也不会因为重复调用而叠加。
 */
const STAT_BUFF_SKILL = "rogue_stat";
const STAT_BUFF_KEYS = ["extraDraw", "handLimit", "damageChance", "shaLimit"];
/** 深渊词缀的标记载体技能 id（词缀本体技能另由 endless/abyssAffixes.js 提供） */
const ABYSS_MARK_SKILL = "abyss_affix";
/** 奇物的战斗内效果载体技能 id（同名 storage 由 data/skills.js 的机制技读） */
const CURIO_SKILL = "rogue_curio";

/**
 * 把一枚徽记接成「点一下就打开强化面板」。
 * 与玩家那枚 rogue_stat 完全同一套做法：preventDefault 掐掉轻触后浏览器补发的合成 click，
 * stopImmediatePropagation 免得本体把这次点击当成选中角色（面板会被随后的本体逻辑盖掉）。
 */
function bindMarkTap(mark, open) {
	if (!mark || typeof mark.addEventListener !== "function") {
		return false;
	}
	const eventName = lib.config.touchscreen ? "touchend" : "click";
	mark.addEventListener(eventName, event => {
		event.preventDefault?.();
		event.stopImmediatePropagation?.();
		event.stopPropagation?.();
		open();
	}, true);
	return true;
}

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
function applyEffects(player, effects, showStatEntry = false) {
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
	if (hasStat || showStatEntry) {
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
 * 奇物的战斗内效果：curioManager.sumCurioEffects 按**当前品质**把全部奇物的 effect 叠成总表，
 * 一次写进 player.storage.rogue_curio，由机制技 rogue_curio 统一承载。品质判定全在 curioManager，
 * 这里与 reward.js 都不看 def.rarity。结算类效果（expRate/goldRate/goldOfHeld…）不在这里处理，
 * 由 reward.js 胜利结算时现查。与属性强化同一条纪律：绝不写 lib.skill。
 *
 * 写进去的是 `CURIOSITY_STORAGE_KEYS` 这张表（战斗内键 + 它们的配套键），**按表遍历而不是逐个键手写**：
 * 以前这里是六行硬编码，加一件新战斗内奇物就得记得回来补一行，漏了就是「技能挂上了但数值全是 0」——
 * 桩测里 storage 是测试自己塞的所以照绿，真机上表现为效果完全没生效。
 */
function applyCurioEffects(player, curioIds, qualityMap) {
	const effects = sumCurioEffects(curioIds, qualityMap);
	if (!CURIOSITY_BATTLE_KEYS.some(key => (effects[key] ?? 0) > 0)) {
		return false;
	}
	grantSkills(player, [CURIO_SKILL], "奇物技能未注册");
	const storage = {};
	for (const key of CURIOSITY_STORAGE_KEYS) {
		const value = effects[key];
		// 每一项都写（没给就写 0），storage 的形状因此稳定，机制技读哪个键都不会拿到 undefined；
		// 比例类不取整——0.5 要原样进去，由机制技去乘体力上限
		storage[key] = Number.isFinite(value)
			? (key.endsWith("Ratio") ? Math.max(0, value) : Math.max(0, Math.floor(value)))
			: 0;
	}
	player.storage.rogue_curio = storage;
	player.update();
	return true;
}

/**
 * 敌人自身的 Roguelike 强化：属性等级复用玩家的同一张效果表（data/stats.js），
 * 旧档迁移来的阵容可能还带 maxHp/hp 覆盖与额外技能，一并作用在该 Player 上；
 * 深渊词缀（abyss）按存档里已定死的 id 列表原样挂上，绝不在此处重掷。
 * 绝不写 lib.character / 全局技能。
 */
function applyEnemyModifiers(player, entry) {
	const effects = sumStatEffects(entry.stats);
	// rogue_stat 只在四项战斗键非零时才挂（hasStat），但防御给的护甲/体力上限不走那四个键——
	// 只看它们的话，「只有防御」的敌人就没有「强化」徽记，属性面板也就点不开了。
	// 所以这里按「面板上确实有东西可看」来决定要不要这个入口
	const hasAnyStat = STAT_BUFF_KEYS.some(key => (effects[key] ?? 0) > 0) || (effects.armor ?? 0) > 0 || (effects.maxHp ?? 0) > 0;
	applyEffects(player, effects, hasAnyStat);

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
	const abyss = applyAbyssAffixes(player, entry.abyss);
	// 战斗里点敌人标记要看的就是这两份数据：属性等级来自阵容，词缀 id 来自存档
	player.rogueEnhanceInfo = { stats: entry.stats, abyss };
	player.update();
}

/**
 * 深渊词缀落地：把存档里已定死的 id 列表逐个 addSkill，并挂一个纯标记载体 abyss_affix
 * （敌人身边只出现一个「深渊」徽记，点开看全部词缀，与玩家的单枚「强化」徽记同一套做法）。
 * @returns {string[]} 实际生效的词缀 id
 */
function applyAbyssAffixes(player, ids) {
	const list = normalizeAbyssIds(ids);
	if (!list.length) {
		return list;
	}
	grantSkills(player, list, "深渊强化不存在");
	player.storage[ABYSS_MARK_SKILL] = list;
	grantSkills(player, [ABYSS_MARK_SKILL], "深渊标记载体未注册");
	return list;
}

/**
 * 建局前置校验：run 里已定死的敌方阵容 + 玩家角色是否可用。
 * 单个敌人当前不可用就跳过它；全不可用才报错。返回可用阵容与缺失数，供上层给出明确提示。
 * options.allowBanned：把敌人的跳过判定放宽为「角色存在即可」，禁将（forbidai / 全局禁将 /
 * 本体判禁）不再拦——闯关前 10 关的关卡配置专用（定稿：配置池的角色即使被禁也照抽照打）；
 * 其余战斗路径不传本项，维持原来的 isEnemyUsable 口径。
 */
export function resolveBattle(run, enemies, options = {}) {
	if (!Array.isArray(enemies) || !enemies.length) {
		return { ok: false, error: "本关敌方阵容为空，请重新开始本关" };
	}
	if (!isPlayerUsable(run.characterId)) {
		return { ok: false, error: `角色「${run.characterId || "未选择"}」当前不可用，请重新选择角色` };
	}
	const allowBanned = options?.allowBanned === true;
	const usable = enemies.filter(entry => entry?.characterId && (allowBanned ? characterExists(entry.characterId) : isEnemyUsable(entry.characterId)));
	if (!usable.length) {
		return {
			ok: false,
			error: allowBanned
				? "敌方阵容里的角色在当前游戏中都不存在（配置可能被修改过），请重新开始本关"
				: "敌方阵容里没有当前可用的角色，请重新开始本关",
		};
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
	game.me.rogueStatRun = { openPanel: () => showBattleStats(run) };
	game.me.rogueCurioRun = { openPanel: () => showBattleCurios(run) };
	// 买来的技能在这里展开 group 伙伴；存档与技能槽统计始终只看 run.skills 本身
	grantSkills(game.me, run.skills, "存档里的技能未注册");
	const bonuses = sumStatEffects(run.stats);
	applyEffects(game.me, bonuses, true);
	applyCurioEffects(game.me, run.curios, run.curioQuality);
	bindMarkTap(game.me.marks?.[STAT_BUFF_SKILL], () => game.me.rogueStatRun.openPanel());
	bindMarkTap(game.me.marks?.[CURIO_SKILL], () => game.me.rogueCurioRun.openPanel());
	game.zhu = game.me;
	markSides(game.me, game.players.slice(1));

	for (let i = 0; i < enemies.length; i++) {
		const player = game.players[i + 1];
		if (!player) {
			continue;
		}
		player.init(enemies[i].characterId);
		applyEnemyModifiers(player, enemies[i]);
		// 徽记是在 applyEnemyModifiers 里 addSkill 时才建出来的，所以绑定必须排在它后面。
		// 两枚徽记各开各的面板：属性归属性、深渊归深渊
		bindMarkTap(player.marks?.[STAT_BUFF_SKILL], () => showEnemyEnhance(player));
		bindMarkTap(player.marks?.[ABYSS_MARK_SKILL], () => showEnemyAbyss(player));
	}
	rogueBattleEnemies = game.players.slice(1, 1 + enemies.length).filter(Boolean);
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
	if (!game.me.isAlive()) {
		clearBattleState();
		delete game.me.rogueStatRun;
		delete game.me.rogueCurioRun;
		game.over(false);
		return;
	}
	if (rogueBattleEnemies.length && rogueBattleEnemies.every(player => !player.isAlive())) {
		clearBattleState();
		delete game.me.rogueStatRun;
		delete game.me.rogueCurioRun;
		game.over(true);
	}
}
