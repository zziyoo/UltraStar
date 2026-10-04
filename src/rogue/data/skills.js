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

/** 商店上架清单：扩展全部分包技能，价格统一 100 */
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
// battle.js 建局时按存档算好总数，写进 player.storage[技能名] 并 addSkill；
// 技能本体只读 storage，不在 lib 里登记任何针对具体存档的内容。

// 属性强化（data/stats.js）的数值加成载体，不进商店、不进奖励池。
// battle.js 建局时按存档一次性算好总数，写进 player.storage.rogue_stat 并 addSkill 一次：
// 一个技能同时承担四种效果，玩家旁边因此只有一个「强化」标记，点开能看到全部当前效果。
// 技能本体只读 storage，不在 lib 里登记任何针对具体存档的内容。

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
	// 奇物的战斗内效果载体（curioManager.sumCurioEffects 的总表由 battle.js 建局时一次写进 storage）：
	// 破损怀表（游戏开始时额外出牌阶段，照官方「当先」的 phaseList.splice 写法）、
	// 能量核心（摸牌 +1）、气息腰带（每局首次濒死回复至 1）、剩饭（每轮结束回 1 血）。
	// 结算类效果（幸运石的经验加成）不走这里，由 reward.js 胜利结算时用 curioManager.getBonus 现查。
	rogue_curio: {
		trigger: {
			player: ["phaseBegin", "phaseDrawBegin2", "dying"],
			global: "roundEnd",
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
				await player.recoverTo(1);
			} else if (event.triggername === "roundEnd") {
				await player.recover(storage.roundHeal || 0);
			}
		},
	},
};

export const helperTranslate = {
	rogue_stat: "属性强化",
	rogue_curio: "奇物",
};
