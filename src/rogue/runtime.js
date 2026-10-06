// 肉鸽运行状态控制：会话内存态（六个存档槽 / 当前 run / 图鉴 / 无尽与闯关的历史最高）与落盘。
// 从 mode.js 拆出来的唯一目的就是让 mode.js 不再往里堆业务——这里不碰页面、不碰战斗。
// 所有会改存档的动作都遵守同一条纪律：先改内存里的 context.run，再走 commit() 落盘。

import { lib, game } from "../../../../noname.js";

import { BEST_CHALLENGE_KEY, BEST_ENDLESS_KEY, COLLECTION_KEY, SLOT_COUNT, STORAGE_KEY } from "./config.js";
import { mergeCollections, migrateSlots, normalizeBest, normalizeBestChallenge, normalizeCollection, setSlot, toSerializable } from "./state.js";
import { isRogueSkillAllowed } from "./skillPool.js";
import { showNotice } from "./ui/common.js";

export const context = {
	slots: [],
	index: null,
	run: null,
	/** 无尽模式历史最高记录（独立存储键，删档不清） */
	best: null,
	/** 闯关模式历史最高金币/经验记录（独立存储键，删档不清） */
	bestChallenge: null,
	/** 图鉴（独立存储键，六个存档共用一份公有数据，删档与新建都不清） */
	collection: { events: [], curios: [] },
	settled: true,
	battleLive: false,
};

export const now = () => Date.now();

/**
 * 技能合法性闸门：shop.js / state.js 都是纯逻辑，读不到本体的 lib.skill，
 * 「这条技能现在还允许进肉鸽池吗」由这里统一喂进去——读档清洗、购买前校验都用它，
 * 任何一处漏判都会被另一处补上。
 */
export const skillGate = { isSkillAllowed: id => isRogueSkillAllowed(id) };

export function activeIndex() {
	const raw = Number(lib.storage?.rogueActive);
	return Number.isFinite(raw) && raw >= 0 && raw < SLOT_COUNT ? Math.floor(raw) : null;
}

/** 所有会改存档的动作都必须先改内存 run，再走这里落盘 */
export function persist() {
	const check = toSerializable(context.slots);
	if (!check.ok) {
		console.error("[rogue] 存档序列化失败", check.error);
		showNotice([`存档数据异常，本次保存已中止：${check.error}`]);
		return false;
	}
	game.save(STORAGE_KEY, check.data);
	game.save("rogueActive", context.index ?? -1);
	// 图鉴公有：四个解锁点只改 run.collection，并集统一在落盘这里做
	if (context.run) {
		context.collection = mergeCollections(context.collection, context.run.collection);
		game.save(COLLECTION_KEY, context.collection);
	}
	return true;
}

export function commit() {
	if (context.index !== null && context.run) {
		context.slots = setSlot(context.slots, context.index, context.run, now());
		context.run = context.slots[context.index];
	}
	return persist();
}

export function loadSlots() {
	const migrated = migrateSlots(lib.storage?.[STORAGE_KEY], skillGate);
	context.slots = migrated.slots;
	context.best = normalizeBest(lib.storage?.[BEST_ENDLESS_KEY]);
	context.bestChallenge = normalizeBestChallenge(lib.storage?.[BEST_CHALLENGE_KEY]);
	// 一次性迁移：把各存档原本自带的图鉴并进公有键，老玩家升级后不会看着收集清零
	let merged = normalizeCollection(lib.storage?.[COLLECTION_KEY]);
	for (const slot of context.slots) {
		merged = mergeCollections(merged, slot?.collection);
	}
	context.collection = merged;
	game.save(COLLECTION_KEY, merged);
	return migrated.errors;
}

/** 历史最高记录存在独立键上：无尽失败整档删除时不会碰它 */
export function saveBest(next) {
	context.best = next;
	game.save(BEST_ENDLESS_KEY, next);
}

/** 闯关的历史最高金币/经验：同样存在独立键上，删档与新建存档都不清它 */
export function saveBestChallenge(next) {
	context.bestChallenge = next;
	game.save(BEST_CHALLENGE_KEY, next);
}

/** 重载回本模式：directstart 让本体跳过模式选择界面，直接跑我们的 start() */
export function reloadNow(toSlots) {
	if (!commit()) {
		return;
	}
	if (toSlots) {
		game.save("rogueActive", -1);
		localStorage.removeItem(`${lib.configprefix}directstart`);
	} else {
		localStorage.setItem(`${lib.configprefix}directstart`, true);
	}
	game.reload();
}

/**
 * 回到游戏初始界面。
 * 不能直接用 game.reload()：它会顺手写 show_splash_off=true（下次启动不再显示初始界面、直接进本模式），
 * 而这里要的正是初始界面——所以自己清掉 directstart 与 show_splash_off 再重载。
 */
export function exitToMainScreen() {
	if (!persist()) {
		return;
	}
	localStorage.removeItem(`${lib.configprefix}directstart`);
	localStorage.removeItem("show_splash_off");
	window.location.reload();
}
