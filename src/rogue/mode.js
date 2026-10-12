// 奥特之星·肉鸽 模式入口：模式注册、会话启动、页面路由与各流程的编排。
//
// 业务逻辑都搬出去了，本文件只留三件事：
//   1. 模式注册（createModeConfig / registerRogueMode）——本体唯一需要拿到的接口；
//   2. 页面路由（存档页 → 营地 → 商店 / 图鉴 / 事件页）与存档页的增删进档；
//   3. 把 runtime（运行状态）与 flow/*（战斗 / 商店 / 事件 / 结算）接到一起。
// 往里加业务之前先想清楚该进哪个 flow 模块——这个文件不该再长。

import { lib, game, ui } from "../../../../noname.js";

import {
	CHALLENGE_STAGE_LEVELS,
	EXTENSION_NAME,
	MODE_ID,
	MODE_SETTINGS,
	MODE_SPLASH,
	MODE_TRANSLATE,
} from "./config.js";
import { cloneRun, createRun, mergeCollections, setSlot } from "./state.js";
import { CHALLENGE_STAGE_STATE, ensureChallengeStages } from "./enemy.js";
import { checkResult, getRoster, rawAttitude } from "./battle.js";
import { playLobbyBgm } from "./bgm.js";
import { helpers as rogueHelpers, helperTranslate as rogueHelperTranslate } from "./data/skills.js";
import {
	affix as abyssAffixSkills,
	abyssHelperSkills,
	abyssMarkSkill,
	translate as abyssTranslate,
} from "./endless/abyssAffixes.js";
import { closeScreen, showNotice } from "./ui/common.js";
import { renderSlots, showCharacterChoice, showRunModeChoice } from "./ui/slots.js";
import { showHub } from "./ui/hub.js";
import { showResume } from "./ui/result.js";
import { showCollection } from "./ui/collection.js";
import { activeIndex, context, exitToMainScreen, loadSlots, now, persist, skillGate } from "./runtime.js";
import { createShopFlow } from "./flow/shop.js";
import { createEventFlow } from "./flow/event.js";
import { createResultFlow } from "./flow/result.js";
import { createBattleFlow } from "./flow/battle.js";

// ---------------------------------------------------------------- 编排
//
// host 里装的全是本文件里的函数声明（提升过，构造时一定已定义），flow 模块只按需取用，
// 彼此之间不直接 import——这样新增流程不会绕成一张网。

const host = {
	openHub,
	openSlots,
	leaveMode,
};

const shopFlow = createShopFlow(host);
const eventFlow = createEventFlow();
const resultFlow = createResultFlow({ openEventPage: eventFlow.openEventPage });
const battleFlow = createBattleFlow({
	openHub,
	settleVictoryFlow: resultFlow.settleVictoryFlow,
	settleRiftVictory: resultFlow.settleRiftVictory,
	settleDefeatFlow: resultFlow.settleDefeatFlow,
});

const { openShop } = shopFlow;
const { startBattle, startFromSavedBattle, onover } = battleFlow;

// ---------------------------------------------------------------- 页面路由

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
		// 营地也能直接进技能管理页（装备/卸下）：返回键回营地，与从商店进的那条路各回各的
		openSkills: () => shopFlow.openSkills(openHub),
		// 奇物管理页同理：营地进来返回回营地（商店进来仍回商店，由 shopFlow 记住入口）
		openCurios: () => shopFlow.openCurios(openHub),
		openCollection,
		backToSlots: openSlots,
		leaveMode,
	});
}

/** 图鉴页（入口在营地）：展示公有图鉴，只读、不写存档 */
function openCollection() {
	if (!context.run) {
		openSlots();
		return;
	}
	showCollection({
		// 并上本局还没落盘的解锁项：万一某条路径没走 commit，图鉴也不会漏
		collection: mergeCollections(context.collection, context.run.collection),
		back: openHub,
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

function leaveMode() {
	context.index = null;
	context.run = null;
	closeScreen();
	exitToMainScreen();
}

// ---------------------------------------------------------------- 存档页操作

function slotsApi() {
	return {
		slots: context.slots,
		enter(index) {
			const run = cloneRun(context.slots[index], skillGate);
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
				// 打完一场之后的统一收尾：先补没还清的 Boss 惩罚，再处理待处理事件，最后进营地。
				// 两步都只看存档此刻挂着什么，所以中途关游戏回来接上的是没走完的那几步（不重来第二次）
				resultFlow.continueRun(openHub);
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
		/** 闯关历史最高金币/经验（独立存储，删档不清；没通过过就是 null，界面不显示） */
		bestChallenge: context.bestChallenge,
			pickMode(mode) {
				showCharacterChoice({
					pickCharacter(characterId) {
						if (!characterId) {
							return;
						}
						// 闯关新局建好立刻一次性抽出前 10 关的敌方配置并随首存落盘（ensure 只在缺/残缺时生成）；
						// 无尽模式此调用原样返回，不生成任何东西。
						// Boss 战不在这里判定：建局只创建存档，每场战斗的 Boss 判定在 flow/battle.js
						// 创建那一场战斗时各掷一次（BOSS_RUN_RATE），结果写进 currentBattle.isBossBattle。
						const created = createRun(mode, characterId, now());
						const ensured = ensureChallengeStages(created, Math.random);
						const run = ensured.run;
						context.slots = setSlot(context.slots, index, run, now());
						context.run = context.slots[index];
						if (!persist()) {
							return;
						}
						// 配置不足也照样建局（不卡住玩家），但要把话说在前面：否则进到第 N 关才发现开不了战
						if (ensured.status === CHALLENGE_STAGE_STATE.insufficient) {
							showNotice([
								`闯关前 ${CHALLENGE_STAGE_LEVELS} 关的敌方配置不足：当前只有 ${ensured.available} 条可用配置，需要 ${CHALLENGE_STAGE_LEVELS} 条。`,
								"存档已建好，但前 10 关会在开战时提示无法开始；请先补齐 data/challengeStages.js 里的配置。",
							], openHub);
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
	// 恢复必须沿用存档里已保存的敌方阵容：闭包直取 currentBattle.enemies，绝不重掷
	showResume({
		run,
		onResume: () => startFromSavedBattle(run.currentBattle.enemies),
		onBack: openSlots,
	});
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
		context.run = cloneRun(context.slots[index], skillGate);
		if (context.run.currentBattle) {
			askResume(context.run);
			return;
		}
		// 上次打完一场还挂着没走完的收尾（Boss 惩罚没挑完 / 事件没处理）：
		// 优先回到对应页面，欠的东西与定死的结果都从存档原样接上，绝不重新随机、绝不重掷
		resultFlow.continueRun(openHub);
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
		// 只放分包之外的机制技能（属性强化 / 奇物载体 / 深渊词缀与其载体）：模式 content 由本体
		// mixinLibrary 无条件并进 lib.skill，而分包技能已随扩展包注册，再并一遍会逐个触发
		// 本体的 "duplicated skill in extension 奥特之星" 打印并跳过
		skill: { ...rogueHelpers, ...abyssAffixSkills, ...abyssHelperSkills, ...abyssMarkSkill },
		translate: { ...rogueHelperTranslate, ...abyssTranslate },
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
