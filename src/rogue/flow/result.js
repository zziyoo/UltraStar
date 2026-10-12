// 结算流程：胜利（含深渊裂隙的独立分支）、失败、失败后的自选惩罚。
// 数值口径在 reward.js / penalty.js，这里只负责「结算 → 落盘 → 弹结算页 → 决定下一步去哪」。

import { RUN_MODE } from "../config.js";
import { settleVictory } from "../reward.js";
import { maybeCreatePendingEvent } from "../eventManager.js";
import { getCurio } from "../data/curios.js";
import { getBossPenaltyTargets, loseCurio, loseSkill, lowerStat, settleDefeat } from "../penalty.js";
import { setSlot, updateBest, updateBestChallenge } from "../state.js";
import { commit, context, now, persist, reloadNow, saveBest, saveBestChallenge } from "../runtime.js";
import { showNotice, skillName } from "../ui/common.js";
import { showBossPenaltyChoice, showPenaltyChoice, showResult } from "../ui/result.js";

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
		// Boss 战胜利的强制惩罚（v13 起改为**玩家自己挑**）：失去 1 个已购买技能与 1 件已拥有的奇物。
		// 惩罚的数量、奖励倍率与「各自没有时一句『没有可失去的』带过」的既有规则一概不动，
		// 变的只是由谁决定失去哪一个。
		// 只看「刚刚结束的这一场」是不是 Boss 战（settleVictory 在清掉 currentBattle 之前取出的标记），
		// 所以它每场只生效一次，绝不会误伤下一场普通战斗。
		//
		// 这里只挂「还欠哪几项」的状态，一个东西都不删：删除由下面的选择页在玩家点下那一条时一次性提交落盘。
		// 于是中途关游戏 / 刷新 / 重进页面都回到同一张选择页，既不重新随机，也不会重复删除或重复领奖励
		// （胜利奖励已随 settleVictory 落盘，currentBattle 也清空了，下一场是各掷各的）。
		const penaltyLines = [];
		if (result.isBossBattle) {
			const targets = getBossPenaltyTargets(run);
			const needSkill = targets.skills.length > 0;
			const needCurio = targets.curios.length > 0;
			if (needSkill || needCurio) {
				run = { ...run, pendingBossPenalty: { reason: "bossVictory", needSkill, needCurio } };
				penaltyLines.push("Boss 战的代价：接下来由你自己挑出要失去的那一项。");
			} else {
				penaltyLines.push("Boss 战的代价：当前没有已购买技能与奇物可失去。");
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
		const saved = commit();
		// Boss 战胜利且确实欠着惩罚：不再让玩家多点一次结果页，直接把这一场的代价摊开。
		// 跳转的前提是「本场奖励 + 关卡进度 + pendingBossPenalty 已经落盘」——commit 失败时
		// persist() 已经弹了错误提示，这里就停住：欠项还没写进存档，惩罚页点了也白点，
		// 更不能让玩家以为已经付过了。
		// `reward` 只给这一场看（关卡 + 金币/经验），不写存档：读档回到这一页时它不存在，
		// 惩罚页自己会退化成「奖励已入账」那句说明。settleVictory 上面只调用过一次，
		// 这里绝不重复发奖或推关；后面的收尾顺序仍走 continueRun（惩罚 → 待处理事件 → 营地）。
		if (result.isBossBattle && run.pendingBossPenalty) {
			if (saved) {
				afterVictoryResult({ level: wonLevel, gained: result.gained });
			}
			return;
		}
		showResult({
			kind: "victory",
			title: result.isBossBattle ? "Boss 战 · 战斗胜利" : "战斗胜利",
			level: wonLevel,
			reward: result.gained,
			nextLevel: run.level,
			cleared: !!run.cleared,
			totalLevels: run.totalLevels,
			lines: penaltyLines,
			buttonLabel: run.pendingEvent || run.pendingBossPenalty ? "继续" : undefined,
			onDone: afterVictoryResult,
		});
	}

	/**
	 * 一场打完之后的统一收尾顺序：Boss 惩罚（玩家自选）→ 待处理事件 → next。
	 * `next` 由调用方给：胜利流程是「重载回营地」，读档流程是「直接进营地」（没有战斗要收尾）。
	 * 每一步都只看存档此刻挂着什么，所以中途关游戏再进来，接上的仍是没走完的那几步，
	 * 已兑现的惩罚与已处理的事件都不会重来第二次。
	 * `bossReward` 只在「刚打完这一场 Boss 就直接进惩罚页」时传（给那一页显示本场关卡与金币/经验），
	 * 从存档恢复的路径一律不传——惩罚欠什么写在地档里，奖励长什么样不需要重述。
	 */
	function continueRun(next, bossReward) {
		if (context.run?.pendingBossPenalty) {
			openBossPenaltyPage(() => continueRun(next), bossReward);
			return;
		}
		if (context.run?.pendingEvent) {
			host.openEventPage(next);
			return;
		}
		next();
	}

	/** 结算页按钮的下一步：按统一顺序把没收尾的事走完，最后重载回营地 */
	function afterVictoryResult(bossReward) {
		continueRun(() => reloadNow(false), bossReward);
	}

	/**
	 * Boss 惩罚选择页：把「还欠哪几项」摊给玩家，点一张卡就是确认失去、当场落盘。
	 * 名单一律现读存档（不吃渲染时缓存的布尔值），只列这一局真实持有的购买技能与奇物——
	 * 角色本体技能从来不在 `run.skills` 里，所以不可能被误删。
	 * 这一页没有「跳过」：设计不允许绕过惩罚，但也不会卡死——需要的那一项若此刻已无对象
	 * （比如中途被别处扣光），按既有规则就地记为已还清并一句带过，绝不改删另一类的东西。
	 * 中途关游戏 / 刷新：欠的项仍写在存档上，读档由 mode.js 的路由重新回到这一页。
	 */
	function openBossPenaltyPage(onDone, bossReward) {
		const paint = () => {
			const run = context.run;
			const pending = run?.pendingBossPenalty;
			if (!pending) {
				onDone();
				return;
			}
			const targets = getBossPenaltyTargets(run);
			const settled = {
				...pending,
				needSkill: pending.needSkill === true && targets.skills.length > 0,
				needCurio: pending.needCurio === true && targets.curios.length > 0,
			};
			if (!settled.needSkill && !settled.needCurio) {
				context.run = { ...run, pendingBossPenalty: null };
				if (!commit()) {
					return;
				}
				showNotice(["Boss 战的代价已付清。"], onDone);
				return;
			}
			if (settled.needSkill !== pending.needSkill || settled.needCurio !== pending.needCurio) {
				context.run = { ...run, pendingBossPenalty: settled };
				if (!commit()) {
					return;
				}
			}
			const current = context.run;
			showBossPenaltyChoice(current, current.pendingBossPenalty, bossReward, {
				loseSkill: skillId => takeBossPenalty(
					"needSkill",
					() => loseSkill(current, skillId, now()),
					`已失去技能：${skillName(skillId)}。`,
				),
				loseCurio: curioId => takeBossPenalty(
					"needCurio",
					() => loseCurio(current, curioId, now()),
					`已失去奇物：${getCurio(curioId)?.name ?? curioId}。`,
				),
			});
		};
		/** 兑现一项：清掉对应的欠项标记 → 落盘 → 回到这一页接着选，全部还清才交给出口 */
		function takeBossPenalty(kind, apply, line) {
			const result = apply();
			if (!result.ok) {
				showNotice([result.error]);
				return;
			}
			const pending = { ...result.run.pendingBossPenalty };
			pending[kind] = false;
			const remaining = pending.needSkill === true || pending.needCurio === true;
			context.run = { ...result.run, pendingBossPenalty: remaining ? pending : null };
			if (!commit()) {
				return;
			}
			showNotice([line], paint);
		}
		paint();
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

	return { settleVictoryFlow, settleRiftVictory, settleDefeatFlow, afterVictoryResult, continueRun, openBossPenaltyPage };
}
