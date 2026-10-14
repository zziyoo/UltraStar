// 无尽模式事件池：战斗胜利后按概率触发的随机事件。作者填的是「事件内容」。
//
// 填什么（每项一个事件）
//   id          事件 id，一旦发布就不要改（存档 pendingEvent 与图鉴只存 id）
//   name        事件名
//   description 事件描述（进入事件页时展示）
//   image       事件配图（assets/events/ 下 192x192，需登记进 data/assets.js 清单）
//   hideBalance 写 true 的事件页**不画选项上方那条金币/经验余额条**（虫洞就是：它给的是「跳过十关
//               期间的全部基础奖励」，把余额摆在那里看着像本场能领的钱）。只是不展示，
//               余额、结算与存档一个字节都不动；没写的事件照旧显示余额条。
//   choices[]   选项，每个选项：
//     text      选项文字
//     reward    固定奖励对象（三选一的第一种写法）
//     outcomes  随机奖励列表 [{ chance, reward }, ...]，chance 合计应为 1（第二种写法）；
//               生成事件时就地预掷并把结果定死写进存档，读档恢复绝不重掷
//     action    交互型选项（第三种写法）：本层不自己处理，交回 mode.js 编排子页面/子战斗
//                 { kind: "abyssDebt", perEnemy? }  下一场战斗每名敌人追加 N 个随机深渊强化
//                                        （落在 run.abyssDebt 上，开那一场时消费并清零）
//                                        perEnemy 不写就用 config.SPRING_DEBT_AFFIXES 的默认值
//                                        （经验泉就是）；要换个数才显式写，别在文案里另抄一份
//                 { kind: "skillForge", grant, subtitle?, pickLabel? }
//                                        先弹「选一个已有技能」页；grant:"exp" 只按 reward 发经验，
//                                        grant:"skill" 在失去之后再随机补一个新技能。
//                                        子页标题恒为**事件名**；subtitle / pickLabel 只改页面上
//                                        那两句话（不写就用技能熔炉的默认文案），失技的结算路径两处共用
//                 { kind: "rift", tier }           深渊裂隙：按 config.RIFT_TIERS 立刻开一场**不算层数**的战斗，
//                                        构建期就把敌人数与 gold/exp 定死写进存档
//                 { kind: "merchant" }             流浪商人：构建期掷出那件奇物与恒定售价，弹单件奇物页
//                 { kind: "curioForge" }            奇物融合炉：构建期算好融合费，弹「选一件奇物升一级」页
//               带 action 的选项**不要**把花费写进 reward——写进去就会被「点了即扣钱」的通用流程扣掉，
//               而玩家还没真定下来。由子页面在真选定那一刻才扣；价钱由构建期追加进 text，点之前看得见。
//     blockedText 这个选项「此刻没有可作用的对象」时对玩家说的一句话（属性已满 / 没有技能 / 没有奇物）。
//               写了它的选项不会被置灰——点了只弹这句话，一个钱都不扣。
//               「钱不够」才置灰，「没对象可作用」弹提示，两种不可用不要混。
//               另：写了 blockedText 的 statUp 不再被「属性全满就换成随机奇物」的生成期改写吃掉，
//               因为作者要的就是那句提示，不是换个奖励。
//     hideCost  写 true 的选项**不在按钮上标消耗金额**（属性训练场就只显示「接受训练」）。
//               价钱照实写在图鉴的选项详情里——这一条只是给按钮文字做减法，不是把花费藏起来。
//     clampLoss 写 true 的选项**永不因「钱不够」置灰**（事件页按钮与结算层两道都放行），结算时
//               负值按「最多扣光手上持有的」收窄，绝不为负。只给**预掷赌局里的失手分支**用
//               （记忆回廊的「深入记忆」）：负结果在生成期就掷定了，选项一置灰等于把结果提前漏给玩家，
//               而负余额又必须堵住——两件事只能同时这样成立。不写它的选项，支付规则一个字不变。
//     followUp  选了这一项之后**追问**的那一句（经验泉：页面上只有「饮用」，点完才问「再饮一口」）。
//               形状就是一个选项 { text, question, reward, action }：question 是追问弹层上说的那句话
//               （没写就用「还要＋按钮名吗？」兜底），text 是按钮名；构建期与主选项走同一条换算与文案路径，
//               随存档定死、读档不重掷；玩家答应时两口**并成一次结算**（奖励相加、代价照兑现），
//               所以它是主选项的追加一口，不是另一个可选的按钮。只支持一层，followUp 里不再嵌 followUp。
//
//   reward 支持的键（可叠加）
//     gold / exp      固定增减的货币，负数表示消耗（消耗不足时选项置灰、点了没反应，结算层再验一次）
//     goldByWin / expByWin
//                     按「本次战斗胜利奖励」缩放的货币：1 = 一倍胜利金币（经验），
//                     -1 = 消耗一倍，0.4 = 四成……构建事件时按当前关卡的无尽奖励换算成固定数值
//                     （text 只写选项名，实际花多少由构建时按换算结果自动追加进文案；
//                     写了 hideCost 的选项不追加，按钮只留选项名）
//     goldPct         按「点击那一刻持有的金币」的百分比投入（许愿池）：10 = 投入 10%，
//                     配合 goldPayout 用。百分比依赖结算时的余额，所以不像 goldByWin
//                     那样在构建时换算成固定值，而是原样存进存档、结算时现算
//     goldPayout      赢时按投入额的多少倍返还（100 = 一百倍；0 = 落空，投入全损）。
//                     只有 goldPct 非 0 时才有意义
//     curio           "random" = 随机获得一个未拥有的奇物，直接给予到背包
//                     （奇物已集齐时整个选项不结算：不扣货币、相当于跳过，写明原因）
//     skill           "random" = 随机获得一个商店技能（槽满或池空则落空，但其余奖励照常结算）
//     statUp / statDown   "random" = 随机一项属性 +1 / -1（越界按已达上限/下限处理，写明哪项在生成时定死）；
//                       statUp 的 "random" 只在**还没满**的属性里掷（抽中已满项等于白花代价），
//                       三项全满时没有候选：有 blockedText 的选项照常挂着弹提示，没写的一律被生成期换成
//                       curio:"random"；statDown 不受影响（它是惩罚向，掷空对玩家有利）
//     skipLevels      跳过 N 关（正整数）：构建期把「接下来 N 关」的无尽基础奖励
//                     （floor(√n×50) 金币 / floor(√n×20) 经验）逐关求和并进 gold/exp 固定值，
//                     结算时 run.level += N。基础口径、不吃奇物加成（与深渊裂隙同一条「胜利加成不生效」）。
//                     例：第 4 关打赢后触发 → 跳过第 5~14 关、直接接着打第 15 关，
//                     无尽最高记录记到跳过的最后一关（第 14 关）
//     curioRarity + expIfNoCurioByWin
//                     按**初始品质**掷一件「还没拥有」的奇物（"common" / "rare" / "epic" / "negative"）：
//                     掷得到就把那个具体 id 写进 curio（构建期定死，读档不重掷）；
//                     掷不到就把 expIfNoCurioByWin 倍的基准经验并进 exp，两者都写回固定值。
//                     古代遗迹三扇门用的就是它——所以 curio 从此支持写具体 id，结算层会照单发放
//     空对象 {} 表示无奖励
//
// 自检会查：id 与键名一致、name/description/image 齐备、choices 非空且 text 非空、
// 每个选项恰有 reward 或 outcomes 之一、outcomes 的 chance 合计为 1、货币与效果键合法、
// clampLoss / abyssDebt.perEnemy / skillForge 文案参数形状合法、图片文件存在。
//
// 填完跑：node tools/test/rogue-data.test.mjs（会校验上面的每一条约束，不用开游戏）

export const events = {
	lost_robot: {
		id: "lost_robot",
		name: "废弃机器人",
		description: "你在废墟中发现一个还能运行的旧机器人，它仍然尝试执行最后的命令。",
		image: "extension/奥特之星/assets/events/lost_robot.png",
		choices: [
			{
				// 花 1 倍胜利金币修好它，换 5 倍胜利经验（构建期按本次胜利奖励换算成固定值）
				text: "修复机器人",
				reward: { goldByWin: -1, expByWin: 5 },
			},
			{
				text: "拆卸零件",
				reward: { curio: "random" },
			},
			{
				text: "离开",
				reward: {},
			},
		],
	},
	mystery_merchant: {
		id: "mystery_merchant",
		name: "神秘商人",
		description: "一个戴面具的人在营地边缘支起摊位，出售来路不明的奇怪物品。",
		image: "extension/奥特之星/assets/events/mystery_merchant.png",
		choices: [
			{
				// 花 5 倍胜利金币换一个随机奇物（贵，但奇物是肉鸽的核心成长）
				text: "购买奇怪物品",
				reward: { goldByWin: -5, curio: "random" },
			},
			{
				text: "拒绝交易",
				reward: {},
			},
		],
	},
	lucky_coin: {
		id: "lucky_coin",
		name: "幸运硬币",
		description: "地上有一枚闪耀的硬币，捡起它也许有好事发生，也许……",
		image: "extension/奥特之星/assets/events/lucky_coin.png",
		choices: [
			{
				// 拾取：一半概率拿「双份金币 + 双份经验」（后期不再只是仨瓜俩枣），
				// 一半概率只丢半份金币——两头都按本层胜利奖励重定，别再退回小额固定值
				text: "拾取",
				outcomes: [
					{ chance: 0.5, reward: { goldByWin: 2, expByWin: 2 } },
					{ chance: 0.5, reward: { goldByWin: -0.5 } },
				],
			},
			{
				text: "观察",
				reward: {},
			},
		],
	},
	wishing_pool: {
		id: "wishing_pool",
		name: "许愿池",
		description: "池水映着不属于你的星空。把金币投进去，也许它会还给你更多——小额百之有一，中额二之有一，大额必得偿还。",
		image: "extension/奥特之星/assets/events/wishing_pool.png",
		choices: [
			{
				// 小额豪赌：10% 概率拿回 100 倍，最坏全丢、最好翻百倍
				text: "小额许愿",
				outcomes: [
					{ chance: 0.1, reward: { goldPct: 10, goldPayout: 100 } },
					{ chance: 0.9, reward: { goldPct: 10, goldPayout: 0 } },
				],
			},
			{
				text: "中额许愿",
				outcomes: [
					{ chance: 0.5, reward: { goldPct: 20, goldPayout: 10 } },
					{ chance: 0.5, reward: { goldPct: 20, goldPayout: 0 } },
				],
			},
			{
				// 必中档：100% 拿回 2 倍（净赚一倍），最稳但收益最低
				text: "大额许愿",
				reward: { goldPct: 50, goldPayout: 2 },
			},
			{
				text: "离开",
				reward: {},
			},
		],
	},
	unknown_lab: {
		id: "unknown_lab",
		name: "未知实验室",
		description: "实验室中保存着未知的力量，是机遇还是风险无人知晓。",
		image: "extension/奥特之星/assets/events/unknown_lab.png",
		choices: [
			{
				text: "进入",
				outcomes: [
					{ chance: 0.5, reward: { statUp: "random" } },
					{ chance: 0.5, reward: { statDown: "random" } },
				],
			},
			{
				text: "离开",
				reward: {},
			},
		],
	},
	// ---------------------------------------------------------------- 上一轮新增：只有「需要玩家挑对象」和「立刻开打」这两类走 action
	spring_of_wisdom: {
		id: "spring_of_wisdom",
		name: "经验泉",
		description: "泉水中流动着奇怪的光芒，似乎能够刺激精神成长。",
		image: "extension/奥特之星/assets/events/spring_of_wisdom.png",
		choices: [
			{
				text: "饮用",
				reward: { expByWin: 3 },
				// 页面上只有这一句「饮用」；点完才追问「再饮一口」。
				// 第二口是在第一口之上**再加**一口（并成一次结算），倍率没有第一口划算（200% < 300%），
				// 代价是下一场每个敌人多一条深渊强化。追加几个词缀由 config.SPRING_DEBT_AFFIXES 定，
				// 构建期注入，别在这里抄一份数字
				followUp: {
					text: "再饮一口",
					question: "泉水的滋味还留在嘴里，脑袋却轻了几分。还要再饮一口吗？",
					reward: { expByWin: 2 },
					action: { kind: "abyssDebt" },
				},
			},
			{
				text: "离开",
				reward: {},
			},
		],
	},
	skill_forge: {
		id: "skill_forge",
		name: "技能熔炉",
		description: "巨大的炉子可以将已有技能重新锻造。",
		image: "extension/奥特之星/assets/events/skill_forge.png",
		choices: [
			{
				// 熔炉换经验的老定价是 2 倍本层胜利经验，与「真失去一个技能」的代价不成比例，抬到 6 倍
				text: "失去一个技能换取大量经验",
				reward: { expByWin: 6 },
				action: { kind: "skillForge", grant: "exp" },
				blockedText: "技能不足，炉子里没有可以熔炼的东西。",
			},
			{
				text: "失去一个技能换一个随机新技能",
				reward: {},
				action: { kind: "skillForge", grant: "skill" },
				blockedText: "技能不足，炉子里没有可以熔炼的东西。",
			},
			{
				text: "离开",
				reward: {},
			},
		],
	},
	stat_training_ground: {
		id: "stat_training_ground",
		name: "属性训练场",
		description: "这里云集各种高手。",
		image: "extension/奥特之星/assets/events/stat_training_ground.png",
		choices: [
			{
				// 三项全满时不置灰：点了弹这句、一分经验也不扣（写了 blockedText 就不再走「满级换随机奇物」的改写）。
				// hideCost：按钮上不写要花多少经验，只显示「接受训练」——价钱在图鉴里照实写着
				text: "接受训练",
				reward: { expByWin: -0.5, statUp: "random" },
				blockedText: "你太厉害了，没什么能学到的东西。",
				hideCost: true,
			},
			{
				text: "离开",
				reward: {},
			},
		],
	},
	abyss_rift: {
		id: "abyss_rift",
		name: "深渊裂隙",
		description: "裂隙中传来令人不安的力量。",
		image: "extension/奥特之星/assets/events/abyss_rift.png",
		choices: [
			{
				// 三档的敌人数与倍率都在 config.RIFT_TIERS，构建期定死进存档：
				// 这一场不算入关卡层数、胜利不触发事件也不刷奇物商店、其它奇物的胜利加成一律不生效
				text: "打一个",
				reward: {},
				action: { kind: "rift", tier: 0 },
			},
			{
				text: "打五个",
				reward: {},
				action: { kind: "rift", tier: 1 },
			},
			{
				text: "打十个",
				reward: {},
				action: { kind: "rift", tier: 2 },
			},
			{
				text: "我不打扰了，我走了哈",
				reward: {},
			},
		],
	},
	wandering_merchant: {
		id: "wandering_merchant",
		name: "流浪商人",
		description: "一个风尘仆仆的商人拦住了你，摊开手掌，上面只躺着一件东西。",
		image: "extension/奥特之星/assets/events/wandering_merchant.png",
		choices: [
			{
				// 与奇物商店的区别：只有一件货、价恒为基准价 ×4、允许买已经拥有的——买完自动升一级而不是多一件。
				// 只有「这一件已经拥有而且练到最高档」才是没对象可作用：那时点了弹这句、金币一个不动
				text: "和商人交易",
				reward: {},
				action: { kind: "merchant" },
				blockedText: "他已经把最好的一件卖给你了，这一笔做不成。",
			},
			{
				text: "不买了",
				reward: {},
			},
		],
	},
	curio_forge: {
		id: "curio_forge",
		name: "奇物融合炉",
		description: "炉膛里的火是紫色的，把东西放进去，出来一件更好的。",
		image: "extension/奥特之星/assets/events/curio_forge.png",
		choices: [
			{
				// 融合费 = 本层基准经验 ×5（config.FORGE_EXP_MULTIPLIER），构建期算成固定值
				text: "把一件奇物投进炉子",
				reward: {},
				action: { kind: "curioForge" },
				blockedText: "奇物不足，炉子里没有可以融合的东西。",
			},
			{
				text: "离开",
				reward: {},
			},
		],
	},
	ancient_ruins: {
		id: "ancient_ruins",
		name: "古代遗迹",
		description: "遗迹尽头立着三扇门，各自透着不一样的光。",
		image: "extension/奥特之星/assets/events/ancient_ruins.png",
		choices: [
			{
				// 白门：普通奇物 + 0.5 倍基准经验；普通款全都有了就折成 0.5 + 1.5 = 2 倍经验（与紫门同额）
				text: "推开白门",
				reward: { curioRarity: "common", expByWin: 0.5, expIfNoCurioByWin: 1.5 },
			},
			{
				// 紫门：稀有奇物；全有了才给 2 倍基准经验
				text: "推开紫门",
				reward: { curioRarity: "rare", expIfNoCurioByWin: 2 },
			},
			{
				// 黑门：负面奇物 + 4 倍基准经验；负面款已获得过就只拿这 4 倍经验
				text: "推开黑门",
				reward: { curioRarity: "negative", expByWin: 4 },
			},
			{
				text: "离开",
				reward: {},
			},
		],
	},
	// ---------------------------------------------------------------- 本轮新增：纯倍率奖励与「花一种货币换另一种」的兑换（零新机制）
	// 四件的奖励一律写成 goldByWin / expByWin 倍率：构建事件时按「刚打赢那一关」的无尽胜利基准
	// （金币 floor(50xn)、经验 floor(20xn)）换算成固定值写进存档，读档恢复绝不重算；
	// 负数倍率就是消耗，价钱由 eventManager.withCostText 追加进选项文案，付不起才置灰。
	abandoned_supply: {
		id: "abandoned_supply",
		name: "废弃补给站",
		description: "在荒废基地里找到尚未过期的物资。",
		image: "extension/奥特之星/assets/events/abandoned_supply.png",
		choices: [
			{
				// 两头都按本层胜利奖励换算：翻找偏金币、仔细搜寻偏经验，缺哪样挑哪样
				text: "翻找补给箱",
				reward: { goldByWin: 1, expByWin: 1 },
			},
			{
				text: "仔细搜寻",
				reward: { goldByWin: 0.5, expByWin: 2 },
			},
		],
	},
	veteran_training: {
		id: "veteran_training",
		name: "老兵的训练",
		description: "一名退役战士愿意分享经验。",
		image: "extension/奥特之星/assets/events/veteran_training.png",
		choices: [
			{
				// 免费那档也按倍率给足：后期的「1 倍经验」几乎看不见，白拿改成 2 倍
				text: "让他训练",
				reward: { expByWin: 2 },
			},
			{
				// 花一半基准金币把经验翻倍到 4 倍：付费档必须明显高于白拿档，否则没人会掏钱
				text: "花钱请教",
				reward: { goldByWin: -0.5, expByWin: 4 },
			},
		],
	},
	gold_vein: {
		id: "gold_vein",
		name: "黄金矿脉",
		description: "发现闪耀的矿脉。",
		image: "extension/奥特之星/assets/events/gold_vein.png",
		choices: [
			{
				text: "立即开采",
				reward: { goldByWin: 1, expByWin: 1 },
			},
			{
				// 慢慢采：金币更多（1.5 倍），经验更少（0.5 倍）
				text: "仔细采集",
				reward: { goldByWin: 1.5, expByWin: 0.5 },
			},
		],
	},
	exp_merchant: {
		id: "exp_merchant",
		name: "经验商人",
		description: "这是位很有信誉的商人。",
		image: "extension/奥特之星/assets/events/exp_merchant.png",
		choices: [
			{
				// 两个方向是同一个汇率（1 倍金币 <-> 3 倍经验），花哪种货币由玩家缺哪样决定；
				// 收益倍率不写进按钮文字（与既有事件同一套口径：按钮只写动作 + 自动追加的消耗，
				// 具体给多少在图鉴的选项详情里照实列全）
				text: "用金币换经验",
				reward: { goldByWin: -1, expByWin: 3 },
			},
			{
				text: "用经验换金币",
				reward: { expByWin: -3, goldByWin: 1 },
			},
			{
				text: "我不需要，谢谢",
				reward: {},
			},
		],
	},
	// ---------------------------------------------------------------- 本轮新增：跳关（skipLevels）
	wormhole: {
		id: "wormhole",
		name: "虫洞",
		description: "蔚蓝色的虫洞引人注目",
		image: "extension/奥特之星/assets/events/wormhole.png",
		// 这一页不摆余额条：见文件头 hideBalance 的说明
		hideBalance: true,
		choices: [
			{
				// 跳过十关并拿走期间的全部金币与经验（基础口径，构建期求和定死；细节见文件头 skipLevels）
				text: "进入",
				reward: { skipLevels: 10 },
			},
			{
				text: "离开",
				reward: {},
			},
		],
	},
	// ---------------------------------------------------------------- 本轮新增：无尽后期「金币多、经验荒」的四件调剂
	// 一律追加在数组末尾：rollEventId 按下标抽事件，既有档位（rng=0 抽第一个）不能因为插队而漂移
	lost_database: {
		id: "lost_database",
		name: "失落数据库",
		description: "一座被遗弃的数据库仍保存着历代文明的知识，只是读取这些资料需要大量能源。",
		image: "extension/奥特之星/assets/events/lost_database.png",
		choices: [
			{
				text: "免费读取",
				reward: { expByWin: 2 },
			},
			{
				// 两倍本层金币换八倍本层经验：比免费档贵，但经验收益是四倍
				text: "付费解锁",
				reward: { goldByWin: -2, expByWin: 8 },
			},
			{
				// 免费搏一把大学问：一半概率拿 12 倍经验，另一半什么也没有。结果生成期定死、读档不重掷；
				// 无消耗，所以不存在「失手扣成负数」那条线
				text: "强制破解",
				outcomes: [
					{ chance: 0.5, reward: { expByWin: 12 } },
					{ chance: 0.5, reward: {} },
				],
			},
			{
				text: "离开",
				reward: {},
			},
		],
	},
	memory_corridor: {
		id: "memory_corridor",
		name: "记忆回廊",
		description: "走廊中浮现出无数个过去的自己，有些记忆能够使你成长，有些则令人迷失。",
		image: "extension/奥特之星/assets/events/memory_corridor.png",
		choices: [
			{
				text: "回顾过去",
				reward: { expByWin: 2 },
			},
			{
				// 预掷：六成拿 7 倍经验，四成失手扣 2 倍——失手那一支**不能**按余额置灰（置灰等于剧透预掷结果），
				// 所以写 clampLoss：选项永远可点，结算最多扣光手上持有的经验、绝不为负（见文件头 clampLoss）
				text: "深入记忆",
				outcomes: [
					{ chance: 0.6, reward: { expByWin: 7 } },
					{ chance: 0.4, reward: { expByWin: -2 } },
				],
				clampLoss: true,
			},
			{
				// 自选一个已拥有的技能真正失去（走技能熔炉同一套选技页与 penalty.loseSkill 统一动作），换 12 倍经验。
				// subtitle / pickLabel 只改子页面上那两句话；标题读事件名（记忆回廊），不再是「技能熔炉」
				text: "遗忘过去",
				reward: { expByWin: 12 },
				action: { kind: "skillForge", grant: "exp", subtitle: "从你拥有的技能里挑一个忘掉，换回大量经验。", pickLabel: "遗忘此技能" },
				blockedText: "你没有可以遗忘的技能。",
			},
			{
				text: "离开",
				reward: {},
			},
		],
	},
	interstellar_exchange: {
		id: "interstellar_exchange",
		name: "星际兑换所",
		description: "一家古老的星际银行，专门经营金币与知识的兑换业务。",
		image: "extension/奥特之星/assets/events/interstellar_exchange.png",
		choices: [
			{
				text: "小额兑换",
				reward: { goldByWin: -1, expByWin: 3 },
			},
			{
				text: "大额兑换",
				reward: { goldByWin: -5, expByWin: 18 },
			},
			{
				text: "离开",
				reward: {},
			},
		],
	},
	extreme_training: {
		id: "extreme_training",
		name: "极限模拟训练",
		description: "一台战斗模拟器能够模拟远超当前实力的敌人，挑战者必须承受高强度训练。",
		image: "extension/奥特之星/assets/events/extreme_training.png",
		choices: [
			{
				text: "基础训练",
				reward: { expByWin: 2 },
			},
			{
				// 深渊债走经验泉同一套 abyssDebt 机制：perEnemy 1/2 在这里显式写死，
				// 不写 perEnemy 的那条（经验泉）照旧吃 config.SPRING_DEBT_AFFIXES 默认值
				text: "极限训练",
				reward: { expByWin: 6 },
				action: { kind: "abyssDebt", perEnemy: 1 },
			},
			{
				text: "终极训练",
				reward: { expByWin: 10 },
				action: { kind: "abyssDebt", perEnemy: 2 },
			},
			{
				text: "离开",
				reward: {},
			},
		],
	},
};

/** 按 id 取事件定义；不存在返回 null（存档校验与图鉴共用） */
export function getEvent(id) {
	if (typeof id !== "string" || !id) {
		return null;
	}
	return events[id] ?? null;
}

/** 全部事件 id（图鉴按这里给全集） */
export const eventIds = Object.keys(events);
