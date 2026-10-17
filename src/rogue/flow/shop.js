// 商店流程：技能商店、技能管理页、奇物页、买技能、刷候选、升属性、买卖与升级奇物。
// 纯数据判定在 shop.js / curioManager.js，这里只负责「算 → 落盘 → 原位刷新 UI」这条固定路线。
// 跨模块回调（回营地、回存档页、离开模式）由 mode.js 通过 host 注入。

import { lib } from "../../../../../noname.js";

import { RUN_MODE, SKILL_SLOTS } from "../config.js";
import { buySkill, checkStatUpgrade, equipSkill, refreshSkillOffers, rollSkillOffers, unequipSkill, upgradeStat } from "../shop.js";
import { buyCurio, upgradeCurio, getSkillLossRewardGold, getSkillLossRewardExp, toggleShopLock } from "../curioManager.js";
import { getShopPool } from "../skillPool.js";
import { commit, context, skillGate } from "../runtime.js";
import { showNotice } from "../ui/common.js";
import { refreshCurios, refreshShop, refreshSkills, showReplace, showShop, showCurios, showSkills } from "../ui/hub.js";

/** 当前角色的原生技能（本体角色数据第 3 项）：商店随机时要排除，免得买到角色自带的技能 */
export function characterSkillIds(characterId) {
	const skills = lib.character?.[characterId]?.[3];
	return Array.isArray(skills) ? skills.filter(id => typeof id === "string" && id) : [];
}

export function createShopFlow(host) {
	/** 商店本体：候选为空时现算一批并落盘，再交给 ui/hub 画 */
	function openShop() {
		if (!context.run.shopOffers.length) {
			// 候选池每次进店现算：全体武将的技能 + 作者上架清单，玩家禁用过的武将不会进来
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
			toggleLock: toggleLockFlow,
			openSkills,
			// 显式钉住商店入口的返回键：奇物页的返回去处按入口记，别把营地进来的那条带过来
			openCurios: () => openCurios(openShop),
			buyCurio: buyCurioFlow,
			backToHub: host.openHub,
			backToSlots: host.openSlots,
			leaveMode: host.leaveMode,
		});
	}

	/**
	 * 技能页（入口在商店顶部的「技能」资源块与营地）。
	 *   · 无尽：技能管理页，装备 / 卸下已拥有的技能——换装只改 run.skills，
	 *     背包（skillInventory）不动，也绝不算「失去技能」（不触发遗忘之石/贪食魔盒）。
	 *   · 闯关：只读技能栏（旧版机制），没有背包、没有装备/卸下按钮。
	 * 与奇物管理页同一条路线：先改内存 run → 落盘 → 原位重绘。
	 * @param {Function} [back] 返回键的去处；商店进来回商店，营地进来回营地
	 */
	function openSkills(back) {
		if (!context.run) {
			host.openSlots();
			return;
		}
		showSkills({
			run: context.run,
			getRun: () => context.run,
			setEquipped: context.run.mode === RUN_MODE.endless ? setSkillEquippedFlow : null,
			back: typeof back === "function" ? back : openShop,
		});
	}

	/**
	 * 奇物管理页（入口在商店顶部的「奇物 n」资源块与营地）：查看已拥有的奇物并花经验升品质。
	 * 与技能管理页同一条路线：先改内存 run → 落盘 → 原位重绘；只看不点一个字节都不写。
	 * @param {Function} [back] 返回键的去处；商店进来回商店，营地进来回营地。
	 *   记住上一次的去处：升级后原位刷新失败要整页重绘时，仍回同一个地方
	 */
	let curioBack = openShop;
	function openCurios(back) {
		if (typeof back === "function") {
			curioBack = back;
		}
		if (!context.run) {
			host.openSlots();
			return;
		}
		showCurios({
			run: context.run,
			getRun: () => context.run,
			upgradeCurio: upgradeCurioFlow,
			back: curioBack,
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

	/**
	 * 装备 / 卸下：纯判定在 shop.js 的 equipSkill / unequipSkill，这里只负责落盘与原位刷新。
	 * 失败只弹一句、零副作用；成功即 commit，然后优先原位重绘管理页（重开会把滚动位置甩回顶部）。
	 */
	function setSkillEquippedFlow(skillId, equipped) {
		const result = equipped ? equipSkill(context.run, skillId) : unequipSkill(context.run, skillId);
		if (!result.ok) {
			showNotice([result.error]);
			return;
		}
		context.run = result.run;
		if (!commit()) {
			return;
		}
		if (!refreshSkills(context.run)) {
			openSkills();
		}
	}

	function applyBuy(offerId, replaceId = null) {
		// skillGate 一起传下去：购买前做最终技能合法性校验，存档里的过期候选买不动
		const result = buySkill(context.run, offerId, replaceId, skillGate);
		if (!result.ok) {
			showNotice([result.error], openShop);
			return;
		}
		// 遗忘之石（金币）与贪食魔盒（经验）：只有闯关满槽、真的换下一个旧技能时才结账；
		// 无尽购买只进背包、不产生替换，因此这两笔恒为 0。
		const stoneGold = result.removed ? getSkillLossRewardGold(context.run) : 0;
		const boxExp = result.removed ? getSkillLossRewardExp(context.run) : 0;
		context.run = result.run;
		if (stoneGold > 0 || boxExp > 0) {
			context.run = {
				...context.run,
				currency: {
					...context.run.currency,
					gold: (context.run.currency?.gold ?? 0) + stoneGold,
					exp: (context.run.currency?.exp ?? 0) + boxExp,
				},
			};
		}
		if (!commit()) {
			return;
		}
		// 原位刷新：重开商店会把滚动位置甩回顶部，候选上的「已购买」就是反馈
		if (!refreshShop(context.run)) {
			openShop();
		}
		const notices = [];
		if (stoneGold > 0) {
			notices.push(`遗忘之石把忘掉的那门技能折成了 ${stoneGold} 金币。`);
		}
		if (boxExp > 0) {
			notices.push(`贪食魔盒吞下这次替换，吐回 ${boxExp} 点经验。`);
		}
		if (notices.length) {
			showNotice(notices);
		}
	}

	function buySkillFlow(offerId) {
		// 闯关（旧版机制）：技能栏已满必须先选一个旧技能替换；购买页本身不改存档，
		// 玩家点返回＝取消，金币与技能栏一个字都不会动。
		if (context.run.mode !== RUN_MODE.endless && (context.run.skills?.length ?? 0) >= SKILL_SLOTS) {
			showReplace({
				run: context.run,
				confirmReplace: (id, removed) => applyBuy(id, removed),
				backToShop: openShop,
			}, offerId);
			return;
		}
		applyBuy(offerId);
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

	/**
	 * 切换「收藏家的橱窗」给的商店锁（kind: "skill" / "curio"）。
	 * 与其它商店动作同一条路线：先改内存 run → 落盘 → 原位重绘；没持有对应奇物时只弹一句、零副作用。
	 */
	function toggleLockFlow(kind) {
		const result = toggleShopLock(context.run, kind);
		if (!result.ok) {
			showNotice([result.error]);
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

	return { openShop, openSkills, openCurios, buySkillFlow, upgradeStatFlow, buyCurioFlow, upgradeCurioFlow, toggleLockFlow };
}
