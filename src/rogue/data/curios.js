// 无尽模式奇物池：商店购买与事件奖励的收藏品。作者填的是「奇物内容」。
//
// 填什么（每项一个奇物）
//   id              奇物 id，一旦发布就不要改（存档 curios 与图鉴只存 id）
//   name            奇物名
//   description     奇物风味描述
//   image           奇物配图（assets/curios/ 下 256x256，需登记进 data/assets.js 清单）
//   rarity          品质档位，决定售价倍率（CURIOSITY_RARITY_PRICE）与标签颜色：
//                     "common"   普通 ×2
//                     "rare"     稀有 ×5
//                     "epic"     史诗 ×10
//                     "negative" 负面 ×-5（价格为负：购买反而获得金币）
//                   第一版掉率全部同权，品质只影响售价与展示
//   priceMultiplier 售价的额外个人倍率（默认 1），与品质倍率相乘
//   effect          机制效果对象，键值对叠加（curioManager 统一查询，不为单个奇物写独立代码）；
//                   负面奇物写负值（如 goldRate: -0.1 = 金币获取 -10%）：
//                     extraPhase  游戏开始时获得 N 个额外的出牌阶段（战斗内，破损怀表）
//                     extraDraw   摸牌阶段额外摸 N 张牌（战斗内，能量核心）
//                     dyingSave   每局游戏首次进入濒死时回复体力至 1（战斗内，气息腰带；N=1 即一次）
//                     roundHeal   每轮结束时回复 N 点体力（战斗内，剩饭）
//                     expRate     经验获取 ±N（胜利结算，幸运石 0.1 = +10%）
//                     goldRate    金币获取 ±N（胜利结算）
//                     extraShopRefresh 每场战斗结束后额外 +N 次技能商城刷新（循环按钮 1 = 一次）
//   effectText      效果的一句话文案（界面展示用；留空则按 effect 自动生成）
//
// 自检会查：id 与键名一致、name/description/image 齐备、rarity 与售价倍率合法、priceMultiplier 非负、
// effect 只含上面这些键且为非零数字、effectText/effect 至少有一项、图片文件存在。
//
// 填完跑：node tools/test/rogue-data.test.mjs（会校验上面的每一条约束，不用开游戏）

export const curios = {
	broken_watch: {
		id: "broken_watch",
		name: "破损怀表",
		description: "时间似乎在它附近变慢。",
		image: "extension/奥特之星/assets/curios/broken_watch.png",
		rarity: "epic",
		priceMultiplier: 1,
		effect: { extraPhase: 1 },
		effectText: "游戏开始时，获得一个额外的出牌阶段",
	},
	lucky_stone: {
		id: "lucky_stone",
		name: "幸运石",
		description: "握在手里就感觉好运将至。",
		image: "extension/奥特之星/assets/curios/lucky_stone.png",
		rarity: "rare",
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
	loop_button: {
		id: "loop_button",
		name: "循环按钮",
		description: "被按下去的那一下，总会再回来一次。",
		image: "extension/奥特之星/assets/curios/loop_button.png",
		rarity: "rare",
		priceMultiplier: 1,
		effect: { extraShopRefresh: 1 },
		effectText: "每场战斗结束后，额外获得一次技能商城刷新机会",
	},
	cursed_coin: {
		id: "cursed_coin",
		name: "诅咒金币",
		description: "沉甸甸的金币上刻着陌生的纹路，握久了指尖发凉。",
		image: "extension/奥特之星/assets/curios/cursed_coin.png",
		rarity: "negative",
		priceMultiplier: 1,
		effect: { goldRate: -0.1 },
		effectText: "金币获取 -10%",
	},
};

export const CURIOSITY_RARITY = {
	common: "普通",
	rare: "稀有",
	epic: "史诗",
	negative: "负面",
};

/** 品质售价倍率：实际售价 = round(基准价 × ±25% 随机 × 品质倍率 × priceMultiplier)；负面为负价（购买反得金币） */
export const CURIOSITY_RARITY_PRICE = {
	common: 2,
	rare: 5,
	epic: 10,
	negative: -5,
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
