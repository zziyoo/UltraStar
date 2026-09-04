import { lib, game, get, _status } from "../../../../../noname.js";

export function registerEquipmentSkills() {
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
	lib.translate.lybsq_skill = "流萤变身器";
	lib.translate.glm_skill = "格拉默";
}
