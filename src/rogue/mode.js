// 奥特之星·肉鸽 模式主体：注册入口、页面路由、存档落盘与战斗编排。
// 数据/逻辑在 state/shop/reward/penalty/battle 里，本文件只负责把它们串起来。

import { lib, game, ui } from "../../../../noname.js";

import {
	BATTLE_STATUS,
	EXTENSION_NAME,
	MODE_ID,
	MODE_SETTINGS,
	MODE_SPLASH,
	MODE_TRANSLATE,
	SKILL_SLOTS,
	SLOT_COUNT,
	STORAGE_KEY,
} from "./config.js";
import { cloneRun, createRun, migrateSlots, setSlot, toSerializable } from "./state.js";
import { buySkill, checkStatUpgrade, rollSkillOffers, upgradeStat } from "./shop.js";
import { settleVictory } from "./reward.js";
import { loseSkill, lowerStat, settleDefeat } from "./penalty.js";
import { beginBattle, checkResult, getRoster, rawAttitude, resolveBattle, rollGroupId } from "./battle.js";
import { skill as rogueSkills, translate as rogueTranslate, helpers as rogueHelpers, helperTranslate as rogueHelperTranslate } from "./data/skills.js";
import { closeScreen, showChoice, showNotice } from "./ui/common.js";
import { renderSlots, showCharacterChoice, showRunModeChoice } from "./ui/slots.js";
import { refreshShop, showHub, showReplace, showShop } from "./ui/hub.js";
import { describeCurrencyChange, showPenaltyChoice, showResult } from "./ui/result.js";

const context = {
	slots: [],
	index: null,
	run: null,
	settled: true,
	battleLive: false,
};

const now = () => Date.now();

function activeIndex() {
	const raw = Number(lib.storage?.rogueActive);
	return Number.isFinite(raw) && raw >= 0 && raw < SLOT_COUNT ? Math.floor(raw) : null;
}

/** 所有会改存档的动作都必须先改内存 run，再走这里落盘 */
function persist() {
	const check = toSerializable(context.slots);
	if (!check.ok) {
		console.error("[rogue] 存档序列化失败", check.error);
		showNotice([`存档数据异常，本次保存已中止：${check.error}`]);
		return false;
	}
	game.save(STORAGE_KEY, check.data);
	game.save("rogueActive", context.index ?? -1);
	return true;
}

function commit() {
	if (context.index !== null && context.run) {
		context.slots = setSlot(context.slots, context.index, context.run, now());
		context.run = context.slots[context.index];
	}
	return persist();
}

function loadSlots() {
	const migrated = migrateSlots(lib.storage?.[STORAGE_KEY]);
	context.slots = migrated.slots;
	return migrated.errors;
}

/** 重载回本模式：directstart 让本体跳过模式选择界面，直接跑我们的 start() */
function reloadNow(toSlots) {
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

// ---------------------------------------------------------------- 页面

function openHub() {
	if (!context.run) {
		openSlots();
		return;
	}
	showHub({
		run: context.run,
		startBattle,
		openShop,
		backToSlots: openSlots,
		leaveMode,
	});
}

function openShop() {
	if (!context.run.shopOffers.length) {
		context.run = { ...context.run, shopOffers: rollSkillOffers(context.run) };
		if (!commit()) {
			return;
		}
	}
	showShop({
		run: context.run,
		getRun: () => context.run,
		checkStatUpgrade: statId => checkStatUpgrade(context.run, statId),
		upgradeStat: upgradeStatFlow,
		buySkill: buySkillFlow,
		backToHub: openHub,
		backToSlots: openSlots,
		leaveMode,
	});
}

function openSlots() {
	context.index = null;
	context.run = null;
	closeScreen();
	renderSlots(slotsApi());
}

function leaveMode() {
	context.index = null;
	context.run = null;
	closeScreen();
	reloadNow(true);
}

// ---------------------------------------------------------------- 战斗

function startBattle() {
	if (context.battleLive) {
		return;
	}
	const run = context.run;
	if (run.currentBattle) {
		startFromSavedGroup(run.currentBattle.groupId);
		return;
	}
	const groupId = rollGroupId(run.level);
	if (!groupId) {
		showNotice(["敌人组合池为空：请检查 data/stages.js 与 data/enemyGroups.js 的配置。"]);
		return;
	}
	const resolved = resolveBattle(run, groupId);
	if (!resolved.ok) {
		showNotice([resolved.error]);
		return;
	}
	// 先写存档再开局：刷新或崩溃后仍会重打同一组敌人，不会重掷
	context.run = { ...run, currentBattle: { groupId, status: BATTLE_STATUS.battle } };
	if (!commit()) {
		return;
	}
	launch(resolved);
}

function startFromSavedGroup(groupId) {
	const resolved = resolveBattle(context.run, groupId);
	if (!resolved.ok) {
		context.run = { ...context.run, currentBattle: null };
		commit();
		showNotice([resolved.error, "已清除该存档的进行中战斗，可重新选择关卡。"], openHub);
		return;
	}
	launch(resolved);
}

/** 建局必须跑在一个活的事件上：gameStart、gameDraw、phaseLoop 都要挂它的子事件 */
function launch(resolved) {
	if (context.battleLive) {
		return;
	}
	closeScreen();
	context.settled = false;
	context.battleLive = true;
	game.no_continue_game = true;
	if (resolved.missing) {
		showNotice([`敌人组合中有 ${resolved.missing} 个角色当前不可用，本关已跳过它们。`]);
	}
	const next = game.createEvent("rogueBattle", false);
	next.setContent(async function (event) {
		await beginBattle(event, context.run, resolved.group);
	});
	game.loop(next);
}

// ---------------------------------------------------------------- 存档页操作

function slotsApi() {
	return {
		slots: context.slots,
		enter(index) {
			const run = cloneRun(context.slots[index]);
			if (!run) {
				return;
			}
			context.index = index;
			context.run = run;
			if (!persist()) {
				return;
			}
			if (run.currentBattle) {
				askResume(run);
			} else {
				openHub();
			}
		},
		remove(index) {
			context.slots = setSlot(context.slots, index, null, now());
			if (context.index === index) {
				context.index = null;
				context.run = null;
			}
			if (!persist()) {
				return;
			}
			openSlots();
		},
		createAt(index) {
			context.index = index;
			context.run = null;
			showRunModeChoice(draftApi(index));
		},
		leaveMode,
	};
}

function draftApi(index) {
	return {
		pickMode(mode) {
			showCharacterChoice({
				pickCharacter(characterId) {
					if (!characterId) {
						return;
					}
					const run = createRun(mode, characterId, now());
					context.slots = setSlot(context.slots, index, run, now());
					context.run = context.slots[index];
					if (!persist()) {
						return;
					}
					openHub();
				},
				cancel: openSlots,
			}, getRoster());
		},
		cancel: openSlots,
	};
}

function askResume(run) {
	showChoice(
		["检测到上次战斗没有正常结算。", "将原样重新挑战同一组敌人：不判定胜利、不补发奖励、也不会跳过本关。"],
		[
			{ label: "重新挑战这一关", onClick: () => startFromSavedGroup(run.currentBattle.groupId) },
			{ label: "返回存档页", onClick: openSlots },
		]
	);
}

// ---------------------------------------------------------------- 商店操作

function applyBuy(offerId, replaceId) {
	const result = buySkill(context.run, offerId, replaceId);
	if (!result.ok) {
		showNotice([result.error], openShop);
		return;
	}
	context.run = result.run;
	if (!commit()) {
		return;
	}
	// 原位刷新：重开商店会把滚动位置甩回顶部，候选上的「已购买」就是反馈
	if (!refreshShop(context.run)) {
		openShop();
	}
}

function buySkillFlow(offerId) {
	if (context.run.skills.length >= SKILL_SLOTS) {
		showReplace({
			run: context.run,
			confirmReplace: (id, removed) => applyBuy(id, removed),
			backToShop: openShop,
		}, offerId);
		return;
	}
	applyBuy(offerId, null);
}

function upgradeStatFlow(statId) {
	const result = upgradeStat(context.run, statId);
	if (!result.ok) {
		showNotice([result.error], openShop);
		return;
	}
	context.run = result.run;
	commit();
	if (!refreshShop(context.run)) {
		openShop();
	}
}

function describeSkill(id) {
	const text = rogueTranslate[id];
	return typeof text === "string" ? text.split("<hr>")[0] : id;
}

function describeStat(statId) {
	const names = { defense: "防御", draw: "过牌", attack: "攻击" };
	return names[statId] ?? statId;
}

// ---------------------------------------------------------------- 结算

/** 本体 game.over 末尾调用（loadMode 会把 game.onover 推进 lib.onover） */
function onover(resultbool) {
	if (context.settled) {
		return;
	}
	context.settled = true;
	context.battleLive = false;
	if (!context.run || !context.run.currentBattle) {
		return;
	}
	if (resultbool === true) {
		settleVictoryFlow();
	} else {
		settleDefeatFlow();
	}
}

function settleVictoryFlow() {
	const result = settleVictory(context.run, now());
	context.run = result.run;
	const lines = ["战斗胜利。", `获得：${describeCurrencyChange({}, result.gained)}`];
	if (result.run.cleared) {
		lines.push(`已通关全部 ${result.run.totalLevels} 关，之后可以重复挑战。`);
	} else {
		lines.push(`下一关：第 ${result.run.level} 关。`);
	}
	lines.push("回到营地后可以进商店消费。");
	commit();
	showResult({ title: "战斗胜利", lines, onDone: () => reloadNow(false) });
}

function settleDefeatFlow() {
	const result = settleDefeat(context.run, now());

	if (result.kind === "delete") {
		const index = context.index;
		if (index !== null) {
			context.slots = setSlot(context.slots, index, null, now());
		}
		context.index = null;
		context.run = null;
		if (!persist()) {
			return;
		}
		showResult({
			title: "无尽模式失败",
			lines: [`存档${(index ?? 0) + 1} 已整个删除，该槽位恢复为空。`, "无尽模式失败不保留任何进度。"],
			onDone: () => reloadNow(true),
		});
		return;
	}

	context.run = result.run;
	if (!commit()) {
		return;
	}

	if (result.kind === "fallback") {
		showPenaltyChoice(result.run, result.fallback, penaltyApi());
		return;
	}

	const lines = ["战斗失败。", "关卡保持不变，可以重新挑战本关。"];
	if (result.kind === "currency") {
		lines.splice(1, 0, `损失：${describeCurrencyChange(result.lost, {})}`);
	} else {
		lines.splice(1, 0, "没有可损失的货币与强化，本次不额外扣除。");
	}
	showResult({ title: "战斗失败", lines, onDone: () => reloadNow(false) });
}

function penaltyApi() {
	return {
		chooseLoseSkill(skillId) {
			const result = loseSkill(context.run, skillId, now());
			if (!result.ok) {
				showNotice([result.error]);
				return;
			}
			context.run = result.run;
			commit();
			showResult({
				title: "战斗失败",
				lines: ["战斗失败。", `已失去技能：${describeSkill(skillId)}。`, "关卡保持不变，可以重新挑战本关。"],
				onDone: () => reloadNow(false),
			});
		},
		chooseLowerStat(statId) {
			const result = lowerStat(context.run, statId, now());
			if (!result.ok) {
				showNotice([result.error]);
				return;
			}
			context.run = result.run;
			commit();
			showResult({
				title: "战斗失败",
				lines: ["战斗失败。", `${describeStat(result.statId)} 由 Lv.${result.from} 降到 Lv.${result.to}。`, "关卡保持不变，可以重新挑战本关。"],
				onDone: () => reloadNow(false),
			});
		},
	};
}

// ---------------------------------------------------------------- 模式入口

async function start() {
	if (!ui.arena) {
		return;
	}
	// 一次 start 就是一次会话：战斗标记从零开始
	context.battleLive = false;
	context.settled = true;
	const errors = loadSlots();
	if (errors.length) {
		// 提示要先被看到再进页面：肉鸽页面是全屏的，会盖住提示框
		showNotice(["存档读取提示：", ...errors], openEntry);
		return;
	}
	openEntry();
}

function openEntry() {
	const index = activeIndex();
	if (index !== null && context.slots[index]) {
		context.index = index;
		context.run = cloneRun(context.slots[index]);
		if (context.run.currentBattle) {
			askResume(context.run);
			return;
		}
		openHub();
		return;
	}

	context.index = null;
	context.run = null;
	openSlots();
}

export function createModeConfig() {
	return {
		name: MODE_ID,
		splash: MODE_SPLASH,
		start,
		game: {
			checkResult,
			onover,
		},
		get: {
			rawAttitude,
		},
		element: {
			player: {
				dieAfter() {
					game.checkResult();
				},
			},
		},
		// 肉鸽原创技能与机制技能随本模式注册；分包技能本体已在扩展层全局注册，这里随池引用一并并入
		skill: { ...rogueSkills, ...rogueHelpers },
		translate: { ...rogueTranslate, ...rogueHelperTranslate },
	};
}

/**
 * 用本体的 addMode 注册肉鸽模式。
 * precontent 每次启动都会跑，而 lib.config.all.mode 每次启动都由本体重建，
 * 因此这里必须自带重复注册防护。
 */
export function registerRogueMode() {
	if (lib.mode?.[MODE_ID]) {
		return false;
	}
	if (typeof game.addMode !== "function") {
		console.warn("[rogue] 当前本体没有 game.addMode，肉鸽模式未注册");
		return false;
	}
	game.addMode(MODE_ID, createModeConfig(), {
		translate: MODE_TRANSLATE,
		config: MODE_SETTINGS,
		extension: EXTENSION_NAME,
	});
	return true;
}
