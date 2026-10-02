// 奥特之星·肉鸽 模式主体：注册入口、页面路由、存档落盘与战斗编排。
// 数据/逻辑在 state/shop/reward/penalty/battle 里，本文件只负责把它们串起来。

import { lib, game, ui } from "../../../../noname.js";

import {
	BATTLE_STATUS,
	BEST_ENDLESS_KEY,
	EXTENSION_NAME,
	MODE_ID,
	MODE_SETTINGS,
	MODE_SPLASH,
	MODE_TRANSLATE,
	RUN_MODE,
	SKILL_SLOTS,
	SLOT_COUNT,
	STORAGE_KEY,
} from "./config.js";
import { cloneRun, createRun, migrateSlots, normalizeBest, setSlot, toSerializable, updateBest } from "./state.js";
import { buySkill, checkStatUpgrade, rollSkillOffers, upgradeStat } from "./shop.js";
import { getShopPool } from "./skillPool.js";
import { settleVictory } from "./reward.js";
import { loseSkill, lowerStat, settleDefeat } from "./penalty.js";
import { beginBattle, checkResult, getRoster, rawAttitude, resolveBattle, rollGroupId } from "./battle.js";
import { playLobbyBgm, stopLobbyBgm } from "./bgm.js";
import { skill as rogueSkills, translate as rogueTranslate, helpers as rogueHelpers, helperTranslate as rogueHelperTranslate } from "./data/skills.js";
import { closeScreen, showChoice, showNotice, skillName } from "./ui/common.js";
import { renderSlots, showCharacterChoice, showRunModeChoice } from "./ui/slots.js";
import { refreshShop, showHub, showReplace, showShop, showSkills } from "./ui/hub.js";
import { showPenaltyChoice, showResult } from "./ui/result.js";

const context = {
	slots: [],
	index: null,
	run: null,
	/** 无尽模式历史最高记录（独立存储键，删档不清） */
	best: null,
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
	context.best = normalizeBest(lib.storage?.[BEST_ENDLESS_KEY]);
	return migrated.errors;
}

/** 历史最高记录存在独立键上：无尽失败整档删除时不会碰它 */
function saveBest(next) {
	context.best = next;
	game.save(BEST_ENDLESS_KEY, next);
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
	// 营地接着存档页的 BGM 放，不重头来
	playLobbyBgm();
	showHub({
		run: context.run,
		startBattle,
		openShop,
		backToSlots: openSlots,
		leaveMode,
	});
}

/** 只读的技能查看页（入口在商店顶部的「技能 n/3」资源块）：不买卖、不写存档 */
function openSkills() {
	if (!context.run) {
		openSlots();
		return;
	}
	showSkills({
		run: context.run,
		back: openShop,
	});
}

/** 当前角色的原生技能（本体角色数据第 3 项）：商店随机时要排除，免得买到角色自带的技能 */
function characterSkillIds(characterId) {
	const skills = lib.character?.[characterId]?.[3];
	return Array.isArray(skills) ? skills.filter(id => typeof id === "string" && id) : [];
}

function openShop() {
	if (!context.run.shopOffers.length) {
		// 候选池每次进店现算：全体武将的技能，玩家禁用过的武将不会进来
		const characterSkills = characterSkillIds(context.run.characterId);
		context.run = { ...context.run, shopOffers: rollSkillOffers(context.run, undefined, characterSkills, getShopPool()) };
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
		openSkills,
		backToHub: openHub,
		backToSlots: openSlots,
		leaveMode,
	});
}

function openSlots() {
	context.index = null;
	context.run = null;
	closeScreen();
	// 还放着就继续放（删档、从营地返回都是原地重绘，不能把曲子掐回开头）
	playLobbyBgm();
	renderSlots(slotsApi());
}

/**
 * 回到游戏初始界面。
 * 不能直接用 game.reload()：它会顺手写 show_splash_off=true（下次启动不再显示初始界面、直接进本模式），
 * 而这里要的正是初始界面——所以自己清掉 directstart 与 show_splash_off 再重载。
 */
function exitToMainScreen() {
	if (!persist()) {
		return;
	}
	localStorage.removeItem(`${lib.configprefix}directstart`);
	localStorage.removeItem("show_splash_off");
	window.location.reload();
}

function leaveMode() {
	context.index = null;
	context.run = null;
	closeScreen();
	exitToMainScreen();
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
	stopLobbyBgm();
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
		/** 无尽历史最高记录（独立存储，删档不清） */
		best: context.best,
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
	// 刚打赢的那一关要先记下来：胜利结算会把 level 推进到下一关
	const wonLevel = context.run.level;
	const result = settleVictory(context.run, now());
	context.run = result.run;
	if (context.run.mode === RUN_MODE.endless) {
		// 只有真的通关了某一关（不是失败进入的下一关）才更新历史最高
		const best = updateBest(context.best, wonLevel, context.run.characterId, now());
		if (best !== context.best) {
			saveBest(best);
		}
	}
	commit();
	showResult({
		kind: "victory",
		title: "战斗胜利",
		level: wonLevel,
		reward: result.gained,
		nextLevel: result.run.level,
		cleared: !!result.run.cleared,
		totalLevels: result.run.totalLevels,
		onDone: () => reloadNow(false),
	});
}

function settleDefeatFlow() {
	const level = context.run.level;
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
			kind: "endless",
			title: "无尽模式失败",
			level,
			lines: [`存档${(index ?? 0) + 1} 已整个删除，该槽位恢复为空。`, "无尽模式失败不保留任何进度。", "无尽历史最高记录不受影响。"],
			buttonLabel: "返回存档页",
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

	showResult({
		kind: "defeat",
		title: "战斗失败",
		level,
		loss: result.kind === "currency" ? result.lost : null,
		lines: [result.kind === "currency" ? "已按规则扣除上表货币。" : "没有可损失的货币与强化，本次不额外扣除。"],
		onDone: () => reloadNow(false),
	});
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
				kind: "defeat",
				title: "战斗失败",
				level: context.run.level,
				lines: [`已失去技能：${skillName(skillId)}。`],
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
				kind: "defeat",
				title: "战斗失败",
				level: context.run.level,
				lines: [`${describeStat(result.statId)} 由 Lv.${result.from} 降到 Lv.${result.to}。`],
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
