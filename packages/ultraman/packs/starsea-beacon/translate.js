import { lib, game, ui, get, ai, _status } from "../../../../../../noname.js";

export const skillTranslate = {
	betdongjie: "冻结",
	betdongjie_info: "出牌阶段限一次，你可以弃置一张牌，令一名其他角色获得X+1枚“冻结”标记（X为你的体力值减其体力值，至少为0），有“冻结”标记的角色无法使用或打出手牌，每回合结束时或其受到伤害后，移去其一枚“冻结”标记；你获得有“冻结”标记的角色因弃置失去的牌。",
	betfenshen: "分身",
	betfenshen_info: "当你受到伤害时，你可以弃置两张牌或失去一点体力，防止此伤害并获得一枚“分身”标记；当你成为牌的目标后，你可以移去一枚“分身”标记，防止之。",
	betshunyi: "瞬移",
	betshunyi_info: "限定技，当你成为其他角色使用牌的目标后，你可以向后移动任意个座次，若你因此不在其攻击范围内，取消之。",
};
