// 深渊化强化：第一版词缀池的十个持恒技本体。
//
// 每个强化就是一个独立注册的 lib 技能（id 以 abyss_ 开头），敌人身上 addSkill 即生效：
//   · 名称与描述走 lib.translate 的双键格式（id = 技能名 / id_info = 描述），
//     所以本体自己的角色信息区就能列出它们，不必再造一遍；
//   · abyss_affix 是纯粹的标记载体（不发效果），负责在敌人身边挂一个「深渊」徽记，
//     与玩家的「强化」徽记同一套做法；徽记说明从 player.storage.abyss_affix 里的词缀 id 现查文案。
//
// 引擎契约（都读过源码核对，改动前请先确认）：
//   · filter(event, player, triggername) 的 event 是**基事件**（damage / gain / useCard…）；
//     content(event, trigger, player) 的 event 是**技能自己的事件**，它的 player 就是持有者，
//     基事件在第二个参数 trigger 上——所以「谁摸的牌、谁造成的伤害」一律读 trigger，
//     读 event.player 只会拿到持有者自己。
//   · 判时机只能用 event.triggername：trigger.name 只会是 damage / dying / gain 之类，永远不等于时机名；
//   · lib.skill 没有 damage 这个 mod（改伤害只能挂 damageBegin1~4）；防止伤害用 trigger.cancel()，
//     把 num 写成 0 只会走 damageZero 分支、仍然算「受到过伤害」；
//   · 改数值的时机都要过 !event.numFixed（固定伤害不参与）；
//   · content 必须写成 async：本体的 ContentCompiler 对**同步**函数走 StepCompiler，
//     会把源码反编译成只注入 _status/lib/game/ui/get/ai 的新函数，本模块的辅助函数全部丢失；
//     async 函数走 AsyncCompiler→ArrayCompiler，直接 Reflect.apply 原函数，闭包保留。
//   · player.disableSkill(登记名, 被禁技能id)——**第二个**参数才是被禁掉的技能，
//     第一个只是「谁禁的」标签；enableSkill(标签) 按标签解除（本体是引用计数）；
//   · 伤害事件上没有 sourceSkill，技能伤害要靠父链找「事件名是已注册技能、且持有者就是伤害来源」的祖先；
//   · 判定牌颜色读 result.color（"black" / "red" / "none"），必须 await 完再读才吃得到改判；
//   · roundEnd / roundStart 是全局时机，只能写在 trigger.global 里，挂在 player 上永远不会响。

import { lib, game, get } from "../../../../../noname.js";

import { ABYSS_MARK_TEXT, ABYSS_POLLUTION_CARD_TYPE } from "./abyssConfig.js";

/** 玩家一方：battle.js 的 markSides 把阵营记在 Player.rogueSide 上（0=玩家 1=敌人） */
const SIDE_PLAYER = 0;

const FULL_PHASE_LIST = ["phaseZhunbei", "phaseJudge", "phaseDraw", "phaseUse", "phaseDiscard", "phaseJieshu"];

/** 词缀文案：翻译表与本模块回落值的唯一来源（lib.translate 注册后优先读注册结果） */
export const affixText = {
	abyss_buqu: { name: "深渊·不屈", desc: "本局游戏首次进入濒死状态时，回复体力至上限，且本回合受到伤害时防止之。" },
	abyss_jianbi: { name: "深渊·坚壁", desc: "受到的伤害-1。" },
	abyss_jinyu: { name: "深渊·禁欲", desc: "玩家于摸牌阶段外获得牌后，随机弃置一张牌。" },
	abyss_kuangre: { name: "深渊·狂热", desc: "每轮开始时进行一次判定，若判定结果为黑色，立即执行一个额外的回合。" },
	abyss_liesha: { name: "深渊·猎杀", desc: "攻击范围无限，造成的伤害+1。" },
	abyss_xuwu: { name: "深渊·虚无", desc: "第一次受到技能造成的伤害时，本轮伤害来源的此技能失效。" },
	abyss_jingxiang: { name: "深渊·镜像", desc: "受到有实体牌造成的伤害后，对伤害来源造成1点伤害。" },
	abyss_wuran: { name: "深渊·污染", desc: "玩家使用牌后，随机将一张手牌替换为牌堆或弃牌堆中的一张基本牌。" },
	abyss_yongheng: { name: "深渊·永恒", desc: "每轮开始时，恢复体力至上限。" },
	abyss_fuchou: { name: "深渊·复仇", desc: "受到伤害后，本局游戏造成的伤害+1。" },
};

function isPlayerSide(player) {
	return !!player && player.rogueSide === SIDE_PLAYER;
}

/** 沿父链取当前回合（phase 事件）；找不到返回 null，不采用本体「找不到给空对象」的默认返回值 */
function phaseOf(event) {
	const found = event.getParent("phase");
	return found && found.name === "phase" ? found : null;
}

/** 是否「有实体牌造成的伤害」：牌本身是实体牌，或由实体牌转化/视为而来（纯虚拟牌没有底层牌） */
function hasPhysicalCard(card) {
	if (!card) {
		return false;
	}
	if (get.itemtype(card) === "card") {
		return true;
	}
	return Array.isArray(card.cards) && card.cards.some(item => get.itemtype(item) === "card");
}

/**
 * 找这次伤害的来源技能：沿父链找「事件名是已注册技能、且技能持有者就是伤害来源」的最近祖先。
 * 触发技的 content 一定跑在 game.createEvent(技能id) 里，所以技能伤害的父链上必有以技能 id 命名的环节。
 * 返回空串表示这不是技能伤害（实体牌结算、流失体力等）。
 */
function damageSourceSkill(damageEvent) {
	if (!damageEvent.source || hasPhysicalCard(damageEvent.card)) {
		return "";
	}
	const ancestor = damageEvent.getParent(item => !!lib.skill[item.name] && item.player === damageEvent.source);
	return ancestor ? ancestor.name : "";
}

/** 「随机弃置一张牌」的候选：手牌 + 装备区 + 判定区（本体口径下的「牌」含装备与判定） */
function collectDiscardable(player) {
	return player.getCards("h").concat(player.getEquips(), player.getCards("j"));
}

function pickRandom(list) {
	return list[Math.floor(Math.random() * list.length) % list.length];
}

/** 深渊·污染要的牌：牌堆优先，牌堆里没有再看弃牌堆 */
function findPollutionCard() {
	const match = card => get.type(card) === ABYSS_POLLUTION_CARD_TYPE;
	return get.cardPile(match, "cardPile", "random") || get.cardPile(match, "discardPile", "random");
}

/** 深渊·虚无的解除：按登记名放开这一位持有者封掉的所有技能 */
function restoreXuwu(player) {
	const list = player.abyssXuwu ?? [];
	if (!list.length) {
		return;
	}
	for (const item of list) {
		item.source.enableSkill(item.tag);
	}
	player.abyssXuwu = [];
}

// ---------------------------------------------------------------- 十个词缀

export const affix = {
	// 1. 深渊·不屈：本局首次濒死时回复至上限，并且「那个回合」内防止伤害。
	//    回合归属直接拿 phase 事件对象本身来比——同一个 phase 事件才是同一个回合，不必再挂临时技；
	//    回合一走两者自然不再相等，护盾自己失效（挡住的是本回合的每一道伤害，不只挡一发）。
	abyss_buqu: {
		trigger: { player: ["dying", "damageBegin4"] },
		forced: true,
		popup: false,
		nopop: true,
		filter(event, player, triggername) {
			if (triggername === "dying") {
				return !player.storage.abyss_buqu_used;
			}
			if (triggername === "damageBegin4") {
				const phase = phaseOf(event);
				return !!phase && player.abyssBuquPhase === phase;
			}
			return false;
		},
		async content(event, trigger, player) {
			if (event.triggername === "dying") {
				player.storage.abyss_buqu_used = true;
				player.abyssBuquPhase = phaseOf(trigger);
				game.log(player, "深处的执念托住了躯壳：体力回复至上限，且本回合不会受到伤害");
				await player.recoverTo(player.maxHp);
				return;
			}
			game.log(player, "的伤害被深渊吞掉了");
			trigger.cancel();
		},
	},
	// 2. 深渊·坚壁：受到的伤害-1。挂在 damageBegin4（所有加伤算完之后的最后一档），
	//    减的是最终值；只减不封，所以对方仍然「造成过伤害」。
	abyss_jianbi: {
		trigger: { player: "damageBegin4" },
		forced: true,
		popup: false,
		nopop: true,
		filter(event, player, triggername) {
			return triggername === "damageBegin4" && !event.numFixed && event.num > 0;
		},
		async content(event, trigger) {
			trigger.num -= Math.min(trigger.num, 1);
		},
	},
	// 3. 深渊·禁欲：玩家方在摸牌阶段外获得牌后，随机弃置其一张牌。
	abyss_jinyu: {
		trigger: { global: "gainEnd" },
		forced: true,
		popup: false,
		nopop: true,
		filter(event, player) {
			const victim = event.player;
			if (!victim || victim === player || !isPlayerSide(victim) || !victim.isAlive()) {
				return false;
			}
			// 摸牌阶段内获得的牌不罚：本体判阶段归属的现成写法是沿父链找 phaseDraw
			if (event.getParent("phaseDraw").name === "phaseDraw") {
				return false;
			}
			return collectDiscardable(victim).length > 0;
		},
		async content(event, trigger, player) {
			const victim = trigger.player;
			const pool = collectDiscardable(victim);
			if (!pool.length) {
				return;
			}
			game.log(player, "窥见了贪得，令", victim, "弃置一张牌");
			await victim.discard(pickRandom(pool));
		},
	},
	// 4. 深渊·狂热：每轮开始时判定，黑色则执行一个额外的回合。
	//    额外回合用 player.insertPhase()（本体放权同款），并清掉翻面跳过；
	//    一轮只判一次——拿 game.roundNumber 记账，否则额外回合自己若被认成新一轮就会无限连锁。
	abyss_kuangre: {
		trigger: { global: "roundStart" },
		forced: true,
		popup: false,
		nopop: true,
		filter(event, player) {
			return player.isAlive() && player.storage.abyss_kuangre_round !== game.roundNumber;
		},
		async content(event, trigger, player) {
			player.storage.abyss_kuangre_round = game.roundNumber;
			const result = await player.judge("abyss_kuangre", () => 0).forResult();
			if (!result || result.color !== "black") {
				return;
			}
			game.log(player, "的狂热之血沸腾，额外执行一个回合");
			const next = player.insertPhase("abyss_kuangre");
			next._noTurnOver = true;
			next.phaseList = FULL_PHASE_LIST.slice(0);
		},
	},
	// 5. 深渊·猎杀：攻击范围无限 + 造成的伤害+1（不限来源牌，技能伤害也算）。
	abyss_liesha: {
		trigger: { source: "damageBegin1" },
		mod: {
			attackRange() {
				return Infinity;
			},
		},
		forced: true,
		popup: false,
		nopop: true,
		filter(event, player, triggername) {
			return triggername === "damageBegin1" && !event.numFixed;
		},
		async content(event, trigger) {
			trigger.num += 1;
		},
	},
	// 6. 深渊·虚无：第一次受到某个技能造成的伤害时，本轮内那个技能对来源失效（轮结束恢复）。
	//    同一个技能本局只封一次。封印记录放在 Player 的普通属性上而不是 storage——
	//    里面要存 Player 引用，而 storage 在本体里是要 JSON 广播出去的。
	abyss_xuwu: {
		trigger: { player: "damageBegin4", global: "roundEnd" },
		forced: true,
		popup: false,
		nopop: true,
		filter(event, player, triggername) {
			if (triggername === "roundEnd") {
				return (player.abyssXuwu ?? []).length > 0;
			}
			const skillId = damageSourceSkill(event);
			return !!skillId && !(player.abyssXuwuUsed ?? []).includes(skillId);
		},
		async content(event, trigger, player) {
			if (event.triggername === "roundEnd") {
				restoreXuwu(player);
				return;
			}
			const skillId = damageSourceSkill(trigger);
			const source = trigger.source;
			if (!skillId || !source) {
				return;
			}
			// 登记名带上持有者座位：多个敌人都带虚无时，各自的封印互不顶掉
			const tag = `abyss_xuwu_${player.playerid ?? ""}`;
			source.disableSkill(tag, skillId);
			player.abyssXuwuUsed = (player.abyssXuwuUsed ?? []).concat(skillId);
			player.abyssXuwu = (player.abyssXuwu ?? []).concat({ source, tag });
			game.log(player, "吞下了", source, "的〖" + get.translation(skillId) + "〗（本轮内失效）");
		},
		// 持有者阵亡后 roundEnd 那次触发不会再跑到，这里兜底放开，免得别的角色被永久缴械
		onremove(player) {
			restoreXuwu(player);
		},
	},
	// 7. 深渊·镜像：受到有实体牌造成的伤害后，对伤害来源造成1点伤害。
	abyss_jingxiang: {
		trigger: { player: "damageEnd" },
		forced: true,
		popup: false,
		nopop: true,
		filter(event, player) {
			return event.num > 0
				&& hasPhysicalCard(event.card)
				&& !!event.source
				&& event.source !== player
				&& event.source.isAlive();
		},
		async content(event, trigger, player) {
			const source = trigger.source;
			game.log(player, "的深渊之镜映出了", source, "的身影");
			// 反伤不带牌，因此不会再触发自己的 filter；来源写成持有者，伤害能正常计账
			await source.damage(1, player);
		},
	},
	// 8. 深渊·污染：玩家使用牌后，随机把其一张手牌换成牌堆（或弃牌堆）里的一张基本牌。
	abyss_wuran: {
		trigger: { global: "useCardAfter" },
		forced: true,
		popup: false,
		nopop: true,
		filter(event, player) {
			const victim = event.player;
			if (!victim || victim === player || !isPlayerSide(victim) || !victim.isAlive()) {
				return false;
			}
			return victim.getCards("h").length > 0 && !!findPollutionCard();
		},
		async content(event, trigger, player) {
			const victim = trigger.player;
			const replacement = findPollutionCard();
			// 刚打出的那张牌此刻可能还挂在结算区，保险起见从「手牌」里排除掉
			const hand = victim.getCards("h").filter(card => card !== trigger.card);
			if (!replacement || !hand.length) {
				return;
			}
			game.log(player, "污染了", victim, "的手牌");
			await victim.discard(pickRandom(hand));
			await victim.gain(replacement, "gain2");
		},
	},
	// 9. 深渊·永恒：每轮开始时恢复体力至上限。
	abyss_yongheng: {
		trigger: { global: "roundStart" },
		forced: true,
		popup: false,
		nopop: true,
		filter(event, player) {
			return player.isAlive() && player.hp < player.maxHp;
		},
		async content(event, trigger, player) {
			game.log(player, "于新一轮开始时回复至体力上限");
			await player.recoverTo(player.maxHp);
		},
	},
	// 10. 深渊·复仇：受到伤害后，本局造成的伤害+1（可叠加；Player 随战斗结束丢弃，所以天然只在本局）。
	abyss_fuchou: {
		trigger: { player: "damageEnd", source: "damageBegin1" },
		forced: true,
		popup: false,
		nopop: true,
		filter(event, player, triggername) {
			if (triggername === "damageEnd") {
				return event.num > 0;
			}
			return triggername === "damageBegin1" && !event.numFixed && (player.storage.abyss_fuchou || 0) > 0;
		},
		async content(event, trigger, player) {
			if (event.triggername === "damageEnd") {
				player.storage.abyss_fuchou = (player.storage.abyss_fuchou || 0) + 1;
				game.log(player, "的恨意加深，造成的伤害+1");
				return;
			}
			trigger.num += player.storage.abyss_fuchou || 0;
		},
	},
};

// ---------------------------------------------------------------- 标记载体

/**
 * 深渊标记：只负责在敌人身边挂一个「深渊」徽记并列出词缀名，不带任何效果。
 * 词缀 id 由 battle.js 一次写进 player.storage.abyss_affix（与 rogue_stat / rogue_curio 同一套做法）。
 */
export const abyssMarkSkill = {
	abyss_affix: {
		forced: true,
		mark: true,
		marktext: ABYSS_MARK_TEXT,
		nopop: true,
		popup: false,
		intro: {
			name: "深渊强化",
			nocount: true,
			mark(uiintro, storage) {
				void uiintro;
				const lines = abyssAffixLines(storage);
				return `<div class="text">${lines.length ? lines.join("<br>") : "无深渊强化"}</div>`;
			},
		},
	},
};

/** 词缀 id → { name, desc }：lib.translate 注册结果优先，未注册时回落到 affixText */
export function abyssAffixInfo(id) {
	const text = affixText[id];
	if (!text) {
		return null;
	}
	const name = typeof lib.translate[id] === "string" && lib.translate[id] ? lib.translate[id] : text.name;
	const desc = typeof lib.translate[`${id}_info`] === "string" && lib.translate[`${id}_info`]
		? lib.translate[`${id}_info`]
		: text.desc;
	return { id, name, desc };
}

/** 词缀 id 列表 → 「［深渊·坚壁］受到的伤害-1。」这样的一行一条文案（徽记说明与战斗内面板共用） */
export function abyssAffixLines(ids) {
	const lines = [];
	for (const id of Array.isArray(ids) ? ids : []) {
		const info = abyssAffixInfo(id);
		if (info) {
			lines.push(`［${info.name}］${info.desc}`);
		}
	}
	return lines;
}

// ---------------------------------------------------------------- 翻译

/** 双键翻译：id = 技能名、id_info = 描述。本体只认这一种格式（引擎里没有 <hr> 切分逻辑） */
export const translate = {
	abyss_affix: "深渊强化",
	abyss_affix_info: "深渊赐予这名敌人的额外机制，详见徽记里的词缀列表。",
};
for (const [id, text] of Object.entries(affixText)) {
	translate[id] = text.name;
	translate[`${id}_info`] = text.desc;
}
