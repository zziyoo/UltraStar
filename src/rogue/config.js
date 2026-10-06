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
 * 战斗背景音乐池：进战斗时随机起一首，一首放完随机接下一首（不与刚放完的重复）连播，
 * 失败结算与页面重载才收掉。改动曲目只改这个数组；每首的路径同样要与 data/assets.js 清单一致。
 */
export const BATTLE_BGM_LIST = [
	"extension/奥特之星/assets/audio/atm.mp3",
	"extension/奥特之星/assets/audio/djsj1.mp3",
	"extension/奥特之星/assets/audio/djsj2.mp3",
	"extension/奥特之星/assets/audio/haiyang.mp3",
	"extension/奥特之星/assets/audio/heiandijia.mp3",
	"extension/奥特之星/assets/audio/igniz.mp3",
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
/**
 * 闯关模式历史最高记录：与无尽同一套「独立存储键、删档不清」。
 * 记的是**刚好打通最后一关那一刻**手上的金币与经验，两项各取各的历史最大；
 * 通关后重复挑战不再记第二次（判据见 flow/result.js）。
 */
export const BEST_CHALLENGE_KEY = "rogueBestChallenge";
/** 图鉴：六个存档槽共用的公有数据，删档与新建都不清；run.collection 仍各自照写，落盘时并进来 */
export const COLLECTION_KEY = "rogueCollection";
/**
 * 存档 schema 版本，只做单调递增迁移。
 * v2 新增 shopRefreshesRemaining（每局免费刷新次数）；v3 新增 currentBattle.enemies（进行中战斗保存完整敌方阵容）；
 * v4 新增无尽模式的 pendingEvent（待处理事件）/ collection（图鉴）/ curios（已拥有奇物）/ curioOffers（奇物商店候选）；
 * v5 给 currentBattle.enemies 的每一项新增 abyss（该敌人的深渊词缀 id 列表；旧档缺字段按「本关没有词缀」补齐，不重掷）；
 * v6 新增 curioQuality（已拥有奇物的当前品质覆盖表；旧档按空表补齐 = 全部停在初始品质）；
 * v7 新增 abyssDebt（经验泉欠下的「下一场每个敌人追加词缀」）、curioOfferQueue（黄金罗盘多给的那批奇物候选），
 * 并让 currentBattle 携带 rift（这一场是深渊裂隙：胜利只发定死的倍率奖励、不推进关卡、不掷事件与奇物商店）。
 * v8 新增 challengeStages（闯关模式前 10 关的敌方配置抽取结果：建局时一次性从 data/challengeStages.js
 * 的配置池抽出并落盘，读档/重进/失败重战都原样沿用；旧档缺字段按空数组补齐，首次开战时补抽一次，之后绝不重掷）。
 * v9 新增 skillShopLocked / curioShopLocked（技能商店与奇物商店的锁定开关，来源是「收藏家的橱窗」奇物；
 * 旧档按未锁定补齐，且只有当前确实持有对应锁定能力时才保留——稀有只锁技能、史诗两个都能锁）。
 * 同一版本内 shopOffers 的每一项可多一个 carried（橱窗留到下一关的那张「已购买」残卡：继续占货架、
 * 但不再吃新的一局的购买额度）；缺这一项一律按没留货处理，不需要抬版本号。
 * v10 新增 challengeComboStages（闯关模式第 11~30 关的双人组合抽取结果：首次进入 11~30 关时
 * 一次性从 data/challengeCombos.js 的组合池抽出 10 个并落盘，第 11~20 关按位使用，
 * 第 21~30 关复用同一结果再加扩展池随机第三人；旧档缺字段按空数组补齐，首次需要时补抽一次，
 * 之后绝不重掷）。
 * 各版本新增字段旧档一律按空值补齐，绝不重掷。
 */
export const RUN_VERSION = 10;
export const SLOT_COUNT = 6;

/**
 * 新建一局时的初始资源（只对新档生效，旧存档不会被补发）。金币 50 = 技能基准价，第一关进商店即可购买；
 * 经验与「各自模式的首级升级价」对平：闯关 2（固定表首项），无尽 20（= ENDLESS_STAT_UPGRADE_BASE×√1，见 state.js:createRun）
 */
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
/**
 * 闯关模式走「关卡配置池」的关数（前 10 关）：这些关的敌人不再按扩展角色池随机，
 * 而是用建局时从 data/challengeStages.js 配置池里不重复抽出的配置生成（run.challengeStages）。
 * 第 11 关起改走「双人组合池」（见 CHALLENGE_COMBO_LEVELS），无尽模式不使用这两张表。
 */
export const CHALLENGE_STAGE_LEVELS = 10;
/**
 * 闯关模式走「双人组合池」的关数（第 11~20 关）：首次进入 11~30 关时一次性从
 * data/challengeCombos.js 的组合池不重复抽出 10 个组合存进 run.challengeComboStages，
 * 第 N 关（11~20）用 challengeComboStages[N-11]；第 21~30 关不重新抽，
 * 复用同一结果——第 N 关（21~30）= challengeComboStages[N-21] 的双人组合 + 扩展池随机第三人。
 */
export const CHALLENGE_COMBO_LEVELS = 10;

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
 * 无尽模式的属性升级经验 √ 系数：升到 N 级花 floor(系数 × √N)（N=1..10：20,28,34,40,44,48,52,56,60,63，
 * 单属性 0→10 共 445、三项 1335）。只有无尽用它；闯关仍走 data/stats.js 的固定价格表（三项 330 与 29 关累计经验对平）。
 * 改这个数即整体缩放无尽曲线的陡峭度。
 */
export const ENDLESS_STAT_UPGRADE_BASE = 20;

// ---------------------------------------------------------------- 无尽模式：事件与奇物
// 以下参数只作用于无尽模式；闯关模式不触发事件、商店也没有奇物栏。

/** 战斗胜利后触发事件的概率（Math.random() < EVENT_TRIGGER_RATE 即触发） */
export const EVENT_TRIGGER_RATE = 0.33;

/**
 * 奇物定价：与技能同一条 √ 关曲线，基准价 floor 换 round（见 curioManager.getCurioBasePrice）。
 * 实际售价 = round(基准价 × random(1-CURIO_PRICE_SPREAD, 1+CURIO_PRICE_SPREAD) × 奇物自带 priceMultiplier)，
 * 在生成奇物候选时定死并写进存档，重载不重掷。
 */
export const CURIO_BASE_PRICE = 50;
export const CURIO_PRICE_SPREAD = 0.25;
/**
 * 奇物品质升级价：升级费用 = CURIO_UPGRADE_PRICE_MULTIPLIER × getCurioBasePrice(升级时的 run.level)。
 * 按「当前升级时」的关卡现算，与购买时的价格无关；等级越高越贵（31 层 1390、100 层 2500、234 层 3825）。
 */
export const CURIO_UPGRADE_PRICE_MULTIPLIER = 5;
/** 每批奇物候选的个数 */
export const CURIO_OFFER_COUNT = 3;
/**
 * 奇物商店的触发概率：无尽模式每关战斗胜利后先于事件判定掷骰，命中才刷新一批候选，
 * **未命中直接清空**（旧批次不留着，避免同一批货挂十几关不动）；rng 可注入。
 * 一批只卖一个：买到即整批下架（buyCurio 清空 curioOffers），商店分区随之隐藏。
 * 注意这条概率同时决定「商店多久出现一次」——批次不再留存后，平均 1/该值 关才看得到一次
 * （0.2 = 约 5 关一次）。界面上那句「有 N% 概率刷新」由 `ui/hub.js` 按这个数现算，改这里就够。
 */
export const CURIO_SHOP_RATE = 0.2;

/**
 * 深渊裂隙的三档赌局（选项顺序即 data/events.js 里写死的顺序）：
 * enemies 是这一场的敌人数，multiplier 是「本层胜利奖励基准 ×N」的金币与经验倍率。
 * 裂隙战不算入关卡层数，也不触发事件与奇物商店——见 mode.js 的裂隙结算分支。
 */
export const RIFT_TIERS = [
	{ enemies: 1, multiplier: 5 },
	{ enemies: 5, multiplier: 50 },
	{ enemies: 10, multiplier: 150 },
];
/** 深渊裂隙：每名敌人固定自带的额外深渊强化个数（与常规随机词缀同池、不放回、不重复） */
export const RIFT_EXTRA_AFFIXES = 1;
/** 经验泉「再饮一口」欠下的债：下一场战斗每名敌人追加几个深渊强化 */
export const SPRING_DEBT_AFFIXES = 1;
/** 流浪商人的售价 = 奇物基准价 ×该倍数，恒定不打 ±CURIO_PRICE_SPREAD 波动、也不乘品质倍率 */
export const MERCHANT_PRICE_MULTIPLIER = 4;
/** 奇物融合炉的融合费 = 本层基准经验 ×该倍数（品质仍只走一级，与商店升级同一条链） */
export const FORGE_EXP_MULTIPLIER = 3;

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
