// 结算流程：胜利（含深渊裂隙的独立分支）、失败、失败后的自选惩罚。
// 数值口径在 reward.js / penalty.js，这里只负责「结算 → 落盘 → 弹结算页 → 决定下一步去哪」。

import { RUN_MODE } from "../config.js";
import { settleVictory } from "../reward.js";
import { maybeCreatePendingEvent } from "../eventManager.js";
import { getCurio } from "../data/curios.js";
import { getBossPenaltyTargets, loseCurio, loseSkill, loseSkills, lowerStat, settleDefeat } from "../penalty.js";
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
		// Boss 战胜利的强制惩罚（v14 起技能部分不再由玩家挑）：
		//   ① 当场失去**全部当前装备的技能**（从背包里一并删除，确实视为失去），空装备时不删任何东西、
		//      也不产生虚假的失去奖励；删除与奖励走 penalty.loseSkills 的统一动作、随下面 commit 一次落盘，
		//      刷新/恢复存档都不会再执行第二次（currentBattle 已在 settleVictory 里清空）；
		//   ② 仍欠的那一项是奇物：有可失去的就挂 pendingBossPenalty（自动进选择页），没有就一句带过。
		// 只看「刚刚结束的这一场」是不是 Boss 战（settleVictory 在清掉 currentBattle 之前取出的标记），
		// 所以它每场只生效一次，绝不会误伤下一场普通战斗。
		const penaltyLines = [];
		if (result.isBossBattle) {
			const equipped = Array.isArray(run.skills) ? run.skills : [];
			// 奖励基准显式传**刚打赢的那一关**（wonLevel）：上面的 settleVictory 已经把 run.level 推进到
			// 下一关，遗石/魔盒若按 run.level 现算就会多发一份「下一关基准」；基准本身也只用基础奖励，
			// 不拿结算里乘过 20 倍/8 倍的 Boss 金币经验（那是另一笔账，绝不重复乘）
			const removal = loseSkills(run, equipped, now(), wonLevel);
			if (removal.ok) {
				run = removal.run;
				penaltyLines.push(`Boss 战的代价：失去了全部 ${removal.removed.length} 个装备技能。`);
				penaltyLines.push(...removal.lines);
			} else {
				penaltyLines.push("Boss 战的代价：当前没有装备技能可失去。");
			}
			const targets = getBossPenaltyTargets(run);
			if (targets.curios.length > 0) {
				run = { ...run, pendingBossPenalty: { reason: "bossVictory", needSkill: false, needCurio: true } };
				penaltyLines.push("Boss 战的代价：接下来由你自己挑出要失去的那件奇物。");
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
		const saved = commit();
		// Boss 战胜利且确实欠着惩罚：不再让玩家多点一次结果页，直接把这一场的代价摊开。
		// 跳转的前提是「本场奖励 + 关卡进度 + pendingBossPenalty 已经落盘」——commit 失败时
		// persist() 已经弹了错误提示，这里就停住：欠项还没写进存档，惩罚页点了也白点，
		// 更不能让玩家以为已经付过了。
		// `reward` 只给这一场看（关卡 + 金币/经验 + 结算行），不写存档：读档回到这一页时它不存在，
		// 惩罚页自己会退化成「奖励已入账」那句说明；结算行带着技能自动清算与奇物折钱的全部账目，
		// 免得自动跳转把「失去了几个技能」「遗忘之石折了多少钱」这类反馈吞掉。
		// settleVictory 上面只调用过一次，这里绝不重复发奖或推关；后面的收尾顺序仍走 continueRun
		// （惩罚 → 待处理事件 → 营地）。
		if (result.isBossBattle && run.pendingBossPenalty) {
			if (saved) {
				afterVictoryResult({ level: wonLevel, gained: result.gained, lines: penaltyLines });
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
	 * Boss 惩罚页（v14）：技能那一半在胜利结算时就自动做完了（失去全部装备技能），
	 * 这一页只剩「从奇物里自己挑一件失去」。名单一律现读存档，只列这一局真实持有的奇物——
	 * 角色本体技能从来不在 run.skills 里，所以不可能被误删。
	 * 这一页没有「跳过」：设计不允许绕过惩罚，但也不会卡死——奇物若此刻已无对象
	 * （比如中途被别处扣光），按既有规则就地记为已还清并一句带过，绝不改删别的东西。
	 * 中途关游戏 / 刷新：欠的项仍写在存档上，读档由 mode.js 的路由重新回到这一页。
	 *
	 * v13 旧档迁移：旧版 pendingBossPenalty.needSkill === true 表示「挑一个技能失去」还没完成。
	 * 这里做**一次性**自动清算：失去当前装备的全部技能（走统一动作，奖励与删除同一次 commit 落盘），
	 * 随即把 needSkill 记为已完成——反复读档、刷新都只执行这一遍，绝不重复清技能、重复发钱；
	 * needSkill === false 的旧档一个字都不追加（那一版技能惩罚早已兑现）。
	 */
	function openBossPenaltyPage(onDone, bossReward) {
		const paint = () => {
			const run = context.run;
			const pending = run?.pendingBossPenalty;
			if (!pending) {
				onDone();
				return;
			}
			if (pending.needSkill === true) {
				// 奖励基准只能取 run.level：v13 旧档没记下刚打赢的那一关（档案里的 level 当时就已推进），
				// 无法可靠还原，这里是唯一一处拿不到 wonLevel 的失去路径（只服务 v13 旧档的一次性迁移）
				const removal = loseSkills(run, Array.isArray(run.skills) ? run.skills : [], now());
				const nextPending = { ...pending, needSkill: false };
				const remaining = nextPending.needCurio === true;
				context.run = {
					...(removal.ok ? removal.run : run),
					pendingBossPenalty: remaining ? nextPending : null,
				};
				if (!commit()) {
					return;
				}
				const lines = removal.ok
					? [`Boss 战的代价：失去了全部 ${removal.removed.length} 个装备技能。`, ...removal.lines]
					: ["Boss 战的代价：当前没有装备技能可失去。"];
				if (remaining) {
					showNotice(lines, paint);
				} else {
					showNotice([...lines, "Boss 战的代价已付清。"], onDone);
				}
				return;
			}
			const targets = getBossPenaltyTargets(run);
			const needCurio = pending.needCurio === true && targets.curios.length > 0;
			if (!needCurio) {
				context.run = { ...run, pendingBossPenalty: null };
				if (!commit()) {
					return;
				}
				showNotice(["Boss 战的代价已付清。"], onDone);
				return;
			}
			if (pending.needCurio !== true) {
				context.run = { ...run, pendingBossPenalty: { ...pending, needCurio: true } };
				if (!commit()) {
					return;
				}
			}
			const current = context.run;
			showBossPenaltyChoice(current, bossReward, {
				loseCurio: curioId => takeBossPenalty(
					() => loseCurio(current, curioId, now()),
					`已失去奇物：${getCurio(curioId)?.name ?? curioId}。`,
				),
			});
		};
		/** 兑现奇物那一项：清掉欠项标记 → 落盘 → 回到这一页；全部付清才交给出口 */
		function takeBossPenalty(apply, line) {
			const result = apply();
			if (!result.ok) {
				showNotice([result.error]);
				return;
			}
			const pending = { ...result.run.pendingBossPenalty, needCurio: false };
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
					lines: [`已失去技能：${skillName(skillId)}。`, ...result.lines],
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
