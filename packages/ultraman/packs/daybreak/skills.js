import { lib, game, ui, get, ai, _status } from "../../../../../../noname.js";

export const skills = {
	atzfzhenli: {
		forced: true,
		trigger: {
			player: ["phaseBegin", "phaseEnd", "gainAfter", "loseAfter", "changeHp", "gainMaxHpAfter", "loseMaxHpAfter"],
			global: ["equipAfter", "addJudgeAfter", "gainAfter", "loseAsyncAfter", "addToExpansionAfter"],
		},
		filter(event, player) {
			if (event.getl && !event.getl(player)) return false;
			return player.countCards("h") < player.maxHp;
		},
		async content(event, trigger, player) {
			game.playSkillBgm("atzfzhenli");
			await player.draw(player.maxHp - player.countCards("h"));
		},

		mod: {
			attackRange(player, num) {
				return 999;
			},
			targetInRange(card, player) {
				return true;
			},
		},
	},
	atzfchiyuan: {
		audio: ["ext:奥特之星/assets/ultraman/audio/skill/chiyuan"],
		enable: "phaseUse",
		usable: 1,
		filter(event, player) {
			return player.hasCards("h");
		},
		filterTarget: lib.filter.notMe,
		filterCard(card) {
			return true;
		},
		selectCard: [1, Infinity],
		allowChooseAll: true,
		position: "h",
		discard: false,
		lose: false,
		delay: false,
		async content(event, trigger, player) {
			await player.give(event.cards, event.targets[0]);
		},
		check(card) {
			return 7 - get.value(card);
		},
		ai: {
			order: 1,
			result: {
				target(player, target) {
					if (target.hasSkillTag("nogain")) return 0;
					return Math.max(1, 5 - target.countCards("h"));
				},
			},
			effect: {
				player_use(card, player, target) {
					if (player.hasCards("h")) {
						const cards = player.getCards("h");
						const hasUsable = cards.some(c => player.hasUseTarget(c));
						if (!hasUsable) {
							return [1, 0, 1, 0];
						}
					}
				},
			},
		},
	},
	sydjqiji: {
		trigger: { global: "phaseAfter" },
		forced: true,
		filter(event, player) {
			const aliveCount = game.players.filter(p => p.isAlive() && !p.classList.contains("out")).length;
			const targetCount = aliveCount * 2;
			return player.countCards("h") < targetCount;
		},
		async content(event, trigger, player) {
			game.playSkillBgm("sydj");
			const aliveCount = game.players.filter(p => p.isAlive() && !p.classList.contains("out")).length;
			const targetCount = aliveCount * 2;
			const drawNum = targetCount - player.countCards("h");
			if (drawNum > 0) {
				await player.draw(drawNum);
			}
		},
		group: ["sydjqiji_loseHp"],
		subSkill: {
			loseHp: {
				trigger: { player: "loseHpBefore" },
				forced: true,
				filter(event, player) {
					return event.num > 0;
				},
				async content(event, trigger, player) {
					trigger.cancel();
					game.log(player, "发动了【祈冀】，防止失去体力");
				},
			},
		},
	},
	sydjhuihuang: {
		forced: true,
		locked: false,
		trigger: {
			target: "useCardToTarget",
		},
		filter(event, player) {
			if (event.player === player) return false;
			return !player.getStorage("sydjhuihuang", []).includes(event.card.name);
		},
		async content(event, trigger, player) {
			game.playSkillBgm("sydj");
			player.markAuto("sydjhuihuang", [trigger.card.name]);
			trigger.targets.remove(player);
			trigger.getParent().triggeredTargets2.remove(player);
			trigger.untrigger();
		},
		onremove: true,
		intro: { content: "已记录牌名：$" },
		group: ["sydjhuihuang_cancel", "sydjhuihuang_phase"],
		subSkill: {
			cancel: {
				direct: true,
				trigger: {
					target: "useCardToTarget",
				},
				filter(event, player) {
					if (event.player === player) return false;
					return player.getStorage("sydjhuihuang", []).includes(event.card.name);
				},
				async content(event, trigger, player) {
					const cardType2 = get.type2(trigger.card, false);
					const result = await player
						.chooseToDiscard("he", "是否弃置一张" + get.translation(cardType2) + "类型的牌取消" + get.translation(trigger.card) + "？")
						.set("ai", card => {
							if (get.attitude(player, trigger.player) >= 0) return -1;
							const type2 = get.type2(card, false);
							if (type2 === cardType2) return 5 - get.value(card);
							return -1;
						})
						.set("filterCard", card => {
							return get.type2(card, false) === cardType2;
						})
						.forResult();
					if (result.bool) {
						player.logSkill("sydjhuihuang");
						trigger.targets.remove(player);
						trigger.getParent().triggeredTargets2.remove(player);
						trigger.untrigger();
						game.log(player, "弃置了一张牌取消了", trigger.card);
					}
				},
			},
			phase: {
				trigger: { player: "phaseBegin" },
				direct: true,
				async content(event, trigger, player) {
					const recorded = player.getStorage("sydjhuihuang", []);
					const choices = ["弃牌移除记录", "弃牌使用锦囊", "cancel2"];
					const result = await player
						.chooseControl(choices)
						.set("prompt", "【辉煌】请选择一项")
						.set("ai", () => "cancel2")
						.forResult();
					if (result.control === "弃牌移除记录") {
						const discardResult = await player
							.chooseCard("he", [2, player.countCards("he")], "选择要弃置的牌")
							.set("ai", card => 9 - get.value(card))
							.set("filter", (card, player) => true)
							.set("select", () => {
								const max = player.countCards("he");
								return [2, max - (max % 2)];
							})
							.forResult();
						if (discardResult.bool && discardResult.cards && discardResult.cards.length % 2 === 0) {
							const discardNum = discardResult.cards.length;
							const x = Math.floor(discardNum / 2);
							const recorded = player.getStorage("sydjhuihuang", []);
							const canRemove = Math.min(x, recorded.length);
							if (canRemove > 0 && recorded.length > 0) {
								const cardList = recorded.map(name => ["卡片", "", name]);
								const removeResult = await player
									.chooseButton(["选择要移除的记录（移除" + canRemove + "种）", [cardList, "vcard"]], true, canRemove)
									.set("ai", button => {
										return Math.random();
									})
									.forResult();
								if (removeResult.bool && removeResult.links) {
									await player.discard(discardResult.cards);
									const removed = removeResult.links.map(link => link[2]);
									player.unmarkAuto("sydjhuihuang", removed);
									game.log(player, "弃置了" + discardNum + "张牌，移除了", removed.join("、"), "的记录");
								}
							} else {
								await player.discard(discardResult.cards);
								game.log(player, "弃置了" + discardNum + "张牌，但没有可移除的记录");
							}
						}
					} else if (result.control === "弃牌使用锦囊") {
						const cardResult = await player
							.chooseCard("he", 2, "弃置两张牌视为使用一张普通锦囊")
							.set("ai", card => 9 - get.value(card))
							.forResult();
						if (cardResult.bool && cardResult.cards?.length >= 2) {
							const costCards = cardResult.cards;
							const list = [];
							const cardNames = lib.inpile;
							const excludeNames = ["wuxie", "bingliang", "lebu", "shandian"];
							for (const name of cardNames) {
								const type = get.type2(name, false);
								if (type === "trick" && !excludeNames.includes(name)) {
									list.push([type, "", name]);
								}
							}
							if (list.length > 0) {
								const buttonResult = await player
									.chooseButton(["辉煌：选择要使用的锦囊牌", [list, "vcard"]], true)
									.set("ai", button => {
										const name = button.link[2];
										return player.getUseValue({ name: name });
									})
									.forResult();
								if (buttonResult.bool && buttonResult.links?.length > 0) {
									const name = buttonResult.links[0][2];
									for (const card of costCards) {
										await player.lose(card, ui.discardPile);
									}
									game.log(player, "弃置了", costCards);
									player.logSkill("sydjhuihuang");
									const vcard = { name: name };
									await player.chooseUseTarget(vcard, true, false);
								}
							}
						}
					}
				},
			},
		},
	},
	zggylianshuai: {
		trigger: { global: "roundStart" },
		forced: true,
		async content(event, trigger, player) {
			player.setStorage("zggylianshuai", { combos: [] });
		},
		group: ["zggylianshuai_sha"],
		subSkill: {
			sha: {
				trigger: { player: "useCardAfter" },
				filter(event, player) {
					if (event.card.name !== "sha") return false;
					const handCards = player.getCards("h");
					const typeMap = { basic: "基本牌", trick: "锦囊牌" };
					const suits = ["spade", "heart", "club", "diamond"];
					const data = player.getStorage("zggylianshuai");
					for (const card of handCards) {
						const cardType = get.type2(card);
						const typeText = typeMap[cardType];
						if (!typeText) continue;
						const suit = get.suit(card);
						if (suit === "none" || suit === "unsure") continue;
						const key = cardType + suit;
						if (!data.combos.includes(key)) return true;
					}
					return false;
				},
				async cost(event, trigger, player) {
					const handCards = player.getCards("h");
					const suitSymbols = { spade: "♠", heart: "♥", club: "♣", diamond: "♦" };
					const typeMap = { basic: "基本牌", trick: "锦囊牌" };
					const reverseTypeMap = { 基本牌: "basic", 锦囊牌: "trick" };
					const suits = ["spade", "heart", "club", "diamond"];
					const types = ["基本牌", "锦囊牌"];
					const data = player.getStorage("zggylianshuai");
					const groups = {};
					for (const card of handCards) {
						const cardType = get.type2(card);
						const typeText = typeMap[cardType];
						if (!typeText) continue;
						const suit = get.suit(card);
						if (suit === "none" || suit === "unsure") continue;
						const key = cardType + suit;
						if (!groups[key]) groups[key] = [];
						groups[key].push(card);
					}
					let hasAvailable = false;
					for (const type of types) {
						const engType = reverseTypeMap[type];
						for (const suit of suits) {
							const key = engType + suit;
							if (!data.combos.includes(key) && groups[key]?.length) {
								hasAvailable = true;
								break;
							}
						}
						if (hasAvailable) break;
					}
					if (!hasAvailable) {
						event.result = { bool: false };
						return;
					}
					if (!event.isMine()) {
						let bestKey = null;
						let bestCards = null;
						let bestScore = Infinity;
						for (const type of types) {
							const engType = reverseTypeMap[type];
							for (const suit of suits) {
								const key = engType + suit;
								if (data.combos.includes(key) || !groups[key]?.length) continue;
								const score = groups[key].reduce((sum, card) => sum + get.value(card), 0);
								if (score < bestScore) {
									bestScore = score;
									bestKey = key;
									bestCards = groups[key];
								}
							}
						}
						if (bestKey && bestScore <= 10) {
							event.result = { bool: true, cost_data: { cards: bestCards.slice(), key: bestKey } };
						} else {
							event.result = { bool: false };
						}
						return;
					}
					const { promise, resolve } = Promise.withResolvers();
					const evt = _status.event;
					evt.selectedCards = [];
					evt.selectedButtons = [];
					const selected = { key: null };
					const dialog = ui.create.dialog("至高");
					dialog.style.zoom = "0.85";
					const subCss = { border: "none", minHeight: "0px", background: "transparent" };
					dialog.addNewRow(
						{
							item: [],
							ItemNoclick: true,
							custom: function (c) {
								var d = ui.create.div(c);
								d.innerHTML = "基本牌";
								d.css({ display: "flex", justifyContent: "center", alignItems: "center", width: "100%", height: "100%", fontSize: "1.2em", fontWeight: "bold" });
							},
							itemContainerCss: subCss,
						},
						{
							item: [],
							ItemNoclick: true,
							custom: function (c) {
								var d = ui.create.div(c);
								d.innerHTML = "锦囊牌";
								d.css({ display: "flex", justifyContent: "center", alignItems: "center", width: "100%", height: "100%", fontSize: "1.2em", fontWeight: "bold" });
							},
							itemContainerCss: subCss,
						}
					);
					const okButton = ui.create.control("ok", () => {
						_status.imchoosing = false;
						dialog.close();
						okButton.close();
						cancelButton?.close();
						resolve({ bool: true, cards: evt.selectedCards.slice(), key: selected.key });
						game.resume();
					});
					okButton.classList.add("disabled");
					const cancelButton = ui.create.control("cancel2", () => {
						_status.imchoosing = false;
						dialog.close();
						okButton.close();
						cancelButton.close();
						resolve({ bool: false });
						game.resume();
					});
					dialog.switchToAuto = function () {
						_status.imchoosing = false;
						dialog.close();
						okButton.close();
						cancelButton.close();
						let bestKey = null;
						let bestCards = null;
						let minLen = Infinity;
						for (const type of types) {
							const engType = reverseTypeMap[type];
							for (const suit of suits) {
								const key = engType + suit;
								if (!data.combos.includes(key) && groups[key]?.length && groups[key].length < minLen) {
									minLen = groups[key].length;
									bestKey = key;
									bestCards = groups[key];
								}
							}
						}
						if (bestKey) {
							resolve({ bool: true, cards: bestCards.slice(), key: bestKey });
							game.resume();
							return;
						}
						resolve({ bool: false });
						game.resume();
					};
					const itemCss = { border: "solid #c6b3b3 2px", minHeight: "100px" };
					function makeClickHandler(key) {
						return function (container, item) {
							if (!item?.length) return;
							if (evt.selectedButtons.includes(container)) {
								container.classList.remove("selected");
								evt.selectedButtons.remove(container);
								evt.selectedCards.removeArray(item);
								selected.key = null;
							} else {
								if (evt.selectedButtons.length) {
									const prev = evt.selectedButtons[0];
									prev.classList.remove("selected");
									evt.selectedButtons.remove(prev);
									evt.selectedCards = [];
									selected.key = null;
								}
								container.classList.add("selected");
								evt.selectedButtons.add(container);
								evt.selectedCards.addArray(item);
								selected.key = key;
							}
							okButton.classList[evt.selectedButtons.length ? "remove" : "add"]("disabled");
						};
					}
					function createCustom(text, color) {
						return function (itemContainer) {
							const div = ui.create.div(itemContainer);
							div.innerHTML = text;
							div.css({
								position: "absolute",
								width: "100%",
								bottom: "1%",
								height: "25%",
								background: "#352929bf",
								display: "flex",
								justifyContent: "center",
								alignItems: "center",
								fontSize: "1em",
								zIndex: "2",
								color: color || "white",
							});
						};
					}
					for (const suit of suits) {
						const engType1 = "basic";
						const engType2 = "trick";
						const key1 = engType1 + suit;
						const key2 = engType2 + suit;
						const cards1 = groups[key1];
						const cards2 = groups[key2];
						const discarded1 = data.combos.includes(key1);
						const discarded2 = data.combos.includes(key2);
						const status1 = discarded1 ? "discarded" : cards1 ? "available" : "empty";
						const status2 = discarded2 ? "discarded" : cards2 ? "available" : "empty";
						const suitStr = suitSymbols[suit];
						const item1 = { item: status1 === "available" ? cards1 : [], ItemNoclick: status1 !== "available", itemContainerCss: itemCss };
						const item2 = { item: status2 === "available" ? cards2 : [], ItemNoclick: status2 !== "available", itemContainerCss: itemCss };
						if (status1 === "available") {
							item1.custom = createCustom(suitStr, "red");
							item1.clickItemContainer = makeClickHandler(key1);
						} else if (status1 === "discarded") {
							item1.custom = createCustom(suitStr + " 已弃置过", "blue");
						} else {
							item1.custom = createCustom(suitStr + " 无牌可弃");
						}
						if (status2 === "available") {
							item2.custom = createCustom(suitStr, "red");
							item2.clickItemContainer = makeClickHandler(key2);
						} else if (status2 === "discarded") {
							item2.custom = createCustom(suitStr + " 已弃置过", "blue");
						} else {
							item2.custom = createCustom(suitStr + " 无牌可弃");
						}
						dialog.addNewRow(item1, item2);
					}
					dialog.open();
					_status.imchoosing = true;
					const result = await promise;
					if (!result?.bool) {
						event.result = { bool: false };
						return;
					}
					event.result = { bool: true, cost_data: { cards: result.cards, key: result.key } };
				},
				async content(event, trigger, player) {
					game.playSkillBgm("zggy");
					const { cards, key } = event.cost_data;
					await player.discard(cards);
					const data = player.getStorage("zggylianshuai");
					data.combos.push(key);
					player.setStorage("zggylianshuai", data, true);
					const vcard = new lib.element.VCard({ name: "sha" });
					await player.chooseUseTarget(vcard, false, false);
				},
			},
		},
		init(player, skill) {
			player.initStorage(skill, { combos: [] });
		},
		ai: {
			threaten: 1.5,
		},
	},
	zggyjili: {
		enable: ["phaseUse", "chooseToUse"],
		filterCard(card, player) {
			return !get.tag(card, "damage");
		},
		viewAs: { name: "sha" },
		prompt: "将一张非伤害类牌当普通的【杀】使用",
		check(card) {
			return 6 - get.value(card);
		},
		hiddenCard(player, name) {
			if (name === "sha") {
				return player.hasCards("h", card => !get.is.damageCard(card));
			}
			return false;
		},
		ai: {
			respondSha: true,
			skillTagFilter(player, tag) {
				if (tag === "respondSha") {
					return player.hasCards("h", card => !get.is.damageCard(card));
				}
				return false;
			},
			order: 10,
			result: {
				player(player) {
					return 1;
				},
			},
		},
		group: ["zggyjili_use"],
		subSkill: {
			use: {
				trigger: { player: "useCardToPlayered" },
				filter(event, player) {
					if (get.name(event.card) !== "sha") return false;
					if (event.targets[0] !== event.target) return false;
					if (!player.countCards("h")) return false;
					return true;
				},
				chooseCard(player, eventId) {
					return player
						.chooseCard({
							prompt: "极力：展示一张手牌",
							forced: true,
							position: "h",
							selectCard: 1,
							ai: () => Math.random(),
						})
						.set("id", eventId)
						.set("_global_waiting", true);
				},
				async cost(event, trigger, player) {
					const targets = trigger.targets.filter(t => t !== player && t.isIn());
					if (!targets.length) {
						event.result = { bool: false };
						return;
					}
					const hasEnemy = targets.some(t => get.attitude(player, t) < 0);
					if (!hasEnemy) {
						event.result = { bool: false };
						return;
					}
					const names = targets.map(t => get.translation(t)).join("、");
					const promptText = `你可以与${names}依次展示一张手牌并执行效果`;
					const result = await player
						.chooseBool(get.prompt("zggyjili"), promptText)
						.set("ai", () => true)
						.forResult();
					if (!result.bool) {
						event.result = { bool: false };
						return;
					}
					event.result = { bool: true, cost_data: { targets } };
				},
				async content(event, trigger, player) {
					game.playSkillBgm("zggy");
					const targets = event.cost_data.targets;
					const chooseCard = get.info("zggyjili_use").chooseCard;
					for (const target of targets) {
						let pResult, tResult;
						if (player.isOnline() || target.isOnline()) {
							const map = await game.chooseAnyOL([player, target], chooseCard, []).forResult();
							pResult = map.get(player);
							tResult = map.get(target);
						} else {
							const eventId = get.id();
							pResult = await chooseCard(player, eventId).forResult();
							if (target.countCards("h")) {
								tResult = await chooseCard(target, eventId).forResult();
							}
						}
						if (!pResult?.bool || !pResult.cards?.length) continue;
						const pCard = pResult.cards[0];
						player.showCards([pCard], `${get.translation(player)}对${get.translation(target)}展示了手牌`);
						const pNum = get.number(pCard, false) || 0;
						let tNum = 7;
						if (tResult?.bool && tResult.cards?.length) {
							const tCard = tResult.cards[0];
							target.showCards([tCard], `${get.translation(target)}展示了手牌`);
							tNum = get.number(tCard, false) || 0;
						} else {
							game.log(target, "无手牌，视为展示7点");
						}
						const X = Math.floor(Math.abs(pNum - tNum) / 2);
						const Y = Math.ceil(X / 2);
						if (X === 0) {
							trigger.directHit.add(target);
							game.log(player, "令此【杀】对", get.translation(target), "不可被响应");
							continue;
						}
						const choices = ["选项一", "选项二", "选项三"];
						const choiceList = [`摸${get.cnNumber(X)}张牌`, `此【杀】对${get.translation(target)}伤害+${Y}`, `令此【杀】对${get.translation(target)}无法被响应`];
						const control = await player
							.chooseControl({
								controls: choices,
								prompt: `极力：对${get.translation(target)}选择一项`,
								choiceList,
								ai: () => {
									if (X >= 4) return "选项一";
									const rand = Math.random();
									if (rand < 0.4) return "选项一";
									if (0.4 < rand && rand < 0.8) return "选项二";
									return "选项三";
								},
							})
							.forResult();
						if (control.control === "选项一") {
							await player.draw(X);
						} else if (control.control === "选项二") {
							player.addTempSkill("zggyjili_damage");
							const list = player.getStorage("zggyjili_damage_list") || [];
							list.push({ target, card: trigger.card, num: Y });
							player.setStorage("zggyjili_damage_list", list, true);
						} else {
							trigger.directHit.add(target);
							game.log(player, "令此【杀】对", get.translation(target), "不可被响应");
						}
					}
				},
			},
			damage: {
				charlotte: true,
				trigger: { global: "damageBegin1" },
				forced: true,
				silent: true,
				popup: false,
				filter(event, player) {
					const list = player.getStorage("zggyjili_damage_list") || [];
					return list.some(item => item.num > 0 && item.card === event.card && item.target === event.player && event.source === player);
				},
				content(event, trigger, player) {
					const list = player.getStorage("zggyjili_damage_list") || [];
					const item = list.find(i => i.num > 0 && i.card === trigger.card && i.target === trigger.player);
					if (item) {
						trigger.num += item.num;
						const newList = list.filter(i => i !== item);
						player.setStorage("zggyjili_damage_list", newList, true);
					}
				},
			},
		},
	},
};
