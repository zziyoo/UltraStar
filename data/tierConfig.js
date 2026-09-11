// Tier 排名配置（兼容保留）：
// 排行榜分组已改为六维评分自动判定（data/characterAnalysis.js 的
// calculateCharacterScore + getCharacterTier），tierConfig 不再维护手工角色名单，
// 仅保留空结构以兼容旧接口；tierList 仍决定 T0→T3 的显示顺序。
export const tierList = [
	{ id: "T0", name: "T0" },
	{ id: "T1", name: "T1" },
	{ id: "T2", name: "T2" },
	{ id: "T3", name: "T3" },
];

export const tierConfig = {
	T0: [],
	T1: [],
	T2: [],
	T3: [],
};
