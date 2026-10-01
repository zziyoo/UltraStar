// 奥特之星·肉鸽：内容配置自检。node tools/test/rogue-data.test.mjs
//
// 作者填完 data/ 下的五个配置文件后跑这个脚本即可，不需要开游戏：
//   - 关卡区间与敌人组合的引用是否对得上
//   - 敌人的 characterId 是否真的存在于本扩展的角色包
//   - 敌人额外技能、肉鸽技能池的 id 是否有定义
//   - 属性等级表 / 价格表 / 奖励货币是否与配置规模一致
//   - 模式封面图是否存在且登记进素材清单
//
// 角色与技能清单直接从扩展包本身取（用桩顶掉 noname.js），所以校验的是真实注册结果。

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { registerHooks } from "node:module";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");

// 与 tools/check/verify-parity.mjs 同思路的最小桩：让扩展包能在 Node 里构建出来
const MOCK_URL = "rogue-data-stub:noname";
const MOCK_SRC = `
const anyFn = function () {};
export const lib = {
	character: {}, skill: {}, card: {}, translate: {},
	characterSubstitute: {}, characterReplace: {},
	namePrefix: null,
	element: {}, config: {}, rank: {}, assetURL: "",
	filter: new Proxy({}, { get: (t, k) => { if (!(k in t)) t[k] = anyFn; return t[k]; } }),
};
export const game = {
	addGroup: () => {}, addCharacterPack: () => {},
	saveExtensionConfig: () => {}, getExtensionConfig: () => null,
	playAudio: () => {}, log: () => {},
};
export const ui = { window: null, create: {} };
export const get = { poptip: s => s };
export const ai = {};
export const _status = {};
`;

registerHooks({
	resolve(specifier, context, next) {
		if (specifier.endsWith("noname.js")) {
			return { url: MOCK_URL, shortCircuit: true };
		}
		return next(specifier, context);
	},
	load(url, context, next) {
		if (url === MOCK_URL) {
			return { format: "module", shortCircuit: true, source: MOCK_SRC };
		}
		return next(url, context);
	},
});

const load = rel => import(pathToFileURL(path.join(root, rel)).href);
const extension = (await load("extension.js")).default;
const pack = extension().package;
const roster = new Set(Object.keys(pack.character.character ?? {}));
const packSkills = new Set(Object.keys(pack.skill.skill ?? {}));

const cfg = await load("src/rogue/config.js");
const stages = await load("src/rogue/data/stages.js");
const groupsData = await load("src/rogue/data/enemyGroups.js");
const skillsData = await load("src/rogue/data/skills.js");
const statsData = await load("src/rogue/data/stats.js");
const rewardsData = await load("src/rogue/data/rewards.js");

let passed = 0;
const failures = [];

function check(name, fn) {
	try {
		const detail = fn();
		passed++;
		console.log(`  ok   ${name}${detail ? ` — ${detail}` : ""}`);
	} catch (error) {
		failures.push(name);
		console.log(`  FAIL ${name} — ${error?.message ?? error}`);
	}
}
function assert(cond, msg) {
	if (!cond) {
		throw new Error(msg ?? "断言失败");
	}
}

const OVERRIDE_KEYS = ["hp", "maxHp", "defense", "draw", "attack"];
const EFFECT_KEYS = ["armor", "maxHp", "startHand", "extraDraw", "handLimit", "shaDamage", "shaLimit", "extraSkills"];
const NUMBER_EFFECT_KEYS = EFFECT_KEYS.filter(key => key !== "extraSkills");

console.log("奥特之星·肉鸽 内容配置自检\n");
console.log(`可选角色 ${roster.size} 名，扩展技能 ${packSkills.size} 个\n`);

check("封面图：路径存在且已登记进素材清单", () => {
	assert(typeof cfg.MODE_SPLASH === "string" && cfg.MODE_SPLASH.startsWith(`ext:${cfg.EXTENSION_NAME}/`), `MODE_SPLASH 应以 ext:${cfg.EXTENSION_NAME}/ 开头，实际 ${cfg.MODE_SPLASH}`);
	const relative = cfg.MODE_SPLASH.slice(`ext:${cfg.EXTENSION_NAME}/`.length);
	const disk = path.join(root, relative);
	assert(fs.existsSync(disk), `封面图不存在：${relative}`);
	const manifest = fs.readFileSync(path.join(root, "data", "assets.js"), "utf8");
	assert(manifest.includes(`"${relative}"`), `封面图未登记进 data/assets.js：${relative}（运行 node tools/update-manifest.mjs ${relative}）`);
	return relative;
});

check("关卡区间：编号、范围与排序合法", () => {
	assert(Array.isArray(stages.stagePools) && stages.stagePools.length > 0, "stagePools 不能为空");
	let lastMax = 0;
	for (const [index, band] of stages.stagePools.entries()) {
		assert(Number.isFinite(band.min) && Number.isFinite(band.max), `第 ${index + 1} 个区间缺少 min/max`);
		assert(band.min <= band.max, `第 ${index + 1} 个区间 min>max（${band.min}~${band.max}）`);
		assert(band.min > lastMax, `第 ${index + 1} 个区间与上一个重叠或未按关卡升序`);
		lastMax = band.max;
		assert(Array.isArray(band.groups) && band.groups.length > 0, `第 ${index + 1} 个区间没有填 groups`);
	}
	return `${stages.stagePools.length} 个区间，覆盖 1~${lastMax}`;
});

check("关卡区间：引用的敌人组合都存在", () => {
	const missing = [];
	for (const band of stages.stagePools) {
		for (const id of band.groups) {
			if (!groupsData.getEnemyGroup(id)) {
				missing.push(id);
			}
		}
	}
	assert(!missing.length, `以下组合在 enemyGroups.js 里不存在或阵容为空：${missing.join("、")}`);
	return `${stages.stagePools.reduce((sum, band) => sum + band.groups.length, 0)} 处引用`;
});

check("无尽兜底池：非空且组合都存在", () => {
	assert(Array.isArray(stages.endlessFallbackPool) && stages.endlessFallbackPool.length > 0, "endlessFallbackPool 不能为空，否则无尽模式超过最后一个区间会无法开战");
	const missing = stages.endlessFallbackPool.filter(id => !groupsData.getEnemyGroup(id));
	assert(!missing.length, `兜底池里的组合不存在：${missing.join("、")}`);
	return stages.endlessFallbackPool.join("、");
});

check("敌人组合：结构与字段合法", () => {
	const problems = [];
	for (const [key, group] of Object.entries(groupsData.enemyGroups)) {
		if (group.id !== key) {
			problems.push(`${key}: id 与键名不一致（${group.id}）`);
		}
		if (!group.name) {
			problems.push(`${key}: 缺少 name`);
		}
		if (!Array.isArray(group.enemies) || !group.enemies.length) {
			problems.push(`${key}: 没有敌人`);
			continue;
		}
		for (const [index, enemy] of group.enemies.entries()) {
			if (!enemy.characterId) {
				problems.push(`${key} 第${index + 1}个敌人: 缺少 characterId`);
			}
			const overrides = enemy.overrides;
			if (overrides) {
				for (const field of Object.keys(overrides)) {
					if (!OVERRIDE_KEYS.includes(field)) {
						problems.push(`${key} 第${index + 1}个敌人: overrides 不支持字段 ${field}（可用：${OVERRIDE_KEYS.join("/")}）`);
					} else if (!Number.isFinite(overrides[field])) {
						problems.push(`${key} 第${index + 1}个敌人: overrides.${field} 不是数字`);
					}
				}
			}
			if (enemy.skills && !Array.isArray(enemy.skills)) {
				problems.push(`${key} 第${index + 1}个敌人: skills 应为数组`);
			}
		}
	}
	assert(!problems.length, problems.join("；"));
	return `${Object.keys(groupsData.enemyGroups).length} 个组合`;
});

check("敌人组合：角色存在于本扩展，额外技能有定义", () => {
	const problems = [];
	const rogueSkillIds = new Set(skillsData.pool.map(item => item.id));
	for (const [key, group] of Object.entries(groupsData.enemyGroups)) {
		for (const enemy of group.enemies ?? []) {
			if (enemy.characterId && !roster.has(enemy.characterId)) {
				problems.push(`${key}: 角色「${enemy.characterId}」不在本扩展角色包中`);
			}
			for (const skillId of enemy.skills ?? []) {
				if (!rogueSkillIds.has(skillId) && !packSkills.has(skillId)) {
					problems.push(`${key}: 技能「${skillId}」既不在肉鸽技能池也不在扩展技能里`);
				}
			}
		}
	}
	assert(!problems.length, problems.join("；"));
	return `覆盖 ${Object.values(groupsData.enemyGroups).reduce((sum, group) => sum + (group.enemies?.length ?? 0), 0)} 个敌人位`;
});

check("肉鸽技能池：id 规范、定义与翻译齐备", () => {
	assert(Array.isArray(skillsData.pool) && skillsData.pool.length > 0, "pool 不能为空");
	const problems = [];
	const seen = new Set();
	for (const item of skillsData.pool) {
		const isPack = packSkills.has(item.id);
		if (!/^rogue_/.test(item.id) && !isPack) {
			problems.push(`${item.id}: id 必须以 rogue_ 开头，或是扩展分包里的技能`);
		}
		if (seen.has(item.id)) {
			problems.push(`${item.id}: id 重复`);
		}
		seen.add(item.id);
		const info = skillsData.skill[item.id];
		if (!info) {
			problems.push(`${item.id}: 缺少 lib.skill 定义`);
		} else if (!info.trigger && !info.enable && !info.mod && !info.group) {
			problems.push(`${item.id}: 技能定义里没有 trigger/enable/mod/group，本体会当成无效技能`);
		}
		if (isPack) {
			// 分包技能：id / id_info 双键翻译
			if (!skillsData.translate[item.id]) {
				problems.push(`${item.id}: 缺少技能名翻译`);
			}
			if (!skillsData.translate[`${item.id}_info`]) {
				problems.push(`${item.id}: 缺少 _info 描述翻译`);
			}
		} else {
			const text = skillsData.translate[item.id];
			if (!text) {
				problems.push(`${item.id}: 缺少翻译`);
			} else if (!text.includes("<hr>")) {
				problems.push(`${item.id}: 翻译缺少 <hr>（应为「技能名<hr>描述」）`);
			}
		}
		if (item.price !== undefined && !(Number.isFinite(item.price) && item.price > 0)) {
			problems.push(`${item.id}: price 应为正数（省略则用默认价 ${cfg.DEFAULT_SKILL_PRICE}）`);
		}
	}
	assert(!problems.length, problems.join("；"));
	const priced = skillsData.pool.filter(item => Number.isFinite(item.price)).length;
	return `${skillsData.pool.length} 条技能（其中 ${priced} 条标价 100）`;
});

check("技能池：不在池里的 rogue_ 技能定义会被漏掉", () => {
	const orphan = Object.keys(skillsData.skill).filter(
		id => /^rogue_/.test(id) && !skillsData.pool.some(item => item.id === id)
	);
	return orphan.length ? `注意：${orphan.join("、")} 有定义但不在 pool 里，商店永远不会出现` : "无孤儿技能";
});

check("属性强化：等级表长度与支持的效果键", () => {
	const problems = [];
	for (const statId of cfg.STAT_IDS) {
		const stat = statsData.stats[statId];
		if (!stat) {
			problems.push(`${statId}: 缺少配置`);
			continue;
		}
		if (!Number.isInteger(stat.maxLevel) || stat.maxLevel < 0) {
			problems.push(`${statId}: maxLevel 应为非负整数`);
			continue;
		}
		if (!Array.isArray(stat.levels)) {
			problems.push(`${statId}: levels 应为数组`);
			continue;
		}
		if (stat.levels.length !== stat.maxLevel) {
			problems.push(`${statId}: levels 有 ${stat.levels.length} 项，但 maxLevel=${stat.maxLevel}（应一一对应）`);
		}
		for (const [index, level] of stat.levels.entries()) {
			if (!level || typeof level !== "object") {
				problems.push(`${statId} 第${index + 1}级: 应为对象`);
				continue;
			}
			for (const field of Object.keys(level)) {
				if (!EFFECT_KEYS.includes(field)) {
					problems.push(`${statId} 第${index + 1}级: 不支持的效果键 ${field}（可用：${EFFECT_KEYS.join("/")}）`);
				}
			}
			for (const field of NUMBER_EFFECT_KEYS) {
				if (level[field] !== undefined && !(Number.isFinite(level[field]) && level[field] >= 0)) {
					problems.push(`${statId} 第${index + 1}级: ${field} 应为非负数`);
				}
			}
			if (level.extraSkills && !Array.isArray(level.extraSkills)) {
				problems.push(`${statId} 第${index + 1}级: extraSkills 应为数组`);
			}
		}
		if (!Array.isArray(stat.price)) {
			problems.push(`${statId}: price 应为数组`);
			continue;
		}
		if (stat.price.some(value => !(Number.isFinite(value) && value >= 0))) {
			problems.push(`${statId}: price 里应都是非负数`);
		}
	}
	assert(!problems.length, problems.join("；"));
	const filled = cfg.STAT_IDS.filter(id => statsData.stats[id].levels.some(level => Object.keys(level).length > 0)).length;
	return filled ? `${filled}/${cfg.STAT_IDS.length} 项已填数值` : "三项均为空效果（可跑通但无实际加成）";
});

check("属性强化：extraSkills 引用的技能有定义", () => {
	const problems = [];
	const rogueSkillIds = new Set(skillsData.pool.map(item => item.id));
	for (const statId of cfg.STAT_IDS) {
		for (const level of statsData.stats[statId].levels) {
			for (const id of level.extraSkills ?? []) {
				if (!rogueSkillIds.has(id) && !packSkills.has(id)) {
					problems.push(`${statId}: 技能「${id}」不存在`);
				}
			}
		}
	}
	assert(!problems.length, problems.join("；"));
	return "引用完整";
});

check("奖励配置：货币键合法、系数非负", () => {
	const problems = [];
	for (const [key, value] of Object.entries(rewardsData.reward)) {
		if (!cfg.CURRENCIES.includes(key)) {
			problems.push(`reward.${key} 不是已定义的货币（${cfg.CURRENCIES.join("/")}）`);
		} else if (!(Number.isFinite(value) && value >= 0)) {
			problems.push(`reward.${key} 应为非负数（√关数的系数）`);
		}
	}
	assert(!problems.length, problems.join("；"));
	const sample = rewardsData.getRewardForLevel(1, cfg.CURRENCIES);
	const later = rewardsData.getRewardForLevel(10, cfg.CURRENCIES);
	return `第1关 ${JSON.stringify(sample)}，第10关 ${JSON.stringify(later)}`;
});

check("配置规模：总关卡数与区间覆盖一致", () => {
	const lastBand = stages.stagePools[stages.stagePools.length - 1];
	assert(lastBand.max >= cfg.CHALLENGE_TOTAL_LEVELS, `最后一个区间只到第 ${lastBand.max} 关，而总关卡数是 ${cfg.CHALLENGE_TOTAL_LEVELS}`);
	return `区间覆盖到 ${lastBand.max} 关 ≥ 总关卡数 ${cfg.CHALLENGE_TOTAL_LEVELS}`;
});

console.log(`\nrogue-data: passed=${passed} failed=${failures.length}`);
if (failures.length) {
	console.log(`失败用例：${failures.join("、")}`);
	process.exit(1);
}
