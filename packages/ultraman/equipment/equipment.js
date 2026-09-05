import { lib } from "../../../../../noname.js";

export function registerEquipment() {
	for (var i = 1; i <= 6; i++) {
		var cardName = "atpf" + i;
		lib.card[cardName] = {
			type: "equip",
			subtype: "equip2",
			suit: "heart",
			number: i,
			image: "ext:奥特之星/assets/atpf.png",
			ai: {
				equipValue: 8.5,
				basic: {
					equipValue: 8.5
				}
			},
			skills: ["atpf_skill"]
		};
		lib.translate[cardName] = "奥特披风";
		lib.translate[cardName + "_info"] = "当你回合外需要使用或打出【杀】或【闪】时，你可以判定，若判定结果与此装备花色不同，视为使用或打出此牌。";
	}
	lib.card.sgb = {
		type: "equip",
		subtype: "equip5",
		suit: "heart",
		number: 1,
		image: "ext:奥特之星/assets/sgb.png",
		ai: {
			equipValue(card, player) {
				if (player.name == "迪迦" || player.name == "闪耀迪迦") return 999;
				return 10;
			},
			basic: {
				equipValue: 10
			}
		},
		skills: ["sgb_skill"]
	};
	lib.translate.sgb = "神光棒";
	lib.translate.sgb_info = "当你使用普通锦囊牌指定目标后，你可以令此牌额外结算一次。";

	lib.card.hasgb = {
		type: "equip",
		subtype: "equip5",
		suit: "spade",
		number: 1,
		image: "ext:奥特之星/assets/hasgb.png",
		ai: {
			equipValue(card, player) {
				if (player.name == "黑暗迪迦") return 999;
				return 10;
			},
			basic: {
				equipValue: 10
			}
		},
		skills: ["hasgb_skill"]
	};
	lib.translate.hasgb = "黑暗神光棒";
	lib.translate.hasgb_info = "每回合限一次，当你受到伤害后，你可以弃置两张牌并回复一点体力。";

	lib.card.atyl = {
		type: "equip",
		subtype: "equip5",
		suit: "club",
		number: 12,
		image: "ext:奥特之星/assets/atyl.png",
		ai: {
			equipValue: 8,
			basic: {
				equipValue: 8
			}
		},
		skills: ["atyl_skill"]
	};
	lib.translate.atyl = "奥特哑铃";
	lib.translate.atyl_info = "当一名角色进行判定时，你可以终止此次判定。";

}
