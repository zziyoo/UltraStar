import { lib, game, ui, get, ai, _status } from "../../../../noname.js";

// 分包动态技能描述（lib.dynamicTranslate，键为技能名，值为 (player) => string）
const dynamicTranslates = {
	yaochenwei(player) {
		const bool = player.storage.yaochenwei;
		let yang = "当你使用一张背置牌时，你可以令一名角色将你的一张手牌翻面",
			yin = "当你使用一张非背置牌时，你可以获得一名其他角色的一张牌并将此牌背置";
		if (bool) {
			yin = `<span class='bluetext'>${yin}</span>`;
		} else {
			yang = `<span class='firetext'>${yang}</span>`;
		}
		let start = "转换技。",
			end = "。";
		return `${start}阳：${yang}；阴：${yin}${end}`;
	},
};

export { dynamicTranslates };
