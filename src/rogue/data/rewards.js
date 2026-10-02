// 战斗奖励。作者填的是「√关数 × 多少」的系数。
//
// 填什么
//   reward{货币: 系数}   第 n 关的奖励 = floor(√n × 该货币的系数)
//                        当前系数与新建存档的初始资源一致（金币 5 / 经验 2）：
//                        第 1 关 5/2、第 2 关 7/2、第 3 关 8/3、第 4 关 10/4
//   货币键只能用 config.js 的 CURRENCIES 里定义过的（当前 gold / exp）
//
// 自检会查
//   货币键是否合法、系数是否为非负数，并打印第 1 关与第 10 关的实际数值供你核对。
//
// 填完跑：node tools/test/rogue-data.test.mjs（会校验下面的每一条约束，不用开游戏）

export const reward = {
	gold: 5,
	exp: 2,
};

/** 计算某一关的奖励：√关数 × 系数，向下取整；只返回配置了的货币 */
export function getRewardForLevel(level, currencies) {
	const list = Number.isFinite(level) ? Math.max(1, Math.floor(level)) : 1;
	const root = Math.sqrt(list);
	const gain = {};
	for (const key of currencies) {
		const factor = reward[key];
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
