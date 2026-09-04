import { lib } from "../../../noname.js";

export function registerEquipmentCards() {
	lib.card.wslydd = {
		type: "equip",
		subtype: "equip1",
		distance: { attackFrom: -1 },
		suit: "diamond",
		number: 13,
		image: "ext:无名扩展/card/wslydd.png",
		ai: {
			equipValue(card, player) {
				if (player.name == "那维莱特") return 999;
				var lost = player.getDamagedHp();
				if (lost > 0) {
					return 2.5 + 2.5 * lost;
				}
				return 2.5;
			},
			basic: {
				equipValue: 2.5
			}
		},
		skills: ["wslydd_skill"]
	};
	lib.translate.wslydd = "万世流涌大典";
	lib.translate.wslydd_info = "锁定技，你使用伤害牌造成的伤害+X（X为你已损失的体力值）。";

	lib.card.jslyzh = {
		type: "equip",
		subtype: "equip1",
		distance: { attackFrom: -2 },
		suit: "heart",
		number: 13,
		image: "ext:无名扩展/card/jslyzh.png",
		ai: {
			equipValue(card, player) {
				if (player.name == "芙宁娜") return 999;
				return 6;
			},
			basic: {
				equipValue: 6
			}
		},
		skills: ["jslyzh_skill"]
	};
	lib.translate.jslyzh = "静水流涌之辉";
	lib.translate.jslyzh_info = "当你使用【杀】造成伤害后，你可以摸场上已受伤角色数张牌。";

	lib.card.fyqy = {
		type: "equip",
		subtype: "equip1",
		distance: { attackFrom: -3 },
		suit: "heart",
		number: 10,
		image: "ext:无名扩展/card/fyqy.png",
		ai: {
			equipValue(card, player) {
				if (player.name == "玛薇卡") return 999;
				return 6;
			},
			basic: {
				equipValue: 6
			}
		},
		skills: ["fyqy_skill", "fyqy_skill2"]
	};
	lib.translate.fyqy = "焚曜千阳";
	lib.translate.fyqy_info = "锁定技，你使用伤害牌造成的伤害改为火焰伤害。当你造成火焰伤害后，你可以重铸任意张手牌。";

	lib.card.yfxg = {
		type: "equip",
		subtype: "equip1",
		distance: { attackFrom: -1 },
		suit: "diamond",
		number: 11,
		image: "ext:无名扩展/card/yfxg.png",
		ai: {
			equipValue(card, player) {
				if (player.name == "希诺宁") return 999;
				return 6;
			},
			basic: {
				equipValue: 6
			}
		},
		skills: ["yfxg_skill"]
	};
	lib.translate.yfxg = "岩峰巡歌";
	lib.translate.yfxg_info = "当你使用【杀】时，你可以修改此【杀】属性或获得一张【闪】。";

	lib.card.cy = {
		type: "equip",
		subtype: "equip1",
		distance: { attackFrom: -3 },
		suit: "spade",
		number: 4,
		image: "ext:无名扩展/card/cy.png",
		ai: {
			equipValue(card, player) {
				if (player.name == "丝柯克") return 999;
				return 5.5;
			},
			basic: {
				equipValue: 5.5
			}
		},
		skills: ["cy_skill"]
	};
	lib.translate.cy = "苍耀";
	lib.translate.cy_info = "当你使用伤害牌造成伤害时，你可以弃置一张牌，令此伤害+1。";

	lib.card.cyzx = {
		type: "equip",
		subtype: "equip1",
		distance: { attackFrom: -2 },
		suit: "heart",
		number: 6,
		image: "ext:无名扩展/card/cyzx.png",
		ai: {
			equipValue(card, player) {
				if (player.name == "阿蕾奇诺") return 999;
				return 6;
			},
			basic: {
				equipValue: 6
			}
		},
		skills: ["cyzx_skill"]
	};
	lib.translate.cyzx = "赤月之形";
	lib.translate.cyzx_info = "锁定技，体力值与你不同或等于上限的角色无法响应你使用的伤害牌。";

	for (var i = 1; i <= 6; i++) {
		var cardName = "atpf" + i;
		lib.card[cardName] = {
			type: "equip",
			subtype: "equip2",
			suit: "heart",
			number: i,
			image: "ext:无名扩展/card/atpf.png",
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
		image: "ext:无名扩展/card/sgb.png",
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
		image: "ext:无名扩展/card/hasgb.png",
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

	lib.card.xjcy = {
		type: "equip",
		subtype: "equip1",
		distance: { attackFrom: -4 },
		suit: "diamond",
		number: 5,
		image: "ext:无名扩展/card/xjcy.png",
		ai: {
			equipValue(card, player) {
				if (player.name == "恰斯卡") return 999;
				return 6;
			},
			basic: {
				equipValue: 6
			}
		},
		skills: ["xjcy_skill"]
	};
	lib.translate.xjcy = "星鹫赤羽";
	lib.translate.xjcy_info = "锁定技，出牌阶段内，你每使用三张牌，你摸一张牌且本回合你使用【杀】的次数上限+1。";

	lib.card.lybsq = {
		type: "equip",
		subtype: "equip5",
		suit: "heart",
		number: 3,
		image: "ext:无名扩展/card/lybsq.png",
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
		image: "ext:无名扩展/card/glm.png",
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

	lib.card.atyl = {
		type: "equip",
		subtype: "equip5",
		suit: "club",
		number: 12,
		image: "ext:无名扩展/card/atyl.png",
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
