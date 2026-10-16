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
//                                        把奇物商店的刷新概率**加 N 个百分点**（结算，黄金罗盘 0.1 = +10%）。
//                                        与 config.CURIO_SHOP_RATE 相加后只掷一次判定（getCurioShopChance），
//                                        不是另起一次独立掷骰——两件各 10% 独立掷等于 1-(1-0.1)² = 19%，
//                                        与任何一处界面文案都对不上，所以概率类加成一律走累加。
//                     goldOfHeld       战斗结束后额外获得「当前持有金币」的 N 倍（结算，储蓄罐 0.05 = 5%）。
//                                        与 goldRate 不是一回事：goldRate 乘的是本关基础奖励，这个乘的是手上总额
//                     goldOnSkillLoss  每次**真正失去一个技能**时额外获得「本层胜利金币」的 N 倍
//                                      （v14 起触发点是「失去」而不是「替换技能」：从背包删除才发，
//                                      卸下装备不算；一次失去多个按件累加。遗忘之石 10）
//                     expOnSkillLoss   每次**真正失去一个技能**时额外获得「本层胜利经验」的 N 倍
//                                      （与 goldOnSkillLoss 同一条口径。贪食魔盒 10）
//                     dyingRecallChance
//                                        进入濒死状态时按 N 的概率（1 = 必定）获得本局游戏你使用过、
//                                        且当前位于弃牌堆的实体牌（战斗内，回响之铃 0.5/0.75/1）
//                     killGainMaxHp    你杀死一名角色后，体力上限 +N（战斗内，破碎王冠的主键，整句由它生成；
//                                        下面三个配套键与 dyingRecoverToRatio 同例，自己不出文案行）：
//                                          killHeal=1          并回复 1 点体力
//                                          killHealToMax=1     改成回复体力至上限（写了它就不看 killHeal）
//                                          killDrawToMaxHp=1   然后摸牌至手牌数达到体力上限
//                                          killDrawMaxHp=1     改成摸「体力上限」张牌（写了它就不看 killDrawToMaxHp）
//                     lockSkillShop    可以锁定技能商店：锁定后这一批候选不再换货——下次战斗结束不自动刷新，
//                                        免费刷新按钮也用不了（商店，收藏家的橱窗）
//                     lockCurioShop    可以锁定奇物商店：锁定后，下次战斗结束不刷新奇物商店的候选（商店，收藏家的橱窗史诗档）
//                     skillSacrifice   游戏开始时可以把技能当筹码：失去自己任意个技能，令敌方失去等量个技能
//                                      （战斗内，故人的心。**只作用在这一场战斗的 Player 上**：存档、背包、
//                                      装备位一个字都不动，所以不会触发遗忘之石 / 贪食魔盒那两条「真正失去」的奖励）
//                     eventExpRate     从**随机事件中获得的正数经验奖励**额外 +N（事件结算，记忆棱镜 0.25 = +25%）。
//                                        只加成事件自己发的那笔经验：经验消耗、普通/Boss/裂隙战斗的胜利经验、
//                                        虫洞跳关汇总的基础奖励都不吃它；存在追问句的事件在合并成一口之后再算一次
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
		description: "浮生若梦，岁月如梭。纵能留住一瞬光阴，终难挽回旧日容颜。",
		image: "extension/奥特之星/assets/curios/broken_watch.png",
		rarity: "epic",
		priceMultiplier: 1,
		effect: { extraPhase: 1 },
	},
	lucky_stone: {
		id: "lucky_stone",
		name: "幸运石",
		description: "天命无常，吉凶难测。一石藏三分气运，半生求一线天机。",
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
		description: "气若游丝，志不可夺。绝境之中，尚存一线生机。",
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
		description: "星核不熄，其力自生。取之于内，用之不竭。",
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
		description: "粗粝一餐，胜过灵丹。腹中有粮，方能久战。",
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
		description: "轮回一按，往复不休。昨日之事，明日重来。",
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
		description: "金铸之资，皆带血痕。取之愈多，失之愈多。",
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
		description: "血染征袍，战意不休。纵使千军当前，亦敢独往。",
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
		description: "血未尽，怒不止。锋刃既出，无人可挡。",
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
		description: "受人之刃，还人之刃。伤痕愈深，锋芒愈利。",
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
		description: "天地有尽，欲念无边。纵寻遍四海珍宝，难填人心一隅。",
		image: "extension/奥特之星/assets/curios/golden_compass.png",
		rarity: "epic",
		priceMultiplier: 1,
		effect: { extraCurioShopChance: 0.1 },
	},
	piggy_bank: {
		id: "piggy_bank",
		name: "储蓄罐",
		description: "积少成多，藏富于器。今日一钱，明日千金。",
		image: "extension/奥特之星/assets/curios/piggy_bank.png",
		rarity: "epic",
		priceMultiplier: 1,
		effect: { goldOfHeld: 0.05 },
	},
	oblivion_stone: {
		id: "oblivion_stone",
		name: "遗忘之石",
		description: "忘川水冷，前尘如烟。舍得一身旧忆，方换半世浮华。",
		image: "extension/奥特之星/assets/curios/oblivion_stone.png",
		rarity: "epic",
		priceMultiplier: 1,
		effect: { goldOnSkillLoss: 10 },
	},
	echo_bell: {
		id: "echo_bell",
		name: "回响之铃",
		description: "铃响三声，去者复还。凡你所掷，终归掌中。",
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
		description: "昔日万众朝拜，今朝荒冢独眠。纵有王权千载，终归黄土一抔。",
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
		description: "舍技以饲，其腹如渊。所吞愈多，所偿愈厚。",
		image: "extension/奥特之星/assets/curios/gluttonous_box.png",
		rarity: "epic",
		priceMultiplier: 1,
		effect: { expOnSkillLoss: 10 },
	},
	hungry_box: {
		id: "hungry_box",
		name: "饥饿之匣",
		description: "匣腹如壑，终日吞金。所失者财货，所得者进境。",
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
		description: "旧藏列橱，皆归我有。一锁既落，无人可换。",
		image: "extension/奥特之星/assets/curios/collector_showcase.png",
		rarity: "rare",
		priceMultiplier: 1,
		effect: { lockSkillShop: 1 },
		qualityEffects: {
			epic: { lockSkillShop: 1, lockCurioShop: 1 },
		},
	},
	memory_prism: {
		id: "memory_prism",
		name: "记忆棱镜",
		description: "以昔为鉴，照我来路。所铭之事，皆化他日之资。",
		image: "extension/奥特之星/assets/curios/memory_prism.png",
		rarity: "rare",
		priceMultiplier: 1,
		effect: { eventExpRate: 0.25 },
		qualityEffects: {
			epic: { eventExpRate: 0.5 },
		},
	},
	old_friend_heart: {
		id: "old_friend_heart",
		name: "故人的心",
		description: "故人已去，余温犹存。若以往昔换取今朝，纵使万般不舍，又有何妨？",
		image: "extension/奥特之星/assets/curios/old_friend_heart.png",
		rarity: "epic",
		priceMultiplier: 1,
		effect: { skillSacrifice: 1 },
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
