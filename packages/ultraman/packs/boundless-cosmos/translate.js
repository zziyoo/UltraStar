import { lib, game, ui, get, ai, _status } from "../../../../../../noname.js";

export const characterTranslate = {
	奥特之王: "奥特之王",
	赛迦: "赛迦",
};
export const skillTranslate = {
	atzwxingmian: "星冕",
	atzwxingmian_info: "任意角色回合开始时，你可以弃置一张牌并视为使用一张你本轮未以此法使用过的牌（延时锦囊牌除外）。",
	atzwbuxi: "不息",
	atzwbuxi_info: "每回合限四次，当一名角色的体力值发生变化时，你可以选择一项：①令其摸X张牌（X为当前其体力值）。②选择一名角色A和另一名角色B，A摸一张牌，B弃置一张牌，若A手牌数小于B，你可以重新选择A，B并执行流程。③令其弃置X张牌（至少为二），然后回复一点体力。",
	sjyuzhi: "域知",
	sjyuzhi_info: "一名角色体力/手牌数不因" + get.poptip("sjzhanren") + "发生变化时，若其体力/手牌数小于等于1且你拥有" + get.poptip("sjzhanren") + "，你可以令其摸一张牌并对其发动" + get.poptip("sjzhanren") + "。",
	sjzhanren: "斩刃",
	sjzhanren_info: "出牌阶段限一次，你可以观看一名角色的手牌与牌堆顶等量的牌，然后你可以将其中任意张牌交换。若其手牌花色均不同/相同，你弃置其所有手牌/令其从牌堆底摸等量张牌；若其手牌数为1，则由你选择弃牌或摸牌。若其因此弃牌或摸牌，重置此技能发动次数。",
};
