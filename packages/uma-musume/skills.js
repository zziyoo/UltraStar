import { lib, game, ui, get, ai, _status } from "../../../../noname.js";

// ===== tbznengchi（能吃）专用辅助函数 =====
// 说明：无名杀只在卡牌定义上读取 ai.equipValue（get.equipValue / game.finishCard 的 aiBasicValue），
// 写在技能 ai 里的 equipValue 不会被任何引擎代码调用；真正生效的评分接口是：
//   mod.aiOrder  -> get.order       （chooseToUse 里 ai1=get.cacheOrder，决定 AI 选哪张牌用）
//   mod.aiValue  -> get.value       （弃牌/收益评估）
//   ai.effect    -> get.effect_use  （chooseToUse 里 ai2=get.cacheEffectUse，决定 AI 是否真的用出去）
const tbznengchiExcludedNames = ["muniu"];

/** 是否是参与决策的牌对象（实体牌 card / 虚拟牌 vcard / {name} 牌名对象） */
function tbznengchiIsCardObject(card) {
	if (!card) return false;
	const type = get.itemtype(card);
	return type === "card" || type === "vcard";
}

/** 是否是装备牌 */
function tbznengchiIsEquip(card) {
	return tbznengchiIsCardObject(card) && get.type2(card) === "equip";
}

/** 该装备是否带有本技能可以永久继承的效果（装备技能 / 距离修正 / 攻击范围） */
function tbznengchiHasEffect(card) {
	if (!tbznengchiIsEquip(card)) return false;
	const name = get.name(card);
	if (!name || tbznengchiExcludedNames.includes(name)) return false;
	const info = get.info(card);
	if (!info) return false;
	if (Array.isArray(info.skills) && info.skills.length > 0) return true;
	const dist = info.distance;
	if (!dist) return false;
	return Boolean(dist.globalTo || dist.globalFrom || typeof dist.attackFrom === "number" || typeof dist.attackRange === "function");
}

/** 该装备的永久效果是否已经获得过（旧存档里 tbznengchi_mark 可能不是数组） */
function tbznengchiHasGained(player, card) {
	const storage = player?.getStorage ? player.getStorage("tbznengchi_mark") : null;
	if (!Array.isArray(storage)) return false;
	return storage.includes(get.name(card));
}

/** 是否已经获得过任意装备效果（用于装备槽禁用/重新启用、失去装备后补回永久技能） */
function tbznengchiHasGainedAny(player) {
	const storage = player?.getStorage ? player.getStorage("tbznengchi_mark") : null;
	return Array.isArray(storage) && storage.length > 0;
}

/** 是否是「装上就能拿到一份新的永久效果」的装备：有效果 + 没获得过 + 合法可装备 */
function tbznengchiIsFreshEquip(player, card) {
	if (!player || typeof player.canEquip !== "function") return false;
	if (!tbznengchiHasEffect(card)) return false;
	if (tbznengchiHasGained(player, card)) return false;
	return player.canEquip(card, true);
}

/** 旧存档兼容：距离加成可能缺字段或不是数字 */
function tbznengchiGetDistance(player) {
	const raw = player.getStorage("tbznengchi_distance", { globalTo: 0, globalFrom: 0 });
	return { globalTo: Number(raw?.globalTo) || 0, globalFrom: Number(raw?.globalFrom) || 0 };
}

function tbznengchiGetAttackRange(player) {
	return Number(player.getStorage("tbznengchi_attackRange", 0)) || 0;
}

/** 按装备定义计算武器自身的攻击范围，与 player.getEquipRange 同源 */
function tbznengchiWeaponRange(card, player) {
	const dist = get.info(card)?.distance;
	if (!dist) return 1;
	if (typeof dist.attackRange === "function") {
		const range = dist.attackRange(card, player);
		return typeof range === "number" ? range : 1;
	}
	if (typeof dist.attackFrom === "number") return 1 - dist.attackFrom;
	return 1;
}

export const skills = {
	myjuesheng: {
		audio: ["ext:奥特之星/assets/audio/juesheng"],
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
							audio: ["ext:奥特之星/assets/audio/juesheng"],
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
			// 装备栏已有装备时 get.equipResult 可能算出 0（常规价值不足以替换），
			// 这里把「新装备带来的永久收益」直接加进 result1，AI 才会真的把牌用出去。
			effect: {
				player(card, player, target, result) {
					if (!tbznengchiIsFreshEquip(player, card)) return;
					return [1, 4];
				},
				player_use(card, player, target, result) {
					if (!tbznengchiIsFreshEquip(player, card)) return;
					return [1, 4];
				},
			},
		},
		filter(event, player) {
			if (event.name === "disableEquip" || event.name === "enableEquip") {
				return tbznengchiHasGainedAny(player);
			}
			if (event.name === "equip" && event.player === player) {
				return tbznengchiHasEffect(event.card);
			}
			const evt = event.getl(player);
			if (!evt?.es?.length) return false;
			return tbznengchiHasGainedAny(player);
		},
		async content(event, trigger, player) {
			if (trigger.name === "equip" && trigger.player === player) {
				const card = trigger.card;
				// 先判重再发增益：同一装备名的永久效果只拿一次，避免反复装备同名装备重复叠加
				if (tbznengchiHasEffect(card) && !tbznengchiHasGained(player, card)) {
					const cardName = get.name(card);
					const dist = get.info(card)?.distance ?? {};
					const addTo = Number(dist.globalTo) || 0;
					const addFrom = Number(dist.globalFrom) || 0;
					if (addTo || addFrom) {
						const stored = tbznengchiGetDistance(player);
						stored.globalTo += addTo;
						stored.globalFrom += addFrom;
						player.setStorage("tbznengchi_distance", stored);
						if (addTo) game.log(player, "获得了加一马效果，其他角色计算与你的距离+" + addTo);
						if (addFrom) game.log(player, "获得了减一马效果，你计算与其他角色的距离" + addFrom);
					}
					// 武器自带攻击范围是「1 - attackFrom」，永久获得的是相对基础范围的增量
					const rangeBonus = tbznengchiWeaponRange(card, player) - 1;
					if (rangeBonus > 0) {
						player.setStorage("tbznengchi_attackRange", tbznengchiGetAttackRange(player) + rangeBonus);
						game.log(player, "获得了攻击范围+" + rangeBonus + "的效果");
					}
					player.markAuto("tbznengchi_mark", [cardName]);
					game.log(player, "获得了装备【" + get.translation(card) + "】的效果");
					player.markSkill("tbznengchi_mark");
				}
			}
			// 装备被替换/失去/装备槽被禁用或重新启用后，已获得的永久技能都要补回来
			const storage = player.getStorage("tbznengchi_mark");
			if (!Array.isArray(storage) || storage.length === 0) return;
			const gained = [];
			for (const cardName of storage) {
				if (tbznengchiExcludedNames.includes(cardName)) continue;
				const info = get.info({ name: cardName });
				if (!info?.skills) continue;
				for (const skill of info.skills) {
					if (!gained.includes(skill)) gained.push(skill);
				}
			}
			if (gained.length > 0) player.addSkill(gained);
		},
		mod: {
			globalTo(from, to, distance) {
				const dist = tbznengchiGetDistance(to);
				if (dist.globalTo) {
					return distance + dist.globalTo;
				}
			},
			globalFrom(from, to, distance) {
				const dist = tbznengchiGetDistance(from);
				if (dist.globalFrom) {
					return distance + dist.globalFrom;
				}
			},
			attackRange(player, num) {
				const attackRange = tbznengchiGetAttackRange(player);
				if (attackRange > 0) {
					return num + attackRange;
				}
			},
			// get.order：chooseToUse 用 ai1=get.cacheOrder 选出要用的牌，这里给「新装备」加优先级
			aiOrder(player, card, num) {
				if (!tbznengchiIsFreshEquip(player, card)) return;
				return num + 5;
			},
			// get.value：让 AI 舍不得扔掉还没获得过效果的装备
			aiValue(player, card, num) {
				if (!tbznengchiHasEffect(card)) return;
				if (tbznengchiHasGained(player, card)) return;
				return num + 8;
			},
		},
		group: ["tbznengchi_draw"],
		subSkill: {
			draw: {
				audio: ["ext:奥特之星/assets/audio/nengchi"],
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
						const raw = player.getStorage("tbznengchi_mark");
						const s = Array.isArray(raw) ? raw : [];
						const dist = tbznengchiGetDistance(player);
						const attackRange = tbznengchiGetAttackRange(player);
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
		audio: ["ext:奥特之星/assets/audio/suixin1", "ext:奥特之星/assets/audio/suixin2"],
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
		audio: ["ext:奥特之星/assets/audio/mingmen"],
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
		audio: ["ext:奥特之星/assets/audio/manbo1", "ext:奥特之星/assets/audio/manbo2", "ext:奥特之星/assets/audio/manbo3"],
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
				audio: ["ext:奥特之星/assets/audio/manbo1", "ext:奥特之星/assets/audio/manbo2", "ext:奥特之星/assets/audio/manbo3"],
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
		audio: ["ext:奥特之星/assets/audio/haqi1", "ext:奥特之星/assets/audio/haqi2", "ext:奥特之星/assets/audio/haqi3"],
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
