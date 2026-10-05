// 技能池：商店里卖的东西。作者填的是「技能效果、名称描述、价格」。
//
// 填什么
//   pool[]        作者手写的上架底线，每项 { id, price }；price 只是留给作者标注“基础价”的位子，
//                 实际售价由 shop.js 按模式基准价 ±25% 随机生成（闯关恒 50、无尽 floor(50×√当前关卡)），
//                 所以这里写多少都不会成为最终售价，省略也行
//                 扩展各分包的全部顶级技能会自动汇总进 pool（统一价 100），新增分包技能无需来这里登记
//                 商店真正的候选池还要并上「全体武将的技能」，并剔掉玩家禁用过的武将——见 skillPool.js
//   skill{}       补充技能本体，写法同本体 lib.skill（trigger / enable / mod / content…）；
//                 目前为空——商店只卖分包技能与武将技能，肉鸽不再有原创技能
//   translate{}   上述技能的翻译，格式必须是「技能名<hr>描述」；分包技能沿用分包的 id / id_info 双键翻译
//   helpers{}     属性强化的机制技能（见文件末尾），不进商店
//
// 自检会查
//   pool 里每条都有 skill 定义（且含 trigger/enable/mod/group 之一）和齐备的翻译；
//   price 若填写必须为正数；有定义但不在 pool 里的 rogue_ 技能会被提示（商店永远刷不到）。
//
// 注意：技能 id 一旦发布就不要改（存档只存 id）；已下架技能（旧存档还持有的）由 state.js 读档时清除。
//
// 填完跑：node tools/test/rogue-data.test.mjs（会校验上面的每一条约束，不用开游戏）

import { game } from "../../../../../noname.js";
import { packages } from "../../core/loader.js";
import { describeStatEffects } from "./stats.js";
import { describeCurioEffects } from "../curioManager.js";

// ---------------------------------------------------------------- 分包技能汇总
//
// 扩展全部作品分包的顶级技能整体进入商店池：定义与翻译沿用分包原样
// （翻译为「id：技能名 / id_info：描述」双键，与本体扩展注册格式一致），
// 这里只做引用汇总，不复制定义，分包改动自动生效。

const packSkill = {};
const packSkillTranslate = {};
for (const pkg of packages) {
	Object.assign(packSkill, pkg.skills ?? {});
	Object.assign(packSkillTranslate, pkg.skillTranslate ?? {});
}

// 不可上架的内部技能：只对特定角色/专属机制生效（如死龙的换人控制技），买来无意义也无翻译
const NON_SELLABLE = new Set(["slcontrol"]);

export const pool = Object.keys(packSkill)
	.filter(id => !NON_SELLABLE.has(id))
	.map(id => ({ id, price: 100 }));

export const skill = {
	...packSkill,
};

export const translate = {
	...packSkillTranslate,
};

// ---------------------------------------------------------------- 机制技能
//
// 属性强化（data/stats.js）的数值加成载体，不进商店、不进奖励池。
// battle.js 建局时按存档一次性算好总数，写进 player.storage.rogue_stat 并 addSkill 一次：
// 一个技能同时承担四种效果，玩家旁边因此只有一个「强化」标记，点开能看到全部当前效果。
// 技能本体只读 storage，不在 lib 里登记任何针对具体存档的内容。

/**
 * 「本回合」的判据：拿 phase 事件对象本身比——同一个 phase 事件才是同一个回合
 * （与深渊词缀 abyss_buqu 同一套做法，不必再挂临时技，回合一走两边自然不再相等）。
 */
function phaseOf(event) {
	const found = event && typeof event.getParent === "function" ? event.getParent("phase") : null;
	return found && found.name === "phase" ? found : null;
}

function samePhase(stored, phase) {
	return !!stored && !!phase && stored === phase;
}

/** 血怒核心的体力闸门：带 lowHp 标记的档只在「体力低于体力上限的一半（向上取整）」时生效 */
function curioUnrespondableActive(player) {
	const storage = player.storage?.rogue_curio ?? {};
	if (!((storage.unrespondable || 0) > 0)) {
		return false;
	}
	if ((storage.unrespondableLowHp || 0) > 0) {
		return player.hp < Math.ceil(player.maxHp / 2);
	}
	return true;
}

/**
 * 此刻这名玩家「造成伤害时」能加的点数（纯查询，绝不在这里消耗任何东西）。
 * filter 与 content 都调它，判据因此只有一份；消耗（下一次那一层）只在 content 里做一次。
 * 反击护符三档都只加一层：布尔/回合标记被反复受伤刷新也不会变成 +2。
 */
function curioDealtDamageBonus(player, event) {
	const storage = player.storage?.rogue_curio ?? {};
	const phase = phaseOf(event);
	let bonus = 0;
	if ((storage.firstDamageBonus || 0) > 0 && samePhase(player.rogueCurioRagePhase, phase)) {
		bonus += storage.firstDamageBonus;
	}
	if ((storage.hurtDamageGame || 0) > 0 && player.rogueCurioCounterGame) {
		bonus += storage.hurtDamageGame;
	}
	if ((storage.hurtDamageRound || 0) > 0 && samePhase(player.rogueCurioCounterPhase, phase)) {
		bonus += storage.hurtDamageRound;
	}
	if ((storage.hurtDamageNext || 0) > 0 && player.rogueCurioCounterNext) {
		bonus += storage.hurtDamageNext;
	}
	// 「此牌伤害 +1」只对**有牌**的伤害生效：纯技能伤害没有「这张牌」
	if ((storage.unrespondableCardDamage || 0) > 0 && !!event.card && curioUnrespondableActive(player)) {
		bonus += storage.unrespondableCardDamage;
	}
	return bonus;
}

export const helpers = {
	rogue_stat: {
		// 一个技能可以同时挂多个时机与 mod
		trigger: { player: "phaseDrawBegin2", source: "damageBegin1" },
		mod: {
			maxHandcard(player, num) {
				return num + (player.storage.rogue_stat?.handLimit || 0);
			},
			cardUsable(card, player, num) {
				if (card.name == "sha") {
					return num + (player.storage.rogue_stat?.shaLimit || 0);
				}
			},
		},
		forced: true,
		mark: true,
		marktext: "强化",
		nopop: true,
		// popup:false 让本体跳过 logSkill 整条链路（content.ts 触发技路径），
		// 既不写战斗日志也不弹十周年UI的「技能名+描述」大字
		popup: false,
		intro: {
			name: "属性强化",
			nocount: true,
			mark(uiintro, storage) {
				const lines = describeStatEffects(storage);
				return `<div class="text">${lines.length ? lines.join("<br>") : "未强化"}</div>`;
			},
		},
		filter(event, player, triggername) {
			const storage = player.storage.rogue_stat ?? {};
			if (triggername === "phaseDrawBegin2") {
				return !event.numFixed && (storage.extraDraw || 0) > 0;
			}
			if (triggername === "damageBegin1") {
				return !event.numFixed && (storage.damageChance || 0) > 0;
			}
			return false;
		},
		content(event, trigger, player) {
			const storage = player.storage.rogue_stat ?? {};
			// trigger 是本体传进来的基事件，name 只会是 phaseDraw / damage；
			// 时机名读 event.triggername（照本体战法 zf_hengfeng 的写法）
			if (event.triggername === "phaseDrawBegin2") {
				trigger.num += storage.extraDraw || 0;
			} else if (event.triggername === "damageBegin1") {
				if (Math.random() * 100 < Math.max(0, Math.min(100, storage.damageChance || 0))) {
					trigger.num += 1;
				}
			}
		},
	},
	// 奇物的战斗内效果载体（curioManager.sumCurioEffects 按当前品质算出的总表，由 battle.js 建局时一次写进 storage）：
	// 破损怀表（游戏开始时额外出牌阶段，照官方「当先」的 phaseList.splice 写法）、
	// 能量核心（摸牌 +1）、气息腰带（每局首次濒死回复）、剩饭（每轮结束回血；升到史诗改每回合）。
	// 结算类效果（幸运石的经验加成、诅咒金币的金币加成）不走这里，由 reward.js 胜利结算时用 curioManager.getBonus 现查。
	rogue_curio: {
		trigger: {
			// phaseEnd 是「这个玩家的整个回合走完」的时机（本体在 phaseList 跑完后 trigger 一次），
			// roundEnd 才是全场一轮结束——剩饭的史诗档换的就是这两者。
			// damageEnd = 受到伤害后（反击护符上 buff）；source 那两个是「我造成的伤害」：
			// damageBegin1 加伤、damage 用来认出「本回合的首次造成伤害」。
			player: ["phaseBegin", "phaseDrawBegin2", "dying", "phaseEnd", "damageEnd"],
			source: ["damageBegin1", "damage"],
			global: "roundEnd",
		},
		// 血怒核心「你使用的牌无法被响应」要走本体的两个技能标签，而且**两个都得挂**：
		//   norespond      —— 本体 lib.filter.cardRespondable 里问的是「出牌那个人」有没有这个标签，
		//                    有就让响应者一律不能响应（闪挡不住杀、决斗接不住……）；
		//   playernowuxie  —— 锦囊的无懈可击询问走的是另一条路（lib.skill._wuxie 的 filter），
		//                    不吃 cardRespondable，所以必须单独挂它。
		// 两者都靠 skillTagFilter 现读体力条件；标签为 true 时本体才会调 skillTagFilter，别写成函数式标签。
		ai: {
			norespond: true,
			playernowuxie: true,
			skillTagFilter(player, tag) {
				if (tag === "norespond" || tag === "playernowuxie") {
					return curioUnrespondableActive(player);
				}
				return false;
			},
		},
		forced: true,
		mark: true,
		marktext: "奇物",
		nopop: true,
		popup: false,
		intro: {
			name: "奇物",
			nocount: true,
			mark(uiintro, storage) {
				const lines = describeCurioEffects(storage);
				return `<div class="text">${lines.length ? lines.join("<br>") : "无战斗效果"}</div>`;
			},
		},
		filter(event, player, triggername) {
			const storage = player.storage.rogue_curio ?? {};
			if (triggername === "phaseBegin") {
				// 游戏开始时：整局的第一个回合开始才给额外阶段（自身只给一次）
				return !player.storage.rogue_curio_watch && game.phaseNumber <= 1 && (storage.extraPhase || 0) > 0;
			}
			if (triggername === "phaseDrawBegin2") {
				return !event.numFixed && (storage.extraDraw || 0) > 0;
			}
			if (triggername === "dying") {
				return player.hp < 1 && (storage.dyingSave || 0) > 0 && !player.storage.rogue_curio_belt;
			}
			if (triggername === "roundEnd") {
				return player.isAlive() && player.hp < player.maxHp && (storage.roundHeal || 0) > 0;
			}
			if (triggername === "phaseEnd") {
				return player.isAlive() && player.hp < player.maxHp && (storage.turnHeal || 0) > 0;
			}
			if (triggername === "damageEnd") {
				// 反击护符：受到伤害后上一层 buff。当前品质下三档只有一个键存在（qualityEffects 整份替换），
				// 所以「不累加」天然成立；反复受伤也只是把同一层重新按上
				return event.num > 0
					&& (storage.hurtDamageNext || 0) + (storage.hurtDamageRound || 0) + (storage.hurtDamageGame || 0) > 0;
			}
			if (triggername === "damage") {
				// 狂战徽章要的是「首次造成伤害**后**」，所以第一下之前不该武装——已经武装过本回合就不再重复
				return event.num > 0
					&& (storage.firstDamageBonus || 0) > 0
					&& !samePhase(player.rogueCurioRagePhase, phaseOf(event));
			}
			if (triggername === "damageBegin1") {
				// 加伤一律排在 damageBegin1（damageBegin4 本体没有 await，改数会赶上结算的读取）；
				// 固定伤害不参与
				return !event.numFixed && curioDealtDamageBonus(player, event) > 0;
			}
			return false;
		},
		async content(event, trigger, player) {
			const storage = player.storage.rogue_curio ?? {};
			if (event.triggername === "phaseBegin") {
				player.storage.rogue_curio_watch = true;
				// 官方「当先」同款：把额外出牌阶段插进当前回合的阶段列表开头
				for (let i = 0; i < (storage.extraPhase || 0); i++) {
					trigger.phaseList.splice(trigger.num, 0, "phaseUse|rogue_curio");
				}
			} else if (event.triggername === "phaseDrawBegin2") {
				trigger.num += storage.extraDraw || 0;
			} else if (event.triggername === "dying") {
				player.storage.rogue_curio_belt = true;
				// 回复目标数据驱动：写了比例就回复到「体力上限 × 比例」，否则固定回 1
				const ratio = storage.dyingRecoverToRatio || 0;
				await player.recoverTo(ratio > 0 ? Math.ceil(player.maxHp * ratio) : 1);
			} else if (event.triggername === "roundEnd") {
				await player.recover(storage.roundHeal || 0);
			} else if (event.triggername === "phaseEnd") {
				await player.recover(storage.turnHeal || 0);
			} else if (event.triggername === "damageEnd") {
				// 反击护符上 buff：三个记号都是「赋值」而不是「累加」，所以挨多少次打都只有一层
				const phase = phaseOf(trigger);
				if ((storage.hurtDamageNext || 0) > 0) {
					player.rogueCurioCounterNext = true;
				}
				if ((storage.hurtDamageRound || 0) > 0) {
					player.rogueCurioCounterPhase = phase;
				}
				if ((storage.hurtDamageGame || 0) > 0) {
					player.rogueCurioCounterGame = true;
				}
			} else if (event.triggername === "damage") {
				// 狂战徽章：记下「本回合已经造成过伤害」的那个回合对象，之后同回合的伤害才吃加成
				player.rogueCurioRagePhase = phaseOf(trigger);
			} else if (event.triggername === "damageBegin1") {
				const bonus = curioDealtDamageBonus(player, trigger);
				if (bonus > 0) {
					trigger.num += bonus;
					// 「下一次造成伤害 +1」是消耗品：吃到就清空，之后要重新挨一发才再有一层
					if ((storage.hurtDamageNext || 0) > 0 && player.rogueCurioCounterNext) {
						player.rogueCurioCounterNext = false;
					}
				}
			}
		},
	},
};

export const helperTranslate = {
	rogue_stat: "属性强化",
	rogue_curio: "奇物",
};
