// 商店候选池：把「作者上架清单」与「全体武将的技能」合成一张池表。
// 只读本体的 lib.character / lib.skill / lib.config，不写任何全局状态；
// 「玩家禁用了哪个武将」读的是本体禁将功能各模式分开存的 _banned 名单。

import { lib } from "../../../../noname.js";
import { isPlayerUsable } from "./battle.js";
import { checkRogueSkillCompat } from "./skillCompat.js";
import { pool } from "./data/skills.js";

/** 角色的技能表：本体注册后是数组第 3 项，扩展原始数据里是 skills 字段，两种形态都收 */
export function skillsOf(character) {
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

/**
 * 能不能上架：本体筛「这条技能能不能挂到别人身上」用的就是同一个判断。
 * **fail-closed**：本体过滤器不存在、抛异常、返回非布尔，一律按「不可上架」处理——
 * 判不出来就别往商店里塞，肉鸽一局买了拆不掉。
 */
function isSellable(skillId) {
	if (!lib.skill?.[skillId]) {
		return false;
	}
	const filter = lib.filter?.skillDisabled;
	if (typeof filter !== "function") {
		console.error("[rogue] 本体缺少 lib.filter.skillDisabled，按不可上架处理：", skillId);
		return false;
	}
	try {
		return !filter(skillId);
	} catch (error) {
		console.error("[rogue] 技能可用性过滤失败，按不可上架处理：", skillId, error);
		return false;
	}
}

/** 兼容性判定的缓存：一次进店要扫上千条技能定义，源码正则只跑一次。定义被换掉（测试/热更）会自动失效 */
const compatCache = new Map();

/**
 * 这条技能现在**允许进入肉鸽池**吗。
 * 两道关：本体口径（有没有翻译、是不是内部技）+ 肉鸽自己的兼容性/安全校验层
 * （身份/主公、角色专属状态、特殊 mode、全局 UI 与全局变量、副作用明显 —— 见 skillCompat.js）。
 * 作者上架清单与武将技能一视同仁：谁判不过都不进池。
 *
 * 只缓存**兼容性**那一层（它只依赖技能定义，定义不变结果就不变）；
 * 本体口径那一层每次现算——lib.filter.skillDisabled 是可能被别处替换掉的（本体缺陷开关、
 * 其它扩展的过滤器），缓存它会把一次异常当成永久结论。
 */
export function isRogueSkillAllowed(skillId) {
	if (typeof skillId !== "string" || !skillId) {
		return false;
	}
	const def = lib.skill?.[skillId];
	if (!def) {
		return false;
	}
	const cached = compatCache.get(skillId);
	let compatible;
	if (cached && cached.def === def) {
		compatible = cached.compatible;
	} else {
		try {
			compatible = checkRogueSkillCompat(skillId, def).ok;
		} catch (error) {
			console.error("[rogue] 技能兼容性校验失败，按不可上架处理：", skillId, error);
			compatible = false;
		}
		compatCache.set(skillId, { def, compatible });
	}
	if (!compatible) {
		return false;
	}
	return isSellable(skillId);
}

/**
 * 生成商店候选池。
 * 组成：作者上架清单（分包技能） + 全体可选武将的技能。
 * 排除：玩家禁用过的武将的技能，以及这些技能声明过的衍生技——**硬否决**：
 * 只要技能（含衍生技）属于任何一个当前禁将角色，就不进池，即使别的未禁用武将也拥有同一条
 * （扩展里真实存在共享技能，如 atmnianli 六名角色共有、leofenzhan 雷欧与阿斯特拉共有；
 * 以前的「还有别的未禁用武将拥有就继续上架」豁免正是禁将技能漏进商城的根因，已废除）。
 * 本体判为不可选用的技能（没翻译、内部技）与肉鸽兼容性校验不过的技能都不进池；
 * 作者清单在 rogue-data 自检里已经逐条验过存在性，但**一样要过兼容性校验**——
 * 上架清单只说明「作者想卖」，不说明「挂到别人身上安全」。
 * price 只是作者标注位，实际售价由 shop.js 按模式基准价 ±25% 随机生成（闯关恒 50、无尽随 √关增长），floor 取整。
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

	const ids = new Set();
	for (const item of pool) {
		if (item?.id) {
			ids.add(item.id);
		}
	}
	for (const skill of usable) {
		ids.add(skill);
	}
	const list = [];
	for (const id of ids) {
		if (blocked.has(id)) {
			continue;
		}
		if (!isRogueSkillAllowed(id)) {
			continue;
		}
		list.push({ id, price: 100 });
	}
	return list;
}

/**
 * 单条技能的禁将复查：这条技能（或它的衍生技）现在属于某个当前禁将角色吗。
 * getShopPool 是整池生成，这条是「单条技能」口径——读档清洗存档里的旧候选
 * （state.js 的 isSkillAllowed）与购买前最终校验（shop.js 的 checkSkillPurchase）共用，
 * 免得「生成时禁将已生效、存档里的旧候选却绕过禁将」出现两条规则。
 * 禁将名单与 getShopPool 同一份（getBannedCharacterIds），不另立口径。
 */
export function isSkillBlockedByBan(skillId) {
	if (typeof skillId !== "string" || !skillId) {
		return false;
	}
	const banned = getBannedCharacterIds();
	if (!banned.size) {
		return false;
	}
	for (const [id, info] of Object.entries(lib.character ?? {})) {
		if (!banned.has(id)) {
			continue;
		}
		for (const skill of skillsOf(info)) {
			if (skill === skillId) {
				return true;
			}
			if (derivationsOf(skill).includes(skillId)) {
				return true;
			}
		}
	}
	return false;
}
