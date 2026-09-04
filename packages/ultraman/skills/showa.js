import { lib, game, ui, get, ai, _status } from "../../../../../noname.js";

export const skills = {
	aplxiongye: {
		forced: true,
		audio: ["ext:奥特之星/assets/ultraman/audio/skill/xiongye1", "ext:奥特之星/assets/ultraman/audio/skill/xiongye2"],
		trigger: { global: ["damageBegin2", "damageBegin4"] },
		filter(event, player, triggerName) {
			if (triggerName === "damageBegin2" && event.source === player && event.player !== player) return true;
			if (triggerName === "damageBegin4" && event.player === player && event.source && event.source !== player) return true;
			return false;
		},
		async content(event, trigger, player) {
			const num = trigger.num;
			const cards = get.cards(num * 3);
			for (const card of cards) {
				card.classList.add("glory2");
			}
			const next = player.addToExpansion(cards, player, "give");
			next.gaintag.add("aplxiongye");
			await next;
			player.markSkill("aplxiongye");
			game.log(player, "将牌堆顶的" + num * 3 + "张牌扣置于武将牌上，称为“野”");
		},
		marktext: "野",
		intro: {
			name: "野",
			markcount: "expansion",
			mark(dialog, storage, player) {
				const cards = player.getExpansions("aplxiongye");
				if (player.isUnderControl(true)) dialog.addAuto(cards);
				else return "共有" + cards.length + "张“野”牌";
			},
		},
		async onremove(player, skill) {
			const cards = player.getExpansions("aplxiongye");
			if (cards.length) {
				await player.loseToDiscardpile(cards);
			}
		},
		mod: {
			aiOrder(player, card, num) {
				if (get.itemtype(card) === "card" && card.hasGaintag("aplxiongye")) {
					return num + 0.5;
				}
			},
		},
		group: ["aplxiongye_use"],
		subSkill: {
			use: {
				enable: ["phaseUse", "chooseToUse", "chooseToRespond"],
				hiddenCard(player, name) {
					if (!["wuxie", "tao", "jiu"].includes(name)) return false;
					const cards = player.getExpansions("aplxiongye");
					return cards.some(card => card.name === name);
				},
				filter(event, player) {
					const cards = player.getExpansions("aplxiongye");
					if (cards.length === 0) return false;
					for (const card of cards) {
						if (event.name === "phaseUse") {
							if (player.hasUseTarget(card)) return true;
						} else if (event.type === "wuxie") {
							if (card.name === "wuxie") return true;
						} else if (event.type === "dying") {
							if (card.name === "tao" || card.name === "jiu") return true;
						} else if (event.filterCard?.(card, player, event)) {
							return true;
						}
					}
					return false;
				},
				chooseButton: {
					dialog(event, player) {
						const cards = player.getExpansions("aplxiongye");
						const usableCards = [];
						for (const card of cards) {
							let canUse = false;
							if (event.name === "phaseUse") {
								canUse = player.hasUseTarget(card);
								if (canUse && card.name === "jiedaosharen") {
									canUse = game.hasPlayer(p => lib.filter.targetEnabled2(card, player, p));
								}
							} else if (event.type === "wuxie") {
								canUse = card.name === "wuxie";
							} else if (event.type === "dying") {
								canUse = card.name === "tao" || card.name === "jiu";
							} else if (event.filterCard) {
								canUse = event.filterCard(card, player, event);
							}
							if (canUse) usableCards.push(card);
						}
						const dialog = ui.create.dialog("雄野：选择一张牌");
						if (usableCards.length > 0) {
							dialog.add(usableCards);
						}
						return dialog;
					},
					filter(button, player) {
						const evt = get.event().getParent();
						const card = button.link;
						if (evt.name === "phaseUse") {
							let canUse = player.hasUseTarget(card);
							if (canUse && card.name === "jiedaosharen") {
								canUse = game.hasPlayer(p => lib.filter.targetEnabled2(card, player, p));
							}
							return canUse;
						} else if (evt.type === "wuxie") {
							return card.name === "wuxie";
						} else if (evt.type === "dying") {
							return card.name === "tao" || card.name === "jiu";
						}
						return evt.filterCard?.(card, player, evt) ?? false;
					},
					check(button) {
						const player = get.player();
						const card = button.link;
						const evt = get.event().getParent();
						if (evt.type === "dying" && evt.dying) {
							const attitude = get.attitude(player, evt.dying);
							if (attitude <= 0) return -10;
							return 5 + attitude;
						}
						return player.getUseValue(card);
					},
					backup(links, player) {
						const card = links[0];
						return {
							filterCard(c) {
								return c === card;
							},
							selectCard: -1,
							position: "x",
							viewAs: card,
							popname: true,
							card: card,
						};
					},
					prompt(links, player) {
						return "选择" + get.translation(links[0]) + "的目标";
					},
				},
				ai: {
					order: 10,
					result: {
						player(player) {
							return 1;
						},
						target(player, target) {
							const evt = get.event();
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
					skillTagFilter(player, tag, arg) {
						const cards = player.getExpansions("aplxiongye");
						let name;
						if (tag === "respondSha") name = "sha";
						else if (tag === "respondShan") name = "shan";
						else if (tag === "respondWuxie") name = "wuxie";
						else if (tag === "save") name = "tao";
						else return false;
						return cards.some(card => card.name === name);
					},
				},
			},
		},
	},
	aplaojie: {
		mod: {
			cardEnabled(card, player) {
				if (card.name === "shan") return false;
			},
			cardRespondable(card, player) {
				if (card.name === "shan") return false;
			},
			cardSavable(card, player) {
				if (card.name === "shan") return false;
			},
		},
	},
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
	atzwxingmian: {
		audio: ["ext:奥特之星/assets/ultraman/audio/skill/xingmian"],
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
		audio: ["ext:奥特之星/assets/ultraman/audio/skill/buxi1", "ext:奥特之星/assets/ultraman/audio/skill/buxi2"],
		trigger: { global: ["changeHp"] },
		filter(event, player) {
			if (!event.player || !event.player.isAlive()) return false;
			if (event.name === "damage") {
				return event.num > 0;
			}
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
	jkshouzhuo: {
		audio: ["ext:奥特之星/assets/ultraman/audio/skill/shouzhuo"],
		enable: ["chooseToUse", "chooseToRespond"],
		hiddenCard(player, name) {
			if (name === "wuxie") {
				if (_status.currentPhase === player) return false;
				return player.hasCard(card => get.color(card) === "red", "he");
			}
			return false;
		},
		filter(event, player) {
			if (!player.hasCards("he")) return false;
			const isMyPhase = _status.currentPhase === player;
			if (event.type === "wuxie") {
				if (isMyPhase) return false;
				return player.hasCard(card => get.color(card) === "red", "he");
			}
			const list = [];
			if (isMyPhase) {
				if (player.hasCard(card => get.color(card) === "black", "he")) {
					if (event.filterCard(get.autoViewAs({ name: "sha" }, "unsure"), player, event)) list.push("sha");
					if (event.filterCard(get.autoViewAs({ name: "jiu" }, "unsure"), player, event)) list.push("jiu");
				}
			} else {
				if (player.hasCard(card => get.color(card) === "red", "he")) {
					if (event.filterCard(get.autoViewAs({ name: "shan" }, "unsure"), player, event)) list.push("shan");
				}
			}
			return list.length > 0;
		},
		chooseButton: {
			dialog(event, player) {
				const list = [];
				const isMyPhase = _status.currentPhase === player;
				if (event.type === "wuxie") {
					list.push(["锦囊", "", "wuxie"]);
				} else if (isMyPhase) {
					if (player.hasCard(card => get.color(card) === "black", "he")) {
						if (event.filterCard(get.autoViewAs({ name: "sha" }, "unsure"), player, event)) list.push(["基本", "", "sha"]);
						if (event.filterCard(get.autoViewAs({ name: "jiu" }, "unsure"), player, event)) list.push(["基本", "", "jiu"]);
					}
				} else {
					if (player.hasCard(card => get.color(card) === "red", "he")) {
						if (event.filterCard(get.autoViewAs({ name: "shan" }, "unsure"), player, event)) list.push(["基本", "", "shan"]);
					}
				}
				return ui.create.dialog("手镯", [list, "vcard"]);
			},
			check(button) {
				const player = get.player();
				const name = button.link[2];
				const val = player.getUseValue({ name: name });
				const drawNum = Math.max(0, player.maxHp - player.countCards("h") + 1);
				return val + drawNum * 1.5 + 10;
			},
			backup(links, player) {
				const name = links[0][2];
				return {
					filterCard(card) {
						if (name === "sha" || name === "jiu") return get.color(card) === "black";
						if (name === "shan" || name === "wuxie") return get.color(card) === "red";
						return false;
					},
					position: "he",
					popname: true,
					check(card) {
						return 15 - get.value(card);
					},
					viewAs(cards) {
						if (!cards || !cards.length) return { name: name };
						const card = cards[0];
						return { name: name, suit: get.suit(card), number: get.number(card) };
					},
					async onuse(result, player) {
						player.logSkill("jkshouzhuo");
						const usedFromHand = (result.cards || []).filter(card => get.position(card) === "h").length;
						const num = Math.max(0, player.maxHp - player.countCards("h") + usedFromHand);
						if (num > 0) await player.draw(num);
					},
				};
			},
			prompt(links, player) {
				const name = links[0][2];
				const map = {
					sha: "黑色牌当做【杀】使用或打出",
					jiu: "黑色牌当做【酒】使用或打出",
					shan: "红色牌当做【闪】使用或打出",
					wuxie: "红色牌当做【无懈可击】使用",
				};
				return "将一张" + map[name];
			},
		},
		ai: {
			respondSha: true,
			respondShan: true,
			respondWuxie: true,
			respondJiu: true,
			skillTagFilter(player, tag) {
				const isMyPhase = _status.currentPhase === player;
				if (tag === "respondSha") {
					if (!isMyPhase) return false;
					return player.hasCard(card => get.color(card) === "black", "he");
				}
				if (tag === "respondShan" || tag === "respondWuxie") {
					if (isMyPhase) return false;
					return player.hasCard(card => get.color(card) === "red", "he");
				}
				if (tag === "respondJiu") {
					if (!isMyPhase) return false;
					return player.hasCard(card => get.color(card) === "black", "he");
				}
				return false;
			},
			order: 9,
			result: {
				player(player) {
					const drawNum = Math.max(0, player.maxHp - player.countCards("h") + 1);
					return 1 + drawNum * 0.5;
				},
			},
		},
	},
	jkjuedi: {
		trigger: { global: ["gameStart", "dieAfter", "reviveAfter", "restBegin", "restEnd"] },
		forced: true,
		locked: true,
		skillAnimation: true,
		animationColor: "gold",
		filter(event, player, name) {
			const aliveCount = game.countPlayer(p => p.isAlive());
			return aliveCount === 3 && !player.getStorage("jkjuedi_active", false);
		},
		async content(event, trigger, player) {
			player.setStorage("jkjuedi_active", 3);
			game.log(player, "发动了【绝地】，将持续" + get.cnNumber(3) + "个回合");
			game.playSkillBgm("jkjuedi");
			const targets = game.filterPlayer(current => current !== player);
			for (const target of targets) {
				target.addSkill("jkjuedi_disabled");
			}
		},
		mod: {
			cardUsable(card, player, num) {
				if (player.getStorage("jkjuedi_active", 0) > 0) {
					if (card.name === "sha") return num + 1;
				}
			},
			targetInRange(card, player, target) {
				if (player.getStorage("jkjuedi_active", 0) > 0) {
					return true;
				}
			},
		},
		group: ["jkjuedi_skipJudge", "jkjuedi_skipDiscard", "jkjuedi_phaseEnd", "jkjuedi_die"],
		subSkill: {
			skipJudge: {
				trigger: { player: "phaseJudgeBefore" },
				forced: true,
				filter(event, player) {
					return player.getStorage("jkjuedi_active", 0) > 0;
				},
				async content(event, trigger, player) {
					trigger.cancel();
				},
			},
			skipDiscard: {
				trigger: { player: "phaseDiscardBefore" },
				forced: true,
				filter(event, player) {
					return player.getStorage("jkjuedi_active", 0) > 0;
				},
				async content(event, trigger, player) {
					trigger.cancel();
				},
			},
			phaseEnd: {
				trigger: { player: "phaseEnd" },
				forced: true,
				filter(event, player) {
					return player.getStorage("jkjuedi_active", 0) > 0;
				},
				async content(event, trigger, player) {
					const remaining = player.getStorage("jkjuedi_active", 0) - 1;
					player.setStorage("jkjuedi_active", remaining);
					if (remaining <= 0) {
						player.setStorage("jkjuedi_active", 0);
						const targets = game.filterPlayer(current => current !== player);
						for (const target of targets) {
							target.removeSkill("jkjuedi_disabled");
						}
						if (game.jkjuedi_audio && !game.jkjuedi_audio.ended) {
							game.jkjuedi_audio.pause();
							game.jkjuedi_audio.currentTime = 0;
						}
						game.log(player, "的【绝地】效果结束");
					}
				},
			},
			disabled: {
				inherit: "baiban",
				charlotte: true,
				mark: true,
				marktext: "绝",
				intro: {
					content(storage, player, skill) {
						const list = player.getSkills(null, false, false).filter(i => lib.skill.baiban.skillBlocker(i, player));
						const source = game.findPlayer(p => p.getStorage("jkjuedi_active", 0) > 0);
						const remaining = source ? source.getStorage("jkjuedi_active", 0) : 0;
						let str = "";
						if (list.length) str += "<li>" + get.translation(list) + "失效";
						if (remaining > 0) str += "<li>剩余" + get.cnNumber(remaining) + "个回合<br>";
						else str += "<li>无失效技能";
						return str;
					},
				},
				markcount(storage, player) {
					const source = game.findPlayer(p => p.getStorage("jkjuedi_active", 0) > 0);
					return source ? source.getStorage("jkjuedi_active", 0) : 0;
				},
				onremove(player) {
					delete player.storage.jkjuedi_disabled;
				},
			},
		},
	},
	atmguanglun: {
		audio: ["ext:奥特之星/assets/ultraman/audio/skill/guanglun"],
		group: ["atmguanglun_viewas", "atmguanglun_reset"],
		trigger: { player: "useCardEffectEnd" },
		direct: true,
		filter(event, player) {
			if (!event.card) return false;
			const name = event.card.name;
			if (!name) return false;
			if (get.type(event.card) === "delay") return false;
			if (!get.tag(event.card, "damage")) return false;
			const targets = event.targets ?? [];
			if (event.effectedCount < event.effectCount) return false;
			const triggeredNames = player.getStorage("atmguanglun_triggered_names", []);
			if (triggeredNames.includes(name)) return false;
			return true;
		},
		async content(event, trigger, player) {
			const card = trigger.card;
			const cardName = card.name;
			if (!cardName) return;
			const choices = ["摸两张牌"];
			if (player.hp < player.maxHp) {
				choices.push("回复一点体力");
			}
			choices.push("cancel2");
			const result = await player
				.chooseControl(choices)
				.set("prompt", "光轮：请选择")
				.set("ai", () => {
					const evt = get.event();
					const p = evt.player;
					if (p.hp < p.maxHp && p.hp <= 2) return "回复一点体力";
					return "摸两张牌";
				})
				.forResult();
			if (result.control !== "cancel2") {
				player.logSkill("atmguanglun");
				game.playSkillBgm("atmguanglun");
				const triggeredNames = player.getStorage("atmguanglun_triggered_names", []);
				if (!triggeredNames.includes(cardName)) {
					triggeredNames.push(cardName);
					player.setStorage("atmguanglun_triggered_names", triggeredNames);
				}
				if (result.control === "摸两张牌") {
					await player.draw(2);
				} else if (result.control === "回复一点体力") {
					await player.recover(1);
				}
				const targets = trigger.targets ?? [];
				if (targets.length > 0 && targets[0].isAlive()) {
					trigger.effectCount++;
					game.log(trigger.card, "额外结算一次");
				}
			}
		},
		subSkill: {
			viewas: {
				enable: "phaseUse",
				hiddenCard(player, name) {
					const usedNames = player.getStorage("atmguanglun_used", []);
					const allowedCards = ["juedou", "huogong"];
					return allowedCards.includes(name) && !usedNames.includes(name);
				},
				filter(event, player) {
					const usedNames = player.getStorage("atmguanglun_used", []);
					const allowedCards = ["juedou", "huogong"];
					return allowedCards.some(name => !usedNames.includes(name));
				},
				chooseButton: {
					dialog(event, player) {
						const usedNames = player.getStorage("atmguanglun_used", []);
						const allowedCards = ["juedou", "huogong"];
						const list = [];
						for (const name of allowedCards) {
							if (!usedNames.includes(name)) {
								list.push([get.type({ name: name }, "trick"), "", name]);
							}
						}
						return ui.create.dialog("光轮：选择一张牌视为使用", [list, "vcard"]);
					},
					check(button) {
						return get.player().getUseValue({ name: button.link[2] });
					},
					backup(links, player) {
						const name = links[0][2];
						return {
							audio: "ext:奥特之星/assets/ultraman/audio/skill/guanglun",
							filterCard: () => false,
							selectCard: -1,
							viewAs: { name: name },
							async onuse(result, player) {
								const usedNames = player.getStorage("atmguanglun_used", []);
								if (!usedNames.includes(name)) {
									usedNames.push(name);
									player.setStorage("atmguanglun_used", usedNames);
								}
							},
						};
					},
					prompt(links, player) {
						return "选择" + get.translation(links[0][2]) + "的目标";
					},
				},
				ai: {
					order: 7,
					result: {
						player(player) {
							return 1;
						},
					},
				},
			},
			reset: {
				trigger: { player: "phaseAfter" },
				forced: true,
				silent: true,
				async content(event, trigger, player) {
					player.setStorage("atmguanglun_used", []);
					player.setStorage("atmguanglun_triggered_names", []);
				},
			},
		},
		ai: {
			order: 10,
			result: {
				player(player) {
					return 1;
				},
			},
		},
	},
	atmzhuangshuo: {
		trigger: { player: "damageBefore" },
		forced: true,
		locked: true,
		filter(event, player) {
			return event.nature === "thunder";
		},
		async content(event, trigger, player) {
			trigger.cancel();
		},
		ai: {
			effect: {
				target(player, card, player2, target) {
					if (get.tag(card, "thunderDamage")) return "zerotarget";
				},
			},
		},
	},
	atmnianli: {
		enable: "phaseUse",
		usable: 1,
		filter(event, player) {
			return player.hp > 0 && game.hasPlayer(target => target !== player);
		},
		filterTarget(card, player, target) {
			return target !== player;
		},
		async content(event, trigger, player) {
			await player.loseHp(1);
			if (event.target && event.target.isAlive()) {
				await event.target.damage(1, player);
			}
		},
		ai: {
			order: 4,
			result: {
				player(player, target) {
					if (player.hp <= 1) return -10;
					return get.damageEffect(target, player, player) - 1;
				},
				target(player, target) {
					return -2;
				},
			},
		},
	},
	zfbaqi: {
		enable: "phaseUse",
		usable: 1,
		filter(event, player) {
			return player.getExpansions("zfbaqi_star").length > 0;
		},
		async content(event, trigger, player) {
			const stars = player.getExpansions("zfbaqi_star");
			const selectedCards = stars.slice();
			let values = selectedCards.map((card, index) => ({
				value: get.number(card),
				type: "card",
				card: card,
				index: index,
			}));
			let usedCards = [];
			player.logSkill("zfbaqi");
			while (values.length > 0) {
				if (values.length === 1) {
					if (values[0].value === 87 && usedCards.length > 0) {
						await player.lose(usedCards, "discard");
						const targetResult = await player
							.chooseTarget({
								prompt: "请选择一名其他角色，对其造成其体力上限点伤害",
								forced: true,
								filterTarget: (card, player, target) => target !== player,
							})
							.forResult();
						if (targetResult?.targets && targetResult.targets.length > 0) {
							const target = targetResult.targets[0];
							game.log(player, "对", target, "造成了其体力上限的伤害");
							await target.damage(target.maxHp, player);
						}
					} else {
						game.log(player, "最终结果为" + values[0].value + "，不等于87");
					}
					break;
				}
				const valueControls = values.map(v => v.value.toString());
				const leftResult = await player
					.chooseControl(valueControls)
					.set("prompt", "请选择第一个数")
					.set("ai", (event, player) => {
						if (values.some(v => v.type === "result")) {
							const resultValue = values.find(v => v.type === "result").value;
							return resultValue.toString();
						}
						const numbers = values.filter(v => v.type === "card").map(v => v.value);
						const coreCombos = [
							{ mult1: 6, mult2: [13] },
							{ mult1: 7, mult2: [13, 12, 11] },
							{ mult1: 8, mult2: [12, 11, 10] },
							{ mult1: 9, mult2: [10, 9] },
						];
						for (const combo of coreCombos) {
							if (numbers.includes(combo.mult1)) {
								const matchedMult2 = combo.mult2.find(n => numbers.includes(n));
								if (matchedMult2) {
									if (values.some(v => v.value === combo.mult1)) return combo.mult1.toString();
									if (values.some(v => v.value === matchedMult2)) return matchedMult2.toString();
								}
							}
						}
						return Math.max(...values.map(v => v.value)).toString();
					})
					.forResult();
				if (!leftResult?.control) break;
				const leftValue = parseFloat(leftResult.control);
				const leftMatches = [];
				for (let i = 0; i < values.length; i++) {
					if (values[i].value === leftValue) leftMatches.push(i);
				}
				if (leftMatches.length === 0) break;
				const leftIndex = leftMatches[0];
				const remainingValues = values.filter((_, i) => i !== leftIndex);
				const remainingControls = remainingValues.map(v => v.value.toString());
				const rightResult = await player
					.chooseControl(remainingControls)
					.set("prompt", "请选择第二个数")
					.set("ai", (event, player) => {
						if (values.some(v => v.type === "result" && v.value === leftValue)) {
							const adjustment = Math.abs(leftValue - 87);
							const closest = remainingValues.filter(v => v.type === "card").reduce((prev, curr) => (Math.abs(curr.value - adjustment) < Math.abs(prev.value - adjustment) ? curr : prev));
							return closest.value.toString();
						}
						const numbers = remainingValues.filter(v => v.type === "card").map(v => v.value);
						const coreCombos = [
							{ mult1: 6, mult2: [13] },
							{ mult1: 7, mult2: [13, 12, 11] },
							{ mult1: 8, mult2: [12, 11, 10] },
							{ mult1: 9, mult2: [10, 9] },
						];
						for (const combo of coreCombos) {
							if (leftValue === combo.mult1) {
								const matchedMult2 = combo.mult2.find(n => numbers.includes(n));
								if (matchedMult2) return matchedMult2.toString();
							}
							if (combo.mult2.includes(leftValue)) {
								if (numbers.includes(combo.mult1)) return combo.mult1.toString();
							}
						}
						return Math.max(...remainingValues.map(v => v.value)).toString();
					})
					.forResult();
				if (!rightResult?.control) break;
				const rightValue = parseFloat(rightResult.control);
				const rightMatches = [];
				for (let i = 0; i < values.length; i++) {
					if (i !== leftIndex && values[i].value === rightValue) rightMatches.push(i);
				}
				if (rightMatches.length === 0) break;
				const actualRightIndex = rightMatches[0];
				const leftItem = values[leftIndex];
				const rightItem = values[actualRightIndex];
				values = values.filter((_, i) => i !== leftIndex && i !== actualRightIndex);
				const opList = ["+", "-", "*", "/"];
				const opResult = await player
					.chooseControl(opList)
					.set("prompt", leftItem.value + " ? " + rightItem.value)
					.set("ai", (event, player) => {
						const coreCombos = [
							{ mult1: 6, mult2: [13] },
							{ mult1: 7, mult2: [13, 12, 11] },
							{ mult1: 8, mult2: [12, 11, 10] },
							{ mult1: 9, mult2: [10, 9] },
						];
						for (const combo of coreCombos) {
							if ((leftItem.value === combo.mult1 && combo.mult2.includes(rightItem.value)) || (rightItem.value === combo.mult1 && combo.mult2.includes(leftItem.value))) {
								return "*";
							}
						}
						const results = {
							"+": leftItem.value + rightItem.value,
							"-": leftItem.value - rightItem.value,
							"*": leftItem.value * rightItem.value,
							"/": rightItem.value !== 0 ? Math.floor(leftItem.value / rightItem.value) : Infinity,
						};
						let bestOp = "+";
						let minDist = Math.abs(results["+"] - 87);
						for (const op of ["-", "*", "/"]) {
							const dist = Math.abs(results[op] - 87);
							if (dist < minDist) {
								minDist = dist;
								bestOp = op;
							}
						}
						return bestOp;
					})
					.forResult();
				if (!opResult?.control) break;
				const op = opResult.control;
				let result;
				switch (op) {
					case "+":
						result = leftItem.value + rightItem.value;
						break;
					case "-":
						result = leftItem.value - rightItem.value;
						break;
					case "*":
						result = leftItem.value * rightItem.value;
						break;
					case "/":
						result = rightItem.value !== 0 ? Math.floor(leftItem.value / rightItem.value) : NaN;
						break;
				}
				if (isNaN(result) || !isFinite(result)) {
					game.log(player, "的计算结果无效");
					break;
				}
				game.log(player, "计算：" + leftItem.value + " " + op + " " + rightItem.value + " = " + result);
				if (leftItem.type === "card" && !usedCards.includes(leftItem.card)) usedCards.push(leftItem.card);
				if (rightItem.type === "card" && !usedCards.includes(rightItem.card)) usedCards.push(rightItem.card);
				values.push({
					value: result,
					type: "result",
				});
				if (result === 87) {
					game.playSkillBgm("zf");
					await player.lose(usedCards, "discard");
					const targetResult = await player
						.chooseTarget({
							prompt: "请选择一名其他角色，对其造成其体力上限-1点伤害",
							forced: true,
							filterTarget: (card, player, target) => target !== player,
						})
						.set("ai", target => {
							return get.damageEffect(target, player, player);
						})
						.forResult();
					if (targetResult?.targets && targetResult.targets.length > 0) {
						const target = targetResult.targets[0];
						const baqi = Math.max(3, target.maxHp - 1);
						await target.damage(baqi, player);
					}
					break;
				}
				const continueResult = await player.chooseBool("当前结果为" + result + "，是否继续计算？").forResult();
				if (!continueResult?.bool) break;
			}
		},
		ai: {
			order: 8,
			result: {
				player(player) {
					const stars = player.getExpansions("zfbaqi_star");
					const numbers = stars.map(card => get.number(card));
					if (numbers.includes(87)) return 10;
					const coreCombos = [
						{ mult1: 6, mult2: [13] },
						{ mult1: 7, mult2: [13, 12, 11] },
						{ mult1: 8, mult2: [12, 11, 10] },
						{ mult1: 9, mult2: [10, 9] },
					];
					for (const combo of coreCombos) {
						if (!numbers.includes(combo.mult1)) continue;
						const matchedMult2 = combo.mult2.find(n => numbers.includes(n));
						if (!matchedMult2) continue;
						const product = combo.mult1 * matchedMult2;
						const adjustment = 87 - product;
						const remaining = numbers.filter(n => n !== combo.mult1 && n !== matchedMult2);
						for (const num of remaining) {
							if (num === Math.abs(adjustment)) return 10;
						}
						for (let i = 0; i < remaining.length; i++) {
							for (let j = i + 1; j < remaining.length; j++) {
								const n1 = remaining[i];
								const n2 = remaining[j];
								if (n1 + n2 === adjustment) return 10;
								if (n1 - n2 === adjustment) return 10;
								if (-n1 + n2 === adjustment) return 10;
								if (-n1 - n2 === adjustment) return 10;
							}
						}
						if (remaining.length >= 3) {
							for (let i = 0; i < remaining.length; i++) {
								for (let j = i + 1; j < remaining.length; j++) {
									for (let k = j + 1; k < remaining.length; k++) {
										const n1 = remaining[i];
										const n2 = remaining[j];
										const n3 = remaining[k];
										if (n1 + n2 + n3 === adjustment) return 10;
										if (n1 + n2 - n3 === adjustment) return 10;
										if (n1 - n2 + n3 === adjustment) return 10;
										if (n1 - n2 - n3 === adjustment) return 10;
										if (-n1 + n2 + n3 === adjustment) return 10;
										if (-n1 + n2 - n3 === adjustment) return 10;
										if (-n1 - n2 + n3 === adjustment) return 10;
										if (-n1 - n2 - n3 === adjustment) return 10;
									}
								}
							}
						}
					}
					return 0;
				},
			},
		},
		group: ["zfbaqi_gain"],
		subSkill: {
			gain: {
				trigger: { player: "useCardAfter" },
				forced: true,
				async content(event, trigger, player) {
					const topCards = get.cards(2);
					if (topCards.length > 0) {
						const next = player.addToExpansion(topCards, player, "give");
						next.gaintag.add("zfbaqi_star");
						await next;
						player.markSkill("zfbaqi_star");
						game.log(player, "将牌堆顶" + get.cnNumber(topCards.length, true) + "张牌置于武将牌上，称为“星”");
					}
				},
			},
			star: {
				mark: true,
				marktext: "星",
				intro: {
					name: "星",
					content: "expansion",
					markcount: "expansion",
				},
				async onremove(player, skill) {
					const cards = player.getExpansions(skill);
					if (cards.length) {
						await player.loseToDiscardpile(cards);
					}
				},
			},
		},
	},
	zfyakong: {
		audio: ["ext:奥特之星/assets/ultraman/audio/skill/yakong"],
		trigger: {
			global: "dieAfter",
		},
		limited: true,
		filter(event, player) {
			return event.player !== player;
		},
		check(event, player) {
			return get.attitude(player, event.player) > 0;
		},
		async content(event, trigger, player) {
			player.awakenSkill(event.name);
			const deadPlayer = trigger.player;
			await deadPlayer.revive();
			await deadPlayer.recoverTo(2);
			await deadPlayer.draw(1);
		},
		ai: {
			order: 10,
			result: {
				player(player) {
					return 10;
				},
			},
		},
	},
	tlpoquan: {
		enable: ["phaseUse", "chooseToUse"],
		filterCard(card, player) {
			if (!ui.selected.cards.length) return true;
			const firstCard = ui.selected.cards[0];
			return get.type2(card) !== get.type2(firstCard) && get.color(card) !== get.color(firstCard);
		},
		selectCard: 2,
		viewAs: { name: "sha" },
		check(card) {
			return 5 - get.value(card);
		},
		ai: {
			order: 7,
			result: {
				player(player) {
					return 1;
				},
			},
		},
		group: ["tlpoquan_afterUse", "tlpoquan_draw"],
		subSkill: {
			afterUse: {
				trigger: { player: "useCardAfter" },
				direct: true,
				filter(event, player) {
					if (event.targets.length !== 1 || event.targets[0] === player || event.targets[0].isDead()) {
						return false;
					}
					return true;
				},
				async content(event, trigger, player) {
					const target = trigger.targets[0];
					const firstCard = trigger.card;
					player._tlpoquan_firstCard = {
						color: get.color(firstCard),
						type: get.type2(firstCard),
					};
					await player
						.chooseToUse(
							function (card, player, event) {
								const select = get.info(card).selectTarget;
								if (select !== 1) return false;
								return lib.filter.cardEnabled.apply(this, arguments);
							},
							"迫拳：是否对" + get.translation(target) + "使用一张牌？"
						)
						.set("filterTarget", function (card, player2, targetx) {
							if (targetx === _status.event.playerx) return false;
							if (targetx !== _status.event.sourcex && !ui.selected.targets.includes(_status.event.sourcex)) {
								return false;
							}
							return lib.filter.targetEnabled.apply(this, arguments);
						})
						.set("sourcex", target)
						.set("playerx", player)
						.set("addCount", false);
				},
			},
			draw: {
				trigger: { player: "useCard" },
				forced: true,
				popup: false,
				filter(event, player) {
					return event.getParent(2).name === "tlpoquan_afterUse" && player._tlpoquan_firstCard;
				},
				async content(event, trigger, player) {
					game.playSkillBgm("poquan");
					const firstCard = player._tlpoquan_firstCard;
					const secondCard = trigger.card;
					const firstColor = firstCard.color;
					const secondColor = get.color(secondCard);
					const firstType = firstCard.type;
					const secondType = get.type2(secondCard);
					const colorSame = firstColor === secondColor;
					const typeSame = firstType === secondType;
					if (colorSame || typeSame) {
						await player.draw(1);
					}
					delete player._tlpoquan_firstCard;
				},
			},
		},
	},
	tlzhadan: {
		audio: ["ext:奥特之星/assets/ultraman/audio/skill/zhadan"],
		enable: "phaseUse",
		limited: true,
		filterTarget(card, player, target) {
			return target !== player && target.isIn();
		},
		selectTarget: 1,
		check(event, player) {
			const targets = game.filterPlayer(cur => cur !== player && get.attitude(player, cur) < 0 && cur.isIn());
			for (const target of targets) {
				const potentialDamage = player.hp - 1;
				if (target.hp - potentialDamage <= 1) {
					return true;
				}
			}
			return false;
		},
		async content(event, trigger, player) {
			player.awakenSkill(event.name);
			const target = event.target;
			const currentHp = player.hp;
			const damageAmount = Math.max(1, currentHp - 1);
			await player.discard(player.getCards("h"));
			const reduceAmount = player.maxHp - 1;
			await player.loseMaxHp(reduceAmount);
			await target.damage(damageAmount);
		},
		ai: {
			order: 4,
			result: {
				player(player) {
					const targets = game.filterPlayer(cur => cur !== player && get.attitude(player, cur) < 0 && cur.isIn());
					for (const target of targets) {
						const potentialDamage = Math.max(1, player.hp);
						if (target.hp - potentialDamage < 1) {
							return 10;
						}
					}
					return 0;
				},
				target(player, target) {
					if (!target) return 0;
					return get.attitude(player, target) < 0 ? 1 : -10;
				},
			},
		},
	},
	asguangxian: {
		direct: true,
		trigger: { player: "useCard" },
		async cost(event, trigger, player) {
			event.result = await player.chooseBool(get.prompt(event.skill)).forResult();
		},
		async content(event, trigger, player) {
			game.playSkillBgm("guangxian");
			if (get.tag(trigger.card, "damage")) {
				trigger.baseDamage = (trigger.baseDamage || 1) + 1;
			} else {
				await player.draw(1);
			}
		},
	},
	asduantou: {
		audio: ["ext:奥特之星/assets/ultraman/audio/skill/duantou"],
		enable: "phaseUse",
		usable: 1,
		skillAnimation: true,
		filterCard(card, player) {
			return !ui.selected.cards.some(cardx => get.suit(cardx, player) === get.suit(card, player));
		},
		selectCard: [1, 4],
		position: "h",
		complexCard: true,
		complexSelect: true,
		filterTarget: lib.filter.notMe,
		selectTarget: 1,
		async content(event, trigger, player) {
			const { cards, targets } = event;
			const target = targets[0];
			const suitsUsed = cards.map(card => get.suit(card, player));
			const targetHand = target.getCards("h");
			if (targetHand.length === 0) {
				await target.damage(2, player);
				return;
			}
			target.showHandcards();
			const cardsToDiscard = targetHand.filter(card => suitsUsed.includes(get.suit(card, target)));
			if (cardsToDiscard.length > 0) {
				await target.discard(cardsToDiscard);
			}
			const remainingHand = target.countCards("h");
			await target.damage(remainingHand === 0 ? 2 : 1, player);
		},
		ai: {
			order: 7,
			result: {
				target(player, target) {
					return -2;
				},
				player(player, target) {
					if (!target) return 0;
					if (player.countCards("h") < 1) return -10;
					return get.damageEffect(target, player, player) - 1;
				},
			},
		},
	},
	swbingfu: {
		audio: ["ext:奥特之星/assets/ultraman/audio/skill/bingfu"],
		trigger: { player: "useCardToTarget" },
		filter(event, player) {
			if (!event.card) return false;
			if (!event.target) return false;
			return event.target !== player && event.target.isIn();
		},
		prompt(event, player) {
			return `是否对 ${get.translation(event.target)} 发动【冰斧】？`;
		},
		check(event, player) {
			return get.attitude(player, event.target) < 0;
		},
		async content(event, trigger, player) {
			game.playSkillBgm("sw");
			const target = trigger.target;
			player.logSkill("swbingfu", target);
			const result = await player.judge(card => 1).forResult();
			const suit = result.suit;
			const card = trigger.card;
			if (suit === "heart") {
				await player.useCard({ name: "sha", isCard: true }, target).set("addCount", false);
				game.log(player, "判定结果为红心，视为对" + get.translation(target) + "使用了一张普通【杀】");
			} else if (suit === "diamond") {
				player.setStorage("swbingfu_unrespondable", true);
				player.setStorage("swbingfu_target", target);
				trigger.directHit.add(target);
				game.log(player, "判定结果为方块，" + get.translation(card) + "对" + get.translation(target) + "不可响应");
			} else if (suit === "spade") {
				if (target.countCards("he") > 0) {
					await player.discardPlayerCard({ target, position: "he", forced: true });
				}
				game.log(player, "判定结果为黑桃，弃置" + get.translation(target) + "一张牌");
			} else if (suit === "club") {
				if (target.countDiscardableCards(target, "he") > 0) {
					await target.chooseToDiscard(2, "he", true);
				}
				game.log(player, "判定结果为梅花，" + get.translation(target) + "弃置两张牌");
			}
		},
		targetprompt2(target) {
			const player = get.player();
			if (player.getStorage("swbingfu_unrespondable") && player.getStorage("swbingfu_target") === target) {
				return "不可响应";
			}
		},
		onChooseToUse(event) {
			event.targetprompt2.add(lib.skill.swbingfu.targetprompt2);
		},
		onChooseTarget(event) {
			event.targetprompt2.add(lib.skill.swbingfu.targetprompt2);
		},
		ai: {
			directHit_ai: true,
			skillTagFilter(player, tag, arg) {
				if (player.getStorage("swbingfu_unrespondable") && arg?.target === player.getStorage("swbingfu_target")) {
					return true;
				}
				return false;
			},
		},
		group: "swbingfu_clear",
		subSkill: {
			clear: {
				trigger: { player: "useCardAfter" },
				charlotte: true,
				forced: true,
				popup: false,
				filter(event, player) {
					return player.getStorage("swbingfu_unrespondable");
				},
				async content(event, trigger, player) {
					player.removeStorage("swbingfu_unrespondable");
					player.removeStorage("swbingfu_target");
				},
			},
		},
	},
	swxiongjia: {
		trigger: { global: "phaseJieshuBegin" },
		forced: true,
		filter(event, player) {
			const round = game.rounds;
			const discarded = get.discarded().filter(card => card._swxiongjia_round === round);
			if (discarded.length === 0) return false;
			const suits = new Set(discarded.map(card => get.suit(card)));
			return suits.size >= 2;
		},
		async content(event, trigger, player) {
			const round = game.rounds;
			const discarded = get.discarded().filter(card => card._swxiongjia_round === round);
			const suits = new Set(discarded.map(card => get.suit(card)));
			const suitCount = suits.size;
			if (suitCount >= 2) {
				await player.draw();
				if (suitCount >= 3) {
					await player.recover();
				}
			}
		},
		group: "swxiongjia_record",
		subSkill: {
			record: {
				trigger: { global: "loseToDiscardpile" },
				charlotte: true,
				forced: true,
				popup: false,
				filter(event, player) {
					return event.cards && event.cards.length > 0;
				},
				content(event, trigger, player) {
					const round = game.rounds;
					for (const card of trigger.cards) {
						card._swxiongjia_round = round;
					}
				},
			},
		},
	},
	leofenzhan: {
		forced: true,
		group: ["leofenzhan_draw", "leofenzhan_end"],
		mod: {
			cardUsable(card, player) {
				if (get.name(card) === "sha" && player.getDamagedHp() > 0) {
					return 1 + player.getDamagedHp();
				}
			},
		},
		subSkill: {
			draw: {
				trigger: { player: "phaseDrawBegin2" },
				forced: true,
				filter(event, player) {
					return !event.numFixed && player.getDamagedHp() > 0;
				},
				async content(event, trigger, player) {
					trigger.num += player.getDamagedHp();
					game.playSkillBgm("leiou");
				},
			},
			end: {
				trigger: { player: "phaseEnd" },
				forced: true,
				filter(event, player) {
					return player.getDamagedHp() > 0;
				},
				async content(event, trigger, player) {
					const X = player.getDamagedHp();
					await player.draw(X);
				},
			},
		},
	},
	leofeiti: {
		audio: ["ext:奥特之星/assets/ultraman/audio/skill/feiti"],
		enable: "phaseUse",
		usable: 1,
		filterCard: true,
		selectCard: [1, Infinity],
		position: "he",
		skillAnimation: true,
		filterTarget(card, player, target) {
			return target !== player && lib.filter.targetEnabled({ name: "sha" }, player, target) && lib.filter.targetInRange({ name: "sha" }, player, target);
		},
		selectTarget: 1,
		async content(event, trigger, player) {
			const cards = event.cards;
			const target = event.target;
			const X = cards.length;
			const choices = ["选项一", "选项二", "背水！"];
			const choiceList = [`令其弃置${get.cnNumber(X)}张牌`, "此【杀】伤害+1", `背水！失去一点体力`];
			const result = await player
				.chooseControl(choices)
				.set("choiceList", choiceList)
				.set("prompt", "飞踢：选择一项")
				.set("X", X)
				.set("ai", () => {
					const evt = _status.event;
					const player = evt.player;
					const X = evt.X;
					if (player.getHp() >= 2) return "背水！";
					if (X >= 3) return "选项二";
					return "选项一";
				})
				.forResult();
			if (typeof result?.control == "string" && result.control != "cancel2") {
				await player.discard(cards);
				if (["选项一", "背水！"].includes(result.control)) {
					player.setStorage("leofeiti_discard", X);
				}
				if (["选项二", "背水！"].includes(result.control)) {
					player.setStorage("leofeiti_damage", 1);
				}
				if (result.control === "背水！") {
					await player.loseHp(1);
				}
				player.addTempSkill("leofeiti_effect");
				player.addTempSkill("leofeiti_after");
				const vcard = new lib.element.VCard({ name: "sha" });
				const next = player.useCard(vcard, target, false);
				await next;
			}
		},
		ai: {
			order: 4,
			result: {
				player(player) {
					const X = player.getDamagedHp();
					const maxKeep = Math.max(0, X - 1);
					if (player.countCards("h") > maxKeep) return 1;
					return 0;
				},
				target(player, target) {
					return get.damageEffect(target, player, player);
				},
			},
		},
		subSkill: {
			effect: {
				charlotte: true,
				trigger: { global: "damageBegin1" },
				forced: true,
				silent: true,
				popup: false,
				filter(event, player) {
					return event.source === player && get.name(event.card) === "sha" && player.getStorage("leofeiti_damage", 0) > 0;
				},
				content(event, trigger, player) {
					const num = player.getStorage("leofeiti_damage", 0);
					trigger.num += num;
					player.removeStorage("leofeiti_damage");
				},
			},
			after: {
				charlotte: true,
				trigger: { player: "useCardToPlayered" },
				forced: true,
				silent: true,
				popup: false,
				filter(event, player) {
					return get.name(event.card) === "sha" && player.getStorage("leofeiti_discard", 0) > 0;
				},
				async content(event, trigger, player) {
					const X = player.getStorage("leofeiti_discard", 0);
					const target = trigger.target;
					if (target && target.isIn()) {
						await target.chooseToDiscard("he", X, true);
					}
					player.removeStorage("leofeiti_discard");
				},
			},
		},
	},
	adkoudai: {
		group: ["adkoudai_damage", "adkoudai_damaged"],
		subSkill: {
			damage: {
				usable: 1,
				trigger: { source: "damageBegin1" },
				filter(event, player) {
					return event.player && event.player !== player && event.num > 0;
				},
				async cost(event, trigger, player) {
					event.result = await player
						.chooseBool("光晕：是否令此伤害+1？")
						.set("ai", () => (get.attitude(player, trigger.player) < 0 ? 1 : 0))
						.forResult();
				},
				async content(event, trigger, player) {
					trigger.num++;
					game.playSkillBgm("ad");
				},
			},
			damaged: {
				usable: 1,
				trigger: { player: "damageBegin3" },
				filter(event, player) {
					return event.num > 0;
				},
				async cost(event, trigger, player) {
					event.result = await player
						.chooseBool("光晕：是否令此伤害-1？")
						.set("ai", () => 1)
						.forResult();
				},
				async content(event, trigger, player) {
					trigger.num--;
					game.playSkillBgm("ad");
				},
			},
		},
	},
	adquanneng: {
		group: ["adquanneng_clear"],
		trigger: { player: "useCard" },
		direct: true,
		filter(event, player) {
			const used = player.getStorage("adquanneng_used", {});
			return game.hasPlayer(current => {
				const pid = current.playerid;
				if (!(used.draw || []).includes(pid)) return true;
				if (!(used.recover || []).includes(pid) && current.hp < current.maxHp) return true;
				if (!(used.turnOver || []).includes(pid) && (current.isTurnedOver() || current.isLinked())) return true;
				return false;
			});
		},
		async content(event, trigger, player) {
			const used = player.getStorage("adquanneng_used", {});
			const result = await player
				.chooseTarget("全能：是否令一名角色执行一项效果？", (card, player, target) => {
					const used = player.getStorage("adquanneng_used", {});
					const pid = target.playerid;
					if (!(used.draw || []).includes(pid)) return true;
					if (!(used.recover || []).includes(pid) && target.hp < target.maxHp) return true;
					if (!(used.turnOver || []).includes(pid) && (target.isTurnedOver() || target.isLinked())) return true;
					return false;
				})
				.set("ai", target => {
					if (get.attitude(player, target) <= 0) return 0;
					const used = player.getStorage("adquanneng_used", {});
					const pid = target.playerid;
					let num = 1;
					if (!(used.draw || []).includes(pid)) num++;
					if (!(used.recover || []).includes(pid) && target.hp < target.maxHp) num++;
					if (!(used.turnOver || []).includes(pid) && (target.isTurnedOver() || target.isLinked())) num++;
					return num;
				})
				.forResult();
			if (!result.bool || !result.targets?.length) return;
			const target = result.targets[0];
			const pid = target.playerid;
			const choiceMap = [
				["recover", "回复1点体力"],
				["draw", "摸两张牌"],
				["turnOver", "重置武将牌"],
			];
			const valid = choiceMap.filter(([key]) => {
				if ((used[key] || []).includes(pid)) return false;
				if (key === "recover") return target.hp < target.maxHp;
				if (key === "turnOver") return target.isTurnedOver() || target.isLinked();
				return true;
			});
			if (!valid.length) return;
			const control = await player
				.chooseControl(valid.map(v => v[1]))
				.set("prompt", `全能：令${get.translation(target)}执行一项`)
				.set("ai", () => {
					if (valid.some(v => v[0] === "turnOver")) return valid.findIndex(v => v[0] === "turnOver");
					if (valid.some(v => v[0] === "recover")) return valid.findIndex(v => v[0] === "recover");
					return 0;
				})
				.forResult();
			const chosen = valid.find(v => v[1] === control.control);
			if (!chosen) return;
			player.logSkill("adquanneng", target);
			game.playSkillBgm("ad");
			const used2 = player.getStorage("adquanneng_used", {});
			if (!Array.isArray(used2[chosen[0]])) used2[chosen[0]] = [];
			used2[chosen[0]].push(pid);
			player.setStorage("adquanneng_used", used2);
			if (chosen[0] === "recover") await target.recover();
			else if (chosen[0] === "draw") await target.draw(2);
			else if (chosen[0] === "turnOver") {
				if (target.isTurnedOver()) await target.turnOver();
				if (target.isLinked()) await target.link();
			}
		},
		subSkill: {
			clear: {
				charlotte: true,
				forced: true,
				trigger: { global: "phaseAfter" },
				filter(event, player) {
					const used = player.getStorage("adquanneng_used", {});
					return used && typeof used === "object" && Object.keys(used).length > 0;
				},
				async content(event, trigger, player) {
					player.setStorage("adquanneng_used", {});
				},
			},
		},
	},
	adjinghua: {
		chargeSkill: Infinity,
		group: ["adjinghua_get"],
		enable: "phaseUse",
		direct: true,
		filter(event, player) {
			return player.countCharge() >= 3;
		},
		async content(event, trigger, player) {
			const targetResult = await player
				.chooseTarget("净化：是否消耗3点蓄力点，令一名角色重置所有技能？", (card, from, target) => true)
				.set("ai", target => {
					const p = _status.event.player;
					const att = get.attitude(p, target);
					const hasMarks = Object.keys(target.storage).some(key => {
						const v = target.storage[key];
						return (typeof v === "number" && v > 0) || (Array.isArray(v) && v.length > 0);
					});
					const hasExileCards = target.countCards("x") > 0;
					const hasLimited = target.getSkills().some(skill => {
						const info = get.info(skill);
						return info && info.limited;
					});
					if (att < 0 && (hasMarks || hasExileCards)) {
						return 15;
					}
					if (target === p || (att >= 0 && hasLimited)) {
						return 10;
					}
					return 1;
				})
				.forResult();
			if (!targetResult.bool || !targetResult.targets?.length) {
				delete player.getStat("skill").adjinghua;
				return;
			}
			player.removeCharge(3);
			player.logSkill("adjinghua", targetResult.targets[0]);
			const target = targetResult.targets[0];
			player.line(target);
			const removeSkills = target.getSkills(null, false, false).filter(i => {
				const info = get.info(i);
				return !info || !info.charlotte;
			});
			if (removeSkills.length) {
				target.removeSkill(removeSkills);
			}
			const gainSkills = target.getStockSkills(true, true).filter(i => {
				const info = get.info(i);
				return info && !info.charlotte && (!info.zhuSkill || target.isZhu2());
			});
			if (gainSkills.length) {
				Object.keys(target.storage)
					.filter(i => gainSkills.some(skill => i.startsWith(skill)))
					.forEach(storage => delete target.storage[storage]);
				target.addSkill(gainSkills);
				const suffixs = ["used", "round", "block", "blocker"];
				for (const skill of game.expandSkills(gainSkills)) {
					const info = get.info(skill);
					if (info.usable !== undefined) {
						if (typeof target.getStat("triggerSkill")[skill] === "number" && target.getStat("triggerSkill")[skill] >= 1) {
							delete target.getStat("triggerSkill")[skill];
						}
						if (typeof target.getStat("skill")[skill] === "number" && target.getStat("skill")[skill] >= 1) {
							delete target.getStat("skill")[skill];
						}
					}
					if (info.round && target.storage[skill + "_roundcount"]) {
						delete target.storage[skill + "_roundcount"];
					}
					if (target.storage[`temp_ban_${skill}`]) {
						delete target.storage[`temp_ban_${skill}`];
					}
					if (target.awakenedSkills.includes(skill)) {
						target.restoreSkill(skill);
					}
					for (const suffix of suffixs) {
						if (target.hasSkill(skill + "_" + suffix)) {
							target.removeSkill(skill + "_" + suffix);
						}
					}
				}
			}
		},
		ai: {
			order: 9,
			result: {
				player(player) {
					return 1;
				},
			},
		},
		subSkill: {
			get: {
				forced: true,
				locked: false,
				trigger: { global: ["drawAfter", "recoverEnd", "turnOverAfter", "linkAfter"] },
				filter(event, player) {
					if (event.name === "turnOver" && event.player.isTurnedOver()) return false;
					if (event.name === "link" && event.player.isLinked()) return false;
					return true;
				},
				async content(event, trigger, player) {
					player.addCharge(1);
				},
			},
		},
	},
	astlqiuyv: {
		dutySkill: true,
		derivation: ["astlgongjin", "leofenzhan"],
		mark: true,
		marktext: "囚",
		intro: {
			name: "囚",
			content: "mark",
		},
		mod: {
			globalFrom(from, to, distance) {
				return distance + from.countMark("astlqiuyv");
			},
			globalTo(from, to, distance) {
				return distance + to.countMark("astlqiuyv");
			},
		},
		group: ["astlqiuyv_gain", "astlqiuyv_remove", "astlqiuyv_achieve"],
		subSkill: {
			gain: {
				trigger: { global: "gameStart" },
				forced: true,
				async content(event, trigger, player) {
					const num = game.countPlayer();
					player.addMark("astlqiuyv", num);
				},
			},
			remove: {
				trigger: { global: "useCardToTargeted" },
				forced: true,
				filter(event, player) {
					return event.target !== player && player.countMark("astlqiuyv") > 0;
				},
				async content(event, trigger, player) {
					player.removeMark("astlqiuyv", 1);
				},
			},
			achieve: {
				trigger: { player: "phaseBegin" },
				forced: true,
				skillAnimation: true,
				animationColor: "gold",
				filter(event, player) {
					return player.countMark("astlqiuyv") === 0;
				},
				async content(event, trigger, player) {
					await player.awakenSkill("astlqiuyv");
					await player.addSkills(["astlgongjin"]);
				},
			},
		},
	},
};
