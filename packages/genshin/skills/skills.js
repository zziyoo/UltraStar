import { lib, game, ui, get, ai, _status } from "../../../../../noname.js";

export const skills = {
	ffshenqu: {
		audio: ["ext:奥特之星/assets/genshin/audio/skill/shenqu1", "ext:奥特之星/assets/genshin/audio/skill/shenqu2"],
		trigger: { player: "dying" },
		forced: true,
		async content(event, trigger, player) {
			if (player.maxHp > 3) await player.loseMaxHp(player.maxHp - 3);
			if (player.maxHp < 3) await player.gainHp(3 - player.maxHp);
			const num = 3 - player.hp;
			if (num > 0) await player.recover(num);
		},
		ai: {
			halfneg: true,
			effect: {
				target(card, player, target) {
					if (target.hasSkill("ffshenqu") && get.tag(card, "damage")) {
						if (get.attitude(player, target) < 0) return [0.85, 1];
					}
				},
			},
		},
	},
	ffshenpan: {
		dutySkill: true,
		derivation: ["ffguqi", "ffsongshi"],
		group: ["ffshenpan_main", "ffshenpan_target", "ffshenpan_targeted", "ffshenpan_round", "ffshenpan_achieve", "ffshenpan_fail", "ffshenpan_die"],
		subSkill: {
			main: {
				trigger: { global: "useCardAfter" },
				forced: true,
				filter(event, player) {
					if (!event.targets?.length) return false;
					const source = event.player;
					if (!source) return false;
					return event.targets.some(t => t !== source);
				},
				async content(event, trigger, player) {
					const isRealCard = card => {
						if (!card) return false;
						if (card.isCard === false) return false;
						if (card.cards?.length === 0) return false;
						return true;
					};
					const cards = [];
					if (trigger.cards?.length) {
						for (const c of trigger.cards) {
							if (isRealCard(c)) cards.push(c);
						}
					}
					if (trigger.card?.cards?.length) {
						for (const c of trigger.card.cards) {
							if (!cards.includes(c) && isRealCard(c)) cards.push(c);
						}
					}
					const respondedCards = [];
					const targets = trigger.targets;
					for (const target of targets) {
						if (!target) continue;
						const history1 = target.getHistory("useCard", evt => evt.respondTo?.[1] === trigger.card);
						for (const h of history1) {
							if (h?.cards) {
								for (const c of h.cards) {
									if (isRealCard(c)) respondedCards.push(c);
								}
							}
						}
						const history2 = target.getHistory("respond", evt => evt.respondTo?.[1] === trigger.card);
						for (const h of history2) {
							if (h?.cards) {
								for (const c of h.cards) {
									if (isRealCard(c)) respondedCards.push(c);
								}
							}
						}
					}
					const allCards = cards.concat(respondedCards);
					if (allCards.length === 0) return;
					let num = 0;
					for (const card of allCards) {
						const number = get.number(card, false);
						if (number > 0) num += number;
					}
					for (const c of allCards) c.classList.add("glory2");
					const next = player.addToExpansion(allCards, "gain2");
					next.gaintag.add("ffshenpan_lvchang");
					await next;
					game.log(player, "将", allCards.length, "张牌扣置于武将牌上，称为“律偿”牌");
					player.markSkill("ffshenpan_lvchang");
					if (num > 0) {
						player.addMark("ffshenpan_wu", num);
						player.markSkill("ffshenpan_wu");
					}
				},
			},
			target: {
				trigger: { player: "useCard1" },
				charlotte: true,
				forced: true,
				filter(event, player) {
					return event.targets?.length > 0;
				},
				async content(event, trigger, player) {
					if (trigger.targets?.length) {
						for (const t of trigger.targets) {
							player.markAuto("ffshenpan_target", [t]);
						}
					}
				},
			},
			targeted: {
				trigger: { target: "useCardToTargeted" },
				charlotte: true,
				forced: true,
				filter(event, player) {
					return event.player !== player;
				},
				async content(event, trigger, player) {
					player.markAuto("ffshenpan_targeted", [trigger.player]);
				},
			},
			round: {
				trigger: { global: "roundEnd" },
				forced: true,
				audio: ["ext:奥特之星/assets/genshin/audio/skill/shenpan"],
				async content(event, trigger, player) {
					const aliveCount = game.countPlayer();
					const topCards = get.cards(aliveCount);
					for (const c of topCards) c.classList.add("glory2");
					const next = player.addToExpansion(topCards, "gain2");
					next.gaintag.add("ffshenpan_lvchang");
					await next;
					game.log(player, "将牌堆顶的", aliveCount, "张牌置于武将牌上，称为“律偿”牌");
					player.markSkill("ffshenpan_lvchang");
					let num = 0;
					for (const c of topCards) {
						const number = get.number(c, false);
						if (number > 0) num += number;
					}
					if (num > 0) {
						player.addMark("ffshenpan_wu", num);
					}
					const playerList = game.players.slice();
					const selfIndex = playerList.indexOf(player);
					if (selfIndex > 0) {
						playerList.splice(selfIndex, 1);
						playerList.unshift(player);
					}
					for (let i = 0; i < aliveCount; i++) {
						const lvchang = player.getExpansions("ffshenpan_lvchang");
						if (lvchang.length === 0) break;
						const currentTarget = playerList[i % playerList.length];
						const result = await player
							.chooseCardButton(lvchang, 1, "选择一张“律偿”牌发给" + get.translation(currentTarget), true)
							.set("ai", () => Math.random())
							.forResult();
						if (result.bool && result.links?.length) {
							const card = result.links[0];
							const number = get.number(card, false);
							await currentTarget.gain(card, "gain2");
							if (number > 0) {
								player.addMark("ffshenpan_wu", number);
							}
							game.log(currentTarget, "获得了一张“律偿”牌");
						}
					}
				},
			},
			achieve: {
				trigger: { global: "roundStart" },
				forced: true,
				skillAnimation: true,
				animationColor: "water",
				prompt2: "赦免",
				audio: ["ext:奥特之星/assets/genshin/audio/skill/shenpan-success"],
				filter(event, player) {
					if (player.countMark("ffshenpan_wu") >= 500) return true;
					const allPlayers = game.filterPlayer(p => p.isAlive());
					const targets = player.getStorage("ffshenpan_target");
					return allPlayers.every(p => targets.includes(p));
				},
				async content(event, trigger, player) {
					game.log("使命成功！芙宁娜熬过了五百年");
					player.awakenSkill("ffshenpan");
					player.changeSkin("ffshenpan", "芙宁娜-成功");
					await player.removeSkills("ffduwu");
					await player.removeSkills("ffshenqu");
					await player.addSkills("ffsongshi");
				},
			},
			fail: {
				trigger: { global: "phaseAfter" },
				forced: true,
				skillAnimation: true,
				animationColor: "fire",
				prompt2: "死刑",
				audio: ["ext:奥特之星/assets/genshin/audio/skill/shenpan-fail"],
				filter(event, player) {
					const otherPlayers = game.filterPlayer(p => p !== player && p.isAlive());
					if (otherPlayers.length === 0) return false;
					const targeted = player.getStorage("ffshenpan_targeted");
					return otherPlayers.every(p => targeted.includes(p));
				},
				async content(event, trigger, player) {
					game.log("使命失败！芙宁娜将在王座上独自哭泣");
					player.awakenSkill("ffshenpan");
					player.changeSkin("ffshenpan", "芙宁娜-失败");
					await player.removeSkills("ffshenqu");
					await player.addSkills("ffguqi");
				},
			},
			die: {
				trigger: { player: "dieBegin" },
				forced: true,
				silent: true,
				async content(event, trigger, player) {
					if (player.hasSkill("ffsongshi")) {
						game.playAudio("ext:奥特之星/assets/genshin/audio/die/芙宁娜芙卡洛斯-赦免.mp3");
					} else if (player.hasSkill("ffguqi")) {
						game.playAudio("ext:奥特之星/assets/genshin/audio/die/芙宁娜芙卡洛斯-死刑.mp3");
					} else {
						game.playAudio("ext:奥特之星/assets/genshin/audio/die/芙宁娜芙卡洛斯.mp3");
					}
				},
			},
			lvchang: {
				mark: true,
				marktext: "律",
				intro: {
					name: "律偿",
					markcount: "expansion",
					mark(dialog, storage, player) {
						const cards = player.getExpansions("ffshenpan_lvchang");
						if (cards.length) {
							if (player.isUnderControl(true)) dialog.addAuto(cards);
							else dialog.addText("共有" + cards.length + "张“律偿”牌");
						} else {
							dialog.addText("暂无“律偿”牌");
						}
					},
				},
				async onremove(player, skill) {
					const cards = player.getExpansions(skill);
					if (cards.length) {
						await player.loseToDiscardpile(cards);
					}
				},
			},
			wu: {
				mark: true,
				marktext: "舞",
				intro: {
					name: "舞",
					content: "“舞”标记数量：#",
				},
			},
		},
	},
	ffduwu: {
		audio: ["ext:奥特之星/assets/genshin/audio/skill/duwu"],
		trigger: { global: "phaseEnd" },
		forced: true,
		mark: true,
		marktext: "舞",
		intro: {
			name: "独舞",
			content(storage, player) {
				const targets = player.getStorage("ffshenpan_target");
				const targeted = player.getStorage("ffshenpan_targeted");
				let str = targets.length > 0 ? "你使用牌指定过的目标：" + targets.map(t => get.translation(t)).join("、") : "你尚未对其他角色使用过牌";
				str += "<br>";
				str += targeted.length > 0 ? "对你使用过牌的角色：" + targeted.map(t => get.translation(t)).join("、") : "尚无其他角色对你使用过牌";
				return str;
			},
		},
		async content(event, trigger, player) {
			const lvchang = player.getExpansions("ffshenpan_lvchang");
			const y = Math.max(1, lvchang.length);
			const topCards = get.cards(y);
			const result = await player
				.chooseCardButton(topCards, 1, `独舞：观看牌堆顶${get.cnNumber(y)}张牌，选择一张使用或获得（伤害类牌只能获得）`, true)
				.set("ai", button => {
					const card = button.link;
					if (get.tag(card, "damage")) return get.value(card);
					if (player.hasUseTarget(card, null, true)) return 10 + get.value(card);
					return get.value(card);
				})
				.forResult();
			if (!result.bool || !result.links?.length) return;
			const selectedCard = result.links[0];
			const isDamageCard = get.tag(selectedCard, "damage");
			const remaining = topCards.filter(c => c !== selectedCard);
			if (!isDamageCard && player.hasUseTarget(selectedCard, null, true)) {
				const useResult = await player
					.chooseUseTarget(selectedCard, `是否使用${get.translation(selectedCard)}？`, false, "nodistance")
					.set("ai1", () => get.effect_use(result.targets[0], selectedCard, player, player))
					.forResult();
				if (useResult.bool) {
					for (let i = remaining.length - 1; i >= 0; i--) {
						remaining[i].fix();
						ui.cardPile.insertBefore(remaining[i], ui.cardPile.firstChild);
					}
					return;
				}
			}
			await player.gain(selectedCard, "gain2");
			for (let i = remaining.length - 1; i >= 0; i--) {
				remaining[i].fix();
				ui.cardPile.insertBefore(remaining[i], ui.cardPile.firstChild);
			}
		},
	},
	ffsongshi: {
		trigger: { global: "phaseZhunbeiBegin" },
		filter(event, player) {
			return player.getExpansions("ffshenpan_lvchang").length > 0;
		},
		async cost(event, trigger, player) {
			const lvchang = player.getExpansions("ffshenpan_lvchang");
			const target = trigger.player;
			const result = await player
				.chooseCardButton({
					cards: lvchang,
					select: 1,
					prompt: `是否对${get.translation(target)}发动【颂诗】？选择一张"律偿"牌交给其`,
					ai(button) {
						const att = get.attitude(player, target);
						if (att <= 0) return -100;
						return get.value(button.link, target);
					},
				})
				.forResult();
			event.result = {
				bool: result.bool && result.links?.length > 0,
				cost_data: { selectedCard: result.links?.[0], target },
			};
		},
		async content(event, trigger, player) {
			const { selectedCard, target } = event.cost_data;
			player.logSkill("ffsongshi", target);
			game.playSkillBgm("ffsongshi");
			const next = target.gain(selectedCard, player, "giveAuto");
			next.gaintag.add("ffsongshi_lvchang");
			target.addSkill("ffsongshi_effect");
			target.markAuto("ffsongshi_effect", [selectedCard.cardid]);
			target.markAuto("ffsongshi_source", [player]);
			await next;
			const topCard = get.cards(1)[0];
			topCard.classList.add("glory2");
			const next2 = player.addToExpansion(topCard, "gain2");
			next2.gaintag.add("ffshenpan_lvchang");
			await next2;
			player.markSkill("ffshenpan_lvchang");
		},
		subSkill: {
			lvchang: {
				charlotte: true,
				onremove: true,
				intro: {
					name: "律偿牌",
					content: "这是芙宁娜通过【颂诗】交给你的“律偿”牌",
				},
			},
			effect: {
				charlotte: true,
				trigger: {
					player: ["useCardAfter", "respondAfter"],
					source: "damageBegin1",
				},
				forced: true,
				popup: false,
				mod: {
					targetInRange(card, player, target) {
						if (card.cards?.some(cx => cx.hasGaintag("ffsongshi_lvchang"))) return true;
					},
					cardValue(card, player) {
						if (card.cards?.some(cx => cx.hasGaintag("ffsongshi_lvchang"))) return 8;
					},
				},
				filter(event, player, name) {
					let oriEvent = event;
					if (event.name === "damage") oriEvent = event.getParent("useCard");
					else if (event.name === "respond") oriEvent = event;
					if (!oriEvent?.card) return false;
					return player.getStorage("ffsongshi_effect").includes(oriEvent.card.cardid);
				},
				async content(event, trigger, player) {
					if (trigger.name === "damage") {
						trigger.num++;
					} else if (event.triggername === "useCardAfter" || event.triggername === "respondAfter") {
						await player.recover();
						const sources = player.getStorage("ffsongshi_source");
						if (sources?.length) {
							for (const sp of sources) {
								if (sp?.isAlive()) await sp.draw(2);
							}
						}
						await player.draw(2);
						player.removeSkill("ffsongshi_effect");
					}
				},
			},
			source: {
				charlotte: true,
				onremove: true,
			},
		},
	},
	ffguqi: {
		trigger: { player: "phaseZhunbeiBegin" },
		forced: true,
		filter(event, player) {
			return player.getExpansions("ffshenpan_lvchang").length > 0;
		},
		async content(event, trigger, player) {
			if (!player.getStorage("ffguqi_played", false)) {
				player.setStorage("ffguqi_played", true);
				const audio = new Audio("extension/奥特之星/assets/genshin/audio/skill/guqi.mp3");
				audio.play();
			}
			game.log(player, "发动了【孤泣】");
			while (true) {
				const lvchang = player.getExpansions("ffshenpan_lvchang");
				if (lvchang.length === 0) break;
				const card = lvchang[0];
				const canUse = player.hasUseTarget(card, null, true);
				if (canUse) {
					const useResult = await player
						.chooseUseTarget(card, "孤泣：使用" + get.translation(card), false, "nodistance")
						.set("addCount", false)
						.set("nouseLimit", true)
						.set("addDistance", false)
						.forResult();
					if (useResult.bool) {
						game.log(player, "使用了一张“律偿”牌");
					} else {
						await player.gain(card, "gain2");
						game.log(player, "获得了", card);
					}
				} else {
					await player.gain(card, "gain2");
					game.log(player, "获得了", card);
				}
			}
			game.log(player, "使用完所有“律偿”牌后死亡");
			await player.die();
		},
	},
	nwlthailang: {
		audio: ["ext:奥特之星/assets/genshin/audio/skill/hailang1", "ext:奥特之星/assets/genshin/audio/skill/hailang2", "ext:奥特之星/assets/genshin/audio/skill/hailang3"],
		trigger: { player: "useCard2" },
		filter(event, player) {
			const card = event.card;
			if (!card) return false;
			const type = get.type(card);
			if (type !== "basic" && type !== "trick") return false;
			return game.hasPlayer(current => {
				return !event.targets.includes(current) && lib.filter.targetEnabled2(card, player, current);
			});
		},
		async cost(event, trigger, player) {
			const halfMaxHp = Math.ceil(player.maxHp / 2);
			const needLoseHp = player.hp > halfMaxHp;
			const prompt = needLoseHp ? `失去1点体力，为${get.translation(trigger.card)}增加任意个目标` : `为${get.translation(trigger.card)}增加任意个目标`;
			const card = trigger.card;
			const name = card.name;
			const canTargetSelf = !(name === "sha" || name === "juedou" || name === "nanmanruqin" || name === "wanjianqifa");
			const availableTargets = game.filterPlayer(target => {
				if (trigger.targets.includes(target)) return false;
				if (!canTargetSelf && target === player) return false;
				return lib.filter.targetEnabled2(card, player, target);
			});
			const targetResult = await player
				.chooseTarget(get.prompt("nwlthailang"), prompt, [1, availableTargets.length], (cardx, player, target) => {
					const evt = get.event();
					if (evt.hailangTrigger.targets.includes(target)) return false;
					if (!evt.canTargetSelf && target === player) return false;
					return lib.filter.targetEnabled2(evt.hailangTrigger.card, player, target);
				})
				.set("hailangTrigger", trigger)
				.set("canTargetSelf", canTargetSelf)
				.set("ai", target => {
					const evt = get.event();
					const triggerCard = evt.hailangTrigger.card;
					const cardName = triggerCard.name;
					const att = get.attitude(player, target);
					if (cardName === "wuzhongshengyou" || cardName === "tao") {
						if (att > 0) return 10;
						return -1;
					}
					if (cardName === "shunshouqianyang" || cardName === "sha") {
						if (att < 0) return get.effect(target, triggerCard, player, player);
						return -1;
					}
					return get.effect(target, triggerCard, player, player);
				})
				.forResult();
			if (targetResult.bool && targetResult.targets?.length) {
				event.result = {
					bool: true,
					cost_data: { targets: targetResult.targets, needLoseHp },
				};
			}
		},
		async content(event, trigger, player) {
			const { targets, needLoseHp } = event.cost_data;
			if (needLoseHp) {
				await player.loseHp(1);
			}
			game.log(player, "为", trigger.card, "增加了", targets, "为目标");
			trigger.targets.addArray(targets);
		},
		ai: {
			expose: 0.2,
		},
		mod: {
			attackRange(player, num) {
				return num + 1;
			},
		},
	},
	nwltgongzheng: {
		audio: "ext:奥特之星/assets/genshin/audio/skill/gongzheng",
		forced: true,
		trigger: {
			global: "useCardAfter",
		},
		filter(event, player) {
			if (_status.currentPhase !== event.player) return false;
			const card = event.card;
			if (!card) return false;
			const color = get.color(card);
			const evt = event.getParent("phase");
			if (!evt || evt.player !== event.player) return false;
			return !event.player.hasHistory(
				"useCard",
				evtx => {
					return evtx !== event && get.color(evtx.card) === color && evtx.getParent("phase") === evt;
				},
				event
			);
		},
		async content(event, trigger, player) {
			const card = trigger.card;
			if (!card) return;
			const color = get.color(card);
			const cards = game.cardsGotoOrdering(get.cards(2)).cards;
			player.showCards(cards, `${get.translation(player)}发动了【公正】`);
			const sameColorCards = cards.filter(c => get.color(c) === color);
			const shownCardsStr = cards.map(c => get.translation(c)).join("、");
			const sameColorStr = sameColorCards.map(c => get.translation(c)).join("、");
			const promptStr = `<div class="text center">亮出了：${shownCardsStr}<br>相同颜色的牌：${sameColorStr || "无"}`;
			const otherCards = cards.filter(c => get.color(c) !== color);
			const usedCardSuit = get.suit(card);
			const hasSameSuit = cards.some(c => get.suit(c) === usedCardSuit);
			const hasTao = cards.some(c => c.name === "tao");
			const cardsValue = cards.reduce((sum, c) => sum + (get.value(c, player) ?? 0), 0);
			const sameColorValue = sameColorCards.reduce((sum, c) => sum + (get.value(c, player) ?? 0), 0);
			const result = await player
				.chooseControl(["其获得相同颜色的牌", "其受到1点伤害", "其回复1点体力"])
				.set("prompt", promptStr)
				.set("gongzhengTrigger", trigger)
				.set("gongzhengColor", color)
				.set("gongzhengCards", cards)
				.set("ai", () => {
					const evt = get.event();
					const target = evt.gongzhengTrigger.player;
					if (target === player) {
						return "其回复1点体力";
					}
					const att = get.attitude(player, target);
					if (att > 0) {
						if (target.isDamaged()) return "其回复1点体力";
						if (evt.cardsValue > 6) {
							if (Math.random() < 0.5) return "其受到1点伤害";
						}
						if (evt.sameColorCards.length > 0) return "其获得相同颜色的牌";
						return "其回复1点体力";
					} else {
						if (evt.sameColorCards.length === evt.gongzhengCards.length) return "其受到1点伤害";
						if (target.hp === 1) return "其受到1点伤害";
						if (target.hp === target.maxHp) return "其回复1点体力";
						if (target.hp < target.maxHp && !evt.hasSameSuit && evt.sameColorCards.length > 0 && evt.otherCards.length > 0) return "其获得相同颜色的牌";
						if (target.hp < target.maxHp && evt.hasTao) return "其回复1点体力";
						if (evt.sameColorCards.length > 0 && evt.otherCards.length > 0) {
							if (evt.sameColorValue > 5) return "其回复1点体力";
							return "其受到1点伤害";
						}
						if (evt.cardsValue > 5) {
							if (evt.sameColorCards.length > 0 && evt.otherCards.length > 0) return "其获得相同颜色的牌";
							return "其回复1点体力";
						}
						return "其受到1点伤害";
					}
				})
				.set("sameColorCards", sameColorCards)
				.set("otherCards", otherCards)
				.set("hasSameSuit", hasSameSuit)
				.set("hasTao", hasTao)
				.set("cardsValue", cardsValue)
				.set("sameColorValue", sameColorValue)
				.forResult();
			if (result.control === "其获得相同颜色的牌") {
				if (sameColorCards.length > 0) {
					await trigger.player.gain(sameColorCards, "gain2");
				}
				if (otherCards.length > 0) {
					await player.gain(otherCards, "gain2");
				}
			} else if (result.control === "其受到1点伤害") {
				await trigger.player.damage(1, null, null, "nocard");
				await trigger.player.gain(cards, "gain2");
			} else if (result.control === "其回复1点体力") {
				await trigger.player.recover(1);
				await player.gain(cards, "gain2");
			}
		},
	},
	nwltjuecai: {
		audio: ["ext:奥特之星/assets/genshin/audio/skill/juecai1", "ext:奥特之星/assets/genshin/audio/skill/juecai2", "ext:奥特之星/assets/genshin/audio/skill/juecai3"],
		enable: "phaseUse",
		usable: 1,
		direct: true,
		filter(event, player) {
			return player.countMark("nwltjuecai_chang") > 0 && !player.hasSkill("nwltjuecai_used");
		},
		async content(event, trigger, player) {
			const maxChang = player.countMark("nwltjuecai_chang");
			const result = await player
				.chooseControl(Array.from({ length: maxChang }, (_, i) => i + 1 + "个").concat("cancel2"))
				.set("prompt", "请选择要移去的“偿”标记数量")
				.set("ai", () => {
					const p = _status.event.player;
					return p.countMark("nwltjuecai_chang") + "个";
				})
				.forResult();
			if (!result.control || result.control === "cancel2") {
				delete player.getStat("skill").nwltjuecai;
				return;
			}
			const num = parseInt(result.control);
			player.removeMark("nwltjuecai_chang", num);
			player.logSkill("nwltjuecai");
			player.$skill("决裁", "legend", "water");
			const currentExtra = player.countMark("nwltjuecai_extra");
			player.addMark("nwltjuecai_extra", num);
			player.markSkill("nwltjuecai_extra");
			game.log(player, "下一张使用的牌额外结算" + (currentExtra + num) + "次");
			player.addTempSkill("nwltjuecai_used");
		},
		ai: {
			order: 7,
			result: {
				player(player) {
					return 1;
				},
			},
		},
		group: ["nwltjuecai_trigger", "nwltjuecai_effect"],
		subSkill: {
			chang: {
				mark: true,
				marktext: "偿",
				intro: {
					name: "偿",
					content: "mark",
				},
			},
			trigger: {
				trigger: { global: "phaseEnd" },
				forced: true,
				filter(event, player) {
					let count = 0;
					game.getGlobalHistory("cardMove", evt => {
						if (evt.name === "lose" && evt.position === ui.discardPile) {
							count += evt.cards?.length ?? 0;
						} else if (evt.name === "cardsDiscard") {
							count += evt.cards?.length ?? 0;
						}
					});
					return count >= 5;
				},
				async content(event, trigger, player) {
					player.addMark("nwltjuecai_chang", 1);
				},
			},
			effect: {
				trigger: { player: "useCardToTargeted" },
				filter(event, player) {
					return player.countMark("nwltjuecai_extra") > 0;
				},
				forced: true,
				async content(event, trigger, player) {
					const extra = player.countMark("nwltjuecai_extra");
					if (extra > 0) {
						player.removeMark("nwltjuecai_extra", extra);
						player.unmarkSkill("nwltjuecai_extra");
						game.log(player, "额外结算" + extra + "次");
						const useCardEvt = trigger.getParent("useCard");
						if (useCardEvt) {
							useCardEvt.effectCount = (useCardEvt.effectCount || 0) + extra;
						}
					}
				},
			},
			used: {
				charlotte: true,
			},
			extra: {
				charlotte: true,
				mark: true,
				marktext: "决",
				intro: {
					name: "决裁",
					content(storage, player) {
						const count = player.countMark("nwltjuecai_extra");
						if (count > 0) {
							return "下一张使用的牌额外结算" + count + "次";
						}
						return "";
					},
				},
			},
		},
	},
	alqnhuahui: {
		audio: ["ext:奥特之星/assets/genshin/audio/skill/huahui1", "ext:奥特之星/assets/genshin/audio/skill/huahui2", "ext:奥特之星/assets/genshin/audio/skill/huahui3"],
		trigger: { global: "roundStart" },
		frequent: true,
		locked: false,
		filter(event, player) {
			return game.hasPlayer(target => target !== player);
		},
		async cost(event, trigger, player) {
			const result = await player
				.chooseTarget({
					prompt: get.prompt("alqnhuahui"),
					selectTarget: [1, Infinity],
					filterTarget(card, player, target) {
						return target !== player;
					},
					ai(target) {
						return 1;
					},
				})
				.forResult();
			event.result = {
				bool: result.bool,
				targets: result.targets,
			};
		},
		async content(event, trigger, player) {
			if (!event.targets?.length) return;
			player.setStorage("alqnhuahui_huahuiUsed", true);
			const targetCount = event.targets.length;
			for (const target of event.targets) {
				target.addMark("alqnhuahui_xue", 1);
			}
			const roundGain = player.getStorage("alqnhuahui_roundGain", 0);
			const curMingqi = player.countMark("alqnhuahui_mingqi");
			const toGain = Math.min(targetCount, 3 - roundGain, 4 - curMingqi);
			if (toGain > 0) {
				player.addMark("alqnhuahui_mingqi", toGain);
				player.setStorage("alqnhuahui_roundGain", roundGain + toGain);
			}
		},
		group: ["alqnhuahui_xue", "alqnhuahui_gain", "alqnhuahui_roundreset", "alqnhuahui_roundend", "alqnhuahui_mingqi"],
		ai: {
			order: 1,
			result: {
				player(player) {
					return 1;
				},
			},
		},
		subSkill: {
			xue: {
				charlotte: true,
				mark: true,
				markcount(storage, player) {
					return player.countMark("alqnhuahui_xue");
				},
				marktext: "血",
				intro: {
					name: "血偿",
					content(storage, player) {
						const count = player.countMark("alqnhuahui_xue");
						if (count > 0) {
							return "你拥有" + count + "个“血偿”标记";
						}
						return "";
					},
				},
			},
			gain: {
				charlotte: true,
				trigger: { player: "useCardAfter" },
				forced: true,
				filter(event, player) {
					if (!event.targets) return false;
					return event.targets.some(target => target !== player && target.hasMark("alqnhuahui_xue"));
				},
				async content(event, trigger, player) {
				for (const target of trigger.targets) {
					target.removeMark("alqnhuahui_xue", 1);
						const roundGain = player.getStorage("alqnhuahui_roundGain", 0);
						const curMingqi = player.countMark("alqnhuahui_mingqi");
						if (roundGain < 3 && curMingqi < 4) {
							const toGain = Math.min(1, 3 - roundGain, 4 - curMingqi);
							if (toGain > 0) {
								player.addMark("alqnhuahui_mingqi", toGain);
								player.setStorage("alqnhuahui_roundGain", roundGain + toGain);
							}
						}
						await player.draw();
					}
				for (const target of trigger.targets) {
					if (target.countMark("alqnhuahui_xue") > 0) {
							target.markSkill("alqnhuahui_xue");
						} else {
							target.unmarkSkill("alqnhuahui_xue");
						}
					}
				},
			},
			roundreset: {
				charlotte: true,
				trigger: { global: "roundStart" },
				forced: true,
				silent: true,
				firstDo: true,
				async content(event, trigger, player) {
					player.setStorage("alqnhuahui_roundGain", 0);
				},
			},
			roundend: {
				charlotte: true,
				trigger: { global: "roundEnd" },
				forced: true,
				filter(event, player) {
					return game.hasPlayer(target => target.hasMark("alqnhuahui_xue"));
				},
				async content(event, trigger, player) {
					const allPlayers = game.filterPlayer();
					let xueCount = 0;
					for (const target of allPlayers) {
						if (target.hasMark("alqnhuahui_xue")) {
							const count = target.countMark("alqnhuahui_xue");
							xueCount += count;
							target.removeMark("alqnhuahui_xue", count);
						}
					}
					for (const target of allPlayers) {
						if (target.countMark("alqnhuahui_xue") > 0) {
							target.markSkill("alqnhuahui_xue");
						} else {
							target.unmarkSkill("alqnhuahui_xue");
						}
					}
					if (xueCount > 0) {
						await player.draw(xueCount);
					}
				},
			},
			mingqi: {
				charlotte: true,
				mark: true,
				markcount(storage, player) {
					return player.countMark("alqnhuahui_mingqi");
				},
				marktext: "契",
				intro: {
					name: "命契",
					content(storage, player) {
						const count = player.countMark("alqnhuahui_mingqi");
						if (count > 0) {
							return "你拥有" + count + "个“命契”标记";
						}
						return "";
					},
				},
			},
		},
	},
	alqnzhanshou: {
		charlotte: true,
		targetprompt2(target) {
			const player = get.player();
			if (target !== player && target.hasMark("alqnhuahui_xue")) {
				return "不可响应";
			}
		},
		onChooseToUse(event) {
			event.targetprompt2.add(lib.skill.alqnzhanshou.targetprompt2);
		},
		onChooseTarget(event) {
			event.targetprompt2.add(lib.skill.alqnzhanshou.targetprompt2);
		},
		forced: true,
		trigger: { player: "useCard" },
		filter(event, player) {
			if (!event.card) return false;
			if (!event.targets?.length) return false;
			return event.targets.some(target => target !== player && target.hasMark("alqnhuahui_xue"));
		},
		async content(event, trigger, player) {
			trigger.directHit.addArray(game.filterPlayer(current => current !== player && current.hasMark("alqnhuahui_xue")));
		},
		ai: {
			directHit_ai: true,
			skillTagFilter(player, tag, arg) {
				if (arg?.target?.hasMark("alqnhuahui_xue")) return true;
				return false;
			},
		},
		group: ["alqnzhanshou_damage"],
		subSkill: {
			damage: {
				charlotte: true,
				audio: ["ext:奥特之星/assets/genshin/audio/skill/zhanshou1", "ext:奥特之星/assets/genshin/audio/skill/zhanshou2"],
				trigger: { source: "damageBegin1" },
				filter(event, player) {
					if (event.source !== player) return false;
					if (get.attitude(player, event.player) >= 0) return false;
					return player.countMark("alqnhuahui_mingqi") > 0;
				},
				check(event, player) {
					return get.attitude(player, event.player) < 0 && player.countMark("alqnhuahui_mingqi") > 0;
				},
				direct: true,
				locked: false,
				async content(event, trigger, player) {
					const x = player.countMark("alqnhuahui_mingqi");
					const boolResult = await player
						.chooseBool("斩首：是否令此次伤害+" + x + "并改为火焰伤害，弃置一枚“命契”？")
						.set("ai", () => get.attitude(player, trigger.player) < 0)
						.forResult();
					if (boolResult.bool) {
						trigger.num += x;
						game.setNature(trigger, "fire");
						player.removeMark("alqnhuahui_mingqi", 1);
						if (player.countMark("alqnhuahui_mingqi") === 0) {
							player.unmarkSkill("alqnhuahui_mingqi");
						}
						player.logSkill("alqnzhanshou_damage");
					}
				},
				ai: {
					expose: 0.2,
				},
			},
		},
	},
	alqneyue: {
		audio: ["ext:奥特之星/assets/genshin/audio/skill/eyue1", "ext:奥特之星/assets/genshin/audio/skill/eyue2", "ext:奥特之星/assets/genshin/audio/skill/eyue3"],
		enable: "chooseToUse",
		skillAnimation: true,
		group: ["alqneyue_roundreset", "alqneyue_norecover"],
		filter(event, player) {
			if (player.getStorage("alqneyue_used", false)) return false;
			if (player.countMark("alqnhuahui_mingqi") === 0) return false;
			if (event.type === "dying") {
				return player === event.dying;
			}
			if (_status.currentPhase === player && event.name === "chooseToUse") {
				if (event.respondTo) return false;
				return true;
			}
			return false;
		},
		async content(event, trigger, player) {
			const n = player.countMark("alqnhuahui_mingqi");
			player.removeMark("alqnhuahui_mingqi", n);
			if (player.countMark("alqnhuahui_mingqi") === 0) {
				player.unmarkSkill("alqnhuahui_mingqi");
			}
			await player.draw(n);
			player.removeSkill("alqneyue_norecover");
			await player.recover(n + 1);
			player.addSkill("alqneyue_norecover");
			player.setStorage("alqnhuahui_roundGain", 0);
			if (player.getStorage("alqnhuahui_huahuiUsed", false)) {
				player.setStorage("alqnhuahui_huahuiUsed", false);
				const stat = player.getStat("skill");
				if (stat.alqnhuahui !== undefined) {
					delete stat.alqnhuahui;
				}
			}
			player.setStorage("alqneyue_used", true);
		},
		ai: {
			order: 3,
			save: true,
			result: {
				player(player) {
					if (player.getHp() <= 0) return 13;
					const lostHp = player.maxHp - player.getHp();
					const handCount = player.countCards("h");
					if (lostHp >= 2 || handCount <= 1) {
						return 1;
					} else return 0;
				},
			},
		},
		subSkill: {
			roundreset: {
				charlotte: true,
				trigger: { global: "roundStart" },
				forced: true,
				silent: true,
				filter(event, player) {
					return player.getStorage("alqneyue_used", false);
				},
				async content(event, trigger, player) {
					player.setStorage("alqneyue_used", false);
				},
			},
			norecover: {
				charlotte: true,
				mark: true,
				intro: { content: "不能通过【厄月】外的途径回复体力" },
				trigger: { player: "recoverBefore" },
				forced: true,
				firstDo: true,
				check(event, player) {
					return false;
				},
				async content(event, trigger, player) {
					trigger.cancel();
				},
				ai: {
					effect: {
						target(card, player, target) {
							if (get.tag(card, "recover")) {
								return "zeroplayertarget";
							}
						},
					},
				},
			},
		},
	},
	skkjimie: {
		forced: true,
		locked: false,
		trigger: { player: "phaseUseBegin" },
		async content(event, trigger, player) {
			let currentMarks = player.countMark("skkjimie_liexi");
			const toAdd = Math.min(5, 10 - currentMarks);
			if (toAdd > 0) {
				player.addMark("skkjimie_liexi", toAdd);
				player.markSkill("skkjimie_liexi");
				currentMarks += toAdd;
			}
			const x = currentMarks;
			const y = Math.ceil(currentMarks / 2);
			const choiceList = ["极恶技·闪：你使用前" + x + "张牌无次数限制", "极恶技·灭：对一名角色造成" + y + "点伤害并摸" + x + "张牌"];
			const controlResult = await player
				.chooseControl("极恶技·闪", "极恶技·灭", "取消", () => {
					const liexi = player.countMark("skkjimie_liexi");
					const hasEnemyOutOfRange = game.hasPlayer(target => {
						return target != player && get.attitude(player, target) < 0 && !player.inRange(target);
					});
					if (hasEnemyOutOfRange && liexi > 0) return "极恶技·灭";
					if (liexi > 0) return "极恶技·闪";
					return "取消";
				})
				.set("choiceList", choiceList)
				.set("prompt", "寂灭：请选择一项")
				.forResult();
			if (controlResult.control === "极恶技·闪") {
				player.setStorage("skkjimie_choice", "shan");
				player.logSkill("skkjimie");
				game.log(player, "选择了【极恶技·闪】");
			} else if (controlResult.control === "极恶技·灭") {
				player.$skill("极恶技·灭", "legend", "ice");
				player.setStorage("skkjimie_choice", "mie");
				player.logSkill("skkjimie");
				game.log(player, "选择了【极恶技·灭】");
			} else {
				return;
			}
			const choice = player.getStorage("skkjimie_choice");
			if (choice === "mie") {
				game.playAudio("..", "extension", "奥特之星", "assets/genshin/audio/skill/jiejimie" + (Math.floor(Math.random() * 3) + 1));
				const mieCount = player.countMark("skkjimie_liexi");
				if (mieCount > 0) {
					player.removeMark("skkjimie_liexi", mieCount);
					const damage = Math.ceil(mieCount / 2);
					if (damage > 0) {
						const targetResult = await player
							.chooseTarget(true, "选择一名其他角色造成" + damage + "点伤害", (card, player, target) => {
								return target != player;
							})
							.set("ai", target => get.damageEffect(target, player, player))
							.forResult();
						await player.draw(mieCount);
						if (targetResult.targets?.length > 0) {
							const target = targetResult.targets[0];
							await target.damage(damage);
							game.log(player, "对", target, "造成了", damage, "点伤害");
						}
					}
				}
			}
			if (player.countMark("skkjimie_liexi") <= 0) {
				player.unmarkSkill("skkjimie_liexi");
			} else {
				player.markSkill("skkjimie_liexi");
			}
		},
		group: ["skkjimie_jieshan", "skkjimie_reset"],
		ai: {
			order: 1,
			result: {
				player(player) {
					return 1;
				},
			},
		},
		subSkill: {
			jieshan: {
				audio: ["ext:奥特之星/assets/genshin/audio/skill/jiejishan1", "ext:奥特之星/assets/genshin/audio/skill/jiejishan2", "ext:奥特之星/assets/genshin/audio/skill/jiejishan3", "ext:奥特之星/assets/genshin/audio/skill/jiejishan4", "ext:奥特之星/assets/genshin/audio/skill/jiejishan5"],
				charlotte: true,
				trigger: { player: "useCardAfter" },
				firstDo: true,
				filter(event, player) {
					return player.getStorage("skkjimie_choice") === "shan" && player.countMark("skkjimie_liexi") > 0;
				},
				forced: true,
				silent: false,
				async content(event, trigger, player) {
					await player.draw(2);
					player.removeMark("skkjimie_liexi", 1);
					if (player.countMark("skkjimie_liexi") <= 0) {
						player.unmarkSkill("skkjimie_liexi");
						player.setStorage("skkjimie_choice", null);
					} else {
						player.markSkill("skkjimie_liexi");
					}
				},
				mod: {
					cardUsable(card, player, num) {
						if (player.getStorage("skkjimie_choice") === "shan" && player.countMark("skkjimie_liexi") > 0) {
							return Infinity;
						}
					},
				},
			},
			reset: {
				charlotte: true,
				trigger: { player: "phaseEnd" },
				forced: true,
				silent: true,
				async content(event, trigger, player) {
					const choice = player.getStorage("skkjimie_choice");
					if (choice === "shan") {
						player.setStorage("skkjimie_choice", null);
						if (player.countMark("skkjimie_liexi") <= 0) {
							player.unmarkSkill("skkjimie_liexi");
						}
					}
				},
			},
			liexi: {
				charlotte: true,
				mark: true,
				marktext: "隙",
				markcount(storage, player) {
					return player.countMark("skkjimie_liexi");
				},
				intro: {
					name: "裂隙",
					content(storage, player) {
						const count = player.countMark("skkjimie_liexi");
						if (count > 0) {
							return "你拥有" + count + "枚“裂隙”标记";
						}
						return "";
					},
				},
				onremove(player) {
					player.setStorage("skkjimie_choice", undefined);
					player.setStorage("skkduduan_roundGain", undefined);
				},
			},
		},
	},
	skkduduan: {
		audio: ["ext:奥特之星/assets/genshin/audio/skill/duduan1", "ext:奥特之星/assets/genshin/audio/skill/duduan2"],
		forced: true,
		locked: false,
		trigger: { global: "useCardAfter" },
		filter(event, player) {
			const roundGain = player.getStorage("skkduduan_roundGain", 0);
			if (roundGain >= 3) return false;
			if (player.countMark("skkjimie_liexi") >= 10) return false;
			if (!event.targets?.length) return false;
			const targets = event.targets.filter(target => target != player && target != event.player);
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
			let roundGain = player.getStorage("skkduduan_roundGain", 0);
			const targets = trigger.targets.filter(target => target != player && target != trigger.player);
			let unresponsedCount = 0;
			for (const target of targets) {
				const hasResponded = target.hasHistory("useCard", evt => {
					return evt.respondTo && evt.respondTo[1] === trigger.card;
				});
				const hasResponded2 = target.hasHistory("respond", evt => {
					return evt.respondTo && evt.respondTo[1] === trigger.card;
				});
				if (!hasResponded && !hasResponded2) {
					unresponsedCount++;
				}
			}
			for (let i = 0; i < unresponsedCount; i++) {
				if (roundGain < 3) {
					const currentMarks = player.countMark("skkjimie_liexi");
					if (currentMarks < 10) {
						player.addMark("skkjimie_liexi", 1);
						roundGain++;
						player.setStorage("skkduduan_roundGain", roundGain);
						player.markSkill("skkjimie_liexi");
					} else {
						break;
					}
				} else {
					break;
				}
			}
		},
		group: ["skkduduan_reset"],
		subSkill: {
			reset: {
				charlotte: true,
				trigger: { global: "phaseAfter" },
				forced: true,
				silent: true,
				async content(event, trigger, player) {
					const roundGain = player.getStorage("skkduduan_roundGain", 0);
					if (roundGain > 0) {
						player.setStorage("skkduduan_roundGain", 0);
					}
				},
			},
		},
	},
	ffshalong: {
		enable: "phaseUse",
		usable: 2,
		zhuanhuanji: true,
		mark: true,
		marktext: "☯",
		prompt(event, player) {
			const isMang = player.storage.ffshalong;
			if (isMang) {
				return "芒：令所有“沙龙成员”回复体力";
			}
			return "荒：令所有“沙龙成员”崩血";
		},
		intro: {
			content(storage) {
				return storage ? "芒：令所有“沙龙成员”回复一点体力" : "荒：令所有“沙龙成员”崩血";
			},
		},
		filter(event, player) {
			return player.countMark("ffkuanghuan_member") > 0;
		},
		async content(event, trigger, player) {
			const isHuang = !player.storage.ffshalong;
			if (isHuang) {
				game.playAudio("..", "extension", "奥特之星", "assets/genshin/audio/skill/shalong" + (Math.floor(Math.random() * 3) + 1));
				const members = game.filterPlayer(p => p.countMark("ffkuanghuan_member") > 0);
				const targets = members.filter(m => m.hp > Math.ceil(m.maxHp / 2));
				event.targets = targets;
				if (targets.length > 0) {
					for (const target of targets) {
						await target.loseHp();
					}
				}
				const result = await player
					.chooseTarget(true, "沙龙：选择一张【杀】的目标")
					.set("filterTarget", (card, player, target) => player !== target && lib.filter.targetEnabled({ name: "sha" }, player, target))
					.set("ai", target => get.effect(target, { name: "sha" }, player, player))
					.forResult();
				if (result.bool && result.targets?.length > 0) {
					const next = player.useCard({ name: "sha", isCard: false }, result.targets[0], false);
					next.addCount = false;
					game.log(player, "视为对", result.targets[0], "使用了一张【杀】");
					await next;
				}
			} else {
				game.playAudio("..", "extension", "奥特之星", "assets/genshin/audio/skill/shalong" + (Math.floor(Math.random() * 3) + 4));
				const members = game.filterPlayer(p => p.countMark("ffkuanghuan_member") > 0);
				for (const member of members) {
					await member.recover(1);
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
		group: ["ffshalong_change"],
		subSkill: {
			change: {
				trigger: { player: "phaseBegin" },
				direct: true,
				async content(event, trigger, player) {
					const state = player.storage.ffshalong ? "芒" : "荒";
					const result = await player
						.chooseControl("转换", "不转换")
						.set("prompt", "沙龙：当前状态为【" + state + "】，是否转换？")
						.set("ai", () => {
							const player = get.player();
							const isMang = !!player.storage.ffshalong;
							const members = game.filterPlayer(p => p.countMark("ffkuanghuan_member") > 0 && p.isIn());
							const hasDamagedMember = members.some(m => m.maxHp - m.hp >= 2);
							if (hasDamagedMember) {
								return isMang ? "不转换" : "转换";
							} else {
								return isMang ? "转换" : "不转换";
							}
						})
						.forResult();
					if (result.control === "转换") {
						player.changeZhuanhuanji("ffshalong");
						game.log(player, "将沙龙状态转换为【" + (player.storage.ffshalong ? "芒" : "荒") + "】");
					}
				},
			},
		},
	},
	ffyuanwu: {
		audio: ["ext:奥特之星/assets/genshin/audio/skill/yuanwu1", "ext:奥特之星/assets/genshin/audio/skill/yuanwu2"],
		group: ["ffyuanwu_huang", "ffyuanwu_mang", "ffyuanwu_mang_damage"],
		subSkill: {
			huang: {
				audio: "ffyuanwu",
				trigger: { source: "damageAfter" },
				filter(event, player) {
					return !player.storage.ffshalong;
				},
				async content(event, trigger, player) {
					const members = game.filterPlayer(p => p.countMark("ffkuanghuan_member") > 0);
					for (const member of members) {
						await member.recover();
					}
				},
			},
			mang: {
				audio: "ffyuanwu",
				trigger: { player: "recoverAfter" },
				filter(event, player) {
					return player.storage.ffshalong;
				},
				check(event, player) {
					const members = game.filterPlayer(m => m.countMark("ffkuanghuan_member") > 0);
					return members.every(m => m.hp > 1);
				},
				async content(event, trigger, player) {
					const result = await player
						.chooseTarget(true, "圆舞：选择一张【杀】的目标")
						.set("filterTarget", (card, player, target) => player !== target)
						.set("ai", target => get.effect(target, { name: "sha" }, player, player))
						.forResult();
					if (result.bool && result.targets?.length > 0) {
						const card = { name: "sha", isVirtual: true };
						card._ffyuanwu_mang_sha = true;
						const next = player.useCard(card, result.targets[0], "noai");
						next.addCount = false;
						game.log(player, "视为对", result.targets[0], "使用了一张【杀】");
						await next;
					}
				},
			},
			mang_damage: {
				trigger: { source: "damageAfter" },
				filter(event, player) {
					return event.card && event.card._ffyuanwu_mang_sha;
				},
				forced: true,
				async content(event, trigger, player) {
					const members = game.filterPlayer(m => m.countMark("ffkuanghuan_member") > 0);
					for (const member of members) {
						await member.loseHp();
					}
				},
			},
		},
	},
	ffkuanghuan: {
		audio: ["ext:奥特之星/assets/genshin/audio/skill/kuanghuan1", "ext:奥特之星/assets/genshin/audio/skill/kuanghuan2", "ext:奥特之星/assets/genshin/audio/skill/kuanghuan3"],
		trigger: {
			global: ["gameStart", "roundStart"],
		},
		forced: true,
		locked: false,
		async content(event, trigger, player) {
			const name = event.triggername;
			if (name === "gameStart") {
				player.setStorage("ffkuanghuan_round", 1);
				const list = game.filterPlayer();
				const result = await player
					.chooseTarget("狂欢：选择任意名角色获得“沙龙成员”标记", [1, list.length], true)
					.set("ai", target => {
						const role = player.role;
						if (role === "zhu") {
							if (target !== player) return Math.random();
							return 0;
						} else if (role === "zhong" || role === "nei") {
							const lord = game.findPlayer(p => p.role === "zhu");
							if (target === lord) return 2;
							if (target !== player) return Math.random();
							return 0;
						} else if (role === "fan") {
							const lord = game.findPlayer(p => p.role === "zhu");
							if (target !== lord && target !== player) return Math.random();
							return 0;
						}
						return get.attitude(player, target) > 0 ? 1 : 0;
					})
					.forResult();
				if (result.bool && result.targets?.length > 0) {
					let hasSelf = false;
					for (const target of result.targets) {
						target.addMark("ffkuanghuan_member", 1);
						target.addSkill("ffkuanghuan_effect_skill");
						if (target === player) hasSelf = true;
					}
					if (!hasSelf) {
						player.addMark("ffkuanghuan_member", 1);
						player.addSkill("ffkuanghuan_effect_skill");
					}
				}
			} else if (name === "roundStart") {
				const qifenCount = player.countMark("ffkuanghuan_qifen");
				const effectCount = player.countMark("ffkuanghuan_effect");
				if (qifenCount > 0) player.removeMark("ffkuanghuan_qifen", qifenCount);
				if (effectCount > 0) player.removeMark("ffkuanghuan_effect", effectCount);
				if (player.getStorage("ffkuanghuan_round", 1) >= 2) {
					player.setStorage("ffkuanghuan_round", player.getStorage("ffkuanghuan_round", 1) + 1);
				}
			}
		},
		group: ["ffkuanghuan_changehp"],
		subSkill: {
			changehp: {
				trigger: { global: "changeHp" },
				filter(event, player) {
					return event.player?.countMark("ffkuanghuan_member") > 0;
				},
				forced: true,
				async content(event, trigger, player) {
					const num = Math.abs(trigger.num ?? 1);
					player.addMark("ffkuanghuan_qifen", num);
					if (!player.hasMark("ffkuanghuan_effect")) player.addMark("ffkuanghuan_effect", 1);
				},
			},
			member: {
				marktext: "沙",
				mark: true,
				intro: {
					name: "沙龙成员",
					content: "已成为沙龙成员",
				},
			},
			effect_skill: {
				mod: {
					targetInRange(card, player, target) {
						const ffn = game.findPlayer(p => p.hasSkill("ffkuanghuan"));
						if (ffn && ffn.countMark("ffkuanghuan_qifen") >= 4) return true;
					},
					cardUsable(card, player, num) {
						if (card.name === "sha") {
							const ffn = game.findPlayer(p => p.hasSkill("ffkuanghuan"));
							if (ffn && ffn.countMark("ffkuanghuan_qifen") >= 8) return num + 1;
						}
					},
				},
				trigger: { source: "damageBegin1" },
				filter(event, player) {
					const ffn = game.findPlayer(p => p.hasSkill("ffkuanghuan"));
					return ffn && ffn.countMark("ffkuanghuan_qifen") >= 12;
				},
				forced: true,
				async content(event, trigger, player) {
					trigger.num++;
				},
			},
			qifen: {
				marktext: "氛",
				mark: true,
				intro: {
					name: "气氛",
					content: "气氛标记数量：#",
				},
			},
			effect: {
				marktext: "欢",
				mark: true,
				intro: {
					name: "狂欢效果",
					content(storage, player) {
						const ffn = game.findPlayer(p => p.hasSkill("ffkuanghuan"));
						if (!ffn) return "无效果";
						const qifen = ffn.countMark("ffkuanghuan_qifen");
						let str = "";
						if (qifen >= 4) str += "使用牌无距离限制<br>";
						if (qifen >= 8) str += "使用【杀】次数上限+1<br>";
						if (qifen >= 12) str += "造成的伤害+1<br>";
						if (str === "") str = "暂无效果";
						return str;
					},
				},
			},
		},
	},
	qsklingjiang: {
		audio: ["ext:奥特之星/assets/genshin/audio/skill/lingjiang1", "ext:奥特之星/assets/genshin/audio/skill/lingjiang2"],
		trigger: { global: "phaseBegin" },
		forced: true,
		locked: false,
		filter(event, player) {
			const records = player.getStorage("qsklingjiang_records", []);
			return records.length < 6;
		},
		async content(event, trigger, player) {
			const records = player.getStorage("qsklingjiang_records", []);
			const cardPool = ["sha", "shan", "tao", "jiu", "juedou", "huogong", "nanman", "wanjian", "guohe", "shunshou", "wuzhong", "wuxie", "taoyuan", "wugu", "tiesuo", "jiedao"];
			while (records.length < 6 && cardPool.length > 0) {
				const randomIndex = Math.floor(Math.random() * cardPool.length);
				records.push(cardPool[randomIndex]);
				cardPool.splice(randomIndex, 1);
			}
			player.setStorage("qsklingjiang_records", records);
			player.markSkill("qsklingjiang");
		},
		mark: true,
		marktext: "影",
		intro: {
			name: "追影",
			markcount(storage, player) {
				return player.getStorage("qsklingjiang_records", []).length;
			},
			mark(dialog, storage, player) {
				const records = player.getStorage("qsklingjiang_records", []);
				if (records.length > 0) {
					dialog.addText("已记录：" + records.map(r => get.translation(r)).join("、"));
				} else {
					dialog.addText("暂无记录");
				}
			},
		},
		group: ["qsklingjiang_use", "qsklingjiang_refill"],
		subSkill: {
			refill: {
				trigger: { player: "qsklingjiang_recordEmpty" },
				forced: true,
				filter(event, player) {
					return player.getStorage("qsklingjiang_records", []).length === 0;
				},
				async content(event, trigger, player) {
					const records = [];
					const cardPool = ["sha", "shan", "tao", "jiu", "juedou", "huogong", "nanman", "wanjian", "guohe", "shunshou", "wuzhong", "wuxie", "taoyuan", "wugu", "tiesuo", "jiedao"];
					while (records.length < 6 && cardPool.length > 0) {
						const randomIndex = Math.floor(Math.random() * cardPool.length);
						records.push(cardPool[randomIndex]);
						cardPool.splice(randomIndex, 1);
					}
					player.setStorage("qsklingjiang_records", records);
					player.markSkill("qsklingjiang");
				},
			},
			use: {
				enable: ["phaseUse", "chooseToUse", "chooseToRespond"],
				hiddenCard(player, name) {
					return player.getStorage("qsklingjiang_records", []).includes(name);
				},
				filter(event, player) {
					const records = player.getStorage("qsklingjiang_records", []);
					if (records.length === 0) return false;
					for (const cardName of records) {
						const card = { name: cardName, isCard: true };
						if (event.name === "phaseUse") {
							if (player.hasUseTarget(card)) return true;
						} else if (event.filterCard?.(card, player, event)) {
							return true;
						}
					}
					return false;
				},
				chooseButton: {
					dialog(event, player) {
						const records = player.getStorage("qsklingjiang_records", []);
						const list = [];
						const added = {};
						for (const cardName of records) {
							if (added[cardName]) continue;
							const card = { name: cardName, isCard: true };
							let canUse = false;
							if (event.name === "phaseUse") {
								canUse = player.hasUseTarget(card);
							} else if (event.filterCard) {
								canUse = event.filterCard(card, player, event);
							}
							if (canUse) {
								list.push(["", "", cardName]);
								added[cardName] = true;
							}
						}
						return ui.create.dialog("灵缰：选择要使用的牌", [list, "vcard"]);
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
						const cardName = button.link[2];
						if (evt?.name === "chooseToRespond" || evt?.name === "chooseToUse") {
							if (evt.type === "dying") {
								const attitude = get.attitude(player, evt.dying);
								if (attitude <= 0) return -10;
								return 5 + attitude;
							}
							return 1;
						}
						return player.getUseValue({ name: cardName });
					},
					backup(links, player) {
						const cardName = links[0][2];
						const evt = get.event().getParent();
						const isSave = evt.name !== "phaseUse" && cardName === "tao";
						const isRespondOnly = evt.name === "chooseToRespond";
						return {
							audio: ["ext:奥特之星/assets/genshin/audio/skill/lingjiang1", "ext:奥特之星/assets/genshin/audio/skill/lingjiang2"],
							filterCard: () => false,
							selectCard: -1,
							selectTarget: isSave || isRespondOnly ? -1 : undefined,
							cardName: cardName,
							viewAs: { name: cardName },
							popname: true,
							async onuse(result, player) {
								const name = lib.skill.qsklingjiang_use_backup.cardName;
								const records = player.getStorage("qsklingjiang_records", []);
								const idx = records.indexOf(name);
								if (idx > -1) {
									records.splice(idx, 1);
									player.setStorage("qsklingjiang_records", records);
									player.markSkill("qsklingjiang");
									if (records.length === 0) {
										const next = game.createEvent("qsklingjiang_recordEmpty", false);
										next.player = player;
										next.setContent("emptyEvent");
									}
								}
							},
							async onrespond(result, player) {
								const name = lib.skill.qsklingjiang_use_backup.cardName;
								const records = player.getStorage("qsklingjiang_records", []);
								const idx = records.indexOf(name);
								if (idx > -1) {
									records.splice(idx, 1);
									player.setStorage("qsklingjiang_records", records);
									player.markSkill("qsklingjiang");
									if (records.length === 0) {
										const next = game.createEvent("qsklingjiang_recordEmpty", false);
										next.player = player;
										next.setContent("emptyEvent");
									}
								}
							},
						};
					},
					prompt(links, player) {
						const cardName = links[0][2];
						if (cardName === "sha") return "选择杀的目标";
						return "选择" + get.translation(cardName) + "的目标";
					},
				},
				ai: {
					order: 12,
					result: {
						player: 1,
						target(player, target) {
							const evt = get.event();
							if (evt.dying && evt.dying === target) return get.attitude(player, target) > 0 ? 5 : -10;
							return 0;
						},
					},
					respondShan: true,
					respondWuxie: true,
					save: true,
					skillTagFilter(player, tag, arg) {
						const records = player.getStorage("qsklingjiang_records", []);
						const nameMap = { respondShan: "shan", respondWuxie: "wuxie", save: "tao" };
						const name = nameMap[tag];
						if (!name) return false;
						if (!records.includes(name)) return false;
						const evt = get.event();
						if (!evt) return false;
						if (evt.filterCard) {
							const card = { name: name, isCard: true };
							if (!evt.filterCard(card, player, evt)) return false;
						}
						if (tag === "save" && !evt.dying) return false;
						return true;
					},
				},
			},
		},
	},
	qsksuohun: {
		usable: 1,
		enable: "phaseUse",
		filter(event, player) {
			const records = player.getStorage("qsklingjiang_records", []);
			if (records.length === 0) return false;
			if (event.type === "phase") {
				if (player.hasUseTarget({ name: "sha" })) return true;
				return lib.inpile_nature.some(nature => player.hasUseTarget({ name: "sha", nature }));
			}
			const card = { name: "sha", isCard: true };
			if (event.filterCard?.(card, player, event)) return true;
			return lib.inpile_nature.some(nature => {
				const natureCard = { name: "sha", nature, isCard: true };
				return event.filterCard?.(natureCard, player, event) ?? false;
			});
		},
		chooseButton: {
			dialog(event, player) {
				const list = [];
				if (event.type === "phase") {
					if (player.hasUseTarget({ name: "sha" })) {
						list.push(["基本", "", "sha"]);
					}
					for (const nature of lib.inpile_nature) {
						if (player.hasUseTarget({ name: "sha", nature })) {
							list.push(["基本", "", "sha", nature]);
						}
					}
				} else {
					const card = { name: "sha", isCard: true };
					if (event.filterCard?.(card, player, event)) {
						list.push(["基本", "", "sha"]);
					}
					for (const nature of lib.inpile_nature) {
						const natureCard = { name: "sha", nature, isCard: true };
						if (event.filterCard?.(natureCard, player, event)) {
							list.push(["基本", "", "sha", nature]);
						}
					}
				}
				return ui.create.dialog("索魂：选择【杀】的类型", [list, "vcard"]);
			},
			filter(button, player) {
				const evt = get.event().getParent();
				const nature = button.link[3];
				if (evt.type === "phase") {
					return nature ? player.hasUseTarget({ name: "sha", nature }) : player.hasUseTarget({ name: "sha" });
				}
				const card = nature ? { name: "sha", nature, isCard: true } : { name: "sha", isCard: true };
				return evt.filterCard?.(card, player, evt) ?? false;
			},
			check(button) {
				const nature = button.link[3];
				if (nature === "fire") return 2.95;
				if (nature === "thunder" || nature === "ice") return 2.92;
				return 2.9;
			},
			backup(links, player) {
				const nature = links[0][3];
				player.addTempSkill("qsksuohun_no_distance");
				player.setStorage("_qsksuohun_no_distance", true);
				return {
					audio: ["ext:奥特之星/assets/genshin/audio/skill/suohun1", "ext:奥特之星/assets/genshin/audio/skill/suohun2"],
					filterCard: () => false,
					selectCard: -1,
					viewAs: nature ? { name: "sha", nature } : { name: "sha" },
					async onuse(result, player) {
						player.setStorage("qsklingjiang_records", []);
						player.markSkill("qsklingjiang");
						player.setStorage("_qsksuohun_no_distance", false);
						player.removeSkill("qsksuohun_no_distance");
						const next = game.createEvent("qsklingjiang_recordEmpty", false);
						next.player = player;
						next.setContent("emptyEvent");
					},
				};
			},
			prompt(links, player) {
				const nature = links[0][3];
				const shaName = nature ? "【" + get.translation(nature) + "杀】" : "【杀】";
				return "选择" + shaName + "的目标";
			},
		},
		ai: {
			order: 4,
			result: {
				player(player) {
					return 1;
				},
			},
			combo: "qsklingjiang",
		},
		subSkill: {
			no_distance: {
				charlotte: true,
				mod: {
					cardUsable(card, player) {
						if (card.name === "sha" && player.getStorage("_qsksuohun_no_distance", false)) {
							return Infinity;
						}
					},
					targetInRange(card, player, target) {
						if (card.name === "sha" && player.getStorage("_qsksuohun_no_distance", false)) {
							return true;
						}
					},
				},
			},
		},
	},
	mwkzhihuo: {
		audio: ["ext:奥特之星/assets/genshin/audio/skill/zhihuo1", "ext:奥特之星/assets/genshin/audio/skill/zhihuo2", "ext:奥特之星/assets/genshin/audio/skill/zhihuo3"],
		direct: true,
		mod: {
			cardnature(card, player) {
				if (card.name === "sha" && !card.nature) return "fire";
			},
		},
		trigger: { player: "useCardToTargeted" },
		filter(event, player) {
			if (event.player !== player) return false;
			if (!event.card || event.card.name !== "sha") return false;
			if (!event.card.nature || event.card.nature !== "fire") return false;
			if (!event.isFirstTarget) return false;
			return true;
		},
		getPath(player, target) {
			const left = [];
			const right = [];
			let left2 = player;
			let right2 = player;
			while (!(left2 === target && right2 === target)) {
				if (left2 !== target) {
					left2 = left2.getPrevious();
					if (left2.isIn() && left2 !== target) left.push(left2);
				}
				if (right2 !== target) {
					right2 = right2.getNext();
					if (right2.isIn() && right2 !== target) right.push(right2);
				}
			}
			return [left, right];
		},
		async content(event, trigger, player) {
			const target = trigger.targets[0];
			const list = [];
			const otherPlayers = game.filterPlayer(p => p !== player && p.isIn());
			const unlinkedPlayers = otherPlayers.filter(p => !p.isLinked());
			if (unlinkedPlayers.length > 0) {
				list.push(["option2", "令任意名其他角色进入连环状态"]);
			}
			const noFireDebuffEnemies = otherPlayers.filter(p => !p.hasSkill("mwkzhihuo_firedebuff"));
			if (noFireDebuffEnemies.length > 0) {
				list.push(["option3", "令任意名其他角色本回合受到的火焰伤害+1"]);
			}
			const path = lib.skill.mwkzhihuo.getPath(player, target);
			const leftTarget = path[0].length > 0 ? path[0][path[0].length - 1] : null;
			const rightTarget = path[1].length > 0 ? path[1][path[1].length - 1] : null;
			const canAddLeft = leftTarget && leftTarget !== player && lib.filter.targetEnabled2({ name: "sha", nature: "fire" }, player, leftTarget);
			const canAddRight = rightTarget && rightTarget !== player && lib.filter.targetEnabled2({ name: "sha", nature: "fire" }, player, rightTarget);
			if (canAddLeft || canAddRight) {
				list.push(["option4", "令其上家或下家也成为此牌目标"]);
			}
			if (list.length === 0) return;
			const result = await player
				.chooseButton(["是否对" + get.translation(target) + "发动【织火】", "请选择一项效果", [list, "textbutton"]])
				.set("ai", button => {
					const p = get.player();
					const c = button.link[0];
					if (c === "option3") {
						const enemies = game.filterPlayer(t => t !== p && t.isIn() && !t.hasSkill("mwkzhihuo_firedebuff") && get.attitude(p, t) < 0);
						return enemies.length > 0 ? 20 : 1;
					}
					if (c === "option4") {
						const left = get.event().getParent().leftTarget;
						const right = get.event().getParent().rightTarget;
						let eff = 0;
						if (left && lib.filter.targetEnabled2({ name: "sha", nature: "fire" }, p, left)) {
							eff = Math.max(eff, get.effect(left, { name: "sha", nature: "fire" }, p, p));
						}
						if (right && lib.filter.targetEnabled2({ name: "sha", nature: "fire" }, p, right)) {
							eff = Math.max(eff, get.effect(right, { name: "sha", nature: "fire" }, p, p));
						}
						return eff > 0 ? 15 + eff : 1;
					}
					if (c === "option2") {
						const enemies = game.filterPlayer(t => t !== p && t.isIn() && !t.isLinked() && get.attitude(p, t) < 0);
						return enemies.length > 0 ? 10 : 1;
					}
					return 1;
				})
				.forResult();
			if (!result?.links?.length) return;
			const choice = result.links[0];
			player.logSkill("mwkzhihuo");
			if (choice === "option2") {
				const result2 = await player
					.chooseTarget("请选择要进入连环状态的角色", [1, Infinity], (card, p, t) => t.isIn() && !t.isLinked() && t !== p)
					.set("ai", t => {
						const p = get.event().player;
						if (get.attitude(p, t) < 0 && !t.isLinked()) return 10;
						return 0;
					})
					.forResult();
				if (result2?.targets?.length) {
					for (const t of result2.targets) {
						if (!t.isLinked()) await t.link();
					}
				}
			} else if (choice === "option3") {
				const result2 = await player
					.chooseTarget("请选择本回合受到火焰伤害+1的其他角色", [1, Infinity], (card, p, t) => t.isIn() && !t.hasSkill("mwkzhihuo_firedebuff") && t !== p)
					.set("ai", t => {
						const p = get.event().player;
						if (get.attitude(p, t) < 0 && !t.hasSkill("mwkzhihuo_firedebuff")) return 10;
						return 0;
					})
					.forResult();
				if (result2?.targets?.length) {
					for (const t of result2.targets) {
						t.setStorage("_mwkzhihuo_fireround", game.roundNumber);
						t.addTempSkill("mwkzhihuo_firedebuff");
						t.markSkill("mwkzhihuo_firedebuff");
					}
				}
			} else if (choice === "option4") {
				const choices = [];
				if (canAddLeft) choices.push(get.translation(leftTarget));
				if (canAddRight) choices.push(get.translation(rightTarget));
				if (choices.length === 0) return;
				const result2 = await player
					.chooseControl(choices)
					.set("prompt", "请选择要成为此牌目标的角色")
					.set("ai", () => {
						const p = get.player();
						const left = get.event().getParent().leftTarget;
						const right = get.event().getParent().rightTarget;
						if (!left) return get.translation(right);
						if (!right) return get.translation(left);
						const effL = get.effect(left, { name: "sha", nature: "fire" }, p, p);
						const effR = get.effect(right, { name: "sha", nature: "fire" }, p, p);
						return effL >= effR ? get.translation(left) : get.translation(right);
					})
					.set("leftTarget", leftTarget)
					.set("rightTarget", rightTarget)
					.forResult();
				if (result2.control === get.translation(leftTarget) && leftTarget) {
					trigger.targets.push(leftTarget);
				} else if (result2.control === get.translation(rightTarget) && rightTarget) {
					trigger.targets.push(rightTarget);
				}
			}
		},
		subSkill: {
			firedebuff: {
				charlotte: true,
				mark: true,
				trigger: { player: "damageBegin1" },
				forced: true,
				popup: false,
				filter(event, player) {
					if (player.getStorage("_mwkzhihuo_fireround", 0) > 0 && game.roundNumber > player.getStorage("_mwkzhihuo_fireround", 0)) return false;
					return event.hasNature?.("fire") ?? false;
				},
				async content(event, trigger, player) {
					if (player.getStorage("_mwkzhihuo_fireround", 0) > 0 && game.roundNumber > player.getStorage("_mwkzhihuo_fireround", 0)) {
						player.removeSkill("mwkzhihuo_firedebuff");
						player.setStorage("_mwkzhihuo_fireround", 0);
						return;
					}
					trigger.num++;
				},
				mark: true,
				marktext: "\u{1F525}",
				intro: { content: "本回合受到火焰伤害+1" },
				ai: {
					effect: {
						target(card, player, target) {
							if (!get.tag(card, "damage")) return;
							if (card.nature === "fire" || get.nature?.(card, player) === "fire") return 2;
						},
					},
				},
			},
		},
	},
	mwkfenyao: {
		audio: ["ext:奥特之星/assets/genshin/audio/skill/fenyao1", "ext:奥特之星/assets/genshin/audio/skill/fenyao2", "ext:奥特之星/assets/genshin/audio/skill/fenyao3"],
		trigger: { global: "phaseBegin" },
		direct: true,
		filter(event, player) {
			if (event.player === player) return false;
			return true;
		},
		async content(event, trigger, player) {
			const target = trigger.player;
			const result = await player
				.chooseCard("he", "是否发动【焚曜】？选择一张【杀】对" + get.translation(target) + "使用", card => {
					return card.name === "sha" && lib.filter.targetEnabled2(card, player, target);
				})
				.set("ai", card => {
					const p = get.player();
					if (get.attitude(p, target) < 0) return get.effect(target, { name: "sha" }, p, p);
					return 0;
				})
				.set("target", target)
				.forResult();
			if (result?.bool && result.cards?.length) {
				const card = result.cards[0];
				player.logSkill("mwkfenyao", target);
				await player.useCard(card, target, false);
			}
		},
		ai: {
			expose: 0.2,
		},
	},
	mwkfantian: {
		trigger: { global: "damage" },
		direct: true,
		popup: false,
		filter(event, player) {
			return event.num > 0;
		},
		async content(event, trigger, player) {
			let gain = (trigger.num ?? 1) + 1;
			player.addMark("mwkfantian", gain, true);
			const current = player.getStorage("mwkfantian", 0);
			if (current > 20) {
				player.setStorage("mwkfantian", 20);
				player.markSkill("mwkfantian");
			}
			await player.draw();
		},
		mark: true,
		marktext: "焚",
		intro: {
			name: "焚",
			markcount(storage, player) {
				return player.getStorage("mwkfantian", 0);
			},
			mark(dialog, storage, player) {
				const count = player.getStorage("mwkfantian", 0);
				dialog.addText("焚标记：" + count + "枚");
			},
		},
		group: ["mwkfantian_use"],
		subSkill: {
			use: {
				audio: ["ext:奥特之星/assets/genshin/audio/skill/fantian1", "ext:奥特之星/assets/genshin/audio/skill/fantian2", "ext:奥特之星/assets/genshin/audio/skill/fantian3"],
				enable: "phaseUse",
				skillAnimation: true,
				filter(event, player) {
					if (player.getStorage("mwkfantian", 0) < 10) return false;
					if (player.getStorage("mwkfantian_round", 0) === game.roundNumber) return false;
					return true;
				},
				filterTarget(card, player, target) {
					return target !== player;
				},
				selectTarget: 1,
				prompt(event, player) {
					const count = player.getStorage("mwkfantian", 0);
					const dmg = Math.floor(count / 2);
					return "发动【燔天】造成" + dmg + "点火焰伤害";
				},
				async content(event, trigger, player) {
					const count = player.getStorage("mwkfantian", 0);
					const dmg = Math.floor(count / 2);
					player.logSkill("mwkfantian");
					player.setStorage("mwkfantian", 0);
					player.unmarkSkill("mwkfantian");
					player.setStorage("mwkfantian_round", game.roundNumber);
					if (event.target?.isAlive()) {
						await event.target.damage(dmg, "fire", player);
					}
				},
				ai: {
					order: 7,
					result: {
						target(player, target) {
							const count = player.getStorage("mwkfantian", 0);
							const dmg = Math.floor(count / 2);
							return -dmg * 2;
						},
					},
				},
			},
		},
		onremove(player) {
			player.setStorage("mwkfantian", 0);
			player.unmarkSkill("mwkfantian");
		},
	},
	xnnjuelie: {
		audio: ["ext:奥特之星/assets/genshin/audio/skill/juelie1", "ext:奥特之星/assets/genshin/audio/skill/juelie2", "ext:奥特之星/assets/genshin/audio/skill/juelie3"],
		enable: "phaseUse",
		usable: 3,
		async content(event, trigger, player) {
			const card = get.cardPile(c => true, false, "random");
			if (!card) return;
			await player.showCards([card], get.translation(player) + "随机亮出了牌堆内的一张牌", true).set("clearArena", false);
			const cardType = get.type(card);
			const cardName = card.name;
			const damageTrickCards = ["shandian", "huoshan"];
			const damageTag = get.tag(card, "damage");
			const isTrickCard = cardType === "trick" || cardType === "delay";
			const isDamageCard = isTrickCard && ((damageTag && damageTag > 0.5) || damageTrickCards.includes(cardName));
			const isShuiKanCard = cardName === "tao" || cardName === "jiu" || cardName === "shan";
			let prompt = "";
			let filterFn = (card, p, t) => true;
			let aiFn = t => 0;
			if (cardType === "equip") {
				prompt = "山艮：选择被【杀】的目标";
				aiFn = t => {
					const att = get.attitude(player, t);
					if (att > 0) {
						if (t.hasSkillTag("maixie") || t.hasSkillTag("maixie_hp")) return 5;
						return -10;
					}
					return 10 - att;
				};
			} else if (isShuiKanCard) {
				prompt = "水坎：选择回复体力的角色";
				filterFn = (card, p, t) => t.getHp() < t.maxHp;
				aiFn = t => {
					const att = get.attitude(player, t);
					if (att <= 0) return 0;
					return att + 5;
				};
			} else if (cardName === "sha") {
				prompt = "火离：选择受到无来源火焰伤害的角色";
				aiFn = t => {
					const att = get.attitude(player, t);
					if (att > 0) {
						if (t.hasSkillTag("maixie") || t.hasSkillTag("maixie_hp")) return 5;
						return -10;
					}
					return 10 - att;
				};
			} else if (isDamageCard) {
				prompt = "冰华：选择弃置其牌的角色";
				aiFn = t => {
					const att = get.attitude(player, t);
					if (att > 0) {
						if (t.hasSkillTag("maixie") || t.hasSkillTag("maixie_hp")) return 3;
						return -10;
					}
					return 8 - att;
				};
			} else {
				prompt = "雷震：选择摸牌的角色";
				aiFn = t => {
					const att = get.attitude(player, t);
					if (att <= 0) return 0;
					return att + 5;
				};
			}
			const result = await player
				.chooseTarget({
					prompt,
					select: [1, 1],
					filterTarget: filterFn,
					ai: aiFn,
				})
				.forResult();
			if (!result?.targets?.length) return;
			const firstTarget = result.targets[0];
			if (cardType === "equip") {
				const shaTarget = firstTarget;
				const allPlayers = game.filterPlayer(p => p !== shaTarget && p.isIn());
				if (allPlayers.length > 0) {
					const shaUser = allPlayers.randomGet();
					await shaUser.useCard({ name: "sha", isVirtual: true }, shaTarget, "noai");
				}
			} else if (isShuiKanCard) {
				await firstTarget.recover(1);
			} else if (cardName === "sha") {
				await firstTarget.damage(1, "fire", "nosource");
			} else if (isTrickCard) {
				if (isDamageCard) {
					const heCards = firstTarget.getCards("he");
					const discardCount = Math.min(heCards.length, Math.floor(Math.random() * 3) + 1);
					const cards = heCards.slice(0, discardCount);
					if (cards.length > 0) {
						await firstTarget.discard(cards, "nosource");
					}
				} else {
					await firstTarget.draw(2);
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
	xnnduancui: {
		audio: ["ext:奥特之星/assets/genshin/audio/skill/duancui1", "ext:奥特之星/assets/genshin/audio/skill/duancui2"],
		enable: "phaseUse",
		usable: 3,
		async content(event, trigger, player) {
			const equipmentNames = ["wslydd", "jslyzh", "fyqy", "yfxg", "cy", "cyzx", "atpf", "sgb", "hasgb", "xjcy", "lybsq", "glm", "atyl"];
			const weights = {};
			for (let i = 0; i < equipmentNames.length; i++) {
				weights[equipmentNames[i]] = 1;
			}
			let clickCount = 0;
			const cards = [];
			for (let i = 0; i < equipmentNames.length; i++) {
				const eqName = equipmentNames[i];
				let cardInfo = lib.card[eqName];
				let actualName = eqName;
				if (!cardInfo && eqName === "atpf") {
					cardInfo = lib.card["atpf1"];
					actualName = "atpf1";
				}
				if (!cardInfo) continue;
				const suit = cardInfo.suit ?? "diamond";
				const number = cardInfo.number ?? 13;
				try {
					const card = game.createCard(actualName, suit, number);
					if (card) cards.push(card);
				} catch (e) {
					game.log("创建装备牌失败:", eqName);
				}
			}
			cards.sort((a, b) => {
				const nameA = get.translation(a.name);
				const nameB = get.translation(b.name);
				return nameA.localeCompare(nameB, "zh-CN");
			});
			while (clickCount < 3) {
				const result = await player
					.chooseButton(["锻淬：点击装备牌增加权重（剩余" + (3 - clickCount) + "次）", cards])
					.set("ai", button => Math.random())
					.forResult();
				if (!result?.links?.length) break;
				const clickedCard = result.links[0];
				let clickedName = clickedCard.name;
				if (clickedName.startsWith("atpf")) {
					clickedName = "atpf";
				}
				weights[clickedName] = (weights[clickedName] ?? 1) + 1.21 * equipmentNames.length;
				clickCount++;
				game.playAudio("..", "extension", "奥特之星", "assets/genshin/audio/skill/duancui" + (Math.floor(Math.random() * 2) + 1));
			}
			const selectedEquips = [];
			const tempEquipList = equipmentNames.slice(0);
			for (let k = 0; k < 3 && tempEquipList.length > 0; k++) {
				let totalWeight = 0;
				for (let m = 0; m < tempEquipList.length; m++) {
					const loopName = tempEquipList[m];
					const w = weights[loopName] ?? 1;
					totalWeight += w;
				}
				if (totalWeight === 0) break;
				let randomWeight = Math.random() * totalWeight;
				let equipName = null;
				for (let m = 0; m < tempEquipList.length; m++) {
					const loopName = tempEquipList[m];
					const w = weights[loopName] ?? 1;
					randomWeight -= w;
					if (randomWeight <= 0) {
						equipName = loopName;
						break;
					}
				}
				if (!equipName) break;
				tempEquipList.splice(tempEquipList.indexOf(equipName), 1);
				let actualEquipName = equipName;
				if (equipName === "atpf") {
					const atpfNumber = Math.floor(Math.random() * 6) + 1;
					actualEquipName = "atpf" + atpfNumber;
				}
				let equipCard = get.cardPile(c => {
					if (actualEquipName.startsWith("atpf")) {
						return c.name?.startsWith("atpf");
					}
					return c.name === actualEquipName;
				}, false);
				if (!equipCard) {
					equipCard = get.discardPile(c => {
						if (actualEquipName.startsWith("atpf")) {
							return c.name?.startsWith("atpf");
						}
						return c.name === actualEquipName;
					});
				}
				if (!equipCard) {
					const cardInfo = lib.card[actualEquipName];
					const suit = cardInfo?.suit ?? "diamond";
					const number = cardInfo?.number ?? 13;
					equipCard = game.createCard(actualEquipName, suit, number);
				}
				if (equipCard) {
					selectedEquips.push(equipCard);
				}
			}
			if (selectedEquips.length === 0) return;
			const result2 = await player.chooseButton(["锻淬：选择一张装备牌", selectedEquips], true).forResult();
			if (!result2?.links?.length) return;
			const equipCard = result2.links[0];
			const result3 = await player
				.chooseTarget({
					prompt: "锻淬：选择一名角色装备【" + get.translation(equipCard) + "】",
					select: [1, 1],
					filterTarget: (card, p, t) => t.canEquip(equipCard, true),
					forced: true,
					ai: t => {
						const att = get.attitude(player, t);
						if (att <= 0) return -10;
						const equipNameList = ["wslydd", "jslyzh", "fyqy", "yfxg", "cy"];
						const hasEquip = t.countCards("e") > 0;
						const hasOwnEquip = t.hasCard(card => equipNameList.includes(card.name), "e");
						const currentEquipValue = t.getCards("e").reduce((sum, card) => sum + get.equipValue(card, t), 0);
						const baseValue = att > 3 ? 15 : 10;
						if (!hasEquip) return baseValue;
						if (!hasOwnEquip) return baseValue - 3 - currentEquipValue * 0.3;
						return baseValue - 6 - currentEquipValue * 0.2;
					},
				})
				.forResult();
			if (!result3?.targets?.length) return;
			const target = result3.targets[0];
			await target.gain(equipCard, "gain2");
			await target.chooseUseTarget(equipCard, true);
		},
		ai: {
			order: 11,
			result: {
				player(player) {
					return 1;
				},
			},
		},
	},
};
