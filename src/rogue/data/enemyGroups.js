// 敌人组合：一个组合 = 一关的敌方阵容。作者填的是「这一关打谁、他们有多强」。
//
// 填什么
//   key / id      组合 id（两处保持一致），stages.js 的 groups 里填它
//   name          显示用名称
//   enemies[]     至少 1 个敌人，每项：
//     characterId            角色 id，必须存在于本扩展的角色包
//     skills[]               该敌人额外获得的技能 id（扩展技能或肉鸽技能都可以）
//     overrides.maxHp        体力上限增量（可负）
//     overrides.hp           > 0 时把当前体力直接设成这个值
//     overrides.defense/draw/attack  该敌人在 data/stats.js 那张表上的等级
//
// 自检会查
//   id 与键名一致、name 非空、每个敌人都有合法 characterId、额外技能都有定义、
//   overrides 只出现上面五个字段且都是数字。
//
// 注意：强化只作用在当前战斗的 Player 上，绝对不要改 lib.character（模式内部也不会回写）。
//
// 填完跑：node tools/test/rogue-data.test.mjs（会校验下面的每一条约束，不用开游戏）

export const enemyGroups = {
	group_zofer: {
		id: "group_zofer",
		name: "初战·占位",
		enemies: [
			{
				characterId: "佐菲",
				skills: [],
				overrides: { hp: 0, maxHp: 0, defense: 0, draw: 0, attack: 0 },
			},
		],
	},
	group_baltan: {
		id: "group_baltan",
		name: "双敌·占位",
		enemies: [
			{
				characterId: "巴尔坦星人",
				skills: [],
				overrides: { hp: 0, maxHp: 1, defense: 0, draw: 0, attack: 0 },
			},
			{
				characterId: "巴尔坦星人",
				skills: [],
				overrides: { hp: 0, maxHp: 0, defense: 0, draw: 1, attack: 0 },
			},
		],
	},
	group_seven: {
		id: "group_seven",
		name: "强化单体·占位",
		enemies: [
			{
				characterId: "赛文",
				// 演示“敌人也能带额外技能”：rogue_ 技能只在肉鸽模式注册，见 data/skills.js
				skills: ["rogue_xushui"],
				overrides: { hp: 0, maxHp: 2, defense: 1, draw: 1, attack: 1 },
			},
		],
	},
};

export function getEnemyGroup(id) {
	const group = enemyGroups[id];
	if (!group || !Array.isArray(group.enemies) || !group.enemies.length) {
		return null;
	}
	return group;
}
