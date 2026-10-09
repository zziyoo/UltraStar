// 结算流程：胜利（含深渊裂隙的独立分支）、失败、失败后的自选惩罚。
// 数值口径在 reward.js / penalty.js，这里只负责「结算 → 落盘 → 弹结算页 → 决定下一步去哪」。

import { RUN_MODE } from "../config.js";
import { settleVictory } from "../reward.js";
import { maybeCreatePendingEvent } from "../eventManager.js";
import { getCurio } from "../data/curios.js";
import { loseRandomCurio, loseRandomSkill, loseSkill, lowerStat, settleDefeat } from "../penalty.js";
import { setSlot, updateBest, updateBestChallenge } from "../state.js";
import { commit, context, now, persist, reloadNow, saveBest, saveBestChallenge } from "../runtime.js";
import { showNotice, skillName } from "../ui/common.js";
import { showPenaltyChoice, showResult } from "../ui/result.js";

function describeStat(statId) {
	const names = { defense: "防御", draw: "过牌", attack: "攻击" };
	return names[statId] ?? statId;
}

export function createResultFlow(host) {
	function settleVictoryFlow() {
		// 刚打赢的那一关要先记下来：胜利结算会把 level 推进到下一关，而事件奖励的
		// 「胜利奖励基准」也按这一关算
		const wonLevel = context.run.level;
		// 通关之后再点「重复挑战」时 cleared 本来就是 true：那些场次一律不算新的通关，
		// 否则反复重打最后一关就能把钱包刷大来灌水记录（用户定稿：只记刚好通过最后一关那一刻，
		// 重复挑战不重复记录）
		const alreadyCleared = !!context.run.cleared;
		const result = settleVictory(context.run, now(), Math.random);
		let run = result.run;
		// Boss 战胜利的强制惩罚：随机失去 1 个已购买技能与 1 件已拥有的奇物（各自没有时安全跳过，
		// 一句「没有可失去的」带过，绝不报错、绝不动角色本体技能与图鉴记录）。
		// 只看「刚刚结束的这一场」是不是 Boss 战（settleVictory 在清掉 currentBattle 之前取出的标记），
		// 所以它每场只生效一次，绝不会误伤下一场普通战斗。落盘随 commit 走
		const penaltyLines = [];
		if (result.isBossBattle) {
			const lostSkill = loseRandomSkill(run, Math.random, now());
			if (lostSkill.ok) {
				run = lostSkill.run;
				penaltyLines.push(`Boss 战的代价：失去技能「${skillName(lostSkill.removed)}」。`);
			} else {
				penaltyLines.push("Boss 战的代价：当前没有已购买技能可失去。");
			}
			const lostCurio = loseRandomCurio(run, Math.random, now());
			if (lostCurio.ok) {
				run = lostCurio.run;
				penaltyLines.push(`Boss 战的代价：失去奇物「${getCurio(lostCurio.removed)?.name ?? lostCurio.removed}」。`);
			} else {
				penaltyLines.push("Boss 战的代价：当前没有奇物可失去。");
			}
		}
		if (run.mode === RUN_MODE.endless) {
			// 只有真的通关了某一关（不是失败进入的下一关）才更新历史最高
			const best = updateBest(context.best, wonLevel, run.characterId, now());
			if (best !== context.best) {
				saveBest(best);
			}
		}
		if (run.mode === RUN_MODE.challenge && run.cleared && !alreadyCleared) {
			// 刚好打通最后一关的这一刻：把此刻手上的金币与经验记进历史最高（两项各取各的最大）
			const best = updateBestChallenge(context.bestChallenge, run.currency, run.characterId, now());
			if (best !== context.bestChallenge) {
				saveBestChallenge(best);
			}
		}
		// 无尽模式按概率触发事件：事件与随机结果在此定死写进存档，中途关游戏也不重掷
		run = maybeCreatePendingEvent(run, wonLevel, now(), Math.random);
		context.run = run;
		commit();
		showResult({
			kind: "victory",
			title: result.isBossBattle ? "Boss 战 · 战斗胜利" : "战斗胜利",
			level: wonLevel,
			reward: result.gained,
			nextLevel: run.level,
			cleared: !!run.cleared,
			totalLevels: run.totalLevels,
			lines: penaltyLines,
			buttonLabel: run.pendingEvent ? "继续" : undefined,
			onDone: afterVictoryResult,
		});
	}

	/** 结算页按钮的下一步：有待处理事件就先进事件页，否则按原样重载回营地 */
	function afterVictoryResult() {
		if (context.run?.pendingEvent) {
			host.openEventPage(() => reloadNow(false));
			return;
		}
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

	return { settleVictoryFlow, settleRiftVictory, settleDefeatFlow, afterVictoryResult };
}
