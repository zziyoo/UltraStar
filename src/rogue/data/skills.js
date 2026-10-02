// 肉鸽技能：商店里卖的东西。作者填的是「技能效果、名称描述、价格」。
//
// 填什么
//   pool[]        上架清单，每项 { id, price }；price 只是留给作者标注“基础价”的位子，
//                 当前版本的实际售价由 shop.js 按本局编号动态生成（round(5×sqrt(n)) 上下浮动 25%），
//                 所以这里写多少都不会成为最终售价，省略也行
//                 扩展各分包的全部顶级技能会自动汇总进 pool（统一价 100），新增分包技能无需来这里登记
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

export const helpers = {
	// 过牌强化：摸牌阶段额外多摸 N 张
	rogue_stat_draw: {
		trigger: { player: "phaseDrawBegin2" },
		forced: true,
		mark: true,
		marktext: "摸",
		nopop: true,
		// popup:false 让本体跳过 logSkill 整条链路（content.ts 触发技路径），
		// 既不写战斗日志也不弹十周年UI的「技能名+描述」大字
		popup: false,
		intro: { name: "过牌强化", content: "摸牌阶段额外摸#张" },
		filter(event) {
			return !event.numFixed;
		},
		content(event, trigger, player) {
			trigger.num += player.storage.rogue_stat_draw || 0;
		},
	},
	// 过牌强化：手牌上限 +N
	rogue_stat_hand: {
		mod: {
			maxHandcard(player, num) {
				return num + (player.storage.rogue_stat_hand || 0);
			},
		},
		mark: true,
		marktext: "限",
		nopop: true,
		popup: false,
		intro: { name: "手牌强化", content: "手牌上限+#" },
	},
	// 攻击强化：【杀】伤害 +N
	rogue_stat_sha: {
		trigger: { source: "damageBegin1" },
		forced: true,
		mark: true,
		marktext: "伤",
		nopop: true,
		popup: false,
		intro: { name: "攻击强化", content: "使用【杀】造成的伤害+#" },
		filter(event, player) {
			return event.card?.name == "sha" && (player.storage.rogue_stat_sha || 0) > 0;
		},
		content(event, trigger, player) {
			trigger.num += player.storage.rogue_stat_sha || 0;
		},
	},
	// 攻击强化：出【杀】次数 +N
	rogue_stat_usable: {
		mod: {
			cardUsable(card, player, num) {
				if (card.name == "sha") {
					return num + (player.storage.rogue_stat_usable || 0);
				}
			},
		},
		mark: true,
		marktext: "杀",
		nopop: true,
		popup: false,
		intro: { name: "出杀强化", content: "出牌阶段使用【杀】次数+#" },
	},
};

export const helperTranslate = {
	rogue_stat_draw: "强化·过牌<hr>锁定技，你的摸牌阶段额外多摸若干张牌，数量等于过牌强化的摸牌加成。",
	rogue_stat_hand: "强化·手牌<hr>锁定技，你的手牌上限+若干，数值等于过牌强化的手牌上限加成。",
	rogue_stat_sha: "强化·攻击<hr>锁定技，你使用【杀】造成的伤害+若干，数值等于攻击强化的伤害加成。",
	rogue_stat_usable: "强化·连杀<hr>锁定技，你出牌阶段使用【杀】的次数上限+若干，数值等于攻击强化的次数加成。",
};
