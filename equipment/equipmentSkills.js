import { lib, game, get, _status } from "../../../noname.js";

export function registerEquipmentSkills() {
	lib.skill.wslydd_skill = {
		trigger: { source: "damageBegin1" },
		forced: true,
		equipSkill: true,
		filter(event, player) {
			if (event.card && get.tag(event.card, "damage") && player.isDamaged()) {
				return true;
			}
			return false;
		},
		async content(event, trigger, player) {
			const lost = player.getDamagedHp();
			trigger.num += lost;
		},
	};
	lib.skill.jslyzh_skill = {
		trigger: { source: "damageEnd" },
		equipSkill: true,
		filter(event, player) {
			if (event.card && event.card.name === "sha") {
				return true;
			}
			return false;
		},
		async content(event, trigger, player) {
			const damagedCount = game.countPlayer(p => p.isDamaged());
			if (damagedCount > 0) {
				await player.draw(damagedCount);
			}
		},
	};
	lib.skill.fyqy_skill = {
		trigger: { source: "damageBegin1" },
		forced: true,
		equipSkill: true,
		filter(event, player) {
			if (event.card && get.tag(event.card, "damage") && event.nature !== "fire") {
				return true;
			}
			return false;
		},
		async content(event, trigger, player) {
			trigger.nature = "fire";
		},
	};
	lib.skill.fyqy_skill2 = {
		trigger: { source: "damageEnd" },
		equipSkill: true,
		filter(event, player) {
			return event.nature === "fire" && player.countCards("h") > 0;
		},
		check(event, player) {
			return player.countCards("h") > 0;
		},
		prompt2(event, player) {
			return "是否发动【焚曜千阳】重铸手牌";
		},
		async content(event, trigger, player) {
			const result = await player.chooseCard("h", [1, player.countCards("h")], "焚曜千阳：选择要重铸的手牌", true).set("ai", card => 6 - get.value(card)).forResult();
			if (result.cards && result.cards.length > 0) {
				await player.recast(result.cards);
			}
		},
	};
	lib.skill.yfxg_skill = {
		equipSkill: true,
		trigger: { player: "useCard1" },
		filter(event, player) {
			return event.card && event.card.name === "sha";
		},
		async content(event, trigger, player) {
			const result = await player.chooseControl("火属性", "雷属性", "冰属性", "获得一张闪").set("prompt", "岩峰巡歌：请选择一项").forResult();
			if (result.control === "获得一张闪") {
				const card = get.cardPile2(c => c.name === "shan");
				if (card) {
					await player.gain(card, "gain2");
				}
			} else {
				let nature = "fire";
				if (result.control === "雷属性") nature = "thunder";
				else if (result.control === "冰属性") nature = "ice";
				trigger.card.nature = nature;
			}
		},
	};
	lib.skill.cy_skill = {
		equipSkill: true,
		trigger: { source: "damageBegin1" },
		filter(event, player) {
			return event.card && get.tag(event.card, "damage") && player.countCards("he", c => c.name !== "cy") >= 1;
		},
		check(event, player) {
			return player.countCards("he", c => c.name !== "cy") >= 1 && get.damageEffect(event.player, player, player) > 0;
		},
		prompt2(event, player) {
			return "是否发动【苍耀】弃置一张牌令伤害+1";
		},
		async content(event, trigger, player) {
			const result = await player.chooseToDiscard(1, "he", true, "苍耀：弃置一张牌令伤害+1", card => card.name !== "cy").set("ai", card => 6 - get.value(card)).forResult();
			if (result.bool) {
				trigger.num++;
			}
		},
	};
	lib.skill.cyzx_skill = {
		equipSkill: true,
		forced: true,
		trigger: { player: "useCardToPlayer" },
		filter(event, player) {
			return get.tag(event.card, "damage") && event.target;
		},
		async content(event, trigger, player) {
			if (trigger.target.hp !== player.hp || trigger.target.hp === trigger.target.maxHp) {
				trigger.directHit.add(trigger.target);
			}
		},
		ai: {
			directHit_ai: true,
			skillTagFilter(player, tag, arg) {
				return arg && arg.card && get.tag(arg.card, "damage");
			},
		},
	};
	lib.skill.atpf_skill = {
		equipSkill: true,
		trigger: { player: ["chooseToRespondBegin", "chooseToUseBegin"] },
		filter(event, player) {
			if (event.responded) return false;
			if (event.atpf_skill) return false;
			if (player === _status.currentPhase) return false;
			const card = player.getEquip("atpf1") || player.getEquip("atpf2") || player.getEquip("atpf3") || player.getEquip("atpf4") || player.getEquip("atpf5") || player.getEquip("atpf6");
			if (!card) return false;
			return (event.filterCard({ name: "sha" }, player, event) || event.filterCard({ name: "shan" }, player, event));
		},
		check(event, player) {
			if (event.ai) {
				const tmp = _status.event;
				_status.event = event;
				let result = event.ai({ name: "shan" }, player, event);
				if (!result) result = event.ai({ name: "sha" }, player, event);
				_status.event = tmp;
				return result > 0;
			}
			return true;
		},
		async content(event, trigger, player) {
			trigger.atpf_skill = true;
			const list = [];
			if (trigger.filterCard({ name: "sha" }, player, trigger)) list.push(["基本", "", "sha"]);
			if (trigger.filterCard({ name: "shan" }, player, trigger)) list.push(["基本", "", "shan"]);
			let atpfName = null;
			if (list.length === 1) {
				atpfName = list[0][2];
			} else if (list.length > 1) {
				const btnResult = await player.chooseButton(["奥特披风：选择要判定使用的牌", [list, "vcard"]], true).forResult();
				if (btnResult?.links?.length) {
					atpfName = btnResult.links[0][2];
				}
			} else {
				return;
			}
			if (atpfName) {
				const judgeEvent = await player.judge(function(judgeCard) {
					if (get.suit(judgeCard) !== "heart") {
						return 1.5;
					}
					return -0.5;
				});
				if (!judgeEvent) return;
				judgeEvent.judge2 = function(result) {
					return result.bool;
				};
				if (judgeEvent.result.judge > 0) {
					if (trigger.name === "chooseToUse") {
						const vcard = new lib.element.VCard({ name: atpfName });
						await player.chooseUseTarget(vcard, true, false);
					} else {
						trigger.set("responded", true);
						trigger.result = { bool: true, card: { name: atpfName, isCard: true } };
						trigger.set("untrigger", true);
					}
				}
			}
		},
		ai: {
			respondShan: true,
			respondSha: true,
			freeShan: true,
			freeSha: true,
		},
	};
	lib.skill.sgb_skill = {
		equipSkill: true,
		trigger: { player: "useCardToPlayered" },
		filter(event, player) {
			if (!event.isFirstTarget || (event.card.storage && event.card.storage.sgb_skill)) return false;
			const type = get.type(event.card);
			if (type !== "trick") return false;
			if (get.tag(event.card, "damage")) return false;
			return true;
		},
		check(event, player) {
			return !get.tag(event.card, "norepeat");
		},
		prompt2(event, player) {
			return "令【" + get.translation(event.card) + "】额外结算一次";
		},
		async content(event, trigger, player) {
			trigger.getParent().effectCount += 1;
		},
	};
	lib.skill.hasgb_skill = {
		equipSkill: true,
		trigger: { player: "damageEnd" },
		filter(event, player) {
			return player.countCards("he") >= 2 && !player.hasSkill("hasgb_skill_used");
		},
		check(event, player) {
			return player.countCards("he") >= 2;
		},
		prompt2(event, player) {
			return "是否发动【黑暗神光棒】弃置两张牌并回复一点体力";
		},
		async content(event, trigger, player) {
			const result = await player.chooseToDiscard("he", 2, true, "黑暗神光棒：弃置两张牌，回复一点体力").set("ai", card => 5 - get.value(card)).forResult();
			if (result.bool) {
				await player.recover(1);
				player.addTempSkill("hasgb_skill_used", "phaseAfter");
			}
		},
	};
	lib.skill.xjcy_skill = {
		equipSkill: true,
		forced: true,
		trigger: { player: "useCard" },
		filter(event, player) {
			return _status.currentPhase === player && event.card;
		},
		async content(event, trigger, player) {
			const count = player.getAllHistory("useCard").length;
			if (count % 3 === 0) {
				await player.draw(1);
				player.addTempSkill("xjcy_skill_effect", "phaseUseAfter");
				player.addMark("xjcy_sha_count", 1, false);
			}
		},
	};
	lib.skill.xjcy_skill_effect = {
		equipSkill: true,
		charlotte: true,
		mod: {
			cardUsable(card, player, num) {
				if (card.name === "sha") {
					const count = player.countMark("xjcy_sha_count") ?? 0;
					return num + count;
				}
			},
		},
		trigger: { player: "phaseUseAfter" },
		forced: true,
		async content(event, trigger, player) {
			player.removeMark("xjcy_sha_count", player.countMark("xjcy_sha_count"));
		},
	};
	lib.skill.lybsq_skill = {
		equipSkill: true,
		enable: "phaseUse",
		usable: 1,
		prompt: "选择一名角色，失去一点体力对其造成一点火焰伤害",
		filterTarget(card, player, target) {
			return target !== player;
		},
		filter(event, player) {
			return player.hp > 0;
		},
		check(event, player) {
			return player.hp > 1;
		},
		async content(event, trigger, player) {
			await player.loseHp(1);
			await event.target.damage(1, "fire", player);
		},
		ai: {
			order: 10,
			result: {
				target(player, target) {
					return get.effect(target, { name: "damage", damage: 1, nature: "fire" }, player, player);
				},
			},
		},
	};
	lib.skill.glm_skill = {
		equipSkill: true,
		trigger: { player: "useCard2" },
		filter(event, player) {
			if (!event.card || event.card.name !== "sha") return false;
			return event.targets && event.targets.some(t => t.countCards("he") > 0);
		},
		check(event, player) {
			return event.targets && event.targets.some(t => t.countCards("he") > 0 && get.attitude(player, t) < 0);
		},
		logTarget: "targets",
		prompt2(event, player) {
			const cardColor = get.color(event.card);
			if (cardColor === "black") {
				return "是否发动【格拉默】弃置目标一张牌并摸一张牌";
			} else {
				return "是否发动【格拉默】获得目标一张牌";
			}
		},
		async content(event, trigger, player) {
			const glmTargets = trigger.targets.slice(0).filter(t => t.countCards("he") > 0);
			if (glmTargets.length === 0) return;
			player.logSkill("glm_skill", glmTargets);
			const cardColor = get.color(trigger.card);
			const isBlack = cardColor === "black";
			for (const t of glmTargets) {
				if (isBlack) {
					await player.discardPlayerCard(t, "he", true);
					await player.draw(1);
				} else {
					await player.gainPlayerCard(t, "he", true);
				}
			}
		},
	};
	lib.skill.atyl_skill = {
		equipSkill: true,
		trigger: { global: "judgeFixing" },
		filter(event, player) {
			return !!event.result;
		},
		check(event, player) {
			const target = event.player;
			const card = event.card;
			if (card && get.type(card) === "delay") {
				if (get.attitude(player, target) > 0) return true;
			}
			let parent = event.getParent();
			while (parent) {
				if (parent.player && parent.player !== target && parent.name !== "useCard") {
					return true;
				}
			}
			return false;
		},
		prompt2(event, player) {
			return "是否发动【奥特哑铃】终止此次判定";
		},
		async content(event, trigger, player) {
			const evt = trigger.getParent();
			evt.finish();
			evt._triggered = null;
			if (evt.name.startsWith("pre_")) {
				const evtx = evt.getParent();
				evtx.finish();
				evtx._triggered = null;
			}
			const nexts = trigger.next.slice();
			for (let i = nexts.length - 1; i >= 0; i--) {
				if (nexts[i].name === "judgeCallback") {
					trigger.next.remove(nexts[i]);
				}
			}
		},
	};


	lib.translate.wslydd_skill = "万世流涌大典";
	lib.translate.jslyzh_skill = "静水流涌之辉";
	lib.translate.fyqy_skill = "焚曜千阳";
	lib.translate.fyqy_skill2 = "焚曜千阳";
	lib.translate.yfxg_skill = "岩峰巡歌";
	lib.translate.cy_skill = "苍耀";
	lib.translate.cyzx_skill = "赤月之形";
	lib.translate.atpf_skill = "奥特披风";
	lib.translate.sgb_skill = "神光棒";
	lib.translate.hasgb_skill = "黑暗神光棒";
	lib.translate.xjcy_skill = "星鹫赤羽";
	lib.translate.xjcy_sha_count = "赤羽";
	lib.translate.lybsq_skill = "流萤变身器";
	lib.translate.glm_skill = "格拉默";
	lib.translate.atyl_skill = "奥特哑铃";
}
