import { lib, game, ui, get, ai, _status } from "../../../../../noname.js";

export const skills = {
	plcmhuanjing: {
		audio: ["ext:奥特之星/assets/misc/audio/skill/huanjing"],
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
		audio: ["ext:奥特之星/assets/misc/audio/skill/lengjing"],
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
				audio: ["ext:奥特之星/assets/misc/audio/skill/lengjing"],
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
		audio: ["ext:奥特之星/assets/misc/audio/skill/jinghua"],
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
	mbmanbo: {
		audio: ["ext:奥特之星/assets/misc/audio/skill/manbo1", "ext:奥特之星/assets/misc/audio/skill/manbo2", "ext:奥特之星/assets/misc/audio/skill/manbo3"],
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
				audio: ["ext:奥特之星/assets/misc/audio/skill/manbo1", "ext:奥特之星/assets/misc/audio/skill/manbo2", "ext:奥特之星/assets/misc/audio/skill/manbo3"],
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
		audio: ["ext:奥特之星/assets/misc/audio/skill/haqi1", "ext:奥特之星/assets/misc/audio/skill/haqi2", "ext:奥特之星/assets/misc/audio/skill/haqi3"],
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
	mcpxingshang: {
		getLimit: 9,
		getList: [
			{
				cost: 2,
				prompt: () => "令一名角色复原武将牌",
				filter: () => game.hasPlayer(target => target.isLinked() || target.isTurnedOver()),
				filterTarget: (card, player, target) => target.isLinked() || target.isTurnedOver(),
				async content(player, target) {
					if (target.isLinked()) {
						await target.link(false);
					}
					if (target.isTurnedOver()) {
						await target.turnOver(false);
					}
				},
				ai: {
					result: {
						target(player, target) {
							let res = 0;
							if (target.isLinked()) {
								res = 0.3;
							}
							if (target.isTurnedOver()) {
								res += 3.5 * get.threaten(target, player);
							}
							return res;
						},
					},
				},
			},
			{
				cost: 2,
				prompt: () => "令一名角色摸" + get.cnNumber(Math.min(5, Math.max(2, game.dead.length))) + "张牌",
				filter: () => true,
				filterTarget: true,
				async content(player, target) {
					await target.draw(Math.min(5, Math.max(2, game.dead.length)));
				},
				ai: {
					result: {
						player(player, target) {
							return get.effect(target, { name: "draw" }, player, player) * Math.min(5, Math.max(2, game.dead.length));
						},
					},
				},
			},
			{
				cost: 5,
				prompt: () => "令一名体力上限小于10的角色回复1点体力，增加1点体力上限，随机恢复一个废除的装备栏",
				filter: () => game.hasPlayer(target => target.maxHp < 10),
				filterTarget: (card, player, target) => target.maxHp < 10,
				async content(player, target) {
					await target.recover();
					await target.gainMaxHp();
					let list = Array.from({ length: 13 }).map((_, i) => "equip" + parseFloat(i + 1));
					list = list.filter(i => target.hasDisabledSlot(i));
					if (list.length) {
						await target.enableEquip(list.randomGet());
					}
				},
				ai: {
					result: {
						target(player, target) {
							let res = 0.2;
							if (target.isHealthy()) {
								res += 0.4;
							}
							if (
								Array.from({ length: 5 })
									.map((_, i) => "equip" + parseFloat(i + 1))
									.some(i => target.hasDisabledSlot(i))
							) {
								res += 0.3;
							}
							return res + get.recoverEffect(target, target, target) / 16;
						},
					},
				},
			},
			{
				cost: 5,
				prompt: () => "获得一名已阵亡角色的武将牌上的所有技能，然后失去〖行殇〗〖放逐〗〖颂威〗",
				filter: () => game.dead.some(target => target.getStockSkills(true, true).some(i => get.info(i) && !get.info(i).charlotte)),
				filterTarget(card, player, target) {
					if (!target.isDead()) {
						return false;
					}
					return target.getStockSkills(true, true).some(i => get.info(i) && !get.info(i).charlotte);
				},
				deadTarget: true,
				async content(player, target) {
					await player.changeSkills(
						target.getStockSkills(true, true).filter(skill => get.info(skill) && !get.info(skill).charlotte),
						["mcpxingshang", "mcpfangzhu", "mcpsongwei"]
					);
				},
				ai: {
					result: {
						player(player, target) {
							return ["name", "name1", "name2"].reduce((sum, name) => {
								if (!target[name] || !lib.character[target[name]] || (name == "name1" && target.name1 == target.name)) {
									return sum;
								}
								return sum + get.rank(target[name], true);
							}, 0);
						},
					},
				},
			},
		],
		mark: true,
		marktext: "颂",
		intro: {
			name: "颂",
			content: "mark",
		},
		enable: "phaseUse",
		filter(event, player) {
			return get.info("mcpxingshang").getList.some(effect => {
				return player.countMark("mcpxingshang") >= effect.cost && effect.filter(player);
			});
		},
		usable: 2,
		chooseButton: {
			dialog() {
				let dialog = ui.create.dialog("行殇：请选择一项", "hidden");
				const list = get.info("mcpxingshang").getList.slice();
				dialog.add([
					list.map(effect => {
						return [effect, "移去" + effect.cost + "个“颂”标记，" + effect.prompt()];
					}),
					"textbutton",
				]);
				return dialog;
			},
			filter(button, player) {
				const effect = button.link;
				return player.countMark("mcpxingshang") >= effect.cost && effect.filter(player);
			},
			check(button) {
				const player = get.event().player,
					effect = button.link;
				return Math.max(
					...game
						.filterPlayer(target => {
							const filterTarget = effect.filterTarget;
							if (!filterTarget) {
								return target == player;
							}
							if (typeof filterTarget == "function") {
								return filterTarget(null, player, target);
							}
							return true;
						})
						.map(target => {
							game.broadcastAll(effect => (lib.skill["mcpxingshang_aiSkill"].ai = effect.ai), effect);
							return get.effect(target, "mcpxingshang_aiSkill", player, player);
						})
				);
			},
			backup(links, player) {
				const effect = links[0];
				return {
					effect: effect,
					audio: ["ext:奥特之星/assets/misc/audio/skill/xingshang1", "ext:奥特之星/assets/misc/audio/skill/xingshang2"],
					filterCard: () => false,
					selectCard: -1,
					filterTarget: effect.filterTarget,
					deadTarget: effect.deadTarget,
					async content(event, trigger, player) {
						const target = event.targets[0],
							effect = lib.skill.mcpxingshang_backup.effect;
						player.removeMark("mcpxingshang", effect.cost);
						await effect.content(player, target);
					},
					ai: effect.ai,
				};
			},
			prompt(links, player) {
				const effect = links[0],
					str = "###行殇###";
				return str + '<div class="text center">' + "移去" + effect.cost + "个“颂”标记，" + effect.prompt() + "</div>";
			},
		},
		ai: {
			order: 6.5,
			result: {
				player(player) {
					const list = get.info("mcpxingshang").getList.filter(effect => {
						return player.countMark("mcpxingshang") >= effect.cost && effect.filter(player);
					});
					return Math.max(
						...list.map(effect => {
							return Math.max(
								...game
									.filterPlayer(target => {
										const filterTarget = effect.filterTarget;
										if (!filterTarget) {
											return target == player;
										}
										if (typeof filterTarget == "function") {
											return filterTarget(null, player, target);
										}
										return true;
									})
									.map(target => {
										game.broadcastAll(effect => (lib.skill["mcpxingshang_aiSkill"].ai = effect.ai), effect);
										return get.effect(target, "mcpxingshang_aiSkill", player, player);
									})
							);
						})
					);
				},
			},
		},
		group: "mcpxingshang_gain",
		subSkill: {
			aiSkill: {},
			backup: {},
			gain: {
				audio: ["ext:奥特之星/assets/misc/audio/skill/xingshang1", "ext:奥特之星/assets/misc/audio/skill/xingshang2"],
				trigger: { global: ["die", "damageEnd"] },
				filter(event, player) {
					if (player.countMark("mcpxingshang") >= get.info("mcpxingshang").getLimit) {
						return false;
					}
					return event.name == "die" || !player.getHistory("custom", evt => evt.mcpxingshang).length;
				},
				forced: true,
				locked: false,
				async content(event, trigger, player) {
					player.addMark("mcpxingshang", Math.min(2, get.info("mcpxingshang").getLimit - player.countMark("mcpxingshang")));
					if (trigger.name == "damage") {
						player.getHistory("custom").push({ mcpxingshang: true });
					}
				},
			},
		},
	},
	mcpfangzhu: {
		getList: [
			{
				cost: 1,
				prompt: () => "令一名其他角色于手牌中只能使用基本牌直到其回合结束",
				filter: player => game.hasPlayer(target => target != player && !target.getStorage("mcpfangzhu_ban").includes("basic")),
				filterTarget: (card, player, target) => target != player && !target.getStorage("mcpfangzhu_ban").includes("basic"),
				async content(player, target) {
					target.addTempSkill("mcpfangzhu_ban", { player: "phaseEnd" });
					target.markAuto("mcpfangzhu_ban", ["basic"]);
					lib.skill.mcpfangzhu_ban.init(target, "mcpfangzhu_ban");
				},
				ai: {
					result: {
						target(player, target) {
							return -(target.countCards("hs") + 2) / 3;
						},
					},
				},
			},
			{
				cost: 2,
				prompt: () => "令一名其他角色于手牌中只能使用锦囊牌直到其回合结束",
				filter: player => game.hasPlayer(target => target != player && !target.getStorage("mcpfangzhu_ban").includes("trick")),
				filterTarget: (card, player, target) => target != player && !target.getStorage("mcpfangzhu_ban").includes("trick"),
				async content(player, target) {
					target.addTempSkill("mcpfangzhu_ban", { player: "phaseEnd" });
					target.markAuto("mcpfangzhu_ban", ["trick"]);
					lib.skill.mcpfangzhu_ban.init(target, "mcpfangzhu_ban");
				},
				ai: {
					result: {
						target(player, target) {
							return -(target.countCards("hs") + 2) / 2;
						},
					},
				},
			},
			{
				cost: 3,
				prompt: () => "令一名其他角色于手牌中只能使用装备牌直到其回合结束",
				filter: player => game.hasPlayer(target => target != player && !target.getStorage("mcpfangzhu_ban").includes("equip")),
				filterTarget: (card, player, target) => target != player && !target.getStorage("mcpfangzhu_ban").includes("equip"),
				async content(player, target) {
					target.addTempSkill("mcpfangzhu_ban", { player: "phaseEnd" });
					target.markAuto("mcpfangzhu_ban", ["equip"]);
					lib.skill.mcpfangzhu_ban.init(target, "mcpfangzhu_ban");
				},
				ai: {
					result: {
						target(player, target) {
							return -target.countCards("hs") - 2;
						},
					},
				},
			},
			{
				cost: 2,
				prompt: () => "令一名其他角色的非Charlotte技能失效直到其回合结束",
				filter: player => game.hasPlayer(target => target != player),
				filterTarget: lib.filter.notMe,
				async content(player, target) {
					target.addTempSkill("mcpfangzhu_ban", { player: "phaseEnd" });
				},
				ai: {
					result: {
						target(player, target) {
							return -target.getSkills(null, false).filter(i => get.info(i) && !get.info(i).charlotte).length * get.threaten(target, player);
						},
					},
				},
			},
			{
				cost: 2,
				prompt: () => "令一名其他角色不能响应除其外的角色使用的牌直到其回合结束",
				filter: player => game.hasPlayer(target => target != player && !target.hasSkill("mcpfangzhu_kill")),
				filterTarget: lib.filter.notMe,
				async content(player, target) {
					target.addTempSkill("mcpfangzhu_kill", { player: "phaseEnd" });
				},
				ai: {
					result: {
						target(player, target) {
							return -(target.countCards("hs") + 2) / target.hp;
						},
					},
				},
			},
			{
				cost: 3,
				prompt: () => "令一名其他角色将武将牌翻面",
				filter: player => game.hasPlayer(target => target != player),
				filterTarget: lib.filter.notMe,
				async content(player, target) {
					await target.turnOver();
				},
				ai: {
					result: {
						target(player, target) {
							return target.isTurnedOver() ? 3.5 : -3.5;
						},
					},
				},
			},
		],
		audio: ["ext:奥特之星/assets/misc/audio/skill/fangzhu1", "ext:奥特之星/assets/misc/audio/skill/fangzhu2"],
		enable: "phaseUse",
		filter(event, player) {
			return get.info("mcpfangzhu").getList.some(effect => {
				return player.countMark("mcpxingshang") >= effect.cost && effect.filter(player);
			});
		},
		usable: 1,
		chooseButton: {
			dialog() {
				let dialog = ui.create.dialog("放逐：请选择一项", "hidden");
				const list = get.info("mcpfangzhu").getList.slice();
				dialog.add([
					list.map(effect => {
						return [effect, "移去" + effect.cost + "个“颂”标记，" + effect.prompt()];
					}),
					"textbutton",
				]);
				return dialog;
			},
			filter(button, player) {
				const effect = button.link;
				return player.countMark("mcpxingshang") >= effect.cost && effect.filter(player);
			},
			check(button) {
				const player = get.event().player,
					effect = button.link;
				return Math.max(
					...game
						.filterPlayer(target => {
							const filterTarget = effect.filterTarget;
							if (!filterTarget) {
								return target == player;
							}
							if (typeof filterTarget == "function") {
								return filterTarget(null, player, target);
							}
							return true;
						})
						.map(target => {
							game.broadcastAll(effect => (lib.skill["mcpxingshang_aiSkill"].ai = effect.ai), effect);
							return get.effect(target, "mcpxingshang_aiSkill", player, player);
						})
				);
			},
			backup(links, player) {
				const effect = links[0];
				return {
					effect: effect,
					audio: ["ext:奥特之星/assets/misc/audio/skill/fangzhu1", "ext:奥特之星/assets/misc/audio/skill/fangzhu2"],
					audioname: ["mb_caomao"],
					filterCard: () => false,
					selectCard: -1,
					filterTarget: effect.filterTarget,
					async content(event, trigger, player) {
						const target = event.targets[0],
							effect = lib.skill.mcpfangzhu_backup.effect;
						player.removeMark("mcpxingshang", effect.cost);
						await effect.content(player, target);
					},
					ai: effect.ai,
				};
			},
			prompt(links, player) {
				const effect = links[0],
					str = "###放逐###";
				return str + '<div class="text center">' + "移去" + effect.cost + "个“颂”标记，" + effect.prompt() + "</div>";
			},
		},
		ai: {
			combo: "mcpxingshang",
			order: 7,
			result: {
				player(player) {
					const list = get.info("mcpfangzhu").getList.filter(effect => {
						return player.countMark("mcpxingshang") >= effect.cost && effect.filter(player);
					});
					return Math.max(
						...list.map(effect => {
							return Math.max(
								...game
									.filterPlayer(target => {
										const filterTarget = effect.filterTarget;
										if (!filterTarget) {
											return target == player;
										}
										if (typeof filterTarget == "function") {
											return filterTarget(null, player, target);
										}
										return true;
									})
									.map(target => {
										game.broadcastAll(effect => (lib.skill["mcpxingshang_aiSkill"].ai = effect.ai), effect);
										return get.effect(target, "mcpxingshang_aiSkill", player, player);
									})
							);
						})
					);
				},
			},
		},
		subSkill: {
			backup: {},
			baiban: {
				init(player, skill) {
					player.addSkillBlocker(skill);
					player.addTip(skill, "放逐 技能失效");
				},
				onremove(player, skill) {
					player.removeSkillBlocker(skill);
					player.removeTip(skill);
				},
				inherit: "baiban",
				marktext: "逐",
			},
			kill: {
				charlotte: true,
				mark: true,
				marktext: "禁",
				intro: { content: "不能响应其他角色使用的牌" },
				trigger: { global: "useCard1" },
				filter(event, player) {
					return event.player != player;
				},
				forced: true,
				popup: false,
				async content(event, trigger, player) {
					trigger.directHit.add(player);
				},
				init(player, skill) {
					player.addTip(skill, "放逐 无法响应");
				},
				onremove(player, skill) {
					player.removeTip(skill);
				},
			},
			ban: {
				charlotte: true,
				mark: true,
				marktext: "禁",
				intro: {
					markcount: () => 0,
					content(storage) {
						if (storage.length > 1) {
							return "不能使用手牌";
						}
						return "于手牌中只能使用" + get.translation(storage[0]) + "牌";
					},
				},
				init(player, skill) {
					let storage = player.getStorage(skill);
					if (storage.length) {
						player.addTip(skill, "放逐 限" + (storage.length === 1 ? get.translation(storage[0])[0] : "手牌"));
					}
				},
				onremove(player, skill) {
					player.removeTip(skill);
					delete player.storage[skill];
				},
				mod: {
					cardEnabled(card, player) {
						const storage = player.getStorage("mcpfangzhu_ban");
						const hs = player.getCards("h"),
							cards = [card];
						if (Array.isArray(card.cards)) {
							cards.addArray(card.cards);
						}
						if (cards.containsSome(...hs) && (storage.length > 1 || !storage.includes(get.type2(card)))) {
							return false;
						}
					},
					cardSavable(card, player) {
						return lib.skill.mcpfangzhu_ban.mod.cardEnabled(card, player);
					},
				},
			},
		},
	},
	mcpsongwei: {
		audio: ["ext:奥特之星/assets/misc/audio/skill/songwei1", "ext:奥特之星/assets/misc/audio/skill/songwei2"],
		trigger: { player: "phaseUseBegin" },
		filter(event, player) {
			if (player.countMark("mcpxingshang") >= get.info("mcpxingshang").getLimit) {
				return false;
			}
			return game.hasPlayer(target => target.group == "wei" && target != player);
		},
		zhuSkill: true,
		forced: true,
		locked: false,
		async content(event, trigger, player) {
			player.addMark("mcpxingshang", Math.min(get.info("mcpxingshang").getLimit - player.countMark("mcpxingshang"), 2 * game.countPlayer(target => target.group == "wei" && target != player)));
		},
		group: "mcpsongwei_delete",
		subSkill: {
			delete: {
				audio: ["ext:奥特之星/assets/misc/audio/skill/songwei1", "ext:奥特之星/assets/misc/audio/skill/songwei2"],
				enable: "phaseUse",
				filter(event, player) {
					if (player.getStorage("mcpsongwei_delete", false)) {
						return false;
					}
					return game.hasPlayer(target => lib.skill.mcpsongwei.subSkill.delete.filterTarget(null, player, target));
				},
				filterTarget(card, player, target) {
					return target != player && target.group == "wei" && target.getStockSkills(false, true).length;
				},
				skillAnimation: true,
				animationColor: "thunder",
				async content(event, trigger, player) {
					player.setStorage("mcpsongwei_delete", true);
					player.awakenSkill(event.name);
					await event.target.removeSkills(event.target.getStockSkills(false, true));
				},
				ai: {
					order: 13,
					result: {
						target(player, target) {
							return -target.getStockSkills(false, true).length;
						},
					},
				},
			},
		},
	},
	slyanxi: {
		enable: "phaseUse",
		usable: 4,
		filter(event, player) {
			if (player.name !== "死龙") return false;
			if (!game.players.includes(player)) return false;
			return true;
		},
		filterTarget(card, player, target) {
			if (target === player) return false;
			const xiadie = player._trueMe ?? game.players.find(p => p.hasSkill("xdanchao"));
			if (xiadie && target === xiadie) return false;
			return true;
		},
		selectTarget: [1, Infinity],
		allowChooseAll: true,
		multitarget: true,
		async content(event, trigger, player) {
			const x = game.players.filter(p => !p.isDead()).length;
			await player.loseHp(5 + x);
			for (const t of event.targets) {
				if (t.isAlive()) {
					await t.damage(1, player);
				}
			}
		},
		ai: {
			order: 11,
			result: {
				player(player) {
					const xiadie = player._trueMe ?? game.players.find(p => p.hasSkill("xdanchao"));
					if (!xiadie) return -10;
					const enemies = game.players.filter(p => {
						if (p === player) return false;
						if (xiadie && p === xiadie) return false;
						if (get.attitude(xiadie, p) > 0) return false;
						return true;
					});
					if (enemies.length === 0) return -10;
					const x = game.players.filter(p => !p.isDead()).length;
					if (player.getHp() <= 5 + x) return 1;
					return enemies.length * 2;
				},
				target(player, target) {
					if (target === player) return 0;
					const xiadie = player._trueMe ?? game.players.find(p => p.hasSkill("xdanchao"));
					if (xiadie && target === xiadie) return 0;
					if (!xiadie) return 0;
					if (get.attitude(xiadie, target) > 0) return 0;
					return -1;
				},
			},
		},
	},
	slyinbi: {
		trigger: { global: "damageBegin4" },
		filter(event, player) {
			if (player.name !== "死龙") return false;
			if (!game.players.includes(player)) return false;
			if (!event.player) return false;
			if (event.player === player) return false;
			if (event.player.name === "死龙") return false;
			if (event.player.hp - event.num > 0) return false;
			return true;
		},
		prompt(event, player) {
			return `是否对 ${get.translation(event.player)} 发动【荫蔽】？`;
		},
		check(event, player) {
			const xiadie = player._trueMe ?? game.players.find(p => p.hasSkill("xdanchao"));
			if (!xiadie) return false;
			if (event.player === xiadie) return true;
			const xiadieIdentity = xiadie.identity;
			const targetIdentity = event.player.identity;
			if (xiadieIdentity === "fan") {
				if (targetIdentity !== "fan") return false;
			} else if (xiadieIdentity === "zhu" || xiadieIdentity === "zhong") {
				if (targetIdentity !== "zhu" && targetIdentity !== "zhong") return false;
			} else if (xiadieIdentity === "nei") {
				if (get.attitude(xiadie, event.player) <= 0) return false;
			}
			const reduceDamage = Math.max(0, event.num - Math.max(0, event.player.hp - 1));
			const damageX = 5 * reduceDamage;
			if (player.getHp() <= damageX) return false;
			return true;
		},
		async content(event, trigger, player) {
			const reduceDamage = Math.max(0, trigger.num - Math.max(0, trigger.player.hp - 1));
			trigger.num -= reduceDamage;
			game.log(player, "发动了【荫蔽】，令", trigger.player, `受到的伤害减少${reduceDamage}点`);
			const damageX = 5 * reduceDamage;
			if (trigger.source?.isAlive()) {
				await player.damage(damageX, trigger.source);
				game.log(player, "受到了来自", trigger.source, `的${damageX}点伤害`);
			} else {
				await player.damage(damageX);
				game.log(player, `受到了${damageX}点伤害`);
			}
		},
		ai: {
			effect: {
				target_use(card, player, target, current, isLink) {
					if (target.name === "死龙" && target.hp - current <= 0) {
						const xiadie = target._trueMe ?? game.players.find(p => p.hasSkill("xdanchao"));
						if (xiadie && get.attitude(xiadie, player) > 0) {
							return [0.5, 1];
						}
					}
				},
			},
		},
	},
	slhuiyi: {
		trigger: { player: ["dieBefore", "rest"] },
		filter(event, player, name) {
			if (player.name !== "死龙") return false;
			if (name !== "rest" && !game.players.includes(player)) return false;
			if (player.classList.contains("out")) return false;
			if (name === "rest") return true;
			return player.maxHp > 0;
		},
		forced: true,
		forceDie: true,
		forceOut: true,
		priority: 15,
		group: ["slhuiyi_phase", "slhuiyi_return", "slhuiyi_xiadieDie"],
		async content(event, trigger, player) {
			if (event.triggername === "rest") {
				game.broadcastAll(p => {
					p.classList.add("out");
				}, player);
				return;
			}
			trigger.cancel();
			player.logSkill("slhuiyi");
			const allCards = player.getCards("hej");
			if (allCards.length > 0) {
				await player.discard(allCards);
				game.log(player, "弃置了区域内所有的牌");
			}
			player.setStorage("sl_phaseCount", 0);
			player.storage.sl_resting = true;
			const turnCount = player.getStorage("sl_turnCount", 0) + 1;
			player.setStorage("sl_turnCount", turnCount);
			game.log(player, `进入了休整状态（第${turnCount}次），回合数已清零`);
			game.broadcastAll(p => {
				p.classList.add("out");
			}, player);
		},
		subSkill: {
			phase: {
				trigger: { player: "phaseAfter" },
				forced: true,
				forceDie: true,
				filter(event, player) {
					if (player.name !== "死龙") return false;
					if (!game.players.includes(player)) return false;
					return !player.storage.sl_resting;
				},
				async content(event, trigger, player) {
					const phaseCount = player.getStorage("sl_phaseCount", 0) + 1;
					player.setStorage("sl_phaseCount", phaseCount);
					game.log(player, `已执行${phaseCount}个回合`);
					if (phaseCount >= 3) {
						player.setStorage("sl_phaseCount", 0);
						player.setStorage("sl_turnCount", 0);
						player.storage.sl_resting = false;
						game.log(player, "已存在场上三个回合，即将死亡");
						await player.die();
					}
				},
			},
			return: {
				trigger: { player: "restEnd" },
				forced: true,
				locked: true,
				charlotte: true,
				silent: true,
				forceDie: true,
				forceOut: true,
				filter(event, player) {
					if (player.name !== "死龙") return false;
					if (!game.players.includes(player)) return false;
					return event.player === player;
				},
				async content(event, trigger, player) {
					game.broadcastAll(p => {
						p.classList.remove("out");
					}, player);
					await player.recover(player.maxHp - player.getHp());
					player.storage.sl_resting = false;
					game.log(player, "结束了休整状态，回复至满体力");
				},
			},
			xiadieDie: {
				trigger: { global: "dieAfter" },
				forced: true,
				forceDie: true,
				forceOut: true,
				filter(event, player) {
					if (player.name !== "死龙") return false;
					if (!game.players.includes(player)) return false;
					if (!player.isAlive()) return false;
					const xiadie = player._trueMe ?? game.players.find(p => p.hasSkill("xdanchao")) ?? game.dead.find(p => p.hasSkill("xdanchao"));
					if (!xiadie) return false;
					return event.player === xiadie;
				},
				async content(event, trigger, player) {
					if (player.storage.sl_resting) {
						game.broadcastAll(p => {
							p.classList.remove("out");
						}, player);
						player.setStorage("sl_phaseCount", 0);
						player.setStorage("sl_turnCount", 0);
						player.storage.sl_resting = false;
						game.log(player, "因遐蝶死亡而退出休整状态并移出游戏");
					} else {
						game.log(player, "因遐蝶死亡而移出游戏");
					}
					await player.removeSkills("slyanxi", "slyinbi", "slhuiyi", "slcontrol");
					const index = game.players.indexOf(player);
					if (index !== -1) {
						game.players.splice(index, 1);
					}
					const deadIndex = game.dead.indexOf(player);
					if (deadIndex !== -1) {
						game.dead.splice(deadIndex, 1);
					}
					player.remove();
					const friendSide = player.side;
					const friendliesAlive = game.players.filter(p => p.side === friendSide && !p.isDead());
					const enemiesAlive = game.players.filter(p => p.side !== friendSide && !p.isDead());
					if (friendliesAlive.length === 0) {
						game.over(false);
					} else if (enemiesAlive.length === 0) {
						game.over(true);
					}
				},
			},
		},
	},
	slcontrol: {
		trigger: { player: ["phaseAfter", "dieAfter"] },
		lastDo: true,
		charlotte: true,
		forceDie: true,
		forced: true,
		silent: true,
		filter(event, player) {
			return player.name === "死龙";
		},
		async content(event, trigger, player) {
			await player.removeSkills("slcontrol");
		},
		onremove(player) {
			if (player === game.me && player._trueMe) {
				game.swapPlayerAuto(player._trueMe);
				if (_status.auto) {
					ui.click.auto();
				}
			}
		},
	},
	yaoyaoyi: {
		audio: 2,
		init(player, skill) {
			game.broadcastAll(
				(player, skill) => {
					const observer = new MutationObserver(mutationsList => {
						for (const mutation of mutationsList) {
							if (mutation.type === "childList") {
								const cards = player._start_cards ?? [];
								if (player.node.handcards1.cardMod[skill] && !_status.gameDrawed) {
									for (const card of mutation.addedNodes) {
										if (cards.includes(card)) {
											game.broadcastAll(
												(card, player, skill) => {
													card.addGaintag(`${skill}_tag`);
													game.addVideo("addGaintag", player, [[get.cardInfo(card)], `${skill}_tag`]);
													card.classList.add(skill);
													game.addVideo("skill", player, [skill, [true, [get.cardInfo(card)]]]);
												},
												card,
												player,
												skill
											);
										}
									}
								}
								for (const card of mutation.removedNodes) {
									if (cards.includes(card) && !card.hasGaintag(`${skill}_tag`)) {
										game.broadcastAll(
											(card, player, skill) => {
												card.classList.remove(skill);
												game.addVideo("skill", player, [skill, [false, [get.cardInfo(card)]]]);
											},
											card,
											player,
											skill
										);
									}
								}
							}
						}
					});
					const config = { childList: true };
					observer.observe(player.node.handcards1, config);
					observer.observe(player.node.handcards2, config);
					player.node.handcards1.cardMod ??= {};
					player.node.handcards2.cardMod ??= {};
					const cardMod = card => {
						if (card.classList.contains(skill)) {
							return ["爻疑", "此牌对你不可见"];
						}
					};
					player.node.handcards1.cardMod[skill] = cardMod;
					player.node.handcards2.cardMod[skill] = cardMod;
					player.node.handcards1.classList.add(skill);
					player.node.handcards2.classList.add(skill);
					if (_status.gameDrawed) {
						const cards = player._start_cards ?? [];
						player.getCards("h").forEach(card => {
							if (cards.includes(card)) {
								game.broadcastAll(
									(card, player, skill) => {
										card.addGaintag(`${skill}_tag`);
										game.addVideo("addGaintag", player, [[get.cardInfo(card)], `${skill}_tag`]);
										card.classList.add(skill);
										game.addVideo("skill", player, [skill, [true, [get.cardInfo(card)]]]);
									},
									card,
									player,
									skill
								);
							}
						});
					}
					const { card, blank, ...others } = ui.create.buttonPresets;
					ui.create.buttonPresets = {
						...others,
						card(item, ...args) {
							if (item.classList.contains(skill) && args[args.length - 1] !== skill) {
								return blank(item, ...args, skill);
							}
							return card(item, ...args);
						},
						blank(item, ...args) {
							if (item.classList.contains(skill) && args[args.length - 1] !== skill) {
								return card(item, ...args, skill);
							}
							return blank(item, ...args);
						},
					};
				},
				player,
				skill
			);
		},
		onremove(player, skill) {
			player.removeGaintag(`${skill}_tag`);
			game.broadcastAll(
				(player, skill) => {
					player.node.handcards1.classList.remove(skill);
					player.node.handcards2.classList.remove(skill);
					delete player.node.handcards1.cardMod[skill];
					delete player.node.handcards2.cardMod[skill];
					player.getCards("h").forEach(card => {
						if (card.classList.contains(skill)) {
							card.classList.remove(skill);
							game.addVideo("skill", player, [skill, [false, [get.cardInfo(card)]]]);
						}
					});
				},
				player,
				skill
			);
		},
		video(player, info) {
			for (const cardid of info[1]) {
				for (const card of player.getCards("h")) {
					if (card.cardid === cardid[4]) {
						card.classList[info[0] ? "add" : "remove"]("yaoyaoyi");
					}
				}
			}
		},
		enable: "chooseToUse",
		filter(event, player) {
			return get
				.inpileVCardList(info => lib.skill.yaoyaoyi.hiddenCard(player, info[2]))
				.some(info => {
					const card = { name: info[2], nature: info[3] };
					return player.hasCard(cardx => cardx.classList.contains("yaoyaoyi") && event.filterCard({ ...card, cards: [cardx] }, player, event), "h");
				});
		},
		chooseButton: {
			dialog(event, player) {
				const list = get
					.inpileVCardList(info => lib.skill.yaoyaoyi.hiddenCard(player, info[2]))
					.filter(info => {
						const card = { name: info[2], nature: info[3] };
						return player.hasCard(cardx => cardx.classList.contains("yaoyaoyi") && event.filterCard({ ...card, cards: [cardx] }, player, event), "h");
					});
				return ui.create.dialog("爻疑", [list, "vcard"]);
			},
			filter(button, player) {
				const event = get.event().getParent(),
					info = button.link,
					card = { name: info[2], nature: info[3] };
				return player.hasCard(cardx => cardx.classList.contains("yaoyaoyi") && event.filterCard({ ...card, cards: [cardx] }, player, event), "h");
			},
			check(button) {
				const event = get.event().getParent();
				if (event.type !== "phase") {
					return 1;
				}
				return get.player().getUseValue({ name: button.link[2], nature: button.link[3] });
			},
			prompt(links) {
				const event = get.event().getParent();
				return "将一张背置牌当作" + (get.translation(links[0][3]) || "") + "【" + get.translation(links[0][2]) + "】" + (event.name === "chooseToRespond" ? "打出" : "使用");
			},
			backup(links, player) {
				return {
					audio: "yaoyaoyi",
					filterCard(card) {
						return get.itemtype(card) == "card" && card.classList.contains("yaoyaoyi");
					},
					popname: true,
					check(card) {
						return 1 + Math.random();
					},
					position: "hse",
					viewAs: { name: links[0][2], nature: links[0][3] },
					async precontent(event, trigger, player) {
						player.addTempSkill("yaoyaoyi_used");
						player.markAuto("yaoyaoyi_used", [event.result.card?.name]);
					},
				};
			},
		},
		hiddenCard(player, name) {
			if (!lib.inpile.includes(name) || player.getStorage("yaoyaoyi_used").includes(name)) {
				return false;
			}
			return ["basic", "trick"].includes(get.type(name)) && player.hasCard(card => _status.connectMode || card.classList.contains("yaoyaoyi"), "h");
		},
		locked: false,
		mod: {
			cardEnabled(card, player) {
				if (!card || get.is.convertedCard(card)) {
					return;
				}
				if (card?.cards?.some(cardx => cardx.classList.contains("yaoyaoyi"))) {
					return false;
				}
			},
			cardRespondable(card, player) {
				return get.info("yaoyaoyi").mod.cardEnabled.apply(this, arguments);
			},
			cardSavable(card, player) {
				return get.info("yaoyaoyi").mod.cardEnabled.apply(this, arguments);
			},
		},
		ai: {
			respondSha: true,
			respondShan: true,
			skillTagFilter(player) {
				if (!player.hasCard(card => _status.connectMode || card.classList.contains("yaoyaoyi"), "h")) {
					return false;
				}
			},
			order(item, player) {
				if (player && _status.event.type == "phase") {
					const list = get.inpileVCardList(info => lib.skill.yaoyaoyi.hiddenCard(player, info[2]));
					let max = 0;
					list.forEach(info => {
						const card = { name: info[2], nature: info[3] };
						if (player.getUseValue(card) > 0) {
							const temp = get.order(card);
							if (temp > max) {
								max = temp;
							}
						}
					});
					if (max > 0) {
						max += 1;
					}
					return max;
				}
				return 1;
			},
			result: {
				player(player) {
					return get.event().dying ? get.attitude(player, get.event().dying) : 1;
				},
			},
		},
		subSkill: {
			backup: {},
			tag: {},
			used: {
				charlotte: true,
				onremove: true,
			},
		},
	},
	yaochenwei: {
		audio: 2,
		trigger: { player: "useCard" },
		filter(event, player) {
			const storage = player.storage.yaochenwei;
			if (!storage) {
				if (
					!player.hasHistory("lose", evt => {
						if (evt.getParent() !== event) return false;
						return Object.values(evt.gaintag_map).flat().includes("yaoyaoyi_tag");
					})
				) {
					return false;
				}
				return player.countCards("h") > 0;
			}
			const usedBackCard = player.hasHistory("lose", evt => {
				if (evt.getParent() !== event) return false;
				return Object.values(evt.gaintag_map).flat().includes("yaoyaoyi_tag");
			});
			if (usedBackCard) return false;
			return game.hasPlayer(target => target !== player && target.countGainableCards(player, "he"));
		},
		async cost(event, trigger, player) {
			const storage = player.storage[event.skill];
			const next = player.chooseTarget(get.prompt(event.skill));
			if (storage) {
				next.prompt2 = "获得一名其他角色的一张牌并将此牌背置";
				next.filterTarget = function (card, player, target) {
					return target !== player && target.countGainableCards(player, "he");
				};
				next.ai = function (target) {
					const player = get.player();
					return get.effect(target, { name: "shunshou_copy2" }, player, player);
				};
			} else {
				next.prompt2 = "令一名角色将你的一张手牌翻面";
				next.ai = function (target) {
					const player = get.player();
					return 1 + Math.sign(get.attitude(player, target)) + Math.random();
				};
			}
			event.result = await next.forResult();
		},
		async content(event, trigger, player) {
			const storage = player.storage[event.name],
				target = event.targets[0];
			player.changeZhuanhuanji(event.name);
			if (storage) {
				const result = await player.gainPlayerCard(target, "he", true).forResult();
				if (result?.bool && result.cards?.some(i => get.position(i) === "h" && get.owner(i) === player && !i.classList.contains("yaoyaoyi"))) {
					game.broadcastAll(
						cards => {
							for (const card of cards) {
								card.classList.add("yaoyaoyi");
								card.addGaintag("yaoyaoyi_tag");
							}
						},
						result.cards.filter(i => get.position(i) === "h" && get.owner(i) === player && !i.classList.contains("yaoyaoyi"))
					);
				}
			} else {
				const result = await target
					.choosePlayerCard(player, "h", true)
					.set("prompt2", `将${get.translation(player)}的一张手牌翻面`)
					.forResult();
				if (result?.bool && result.cards?.some(i => get.position(i) === "h" && get.owner(i) === player)) {
					game.broadcastAll(
						cards => {
							for (const card of cards) {
								if (card.hasGaintag("yaoyaoyi_tag")) {
									card.removeGaintag("yaoyaoyi_tag");
									game.addVideo("removeGaintag", player, ["yaoyaoyi_tag", [get.cardInfo(card)]]);
									card.classList.remove("yaoyaoyi");
									game.addVideo("skill", player, ["yaoyaoyi", [false, [get.cardInfo(card)]]]);
								} else {
									card.addGaintag("yaoyaoyi_tag");
									game.addVideo("addGaintag", player, [[get.cardsInfo(card)], "yaoyaoyi_tag"]);
									card.classList.add("yaoyaoyi");
									game.addVideo("skill", player, ["yaoyaoyi", [true, [get.cardInfo(card)]]]);
								}
							}
						},
						result.cards.filter(i => get.position(i) === "h" && get.owner(i) === player)
					);
				}
			}
		},
		zhuanhuanji: true,
		marktext: "☯",
		mark: true,
		intro: {
			content(storage, player) {
				return storage ? "阴：当你使用一张非背置牌时，你可以获得一名其他角色的一张牌并将此牌背置" : "阳：当你使用一张背置牌时，你可以令一名角色将你的一张手牌翻面";
			},
		},
		ai: {
			combo: "yaoyaoyi",
		},
	},
	wsgucheng: {
		audio: ["ext:奥特之星/assets/misc/audio/skill/gucheng.mp3"],
		trigger: {
			player: ["recoverBefore", "gainBefore"],
		},
		forced: true,
		firstDo: true,
		filter(event, player) {
			if (event.name === "recover" || event.name === "gain") {
				return event.source && event.source !== player;
			}
		},
		async content(event, trigger) {
			trigger.cancel();
			game.log(trigger.player, "的", "#g【孤承】", "生效，取消了", trigger.name);
		},
		ai: {
			effect: {
				target(card, player, target) {
					if (target.hasSkill("wsgucheng")) {
						if (get.tag(card, "recover")) return "zeroplayertarget";
						if (get.tag(card, "gain")) return "zeroplayertarget";
					}
				},
			},
		},
	},
	wsgeshi: {
		audio: ["ext:奥特之星/assets/misc/audio/skill/geshi.mp3"],
		forced: true,
		trigger: {
			global: "phaseEnd",
		},
		filter(event, player) {
			return (!player.hasHistory("damage"));
		},
		async content(event, trigger, player) {
			player.addMark("wsgeshi", 1);
		},
		group: ["wsgeshi_turn"],
		subSkill: {
			turn: {
				trigger: { player: "phaseBegin" },
				forced: true,
				filter(event, player) {
					return player.countMark("wsgeshi") > 0;
				},
				async content(event, trigger, player) {
					const count = player.countMark("wsgeshi");
					player.removeMark("wsgeshi", count);
					game.playSkillBgm("ws");
					await player.recover(count);
					const result = await player
						.chooseTarget(`隔世：选择一名其他角色造成${count}点伤害`, true, (card, player, target) => player !== target)
						.set("ai", target => (get.attitude(player, target) < 0 ? 1 : 0))
						.forResult();
					if (result.bool && result.targets?.length) {
						await result.targets[0].damage(count, "nosource", player);
					}
					await player.draw(count);
				},
			},
		},
		mark: true,
		marktext: "世",
		intro: {
			name: "世",
			content: "mark",
		},
	},
};
