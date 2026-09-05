import { lib } from "../../../../noname.js";

export function registerEquipment() {
	lib.card.lybsq = {
		type: "equip",
		subtype: "equip5",
		suit: "heart",
		number: 3,
		image: "ext:奥特之星/assets/image/lybsq.png",
		ai: {
			equipValue(card, player) {
				if (player.name == "流萤") return 999;
				return 9;
			},
			basic: {
				equipValue: 9
			}
		},
		skills: ["lybsq_skill"]
	};
	lib.translate.lybsq = "流萤变身器";
	lib.translate.lybsq_info = "出牌阶段限一次，你可以失去一点体力对一名其他角色造成一点火焰伤害。";

	lib.card.glm = {
		type: "equip",
		subtype: "equip1",
		distance: { attackFrom: -1 },
		suit: "club",
		number: 8,
		image: "ext:奥特之星/assets/image/glm.png",
		ai: {
			equipValue(card, player) {
				if (player.name == "流萤") return 999;
				return 6;
			},
			basic: {
				equipValue: 6
			}
		},
		skills: ["glm_skill"]
	};
	lib.translate.glm = "格拉默";
	lib.translate.glm_info = "若你使用的【杀】颜色为黑色，你可以弃置目标的一张牌并摸一张牌，否则你获得其一张牌。";

}
