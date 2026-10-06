// 战斗流程：开始一关、恢复未完成战斗、真正开局，以及本体 game.over 的分流。
// 敌方阵容在开战前就定死并落盘（createEnemyConfigs / createStageEnemyConfigs），
// 中途刷新或崩溃后按存档原样重打，绝不重掷。

import { game } from "../../../../../noname.js";

import { BATTLE_STATUS, CHALLENGE_STAGE_LEVELS, RUN_MODE } from "../config.js";
import { CHALLENGE_STAGE_STATE, createEnemyConfigs, createStageEnemyConfigs, ensureChallengeStages } from "../enemy.js";
import { getChallengeStageConfig } from "../data/challengeStages.js";
import { beginBattle, resolveBattle } from "../battle.js";
import { commit, context } from "../runtime.js";
import { playBattleBgm, stopBattleBgm, stopLobbyBgm } from "../bgm.js";
import { closeScreen, showNotice } from "../ui/common.js";

export function createBattleFlow(host) {
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
		// 旧档（v8 之前）没有抽取结果、或结果不完整（1~9 项）时在这里重抽一次并立刻落盘，
		// 之后读档/重进/失败重战都沿用，绝不因重新进入关卡而重新随机；
		// 第 11 关起与无尽模式走原有的按池随机，互不影响。
		const ensured = ensureChallengeStages(run, Math.random);
		run = ensured.run;
		if (ensured.status === CHALLENGE_STAGE_STATE.insufficient) {
			// 配置池可用条目不足 10 个：明确说清楚差几条，而不是循环补齐后让第 N 关和第 M 关撞成同一个人
			showNotice([
				`闯关前 ${CHALLENGE_STAGE_LEVELS} 关的敌方配置不足：当前只有 ${ensured.available} 条可用配置，需要 ${CHALLENGE_STAGE_LEVELS} 条。`,
				"请在 data/challengeStages.js 里补齐配置（或确认配置里的角色 id 都还存在）后再开始本关。",
			]);
			return;
		}
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
			showNotice([resolved.error, "已清除该存档的进行中战斗，可重新开始本关。"], host.openHub);
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
				host.settleRiftVictory(context.run.currentBattle.rift);
			} else {
				host.settleVictoryFlow();
			}
		} else {
			host.settleDefeatFlow();
		}
	}

	return { startBattle, startFromSavedBattle, onover };
}
