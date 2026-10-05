// 无尽模式事件池：战斗胜利后按概率触发的随机事件。作者填的是「事件内容」。
//
// 填什么（每项一个事件）
//   id          事件 id，一旦发布就不要改（存档 pendingEvent 与图鉴只存 id）
//   name        事件名
//   description 事件描述（进入事件页时展示）
//   image       事件配图（assets/events/ 下 512x512，需登记进 data/assets.js 清单）
//   choices[]   选项，每个选项：
//     text      选项文字
//     reward    固定奖励对象（三选一的第一种写法）
//     outcomes  随机奖励列表 [{ chance, reward }, ...]，chance 合计应为 1（第二种写法）；
//               生成事件时就地预掷并把结果定死写进存档，读档恢复绝不重掷
//
//   reward 支持的键（可叠加）
//     gold / exp      固定增减的货币，负数表示消耗（消耗不足时选项置灰、点了没反应，结算层再验一次）
//     goldByWin / expByWin
//                     按「本次战斗胜利奖励」缩放的货币：1 = 一倍胜利金币（经验），
//                     -1 = 消耗一倍，0.4 = 四成……构建事件时按当前关卡的无尽奖励换算成固定数值
//                     （text 只写选项名，实际花多少由构建时按换算结果自动追加进文案）
//     goldPct         按「点击那一刻持有的金币」的百分比投入（许愿池）：10 = 投入 10%，
//                     配合 goldPayout 用。百分比依赖结算时的余额，所以不像 goldByWin
//                     那样在构建时换算成固定值，而是原样存进存档、结算时现算
//     goldPayout      赢时按投入额的多少倍返还（100 = 一百倍；0 = 落空，投入全损）。
//                     只有 goldPct 非 0 时才有意义
//     curio           "random" = 随机获得一个未拥有的奇物，直接给予到背包
//                     （奇物已集齐时整个选项不结算：不扣货币、相当于跳过，写明原因）
//     skill           "random" = 随机获得一个商店技能（槽满或池空则落空，但其余奖励照常结算）
//     statUp / statDown   "random" = 随机一项属性 +1 / -1（越界按已达上限/下限处理，写明哪项在生成时定死）；
//                       玩家三项属性全满时，生成期会把 statUp 就地换成 curio:"random"
//                       （否则结算必然「已达最高等级，未生效」），statDown 不受影响
//     空对象 {} 表示无奖励
//
// 自检会查：id 与键名一致、name/description/image 齐备、choices 非空且 text 非空、
// 每个选项恰有 reward 或 outcomes 之一、outcomes 的 chance 合计为 1、货币与效果键合法、图片文件存在。
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
				text: "修复机器人",
				reward: { goldByWin: -1, expByWin: 1 },
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
				text: "拾取",
				outcomes: [
					{ chance: 0.5, reward: { goldByWin: 1 } },
					{ chance: 0.5, reward: { goldByWin: -0.4 } },
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
