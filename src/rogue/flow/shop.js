// 商店流程：技能商店、只读技能页 / 奇物页、买技能、刷候选、升属性、买卖与升级奇物。
// 纯数据判定在 shop.js / curioManager.js，这里只负责「算 → 落盘 → 原位刷新 UI」这条固定路线。
// 跨模块回调（回营地、回存档页、离开模式）由 mode.js 通过 host 注入。

import { lib } from "../../../../../noname.js";

import { SKILL_SLOTS } from "../config.js";
import { buySkill, checkStatUpgrade, refreshSkillOffers, rollSkillOffers, upgradeStat } from "../shop.js";
import { buyCurio, upgradeCurio, getReplaceRewardGold, getReplaceRewardExp, toggleShopLock } from "../curioManager.js";
import { getShopPool } from "../skillPool.js";
import { commit, context, skillGate } from "../runtime.js";
import { showNotice } from "../ui/common.js";
import { refreshCurios, refreshShop, showReplace, showShop, showCurios, showSkills } from "../ui/hub.js";

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
			openCurios,
			buyCurio: buyCurioFlow,
			backToHub: host.openHub,
			backToSlots: host.openSlots,
			leaveMode: host.leaveMode,
		});
	}

	/** 只读的技能查看页（入口在商店顶部的「技能 n/3」资源块）：不买卖、不写存档 */
	function openSkills() {
		if (!context.run) {
			host.openSlots();
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
			host.openSlots();
			return;
		}
		showCurios({
			run: context.run,
			getRun: () => context.run,
			upgradeCurio: upgradeCurioFlow,
			back: openShop,
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

	function applyBuy(offerId, replaceId) {
		// skillGate 一起传下去：购买前做最终技能合法性校验，存档里的过期候选买不动
		const result = buySkill(context.run, offerId, replaceId, skillGate);
		if (!result.ok) {
			showNotice([result.error], openShop);
			return;
		}
		// 遗忘之石（金币）与贪食魔盒（经验）：只有**真的发生了替换**（槽满、老技能让位）才结账，
		// 空槽直接买一分不给。被换掉的技能本身没有任何补偿——两件奇物吃的是「遗忘」这件事。
		// 两笔都在扣款之后按同一份 run 现算（getBonus 看的是当前品质）
		const stoneGold = result.removed ? getReplaceRewardGold(context.run) : 0;
		const boxExp = result.removed ? getReplaceRewardExp(context.run) : 0;
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
