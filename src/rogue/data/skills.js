// 肉鸽技能：商店里卖的东西。作者填的是「技能效果、名称描述、价格」。
//
// 填什么
//   pool[]        作者手写的上架底线，每项 { id, price }；price 只是留给作者标注“基础价”的位子，
//                 当前版本的实际售价由 shop.js 按本局编号动态生成（round(5×sqrt(n)) 上下浮动 25%），
//                 所以这里写多少都不会成为最终售价，省略也行
//                 扩展各分包的全部顶级技能会自动汇总进 pool（统一价 100），新增分包技能无需来这里登记
//                 商店真正的候选池还要并上「全体武将的技能」，并剔掉玩家禁用过的武将——见 skillPool.js
//   skill{}       肉鸽原创技能本体，写法同本体 lib.skill（trigger / enable / mod / content…）
//   translate{}   肉鸽原创技能翻译，格式必须是「技能名<hr>描述」；分包技能沿用分包的 id / id_info 双键翻译
//   helpers{}     属性强化的机制技能（见文件末尾），不进商店
//
// 自检会查
//   pool 里每条都有 skill 定义（且含 trigger/enable/mod/group 之一）和齐备的翻译；
//   price 若填写必须为正数；有定义但不在 pool 里的 rogue_ 技能会被提示（商店永远刷不到）。
//
// 注意：rogue_ 技能 id 一旦发布就不要改（存档只存 id）。
//
// 填完跑：node tools/test/rogue-data.test.mjs（会校验上面的每一条约束，不用开游戏）

import { packages } from "../../core/loader.js";
import { describeStatEffects } from "./stats.js";

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

/** 商店上架清单：扩展全部技能 + 肉鸽原创技能，价格统一 100 */
export const pool = [
	...Object.keys(packSkill)
		.filter(id => !NON_SELLABLE.has(id))
		.map(id => ({ id, price: 100 })),
	{ id: "rogue_xushui", price: 100 },
	{ id: "rogue_jiema", price: 100 },
	{ id: "rogue_guiyuan", price: 100 },
];

export const skill = {
	...packSkill,
	rogue_xushui: {
		trigger: { player: "phaseDrawBegin2" },
		forced: true,
		nopop: true,
		logv: false,
		filter(event) {
			return !event.numFixed;
		},
		content(event, trigger) {
			trigger.num++;
		},
		ai: { threaten: 1.2 },
	},
	rogue_jiema: {
		trigger: { player: "damageBegin3" },
		forced: true,
		nopop: true,
		logv: false,
		content(event, trigger) {
			if (trigger.num > 1) {
				trigger.num--;
			}
		},
		ai: { threaten: 1.3 },
	},
	rogue_guiyuan: {
		trigger: { player: "phaseJieshu" },
		forced: true,
		nopop: true,
		logv: false,
		filter(event, player) {
			return player.isDamaged();
		},
		async content(event, trigger, player) {
			await player.recover();
		},
	},
};

export const translate = {
	...packSkillTranslate,
	rogue_xushui: "蓄势<hr>锁定技，你的摸牌阶段额外多摸一张牌。",
	rogue_jiema: "解甲<hr>锁定技，你受到的伤害-1。",
	rogue_guiyuan: "归元<hr>锁定技，你的结束阶段，若你已受伤，你回复1点体力。",
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
			// storage 是对象，别让本体去猜标记数量
			nocount: true,
			// intro.mark 是函数时由本体调用并原样插入（get/index.js 的 mark 节点介绍），
			// 所以这里能列出四项的实时数值
			mark(storage) {
				const lines = describeStatEffects(storage);
				return `<div class="text">当前属性强化：<br>${lines.length ? lines.join("<br>") : "暂无加成"}</div>`;
			},
		},
		filter(event, player, triggername) {
			const storage = player.storage.rogue_stat ?? {};
			if (triggername === "phaseDrawBegin2") {
				return !event.numFixed && (storage.extraDraw || 0) > 0;
			}
			if (triggername === "damageBegin1") {
				return event.card?.name == "sha" && (storage.shaDamage || 0) > 0;
			}
			return false;
		},
		content(event, trigger, player) {
			const storage = player.storage.rogue_stat ?? {};
			if (trigger.name === "phaseDrawBegin2") {
				trigger.num += storage.extraDraw || 0;
			} else if (trigger.name === "damageBegin1") {
				trigger.num += storage.shaDamage || 0;
			}
		},
	},
};

export const helperTranslate = {
	rogue_stat: "属性强化<hr>锁定技，你购买的防御/过牌/攻击强化都在这个技能上生效：摸牌阶段额外摸牌、手牌上限提升、【杀】的伤害与出杀次数提升。点标记可以查看当前全部加成。",
};
