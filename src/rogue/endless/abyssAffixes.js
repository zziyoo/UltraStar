// 深渊化强化：第一版词缀池的十个持恒技本体。
//
// 每个强化就是一个独立注册的 lib 技能（id 以 abyss_ 开头），敌人身上 addSkill 即生效：
//   · 名称与描述走 lib.translate 的双键格式（id = 技能名 / id_info = 描述），
//     所以本体自己的角色信息区就能列出它们，不必再造一遍；
//   · abyss_affix 是纯粹的标记载体（不发效果），负责在敌人身边挂一个「深渊」徽记，
//     与玩家的「强化」徽记同一套做法；徽记说明从 player.storage.abyss_affix 里的词缀 id 现查文案。
//   · 另有三个「载体技能」（abyssHelperSkills）也不进随机池：abyss_xuwu_blocker 只被 addSkillBlocker
//     按 id 引用、abyss_xuwu_release 是虚无的到期解除宿主、abyss_wuran_lock 由污染挂到**玩家**身上当封牌 mod 的宿主。
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
//   · 「所有技能失效」走本体的技能屏蔽器：player.addSkillBlocker(载体id) + 载体技能写 skillBlocker()，
//     触发链每执行一个技能都重新过 lib.filter.filterTrigger → player.getSkills() → game.filterSkills
//     → get.is.blocked，所以连还没响的触发技一起压住（disableSkill 只能逐个点名技能 id，做不到「所有」；
//     顺带一提它的**第二个**参数才是被禁的技能，第一个只是「谁禁的」标签）；
//   · 屏蔽器记在 `player.storage.skill_blocker` 这个数组里，解除用的 `Array.prototype.remove` **一次只删一个**，
//     所以加几层就得解几层：已经在按着就别再叠一层；
//   · 「到本回合结束就解除」用 addTempSkill(宿主, { global: "phaseEnd" }) 挂在**被作用的那个人**身上：
//     本体到点会 removeSkill，而 removeSkill 才走 onremove。别挂在词缀持有者身上——本体的死亡流程
//     只摘临时技（content.js:11668），永久技不会被移除，持有者先死它的触发和 onremove 都不会响；
//   · 判定牌颜色读 result.color（"black" / "red" / "none"），必须 await 完再读才吃得到改判；
//   · roundEnd / roundStart / phaseBegin / phaseEnd 是全局时机，只能写在 trigger.global 里，
//     挂在 player 上永远不会响；phaseBegin 与 phaseEnd 都是**每个角色的回合**各响一次，
//     回合对象本身可以拿来比身份（「本回合内」就是这么判的）；
//   · 封住某张牌不让「使用 / 打出 / 弃置」要挂在**持牌者**的 mod 上（本体 checkMod 只看执行者的技能），
//     三个 mod 的入参个数还不一样：
//       cardEnabled2(card, player, event, unchanged) —— 使用与打出都会先问它（只对实体牌问），
//       cardRespondable(card, player, unchanged)     —— 没有 event 这一档，
//       cardDiscardable(card, player, event, unchanged) —— event 已被本体转成父事件名字符串；
//     弃牌阶段走 chooseToDiscard，默认 filterCard 就是 lib.filter.cardDiscardable，所以一并生效；
//   · player.damage(...) 返回的是**还没跑**的 GameEvent，可以先把标记写上去再 await；
//     反弹类伤害要带 "nocard"，否则本体会把当前事件的牌抄到这份新伤害上。

import { lib, game, get } from "../../../../../noname.js";

import { ABYSS_MARK_TEXT } from "./abyssConfig.js";

/** 玩家一方：battle.js 的 markSides 把阵营记在 Player.rogueSide 上（0=玩家 1=敌人） */
const SIDE_PLAYER = 0;

/** 深渊·虚无的封印载体 id：只被 addSkillBlocker 按名字引用，永远不会 addSkill 到任何角色身上 */
const XUWU_BLOCKER_SKILL = "abyss_xuwu_blocker";

/** 深渊·虚无的解除宿主 id：以临时技形式挂在**被封印的玩家**身上，到期 removeSkill 时靠 onremove 放开屏蔽器 */
const XUWU_RELEASE_SKILL = "abyss_xuwu_release";

/** 深渊·污染的封牌载体 id：要 addSkill 到被污染的玩家身上，本体的 checkMod 才读得到它的 mod */
const WURAN_LOCK_SKILL = "abyss_wuran_lock";

/** 被污染牌的牌面 gaintag：直接复用词缀 id，get.translation 会渲染出「深渊·污染」 */
const WURAN_GAINTAG = "abyss_wuran";

const FULL_PHASE_LIST = ["phaseZhunbei", "phaseJudge", "phaseDraw", "phaseUse", "phaseDiscard", "phaseJieshu"];

/** 词缀文案：翻译表与本模块回落值的唯一来源（lib.translate 注册后优先读注册结果） */
export const affixText = {
	abyss_buqu: { name: "深渊·不屈", desc: "本局游戏首次进入濒死状态时，回复体力至上限，且本回合受到伤害时防止之。" },
	abyss_jianbi: { name: "深渊·坚壁", desc: "受到的伤害减半（向上取整），且至少减免2点。" },
	abyss_jinyu: { name: "深渊·禁欲", desc: "玩家于摸牌阶段外获得牌后，随机弃置一张牌。" },
	abyss_kuangre: { name: "深渊·狂热", desc: "每轮开始时进行一次判定，若判定结果为黑色，立即执行一个额外的回合。" },
	abyss_liesha: { name: "深渊·猎杀", desc: "攻击范围无限，造成的伤害×2。" },
	abyss_xuwu: { name: "深渊·虚无", desc: "受到玩家非实体牌造成的伤害后，本回合该玩家的所有技能失效。" },
	abyss_jingxiang: { name: "深渊·镜像", desc: "受到伤害后，对伤害来源造成等量的伤害。" },
	abyss_wuran: { name: "深渊·污染", desc: "玩家对你使用牌后，随机令其一张手牌被污染：不能使用、打出或弃置此牌，其他角色可以弃置此牌。" },
	abyss_yongheng: { name: "深渊·永恒", desc: "任意角色回合开始时，恢复体力至上限。" },
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

/** 深渊·污染的封牌判据：只认引用；被污染的牌离开这名玩家的手牌/装备/判定区就不再算数 */
function isWuranLocked(player, card) {
	return !!card && (player.abyssWuranLocked ?? []).includes(card);
}

/** 「随机弃置一张牌」的候选：手牌 + 装备区 + 判定区（本体口径下的「牌」含装备与判定），被污染锁住的牌除外 */
function collectDiscardable(player) {
	return player.getCards("h").concat(player.getEquips(), player.getCards("j"))
		.filter(card => !isWuranLocked(player, card));
}

function pickRandom(list) {
	return list[Math.floor(Math.random() * list.length) % list.length];
}

/**
 * 深渊·污染的落地：引用记在该玩家的普通属性上（storage 在本体里要 JSON 广播，塞不进 Card 对象），
 * 再把封牌载体技能挂到该玩家身上——本体 checkMod 只读「执行动作的那个人」的技能，
 * 所以载体放在持有污染的敌人身上永远不会生效。
 * 同时在牌面挂「深渊·污染」gaintag（player.addGaintag 会记进录像）：非 eternal_ 的 gaintag
 * 在牌离开持有者区域时会被本体自动剥掉，被拆走或顺走后标签跟着消失；
 * 已经不在身上的旧污染牌，这里也顺手补摘一次以防漏网。
 */
function lockWuranCard(player, card) {
	const owned = player.getCards("h").concat(player.getEquips(), player.getCards("j"));
	const previous = player.abyssWuranLocked ?? [];
	const kept = previous.filter(item => owned.includes(item));
	for (const item of previous) {
		if (!kept.includes(item) && item.hasGaintag(WURAN_GAINTAG)) {
			item.removeGaintag(WURAN_GAINTAG);
		}
	}
	player.abyssWuranLocked = kept.concat(card);
	player.addSkill(WURAN_LOCK_SKILL);
	player.addGaintag(card, WURAN_GAINTAG);
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
	// 2. 深渊·坚壁：**减免额**为「受到伤害的一半向上取整」，且至少减免 2 点。挂在 damageBegin4（所有加伤算完之后的最后一档），
	//    改的是最终值；只改数值不封伤害，所以对方仍然「造成过伤害」。
	//    「向上取整」取在减免额上而不是结果上，所以奇数点偏向防守方：5 点减免 ceil(2.5)=3、实受 2；
	//    「至少减免 2」让 1、2 点直接砍到 0（走 damageZero，仍然算受到过伤害，只是不掉血）。
	//    逐档：1→0、2→0、3→1、4→2、5→2、6→3、7→3、8→4（3 点起等价于「受到伤害向下取整」）。
	abyss_jianbi: {
		trigger: { player: "damageBegin4" },
		forced: true,
		popup: false,
		nopop: true,
		filter(event, player, triggername) {
			return triggername === "damageBegin4" && !event.numFixed && event.num > 0;
		},
		async content(event, trigger) {
			trigger.num = Math.max(0, trigger.num - Math.max(2, Math.ceil(trigger.num / 2)));
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
	// 5. 深渊·猎杀：攻击范围无限 + 造成的伤害×2（不限来源牌，技能伤害也算）。
	//    翻倍挂在 damageBegin1（加伤档最前面），所以它乘的是这张伤害的原始值——
	//    别人在后面再加减的点数不会再被乘进去，不会跟复仇之类叠成指数。
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
			trigger.num *= 2;
		},
	},
	// 6. 深渊·虚无：受到玩家用「非实体牌」打来的伤害后，把那名玩家封到本回合结束——所有技能失效。
	//    不再限制「本局一次」：这一回合里每挨一发都重新按住（已经按着就不重复计数）。
	//    「所有技能失效」只能走本体的技能屏蔽器：本体每查一个技能都要过 filterTrigger → getSkills →
	//    game.filterSkills → get.is.blocked，再挨个问注册表里的 skillBlocker；载体一律答「是」＝全部失效，
	//    连还没响的触发技一起压住（disableSkill 必须点名技能 id，做不到「所有」）。
	//    解除挂在**被封印玩家自己**的临时技上：addTempSkill 到点会 removeSkill，而 removeSkill 才走 onremove。
	//    千万别挂在词缀持有者身上——本体的死亡流程只摘临时技（content.js:11668），永久技不会被移除，
	//    持有者先死的话它的触发与 onremove 都不会响，玩家就被永久缴械了。
	abyss_xuwu: {
		trigger: { player: "damageEnd" },
		forced: true,
		popup: false,
		nopop: true,
		filter(event, player, triggername) {
			return triggername === "damageEnd"
				&& event.num > 0
				&& isPlayerSide(event.source)
				&& !hasPhysicalCard(event.card);
		},
		async content(event, trigger, player) {
			const target = trigger.source;
			if (!target || !target.isAlive()) {
				return;
			}
			// 屏蔽器在本体里是「数组 + Array.remove 一次只删一个」，加几个就得解几个，
			// 所以按着的时候不再重复加层
			if ((target.storage.skill_blocker ?? []).includes(XUWU_BLOCKER_SKILL)) {
				return;
			}
			target.addSkillBlocker(XUWU_BLOCKER_SKILL);
			target.addTempSkill(XUWU_RELEASE_SKILL, { global: "phaseEnd" });
			game.log(player, "抹去了", target, "本回合的所有技能");
		},
	},
	// 7. 深渊·镜像：受到伤害后，对伤害来源造成**等量**的伤害（实体牌与纯技能伤害都算）。
	abyss_jingxiang: {
		trigger: { player: "damageEnd" },
		forced: true,
		popup: false,
		nopop: true,
		filter(event, player) {
			return event.num > 0
				&& !event.abyssMirror
				&& !!event.source
				&& event.source !== player
				&& event.source.isAlive();
		},
		async content(event, trigger, player) {
			const source = trigger.source;
			game.log(player, "的深渊之镜映出了", source, "的身影");
			// "nocard"：不带牌的反伤才不会又被「非实体牌」类的判据读成实体牌伤害；
			// abyssMirror：两个敌人都带镜像时互相反弹会无限循环，标记打在事件对象上，
			// 第二次进 filter 就自己停住。damage() 返回的是还没跑的事件，所以标记来得及写上去。
			const reflect = source.damage(trigger.num, player, "nocard");
			reflect.abyssMirror = true;
			await reflect.forResult();
		},
	},
	// 8. 深渊·污染：玩家**对词缀持有者**使用牌后，随机把其（出牌者本人的）一张**还没被污染**的手牌「污染」——
	//    它从此不能用、不能打出、也不能自己弃置，但可以被别人拆走或顺走
	//    （封牌 mod 只挂在被污染的玩家身上：自己弃牌走 cardDiscardable 会被拦，
	//    别人弃置走 canBeDiscarded / 执行者自己的技能，不受影响）。
	//    「对你使用」按 event.targets 里有没有持有者本人判：单体、多体（南蛮/万箭）、延时锦囊都算，
	//    无中生有这类无目标或只指自己的牌不算。
	//    牌面标记用 gaintag：game.me 的手牌就是原始 Card 对象，addGaintag 即时生效，
	//    悬停牌面还会多一行「此牌标签：深渊·污染」。
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
			// 「对你使用牌」：这张牌的目标里得有词缀持有者自己
			if (!Array.isArray(event.targets) || !event.targets.includes(player)) {
				return false;
			}
			return victim.getCards("h").some(card => card !== event.card && !isWuranLocked(victim, card));
		},
		async content(event, trigger, player) {
			const victim = trigger.player;
			// 刚打出的那张牌此刻可能还挂在结算区，保险起见从「手牌」里排除掉
			const hand = victim.getCards("h").filter(card => card !== trigger.card && !isWuranLocked(victim, card));
			if (!hand.length) {
				return;
			}
			game.log(player, "污染了", victim, "的一张手牌");
			lockWuranCard(victim, pickRandom(hand));
		},
	},
	// 9. 深渊·永恒：**任意角色**回合开始时恢复体力至上限（不再是每轮一次，也不只在自己的回合）。
	//     所以玩家一开口、甚至敌人自己动一下，它都满血——想磨血必须先一轮内把它打死。
	abyss_yongheng: {
		trigger: { global: "phaseBegin" },
		forced: true,
		popup: false,
		nopop: true,
		filter(event, player) {
			return player.isAlive() && player.hp < player.maxHp;
		},
		async content(event, trigger, player) {
			game.log(player, "于回合开始时回复至体力上限");
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

// ---------------------------------------------------------------- 载体技能（都不进随机池）

/**
 * 词缀自己用的三个载体，随模式注册但不可能被随机发到敌人身上：
 *   · abyss_xuwu_blocker 只被 `player.addSkillBlocker(载体id)` 按名字引用，永远不 addSkill——
 *     本体 get.is.blocked 会挨个问注册表里的 skillBlocker，这里一律回答「是」，
 *     就等于把那名角色「所有技能」按住（装备技能在本体 filterSkills 里算 exclude，不在其列）；
 *   · abyss_xuwu_release 以临时技形式挂在被封印的玩家身上，只借它的 onremove 到点放人；
 *   · abyss_wuran_lock 由污染挂到**玩家**身上：本体 checkMod 只读执行动作那个人自己的技能，
 *     所以封牌的 mod 必须住在持牌者身上，放在敌人身上是死技能。
 */
export const abyssHelperSkills = {
	abyss_xuwu_blocker: {
		forced: true,
		popup: false,
		nopop: true,
		skillBlocker() {
			return true;
		},
	},
	// 只当「本回合结束就解除」的到期宿主：本体到点 removeSkill，onremove 里放掉屏蔽器。
	// 它自己没有任何触发时机，也不会被 addSkill——addTempSkill 只借它的 onremove。
	abyss_xuwu_release: {
		forced: true,
		popup: false,
		nopop: true,
		onremove(player) {
			player.removeSkillBlocker(XUWU_BLOCKER_SKILL);
		},
	},
	abyss_wuran_lock: {
		forced: true,
		popup: false,
		nopop: true,
		mod: {
			// 使用与打出都会先问 cardEnabled2（只对实体牌问），弃置走 cardDiscardable；
			// cardRespondable 单独留一份，管的是打出时牌已被 autoViewAs 包过一层的那条路。
			cardEnabled2(card, player, event, unchanged) {
				return isWuranLocked(player, card) ? false : unchanged;
			},
			cardRespondable(card, player, unchanged) {
				return isWuranLocked(player, card) ? false : unchanged;
			},
			cardDiscardable(card, player, event, unchanged) {
				return isWuranLocked(player, card) ? false : unchanged;
			},
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
	abyss_xuwu_blocker: "深渊封印",
	abyss_xuwu_blocker_info: "被虚无按住，本回合所有技能失效。",
	abyss_xuwu_release: "深渊封印·解除",
	abyss_xuwu_release_info: "本回合结束时放开的临时标记，玩家不用管它。",
	abyss_wuran_lock: "深渊污染",
	abyss_wuran_lock_info: "你不能使用、打出或弃置被深渊污染的牌。",
};
for (const [id, text] of Object.entries(affixText)) {
	translate[id] = text.name;
	translate[`${id}_info`] = text.desc;
}
