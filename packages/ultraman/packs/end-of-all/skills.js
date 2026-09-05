import { lib, game, ui, get, ai, _status } from "../../../../../../noname.js";

export const skills = {
	plcmhuanjing: {
		audio: ["ext:奥特之星/assets/ultraman/audio/skill/huanjing"],
		trigger: {
			global: "judgeBegin",
		},
		filter() {
			return ui.cardPile.childNodes.length > 1;
		},
		async content(event, trigger, player) {
			const topCard = get.cards()[0];
			const bottomCard = get.bottomCards()[0];
			const cards = [topCard, bottomCard];
			let targetSuit = null;
			let evt = event.getParent();
			while (evt) {
				if (evt.name === "plcmlengjing") {
					if (evt.triggername === "useCardToBefore" || evt.triggername === "useCardToPlayered") {
						const trig = evt.getTrigger();
						if (trig?.card) {
							targetSuit = get.suit(trig.card);
							break;
						}
					}
				}
				evt = evt.parent;
			}
			if (targetSuit) {
				const topMatch = get.suit(topCard) === targetSuit;
				const bottomMatch = get.suit(bottomCard) === targetSuit;
				if (topMatch && !bottomMatch) {
					ui.cardPile.appendChild(bottomCard);
					game.cardsGotoPile(topCard, "insert");
					return;
				}
			}
			const str = '<div class="text center">牌堆顶/牌堆底</div>';
			const result = await player
				.chooseButton(["幻境：选择要获得的牌", str, cards], false)
				.set("ai", button => {
					const judgeFn = trigger.judge;
					if (typeof judgeFn !== "function") {
						return get.value(button.link, player);
					}
					const attitude = get.attitude(player, trigger.player);
					const desired = attitude > 0 ? 1 : attitude < 0 ? -1 : 0;
					const resultOf = card => ({
						card,
						name: card.name,
						number: get.number(card),
						suit: get.suit(card),
						color: get.color(card),
						node: card.node,
					});
					const benefit = card => desired * judgeFn(resultOf(card));
					const base = benefit(topCard);
					const nextCard = ui.cardPile.childNodes[0] || topCard;
					const cardVal = card => get.value(card, player) / 4;
					if (button.link === topCard) {
						return benefit(bottomCard) - base + cardVal(topCard);
					}
					return benefit(nextCard) - base + cardVal(bottomCard);
				})
				.forResult();
			if (result.bool) {
				const chosen = result.links[0];
				const isTop = chosen === topCard;
				if (isTop) {
					await player.gain(topCard, "draw");
					game.log(player, "获得了牌堆顶的一张牌");
					game.cardsGotoPile(bottomCard, "insert");
					game.log(player, "将", bottomCard, "置于了牌堆顶");
				} else {
					await player.gain(bottomCard, "gain2");
					game.log(player, "获得了牌堆底的一张牌");
					ui.cardPile.appendChild(topCard);
					game.log(player, "将", topCard, "置于了牌堆底");
				}
			} else {
				ui.cardPile.appendChild(bottomCard);
				game.cardsGotoPile(topCard, "insert");
				game.log("大家就当无事发生~(*^ω^*)");
			}
		},
		ai: {
			expose: 0.1,
			tag: {
				rejudge: 0.5,
			},
		},
	},
	plcmlengjing: {
		audio: ["ext:奥特之星/assets/ultraman/audio/skill/lengjing"],
		group: ["plcmlengjing_target"],
		trigger: {
			target: "useCardToTarget",
		},
		filter(event, player) {
			if (get.tag(event.card, "damage")) {
				return event.player !== player;
			}
			return false;
		},
		async content(event, trigger, player) {
			const targetSuit = get.suit(trigger.card);
			const result = await player
				.judge(card => {
					return get.suit(card) === targetSuit ? 10 : 0;
				})
				.set("judge2", result => result.suit === targetSuit)
				.forResult();
			if (result?.suit === targetSuit) {
				trigger.targets.remove(player);
				trigger.getParent().triggeredTargets2.remove(player);
				trigger.untrigger();
			}
		},
		ai: {
			effect: {
				target_use(card, player, target, current, isLink) {
					if (get.tag(card, "damage") || card?.name === "sha") {
						if (!isLink && player !== target) {
							return 0.5;
						}
					}
				},
			},
		},
		subSkill: {
			target: {
				audio: ["ext:奥特之星/assets/ultraman/audio/skill/lengjing"],
				trigger: {
					player: "useCardToPlayered",
				},
				filter(event, player) {
					if (event.player !== player) return false;
					if (event.target === player) return false;
					if (get.tag(event.card, "damage")) return false;
					return true;
				},
				async content(event, trigger, player) {
					const targetSuit = get.suit(trigger.card);
					const result = await player
						.judge(card => {
							return get.suit(card) === targetSuit ? 10 : 0;
						})
						.set("judge2", result => result.suit === targetSuit)
						.forResult();
					if (result?.suit === targetSuit) {
						trigger.directHit.add(trigger.target);
					}
				},
			},
		},
	},
	plcmjinghua: {
		audio: ["ext:奥特之星/assets/ultraman/audio/skill/jinghua"],
		forced: true,
		locked: false,
		trigger: { player: "useCardAfter" },
		filter(event, player) {
			if (!event.targets || event.targets.length === 0) return false;
			if (!lib.suit.includes(get.suit(event.card))) return false;
			const targets = event.targets.filter(target => target !== player && target.isAlive());
			return targets.some(target => {
				const hasResponded = target.hasHistory("useCard", evt => {
					return evt.respondTo && evt.respondTo[1] === event.card;
				});
				const hasResponded2 = target.hasHistory("respond", evt => {
					return evt.respondTo && evt.respondTo[1] === event.card;
				});
				return !hasResponded && !hasResponded2;
			});
		},
		async content(event, trigger, player) {
			const suit = get.suit(trigger.card);
			const targets = trigger.targets.filter(target => target !== player && target.isAlive());
			const unresponsedTargets = targets.filter(target => {
				if (!target.isAlive()) return false;
				const hasResponded = target.hasHistory("useCard", evt => {
					return evt.respondTo && evt.respondTo[1] === trigger.card;
				});
				const hasResponded2 = target.hasHistory("respond", evt => {
					return evt.respondTo && evt.respondTo[1] === trigger.card;
				});
				return !hasResponded && !hasResponded2;
			});
			if (unresponsedTargets.length === 0) return;
			for (const target of unresponsedTargets) {
				if (!target.isAlive()) continue;
				const dialog = ui.create.dialog(`晶化：对${get.translation(target)}发动，选择一项`, "hidden");
				dialog.add([
					[
						[1, "展示其手牌并获得与此牌相同花色的手牌和装备牌"],
						[2, "直到其下回合结束，其无法使用此花色的牌"],
					],
					"textbutton",
				]);
				const result = await player
					.chooseButton(dialog, true)
					.set("ai", button => {
						const choice = button.link;
						const knownCards = target.getCards("he").filter(card => card.isKnownBy(player));
						const knownSameSuit = knownCards.filter(card => get.suit(card) === suit).length;
						const totalHe = target.countCards("he");
						const estSameSuit = knownSameSuit + (totalHe - knownCards.length) / 4;
						const gainValue = estSameSuit * 2;
						if (choice === 1) return gainValue;
						const attitude = get.attitude(player, target);
						let banValue = 6;
						if (attitude < 0 && estSameSuit <= 1) banValue = 14;
						if (totalHe <= 2) banValue = 14;
						if (attitude >= 0) banValue = 1;
						return banValue;
					})
					.forResult();
				if (result.bool && result.links) {
					const choice = result.links[0];
					game.log(player, "对", target, "发动了【晶化】");
					if (choice === 1) {
						target.showHandcards();
						const targetHand = target.getCards("he");
						const sameSuitCards = targetHand.filter(card => get.suit(card) === suit);
						if (sameSuitCards.length > 0) {
							await player.gain(sameSuitCards, target);
							game.log(player, "获得了", target, `的${sameSuitCards.length}张`, get.translation(suit), "牌");
						}
					} else {
						target.addTempSkill("plcmjinghua_ban", { player: "phaseEnd" });
						target.markAuto("plcmjinghua_ban", [suit]);
						game.log(target, "无法使用", get.translation(suit), "牌直到其下回合结束");
					}
				}
			}
		},
		subSkill: {
			ban: {
				charlotte: true,
				mark: true,
				marktext: "晶",
				intro: {
					content(storage) {
						if (storage?.length > 0) {
							return `无法使用或打出${get.translation(storage)}牌`;
						}
						return "无法使用或打出特定花色的牌";
					},
				},
				init(player, skill) {
					const storage = player.getStorage(skill, []);
					if (storage.length) {
						player.addTip(skill, `晶化 限${get.translation(storage)}`);
					}
				},
				onremove(player, skill) {
					player.removeTip(skill);
					player.setStorage(skill, undefined);
				},
				mod: {
					cardEnabled(card, player) {
						if (player.getStorage("plcmjinghua_ban", []).includes(get.suit(card))) return false;
					},
					cardRespondable(card, player) {
						if (player.getStorage("plcmjinghua_ban", []).includes(get.suit(card))) return false;
					},
					cardSavable(card, player) {
						if (player.getStorage("plcmjinghua_ban", []).includes(get.suit(card))) return false;
					},
				},
			},
		},
	},
	jtjeheiwu: {
		audio: ["ext:奥特之星/assets/ultraman/audio/skill/jtje"],
		trigger: { global: "phaseEnd" },
		forced: true,
		filter(event, player) {
			if (event.player === player) return false;
			if (!event.player.isIn()) return false;
			return true;
		},
		async content(event, trigger, player) {
			game.playSkillBgm("guaishou");
			const target = trigger.player;
			const num1 = player.getStorage("jtjeheiwu_num1", 1);
			const num2 = player.getStorage("jtjeheiwu_num2", 1);
			const choices = [];
			if (target.countCards("he") >= num1) {
				choices.push("弃置" + num1 + "张牌");
			}
			choices.push("失去" + num2 + "点体力");
			const result = await target
				.chooseControl(choices)
				.set("prompt", "黑雾：请选择一项")
				.set("ai", () => {
					const p = get.player();
					const n1 = get.event().num1;
					const n2 = get.event().num2;
					const opts = get.event().choices;
					const canDiscard = opts.includes("弃置" + n1 + "张牌");
					const loseHpOption = "失去" + n2 + "点体力";
					if (p.hp <= n2 && canDiscard) {
						return "弃置" + n1 + "张牌";
					}
					if (!canDiscard) {
						return loseHpOption;
					}
					if (p.hp - n2 > 2) {
						return loseHpOption;
					}
					return "弃置" + n1 + "张牌";
				})
				.set("num1", num1)
				.set("num2", num2)
				.set("choices", choices)
				.forResult();
			if (!result?.control) return;
			if (result.control === "弃置" + num1 + "张牌") {
				await target.chooseToDiscard(num1, "he", true);
				player.setStorage("jtjeheiwu_num1", num1 + 1);
			} else if (result.control === "失去" + num2 + "点体力") {
				await target.loseHp(num2);
				player.setStorage("jtjeheiwu_num2", num2 + 1);
			}
		},
	},
	jtjeluoke: {
		audio: ["ext:奥特之星/assets/ultraman/audio/skill/jtje"],
		trigger: { player: "damageBegin3" },
		forced: true,
		filter(event, player) {
			if (!event.card) return false;
			const color = get.color(event.card);
			if (color !== "black") return false;
			return get.tag(event.card, "damage");
		},
		async content(event, trigger, player) {
			game.playSkillBgm("guaishou");
			trigger.cancel();
		},
		ai: {
			effect: {
				target(card, player, target) {
					if (get.color(card) === "black" && get.tag(card, "damage")) return 0;
				},
			},
		},
	},
	jtjeguanchuan: {
		mark: true,
		audio: ["ext:奥特之星/assets/ultraman/audio/skill/jtje"],
		enable: "phaseUse",
		usable: 1,
		skillAnimation: true,
		init(player) {
			if (!player.getStorage("jtjeguanchuan_used", null)) player.setStorage("jtjeguanchuan_used", []);
		},
		filter(event, player) {
			return game.hasPlayer(target => target !== player && target.hp < Math.ceil(target.maxHp / 2) && !player.getStorage("jtjeguanchuan_used", []).includes(target));
		},
		filterTarget(card, player, target) {
			if (target === player) return false;
			if (target.hp >= Math.ceil(target.maxHp / 2)) return false;
			if (player.getStorage("jtjeguanchuan_used", []).includes(target)) return false;
			return true;
		},
		check(card, player) {
			const targets = game.filterPlayer(target => target !== player && target.hp < Math.ceil(target.maxHp / 2) && !player.getStorage("jtjeguanchuan_used", []).includes(target));
			if (targets.length === 0) return 0;
			let max = 0;
			for (const t of targets) {
				const att = get.attitude(player, t);
				if (att < 0) {
					const val = Math.abs(att) * t.hp;
					if (val > max) max = val;
				}
			}
			return max;
		},
		async content(event, trigger, player) {
			game.playSkillBgm("guaishou");
			const target = event.targets[0];
			const hp = target.hp;
			player.markAuto("jtjeguanchuan_used", [target]);
			await target.loseHp(hp);
		},
		ai: {
			order: 10,
			result: {
				target(player, target) {
					if (target.hp >= Math.ceil(target.maxHp / 2)) return 0;
					return -target.hp;
				},
			},
		},
		marktext: "石",
		intro: {
			name: "贯穿",
			content(storage, player) {
				const used = player.getStorage("jtjeguanchuan_used", []);
				if (!used.length) return "此技能未发动过";
				return "已对" + used.map(target => get.translation(target)).join("、") + "发动过此技能";
			},
		},
	},
};
