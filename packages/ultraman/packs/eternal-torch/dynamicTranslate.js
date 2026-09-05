import { lib, game, ui, get, ai, _status } from "../../../../../../noname.js";

// 分包动态技能描述（lib.dynamicTranslate，键为技能名，值为 (player) => string）
const dynamicTranslates = {
	jstsfensui(player) {
		const isYin = !!player?.storage?.jstsfensui;
		const option = player?.getStorage ? player.getStorage(isYin ? "jstsfensui_yin" : "jstsfensui_yang", 0) : 0;
		const format = (label, trigger, effects, color, executing) => {
			const str = effects
				.map((text, i) => {
					const cn = i === 0 ? "①" : "②";
					if (executing) {
						return `<span class='${i === option ? (color === "firetext" ? "bluetext" : "firetext") : color}'>${cn}${text}</span>`;
					}
					return cn + text;
				})
				.join("；");
			const head = `${label}：${trigger}：`;
			return executing ? `<span class='${color}'>${head}</span>${str}` : head + str;
		};
		const yang = format("阳", "当你成为牌的目标后，你可以令一名角色执行", ["摸两张牌并弃置一张牌", "摸一张牌并弃置两张牌"], "firetext", !isYin);
		const yin = format("阴", "当其他角色成为牌的目标后，你可以令一名角色执行", ["受到一点伤害然后回复两点体力", "受到两点伤害然后回复一点体力"], "bluetext", isYin);
		return `转换技，${yang}。${yin}。（初始均执行①，每次执行与同一分支上一次选项不同的选项）`;
	},
};

export { dynamicTranslates };
