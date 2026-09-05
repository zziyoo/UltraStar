import { lib, game, ui, get, ai, _status } from "../../../../../../noname.js";

export const characterTranslate = {
	奥特之父: "奥特之父",//长夜破晓
	闪耀迪迦: "闪耀迪迦",//长夜破晓
	至高盖亚: "至高盖亚",//长夜破晓
	闪耀迪迦_prefix: "闪耀",
	至高盖亚_prefix: "至高",
};
export const skillTranslate = {
	atzfzhenli: "真力",
	atzfzhenli_info: "锁定技，当你手牌数少于体力上限时，你将手牌摸至体力上限。你使用牌无距离限制。",
	atzfchiyuan: "驰援",
	atzfchiyuan_info: "出牌阶段限一次，你可以将任意张手牌交给一名其他角色。",
	sydjqiji: "祈冀",
	sydjqiji_info: "锁定技，任意角色回合结束后，你摸牌至两倍场上存活角色数；当你失去体力时，取消之。",
	sydjhuihuang: "辉煌",
	sydjhuihuang_info: "当你成为其他角色使用牌的目标时，若你未记录此牌名，记录并取消之；否则你可以弃置一张同类型的牌并取消之。回合开始时，你可以：①弃置2X张牌并减少X种记录过的牌名。②弃置两张牌，视为使用一张普通锦囊牌。",
	zggylianshuai: "连摔",
	zggylianshuai_info: "当你使用【杀】后，你可以弃置手牌中一种类型与花色组合的所有牌（需为基本牌或锦囊牌且不能是本轮弃置过的组合），并视为使用一张无次数限制的【杀】。",
	zggyjili: "极力",
	zggyjili_info: "你可以将一张非伤害类牌当普通的【杀】使用。当你使用【杀】指定目标后，你可以与目标同时展示一张手牌，然后弃置你展示的牌并执行一项（若对方无牌则视为展示7点）：1.摸X张牌（X为两张牌点数差值的一半，向下取整）；2.此【杀】伤害+Y（Y为X的一半，向上取整）；3.令此【杀】无法被响应。",
};
