// 奥特之星·肉鸽 模式主体：注册入口、页面路由、存档落盘与战斗编排。
// 数据/逻辑在 state/shop/reward/penalty/battle 里，本文件只负责把它们串起来。

import { lib, game, ui } from "../../../../noname.js";

import {
	BATTLE_STATUS,
	BEST_ENDLESS_KEY,
	CHALLENGE_STAGE_LEVELS,
	COLLECTION_KEY,
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
import { cloneRun, createRun, mergeCollections, migrateSlots, normalizeBest, normalizeCollection, setSlot, toSerializable, updateBest } from "./state.js";
import { buySkill, checkStatUpgrade, refreshSkillOffers, rollSkillOffers, upgradeStat } from "./shop.js";
import { buyCurio, upgradeCurio, getCurio, getNextCurioQuality, getReplaceRewardGold, grantCurioById, CURIOSITY_RARITY } from "./curioManager.js";
import { getShopPool } from "./skillPool.js";
import { settleVictory } from "./reward.js";
import { applyEventCurrency, maybeCreatePendingEvent, pickRandomSkillId, resolveEventChoice } from "./eventManager.js";
import { loseSkill, lowerStat, settleDefeat } from "./penalty.js";
import { beginBattle, checkResult, getRoster, rawAttitude, resolveBattle } from "./battle.js";
import { createEnemyConfigs, createStageEnemyConfigs, ensureChallengeStages } from "./enemy.js";
import { getChallengeStageConfig } from "./data/challengeStages.js";
import { playBattleBgm, playLobbyBgm, stopBattleBgm, stopLobbyBgm } from "./bgm.js";
import { helpers as rogueHelpers, helperTranslate as rogueHelperTranslate } from "./data/skills.js";
import {
	affix as abyssAffixSkills,
	abyssHelperSkills,
	abyssMarkSkill,
	translate as abyssTranslate,
} from "./endless/abyssAffixes.js";
import { closeScreen, showChoice, showNotice, skillName } from "./ui/common.js";
import { renderSlots, showCharacterChoice, showRunModeChoice } from "./ui/slots.js";
import { refreshCurios, refreshShop, showCurioForge, showCurios, showHub, showMerchant, showReplace, showShop, showSkillForge, showSkills } from "./ui/hub.js";
import { showPenaltyChoice, showResult, showResume } from "./ui/result.js";
import { showEvent } from "./ui/event.js";
import { showCollection } from "./ui/collection.js";

const context = {
	slots: [],
	index: null,
	run: null,
	/** 无尽模式历史最高记录（独立存储键，删档不清） */
	best: null,
	/** 图鉴（独立存储键，六个存档共用一份公有数据，删档与新建都不清） */
	collection: { events: [], curios: [] },
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
	// 图鉴公有：四个解锁点只改 run.collection，并集统一在落盘这里做
	if (context.run) {
		context.collection = mergeCollections(context.collection, context.run.collection);
		game.save(COLLECTION_KEY, context.collection);
	}
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
		openCollection,
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

/** 只读的奇物查看页（入口在商店顶部的「奇物 n」资源块）：不买卖、不写存档 */
function openCurios() {
	if (!context.run) {
		openSlots();
		return;
	}
	showCurios({
		run: context.run,
		getRun: () => context.run,
		upgradeCurio: upgradeCurioFlow,
		back: openShop,
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
		refreshSkills: refreshShopFlow,
		openSkills,
		openCurios,
		buyCurio: buyCurioFlow,
		backToHub: openHub,
		backToSlots: openSlots,
		leaveMode,
	});
}

/**
 * 花一次免费刷新重掷本局商店候选。
 * 检查与扣次数都在 shop.js 的纯函数里；这里只负责「先落盘、再原位刷新」——
 * commit 失败时保持原候选与原次数，不能让 UI 假装刷新成功。
 */
function refreshShopFlow() {
	const run = context.run;
	// 不传 openSkills 之外的回调：浮层里 showNotice 用的是自建弹层，重开商店反而会把滚动位置甩回顶部
	const result = refreshSkillOffers(run, undefined, characterSkillIds(run.characterId), getShopPool());
	if (!result.ok) {
		showNotice([result.error, `本局剩余免费刷新次数：${run.shopRefreshesRemaining}。`]);
		return;
	}
	context.run = result.run;
	if (!commit()) {
		return;
	}
	if (!refreshShop(context.run)) {
		openShop();
	}
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
	let run = context.run;
	if (run.currentBattle) {
		startFromSavedBattle(run.currentBattle.enemies);
		return;
	}
	// 闯关前 10 关：敌人由建局时一次性抽定的关卡配置生成（challengeStages[level-1]）。
	// 旧档（v8 之前）没有抽取结果时在这里补抽一次并立刻落盘，之后读档/重进/失败重战都沿用，
	// 绝不因重新进入关卡而重新随机；第 11 关起与无尽模式走原有的按池随机，互不影响。
	const ensured = ensureChallengeStages(run, Math.random);
	run = ensured.run;
	if (ensured.generated) {
		context.run = run;
		if (!commit()) {
			return;
		}
	}
	const stageConfig = run.mode === RUN_MODE.challenge && run.level <= CHALLENGE_STAGE_LEVELS
		? getChallengeStageConfig(run.challengeStages[run.level - 1])
		: null;
	if (run.mode === RUN_MODE.challenge && run.level <= CHALLENGE_STAGE_LEVELS && !stageConfig) {
		// 抽取结果里出现了配置池中不存在的 id（配置被改/删过）：明确报错，绝不悄悄换人
		showNotice([`第 ${run.level} 关的敌方配置「${run.challengeStages[run.level - 1] ?? "缺失"}」在配置池里已不存在，无法开始本关。请核对 data/challengeStages.js 后再试。`]);
		return;
	}
	// 先把本关敌方阵容（随机角色 + 随机属性分配）定死并写进存档，再开局：
	// 中途刷新/崩溃后按存档原样重打，绝不重掷
	// 经验泉「再饮一口」欠的债在这里兑现：每名敌人追加同样数量的词缀，然后立刻清零
	// （追加走的是与常规随机同一条不放回规则，所以多出来的永远是新的强化）
	const debt = Math.max(0, Math.floor(Number(run.abyssDebt) || 0));
	const enemies = stageConfig
		? createStageEnemyConfigs(stageConfig, run.level, Math.random, { extraAffixes: debt })
		: createEnemyConfigs(run.level, run.mode, Math.random, { extraAffixes: debt });
	if (!enemies.length) {
		showNotice([stageConfig
			? `关卡配置「${stageConfig.id}」没有可用的成员角色，请检查 data/challengeStages.js。`
			: run.mode === RUN_MODE.endless
				? "本体角色池为空：请检查游戏角色数据与禁将配置。"
				: "扩展角色池为空：请检查扩展角色包是否正常注册。"]);
		return;
	}
	// 闯关前 10 关按定稿放行禁将角色（只要角色存在就照打）；其余战斗维持 isEnemyUsable 口径
	const resolved = resolveBattle(run, enemies, stageConfig ? { allowBanned: true } : undefined);
	if (!resolved.ok) {
		showNotice([resolved.error]);
		return;
	}
	context.run = {
		...run,
		currentBattle: { status: BATTLE_STATUS.battle, enemies, rift: null },
		abyssDebt: 0,
	};
	if (!commit()) {
		return;
	}
	launch(resolved);
}

function startFromSavedBattle(enemies) {
	// 恢复战斗沿用存档里已保存的敌方阵容：闭包直取 currentBattle.enemies，绝不重掷。
	// 闯关前 10 关的战斗与开战同一条口径（禁将也照打）；其余战斗维持 isEnemyUsable 判定
	const run = context.run;
	const stageLevel = run.mode === RUN_MODE.challenge && run.level <= CHALLENGE_STAGE_LEVELS;
	const resolved = resolveBattle(run, enemies, { allowBanned: stageLevel });
	if (!resolved.ok) {
		context.run = { ...context.run, currentBattle: null };
		commit();
		showNotice([resolved.error, "已清除该存档的进行中战斗，可重新开始本关。"], openHub);
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
	playBattleBgm();
	closeScreen();
	context.settled = false;
	context.battleLive = true;
	game.no_continue_game = true;
	if (resolved.missing) {
		showNotice([`敌方阵容中有 ${resolved.missing} 个角色当前不可用，本关已跳过它们。`]);
	}
	const next = game.createEvent("rogueBattle", false);
	next.setContent(async function (event) {
		await beginBattle(event, context.run, resolved.enemies);
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
			} else if (run.pendingEvent) {
				// 存档里挂着待处理事件：优先回到事件页（选项与结果都是存档里定死的，不重掷）
				openEventPage(openHub);
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
						// 闯关新局建好立刻一次性抽出前 10 关的敌方配置并随首存落盘（ensure 只在缺的时候生成）；
						// 无尽模式此调用原样返回，不生成任何东西
						const run = ensureChallengeStages(createRun(mode, characterId, now()), Math.random).run;
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
	// 恢复必须沿用存档里已保存的敌方阵容：闭包直取 currentBattle.enemies，绝不重掷
	showResume({
		run,
		onResume: () => startFromSavedBattle(run.currentBattle.enemies),
		onBack: openSlots,
	});
}

// ---------------------------------------------------------------- 商店操作

function applyBuy(offerId, replaceId) {
	const result = buySkill(context.run, offerId, replaceId);
	if (!result.ok) {
		showNotice([result.error], openShop);
		return;
	}
	// 遗忘之石：只有**真的发生了替换**（槽满、老技能让位）才折成金币，空槽直接买一分不给。
	// 被换掉的技能本身没有任何补偿——石头吃的是「遗忘」这件事。
	const stoneGold = result.removed ? getReplaceRewardGold(context.run) : 0;
	context.run = result.run;
	if (stoneGold > 0) {
		context.run = {
			...context.run,
			currency: { ...context.run.currency, gold: (context.run.currency?.gold ?? 0) + stoneGold },
		};
	}
	if (!commit()) {
		return;
	}
	// 原位刷新：重开商店会把滚动位置甩回顶部，候选上的「已购买」就是反馈
	if (!refreshShop(context.run)) {
		openShop();
	}
	if (stoneGold > 0) {
		showNotice([`遗忘之石把忘掉的那门技能折成了 ${stoneGold} 金币。`]);
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

function buyCurioFlow(offerId) {
	const result = buyCurio(context.run, offerId);
	if (!result.ok) {
		showNotice([result.error], undefined);
		return;
	}
	context.run = result.run;
	if (!commit()) {
		return;
	}
	if (!refreshShop(context.run)) {
		openShop();
	}
}

/** 花经验把一件已拥有的奇物升一档；与属性升级同一条「先落盘、再原位刷新」路线 */
function upgradeCurioFlow(curioId) {
	const result = upgradeCurio(context.run, curioId);
	if (!result.ok) {
		showNotice([result.error], undefined);
		return;
	}
	context.run = result.run;
	if (!commit()) {
		return;
	}
	if (!refreshCurios(context.run)) {
		openCurios();
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
	// 胜利结算不切战斗 BGM：让它一路响过结算页，返回营地/下一关时整页重载自然收掉；
	// 失败与无结果仍按原样停止，并还原本体 BGM 音量
	if (resultbool !== true) {
		stopBattleBgm();
	}
	if (!context.run || !context.run.currentBattle) {
		return;
	}
	if (resultbool === true) {
		// 深渊裂隙那一场走独立结算：不算层数、不掷事件、不刷奇物商店
		if (context.run.currentBattle.rift) {
			settleRiftVictory(context.run.currentBattle.rift);
		} else {
			settleVictoryFlow();
		}
	} else {
		settleDefeatFlow();
	}
}

function settleVictoryFlow() {
	// 刚打赢的那一关要先记下来：胜利结算会把 level 推进到下一关，而事件奖励的
	// 「胜利奖励基准」也按这一关算
	const wonLevel = context.run.level;
	const result = settleVictory(context.run, now(), Math.random);
	let run = result.run;
	if (run.mode === RUN_MODE.endless) {
		// 只有真的通关了某一关（不是失败进入的下一关）才更新历史最高
		const best = updateBest(context.best, wonLevel, run.characterId, now());
		if (best !== context.best) {
			saveBest(best);
		}
	}
	// 无尽模式按概率触发事件：事件与随机结果在此定死写进存档，中途关游戏也不重掷
	run = maybeCreatePendingEvent(run, wonLevel, now(), Math.random);
	context.run = run;
	commit();
	showResult({
		kind: "victory",
		title: "战斗胜利",
		level: wonLevel,
		reward: result.gained,
		nextLevel: run.level,
		cleared: !!run.cleared,
		totalLevels: run.totalLevels,
		buttonLabel: run.pendingEvent ? "继续" : undefined,
		onDone: afterVictoryResult,
	});
}

/** 结算页按钮的下一步：有待处理事件就先进事件页，否则按原样重载回营地 */
function afterVictoryResult() {
	if (context.run?.pendingEvent) {
		openEventPage(() => reloadNow(false));
		return;
	}
	reloadNow(false);
}

/**
 * 事件页。onDone 是「事件处理完毕（含读档恢复的场景）」的统一出口：
 * 战斗胜利后的流程重载回营地；读档恢复的流程直接进营地（没有战斗需要收尾）。
 */
function openEventPage(onDone) {
	const finishEvent = () => {
		closeScreen();
		onDone();
	};
	showEvent({
		getRun: () => context.run,
		choose: choiceIndex => chooseEventFlow(choiceIndex, finishEvent),
		// 事件定义缺失时的出口：不传的话那条兜底分支会抛 TypeError
		onDone: finishEvent,
	});
}

/** 玩家在事件页点了某个选项：结算事件奖励并落盘，弹层展示结果后走 finishEvent 出口 */
function chooseEventFlow(choiceIndex, finishEvent) {
	const ctx = {
		characterSkills: characterSkillIds(context.run.characterId),
		candidates: getShopPool(),
	};
	const result = resolveEventChoice(context.run, choiceIndex, ctx, Math.random);
	if (!result.ok) {
		showNotice([result.error]);
		return;
	}
	// 交互型选项：resolveEventChoice 一个钱都没扣、pendingEvent 也还挂着，
	// 全部交给下面的子页面或裂隙战在玩家真选定那一刻才落地
	if (result.action) {
		const choice = context.run.pendingEvent?.choices?.[choiceIndex] ?? null;
		runEventAction(result.action, choice, ctx, finishEvent);
		return;
	}
	context.run = result.run;
	if (!commit()) {
		return;
	}
	const lines = result.lines.slice(0);
	if (result.skillId) {
		lines.push(`获得技能：${skillName(result.skillId)}`);
	}
	showNotice(lines.length ? lines : ["什么也没有发生。"], finishEvent);
}

/** 交互型选项的分发：四类各走一条落地路径，未落地前事件始终挂著 */
function runEventAction(action, choice, ctx, finishEvent) {
	switch (action.kind) {
		case "rift":
			// 裂隙不在这里开打：确认后是「落盘 + 整页重载」，由恢复页在全新会话里开
			confirmRiftFlow(action);
			return;
		case "merchant":
			showMerchant({
				action,
				getRun: () => context.run,
				buy: () => merchantBuyFlow(action, finishEvent),
				leave: finishEvent,
			});
			return;
		case "curioForge":
			showCurioForge({
				getRun: () => context.run,
				// 融合费在事件构建期就定死了，页面只负责显示与判经验够不够，不在这里重算
				action,
				forge: curioId => curioForgeFlow(action, curioId, finishEvent),
				leave: finishEvent,
			});
			return;
		case "skillForge":
			showSkillForge({
				getRun: () => context.run,
				pick: skillId => skillForgeFlow(action, choice, skillId, ctx, finishEvent),
				leave: finishEvent,
			});
			return;
		default:
			// 认不出的 action（理论上读档清洗已经挡掉）就当无事发生，把事件收掉别卡死
			finishEvent();
	}
}

/**
 * 深渊裂隙：先确认再开打——这一场不算入层数，可战败与平常失败同罪（无尽直接删档），
 * 误点的代价太重。「再想想」关掉询问浮层回到事件页，事件原样留着。
 */
function confirmRiftFlow(action) {
	const lines = [
		`裂隙的另一头传来动静：这一场要面对 ${action.enemies} 名敌人。`,
		action.affixes > 0 ? `且每名敌人额外自带 ${action.affixes} 个深渊强化（第 31 层以下也给）。` : "",
		`胜利可得 ${action.gold} 金币与 ${action.exp} 经验；这一场不计入关卡层数，也不会触发事件与奇物商店。`,
		"战败的处理与普通战败完全一样——无尽模式下本存档会被整个删除。",
	];
	showChoice(lines.filter(line => line), [
		{ label: "进去", onClick: () => enterRift(action) },
		{ label: "再想想", onClick: () => {} },
	]);
}

/**
 * 进入深渊裂隙：**先把阵容定死落盘，再整页重载**，由读档恢复页接着开打。
 *
 * 为什么不能在这一刻直接 `launch()`：走到这里时，本体的 `game.over` 已经跑过了
 * （`_status.over = true`、`ui.clear()`、这一局已被拆掉），而引擎里**没有任何「同一页面里再开一局」
 * 的先例**——本体所有模式打完一局都走 `game.reload()`。真机症状就是「点了进去、界面没反应、
 * 存档里却已经躺着这场未结算战斗」（他 2026-10-05 就是这样遇到的）。
 * 所以这里和其余所有开战路径保持同一个形状：只写存档 + 重载；
 * 恢复页 → `startFromSavedBattle` → `launch()` 跑在全新页面上，与「开始下一关」逐字同一条路。
 *
 * 经验泉欠的债照样在这一场兑现（它就是「下一场战斗」），一并清零。
 */
function enterRift(action) {
	const run = context.run;
	const debt = Math.max(0, Math.floor(Number(run.abyssDebt) || 0));
	const enemies = createEnemyConfigs(action.level, run.mode, Math.random, {
		enemies: action.enemies,
		extraAffixes: action.affixes + debt,
	});
	if (!enemies.length) {
		showNotice(["本体角色池为空：请检查游戏角色数据与禁将配置。"]);
		return;
	}
	const resolved = resolveBattle(run, enemies);
	if (!resolved.ok) {
		showNotice([resolved.error]);
		return;
	}
	context.run = {
		...run,
		pendingEvent: null,
		abyssDebt: 0,
		currentBattle: {
			status: BATTLE_STATUS.battle,
			enemies,
			rift: { level: action.level, enemies: action.enemies, affixes: action.affixes + debt, gold: action.gold, exp: action.exp },
		},
	};
	reloadNow(false);
}

/**
 * 裂隙战的独立结算。与 settleVictoryFlow 刻意不同，这里只发事件里定死的倍率奖励，
 * 其它「胜利该做的事」一件都不做：不推进关卡、不掷事件、不刷奇物商店、
 * 不算任何其它奇物的胜利加成（幸运石/诅咒金币/储蓄罐/黄金罗盘），也不写无尽历史最高。
 * 事件说清楚了「不嵌套、不重叠」，所以这条分支绝不能改成调 settleVictory。
 */
function settleRiftVictory(rift) {
	const run = context.run;
	const gained = { gold: Math.max(0, rift.gold || 0), exp: Math.max(0, rift.exp || 0) };
	const next = {
		...run,
		currency: {
			...run.currency,
			gold: (run.currency?.gold ?? 0) + gained.gold,
			exp: (run.currency?.exp ?? 0) + gained.exp,
		},
		currentBattle: null,
		updatedAt: now(),
	};
	context.run = next;
	commit();
	showResult({
		kind: "victory",
		title: "深渊裂隙 · 战斗胜利",
		level: rift.level,
		reward: gained,
		nextLevel: next.level,
		cleared: !!next.cleared,
		totalLevels: next.totalLevels,
		lines: ["这一场不计入关卡层数，也没有触发事件与奇物商店。"],
		onDone: () => reloadNow(false),
	});
}

/**
 * 流浪商人成交：付金币，拿到那件奇物。
 * 与奇物商店的区别照规格落地——允许买已经拥有的，买完是把**那一件升一级**而不是多一件。
 * 已拥有且已到最高档：这是「没有可作用的对象」，所以照常可点、只弹一句，金币一个不动。
 */
function merchantBuyFlow(action, finishEvent) {
	const run = context.run;
	const def = getCurio(action.curioId);
	if (!def) {
		showNotice(["那件东西已经不见了。"], finishEvent);
		return;
	}
	const owned = (run.curios ?? []).includes(action.curioId);
	const next = owned ? getNextCurioQuality(action.curioId, run.curioQuality) : null;
	if (owned && !next) {
		showNotice([`${def.name} 最好的那件他已经卖给你了，这一笔做不成。`]);
		return;
	}
	if ((run.currency?.gold ?? 0) < action.price) {
		showNotice(["金币不足，商人摊开的手掌合上了。"]);
		return;
	}
	let settled = {
		...run,
		currency: { ...run.currency, gold: (run.currency.gold ?? 0) - action.price },
	};
	const lines = [`金币 -${action.price}`];
	if (owned) {
		settled = { ...settled, curioQuality: { ...(settled.curioQuality ?? {}) } };
		settled.curioQuality[action.curioId] = next;
		lines.unshift(`${def.name} 品质升为${CURIOSITY_RARITY[next] ?? next}`);
	} else {
		const granted = grantCurioById(settled, action.curioId);
		if (!granted.ok) {
			showNotice([granted.error]);
			return;
		}
		settled = granted.run;
		lines.unshift(`获得奇物：${def.name}`);
	}
	context.run = { ...settled, pendingEvent: null };
	if (!commit()) {
		return;
	}
	showNotice(lines, finishEvent);
}

/** 奇物融合炉：选一件已拥有的奇物，付事件里定死的那笔经验，品质直接升一级 */
function curioForgeFlow(action, curioId, finishEvent) {
	const result = upgradeCurio(context.run, curioId, action.costExp);
	if (!result.ok) {
		showNotice([result.error]);
		return;
	}
	const def = getCurio(curioId);
	const name = def?.name ?? curioId;
	context.run = { ...result.run, pendingEvent: null };
	if (!commit()) {
		return;
	}
	showNotice([
		`融合成功：${name} 品质升为${CURIOSITY_RARITY[result.to] ?? result.to}`,
		`经验 -${result.cost}`,
	], finishEvent);
}

/**
 * 技能熔炉：先失去选定的那一个技能，再按档位补奖励。
 * 经验走 applyEventCurrency（与事件结算同一份口径），换技能走 pickRandomSkillId
 * （与事件奖励「随机给技能」同一条排除规则），两处都不另起炉灶，免得数字漂移。
 */
function skillForgeFlow(action, choice, skillId, ctx, finishEvent) {
	const lost = loseSkill(context.run, skillId, now());
	if (!lost.ok) {
		showNotice([lost.error]);
		return;
	}
	let run = lost.run;
	const lines = [`失去技能：${skillName(skillId)}`];
	if (action.grant === "skill") {
		const picked = pickRandomSkillId(run, ctx, Math.random);
		if (picked) {
			run = { ...run, skills: [...(run.skills ?? []), picked] };
			lines.push(`获得技能：${skillName(picked)}`);
		} else {
			lines.push("没有可学的技能，炉子只吞了不放。");
		}
	} else {
		const credited = applyEventCurrency(run, choice?.reward ?? {}, true);
		run = credited.run;
		lines.push(...credited.lines);
	}
	context.run = { ...run, pendingEvent: null };
	if (!commit()) {
		return;
	}
	showNotice(lines, finishEvent);
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
		if (context.run.pendingEvent) {
			// 上次胜利后挂着的事件还没处理：优先恢复事件页（绝不重新触发、绝不重掷）
			openEventPage(openHub);
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
