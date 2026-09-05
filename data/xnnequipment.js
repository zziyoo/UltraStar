var xnnEquipmentNames = ["wslydd", "jslyzh", "fyqy", "yfxg", "cy", "cyzx", "atpf", "sgb", "hasgb", "xjcy", "lybsq", "glm", "atyl"];

var xnnEquipmentInfo = {
    wslydd: {
        chineseName: "万世流涌大典",
        type: "equip",
        subtype: "equip1",
        distance: { attackFrom: -1 },
        range: 2,
        suit: "diamond",
        number: 13,
        image: "ext:奥特之星/assets/image/wslydd.png",
        skill: "wslydd_skill",
        skillDescription: "锁定技，你使用伤害牌造成的伤害+X（X为你已损失的体力值）。",
        equipValue: "2.5+2.5x"
    },
    jslyzh: {
        chineseName: "静水流涌之辉",
        type: "equip",
        subtype: "equip1",
        distance: { attackFrom: -2 },
        range: 3,
        suit: "heart",
        number: 13,
        image: "ext:奥特之星/assets/image/jslyzh.png",
        skill: "jslyzh_skill",
        skillDescription: "当你使用【杀】造成伤害后，你可以摸场上已受伤角色数张牌。"
    },
    fyqy: {
        chineseName: "焚曜千阳",
        type: "equip",
        subtype: "equip1",
        distance: { attackFrom: -3 },
        range: 4,
        suit: "heart",
        number: 10,
        image: "ext:奥特之星/assets/image/fyqy.png",
        skill: "fyqy_skill, fyqy_skill2",
        skillDescription: "锁定技，你使用伤害牌造成的伤害改为火焰伤害。当你造成火焰伤害后，你可以重铸任意张手牌。"
    },
    yfxg: {
        chineseName: "岩峰巡歌",
        type: "equip",
        subtype: "equip1",
        distance: { attackFrom: -1 },
        range: 2,
        suit: "diamond",
        number: 11,
        image: "ext:奥特之星/assets/image/yfxg.png",
        skill: "yfxg_skill",
        skillDescription: "当你使用【杀】时，你可以修改此【杀】属性或获得一张【闪】。",
        equipValue: 6
    },
    cy: {
        chineseName: "苍耀",
        type: "equip",
        subtype: "equip1",
        distance: { attackFrom: -3 },
        range: 4,
        suit: "spade",
        number: 4,
        image: "ext:奥特之星/assets/image/cy.png",
        skill: "cy_skill",
        skillDescription: "当你使用伤害牌造成伤害时，你可以弃置一张牌，令此伤害+1。",
        equipValue: 5.5
    },
    cyzx: {
        chineseName: "赤月之形",
        type: "equip",
        subtype: "equip1",
        distance: { attackFrom: -2 },
        range: 3,
        suit: "heart",
        number: 6,
        image: "ext:奥特之星/assets/image/cyzx.png",
        skill: "cyzx_skill, cyzx_skill_effect",
        skillDescription: "锁定技，体力值与你不同或等于上限的角色无法响应你使用的伤害牌。",
        equipValue: 6
    },
    atpf: {
        chineseName: "奥特披风",
        type: "equip",
        subtype: "equip2",
        suit: "heart",
        number: "1-6(随机)",
        image: "ext:奥特之星/assets/image/atpf.png",
        skill: "atpf_skill",
        skillDescription: "当你回合外需要使用或打出【杀】或【闪】时，你可以判定，若判定结果与此装备花色不同，视为使用或打出此牌。每次响应事件只能判定一次。",
        equipValue: 8.5,
        note: "打造时随机生成点数1-6，检索牌堆时匹配任意点数的奥特披风"
    },
    sgb: {
        chineseName: "神光棒",
        type: "equip",
        subtype: "equip5",
        suit: "heart",
        number: 1,
        image: "ext:奥特之星/assets/image/sgb.png",
        skill: "sgb_skill",
        skillDescription: "当你使用普通锦囊牌指定目标后，你可以令此牌额外结算一次。",
        equipValue: 10,
        note: "迪迦专属武器"
    },
    hasgb: {
        chineseName: "黑暗神光棒",
        type: "equip",
        subtype: "equip5",
        suit: "spade",
        number: 1,
        image: "ext:奥特之星/assets/image/hasgb.png",
        skill: "hasgb_skill",
        skillDescription: "每回合限一次，当你受到伤害后，你可以弃置两张牌并回复一点体力。",
        equipValue: 10,
        note: "黑暗迪迦专武"
    },
    xjcy: {
        chineseName: "星鹫赤羽",
        type: "equip",
        subtype: "equip1",
        distance: { attackFrom: -4 },
        range: 5,
        suit: "diamond",
        number: 5,
        image: "ext:奥特之星/assets/image/xjcy.png",
        skill: "xjcy_skill",
        skillDescription: "锁定技，出牌阶段内，你每使用三张牌，你摸一张牌且本回合你使用【杀】的次数上限+1。",
        equipValue: 6,
        note: "恰斯卡专武"
    },
    lybsq: {
        chineseName: "流萤变身器",
        type: "equip",
        subtype: "equip5",
        suit: "heart",
        number: 3,
        image: "ext:奥特之星/assets/image/lybsq.png",
        skill: "lybsq_skill",
        skillDescription: "出牌阶段限一次，你可以失去一点体力对一名其他角色造成一点火焰伤害。",
        equipValue: 9,
        note: "流萤专武"
    },
    glm: {
        chineseName: "格拉默",
        type: "equip",
        subtype: "equip1",
        distance: { attackFrom: -1 },
        range: 2,
        suit: "club",
        number: 8,
        image: "ext:奥特之星/assets/image/glm.png",
        skill: "glm_skill",
        skillDescription: "若你使用的【杀】颜色为黑色，你可以弃置目标的一张牌并摸一张牌，否则你获得其一张牌。",
        equipValue: 6,
        note: "流萤专属武器"
    },
    atyl: {
        chineseName: "奥特哑铃",
        type: "equip",
        subtype: "equip5",
        suit: "club",
        number: 12,
        image: "ext:奥特之星/assets/image/atyl.png",
        skill: "atyl_skill",
        skillDescription: "当一名角色进行判定时，你可以终止此次判定。",
        equipValue: 8
    }
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        xnnEquipmentNames: xnnEquipmentNames,
        xnnEquipmentInfo: xnnEquipmentInfo
    };
}
