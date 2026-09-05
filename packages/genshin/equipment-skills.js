import { lib, game, get, _status } from "../../../../noname.js";

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
	lib.translate.wslydd_skill = "万世流涌大典";
	lib.translate.jslyzh_skill = "静水流涌之辉";
	lib.translate.fyqy_skill = "焚曜千阳";
	lib.translate.fyqy_skill2 = "焚曜千阳";
	lib.translate.yfxg_skill = "岩峰巡歌";
	lib.translate.cy_skill = "苍耀";
	lib.translate.cyzx_skill = "赤月之形";
	lib.translate.xjcy_skill = "星鹫赤羽";
	lib.translate.xjcy_sha_count = "赤羽";
}
