import { lib, game, ui, get, ai, _status } from "../../../../noname.js";

export const skills = {
	qlnbingfeng: {
		audio: ["ext:奥特之星/assets/audio/bingfeng.mp3"],
		trigger: { source: "damageBegin4" },
		filter(event, player) {
			return (
				event.player !== player &&
				event.num > 0 &&
				event.player.isIn() &&
				event.player.countCards("h") > 0
			);
		},
		async cost(event, trigger, player) {
			const target = trigger.player;
			event.result = await player
				.chooseBool(`冰封：是否展示${get.translation(target)}的一张手牌？`)
				.set("ai", () => get.attitude(player, target) < 0)
				.forResult();
		},
		async content(event, trigger, player) {
			const target = trigger.player;
			if (!target.countCards("h")) return;
			const shown = await player
				.choosePlayerCard({
					target: target,
					position: "h",
					forced: true,
					prompt: `冰封：请选择${get.translation(target)}的一张手牌展示`
				})
				.forResult();
			const card = shown.links[0];
			await player.showCards(card, `冰封：展示${get.translation(target)}的一张手牌`);
			if (get.color(card) === "black") {
				await target.discard(card);
				if (!target.isTurnedOver()) {
					await target.turnOver(true);
				}
			} else {
				const x = player.maxHp;
				const result = await player
					.chooseBool(`冰封：是否防止此伤害，并以任意顺序弃置${get.translation(target)}总共${get.cnNumber(x)}张牌？`)
					.set("ai", () => {
						if (get.attitude(player, target) > 0) return true;
						if (target.hp <= trigger.num) return false;
						return x * 1.1 > trigger.num * 2;
					})
					.forResult();
				if (result.bool) {
					trigger.cancel();
					const num = Math.min(x, target.getDiscardableCards(player, "he").length);
					for (let i = 0; i < num; i++) {
						if (!target.getDiscardableCards(player, "he").length) {
							break;
						}
						await player.discardPlayerCard({
							target: target,
							position: "he",
							forced: true,
							prompt: `冰封：弃置${get.translation(target)}的一张牌（还需弃置${get.cnNumber(num - i)}张）`
						});
					}
				}
			}
		},
	},
	qlnjiujiu: {
		audio: ["ext:奥特之星/assets/audio/jiujiu.mp3"],
		direct: true,
		trigger: { global: ["discardAfter", "loseToDiscardpileAfter", "cardsDiscardAfter", "loseAfter"] },
		filter(event, player) {
			if (event.name === "lose" && (event.position !== ui.discardPile || event.type === "discard" || event.type === "loseToDiscardpile")) {
				return false;
			}
			const cards = event.cards;
			return Array.isArray(cards) && cards.some(card => typeof card.number === "number");
		},
		init(player, skill) {
			if (!Array.isArray(player.storage[skill])) {
				player.setStorage(skill, []);
			}
		},
		onremove(player, skill) {
			player.setStorage(skill, []);
		},
		mark: true,
		marktext: "⑨",
		intro: {
			content(storage) {
				if (!Array.isArray(storage) || !storage.length) return "尚未记录进入弃牌堆的牌";
				const sum = storage.reduce((a, b) => a + b, 0);
				return `最近${(storage.length)}张牌点数之和为${(sum)}`;
			},
		},
		async content(event, trigger, player) {
			for (const card of trigger.cards) {
				if (typeof card.number !== "number") continue;
				const queue = player.getStorage("qlnjiujiu", []).slice();
				queue.push(card.number);
				if (queue.length > 9) {
					queue.shift();
				}
				const sum = queue.reduce((a, b) => a + b, 0);
				if (sum % 9 === 0) {
					player.setStorage("qlnjiujiu", [], true);
					player.logSkill("qlnjiujiu");
					await player.draw(9);
				} else {
					player.setStorage("qlnjiujiu", queue, true);
				}
			}
		},
	},
};
