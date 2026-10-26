import { lib, game, ui, get, ai, _status } from "../../../../../noname.js";
export const skills = {
	aohonghei: {
		locked: true,
		group: ["aohonghei_use", "aohonghei_mark"],
		shared: {
			markTags: ["aohonghei_mark_red", "aohonghei_mark_black"],
			hasEffect(player) {
				return Boolean(player?.isIn() && player.hasSkill("aohonghei_use"));
			},
			getCardMarkTags(card) {
				const color = get.color(card, false);
				return color === "red" ? ["aohonghei_mark_red"] : color === "black" ? ["aohonghei_mark_black"] : [];
			},
			clearCardMarks(player, card) {
				const owner = get.owner(card);
				if (owner && owner !== player && this.hasEffect(owner) && owner.getCards("h").includes(card)) return;
				for (const tag of this.markTags) {
					if (card.hasGaintag(tag)) player.removeGaintag(tag, [card]);
				}
			},
			clearMarks(player) {
				for (const card of new Set([...(player.aohongheiMarkedCards ?? []), ...player.getCards("h")])) this.clearCardMarks(player, card);
				delete player.aohongheiMarkedCards;
			},
			refreshMarks(player) {
				if (!this.hasEffect(player)) {
					this.clearMarks(player);
					return;
				}
				const hand = player.getCards("h");
				for (const card of player.aohongheiMarkedCards ?? []) {
					if (!hand.includes(card)) this.clearCardMarks(player, card);
				}
				for (const card of hand) {
					const desired = this.getCardMarkTags(card);
					for (const tag of this.markTags) {
						if (card.hasGaintag(tag) && !desired.includes(tag)) player.removeGaintag(tag, [card]);
					}
					for (const tag of desired) {
						if (!card.hasGaintag(tag)) player.addGaintag(card, tag);
					}
				}
				player.aohongheiMarkedCards = hand;
			},
			getNewDiscardCards(event) {
				if (!event || typeof event.getd !== "function") return [];
				if (event.name === "lose" && event.getParent()?.name === "loseAsync") return [];
				return [...new Set(event.getd())].filter(card => get.itemtype(card) === "card" && get.position(card, true) === "d");
			},
			onremove(player) {
				this.refreshMarks(player);
				if (!this.hasEffect(player)) return;
				const next = game.createEvent("aohonghei_restore", false);
				next.player = player;
				next.setContent(async (event, trigger, player) => {
					if (lib.skill.aohonghei.shared.hasEffect(player)) player.addSkillTrigger(["aohonghei_use", "aohonghei_mark"]);
				});
			},
		},
		init(player) {
			lib.skill.aohonghei.shared.refreshMarks(player);
		},
		init2(player) {
			lib.skill.aohonghei.shared.refreshMarks(player);
		},
		onremove(player) {
			lib.skill.aohonghei.shared.onremove(player);
		},
		subSkill: {
			mark: {
				trigger: { player: ["changeSkillsAfter", "enterGame", "phaseBegin", "dieAfter"], global: ["gameDrawEnd", "gameStart", "gainAfter", "loseAfter", "loseAsyncAfter"] },
				forced: true,
				silent: true,
				popup: false,
				forceDie: true,
				filter(event, player) {
					if (event.name === "gain") return event.player === player && Boolean(event.cards?.length);
					if (event.name === "lose") return event.player === player && Boolean(event.hs?.length);
					if (event.name === "loseAsync") return Boolean(event.getl?.(player)?.hs?.length);
					return true;
				},
				async content(event, trigger, player) {
					lib.skill.aohonghei.shared.refreshMarks(player);
				},
			},
			use: {
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
