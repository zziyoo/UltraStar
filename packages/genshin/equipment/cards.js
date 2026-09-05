import { lib } from "../../../../../noname.js";

export function registerEquipmentCards() {
	lib.card.wslydd = {
		type: "equip",
		subtype: "equip1",
		distance: { attackFrom: -1 },
		suit: "diamond",
		number: 13,
		image: "ext:奥特之星/assets/wslydd.png",
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
		image: "ext:奥特之星/assets/jslyzh.png",
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
		image: "ext:奥特之星/assets/fyqy.png",
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
		image: "ext:奥特之星/assets/yfxg.png",
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
		image: "ext:奥特之星/assets/cy.png",
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
		image: "ext:奥特之星/assets/cyzx.png",
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


	lib.card.xjcy = {
		type: "equip",
		subtype: "equip1",
		distance: { attackFrom: -4 },
		suit: "diamond",
		number: 5,
		image: "ext:奥特之星/assets/xjcy.png",
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

}
