// 奥特之星·肉鸽：全部可调常量的唯一落点。
// 敌人数值、技能效果、奖励金额等具体内容一律在 data/ 下填写，本文件只放机制参数。

export const MODE_ID = "aozhan_rogue";
export const MODE_TRANSLATE = "奥特肉鸽";
/** 扩展目录名，addMode 用它定位模式封面 */
export const EXTENSION_NAME = "奥特之星";
// 模式选择界面的封面图；换图只改这一行
export const MODE_SPLASH = "ext:奥特之星/assets/sundry/rouge.jpg";

/** lib.storage 中存放六槽存档的键名 */
export const STORAGE_KEY = "rogueSlots";
/** 存档 schema 版本，只做单调递增迁移 */
export const RUN_VERSION = 1;
export const SLOT_COUNT = 6;

export const RUN_MODE = {
	challenge: "challenge",
	endless: "endless",
};
export const RUN_MODE_LABEL = {
	challenge: "闯关模式",
	endless: "无尽模式",
};
/** 闯关模式总关卡数；无尽模式不使用 */
export const CHALLENGE_TOTAL_LEVELS = 30;

/** 战斗状态机：主界面 ↔ 战斗中 */
export const BATTLE_STATUS = {
	battle: "battle",
};

/** 货币定义：新增货币只需在这里加一项，奖励/惩罚/商店会自动纳入 */
export const CURRENCIES = ["gold", "exp"];
export const CURRENCY_LABEL = { gold: "金币", exp: "经验" };

/** 属性强化：三项，顺序即商店展示顺序 */
export const STAT_IDS = ["defense", "draw", "attack"];

export const SKILL_SLOTS = 3;
export const SKILL_OFFER_COUNT = 3;
export const SKILL_PURCHASE_COUNT = 1;
/** false 时已拥有的技能不再进入随机候选池 */
export const ALLOW_DUPLICATE_SKILLS = false;

/** 技能在商店的默认价，data/skills.js 未单独标价时用它 */
export const DEFAULT_SKILL_PRICE = 100;
/** 商店里购买技能用哪种货币 */
export const SKILL_CURRENCY = "gold";
/** 属性升级用哪种货币 */
export const STAT_CURRENCY = "exp";

/**
 * 闯关失败的损失规则。
 * currencyLossRate 支持写成一个数字，或按货币分别定义的映射表；
 * fallback: "choose" 让玩家在“失去一个技能 / 一项属性等级 -1”之间自选。
 */
export const FAILURE_POLICY = {
	currencyLossRate: 0.5,
	fallback: "choose",
};

/** 玩家可选角色白名单；null 表示按通用规则从 lib.character 里筛 */
export const ROSTER_WHITE_LIST = null;

/** 选将窗口至少显示几行武将牌（想多显示只改这里：界面按真实牌高换算窗口高度） */
export const CHARACTER_PICKER_ROWS = 3;

/** 传给 game.addMode 第三参的 mode.config：死亡时本体要读它，必须至少是对象 */
export const MODE_SETTINGS = {};

export const LIBRARY_TEXT = {
	newRun: "新建",
	remove: "删除",
	emptySlot: "空存档",
	back: "返回",
	confirmRemove: "确定删除该存档？此操作不可撤销。",
};
