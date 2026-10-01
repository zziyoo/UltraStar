// 关卡区间 → 敌人组合池。作者填的是「第几关到第几关，可以从哪些组合里随机」。
//
// 填什么
//   stagePools[]：每项 = { min, max, groups[] }
//     min/max   闭区间，按当前关卡命中的第一个区间生效
//     groups[]  填 enemyGroups.js 里的组合 id，一关会从这里随机挑一个
//   endlessFallbackPool[]：关卡超出最后一个区间（无尽模式的常态）时用它继续随机
//
// 自检会查
//   min<=max 且区间按关卡升序、不重叠、不空缺；groups 引用的组合必须存在；兜底池不能为空；
//   最后一个区间的 max 必须 >= config.js 的 CHALLENGE_TOTAL_LEVELS。
//
// 填完跑：node tools/test/rogue-data.test.mjs（会校验下面的每一条约束，不用开游戏）

export const stagePools = [
	{ min: 1, max: 5, groups: ["group_zofer", "group_baltan"] },
	{ min: 6, max: 30, groups: ["group_baltan", "group_seven"] },
];

export const endlessFallbackPool = ["group_seven"];

/** 该关卡允许出现的组合 id 列表；配置全空时返回 null 交给上层报错 */
export function getGroupsForLevel(level) {
	const list = Number.isFinite(level) ? Math.floor(level) : 0;
	for (const band of stagePools) {
		if (!band || !Array.isArray(band.groups) || !band.groups.length) {
			continue;
		}
		const min = Number.isFinite(band.min) ? band.min : 1;
		const max = Number.isFinite(band.max) ? band.max : Infinity;
		if (list >= min && list <= max) {
			return band.groups;
		}
	}
	return endlessFallbackPool.length ? endlessFallbackPool : null;
}
