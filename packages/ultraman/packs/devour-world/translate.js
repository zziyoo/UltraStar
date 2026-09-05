import { lib, game, ui, get, ai, _status } from "../../../../../../noname.js";

export const characterTranslate = {
	安培拉星人: "安培拉星人",//雄吞天地
	黑暗迪迦: "黑暗迪迦",//雄吞天地
	黑暗迪迦_prefix: "黑暗",
};
export const skillTranslate = {
	aplxiongye: "雄野",
	aplxiongye_info: "锁定技，当你对其他角色造成伤害时，或其他角色对你造成伤害时，你将牌堆顶的3X张牌扣置于你的武将牌上（X为伤害数），称为“野”；你可以将“野”当做手牌使用或打出。",
	aplaojie: "傲节",
	aplaojie_info: "锁定技，你无法使用或打出【闪】。",
	hadjheian: "黑暗",
	hadjheian_info: "锁定技，你摸牌改为从弃牌堆摸，使用或重铸后的牌改为置入牌堆底。",
	hadjanrong: "暗融",
	hadjanrong_discard: "暗融",
	hadjanrong_info: "锁定技，当你受到非红色【杀】造成的伤害后，你获得伤害来源的一个技能并增加一点体力上限。你可以如手牌般使用或打出弃牌堆底的X张牌（X为你的体力上限）。",
	hadjyihui: "熠辉",
	hadjyihui_info: "觉醒技，回合开始时，若你因" + get.poptip("hadjanrong") + "获得过至少三个技能，你回复一点体力并失去" + get.poptip("hadjanrong") + "，并将武将牌替换为”迪迦”。",
};
