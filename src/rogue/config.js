// 奥特之星·肉鸽：全部可调常量的唯一落点。
// 敌人数值、技能效果、奖励金额等具体内容一律在 data/ 下填写，本文件只放机制参数。

export const MODE_ID = "aozhan_rogue";
export const MODE_TRANSLATE = "奥特肉鸽";
/** 扩展目录名，addMode 用它定位模式封面 */
export const EXTENSION_NAME = "奥特之星";
// 模式选择界面的封面图；换图只改这一行
export const MODE_SPLASH = "ext:奥特之星/assets/sundry/rouge.jpg";
/** 大厅背景音乐（存档页与营地循环播放，进战斗停止）；换曲子只改这一行，路径要与 data/assets.js 清单一致 */
export const LOBBY_BGM = "extension/奥特之星/assets/audio/rogue/start.mp3";
/**
 * 战斗背景音乐池：进战斗时随机抽一首单曲循环，战斗结束停止。
 * 改动曲目只改这个数组；每首的路径同样要与 data/assets.js 清单一致。
 */
export const BATTLE_BGM_LIST = [
	"extension/奥特之星/assets/audio/atm.mp3",
	"extension/奥特之星/assets/audio/djsj1.mp3",
	"extension/奥特之星/assets/audio/djsj2.mp3",
	"extension/奥特之星/assets/audio/haiyang.mp3",
	"extension/奥特之星/assets/audio/heiandijia.mp3",
	"extension/奥特之星/assets/audio/jsts.mp3",
	"extension/奥特之星/assets/audio/mks.mp3",
	"extension/奥特之星/assets/audio/guaishou1.mp3",
	"extension/奥特之星/assets/audio/guaishou2.mp3",
	"extension/奥特之星/assets/audio/guaishou3.mp3",
	"extension/奥特之星/assets/audio/guaishou4.mp3",
];

/** lib.storage 中存放六槽存档的键名 */
export const STORAGE_KEY = "rogueSlots";
/** 无尽模式历史最高记录：独立于六个存档槽，无尽失败删档也不清它 */
export const BEST_ENDLESS_KEY = "rogueBestEndless";
/** 存档 schema 版本，只做单调递增迁移。v2 新增 shopRefreshesRemaining（每局免费刷新次数）；v3 新增 currentBattle.enemies（进行中战斗保存完整敌方阵容） */
export const RUN_VERSION = 3;
export const SLOT_COUNT = 6;

/** 新建一局时的初始资源（只对新档生效，旧存档不会被补发）。金币 50 = 技能基准价，第一关进商店即可购买 */
export const INITIAL_CURRENCY = { gold: 50, exp: 2 };

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
/** 每局的免费刷新次数：新建存档与「成功通关进入下一局」时恢复到这么多，失败与重进商店都不补 */
export const SKILL_REFRESH_PER_LEVEL = 2;
/** false 时已拥有的技能不再进入随机候选池 */
export const ALLOW_DUPLICATE_SKILLS = false;

/**
 * 技能定价：SKILL_BASE_PRICE 是两种模式共用的基准价系数。
 * 闯关基准价永远固定为它，不随关卡/胜场/等级增长；
 * 无尽基准价为 floor(SKILL_BASE_PRICE × √当前关卡)——第 1 关即 50，之后随 √n 增长。
 * 实际售价在基准价 ±SKILL_PRICE_SPREAD 内随机后向下取整（第 1 关 50 → 37~62），并在生成商店候选时定死。
 */
export const SKILL_BASE_PRICE = 50;
export const SKILL_PRICE_SPREAD = 0.25;
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

/**
 * 选将页每页显示多少张武将牌。
 * 本体按自己的配置 showMax_character_number 分页（这台机器上是 10），超出当前页的牌只是被
 * 加上 .nodisplay，所以光把窗口拉高刷不出多余的行——要一行多放几张只能改这个数。
 */
export const CHARACTER_PICKER_PAGE_SIZE = 24;

/** 传给 game.addMode 第三参的 mode.config：死亡时本体要读它，必须至少是对象 */
export const MODE_SETTINGS = {};

export const LIBRARY_TEXT = {
	newRun: "新建",
	remove: "删除",
	emptySlot: "空存档",
	back: "返回",
	confirmRemove: "确定删除该存档？此操作不可撤销。",
};
