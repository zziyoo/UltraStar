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
│   │   ├── enemy.js              # 敌方随机生成：数量/角色池/属性分配
│   │   ├── reward.js             # 胜利结算（纯逻辑）
│   │   ├── penalty.js            # 失败与降级惩罚（纯逻辑）
│   │   ├── battle.js             # 建局与运行时强化（对接本体事件）
│   │   ├── bgm.js                # 大厅 BGM（存档页/营地循环播放，进战斗停止）
│   │   ├── data/                 # 作者填写的配置：技能/属性/奖励（enemyGroups 仅旧档迁移用）
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
| `config.js` | 机制参数：槽位数、存档版本（`RUN_VERSION`，v2 起多一个 `shopRefreshesRemaining`，v3 起进行中战斗保存完整敌方阵容 `currentBattle.enemies`）、新档初始资源（`INITIAL_CURRENCY` 金币 50 / 经验 2：金币与技能基准价同额；经验与各自模式的首级升级价对平——闯关 2、无尽 20，第一关进商店即可买技能/升一次属性）、技能槽与候选数、每局免费刷新次数（`SKILL_REFRESH_PER_LEVEL` 2）、技能基准价系数（`SKILL_BASE_PRICE` 50：闯关恒为基准价，无尽按 floor(50×√当前关卡)，与 ±25% 浮动 `SKILL_PRICE_SPREAD`）、无尽属性升级 √ 系数（`ENDLESS_STAT_UPGRADE_BASE` 20：升到 N 级 floor(20×√N)，仅无尽使用）、失败货币损失率与 fallback、可选角色白名单、无尽最高记录键（`BEST_ENDLESS_KEY`，独立于六个存档槽）、模式封面与背景音乐的路径（`MODE_SPLASH`、大厅 `LOBBY_BGM` 一曲、战斗 `BATTLE_BGM_LIST` 随机池——换曲子/换曲库只改对应一行或数组） |
| `state.js` | 六槽存档的校验、默认值修复、版本迁移与序列化安全；`shopRefreshesRemaining` 在这层统一钳到 `0..SKILL_REFRESH_PER_LEVEL`，v1 旧档缺这个字段时补满，**已经刷成 0 的原样保留**（当成「没这个字段」就等于白送次数）；`currentBattle` 只认 `{ status, enemies }`（每项白名单字段：`characterId` + `stats` 三项属性钳到 `0..maxLevel` + `skills` + `maxHp`/`hp` 覆盖）；v2 及更早旧档只存了 `groupId` 的，按当时的组合配置**还原成完整敌方阵容**（角色、属性、额外技能、体力覆盖全保留，不重掷），组合也没了才视为无未完成战斗；无尽最高记录的 `normalizeBest` / `updateBest`（纯逻辑，不碰 `game`/`lib`/`DOM`） |
| `shop.js` | 技能候选随机、按模式定价（`getSkillBasePrice` / `getRandomSkillPrice`）、购买、满槽替换、属性升级校验（纯逻辑），**属性升级经验按模式分流**（`getStatUpgradePrice`：闯关读 `data/stats.js` 固定表 2..20，无尽 floor(20×√目标等级)；只从 `run.mode`+`run.stats` 现算，两模式互不共享）。**基准价闯关恒为 `SKILL_BASE_PRICE`（50），与关卡/胜场/等级彻底无关；无尽为 floor(`SKILL_BASE_PRICE` × √当前关卡)，第 1 关即 50、之后随 √n 增长**（level 缺失按第 1 关、不认识的模式按闯关处理）；实际售价在基准价 ±25% 内随机后**向下取整**（基准 50 → 37~62，至少 1）。**售价在生成候选时定死并写进 `shopOffers`**，重进商店/刷新/重载都不重掷。候选池由调用方作第 4 参传进来（`rollSkillOffers(run, rng, characterSkills, candidates)`），本文件不读 `lib`。**随机时会排除「当前角色原生技能 + 当前持有的购买技能」**（`getExcludedSkillIds`，角色技能由 `mode.js` 从 `lib.character` 取好传入），但不做永久购买历史——被替换掉的技能还能再出现。**`refreshSkillOffers(run, rng, characterSkills, candidates)`（每局免费刷新）同为纯函数**：两条门槛——还有剩余次数、且本次商店还没买过技能（重掷出来的候选 `sold` 全是 false，买过还让刷就等于绕过 `SKILL_PURCHASE_COUNT` 的一局限买一个）；实现是「先把当前候选的 id 从池子里排掉，再调用同一个 `rollSkillOffers`」，所以技能与价格一起重掷、原生/持有排除规则原样生效；排掉旧候选后凑不满 `SKILL_OFFER_COUNT` 条时退回完整池子，允许旧候选重新出现（不死循环、不重复填充、不给当前持有的技能）。被拒时不返回改过的 `run`，次数一次都不扣；`getRefreshesRemaining(run)` 是商店 UI 与它共用的读数口径 |
| `skillPool.js` | 商店候选池：`getShopPool()` = `data/skills.js` 的作者清单 ∪ **全体可选武将的技能**（`Object.keys(lib.character)` 逐条走 `battle.js` 的 `isPlayerUsable`，与选将页同一口径，所以 Boss/隐藏 Boss/未开放角色不会进池）。**玩家禁用过的武将，其技能与这些技能声明的 `derivation` 衍生技一并剔除**；同一技能若还有别的未禁用武将拥有则继续上架。禁将名单读的是本体那套按模式分开存的 `lib.config[模式 + "_banned"]`（遍历 `lib.config.all.mode`，再加 `lib.config.banned`），与本体禁将页「禁将」分组的跨模式合并显示同一口径——即**任一模式里禁用过就算禁用**，不只认肉鸽模式。武将技能进池前还要过本体 `lib.filter.skillDisabled`（缺翻译、`unique/temp/sub/fixed/vanish` 的内部技不上架）；作者清单不重筛，`rogue-data.test.mjs` 已逐条验过定义与翻译 |
| `reward.js` | 胜利结算：入账、关卡推进，并把 `shopRefreshesRemaining` 补回 `SKILL_REFRESH_PER_LEVEL`——**只有真的通关进下一局才补**，失败/重进商店/重载都不补（`penalty.js` 原样透传该字段，靠反复失败白刷商店这条路是堵死的）。奖励一律按「刚完成的关卡编号」算：先取奖励、再推进 level |
| `penalty.js` | 失败结算：按比例扣货币、货币不足 fallback、无尽删档判定（纯逻辑） |
| `enemy.js` | 敌方随机生成（纯逻辑 + 只读 `lib`）。**`getEnemyCount(level, mode)`**：1~10 关 1 个、11~20 关 2 个、21~30 关 3 个，无尽第 31 关起固定 3 个（两模式同一张表）。**两张池绝不混用**：闯关 `getChallengeEnemyPool()` 只从本扩展实际注册的角色里选（`core/loader.js` 的 `packages` 数据，与 `registry.buildPackage` 同源，不硬编码名单）；无尽 `getEndlessEnemyPool()` = 运行时 `lib.character` 全集 − 本扩展角色，再过滤掉禁用的（复用 `isEnemyUsable`：`forbidai`/`isAiForbidden`/本体 `characterDisabled`，叠加 `skillPool.getBannedCharacterIds()` 的跨模式禁将并集）。**`allocateEnemyStats(totalPoints)`**：用「带上限的顺序分配」把恰好 `min(totalPoints, 30)` 点随机分到防御/过牌/攻击三项（每步只在「剩余点数仍分得完」的区间里随机，不重试、无偏差），单项 ≤10；每个敌人独立调用。**`createEnemyConfigs(level, mode, rng)`** 把三者合成敌方阵容并交由 `mode.js` 写进存档——开战前定死，重载不重掷 |
| `battle.js` | 用本体 `prepareArena / gameDraw / phaseLoop` 开一局，并把敌我强化只施加到当前 Player 上。敌人的 Roguelike 属性走**玩家的同一张效果表**（`data/stats.js` 的 `sumStatEffects`）：属性等级变化后敌人含义自动同步，不存在第二套敌方效果。建局时必须 `assignPlayerIds()`：`prepareArena` 走的 `ui.create.players` 不分配 `playerid`，而本体 `addSkill` 只有 `playerid` 存在才登记触发钩子（`player.js:11088`），缺了它所有触发类技能都不会触发（`single.js:605`、`doudizhu.js:89` 都是这么补的）。**运行时发技能一律走 `grantSkills(player, ids, 警告前缀)`**：先过本体 `game.expandSkills` 把 `group` 伙伴补齐再逐个 `addSkill`（本体角色初始化也是这一条，`player.js:13210`；`player.addSkill` 自己不带 `group` 伙伴，`group` 在本体里只被 `disableSkill` 读过一次），玩家购买技能、敌人 `entry.skills`、属性 `extraSkills` 三个入口共用。`expandSkills` 是原地去重追加同一个数组（`Array.prototype.add` 自带 `includes` 判断）、只展开一层、`group` 写字符串或数组都吃，别自己重写 group 解析。**展开出来的伙伴技能只活在场上**：不写进 `run.skills`、敌人配置与属性表，一个都不占肉鸽技能槽（槽位统计永远只看 `run.skills.length`）。真实的带 group 技能例：官方 `kongcheng`（空城）→ `group: "kongcheng1"` |
| `bgm.js` | 大厅与战斗的背景音乐。大厅：`playLobbyBgm()` 循环播 `LOBBY_BGM`，`stopLobbyBgm()` 进战斗时停止；**还在放就绝不打断**——删档、营地↔存档页↔商店互相切都是原地重绘，不重头也不换轨，只有停下来过的（页面重载后是全新元素）才从头播。战斗：`playBattleBgm()` 由 `launch()` 进战斗时调用，从 `BATTLE_BGM_LIST` **随机起一首、一首放完随机接下一首**（onended 连播，不与刚放完的重复；一个页面会话只打一场战斗，重载后整个音轨重建），`stopBattleBgm()` 只在**失败结算**的 `onover` 调用（胜利结算故意不停，BGM 一路响过结算页，返回营地时的整页重载才收）。两个角色各自只建一个 `<audio>` 元素，音量都走扩展独立设置 `rogue_bgm_volume`（与本体音乐音量解耦，见下）。**大厅与战斗期间都把本体背景音乐按成静音**（`ui.backgroundMusic.volume = 0`，否则两首叠放；失败结算或整页重载时才还原）——用音量而不是 `pause()`：本体那份在页面加载时往往还没开始放（还在缓冲），那时 `pause()` 会漏掉它稍后的自动播放；`ourBgmOn()`（大厅或战斗任一在放）闸门挡住 `play()` 延迟兑现的 `then`，避免我们的音轨都停了之后本体还被静音 |
| `data/` | 作者填写的内容配置：`skills.js` `stats.js` `rewards.js`；`enemyGroups.js` 只剩一件事——把 v2 旧档进行中战斗的 `groupId` 还原成敌方阵容（新战斗的敌人已改为 `enemy.js` 按模式随机） |
| `ui/` | 存档页（仿造梦西游的「存档记录」卡片网格，自定义样式在 `ui/styles.js`，只作用于 `.wm-rogue-*`）、选角色、营地（主界面）、商店、技能查看页、替换技能、结算、惩罚选择。除选角色与替换/惩罚列表用本体 Dialog 外，其余都是自建浮层。选角色页直接用本体 `ui.create.characterDialog`，保留其搜索框（支持正则与技能搜索）、拼音/势力/收藏筛选条与分页，仅以 `noclick` 接管点击；说明与返回放在内容最前，并把本体分页的每页张数（配置 `showMax_character_number`，这台机器是 10）放开到 `CHARACTER_PICKER_PAGE_SIZE`（24）——超出当前页的武将牌只是被加上 `.nodisplay`，光加高窗口刷不出多余的行。**自建浮层分两层**：`#wm-rogue-overlay` 只负责遮罩与滚动，里面的 `.wm-rogue-stage`（`min-height:100%` + 子元素 `margin:auto`）负责居中——内容矮时居中、内容高时 auto 外边距归零从顶部开始滚，不用固定 `top`/`transform`，也不用 JS 算像素边距。**营地**（主界面）：标题栏只有居中的「奥特肉鸽」，**没有技能入口**；正文是「第 N 关 + 玩法 + 两块资源 + 当前成长（标题下面是角色名，再接三张只读属性卡）+ 开始/商店/返回存档/退出」——动作区四个按钮一条视觉语言：开始=金色主按钮、商店=蓝色（`wm-rogue-hub-shop`）、返回存档与退出肉鸽模式=加长的灰色次级按钮（`wm-rogue-hub-secondary`，长度与字号的唯一旋钮在 `ui/styles.js` 对应行）；**选择玩法**是同风格的两张卡（点整张卡即选中，无尽卡显示历史最高）。**商店**：顶部固定「标题 + 三块资源」与右上角返回，其中第三块「技能 n/3」**本身是查看已购买技能的入口**（有 hover/active 反馈）；中间滚动区放「技能商店」（标题与刷新按钮同一行：`.wm-rogue-shop-section-row` 左标题右按钮，刷新按钮**属于这个分区**，不放页面顶部也不跟右上角返回挤在一起；文字是 `刷新 2/2`→`刷新 1/2`→`刷新 0/2`，用完与本局已购买都只置灰不隐藏，买过后文案换成 `本局已购买`；宽度按最长文案定死 `min-width:116px`，切换状态时不抖。刷新走 `refreshShop()` 原位重绘——候选 id 变了要先把三张卡片删掉重建，只改文字会留着旧技能的头像、描述和点击回调，滚动位置不受影响。每张卡＝出处小头像 + 技能名 + 限高描述 + 售价 + 购买按钮，按钮文字即状态：`购买` / `金币不足` / `已购买` / `本次商店已售罄`，价格只在价格行里写一次）与「属性强化」（属性名 + `Lv.x/10` + 逐行累计效果 + 升级价 + 升级按钮）。**技能查看页**复用商店卡片但只读（完整描述不再限行，空态提示「当前没有已购买技能」，返回回商店）。**结算页**是大标题 + ✓/✕ + 奖励/损失分行 + 下一关信息 + 显著返回按钮。所有浮层按钮统一 `display:inline-flex + align-items/justify-content:center`（`inline-block + line-height` 在主题环境里做不到真正的文字居中）。出处由 `common.js` 的 `skillOwner()` 扫 `lib.character` 技能表得出，头像用本体给任意 div 都挂了的 `setBackground(id,"character")` 画；技能文本一律过 `sanitizeSkillText()`：把 `<noname-poptip poptip="id">` 按 `lib.poptip.getType/getName` 转成可读文字（技能〖名〗、卡牌【名】、其它直接名字），查不到就退回标签内文本、再退回 id，`<br>` 转换行，其余标签兜底剥离——卡片与完整描述弹层共用同一套转换。字号层级（都在 `ui/styles.js`，改字只动这几处）：商店标题 30 → 资源数值 26 → 区域标题 24 → 技能名 22 / 属性名 21 → 等级与价格 18 → 按钮 18 → 描述 17（限高 5 行，点卡片看完整说明）→ 属性效果 16 → 出处与说明 14；存档页小字 14~15、角色名 21、编号 32 不再放大 |

设计约束：

- 存档只走本体机制 `game.save("rogueSlots", lib.storage.rogueSlots)`，按模式分键存进本体数据库；写入前经 `toSerializable` 校验，禁止 Player/Card/函数/循环引用进入存档；
- 一关 = 一次对局会话，结算后用 `directstart + game.reload()` 回主界面（与本体 `brawl.js` 相同做法），不在一次 `phaseLoop` 内串联多局；
- 「退出肉鸽模式」与存档页的「返回」都是**回到游戏初始界面**：先落盘（`rogueActive` 置 -1），再清掉 `directstart` 与 `show_splash_off` 后自己 `window.location.reload()`——不能直接用 `game.reload()`，它会顺手写 `show_splash_off = true`（下次启动就不再显示初始界面了），那样重载后会又落回本模式的存档页；
- 开局前先把随机好的敌方阵容（角色 + 三项属性分配）写进 `currentBattle.enemies` 存档，因此刷新/崩溃后重打的是同一套敌人，且不重复发奖；旧档（v2 及更早）只存了 `groupId` 的，读档时按原组合配置还原成阵容，同样不重掷；
- 敌人强化只改运行时 Player，绝不回写 `lib.character`；肉鸽技能挂在模式配置的 `skill`/ `translate` 上，只有进入本模式才注册；
- 运行时给技能（玩家购买 / 敌人额外技能 / 属性 `extraSkills`）统一走 `battle.js:grantSkills()`，由本体 `game.expandSkills` 补齐 `group` 伙伴；展开结果只进当前 Player，**永远不回写 `run.skills`、敌人配置与属性表**，所以存档只保存主技能 id、技能槽也只数主技能；
- 属性强化的机制技能（`rogue_stat`，四种数值强化合并成一个）带 `popup: false`：本体触发技在 `content.ts:4201` 用它决定是否走 `logSkill`，而 `logSkill` 又调 `trySkillAnimate` → `$damagepop`，十周年UI 的 `$damagepop` 会把整段「技能名+描述」渲染成场地上的大字。要关掉大字只能在这里关，`nopop`（加技能弹窗）与 `logv`（战报行）都管不到；一个技能同时挂 `trigger`（摸牌/杀伤害）与 `mod`（手牌上限/出杀次数），玩家身上只会有一个「强化」标记，点开由 `intro.mark`（函数形式，本体 `get/index.js` 的 mark 节点介绍会原样插入）列出四项实时数值，`intro.nocount` 防止本体拿对象去数数量；点「强化」标记还会弹出自建浮层（`common.js:showBattleStats`）列三属性等级与当前效果：**没有关闭按钮，点面板外的遮罩区域直接退出**（面板内点击不关闭；打开那一下的触摸已 `preventDefault`，防合成 click 落在遮罩上把面板一点开就关掉）；
- 商店候选池 = 作者清单 + 全体可选武将的技能（`skillPool.js` 每次进店现算），随机时再排除「当前角色原生技能（`lib.character[run.characterId][3]`，由 `mode.js` 取好再传进 `shop.js`，保持逻辑层纯函数）」与「当前 `run.skills`」；**玩家禁用过的武将不进池**（跨模式合并的 `*_banned` 名单，含其 `derivation` 衍生技）；**不做永久购买历史**——被替换/删掉的技能下一次商店还能再出现。候选被排空时返回更少的候选，不重复填充也不死循环；
- 商店的免费刷新（`SKILL_REFRESH_PER_LEVEL`，当前 2 次）属于**「这一局」**：只有 `createRun()` 新建与 `settleVictory()` 真的通关进下一局才补满；点一次扣一次并立即 `commit()`（扣不动就保持原候选原次数，不能让 UI 假装刷新成功），返回营地/重进商店/退出模式/重启游戏/异常退出恢复战斗/闯关失败都不补。购买过本局技能后刷新彻底锁死——重掷出的候选 `sold` 全是 false，放行就能绕过一局限买一个；`shopRefreshesRemaining` 是 run 的字段（v2），不进 `shopOffers`、不放 UI 临时变量；
- 商店里购买技能与升级属性都是原位更新（`ui/hub.js` 的 `refreshShop`），不重开窗口——重开会丢滚动位置，玩家得重新往下滑；
- 技能售价基于**按模式区分的基准价**（`SKILL_BASE_PRICE`=50）：**闯关恒为 50**（与关卡/胜场/等级彻底无关），**无尽为 floor(50×√当前关卡)**（第 1 关即 50，第 2 关 70、第 10 关 158），再上下浮动 25% 后**向下取整**（基准 50 → 37~62，至少 1），在 `rollSkillOffers()` 生成候选时随机定死写进存档；奖励是另一套：闯关每关固定 50 金币 + 固定经验表（第 1~29 关累计 328，加初始 2 点第 29 关结算后正好 330，三项属性 2+4+…+20×3 恰好花完），无尽是 `floor(√n × 系数)`（金币 50 / **经验 20**——金币与技能基准价同源、经验与属性升级价同系数：第 1~10 关每胜给的经验恰好等于升到该级的价钱 20,28,…,63，三项约第 22 关满级；n 是刚完成的关卡编号）——别把两套奖励混用；
- 属性升级经验与技能价同一套思路、**按模式分离**：**闯关读 `data/stats.js` 的固定价格表**（2+4+…+20 = 110/属性，三项 330，与 29 关累计经验对平）；**无尽走独立 √ 曲线** `floor(ENDLESS_STAT_UPGRADE_BASE × √目标等级)`（系数 20 → 20,28,34,40,44,48,52,56,60,63，单属性 0→10 共 445、三项 1335，约第 100 关满级）。价格只从 `run.mode` + `run.stats` 现算（`shop.js:getStatUpgradePrice`），两模式互不共享、切模式/读档都不会串表；改无尽曲线陡峭度只动 `config.js:ENDLESS_STAT_UPGRADE_BASE` 一个数；
- 新档初始资源只由 `INITIAL_CURRENCY` 决定（金币 50 两模式同额；经验与各自模式的首级升级价对平——闯关 2、无尽 20，无尽初始经验随 `ENDLESS_STAT_UPGRADE_BASE` 自动跟价），且只作用于 `createRun()`；旧存档走 `normalizeRun()` 原样读回，不会被补发；
- 无尽最高记录存在 `lib.storage.rogueBestEndless`（`{ level, characterId, updatedAt }`），只记录「已经成功通关过的最高一关」：胜利结算时用刚打赢的那一关去比，失败进入的下一关不会写进去；无尽失败整档删除时也只删槽位，记录不动。闯关模式不写这条记录。
- 大厅 BGM（`bgm.js`）只在进战斗时停：存档页↔营地↔商店↔结算之间来回切、删档、选玩法/选将都是同一条音轨继续播，**不重头**；「从头开始」只发生在页面重载后（全新元素）与首次进模式；音量走本体「音乐音量」，玩家把音乐音量调到 0 就等于静音；
- 战斗 BGM（`bgm.js` 的 `playBattleBgm/stopBattleBgm`）由 `mode.js` 在 `launch()` 进战斗时起：从 `BATTLE_BGM_LIST` **随机起一首，一首放完由 onended 随机接下一首**（不与刚放完的重复，列表只有一首时退回全表）；`stopBattleBgm` 只在**失败结算**的 `onover` 调用（并把本体 BGM 音量放回），**胜利结算特意不切**——BGM 一路响过结算页，点返回营地时整页重载自然收掉；抽签不写存档（不进 `currentBattle`、不影响 `RUN_VERSION`）；
- 我们自己的 BGM（大厅与战斗）与本体 BGM 不共存：任一音轨在放就把 `ui.backgroundMusic` 的音量按成 0（只在我们的真的播起来之后才按，被浏览器拦下就听本体的），两边都停了才还原成本体刻度——本体 BGM 全程没停过，所以停止我们的之后自然接在原进度上（失败结算的结算页上放回的就是它；胜利结算期间战斗 BGM 继续压住本体，直到整页重载）；
- 肉鸽 BGM 音量是**扩展独立设置** `rogue_bgm_volume`（选项界面：扩展设置里的数值选项行，0%~100%、默认 100%；本体没有滑条控件，选项行即同款数字按钮）：`bgm.js:getRogueBgmVolume()` 一处换算、大厅与战斗音轨共用，**与本体「音乐音量」完全解耦**——本体滑条只动 `ui.backgroundMusic`，调低/调零都不会动肉鸽音轨；旧配置缺这个键按 100 读，选项改动经 `refreshRogueBgmVolume()` 对正在放音轨即时生效；
- 技能 BGM（每个角色技能触发时放的那套，`systems/bgm.js` 的 `game.playSkillBgm`）在肉鸽会话（存档页/营地/商店/战斗）里一律拦下：判据用本体现成的 `get.mode() === MODE_ID`（即 `lib.config.mode`），不装临时钩子、无需恢复，`directstart` 重载续玩后判据依然成立；非肉鸽模式判据为假，原逻辑一行不多绕。拦下时不建音轨、不登记进互斥列表、不碰肉鸽正在放的曲子；

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
| `src/rogue/data/skills.js` | 商店技能效果、名称描述（`price` 只是留给作者标注基础价的位子） | 这里填的是**作者上架底线清单**：全部分包顶级技能（自动汇总）。肉鸽不再有原创技能——商店真正的候选池由分包技能并上全体武将的技能组成，并剔掉玩家禁用过的武将——见 `src/rogue/skillPool.js`；**实际售价由 `shop.js` 按模式基准价 ±25% 随机生成**（闯关恒 50、无尽 floor(50×√当前关卡)，floor 取整），这里写多少都不会成为最终售价。历史上发布过的原创技能（蓄势/解甲/归元）已下架，旧存档里的它们由 `state.js` 读档时自动清除 |
| `src/rogue/data/stats.js` | 防御·过牌·攻击每级的数值与升级报价 | 十级效果已按「护甲/摸牌/杀伤与次数交替成长」填好，`price` 为 2,4,6,…,20（单个属性 0→10 共 110，三项满级 330）；**只服务闯关模式**，无尽走 config.js 的 `ENDLESS_STAT_UPGRADE_BASE` √ 曲线，不吃这张表 |
| `src/rogue/data/rewards.js` | 闯关固定奖励与经验表、无尽 √关数系数 | 闯关：每关固定 50 金币（`CHALLENGE_GOLD_PER_LEVEL`）+ 固定经验表（`CHALLENGE_EXP_TABLE`，第 1~29 关累计 328，加初始 2 点第 29 关结算后正好 330）；无尽：floor(√n × 系数)，系数：金币 50、经验 20（第 1 关 50/20、第 2 关 70/28、第 3 关 86/34、第 4 关 100/40、第 10 关 158/63；经验与属性升级价同系数，前 10 关每胜恰好够升一级） |
| `src/rogue/config.js` | 技能槽数、候选数、每局免费刷新次数、新档初始资源、技能基准价、失败货币损失率、总关卡数、模式封面图、可选角色白名单、选将页每页几张武将牌 | 3/3；`SKILL_REFRESH_PER_LEVEL=2`（改成 0 就没有刷新按钮的可用次数，其它逻辑不受影响）；初始金币 50 / 经验 2（`INITIAL_CURRENCY`：金币两模式同额、建议与技能基准价同额或略高，保证第一关进商店买得起；经验按模式对平首级升级价——闯关 2、无尽 20，改 `ENDLESS_STAT_UPGRADE_BASE` 时无尽初始经验自动跟随）；定价 `SKILL_BASE_PRICE=50`、`SKILL_PRICE_SPREAD=0.25`（闯关基准价恒为 50 与关卡无关，无尽基准价 floor(50×√当前关卡)；改 50 为其它值则两模式的基准价一起平移价格区间）；失败损失 0.5；总关卡 30；封面指向 `assets/sundry/rouge.jpg`（换图改 `MODE_SPLASH` 一行，并跑 `node tools/update-manifest.mjs <新图>` 登记清单）；选将页想一页多放几张改 `CHARACTER_PICKER_PAGE_SIZE` |

属性效果支持的键（`battle.js` 已落地，写别的键不生效）：`armor`（初始护甲，受伤时自动抵伤）、`maxHp`（体力上限增量）、`startHand`（起手手牌增量）、`extraDraw`（摸牌阶段额外摸牌数）、`handLimit`（手牌上限增量）、`shaDamage`（【杀】伤害增量）、`shaLimit`（出【杀】次数增量）、`extraSkills`（额外技能 id 数组）。其中数值型强化（前四项里的 extraDraw/handLimit/shaDamage/shaLimit）由 `skills.js` 里的机制技能 `rogue_stat` 承载：`battle.js` 建局时把四项总数**一次性赋值**到玩家 `storage.rogue_stat` 并只 `addSkill` 一次（重复调用也不会翻倍），商店与奖励池刷不到它。

自检命令（在本扩展目录执行）：

```text
node tools/check/check-imports.mjs .
node tools/check/check-assets.mjs .
node tools/test/rogue.test.mjs         # 数据/逻辑层用例
node tools/test/rogue-data.test.mjs    # 内容配置自检（填完 data/ 先跑这个）
node tools/test/rogue-mode-smoke.mjs   # 模式流程冒烟（本体 API 用桩，不需要开游戏）
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
