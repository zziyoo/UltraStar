// 无尽模式奇物池：商店购买与事件奖励的收藏品。作者填的是「奇物内容」。
//
// 填什么（每项一个奇物）
//   id              奇物 id，一旦发布就不要改（存档 curios 与图鉴只存 id）
//   name            奇物名
//   description     奇物风味描述
//   image           奇物配图（assets/curios/ 下 192x192，需登记进 data/assets.js 清单）
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
//                     firstDamageBonus 每回合首次造成伤害后，本回合你造成的伤害 +N（战斗内，狂战徽章）
//                     unrespondable    你使用的牌无法被响应（战斗内，血怒核心）。两个配套键都不单独出行：
//                                        unrespondableLowHp=1 表示只在「体力低于体力上限的一半（向上取整）」时生效；
//                                        unrespondableCardDamage=N 表示同时「此牌造成的伤害 +N」
//                     hurtDamageNext   受到伤害后，你下一次造成的伤害 +N（战斗内，反击护符）
//                     hurtDamageRound  受到伤害后，本回合你造成的伤害 +N（战斗内，反击护符稀有档）
//                     hurtDamageGame   受到伤害后，本局游戏你造成的伤害 +N（战斗内，反击护符史诗档）
//                                        上面三档都只加一层，反复受伤不会越叠越高
//                     extraCurioShopChance
//                                        每次战斗胜利后按 N 的概率额外刷一批奇物商店候选（结算，黄金罗盘 0.1 = 10%）
//                     goldOfHeld       战斗结束后额外获得「当前持有金币」的 N 倍（结算，储蓄罐 0.05 = 5%）。
//                                        与 goldRate 不是一回事：goldRate 乘的是本关基础奖励，这个乘的是手上总额
//                     goldOnReplace    每次替换技能时额外获得「本层基准金币」的 N 倍（商店，遗忘之石 5）
//                     expOnReplace     每次替换技能时额外获得「本层基准经验」的 N 倍（商店，贪食魔盒 5）
//                     dyingRecallChance
//                                        进入濒死状态时按 N 的概率（1 = 必定）获得本局游戏你使用过、
//                                        且当前位于弃牌堆的实体牌（战斗内，回响之铃 0.5/0.75/1）
//                     killGainMaxHp    你杀死一名角色后，体力上限 +N（战斗内，破碎王冠的主键，整句由它生成；
//                                        下面三个配套键与 dyingRecoverToRatio 同例，自己不出文案行）：
//                                          killHeal=1          并回复 1 点体力
//                                          killHealToMax=1     改成回复体力至上限（写了它就不看 killHeal）
//                                          killDrawToMaxHp=1   然后摸牌至手牌数达到体力上限
//                                          killDrawMaxHp=1     改成摸「体力上限」张牌（写了它就不看 killDrawToMaxHp）
//                     lockSkillShop    可以锁定技能商店：锁定后，下次战斗结束不刷新技能商店的候选（商店，收藏家的橱窗）
//                     lockCurioShop    可以锁定奇物商店：锁定后，下次战斗结束不刷新奇物商店的候选（商店，收藏家的橱窗史诗档）
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
	berserker_badge: {
		id: "berserker_badge",
		name: "狂战徽章",
		description: "先挨一下才有劲，越打越停不下来。",
		image: "extension/奥特之星/assets/curios/berserker_badge.png",
		rarity: "rare",
		priceMultiplier: 1,
		effect: { firstDamageBonus: 1 },
		qualityEffects: {
			epic: { firstDamageBonus: 2 },
		},
	},
	blood_rage_core: {
		id: "blood_rage_core",
		name: "血怒核心",
		description: "失血越多，它跳得越响，响到没人敢接你的牌。",
		image: "extension/奥特之星/assets/curios/blood_rage_core.png",
		rarity: "common",
		priceMultiplier: 1,
		effect: { unrespondable: 1, unrespondableLowHp: 1 },
		qualityEffects: {
			rare: { unrespondable: 1, unrespondableLowHp: 1, unrespondableCardDamage: 1 },
			epic: { unrespondable: 1, unrespondableCardDamage: 1 },
		},
	},
	counter_amulet: {
		id: "counter_amulet",
		name: "反击护符",
		description: "挨打的那一下它替你记着，下一次还回去。",
		image: "extension/奥特之星/assets/curios/counter_amulet.png",
		rarity: "common",
		priceMultiplier: 1,
		effect: { hurtDamageNext: 1 },
		qualityEffects: {
			rare: { hurtDamageRound: 1 },
			epic: { hurtDamageGame: 1 },
		},
	},
	golden_compass: {
		id: "golden_compass",
		name: "黄金罗盘",
		description: "指针从不指向北，只指向有货的地方。",
		image: "extension/奥特之星/assets/curios/golden_compass.png",
		rarity: "epic",
		priceMultiplier: 1,
		effect: { extraCurioShopChance: 0.1 },
	},
	piggy_bank: {
		id: "piggy_bank",
		name: "储蓄罐",
		description: "看着是空的，摇一摇又像满的。",
		image: "extension/奥特之星/assets/curios/piggy_bank.png",
		rarity: "epic",
		priceMultiplier: 1,
		effect: { goldOfHeld: 0.05 },
	},
	oblivion_stone: {
		id: "oblivion_stone",
		name: "遗忘之石",
		description: "被它抹掉的技能，连名字都不会留下，倒是留下点别的。",
		image: "extension/奥特之星/assets/curios/oblivion_stone.png",
		rarity: "epic",
		priceMultiplier: 1,
		effect: { goldOnReplace: 5 },
	},
	echo_bell: {
		id: "echo_bell",
		name: "回响之铃",
		description: "摇响它，这一路打出去的牌都会循声回来。",
		image: "extension/奥特之星/assets/curios/echo_bell.png",
		rarity: "common",
		priceMultiplier: 1,
		effect: { dyingRecallChance: 0.5 },
		qualityEffects: {
			rare: { dyingRecallChance: 0.75 },
			epic: { dyingRecallChance: 1 },
		},
	},
	broken_crown: {
		id: "broken_crown",
		name: "破碎王冠",
		description: "裂了的王冠只剩一条规矩：倒下的人越多，戴它的人越壮。",
		image: "extension/奥特之星/assets/curios/broken_crown.png",
		rarity: "common",
		priceMultiplier: 1,
		effect: { killGainMaxHp: 1, killHeal: 1 },
		qualityEffects: {
			rare: { killGainMaxHp: 1, killHeal: 1, killDrawToMaxHp: 1 },
			epic: { killGainMaxHp: 1, killHealToMax: 1, killDrawMaxHp: 1 },
		},
	},
	gluttonous_box: {
		id: "gluttonous_box",
		name: "贪食魔盒",
		description: "它不挑食，喂进去的旧技能越多，吐回来的心得越多。",
		image: "extension/奥特之星/assets/curios/gluttonous_box.png",
		rarity: "epic",
		priceMultiplier: 1,
		effect: { expOnReplace: 5 },
	},
	hungry_box: {
		id: "hungry_box",
		name: "饥饿之匣",
		description: "它簌簌地啃钱，啃完吐给你一点心得。",
		image: "extension/奥特之星/assets/curios/hungry_box.png",
		rarity: "negative",
		priceMultiplier: 1,
		effect: { goldRate: -0.15, expRate: 0.05 },
		qualityEffects: {
			common: { goldRate: -0.1, expRate: 0.1 },
			rare: { goldRate: -0.05, expRate: 0.15 },
			epic: { expRate: 0.2 },
		},
	},
	collector_showcase: {
		id: "collector_showcase",
		name: "收藏家的橱窗",
		description: "上了锁的橱窗，货还是那批货，只是没人能趁你不在时换走。",
		image: "extension/奥特之星/assets/curios/collector_showcase.png",
		rarity: "rare",
		priceMultiplier: 1,
		effect: { lockSkillShop: 1 },
		qualityEffects: {
			epic: { lockSkillShop: 1, lockCurioShop: 1 },
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
