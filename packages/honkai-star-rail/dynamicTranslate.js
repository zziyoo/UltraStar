import { lib, game, ui, get, ai, _status } from "../../../../noname.js";

// 分包动态技能描述（lib.dynamicTranslate，键为技能名，值为 (player) => string）
const dynamicTranslates = {
	lyranjin(player) {
		const bool = player.storage.lyranjin;
		let yang = "你可以失去X点体力（X为体力上限的一半，向下取整，且至多失去体力值至1），然后对一名其他角色造成一点火焰伤害",
			yin = "你可以将X张牌当作无距离和次数限制的火【杀】使用，若此【杀】造成了伤害，你回复X点体力";
		if (bool) {
			yin = `<span class='bluetext'>${yin}</span>`;
		} else {
			yang = `<span class='firetext'>${yang}</span>`;
		}
		let start = "转换技，出牌阶段限一次。",
			end = "。当你造成火焰伤害后，此技能视为未发动过。";
		return `${start}阳：${yang}；阴：${yin}${end}`;
	},
};

export { dynamicTranslates };
