import { lib, game, ui, get, ai, _status } from "../../noname.js";

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
	jtjeheiwu(player) {
		const num1 = player?.getStorage("jtjeheiwu_num1", 1);
		const num2 = player?.getStorage("jtjeheiwu_num2", 1);
		return `锁定技，其他角色回合开始时，你令其选择一项：①弃置${get.cnNumber(num1)}张牌。②失去${get.cnNumber(num2)}点体力。然后对应选项的数字+1。`;
	},
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

export default dynamicTranslates;