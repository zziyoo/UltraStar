// 闯关模式前 10 关的敌方配置池。
//
// 与 enemy.js 的「按模式随机」不同：前 10 关的敌人不再从扩展角色池随机点名，
// 而是在建局时从这里的配置池**不重复抽取 10 个配置**（challengeStages 一次性定死并存档），
// 每一关按 challengeStages[level-1] 的配置生成敌人。加配置只改这个数组，随机、存档、
// 战斗流程都不用动（抽取见 enemy.js 的 ensureChallengeStages，生成见 createStageEnemyConfigs）。
//
// 结构约定：
//   id       存档唯一标识（run.challengeStages 只存 id），定稿后不要再改名——改名等于换敌人；
//   type     "single" 单角色（players 恰好 1 名）/ "group" 多角色组合（players ≥ 2 名），
//            当前池全部是 single，group 的解析路径已经就绪，加组合不需要改任何代码；
//   players  成员列表，character 写**真实角色 id**。注意本体官方包（手杀 mobile / 十周年 shiji /
//            势 bingshi / 限定 xianding / 荟萃 huicui / sp / 界 refresh 等）的角色 id 是拼音式
//            （如 mb_caomao），游戏里看到的中文名只是显示名（lib.translate），所以这里不能照抄显示名。
//   budget   已废弃：属性预算不按队伍共享——关卡等级决定**每个敌人的独立预算**，
//            第 N 关每名没有固定 stats 的成员都各自独立随机分配 N 点（与人数无关），
//            写了固定 stats 的成员照用配置值（详见 enemy.js 的 createStageEnemyConfigs）。
//
// 成员可选的扩展字段（不写就是走常规随机，未来加「指定属性/技能」的组合时直接用）：
//   stats: { defense, draw, attack }  指定该成员的属性等级（缺省键按 0，不再随机分配）；
//   skills: ["技能id"]                该成员的额外技能（与敌人配置同一条落地路径 grantSkills）；
//   maxHp / hp                        体力上限增量 / 体力修正（同旧 enemyGroups.overrides 的语义）。
//
// 抽取闸门只看「角色是否存在」：所有成员角色都在 lib.character 里的配置才参与抽取——
// **禁将不拦抽取**（定稿：关卡配置池的角色即使被禁将也照抽照打，battle.js 的 resolveBattle
// 对这一路以 allowBanned 放行）；只有角色根本不存在的配置才跳过（否则那一关永远开不了战）。
// 填完跑：node tools/test/rogue-data.test.mjs（会校验结构与 id 唯一，并对角色 id 做存在性提醒）。

import { CHALLENGE_STAGE_LEVELS } from "../config.js";

export const challengeStagePool = [
	// ---- 第一批 28 个配置的角色 id 已与当前游戏对上（用户逐个确认，2026-10-06）----
	{ id: "界孙权", type: "single", players: [{ character: "re_sunquan" }] },
	{ id: "手杀周处", type: "single", players: [{ character: "zhouchu" }] },
	{ id: "手杀沙摩柯", type: "single", players: [{ character: "shamoke" }] },
	{ id: "势太史慈", type: "single", players: [{ character: "pot_taishici" }] },
	{ id: "手杀谋关羽", type: "single", players: [{ character: "sb_guanyu" }] },
	{ id: "手杀界沮授", type: "single", players: [{ character: "xin_jushou" }] },
	{ id: "手杀关银屏", type: "single", players: [{ character: "mb_guanyinping" }] },
	{ id: "谋司马师", type: "single", players: [{ character: "dc_simashi" }] },
	{ id: "刘焉", type: "single", players: [{ character: "liuyan" }] },
	{ id: "孙綝", type: "single", players: [{ character: "dc_sunchen" }] },
	{ id: "势孙綝", type: "single", players: [{ character: "pot_sunchen" }] },
	{ id: "势小乔", type: "single", players: [{ character: "pot_xiaoqiao" }] },
	{ id: "手杀谋黄盖", type: "single", players: [{ character: "sb_huanggai" }] },
	{ id: "十周年谋黄盖", type: "single", players: [{ character: "dc_sb_huanggai" }] },
	{ id: "手杀谋张飞", type: "single", players: [{ character: "sb_zhangfei" }] },
	{ id: "手杀界周妃", type: "single", players: [{ character: "re_zhoufei" }] },
	{ id: "夏侯玄", type: "single", players: [{ character: "dc_xiahouxuan" }] },
	{ id: "管宁", type: "single", players: [{ character: "guanning" }] },
	{ id: "友徐庶", type: "single", players: [{ character: "friend_xushu" }] },
	{ id: "曹金玉", type: "single", players: [{ character: "caojinyu" }] },
	{ id: "手杀曹髦", type: "single", players: [{ character: "mb_caomao" }] },
	{ id: "十周年曹髦", type: "single", players: [{ character: "caomao" }] },
	{ id: "庞山民", type: "single", players: [{ character: "pangshanmin" }] },
	{ id: "手杀势辛宪英", type: "single", players: [{ character: "pot_xinxianying" }] },
	{ id: "手杀骆统", type: "single", players: [{ character: "luotong" }] },
	{ id: "威吕布", type: "single", players: [{ character: "v_lvbu" }] },
	{ id: "十周年张琪瑛", type: "single", players: [{ character: "y_dc_zhangqiying" }] },
	{ id: "朱建平", type: "single", players: [{ character: "zhujianping" }] },
	{ id: "手杀神马超", type: "single", players: [{ character: "mb_shen_machao" }] },
	{ id: "手杀骥张辽", type: "single", players: [{ character: "hefei_zhangliao" }] },
	{ id: "手杀笮融", type: "single", players: [{ character: "mb_zerong" }] },
	{ id: "手杀诸葛瞻", type: "single", players: [{ character: "zhugezhan" }] },
	{ id: "手杀界钟会", type: "single", players: [{ character: "re_zhonghui" }] },
	{ id: "吕据", type: "single", players: [{ character: "lvju" }] },
];

/** 按 id 取配置；id 不在池里或结构损坏（没有成员）时返回 null */
export function getChallengeStageConfig(id) {
	const config = challengeStagePool.find(item => item?.id === id);
	if (!config || !Array.isArray(config.players) || !config.players.length) {
		return null;
	}
	return config;
}

/**
 * 抽前 10 关的配置 id：把可用配置洗成随机序后按位取用——
 * 可用配置 ≥ CHALLENGE_STAGE_LEVELS 时前 10 关必然互不重复（一关一个、各用一次）；
 * 同一 rng 序列结果可复现（Node 自检与测试用）。
 * isAvailable(config) 返回 false 的配置不参与抽取（角色当前不可用的配置抽进来只会让那一关开不了战）。
 *
 * **可用配置不足时绝不循环补齐**：循环补齐会让「第 7 关和第 2 关是同一个配置」这种重复悄悄发生，
 * 玩家看着像随机坏了；配置不够就是配置不够，返回不足 10 条，由 ensureChallengeStages 明确判成
 * 「配置不足」并阻止生成（宁可开不了战，也不假装够用）。
 * @param {() => number} [rng]
 * @param {(config: object) => boolean} [isAvailable]
 * @returns {string[]} 长度 ≤ CHALLENGE_STAGE_LEVELS 的配置 id（不足即配置不足，交上层报错）
 */
export function drawChallengeStageIds(rng = Math.random, isAvailable = null) {
	const eligible = challengeStagePool.filter(config => typeof isAvailable !== "function" || isAvailable(config));
	const bag = eligible.slice();
	for (let i = bag.length - 1; i > 0; i--) {
		const j = Math.floor(rng() * (i + 1)) % (i + 1);
		[bag[i], bag[j]] = [bag[j], bag[i]];
	}
	return bag.slice(0, CHALLENGE_STAGE_LEVELS).map(config => config.id);
}
