import { lib, game, ui, get, ai, _status } from "../../../../../noname.js";

export const skills = {
	lyshishang: {
		audio: ["ext:奥特之星/assets/shishang"],
		trigger: { player: "phaseEnd" },
		forced: true,
		async content(event, trigger, player) {
			if (player.hp === player.maxHp) {
				await player.loseHp(1);
			} else {
				await player.loseMaxHp(1);
			}
		},
	},
	lyranjin: {
		audio: ["ext:奥特之星/assets/ranjin1", "ext:奥特之星/assets/ranjin2", "ext:奥特之星/assets/ranjin3"],
		zhuanhuanji: true,
		direct: true,
		locked: false,
		mark: true,
		marktext: "☯",
		intro: {
			content(storage, player) {
				return (storage ? "阴：你可以将X张牌当作无距离和次数限制的火【杀】使用，若此【杀】造成了伤害，你回复X点体力" : "阳：你可以失去X点体力（X为体力上限的一半，向下取整，且至多失去体力值至1），然后对一名其他角色造成1点火焰伤害") + "。当你造成火焰伤害后，此技能视为未发动过。";
			},
		},
		enable: "phaseUse",
		usable: 1,
		filter(event, player) {
			const isYin = player.storage.lyranjin;
			if (isYin) {
				const x = Math.max(1, Math.floor(player.maxHp / 2));
				return player.countCards("he") >= x;
			}
			return player.getHp() >= 1;
		},
		async content(event, trigger, player) {
			const isYin = player.storage.lyranjin;
			if (!isYin) {
				const x = Math.min(player.hp - 1, Math.floor(player.maxHp / 2));
				const targetResult = await player
					.chooseTarget({
						filterTarget(card, player, target) {
							return target !== player;
						},
						selectTarget: 1,
						prompt: `【燃烬】失去${Math.max(0, x)}点体力，对一名其他角色造成1点火焰伤害`,
						ai(target) {
							return get.damageEffect(target, player, player, "fire");
						},
					})
					.forResult();
				if (!targetResult?.bool || !targetResult.targets?.length) {
					delete player.getStat("skill").lyranjin;
					return;
				}
				const target = targetResult.targets[0];
				player.logSkill("lyranjin", target);
				let loseHp = x;
				if (player.getHp() - loseHp < 1) loseHp = player.getHp() - 1;
				if (loseHp > 0) {
					await player.loseHp(loseHp);
				}
				await target.damage(1, "fire", player);
				player.changeZhuanhuanji("lyranjin");
			} else {
				const x = Math.max(1, Math.floor(player.maxHp / 2));
				player.addTempSkill("lyranjin_check_damage", "phaseUseAfter");
				player.setStorage("lyranjin_usedCards", x);
				player.setStorage("lyranjin_yin_using", true);
				const result = await player
					.chooseToUse()
					.set("openskilldialog", `###燃烬###将${x}张牌当作无距离和次数限制的火【杀】使用`)
					.set("norestore", true)
					.set("_backupevent", "lyranjin_backup")
					.set("custom", { add: {}, replace: { window() {} } })
					.backup("lyranjin_backup")
					.set("addCount", true)
					.forResult();
				player.setStorage("lyranjin_yin_using", false);
				if (result.bool) {
					player.changeZhuanhuanji("lyranjin");
				} else {
					player.setStorage("lyranjin_usedCards", 0);
					delete player.getStat("skill").lyranjin;
				}
			}
		},
		group: ["lyranjin_check", "lyranjin_reset"],
		mod: {
			targetInRange(card, player, target) {
				if (player.getStorage("lyranjin_yin_using", false)) {
					if (card.name === "sha" && card.nature === "fire") return true;
				}
			},
			cardUsable(card, player) {
				if (player.getStorage("lyranjin_yin_using", false)) {
					if (card.name === "sha" && card.nature === "fire") return Infinity;
				}
			},
		},
		subSkill: {
			backup: {
				selectCard() {
					const player = get.player();
					return Math.max(1, Math.floor(player.maxHp / 2));
				},
				filterCard(card) {
					return get.itemtype(card) === "card";
				},
				position: "he",
				ignoreMod: true,
				viewAs: { name: "sha", nature: "fire" },
				filterTarget(card, player, target) {
					return player !== target && lib.filter.targetEnabled({ name: "sha", nature: "fire" }, player, target);
				},
				selectTarget: 1,
				ai1(card) {
					return 8 - get.value(card);
				},
				ai2(target) {
					const player = get.player();
					return get.damageEffect(target, player, player, "fire");
				},
			},
			check_damage: {
				trigger: { player: "useCardAfter" },
				filter(event, player) {
					return event.card.name === "sha" && event.card.nature === "fire" && player.getStorage("lyranjin_usedCards", 0) > 0;
				},
				charlotte: true,
				silent: true,
				async content(event, trigger, player) {
					const x = player.getStorage("lyranjin_usedCards", 0);
					player.setStorage("lyranjin_usedCards", 0);
					let causedDamage = false;
					for (const target of trigger.targets) {
						const damageHistory = target.getHistory("damage", evt => evt.card === trigger.card);
						if (damageHistory && damageHistory.length > 0) {
							causedDamage = true;
							break;
						}
					}
					if (causedDamage) {
						await player.recover(x);
					}
				},
			},
			check: {
				trigger: { global: "damageEnd" },
				filter(event, player) {
					return event.nature === "fire" && event.source === player && player.getStat("skill").lyranjin;
				},
				charlotte: true,
				silent: true,
				firstDo: true,
				async content(event, trigger, player) {
					delete player.getStat("skill").lyranjin;
					game.log(player, "因造成火焰伤害，重置了", "#g【燃烬】");
				},
			},
			reset: {
				trigger: { player: "phaseUseAfter" },
				charlotte: true,
				silent: true,
				async content(event, trigger, player) {
					player.setStorage("lyranjin_usedCards", 0);
				},
			},
		},
		ai: {
			order: 13,
			result: {
				player(player) {
					const isYin = player.storage.lyranjin;
					if (!isYin) {
						if (player.getHp() <= 2) return 10;
						if (player.getHp() <= 3) return 7;
						return 5;
					} else {
						const x = Math.max(1, Math.floor(player.maxHp / 2));
						return 10 + x;
					}
				},
				target(player, target) {
					return -5;
				},
			},
		},
	},
	lyyuhuo: {
		audio: ["ext:奥特之星/assets/yvhuo"],
		trigger: { player: "useCard1" },
		filter(event, player) {
			return event.card.name === "sha" && event.targets?.length > 0;
		},
		prompt2(event, player) {
			const x = Math.min(Math.max(1, player.maxHp - player.getHp()), 5);
			return "你可以选择" + x + "项效果：①弃置目标的一张牌 ②摸一张牌 ③此【杀】无视防具 ④若其受到此【杀】伤害时没有手牌，此伤害+1 ⑤此【杀】造成伤害后，你回复1点体力";
		},
		ai: {
			threaten: 2,
			skillTagFilter(player, tag) {
				if (tag === "sha") return true;
			},
			result: {
				return: 13,
			},
		},
		async content(event, trigger, player) {
			const x = Math.min(Math.max(1, player.maxHp - player.getHp()), 5);
			const shaTargets = trigger.targets.slice(0);
			const result = await player
				.chooseButton([
					"浴火：选择" + x + "项效果",
					[
						[
							["弃牌", "弃置目标的一张牌"],
							["摸牌", "摸一张牌"],
							["无视", "此【杀】无视防具"],
							["增伤", "若目标没有手牌，此【杀】伤害+1"],
							["回血", "此【杀】造成伤害后回复1点体力"],
						],
						"textbutton",
					],
				])
				.set("selectButton", [1, x])
				.set("forced", true)
				.set("forcebutton", true)
				.set(
					"ai",
					(() => {
						const targets = trigger.targets;
						return button => {
							const choice = button.link[0];
							const p = get.player();
							const target = targets.length > 0 ? targets[0] : null;
							const targetHand = target ? target.countCards("h") : 999;
							switch (choice) {
								case "摸牌":
									return 10;
								case "弃牌":
									return 8;
								case "回血":
									return targetHand <= 1 ? 5 : 6;
								case "增伤":
									return targetHand <= 1 ? 7 : 4;
								case "无视":
									return 4;
							}
							return 1;
						};
					})()
				)
				.forResult();
			if (!result.bool || !result.links?.length) return;
			const choices = result.links;
			const hasDiscard = choices.includes("弃牌");
			const hasDraw = choices.includes("摸牌");
			const hasIgnore = choices.includes("无视");
			const hasAddDamage = choices.includes("增伤");
			const hasRecover = choices.includes("回血");
			if (hasIgnore) {
				for (const target of shaTargets) {
					target.addTempSkill("qinggang2");
					target.getStorage("qinggang2", []).add(trigger.card);
				}
			}
			if (hasAddDamage) {
				player.addTempSkill("lyyuhuo_adddamage");
				player.setStorage("lyyuhuo_shaTargets", shaTargets.slice(0));
				player.setStorage("lyyuhuo_triggerCard", trigger.card);
			}
			if (hasRecover) {
				player.addTempSkill("lyyuhuo_recover");
				player.setStorage("lyyuhuo_shaTargets_recover", shaTargets.slice(0));
			}
			if (hasDiscard) {
				const validTargets = shaTargets.filter(t => t.countCards("he") > 0);
				if (validTargets.length > 0) {
					const discardTargetResult = await player
						.chooseTarget(true, "弃置一名目标角色的一张牌", (card, p, target) => shaTargets.includes(target) && target.countCards("he") > 0)
						.set("forced", true)
						.set("ai", target => -get.attitude(player, target))
						.forResult();
					if (discardTargetResult.bool && discardTargetResult.targets?.length > 0) {
						await player.discardPlayerCard(discardTargetResult.targets[0], "he", true);
						game.log(player, "弃置了", get.translation(discardTargetResult.targets[0]), "的一张牌");
					}
				}
			}
			if (hasDraw) {
				await player.draw();
			}
		},
		subSkill: {
			adddamage: {
				charlotte: true,
				trigger: { global: "damageBegin1" },
				filter(event, player) {
					const shaTargets = player.getStorage("lyyuhuo_shaTargets", []);
					const triggerCard = player.getStorage("lyyuhuo_triggerCard", null);
					return shaTargets.length > 0 && triggerCard && event.source === player && event.card === triggerCard && shaTargets.includes(event.player) && event.player.countCards("h") === 0;
				},
				silent: true,
				async content(event, trigger, player) {
					trigger.num++;
					player.setStorage("lyyuhuo_shaTargets", []);
					player.setStorage("lyyuhuo_triggerCard", null);
				},
			},
			recover: {
				charlotte: true,
				trigger: { global: "damageEnd" },
				filter(event, player) {
					const shaTargets = player.getStorage("lyyuhuo_shaTargets_recover", []);
					return event.source === player && shaTargets.includes(event.player);
				},
				silent: true,
				async content(event, trigger, player) {
					await player.recover();
					player.setStorage("lyyuhuo_shaTargets_recover", []);
				},
			},
		},
	},
	dlhchizhuo: {
		audio: ["ext:奥特之星/assets/chizhuo1", "ext:奥特之星/assets/chizhuo2"],
		trigger: { global: "useCardToTargeted" },
		filter(event, player) {
			if (get.tag(event.card, "delay")) return false;
			if (!get.tag(event.card, "damage")) return false;
			const target = event.target;
			return target.countCards("hej") > 0;
		},
		direct: true,
		locked: false,
		clearStorage(player) {
			player.removeSkill("dlhchizhuo_adddamage");
			player.removeSkill("dlhchizhuo_back");
			player.removeSkill("dlhchizhuo_phase");
			player.removeSkill("dlhchizhuo_die");
			player.setStorage("dlhchizhuo_active", false);
			player.setStorage("dlhchizhuo_cards", undefined);
			player.setStorage("dlhchizhuo_source", undefined);
			player.setStorage("dlhchizhuo_cardId", undefined);
			player.setStorage("dlhchizhuo_phasePlayer", undefined);
		},
		async content(event, trigger, player) {
			const target = trigger.target;
			const shaCard = trigger.card;
			const choices = [];
			if (target.countCards("j") > 0) choices.push("判定区");
			if (target.countCards("e") > 0) choices.push("装备区");
			if (target.countCards("h") > 0) choices.push("手牌区");
			choices.push("cancel2");
			const controlResult = await player
				.chooseControl(choices)
				.set("prompt", get.prompt("dlhchizhuo", target))
				.set("target", target)
				.set("ai", () => {
					const t = _status.event.target;
					const p = _status.event.player;
					if (!t) return "cancel2";
					const att = get.attitude(p, t);
					if (att > 0) {
						if (t.countCards("j") > 0) return "判定区";
						return "cancel2";
					}
					if (t.countCards("h") > 0) return "手牌区";
					if (t.countCards("e") > 0) return "装备区";
					return "cancel2";
				})
				.forResult();
			if (!controlResult.control || controlResult.control === "cancel2") return;
			player.logSkill("dlhchizhuo", target);
			const area = controlResult.control;
			let cards;
			if (area === "判定区") cards = target.getCards("j").slice(0);
			else if (area === "装备区") cards = target.getCards("e").slice(0);
			else cards = target.getCards("h").slice(0);
			if (!cards?.length) return;
			for (const card of cards) card.classList.add("glory2");
			const next = target.addToExpansion("giveAuto", cards, target);
			next.gaintag.add("dlhchizhuo");
			await next;
			target.setStorage("dlhchizhuo_cards", cards.slice(0));
			target.setStorage("dlhchizhuo_source", player);
			target.setStorage("dlhchizhuo_cardId", shaCard.cardid);
			target.setStorage("dlhchizhuo_active", true);
			target.markSkill("dlhchizhuo");
			target.setStorage("dlhchizhuo_phasePlayer", _status.currentPhase || trigger.player);
			target.addSkill("dlhchizhuo_adddamage");
			target.addSkill("dlhchizhuo_back");
			target.addSkill("dlhchizhuo_phase");
			target.addSkill("dlhchizhuo_die");
		},
		marktext: "灼",
		intro: {
			name: "炽灼",
			markcount: "expansion",
			mark(dialog, storage, player) {
				const cards = player.getExpansions("dlhchizhuo");
				if (player.isUnderControl(true)) dialog.addAuto(cards);
				else return "共有" + cards.length + "张牌";
			},
		},
		ai: {
			expose: 0.3,
			threaten: 1.5,
		},
		subSkill: {
			adddamage: {
				trigger: { player: "damageBegin1" },
				charlotte: true,
				forced: true,
				filter(event, player) {
					if (!player.getStorage("dlhchizhuo_active", false)) return false;
					const cardId = player.getStorage("dlhchizhuo_cardId", null);
					return event.card?.cardid === cardId;
				},
				async content(event, trigger, player) {
					trigger.num++;
				},
			},
			back: {
				trigger: { player: "damageEnd" },
				charlotte: true,
				forced: true,
				filter(event, player) {
					if (!player.getStorage("dlhchizhuo_active", false)) return false;
					const cards = player.getExpansions("dlhchizhuo");
					if (!cards.length) return false;
					const source = player.getStorage("dlhchizhuo_source", null);
					if (!source?.isIn()) return false;
					const cardId = player.getStorage("dlhchizhuo_cardId", null);
					return event.card?.cardid === cardId;
				},
				async content(event, trigger, player) {
					const cards = player.getExpansions("dlhchizhuo");
					if (cards.length > 0) {
						await player.gain(cards, "draw");
					}
					lib.skill.dlhchizhuo.clearStorage(player);
				},
			},
			phase: {
				trigger: { global: "phaseEnd" },
				charlotte: true,
				forced: true,
				filter(event, player) {
					if (!player.getStorage("dlhchizhuo_active", false)) return false;
					const cards = player.getExpansions("dlhchizhuo");
					if (!cards.length) return false;
					const phasePlayer = player.getStorage("dlhchizhuo_phasePlayer", null);
					return event.player === phasePlayer;
				},
				async content(event, trigger, player) {
					const cards = player.getExpansions("dlhchizhuo");
					if (cards.length > 0) {
						await player.gain(cards, "draw");
					}
					lib.skill.dlhchizhuo.clearStorage(player);
				},
			},
			die: {
				trigger: { player: "dieBefore" },
				charlotte: true,
				forced: true,
				filter(event, player) {
					if (!player.getStorage("dlhchizhuo_active", false)) return false;
					const cards = player.getExpansions("dlhchizhuo");
					if (!cards.length) return false;
					const source = player.getStorage("dlhchizhuo_source", null);
					return source?.isIn();
				},
				async content(event, trigger, player) {
					const source = player.getStorage("dlhchizhuo_source", null);
					let cards = player.getExpansions("dlhchizhuo");
					lib.skill.dlhchizhuo.clearStorage(player);
					if (!cards.length || !source?.isIn()) return;
					const givenMap = {};
					while (cards.length > 0) {
						let result;
						if (cards.length > 1) {
							result = await source
								.chooseCardButton("炽灼：选择要分配的牌", true, cards, [1, cards.length])
								.set("ai", button => get.value(button.link, source))
								.forResult();
						} else {
							result = { bool: true, links: cards.slice(0) };
						}
						if (!result.bool) break;
						const toGive = result.links;
						result = await source
							.chooseTarget(`选择一名角色获得${get.translation(toGive)}`, true)
							.set("ai", t => {
								const att = get.attitude(source, t);
								if (att <= 0) return -1;
								return att + (t.countCards("h") < 2 ? 5 : 0);
							})
							.forResult();
						if (result.bool && result.targets.length) {
							cards.removeArray(toGive);
							const id = result.targets[0].playerid;
							if (!givenMap[id]) givenMap[id] = [];
							givenMap[id].addArray(toGive);
						}
					}
					for (const id in givenMap) {
						const t = (_status.connectMode ? lib.playerOL : game.playerMap)[id];
						if (t && givenMap[id].length > 0) {
							const gainNext = t.gain(givenMap[id], "draw");
							gainNext.log = false;
							await gainNext;
						}
					}
				},
			},
			clear: {
				charlotte: true,
				trigger: { player: "phaseAfter" },
				silent: true,
				async content(event, trigger, player) {
					if (player.getStorage("dlhchizhuo_active", false)) {
						lib.skill.dlhchizhuo.clearStorage(player);
					}
				},
			},
		},
	},
	wgryanzhao: {
		audio: ["ext:奥特之星/assets/yanzhao1", "ext:奥特之星/assets/yanzhao2"],
		trigger: {
			global: ["phaseZhunbeiBegin", "phaseJieshuBegin"],
		},
		direct: true,
		locked: false,
		async content(event, trigger, player) {
			const target = trigger.player;
			const controlResult = await player
				.chooseControl("牌堆", "弃牌堆", "cancel2")
				.set("prompt", get.prompt("wgryanzhao", target))
				.set("ai", () => {
					const p = _status.event.player;
					if (get.attitude(p, target) <= 0) return "cancel2";
					return "牌堆";
				})
				.forResult();
			if (!controlResult.control || controlResult.control === "cancel2") return;
			player.logSkill("wgryanzhao", target);
			const sourceType = controlResult.control;
			let damageCards = [];
			if (sourceType === "牌堆") {
				damageCards = Array.from(ui.cardPile.childNodes).filter(card => get.tag(card, "damage"));
			} else {
				damageCards = Array.from(ui.discardPile.childNodes).filter(card => get.tag(card, "damage"));
			}
			if (!damageCards.length) return;
			const cardResult = await target
				.chooseCardButton("焰炤：选择一张伤害牌使用", damageCards, true)
				.set("ai", button => {
					const card = button.link;
					if (!target.hasUseTarget(card)) return 0;
					const val = get.value(card, target);
					const cardName = card.name;
					if (cardName === "juedou") {
						const canJuedouEnemy = game.hasPlayer(p => p !== target && get.attitude(target, p) < 0 && lib.filter.targetEnabled2(card, target, p));
						if (!canJuedouEnemy) return -1;
						return val + 3;
					}
					if (cardName === "sha") {
						const canShaEnemy = game.hasPlayer(p => p !== target && get.attitude(target, p) < 0 && lib.filter.targetEnabled2(card, target, p));
						if (!canShaEnemy) return -1;
						if (card.nature === "fire" || card.nature === "thunder") {
							if (target.isDamaged()) return val + 10;
						}
						return val + 5;
					}
					if (cardName === "nanman" || cardName === "wanjian") {
						const hasShaNoRange = game.hasPlayer(p => p !== target && get.attitude(target, p) < 0);
						if (!hasShaNoRange) {
							const canShaAny = game.hasPlayer(p => p !== target && get.attitude(target, p) < 0 && lib.filter.targetEnabled2({ name: "sha" }, target, p));
							if (!canShaAny) return val + 15;
						}
						if (get.attitude(player, target) > 0) {
							const canJuedouEnemy = game.hasPlayer(p => p !== target && get.attitude(target, p) < 0 && lib.filter.targetEnabled2({ name: "juedou" }, target, p));
							if (!canJuedouEnemy) return val + 15;
						}
						return val;
					}
					if (cardName === "huogong") {
						const canShaEnemy = game.hasPlayer(p => p !== target && get.attitude(target, p) < 0 && lib.filter.targetEnabled2({ name: "sha" }, target, p));
						if (!canShaEnemy) return val + 10;
						return val;
					}
					return val;
				})
				.forResult();
			if (!cardResult.bool || !cardResult.links?.length) return;
			const selectedCard = cardResult.links[0];
			if (!target.hasUseTarget(selectedCard, true)) return;
			target.setStorage("wgryanzhao_cardid", selectedCard.cardid);
			target.addTempSkill("wgryanzhao_damage", "phaseAfter");
			await target.chooseUseTarget(selectedCard, true);
		},
		subSkill: {
			damage: {
				charlotte: true,
				trigger: { source: "damageEnd" },
				filter(event, player) {
					const cardid = player.getStorage("wgryanzhao_cardid");
					if (!cardid) return false;
					return event.card?.cardid === cardid;
				},
				forced: true,
				async content(event, trigger, player) {
					await player.draw(2);
					if (trigger.nature === "fire" || trigger.nature === "thunder") {
						await player.recover();
					}
					player.setStorage("wgryanzhao_cardid", null);
				},
			},
		},
	},
	lszhuoyan: {
		audio: ["ext:奥特之星/assets/zhuoyan1", "ext:奥特之星/assets/zhuoyan2", "ext:奥特之星/assets/zhuoyan3"],
		chargeSkill: 5,
		usable: 1,
		mod: {
			maxCharge(player, max) {
				return 5;
			},
		},
		init(player, skill) {
			player.addCharge(3, false);
		},
		onremove: true,
		enable: "phaseUse",
		direct: true,
		group: [],
		filter(event, player) {
			return player.countCharge() > 0;
		},
		async content(event, trigger, player) {
			const maxCharge = player.countCharge();
			const controlResult = await player
				.chooseControl(Array.from({ length: maxCharge }, (_, i) => i + 1 + "点").concat("cancel2"))
				.set("prompt", "请选择要消耗的蓄力点数")
				.set("ai", () => {
					const p = _status.event.player;
					const charge = p.countCharge();
					const att = t => get.attitude(p, t);
					const allies = game.filterPlayer(t => t === p || att(t) > 0);
					const enemies = game.filterPlayer(t => att(t) < 0);
					if (charge >= 5) {
						const hasLowValueAlly = allies.some(t => {
							const cards = t.getCards("h");
							if (cards.length < 2) return false;
							const avg = cards.reduce((s, c) => s + get.value(c, t), 0) / cards.length;
							return avg < 5;
						});
						if (hasLowValueAlly) return "5点";
					}
					if (charge >= 4) {
						const hasAllyJudge = allies.some(t => t.countCards("j") > 0);
						const hasEnemyEquipForAlly = enemies.some(from => {
							return from.getCards("e").some(card => {
								return allies.some(to => to.canEquip(card));
							});
						});
						if (hasAllyJudge || hasEnemyEquipForAlly) return "4点";
					}
					if (charge >= 3) return "3点";
					if (charge === 2) {
						const hasInjuredAlly = allies.some(t => t.hp < t.maxHp);
						if (hasInjuredAlly) return "2点";
					}
					return "1点";
				})
				.forResult();
			if (!controlResult.control || controlResult.control === "cancel2") {
				delete player.getStat("skill").lszhuoyan;
				return;
			}
			const num = parseInt(controlResult.control);
			player.removeCharge(num);
			player.logSkill("lszhuoyan");
			if (num >= 1) {
				const targetResult1 = await player
					.chooseTarget("对一名角色造成1点火焰伤害", true)
					.set("ai", target => {
						const p = _status.event.player;
						return -get.attitude(p, target);
					})
					.forResult();
				if (targetResult1.bool && targetResult1.targets?.length) {
					await targetResult1.targets[0].damage(1, "fire", player);
				}
			}
			if (num >= 2) {
				const targetResult2 = await player
					.chooseTarget("令至多两名角色回复2点体力", [1, 2], true)
					.set("ai", target => {
						const p = _status.event.player;
						return get.attitude(p, target);
					})
					.forResult();
				if (targetResult2.bool && targetResult2.targets) {
					for (const target of targetResult2.targets) {
						await target.recover(2);
					}
				}
			}
			if (num >= 3) {
				const targetResult3 = await player
					.chooseTarget("令至多三名角色各摸三张牌", [1, 3], true)
					.set("ai", target => {
						const p = _status.event.player;
						return get.attitude(p, target);
					})
					.forResult();
				if (targetResult3.bool && targetResult3.targets) {
					for (const target of targetResult3.targets) {
						await target.draw(3);
					}
				}
			}
			if (num >= 4) {
				for (let moveCount = 0; moveCount < 4; moveCount++) {
					const remaining = 4 - moveCount;
					const hasValidMove = game.hasPlayer(from => {
						return (
							from.countCards("ej") > 0 &&
							game.hasPlayer(to => {
								if (to === from) return false;
								const cards = from.getCards("ej");
								return cards.some(card => to.canEquip(card) || (to.canAddJudge && to.canAddJudge(card)));
							})
						);
					});
					if (!hasValidMove) break;
					const moveResult = await player
						.chooseTarget(2, (card, player, target) => {
							if (ui.selected.targets.length) {
								const from = ui.selected.targets[0];
								if (target.isMin()) return false;
								const es = from.getCards("ej");
								return es.some(c => target.canEquip(c) || (target.canAddJudge && target.canAddJudge(c)));
							}
							return target.countCards("ej") > 0;
						})
						.set("ai", target => {
							const p = _status.event.player;
							const att = get.attitude(p, target);
							if (!ui.selected.targets.length) {
								if (att > 0) {
									if (target.countCards("j") > 0) return 10;
									if (target.countCards("e", c => get.value(c, target) < 0) > 0) return 8;
								}
								return -att;
							}
							const from = ui.selected.targets[0];
							const es = from.getCards("ej");
							for (const c of es) {
								if (target.canEquip(c) && get.effect(target, c, p, target) > 0) return att;
								if (target.canAddJudge && target.canAddJudge(c) && get.attitude(p, from) < 0) return att;
							}
							return 0;
						})
						.set("multitarget", true)
						.set("targetprompt", ["被移走", "移动目标"])
						.set("prompt", "移动场上的一张牌（剩余" + remaining + "次）")
						.forResult();
					if (!moveResult.bool || !moveResult.targets || moveResult.targets.length !== 2) break;
					const fromTarget = moveResult.targets[0];
					const toTarget = moveResult.targets[1];
					const cards = fromTarget.getCards("ej").filter(c => toTarget.canEquip(c) || (toTarget.canAddJudge && toTarget.canAddJudge(c)));
					if (cards.length === 0) continue;
					const cardResult = await player.chooseCardButton(cards, true, "选择要移动的牌").forResult();
					if (!cardResult.bool || !cardResult.links || cardResult.links.length === 0) break;
					const card = cardResult.links[0];
					if (get.position(card) === "e") {
						await toTarget.equip(card);
					} else if (get.position(card) === "j") {
						await toTarget.addJudge(card);
					}
					fromTarget.$give(card, toTarget);
					game.log(player, "将", card, "从", fromTarget, "移动到了", toTarget);
				}
			}
			if (num === 5) {
				const targetResult5 = await player
					.chooseTarget("至多令五名角色弃置区域内所有牌并摸等量的牌", [1, 5], true)
					.set("ai", target => {
						const p = _status.event.player;
						return -get.attitude(p, target);
					})
					.forResult();
				if (targetResult5.bool && targetResult5.targets) {
					for (const target of targetResult5.targets) {
						const count = target.countCards("hej");
						await target.discard(target.getCards("hej"));
						await target.draw(count);
					}
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
	lsfenyun: {
		audio: ["ext:奥特之星/assets/fenyun"],
		chargeSkill: 5,
		forced: true,
		locked: false,
		mod: {
			maxCharge(player, max) {
				return 5;
			},
		},
		trigger: { global: "damageEnd" },
		filter(event, player) {
			if (!event.num || event.num <= 0) return false;
			const isFire = event.nature === "fire" || (event.hasNature && event.hasNature("fire"));
			if (event.num >= 2 || isFire) {
				return player.countCharge() < 5;
			}
			return false;
		},
		async content(event, trigger, player) {
			const isFire = trigger.nature === "fire" || (trigger.hasNature && trigger.hasNature("fire"));
			let gain = 0;
			if (trigger.num >= 2) gain++;
			if (isFire) gain++;
			const current = player.countCharge();
			const max = player.getMaxCharge();
			const actualGain = Math.min(gain, max - current);
			if (actualGain > 0) {
				player.addCharge(actualGain);
			}
		},
		group: ["lsfenyun_active"],
		subSkill: {
			active: {
				audio: ["ext:奥特之星/assets/fenyun"],
				enable: "phaseUse",
				direct: true,
				locked: false,
				filter(event, player) {
					if (player.countCharge() >= player.getMaxCharge()) return false;
					const cards = player.getCards("he");
					const damageCards = cards.filter(card => get.tag(card, "damage"));
					return damageCards.length > 0;
				},
				async content(event, trigger, player) {
					const damageCards = player.getCards("he").filter(card => get.tag(card, "damage"));
					if (damageCards.length === 0) return;
					const cardResult = await player
						.chooseToDiscard(1, "he", false, "弃置1张伤害牌获得1点蓄力点")
						.set("filterCard", card => damageCards.includes(card))
						.set("ai", card => {
							const p = _status.event.player;
							return 7 - get.value(card, p);
						})
						.forResult();
					if (!cardResult.bool || !cardResult.cards || cardResult.cards.length === 0) return;
					player.logSkill("lsfenyun_active");
					player.addCharge(1);
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
		},
	},
	zgnxiezou: {
		audio: ["ext:奥特之星/assets/xiezou1", "ext:奥特之星/assets/xiezou2"],
		enable: "phaseUse",
		direct: true,
		round: 1,
		skillAnimation: true,
		async content(event, trigger, player) {
			const targetResult = await player
				.chooseTarget("选择至少一名角色执行额外回合", [1, Infinity], (card, player, target) => {
					return target != player;
				})
				.set("ai", target => {
					const att = get.attitude(player, target);
					if (att <= 0) return 0;
					return att;
				})
				.forResult();
			if (!targetResult.bool || !targetResult.targets?.length) return;
			player.logSkill("zgnxiezou");
			setTimeout(() => {
				game.playSkillBgm("zgnxiezou");
			}, 3000);
			player.addSkill("zgnxiezou_extra");
			player.addSkill("zgnxiezou_kill");
			player.setStorage("zgnxiezou_extra_turns", targetResult.targets.slice());
			player.setStorage("zgnxiezou_extra_turn_index", 0);
			const evt = event.getParent("phaseUse");
			if (evt) {
				evt.skipped = true;
				game.log(player, "结束了出牌阶段");
			}
		},
		ai: {
			order: 3,
			result: {
				player(player) {
					if (!game.hasPlayer(p => p !== player && get.attitude(player, p) > 0)) {
						return 0;
					}
					return 1;
				},
			},
		},
		subSkill: {
			extra: {
				trigger: { global: "phaseEnd" },
				forced: true,
				filter(event, player) {
					const turns = player.getStorage("zgnxiezou_extra_turns", []);
					return turns.length > 0;
				},
				async content(event, trigger, player) {
					const turns = player.getStorage("zgnxiezou_extra_turns", []);
					let turnIndex = player.getStorage("zgnxiezou_extra_turn_index", 0);
					if (turns.length === 0) return;
					if (turnIndex < turns.length) {
						const target = turns[turnIndex];
						if (target?.isAlive()) {
							game.log(player, "令", target, "执行一个额外的回合");
							const next = target.insertPhase();
							next._noTurnOver = true;
							next.phaseList = ["phaseZhunbei", "phaseJudge", "phaseDraw", "phaseUse", "phaseDiscard", "phaseJieshu"];
							player.setStorage("zgnxiezou_current_target", target);
							player.setStorage("zgnxiezou_extra_turn_index", turnIndex + 1);
						} else {
							player.setStorage("zgnxiezou_extra_turn_index", turnIndex + 1);
						}
					} else {
						player.removeSkill("zgnxiezou_extra");
						player.removeSkill("zgnxiezou_kill");
						const judgeCards = player.getCards("j");
						if (judgeCards.length > 0) {
							await player.discard(judgeCards);
							game.log(player, "弃置了判定区的牌");
						}
						game.log(player, "执行一个额外的回合");
						const next = player.insertPhase();
						next._noTurnOver = true;
						next.phaseList = ["phaseZhunbei", "phaseJudge", "phaseDraw", "phaseUse", "phaseDiscard", "phaseJieshu"];
						player.setStorage("zgnxiezou_extra_turns", undefined);
						player.setStorage("zgnxiezou_extra_turn_index", undefined);
						player.setStorage("zgnxiezou_current_target", undefined);
					}
				},
			},
			kill: {
				trigger: { global: "useCardAfter" },
				filter(event, player) {
					const target = event.player;
					const turns = player.getStorage("zgnxiezou_extra_turns", []);
					if (!target || !turns.includes(target)) return false;
					if (!get.tag(event.card, "damage") || !event.targets?.length) return false;
					return game.hasPlayer(p => p != player && get.attitude(player, p) < 0 && player.canUse({ name: "sha" }, p));
				},
				async content(event, trigger, player) {
					await player.chooseUseTarget({ name: "sha" }, true).set("ai", target => -get.attitude(player, target));
				},
			},
		},
	},
	ylshanshuo: {
		logAudio(trigger, player) {
			if (player.getStorage("ylshanshuo_fromKanpo", false)) {
				return ["ext:奥特之星/assets/kanpo" + (Math.floor(Math.random() * 2) + 2)];
			}
			return ["ext:奥特之星/assets/shanshuo1", "ext:奥特之星/assets/shanshuo2"];
		},
		trigger: { player: "damageEnd" },
		forced: true,
		locked: false,
		async content(event, trigger, player) {
			await player.draw();
			player.setStorage("ylshanshuo_using", true);
			const result = await player
				.chooseToUse()
				.set("openskilldialog", "###闪烁###将一张牌当作无距离限制、至多可指定三个目标的【杀】使用")
				.set("norestore", true)
				.set("_backupevent", "ylshanshuo_backup")
				.set("custom", { add: {}, replace: { window() {} } })
				.backup("ylshanshuo_backup")
				.set("addCount", false)
				.forResult();
			player.setStorage("ylshanshuo_using", false);
			if (result.bool) {
				game.log(player, "将", result.cards[0], "当作【杀】使用了");
			}
		},
		ai: {
			maixie: true,
			maixie_hp: true,
			effect: {
				target(card, player, target) {
					if (target.hasSkill("ylshanshuo") && target.hasSkill("ylxiahe") && get.tag(card, "damage")) {
						if (player.hasSkillTag("jueqing", false, target)) {
							return [1, -2];
						}
						if (get.attitude(target, player) > 0) {
							return [0.5, get.tag(card, "damage") * 2];
						}
						return [0, 0.4];
					}
				},
			},
			wuxie(card, player, target) {
				if (!target || !target.hasSkill("ylshanshuo") || !target.hasSkill("ylxiahe")) return;
				return -10;
			},
		},
		mod: {
			targetInRange(card, player, target) {
				if (player.getStorage("ylshanshuo_using", false)) {
					return true;
				}
			},
		},
		subSkill: {
			backup: {
				filterCard(card) {
					return get.itemtype(card) === "card";
				},
				selectCard: 1,
				position: "he",
				viewAs: { name: "sha" },
				filterTarget(card, player, target) {
					return player !== target && lib.filter.targetEnabled({ name: "sha" }, player, target);
				},
				selectTarget: [1, 3],
				ai1(card) {
					return 15 - get.value(card);
				},
				ai2(target) {
					const player = get.player();
					const att = get.attitude(player, target);
					if (att >= 0) return -100;
					let effect = -att * 2;
					const targetHand = target.getCards("h");
					const hasShan = targetHand.some(c => get.name(c) === "shan");
					const hasJiu = targetHand.some(c => get.name(c) === "jiu");
					if (!hasShan) effect += 10;
					if (hasJiu) effect -= 5;
					return effect;
				},
			},
		},
	},
	ylxiahe: {
		audio: ["ext:奥特之星/assets/xiahe1", "ext:奥特之星/assets/xiahe2"],
		trigger: { source: "damageEnd" },
		forced: true,
		locked: false,
		async content(event, trigger, player) {
			const num = trigger.num || 1;
			await player.draw(num);
			const damage = player.getStorage("ylxiahe_damage", 0) + num;
			player.setStorage("ylxiahe_damage", damage);
			const recover = Math.floor(damage / 2);
			if (recover > 0) {
				player.setStorage("ylxiahe_damage", damage % 2);
				await player.recover(recover);
			}
		},
	},
	ylkanpo: {
		audio: ["ext:奥特之星/assets/kanpo1"],
		trigger: { global: "phaseBegin" },
		forced: false,
		filter(event, player) {
			return event.player !== player && !event.player.hasSkill("xiuzheng") && player.getStorage("ylkanpo_round", 0) !== game.roundNumber;
		},
		check(event, player) {
			const target = event.player;
			if (get.attitude(player, target) >= 0) return false;
			const hand = target.getCards("h");
			const shaCount = hand.filter(c => get.name(c) === "sha" || get.name(c) === "juedou").length;
			if (shaCount >= 2 && player.hp <= 2) return false;
			return true;
		},
		skillAnimation: true,
		async content(event, trigger, player) {
			const target = trigger.player;
			player.setStorage("ylkanpo_round", game.roundNumber);
			let num = 0;
			let discardedCards = [];
			if (player.countCards("he") > 0) {
				const allCards = player.getCards("he");
				const dialog = ui.create.dialog("勘破：选择要弃置的牌");
				dialog.add([allCards, "card"]);
				dialog.add([
					[
						["all", "全选"],
						["none", "不弃置"],
					],
					"textbutton",
				]);
				const discardResult = await player
					.chooseButton(dialog, true)
					.set("filterButton", button => {
						return button.link === "all" || button.link === "none" || get.itemtype(button.link) === "card";
					})
					.set("selectButton", [0, allCards.length])
					.set("ai", button => {
						if (button.link === "all") {
							const totalValue = allCards.reduce((sum, c) => sum + get.value(c, player), 0);
							return 10 - totalValue / allCards.length;
						}
						if (button.link === "none") return 0;
						return 6 - get.value(button.link, player);
					})
					.forResult();
				if (discardResult.bool && discardResult.links?.length > 0) {
					if (discardResult.links.includes("all")) {
						num = allCards.length;
						discardedCards = allCards;
					} else if (!discardResult.links.includes("none")) {
						discardedCards = discardResult.links.filter(c => get.itemtype(c) === "card");
						num = discardedCards.length;
					}
					if (num > 0) {
						await player.discard(discardedCards);
					}
				}
			}
			const topCards = num > 0 ? get.cards(num * 2, true) : [];
			const handCards = target.getCards("h");
			if (topCards.length > 0) {
				await target.showCards(topCards, "牌堆顶").set("delay_time", 3).set("nolog", true);
			}
			if (handCards.length > 0) {
				await target.showCards(handCards, "手牌").set("delay_time", 3).set("nolog", true);
			}
			player.setStorage("ylshanshuo_fromKanpo", true);
			const shaAndJuedou = [...topCards, ...handCards].filter(c => get.name(c) === "sha" || get.name(c) === "juedou");
			if (shaAndJuedou.length > 0) {
				for (const card of shaAndJuedou) {
					if (target.canUse(card, player, false, false)) {
						await target.useCard(card, player, false);
					}
				}
			}
			if (!event.damageReceived) {
				await player.draw();
				game.log(player, "发动了", "#g【闪烁】");
				game.playAudio("..", "extension", "奥特之星", "assets/kanpo" + (Math.floor(Math.random() * 2) + 4));
				if (player.countCards("he") > 0) {
					player.setStorage("ylshanshuo_using", true);
					const useResult = await player
						.chooseToUse()
						.set("openskilldialog", "###闪烁###将一张牌当作无距离限制、至多可指定三个目标的【杀】使用")
						.set("norestore", true)
						.set("_backupevent", "ylkanpo_backup")
						.set("custom", { add: {}, replace: { window() {} } })
						.backup("ylkanpo_backup")
						.set("addCount", false)
						.forResult();
					player.setStorage("ylshanshuo_using", false);
					if (useResult.bool) {
						game.log(player, "将", useResult.cards[0], "当作【杀】使用了");
					}
				}
			}
			player.setStorage("ylshanshuo_fromKanpo", false);
		},
		group: ["ylkanpo_damage"],
		subSkill: {
			backup: {
				filterCard(card) {
					return get.itemtype(card) === "card";
				},
				selectCard: 1,
				position: "he",
				viewAs: { name: "sha" },
				filterTarget(card, player, target) {
					return player !== target && lib.filter.targetEnabled({ name: "sha" }, player, target);
				},
				selectTarget: [1, 3],
				ai1(card) {
					return 5 - get.value(card);
				},
				ai2(target) {
					const player = get.player();
					return get.effect(target, { name: "sha" }, player, player);
				},
			},
			damage: {
				charlotte: true,
				trigger: { player: "damageBegin4" },
				filter(event, player) {
					return event.getParent("ylkanpo");
				},
				silent: true,
				async content(event, trigger, player) {
					const evt = event.getParent("ylkanpo");
					if (evt) {
						evt.damageReceived = true;
					}
				},
			},
		},
	},
	xdanchao: {
		audio: ["ext:奥特之星/assets/anchao1"],
		trigger: { global: ["changeHp", "loseAfter", "cardsDiscardAfter", "loseAsyncAfter", "equipAfter"] },
		forced: true,
		locked: false,
		filter(event, player) {
			const silong = game.players.find(p => p.name === "死龙") ?? game.dead.find(p => p.name === "死龙");
			if (!silong) return false;
			if (event.name === "changeHp") {
				if (!event.player || event.player.name === "死龙") return false;
				if (event.num === 0) return false;
			} else {
				if (!silong.storage.sl_resting) return false;
				const cards = event.getd ? event.getd() : [];
				if (cards.length === 0) return false;
			}
			return true;
		},
		async content(event, trigger, player) {
			const silong = game.players.find(p => p.name === "死龙") ?? game.dead.find(p => p.name === "死龙");
			if (!silong) return;
			let count = 0;
			if (trigger.name === "changeHp") {
				count = Math.abs(trigger.num);
			} else {
				const cards = trigger.getd ? trigger.getd() : [];
				count = cards.length;
			}
			if (silong.storage.sl_resting) {
				const current = player.countMark("xdanchao_xinrui");
				const add = Math.min(count, 34 - current);
				if (add > 0) {
					player.addMark("xdanchao_xinrui", add);
				}
			} else {
				if (trigger.name === "changeHp") {
					await silong.recover(count);
				}
			}
		},
		group: ["xdanchao_gamestart", "xdanchao_phaseEnd", "xdanchao_dieCheck"],
		subSkill: {
			gamestart: {
				trigger: { global: "phaseBefore" },
				filter(event, player) {
					if (player.name !== "遐蝶") return false;
					return game.phaseNumber === 0;
				},
				forced: true,
				priority: 20,
				async content(event, trigger, player) {
					if (game.players.some(p => p.name === "死龙")) return;
					let silong;
					if (_status.connectMode) {
						silong = await game.addPlayerOL(player, "死龙", null, true);
					} else {
						silong = await game.addPlayerOL(player, "死龙", null, false, { animation: true });
					}
					if (!silong.parentNode && ui.arena) {
						ui.arena.appendChild(silong);
						game.arrangePlayers();
					}
					silong._trueMe = player;
					silong.identity = player.identity;
					silong.side = player.side;
					silong.maxHp = 34;
					silong.hp = 34;
					silong.storage = {};
					silong.storage.sl_resting = true;
					game.broadcastAll(
						(silong, player) => {
							silong.node.identity.firstChild.innerHTML = player.node.identity.firstChild.innerHTML;
							silong.node.identity.dataset.color = player.node.identity.dataset.color;
							silong.classList.add("out");
						},
						silong,
						player
					);
					game.log(player, "召唤了死龙进入休整状态");
					game.addGlobalSkill("autoswap");
				},
			},
			phaseEnd: {
				audio: ["ext:奥特之星/assets/anchao"],
				trigger: { global: "phaseEnd" },
				filter(event, player) {
					return player.countMark("xdanchao_xinrui") >= 34;
				},
				forced: true,
				locked: true,
				async content(event, trigger, player) {
					const silong = game.players.find(p => p.name === "死龙");
					if (!silong) return;
					if (silong.storage.sl_resting) {
						game.playSkillBgm("fuxiao");
						player.$skill("拥抱新生吧，玻吕刻斯", "thunder", "fire");
						silong.storage.sl_resting = false;
						await silong.recover(silong.maxHp - silong.getHp());
						game.broadcastAll(silong => {
							silong.classList.remove("out");
						}, silong);
						player.removeMark("xdanchao_xinrui", player.countMark("xdanchao_xinrui"));
						game.log(player, "令死龙结束了休整状态，回复至满体力");
						await silong.addSkills("slcontrol");
					}
				},
			},
			dieCheck: {
				trigger: { global: "dieAfter" },
				forced: true,
				silent: true,
				filter(event, player) {
					if (get.mode() === "identity") return false;
					if (player.name !== "遐蝶") return false;
					if (!player.isAlive()) return false;
					const silong = game.players.find(p => p.name === "死龙");
					return silong && !silong.isDead();
				},
				async content(event, trigger, player) {
					const friendSide = player.side;
					const enemiesAlive = game.players.filter(p => p.side !== friendSide && !p.isDead());
					if (enemiesAlive.length === 0) {
						game.over(true);
					}
				},
			},
			xinrui: {
				mark: true,
				marktext: "蕊",
				intro: { content: "当前有#枚“新蕊”标记" },
			},
		},
		intro: {
			name: "新蕊",
			content: "当前有#枚“新蕊”标记",
		},
	},
	xdyuejian: {
		audio: ["ext:奥特之星/assets/yuejian"],
		usable: 1,
		trigger: { global: "dying" },
		filter(event, player) {
			if (player.getStorage("xdyuejian_used", false)) return false;
			if (event.player && event.player.name === "死龙") return false;
			return true;
		},
		prompt(event, player) {
			return "是否对 " + get.translation(event.player) + " 发动【月茧】？";
		},
		check(event, player) {
			return get.attitude(player, event.player) > 0;
		},
		async content(event, trigger, player) {
			player.setStorage("xdyuejian_used", true);
			const target = trigger.player;
			const currentHp = target.hp;
			if (currentHp < 1) {
				const recoverNum = 1 - currentHp;
				trigger.untrigger();
				await target.recover(recoverNum);
				target.setStorage("xdyuejian_debt", recoverNum);
				target.addSkill("xdyuejian_debt");
			}
		},
		subSkill: {
			debt: {
				trigger: { player: "phaseEnd" },
				forced: true,
				charlotte: true,
				filter(event, player) {
					return player.getStorage("xdyuejian_debt", 0) > 0;
				},
				async content(event, trigger, player) {
					const debt = player.getStorage("xdyuejian_debt", 0);
					await player.loseHp(debt);
					player.setStorage("xdyuejian_debt", 0);
					player.removeSkill("xdyuejian_debt");
				},
			},
		},
	},
	xdyoudie: {
		audio: ["ext:奥特之星/assets/youdie1", "ext:奥特之星/assets/youdie2", "ext:奥特之星/assets/youdie3", "ext:奥特之星/assets/youdie4"],
		enable: "phaseUse",
		usable: 1,
		group: ["xdyoudie_damage"],
		async content(event, trigger, player) {
			const targets = game.players.filter(p => p.getHp() > 1);
			for (const t of targets) {
				await t.loseHp(1);
			}
			player.addMark("xdyoudie_damage", 1);
		},
		ai: {
			order: 6,
			result: {
				player(player) {
					const enemies = game.players.filter(p => get.attitude(player, p) < 0);
					const friends = game.players.filter(p => get.attitude(player, p) > 0 && p !== player);
					if (enemies.length > friends.length) return 1;
					return 0;
				},
			},
		},
		subSkill: {
			damage: {
				mark: true,
				marktext: "蝶",
				intro: { content: "下一张伤害牌造成的伤害+#" },
				trigger: { player: "useCard" },
				filter(event, player) {
					return get.is.damageCard(event.card) && player.countMark("xdyoudie_damage") > 0;
				},
				forced: true,
				locked: true,
				firstDo: true,
				async content(event, trigger, player) {
					const extra = player.countMark("xdyoudie_damage");
					player.removeMark("xdyoudie_damage", extra);
					player.unmarkSkill("xdyoudie_damage");
					player.addTempSkill("xdyoudie_damage_effect", "useCardAfter");
					player.markAuto("xdyoudie_damage_effect", [trigger.card]);
					player.setStorage("xdyoudie_extra", extra);
					game.log(player, "的【幽蝶】效果触发，下一张伤害牌伤害+" + extra);
				},
			},
			damage_effect: {
				charlotte: true,
				onremove: true,
				trigger: { source: "damageBegin1" },
				filter(event, player) {
					return event.card && player.getStorage("xdyoudie_damage_effect").includes(event.card);
				},
				forced: true,
				popup: false,
				async content(event, trigger, player) {
					const extra = player.getStorage("xdyoudie_extra", 0);
					trigger.num += extra;
					game.log(player, "的【幽蝶】效果生效，伤害+" + extra);
				},
			},
		},
	},
	hqchigui: {
		trigger: {
			global: ["loseHpAfter", "loseMaxHpAfter", "damageEnd", "linkAfter", "turnOverAfter", "discardAfter", "phaseDrawSkipped", "phaseUseSkipped"],
		},
		filter(event, player) {
			if (player.countMark("hqchigui") >= 9) return false;
			if (event.player === player) return false;
			if (event._hqchigui) return false;
			if (event.name === "loseHp") return true;
			if (event.name === "loseMaxHp") return true;
			if (event.name === "damage") return event.nature === "fire" || event.nature === "thunder";
			if (event.name === "link") return event.player.isLinked();
			if (event.name === "turnOver") return event.player.isTurnedOver();
			if (event.name === "discard") return event.cards?.length > 0;
			if (event.name === "phaseDraw" || event.name === "phaseUse") return true;
			return false;
		},
		forced: true,
		async content(event, trigger, player) {
			const target = trigger.player;
			if (!target) return;
			trigger._hqchigui = true;
			let num = 1;
			if (trigger.name === "loseHp" || trigger.name === "loseMaxHp") {
				num = trigger.num || 1;
			} else if (trigger.name === "damage") {
				num = trigger.num || 1;
			} else if (trigger.name === "discard") {
				num = trigger.cards?.length || 1;
			}
			const current = player.countMark("hqchigui");
			const maxAdd = 9 - current;
			if (maxAdd <= 0) return;
			player.addMark("hqchigui", Math.min(num, maxAdd));
		},
		mark: true,
		marktext: "梦",
		intro: {
			name: "残梦",
			content: "mark",
		},
		group: ["hqchigui_init", "hqchigui_phaseUse"],
		subSkill: {
			init: {
				audio: ["ext:奥特之星/assets/chigui1"],
				trigger: {
					global: "phaseBefore",
					player: "enterGame",
				},
				forced: true,
				filter(event, player) {
					if (player.hasMark("hqchigui")) return false;
					return event.name !== "phase" || game.phaseNumber === 0;
				},
				async content(event, trigger, player) {
					player.addMark("hqchigui", 5);
				},
			},
			phaseUse: {
				audio: ["ext:奥特之星/assets/chigui2", "ext:奥特之星/assets/chigui3"],
				trigger: {
					player: "phaseUseBegin",
				},
				async content(event, trigger, player) {
					const result = await player
						.chooseTarget("赤鬼：选择一名其他角色执行一项负面效果", true, (card, player, target) => player !== target)
						.set("ai", target => (get.attitude(player, target) < 0 ? 1 : 0))
						.forResult();
					const target = result.targets[0];
					if (!player.storage.hqchigui_usedChoices) player.storage.hqchigui_usedChoices = [];
					const allOptions = [
						["skipDraw", "跳过下一个摸牌阶段"],
						["skipUse", "跳过下一个出牌阶段"],
						["loseHp", "失去1点体力"],
						["loseMaxHp", "失去1点体力上限"],
						["fireDamage", "受到一点火焰伤害"],
						["thunderDamage", "受到一点雷电伤害"],
						["link", "进入连环状态"],
						["turnOver", "武将牌翻至背面"],
						["discard", "随机弃置一张牌"],
					];
					let list = allOptions.filter(([choice]) => {
						if (player.storage.hqchigui_usedChoices.includes(choice)) return false;
						switch (choice) {
							case "skipDraw":
								return !target.hasSkill("hqchigui_skipDraw");
							case "skipUse":
								return !target.hasSkill("hqchigui_skipUse");
							case "link":
								return !target.isLinked();
							case "turnOver":
								return !target.isTurnedOver();
							case "discard":
								return target.countCards("he") > 0;
							default:
								return true;
						}
					});
					if (!list.length) {
						player.storage.hqchigui_usedChoices = [];
						list = allOptions.filter(([choice]) => {
							switch (choice) {
								case "skipDraw":
									return !target.hasSkill("hqchigui_skipDraw");
								case "skipUse":
									return !target.hasSkill("hqchigui_skipUse");
								case "link":
									return !target.isLinked();
								case "turnOver":
									return !target.isTurnedOver();
								case "discard":
									return target.countCards("he") > 0;
								default:
									return true;
							}
						});
						if (!list.length) return;
					}
					const choiceResult = await player
						.chooseButton(["赤鬼：选择一项负面效果", [list, "textbutton"]])
						.set("ai", button => {
							const c = button.link;
							if (["skipUse", "turnOver"].includes(c)) return 8;
							if (["skipDraw", "loseMaxHp"].includes(c)) return 6;
							if (["loseHp", "fireDamage", "thunderDamage"].includes(c)) return 4;
							if (["link", "discard"].includes(c)) return 2;
							return 1;
						})
						.forResult();
					if (!choiceResult?.links?.length) return;
					const choice = choiceResult.links[0];
					player.storage.hqchigui_usedChoices.push(choice);
					switch (choice) {
						case "skipDraw":
							target.addSkill("hqchigui_skipDraw");
							game.log(player, "令", target, "跳过下一个摸牌阶段");
							break;
						case "skipUse":
							target.addSkill("hqchigui_skipUse");
							game.log(player, "令", target, "跳过下一个出牌阶段");
							break;
						case "loseHp":
							await target.loseHp();
							break;
						case "loseMaxHp":
							await target.loseMaxHp();
							break;
						case "fireDamage":
							await target.damage(1, "fire", player);
							break;
						case "thunderDamage":
							await target.damage(1, "thunder", player);
							break;
						case "link":
							await target.link();
							break;
						case "turnOver":
							await target.turnOver();
							break;
						case "discard":
							await target.discard(target.getCards("he").randomGets(1));
							break;
					}
				},
			},
			skipDraw: {
				trigger: {
					player: "phaseDrawBefore",
				},
				forced: true,
				popup: false,
				silent: true,
				charlotte: true,
				async content(event, trigger, player) {
					trigger.cancel();
					player.removeSkill("hqchigui_skipDraw");
				},
				mark: true,
				marktext: "兵",
				intro: {
					content: "跳过下一个摸牌阶段",
				},
			},
			skipUse: {
				trigger: {
					player: "phaseUseBefore",
				},
				forced: true,
				popup: false,
				silent: true,
				charlotte: true,
				content(event, trigger, player) {
					trigger.cancel();
					player.removeSkill("hqchigui_skipUse");
				},
				mark: true,
				marktext: "乐",
				intro: {
					content: "跳过下一个出牌阶段",
				},
			},
		},
	},
	hqtize: {
		audio: ["ext:奥特之星/assets/tize1"],
		skillAnimation: true,
		animationColor: "thunder",
		trigger: {
			global: "phaseEnd",
		},
		filter(event, player) {
			return player.countMark("hqchigui") >= 9;
		},
		direct: true,
		async content(event, trigger, player) {
			const activateResult = await player
				.chooseBool("啼泽：是否移除所有“残梦”标记并发动技能？")
				.set("ai", () => true)
				.forResult();
			if (!activateResult.bool) return;
			player.logSkill("hqtize");
			const count = player.countMark("hqchigui");
			player.removeMark("hqchigui", count);
			player.changeSkin("hqtize", "黄泉-啼泽");
			for (let i = 0; i < 3; i++) {
				const result = await player
					.chooseTarget({
						forced: true,
						prompt: "啼泽：选择第" + (i + 1) + "张雷【杀】的目标",
						filterTarget(card, player, target) {
							return (
								player != target &&
								lib.filter.targetEnabled(
									{
										name: "sha",
										nature: "thunder",
									},
									player,
									target
								)
							);
						},
						ai(target) {
							return get.effect(
								target,
								{
									name: "sha",
									nature: "thunder",
								},
								player,
								player
							);
						},
					})
					.forResult();
				if (!result.bool || !result.targets?.length) break;
				const target = result.targets[0];
				const card = {
					name: "sha",
					nature: "thunder",
					isCard: false,
				};
				game.log(player, "视为对", target, "使用了一张雷【杀】");
				const next = player.useCard(card, target, false);
				next.addCount = false;
				next.nodistance = true;
				await next;
			}
			const result = await player
				.chooseTarget({
					forced: true,
					prompt: "啼泽：视为使用一张指定任意名角色的雷【杀】",
					selectTarget: [1, game.countPlayer(current => current !== player)],
					filterTarget(card, player, target) {
						return (
							player != target &&
							lib.filter.targetEnabled(
								{
									name: "sha",
									nature: "thunder",
								},
								player,
								target
							)
						);
					},
					ai(target) {
						return get.effect(
							target,
							{
								name: "sha",
								nature: "thunder",
							},
							player,
							player
						);
					},
				})
				.forResult();
			game.playAudio("ext:奥特之星/assets/tize2.mp3");
			if (result.bool && result.targets?.length) {
				const card = {
					name: "sha",
					nature: "thunder",
					isCard: false,
				};
				const next = player.useCard(card, result.targets, false);
				next.addCount = false;
				next.nodistance = true;
				await next;
			}
			player.changeSkin("hqtize", "黄泉");
		},
		ai: {
			combo: "hqchigui",
			order: 10,
			result: {
				player(player) {
					return 1;
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
			const reduceDamage = Math.max(0, event.num - event.player.hp + 1);
			const damageX = 5 * reduceDamage;
			if (player.getHp() <= damageX) return false;
			return true;
		},
		async content(event, trigger, player) {
			const reduceDamage = Math.max(0, trigger.num - trigger.player.hp + 1);
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
};
