import { lib, game, ui, get, ai, _status } from "../../../../noname.js";

// 分包动态技能描述（lib.dynamicTranslate，键为技能名，值为 (player) => string）
const dynamicTranslates = {
	ffshalong(player) {
		const bool = player.storage.ffshalong;
		let mang = "芒：你可以令所有“沙龙成员”回复一点体力",
			huang = "荒：你可以令所有体力值大于上限一半的“沙龙成员”失去一点体力（向上取整），然后视为使用一张无距离限制，不计入次数且无次数限制的【杀】";
		if (bool) {
			mang = `<span class='bluetext'>${mang}</span>`;
		} else {
			huang = `<span class='firetext'>${huang}</span>`;
		}
		let start = "回合开始时，你可以转换此技能状态。出牌阶段限两次，",
			end = "。";
		return `${start}阳：${huang}；阴：${mang}${end}`;
	},
	ffyuanwu(player) {
		const bool = player.storage.ffshalong;
		let huangEffect = "当你造成伤害后，若" + get.poptip("ffshalong") + "状态为：荒：你可以令所有“沙龙成员”回复一点体力",
			mangEffect = "当你回复体力后，若" + get.poptip("ffshalong") + "状态为：芒：你可以视为使用一张无距离限制，不计入次数且无次数限制的【杀】，此【杀】造成伤害后，你令所有“沙龙成员”失去一点体力";
		if (bool) {
			mangEffect = `<span class='bluetext'>${mangEffect}</span>`;
		} else {
			huangEffect = `<span class='firetext'>${huangEffect}</span>`;
		}
		let start = "",
			end = "。";
		return `${start}${huangEffect}。${mangEffect}${end}`;
	},
};

export { dynamicTranslates };
