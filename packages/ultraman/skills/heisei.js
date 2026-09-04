import { lib, game, ui, get, ai, _status } from "../../../../../noname.js";

export const skills = {
	nkssjicheng: {
		trigger: { source: "damageAfter", player: "phaseUseBegin" },
		direct: true,
		derivation: ["nksslingyu", "nkssguangshi"],
		filter(event, player) {
			return !player.hasSkill("nksslingyu") || !player.hasSkill("nkssguangshi");
		},
		async content(event, trigger, player) {
			const gained = ["nksslingyu", "nkssguangshi"].find(skill => !player.hasSkill(skill));
			if (!gained) return;
			player.logSkill("nkssjicheng");
			const count = player.getStorage("nkssjicheng_count", 0);
			player.setStorage("nkssjicheng_count", count + 1);
			player.changeSkin("nkssjicheng", count === 0 ? "奈克瑟斯-青年型" : "奈克瑟斯-蓝色青年型");
			await player.addSkills(gained);
			await player.gainMaxHp(1);
			await player.recover();
			await player.draw();
		},
		group: ["nkssjicheng_die"],
		subSkill: {
			die: {
				trigger: { player: "dieBefore" },
				filter(event, player) {
					return game.hasPlayer(target => target !== player && target.isAlive());
				},
				async content(event, trigger, player) {
					const result = await player
						.chooseTarget(true, "选择一名其他角色继承", (card, player, target) => {
							return target !== player && target.isAlive();
						})
						.set("ai", target => get.attitude(player, target))
						.forResult();
					if (result.bool && result.targets?.length > 0) {
						const target = result.targets[0];
						const gained = ["nksslingyu", "nkssguangshi"].filter(skill => player.hasSkill(skill));
						await target.addSkills(gained.concat("nkssjicheng"));
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
	djsj: {
		derivation: ["djfuhe", "djqiangli", "djkongzhong"],
		trigger: { global: "gameStart" },
		forced: true,
		locked: false,
		async content(event, trigger, player) {
			await player.addSkills("djfuhe");
		},
		group: ["djsj_addSkill", "djsj_switch"],
		subSkill: {
			addSkill: {
				forced: true,
				trigger: { global: "changeSkillsAfter" },
				filter(event, player) {
					if (event.addSkill.includes("djsj")) {
						return !event.player.hasSkill("djqiangli") && !event.player.hasSkill("djkongzhong");
					}
					return false;
				},
				async content(event, trigger, player) {
					await player.addSkills("djfuhe");
				},
			},
			switch: {
				audio: ["ext:奥特之星/assets/ultraman/audio/skill/djsj0.mp3"],
				enable: "phaseUse",
				usable: 3,
				filter(event, player) {
					if (event.type !== "phase") return false;
					if (_status.currentPhase !== player) return false;
					return player.hasSkill("djfuhe") || player.hasSkill("djqiangli") || player.hasSkill("djkongzhong");
				},
				async content(event, trigger, player) {
					let target;
					game.playSkillBgm("djsj");
					const choiceSet = new Set();
					if (player.hasSkill("djfuhe")) {
						choiceSet.add("强力");
						choiceSet.add("空中");
					}
					if (player.hasSkill("djqiangli")) {
						choiceSet.add("复合");
						choiceSet.add("空中");
					}
					if (player.hasSkill("djkongzhong")) {
						choiceSet.add("复合");
						choiceSet.add("强力");
					}
					const choices = Array.from(choiceSet);
					if (choices.length === 0) return;
					const result = await player
						.chooseControl(choices)
						.set("prompt", "选择要切换的形态")
						.set("choices", choices)
						.set("ai", () => {
							const player = get.player();
							const choices = get.event().choices;
							const stat = player.getStat("skill");
							if (player.hasSkill("djfuhe")) {
								const usedFuh = stat.djfuhe ?? 0;
								if (usedFuh < 2 && player.hasCards("h")) {
									return choices.randomGet();
								}
								const hasDamage = player.hasCard(card => get.tag(card, "damage"), "h");
								if (hasDamage) return "强力";
								return "空中";
							}
							if (player.hasSkill("djqiangli")) {
								const hasDamage = player.hasCard(card => get.tag(card, "damage"), "h");
								if (hasDamage) return choices.randomGet();
								return "复合";
							}
							if (player.hasSkill("djkongzhong")) {
								const hasSha = player.hasCard(card => card.name === "sha", "h");
								if (hasSha) return choices.randomGet();
								return "复合";
							}
							return choices.randomGet();
						})
						.forResult();
					if (result.control) {
						target = result.control;
					} else {
						return;
					}
					if (target === "强力") {
						if (player.hasSkill("djfuhe")) await player.removeSkills("djfuhe");
						if (player.hasSkill("djkongzhong")) await player.removeSkills("djkongzhong");
						await player.addSkills("djqiangli");
						player.changeSkin("djsj", "迪迦-强力");
						game.log(player, "切换为【强力】形态");
					} else if (target === "空中") {
						if (player.hasSkill("djfuhe")) await player.removeSkills("djfuhe");
						if (player.hasSkill("djqiangli")) await player.removeSkills("djqiangli");
						await player.addSkills("djkongzhong");
						player.changeSkin("djsj", "迪迦-空中");
						game.log(player, "切换为【空中】形态");
					} else if (target === "复合") {
						if (player.hasSkill("djqiangli")) await player.removeSkills("djqiangli");
						if (player.hasSkill("djkongzhong")) await player.removeSkills("djkongzhong");
						await player.addSkills("djfuhe");
						player.changeSkin("djsj", "迪迦-复合");
						game.log(player, "切换为【复合】形态");
					}
				},
				ai: {
					order: 10,
					result: {
						player(player) {
							const stat = player.getStat("skill");
							const usedSwitch = stat.djsj_switch ?? 0;
							if (usedSwitch >= 3) return 0;
							if (player.hasSkill("djfuhe")) {
								const usedFuh = stat.djfuhe ?? 0;
								if (usedFuh >= 2 || !player.hasCards("h")) return 10;
								return 0;
							}
							if (usedSwitch === 0) {
								return 10;
							}
							if (player.hasSkill("djqiangli")) {
								const hasDamage = player.hasCard(card => get.tag(card, "damage"), "h");
								if (!hasDamage) return 10;
								return 0;
							}
							if (player.hasSkill("djkongzhong")) {
								const hasSha = player.hasCard(card => card.name === "sha", "h");
								if (!hasSha) return 10;
								return 0;
							}
							return 0;
						},
					},
				},
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
	xklkeyan: {
		audio: ["ext:奥特之星/assets/ultraman/audio/skill/keyan.mp3"],
		enable: "phaseUse",
		usable: 1,
		locked: false,
		filter(event, player) {
			return ui.cardPile.childNodes.length > 0;
		},
		get prompt() {
			const player = _status.currentPhase;
			if (!player) return "科研";
			const stat = player.getStat("skill");
			const used = stat.xklkeyan || 0;
			const remain = Math.max(0, 1 + (used < 0 ? -used : 0) - (used > 0 ? used : 0));
			return "科研（本回合剩余可发动" + remain + "次）";
		},
		async content(event, trigger, player) {
			const card = get.cards(1, true);
			event.card = card[0];
			if (!event.card) return;
			ui.cardPile.insertBefore(event.card, ui.cardPile.firstChild);
			game.updateRoundNumber();
			const cardName = get.name(event.card, player);
			const cardNature = get.nature(event.card, player);
			let natureText = "";
			if (cardNature) {
				const natureMap = { fire: "火", thunder: "雷", ice: "冰", poison: "毒" };
				natureText = natureMap[cardNature] || "";
			}
			const cardNameTranslation = get.translation(cardName);
			const message = "牌名：【" + natureText + cardNameTranslation + "】";
			event.dialog = ui.create.dialog(message);
			event.dialog.classList.add("fixed");
			await new Promise(resolve => setTimeout(resolve, 1200));
			event.dialog.close();
			delete event.dialog;
			const suitList = ["红心", "黑桃", "梅花", "方块"];
			const suitResult = await player
				.chooseControl(suitList)
				.set("prompt", "请猜测此牌的花色")
				.set("ai", () => get.rand(0, 3))
				.forResult();
			event.suitChoice = suitResult.index;
			const numberList = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
			const numberResult = await player
				.chooseControl(numberList)
				.set("prompt", "请猜测此牌的点数")
				.set("ai", () => get.rand(0, 12))
				.forResult();
			event.numberChoice = numberResult.index + 1;
			const cardSuit = get.suit(event.card);
			const cardNumber = get.number(event.card);
			const suitMap = { 红心: "heart", 黑桃: "spade", 梅花: "club", 方块: "diamond" };
			const suitNames = ["红心", "黑桃", "梅花", "方块"];
			let correctCount = 0;
			if (suitMap[suitNames[event.suitChoice]] === cardSuit) {
				correctCount++;
			}
			if (event.numberChoice === cardNumber) {
				correctCount++;
			}
			event.correctCount = correctCount;
			let resultMessage = "";
			if (correctCount >= 1) {
				const next = player.gain(event.card, "gain2");
				next.gaintag.add("xklkeyan_nolimit");
				await next;
				const stat = player.getStat("skill");
				stat.xklkeyan = (stat.xklkeyan || 0) - correctCount;
				resultMessage = "猜对了" + correctCount + "项！本回合科研可发动次数+" + correctCount;
			} else {
				await player.lose(event.card, ui.discardPile);
				resultMessage = "猜错了！";
			}
			event.dialog2 = ui.create.dialog(resultMessage);
			event.dialog2.classList.add("fixed");
			await new Promise(resolve => setTimeout(resolve, 800));
			if (event.dialog2) {
				event.dialog2.close();
				delete event.dialog2;
			}
		},
		ai: {
			order: 5,
			result: {
				player(player) {
					return 1;
				},
			},
		},
		mod: {
			ignoredHandcard(card, player) {
				if (card.hasGaintag("xklkeyan_nolimit")) {
					return true;
				}
			},
			cardDiscardable(card, player, name) {
				if (name == "phaseDiscard" && card.hasGaintag("xklkeyan_nolimit")) {
					return false;
				}
			},
			cardUsable(card, player) {
				if (typeof card === "object") {
					if ([card].concat(card.cards || []).some(cardx => get.itemtype(cardx) === "card" && cardx.hasGaintag("xklkeyan_nolimit"))) {
						return Infinity;
					}
				}
			},
			targetInRange(card, player, target) {
				if (typeof card === "object") {
					if ([card].concat(card.cards || []).some(cardx => get.itemtype(cardx) === "card" && cardx.hasGaintag("xklkeyan_nolimit"))) {
						return true;
					}
				}
			},
		},
	},
	xkllizhu: {
		trigger: { global: "addMark" },
		direct: true,
		firstDo: true,
		filter(event, player) {
			if (event._xkllizhu_triggered) return false;
			if (event.log === false) return false;
			return event.num > 0;
		},
		async content(event, trigger, player) {
			const target = trigger.player;
			const markName = trigger.markName;
			if (!target || !markName) return;
			const sourceEvent = trigger.getParent();
			const source = sourceEvent?.player;
			const result = await player
				.chooseControl("令标记+1", "不使用")
				.set("prompt", "力助：是否令" + get.translation(target) + "的" + get.translation(markName) + "标记数量+1？")
				.set("ai", () => {
					if (source && get.attitude(source, player) < 0) {
						return "不使用";
					}
					if (get.attitude(target, player) > 0) {
						return "令标记+1";
					}
					return "不使用";
				})
				.forResult();
			if (result.control === "令标记+1") {
				game.playSkillBgm("xikali");
				trigger._xkllizhu_triggered = true;
				target.setStorage(markName, target.getStorage(markName, 0) + 1);
				target.markSkill(markName);
				game.log(player, "令" + get.translation(target) + "的" + get.translation(markName) + "标记数量+1");
			}
		},
		group: ["xkllizhu_useEquip", "xkllizhu_die"],
		subSkill: {
			die: {
				trigger: { player: "die" },
				forced: true,
				silent: true,
				async content(event, trigger, player) {
					if (game.xikali_audio && !game.xikali_audio.ended) {
						game.xikali_audio.pause();
						game.xikali_audio.currentTime = 0;
					}
				},
			},
			useEquip: {
				trigger: { player: "phaseEnd" },
				prompt: "是否发动【力助】？选择一名其他角色获得装备",
				filter(event, player) {
					const history = player.getHistory("lose", evt => {
						if (evt.type !== "discard") return false;
						if (!evt.cards) return false;
						return evt.cards.some(c => get.type(c) === "equip");
					});
					if (history.length === 0) return false;
					for (const evt of history) {
						for (const c of evt.cards) {
							if (get.type(c) === "equip" && get.position(c) === "d") {
								return true;
							}
						}
					}
					return false;
				},
				check(event, player) {
					return game.hasPlayer(p => p !== player && get.attitude(player, p) > 0);
				},
				async content(event, trigger, player) {
					const history = player.getHistory("lose", evt => {
						if (evt.type !== "discard") return false;
						if (!evt.cards) return false;
						return evt.cards.some(c => get.type(c) === "equip");
					});
					const equipCards = [];
					for (const evt of history) {
						for (const c of evt.cards) {
							if (get.type(c) === "equip" && get.position(c) === "d") {
								equipCards.push(c);
							}
						}
					}
					if (equipCards.length === 0) return;
					const result = await player
						.chooseTarget(true)
						.set("filterTarget", (card, player, target) => target !== player)
						.set("ai", target => {
							if (target === player) return -10;
							const att = get.attitude(player, target);
							if (att <= 0) return -10;
							return att + Math.random();
						})
						.forResult();
					if (result.bool && result.targets?.length > 0) {
						const target = result.targets[0];
						const card = equipCards.randomGet();
						await target.gain(card, "give");
						if (target.canEquip(card)) {
							await target.equip(card);
							game.log(player, "令" + get.translation(target) + "获得并装备了" + get.translation(card));
						} else {
							game.log(player, "令" + get.translation(target) + "获得了" + get.translation(card));
						}
					}
				},
			},
		},
	},
	dnshuijing: {
		derivation: ["dnshanliang", "dnqiji", "dnqiangzhuang"],
		trigger: { global: "gameStart" },
		forced: true,
		locked: false,
		async content(event, trigger, player) {
			await player.addSkills("dnshanliang");
		},
		group: ["dnshuijing_addSkill", "dnshuijing_switch"],
		subSkill: {
			addSkill: {
				forced: true,
				trigger: { global: "changeSkillsAfter" },
				filter(event, player) {
					if (event.addSkill.includes("dnshuijing")) {
						return !event.player.hasSkill("dnqiji") && !event.player.hasSkill("dnqiangzhuang");
					}
				},
				async content(event, trigger, player) {
					await player.addSkills("dnshanliang");
				},
			},
			switch: {
				audio: ["ext:奥特之星/assets/ultraman/audio/skill/dnsj"],
				enable: "phaseUse",
				filter(event, player) {
					const stat = player.getStat("skill");
					const usedCount = stat.dnshuijing_switch ?? 0;
					if (usedCount >= 1) return false;
					return player.hasSkill("dnshanliang") || player.hasSkill("dnqiji") || player.hasSkill("dnqiangzhuang");
				},
				async content(event, trigger, player) {
					const choices = [];
					if (player.hasSkill("dnshanliang")) {
						choices.push("奇迹", "强壮");
					}
					if (player.hasSkill("dnqiji") || player.hasSkill("dnqiangzhuang")) {
						choices.push("闪亮");
					}
					if (choices.length === 0) return;
					const result = await player
						.chooseControl(choices)
						.set("prompt", "选择要切换的形态")
						.set("choices", choices)
						.set("ai", () => {
							const player = get.player();
							const choices = get.event().choices;
							if (player.hasSkill("dnqiangzhuang")) {
								return "闪亮";
							}
							if (player.hasSkill("dnshanliang")) {
								const stat = player.getStat("skill");
								const usedShan = stat.dnshanliang ?? 0;
								const trickCount = player.countCards("h", card => {
									return get.type(card) === "trick" && !get.tag(card, "delay");
								});
								if (usedShan >= 2 && trickCount >= 2) {
									return "强壮";
								}
								if (Math.random() < 0.3) {
									return "奇迹";
								}
								const hasDamage = player.hasCard(card => get.tag(card, "damage"), "h");
								if (hasDamage) return "强壮";
								return choices.randomGet();
							}
							if (player.hasSkill("dnqiji")) {
								if (Math.random() < 0.3) {
									return "闪亮";
								}
								const hasDamage = player.hasCard(card => get.tag(card, "damage"), "h");
								if (!hasDamage) {
									return "闪亮";
								}
								return choices.randomGet();
							}
							return choices.randomGet();
						})
						.forResult();
					if (result.control === "奇迹") {
						if (player.hasSkill("dnshanliang")) await player.removeSkills("dnshanliang");
						if (player.hasSkill("dnqiangzhuang")) await player.removeSkills("dnqiangzhuang");
						await player.addSkills("dnqiji");
						player.changeSkin("dnshuijing", "戴拿-奇迹");
						game.log(player, "切换为【奇迹】形态");
					} else if (result.control === "强壮") {
						if (player.hasSkill("dnshanliang")) await player.removeSkills("dnshanliang");
						if (player.hasSkill("dnqiji")) await player.removeSkills("dnqiji");
						await player.addSkills("dnqiangzhuang");
						player.changeSkin("dnshuijing", "戴拿-强壮");
						game.log(player, "切换为【强壮】形态");
					} else if (result.control === "闪亮") {
						if (player.hasSkill("dnqiji")) await player.removeSkills("dnqiji");
						if (player.hasSkill("dnqiangzhuang")) await player.removeSkills("dnqiangzhuang");
						await player.addSkills("dnshanliang");
						player.changeSkin("dnshuijing", "戴拿-闪亮");
						game.log(player, "切换为【闪亮】形态");
					}
				},
				ai: {
					order: 8,
					result: {
						player(player) {
							if (player.hasSkill("dnshanliang")) {
								const trickCount = player.countCards("h", card => {
									return get.type(card) === "trick" && !get.tag(card, "delay");
								});
								if (trickCount >= 2) return 10;
								else if (Math.random() < 0.66) return 8;
								return 0;
							}
							if (player.hasSkill("dnqiangzhuang")) {
								const trickCount = player.countCards("h", card => {
									return get.type(card) === "trick" && !get.tag(card, "delay");
								});
								if (trickCount < 2) return 10;
								return 0;
							}
							if (player.hasSkill("dnqiji")) {
								if (Math.random() < 0.33) return 10;
								return 0;
							}
							return 0;
						},
					},
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
	jstsfensui: {
		zhuanhuanji: true,
		mark: true,
		marktext: "☯",
		intro: {
			content(storage, player) {
				if (!player) {
					return storage ? "转换技，【阴】：当其他角色成为牌的目标后，你可以令一名角色执行：①受到一点伤害然后回复两点体力；②受到两点伤害然后回复一点体力。" : "转换技，【阳】：当你成为牌的目标后，你可以令一名角色执行：①摸两张牌并弃置一张牌；②摸一张牌并弃置两张牌。";
				}
				const isYin = !!player.storage.jstsfensui;
				const option = player.getStorage(isYin ? "jstsfensui_yin" : "jstsfensui_yang", 0);
				const color = isYin ? "bluetext" : "firetext";
				const label = isYin ? "阴" : "阳";
				const trigger = isYin ? "当其他角色成为牌的目标后，你可以令一名角色执行" : "当你成为牌的目标后，你可以令一名角色执行";
				const effects = isYin ? ["受到一点伤害然后回复两点体力", "受到两点伤害然后回复一点体力"] : ["摸两张牌并弃置一张牌", "摸一张牌并弃置两张牌"];
				const str = effects
					.map((text, i) => {
						const cn = i === 0 ? "①" : "②";
						return i === option ? `<span class='${color}'>${cn}${text}</span>` : cn + text;
					})
					.join("；");
				return `转换技，${label}：${trigger}：${str}。`;
			},
		},
		trigger: { global: "useCardToTarget" },
		filter(event, player) {
			if (player.storage.jstsfensui) {
				return event.target !== player && game.hasPlayer(target => target.isIn() && target !== player);
			}
			return event.target === player;
		},
		async cost(event, trigger, player) {
			const isYin = player.storage.jstsfensui;
			const option = player.getStorage(isYin ? "jstsfensui_yin" : "jstsfensui_yang", 0);
			const next = player.chooseTarget(get.prompt(event.skill));
			if (isYin) {
				next.set("prompt2", option === 0 ? "令一名角色受到一点伤害然后回复两点体力" : "令一名角色受到两点伤害然后回复一点体力");
			} else {
				next.set("prompt2", option === 0 ? "令一名角色摸两张牌并弃置一张牌" : "令一名角色摸一张牌并弃置两张牌");
			}
			next.set("ai", target => {
				const player = get.player();
				const isYin = player.storage.jstsfensui;
				const option = player.getStorage(isYin ? "jstsfensui_yin" : "jstsfensui_yang", 0);
				const attitude = get.attitude(player, target);
				if (!isYin) {
					if (option === 0) {
						return attitude > 0 ? attitude + Math.random() : -1;
					}
					return attitude < 0 ? -attitude + Math.random() : -1;
				}
				if (option === 0) {
					if (attitude > 0 && target.getHp() < target.maxHp && target.getHp() > 1) {
						return 20 + attitude;
					}
					if (attitude < 0 && target.getHp() === 1) {
						return 10 - attitude;
					}
					return 1 + attitude;
				}
				if (attitude < 0) {
					return -attitude + (target.maxHp - target.getHp()) * 100;
				}
				return -1;
			});
			event.result = await next.forResult();
		},
		async content(event, trigger, player) {
			game.playSkillBgm("jsts");
			const isYin = player.storage.jstsfensui;
			const key = isYin ? "jstsfensui_yin" : "jstsfensui_yang";
			const option = player.getStorage(key, 0);
			player.setStorage(key, 1 - option);
			player.changeZhuanhuanji(event.name);
			player.changeSkin("jstsfensui", player.storage.jstsfensui ? "杰斯提斯-粉碎" : "杰斯提斯");
			const target = event.targets[0];
			if (isYin) {
				await target.damage(option === 0 ? 1 : 2);
				if (target.isIn()) {
					await target.recover(option === 0 ? 2 : 1);
				}
			} else {
				await target.draw(option === 0 ? 2 : 1);
				if (target.isIn()) {
					await target.chooseToDiscard("he", option === 0 ? 1 : 2, true);
				}
			}
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
};
