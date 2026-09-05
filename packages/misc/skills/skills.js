import { lib, game, ui, get, ai, _status } from "../../../../../noname.js";

export const skills = {
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
					audio: ["ext:奥特之星/assets/xingshang1", "ext:奥特之星/assets/xingshang2"],
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
				audio: ["ext:奥特之星/assets/xingshang1", "ext:奥特之星/assets/xingshang2"],
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
		audio: ["ext:奥特之星/assets/fangzhu1", "ext:奥特之星/assets/fangzhu2"],
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
					audio: ["ext:奥特之星/assets/fangzhu1", "ext:奥特之星/assets/fangzhu2"],
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
		audio: ["ext:奥特之星/assets/songwei1", "ext:奥特之星/assets/songwei2"],
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
				audio: ["ext:奥特之星/assets/songwei1", "ext:奥特之星/assets/songwei2"],
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
		audio: ["ext:奥特之星/assets/gucheng.mp3"],
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
		audio: ["ext:奥特之星/assets/geshi.mp3"],
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
