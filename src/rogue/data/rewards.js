// 战斗奖励：闯关固定值，无尽 √关数系数。
//
// 闯关：
//   每赢一关固定 +CHALLENGE_GOLD_PER_LEVEL 金币，任何关卡都一样；
//   经验按 CHALLENGE_EXP_TABLE 的固定表发（不用公式取整，保证总量精确）：
//   第 1~29 关累计 +328，加上新档自带的 2 点，第 29 关打完正好 330——
//   够把 defense / draw / attack 三项（每项 2+4+…+20=110）全部升满；
//   第 30 关是最终挑战，照常发最终奖励，不影响上面的设计。
//
// 无尽：
//   金币/经验 = floor(√n × 系数)，n 是本次完成的关卡编号（不是递增后的）。
//
// 自检会查：闯关经验表覆盖 1~30、累计值正确；无尽系数是非负数。
//
// 填完跑：node tools/test/rogue-data.test.mjs（会校验上面的每一条约束，不用开游戏）

export const CHALLENGE_GOLD_PER_LEVEL = 50;

export const CHALLENGE_EXP_TABLE = {
	1: 2,
	2: 2,
	3: 3,
	4: 4,
	5: 4,
	6: 5,
	7: 6,
	8: 6,
	9: 7,
	10: 8,
	11: 9,
	12: 9,
	13: 10,
	14: 11,
	15: 11,
	16: 12,
	17: 13,
	18: 13,
	19: 14,
	20: 15,
	21: 16,
	22: 16,
	23: 17,
	24: 18,
	25: 18,
	26: 19,
	27: 20,
	28: 20,
	29: 20,
	// 最终关照常给奖励：与前几关持平，维持封顶后的节奏
	30: 20,
};

/** 闯关第 n 关的奖励：固定 50 金币 + 经验表查表（超过 30 关不可能出现，兜底按 30） */
export function getChallengeReward(level) {
	const n = Math.max(1, Math.floor(Number(level) || 1));
	return {
		gold: CHALLENGE_GOLD_PER_LEVEL,
		exp: CHALLENGE_EXP_TABLE[Math.min(n, 30)] ?? 0,
	};
}

/** 无尽模式的 √关数系数：金币 5 / 经验 2（只乘 √n，与初始资源无关） */
export const endlessReward = {
	gold: 5,
	exp: 2,
};

/** 无尽第 n 关的奖励：floor(√n × 系数)，向下取整；只返回配置了的货币 */
export function getEndlessReward(level, currencies) {
	const list = Number.isFinite(level) ? Math.max(1, Math.floor(level)) : 1;
	const root = Math.sqrt(list);
	const gain = {};
	for (const key of currencies) {
		const factor = endlessReward[key];
		if (!Number.isFinite(factor)) {
			continue;
		}
		const total = Math.floor(root * factor);
		if (total > 0) {
			gain[key] = total;
		}
	}
	return gain;
}
