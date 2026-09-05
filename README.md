# 奥特之星（UltraStar）

无名杀扩展：以奥特曼为核心主题，同时收录其他作品角色与相关内容的综合型扩展项目。

- **核心内容**：奥特曼系列角色与装备，按主题拆分为多个内容分包；
- **收录作品**：奥特曼、原神、崩坏：星穹铁道、赛马娘、KOF，以及其他作品（`misc`），目前收录约 50 名角色；
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
│   └── misc/                     # 其他作品
├── assets/                       # 素材（文件名全局唯一）
│   ├── camp/                     # 势力（阵营）图标
│   ├── easteregg/                # 彩蛋音频
│   ├── tierlist/                 # 角色评级图
│   └── *.jpg / *.png / *.mp3     # 角色立绘、卡牌图、BGM 与语音
├── data/                         # 纯数据层
│   ├── assets.js                 # 素材清单
│   ├── bgmList.js                # 技能 BGM 数据
│   ├── characterRank.js          # 角色评级数据
│   ├── xnnequipment.js           # 装备元数据
│   └── 装备价值列表.txt           # 装备 AI 价值参考表
└── tools/
    └── check/                    # 一致性校验脚本
        ├── check-imports.mjs     # import 路径校验
        ├── check-assets.mjs      # 素材引用校验
        └── verify-parity.mjs     # 新旧注册结果一致性对比
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
| `bgm.js` | 技能 BGM 播放系统：读取 `data/bgmList.js` 的映射，在技能触发时播放对应音频，受扩展设置开关控制 |
| `changelog.js` | 更新日志功能：读取并渲染 `CHANGELOG.md`，在设置界面中查看 |
| `easterEgg.js` | 彩蛋系统：定义触发条件、发现记录与彩蛋图鉴 |
| `tierlist.js` | 角色评级功能：注册 `data/characterRank.js` 中的评级数据，并提供评级图查看 |

这里应继续承担"所有作品都可以使用"的公共功能。未来可以增加：图鉴系统、角色搜索系统、角色分类系统、作品索引、全局统计、更多音频/视觉效果系统等。

注意：作品专属逻辑不要直接堆进 `systems`，只有能够跨作品复用的公共系统才应该放这里。

#### src/ui/ —— 扩展 UI

- `overlay.js`：通用浮层组件（样式与弹窗构造），当前被更新日志、角色评级查看等界面复用。

用于放置与 UI 显示、界面交互、信息展示有关的公共实现。未来可以扩展：作品选择界面、角色图鉴界面、更新日志界面、彩蛋图鉴、角色评级查看、扩展设置界面、更完整的扩展主页等。

#### src/config/ —— 扩展级配置

- `config/index.js`：扩展设置项，当前包括 BGM 播放开关、彩蛋系统开关、查看历史更新记录、查看角色强度排行、查看彩蛋图鉴、复制仓库地址与版本号显示。

所有与具体作品无关、需要由用户配置的选项，应优先集中在这里管理。

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

所有普通图片、音频等资源。当前采用资源文件名全局唯一的方式管理：普通素材平铺在 `assets/` 根目录（角色立绘 `.jpg`、装备卡牌图 `.png`、BGM 与语音 `.mp3`），另有三个特殊用途子目录：

```text
assets/
├── camp/                 # 势力（阵营）图标
├── easteregg/            # 彩蛋音频
└── tierlist/             # 角色评级图
```

- **`assets/camp/`**：扩展自定义势力的图标（由 `src/core/bootstrap.js` 在初始化时注册）。
- **`assets/easteregg/`**：彩蛋音频（供 `src/systems/easterEgg.js` 使用）。
- **`assets/tierlist/`**：角色评级相关图片（供 `src/systems/tierlist.js` 展示）。

新增素材时需要注意：

1. **资源命名必须全局唯一**，不能与其他作品、其他角色已使用的文件名冲突；
2. 新增素材后，需要同步将其登记进 `data/assets.js` 素材清单，供启动时的完整性检测使用；
3. 代码中引用素材时，使用 `src/core/assets.js` 提供的路径工具，保持引用方式统一。

未来如果素材越来越多，可以考虑进一步按用途或作品进行分组；在实施之前，请先沿用当前的组织方式，避免素材路径大面积变动。

## 数据

### data/

这里保存的是"数据"，而不是具体功能实现：

| 文件 | 内容 |
| --- | --- |
| `assets.js` | 全扩展素材清单，用于启动时的素材完整性检测（缺失时向玩家提示） |
| `bgmList.js` | 技能 → BGM 文件的映射数据（路径相对 `assets/` 目录） |
| `characterRank.js` | 角色评级与稀有度的静态数据（`rankMap` / `rarityMap`） |
| `xnnequipment.js` | 装备元数据（名称、花色点数、数值范围、技能描述、AI 价值等） |
| `装备价值列表.txt` | 原版牌堆装备的 AI 价值参考表 |

数据与实现是分离的。以角色评级为例：**评级数据保存在 `data/characterRank.js`，评级系统的功能实现则在 `src/systems/tierlist.js`**——"角色评级"属于数据，而不是 `systems` 本身。

以后如果还有角色标签、作品分类、装备价值、BGM 分类、图鉴数据、角色关系等类似内容，都应优先考虑放入 `data/`，不要直接硬编码到 UI 或系统逻辑中。

## 工具

### tools/

开发、校验与维护脚本，需要 Node.js 运行。当前 `tools/check/` 下有三个一致性校验脚本：

| 脚本 | 作用 |
| --- | --- |
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
7. 将新素材登记进 data/assets.js 素材清单；
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

## 后续可扩展方向

以下是项目架构未来能够自然延伸的方向，均为规划而非已完成功能。

### 1. 更多奥特曼内容

继续按作品/系列扩充 `packages/ultraman/packs/` 下的分包，例如昭和系列、平成系列、新生代、奥特曼电影、特别篇以及其他官方衍生作品，并保持不同系列之间的模块化。

### 2. 更多其他作品

继续加入新作品（原神、崩坏：星穹铁道、赛马娘、KOF 等现有作品也可以继续扩充角色）。新增作品原则上独立为新的 package，接入 `src/core/loader.js` 即可。

### 3. 角色图鉴

现有 `packages + data + systems + ui` 结构已经具备建立完整角色图鉴的条件，未来可以增加覆盖作品、角色、技能、评级、台词、图片、相关彩蛋的图鉴系统。

### 4. 更完善的角色评级

`data/characterRank.js`（数据）与 `src/systems/tierlist.js`（实现）已经分离，可以进一步扩展：分作品评级、版本评级、多套评级标准、评级统计、评级图自动生成等。

### 5. 彩蛋系统

在现有触发框架上继续扩展：特定角色触发、特定作品联动、音频彩蛋、UI 彩蛋、隐藏内容等。

### 6. BGM / 音频系统

在 `data/bgmList.js` 与 `src/systems/bgm.js` 的基础上，未来可以增加：按作品分类、按角色分类、战斗 BGM、特殊事件 BGM、更完整的音频管理。

### 7. 开发工具

逐渐完善 `tools/`：资源检查、ID 检查、结构检查、自动索引、自动打包、版本发布等，减少维护大型扩展时的人工检查成本。

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

### 尽量避免修改无名杀本体

扩展功能优先通过扩展自身的模块与无名杀提供的扩展点实现，保持与本体版本的兼容性。

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
