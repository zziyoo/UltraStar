import { lib, game, ui, get, ai, _status } from "../../../../../noname.js";

// 奥特曼跨分包共用技能。
// 准入规则：只有被两个及以上分包实际依赖的代码才能放这里，禁止把无归属的技能丢进 shared。
export const skills = {
	// 红黑牌公共基座：宇宙日冕/日蚀/未来三名高斯的前半段效果完全一致，
	// 通过 inherit 复用本技能；子技能继承到的 group 指向本技能注册的 aohonghei_use，
	// 子技能自带 subSkill 时不会继承本对象，因此不会携带日冕的花色修正等额外机制。
	aohonghei: {
		locked: true,
		group: ["aohonghei_use"],
		subSkill: {
			use: {
				// 与 rmgsrimian_use 相同的已验证结算方式：useCard1 时点红牌 effectCount++、黑牌 directHit。
				// useCardToPlayer/useCardAfter 等时点每次使用只触发一次，额外结算不会重复触发它们。
				trigger: { player: "useCard1" },
				forced: true,
				locked: true,
				popup: false,
				filter(event) {
					return Boolean(event.card);
				},
				async content(event, trigger, player) {
					const color = get.color(trigger.card);
					if (color === "red") {
						trigger.effectCount++;
						game.log(trigger.card, "额外结算一次");
					} else if (color === "black") {
						trigger.directHit.addArray(game.players);
						game.log(trigger.card, "不可被响应");
					}
				},
			},
		},
	},
};

// 弃牌堆监听工具（宇宙/未来两个分包共用）。
// 返回本次事件中真正新进入弃牌堆的实体牌。本体确认过的三种投递路径：
// 1. discard/loseToDiscardpile 内容内部的 lose 事件（position 为弃牌堆）→ loseAfter；
// 2. 使用牌结算尾部 orderingDiscard → game.cardsDiscard → cardsDiscardAfter（此前 ordering 的 lose 事件 getd() 为空）；
// 3. game.loseAsync 包装的多个子 lose 事件 → loseAsyncAfter 统一汇总（getd 按“直接父事件为该 loseAsync”统计）。
// 据此跳过“直接父事件是 loseAsync”的 lose 事件，避免同一批牌被 loseAfter 与 loseAsyncAfter 双重处理。
export function getNewDiscardCards(event) {
	if (!event || typeof event.getd !== "function") return [];
	if (event.name === "lose" && event.getParent()?.name === "loseAsync") return [];
	return event
		.getd()
		.filter(card => get.itemtype(card) === "card" && get.position(card, true) === "d");
}
