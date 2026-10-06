// 事件流程：事件页、选项结算、四类交互型选项（流浪商人 / 融合炉 / 技能熔炉 / 深渊裂隙）。
// 事件奖励口径在 eventManager.js，这里只负责「按存档里定死的选项落地 → 落盘 → 弹结果」。
// 裂隙的开打不在本文件：这里只把阵容定死落盘并重载，真正的开局由恢复页在全新会话里做。

import { BATTLE_STATUS } from "../config.js";
import { getCurio, getNextCurioQuality, grantCurioById, upgradeCurio, CURIOSITY_RARITY } from "../curioManager.js";
import { createEnemyConfigs } from "../enemy.js";
import { applyEventCurrency, pickRandomSkillId, resolveEventChoice } from "../eventManager.js";
import { loseSkill } from "../penalty.js";
import { getShopPool } from "../skillPool.js";
import { commit, context, now, reloadNow } from "../runtime.js";
import { closeScreen, showChoice, showNotice, skillName } from "../ui/common.js";
import { showCurioForge, showMerchant, showSkillForge } from "../ui/hub.js";
import { showEvent } from "../ui/event.js";
import { resolveBattle } from "../battle.js";
import { characterSkillIds } from "./shop.js";

export function createEventFlow() {
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
	 * 为什么不能在这一刻直接开局：走到这里时，本体的 `game.over` 已经跑过了
	 * （`_status.over = true`、`ui.clear()`、这一局已被拆掉），而引擎里**没有任何「同一页面里再开一局」
	 * 的先例**——本体所有模式打完一局都走 `game.reload()`。真机症状就是「点了进去、界面没反应、
	 * 存档里却已经躺着这场未结算战斗」（他 2026-10-05 就是这样遇到的）。
	 * 所以这里和其余所有开战路径保持同一个形状：只写存档 + 重载；
	 * 恢复页 → startFromSavedBattle → launch 跑在全新页面上，与「开始下一关」逐字同一条路。
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

	return { openEventPage, chooseEventFlow, confirmRiftFlow, enterRift };
}
