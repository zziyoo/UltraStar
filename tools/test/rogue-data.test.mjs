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
const stagesData = await load("src/rogue/data/challengeStages.js");
const combosData = await load("src/rogue/data/challengeCombos.js");
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

/** 固定的伪随机（与 rogue.test.mjs 的 makeRng 同一条公式），保证抽取断言可复现 */
function makeRng2(seed) {
	let value = seed;
	return () => {
		value = (value * 1103515245 + 12345) % 2147483648;
		return value / 2147483648;
	};
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

check("闯关关卡配置池：结构合法、id 唯一、数量足够不重复抽取", () => {
	const pool = stagesData.challengeStagePool;
	assert(Array.isArray(pool), "challengeStagePool 应为数组");
	assert(pool.length >= cfg.CHALLENGE_STAGE_LEVELS, `配置池至少要 ${cfg.CHALLENGE_STAGE_LEVELS} 项才能保证前 10 关不重复，实际 ${pool.length}`);
	const problems = [];
	const seen = new Set();
	for (const [index, config] of pool.entries()) {
		const label = `#${index + 1}${config?.id ? `「${config.id}」` : ""}`;
		if (!config || typeof config.id !== "string" || !config.id.trim()) {
			problems.push(`${label}: 缺少 id（存档唯一标识，必须是稳定字符串）`);
			continue;
		}
		if (seen.has(config.id)) {
			problems.push(`${label}: id 重复`);
		}
		seen.add(config.id);
		if (!["single", "group"].includes(config.type)) {
			problems.push(`${config.id}: type 应为 single 或 group，实际 ${JSON.stringify(config.type)}`);
		}
		if (!Array.isArray(config.players) || !config.players.length) {
			problems.push(`${config.id}: players 不能为空`);
			continue;
		}
		if (config.type === "single" && config.players.length !== 1) {
			problems.push(`${config.id}: single 的 players 应恰好 1 名，实际 ${config.players.length}`);
		}
		if (config.type === "group" && config.players.length < 2) {
			problems.push(`${config.id}: group 的 players 应 ≥ 2 名，实际 ${config.players.length}（只有 1 名请写 single）`);
		}
		for (const [memberIndex, player] of config.players.entries()) {
			const member = `${config.id} 第${memberIndex + 1}名成员`;
			if (!player || typeof player.character !== "string" || !player.character.trim()) {
				problems.push(`${member}: 缺少 character（真实角色 id，官方包是拼音式 id，不能照抄显示名）`);
			}
			if (player?.stats !== undefined) {
				if (!player.stats || typeof player.stats !== "object" || Array.isArray(player.stats)) {
					problems.push(`${member}: stats 应为对象`);
				} else {
					for (const [key, value] of Object.entries(player.stats)) {
						if (!cfg.STAT_IDS.includes(key)) {
							problems.push(`${member}: stats.${key} 不是已定义的属性（${cfg.STAT_IDS.join("/")}）`);
						} else if (!(Number.isFinite(value) && value >= 0 && value <= 10)) {
							problems.push(`${member}: stats.${key} 应为 0~10 的数字`);
						}
					}
				}
			}
			if (player?.skills !== undefined && (!Array.isArray(player.skills) || player.skills.some(id => typeof id !== "string"))) {
				problems.push(`${member}: skills 应为字符串数组`);
			}
			for (const field of ["maxHp", "hp"]) {
				if (player?.[field] !== undefined && !Number.isFinite(player[field])) {
					problems.push(`${member}: ${field} 应为数字`);
				}
			}
		}
	}
	assert(!problems.length, problems.join("；"));
	for (const config of pool) {
		assert(stagesData.getChallengeStageConfig(config.id) === config, `${config.id}: getChallengeStageConfig 应能按 id 取回`);
	}
	assert(stagesData.getChallengeStageConfig("不存在的配置") === null, "未知 id 应返回 null");
	assert(stagesData.drawChallengeStageIds(() => 0).length === cfg.CHALLENGE_STAGE_LEVELS, "抽取结果应有前 10 关每一关");
	return `${pool.length} 个配置（single ${pool.filter(item => item.type === "single").length} / group ${pool.filter(item => item.type === "group").length}）`;
});

check("闯关关卡配置池：角色 id 在当前游戏环境中存在（找不到的只提醒不拦截）", () => {
	const appRoot = path.resolve(root, "..", "..");
	const characterRoot = path.join(appRoot, "character");
	if (!fs.existsSync(characterRoot)) {
		return "跳过（未找到游戏本体目录，无法核对角色 id）";
	}
	const characters = new Set();
	for (const config of stagesData.challengeStagePool) {
		for (const player of config.players ?? []) {
			if (player?.character) {
				characters.add(player.character);
			}
		}
	}
	// 配置池文件本身含有这些 id 字面量，扫它等于自己证明自己，必须排除
	const selfPath = path.join(root, "src", "rogue", "data", "challengeStages.js");
	// 与 tools/preview 时代的核对脚本同一思路：官方包角色 id 是拼音式（在包文件里以 key 形式出现），
	// 扩展包则常用中文 id。ASCII id 用 \b 词边界匹配（避免命中更长 id 的后缀）；
	// 中文 id 必须带引号整体匹配——「新杀谋司马师」这类长名字里的子串不算角色。
	const patterns = [...characters].map(id => ({
		id,
		regex: /^[A-Za-z0-9_]+$/.test(id) ? new RegExp(`\\b${id}\\b`) : new RegExp(`["']${id}["']`),
	}));
	let scanned = 0;
	const hits = new Map([...characters].map(id => [id, false]));
	const scan = dir => {
		let entries;
		try {
			entries = fs.readdirSync(dir, { withFileTypes: true });
		} catch {
			return;
		}
		for (const entry of entries) {
			const full = path.join(dir, entry.name);
			if (entry.isDirectory()) {
				if (entry.name === "node_modules" || entry.name === ".git") {
					continue;
				}
				scan(full);
			} else if (entry.isFile() && entry.name.endsWith(".js")) {
				if (full === selfPath) {
					continue;
				}
				scanned++;
				let text;
				try {
					text = fs.readFileSync(full, "utf8");
				} catch {
					continue;
				}
				for (const { id, regex } of patterns) {
					if (!hits.get(id) && regex.test(text)) {
						hits.set(id, true);
					}
				}
			}
		}
	};
	scan(characterRoot);
	scan(path.join(appRoot, "extension"));
	const missing = patterns.filter(({ id }) => !hits.get(id)).map(({ id }) => id);
	assert(scanned > 0, "没有扫描到任何 js 文件");
	// 缺失不判失败：角色可能来自尚未安装的扩展包；抽取时会自动跳过这些配置
	return missing.length
		? `扫描 ${scanned} 个文件，${characters.size - missing.length}/${characters.size} 个角色 id 已确认；未找到（抽取时自动跳过）：${missing.join("、")}`
		: `扫描 ${scanned} 个文件，${characters.size} 个角色 id 全部已确认`;
});

check("闯关双人组合池：结构合法、id 唯一、恰好 31 个组合且均为两名成员", () => {
	const pool = combosData.challengeComboPool;
	assert(Array.isArray(pool), "challengeComboPool 应为数组");
	assertEqual(pool.length, 31, "双人组合池应有 31 个组合");
	const problems = [];
	const seen = new Set();
	for (const [index, config] of pool.entries()) {
		const label = `#${index + 1}${config?.id ? `「${config.id}」` : ""}`;
		if (!config || typeof config.id !== "string" || !config.id.trim()) {
			problems.push(`${label}: 缺少 id（存档唯一标识，必须是稳定字符串）`);
			continue;
		}
		if (seen.has(config.id)) {
			problems.push(`${label}: id 重复`);
		}
		seen.add(config.id);
		if (config.type !== "group") {
			problems.push(`${config.id}: type 应为 group，实际 ${JSON.stringify(config.type)}`);
		}
		if (!Array.isArray(config.players) || config.players.length !== 2) {
			problems.push(`${config.id}: 双人组合的 players 应恰好 2 名，实际 ${config.players?.length}`);
			continue;
		}
		for (const [memberIndex, player] of config.players.entries()) {
			const member = `${config.id} 第${memberIndex + 1}名成员`;
			if (!player || typeof player.character !== "string" || !player.character.trim()) {
				problems.push(`${member}: 缺少 character（真实角色 id，官方包是拼音式 id，不能照抄显示名）`);
			}
			for (const field of ["stats", "skills", "maxHp", "hp"]) {
				if (player?.[field] !== undefined) {
					problems.push(`${member}: 组合是固定关卡配置，不应指定 ${field}（属性/技能一律走常规生成）`);
				}
			}
		}
	}
	assert(!problems.length, problems.join("；"));
	for (const config of pool) {
		assert(combosData.getChallengeComboConfig(config.id) === config, `${config.id}: getChallengeComboConfig 应能按 id 取回`);
	}
	assert(combosData.getChallengeComboConfig("不存在的组合") === null, "未知 id 应返回 null");
	return `31 个组合、62 个成员位全部合法`;
});

check("闯关双人组合池：角色 id 在当前游戏环境中存在（找不到的只提醒不拦截）", () => {
	const appRoot = path.resolve(root, "..", "..");
	const characterRoot = path.join(appRoot, "character");
	if (!fs.existsSync(characterRoot)) {
		return "跳过（未找到游戏本体目录，无法核对角色 id）";
	}
	const characters = new Set();
	for (const config of combosData.challengeComboPool) {
		for (const player of config.players ?? []) {
			if (player?.character) {
				characters.add(player.character);
			}
		}
	}
	// 组合池文件本身含有这些 id 字面量，扫它等于自己证明自己，必须排除
	const selfPath = path.join(root, "src", "rogue", "data", "challengeCombos.js");
	const patterns = [...characters].map(id => ({
		id,
		regex: /^[A-Za-z0-9_]+$/.test(id) ? new RegExp(`\\b${id}\\b`) : new RegExp(`["']${id}["']`),
	}));
	let scanned = 0;
	const hits = new Map([...characters].map(id => [id, false]));
	const scan = dir => {
		let entries;
		try {
			entries = fs.readdirSync(dir, { withFileTypes: true });
		} catch {
			return;
		}
		for (const entry of entries) {
			const full = path.join(dir, entry.name);
			if (entry.isDirectory()) {
				if (entry.name === "node_modules" || entry.name === ".git") {
					continue;
				}
				scan(full);
			} else if (entry.isFile() && entry.name.endsWith(".js")) {
				if (full === selfPath) {
					continue;
				}
				scanned++;
				let text;
				try {
					text = fs.readFileSync(full, "utf8");
				} catch {
					continue;
				}
				for (const { id, regex } of patterns) {
					if (!hits.get(id) && regex.test(text)) {
						hits.set(id, true);
					}
				}
			}
		}
	};
	scan(characterRoot);
	scan(path.join(appRoot, "extension"));
	const missing = patterns.filter(({ id }) => !hits.get(id)).map(({ id }) => id);
	assert(scanned > 0, "没有扫描到任何 js 文件");
	// 缺失不判失败：组合对应的角色可能来自尚未安装的包，抽取闸门会自动跳过该组合
	return missing.length
		? `扫描 ${scanned} 个文件，${characters.size - missing.length}/${characters.size} 个角色 id 已确认；未找到（组合抽取时自动跳过）：${missing.join("、")}`
		: `扫描 ${scanned} 个文件，${characters.size} 个角色 id 全部已确认`;
});

check("闯关双人组合池抽取：31 选 10、互不重复、同一 rng 可复现、不足时明确返回不足", () => {
	const poolIds = new Set(combosData.challengeComboPool.map(config => config.id));
	const drawn = combosData.drawChallengeComboIds(makeRng2(42), () => true);
	assertEqual(drawn.length, cfg.CHALLENGE_COMBO_LEVELS, "应恰好抽出 10 个组合（对应第 11~20 关）");
	assertEqual(new Set(drawn).size, drawn.length, "10 个组合互不重复");
	assert(drawn.every(id => poolIds.has(id)), "全部来自组合池，没有 undefined / 未知 id");
	assertEqual(JSON.stringify(combosData.drawChallengeComboIds(makeRng2(42), () => true)), JSON.stringify(drawn), "同一 rng 序列结果一致（可复现）");
	const orders = new Set();
	for (let seed = 1; seed <= 20; seed++) {
		orders.add(JSON.stringify(combosData.drawChallengeComboIds(makeRng2(seed), () => true)));
	}
	assert(orders.size > 1, "不同 rng 应产生不同的抽取顺序（不写死固定顺序）");
	const filtered = combosData.drawChallengeComboIds(makeRng2(7), config => config.id !== drawn[0]);
	assert(filtered.every(id => id !== drawn[0]), "被判定不可用的组合不参与抽取");
	const tail = combosData.challengeComboPool.slice(0, 4).map(config => config.id);
	const short = combosData.drawChallengeComboIds(makeRng2(7), config => tail.includes(config.id));
	assertEqual(short.length, tail.length, "可用不足 10 个时按可用条数返回，绝不循环补齐");
	assertEqual(combosData.drawChallengeComboIds(makeRng2(7), () => false).length, 0, "全部不可用时返回空数组交上层报错");
	return `第 11~20 关顺序：${drawn.join(" → ")}`;
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

const EVENT_REWARD_KEYS = [
	"gold", "exp", "goldByWin", "expByWin", "goldPct", "goldPayout",
	"curio", "skill", "statUp", "statDown",
	// 跳关（虫洞）：构建期把「接下来 N 关」的基础奖励并进 gold/exp，结算层按它推关卡；
	// 它会连同定死的 gold/exp 一起写进存档
	"skipLevels",
	// 只在构建期出现的两个键：掷定给哪一件奇物、掷不到时补几倍基准经验，
	// 落档前一定被展开成 curio(具体 id) + 固定 exp，不会进存档
	"curioRarity", "expIfNoCurioByWin",
];
/** 交互型选项的 kind 白名单，参数判据见 eventManager.normalizeEventAction */
const EVENT_ACTION_KINDS = ["abyssDebt", "skillForge", "rift", "merchant", "curioForge"];

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
				const rarity = reward?.curioRarity;
				if (rarity !== undefined && !curiosData.CURIOSITY_RARITY[rarity]) {
					problems.push(`${key} 第${index + 1}个选项: curioRarity 应为 ${Object.keys(curiosData.CURIOSITY_RARITY).join("/")}`);
				}
				const fallback = reward?.expIfNoCurioByWin;
				if (fallback !== undefined && !(Number.isFinite(fallback) && fallback >= 0)) {
					problems.push(`${key} 第${index + 1}个选项: expIfNoCurioByWin 应为非负数（掷不到奇物时补几倍基准经验）`);
				}
				const skip = reward?.skipLevels;
				if (skip !== undefined && !(Number.isInteger(skip) && skip > 0)) {
					problems.push(`${key} 第${index + 1}个选项: skipLevels 应为正整数（跳过几关）`);
				}
				// 掷奇物的门同时消耗经验是自我矛盾的：落空分支会把负数抬成正数，
				// 玩家点之前看到的「要花多少」与实际结算的方向相反
				if (rarity !== undefined && Number.isFinite(reward?.expByWin) && reward.expByWin < 0) {
					problems.push(`${key} 第${index + 1}个选项: 掷奇物的门不能同时消耗经验`);
				}
			}
			// 交互型选项：kind 必须在白名单里、参数必须齐；写错会让 mode.js 认不出来（退回普通奖励 = 白点一次）
			const action = choice?.action;
			if (action !== undefined) {
				if (!action || typeof action !== "object" || !EVENT_ACTION_KINDS.includes(action.kind)) {
					problems.push(`${key} 第${index + 1}个选项: action.kind 应为 ${EVENT_ACTION_KINDS.join("/")}`);
				} else if (action.kind === "rift" && !Number.isInteger(action.tier)) {
					problems.push(`${key} 第${index + 1}个选项: rift 必须写整数 tier（指向 config.RIFT_TIERS 的第几档）`);
				} else if (action.kind === "rift" && !(action.tier >= 0 && action.tier < cfg.RIFT_TIERS.length)) {
					problems.push(`${key} 第${index + 1}个选项: rift 的 tier ${action.tier} 超出 config.RIFT_TIERS（共 ${cfg.RIFT_TIERS.length} 档）`);
				} else if (action.kind === "skillForge" && !["exp", "skill"].includes(action.grant)) {
					problems.push(`${key} 第${index + 1}个选项: skillForge 的 grant 应为 exp 或 skill`);
				} else if (action.kind === "abyssDebt" && action.perEnemy !== undefined) {
					problems.push(`${key} 第${index + 1}个选项: abyssDebt 的个数由 config.SPRING_DEBT_AFFIXES 在构建期注入，别在数据里抄一份`);
				}
			}
			if (choice?.blockedText !== undefined && !(typeof choice.blockedText === "string" && choice.blockedText.trim())) {
				problems.push(`${key} 第${index + 1}个选项: 写了 blockedText 就必须是非空句子（它是「此刻没有对象可作用」时对玩家说的话）`);
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
		turnHeal: "phaseEnd",
		// 狂战徽章靠「我造成的伤害」这个时机认本回合的第一下
		firstDamageBonus: "damage",
		// 反击护符三档都是「受到伤害后」上一层 buff
		hurtDamageNext: "damageEnd",
		hurtDamageRound: "damageEnd",
		hurtDamageGame: "damageEnd",
		// 血怒核心的「无法被响应」走 ai 标签（norespond + playernowuxie），
		// 但它附带的「此牌伤害 +1」仍要有加伤时机，所以这里盯 damageBegin1
		unrespondable: "damageBegin1",
		// 回响之铃在濒死时机回收、破碎王冠靠「来源是死者的 die」认击杀
		dyingRecallChance: "dying",
		killGainMaxHp: "die",
		killHeal: "die",
	};
	for (const [key, timing] of Object.entries(need)) {
		const used = Object.values(curiosData.curios).some(curio => curio.effect?.[key]);
		if (used) {
			assert(triggerNames.includes(timing), `效果 ${key} 需要时机 ${timing}，rogue_curio 未声明`);
		}
	}
	// 配套键（只配在别的键的句子里、自己不出文案行）必须登记进「战斗内」表：
	// 战斗面板按 CURIOSITY_BATTLE_KEYS 把效果切成两组，漏在栏外会被整块切掉——
	// 血怒核心就踩过这条，体力条件与「此牌伤害 +1」整段消失。新增带配套键的奇物时回来补一行
	const companionKeys = ["dyingRecoverToRatio", "unrespondableLowHp", "unrespondableCardDamage",
		"killHeal", "killHealToMax", "killDrawToMaxHp", "killDrawMaxHp"];
	for (const key of companionKeys) {
		assert(curioManager.CURIOSITY_BATTLE_KEYS.includes(key), `配套键 ${key} 漏在 CURIOSITY_BATTLE_KEYS 栏外`);
	}
	assertEqual(curioManager.CURIOSITY_STORAGE_KEYS, curioManager.CURIOSITY_BATTLE_KEYS, "storage 写入表应与战斗内表同一条");
	// 血怒核心「无法被响应」必须挂两个标签：本体问「能不能响应」和问「能不能无懈」是两条分开的路，
	// 只挂一个会出现「杀必中但锦囊照样被无懈」。标签为真时本体才调 skillTagFilter，缺了就变成无条件生效。
	const usesUnrespondable = Object.values(curiosData.curios).some(curio => (curio.effect?.unrespondable || 0) > 0
		|| Object.values(curio.qualityEffects ?? {}).some(effect => (effect?.unrespondable || 0) > 0));
	if (usesUnrespondable) {
		assert(info.ai?.norespond === true, "rogue_curio 应声明 ai.norespond（使用的牌无法被响应）");
		assert(info.ai?.playernowuxie === true, "rogue_curio 应声明 ai.playernowuxie（锦囊不能被无懈可击）");
		assert(typeof info.ai?.skillTagFilter === "function", "ai 标签必须配 skillTagFilter，否则体力条件那一半永远不生效");
	}
	return `触发时机：${triggerNames.join(" / ")}`;
});

check("深渊词缀配置：池子项数、技能本体、双键翻译与承载时机都齐备，并随模式一起注册", () => {
	const modeConfig = modeModule.createModeConfig();
	const pool = abyssConfig.AFFIX_POOL;
	assert(pool.length >= 9, `词缀池至少要 9 个（深渊·禁欲已删除），实际 ${pool.length}`);
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
	// 词缀自带的载体（虚无的封印与解除宿主、污染的封牌）也必须随模式注册，否则本体按 id 现查时查不到
	assert(typeof modeConfig.skill.abyss_xuwu_blocker?.skillBlocker === "function", "abyss_xuwu_blocker 应带 skillBlocker");
	assert(typeof modeConfig.skill.abyss_xuwu_release?.onremove === "function", "abyss_xuwu_release 应带 onremove");
	assert(!!modeConfig.skill.abyss_wuran_lock?.mod?.cardEnabled2, "abyss_wuran_lock 应带 cardEnabled2 mod");
	for (const id of ["abyss_xuwu_blocker", "abyss_xuwu_release", "abyss_wuran_lock"]) {
		assert(!pool.some(item => item.id === id), `${id} 是载体，不该出现在随机池里`);
	}
	// 默认配置下每个词缀都真的能被随机到
	for (const item of pool) {
		assert(abyss.isAbyssAffixId(item.id), `${item.id} 应能通过池子校验`);
	}
	assertEqual(abyss.normalizeAbyssIds(["not_an_affix", null, ""]).length, 0, "非法词缀在读档时被清掉");
	const timings = abyssConfig.AFFIX_POOL
		.map(item => abyssAffixes.affix[item.id].trigger)
		.filter(Boolean);
	assert(timings.some(t => t.global === "roundStart"), "应有词缀挂在轮开始（狂热）");
	assert(timings.some(t => t.global === "phaseBegin"), "应有词缀挂在回合开始（永恒）");
	assert(timings.some(t => t.player === "damageEnd"), "应有词缀挂在受到伤害后（虚无/镜像/复仇）");
	assert(timings.some(t => t.global === "useCardAfter"), "应有词缀在使用牌后（污染）");
	return `${pool.length} 个词缀 / 时机与翻译齐备 / 随模式注册`;
});

console.log(`\nrogue-data: passed=${passed} failed=${failures.length}`);
if (failures.length) {
	console.log(`失败用例：${failures.join("、")}`);
	process.exit(1);
}
