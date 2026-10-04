// 无尽模式奇物池：商店购买与事件奖励的收藏品。作者填的是「奇物内容」。
//
// 填什么（每项一个奇物）
//   id              奇物 id，一旦发布就不要改（存档 curios 与图鉴只存 id）
//   name            奇物名
//   description     奇物风味描述
//   image           奇物配图（assets/curios/ 下 256x256，需登记进 data/assets.js 清单）
//   rarity          "common"（普通）| "rare"（稀有）；第一版掉率全部相同，稀有只作展示
//   priceMultiplier 售价倍率（默认 1）：实际售价 = round(基准价 × ±25% 随机 × 此倍率)
//   effect          机制效果对象，键值对叠加（curioManager 统一查询，不为单个奇物写独立代码）：
//                     extraPhase  游戏开始时获得 N 个额外的出牌阶段（战斗内，破损怀表）
//                     extraDraw   摸牌阶段额外摸 N 张牌（战斗内，能量核心）
//                     dyingSave   每局游戏首次进入濒死时回复体力至 1（战斗内，气息腰带；N=1 即一次）
//                     roundHeal   每轮结束时回复 N 点体力（战斗内，剩饭）
//                     expRate     经验获取 +N（胜利结算，幸运石 0.1 = +10%）
//                     goldRate    金币获取 +N（胜利结算；首批未用，接口预留）
//   effectText      效果的一句话文案（界面展示用；留空则按 effect 自动生成）
//
// 自检会查：id 与键名一致、name/description/image 齐备、rarity 合法、priceMultiplier 非负、
// effect 只含上面这些键且为非负数、effectText/effect 至少有一项、图片文件存在。
//
// 填完跑：node tools/test/rogue-data.test.mjs（会校验上面的每一条约束，不用开游戏）

export const curios = {
	broken_watch: {
		id: "broken_watch",
		name: "破损怀表",
		description: "时间似乎在它附近变慢。",
		image: "extension/奥特之星/assets/curios/broken_watch.png",
		rarity: "rare",
		priceMultiplier: 1,
		effect: { extraPhase: 1 },
		effectText: "游戏开始时，获得一个额外的出牌阶段",
	},
	lucky_stone: {
		id: "lucky_stone",
		name: "幸运石",
		description: "握在手里就感觉好运将至。",
		image: "extension/奥特之星/assets/curios/lucky_stone.png",
		rarity: "common",
		priceMultiplier: 1,
		effect: { expRate: 0.1 },
		effectText: "经验获取 +10%",
	},
	breath_belt: {
		id: "breath_belt",
		name: "气息腰带",
		description: "系上它，濒死的边缘总能喘过一口气。",
		image: "extension/奥特之星/assets/curios/breath_belt.png",
		rarity: "rare",
		priceMultiplier: 1,
		effect: { dyingSave: 1 },
		effectText: "每局游戏首次进入濒死状态时，回复体力值至 1",
	},
	energy_core: {
		id: "energy_core",
		name: "能量核心",
		description: "微微发烫的核心仍在输出能量。",
		image: "extension/奥特之星/assets/curios/energy_core.png",
		rarity: "common",
		priceMultiplier: 1,
		effect: { extraDraw: 1 },
		effectText: "摸牌阶段额外摸一张牌",
	},
	leftover_rice: {
		id: "leftover_rice",
		name: "剩饭",
		description: "闻起来平平无奇，吃下去却元气满满。",
		image: "extension/奥特之星/assets/curios/leftover_rice.png",
		rarity: "common",
		priceMultiplier: 1,
		effect: { roundHeal: 1 },
		effectText: "每轮结束时回复一点体力",
	},
};

export const CURIOSITY_RARITY = {
	common: "普通",
	rare: "稀有",
};

/** 按 id 取奇物定义；不存在返回 null（存档校验与图鉴共用） */
export function getCurio(id) {
	if (typeof id !== "string" || !id) {
		return null;
	}
	return curios[id] ?? null;
}

/** 全部奇物 id（图鉴与随机池按这里给全集） */
export const curioIds = Object.keys(curios);
