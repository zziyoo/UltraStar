# 奥特之星（UltraStar）

无名杀扩展：以奥特曼为核心主题，同时收录其他作品角色与相关内容的综合型扩展项目。

- **核心内容**：奥特曼系列角色与装备，按主题拆分为多个内容分包；
- **收录作品**：奥特曼、原神、崩坏：星穹铁道、赛马娘、KOF、东方Project，以及其他作品（`misc`），目前收录约 50 名角色；
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
│   │   ├── shop.js               # 候选随机/购买/替换/升级（纯逻辑）
│   │   ├── skillPool.js          # 商店候选池：作者清单 + 全体武将技能（剔禁用武将）
│   │   ├── enemy.js              # 敌方生成：随机池/关卡配置池/属性分配
│   │   ├── reward.js             # 胜利结算（纯逻辑）
│   │   ├── penalty.js            # 失败与降级惩罚（纯逻辑）
│   │   ├── battle.js             # 建局与运行时强化（对接本体事件）
│   │   ├── bgm.js                # 大厅 BGM（存档页/营地循环播放，进战斗停止）
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
│       └── overlay.js            # 通用浮层组件
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
| `mode.js` | 模式配置对象（start / `game.checkResult` / `game.onover` / `element.player.dieAfter` / `get.rawAttitude` / 模式级 skill+translate）、页面路由、存档落盘与战斗编排。商店的三个动作都遵循「先改内存 run → `commit()` 落盘 → 再原位刷 UI」：购买 `applyBuy`、属性升级 `upgradeStatFlow`、免费刷新 `refreshShopFlow`（`shop.js` 判定被拒时只弹提示，不改存档也不扣次数；`commit()` 失败时直接返回，UI 不会假装刷新成功——重开商店会把滚动位置甩回顶部，所以走 `refreshShop()`）。`get.rawAttitude` 不能省：本体 `get.attitude` 会无条件 `rawAttitude.apply(...)`，缺了 AI 一出牌评估就抛错 |
| `config.js` | 机制参数：槽位数、存档版本（`RUN_VERSION`，v2 起多一个 `shopRefreshesRemaining`，v3 起进行中战斗保存完整敌方阵容 `currentBattle.enemies`，v4 起无尽多 `pendingEvent` / `collection` / `curios` / `curioOffers`，v5 起 `currentBattle.enemies` 每项多 `abyss`（深渊词缀 id 列表，旧档按「本关没有词缀」补齐），v6 起多 `curioQuality`（已拥有奇物的当前品质覆盖表，旧档按空表补齐 = 全部停在初始品质）、v7 起多 `abyssDebt`（经验泉欠的词缀数）、`curioOfferQueue`（黄金罗盘多刷的那批候选），并让 `currentBattle` 携带 `rift`（这一场是深渊裂隙）——三者旧档一律按空值补齐、绝不重掷，v8 起闯关再多 `challengeStages`（前 10 关的敌方配置抽取结果：建局时一次性从 `data/challengeStages.js` 抽出落盘，读档/重进/失败重战原样沿用，旧档首次开战补抽一次），v9 起多 `skillShopLocked` / `curioShopLocked`（技能商店与奇物商店的锁定开关，来源是「收藏家的橱窗」奇物：稀有档只能锁技能商店、史诗档两个都能锁；旧档按未锁定补齐，读档时只有当前确实持有对应能力的才保留），v10 起闯关再多 `challengeComboStages`（第 11~30 关的双人组合抽取结果：首次进入 11~30 关时一次性从 `data/challengeCombos.js` 抽 10 个落盘，第 11~20 关按位使用、第 21~30 关复用同一结果加扩展池随机第三人；旧档缺字段按空数组补齐，首次需要时补抽一次，之后绝不重掷），v11 让 `currentBattle.enemies` 每项可多一个 `boss` 标记（旧档缺字段按普通敌人处理），同版本一度新增过整局的 `bossRun`；v12 起 Boss 战改为**每场新战斗独立判定**：`currentBattle` 多一个 `isBossBattle`（创建那场战斗时按 `BOSS_RUN_RATE` 掷一次写死，与阵容同一次落盘，读档/重进/失败重战只认它、绝不重掷），整局 `bossRun` 字段已移除——v11 旧档里正处于未完成战斗的，按旧 `bossRun` 加阵容里的 `boss` 敌人折算出这一场的 `isBossBattle`，没有进行中战斗的一律不补，下一场重新独立判定；同一版还把 `isBossBattle` 定为**整场唯一权威标记**，读档时与敌人的 `boss` 字段对一次账（归一化要分清原始存档的四种状态：明确 true / 明确 false / 缺字段 / 非法值，这份状态只做中间量、不进存档）——整场 false（含裂隙场）一律抹平敌人标记；整场 true 且只有 1 名敌人时，只有「敌人原本写着 boss: true」或「根本没有这个字段（残缺形态，可补齐）」才维持 Boss 战，字段**明确 false 或非法值**说明存档自相矛盾，一律把整场降为普通场（不把明确的普通敌人升级成 Boss），多人形状同样降级；矛盾存档不再让敌人白拿 Boss 体力翻倍）、新档初始资源（`INITIAL_CURRENCY` 金币 50 / 经验 2：金币与技能基准价同额；经验与各自模式的首级升级价对平——闯关 2、无尽 20，第一关进商店即可买技能/升一次属性）、技能槽与候选数、每局免费刷新次数（`SKILL_REFRESH_PER_LEVEL` 2）、技能基准价系数（`SKILL_BASE_PRICE` 50：闯关恒为基准价，无尽按 floor(50×√当前关卡)，与 ±25% 浮动 `SKILL_PRICE_SPREAD`）、无尽属性升级 √ 系数（`ENDLESS_STAT_UPGRADE_BASE` 20：升到 N 级 floor(20×√N)，仅无尽使用）、失败货币损失率与 fallback、可选角色白名单、无尽最高记录键（`BEST_ENDLESS_KEY`，独立于六个存档槽）、闯关最高记录键（`BEST_CHALLENGE_KEY`，同样独立于六个存档槽）、模式封面与背景音乐的路径（`MODE_SPLASH`、大厅 `LOBBY_BGM` 一曲、战斗 `BATTLE_BGM_LIST` 随机池——换曲子/换曲库只改对应一行或数组）、无尽事件触发率（`EVENT_TRIGGER_RATE` 0.33）与奇物参数（`CURIO_BASE_PRICE` 50 / `CURIO_PRICE_SPREAD` 0.25 / `CURIO_OFFER_COUNT` 3 / 奇物商店触发率 `CURIO_SHOP_RATE` 0.2；一批只卖一个：买到即整批下架）、奇物品质升级价系数（`CURIO_UPGRADE_PRICE_MULTIPLIER` 5：升级费 = 5 × 本层胜利经验（floor(20×√升级时的关卡)，与事件 `expByWin` 同一条「胜利经验」口径），31 层 555 / 100 层 1000）、Boss 战旋钮（`BOSS_RUN_RATE` 0.05＝**每场新战斗创建时独立判定一次**本场是否 Boss 战（无尽每推进一关、闯关每一关各掷各的，不看上一场结果），结果随 `currentBattle.isBossBattle` 落盘、读档绝不重掷；`BOSS_REWARD_MULTIPLIER` 20＝Boss 战胜利奖励 = 20 × 本关胜利金币/经验基准，不吃奇物加成，与深渊裂隙同一条口径；`BOSS_EXTRA_AFFIXES` 1＝Boss 在正常计算之外固定自带的深渊强化个数）、本轮新事件的旋钮（`RIFT_TIERS` 深渊裂隙三档 `{enemies, multiplier}`＝1/5、5/50、10/150 倍本层基准；`RIFT_EXTRA_AFFIXES` 1＝裂隙每名敌人必带的额外词缀数；`SPRING_DEBT_AFFIXES` 1＝经验泉「再饮一口」欠的债；`MERCHANT_PRICE_MULTIPLIER` 4＝流浪商人售价 = 奇物基准价 ×4 恒定；`FORGE_EXP_MULTIPLIER` 3＝奇物融合炉费用 = 本层基准经验 ×3） |
| `state.js` | 六槽存档的校验、默认值修复、版本迁移与序列化安全；`shopRefreshesRemaining` 在这层统一钳到 `0..SKILL_REFRESH_PER_LEVEL`，v1 旧档缺这个字段时补满，**已经刷成 0 的原样保留**（当成「没这个字段」就等于白送次数）；`currentBattle` 只认 `{ status, enemies, rift, isBossBattle }`（每项白名单字段：`characterId` + `stats` 三项属性钳到 `0..maxLevel` + `abyss` 深渊词缀（`abyss.normalizeAbyssIds`：只留在池子里的 id、去重、按池子顺序排列、夹到上限，**绝不在读档时重掷**；v4 及更早旧档缺这个字段补成空数组） + `skills` + `maxHp`/`hp` 覆盖）；v2 及更早旧档只存了 `groupId` 的，按当时的组合配置**还原成完整敌方阵容**（角色、属性、额外技能、体力覆盖全保留，不重掷），组合也没了才视为无未完成战斗；`currentBattle.isBossBattle` 是整场的**唯一权威标记**，读档时按它给敌人的 `boss` 对一次账（整场 false 或裂隙场一律抹平敌人标记；整场 true 只认「1 名敌人」这个合法形状——敌人原本写着 boss: true 或整个字段缺失（可补齐）才维持 Boss 战，明确 false / 非法值则整场降为普通，两种修正都只动这一个字段，角色/属性/词缀/技能/血量原样保留，也绝不删掉合法的未完成战斗）；v4 起还校验无尽的新字段：`pendingEvent`（事件 id 必须仍存在于 `data/events.js`，选项按白名单重建、奖励只留固定值——事件下架或选项全非法才丢弃，能还原就优先回事件页）、`collection`（已发现事件 + 曾拥有奇物，只收有效 id 并去重）、`curios`（有效 id 去重保序）、`curioOffers`（`{ id, price }`，**已拥有的奇物一律剔除**——买到即下架、事件送出会撤下，这里兜底清洗旧档残留）、`curioQuality`（v6 的奇物当前品质覆盖表：key 必须是现有奇物、必须当前持有、值必须在 `negative/common/rare/epic` 链上**且严格高于该奇物的初始品质**——低于或等于初始品质的、未持有的、不存在的全部清掉；**只做清洗，绝不因为读档就把奇物升级**，且清洗幂等）；旧档缺这些字段时按默认值静默补齐；无尽最高记录的 `normalizeBest` / `updateBest`（纯逻辑，不碰 `game`/`lib`/`DOM`）；闯关最高记录的 `normalizeBestChallenge` / `updateBestChallenge`（金币与经验各取各的历史最大，两项都没涨时返回同一个对象引用，调用方据此决定要不要落盘）；v7 的三处新清洗：`abyssDebt` 夹到 `0..10`（旧档补 0）、`curioOfferQueue` 逐批走与 `curioOffers` 同一套清洗（已拥有 / 已下架的不上架、空批丢掉）、`currentBattle.rift` 只留 `{level, enemies, affixes, gold, exp}` 五个标量（裂隙战的中途恢复靠它，不重掷）；`pendingEvent` 的选项白名单多了 `action`（`normalizeEventAction`：只认 `abyssDebt/skillForge/rift/merchant/curioForge` 五种 kind，参数取整夹住，认不出就整块丢弃退回普通奖励流程）与 `blockedText`（非空才留） |
| `shop.js` | 技能候选随机、按模式定价（`getSkillBasePrice` / `getRandomSkillPrice`）、购买、满槽替换、属性升级校验（纯逻辑），**属性升级经验按模式分流**（`getStatUpgradePrice`：闯关读 `data/stats.js` 固定表 2..20，无尽 floor(20×√目标等级)；只从 `run.mode`+`run.stats` 现算，两模式互不共享）。**基准价闯关恒为 `SKILL_BASE_PRICE`（50），与关卡/胜场/等级彻底无关；无尽为 floor(`SKILL_BASE_PRICE` × √当前关卡)，第 1 关即 50、之后随 √n 增长**（level 缺失按第 1 关、不认识的模式按闯关处理）；实际售价在基准价 ±25% 内随机后**向下取整**（基准 50 → 37~62，至少 1）。**售价在生成候选时定死并写进 `shopOffers`**，重进商店/刷新/重载都不重掷。候选池由调用方作第 4 参传进来（`rollSkillOffers(run, rng, characterSkills, candidates)`），本文件不读 `lib`。**随机时会排除「当前角色原生技能 + 当前持有的购买技能」**（`getExcludedSkillIds`，角色技能由 `mode.js` 从 `lib.character` 取好传入），但不做永久购买历史——被替换掉的技能还能再出现。**`refreshSkillOffers(run, rng, characterSkills, candidates)`（每局免费刷新）同为纯函数**：两条门槛——还有剩余次数、且本次商店还没买过技能（重掷出来的候选 `sold` 全是 false，买过还让刷就等于绕过 `SKILL_PURCHASE_COUNT` 的一局限买一个）；实现是「先把当前候选的 id 从池子里排掉，再调用同一个 `rollSkillOffers`」，所以技能与价格一起重掷、原生/持有排除规则原样生效；排掉旧候选后凑不满 `SKILL_OFFER_COUNT` 条时退回完整池子，允许旧候选重新出现（不死循环、不重复填充、不给当前持有的技能）。被拒时不返回改过的 `run`，次数一次都不扣；`getRefreshesRemaining(run)` 是商店 UI 与它共用的读数口径 |
| `skillPool.js` | 商店候选池：`getShopPool()` = `data/skills.js` 的作者清单 ∪ **全体可选武将的技能**（`Object.keys(lib.character)` 逐条走 `battle.js` 的 `isPlayerUsable`，与选将页同一口径，所以 Boss/隐藏 Boss/未开放角色不会进池）。**玩家禁用过的武将，其技能与这些技能声明的 `derivation` 衍生技一并剔除，且是**硬否决**：只要技能（含衍生技）属于任何一个当前禁将角色就不进池，哪怕别的未禁用武将也拥有同一条（扩展里真实存在共享技能，如 atmnianli 六名角色共有——旧的「还有别人拥有就继续上架」豁免正是禁将技能漏进商城的根因）。单条技能口径的 `isSkillBlockedByBan(id)` 供读档清洗与购买前校验复用（`runtime.skillGate` 两道关合一）。禁将名单读的是本体那套按模式分开存的 `lib.config[模式 + "_banned"]`（遍历 `lib.config.all.mode`，再加 `lib.config.banned`），与本体禁将页「禁将」分组的跨模式合并显示同一口径——即**任一模式里禁用过就算禁用**，不只认肉鸽模式。武将技能进池前还要过本体 `lib.filter.skillDisabled`（缺翻译、`unique/temp/sub/fixed/vanish` 的内部技不上架）；作者清单不重筛，`rogue-data.test.mjs` 已逐条验过定义与翻译 |
| `curioManager.js` | 奇物系统统一接口（纯逻辑）。**`sumCurioEffects(ids, qualityMap)` / `getBonus(ids, type, qualityMap)`**：按**当前品质**把若干奇物的效果对象按键叠加，任何代码需要「奇物给了多少加成」都查这里，不为单个奇物写独立代码；效果键分三组——战斗内（`extraPhase` 额外出牌阶段 / `extraDraw` 额外摸牌 / `dyingSave` 濒死救回（次数语义）/ `dyingRecoverToRatio` 濒死回复到「体力上限 × N（向上取整）」/ `roundHeal` 轮回复 / `turnHeal` 回合回复等十七项，完整清单见本行末尾，建局时由 `battle.js` 写进 `player.storage.rogue_curio`、由机制技 `rogue_curio` 承载）、结算（`expRate` / `goldRate` / `goldRateSpread` 结算时在 `goldRate±spread` 之间随机取值，胜利结算时 `reward.js` 现查）与商店/替换（`extraShopRefresh` / `goldOnReplace` / `expOnReplace` / `lockSkillShop` / `lockCurioShop`，由商店流程与结算各自现查）。**品质接口**：`getInitialQuality`（= 定义里的 `rarity`，新获得的奇物永远从这里开始）、`getCurioQuality(id, qualityMap)`（没记就是初始品质）、`getNextCurioQuality` / `isCurioMaxQuality`（沿 `CURIOSITY_QUALITY_CHAIN` 走一级，史诗为链尾）、`getCurioEffectAt(id, quality)` / `getCurioEffect(id, qualityMap)`（`qualityEffects` 里写了就**整份替换** `effect`，没写就沿用初始效果）、`getCurioUpgradePrice(run, id)` = 5 × round(50×√升级时的关卡)、`checkCurioUpgrade`（存在 / 持有 / 有下一档 / 经验够，四道门槛，**「经验不足」也会带上完整的 cost 与 from/to**，UI 正需要照着它显示价签）、`upgradeCurio`（只改 `currency.exp` 与 `curioQuality` 两项，**绝不修改传入的 run**；失败时原样返回且经验品质都不动）、`getMaxCurioEffect` / `getMaxShopRefreshes`（按**最高可达品质**算上限，否则循环按钮升到史诗后 +2 会被读档夹回 +1）。`describeCurioEffects` / `describeCurio` 是营地、商店、图鉴与标记说明共用的文案，**一律按当前品质的效果表自动生成**（不再有 `effectText` 这类手写兜底字段——同一个奇物各档之间、各奇物之间句式必须统一，否则升一级就换一套措辞；波动档写成区间「金币获取 -10%~+10%」，比例档并进濒死那一行）。商店侧：`getCurioBasePrice` = round(50×√当前关卡)（与技能同曲线但按规格用 round，第 10 关 158、第 2 关 71），`getCurioPrice` = round(基准 × ±25% 随机 × `priceMultiplier`)，`rollCurioOffers` 摇三个候选（排除已拥有、全部同概率不分稀有度、池空给少）、价格随候选定死写进存档；`buyCurio` 扣金币 + 入袋 + **写图鉴**（`collection.curios` 记「曾经拥有」，之后丢弃也不消失）+ **买到即整批下架**（`curioOffers` 清空，商店分区随之隐藏，不留「已购买」残卡）；`grantRandomCurio` 供事件奖励随机送奇物，**送出的同款若还挂在商店候选里会整条撤下**（已拥有的奇物不得再出现在奇物商店），集齐时落空并写明。本轮新增：`grantCurioById`（古代遗迹三扇门在构建期就掷定给哪一件，结算照单发放；已拥有/已下架则 `ok:false` 且零副作用）、`pickUnownedCurioOfRarity`（按**初始品质**在未拥有里挑，纯查询不改 run）、`getUpgradableCurios`（还能往上升级的已拥有奇物 = 奇物融合炉候选名单）、`getMerchantPrice`（流浪商人恒定价 = `getCurioBasePrice × MERCHANT_PRICE_MULTIPLIER`，**不打 ±25% 波动也不乘品质倍率**）、`rollMerchantCurio`（**不排已拥有**——「买已经有的那件」就是这家商人的卖点）、`takeNextCurioBatch`（黄金罗盘多出的那一批：`buyCurio` 下架当前批后把队列第一批提上货架，返回新建数组不与传入 run 共享引用）；`checkCurioUpgrade` / `upgradeCurio` 多一个 `priceOverride` 参数（融合炉用事件里定死的费用，其余判定与商店升级完全同一条链）；`rollCurioOffers` 多一个 `exclude` 参数（连着摇第二批时不重复挂同一件货）。战斗内效果键从六项扩到十七项（`firstDamageBonus` 狂战徽章 / `unrespondable` 血怒核心 + 两个不出文案行的配套键 `unrespondableLowHp`、`unrespondableCardDamage` / `hurtDamageNext`·`hurtDamageRound`·`hurtDamageGame` 反击护符三档 / `dyingRecallChance` 回响之铃（概率档 0.5/0.75/1，**storage 里保留小数**——`battle.js` 对 `Ratio`/`Chance` 结尾的键不取整）/ `killGainMaxHp` 破碎王冠 + 四个配套键 `killHeal`·`killHealToMax`·`killDrawToMaxHp`·`killDrawMaxHp`），结算侧新增 `extraCurioShopChance`（黄金罗盘）、`goldOfHeld`（储蓄罐，乘的是**已到手总额**，与 `goldRate` 乘本关基础奖励是两回事）、`goldOnReplace`（遗忘之石，`getReplaceRewardGold` 按 run.level 现算本层基准金币 ×N）、`expOnReplace`（贪食魔盒，`getReplaceRewardExp` 与前者同一条口径、只换经验），商店侧新增 `lockSkillShop` / `lockCurioShop`（收藏家的橱窗，见 `canLockShop` / `isShopLocked` / `toggleShopLock` 三个接口：能力闸门、当前锁没锁、切换，三处共用一份判据，存档清洗也问它） |
| `eventManager.js` | 无尽事件系统（纯逻辑）。`shouldTriggerEvent(rng)` = rng < `EVENT_TRIGGER_RATE`(0.3)；`buildPendingEvent(eventId, wonLevel, rng, now)` 把事件定义构建成待处理事件：**`goldByWin`/`expByWin` 倍率先按刚打赢那关的无尽胜利奖励换算成固定值（第 1 关 = 50 金币/20 经验的倍数），`outcomes` 随机选项当场预掷出唯一结果、`statUp/statDown` 的具体属性当场定死**——存档里只有固定值，读档恢复绝不重掷；`maybeCreatePendingEvent(run, wonLevel, now, rng)` 是胜利结算的入口：只作用无尽、已有 `pendingEvent` 时绝不重触发，并把事件 id 写进图鉴「已发现事件」；`resolveEventChoice(run, choiceIndex, ctx, rng)` 结算玩家选择：扣款先验余额（不足整单拒绝）、`curio`/`skill` 随机奖励走 `grantRandomCurio`/技能候选池（`ctx` 由 mode.js 从 lib 现算传入，保持本文件纯逻辑）、属性奖励钳到 `0..maxLevel` 并写明生效与否，完成后 `pendingEvent` 清空；技能名等依赖 `lib.translate` 的文案由 mode.js 补齐。本轮的三处扩展：① `buildPendingEvent` 第 5 参改成 context 对象 `{statLevels, curios}`，新增**构建期展开**的 `curioRarity` + `expIfNoCurioByWin`（按初始品质掷定给哪一件 → 写成 `curio: <具体 id>`；掷不到就把 N 倍基准经验并进 `exp`——所以这两个键只存在于事件定义，永远不进存档，`normalizeEventReward` 也不认它们）；② **交互型选项 `choice.action`**（`abyssDebt` / `skillForge` / `rift` / `merchant` / `curioForge`）：`buildEventAction` 在构建期把商人的货与价、裂隙的敌人数与倍率奖励、融合炉的融合费全部算成固定值，`withActionText` 再把价钱追加进选项文案，`resolveEventChoice` 遇到 action（`abyssDebt` 除外，它不需要玩家再挑东西）就**一个钱不扣、`pendingEvent` 也不清**，原样回给 mode.js 编排子页面或裂隙战；③ **两种「用不了」彻底分开**——`isChoiceAffordable` 只管「钱不够」（置灰、点了毫无反应），新增 `getBlockedMessage(run, choice)` 管「此刻没有可作用的对象」（属性全满 / 没技能可熔 / 没奇物可融合 / 商人那件已练满），这类选项照常可点，`resolveEventChoice` 在扣款之前先弹作者写的 `blockedText` 一句、一个钱不扣、事件照样收掉。配套：`withCostText` 现在金币与经验都补价钱（本轮开始有花经验的事件）、`applyEventCurrency(run, reward, asGain)` 与 `pickRandomSkillId(run, ctx, rng)` 抽成导出函数供 mode.js 的技能熔炉复用同一份口径（`asGain` 让文案写成「获得 80 经验」而不是账目体）；写了 `blockedText` 的 `statUp` **不再**被「属性全满就换成随机奇物」的生成期改写吃掉 |
| `reward.js` | 胜利结算：入账、关卡推进，并把 `shopRefreshesRemaining` 补回 `SKILL_REFRESH_PER_LEVEL`——**只有真的通关进下一局才补**，失败/重进商店/重载都不补（`penalty.js` 原样透传该字段，靠反复失败白刷商店这条路是堵死的）。奖励一律按「刚完成的关卡编号」算：先取奖励、再推进 level。入账前先按已拥有奇物的结算加成放大（`curioManager.getBonus` 的 `goldRate`/`expRate`，幸运石即经验 +10%），**只看这一局开始前就持有的奇物**。无尽模式通关后**先掷奇物商店（`CURIO_SHOP_RATE` 10%，mode.js 里的事件判定排在它之后——先奇物商店、再事件）**，命中才随机摇三个奇物候选（`rollCurioOffers`，排除已拥有、按推进后的新关卡定价）连价定死写进 `curioOffers`，**未命中直接把旧批次清空**——旧版本留着没买的候选，结果同一批货能挂十几关不动；现在「看得见奇物商店」等价于「这一关刚刷出新货」；闯关两样都不做，旧平衡完全不动。**收藏家的橱窗（v9）是这条规则的唯一豁免**：技能商店锁着就把这批候选连价原样留到下一关，**买过的那张也留在货架上、继续显示「已购买」**（用户定稿：下次刷新时那个技能仍要保留，和正常购买一样显示已购买），只是给它多打一个 `carried` 留货标记——留货的已购买不再吃新的一局的额度（`shop.getPurchasedCount` 只数本次进店买掉的那几张），所以另外两张连同免费刷新次数照常可用（规格原话「免费的刷新次数要刷新，只是三个技能不刷新」；旧写法把 `sold` 一律清零，才会出现「已拥有的技能显示成可购买、点进去走替换页」），奇物商店锁着就整批原样留着（不掷 10%、不置空、黄金罗盘压着的队列也不动）；锁着但货架本来就空的一律照常走原流程（没有货可保，拦了反而把玩家锁在空货架上——分区一隐藏连解锁图标都点不到）。本轮两处新结算：**储蓄罐**（`goldOfHeld`）排在基础奖励入账**之后**算，乘的是「此刻手上的金币总额」，所以与 `goldRate` 是叠乘关系（这是刻意的），向下取整、余额不足就不给；**黄金罗盘**（`extraCurioShopChance`）在正常那批之后单独再掷一次，两批互不排斥——非空批次里第一批进 `curioOffers`、其余进 `curioOfferQueue`，于是同一关可能「买完一批还有一批」（`buyCurio` 负责把队列提上货架），摇第二批时用 `exclude` 排掉第一批已挂出去的货，都没命中则两个字段一起清空 |
| `penalty.js` | 失败结算：按比例扣货币、货币不足 fallback、无尽删档判定（纯逻辑） |
| `enemy.js` | 敌方随机生成（纯逻辑 + 只读 `lib`）。**`getEnemyCount(level, mode)`**：1~10 关 1 个、11~20 关 2 个、21~30 关 3 个，无尽第 31 关起固定 3 个（两模式同一张表）。**两张池绝不混用**：闯关 `getChallengeEnemyPool()` 只从本扩展实际注册的角色里选（`core/loader.js` 的 `packages` 数据，与 `registry.buildPackage` 同源，不硬编码名单）；无尽 `getEndlessEnemyPool()` = 运行时 `lib.character` 全集 − 本扩展角色，再过滤掉禁用的（复用 `isEnemyUsable`：`forbidai`/`isAiForbidden`/本体 `characterDisabled`，叠加 `skillPool.getBannedCharacterIds()` 的跨模式禁将并集）。**`allocateEnemyStats(totalPoints)`**：用「带上限的顺序分配」把恰好 `min(totalPoints, 30)` 点随机分到防御/过牌/攻击三项（每步只在「剩余点数仍分得完」的区间里随机，不重试、无偏差），单项 ≤10；每个敌人独立调用。**`createEnemyConfigs(level, mode, rng)`** 把三者合成敌方阵容并交由 `mode.js` 写进存档——开战前定死，重载不重掷；**无尽模式从 `abyssConfig.ABYSS_START_LEVEL`(1) 层起，每人再各自独立掷一次深渊词缀写进 `entry.abyss`**（门槛 `abyss.isAbyssStage(level, mode)` 在这里判一次，闯关模式恒为空数组、一行随机都不跑）。**闯关前 10 关走关卡配置池**：`ensureChallengeStages` 在建局时把 `data/challengeStages.js` 里成员角色都**存在**（禁将不拦）的配置不重复抽满 10 个写进 `run.challengeStages`（旧档首次开战补抽一次，之后读档/重进/失败重战绝不重掷），`createStageEnemyConfigs` 按 `challengeStages[level-1]` 的配置生成阵容——single 与 group 统一按 `players` 逐个解析，成员写了 `stats`/`skills`/`maxHp`/`hp` 就按配置来，没写就按关卡数随机分配；这一路的开战校验以 `resolveBattle(…, { allowBanned: true })` 放行禁将角色（只有角色不存在才跳过），其余战斗路径维持原口径。**`createBossEnemyConfig(level, mode, rng)`（Boss 战专用）**：本场抽中 Boss（`currentBattle.isBossBattle`，创建那场战斗时逐场判定）时替代普通生成——只有 1 名敌人，角色从模式池再按 `getBannedCharacterIds()` 禁将并集过滤后随机（闯关池本身刻意不拦禁将，Boss 这里必须再过滤一道），额外复制另外两个不同角色的全部技能（来源不限禁将、但要过 `isRogueSkillAllowed` 兼容层）并固定追加 `BOSS_EXTRA_AFFIXES` 个深渊强化；体力 ×2 只在 `battle.js` 初始化该 Player 时做一次，存档只记 `boss` 标记。**闯关第 11~30 关走双人组合池**：`ensureChallengeComboStages` 在首次进入 11~30 关时，把 `data/challengeCombos.js` 里成员角色都存在的组合不重复抽满 10 个写进 `run.challengeComboStages`（残缺存档重抽、可用组合不足明确报错不循环补齐；第 N 关取第 `(N-11) % 10` 项，所以 21~30 关严格复用 11~20 关的结果、绝不重抽）。第 11~20 关由 `createStageEnemyConfigs` 直接按组合生成双人阵容（players 顺序=敌人先后，shared 预算）；第 21~30 关由 `createChallengeComboConfigs` 追加**扩展角色池（`getChallengeEnemyPool`）随机第三人**：第三人排除与固定两人重复（组合自己撞名也一样）、位置在三个空位随机但左右相对顺序永不变、找不到合法第三人时明确失败由上层阻止开战（绝不复制固定角色凑数），第三人随 `currentBattle.enemies` 落盘，恢复战斗原样沿用绝不重掷 |
| `battle.js` | 用本体 `prepareArena / gameDraw / phaseLoop` 开一局，并把敌我强化只施加到当前 Player 上。敌人的 Roguelike 属性走**玩家的同一张效果表**（`data/stats.js` 的 `sumStatEffects`）：属性等级变化后敌人含义自动同步，不存在第二套敌方效果。建局时必须 `assignPlayerIds()`：`prepareArena` 走的 `ui.create.players` 不分配 `playerid`，而本体 `addSkill` 只有 `playerid` 存在才登记触发钩子（`player.js:11088`），缺了它所有触发类技能都不会触发（`single.js:605`、`doudizhu.js:89` 都是这么补的）。**运行时发技能一律走 `grantSkills(player, ids, 警告前缀)`**：先过本体 `game.expandSkills` 把 `group` 伙伴补齐再逐个 `addSkill`（本体角色初始化也是这一条，`player.js:13210`；`player.addSkill` 自己不带 `group` 伙伴，`group` 在本体里只被 `disableSkill` 读过一次），玩家购买技能、敌人 `entry.skills`、属性 `extraSkills` 三个入口共用。`expandSkills` 是原地去重追加同一个数组（`Array.prototype.add` 自带 `includes` 判断）、只展开一层、`group` 写字符串或数组都吃，别自己重写 group 解析。**展开出来的伙伴技能只活在场上**：不写进 `run.skills`、敌人配置与属性表，一个都不占肉鸽技能槽（槽位统计永远只看 `run.skills.length`）。真实的带 group 技能例：官方 `kongcheng`（空城）→ `group: "kongcheng1"`。**敌人的深渊词缀**在 `applyEnemyModifiers` 里落地：`applyAbyssAffixes(player, entry.abyss)` 先过 `abyss.normalizeAbyssIds`（旧档/手改档兜底），逐个 `grantSkills` 挂上词缀技，再把同一份 id 数组**赋值**（不是累加）进 `player.storage.abyss_affix` 并挂上标记载体，最后把属性等级与词缀 id 记进 `player.rogueEnhanceInfo` 供面板读数。徽记的点击绑定统一走 `bindMarkTap(mark, open)`（`preventDefault` 掐掉轻触补发的合成 click，否则它落进刚弹出的浮层会被「点框外关闭」当成一次外部点击）；玩家的 `rogue_stat` 与敌人的 `rogue_stat`/`abyss_affix` 三枚徽记共用这一条，绑定必须排在 `applyEnemyModifiers` 之后——徽记是 `addSkill` 时才建出来的；敌人那两枚分别绑到属性页与深渊页，不再是同一页 |
| `bgm.js` | 大厅与战斗的背景音乐。大厅：`playLobbyBgm()` 循环播 `LOBBY_BGM`，`stopLobbyBgm()` 进战斗时停止；**还在放就绝不打断**——删档、营地↔存档页↔商店互相切都是原地重绘，不重头也不换轨，只有停下来过的（页面重载后是全新元素）才从头播。战斗：`playBattleBgm()` 由 `launch()` 进战斗时调用，从 `BATTLE_BGM_LIST` **随机起一首、一首放完随机接下一首**（onended 连播，不与刚放完的重复；一个页面会话只打一场战斗，重载后整个音轨重建），`stopBattleBgm()` 只在**失败结算**的 `onover` 调用（胜利结算故意不停，BGM 一路响过结算页，返回营地时的整页重载才收）。两个角色各自只建一个 `<audio>` 元素，音量都走扩展独立设置 `rogue_bgm_volume`（与本体音乐音量解耦，见下）。**大厅与战斗期间都把本体背景音乐按成静音**（`ui.backgroundMusic.volume = 0`，否则两首叠放；失败结算或整页重载时才还原）——用音量而不是 `pause()`：本体那份在页面加载时往往还没开始放（还在缓冲），那时 `pause()` 会漏掉它稍后的自动播放；`ourBgmOn()`（大厅或战斗任一在放）闸门挡住 `play()` 延迟兑现的 `then`，避免我们的音轨都停了之后本体还被静音 |
| `endless/abyssConfig.js` | 深渊化强化的机制参数（只放参数，不放逻辑）：总开关 `ABYSS_ENABLED`、起始层 `ABYSS_START_LEVEL`(1，第 1 关起即可随机)、满层 `ABYSS_FULL_LEVEL`(100)、词缀池 `AFFIX_POOL`（每项 `{ id, weight, enabled, category }`）、单个敌人的词缀上限 `ABYSS_MAX_AFFIXES`（null=只受池子大小限制）、徽记文字 `ABYSS_MARK_TEXT`。**新增强化三步**：在 `abyssAffixes.js` 写技能本体与 `affixText` 文案 → 在这里登记一项 → 完事，无尽流程一行都不改。`weight` 是抽样相对权重；`category` 只是给人看的分类、不参与随机；**`tags` 是准入门槛**（写了 tags 的词缀只在调用方把该标签放进 `context.tags` 的场合才进池，用来做 Boss 专属/奇物互动限定；不写 tags = 通用词缀，任何场合都能随机到，所以普通词缀千万别顺手写 tags，会把通用池筛空） |
| `endless/abyss.js` | 深渊化的「算数量 + 随机 + 清洗」层（纯逻辑，不碰 `game`/`lib`/`DOM`，可在 Node 里直接测）。**`rollAbyssAffixCount(level, rng)`** 逐条对应规格：31~99 层每个敌人独立掷 `stage%` 概率拿 1 个；100 层起必定 `floor(stage/100)` 个，再按 `(stage % 100)%` 概率多拿 1 个（234 层 = 必定 2 个 + 34% 拿第 3 个）。**`rollAbyssAffixes`** 做按 weight 的**不放回**抽样，所以同一敌人身上绝不重复，池子排空时给更少的条目（不死循环）；**`normalizeAbyssIds`** 是读档白名单：只留在池子里的 id、去重、按 `AFFIX_POOL` 顺序稳定排列、夹到上限，下架词缀自动被清掉；**`isAbyssStage(level, mode)`** 是唯一的大门（非无尽、低于起始层、总开关关掉都在此挡掉）。随机只发生在**开战前生成阵容那一次**，结果随 `currentBattle.enemies` 落盘，之后重载/恢复战斗绝不重掷 |
| `endless/abyssAffixes.js` | 九个词缀的持恒技本体（`abyss_buqu` 不屈 / `jianbi` 坚壁 / `kuangre` 狂热 / `liesha` 猎杀 / `xuwu` 虚无 / `jingxiang` 镜像 / `wuran` 污染 / `yongheng` 永恒 / `fuchou` 复仇）+ `affixText` 文案表（名称/描述的唯一来源）+ `translate` 双键翻译 + `abyssMarkSkill`（`abyss_affix`：纯标记载体，只挂一枚「深渊」徽记并列出词缀名，不带效果，与玩家的单枚 `rogue_stat` 同一套做法）。它们由 `mode.js` 并进模式配置的 `skill`/`translate`，**只有进入肉鸽模式才注册**，其它模式连技能都不存在。文件头列了这十条踩过的本体契约（`event` 与 `trigger` 谁是谁、没有 `mod.damage`、`disableSkill` 的第二参才是被禁技能、content 必须 async、`roundStart/roundEnd` 只能挂 `global`） |
| `data/` | 作者填写的内容配置：`skills.js` `stats.js` `rewards.js`；`events.js` 无尽事件池（名称/描述/配图/选项，奖励支持固定值、按胜利奖励缩放的倍率 `goldByWin`/`expByWin`、随机奇物/技能/属性，随机选项用 `outcomes` 写概率、生成时预掷定死；**交互型选项写 `action`（五种 kind，见 `eventManager.js` 一行），「此刻没有对象可作用」要说的话写 `blockedText`**——现在 16 个事件：废弃机器人 / 神秘商人 / 幸运硬币 / 许愿池 / 未知实验室 + 经验泉 / 技能熔炉 / 属性训练场 / 深渊裂隙 / 流浪商人 / 奇物融合炉 / 古代遗迹 + 废弃补给站（纯倍率奖励：翻找 1 倍金币 / 仔细搜寻 0.5 金币 + 0.5 经验）/ 老兵的训练（让他训练 1 倍经验 / 花钱请教扣 0.5 倍金币换 2 倍经验）/ 黄金矿脉（立即开采 1 与 1 / 仔细采集 1.5 与 0.5）/ 经验商人（1 倍金币 ↔ 2 倍经验，双向两档 + 白走的出口）——后四件全部只用 `goldByWin`/`expByWin`（负数即消耗），一个机制代码都不多写）；`curios.js` 奇物池（名称/描述/配图/**初始品质** `rarity`/售价倍率/`effect` 初始档机制效果键 + `qualityEffects` 升级档效果（`{ rare: {...}, epic: {...} }`，**整份替换** effect 而不是叠加，品质键必须晚于初始品质）；界面文案由这些键自动生成，没有手写文案字段。现在 18 件：破损怀表 / 幸运石 / 气息腰带 / 能量核心 / 剩饭 / 循环按钮 / 诅咒金币 + 狂战徽章 / 血怒核心 / 反击护符 / 黄金罗盘 / 储蓄罐 / 遗忘之石 + 回响之铃（普通濒死 50% 收回本局用过且躺在弃牌堆的牌 / 稀有 75% / 史诗必定）/ 破碎王冠（普通击杀 +1 上限回 1 血 / 稀有再摸牌至手牌上限 / 史诗回满血并摸上限张）/ 贪食魔盒（史诗，每次替换技能发 5 倍本层基准经验）/ 饥饿之匣（负面向普通/稀有/史诗净化：金币 -15%→-10%→-5%→不打折，经验 +5%→+10%→+15%→+20%）/ 收藏家的橱窗（稀有锁技能商店 / 史诗连奇物商店一起锁））；`enemyGroups.js` 只剩一件事——把 v2 旧档进行中战斗的 `groupId` 还原成敌方阵容（新战斗的敌人已改为 `enemy.js` 按模式随机）；`challengeStages.js` 闯关前 10 关的敌方配置池（`id` 是存档唯一标识、`players[].character` 写真实角色 id；加单角色或组合只改这个数组，随机/存档/战斗流程都不用动）；`challengeCombos.js` 闯关第 11~30 关的双人组合池（28 个组合、`type` 固定 group、`players` 恰 2 名且**数组顺序就是敌人先后**；第 11~20 关 28 选 10 逐关映射，第 21~30 关复用同一结果加扩展池随机第三人；加组合只改这个数组） |
| `ui/` | 存档页（仿造梦西游的「存档记录」卡片网格，自定义样式在 `ui/styles.js`，只作用于 `.wm-rogue-*`）、选角色、营地（主界面）、商店、技能查看页、替换技能、结算、惩罚选择、事件页（`ui/event.js`）、图鉴页（`ui/collection.js`）。除选角色与替换/惩罚列表用本体 Dialog 外，其余都是自建浮层。选角色页直接用本体 `ui.create.characterDialog`，保留其搜索框（支持正则与技能搜索）、拼音/势力/收藏筛选条与分页，仅以 `noclick` 接管点击；说明与返回放在内容最前，并把本体分页的每页张数（配置 `showMax_character_number`，这台机器是 10）放开到 `CHARACTER_PICKER_PAGE_SIZE`（24）——超出当前页的武将牌只是被加上 `.nodisplay`，光加高窗口刷不出多余的行。**自建浮层分两层**：`#wm-rogue-overlay` 只负责遮罩与滚动，里面的 `.wm-rogue-stage`（`min-height:100%` + 子元素 `margin:auto`）负责居中——内容矮时居中、内容高时 auto 外边距归零从顶部开始滚，不用固定 `top`/`transform`，也不用 JS 算像素边距。**营地**（主界面）：标题栏只有居中的「奥特肉鸽」，**没有技能入口**；正文是「第 N 关 + 玩法 + 两块资源 + 当前成长（标题下面是角色名，再接三张只读属性卡）+ **两行动作按钮**」——第一行是「继续玩」：`开始下一关`（金色主按钮）+ 商店（蓝色 `wm-rogue-hub-shop`）+ 图鉴（紫色 `wm-rogue-hub-index`），第二行是「离开当前局」：返回存档 + 退出肉鸽模式（灰色次级 `wm-rogue-hub-secondary`，长度与字号的唯一旋钮在 `ui/styles.js` 对应行）；两行结构在 `hub.js` 里由两个 `.wm-rogue-hub-row` 定死（不靠 `flex-wrap` 撞运气），行内窄屏才折行，行距与列距两个 `gap` 就在那两条规则里；两种模式都有「图鉴」入口（图鉴是公有的收集册，闯关自己不产出内容但能翻开看）；查看已拥有奇物的入口在**商店顶部资源行第四块「奇物 n」**（与「技能 n/3」同一套入口样式，点开的是**奇物管理页**：卡面 = 方形配图 + 名字 + 当前品质标签 + 描述 + 当前效果 + 「下一品质 + 下一品质效果」预览 + 升级价 + 升级按钮；已达到链尾的史诗只写「已达最高品质」不给按钮，负面奇物照样能升所以按钮不隐藏；品质、效果与价格一律问 `curioManager`，UI 自己不判也不自己算，升级后走 `refreshCurios()` 原位重绘——重开页面会把滚动位置甩回顶部）。**选择玩法**是同风格的两张卡（点整张卡即选中，无尽卡显示历史最高）。**商店**：顶部固定「标题 + 三块资源」与右上角返回，其中第三块「技能 n/3」**本身是查看已购买技能的入口**（有 hover/active 反馈）；中间滚动区放「技能商店」（标题与刷新按钮同一行：`.wm-rogue-shop-section-row` 左标题右按钮，刷新按钮**属于这个分区**，不放页面顶部也不跟右上角返回挤在一起；文字是 `刷新 2/2`→`刷新 1/2`→`刷新 0/2`，用完与本局已购买都只置灰不隐藏，买过后文案换成 `本局已购买`；宽度按最长文案定死 `min-width:116px`，切换状态时不抖；**同一行最右还有一枚商店锁**（`.wm-rogue-shop-lock`，收藏家的橱窗给的：`🔓` 未锁 / `🔒` 已锁，点一下切换并立即落盘；没那件奇物就不画这枚图标）。刷新走 `refreshShop()` 原位重绘——候选 id 变了要先把三张卡片删掉重建，只改文字会留着旧技能的头像、描述和点击回调，滚动位置不受影响。每张卡＝出处小头像 + 技能名 + 限高描述 + 售价 + 购买按钮，按钮文字即状态：`购买` / `金币不足` / `已购买` / `本次商店已售罄`，价格只在价格行里写一次）、「奇物商店」（仅无尽：候选由每关胜利按 `CURIO_SHOP_RATE` 概率刷新并连价定死，卡＝方形配图 + 名字 + 稀有度标签 + 描述 + 效果行 + 售价 + 购买按钮，按钮态同技能卡但售罄文案是 `本批已售罄`；无候选（未刷新 / 买到即下架 / 已集齐）时整个分区隐藏（`.wm-rogue-curio-section.wm-rogue-hidden`），不留「已购买」残卡；分区标题行（`.wm-rogue-shop-section-row`）在持有史诗档橱窗时同样挂一枚 `🔓/🔒`——注意空货架时整个分区连同锁一起隐藏，所以锁只挡「货架非空时的自动刷新」）与「属性强化」（属性名 + `Lv.x/10` + 逐行累计效果 + 升级价 + 升级按钮）。**技能查看页**复用商店卡片但只读（完整描述不再限行，空态提示「当前没有已购买技能」，返回回商店）。**事件页**：事件大图（512×512，CSS 背景引用 `assets/events/` 配图）+ 名称 + 描述 + **金币/经验资源条**（本轮加：好几个选项要花钱，玩家得先看得见余额，才知道置灰的那项是「付不起」而不是「坏了」；资源条由 `ui/common.js` 的 `addResBar`/`addResCell` 画，营地、商店、事件页与三个事件子页共用同一版式）+ 纵排选项按钮。**两种「用不了」长得不一样**：钱不够 → 置灰并注明「货币不足」、点了没有任何反应（与商店的「金币不足」按钮同款；结算层再验一次，双保险）；没有可作用的对象（属性全满 / 没技能可熔 / 没奇物可融合 / 商人那件已练满）→ 照常可点，点下去只弹作者写的 `blockedText` 一句、一个钱不扣。**事件子页面**三个（流浪商人 / 技能熔炉 / 奇物融合炉，都在 `ui/hub.js`）：整页复用替换技能页的居中层与卡片横排（`.wm-rogue-replace*` + `.wm-rogue-shop*` + `.wm-rogue-curio*`，所以样式加固一行都不用动，只把三个新 overlay 类名加进标题字号那条选择器），顶部都有返回（等价于「这个事件我不想再动了」）与资源条；商人是单件奇物卡（未拥有写「买下」、已拥有可升写「买下并升级」、练满则保持可点交给结算层弹一句），技能熔炉把已有技能各画一张卡 +「熔炼此技能」，融合炉把 `getUpgradableCurios` 各画一张卡 +「融合」（经验不够才置灰）。**三个子页面都是「选定那一刻才扣钱」**，所以 mode.js 在扣款前会重读一次余额（双判），而事件在成交前始终挂在存档上——中途关游戏回来还是这个事件。**图鉴页**：两个分区各一行卡——「事件（n/总数）」与「奇物（n/总数）」，已收录的点亮配图、名字、描述（奇物附稀有度标签），未收录的显示「？？？」剪影与「未发现」，记录的是**曾经**拥有（丢弃也点亮）。**结算页**是大标题 + ✓/✕ + 奖励/损失分行 + 下一关信息 + 显著返回按钮（有待处理事件时按钮变「继续」，先进事件页再回营地）。所有浮层按钮统一 `display:inline-flex + align-items/justify-content:center`（`inline-block + line-height` 在主题环境里做不到真正的文字居中）。出处由 `common.js` 的 `skillOwner()` 扫 `lib.character` 技能表得出，头像用本体给任意 div 都挂了的 `setBackground(id,"character")` 画；技能文本一律过 `sanitizeSkillText()`：把 `<noname-poptip poptip="id">` 按 `lib.poptip.getType/getName` 转成可读文字（技能〖名〗、卡牌【名】、其它直接名字），查不到就退回标签内文本、再退回 id，`<br>` 转换行，其余标签兜底剥离——卡片与完整描述弹层共用同一套转换。字号层级（都在 `ui/styles.js`，改字只动这几处）：商店标题 30 → 资源数值 26 → 区域标题 24 → 技能名 22 / 属性名 21 → 等级与价格 18 → 按钮 18 → 描述 17（限高 5 行，点卡片看完整说明）→ 属性效果 16 → 出处与说明 14；存档页小字 14~15、角色名 21、编号 32 不再放大 |

设计约束：

- 存档只走本体机制 `game.save("rogueSlots", lib.storage.rogueSlots)`，按模式分键存进本体数据库；写入前经 `toSerializable` 校验，禁止 Player/Card/函数/循环引用进入存档；
- 一关 = 一次对局会话，结算后用 `directstart + game.reload()` 回主界面（与本体 `brawl.js` 相同做法），不在一次 `phaseLoop` 内串联多局；
- 「退出肉鸽模式」与存档页的「返回」都是**回到游戏初始界面**：先落盘（`rogueActive` 置 -1），再清掉 `directstart` 与 `show_splash_off` 后自己 `window.location.reload()`——不能直接用 `game.reload()`，它会顺手写 `show_splash_off = true`（下次启动就不再显示初始界面了），那样重载后会又落回本模式的存档页；
- 开局前先把随机好的敌方阵容（角色 + 三项属性分配）写进 `currentBattle.enemies` 存档，因此刷新/崩溃后重打的是同一套敌人，且不重复发奖；旧档（v2 及更早）只存了 `groupId` 的，读档时按原组合配置还原成阵容，同样不重掷；闯关前 10 关更早在建局时就一次性抽定了 `challengeStages`（每关一个配置 id、互不重复、随档落盘），失败重战/读档/重进都按 `challengeStages[level-1]` 生成同一批敌人；闯关第 11~30 关同理——`challengeComboStages`（10 个组合）首次进入该区间时抽定落盘，第 21~30 关的第三人也在开战前随 `currentBattle.enemies` 一起定死，恢复战斗原样重打、绝不重掷；
- 敌人强化只改运行时 Player，绝不回写 `lib.character`；肉鸽技能挂在模式配置的 `skill`/ `translate` 上，只有进入本模式才注册；
- 运行时给技能（玩家购买 / 敌人额外技能 / 属性 `extraSkills`）统一走 `battle.js:grantSkills()`，由本体 `game.expandSkills` 补齐 `group` 伙伴；展开结果只进当前 Player，**永远不回写 `run.skills`、敌人配置与属性表**，所以存档只保存主技能 id、技能槽也只数主技能；
- 属性强化的机制技能（`rogue_stat`，四种数值强化合并成一个）带 `popup: false`：本体触发技在 `content.ts:4201` 用它决定是否走 `logSkill`，而 `logSkill` 又调 `trySkillAnimate` → `$damagepop`，十周年UI 的 `$damagepop` 会把整段「技能名+描述」渲染成场地上的大字。要关掉大字只能在这里关，`nopop`（加技能弹窗）与 `logv`（战报行）都管不到；一个技能同时挂 `trigger`（摸牌/伤害概率）与 `mod`（手牌上限/出杀次数），玩家身上只会有一个「强化」标记，点开由 `intro.mark`（函数形式，本体 `get/index.js` 的 mark 节点介绍会原样插入）列出四项实时数值，`intro.nocount` 防止本体拿对象去数数量；点「强化」标记还会弹出自建浮层（`common.js:showBattleStats`）列三属性等级与当前效果：**没有关闭按钮，点面板外的遮罩区域直接退出**（面板内点击不关闭；打开那一下的触摸已 `preventDefault`，防合成 click 落在遮罩上把面板一点开就关掉）。**敌人那两枚徽记各开各的面板**：点「强化」只开 `common.js:showEnemyEnhance`（属性部分与玩家面板逐字同款：`防御 Lv.n` + 累计效果行），点「深渊」只开 `common.js:showEnemyAbyss`（紫色「深渊强化」标题 + 逐个词缀的名称与描述，**名称只保留文字**——不再用胶囊徽记把同一个名字重复一遍）；两页读数都取自该 Player 的 `rogueEnhanceInfo`（属性等级 + 词缀 id），所以恢复战斗后显示的内容与开战当时一致。**「只有防御」的敌人也必须有「强化」入口**：防御给的是护甲/体力上限，不走 `rogue_stat` 的那四个战斗键，`applyEffects` 的 `hasStat` 判不到它，所以 `applyEnemyModifiers` 另外按「面板上确实有东西可看」（四项战斗键或 armor/maxHp 任一非零）传 `showStatEntry`——否则这类敌人的属性面板根本点不开。**玩家那枚「奇物」徽记同样点开自建浮层**（`common.js:showBattleCurios`，与属性强化同一套版式）：按「**战斗内生效**」与「**结算时生效**」分两组列，每组内是「名称（当前品质）」+ 该组的效果行，名称按品质着色（复用 `wm-rogue-rarity-*`，另外四条 id 作用域规则压过 `detail-name` 的金色）。**分组是必须的**：诅咒金币（金币获取）、循环按钮（商城刷新）在战斗里一点用都没有，跟真正当场生效的摸牌/回血混在一张表里会让人以为这局马上能吃到；分组依据直接复用 `CURIOSITY_BATTLE_KEYS`，不另立名单（哪组都没效果的奇物自然不出现）。品质与效果一律取自 `curioManager`，所以升级过的奇物显示的是升级后的数值。徽记自带的 `intro.mark`（本体那个灰底 tooltip）保留作悬停兜底，但真正能读的是这个面板——它只有效果总表、拿不到 run，显示不了逐件品质，也做不了分组。**四个属性/奇物面板（玩家属性、敌人属性、敌人深渊、玩家奇物）共用 `common.js:openStatPanel`**，正文一律挂在 `.wm-rogue-stat-body` 这个**可独立滚动的条**里：奇物以后可能有几十件，只有正文该滚、标题与分隔线留在原位（分组头跟正文一起滚）。配套 CSS 三件事——stage 给 `height:100%` 让面板的 `max-height:100%` 解析得出来、面板 `display:flex;flex-direction:column` + 标题/分隔线 `flex:none`、正文 `min-height:0`（不给它，flex 项不会压缩到小于内容，滚动条根本不出现）；手机端靠 `-webkit-overflow-scrolling:touch` + `overscroll-behavior:contain`（滚到底不把滚动甩给外层），而本体在 document 上对 touchmove 的无条件 preventDefault 早由 `openOverlay` 的 `isolateOverlayTouch` 挡掉了——**没有这一步，浮层里任何 overflow 列表在手机上都滚不动**；
- 触发技里**判时机只能用 `event.triggername`，不能判 `trigger.name`**：本体把 content 编成 `(event, trigger, player)`（`ArrayCompiler.compile` → `Reflect.apply(original, this, [event, event._trigger, event.player])`），这里的 `trigger` 是**被触发的基事件**，它的 `name` 只会是 `damage` / `phaseDraw`，永远不等于 `damageBegin1` / `phaseDrawBegin2`；时机名只写在技能自己的 `event.triggername` 上（`game.createTrigger`）。`filter(event, player, triggerName)` 的 `event` 同样是基事件（本体战法 `zf_hengfeng`、`zf_houfaxianzhi` 就是这么写的）。曾经 `rogue_stat` 用 `trigger.name` 分支，结果摸牌加成与概率加伤两条全哑——技能照触发、数字照旧，测试还因为夹具伪造了 `trigger.name` 而一片绿；
- **加一件「战斗内奇物」要同时落四个地方，漏一个都是静默失效**（本轮踩过两次，桩测全绿、真机没效果）：① `curioManager.CURIOSITY_EFFECT_KEYS`（数据自检认这个键）；② `CURIOSITY_BATTLE_KEYS`——**配套键也要写进来**（`unrespondableLowHp` / `unrespondableCardDamage` 之于 `unrespondable`，与 `dyingRecoverToRatio` 之于 `dyingSave` 同例），因为战斗面板按这张表把效果切成「战斗内 / 结算时」两组分别渲染，漏在栏外的配套键会被整块切掉，血怒核心的文案就因此显示成「你使用的牌无法被响应」而丢掉体力条件与「此牌伤害 +1」；③ `EFFECT_TEXT`（界面文案唯一来源，不写就没有那一行）；④ `data/skills.js` 的 `rogue_curio` 触发分支（需要新时机的还要把时机加进 `trigger` 列表，并把「键 → 时机」补进 `rogue-data.test.mjs` 的 `need` 表；**每个带配套键的奇物也要把配套键名补进那张表的 `companionKeys` 清单**）。`battle.js` 现在按 `CURIOSITY_STORAGE_KEYS`（= 战斗内表）**遍历**写 `player.storage.rogue_curio`，不再逐个键手写——以前那张手写清单正是「技能挂上了、数值全是 0」的源头，而逻辑层用例是自己往 storage 塞数的，只有 `rogue-mode-smoke` 那条真机链路拦得住；另：`battle.js` 对 `Ratio` / `Chance` 结尾的键**不取整**，所以概率类效果键一律以 `Chance` 收尾（`dyingRecallChance`），否则 0.5 会被 `Math.floor` 抹成 0；
- **打完一局的页面里不能再开一局**（本轮真机踩到）：本体的 `game.over` 会把这一局拆干净（`_status.over = true`、`ui.clear()`、`game.stopCountChoose()`），而引擎里**没有任何「同一页面里再开一局」的先例**——本体所有模式打完都 `game.reload()`，`game.loop()` 本身也不检查 `_status.over`，所以在旧会话里再 `game.loop(新事件)` 不会报错、也不会开场，表现为**静默无反应**。本项目因此定死一条：**任何开战都只发生在「页面加载时（恢复页）」或「营地按钮（全新会话）」两处**，事件里要开战的（深渊裂隙）必须先落盘再 `reloadNow()`，由恢复页在全新页面上 `launch()`——与「开始下一关」逐字同一条路。桩测抓不到这类问题（桩的 `game.loop` 不真跑事件循环，`game.over` 也不拆环境），只能靠真机；
- **紧挨着的一条坑：content 必须写成 `async`**。本体的 `ContentCompiler` 按函数类型分流——`async function` 走 `AsyncCompiler` → `ArrayCompiler`，**直接 `Reflect.apply` 原函数**，闭包里的模块级辅助函数都能用；而**普通（同步）function 走 `StepCompiler`，它把函数源码 `toString`/反编译后用 `new Function` 重建**，只注入 `_status/lib/game/ui/get/ai` 六个 topVars 并把 `event` 解构成 `source/target/card/cards/num/skill/step/forced/result` 这些局部变量——**模块作用域 import 进来的东西全部拿不到**（`ReferenceError`），而且自己再声明同名局部变量会撞已解构的名字。所以技能 content 只要需要调用本文件的辅助函数就必须 `async`（`rogue_stat` 目前是同步的，只是因为它只碰 `player.storage` 和 `Math.random`，将来给它加模块函数记得改 async）。`filter` / `mod` / `intro.mark` 不经过这个编译器，闭包正常；
- **无尽深渊化强化**（`src/rogue/endless/`）：第 1 层起每个敌人独立获得随机词缀，把后期「一回合秒光敌人」变成新机制挑战，**不动玩家任何已有构筑**（纯加敌人，不减玩家数值；污染封的那张牌与虚无的本回合封印除外——这是词缀效果本身）。数量规则：1~99 层按 `stage%` 概率拿 1 个；100 层起必定 `floor(stage/100)` 个 + `(stage%100)%` 概率再拿 1 个。词缀**只从配置表随机、开战前定死、随 `currentBattle.enemies` 落盘**，中途退出再读档沿用同一批（`state.js` 白名单只认还在池子里的 id）；九个词缀都是持恒技（带 `persevereSkill` 标记：技能面板显示「持恒技」分类，且不被本体白板（baiban）类失效效果封禁），作为真实 lib 技能随模式注册（`mode.js` 的 `skill`/`translate`），所以本体角色信息区直接列得出它们的名字与描述。另有四枚**载体技能**同样随模式注册但绝不进随机池：`abyss_affix`（敌人身边那枚「深渊」徽记，不带效果）、`abyss_xuwu_blocker`（虚无的技能屏蔽载体，只被 `player.addSkillBlocker(id)` 按名字引用，永不 `addSkill`）、`abyss_xuwu_release`（虚无的解除宿主，以临时技形式挂在**被封印的玩家**身上，只借它 `removeSkill` 时的 `onremove`）、`abyss_wuran_lock`（污染的封牌 mod，必须挂在**被污染的玩家**身上才读得到）。闯关模式与其它模式一条都不碰：`abyss.isAbyssStage` 先按 `run.mode` 挡掉，非肉鸽模式下这些技能根本没注册；
- 词缀技能用到的本体判据（都读过源码，别再按直觉改）：**`lib.skill` 没有 `mod.damage`**，改伤害只能挂 `damageBegin1~4`，`num` 写成 0 会走 `damageZero` 分支、仍然算「受到过伤害」，「防止伤害」只能 `trigger.cancel()`；**「所有技能失效」只能用技能屏蔽器**（`player.addSkillBlocker(载体id)` + 载体的 `skillBlocker()`），因为本体每次触发都要重过 `filterTrigger → getSkills → game.filterSkills → get.is.blocked`，连还没响的触发技一起压住——`disableSkill(登记名, 技能id)` 得逐个点名（第二个参数才是被禁的技能），做不到「所有」；屏蔽器记在 `storage.skill_blocker` **数组**里、解除用的 `Array.remove` 一次只删一个，所以「已经按着就别再叠一层」，且**解除必须挂在被作用的那个人自己的临时技上**（`addTempSkill(宿主, { global: "phaseEnd" })` 到点 `removeSkill` 才走 `onremove`）——本体的死亡流程只摘临时技（`content.js:11668`），永久技不会被移除，把解除挂在词缀持有者身上，持有者先死就等于把玩家永久缴械；**封一张牌**用持牌者技能上的 `cardEnabled2`（使用与打出都会先问它，只对实体牌问）+ `cardDiscardable`（弃置，弃牌阶段的 `chooseToDiscard` 默认就吃它），三个 mod 的入参个数不一样，`checkMod` 又只读**执行动作那个人**自己的技能；伤害事件上**没有 `sourceSkill`**，实体牌用 `get.itemtype(card) === "card"`（`get.is.ordinaryCard` 判的是「转化牌只吃了一张实牌」，不是这个意思）；`roundStart` / `roundEnd` / **`phaseBegin` / `phaseEnd`** 都是全局时机，只能写在 `trigger.global` 上，后两个是**每个角色的回合**各响一次，要比「是不是同一个回合」就比 `phase` 事件对象的身份；`player.damage()` 返回的是**还没跑**的事件，可以先写标记再 await，反伤要带 `"nocard"` 否则本体把当前事件的牌抄上去；额外**整回合**用 `player.insertPhase()` + `_noTurnOver` + 六阶段 `phaseList`（只塞 `phaseList.splice("phaseUse|…")` 的那是额外**出牌阶段**）；
- 深渊词缀的**跨回合状态分两处**：能用标量的才进 `player.storage`（`abyss_buqu_used`（不屈已经用掉的濒死次数，上限就是该角色的体力上限）/ `abyss_fuchou` / `abyss_kuangre_round`），要存引用的**放 Player 或事件对象的普通属性**——`storage` 在本体里是要 JSON 广播/录像的，塞引用会炸：污染的被锁牌（记在**玩家**的 `abyssWuranLocked` 上）、镜像写在反弹伤害事件上的 `abyssMirror`（挡住两个镜像互反弹到永远）；唯一进 storage 的引用类状态是本体自己的 `skill_blocker`（虚无写的，内容只有技能 id 字符串，本来就允许广播）；这些状态都只活在当前一场的 Player 上，战斗结束随对象一起丢弃，天然不进存档；
- 商店候选池 = 作者清单 + 全体可选武将的技能（`skillPool.js` 每次进店现算），随机时再排除「当前角色原生技能（`lib.character[run.characterId][3]`，由 `mode.js` 取好再传进 `shop.js`，保持逻辑层纯函数）」与「当前 `run.skills`」；**玩家禁用过的武将不进池**（跨模式合并的 `*_banned` 名单，含其 `derivation` 衍生技）；**不做永久购买历史**——被替换/删掉的技能下一次商店还能再出现。候选被排空时返回更少的候选，不重复填充也不死循环；
- 商店的免费刷新（`SKILL_REFRESH_PER_LEVEL`，当前 2 次）属于**「这一局」**：只有 `createRun()` 新建与 `settleVictory()` 真的通关进下一局才补满；点一次扣一次并立即 `commit()`（扣不动就保持原候选原次数，不能让 UI 假装刷新成功），返回营地/重进商店/退出模式/重启游戏/异常退出恢复战斗/闯关失败都不补。购买过本局技能后刷新彻底锁死——重掷出的候选 `sold` 全是 false，放行就能绕过一局限买一个；`shopRefreshesRemaining` 是 run 的字段（v2），不进 `shopOffers`、不放 UI 临时变量；
- 商店里购买技能与升级属性都是原位更新（`ui/hub.js` 的 `refreshShop`），不重开窗口——重开会丢滚动位置，玩家得重新往下滑；
- 技能售价基于**按模式区分的基准价**（`SKILL_BASE_PRICE`=50）：**闯关恒为 50**（与关卡/胜场/等级彻底无关），**无尽为 floor(50×√当前关卡)**（第 1 关即 50，第 2 关 70、第 10 关 158），再上下浮动 25% 后**向下取整**（基准 50 → 37~62，至少 1），在 `rollSkillOffers()` 生成候选时随机定死写进存档；奖励是另一套：闯关每关固定 50 金币 + 固定经验表（第 1~29 关累计 328，加初始 2 点第 29 关结算后正好 330，三项属性 2+4+…+20×3 恰好花完），无尽是 `floor(√n × 系数)`（金币 50 / **经验 20**——金币与技能基准价同源、经验与属性升级价同系数：第 1~10 关每胜给的经验恰好等于升到该级的价钱 20,28,…,63，三项约第 22 关满级；n 是刚完成的关卡编号）——别把两套奖励混用；
- 属性升级经验与技能价同一套思路、**按模式分离**：**闯关读 `data/stats.js` 的固定价格表**（2+4+…+20 = 110/属性，三项 330，与 29 关累计经验对平）；**无尽走独立 √ 曲线** `floor(ENDLESS_STAT_UPGRADE_BASE × √目标等级)`（系数 20 → 20,28,34,40,44,48,52,56,60,63，单属性 0→10 共 445、三项 1335，约第 100 关满级）。价格只从 `run.mode` + `run.stats` 现算（`shop.js:getStatUpgradePrice`），两模式互不共享、切模式/读档都不会串表；改无尽曲线陡峭度只动 `config.js:ENDLESS_STAT_UPGRADE_BASE` 一个数；
- 新档初始资源只由 `INITIAL_CURRENCY` 决定（金币 50 两模式同额；经验与各自模式的首级升级价对平——闯关 2、无尽 20，无尽初始经验随 `ENDLESS_STAT_UPGRADE_BASE` 自动跟价），且只作用于 `createRun()`；旧存档走 `normalizeRun()` 原样读回，不会被补发；
- 无尽最高记录存在 `lib.storage.rogueBestEndless`（`{ level, characterId, updatedAt }`），只记录「已经成功通关过的最高一关」：胜利结算时用刚打赢的那一关去比，失败进入的下一关不会写进去；无尽失败整档删除时也只删槽位，记录不动。闯关模式不写这条记录（它有自己那条，见下条）。
- 闯关最高记录存在另一个独立键 `lib.storage.rogueBestChallenge`（`{ gold, exp, characterId, updatedAt }`）：记的是**刚好打通最后一关那一刻**手上的金币与经验，两项**各取各的历史最大**——一把「金币 100 经验 10」、一把「金币 50 经验 20」并成「最高金币记录：100 最高经验记录：20」。判据是**结算前** `run.cleared` 还是 false：通关后营地里那个「重复挑战」再赢只加钱、不再记第二次（否则反复重打第 30 关就能把记录灌水）。同样「删档不清」；显示位只在**新建存档的选择玩法页**，没通过过闯关就没有记录、那一行整条不画（与无尽的「最高记录：暂无」不同，这里不留占位）。
- 图鉴存在另一个独立键 `lib.storage.rogueCollection`（`{ events, curios }`），与最高记录同一套「删档不清」思路，但作用域是**六个存档共用**：任一存档解锁的内容在所有存档里都看得到。键名常量在 `config.js:COLLECTION_KEY`；
- 大厅 BGM（`bgm.js`）只在进战斗时停：存档页↔营地↔商店↔结算之间来回切、删档、选玩法/选将都是同一条音轨继续播，**不重头**；「从头开始」只发生在页面重载后（全新元素）与首次进模式；音量走本体「音乐音量」，玩家把音乐音量调到 0 就等于静音；
- 战斗 BGM（`bgm.js` 的 `playBattleBgm/stopBattleBgm`）由 `mode.js` 在 `launch()` 进战斗时起：从 `BATTLE_BGM_LIST` **随机起一首，一首放完由 onended 随机接下一首**（不与刚放完的重复，列表只有一首时退回全表）；`stopBattleBgm` 只在**失败结算**的 `onover` 调用（并把本体 BGM 音量放回），**胜利结算特意不切**——BGM 一路响过结算页，点返回营地时整页重载自然收掉；抽签不写存档（不进 `currentBattle`、不影响 `RUN_VERSION`）；
- 我们自己的 BGM（大厅与战斗）与本体 BGM 不共存：任一音轨在放就把 `ui.backgroundMusic` 的音量按成 0（只在我们的真的播起来之后才按，被浏览器拦下就听本体的），两边都停了才还原成本体刻度——本体 BGM 全程没停过，所以停止我们的之后自然接在原进度上（失败结算的结算页上放回的就是它；胜利结算期间战斗 BGM 继续压住本体，直到整页重载）；
- 肉鸽 BGM 音量是**扩展独立设置** `rogue_bgm_volume`（选项界面：扩展设置里的数值选项行，0%~100%、默认 100%；本体没有滑条控件，选项行即同款数字按钮）：`bgm.js:getRogueBgmVolume()` 一处换算、大厅与战斗音轨共用，**与本体「音乐音量」完全解耦**——本体滑条只动 `ui.backgroundMusic`，调低/调零都不会动肉鸽音轨；旧配置缺这个键按 100 读，选项改动经 `refreshRogueBgmVolume()` 对正在放音轨即时生效；
- 技能 BGM（每个角色技能触发时放的那套，`systems/bgm.js` 的 `game.playSkillBgm`）在肉鸽会话（存档页/营地/商店/战斗）里一律拦下：判据用本体现成的 `get.mode() === MODE_ID`（即 `lib.config.mode`），不装临时钩子、无需恢复，`directstart` 重载续玩后判据依然成立；非肉鸽模式判据为假，原逻辑一行不多绕。拦下时不建音轨、不登记进互斥列表、不碰肉鸽正在放的曲子；
- 无尽模式的事件 / 奇物（v4）只在无尽生效，闯关一条不碰（无事件、无奇物商店、无奇物栏；图鉴入口见下条——它是六个存档共用的收集册，闯关也能翻开看），**奇物品质升级（v6）同理只在无尽有意义**（闯关没有奇物可升）；存档新增九个字段：`pendingEvent`（待处理事件，含已定死的选项与结果、交互型选项的 `action` 与「没对象可作用」要说的 `blockedText`）、`collection`（图鉴：已发现事件 + 曾拥有奇物）、`curios`（当前持有奇物）、`curioOffers`（奇物商店候选）、`curioQuality`（v6：已拥有奇物的当前品质覆盖表，只记高于初始品质的档位）、`abyssDebt`（v7：经验泉欠的词缀数）、`curioOfferQueue`（v7：黄金罗盘多刷的那批候选）、`challengeStages`（v8：闯关前 10 关的敌方配置抽取结果，建局时一次性抽定落盘，`challengeStages[level-1]` 即第 level 关的配置）、`challengeComboStages`（v10：闯关第 11~30 关的双人组合抽取结果，首次进入该区间时一次性抽定落盘，第 21~30 关复用第 11~20 关的结果）、`skillShopLocked` / `curioShopLocked`（v9：两类商店的锁定开关，来源是收藏家的橱窗；读档清洗只保留「当前确实持有对应能力」的那一个），外加 `currentBattle.rift`（v7：这一场是深渊裂隙），旧档读入时静默补默认值；
- **事件在生成时就地定死**：战斗胜利 → `settleVictory` 入账 → `maybeCreatePendingEvent` 按 `EVENT_TRIGGER_RATE`(0.33) 掷骰，命中就抽事件、预掷全部随机结果（倍率奖励按刚打赢那关的无尽胜利奖励换算成固定值；三扇门的「给哪一件」、商人的那件货与价、裂隙的敌人数与倍率、融合炉的融合费同样在构建期定死）→ 连同图鉴「已发现」一起写进存档 → 结算页按钮变「继续」→ 事件页；中途关游戏再读档**优先恢复事件页且绝不重新随机**，选项结算完 `pendingEvent` 清空；恢复流程处理完直接进营地（没有战斗要收尾，不重载），胜利流程处理完走原来的 `directstart + game.reload()`；
- **两种「用不了」是两回事，不许混**（他 2026-10-05 明确区分）：**钱不够** → 选项置灰、点了没有任何反应（文字注明「货币不足」，与商店的「金币不足」按钮同款），结算层 `resolveEventChoice` 再验一次整单拒绝，两层共用 `isChoiceAffordable`；**此刻没有可作用的对象**（属性全满 / 没技能可熔 / 没奇物可融合 / 商人那件已练满）→ 选项**照常可点**，`getBlockedMessage` 现读存档判定，点下去只弹作者在 `blockedText` 写的那一句、**一个钱都不扣**、事件照样收掉。判据一律现读存档，不吃渲染时缓存的布尔值；
- **深渊裂隙是一场「不算层数」的独立战斗**（本轮最重的一处）：选下选项 → 弹一次确认（战败与平常失败同罪、无尽会删档，误点代价太重，所以必须确认）→ `enterRift` 按事件里定死的 `enemies` 生成敌人（**每名必带 `RIFT_EXTRA_AFFIXES` 个额外词缀，且无视 31 层门槛**——裂隙自己的卖点，深渊总开关 `ABYSS_ENABLED` 仍然优先）→ 参数整份抄进 `currentBattle.rift` → **落盘后整页重载**，由读档恢复页（标题「深渊裂隙已开启」、按钮「进入裂隙」）接着 `launch()` 开打。为什么要重载：走到这一步时本体的 `game.over` 已经跑过了，**引擎里没有任何「同一页面里再开一局」的先例**（本体所有模式打完都 `game.reload()`），在旧会话里直接 `game.loop()` 真机上的表现就是「点了进去没反应、存档里却躺着这场未结算战斗」。`onover` 见到 `rift` 走 `settleRiftVictory`：**只发定死的倍率奖励，不推进关卡、不掷事件、不刷奇物商店、不算其它任何奇物的胜利加成（幸运石 / 诅咒金币 / 储蓄罐 / 黄金罗盘一律不生效）、不写无尽历史最高、不补技能商城刷新次数**——这条分支绝不能改成复用 `settleVictory`；
- 奇物效果全部走 `curioManager` 统一接口（`sumCurioEffects` / `getBonus`），不为单个奇物写独立代码：战斗内十七项（额外出牌阶段 / 额外摸牌 / 濒死救回及其回复比例 / 每轮回血 / 每回合回血 / `firstDamageBonus` 每回合首次造成伤害后本回合加伤 / `unrespondable` 使用的牌无法被响应（配套 `unrespondableLowHp`、`unrespondableCardDamage` 两个不出文案行的键）/ `hurtDamageNext`·`hurtDamageRound`·`hurtDamageGame` 受伤后的下一次·本回合·本局加伤 / `dyingRecallChance` 回响之铃的濒死回收（概率档 `<1` 每档掷一次、`1` 必定；只认 `useCard` 记下的**实体牌**，回收判据是 `get.position(card, true) === "d"`——此刻真躺在弃牌堆里才算（`ordering` 传 true 才不会把结算区里飞的那张算进去，与官方技能同一条口径），打出/响应走 `respond` 事件不记账）/ `killGainMaxHp` 破碎王冠的击杀成长（主键出整句，`killHeal`·`killHealToMax`·`killDrawToMaxHp`·`killDrawMaxHp` 四个配套键不出行；涨上限走本体 `gainMaxHp`，摸牌按**涨过之后**的上限算））由 `battle.js` 建局时**按当前品质**把效果总表一次写进 `player.storage.rogue_curio`、机制技 `rogue_curio` 承载（照官方「当先」的 `trigger.phaseList.splice` 插入额外出牌阶段；濒死救回用 storage 标记保证每局一次，回复目标由 `dyingRecoverToRatio` 数据驱动——写了比例就回复到「体力上限 × 比例」，否则固定回 1；每回合回血挂 `phaseEnd`，每轮回血挂 `roundEnd`；回响之铃的账本记在 `player.rogueCurioUsedCards` 这个**普通属性**上，与被污染牌同一套理由——`storage` 要 JSON 广播，塞 Card 引用会炸）；结算侧在 `reward.js` 入账前现查（`goldOfHeld` 储蓄罐是唯一排在**入账之后**算的，因为它乘的是已到手总额），只看这一局开始前已持有的奇物；奇物与属性强化同一条纪律：绝不写 `lib.skill` / `lib.character`；
- **新奇物的三条战斗判据（都读过本体源码核对）**：① 「你使用的牌无法被响应」必须同时挂两个技能标签——`ai.norespond`（本体 `lib.filter.cardRespondable` 问的是**出牌那个人**，管一切 `chooseToRespond` 响应：闪挡杀、决斗接杀……）与 `ai.playernowuxie`（锦囊能不能被无懈走的是 `lib.skill._wuxie` 的 filter 那条**独立的路**，只挂前者会出现「杀必中但锦囊照样被无懈」）。两者都靠 `ai.skillTagFilter(player, tag, arg)` 现读体力条件——本体只在 `info.ai[tag]` 为真时才调它，写成函数式标签等于不生效。② 加伤一律挂 `damageBegin1`（`damageBegin4` 本体**没有 await**，第五步立刻读 `event.num`，改数会赶不上），并且 filter 要过 `!event.numFixed`。③ 「本回合」用 **phase 事件对象本身**比（`data/skills.js` 的 `rogue_curio` 就靠它判狂战徽章/反击护符的 buff 属于哪个回合；本体没有 `player.turnFlag`）——同一个 phase 事件才是同一个回合，回合一走两边自然不再相等，不用挂临时技也不用清状态；「下一次」这类一次性加成在 `damageBegin1` 的 content 里吃过就清，三个记号全部是**赋值不是累加**，反复受伤只有一层；
- **交互型选项的钱在「真选定」那一刻才扣**：带 `action` 的选项 reward 一律留空（写进 reward 就等于「点了即扣」，而玩家还没定下来选哪个），价钱由构建期追加进选项文案（点之前看得见），子页面的按钮在回调里**重读存档**判余额、够才交回 mode.js 落地；成交前 `pendingEvent` 始终挂着，中途关游戏回来仍是这个事件，不会白点一次；
- **深渊词缀的「追加」与「随机」是同一条不放回规则**（`abyss.appendAbyssAffixes`）：已经在他身上的不会再被抽到，所以裂隙必给的那条、经验泉欠的债，多出来的**永远是新的强化**，不会与常规随机的结果重叠计数；词缀总开关关着时池子为空，追加一个也加不上——裂隙与泉水都不许绕过 `ABYSS_ENABLED`。敌人数走 `createEnemyConfigs(level, mode, rng, { enemies, extraAffixes })` 的覆盖参数，不传时与原来逐字一致（普通战斗一行新逻辑都不多走）；
- 奇物候选与售价由每关胜利按概率定死写进 `curioOffers`（先掷 `CURIO_SHOP_RATE` 20%，事件判定在其后；命中才 round(50×√推进后的新关卡) × ±25% × 品质倍率（普通 2 / 稀有 5 / 史诗 10 / 负面 -5）× `priceMultiplier` 重摇三个），排除已拥有奇物、普通 / 稀有同概率、一批只卖一个：**买到即整批下架**（`curioOffers` 清空、商店分区随之隐藏，不留「已购买」残卡）；**未命中同样清空旧批次**（不再「没买就一直挂着」——同一批货曾经能连着挂十几关，看着像商店坏了；代价是商店平均 1/`CURIO_SHOP_RATE`＝约 5 关才出现一次，要更勤就把这个系数调大）。**已拥有的奇物三重清理**：摇候选时排除、事件送出同款时从候选撤下（`grantRandomCurio`）、读档时剔除「已拥有且未售出」的过期条目（已购买条目保留展示）；
- **奇物品质升级（v6）**：`def.rarity` 永远是**初始品质**，`run.curioQuality[id]` 才是**这个存档里的当前品质**，两者必须分开——**任何来源新获得的奇物（商店购买、事件随机、以后新增的奖励）一律从初始品质开始**，绝不读图鉴/别的存档/曾经拥有过的品质（所以某存档把能量核心升到史诗后丢弃，再拿回来就是普通）。品质链 `negative → common → rare → epic` 单向，升级每次只走一级、禁止降级，**负面奇物也能一路净化到史诗**。存档只记「高于初始品质」的档位（与初始品质相同就不写，保持精简）。费用 5 × round(50×√**升级时**的关卡)——永远按当前升级时的关卡现算，与当初买它花多少无关。当前效果表：破损怀表 史诗（不可升级）＋1 出牌阶段；幸运石 稀有 +10% / 史诗 +20% 经验；气息腰带 稀有首次濒死回 1 / 史诗回体力上限的一半（向上取整，走 `dyingRecoverToRatio`，不改 `dyingSave` 的次数语义）；能量核心 普通 1 / 稀有 2 / 史诗 4 张摸牌；剩饭 普通每轮 1 / 稀有每轮 2 / 史诗**每回合** 2（换的是时机不是数值，`qualityEffects` 是整份替换而不是叠加）；循环按钮 稀有 +1 / 史诗 +2 次刷新；诅咒金币 负面 -10% / 普通 ±10% / 稀有 -5%~+15% / 史诗 +20%（中间两档是 `goldRate` + `goldRateSpread` 的波动档，结算时掷一次）；狂战徽章 稀有本回合 +1 / 史诗 +2（`firstDamageBonus`，每回合首次造成伤害之后才吃）；血怒核心 普通「体力低于上限一半（向上取整）时使用的牌无法被响应」/ 稀有再带「此牌伤害 +1」/ 史诗去掉体力条件（`unrespondable` + 两个配套键）；反击护符 普通下一次 +1 / 稀有本回合 +1 / 史诗本局 +1（三档三个键，**都只加一层**）；黄金罗盘 史诗（胜利后 10% 多刷一批奇物商店）；储蓄罐 史诗（战斗结束再拿持有金币的 5%）；遗忘之石 史诗（每次替换技能拿 5 倍本层基准金币）；回响之铃 普通濒死 50% / 稀有 75% / 史诗必定（`dyingRecallChance`，收回本局使用过且此刻真在弃牌堆里的实体牌——只认「使用」、打出/响应不记账）；破碎王冠 普通击杀 +1 上限并回 1 血 / 稀有再摸牌至手牌上限 / 史诗回复至上限并摸上限张（`killGainMaxHp` + 四个配套键，摸牌按涨过之后的上限算）；贪食魔盒 史诗（每次替换技能拿 5 倍本层基准经验，与遗忘之石同一条口径）；饥饿之匣 负面金币 -15% 经验 +5% / 普通 -10% 与 +10% / 稀有 -5% 与 +15% / 史诗只留 +20% 经验（金币那一行整条消失）；收藏家的橱窗 稀有锁技能商店 / 史诗连奇物商店一起锁（两个锁可同时开）。**升级的另一条入口**：奇物融合炉与流浪商人买已拥有的那件，走的都是 `upgradeCurio(run, id, priceOverride)` 这条同一条品质链，只是价钱各按各的规则（商店 5× 奇物基准价 / 融合炉 3× 本层基准经验 / 商人恒定 4× 奇物基准价金币）。图鉴 `collection` 继续保持独立：只记「曾经获得过哪些奇物」，不保存当前品质/最高品质/升级次数，`curioQuality` 完全属于具体 run（删档一并消失，图鉴保留）；
- 图鉴记录的是「已发现事件」与「**曾经**拥有过的奇物」——奇物丢弃 / 被替换后图鉴仍然点亮；未收录条目以「？？？」剪影展示；**图鉴是公有的**：存在独立键 `lib.storage.rogueCollection`，六个存档共用一份，任一存档解锁的内容在所有存档里都看得到，删档与新建都不清它（`mode.js` 在 `loadSlots()` 把各存档原有的 `run.collection` 并进公有键做一次性迁移，之后每次 `persist()` 顺手并上本局解锁项；四个解锁点仍只改 `run.collection`，存档保持自描述）；营地一律给图鉴入口（闯关自己不产出内容，但能翻开看公有收集）；已收录条目可点开看详情（事件的**选项名一律单独成行**、**会拿到东西的每种结果逐行缩进写在下面**并标概率，固定奖励同版式不 inline；并带上「属性全满改送奇物」这类生成期规则；许愿池那种类赌局的**落空分支不列**——投入本身已写在命中行里，奇物给品质 + 风味描述 + 完整效果）；「赌局不剧透」只约束事件页的按钮文案，图鉴作为收集册照实写全；未发现条目不挂监听、点了毫无反应；

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

所有普通图片、音频等资源，资源文件名全局唯一，按类型分目录存放：音频在 `assets/audio/`，图片在 `assets/image/`；另有特殊用途子目录：

```text
assets/
├── audio/                # 音频（BGM 与语音 .mp3）
│   ├── dieaudio/         # 角色死亡语音
│   ├── easteregg/        # 彩蛋音频
│   └── rogue/            # 奥特肉鸽的界面音频
└── image/                # 图片（角色立绘 .jpg、装备卡牌图 .png）
    ├── camp/             # 势力（阵营）图标
    └── tierlist/         # 角色评级图
```

- **`assets/audio/dieaudio/`**：角色死亡语音（各包 `characters.js` 的 `dieAudios` 字段引用；个别特殊死亡语音由技能在死亡时机直接播放）。
- **`assets/audio/easteregg/`**：彩蛋音频（供 `src/systems/easterEgg.js` 使用）。
- **`assets/audio/rogue/`**：奥特肉鸽模式的界面音频（`src/rogue/bgm.js` 用 `start.mp3` 做存档页与营地的循环 BGM）。
- **`assets/image/camp/`**：扩展自定义势力的图标（由 `src/core/bootstrap.js` 在初始化时注册）。
- **`assets/image/tierlist/`**：角色评级相关图片（供 `src/systems/tierlist.js` 展示）。

新增素材时需要注意：

1. **资源命名必须全局唯一**，不能与其他作品、其他角色已使用的文件名冲突；
2. 音频放入 `assets/audio/`，图片放入 `assets/image/`（死亡语音、彩蛋音频、阵营图标、评级图分别放入对应子目录）；
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

第一版交付的是可跑通的框架，具体内容留了占位（能进战斗、能买技能、能升级、能结算），数值与文案由作者替换：

| 位置 | 要填什么 | 现在的占位 |
| --- | --- | --- |
| `src/rogue/data/enemyGroups.js` | 只服务旧档迁移：v2 及更早存档进行中战斗的 `groupId` 按这里的组合还原成敌方阵容。**新战斗的敌人不再走这里**——`src/rogue/enemy.js` 已按模式随机（闯关=本扩展角色池、无尽=本体未禁用角色池，属性按关卡随机分配） | 3 个占位组合（佐菲、双巴尔坦、强化赛文），仅当旧档还停在这些组合的战斗中时才会被用到 |
| `src/rogue/data/challengeStages.js` | 闯关前 10 关的敌方配置池：建局时从池里不重复抽 10 个配置存进存档，每关按 `challengeStages[level-1]` 的 `players` 生成敌人；抽取、存档、战斗流程分别在 `enemy.js`/`state.js`/`mode.js`，加单角色或组合只改这个数组（`players` 成员可选写 `stats`/`skills`/`maxHp`/`hp` 固定住，不写就按关卡数随机） | 34 个单角色配置（第一批 28 + 第二批 6：手杀神马超/手杀骥张辽/手杀笮融/手杀诸葛瞻/手杀界钟会/吕据）。`players[].character` 必须写**真实角色 id**——官方包（手杀/十周年/势/限定/荟萃等）是拼音式 id（如 `mb_caomao`），游戏里看到的中文名只是显示名；抽取只看角色是否存在，**禁将的也照抽照打**；角色不存在的配置不参与抽取（角色 id 存在性由 `node tools/test/rogue-data.test.mjs` 提醒核对），文件内有逐条注释 |
| `src/rogue/data/challengeCombos.js` | 闯关第 11~30 关的双人组合池：首次进入 11~30 关时从 31 个组合里不重复抽 10 个存进 `challengeComboStages`（存档 v10），第 11~20 关按位生成双人阵容，第 21~30 关复用同一结果加扩展池随机第三人（`enemy.js` 的 `ensureChallengeComboStages` / `createChallengeComboConfigs`）；加组合只改这个数组 | 31 个双人组合（`type` 固定 group、`players` 恰 2 名且**数组顺序就是敌人先后**，属性/技能一律走常规生成不写固定项）。官方包角色 id 已逐一在当前 `resources/app/character` 核对（十周年谋系=`dc_sb_`、乐系=`yue_`、势系=`pot_`、界系=`xin_/re_`，星周不疑/星王朗=newjiang 包 `yj_zhoubuyi`/`yj_wanglang`（显示名「☆周不疑」「☆王朗」，前缀是 ☆ 符号），见文件头）；末尾 3 个组合（曼波×哈基米、盖亚×阿古茹、迪迦×戴拿）来自**本扩展自己的角色**——扩展包用中文 id，与包注册逐字一致 |
| `src/rogue/data/skills.js` | 商店技能效果、名称描述（`price` 只是留给作者标注基础价的位子） | 这里填的是**作者上架底线清单**：全部分包顶级技能（自动汇总）。肉鸽不再有原创技能——商店真正的候选池由分包技能并上全体武将的技能组成，并剔掉玩家禁用过的武将——见 `src/rogue/skillPool.js`；**实际售价由 `shop.js` 按模式基准价 ±25% 随机生成**（闯关恒 50、无尽 floor(50×√当前关卡)，floor 取整），这里写多少都不会成为最终售价。历史上发布过的原创技能（蓄势/解甲/归元）已下架，旧存档里的它们由 `state.js` 读档时自动清除 |
| `src/rogue/data/stats.js` | 防御·过牌·攻击每级的数值与升级报价 | 十级效果已按「护甲/摸牌/杀伤与次数交替成长」填好，`price` 为 2,4,6,…,20（单个属性 0→10 共 110，三项满级 330）；**只服务闯关模式**，无尽走 config.js 的 `ENDLESS_STAT_UPGRADE_BASE` √ 曲线，不吃这张表 |
| `src/rogue/data/rewards.js` | 闯关固定奖励与经验表、无尽 √关数系数 | 闯关：每关固定 50 金币（`CHALLENGE_GOLD_PER_LEVEL`）+ 固定经验表（`CHALLENGE_EXP_TABLE`，第 1~29 关累计 328，加初始 2 点第 29 关结算后正好 330）；无尽：floor(√n × 系数)，系数：金币 50、经验 20（第 1 关 50/20、第 2 关 70/28、第 3 关 86/34、第 4 关 100/40、第 10 关 158/63；经验与属性升级价同系数，前 10 关每胜恰好够升一级） |
| `src/rogue/config.js` | 技能槽数、候选数、每局免费刷新次数、新档初始资源、技能基准价、失败货币损失率、总关卡数、模式封面图、可选角色白名单、选将页每页几张武将牌 | 3/3；`SKILL_REFRESH_PER_LEVEL=2`（改成 0 就没有刷新按钮的可用次数，其它逻辑不受影响）；初始金币 50 / 经验 2（`INITIAL_CURRENCY`：金币两模式同额、建议与技能基准价同额或略高，保证第一关进商店买得起；经验按模式对平首级升级价——闯关 2、无尽 20，改 `ENDLESS_STAT_UPGRADE_BASE` 时无尽初始经验自动跟随）；定价 `SKILL_BASE_PRICE=50`、`SKILL_PRICE_SPREAD=0.25`（闯关基准价恒为 50 与关卡无关，无尽基准价 floor(50×√当前关卡)；改 50 为其它值则两模式的基准价一起平移价格区间）；失败损失 0.5；总关卡 30；封面指向 `assets/sundry/rouge.jpg`（换图改 `MODE_SPLASH` 一行，并跑 `node tools/update-manifest.mjs <新图>` 登记清单）；选将页想一页多放几张改 `CHARACTER_PICKER_PAGE_SIZE` |

属性效果支持的键（`battle.js` 已落地，写别的键不生效）：`armor`（初始护甲，受伤时自动抵伤）、`maxHp`（体力上限增量）、`startHand`（起手手牌增量）、`extraDraw`（摸牌阶段额外摸牌数）、`handLimit`（手牌上限增量）、`damageChance`（造成伤害时 +1 伤害的概率，百分比，不限【杀】）、`shaLimit`（出【杀】次数增量）、`extraSkills`（额外技能 id 数组）。其中数值型强化（extraDraw/handLimit/damageChance/shaLimit）由 `skills.js` 里的机制技能 `rogue_stat` 承载：`battle.js` 建局时把四项总数**一次性赋值**到玩家 `storage.rogue_stat` 并只 `addSkill` 一次（重复调用也不会翻倍），商店与奖励池刷不到它。

无尽模式的**深渊化强化**同样只需要改两处配置就能扩：在 `src/rogue/endless/abyssAffixes.js` 的 `affix` 里写技能本体、`affixText` 里写名称与描述，再到 `src/rogue/endless/abyssConfig.js` 的 `AFFIX_POOL` 登记 `{ id, weight, enabled }`——翻译双键由 `affixText` 自动派生，注册、随机、存档清洗、徽记与面板文案全都跟着这张表走，`enemy.js` / `state.js` / `battle.js` 一行都不用动。词缀要借用「只当工具、不该被随机到」的技能（技能屏蔽载体、封牌 mod 宿主），写进同文件的 `abyssHelperSkills` 并在 `affixText` 外面自备翻译双键，`mode.js` 会一起注册。调强度旋钮集中在 `abyssConfig.js`：起始层 `ABYSS_START_LEVEL`、满层 `ABYSS_FULL_LEVEL`、单个敌人的词缀上限 `ABYSS_MAX_AFFIXES`（默认 null＝只受池子大小限制，9 个词缀拿满就再也不会多了）、总开关 `ABYSS_ENABLED`。要做 Boss 专属或奇物互动词缀，给那一项写 `tags`，并在随机时把标签传进 `abyss.rollAbyssAffixes(level, rng, { tags })`。

自检命令（在本扩展目录执行）：

```text
node tools/check/check-imports.mjs .
node tools/check/check-assets.mjs .
node tools/test/rogue.test.mjs         # 数据/逻辑层用例
node tools/test/rogue-data.test.mjs    # 内容配置自检（填完 data/ 先跑这个）
node tools/test/rogue-mode-smoke.mjs   # 模式流程冒烟（本体 API 用桩，不需要开游戏）
node tools/check/verify-parity.mjs .   # 与指定基线比对注册结果（默认 HEAD），交付前顺手跑
node tools/gen-event-curio-images.mjs --preview  # 重生成事件/奇物占位图 + 导出「真实 64px」拼表
```

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
