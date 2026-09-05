import { lib, game, ui, get, ai, _status } from "../../../../../../noname.js";

export const skills = {
	aplxiongye: {
		forced: true,
		audio: ["ext:奥特之星/assets/xiongye1", "ext:奥特之星/assets/xiongye2"],
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
	hadjheian: {
		locked: true,
		trigger: { player: "drawBefore" },
		forced: true,
		firstDo: true,
		async content(event, trigger, player) {
			const num = trigger.num || 1;
			trigger.num = 0;
			for (let i = 0; i < num && ui.discardPile.hasChildNodes(); i++) {
				const card = ui.discardPile.removeChild(ui.discardPile.lastChild);
				await player.gain(card, "draw");
			}
			game.log(player, "从弃牌堆摸了" + get.cnNumber(num) + "张牌");
		},
		group: ["hadjheian_use"],
		subSkill: {
			use: {
				trigger: { global: ["useCardAfter", "recast"] },
				forced: true,
				firstDo: true,
				priority: 15,
				sourceSkill: "hadjheian",
				filter(event, player) {
					if (!player.hasSkill("hadjheian")) return false;
					if (event.player !== player) return false;
					if (!event.cards || !event.cards.length) return false;
					if (event.name === "useCard") {
						const card = event.card;
						if (!card) return false;
						if (get.type(card) === "equip") return false;
						if (get.type(card) === "delay") return false;
					}
					return true;
				},
				async content(event, trigger, player) {
					const cards = trigger.cards.slice();
					for (const card of cards) {
						card.remove();
						ui.cardPile.appendChild(card);
					}
					game.log(player, "将使用或重铸的牌置入了牌堆底");
				},
			},
		},
	},
	hadjanrong: {
		trigger: { player: "damageEnd" },
		forced: true,
		mark: true,
		marktext: "融",
		group: ["hadjanrong_setup", "hadjanrong_refresh", "hadjanrong_maxHp", "hadjanrong_use"],
		filter(event, player) {
			if (event.num <= 0) return false;
			const card = event.card;
			if (card && get.name(card) === "sha" && get.color(card) === "red") return false;
			return true;
		},
		async content(event, trigger, player) {
			game.playSkillBgm("hadj");
			const source = trigger.source;
			const obtainedSkills = player.getStorage("hadjanrong", []);
			if (source && source !== player) {
				const validSkills = source.getStockSkills(true, true).filter(skill => {
					const info = get.info(skill);
					return info && !info.charlotte && !obtainedSkills.includes(skill);
				});
				if (validSkills.length > 0) {
					const dialog = ui.create.dialog("暗融：选择要获得的技能", "hidden");
					dialog.add([validSkills, "skill"]);
					const buttonResult = await player
						.chooseButton(dialog, true)
						.set("ai", button => get.skillRank(button.link, "inout"))
						.forResult();
					if (buttonResult.bool && buttonResult.links) {
						const skill = buttonResult.links[0];
						await player.addSkills(skill);
						player.markAuto("hadjanrong", [skill]);
					}
				}
			}
			await player.gainMaxHp();
		},
		intro: {
			name: "暗融",
			mark(dialog, storage, player) {
				const list = storage || [];
				if (list.length > 0) {
					dialog.addText("已获得技能：" + list.map(s => get.translation(s)).join("、"));
				}
				if (!list.length) {
					dialog.addText("尚未获得技能");
				}
			},
		},
		ai: {
			maixie: true,
			maixie_hp: true,
			effect: {
				target(card, player, target) {
					if (get.name(card) !== "sha" || get.color(card) !== "red") {
						if (get.attitude(player, target) <= 0) {
							if (target.hp - 1 > 0) {
								return [1, get.tag(card, "damage") * 2];
							}
						}
					}
				},
			},
		},
		init(player, skill) {
			player.addSkill("hadjanrong_nouse");
		},
		onremove(player, skill) {
			player.removeSkill("hadjanrong_nouse");
			const cards = player.getCards("s", card => card.hasGaintag("hadjanrong_discard"));
			for (const card of cards) {
				card.delete();
			}
			if (player === game.me) {
				ui.updatehl();
			}
		},
		subSkill: {
			nouse: {
				charlotte: true,
				locked: true,
			},
			use: {
				trigger: {
					player: ["useCardBefore", "respondBefore"],
				},
				forced: true,
				firstDo: true,
				sourceSkill: "hadjanrong",
				filter(event, player) {
					if (!event.cards) return false;
					return event.cards.some(card => card.hasGaintag && card.hasGaintag("hadjanrong_discard"));
				},
				async content(event, trigger, player) {
					const discardPile = Array.from(ui.discardPile.childNodes);
					for (let i = 0; i < trigger.cards.length; i++) {
						const card = trigger.cards[i];
						if (card.hasGaintag && card.hasGaintag("hadjanrong_discard")) {
							const originalCard = discardPile.find(c => c.cardid === card._cardid);
							if (originalCard) {
								originalCard.remove();
								trigger.cards[i] = originalCard;
								if (trigger.card && trigger.card.cards) {
									trigger.card.cards[i] = originalCard;
								}
							}
						}
					}
					const oldCards = player.getCards("s", card => card.hasGaintag("hadjanrong_discard"));
					game.deleteFakeCards(oldCards);
					const X = player.maxHp;
					const newDiscardPile = Array.from(ui.discardPile.childNodes);
					const bottomCards = newDiscardPile.slice(0, X);
					if (bottomCards.length > 0) {
						const cardsx = game.createFakeCards(bottomCards);
						player.directgains(cardsx, null, "hadjanrong_discard");
					}
					player._hadjanrong_last_cardids = bottomCards.map(c => c.cardid);
					if (player === game.me) {
						ui.updatehl();
					}
				},
			},
			setup: {
				trigger: {
					player: "enterGame",
					global: "phaseBefore",
				},
				forced: true,
				sourceSkill: "hadjanrong",
				filter(event, player) {
					if (!player.hasSkill("hadjanrong")) return false;
					if (event.name === "phase" && game.phaseNumber !== 0) return false;
					const discardCount = player.countCards("s", card => card.hasGaintag("hadjanrong_discard"));
					return discardCount === 0;
				},
				async content(event, trigger, player) {
					const X = player.maxHp;
					const discardPile = Array.from(ui.discardPile.childNodes);
					const bottomCards = discardPile.slice(0, X);
					if (bottomCards.length > 0) {
						const cardsx = game.createFakeCards(bottomCards);
						player.directgains(cardsx, null, "hadjanrong_discard");
						game.log(player, "观看了弃牌堆底的" + get.cnNumber(cardsx.length) + "张牌");
					}
					if (player === game.me) {
						ui.updatehl();
					}
				},
			},
			refresh: {
				trigger: { global: ["loseAfter", "cardsDiscardAfter", "loseAsyncAfter", "useCardAfter", "gainAfter"] },
				forced: true,
				priority: 5,
				sourceSkill: "hadjanrong",
				filter(event, player) {
					if (player._hadjanrong_refreshing) return false;
					if (!player.hasSkill("hadjanrong")) return false;
					const X = player.maxHp;
					const discardPile = Array.from(ui.discardPile.childNodes);
					const currentBottomCards = discardPile.slice(0, X);
					const currentCardIds = currentBottomCards.map(c => c.cardid);
					const lastCardIds = player._hadjanrong_last_cardids || [];
					const cardIdsChanged = JSON.stringify(currentCardIds) !== JSON.stringify(lastCardIds);
					if (!cardIdsChanged) return false;
					if (event.name === "useCard") {
						if (event.player !== player) return false;
						if (!event.cards || !event.cards.length) return false;
						return true;
					}
					if (event.name === "gain") {
						if (event.player !== player) return false;
						return true;
					}
					if (event.name === "lose" || event.name === "loseAsync") {
						if (!event.cards || !event.cards.length) return false;
						if (event.position !== ui.discardPile) return false;
					} else if (event.name === "cardsDiscard") {
						if (!event.cards || !event.cards.length) return false;
					}
					return true;
				},
				async content(event, trigger, player) {
					player._hadjanrong_refreshing = true;
					const oldCards = player.getCards("s", card => card.hasGaintag("hadjanrong_discard"));
					game.deleteFakeCards(oldCards);
					const X = player.maxHp;
					const discardPile = Array.from(ui.discardPile.childNodes);
					const bottomCards = discardPile.slice(0, X);
					if (bottomCards.length > 0) {
						const cardsx = game.createFakeCards(bottomCards);
						player.directgains(cardsx, null, "hadjanrong_discard");
					}
					player._hadjanrong_last_cardids = bottomCards.map(c => c.cardid);
					delete player._hadjanrong_using_cards;
					player._hadjanrong_refreshing = false;
					if (player === game.me) {
						ui.updatehl();
					}
				},
			},
			maxHp: {
				trigger: { player: "gainMaxHpAfter" },
				forced: true,
				sourceSkill: "hadjanrong",
				filter(event, player) {
					if (!player.hasSkill("hadjanrong")) return false;
					const X = player.maxHp;
					const discardCount = player.countCards("s", card => card.hasGaintag("hadjanrong_discard"));
					return discardCount < X;
				},
				async content(event, trigger, player) {
					const oldCards = player.getCards("s", card => card.hasGaintag("hadjanrong_discard"));
					game.deleteFakeCards(oldCards);
					const X = player.maxHp;
					const discardPile = Array.from(ui.discardPile.childNodes);
					const bottomCards = discardPile.slice(0, X);
					if (bottomCards.length > 0) {
						const cardsx = game.createFakeCards(bottomCards);
						player.directgains(cardsx, null, "hadjanrong_discard");
					}
					if (player === game.me) {
						ui.updatehl();
					}
				},
			},
		},
	},
	hadjyihui: {
		trigger: { player: "phaseBegin" },
		forced: true,
		locked: false,
		juexingji: true,
		skillAnimation: true,
		animationColor: "gold",
		filter(event, player) {
			const skills = player.getStorage("hadjanrong", []);
			return skills && skills.length >= 3;
		},
		async content(event, trigger, player) {
			player.awakenSkill(event.name);
			game.playSkillBgm("hadj");
			await player.recover(1);
			await player.removeSkills("hadjanrong");
			player.unmarkSkill("hadjanrong");
			game.log(player, "失去了技能【暗融】");
			if (game.hadj_audio && !game.hadj_audio.ended) {
				game.hadj_audio.pause();
				game.hadj_audio.currentTime = 0;
			}
			game.playSkillBgm("djsj");
			const skills = player.getStorage("hadjanrong", []);
			const oldMaxHp = player.maxHp;
			const oldHp = player.hp;
			const oldSingleHp = player.singleHp;
			const targetName = "黑暗迪迦";
			const newName = "迪迦";
			if (player.name1 === targetName) {
				player.reinitCharacter(player.name1, newName, false);
			} else if (player.name2 === targetName) {
				player.reinitCharacter(player.name2, newName, false);
			} else {
				player.reinitCharacter(player.name, newName, false);
			}
			player.maxHp = oldMaxHp;
			player.hp = Math.min(oldHp, oldMaxHp);
			player.singleHp = oldSingleHp;
			player.update();
			if (!player.hasSkill("djsj")) {
				await player.addSkills("djsj");
			}
			for (const skill of skills) {
				if (!player.hasSkill(skill)) {
					await player.addSkills(skill);
				}
			}
			game.log(player, "将武将牌替换为【迪迦】");
		},
	},
};
