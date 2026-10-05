// 无尽模式奇物池：商店购买与事件奖励的收藏品。作者填的是「奇物内容」。
//
// 填什么（每项一个奇物）
//   id              奇物 id，一旦发布就不要改（存档 curios 与图鉴只存 id）
//   name            奇物名
//   description     奇物风味描述
//   image           奇物配图（assets/curios/ 下 256x256，需登记进 data/assets.js 清单）
//   rarity          初始品质，决定售价倍率（CURIOSITY_RARITY_PRICE）与标签颜色：
//                     "common"   普通 ×2
//                     "rare"     稀有 ×5
//                     "epic"     史诗 ×10
//                     "negative" 负面 ×-5（价格为负：购买反而获得金币）
//                   第一版掉率全部同权。**任何来源新获得的奇物都从这个初始品质开始**——
//                   玩家花经验升上去的品质只记在 run.curioQuality 里，不进图鉴、不跨存档。
//   priceMultiplier 售价的额外个人倍率（默认 1），与品质倍率相乘
//   effect          「初始品质」的机制效果对象，键值对叠加（curioManager 统一查询，不为单个奇物写独立代码）
//   qualityEffects  升级后的效果：{ rare: {...}, epic: {...} }，**整份替换**该品质下的 effect（不是叠加）；
//                   品质键只能是初始品质之后的档位，不写的品质表示效果与上一档相同。
//                   允许每件奇物有自己的升级曲线（不要写成「初始效果 ×N」）
//                     extraPhase      游戏开始时获得 N 个额外的出牌阶段（战斗内，破损怀表）
//                     extraDraw       摸牌阶段额外摸 N 张牌（战斗内，能量核心）
//                     dyingSave       每局游戏首次进入濒死时回复体力至 1（战斗内，气息腰带；N 即次数）
//                     dyingRecoverToRatio
//                                     濒死回复到「体力上限 × N（向上取整）」而不是固定回 1
//                                     （战斗内，气息腰带的史诗档；不改 dyingSave 的「次数」语义）
//                     roundHeal       每轮结束时回复 N 点体力（战斗内，剩饭）
//                     turnHeal        每回合结束时回复 N 点体力（战斗内，剩饭的史诗档）
//                     expRate         经验获取 ±N（胜利结算，幸运石 0.1 = +10%）
//                     goldRate        金币获取 ±N（胜利结算）
//                     goldRateSpread  与 goldRate 配套：结算时在 goldRate±spread 之间随机取值。
//                                     goldRate 允许写 0（= 「±N%」的波动档），但必须有配套非零 spread
//                     extraShopRefresh 每场战斗结束后额外 +N 次技能商城刷新（循环按钮 1 = 一次）
//   effect          见上：界面文案一律由这些键自动生成（没有 effectText 这类手写字段），
//                   同一个奇物各档之间、各奇物之间句式因此是统一的
//
// 自检会查：id 与键名一致、name/description/image 齐备、rarity 合法、priceMultiplier 非负、
// effect/qualityEffects 只含上面这些键且键值合法（品质键必须高于初始品质）、图片文件存在。
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
	},
	lucky_stone: {
		id: "lucky_stone",
		name: "幸运石",
		description: "握在手里就感觉好运将至。",
		image: "extension/奥特之星/assets/curios/lucky_stone.png",
		rarity: "rare",
		priceMultiplier: 1,
		effect: { expRate: 0.1 },
		qualityEffects: {
			epic: { expRate: 0.2 },
		},
	},
	breath_belt: {
		id: "breath_belt",
		name: "气息腰带",
		description: "系上它，濒死的边缘总能喘过一口气。",
		image: "extension/奥特之星/assets/curios/breath_belt.png",
		rarity: "rare",
		priceMultiplier: 1,
		effect: { dyingSave: 1 },
		qualityEffects: {
			epic: { dyingSave: 1, dyingRecoverToRatio: 0.5 },
		},
	},
	energy_core: {
		id: "energy_core",
		name: "能量核心",
		description: "微微发烫的核心仍在输出能量。",
		image: "extension/奥特之星/assets/curios/energy_core.png",
		rarity: "common",
		priceMultiplier: 1,
		effect: { extraDraw: 1 },
		qualityEffects: {
			rare: { extraDraw: 2 },
			epic: { extraDraw: 4 },
		},
	},
	leftover_rice: {
		id: "leftover_rice",
		name: "剩饭",
		description: "闻起来平平无奇，吃下去却元气满满。",
		image: "extension/奥特之星/assets/curios/leftover_rice.png",
		rarity: "common",
		priceMultiplier: 1,
		effect: { roundHeal: 1 },
		qualityEffects: {
			rare: { roundHeal: 2 },
			epic: { turnHeal: 2 },
		},
	},
	loop_button: {
		id: "loop_button",
		name: "循环按钮",
		description: "被按下去的那一下，总会再回来一次。",
		image: "extension/奥特之星/assets/curios/loop_button.png",
		rarity: "rare",
		priceMultiplier: 1,
		effect: { extraShopRefresh: 1 },
		qualityEffects: {
			epic: { extraShopRefresh: 2 },
		},
	},
	cursed_coin: {
		id: "cursed_coin",
		name: "诅咒金币",
		description: "沉甸甸的金币上刻着陌生的纹路，握久了指尖发凉。",
		image: "extension/奥特之星/assets/curios/cursed_coin.png",
		rarity: "negative",
		priceMultiplier: 1,
		effect: { goldRate: -0.1 },
		qualityEffects: {
			common: { goldRate: 0, goldRateSpread: 0.1 },
			rare: { goldRate: 0.05, goldRateSpread: 0.1 },
			epic: { goldRate: 0.2 },
		},
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

/** 品质升级链：只能沿它向前走一级；负面奇物因此也能一路净化到史诗 */
export const CURIOSITY_QUALITY_CHAIN = ["negative", "common", "rare", "epic"];

/** 按 id 取奇物定义；不存在返回 null（存档校验与图鉴共用） */
export function getCurio(id) {
	if (typeof id !== "string" || !id) {
		return null;
	}
	return curios[id] ?? null;
}

/** 全部奇物 id（图鉴与随机池按这里给全集） */
export const curioIds = Object.keys(curios);
