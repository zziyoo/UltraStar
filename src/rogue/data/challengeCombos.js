// 闯关模式第 11~30 关的双人组合池。
//
// 与 data/challengeStages.js（前 10 关）同一套思路：第 11~20 关的敌人不再从扩展角色池随机，
// 而是在首次进入 11~30 关时从这里的组合池**不重复抽取 10 个组合**（challengeComboStages
// 一次性定死并存档，存档 v10 字段），第 11~20 关按 challengeComboStages[level-11] 生成双人阵容；
// 第 21~30 关不重新抽，严格复用 11~20 关的结果——第 N 关（21~30）= 第 N-10 关的组合 + 扩展池
// 随机第三人（抽取与映射见 enemy.js 的 ensureChallengeComboStages / createChallengeComboConfigs）。
//
// 结构约定（与 challengeStages.js 一致，createStageEnemyConfigs 直接消费）：
//   id       存档唯一标识（run.challengeComboStages 只存 id），定稿后不要再改名——改名等于换敌人；
//   type     固定写 "group"，players 恰好 2 名；
//   players  成员列表，**数组顺序就是敌人的先后顺序（左角色必须在右角色前面）**，
//            第 21~30 关插第三人时也只插在三个空位里、绝不打乱这个相对顺序。
//            character 写**真实角色 id**（官方包是拼音式 id，游戏里看到的中文名只是显示名）。
//   budget   不写，按人数走默认：2 人 = shared（整队共吃一份等级预算），与单人关卡总强度持平。
//
// 角色 id 核对记录（2026-10-06，依据当前 resources/app/character 各官方包与 translate 逐个确认）：
//   十周年谋系（新杀谋X）→ xianding 包 dc_sb_XXX；十周年威/武/神系 → xianding 包 v_/wu_/shen_ 前缀；
//   「乐」系列 → huicui 包 yue_ 前缀；移动版谋X → sb 包；势系 → bingshi 包 pot_ 前缀；
//   界系 → refresh 包 xin_/re_ 前缀；标曹丕 → shenhua 包裸 id caopi（标准曹丕，显示名「曹丕」）；
//   星周不疑 / 星王朗 → newjiang 包 yj_zhoubuyi / yj_wanglang（显示名「☆周不疑」「☆王朗」，
//   前缀是 ☆ 符号而非「星」字，2026-10-06 用户确认）。
//   29~31 号组合的角色全部来自本扩展（中文即 id）：曼波/哈基米 → uma-musume 包，
//   盖亚/阿古茹/迪迦/戴拿 → ultraman 包 eternal-torch 分包。
// 填完跑：node tools/test/rogue-data.test.mjs（会校验结构与 id 唯一，并对角色 id 做存在性提醒）。

import { CHALLENGE_COMBO_LEVELS } from "../config.js";

export const challengeComboPool = [
	{ id: "威董卓×侯昭宁", type: "group", players: [{ character: "v_dongzhuo" }, { character: "houzhaoning" }] },
	{ id: "乐曹植×谋荀彧", type: "group", players: [{ character: "yue_caozhi" }, { character: "dc_sb_xunyu" }] },
	{ id: "谋贾诩×李丰", type: "group", players: [{ character: "dc_sb_jiaxu" }, { character: "dc_lifeng" }] },
	{ id: "威刘备×神黄忠", type: "group", players: [{ character: "v_liubei" }, { character: "shen_huangzhong" }] },
	{ id: "界简雍×谋蒋干", type: "group", players: [{ character: "re_jianyong" }, { character: "dc_sb_jianggan" }] },
	{ id: "威孙尚香×谯周", type: "group", players: [{ character: "v_sunshangxiang" }, { character: "qiaozhou" }] },
	{ id: "乐周妃×兀突骨", type: "group", players: [{ character: "yue_zhoufei" }, { character: "wutugu" }] },
	{ id: "武张飞×夏侯徽", type: "group", players: [{ character: "wu_zhangfei" }, { character: "dc_xiahouhui" }] },
	{ id: "谋司马懿×张世平", type: "group", players: [{ character: "dc_sb_simayi" }, { character: "dc_zhangshiping" }] },
	{ id: "戏志才×神赵云", type: "group", players: [{ character: "xizhicai" }, { character: "shen_zhaoyun" }] },
	{ id: "谋诸葛亮×神鲁肃", type: "group", players: [{ character: "sb_sp_zhugeliang" }, { character: "shen_lusu" }] },
	{ id: "曹髦×神周瑜", type: "group", players: [{ character: "mb_caomao" }, { character: "shen_zhouyu" }] },
	{ id: "曹髦×刘焉", type: "group", players: [{ character: "mb_caomao" }, { character: "liuyan" }] },
	{ id: "谋周瑜×谋庞统", type: "group", players: [{ character: "dc_sb_zhouyu" }, { character: "dc_sb_pangtong" }] },
	{ id: "势孙綝×势周瑜", type: "group", players: [{ character: "pot_sunchen" }, { character: "pot_zhouyu" }] },
	{ id: "蒲元×界凌统", type: "group", players: [{ character: "puyuan" }, { character: "xin_lingtong" }] },
	{ id: "势周瑜×势魏延", type: "group", players: [{ character: "pot_zhouyu" }, { character: "pot_weiyan" }] },
	{ id: "势邓艾×势周瑜", type: "group", players: [{ character: "pot_dengai" }, { character: "pot_zhouyu" }] },
	{ id: "势周瑜×神姜维", type: "group", players: [{ character: "pot_zhouyu" }, { character: "shen_jiangwei" }] },
	{ id: "势魏延×神姜维", type: "group", players: [{ character: "pot_weiyan" }, { character: "shen_jiangwei" }] },
	{ id: "势邓艾×势魏延", type: "group", players: [{ character: "pot_dengai" }, { character: "pot_weiyan" }] },
	{ id: "势邓艾×神姜维", type: "group", players: [{ character: "pot_dengai" }, { character: "shen_jiangwei" }] },
	{ id: "乐蔡邕×乐蔡文姬", type: "group", players: [{ character: "yue_caiyong" }, { character: "yue_caiwenji" }] },
	{ id: "乐小乔×乐大乔", type: "group", players: [{ character: "yue_xiaoqiao" }, { character: "yue_daqiao" }] },
	{ id: "星周不疑×标曹丕", type: "group", players: [{ character: "yj_zhoubuyi" }, { character: "caopi" }] },
	{ id: "神甘宁×界徐盛", type: "group", players: [{ character: "shen_ganning" }, { character: "xin_xusheng" }] },
	{ id: "势于吉×势辛宪英", type: "group", players: [{ character: "pot_yuji" }, { character: "pot_xinxianying" }] },
	{ id: "界周妃×星王朗", type: "group", players: [{ character: "re_zhoufei" }, { character: "yj_wanglang" }] },
	// ---- 用户 2026-10-06 点名追加：本扩展自己的角色（中文即 id，与包注册一致）----
	{ id: "曼波×哈基米", type: "group", players: [{ character: "曼波" }, { character: "哈基米" }] },
	{ id: "盖亚×阿古茹", type: "group", players: [{ character: "盖亚" }, { character: "阿古茹" }] },
	{ id: "迪迦×戴拿", type: "group", players: [{ character: "迪迦" }, { character: "戴拿" }] },
];

/** 按 id 取组合；id 不在池里或结构损坏（没有成员）时返回 null */
export function getChallengeComboConfig(id) {
	const config = challengeComboPool.find(item => item?.id === id);
	if (!config || !Array.isArray(config.players) || !config.players.length) {
		return null;
	}
	return config;
}

/**
 * 抽第 11~20 关的组合 id：与 challengeStages.drawChallengeStageIds 同一条洗牌逻辑——
 * 把可用组合洗成随机序后按位取用，可用组合 ≥ CHALLENGE_COMBO_LEVELS 时 10 关必然互不重复；
 * 同一 rng 序列结果可复现（Node 自检与测试用）。
 * isAvailable(config) 返回 false 的组合不参与抽取（角色当前不存在的组合抽进来只会让那一关开不了战）。
 *
 * **可用组合不足时绝不循环补齐**：不足就是不足，返回不足 10 条，由 ensureChallengeComboStages
 * 明确判成「组合不足」并阻止生成（宁可开不了战，也不假装够用）。
 * @param {() => number} [rng]
 * @param {(config: object) => boolean} [isAvailable]
 * @returns {string[]} 长度 ≤ CHALLENGE_COMBO_LEVELS 的组合 id（不足即组合不足，交上层报错）
 */
export function drawChallengeComboIds(rng = Math.random, isAvailable = null) {
	const eligible = challengeComboPool.filter(config => typeof isAvailable !== "function" || isAvailable(config));
	const bag = eligible.slice();
	for (let i = bag.length - 1; i > 0; i--) {
		const j = Math.floor(rng() * (i + 1)) % (i + 1);
		[bag[i], bag[j]] = [bag[j], bag[i]];
	}
	return bag.slice(0, CHALLENGE_COMBO_LEVELS).map(config => config.id);
}
