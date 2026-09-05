import { lib, game, ui, get, ai, _status } from "../../../../../noname.js";

export const skills = {
	myjuesheng: {
		audio: ["ext:奥特之星/assets/juesheng"],
		trigger: { player: ["useCardAfter", "respondAfter"] },
		forced: true,
		locked: false,
		filter(event, player) {
			if (!event.card) return false;
			const cardType = get.type(event.card, null, false);
			const cardName = event.card.name;
			const dict = player.getStorage("juesheng_records_dict", {});
			if (cardType === "equip" || cardType === "delay") {
				return true;
			}
			return !Object.hasOwn(dict, cardName);
		},
		async content(event, trigger, player) {
			const cardType = get.type(trigger.card, null, false);
			if (cardType === "equip" || cardType === "delay") {
				await player.draw(1);
				return;
			}
			const cardName = trigger.card.name;
			const dict = player.getStorage("juesheng_records_dict", {});
			if (!Object.hasOwn(dict, cardName)) {
				dict[cardName] = 0;
				player.setStorage("juesheng_records_dict", dict, true);
				game.log(player, "记录了牌名【" + get.translation(cardName) + "】");
			}
			await player.draw(1);
		},
		mark: true,
		marktext: "决",
		markcount(storage, player) {
			return Object.keys(player.getStorage("juesheng_records_dict", {})).length;
		},
		intro: {
			content(storage, player) {
				const dict = player.getStorage("juesheng_records_dict", {});
				const records = Object.keys(dict);
				if (records.length > 0) {
					return "已记录的牌：" + records.map(name => get.translation(name)).join("、");
				}
				return "未记录牌名";
			},
		},
		group: ["myjuesheng_respond", "myjuesheng_reset"],
		subSkill: {
			reset: {
				trigger: { global: "phaseAfter" },
				forced: true,
				charlotte: true,
				filter(event, player) {
					return player.getStorage("juesheng_used", false) === true;
				},
				async content(event, trigger, player) {
					const dict = player.getStorage("juesheng_records_dict", {});
					for (const name in dict) {
						dict[name] = 0;
					}
					player.setStorage("juesheng_records_dict", dict, true);
					player.setStorage("juesheng_used", false, true);
					game.log(player, "决生：回合结束，重置使用记录");
				},
			},
			respond: {
				enable: ["phaseUse", "chooseToUse", "chooseToRespond"],
				hiddenCard(player, name) {
					const dict = player.getStorage("juesheng_records_dict", {});
					return Object.hasOwn(dict, name) && dict[name] === 0;
				},
				filter(event, player) {
					const dict = player.getStorage("juesheng_records_dict", {});
					if (!dict || Object.keys(dict).length === 0) return false;
					for (const name in dict) {
						if (dict[name] !== 0) continue;
						const card = { name: name, isCard: true };
						if (event.name === "phaseUse") {
							if (player.hasUseTarget(card)) return true;
						} else if (event.name === "chooseToRespond") {
							if (event.filterCard?.(card, player, event)) return true;
						} else if (event.filterCard?.(card, player, event)) {
							return true;
						}
					}
					return false;
				},
				chooseButton: {
					dialog(event, player) {
						const dict = player.getStorage("juesheng_records_dict", {});
						const list = [];
						for (const name in dict) {
							if (dict[name] !== 0) continue;
							const card = { name: name, isCard: true };
							let canUse = false;
							if (event.name === "phaseUse") {
								canUse = player.hasUseTarget(card);
							} else if (event.filterCard) {
								canUse = event.filterCard(card, player, event);
							}
							if (canUse) {
								const cardType = get.type2(card);
								const typeText = cardType === "basic" ? "基本牌" : cardType === "trick" ? "锦囊" : "装备";
								list.push([typeText, "", name]);
							}
						}
						return ui.create.dialog("决生", [list, "vcard"], "hidden");
					},
					filter(button, player) {
						const evt = get.event().getParent();
						const card = { name: button.link[2], isCard: true };
						if (evt.name === "phaseUse") {
							return player.hasUseTarget(card);
						}
						return evt.filterCard?.(card, player, evt) ?? false;
					},
					check(button) {
						const player = get.player();
						const evt = get.event().getParent();
						if (evt?.name === "chooseToRespond") return true;
						if (evt?.type === "dying" && evt.dying) {
							const attitude = get.attitude(player, evt.dying);
							if (attitude <= 0) return -10;
							return true;
						}
					},
					backup(links, player) {
						return {
							audio: ["ext:奥特之星/assets/juesheng"],
							filterCard() {
								return false;
							},
							selectCard: -1,
							viewAs: { name: links[0][2], isCard: true },
							popname: true,
							log: false,
							precontent() {
								const p = get.player();
								const name = get.event().result.card.name;
								const dict = p.getStorage("juesheng_records_dict", {});
								if (Object.hasOwn(dict, name)) {
									dict[name] = 1;
									p.setStorage("juesheng_records_dict", dict, true);
								}
								p.setStorage("juesheng_used", true, true);
								p.logSkill("myjuesheng");
								game.log(p, "发动决生，视为使用了【" + get.translation(name) + "】");
							},
						};
					},
					prompt(links, player) {
						return "选择【" + get.translation(links[0][2]) + "】的目标";
					},
				},
				ai: {
					order: 9,
					result: {
						player(player) {
							return 1;
						},
					},
				},
			},
		},
	},
	tbznengchi: {
		forced: true,
		trigger: {
			player: ["loseAfter", "disableEquipAfter", "enableEquipAfter"],
			global: ["equipAfter", "addJudgeAfter", "gainAfter", "loseAsyncAfter", "addToExpansionAfter"],
		},
		onremove: true,
		ai: {
			equipValue(card, player) {
				if (get.type2(card) !== "equip") return 0;
				const subtype = get.subtype(card);
				if (subtype === "equip3" || subtype === "equip4") return 100;
				const cardName = get.name(card);
				const storage = player.getStorage("tbznengchi_mark") ?? [];
				return storage.includes(cardName) ? 0 : 100;
			},
		},
		filter(event, player) {
			if (event.name === "disableEquip" || event.name === "enableEquip") return true;
			if (event.name === "equip" && event.player === player) {
				const card = event.card;
				if (!card) return false;
				const cardName = get.name(card);
				if (cardName === "muniu") return false;
				const info = get.info(card);
				return info?.skills?.length > 0 || !!info?.distance || get.subtype(card) === "equip1";
			}
			const evt = event.getl(player);
			if (!evt?.es?.length) return false;
			return evt.es.some(card => {
				const cardName = get.name(card);
				if (cardName === "muniu") return false;
				const info = get.info(card);
				return info?.skills?.length > 0 || !!info?.distance || get.subtype(card) === "equip1";
			});
		},
		async content(event, trigger, player) {
			if (trigger.name === "equip" && trigger.player === player) {
				const card = trigger.card;
				const cardName = get.name(card);
				if (cardName === "muniu") return;
				const info = get.info(card);
				const subtype = get.subtype(card);
				if (info?.distance && (subtype === "equip3" || subtype === "equip4")) {
					const dist = player.getStorage("tbznengchi_distance", { globalTo: 0, globalFrom: 0 });
					if (info.distance.globalTo) {
						dist.globalTo += info.distance.globalTo;
						game.log(player, "获得了加一马效果，其他角色计算与你的距离+" + info.distance.globalTo);
					}
					if (info.distance.globalFrom) {
						dist.globalFrom += info.distance.globalFrom;
						game.log(player, "获得了减一马效果，你计算与其他角色的距离" + info.distance.globalFrom);
					}
					player.setStorage("tbznengchi_distance", dist);
				}
				if (subtype === "equip1") {
					let attackRange = 1;
					if (typeof info?.distance?.attackRange === "function") {
						attackRange = info.distance.attackRange(card, player);
					} else if (typeof info?.distance?.attackFrom === "number") {
						attackRange = 1 - info.distance.attackFrom;
					}
					const currentRange = player.getStorage("tbznengchi_attackRange", 0);
					player.setStorage("tbznengchi_attackRange", currentRange + attackRange);
					game.log(player, "获得了攻击范围+" + attackRange + "的效果");
				}
				if (info?.skills?.length > 0) {
					const storage = player.getStorage("tbznengchi_mark") ?? [];
					if (!storage.includes(cardName)) {
						player.markAuto("tbznengchi_mark", [cardName]);
					}
					game.log(player, "获得了装备【" + get.translation(card) + "】的效果");
				}
				player.markSkill("tbznengchi_mark");
			}
			const storage = player.getStorage("tbznengchi_mark") ?? [];
			const skills = [];
			for (const cardName of storage) {
				if (cardName === "muniu") continue;
				const card = { name: cardName };
				const info = get.info(card);
				if (info?.skills) {
					for (const skill of info.skills) {
						if (!skills.includes(skill)) {
							skills.push(skill);
						}
					}
				}
			}
			if (skills.length > 0) {
				player.addSkill(skills);
			}
		},
		mod: {
			globalTo(from, to, distance) {
				const dist = to.getStorage("tbznengchi_distance", { globalTo: 0, globalFrom: 0 });
				if (dist.globalTo) {
					return distance + dist.globalTo;
				}
			},
			globalFrom(from, to, distance) {
				const dist = from.getStorage("tbznengchi_distance", { globalTo: 0, globalFrom: 0 });
				if (dist.globalFrom) {
					return distance + dist.globalFrom;
				}
			},
			attackRange(player, num) {
				const attackRange = player.getStorage("tbznengchi_attackRange", 0);
				if (attackRange > 0) {
					return num + attackRange;
				}
			},
			aiOrder(player, card, num) {
				if (get.itemtype(card) === "card" && get.type2(card) === "equip") {
					const cardName = get.name(card);
					const storage = player.getStorage("tbznengchi_mark") ?? [];
					if (!storage.includes(cardName)) {
						return num + 5;
					}
				}
			},
			aiValue(player, card, num) {
				if (get.itemtype(card) === "card" && get.type2(card) === "equip") {
					const cardName = get.name(card);
					const storage = player.getStorage("tbznengchi_mark") ?? [];
					if (!storage.includes(cardName)) {
						return num + 8;
					}
				}
			},
		},
		group: ["tbznengchi_draw"],
		subSkill: {
			draw: {
				audio: ["ext:奥特之星/assets/nengchi"],
				trigger: { player: "phaseUseBegin" },
				forced: true,
				async content(event, trigger, player) {
					player.logSkill("tbznengchi_draw");
					const cards = [];
					for (let i = 0; i < 3; i++) {
						const card = get.cardPile(card => get.type2(card) === "equip" && !cards.includes(card));
						if (card) cards.push(card);
					}
					if (cards.length > 0) {
						await player.gain(cards, "gain2");
						game.log(player, "从牌堆或弃牌堆获得了" + cards.length + "张装备牌");
					} else {
						game.log("牌堆和弃牌堆中没有装备牌");
					}
				},
			},
			mark: {
				mark: true,
				marktext: "装",
				intro: {
					content(storage, player) {
						const s = player.getStorage("tbznengchi_mark") ?? [];
						const dist = player.getStorage("tbznengchi_distance", { globalTo: 0, globalFrom: 0 });
						const attackRange = player.getStorage("tbznengchi_attackRange", 0);
						let str = "";
						if (attackRange > 0) {
							str += "攻击范围+" + attackRange;
						}
						if (dist.globalTo > 0) {
							if (str.length > 0) str += "<br>";
							str += "其他角色与你的距离+" + dist.globalTo;
						}
						if (dist.globalFrom < 0) {
							if (str.length > 0) str += "<br>";
							str += "你与其他角色的距离" + dist.globalFrom;
						}
						if (s.length > 0) {
							if (str.length > 0) str += "<br>";
							str += "已获得以下装备的效果：";
							for (const name of s) {
								str += "<br>【" + get.translation(name) + "】";
							}
						}
						return str.length === 0 ? "暂无装备效果" : str;
					},
				},
				onremove: true,
			},
		},
	},
	hjcsuixin: {
		audio: ["ext:奥特之星/assets/suixin1", "ext:奥特之星/assets/suixin2"],
		trigger: { global: ["phaseBegin", "phaseEnd"] },
		frequent: true,
		async content(event, trigger, player) {
			player.logSkill("hjcsuixin");
			const num = game.countPlayer() + 1;
			const cards = get.cards(num);
			game.cardsGotoOrdering(cards);
			const result = await player
				.chooseToMove("allowChooseAll")
				.set("list", [["牌堆顶", cards], ["牌堆底"], ["获得"]])
				.set("prompt", "随心：获得一张牌，将其余牌以任意顺序置于牌堆顶或牌堆底")
				.set("filterOk", moved => moved[2].length === 1)
				.set("forced", true)
				.set("filterMove", (from, to, moved) => {
					if (moved[0].includes(from.link) || moved[1].includes(from.link)) {
						if (typeof to === "number") {
							return to === 0 || to === 1 || !moved[2].length;
						}
						return true;
					}
					if (typeof to === "number") {
						return to === 0 || to === 1;
					}
					return true;
				})
				.set("processAI", list => {
					const p = get.event().player;
					const cs = list[0][1].slice(0);
					if (cs?.length) {
						const card = cs.maxBy(c => get.value(c, p));
						cs.remove(card);
						return [cs, [], [card]];
					}
					return [cs, [], []];
				})
				.forResult();
			if (result.bool && result.moved) {
				const top = result.moved[0].reverse();
				const bottom = result.moved[1];
				const gains = result.moved[2];
				if (top?.length) {
					for (const card of top) {
						ui.cardPile.insertBefore(card, ui.cardPile.firstChild);
					}
				}
				if (bottom?.length) {
					for (const card of bottom) {
						ui.cardPile.appendChild(card);
					}
				}
				if (gains?.length) {
					await player.gain(gains, "gain2");
				}
			}
		},
		ai: {
			threaten: 1.2,
			guanxing: true,
		},
	},
	mbmkmingmen: {
		audio: ["ext:奥特之星/assets/mingmen"],
		trigger: { global: "phaseBegin" },
		direct: true,
		async content(event, trigger, player) {
			const target = trigger.player;
			const result = await player
				.chooseControl("基本牌", "锦囊牌", "装备牌", "cancel2")
				.set("prompt", "【名门】是否令" + get.translation(target) + "本回合只能摸指定类型的牌？")
				.set("ai", () => {
					return ["基本牌", "锦囊牌", "装备牌"].randomGet();
				})
				.forResult();
			if (result.control && result.control !== "cancel2") {
				const cardType = result.control;
				player.logSkill("mbmkmingmen", target);
				target.addTempSkill("mbmkmingmen_effect");
				target.setStorage("mbmkmingmen_type", cardType);
				target.setStorage("mbmkmingmen_source", player);
				game.log(target, "本回合只能摸", cardType);
				const otherCards = [];
				const pile = ui.cardPile.childNodes;
				for (let i = 0; i < pile.length; i++) {
					const card = pile[i];
					const type = get.type(card, false);
					if (cardType === "基本牌" && type !== "basic") {
						otherCards.push(card);
					} else if (cardType === "锦囊牌" && type !== "trick" && type !== "delay") {
						otherCards.push(card);
					} else if (cardType === "装备牌" && type !== "equip") {
						otherCards.push(card);
					}
				}
				if (otherCards.length > 0) {
					const gainCard = otherCards[0];
					gainCard.remove();
					await player.gain(gainCard, "gain2");
					game.log(player, "获得了一张非", cardType);
				}
			}
		},
		subSkill: {
			effect: {
				charlotte: true,
				trigger: { player: "drawBegin" },
				forced: true,
				filter(event, player) {
					return player.getStorage("mbmkmingmen_type", null) && player.getStorage("mbmkmingmen_source", null);
				},
				async content(event, trigger, player) {
					const cardType = player.getStorage("mbmkmingmen_type", "");
					const num = trigger.num;
					const typeCards = [];
					const pile = ui.cardPile.childNodes;
					for (let i = 0; i < pile.length; i++) {
						const card = pile[i];
						const type = get.type(card, false);
						if (cardType === "基本牌" && type === "basic") {
							typeCards.push(card);
						} else if (cardType === "锦囊牌" && (type === "trick" || type === "delay")) {
							typeCards.push(card);
						} else if (cardType === "装备牌" && type === "equip") {
							typeCards.push(card);
						}
					}
					const available = Math.min(typeCards.length, num);
					if (typeCards.length === 0 || typeCards.length < num) {
						player.getStorage("mbmkmingmen_source", null)?.chat("坏了没有了");
						for (const p of game.players) {
							if (p !== player && p.isAlive()) {
								p.throwEmotion(player, ["egg", "shoe"].randomGet());
							}
						}
						game.log("牌堆中没有", cardType, "，", player, "正常摸牌");
						return;
					}
					if (available > 0) {
						const toDraw = typeCards.slice(0, available);
						for (let i = toDraw.length - 1; i >= 0; i--) {
							toDraw[i].remove();
							ui.cardPile.insertBefore(toDraw[i], ui.cardPile.firstChild);
						}
						game.log(player, "将" + available + "张", cardType, "置于牌堆顶");
					}
				},
			},
		},
	},
	mbmanbo: {
		audio: ["ext:奥特之星/assets/manbo1", "ext:奥特之星/assets/manbo2", "ext:奥特之星/assets/manbo3"],
		group: ["mbmanbo_round"],
		trigger: { player: "damageEnd" },
		forced: true,
		check(event, player) {
			return true;
		},
		async content(event, trigger, player) {
			if (!_status.characterlist) game.initCharacterList();
			const obtainedSkills = player.getStorage("mbmanbo_skills", []);
			const availableList = _status.characterlist.filter(name => {
				const skills = lib.character[name]?.[3] || [];
				const validSkills = skills.filter(skill => {
					const info = get.info(skill);
					return info && !info.charlotte && !info.hiddenSkill && !player.hasSkill(skill);
				});
				return validSkills.length > 0;
			});
			const list = availableList.randomGets(3);
			if (list.length < 3) return;
			const result = await player
				.chooseButton(["曼波：选择一名角色", [list, "character"]], true)
				.set("ai", button => {
					const name = button.link;
					const skills = lib.character[name]?.[3] || [];
					const validSkills = skills.filter(skill => {
						const info = get.info(skill);
						return info && !info.charlotte && !info.hiddenSkill && !player.hasSkill(skill);
					});
					return validSkills.reduce((sum, skill) => sum + Math.max(get.skillRank(skill, "out"), get.skillRank(skill, "in")), 0);
				})
				.forResult();
			if (!result.bool || !result.links?.length) return;
			const chosen = result.links[0];
			const skills = lib.character[chosen]?.[3] || [];
			const validSkills = skills.filter(skill => {
				const info = get.info(skill);
				return info && !info.charlotte && !info.hiddenSkill && !player.hasSkill(skill);
			});
			if (validSkills.length === 0) return;
			const result2 = await player
				.chooseButton(["曼波：选择获得" + get.translation(chosen) + "的一个技能", [validSkills, "skill"]], true)
				.set("ai", button => get.skillRank(button.link, "inout"))
				.forResult();
			if (!result2.bool || !result2.links?.length) return;
			const skill = result2.links[0];
			player.popup(skill);
			await player.addSkills(skill);
			player.markAuto("mbmanbo_skills", [skill]);
		},
		subSkill: {
			round: {
				audio: ["ext:奥特之星/assets/manbo1", "ext:奥特之星/assets/manbo2", "ext:奥特之星/assets/manbo3"],
				trigger: { global: ["roundStart", "roundEnd"] },
				forced: true,
				async content(event, trigger, player) {
					if (!_status.characterlist) game.initCharacterList();
					const obtainedSkills = player.getStorage("mbmanbo_skills", []);
					const availableList = _status.characterlist.filter(name => {
						const skills = lib.character[name]?.[3] || [];
						const validSkills = skills.filter(skill => {
							const info = get.info(skill);
							return info && !info.charlotte && !info.hiddenSkill && !player.hasSkill(skill);
						});
						return validSkills.length > 0;
					});
					const list = availableList.randomGets(3);
					if (list.length < 3) return;
					const result = await player
						.chooseButton(["曼波：选择一名角色", [list, "character"]], true)
						.set("ai", button => {
							const name = button.link;
							const skills = lib.character[name]?.[3] || [];
							const validSkills = skills.filter(skill => {
								const info = get.info(skill);
								return info && !info.charlotte && !info.hiddenSkill && !player.hasSkill(skill);
							});
							return validSkills.reduce((sum, skill) => sum + Math.max(get.skillRank(skill, "out"), get.skillRank(skill, "in")), 0);
						})
						.forResult();
					if (!result.bool || !result.links?.length) return;
					const chosen = result.links[0];
					const skills = lib.character[chosen]?.[3] || [];
					const validSkills = skills.filter(skill => {
						const info = get.info(skill);
						return info && !info.charlotte && !info.hiddenSkill && !player.hasSkill(skill);
					});
					if (validSkills.length === 0) return;
					const result2 = await player
						.chooseButton(["曼波：选择获得" + get.translation(chosen) + "的一个技能", [validSkills, "skill"]], true)
						.set("ai", button => get.skillRank(button.link, "inout"))
						.forResult();
					if (!result2.bool || !result2.links?.length) return;
					const skill = result2.links[0];
					player.popup(skill);
					await player.addSkills(skill);
					player.markAuto("mbmanbo_skills", [skill]);
				},
			},
		},
	},
	hjmhaqi: {
		audio: ["ext:奥特之星/assets/haqi1", "ext:奥特之星/assets/haqi2", "ext:奥特之星/assets/haqi3"],
		group: ["hjmhaqi_phaseDraw"],
		mark: true,
		marktext: "哈",
		intro: {
			name: "哈气",
			content(storage, player) {
				const b = player.getStorage("haqi_draw", 0);
				const c = player.getStorage("haqi_max", 0);
				const d = player.getStorage("haqi_sha", 0);
				return "·摸牌阶段多摸" + b + "张牌<br>·手牌上限+" + c + "<br>·出牌阶段可多出" + d + "张【杀】";
			},
		},
		trigger: { global: ["damageSource", "damageEnd"] },
		forced: true,
		filter(event) {
			return event.num > 0;
		},
		async content(event, trigger, player) {
			const num = trigger.num;
			let count = player.getStorage("haqi_count", 0);
			for (let i = 0; i < num; i++) {
				count++;
				player.setStorage("haqi_count", count, true);
				switch (count % 6) {
					case 0:
						player.setStorage("haqi_max", player.getStorage("haqi_max", 0) + 1, true);
						break;
					case 1:
						await player.draw();
						break;
					case 2:
						player.setStorage("haqi_draw", player.getStorage("haqi_draw", 0) + 1, true);
						break;
					case 3:
						await player.recover();
						break;
					case 4:
						await player.gainMaxHp();
						break;
					case 5:
						player.setStorage("haqi_sha", player.getStorage("haqi_sha", 0) + 1, true);
						break;
				}
			}
		},
		subSkill: {
			phaseDraw: {
				mod: {
					maxHandcard(player, current) {
						return current + player.getStorage("haqi_max", 0);
					},
					cardUsable(card, player, num) {
						if (card.name === "sha") return num + player.getStorage("haqi_sha", 0);
					},
				},
				trigger: { player: "phaseDrawBegin" },
				forced: true,
				filter(event, player) {
					return player.getStorage("haqi_draw", 0) > 0;
				},
				async content(event, trigger, player) {
					trigger.num += player.getStorage("haqi_draw", 0);
				},
			},
		},
	},
};
