import { lib, game, ui, get, ai, _status } from "../../../../../../noname.js";

export const skills = {
	atzwxingmian: {
		audio: ["ext:奥特之星/assets/audio/xingmian"],
		trigger: { global: "phaseBegin" },
		filter(event, player) {
			if (player.countCards("he") === 0) return false;
			const usedNames = player.getStorage("atzwxingmian_used", []);
			return (
				get.inpileVCardList(info => {
					if (!["basic", "trick"].includes(info[0])) return false;
					if (usedNames.includes(info[2])) return false;
					const card = get.autoViewAs({ name: info[2], nature: info[3] }, "unsure");
					return player.hasUseTarget(card);
				}).length > 0
			);
		},
		async cost(event, trigger, player) {
			const cardResult = await player
				.chooseCard("he", get.prompt2("atzwxingmian"))
				.set("ai", card => 6 - get.value(card))
				.forResult();
			if (!cardResult?.bool) {
				event.result = { bool: false };
				return;
			}
			const costCard = cardResult.cards[0];
			const usedNames = player.getStorage("atzwxingmian_used", []);
			const list = get.inpileVCardList(info => {
				if (!["basic", "trick"].includes(info[0])) return false;
				if (usedNames.includes(info[2])) return false;
				const card = get.autoViewAs({ name: info[2], nature: info[3] }, "unsure");
				return player.hasUseTarget(card);
			});
			if (list.length === 0) {
				event.result = { bool: false };
				return;
			}
			const buttonResult = await player
				.chooseButton(["星冕：选择要使用的牌", [list, "vcard"]], true)
				.set("ai", button => {
					return player.getUseValue({ name: button.link[2], nature: button.link[3] });
				})
				.forResult();
			if (!buttonResult?.bool) {
				event.result = { bool: false };
				return;
			}
			event.result = {
				bool: true,
				cost_data: {
					costCard: costCard,
					cardName: buttonResult.links[0][2],
					cardNature: buttonResult.links[0][3],
				},
			};
		},
		async content(event, trigger, player) {
			const { costCard, cardName, cardNature } = event.cost_data;
			player.addTempSkill("atzwxingmian_used", "roundStart");
			player.markAuto("atzwxingmian_used", [cardName]);
			const card = get.autoViewAs({ name: cardName, nature: cardNature }, [costCard]);
			await player.discard(costCard);
			await player.chooseUseTarget(card, true, false);
		},
		subSkill: {
			used: {
				charlotte: true,
				onremove: true,
				intro: { content: "本轮已使用牌名：$" },
			},
		},
	},
	atzwbuxi: {
		audio: ["ext:奥特之星/assets/audio/buxi1", "ext:奥特之星/assets/audio/buxi2"],
		trigger: { global: ["changeHp"] },
		filter(event, player) {
			if (!event.player || !event.player.isAlive()) return false;
			if (event.name === "changeHp") {
				return event.num !== 0;
			}
			return true;
		},
		async cost(event, trigger, player) {
			const target = trigger.player;
			const stat = player.getStat("skill");
			if (!stat.atzwbuxi) stat.atzwbuxi = 0;
			if (stat.atzwbuxi >= 4) {
				event.result = { bool: false };
				return;
			}
			const x = target.getHp();
			const choice1Valid = x > 0;
			const isHpFull = target.getHp() >= target.maxHp;
			const discardNum = Math.max(2, x);
			const choice3Valid = !isHpFull && target.countCards("he") >= discardNum;
			const choices = [];
			const choiceList = [];
			if (choice1Valid) {
				choices.push("摸牌");
				choiceList.push(`令其摸${get.cnNumber(x)}张牌`);
			}
			choices.push("取上取下");
			choiceList.push("选择两名角色执行摸牌弃牌");
			if (choice3Valid) {
				choices.push("弃牌回血");
				choiceList.push(`令其弃置${get.cnNumber(discardNum)}张牌，然后回复1点体力`);
			}
			choices.push("cancel");
			const remaining = 4 - stat.atzwbuxi;
			const result = await player
				.chooseControl(choices)
				.set("prompt", `【不息】（剩余${get.cnNumber(remaining)}次）是否令${get.translation(target)}执行一项？`)
				.set("choiceList", choiceList)
				.set("ai", () => {
					const att = get.attitude(player, target);
					const isDying = target.getHp() <= 0;
					if (att < 0) {
						if (choice3Valid && discardNum >= 4) {
							return "弃牌回血";
						}
						return "取上取下";
					} else {
						if (isDying) {
							if (choice3Valid) return "弃牌回血";
							return "取上取下";
						}
						let minfriendCards = 999;
						let maxEnemyCards = 0;
						for (const p of game.players) {
							const a = get.attitude(player, p);
							const cards = p.countCards("h");
							if (a > 0) {
								if (cards < minfriendCards) minfriendCards = cards;
							} else if (a < 0) {
								if (cards > maxEnemyCards) maxEnemyCards = cards;
							}
						}
						if (maxEnemyCards - minfriendCards >= 4) {
							return "取上取下";
						}
						if (choice1Valid && x >= 3) {
							return "摸牌";
						}
						if (choice3Valid && x <= 2) {
							return "弃牌回血";
						}
						return "取上取下";
					}
				})
				.forResult();
			if (result.control === "cancel") {
				event.result = { bool: false };
				return;
			}
			event.result = {
				bool: true,
				cost_data: {
					control: result.control,
					target: target,
					x: x,
					discardNum: discardNum,
				},
			};
		},
		async content(event, trigger, player) {
			const { control, target, x, discardNum } = event.cost_data;
			const stat = player.getStat("skill");
			if (!stat.atzwbuxi) stat.atzwbuxi = 0;
			stat.atzwbuxi++;
			if (control === "摸牌") {
				const num = target.getHp();
				if (num > 0) {
					await target.draw(num);
					game.log(player, "发动了【不息】，令", target, `摸了${get.cnNumber(num)}张牌`);
				}
			} else if (control === "取上取下") {
				let loopCount = 0;
				let targetA, targetB;
				while (loopCount < 20) {
					const targetResult = await player
						.chooseTarget("选择角色A（摸牌）和角色B（弃牌）", (card, player, target) => true, 2, true)
						.set("ai", target => {
							const att = get.attitude(player, target);
							const cards = target.countCards("h");
							if (ui.selected.targets.length === 0) {
								if (att > 0) {
									return 100 - cards;
								}
								return -100;
							} else {
								if (att < 0) {
									return 100 + cards;
								}
								return -100;
							}
						})
						.set("targetprompt", ["摸牌角色", "弃牌角色"])
						.forResult();
					if (!targetResult.bool || !targetResult.targets || targetResult.targets.length < 2) break;
					targetA = targetResult.targets[0];
					targetB = targetResult.targets[1];
					while (true) {
						await targetA.draw();
						if (targetB.countCards("he") > 0) {
							await player.discardPlayerCard(targetB, "he", true, `弃置${get.translation(targetB)}的一张牌`);
						}
						if (targetA.countCards("h") >= targetB.countCards("h")) {
							game.log(player, "发动了【不息】，令", targetA, "与", targetB, "进行了摸牌弃牌流程");
							return;
						}
						const continueResult = await player
							.chooseControl("取上取下", "结束流程")
							.set("prompt", "是否重新选择目标取上取下？")
							.set("ai", () => "取上取下")
							.forResult();
						if (continueResult.control !== "取上取下") {
							game.log(player, "发动了【不息】，令", targetA, "与", targetB, "进行了摸牌弃牌流程");
							return;
						}
						break;
					}
				}
				if (targetA && targetB) {
					game.log(player, "发动了【不息】，令", targetA, "与", targetB, "进行了摸牌弃牌流程");
				}
			} else if (control === "弃牌回血") {
				await target.chooseToDiscard(discardNum, true, "he", `弃置至少${get.cnNumber(discardNum)}张牌`);
				await target.recover();
				game.log(player, "发动了【不息】，令", target, "弃牌后回复了1点体力");
			}
		},
	},
	sjyuzhi: {
		trigger: { global: ["changeHp", "loseAfter", "draw", "gainAfter"] },
		filter(event, player) {
			if (!player.hasSkill("sjzhanren")) return false;
			const target = event.player;
			if (!target || !target.isIn()) return false;
			if (target.storage?.sjyuzhi_executing) return false;
			let evt = event;
			while (evt) {
				if (evt.name === "sjzhanren_trigger" || evt.name === "sjzhanren") {
					return false;
				}
				evt = typeof evt.getParent === "function" ? evt.getParent() : null;
			}
			if (event.name === "changeHp") {
				return target.hp <= 1;
			} else if (event.name === "lose") {
				const cards = event.cards?.filter(card => event.hs?.includes(card));
				if (!cards || cards.length === 0) return false;
				return target.countCards("h") <= 1;
			} else if (event.name === "draw" || event.name === "gain") {
				if (!event.cards || event.cards.length === 0) return false;
				return target.countCards("h") <= 1;
			}
			return false;
		},
		async cost(event, trigger, player) {
			const triggerTarget = trigger.player;
			const result = await player
				.chooseTarget({
					prompt: get.prompt(event.skill),
					prompt2: "令其摸一张牌并对其发动【斩刃】",
					filterTarget: (card, player, target) => target === triggerTarget,
				})
				.set("ai", target => {
					if (target !== triggerTarget) return 0;
					return get.attitude(player, target) > 0 ? 10 : 0;
				})
				.forResult();
			if (!result?.bool) {
				event.result = { bool: false };
				return;
			}
			event.result = { bool: true, targets: result.targets };
		},
		async content(event, trigger, player) {
			const target = event.targets[0];
			if (!target.storage) target.storage = {};
			target.storage.sjyuzhi_executing = true;
			try {
				await target.draw(1);
				const next = game.createEvent("sjzhanren_trigger", false);
				next.player = player;
				next.target = target;
				next.setContent(lib.skill.sjzhanren.content);
				await next;
			} finally {
				delete target.storage.sjyuzhi_executing;
			}
		},
		ai: {
			combo: "sjzhanren",
			order: 10,
			result: {
				target(player, target) {
					if (get.attitude(player, target) > 0) return 3;
					return -3;
				},
			},
		},
	},
	sjzhanren: {
		enable: "phaseUse",
		usable: 1,
		filter(event, player) {
			return game.hasPlayer(current => current.countCards("h") > 0);
		},
		filterTarget(card, player, target) {
			return target.countCards("h") > 0;
		},
		selectTarget: 1,
		async content(event, trigger, player) {
			game.playSkillBgm("sj");
			const target = event.target;
			const num = target.countCards("h");
			const cards = get.cards(num, true);
			const targetHandCards = target.getCards("h");
			const allCards = cards.concat(targetHandCards);
			const handCount = targetHandCards.length;
			const suitMap = {};
			for (const card of allCards) {
				const suit = get.suit(card, target);
				if (suit && suit !== "none") {
					if (!suitMap[suit]) suitMap[suit] = [];
					suitMap[suit].push(card);
				}
			}
			let canOneClickDraw = false;
			let maxSuit = null;
			let maxSuitCount = 0;
			if (handCount > 1) {
				for (const suit in suitMap) {
					if (suitMap[suit].length >= handCount && suitMap[suit].length > maxSuitCount) {
						maxSuitCount = suitMap[suit].length;
						maxSuit = suit;
						canOneClickDraw = true;
					}
				}
			}
			let canOneClickDiscard = false;
			if (handCount > 1) {
				const uniqueSuits = Object.keys(suitMap);
				if (uniqueSuits.length >= handCount) {
					canOneClickDiscard = true;
				}
			}
			const moveEvent = player
				.chooseToMove_new("斩刃：选择任意张牌进行交换", true)
				.set("list", [
					["牌堆顶的牌", cards],
					[get.translation(target) + "的手牌", targetHandCards],
				])
				.set("filterMove", (from, to, moved) => typeof to !== "number")
				.set("processAI", list => {
					const player = get.player();
					const target = get.event().getParent().target;
					const attitude = get.attitude(player, target);
					const allCards = list.map(i => i[1]).flat();
					const handCount = target.countCards("h");
					if (attitude >= 0) {
						const suitMap = {};
						for (const card of allCards) {
							const suit = get.suit(card, target);
							if (!suitMap[suit]) suitMap[suit] = [];
							suitMap[suit].push(card);
						}
						let bestSuit = null;
						let maxCount = 0;
						for (const suit in suitMap) {
							if (suitMap[suit].length >= handCount && suitMap[suit].length > maxCount) {
								maxCount = suitMap[suit].length;
								bestSuit = suit;
							}
						}
						if (bestSuit) {
							const sameSuitCards = suitMap[bestSuit].slice(0, handCount);
							const remaining = allCards.filter(c => !sameSuitCards.includes(c));
							return [remaining, sameSuitCards];
						}
						const sorted = allCards.sort((a, b) => get.value(b, target) - get.value(a, target));
						const topCards = sorted.slice(0, handCount);
						const topSuits = new Set(topCards.map(c => get.suit(c, target)).filter(s => s && s !== "none"));
						if (topSuits.size === handCount && handCount > 1) {
							for (let i = handCount; i < sorted.length; i++) {
								const swapSuit = get.suit(sorted[i], target);
								if (swapSuit && swapSuit !== "none" && topSuits.has(swapSuit)) {
									sorted.splice(i, 1);
									sorted.pop();
									sorted.push(sorted.splice(handCount - 1, 1)[0]);
									break;
								}
							}
						}
						const highValue = sorted.slice(0, handCount);
						const remaining = sorted.slice(handCount);
						return [remaining, highValue];
					} else {
						const suitSet = new Set();
						const uniqueSuitCards = [];
						for (const card of allCards) {
							const suit = get.suit(card, target);
							if (!suitSet.has(suit) && uniqueSuitCards.length < handCount) {
								suitSet.add(suit);
								uniqueSuitCards.push(card);
							}
						}
						if (uniqueSuitCards.length === handCount) {
							const remaining = allCards.filter(c => !uniqueSuitCards.includes(c));
							return [remaining, uniqueSuitCards];
						}
						const sorted = allCards.sort((a, b) => get.value(a, target) - get.value(b, target));
						const topCards = sorted.slice(0, handCount);
						const firstSuit = get.suit(topCards[0], target);
						if (firstSuit && firstSuit !== "none" && topCards.every(c => get.suit(c, target) === firstSuit)) {
							for (let i = handCount; i < sorted.length; i++) {
								const swapSuit = get.suit(sorted[i], target);
								if (swapSuit && swapSuit !== "none" && swapSuit !== firstSuit) {
									sorted.splice(i, 1);
									sorted.pop();
									sorted.push(sorted.splice(handCount - 1, 1)[0]);
									break;
								}
							}
						}
						const lowValue = sorted.slice(0, handCount);
						const remaining = sorted.slice(handCount);
						return [remaining, lowValue];
					}
				});
			let sjControl = null;
			if (canOneClickDraw || canOneClickDiscard) {
				let retryCount = 0;
				const injectButtons = () => {
					const dialog = moveEvent.dialog;
					if (!dialog) {
						if (retryCount < 20) {
							retryCount++;
							setTimeout(injectButtons, 50);
						}
						return;
					}
					if (sjControl || ui.control.querySelector(".sjzhanren-control")) return;
					sjControl = ui.create.div(".control.sjzhanren-control");
					sjControl.style.opacity = "0";
					if (canOneClickDraw) {
						const drawBtn = document.createElement("div");
						drawBtn.link = "sj_draw";
						drawBtn.innerHTML = "一键摸牌（" + get.translation(maxSuit) + "）";
						drawBtn.css({ position: "relative", padding: "3px", margin: "0", cursor: "pointer" });
						drawBtn.addEventListener(lib.config.touchscreen ? "touchend" : "click", function (e) {
							e.stopPropagation();
							const containers = dialog.itemContainers;
							if (!containers || containers.length < 5) return;
							const pileContainer = containers[2];
							const handContainer = containers[4];
							const allCardElems = [...Array.from(pileContainer.children), ...Array.from(handContainer.children)];
							const sameSuitCards = suitMap[maxSuit].slice(0, handCount);
							const sameSuitElems = allCardElems.filter(elem => sameSuitCards.includes(elem.link));
							const remainingElems = allCardElems.filter(elem => !sameSuitCards.includes(elem.link));
							while (pileContainer.firstChild) pileContainer.removeChild(pileContainer.firstChild);
							while (handContainer.firstChild) handContainer.removeChild(handContainer.firstChild);
							for (const elem of remainingElems) pileContainer.appendChild(elem);
							for (const elem of sameSuitElems) handContainer.appendChild(elem);
							moveEvent.moved = [Array.from(pileContainer.children).map(e => e.link), Array.from(handContainer.children).map(e => e.link)];
							ui.create.confirm("o");
							game.log(player, "使用了一键摸牌，将" + get.translation(target) + "的手牌替换为" + get.translation(maxSuit) + "花色");
						});
						if (lib.config.button_press) {
							drawBtn.addEventListener(lib.config.touchscreen ? "touchstart" : "mousedown", function () {
								this.classList.add("controlpressdown");
							});
							drawBtn.addEventListener(lib.config.touchscreen ? "touchend" : "mouseup", function () {
								this.classList.remove("controlpressdown");
							});
						}
						sjControl.appendChild(drawBtn);
					}
					if (canOneClickDiscard) {
						const discardBtn = document.createElement("div");
						discardBtn.link = "sj_discard";
						discardBtn.innerHTML = "一键弃牌";
						discardBtn.css({ position: "relative", padding: "3px", margin: "0 0 0 6px", cursor: "pointer" });
						discardBtn.addEventListener(lib.config.touchscreen ? "touchend" : "click", function (e) {
							e.stopPropagation();
							const containers = dialog.itemContainers;
							if (!containers || containers.length < 5) return;
							const pileContainer = containers[2];
							const handContainer = containers[4];
							const allCardElems = [...Array.from(pileContainer.children), ...Array.from(handContainer.children)];
							const suitSet = new Set();
							const uniqueSuitElems = [];
							for (const elem of allCardElems) {
								const suit = get.suit(elem.link, target);
								if (suit && suit !== "none" && !suitSet.has(suit) && uniqueSuitElems.length < handCount) {
									suitSet.add(suit);
									uniqueSuitElems.push(elem);
								}
							}
							if (uniqueSuitElems.length < handCount) return;
							const remainingElems = allCardElems.filter(elem => !uniqueSuitElems.includes(elem));
							while (pileContainer.firstChild) pileContainer.removeChild(pileContainer.firstChild);
							while (handContainer.firstChild) handContainer.removeChild(handContainer.firstChild);
							for (const elem of remainingElems) pileContainer.appendChild(elem);
							for (const elem of uniqueSuitElems) handContainer.appendChild(elem);
							moveEvent.moved = [Array.from(pileContainer.children).map(e => e.link), Array.from(handContainer.children).map(e => e.link)];
							ui.create.confirm("o");
							game.log(player, "使用了一键弃牌，将" + get.translation(target) + "的手牌替换为不同花色");
						});
						if (lib.config.button_press) {
							discardBtn.addEventListener(lib.config.touchscreen ? "touchstart" : "mousedown", function () {
								this.classList.add("controlpressdown");
							});
							discardBtn.addEventListener(lib.config.touchscreen ? "touchend" : "mouseup", function () {
								this.classList.remove("controlpressdown");
							});
						}
						sjControl.appendChild(discardBtn);
					}
					ui.control.insertBefore(sjControl, ui.confirm);
					ui.updatec();
					setTimeout(() => {
						if (sjControl && sjControl.parentNode) {
							sjControl.style.transition = "opacity 0.5s";
							sjControl.style.opacity = "1";
							ui.refresh(sjControl);
							sjControl.style.transition = "";
						}
					}, 50);
				};
				setTimeout(injectButtons, 50);
			}
			const result = await moveEvent.forResult();
			if (sjControl && sjControl.parentNode) {
				sjControl.addTempClass("controlpressdownx", 500);
				setTimeout(() => {
					if (sjControl && sjControl.parentNode) sjControl.parentNode.removeChild(sjControl);
					sjControl = null;
					ui.updatec();
				});
			}
			if (result?.bool) {
				await game
					.loseAsync({
						player,
						target,
						cards: result.moved.flat(),
						moved: result.moved,
					})
					.setContent(async function (event, trigger, player) {
						const { target, cards, moved } = event;
						const hs = target.getCards("h");
						const gain = moved[1].filter(card => !hs.includes(card));
						const puts = moved[0].filter(card => hs.includes(card));
						const originPile = cards.slice().removeArray(hs);
						if (puts.length) {
							target.$throw(puts.length, 100);
							await target.lose(puts, ui.ordering).set("getlx", false);
						}
						await game.cardsGotoOrdering(originPile);
						if (gain.length) {
							await target.gain(gain, "draw").set("getlx", false);
						}
						await game.cardsGotoPile(moved[0].slice().reverse(), ["insert_card", true]);
						game.addCardKnower(moved[0], player);
					});
			}
			const hs = target.getCards("h");
			if (hs.length === 0) return;
			const suits = [];
			const map = {};
			for (const card of hs) {
				const suit = get.suit(card, target);
				if (!map[suit]) {
					map[suit] = 1;
				} else {
					map[suit]++;
				}
				suits.push(suit);
			}
			const uniqueSuits = suits.filter((v, i, a) => a.indexOf(v) === i);
			let triggered = false;
			if (hs.length === 1) {
				const result = await player
					.chooseControl(["弃牌", "摸牌"])
					.set("prompt", "斩刃：请为" + get.translation(target) + "选择一项")
					.set("ai", () => {
						const attitude = get.attitude(player, target);
						return attitude >= 0 ? "摸牌" : "弃牌";
					})
					.forResult();
				if (result.control === "弃牌") {
					await target.discard(hs);
					game.log(player, "弃置了" + get.translation(target) + "的所有手牌");
					triggered = true;
				} else {
					const bottomCards = get.bottomCards(1);
					if (bottomCards.length > 0) {
						await target.gain(bottomCards, "draw");
					}
					game.log(player, "令" + get.translation(target) + "从牌堆底摸了1张牌");
					triggered = true;
				}
			} else if (uniqueSuits.length === hs.length) {
				await target.discard(hs);
				game.log(player, "弃置了" + get.translation(target) + "的所有手牌（花色均不相同）");
				triggered = true;
			} else if (uniqueSuits.length === 1) {
				const drawNum = hs.length;
				const bottomCards = get.bottomCards(drawNum);
				if (bottomCards.length > 0) {
					await target.gain(bottomCards, "draw");
				}
				game.log(player, "令" + get.translation(target) + "从牌堆底摸了" + drawNum + "张牌（花色均相同）");
				triggered = true;
			}
			if (triggered) {
				const stat = player.getStat("skill");
				stat.sjzhanren = 0;
			}
		},
		ai: {
			order: 10,
			result: {
				target(player, target) {
					if (target !== player) {
						if (target.countCards("h") > 3) return -5;
						if (target.countCards("h") === 3) return -3;
					}
					return 0.5;
				},
			},
		},
	},
};
