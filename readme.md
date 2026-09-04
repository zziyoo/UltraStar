# 无名杀扩展开发规范

## 目录

- [1. 扩展基本结构](#1-扩展基本结构)
- [2. 角色定义格式](#2-角色定义格式)
- [3. 技能定义结构](#3-技能定义结构)
- [4. 基础技能实现](#4-基础技能实现)
- [5. 事件流与技能机制](#5-事件流与技能机制)
- [6. 自定义卡牌创建](#6-自定义卡牌创建)
- [7. 动画与音效系统](#7-动画与音效系统)
- [8. 触发器（Trigger）](#8-触发器trigger)
- [9. 卡牌操作](#9-卡牌操作)
- [10. viewAs 虚拟卡牌](#10-viewas-虚拟卡牌)
- [11. chooseButton 选择界面](#11-choosebutton-选择界面)
- [12. 玩家交互方法](#12-玩家交互方法)
- [13. Mark 标记系统](#13-mark-标记系统)
- [14. Storage 存储系统](#14-storage-存储系统)
- [15. AI 配置](#15-ai-配置)
- [16. Mod 修改器](#16-mod-修改器)
- [17. 日志输出](#17-日志输出)
- [18. 常用工具函数](#18-常用工具函数)
- [19. 角色评级系统（Rank）](#19-角色评级系统rank)
- [20. chooseToMove_new 动态按钮注入](#20-choosetomove_new-动态按钮注入)
- [21. 联机相关函数](#21-联机相关函数)
- [22. 换肤与换原画系统](#22-换肤与换原画系统)
- [23. 游戏启动流程](#23-游戏启动流程)
- [24. 项目运行指南](#24-项目运行指南)
- [附录：编码规范与常见陷阱（AI参考）](#附录编码规范与常见陷阱ai参考)
- [AI 编程检查清单](#ai-编程检查清单)

***

## 1. 扩展基本结构

```javascript
import { lib, game, ui, get, ai, _status } from "../../noname.js";
export const type = "extension";
export default function () {
    return {
        name: "扩展名称",
        content: function (config, pack) {},
        precontent: function () {},
        help: {},
        config: {},
        package: {
            character: {
				character: {
                    //创建角色
					},
				},
				translate: {
                    //翻译角色名及扩展名
				},
				characterTitle: {
                    //角色称号
				},
			card: {
				card: {},
				translate: {},
				list: [],
			},
			skill: {
				skill: {
                    //创建技能处
                },
			translate: {
                //翻译技能处
            },
        },
			intro: "",
			author: "子右",
			diskURL: "",
			forumURL: "",
			version: "1.0",
		},
	}
};
```

## 2. 角色定义格式

### 2.1 官方格式（推荐）

```javascript
character: {
    character_id: {
        sex: "male",          // 性别：male/female/null
        group: "wei",         // 势力：wei/shu/wu/qun/shen 等
        hp: 3,                // 体力值
        maxHp:4,              //体力上限
        hujia:1,              //护甲值
        skills: ["skill1", "skill2"],  // 技能列表
        names: "姓|名",   // 姓名，仅在复姓或姓、名只有一个时使用
    },
},
```

### 2.2 简写格式（兼容）

```javascript
character: {
    character_id: ["sex", "group", hp, ["skill1", "skill2"]],
},
```

### 2.3 字段对照表

| 官方格式     | 说明               |
| -------- | ---------------- |
| `sex`    | 性别               |
| `group`  | 势力               |
| `hp`     | 体力值             |
| `skills` | 技能列表            |
| `names`  | 姓名（"姓|名"字符串，识别人物真名） |

**注意：** 不要混用两种格式的字段名，否则会导致报错！

### 2.4 同名替换（replace）

**【强制】** 制作新武将时必须配置 `replace` 和角色评级：

```javascript
character: {
    dccaozhi: {
        sex: "male",
        group: "wei",
        hp: 3,
        skills: ["dcfuyue", "dcwenlan"],
        names: "乐|曹植",
    },
},
// 同名武将替换（必填）
replace: {
    dccaozhi: ["caozhi"],  // 替换原版曹植
},
```

**角色评级说明：**

角色评级**不能**在 character 定义中配置，必须在扩展的 `arenaReady` 阶段通过 `lib.rank` 对象设置。详见 **[19. 角色评级系统（Rank）](#19-角色评级系统rank)**。

**replace 替换说明：**

- 用于替换同名武将，避免重复出现
- 格式：`新武将ID: ["原武将ID1", "原武将ID2"]`
- 替换后，选将界面只显示新武将，原武将被隐藏

**names 姓名说明：**

`names` 属性仅适用于复姓角色、无姓氏角色、无名角色和多头角色，且**必须使用字符串格式**而非数组格式。单姓角色无需配置，系统会自动拆分。

| 角色类型 | 格式 | 示例 |
|----------|------|------|
| 复姓角色 | `"姓|名"` | 司马懿 → `names: "司马|懿"` |
| 无姓氏角色 | `"null|名"` | 芙宁娜 → `names: "null|芙宁娜"` |
| 无名角色 | `"姓|null"` | 那维莱特 → `names: "那维莱特|null"` |
| 多头武将 | `"头1-头2"` | 颜良文丑 → `names: "颜|良-文|丑"` |

- **【重要】** `names` 中只写实际姓名或真名，**不要写称号前缀**（如"乐"、"势"等），前缀通过 `_prefix` 翻译项配置
- **【强制】** 使用字符串格式，**禁止使用数组格式**（`"司马|懿"` 而非 `["司马|懿"]`）

```javascript
// ✅ 正确：有称号前缀的角色，names 不含前缀，前缀用 _prefix 配置
yue_caozhi: {
    sex: "male",
    group: "wei",
    hp: 3,
    skills: ["dcfuyue", "dcwenlan"],
    names: "曹|植",
},
// 前缀在 translate 中配置：
translate: {
    yue_caozhi_prefix: "乐",
    yue_caozhi: "乐曹植",
},

// ✅ 填写武将真名
mb_lingju: {
	sex: "female",
	group: "qun",
	hp: 3,
	skills: ["mbjieyuan", "mbfenxin"],
	names: "吕|null",
},
```

## 3. 技能定义结构

### 3.1 基本技能结构

```javascript
skillName: {
    audio: 2,                    // 音效：0=无
    trigger: {                   // 触发器
        player: "useCardAfter",  // 触发时机
    },
    filter(event, player) {      // 触发条件
        return true;
    },
    async content(event, trigger, player) {  // 技能效果
        // 技能逻辑
    },
    ai: {                        // AI配置
        order: 8,
        result: { player: 5 },
    },
},
```

### 3.2 子技能（subSkill）

```javascript
mainSkill: {
    group: ["mainSkill_sub1", "mainSkill_sub2"],
    subSkill: {
        sub1: {
            trigger: { player: "phaseUse" },
            // 子技能逻辑
        },
        sub2: {
            trigger: { player: "phaseDiscard" },
            // 子技能逻辑
        },
    },
},
```

### 3.3 技能类型属性

| 属性       | 类型         | 说明       | <br />                                             |
| --------- | ------------ | --------- | :------------------------------------------------- |
| `mod`     | object       | 修改器  | 添加 `mod` 后默认 `forced: true`，若不需要强制执行须显式设 `forced: false` |
| `forced`  | boolean      | 强制触发 | 设为 `true` 后默认 `locked: true`，若不属于锁定技须显式设 `locked: false` |
| `locked`  | boolean      | 锁定（不可禁用）  | 默认跟随 `forced` 值；当 `forced: true` 但不属于锁定技时，必须显式设 `locked: false` |
| `silent`  | boolean      | 静默（不弹窗）   | <br />                                             |
| `popup`   | boolean      | 弹出提示      | <br />                                             |
| `firstDo` | boolean      | 优先执行      | <br />                                             |
| `enable`  | array/string | 主动技能启用时机  | <br />                                             |
| `charlotte` | boolean    | 异能技（本回合消失） | 原称"Charlotte技"，现已正式命名为"异能技"            |

> 完整标签速查表与常用组合模板见附录5

### 3.4 技能依赖机制（addAdditionalSkill）

`addAdditionalSkill` 实现技能依赖关系：通过已有技能 a 获得衍生技能 b，失去技能 a 时技能 b 随之失去。

#### 基本用法

```javascript
// 通过技能 a 获得技能 b
player.addAdditionalSkill("skill_a", "skill_b");
// 通过技能 a 获得多个衍生技能
player.addAdditionalSkill("skill_a", ["skill_b1", "skill_b2"]);
// 移除衍生技能（通常在失去技能 a 时自动触发）
player.removeAdditionalSkill("skill_a");
```

#### 参数说明

| 参数 | 类型 | 说明 |
|------|------|------|
| `skillTag` | String | 主技能名，作为衍生技能的依赖标识 |
| `skills` | String/Array | 衍生技能名或技能数组 |
| 第三个参数 | Boolean | `true` 时保留原有衍生技能（可选） |

#### 关键要点

1. **依赖关系**：衍生技能依赖于主技能，主技能失去时衍生技能自动移除
2. **onremove 钩子**：在主技能的 `onremove` 中调用 `player.removeAdditionalSkill(skill)` 清理
3. **skillTag 唯一性**：使用 `${skillName}_${player.playerid}` 格式确保不同来源的依赖不冲突
4. **异步支持**：`addAdditionalSkills`（复数形式）支持 `await` 调用

### 3.5 动态翻译（Dynamic Translate）

动态翻译允许技能描述根据游戏状态实时变化，提升玩家体验。

#### 方案一：inline 函数（少量技能时使用）

在 `translate` 对象中，将 `_info` 字段改为函数形式：

```javascript
translate: {
    skill_id: "技能名称",
    skill_id_info(player) {
        // 根据玩家状态返回不同描述，可选链避免 player 为 undefined
        return "技能描述";
    },
}
```

**使用场景示例：**

```javascript
// 效果随状态变化
mbdianyi_info(player) {
    const triggers = player?.getStorage("mbdianyi_triggers") || [];
    if (triggers.length === 0) {
        return "锁定技，初始无触发时机。";
    }
    const list = triggers.map(t => {
        if (t === "damageSource") return "造成伤害后";
        if (t === "damage") return "受到伤害后";
        return t;
    });
    return `锁定技，当你${list.join("、")}（每轮限一次）...`;
}
```

**参考技能：** 势曹爽【渐专】、刘瑄【仁诚】、OL谋黄月英【理贤】

#### 方案二：独立文件（推荐，多技能使用）

当扩展中有多个动态翻译时，提取为独立文件，结构更清晰。

**文件结构：**
```
extension/
├── dynamicTranslate.js    # 动态翻译定义文件
├── extension.js            # 主扩展文件（导入并注册）
└── ...
```

**1. 创建 dynamicTranslate.js：**
```javascript
import { lib, game, ui, get, ai, _status } from "../../noname.js";

const dynamicTranslates = {
    jtjeheiwu(player) {
        const num1 = player?.getStorage("jtjeheiwu_num1", 1);
        const num2 = player?.getStorage("jtjeheiwu_num2", 1);
        return `锁定技，其他角色回合开始时，你令其选择一项：①弃置${get.cnNumber(num1)}张牌。②失去${get.cnNumber(num2)}点体力。然后对应选项的数字+1。`;
    },
};

export default dynamicTranslates;
```

**2. 在 extension.js 顶部导入：**
```javascript
import dynamicTranslates from "./dynamicTranslate.js";
```

**3. 在 arenaReady 中注册到 lib.dynamicTranslate：**
```javascript
arenaReady: function () {
    for (const key in dynamicTranslates) {
        lib.dynamicTranslate[key] = dynamicTranslates[key];
    }
    // 其他初始化逻辑...
},
```

**4. translate 对象使用静态字符串**（`_info` 可省略，由 `lib.dynamicTranslate` 覆盖）：
```javascript
translate: {
    jtjeheiwu: "黑雾",
    // _info 字段由 dynamicTranslate.js 提供，此处无需定义
    jtjeheijie: "螺壳",
    jtjeheijie_info: "锁定技，令你耐力值+1。", // 非动态翻译仍需写在此处
}
```

#### 通用规则

| 要点 | 说明 |
|------|------|
| 防御性编程 | 使用可选链 `player?.getStorage()` 避免 player 为 undefined |
| 默认值处理 | `getStorage(key, defaultValue)` 提供合理默认值 |
| 性能考虑 | 避免在函数内执行复杂计算或大量查询 |
| 中文数字 | 描述中使用 `get.cnNumber(num)` 生成中文大写数字 |
| 优先级 | `lib.dynamicTranslate` 优先于 `translate` 中的静态字符串 |
| skill name | 技能名称的翻译仍需在 `translate` 中定义 |

## 4. 基础技能实现

> **本章详细讲解无名杀中各类特殊技能类型的实现方法，包括触发方式、效果逻辑、状态管理等技术细节。**

### 4.1 觉醒技（Awakening Skill）

**定义：** 满足特定条件后永久触发，改变角色状态（体力上限、技能等）的技能。觉醒后不可逆转。

**核心属性：** `juexingji: true`

**触发机制：**
- 通常在特定阶段触发（如准备阶段、结束阶段）
- 必须有明确的触发条件（filter）
- 触发后自动调用 `player.awakenSkill(skillName)` 标记为已觉醒
- 觉醒后技能不再触发

**实现模板：**

```javascript
skillName: {
    audio: 2,
    juexingji: true,                    // 标记为觉醒技
    trigger: { player: "phaseZhunbeiBegin" },  // 准备阶段开始时
    filter(event, player) {
        // 觉醒条件：例如手牌数大于体力值
        return player.countCards("h") > player.getHp();
    },
    forced: true,                       // 觉醒技通常强制触发
    async content(event, trigger, player) {
        player.awakenSkill(event.skill);  // 必须调用！标记为已觉醒
        // 觉醒效果
        await player.loseMaxHp(1);        // 减少体力上限
        await player.addSkills("newSkill");  // 获得新技能
        game.log(player, "觉醒了！");
    },
    derivation: "newSkill",              // 声明觉醒后获得的技能（用于显示）
},
```

**关键点：**

| 要点 | 说明 |
|------|------|
| `juexingji: true` | 必须设置，标记为觉醒技 |
| `player.awakenSkill(skill)` | content 中必须调用，否则可重复觉醒 |
| `derivation` | 声明觉醒后获得的技能，用于UI提示 |
| `forced: true` | 觉醒技通常强制触发 |
| 不可逆 | 觉醒后永久生效，无法回退 |

**多条件觉醒示例：**

```javascript
mbsuixin: {
    audio: 2,
    juexingji: true,
    trigger: { player: "phaseJieshuBegin" },
    filter(event, player) {
        // 多个觉醒条件，任一满足即可
        const conditions = [
            player.countCards("h") === 0,           // 无手牌
            player.getDamagedHp() >= 3,             // 已损失3点体力
            player.getStorage("mbsuixin_count", 0) >= 5,  // 计数达5
        ];
        return conditions.some(c => c);
    },
    forced: true,
    async content(event, trigger, player) {
        player.awakenSkill(event.skill);
        await player.gainMaxHp(1);
        await player.recover(1);
        await player.addSkills(["mbxinhui", "mbxinyuan"]);
    },
    derivation: ["mbxinhui", "mbxinyuan"],
},
```

### 4.2 限定技（Limited Skill）

**定义：** 整局游戏只能发动一次的技能。

**核心属性：** `limited: true`（主动技需配合 `limit` 属性，触发技需配合 `awakenSkill` 方法）

**实现方式一：主动技限定技（使用 `limited` + `limit` 属性）**

```javascript
skillName: {
    audio: 2,
    enable: "phaseUse",          // 出牌阶段主动发动
    limited: true,               // 标记为限定技
    filterCard(card, player) {
        return get.type(card) === "trick";
    },
    selectCard: [1, Infinity],
    async content(event, trigger, player) {
        await player.draw(event.cards.length * 2);
        // 技能发动后自动标记为已使用，不可再次发动
    },
    ai: {
        order: 9,
        result: { player: 5 },
    },
},
```

**实现方式二：触发技限定技（使用 `limited` + `awakenSkill` 方法）**

```javascript
skillName: {
    audio: 2,
    trigger: { player: "damageBegin2" },  // 触发技
    limited: true,                        // 标记为限定技
    filter(event, player) {
        return player.hp <= event.num;
    },
    async content(event, trigger, player) {
        player.awakenSkill(event.name);   // 关键：唤醒限定技，标记为已使用
        // 技能逻辑...
        await player.recover();
        trigger.cancel();
    },
    ai: {
        order: 9,
        result: { player: 5 },
    },
},
```

**实现方式三：手动管理（复杂场景，不推荐）**

```javascript
skillName: {
    enable: "phaseUse",
    filter(event, player) {
        // 检查是否已使用过
        return !player.hasSkill("skillName_used");
    },
    async content(event, trigger, player) {
        // 技能逻辑...
        await player.draw(3);
        // 标记为已使用
        player.addTempSkill("skillName_used", "gameOver");
    },
    subSkill: {
        used: {
            charlotte: true,
            mark: true,
            intro: { content: "限定技已发动" },
        },
    },
},
```

**关键点：**

| 属性/方法 | 适用场景 | 说明 |
|------|------|------|
| `limited: true` | 所有限定技 | 标记为限定技（必需） |
| `limit: { game: 1 }` | 主动技 | 整局限1次（主动技必需） |
| `limit: { round: 1 }` | 主动技 | 每轮限1次（主动技可选） |
| `awakenSkill(event.name)` | 触发技 | 唤醒限定技，标记为已使用（触发技必需） |
| 自动管理 | 主动技 | 使用 `limit` 属性时引擎自动管理使用次数 |
| 手动调用 | 触发技 | 必须在 content 中调用 `awakenSkill` |

**重要提醒：**
- **主动技**：使用 `limit` 属性，引擎自动管理，无需手动调用 `awakenSkill`
- **触发技**：必须手动调用 `player.awakenSkill(event.name)` 来唤醒限定技
- **event.name**：使用 `event.name` 而不是 `event.skill`

### 4.3 使命技（Duty Skill）

**定义：** 有阶段性目标的技能，完成或失败目标后会触发不同效果。

**核心属性：** `dutySkill: true`

**实现结构：**

```javascript
skillName: {
    audio: 2,
    dutySkill: true,                    // 标记为使命技
    trigger: { player: "phaseZhunbeiBegin" },
    filter(event, player) {
        // 检查使命是否已完成
        return !player.hasSkill("skillName_success") && 
               !player.hasSkill("skillName_fail");
    },
    async content(event, trigger, player) {
        // 检查使命进度
        const progress = player.getStorage("skillName_progress", 0);
        
        if (progress >= 5) {
            // 使命成功
            player.addSkill("skillName_success");
            await player.draw(3);
            game.log(player, "完成了使命");
        } else if (player.getHp() <= 1) {
            // 使命失败
            player.addSkill("skillName_fail");
            await player.loseHp(1);
            game.log(player, "使命失败");
        }
    },
    subSkill: {
        success: {
            charlotte: true,
            mark: true,
            intro: { content: "使命已完成" },
        },
        fail: {
            charlotte: true,
            mark: true,
            intro: { content: "使命已失败" },
        },
    },
    group: ["skillName_record"],  // 记录进度的子技能
    subSkill: {
        record: {
            charlotte: true,
            forced: true,
            silent: true,
            popup: false,
            trigger: { player: "useCardAfter" },
            filter(event, player) {
                return get.type2(event.card) === "trick";
            },
            content(event, trigger, player) {
                player.markAuto("skillName_progress", [1]);
            },
        },
    },
},
```

### 4.4 主公技（Lord Skill）

**定义：** 仅主公可使用的技能。

**核心属性：** `zhuSkill: true`

**实现方式：**

```javascript
skillName: {
    audio: 2,
    zhuSkill: true,                     // 标记为主公技
    enable: "phaseUse",
    filter(event, player) {
        // 只有主公才能使用
        return player.isZhu && player.isZhu();
    },
    filterCard(card, player) {
        return get.type(card) === "basic";
    },
    async content(event, trigger, player) {
        await player.draw(1);
    },
},
```

**主公技配合觉醒：**

```javascript
// 觉醒后获得主公技
skillName_awaken: {
    juexingji: true,
    trigger: { player: "phaseZhunbeiBegin" },
    filter(event, player) {
        return player.getDamagedHp() >= 2;
    },
    forced: true,
    async content(event, trigger, player) {
        player.awakenSkill(event.skill);
        await player.addSkills("skillName_lord");  // 获得主公技
    },
    derivation: "skillName_lord",
},
```

### 4.5 转换技（Switch Skill）

**定义：** 在两种或多种状态间切换的技能。

**实现方式一：使用 storage 记录状态**

```javascript
skillName: {
    audio: 2,
    enable: "phaseUse",
    filter(event, player) {
        // 根据当前状态过滤
        const state = player.getStorage("skillName_state", 0);
        return state === 0 ? player.countCards("h") > 0 : true;
    },
    filterCard(card, player) {
        const state = player.getStorage("skillName_state", 0);
        if (state === 0) {
            return get.type(card) === "basic";
        }
        return false;  // 状态1不需要出牌
    },
    selectCard: -1,
    async content(event, trigger, player) {
        const state = player.getStorage("skillName_state", 0);
        if (state === 0) {
            // 状态0的效果
            await player.draw(2);
            // 切换到状态1
            player.setStorage("skillName_state", 1, true);
        } else {
            // 状态1的效果
            await player.recover(1);
            // 切换回状态0
            player.setStorage("skillName_state", 0, true);
        }
    },
    // 动态翻译显示当前状态
    ai: {
        order: 8,
        result: { player: 3 },
    },
},
// 动态翻译
translate: {
    skillName_info(player) {
        const state = player?.getStorage("skillName_state", 0);
        if (state === 0) {
            return "转换技，出牌阶段你可以弃置一张基本牌，摸两张牌，然后转换为【阴】。";
        }
        return "转换技，【阴】状态下你可以回复1点体力，然后转换为【阳】。";
    },
},
```

**实现方式二：使用阴阳状态标记**

```javascript
skillName: {
    audio: 2,
    enable: "phaseUse",
    yin: true,  // 初始为阴状态（无名杀内置转换技支持）
    filterCard(card, player) {
        // 根据阴阳状态过滤
        if (player.hasSkillTag("yin")) {
            return get.type(card) === "basic";
        }
        return get.type(card) === "trick";
    },
    async content(event, trigger, player) {
        if (player.hasSkillTag("yin")) {
            await player.draw(2);
        } else {
            await player.discardPlayerCard(player, "h", 1, true);
            await player.draw(3);
        }
        // 自动切换阴阳状态
    },
},
```

**实现方式三：使用 zhuanhuanji 标记（推荐）**

无名杀内置转换技支持，系统自动管理状态切换。

```javascript
skillName: {
    audio: 2,
    zhuanhuanji: true,  // 标记为转换技（系统自动管理状态）
    mark: true,         // 显示状态标记
    marktext: "☯",     // 标记符号（阴阳太极）
    intro: {
        content(storage) {
            // 动态介绍：storage 为 true 表示阴状态，false/undefined 表示阳状态
            if (storage) {
                return "转换技，【阴】状态下的效果描述";
            }
            return "转换技，【阳】状态下的效果描述";
        },
    },
    enable: "phaseUse",
    filter(event, player) {
        const isYin = player.storage.skillName;  // true 为阴，false/undefined 为阳
        return isYin ? player.countCards("h") > 0 : true;
    },
    async content(event, trigger, player) {
        const isYin = player.storage.skillName;
        if (isYin) {
            // 阴状态效果
            await player.draw(2);
        } else {
            // 阳状态效果
            await player.recover(1);
        }
        player.changeZhuanhuanji("skillName");  // 必须调用！切换状态
    },
},
```

**关键点：**

| 要点 | 说明 |
|------|------|
| `zhuanhuanji: true` | 标记为转换技 |
| `mark: true` | 显示状态标记 |
| `marktext` | 标记符号（通常使用 ☯） |
| `intro.content` | 动态介绍，根据 storage 显示当前状态 |
| `player.storage.技能名` | 判断当前状态：true=阴，false/undefined=阳 |
| `player.changeZhuanhuanji("技能名")` | 切换状态，必须在 content 中调用 |

**触发技转换技示例：**

```javascript
skillName: {
    audio: 2,
    zhuanhuanji: true,
    mark: true,
    marktext: "☯",
    intro: {
        content(storage) {
            if (storage) {
                return "转换技，【阴】：受到伤害后摸两张牌";
            }
            return "转换技，【阳】：造成伤害后回复1点体力";
        },
    },
    trigger: { player: "damageEnd" },
    filter(event, player) {
        const isYin = player.storage.skillName;
        // 阴状态：受到伤害后触发
        if (isYin) {
            return event.player === player && event.num > 0;
        }
        // 阳状态：造成伤害后触发
        return event.source === player && event.num > 0;
    },
    async content(event, trigger, player) {
        const isYin = player.storage.skillName;
        if (isYin) {
            await player.draw(2);
        } else {
            await player.recover(1);
        }
        player.changeZhuanhuanji("skillName");
    },
},
```

### 4.6 持恒技（Persevere Skill）

**定义：** 不可被移除、封印的技能。

**核心属性：** `persevereSkill: true`

```javascript
skillName: {
    audio: 2,
    persevereSkill: true,               // 标记为持恒技
    trigger: { player: "phaseZhunbeiBegin" },
    forced: true,
    filter(event, player) {
        return player.countCards("h") < player.getHp();
    },
    async content(event, trigger, player) {
        await player.draw(player.getHp() - player.countCards("h"));
    },
},
```

**持恒技特点：**
- 无法被 `removeSkills` 移除
- 无法被 `disableSkill` 封印
- 适合核心被动技或关键机制

### 4.7 变身技（Transformation Skill）

**定义：** 角色变身为另一个角色的技能。

**核心属性：** `rule_bianshenji`（规则术语）

**实现方式：**

```javascript
skillName: {
    audio: 2,
    enable: "phaseUse",
    limited: true,
    filter(event, player) {
        return !player.hasSkill("skillName_transformed");
    },
    async content(event, trigger, player) {
        // 选择变身目标
        const result = await player.chooseButton([
            "选择变身目标",
            [get.inpileVCardList(info => {
                return lib.character[info[2]];  // 只显示存在的角色
            }), "character"],
        ], true).forResult();
        
        if (!result?.links?.length) return;
        
        const targetChar = result.links[0][2];
        
        // 执行变身
        game.broadcastAll((player, target) => {
            player.name = target;
            player.name1 = target;
            player.name2 = null;
            player.sex = lib.character[target][0];
            player.group = lib.character[target][1];
            player.hp = lib.character[target][2];
            player.maxHp = player.hp;
            player.skills = [...lib.character[target][3]];
            player.update();
        }, player, targetChar);
        
        // 标记已变身
        player.addSkill("skillName_transformed");
        game.log(player, "变身为", get.translation(targetChar));
    },
    subSkill: {
        transformed: {
            charlotte: true,
            mark: true,
            intro: { content: "已变身" },
        },
    },
},
```

### 4.8 蓄能技（Energy Storage Skill）

**定义：** 积累能量后释放效果的技能。

**核心属性：** `rule_xunengji`（规则术语）

**实现方式：**

```javascript
skillName: {
    audio: 2,
    enable: "phaseUse",
    filter(event, player) {
        const energy = player.getStorage("skillName_energy", 0);
        return energy >= 3;  // 需要3点能量才能发动
    },
    async content(event, trigger, player) {
        const energy = player.getStorage("skillName_energy", 0);
        // 消耗能量
        player.setStorage("skillName_energy", energy - 3, true);
        
        // 释放效果
        await player.draw(energy);
        const targets = game.filterPlayer(p => p !== player && p.isIn());
        for (const target of targets) {
            await target.damage(1);
        }
    },
    // 积累能量的子技能
    group: ["skillName_charge"],
    subSkill: {
        charge: {
            charlotte: true,
            forced: true,
            silent: true,
            popup: false,
            trigger: { player: "damageEnd" },
            filter(event, player) {
                return event.num > 0;
            },
            content(event, trigger, player) {
                const current = player.getStorage("skillName_energy", 0);
                player.setStorage("skillName_energy", current + 1, true);
                game.log(player, "获得了1点能量");
            },
        },
    },
    marktext: "能",
    intro: {
        name: "能量",
        content: "当前能量：#",
        markcount(storage) {
            return storage || 0;
        },
    },
    ai: {
        order: 10,
        result: { player: 5 },
    },
},
```

### 4.9 锁定技（Locked Skill）

**定义：** 强制触发、无法被取消的技能。

**核心属性：** `forced: true` + `locked: true`

**属性默认关系：**
- `mod` → 默认 `forced: true` → 默认 `locked: true`
- 即：添加 `mod` 的技能自动视为强制且锁定，除非显式覆盖

**省略写法（利用默认值）：**
- 含 `mod` 的锁定技 → 可省略 `forced` 和 `locked`（默认均为 `true`）
- 含 `forced: true` 的锁定技 → 可省略 `locked`（默认为 `true`）

**特殊情况须显式声明：**
- 含 `mod` 但不需要强制执行 → 必须显式设 `forced: false`
- 含 `forced: true` 但不属于锁定技 → 必须显式设 `locked: false`

```javascript
skillName: {
    audio: 2,
    forced: true,                       // 强制触发
    locked: true,                       // 锁定（不可禁用）
    trigger: { player: "damageBegin" },
    filter(event, player) {
        return event.num > 1;
    },
    async content(event, trigger, player) {
        // 减少伤害
        trigger.num = Math.floor(trigger.num / 2);
        // forced 技能自动 logSkill，不需要手动调用
    },
    ai: {
        effect: {
            target(card, player, target) {
                if (get.tag(card, "damage")) {
                    return [1, 0.5];  // 减少伤害
                }
            },
        },
    },
},
```

### 4.10 多阶段技能（Multi-stage Skill）

**定义：** 一个技能包含多个执行阶段，每阶段有不同效果。

**实现方式：使用 cost + content 分离**

```javascript
skillName: {
    audio: 2,
    enable: "phaseUse",
    usable: 1,
    async cost(event, trigger, player) {
        // 阶段1：选择目标
        const result = await player.chooseTarget(
            "选择一名角色",
            "你将对其造成1点伤害并摸一张牌",
            (card, player, target) => target !== player && target.isIn(),
        ).set("ai", target => {
            return get.damageEffect(target, player, player) > 0 ? 10 : 0;
        }).forResult();
        
        if (!result.bool) {
            event.result = { bool: false };
            return;
        }
        
        event.result = {
            bool: true,
            cost_data: { targets: result.targets },
        };
    },
    async content(event, trigger, player) {
        const { targets } = event.cost_data;
        const target = targets[0];
        
        // 阶段2：造成伤害
        await target.damage(1);
        
        // 阶段3：摸牌
        await player.draw(1);
        
        // 阶段4：根据结果执行额外效果
        if (target.hp <= 0) {
            await player.draw(2);
            game.log(player, "目标阵亡，额外摸两张牌");
        }
    },
},
```

### 4.11 响应类技能详解

**定义：** 在需要使用特定牌时（如响应杀、闪、无懈可击）可以视为使用该牌的技能。

**核心配置：** `enable: "chooseToUse"` + `hiddenCard` + `ai.respondXxx` + `ai.skillTagFilter`

```javascript
skillName: {
    audio: 2,
    enable: ["chooseToUse", "chooseToRespond"],  // 主动使用和响应时可用
    filterCard(card, player) {
        // 可以将特定牌当作目标牌使用
        return get.color(card) === "red";
    },
    viewAs: { name: "sha", isCard: true },  // 视为杀（虚拟牌）
    prompt: "将一张红色牌当杀使用",
    check(card) {
        return 5 - get.value(card);
    },
    // 告诉系统可以视为使用该牌
    hiddenCard(player, name) {
        if (name === "sha") {
            return player.hasCards("h", card => get.color(card) === "red");
        }
        return false;
    },
    ai: {
        respondSha: true,               // 可响应杀
        skillTagFilter(player, tag) {
            if (tag === "respondSha") {
                return player.hasCards("h", card => get.color(card) === "red");
            }
            return false;
        },
        order: 4,
        result: { player: 1 },
    },
},
```

**无懈可击响应技能：**

```javascript
skillName: {
    audio: 2,
    enable: "chooseToUse",
    filterCard: () => false,            // 不需要实际卡牌
    selectCard: -1,
    viewAs: { name: "wuxie", isCard: true },  // 视为无懈可击
    // 关键：告诉系统可以视为无懈可击
    hiddenCard(player, name) {
        if (name === "wuxie") {
            // 检查是否满足发动条件
            return player.countCards("h") > 0;
        }
        return false;
    },
    ai: {
        respondWuxie: true,             // 必须声明！
        skillTagFilter(player, tag) {
            if (tag === "respondWuxie") {
                return player.countCards("h") > 0;
            }
            return false;
        },
    },
},
```

### 4.12 触发技完整实现模式

| 模式 | 适用场景 | 参考章节 |
|------|---------|---------|
| 简单触发技 | 无前置交互，满足条件自动触发 | 3.1 基本技能结构 |
| 多触发时机 | 同一技能监听多个事件 | 8.2.1 event.triggername |
| 带前置交互的触发技（cost 模式） | 需要玩家选择目标/卡牌后触发 | 3.1 async cost 结构 |
| 转化类触发技 | 将某张牌转化为另一张牌使用 | 10. viewAs 虚拟卡牌 |
| 强制触发技 | 无需玩家确认，自动执行 | 3.3 locked + forced |

**cost 模式数据传递：**

```javascript
// cost 中设置
event.result = { bool: true, cost_data: { targets, cards } };
// content 中读取
const { targets, cards } = event.cost_data;
```

**注意：** 不要使用 `_targets`、`_cards` 等下划线属性传递数据，必须使用 `cost_data`。

### 4.13 技能优先级与执行顺序

**firstDo 优先执行：**

```javascript
mainSkill: {
    group: ["mainSkill_pre", "mainSkill_post"],
    subSkill: {
        pre: {
            firstDo: true,  // 在主技能 filter 之前执行
            trigger: { player: "useCardAfter" },
            async content(event, trigger, player) {
                // 记录数据，主技能可读取
                player.setStorage("mainSkill_data", trigger.card, true);
            },
        },
        post: {
            // 默认在主技能 content 之后执行
            trigger: { player: "useCardAfter" },
            async content(event, trigger, player) {
                // 主技能已完成
            },
        },
    },
},
```

**优先级控制：使用 `priority` 属性**

```javascript
skillName: {
    trigger: { player: "damageBegin" },
    priority: 15,  // 数值越大优先级越高（默认为0）
    async content(event, trigger, player) {
        // 优先于其他 damageBegin 技能执行
    },
},
```

### 4.14 技能状态管理

**技能启用/禁用：**

```javascript
// 临时禁用技能（可恢复）
player.disableSkill("skillName", "phaseAfter");  // 到回合结束后恢复

// 永久禁用技能
player.disableSkill("skillName");

// 恢复技能
player.enableSkill("skillName");

// 检查技能是否可用
if (!player.hasSkill("skillName")) return;
if (player.hasSkill("skillName_disabled")) return;
```

**临时技能管理：**

```javascript
// 添加临时技能（到指定时机移除）
player.addTempSkill("skillName", "phaseAfter");  // 回合结束后移除
player.addTempSkill("skillName", "roundEnd");    // 轮次结束后移除

// 检查是否为临时技能
if (player.hasSkill("skillName_temp")) {
    // 是临时技能
}
```

***

## 5. 事件流与技能机制

> **本章讲解无名杀的事件系统、技能触发流程、以及如何正确处理事件嵌套。**

### 5.1 事件系统概述

> 事件系统架构的完整文档参考 [game-event/index.md](../../../../noname/docs/game-event/index.md)

无名杀采用**事件驱动**架构，所有游戏行为都通过事件传递。技能通过监听特定事件来触发。

**事件生命周期：**

```
事件创建 → Before时机(_triggered: 0→1) → Begin时机(_triggered: 1→2) → 执行content → After时机(_triggered: 3→4) → 事件完成
```

**`_triggered` 状态机：**

| 值 | 含义 | 阶段 |
|----|------|------|
| `null` | 非 trigger 事件（构造时 `trigger = false`） | 无 |
| `0` | 初始状态 | → `XXXBefore` |
| `1` | Before 已触发 | → `XXXBegin`（未 finish）/ `XXXOmitted`（已 finish） |
| `2` | Begin 已触发 | → 执行 content |
| `3` | Content 已执行 | → `XXXAfter` |
| `4` | 全部触发完成 | → 处理 after 链，退出 loop |
| `5` | 被 `untrigger` 取消 | 跳过当前 arrangeTrigger |

**事件树结构：**

```
game (根事件)
  └─ phase (阶段事件)
      ├─ phaseUse (出牌阶段)
      │   └─ chooseToUse (选择用牌)
      │       └─ useCard (出牌)
      │           └─ arrangeTrigger (时机：使用牌时)
      │               └─ createTrigger (触发技能)
      ├─ phaseDiscard (弃牌阶段)
     ...
```

- `parent`：子事件持有对父事件的引用
- `childEvents`：父事件的直接子事件列表
- `next`：串行执行队列（子事件按顺序执行）
- `after`：延迟执行队列（当前事件完全结束后才执行）
- `getParent(level)`：沿 parent 链向上查找（支持层数/事件名/函数匹配）

**事件栈：**

`_status.event` 指向当前正在执行的事件，由 `eventStack` 管理。通过 `getParent()` 可以沿事件树向上查找父事件。

**获取当前事件：**

```javascript
// 获取当前正在执行的事件
const event = get.event();

// 获取事件名称
console.log(event.name);

// 获取事件玩家
console.log(event.player);

// 获取父事件
const parent = event.getParent();
const parent2 = event.getParent(2);  // 上两级父事件
```

**事件交互接口：**

| 方法/属性 | 说明 |
|-----------|------|
| `event.set(key, value)` | 为事件设置属性，支持链式调用 |
| `event.forResult()` | 等待事件完成并返回 result（`await event.forResult()`） |
| `event.result` | 事件执行结果 |
| `event.cost_data` | `result.cost_data` 的快捷别名 |
| `event.then()` / `await event` | 启动事件并等待完成（GameEvent 实现 PromiseLike） |

### 5.2 技能触发流程

```
1. 事件触发
   ↓
2. event.trigger(name) 检查 lib.hookmap[name]，按座位顺序遍历所有角色
   ↓
3. 收集匹配 trigger 的技能，按 firstDo / lastDo / priority 排序
   ↓
4. 创建 arrangeTrigger 子事件
   ↓
5. 对每个匹配的技能调用 filter(event, player, name)
   ↓
6. 如果是 forced 技能，直接执行 content
   如果是非 forced 技能，调用 check(event, player) 判断AI是否发动
   或调用 cost(event, trigger, player) 进行玩家交互
   ↓
7. 执行 content(event, trigger, player)
   ↓
8. 触发 After 时机事件
```

**arrangeTrigger 数据结构：**

`trigger()` 创建的 `arrangeTrigger` 事件按座位顺序排列：

```
[
  { player: "firstDo",  todoList: [...], doneList: [...] },  // 优先队列
  { player: player_1,   todoList: [...], doneList: [...] },
  ...
  { player: "lastDo",   todoList: [...], doneList: [...] },  // 末位队列
]
```

- `todoList`：待触发的技能条目，按 priority 降序
- `doneList`：已触发过的技能条目（防止重复）
- 每个条目：`{ skill, player, priority, indexedData? }`

**Content 编译系统：**

所有 content 最终都通过 `ArrayCompiler` 执行：

```
单 async 函数 → AsyncCompiler（适配层） → [fn]
旧 step 函数 → StepCompiler（解析）   → [fn1, fn2, ...]
数组直接传入  → 跳过预处理              → [fn1, fn2, ...]
                                              ↓
                                    ArrayCompiler（执行引擎）
```

- **单 async 函数**：推荐写法，`async content(event, trigger, player) { ... }`
- **函数数组**：待废弃，`content: [fn1, fn2, fn3]`
- **step 语法**：待废弃，`content: function() { "step 0"; ... }`

### 5.3 事件嵌套与插结

**插结（Insert Event）：** 在当前事件执行过程中插入新事件。

```javascript
async content(event, trigger, player) {
    // 正常执行
    await player.draw(1);
    
    // 插入一个新事件
    await game.delayx();  // 等待动画完成
    
    // 继续执行
    await player.discard(cards);
}
```

**避免插结卡死：**

```javascript
// ✅ 正确：content 开头提前判断条件
async content(event, trigger, player) {
    if (!player.countCards("h")) return;  // 无手牌直接结束
    if (!game.hasPlayer(p => p !== player && p.isIn())) return;  // 无目标直接结束
    
    // 安全的交互逻辑
    const result = await player.chooseTarget("选择目标").forResult();
    if (!result.bool) return;
    
    await result.targets[0].damage(1);
},

// ❌ 错误：不判断条件直接交互（可能卡死）
async content(event, trigger, player) {
    const result = await player.chooseTarget("选择目标").forResult();
    // 如果没有合法目标，chooseTarget 会卡住
},
```

### 5.4 历史记录系统

**获取历史事件：**

```javascript
// 当前回合使用牌的历史
const useCardHistory = player.getHistory("useCard");

// 带过滤的历史
const shaHistory = player.getHistory("useCard", evt => evt.card.name === "sha");

// 获取历史数量
const shaCount = player.getHistory("useCard", evt => evt.card.name === "sha").length;

// 整局历史
const allHistory = player.getAllHistory("useCard");

// 轮次历史
const roundHistory = player.getRoundHistory("useCard");
```

**使用历史判断"首次"：**

```javascript
filter(event, player) {
    // 判断是否为本回合首次使用该类型牌
    const type = get.type2(event.card);
    const isFirst = player.getHistory("useCard", evt => 
        get.type2(evt.card) === type
    ).indexOf(event) === 0;
    return isFirst;
},
```

### 5.5 伤害事件管道（damageBegin1~damageBegin4）

> **伤害事件按顺序分为 4 个阶段，遵循"先加伤 → 再改性质 → 再减伤 → 最后锁定"的设计原则。**

在 [content.ts](file:///c:/Users/32360/Desktop/noname/apps/core/noname/library/element/content.ts#L11903) 中，`damage` 事件是一个有序数组，依次执行 4 个 trigger 阶段后再执行实际扣血：

```
damageBegin1 → damageBegin2 → damageBegin3 → damageBegin4 → 实际扣血(changeHp)
```

| 阶段 | 触发事件 | 典型 trigger 对象 | 用途 |
|------|---------|------------------|------|
| Step 0 | `damageBegin1` | `source`（伤害来源） | **增加伤害值**，各类加伤技能最先生效 |
| Step 1 | `damageBegin2` | `source` / `player` | **改变伤害性质**，如转化为体力流失、改为减少体力上限 |
| Step 2 | `damageBegin3` | `player`（受伤者） | **减伤/防止伤害**，防御技能在此阶段生效 |
| Step 3 | `damageBegin4` | `player` / `source` | **伤害值最终锁定**，特殊结算收尾，常配合 `lastDo: true` |

**各阶段详解：**

**damageBegin1** — 加伤阶段
- 伤害来源的加伤技能在此阶段修改 `event.num`
- 示例：青釭剑、古锭刀、各种战法加伤（`zf_anyDamage`）
- 代码：`trigger: { source: "damageBegin1" }`

**damageBegin2** — 转化阶段
- 将普通伤害转化为其他形式的伤害或效果
- 示例：`_kamisha` 技能将伤害改为减少体力上限
- 代码：`trigger: { source: "damageBegin2" }`

**damageBegin3** — 减伤阶段
- 受伤者的防御技能在此阶段减少 `event.num`
- 示例：护甲减伤、藤甲、八卦阵
- 代码：`trigger: { player: "damageBegin3" }`

**damageBegin4** — 最终锁定阶段
- 伤害值已不可再被修改，用于最终锁定
- 常配合 `lastDo: true` 确保在最后执行
- 示例：战法 `zf_hengfeng` 强制锁定伤害值为 2
- 代码：`trigger: { source: "damageBegin4", lastDo: true }`

> **注意：**
> - `damageBegin1` 和 `damageBegin2` 通常绑定 `source`（伤害来源方技能加伤）
> - `damageBegin3` 通常绑定 `player`（受伤方技能减伤）
> - `damageBegin4` 两者皆可，用于最终兜底
> - 如果需要同时监听 `source` 和 `player` 两个触发对象，可以写成：
>   ```javascript
>   trigger: { player: "damageBegin3", source: "damageBegin1" }
>   ```
>   然后在 `filter` 或 `content` 中通过 `name` 参数区分：
>   ```javascript
>   filter(event, player, name) {
>       if (name == "damageBegin1") { /* 加伤逻辑 */ }
>       if (name == "damageBegin3") { /* 减伤逻辑 */ }
>   }
>   ```

***

## 6. 自定义卡牌创建

> **本章讲解如何创建自定义卡牌，包括基本牌、锦囊牌、装备牌等。**

### 6.1 卡牌定义结构

```javascript
card: {
    card: {
        customCard: {
            type: "trick",              // 卡牌类型：basic/trick/equip
            subtype: "trick",           // 子类型
            fullskin: true,             // 是否有完整皮肤
            name: "自定义牌",            // 卡牌名称
            range: { global: 1 },       // 距离限制
            targetprompt: ["目标1", "目标2"],  // 目标提示
            audio: "default",           // 音效
            enable: function () { return true; },  // 启用条件
            filterTarget: function (card, player, target) {
                return target !== player;
            },
            content: function () {
                "step 0";
                target.damage(1);
            },
            ai: {
                order: 6,
                result: {
                    target: -1,
                },
            },
        },
    },
    translate: {
        customCard: "自定义牌",
        customCard_info: "对一名其他角色造成1点伤害。",
    },
    list: [
        ["heart", 1, "customCard"],
        ["heart", 2, "customCard"],
        ["diamond", 3, "customCard"],
    ],
},
```

### 6.2 装备牌创建

```javascript
card: {
    card: {
        customWeapon: {
            type: "equip",
            subtype: "equip1",          // equip1=武器 equip2=防具 equip3=坐骑
            fullskin: true,
            name: "自定义武器",
            distance: { attackFrom: -1 },  // 攻击距离-1
            skills: ["customWeapon_skill"],  // 装备后获得的技能
            // 或使用 mod 直接定义效果
            mod: {
                cardUsable(card, player) {
                    if (card.name === "sha") {
                        return Infinity;  // 杀无使用次数限制
                    }
                },
            },
            ai: {
                equipValue: 5,
            },
        },
    },
    translate: {
        customWeapon: "自定义武器",
        customWeapon_info: "攻击范围：1。杀无使用次数限制。",
    },
    list: [
        ["spade", 5, "customWeapon"],
    ],
},
```

### 6.3 卡牌列表格式

```javascript
list: [
    // [花色, 点数, 卡牌名]
    ["heart", 1, "sha"],        // 红桃A杀
    ["diamond", 13, "sha"],     // 方块K杀
    ["spade", 7, "shan"],       // 黑桃7闪
    ["club", 2, "shan"],        // 梅花2闪
    // 自定义卡牌
    ["heart", 5, "customCard"],
    ["diamond", 6, "customCard"],
],
```

**花色标识：**

| 标识 | 花色 |
|------|------|
| `heart` | 红桃 |
| `diamond` | 方块 |
| `spade` | 黑桃 |
| `club` | 梅花 |
| `none` | 无花色 |

***

## 7. 动画与音效系统

> **本章讲解技能动画、卡牌特效、音效播放等视觉听觉效果的实现。**

### 7.1 音效配置

> 音效格式的完整规范参考 [audio-guide.md](../../../../noname/docs/audio-guide.md)

#### 基础用法

以下以技能 `wusheng` 为例，默认路径为 `skill/`。

| audio 值 | 含义 | 解析结果 |
|----------|------|----------|
| `false` | 不播放语音 | 无 |
| `true` | 播放默认路径下与技能名一致的音频 | `["skill/wusheng.mp3"]` |
| 数字（如 `2`） | 播放默认路径下以数字做后缀的音频 | `["skill/wusheng1.mp3", "skill/wusheng2.mp3"]` |
| 字符串引用（如 `"paoxiao"`） | 播放对应引用技能或角色的音频 | `["skill/paoxiao1.mp3", "skill/paoxiao2.mp3"]` |

#### 指定路径播放

| audio 值 | 含义 | 解析结果 |
|----------|------|----------|
| `"ext:无名扩展/audio/wusheng_custom.mp3"` | 直接按指定路径播放 | `["ext:无名扩展/audio/wusheng_custom.mp3"]` |
| `"ext:无名扩展/audio:true:mp3"` | 播放指定路径下与技能名一致的音频 | `["ext:无名扩展/audio/wusheng.mp3"]` |
| `"ext:无名扩展/audio:2"` | 播放指定路径下以数字后缀命名的音频 | `["ext:无名扩展/audio/wusheng1.mp3", "ext:无名扩展/audio/wusheng2.mp3"]` |

**注意：** 在 `路径 + true` 和 `路径 + 数字` 格式中，路径与 `true` 或数字之间使用的是 `:` 不是 `/`，`true` 或数字与文件类型之间也是用 `:` 不是 `.`。若后缀为 `:mp3`，可以省略。

#### 高级组合播放

| audio 值 | 含义 | 解析结果 |
|----------|------|----------|
| `["paoxiao", 1]` | 播放引用的技能音频，限制播放前1个 | `["skill/paoxiao1.mp3"]` |
| `["paoxiao", "ext:无名扩展/audio:true"]` | 组合使用多种格式 | `["skill/paoxiao1.mp3", "skill/paoxiao2.mp3", "ext:无名扩展/audio/wusheng.mp3"]` |

#### 角色专属语音

- **`audioname`**：角色名后缀数组，为特定角色提供专属语音：
  `audio: 2, audioname: ["zhangfei"]` → 张飞使用: `["skill/wusheng_zhangfei1.mp3", "skill/wusheng_zhangfei2.mp3"]`
- **`audioname2`**：键值对映射，为不同角色指定新的 `audio` 配置：
  `audio: 2, audioname2: { zhangfei: "ext:无名扩展/audio:true" }` → 张飞使用: `["ext:无名扩展/audio/wusheng.mp3"]`

#### 阵亡语音

```javascript
// 方式一：Character实例的dieAudios属性
lib.character.guanyu.dieAudios = [true, "ext:无名扩展/audio/die:true"];
// 方式二：Character数组形式中填写 "die:xxx"
guanyu: ["male", "shu", 4, ["wusheng"], ["die:true", "die:ext:无名扩展/audio/die:true"]]
```

阵亡音频默认路径为 `die/`，默认值为 `true`（即 `["die/[角色名].mp3"]`）。台词配对格式为 `#[音频地址]:die`。

**音效文件默认路径：** 技能音频：`audio/skill/`，阵亡音频：`audio/die/`（扩展内 `extension/扩展名/audio/`）

### 7.2 卡牌动画

**卡牌移动动画：**

```javascript
// 展示卡牌
player.$throw(cards, 1000);  // 1000毫秒动画

// 获得卡牌动画
player.$gain(card, true);  // true表示有动画
player.$gain2(cards, true);

// 失去卡牌动画
player.$lose(cards, 1000);

// 弹出卡牌
player.$cardPopup(card);
```

**自定义动画效果：**

```javascript
async content(event, trigger, player) {
    // 创建临时对话框显示卡牌
    const dialog = ui.create.dialog("技能效果", cards);
    
    // 等待动画
    await game.delayx(2);  // 等待2秒
    
    // 关闭对话框
    dialog.close();
    
    // 执行效果
    await player.draw(cards.length);
},
```

### 7.3 技能特效

**全屏特效：**

```javascript
async content(event, trigger, player) {
    // 全屏闪光
    game.broadcastAll(() => {
        const effect = ui.create.div(".effect");
        effect.style.background = "linear-gradient(45deg, #ff0000, #ffff00)";
        effect.style.animation = "flash 1s";
        setTimeout(() => effect.remove(), 1000);
    });
    
    await game.delayx();
    await player.draw(3);
},
```

**目标特效：**

```javascript
async content(event, trigger, player) {
    const target = event.targets[0];
    
    // 目标身上显示特效
    target.$skill("技能名", "extension/扩展名/image/effect.gif");
    
    await game.delayx();
    await target.damage(1);
},
```

### 7.4 日志与提示

**自定义日志样式：**

```javascript
// 带颜色的日志
game.log(player, "#y发动了", "#g〖技能名〗");

// 颜色代码：
// #r - 红色
// #g - 绿色
// #b - 蓝色
// #y - 黄色
// #p - 紫色

// 多参数日志
game.log(player, "将", cards, "当作", get.translation("sha"), "使用");
```

**弹出提示：**

```javascript
// 弹出技能名提示
player.popup("技能名");

// 弹出卡牌名
player.popup("杀", "fire");

// 自定义弹出
player.popup("自定义文字", "wood");
```

***

## 8. 触发器（Trigger）

### 8.1 完整触发时机列表

#### 回合流程阶段（按执行顺序）

```javascript
// 回合开始
{ global: "roundStart" }            // 每轮开始（每回合第一个事件）
{ player: "phaseBefore" }          // 阶段开始前（进入任意阶段前触发）
{ player: "phaseBeforeStart" }     // 阶段前-开始
{ player: "phaseBeforeEnd" }       // 阶段前-结束
{ global: "phaseAfter" }           // 阶段结束后（离开任意阶段后触发）

// 准备阶段
{ player: "phaseZhunbei" }         // 准备阶段

// 判定阶段
{ player: "phaseJudge" }           // 判定阶段

// 摸牌阶段
{ player: "phaseDraw" }            // 摸牌阶段
{ player: "phaseDrawBegin1" }      // 摸牌阶段开始1
{ player: "phaseDrawBegin2" }      // 摸牌阶段开始2

// 出牌阶段
{ player: "phaseUseBefore" }       // 出牌阶段前
{ player: "phaseUse" }             // 出牌阶段
{ player: "phaseUseBegin" }        // 出牌阶段开始
{ player: "phaseUseEnd" }          // 出牌阶段结束
{ player: "phaseUseAfter" }        // 出牌阶段后

// 弃牌阶段
{ player: "phaseDiscard" }         // 弃牌阶段

// 结束
{ player: "phaseJieshu" }          // 结束阶段

// 回合结束
{ player: "phaseOver" }            // 回合结束后
{ global: "roundEnd" }             // 每轮结束

// 通用回合事件
{ player: "phaseChange" }          // 回合切换时
{ player: "phaseBeginStart" }      // 回合开始-起始
{ player: "phaseBegin" }          // 当前回合开始时
{ player: "phaseEnd" }            // 当前回合结束时

// 休整
{ player: "rest" }                 // 休整中
{ player: "restEnd" }              // 休整结束
```

#### 卡牌使用相关

```javascript
// 使用卡牌
{ player: "useCard" }             // 使用卡牌时（目标选择前）
{ player: "yingbian" }            // 使用卡牌-应变（如无中生有等）
{ player: "useCardToPlayer" }     // 使用卡牌指定目标时
{ player: "useCardToTarget" }     // 使用卡牌选择目标时
{ player: "useCardToPlayered" }   // 使用卡牌指定目标后
{ player: "useCardToTargeted" }   // 使用卡牌选择目标后
{ player: "useCardToIgnored" }    // 使用卡牌被无视时
{ player: "useCardToExcluded" }   // 使用卡牌被排除时
{ player: "useCardAfter" }        // 使用卡牌结算完成后
{ player: "useCardEffectEnd" }    // 卡牌效果结算完成时，允许卡牌再次触发结算流程（配合 effectedCount/effectCount 判断）
{ player: "addExtraTarget" }      // 增加额外目标

> `useCardToPlayer`/`useCardToTarget`/`useCardToPlayered`/`useCardToTargeted` 子事件的目标排序已优化，动态增减目标时保持正确顺序。

// 打出/响应卡牌
{ player: "respond" }             // 打出/响应卡牌时
{ player: "chooseToUse" }         // 选择使用时（主动技能）
{ player: "chooseToRespond" }     // 选择响应时（被动技能）
{ player: "useSkill" }            // 发动技能时

// 弃置/失去卡牌
{ player: "discard" }             // 弃置卡牌时
{ player: "loseToDiscardpile" }   // 卡牌弃入弃牌堆时
{ player: "rewriteDiscardResult" }// 重写弃牌结果
{ player: "orderingDiscard" }     // 排序弃牌时

// 获得卡牌
{ player: "gain" }                // 摸牌牌时
{ player: "rewriteGainResult" }   // 重写获得结果
{ player: "gaincardMultiple" }    // 多张获得时

// 装备相关
{ player: "equip" }               // 装备卡牌时
{ player: "replaceEquip" }        // 替换装备时

// 展示卡牌
{ player: "showCards" }           // 展示卡牌时
{ player: "showCardsFixing" }     // 展示卡牌修正时
```

#### 伤害相关

```javascript
{ player: "damageZero" }          // 伤害为0时（被护甲抵消）
{ player: "damage" }              // 受到伤害时
{ player: "damageSource" }        // 造成伤害来源确认
{ player: "changeHp" }            // 体力值变化时
{ player: "dying" }               // 进入濒死状态时
{ player: "die" }                 // 死亡时
{ player: "subPlayerDie" }        // 副角色死亡时
```

#### 判定相关

```javascript
{ player: "judgeBegin" }          // 判定开始前
{ player: "judge" }               // 判定时
{ player: "judgeCallback" }       // 判定回调
{ player: "judgeFixing" }         // 判定结果修正
{ player: "addJudge" }            // 添加判定牌时
```

#### 比较/拼点相关

```javascript
{ player: "compare" }             // 拼点时
{ player: "compareCardShowBefore" }// 拼点展示牌前
{ player: "compareFixing" }       // 拼点结果修正
{ player: "chooseToCompare" }     // 选择拼点时
{ player: "chooseToCompareEnd" }  // 选择拼点结束时
{ player: "chooseToCompareAfter" }// 选择拼点后
{ player: "chooseToCompareLose" } // 拼点失败时
{ player: "compareMultiple" }     // 多人拼点时
```

#### 状态变化相关

```javascript
// 连接/铁索
{ player: "link" }               // 横置/连接状态变化时

// 技能变化
{ player: "changeSkillsBefore" } // 技能变更前
{ player: "changeSkillsBegin" }  // 技能变更开始
{ player: "changeSkillsEnd" }    // 技能变更结束
{ player: "changeSkillsAfter" }  // 技能变更后

// 角色展示
{ player: "showCharacterBegin" } // 展示角色前
{ player: "showCharacterEnd" }   // 展示角色结束
{ player: "showCharacterAfter" } // 展示角色后
{ player: "zhuUpdate" }          // 主角更新时

// 牌堆操作
{ player: "washCard" }           // 洗牌时
{ player: "swapHandcardsx" }     // 交换手牌时

// 赠送/重铸
{ player: "gift" }               // 赠送卡牌时
{ player: "giftDeny" }            // 赠送被拒绝时
{ player: "giftDenied" }         // 赠送已拒绝后
{ player: "giftAccept" }         // 赠送被接受时
{ player: "giftAccepted" }       // 赠送已接受后
{ player: "recast" }             // 重铸时
{ player: "recastingLose" }      // 重铸失去时
{ player: "recastingLost" }      // 重铸已失去后
{ player: "recastingGain" }      // 重铸获得时
{ player: "recastingGained" }    // 重铸已获得后

// 议事
{ player: "debateShowOpinion" }  // 议事展示意见时

// 标记显示
{ player: "addShownCardsAfter" } // 添加明牌后
{ player: "hideShownCardsAfter" }// 隐藏明牌后

// 延迟效果
{ player: "executeDelayCardEffect" } // 执行延迟卡牌效果时

// 无懈可击
{ global: "eventNeutralized" }   // 无懈可击生效时

// 子角色
{ player: "removeSubPlayer" }    // 移除子角色时

// 触发技能
{ player: "triggerHidden" }      // 隐藏触发
{ player: "triggerInvisible" }   // 不可见触发
{ player: "triggerAfter" }       // 触发后

// 进入游戏
{ player: "enterGame" }          // 进入游戏时
```

### 8.2 触发器执行顺序

使用 `firstDo: true` 控制子技能在主技能之前执行：

```javascript
pre: {
    firstDo: true,  // 在主技能filter检查之前执行
    trigger: { player: "useCardAfter" },
    async content() {
        // 记录数据
    },
},
```

> firstDo 详细用法与执行顺序陷阱见附录3.3

### 8.2.1 多触发时机技能：使用 `event.triggername` 区分触发来源

当一个技能有多个触发时机（如 `trigger: { player: "damageEnd", source: "damageSource", global: "dying" }`），需要区分具体是哪个时机触发的，使用 `event.triggername`。

```javascript
skillName: {
    trigger: {
        player: "damageEnd",
        source: "damageSource",
        global: "dying",
    },
    filter(event, player, name) {
        // name 就是触发时机名称（如 "damageEnd", "damageSource", "dying"）
        const triggers = player.getStorage("skillName_triggers", []);
        if (!triggers.includes(name)) return false;
        // 其他过滤条件...
        return true;
    },
    async content(event, trigger, player) {
        // event.triggername 获取触发时机名称
        const name = event.triggername;
        // 根据不同触发时机执行不同逻辑
        if (name === "damageSource") {
            // 造成伤害后的逻辑
        } else if (name === "damageEnd") {
            // 受到伤害后的逻辑
        } else if (name === "dying") {
            // 濒死状态的逻辑
        }
    },
},
```

**关键点**：

| 属性/参数 | 说明 |
|------|------|
| `event.triggername` | 在 `content` 中获取触发时机名称 |
| `filter(event, player, name)` | `name` 参数就是触发时机名称 |
| 多触发时机 | 使用对象格式 `trigger: { player: "xxx", source: "yyy", global: "zzz" }` |

### 8.3 player 与 global 区别

```
| 类型 | 说明 |
|------|------|
| `player` | 仅当**当前玩家**满足条件时触发 |
| `global` | **任意玩家**满足条件时都触发 |
```

## 9. 卡牌操作

### 9.1 获取卡牌

```javascript
// 获取手牌
player.getCards("h")
player.getCards("h", filterFunction)

// 获取所有手牌和装备区的牌
player.getCards("hes", filterFunction)

// 获取装备区牌
player.getCards("e")

// 判定区牌
player.getCards("j")

// 获取弃牌堆中的牌
get.discarded()                    // 获取弃牌堆所有牌
get.discarded().filter(card => ...) // 过滤弃牌堆中的牌
get.discarded().filterInD("d")     // 只获取在弃牌堆中的牌（排除被获得的）
```

### 9.1.1 异步失去卡牌：使用 `game.loseAsync`

当需要复杂的多角色卡牌转移（如从多个角色处获得牌），使用 `game.loseAsync` 创建异步事件。

```javascript
// 多角色卡牌转移示例
await game.loseAsync({
    cards: gain,                    // 要转移的卡牌列表
    gain_list: [[player, gain]],    // 获得者列表
}).setContent(async function(event) {
    event.type = "gain";
    const { cards, gain_list } = event;
    const position = [],
        [[player]] = gain_list;
    for (let card of cards) {
        position.push(get.position(card, "judge"));
    }
    for (let index of position) {
        const card = cards[index],
            pos = position[index];
        if (["hesx"].includes(pos)) {
            const owner = get.owner(card);
            owner.$giveAuto([card], player);
        } else {
            player.$gain2([card], true);
        }
    }
    await game.delay(0, get.delayx(500, 500));
    await player.gain(cards).set("getlx", false);
    await game.delayx();
});
```

**关键点**：

| 属性 | 说明 |
|------|------|
| `game.loseAsync({ ... })` | 创建异步失去事件 |
| `.setContent(async function(event) { ... })` | 设置自定义内容 |
| `event.type = "gain"` | 设置事件类型 |
| `gain_list` | 获得者列表，格式 `[[player, cards]]` |

### 9.1.2 lose 方法详解

`lose` 方法用于让玩家失去卡牌，支持多种参数配置。

#### 基本用法

```javascript
// 基本失去卡牌
await player.lose(cards);

// 指定失去位置
await player.lose(cards, ui.ordering);        // 失去到处理区
await player.lose(cards, ui.discardPile);     // 失去到弃牌堆
await player.lose(cards, ui.cardPile);        // 失去到牌堆

// 链式调用设置参数
await player.lose(cards, ui.ordering).set("getlx", false);  // 不触发获得事件
await player.lose(cards, ui.cardPile).set("log", false);    // 不记录日志
```

#### 参数说明

| 参数 | 类型 | 说明 |
|------|------|------|
| `cards` | Array | 要失去的卡牌数组 |
| `position` | Object | 失去到的位置（ui.ordering/ui.discardPile/ui.cardPile） |
| `getlx` | Boolean | 是否触发获得事件，默认 true |
| `log` | Boolean | 是否记录日志，默认 true |

#### 使用场景

**场景1：响应牌打出**

```javascript
// 南蛮入侵、决斗等响应场景
if (actualCards.length > 0) {
    await trigger.player.lose(actualCards, ui.ordering).set("getlx", false);
}
```

**场景2：弃牌阶段**

```javascript
// 弃牌到弃牌堆
await player.lose(cards, ui.discardPile);
```

**场景3：牌堆顶操作**

```javascript
// 将牌置于牌堆顶
await player.lose(cards, ui.ordering);
await game.cardsGotoPile(cards, "insert");
```

### 9.1.3 loseToDiscardpile 方法

直接将卡牌失去到弃牌堆的简化方法。

```javascript
// 基本用法
await player.loseToDiscardpile(cards);

// 从标记区弃牌
const cards = player.getExpansions("skillName");
if (cards.length) {
    await player.loseToDiscardpile(cards);
}
```

#### 与 lose 方法的区别

| 方法 | 目标位置 | 是否触发事件 | 适用场景 |
|------|---------|-------------|---------|
| `lose(cards, ui.discardPile)` | 弃牌堆 | 可配置 | 需要精细控制 |
| `loseToDiscardpile(cards)` | 弃牌堆 | 自动触发 | 简单弃牌 |

### 9.1.4 getExpansions 方法

获取武将牌上的标记卡牌（Expansion）。

```javascript
// 获取指定标记的卡牌
const cards = player.getExpansions("skillName");

// 获取并处理
const cards = player.getExpansions("aplxiongye");
if (cards.length) {
    // 使用标记区的牌
    for (const card of cards) {
        if (card.name === "tao") return true;
    }
}
```

#### 配合 addToExpansion 使用

```javascript
// 添加卡牌到标记区
const next = player.addToExpansion(cards, player, "give");
next.gaintag.add("skillName");
await next;

// 移除标记区卡牌
const cards = player.getExpansions("skillName");
await player.loseToDiscardpile(cards);
```

### 9.1.5 卡牌失去的错误处理

#### 常见错误类型

| 错误类型 | 原因 | 处理方式 |
|---------|------|---------|
| 卡牌不存在 | cards 为空或 null | 检查 `cards.length > 0` |
| 卡牌位置错误 | 卡牌不在玩家区域 | 使用 `get.position(card)` 验证 |
| 异步未等待 | 未使用 await | 使用 `await player.lose()` |

#### 正确处理示例

```javascript
// 检查卡牌存在
const cards = player.getExpansions("skillName");
if (!cards || cards.length === 0) {
    return;  // 无卡牌，直接返回
}

// 验证卡牌位置
const validCards = cards.filter(card => {
    const pos = get.position(card);
    return pos === "x";  // 确保在标记区
});

if (validCards.length > 0) {
    await player.loseToDiscardpile(validCards);
}

// 异步处理
try {
    await player.lose(cards, ui.ordering).set("getlx", false);
} catch (e) {
    game.log("卡牌失去失败:", e.message);
}
```

### 9.2 卡牌标记（Gaintag）

```javascript
// 添加标记
card.addGaintag(["标记名", `标记名（描述）`])

// 移除标记
card.removeGaintag("标记名")

// 检查标记
card.hasGaintag("标记名")
```

> **注意：** 移除 gaintag 后对应的 mark 标记会自动消除，不需要手动清理。详见附录4.3b

### 9.3 永久卡牌标记（eternal_ 前缀）

`addGaintag` 添加的普通标记在卡牌移动（使用、弃置、获得等）后会丢失。若需要标记**跨区域永久保留**，需使用 `eternal_` 前缀的 gaintag。

#### 原理

无名杀内置了永久标记机制：以 `eternal_` 开头的 gaintag 会自动成为永久标记，无论卡牌进入哪个区域（手牌、弃牌堆、牌堆、武将牌上）都不会丢失。

#### 实现模式

```javascript
skillName: {
    async content(event, trigger, player) {
        const cards = player.getCards("h"); // 或其他卡牌来源
        // 使用 eternal_ 前缀添加永久标记
        player.addGaintag(cards, "eternal_skillName_tag");
        // 可以同时添加多个标记（永久标记 + 显示标记）
        player.addGaintag(cards, ["eternal_skillName_tag", "显示名", "其他标记"]);
    },
    mod: {
        // 直接检查永久标记
        ignoredHandcard(card, player) {
            if (card.hasGaintag("eternal_skillName_tag")) {
                return true;
            }
        },
    },
},
```

#### 关键点

| 要点 | 说明 |
|------|------|
| `eternal_` 前缀 | 无名杀内置的永久标记机制 |
| `player.addGaintag(cards, "eternal_xxx")` | 添加永久标记 |
| `card.hasGaintag("eternal_xxx")` | 检查永久标记（跨区域有效） |
| 无需 `card.storage` | 不需要额外的 storage 存储 |
| 无需 retag 子技能 | 永久标记自动保留，无需重新添加 |

#### 检查永久标记

```javascript
// ✅ 正确：检查 eternal_ 前缀的 gaintag（永久有效）
card.hasGaintag("eternal_skillName_tag")

// ❌ 不可靠：检查普通 gaintag（可能丢失）
card.hasGaintag("skillName_tag")

// ✅ 可选：同时添加显示标记方便查看
player.addGaintag(cards, ["eternal_skillName_tag", "显示名"]);
// 检查时使用永久标记
card.hasGaintag("eternal_skillName_tag")
```

#### 示例：从弃牌堆回收永久标记卡牌

```javascript
restore: {
    trigger: { player: "phaseZhunbeiBegin" },
    filter(event, player) {
        // 检查弃牌堆中是否有永久标记卡牌
        return Array.from(ui.discardPile.childNodes).some(card => 
            card.hasGaintag("eternal_skillName_tag")
        );
    },
    forced: true,
    async content(event, trigger, player) {
        // 从弃牌堆获取永久标记卡牌
        const cards = Array.from(ui.discardPile.childNodes).filter(card => 
            card.hasGaintag("eternal_skillName_tag")
        );
        await player.gain(cards, "gain2");
    },
},
```

**参考技能：** 势曹爽【奢权】(`mbshequan`，使用 `eternal_mbshequan`)、荟萃包大乔【绮琴】(`dcqiqin`，使用 `eternal_dcqiqin_tag`)

### 9.4 随机选牌：使用 `randomGets` 替代手动 shuffle

**【强制】** 需要从手牌中随机选取指定数量的牌时，使用内置的 `randomGets` 方法，不要手动 `sort` 随机。

```javascript
// ✅ 正确：使用内置 randomGets 方法
const cards = player.getCards('h', card => {
    return get.is.damageCard(card) || get.tag(card, 'recover');
}).randomGets(num);
if (cards.length > 0) player.addGaintag(cards, event.name);

// ❌ 错误：手动 sort 随机（分布不均匀，且代码冗长）
const cards = player.getCards('h', card => { ... });
const selected = [];
const shuffled = cards.slice().sort(() => Math.random() - 0.5);
for (let i = 0; i < Math.min(X, shuffled.length); i++) {
    selected.push(shuffled[i]);
}
```

### 9.5 gaintag 标记：用技能名作为标记名，批量添加

**【强制】** 添加 gaintag 时使用技能名（`event.name`）作为标记名，使用 `player.addGaintag(cards, tag)` 批量添加，不要逐张添加。

```javascript
// ✅ 正确：用 event.name（技能名）作为 gaintag，player.addGaintag 批量添加
player.addGaintag(cards, event.name);  // event.name === 'wechatjueyi'

// ❌ 错误：eternal_ 前缀 + 逐张添加
for (const card of selected) {
    card.addGaintag(['eternal_wechatjueyi']);
}
```

> **说明**：使用技能名作为 gaintag 更清晰，配合 `hasHistory` 检查使用历史（见附录3.5）不需要 `eternal_` 前缀。

## 10. viewAs 虚拟卡牌

### 10.1 基本用法

**函数式viewAs现已支持返回string类型：**

```javascript
// ✅ 正确：返回对象或字符串
viewAs(cards) {
    return { name: "sha" };  // 返回对象
}
viewAs(cards) {
    return "sha";           // 返回字符串（现已支持）
}

// 动态计算参数时推荐使用函数式
viewAs(cards) {
    const cardName = this.cardName || "sha";  // 动态获取
    return { name: cardName };
}
```

> 函数式viewAs的返回值类型是静态viewAs的超集，可用于动态计算参数。

### 10.2 backup 动态生成技能

```javascript
backup(links, player) {
    const cardName = links[0][2];  // 从chooseButton获取选择
    return {
        cardName: cardName,        // 存储到技能中供其他方法使用
        filterCard(card, player) {
            return card.hasGaintag("赋") &&
                   card.storage?.dcfuyue_name === lib.skill.skillName_backup.cardName;
        },
        viewAs(cards) {
            return { name: lib.skill.skillName_backup.cardName };
        },
    };
}
```

### 10.3 hiddenCard 隐藏卡牌

```javascript
hiddenCard(player, name) {
    const cards = player.getCards("hes", card => /* 条件 */);
    return cards.some(card => card.storage?.customName === name);
}
```

**重要：** 用于无懈可击等响应询问，告诉系统玩家可以视为使用该牌。

> hiddenCard + respondXxx + skillTagFilter 配合使用详见附录3.4

### 10.4 viewAs + precontent 配合使用

当需要实现"视为使用牌"并在使用前执行自定义逻辑（如摸牌、展示、判断等），使用 `viewAs` + `precontent` 配合。

**适用场景：**
- 需要在牌使用前执行复杂流程（如摸牌、展示、判断成功/失败）
- 需要根据流程结果决定是否真正使用牌
- 响应场景（如无懈可击）需要引擎自动处理目标选择

**实现模式：**

```javascript
chooseButton: {
    dialog(event, player) {
        const list = get.inpileVCardList(info => {
            // 过滤条件
            return true;
        });
        return ui.create.dialog("选择要使用的牌", [list, "vcard"]);
    },
    backup(links, player) {
        const name = links[0][2];
        const nature = links[0][3];
        return {
            filterCard: () => false,    // 不需要实际卡牌
            selectCard: -1,
            viewAs: { name: name, nature: nature, isCard: true },  // 虚拟牌
            selectTarget: -1,
            async precontent(event, trigger, player) {
                // 在牌使用前执行自定义逻辑
                const cardName = event.result.card.name;
                
                // 执行流程（如摸牌、展示、判断）
                await player.draw(2);
                const result = await player.chooseButton(["选择展示的牌", player.getCards("h")], true, 2).forResult();
                
                // 判断成功/失败
                if (!result?.links?.length) {
                    // 失败：取消牌的使用
                    event.result.bool = false;
                    return;
                }
                
                // 成功：继续使用牌（engine 自动处理）
                game.log(player, "流程成功，视为使用【" + get.translation(cardName) + "】");
            },
        };
    },
},
```

**关键点：**

| 属性/方法 | 说明 |
|------|------|
| `viewAs: { name, nature, isCard: true }` | 返回虚拟牌对象，`isCard: true` 表示不对应实际卡牌 |
| `filterCard: () => false` | 不需要实际卡牌作为代价 |
| `selectCard: -1` | 不选择卡牌 |
| `precontent(event, trigger, player)` | 在牌使用前执行的回调 |
| `event.result.bool = false` | 取消牌的使用（流程失败时） |
| `event.result.card.name` | 获取 viewAs 返回的牌名 |

**与 content 的区别：**

| 回调 | 执行时机 | 用途 |
|------|----------|------|
| `precontent` | 牌使用前（目标选择后） | 执行前置流程，可取消使用 |
| `content` | 牌使用后（效果结算时） | 执行牌的额外效果 |

**取消牌使用的场景：**

```javascript
async precontent(event, trigger, player) {
    // 流程失败时取消牌使用
    if (failed) {
        event.result.bool = false;  // 取消使用
        return;
    }
    // 流程成功则继续使用（无需额外操作）
}
```

### 10.5 虚拟牌对象 `isCard: true`

当 `viewAs` 返回的牌不对应任何实际卡牌时，使用 `isCard: true` 属性。

**作用：**
- 表示这是一张虚拟牌，不消耗实际卡牌
- 响应场景（如无懈可击）时，不会将展示的牌当作实际牌使用

**实现方式：**

```javascript
viewAs: { name: "sha", isCard: true }  // 虚拟杀，不消耗实际牌
viewAs: { name: "wuxie", isCard: true }  // 虚拟无懈可击
```

**与普通 viewAs 的区别：**

| 类型 | 说明 | 实际牌消耗 |
|------|------|-----------|
| `viewAs: { name: "sha" }` | 普通虚拟牌 | 可能消耗 filterCard 选中的牌 |
| `viewAs: { name: "sha", isCard: true }` | 纯虚拟牌 | 不消耗任何实际牌 |

**适用场景：**
- 技能不需要实际卡牌作为代价（如神计）
- 响应场景需要"视为使用"但不消耗牌（如无懈可击）

## 11. chooseButton 选择界面

> chooseButton + backup 替代 chooseControl 的规范详见附录13.3

### 11.1 基本结构

```javascript
chooseButton: {
    dialog(event, player) {
        // 创建选项列表
        const list = [["类别", "", "牌名"]];  // vcard格式
        return ui.create.dialog("标题", [list, "vcard"]);
    },
    filter(button, player) {
        // 过滤可用选项
        return true;
    },
    check(button) {
        // AI评估选项价值
        return 1;
    },
    backup(links, player) {
        // 根据选择生成临时技能
        const selected = links[0][2];
        return { /* 技能对象 */ };
    },
    prompt(links, player) {
        // 提示文字
        return "选择目标";
    },
}
```

### 11.2 vcard 格式

```javascript
["", "", "sha"]           // 基本牌
["锦囊", "", "wuxie"]     // 锦囊牌（指定类别）
["基本", "", "sha"]       // 基本牌（指定类别）
["装备", "", "zhuangque"] // 装备牌
```

### 11.3 响应牌使用机制详解

响应牌指非出牌阶段使用的牌，包括南蛮入侵求杀、决斗求杀/闪、濒死求桃/酒、无懈可击等场景。

#### 11.3.1 enable 字段配置

```javascript
enable: "phaseUse"                      // 仅出牌阶段
enable: ["chooseToRespond"]             // 仅响应场景（打出）
enable: ["chooseToUse"]                 // 仅使用场景（濒死求桃、借刀杀人）
enable: ["phaseUse", "chooseToUse", "chooseToRespond"]  // 全场景
```

**场景区分**：
- `phaseUse`：出牌阶段主动使用，需选择目标
- `chooseToUse`：濒死求桃、借刀杀人等，需选择特定目标
- `chooseToRespond`：南蛮入侵、决斗等，无需选择目标

#### 11.3.2 selectTarget 字段配置

```javascript
backup(links, player) {
    const evt = get.event().getParent();
    const isRespond = evt?.name !== "phaseUse";
    return {
        selectTarget: isRespond ? -1 : undefined,  // 响应场景：-1，主动使用：undefined
    };
}
```

**selectTarget 值**：
- `-1`：不需要目标
- `1`：必须选择1个目标
- `[1, 2]`：选择1-2个目标
- `undefined`：使用卡牌默认规则

#### 11.3.3 filterTarget 字段配置

```javascript
filterTarget(card, player, target) {
    const evt = get.event();
    if (card.name === "tao" && evt.dying) return target === evt.dying;
    if (card.name === "jiu") return evt.dying ? target === evt.dying : target === player;
    if (card.name === "tiesuo") return target !== player && target.countCards("he") > 0;
    return lib.filter.filterTarget(card, player, target);
}
```

#### 11.3.4 chooseButton.filter 过滤

```javascript
filter(button, player) {
    const name = button.link[2];
    const evt = _status.event.getParent();
    if (evt && evt.filterCard) {
        return evt.filterCard(get.autoViewAs({ name }, "unsure"), player, evt);
    }
    return player.hasUseTarget({ name });
}
```

#### 11.3.5 hiddenCard 配置

```javascript
hiddenCard(player, name) {
    const info = get.info({ name });
    if (info?.type === "delay" || info?.type === "equip") return false;
    return true;
}
```

#### 11.3.6 AI 配置

```javascript
ai: {
    order: 10,
    respondSha: true,      // 可打出杀
    respondShan: true,     // 可打出闪
    respondWuxie: true,    // 可使用无懈可击
    save: true,            // 可救人
}
```

#### 11.3.7 技能类型与案例

| 类型 | selectTarget | chooseButton | 案例 |
|------|--------------|--------------|------|
| 简单 viewAs | 不设置 | 不使用 | 武圣、龙胆、倾国、急救 |
| 属性选择 | 不设置 | 使用 | mbwusheng |
| 牌名选择 | 需判断 | 使用 | 神计、雄野、灵缰 |

**简单 viewAs 案例**：

```javascript
wusheng: {
    enable: ["chooseToRespond", "chooseToUse"],
    filterCard: card => get.color(card) === "red",
    viewAs: { name: "sha" },
    ai: { respondSha: true },
}
```

**复杂 chooseButton 案例**：

```javascript
backup(links, player) {
    const evt = get.event().getParent();
    const isRespond = evt?.name !== "phaseUse";
    const isDying = evt?.dying != null;
    return {
        filterCard: () => false,
        selectCard: -1,
        selectTarget: isRespond ? -1 : undefined,
        viewAs: { name: links[0][2] },
    };
}
```

#### 11.3.8 响应场景分类

| 场景 | enable | 需要目标 | selectTarget |
|------|--------|---------|--------------|
| 南蛮入侵/决斗 | chooseToRespond | 不需要 | -1 |
| 濒死求桃 | chooseToUse | 需要（濒死者） | 1 |
| 借刀杀人 | chooseToUse | 需要（指定目标） | 1 |
| 出牌阶段 | phaseUse | 需要（正常选择） | undefined |

#### 11.3.9 常见错误

**错误1：响应场景需选择目标**

```javascript
// 错误
selectTarget: undefined,

// 正确
const isRespond = evt?.name !== "phaseUse";
selectTarget: isRespond ? -1 : undefined,
```

**错误2：未处理濒死场景**

```javascript
// 错误
filterTarget: (card, player, target) => lib.filter.filterTarget(card, player, target),

// 正确
filterTarget(card, player, target) {
    if (card.name === "tao" && get.event().dying) return target === get.event().dying;
    return lib.filter.filterTarget(card, player, target);
}
```

**错误3：未区分场景过滤**

```javascript
// 错误
filter: button => player.hasUseTarget({ name: button.link[2] }),

// 正确
filter(button, player) {
    const evt = _status.event.getParent();
    if (evt?.filterCard) return evt.filterCard(get.autoViewAs({ name: button.link[2] }, "unsure"), player, evt);
    return player.hasUseTarget({ name: button.link[2] });
}
```

#### 11.3.10 特殊交互

**无懈可击**：

```javascript
if (evt.type === "wuxie") return name === "wuxie";
```

**杀次数限制**：

```javascript
if (name === "sha" && event.name === "phaseUse") {
    if (player.getStat()?.card?.sha > 0 && player.getCardUsable({ name: "sha" }) === 0) return false;
}
```

#### 11.3.11 最佳实践

1. 简单 viewAs 技能：不处理 selectTarget
2. 复杂 chooseButton 技能：必须判断响应场景
3. filterTarget：处理桃、酒、铁索连环等特殊牌
4. AI 标签：根据可响应的牌类型添加对应标签

## 12. 玩家交互方法

### 12.1 chooseControl 选择控制

```javascript
const result = await player
    .chooseControl(["选项1", "选项2"])
    .set("prompt", "提示文字")
    .set("ai", () => "选项1")  // AI选择逻辑
    .forResult();

if (result.control === "选项1") {
    // 处理选项1
}
```

> 详细规则与联机适配见附录2.1

### 12.2 chooseCard 选择卡牌

```javascript
const result = await player
    .chooseCard({
        position: "h",              // 位置：h=手牌 e=装备 j=判定
        selectCard: [1, 2],         // 选择数量范围
        filterCard(card) {          // 过滤条件
            return !card.hasGaintag("赋");
        },
        prompt: "提示文字",
    })
    .set("ai", card => get.value(card))  // AI选牌优先级
    .forResult();

if (result.bool && result.cards?.length) {
    // 使用选中的牌
}
```

> 详细规则见附录2.2

### 12.2.1 多玩家同时选择：使用 `game.chooseAnyOL`

> `chooseCardOL`/`chooseButtonOL` 已异步化，联机选择流程使用 `await` 等待结果（非回调模式）。

当需要让多个玩家**同时**进行选择（如让所有其他角色同时选择一张牌），使用 `game.chooseAnyOL`。

```javascript
// 让多个玩家同时选择卡牌
const targets = game.filterPlayer(cur => cur !== player && cur.isIn());
const map = await game.chooseAnyOL(targets, get.info(event.name).chooseCard, []).forResult();

// 处理每个玩家的选择结果
for (const target of targets) {
    const result = map.get(target);
    if (result?.bool && result.cards?.length) {
        target.addGaintag(result.cards, "eternal_skillName_tag");
    }
}

// chooseCard 函数定义（作为技能属性）
chooseCard(player, eventId) {
    return player
        .chooseCard({
            prompt: "选择一张手牌标记",
            forced: true,
            position: "h",
            selectCard: 1,
            filterCard(card) {
                return !card.hasGaintag("eternal_skillName_tag");
            },
        })
        .set("ai", card => -get.value(card))
        .set("id", eventId)
        .set("_global_waiting", true);  // 联机等待标志
},
```

**关键点**：

| 属性/方法 | 说明 |
|------|------|
| `game.chooseAnyOL(targets, chooseFunc, args)` | 让多个玩家同时选择 |
| `targets` | 目标玩家列表 |
| `chooseFunc` | 选择函数，定义在技能属性中 |
| `.forResult()` | 返回 Map，key 为玩家，value 为结果 |
| `_global_waiting: true` | 联机等待标志，确保所有玩家完成选择 |

**优势**：
- 多玩家**同时**选择，而非依次选择（节省时间）
- 联机兼容性好
- 返回 Map 结构，方便遍历结果

### 12.3 chooseTarget 选择目标

**推荐使用对象参数形式**（统一参数格式，更清晰易读）：

```javascript
const result = await player
    .chooseTarget({
        prompt: get.prompt(event.skill),      // 提示文本
        prompt2: "详细说明文字",               // 详细说明（可选）
        selectTarget: [1, Infinity],          // 目标数量范围：[min, max] 或具体数字
        filterTarget(card, player, target) {  // 目标筛选条件
            return target !== player && target.isAlive();
        },
        ai(target) {                          // AI评估函数
            const player = get.player();
            return -get.attitude(player, target);
        },
    })
    .forResult();

if (result?.bool && result.targets?.length) {
    // 使用选中的目标
    for (const target of result.targets) {
        await target.damage(1, player);
    }
}
```

**参数说明**：

| 属性 | 类型 | 说明 |
|------|------|------|
| `prompt` | string | 主提示文本 |
| `prompt2` | string | 详细说明文本（可选） |
| `selectTarget` | number \| [min, max] | 目标数量范围，默认为 1 |
| `filterTarget` | function | 目标筛选函数，返回 boolean |
| `ai` | function | AI评估函数，返回数值（越大越优先） |
| `multitarget` | boolean | 是否允许多目标选择 |

**旧形式（位置参数）→ 新形式（对象参数）对照**：

```javascript
// ❌ 旧形式：位置参数（不推荐）
const result = await player.chooseTarget(
    [0, targets.length],                          // 参数1：数量范围
    "【技能名】选择令任意名角色摸两张牌",           // 参数2：提示文本
    (card, player, target) => targets.includes(target)  // 参数3：筛选函数
).set("multitarget", true).forResult();

// ✅ 新形式：对象参数（推荐）
const result = await player.chooseTarget({
    selectTarget: [0, targets.length],
    prompt: "【技能名】选择令任意名角色摸两张牌",
    filterTarget(card, player, target) {
        return targets.includes(target);
    },
    multitarget: true,
}).forResult();
```

### 12.4 获得卡牌

```javascript
await player.gain(cards, "gain2");  // gain2=从牌堆获得并展示
await player.gain(cards, "log");    // log=获得但不展示来源
```

> `gain`/`gaincardMultiple`/`addToExpansion` 动画处理已统一，支持传入自定义动画函数 `(event, card, target) => Promise<void>`。

> 详细规则（必须 `await`、自带 log 无需额外 `game.log`）见附录2.3

## 13. Mark 标记系统

### 13.1 定义Mark

无名杀本体的标准写法是：**标记名就是技能名**，标记显示配置放在该技能对象上。对通过 `addMark` 管理的数字标记，主技能直接定义 `marktext` 和 `intro` 即可；本体技能通常不强制显式写 `mark: true`。

```JavaScript
skillName: {
    marktext: "标记文字",  // 显示在角色旁的文字，通常不超过2个字
    intro: {
        name: "标记名称",
        content: "mark",    // 内置模板：显示 storage 中的标记数量
    },
}
```

`intro` 中的 `content` 和 `mark` 是二选一：`content` 使用内置文本模板，`mark(dialog, storage, player)` 用于自定义对话框内容；同时定义时引擎优先执行 `mark` 函数。

本体参考：`character/bingshi.js` 的 `pothongyi`。它在主技能上定义 `marktext` 和 `intro`，并通过 `player.addMark("pothongyi", num)` 累加标记；主技能的 `subSkill.mark` 只负责触发和累加，不另建不同的标记名。

如果标记由事件持续累加，推荐使用主技能标记加计数子技能：

```JavaScript
skillName: {
    marktext: "记",
    intro: {
        name: "记录",
        content: "mark",
    },
    group: ["skillName_count"],
    subSkill: {
        count: {
            trigger: { player: "damageEnd" },
            forced: true,
            silent: true,
            popup: false,
            filter(event) {
                return event.num > 0;
            },
            content(event, trigger, player) {
                player.addMark("skillName", 1, false);
            },
        },
    },
},
```

当 `storage` 是数组或对象而不是数字时，应使用 `intro.nocount: true`，或者显式提供 `intro.markcount`：

```JavaScript
skillName: {
    marktext: "记",
    intro: {
        name: "记录",
        mark(dialog, storage, player) {
            const list = player.getStorage("skillName", []);
            dialog.addText(list.length ? "已记录：" + list.join("、") : "暂无记录");
        },
    },
},
```

### 13.2 操作Mark

```javascript
// 数字标记：推荐使用这些 API，会同步 storage 并刷新 UI
player.addMark("skillName", 1, false);
player.setMark("skillName", 3, false);
player.removeMark("skillName", 1, false);
player.clearMark("skillName");

// 数组标记：自动去重并刷新显示
player.markAuto("skillName", [value]);

// 手动刷新已有标记
player.markSkill("skillName");

// 隐藏标记
player.unmarkSkill("skillName");

```

> `markSkill` 只负责创建或刷新显示，不负责数字累加。数字标记优先使用 `addMark`、`setMark`、`removeMark`。

### 13.3 Storage 与 Mark 配合

```javascript
// 推荐：使用 setStorage 同步数据并刷新标记
player.setStorage("skillName", { key: value }, true);

// 数组记录推荐使用 markAuto
player.markAuto("skillName", [value]);

// 若直接修改 storage，必须立即刷新同名标记
player.storage.skillName = { key: value };
player.markSkill("skillName");
```

> Storage 操作规范详见附录4

### 13.4 控制 Mark 数字显示

当技能设置 `mark: true` 且存在 `storage` 时，无名杀会自动在标记右上角显示数字：

- `storage` 为数字时，直接显示该数字
- `storage` 为数组时，显示数组 `length`
- `storage` 为对象时，默认不显示数字

若需要保留 `marktext` 文字标记但**禁止显示右上角数字**，在 `intro` 中设置 `nocount: true`：

```javascript
skillName: {
    mark: true,
    marktext: "劝",
    intro: {
        nocount: true,  // 只显示"劝"，不显示数字
        content(storage, player) {
            // 悬停提示内容
            return "暂无记录";
        },
    },
}
```

> **注意**：即使 `storage` 是对象，如果之前因默认值（如 `getStorage` 返回 `[]`）导致 storage 变成数组，也可能显示异常的 length 数字。应确保使用对象形式存储或使用 `nocount: true` 规避。

### 13.4.1 标记初始化时机

需要在角色进入游戏时获得初始标记时，优先使用本体常见的 `phaseBefore` + `enterGame` 写法，避免只监听 `gameStart` 导致扩展技能注册时机不同而漏触发：

```javascript
skillName: {
    marktext: "记",
    intro: {
        name: "记录",
        content: "mark",
    },
    group: ["skillName_init"],
    subSkill: {
        init: {
            trigger: {
                global: "phaseBefore",
                player: "enterGame",
            },
            forced: true,
            filter(event, player) {
                return !player.hasMark("skillName") && (event.name !== "phase" || game.phaseNumber === 0);
            },
            content(event, trigger, player) {
                player.addMark("skillName", 1);
            },
        },
    },
},
```

### 13.4.2 标记名、技能名与子技能名

- 主技能标记调用 `player.addMark("skillName", num)`，并在主技能上定义 `marktext`、`intro`。
- 子技能标记调用完整名称，例如 `player.addMark("skillName_state", 1)`，并在 `subSkill.state` 中定义显示配置。
- 只写入不存在技能的 storage，或只定义 `marktext` 而没有 `intro`，都可能导致标记不显示。
- 标记达到上限时，在 `filter` 中使用 `player.countMark("skillName")` 判断；上限可通过主技能的 `maxMark()` 统一定义。

### 13.5 主技能标记与状态子技能

**数字资源标记：** 当标记数量就是主技能的资源数量时，`marktext`、`intro` 应直接定义在主技能上，并使用主技能名调用 `addMark`。可显式写 `mark: true`，但本体的数字标记技能通常只写 `marktext` 和 `intro` 即可。

```javascript
// ✅ 正确：主技能直接定义 marktext 和 intro
wechatruping: {
    marktext: '枰',
    intro: {
        content: 'mark',  // 使用内置模板显示标记数
    },
    async content(event, trigger, player) {
        player.addMark('wechatruping', 1, false);
        // ...
    },
}

```

**独立状态标记：** 如果标记属于目标角色、临时状态，或与主技能资源分离，可以定义为 `subSkill`。此时必须使用完整的子技能名调用 API，并且子技能必须有自己的 `mark`、`marktext` 和 `intro`：

```javascript
skillName: {
    subSkill: {
        state: {
            charlotte: true,
            mark: true,
            marktext: "状",
            intro: {
                name: "状态",
                content: "状态持续中",
            },
        },
    },
}

// 对应调用的是 skillName_state，而不是 skillName
player.addSkill("skillName_state");
player.addMark("skillName_state", 1, false);
```

**常见错误：** 只调用 `addMark("skillName_state")`，却没有定义 `skillName_state` 的 `intro`；此时 storage 可能增加，但不会创建可见标记。不要为了显示主技能的数字标记而通过 `addAdditionalSkill` 额外挂载标记子技能。

## 14. Storage 存储系统

> 详细操作规范（初始化、赋值、清理、getStorage/markAuto/setStorage）见附录4

### 14.1 玩家Storage

```javascript
// 初始化（应在 init 中完成，见附录4.2）
player.storage.skillName = { count: 0, data: null };

// 读取（推荐使用 getStorage，见附录4.4）
const storage = player.getStorage("skillName", {});

// 修改后必须重新赋值（见附录4.1）
player.storage.skillName = storage;
```

### 14.2 卡牌Storage

```javascript
card.storage.key = value;
const value = card.storage?.key;
```

### 14.3 清理Storage

```javascript
// 注意：delete 后必须紧跟同 key 的 markSkill/markAuto 才会联机同步（见附录4.7b）
delete player.storage.skillName;
player.markSkill("skillName");

// 或使用 removeStorage（mark=true 时附带 unmarkSkill 清理标记）
player.removeStorage("skillName", true);
```

## 15. AI 配置

> 被动技 check 函数准则详见附录1.7，响应类 AI 标签与 skillTagFilter 详见附录3.4

### 15.1 基本AI属性

```javascript
ai: {
    order: 8,              // 出牌优先级（越大越优先）
    threaten: 1.2,         // 威胁系数
    result: {
        player(player) {   // 对自身的收益评估
            return 5;
        },
        target(player, target) {  // 对目标的收益评估
            return -1;
        },
    },
}
```

### 15.2 响应类AI标签

```javascript
ai: {
    respondSha: true,      // 可以响应杀
    respondShan: true,     // 可以响应闪
    respondWuxie: true,    // 可以响应无懈可击
    save: true,            // 可以救人（桃）
    skillTagFilter(player, tag, arg) {
        // 检查是否拥有对应响应能力
        if (tag === "respondSha") return hasSha;
        if (tag === "respondShan") return hasShan;
        if (tag === "respondWuxie") return hasWuxie;
        return false;
    },
}
```

### 15.3 主动技能AI

```javascript
ai: {
    order: 11,             // 主动技能通常较高（数值越高意向越高）
    result: { player: 1 }, // 正收益鼓励发动
}
```

### 15.4 联机兼容：result 必须使用函数形式传入 player

**【强制】** `ai.result` 中的 `player`/`target` 等评估函数**必须使用函数形式传入 `player` 参数**，不要使用固定值。联机模式下若不传入 `player` 参数会导致报错。

```javascript
// ✅ 正确：result.player 用函数形式，参数中传入 player
ai: {
    order: 6,
    result: {
        player(player) {
            return player.hp - 1;  // 基于当前状态动态返回
        },
    },
}

// ❌ 错误：使用固定值（联机模式下可能报错）
ai: {
    order: 6,
    result: { player: 1 },
}
```

> **说明**：联机模式下引擎会向 `result` 函数注入当前玩家对象，若不使用函数形式则无法获取正确的 player 上下文。使用函数形式后可省略 `check` 函数，引擎根据收益正负自动判断是否发动。

## 16. Mod 修改器

> **属性默认关系：** 添加 `mod` 的技能默认 `forced: true`（进而默认 `locked: true`）。
> 若不需要强制执行，必须显式设 `forced: false`；若不属于锁定技，必须显式设 `locked: false`。

### 16.1 手牌上限修改

```javascript
mod: {
    ignoredHandcard(card, player) {
        // 返回true则该牌不计入手牌上限
        if (card.hasGaintag("赋")) return true;
    },
}
```

### 16.2 弃牌修改

```javascript
mod: {
    cardDiscardable(card, player, name) {
        // 返回false则不能被弃置
        if (name === "phaseDiscard" && card.hasGaintag("赋")) {
            return false;
        }
    },
}
```

> 距离相关 mod（`targetInRange` vs `nodistance`）详见附录13.11

### 16.3 目标限制：用 `playerEnabled` 替代 `targetEnabled`

**【强制】** 限制玩家使用牌的目标时，使用 `playerEnabled` mod（在玩家使用牌时检查目标合法性），不要使用 `targetEnabled`。

```javascript
// ✅ 正确：playerEnabled 在玩家使用牌时检查目标合法性
blocker: {
    mod: {
        playerEnabled(card, player, target) {
            if (card.name !== 'sha' || !game.hasPlayer(target => target.hasSkill('wechatruping_self'))) return;
            if (player.hasMark('wechatruping') && !target.hasMark('wechatruping')) return false;
        },
    },
}

// ❌ 错误：targetEnabled 返回 undefined 和 false 混用，语义不清
mod: {
    targetEnabled(card, player, target) {
        if (card.name !== 'sha') return;
        if (player.countMark('wechatruping') > 0) {
            if (target.countMark('wechatruping') > 0) return;
            return false;
        }
    },
}
```

**说明**：`playerEnabled` 返回 `false` 表示禁止该目标，返回 `undefined` 表示不干预；先检查 `game.hasPlayer(... hasSkill('wechatruping_self'))` 确保技能存在才生效。

## 17. 日志输出

```javascript
game.log(player, "发动了〖技能名〗");
game.log(player, "将", cards, "当作", get.translation("sha"), "使用");
game.log(player, "获得了", ...cards);  // 展开数组参数
```

> 日志规范（不重复logSkill、重铸自带log、中文数字）详见附录12

## 18. 常用工具函数

### 18.1 get 对象

```javascript
get.translation(name)     // 获取翻译文本
get.autoViewAs(card, mode)// 自动生成viewAs对象
get.value(card)            // 获取卡牌价值
get.event()                // 获取当前事件
get.is.damageCard(card)    // 判断是否为伤害牌
get.type2(card)            // 获取卡牌大类（basic/trick/equip）
get.cnNumber(num)          // 获取中文数字
get.inpileVCardList(filter)// 获取牌堆中虚拟卡牌列表
get.prompt(skillName)      // 获取技能提示文本
get.number(card)           // 获取卡牌点数
get.hpColor(player)        // 获取角色勾玉颜色（参考【瞋视】）
```

### 18.2 player 方法

```javascript
player.getStat()                          // 获取本回合统计
player.getCardUsable({ name: "sha" })     // 获取某牌使用次数限制
player.hasUseTarget({ name: "sha" })      // 检查是否有使用目标
player.getUseValue({ name: "sha" })       // 获取使用价值（AI用）
player.getStorage(key, default)           // 获取 storage（带默认值）
player.markAuto(key, array)               // 自动去重添加数组到 storage
player.setStorage(key, value, update)     // 设置 storage（自动更新 UI）
player.countMark(key)                     // 获取标记数量
player.addMark(key, num, update)          // 添加标记
player.discardPlayerCard(target, pos, forced) // 弃置目标卡牌
player.modedDiscard(cards)                // 修改版弃置（可设置 discarder）
player.canRecast(card)                    // 检查是否可重铸
player.hasDiscardableCards(source, pos)   // 检查是否有可弃置牌
player.getHp()                            // 获取体力值（数字）
player.getDamagedHp()                     // 获取已损失体力值
player.viewHandcards(target)              // 观看指定角色手牌（替代 viewCards + getCards）

// 迭代器方法（优化性能，用于不需要完整数组的情况）
player.iterableGetConnectedCards()        // 迭代遍历连接牌
player.iterableGetShownCards()            // 迭代遍历明置牌
player.iterableGetKnownCards()            // 迭代遍历已知牌

// hasCards系列（有短路机制，优化性能）
player.hasCards(pos)                      // 判断是否有牌
player.hasGainableCards(source, pos)      // 判断是否有可获取牌

// countHistory系列（统一的事件数量统计）
player.countHistory(type)                 // 当前回合某事件数量
player.countAllHistory(type)              // 整局某事件数量
player.countRoundHistory(type)            // 某轮次某事件数量

// getHistory系列（获取历史事件列表，支持过滤）
player.getHistory(type)                   // 当前回合某类型事件列表
player.getHistory(type, filterFunc)       // 当前回合某类型事件列表（带过滤）
player.getRoundHistory(type)              // 某轮次某类型事件列表
player.getRoundHistory(type, filterFunc)  // 某轮次某类型事件列表（带过滤）
player.getAllHistory(type)                // 整局某类型事件列表
```

**getHistory 使用示例**：

```javascript
// 获取当前回合使用技能的历史
const skillHistory = player.getHistory("useSkill", evt => evt.skill === "skillName");

// 获取本轮使用牌的历史（用于统计）
const cardHistory = player.getRoundHistory("useCard", evt => evt.skill === "skillName_backup");

// 获取本轮获得牌的历史
const gainHistory = player.getRoundHistory("gain", evt => evt.getParent(2).name === "skillName");

// 获取历史数量
const count = player.getRoundHistory("useSkill", evt => evt.skill === "skillName").length;
```

**常用 type 类型**：

| type | 说明 |
|------|------|
| `useCard` | 使用牌 |
| `useSkill` | 使用技能 |
| `gain` | 获得牌 |
| `lose` | 失去牌 |
| `damage` | 受到伤害 |
| `respond` | 响应牌 |

> `getStorage`/`markAuto`/`setStorage` 详见附录4.4-4.6，`getHp()` 详见附录2.5，`canRecast()` 详见附录9.3

**注意：** `getShownCards`/`countShownCards`/`hasShownCards` 的 filter 会先判断是否符合条件，再判断是否已知，可能导致 filter 中出现未知牌。

**注意：** `changeHp`/`gainMaxHp`/`loseMaxHp` 返回事件增加 `changedHp` 和 `changedMaxHp` 属性，可获取准确变化值。

**注意：** `gainMultiple` 返回事件增加 `gaintag` 属性，支持给获得的牌添加标记。

### 18.3 lib 对象

```javascript
lib.filter.filterTarget(card, player, target)  // 默认目标过滤
lib.filter.cardRecastable(card, player)         // 重铸牌过滤（内置）
lib.card[cardName]                              // 获取卡牌信息
lib.skill.skillName_backup.cardName             // 访问backup技能的动态属性
```

> `lib.filter`、`get.filter`、`get.min`、`get.max` 等函数已补全 JSDoc、函数签名和 Mod 类型提示。Mod 函数现在有完整的类型定义，便于 IDE 智能提示。

### 18.4 game 对象

```javascript
game.createFakeCards(cards)                    // 创建副本牌（用于directgains显示）
game.deleteFakeCards(cards)                    // 删除副本牌（清理资源）
game.asyncDraw(targets, num)                   // 多角色同时摸牌（推荐）
```

**createFakeCards 使用场景**：

当需要显示牌堆顶/弃牌堆底等特殊区域的牌，但又不实际移除原牌时，使用副本牌机制：

```javascript
// 1. 创建副本牌（设置_cardid关联原牌）
const bottomCards = Array.from(ui.discardPile.childNodes).slice(0, X);
const fakeCards = game.createFakeCards(bottomCards);

// 2. 显示副本牌到玩家手牌区
player.directgains(fakeCards, null, "skill_tag");

// 3. 玩家使用副本牌时，替换为原牌（useCardBefore时机）
trigger.cards[i] = discardPile.find(c => c.cardid === card._cardid);
trigger.card.cards[i] = discardPile.find(c => c.cardid === card._cardid);

// 4. 刷新时删除旧副本牌并创建新副本牌
game.deleteFakeCards(player.getCards("s", c => c.hasGaintag("skill_tag")));
player.directgains(game.createFakeCards(newCards), null, "skill_tag");
```

**关键要点**：
- 副本牌通过`_cardid`关联原牌，替换时需同时更新`trigger.cards[i]`和`trigger.card.cards[i]`
- 使用`game.createFakeCards`而非手动`ui.create.card()`，确保状态正确
- 参考实现：[bingshi.js potthaoshi_use](../character/bingshi.js#L1807-1861)

### 18.5 引擎注意事项

```javascript
// game.finishSkill 处理 inherit 和 viewAs 时使用深拷贝
// 避免多个 backup 技能共享同一 viewAs 对象时数据相互污染

// cardEnabled 正确将传入的 Card 或 CardBaseUIData 转换为 VCard
// 确保卡牌可用性检查时能正确识别卡牌类型
```

> 使用 `inherit` 继承其他技能时，确保不直接修改继承来源的技能数据。`backup` 技能中的 `viewAs` 对象不会被 `finishSkill` 意外污染。
>
> 自定义卡牌相关的 `cardEnabled` 检查已修正，如果遇到自定义卡牌无法正常使用的问题，请确认卡牌定义格式是否正确。

## 19. 角色评级系统（Rank）

### 19.1 评级等级（Strength Rank）

无名杀使用 **9级强度评级** 系统来衡量角色强度，定义在 `lib.rank` 对象中（来源：[character/rank.js](../character/rank.js)）。

| 代码   | 中文名 | factor值 | 说明            |
| ---- | --- | ------- | ------------- |
| `s`  | S级  | 8       | 最强角色（神将、特殊角色） |
| `ap` | A+级 | 7       | 超强角色          |
| `a`  | A级  | 6       | 强力角色          |
| `am` | A-级 | 5       | 中上角色          |
| `bp` | B+级 | 4       | 中偏强角色        |
| `b`  | B级  | 3       | 中等强度          |
| `bm` | B-级 | 2       | 中下角色          |
| `c`  | C级  | 1       | 较弱角色          |
| `d`  | D级  | 0       | 最弱角色          |
| `sp` | SP级 | 9       | Boss/隐藏Boss    |

**数据结构：**

```javascript
// lib.rank 对象结构
{
    s: ["v_sunshangxiang", "two_yj_puyuan", ...],     // S级角色列表
    ap: ["dc_sb_zhuran", "mb_cuilingyi", ...],        // A+级角色列表
    a: [...],                                          // A级角色列表
    am: [...],                                         // A-级角色列表
    bp: [...],                                         // B+级角色列表
    b: [...],                                          // B级角色列表
    bm: [...],                                         // B-级角色列表
    c: [...],                                          // C级角色列表
    d: [...],                                          // D级角色列表
}
```

### 19.2 查询角色评级

#### get.rank(name, num)

```javascript
// 返回评级字符串
get.rank("caocao")        // → "b"
get.rank("sunwukong")     // → "s"
get.rank("noname")        // → "s"

// 第二个参数为数字时，返回数值化评级（用于计算）
get.rank("caocao", true)  // → 3 (B级 = factor 3)
get.rank("caocao", 5)     // → Math.round(3 * (5-1) / 8 + 1) = 2

// 主公自动提升至A+
get.rank(_status.lord)    // → "ap"（无论原评级）
```

**数值化公式：** `Math.round(factor * (num - 1) / 8 + 1)`

#### game.getRarity(name)

```javascript
// 返回稀有度（用于显示）
game.getRarity("sunwukong")   // → "legend"
game.getRarity("dc_sb_zhuran") // → "epic"
game.getRarity("caocao")       // → "common"
```

### 19.3 稀有度系统（Rarity）

`lib.rank.rarity` 定义了角色的稀有度/品质，用于UI展示和筛选。

| 稀有度      | 说明 | 显示效果       |
| -------- | -- | ---------- |
| `legend` | 传说 | 最高品质，特殊标识  |
| `epic`   | 史诗 | 高品质        |
| `rare`   | 稀有 | 中高品质       |
| `junk`   | 废品 | 低品质（非棋战模式） |
| `common` | 普通 | 默认品质       |

**数据结构：**

```javascript
// lib.rank.rarity 对象结构
{
    legend: [...],   // 传说角色列表
    epic: [...],     // 史诗角色列表
    rare: [...],     // 稀有角色列表
    junk: [...],     // 废品角色列表
}
```

### 19.4 技能评级

```javascript
// get.skillRank(skill, type, grouped)
// 评估技能强度，返回数值
get.skillRank("dcfuyue", "offense")  // 进攻型技能评分
get.skillRank("dcwenlan", "defense")  // 防御型技能评分
```

### 19.5 评级在AI中的应用

```javascript
// 根据角色阵容计算币值系数
get.coinCoeff(characterList)
// 天梯模式中根据角色评级调整MMR
mmr += 10 - get.rank(game.me.name, true) * 2;
```

### 19.6 自定义角色评级

扩展包中的自定义角色**不会自动分配评级**，未配置的角色默认按 `"bp"` 处理。

**【强制】为自定义角色指定评级，必须在扩展的 `arenaReady` 阶段通过 `lib.rank` 和 `lib.rank.rarity` 对象设置。**

#### 正确设置方式

```javascript
// 在 extension.js 的 arenaReady 阶段设置
arenaReady: function () {
    if (lib.rank) {
        const rankMap = {
            s: ["角色1", "角色2"],
            ap: ["角色3"],
            a: [],
            am: [],
            bp: ["角色4"],
            b: [],
            bm: [],
            c: [],
            d: [],
        };
        const rarityMap = {
            legend: ["角色1"],
            epic: ["角色3"],
            rare: [],
            junk: [],
        };
        for (const [rankKey, names] of Object.entries(rankMap)) {
            for (const name of names) {
                if (!lib.rank[rankKey]?.includes(name)) {
                    lib.rank[rankKey].push(name);
                }
            }
        }
        if (lib.rank.rarity) {
            for (const [key, names] of Object.entries(rarityMap)) {
                for (const name of names) {
                    if (!lib.rank.rarity[key]?.includes(name)) {
                        lib.rank.rarity[key].push(name);
                    }
                }
            }
        }
    },
},
```

#### 关键要点

| 要点 | 说明 |
|------|------|
| 设置时机 | 必须在 `arenaReady` 阶段设置，确保 `lib.rank` 已初始化 |
| 检查存在 | 使用 `lib.rank[rankKey]?.includes(name)` 避免重复添加 |
| 稀有度设置 | 需要 `lib.rank.rarity` 存在时才设置，使用 `if (lib.rank.rarity)` 检查 |
| 角色ID | 使用角色的完整ID（如 `"dccaozhi"`），而非显示名称 |

#### ❌ 错误方式

```javascript
// ❌ 错误1：在 character 定义中直接配置 rank（无效）
character: {
    my_character: {
        sex: "male",
        group: "qun",
        hp: 4,
        skills: ["skill1"],
        rank: "s",  // ❌ 无效！character 不支持 rank 字段
    },
}

// ❌ 错误2：直接修改 lib.rank 而不检查（可能覆盖原有数据）
lib.rank.s = ["角色1", "角色2"];  // ❌ 会覆盖原有 S级角色列表！

// ❌ 错误3：在 precontent 阶段设置（lib.rank 可能未初始化）
precontent: function () {
    lib.rank.s.push("角色1");  // ❌ lib.rank 可能不存在！
},
```

***

## 20. chooseToMove_new 动态按钮注入

> 在 `chooseToMove_new` 对话框展示期间，动态注入自定义按钮到确认按钮相邻区域。

### 20.1 基本原理

`chooseToMove_new` 创建对话框后，对话框存储在 `event.dialog`，确认按钮存储在 `ui.confirm`。通过 `ui.control.insertBefore` 可将自定义按钮插入到确认按钮左侧，使用 `ui.updatec()` 让框架重新计算所有按钮位置。

### 20.2 注入流程

```javascript
const moveEvent = player.chooseToMove_new("提示文字", true).set("list", [...]);

let customControl = null;
if (shouldInject) {
    let retryCount = 0;
    const injectButtons = () => {
        const dialog = moveEvent.dialog;
        if (!dialog) {
            if (retryCount < 20) { retryCount++; setTimeout(injectButtons, 50); }
            return;
        }
        if (customControl || ui.control.querySelector(".my-custom-control")) return;

        // 创建control容器（与确认按钮样式一致）
        customControl = ui.create.div(".control.my-custom-control");
        customControl.style.opacity = "0"; // 先隐藏，位置计算后再显示

        // 创建按钮子元素（与确认按钮内部结构一致）
        const btn = document.createElement("div");
        btn.link = "my_action";
        btn.innerHTML = "按钮文字";
        btn.css({ position: "relative", padding: "3px", margin: "0", cursor: "pointer" });
        btn.addEventListener(lib.config.touchscreen ? "touchend" : "click", function(e) {
            e.stopPropagation();
            // 操作 dialog.itemContainers 中的卡牌元素
            // 更新 moveEvent.moved 状态
            // 调用 ui.create.confirm("o") 刷新确认按钮
        });
        // 按压反馈（与确认按钮一致）
        if (lib.config.button_press) {
            btn.addEventListener(lib.config.touchscreen ? "touchstart" : "mousedown", function() { this.classList.add("controlpressdown"); });
            btn.addEventListener(lib.config.touchscreen ? "touchend" : "mouseup", function() { this.classList.remove("controlpressdown"); });
        }
        customControl.appendChild(btn);

        // 多个按钮时，后续按钮添加左边距
        // btn2.css({ position: "relative", padding: "3px", margin: "0 0 0 6px", cursor: "pointer" });

        // 插入到确认按钮左侧
        ui.control.insertBefore(customControl, ui.confirm);
        // 让框架重新计算所有按钮位置
        ui.updatec();
        // 延迟显示，确保位置计算完成
        setTimeout(() => {
            if (customControl && customControl.parentNode) {
                customControl.style.transition = "opacity 0.5s";
                customControl.style.opacity = "1";
                ui.refresh(customControl);
                customControl.style.transition = "";
            }
        }, 50);
    };
    setTimeout(injectButtons, 50);
}

const result = await moveEvent.forResult();

// 流程结束后清理自定义按钮
if (customControl && customControl.parentNode) {
    customControl.addTempClass("controlpressdownx", 500);
    setTimeout(() => {
        if (customControl && customControl.parentNode) customControl.parentNode.removeChild(customControl);
        customControl = null;
        ui.updatec();
    }, 500);
}
```

### 20.3 操作对话框卡牌

`dialog.itemContainers` 的索引结构（两行布局时）：

| 索引 | 内容 |
|------|------|
| 0 | 第一行标签 |
| 1 | 第一行标签 |
| 2 | 第一行卡牌容器 |
| 3 | 第二行标签 |
| 4 | 第二行标签 |
| 5 | 第二行卡牌容器 |

操作卡牌元素后需更新 `moveEvent.moved`：

```javascript
moveEvent.moved = [
    Array.from(pileContainer.children).map(e => e.link),
    Array.from(handContainer.children).map(e => e.link)
];
```

### 20.4 关键方法说明

| 方法/属性 | 说明 |
|-----------|------|
| `element.css(styleObj)` | 逐属性设置样式，比 `style.cssText` 安全（不会覆盖原有样式） |
| `ui.updatec()` | 重新计算所有 control 按钮位置，注入/移除按钮后必须调用 |
| `ui.refresh(node)` | 强制浏览器重排，用于确保样式变更生效 |
| `element.addTempClass(cls, ms)` | 临时添加 CSS 类，ms 毫秒后自动移除（用于消失动画） |
| `dialog.itemContainers` | 对话框中所有容器的 NodeList，含标签和卡牌容器 |
| `moveEvent.moved` | 当前卡牌分配状态数组，`moved[0]` 为牌堆区卡牌，`moved[1]` 为手牌区卡牌 |

### 20.5 注意事项

- **必须使用 `element.css()` 而非 `style.cssText`**：`cssText` 会覆盖元素原有样式，`css()` 逐属性设置更安全
- **注入后必须调用 `ui.updatec()`**：否则按钮位置与确认按钮重叠
- **先隐藏后显示**：初始 `opacity: 0`，`updatec()` 计算位置后再渐显，避免位置跳动
- **流程结束必须清理**：`forResult()` 返回后手动移除自定义按钮并调用 `ui.updatec()`
- **防重复注入**：注入前检查 `ui.control.querySelector` 是否已存在
- **按钮间距**：多个按钮时，后续按钮设置 `margin: "0 0 0 6px"` 保持视觉分离

***

## 21. 联机相关函数

> **无名杀联机模式基于 WebSocket 通信，分为主机端和客机端。以下函数用于处理联机状态判断、消息发送和断线重连。**

### 21.1 联机架构概览

```
主机端 (game.online === false)
  │
  ├── game.broadcast(func, args)     → 向所有客机端发送
  ├── game.broadcastAll(func, args)  → 向所有客机端发送 + 本地执行
  ├── player.send(func, args)        → 向特定客机端发送
  │
  └── 接收客机端返回结果

客机端 (game.online === true)
  │
  ├── game.send(msg, args)           → 向主机端发送
  │
  └── 接收主机端指令并执行

断线重连:
  主机端 → send("reinit", ..., _status.postReconnect)
  客机端 → 遍历 postReconnect 执行恢复函数
```

### 21.2 game.online

**类型：** `boolean` 属性

**功能：** 标识当前游戏实例是否作为**客机端**运行。

| 值       | 含义        |
| ------- | --------- |
| `false` | 主机端或单机模式  |
| `true`  | 联机模式下的客机端 |

```javascript
// 判断是否为客机端
if (game.online) {
    return;  // 客机端不执行主机端逻辑
}
```

### 21.3 game.send

**签名：** `game.send(...args)`

**功能：** **客机端专用**。向主机端发送消息。

- 如果第一个参数是函数，自动添加 `"exec"` 前缀，表示在主机端执行该函数
- 如果第一个参数是字符串，则作为消息类型标识
- 观战模式下只允许发送 `"reinited"` 消息

```javascript
// 发送字符串消息
game.send("inited");
game.send("auto");
game.send("result", event._result);

// 发送函数（主机端会执行）
game.send(() => {
    // 在主机端执行的代码
});
```

### 21.4 game.broadcast

**签名：** `game.broadcast(func, ...args)`

**功能：** **主机端专用**。向所有已初始化的客机端广播消息，**主机端本地不执行**。

- 如果当前是客机端（`game.online === true`），直接返回不执行
- 遍历 `lib.node.clients`，对每个已初始化的客户端发送消息

```javascript
// 广播函数（所有客机端执行）
game.broadcast(function (card) {
    card.removeGaintag(tag);
}, card);

// 广播字符串消息
game.broadcast("createDialog", event.videoId, "标题", cards);
game.broadcast("closeDialog", event.videoId);
```

### 21.5 game.broadcastAll

**签名：** `game.broadcastAll(func, ...args)`

**功能：** **主机端专用**。向所有客机端广播消息，**同时在主机端本地也执行一次**。

相当于 `game.broadcast()` + 本地执行。如果当前是客机端则直接返回。

```javascript
// 广播并本地执行：添加临时标签
game.broadcastAll((id, translation) => {
    if (!lib.translate[id]) {
        lib.translate[id] = translation;
    }
}, id, translation);
```

**与** **`game.broadcast`** **的区别：**

| 函数                  | 客机端 | 主机端本地   |
| ------------------- | --- | ------- |
| `game.broadcast`    | 执行  | **不执行** |
| `game.broadcastAll` | 执行  | **执行**  |

### 21.5.1 模式判断：`get.mode()` 与 `_status.mode` 的区别

**功能：** 判断当前游戏模式（身份场、斗地主、国战等）。

| 函数/属性           | 返回值示例      | 说明                     |
| ------------------- | --------------- | ------------------------ |
| `get.mode()`        | `"identity"`    | 返回**主模式**名称       |
| `_status.mode`      | `"normal"`      | 返回**子模式**名称       |

**示例：**

```javascript
// 身份场（主模式 identity，子模式 normal/zhong/purple 等）
get.mode() === "identity"   // → true（判断是否是身份场）
_status.mode === "normal"   // → true（判断是否是普通身份场）

// 斗地主（主模式 doudizhu，子模式 normal 等）
get.mode() === "doudizhu"   // → true（判断是否是斗地主）
_status.mode === "normal"   // → true

// 国战（主模式 guozhan，子模式 four/standard 等）
get.mode() === "guozhan"    // → true（判断是否是国战）
_status.mode === "four"     // → true（判断是否是四人国战）
```

**注意事项：**

- **判断主模式**（身份场、斗地主、国战等）应使用 `get.mode()`
- **判断子模式**（普通身份场、忠胆义胆、四人国战等）应使用 `_status.mode`
- 两者结合使用可以精确判断当前游戏的具体模式

### 21.6 \_status.postReconnect

**类型：** `Object` 属性

**功能：** 存储断线重连后需要重新执行的回调函数及其参数。当客机端断线重连时，主机端会将此对象序列化后发送给客机端，客机端在 `reinit` 流程中依次执行其中存储的函数来恢复游戏状态。

**数据结构：** 每个键值对的格式为 `[function, ...args]`，第一个元素是要执行的函数，后续元素是参数。

```javascript
// 注册重连回调
_status.postReconnect.addTempTag ??= [
    list => { for (const args of list) game.addTempTag(...args); },
    [],
];
_status.postReconnect.addTempTag[1].push([id, translation]);

// 技能注册重连回调
if (!_status.postReconnect.skillName) {
    _status.postReconnect.skillName = [func, []];
}
_status.postReconnect.skillName[1].add(name);
```

**重连时执行逻辑：**

```javascript
// 客机端收到 reinit 后
postReconnect = get.parsedResult(postReconnect);
for (var i in postReconnect) {
    if (Array.isArray(postReconnect[i])) {
        postReconnect[i].shift().apply(this, postReconnect[i]);
    }
}
```

### 21.7 event.isMine

**签名：** `event.isMine()` → `boolean`

**功能：** 判断当前事件的玩家是否是**本地玩家**。委托给 `event.player.isMine()` 方法。

用于区分事件是由本地玩家触发还是由其他玩家/AI触发，决定是否需要显示交互界面。

```javascript
// 核心三路判断模式
if (event.isMine()) {
    // 本地玩家：显示交互界面
} else if (event.isOnline()) {
    // 在线客机玩家：发送到客机端执行
    player.send(func, args);
} else {
    // AI/托管：自动处理
}
```

### 21.8 player.isOnline

**签名：** `player.isOnline()` → `boolean`

**功能：** 判断该玩家是否为**在线且活跃**的联机玩家。需要同时满足：

| 条件                | 说明             |
| ----------------- | -------------- |
| `this.ws` 存在      | 有 WebSocket 连接 |
| `lib.node` 存在     | 当前是主机端         |
| `!this.ws.closed` | 连接未关闭          |
| `this.ws.inited`  | 连接已初始化完成       |
| `!this.isAuto`    | 玩家未处于托管状态      |

```javascript
// 判断是否需要向在线玩家发送操作请求
if (player.isOnline()) {
    player.send(func, args);
}
```

### 21.9 player.isOnline2

**签名：** `player.isOnline2()` → `boolean`

**功能：** 判断该玩家是否为**在线**的联机玩家（宽松判断）。与 `isOnline()` 的区别：不检查 `ws.inited` 和 `isAuto` 状态，只要 WebSocket 连接存在且未关闭就返回 `true`。

**与** **`isOnline()`** **的区别：**

| 条件                | `isOnline()` | `isOnline2()` |
| ----------------- | ------------ | ------------- |
| `this.ws` 存在      | ✅            | ✅             |
| `lib.node` 存在     | ✅            | ✅             |
| `!this.ws.closed` | ✅            | ✅             |
| `this.ws.inited`  | ✅            | ❌ 不检查         |
| `!this.isAuto`    | ✅            | ❌ 不检查         |

```javascript
// 向可能托管的在线玩家发送消息（用 isOnline2）
if (event.isMine()) {
    func(target);
} else if (player.isOnline2()) {
    player.send(func, target);
}
```

### 21.10 player.send

**签名：** `player.send(...args)` → `this`（支持链式调用）

**功能：** **主机端专用**。向特定在线玩家（客机端）发送消息。如果该玩家的 WebSocket 连接不存在或已关闭，则直接返回。

- 如果第一个参数是函数，自动添加 `"exec"` 前缀，表示在客机端执行该函数
- 参数会被 `get.stringifiedResult()` 序列化

```javascript
// 向在线玩家发送函数
player.send(() => {
    // 在客机端执行的代码
});

// 向在线玩家发送函数和参数
player.send(func, target);
player.send(func, card, id);

// 发送字符串消息
player.send("closeDialog", id);
```

### 21.11 联机适配核心模式

编写联机兼容的技能时，需遵循以下模式：

#### 模式一：三路判断

```javascript
if (event.isMine()) {
    // 本地玩家：直接执行交互逻辑
    func(target);
} else if (player.isOnline2()) {
    // 在线客机玩家：发送到客机端执行
    player.send(func, target);
} else {
    // AI/托管：自动处理
}
```

#### 模式二：broadcastAll 同步状态

当需要修改所有端（主机+客机）都能看到的状态时，使用 `broadcastAll`：

```javascript
game.broadcastAll((id, translation) => {
    if (!lib.translate[id]) {
        lib.translate[id] = translation;
    }
}, id, translation);
```

#### 模式三：postReconnect 注册重连恢复

当修改了需要在断线重连后恢复的状态时，注册重连回调：

```javascript
game.broadcastAll((key, value) => {
    lib.translate[key] = value;
    if (!_status.postReconnect.customKey) {
        _status.postReconnect.customKey = [
            data => { for (const item of data) lib.translate[item[0]] = item[1]; },
            [],
        ];
    }
    _status.postReconnect.customKey[1].push([key, value]);
}, key, value);
```

#### 模式四：chooseControl/chooseCard 联机适配

交互方法的 `ai` 回调中引用外层变量时，必须通过 `.set()` 传递：

```javascript
const options = ["选项一", "选项二"];
const result = await player
    .chooseControl(options)
    .set("options", options)  // 传递变量
    .set("ai", () => {
        const options = get.event().options;  // 联机时通过 get.event() 获取
        return options[0];
    })
    .forResult();
```

### 21.12 联机模式判断：`_status.connectMode`

**签名：** `_status.connectMode` → `boolean`

**功能：** 判断当前是否为联机模式。联机模式下不能检查具体手牌内容（防止信息泄露），应直接返回 `true` 跳过内容检查。

```javascript
// ✅ 正确：联机模式下不检查具体手牌内容
const result = (num > 0 && player.hasCard(card => {
    if (_status.connectMode) return true;  // 联机模式直接返回 true
    return get.is.damageCard(card) || get.tag(card, 'recover');
}, 'h')) ? await player.chooseControl()...forResult() : { index: 0 };
```

***

## 22. 换肤与换原画系统

### 22.1 changeSkin 机制

无名杀为十周年谋定天下、手杀曹髦、势太史慈等多原画武将使用的更换原画方式，核心函数为 `player.changeSkin`。

#### 22.1.1 在 lib.characterSubstitute 中定义原画

武将须在 `lib.characterSubstitute` 中存在定义，具体格式为：

```javascript
lib.characterSubstitute["pot_weiyan"] = [
    ["pot_weiyan_achieve", []],
    ["pot_weiyan_fail", []],
]
```

该写法为武将 `pot_weiyan` 添加了两个可更换的原画：
- 〖忠傲〗使命成功后更换的火龙果形态 `pot_weiyan_achieve`
- 〖忠傲〗使命失败时更换的雨中吕布形态 `pot_weiyan_fail`

每个原画对应的值均为长度为 2 的数组，第一项为该原画对应的 id，第二项用于存放原画信息，其在功能上等同于数组形式 character 的第五格 `lib.character[4]`，一般用于存放对应原画路径和该原画的阵亡语音。

#### 22.1.2 原画路径与阵亡语音

信息格为空的情况下，原画和阵亡语音均走默认路径：

```javascript
["pot_weiyan_achieve", []],
```

该写法下，对应原画路径为 `image/character/pot_weiyan_achieve.jpg`，对应阵亡语音路径为 `audio/die/pot_weiyan_achieve.mp3`。

**自定义原画路径**：在信息格中填入符合格式的路径，格式与自定义武将的路径相同。

1. 使用武将孙策 `sunce` 的原画：
```javascript
["pot_weiyan_achieve", ["character:sunce"]],
```

2. 使用指定扩展 `无名扩展` 中的图片 `weiyan.jpg` 作为原画：
```javascript
["pot_weiyan_achieve", ["ext:无名扩展/weiyan.jpg"]],
```
最终路径为 `extension/无名扩展/weiyan.jpg`。

**自定义阵亡语音**：按自定义武将的阵亡语音格式填入信息格。

1. 使用原皮 `pot_weiyan` 的阵亡语音：
```javascript
["pot_weiyan_achieve", ["die:pot_weiyan"]],
```

2. 使用扩展中的同名阵亡语音（`无名扩展/die/pot_weiyan_achieve.mp3`）：
```javascript
["pot_weiyan_achieve", ["die:ext:无名扩展/die:true"]],
```

3. 使用指定扩展中的语音 `weiyan.mp3` 作为阵亡语音：
```javascript
["pot_weiyan_achieve", ["die:ext:无名扩展/weiyan.mp3"]],
```
最终路径为 `extension/无名扩展/weiyan.mp3`。

> 阵亡语音还有其他可选择的格式，也可为一张原画添加多个阵亡语音，详见 [7.1 音效配置](#71-音效配置)。

**扩展使用例**：为扩展 `无名扩展` 中的武将 `noname_sunce` 添加一张原画 `noname_sunce_shadow`，原画在 `无名扩展/image` 下，阵亡语音在 `无名扩展/die` 下：

```javascript
lib.characterSubstitute["noname_sunce"] = [
    ["noname_sunce_shadow", ["ext:无名扩展/image/noname_sunce_shadow.jpg", "die:ext:无名扩展/die:true"]],
]
```

#### 22.1.3 changeSkin 函数参数

为武将添加好原画后，即可在游戏内进行切换。切换方式为函数 `player.changeSkin(map, character)`。

**map 参数**：用于定位要进行原画切换的武将牌，接受两种类型的参数。假设 player 为主将势魏延 `pot_weiyan` 和副将手杀曹髦 `mb_caocao` 双将：

| 参数形式 | 说明 | 示例 |
| --- | --- | --- |
| 字符串（skill） | 将 map 当作 skill 处理，更换持有该技能的武将牌 | `player.changeSkin("potzhongao", "pot_weiyan_achieve")` |
| `map.skill` | 更换持有技能 `map.skill` 的武将牌 | 同上等效 |
| `map.characterName` | 更换对应 id 为 `map.characterName` 的武将牌 | `player.changeSkin({ characterName: "pot_weiyan" }, "pot_weiyan_achieve")` |
| `map.characterSkinName` | 更换当前原画为 `map.characterSkinName` 的武将牌 | `player.changeSkin({ characterSkinName: "pot_weiyan_achieve" }, "pot_weiyan_fail")` |
| `map.source` | 传入值为 `name`/`name1`/`name2`，更换对应位置的武将牌 | `player.changeSkin({ source: "name1" }, "pot_weiyan_achieve")` |

**character 参数**：即为要更换的目标原画 id。

#### 22.1.4 使用例

①势魏延发动〖忠傲〗使命成功后更换武将原画：
```javascript
player.changeSkin("potzhongao", "pot_weiyan_achieve");
```

②新杀谋周瑜根据转换技〖英谋〗的状态更换武将原画：
```javascript
const type = player.storage["dcsbyingmou"];
player.changeSkin({ characterName: "dc_sb_zhouyu" }, "dc_sb_zhouyu" + (type ? "_shadow" : ""));
```

③手杀笮融根据发动〖净土〗选择的选项更换武将原画：
```javascript
const choice = result.control;
player.changeSkin({ characterName: "mb_zerong" }, `mb_zerong_${choice}`);
```

④OL谋袁绍发动〖合讨〗/〖神离〗更换对应原画：
```javascript
player.changeSkin("olsbhetao", "ol_sb_yuanshao");
player.changeSkin("olsbshenli", "ol_sb_yuanshao_shadow");
```

### 22.2 临时角色名（tempname）与临时形象

当技能需要临时改变目标的显示形象和角色名，技能结算后恢复原样时，应使用 `player.tempname` 配合 `game.broadcastAll` 同步操作。

#### 与 changeSkin 的区别

| 机制 | changeSkin | tempname + setAvatar |
|------|-----------|---------------------|
| 用途 | 永久/半永久更换原画 | 临时改变角色名和立绘 |
| 角色名 | 不变 | 临时改变 |
| 恢复方式 | 需再次 changeSkin | 移除 tempname 即可恢复 |
| 适用场景 | 觉醒/使命成功失败 | 技能结算期间临时扮演 |

#### 使用方法

```javascript
// 1. 技能发动时：添加临时角色名 + 设置立绘
if (name && skill) {
    // 同步添加临时角色名，让目标显示为对应角色
    game.broadcastAll((player, name) => player.tempname.add(name), target, "sxrm_caocao");

    await target.addAdditionalSkills(mark, [skill], true);
    target.addTip(mark, `似故 ${get.translation(skill)}`);
    target.setAvatar(target.name, name);
}

// 2. 技能结算后：移除临时角色名 + 恢复立绘
if (name && skill) {
    if (Array.isArray(target.tempname)) {
        game.broadcastAll((player, name) => player.tempname.remove(name), target, "sxrm_caocao");
    }
    target.removeAdditionalSkills(mark);
    target.removeTip(mark);
    target.setAvatar(target.name, target.name);
}
```

**关键点：**
1. 使用 `game.broadcastAll` 确保联机同步
2. 添加时：`player.tempname.add(name)`
3. 移除前检查：`Array.isArray(target.tempname)` 避免报错
4. 移除时：`player.tempname.remove(name)`
5. `setAvatar` 只改变立绘显示，`tempname` 可让角色名也临时改变

**参考技能：** 许劭【盈门】、势曹操【似故】

### 22.3 本体换肤系统

> ⚠️ 兼容性较低，处于半废弃状态，慎用。

打开 [选项-选项-外观] 处的 [开启换肤] 功能启用此效果。启用后，无名杀会读取位于与原画所在文件夹同级的 `skin` 文件夹下以该武将 id 命名的文件夹 A 下的图片作为该武将的可用皮肤。若该武将使用了 changeSkin 创建了多张原画，一张皮肤对应的其他原画则读取文件夹 A 下以该皮肤文件名命名的文件夹中的同名原画。

#### 22.3.1 默认路径

**本体武将**：武将 `NAME` 的图片路径为 `image/character/NAME.jpg`，对应的皮肤路径即为 `image/skin/NAME/`，位于该路径下的图片均可作为皮肤。
- 皮肤[谋定天下]的路径即为 `image/skin/NAME/谋定天下.jpg`
- 若该武将拥有多原画 `NAME_achieve` 和 `NAME_fail`，皮肤[谋定天下]对应的其他原画路径为 `image/skin/NAME/谋定天下/NAME_achieve.jpg` 和 `image/skin/NAME/谋定天下/NAME_fail.jpg`

**扩展武将**：图片路径若为 `extension/无名扩展/pictures/NAME.jpg`，对应的皮肤路径即为 `extension/无名扩展/skin/NAME/`，位于该路径下的图片均可作为皮肤。

#### 22.3.2 自定义路径（skinPath）

允许为武将设置 `skinPath` 属性，用于自定义该武将对应的皮肤路径。

Character 类形式：
```javascript
lib.character["sunce"] = {
    sex: "male",
    group: "wu",
    hp: 4,
    skills: ["jiang", "hunzi", "zhiba"],
    isZhugong: true,
    skinPath: "image/skin/shen_sunce/",
}
```

数组形式：
```javascript
lib.character["sunce"] = ["male", "wu", 4, ["jiang", "hunzi", "zhiba"], ["zhu", "skinPath:image/skin/shen_sunce/"]];
```

这两种写法效果一致：让武将标孙策 `sunce` 使用文件夹 `image/skin/shen_sunce/` 中的图片作为皮肤，实现标孙策使用神孙策的皮肤。

扩展武将同理：
```javascript
lib.character["noname_sunce"].skinPath = "ext:无名扩展/skin/";
```

***

## 23. 游戏启动流程

### 23.1 总览

整体流程：

```text
index.html
  -> noname/entry.ts
  -> boot()
  -> 加载配置/资源/模式/武将包/卡包/扩展
  -> ui.create.arena()
  -> game.createEvent("game", false).setContent(当前模式 start)
  -> game.loop()
  -> GameEvent.start()
  -> 模式 start
  -> chooseCharacter / gameStart / gameDraw / phaseLoop
  -> 玩家回合循环
```

启动阶段的核心目标是：
- 初始化全局单例：`lib`、`game`、`ui`、`get`、`ai`、`_status`
- 加载配置和素材
- 加载当前模式、武将包、卡包、扩展
- 把当前模式能力混入全局对象
- 创建根事件 `game`
- 启动事件系统

游戏进行时的核心则是：
```text
phaseLoop 无限推进玩家回合
  -> phase 创建一个玩家回合
    -> phaseZhunbei / phaseJudge / phaseDraw / phaseUse / phaseDiscard / phaseJieshu
      -> 每个阶段都是 GameEvent
        -> 阶段中继续创建子事件和触发技能
```

### 23.2 入口与 boot 初始化

入口文件是 `apps/core/index.html`，加载模块入口 `noname/entry.ts`。

`entry.ts` 导入核心单例（`lib`、`game`、`get`、`_status`、`ui`、`ai`），根据平台加载 preload（Electron / 浏览器 / Cordova），处理 GPL 确认后调用 `boot()`。

核心单例职责：
- `lib`：技能、卡牌、武将、翻译、配置、content 表等静态库
- `game`：游戏行为 API 和运行入口
- `ui`：DOM/UI 创建、交互和展示
- `get`：查询、计算、转换工具
- `ai`：AI 评估逻辑
- `_status`：运行时状态

`boot()` 位于 `apps/core/noname/init/index.ts`，前半段主要做基础环境准备：

```text
导入 polyfill
设置加载超时
设置背景
把 get/ui/ai/game 挂到 lib
创建初始 _status.event
设置窗口监听和错误处理
加载配置
初始化兼容层
初始化沙盒 Realms
初始化 security
设置 CacheContext proxy
处理触屏/布局等配置
```

关键点：
```javascript
_status.event = lib.element.GameEvent.initialGameEvent();
```

这给事件系统一个初始状态。后续根事件 `game` 会接管真正的游戏流程。

### 23.3 加载配置与资源

`boot()` 会读取本地配置，并根据配置决定加载哪些内容。重要加载项包括：当前模式、所有启用卡包、所有启用武将包、rank/replace/perfectPairs、扩展、自定义皮肤样式等。

模式、卡包、武将包通过这些函数加载：
```javascript
importMode(name)       // 动态导入模式模块
importCardPack(name)   // 动态导入卡包
importCharacterPack(name) // 动态导入武将包
importExtension(name)  // 动态导入扩展
```

这些函数位于 `apps/core/noname/init/import.ts`。`importMode` 会动态导入 `/mode/identity.js`、`/mode/guozhan/index.js` 等模式模块，导入结果暂存到 `lib.imported[type][result.name]`。

### 23.4 splash 与模式选择

如果当前模式没有提前加载，boot 会显示 splash 供玩家选择模式。如果设置了 directstart、关闭 splash 或播放录像，则可能跳过选择，直接加载配置中的模式。

### 23.5 loadMode

模式加载到 `lib.imported.mode` 后，boot 取出当前模式并调用 `loadMode()`，将模式配置混入全局对象：

```javascript
mixinLibrary(mode, lib);      // 模式技能、翻译等
mixinGeneral(mode, "game", game);  // 模式扩展 game 方法
mixinGeneral(mode, "ui", ui);      // 模式扩展 UI
mixinGeneral(mode, "get", get);    // 模式扩展查询逻辑
mixinGeneral(mode, "ai", ai);      // 模式扩展 AI
```

模式可以提供：
- `mode.game`：扩展 `game` 方法，例如 `chooseCharacter`
- `mode.start`：模式启动流程
- `mode.startBefore`：模式启动前处理

随后继续加载武将包、卡包、扩展：
```text
loadCharacter(imported character packs)
loadCardPile()
loadCard(imported card packs)
loadPlay(imported play packs)
loadExtension(enabled extensions)
```

### 23.6 创建根事件与游戏启动

加载完成后，执行 `startBefore`（如果存在），创建游戏主界面 `ui.create.arena()`，然后创建根事件：

```javascript
game.createEvent("game", false).setContent(lib.init.start);
```

含义：
- 创建名为 `"game"` 的根事件
- `trigger` 传 `false`，因此不会自动走 `gameBefore/gameBegin/gameEnd/gameAfter`
- content 是当前模式的 `start`

随后调用 `game.loop()` 启动事件系统。`game.loop()` 不是传统游戏主循环，只是启动当前事件：

```javascript
loop(event = _status.event) {
    if (!event) throw new Error("There is no _status.event when game.loop.");
    return event.start();
}
```

### 23.7 模式 start 主线

以身份模式为例，`start` 的核心流程：

```text
设置 _status.mode
处理录像播放
prepareArena
新手教程/变更日志
联机等待或本地选将前处理
game.chooseCharacter()
处理身份显示、主公增强等规则
game.syncState()
event.trigger("gameStart")
game.addVideo("init")
game.gameDraw(beginner, ...)
game.phaseLoop(beginner)
```

关键节点：
- `game.prepareArena()`：创建玩家节点、手牌区、牌堆 UI
- `game.chooseCharacter()`：模式提供的选将流程，不同模式差异很大
- `event.trigger("gameStart")`：触发 gameStart 时机，很多技能监听 `trigger: { global: "gameStart" }`
- `game.gameDraw()`：初始发牌
- `game.phaseLoop()`：进入回合循环

### 23.8 phaseLoop 与玩家回合

`game.phaseLoop(player)` 创建 `phaseLoop` 事件，content 是真正的游戏进行时主循环：

```text
初始化座次号
while true:
  如果 event.player 仍在 game.players:
    执行 lib.onphase
    const phase = event.player.phase()
    将 phase 放入 event.next
    await phase
  触发 phaseOver
  找到下一个玩家
  event.player = 下一个玩家
```

`player.phase()` 创建一个 `phase` 事件，默认阶段列表：

```javascript
["phaseZhunbei", "phaseJudge", "phaseDraw", "phaseUse", "phaseDiscard", "phaseJieshu"]
```

回合开始时会触发 `phaseBefore` → 更新 `game.phaseNumber` → 判断 `roundStart` → 推入 `globalHistory/actionHistory/stat` → 触发 `phaseBeforeStart` → `phaseBeforeEnd` → 检查翻面跳过 → 设置 `_status.currentPhase` → 触发 `phaseBeginStart` → `phaseBegin`。

六个标准阶段：
- **phaseZhunbei**（准备阶段）：记录日志，触发 `phaseZhunbei`
- **phaseJudge**（判定阶段）：收集判定区牌，逐张处理，执行 `player.judge`
- **phaseDraw**（摸牌阶段）：触发 `phaseDrawBegin1/2`，默认摸 `event.num` 张牌（默认 2）
- **phaseUse**（出牌阶段）：重置技能/卡牌使用统计，触发 `phaseUseBefore/Begin`，创建 `player.chooseToUse()`，反复使用牌/技能后通过 `event.goto(3)` 回到选择步骤
- **phaseDiscard**（弃牌阶段）：计算 `player.needsToDiscard()`，触发 `phaseDiscard`，执行 `player.chooseToDiscard`
- **phaseJieshu**（结束阶段）：记录日志，触发 `phaseJieshu`

阶段全部结束后触发 `phaseEnd` → `phaseAfter` → 清理 `_status.currentPhase`。

### 23.9 一句话总结

项目启动阶段主要是在装配运行环境和模式数据；真正进入游戏后，根事件 `"game"` 执行当前模式的 `start`，模式负责选将、触发 `gameStart`、初始摸牌，最后创建 `phaseLoop`。此后对局由 `phaseLoop → phase → 阶段事件 → 子事件/技能事件` 这条事件链持续推进。

***

## 24. 项目运行指南

### 24.1 安装环境

#### Node.js (^20.19.0 || >=22.12.0)

打开 [Node.js 官方下载页面](https://nodejs.org/)，下载最新版本。

- Windows：下载 `.msi` 安装包，点击"下一步"直到安装完成。
- macOS：下载 `.pkg` 安装包，双击安装。

验证（输出版本号）：
```bash
node -v
npm -v
```

#### pnpm (>=9)

在命令行输入：
```bash
npm install -g pnpm
```

验证（输出版本号）：
```bash
pnpm -v
```

### 24.2 安装依赖

在项目根目录执行：
```bash
pnpm install
```

### 24.3 启动项目

#### 开发环境

执行：
```bash
pnpm dev
```

使用 vite 服务器开发。浏览器会自动打开，占用本地的 8080 端口和 8089 端口。

#### 构建项目

- **打包代码**（只包含运行时必要的代码）：
  ```bash
  pnpm build
  ```

- **打包离线包**（包含完整源代码以及这个版本更新的素材）：
  ```bash
  pnpm generateTestPack
  ```

- **打包完整包**（包含完整源代码、所有素材和所有内置扩展）：
  ```bash
  pnpm build
  ```

#### 语法检查

执行：
```bash
pnpm lint
```

进行 eslint 检查，如果没有任何输出即可提交，否则请检查提示位置。

### 24.4 常见问题

**Q: 执行 npm 命令时提示"无法加载文件，因为在此系统上禁止运行脚本"**

A: 使用管理员权限打开 VSCode。如果仍未解决，请先在命令行输入以下命令：
```powershell
set-executionpolicy remotesigned -scope currentuser
```

**Q: 如何在本地打包 Electron 程序（Windows 系统）？**

A: 请先确保以下命令能够正常执行：
```bash
pnpm dev
pnpm build      # 输出在 ./dist 文件夹
```
然后在项目根目录执行打包命令：
```bash
pnpm -F @noname/electron build:win
```
构建结果输出到 `./output/` 文件夹，其中 `./output/win-uppackd/noname.exe` 可直接运行。若构建时有网络问题，请设置 mirror 或添加代理。

**Q: 如何在本地打包 Electron 程序（macOS 系统）？**

A: 请先确保 `pnpm dev` 和 `pnpm build` 能正常执行，然后在项目根目录执行：
```bash
pnpm -F @noname/electron build:mac
```
构建结果输出到 `./output/` 文件夹。由于旧 Mac 使用 Intel 芯片、新 Mac 使用 ARM 芯片，可修改配置文件 `./apps/electron/build.ts`，例如针对 Intel 芯片：
```javascript
main(Platform.MAC.createTarget("dmg", Arch.x64), {
    mac: { identity: null },
});
```
若构建 dmg 有报错，可先构建为 zip 版：
```javascript
main(Platform.MAC.createTarget("zip", Arch.x64), {
    mac: { identity: null },
});
```

**Q: 如何在本地开启联机服务器（Windows 系统）？**

A: 在项目根目录执行命令，启动 ws 服务：
```bash
pnpm -F @noname/server dev
```
这条命令启动 ws 服务，监听本地的 8082 端口。在联机模式中，地址填写为 `localhost:8082` 即可进入联机大厅。

***

# 附录：编码规范与常见陷阱（AI参考）

> **本章节专供 AI 编码时快速查阅，包含所有易错点、规范写法、函数用法等。**

## 1. 代码风格规范

### 1.1 相等比较运算符

```javascript
// ✅ 正确：严格相等
if (get.type(card) === "basic")
if (event.type === "discard")
if (target !== player)

// ❌ 错误：宽松相等（会导致类型转换问题）
if (get.type(card) == "basic")
```

### 1.2 存在判断方法

```javascript
// ✅ 正确：语义化方法
return player.hasCards("h");
return player.hasDiscardableCards(player, "h", { suit: "heart" });
return player.hasMark("skillName");          // 替代 countMark() > 0
return player.countDiscardableCards(player, "ej");  // 精确判断可操作牌数
return player.countGainableCards(player, "h");      // 精确判断可获取牌数

// ✅ 正确：使用内置过滤器
filterTarget: lib.filter.notMe,  // 替代手动 target !== player

// ❌ 错误：手动判断长度
return player.countCards("h") > 0;
```

### 1.3 可选链操作符

```javascript
// ✅ 正确：安全访问深层属性
if (event.cards?.length > 0)
if (trigger.getParent()?.cards)
const value = card.storage?.dcfuyue_name;

// ❌ 错误：可能报错
if (event.cards && event.cards.length > 0)
```

### 1.4 nullish 合并运算符

```javascript
// ✅ 正确：只在 null/undefined 时使用默认值
const value = player.storage.count ?? 0;

// ❌ 错误：0、""、false 也会触发默认值
const value = player.storage.count || 0;
```

### 1.5 事件获取方法

```javascript
// ✅ 正确：使用官方 API
return get.event().suit;
return get.event().player;

// ❌ 错误：直接访问内部对象
return _status.event.suit;
```

### 1.6 字符串中的引号规范

**【强制】** 所有文本内容（prompt、log、翻译等）必须使用**中文引号** `“”`，禁止英文引号 `""`。

```javascript
// ✅ 正确
prompt: "文澜：选择至多两张不为“赋”的手牌标记为“赋”"

// ❌ 错误（会导致语法错误）
prompt: "文澜：选择至多两张不为"赋"的手牌"
```

### 1.7 被动技 check 函数准则

**【强制】** 被动技（触发技）必须添加 `check` 函数，用于 AI 判断是否发动技能。

```javascript
// ✅ 正确：添加 check 函数
skillName: {
    trigger: { player: "damage" },
    filter(event, player) {
        return true;
    },
    check(event, player) {
        return true;  // 或根据条件返回 true/false
    },
    async content(event, trigger, player) {
        // 技能逻辑
    },
},

// ❌ 错误：缺少 check 函数（AI 会默认发动，可能导致攻击队友）
skillName: {
    trigger: { player: "damage" },
    filter(event, player) {
        return true;
    },
    async content(event, trigger, player) {
        // 技能逻辑
    },
},
```

**check 函数返回值说明：**

| 返回值     | AI 行为                  |
| ------- | ---------------------- |
| `true`  | AI 会发动技能               |
| `false` | AI 不会发动技能              |
| 数值      | 正数=发动，负数=不发动，数值越大越倾向发动 |

**常见 check 写法示例：**

```javascript
// 简单判断
check(event, player) {
    return player.hp > 1;  // 体力大于1时发动
},

// 收益评估
check(event, player) {
    return get.effect(event.target, { name: "sha" }, player, player) > 0;
},

// 条件组合
check(event, player) {
    if (player.hp <= 1) return false;
    if (player.countCards("h") < 2) return false;
    return true;
},
```

***

## 2. 函数与方法写法

### 2.1 chooseControl 方法

**【强制】使用对象形式参数**：新版 API 推荐使用对象形式传递参数，而非无序数组形式，提高代码可维护性。

```javascript
// ✅ 推荐：对象形式参数（新版 API）
const result = await player
    .chooseControl({
        controls: ["选项一", "选项二"],
        choiceList: ["选项一描述", "选项二描述"],
        prompt: "提示文字",
        ai() {
            const evt = get.event();
            // AI 选择逻辑
            return "选项一";
        },
    })
    .set("customVar", customValue)  // 外部变量通过 set 传入
    .forResult();

// ❌ 旧版：无序数组形式（可维护性差）
const result = await player
    .chooseControl(["选项一", "选项二"])
    .set("choiceList", choiceList)
    .set("prompt", "提示文字")
    .set("ai", () => "选项一")
    .forResult();
```

**【强制】取消控件统一使用 `cancel2`**：取消操作的控件名称必须使用标准命名 `cancel2`，而非自定义字符串如"取消"。

```javascript
// ✅ 正确：使用标准 cancel2
choices.push("cancel2");
const result = await player.chooseControl({
    controls: choices,
    choiceList: choiceList,
    prompt: promptText,
    ai() {
        return "cancel2";
    },
}).forResult();
event.result = {
    bool: result.control !== "cancel2",
    cost_data: result.control,
};

// ❌ 错误：使用自定义字符串
choices.push("取消");
event.result = {
    bool: result.control !== "取消",  // 不符合标准规范
};
```

**【强制】联机适配：** 当 `ai` 回调中需要引用外层变量时，必须通过 `.set()` 传递，内部用 `get.event()` 获取，否则联机时变量不可用。

```javascript
// ✅ 正确：通过 set 传递变量，ai 内用 get.event() 获取
const heSuits = ["heart", "diamond"];
const result = await player
    .chooseControl({
        controls: heSuits,
        prompt: "请选择要保留的花色",
        ai() {
            const player = get.player();
            const heSuits = get.event().heSuits;
            let max = -1;
            let best = heSuits[0];
            // ...
            return best;
        },
    })
    .set("heSuits", heSuits)
    .forResult();

// ❌ 错误：ai 回调中直接引用外层变量（联机时不可用）
const heSuits = ["heart", "diamond"];
const result = await player
    .chooseControl(heSuits)
    .set("ai", () => {
        // heSuits 在联机时可能为 undefined！
        let best = heSuits[0];
        return best;
    })
    .forResult();
```

### 2.2 chooseCard 方法

**【强制】使用对象形式参数**：新版 API 推荐使用对象形式传递参数，而非无序参数形式，提高代码可维护性。

```javascript
// ✅ 推荐：对象形式参数（新版 API）
const result = await player
    .chooseCard({
        position: "he",              // 位置：h=手牌 e=装备 he=手牌+装备
        forced: true,                // 是否强制选择
        selectCard: [0, Infinity],   // [最小, 最大] 数量范围
        filterCard(card) {           // 过滤条件
            return get.color(card) === "black";
        },
        prompt: "提示文字",
    })
    .set("ai", card => get.value(card))  // AI选牌优先级
    .forResult();

// ❌ 旧版：无序参数形式（可维护性差）
const result = await player.chooseCard("he", true, "提示文字", card => get.color(card) === "black").forResult();

// 检查结果
if (!result.bool || !result.cards?.length) {
    return;  // 取消或无选择
}
```

### 2.3 chooseTarget 方法

**【强制】使用对象形式参数**：新版 API 推荐使用对象形式传递参数，而非位置参数形式，提高代码可维护性。

```javascript
// ✅ 推荐：对象形式参数（新版 API）
const result = await player
    .chooseTarget({
        prompt: get.prompt(event.skill),      // 提示文本
        prompt2: "详细说明文字",               // 详细说明（可选）
        selectTarget: [1, Infinity],          // 目标数量范围：[min, max] 或具体数字
        filterTarget(card, player, target) {  // 目标筛选条件
            return target !== player && target.isAlive();
        },
        ai(target) {                          // AI评估函数
            const player = get.player();
            return -get.attitude(player, target);
        },
    })
    .forResult();

// ❌ 旧版：位置参数形式（可维护性差）
const result = await player
    .chooseTarget(
        [1, Infinity],                        // 参数1：数量范围
        "选择目标",                            // 参数2：提示文本 => target !== player,  // 参数3：筛选函数
    )
    .set("ai", target => -get.attitude(get.player(), target))
    .forResult();

// 检查结果
if (!result?.bool || !result.targets?.length) {
    return;  // 取消或无选择
}
```

**参数说明**：

| 属性 | 类型 | 说明 |
|------|------|------|
| `prompt` | string | 主提示文本 |
| `prompt2` | string | 详细说明文本（可选） |
| `selectTarget` | number \| [min, max] | 目标数量范围，默认为 1 |
| `filterTarget` | function | 目标筛选函数，返回 boolean |
| `ai` | function | AI评估函数，返回数值（越大越优先） |
| `multitarget` | boolean | 是否允许多目标选择 |

### 2.4 gain/lose 方法

**【强制】从牌堆获得牌使用 `draw2` 动画**：当从牌堆正面向上获得牌时，应使用 `draw2` 动画而非 `gain2`，以准确表示"抽牌"的视觉效果。

```javascript
// ✅ 正确：从牌堆获得使用 draw2（表示抽牌动画）
await player.gain(cards, "draw2");       // 从牌堆正面向上获得

// ✅ 其他场景使用 gain2（表示获得动画）
await player.gain(cards, "gain2");       // 从其他来源获得并展示
await player.gain(cards, "log");         // 获得但不展示来源
```

**【强制】** `gain()` 返回的是 Step 对象，必须 `await`，否则后续逻辑可能在获得牌之前执行。

```javascript
// ✅ 正确：await gain
const next = player.gain(card, "gain2");
next.gaintag.add("skillName");
await next;

// ❌ 错误：缺少 await（后续逻辑可能在获得牌之前执行）
const next = player.gain(card, "gain2");
next.gaintag.add("skillName");
// 没有 await，后续代码可能在牌获得前执行
```

**【强制】** `gain()` 自带日志和动画，不需要额外 `game.log`。

```javascript
// ✅ 正确：gain 自带日志
await player.gain(card, "gain2");

// ❌ 错误：额外打印日志（gain 已自动记录）
await player.gain(card, "gain2");
game.log(player, "获得了", card);  // 重复！
```

```javascript
// gainPlayerCard - 对象参数
await target.gainPlayerCard({
    target: source,
    position: "he",
    forced: true,
});

// lose - 对象参数形式
await target.lose({
    cards: hs,
    position: ui.cardPile,
    insert_card: true,
});
```

**批量从多个目标获得牌使用 `gainMultiple`**：当需要"从每名角色区域里各获得一张牌"时，用 `gainMultiple` 替代循环调用 `gainPlayerCard`，代码更短、结算更快，且自带 `gaintag` 支持。

```javascript
// ✅ 正确：查找所有符合条件的角色并按座次排序，一次性批量获得
const targets = game.filterPlayer(current => current !== source && current.hasCards('hej')).sortBySeat();
if (targets.length) await source.gainMultiple(targets, 'hej');

// ❌ 错误：循环逐个 gainPlayerCard（冗长且慢）
for (const target of targets) {
    await source.gainPlayerCard({ target, position: 'hej', forced: true }).forResult();
}
```

**注意：** 使用前需确认 `gainMultiple(targets, pos)` 的引擎语义确实是"从每个目标各获得一张牌"（志夏侯徽【折愿】今效果即此写法）。

### 2.5 async/await 强制要求

**【强制】所有新技能必须使用** **`async content`，禁止使用 step 系统。**

```javascript
// ✅ 正确：async content（线性执行）
async content(event, trigger, player) {
    const result = await player.chooseCard(...).forResult();
    if (!result.bool) return;          // 直接 return 结束
    await player.discard(result.cards); // await 等待完成
    game.log(player, "发动了技能");
}

// ❌ 错误：step 系统（变量作用域丢失、调试困难）
content() {
    "step 0";
    player.chooseCard(...);
    "step 1";
    if (!result.bool) { event.finish(); return; }  // 必须手动 finish
}
```

### 2.6 不可 await 的调度型调用

**【强制】** 以下函数会将创建的事件从当前 `next` 移除并挂到其他事件队列（`after` 或父级 `next`），**不可 await**，否则会卡死或破坏调度顺序：

| 函数 | 原因 | 正确写法 |
| --- | --- | --- |
| `event.insertAfter(content, map)` | 事件放入当前事件的 `after` 队列 | `event.insertAfter(content, { player })` |
| `player.showCharacter(num, log)` | 非useSkill/trigger时移到父事件 `after` | `player.showCharacter(0)` |
| `player.insertPhase(skill, insert)` | 新phase插入到父级/回合循环队列 | `player.insertPhase()` |
| `player.changeZhuanhuanji(skill)` | 内部创建事件移到 `after`，不返回可等待的GameEvent | `player.changeZhuanhuanji("skillName")` |
| `player.logSkill(name, targets)` | 内部创建事件移到 `after`，不返回可等待的GameEvent | `player.logSkill("skillName", targets)` |

```javascript
// ✅ 正确：调度型调用直接执行，不 await
event.insertAfter(content, { player });
player.showCharacter(0);
player.insertPhase();
player.changeZhuanhuanji("skillName");
player.logSkill("skillName", targets);

// ❌ 错误：await 调度型调用会卡死
await event.insertAfter(content, { player });   // 事件在 after 中，不在当前 next
await player.showCharacter(0);                   // 事件被移到父级 after
await player.insertPhase();                      // phase 在父级队列中
```

**识别规则**：只要看到 `event.next.remove(next)` 后将 next push 到别的事件的 `next/after`，就不可 await 该 next。

### 2.7 体力值使用 player.getHp()

**【强制】** 获取体力值必须使用 `player.getHp()`，禁止直接访问 `player.hp`。

```javascript
// ✅ 正确：使用 player.getHp()
if (player.countCards("h") > player.getHp()) { ... }
const hp = player.getHp();

// ❌ 错误：直接访问 player.hp（可能不准确，未考虑护甲等因素）
if (player.countCards("h") > player.hp) { ... }
```

### 2.8 addSkill/addSkills 与 removeSkill/removeSkills 区别

**【强制】** `addSkill`/`removeSkill` 仅用于添加/移除状态技（如张松【强识】的额外效果），获得/失去技能一律使用 `addSkills`/`removeSkills`。

| 方法 | 说明 | 使用场景 |
|------|------|----------|
| `addSkill(skill)` | 直接添加技能到 `player.skills` 数组 | 仅用于添加状态技（无动画） |
| `addSkills(skill, popup)` | 通过 `changeSkills` 事件添加技能 | 获得技能（有动画和日志） |
| `removeSkill(skill)` | 直接从 `player.skills` 数组移除技能 | 仅用于移除状态技（无动画） |
| `removeSkills(skill, popup)` | 通过 `changeSkills` 事件移除技能 | 失去技能（有动画和日志） |

**addSkill/removeSkill 特点**：
- 直接操作 `player.skills` 数组
- 支持单个技能或技能数组
- 不创建事件，无动画提示
- 参数：`skill, forceRemove`
- **仅用于添加/移除状态技**（如张松【强识】的额外效果）

**addSkills/removeSkills 特点**：
- 通过 `changeSkills` 事件添加/移除技能
- 支持单个技能或技能数组
- 创建事件，有动画和日志效果
- 参数：`skill, popup = true`
- **获得/失去技能一律使用此方法**

```javascript
// ✅ 正确：添加状态技使用 addSkill
async content(event, trigger, player) {
    player.addSkill("qiangshi_extra");  // 状态技，无动画
}

// ✅ 正确：获得技能使用 addSkills
async content(event, trigger, player) {
    await player.addSkills("newSkill");  // 获得技能，有动画和日志
}

// ✅ 正确：移除状态技使用 removeSkill
async content(event, trigger, player) {
    player.removeSkill("qiangshi_extra");  // 状态技，无动画
}

// ✅ 正确：失去技能使用 removeSkills
async content(event, trigger, player) {
    await player.removeSkills("oldSkill");  // 失去技能，有动画和日志
}

// ✅ 正确：同时添加和移除技能使用 changeSkills
async content(event, trigger, player) {
    // 同时添加新技能并移除旧技能（一个事件完成）
    await player.changeSkills(["newSkill"], ["oldSkill"]);
}

// ❌ 错误：获得技能使用 addSkill（无动画，不符合规范）
async content(event, trigger, player) {
    player.addSkill("newSkill");  // 不符合规范，应使用 addSkills
}

// ❌ 错误：失去技能使用 removeSkill（无动画，不符合规范）
async content(event, trigger, player) {
    player.removeSkill("oldSkill");  // 不符合规范，应使用 removeSkills
}
```

**注意**：`addSkills`/`removeSkills`/`changeSkills` 返回事件对象，可以 `await` 等待动画完成。`addSkill`/`removeSkill` 直接返回，不需要 `await`。

**状态技示例**：张松【强识】额外效果、临时buff技能、charlotte技能等。

### 2.8.1 同时添加和移除技能：使用 `player.changeSkills`

当需要**同时**添加新技能并移除旧技能（如觉醒技），使用 `player.changeSkills` 代替分别调用 `addSkills` 和 `removeSkills`。

```javascript
// ✅ 推荐：使用 changeSkills 一次性完成
async content(event, trigger, player) {
    // 同时添加【溺尊】并移除【典易】
    await player.changeSkills(["mbnizun"], ["mbdianyi"]);
    // 然后增加体力上限和回复体力
    await player.gainMaxHp(x);
    await player.recover(x);
}

// ❌ 不推荐：分别调用 addSkills 和 removeSkills（两个事件）
async content(event, trigger, player) {
    await player.removeSkills("mbdianyi");  // 先移除（触发 changeSkillsAfter）
    await player.addSkills("mbnizun");      // 再添加（再次触发 changeSkillsAfter）
    // 会导致两次事件触发，可能影响其他技能的监听
}
```

**关键点**：

| 方法 | 说明 | 事件触发 |
|------|------|----------|
| `changeSkills(addList, removeList)` | 同时添加和移除技能 | 触发一次 `changeSkillsAfter` |
| `addSkills + removeSkills` | 分别添加和移除 | 触发两次 `changeSkillsAfter` |

**优势**：
- 只触发一次 `changeSkillsAfter` 事件，避免重复触发
- 代码更简洁，逻辑更清晰
- 动画效果更流畅（一次完成）

### 2.9 监听技能变化事件

**【推荐】** 监听角色获得/失去技能时，使用 `changeSkillsAfter` 事件，而非 `addSkillAfter`/`removeSkillAfter`。

| 事件 | 说明 | 适用场景 |
|------|------|----------|
| `changeSkillsAfter` | 技能变化后触发（包括添加和移除） | 监听 `addSkills`/`removeSkills` |
| `addSkillAfter` | 技能添加后触发 | 仅监听 `addSkill`（不监听 `addSkills`） |
| `removeSkillAfter` | 技能移除后触发 | 仅监听 `removeSkill`（不监听 `removeSkills`） |

**关键区别**：
- `addSkills`/`removeSkills` 会触发 `changeSkillsAfter` 事件
- `addSkill`/`removeSkill` 会触发 `addSkillAfter`/`removeSkillAfter` 事件
- 因此监听获得技能应使用 `changeSkillsAfter`

```javascript
// ✅ 正确：监听 addSkills 获得技能
subSkill: {
    addSkill: {
        trigger: { global: "changeSkillsAfter" },
        filter(event, player) {
            return event.addSkill.includes("skillName");  // 检查是否添加了指定技能
        },
        async content(event, trigger, player) {
            // 触发时技能已添加完成
            game.log(player, "获得了技能");
        },
    },
}

// ❌ 错误：监听 addSkillAfter 无法捕获 addSkills
subSkill: {
    addSkill: {
        trigger: { player: "addSkillAfter" },
        filter(event, player) {
            return event.skill === "skillName";  // 只能捕获 addSkill，无法捕获 addSkills
        },
        async content(event, trigger, player) {
            // 使用 addSkills 获得技能时不会触发
        },
    },
}
```

**event 对象属性**：
- `event.addSkill` - 添加的技能数组（`Array<string>`）
- `event.removeSkill` - 移除的技能数组（`Array<string>`）
- `event.player` - 技能变化的角色

**检查技能是否被添加**：
```javascript
// ✅ 正确：使用 includes 检查数组
filter(event, player) {
    return event.addSkill.includes("djsj");  // 检查是否添加了水晶技能
}

// ✅ 正确：检查多个技能
filter(event, player) {
    return event.addSkill.some(skill => ["skill1", "skill2"].includes(skill));
}

// ❌ 错误：直接访问 event.skill（不存在）
filter(event, player) {
    return event.skill === "djsj";  // event.skill 不存在！
}
```

**示例：迪迦水晶获得复合**：
```javascript
djsj: {
    trigger: { global: "gameStart" },  // 游戏开始时获得复合
    async content(event, trigger, player) {
        await player.addSkills("djfuhe");
    },
    group: ["djsj_addSkill"],
    subSkill: {
        addSkill: {
            trigger: { global: "changeSkillsAfter" },  // 监听技能变化
            filter(event, player) {
                return event.addSkill.includes("djsj");  // 检查是否添加了水晶技能
            },
            async content(event, trigger, player) {
                await player.addSkills("djfuhe");  // 获得水晶时自动获得复合
            },
        },
    },
}
```

***

## 3. 触发器相关陷阱

### 3.1 trigger.card vs trigger.cards

| 属性                 | 说明             | 适用场景          |
| ------------------ | -------------- | ------------- |
| `trigger.card`     | 虚拟卡牌（viewAs结果） | 只需卡牌名称        |
| `trigger.cards[0]` | 实际消耗的原始卡牌      | 需要 storage 信息 |

```javascript
// ⚠️ 通过 viewAs 使用牌时，trigger.card 是虚拟的，没有原始 storage
const currCard = trigger.cards?.[0] || trigger.card;  // 安全写法
const isFu = currCard.storage?.dcfuyue_name;            // 用 storage 判断而非 hasGaintag
```

### 3.2 hasGaintag 的局限性

```javascript
// ⚠️ 牌离开手牌区域后，hasGaintag() 可能失效
// ✅ 改用 storage 判断
const prevIsFu = prevCard.storage?.dcfuyue_name;   // 正确
const prevIsFu = prevCard.hasGaintag("赋");         // 可能错误
```

### 3.3 子技能 firstDo 执行顺序

```javascript
group: ["mainSkill_pre", "mainSkill_post"],
subSkill: {
    pre: {
        firstDo: true,  // 在主 skill filter 检查之前执行
        trigger: { player: "useCardAfter" },
        async content(event, trigger, player) {
            // 记录数据 → 主技能 filter 可以读取到
            player.storage.xxx.prevCard = trigger.card;
        },
    },
    post: {
        // 没有 firstDo → 在主技能 content 之后执行
        trigger: { player: "useCardAfter" },
        async content(event, trigger, player) {
            // 主技能 content 已完成 → 可以读取主技能修改的数据
        },
    },
},
```

### 3.4 enable 与 hiddenCard 配合

```javascript
skillName_use: {
    enable: ["chooseToUse", "chooseToRespond"],     // 主动/响应时可用
    hiddenCard(player, name) {                       // 告诉系统可视为该牌名
        const cards = player.getCards("hes", card =>
            card.hasGaintag("X") && card.storage?.name === name
        );
        return cards.some(card => card.storage?.name === name);
    },
    ai: {
        respondSha: true,      // 声明可响应杀
        respondShan: true,     // 声明可响应闪
        respondWuxie: true,    // 声明可响应无懈可击 ← 关键！
        skillTagFilter(player, tag) {
            // 配合 hiddenCard 使用
            if (tag === "respondWuxie") return hasWuxie;
            // ...
        },
    },
},
```

**注意：** 缺少 `hiddenCard` + `respondWuxie` + `skillTagFilter` 任一都会导致无懈可击无法触发。

### 3.5 额外结算触发：用 `hasHistory` 检查使用历史，替代 `hasGaintag`

**【强制】** 实现卡牌额外结算效果时，通过 `hasHistory('lose', ...)` 检查本次使用事件中失去的牌的 `gaintag_map`，不要直接检查卡牌的 `hasGaintag`（卡牌区域变化后标记可能丢失）。

```javascript
// ✅ 正确：通过 hasHistory 检查本次使用事件中失去的牌的 gaintag_map
double: {
    trigger: { player: 'useCard' },
    filter(event, player) {
        if (!event.cards || event.cards.length !== 1) return false;  // 确保单牌
        return player.hasHistory('lose', evt => {
            if ((evt.relatedEvent || evt.getParent()) !== event) return false;
            return Object.values(evt.gaintag_map).flat().includes('wechatjueyi');
        });
    },
    forced: true,
    async content(event, trigger, player) {
        trigger.effectCount++;  // 直接自增，引擎会自动初始化
    },
}

// ❌ 错误：直接检查卡牌 hasGaintag（卡牌区域变化后标记可能丢失）
filter(event, player) {
    const card = event.card;
    return [card].concat(card.cards || []).some(cardx => 
        get.itemtype(cardx) === 'card' && cardx.hasGaintag('eternal_wechatjueyi'));
},
```

**关键点**：
1. `event.cards.length === 1` 确保只对单牌触发（避免多目标牌多次结算）
2. `hasHistory('lose', ...)` 检查本次使用事件关联的失去牌历史
3. `evt.gaintag_map` 是失去牌时记录的 gaintag 映射，比直接检查卡牌标记更可靠
4. `trigger.effectCount++` 引擎会自动初始化，无需 `(trigger.effectCount || 0) + 1`

***

## 4. Storage 操作规范

### 4.1 Storage 赋值必须重新引用

```javascript
// ✅ 正确：修改后重新赋值
const storage = player.storage.skillName;
storage.count += 1;
storage.prevCard = trigger.card;
player.storage.skillName = storage;  // 必须！否则 UI 不更新

// ❌ 错误：直接修改属性不触发更新
player.storage.skillName.count += 1;
```

### 4.2 Storage 初始化与清理

```javascript
// ✅ 正确：使用 init 初始化 storage
skillName: {
    init(player, skill) {
        if (!player.storage[skill]) {
            player.storage[skill] = { count: 0, data: null };
        }
    },
    // 后续 filter/content 中用 getStorage 带默认值访问
    filter(event, player) {
        const storage = player.getStorage("skillName", { count: 0, data: null });
        // ...
    },
},

// ❌ 错误：在 filter 中手动初始化 storage（每次触发都检查，且联机可能出问题）
filter(event, player) {
    if (!player.storage.skillName) {
        player.storage.skillName = { count: 0, data: null };
    }
    // ...
},
```

```javascript
// 清理特定字段
delete player.storage.skillName_prevCard;

// 完全重置
player.storage.skillName = { count: 0, data: null };
```

### 4.3 卡牌 Storage 持久性

```javascript
// 卡牌被使用/打出后，storage 数据仍然保留
// 但 hasGaintag() 可能失效
card.storage.dcfuyue_name = "sha";  // 持久有效
card.addGaintag("赋");              // 可能失效
```

### 4.3b 移除 gaintag 后标记自动消除

移除 gaintag 后，对应的 mark 标记会自动消除，不需要手动清理。

```javascript
// ✅ 正确：移除 gaintag 即可，标记自动消除
player.removeGaintag("skillName_mark");

// ❌ 错误：移除 gaintag 后又手动清理标记（多余操作）
const tags = player.getCards("he", card => card.gaintag?.some(t => t.startsWith("skillName_mark")));
if (tags.length) {
    const tagList = tags.slice().map(card => card.gaintag.find(t => t.startsWith("skillName_mark"))).unique();
    tagList.forEach(tag => player.removeGaintag(tag));
}
```

### 4.4 使用 player.getStorage() 替代直接访问

```javascript
// ✅ 正确：使用 getStorage 带默认值
const storage = player.getStorage("skillName", {});
const list = player.getStorage("skillName", []);

// ❌ 错误：直接访问可能为 undefined
const storage = player.storage.skillName || {};
```

### 4.5 使用 player.markAuto() 替代手动数组操作

```javascript
// ✅ 正确：使用 markAuto 自动去重添加
player.markAuto("skillName", [cardName]);
// 自动去重、自动 markSkill

// ❌ 错误：手动操作数组
if (!player.storage.skillName) player.storage.skillName = [];
if (!player.storage.skillName.includes(cardName)) {
    player.storage.skillName.push(cardName);
}
player.markSkill("skillName");
```

### 4.6 使用 player.setStorage() 替代直接赋值

```javascript
// ✅ 正确：使用 setStorage 自动触发更新
player.setStorage("skillName", newValue, true);

// ❌ 错误：直接赋值可能不触发 UI 更新
player.storage.skillName = newValue;
```

### 4.7 联机兼容：避免手动初始化 Storage

**【强制】** 为确保联机模式兼容，禁止在 `filter` 或 `content` 中手动初始化 `player.storage` 或 `card.storage`。应使用引擎提供的 API 自动处理。

#### 问题原因

联机模式下，手动初始化 storage 会导致：
1. **主机端和客机端状态不同步**：客机端可能无法正确获取 storage 初始值
2. **断线重连后状态丢失**：手动初始化的数据不在 `_status.postReconnect` 中
3. **服务器卡死**：大量 storage 操作增加网络同步负担

#### 正确做法

##### 1. 使用 `getStorage` 带默认值访问（替代手动初始化）

```javascript
// ✅ 正确：使用 getStorage 带默认值，无需 init
filter(event, player) {
    const storage = player.getStorage("skillName", { count: 0, list: [] });
    return storage.count > 0;
},
async content(event, trigger, player) {
    const storage = player.getStorage("skillName", { count: 0, list: [] });
    storage.count++;
    player.setStorage("skillName", storage, true);
},

// ❌ 错误：手动初始化 storage（联机可能不同步）
init(player, skill) {
    if (!player.storage[skill]) {
        player.storage[skill] = { count: 0, list: [] };
    }
},
```

##### 2. 使用 `markAuto` 替代手动数组操作

```javascript
// ✅ 正确：使用 markAuto 自动去重添加
async content(event, trigger, player) {
    const card = trigger.cards?.[0];
    player.markAuto("skillName", [card]);  // 自动去重、自动 markSkill
},

// ❌ 错误：手动操作数组（联机可能不同步）
async content(event, trigger, player) {
    if (!player.storage.skillName) player.storage.skillName = [];
    if (!player.storage.skillName.includes(card)) {
        player.storage.skillName.push(card);
    }
    player.markSkill("skillName");
},
```

##### 3. 使用 `game.broadcastAll` 同步卡牌 storage

当需要修改 `card.storage` 时，使用 `game.broadcastAll` 确保所有端同步：

```javascript
// ✅ 正确：使用 broadcastAll 同步
const markAsFu = card => {
    const randomName = fuCardPool.randomGet();
    game.broadcastAll((card, name) => {
        card.storage ??= {};
        card.storage.skillName_name = name;
    }, card, randomName);
    card.addGaintag("skillName_tag");
    card.addGaintag(get.translation(randomName));
};

// ❌ 错误：直接修改 card.storage（联机不同步）
const markAsFu = card => {
    const randomName = fuCardPool.randomGet();
    card.storage = card.storage || {};
    card.storage.skillName_name = randomName;  // 客机端看不到这个修改！
    card.addGaintag("skillName_tag");
};
```

##### 4. 使用常量标签名替代字符串硬编码

```javascript
// ✅ 正确：使用常量标签名
card.addGaintag("skillName_tag");
card.hasGaintag("skillName_tag");

// ❌ 错误：字符串硬编码（容易冲突、难以维护）
card.addGaintag("赋");
card.hasGaintag("赋");
```

#### 完整示例

```javascript
skillName: {
    // 不需要 init！使用 getStorage 带默认值
    trigger: { player: "useCardAfter" },
    filter(event, player) {
        const list = player.getStorage("skillName", []);
        return list.length < 5;
    },
    async content(event, trigger, player) {
        const card = trigger.cards?.[0];
        if (!card) return;
        // 使用 markAuto 自动去重添加
        player.markAuto("skillName", [card]);
        game.log(player, "记录了", card);
    },
    marktext: "记",
    intro: {
        name: "记录",
        mark(dialog, storage, player) {
            const list = player.getStorage("skillName", []);
            if (list.length === 0) {
                dialog.addText("暂无记录");
            } else {
                dialog.addSmall(list);
            }
        },
    },
},
```

#### 关键要点总结

| 操作 | 错误做法 | 正确做法 |
|------|---------|---------|
| 初始化 storage | `init` 中手动初始化 | 使用 `getStorage(key, defaultValue)` |
| 数组去重添加 | 手动 `includes` + `push` | 使用 `markAuto(key, array)` |
| 赋值后更新 UI | 直接赋值 `storage.x = v` | 使用 `setStorage(key, value, true)` |
| 卡牌 storage | 直接修改 `card.storage.x` | 使用 `game.broadcastAll` 同步 |
| 标签名 | 字符串硬编码 `"赋"` | 常量 `"skillName_tag"` |
| 直接操作同步 | 操作后不调用任何 mark 方法 | 操作后紧跟同 key 的 `markSkill`/`markAuto`（或 `setStorage(key, value, true)`） |

### 4.7b 豁免规则：直接操作 storage 后紧跟 `markSkill` 也可同步

**【强制规则补充】** 4.1-4.7 推荐使用 `getStorage`/`setStorage`/`markAuto`，但并非唯一正确写法。只要对**同一 key** 的直接操作（`delete player.storage.x`、`player.storage.x = []`、数组 `push` 等）之后，紧跟该 key 的 `markSkill`/`markAuto` 调用，同样能完成联机同步与 UI 更新，无需再调用 `setStorage`。

#### 同步原理（引擎内部机制）

`player.markSkill()` 的实现中，会广播一个携带**该 key 当前完整值**的回调函数到所有客户端：

```javascript
// noname/library/element/player.js markSkill() 内部
func(this.storage[name], this, name, info, card);  // 主机本地执行 player.storage[name] = storage
if (!nobroadcast) {
    game.broadcast(func, this.storage[name], this, name, info, card);  // 客机同步覆盖
}
```

`markAuto` 内部调用 `markSkill`（player.js:10306），因此 `markAuto` 同样携带 storage 值广播。**广播发生时机**是 mark 方法调用的瞬间，所以直接操作必须写在 mark 调用之前，且只能同步被 mark 的那一个 key。

#### 正确写法

```javascript
// ✅ 正确：delete 后紧跟 markSkill，删除状态同步到客机
delete player.storage.skillName;
player.markSkill("skillName");

// ✅ 正确：手动初始化数组 + markAuto（markAuto 内部调 markSkill，自带同步）
player.storage.skillName = [];
player.markAuto("skillName", [card]);

// ✅ 与 setStorage(key, value, true) 等效
player.storage.skillName = newValue;
player.markSkill("skillName");
```

#### 不生效的写法（不会同步）

```javascript
// ❌ setStorage 不带 mark 参数：仅本地赋值，不触发广播
player.setStorage("skillName", newValue);

// ❌ 只调 unmarkSkill：仅广播标记 UI 移除，不携带 storage 值
delete player.storage.skillName;
player.unmarkSkill("skillName");  // 客机 storage 仍保留旧值（下次同 key 的 markSkill 才覆盖）

// ❌ 直接操作 A key 却 mark B key：只同步 B key，A key 不会同步
player.storage.skillName_a = 1;
player.markSkill("skillName_b");

// ❌ 操作后没有任何 mark 调用：纯本地修改，联机不同步（此场景必须 setStorage(key, v, true)）
player.storage.skillName = [];
```

### 4.8 虚拟卡牌可用性检查：使用 `get.autoViewAs` + `evt.filterCard`

在 `chooseButton.filter` 中判断虚拟牌是否可用时，**必须使用 `get.autoViewAs` 创建虚拟卡牌对象**，然后调用 `evt.filterCard` 检查。

#### 正确写法

```javascript
chooseButton: {
    dialog(event, player) {
        // 构建虚拟牌列表
        const list = get.inpileVCardList(([type, _, name]) => {
            // 过滤条件：只显示可用的牌名
            return fuCards.some(card => card.storage.skillName_name === name);
        });
        return ui.create.dialog("选择要使用的牌名", [list, "vcard"]);
    },
    filter(button, player) {
        const evt = get.event().getParent();
        const name = button.link[2];  // vcard 格式: [type, "", name]
        if (!evt?.name) return false;
        // ✅ 关键：使用 get.autoViewAs 创建虚拟卡牌，第二个参数 "unsure" 表示不确定的卡牌
        const vcard = get.autoViewAs({ name }, "unsure");
        // ✅ 然后用 evt.filterCard 检查这张虚拟牌是否可用
        return evt.filterCard(vcard, player, evt);
    },
},
```

#### 关键参数说明

| 参数 | 说明 |
|------|------|
| `{ name }` | 虚拟卡牌的牌名对象 |
| `"unsure"` | 表示这是一张"不确定"的卡牌，用于 filter 检查时不会触发实际使用逻辑 |
| `evt.filterCard(vcard, player, evt)` | 检查虚拟牌在当前事件中是否可用 |

#### 错误写法

```javascript
// ❌ 错误：直接创建简单对象，缺少必要的卡牌属性
const vcard = { name: name, isCard: true };
return evt.filterCard(vcard, player, evt);  // 可能报错或返回错误结果

// ❌ 错误：不检查 evt 是否存在
return evt.filterCard({ name }, player, evt);  // evt 为 undefined 时报错
```

### 4.9 全选按钮：使用 `allowChooseAll: true`

当需要让玩家选择多张牌并提供"全选"按钮时，在 `chooseCard` 中设置 `allowChooseAll: true`。

#### 正确写法

```javascript
const result = await player
    .chooseCard({
        prompt: "选择任意张手牌",
        position: "h",
        selectCard: [1, Infinity],  // 可选 1 到无限张
        filterCard(card) {
            // 过滤条件：只显示可选的牌
            return !card.hasGaintag("excluded");
        },
        allowChooseAll: true,  // ✅ 关键：启用全选按钮
    })
    .set("ai", card => 5 - get.value(card))
    .forResult();

if (result.bool && result.cards?.length) {
    // result.cards 包含玩家选择的所有牌（可能是全选）
    for (const card of result.cards) {
        // 处理每张牌...
    }
}
```

#### 参数说明

| 参数 | 说明 |
|------|------|
| `selectCard: [min, max]` | 可选牌数范围，`Infinity` 表示无上限 |
| `allowChooseAll: true` | 显示"全选"按钮，玩家可一键选择所有符合条件的牌 |
| `filterCard(card)` | 过滤可选的牌，全选时只会选择符合此条件的牌 |

#### 效果

- 玩家界面会显示"全选"按钮
- 点击"全选"后，自动选择所有符合 `filterCard` 条件的牌
- `result.cards` 包含所有被选中的牌

### 4.10 标记计数：使用子技能 count 而非 sync 函数

当需要根据游戏事件记录并显示标记数量时，**不要使用 `sync` 函数**（遍历历史记录计算总数再 addMark）。这种方式存在以下问题：

1. **多次调用导致翻倍**：sync 函数若在 content、子技能等多处被调用，每次都 addMark 全量数值会导致标记翻倍
2. **性能差**：每次调用都遍历整个 actionHistory
3. **模板过时**：属于早期无名杀写法，已不推荐

#### ❌ 错误示例（sync 模式）

```javascript
skillName: {
    intro: {
        content: "已失去#张装备牌",
    },
    // 遍历历史记录计算总数——容易翻倍！
    sync(player) {
        const history = player.actionHistory;
        let num = 0;
        for (let i = 0; i < history.length; i++) {
            for (let j = 0; j < history[i].lose.length; j++) {
                const es = history[i].lose[j].es;
                if (es?.length) {
                    num += es.filter(card => get.type(card) === "equip").length;
                }
            }
        }
        if (num > 0) {
            player.addMark("skillName", num, false);  // ← 多次调用就翻倍！
        }
    },
    async content(event, trigger, player) {
        lib.skill.skillName.sync(player);     // 第1次调用
        // ... 其他逻辑 ...
        lib.skill.skillName.sync(player);     // 第2次调用 → 翻倍！
    },
    subSkill: {
        count: {
            trigger: { player: "loseEnd" },
            filter(event) { return event.es?.some(c => get.type(c) === "equip"); },
            content() { lib.skill.skillName.sync(player); },  // 第3次调用 → 再翻倍！
        },
    },
},
```

#### ✅ 正确模式（子技能 + markcount）

使用 **`subSkill.count`** 子技能在事件触发时逐次 `addMark(1)`，配合 `intro.markcount` 显示数量：

```javascript
skillName: {
    marktext: "缮",
    intro: {
        name: "缮甲",
        content: "已从装备区失去过#张装备牌",
        // markcount 会自动读取 addMark 的数量并传入 #
        markcount(storage, player) {
            return player.countMark("skillName");
        },
    },
    init(player, skill) {
        if (!player.storage[skill]) {
            player.storage[skill] = 0;
        }
    },
    async content(event, trigger, player) {
        await player.draw(3);
        const num = 3 - player.countMark("skillName");
        let result;
        if (num > 0) {
            result = await player.chooseToDiscard({
                position: "he", forced: true,
                selectCard: num,
                ai: card => -get.value(card),
            }).forResult();
        }
        // 后续逻辑...
    },
    group: ["skillName_count"],  // 注册计数子技能
    subSkill: {
        count: {
            charlotte: true,
            trigger: { player: "loseEnd" },
            filter(event, player) {
                return event.es?.some(card => get.type(card) === "equip");
            },
            firstDo: true,
            forced: true,
            silent: true,
            popup: false,
            content(event, trigger, player) {
                // 每次 loseEnd 触发时 +1，不会翻倍
                const es = event.es.filter(c => get.type(c) === "equip");
                player.addMark("skillName", es.length, false);
            },
        },
    },
},
```

#### 关键区别

| 对比项 | sync 模式 | count 子技能模式 |
|--------|-----------|-----------------|
| 触发方式 | 手动调用 sync() | 自动触发（trigger 监听事件） |
| 计数方式 | 遍历历史算全量 | 每次 +1 增量 |
| 翻倍风险 | 高（多处调用） | 无（每事件只触发一次） |
| 性能 | 差（O(n²) 遍历） | 好（O(1) 直接 +1） |
| 维护性 | 差（需要记住调用位置） | 好（声明式，自动运行） |

#### 适用场景

- **需要用 count 子技能**：统计"失去X张牌"、"造成X次伤害"、"使用X次牌"等**可累加的离散事件**
- **不需要 count 子技能**：标记只是开关状态（有/无），或存储的是复杂对象而非纯数字

> 参考反面案例：mobile 包曹纯【缮甲】(`mbshanjia`) 的 sync 函数因多出调用点导致标记数量翻倍。

### 4.11 临时次数管理：用技能存在判断替代 storage 标记

**【强制】** 当需要管理"下回合可额外使用一次"等临时次数状态时，使用 `addTempSkill` + `hasSkill` 判断，不要用 storage 标记配合多个清理子技能。

```javascript
// ✅ 正确：usable 通过 hasSkill 判断临时技能是否存在
wechatjueyi: {
    usable(skill, player) {
        return player.hasSkill(`${skill}_usable`) ? 2 : 1;
    },
    async content(event, trigger, player) {
        // 交牌成功后添加 effect 子技能
        player.addSkill(`${event.name}_effect`);
    },
    subSkill: {
        // 空技能载体（临时次数标记）
        usable: { charlotte: true },
        // 下回合 phaseBegin 触发的 effect 子技能
        effect: {
            charlotte: true,
            trigger: { player: 'phaseBegin' },
            silent: true,
            async content(event, trigger, player) {
                player.removeSkill(event.name);      // 移除自身
                player.addTempSkill('wechatjueyi_usable');  // 添加临时 usable 载体
            },
        },
    },
}

// ❌ 错误：用 storage 标记 + phaseUseBegin/End 清理 + 多个子技能
usable(skill, player) {
    return player.hasStorage('wechatjueyi_usable2_active') ? 2 : 1;
},
// 需要 phaseUseBegin 检查 flag + phaseUseEnd 清理 active + onremove 清理 storage
// 涉及 flag、active、clean 三个子技能，代码冗余
```

**优势**：
1. `addTempSkill` 自动到期清除，无需手动清理 storage
2. `hasSkill` 判断比 storage 更语义化
3. 减少状态管理代码（无需 flag、active、clean 三个子技能）

***

## 5. 技能标签速查表

| 标签               | 效果        | 常见组合                    |
| ----------------- | --------- | ----------------------- |
| `mod`             | 修改器，被动修正游戏规则 | 默认 `forced: true` → 默认 `locked: true` |
| `forced: true`    | 强制执行，不可取消 | 默认 `locked: true`；+ `locked` = 锁定技 |
| `locked: true`    | 无法被封锁/失效  | + `forced` = 锁定技        |
| `silent: true`    | 不弹窗、不显示   | 用于记录型子技能                |
| `popup: false`    | 不弹出提示框    | + `silent`              |
| `firstDo: true`   | 在同级技能之前执行 | 用于 pre 子技能              |
| `charlotte: true` | 临时技能，自动移除 | + `silent`              |
| `limited: true`   | 限定技       | + `limit: { round: 1 }` |
| `juexingji: true` | 觉醒技       | + `derivation`          |
| `zhuSkill: true`  | 主公技       | 仅主公可使用              |
| `dutySkill: true` | 使命技       | 有阶段性目标              |
| `persevereSkill: true` | 持恒技  | 不可被移除              |

### 常用组合模板

```javascript
// 锁定技（最常用）
{ forced: true, locked: true }

// 静默记录子技能（最常用）
{ forced: true, silent: true, popup: false, firstDo: true }

// 主动技能
{ audio: 2, enable: "phaseUse" }

// 响应技能
{ audio: 2, enable: ["chooseToRespond"] }

// 含mod的锁定技（mod 默认 forced + locked，可不显式写出）
{ mod: { maxHandcard(player, current) { return current + 1; } } }

// 含mod的可选技（须显式覆盖默认值）
{ forced: false, mod: { maxHandcard(player, current) { return current + 1; } } }

// forced 但非锁定技（须显式覆盖默认 locked）
{ forced: true, locked: false }
```

### 重要规则

> **属性默认关系链：** `mod` → 默认 `forced: true` → 默认 `locked: true`
>
> 添加 `mod` 的技能自动获得 `forced: true`，`forced: true` 的技能自动获得 `locked: true`。
>
> **省略写法（利用默认值）：**
>
> | 场景 | 可省略属性 | 示例 |
> |------|----------|------|
> | 含 `mod` 的锁定技 | `forced` 和 `locked` | `{ mod: { ... } }` |
> | 含 `forced: true` 的锁定技 | `locked` | `{ forced: true }` |
>
> **特殊情况必须显式覆盖：**
>
> | 场景 | 必须显式设置 | 示例 |
> |------|------------|------|
> | 含 `mod` 但不需要强制执行 | `forced: false` | `{ forced: false, mod: { ... } }` |
> | 含 `forced: true` 但不属于锁定技 | `locked: false` | `{ forced: true, locked: false }` |
>
> 若不显式覆盖，系统将按默认链推导，可能导致技能无法正确禁用或行为不符合预期。

### 每回合限一次的实现方式

当需要实现"每回合限一次"的限制时，有以下几种方式：

#### 方式一：使用 `usable: 1`（简单场景）

适用于简单的主动技能，不涉及复杂流程。

```javascript
skillName: {
    enable: "phaseUse",
    usable: 1,  // 每回合限一次
    filterCard(card, player) { ... },
    viewAs: { name: "sha" },
}
```

**注意：** `usable` 只统计技能发动次数，取消选择不会消耗次数。

#### 方式二：使用 `filter` + `addTempSkill` + `subSkill.used`（复杂流程）

适用于需要在流程中判断成功/失败后才消耗次数的场景。

```javascript
skillName: {
    enable: ["phaseUse", "chooseToUse", "chooseToRespond"],
    usable: 1,
    direct: true,
    filter(event, player) {
        // 检查是否已使用过
        if (player.hasSkill("skillName_used")) return false;
        return true;
    },
    chooseButton: {
        // ... 选择界面 ...
        backup(links, player) {
            return {
                filterCard: () => false,
                selectCard: -1,
                viewAs: { name: links[0][2], isCard: true },
                async precontent(event, trigger, player) {
                    // 执行复杂流程
                    await player.draw(2);
                    const result = await player.chooseButton(...).forResult();
                    
                    // 流程失败时取消使用
                    if (!result?.links?.length) {
                        event.result.bool = false;
                        return;
                    }
                    
                    // 流程成功：添加临时技能标记已使用
                    player.addTempSkill("skillName_used", "phaseAfter");
                },
            };
        },
    },
    subSkill: {
        used: {
            charlotte: true,  // 临时技能，回合结束后自动移除
            mark: true,       // 显示标记
            intro: { content: "本回合已使用过【技能名】" },
        },
    },
},
```

**关键点：**

| 属性/方法 | 说明 |
|------|------|
| `filter` 中检查 `hasSkill("skillName_used")` | 判断是否已使用过 |
| `player.addTempSkill("skillName_used", "phaseAfter")` | 流程成功后添加临时技能 |
| `subSkill.used` 定义 | 配合 `charlotte: true` 和 `mark: true` |
| `precontent` 中设置 `event.result.bool = false` | 流程失败时取消使用，不消耗次数 |

**与 `usable: 1` 的区别：**

| 方式 | 取消是否消耗次数 | 适用场景 |
|------|-----------|----------|
| `usable: 1` | 取消也消耗次数 | 简单技能，选择后直接使用 |
| `filter + addTempSkill` | 取消不消耗次数 | 复杂流程，需要判断成功后才消耗 |

**参考技能：** 伊格尼兹【神计】(`ignzshenji`)

***

## 6. 角色定义字段速查

> 详细说明与示例见正文第2章

### 6.1 官方格式（推荐）

```javascript
character_id: {
    sex: "male",                // 性色：male/female
    group: "wei",               // 势力：wei/shu/wu/qun
    hp: 3,                      // 体力值（纯数字）
    // 或 hp: "3/4"             // 体力/上限
    // 或 hp: "4/4/2"           // 体力/上限/护甲
    skills: ["skill1", "skill2"],
    names: ["姓|名"],         // 姓名（数组）
},
```

### 6.2 简写格式（兼容）

```javascript
character_id: ["male", "wei", 3, ["skill1", "skill2"]],
```

### 6.3 字段对照表（不要混用！）

| 官方格式     | 简写格式 | 绝对不要混用      |
| -------- | ---- | ----------- |
| `sex`    | 第1项  | ❌ `gender`  |
| `group`  | 第2项  | ❌ `faction` |
| `hp`     | 第3项  | ❌ `level`   |
| `skills` | 第4项  | -           |
| `names`  | -    | ❌ `name`    |

***

## 7. 常用位置标识符

| 标识      | 含义        | 说明               |
| ------- | --------- | ---------------- |
| `"h"`   | 手牌        | hand             |
| `"e"`   | 装备区       | equip            |
| `"j"`   | 判定区       | judge            |
| `"he"`  | 手牌+装备     | hand+equip       |
| `"hes"` | 手牌+装备+展示牌 | hand+equip+shown |
| `"cj"`  | 判定区+手牌    | judge+hand       |

***

## 8. 技能描述规范

### 8.1 get.poptip() - 特殊名词超链接

在技能描述中引用其他技能/规则时，使用 `get.poptip()` 生成可点击链接：

```javascript
// ✅ 正确：可点击查看详情
skill_info: `觉醒技，你获得${get.poptip("newSkill")}。`

// 显示效果：觉醒技，你获得〖新技能〗。（点击可查看详情）
```

**内置规则术语 ID：**

| ID                | 名称  |
| ----------------- | --- |
| `rule_hujia`      | 护甲  |
| `rule_suicong`    | 随从  |
| `rule_zhinang`    | 智囊  |
| `rule_renku`      | 仁库  |
| `rule_xunengji`   | 蓄能技 |
| `rule_bianshenji` | 变身技 |
| `rule_jiang`      | 激昂  |
| `rule_lizhan`     | 历战  |

### 8.2 描述中的特殊符号

| 写法      | 显示   | 用途  |
| ------- | ---- | --- |
| `〖技能名〗` | 〖赋乐〗 | 技能名 |
| `【牌名】`  | 【杀】  | 卡牌名 |

### 8.3 intro 中使用特殊占位符

| 占位符 | 含义                     | 示例            |
| --- | ---------------------- | ------------- |
| `#` | 数值（自动替换为 storage 数值）   | `"已失去过#张装备牌"` |
| `$` | 列表（自动替换为 storage 数组翻译） | `"已移除选项：$"`   |
| `+` | 数值（带正号）                | `"手牌上限+#"`    |

```javascript
// ✅ 正确：使用占位符
intro: { content: "已移除牌名：$" }
intro: { content: "手牌上限+#" }
intro: { content: "已失去过#张装备牌" }

// ❌ 错误：手动拼接
intro: {
    content(storage) {
        return `已移除牌名：${storage.map(n => get.translation(n)).join("、")}`;
    },
}
```

***

## 9. 主动技能规范写法

### 9.1 出牌阶段选牌使用 filterCard 而非 content 内 chooseCard

**【强制】** 主动技能（`enable: "phaseUse"`）选择卡牌时，必须使用 `filterCard` + `selectCard` 在技能外层定义，不要在 `content` 内使用 `chooseCard`。

```javascript
// ✅ 正确：使用 filterCard 外层定义
mbtongwei: {
    enable: "phaseUse",
    filterCard(card, player) {
        return get.type(card) === "basic" && player.canRecast(card);
    },
    selectCard: [1, Infinity],
    position: "h",
    check(card) {
        return 6.5 - get.value(card);
    },
    discard: false,
    lose: false,
    delay: false,
    async content(event, trigger, player) {
        const cards = event.cards;
        await player.recast(cards);
        // 后续逻辑...
    },
},

// ❌ 错误：在 content 内 chooseCard（取消也算发动一次）
async content(event, trigger, player) {
    const result = await player.chooseCard({
        prompt: "请选择要重铸的基本牌",
        filterCard(card) { return get.type(card) === "basic"; },
        selectCard: [1, Infinity],
    }).forResult();
    if (!result.bool) return;  // 取消了也算发动！
    await player.recast(result.cards);
},
```

**原因：** 在 `content` 内使用 `chooseCard`，即使玩家取消选择，技能也已被记录为"发动过"，消耗 `usable` 次数。

### 9.2 弃置对方手牌使用 discardPlayerCard

```javascript
// ✅ 正确：使用 discardPlayerCard
await player.discardPlayerCard(target, "h", true);

// ❌ 错误：先 choosePlayerCard 再 discard
const result = await player.choosePlayerCard({
    target: target,
    position: "h",
    forced: true,
}).forResult();
if (result?.cards?.length) {
    await target.discard(result.cards);
}
```

### 9.3 重铸牌设置 discard/lose/delay 为 false

```javascript
// ✅ 正确：重铸牌不触发弃置/失去事件
{
    filterCard(card, player) {
        return get.type(card) === "basic" && player.canRecast(card);
    },
    discard: false,
    lose: false,
    delay: false,
    async content(event, trigger, player) {
        await player.recast(event.cards);
    },
}
```

**推荐：使用 `lib.filter.cardRecastable` 内置过滤器**

```javascript
// ✅ 正确：使用内置重铸过滤器（自动处理 canRecast 检查）
{
    filterCard: lib.filter.cardRecastable,
    position: "e",
    discard: false,
    lose: false,
    delay: false,
    async content(event, trigger, player) {
        await player.recast(event.cards);
    },
}
```

`lib.filter.cardRecastable` 自动检查 `player.canRecast(card)` 和卡牌位置，无需手动实现 `filterCard`。

**【强制】** 重铸前必须检查 `player.canRecast(card)`，确保牌确实可以重铸。

```javascript
// ✅ 正确：filterCard 中检查 canRecast
filterCard(card, player) {
    return get.type(card) === "basic" && player.canRecast(card);
},

// ❌ 错误：未检查 canRecast（某些牌可能不可重铸）
filterCard(card, player) {
    return get.type(card) === "basic";
},
```

***

## 10. 被动技触发与过滤规范

### 10.1 使用 async cost 替代 direct + chooseBool

**【强制】** 非强制触发技必须使用 `async cost` 替代 `direct: true` + `chooseBool`。

```javascript
// ✅ 正确：使用 async cost
mogui: {
    trigger: { player: ["phaseJudgeBegin", "phaseDrawBegin"] },
    filter(event, player) {
        return !player.getStorage("mogui").includes(event.name);
    },
    async cost(event, trigger, player) {
        const result = await player
            .chooseTarget(get.prompt(event.skill), "提示文字")
            .set("ai", target => get.attitude(get.player(), target))
            .forResult();
        event.result = {
            bool: result.bool,
            cost_data: result,
        };
    },
    async content(event, trigger, player) {
        const { targets } = event.cost_data;
        // 技能逻辑...
    },
},

// ❌ 错误：使用 direct + chooseBool
dcsbxinqinqiang: {
    direct: true,
    async content(event, trigger, player) {
        const result = await player.chooseBool({ ... }).forResult();
        if (!result.bool) return;
        // 技能逻辑...
    },
},
```

**原因：** `direct` 模式下技能触发时机和日志记录不正确，`cost` 是官方推荐的非强制技能写法。

### 10.2 使用 get.is.damageCard() 判断伤害牌

```javascript
// ✅ 正确：使用 get.is.damageCard()
if (get.is.damageCard(event.card)) { ... }

// ❌ 错误：使用 get.tag()
if (get.tag(event.card, "damage")) { ... }
```

### 10.2.1 使用 get.tag() 判断回复牌

```javascript
// ✅ 正确：使用 get.tag() 判断是否为回复牌
if (get.tag(card, "recover")) { ... }

// ❌ 错误：硬编码判断牌名
if (card.name === "tao" || card.name === "jiu") { ... }
```

**说明：** `get.tag(card, "recover")` 会判断卡牌是否具有"回复"标签，包括【桃】、【酒】以及其他具有回复效果的卡牌。相比硬编码牌名，此方法兼容性更好，能自动识别扩展中新增的回复牌。

### 10.3 使用 get.type2() 替代 get.type() 判断大类

```javascript
// ✅ 正确：get.type2 返回大类（basic/trick/equip）
const type = get.type2(card);

// ❌ 错误：get.type 可能返回 delay 等子类
const type = get.type(card);
```

### 10.3.1 使用卡牌时检查 gaintag 需检查 card.cards

```javascript
// ✅ 正确：同时检查 vCard 本身和其内部物理卡牌
const card = event.card;
return [card].concat(card.cards || []).some(cardx => get.itemtype(cardx) === "card" && cardx.hasGaintag("tag_name"));

// ❌ 错误：只检查 vCard 本身（gaintag 在物理卡牌上，vCard 上可能没有）
return event.card.hasGaintag("tag_name");
```

**说明：** 使用卡牌时，`event.card` 是虚拟卡牌（vCard），实际消耗的物理卡牌在 `card.cards` 中。gaintag 添加在物理卡牌上，因此需同时检查 vCard 和其内部卡牌。参考 `extension.js#L7344` 的 `xklkeyan_nolimit` 实现。

### 10.4 多目标技能添加 isFirstTarget 和 logTarget

```javascript
// ✅ 正确：指定首个目标时触发，记录目标
mbcuguo: {
    trigger: { player: "useCardToPlayered" },
    filter(event, player) {
        if (!get.is.damageCard(event.card) || !event.isFirstTarget) return false;
        return !player.getStorage("mbtongwei").includes(event.card.name);
    },
    forced: true,
    logTarget: "targets",
    async content(event, trigger, player) {
        // event.targets 包含所有目标
    },
},

// ❌ 错误：缺少 isFirstTarget（多目标时重复触发）
filter(event, player) {
    if (!event.card || !get.tag(event.card, "damage")) return false;
    if (!event.targets?.length) return false;
    return true;
},
```

### 10.5 使用 player.countMark() 替代 player.storage

```javascript
// ✅ 正确：使用 countMark
const num = player.countMark("mbshanjia");
player.addMark("mbshanjia", num, false);

// ❌ 错误：手动管理 storage
player.storage.mbshanjia = num;
player.markSkill("mbshanjia");
```

#### addMark 与 setStorage 的等价性

当需要累加标记计数时，`addMark` 和 `setStorage` 两种写法效果等价：

```javascript
// 方法一：使用 addMark（推荐用于有标记显示的场景）
player.addMark("dccaisi_more", 1, false);

// 方法二：使用 setStorage（推荐用于纯数据存储）
player.setStorage("dccaisi_more", player.getStorage("dccaisi_more", 0) + 1);
```

**等价原因：** `countMark` 内部实现为 `player.storage[key] || 0`，与 `getStorage(key, 0)` 返回值一致。

| 场景 | 推荐方法 | 原因 |
|------|----------|------|
| 需要标记显示 | `addMark` / `removeMark` | 自带日志和 UI 更新 |
| 纯数据存储 | `setStorage` + `getStorage` | 更直观，可控是否更新 UI |
| 读取计数值 | `countMark()` | 内置保底，返回 `storage \|\| 0` |

### 10.6 死亡触发技能必须添加 forceDie

**【强制】** 监听 `die` 事件的技能必须添加 `forceDie: true`，确保在死亡结算过程中技能仍能触发。

```javascript
// ✅ 正确：死亡触发技能添加 forceDie
wechatyilve: {
    trigger: { player: "die" },
    limited: true,
    forceDie: true,        // 确保死亡时触发
    skillAnimation: true,  // 限定技发动动画
    animationColor: "wood",
    async cost(event, trigger, player) {
        event.result = await player.chooseTarget({
            prompt: get.prompt2(event.skill),
            filterTarget: lib.filter.notMe,
            forceDie: true,  // 选目标时也要 forceDie
        }).forResult();
    },
    async content(event, trigger, player) {
        player.awakenSkill(event.name);
        // ...
    },
},

// ❌ 错误：缺少 forceDie（死亡时技能可能不触发）
trigger: { player: "die" },
// 没有 forceDie: true
```

**注意：** `forceDie` 需要在 `cost` 和 `content` 对应位置同步设置。`skillAnimation: true` + `animationColor` 可为限定技提供视觉特效。

**死亡流程拦截：** 若要让角色死亡但跳过死亡后的身份亮出和奖惩，应监听全局 `dieBefore`，并设置 `trigger.reserveOut = true`；不要只监听持有者自身的 `dieBefore`，也不要用 `dieAfter` 事后拦截。可将待处理状态写入死亡角色的 `storage`，之后在 `phaseAfter` 中处理。

### 10.7 指定目标时：`useCardToPlayer` + `isFirstTarget` + `event.targets.add` / `directHit`

监听 `useCardToPlayer`（对应角色被指定为目标时）可精细控制"增加一个目标"或"令此牌不可被响应"。"指定目标"类事件需配合 `event.isFirstTarget` 只处理首个目标，避免多目标卡牌重复触发。

```javascript
// ✅ 正确：为卡牌增加一个额外目标 + 令卡牌不可被响应
xiangzhi_effect: {
    trigger: { global: 'useCardToPlayer' },
    filter(event, player) {
        if (!event.isFirstTarget) return false;      // 只处理首个目标
        if (get.type(event.card) !== 'trick') return false;  // 普通锦囊
        return ...;                                    // 其它条件
    },
    async content(event, trigger, player) {
        // 增加一个目标（在指定目标时 push 到 event.targets 并 log）
        const target = result.targets[0];
        player.line(target);
        trigger.targets.add(target);                  // 新增目标
        game.log(target, '成为了', trigger.card, '的额外目标');
        // 令此牌不可被响应（对该牌的目标分别结算时施加 directHit）
        trigger.directHit.addArray(game.players);
        game.log(trigger.card, '不可被响应');
    },
},
```

**要点：**
1. `event.isFirstTarget` 保证对一张牌只结算一次（多目标/连锁时尤其重要）
2. `trigger.targets.add(target)` 将角色追加为额外目标
3. `trigger.directHit.addArray(list)` 在 `useCardToPlayer`/`useCardToPlayered` 中给牌施加"不可被响应"（参考 戎马吕布【神速】写法和志夏侯徽【襄智】）
4. `useCardToPlayer` 侧重目标指定过程的每个目标事件，`useCardToPlayered` 侧重目标已指定后；需按结算节点选用

### 10.8 跳过阶段：`trigger.cancel()` 与 `changeToZero()` 的区别

摸牌/弃牌等阶段的"跳过"有两种写法，语义不同：

| 写法 | 含义 | 适用 |
|------|------|------|
| `trigger.cancel()` | 直接取消该阶段事件 | 真正"跳过"摸牌阶段（如志夏侯徽【竭情】） |
| `trigger.changeToZero()` | 把阶段数值改为 0，事件仍保留 | 只把摸牌数清零、仍需其他阶段逻辑参与者执行时 |

```javascript
// ✅ 正确：跳过摸牌阶段（真正取消事件）
wechatjieqing: {
    trigger: { player: 'phaseDrawBegin' },
    async content(event, trigger, player) {
        trigger.cancel();        // 摸牌阶段不再执行
        // ...发动效果
    },
},
```

**要点：** 若技能本身要"替换/重开"摸牌（如先取消再用 `player.phaseDraw()` 插入新阶段），需注意新阶段加入 `trigger.next`/`event.next` 的调度顺序，不能只 `cancel()` 就结束。

***

## 11. 选项界面规范

### 11.1 不可选项使用灰色显示

```javascript
// ✅ 正确：不可选项灰色显示
const choices = [];
const choiceList = ["令此牌伤害+X", "摸X张牌"];
if (canOption1) {
    choices.push("选项一");
} else {
    choiceList[0] = '<span style="opacity:0.5">' + choiceList[0] + "</span>";
}
if (canOption2) {
    choices.push("选项二");
} else {
    choiceList[1] = '<span style="opacity:0.5">' + choiceList[1] + "</span>";
}

// ❌ 错误：不可选项直接不显示（玩家看不到完整信息）
if (canOption1) choices.push("选项一");
if (canOption2) choices.push("选项二");
```

### 11.2 背水技能标准写法

背水技能指"付出额外代价，获得所有选项效果"的机制。标准写法参考 `dbquedi` 技能：

```javascript
// 在 cost 中完成效果选择
async cost(event, trigger, player) {
    // 构建选项列表（根据实际条件过滤可用选项）
    const list = [];
    if (条件一) list.push("选项一");
    if (条件二) list.push("选项二");
    list.push("背水！");        // 背水选项始终可用
    list.push("cancel2");       // 允许取消整个技能

    const result = await player
        .chooseControl(list)
        .set("choiceList", [
            "选项一效果描述",
            "选项二效果描述",
            "背水！付出代价并执行所有选项",
        ])
        .set("prompt", get.prompt(event.skill, target))
        .set("ai", () => {
            // AI 决策逻辑
            if (条件满足) return "背水！";
            if (条件一) return "选项一";
            if (条件二) return "选项二";
            return "cancel2";
        })
        .forResult();

    // 非取消时返回结果
    if (typeof result?.control == "string" && result.control != "cancel2") {
        event.result = { bool: true, cost_data: result.control };
    }
},

// 在 content 中根据选择执行效果
async content(event, trigger, player) {
    const { cost_data: control } = event;

    // 使用 ["选项一", "背水！"].includes(control) 判断
    if (["选项一", "背水！"].includes(control)) {
        // 执行选项一效果
    }
    if (["选项二", "背水！"].includes(control)) {
        // 执行选项二效果
    }
    if (control === "背水！") {
        // 执行背水代价（如失去体力/体力上限）
        await player.loseHp(1);
    }
},
```

**关键要点：**

| 要点 | 说明 |
|------|------|
| `"背水！"` | 控制字符串固定使用带感叹号的格式 |
| 始终可用 | 背水选项不依赖条件过滤，始终在列表中 |
| `cancel2` | 允许玩家取消整个技能（与背水不可取消不冲突） |
| `.set()` 链式 | 使用链式调用传参，而非对象参数形式 |
| `cost_data` | 将选择结果存入 `cost_data`，在 content 中使用 |
| `includes` 判断 | 使用 `["选项一", "背水！"].includes(control)` 统一处理 |

### 11.3 使用 get.inpileVCardList() 获取牌名列表

```javascript
// ✅ 正确：使用 get.inpileVCardList
const vcards = get.inpileVCardList(info => {
    if (skipNames.includes(info[2]) || info[3]) return false;
    return get.is.damageCard({ name: info[2] });
});

// ❌ 错误：使用 lib.inpile 手动构建
const availableCards = lib.inpile.filter(card => {
    if (skipNames.includes(card)) return false;
    const type2 = get.type2(card);
    return type2 === "basic" || type2 === "trick";
});
const nameList = availableCards.map(name => [get.type2(name) || "基本", "", name]);
```

**区分"牌名列表"与"牌类型列表"：** 上面的 11.3 针对**按牌名构造选项**（应使用 `get.inpileVCardList`）。若你需要的是**按牌的大类**（basic/trick/equip）构造动态选项（而非具体牌名），那么用 `lib.inpile` + `get.type2` + `toUniqued()` 去重是正确做法：

```javascript
// ✅ 正确：构建动态牌类型列表（只取当前牌堆实际存在的类型）
const types = lib.inpile.map(name => get.type2(name)).toUniqued();
const typeList = types.map(type => [type, `${get.translation(type)}牌`]);
// 例：竭情让目标从牌堆/弃牌堆获得指定类型的牌，选项随牌堆动态变化
```

`toUniqued()` 是引擎数组去重扩展，`lib.inpile` 为当前牌堆内的牌名数组。

### 11.4 单选项时自动选择，跳过确认

当 `chooseControl` 只有一个选项时，可跳过确认直接执行，减少玩家操作步骤。

```javascript
// ✅ 正确：只有一个选项时自动选择
const choices = [];
if (canOption1) choices.push("选项一");
if (canOption2) choices.push("选项二");
let result;
if (choices.length === 1) {
    result = { control: choices[0] };  // 自动选择
} else {
    result = await player.chooseControl(choices)
        .set("ai", () => { /* AI 逻辑 */ })
        .set("choiceList", choiceList)
        .set("prompt", "请选择一项")
        .forResult();
}

// ❌ 错误：只有一个选项也弹出选择框
result = await player.chooseControl(choices).forResult();
```

### 11.5 chooseControl 不传选项参数 + result.index 判断

**【强制】** 使用 `chooseControl` 时不要传入选项字符串参数，通过 `choiceList` 设置选项内容，用 `result.index` 判断选择结果。

```javascript
// ✅ 正确：chooseControl 不传选项参数（自动生成），用 choiceList 设置内容，result.index 判断
const result = await player.chooseControl().set('choiceList', [
    '摸三张牌',
    `令手牌中随机${get.cnNumber(num)}张伤害牌或回复牌在结算时结算两次`,
]).set('prompt', `${get.translation(event.name)}：请选择一项执行`).set('ai', () => {
    // AI 逻辑
}).forResult();

if (result.index === 0) await player.draw(3);

// ❌ 错误：传入选项字符串 + result.control 判断
const result = await player.chooseControl('选项一', '选项二').set('prompt', '【绝弈】选择一项')...
if (result.control === '选项一') { ... }
```

**条件分支简化**：当不满足条件时直接返回默认值对象，避免嵌套 if/else。

```javascript
// ✅ 正确：三元表达式简化，不满足条件直接返回默认 index
const result = (num > 0 && player.hasCard(..., 'h')) 
    ? await player.chooseControl()...forResult() 
    : { index: 0 };
```

***

## 12. 日志规范

### 12.1 不要重复 logSkill

```javascript
// ✅ 正确：forced 技能自动 logSkill，不需要手动调用
forced: true,
async content(event, trigger, player) {
    // 不需要 player.logSkill("skillName");
    trigger.num += 1;
},

// ❌ 错误：重复 logSkill（forced 技能已自动记录）
forced: true,
async content(event, trigger, player) {
    player.logSkill("skillName");  // 重复！
    trigger.num += 1;
},
```

### 12.2 重铸自带 log，不要额外打印

```javascript
// ✅ 正确：recast 自带日志
await player.recast(cards);

// ❌ 错误：额外打印日志
await player.recast(cards);
game.log(player, "重铸了", cards.length, "张基本牌");  // 重复！
```

### 12.3 使用 get.cnNumber() 显示中文数字

```javascript
// ✅ 正确：使用 get.cnNumber
choiceList.push(`摸${get.cnNumber(num)}张牌`);

// ❌ 错误：直接使用数字
choiceList.push("摸" + num + "张牌");
```

***

## 13. 技能架构与设计规范

### 13.1 转化牌/虚拟牌不需要额外排除

```javascript
// ✅ 正确：转化牌也可能有花色，只需判断花色是否为 none
if (get.suit(card) === "none") return false;

// ❌ 错误：额外排除虚拟牌/转化牌（转化牌也可能有花色）
if (get.is.virtualCard(card) || get.is.convertedCard(card)) return false;
```

### 13.2 辅助过滤函数要一致使用

```javascript
// ✅ 正确：定义了 filterx 后在 filter 中也使用
filterx(card, player) {
    if (get.type(card, null, false) !== "trick") return false;
    const info = get.info(card, player);
    if (!info || info.notarget) return false;
    if (info.selectTarget && info.selectTarget !== 1) return false;
    return info.type === "trick";
},
filter(event, player) {
    const card = event.card;
    if (!card) return false;
    if (!lib.skill.skillName.filterx(card, player)) return false;
    const suit = get.suit(card);
    if (suit === "none") return false;
    return true;
},

// ❌ 错误：定义了 filterx 但 filter 中重复判断逻辑
filter(event, player) {
    const card = event.card;
    if (!card || get.type(card, null, false) !== "trick") return false;
    // 重复了 filterx 的逻辑...
},
```

### 13.3 使用 chooseButton + backup 替代 chooseControl 列表选择

**【强制】** 需要选择使用哪种牌时，必须使用 `chooseButton + backup` 框架，不选牌不进后续。

```javascript
// ✅ 正确：chooseButton + backup，不选择不消耗技能
chooseButton: {
    dialog(event, player) {
        const list = [...];
        return ui.create.dialog("标题", [list, "vcard"]);
    },
    filter(button, player) { return true; },
    backup(links, player) {
        const cardName = links[0][2];
        return {
            filterCard(card, player) { ... },
            viewAs(cards) { return { name: cardName }; },
        };
    },
},

// ❌ 错误：chooseControl 列表选择，取消也消耗技能
const result = await player.chooseControl(list).forResult();
if (result.control === "cancel2") return;
```

**【强制】** `backup` 中不要设置 `selectTarget` 和 `filterTarget`，让系统自动继承原事件的目标限制。

```javascript
// ✅ 正确：不设置 selectTarget 和 filterTarget，系统自动继承原事件目标限制
backup(links, player) {
    const name = links[0][2];
    return {
        filterCard: true,
        viewAs: { name: name },
        log: false,  // 防止重复记录
        async precontent(event, trigger, player) {
            player.logSkill("skillName");  // 手动记录技能发动
            // ... 其他逻辑
        },
    };
},

// ❌ 错误：显式设置 selectTarget 和 filterTarget，覆盖原事件目标限制
backup(links, player) {
    const name = links[0][2];
    return {
        filterCard: true,
        viewAs: { name: name },
        selectTarget: 1,  // ❌ 覆盖了原事件的目标限制
        filterTarget(card, player, target) {  // ❌ 覆盖了原事件的目标限制
            return lib.filter.filterTarget(card, player, target);
        },
    };
},
```

**原因说明：**

当其他技能要求玩家对特定目标使用牌时（如"对X使用一张杀"），原事件会有 `selectTarget: -1` 的限制（表示目标已固定）。如果在 `backup` 中显式设置 `selectTarget` 或 `filterTarget`，会覆盖原事件的限制，导致玩家可以自由选择目标。

**正确做法：**

1. 不设置 `selectTarget` 和 `filterTarget`，让系统自动继承原事件的目标限制
2. 添加 `log: false`，在 `precontent` 或 `onuse` 中手动调用 `logSkill` 记录技能发动
3. 如果有特殊目标限制（如铁索连环需要选择1-2名角色），可以在 `precontent` 中处理

### 13.4 记录型子技能使用 init + charlotte 替代 group

**【强制】** 记录/追踪型子技能应使用 `init` 添加 `charlotte` 子技能，而非 `group`，防止被封印。同时，使用牌的部分放主技能，记录的部分用 `init` 添加子技能。

```javascript
// ✅ 正确：使用牌的部分放主技能，记录的部分用 init 添加 charlotte 子技能
clanshixi: {
    enable: "chooseToUse",
    // 主技能包含使用牌的逻辑（filterCard、viewAs 等）
    chooseButton: { ... },
    init(player, skill) {
        player.addSkill(skill + "_mark");
    },
    onremove(player, skill) {
        player.removeSkill(skill + "_mark");
    },
    subSkill: {
        mark: {
            charlotte: true,
            forced: true,
            popup: false,
            firstDo: true,
            trigger: { player: "useCard1" },
            filter(event, player) { ... },
            async content(event, trigger, player) {
                // 仅负责记录逻辑...
            },
        },
    },
},

// ❌ 错误：使用 group，可被封印；使用牌的部分放在子技能中
group: ["clanshixi_mark", "clanshixi_use"],
subSkill: {
    mark: {
        // 没有 charlotte，可被封印
        trigger: { player: "useCard" },
        ...
    },
    use: {
        // 使用牌的部分不应放在子技能中
        enable: "phaseUse",
        ...
    },
},
```

**架构要点：**

- **主技能**：包含 `enable`、`filterCard`、`viewAs`、`chooseButton` 等使用牌的逻辑
- **init 子技能**：仅负责记录/追踪，设置 `charlotte: true, forced: true, popup: false, firstDo: true`
- **不用 group**：group 连接的子技能可被封印，init 添加的 charlotte 子技能不可被封印

### 13.5 "首次"判断使用历史而非手动 storage

```javascript
// ✅ 正确：使用历史判断首次
filter(event, player) {
    const type = get.type2(event.card);
    if (player.getHistory("useCard", evt => get.type2(evt.card) === type).indexOf(event) !== 0) {
        return false;
    }
    return true;
},

// ❌ 错误：手动 storage 追踪
filter(event, player) {
    if (!player.storage.skillName) player.storage.skillName = { types: [] };
    return !player.storage.skillName.types.includes(type);
},
async content(event, trigger, player) {
    player.storage.skillName.types.push(type);
},
```

**注意：** 使用历史判断后，所有 `player.storage.skillName` 相关的追踪代码都不需要了，应全部移除。历史判断本身已经替代了 storage 的记录功能。

### 13.6 filter 条件应与技能描述一致

```javascript
// ✅ 正确：技能描述只要求类别，filter 只判断类别
filter(event, player) {
    const type = get.type2(event.card);
    return player.getHistory("useCard", evt => get.type2(evt.card) === type).indexOf(event) === 0;
},

// ❌ 错误：技能描述只要求类别，但 filter 额外判断实体牌
filter(event, player) {
    if (!event.cards || !event.cards.some(card => card === "h" || card.original === "h")) return false;
    // 技能描述没要求使用手牌，不应该加这个条件
},
```

**注意：** 如果技能确实要求使用手牌，请参考【中流】或OL谋文丑【决绝】的写法。

### 13.7 触发技需添加玩家有牌的过滤条件

当触发技涉及使用牌时，`filter` 中应添加玩家有牌的过滤条件，避免玩家无牌时仍触发。

```javascript
// ✅ 正确：添加玩家有牌的过滤条件
filter(event, player) {
    if (!player.countCards("h")) return false;
    const type = get.type2(event.card);
    return player.getHistory("useCard", evt => get.type2(evt.card) === type).indexOf(event) === 0;
},

// ❌ 错误：缺少有牌过滤（玩家无牌时仍会触发）
filter(event, player) {
    const type = get.type2(event.card);
    return player.getHistory("useCard", evt => get.type2(evt.card) === type).indexOf(event) === 0;
},
```

### 13.8 响应类技能使用 enable: "chooseToUse"

```javascript
// ✅ 正确：需要使用牌时（包括响应时）使用 chooseToUse
enable: "chooseToUse",

// ❌ 错误：仅出牌阶段可用
enable: "phaseUse",
```

### 13.9 backup.filterCard 必须过滤虚拟牌，防止装备技能误触发

**【强制】** 当 `chooseToUse()` 搭配 backup 使用时，backup 的 `filterCard` **不能**直接 `return true`，否则会导致八卦阵等装备技能误触发。

**原理：** 八卦阵等装备技能监听 `chooseToUseBegin`，通过 `event.filterCard({ name: "shan" }, player, event)` 检查当前事件是否允许使用闪。如果 backup 的 `filterCard` 对所有牌都返回 `true`（包括虚拟牌），八卦阵的检查就会通过，导致在你的技能效果期间弹出八卦阵判定。

**正确写法：**

```javascript
// ✅ 正确：用 get.itemtype(card) === "card" 过滤虚拟牌
backup: {
    filterCard(card) {
        return get.itemtype(card) === "card";  // 只允许真实牌，拒绝虚拟牌
    },
    position: "he",
    viewAs: { name: "sha", nature: "fire" },
    // ...
}

// ❌ 错误：return true 对所有牌（含虚拟牌）都返回 true，导致八卦阵误触发
backup: {
    filterCard() {
        return true;  // 八卦阵的 event.filterCard({ name: "shan" }) 也会通过
    },
    position: "he",
    viewAs: { name: "sha", nature: "fire" },
    // ...
}
```

**`get.itemtype(card)` 返回值：**

| 输入类型 | 返回值 | 说明 |
|---------|--------|------|
| 真实卡牌对象 | `"card"` | 手牌/装备区的实际卡牌 |
| 虚拟牌 `{ name: "sha" }` | `"equip"/"trick"/"basic"` 等 | 根据牌类型返回，不是 `"card"` |
| VCard 对象 | `"vcard"` | 不是 `"card"` |

**受影响的装备技能（监听 `chooseToUseBegin`）：** 八卦阵、奥特披风等。它们在 `chooseToUseBegin` 时检查 `event.filterCard`，如果 backup 的 filterCard 过于宽松就会误触发。

### 13.10 参考现有技能的显示效果

编写技能时，应参考同类技能的显示效果，尤其是 mark 的 `intro` 显示应足够明显：

| 需求                | 参考技能           | 说明                               |
| ----------------- | -------------- | -------------------------------- |
| 记录牌名/花色的 intro 显示 | 族荀攸【百出】        | 使用 `dialog.addSmall()` 等方法让显示更明显 |
| 首次使用类别的判断与显示      | 族荀采【点盏】        | 历史判断 + mark 显示效果                 |
| 使用手牌的判断           | 【中流】、OL谋文丑【决绝】 | 判断是否使用手牌                         |

```javascript
// ✅ 正确：参考百出的 intro，使用更明显的显示方式
intro: {
    markcount(storage) {
        if (!storage) return 0;
        return Object.keys(storage).length;
    },
    mark(dialog, storage) {
        if (!storage || Object.keys(storage).length === 0) {
            return "尚未记录任何牌";
        }
        dialog.addSmall("已记录：");
        const list = Object.entries(storage).map(([key, name]) => {
            const suit = key.split("+")[0];
            return `【${get.translation(name)}】（${get.translation(suit)}）`;
        });
        dialog.addText(list.join("、"));
    },
},

// ❌ 错误：intro 显示不够明显，仅返回纯文本
intro: {
    mark(dialog, storage) {
        if (!storage) return "尚未记录任何牌";
        return "已记录：" + list.join("、");
    },
},
```

### 13.11 targetInRange 与 nodistance 的区别

**【强制】** 实现使用牌无距离限制的 buff 时，必须使用 `mod.targetInRange` 而非 `trigger.nodistance`。

- **`mod.targetInRange`**：修改牌的目标距离判断，在 `useCard` 时生效，使牌可以指定任意距离的目标
- **`trigger.nodistance`**：仅在 `chooseUseTarget` 选目标时生效（即 `useCard` 之前），不影响实际使用时的距离判断

```javascript
// ✅ 正确：使用 mod.targetInRange 实现无距离限制
subSkill: {
    buff: {
        mod: {
            targetInRange(card, player) {
                if (card.hasGaintag("skillName")) return true;
            },
        },
    },
},

// ❌ 错误：使用 trigger.nodistance（仅在选目标时生效，不影响实际距离判断）
trigger: { player: "useCard" },
async content(event, trigger, player) {
    trigger.nodistance = true;
},
```

### 13.12 content 中提前判断避免插结卡死

当技能的 `content` 中涉及多步交互（如选目标、给牌等）时，应在 `content` 开头提前判断必要条件，避免因条件不满足导致插结卡死。

```javascript
// ✅ 正确：content 开头提前判断
async content(event, trigger, player) {
    if (!player.countCards("h")) return;
    const targets = game.filterPlayer(cur => cur !== player && cur.isIn());
    if (targets.length === 0) return;
    // 后续交互逻辑...
},

// ❌ 错误：不提前判断，直接进入交互（可能卡死）
async content(event, trigger, player) {
    const result = await player.chooseTarget("请选择目标").forResult();
    // 如果没有合法目标，chooseTarget 可能卡住
},
```

**常见需要提前判断的场景：**

- 需要选择其他角色时：判断场上有无其他存活角色
- 需要操作手牌时：判断玩家有无手牌
- 需要给牌时：判断玩家有无可给的牌

### 13.13 修改技能应在原技能上修改，使用动态翻译

**【强制】** 当技能需要被修改时，应在原技能内部根据条件走不同流程，配合动态翻译显示，而非移除原技能再添加一个同翻译的新技能。

```javascript
// ✅ 正确：原技能内部根据修改状态走不同流程 + 动态翻译
rencheng: {
    audio: 2,
    trigger: { player: "phaseJieshuBegin" },
    filter(event, player) {
        if (player.hasSkill("mogui_modified")) {
            // 修改后的过滤条件
            return player.countCards("h") > 0;
        }
        // 原始过滤条件
        return player.countCards("h") > player.getHp();
    },
    async content(event, trigger, player) {
        if (player.hasSkill("mogui_modified")) {
            // 修改后的逻辑
        } else {
            // 原始逻辑
        }
    },
},
// 动态翻译：根据修改状态显示不同描述
rencheng_info(player) {
    if (player?.hasSkill("mogui_modified")) {
        return "修改后的技能描述";
    }
    return "原始技能描述";
},

// ❌ 错误：移除原技能 + 添加同翻译新技能
await player.removeSkills("rencheng");
await player.addSkills("rencheng_modified");
//rencheng_modified 和 rencheng 翻译相同，但技能ID不同
//问题：技能历史、标记、AI判断等都会断裂
```

**参考技能：** 手杀关银屏【雪恨】、谋贾诩【完杀】

### 13.14 技能描述中数字使用中文大写

**【强制】** 技能描述中涉及摸牌、交牌、弃置牌等数量时，必须使用中文大写数字（一、二、三……），而非阿拉伯数字。

```
// ✅ 正确
"摸两张牌并重置〖魔躯〗"
"弃置一张手牌"
"交给其他角色三张牌"

// ❌ 错误
"摸2张牌并重置〖魔躯〗"
"弃置1张手牌"
"交给其他角色3张牌"
```

**代码中使用** **`get.cnNumber()`** **生成中文数字：**

```javascript
// ✅ 正确：代码中使用 get.cnNumber
`摸${get.cnNumber(count)}张牌`

// ❌ 错误：代码中直接拼接数字
`摸${count}张牌`
```

### 13.15 Storage 规范化

**【强制】** Storage 操作必须使用引擎提供的 API，确保联机兼容和 UI 更新。

#### player.storage 规范

```javascript
// ✅ 正确：使用 getStorage 带默认值 + setStorage 赋值 + markAuto 数组操作
filter(event, player) {
    const storage = player.getStorage("skillName", { count: 0, list: [] });
    return storage.count > 0;
},
async content(event, trigger, player) {
    const storage = player.getStorage("skillName", { count: 0, list: [] });
    storage.count++;
    player.setStorage("skillName", storage, true);  // 触发 UI 更新
},
// 数组操作使用 markAuto
async content2(event, trigger, player) {
    player.markAuto("skillName", [card]);  // 自动去重、自动 markSkill
},



// ❌ 错误：直接访问 player.storage
filter(event, player) {
    return player.storage.skillName?.count > 0;  // 可能为 undefined
},
async content(event, trigger, player) {
    player.storage.skillName.count++;  // 不触发 UI 更新
},
```

#### card.storage 规范

```javascript
// ✅ 正确：使用 game.broadcastAll 同步（联机兼容）
const markCard = card => {
    const value = getValue();
    game.broadcastAll((card, value) => {
        card.storage ??= {};
        card.storage.skillName_value = value;
    }, card, value);
    card.addGaintag("skillName_tag");
};

// 判断赋牌使用可选链
filterCard(card, player) {
    return card.storage?.skillName_value === "sha";
},

// ❌ 错误：直接修改 card.storage（联机不同步）
const markCard = card => {
    card.storage = card.storage || {};
    card.storage.skillName_value = getValue();  // 客机端看不到！
    card.addGaintag("skillName_tag");
};

// ❌ 错误：使用 hasGaintag 判断赋牌（不可靠）
filterCard(card, player) {
    return card.hasGaintag("skillName_tag");  // gaintag 可能丢失
},
```

**参考：** 附录 4.3 卡牌 Storage 持久性、附录 4.7 联机兼容

### 13.16 主动技被动技混合技能结构

**【强制】** 当一个技能同时包含主动技和被动技时，主动技部分写在主技能位置，被动技部分写在 subSkill 位置。

```javascript
// ✅ 正确：主动技在主技能，被动技在 subSkill
skillName: {
    // 主动技部分（enable 表示主动技）
    enable: "chooseToUse",
    filterCard(card, player) { ... },
    viewAs: { name: "sha" },
    prompt: "将一张牌当杀使用",
    check(card) { return 5 - get.value(card); },
    ai: { respondSha: true },
    
    // 被动技部分放在 subSkill
    subSkill: {
        trigger_effect: {
            trigger: { player: "useCardAfter" },
            forced: true,
            filter(event, player) { ... },
            async content(event, trigger, player) {
                // 被动触发效果
            },
        },
        record: {
            charlotte: true,
            trigger: { player: "gainAfter" },
            firstDo: true,
            direct: true,
            content() {
                // 记录逻辑
            },
        },
    },
},

// ❌ 错误：被动技写在主技能，主动技写在 subSkill
skillName: {
    // 被动技写在主技能（错误顺序）
    trigger: { player: "useCardAfter" },
    forced: true,
    filter(event, player) { ... },
    async content(event, trigger, player) { ... },
    
    subSkill: {
        active: {
            // 主动技写在 subSkill（错误顺序）
            enable: "chooseToUse",
            filterCard(card, player) { ... },
            viewAs: { name: "sha" },
        },
    },
},
```

**原因：**
1. 主技能是技能的入口点，主动技作为主要功能应放在主技能
2. 被动技通常是辅助效果或记录逻辑，放在 subSkill 更清晰
3. 便于阅读和维护，结构更符合逻辑

**参考技能：** 龙胆（longdan）、飞径（mbfeijing）

### 13.17 子技能管理：用 `addSkill`/`removeSkill` 替代 `addAdditionalSkill`

**【强制】** 需要为玩家添加子技能作为独立技能实例时，使用 `addSkill`/`removeSkill`，并在主技能 `onremove` 中联动移除，不要使用 `addAdditionalSkill`。

```javascript
// ✅ 正确：addSkill 添加子技能作为独立技能实例，主技能 onremove 中联动移除
async content(event, trigger, player) {
    player.addSkill('wechatruping_self');
    player.addMark('wechatruping', 1, false);
},

onremove(player, skill) {
    player.removeSkill(`${skill}_self`);  // 模板字符串引用子技能名
},

// ❌ 错误：addAdditionalSkill + 不同 key 命名
player.addAdditionalSkill('wechatruping_self', 'wechatruping_mark');
player.addAdditionalSkill('wechatruping_' + player.playerid, 'wechatruping_mark');
```

**子技能作为状态载体**：`self` 子技能含 `mark: true`、`silent: true`、`global: 'xxx_blocker'`，作为标记存在的状态指示和 blocker mod 的载体。

### 13.18 自动产生日志的函数速查表

以下函数**自带 `game.log`**，调用时**不需要额外添加日志**，否则会重复记录：

#### 技能相关

| 函数 | 自动日志内容 | 示例 |
|------|-------------|------|
| `player.addSkills(skill)` | `"获得战法【技能名】"` | `await player.addSkills("newSkill");` |
| `player.removeSkills(skill)` | `"失去战法【技能名】"` | `await player.removeSkills("oldSkill");` |
| `player.logSkill(skill)` | `"发动了【技能名】"` 或 `"对X发动了【技能名】"` | `player.logSkill("skillName");` |
| `player.awakenSkill(skill)` | `"重置了技能【技能名】"` | `player.awakenSkill("skillName");` |
| `player.disableSkill(skill)` | `"的技能【技能名】暂时失效了"` | `player.disableSkill("skillName");` |

**注意：** `forced: true` 的技能会自动调用 `logSkill`，不需要手动调用。

#### 标记相关

| 函数 | 自动日志内容 | 示例 |
|------|-------------|------|
| `player.addMark(key, num)` | `"获得了X个【标记名】"` | `player.addMark("skillName", 2);` |
| `player.removeMark(key, num)` | `"移去了X个【标记名】"` | `player.removeMark("skillName", 1);` |

#### 卡牌操作相关

| 函数 | 自动日志内容 | 示例 |
|------|-------------|------|
| `player.draw(num)` | `"摸了X张牌"` | `await player.draw(2);` |
| `player.discard(cards)` | `"弃置了牌"` | `await player.discard(cards);` |
| `player.recast(cards)` | `"重铸了牌"` | `await player.recast(cards);` |
| `player.equip(card)` | `"装备了牌"` | `await player.equip(card);` |
| `player.gain(cards, "gain2")` | `"获得了牌"` | `await player.gain(cards, "gain2");` |
| `player.gainPlayerCard(...)` | `"从X获得了牌"` | `await player.gainPlayerCard(...);` |
| `player.loseToDiscardpile(cards)` | `"将牌置入了弃牌堆"` | `await player.loseToDiscardpile(cards);` |

**注意：** `gain()` 可以通过 `.set("log", false)` 禁用日志。

#### 体力相关

| 函数 | 自动日志内容 | 示例 |
|------|-------------|------|
| `player.recover(num)` | `"回复了X点体力"` | `await player.recover(1);` |
| `player.loseHp(num)` | `"失去了X点体力"` | `await player.loseHp(1);` |
| `player.loseMaxHp(num)` | `"减少了X点体力上限"` | `await player.loseMaxHp(1);` |
| `player.changeHujia(num)` | `"获得了X点护甲"` 或 `"失去了X点护甲"` | `player.changeHujia(2);` |

#### 状态相关

| 函数 | 自动日志内容 | 示例 |
|------|-------------|------|
| `player.turnOver()` | `"翻面"` | `await player.turnOver();` |
| `player.link()` | `"被连环"` 或 `"解除连环"` | `await player.link();` |
| `player.disableEquip(slots)` | `"废除了X个装备栏"` | `await player.disableEquip(["equip1"]);` |

#### 游戏状态相关

| 函数 | 自动日志内容 | 示例 |
|------|-------------|------|
| `player.die()` | `"死亡"` | `await player.die();` |
| `player.revive()` | `"复活"` | `await player.revive();` |
| `player.enterGame()` | `"进入游戏"` | `player.enterGame();` |
| `player.leaveGame()` | `"离开游戏"` | `player.leaveGame();` |

#### 不自动产生日志的函数

以下函数**不会自动产生日志**，需要手动添加 `game.log`：

| 函数 | 说明 | 需要手动 log |
|------|------|-------------|
| `player.damage(num)` | 受到伤害 | ✅ 需要 |
| `player.changeHp(num)` | 体力变化（内部函数） | ✅ 需要（通常通过 recover/loseHp 调用） |
| `player.lose(cards)` | 失去牌（内部函数） | ✅ 需要（通常通过 discard 调用） |
| `player.addSkill(skill)` | 添加状态技（无动画） | ✅ 需要 |
| `player.removeSkill(skill)` | 移除状态技（无动画） | ✅ 需要 |
| `player.addToExpansion(cards)` | 扣置牌到武将牌上 | ✅ 需要 |
| `player.gainMaxHp(num)` | 增加体力上限 | ✅ 需要 |

***

### 13.19 转化牌 mod：事件范围限制与递归保护

**【强制】** 实现转化牌类技能（如将锦囊牌转化为杀）时，`mod` 必须限制事件范围并防止递归调用。

**参考技能：** 手杀神吕布【无谋】(`mbwumou`)

```javascript
// ✅ 正确：限制事件范围 + 递归保护标志
mod: {
    cardname(card) {
        const event = get.event();
        if (!["chooseToUse", "chooseToRespond"].includes(event.name)) return;
        if (lib.card[card.name].type === "trick" && !_status._mbwumou_check) return "sha";
    },
    cardEnabled(card, player, event) {
        event = event || get.event();
        if (!["chooseToUse", "chooseToRespond"].includes(event?.name)) return;
        if (get.info("mbwumou").getfilter(card) || _status._mbwumou_check) return;
        _status._mbwumou_check = true;
        const sha = get.autoViewAs({ name: "sha", cards: card.cards }, card.cards);
        const bool = game.hasPlayer(target =>
            lib.filter.filterTarget(card.cards[0], player, target) &&
            lib.filter.targetEnabledx(sha, player, target)
        );
        delete _status._mbwumou_check;
        return bool;
    },
    // playerEnabled、targetInRange 同理设置/删除标志位
},
```

```javascript
// ❌ 错误：不限制事件范围，导致弃牌、判定等事件中错误转化
cardname(card) {
    if (lib.card[card.name].type === "trick") return "sha";
},
```

```javascript
// ❌ 错误：不设递归保护，cardname 返回 "sha" 后触发 cardEnabled，
// 其中 lib.filter.filterTarget 又触发 cardname，形成死循环
cardEnabled(card, player, event) {
    if (get.info("mbwumou").getfilter(card)) return;
    const sha = get.autoViewAs({ name: "sha", cards: card.cards }, card.cards);
    return game.hasPlayer(target =>
        lib.filter.filterTarget(card.cards[0], player, target) &&
        lib.filter.targetEnabledx(sha, player, target)
    );
},
```

**关键点**：
1. **事件范围限制**：`cardname`/`cardEnabled` 等 mod 在所有涉及卡牌判断的事件中触发，须用 `get.event().name` 过滤为 `chooseToUse`/`chooseToRespond`
2. **递归保护**：`cardname` 返回 `"sha"` 后触发 `cardEnabled` 检测，其中 `lib.filter.filterTarget` 又触发 `cardname`，用 `_status` 标志位阻断
3. **双重目标检测**：转化后的杀需同时检测原牌目标限制（`lib.filter.filterTarget(card.cards[0], ...)`）和杀的目标限制（`lib.filter.targetEnabledx(sha, ...)`），如空城技能使手牌为空的角色不能被杀指定

### 13.20 转化牌目标检测：使用 lib.filter.filterTarget

**【强制】** 检测原牌目标限制时，使用 `lib.filter.filterTarget(card, player, target)` 统一处理，不要手动判断 `info.filterTarget` 的类型。

**参考技能：** 手杀神吕布【无谋】(`mbwumou`)

```javascript
// ✅ 正确：使用 lib.filter.filterTarget 统一处理
const bool = lib.filter.filterTarget(card.cards[0], player, target) &&
             lib.filter.targetEnabledx(sha, player, target);
```

```javascript
// ❌ 错误：手动判断 filterTarget 类型（冗长且易错）
let info = get.info(cardx);
if (typeof info?.filterTarget == "boolean" && info?.filterTarget === false) return false;
if (typeof info?.filterTarget == "function" && !info.filterTarget(cardx, player, target)) return false;
return lib.filter.targetEnabledx(cardx, player, target);
```

**原因**：`lib.filter.filterTarget` 内部已处理 `boolean`/`function` 两种情况，代码更简洁可靠。

### 13.21 临时效果持续时间：hasHistory 替代 storage 追踪

**【强制】** 实现"使用伤害牌未造成伤害时移除效果"的逻辑时，使用 `hasHistory("sourceDamage")` 历史判断，不要用 storage 追踪。

**参考技能：** 谋董卓【无前】(`mbwuqian`) 的 `wushuang` 子技能

```javascript
// ✅ 正确：单个子技能 + hasHistory 判断
wushuang: {
    charlotte: true,
    trigger: { player: ["useCardAfter", "die"] },
    filter(event, player) {
        if (event.name === "die") return true;
        return get.is.damageCard(event.card) &&
               !player.hasHistory("sourceDamage", evt => evt.card === event.card);
    },
    silent: true,
    forceDie: true,
    async content(event, trigger, player) {
        for (const target of game.filterPlayer()) {
            target.unmarkAuto("mbwuqian_targeted", [player]);
        }
        player.removeSkill(event.name);
    },
},
```

```javascript
// ❌ 错误：3个子技能 + storage.nodamage 追踪
preCheck: {
    trigger: { player: "useCard1" },
    content(event, trigger, player) {
        player.storage.mbwuqian_nodamage = true;  // 使用前设 true
    },
},
onDamage: {
    trigger: { source: "damageBegin1" },
    content(event, trigger, player) {
        player.storage.mbwuqian_nodamage = false;  // 造成伤害时设 false
    },
},
postCheck: {
    trigger: { player: "useCardAfter" },
    filter(event, player) {
        return get.is.damageCard(event.card) &&
               player.storage.mbwuqian_nodamage === true;  // 未造成伤害
    },
    content(event, trigger, player) {
        // 移除效果
    },
},
```

**关键点**：
1. `hasHistory("sourceDamage", evt => evt.card === event.card)` 精确判断该牌是否造成过伤害
2. 添加 `die` 触发 + `forceDie: true`，玩家死亡时自动清理标记
3. 单个子技能替代3个，无需 storage 管理

### 13.22 多玩家叠加效果：markAuto 替代 hasSkill

**【强制】** 实现"多个玩家可以同时对同一目标施加效果"的逻辑时，使用 `markAuto` 记录发动者，而非 `hasSkill` 判断。

**参考技能：** 谋董卓【无前】(`mbwuqian`) 的 `targeted` 子技能

```javascript
// ✅ 正确：markAuto 记录发动者，支持多玩家叠加
filterTarget(card, player, target) {
    return !target.getStorage("mbwuqian_targeted").includes(player);
},
async content(event, trigger, player) {
    const { target } = event;
    target.addSkill("mbwuqian_targeted");
    target.markAuto("mbwuqian_targeted", [player]);
},
mod: {
    cardUsable(card, player, num) {
        if (card.name === "sha") {
            return num + game.countPlayer(target =>
                target.getStorage("mbwuqian_targeted").includes(player)
            );
        }
    },
},
```

```javascript
// ❌ 错误：hasSkill 判断，无法区分发动者
filterTarget(card, player, target) {
    return target !== player && !target.hasSkill("mbwuqian_targeted");
},
// 问题：一旦目标有 targeted 技能，其他玩家无法再对其使用无前
```

**关键点**：
1. `markAuto` 记录发动者，不同玩家的效果可同时作用于同一目标
2. `cardUsable` 只计算当前玩家发动的数量，不会因其他玩家的效果而增加出杀次数

### 13.23 附加技能管理：addAdditionalSkills + 容器子技能

**【推荐】** 需要临时添加技能并能在适当时机整体移除时，使用 `addAdditionalSkills` 配合容器子技能。

**参考技能：** 手杀神吕布【无前】(`mbwuqian`) 的 `wushuang` 子技能

```javascript
// ✅ 正确：容器子技能 + addAdditionalSkills
player.addSkill("mbwuqian_wushuang");  // 先添加容器子技能
await player.addAdditionalSkills("mbwuqian_wushuang", "wushuang");  // 再添加附加技能
// 移除时只需移除容器技能，附加的 wushuang 会自动移除
player.removeSkill("mbwuqian_wushuang");
```

```javascript
// ❌ 错误：直接 addSkill + removeSkill（需分别管理，容易遗漏）
player.addSkill("wushuang");
// ...后续需手动 removeSkill("wushuang")
```

**关键点**：通过容器技能管理附加技能，移除容器时附加技能自动清理，比分别 `addSkill`/`removeSkill` 更可靠。

### 13.24 技能状态提示：addTip 替代 mark/marktext

**【推荐】** 需要在角色旁显示自定义技能状态提示文本时，使用 `addTip` 配合 `onunmark` 自动清理。

**参考技能：** 谋董卓【无前】(`mbwuqian`) 的 `targeted` 子技能

```javascript
// ✅ 正确：addTip + onunmark 自动清理
targeted: {
    charlotte: true,
    init(player, skill) {
        player.addTip(skill, `${get.translation(skill)} 防具失效`);
    },
    intro: {
        nocount: true,
        onunmark(storage, player, skill) {
            player.removeTip(skill);
            player.removeSkill(skill);
        },
        content: "防具牌失效",
    },
    ai: { unequip2: true },
},
```

```javascript
// ❌ 错误：仅用 mark + marktext（无法显示自定义文本，且无自动清理）
targeted: {
    charlotte: true,
    mark: true,
    marktext: "前",
    intro: { content: "防具牌失效" },
    ai: { unequip2: true },
},
```

**关键点**：
1. `addTip` 显示自定义文本，比 `marktext` 更灵活
2. `onunmark` 钩子在标记移除时自动触发，清理 tip 和 skill
3. 配合 `markAuto`/`unmarkAuto` 使用，标记移除时自动触发 `onunmark`

***

## AI 编程检查清单

编写新技能前，按以下分类确认各项要点：

### 代码风格检查项

- [ ] **使用 `async content`（非 step 系统）**
- [ ] **使用 `===` 严格比较（非 `==`）**
- [ ] **使用 `?.` 可选链访问深层属性**
- [ ] **使用 `??` nullish 合并运算符（非 `||` 用于默认值）**
- [ ] **使用 `get.event()` 获取当前事件（非 `_status.event`）**
- [ ] **文本内容（prompt、log、翻译）使用中文引号 `“”`**
- [ ] **使用 `get.type2()` 判断卡牌大类（非 `get.type()`）**
- [ ] **体力值使用 `player.getHp()`（非 `player.hp`）**
- [ ] **使用 `player.hasCards()` 等语义化方法（非手动判断长度）**
- [ ] **prompt 使用模板字符串 `${get.translation(event.name)}：...`（非硬编码技能名）**
- [ ] **`chooseTarget` 后调用 `player.line(targets)` 添加攻击线动画**
- [ ] **`chooseTarget` 返回的 targets 调用 `sortBySeat()` 按座次排序**

### 技能结构检查项

- [ ] **技能描述中引用其他技能使用 `get.poptip()`**
- [ ] **技能描述中摸/交/弃置牌数用中文大写数字（"摸两张牌"非"摸2张牌"）**
- [ ] **代码中使用 `get.cnNumber()` 生成中文数字**
- [ ] **含 `mod` 的锁定技可省略 `forced` 和 `locked`（默认均为 `true`）**
- [ ] **含 `forced: true` 的锁定技可省略 `locked`（默认为 `true`）**
- [ ] **含 `mod` 但非强制技必须显式设 `forced: false`**
- [ ] **含 `forced: true` 但非锁定技必须显式设 `locked: false`**
- [ ] **主动技被动技混合技能：主动技写主技能位置，被动技写 subSkill 位置**
- [ ] **修改技能在原技能上修改 + 动态翻译（非 removeSkill + addSkill 同翻译新技能）**
- [ ] **使用牌的部分放主技能，记录部分用 `init` + `charlotte` 子技能（非 `group`）**
- [ ] **`mod` 可直接写在主技能上（非必须拆入 subSkill），减少子技能层级**
- [ ] **子技能 `charlotte: true` 不仅用于记录型，效果型子技能也可使用（防止被封印）**
- [ ] **获得技能使用 `addSkills`（有动画），失去技能使用 `removeSkills`（有动画）**
- [ ] **添加/移除状态技使用 `addSkill`/`removeSkill`（无动画）**
- [ ] **同时添加和移除技能使用 `player.changeSkills`（触发一次事件）**
- [ ] **监听技能变化使用 `changeSkillsAfter`（非 `addSkillAfter`/`removeSkillAfter`）**
- [ ] **`silent` 已默认最先静默发动且不走同时机流程，无需再加 `forced`**
- [ ] **`global` 声明的子技能已对全场生效，不要重复 `addTempSkill`/`addSkill` 挂同类全局效果**

### 基础技能实现检查项

- [ ] **觉醒技必须调用 `player.awakenSkill(event.skill)`，否则可重复觉醒**
- [ ] **觉醒技设置 `juexingji: true` 并声明 `derivation`**
- [ ] **限定技使用 `limited: true` 或手动管理使用标记**
- [ ] **使命技设置 `dutySkill: true` 并定义成功/失败状态子技能**
- [ ] **主公技设置 `zhuSkill: true` 并在 filter 中检查 `player.isZhu()`**
- [ ] **持恒技设置 `persevereSkill: true`（不可被移除/封印）**
- [ ] **转换技使用 `setStorage` 切换状态，配合动态翻译显示当前状态**
- [ ] **蓄能技使用子技能积累能量，主技能消耗能量**
- [ ] **多阶段技能使用 `cost` + `content` 分离模式**
- [ ] **无可选项交互的触发技省略 `cost`/`chooseBool`（默认发动）；可选发动时用 `frequent: true` 由 AI 自动决策**
- [ ] **响应类技能必须配置 `hiddenCard` + `ai.respondXxx` + `ai.skillTagFilter`**
- [ ] **响应类技能使用 `enable: "chooseToUse"`（非 `phaseUse`）**
- [ ] **`enable: chooseToUse` 技能必须检查事件类型，过滤掉不相关的事件（如 sha、shan、jiu 等）**

### 事件流与机制检查项

- [ ] **使用 `event.getParent()` 获取父事件**
- [ ] **`content` 中提前判断必要条件，避免插结卡死**
- [ ] **使用历史判断"首次"（非手动 storage 追踪）**
- [ ] **使用历史判断后，移除所有 storage 追踪代码**
- [ ] **多触发时机技能使用 `event.triggername` 区分触发来源**
- [ ] **摸牌阶段双时机：`phaseDrawBegin2`（增摸牌数） + `phaseDrawEnd`（选牌触发），替代 `phaseDrawAfter` + subSkill**
- [ ] **需要优先执行的子技能添加 `firstDo: true`**
- [ ] **需要调整执行顺序时使用 `priority` 属性**
- [ ] **触发技涉及使用牌时，filter 添加玩家有牌的过滤条件**
- [ ] **`filter` 条件应与技能描述一致**
- [ ] **多目标技能添加 `isFirstTarget` 和 `logTarget`**
- [ ] **指定目标类事件用 `useCardToPlayer` + `event.isFirstTarget`；加目标用 `event.targets.add`；令牌不可响应用 `trigger.directHit.addArray`**
- [ ] **跳过阶段用 `trigger.cancel()`；仅改数值用 `changeToZero()`**
- [ ] **牌堆底摸牌效果使用 `trigger.bottom = true` 引擎内置机制（替代手动 `get.bottomCards()` + `gain()`）**
- [ ] **使用 `onChooseToUse` 在主机端收集历史/状态并 `event.set()` 传递，禁止在 `filterCard`/`filter` 中调用 `getHistory`（依赖 actionHistory，客机端不存在）**
- [ ] **执行额外回合直接 `player.insertPhase()`，无需手动设置 `phaseList`/`_noTurnOver`**

### 卡牌操作检查项

- [ ] **使用 `trigger.cards?.[0]` 获取原始牌（非 `trigger.card`）**
- [ ] **用 `storage?.key` 判断赋牌（非 `hasGaintag`）**
- [ ] **转化牌/虚拟牌不需要额外排除（只需判断花色是否为 none）**
- [ ] **辅助过滤函数要一致使用（定义了 filterx 后在 filter 中也使用）**
- [ ] **使用 `chooseButton` + `backup` 替代 `chooseControl` 列表选择**
- [ ] **`backup` 中不设置 `selectTarget` 和 `filterTarget`（让系统自动继承原事件目标限制）**
- [ ] **`backup` 中添加 `log: false`，在 `precontent` 或 `onuse` 中手动调用 `logSkill`**
- [ ] **主动技能选牌使用 `filterCard` 外层定义（非 content 内 chooseCard）**
- [ ] **弃置对方手牌使用 `discardPlayerCard`（非 choosePlayerCard + discard）**
- [ ] **重铸牌设置 `discard: false, lose: false, delay: false`**
- [ ] **重铸前检查 `player.canRecast(card)`**
- [ ] **使用 `lib.filter.cardRecastable` 内置重铸过滤器（替代手动 filterCard）**
- [ ] **将牌置于牌堆顶使用 `player.lose(cards, ui.cardPile, 'insert')`（替代手动 `card.remove()` + `appendChild`）**
- [ ] **`gain()` 必须 `await`，且自带 log 不需要额外 `game.log`**
- [ ] **批量从多目标各获得一张牌使用 `gainMultiple(targets, pos)`（替代逐个 `gainPlayerCard`，自带 gaintag 支持）**
- [ ] **移除 gaintag 后标记自动消除，不需要手动清理**
- [ ] **无距离限制 buff 使用 `mod.targetInRange`（非 `trigger.nodistance`）**
- [ ] **永久卡牌标记使用 `eternal_` 前缀（跨区域保留）**
- [ ] **标记计数使用子技能 `count` + `addMark(1)` 而非 `sync` 函数（避免翻倍）**
- [ ] **数字标记在技能本身定义 `marktext` + `intro`，并用同名 `addMark` 管理**
- [ ] **数组/对象标记使用 `intro.nocount: true` 或自定义 `intro.mark`，避免显示错误数量**
- [ ] **`intro.content` 与 `intro.mark` 二选一，避免重复定义显示逻辑**
- [ ] **初始标记优先使用 `phaseBefore` + `enterGame`，并防止重复添加**
- [ ] **子技能标记使用完整子技能名（如 `skillName_state`）调用 `addMark`**
- [ ] **不要依赖触发器 `_result`/fallback 回调取得弃牌等数据（卡牌包异步化后不可靠）；改用 `target.getHistory('lose', ...)` 或 `card.storage` 标记**

### 玩家交互检查项

- [ ] **非强制触发技使用 `async cost`（非 `direct` + `chooseBool`）**
- [ ] **不可选项灰色显示（非直接隐藏）**
- [ ] **背水技能不可取消（不添加 cancel2）**
- [ ] **使用 `get.inpileVCardList()` 获取牌名列表（非手动构建）**
- [ ] **全选按钮使用 `allowChooseAll: true`**
- [ ] **`chooseControl`/`chooseCard` 的 `ai` 回调中用 `.set()` 传变量 + `get.event()` 获取（联机适配）**
- [ ] **`chooseControl` 使用对象形式参数（非无序数组形式）**
- [ ] **取消控件统一使用 `cancel2`（非自定义字符串如"取消"）**
- [ ] **`chooseCard` 使用对象形式参数（非无序参数形式）**
- [ ] **`chooseTarget` 使用对象形式参数（非位置参数形式）**
- [ ] **从牌堆获得牌使用 `draw2` 动画（非 `gain2`）**
- [ ] **多玩家同时选择使用 `game.chooseAnyOL`（非依次选择）**
- [ ] **使用 `get.is.damageCard()` 判断伤害牌（非 `get.tag()`）**
- [ ] **单选项时自动选择，跳过 `chooseControl` 确认**
- [ ] **使用 `player.addTip(skill, html)` 实现技能状态实时显示（替代纯 mark/intro）**
- [ ] **观看指定角色手牌使用 `player.viewHandcards(target)`（替代 `viewCards` + `getCards`）**

### Storage操作检查项

- [ ] **Storage 修改后重新赋值（触发 UI 更新）**
- [ ] **Storage 用 `init` 初始化 + `getStorage` 带默认值访问（非 filter 中手动初始化）**
- [ ] **`player.storage` 使用 `getStorage` 带默认值 + `setStorage` 赋值 + `markAuto` 数组操作（非直接访问）**
- [ ] **`card.storage` 使用 `game.broadcastAll` 同步（非直接赋值，联机兼容）**
- [ ] **`card.storage` 判断使用 `storage?.key` 可选链（非 `hasGaintag` 判断赋牌）**
- [ ] **使用 `player.getStorage()` / `player.markAuto()` / `player.setStorage()`**
- [ ] **使用 `player.countMark()` 替代 `player.storage`（标记计数）**
- [ ] **相关数据使用单数组管理（如 `[sha, draw, [opt1, opt2, opt3]]`），替代多个独立 Storage key**
- [ ] **联机兼容：避免在 filter/content 中手动初始化 Storage**
- [ ] **直接操作 storage（`delete`、手动赋值、数组 `push` 等）后必须紧跟同一 key 的 `markSkill`/`markAuto` 才会联机同步（见 4.7b）；否则必须用 `setStorage(key, value, true)`**
- [ ] **`setStorage(key, value)` 不带第三参数 `mark`（或为 false）时不触发任何同步（纯本地赋值）**
- [ ] **虚拟卡牌可用性检查使用 `get.autoViewAs` + `evt.filterCard`**
- [ ] **使用常量标签名替代字符串硬编码（如 `skillName_tag` 而非 `赋`）**

### AI配置检查项

- [ ] **被动技（触发技）添加 `check` 函数（AI 判断是否发动）**
- [ ] **静默子技能添加 `silent: true, popup: false`**
- [ ] **无特殊要求则使用固定牌池随机（非实时检测 `ui.cardPile`）**
- [ ] **主动技能 AI 配置 `order` 和 `result`**
- [ ] **`chooseControl` AI 中使用 `get.effect()` 评估选项收益（替代固定值）**
- [ ] **AI 函数中通过 `get.player()` 获取当前玩家对象（确保闭包环境正确）**
- [ ] **AI 函数中通过 `get.event()` 获取事件上下文（联机适配）**

### 日志规范检查项

- [ ] **不要重复 `logSkill`（`forced: true` 技能自动记录）**
- [ ] **重铸自带 log，不要额外打印**
- [ ] **使用 `get.cnNumber()` 显示中文数字**
- [ ] **`addMark`/`removeMark`、`addSkills`/`removeSkills`、`draw`/`discard`/`recast`/`gain`、`recover`/`loseHp`/`loseMaxHp`、`turnOver`/`link` 自带 log，不要额外打印**
- [ ] **`damage` 需要手动 log**
- [ ] **`mark` 的 `intro` 显示应足够明显，参考同类技能（如百出、点盏）**
- [ ] **日志颜色代码使用正确（#r/#g/#b/#y/#p）**

### 联机兼容检查项

- [ ] **使用 `game.broadcastAll` 同步状态修改（主机+客机同时执行）**
- [ ] **注册 `_status.postReconnect` 重连回调（断线重连恢复状态）**
- [ ] **三路判断模式：`event.isMine()` / `player.isOnline2()` / AI 自动处理**
- [ ] **`game.broadcast` 仅发送给客机端（主机不执行），`game.broadcastAll` 主机也执行**

### 自定义卡牌检查项

- [ ] **卡牌定义包含 `type`、`name`、`enable`、`filterTarget`、`content`**
- [ ] **装备牌设置正确的 `subtype`（equip1=武器/equip2=防具/equip3=坐骑）**
- [ ] **卡牌列表使用正确格式 `[花色, 点数, 卡牌名]`**
- [ ] **自定义卡牌添加对应的 `translate` 翻译**
- [ ] **花色标识使用正确（heart/diamond/spade/club/none）**

### 动画音效检查项

- [ ] **使用 `game.delayx()` 等待动画完成**
- [ ] **自定义特效使用 `game.broadcastAll` 确保联机同步**
- [ ] **改判技能展示牌使用 `$throwordered` + `thrownhighlight`（非 `showCards`）**
- [ ] **使用 `player.line(target)` 实现技能连线动画**
- [ ] **使用 `player.$throw(count)` 实现丢牌动画**

***
