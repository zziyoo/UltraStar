// 战斗流程：开始一关、恢复未完成战斗、真正开局，以及本体 game.over 的分流。
// 敌方阵容在开战前就定死并落盘（createEnemyConfigs / createStageEnemyConfigs），
// 中途刷新或崩溃后按存档原样重打，绝不重掷。

import { game } from "../../../../../noname.js";

import { BATTLE_STATUS, BOSS_RUN_RATE, CHALLENGE_COMBO_LEVELS, CHALLENGE_STAGE_LEVELS, CHALLENGE_TOTAL_LEVELS, RUN_MODE } from "../config.js";
import {
	CHALLENGE_STAGE_STATE,
	createBossEnemyConfig,
	createChallengeComboConfigs,
	createEnemyConfigs,
	createStageEnemyConfigs,
	ensureChallengeComboStages,
	ensureChallengeStages,
} from "../enemy.js";
import { getChallengeStageConfig } from "../data/challengeStages.js";
import { getChallengeComboConfig } from "../data/challengeCombos.js";
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
		// 每一场新战斗独立掷一次（BOSS_RUN_RATE，约 5%）：能走到这里说明 run.currentBattle 是空的
		// （有未完成战斗在上面已分流去恢复，绝不重掷），所以这一掷只属于即将创建的这一场。
		// 结果写进 currentBattle.isBossBattle、与敌方阵容同一次落盘：无尽每推进一关、闯关每一关
		// 都是各掷各的，既不因上一场抽中而连续锁定 Boss，也不因之前没抽中而提高概率。
		const isBossBattle = Math.random() < BOSS_RUN_RATE;
		// 抽中 Boss：本关替换为单 Boss 阵容，不走关卡配置池 / 双人组合池
		// （那些表在这一场里用不上，也不必因配置不足拦住 Boss 战）。
		// 阵容在开战前定死并随 currentBattle 落盘，中途刷新/崩溃后恢复、失败后重战都原样重打，绝不重掷
		if (isBossBattle) {
			const bossLevel = Math.max(1, Math.floor(Number(run.level) || 0));
			// 经验泉「再饮一口」欠的债照常兑现，随后清零（与普通关同一条纪律）
			const debt = Math.max(0, Math.floor(Number(run.abyssDebt) || 0));
			const enemies = createBossEnemyConfig(bossLevel, run.mode, Math.random, { extraAffixes: debt });
			if (!enemies.length) {
				showNotice([run.mode === RUN_MODE.endless
					? "本体角色池为空：请检查游戏角色数据与禁将配置。"
					: "扩展角色池为空：请检查扩展角色包是否正常注册。"]);
				return;
			}
			// Boss 从非禁将池抽出，走 isEnemyUsable 口径（不传 allowBanned）
			const resolvedBoss = resolveBattle(run, enemies);
			if (!resolvedBoss.ok) {
				showNotice([resolvedBoss.error]);
				return;
			}
			context.run = {
				...run,
				currentBattle: { status: BATTLE_STATUS.battle, enemies, rift: null, isBossBattle: true },
				abyssDebt: 0,
			};
			if (!commit()) {
				return;
			}
			launch(resolvedBoss);
			return;
		}
		// 闯关前 10 关：敌人由建局时一次性抽定的关卡配置生成（challengeStages[level-1]）。
		// 旧档（v8 之前）没有抽取结果、或结果不完整（1~9 项）时在这里重抽一次并立刻落盘，
		// 之后读档/重进/失败重战都沿用，绝不因重新进入关卡而重新随机；
		// 无尽模式此调用原样返回，不生成任何东西。
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
		// 闯关 11~30 关：双人组合（challengeComboStages，存档 v10）。首次进入这个区间时一次性
		// 抽出 10 个组合并立刻落盘；第 11~20 关按位使用，第 21~30 关复用同一结果加随机第三人。
		// 旧档已进入 11~30 关但缺字段的，在这里补抽一次，之后绝不重掷。
		const ensuredCombos = ensureChallengeComboStages(run, Math.random);
		run = ensuredCombos.run;
		if (ensuredCombos.status === CHALLENGE_STAGE_STATE.insufficient) {
			showNotice([
				`闯关第 ${CHALLENGE_STAGE_LEVELS + 1}~${CHALLENGE_STAGE_LEVELS + CHALLENGE_COMBO_LEVELS} 关的敌方组合不足：当前只有 ${ensuredCombos.available} 条可用组合，需要 ${CHALLENGE_COMBO_LEVELS} 条。`,
				"请在 data/challengeCombos.js 里补齐组合（或确认组合里的角色 id 都还存在）后再开始本关。",
			]);
			return;
		}
		if (ensuredCombos.generated) {
			context.run = run;
			if (!commit()) {
				return;
			}
		}
		const level = Math.floor(Number(run.level) || 0);
		// 前两种是固定关卡配置（前 10 关 single 配置 / 11~30 关双人组合），只有都不是时才走普通随机
		const stageConfig = run.mode === RUN_MODE.challenge && level <= CHALLENGE_STAGE_LEVELS
			? getChallengeStageConfig(run.challengeStages[level - 1])
			: null;
		if (run.mode === RUN_MODE.challenge && level <= CHALLENGE_STAGE_LEVELS && !stageConfig) {
			// 抽取结果里出现了配置池中不存在的 id（配置被改/删过）：明确报错，绝不悄悄换人
			showNotice([`第 ${level} 关的敌方配置「${run.challengeStages[level - 1] ?? "缺失"}」在配置池里已不存在，无法开始本关。请核对 data/challengeStages.js 后再试。`]);
			return;
		}
		// 第 N 关（11~30）对应 challengeComboStages 的第 (N-11) % 10 项：11~20 顺次用完 10 个，
		// 21~30 再从第 0 项开始复用（第 21 关 = 第 11 关的组合 + 第三人，以此类推）
		const comboConfig = run.mode === RUN_MODE.challenge && level > CHALLENGE_STAGE_LEVELS && level <= CHALLENGE_TOTAL_LEVELS
			? getChallengeComboConfig(run.challengeComboStages[(level - 1 - CHALLENGE_STAGE_LEVELS) % CHALLENGE_COMBO_LEVELS])
			: null;
		if (run.mode === RUN_MODE.challenge && level > CHALLENGE_STAGE_LEVELS && level <= CHALLENGE_TOTAL_LEVELS && !comboConfig) {
			showNotice([`第 ${level} 关的敌方组合「${run.challengeComboStages[(level - 1 - CHALLENGE_STAGE_LEVELS) % CHALLENGE_COMBO_LEVELS] ?? "缺失"}」在组合池里已不存在，无法开始本关。请核对 data/challengeCombos.js 后再试。`]);
			return;
		}
		// 先把本关敌方阵容（随机角色 + 随机属性分配）定死并写进存档，再开局：
		// 中途刷新/崩溃后按存档原样重打，绝不重掷
		// 经验泉「再饮一口」欠的债在这里兑现：每名敌人追加同样数量的词缀，然后立刻清零
		// （追加走的是与常规随机同一条不放回规则，所以多出来的永远是新的强化）
		const debt = Math.max(0, Math.floor(Number(run.abyssDebt) || 0));
		let enemies;
		if (stageConfig) {
			enemies = createStageEnemyConfigs(stageConfig, level, Math.random, { extraAffixes: debt });
		} else if (comboConfig) {
			if (level > CHALLENGE_STAGE_LEVELS + CHALLENGE_COMBO_LEVELS) {
				// 21~30 关：双人组合 + 扩展池随机第三人（第三人随 currentBattle.enemies 一起落盘）
				const built = createChallengeComboConfigs(comboConfig, level, Math.random, { extraAffixes: debt });
				if (!built.ok) {
					// 没有合法第三人：明确阻止本关开始，而不是偷偷复制固定角色凑数
					showNotice([`第 ${level} 关无法生成第三人：${built.error}`]);
					return;
				}
				enemies = built.enemies;
			} else {
				enemies = createStageEnemyConfigs(comboConfig, level, Math.random, { extraAffixes: debt });
			}
		} else {
			enemies = createEnemyConfigs(level, run.mode, Math.random, { extraAffixes: debt });
		}
		if (!enemies.length) {
			showNotice([stageConfig
				? `关卡配置「${stageConfig.id}」没有可用的成员角色，请检查 data/challengeStages.js。`
				: comboConfig
					? `敌方组合「${comboConfig.id}」没有可用的成员角色，请检查 data/challengeCombos.js。`
					: run.mode === RUN_MODE.endless
						? "本体角色池为空：请检查游戏角色数据与禁将配置。"
						: "扩展角色池为空：请检查扩展角色包是否正常注册。"]);
			return;
		}
		// 固定关卡配置（前 10 关与 11~30 关组合）按定稿放行禁将角色（只要角色存在就照打）；
		// 其余战斗维持 isEnemyUsable 口径
		const resolved = resolveBattle(run, enemies, stageConfig || comboConfig ? { allowBanned: true } : undefined);
		if (!resolved.ok) {
			showNotice([resolved.error]);
			return;
		}
		context.run = {
			...run,
			// 普通战斗也显式记下「本场不是 Boss 战」，绝不沿用上一场的状态
			currentBattle: { status: BATTLE_STATUS.battle, enemies, rift: null, isBossBattle: false },
			abyssDebt: 0,
		};
		if (!commit()) {
			return;
		}
		launch(resolved);
	}

	function startFromSavedBattle(enemies) {
		// 恢复战斗沿用存档里已保存的敌方阵容：闭包直取 currentBattle.enemies，绝不重掷。
		// 闯关全程（前 10 关卡配置 + 11~30 关固定组合）都与开战同一条口径（禁将也照打）；
		// 其余战斗维持 isEnemyUsable 判定
		const run = context.run;
		const fixedLevel = run.mode === RUN_MODE.challenge && run.level <= CHALLENGE_TOTAL_LEVELS;
		const resolved = resolveBattle(run, enemies, { allowBanned: fixedLevel });
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
