import { lib, game, ui, get, ai, _status } from "../../../../../../noname.js";

// 分包动态技能描述（lib.dynamicTranslate，键为技能名，值为 (player) => string）
const dynamicTranslates = {
	jtjeheiwu(player) {
		const num1 = player?.getStorage("jtjeheiwu_num1", 1);
		const num2 = player?.getStorage("jtjeheiwu_num2", 1);
		return `锁定技，其他角色回合开始时，你令其选择一项：①弃置${get.cnNumber(num1)}张牌。②失去${get.cnNumber(num2)}点体力。然后对应选项的数字+1。`;
	},
};

export { dynamicTranslates };
