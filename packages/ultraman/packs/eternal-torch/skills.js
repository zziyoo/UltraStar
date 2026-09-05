import { lib, game, ui, get, ai, _status } from "../../../../../../noname.js";

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
				audio: ["ext:奥特之星/assets/audio/djsj0.mp3"],
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
	xklkeyan: {
		audio: ["ext:奥特之星/assets/audio/keyan.mp3"],
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
	jkshouzhuo: {
		audio: ["ext:奥特之星/assets/audio/shouzhuo"],
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
		audio: ["ext:奥特之星/assets/audio/guanglun"],
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
							audio: "ext:奥特之星/assets/audio/guanglun",
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
				audio: ["ext:奥特之星/assets/audio/dnsj"],
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
		audio: ["ext:奥特之星/assets/audio/yakong"],
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
		audio: ["ext:奥特之星/assets/audio/zhadan"],
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
		audio: ["ext:奥特之星/assets/audio/duantou"],
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
		audio: ["ext:奥特之星/assets/audio/bingfu"],
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
		audio: ["ext:奥特之星/assets/audio/feiti"],
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
