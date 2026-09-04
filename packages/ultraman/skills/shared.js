import { lib, game, ui, get, ai, _status } from "../../../../../noname.js";

export const skills = {
	nksslingyu: {
		usable: 1,
		direct: true,
		locked: false,
		enable: "phaseUse",
		multiline: true,
		multitarget: true,
		allowChooseAll: true,
		filterTarget(card, player, target) {
			return target !== player && !target.hasMark("nksslingyu_meita_mark");
		},
		selectTarget: [1, Infinity],
		async content(event, trigger, player) {
			game.playSkillBgm("nksslingyu");
			for (const target of event.targets) {
				target.addMark("nksslingyu_meita_mark", 1);
				target.addSkill("nksslingyu_meita_distance");
				target.addSkill("nksslingyu_meita_damage");
			}
			player.addTempSkill("nksslingyu_unlimited");
			player.logSkill("nksslingyu");
			game.log(player, "令", event.targets, "获得了“美塔”标记");
		},
		ai: {
			order(skill, player) {
				if (player.hasCard(card => get.tag(card, "damage"), "h")) {
					return 10;
				}
				return 0;
			},
			result: {
				player(player) {
					if (player.hasCard(card => get.tag(card, "damage"), "h")) {
						return 5;
					}
					if (player.hp > 2) return 1;
					return 0;
				},
				target(player, target) {
					return -1;
				},
			},
		},
		group: ["nksslingyu_distance", "nksslingyu_draw", "nksslingyu_clean"],
		global: "nksslingyu_blocker",
		subSkill: {
			distance: {
				mod: {
					targetInRange(card, player, target) {
						if (target.hasMark("nksslingyu_meita_mark")) return true;
					},
					globalFrom(from, to, distance) {
						if (to.hasMark("nksslingyu_meita_mark") || from.hasSkill("nksslingyu")) return 1 - distance;
					},
					playerEnabled(card, player, target) {
						if (player === target) return;
						if (game.hasPlayer(current => current.hasMark("nksslingyu_meita_mark"))) {
							if (!target.hasMark("nksslingyu_meita_mark")) return false;
						}
					},
				},
			},
			unlimited: {
				mod: {
					cardUsable(card) {
						if (card && card.name === "sha") return Infinity;
					},
				},
			},
			draw: {
				forced: true,
				trigger: { global: "drawBegin" },
				filter(event, player) {
					return event.player?.hasMark("nksslingyu_meita_mark");
				},
				async content(event, trigger, player) {
					trigger.num--;
				},
			},
			clean: {
				trigger: { player: "phaseBegin" },
				forced: true,
				silent: true,
				popup: false,
				async content(event, trigger, player) {
					game.countPlayer(current => {
						if (current.hasMark("nksslingyu_meita_mark")) {
							current.removeMark("nksslingyu_meita_mark", current.countMark("nksslingyu_meita_mark"));
							current.removeSkill("nksslingyu_meita_distance");
							current.removeSkill("nksslingyu_meita_damage");
						}
					});
					game.log("所有“美塔”标记已被移除");
				},
			},
			blocker: {
				mod: {
					targetEnabled(card, player, target) {
						if (player === target) return;
						if (!game.hasPlayer(current => current.hasSkill("nksslingyu"))) return;
						if (!game.hasPlayer(current => current.hasMark("nksslingyu_meita_mark"))) return;
						if (player.hasSkill("nksslingyu")) {
							if (!target.hasMark("nksslingyu_meita_mark") && !target.hasSkill("nksslingyu")) return false;
						} else if (player.hasMark("nksslingyu_meita_mark")) {
							if (!target.hasSkill("nksslingyu") && !target.hasMark("nksslingyu_meita_mark")) return false;
						} else {
							if (target.hasSkill("nksslingyu") || target.hasMark("nksslingyu_meita_mark")) return false;
						}
					},
					cardSavable(card, player, target) {
						if (player === target) return;
						if (!game.hasPlayer(current => current.hasSkill("nksslingyu"))) return;
						if (!game.hasPlayer(current => current.hasMark("nksslingyu_meita_mark"))) return;
						if (player.hasSkill("nksslingyu")) {
							if (!target.hasMark("nksslingyu_meita_mark") && !target.hasSkill("nksslingyu")) return false;
						} else if (player.hasMark("nksslingyu_meita_mark")) {
							if (!target.hasSkill("nksslingyu") && !target.hasMark("nksslingyu_meita_mark")) return false;
						} else {
							if (target.hasSkill("nksslingyu") || target.hasMark("nksslingyu_meita_mark")) return false;
						}
					},
				},
			},
			meita_distance: {
				charlotte: true,
				mod: {
					targetInRange(card, player, target) {
						if (target.hasMark("nksslingyu_meita_mark") || target.hasSkill("nksslingyu")) return true;
					},
					globalFrom(from, to, distance) {
						if ((from.hasMark("nksslingyu_meita_mark") && (to.hasMark("nksslingyu_meita_mark") || to.hasSkill("nksslingyu"))) || (from.hasSkill("nksslingyu") && to.hasMark("nksslingyu_meita_mark"))) {
							return 1 - distance;
						}
					},
					globalTo(from, to, distance) {
						if ((to.hasMark("nksslingyu_meita_mark") && (from.hasMark("nksslingyu_meita_mark") || from.hasSkill("nksslingyu"))) || (to.hasSkill("nksslingyu") && from.hasMark("nksslingyu_meita_mark"))) {
							return 1 - distance;
						}
					},
				},
			},
			meita_damage: {
				charlotte: true,
				forced: true,
				trigger: { player: "damageBegin1" },
				filter(event, player) {
					return player.hasMark("nksslingyu_meita_mark");
				},
				async content(event, trigger, player) {
					trigger.num++;
				},
			},
			meita_mark: {
				mark: true,
				marktext: "塔",
				intro: {
					name: "美塔",
					content: "已拥有美塔标记",
				},
			},
		},
	},
	nkssguangshi: {
		trigger: { player: "useCardAfter" },
		forced: true,
		filter(event, player) {
			return player.countMark("nkssguangshi_shi") < 2;
		},
		async content(event, trigger, player) {
			player.addMark("nkssguangshi_shi", 1);
		},
		group: ["nkssguangshi_use"],
		subSkill: {
			use: {
				enable: "phaseUse",
				usable: 1,
				filterTarget(card, player, target) {
					return target !== player && lib.filter.targetEnabled({ name: "sha" }, player, target);
				},
				selectTarget: 1,
				prompt(event, player) {
					return "弃置所有“矢”标记，视为使用一张伤害数为" + player.countMark("nkssguangshi_shi") + "的【杀】";
				},
				async content(event, trigger, player) {
					player.logSkill("nkssguangshi");
					const num = player.countMark("nkssguangshi_shi");
					player.removeMark("nkssguangshi_shi", num);
					const vcard = new lib.element.VCard({ name: "sha" });
					const next = player.useCard(vcard, event.targets[0], false);
					next.baseDamage = num;
				},
				ai: {
					order: 8,
					result: {
						target(player, target) {
							const num = player.countMark("nkssguangshi_shi") || 1;
							return get.effect(target, { name: "sha" }, player, player) * num;
						},
					},
				},
			},
			shi: {
				mark: true,
				marktext: "矢",
				intro: {
					name: "矢",
					markcount(storage, player) {
						return player.countMark("nkssguangshi_shi");
					},
					mark(dialog, storage, player) {
						dialog.addText("矢标记：" + player.countMark("nkssguangshi_shi") + "枚（至多两枚）");
					},
				},
			},
		},
	},
	djfuhe: {
		enable: "chooseToUse",
		usable: 2,
		filter(event, player) {
			if (_status.currentPhase !== player && event.type !== "wuxie") return false;
			if (event.type && event.type !== "wuxie") {
				const nonTrickTypes = ["sha", "shan", "jiu", "taoyuanjieyi", "wuzhongshengyou", "jiedaozhangren"];
				if (nonTrickTypes.includes(event.type)) return false;
			}
			return player.countCards("h") > 0;
		},
		hiddenCard(player, name) {
			if (name === "wuxie") {
				return player.countCards("h") > 0;
			}
			return get.type(name) === "trick";
		},
		chooseButton: {
			dialog(event, player) {
				const list = [];
				if (event.type === "wuxie") {
					list.push(["锦囊", "", "wuxie"]);
				} else {
					const cardNames = lib.inpile;
					for (const name of cardNames) {
						const type = get.type(name);
						if (type === "trick") {
							list.push(["锦囊", "", name]);
						}
					}
				}
				return ui.create.dialog("复合：选择一张普通锦囊牌", [list, "vcard"]);
			},
			filter(button, player) {
				const name = button.link[2];
				const evt = _status.event.getParent();
				if (evt && evt.filterCard) {
					return evt.filterCard(get.autoViewAs({ name: name }, "unsure"), player, evt);
				}
				return lib.filter.filterCard({ name: name }, player, evt);
			},
			check(button) {
				const player = _status.event.player;
				const name = button.link[2];
				if (name === "wuxie") return 20;
				return player.getUseValue({ name: name }) + 10;
			},
			backup(links, player) {
				const name = links[0][2];
				return {
					filterCard: true,
					position: "h",
					viewAs: { name: name },
					selectTarget() {
						const card = { name: name };
						const range = lib.filter.selectTarget(card, player, _status.event);
						if (range) return range;
						return [0, 0];
					},
					filterTarget(card, player, target) {
						const vcard = { name: name };
						return lib.filter.filterTarget(vcard, player, target);
					},
					check(card) {
						return 20 - get.value(card);
					},
					async onuse(result, player) {
						player.logSkill("djfuhe");
						await player.draw();
					},
				};
			},
			prompt(links, player) {
				const name = links[0][2];
				if (name === "wuxie") return "将一张手牌当做【无懈可击】使用";
				return "请选择使用「" + get.translation(name) + "」的目标";
			},
		},
		ai: {
			respondWuxie: true,
			skillTagFilter(player, tag) {
				if (tag === "respondWuxie") {
					return player.countCards("h") > 0;
				}
				return false;
			},
			order: 11,
			result: {
				player(player) {
					return 1;
				},
			},
		},
	},
	djqiangli: {
		group: ["djqiangli_damage", "djqiangli_use"],
		locked: true,
		subSkill: {
			damage: {
				trigger: { source: "damageBegin1" },
				forced: true,
				filter(event, player) {
					return event.card && event.player !== player;
				},
				async content(event, trigger, player) {
					trigger.num++;
					game.log(player, "造成的伤害+1");
				},
			},
			use: {
				trigger: { player: "useCard" },
				forced: true,
				filter(event, player) {
					return event.card && get.suit(event.card) !== "none";
				},
				async content(event, trigger, player) {
					const suit = get.suit(trigger.card);
					player.setStorage("djqiangli_suit", suit);
					game.filterPlayer(current => {
						if (current !== player) {
							current.addTempSkill("djqiangli_respond");
							current.markSkill("djqiangli_respond");
						}
					});
				},
			},
			respond: {
				charlotte: true,
				onremove: true,
				mod: {
					cardRespondable(card, player) {
						const target = _status.currentPhase;
						if (target && target.hasSkill("djqiangli") && target !== player && target.getStorage("djqiangli_suit", null)) {
							let cardSuit = get.suit(card);
							if (cardSuit === "unsure") return;
							if (cardSuit === "none" || cardSuit === undefined) {
								if (card.cards && card.cards.length > 0) {
									cardSuit = get.suit(card.cards[0]);
								}
							}
							const targetSuit = target.getStorage("djqiangli_suit", "");
							if (cardSuit === "none" || cardSuit === undefined) {
								if (targetSuit === "none") return;
								return false;
							}
							if (cardSuit !== targetSuit) {
								return false;
							}
						}
					},
					cardEnabled(card, player) {
						const evt = _status.event;
						if (evt && (evt.type === "dying" || evt.name === "_save")) return;
						const target = _status.currentPhase;
						if (target && target.hasSkill("djqiangli") && target !== player && target.getStorage("djqiangli_suit", null)) {
							let cardSuit = get.suit(card);
							if (cardSuit === "unsure") return;
							if (cardSuit === "none" || cardSuit === undefined) {
								if (card.cards && card.cards.length > 0) {
									cardSuit = get.suit(card.cards[0]);
								}
							}
							const targetSuit = target.getStorage("djqiangli_suit", "");
							if (cardSuit === "none" || cardSuit === undefined) {
								if (targetSuit === "none") return;
								return false;
							}
							if (cardSuit !== targetSuit) {
								return false;
							}
						}
					},
				},
				trigger: { global: "useCardAfter" },
				forced: true,
				popup: false,
				filter(event, player) {
					return event.player === _status.currentPhase && event.player.hasSkill("djqiangli");
				},
				async content(event, trigger, player) {
					player.removeSkill("djqiangli_respond");
					player.setStorage("djqiangli_respond", null);
				},
			},
		},
		ai: {
			effect: {
				player(card, player) {
					if (get.tag(card, "damage")) {
						return [1, 0, 1, 0];
					}
				},
			},
		},
	},
	djkongzhong: {
		group: ["djkongzhong_to", "djkongzhong_from"],
		subSkill: {
			to: {
				mod: {
					globalTo(from, to, distance) {
						return distance + 1;
					},
				},
			},
			from: {
				mod: {
					globalFrom(from, to, distance) {
						return distance - 1;
					},
				},
			},
		},
		trigger: { player: "useCardToPlayer" },
		forced: true,
		filter(event, player) {
			return event.card.name === "sha" && event.target;
		},
		async content(event, trigger, player) {
			trigger.directHit.add(trigger.target);
			game.log(player, "使用的【杀】无法被响应");
		},
		ai: {
			directHit_ai: true,
			skillTagFilter(player, tag, arg) {
				return arg && arg.card && arg.card.name === "sha";
			},
		},
	},
	dnshanliang: {
		enable: "chooseToUse",
		usable: 1,
		filter(event, player) {
			return player.countCards("he") > 0;
		},
		hiddenCard(player, name) {
			const type = get.type(name);
			if (type === "trick") {
				const info = lib.card[name];
				if (info && !info.delay) return true;
			}
			if (type === "basic") return true;
			return false;
		},
		chooseButton: {
			dialog(event, player) {
				const list = [];
				const cardNames = lib.inpile;
				for (const name of cardNames) {
					const type = get.type(name);
					if (type === "trick") {
						const info = lib.card[name];
						if (info && !info.delay) list.push(["锦囊", "", name]);
					}
					if (type === "basic") {
						list.push(["基本", "", name]);
					}
				}
				return ui.create.dialog("闪亮：选择一张牌", [list, "vcard"]);
			},
			filter(button, player) {
				const name = button.link[2];
				const evt = _status.event.getParent();
				if (evt && evt.filterCard) {
					const vcard = get.autoViewAs({ name: name }, "unsure");
					return evt.filterCard(vcard, player, evt);
				}
				return lib.filter.filterCard({ name: name }, player, evt);
			},
			check(button) {
				const player = _status.event.player;
				const name = button.link[2];
				if (name === "wuxie") return 20;
				return player.getUseValue({ name: name });
			},
			backup(links, player) {
				const name = links[0][2];
				const type = get.type(name);
				return {
					filterCard(card, player) {
						const cardType = get.type(card);
						if (type === "trick") {
							return cardType === "basic";
						}
						if (type === "basic") {
							return cardType !== "basic";
						}
						return false;
					},
					position: "he",
					viewAs: { name: name },
					log: false,
					check(card) {
						return 10 - get.value(card);
					},
					async onuse(result, player) {
						player.logSkill("dnshanliang");
						await player.draw(2);
						game.playSkillBgm("dn");
					},
				};
			},
			prompt(links, player) {
				return "请选择使用「" + get.translation(links[0][2]) + "」的目标";
			},
		},
		ai: {
			order: 11,
			result: {
				player(player) {
					return 1;
				},
			},
			respondSha: true,
			respondShan: true,
			respondTao: true,
			respondJiu: true,
			respondWuxie: true,
			skillTagFilter(player, tag, arg) {
				if (tag === "respondWuxie") {
					const hasBasic = player.hasCards("he", card => get.type(card) === "basic");
					if (!hasBasic) return false;
					const evt = _status.event;
					if (evt && evt.filterCard) {
						const vcard = get.autoViewAs({ name: "wuxie" }, "unsure");
						return evt.filterCard(vcard, player, evt);
					}
					return true;
				}
				if (tag === "respondSha" || tag === "respondShan" || tag === "respondTao" || tag === "respondJiu") {
					const hasNonBasic = player.hasCards("he", card => get.type(card) !== "basic");
					if (!hasNonBasic) return false;
					const evt = _status.event;
					if (evt && evt.filterCard) {
						const name = tag.replace("respond", "").toLowerCase();
						const vcard = get.autoViewAs({ name: name }, "unsure");
						return evt.filterCard(vcard, player, evt);
					}
					return true;
				}
				return false;
			},
		},
	},
	dnqiji: {
		trigger: { global: "useCardBegin" },
		filter(event, player) {
			if (event.player === player) return false;
			if (!event.card || !event.targets || !event.targets.includes(player)) return false;
			const cardType = get.type2(event.card);
			return cardType === "basic" || cardType === "trick" || cardType === "equip";
		},
		async cost(event, trigger, player) {
			const card = trigger.card;
			const cardType = get.type2(card);
			if (cardType === "equip") {
				event.result = {
					bool: true,
					cost_data: { guess: "equip" },
				};
				return;
			}
			const choices = ["基本牌", "锦囊牌", "cancel2"];
			const result = await player
				.chooseControl(choices)
				.set("prompt", "是否发动【奇迹】")
				.set("ai", () => {
					if (Math.random() > 0.5) return "基本牌";
					if (Math.random() <= 0.5) return "锦囊牌";
				})
				.set("card", card)
				.forResult();
			if (result.control === "cancel2") {
				event.result = { bool: false };
				return;
			}
			event.result = {
				bool: true,
				cost_data: { guess: result.control },
			};
		},
		async content(event, trigger, player) {
			game.playSkillBgm("dn");
			const card = trigger.card;
			const cardType = get.type2(card);
			const guess = event.cost_data?.guess;
			let correct = false;
			if (guess === "equip" && cardType === "equip") correct = true;
			if (guess === "基本牌" && cardType === "basic") correct = true;
			if (guess === "锦囊牌" && cardType === "trick") correct = true;
			if (correct) {
				trigger.cancel();
				game.log(player, "猜对了", get.translation(card), "的类型");
				const cardName = get.translation(card);
				const canDiscard4 = player.countCards("he") >= 4;
				const choices = ["使用" + cardName + "", "回复体力并摸牌"];
				if (canDiscard4) {
					choices.push("移除角色");
				}
				const result2 = await player
					.chooseControl(choices)
					.set("prompt", "请选择一项执行")
					.set("ai", () => {
						const player = get.player();
						const canDiscard4 = get.event().canDiscard4;
						const cardName = get.event().cardName;
						const rand = Math.random();
						if (canDiscard4 && rand < 0.15) return "移除角色";
						if (rand < 0.85) return "回复体力并摸牌";
						return "使用" + cardName + "";
					})
					.set("canDiscard4", canDiscard4)
					.set("cardName", cardName)
					.forResult();
				let actualCards = [];
				if (trigger.cards?.length > 0) {
					actualCards = trigger.cards.filter(c => c && c.isCard !== false);
				}
				if (actualCards.length > 0) {
					await trigger.player.lose(actualCards, ui.ordering).set("getlx", false);
				}
				if (result2.control === "使用" + cardName + "") {
					const actualCard = actualCards.length > 0 ? actualCards[0] : card;
					const cardObj = card.name;
					const selectTarget = lib.filter.selectTarget({ name: cardObj }, player, _status.event);
					player.addTempSkill("dnqiji_directHit", "useCardAfter");
					if (selectTarget && selectTarget[0] > 0) {
						const targetResult = await player
							.chooseTarget("奇迹：选择" + cardName + "的目标", (card, player, target) => {
								return lib.filter.filterTarget({ name: cardObj }, player, target);
							})
							.set("ai", target => {
								return get.effect(target, { name: cardObj }, player, player);
							})
							.set("forced", true)
							.forResult();
						if (targetResult.targets?.length > 0) {
							await player.useCard(actualCard, targetResult.targets);
						}
					} else {
						const autoTargets = game.filterPlayer(target => {
							return lib.filter.filterTarget({ name: cardObj }, player, target);
						});
						if (autoTargets.length > 0) {
							await player.useCard(actualCard, autoTargets);
						} else {
							await player.useCard(actualCard);
						}
					}
				} else if (result2.control === "回复体力并摸牌") {
					await player.recover(1);
					await player.draw(2);
				} else if (result2.control === "移除角色") {
					const discardResult = await player
						.chooseCard({
							position: "he",
							selectCard: 4,
							forced: true,
							prompt: "奇迹：请弃置四张牌",
							filterCard(card) {
								return true;
							},
						})
						.set("ai", card => {
							return -get.value(card);
						})
						.forResult();
					if (discardResult.bool && discardResult.cards?.length >= 4) {
						await player.discard(discardResult.cards);
						const targetResult = await player
							.chooseTarget("奇迹：选择一名其他角色移除游戏", (card, player, target) => {
								return target !== player && target.isIn();
							})
							.set("ai", target => {
								return -get.attitude(player, target);
							})
							.set("forced", true)
							.forResult();
						if (targetResult.targets?.length > 0) {
							const target = targetResult.targets[0];
							const allCards = target.getCards("hej");
							if (allCards.length > 0) {
								target.$give(allCards, target, false);
							}
							await target.rest({ type: "round", count: 1 });
						}
					}
				}
			} else {
				game.log(player, "猜错了", get.translation(card), "的类型");
			}
		},
		ai: {
			effect: {
				target(card, player, target) {
					return [0.5, 0.5];
				},
			},
		},
		subSkill: {
			directHit: {
				charlotte: true,
				trigger: { player: "useCard0" },
				forced: true,
				popup: false,
				firstDo: true,
				async content(event, trigger, player) {
					trigger.directHit.addArray(game.players);
				},
			},
		},
	},
	dnqiangzhuang: {
		group: ["dnqiangzhuang_viewAs", "dnqiangzhuang_unrespondable", "dnqiangzhuang_gainTrick"],
		locked: true,
		subSkill: {
			viewAs: {
				mod: {
					cardname(card, player) {
						if (card.name === "juedou") return;
						const info = lib.card[card.name];
						if (info && (info.type === "trick" || info.subtype === "trick") && !info.delay) {
							if (get.position(card) === "h") return "juedou";
						}
					},
				},
			},
			unrespondable: {
				trigger: { player: "useCardToPlayered" },
				forced: true,
				async content(event, trigger, player) {
					game.playSkillBgm("dn");
					for (const target of trigger.targets) {
						trigger.directHit.add(target);
					}
				},
			},
			gainTrick: {
				trigger: { player: "useCardAfter" },
				forced: true,
				filter(event, player) {
					return event.card.name === "sha";
				},
				async content(event, trigger, player) {
					const pileCards = Array.from(ui.cardPile.childNodes);
					const trickCards = pileCards.filter(card => {
						const info = lib.card[card.name];
						return info && info.type === "trick" && !info.delay;
					});
					if (trickCards.length > 0) {
						const toGain = trickCards[0];
						await player.gain(toGain, "draw2");
					} else {
						const discardCards = Array.from(ui.discardPile.childNodes);
						const trickDiscards = discardCards.filter(card => {
							const info = lib.card[card.name];
							return info && info.type === "trick" && !info.delay;
						});
						if (trickDiscards.length > 0) {
							const toGain = trickDiscards[0];
							await player.gain(toGain, "draw2");
						}
					}
				},
			},
		},
		ai: {
			effect: {
				player(card, player) {
					if (get.type2(card) === "trick" && get.subtype(card) !== "delay") {
						return [10, 0, 10, 0];
					}
				},
			},
		},
	},
	astlgongjin: {
		enable: "phaseUse",
		limited: true,
		skillAnimation: true,
		animationColor: "gold",
		filterTarget(card, player, target) {
			return target !== player && target.isIn();
		},
		selectTarget: 1,
		async content(event, trigger, player) {
			const target = event.target;
			player.line(target);
			player.addSkills("astlgongjin_link");
			target.addSkills("astlgongjin_link");
			player.markAuto("astlgongjin_link", [target]);
			target.markAuto("astlgongjin_link", [player]);
			player.awakenSkill("astlgongjin");	
		},
		ai: {
			order: 10,
			result: {
				target(player, target) {
					return get.attitude(player, target) > 0 ? 3 : 0;
				},
			},
		},
		subSkill: {
			link: {
				charlotte: true,
				mark: true,
				marktext: "共",
				intro: {
					name: "共进",
					content(storage, player) {
						const brothers = (storage || []).filter(current => current && current.isIn());
						return "与" + brothers.map(current => get.translation(current)).join("、") + "结为兄弟";
					},
				},
				group: ["astlgongjin_damage", "astlgongjin_draw"],
			},
			damage: {
				trigger: { player: "damageBegin4" },
				direct: true,
				filter(event, player) {
					if (event._astlgongjin || event.num <= 0) return false;
					return (player.getStorage("astlgongjin_link") || []).some(brother => brother && brother.isIn());
				},
				async content(event, trigger, player) {
					const brother = (player.getStorage("astlgongjin_link") || []).find(brother => brother && brother.isIn());
					if (!brother) return;
					const result = await brother
						.chooseBool(`共进：是否改为由你受到这${get.cnNumber(trigger.num)}点伤害？`)
						.set("ai", () => {
							return get.attitude(brother, player) > 0 && ((brother.hp > trigger.num + 1) || brother.hp <= 1) ? 1 : 0;
						})
						.forResult();
					if (result.bool) {
						trigger._astlgongjin = true;
						trigger.player = brother;
						game.log(brother, "改为了此伤害的目标");
					}
				},
			},
			draw: {
				trigger: { player: "drawBegin" },
				forced: true,
				popup: false,
				filter(event, player) {
					if (event.gongjin || event.num <= 0) return false;
					if (event.getParent("phaseDraw").name == "phaseDraw") return false;
					return (player.getStorage("astlgongjin_link") || []).some(brother => brother && brother.isIn());
				},
				async content(event, trigger, player) {
					const brother = (player.getStorage("astlgongjin_link") || []).find(brother => brother && brother.isIn());
					if (!brother) return;
					const next = brother.draw(trigger.num);
					next.set("gongjin", true);
					await next;
				},
			},
		},
	},
};
