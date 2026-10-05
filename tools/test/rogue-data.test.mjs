// 奥特之星·肉鸽：内容配置自检。node tools/test/rogue-data.test.mjs
//
// 作者填完 data/ 下的配置文件后跑这个脚本即可，不需要开游戏：
//   - 旧档迁移用的敌人组合配置是否完整（角色 id 是否真的存在于本扩展的角色包）
//   - 敌人额外技能、商店技能池的 id 是否有定义
//   - 属性等级表 / 价格表 / 奖励金额是否与配置规模一致
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
const groupsData = await load("src/rogue/data/enemyGroups.js");
const skillsData = await load("src/rogue/data/skills.js");
const statsData = await load("src/rogue/data/stats.js");
const rewardsData = await load("src/rogue/data/rewards.js");
const eventsData = await load("src/rogue/data/events.js");
const curiosData = await load("src/rogue/data/curios.js");
const curioManager = await load("src/rogue/curioManager.js");
const abyss = await load("src/rogue/endless/abyss.js");
const abyssConfig = await load("src/rogue/endless/abyssConfig.js");
const abyssAffixes = await load("src/rogue/endless/abyssAffixes.js");
const modeModule = await load("src/rogue/mode.js");

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
function assertEqual(actual, expected, msg) {
	if (actual !== expected) {
		throw new Error(`${msg ?? "断言失败"}：期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`);
	}
}

const OVERRIDE_KEYS = ["hp", "maxHp", "defense", "draw", "attack"];
const EFFECT_KEYS = ["armor", "maxHp", "startHand", "extraDraw", "handLimit", "damageChance", "shaLimit", "extraSkills"];
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

check("敌人组合（旧档迁移用）：结构与字段合法", () => {
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
					problems.push(`${key}: 技能「${skillId}」既不在商店技能池也不在扩展技能里`);
				}
			}
		}
	}
	assert(!problems.length, problems.join("；"));
	return `覆盖 ${Object.values(groupsData.enemyGroups).reduce((sum, group) => sum + (group.enemies?.length ?? 0), 0)} 个敌人位`;
});

check("商店技能池：id 规范、定义与翻译齐备", () => {
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
			problems.push(`${item.id}: price 应为正数（这一项只是作者标注的基础价，实际售价由 shop.js 按模式基准价 ±25% 随机生成）`);
		}
	}
	assert(!problems.length, problems.join("；"));
	const priced = skillsData.pool.filter(item => Number.isFinite(item.price)).length;
	return `${skillsData.pool.length} 条技能（${priced} 条标了基础价，实际售价按模式基准价随机浮动）`;
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

check("奖励配置：闯关固定 50 金币 + 经验表；无尽金币系数 50 / 经验系数 20；29 关累计 330", () => {	assert(rewardsData.CHALLENGE_GOLD_PER_LEVEL === 50, "闯关每关金币应固定 50");
	assert(rewardsData.endlessReward.gold === 50, "无尽金币系数应为 50（金币 = floor(50×√n)，第 1 关即 50）");
	assert(rewardsData.endlessReward.exp === 20, "无尽经验系数应为 20（经验 = floor(20×√n)，与属性升级价同系数）");
	const problems = [];
	for (const [key, value] of Object.entries(rewardsData.endlessReward)) {
		if (!cfg.CURRENCIES.includes(key)) {
			problems.push(`endlessReward.${key} 不是已定义的货币（${cfg.CURRENCIES.join("/")}）`);
		} else if (!(Number.isFinite(value) && value >= 0)) {
			problems.push(`endlessReward.${key} 应为非负数（√关数的系数）`);
		}
	}
	assert(!problems.length, problems.join("；"));
	// 无尽金币抽值对账：n=2 → 70、n=10 → 158（floor，不用 round）
	assert(rewardsData.getEndlessReward(2, cfg.CURRENCIES).gold === 70, "无尽第2关金币 floor(50×√2)");
	assert(rewardsData.getEndlessReward(10, cfg.CURRENCIES).gold === 158, "无尽第10关金币 floor(50×√10)");
	assert(rewardsData.getEndlessReward(10, cfg.CURRENCIES).exp === 63, "无尽第10关经验 floor(20×√10)");
	// 闯关经验表覆盖 1~30；前 29 关累计 +328，加初始 2 点第 29 关结算后正好 330
	let sum = 0;
	for (let level = 1; level <= 30; level++) {
		const exp = rewardsData.CHALLENGE_EXP_TABLE[level];
		assert(Number.isInteger(exp) && exp > 0, `第${level}关经验未配置或非法`);
		if (level <= 29) {
			sum += exp;
		}
	}
	assert(sum === 328, `前 29 关经验累计应为 328，实际 ${sum}`);
	assert(cfg.INITIAL_CURRENCY.exp + sum === 330, "第 29 关结算后总经验应为 330");
	const sample = rewardsData.getEndlessReward(1, cfg.CURRENCIES);
	const later = rewardsData.getEndlessReward(10, cfg.CURRENCIES);
	const challengeSample = rewardsData.getChallengeReward(7);
	return `闯关第7关 ${JSON.stringify(challengeSample)}，无尽第1关 ${JSON.stringify(sample)}，第10关 ${JSON.stringify(later)}`;
});

const EVENT_REWARD_KEYS = ["gold", "exp", "goldByWin", "expByWin", "goldPct", "goldPayout", "curio", "skill", "statUp", "statDown"];

check("事件配置：结构与字段合法、奖励键与引用有效", () => {
	const ids = Object.keys(eventsData.events);
	assert(ids.length > 0, "事件池不能为空");
	const problems = [];
	for (const [key, event] of Object.entries(eventsData.events)) {
		if (event.id !== key) {
			problems.push(`${key}: id 与键名不一致（${event.id}）`);
		}
		if (!event.name) {
			problems.push(`${key}: 缺少 name`);
		}
		if (!event.description) {
			problems.push(`${key}: 缺少 description`);
		}
		if (!event.image || !event.image.startsWith(`extension/${cfg.EXTENSION_NAME}/assets/events/`)) {
			problems.push(`${key}: image 应指向 extension/${cfg.EXTENSION_NAME}/assets/events/ 下的文件`);
		}
		if (!Array.isArray(event.choices) || !event.choices.length) {
			problems.push(`${key}: choices 不能为空`);
			continue;
		}
		for (const [index, choice] of event.choices.entries()) {
			if (!choice || typeof choice.text !== "string" || !choice.text.trim()) {
				problems.push(`${key} 第${index + 1}个选项: 缺少 text`);
			}
			const hasReward = choice?.reward && typeof choice.reward === "object";
			const hasOutcomes = Array.isArray(choice?.outcomes) && choice.outcomes.length > 0;
			if (hasReward === hasOutcomes) {
				problems.push(`${key} 第${index + 1}个选项: reward 与 outcomes 必须二选一`);
			}
			if (hasOutcomes) {
				const total = choice.outcomes.reduce((sum, item) => sum + (Number.isFinite(item?.chance) ? item.chance : 0), 0);
				if (Math.abs(total - 1) > 1e-9) {
					problems.push(`${key} 第${index + 1}个选项: outcomes 概率合计应为 1，实际 ${total}`);
				}
				for (const item of choice.outcomes) {
					if (!item?.reward || typeof item.reward !== "object") {
						problems.push(`${key} 第${index + 1}个选项: outcomes 里缺少 reward`);
					}
				}
			}
			const rewards = hasOutcomes ? choice.outcomes.map(item => item.reward) : [choice.reward];
			for (const reward of rewards) {
				for (const field of Object.keys(reward ?? {})) {
					if (!EVENT_REWARD_KEYS.includes(field)) {
						problems.push(`${key} 第${index + 1}个选项: 不支持的奖励键 ${field}（可用：${EVENT_REWARD_KEYS.join("/")}）`);
					}
				}
				for (const field of ["gold", "exp", "goldByWin", "expByWin"]) {
					const value = reward?.[field];
					if (value !== undefined && !Number.isFinite(value)) {
						problems.push(`${key} 第${index + 1}个选项: ${field} 应为数字`);
					}
				}
				for (const field of ["statUp", "statDown"]) {
					const value = reward?.[field];
					if (value !== undefined && value !== "random" && !cfg.STAT_IDS.includes(value)) {
						problems.push(`${key} 第${index + 1}个选项: ${field} 应为 random 或 ${cfg.STAT_IDS.join("/")}`);
					}
				}
				const curioRef = reward?.curio;
				if (curioRef !== undefined && curioRef !== "random" && !curiosData.getCurio(curioRef)) {
					problems.push(`${key} 第${index + 1}个选项: curio 引用的「${curioRef}」不存在`);
				}
			}
		}
	}
	assert(!problems.length, problems.join("；"));
	return `${ids.length} 个事件、${ids.reduce((sum, id) => sum + eventsData.events[id].choices.length, 0)} 个选项`;
});

check("事件配图：文件存在且已登记进素材清单", () => {
	const manifest = fs.readFileSync(path.join(root, "data", "assets.js"), "utf8");
	const problems = [];
	for (const event of Object.values(eventsData.events)) {
		const relative = event.image.replace(`extension/${cfg.EXTENSION_NAME}/`, "");
		if (!fs.existsSync(path.join(root, relative))) {
			problems.push(`事件「${event.id}」配图不存在：${relative}`);
		}
		if (!manifest.includes(`"${relative}"`)) {
			problems.push(`事件「${event.id}」配图未登记进 data/assets.js：${relative}（node tools/update-manifest.mjs ${relative}）`);
		}
	}
	assert(!problems.length, problems.join("；"));
	return `${Object.keys(eventsData.events).length} 张事件图齐备`;
});

check("奇物配置：结构与字段合法、效果键已知", () => {
	const ids = Object.keys(curiosData.curios);
	assert(ids.length > 0, "奇物池不能为空");
	const problems = [];
	for (const [key, curio] of Object.entries(curiosData.curios)) {
		if (curio.id !== key) {
			problems.push(`${key}: id 与键名不一致（${curio.id}）`);
		}
		if (!curio.name) {
			problems.push(`${key}: 缺少 name`);
		}
		if (!curio.description) {
			problems.push(`${key}: 缺少 description`);
		}
		if (!curio.image || !curio.image.startsWith(`extension/${cfg.EXTENSION_NAME}/assets/curios/`)) {
			problems.push(`${key}: image 应指向 extension/${cfg.EXTENSION_NAME}/assets/curios/ 下的文件`);
		}
		if (!curiosData.CURIOSITY_RARITY[curio.rarity]) {
			problems.push(`${key}: rarity 应为 ${Object.keys(curiosData.CURIOSITY_RARITY).join("/")}`);
		}
		if (curio.priceMultiplier !== undefined && !(Number.isFinite(curio.priceMultiplier) && curio.priceMultiplier >= 0)) {
			problems.push(`${key}: priceMultiplier 应为非负数`);
		}
		// effect 与 qualityEffects 共用同一套键与取值约束
		const checkEffect = (label, effect) => {
			if (!effect || typeof effect !== "object") {
				problems.push(`${label}: 缺少效果对象`);
				return;
			}
			for (const [field, value] of Object.entries(effect)) {
				if (!curioManager.CURIOSITY_EFFECT_KEYS.includes(field)) {
					problems.push(`${label}: 不支持的键 ${field}（可用：${curioManager.CURIOSITY_EFFECT_KEYS.join("/")}）`);
					continue;
				}
				if (!Number.isFinite(value)) {
					problems.push(`${label}.${field} 应为数字（负面奇物用负值）`);
					continue;
				}
				// 0 值等于没效果，唯一例外是配了波动半径的档位（-10%~+10% 这种）
				const spread = effect[`${field}Spread`];
				if (value === 0 && !(Number.isFinite(spread) && spread !== 0)) {
					problems.push(`${label}.${field} 为 0 且没有配套的非零 ${field}Spread，等于没效果`);
				}
			}
		};
		checkEffect(`${key}: effect`, curio.effect);
		const startIndex = curiosData.CURIOSITY_QUALITY_CHAIN.indexOf(curio.rarity);
		for (const [quality, effect] of Object.entries(curio.qualityEffects ?? {})) {
			if (curiosData.CURIOSITY_QUALITY_CHAIN.indexOf(quality) <= startIndex) {
				problems.push(`${key}: qualityEffects.${quality} 必须在初始品质（${curio.rarity}）之后，升级只能向更高档走`);
			}
			checkEffect(`${key}: qualityEffects.${quality}`, effect);
		}
		if (!Object.keys(curio.effect ?? {}).length) {
			problems.push(`${key}: effect 不能为空（界面文案由它自动生成，没有手写兜底字段了）`);
		}
	}
	assert(!problems.length, problems.join("；"));
	// 四档品质与售价倍率锁定：普通 ×2 / 稀有 ×5 / 史诗 ×10 / 负面 ×-5（负价购买反得金币）
	const expectedMultiplier = { common: 2, rare: 5, epic: 10, negative: -5 };
	for (const [rarity, mult] of Object.entries(expectedMultiplier)) {
		assert(curiosData.CURIOSITY_RARITY[rarity], `品质 ${rarity} 应有中文名`);
		assertEqual(curiosData.CURIOSITY_RARITY_PRICE[rarity], mult, `品质 ${rarity} 售价倍率`);
	}
	for (const rarity of Object.keys(curiosData.CURIOSITY_RARITY)) {
		assert(Number.isFinite(curiosData.CURIOSITY_RARITY_PRICE[rarity]) && curiosData.CURIOSITY_RARITY_PRICE[rarity] !== 0, `品质 ${rarity} 缺少售价倍率`);
	}
	const byRarity = Object.keys(expectedMultiplier).map(rarity => `${rarity}:${Object.values(curiosData.curios).filter(curio => curio.rarity === rarity).length}`);
	return `${ids.length} 个奇物（${byRarity.join(" / ")}）`;
});

check("奇物配图：文件存在且已登记进素材清单", () => {
	const manifest = fs.readFileSync(path.join(root, "data", "assets.js"), "utf8");
	const problems = [];
	for (const curio of Object.values(curiosData.curios)) {
		const relative = curio.image.replace(`extension/${cfg.EXTENSION_NAME}/`, "");
		if (!fs.existsSync(path.join(root, relative))) {
			problems.push(`奇物「${curio.id}」配图不存在：${relative}`);
		}
		if (!manifest.includes(`"${relative}"`)) {
			problems.push(`奇物「${curio.id}」配图未登记进 data/assets.js：${relative}（node tools/update-manifest.mjs ${relative}）`);
		}
	}
	assert(!problems.length, problems.join("；"));
	return `${Object.keys(curiosData.curios).length} 张奇物图齐备`;
});

check("奇物机制技：战斗内效果键都有承载时机，机制技随模式注册", () => {
	const info = skillsData.helpers.rogue_curio;
	assert(info, "helpers 里应有 rogue_curio");
	assert(skillsData.helperTranslate.rogue_curio === "奇物", "rogue_curio 应有翻译");
	const triggerNames = [];
	for (const role of Object.keys(info.trigger)) {
		const list = Array.isArray(info.trigger[role]) ? info.trigger[role] : [info.trigger[role]];
		triggerNames.push(...list);
	}
	const need = {
		extraPhase: "phaseBegin",
		extraDraw: "phaseDrawBegin2",
		dyingSave: "dying",
		roundHeal: "roundEnd",
	};
	for (const [key, timing] of Object.entries(need)) {
		const used = Object.values(curiosData.curios).some(curio => curio.effect?.[key]);
		if (used) {
			assert(triggerNames.includes(timing), `效果 ${key} 需要时机 ${timing}，rogue_curio 未声明`);
		}
	}
	return `触发时机：${triggerNames.join(" / ")}`;
});

check("深渊词缀配置：池子项数、技能本体、双键翻译与承载时机都齐备，并随模式一起注册", () => {
	const modeConfig = modeModule.createModeConfig();
	const pool = abyssConfig.AFFIX_POOL;
	assert(pool.length >= 10, `第一版应有 10 个词缀，实际 ${pool.length}`);
	assertEqual(new Set(pool.map(item => item.id)).size, pool.length, "词缀 id 不能重复");
	assertEqual(abyssConfig.ABYSS_START_LEVEL, 31, "深渊化起始层");
	assertEqual(abyssConfig.ABYSS_FULL_LEVEL, 100, "满层（必定拿到 1 个的层数）");
	for (const item of pool) {
		const info = modeConfig.skill[item.id];
		assert(info, `${item.id} 应随模式注册`);
		// 持恒技必须至少有一个能响的时机或一个 mod，否则永远是死技能
		const timings = [];
		for (const role of Object.keys(info.trigger ?? {})) {
			assert(["player", "source", "target", "global"].includes(role), `${item.id} 的 trigger 角色名非法：${role}`);
			const list = Array.isArray(info.trigger[role]) ? info.trigger[role] : [info.trigger[role]];
			timings.push(...list.map(name => `${role}:${name}`));
		}
		assert(timings.length || info.mod, `${item.id} 既没有触发时机也没有 mod`);
		// 翻译双键：本体只认 id（名）+ id_info（描述），写成「名<hr>描述」会被整串当技能名打进日志
		assert(typeof modeConfig.translate[item.id] === "string" && modeConfig.translate[item.id], `${item.id} 缺技能名翻译`);
		assert(typeof modeConfig.translate[`${item.id}_info`] === "string" && modeConfig.translate[`${item.id}_info`], `${item.id} 缺描述翻译`);
		assert(modeConfig.translate[item.id] === abyssAffixes.affixText[item.id].name, `${item.id} 的技能名应与文案表同源`);
		assert(!/<hr>/.test(modeConfig.translate[item.id]), `${item.id} 的翻译名里不该带 <hr>`);
		assert(Number.isFinite(item.weight) && item.weight > 0, `${item.id} 的权重应为正数`);
		assert(!item.tags, `${item.id} 是通用词缀，不该写 tags（写了就只在该标签场合才随机到）`);
	}
	// 标记载体：随模式注册，但绝不进随机池
	assert(modeConfig.skill.abyss_affix?.mark, "abyss_affix 应作为标记技能注册");
	assert(!pool.some(item => item.id === "abyss_affix"), "abyss_affix 不该出现在随机池里");
	// 默认配置下每个词缀都真的能被随机到
	for (const item of pool) {
		assert(abyss.isAbyssAffixId(item.id), `${item.id} 应能通过池子校验`);
	}
	assertEqual(abyss.normalizeAbyssIds(["not_an_affix", null, ""]).length, 0, "非法词缀在读档时被清掉");
	const timings = abyssConfig.AFFIX_POOL
		.map(item => abyssAffixes.affix[item.id].trigger)
		.filter(Boolean);
	assert(timings.some(t => t.global === "roundStart"), "应有词缀挂在轮开始（狂热/永恒）");
	assert(timings.some(t => t.global === "gainEnd"), "应有词缀挂在获得牌后（禁欲）");
	assert(timings.some(t => t.global === "useCardAfter"), "应有词缀在使用牌后（污染）");
	return `${pool.length} 个词缀 / 时机与翻译齐备 / 随模式注册`;
});

console.log(`\nrogue-data: passed=${passed} failed=${failures.length}`);
if (failures.length) {
	console.log(`失败用例：${failures.join("、")}`);
	process.exit(1);
}
