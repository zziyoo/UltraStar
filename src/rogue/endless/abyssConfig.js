// 深渊化强化：机制参数（层数门限、词缀池、上限）。
//
// 词缀池是「哪些强化会被随机到」的唯一落点：新增强化只需要三步——
//   1. 在 abyssAffixes.js 的 affix 里写技能本体（含 name / desc）
//   2. 在这里的 AFFIX_POOL 登记一项 { id, weight, enabled }
//   3. 若该强化需要跨回合的状态或标记，只在 abyssAffixes.js 里加字段，不回到本文件写逻辑
// 奇物互动、Boss 专属强化都走 tags：随机时把上下文（{ mode, level, tags }）传进
// abyss.rollAbyssAffixes，标签过滤在这张表上完成，无尽流程一行都不用改。
// 词缀自己需要的「载体技能」（虚无的封印载体、污染的封牌载体）写在 abyssAffixes.js 的
// abyssHelperSkills 里，跟着模式一起注册，但永远不进这张池子。

/** 词缀总开关：false 时无尽任何层数都不再附加深渊强化 */
export const ABYSS_ENABLED = true;

/** 起算层：从第 1 层起每个敌人独立判定（深渊强化整局可随机）；闯关模式的常规随机仍恒为空，只有 Boss 战的固定追加不受此限 */
export const ABYSS_START_LEVEL = 1;

/**
 * 满层：层数达到它之后改为「必定 floor(stage / 满层) 个」，
 * 余数当作额外一个的概率（234 层 = 必定 2 个 + 34% 概率第 3 个）。
 */
export const ABYSS_FULL_LEVEL = 100;

/**
 * 词缀池。weight 是同一批抽样里的相对权重（全部写 1 即等概率）。
 * category 只是给人看的分类，不参与随机。
 * tags 是「准入门槛」，默认留空 = 通用词缀，任何场合都可能随机到；
 * 只有 Boss 专属这类词缀才写 tags，并在随机时由调用方把对应标签放进 context.tags——
 * 写进 tags 的词缀在没带该标签的场合（含普通无尽）一律不进池。
 * enabled: false 表示下架（旧存档还带着它的敌人会被 state.js 读档清洗剔除，且不会再随机到）。
 */
export const AFFIX_POOL = [
	{ id: "abyss_buqu", weight: 1, enabled: true, category: "防御" },
	{ id: "abyss_jianbi", weight: 1, enabled: true, category: "防御" },
	{ id: "abyss_kuangre", weight: 1, enabled: true, category: "节奏" },
	{ id: "abyss_liesha", weight: 1, enabled: true, category: "进攻" },
	{ id: "abyss_xuwu", weight: 1, enabled: true, category: "干扰" },
	{ id: "abyss_jingxiang", weight: 1, enabled: true, category: "反弹" },
	{ id: "abyss_wuran", weight: 1, enabled: true, category: "干扰" },
	{ id: "abyss_yongheng", weight: 1, enabled: true, category: "防御" },
	{ id: "abyss_fuchou", weight: 1, enabled: true, category: "进攻" },
];

/**
 * 单个敌人最多能拿到几个词缀：null 表示不设上限（只受词缀池大小限制，即不重复地全拿到）。
 * 层数再高也不会出现同一个敌人身上重复同一个词缀——随机永远是「不放回抽样」。
 */
export const ABYSS_MAX_AFFIXES = null;

/** 敌人身上「深渊强化」标记的显示文字（与玩家的「强化」标记同一套机制） */
export const ABYSS_MARK_TEXT = "深渊";
