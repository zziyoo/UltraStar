// 三项属性强化的等级表。作者填的是「每一级加多少、升一级多少钱」。
//
// 填什么
//   maxLevel      最高等级（levels 数组要正好这么多项）
//   levels[i]     第 i+1 级的「增量」效果对象，支持这些键：
//                   armor       初始护甲 +N（开局时施加，护甲会在受伤时自动抵消伤害）
//                   maxHp       体力上限 +N（同时补等量体力）
//                   startHand   开局起手手牌 +N
//                   extraDraw   摸牌阶段额外摸 +N 张
//                   handLimit   手牌上限 +N
//                   shaDamage   【杀】造成的伤害 +N
//                   shaLimit    出【杀】次数上限 +N
//                   extraSkills 额外获得的技能 id 数组（扩展技能或肉鸽技能）
//   price[i]      从第 i 级升到第 i+1 级的花费；留空数组表示暂不出售（商店按钮会说明「尚未配置升级价格」）
//
// 自检会查
//   maxLevel 非负整数、levels 项数与 maxLevel 一致、只出现上面这些效果键、
//   数值键都是非负数、extraSkills 引用的技能存在、price 里都是非负数。
//
// 填完跑：node tools/test/rogue-data.test.mjs（会校验下面的每一条约束，不用开游戏）

import { STAT_IDS } from "../config.js";

export const stats = {
	// 防御：等级为增量；累计效果 = 护甲 1,1,2,2,3,3,4,4,5,5，体力上限 0,1,2,3,4,5,6,7,8,9
	defense: {
		name: "防御",
		maxLevel: 10,
		price: [1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024],
		levels: [
			{ armor: 1 },
			{ maxHp: 1 },
			{ armor: 1, maxHp: 1 },
			{ maxHp: 1 },
			{ armor: 1, maxHp: 1 },
			{ maxHp: 1 },
			{ armor: 1, maxHp: 1 },
			{ maxHp: 1 },
			{ armor: 1, maxHp: 1 },
			{ maxHp: 1 },
		],
	},
	// 过牌：累计效果 = 摸牌阶段 1,1,2,2,3,3,4,4,5,5，手牌上限 0,1,1,2,2,3,3,4,4,5
	draw: {
		name: "过牌",
		maxLevel: 10,
		price: [1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024],
		levels: [
			{ extraDraw: 1 },
			{ handLimit: 1 },
			{ extraDraw: 1 },
			{ handLimit: 1 },
			{ extraDraw: 1 },
			{ handLimit: 1 },
			{ extraDraw: 1 },
			{ handLimit: 1 },
			{ extraDraw: 1 },
			{ handLimit: 1 },
		],
	},
	// 攻击：累计效果 = 杀伤害 1,1,2,2,3,3,4,4,5,5，出杀次数 0,1,1,2,2,3,3,4,4,5
	attack: {
		name: "攻击",
		maxLevel: 10,
		price: [1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024],
		levels: [
			{ shaDamage: 1 },
			{ shaLimit: 1 },
			{ shaDamage: 1 },
			{ shaLimit: 1 },
			{ shaDamage: 1 },
			{ shaLimit: 1 },
			{ shaDamage: 1 },
			{ shaLimit: 1 },
			{ shaDamage: 1 },
			{ shaLimit: 1 },
		],
	},
};

const EMPTY_EFFECT = { armor: 0, maxHp: 0, startHand: 0, extraDraw: 0, handLimit: 0, shaDamage: 0, shaLimit: 0, extraSkills: [] };

function toNumber(value) {
	return Number.isFinite(value) ? value : 0;
}

/** 取某一属性在 level 这一档上的增量效果；越界返回空效果 */
export function getStatEffect(statId, level) {
	const cfg = stats[statId];
	if (!cfg || !Array.isArray(cfg.levels)) {
		return { ...EMPTY_EFFECT };
	}
	const raw = cfg.levels[level - 1];
	if (!raw || typeof raw !== "object") {
		return { ...EMPTY_EFFECT };
	}
	return {
		armor: toNumber(raw.armor),
		maxHp: toNumber(raw.maxHp),
		startHand: toNumber(raw.startHand),
		extraDraw: toNumber(raw.extraDraw),
		handLimit: toNumber(raw.handLimit),
		shaDamage: toNumber(raw.shaDamage),
		shaLimit: toNumber(raw.shaLimit),
		extraSkills: Array.isArray(raw.extraSkills) ? raw.extraSkills.filter(id => typeof id === "string") : [],
	};
}

/** 从 level-1 升到 level 级的报价；level 越界返回 null 表示不可购买 */
export function getStatPrice(statId, level) {
	const cfg = stats[statId];
	if (!cfg || STAT_IDS.indexOf(statId) < 0 || level <= 0 || level > cfg.maxLevel) {
		return null;
	}
	const list = Array.isArray(cfg.price) ? cfg.price : [];
	if (!list.length) {
		return null;
	}
	const base = list[Math.min(level, list.length) - 1];
	return Number.isFinite(base) ? base : null;
}

/** 汇总整份存档的属性效果，供建局时一次性施加 */
export function sumStatEffects(statLevels) {
	const total = { ...EMPTY_EFFECT, extraSkills: [] };
	if (!statLevels || typeof statLevels !== "object") {
		return total;
	}
	for (const statId of STAT_IDS) {
		const level = Math.floor(toNumber(statLevels[statId]));
		for (let i = 1; i <= level; i++) {
			const effect = getStatEffect(statId, i);
			total.armor += effect.armor;
			total.maxHp += effect.maxHp;
			total.startHand += effect.startHand;
			total.extraDraw += effect.extraDraw;
			total.handLimit += effect.handLimit;
			total.shaDamage += effect.shaDamage;
			total.shaLimit += effect.shaLimit;
			for (const id of effect.extraSkills) {
				total.extraSkills.push(id);
			}
		}
	}
	return total;
}
