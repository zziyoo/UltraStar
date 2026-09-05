import { lib, game, ui, get, ai, _status } from "../../../../../noname.js";

export const skills = {
	ignzshenji: {
		audio: ["ext:奥特之星/assets/ignz1", "ext:奥特之星/assets/ignz2", "ext:奥特之星/assets/ignz3", "ext:奥特之星/assets/ignz4", "ext:奥特之星/assets/ignz5", "ext:奥特之星/assets/ignz6", "ext:奥特之星/assets/ignz7", "ext:奥特之星/assets/ignz8"],
		enable: ["chooseToUse", "chooseToRespond"],
		usable: 1,
		forced: true,
		locked: false,
		autoSort(cards, num) {
			if (!cards || cards.length < num) return cards.slice(0, num);
			const result = [];
			const used = new Set();
			const backtrack = () => {
				if (result.length === num) {
					return true;
				}
				for (let i = 0; i < cards.length; i++) {
					if (used.has(i)) continue;
					const card = cards[i];
					if (result.length > 0) {
						const lastCard = result[result.length - 1];
						if (get.type(card) === get.type(lastCard) || get.suit(card) === get.suit(lastCard)) {
							continue;
						}
					}
					result.push(card);
					used.add(i);
					if (backtrack()) {
						return true;
					}
					result.pop();
					used.delete(i);
				}
				return false;
			};
			if (backtrack()) {
				return result;
			}
			return cards.slice(0, num);
		},
		hiddenCard(player, name) {
			const info = get.info({ name });
			if (info && info.type === "delay") return false;
			if (info && info.type === "equip") return false;
			return true;
		},
		chooseButton: {
			dialog(event, player) {
				const list = get.inpileVCardList(info => {
					if (info[0] === "equip") return false;
					const name = info[2];
					const info2 = get.info({ name });
					if (info2 && info2.type === "delay") return false;
					if (event.name === "phaseUse") {
						return player.hasUseTarget({ name: name, nature: info[3] });
					}
					return true;
				});
				return ui.create.dialog("神计：选择要使用的牌", [list, "vcard"]);
			},
			filter(button, player) {
				const name = button.link[2];
				const info = get.info({ name });
				if (info && info.type === "delay") return false;
				if (info && info.type === "equip") return false;
				const evt = _status.event.getParent();
				if (evt && evt.filterCard) {
					return evt.filterCard(get.autoViewAs({ name: name, nature: button.link[3] }, "unsure"), player, evt);
				}
				return player.hasUseTarget({ name: name, nature: button.link[3] });
			},
			check(button) {
				const player = get.player();
				const name = button.link[2];
				const nature = button.link[3];
				const evt = _status.event.getParent();
				if (evt?.type === "dying" && evt.dying) {
					const attitude = get.attitude(player, evt.dying);
					if (attitude <= 0) return -10;
					return 5 + player.getUseValue({ name: name, nature: nature });
				}
				if (evt && evt.name !== "phaseUse" && evt.filterCard) {
					const card = get.autoViewAs({ name: name, nature: nature }, "unsure");
					if (evt.filterCard(card, player, evt)) {
						return 5 + player.getUseValue({ name: name, nature: nature });
					}
				}
				return player.getUseValue({ name: name, nature: nature });
			},
			backup(links, player) {
				const name = links[0][2];
				const nature = links[0][3];
				return {
					filterCard: () => false,
					selectCard: -1,
					viewAs: { name: name, nature: nature, isCard: true },
					log: false,
					async precontent(event, trigger, player) {
						player.logSkill("ignzshenji");
						const countUse = () => {
							const stat = player.getStat("skill");
							stat.ignzshenji = (stat.ignzshenji || 0) + 1;
						};
						const cardName = event.result.card.name;
						const cardNature = event.result.card.nature;
						const x = player.getStorage("ignzshenji_x", 1);
						let drawNum = 1;
						if (x > 1) {
							const list = [];
							for (let i = 1; i <= x; i++) {
								list.push(i.toString());
							}
							const result2 = await player
								.chooseControl(list)
								.set("prompt", "神计：选择要摸的牌数")
								.set("ai", () => {
									return list[list.length - 1];
								})
								.forResult();
							if (!result2?.control) {
								event.result.bool = false;
								return;
							}
							drawNum = parseInt(result2.control) || 1;
						}
						await player.draw(drawNum);
						if (drawNum === x) {
							player.setStorage("ignzshenji_x", x + 1);
						} else {
							player.setStorage("ignzshenji_x", Math.max(1, x - 1));
						}
						const allCards = player.getCards("h");
						let showCards = [];
						if (!event.isMine()) {
							showCards = lib.skill.ignzshenji.autoSort(allCards, drawNum);
						} else {
							const autoResult = await player
								.chooseControl(["手动选牌", "一键选牌"])
								.set("prompt", "神计：选择选牌方式")
								.set("ai", () => "一键选牌")
								.forResult();
							if (autoResult.control === "一键选牌") {
								showCards = lib.skill.ignzshenji.autoSort(allCards, drawNum);
								game.log(player, "使用一键选牌");
							} else {
								const result3 = await player
									.chooseButton(["神计：排序展示手牌（按顺序展示）", allCards], true, drawNum)
									.set("ai", button => {
										const cards = get.event().dialog.buttons.map(b => b.link);
										const selected = get.event().selected || [];
										if (selected.length >= drawNum) return 0;
										const card = button.link;
										for (const prev of selected) {
											if (get.type(card) === get.type(prev) || get.suit(card) === get.suit(prev)) {
												return -1;
											}
										}
										return 1;
									})
									.forResult();
								if (!result3?.links?.length) {
									game.log(player, "神计展示失败，弃置" + drawNum + "张牌");
									await player.chooseToDiscard("he", drawNum, true);
									countUse();
									event.result.bool = false;
									return;
								}
								showCards = result3.links;
							}
						}
						await player.showCards(showCards, "神计：展示手牌");
						let success = true;
						for (let i = 0; i < showCards.length - 1; i++) {
							const card = showCards[i];
							const nextCard = showCards[i + 1];
							if (get.type(card) === get.type(nextCard) || get.suit(card) === get.suit(nextCard)) {
								success = false;
								break;
							}
						}
						if (!success) {
							await player.chooseToDiscard("he", drawNum, true);
							countUse();
							event.cancel();
							event.getParent().goto(0);
							return;
						}
					},
				};
			},
			prompt(links, player) {
				const name = links[0][2];
				return "神计：选择要使用的牌";
			},
		},
		ai: {
			order: 10,
			result: {
				player(player) {
					return 1;
				},
				target(player, target, card) {
					const evt = _status.event;
					if (evt.dying && evt.dying === target) {
						return get.attitude(player, target) > 0 ? 5 : -10;
					}
					return 0;
				},
			},
			respondSha: true,
			respondShan: true,
			respondWuxie: true,
			save: true,
			skillTagFilter(player, tag) {
				return true;
			},
		},
	},
};
