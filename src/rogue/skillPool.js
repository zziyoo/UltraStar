// 商店候选池：把「作者上架清单」与「全体武将的技能」合成一张池表。
// 只读本体的 lib.character / lib.skill / lib.config，不写任何全局状态；
// 「玩家禁用了哪个武将」读的是本体禁将功能各模式分开存的 _banned 名单。

import { lib } from "../../../../noname.js";
import { isPlayerUsable } from "./battle.js";
import { pool } from "./data/skills.js";

/** 角色的技能表：本体注册后是数组第 3 项，扩展原始数据里是 skills 字段，两种形态都收 */
function skillsOf(character) {
	if (Array.isArray(character)) {
		return character[3] ?? [];
	}
	return character?.skills ?? [];
}

/**
 * 玩家禁用过的武将 id 集合。
 * 本体的禁将名单按模式分开存（identity_banned、versus_banned ……），而禁将页的「禁将」分组
 * 本身就是把所有模式的名单合并展示的，这里沿用同一口径：任一模式禁用过就算禁用。
 */
export function getBannedCharacterIds() {
	const config = lib.config ?? {};
	const modes = Array.isArray(config.all?.mode) ? config.all.mode : [];
	const banned = new Set();
	for (const list of [config.banned, ...modes.map(mode => config[`${mode}_banned`])]) {
		for (const id of Array.isArray(list) ? list : []) {
			if (typeof id === "string" && id) {
				banned.add(id);
			}
		}
	}
	return banned;
}

/** 技能自己声明的衍生技（本体 derivation 字段，写法和角色技能表一样可能是字符串或数组） */
function derivationsOf(skillId) {
	const value = lib.skill?.[skillId]?.derivation;
	if (typeof value === "string") {
		return [value];
	}
	return Array.isArray(value) ? value.filter(id => typeof id === "string" && id) : [];
}

/** 能不能上架：本体筛「这条技能能不能挂到别人身上」用的就是同一个判断 */
function isSellable(skillId) {
	if (!lib.skill?.[skillId]) {
		return false;
	}
	const filter = lib.filter?.skillDisabled;
	if (typeof filter !== "function") {
		return true;
	}
	try {
		return !filter(skillId);
	} catch (error) {
		console.error("[rogue] 技能可用性过滤失败，按可上架处理：", skillId, error);
		return true;
	}
}

/**
 * 生成商店候选池。
 * 组成：作者上架清单（分包技能） + 全体可选武将的技能。
 * 排除：玩家禁用过的武将的技能，以及这些技能声明过的衍生技；
 *       同一个技能只要还有别的未禁用武将拥有，就继续上架。
 * 本体判为不可选用的技能（没翻译、内部技）不进池；作者清单在 rogue-data 自检里已经逐条验过，不再重筛。
 * price 只是作者标注位，实际售价由 shop.js 按固定基准价 50 ±25% 随机生成，与关卡无关。
 */
export function getShopPool() {
	const banned = getBannedCharacterIds();
	const usable = new Set();
	const blocked = new Set();
	for (const [id, info] of Object.entries(lib.character ?? {})) {
		if (banned.has(id)) {
			for (const skill of skillsOf(info)) {
				blocked.add(skill);
				for (const derived of derivationsOf(skill)) {
					blocked.add(derived);
				}
			}
			continue;
		}
		if (!isPlayerUsable(id)) {
			continue;
		}
		for (const skill of skillsOf(info)) {
			if (typeof skill === "string" && skill) {
				usable.add(skill);
			}
		}
	}

	const curated = new Set(pool.map(item => item?.id));
	const ids = new Set(curated);
	for (const skill of usable) {
		ids.add(skill);
	}
	const list = [];
	for (const id of ids) {
		if (blocked.has(id) && !usable.has(id)) {
			continue;
		}
		if (!curated.has(id) && !isSellable(id)) {
			continue;
		}
		list.push({ id, price: 100 });
	}
	return list;
}
