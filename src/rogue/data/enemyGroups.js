// 敌人组合：旧版（存档 v2 及更早）手工配置的固定敌方阵容。
//
// 现状：肉鸽的敌方已经改为「按模式随机（闯关=扩展角色池 / 无尽=本体角色池），
// 属性按关卡随机分配」，新战斗不再使用这里的组合（见 ../enemy.js）。
// 本文件只保留一件事：把旧存档进行中战斗的 groupId 还原成完整敌方阵容，
// 让老玩家恢复战斗时重打的还是原来那组敌人，而不是被重掷。
//
// 自检会查
//   id 与键名一致、name 非空、每个敌人都有合法 characterId、额外技能都有定义、
//   overrides 只出现上面五个字段且都是数字。
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
