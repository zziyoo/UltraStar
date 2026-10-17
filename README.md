# 奥特之星（UltraStar）

无名杀扩展：以奥特曼为核心主题，同时收录其他作品角色与相关内容的综合型扩展项目。

- **核心内容**：奥特曼系列角色与装备，按主题拆分为多个内容分包；
- **收录作品**：奥特曼、原神、崩坏：星穹铁道、赛马娘、KOF、东方Project，以及其他作品（`misc`），目前收录 55 名角色；
- **项目结构**：采用「作品内容包 + 公共核心 + 公共系统 + 素材 + 数据」的模块化组织；
- **设计目标**：让不同作品的内容相对独立，同时共享统一的加载、注册、素材与系统基础设施。

本项目不是简单的"角色包集合"，而是已经完成模块化设计的综合扩展。本文档面向第一次进入仓库的贡献者与后续维护者，说明项目是什么、如何组织、以及如何继续扩展。

## 项目结构

```text
UltraStar/
├── extension.js                  # 无名杀扩展入口（极简）
├── info.json                     # 扩展元信息（名称、作者、版本、文件加载清单）
├── CHANGELOG.md                  # 更新日志
├── LICENSE                       # 许可证
├── README.md
├── src/                          # 扩展级公共代码（与具体作品无关）
│   ├── index.js                  # 扩展对象组装（入口的实际实现）
│   ├── config/
│   │   └── index.js              # 扩展设置项
│   ├── core/
│   │   ├── assets.js             # 素材路径工具
│   │   ├── bootstrap.js          # 扩展初始化流程
│   │   ├── loader.js             # 作品包清单与装备注册入口
│   │   └── registry.js           # 内容合并与注册
│   ├── rogue/                   # 游戏模式：奥特之星·肉鸽
│   │   ├── mode.js               # 模式注册与页面路由、结算编排
│   │   ├── config.js             # 机制参数集中配置（槽数/技能上限/失败规则…）
│   │   ├── state.js              # 六槽存档校验与迁移（纯逻辑）
│   │   ├── shop.js               # 候选随机/购买（只进背包）/装备卸下/升级（纯逻辑）
│   │   ├── skillPool.js          # 商店候选池：作者清单 + 全体武将技能（剔禁用武将）
│   │   ├── curioManager.js       # 奇物系统统一接口：效果叠加/品质升级/商店（纯逻辑）
│   │   ├── eventManager.js       # 无尽事件系统：构建期定死全部随机（纯逻辑）
│   │   ├── enemy.js              # 敌方生成：随机池/关卡配置池/属性分配
│   │   ├── reward.js             # 胜利结算（纯逻辑）
│   │   ├── penalty.js            # 失败惩罚 + 统一的「真正失去技能」（纯逻辑）
│   │   ├── skillSacrifice.js     # 「故人的心」：开局以技能换技能（枚举/真失去/徽记同步）
│   │   ├── battle.js             # 建局与运行时强化（对接本体事件）
│   │   ├── bgm.js                # 大厅 BGM（存档页/营地循环播放，进战斗停止）
│   │   ├── perf.js               # 性能日志（开关 config.PERF_LOG，默认关闭）
│   │   ├── endless/              # 无尽模式专属系统：深渊化强化（abyss 三件套）
│   │   │   ├── abyssConfig.js    # 层数门限与词缀池配置（新增强化只登记这里）
│   │   │   ├── abyss.js          # 按层数算词缀数量、不放回随机、存档清洗（纯逻辑）
│   │   │   └── abyssAffixes.js   # 九个词缀的持恒技本体 + 双键翻译 + 徽记/封印/封牌三枚载体
│   │   ├── data/                 # 作者填写的配置：技能/属性/奖励/关卡敌方配置（enemyGroups 仅旧档迁移用）
│   │   └── ui/                   # 存档页/选角色/主界面/商店/替换/结果/惩罚
│   ├── systems/
│   │   ├── bgm.js                # 技能 BGM 播放系统
│   │   ├── changelog.js          # 更新日志界面
│   │   ├── easterEgg.js          # 彩蛋系统
│   │   └── tierlist.js           # 角色评级系统
│   └── ui/
│       ├── overlay.js            # 通用浮层组件
│       └── characterAnalysis.js  # 单角色强度分析页
├── packages/                     # 作品内容包（内容层）
│   ├── ultraman/                 # 奥特曼（大型包，二级模块化）
│   │   ├── index.js
│   │   ├── loader.js
│   │   ├── equipment/            # 奥特曼装备
│   │   ├── shared/               # 跨分包共用技能
│   │   └── packs/                # 奥特曼主题分包
│   │       ├── eternal-torch/    # 薪火不灭
│   │       ├── daybreak/         # 长夜破晓
│   │       ├── devour-world/     # 雄吞天地
│   │       ├── end-of-all/       # 万物终焉
│   │       └── boundless-cosmos/ # 寰宇无极
│   ├── genshin/                  # 原神
│   ├── honkai-star-rail/         # 崩坏：星穹铁道
│   ├── uma-musume/               # 赛马娘
│   ├── kof/                      # KOF
│   ├── touhou/                   # 东方Project
│   └── misc/                     # 其他作品
├── assets/                       # 素材（文件名全局唯一，按类型分目录）
│   ├── audio/                    # 音频（BGM 与语音 .mp3）
│   │   └── easteregg/            # 彩蛋音频
│   └── image/                    # 图片（角色立绘 .jpg、卡牌图 .png）
│       ├── camp/                 # 势力（阵营）图标
│       └── tierlist/             # 角色评级图
├── data/                         # 纯数据层
│   ├── assets.js                 # 素材清单
│   ├── bgmList.js                # 技能 BGM 数据
│   ├── characterRank.js          # 角色评级数据
│   ├── xnnequipment.js           # 装备元数据
│   └── 装备价值列表.txt           # 装备 AI 价值参考表
└── tools/
    ├── update-manifest.mjs      # 素材清单自动登记（CI 检测到新增素材后自动调用）
├── gen-event-curio-images.mjs # 肉鸽事件/奇物占位图生成器（纯 Node 画 PNG，粗描边徽章/贴纸风；整体浓淡改脚本顶部的 STYLE 常量块，正式美术可直接覆盖同名文件）
    ├── check/                    # 一致性校验脚本
        ├── check-imports.mjs     # import 路径校验
        ├── check-assets.mjs      # 素材引用校验
        └── verify-parity.mjs     # 新旧注册结果一致性对比
    └── test/                     # 逻辑层测试
        ├── rogue.test.mjs         # 肉鸽数据/逻辑层用例
        ├── rogue-mode-smoke.mjs   # 肉鸽模式流程冒烟（配 rogue-noname-stub.mjs 桩）
        └── rogue-noname-stub.mjs  # 本体 API 桩模块
```

## 核心架构

### extension.js

无名杀扩展入口。当前仅数行代码：导入 `src/index.js` 的组装函数并导出。

入口文件应尽量保持简单，只负责进入扩展初始化流程；具体功能由 `src/` 内的模块负责。不要在入口中堆放角色、技能等内容。

### src/

扩展级公共代码。这里不放某一个具体作品的角色内容，只放所有作品都可能使用的公共基础设施。

#### src/core/ —— 项目核心基础设施

| 文件 | 职责 |
| --- | --- |
| `assets.js` | 素材路径常量与工具函数（扩展名、`extension/` 与 `ext:` 两种引用形式），统一素材引用方式 |
| `bootstrap.js` | 扩展初始化流程：`precontent` 阶段注册势力图标、角色立绘替换、隐藏角色等全局内容并触发装备注册；`arenaReady` 阶段负责版本更新公告、基于 `data/assets.js` 清单的素材完整性检测、评级注册与 BGM、彩蛋系统初始化 |
| `loader.js` | 作品包清单 `packages` 数组——所有作品包在此登记；同时提供 `registerAllEquipment()`，统一执行各包的装备注册 |
| `registry.js` | `buildPackage()` 将所有作品包合并为唯一的"奥特之星"总包：按 `CHARACTER_ORDER` 决定选将界面角色顺序，各作品以 `characterSort` 分组的形式表达分包身份 |

`core` 是整个项目的基础层。后续如需继续重构，应优先保证这里与具体作品内容解耦：`core` 只知道"包"的标准接口，不感知任何具体角色或技能。

#### src/systems/ —— 扩展级公共功能系统

| 文件 | 职责 |
| --- | --- |
| `bgm.js` | 技能 BGM 播放系统：读取 `data/bgmList.js` 的映射，在技能触发时播放对应音频，受扩展设置开关控制；肉鸽模式进行中直接返回（模式自带的营地/战斗 BGM 独占声场） |
| `changelog.js` | 更新日志功能：读取并渲染 `CHANGELOG.md`，在设置界面中查看 |
| `easterEgg.js` | 彩蛋系统：定义触发条件、发现记录与彩蛋图鉴 |
| `tierlist.js` | 角色评级功能：注册 `data/characterRank.js` 中的评级数据，并提供评级图查看 |

这里应继续承担"所有作品都可以使用"的公共功能。未来可以增加：图鉴系统、角色搜索系统、角色分类系统、作品索引、全局统计、更多音频/视觉效果系统等。

注意：作品专属逻辑不要直接堆进 `systems`，只有能够跨作品复用的公共系统才应该放这里。

#### src/ui/ —— 扩展 UI

- `overlay.js`：通用浮层组件（样式与弹窗构造），当前被更新日志、角色评级查看等界面复用。
- `characterAnalysis.js`：单角色强度分析页（由强度排行入口打开）。

用于放置与 UI 显示、界面交互、信息展示有关的公共实现。未来可以扩展：作品选择界面、角色图鉴界面、更新日志界面、彩蛋图鉴、角色评级查看、扩展设置界面、更完整的扩展主页等。

#### src/config/ —— 扩展级配置

- `config/index.js`：扩展设置项，当前包括 BGM 播放开关、彩蛋系统开关、肉鸽 BGM 音量（独立于本体音乐音量，0~100，默认 100）、查看历史更新记录、查看角色强度排行、查看彩蛋图鉴、复制仓库地址与版本号显示。

所有与具体作品无关、需要由用户配置的选项，应优先集中在这里管理。

#### src/rogue/ —— 游戏模式：奥特之星·肉鸽

通过本体 `game.addMode()` 注册的正式模式（模式 id `aozhan_rogue`，显示名「奥特肉鸽」），在无名杀的模式选择界面进入。
由 `src/core/bootstrap.js` 的 `precontent` 调用 `registerRogueMode()` 完成注册，自带重复注册防护；
不修改本体源码，也不改动任何现有角色、技能、装备、BGM、彩蛋与评级功能。

| 文件 | 职责 |
| --- | --- |
| `mode.js` | 模式配置对象（`start` / `game.checkResult` / `game.onover` / `element.player.dieAfter` / `get.rawAttitude` / 模式级 skill+translate）、页面路由、存档落盘与战斗编排。商店三个动作（购买 / 属性升级 / 免费刷新）都遵循「先改内存 run → `commit()` 落盘 → 再原位刷 UI」，`commit()` 失败就直接返回，绝不假装成功。`get.rawAttitude` 不能省：本体 `get.attitude` 无条件调它，缺了 AI 一出牌评估就抛错 |
| `config.js` | 机制参数集中处，**改数值只需要看这里**。存档版本 `RUN_VERSION`（当前 15）：v2 免费刷新次数 / v3 完整敌方阵容 / v4 事件·图鉴·奇物 / v5 敌人 `abyss` / v6 奇物品质 / v7 深渊债·裂隙·旧候选队列 / v8 闯关前 10 关配置 / v9 两把商店锁 / v10 双人组合 / v11~12 Boss 改逐场判定 `currentBattle.isBossBattle`（整局 `bossRun` 已删）/ v13 Boss 惩罚欠项 / v14 技能背包 `skillInventory` / v15 Boss 保底改记关卡 `bossPityLevel`。其余旋钮：`SKILL_SLOTS`(3)、`SKILL_OFFER_COUNT`、`SKILL_PURCHASE_COUNT`、`SKILL_REFRESH_PER_LEVEL`(2)、`SKILL_BASE_PRICE`(50) 与 `SKILL_PRICE_SPREAD`(±25%)、`INITIAL_CURRENCY`（金币 50；经验闯关 2 / 无尽 20）、`ENDLESS_STAT_UPGRADE_BASE`(20)、`CHALLENGE_TOTAL_LEVELS`(30)、`CHALLENGE_STAGE_LEVELS`(10)、`CHALLENGE_COMBO_LEVELS`(10)、`EVENT_TRIGGER_RATE`(0.4)、`CURIO_BASE_PRICE`(50)、`CURIO_PRICE_SPREAD`(±25%)、`CURIO_OFFER_COUNT`(3)、`CURIO_SHOP_RATE`(0.15)、`CURIO_UPGRADE_PRICE_MULTIPLIER`(10)、`MERCHANT_PRICE_MULTIPLIER`(4)、`FORGE_EXP_MULTIPLIER`(5)、`RIFT_TIERS`、`RIFT_EXTRA_AFFIXES`、`SPRING_DEBT_AFFIXES`、失败货币损失率与 fallback、`MODE_ID` / `MODE_TRANSLATE` / `MODE_SPLASH`（封面）、`LOBBY_BGM` / `BATTLE_BGM_LIST`、六个独立存储键（`BEST_ENDLESS_KEY` / `BEST_CHALLENGE_KEY` / `COLLECTION_KEY` 与战绩键）、选将页每页张数 `CHARACTER_PICKER_PAGE_SIZE`、可选角色白名单、`PERF_LOG`。**Boss 旋钮**（都只作用于无尽）：`BOSS_RUN_RATE` 0.0625 逐场独立判定、`BOSS_PITY_BATTLES` 16 关保底（只认 `bossPityLevel` 这条关卡记录，任何推进关卡的途径都算进度）、`BOSS_REWARD_MULTIPLIER` 20 / `BOSS_EXP_MULTIPLIER` 8（都不吃奇物加成）、`BOSS_SKILL_DONOR_COUNT` 3、`BOSS_EXTRA_AFFIXES` 1 |
| `state.js` | 六槽存档的校验、默认值修复、版本迁移与序列化安全（纯逻辑）。所有字段按白名单重建、旧档一律静默补默认值：`currentBattle` 只认 `{ status, enemies, rift, isBossBattle }`（敌人每项 `characterId` / `stats`(0..10) / `abyss`(只留在池子里的 id，不重掷) / `skills` / `skillSources` / `maxHp` / `hp`）；`isBossBattle` 是整场唯一权威标记，读档时与敌人的 `boss` 字段对账（矛盾档一律降级为普通场）；`pendingEvent` 只认还在池子里的事件与合法选项（`action` 五种 kind）；`curios` / `curioOffers` / `curioQuality`（只记高于初始品质的档位）/ `skillInventory` / `skills`（装备 ⊆ 背包，背包**绝不**按 `SKILL_SLOTS` 截断）去重保序、剔下架与非法值；`bossPityLevel` 迁移**按存档版本选路径**（v15 只认新字段、v14 按旧计数器 0..19 折算、v13 及更早一律 0，绝不按当前关卡反推）；`shopRefreshesRemaining` 钳到 `0..SKILL_REFRESH_PER_LEVEL`（**已经刷成 0 的原样保留**，当成缺字段就等于白送次数）、`abyssDebt` 夹 `0..10`、`currentBattle.rift` 只留 `{level, enemies, affixes, gold, exp}` 五个标量、`pendingBossPenalty` 的 `needSkill: true`（v13 旧档）**原样保留**交给流程层一次性清算（清洗层绝不重复处罚）；写入前 `toSerializable` 禁止 Player/Card/函数/循环引用进存档 |
| `shop.js` | 技能候选随机、按模式定价、购买（v14 起只进 `skillInventory`，**不再替换、也不自动装备**）、装备/卸下、属性升级校验（纯逻辑）。售价 = 基准价 ±25% 后向下取整（闯关恒 50；无尽 floor(50×√当前关卡)），**生成候选时定死写进 `shopOffers`**，重进/刷新/重载都不重掷；随机时排除角色原生技能与**完整背包**，但不做永久购买历史（真正失去的技能还能再出现）。`refreshSkillOffers` 三道门槛：还有次数、本次还没买过、**技能商店没被 🔒 锁着**——判据只在这一处，任何 UI 入口都绕不过去。`getStatUpgradePrice` 按模式分流（闯关读固定表、无尽 floor(20×√N)），只从 `run.mode` + `run.stats` 现算 |
| `skillPool.js` | 商店候选池 = 作者清单 ∪ **全体可选武将的技能**（与选将页同一套 `isPlayerUsable`，Boss/隐藏 Boss 不进池）。**禁将硬否决**：技能（含 `derivation` 衍生技）只要属于任何一个禁将角色就不进池，哪怕别的未禁用武将也有同一条；禁将名单取本体按模式分开存的 `*_banned` 全并集（任一模式禁过就算禁）。`isSkillBlockedByBan` 供读档清洗与购买前校验复用；武将技能还要过本体 `lib.filter.skillDisabled` |
| `curioManager.js` | 奇物系统统一接口（纯逻辑），**不为单个奇物写独立代码**。`sumCurioEffects` / `getBonus` 按**当前品质**叠加效果：战斗内键（`extraPhase` / `extraDraw` / `dyingSave`+`dyingRecoverToRatio` / `roundHeal` / `turnHeal` / `firstDamageBonus` / `unrespondable`+`unrespondableLowHp`+`unrespondableCardDamage` / `hurtDamageNext`·`Round`·`Game` / `dyingRecallChance` / `killGainMaxHp`+`killHeal`·`killHealToMax`·`killDrawToMaxHp`·`killDrawMaxHp` / `skillSacrifice`）由 `battle.js` 建局时写进 `player.storage.rogue_curio`；结算键（`expRate` / `goldRate`+`goldRateSpread` / `extraCurioShopChance` / `goldOfHeld` / `goldOnSkillLoss` / `expOnSkillLoss` / `eventExpRate`）与商店键（`extraShopRefresh` / `lockSkillShop` / `lockCurioShop`）由各流程现查。品质：`getInitialQuality`（= `rarity`，新获得的奇物永远从这里开始）/ `getCurioQuality` / `getNextCurioQuality` / `getCurioEffect`（`qualityEffects` **整份替换** effect）/ `checkCurioUpgrade` / `upgradeCurio`（只改经验与品质两项）。文案 `describeCurioEffects` / `describeCurio` 一律按当前效果表自动生成（没有手写文案字段）。商店侧：`rollCurioOffers`（三个候选、同概率、价格定死）/ `buyCurio`（扣金币 + 入袋 + 写图鉴 + 买到即整批下架）/ `grantRandomCurio`（送出同款自动从候选撤下）/ `grantCurioById` / `pickUnownedCurioOfRarity` / `getUpgradableCurios` / `getMerchantPrice` / `rollMerchantCurio`（不排已拥有）/ `takeNextCurioBatch`（旧档队列）|
| `eventManager.js` | 无尽事件系统（纯逻辑）。构建期就**把全部随机定死**：`goldByWin`/`expByWin` 换算成固定值、`outcomes` 预掷出唯一结果、随机奇物掷定成具体 id、交互型 `action` 的货价/敌人数/融合费全部算好——读档恢复绝不重掷。`resolveEventChoice` 结算：先验余额（不足整单拒绝）、属性钳 `0..maxLevel`、交互型选项**一个钱不扣也不清 `pendingEvent`**（回流程层开子页）。**两种「用不了」分开**：`isChoiceAffordable` 管「钱不够」（置灰、点了毫无反应），`getBlockedMessage` 管「此刻没有对象可作用」（照常可点，点下去只弹 `blockedText`、一个钱不扣）；`boostEventExp` 是记忆棱镜唯一的加成点 |
| `reward.js` | 胜利结算：入账、关卡推进、把 `shopRefreshesRemaining` 补满（**只有真的通关进下一局才补**）、掷奇物商店（`getCurioShopChance(run)` 现读存档现算，命中才摇三个候选并定死价格，未命中清空旧批次；**收藏家的橱窗是唯一豁免**：锁着就把整批候选连同**「买过的那张」**原样留到下一关——那张继续显示「已购买」、多打一个 `carried` 标记、不再吃新一局的购买额度），**入账前**按手上奇物放大奖励、只看这一局开始前就持有的（储蓄罐是唯一排在入账**之后**算的，因为它乘的是已到手总额） |
| `skillSacrifice.js` | 「故人的心」：战斗开始时玩家可以失去任意个技能、令任意名敌人**各**失去等量个技能（每名被指定的敌人独立扣 X 个，不是所有敌人合计 X 个；至少指定一名其他角色，技能不足 X 的敌人不能作为目标，其余敌人可跳过）。三条纪律：**只动战斗里的 Player**（存档与背包一个字不改，所以不会误触发遗忘之石/贪食魔盒，下一场按存档重新 `grantSkills` 又能再来一次）；**真失去**走本体 `player.removeSkill(id, true)`（与断肠同一套底层；持恒技不受任何保护）；**跟随件一起走**（`group` 伙伴与 `subSkill` 子技能，被别的已拥有技能共享时留下）。枚举口径**照本体「失去已有技能」的四个技能**（迎乡 / 恤民 / 合韵 / 脱难）：`getSkills(null, false)` + 只剔 `charlotte` / `superCharlotte` / `fixed` / 无文案——`unique`、限定技、觉醒技、一次性技都放行。失去后同步深渊徽记与复制技能徽记（按「还在不在身上」过滤并去重、空了连徽记一起摘），无人再持有污染 / 虚无时放开它们留在玩家身上的封牌与屏蔽器。跟随件（`group` 伙伴、`subSkill` 子技能）折进主技能一起失去，被别的已拥有技能共享时原地留下——`group` 伙伴按本体语义可以只在触发器注册表里、不在技能表，本体的 `removeSkillTrigger` 会把它一起摘掉，所以补注册的判据是「还有别的已拥有技能依赖它」，否则「技能还在、效果哑了」——补的时候走 `addSkillTrigger(技能, hidden, triggeronly = true)` **只补触发器、不重跑 `init`**（完整模式会因为 `initedSkills` 已被摘名而重新执行 `init`，把属性/标记/资源加第二遍），同时手动补回 `info.global` 的全局技登记与 `initedSkills` 登记；结算前整单核验（玩家 X 个、每名被选中敌人各 X 个，技能与目标不得重复，且每条都还在身上），**只删玩家指定过的技能、绝不自动顶替**（选择失效就整单不做并请玩家重选一次），单件 `onremove` 抛错只影响那一件，并把它半摘状态下的触发器残留补全 |
| `penalty.js` | 失败结算（按比例扣货币、货币不足 fallback、无尽删档判定，纯逻辑）；外加**统一的「真正失去技能」** `loseSkill` / `loseSkills`：只从 `skillInventory` 删（装备中的同时卸下）、按当前持有的遗忘之石/贪食魔盒**逐件**结账（奖励与删除同一次提交，绝不重复发）。基准关卡默认 `run.level`，Boss 流程必须显式传「刚打赢的那一关」（胜利结算已把 level 推进到下一关）；`recoverBossWonLevel` 供 v13 旧档的一次性清算反推关卡 |
| `enemy.js` | 敌方随机生成（纯逻辑 + 只读 `lib`）。人数：1~10 关 1 个、11~20 关 2 个、21~30 关 3 个，无尽第 31 关起恒 3 个。**两张池绝不混用**：闯关只从本扩展角色里选，无尽 = 本体角色全集 − 本扩展角色，再剔禁用（`forbidai` / 本体判禁 / 跨模式禁将并集）。属性用「带上限的顺序分配」把 `min(关卡, 30)` 点分到防御/过牌/攻击（单项 ≤10）。**阵容在开战前定死随 `currentBattle.enemies` 落盘**，恢复战斗绝不重掷；深渊词缀每人独立掷一次（`isAbyssStage` 先按模式挡掉）。闯关前 10 关走 `data/challengeStages.js` 配置池（建局时抽定 10 个落盘）、11~20 关走 `data/challengeCombos.js` 双人组合、21~30 关复用同一结果加**扩展池随机第三人**（第三人排除与固定两人重复、位置在三个空位随机但左右相对顺序永不变，找不到合法第三人就明确失败，绝不复制固定角色凑数）；这一路的开战校验放行禁将角色（`allowBanned`）。Boss：`createBossEnemyConfig` 只出 1 名敌人并复制另外三个不同角色的全部技能（`pickBossSkillDonors` 按需抽取，来源本人禁将 / `forbidai` 都不能供能），复制来源记在 `skillSources` 里随阵容落盘（旧档没这字段就整列不显示来源、绝不倒推），体力 ×2 只在建局时做一次、存档只记 `boss` 标记 |
| `battle.js` | 用本体 `prepareArena / gameDraw / phaseLoop` 开一局，强化只施加到当前 Player。建局必须 `assignPlayerIds()`（缺 `playerid` 本体不登记触发钩子，所有触发技全哑）；**运行时发技能一律走 `grantSkills()`**：只对调用方列出的主技能调用 `addSkill`——本体 `addSkill→addSkillTrigger` 会自行展开 `group` 并登记伙伴的 `global` / `init` / `initedSkills` / 触发器，伙伴因此**不进 `player.skills`、不单独上技能面板**（避免 yyfuqi 与 yyfuqi_fuqi 同时显示【伏骑】），也**永不回写存档**。敌人的属性走玩家的同一张效果表（`sumStatEffects`）；深渊词缀、复制技能与属性等级都记进 `player.rogueEnhanceInfo` 供徽记面板读数。徽记点击统一走 `bindMarkTap`（掐掉轻触补发的合成 click，否则会被「点框外关闭」吃掉）并排在 `applyEnemyModifiers` 之后。**故人的心**：双方技能挂完、`gameStart` 之前 `await runSkillSacrifice(...)`——建局链上唯一会等玩家操作的一步，任一侧没筹码就直接返回、异常只报一声按「未发动」继续，绝不卡住开局 |
| `bgm.js` | 大厅与战斗 BGM。大厅循环播 `LOBBY_BGM`、**还在放就绝不打断**（只有页面重载后的全新元素才从头播）；战斗从 `BATTLE_BGM_LIST` 随机起一首、onended 连播，只在**失败结算**停（胜利结算让它一路响过结算页）。肉鸽音轨音量走扩展独立设置 `rogue_bgm_volume`，与本体音乐音量解耦；任一肉鸽音轨在放就把本体 `ui.backgroundMusic` 音量按成 0（用音量而不是 `pause()`——本体那份可能还在缓冲，`pause()` 会漏掉它稍后的自动播放） |
| `perf.js` | 性能日志（开关 `config.PERF_LOG`，默认 false）。`perfStart` / `perfMark` / `perfCount` / `perfEnd` 覆盖「开始下一关」到正式开局整条链；关闭时全部是空操作，打开后按一条摘要打印到控制台并挂到 `window.roguePerfLast`。打开方式：改 `PERF_LOG`、控制台 `globalThis.roguePerfLog = true`、或 `localStorage.setItem("roguePerfLog","1")` 后重载。只加日志，不碰随机与存档 |
| `endless/abyssConfig.js` | 深渊化参数（只放参数）：`ABYSS_ENABLED`、`ABYSS_START_LEVEL`(1)、`ABYSS_FULL_LEVEL`(100)、`AFFIX_POOL`（每项 `{ id, weight, enabled, category, tags? }`）、`ABYSS_MAX_AFFIXES`（null = 只受池子大小限制）、`ABYSS_MARK_TEXT`。**新增强化三步**：`abyssAffixes.js` 写技能本体与文案 → 这里登记一项 → 完事，无尽流程一行都不用改。`tags` 是准入门槛（写了就只在带该标签的场合进池，普通词缀别写，否则通用池会被筛空） |
| `endless/abyss.js` | 深渊化的「算数量 + 随机 + 清洗」层（纯逻辑，可在 Node 里直接测）。数量：1~99 层按 `stage%` 概率拿 1 个；100 层起必定 `floor(stage/100)` 个、再按 `(stage%100)%` 概率多 1 个。`rollAbyssAffixes` 按 weight **不放回**抽样（同一敌人绝不重复，池子排空给更少条目）；`normalizeAbyssIds` 是读档白名单（只留在池子里的、去重、按池序、夹上限）；`isAbyssStage` 是唯一大门（非无尽 / 低于起始层 / 总开关关掉全挡掉）。随机只发生在开战前生成阵容那一次 |
| `endless/abyssAffixes.js` | 九个词缀的持恒技本体（不屈 / 坚壁 / 狂热 / 猎杀 / 虚无 / 镜像 / 污染 / 永恒 / 复仇）+ `affixText` 文案表（名称与描述的唯一来源）+ 双键翻译 + `abyss_affix` 徽记载体。词缀全是持恒技（`persevereSkill`：面板显示「持恒技」分类，且不被白板类失效效果封禁），随模式注册、**只有进肉鸽才存在**；三枚载体（`abyss_xuwu_blocker` 屏蔽器 / `abyss_xuwu_release` 解除宿主 / `abyss_wuran_lock` 封牌 mod）同样随模式注册但不进随机池。`hasAffixHolder` / `releaseWuranLocks` / `releaseXuwuBlocks` 供「故人的心」摘词缀后放开留在玩家身上的封牌与屏蔽器；三条记账标量在各自 `onremove` 里清掉。文件头列了十条读源码核对过的本体契约 |
| `data/` | 作者填的内容配置。`events.js`（21 个事件）：名称/描述/配图/选项，支持固定值、`goldByWin`/`expByWin` 倍率、随机奇物·技能·属性（`outcomes` 写概率、生成时预掷）；交互型选项写 `action`（五种 kind）、「此刻没有对象可作用」写 `blockedText`，`hideCost` / `hideBalance` / `followUp` 三个键的说明都在文件头。`curios.js`（20 件）：名称/背景描述/配图/**初始品质** `rarity`/售价倍率/`effect` + `qualityEffects`（**整份替换**），界面文案由效果键自动生成；背景 `description` 为古风短句，只影响展示。`skills.js` 技能池与机制技、`stats.js` 闯关属性表、`rewards.js` 奖励表、`challengeStages.js`(34 条) 与 `challengeCombos.js`(33 条) 两张闯关敌方配置池、`enemyGroups.js` 只服务 v2 旧档迁移 |
| `ui/` | 存档页、选角色、营地、商店、技能管理页、奇物管理页、结算、Boss 惩罚选择、事件页与三个事件子页、图鉴页、「故人的心」两阶段选择页（`ui/skillSacrifice.js`）。除选角色与失败 fallback 外都是自建浮层（`openOverlay` 两层结构：浮层管遮罩与滚动、`.wm-rogue-stage` 负责居中；触摸靠 `isolateOverlayTouch` 隔离，否则手机上一律滚不动）。通用纪律：新类名必须登记进 `styles.js` 末尾那几张 id 级 `display !important` 名单（漏一条就会被主题的裸 `div{display:inline-block;position:absolute}` 压坏）；页面是「标题 + 可独立滚动的正文 + 钉底按钮」三段式，正文 `min-height:0` 才滚得动；购买/升级/装备都原位刷新（`refreshShop` / `refreshSkills` / `refreshCurios`）不重开窗口，免得把滚动位置甩回顶部；技能文本一律过 `sanitizeSkillText` 把 `<noname-poptip>` 转成可读文字；字号层级与色值全在 `ui/styles.js`（商店标题 30 → 资源数值 26 → 区域标题 24 → 技能名 22 / 属性名 21 → 等级与价格 18 → 按钮 18 → 描述 17（限高 5 行，点卡片看完整说明）→ 属性效果 16 → 出处与说明 14，改字只动这几处）。营地两行按钮（继续玩 / 离开）、商店顶栏四块资源（技能与奇物两块本身是管理页入口，奇物只在无尽给）、事件页「钱不够置灰 / 没对象可作用照常可点」两种手感、图鉴「已收录照实写全、未收录不挂监听」 |

设计约束：

- **存档只走本体机制** `game.save("rogueSlots", lib.storage.rogueSlots)`（按模式分键进本体数据库），写入前 `toSerializable` 校验、禁止 Player/Card/函数/循环引用进入存档；最高记录、闯关最高记录、图鉴各用一个独立键，都「删档不清」。
- **一关 = 一次对局会话**，结算后 `directstart + game.reload()` 回主界面（与本体 `brawl.js` 同做法）。**不在同一页面里再开一局**：本体 `game.over` 会把这一局拆干净，旧会话里再 `game.loop()` 既不报错也不开场（真机表现为静默无反应）。所以任何开战只发生在「页面加载时的恢复页」或「营地按钮」两处；事件里要开战的（深渊裂隙）先落盘再 `reloadNow()`，由恢复页在全新页面上 `launch()`。
- 「退出肉鸽模式」与存档页的「返回」都是**回到游戏初始界面**：先落盘（`rogueActive` 置 -1）、清掉 `directstart` 与 `show_splash_off` 后自己 `window.location.reload()`——不能直接用 `game.reload()`，它会顺手写 `show_splash_off = true`，重载后又落回本模式的存档页。
- **随机只在「建局 / 生成」那一刻发生一次**：敌方阵容（角色 + 属性分配 + 深渊词缀）随 `currentBattle.enemies` 落盘；事件的全部随机结果在构建期预掷定死；商店候选与价格生成时定死；闯关的两张配置池在建局 / 首次进入区间时抽定。之后读档、重进、失败重战、刷新页面一律沿用，**绝不重掷**。
- 强化只改运行时 Player，绝不回写 `lib.character`；肉鸽技能挂在模式配置的 `skill`/`translate` 上，只有进入本模式才注册。
- 运行时发技能统一走 `battle.js:grantSkills()`：只对调用方列出的主技能调用 `addSkill`；`group` 伙伴由本体 `addSkillTrigger` 内部展开，只登记触发器与初始化，**不进 `player.skills`（技能面板只显示主技能）**，也永不回写 `run.skills` / 敌人配置 / 属性表。v14 起 `skillInventory` 是「拥有」的唯一权威列表，`run.skills` 只表示「当前装备中」；包里卸下不等于失去，所以两条「真正失去技能」的通道（Boss 惩罚、事件）都只从背包删。
- **技能 content 必须写成 `async`**：同步 function 会被本体 `StepCompiler` 反编译重建，模块 import 进来的辅助函数全部拿不到；`filter` / `mod` / `intro.mark` 不走这个编译器，闭包正常。
- **触发技判时机只能用 `event.triggername`**，不能判 `trigger.name`——传给 content 的 `trigger` 是被触发的基事件，`name` 只会是 `damage` / `phaseDraw`。
- 属性强化与奇物的机制技都带 `popup: false`（十周年UI 的「技能名 + 描述」大字只能在这里关，`nopop` / `logv` 都管不到）。玩家身上是一个「强化」徽记 + 一个「奇物」徽记，敌人最多「强化 / 深渊 / 复制技能」三枚，各开各的面板；徽记点击统一 `bindMarkTap`（掐掉轻触补发的合成 click）并排在 `applyEnemyModifiers` 之后——徽记是 `addSkill` 时才建出来的。
- **加一件「战斗内奇物」要同时落四处**：`CURIOSITY_EFFECT_KEYS`、`CURIOSITY_BATTLE_KEYS`（**配套键也要写进来**，否则战斗面板按这张表分组时会把它整块切掉）、`EFFECT_TEXT` 文案、`rogue_curio` 的触发分支（新时机还要补进 `rogue-data.test.mjs` 的 `need` 表）；概率类效果键一律以 `Chance` 收尾（`battle.js` 对 `Ratio` / `Chance` 结尾的键不取整，否则 0.5 会被抹成 0）；`battle.js` 按 `CURIOSITY_STORAGE_KEYS` **遍历**写 storage，不再逐个键手写。
- **无尽深渊化强化**（`src/rogue/endless/`）：第 1 层起每名敌人独立获得词缀，**纯加敌人、不动玩家任何已有构筑**。数量规则：1~99 层按 `stage%` 概率拿 1 个，100 层起必定 `floor(stage/100)` 个 + 余数概率再 1 个。词缀全是持恒技，只从 `AFFIX_POOL` 随机、开战前定死随阵容落盘，读档白名单只认还在池子里的 id；四枚载体（深渊徽记 / 虚无屏蔽器 / 虚无解除宿主 / 污染封牌 mod）随模式注册但绝不进随机池。闯关与其它模式一条都不碰（`isAbyssStage` 先按 `run.mode` 挡掉，非肉鸽连技能都不存在）。
- 词缀技能用到的本体判据（都读过源码，别再按直觉改）：**没有 `mod.damage`**，改伤害只能挂 `damageBegin1~4`（`num` 写 0 仍算「受到过伤害」），防止伤害用 `trigger.cancel()`；**「所有技能失效」只能用技能屏蔽器**（`addSkillBlocker(载体id)` + 载体的 `skillBlocker()`，`disableSkill` 得逐个点名做不到「所有」），屏蔽器记在 `storage.skill_blocker` 数组里、**一次只解一层**，且解除宿主必须挂在**被作用者自己**身上（本体死亡流程只摘临时技，挂在词缀持有者身上，持有者先死就等于把玩家永久缴械）；**封一张牌**要挂在**持牌者**的 `cardEnabled2` / `cardRespondable` / `cardDiscardable` 上（入参个数各不相同）；`roundStart` / `roundEnd` / `phaseBegin` / `phaseEnd` 都是全局时机，后两个是每个角色的回合各响一次（要比「同一回合」就比 phase 事件对象的身份）；`player.damage()` 返回还没跑的事件、反伤要带 `"nocard"`，额外整回合用 `insertPhase` + `_noTurnOver` + 六阶段 `phaseList`。
- **跨回合状态分两处**：标量进 `player.storage`（如 `abyss_buqu_used` / `abyss_fuchou`），**引用类放 Player 或事件对象的普通属性**——`storage` 要 JSON 广播/录像，塞引用会炸（污染的被锁牌记在玩家 `abyssWuranLocked`、镜像标记写在反弹伤害事件上）。这些状态只活在当前这一场的 Player 上，战斗结束随对象丢弃，天然不进存档。
- **奇物效果全部走 `curioManager` 统一接口**（`sumCurioEffects` / `getBonus`），不为单个奇物写独立代码；结算侧只看**这一局开始前**就持有的奇物。三条战斗判据：加伤一律挂 `damageBegin1` 且过 `!event.numFixed`；「你使用的牌无法被响应」必须**同时**挂 `ai.norespond`（管一切响应）与 `ai.playernowuxie`（管锦囊被无懈那条独立的路），靠 `ai.skillTagFilter` 现读条件；「本回合」用 phase 事件对象比、「下一次」吃过就清（三个记号都是赋值不是累加，反复受伤只有一层）。
- **奇物品质（v6）**：`def.rarity` 永远是**初始品质**、`run.curioQuality[id]` 才是**这个存档的当前品质**——新获得的奇物（购买 / 事件 / 以后新增的任何奖励）一律从初始品质开始，绝不读图鉴或别的存档；品质链 `negative → common → rare → epic` 单向、每次只升一级、负面奇物也能一路净化到史诗；费用 5 × round(50×√**升级时**的关卡)；存档只记高于初始品质的档位。升级还有两条入口：奇物融合炉与流浪商人买已拥有那件，走同一条 `upgradeCurio` 链，只是价钱规则不同。图鉴只记「曾经获得过」，不含品质。
- 奇物候选与价格由每关胜利按概率定死写进 `curioOffers`（**未命中也清空旧批次**，看得见商店就等于这关刚刷出新货），买到即整批下架。**已拥有的奇物三重清理**：摇候选时排除、事件送出同款时从候选撤下、读档时剔除「已拥有且未售出」的过期条目。
- 商店免费刷新属于**「这一局」**（只有新建与真的通关进下一局才补满；扣一次立即落盘，失败的路径一律不补）；候选池排除角色原生技能与完整背包，**玩家禁用过的武将（含衍生技）硬否决**，但不做永久购买历史。
- **两套定价与两套奖励别混**：技能售价闯关恒 50 / 无尽 floor(50×√关卡)，再 ±25%；属性升级闯关读固定表（单属性 110、三项 330）、无尽 floor(20×√N)（单属性 445、三项 1335）；奖励闯关每关 50 金币 + 固定经验表（第 1~29 关累计 328，加初始 2 点正好 330）、无尽 floor(√n × 50) 金币与 floor(√n × 20) 经验。初始资源只由 `INITIAL_CURRENCY` 决定且只作用于新建档，旧档读回不补发。
- **事件在生成时就地定死**（倍率换算成固定值、随机结果预掷、交互型选项的货价与敌人数都算好），中途关游戏再读档**优先恢复事件页且绝不重新随机**；**按钮文案只做减法、图鉴不做减法**（`hideCost` 只削按钮，价钱仍照实写在图鉴里）；追问句（经验泉）不占按钮位，第一趟**一个钱都不扣**、事件照旧挂着；**两种「用不了」不许混**——钱不够置灰且点了毫无反应，此刻没有可作用的对象（属性全满 / 没技能可熔 / 没奇物可融合 / 那件已练满）照常可点、点下去只弹 `blockedText` 一句；**交互型选项的钱在「真选定」那一刻才扣**，三个子页面右上角「返回」＝明确放弃本次事件（先清 `pendingEvent` 再落盘）。
- **深渊裂隙是一场「不算层数」的独立战斗**：确认后按定死的敌人开战（每名必带额外词缀、**无视 31 层门槛**，但深渊总开关仍然优先）→ 落盘后**整页重载**，由恢复页接着 `launch()`。结算走 `settleRiftVictory`，**只发定死的倍率奖励**：不推进关卡、不掷事件、不刷奇物商店、不吃任何其它奇物加成、不写最高记录、不补刷新次数——这条分支绝不能改成复用 `settleVictory`。
- **图鉴是六个存档共用的收集册**（独立键，删档与新建都不清；`loadSlots()` 会把各存档里原有的 `run.collection` 并进公有键做一次性迁移）：记录「已发现事件」与「曾经拥有过的奇物」（丢弃也点亮），未收录显示「？？？」剪影且点了没反应；事件详情照实写全（选项名单独成行、每种结果的概率与固定奖励都逐行标出，生成期规则如「属性全满改送奇物」也写进去）；**赌局不剧透只约束事件页的按钮文案**，图鉴作为收集册照实写全。
- 三个独立存储键都「删档不清」：无尽最高记录（只记成功通关过的最高一关，失败不写）、闯关最高记录（金币与经验各取各的历史最大，判据是结算前 `run.cleared` 还是 false，反复重打刷不了）、图鉴。
- BGM 三条：大厅一条音轨**不重头**（只在页面重载后重来）；战斗 BGM 只在**失败结算**停、胜利结算让它响过结算页；肉鸽音量是**扩展独立设置** `rogue_bgm_volume`，与本体「音乐音量」解耦（本体音量按 0 静音而不是 `pause()`）。肉鸽会话里技能 BGM 一律拦下（判据 `get.mode() === MODE_ID`，不装临时钩子）。
- UI 通用纪律：自建浮层两层（遮罩/滚动 + 居中）、正文 `min-height:0` 才滚得动、新类名登记进 `styles.js` 末尾的 `display !important` 名单、购买/升级/装备原位刷新不重开窗口、四枚徽记各开各的面板、技能文本统一 `sanitizeSkillText`、资源数字统一 `paintResNum`（按位数降档 + 逐位折行，不裁剪不隐藏）。
- **故人的心**：枚举口径与本体「失去已有技能」的四个技能（迎乡 / 恤民 / 合韵 / 脱难）一致——`getSkills(null, false)` 再剔 `charlotte` / `superCharlotte` / `fixed` / 无文案，`unique`、限定技、觉醒技、一次性技都**放行**（**不许**照搬商店的 `skillDisabled`，那是「选择获得」的口径）；跟随件（`group` 伙伴、`subSkill` 子技能）折进主技能一起失去，被别的已拥有技能共享时原地留下；结算前逐条核验选中项还在不在：**只删玩家指定过的技能，绝不自动顶替**（失效就整单不做、请玩家重选一次）；单件 `onremove` 抛错只影响那一件并补全它的触发器残留；共享 `group` 伙伴被连带摘掉的触发器要补注册回来（伙伴可以不在技能表里，判据是「还有别的已拥有技能依赖」），且**只补触发器**（`addSkillTrigger` 的 `triggeronly` 分支：不重跑 `init`、不重复登记全局技计数），`global` 与 `initedSkills` 两项登记另外补；`onremove` 抛错时的残留检查覆盖「主技能 + `group` 伙伴 + `subSkill` 子技能」整组，不只看主技能一个 id；失去后同步两条徽记，并在无人再持有污染 / 虚无时放开它们留在玩家身上的封牌与屏蔽器。

## 作品内容包

### packages/

这是项目最重要的内容层，每个目录代表一个独立的作品/内容集合：

| 目录 | 作品 | 组织方式 |
| --- | --- | --- |
| `packages/ultraman/` | 奥特曼 | 二级模块化（见下文） |
| `packages/genshin/` | 原神 | 平铺结构 |
| `packages/honkai-star-rail/` | 崩坏：星穹铁道 | 平铺结构 |
| `packages/uma-musume/` | 赛马娘 | 平铺结构 |
| `packages/kof/` | KOF | 平铺结构 |
| `packages/touhou/` | 东方Project | 平铺结构 |
| `packages/misc/` | 其他作品 | 平铺结构 |

`packages/` 的设计目标是让不同作品之间尽量解耦。新增一个作品时，应优先新建独立目录：

```text
packages/
└── new-project/
```

而不是把角色直接加入其他作品包。

### 普通作品包的标准结构

规模较小的作品包采用平铺结构，以原神包为例（`kof`、`uma-musume`、`misc` 无专属装备，故没有装备文件）：

```text
packages/genshin/
├── index.js              # 作品包入口
├── characters.js         # 角色定义
├── skills.js             # 技能定义
├── translate.js          # 技能翻译
├── characters-meta.js    # 角色元数据
├── equipment.js          # 作品专属装备牌（仅原神、星穹铁道）
├── equipment-skills.js   # 装备技能（仅原神、星穹铁道）
├── voices.js             # 角色台词
└── dynamicTranslate.js   # 动态技能描述
```

各文件职责：

- **`index.js`**：作品包入口。统一导出该作品的角色、技能、翻译、装备等内容，并携带包标识 `id` 与显示名 `name`；有专属装备的包同时导出 `registerEquipment` / `registerEquipmentSkills`。
- **`characters.js`**：角色定义。每名角色包含性别、势力、体力、技能列表、立绘路径、死亡配音等信息。
- **`skills.js`**：技能定义。
- **`translate.js`**：技能名称、技能描述及相关翻译（含使命技成功/失败等衍生描述）。
- **`characters-meta.js`**：角色相关元数据，包括角色名称翻译（`characterTranslate`）、称号（`characterTitle`）、简介（`characterIntro`）。
- **`equipment.js`**：作品专属装备牌（卡牌属性与名称、描述翻译的注册）。
- **`equipment-skills.js`**：装备技能的注册。
- **`voices.js`**：角色台词。组织方式同无名杀本体 `character/<包>/voices.js`：`#<技能名>1` 为技能台词，`#<角色名>:die` 为死亡台词。
- **`dynamicTranslate.js`**：动态技能描述。键为技能名，值为返回描述字符串的函数。

## 奥特曼内容包

`packages/ultraman/` 是当前项目规模最大的作品包，因此没有继续全部平铺，而是进行了第二层模块化：

```text
packages/ultraman/
├── index.js              # 合并各分包结果并导出，附带分包分组信息
├── loader.js             # 分包清单与合并校验
├── equipment/            # 奥特曼装备
│   ├── equipment.js      # 装备牌注册
│   └── skills.js         # 装备技能注册
├── shared/               # 跨分包共用内容
│   └── skills.js         # 跨分包共用技能
└── packs/                # 奥特曼主题分包
    ├── eternal-torch/    # 薪火不灭
    ├── daybreak/         # 长夜破晓
    ├── devour-world/     # 雄吞天地
    ├── end-of-all/       # 万物终焉
    └── boundless-cosmos/ # 寰宇无极
```

- **`packs/`**：存放不同奥特曼主题的具体内容包。每个分包内部结构与普通作品包类似（`index.js` / `characters.js` / `skills.js` / `translate.js` / `voices.js` / `dynamicTranslate.js`），其中称号、简介等元数据保存在分包的 `data.js` 中。未来可以继续按昭和、平成、新生代、电影、特别篇等作品/系列拆分新分包。
- **`equipment/`**：奥特曼相关装备牌及其内容，装备定义与装备技能分文件存放。
- **`shared/`**：不同奥特曼分包之间共用的基础定义与公共技能。准入规则：只有被两个及以上分包实际依赖的代码才能放这里，不把无归属的技能丢进 `shared`。
- **`loader.js`**：负责奥特曼大型内容包内部的进一步加载：维护分包清单 `packs` 数组（新增分包只需新建 `packs/<id>/` 并加入此数组），并在 `loadPacks()` 中完成合并与校验（分包 id 重复/缺失、显示名缺失、角色重复、技能重复、角色引用技能是否存在），问题通过 `console.error` 报告，便于开发期快速发现。

**奥特曼内容规模较大，因此采用二级模块化结构。未来继续增加奥特曼角色时，优先按作品/系列拆分新分包，而不是持续增大单个文件。**

## 素材

### assets/

所有普通图片、音频等资源，资源文件名全局唯一，按类型分目录存放：

```text
assets/
├── audio/                # 音频（BGM 与语音 .mp3）
│   ├── dieaudio/         # 角色死亡语音
│   ├── easteregg/        # 彩蛋音频
│   └── rogue/            # 奥特肉鸽的界面音频
├── camp/                 # 扩展自定义势力的图标
├── curios/               # 奥特肉鸽奇物配图（192×192）
├── equipment/            # 装备卡面
├── events/               # 奥特肉鸽事件配图（192×192）
├── image/                # 角色立绘（按「角色名.jpg」扁平存放）
└── sundry/               # 模式封面等杂项
```

- **`assets/audio/dieaudio/`**：角色死亡语音（各包 `characters.js` 的 `dieAudios` 字段引用；个别特殊死亡语音由技能在死亡时机直接播放）。
- **`assets/audio/easteregg/`**：彩蛋音频（供 `src/systems/easterEgg.js` 使用）。
- **`assets/audio/rogue/`**：奥特肉鸽模式的界面音频（`src/rogue/bgm.js` 用 `start.mp3` 做存档页与营地的循环 BGM）。
- **`assets/camp/`**：扩展自定义势力的图标（由 `src/core/bootstrap.js` 在初始化时注册）。
- **`assets/image/`**：角色立绘，一个角色一张 `.jpg`，包内 `characters.js` 直接引用。

新增素材时需要注意：

1. **资源命名必须全局唯一**，不能与其他作品、其他角色已使用的文件名冲突；
2. 音频放入 `assets/audio/`，角色立绘放入 `assets/image/`；其余按用途分目录（死亡语音、彩蛋音频、阵营图标、装备卡面、肉鸽的事件 / 奇物配图各有各的目录）；
3. 新增素材后，需要同步将其登记进 `data/assets.js` 素材清单，供启动时的完整性检测使用；
4. 代码中引用素材时，使用 `src/core/assets.js` 提供的路径工具，保持引用方式统一。

未来如果素材规模进一步扩大，可以考虑在 `audio/`、`image/` 之下按作品继续分组；在实施之前，请先沿用当前的组织方式，避免素材路径大面积变动。

## 数据

### data/

这里保存的是"数据"，而不是具体功能实现：

| 文件 | 内容 |
| --- | --- |
| `assets.js` | 全扩展素材清单，用于启动时的素材完整性检测（缺失时向玩家提示） |
| `bgmList.js` | 技能 → BGM 文件的映射数据（路径相对 `assets/audio/` 目录） |
| `characterRank.js` | 角色评级与稀有度的静态数据（`rankMap` / `rarityMap`） |
| `tierConfig.js` | 强度排行的分档配置（`tierList`） |
| `characterAnalysis.js` | 角色强度分析数据与评分函数（`calculateCharacterScore` / `getCharacterTier`） |
| `xnnequipment.js` | 装备元数据（名称、花色点数、数值范围、技能描述、AI 价值等） |
| `装备价值列表.txt` | 原版牌堆装备的 AI 价值参考表 |

数据与实现是分离的。以角色评级为例：**评级数据保存在 `data/characterRank.js`，评级系统的功能实现则在 `src/systems/tierlist.js`**——"角色评级"属于数据，而不是 `systems` 本身。

以后如果还有角色标签、作品分类、装备价值、BGM 分类、图鉴数据、角色关系等类似内容，都应优先考虑放入 `data/`，不要直接硬编码到 UI 或系统逻辑中。

## 工具

### tools/

开发、校验与维护脚本，需要 Node.js 运行。`tools/check/` 下有三个一致性校验脚本，`tools/update-manifest.mjs` 用于素材清单登记：

| 脚本 | 作用 |
| --- | --- |
| `update-manifest.mjs`（`tools/` 根目录） | 将新增的图片/语音按清单排序规则登记进 `data/assets.js`（已在清单中的跳过、只插入不重排既有条目）。GitHub 上的"素材清单同步"工作流在检测到推送新增素材后自动调用它并提交清单更新，本地也可手动执行：`node tools/update-manifest.mjs <新增文件...>` |
| `check-imports.mjs` | 校验所有 `.js` 文件的 `import` / `export from` 相对路径都能解析到真实存在的文件 |
| `check-assets.mjs` | 校验代码中的素材引用与磁盘文件一致、`data/assets.js` 清单与磁盘一致、无旧路径残留 |
| `verify-parity.mjs` | 对比重构前后的扩展注册结果（合并后的包结构与 `lib.*` 注册内容）是否一致，用于大型重构的回归验证 |

用法示例（在仓库根目录执行）：

```bash
node tools/check/check-imports.mjs .
node tools/check/check-assets.mjs .
```

未来可以增加：重名检查、角色 ID 冲突检查、技能 ID 冲突检查、作品包结构检查、自动生成索引、构建/发布脚本等，让维护大型扩展时减少人工检查。

## 新增角色

推荐流程：

```text
1. 确认角色属于哪个作品，找到对应 packages/<作品>/；
2. 在 characters.js 中添加角色定义；
3. 在 skills.js / translate.js 中添加技能与技能翻译；
4. 在 characters-meta.js 中补充角色名称翻译、称号等元数据；
5. 按需在 voices.js / dynamicTranslate.js 中添加台词与动态描述；
6. 添加角色立绘、语音等素材到 assets/，并确认命名不冲突；
7. 将新素材登记进 data/assets.js 素材清单（推送到 GitHub 后，"素材清单同步"工作流会自动登记本次推送新增的图片/语音并提交清单更新；本地也可用 `node tools/update-manifest.mjs` 手动登记）；
8. 将角色名加入 src/core/registry.js 的 CHARACTER_ORDER（否则合并总包时会被忽略，不会出现在选将界面）；
9. 如需评级，将评级数据加入 data/characterRank.js；如技能触发 BGM，将映射加入 data/bgmList.js；
10. 运行 tools/check/ 下的校验脚本进行完整性检查。
```

补充说明：

- 奥特曼角色应加入 `packages/ultraman/packs/` 下对应主题分包，而不是平铺在包根目录；
- 任何情况下都**不要为了添加一个角色而修改 `extension.js`**。

## 新增作品

推荐流程：

```text
1. 在 packages/ 下新建作品目录；
2. 创建作品入口 index.js，导出 id、name 及 characters / skills / translate 等标准字段；
3. 根据作品规模决定采用平铺结构还是二级模块结构；
4. 实现 characters / skills / translate 等内容模块；
5. 添加作品对应素材到 assets/，并登记进 data/assets.js；
6. 如需公共系统功能，仅在确有必要时修改 src/systems/；
7. 将作品包注册进 src/core/loader.js 的 packages 数组；
8. 将新增的 .js 文件登记进 info.json 的 files 清单（无名杀按此清单加载扩展文件）；
9. 检查素材与角色/技能 ID 是否冲突。
```

**小型作品使用简单结构，大型作品采用模块化结构。** 不要为了追求统一而让所有作品都复制奥特曼的大型目录结构——规模较小时，平铺结构更直观、更好维护。

## 新增装备

- 作品专属装备优先放入对应作品包：装备牌定义（含名称、描述翻译的注册）放在包内 `equipment.js`，装备技能放在 `equipment-skills.js`，两者保持分离；
- 奥特曼装备统一放在 `packages/ultraman/equipment/` 下；
- 装备图片放入 `assets/`，命名需保证全局唯一，并登记进 `data/assets.js`；
- 装备元数据、AI 价值等属于数据的内容，参考并维护在 `data/xnnequipment.js` 与 `data/装备价值列表.txt`；
- 如果多个作品共享某个公共机制，再考虑抽取到公共层，不要过早抽象。

## 新增公共系统

判断标准——如果一个功能：

- 与某一个作品没有强绑定；
- 多个作品都可能使用；
- 属于扩展整体功能；

则考虑放入 `src/systems/`，例如：彩蛋、BGM、评级、更新日志。

实现时：

- 数据与实现分离，具体数据放入 `data/`；
- 需要弹窗展示时，复用 `src/ui/overlay.js` 的通用浮层；
- 需要用户配置项时，加入 `src/config/index.js`；
- 通过 `src/core/bootstrap.js` 的初始化流程挂载。

如果只是某个角色的专属技能，不应该放到 `src/systems/`。

## 肉鸽模式：作者待填内容

内容层已经全部填好（21 个事件 / 20 件奇物 / 34 + 33 条闯关敌方配置），下面是各项内容与调参的落点；新增内容只改这些地方，流程代码一行都不用动。

| 位置 | 要填什么 | 现状 |
| --- | --- | --- |
| `src/rogue/data/challengeStages.js` | 闯关前 10 关的敌方配置池：建局时从池里不重复抽 10 个存进存档，每关按 `challengeStages[level-1]` 生成敌人；成员可选写 `stats` / `skills` / `maxHp` / `hp` 固定住，不写就按关卡数随机 | 34 条。`players[].character` 必须写**真实角色 id**（官方包是拼音式 id，中文名只是显示名）；抽取只看角色是否存在，**禁将也照抽照打**，角色不存在的配置不参与抽取（`node tools/test/rogue-data.test.mjs` 会核对），文件内有逐条注释 |
| `src/rogue/data/challengeCombos.js` | 闯关第 11~30 关的双人组合池：首次进入该区间时不重复抽 10 个写进 `challengeComboStages`，21~30 关复用同一结果 + 扩展池随机第三人 | 33 条（`type` 固定 group、`players` 恰 2 名且数组顺序就是敌人先后，属性/技能走常规生成）。官方包角色 id 已逐一核对（十周年谋系 `dc_sb_`、乐系 `yue_`、势系 `pot_`、界系 `xin_/re_`，星周不疑/星王朗在 newjiang 包），末尾 3 条来自**本扩展自己的角色**（中文 id） |
| `src/rogue/data/events.js` | 无尽事件池：名称/描述/配图/选项 | 21 个事件。倍率类奖励只用 `goldByWin` / `expByWin`（负数即消耗），随机结果用 `outcomes` 写概率、生成时预掷定死；交互型选项写 `action`，「没对象可作用」写 `blockedText`，`hideBalance` / `hideCost` / `followUp` 三个键的说明在文件头 |
| `src/rogue/data/curios.js` | 无尽奇物池：名称/背景描述/配图/初始品质/售价倍率/效果键 | 20 件。界面文案由效果键自动生成（没有手写文案字段），背景 `description` 只影响展示；新加一件要同时落 `CURIOSITY_EFFECT_KEYS` / `CURIOSITY_BATTLE_KEYS` / `EFFECT_TEXT` / `rogue_curio` 四处（见设计约束） |
| `src/rogue/endless/abyssAffixes.js` + `abyssConfig.js` | 深渊词缀：技能本体与 `affixText` 文案 + `AFFIX_POOL` 登记一项 | 9 条词缀 + 4 枚不进随机池的载体。`tags` 是准入门槛（普通词缀别写）；强度旋钮是起始层 / 满层 / 单个敌人上限 / 总开关 |
| `src/rogue/data/skills.js` `stats.js` `rewards.js` | 商店技能池（作者上架底线清单，真正的候选池由 `skillPool.js` 并上全体武将技能）、闯关属性表与升级报价、两模式奖励表 | 已填好：属性 2,4,…,20（单属性 110 / 三项 330），奖励闯关每关 50 金币 + 固定经验表、无尽 √ 曲线；完整数值口径见上面设计约束里「两套定价与两套奖励」那一条 |
| `src/rogue/config.js` | 全部机制旋钮与存档版本 | 见核心架构一节的 `config.js` 行 |

属性效果支持的键（`battle.js` 已落地，写别的键不生效）：`armor`（初始护甲）、`maxHp`（体力上限增量）、`startHand`（起手手牌增量）、`extraDraw`（摸牌阶段额外摸牌）、`handLimit`（手牌上限增量）、`damageChance`（造成伤害时 +1 伤害的概率，不限【杀】）、`shaLimit`（出【杀】次数增量）、`extraSkills`（额外技能 id 数组）。数值型四项由机制技 `rogue_stat` 承载（建局时一次性赋值进 `storage`，重复调用不翻倍），商店与奖励池刷不到它。

自检命令（在本扩展目录执行）：

```text
node tools/check/check-imports.mjs .        # 相对路径 import 是否都能解析
node tools/check/check-assets.mjs .         # 素材引用与清单、磁盘是否一致
node tools/check/verify-parity.mjs .        # 与基线比对注册结果（默认 HEAD）
node tools/test/rogue-data.test.mjs         # 内容配置自检（改完 data/ 先跑这个）
node tools/test/rogue.test.mjs              # 数据/逻辑层用例
node tools/test/rogue-mode-smoke.mjs        # 模式流程冒烟（本体 API 用桩，不用开游戏）
```

注意：`tools/gen-event-curio-images.mjs` 是**上一代占位图生成器**——当前事件与奇物配图都已换成正式美术，跑它会把这些图整批覆盖成占位版；只有新增条目、暂时没有配图时才用它。

## 项目设计原则

### 内容与框架分离

- 角色、技能属于 `packages`；
- 公共系统属于 `src/systems`；
- 核心加载机制属于 `src/core`；
- 数据属于 `data`；
- 素材属于 `assets`。

### 小型模块保持简单，大型模块再拆分

不要为了形式上的统一而过度工程化：小作品平铺即可，规模大了再引入二级模块结构。

### 公共功能优先复用

多个作品都需要的功能应进入公共系统，而不是复制多份；`shared` 与 `systems` 都有明确的准入门槛。

### 新增内容优先"增加文件"，而不是"不断扩大巨型文件"

尤其是奥特曼内容已经比较庞大，后续应继续保持按分包、按模块拆分的习惯。

## 更新日志

项目的版本变更记录见 [CHANGELOG.md](CHANGELOG.md)，也可以在游戏内扩展设置界面中点击"查看历史更新记录"查看。

版本发布时需要同步修改的位置：

- `CHANGELOG.md`：追加更新记录；
- `info.json`：`version` 字段；
- `src/core/registry.js`：导出包的 `version` 字段；
- `src/core/bootstrap.js`：`currentVersion` 常量与更新公告文本；
- `src/config/index.js`：设置界面的版本号显示。
