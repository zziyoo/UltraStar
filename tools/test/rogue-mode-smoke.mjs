﻿﻿﻿﻿﻿﻿﻿// 奥特之星·肉鸽：模式流程冒烟夹具。node tools/test/rogue-mode-smoke.mjs
//
// 用 loader hooks 把各模块顶部的 noname.js 换成桩，从而在 Node 里真实执行
// registerRogueMode / start / 页面路由 / 商店 / 结算，并记录本体 API 的调用顺序。
// 覆盖「不进游戏能验」的部分：进游戏只看视觉、手感与真机 AI。

import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { registerHooks } from "node:module";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");
const stubPath = pathToFileURL(path.join(here, "rogue-noname-stub.mjs")).href;

registerHooks({
	resolve(specifier, context, next) {
		if (specifier.endsWith("noname.js")) {
			return { url: stubPath, shortCircuit: true };
		}
		return next(specifier, context);
	},
});

const stub = await import(stubPath);
const { lib, game, ui, get } = stub;
const log = stub.__log;

const load = rel => import(pathToFileURL(path.join(root, rel)).href);
const cfg = await load("src/rogue/config.js");
const eventsData = await load("src/rogue/data/events.js");
const curiosData = await load("src/rogue/data/curios.js");
const eventManager = await load("src/rogue/eventManager.js");
const stagesData = await load("src/rogue/data/challengeStages.js");
const rewardsData = await load("src/rogue/data/rewards.js");
const combosData = await load("src/rogue/data/challengeCombos.js");
const abyssCfg = await load("src/rogue/endless/abyssConfig.js");
const modeModule = await load("src/rogue/mode.js");
const battleModule = await load("src/rogue/battle.js");
const enemyModule = await load("src/rogue/enemy.js");
const stateModule = await load("src/rogue/state.js");
const statsData = await load("src/rogue/data/stats.js");
const common = await load("src/rogue/ui/common.js");
const bgmSystem = await load("src/systems/bgm.js");
const rogueBgm = await load("src/rogue/bgm.js");
const packSkills = await load("src/rogue/data/skills.js");
const sacrificeModule = await load("src/rogue/skillSacrifice.js");

/**
 * 当前最上层页面：优先取本体对话框栈顶（提示框/确认框都走这条路），
 * 栈为空时才是自建浮层页面（存档页不在本体对话框栈里）。
 */
const screenRoot = () => common.currentScreenNode() ?? (ui.dialogs.length ? ui.dialogs[ui.dialogs.length - 1] : ui.lastDialog);

let passed = 0;
const failures = [];

const flush = () => new Promise(resolve => setImmediate(resolve));

async function check(name, fn) {
	try {
		const detail = await fn();
		passed++;
		console.log(`  ok   ${name}${detail ? ` — ${detail}` : ""}`);
	} catch (error) {
		failures.push(name);
		console.log(`  FAIL ${name} — ${error?.stack ?? error}`);
	}
}
function assert(cond, msg) {
	if (!cond) {
		throw new Error(msg ?? "断言失败");
	}
}
function assertEqual(actual, expected, msg) {
	if (actual !== expected) {
		throw new Error(`${msg ?? "值不符"}：期望 ${expected}，实际 ${actual}`);
	}
}

/** 节点文本：innerHTML 或 textContent 二选一（两者不会同时有内容） */
const textOf = node => node.__html || node.__text || "";

function dump(node, out = []) {
	if (!node) {
		return out.join("|");
	}
	out.push(textOf(node));
	for (const child of node.children ?? []) {
		dump(child, out);
	}
	return out.join("|");
}

function findNode(textValue, node, seen = []) {
	if (!node || seen.includes(node)) {
		return null;
	}
	seen.push(node);
	if (textOf(node).includes(textValue)) {
		return node;
	}
	for (const child of node.children ?? []) {
		const found = findNode(textValue, child, seen);
		if (found) {
			return found;
		}
	}
	return null;
}

const screenText = () => dump(screenRoot());

/** 收集当前页面里满足条件的节点，用来断言控件结构而不只是文字 */
function collect(pred, node = screenRoot(), out = []) {
	if (!node || out.includes(node)) {
		return out;
	}
	if (pred(node)) {
		out.push(node);
	}
	for (const child of node.children ?? []) {
		collect(pred, child, out);
	}
	return out;
}

/** 点某个文字对应的控件（走本体 listen() 注册的回调） */
function click(textValue, from) {
	const scope = from ?? screenRoot();
	assert(scope, "当前没有可点击的页面");
	let node = findNode(textValue, scope);
	assert(node, `找不到「${textValue}」，页面内容：${dump(scope)}`);
	// 真实 DOM 里点击会冒泡到父节点，这里同样向上找到第一个绑了监听的节点
	while (node && !(node.__listeners ?? []).length) {
		node = node.parentNode;
	}
	assert(node, `「${textValue}」及其父节点都没有绑定点击，页面内容：${dump(scope).slice(0, 600)}`);
	node.__listeners[0]();
	return node;
}

/** 直接点某个节点（浮层里的按钮走 bindTap，桩同样记在 __listeners 里） */
function clickNode(node) {
	assert(node, "找不到要点击的节点");
	const handler = (node.__listeners ?? [])[0];
	assert(handler, "该节点没有绑定点击");
	handler();
	return node;
}

/** 按类名收集当前页面里的节点 */
const nodesWithClass = className => collect(node => node.classList?.contains?.(className));

/** 全新世界：连“数据库”（lib.storage）一起清空 */
function freshWorld() {
	stub.resetState();
	lib.storage = {};
	log.length = 0;
}

/** 模拟一次页面加载：重放 loadMode 的混入，再跑模式 start；保留“数据库” */
function session() {
	// 真机上刷新页面会重建模块状态，这里手动复位，避免残留上一次的浮层与弹窗
	try {
		common.closeScreen();
	} catch {
		/* 首次尚无页面 */
	}
	stub.resetState();
	// 真实游戏里商店候选 = 分包技能 + 全体武将技能，桩里必须把分包技能注册进 lib.skill/lib.translate，
	// 否则 getShopPool() 恒为空，商店相关用例（候选数/排除规则/刷新）全都验不到东西
	Object.assign(lib.skill, packSkills.skill);
	Object.assign(lib.translate, packSkills.translate);
	// 冒烟用的假技能：真机上由本体/扩展提供。id 与 id_info 两个翻译键都要给——
	// 读档清洗的技能合法性闸门按本体的 skillDisabled 口径判，缺 _info 会被当成「已失效技能」清掉
	for (const id of [
		"rogue_extra",
		"own_one", "own_two", "own_three", "own_four", "own_five",
		"own_long", "own_poptip", "owned_skill",
	]) {
		lib.skill[id] ??= { forced: true, trigger: { player: "phaseDrawBegin2" } };
		lib.translate[id] ??= id;
		lib.translate[`${id}_info`] ??= "冒烟测试用技能。";
	}
	// 部分用例需要一个「池子之外」的测试技能：带触发时机，用来验证 hookmap 登记
	lib.skill.rogue_extra = { forced: true, trigger: { player: "phaseDrawBegin2" } };
	lib.translate.rogue_extra = "额外<hr>测试用技能。";
	const config = modeModule.createModeConfig();
	for (const [key, value] of Object.entries(config.game)) {
		game[key] = value;
	}
	for (const [key, value] of Object.entries(config.get ?? {})) {
		get[key] = value;
	}
	for (const [key, value] of Object.entries(config.element)) {
		lib.element[key] ??= {};
		for (const [name, fn] of Object.entries(value)) {
			lib.element[key][name] = fn;
		}
	}
	Object.assign(lib.skill, config.skill);
	Object.assign(lib.translate, config.translate);
	if (typeof config.game.onover === "function") {
		lib.onover.push(config.game.onover);
		delete game.onover;
	}
	config.start();
	return config;
}

/** 直接往“数据库”里写一份存档，再重载页面进入 */
function putRun(index, patch, extra) {
	const base = extra ?? stateModule.createRun(patch.mode ?? "challenge", patch.characterId ?? "迪迦", 1);
	const run = stateModule.normalizeRun({ ...base, ...patch });
	const slots = lib.storage.rogueSlots ?? [];
	slots[index] = run;
	lib.storage.rogueSlots = slots;
	lib.storage.rogueActive = index;
	return run;
}

/**
 * 写一份「v11 形状」的旧档：带着 v12 已经删掉的整局 bossRun 字段。
 * 必须绕过 putRun——它走 normalizeRun 清洗，会把旧字段直接丢掉，就模拟不出「旧档刚读进来」那一刻。
 */
function putLegacyV11(index, patch) {
	const raw = { ...stateModule.createRun("endless", "迪迦", 1), version: 11, bossRun: true, ...patch };
	const slots = lib.storage.rogueSlots ?? [];
	slots[index] = raw;
	lib.storage.rogueSlots = slots;
	lib.storage.rogueActive = index;
	return raw;
}

/**
 * 把一份**原始**存档（不经 normalizeRun）写进槽位：模拟「旧档刚读进来那一刻」。
 * 与 putRun 的区别：putRun 先清洗再落盘，验不出迁移本身；这里写什么读什么。
 */
function putLegacyRaw(index, raw) {
	const slots = lib.storage.rogueSlots ?? [];
	slots[index] = raw;
	lib.storage.rogueSlots = slots;
	lib.storage.rogueActive = index;
	return raw;
}

/**
 * 10-06 实机旧档的原始形状（无尽 45 关，存档 v9——v10~v13 的字段一个都还没有）。
 * 值取自该机器游戏 UserData/IndexedDB 里解出的真实数据：等级/资源/奇物/品质/空货架都对得上，
 * 只把三个技能 id 换成夹具里已注册的（技能身份与 Boss/商店判定无关；真档里的本体技能在桩里不存在，
 * 挂技能时只会多打印一条 warn）。这份形状是「旧存档长期不触发 Boss 与奇物商店」报告的主角，
 * 三个用例共用它：迁移后逐场判定、残留锁清零、以及商人成交后的判定。
 */
function realV9Run(patch = {}) {
	return {
		version: 9,
		mode: "endless",
		characterId: "艾斯",
		level: 45,
		totalLevels: 0,
		challengeStages: [],
		currency: { gold: 14785, exp: 1402 },
		skills: ["own_one", "own_two", "own_three"],
		stats: { defense: 10, draw: 10, attack: 10 },
		currentBattle: null,
		shopOffers: [{ id: "rogue_extra", price: 385, sold: false, carried: false }],
		shopRefreshesRemaining: 0,
		pendingEvent: null,
		collection: { events: ["lost_robot"], curios: ["loop_button"] },
		curios: ["loop_button", "energy_core", "cursed_coin", "broken_watch", "lucky_stone", "echo_bell"],
		curioQuality: { cursed_coin: "epic", loop_button: "epic" },
		curioOffers: [],
		curioOfferQueue: [],
		skillShopLocked: false,
		curioShopLocked: false,
		abyssDebt: 0,
		cleared: false,
		createdAt: 1791131233227,
		updatedAt: 1791281575494,
		...patch,
	};
}

/**
 * 桩的 session() 会重建 lib.character（只留固定角色表），真实旧档的主控角色「艾斯」会被一起擦掉；
 * 不重新登记，开战时 resolveBattle 会判「角色当前不可用」并静默不开局。每次 session() 之后都要补一句。
 */
function ensureAceInRoster() {
	lib.character["艾斯"] ??= { hp: 4, maxHp: 4, skills: [] };
}

async function newRunByUi(modeLabel) {
	// 建局只创建存档，不再掷 Boss 骰（v12 起判定挪到每场新战斗，见 clickNormalBattle / clickBossBattle）。
	// 这里仍把随机钉在 0.9：闯关建局要一次性抽定前 10 关的敌方配置，钉住后各用例的关卡配置可复现。
	const originalRandom = Math.random;
	Math.random = () => 0.9;
	try {
		click("空存档");
		click(modeLabel);
		const chooser = screenRoot();
		assert(chooser.classList.contains("character"), "选将页应使用本体 characterDialog");
		assert(chooser.buttons.some(button => button.link === "迪迦"), "候选里应有迪迦");
		assert(!chooser.buttons.some(button => button.link === "死龙"), "隐藏 Boss 不该出现在候选里");
		click("迪迦");
		await flush();
	} finally {
		Math.random = originalRandom;
	}
}

/**
 * 点「创建一场新战斗」的按钮，并让**这一场判为普通战斗**。
 *
 * v12 起 Boss 判定改成逐场独立：无尽的 `flow/battle.js` startBattle 在创建新战斗时消费的第一掷
 * `Math.random()` 就是这一场的判定（BOSS_RUN_RATE，当前 0.0625）。冒烟用例绝大多数要的是普通链路，
 * 若放任真随机，整套流程会变成「每场 6.25% 概率突然换成 Boss 关」的抖动测试。
 * 这里只把「第一掷」钉成 0.999999（≥ 判定线 → 不抽中），其余各掷原样交回当前钉好的随机
 * （没钉就是真随机），所以角色/词缀/事件的随机口径一概不受影响。
 * Boss 链路由专门的用例覆盖：它们自己把 Math.random 钉到 < BOSS_RUN_RATE。
 *
 * 为什么不是干净的 1：闯关不再判 Boss（Boss 战只属于无尽），这一掷于是落到后面的敌方随机上，
 * 而 `allocateEnemyStats` 按 `Math.floor(rng() * (high - low + 1))` 取值——本体的 Math.random
 * 恒小于 1，钉成 1 会越界多分一个属性点，把「第 1 关 1 点预算」验成 2 点。0.999999 同样掷不中，
 * 又留在 Math.random 的合法值域内。
 */
function clickNormalBattle(label = "开始下一关") {
	const prev = Math.random;
	let first = true;
	Math.random = () => {
		if (first) {
			first = false;
			return 0.999999;
		}
		return prev();
	};
	try {
		click(label);
	} finally {
		// startBattle 对随机的一切消费都在这一趟同步调用里完成（beginBattle 不再掷骰），可以立刻还原
		Math.random = prev;
	}
}

/**
 * 点「创建一场新战斗」的按钮，并让**这一场抽中 Boss**（第一掷钉成 0 < BOSS_RUN_RATE）。
 * 其余各掷交回当前钉好的随机——与 clickNormalBattle 对称，只用来把判定本身钉死。
 */
function clickBossBattle(label = "开始下一关") {
	const prev = Math.random;
	let first = true;
	Math.random = () => {
		if (first) {
			first = false;
			return 0;
		}
		return prev();
	};
	try {
		click(label);
	} finally {
		Math.random = prev;
	}
}

/**
 * 把 Boss 惩罚页走完一遍（v14 起技能惩罚在胜利结算时**自动**完成——失去全部装备技能，
 * 不再有技能挑选栏；这一页只剩「从奇物里自己挑一件失去」，且胜利后自动跳到这一页）。
 * 点一张奇物卡 → 确定 → 页面走出口（提示走浮层内的自建弹层，`click("确定")`）。
 * 夹具里几处 Boss 场的手上都有 `energy_core`，所以奇物标签默认写死它、可按需换。
 */
function payBossPenalty(curioLabel = "能量核心") {
	click(curioLabel);
	click("确定");
}

console.log("奥特之星·肉鸽 模式流程冒烟\n");

await check("注册：game.addMode 收到模式 id、封面与显示名，且防重复注册", () => {
	freshWorld();
	const ok = modeModule.registerRogueMode();
	assert(ok, "首次注册应返回 true");
	const entry = log.find(item => item.type === "addMode");
	assert(entry, "应调用 game.addMode");
	assertEqual(entry.name, cfg.MODE_ID, "模式 id");
	assertEqual(entry.translate, cfg.MODE_TRANSLATE, "显示名");
	assertEqual(entry.extension, cfg.EXTENSION_NAME, "扩展名");
	assertEqual(entry.splash, cfg.MODE_SPLASH, "封面图");
	assert(lib.config.all.mode.includes(cfg.MODE_ID), "模式应进入 all.mode");
	assert(lib.mode[cfg.MODE_ID].fromextension === true, "应标记为扩展模式");
	assert(typeof lib.init[`setMode_${cfg.MODE_ID}`] === "function", "应挂上懒加载入口");
	assert(!modeModule.registerRogueMode(), "重复注册应被拦下");
	assertEqual(lib.config.all.mode.filter(x => x === cfg.MODE_ID).length, 1, "all.mode 不重复");
	return entry.name;
});

await check("模式配置：机制技能挂在模式上，肉鸽原创技能已不再注册", () => {
	freshWorld();
	const config = modeModule.createModeConfig();
	assertEqual(config.name, cfg.MODE_ID);
	assertEqual(config.splash, cfg.MODE_SPLASH);
	assert(config.skill.rogue_stat, "rogue_stat 应在模式 skill 表里");
	assert(config.translate.rogue_stat, "rogue_stat 应有翻译");
	// 模式 content 会被本体 mixinLibrary 无条件并进 lib.skill；分包技能已随扩展包注册，
	// 若再并入模式表，本体装载扩展时会逐个打 "duplicated skill in extension 奥特之星" 并跳过
	const stray = Object.keys(config.skill).filter(id => !/^(rogue_|abyss_)/.test(id));
	assertEqual(stray.length, 0, `模式 skill 表只应有机制技能/词缀，不该有分包技能：${stray.slice(0, 5).join("、")}`);
	const strayTrans = Object.keys(config.translate).filter(id => !/^(rogue_|abyss_)/.test(id.replace(/_info$|_append$|_ab$/, "")));
	assertEqual(strayTrans.length, 0, `模式 translate 表只应有机制技能/词缀的翻译：${strayTrans.slice(0, 5).join("、")}`);
	// 肉鸽专属原创技能已下架：定义与翻译都不再随模式注册
	for (const id of ["rogue_xushui", "rogue_jiema", "rogue_guiyuan"]) {
		assertEqual(config.skill[id], undefined, `${id} 不应再注册`);
		assertEqual(config.translate[id], undefined, `${id} 不应再有翻译`);
	}
	for (const old of ["rogue_stat_draw", "rogue_stat_hand", "rogue_stat_sha", "rogue_stat_usable"]) {
		assert(!config.skill[old], `${old} 应已合并进 rogue_stat`);
	}
	assertEqual(lib.character["死龙"].isHiddenBoss, true, "不应改动角色库");
	assert(typeof config.element.player.dieAfter === "function", "应提供 element.player.dieAfter");
	assert(typeof config.game.checkResult === "function", "应提供 game.checkResult");
	assert(typeof config.game.onover === "function", "应提供 game.onover（本体自动推进 lib.onover）");
	return `${Object.keys(config.skill).length} 项机制技能/词缀（分包技能由扩展包注册）`;
});

await check("启动：空存档直接进入六槽页", () => {
	freshWorld();
	session();
	assert(screenRoot(), "应打开一个页面");
	const text = screenText();
	assertEqual((text.match(/空存档/g) ?? []).length, cfg.SLOT_COUNT, `应渲染 ${cfg.SLOT_COUNT} 个空存档：${text}`);
	for (let i = 0; i < cfg.SLOT_COUNT; i++) {
		assert(text.includes(`存档${i + 1}`), `缺少存档${i + 1} 的卡片：${text}`);
	}
	assert(text.includes("新建"), "空存档应提供新建");
	assert(text.includes("存档记录"), "应有仿造梦西游的标题栏");
	// 滚动层（浮层）与居中层（stage）分开，居中是 CSS 的事，不再用 JS 算像素边距
	const overlay = common.currentScreenNode();
	const stage = nodesWithClass("wm-rogue-stage")[0];
	assert(stage, "浮层里应有居中层");
	assertEqual(stage.parentNode, overlay, "居中层挂在浮层下");
	assertEqual(nodesWithClass("wm-rogue-panel")[0]?.parentNode, stage, "面板挂在居中层里");
	return `槽位 ${cfg.SLOT_COUNT}`;
});

await check("新建：选玩法→选角色→立即保存六槽", async () => {
	freshWorld();
	session();
	await newRunByUi("闯关模式");
	const saved = lib.storage.rogueSlots;
	assert(Array.isArray(saved), "rogueSlots 应为数组");
	assertEqual(saved.length, cfg.SLOT_COUNT, "长度固定为 6");
	const run = saved[0];
	assertEqual(run.mode, "challenge");
	assertEqual(run.characterId, "迪迦");
	assertEqual(run.level, 1);
	assertEqual(run.version, cfg.RUN_VERSION);
	assertEqual(run.currentBattle, null);
	assertEqual(run.shopRefreshesRemaining, cfg.SKILL_REFRESH_PER_LEVEL, "新档应拿到满额免费刷新次数");
	assertEqual(lib.storage.rogueActive, 0, "应记住当前槽位");
	return `槽1 ${run.characterId}`;
});

await check("选将页：说明与返回排在内容最前", () => {
	freshWorld();
	session();
	click("空存档");
	click("无尽模式");
	const dialog = common.currentScreenNode();
	assert(textOf(dialog.content.children[0]).includes("点击武将即完成选择"), `说明行应在最前面：${textOf(dialog.content.children[0])}`);
	assertEqual(textOf(dialog.content.children[1]), "返回", "返回紧随其后");
	click("迪迦");
	return "说明与返回置顶";
});

await check("选将页：每页张数放开到配置的 24 张", () => {
	freshWorld();
	session();
	// 这台机器上本体配置 showMax_character_number = 10：一页只给 10 张，多出来的只是被加了 .nodisplay
	lib.config.showMax_character_number = 10;
	for (let i = 0; i < 59; i++) {
		lib.character[`测试将${i}`] = [4, "custom", 0, [], 1];
	}
	click("空存档");
	click("闯关模式");
	const dialog = common.currentScreenNode();
	const expectedTotal = battleModule.getRoster().length;
	assertEqual(dialog.buttons.length, expectedTotal, `候选总数应与可用名单一致（桩基础角色 + 关卡配置池角色 + 59 个测试角色 = ${expectedTotal}）`);
	assertEqual(dialog.paginationMaxCount.get("character"), cfg.CHARACTER_PICKER_PAGE_SIZE, "每页张数应放开");
	assertEqual(dialog.buttons.filter(button => !button.classList.contains("nodisplay")).length, cfg.CHARACTER_PICKER_PAGE_SIZE, "第一页显示 24 张");
	const pager = dialog.paginationMap.get(dialog.content.querySelector(".buttons"));
	assertEqual(pager.state.totalPageCount, Math.ceil(expectedTotal / cfg.CHARACTER_PICKER_PAGE_SIZE), `页数应重算：${pager.state.totalPageCount}`);
	assertEqual(pager.state.pageNumber, 1, "回到第一页");
	lib.config.showMax_character_number = 0;
	click("迪迦");
	return "每页 24 张 / 3 页";
});

await check("角色候选：真实存在、隐藏 Boss 不进候选", () => {
	freshWorld();
	const roster = battleModule.getRoster();
	assert(roster.includes("迪迦"), "迪迦应可选");
	assert(!roster.includes("死龙"), "隐藏 Boss 不应可选");
	return `候选 ${roster.length}`;
});

await check("Hub：角色/关卡/货币/属性与两行动作按钮（含技能管理入口）", async () => {
	freshWorld();
	session();
	await newRunByUi("闯关模式");
	const text = screenText();
	for (const token of [
		"迪迦",
		"奥特肉鸽",
		`第 1 / ${cfg.CHALLENGE_TOTAL_LEVELS} 关`,
		"闯关模式",
		"金币",
		"经验",
		"防御",
		"Lv.0/10",
		"暂无加成",
		"开始下一关",
		"商店",
		"技能",
		"图鉴",
		"返回存档",
		"退出肉鸽模式",
	]) {
		assert(text.includes(token), `Hub 应显示「${token}」，实际：${text}`);
	}
	// 营地也是自建浮层：技能管理与商店入口并列在一行，标题栏里不放按钮
	const overlay = common.currentScreenNode();
	assertEqual(overlay?.id, "wm-rogue-overlay", "营地走自建浮层");
	assertEqual(nodesWithClass("wm-rogue-back").length, 0, "营地标题栏不放按钮");
	assert(screenText().includes("当前成长"), "应有当前成长分区");
	// 角色名挪到正文里、紧跟「当前成长」标题
	const body = nodesWithClass("wm-rogue-hub-body")[0];
	const who = nodesWithClass("wm-rogue-hub-who")[0];
	assert(who, "应显示角色名");
	assertEqual(who.parentNode, body, "角色名应在正文里而不是标题栏");
	assertEqual(
		body.children.indexOf(who),
		body.children.findIndex(node => node.classList?.contains?.("wm-rogue-hub-section-title")) + 1,
		"角色名应紧跟「当前成长」标题"
	);
	// 动作区分两行：第一行是「继续玩」的四个入口，第二行才是离开当前局
	const rows = nodesWithClass("wm-rogue-hub-row");
	assertEqual(rows.length, 2, "动作区应恰好分两行");
	const labelsOf = row => row.children.map(node => textOf(node));
	assertEqual(JSON.stringify(labelsOf(rows[0])), JSON.stringify(["开始下一关", "商店", "技能", "图鉴"]), `第一行：${labelsOf(rows[0])}`);
	assertEqual(JSON.stringify(labelsOf(rows[1])), JSON.stringify(["返回存档", "退出肉鸽模式"]), `第二行：${labelsOf(rows[1])}`);
	assert(nodesWithClass("wm-rogue-hub-index")[0], "图鉴按钮用自己的配色类");
	assert(nodesWithClass("wm-rogue-hub-skills")[0], "技能管理按钮用自己的配色类");
	// 闯关没有奇物来源（无事件、无奇物商店），营地不画奇物入口——空页上的提示会变成假信息
	assertEqual(nodesWithClass("wm-rogue-hub-curios").length, 0, "闯关营地不该有奇物按钮");
	// 营地的技能按钮直达技能页（闯关=只读技能栏），返回键回营地
	clickNode(nodesWithClass("wm-rogue-hub-skills")[0]);
	assert(screenText().includes("当前没有已购买技能"), `营地技能入口直达只读技能栏：${screenText().slice(0, 160)}`);
	click("返回");
	assert(screenText().includes("开始下一关"), "技能页返回应回到营地");
	return "营地信息齐备 + 动作分两行（技能入口；奇物仅无尽）";
});

await check("营地奇物入口：与技能并列、直达管理页、升级落盘、返回仍在营地、重载后品质保持", async () => {
	freshWorld();
	// 第 31 关：升级价 = 10 × floor(20×√31) = 1110，给够一次的钱
	putRun(0, {
		mode: "endless",
		level: 31,
		currency: { gold: 500, exp: 5000 },
		curios: ["energy_core"],
	});
	session();
	// 无尽营地第一行是五枚按钮：奇物紧挨技能（窄屏靠这一行的 flex-wrap 折行，不新增容器）
	const mainRow = nodesWithClass("wm-rogue-hub-row")[0];
	const rowLabels = mainRow.children.map(node => textOf(node));
	assertEqual(JSON.stringify(rowLabels), JSON.stringify(["开始下一关", "商店", "技能", "奇物", "图鉴"]), `无尽第一行：${rowLabels}`);
	const curioBtn = nodesWithClass("wm-rogue-hub-curios")[0];
	assert(curioBtn, "奇物按钮用自己的配色类");
	assertEqual(curioBtn.parentNode, nodesWithClass("wm-rogue-hub-skills")[0].parentNode, "奇物与技能在同一行");
	// 只读进出一趟不该写存档
	const before = JSON.stringify(lib.storage.rogueSlots);
	clickNode(nodesWithClass("wm-rogue-hub-curios")[0]);
	assert(screenText().includes("奇物（1）"), `营地奇物入口直达管理页：${screenText().slice(0, 160)}`);
	const card = nodesWithClass("wm-rogue-curio-manage")[0];
	assert(card, "管理页应渲染奇物卡");
	// 卡面按品质与效果表自动生成：当前品质 + 当前效果 + 下一品质预览 + 按当前关卡现算的升级价
	const cardText = dump(card);
	for (const token of ["能量核心", "普通", "摸牌阶段额外摸 1 张牌", "下一品质：稀有", "摸牌阶段额外摸 2 张牌", "升级 1110 经验"]) {
		assert(cardText.includes(token), `卡面应显示「${token}」：${cardText}`);
	}
	click("返回");
	assert(screenText().includes("开始下一关"), "奇物页返回应回到营地");
	assert(!screenText().includes("技能商店"), "返回不该落到商店");
	assertEqual(JSON.stringify(lib.storage.rogueSlots), before, "只看不点不写存档");
	// 再进一次点升级：经验扣掉、品质升一档、当场落盘
	clickNode(nodesWithClass("wm-rogue-hub-curios")[0]);
	clickNode(nodesWithClass("wm-rogue-curio-up")[0]);
	await flush();
	let saved = lib.storage.rogueSlots[0];
	assertEqual(saved.curioQuality.energy_core, "rare", "升级落盘升到稀有");
	assertEqual(saved.currency.exp, 5000 - 1110, "扣掉 1110 经验");
	assert(dump(nodesWithClass("wm-rogue-curio-manage")[0]).includes("稀有"), "原位重绘成稀有档");
	assert(screenText().includes("奇物（1）"), "升级后仍在奇物页（没有跳走）");
	// 返回营地 → 重载（读档恢复）→ 品质仍是升级后的
	click("返回");
	assert(screenText().includes("开始下一关"), "升级后返回仍在营地");
	session();
	clickNode(nodesWithClass("wm-rogue-hub-curios")[0]);
	assert(dump(nodesWithClass("wm-rogue-curio-manage")[0]).includes("稀有"), "重载后品质保持稀有");
	saved = lib.storage.rogueSlots[0];
	assertEqual(saved.curioQuality.energy_core, "rare", "重载不重掷、不回落");
	click("返回");
	return "营地直达 + 只读不落盘 + 升级落盘 + 返回营地 + 重载保持";
});

await check("开局：先落盘敌方阵容再建局，本体事件调用顺序正确", async () => {
	freshWorld();
	session();
	await newRunByUi("闯关模式");
	const before = log.length;
	clickNormalBattle();
	await flush();
	const order = log.slice(before).map(item => item.type);
	assertEqual(order[0], "save", "第一步必须写存档");
	assert(order.indexOf("save") < order.indexOf("prepareArena"), "必须先保存 currentBattle 再开局");
	for (const type of ["save", "prepareArena", "trigger:gameStart", "gameDraw", "phaseLoop"]) {
		assert(order.includes(type), `应调用 ${type}，实际：${order.join(" → ")}`);
	}
	assert(order.indexOf("trigger:gameStart") < order.indexOf("gameDraw"), "gameStart 应在起手牌之前");
	const run = lib.storage.rogueSlots[0];
	assertEqual(run.currentBattle.status, "battle", "状态应为 battle");
	const enemies = run.currentBattle.enemies;
	assert(Array.isArray(enemies) && enemies.length === 1, "第 1 关应有 1 个敌人");
	// 闯关前 10 关：敌人来自建局时抽定的关卡配置（challengeStages[level-1]），不再是扩展角色池
	const stages = run.challengeStages;
	assert(Array.isArray(stages) && stages.length === cfg.CHALLENGE_STAGE_LEVELS, "建局时应一次性抽出前 10 关配置");
	assertEqual(new Set(stages).size, stages.length, "前 10 关配置互不重复");
	assert(stages.every(id => stagesData.getChallengeStageConfig(id)), "每关配置都在配置池里");
	const stageConfig = stagesData.getChallengeStageConfig(stages[run.level - 1]);
	assertEqual(enemies[0].characterId, stageConfig.players[0].character, `敌人 ${enemies[0].characterId} 应来自关卡配置「${stageConfig.id}」`);
	assertEqual(enemies[0].stats.defense + enemies[0].stats.draw + enemies[0].stats.attack, 1, "第 1 关每名敌人恰好 1 属性点");
	const arena = log.find(item => item.type === "prepareArena");
	assertEqual(arena.num, 1 + enemies.length, `座位数应为 ${1 + enemies.length}`);
	assertEqual(log.find(item => item.type === "phaseLoop").player, "me", "应由玩家开始循环");
	assertEqual(game.no_continue_game, true, "应关闭本体的“再战”控件");
	return order.join(" → ");
});

await check("敌我强化只作用于 Player，不回写 lib.character", async () => {
	const snapshot = JSON.stringify(lib.character);
	const run = lib.storage.rogueSlots[0];
	const enemy = game.players[1];
	assert(enemy, "应存在敌方 Player");
	assertEqual(enemy.__char, run.currentBattle.enemies[0].characterId, "敌人角色应来自存档阵容");
	assertEqual(game.players.length, 1 + run.currentBattle.enemies.length, "座位数与阵容一致");
	assertEqual(JSON.stringify(lib.character), snapshot, "lib.character 不得被修改");
	assert(!Object.keys(lib.character).some(id => id.includes("rogue_")), "不应往角色库塞东西");
	return `敌 ${enemy.__char} hp${enemy.hp}/max${enemy.maxHp}`;
});

await check("AI 态度：本体 get.attitude 依赖的 rawAttitude 由模式提供", () => {
	// 崩溃现场：敌人出牌 → get.attitude → get.rawAttitude.apply 缺失
	assert(typeof get.rawAttitude === "function", "模式必须混入 get.rawAttitude");
	const foes = game.players.slice(1);
	assert(foes.length >= 1, "场上应有敌人");
	assertEqual(get.rawAttitude(game.me, game.me), 7, "自己对自己");
	assert(get.rawAttitude(game.me, foes[0]) < 0, "玩家看敌人应为敌意");
	assert(get.rawAttitude(foes[0], game.me) < 0, "敌人看玩家应为敌意");
	if (foes[1]) {
		assert(get.rawAttitude(foes[0], foes[1]) > 0, "同阵营敌人应为善意");
	}
	assertEqual(get.rawAttitude(null, game.me), 0, "空值不炸");
	// 阵营必须记在 Player 上：跨域/克隆出来的副本没有对象身份，仍要判对阵营
	assertEqual(game.me.rogueSide, 0, "玩家应带阵营标记");
	assertEqual(foes[0].rogueSide, 1, "敌人应带阵营标记");
	const clone = { ...foes[0] };
	assert(clone !== game.me && clone !== foes[0], "副本与原对象不同");
	assert(get.rawAttitude(clone, game.me) < 0, "副本敌人对玩家仍应为敌意");
	assert(get.rawAttitude(game.me, clone) < 0, "玩家对副本敌人仍应为敌意");
	const cloneMe = { ...game.me };
	assert(get.rawAttitude(cloneMe, game.me) > 0, "玩家副本仍应视为友方");
	return `敌我 ${get.rawAttitude(game.me, foes[0])} / ${get.rawAttitude(foes[0], game.me)}，副本 ${get.rawAttitude(clone, game.me)}`;
});

await check("玩家属性与技能在开局时按存档重建；旧档 groupId 自动还原成阵容", async () => {
	putRun(2, {
		mode: "challenge",
		level: 1,
		skills: ["rogue_extra"],
		stats: { defense: 1, draw: 0, attack: 0 },
		// v2 旧档只记 groupId：读档时应自动还原为完整敌方阵容（佐菲），恢复时按原敌人重打
		currentBattle: { groupId: "group_zofer", status: "battle" },
		currency: { gold: 0, exp: 0 },
	}, stateModule.createRun("challenge", "迪迦", 1));
	session();
	assert(screenText().includes("战斗未正常结算"), "旧档的进行中战斗应提示恢复");
	click("重新挑战这一关");
	await flush();
	assertEqual(game.me.__char, "迪迦", "玩家角色来自存档");
	assert(game.me.hasSkill("rogue_extra"), "存档技能应重新赋予");
	assertEqual(game.players[1].__char, "佐菲", "旧档 groupId 应还原成原组合的敌人");
	assertEqual(lib.storage.rogueSlots[2].currentBattle.enemies[0].characterId, "佐菲", "存档里的阵容已具体化");
	// 触发类技能能否触发，取决于建局时是否分配了 playerid（本体 addSkill 的钩子注册条件）
	assert(game.me.playerid, "玩家应有 playerid");
	assert(game.players.every(player => player.playerid), "每个座位都应有 playerid");
	assertEqual(lib.hookmap.phaseDrawBegin2, true, "该技能的触发时机应已登记进 hookmap");
	assertEqual(lib.hookmap.damageBegin1, true, "属性强化的杀伤害触发时机应已登记进 hookmap");
	const bare = stub.ui.create.player();
	bare.addSkill("rogue_extra");
	assertEqual(lib.hookmap.phaseDrawBegin2, true, "无 playerid 的新座位不应影响已登记的钩子");
	assertEqual(game.me.maxHp, 4, "占位属性无数值，体力上限不该被凭空改动");
	assertEqual(game.me.hasSkill("rogue_stat"), true, "玩家应始终拥有紧凑属性强化入口");
	const draw = log.find(item => item.type === "gameDraw");
	assertEqual(draw.counts[0], 4, "起手牌仍为基础 4 张（startHand 占位为 0）");
	return `me ${game.me.__char} skills ${game.me.__skills.join(",")}`;
});

await check("属性强化合并：只加一个 rogue_stat，四项数值一次写入", async () => {
	putRun(4, {
		mode: "challenge",
		level: 1,
		skills: [],
		stats: { defense: 6, draw: 6, attack: 6 },
		currentBattle: { status: "battle", enemies: [{ characterId: "佐菲", stats: { defense: 0, draw: 0, attack: 0 }, skills: [], maxHp: 0, hp: 0 }] },
		currency: { gold: 0, exp: 0 },
	}, stateModule.createRun("challenge", "迪迦", 1));
	session();
	click("重新挑战这一关");
	await flush();
	const expected = statsData.sumStatEffects({ defense: 6, draw: 6, attack: 6 });
	assert(game.me.hasSkill("rogue_stat"), "应有合并后的强化技能");
	for (const old of ["rogue_stat_draw", "rogue_stat_hand", "rogue_stat_sha", "rogue_stat_usable"]) {
		assertEqual(game.me.hasSkill(old), false, `不该再有 ${old}`);
	}
	assertEqual(
		JSON.stringify(game.me.storage.rogue_stat),
		JSON.stringify({
			extraDraw: expected.extraDraw,
			handLimit: expected.handLimit,
			damageChance: expected.damageChance,
			shaLimit: expected.shaLimit,
		}),
		"storage 应是一次性写入的四项最终值"
	);
	assertEqual(game.me.__skills.filter(id => id.startsWith("rogue_stat")).length, 1, "只应有一个强化技能");
	return `rogue_stat ${JSON.stringify(game.me.storage.rogue_stat)}`;
});

await check("敌人强化：属性等级复用玩家效果表，额外技能与体力覆盖只加在该 Player 上", async () => {
	lib.character["赛文"] = { hp: 5, maxHp: 5, skills: [] };
	putRun(3, {
		mode: "challenge",
		level: 1,
		characterId: "赛文",
		currentBattle: {
			status: "battle",
			enemies: [{ characterId: "赛文", stats: { defense: 1, draw: 1, attack: 1 }, skills: ["rogue_extra"], maxHp: 2, hp: 0 }],
		},
	}, stateModule.createRun("challenge", "赛文", 1));
	session();
	click("重新挑战这一关");
	await flush();
	const enemy = game.players[1];
	assertEqual(enemy.__char, "赛文", "敌人角色来自存档阵容");
	assert(enemy.hasSkill("rogue_extra"), "敌人额外技能应施加到该 Player");
	assertEqual(game.me.hasSkill("rogue_extra"), false, "不该串到玩家身上");
	// 敌人的 Roguelike 属性走玩家的同一张效果表（data/stats.js）：防御 1 级 = 护甲 1 + 体力上限 1
	assertEqual(enemy.hujia, 1, "防御等级给敌人上护甲");
	// 过牌/攻击的数值加成同样走 rogue_stat 这个统一载体
	assert(enemy.hasSkill("rogue_stat"), "摸牌/伤害加成应由同一强化技能承载");
	assertEqual(
		JSON.stringify(enemy.storage.rogue_stat),
		JSON.stringify({ extraDraw: 1, handLimit: 0, damageChance: 10, shaLimit: 0 }),
	 "敌人 storage 四项数值与玩家同一套"
	);
	assertEqual(game.me.hasSkill("rogue_stat"), true, "玩家应保留紧凑属性强化入口");
	// 体力上限 = 角色原生 5 + maxHp 覆盖 2（防御 1 级只加护甲，不加体力上限）
	assertEqual(enemy.maxHp, lib.character["赛文"].maxHp + 2, "应叠加 maxHp 覆盖");
	assertEqual(JSON.stringify(lib.character["赛文"]), JSON.stringify({ hp: 5, maxHp: 5, skills: [] }), "角色库不被改写");
	return `敌 ${enemy.__char} maxHp ${lib.character["赛文"].maxHp} → ${enemy.maxHp}`;
});

await check("运行时发技能：group 伙伴只登记触发器、不进技能表（字符串/数组/未注册/重复）", () => {
	lib.skill.grp_plain = {};
	lib.skill.grp_one = { group: "grp_one_part" };
	lib.skill.grp_one_part = {};
	lib.skill.grp_many = { group: ["grp_many_a", "grp_many_b"] };
	lib.skill.grp_many_a = { trigger: { player: "damageBegin2" } };
	lib.skill.grp_many_b = {};
	lib.skill.grp_ghost = { group: "grp_never_registered" };
	const player = stub.ui.create.player();
	player.getId();
	const granted = battleModule.grantSkills(player, ["grp_plain", "grp_one", "grp_many", "grp_ghost", "grp_plain", "grp_absent"], "测试技能未注册");
	// 本体 addSkill 只把传入的主技能写进 skills，group 伙伴由 addSkillTrigger 展开登记
	assertEqual(granted.join(","), "grp_plain,grp_one,grp_many,grp_ghost", "返回实际挂载的主技能（去重、过滤未注册）");
	assertEqual(player.__skills.join(","), "grp_plain,grp_one,grp_many,grp_ghost", "技能表只有主技能：group 伙伴不独立上面板");
	for (const id of ["grp_plain", "grp_one", "grp_one_part", "grp_many", "grp_many_a", "grp_many_b"]) {
		assert(player.hasSkill(id), `本体 hasSkill 展开语义下应拥有 ${id}`);
	}
	assertEqual(player.hasSkill("grp_never_registered"), false, "group 伙伴没注册时由本体 expandSkills 自己过滤");
	assertEqual(granted.includes("grp_absent"), false, "未注册的 id 应被过滤掉（并给出警告）");
	assertEqual(granted.filter(id => id === "grp_plain").length, 1, "同一技能重复传入只挂一次");
	assert((lib.hook[`${player.playerid}_player_damageBegin2`] ?? []).includes("grp_many_a"), "group 伙伴自己的触发器仍在注册表里");
	return `${player.__skills.join(",")}（伙伴仅登记触发器）`;
});

	await check("开局：买来的带 group 技能把伙伴一起挂上，存档与技能槽只认主技能", async () => {
		putRun(5, {
			mode: "challenge",
			level: 1,
			characterId: "迪迦",
			skills: ["grp_buy"],
			stats: { defense: 0, draw: 0, attack: 0 },
			currentBattle: { status: "battle", enemies: [{ characterId: "佐菲", stats: { defense: 0, draw: 0, attack: 0 }, skills: [], maxHp: 0, hp: 0 }] },
			currency: { gold: 0, exp: 0 },
		}, stateModule.createRun("challenge", "迪迦", 1));
	session();
	// 官方技能 kongcheng 就是 `group: "kongcheng1"` 这个写法，这里照搬一份夹具
	lib.skill.grp_buy = { forced: true, group: "grp_buy_locked" };
	lib.skill.grp_buy_locked = { forced: true, trigger: { player: "damageBegin3" } };
	click("重新挑战这一关");
	await flush();
	// session() 会把 game.me 清掉，运行时的技能列表要先记下来
	const liveSkills = game.me.__skills.join(",");
	assertEqual(game.me.__skills.filter(id => id.startsWith("grp_buy")).join(","), "grp_buy", "运行时技能表只应出现主技能（group 伙伴不额外占一条）");
	assertEqual(game.me.getSkills().includes("grp_buy_locked"), false, "getSkills（技能面板数据源）不包含 group 伙伴");
	assert(game.me.hasSkill("grp_buy_locked"), "group 伙伴仍按本体 hasSkill 展开语义算拥有");
	assert((lib.hook[`${game.me.playerid}_player_damageBegin3`] ?? []).includes("grp_buy_locked"), "group 伙伴的触发器照常登记");
	const saved = lib.storage.rogueSlots[5];
	assertEqual(saved.skills.length, 1, "存档里只有主技能");
	assertEqual(saved.skills[0], "grp_buy", "group 伙伴不得写进存档");
	// 槽位统计永远看 run.skills：展开出来的伙伴技能一个都不占
	putRun(5, { currentBattle: null }, saved);
	session();
	click("商店");
	assert(screenText().includes("1/3"), `技能槽应显示 1/3：${screenText()}`);
	return `运行时 ${liveSkills} / 存档 ${saved.skills.join(",")}`;
});

await check("开局：敌人配置的带 group 技能同样展开，存档阵容本身不被改写", async () => {
	putRun(3, {
		mode: "challenge",
		level: 1,
		characterId: "赛文",
		skills: [],
		currentBattle: { status: "battle", enemies: [{ characterId: "赛文", stats: { defense: 0, draw: 0, attack: 0 }, skills: ["grp_enemy"], maxHp: 0, hp: 0 }] },
	}, stateModule.createRun("challenge", "赛文", 1));
	session();
	lib.skill.grp_enemy = { group: ["grp_enemy_part"] };
	lib.skill.grp_enemy_part = { trigger: { player: "damageBegin4" } };
	click("重新挑战这一关");
	await flush();
	const enemy = game.players[1];
	assert(enemy.hasSkill("grp_enemy"), "敌人应拿到配置里的主技能");
	assertEqual(enemy.getSkills().includes("grp_enemy_part"), false, "敌人的技能面板数据源不含 group 伙伴");
	assert(enemy.hasSkill("grp_enemy_part"), "group 伙伴仍按本体展开语义算拥有");
	assert((lib.hook[`${enemy.playerid}_player_damageBegin4`] ?? []).includes("grp_enemy_part"), "敌人身上 group 伙伴的触发器照常登记");
	assertEqual(game.me.hasSkill("grp_enemy_part"), false, "不该串到玩家身上");
	const saved = lib.storage.rogueSlots[3].currentBattle.enemies[0];
	assertEqual(saved.skills.join(","), "grp_enemy", "存档阵容里只保存主技能 id");
	return `敌 ${enemy.__char} ${enemy.__skills.join(",")}`;
});

await check("开局：属性 extraSkills 的带 group 技能也展开", async () => {
	const level0 = statsData.stats.defense.levels[0];
	const had = Object.prototype.hasOwnProperty.call(level0, "extraSkills");
	const original = level0.extraSkills;
	level0.extraSkills = ["grp_stat"];
	try {
		putRun(4, {
			mode: "challenge",
			level: 1,
			characterId: "迪迦",
			skills: [],
			stats: { defense: 1, draw: 0, attack: 0 },
			currentBattle: { status: "battle", enemies: [{ characterId: "佐菲", stats: { defense: 0, draw: 0, attack: 0 }, skills: [], maxHp: 0, hp: 0 }] },
		}, stateModule.createRun("challenge", "迪迦", 1));
		session();
		lib.skill.grp_stat = { group: "grp_stat_part" };
		lib.skill.grp_stat_part = { trigger: { player: "damageBegin5" } };
		click("重新挑战这一关");
		await flush();
		assert(game.me.hasSkill("grp_stat"), "属性 extraSkills 的主技能应挂上");
		assertEqual(game.me.getSkills().includes("grp_stat_part"), false, "技能面板数据源不含 group 伙伴");
		assert(game.me.hasSkill("grp_stat_part"), "extraSkills 的 group 伙伴仍按本体展开语义算拥有");
		assert((lib.hook[`${game.me.playerid}_player_damageBegin5`] ?? []).includes("grp_stat_part"), "extraSkills 伙伴的触发器照常登记");
		// 防御 1 级只有初始护甲，四项数值全 0 时不该多出 rogue_stat 标记
		assertEqual(game.me.hujia, 1, "同一份 extraSkills 之外的属性效果不受影响");
		assertEqual(game.me.hasSkill("rogue_stat"), true, "玩家应始终拥有紧凑属性强化入口");
		return game.me.__skills.join(",");
	} finally {
		if (had) {
			level0.extraSkills = original;
		} else {
			delete level0.extraSkills;
		}
	}
});

await check("运行时发技能：group 指向 subSkill 子技能 —— 子技能不独立面板、触发器照常", () => {
	// yyfuqi 的写法：group 指向自己的 subSkill（本体 finishSkill 会把它注册成 `主_子` 并打 sub/sourceSkill）
	lib.skill.grp_sublike_main = { group: "grp_sublike_main_fuqi", trigger: { player: "useCardToPlayer" } };
	lib.skill.grp_sublike_main_fuqi = { sub: true, sourceSkill: "grp_sublike_main", trigger: { player: "useCard" } };
	const player = stub.ui.create.player();
	player.getId();
	const granted = battleModule.grantSkills(player, ["grp_sublike_main"], "测试技能未注册");
	assertEqual(granted.join(","), "grp_sublike_main", "只挂主技能");
	assertEqual(player.__skills.join(","), "grp_sublike_main", "子技能不独立进技能表（技能面板只显示一条）");
	assertEqual(player.getSkills().includes("grp_sublike_main_fuqi"), false, "getSkills（面板数据源）不含子技能");
	assert(player.hasSkill("grp_sublike_main_fuqi"), "hasSkill 展开 group 后仍认子技能");
	const hooks = lib.hook[`${player.playerid}_player_useCard`] ?? [];
	assert(hooks.includes("grp_sublike_main_fuqi"), "子技能的触发器照常登记（近距离不可响应效果不丢）");
	assert((lib.hook[`${player.playerid}_player_useCardToPlayer`] ?? []).includes("grp_sublike_main"), "主技能触发器也在");
	return player.__skills.join(",");
});

await check("运行时发技能：卸下再装回同一技能，group 伙伴触发器不残留也不重复", () => {
	lib.skill.grp_cycle = { group: "grp_cycle_part", trigger: { player: "damageBegin6" } };
	lib.skill.grp_cycle_part = { trigger: { player: "damageEnd6" } };
	const player = stub.ui.create.player();
	player.getId();
	const partHookKey = `${player.playerid}_player_damageEnd6`;
	const count = id => (lib.hook[partHookKey] ?? []).filter(item => item === id).length;
	battleModule.grantSkills(player, ["grp_cycle"], "测试技能未注册");
	assertEqual(count("grp_cycle_part"), 1, "伙伴触发器只登记一次");
	player.removeSkill("grp_cycle", true);
	assertEqual(player.__skills.includes("grp_cycle"), false, "主技能已卸下");
	assertEqual(count("grp_cycle_part"), 0, "伙伴触发器一并摘掉");
	assertEqual(player.initedSkills.includes("grp_cycle_part"), false, "伙伴 init 登记一并摘掉");
	battleModule.grantSkills(player, ["grp_cycle"], "测试技能未注册");
	assertEqual(count("grp_cycle_part"), 1, "装回后伙伴触发器只登记一次（无重复）");
	assertEqual(player.__skills.filter(id => id === "grp_cycle").length, 1, "主技能只进技能表一次");
	assertEqual(player.__skills.includes("grp_cycle_part"), false, "装回后伙伴仍不独立上面板");
	assertEqual(player.initedSkills.filter(id => id === "grp_cycle_part").length, 1, "伙伴 init 登记只有一份");
	return "卸下摘净 / 装回单份";
});

	await check("胜利结算：固定奖励入账、关卡推进、清除标记且不重复结算", async () => {
		freshWorld();
		session();
		await newRunByUi("闯关模式");
		clickNormalBattle();
		await flush();
		const beforeLevel = lib.storage.rogueSlots[0].level;
		const beforeGold = lib.storage.rogueSlots[0].currency.gold;
		const beforeExp = lib.storage.rogueSlots[0].currency.exp;
		for (const player of game.players.slice(1)) {
			player.__alive = false;
		}
		lib.element.player.dieAfter.call(game.players[1]);
		const run = lib.storage.rogueSlots[0];
		assertEqual(run.currentBattle, null, "战斗标记应清除");
		assertEqual(run.level, beforeLevel + 1, "推进一关");
		assertEqual(run.currency.gold, beforeGold + 50, "闯关胜利固定 +50 金币");
		assertEqual(run.currency.exp, beforeExp + 2, "第 1 关经验 +2（按固定经验表）");
		for (const fn of lib.onover) {
			fn(true);
		}
		assertEqual(lib.storage.rogueSlots[0].currency.gold, beforeGold + 50, "不得重复结算");
		assertEqual(log.filter(item => item.type === "over").length, 1, "game.over 只应发生一次");
		const text = screenText();
		assert(text.includes("战斗胜利"), "应显示胜利页");
		assert(text.includes("本关奖励") && text.includes("金币 +50"), `奖励应分行突出：${text}`);
		assert(text.includes(`下一关：第 ${run.level} 关`), `应写明下一关：${text}`);
		return `第${beforeLevel}关 → 第${run.level}关，+50 金币`;
	});

await check("多敌人胜利：遐蝶阵容必须全部死亡，复活不能提前结算", async () => {
	freshWorld();
	putRun(0, {
		mode: "challenge",
		level: 1,
		characterId: "迪迦",
		stats: { defense: 0, draw: 0, attack: 0 },
		currentBattle: {
			status: "battle",
			enemies: [
				{ characterId: "佐菲", stats: { defense: 0, draw: 0, attack: 0 }, skills: [], maxHp: 0, hp: 0 },
				{ characterId: "遐蝶", stats: { defense: 0, draw: 0, attack: 0 }, skills: [], maxHp: 0, hp: 0 },
				{ characterId: "赛文", stats: { defense: 0, draw: 0, attack: 0 }, skills: [], maxHp: 0, hp: 0 },
			],
		},
	}, stateModule.createRun("challenge", "迪迦", 1));
	session();
	lib.character["遐蝶"] = { hp: 4, maxHp: 4, skills: [] };
	lib.translate["遐蝶"] = "遐蝶";
	lib.filter.characterDisabled = () => false;
	click("重新挑战这一关");
	await flush();
	assertEqual(game.players.length, 4, "遐蝶阵容应实际建出 3 名敌人");
	const [first, butterfly, third] = game.players.slice(1);
	first.__alive = false;
	lib.element.player.dieAfter.call(first);
	assertEqual(log.filter(item => item.type === "over").length, 0, "死亡一个敌人不能胜利");
	first.__alive = true;
	lib.element.player.dieAfter.call(first);
	assertEqual(log.filter(item => item.type === "over").length, 0, "复活敌人不能提前结算");
	butterfly.__alive = false;
	lib.element.player.dieAfter.call(butterfly);
	assertEqual(log.filter(item => item.type === "over").length, 0, "仍有敌人存活时不能胜利");
	first.__alive = false;
	third.__alive = false;
	lib.element.player.dieAfter.call(third);
	assertEqual(log.filter(item => item.type === "over").length, 1, "全部敌人死亡后才胜利");
	return "佐菲 / 遐蝶 / 赛文 全灭后结算";
});

await check("返回营地：directstart + reload，重启后落到 Hub", async () => {
	click("返回营地");
	assert(log.some(item => item.type === "reload"), "应调用 game.reload");
	assertEqual(globalThis.localStorage.getItem(`${lib.configprefix}directstart`), "true", "应设置 directstart");
	session();
	const text = screenText();
	assert(text.includes("开始下一关"), `重启后应回到 Hub：${text}`);
	assert(!text.includes("战斗未正常结算"), "已正常结算时不该提示恢复");
	return "Hub 复原";
});

await check("无尽最高记录：通关才更新，闯关不更新，失败删档也不清", async () => {
	freshWorld();
	// 本用例只验证历史最高记录：把 Math.random 抬到触发阈值之上，事件系统不介入（事件链路有专门用例）
	const originalRandom = Math.random;
	Math.random = () => 0.9;
	try {
		session();
		// 无尽：打赢第 1 关 → 记录第 1 关
		await newRunByUi("无尽模式");
		clickNormalBattle();
		await flush();
		for (const player of game.players.slice(1)) {
			player.__alive = false;
		}
		lib.element.player.dieAfter.call(game.players[1]);
		assert(lib.storage.rogueBestEndless, "应写历史最高");
		assertEqual(lib.storage.rogueBestEndless.level, 1, "通关第1关记 1");
		assertEqual(lib.storage.rogueBestEndless.characterId, "迪迦", "记角色");
		click("返回营地");
		session();
		// 存档里 level 已推进到 2（失败进入第 2 关不会把记录写成 2）
		const slot = lib.storage.rogueSlots[0];
		assertEqual(slot.level, 2, "胜利后推进到第2关");
		assertEqual(lib.storage.rogueBestEndless.level, 1, "记录仍是最高的成功通关关卡");

		// 闯关模式胜利不更新无尽记录
		lib.storage.rogueSlots = [stateModule.createRun("challenge", "赛文", 1), null, null, null, null, null];
		lib.storage.rogueActive = 0;
		session();
		clickNormalBattle();
		await flush();
		for (const player of game.players.slice(1)) {
			player.__alive = false;
		}
		lib.element.player.dieAfter.call(game.players[1]);
		assertEqual(lib.storage.rogueBestEndless.level, 1, "闯关模式不影响无尽记录");

		// 无尽失败删档：槽位清空但记录仍在
		lib.storage.rogueSlots = [
			stateModule.createRun("challenge", "赛文", 1),
			{ ...stateModule.createRun("endless", "迪迦", 1), level: 12, currentBattle: { groupId: "group_seven", status: "battle" } },
			null, null, null, null,
		];
		lib.storage.rogueActive = 1;
		session();
		click("重新挑战这一关");
		await flush();
		game.me.__alive = false;
		game.me.hp = 0;
		lib.element.player.dieAfter.call(game.me);
		assertEqual(lib.storage.rogueSlots[1], null, "无尽存档被删除");
		assertEqual(lib.storage.rogueBestEndless.level, 1, "删档不清历史最高");
		return "记录独立于存档";
	} finally {
		Math.random = originalRandom;
	}
});

await check("闯关最高记录：刚好通关最后一关才记，重复挑战不重复记，金币与经验各取各的最大", async () => {
	freshWorld();
	const originalRandom = Math.random;
	Math.random = () => 0.9;
	/** 打完当前这一关：把所有敌人打死，触发胜利结算 */
	const winBattle = async label => {
		clickNormalBattle(label);
		await flush();
		for (const player of game.players.slice(1)) {
			player.__alive = false;
		}
		lib.element.player.dieAfter.call(game.players[1]);
	};
	try {
		// 第一把：打通第 30 关（最后一关）→ 记下这一刻手上的金币与经验
		putRun(0, { mode: "challenge", characterId: "迪迦", level: cfg.CHALLENGE_TOTAL_LEVELS, currency: { gold: 100, exp: 10 } });
		session();
		await winBattle("开始下一关");
		let slot = lib.storage.rogueSlots[0];
		assert(slot.cleared, "打通最后一关应置为已通关");
		let best = lib.storage.rogueBestChallenge;
		assert(best, "应写入闯关历史最高");
		assertEqual(best.gold, slot.currency.gold, "记的就是通关那一刻手上的金币");
		assertEqual(best.exp, slot.currency.exp, "记的就是通关那一刻手上的经验");
		assertEqual(best.characterId, "迪迦", "记角色");
		const firstGold = best.gold;
		click("返回营地");

		// 重复挑战：钱包更大了，但记录一个字都不动（用户定稿：重复挑战不重复记录）
		session();
		await winBattle("重复挑战");
		slot = lib.storage.rogueSlots[0];
		assert(slot.currency.gold > firstGold, `重复挑战一场又多一笔钱：${firstGold} → ${slot.currency.gold}`);
		assertEqual(lib.storage.rogueBestChallenge.gold, firstGold, "重复挑战不重复记录（否则重打最后一关就能灌水）");
		click("返回营地");

		// 第二把（新存档）：金币更少、经验更多 → 金币保住历史最高，经验单独抬上去
		putRun(0, { mode: "challenge", characterId: "赛文", level: cfg.CHALLENGE_TOTAL_LEVELS, currency: { gold: 20, exp: 5000 } });
		session();
		await winBattle("开始下一关");
		slot = lib.storage.rogueSlots[0];
		best = lib.storage.rogueBestChallenge;
		assertEqual(best.gold, firstGold, "金币没超过上一把 → 保留最高金币");
		assertEqual(best.exp, slot.currency.exp, "经验更高 → 只抬经验（两项各取各的最大）");
		assertEqual(best.characterId, "赛文", "记破纪录这一把的角色");

		// 记在独立键上：六个存档全清空也还在
		lib.storage.rogueSlots = [null, null, null, null, null, null];
		lib.storage.rogueActive = -1;
		session();
		assertEqual(lib.storage.rogueBestChallenge.gold, firstGold, "删档不清闯关历史最高");
		return `最高金币 ${best.gold} / 最高经验 ${best.exp}（重复挑战不涨）`;
	} finally {
		Math.random = originalRandom;
	}
});

await check("选择玩法页：自建浮层 + 两张玩法卡 + 无尽与闯关的历史最高记录", async () => {
	lib.storage.rogueBestEndless = { level: 27, characterId: "迪迦", updatedAt: 1 };
	lib.storage.rogueBestChallenge = { gold: 100, exp: 20, characterId: "迪迦", updatedAt: 1 };
	session();
	click("空存档");
	let text = screenText();
	const stage = nodesWithClass("wm-rogue-modes")[0];
	assert(stage, "选择玩法也是自建浮层");
	assertEqual(nodesWithClass("wm-rogue-mode-card").length, 2, "两张玩法卡");
	const modeTokens = ["闯关模式", `固定总关卡数：${cfg.CHALLENGE_TOTAL_LEVELS} 关`, "失败：损失部分货币", "无尽模式", "关卡无限", "开启boss战和深渊强化", "失败：整档删除"];
	for (const token of modeTokens) {
		assert(text.includes(token), `玩法卡应显示「${token}」：${text}`);
	}
	assert(text.includes("最高记录：第 27 关（迪迦）"), `应显示最高记录：${text}`);
	assert(text.includes("最高金币记录：100 最高经验记录：20"), `应显示闯关最高金币/经验：${text}`);
	click("返回");
	lib.storage.rogueBestEndless = null;
	lib.storage.rogueBestChallenge = null;
	session();
	click("空存档");
	text = screenText();
	assert(text.includes("最高记录：暂无"), `无尽无记录时应显示暂无：${text}`);
	assert(!text.includes("最高金币记录"), `没通过过闯关就不显示那一行：${text}`);
	// 点整张卡即选中：点无尽卡进入选将
	click("无尽模式");
	assert(screenText().includes("点击武将即完成选择"), "点卡片应进入选将页");
	click("返回");
	return "玩法卡 + 最高记录";
});

await check("技能管理页（无尽）：商店资源块进入、装备/卸下即时落盘、满位反馈、poptip 转成技能名", async () => {
	freshWorld();
	session();
	await newRunByUi("无尽模式");
	click("商店");
	const skillCell = nodesWithClass("wm-rogue-res-skill")[0];
	assert(skillCell, "商店顶部应有可点击的技能资源块");
	clickNode(skillCell);
	let text = screenText();
	assert(text.includes("技能（装备 0/3 · 背包 0）"), `空态标题要分开报装备与背包：${text}`);
	assert(text.includes("当前没有装备技能，可以 0 技能出战。"), `空装备状态写明：${text}`);
	assert(text.includes("背包里还没有技能"), `空背包状态写明：${text}`);
	click("返回");
	assert(screenText().includes("技能商店"), "返回应回到商店");

	// 只读进出一趟（不按任何按钮）不该动存档
	const before = JSON.stringify(lib.storage.rogueSlots);
	clickNode(nodesWithClass("wm-rogue-res-skill")[0]);
	click("返回");
	assertEqual(JSON.stringify(lib.storage.rogueSlots), before, "只看不点不写存档");

	// 有技能（描述里带 poptip）时：显示清洗并转名后的完整描述；装备/卸下即时落盘
	putRun(0, {
		mode: "endless",
		currency: { gold: 9999, exp: 0 },
		skills: ["rogue_poptip"],
		skillInventory: ["rogue_poptip", "own_one", "own_two", "own_three"],
		shopOffers: [{ id: "rogue_extra", price: 10, sold: false }],
	});
	session();
	// 会话会把 lib.translate / lib.poptip 重置掉，这两处要在 session() 之后再塞
	lib.translate.rogue_poptip = '光test<hr>锁定技，<noname-poptip poptip="hadjanrong"></noname-poptip>造成的伤害+1。';
	lib.poptip = {
		getName: id => ({ hadjanrong: "暗融" }[id] ?? id),
		getType: id => (id === "hadjanrong" ? "skill" : "rule"),
	};
	click("商店");
	clickNode(nodesWithClass("wm-rogue-res-skill")[0]);
	text = screenText();
	assert(text.includes("技能（装备 1/3 · 背包 3）"), `数量分开报装备与背包：${text}`);
	assert(text.includes("当前装备 1/3") && text.includes("技能背包 3"), `两个分区标题：${text}`);
	assert(text.includes("光test"), `应列出已装备技能：${text}`);
	assert(text.includes("〖暗融〗造成的伤害+1"), `poptip 应转成〖技能名〗：${text}`);
	assert(!text.includes("noname-poptip"), `不得泄漏原始标签：${text}`);
	const buttonsOf = label => nodesWithClass("wm-rogue-skill-btn").filter(node => textOf(node) === label);

	// 卸下：技能回背包、不算失去（卸载不等于失去），落盘立即生效
	clickNode(buttonsOf("卸下")[0]);
	await flush();
	let saved = lib.storage.rogueSlots[0];
	assertEqual(JSON.stringify(saved.skills), JSON.stringify([]), "卸下后装备为空");
	assert(saved.skillInventory.includes("rogue_poptip"), "卸下后技能仍留在背包");
	assertEqual(saved.currency.gold, 9999, "卸下不发钱（不是失去）");
	assert(screenText().includes("技能（装备 0/3 · 背包 4）"), `原位重绘：${screenText().slice(0, 120)}`);

	// 装回一个：背包里的技能进装备位，仍是即时落盘 + 原位重绘
	clickNode(buttonsOf("装备")[0]);
	await flush();
	saved = lib.storage.rogueSlots[0];
	assertEqual(saved.skills.length, 1, "装备一个");
	assert(screenText().includes("当前装备 1/3"), "原位重绘数量");

	// 装到满位：第 4 个背包技能的按钮写「装备已满」，点了毫无反应
	while (buttonsOf("装备").length) {
		clickNode(buttonsOf("装备")[0]);
		await flush();
	}
	saved = lib.storage.rogueSlots[0];
	assertEqual(saved.skills.length, cfg.SKILL_SLOTS, "装备到上限");
	const fullButtons = buttonsOf("装备已满");
	assertEqual(fullButtons.length, 1, "满位后剩余背包技能的按钮改成「装备已满」");
	assert(fullButtons[0].classList.contains("wm-rogue-disabled"), "满位按钮置灰");
	const frozen = JSON.stringify(saved.skills);
	clickNode(fullButtons[0]);
	await flush();
	assertEqual(JSON.stringify(lib.storage.rogueSlots[0].skills), frozen, "点了毫无反应（装备位是硬上限）");

	// 换装策略：先卸下一个再装另一个（不是隐式替换）
	clickNode(buttonsOf("卸下")[0]);
	await flush();
	clickNode(buttonsOf("装备")[0]);
	await flush();
	saved = lib.storage.rogueSlots[0];
	assertEqual(saved.skills.length, cfg.SKILL_SLOTS, "换装后仍是满位");
	assertEqual(new Set(saved.skills).size, cfg.SKILL_SLOTS, "换装不重复");
	// 重新读档：装备与背包原样回来，不会出现「装备着却不在背包里」
	session();
	click("商店");
	clickNode(nodesWithClass("wm-rogue-res-skill")[0]);
	const rearview = lib.storage.rogueSlots[0];
	assertEqual(JSON.stringify(rearview.skills), JSON.stringify(saved.skills), "读档后装备原样");
	assertEqual(JSON.stringify(rearview.skillInventory), JSON.stringify(saved.skillInventory), "读档后背包原样");
	click("返回");
	assert(screenText().includes("技能商店"), "返回应回到商店");
	return "装备/卸下/满位/换装/读档 五项";
});

await check("装备与卸下不是失去：遗忘之石/贪食魔盒一分钱不发，背包一条不丢", async () => {
	putRun(0, {
		mode: "endless",
		level: 3,
		currency: { gold: 100, exp: 100 },
		skills: ["own_one"],
		skillInventory: ["own_one", "own_two"],
		curios: ["oblivion_stone", "gluttonous_box"],
		currentBattle: null,
	});
	session();
	click("商店");
	clickNode(nodesWithClass("wm-rogue-res-skill")[0]);
	const buttonOf = label => nodesWithClass("wm-rogue-skill-btn").filter(node => textOf(node) === label);
	clickNode(buttonOf("卸下")[0]);
	await flush();
	clickNode(buttonOf("装备")[0]);
	await flush();
	const slot = lib.storage.rogueSlots[0];
	assertEqual(JSON.stringify(slot.skills), JSON.stringify(["own_one"]), "换装一轮后装备回到一个");
	assertEqual(JSON.stringify(slot.skillInventory), JSON.stringify(["own_one", "own_two"]), "背包一条不少");
	assertEqual(slot.currency.gold, 100, "遗忘之石不发钱（卸下不是失去）");
	assertEqual(slot.currency.exp, 100, "贪食魔盒不发经验");
	click("返回");
	return "卸下 + 装回：只有装备位在动";
});

await check("闯关技能页：只读技能栏，旧档残留的背包技能不显示、也不能装备", async () => {
	freshWorld();
	putRun(0, {
		mode: "challenge",
		skills: ["own_one"],
		// v14 时代遗留的背包数据：修复后应被冻结，不再提供额外存储能力
		skillInventory: ["own_one", "own_two", "own_three", "rogue_extra"],
		currency: { gold: 100, exp: 0 },
		currentBattle: null,
	});
	session();
	click("商店");
	assertEqual(nodesWithClass("wm-rogue-res-label").map(node => textOf(node)).join(","), "金币,经验,技能", "闯关资源块不写背包");
	assertEqual(textOf(nodesWithClass("wm-rogue-res-num")[2]), "1/3", "技能格只报技能栏数量");
	clickNode(nodesWithClass("wm-rogue-res-skill")[0]);
	const text = screenText();
	assert(text.includes("技能（1/3）"), `标题只报技能栏：${text}`);
	assert(text.includes("own_one"), `列出技能栏里的技能：${text}`);
	assert(!text.includes("背包"), `闯关技能页不得出现背包：${text}`);
	assertEqual(nodesWithClass("wm-rogue-shop-card").length, 1, "只显示技能栏里的技能（残留背包条目不显示）");
	assertEqual(nodesWithClass("wm-rogue-skill-btn").length, 0, "闯关没有装备/卸下按钮");
	click("返回");
	assert(screenText().includes("技能商店"), "返回应回到商店");
	return "只读 1 张卡 / 无背包 / 无装卸";
});

await check("闯关满槽购买：弹替换页、取消零扣费、确认后旧技能让位且不进背包", async () => {
	freshWorld();
	putRun(0, {
		mode: "challenge",
		level: 2,
		currency: { gold: 500, exp: 0 },
		skills: ["own_one", "own_two", "own_three"],
		skillInventory: ["own_one", "own_two", "own_three"],
		shopOffers: [{ id: "rogue_extra", price: 10, sold: false }],
		currentBattle: null,
	});
	session();
	click("商店");
	const before = JSON.stringify(lib.storage.rogueSlots[0]);
	clickNode(nodesWithClass("wm-rogue-shop-buy")[0]);
	await flush();
	// 打开替换页本身不改存档
	assertEqual(nodesWithClass("wm-rogue-replace-overlay").length, 1, "满槽购买应弹替换页");
	assertEqual(JSON.stringify(lib.storage.rogueSlots[0]), before, "打开替换页不扣款、不改技能");
	const replaceText = screenText();
	assert(replaceText.includes("技能槽已满，请选择一个已有技能进行替换"), `替换页说明：${replaceText}`);
	assertEqual(nodesWithClass("wm-rogue-replace-btn").length, 3, "三个已有技能都能被替换");
	// 取消：返回商店，金币与技能栏一个字不动
	click("返回");
	assert(screenText().includes("技能商店"), "返回应回到商店");
	assertEqual(JSON.stringify(lib.storage.rogueSlots[0]), before, "取消替换零副作用");
	// 确认替换：新技能进技能栏、旧技能直接失去、不进任何背包
	clickNode(nodesWithClass("wm-rogue-shop-buy")[0]);
	await flush();
	clickNode(nodesWithClass("wm-rogue-replace-btn")[1]);
	await flush();
	const after = lib.storage.rogueSlots[0];
	assertEqual(JSON.stringify(after.skills), JSON.stringify(["own_one", "own_three", "rogue_extra"]), "新技能顶替旧技能");
	assert(!after.skillInventory.includes("own_two"), "被替换的旧技能不得进背包");
	assert(after.skillInventory.includes("rogue_extra"), "新技能同步进历史镜像");
	assertEqual(after.skillInventory.length, 3, "背包条目数不增长（没有额外存储）");
	assertEqual(after.currency.gold, 490, "成交才扣款");
	assert(after.shopOffers[0].sold, "候选标记已购");
	assert(screenText().includes("已购买"), `成交后原位标已购买：${screenText().slice(0, 200)}`);
	return "替换页 / 取消零扣费 / 确认让位";
});

await check("异常退出恢复：恢复页展示原阵容，重打同一套敌人，不判胜、不补奖、不跳关", async () => {
	// v2 旧档只记 groupId：读档还原成阵容后，恢复战斗仍应原样重打，不重掷
	const run = putRun(0, { currentBattle: { groupId: "group_seven", status: "battle" } });
	session();
	const text = screenText();
	assert(text.includes("战斗未正常结算"), `应有恢复页大标题：${text}`);
	assert(text.includes("闯关模式") && text.includes(`第 ${run.level} 关`), "应展示模式与关卡");
	assert(text.includes("将使用上次保存的敌方阵容继续挑战"), "应说明沿用保存的阵容");
	assert(text.includes("赛文"), "敌人应按存档阵容展示");
	// 主/次按钮都要在，且返回入口在点击前不改变存档
	assertEqual(nodesWithClass("wm-rogue-resume-primary").length, 1, "主按钮：重新挑战这一关");
	const before = log.length;
	click("重新挑战这一关");
	await flush();
	assert(log.slice(before).map(item => item.type).includes("phaseLoop"), "应重新进入战斗");
	const saved = lib.storage.rogueSlots[0];
	assertEqual(saved.currentBattle.enemies.length, 1, "阵容还原为 1 个敌人");
	assertEqual(saved.currentBattle.enemies[0].characterId, "赛文", "沿用旧档组合里的敌人，不重掷");
	assertEqual(game.players[1].__char, "赛文", "场上敌人与存档一致");
	assertEqual(saved.level, run.level, "关卡未被跳过");
	assertEqual(saved.currency.gold, run.currency.gold, "未重复领取奖励");
	assert(!log.slice(before).some(item => item.type === "over"), "不得自动判定胜利");
	return `沿用 ${saved.currentBattle.enemies[0].characterId}`;
});

await check("取消恢复：返回存档页不删进度并标出未完成战斗", async () => {
	session();
	click("返回存档页");
	const text = screenText();
	assert(text.includes("存档1"), "应回到六槽页");
	assert(lib.storage.rogueSlots[0] !== null, "正在进行的存档不得被删除");
	assert(text.includes("有未完成战斗"), "槽位卡片应标出未完成战斗");
	return "进度保留";
});

await check("闯关 11~20 关：首次开战抽 10 个组合落盘，敌人按 challengeComboStages[level-11] 的双人组合生成", async () => {
	freshWorld();
	putRun(0, { level: 11, challengeStages: [] });
	session();
	const before = log.length;
	clickNormalBattle();
	await flush();
	// 首次进入 11~30 关：开战前一次性抽出 10 个组合并立刻落盘（先 save 再开局）
	assert(log.slice(before).filter(item => item.type === "save").length >= 1, "抽取结果应立刻落盘");
	const saved = lib.storage.rogueSlots[0];
	const combos = saved.challengeComboStages;
	assert(Array.isArray(combos) && combos.length === cfg.CHALLENGE_COMBO_LEVELS, `应一次性抽出 10 个组合，实际 ${combos?.length}`);
	assertEqual(new Set(combos).size, combos.length, "10 个组合互不重复");
	assert(combos.every(id => combosData.getChallengeComboConfig(id)), "每个 id 都能取回组合配置");
	// 第 11 关 = 第 0 个组合，双人按 players 顺序
	const combo = combosData.getChallengeComboConfig(combos[0]);
	const enemies = saved.currentBattle.enemies;
	assertEqual(enemies.length, 2, "第 11 关应有 2 个敌人（双人组合）");
	assertEqual(enemies[0].characterId, combo.players[0].character, "左角色在前");
	assertEqual(enemies[1].characterId, combo.players[1].character, "右角色在后");
	assertEqual(enemies[0].stats.defense + enemies[0].stats.draw + enemies[0].stats.attack, 11,
		"第 11 关：左敌人独立吃满 11 点");
	assertEqual(enemies[1].stats.defense + enemies[1].stats.draw + enemies[1].stats.attack, 11,
		"第 11 关：右敌人独立吃满 11 点（不共享预算）");
	// 打到第 12 关再开战（模拟推进后重进）：用第 1 个组合，且组合表绝不重抽
	putRun(0, { level: 12, challengeComboStages: combos, currentBattle: null });
	session();
	clickNormalBattle();
	await flush();
	const next = lib.storage.rogueSlots[0];
	assertEqual(JSON.stringify(next.challengeComboStages), JSON.stringify(combos), "组合表沿用原抽取结果");
	const combo2 = combosData.getChallengeComboConfig(combos[1]);
	assertEqual(next.currentBattle.enemies[0].characterId, combo2.players[0].character, `第 12 关左角色来自「${combo2.id}」`);
	assertEqual(next.currentBattle.enemies[1].characterId, combo2.players[1].character, "第 12 关右角色顺序不变");
	return `第 11 关 = ${combo.id}、第 12 关 = ${combo2.id}（10 组合已定死）`;
});

await check("闯关 21~30 关：双人组合 + 扩展池第三人，第三人随 currentBattle 落盘、恢复战斗绝不重掷", async () => {
	// 直接给一份已抽定的组合表（等价于已经打过 11~20 关），第 21 关必须复用第 0 项
	const combos = combosData.challengeComboPool.slice(0, cfg.CHALLENGE_COMBO_LEVELS).map(config => config.id);
	// 保底记录故意留 0（第 21 关的关卡差早已超过阈值）：Boss 判定只属于无尽，
	// 闯关这一场绝不会被人抢成单 Boss——本用例同时验到这一点（阵容必须是 3 名敌人）
	putRun(0, { level: 21, challengeComboStages: combos, challengeStages: [] });
	session();
	clickNormalBattle();
	await flush();
	const saved = lib.storage.rogueSlots[0];
	const combo = combosData.getChallengeComboConfig(combos[0]);
	const [left, right] = combo.players.map(player => player.character);
	const enemies = saved.currentBattle.enemies;
	assertEqual(enemies.length, 3, "第 21 关应有 3 个敌人（双人组合 + 第三人）");
	const leftIndex = enemies.findIndex(entry => entry.characterId === left);
	const rightIndex = enemies.findIndex(entry => entry.characterId === right);
	const thirdEntry = enemies.find(entry => entry.characterId !== left && entry.characterId !== right);
	assert(leftIndex >= 0 && rightIndex >= 0 && thirdEntry, "组合两名角色与第三人都在阵容里");
	assert(leftIndex < rightIndex, "左角色永远在右角色之前");
	const pool = enemyModule.getChallengeEnemyPool();
	assert(pool.includes(thirdEntry.characterId), `第三人 ${thirdEntry.characterId} 应来自扩展角色池`);
	for (const entry of enemies) {
		assertEqual(entry.stats.defense + entry.stats.draw + entry.stats.attack, 21,
			`第 21 关：${entry.characterId} 独立吃满 21 点（三人互不摊薄）`);
	}
	const thirdBefore = thirdEntry.characterId;
	// 模拟中途刷新：重新加载页面走恢复流程，第三人必须原样沿用
	session();
	assert(screenText().includes("战斗未正常结算"), "应有恢复页");
	click("重新挑战这一关");
	await flush();
	const after = lib.storage.rogueSlots[0].currentBattle.enemies;
	assertEqual(after.length, 3, "恢复后仍是 3 个敌人");
	assertEqual(JSON.stringify(after.map(entry => entry.characterId)), JSON.stringify(enemies.map(entry => entry.characterId)), "恢复战斗沿用同一套阵容（含第三人），绝不重掷");
	assertEqual(after.find(entry => entry.characterId !== left && entry.characterId !== right).characterId, thirdBefore, "第三人还是同一个");
	return `第 21 关 = ${combo.id} + 第三人 ${thirdBefore}（恢复不重掷）`;
});

await check("商店：浮层骨架——固定标题与资源栏 + 三张技能卡 + 三张属性卡", async () => {
	putRun(0, { currentBattle: null, level: 1, shopOffers: [], currency: { gold: 1000, exp: 0 } });
	session();
	click("商店");
	const saved = lib.storage.rogueSlots[0];
	assertEqual(saved.shopOffers.length, cfg.SKILL_OFFER_COUNT, "候选数");
	assert(saved.shopOffers.every(offer => typeof offer.id === "string" && Number.isFinite(offer.price)), "候选结构");
	const overlay = common.currentScreenNode();
	assertEqual(overlay?.id, "wm-rogue-overlay", "商店走自建浮层，与存档页同一套承载");
	assertEqual(nodesWithClass("wm-rogue-shop")[0]?.parentNode?.classList?.contains("wm-rogue-stage"), true, "商店面板挂在居中层里");
	assertEqual(nodesWithClass("wm-rogue-shop-card").length, cfg.SKILL_OFFER_COUNT, "技能卡数");
	assertEqual(nodesWithClass("wm-rogue-stat-card").length, cfg.STAT_IDS.length, "属性卡数");
	assertEqual(nodesWithClass("wm-rogue-res-cell").length, 3, "资源块三块");
	const text = screenText();
	assert(text.includes("技能商店") && text.includes("属性强化"), `两个分区标题：${text}`);
	assertEqual(nodesWithClass("wm-rogue-res-num").map(node => textOf(node)).join(","), "1000,0,0/3", "资源数字（技能格只报装备数）");
	assertEqual(nodesWithClass("wm-rogue-res-label").map(node => textOf(node)).join(","), "金币,经验,技能", "闯关资源标签：技能栏本身就是全部持有，不写背包");
	// 买得起的候选：按钮只写动作，价格只写在价格行
	assertEqual(textOf(nodesWithClass("wm-rogue-shop-buy")[0]), "购买", "购买按钮只写「购买」");
	assert(/^\d+ 金币$/.test(textOf(nodesWithClass("wm-rogue-shop-price")[0])), `价格行应是「N 金币」：${textOf(nodesWithClass("wm-rogue-shop-price")[0])}`);
	// 返回固定在标题栏里，不用滚到底找
	const back = nodesWithClass("wm-rogue-back")[0];
	assert(back, "应有返回");
	assertEqual(back.parentNode?.classList?.contains("wm-rogue-titlebar"), true, "返回固定在标题栏");
	// 价格在生成候选时定死：基准价 50 ±25% 后 floor（37~62），闯关与关卡无关，重进商店 / 刷新 UI 都不会重掷
	const prices = saved.shopOffers.map(offer => offer.price);
	assert(prices.every(price => price >= 37 && price <= 62), `售价应在 37~62：${prices.join(",")}`);
	click("返回");
	click("商店");
	assertEqual(
		lib.storage.rogueSlots[0].shopOffers.map(offer => offer.price).join(","),
		prices.join(","),
		"重进商店不重新随机价格"
	);
	return `候选 ${saved.shopOffers.map(offer => offer.id).join(",")} 价格 ${prices.join(",")}`;
});

await check("商店：技能卡画出出处头像，无出处的技能不标来源", async () => {
	putRun(0, {
		currentBattle: null,
		currency: { gold: 1000, exp: 0 },
		shopOffers: [
			{ id: "owned_skill", price: 100, sold: false },
			{ id: "rogue_extra", price: 100, sold: false },
		],
	});
	session();
	// 本体的 lib.character 第三项是技能表，这里给一个候选造个出处
	lib.character.出处测试 = [4, "custom", 0, ["owned_skill"], 1];
	click("商店");
	const avatars = nodesWithClass("wm-rogue-shop-avatar");
	assertEqual(avatars.length, 1, "只有有出处的候选画头像");
	assertEqual(avatars[0].__background?.[0], "出处测试", "头像取自出处角色");
	assertEqual(avatars[0].__background?.[1], "character", "用本体的 setBackground 画");
	const text = screenText();
	assert(text.includes("出自 出处测试"), `写出出处：${text}`);
	assert(!text.includes("肉鸽专属技能"), "「肉鸽专属技能」标注已删除");
	const ownerLines = nodesWithClass("wm-rogue-shop-owner").map(node => textOf(node));
	assertEqual(ownerLines.length, 1, "无出处候选不画出处行");
	const names = nodesWithClass("wm-rogue-shop-name").map(node => textOf(node));
	assertEqual(names.length, 2, "每张卡一个技能名");
	return `头像 ${avatars[0].__background[0]} / ${names.join("、")}`;
});

await check("商店：点技能卡弹完整描述，点购买按钮不会顺带弹出", async () => {
	putRun(0, {
		currentBattle: null,
		currency: { gold: 1000, exp: 0 },
		shopOffers: [{ id: "rogue_extra", price: 10, sold: false }],
	});
	session();
	click("商店");
	clickNode(nodesWithClass("wm-rogue-shop-card")[0]);
	assertEqual(nodesWithClass("wm-rogue-popup").length, 1, "点卡片应弹出完整描述");
	assert(screenText().includes("测试用技能。"), "弹层里是完整描述");
	nodesWithClass("wm-rogue-popup")[0].remove();
	// 购买按钮的点击要阻止冒泡，只买东西、不弹描述
	clickNode(nodesWithClass("wm-rogue-shop-buy")[0]);
	await flush();
	assertEqual(nodesWithClass("wm-rogue-popup").length, 0, "购买按钮不应连带打开描述");
	// 闯关（旧版机制）：技能栏未满时购买直接获得，没有背包这一层
	assert(lib.storage.rogueSlots[0].skills.includes("rogue_extra"), "闯关购买直接进技能栏");
	assertEqual(lib.storage.rogueSlots[0].skills.length, 1, "未满时直接获得");
	return "描述弹层 + 按钮不冒泡";
});

await check("商店：不随机到角色原生技能，替换掉的技能可以再出现", async () => {
	const skillsData = await load("src/rogue/data/skills.js");
	const poolIds = skillsData.pool.map(item => item.id);
	const onlyCandidate = poolIds[poolIds.length - 1];
	const owned = poolIds[0];
	const native = poolIds[1];
	putRun(0, {
		characterId: "导航测试",
		level: 1,
		currentBattle: null,
		shopOffers: [],
		currency: { gold: 100, exp: 0 },
		skills: [],
	});
	session();
	// 把角色的原生技能设成「除最后一个池子技能外的全部」：候选只剩一个，结果才可断言
	lib.character["导航测试"] = [4, "custom", 0, poolIds.filter(id => id !== onlyCandidate), 1];
	click("商店");
	const offers = lib.storage.rogueSlots[0].shopOffers;
	assertEqual(offers.length, 1, "排除角色原生技能后只剩一个候选");
	assertEqual(offers[0].id, onlyCandidate, "不在当前持有里的技能可以正常出现");
	assert(!offers.some(offer => offer.id !== onlyCandidate), "不得随机到角色原生技能");
	// 当前持有的会被排除，角色原生技能也继续排除，其余池子照常给满候选
	// characterId 要显式带上：putRun 不带 extra 时是从零新建，漏了就会退回默认的「迪迦」，原生技能那条断言就成了摆设
	putRun(0, { characterId: "导航测试", shopOffers: [], skills: [owned] });
	session();
	lib.character["导航测试"] = [4, "custom", 0, [native], 1];
	click("商店");
	const again = lib.storage.rogueSlots[0].shopOffers;
	assert(!again.some(offer => offer.id === owned), "当前持有的技能不该上架");
	assert(!again.some(offer => offer.id === native), "角色原生技能不该上架");
	assertEqual(again.length, cfg.SKILL_OFFER_COUNT, "其余池子照常给满候选");
	return `只剩 ${offers[0].id} / 持有与原生都排除`;
});

await check("商店：候选池并上全体武将技能，禁用过的武将不上架", async () => {
	const skillsData = await load("src/rogue/data/skills.js");
	const poolIds = skillsData.pool.map(item => item.id);
	putRun(0, {
		characterId: "导航测试",
		level: 1,
		currentBattle: null,
		shopOffers: [],
		currency: { gold: 100, exp: 0 },
		skills: [],
	});
	session();
	// 让当前角色自带整个作者清单：候选只剩「武将技能」这一路，才能把接线本身断言死
	lib.character["导航测试"] = [4, "custom", 0, poolIds, 1];
	// 池甲没被禁用、池乙被玩家禁在身份局下（本体的禁将名单按模式分开存）
	lib.skill.pool_wai = {};
	lib.translate.pool_wai = "外来";
	lib.translate.pool_wai_info = "作者清单之外的武将技能。";
	lib.skill.pool_jin = {};
	lib.translate.pool_jin = "禁用";
	lib.translate.pool_jin_info = "被禁用武将的技能。";
	lib.character["池甲"] = [4, "male", "shu", ["pool_wai"], 1];
	lib.character["池乙"] = [4, "male", "shu", ["pool_jin"], 1];
	// 真机上 lib.config.all.mode 里本来就有各官方模式，禁将名单就按模式分开存在它们名下
	lib.config.all.mode.push("identity");
	lib.config.identity_banned = ["池乙"];
	try {
		click("商店");
		const offers = lib.storage.rogueSlots[0].shopOffers;
		assertEqual(offers.map(offer => offer.id).join(","), "pool_wai", "清单外武将的技能进池，禁用武将的技能不进池");
		const text = screenText();
		assert(text.includes("外来"), `技能名要按本体翻译显示：${text}`);
		assert(text.includes("出自 池甲"), "卡片要标出武将出处");
		assert(!text.includes("禁用"), "禁用武将的技能不该出现在商店里");
		return "外来 进池 / 池乙 被排除";
	} finally {
		lib.config.all.mode = lib.config.all.mode.filter(mode => mode !== "identity");
		delete lib.config.identity_banned;
	}
});

await check("商店：购买一个后本次不能再买第二个", async () => {
	putRun(0, {
		currentBattle: null,
		currency: { gold: 1000, exp: 0 },
		shopOffers: [
			{ id: "rogue_extra", price: 10, sold: false },
			{ id: "own_one", price: 10, sold: false },
			{ id: "own_two", price: 10, sold: false },
		],
	});
	session();
	click("商店");
	const overlay = common.currentScreenNode();
	clickNode(nodesWithClass("wm-rogue-shop-buy")[0]);
	await flush();
	assertEqual(common.currentScreenNode(), overlay, "购买不重开窗口");
	assert(screenText().includes("已购买"), `已购买原位显示：${screenText()}`);
	const after = lib.storage.rogueSlots[0];
	assertEqual(after.shopOffers.filter(offer => offer.sold).length, 1, "只标记一项已购");
	assertEqual(after.currency.gold, 990, "扣款落盘");
	assert(after.skills.includes("rogue_extra"), "闯关购买直接进技能栏（未满）");
	assertEqual(after.skills.length, 1, "购买即获得一个技能");
	putRun(0, { currency: { gold: 9999, exp: 0 } }, after);
	session();
	click("商店");
	const text = screenText();
	assert(text.includes("已购买") && text.includes("本次商店已售罄"), `其余候选应不可再买：${text}`);
	putRun(0, { currency: { gold: 0, exp: 0 } }, after);
	session();
	click("商店");
	assert(screenText().includes("金币不足"), "余额不足显示在购买按钮上");
	return "买到 rogue_extra";
});

await check("商店刷新：标题右侧按钮，点一次重掷技能与价格、次数 -1 并立即落盘", async () => {
	putRun(0, {
		currentBattle: null,
		level: 1,
		skills: [],
		currency: { gold: 9999, exp: 0 },
		shopOffers: [
			{ id: "own_one", price: 4, sold: false },
			{ id: "own_two", price: 5, sold: false },
			{ id: "own_three", price: 6, sold: false },
		],
		shopRefreshesRemaining: cfg.SKILL_REFRESH_PER_LEVEL,
	});
	session();
	click("商店");
	const overlay = common.currentScreenNode();
	// 按钮属于「技能商店」这一分区：与标题同一个行容器，不放页面顶部也不跟返回挤在一起
	const refresh = nodesWithClass("wm-rogue-shop-refresh")[0];
	assert(refresh, "应有刷新按钮");
	assertEqual(refresh.parentNode, nodesWithClass("wm-rogue-shop-section-title")[0].parentNode, "刷新按钮与「技能商店」标题同一行");
	assertEqual(textOf(refresh), `刷新 ${cfg.SKILL_REFRESH_PER_LEVEL}/${cfg.SKILL_REFRESH_PER_LEVEL}`, "初始显示剩余/总次数");
	const before = lib.storage.rogueSlots[0].shopOffers.map(offer => `${offer.id}:${offer.price}`).join(",");
	clickNode(refresh);
	await flush();
	const after = lib.storage.rogueSlots[0];
	assertEqual(after.shopRefreshesRemaining, 1, "点一次扣一次，且已落盘");
	assertEqual(textOf(nodesWithClass("wm-rogue-shop-refresh")[0]), "刷新 1/2", "原位更新次数");
	assertEqual(common.currentScreenNode(), overlay, "原位刷新，不重开商店（重开会丢滚动位置）");
	const rolled = after.shopOffers.map(offer => `${offer.id}:${offer.price}`).join(",");
	assert(rolled !== before, `候选与价格应整体重掷：${before} → ${rolled}`);
	assert(!after.shopOffers.some(offer => ["own_one", "own_two", "own_three"].includes(offer.id)), "池子够时不该原样抽到旧候选");
	assertEqual(after.shopOffers.length, cfg.SKILL_OFFER_COUNT, "仍给满三项");
	assertEqual(nodesWithClass("wm-rogue-shop-card").length, cfg.SKILL_OFFER_COUNT, "卡片跟着候选重建");
	assertEqual(nodesWithClass("wm-rogue-shop-name").length, cfg.SKILL_OFFER_COUNT, "每张卡一个技能名");
	// 重载存档：候选、定死的价格与剩余次数都按落盘的来，不再重掷
	putRun(0, { currency: { gold: 9999, exp: 0 } }, after);
	session();
	click("商店");
	assertEqual(lib.storage.rogueSlots[0].shopOffers.map(offer => `${offer.id}:${offer.price}`).join(","), rolled, "重载后候选与价格原样");
	assertEqual(textOf(nodesWithClass("wm-rogue-shop-refresh")[0]), "刷新 1/2", "重载后次数不补回");
	clickNode(nodesWithClass("wm-rogue-shop-refresh")[0]);
	await flush();
	assertEqual(lib.storage.rogueSlots[0].shopRefreshesRemaining, 0, "第二次刷完归零");
	const exhausted = nodesWithClass("wm-rogue-shop-refresh")[0];
	assertEqual(textOf(exhausted), "刷新 0/2", "用完仍显示 0/2（灰掉而不是藏起来）");
	assert(exhausted.classList.contains("wm-rogue-disabled"), "用完应置灰");
	const frozen = lib.storage.rogueSlots[0].shopOffers.map(offer => offer.id).join(",");
	clickNode(exhausted);
	await flush();
	assertEqual(lib.storage.rogueSlots[0].shopOffers.map(offer => offer.id).join(","), frozen, "没有次数时点击不重掷");
	assertEqual(lib.storage.rogueSlots[0].shopRefreshesRemaining, 0, "没有次数时不能再扣");
	assert(screenText().includes("用完"), "要给出提示而不是静默失败");
	nodesWithClass("wm-rogue-popup").forEach(node => node.remove());
	return `重掷 ${rolled} / 次数 2 → 0`;
});

await check("商店刷新：买过技能后按钮变「本局已购买」，点击既不重掷也不补次数", async () => {
	putRun(0, {
		currentBattle: null,
		level: 1,
		skills: [],
		currency: { gold: 9999, exp: 0 },
		shopOffers: [
			{ id: "rogue_extra", price: 10, sold: false },
			{ id: "own_one", price: 10, sold: false },
			{ id: "own_two", price: 10, sold: false },
		],
		shopRefreshesRemaining: cfg.SKILL_REFRESH_PER_LEVEL,
	});
	session();
	click("商店");
	clickNode(nodesWithClass("wm-rogue-shop-buy")[0]);
	await flush();
	const bought = lib.storage.rogueSlots[0];
	assert(bought.shopOffers.some(offer => offer.sold), "已买一个");
	const refresh = nodesWithClass("wm-rogue-shop-refresh")[0];
	assertEqual(textOf(refresh), "本局已购买", "买过后刷新按钮改成已购买");
	assert(refresh.classList.contains("wm-rogue-disabled"), "买过后刷新按钮置灰");
	// 重掷会把新候选的 sold 全写成 false，所以买过之后必须彻底锁死，否则一局能买两个
	const ids = bought.shopOffers.map(offer => offer.id).join(",");
	clickNode(refresh);
	await flush();
	const now = lib.storage.rogueSlots[0];
	assertEqual(now.shopOffers.map(offer => offer.id).join(","), ids, "点击不重掷");
	assertEqual(now.shopRefreshesRemaining, cfg.SKILL_REFRESH_PER_LEVEL, "被拒时次数一点没扣");
	assert(screenText().includes("已经购买"), "要说明为什么不能刷新");
	nodesWithClass("wm-rogue-popup").forEach(node => node.remove());
	clickNode(nodesWithClass("wm-rogue-shop-buy")[1]);
	await flush();
	assertEqual(lib.storage.rogueSlots[0].skillInventory.length, 1, "本局只能买一个技能");
	return "已购买锁死刷新 + 购买上限未破";
});

await check("商店刷新次数：战斗恢复与失败都不补，通关进下一局才补满", async () => {
	putRun(0, {
		mode: "challenge",
		level: 7,
		totalLevels: cfg.CHALLENGE_TOTAL_LEVELS,
		cleared: false,
		currency: { gold: 100, exp: 100 },
		shopOffers: [],
		shopRefreshesRemaining: cfg.SKILL_REFRESH_PER_LEVEL,
	});
	session();
	click("商店");
	clickNode(nodesWithClass("wm-rogue-shop-refresh")[0]);
	await flush();
	assertEqual(lib.storage.rogueSlots[0].shopRefreshesRemaining, 1, "这一局用掉一次");
	click("返回");
	clickNormalBattle();
	await flush();
	// 战斗中途刷新页面：这一局还没结束，次数必须原样
	session();
	click("重新挑战这一关");
	await flush();
	assertEqual(lib.storage.rogueSlots[0].shopRefreshesRemaining, 1, "恢复战斗不补次数");
	// 这一关打输：仍是第 7 局，次数不能变成 2（否则靠反复失败白刷商店）
	game.me.__alive = false;
	game.me.hp = 0;
	lib.element.player.dieAfter.call(game.me);
	const lost = lib.storage.rogueSlots[0];
	assertEqual(lost.level, 7, "失败关卡不后退");
	assertEqual(lost.shopRefreshesRemaining, 1, "失败不补次数");
	session();
	click("商店");
	assertEqual(textOf(nodesWithClass("wm-rogue-shop-refresh")[0]), "刷新 1/2", "失败后进商店仍显示用掉一次");
	click("返回");
	clickNormalBattle();
	await flush();
	for (const player of game.players.slice(1)) {
		player.__alive = false;
	}
	lib.element.player.dieAfter.call(game.players[1]);
	const won = lib.storage.rogueSlots[0];
	assertEqual(won.level, 8, "通关进入第 8 局");
	assertEqual(won.shopOffers.length, 0, "候选清空，下次进店重掷");
	assertEqual(won.shopRefreshesRemaining, cfg.SKILL_REFRESH_PER_LEVEL, "只有通关才补满次数");
	session();
	click("商店");
	assertEqual(textOf(nodesWithClass("wm-rogue-shop-refresh")[0]), `刷新 ${cfg.SKILL_REFRESH_PER_LEVEL}/${cfg.SKILL_REFRESH_PER_LEVEL}`, "新一局按钮回到满次数");
	return "恢复/失败保持 1，通关补满";
});

await check("无尽满槽购买：直接进背包、绝不弹替换页，装备一个都不动，资源块口径同步", async () => {
	putRun(0, {
		mode: "endless",
		skills: ["own_one", "own_two", "own_three"],
		skillInventory: ["own_one", "own_two", "own_three"],
		shopOffers: [{ id: "rogue_extra", price: 10, sold: false }],
		currency: { gold: 500, exp: 0 },
		currentBattle: null,
	});
	session();
	click("商店");
	clickNode(nodesWithClass("wm-rogue-shop-buy")[0]);
	await flush();
	// v14：购买不再替换——不弹替换页，直接成交
	assertEqual(nodesWithClass("wm-rogue-replace-overlay").length, 0, "满槽购买不该弹替换页");
	const text = screenText();
	assert(text.includes("已购买"), `原位标已购买：${text.slice(0, 200)}`);
	const after = lib.storage.rogueSlots[0];
	assertEqual(JSON.stringify(after.skills), JSON.stringify(["own_one", "own_two", "own_three"]), "装备三个一个不动");
	assertEqual(JSON.stringify(after.skillInventory), JSON.stringify(["own_one", "own_two", "own_three", "rogue_extra"]), "新技能进背包");
	assertEqual(after.currency.gold, 490, "照常扣款");
	// 资源块同步：第三块数字只报装备数，总持有量写在标签里（3/3 不再是「一共只有 3 个」）
	assertEqual(textOf(nodesWithClass("wm-rogue-res-num")[2]), "3/3", "资源块数字 = 装备数");
	assertEqual(textOf(nodesWithClass("wm-rogue-res-label")[2]), "技能·背包 1", "标签写清背包数量（总持有 4 个）");
	// 战斗只挂装备中的三个：背包里刚买的那个不参战
	click("返回");
	click("开始下一关");
	await flush();
	for (const id of ["own_one", "own_two", "own_three"]) {
		assert(game.me.__skills.includes(id), `装备中的技能参战：${id}`);
	}
	assert(!game.me.__skills.includes("rogue_extra"), "背包里没装备的技能不得自动挂进战斗");
	return "满槽购买进背包 + 资源块口径 + 参战集合";
});

await check("技能管理页（无尽）：超长描述与 poptip 都不撑爆页面、不漏原始标签，卡片与技能商店同一条版式", async () => {
	putRun(0, {
		mode: "endless",
		skills: ["own_long", "own_poptip", "own_one"],
		skillInventory: ["own_long", "own_poptip", "own_one", "own_two"],
		shopOffers: [{ id: "rogue_extra", price: 10, sold: false }],
		currency: { gold: 500, exp: 0 },
		currentBattle: null,
	});
	session();
	// 会话会重置翻译，这两个夹具要在 session() 之后再塞
	lib.translate.own_long = `很长<hr>${"很长很长的技能描述。".repeat(40)}`;
	lib.translate.own_poptip = '带牌<hr>你造成的<noname-poptip poptip="sha"></noname-poptip>伤害+1。';
	click("商店");
	clickNode(nodesWithClass("wm-rogue-res-skill")[0]);
	const text = screenText();
	assertEqual(nodesWithClass("wm-rogue-shop-card").length, 4, "三张装备卡 + 一张背包卡，长描述不会把别的卡片挤掉");
	assert(!text.includes("<noname-poptip"), `不得泄漏原始标签：${text.slice(0, 200)}`);
	assert(text.includes("很长很长的技能描述"), "长描述文本照常进 DOM（限高在 CSS 层）");
	// 与技能商店同一条版式：描述走 .wm-rogue-shop-desc 自己的限高，不再有「完整描述」撑高卡片的版本
	assertEqual(nodesWithClass("wm-rogue-shop-desc").length, 4, "四张卡的描述都是商店那一条 rule");
	assertEqual(nodesWithClass("wm-rogue-desc-full").length, 0, "不再用不限高的完整描述版式");
	// 完整文本照商店的交互看：点卡片弹层（装备/卸下的按钮点击阻止冒泡，不会连带打开）
	clickNode(nodesWithClass("wm-rogue-shop-card")[0]);
	assertEqual(nodesWithClass("wm-rogue-popup").length, 1, "点卡片应弹完整描述");
	assert(screenText().includes("很长很长的技能描述"), "弹层里是完整描述");
	nodesWithClass("wm-rogue-popup")[0].remove();
	clickNode(nodesWithClass("wm-rogue-skill-btn")[0]);
	await flush();
	assertEqual(nodesWithClass("wm-rogue-popup").length, 0, "动作按钮不应连带打开描述");
	assert(!lib.storage.rogueSlots[0].skills.includes("own_long"), "卸下照常生效，卡片级点开弹层没有挡住按钮动作");
	click("返回");
	await flush();
	assert(screenText().includes("技能商店"), "返回应回到商店");
	return "长描述 + poptip（管理页与商店同版式）";
});

await check("属性卡：三项且防御把体力上限一起算，不得多出「体力」卡", async () => {
	putRun(0, {
		stats: { defense: 3, draw: 0, attack: 0 },
		currency: { gold: 0, exp: 0 },
		shopOffers: [],
		currentBattle: null,
	});
	session();
	click("商店");
	assertEqual(nodesWithClass("wm-rogue-stat-name").map(node => textOf(node)).join(","), "防御,过牌,攻击", "只有三项属性");
	const text = screenText();
	assert(text.includes("Lv.3/10"), `防御等级：${text}`);
	assert(text.includes("初始护甲 +2") && text.includes("体力上限 +1"), "防御的累计效果要一起列出");
	assert(text.includes("暂无加成"), "其他两项没加成");
	return "防御含体力上限";
});

await check("局内属性弹层：标题独立置顶、真实 Lv.10 效果，点框外退出（无关闭按钮）", async () => {
	common.showBattleStats({ stats: { defense: 10, draw: 8, attack: 10 } });
	const overlay = common.currentScreenNode();
	const panel = nodesWithClass("wm-rogue-stat-panel")[0];
	assert(overlay?.classList.contains("wm-rogue-stat-overlay"), "属性详情应使用 Rogue 专属浮层");
	assert(panel, "应存在属性详情面板");
	assertEqual(panel.children[0].classList.contains("wm-rogue-stat-title"), true, "标题必须是面板第一项");
	assertEqual(panel.children[1].classList.contains("wm-rogue-stat-divider"), true, "标题后应有独立分隔线");
	assertEqual(panel.children[2].classList.contains("wm-rogue-stat-body"), true, "正文要与标题分家，才能只滚正文");
	const body = panel.children[2];
	assertEqual(body.children[0].classList.contains("wm-rogue-stat-detail"), true, "第一个属性挂在正文条里，不与标题同行");
	const text = screenText();
	assert(text.includes("攻击 Lv.10") && text.includes("100%") && text.includes("出【杀】次数 +5"), "攻击 Lv.10 文案应真实显示");
	assert(text.includes("防御 Lv.10") && text.includes("体力上限 +5") && !text.includes("体力上限 +9"), "防御 Lv.10 文案应真实显示");
	// 没有「关闭」按钮：点面板内不关、点框外的遮罩空白处直接退出
	assert(!text.includes("关闭"), "不再依赖「关闭」按钮");
	const tapOverlay = target => overlay.__listeners[0]({ target });
	tapOverlay(panel);
	assertEqual(common.currentScreenNode(), overlay, "点面板内不应关闭");
	tapOverlay(overlay);
	assertEqual(common.currentScreenNode(), null, "点框外应直接退出");
	return "无关闭按钮，点框外退出";
});

await check("奇物面板：几十件也只滚正文条，标题与分组头留在原位", async () => {
	// 七件奇物全带上，模拟「以后有几十件」时的样子
	common.showBattleCurios({
		curios: ["broken_watch", "lucky_stone", "breath_belt", "energy_core", "leftover_rice", "loop_button", "cursed_coin"],
		curioQuality: { energy_core: "epic" },
	});
	const overlay = common.currentScreenNode();
	const panel = nodesWithClass("wm-rogue-stat-panel")[0];
	assertEqual(panel.children[0].classList.contains("wm-rogue-stat-title"), true, "标题必须是面板第一项（滚不走的只有它和分隔线）");
	const body = nodesWithClass("wm-rogue-stat-body")[0];
	assert(body, "面板要有独立的正文条");
	assertEqual(body.parentNode, panel, "正文条挂在面板里");
	const detailIn = nodes => nodes.filter(node => node.parentNode === body).length;
	assertEqual(detailIn(nodesWithClass("wm-rogue-stat-detail")), 7, "七件奇物都挂在正文条里");
	assertEqual(detailIn(nodesWithClass("wm-rogue-stat-title")), 0, "标题不在正文条里");
	assertEqual(detailIn(nodesWithClass("wm-rogue-stat-divider")), 0, "分隔线不在正文条里");
	assertEqual(detailIn(nodesWithClass("wm-rogue-stat-section-title")), 2, "两个分组头跟着正文一起滚");
	// 滚动条只可能是正文条：面板与标题都不是滚动容器（这里只能验结构，滚动本身要真机看）
	assertEqual(nodesWithClass("wm-rogue-stat-body").length, 1, "面板只有一个滚动容器");
	common.closeScreen();
	return "七件全在正文条里";
});

await check("属性升级：受最大等级与价格约束，成功即落盘", async () => {
	statsData.stats.defense.price = [10];
	putRun(0, { stats: { defense: 0, draw: 0, attack: 0 }, currency: { gold: 30, exp: 30 }, shopOffers: [], currentBattle: null });
	session();
	click("商店");
	const overlay = common.currentScreenNode();
	clickNode(nodesWithClass("wm-rogue-stat-up")[0]);
	assertEqual(common.currentScreenNode(), overlay, "升级不重开窗口");
	assertEqual(textOf(nodesWithClass("wm-rogue-stat-level")[0]), "Lv.1/10", "等级原位更新");
	assertEqual(lib.storage.rogueSlots[0].stats.defense, 1, "升到 1 级");
	assertEqual(lib.storage.rogueSlots[0].currency.exp, 20, "扣款");
	clickNode(nodesWithClass("wm-rogue-stat-up")[0]);
	assertEqual(lib.storage.rogueSlots[0].stats.defense, 2, "再升一级");
	const maxed = lib.storage.rogueSlots[0];
	putRun(0, { stats: { ...maxed.stats, defense: statsData.stats.defense.maxLevel } }, maxed);
	session();
	click("商店");
	assert(screenText().includes("已达最高等级"), "满级应说明原因");
	assert(screenText().includes("已满级"), "满级时按钮也写明");
	putRun(0, { stats: { defense: 0, draw: 0, attack: 0 }, currency: { gold: 30, exp: 1 } }, maxed);
	session();
	click("商店");
	const text = screenText();
	assert(text.includes("经验不足") && text.includes("（持有 1）"), `余额不足写在价格与按钮上：${text}`);
	statsData.stats.defense.price = [];
	return "上限/扣款/提示";
});

await check("失败惩罚：闯关按比例扣货币且关卡不后退", async () => {
	putRun(0, {
		mode: "challenge",
		level: 7,
		totalLevels: cfg.CHALLENGE_TOTAL_LEVELS,
		cleared: false,
		currency: { gold: 100, exp: 100 },
		currentBattle: { groupId: "group_zofer", status: "battle" },
		shopOffers: [],
	});
	session();
	click("重新挑战这一关");
	await flush();
	game.me.__alive = false;
	game.me.hp = 0;
	lib.element.player.dieAfter.call(game.me);
	const after = lib.storage.rogueSlots[0];
	assertEqual(after.level, 7, "关卡不后退");
	assertEqual(after.currency.gold, 50, "金币按 50% 损失");
	assertEqual(after.currentBattle, null, "战斗标记清除");
	const text = screenText();
	assert(text.includes("战斗失败") && text.includes("重新挑战"), `应显示失败页：${text}`);
	return `100 → ${after.currency.gold}`;
});

await check("货币不足 fallback：玩家可选失去技能", async () => {
	putRun(0, {
		mode: "challenge",
		level: 3,
		currency: { gold: 0, exp: 0 },
		skills: ["rogue_extra"],
		stats: { defense: 1, draw: 0, attack: 0 },
		currentBattle: { groupId: "group_zofer", status: "battle" },
		shopOffers: [],
	});
	session();
	click("重新挑战这一关");
	await flush();
	game.me.__alive = false;
	game.me.hp = 0;
	lib.element.player.dieAfter.call(game.me);
	const text = screenText();
	assert(text.includes("选择一项承担"), `应进入惩罚选择页：${text}`);
	assert(text.includes("属性等级 -1"), "应给出属性降级选项");
	// 闯关的候选就是技能栏本身（没有背包）：逐条列出，不另标「已装备」
	assert(text.includes("额外"), `技能栏里的技能要列出来：${text}`);
	assert(!text.includes("额外（已装备）"), "闯关没有背包，不给技能栏条目加「已装备」标注");
	click("额外");
	const after = lib.storage.rogueSlots[0];
	assert(!after.skills.includes("rogue_extra"), "技能已失去（装备位同步解除）");
	assert(!after.skillInventory.includes("rogue_extra"), "背包里也一并删除");
	assertEqual(after.stats.defense, 1, "属性未被连带扣除");
	return "失去技能（按完整背包出候选）";
});

await check("fallback：无技能且属性全 0 时不惩罚、不卡死", async () => {
	putRun(0, {
		mode: "challenge",
		level: 3,
		currency: { gold: 0, exp: 0 },
		skills: [],
		stats: { defense: 0, draw: 0, attack: 0 },
		currentBattle: { groupId: "group_zofer", status: "battle" },
		shopOffers: [],
	});
	session();
	click("重新挑战这一关");
	await flush();
	game.me.__alive = false;
	game.me.hp = 0;
	lib.element.player.dieAfter.call(game.me);
	const text = screenText();
	assert(text.includes("不额外扣除"), `应给出无惩罚说明：${text}`);
	assertEqual(lib.storage.rogueSlots[0].level, 3, "关卡不变");
	return "无东西可扣时不卡死";
});

await check("无尽失败：整个存档删除且槽位恢复为空", async () => {
	putRun(1, {
		mode: "endless",
		level: 12,
		totalLevels: 0,
		currency: { gold: 900, exp: 900 },
		skills: ["rogue_extra"],
		stats: { defense: 2, draw: 2, attack: 2 },
		currentBattle: { groupId: "group_zofer", status: "battle" },
	}, stateModule.createRun("endless", "迪迦", 1));
	session();
	click("重新挑战这一关");
	await flush();
	game.me.__alive = false;
	game.me.hp = 0;
	lib.element.player.dieAfter.call(game.me);
	assertEqual(lib.storage.rogueSlots[1], null, "整槽清空");
	assertEqual(lib.storage.rogueActive, -1, "不再记住该槽位");
	assert(screenText().includes("已整个删除"), "应说明删档");
	assert(screenText().includes("无尽历史最高记录不受影响"), "应说明最高记录仍在");
	click("返回存档页");
	assert(log.some(item => item.type === "reload"), "应重载");
	assertEqual(globalThis.localStorage.getItem(`${lib.configprefix}directstart`), null, "删档后不该直开本模式");
	return "删档 + 回存档页";
});

await check("存档页删除：确认框取消不删、确认才删", async () => {
	lib.storage.rogueSlots = [stateModule.createRun("challenge", "迪迦", 1), null, null, null, null, null];
	lib.storage.rogueActive = -1;
	session();
	click("删除");
	assert(screenText().includes("此操作不可撤销"), "应先弹确认框");
	assert(lib.storage.rogueSlots[0] !== null, "弹确认框时不应已删除");
	click("取消");
	assert(lib.storage.rogueSlots[0] !== null, "取消后仍在");
	click("删除");
	click("确认删除");
	assertEqual(lib.storage.rogueSlots[0], null, "确认后才删除");
	return "确认框删除";
});

await check("脏存档：修复并提示，而不是崩溃", async () => {
	lib.storage.rogueSlots = [
		{ version: cfg.RUN_VERSION + 9, mode: "challenge" },
		"junk",
		{ level: "abc", currency: "x", skills: 3 },
	];
	lib.storage.rogueActive = -1;
	session();
	const notice = screenText();
	assert(notice.includes("存档读取提示"), `应先给出提示：${notice}`);
	click("确定");
	const text = screenText();
	assertEqual((text.match(/空存档/g) ?? []).length, cfg.SLOT_COUNT, `确认后应渲染 6 个空槽：${text}`);
	return "提示 + 渲染 6 槽";
});

await check("退出肉鸽模式：不落 directstart，回到游戏初始界面，存档保留", async () => {
	freshWorld();
	session();
	await newRunByUi("无尽模式");
	// 本体 game.reload() 会顺手写上的标记：退出时必须清掉，否则下次启动不会显示初始界面
	globalThis.localStorage.setItem("show_splash_off", "true");
	click("退出肉鸽模式");
	assert(log.some(item => item.type === "reload"), "应重载");
	assertEqual(globalThis.localStorage.getItem(`${lib.configprefix}directstart`), null, "退出不应直开本模式");
	assertEqual(globalThis.localStorage.getItem("show_splash_off"), null, "退出应清掉 show_splash_off（回初始界面）");
	assertEqual(lib.storage.rogueActive, -1, "退出应清除当前槽位");
	assert(lib.storage.rogueSlots[0] !== null, "退出不得删除进行中的存档");
	return "存档保留 + 回初始界面";
});

await check("存档页返回：同样回到游戏初始界面", async () => {
	freshWorld();
	lib.storage.rogueSlots = [stateModule.createRun("challenge", "迪迦", 1), null, null, null, null, null];
	lib.storage.rogueActive = -1;
	session();
	assert(screenText().includes("存档记录"), "应停在存档页");
	globalThis.localStorage.setItem(`${lib.configprefix}directstart`, "true");
	globalThis.localStorage.setItem("show_splash_off", "true");
	const before = log.length;
	click("返回");
	assert(log.slice(before).some(item => item.type === "reload"), "应重载");
	assertEqual(globalThis.localStorage.getItem(`${lib.configprefix}directstart`), null, "初始界面不该直开本模式");
	assertEqual(globalThis.localStorage.getItem("show_splash_off"), null, "应清掉 show_splash_off");
	assertEqual(lib.storage.rogueActive, -1, "应清除当前槽位");
	assert(lib.storage.rogueSlots[0] !== null, "存档保留");
	return "存档页返回 = 回初始界面";
});

await check("敌人配置缺失：给出提示而不是崩溃或空局", async () => {
	putRun(0, {
		currentBattle: {
			status: "battle",
			enemies: [{ characterId: "不存在的角色", stats: { defense: 0, draw: 0, attack: 0 }, skills: [], maxHp: 0, hp: 0 }],
		},
		shopOffers: [],
	});
	session();
	click("重新挑战这一关");
	// 恢复页是自建浮层，报错走浮层内的自建弹层而不是本体对话框
	const popups = nodesWithClass("wm-rogue-popup");
	assertEqual(popups.length, 1, "阵容问题应弹出提示");
	const text = dump(popups[0]);
	assert(text.includes("都不存在"), `应报出阵容问题（闯关前 10 关的恢复也放行禁将、只拦角色不存在）：${text}`);
	assertEqual(lib.storage.rogueSlots[0].currentBattle, null, "应清除无效的战斗标记");
	return "阵容错误可见";
});

await check("大厅 BGM：进大厅循环播、换页面与删档都不打断、进战斗停止并由战斗 BGM 接手覆盖", async () => {
	freshWorld();
	putRun(0, {});
	putRun(1, {});
	lib.storage.rogueActive = 0;
	// 页面加载时本体自己的 BGM 通常在放
	ui.backgroundMusic.paused = false;
	ui.backgroundMusic.currentTime = 7;
	ui.backgroundMusic.volume = 1;
	session();
	// 战斗 BGM 也是 audio（此前的用例已建过），按曲目定位大厅这一份，不能只取最后一个
	const audio = stub.createdAudios.find(node => node !== ui.backgroundMusic && node.src === cfg.LOBBY_BGM);
	assert(audio, "进营地应建出本模式的 BGM 元素");
	assertEqual(audio.src, cfg.LOBBY_BGM, "BGM 文件");
	assertEqual(audio.loop, true, "要循环播放");
	assert(!audio.paused, "营地应在播放");
	await flush();
	assertEqual(ui.backgroundMusic.volume, 0, "大厅期间要把本体 BGM 静音，避免两首曲子叠放");
	// 营地 → 存档页：接着放，不重头
	audio.currentTime = 42;
	click("返回存档");
	assertEqual(audio.currentTime, 42, "从营地回存档页不该把曲子掐回开头");
	assert(!audio.paused, "回存档页后仍在播放");
	// 删档：原地重绘，同样不打断（曾把曲子掐回开头）
	click("删除");
	click("确认删除");
	assertEqual(lib.storage.rogueSlots[0], null, "应真的删掉存档");
	assertEqual(audio.currentTime, 42, "删档不该把曲子掐回开头");
	assert(!audio.paused, "删档后仍在播放");
	// 再进营地：还是接着放
	click("存档2");
	assertEqual(audio.currentTime, 42, "进营地不该把曲子掐回开头");
	// 进战斗：大厅的停止、战斗 BGM 上场（细节见下一个用例），本体 BGM 继续被压住
	clickNormalBattle();
	await flush();
	assert(audio.paused, "进战斗应停止大厅 BGM");
	const battleAudio = stub.createdAudios.filter(node => node !== ui.backgroundMusic && node !== audio).at(-1);
	assert(battleAudio, "进战斗应有战斗 BGM 元素");
	assert(cfg.BATTLE_BGM_LIST.includes(battleAudio.src), `战斗 BGM 应从候选表随机抽取：${battleAudio.src}`);
	assert(!battleAudio.paused, "战斗 BGM 应在播放");
	assertEqual(ui.backgroundMusic.volume, 0, "战斗期间本体 BGM 继续被压住（由战斗 BGM 覆盖）");
	assert(!ui.backgroundMusic.paused, "本体 BGM 不该被停掉：只是静音");
	assertEqual(ui.backgroundMusic.currentTime, 7, "本体 BGM 保持原进度");
	return audio.src;
});

await check("战斗 BGM：进战斗随机起播、放完随机接下一首，胜利不切断、失败停止并还原音量", async () => {
	freshWorld();
	putRun(0, {});
	// 页面加载时本体自己的 BGM 通常在放
	ui.backgroundMusic.paused = false;
	ui.backgroundMusic.currentTime = 7;
	ui.backgroundMusic.volume = 1;
	session();
	const lobbyAudio = stub.createdAudios.find(node => node !== ui.backgroundMusic && node.src === cfg.LOBBY_BGM);
	assert(lobbyAudio, "进营地应先建出大厅 BGM");
	assert(!lobbyAudio.paused, "大厅 BGM 应在播放");
	clickNormalBattle();
	await flush();
	assert(lobbyAudio.paused, "进战斗应停止大厅 BGM");
	const battleAudio = stub.createdAudios.filter(node => node !== ui.backgroundMusic && node !== lobbyAudio).at(-1);
	assert(battleAudio, "进战斗应有战斗 BGM 元素");
	assert(cfg.BATTLE_BGM_LIST.includes(battleAudio.src), `战斗 BGM 必须从 BATTLE_BGM_LIST 随机抽取：${battleAudio.src}`);
	assertEqual(battleAudio.loop, false, "不再单曲循环：一首放完随机接下一首");
	assert(!battleAudio.paused, "战斗 BGM 应在播放");
	assertEqual(battleAudio.volume, 1, "战斗 BGM 音量走独立设置（缺省 100%）");
	assertEqual(ui.backgroundMusic.volume, 0, "战斗期间本体 BGM 保持静音");
	// 连播：一首放完随机抽下一首，不与刚放完的重复
	const firstFile = battleAudio.src;
	battleAudio.onended?.();
	assert(cfg.BATTLE_BGM_LIST.includes(battleAudio.src), `放完应随机接一首列表里的曲目：${battleAudio.src}`);
	assert(battleAudio.src !== firstFile, `连播不得与刚放完的重复：${firstFile} → ${battleAudio.src}`);
	assert(!battleAudio.paused, "接上的下一首应在播放");
	battleAudio.onended?.();
	assert(!battleAudio.paused, "连播持续进行");
	// 胜利结算：BGM 不切断，一路响过结算页；本体 BGM 仍被压住（等返回营地时的整页重载才收）
	for (const player of game.players.slice(1)) {
		player.__alive = false;
	}
	lib.element.player.dieAfter.call(game.players[1]);
	assert(!battleAudio.paused, "胜利结算不切断战斗 BGM");
	assertEqual(ui.backgroundMusic.volume, 0, "结算期间本体 BGM 仍被压住");
	assert(!ui.backgroundMusic.paused, "本体 BGM 不该被停掉：只是静音");
	return battleAudio.src;
});

await check("技能 BGM：肉鸽营地/战斗中一律拦截，不建新音轨、不打断现有 BGM", async () => {
	// 真机默认开着技能 BGM（config 的 bgm_enabled，init: true）：打开开关，才能证明「没播」是守卫拦下的
	const prevEnabled = lib.config.extension_奥特之星_bgm_enabled;
	const prevMode = lib.config.mode;
	lib.config.extension_奥特之星_bgm_enabled = true;
	// 对齐真机：肉鸽会话里 lib.config.mode 就是模式 id，directstart 重载续玩后仍是它
	lib.config.mode = cfg.MODE_ID;
	try {
		freshWorld();
		putRun(0, {});
		session();
		// arenaReady 时挂的技能 BGM 系统（桩里手动初始化）
		bgmSystem.initBgmSystem();
		// 肉鸽的大厅音轨是模块级单例，跨用例复用同一个元素，按曲目定位而不是取最后一个
		const lobbyAudio = stub.createdAudios.find(node => node !== ui.backgroundMusic && node.src === cfg.LOBBY_BGM);
		assert(lobbyAudio && !lobbyAudio.paused, "营地 BGM 应在播放");
		const inLobby = stub.createdAudios.length;
		game.playSkillBgm("xikali");
		assertEqual(stub.createdAudios.length, inLobby, "营地里不该建出技能音轨");
		assert(!lobbyAudio.paused, "营地 BGM 不该被打断");
		assertEqual(game.customBgmList.length, 0, "技能音轨不得登记进互斥列表");
		// 进战斗：战斗 BGM 接手，技能 BGM 同样不许出声
		clickNormalBattle();
		await flush();
		const battleAudio = stub.createdAudios.filter(node => node !== ui.backgroundMusic && node !== lobbyAudio).at(-1);
		assert(battleAudio && !battleAudio.paused, "战斗 BGM 应在播放");
		assertEqual(ui.backgroundMusic.volume, 0, "本体 BGM 应被战斗 BGM 压住");
		const inBattle = stub.createdAudios.length;
		game.playSkillBgm("xikali");
		assertEqual(stub.createdAudios.length, inBattle, "战斗中不该建出技能音轨");
		assert(!battleAudio.paused, "战斗 BGM 不该被打断");
		assertEqual(game.customBgmList.length, 0, "战斗中技能音轨也不得入列");
		assertEqual(ui.backgroundMusic.volume, 0, "本体 BGM 音量不该被守卫路径还原");
		return "营地与战斗都拦下";
	} finally {
		lib.config.extension_奥特之星_bgm_enabled = prevEnabled;
		lib.config.mode = prevMode;
	}
});

await check("技能 BGM：非肉鸽模式照常播放，原有互斥逻辑不变", () => {
	const prevEnabled = lib.config.extension_奥特之星_bgm_enabled;
	const prevMode = lib.config.mode;
	lib.config.extension_奥特之星_bgm_enabled = true;
	lib.config.mode = "identity";
	try {
		freshWorld();
		bgmSystem.initBgmSystem();
		const before = stub.createdAudios.length;
		game.playSkillBgm("xikali");
		assertEqual(stub.createdAudios.length, before + 1, "普通模式应正常建出技能音轨");
		const audio = stub.createdAudios.at(-1);
		assertEqual(audio.src, "extension/奥特之星/assets/audio/xikali.mp3", "音轨文件");
		assert(!audio.paused, "技能 BGM 应在播放");
		assert(game.customBgmList.includes(audio), "应登记进互斥列表");
		// 原逻辑保留：已有我方 BGM 在放时第二个不叠上去；前一首结束后能再播
		game.playSkillBgm("mks");
		assertEqual(stub.createdAudios.length, before + 1, "已有 BGM 在放时不得叠第二首");
		assertEqual(game.customBgmList.length, 1, "互斥列表不新增");
		audio.onended?.();
		game.playSkillBgm("mks");
		assertEqual(stub.createdAudios.length, before + 2, "前一轨结束后新技能 BGM 可再播");
		return "xikali 正常播放，互斥逻辑保留";
	} finally {
		lib.config.extension_奥特之星_bgm_enabled = prevEnabled;
		lib.config.mode = prevMode;
	}
});

await check("肉鸽 BGM 独立音量：本体调最低不影响、肉鸽 0% 即时静音、与本体互不污染", async () => {
	const prevVolume = lib.config.volumn_background;
	const prevRogue = lib.config.extension_奥特之星_rogue_bgm_volume;
	try {
		// 测试1：本体音乐音量调到最低 0，肉鸽 100% —— 肉鸽照常全量出声
		freshWorld();
		putRun(0, {});
		lib.config.volumn_background = 0;
		lib.config.extension_奥特之星_rogue_bgm_volume = 100;
		session();
		const lobbyAudio = stub.createdAudios.find(node => node !== ui.backgroundMusic && node.src === cfg.LOBBY_BGM);
		assert(lobbyAudio && !lobbyAudio.paused, "营地 BGM 应在播放");
		assertEqual(lobbyAudio.volume, 1, "本体最低（0）时肉鸽仍按自己的 100% 播放");
		clickNormalBattle();
		await flush();
		// 战斗音轨是模块级单例、跨用例复用：按曲目定位（技能 BGM 用例也建过音轨，取最后一个会拿错）
		const battleAudio = stub.createdAudios.find(node => cfg.BATTLE_BGM_LIST.includes(node.src));
		assert(battleAudio && !battleAudio.paused, "战斗 BGM 应在播放");
		assertEqual(battleAudio.volume, 1, "战斗 BGM 同样不理会本体音量");
		// 测试2：肉鸽 0% —— 正在放的音轨即时静音，不用等下一首
		lib.config.extension_奥特之星_rogue_bgm_volume = 0;
		rogueBgm.refreshRogueBgmVolume();
		assertEqual(battleAudio.volume, 0, "肉鸽 0% 应把战斗音轨清零");
		assertEqual(lobbyAudio.volume, 0, "大厅音轨同样清零");
		// 测试3：互不污染——本体设置 2（25%）、肉鸽回 100%：肉鸽音轨只认自己的值；
		// 战斗结束停播时本体 BGM 还原成本体设置（0.25）而不是肉鸽值
		lib.config.volumn_background = 2;
		lib.config.extension_奥特之星_rogue_bgm_volume = 100;
		rogueBgm.refreshRogueBgmVolume();
		assertEqual(battleAudio.volume, 1, "肉鸽音轨不取本体的 0.25");
		// 失败结算：战斗 BGM 停掉并还原本体音量（胜利不切是另一条用例，见「战斗 BGM」）
		game.me.__alive = false;
		game.me.hp = 0;
		lib.element.player.dieAfter.call(game.me);
		assert(battleAudio.paused, "失败结算停止战斗 BGM");
		assertEqual(ui.backgroundMusic.volume, 0.25, "本体 BGM 还原成本体设置（2/8），不是肉鸽值");
		assertEqual(lobbyAudio.volume, 1, "大厅音轨仍是肉鸽自己的音量");
		return "本体 0 不影响 / 肉鸽 0 即时静音 / 失败还原本体 0.25、肉鸽 1.0 各归各";
	} finally {
		lib.config.volumn_background = prevVolume;
		if (prevRogue === undefined) {
			delete lib.config.extension_奥特之星_rogue_bgm_volume;
		} else {
			lib.config.extension_奥特之星_rogue_bgm_volume = prevRogue;
		}
	}
});

// ---------------------------------------------------------------- 无尽模式：事件 / 奇物 / 图鉴

/** 无尽胜利一步到位：开局、杀光敌人、触发结算，返回存档（不点结算页按钮） */
async function winEndlessBattle() {
	await newRunByUi("无尽模式");
	clickNormalBattle();
	await flush();
	for (const player of game.players.slice(1)) {
		player.__alive = false;
	}
	lib.element.player.dieAfter.call(game.players[1]);
}

await check("无尽胜利触发事件：结算页「继续」进事件页，选择后奖励与图鉴落盘并回营地", async () => {
	freshWorld();
	// Math.random 钉在 0：必然触发事件、抽中第一个事件（lost_robot）、预掷取第一段结果
	const originalRandom = Math.random;
	Math.random = () => 0;
	try {
		session();
		await winEndlessBattle();
		const run = lib.storage.rogueSlots[0];
		assertEqual(run.pendingEvent.id, "lost_robot", "胜利即定死事件并落盘");
		assertEqual(JSON.stringify(run.collection.events), JSON.stringify(["lost_robot"]), "图鉴记录已发现事件");
		const text = screenText();
		assert(text.includes("战斗胜利") && text.includes("继续"), `结算页按钮应变「继续」：${text}`);
		click("继续");
		const stage = nodesWithClass("wm-rogue-event")[0];
		assert(stage, "应进入自建浮层事件页");
		const eventText = screenText();
		for (const token of ["废弃机器人", "修复机器人", "拆卸零件", "离开"]) {
			assert(eventText.includes(token), `事件页应显示「${token}」：${eventText}`);
		}
		// 事件大图按 CSS 背景引用占位图
		const art = nodesWithClass("wm-rogue-event-art")[0];
		assert(art.style.backgroundImage.includes("assets/events/lost_robot.png"), `事件图引用：${art.style.backgroundImage}`);
		// 拆卸零件 → 随机奇物（rng=0 → broken_watch）
		click("拆卸零件");
		assertEqual(nodesWithClass("wm-rogue-popup").length, 1, "结算结果走浮层内弹层");
		assert(screenText().includes("获得奇物：破损怀表"), `弹层展示奇物：${screenText()}`);
		click("确定");
		assert(log.some(item => item.type === "reload"), "事件完成应重载回营地");
		const after = lib.storage.rogueSlots[0];
		assertEqual(after.pendingEvent, null, "事件完成清空");
		assertEqual(JSON.stringify(after.curios), JSON.stringify(["broken_watch"]), "奇物入袋");
		assertEqual(JSON.stringify(after.collection.curios), JSON.stringify(["broken_watch"]), "图鉴记录奇物");
		assertEqual(after.currency.gold, cfg.INITIAL_CURRENCY.gold + 50, "拆卸零件不扣金币（金币 = 初始 50 + 胜利 50）");
		// 重载后回营地：查看奇物的入口在商店顶部资源行第四块「奇物 n」
		session();
		const hubText = screenText();
		assert(!hubText.includes("奇物（1）"), "营地不再有奇物栏");
		assert(hubText.includes("图鉴"), "营地应有图鉴入口");
		click("商店");
		assertEqual(nodesWithClass("wm-rogue-res-cell").length, 4, "无尽商店资源行四块（金币/经验/技能/奇物）");
		assertEqual(nodesWithClass("wm-rogue-res-label").map(node => textOf(node)).join(","), "金币,经验,技能·背包 0,奇物", "资源行标签");
		assertEqual(textOf(nodesWithClass("wm-rogue-res-num")[3]), "1", "奇物计数原位显示");
		// 点「奇物 n」进只读查看页
		clickNode(nodesWithClass("wm-rogue-res-curio")[0]);
		const viewText = screenText();
		assert(viewText.includes("奇物（1）"), `查看页标题：${viewText}`);
		assert(viewText.includes("破损怀表"), "查看页列出已拥有奇物");
		click("返回");
		assert(screenText().includes("技能商店"), "返回应回到商店");
		return "事件 → 选择 → 奇物 + 图鉴 → 营地";
	} finally {
		Math.random = originalRandom;
	}
});

await check("Boss 战逐场判定：创建这一场时掷中才换单 Boss（体力×2 + 复制三个角色的技能），中途退出恢复不重掷，胜利金币 20 倍 / 经验 8 倍、奇物商店不再固定刷新、技能自动清算 + 奇物自选", async () => {
	freshWorld();
	const originalRandom = Math.random;
	try {
		Math.random = () => 0;
		session();
		click("空存档");
		click("无尽模式");
		click("迪迦");
		await flush();
		// v12：建局这一刻不再决定 Boss 身份——整局字段已经消失，此刻连一场战斗都还没创建
		assertEqual(lib.storage.rogueSlots[0].bossRun, undefined, "建局不写整局 bossRun");
		assertEqual(lib.storage.rogueSlots[0].currentBattle, null, "建局时还没有进行中的战斗");
		// 给三名「技能来源」角色塞可用技能（定义 + 双键翻译，过兼容层与 skillDisabled）
		lib.character["佐菲"] = { hp: 4, maxHp: 4, skills: ["bossdonor_a"] };
		lib.character["赛文"] = { hp: 4, maxHp: 4, skills: ["bossdonor_b1", "bossdonor_b2"] };
		lib.character["杰克"] = { hp: 4, maxHp: 4, skills: ["bossdonor_c"] };
		for (const id of ["bossdonor_a", "bossdonor_b1", "bossdonor_b2", "bossdonor_c"]) {
			lib.skill[id] = { forced: true, trigger: { player: "phaseDrawBegin2" } };
			lib.translate[id] = id;
			lib.translate[`${id}_info`] = "Boss 冒烟用技能。";
		}
		// 创建这一场时掷中（第一掷 0 < BOSS_RUN_RATE）→ 本场替换为单 Boss 阵容
		clickBossBattle();
		await flush();
		assertEqual(game.players.length, 2, "Boss 战只有 1 名敌人（1 玩家 + 1 Boss）");
		const boss = game.players[1];
		// 桩里各角色基础体力不同（死龙 34、其余 4）：按「该角色基础体力 ×2」相对断言
		assertEqual(boss.maxHp, lib.character[boss.name].maxHp * 2, "Boss 体力 = 角色基础体力 × 2（属性点不参与翻倍）");
		assertEqual(boss.hp, boss.maxHp, "当前体力同步翻倍");
		assertEqual(boss.rogueSide, 1, "阵营仍是敌方");
		for (const id of ["bossdonor_a", "bossdonor_b1", "bossdonor_b2", "bossdonor_c"]) {
			assert(boss.__skills.includes(id), `复制来的技能要真正挂上：${id}`);
		}
		const savedBattle = lib.storage.rogueSlots[0].currentBattle;
		assertEqual(savedBattle.isBossBattle, true, "本场 Boss 身份随阵容一起落盘");
		assertEqual(savedBattle.enemies.length, 1, "阵容随存档定死");
		assertEqual(new Set(Object.values(savedBattle.enemies[0].skillSources ?? {})).size,
			cfg.BOSS_SKILL_DONOR_COUNT, `复制技能来自 ${cfg.BOSS_SKILL_DONOR_COUNT} 个不同角色`);
		assertEqual(savedBattle.enemies.length, 1, "阵容随存档定死");
		assertEqual(savedBattle.enemies[0].boss, true, "boss 标记随阵容落盘");
		assert(savedBattle.enemies[0].abyss.length >= 1, "Boss 自带的深渊强化随阵容落盘");
		assertEqual(lib.storage.rogueSlots[0].bossRun, undefined, "整局字段不存在：Boss 身份只在这一场上");
		// 中途退出重开：走恢复页，沿用存档里已定死的阵容与本场标记，绝不重掷
		const savedEnemies = JSON.stringify(savedBattle.enemies);
		session();
		assert(screenText().includes("战斗未正常结算"), `重进应先落到恢复页：${screenText()}`);
		click("重新挑战这一关");
		await flush();
		const revived = game.players[1];
		assertEqual(game.players.length, 2, "恢复的仍是那一场单 Boss");
		assertEqual(revived.name, boss.name, "恢复不改变敌人");
		assertEqual(JSON.stringify(lib.storage.rogueSlots[0].currentBattle.enemies), savedEnemies, "阵容原样读回，没有重新随机");
		assertEqual(lib.storage.rogueSlots[0].currentBattle.isBossBattle, true, "读档后本场仍是 Boss 战");
		assertEqual(revived.maxHp, lib.character[revived.name].maxHp * 2, "恢复后体力仍按 Boss 规则翻倍，且只翻一次");
		// 胜利（rng 换 0.5：跳过事件判定，其余结算不变）
		Math.random = () => 0.5;
		revived.__alive = false;
		revived.hp = 0;
		lib.element.player.dieAfter.call(revived);
		await flush();
		const won = lib.storage.rogueSlots[0];
		// 无尽第 1 关基准 50 金币 / 20 经验：金币 ×20、经验 ×8（初始 50 金币 + 1000、20 经验 + 160）
		assertEqual(won.currency.gold, cfg.INITIAL_CURRENCY.gold + 50 * cfg.BOSS_REWARD_MULTIPLIER, "胜利金币 = 20 倍基准");
		assertEqual(won.currency.exp, 20 + 20 * cfg.BOSS_EXP_MULTIPLIER, "胜利经验 = 8 倍基准");
		assertEqual(won.level, 2, "关卡照常推进");
		assertEqual(won.currentBattle, null, "战斗标记清理");
		assertEqual(won.curioOffers.length, 0, "Boss 战胜利不再固定刷新奇物商城（rng=0.5 未命中，与普通场同一条概率）");
		const text = screenText();
		assert(text.includes("Boss 战 · 战斗胜利"), `结算页标题：${text}`);
		assert(text.includes("当前没有装备技能可失去") && text.includes("也没有奇物可失去"), `空列表的安全话术（技能与奇物合并在一条里）：${text}`);
		assertEqual(lib.storage.rogueSlots[0].pendingBossPenalty, null, "没东西可失去时不挂待处理惩罚，也不弹选择页");
		// 再来一场：装备着技能、也带着奇物——技能惩罚**当场自动**执行（失去全部装备技能、从背包一并删除），
		// 只剩奇物那一项由玩家自己挑（v14）。存档里已经没有 bossRun 了——本场是不是 Boss 战完全取决于创建它时的判定
		putRun(0, {
			mode: "endless",
			characterId: "迪迦",
			level: 2,
			currency: { gold: 100, exp: 100 },
			skills: ["rogue_extra", "own_one", "own_two"],
			curios: ["energy_core"],
			curioQuality: { energy_core: "rare" },
			// 图鉴里先记上「曾经拥有过」，才能验失去时它不会被抹掉
			collection: { events: [], curios: ["energy_core"] },
		});
		session();
		clickBossBattle();
		await flush();
		assertEqual(lib.storage.rogueSlots[0].currentBattle.isBossBattle, true, "这一场独立掷中 Boss");
		const boss2 = game.players[1];
		boss2.__alive = false;
		boss2.hp = 0;
		lib.element.player.dieAfter.call(boss2);
		await flush();
		const owed = lib.storage.rogueSlots[0];
		// 技能：胜利结算当场清空（装备与背包一起，确实视为失去）；奇物：只挂欠项、等玩家挑
		assertEqual(JSON.stringify(owed.skills), JSON.stringify([]), "Boss 胜利当场失去全部装备技能");
		assertEqual(JSON.stringify(owed.skillInventory), JSON.stringify([]), "被清除的技能同时从背包删除");
		assertEqual(JSON.stringify(owed.pendingBossPenalty), JSON.stringify({ reason: "bossVictory", needSkill: false, needCurio: true }), "待处理欠项只剩奇物那一件");
		assertEqual(JSON.stringify(owed.curios), JSON.stringify(["energy_core"]), "奇物还没失去（等玩家挑）");
		assertEqual(owed.curioQuality.energy_core, "rare", "奇物品质覆盖表原样保留");
		// Boss 胜利直接落在惩罚页：中间那张结算页不再出现（奖励已随 settleVictory 落盘，这里只补一次跳转）
		assert(!screenText().includes("Boss 战 · 战斗胜利"), `不该再有中间的胜利结算页：${screenText()}`);
		const jumpText = screenText();
		// 顶部大标题与固定说明已删除：页面身份由合并后的代价句 + 「失去一件奇物」栏认；
		// 两条旧提示合成一条，页面上只占一个提示位（件数按结算结果现写，不写死）
		assert(jumpText.includes("Boss 战的代价：失去了全部 3 个装备技能，并需要从你的奇物中选择一件失去。"),
			`胜利结算后自动打开惩罚选择页：${jumpText.slice(0, 160)}`);
		assertEqual(jumpText.split("Boss 战的代价").length - 1, 1, "「Boss 战的代价」只剩一条提示，不再重复占位");
		assert(jumpText.includes("已通关第 2 关"), `惩罚页要把刚打赢的关卡带上：${jumpText}`);
		// 本场奖励用临时数据展示（第 2 关基准 70 金币 / 28 经验：×20 与 ×8）
		assertEqual(nodesWithClass("wm-rogue-res-num").map(node => textOf(node)).join(","), "+1400,+224",
			`惩罚页显示的本场奖励数值：${nodesWithClass("wm-rogue-res-num").map(node => textOf(node)).join(",")}`);
		assertEqual(nodesWithClass("wm-rogue-res-label").map(node => textOf(node)).join(","), "金币,经验", "奖励两格各自的标签");
		// 版式：Boss 专属浮层 + 只剩奇物一栏 + 每件一张可点卡片（技能自选栏已删除）
		assertEqual(nodesWithClass("wm-rogue-boss-overlay").length, 1, "页面走自建浮层体系（不依赖本体全屏 Dialog）");
		assertEqual(nodesWithClass("wm-rogue-boss").length, 1, "浮层里是居中面板");
		// 顶部大标题/固定说明/分隔线已删除：奖励结算容器上移成面板第一块，原区域不留空白高度
		const bossPanel = nodesWithClass("wm-rogue-boss")[0];
		assertEqual(bossPanel.children[0].classList.contains("wm-rogue-boss-reward"), true, "奖励结算容器紧贴面板顶部（面板第一块）");
		assertEqual(nodesWithClass("wm-rogue-boss-title").length, 0, "顶部大标题已删除");
		assertEqual(nodesWithClass("wm-rogue-boss-subtitle").length, 0, "固定说明已删除");
		assertEqual(nodesWithClass("wm-rogue-boss-divider").length, 0, "分隔线一并删除");
		assertEqual(nodesWithClass("wm-rogue-boss-body").length, 1, "正文独立滚动区");
		assertEqual(nodesWithClass("wm-rogue-boss-col").length, 1, "只剩奇物一栏（技能自动清算，不再列技能卡）");
		assertEqual(nodesWithClass("wm-rogue-boss-col-title").map(node => textOf(node)).join(","), "失去一件奇物", "栏题");
		assertEqual(nodesWithClass("wm-rogue-boss-card").length, 1, "一件奇物一张卡");
		assert(!screenText().includes("点击失去这个技能"), "技能自选操作文案不得再出现");
		assert(nodesWithClass("wm-rogue-boss-foot")[0], "底部有「点击即确认失去、不可撤销」的说明");
		// 中途退出重开：读档回到同一张惩罚页，欠的仍是那件奇物——不重新随机，也不自动替玩家删。
		// 临时奖励数据不在存档里，所以这一趟它必然缺失，页面要照常能用
		session();
		const pageText = screenText();
		// 大标题删掉后按面板与奇物栏认页：恢复路径没有临时奖励数据，合并的代价句不出现，照常能付
		assertEqual(nodesWithClass("wm-rogue-boss").length, 1, `读档直接回到待处理惩罚页：${pageText.slice(0, 120)}`);
		assert(pageText.includes("失去一件奇物"), `惩罚页的奇物栏照常在：${pageText.slice(0, 160)}`);
		assertEqual(nodesWithClass("wm-rogue-res-num").length, 0, "恢复的路径没有临时奖励数据，也只说明「已入账」");
		assert(pageText.includes("奖励与关卡进度都已入账"), `缺失临时数据时的说法：${pageText.slice(0, 200)}`);
		assert(pageText.includes("能量核心（稀有）"), `惩罚页要列出真实持有的奇物：${pageText}`);
		assert(!pageText.includes("own_one") && !pageText.includes("点击失去这个技能"), "技能已清算，页面不再列技能卡");
		assert(pageText.includes("摸牌阶段额外摸 2 张牌"), `奇物条目要带效果说明：${pageText}`);
		assertEqual(nodesWithClass("wm-rogue-boss-card-action").length, 1, "每张卡都写明「点击失去…」的操作提示");
		// 挑奇物：点卡片即确认，删除立刻落盘
		click("能量核心（稀有）");
		click("确定");
		const punished = lib.storage.rogueSlots[0];
		assertEqual(punished.pendingBossPenalty, null, "唯一欠项还清 → 待处理状态收掉");
		assertEqual(JSON.stringify(punished.curios), JSON.stringify([]), "奇物按玩家的选择失去");
		assertEqual(punished.curioQuality.energy_core, undefined, "被丢奇物的品质条目一并清掉");
		assertEqual(JSON.stringify(punished.collection.curios).includes("energy_core"), true, "图鉴「曾经拥有过」不因失去而消失");
		assertEqual(punished.skills.length, 0, "不再有技能自选页：技能早已由结算自动清算");
		assertEqual(punished.currentBattle, null, "本场结束后战斗状态清空，Boss 身份随之消失");
		// 惩罚付清之后的收尾：没有待处理事件就直接重载回营地，绝不把惩罚页再弹一次
		assertEqual(punished.pendingEvent, null, "这一场没掷出事件");
		return "建局不判定 → 逐场掷中换单 Boss → 复制三来源技能 + 中途恢复不重掷 → 金币 20 倍 / 经验 8 倍、商店改按概率 → 技能自动清算 + 奇物页自选一件";
	} finally {
		Math.random = originalRandom;
	}
});

await check("Boss 复制技能徽记：只有 Boss 多出第三枚，点开是存档里那份技能名+描述+来源，本体技与普通敌人都不掺和", async () => {
	freshWorld();
	// 夹具必须在每次 session() 之后、点「重新挑战这一关」之前登记：session() 会重建桩、
	// 换掉 lib.skill / lib.translate / lib.character，登记早了会被清空（现有 Boss 用例同一做法）。
	const seedCopySkills = () => {
		for (const id of ["bosscopy_a", "bosscopy_b", "zofi_own"]) {
			lib.skill[id] = { forced: true };
			lib.translate[id] = id;
			lib.translate[`${id}_info`] = "Boss 冒烟用复制技能。";
		}
		// 佐菲本体带 zofi_own：旧存档里它可能同时出现在复制列表中，展示层必须把它排除掉
		lib.character["佐菲"] = { hp: 4, maxHp: 4, skills: ["zofi_own"] };
		lib.character["赛文"] = { hp: 4, maxHp: 4, skills: [] };
	};
	putRun(0, {
		mode: "endless",
		level: 3,
		currentBattle: {
			status: "battle",
			isBossBattle: true,
			rift: null,
			enemies: [{
				// 合法 Boss 形状只有一名敌人：多名敌人 + isBossBattle 会被 state.js 判为无效形状并抹平 boss
				characterId: "佐菲", stats: { defense: 1, draw: 1, attack: 1 }, abyss: [],
				skills: ["bosscopy_a", "bosscopy_b", "zofi_own"], maxHp: 0, hp: 0, boss: true,
				skillSources: { bosscopy_a: "赛文", bosscopy_b: "杰克" },
			}],
		},
	}, stateModule.createRun("endless", "迪迦", 1));
	session();
	seedCopySkills();
	click("重新挑战这一关");
	await flush();
	const boss = game.players[1];
	assertEqual(game.players.length, 2, "Boss 战只有一名敌人");
	assertEqual(JSON.stringify(boss.rogueEnhanceInfo.copySkills), JSON.stringify(["bosscopy_a", "bosscopy_b"]),
		"复制技能列表原样取自存档，并排除本体直接技能");
	assert(!!boss.marks.rogue_copy, "Boss 应有第三枚「复制技能」徽记");
	assert(boss.hasSkill("bosscopy_a") && boss.hasSkill("bosscopy_b"), "复制技能由 grantSkills 挂上");
	assert(boss.hasSkill("rogue_copy"), "载体技能随复制技能一起挂上");
	// 点徽记 → 只开复制技能页：名字、描述、来源都在，属性与深渊都不掺和
	tapMark(boss.marks.rogue_copy);
	const text = screenText();
	for (const token of ["复制技能", "bosscopy_a", "bosscopy_b", "Boss 冒烟用复制技能", "来源：赛文", "佐菲"]) {
		assert(text.includes(token), `复制技能面板应显示「${token}」：${text.slice(0, 400)}`);
	}
	assert(!text.includes("zofi_own"), "本体技能不该出现在复制技能里");
	assert(!text.includes("防御 Lv."), `复制技能面板不该混进属性行：${text.slice(0, 400)}`);
	assert(!text.includes("深渊强化"), `复制技能面板不该混进深渊行：${text.slice(0, 400)}`);
	common.closeScreen();
	// 普通敌人：带着额外技能与来源映射也不许出现这枚徽记（判据只看 entry.boss）
	putRun(0, {
		mode: "endless",
		level: 3,
		currentBattle: {
			status: "battle",
			isBossBattle: false,
			rift: null,
			enemies: [
				{
					characterId: "佐菲", stats: { defense: 0, draw: 0, attack: 0 }, abyss: [],
					skills: ["bosscopy_a"], maxHp: 0, hp: 0, boss: false,
					skillSources: { bosscopy_a: "赛文" },
				},
				{
					characterId: "赛文", stats: { defense: 0, draw: 0, attack: 0 }, abyss: [],
					skills: [], maxHp: 0, hp: 0, boss: false,
				},
			],
		},
	}, stateModule.createRun("endless", "迪迦", 1));
	session();
	seedCopySkills();
	click("重新挑战这一关");
	await flush();
	assert(game.players[1].hasSkill("bosscopy_a"), "普通敌人照常挂着它自带的额外技能");
	assert(!game.players[1].marks.rogue_copy, "普通敌人不显示复制技能徽记");
	assert(!game.players[2].marks.rogue_copy, "另一名普通敌人同样没有徽记");
	// Boss 没有复制技能时不出现空徽记（载体技能也一并省掉）
	putRun(0, {
		mode: "endless",
		level: 3,
		currentBattle: {
			status: "battle",
			isBossBattle: true,
			rift: null,
			enemies: [{
				characterId: "佐菲", stats: { defense: 0, draw: 0, attack: 0 }, abyss: [],
				skills: [], maxHp: 0, hp: 0, boss: true,
			}],
		},
	}, stateModule.createRun("endless", "迪迦", 1));
	session();
	seedCopySkills();
	click("重新挑战这一关");
	await flush();
	assert(!game.players[1].marks.rogue_copy, "没有复制技能的 Boss 不显示空徽记");
	assert(!game.players[1].hasSkill("rogue_copy"), "没有复制技能时连载体都不挂");
	return "第三枚徽记 / 面板取自存档并排除本体技 / 普通敌人与空列表不显示";
});

await check("Boss 判定不跨场：普通场→Boss 场→普通场各判各的，倍率/弃置/标题只跟随刚打完的那一场", async () => {
	freshWorld();
	const originalRandom = Math.random;
	/** 打完当前正在进行的那一场：杀掉所有敌人并等结算页出来 */
	async function winCurrentBattle() {
		for (const player of game.players.slice(1)) {
			player.__alive = false;
		}
		lib.element.player.dieAfter.call(game.players[1]);
		await flush();
	}
	try {
		// 随机钉在 0.5：既不低于事件线（0.4）也不低于奇物商店线（基础 0.2），两样都不触发，
		// 于是每场的金币增量都恰好等于该关基准，能逐场精确对账；Boss 判定由两个 click 助手单独钉
		Math.random = () => 0.5;
		putRun(0, {
			mode: "endless",
			characterId: "迪迦",
			level: 12,
			currency: { gold: 0, exp: 0 },
			skills: ["own_one", "own_two"],
			curios: ["energy_core"],
		});
		session();
		// ---- 第 1 场：没抽中 → 完全走现有普通流程
		clickNormalBattle();
		await flush();
		let slot = lib.storage.rogueSlots[0];
		assertEqual(slot.currentBattle.isBossBattle, false, "第 1 场记为普通战斗");
		assertEqual(slot.currentBattle.enemies.length, enemyModule.getEnemyCount(12, "endless"), "普通场的敌人数仍按关卡表生成");
		assertEqual(slot.currentBattle.enemies.every(enemy => !enemy.boss), true, "普通场没有 boss 敌人，也不会沿用上一场的标记");
		let base = rewardsData.getEndlessReward(12, ["gold", "exp"]);
		winCurrentBattle();
		slot = lib.storage.rogueSlots[0];
		assertEqual(slot.currency.gold, base.gold, "普通场金币 = 1 倍基准");
		assertEqual(slot.currency.exp, base.exp, "普通场经验 = 1 倍基准");
		assertEqual(slot.curioOffers.length, 0, "普通场 rng=0.5 不刷奇物商店");
		assertEqual(JSON.stringify(slot.skills), JSON.stringify(["own_one", "own_two"]), "普通场不弃技能");
		assertEqual(JSON.stringify(slot.curios), JSON.stringify(["energy_core"]), "普通场不弃奇物");
		assert(screenText().includes("战斗胜利") && !screenText().includes("Boss 战"), `普通场标题不带 Boss：${screenText()}`);
		click("返回营地");
		session();
		// ---- 第 2 场：上一场没抽中，这一场独立掷中 → 换单 Boss、走 Boss 结算
		clickBossBattle();
		await flush();
		slot = lib.storage.rogueSlots[0];
		assertEqual(slot.currentBattle.isBossBattle, true, "第 2 场独立掷中 Boss（不继承第 1 场的 false）");
		assertEqual(slot.currentBattle.enemies.length, 1, "Boss 场只有 1 名敌人");
		assertEqual(slot.currentBattle.enemies[0].boss, true, "Boss 敌人标记随阵容落盘");
		base = rewardsData.getEndlessReward(13, ["gold", "exp"]);
		const goldBefore = slot.currency.gold;
		const expBefore = slot.currency.exp;
		winCurrentBattle();
		slot = lib.storage.rogueSlots[0];
		assertEqual(slot.currency.gold - goldBefore, base.gold * cfg.BOSS_REWARD_MULTIPLIER, "Boss 场金币 = 20 倍基准");
		assertEqual(slot.currency.exp - expBefore, base.exp * cfg.BOSS_EXP_MULTIPLIER, "Boss 场经验 = 8 倍基准");
		assertEqual(slot.curioOffers.length, 0, "Boss 场胜利不再固定刷新奇物商城：rng=0.5 与普通场一样未命中");
		assertEqual(JSON.stringify(slot.skills), JSON.stringify([]), "Boss 胜利当场失去全部装备技能（v14 自动清算）");
		assertEqual(JSON.stringify(slot.skillInventory), JSON.stringify([]), "被清除的技能同时从背包删除");
		assertEqual(slot.curios.length, 1, "奇物还没被删（等玩家挑）");
		assertEqual(JSON.stringify(slot.pendingBossPenalty), JSON.stringify({ reason: "bossVictory", needSkill: false, needCurio: true }), "结算只挂奇物那一项欠账");
		// 奖励落盘之后直接进惩罚页：既没有中间结算页可点，也不能把奖励悄悄吞掉
		assert(!screenText().includes("Boss 战 · 战斗胜利"), `有欠项时不再打开中间结算页：${screenText().slice(0, 200)}`);
		assert(screenText().includes("Boss 战的代价：失去了全部 2 个装备技能，并需要从你的奇物中选择一件失去。"),
			`Boss 胜利自动打开惩罚选择页（两条旧提示已合成一条）：${screenText().slice(0, 200)}`);
		assertEqual(nodesWithClass("wm-rogue-res-num").map(node => textOf(node)).join(","),
			`+${base.gold * cfg.BOSS_REWARD_MULTIPLIER},+${base.exp * cfg.BOSS_EXP_MULTIPLIER}`, "惩罚页顶上给出本场金币/经验");
		// 结清这一场的惩罚（只剩奇物那一件），才能接着打第 3 场
		payBossPenalty();
		slot = lib.storage.rogueSlots[0];
		assertEqual(JSON.stringify(slot.skills), JSON.stringify([]), "技能早已自动清算，奇物罚完不再动别的");
		assertEqual(slot.pendingBossPenalty, null, "欠账还清后标记收掉");
		session();
		// ---- 第 3 场：刚打完 Boss，下一场也必须回到普通结算（这是本次修改的核心目的）
		clickNormalBattle();
		await flush();
		slot = lib.storage.rogueSlots[0];
		assertEqual(slot.currentBattle.isBossBattle, false, "第 3 场不再继承上一场的 Boss 身份");
		assertEqual(slot.currentBattle.enemies.length, enemyModule.getEnemyCount(14, "endless"), "第 3 场按普通关卡生成");
		base = rewardsData.getEndlessReward(14, ["gold", "exp"]);
		const goldBefore3 = slot.currency.gold;
		winCurrentBattle();
		slot = lib.storage.rogueSlots[0];
		assertEqual(slot.currency.gold - goldBefore3, base.gold, "第 3 场回到 1 倍基准，20 倍没有跟过来");
		assertEqual(slot.curioOffers.length, 0, "第 3 场同样按概率（rng=0.5）不刷奇物商店");
		assertEqual(JSON.stringify(slot.skills), JSON.stringify([]), "第 3 场不弃技能（装备栏在上一场就已自动清空）");
		assertEqual(slot.level, 15, "关卡照常推进");
		assert(screenText().includes("战斗胜利") && !screenText().includes("Boss 战"), `第 3 场标题：${screenText()}`);
		return "普通(1×)→Boss(金20×/经验8×+弃置)→普通(1×)，三场各判各的、商店一律按概率";
	} finally {
		Math.random = originalRandom;
	}
});

await check("v11 旧档迁移：整局 bossRun 只折算进正在进行的这一场，下一场回到逐场判定", async () => {
	freshWorld();
	const originalRandom = Math.random;
	try {
		Math.random = () => 0.5;
		// ① 旧档正打到一半：v11 的整局 bossRun + 阵容里带 boss 标记的敌人（没有 isBossBattle 字段）
		putLegacyV11(0, {
			level: 3,
			currency: { gold: 0, exp: 0 },
			currentBattle: {
				status: "battle",
				enemies: [{ characterId: "佐菲", stats: { defense: 0, draw: 0, attack: 0 }, abyss: [], skills: [], boss: true, maxHp: 0, hp: 0 }],
				rift: null,
			},
		});
		session();
		// 旧档读入会先弹一条「已从版本11迁移到当前版本」的提示，确认后才是恢复页
		click("确定");
		// 读档这一刻还没有落盘：存档里仍是原始的 v11 形状（带整局 bossRun）。
		// 旧字段只被折算进「正在进行的这一场」，它本身不再被任何代码读取——
		// 下面恢复出的这一场能否按 20 倍与 Boss 标题结算，就是它唯一的影响范围。
		let slot = lib.storage.rogueSlots[0];
		assertEqual(slot.currentBattle.enemies[0].boss, true, "旧档的 Boss 阵容原样保留");
		click("重新挑战这一关");
		await flush();
		assertEqual(game.players.length, 2, "恢复的还是那一场单 Boss");
		assertEqual(game.players[1].name, "佐菲", "敌人原样，没有重掷");
		assertEqual(game.players[1].maxHp, lib.character["佐菲"].maxHp * 2, "迁移场的体力翻倍规则照常生效");
		const base3 = rewardsData.getEndlessReward(3, ["gold", "exp"]);
		for (const player of game.players.slice(1)) {
			player.__alive = false;
		}
		lib.element.player.dieAfter.call(game.players[1]);
		await flush();
		slot = lib.storage.rogueSlots[0];
		assertEqual(slot.currency.gold, base3.gold * cfg.BOSS_REWARD_MULTIPLIER, "迁移过来的这一场仍按 20 倍金币结算");
		assertEqual(slot.currency.exp, base3.exp * cfg.BOSS_EXP_MULTIPLIER, "迁移过来的这一场经验按 8 倍结算");
		assertEqual(slot.curioOffers.length, 0, "迁移过来的这一场也不再固定刷新奇物商店（rng=0.5 未命中）");
		assert(screenText().includes("Boss 战 · 战斗胜利"), `迁移场标题：${screenText()}`);
		assertEqual(slot.currentBattle, null, "本场结算完清理战斗状态");
		assertEqual(slot.bossRun, undefined, "落盘后整局字段彻底消失，管不到后面的关卡");
		click("返回营地");
		session();
		// ② 下一场独立判定：钉成不抽中就是普通关，旧 bossRun 不会把它锁成 Boss 战
		clickNormalBattle();
		await flush();
		slot = lib.storage.rogueSlots[0];
		assertEqual(slot.currentBattle.isBossBattle, false, "下一场独立判为普通战斗");
		assertEqual(slot.bossRun, undefined, "读档后整局字段始终不存在");
		const base4 = rewardsData.getEndlessReward(4, ["gold", "exp"]);
		for (const player of game.players.slice(1)) {
			player.__alive = false;
		}
		lib.element.player.dieAfter.call(game.players[1]);
		await flush();
		slot = lib.storage.rogueSlots[0];
		assertEqual(slot.currency.gold, base3.gold * cfg.BOSS_REWARD_MULTIPLIER + base4.gold, "下一场回到 1 倍基准");
		assert(screenText().includes("战斗胜利") && !screenText().includes("Boss 战"), `下一场标题：${screenText()}`);
		click("返回营地");
		session();
		// ③ 旧档「没有进行中战斗」：旧 bossRun 不能决定下一场，抽不抽中只看创建这一场时的那一掷
		putLegacyV11(0, { level: 2, currency: { gold: 0, exp: 0 } });
		session();
		click("确定");
		assertEqual(lib.storage.rogueSlots[0].currentBattle, null, "旧档没有进行中战斗");
		clickNormalBattle();
		await flush();
		slot = lib.storage.rogueSlots[0];
		assertEqual(slot.currentBattle.isBossBattle, false, "没抽中就是普通关：旧 bossRun 不会把下一场锁成 Boss 战");
		assertEqual(slot.bossRun, undefined, "落盘之后整局字段彻底消失");
		// 同一份旧档形状，把这一掷钉成抽中 → 本场照样走 Boss 链路，且只替换这一场
		freshWorld();
		putLegacyV11(0, { level: 2, currency: { gold: 0, exp: 0 } });
		session();
		click("确定");
		clickBossBattle();
		await flush();
		slot = lib.storage.rogueSlots[0];
		assertEqual(slot.currentBattle.isBossBattle, true, "抽中时这一场就是 Boss 战");
		assertEqual(slot.currentBattle.enemies.length, 1, "旧档形状下也只替换这一场");
		return "迁移场保阵容保结算 → 下一场独立判定 → 无战斗的旧档不被锁死";
	} finally {
		Math.random = originalRandom;
	}
});

await check("10-06 实机旧档（存档 v9，无尽 45 关）：无保底记录按 0 起算 → 第一场直接吃保底，之后逐场各掷各的", async () => {
	freshWorld();
	const originalRandom = Math.random;
	try {
		Math.random = () => 0.5;
		putLegacyRaw(0, realV9Run());
		session();
		ensureAceInRoster();
		// 读档先弹一条「已从版本9迁移到当前版本」的提示（旧档才有），确认后落回营地
		click("确定");
		let slot = lib.storage.rogueSlots[0];
		assertEqual(slot.version, 9, "读档这一刻存档还是原始 v9（尚未被任何写入覆盖）");
		assertEqual(slot.bossRun, undefined, "v9 旧档本来就没有整局 bossRun 字段");
		assert(screenText().includes("开始下一关"), `确认提示后应落在营地：${screenText()}`);
		// ---- 第 1 场：这份旧档两个保底字段都没有 → 折 0；45 关距「上次 Boss」早已超过 15 关，
		// 判定前置于概率：把随机源钉成「永远掷不中」也照样吃保底（保底路径不消费随机源）
		Math.random = () => 1;
		click("开始下一关");
		Math.random = () => 0.5;
		await flush();
		slot = lib.storage.rogueSlots[0];
		assertEqual(slot.version, cfg.RUN_VERSION, "开战落盘后版本升到当前");
		assertEqual(slot.bossRun, undefined, "新代码不再写整局字段，旧档也不会被补一个");
		assertEqual(slot.currentBattle.isBossBattle, true, "无记录旧档（0）第 1 场就是保底 Boss（不掷骰）");
		assertEqual(slot.currentBattle.enemies.length, 1, "保底场即单 Boss 阵容");
		assertEqual(slot.currentBattle.enemies[0].boss, true, "boss 标记随阵容落盘");
		assertEqual(slot.bossPityLevel, 45, "Boss 记录翻到第 45 关");
		const goldBefore1 = slot.currency.gold;
		const expBefore1 = slot.currency.exp;
		for (const player of game.players.slice(1)) {
			player.__alive = false;
		}
		lib.element.player.dieAfter.call(game.players[1]);
		await flush();
		slot = lib.storage.rogueSlots[0];
		assertEqual(slot.currency.gold - goldBefore1, rewardsData.getEndlessReward(45, ["gold"]).gold * cfg.BOSS_REWARD_MULTIPLIER, "Boss 场金币 = 20 倍基准");
		assertEqual(slot.currency.exp - expBefore1, rewardsData.getEndlessReward(45, ["exp"]).exp * cfg.BOSS_EXP_MULTIPLIER, "Boss 场经验 = 8 倍基准");
		assertEqual(slot.curioOffers.length, 0, "Boss 场胜利不再固定刷新奇物商店：rng=0.5 未命中");
		assert(screenText().includes("Boss 战的代价：失去了全部 3 个装备技能，并需要从你的奇物中选择一件失去。"),
			`旧档的 Boss 胜利也自动进惩罚页（件数按实际清算的 3 个现写）：${screenText().slice(0, 200)}`);
		assertEqual(nodesWithClass("wm-rogue-res-num").map(node => textOf(node)).join(","),
			`+${rewardsData.getEndlessReward(45, ["gold"]).gold * cfg.BOSS_REWARD_MULTIPLIER},+${rewardsData.getEndlessReward(45, ["exp"]).exp * cfg.BOSS_EXP_MULTIPLIER}`,
			"惩罚页顶上给出这一场的金币/经验");
		assertEqual(JSON.stringify(slot.pendingBossPenalty), JSON.stringify({ reason: "bossVictory", needSkill: false, needCurio: true }), "技能已自动清算，欠项只剩奇物");
		assertEqual(JSON.stringify(slot.skills), JSON.stringify([]), "旧档装备的三个技能当场全部失去");
		assertEqual(JSON.stringify(slot.skillInventory), JSON.stringify([]), "被清除的技能同时从背包删除");
		payBossPenalty();
		slot = lib.storage.rogueSlots[0];
		assertEqual(slot.pendingBossPenalty, null, "惩罚照常可结清");
		assert(!slot.skillInventory.includes("own_one"), "失去的技能不会再回来");
		assertEqual(slot.level, 46, "关卡照常推进");
		assertEqual(slot.pendingEvent, null, "事件判定未命中");
		// 付清后按既有写法直接重载（惩罚页与结算页的出口在这里不用点按钮，重载后按存档继续）
		session();
		ensureAceInRoster();
		// ---- 第 2 场：记录翻到 45，距保底还远（46-45=1）→ 回到逐场掷：这一掷（0.5）不抽中就是普通场
		clickNormalBattle();
		await flush();
		slot = lib.storage.rogueSlots[0];
		assertEqual(slot.currentBattle.isBossBattle, false, "第 2 场照样逐场掷：这一掷没抽中");
		assertEqual(slot.currentBattle.enemies.length, enemyModule.getEnemyCount(46, "endless"), "46 关按普通关生成阵容");
		assert(slot.currentBattle.enemies.every(enemy => enemy.boss !== true), "普通场没有一个按 Boss 规则落地（缺省不写 boss 字段）");
		assertEqual(slot.bossPityLevel, 45, "普通场一个字都不写：记录仍是 45");
		for (const player of game.players.slice(1)) {
			player.__alive = false;
		}
		lib.element.player.dieAfter.call(game.players[1]);
		await flush();
		slot = lib.storage.rogueSlots[0];
		assertEqual(slot.currentBattle, null, "第 2 场结算后战斗标记清空（Boss 身份随之消失）");
		assertEqual(slot.curioOffers.length, 0, "奇物商店这一掷（0.5）未命中 → 旧批次清空");
		click("返回营地");
		session();
		ensureAceInRoster();
		// ---- 第 3 场：再回到普通场，标记不跨场
		clickNormalBattle();
		await flush();
		slot = lib.storage.rogueSlots[0];
		assertEqual(slot.currentBattle.isBossBattle, false, "第 3 场各掷各的：没抽中就是普通场");
		assertEqual(slot.currentBattle.enemies.length, enemyModule.getEnemyCount(47, "endless"), "第 3 场按普通关卡生成");
		for (const player of game.players.slice(1)) {
			player.__alive = false;
		}
		lib.element.player.dieAfter.call(game.players[1]);
		await flush();
		slot = lib.storage.rogueSlots[0];
		assertEqual(slot.curioOffers.length, 0, "第 3 场同样按概率判定（rng=0.5 未命中）");
		assertEqual(slot.level, 48, "三场结束关卡推进到 48");
		return "无记录旧档 → Boss(45, 保底·金20×/经验8×+惩罚页)→ 普通(46)→普通(47)，之后各判各的、商店一律按概率";
	} finally {
		Math.random = originalRandom;
	}
});

await check("10-06 实机旧档带残留的商店锁（没有橱窗）：读档清零，本应发生的奇物刷新照常发生", async () => {
	freshWorld();
	const originalRandom = Math.random;
	try {
		Math.random = () => 0.5;
		// 旧版本写下的锁字段（或玩家后来失去了橱窗）：读档一律清零，不许挡住本应发生的刷新
		putLegacyRaw(0, realV9Run({ level: 3, curioShopLocked: true, skillShopLocked: true }));
		session();
		ensureAceInRoster();
		click("确定");
		clickNormalBattle();
		await flush();
		let slot = lib.storage.rogueSlots[0];
		assertEqual(slot.curioShopLocked, false, "没有橱窗 → 残留的奇物锁清零");
		assertEqual(slot.skillShopLocked, false, "没有橱窗 → 残留的技能锁清零");
		// 打赢这一场：结算里的奇物商店判定照常执行（这一份旧档拥有史诗诅咒金币，
		// 结算里没有波动项掷骰，奇物商店的判定就是第一次 rng 消费），钉中基础线（现 20%）即整批新货
		let calls = 0;
		Math.random = () => (calls++ === 0 ? 0.05 : 0.5);
		for (const player of game.players.slice(1)) {
			player.__alive = false;
		}
		lib.element.player.dieAfter.call(game.players[1]);
		await flush();
		slot = lib.storage.rogueSlots[0];
		assertEqual(slot.curioOffers.length, cfg.CURIO_OFFER_COUNT, "锁字段清零后，本应发生的刷新照常发生（基础线抽中 → 整批新货）");
		assert(slot.curioOffers.every(offer => !slot.curios.includes(offer.id)), "新货不含已拥有的奇物");
		return "残留锁清零 / 刷新判定照常执行并抽中";
	} finally {
		Math.random = originalRandom;
	}
});

await check("闯关模式永不判 Boss：随机钉成必然命中也不换单 Boss 阵容，胜利只按 1 倍基准、标题不提 Boss", async () => {
	freshWorld();
	const originalRandom = Math.random;
	try {
		Math.random = () => 0.5;
		session();
		await newRunByUi("闯关模式");
		// clickBossBattle 把判定那一掷钉成 0（必然 < BOSS_RUN_RATE）：这一场在无尽就是 Boss 战。
		// 闯关走模式闸门，直接判普通场，而且不消费这一掷（它落到敌方阵容的随机上）
		clickBossBattle();
		await flush();
		let slot = lib.storage.rogueSlots[0];
		assertEqual(slot.currentBattle.isBossBattle, false, "闯关本场不判 Boss");
		assertEqual(slot.currentBattle.enemies.some(enemy => enemy.boss), false, "没有敌人带 boss 标记");
		assertEqual(slot.bossPityLevel, 0, "普通场一个字都不写：保底记录仍为 0");
		const stage1 = stagesData.getChallengeStageConfig(slot.challengeStages[slot.level - 1]);
		assertEqual(slot.currentBattle.enemies.length, stage1.players.length, "敌人数仍由本关的关卡配置决定（没被换成单 Boss）");
		const base1 = rewardsData.getChallengeReward(1);
		for (const player of game.players.slice(1)) {
			player.__alive = false;
		}
		lib.element.player.dieAfter.call(game.players[1]);
		await flush();
		slot = lib.storage.rogueSlots[0];
		assertEqual(slot.currency.gold, cfg.INITIAL_CURRENCY.gold + base1.gold, "第 1 关胜利 = 1 倍基准（没有 Boss 倍率）");
		assertEqual(slot.level, 2, "关卡照常推进");
		assertEqual(slot.curioOffers.length, 0, "闯关没有奇物商店，也不凭空刷出货");
		assert(slot.currentBattle === null, "胜利后本场状态清空");
		assert(!screenText().includes("Boss"), `胜利页不提 Boss：${screenText()}`);
		// 深层关卡 + 关卡差早过保底阈值：闯关照样不判 Boss（阈值与概率都只属于无尽）。
		// 组合表直接铺满，免得 rng 钉死时现抽判成「配置不足」
		const combos = combosData.challengeComboPool.slice(0, cfg.CHALLENGE_COMBO_LEVELS).map(config => config.id);
		freshWorld();
		putRun(0, {
			mode: "challenge",
			characterId: "迪迦",
			level: 21,
			currency: { gold: 0, exp: 0 },
			bossPityLevel: 0,
			challengeStages: stagesData.challengeStagePool.slice(0, cfg.CHALLENGE_STAGE_LEVELS).map(config => config.id),
			challengeComboStages: combos,
		});
		session();
		Math.random = () => 0;
		click("开始下一关");
		await flush();
		slot = lib.storage.rogueSlots[0];
		assertEqual(slot.currentBattle.isBossBattle, false, "第 21 关（关卡差早已满阈值、随机钉 0）仍不是 Boss 战");
		assertEqual(slot.currentBattle.enemies.length, 3, "阵容照常是双人组合 + 第三人，而不是单 Boss");
		assertEqual(slot.bossPityLevel, 0, "闯关不写保底记录");
		return "第 1 关随机钉 0 也判普通场(1×) → 第 21 关过阈值仍普通场(3 敌)";
	} finally {
		Math.random = originalRandom;
	}
});

await check("闯关旧档的进行中 Boss 场：照原样打完，战败一件不弃、标记随战斗状态清掉，重战判为普通关", async () => {
	freshWorld();
	const originalRandom = Math.random;
	try {
		Math.random = () => 0.5;
		// 改口径前留下的闯关存档：这一场已经判成 Boss 战并落了盘。读档只认存档、绝不重掷，
		// 所以「闯关不再判 Boss」不能把正在打的这一场悄悄降成普通场。
		putRun(0, {
			mode: "challenge",
			characterId: "迪迦",
			level: 7,
			currency: { gold: 100, exp: 100 },
			skills: ["own_one", "own_two"],
			curios: ["energy_core"],
			challengeStages: stagesData.challengeStagePool.slice(0, cfg.CHALLENGE_STAGE_LEVELS).map(config => config.id),
			currentBattle: {
				status: "battle",
				enemies: [{ characterId: "佐菲", stats: { defense: 0, draw: 0, attack: 0 }, abyss: [], skills: [], maxHp: 0, hp: 0, boss: true }],
				rift: null,
				isBossBattle: true,
			},
		});
		session();
		// 带未完成战斗进营地 = 先落到「战斗未正常结算」的恢复页，点它才能重开这一场
		assert(screenText().includes("战斗未正常结算"), `重进应落到恢复页：${screenText()}`);
		// 恢复这一场走的是 startFromSavedBattle：不判 Boss、不掷骰，身份原样带回
		click("重新挑战这一关");
		await flush();
		let slot = lib.storage.rogueSlots[0];
		assertEqual(slot.currentBattle.isBossBattle, true, "旧档正在打的这一场保住 Boss 战身份");
		assertEqual(slot.currentBattle.enemies[0].boss, true, "敌人的 boss 标记与整场标记对齐");
		game.me.__alive = false;
		game.me.hp = 0;
		lib.element.player.dieAfter.call(game.me);
		slot = lib.storage.rogueSlots[0];
		assertEqual(slot.currentBattle, null, "战败同样清空本场状态（Boss 身份随之消失）");
		assertEqual(JSON.stringify(slot.skills), JSON.stringify(["own_one", "own_two"]), "Boss 的强制弃置只在胜利结算执行，战败一件不动");
		assertEqual(JSON.stringify(slot.curios), JSON.stringify(["energy_core"]), "战败不弃奇物");
		assertEqual(slot.level, 7, "闯关失败关卡不后退");
		const failText = screenText();
		assert(failText.includes("战斗失败") && !failText.includes("Boss"), `失败页不提 Boss：${failText}`);
		click("返回营地");
		session();
		// 重战这一关 = 一场全新的战斗：闯关不再判 Boss，把随机钉成必然命中也一样
		clickBossBattle();
		await flush();
		slot = lib.storage.rogueSlots[0];
		assertEqual(slot.currentBattle.isBossBattle, false, "重战的这一关判为普通战斗（闯关没有 Boss 战）");
		assertEqual(slot.level, 7, "仍在第 7 关");
		assertEqual(slot.currentBattle.enemies.every(enemy => !enemy.boss), true, "普通关敌人不带 boss 标记");
		return "旧档 Boss 场身份保留 → 战败不弃置 → 状态清空 → 重战判为普通关";
	} finally {
		Math.random = originalRandom;
	}
});

await check("矛盾存档对齐：整场与敌人标记冲突时按规则归一化，体力/奖励/惩罚/标题全部跟随归一化后的状态", async () => {
	freshWorld();
	const originalRandom = Math.random;
	/** 写一份“整场标记 + 单个敌人”的未完成战斗存档（敌人条目按参数决定带不带 boss、值是什么） */
	const putBattle = (isBossBattle, enemyEntry) => putRun(0, {
		mode: "endless",
		characterId: "迪迦",
		level: 4,
		currency: { gold: 0, exp: 0 },
		skills: ["own_one", "own_two"],
		curios: ["energy_core"],
		currentBattle: {
			status: "battle",
			enemies: [{ characterId: "佐菲", stats: { defense: 0, draw: 0, attack: 0 }, abyss: [], skills: [], maxHp: 0, hp: 0, ...enemyEntry }],
			rift: null,
			isBossBattle,
		},
	});
	/** 打完正在进行的那一场（杀掉所有敌人并等结算页出来） */
	const winCurrentBattle = async () => {
		for (const player of game.players.slice(1)) {
			player.__alive = false;
		}
		lib.element.player.dieAfter.call(game.players[1]);
		await flush();
	};
	try {
		const base = rewardsData.getEndlessReward(4, ["gold", "exp"]);
		Math.random = () => 0.5;
		// ① 整场记普通战斗、敌人却带 boss: true（本次修的第一类矛盾）→ 读档抹平，按普通场打
		putBattle(false, { boss: true });
		session();
		let slot = lib.storage.rogueSlots[0];
		assertEqual(slot.currentBattle.enemies[0].boss, false, "普通场里的 boss 标记被对齐掉");
		assertEqual(slot.currentBattle.enemies[0].characterId, "佐菲", "角色没被换掉，也不重建阵容");
		click("重新挑战这一关");
		await flush();
		assertEqual(game.players.length, 2, "仍是那一场单人战斗");
		assertEqual(game.players[1].name, "佐菲", "敌人原样，没有重掷");
		assertEqual(game.players[1].maxHp, lib.character["佐菲"].maxHp, "战斗初始化不再给它 Boss 的体力翻倍");
		await winCurrentBattle();
		slot = lib.storage.rogueSlots[0];
		assertEqual(slot.currency.gold, base.gold, "胜利按 1 倍基准入账，不是 20 倍");
		assertEqual(slot.currency.exp, base.exp, "经验同样按 1 倍入账");
		assertEqual(slot.curioOffers.length, 0, "奇物商店按概率判定（rng=0.5 未命中）");
		assertEqual(JSON.stringify(slot.skills), JSON.stringify(["own_one", "own_two"]), "不走 Boss 的技能弃置");
		assertEqual(JSON.stringify(slot.curios), JSON.stringify(["energy_core"]), "不走 Boss 的奇物弃置");
		assert(screenText().includes("战斗胜利") && !screenText().includes("Boss"), `结算页标题走普通口径：${screenText()}`);
		// ② 整场记 Boss 战、敌人却**明确写着** boss: false（本次修的第二类矛盾）→ 降级为普通战斗，
		//    不许因为「只有一名敌人」就把明确的普通敌人升级成 Boss
		putBattle(true, { boss: false });
		session();
		slot = lib.storage.rogueSlots[0];
		assertEqual(slot.currentBattle.isBossBattle, false, "明确 false 的敌人把整场降为普通战斗");
		assertEqual(slot.currentBattle.enemies[0].boss, false, "敌人标记保持 false");
		click("重新挑战这一关");
		await flush();
		assertEqual(game.players[1].maxHp, lib.character["佐菲"].maxHp, "降级后不给 Boss 的体力翻倍");
		await winCurrentBattle();
		slot = lib.storage.rogueSlots[0];
		assertEqual(slot.currency.gold, base.gold, "降级场拿 1 倍基准，不是 20 倍");
		assertEqual(slot.curioOffers.length, 0, "降级场按普通概率判定，rng=0.5 未命中");
		assertEqual(JSON.stringify(slot.skills), JSON.stringify(["own_one", "own_two"]), "降级场不弃技能");
		assertEqual(JSON.stringify(slot.curios), JSON.stringify(["energy_core"]), "降级场不弃奇物");
		assert(screenText().includes("战斗胜利") && !screenText().includes("Boss"), `降级场标题走普通口径：${screenText()}`);
		// ③ 整场记 Boss 战、单敌**缺 boss 字段**（可补齐的形态）→ 补齐后本场保持 Boss 身份，效果与结算都照常
		putBattle(true, {});
		session();
		slot = lib.storage.rogueSlots[0];
		assertEqual(slot.currentBattle.isBossBattle, true, "缺字段不是「明确普通」，本场保持 Boss 身份");
		assertEqual(slot.currentBattle.enemies[0].boss, true, "补齐缺失的敌人标记");
		click("重新挑战这一关");
		await flush();
		assertEqual(game.players[1].maxHp, lib.character["佐菲"].maxHp * 2, "补齐后体力按 Boss 翻倍");
		// 再读一次档（中途退出重进）：标记不再变、体力仍只翻一倍，不会翻成 4 倍
		session();
		assertEqual(lib.storage.rogueSlots[0].currentBattle.enemies[0].boss, true, "重进后标记保持不变（补齐是幂等的）");
		click("重新挑战这一关");
		await flush();
		assertEqual(game.players[1].maxHp, lib.character["佐菲"].maxHp * 2, "重进后体力仍只翻一倍");
		await winCurrentBattle();
		slot = lib.storage.rogueSlots[0];
		assertEqual(slot.currency.gold, base.gold * cfg.BOSS_REWARD_MULTIPLIER, "保持 Boss 身份的这一场照拿 20 倍金币");
		assertEqual(slot.currency.exp, base.exp * cfg.BOSS_EXP_MULTIPLIER, "经验按 8 倍入账");
		assertEqual(slot.curioOffers.length, 0, "补齐后的 Boss 场同样不再固定刷新奇物商店（rng=0.5 未命中）");
		assertEqual(JSON.stringify(slot.skills), JSON.stringify([]), "Boss 胜利当场失去全部装备技能");
		assertEqual(JSON.stringify(slot.skillInventory), JSON.stringify([]), "装备技能从背包一并删除");
		assertEqual(slot.curios.length, 1, "奇物还没失去（等玩家挑）");
		assertEqual(slot.pendingBossPenalty.needSkill, false, "技能已自动清算，欠项标记写 false");
		assertEqual(slot.pendingBossPenalty.needCurio, true, "只欠奇物那一件");
		assert(screenText().includes("Boss 战的代价：失去了全部 2 个装备技能，并需要从你的奇物中选择一件失去。"),
			`补齐后的 Boss 胜利直接进惩罚页：${screenText().slice(0, 160)}`);
		assert(!screenText().includes("Boss 战 · 战斗胜利"), "有欠项的这一场不停在中间结算页");
		payBossPenalty();
		assertEqual(lib.storage.rogueSlots[0].skills.length, 0, "技能早已清算，奇物罚完不再动技能");
		assertEqual(lib.storage.rogueSlots[0].curios.length, 0, "奇物按选择失去");
		return "明确 false 降级(体力/奖励/惩罚/标题) / 缺字段补齐(翻倍一次+金20倍·经验8倍+技能自动清算·奇物自选) / 普通场残留标记抹平";
	} finally {
		Math.random = originalRandom;
	}
});

await check("事件定义中途下架：事件页不抛异常，直接走出口重载", async () => {
	freshWorld();
	const originalRandom = Math.random;
	const def = eventsData.events.lost_robot;
	try {
		Math.random = () => 0;
		session();
		await winEndlessBattle();
		assertEqual(lib.storage.rogueSlots[0].pendingEvent.id, "lost_robot", "存档里挂着定死的事件");
		// normalizePendingEvent 只在读档时清洗，这里模拟「写进存档之后定义才下架」，绕得过去
		delete eventsData.events.lost_robot;
		click("继续");
		assertEqual(nodesWithClass("wm-rogue-event").length, 0, "没有定义就不该画事件页");
		assert(log.some(item => item.type === "reload"), "应走出口重载（修之前这里抛 TypeError，走不到断言）");
	} finally {
		eventsData.events.lost_robot = def;
		Math.random = originalRandom;
	}
	return "缺定义 → 走出口不崩";
});

await check("事件持久化：触发后关游戏再读档，事件页原样恢复、不重新随机", async () => {
	freshWorld();
	const originalRandom = Math.random;
	Math.random = () => 0;
	try {
		session();
		await winEndlessBattle();
		click("继续");
		const saved = JSON.stringify(lib.storage.rogueSlots[0].pendingEvent);
		assert(saved.includes("lost_robot"), "事件已在存档里");
		// 模拟关游戏重开：不选择，直接重新加载页面
		session();
		const text = screenText();
		assert(text.includes("废弃机器人"), `读档应优先恢复事件页：${text}`);
		assertEqual(nodesWithClass("wm-rogue-event")[0]?.parentNode?.classList?.contains("wm-rogue-stage"), true, "恢复的也是事件浮层");
		assertEqual(JSON.stringify(lib.storage.rogueSlots[0].pendingEvent), saved, "恢复时绝不重掷（存档原样）");
		assert(!screenText().includes("战斗胜利"), "不会重复弹结算页");
		// 恢复流程处理完事件直接进营地（无战斗需要收尾，不重载）
		click("离开");
		click("确定");
		assert(!log.some(item => item.type === "reload"), "恢复流程不应重载页面");
		assertEqual(lib.storage.rogueSlots[0].pendingEvent, null, "事件完成清空");
		assert(screenText().includes("开始下一关"), "应回到营地");
		return "读档恢复事件";
	} finally {
		Math.random = originalRandom;
	}
});

await check("事件选项：金币不足的消耗项置灰且点了没反应，可用项照常", async () => {
	freshWorld();
	putRun(0, {
		mode: "endless",
		level: 4,
		currency: { gold: 0, exp: 0 },
		pendingEvent: {
			id: "lost_robot",
			choices: [
				{ text: "修复机器人（-86 金币）", reward: { gold: -86, exp: 34 } },
				{ text: "离开", reward: {} },
			],
			createdAt: 1,
		},
	});
	session();
	const choices = nodesWithClass("wm-rogue-event-choice");
	assertEqual(choices.length, 2, "两个选项");
	assert(choices[0].classList.contains("wm-rogue-disabled"), "金币不足的消耗项应置灰");
	assert(textOf(choices[0]).includes("货币不足"), `置灰项注明原因：${textOf(choices[0])}`);
	assert(!choices[1].classList.contains("wm-rogue-disabled"), "无消耗项不置灰");
	// 点置灰项：不弹提示、不进结算、不改存档（与商店「金币不足」按钮同款静默无操作）
	const saved = JSON.stringify(lib.storage.rogueSlots[0].pendingEvent);
	clickNode(choices[0]);
	assertEqual(nodesWithClass("wm-rogue-popup").length, 0, "点了不弹任何提示");
	assert(!screenText().includes("无法选择"), "没有结算层拒绝文案");
	assertEqual(JSON.stringify(lib.storage.rogueSlots[0].pendingEvent), saved, "点了不改存档");
	assertEqual(nodesWithClass("wm-rogue-event").length, 1, "仍停留在事件页");
	// 可用项照常：选择后事件关闭
	click("离开");
	click("确定");
	assertEqual(lib.storage.rogueSlots[0].pendingEvent, null, "可用项选择后事件关闭");
	return "置灰 = 静默不可点";
});

await check("新事件真机链路：经验商人的价钱写进按钮、置灰项静默、成交后按基准扣到账", async () => {
	freshWorld();
	// 用真正的构建器把倍率换算成固定值（第 4 关基准：金币 100 / 经验 40），页面与结算吃的都是这份存档
	const pendingEvent = eventManager.buildPendingEvent("exp_merchant", 4, () => 0, 1, { curios: [] });
	putRun(0, { mode: "endless", level: 4, currency: { gold: 150, exp: 0 }, pendingEvent });
	session();
	const text = screenText();
	assert(text.includes("经验商人"), `事件页应有事件名：${text.slice(0, 240)}`);
	assert(text.includes("这是位很有信誉的商人"), `事件描述要展示：${text.slice(0, 240)}`);
	const choices = nodesWithClass("wm-rogue-event-choice");
	assertEqual(choices.length, 3, "商人三个选项");
	// 消耗项把价钱写进按钮（-100 金币 / -120 经验），白走的出口不加后缀
	assert(textOf(choices[0]).includes("-100 金币"), `金币换经验要看得见价钱：${textOf(choices[0])}`);
	assert(textOf(choices[1]).includes("-120 经验"), `经验换金币要看得见价钱：${textOf(choices[1])}`);
	assert(!textOf(choices[2]).includes("（"), `出口项不加价钱后缀：${textOf(choices[2])}`);
	// 手上一点经验都没有：第二项是「付不起」→ 置灰、点了毫无反应（与商店金币不足同款静默）
	assert(choices[1].classList.contains("wm-rogue-disabled"), "经验不足的第二项应置灰");
	const before = JSON.stringify(lib.storage.rogueSlots[0]);
	clickNode(nodesWithClass("wm-rogue-event-choice")[1]);
	assertEqual(nodesWithClass("wm-rogue-popup").length, 0, "置灰项点了不弹提示");
	assertEqual(JSON.stringify(lib.storage.rogueSlots[0]), before, "置灰项点了不改存档");
	// 金币够：点第一项 → 扣 100 金币、拿 120 经验、事件收掉
	clickNode(nodesWithClass("wm-rogue-event-choice")[0]);
	assert(screenText().includes("金币 -100"), `结算文案要报账：${screenText().slice(0, 240)}`);
	click("确定");
	const saved = lib.storage.rogueSlots[0];
	assertEqual(saved.currency.gold, 50, "扣掉一倍基准金币");
	assertEqual(saved.currency.exp, 120, "拿到三倍基准经验");
	assertEqual(saved.pendingEvent, null, "事件收掉");
	assertEqual(saved.level, 4, "事件不改关卡数（它只在胜利结算之后发生）");
	return "第 4 关基准 100/40：扣 100 金币得 120 经验";
});

await check("奇物商店：候选展示、购买后保留已购卡、同场限购、重载保持", async () => {
	freshWorld();
	putRun(0, {
		mode: "endless",
		level: 2,
		currency: { gold: 100, exp: 0 },
		// 三个技能候选定价抬高，避免干扰本用例
		shopOffers: [
			{ id: "own_one", price: 999, sold: false },
			{ id: "own_two", price: 999, sold: false },
			{ id: "own_three", price: 999, sold: false },
		],
		curioOffers: [
			{ id: "energy_core", price: 10, sold: false },
			{ id: "lucky_stone", price: 10, sold: false },
			{ id: "broken_watch", price: 10, sold: false },
		],
	});
	session();
	click("商店");
	assertEqual(nodesWithClass("wm-rogue-curio-card").length, 3, "三个奇物候选");
	const text = screenText();
	for (const token of ["奇物商店", "能量核心", "幸运石", "破损怀表", "普通", "稀有"]) {
		assert(text.includes(token), `奇物商店应显示「${token}」：${text}`);
	}
	// 概率说明按配置现算：改了 CURIO_SHOP_RATE，界面这句话不会还在报旧数字
	assert(text.includes(`有 ${Math.round(cfg.CURIO_SHOP_RATE * 100)}% 概率刷新候选`), `刷新概率说明要跟配置一致：${text.slice(0, 400)}`);
	// 技能区的 3 个购买按钮在前，奇物区的 3 个在后
	const buyButtons = nodesWithClass("wm-rogue-shop-buy");
	assertEqual(buyButtons.length, 6, "技能与奇物各三个购买按钮");
	clickNode(buyButtons[3]);
	await flush();
	const after = lib.storage.rogueSlots[0];
	assertEqual(JSON.stringify(after.curios), JSON.stringify(["energy_core"]), "奇物入袋");
	assertEqual(JSON.stringify(after.collection.curios), JSON.stringify(["energy_core"]), "图鉴记录");
	assertEqual(after.currency.gold, 90, "扣款落盘");
	// 买后保留全部候选，已购卡显示状态，其余两张当场禁用，仍可打开商店锁。
	assertEqual(after.curioOffers.length, 3, "保留整批候选");
	assertEqual(after.curioOffers[0].sold, true, "已购卡标记保存");
	assertEqual(after.curioBoughtThisRound, true, "本场购买额度用尽");
	assertEqual(nodesWithClass("wm-rogue-curio-card").length, 3, "候选卡继续显示");
	assert(!nodesWithClass("wm-rogue-curio-section")[0].classList.contains("wm-rogue-hidden"), "购买后奇物商店仍显示");
	assert(screenText().includes("已购买"), "已购卡显示已购买");
	assert(screenText().includes("本场已购买"), "其他卡片同场禁用");
	// 重载：保留本场已购标记与旧货架，不允许通过重进重复购买
	putRun(0, {}, after);
	session();
	click("商店");
	assertEqual(JSON.stringify(lib.storage.rogueSlots[0].curios), JSON.stringify(["energy_core"]), "重载后奇物仍在");
	assertEqual(lib.storage.rogueSlots[0].curioOffers.length, 3, "重载后同批候选保留");
	assertEqual(lib.storage.rogueSlots[0].curioOffers[0].sold, true, "重载后仍已购买");
	assertEqual(lib.storage.rogueSlots[0].curioBoughtThisRound, true, "重载后同场限购状态未丢");
	assertEqual(nodesWithClass("wm-rogue-curio-card").length, 3, "重载后卡片仍显示");
	assert(screenText().includes("本场已购买"), "重载后其余卡仍禁用");
	// 顶部「奇物 n」资源块进奇物管理页：与「技能 n/3」同一套入口
	clickNode(nodesWithClass("wm-rogue-res-curio")[0]);
	assert(screenText().includes("奇物（1）"), `管理页标题：${screenText()}`);
	const manage = nodesWithClass("wm-rogue-curio-manage")[0];
	assert(manage, "管理页应渲染奇物卡");
	// 刚买到的能量核心停在初始品质：当前效果 + 下一品质预览 + 按当前关卡现算的升级价
	// （第 2 关胜利经验 floor(20×√2)=28，升级价 = 10×28 = 280；这一档 exp 为 0，所以按钮置灰）
	const manageText = dump(manage);
	// 当前效果与下一品质效果都按效果表自动生成，句式统一
	for (const token of ["能量核心", "普通", "摸牌阶段额外摸 1 张牌", "下一品质：稀有", "摸牌阶段额外摸 2 张牌", "升级 280 经验（持有 0）"]) {
		assert(manageText.includes(token), `管理页卡面应显示「${token}」：${manageText}`);
	}
	assert(nodesWithClass("wm-rogue-curio-up")[0].classList.contains("wm-rogue-disabled"), "经验不足时升级按钮置灰");
	click("返回");
	assert(screenText().includes("技能商店"), "返回应回到商店");
	return "买 1 个 → 整批售罄 → 重载保持 → 管理页预览";
});

await check("奇物管理页：点升级真的升一档、原位重绘，史诗档不给按钮", async () => {
	freshWorld();
	// 第 31 关：升级价 = 10 × floor(20×√31) = 1110，给够两次的钱
	putRun(0, {
		mode: "endless",
		level: 31,
		currency: { gold: 500, exp: 5000 },
		curios: ["energy_core", "broken_watch"],
	});
	session();
	click("商店");
	clickNode(nodesWithClass("wm-rogue-res-curio")[0]);

	const cardOf = name => nodesWithClass("wm-rogue-curio-manage").find(node => dump(node).includes(name));
	const energy = cardOf("能量核心");
	const upgradeBtn = nodesWithClass("wm-rogue-curio-up")[0];
	assert(upgradeBtn && !upgradeBtn.classList.contains("wm-rogue-disabled"), "经验够时升级按钮可点");
	clickNode(upgradeBtn);
	await flush();
	let saved = lib.storage.rogueSlots[0];
	assertEqual(saved.curioQuality.energy_core, "rare", "落盘升到稀有");
	assertEqual(saved.currency.exp, 5000 - 1110, "扣掉 1110 经验");
	// 原位重绘：卡面自己变成稀有档的样子，没有重开页面
	let text = dump(cardOf("能量核心"));
	assert(text.includes("稀有") && text.includes("摸牌阶段额外摸 2 张牌"), `卡面应重绘成稀有档：${text}`);
	assert(text.includes("下一品质：史诗") && text.includes("摸牌阶段额外摸 4 张牌"), `下一档预览跟上：${text}`);
	assert(text.includes(`升级 ${1110 * 1} 经验`), `价签按当前档重算：${text}`);
	assertEqual(nodesWithClass("wm-rogue-curio-manage").length, 2, "页面没被重开（还是这两张卡）");
	// 再升一档到史诗：按钮整个拿掉，只留「已达最高品质」
	clickNode(nodesWithClass("wm-rogue-curio-up")[0]);
	await flush();
	saved = lib.storage.rogueSlots[0];
	assertEqual(saved.curioQuality.energy_core, "epic", "再升到史诗");
	assertEqual(saved.currency.exp, 5000 - 1110 * 2, "第二次也扣钱");
	text = dump(cardOf("能量核心"));
	assert(text.includes("史诗") && text.includes("摸牌阶段额外摸 4 张牌"), `史诗档卡面：${text}`);
	assert(text.includes("已达最高品质"), `链尾写「已达最高品质」：${text}`);
	const maxBtn = nodesWithClass("wm-rogue-curio-up")[0];
	assert(maxBtn.classList.contains("wm-rogue-hidden"), "链尾的升级按钮要藏起来（`.wm-rogue-hidden` 必须有 display:none 规则压得住按钮的 inline-flex）");
	// 初始就是史诗的破损怀表：一样只写「已达最高品质」
	const watch = dump(cardOf("破损怀表"));
	assert(watch.includes("已达最高品质") && !watch.includes("下一品质"), `破损怀表直接是链尾：${watch}`);
	// 隐藏之外再保一层：真去调它的回调也不会升级
	clickNode(nodesWithClass("wm-rogue-curio-up")[1]);
	await flush();
	assertEqual(lib.storage.rogueSlots[0].currency.exp, 5000 - 1110 * 2, "点链尾的按钮不扣钱");
	assertEqual(lib.storage.rogueSlots[0].curioQuality.energy_core, "epic", "也不改品质");
	click("返回");
	assert(screenText().includes("技能商店"), "返回应回到商店");
	return "升级两次 + 链尾无按钮";
});

await check("图鉴页：已发现事件与曾拥有奇物点亮，未收录显示未发现", async () => {
	freshWorld();
	putRun(0, {
		mode: "endless",
		collection: { events: ["lucky_coin", "unknown_lab", "lost_robot", "mystery_merchant", "wishing_pool"], curios: ["broken_watch", "energy_core"] },
		curios: ["broken_watch"],
	});
	session();
	click("图鉴");
	const stage = nodesWithClass("wm-rogue-index")[0];
	assert(stage, "图鉴走自建浮层");
	const text = screenText();
	// 计数一律按数据表算：事件与奇物会随内容扩充，记死的分母每次加条目都要跟着改，测不出真问题
	const eventTotal = eventsData.eventIds.length;
	const curioTotal = curiosData.curioIds.length;
	assert(text.includes(`事件（5/${eventTotal}）`), `事件计数：${text}`);
	assert(text.includes(`奇物（2/${curioTotal}）`), `奇物计数：${text}`);
	assert(text.includes("幸运硬币"), "已发现事件显示名字");
	assert(text.includes("能量核心"), "曾拥有的奇物仍在图鉴（当前已不持有）");
	// 未收录条目按「未发现」剪影展示（事件 0 个 + 奇物 5 个）
	assertEqual(nodesWithClass("wm-rogue-index-unknown").length, (eventTotal - 5) + (curioTotal - 2), "未发现条目显示？？？");
	// 已知条目按定义画配图，未收录的剪影不挂图
	const arts = nodesWithClass("wm-rogue-index-art");
	assert(arts.some(node => node.style.backgroundImage.includes("lucky_coin.png")), "事件图引用");
	assert(
		arts.filter(node => node.style.backgroundImage !== "none").every(node => node.style.backgroundImage.includes("assets/")),
		"已收录条目的图全部指向素材目录"
	);
	// 已收录的条目点得开：选项名一律单独成行，会拿到什么缩进写在它下面（固定奖励与赌局同版式）
	const cards = nodesWithClass("wm-rogue-index-card");
	const openDetail = label => {
		clickNode(cards.find(node => dump(node).includes(label)));
		const lines = nodesWithClass("wm-rogue-popup-line").map(node => node.textContent);
		assert(lines.length, `点「${label}」应弹出详情`);
		click("确定");
		assertEqual(nodesWithClass("wm-rogue-popup").length, 0, "点确定应关掉详情弹窗");
		return lines;
	};
	const coin = openDetail("幸运硬币");
	// 详情只列选项与结果：名称/介绍卡片上已有，弹层里不再重复
	assertEqual(
		JSON.stringify(coin),
		JSON.stringify([
			"「拾取」",
			"　50%：获得 2 倍本层胜利金币，获得 2 倍本层胜利经验",
			"　50%：消耗 0.5 倍本层胜利金币",
			"「观察」",
			"　无奖励",
		]),
		`幸运硬币逐行版式：${coin.join(" / ")}`
	);
	const lab = openDetail("未知实验室");
	assert(
		lab.some(line => line.includes("随机一项属性 +1（三项属性已满时改送一个随机奇物）")),
		`属性全满改送奇物的规则要写进图鉴：${lab.join(" / ")}`
	);
	// 许愿池：只列拿得到东西的那支，落空不写
	const pool = openDetail("许愿池");
	assertEqual(
		JSON.stringify(pool),
		JSON.stringify([
			"「小额许愿」",
			"　10%：投入当前金币的 10%，愿望达成按 100 倍返还",
			"「中额许愿」",
			"　50%：投入当前金币的 20%，愿望达成按 10 倍返还",
			"「大额许愿」",
			"　投入当前金币的 50%，愿望达成按 2 倍返还",
			"「离开」",
			"　无奖励",
		]),
		`许愿池逐行版式：${pool.join(" / ")}`
	);
	assert(!pool.some(line => line.includes("落空")), `落空分支不该出现在图鉴里：${pool.join(" / ")}`);
	// 奇物详情走自己的详情框：名称 + 图标 + 初始品质 + 每一档实际效果（完整升级路线见下一条用例）
	clickNode(cards.find(node => dump(node).includes("破损怀表")));
	const watchBox = nodesWithClass("wm-rogue-detail-box")[0];
	assert(watchBox, "点奇物应弹出详情框");
	const watch = dump(watchBox);
	assert(watch.includes("破损怀表"), `详情有奇物名：${watch}`);
	assert(watch.includes("初始品质：史诗"), `详情有初始品质：${watch}`);
	assert(watch.includes("额外的出牌阶段"), `详情有实际效果：${watch}`);
	click("关闭");
	assertEqual(nodesWithClass("wm-rogue-detail-popup").length, 0, "关闭后详情框移除");
	// 未发现的条目不挂监听：点了必须毫无反应，不能弹一个「尚未发现」
	const unknown = cards.find(node => dump(node).includes("未发现"));
	assert(unknown, "应有未发现条目");
	assert(!(unknown.__listeners ?? []).length, "未发现条目不该绑定点击");
	assert(!unknown.classList.contains("wm-rogue-index-clickable"), "未发现条目不该有可点样式");
	click("返回");
	assert(screenText().includes("开始下一关"), "返回应回到营地");
	return `事件 5/${eventTotal} + 奇物 2/${curioTotal} + 详情逐行`;
});

await check("图鉴页签：默认事件，切到奇物再切回，pane 显隐不带残留", async () => {
	freshWorld();
	putRun(0, { mode: "endless", collection: { events: ["lucky_coin"], curios: ["broken_watch"] } });
	session();
	click("图鉴");
	const tabs = nodesWithClass("wm-rogue-index-tab");
	assertEqual(tabs.length, 2, "事件/奇物两个页签");
	assert(tabs[0].classList.contains("wm-rogue-index-tab-active"), "默认选中事件");
	assert(!tabs[1].classList.contains("wm-rogue-index-tab-active"), "奇物默认不亮");
	const panes = nodesWithClass("wm-rogue-index-pane");
	assertEqual(panes.length, 2, "事件与奇物各一个 pane");
	assert(!panes[0].classList.contains("wm-rogue-hidden"), "事件 pane 可见");
	assert(panes[1].classList.contains("wm-rogue-hidden"), "奇物 pane 隐藏（.wm-rogue-hidden 有 display:none 规则）");
	// 切到奇物：只有奇物亮、只有事件被拿掉
	const overlay = common.currentScreenNode();
	clickNode(tabs[1]);
	assert(tabs[1].classList.contains("wm-rogue-index-tab-active"), "奇物页签高亮");
	assert(!tabs[0].classList.contains("wm-rogue-index-tab-active"), "事件页签熄灭");
	assert(panes[0].classList.contains("wm-rogue-hidden"), "事件 pane 整块隐藏");
	assert(!panes[1].classList.contains("wm-rogue-hidden"), "奇物 pane 显示");
	assertEqual(overlay.scrollTop, 0, "切换后内容区滚回页首");
	// 隐藏的 pane 里卡片监听不重复：奇物卡详情照常弹出
	const watchCard = nodesWithClass("wm-rogue-index-card").find(node => dump(node).includes("破损怀表"));
	clickNode(watchCard);
	assertEqual(nodesWithClass("wm-rogue-detail-popup").length, 1, "奇物详情照常弹出");
	click("关闭");
	assertEqual(nodesWithClass("wm-rogue-detail-popup").length, 0, "关闭后回到图鉴");
	// 反复切换：卡片与页签都不重建，监听不叠加
	const cardCount = nodesWithClass("wm-rogue-index-card").length;
	for (let i = 0; i < 3; i++) {
		clickNode(tabs[0]);
		clickNode(tabs[1]);
	}
	assertEqual(nodesWithClass("wm-rogue-index-card").length, cardCount, "反复切换卡片数量不变");
	assertEqual(nodesWithClass("wm-rogue-index-tab").length, 2, "页签不重建");
	clickNode(tabs[0]);
	assert(!panes[0].classList.contains("wm-rogue-hidden"), "切回事件 pane");
	assert(panes[1].classList.contains("wm-rogue-hidden"), "奇物 pane 重新隐藏");
	// 再进图鉴：页签状态不保留，回到默认的事件
	click("返回");
	click("图鉴");
	const tabsAgain = nodesWithClass("wm-rogue-index-tab");
	assert(tabsAgain[0].classList.contains("wm-rogue-index-tab-active"), "重进图鉴默认回到事件");
	assert(nodesWithClass("wm-rogue-index-pane")[1].classList.contains("wm-rogue-hidden"), "重进后奇物 pane 仍隐藏");
	click("返回");
	return "默认事件 → 奇物 → 事件，卡片只建一次";
});

await check("奇物详情：完整升级路线（初始 / 每档 / 最高品质），与玩家当前品质无关", async () => {
	freshWorld();
	putRun(0, {
		mode: "endless",
		collection: { events: [], curios: ["energy_core", "cursed_coin", "broken_watch", "memory_prism"] },
		curios: ["energy_core"],
		// 玩家已把它升到史诗：图鉴仍要给全链路，而不是只显示史诗那一档
		curioQuality: { energy_core: "epic" },
	});
	session();
	click("图鉴");
	clickNode(nodesWithClass("wm-rogue-index-tab")[1]);
	const cards = nodesWithClass("wm-rogue-index-card");
	const detailOf = label => {
		clickNode(cards.find(node => dump(node).includes(label)));
		const box = nodesWithClass("wm-rogue-detail-box")[0];
		assert(box, `点「${label}」应弹出详情框`);
		return {
			names: nodesWithClass("wm-rogue-detail-step-name").map(textOf),
			effects: nodesWithClass("wm-rogue-detail-effect").map(textOf),
			text: dump(box),
		};
	};
	// 数值成长：普通 1 张 → 稀有 2 张 → 史诗 4 张，逐档给该档的实际值
	const core = detailOf("能量核心");
	assertEqual(
		JSON.stringify(core.names),
		JSON.stringify(["【普通】 初始", "【稀有】", "【史诗】"]),
		`档位名：${core.names.join(" / ")}`,
	);
	assertEqual(
		JSON.stringify(core.effects),
		JSON.stringify(["摸牌阶段额外摸 1 张牌", "摸牌阶段额外摸 2 张牌", "摸牌阶段额外摸 4 张牌"]),
		`每档的实际数值：${core.effects.join(" / ")}`,
	);
	assert(core.text.includes("能量核心") && core.text.includes("初始品质：普通"), `头部有名称与初始品质：${core.text}`);
	// 负面奇物：从「金币 -10%」一路净化到「+20%」，四档全给
	const coin = detailOf("诅咒金币");
	assertEqual(coin.names.length, 4, `负面奇物走满品质链：${coin.names.join(" / ")}`);
	assert(coin.effects[0].includes("-10%"), `负面初始效果：${coin.effects.join(" / ")}`);
	assert(coin.effects[3].includes("+20%"), `最高品质效果：${coin.effects.join(" / ")}`);
	// 链尾起手只有一档：不伪造升级档
	const watch = detailOf("破损怀表");
	assertEqual(watch.names.length, 1, `史诗起手没有后续档位：${watch.names.join(" / ")}`);
	// 记忆棱镜：稀有起步两档，事件经验加成幅度逐档给（文案一律由统一效果表生成）
	const prism = detailOf("记忆棱镜");
	assertEqual(JSON.stringify(prism.names), JSON.stringify(["【稀有】 初始", "【史诗】"]), `记忆棱镜档位：${prism.names.join(" / ")}`);
	assertEqual(
		JSON.stringify(prism.effects),
		JSON.stringify(["从随机事件中获得的经验奖励额外增加 25%", "从随机事件中获得的经验奖励额外增加 50%"]),
		`记忆棱镜各档数值：${prism.effects.join(" / ")}`,
	);
	// 连点不同奇物：不叠层、不串台
	assertEqual(nodesWithClass("wm-rogue-detail-popup").length, 1, "任何时刻只有一个详情弹层");
	assert(!watch.text.includes("诅咒金币"), `详情内容不串台：${watch.text}`);
	click("关闭");
	assertEqual(nodesWithClass("wm-rogue-detail-popup").length, 0, "关闭后弹层销毁");
	assert(nodesWithClass("wm-rogue-index")[0], "关闭详情后图鉴还在原地");
	click("返回");
	assert(screenText().includes("开始下一关"), "返回应回到营地");
	return "能量核心 3 档 / 诅咒金币 4 档（含负面）/ 怀表 1 档 / 记忆棱镜 2 档";
});

await check("图鉴事件描述：裂隙三档/古代遗迹三门按 config 展示，交互选项不再写「无奖励」", async () => {
	freshWorld();
	putRun(0, {
		mode: "endless",
		collection: {
			events: ["abyss_rift", "ancient_ruins", "wandering_merchant", "curio_forge", "skill_forge", "spring_of_wisdom", "stat_training_ground", "wormhole", "memory_corridor", "extreme_training", "lost_database"],
			curios: [],
		},
	});
	session();
	click("图鉴");
	const cards = nodesWithClass("wm-rogue-index-card");
	const openDetail = label => {
		clickNode(cards.find(node => dump(node).includes(label)));
		const lines = nodesWithClass("wm-rogue-popup-line").map(textOf);
		assert(lines.length, `点「${label}」应弹出详情`);
		click("确定");
		assertEqual(nodesWithClass("wm-rogue-popup").length, 0, "点确定应关掉详情弹窗");
		return lines;
	};
	// 深渊裂隙：三档的敌人数与倍率读 config.RIFT_TIERS，每名敌人的深渊强化读 RIFT_EXTRA_AFFIXES
	const rift = openDetail("深渊裂隙");
	for (let i = 0; i < cfg.RIFT_TIERS.length; i++) {
		const expect = `　开一场 ${cfg.RIFT_TIERS[i].enemies} 名敌人的裂隙战（不算层数），胜利得 ${cfg.RIFT_TIERS[i].multiplier} 倍本层胜利金币与本层胜利经验，每名敌人自带 ${cfg.RIFT_EXTRA_AFFIXES} 个深渊强化`;
		assert(rift.includes(expect), `裂隙第 ${i + 1} 档应写明奖励规则：${rift.join(" / ")}`);
	}
	assert(!rift.includes("无奖励"), `裂隙选项不该再显示无奖励：${rift.join(" / ")}`);
	// 古代遗迹：三扇门写明品质与折算经验（折算额 = expByWin + expIfNoCurioByWin）
	const ruins = openDetail("古代遗迹");
	assert(ruins.some(line => line.includes("获得一件普通奇物（该品质已集齐时改为获得 2 倍本层胜利经验）")),
		`白门应写明普通奇物与 0.5+1.5=2 倍折算：${ruins.join(" / ")}`);
	assert(ruins.some(line => line.includes("获得一件稀有奇物（该品质已集齐时改为获得 2 倍本层胜利经验）")),
		`紫门不再是「无奖励」：${ruins.join(" / ")}`);
	assert(ruins.some(line => line.includes("获得一件负面奇物") && !line.includes("改为获得")),
		`黑门没写折算就不写「改为」：${ruins.join(" / ")}`);
	// 交互选项：商人与融合炉写明价钱规则（读 config 倍率），换技能不再显示「无奖励」
	const merchant = openDetail("流浪商人");
	assert(merchant.some(line => line.includes(`奇物基准价 ×${cfg.MERCHANT_PRICE_MULTIPLIER}`) && line.includes("升一级品质")),
		`流浪商人应写明定价规则：${merchant.join(" / ")}`);
	const forge = openDetail("奇物融合炉");
	assert(forge.some(line => line.includes(`本层胜利经验 ×${cfg.FORGE_EXP_MULTIPLIER}`)),
		`融合炉应写明费用规则：${forge.join(" / ")}`);
	const skillForge = openDetail("技能熔炉");
	assert(skillForge.some(line => line.includes("失去一个技能，换一个随机新技能")),
		`换技能选项不该是「无奖励」：${skillForge.join(" / ")}`);
	// 经验泉「再饮一口」：奖励与深渊债写同一行，并写明它是点了「饮用」之后才追问的那一句
	const spring = openDetail("经验泉");
	assert(spring.some(line => line.includes("获得 2 倍本层胜利经验") && line.includes(`每名敌人追加 ${cfg.SPRING_DEBT_AFFIXES} 个深渊强化`)),
		`再饮一口应连深渊债一起写：${spring.join(" / ")}`);
	assert(spring.some(line => line.includes("再饮一口") && line.includes("点了「饮用」之后才会问这一句")),
		`图鉴要写明第二口不是并列的按钮：${spring.join(" / ")}`);
	// 属性训练场：写了 blockedText 的 statUp，全满注记换成原话，不再是「改送随机奇物」
	const training = openDetail("属性训练场");
	assert(training.some(line => line.includes("随机一项属性 +1（属性已满时：你太厉害了，没什么能学到的东西。）")),
		`训练场的全满注记应引自 blockedText：${training.join(" / ")}`);
	assert(!training.some(line => line.includes("改送一个随机奇物")),
		`训练场不该写「改送随机奇物」：${training.join(" / ")}`);
	assert(training.some(line => line.includes("消耗 0.5 倍本层胜利经验")),
		`按钮上不标价，图鉴里照实写全：${training.join(" / ")}`);
	// 虫洞：跳关与奖励口径照实写在图鉴里（数字读事件数据，不在这里抄第二份）
	const wormhole = openDetail("虫洞");
	const skipLevels = eventsData.events.wormhole.choices[0].reward.skipLevels;
	assert(wormhole.some(line => line.includes(`跳过 ${skipLevels} 关`) && line.includes("并获得期间的全部金币与经验")),
		`虫洞应写明跳关与奖励口径：${wormhole.join(" / ")}`);
	assert(!wormhole.includes("无奖励"), `虫洞不该显示无奖励：${wormhole.join(" / ")}`);
	// 记忆回廊：深入记忆的两支概率照实写全（含失手），失手的「最多扣光」安全口径也要写进去；
	// 遗忘过去要写明是「自选一个失去」（换经验的两个入口共用这一句）
	const corridor = openDetail("记忆回廊");
	assert(corridor.some(line => line.includes("60%：获得 7 倍本层胜利经验")), `深入记忆的命中支：${corridor.join(" / ")}`);
	assert(corridor.some(line => line.includes("40%：消耗 2 倍本层胜利经验")), `深入记忆的失手支：${corridor.join(" / ")}`);
	assert(corridor.some(line => line.includes("经验不足时最多扣光手上持有的经验")), `失手的安全口径照实写全：${corridor.join(" / ")}`);
	assert(corridor.some(line => line.includes("从拥有的技能里自选一个失去")), `遗忘过去要写明是自选失去：${corridor.join(" / ")}`);
	// 极限模拟训练：两档债数读事件自己的 perEnemy（1 / 2），不再全按经验泉的默认值
	const extreme = openDetail("极限模拟训练");
	assert(extreme.some(line => line.includes("每名敌人追加 1 个深渊强化")), `极限训练债数：${extreme.join(" / ")}`);
	assert(extreme.some(line => line.includes("每名敌人追加 2 个深渊强化")), `终极训练债数：${extreme.join(" / ")}`);
	// 失落数据库：免费 / 付费 / 搏一把三档，搏一把两支都写全
	const database = openDetail("失落数据库");
	assert(database.includes("「免费读取」") && database.includes("　获得 2 倍本层胜利经验"), `免费档：${database.join(" / ")}`);
	assert(database.some(line => line.includes("消耗 2 倍本层胜利金币，获得 8 倍本层胜利经验")), `付费档：${database.join(" / ")}`);
	assert(database.some(line => line.includes("50%：获得 12 倍本层胜利经验")), `搏一把命中支：${database.join(" / ")}`);
	click("返回");
	return "裂隙 3 档 + 遗迹 3 门 + 5 个交互选项 + 三件新事件的逐行说明";
});

await check("图鉴是公有的：别的存档解锁的内容这里也看得到，删档也不丢", async () => {
	freshWorld();
	putRun(0, { mode: "endless", collection: { events: ["lucky_coin"], curios: [] } });
	// 1 号档只解锁过奇物；rogueActive 指向它，进的就是 1 号档
	putRun(1, { mode: "endless", collection: { events: [], curios: ["broken_watch", "energy_core"] } });
	session();
	click("图鉴");
	const merged = screenText();
	assert(merged.includes(`事件（1/${eventsData.eventIds.length}）`), `0 号档解锁的事件应在：${merged}`);
	assert(merged.includes(`奇物（2/${curiosData.curioIds.length}）`), `1 号档解锁的奇物应在：${merged}`);
	assert(merged.includes("幸运硬币") && merged.includes("能量核心"), "两个存档的内容同屏");
	click("返回");
	// 公有键已经落盘：把 0 号档整个删掉（连解锁记录一起），图鉴仍然留着它解锁过的事件
	assertEqual(
		JSON.stringify(lib.storage.rogueCollection),
		JSON.stringify({ events: ["lucky_coin"], curios: ["broken_watch", "energy_core"] }),
		"公有图鉴键已写入",
	);
	lib.storage.rogueSlots[0] = null;
	session();
	click("图鉴");
	const afterDelete = screenText();
	assert(afterDelete.includes(`事件（1/${eventsData.eventIds.length}）`), `删掉 0 号档后图鉴不丢：${afterDelete}`);
	assert(afterDelete.includes("幸运硬币"), "已发现事件仍在");
	click("返回");
	return "两档合并 + 删档不丢";
});

await check("战斗接入：奇物在建局时挂 rogue_curio 并写入效果总表", async () => {
	freshWorld();
	putRun(0, {
		mode: "endless",
		// 三件老的 + 三件上一轮的战斗内奇物 + 两件本轮新增（濒死回响 / 击杀成长）：新键必须照样流到 storage。
		// battle.js 以前是逐个键手写这张表，漏一个键就是「技能挂上了但数值全是 0」——
		// 逻辑层测试自己往 storage 塞数所以照绿，只有这条真机链路的用例拦得住
		curios: ["energy_core", "lucky_stone", "broken_watch", "berserker_badge", "blood_rage_core", "counter_amulet", "echo_bell", "broken_crown"],
		// 能量核心升到史诗：战斗总表要按当前品质给 +4，而不是初始的 +1
		curioQuality: { energy_core: "epic", blood_rage_core: "rare", counter_amulet: "epic", broken_crown: "epic" },
		currentBattle: {
			status: "battle",
			enemies: [{ characterId: "佐菲", stats: { defense: 0, draw: 0, attack: 0 }, skills: [], maxHp: 0, hp: 0 }],
		},
	});
	session();
	click("重新挑战这一关");
	await flush();
	assert(game.me.hasSkill("rogue_curio"), "应挂上奇物机制技");
	assertEqual(
		JSON.stringify(game.me.storage.rogue_curio),
		JSON.stringify({
			extraPhase: 1,
			extraDraw: 4,
			dyingSave: 0,
			dyingRecoverToRatio: 0,
			roundHeal: 0,
			turnHeal: 0,
			firstDamageBonus: 1,
			unrespondable: 1,
			unrespondableLowHp: 1,
			unrespondableCardDamage: 1,
			hurtDamageNext: 0,
			hurtDamageRound: 0,
			hurtDamageGame: 1,
			dyingRecallChance: 0.5,
			killGainMaxHp: 1,
			killHeal: 0,
			killHealToMax: 1,
			killDrawToMaxHp: 0,
			killDrawMaxHp: 1,
			skillSacrifice: 0,
		}),
		"storage 按当前品质写满每一张战斗内键（史诗能量核心 +4；稀有血怒核心带体力闸门与牌伤害 +1；史诗反击护符走本局那档；回响之铃的概率键要保留小数 0.5；史诗破碎王冠走「回复至上限 + 摸上限张」；幸运石是结算类不进 storage；故人的心这一场没带所以筹码键是 0）"
	);
	assertEqual(lib.hookmap.phaseBegin, true, "额外出牌阶段时机已登记");
	assertEqual(lib.hookmap.phaseDrawBegin2, true, "摸牌时机已登记");
	assertEqual(lib.hookmap.dying, true, "濒死时机已登记");
	assertEqual(lib.hookmap.roundEnd, true, "轮结束时机已登记");
	assertEqual(lib.hookmap.phaseEnd, true, "回合结束时机已登记（剩饭史诗档）");
	assertEqual(lib.hookmap.damageBegin1, true, "造成伤害加伤时机已登记（狂战/反击/血怒）");
	assertEqual(lib.hookmap.damage, true, "「我造成的伤害」时机已登记（狂战徽章认本回合第一下）");
	assertEqual(lib.hookmap.damageEnd, true, "受到伤害时机已登记（反击护符上 buff）");
	assertEqual(lib.hookmap.useCard, true, "出牌记账时机已登记（回响之铃）");
	assertEqual(lib.hookmap.die, true, "角色死亡时机已登记（破碎王冠认击杀）");
	// 「无法被响应」走的是本体两个技能标签，注册表里必须都在
	assertEqual(lib.skill.rogue_curio.ai.norespond, true, "norespond 标签已注册");
	assertEqual(lib.skill.rogue_curio.ai.playernowuxie, true, "playernowuxie 标签已注册");
	assert(game.me.hasSkill("rogue_stat"), "属性强化机制技不受影响");
	// 点「奇物」徽记 → 自建浮层面板（不再只是本体那个灰盒子 tooltip）：逐件列出名称（当前品质）与效果
	assert(!!game.me.marks.rogue_curio, "应挂上「奇物」徽记");
	tapMark(game.me.marks.rogue_curio);
	const curioText = screenText();
	for (const token of ["奇物", "能量核心（史诗）", "摸牌阶段额外摸 4 张牌", "幸运石（稀有）", "经验获取 +10%", "破损怀表（史诗）",
		"狂战徽章（稀有）", "每回合首次造成伤害后，本回合你造成的伤害 +1",
		"血怒核心（稀有）", "体力低于体力上限的一半（向上取整）时，你使用的牌无法被响应，且此牌造成的伤害 +1",
		"反击护符（史诗）", "当你受到伤害后，本局游戏你造成的伤害 +1",
		"回响之铃（普通）", "当你进入濒死状态时，有 50% 的概率获得本局游戏你使用过且位于弃牌堆的牌",
		"破碎王冠（史诗）", "你杀死一名角色后，你增加 1 点体力上限并回复体力至上限，然后摸体力上限张牌"]) {
		assert(curioText.includes(token), `奇物面板应显示「${token}」：${curioText.slice(0, 600)}`);
	}
	assertEqual(nodesWithClass("wm-rogue-stat-panel").length, 1, "奇物面板复用属性面板的版式");
	assertEqual(nodesWithClass("wm-rogue-stat-detail").length, 8, "八件奇物各一行");
	// 分两组：战斗里真生效的与结算才生效的分开，别让人以为诅咒金币/循环按钮这局马上能吃到
	const splitAt = curioText.indexOf("结算时生效");
	assert(curioText.includes("战斗内生效") && splitAt > 0, `两组标题都要在：${curioText.slice(0, 400)}`);
	assert(curioText.indexOf("能量核心") < splitAt, `战斗类的奇物不该落到结算组：${curioText.slice(0, 400)}`);
	assert(curioText.indexOf("破损怀表") < splitAt, `破损怀表是本局生效的：${curioText.slice(0, 400)}`);
	assert(curioText.indexOf("狂战徽章") < splitAt, `狂战徽章是战斗内生效的：${curioText.slice(0, 400)}`);
	assert(curioText.indexOf("回响之铃") < splitAt, `回响之铃是战斗内生效的：${curioText.slice(0, 400)}`);
	assert(curioText.indexOf("破碎王冠") < splitAt, `破碎王冠是战斗内生效的：${curioText.slice(0, 400)}`);
	assert(curioText.indexOf("幸运石") > splitAt, `幸运石只有结算加成，不该出现在战斗组：${curioText.slice(0, 400)}`);
	common.closeScreen();
	return "rogue_curio + storage 十九键全量 + 战斗/结算分组";
});

await check("挑战模式不受影响：没有奇物商店与奇物栏，图鉴只读公有内容", async () => {
	freshWorld();
	putRun(0, {
		mode: "challenge",
		currency: { gold: 100, exp: 0 },
		shopOffers: [
			{ id: "own_one", price: 999, sold: false },
			{ id: "own_two", price: 999, sold: false },
			{ id: "own_three", price: 999, sold: false },
		],
		curioOffers: [{ id: "energy_core", price: 10, sold: false }],
	});
	session();
	const hubText = screenText();
	assert(!hubText.includes("奇物（"), "闯关营地不应有奇物栏");
	click("商店");
	const text = screenText();
	assert(!text.includes("奇物商店"), `闯关商店不应有奇物分区：${text}`);
	assertEqual(nodesWithClass("wm-rogue-curio-card").length, 0, "闯关不渲染奇物卡");
	click("返回");
	// 图鉴改成公有收集册后闯关也给入口：里面是别的存档解锁的内容，闯关自己不产出
	click("图鉴");
	const indexText = screenText();
	assert(indexText.includes(`事件（0/${eventsData.eventIds.length}）`) && indexText.includes(`奇物（0/${curiosData.curioIds.length}）`), `空公有图鉴计数：${indexText}`);
	click("返回");
	return "闯关无奇物商店 / 图鉴可读但不产出";
});

await check("v3 旧档兼容：缺事件/奇物/图鉴字段时自动补齐并正常进营地", async () => {
	freshWorld();
	lib.storage.rogueSlots = [
		{
			version: 3,
			mode: "endless",
			characterId: "迪迦",
			level: 5,
			totalLevels: 0,
			currency: { gold: 66, exp: 9 },
			skills: [],
			stats: { defense: 1, draw: 0, attack: 0 },
			currentBattle: null,
			shopOffers: [],
			shopRefreshesRemaining: 2,
			cleared: false,
			createdAt: 1,
			updatedAt: 1,
		},
		null, null, null, null, null,
	];
	lib.storage.rogueActive = 0;
	session();
	// 版本迁移沿用既有约定：先弹一次迁移提示（「已从版本3迁移到4」），确认后进营地
	const notice = screenText();
	assert(notice.includes("存档读取提示") && notice.includes("迁移"), `应提示版本迁移：${notice}`);
	click("确定");
	const text = screenText();
	assert(text.includes("开始下一关"), `旧档应正常进营地：${text}`);
	// 内存里已按 v4 补齐（这里读不到 context，落盘断言放在进商店触发 persist 之后）
	// 旧档进商店：无候选（未刷新过）时奇物分区整个隐藏，不报错；进店会重掷技能候选并落盘（版本号随之更新）
	click("商店");
	// dump 不区分可见性：分区隐藏要按类名断言
	assert(nodesWithClass("wm-rogue-curio-section")[0]?.classList?.contains("wm-rogue-hidden"), "无候选时奇物商店分区隐藏");
	const saved = lib.storage.rogueSlots[0];
	assertEqual(saved.version, cfg.RUN_VERSION, "落盘后标成当前版本");
	assertEqual(saved.pendingEvent, null, "落盘补 pendingEvent");
	assertEqual(JSON.stringify(saved.collection), JSON.stringify({ events: [], curios: [] }), "落盘补空图鉴");
	assertEqual(JSON.stringify(saved.curios), "[]", "落盘补空奇物");
	assertEqual(JSON.stringify(saved.curioOffers), "[]", "落盘补空奇物候选");
	return "v3 → v4 静默补齐";
});

await check("奇物商店按配置概率门控：未命中清空旧批次且不触发事件，命中才整批上新货（先奇物商店、后事件）", async () => {
	freshWorld();
	const originalRandom = Math.random;
	try {
		// 第一胜：rng=0.5 → 既不低于奇物商店概率（CURIO_SHOP_RATE）也不低于事件概率（EVENT_TRIGGER_RATE），两样都不触发
		Math.random = () => 0.5;
		putRun(0, {
			mode: "endless",
			level: 3,
			curioOffers: [{ id: "lucky_stone", price: 66 }],
		});
		session();
		clickNormalBattle();
		await flush();
		for (const player of game.players.slice(1)) {
			player.__alive = false;
		}
		lib.element.player.dieAfter.call(game.players[1]);
		let run = lib.storage.rogueSlots[0];
		assertEqual(run.pendingEvent, null, "未命中不触发事件");
		assertEqual(JSON.stringify(run.curioOffers), "[]", "未命中清空旧批次（同一批货不许挂十几关）");
		const before = run.curioOffers.map(offer => `${offer.id}:${offer.price}`).join(",");
		assertEqual(before, "", "未命中后商店确实是空的");
		click("返回营地");
		// 第二胜：rng=0 → 奇物商店命中整批重摇、事件也触发（顺序：先候选、后事件，同一次结算先后发生）
		Math.random = () => 0;
		session();
		clickNormalBattle();
		await flush();
		for (const player of game.players.slice(1)) {
			player.__alive = false;
		}
		lib.element.player.dieAfter.call(game.players[1]);
		run = lib.storage.rogueSlots[0];
		assertEqual(run.curioOffers.length, cfg.CURIO_OFFER_COUNT, "命中后整批重摇");
		assert(run.curioOffers.map(offer => `${offer.id}:${offer.price}`).join(",") !== before, "候选确实换了新一批");
		assert(run.pendingEvent, "同一胜里事件也按概率触发");
		return "0.5 双未命中 → 0 双命中";
	} finally {
		Math.random = originalRandom;
	}
});

await check("收藏家的橱窗：锁图标只在该出现时出现，点一下切换并立即落盘", async () => {
	freshWorld();
	// 没持有 → 一枚锁都不画（玩家看不到自己用不上的东西）
	putRun(0, { mode: "endless", currentBattle: null, shopOffers: [{ id: "rogue_extra", price: 10, sold: false }] });
	session();
	click("商店");
	assertEqual(nodesWithClass("wm-rogue-shop-lock").length, 0, "没持有橱窗时没有锁图标");
	// 稀有档：只能锁技能商店
	putRun(0, { mode: "endless", curios: ["collector_showcase"], currentBattle: null, shopOffers: [{ id: "rogue_extra", price: 10, sold: false }] });
	session();
	click("商店");
	assertEqual(nodesWithClass("wm-rogue-shop-lock").length, 1, "稀有档只有技能商店一枚锁");
	assertEqual(textOf(nodesWithClass("wm-rogue-shop-lock")[0]), "🔓", "未锁时是开锁");
	clickNode(nodesWithClass("wm-rogue-shop-lock")[0]);
	await flush();
	assertEqual(lib.storage.rogueSlots[0].skillShopLocked, true, "锁定状态落盘");
	assertEqual(textOf(nodesWithClass("wm-rogue-shop-lock")[0]), "🔒", "图标原位变成锁上");
	// v15：🔒 与刷新按钮必须一致——锁上立即置灰，点下去由逻辑层拒掉（候选、次数一个都不动）
	const lockedRefresh = nodesWithClass("wm-rogue-shop-refresh")[0];
	const lockedIds = lib.storage.rogueSlots[0].shopOffers.map(offer => offer.id).join(",");
	assert(lockedRefresh.classList.contains("wm-rogue-disabled"), "🔒 时刷新按钮置灰");
	clickNode(lockedRefresh);
	await flush();
	assertEqual(lib.storage.rogueSlots[0].shopOffers.map(offer => offer.id).join(","), lockedIds, "🔒 时点刷新不重掷（逻辑层拒绝，UI 绕不过去）");
	assertEqual(lib.storage.rogueSlots[0].shopRefreshesRemaining, cfg.SKILL_REFRESH_PER_LEVEL, "🔒 时点刷新不扣次数");
	assert(screenText().includes("锁定"), `被拒时弹一句原因：${screenText()}`);
	nodesWithClass("wm-rogue-popup").forEach(node => node.remove());
	clickNode(nodesWithClass("wm-rogue-shop-lock")[0]);
	await flush();
	assertEqual(lib.storage.rogueSlots[0].skillShopLocked, false, "再点一下解锁");
	assert(!nodesWithClass("wm-rogue-shop-refresh")[0].classList.contains("wm-rogue-disabled"), "解锁后刷新按钮立即恢复可用（不用重进商店）");
	clickNode(nodesWithClass("wm-rogue-shop-refresh")[0]);
	await flush();
	assertEqual(lib.storage.rogueSlots[0].shopRefreshesRemaining, cfg.SKILL_REFRESH_PER_LEVEL - 1, "解锁后刷新真的能用（扣掉一次次数）");
	// 史诗档：技能与奇物商店各一枚，两个能同时锁
	putRun(0, {
		mode: "endless",
		curios: ["collector_showcase"],
		curioQuality: { collector_showcase: "epic" },
		currentBattle: null,
		currency: { gold: 1000, exp: 0 },
		shopOffers: [{ id: "rogue_extra", price: 10, sold: false }],
		// 货架上得压着一批货，奇物分区才会露出来（空货架时整个分区隐藏是既有设计）
		curioOffers: [{ id: "lucky_stone", price: 10 }],
	});
	session();
	click("商店");
	assertEqual(nodesWithClass("wm-rogue-shop-lock").length, 2, "史诗档技能与奇物商店各一枚锁");
	assertEqual(nodesWithClass("wm-rogue-shop-lock").map(node => textOf(node)).join(","), "🔓,🔓", "两枚锁初始都是开");
	clickNode(nodesWithClass("wm-rogue-shop-lock")[0]);
	await flush();
	clickNode(nodesWithClass("wm-rogue-shop-lock")[1]);
	await flush();
	const saved = lib.storage.rogueSlots[0];
	assertEqual(saved.skillShopLocked, true, "技能商店锁上");
	assertEqual(saved.curioShopLocked, true, "奇物商店也锁上（两个能同时锁）");
	assertEqual(nodesWithClass("wm-rogue-shop-lock").map(node => textOf(node)).join(","), "🔒,🔒", "两枚图标都变成锁上");
	return "0 枚 → 1 枚（稀有）→ 2 枚（史诗）并各自落盘；🔒 立即置灰刷新并拒绝点击，解锁立即恢复";
});

await check("商店锁结算：技能锁保住候选（买过的那张留货显示已购买），奇物锁保住整批不再掷刷新", async () => {
	const originalRandom = Math.random;
	try {
		// rng 钉在 0.999：正常路径下技能候选清空、奇物商店掷不中会置空，两处都靠锁挡住
		Math.random = () => 0.999;
		freshWorld();
		putRun(0, {
			mode: "endless",
			level: 3,
			curios: ["collector_showcase"],
			skillShopLocked: true,
			shopOffers: [
				{ id: "rogue_extra", price: 66, sold: true },
				{ id: "owned_skill", price: 44, sold: false },
			],
			shopRefreshesRemaining: 0,
		});
		session();
		clickNormalBattle();
		await flush();
		for (const player of game.players.slice(1)) {
			player.__alive = false;
		}
		lib.element.player.dieAfter.call(game.players[1]);
		let run = lib.storage.rogueSlots[0];
		assertEqual(run.shopOffers.map(offer => `${offer.id}:${offer.price}`).join(","), "rogue_extra:66,owned_skill:44", "锁着的候选连价格一起保留");
		assertEqual(
			run.shopOffers.map(offer => `${offer.sold ? "已购买" : "可售"}${offer.carried ? "+留货" : ""}`).join(","),
			"已购买+留货,可售",
			"买过的那张仍留在货架上、和正常购买一样显示已购买（用户定稿），并打上留货标记"
		);
		const shopModule = await load("src/rogue/shop.js");
		assertEqual(shopModule.getPurchasedCount(run), 0, "留货的已购买不吃新的一局的购买额度（否则另一张与刷新一起被锁死）");
		assertEqual(run.shopRefreshesRemaining, cfg.SKILL_REFRESH_PER_LEVEL, "免费的刷新次数照常刷新（规格原话：只是三个技能不刷新）");
		click("返回营地");
		// 没锁 → 照旧清空（与原来逐字一致）
		putRun(0, { mode: "endless", level: 3, shopOffers: [{ id: "rogue_extra", price: 66 }] });
		session();
		clickNormalBattle();
		await flush();
		for (const player of game.players.slice(1)) {
			player.__alive = false;
		}
		lib.element.player.dieAfter.call(game.players[1]);
		assertEqual(JSON.stringify(lib.storage.rogueSlots[0].shopOffers), "[]", "没锁照旧清空");
		click("返回营地");
		// 奇物商店锁着：rng 0.999 本会把旧批次置空，锁上后原样留货
		putRun(0, {
			mode: "endless",
			level: 3,
			curios: ["collector_showcase"],
			curioQuality: { collector_showcase: "epic" },
			curioShopLocked: true,
			curioOffers: [{ id: "lucky_stone", price: 66 }],
		});
		session();
		clickNormalBattle();
		await flush();
		for (const player of game.players.slice(1)) {
			player.__alive = false;
		}
		lib.element.player.dieAfter.call(game.players[1]);
		run = lib.storage.rogueSlots[0];
		assertEqual(run.curioOffers.map(offer => offer.id).join(","), "lucky_stone", "奇物商店既不刷新也不置空");
		assertEqual(run.curioOffers[0].price, 66, "连价定死的那一份也保留");
		return "技能三项保留（买过的留货显示已购买、刷新补满）+ 奇物整批保留";
	} finally {
		Math.random = originalRandom;
	}
});

await check("橱窗留货的已购买：下一关仍在货架上、点不动，另外两张连同刷新都是新的一局", async () => {
	const originalRandom = Math.random;
	try {
		Math.random = () => 0.999;
		freshWorld();
		putRun(0, {
			mode: "endless",
			level: 3,
			curios: ["collector_showcase"],
			skillShopLocked: true,
			currency: { gold: 999, exp: 0 },
			shopOffers: [
				{ id: "own_one", price: 66, sold: true },
				{ id: "rogue_extra", price: 44, sold: false },
				{ id: "own_two", price: 45, sold: false },
			],
			shopRefreshesRemaining: 0,
		});
		session();
		clickNormalBattle();
		await flush();
		for (const player of game.players.slice(1)) {
			player.__alive = false;
		}
		lib.element.player.dieAfter.call(game.players[1]);
		click("返回营地");
		session();
		click("商店");
		const buttons = nodesWithClass("wm-rogue-shop-buy");
		assertEqual(buttons.length, 3, "三张候选一张不少（用户要的就是下次刷新时那个技能仍保留）");
		assertEqual(textOf(buttons[0]), "已购买", "留货的那张显示与正常购买一样的「已购买」");
		assert(buttons[0].classList.contains("wm-rogue-disabled"), "留货的那张按钮置灰");
		assertEqual(textOf(buttons[1]), "购买", "另外两张在新的一关照常可买（留货不吃本局购买额度）");
		const refresh = nodesWithClass("wm-rogue-shop-refresh")[0];
		assertEqual(textOf(refresh), `刷新 ${cfg.SKILL_REFRESH_PER_LEVEL}/${cfg.SKILL_REFRESH_PER_LEVEL}`, "刷新次数照常补满，没被留货那张锁死");
		// v15：技能商店还锁着 → 刷新按钮必须置灰；点下去由逻辑层拒掉，候选与次数一个都不动
		assert(refresh.classList.contains("wm-rogue-disabled"), "锁着技能商店时刷新按钮置灰");
		clickNode(refresh);
		await flush();
		assertEqual(lib.storage.rogueSlots[0].shopOffers.map(offer => offer.id).join(","), "own_one,rogue_extra,own_two", "锁着时点刷新：候选没有重掷");
		assertEqual(lib.storage.rogueSlots[0].shopRefreshesRemaining, cfg.SKILL_REFRESH_PER_LEVEL, "锁着时点刷新：次数一次都没扣");
		assert(screenText().includes("锁定"), `被拒要说明原因：${screenText()}`);
		nodesWithClass("wm-rogue-popup").forEach(node => node.remove());
		clickNode(buttons[0]);
		await flush();
		assertEqual(lib.storage.rogueSlots[0].skills.length, 0, "点已购买那张不成交（不会再走替换页）");
		clickNode(buttons[1]);
		await flush();
		const bought = lib.storage.rogueSlots[0];
		assert(bought.skillInventory.includes("rogue_extra"), `另外那张买得动：${bought.skillInventory.join(",")}`);
		assertEqual(bought.skills.length, 0, "买到的技能只进背包，不自动装备");
		assertEqual(bought.shopOffers.map(offer => `${offer.id}:${offer.sold ? "已购买" : "可售"}${offer.carried ? "+留货" : ""}`).join(","),
			"own_one:已购买+留货,rogue_extra:已购买,own_two:可售", "这次买的算本局额度（留货那张不算）");
		assertEqual(textOf(nodesWithClass("wm-rogue-shop-buy")[2]), "本次商店已售罄", "本局额度用光后另一张才售罄");
		return "留货显示已购买 / 点不动 / 另外两张是新的一局、刷新被锁挡住";
	} finally {
		Math.random = originalRandom;
	}
});

await check("已拥有奇物不得再出现在商店：事件送的撤下候选、读档剔除过期条目", async () => {
	freshWorld();
	putRun(0, {
		mode: "endless",
		level: 2,
		currency: { gold: 100, exp: 0 },
		curioOffers: [
			{ id: "lucky_stone", price: 10, sold: false },
			{ id: "breath_belt", price: 10, sold: false },
			{ id: "broken_watch", price: 10, sold: false },
		],
	});
	session();
	// 重现用户报的脏数据路径：拆卸零件事件送了候选里也挂着的幸运石
	const pendingEvent = {
		id: "lost_robot",
		choices: [{ text: "拆卸零件", reward: { curio: "random" } }],
		createdAt: 1,
	};
	putRun(0, { pendingEvent }, lib.storage.rogueSlots[0]);
	session();
	click("拆卸零件");
	// rng 未钉：无论送出哪个，它都不应再出现在候选里
	const run = lib.storage.rogueSlots[0];
	const grantedId = run.curios[0];
	assert(grantedId, "事件送出奇物");
	assert(!run.curioOffers.some(offer => offer.id === grantedId), `事件送的奇物应从商店候选撤下：${grantedId}`);
	assertEqual(nodesWithClass("wm-rogue-popup").length, 1, "结算弹层");
	click("确定");
	// 读档清洗：手工构造「已拥有且未售出」的过期候选（旧版存档可能残留），读入即剔除
	putRun(0, {
		curios: ["energy_core"],
		curioOffers: [
			{ id: "energy_core", price: 10, sold: false },
			{ id: "lucky_stone", price: 10, sold: true },
			{ id: "broken_watch", price: 10, sold: false },
		],
	}, run);
	session();
	const cleaned = lib.storage.rogueSlots[0];
	assert(!cleaned.curioOffers.some(offer => offer.id === "energy_core" && !offer.sold), "已拥有未售出的过期候选在读档时剔除");
	return "送出即撤下 + 读档清洗";
});

// ---------------------------------------------------------------- 深渊化强化（无尽模式）

const ABYSS_TEST_IDS = ["abyss_jianbi", "abyss_kuangre"];

/** 徽记绑的是 addEventListener("click")，桩里同样记在 __listeners；这里模拟一次真实点击（带 preventDefault 等） */
function tapMark(mark) {
	assert(mark, "徽记节点应存在");
	const handler = (mark.__listeners ?? [])[0];
	assert(handler, "徽记没有绑定点击");
	handler({ preventDefault() {}, stopImmediatePropagation() {}, stopPropagation() {} });
}

await check("深渊化：敌人按存档词缀挂上技能与「深渊」徽记，点徽记看强化面板，落盘原样不变", async () => {
	freshWorld();
	putRun(0, {
		mode: "endless",
		level: 45,
		currentBattle: {
			status: "battle",
			enemies: [
				{ characterId: "佐菲", stats: { defense: 2, draw: 2, attack: 2 }, abyss: ABYSS_TEST_IDS, skills: [], maxHp: 0, hp: 0 },
				{ characterId: "赛文", stats: { defense: 3, draw: 0, attack: 0 }, abyss: [], skills: [], maxHp: 0, hp: 0 },
			],
		},
	}, stateModule.createRun("endless", "迪迦", 1));
	session();
	click("重新挑战这一关");
	await flush();
	const first = game.players[1];
	const second = game.players[2];
	assert(first && second, "应建成两个敌人");
	for (const id of ABYSS_TEST_IDS) {
		assert(first.hasSkill(id), `敌人一应挂上 ${id}`);
	}
	assertEqual(
		JSON.stringify(first.storage.abyss_affix),
		JSON.stringify(ABYSS_TEST_IDS),
		"标记载体的 storage 就是存档里那份词缀（不重掷）",
	);
	assert(first.hasSkill("abyss_affix"), "应挂上深渊标记载体");
	assert(!!first.marks.abyss_affix, "徽记节点应建在敌人身上");
	assert(!second.hasSkill("abyss_affix"), "没有词缀的敌人不该出现深渊徽记");
	// 「只有防御」的敌人也要有强化入口：防御给的是护甲/体力上限，不走 rogue_stat 那四个战斗键，
	// 只看 hasStat 的话它会连属性面板都点不开
	assert(!!second.marks.rogue_stat, "只有防御的敌人也该挂「强化」徽记");
	assert(!!first.marks.rogue_stat, "有属性的敌人应挂「强化」徽记");
	// 时机登记：坚壁走 damageBegin4、狂热走全局 roundStart，缺一个就等于技能全哑
	assertEqual(lib.hookmap.damageBegin4, true, "受伤时机已登记");
	assertEqual(lib.hookmap.roundStart, true, "轮开始时机已登记");
	// 点「深渊」徽记 → 只开深渊面板：词缀名与描述在，属性那三行不在
	tapMark(first.marks.abyss_affix);
	const overlay = common.currentScreenNode();
	const text = screenText();
	for (const token of ["深渊强化", "深渊·坚壁", "受到的伤害减半（向上取整），且至少减免2点", "深渊·狂热", "额外的回合", "佐菲"]) {
		assert(text.includes(token), `深渊面板应显示「${token}」：${text.slice(0, 400)}`);
	}
	assert(!text.includes("深渊·不屈"), "面板只列这名敌人实际拥有的词缀");
	assert(!text.includes("防御 Lv."), `深渊面板不该混进属性行：${text.slice(0, 400)}`);
	assertEqual(nodesWithClass("wm-rogue-abyss-badge").length, 0, "词缀名只保留文字，不再有胶囊徽记");
	assertEqual(nodesWithClass("wm-rogue-abyss-name").length, 2, "两个词缀各占一行紫色文字");
	const panel = nodesWithClass("wm-rogue-stat-panel")[0];
	const tapOverlay = target => overlay.__listeners[0]({ target });
	tapOverlay(panel);
	assertEqual(common.currentScreenNode(), overlay, "点面板内不应关闭");
	tapOverlay(overlay);
	assertEqual(common.currentScreenNode(), null, "点框外应直接退出");
	// 点「强化」徽记 → 只开属性面板，深渊那一段不在另一页里
	tapMark(first.marks.rogue_stat);
	const statText = screenText();
	assert(statText.includes("敌人强化") && statText.includes("防御 Lv.2"), `属性面板应只讲属性：${statText.slice(0, 300)}`);
	assert(!statText.includes("深渊"), `属性面板不该出现深渊：${statText.slice(0, 300)}`);
	common.closeScreen();
	// 玩家自己的属性面板入口不受影响（同一套绑定逻辑，两个来源共用）
	assert(!!game.me.marks.rogue_stat, "玩家属性徽记仍在");
	tapMark(game.me.marks.rogue_stat);
	assert(screenText().includes("属性强化"), "玩家徽记仍打开玩家面板");
	common.closeScreen();
	assertEqual(
		JSON.stringify(lib.storage.rogueSlots[0].currentBattle.enemies.map(entry => entry.abyss)),
		JSON.stringify([ABYSS_TEST_IDS, []]),
		"落盘的词缀原样不变",
	);
	return "挂技 + 徽记 + 面板 + 存档一致";
});

await check("深渊化：第 120 关新开战必定带词缀并随阵容落盘，恢复战斗原样挂回不重掷", async () => {
	freshWorld();
	// 无尽敌方池是「本体未禁用的角色」，桩里需要一个扩展之外的角色才组得出阵容
	lib.character["本体测试将"] ??= { hp: 4, maxHp: 4, skills: [] };
	putRun(0, { mode: "endless", level: 120 }, stateModule.createRun("endless", "迪迦", 1));
	session();
	clickNormalBattle();
	await flush();
	const notice = screenText();
	assert(!notice.includes("角色池为空"), `敌方池不应为空：${notice.slice(0, 200)}`);
	const enemies = lib.storage.rogueSlots[0].currentBattle.enemies;
	assert(enemies?.length >= 1, `应组出敌人：${enemies?.length}`);
	const snapshot = JSON.stringify(enemies.map(entry => entry.abyss));
	for (const entry of enemies) {
		assert(entry.abyss.length >= 1, "120 层每个敌人必定拿到 1 个词缀");
		assertEqual(new Set(entry.abyss).size, entry.abyss.length, "同一敌人身上词缀不重复");
	}
	enemies.forEach((entry, index) => {
		const player = game.players[index + 1];
		for (const id of entry.abyss) {
			assert(player.hasSkill(id), `场上第 ${index + 1} 个敌人应挂上 ${id}`);
		}
	});
	// 模拟中途退出再进来：恢复战斗用的是同一批词缀，绝不再随机一次
	session();
	click("重新挑战这一关");
	await flush();
	const resumed = lib.storage.rogueSlots[0].currentBattle.enemies;
	assertEqual(JSON.stringify(resumed.map(entry => entry.abyss)), snapshot, "恢复战斗后词缀完全一致");
	resumed.forEach((entry, index) => {
		const player = game.players[index + 1];
		for (const id of entry.abyss) {
			assert(player.hasSkill(id), `恢复后场上第 ${index + 1} 个敌人仍挂着 ${id}`);
		}
	});
	return `${enemies.length} 名敌人 / ${snapshot.length} 字符词缀快照`;
});

await check("深渊化不影响普通玩法：闯关高层与无尽低层的敌人都没有深渊技能", async () => {
	// rng 钉在 0.999：无尽低层的词缀数是「每名敌人 rng() < stage% 才拿 1 个」的真随机，
	// 不钉住这条断言会以约 5%（5 层 1 名敌人）的概率偶然变红——与玩法无关的抖动，不是回归
	const originalRandom = Math.random;
	Math.random = () => 0.999;
	try {
		for (const [mode, level, label] of [
			["challenge", 30, "闯关封顶关"],
			["endless", 5, "无尽低层"],
		]) {
			freshWorld();
			lib.character["本体测试将"] ??= { hp: 4, maxHp: 4, skills: [] };
			putRun(0, { mode, level, bossPityLevel: level - 1 }, stateModule.createRun(mode, "迪迦", 1));
			session();
			clickNormalBattle();
			await flush();
			const enemies = lib.storage.rogueSlots[0].currentBattle?.enemies ?? [];
			assert(enemies.length >= 1, `${label} 应组出敌人`);
			for (const entry of enemies) {
				assertEqual(entry.abyss.length, 0, `${label} 不该有词缀`);
			}
			game.players.slice(1).forEach(player => {
				assert(!player.hasSkill("abyss_affix"), `${label} 的敌人不该挂深渊徽记`);
			});
			assertEqual(lib.hookmap.damageBegin4, undefined, `${label} 不该登记深渊受伤时机`);
		}
	} finally {
		Math.random = originalRandom;
	}
	return "闯关 30 关 / 无尽 5 层 均无深渊技能";
});

await check("事件页资源条与「没对象可作用」：余额看得见，满级点了只弹一句、钱不动", async () => {
	freshWorld();
	const maxed = {};
	for (const id of cfg.STAT_IDS) {
		maxed[id] = statsData.stats[id].maxLevel;
	}
	putRun(0, {
		mode: "endless",
		characterId: "迪迦",
		level: 4,
		stats: maxed,
		currency: { gold: 1234, exp: 999 },
		pendingEvent: {
			id: "stat_training_ground",
			choices: [
				{ text: "接受训练", reward: { exp: -20, statUp: "defense" }, blockedText: "你太厉害了，没什么能学到的东西。" },
				{ text: "离开", reward: {} },
			],
			createdAt: 1,
		},
	});
	session();
	const text = screenText();
	assert(text.includes("1234") && text.includes("999"), `事件页要显示金币与经验：${text}`);
	assertEqual(nodesWithClass("wm-rogue-res-cell").length, 2, "事件页资源条两块（金币/经验）");
	assertEqual(nodesWithClass("wm-rogue-res-label").map(node => textOf(node)).join(","), "金币,经验", "资源条标签");
	// 满级是「没有对象可作用」，不是「付不起」：选项不置灰，点了弹一句
	const choice = nodesWithClass("wm-rogue-event-choice")[0];
	assert(!choice.classList.contains("wm-rogue-disabled"), "属性满级不该把选项置灰");
	click("接受训练");
	assertEqual(nodesWithClass("wm-rogue-popup").length, 1, "结果走浮层内弹层");
	assert(screenText().includes("你太厉害了，没什么能学到的东西"), `弹的就是作者那句：${screenText()}`);
	click("确定");
	// 这一场是从存档页进来的（读档优先回事件页），出口是营地而不是重载
	assert(screenText().includes("开始下一关"), `事件办完回营地：${screenText()}`);
	const after = lib.storage.rogueSlots[0];
	assertEqual(after.pendingEvent, null, "事件清空");
	assertEqual(after.currency.exp, 999, "经验一分不扣");
	// 大额金币与负余额：数字位数超线时挂降档类（样式在 styles.js 的 .wm-rogue-res-long/-xlong，
	// 规则本身由 rogue.test.mjs 的样式判据直读验），这里验 render 侧真的按位数挂了类
	putRun(0, {
		mode: "endless",
		characterId: "迪迦",
		level: 4,
		currency: { gold: 123456789, exp: 432100 },
		pendingEvent: {
			id: "stat_training_ground",
			choices: [
				{ text: "接受训练", reward: { exp: -20, statUp: "defense" }, blockedText: "你太厉害了，没什么能学到的东西。" },
				{ text: "离开", reward: {} },
			],
			createdAt: 1,
		},
	});
	session();
	const nums = nodesWithClass("wm-rogue-res-num");
	assertEqual(nums.length, 2, "资源条还是两块");
	assert(nums[0].classList.contains("wm-rogue-res-xlong"), "九位数金币挂最窄那档");
	assert(!nums[0].classList.contains("wm-rogue-res-long"), "两档互斥，不同时挂");
	assert(nums[1].classList.contains("wm-rogue-res-long"), "六位数经验挂中间那档");
	return "资源条两块 + 满级弹提示不扣钱 + 大额数字按位数降档";
});

await check("事件页资源条：金币 22300 / 经验 2366 原样单节点进 DOM，事件页与商人子页都不拆数字", async () => {
	// 用户截图里的那组数：金币 22300 曾显示成 2230/0（面板 align-items:center 把资源条缩到内容宽，
	// 数字被逐位折行）。DOM 桩没有排版引擎，量不出折行——这里钉「数字原样、单节点、两格齐全」，
	// 折行的根因由 rogue.test.mjs 的样式判据（撑满 + nowrap + 事件页作用域）钉死
	freshWorld();
	putRun(0, {
		mode: "endless",
		characterId: "迪迦",
		level: 4,
		currency: { gold: 22300, exp: 2366 },
		pendingEvent: {
			id: "wandering_merchant",
			choices: [
				{
					text: "和商人交易（一件货 · 标价 400 金币）",
					reward: {},
					action: { kind: "merchant", curioId: "energy_core", price: 400 },
					blockedText: "他已经把最好的一件卖给你了，这一笔做不成。",
				},
				{ text: "不买了", reward: {} },
			],
			createdAt: 1,
		},
	});
	session();
	// 事件主页面：两格、两个数字节点，各自完整
	const eventPanel = nodesWithClass("wm-rogue-event")[0];
	assert(!!eventPanel, "前提：事件面板在");
	const eventNums = collect(node => node.classList?.contains("wm-rogue-res-num"), eventPanel);
	assertEqual(eventNums.length, 2, "事件面板里恰好两个数字节点（金币/经验）");
	assertEqual(eventNums.map(node => textOf(node)).join(","), "22300,2366", "两个数字都原样写入，不拆行不省略");
	assertEqual(nodesWithClass("wm-rogue-res-cell").length, 2, "两格资源卡，不多不少");
	assertEqual(nodesWithClass("wm-rogue-res-label").map(node => textOf(node)).join(","), "金币,经验", "标签仍是金币/经验");
	// 金币 22300 是五位数：不该挂任何降档类（宽度够就不缩字号）
	assert(!eventNums[0].classList.contains("wm-rogue-res-long")
		&& !eventNums[0].classList.contains("wm-rogue-res-xlong")
		&& !eventNums[0].classList.contains("wm-rogue-res-xxlong"), "五位数在事件页维持 26px 基础档");
	// 进商人子页：同一套资源条同样两格、数字完整
	click("和商人交易");
	assertEqual(nodesWithClass("wm-rogue-merchant-overlay").length, 1, "进入商人子页");
	const subNums = nodesWithClass("wm-rogue-res-num");
	assertEqual(subNums.map(node => textOf(node)).join(","), "22300,2366", "子页数字同样原样完整");
	return "22300/2366 原样进 DOM + 两格 + 子页一致";
});

await check("事件页置灰仍按「付不起」：经验不够时选项置灰且点了毫无反应", async () => {
	freshWorld();
	putRun(0, {
		mode: "endless",
		characterId: "迪迦",
		level: 4,
		currency: { gold: 0, exp: 5 },
		pendingEvent: {
			id: "stat_training_ground",
			choices: [
				{ text: "接受训练", reward: { exp: -20, statUp: "defense" }, blockedText: "你太厉害了，没什么能学到的东西。" },
				{ text: "离开", reward: {} },
			],
			createdAt: 1,
		},
	});
	session();
	const choice = nodesWithClass("wm-rogue-event-choice")[0];
	assert(choice.classList.contains("wm-rogue-disabled"), "经验不够应置灰");
	assert(textOf(choice).includes("货币不足"), `置灰要写明原因：${textOf(choice)}`);
	click("接受训练");
	assertEqual(nodesWithClass("wm-rogue-popup").length, 0, "置灰项点了不弹任何东西");
	assertEqual(lib.storage.rogueSlots[0].currency.exp, 5, "经验不动");
	assert(lib.storage.rogueSlots[0].pendingEvent, "事件仍挂着，可以改选别的");
	return "钱不够 = 静默不可点";
});

await check("属性训练场满级：按钮不标价、缺经验也不置灰，点了只弹作者那句", async () => {
	freshWorld();
	const maxed = {};
	for (const id of cfg.STAT_IDS) {
		maxed[id] = statsData.stats[id].maxLevel;
	}
	// 走真实构建路径（生产路径会给完整存档）：满级时「接受训练」不再是「要花 20 经验」的样子
	const base = stateModule.createRun("endless", "迪迦", 1);
	const pending = eventManager.buildPendingEvent("stat_training_ground", 4, () => 0, 1, {
		level: 5, statLevels: maxed, curios: [], run: { ...base, level: 5, stats: maxed },
	});
	putRun(0, { mode: "endless", level: 5, stats: maxed, currency: { gold: 0, exp: 5 }, pendingEvent: pending });
	session();
	const choice = nodesWithClass("wm-rogue-event-choice")[0];
	assert(!textOf(choice).includes("经验"), `满级时按钮不写价钱：${textOf(choice)}`);
	assert(!choice.classList.contains("wm-rogue-disabled"), "缺经验也不该置灰——这类选项本来就不花钱");
	click("接受训练");
	assertEqual(nodesWithClass("wm-rogue-popup").length, 1, "点了要弹提示");
	assert(screenText().includes("你太厉害了"), `弹的是作者那句：${screenText()}`);
	click("确定");
	assertEqual(lib.storage.rogueSlots[0].currency.exp, 5, "一分不扣");
	return "满级不标价 / 缺经验不置灰 / 弹提示";
});

await check("属性训练场（还能升、经验够）：按钮只显示「接受训练」，扣费与涨属性照旧", async () => {
	freshWorld();
	const low = {};
	for (const id of cfg.STAT_IDS) {
		low[id] = 0;
	}
	// 真实构建路径：价钱是构建期折算并进文案的那一步，hideCost 要在这一步把按钮文字收干净
	const base = stateModule.createRun("endless", "迪迦", 1);
	const pending = eventManager.buildPendingEvent("stat_training_ground", 4, () => 0, 1, {
		level: 5, statLevels: low, curios: [], run: { ...base, level: 5, stats: low, currency: { gold: 0, exp: 999 } },
	});
	putRun(0, { mode: "endless", level: 5, stats: low, currency: { gold: 0, exp: 999 }, pendingEvent: pending });
	session();
	const choice = nodesWithClass("wm-rogue-event-choice")[0];
	assertEqual(textOf(choice), "接受训练", `按钮上不写要花多少经验：${textOf(choice)}`);
	click("接受训练");
	assertEqual(lib.storage.rogueSlots[0].currency.exp, 999 - 20, "第 4 关基准 40 经验，照旧扣半层 = 20");
	assertEqual(lib.storage.rogueSlots[0].stats[cfg.STAT_IDS[0]], 1, "随机到的那一项照旧 +1");
	click("确定");
	assertEqual(lib.storage.rogueSlots[0].pendingEvent, null, "事件收掉");
	return "按钮只有「接受训练」/ 扣 20 经验 / 随机一项 +1";
});

await check("虫洞：进洞跳过十关、期间基础奖励入账，最高记录记到跳过的最后一关", async () => {
	freshWorld();
	const base = stateModule.createRun("endless", "迪迦", 1);
	// 摆在第 6 关（刚打赢第 5 关）：跳过十关落到第 16 关，正好把 Boss 保底的关卡差（16）攒满
	const pending = eventManager.buildPendingEvent("wormhole", 5, () => 0, 1, {
		level: 6, statLevels: base.stats, curios: [], run: { ...base, level: 6 },
	});
	const expect = { gold: pending.choices[0].reward.gold, exp: pending.choices[0].reward.exp };
	// 这一局是从存档页进来的（读档优先回事件页）：先把纪录摆在第 5 关，好验「记到跳过的最后一关」
	lib.storage.rogueBestEndless = { level: 5, characterId: "迪迦", updatedAt: 1 };
	putRun(0, { mode: "endless", level: 6, currency: { gold: 0, exp: 0 }, pendingEvent: pending });
	session();
	const text = screenText();
	assert(text.includes("虫洞") && text.includes("蔚蓝色的虫洞引人注目"), `事件页应展示虫洞：${text.slice(0, 240)}`);
	assertEqual(nodesWithClass("wm-rogue-event-choice").length, 2, "进入 / 离开 两个选项");
	// 虫洞页不摆余额条：整条都不画（金币/经验的数字都没出现在这一页顶上）
	assertEqual(nodesWithClass("wm-rogue-res-cell").length, 0, "虫洞页没有金币/经验条");
	assertEqual(nodesWithClass("wm-rogue-res-label").length, 0, "连标签也不留（不是把数字写成 0）");
	click("进入");
	assertEqual(nodesWithClass("wm-rogue-popup").length, 1, "结果走浮层内弹层");
	assert(screenText().includes("跳过 10 关"), `要写明跳了几关：${screenText()}`);
	click("确定");
	// 事件办完回营地：关卡已经跳到第 16 关
	assert(screenText().includes("第 16 关"), `营地应显示第 16 关：${screenText()}`);
	const slot = lib.storage.rogueSlots[0];
	assertEqual(slot.level, 16, "存档里的关卡推进十关");
	assertEqual(slot.currency.gold, expect.gold, "期间金币一次性入账");
	assertEqual(slot.currency.exp, expect.exp, "期间经验一次性入账");
	assertEqual(slot.pendingEvent, null, "事件收掉");
	assertEqual(lib.storage.rogueBestEndless.level, 15, "最高记录记到跳过的最后一关");
	// v15：跳过的这十关照样计入 Boss 保底——这一局从没出过 Boss（记录 0），落到第 16 关时
	// 关卡差刚好满 BOSS_PITY_BATTLES，下一场即使掷不中也必须是 Boss（老口径会漏掉跳过的关）
	const originalRandom = Math.random;
	try {
		Math.random = () => 1;
		click("开始下一关");
		Math.random = () => 0.5;
		await flush();
	} finally {
		Math.random = originalRandom;
	}
	const jumped = lib.storage.rogueSlots[0];
	assertEqual(jumped.currentBattle.isBossBattle, true, "跳到的第 16 关：保底照常触发（跳关也算进度）");
	assertEqual(jumped.bossPityLevel, 16, "Boss 记在第 16 关");
	return `第 6 关 → 第 16 关（${expect.gold} 金币 / ${expect.exp} 经验，记录 15）→ 第 16 关保底 Boss`;
});

await check("流浪商人：买没买过的入袋，已拥有的买回去升一级，练满了才弹提示", async () => {
	const merchantRun = patch => ({
		mode: "endless",
		characterId: "迪迦",
		level: 4,
		currency: { gold: 9999, exp: 0 },
		pendingEvent: {
			id: "wandering_merchant",
			choices: [
				{
					text: "和商人交易（一件货 · 标价 400 金币）",
					reward: {},
					action: { kind: "merchant", curioId: "energy_core", price: 400 },
					blockedText: "他已经把最好的一件卖给你了，这一笔做不成。",
				},
				{ text: "不买了", reward: {} },
			],
			createdAt: 1,
		},
		...patch,
	});
	// 第一次：没买过 → 入袋
	freshWorld();
	putRun(0, merchantRun());
	session();
	click("和商人交易");
	assertEqual(nodesWithClass("wm-rogue-merchant-overlay").length, 1, "应进入商人子页");
	assertEqual(lib.storage.rogueSlots[0].currency.gold, 9999, "只是开子页，一个钱都不扣");
	assert(lib.storage.rogueSlots[0].pendingEvent, "没成交前事件仍挂着");
	const cardText = screenText();
	assert(cardText.includes("能量核心") && cardText.includes("400"), `卡面要写着货与价：${cardText}`);
	click("买下");
	click("确定");
	const bought = lib.storage.rogueSlots[0];
	assertEqual(bought.currency.gold, 9599, "成交才扣 400");
	assertEqual(JSON.stringify(bought.curios), JSON.stringify(["energy_core"]), "奇物入袋");
	assertEqual(bought.pendingEvent, null, "事件收掉");
	// 第二次：已拥有且还能升 → 买回去是升一级，不是多一件
	freshWorld();
	putRun(0, merchantRun({ curios: ["energy_core"] }));
	session();
	click("和商人交易");
	assert(screenText().includes("买下并升级"), `已拥有的那件要写成「买下并升级」：${screenText()}`);
	click("买下并升级");
	click("确定");
	const upgraded = lib.storage.rogueSlots[0];
	assertEqual(JSON.stringify(upgraded.curioQuality), JSON.stringify({ energy_core: "rare" }), "品质升一级");
	assertEqual(JSON.stringify(upgraded.curios), JSON.stringify(["energy_core"]), "不会多出一件");
	assertEqual(upgraded.currency.gold, 9599, "照样收 400");
	// 第三次：已拥有且练满 → 「和商人交易」这一步就弹提示（没对象可作用），不进子页、不收钱
	freshWorld();
	putRun(0, merchantRun({ curios: ["energy_core"], curioQuality: { energy_core: "epic" } }));
	session();
	click("和商人交易");
	assertEqual(nodesWithClass("wm-rogue-merchant-overlay").length, 0, "满级时不进子页");
	assert(screenText().includes("他已经把最好的一件卖给你了"), `弹的就是这句：${screenText()}`);
	click("确定");
	const refused = lib.storage.rogueSlots[0];
	assertEqual(refused.currency.gold, 9999, "做不成的买卖不收钱");
	assertEqual(refused.pendingEvent, null, "事件照样收掉");
	return "入袋 / 升级 / 满级弹提示 三条分支";
});

await check("技能熔炉与奇物融合炉：选定那一刻才扣、才发", async () => {
	// 技能熔炉（换经验档）：开子页不进账，熔掉哪个才给哪个的钱
	freshWorld();
	putRun(0, {
		mode: "endless",
		characterId: "迪迦",
		level: 4,
		currency: { gold: 0, exp: 10 },
		skills: ["rogue_extra"],
		pendingEvent: {
			id: "skill_forge",
			choices: [
				{ text: "失去一个技能 → 换取大量经验", reward: { exp: 80 }, action: { kind: "skillForge", grant: "exp" }, blockedText: "技能不足，炉子里没有可以熔炼的东西。" },
				{ text: "离开", reward: {} },
			],
			createdAt: 1,
		},
	});
	session();
	click("失去一个技能");
	assertEqual(nodesWithClass("wm-rogue-skill-forge-overlay").length, 1, "应进入技能熔炉子页");
	assertEqual(lib.storage.rogueSlots[0].currency.exp, 10, "开子页不进账");
	click("熔炼此技能");
	click("确定");
	const melted = lib.storage.rogueSlots[0];
	assertEqual(JSON.stringify(melted.skills), JSON.stringify([]), "技能已失去");
	assertEqual(melted.currency.exp, 90, "10 + 80");
	assertEqual(melted.pendingEvent, null, "事件收掉");
	assert(screenText().length >= 0, "流程走完");
	// v14：候选改「完整背包」——装备栏满也照熔，熔掉装备中的会一并卸下；失去奖励按件结账
	freshWorld();
	putRun(0, {
		mode: "endless",
		characterId: "迪迦",
		level: 4,
		currency: { gold: 0, exp: 0 },
		skills: ["own_one", "own_two", "own_three"],
		skillInventory: ["own_one", "own_two", "own_three", "rogue_extra"],
		curios: ["oblivion_stone", "gluttonous_box"],
		pendingEvent: {
			id: "skill_forge",
			choices: [
				{ text: "失去一个技能 → 换取大量经验", reward: { exp: 80 }, action: { kind: "skillForge", grant: "exp" }, blockedText: "技能不足，炉子里没有可以熔炼的东西。" },
				{ text: "离开", reward: {} },
			],
			createdAt: 1,
		},
	});
	session();
	click("失去一个技能");
	const forgeText = screenText();
	assertEqual(nodesWithClass("wm-rogue-replace-card").length, 4, "候选 = 完整背包（三个装备 + 一个背包）");
	assert(forgeText.includes("已装备"), `装备中的技能带「已装备」状态签：${forgeText.slice(0, 300)}`);
	// 熔掉只在背包里的那个（第 4 张）：装备位一个不动
	clickNode(nodesWithClass("wm-rogue-replace-btn")[3]);
	click("确定");
	const meltedBag = lib.storage.rogueSlots[0];
	assertEqual(JSON.stringify(meltedBag.skills), JSON.stringify(["own_one", "own_two", "own_three"]), "装备位一个不动");
	assertEqual(JSON.stringify(meltedBag.skillInventory), JSON.stringify(["own_one", "own_two", "own_three"]), "背包删掉熔掉的那个");
	const meltBase = rewardsData.getEndlessReward(4, ["gold", "exp"]);
	assertEqual(meltedBag.currency.gold, meltBase.gold * 10, "遗忘之石按件发钱（1 件 = 10 倍本层胜利金币）");
	assertEqual(meltedBag.currency.exp, 80 + meltBase.exp * 10, "事件经验 + 贪食魔盒按件经验");
	assertEqual(meltedBag.pendingEvent, null, "事件收掉");
	// 奇物融合炉：扣的是事件里定死的那笔经验，升的是选定的那一件
	freshWorld();
	putRun(0, {
		mode: "endless",
		characterId: "迪迦",
		level: 4,
		currency: { gold: 0, exp: 120 },
		curios: ["energy_core"],
		pendingEvent: {
			id: "curio_forge",
			choices: [
				{ text: "把一件奇物投进炉子（消耗 120 经验）", reward: {}, action: { kind: "curioForge", costExp: 120 }, blockedText: "奇物不足，炉子里没有可以融合的东西。" },
				{ text: "离开", reward: {} },
			],
			createdAt: 1,
		},
	});
	session();
	click("把一件奇物投进炉子");
	assertEqual(nodesWithClass("wm-rogue-curio-forge-overlay").length, 1, "应进入奇物融合炉子页");
	assertEqual(lib.storage.rogueSlots[0].currency.exp, 120, "开子页不扣经验");
	assert(screenText().includes("融完升为：稀有"), `卡面要预览下一档：${screenText()}`);
	// 说明行里也写着「融合费」，按文字找会先命中那句没有监听的说明，所以直接点按钮节点
	clickNode(nodesWithClass("wm-rogue-replace-btn")[0]);
	click("确定");
	const forged = lib.storage.rogueSlots[0];
	assertEqual(forged.currency.exp, 0, "扣掉 120 经验");
	assertEqual(JSON.stringify(forged.curioQuality), JSON.stringify({ energy_core: "rare" }), "品质升一级");
	assertEqual(forged.pendingEvent, null, "事件收掉");
	return "熔炉两件：都是选定才扣";
});

await check("记忆回廊：遗忘过去走熔炉同一套选技页（标题=事件名），选谁失谁、经验与删除同一次提交、奇物联动照结算", async () => {
	freshWorld();
	const pendingEvent = eventManager.buildPendingEvent("memory_corridor", 4, () => 0, 1, { curios: [] });
	putRun(0, {
		mode: "endless",
		characterId: "迪迦",
		level: 5,
		currency: { gold: 0, exp: 0 },
		skills: ["own_one"],
		skillInventory: ["own_one", "own_two"],
		curios: ["oblivion_stone", "gluttonous_box"],
		pendingEvent,
	});
	session();
	const text = screenText();
	assert(text.includes("记忆回廊") && text.includes("走廊中浮现出无数个过去的自己"), `事件页照常展示：${text.slice(0, 200)}`);
	assertEqual(nodesWithClass("wm-rogue-event-choice").length, 4, "四个选项");
	click("遗忘过去");
	// 子页复用熔炉那一套卡片，但标题换成事件名、说明与按钮读的是事件自带的两句话
	assertEqual(nodesWithClass("wm-rogue-skill-forge-overlay").length, 1, "进入选技子页");
	const subText = screenText();
	assert(subText.includes("记忆回廊") && subText.includes("从你拥有的技能里挑一个忘掉，换回大量经验。"), `子页标题与说明：${subText.slice(0, 240)}`);
	assert(subText.includes("遗忘此技能"), `按钮读事件自带的 pickLabel：${subText.slice(0, 300)}`);
	assertEqual(nodesWithClass("wm-rogue-replace-card").length, 2, "候选 = 完整背包（装备 1 + 背包 1）");
	assert(subText.includes("已装备"), `装备中的技能带状态签：${subText.slice(0, 300)}`);
	assertEqual(lib.storage.rogueSlots[0].currency.exp, 0, "开子页不进账");
	// 选装备中的那一个：装备位与背包一起删，12 倍经验 + 遗石/魔盒按件结算都在同一次提交里
	clickNode(nodesWithClass("wm-rogue-replace-btn")[0]);
	click("确定");
	const lost = lib.storage.rogueSlots[0];
	// 事件奖励按「刚打赢的第 4 关」在构建期定死；遗石/魔盒按熔炉结算时的当前关卡（第 5 关）算
	const wonBase = rewardsData.getEndlessReward(4, ["gold", "exp"]);
	const liveBase = rewardsData.getEndlessReward(5, ["gold", "exp"]);
	assertEqual(JSON.stringify(lost.skills), JSON.stringify([]), "装备位一起腾空");
	assertEqual(JSON.stringify(lost.skillInventory), JSON.stringify(["own_two"]), "背包只剩没选的那个");
	assertEqual(lost.currency.exp, wonBase.exp * 12 + liveBase.exp * 10, "12 倍事件经验（构建期定死）+ 贪食魔盒按件经验");
	assertEqual(lost.currency.gold, liveBase.gold * 10, "遗忘之石按件发钱");
	assertEqual(lost.pendingEvent, null, "事件收掉");
	return "自选失去（含装备中）+ 12 倍经验与删除同一次提交 + 奇物联动";
});

await check("记忆回廊：没技能可失去只弹提示不给经验；进子页后点返回＝放弃事件，技能经验一个不动", async () => {
	freshWorld();
	// ① 一件技能都没有：点「遗忘过去」弹作者那句话，一分经验不发、事件照常收掉
	const pendingEvent = eventManager.buildPendingEvent("memory_corridor", 4, () => 0, 1, { curios: [] });
	putRun(0, {
		mode: "endless",
		characterId: "迪迦",
		level: 5,
		currency: { gold: 0, exp: 0 },
		skills: [],
		skillInventory: [],
		pendingEvent,
	});
	session();
	click("遗忘过去");
	assert(screenText().includes("你没有可以遗忘的技能。"), `没技能弹的是作者那句话：${screenText().slice(0, 240)}`);
	assertEqual(lib.storage.rogueSlots[0].currency.exp, 0, "没有 12 倍经验");
	assertEqual(lib.storage.rogueSlots[0].pendingEvent, null, "事件照样收掉（与熔炉同一条纪律）");
	// ② 有技能、进子页后点返回：放弃事件，技能与经验一个不动，也不重复领
	freshWorld();
	const again = eventManager.buildPendingEvent("memory_corridor", 4, () => 0, 1, { curios: [] });
	putRun(0, {
		mode: "endless",
		characterId: "迪迦",
		level: 5,
		currency: { gold: 0, exp: 0 },
		skills: ["own_one"],
		skillInventory: ["own_one"],
		pendingEvent: again,
	});
	session();
	click("遗忘过去");
	assertEqual(nodesWithClass("wm-rogue-skill-forge-overlay").length, 1, "进入选技子页");
	click("返回");
	const abandoned = lib.storage.rogueSlots[0];
	assertEqual(abandoned.pendingEvent, null, "返回＝放弃本次事件（与商人/熔炉同一条出口）");
	assertEqual(JSON.stringify(abandoned.skills), JSON.stringify(["own_one"]), "技能一个不动");
	assertEqual(abandoned.currency.exp, 0, "经验一分不发");
	assert(screenText().includes("开始下一关"), `放弃后回到营地：${screenText().slice(0, 160)}`);
	return "无技能弹提示 / 返回即放弃";
});

await check("极限模拟训练：终极训练债记 2，下一场每名敌人各追加 2 条深渊强化并清零，中途读档不丢不重", async () => {
	freshWorld();
	const originalRandom = Math.random;
	try {
		const pendingEvent = eventManager.buildPendingEvent("extreme_training", 4, () => 0, 1, { curios: [] });
		putRun(0, {
			mode: "endless",
			characterId: "迪迦",
			level: 5,
			currency: { gold: 0, exp: 0 },
			pendingEvent,
		});
		session();
		click("终极训练");
		click("确定");
		let slot = lib.storage.rogueSlots[0];
		const base = rewardsData.getEndlessReward(4, ["exp"]);
		assertEqual(slot.currency.exp, base.exp * 10, "10 倍本层基准经验先入账");
		assertEqual(slot.abyssDebt, 2, "债记进存档");
		// 中途退出再读档：债原样保留，没丢也没被提前消费
		session();
		slot = lib.storage.rogueSlots[0];
		assertEqual(slot.abyssDebt, 2, "读档后债原样保留");
		// 开下一场（第 5 关）：rng 钉 0.9——本关随机词缀只要 5% 概率、必然不命中，
		// 所以每人身上的词缀就恰好是债给的 2 条（多一条少一条都说明债没接上）
		Math.random = () => 0.9;
		clickNormalBattle();
		await flush();
		slot = lib.storage.rogueSlots[0];
		assertEqual(slot.abyssDebt, 0, "开战即消费并清零");
		assertEqual(slot.currentBattle.enemies.length, 1, "第 5 关单人敌人");
		assertEqual(slot.currentBattle.enemies[0].abyss.length, 2, `债给的 2 条词缀随阵容落盘：${JSON.stringify(slot.currentBattle.enemies[0].abyss)}`);
		return "债 2 记档 → 读档保留 → 下一场每人 +2 并清零";
	} finally {
		Math.random = originalRandom;
	}
});

await check("记忆棱镜：事件余额与账目行都吃加成、虫洞跳关不吃、子页发经验时才加成；商店购买与升级链路照常", async () => {
	freshWorld();
	// ① 事件页：免费读取 2 倍基准经验（第 4 关 40 → 80），稀有棱镜后 100——账目行报的就是 100
	const db = eventManager.buildPendingEvent("lost_database", 4, () => 0, 1, { curios: [] });
	putRun(0, {
		mode: "endless",
		characterId: "迪迦",
		level: 5,
		currency: { gold: 0, exp: 0 },
		curios: ["memory_prism"],
		pendingEvent: db,
	});
	session();
	click("免费读取");
	assert(screenText().includes("经验 +100"), `账目行与余额一致：${screenText().slice(0, 240)}`);
	click("确定");
	let slot = lib.storage.rogueSlots[0];
	assertEqual(slot.currency.exp, 100, "80 → 稀有棱镜后 100");
	assertEqual(slot.pendingEvent, null, "事件收掉");
	// ② 虫洞：跳关汇总的基础经验不吃棱镜（金额与存档里定死的那笔逐字相等）
	const worm = eventManager.buildPendingEvent("wormhole", 4, () => 0, 1, { curios: [] });
	const skipExp = worm.choices[0].reward.exp;
	putRun(0, {
		mode: "endless",
		characterId: "迪迦",
		level: 5,
		currency: { gold: 0, exp: 500 },
		curios: ["memory_prism"],
		pendingEvent: worm,
	});
	session();
	click("进入");
	click("确定");
	slot = lib.storage.rogueSlots[0];
	assertEqual(slot.currency.exp, 500 + skipExp, "跳关汇总经验一分不多（不带棱镜加成）");
	assertEqual(slot.level, 15, "照常跳过十关");
	// ③ 子页：熔炉在真正发经验那一刻加成（手搭一个 80 经验的熔炉事件，10 + round(80×1.25)）
	const forge = eventManager.buildPendingEvent("skill_forge", 4, () => 0, 1, { curios: [] });
	putRun(0, {
		mode: "endless",
		characterId: "迪迦",
		level: 5,
		currency: { gold: 0, exp: 10 },
		skills: ["own_one"],
		skillInventory: ["own_one"],
		curios: ["memory_prism"],
		pendingEvent: {
			id: "skill_forge",
			choices: [
				{ ...forge.choices[0], reward: { exp: 80 } },
				forge.choices[2],
			],
			createdAt: 1,
		},
	});
	session();
	click("失去一个技能");
	clickNode(nodesWithClass("wm-rogue-replace-btn")[0]);
	click("确定");
	slot = lib.storage.rogueSlots[0];
	assertEqual(slot.currency.exp, 10 + 100, "子页发经验时才加成：80 → 100");
	// ④ 商店：棱镜能买、能升，升级后效果文案跟着换（统一效果表的 25% → 50%）。
	// 进店时技能候选会被重掷，所以先给三张高价技能卡占位，买的那一格才是奇物
	putRun(0, {
		mode: "endless",
		characterId: "迪迦",
		level: 2,
		currency: { gold: 100, exp: 999 },
		shopOffers: [
			{ id: "own_one", price: 999, sold: false },
			{ id: "own_two", price: 999, sold: false },
			{ id: "own_three", price: 999, sold: false },
		],
		curioOffers: [{ id: "memory_prism", price: 10, sold: false }],
	});
	session();
	click("商店");
	assert(screenText().includes("记忆棱镜") && screenText().includes("从随机事件中获得的经验奖励额外增加 25%"), `商店卡面走统一文案：${screenText().slice(0, 320)}`);
	clickNode(nodesWithClass("wm-rogue-shop-buy")[3]);
	await flush();
	slot = lib.storage.rogueSlots[0];
	assertEqual(JSON.stringify(slot.curios), JSON.stringify(["memory_prism"]), "购买入袋");
	assertEqual(slot.currency.gold, 90, "扣款落盘");
	clickNode(nodesWithClass("wm-rogue-res-curio")[0]);
	assertEqual(nodesWithClass("wm-rogue-curio-up").length, 1, "管理页一张升级按钮");
	clickNode(nodesWithClass("wm-rogue-curio-up")[0]);
	await flush();
	slot = lib.storage.rogueSlots[0];
	assertEqual(slot.curioQuality.memory_prism, "epic", "升到史诗");
	assert(screenText().includes("额外增加 50%"), `升级后效果文案跟着变：${screenText().slice(0, 320)}`);
	return "事件 100 / 虫洞不吃 / 子页 80→100 / 购买升级链路";
});

await check("深渊裂隙：先确认再进场，敌人数与词缀按事件参数生成，胜利只发定死的钱且不推进关卡", async () => {
	freshWorld();
	putRun(0, {
		mode: "endless",
		characterId: "迪迦",
		level: 5,
		currency: { gold: 0, exp: 0 },
		shopRefreshesRemaining: 0,
		// 保底记录先摆一个值：裂隙战既不参与保底、也绝不许把它挪走（它本来就不改关卡）
		bossPityLevel: 5,
		// 揣着记忆棱镜打裂隙：下面的经验断言仍是事件里定死的 320——裂隙奖励不吃棱镜（与不刷商店同一条纪律）
		curios: ["memory_prism"],
		pendingEvent: {
			id: "abyss_rift",
			choices: [
				{ text: "打五个（5 名敌人 · 胜利 800 金币 320 经验）", reward: {}, action: { kind: "rift", tier: 1, level: 4, enemies: 5, affixes: 1, gold: 800, exp: 320 } },
				{ text: "我不打扰了，我走了哈", reward: {} },
			],
			createdAt: 1,
		},
	});
	session();
	click("打五个");
	assertEqual(nodesWithClass("wm-rogue-popup").length, 1, "战败即删档，点下去必须先确认一次");
	assert(screenText().includes("删除"), `确认框要讲清代价：${screenText()}`);
	click("再想想");
	assertEqual(nodesWithClass("wm-rogue-popup").length, 0, "「再想想」只关询问框");
	assert(lib.storage.rogueSlots[0].pendingEvent, "没进去之前事件仍挂着");
	click("打五个");
	click("进去");
	await flush();
	// 裂隙**不在旧会话里开打**：这一局的 game.over 已经跑过（_status.over / ui.clear），
	// 引擎里没有「同一页面再开一局」的先例——所以走「落盘 + 整页重载 + 恢复页进入」，
	// 与「开始下一关」逐字同一条路。真机上少了这一步就是「点了进去没反应、存档里却躺着未结算战斗」
	assert(log.some(item => item.type === "reload"), "裂隙要落盘后整页重载，不能在打完一局的会话里直接开");
	const entered = lib.storage.rogueSlots[0];
	assertEqual(entered.pendingEvent, null, "进场即收掉事件");
	assertEqual(entered.level, 5, "进场不推进关卡");
	assertEqual(entered.currentBattle.enemies.length, 5, "裂隙指定的 5 名敌人");
	// 起始层改为 1 后第 5 层也参与正常随机：每个敌人至少有裂隙固定追加的那一条，
	// 正常随机的命中会在此之上叠加（同一条不放回规则，永不重复）
	assert(entered.currentBattle.enemies.every(entry => entry.abyss.length >= 1), `裂隙每名敌人至少自带一条：${entered.currentBattle.enemies.map(e => e.abyss.length).join(",")}`);
	assert(entered.currentBattle.enemies.every(entry => new Set(entry.abyss).size === entry.abyss.length), "同一敌人身上的词缀不重复");
	assertEqual(JSON.stringify(entered.currentBattle.rift), JSON.stringify({ level: 4, enemies: 5, affixes: 1, gold: 800, exp: 320 }), "rift 参数落盘，重载后靠它把这场该发多少带回来");
	assertEqual(entered.currentBattle.isBossBattle, false, "裂隙场显式记为普通战斗：逐场 Boss 判定不往里套");
	assertEqual(entered.bossPityLevel, 5, "裂隙进场不碰保底记录（不参与、也不重置）");
	// 重载后落在恢复页：这一场要认得出是裂隙，而不是「战斗未正常结算」
	session();
	const resumeText = screenText();
	assert(resumeText.includes("深渊裂隙已开启"), `恢复页要写成裂隙：${resumeText}`);
	assert(resumeText.includes("不计入关卡层数"), `恢复页要讲清这一场的代价：${resumeText}`);
	assert(resumeText.includes("进入裂隙"), `按钮也要换成裂隙的说法：${resumeText}`);
	// 说明行里也写着「进入裂隙」，按文字找会先命中那句没有监听的说明，所以直接点按钮节点
	clickNode(nodesWithClass("wm-rogue-resume-primary")[0]);
	await flush();
	assertEqual(game.players.length, 1 + entered.currentBattle.enemies.length, "座位数与阵容一致（真的下场开打了）");
	// 打赢：只发定死的倍率，关卡、事件、奇物商店、刷新次数、历史最高一律不动
	for (const player of game.players.slice(1)) {
		player.__alive = false;
	}
	lib.element.player.dieAfter.call(game.players[1]);
	const won = lib.storage.rogueSlots[0];
	assertEqual(won.level, 5, "裂隙不计入关卡层数");
	assertEqual(won.currency.gold, 800, "金币 = 事件里定死的 800");
	assertEqual(won.currency.exp, 320, "经验 = 事件里定死的 320");
	assertEqual(won.pendingEvent, null, "裂隙胜利不嵌套触发事件");
	assertEqual(JSON.stringify(won.curioOffers), JSON.stringify([]), "裂隙胜利不刷奇物商店");
	assertEqual(JSON.stringify(won.curioOfferQueue), JSON.stringify([]), "也不给罗盘队列");
	assertEqual(won.shopRefreshesRemaining, 0, "刷新次数不按「通关」补");
	assertEqual(lib.storage.rogueBestEndless, undefined, "裂隙不写无尽历史最高");
	assertEqual(won.bossPityLevel, 5, "裂隙打完了也不碰保底记录");
	assertEqual(won.currentBattle, null, "战斗标记清掉");
	return "确认 → 5 名带词缀 → 只发定死的钱";
});

await check("经验泉：事件页只有「饮用」，点完才追问「再饮一口」，答了才两口一起到账", async () => {
	freshWorld();
	// 走真实构建路径：第二口的倍率、深渊债与那句问话都得在构建期定死、跟着存档走
	const build = () => eventManager.buildPendingEvent("spring_of_wisdom", 4, () => 0, 1, { level: 5, curios: [] });
	/** 追问弹层上有同名说明行，按文字找会点中没有监听了那一句，所以直接挑按钮节点 */
	const clickAskButton = prefix => {
		const node = nodesWithClass("wm-rogue-btn").find(item => textOf(item).startsWith(prefix));
		assert(node, `浮层里找不到「${prefix}」按钮：${screenText().slice(0, 400)}`);
		clickNode(node);
		return node;
	};
	putRun(0, { mode: "endless", characterId: "迪迦", level: 5, currency: { gold: 0, exp: 0 }, pendingEvent: build() });
	session();
	const buttons = nodesWithClass("wm-rogue-event-choice").map(node => textOf(node));
	assertEqual(buttons.length, 2, `事件页只给「饮用 / 离开」两个按钮：${buttons.join(" | ")}`);
	assert(!buttons.some(line => line.includes("再饮一口")), `第二口不该挂在按钮上：${buttons.join(" | ")}`);
	click("饮用");
	assertEqual(nodesWithClass("wm-rogue-popup").length, 1, "点了饮用才问那一句");
	assert(screenText().includes("泉水的滋味还留在嘴里"), `问句用的是作者写的原话：${screenText()}`);
	assertEqual(lib.storage.rogueSlots[0].currency.exp, 0, "问话阶段一分不结、不落盘");
	assert(lib.storage.rogueSlots[0].pendingEvent, "没答应之前事件照旧挂着");
	clickAskButton("再饮一口");
	const drank = lib.storage.rogueSlots[0];
	assertEqual(drank.currency.exp, 200, `两口相加（120 + 80）才落盘：${drank.currency.exp}`);
	assertEqual(drank.abyssDebt, cfg.SPRING_DEBT_AFFIXES, "第二口的债记进存档");
	assertEqual(drank.pendingEvent, null, "事件收掉");
	click("确定");
	// 另一条分支：拒绝追问就只落第一口，一分经验不少、也一分债不欠
	putRun(0, { mode: "endless", characterId: "迪迦", level: 5, currency: { gold: 0, exp: 0 }, pendingEvent: build() });
	session();
	click("饮用");
	clickAskButton("不了");
	const oneSip = lib.storage.rogueSlots[0];
	assertEqual(oneSip.currency.exp, 120, "不喝第二口就只拿 300% 那一口");
	assertEqual(oneSip.abyssDebt, 0, "拒绝了就不欠债");
	click("确定");
	return "两按钮 → 追问 → 两口 200 经验 + 债 / 拒了只落 120";
});

await check("经验泉的债：下一场每名敌人追加词缀，开战即兑现并清零", async () => {
	freshWorld();
	putRun(0, {
		mode: "endless",
		characterId: "迪迦",
		level: 4,
		abyssDebt: 2,
		pendingEvent: null,
	});
	session();
	// 深渊起始层=1：第 4 层本来就有 4% 概率随机到一条常规词缀，会把这个等值断言偶然打红；
	// 只钉住这一场创建期间的随机（0.999 恒不命中常规词缀），欠的两个照旧由债务追加
	const originalRandom = Math.random;
	Math.random = () => 0.999;
	try {
		clickNormalBattle();
	} finally {
		Math.random = originalRandom;
	}
	await flush();
	const run = lib.storage.rogueSlots[0];
	assertEqual(run.abyssDebt, 0, "开战即把债清掉");
	assertEqual(run.currentBattle.enemies.length, 1, "第 4 关常规 1 名敌人");
	assertEqual(run.currentBattle.enemies[0].abyss.length, 2, "欠两个就追加两个");
	assertEqual(new Set(run.currentBattle.enemies[0].abyss).size, 2, "追加的两个不重复");
	assertEqual(run.currentBattle.rift, null, "普通战斗不带裂隙参数（结算照旧推进关卡、照旧掷事件）");
	return "债在开战时兑现并清零";
});

await check("流浪商人：子页「右上角返回」即放弃本次事件并落盘，此后每场胜利不再重复弹同一个事件", async () => {
	freshWorld();
	const originalRandom = Math.random;
	/** 商人事件：一件货、标价定死，另有一个「不买了」的出口（与 data/events.js 同形状） */
	const merchantEvent = {
		id: "wandering_merchant",
		choices: [
			{ text: "和商人交易", reward: {}, action: { kind: "merchant", curioId: "energy_core", price: 100 } },
			{ text: "不买了", reward: {} },
		],
		createdAt: 1,
	};
	try {
		putRun(0, {
			mode: "endless",
			characterId: "迪迦",
			level: 4,
			currency: { gold: 1000, exp: 100 },
			pendingEvent: merchantEvent,
		});
		session();
		assert(screenText().includes("和商人交易"), `进档应落在事件页：${screenText()}`);
		click("和商人交易");
		assert(screenText().includes("买下"), `应进入商人子页：${screenText()}`);
		click("返回");
		// 真机症状就是这一步：以前只关页面、事件仍挂在存档上，
		// 于是回营地接着打，之后**每场胜利后**都把同一个流浪商人再弹一次
		const slot = lib.storage.rogueSlots[0];
		assertEqual(slot.pendingEvent, null, "返回＝放弃本次事件，并当场落盘");
		assertEqual(slot.currency.gold, 1000, "放弃不扣一分钱");
		assertEqual((slot.curios ?? []).length, 0, "放弃也不凭空送一件货");
		assert(screenText().includes("开始下一关"), `返回后应落在营地：${screenText()}`);
		// 重进页面（等同关游戏再开）：不该又被弹回事件页
		session();
		assert(!screenText().includes("和商人交易"), "重进页面不再弹流浪商人");
		assert(screenText().includes("开始下一关"), `重进后在营地：${screenText()}`);
		// 再打赢一场：事件判定不命中，存档里绝不躺着那个旧事件
		Math.random = () => 0.999;
		clickNormalBattle();
		await flush();
		for (const player of game.players.slice(1)) {
			player.__alive = false;
		}
		lib.element.player.dieAfter.call(game.players[1]);
		await flush();
		const won = lib.storage.rogueSlots[0];
		assertEqual(won.pendingEvent, null, "下一场胜利没有再把流浪商人弹回来");
		assert(screenText().includes("战斗胜利") && !screenText().includes("继续"), `结算页直接回营地：${screenText()}`);
		return "返回即放弃并落盘 / 重进与下一场都不复发 / 金币货物分文不动";
	} finally {
		Math.random = originalRandom;
	}
});

await check("流浪商人成交与读档：一次交易只扣一次钱，事件只结束一次", async () => {
	freshWorld();
	const merchantEvent = {
		id: "wandering_merchant",
		choices: [
			{ text: "和商人交易", reward: {}, action: { kind: "merchant", curioId: "energy_core", price: 100 } },
			{ text: "不买了", reward: {} },
		],
		createdAt: 1,
	};
	putRun(0, {
		mode: "endless",
		characterId: "迪迦",
		level: 4,
		currency: { gold: 1000, exp: 100 },
		pendingEvent: merchantEvent,
	});
	session();
	click("和商人交易");
	click("买下");
	click("确定");
	const bought = lib.storage.rogueSlots[0];
	assertEqual(bought.currency.gold, 900, "成交只扣这一笔");
	assertEqual(JSON.stringify(bought.curios), JSON.stringify(["energy_core"]), "奇物入袋");
	assertEqual(bought.pendingEvent, null, "成交后事件正确结束");
	assertEqual(JSON.stringify(bought.collection.curios), JSON.stringify(["energy_core"]), "图鉴记下曾经拥有");
	// 读档重进：不重复扣费、不重复发货、也不再弹同一个事件
	session();
	const again = lib.storage.rogueSlots[0];
	assertEqual(again.currency.gold, 900, "读档不再扣第二次");
	assertEqual(JSON.stringify(again.curios), JSON.stringify(["energy_core"]), "读档不重复发货");
	assert(!screenText().includes("和商人交易"), "读档不再弹这次已完成的交易");
	// 另一条既有规则：钱不够时点了只弹一句，事件与金币都不动
	putRun(0, {
		mode: "endless",
		characterId: "迪迦",
		level: 4,
		currency: { gold: 10, exp: 100 },
		pendingEvent: merchantEvent,
	});
	session();
	click("和商人交易");
	// 钱不够是「置灰、点了毫无反应」那一类（不是「没对象可作用」的弹一句）：按钮文字本身变成金币不足
	click("金币不足");
	const poor = lib.storage.rogueSlots[0];
	assertEqual(poor.currency.gold, 10, "买不成一个钱都不扣");
	assertEqual(poor.pendingEvent.id, "wandering_merchant", "买不成事件照旧挂着，可以重试");
});

await check("10-06 实机旧档在流浪商人处成交后：撤货补货的「商店刷新」照旧，Boss 判定与奇物商店刷新流程不受影响", async () => {
	freshWorld();
	const originalRandom = Math.random;
	try {
		Math.random = () => 0.5;
		// 商人手里那件（气息腰带）正在货架上——买走它就会撤下该格并补一件新货，
		// 这正是玩家看到的「买完之后奇物商店刷新了」的来源
		const merchantEvent = {
			id: "wandering_merchant",
			choices: [
				{ text: "和商人交易", reward: {}, action: { kind: "merchant", curioId: "breath_belt", price: 100 } },
				{ text: "不买了", reward: {} },
			],
			createdAt: 1,
		};
		putLegacyRaw(0, realV9Run({
			// level 13：v13 及更早的无记录旧档补 0，保底线在第 15 关——本用例只验商人链路，
			// 把这一局放在保底线以下，免得这一场（以及下一场）的普通/Boss 身份被保底抢走
			level: 13,
			pendingEvent: merchantEvent,
			curioOffers: [
				{ id: "breath_belt", price: 210 },
				{ id: "piggy_bank", price: 260 },
				{ id: "broken_crown", price: 180 },
			],
		}));
		session();
		ensureAceInRoster();
		click("确定");
		let slot = lib.storage.rogueSlots[0];
		assert(screenText().includes("和商人交易"), `旧档直接恢复事件页：${screenText()}`);
		click("和商人交易");
		click("买下");
		click("确定");
		slot = lib.storage.rogueSlots[0];
		assertEqual(slot.pendingEvent, null, "成交后事件正确结束");
		assert(slot.curios.includes("breath_belt"), "买到的奇物入袋");
		assertEqual(slot.currency.gold, 14785 - 100, "只扣这一笔");
		assertEqual(slot.curioOffers.length, cfg.CURIO_OFFER_COUNT, "撤下买掉的那件后补满货架（「商店刷新」的来源）");
		assert(!slot.curioOffers.some(offer => offer.id === "breath_belt"), "已拥有的那件不再挂回货架");
		for (const id of ["piggy_bank", "broken_crown"]) {
			assert(slot.curioOffers.some(offer => offer.id === id), `既有候选保留：${id}`);
		}
		// ---- 打完下一场普通战斗：奇物商店的基础概率判定照常掷（这一掷钉中）
		clickNormalBattle();
		await flush();
		slot = lib.storage.rogueSlots[0];
		assertEqual(slot.currentBattle.isBossBattle, false, "成交后的下一场照样逐场判定：这一掷没抽中");
		let calls = 0;
		Math.random = () => (calls++ === 0 ? 0.05 : 0.5);
		for (const player of game.players.slice(1)) {
			player.__alive = false;
		}
		lib.element.player.dieAfter.call(game.players[1]);
		await flush();
		slot = lib.storage.rogueSlots[0];
		assertEqual(slot.curioOffers.length, cfg.CURIO_OFFER_COUNT, "成交后的胜利里，奇物商店的基础概率判定照常执行并抽中");
		assert(slot.curioOffers.every(offer => !slot.curios.includes(offer.id)), "新一批候选同样不含已拥有的奇物");
		assertEqual(slot.pendingEvent, null, "事件判定未命中");
		click("返回营地");
		session();
		ensureAceInRoster();
		// ---- 再开一场：这一掷抽中 → 单 Boss，金币 20 倍 / 经验 8 倍，奇物商店仍按概率
		clickBossBattle();
		await flush();
		slot = lib.storage.rogueSlots[0];
		assertEqual(slot.currentBattle.isBossBattle, true, "商人成交后，Boss 判定照常按这一场掷（抽中）");
		assertEqual(slot.currentBattle.enemies.length, 1, "抽中即换单 Boss 阵容（14 关普通场本来是 2 人）");
		const goldBefore = slot.currency.gold;
		for (const player of game.players.slice(1)) {
			player.__alive = false;
		}
		lib.element.player.dieAfter.call(game.players[1]);
		await flush();
		slot = lib.storage.rogueSlots[0];
		assertEqual(slot.currency.gold - goldBefore, rewardsData.getEndlessReward(14, ["gold"]).gold * cfg.BOSS_REWARD_MULTIPLIER, "Boss 场金币 20 倍照发");
		assertEqual(slot.curioOffers.length, 0, "Boss 场不再有刷新特权：这一掷（0.5）未命中就清空");
		assertEqual(JSON.stringify(slot.skills), JSON.stringify([]), "Boss 胜利当场失去全部装备技能（旧档技能也照此清算）");
		payBossPenalty();
		slot = lib.storage.rogueSlots[0];
		assertEqual(slot.pendingBossPenalty, null, "惩罚照常可结清");
		return "成交撤货补货 → 基础概率判定照常 → Boss 判定照常（金币 20 倍、商店只按概率、技能自动清算+奇物自选）";
	} finally {
		Math.random = originalRandom;
	}
});

await check("Boss 判定边界与保底：只判无尽、严格小于、距上次 Boss 满 16 关必出、恢复不重掷、下一场各掷各的", async () => {
	freshWorld();
	const originalRandom = Math.random;
	try {
		// ① 概率边界（严格小于）：判定线直接读生产的 BOSS_RUN_RATE，保底读 BOSS_PITY_BATTLES，改旋钮不用改用例；
		// 保底那一路的入参是「模式 / 当前关卡 / 上次 Boss 的关卡」
		const rate = cfg.BOSS_RUN_RATE;
		const pity = cfg.BOSS_PITY_BATTLES;
		const endless = cfg.RUN_MODE.endless;
		assertEqual(enemyModule.shouldBossBattle(endless, 1, 0, () => rate - 1e-6, rate), true, "低于判定线 → Boss");
		assertEqual(enemyModule.shouldBossBattle(endless, 1, 0, () => rate, rate), false, "正好等于判定线 → 不中（严格小于）");
		assertEqual(enemyModule.shouldBossBattle(endless, 1, 0, () => rate * 0.5, rate), true, "半线 → Boss");
		assertEqual(enemyModule.shouldBossBattle(endless, 1, 0, () => 0.999, rate), false, "0.999 → 不中");
		assertEqual(enemyModule.shouldBossBattle(endless, pity - 1, 0, () => 0.999, rate), false, `第 ${pity - 1} 关（差 ${pity - 1} 关）仍按概率`);
		assertEqual(enemyModule.shouldBossBattle(endless, pity, 0, () => 0.999, rate), true, `第 ${pity} 关（差满 ${pity}）保底必出，概率再低也没用`);
		// 模式闸门：同样的入参换成闯关，判不出 Boss（连掷骰都不做）
		assertEqual(enemyModule.shouldBossBattle(cfg.RUN_MODE.challenge, pity, 0, () => 0, rate), false, "闯关到保底关卡差、随机钉成 0 也不判 Boss");
		// ② 保底实机链路：差阈值一关仍走概率，差满阈值即使在「永远掷不中」的随机下也必出；Boss 落地即记下这一关
		freshWorld();
		putRun(0, { mode: "endless", characterId: "迪迦", level: pity - 1, currency: { gold: 0, exp: 0 }, bossPityLevel: 0 });
		session();
		Math.random = () => 0.999999; // 概率路径永远不中（不小于判定线），保底是唯一出路
		click("开始下一关");
		Math.random = () => 0.5;
		await flush();
		let battle = lib.storage.rogueSlots[0];
		assertEqual(battle.currentBattle.isBossBattle, false, `第 ${pity - 1} 关：差 ${pity - 1} 关，仍走概率，这一掷未中`);
		assertEqual(battle.bossPityLevel, 0, "普通场一个字都不写：保底记录原样");
		// 打赢这一关（结算推进到第 pity 关，但结算本身不碰保底记录）再开下一场
		for (const player of game.players.slice(1)) {
			player.__alive = false;
		}
		lib.element.player.dieAfter.call(game.players[1]);
		await flush();
		assertEqual(lib.storage.rogueSlots[0].currentBattle, null, "普通场正常结算");
		assertEqual(lib.storage.rogueSlots[0].level, pity, `通关把进度推到第 ${pity} 关`);
		assertEqual(lib.storage.rogueSlots[0].bossPityLevel, 0, "结算是结算、保底是保底：记录还是 0");
		session();
		Math.random = () => 0.999999;
		click("开始下一关");
		Math.random = () => 0.5;
		await flush();
		battle = lib.storage.rogueSlots[0];
		assertEqual(battle.currentBattle.isBossBattle, true, `第 ${pity} 关即使掷不中也必定 Boss（保底，不消费随机源）`);
		assertEqual(battle.currentBattle.enemies.length, 1, "保底场同样换成单 Boss 阵容");
		assertEqual(battle.bossPityLevel, pity, `Boss 创建成功即记下这一关（下一次保底从 ${pity} 数到 ${pity * 2}）`);
		// ③ 抽中 Boss 后中途退出重进：恢复分支不重掷——把随机钉成「远高于判定线」也仍是那一场
		freshWorld();
		putRun(0, { mode: "endless", characterId: "迪迦", level: 3, currency: { gold: 0, exp: 0 } });
		session();
		Math.random = () => 0;
		click("开始下一关");
		await flush();
		const bossName = game.players[1].name;
		assertEqual(lib.storage.rogueSlots[0].bossPityLevel, 3, "掷出的 Boss 记在第 3 关");
		session();
		assert(screenText().includes("战斗未正常结算"), `重进应先落到恢复页：${screenText()}`);
		Math.random = () => 1;
		click("重新挑战这一关");
		await flush();
		assertEqual(game.players.length, 2, "恢复的仍是那一场单 Boss（没按 1 重掷成多敌普通场）");
		assertEqual(game.players[1].name, bossName, "敌人原样，没有重掷");
		assertEqual(game.players[1].maxHp, lib.character[bossName].maxHp * 2, "Boss 体力翻倍规则照常生效");
		assertEqual(lib.storage.rogueSlots[0].currentBattle.isBossBattle, true, "本场身份沿用存档里的判定");
		assertEqual(lib.storage.rogueSlots[0].bossPityLevel, 3, "恢复存档不重复记录（还是那一关）");
		// ④ 打完这一场，下一场重新独立判定（标记不跨场）：普通场不改保底记录
		Math.random = () => 0.5;
		for (const player of game.players.slice(1)) {
			player.__alive = false;
		}
		lib.element.player.dieAfter.call(game.players[1]);
		await flush();
		assertEqual(lib.storage.rogueSlots[0].currentBattle, null, "结算后战斗标记清空，Boss 身份随之消失");
		session();
		clickNormalBattle();
		await flush();
		assertEqual(lib.storage.rogueSlots[0].currentBattle.isBossBattle, false, "下一场各掷各的：没抽中就是普通场");
		assertEqual(lib.storage.rogueSlots[0].bossPityLevel, 3, "普通场不动记录：距上次 Boss 的关卡差交给下一场现算");
		return "四档边界(读生产概率) / 闯关不判 Boss / 差阈值一关走概率、差满阈值保底实机 / 恢复不重掷 / 逐场独立";
	} finally {
		Math.random = originalRandom;
	}
});

await check("Boss 开局性能日志：默认关闭零输出，打开后按阶段打一条摘要（统一开关，不影响玩法）", async () => {
	const originalLog = console.log;
	const logs = [];
	const capture = () => {
		logs.length = 0;
		console.log = (...args) => {
			logs.push(args.join(" "));
		};
	};
	// 用保底路径造一场 Boss 战（不消费随机源），随机钉成 0.5 让其余抽取可复现
	const startBossBattle = async () => {
		freshWorld();
		lib.character["本体测试将"] ??= { hp: 4, maxHp: 4, skills: [] };
		putRun(0, { mode: "endless", characterId: "迪迦", level: cfg.BOSS_PITY_BATTLES, currency: { gold: 0, exp: 0 }, bossPityLevel: 0 });
		session();
		click("开始下一关");
		await flush();
	};
	const originalRandom = Math.random;
	try {
		Math.random = () => 0.5;
		// ① 开关关闭（默认）：整场开局一条 [rogue/perf] 都不许有
		capture();
		await startBossBattle();
		assertEqual(lib.storage.rogueSlots[0].currentBattle.isBossBattle, true, "前提：确实打的是 Boss 战");
		assertEqual(logs.filter(line => line.includes("[rogue/perf]")).length, 0, "默认关闭时零输出");
		// ② 打开运行时常量开关：同一条链路应打出一条含各阶段名的摘要
		globalThis.roguePerfLog = true;
		capture();
		await startBossBattle();
		assertEqual(lib.storage.rogueSlots[0].currentBattle.isBossBattle, true, "前提：确实打的是 Boss 战");
		const summary = logs.filter(line => line.includes("[rogue/perf]"));
		assertEqual(summary.length, 1, `打开后恰好一条摘要：${JSON.stringify(logs.slice(0, 6))}`);
		for (const phase of ["Boss 判定/保底", "Boss 敌方池构建", "Boss 角色抽取", "来源角色筛选（含兼容性检测）",
			"复制技能整理去重", "阵容校验 resolveBattle", "存档落盘 commit", "prepareArena 建局",
			"敌方初始化与技能挂载（Boss 含复制技能）", "触发 gameStart", "起手发牌 gameDraw", "已进入回合循环"]) {
			assert(summary[0].includes(phase), `摘要应含阶段「${phase}」：${summary[0].slice(0, 400)}`);
		}
		assert(summary[0].includes("本场类型=Boss 战"), "摘要要标出本场类型");
		assert(summary[0].includes("来源候选池=") && summary[0].includes("实际扫描人数=") && summary[0].includes("兼容性检查技能条数="),
			"摘要要带来源筛选的三个计数（候选池 / 实际扫描人数 / 检查条数）");
		assertEqual(globalThis.roguePerfLast, summary[0], "摘要同时挂到 roguePerfLast");
	} finally {
		Math.random = originalRandom;
		console.log = originalLog;
		delete globalThis.roguePerfLog;
		delete globalThis.roguePerfLast;
	}
	return "关闭零输出 / 打开含全链阶段名的一条摘要";
});

await check("Boss 保底：建编失败不消耗、失败重战不推关卡、不同存档槽互不影响", async () => {
	freshWorld();
	const originalRandom = Math.random;
	// 桩的 resetState 会保留已登记角色（??=，故意让用例改数值），所以这里借「临时把角色判成不可用」
	// 之前先把原条目存下来，finally 里还原——否则隐藏 Boss 标记会漏进后面的用例、把开战全拦死
	const digaInfo = lib.character["迪迦"];
	try {
		Math.random = () => 1; // 概率路径永远不中（1 不小于判定线）
		// ① 保底已到（第 BOSS_PITY_BATTLES 关距上次 Boss 满阈值）但本场建不出来（玩家角色被本体判为不可用）：
		// 记录必须原样保留，下次仍能触发
		putRun(0, { mode: "endless", characterId: "迪迦", level: cfg.BOSS_PITY_BATTLES, currency: { gold: 0, exp: 0 }, bossPityLevel: 0 });
		session();
		lib.character["迪迦"] = { hp: 4, maxHp: 4, skills: [], isHiddenBoss: true };
		click("开始下一关");
		await flush();
		let slot = lib.storage.rogueSlots[0];
		assertEqual(slot.currentBattle, null, "角色不可用：战斗根本没创建");
		assertEqual(slot.bossPityLevel, 0, "建编失败不消耗保底，下次仍能触发");
		lib.character["迪迦"] = digaInfo;
		// ② 失败重战（闯关）：战败与重打同一关都不推进关卡，所以保底记录一次都不该变——
		// 老口径在重战建出的新一「场」上也 +1，反复失败就能把保底催出来；关卡口径没有这个口子。
		// 抽取结果直接铺满：rng 被钉在 1，现抽会判配置不足（这正是抽签对随机源敏感的地方）
		freshWorld();
		putRun(0, {
			mode: "challenge",
			characterId: "迪迦",
			level: 3,
			currency: { gold: 100, exp: 100 },
			bossPityLevel: 0,
			challengeStages: stagesData.challengeStagePool.slice(0, cfg.CHALLENGE_STAGE_LEVELS).map(config => config.id),
		});
		session();
		for (let round = 1; round <= 3; round++) {
			clickNormalBattle();
			await flush();
			slot = lib.storage.rogueSlots[0];
			assertEqual(slot.bossPityLevel, 0, `第 ${round} 次打第 3 关：记录不动`);
			game.me.__alive = false;
			game.me.hp = 0;
			lib.element.player.dieAfter.call(game.me);
			slot = lib.storage.rogueSlots[0];
			assertEqual(slot.currentBattle, null, "战败结算清掉本场");
			assertEqual(slot.level, 3, "战败不推进关卡");
			assertEqual(slot.bossPityLevel, 0, "战败结算不改保底记录");
			click("返回营地");
			session();
		}
		// ③ 不同存档槽互不影响：0 号槽存着的记录不会跟到 1 号槽
		freshWorld();
		putRun(0, { mode: "endless", characterId: "迪迦", level: 20, currency: { gold: 0, exp: 0 }, bossPityLevel: 7 });
		putRun(1, { mode: "endless", characterId: "迪迦", level: 3, currency: { gold: 0, exp: 0 } });
		session();
		clickNormalBattle();
		await flush();
		assertEqual(lib.storage.rogueSlots[1].bossPityLevel, 0, "1 号槽从 0 开始（还没出过 Boss）");
		assertEqual(lib.storage.rogueSlots[0].bossPityLevel, 7, "0 号槽的记录不被别人动");
		return "建编失败保底保留 / 三次重战都不推进保底 / 两槽独立";
	} finally {
		Math.random = originalRandom;
		lib.character["迪迦"] = digaInfo;
	}
});

await check("v14 旧档的保底折算：旧计数器按 0..19 清洗，落盘后 bossPityLevel 与折表一致且保底后果正确", async () => {
	freshWorld();
	const originalRandom = Math.random;
	try {
		// 原始 v14 档（无尽 45 关、旧计数 19）：createRun 现在会带上 v15 的字段，必须摘掉才是真实旧档形状
		const raw = { ...stateModule.createRun("endless", "迪迦", 1), version: 14, level: 45, bossPityCount: 19 };
		delete raw.bossPityLevel;
		putLegacyRaw(0, raw);
		session();
		// 抬过版本号：先弹一条「已从版本14迁移到当前版本」的提示，确认后回营地
		click("确定");
		assert(screenText().includes("第 45"), `旧档应落到营地：${screenText().slice(0, 200)}`);
		// 读档那一刻还没落盘：进一次商店（候选为空时现摇）就会 commit，折算结果届时写进存档。
		// 这里要验的是**迁移算出来的值**，所以先走一条不改保底记录的落盘路径
		Math.random = () => 0.5;
		click("商店");
		await flush();
		let slot = lib.storage.rogueSlots[0];
		assertEqual(slot.bossPityLevel, 25, "45 关 / 旧计数 19 → 25（v14 的 0..19 上界原样保留，没被新阈值 14 夹掉）");
		assertEqual(slot.bossPityCount, undefined, "折算完成后旧计数器不再写进存档");
		// 折算的可见后果：距上次 Boss 已满 20 关 → 下一场直接吃保底（不掷骰），记录随即翻到本关
		click("返回");
		click("开始下一关");
		await flush();
		slot = lib.storage.rogueSlots[0];
		assertEqual(slot.currentBattle.isBossBattle, true, "这一场直接吃保底（45-25=20 ≥ 15）");
		assertEqual(slot.bossPityLevel, 45, "Boss 落在第 45 关，保底记录翻到 45");
		return "v14 原始档 → 迁移提示 → 落盘 bossPityLevel 25 → 保底当场生效并翻到 45";
	} finally {
		Math.random = originalRandom;
	}
});

await check("Boss 惩罚：技能自动清算、奇物自选；没有对象就一句带过，绝不凑数也不建空页", async () => {
	freshWorld();
	const originalRandom = Math.random;
	/** 只有手上的技能/奇物不同，其余存档形状一致 */
	const putInventory = (skills, curios) => putRun(0, {
		mode: "endless",
		characterId: "迪迦",
		level: 2,
		currency: { gold: 50, exp: 50 },
		skills,
		curios,
	});
	/** 开一场 Boss 战并立刻打赢：胜利结算后应当直接落在惩罚页 */
	const winBossBattle = async () => {
		session();
		clickBossBattle();
		await flush();
		for (const player of game.players.slice(1)) {
			player.__alive = false;
		}
		lib.element.player.dieAfter.call(game.players[1]);
		await flush();
	};
	try {
		// ① 手上有两个装备技能、奇物一件都没有：技能当场自动清算，奇物那一项没有对象就一句带过
		putInventory(["own_one", "own_two"], []);
		await winBossBattle();
		const owed = lib.storage.rogueSlots[0];
		assertEqual(JSON.stringify(owed.skills), JSON.stringify([]), "装备技能当场全部失去");
		assertEqual(JSON.stringify(owed.skillInventory), JSON.stringify([]), "背包一并清空");
		assertEqual(owed.pendingBossPenalty, null, "奇物没有对象 → 不挂欠项、不建惩罚页");
		const page = screenText();
		assert(page.includes("Boss 战 · 战斗胜利"), `没欠项就停在胜利结算页：${page.slice(0, 160)}`);
		// 技能与奇物合成一条代价提示：件数按结算现写、奇物没有对象照实说；同一句不得重复出现
		assert(page.includes("Boss 战的代价：失去了全部 2 个装备技能，当前没有奇物可失去。"), `结算页写明技能已失去、奇物带过：${page.slice(0, 220)}`);
		assertEqual(page.split("Boss 战的代价").length - 1, 1, "两条旧提示已合成一条");
		assert(!page.includes("需要从你的奇物中选择一件失去"), "没有奇物就不该再挂着自选流程");
		assertEqual(nodesWithClass("wm-rogue-boss-card").length, 0, "不建惩罚页：一张可点卡片都没有");
		// ② 反过来：一件技能都没有、只有奇物——技能那半自动完成（没有对象、零话术），只剩奇物自选
		putInventory([], ["energy_core", "lucky_stone"]);
		await winBossBattle();
		const curioOnly = screenText();
		assert(curioOnly.includes("Boss 战的代价：当前没有装备技能可失去，需要从你的奇物中选择一件失去。"),
			`胜利后自动进惩罚页（合并句里技能那半照实写「没有」）：${curioOnly.slice(0, 160)}`);
		assert(curioOnly.includes("当前没有装备技能可失去"), `技能清算的账目依旧要交代：${curioOnly.slice(0, 260)}`);
		assert(!curioOnly.includes("点击失去这个技能"), "技能栏整个不存在，不给卡片");
		assertEqual(nodesWithClass("wm-rogue-boss-card").length, 2, "两张奇物卡");
		click("幸运石");
		click("确定");
		const afterCurio = lib.storage.rogueSlots[0];
		assertEqual(JSON.stringify(afterCurio.curios), JSON.stringify(["energy_core"]), "只删点到的那一件");
		assertEqual(JSON.stringify(afterCurio.skills), JSON.stringify([]), "技能一栏本来就没对象，一个都不该被扣");
		assertEqual(afterCurio.pendingBossPenalty, null, "只欠奇物时还清奇物即放行");
		// ③ 两类都没有对象：不创建惩罚选择页，沿用带说明的胜利结算页
		putInventory([], []);
		await winBossBattle();
		const noneText = screenText();
		assertEqual(lib.storage.rogueSlots[0].pendingBossPenalty, null, "没东西可失去就不挂欠项");
		assertEqual(nodesWithClass("wm-rogue-boss").length, 0, `不该出现空的惩罚页：${noneText.slice(0, 160)}`);
		assert(noneText.includes("Boss 战 · 战斗胜利"), `这一场仍走原胜利结算页：${noneText.slice(0, 160)}`);
		assert(noneText.includes("Boss 战的代价：当前没有装备技能可失去，也没有奇物可失去。"), `结算页要合并写明原因：${noneText}`);
		assertEqual(noneText.split("Boss 战的代价").length - 1, 1, "两类都没有对象时也只剩一条代价提示");
		// ④ v13 旧档 needSkill: false：旧版技能惩罚早已兑现，读档不得再追加一次全装备清除
		putRun(0, {
			mode: "endless",
			characterId: "迪迦",
			level: 2,
			currency: { gold: 50, exp: 50 },
			skills: ["own_one"],
			curios: ["energy_core"],
			pendingBossPenalty: { reason: "bossVictory", needSkill: false, needCurio: true },
		});
		session();
		const legacyPage = screenText();
		assert(!legacyPage.includes("失去了全部"), `不再有技能清算这一步：${legacyPage.slice(0, 240)}`);
		// 顶部大标题已删：按面板与奇物栏认页——恢复路径没有临时奖励数据，代价句不出现
		assert(legacyPage.includes("失去一件奇物") && nodesWithClass("wm-rogue-boss").length === 1, "直接停在奇物自选页");
		click("能量核心");
		click("确定");
		const legacyDone = lib.storage.rogueSlots[0];
		assertEqual(JSON.stringify(legacyDone.skills), JSON.stringify(["own_one"]), "技能一个都不许动");
		assertEqual(JSON.stringify(legacyDone.skillInventory), JSON.stringify(["own_one"]), "背包一个都不许动");
		assertEqual(legacyDone.pendingBossPenalty, null, "奇物罚完即走");
		// ⑤ v13 旧档 + 遗忘之石：**真实的旧档形状是「惩罚写档时关卡已经推进」**——第 2 关打赢 Boss、
		//    结算把 level 推到 3 之后才挂上欠项，所以档案里 level=3。迁移清算必须按反推出的第 2 关基准发奖，
		//    且只发一次、反复读档不重复派钱
		putRun(0, {
			mode: "endless",
			characterId: "迪迦",
			level: 3,
			currency: { gold: 50, exp: 0 },
			skills: ["own_one", "own_two"],
			curios: ["oblivion_stone", "energy_core"],
			pendingBossPenalty: { reason: "bossVictory", needSkill: true, needCurio: true },
		});
		session();
		assert(screenText().includes("失去了全部 2 个装备技能"), "迁移先弹清算说明");
		click("确定");
		let migrated = lib.storage.rogueSlots[0];
		const lossReward = rewardsData.getEndlessReward(2, ["gold"]).gold * 10 * 2;
		assert(rewardsData.getEndlessReward(3, ["gold"]).gold !== rewardsData.getEndlessReward(2, ["gold"]).gold, "第 2 / 3 关基准必须不同，否则这个用例分辨不出用了哪一关");
		assertEqual(migrated.currency.gold, 50 + lossReward, "按刚打赢的第 2 关基准 ×10 ×2 件（不是档案里已推进的第 3 关）");
		assertEqual(JSON.stringify(migrated.pendingBossPenalty), JSON.stringify({ reason: "bossVictory", needSkill: false, needCurio: true }), "技能欠项一次性清掉");
		session();
		migrated = lib.storage.rogueSlots[0];
		assertEqual(migrated.currency.gold, 50 + lossReward, "重复读档不重复发钱");
		payBossPenalty();
		assertEqual(lib.storage.rogueSlots[0].currency.gold, 50 + lossReward, "奇物罚完也不再动钱");
		return "技能自动清算 / 只欠奇物 → 自选 / 两类都空 → 带过 / needSkill:false 不追罚 / 迁移奖励只发一次";
	} finally {
		Math.random = originalRandom;
	}
});

await check("Boss 胜利 + 遗忘之石/贪食魔盒：按件结算、账目随惩罚页展示、读档不重复发", async () => {
	freshWorld();
	const originalRandom = Math.random;
	try {
		Math.random = () => 0.5;
		putRun(0, {
			mode: "endless",
			characterId: "迪迦",
			level: 2,
			currency: { gold: 0, exp: 0 },
			skills: ["own_one", "own_two", "own_three"],
			curios: ["oblivion_stone", "gluttonous_box", "energy_core"],
			curioQuality: { energy_core: "rare" },
		});
		session();
		clickBossBattle();
		await flush();
		for (const player of game.players.slice(1)) {
			player.__alive = false;
		}
		lib.element.player.dieAfter.call(game.players[1]);
		await flush();
		const bossBase = rewardsData.getEndlessReward(2, ["gold", "exp"]);
		// 失去技能发生在结算之后（run.level 已推进到 3），但奖励基准必须是**刚打赢的那一关**（第 2 关）——
		// 误用推进后的 level 就会按第 3 关的基准多发一份
		const lossBase = rewardsData.getEndlessReward(2, ["gold", "exp"]);
		const nextBase = rewardsData.getEndlessReward(3, ["gold", "exp"]);
		assert(lossBase.gold !== nextBase.gold && lossBase.exp !== nextBase.exp, "第 2 / 3 关基准必须不同，否则这个用例分辨不出用了哪一关");
		const bossGold = bossBase.gold * cfg.BOSS_REWARD_MULTIPLIER;
		const bossExp = bossBase.exp * cfg.BOSS_EXP_MULTIPLIER;
		const slot = lib.storage.rogueSlots[0];
		assertEqual(slot.currency.gold, bossGold + lossBase.gold * 10 * 3, "金币 = Boss 20 倍奖励 + 遗忘之石按第 2 关基准 ×10 ×3 件");
		assertEqual(slot.currency.exp, bossExp + lossBase.exp * 10 * 3, "经验 = Boss 8 倍奖励 + 贪食魔盒按第 2 关基准 ×10 ×3 件");
		assert(slot.currency.gold !== bossGold + nextBase.gold * 10 * 3, "不得按推进后的第 3 关基准算");
		assert(slot.currency.exp !== bossExp + nextBase.exp * 10 * 3, "经验同理");
		assertEqual(JSON.stringify(slot.skills), JSON.stringify([]), "三个装备技能全部失去");
		assertEqual(JSON.stringify(slot.skillInventory), JSON.stringify([]), "背包同步清空");
		// 惩罚页必须把这几行账目展示出来（自动跳转不能把这些反馈吞掉）
		const text = screenText();
		assert(text.includes("失去了全部 3 个装备技能"), `惩罚页要有清算行：${text.slice(0, 300)}`);
		assert(text.includes(`遗忘之石把失去的技能折成了 ${lossBase.gold * 10 * 3} 金币`), `遗忘之石的账目：${text.slice(0, 420)}`);
		assert(text.includes(`贪食魔盒吞下失去的技能，吐回 ${lossBase.exp * 10 * 3} 点经验`), `贪食魔盒的账目：${text.slice(0, 420)}`);
		// 付清奇物那一项；再读档一轮：结算只发生过一次，绝不重复发钱
		payBossPenalty("能量核心");
		const done = lib.storage.rogueSlots[0];
		assertEqual(done.pendingBossPenalty, null, "惩罚付清");
		assertEqual(done.currency.gold, slot.currency.gold, "付清奇物不再动金币");
		session();
		assertEqual(lib.storage.rogueSlots[0].currency.gold, slot.currency.gold, "读档重进不重复发放技能失去奖励");
		assertEqual(lib.storage.rogueSlots[0].currency.exp, slot.currency.exp, "经验同样一分不多");
		return "Boss 自动清算 3 个技能 → 遗石/魔盒各按件三次、账目上屏、读档不重复";
	} finally {
		Math.random = originalRandom;
	}
});

await check("Boss 惩罚与待处理事件的收尾顺序：先付清惩罚（含 v13 旧档技能清算），再进事件页，最后回营地", async () => {
	freshWorld();
	putRun(0, {
		mode: "endless",
		characterId: "迪迦",
		level: 6,
		currency: { gold: 200, exp: 300 },
		skills: ["own_one", "own_two"],
		curios: ["energy_core"],
		// v13 旧档形状：技能那一项还欠着（旧版「挑一个技能失去」没完成）——读档时按新规则一次性自动清算
		pendingBossPenalty: { reason: "bossVictory", needSkill: true, needCurio: true },
		pendingEvent: {
			id: "stat_training_ground",
			choices: [
				{ text: "接受训练", reward: { exp: -20, statUp: "defense" }, blockedText: "你太厉害了，没什么能学到的东西。" },
				{ text: "离开", reward: {} },
			],
			createdAt: 1,
		},
	});
	session();
	// 第一站必须是惩罚页：欠着的惩罚排在事件前面，自动跳转没有把这个顺序换掉。
	// v13 的 needSkill: true 先弹一句「失去了全部装备技能」的一次性清算说明，确认后停在奇物自选页
	const migrationText = screenText();
	assert(migrationText.includes("失去了全部 2 个装备技能"), `v13 欠技能先做一次性自动清算：${migrationText.slice(0, 240)}`);
	click("确定");
	assertEqual(nodesWithClass("wm-rogue-event").length, 0, "惩罚没付清之前不许进事件页");
	assertEqual(lib.storage.rogueSlots[0].pendingEvent.id, "stat_training_ground", "事件仍原样挂着，没有被抢先处理");
	const mid = lib.storage.rogueSlots[0];
	assertEqual(JSON.stringify(mid.skills), JSON.stringify([]), "旧档两个装备技能在清算时全部失去");
	assertEqual(JSON.stringify(mid.skillInventory), JSON.stringify([]), "背包里也不再持有");
	assertEqual(JSON.stringify(mid.pendingBossPenalty), JSON.stringify({ reason: "bossVictory", needSkill: false, needCurio: true }), "只剩奇物那一项欠账");
	assertEqual(mid.currency.gold, 200, "技能清算不涉及金币（没有遗忘之石）");
	assert(screenText().includes("失去一件奇物") && nodesWithClass("wm-rogue-boss").length === 1, `清算完停在奇物自选页：${screenText().slice(0, 160)}`);
	payBossPenalty();
	// 两项还清才轮到事件页
	const eventText = screenText();
	assertEqual(nodesWithClass("wm-rogue-event").length, 1, `惩罚付清后应进事件页：${eventText.slice(0, 160)}`);
	assert(eventText.includes("接受训练") && eventText.includes("离开"), `事件页就是存档里那两个选项：${eventText.slice(0, 200)}`);
	click("离开");
	click("确定");
	assert(screenText().includes("开始下一关"), `事件办完才回营地：${screenText()}`);
	const after = lib.storage.rogueSlots[0];
	assertEqual(after.pendingEvent, null, "事件收掉");
	assertEqual(after.pendingBossPenalty, null, "惩罚早已还清");
	assertEqual(JSON.stringify(after.skills), JSON.stringify([]), "技能已由一次性迁移清算，不会再来一次");
	assertEqual(JSON.stringify(after.curios), JSON.stringify([]), "奇物按玩家的选择失去");
	assertEqual(after.level, 6, "这套收尾不动关卡");
	return "惩罚（含 v13 迁移清算）→ 事件 → 营地，三步顺序固定";
});

// ---------------------------------------------------------------- 故人的心（技能筹码）

/** 先把技能注册进 lib（session 之前 putRun 也要过读档清洗），再进页面 */
function registerSacrificeProbeSkills(ids) {
	for (const id of ids) {
		lib.skill[id] ??= { forced: true };
		lib.translate[id] ??= id;
		lib.translate[`${id}_info`] ??= "冒烟测试用技能。";
	}
}

await check("故人的心：开局两阶段选择、双方等量失去、存档与背包一字不动", async () => {
	freshWorld();
	registerSacrificeProbeSkills(["own_one", "own_two", "own_three", "own_four", "own_five"]);
	lib.character["迪迦"] = { hp: 4, maxHp: 4, skills: ["own_one", "own_two", "own_three"] };
	lib.character["佐菲"] = { hp: 4, maxHp: 4, skills: ["own_four"] };
	putRun(0, {
		mode: "endless",
		curios: ["old_friend_heart"],
		characterId: "迪迦",
		skills: ["own_one", "own_two"],
		skillInventory: ["own_one", "own_two", "own_three"],
		currentBattle: {
			status: "battle",
			enemies: [{
				characterId: "佐菲",
				stats: { defense: 0, draw: 0, attack: 0 },
				skills: ["own_five"],
				abyss: ["abyss_jianbi"],
				maxHp: 0,
				hp: 0,
			}],
		},
	});
	session();
	click("重新挑战这一关");
	const overlay = common.currentScreenNode();
	assert(overlay?.classList?.contains("wm-rogue-heart-overlay"), `带着故人的心开战应先弹选择页，实际：${overlay?.className ?? "无页面"}`);
	assertEqual(nodesWithClass("wm-rogue-pick-row").length, 6, `候选：己方 3 条 + 敌方 3 条（原生 / 额外技能 / 深渊词缀），实际：${nodesWithClass("wm-rogue-pick-row").map(node => dump(node)).join("｜")}`);

	click("own_one");
	click("own_two");
	click("下一步");
	click("own_five");
	click("深渊·坚壁");
	click("确认");
	await flush();

	const enemy = game.players[1];
	assertEqual(game.me.hasSkill("own_one"), false, "己方选中的技能真失去");
	assertEqual(game.me.hasSkill("own_two"), false, "第二个选中的也失去");
	assertEqual(game.me.hasSkill("own_three"), true, "没选的原生技能不动");
	assertEqual(game.me.hasSkill("rogue_stat"), true, "属性强化载体不许被当筹码");
	assertEqual(game.me.hasSkill("rogue_curio"), true, "奇物载体也不许被当筹码");
	assertEqual(enemy.hasSkill("own_five"), false, "敌方额外技能真失去");
	assertEqual(enemy.hasSkill("abyss_jianbi"), false, "深渊词缀真失去（持恒技照样摘得掉）");
	assertEqual(enemy.hasSkill("own_four"), true, "没选的原生技能不动");
	assertEqual(JSON.stringify(enemy.storage.abyss_affix), "[]", "深渊标记列表按实际持有同步");
	assertEqual(enemy.marks.abyss_affix, undefined, "词缀摘光了，徽记本体也收起来");
	assertEqual(JSON.stringify(enemy.rogueEnhanceInfo.abyss), "[]", "徽记面板的数据同步");
	assert(log.some(item => item.type === "trigger:gameStart"), "结算完照常进 gameStart");
	assert(log.some(item => item.type === "gameDraw"), "起手照常发牌");
	const slot = lib.storage.rogueSlots[0];
	assertEqual(JSON.stringify(slot.skills), JSON.stringify(["own_one", "own_two"]), "装备栏一个字不动");
	assertEqual(JSON.stringify(slot.skillInventory), JSON.stringify(["own_one", "own_two", "own_three"]), "背包一个字不动");
	assertEqual(JSON.stringify(slot.curios), JSON.stringify(["old_friend_heart"]), "奇物列表不动");
	return "两阶段 6 条候选 → 双方各失去 2 个，存档零改动";
});

await check("故人的心：数量不等时「确认」点不动；取消则谁都不失去，战斗照常开始", async () => {
	freshWorld();
	registerSacrificeProbeSkills(["own_one", "own_two", "own_five"]);
	lib.character["迪迦"] = { hp: 4, maxHp: 4, skills: ["own_one", "own_two"] };
	lib.character["佐菲"] = { hp: 4, maxHp: 4, skills: [] };
	putRun(0, {
		mode: "endless",
		curios: ["old_friend_heart"],
		characterId: "迪迦",
		skills: ["own_one"],
		currentBattle: {
			status: "battle",
			enemies: [{ characterId: "佐菲", stats: { defense: 0, draw: 0, attack: 0 }, skills: ["own_five"], maxHp: 0, hp: 0 }],
		},
	});
	session();
	click("重新挑战这一关");
	click("own_one");
	click("下一步");
	// 敌方一个都没选：确认置灰，点下去毫无反应（与商店「付不起」同一套手感）
	const confirm = nodesWithClass("wm-rogue-heart-confirm")[0];
	assert(confirm, "阶段二应有确认按钮");
	assert(confirm.classList.contains("wm-rogue-disabled"), "敌方数量还没配齐时确认置灰");
	clickNode(confirm);
	assertEqual(game.me.hasSkill("own_one"), true, "置灰时点下去什么都不发生");
	assert(common.currentScreenNode()?.classList?.contains("wm-rogue-heart-overlay"), "页面也不关");
	// 改走取消：谁都不失去，战斗照常开始
	click("取消");
	await flush();
	assertEqual(game.me.hasSkill("own_one"), true, "取消后己方技能一个不少");
	assertEqual(game.players[1].hasSkill("own_five"), true, "取消后敌方技能一个不少");
	assert(log.some(item => item.type === "trigger:gameStart"), "取消不影响开局流程");
	return "确认按等量门槛置灰；取消 = 零变化 + 照常开局";
});

await check("故人的心：X 个技能令每名敌人各失去 X 个（2×3=6、1×3=3），不再共用总额", async () => {
	freshWorld();
	lib.character["迪迦"] = { hp: 4, maxHp: 4, skills: ["heart_m1", "heart_m2", "heart_m3"] };
	lib.character["佐菲"] = { hp: 4, maxHp: 4, skills: ["heart_a1", "heart_a2", "heart_a3"] };
	lib.character["赛文"] = { hp: 4, maxHp: 4, skills: ["heart_b1", "heart_b2", "heart_b3"] };
	lib.character["巴尔坦星人"] = { hp: 4, maxHp: 4, skills: ["heart_c1", "heart_c2", "heart_c3"] };
	const probeIds = [
		"heart_m1", "heart_m2", "heart_m3",
		"heart_a1", "heart_a2", "heart_a3",
		"heart_b1", "heart_b2", "heart_b3",
		"heart_c1", "heart_c2", "heart_c3",
	];
	putRun(0, {
		mode: "endless",
		curios: ["old_friend_heart"],
		characterId: "迪迦",
		skills: [],
		currentBattle: {
			status: "battle",
			enemies: [
				{ characterId: "佐菲", stats: { defense: 0, draw: 0, attack: 0 }, skills: [], maxHp: 0, hp: 0 },
				{ characterId: "赛文", stats: { defense: 0, draw: 0, attack: 0 }, skills: [], maxHp: 0, hp: 0 },
				{ characterId: "巴尔坦星人", stats: { defense: 0, draw: 0, attack: 0 }, skills: [], maxHp: 0, hp: 0 },
			],
		},
	});
	session();
	registerSacrificeProbeSkills(probeIds);
	click("重新挑战这一关");
	assertEqual(nodesWithClass("wm-rogue-pick-row").length, 12, "己方 3 条 + 三名敌人各 3 条");
	click("heart_m1");
	click("heart_m2");
	click("下一步");
	click("heart_a1");
	click("heart_a2");
	click("heart_b1");
	click("heart_b2");
	click("heart_c1");
	click("heart_c2");
	const confirm = nodesWithClass("wm-rogue-heart-confirm")[0];
	assert(confirm && !confirm.classList.contains("wm-rogue-disabled"), "三名敌人都选满 X=2 后确认可用");
	click("确认");
	await flush();
	assertEqual(game.players.length, 4, "玩家 + 三名敌人");
	const [enemyA, enemyB, enemyC] = game.players.slice(1);
	assertEqual(game.me.hasSkill("heart_m1"), false, "玩家失去选中的第 1 个技能");
	assertEqual(game.me.hasSkill("heart_m2"), false, "玩家失去选中的第 2 个技能");
	assertEqual(game.me.hasSkill("heart_m3"), true, "没选的己方技能保留");
	for (const [enemy, prefix] of [[enemyA, "heart_a"], [enemyB, "heart_b"], [enemyC, "heart_c"]]) {
		assertEqual(enemy.hasSkill(`${prefix}1`), false, `${prefix}1 失去（每名敌人各扣 2 个）`);
		assertEqual(enemy.hasSkill(`${prefix}2`), false, `${prefix}2 失去`);
		assertEqual(enemy.hasSkill(`${prefix}3`), true, `${prefix}3 保留`);
	}
	assert(log.some(item => item.type === "trigger:gameStart"), "结算后照常开局");

	// X=1：三名敌人各失去 1 个，合计 3 个
	session();
	registerSacrificeProbeSkills(probeIds);
	click("重新挑战这一关");
	click("heart_m1");
	click("下一步");
	click("heart_a1");
	click("heart_b1");
	click("heart_c1");
	click("确认");
	await flush();
	const [oneA, oneB, oneC] = game.players.slice(1);
	assertEqual(oneA.hasSkill("heart_a1"), false, "X=1 时 A 失去 1 个");
	assertEqual(oneB.hasSkill("heart_b1"), false, "X=1 时 B 失去 1 个");
	assertEqual(oneC.hasSkill("heart_c1"), false, "X=1 时 C 失去 1 个");
	assertEqual(oneA.hasSkill("heart_a2") && oneB.hasSkill("heart_b2") && oneC.hasSkill("heart_c2"), true, "没选的技能都不动");
	return "X=2×3 人 = 6；X=1×3 人 = 3；每名敌人的次数互相独立";
});

await check("故人的心：第一阶段上限按单个敌人可取数收窄；技能不足 X 的敌人不可选，其余正常结算", async () => {
	freshWorld();
	lib.character["迪迦"] = { hp: 4, maxHp: 4, skills: ["heart_m1", "heart_m2", "heart_m3"] };
	lib.character["佐菲"] = { hp: 4, maxHp: 4, skills: ["heart_a1", "heart_a2"] };
	lib.character["赛文"] = { hp: 4, maxHp: 4, skills: ["heart_b1"] };
	putRun(0, {
		mode: "endless",
		curios: ["old_friend_heart"],
		characterId: "迪迦",
		skills: [],
		currentBattle: {
			status: "battle",
			enemies: [
				{ characterId: "佐菲", stats: { defense: 0, draw: 0, attack: 0 }, skills: [], maxHp: 0, hp: 0 },
				{ characterId: "赛文", stats: { defense: 0, draw: 0, attack: 0 }, skills: [], maxHp: 0, hp: 0 },
			],
		},
	});
	session();
	registerSacrificeProbeSkills(["heart_m1", "heart_m2", "heart_m3", "heart_a1", "heart_a2", "heart_b1"]);
	click("重新挑战这一关");
	const rowOf = name => nodesWithClass("wm-rogue-pick-row").find(row => dump(row).includes(name));
	assert(screenText().includes("最多 2 个"), "第一阶段上限取单个敌人的最大可取数（2），不是敌方技能总数（3）");
	click("heart_m1");
	click("heart_m2");
	click("heart_m3");
	assert(rowOf("heart_m3") && !rowOf("heart_m3").classList.contains("wm-rogue-picked"), "第三步点不动：没有敌人接得住 X=3");
	click("下一步");
	assert(screenText().includes("不足 2 个，无法作为目标"), "技能不足 X 的敌人明确标出来");
	click("heart_b1");
	assert(rowOf("heart_b1") && !rowOf("heart_b1").classList.contains("wm-rogue-picked"), "不足 X 的敌人点了也不选中");
	click("heart_a1");
	click("heart_a2");
	const confirm = nodesWithClass("wm-rogue-heart-confirm")[0];
	assert(confirm && !confirm.classList.contains("wm-rogue-disabled"), "只指定符合条件的敌人即可确认（其余敌人跳过）");
	click("确认");
	await flush();
	const [enemyA, enemyB] = game.players.slice(1);
	assertEqual(game.me.hasSkill("heart_m1"), false, "玩家失去实际选中的第 1 个");
	assertEqual(game.me.hasSkill("heart_m2"), false, "玩家失去实际选中的第 2 个");
	assertEqual(game.me.hasSkill("heart_m3"), true, "被上限挡住的第 3 个没失去");
	assertEqual(enemyA.hasSkill("heart_a1"), false, "符合条件的敌人失去第 1 个");
	assertEqual(enemyA.hasSkill("heart_a2"), false, "符合条件的敌人失去第 2 个（各扣 X 个）");
	assertEqual(enemyB.hasSkill("heart_b1"), true, "技能不足的敌人不被选中，一个都不失去");
	return "上限=2 / 不足 X 锁定 / 只选部分敌人正常结算";
});

await check("故人的心：返回上一步改 X 会清空敌方旧选择，重选后按新配额结算", async () => {
	freshWorld();
	lib.character["迪迦"] = { hp: 4, maxHp: 4, skills: ["heart_m1", "heart_m2"] };
	lib.character["佐菲"] = { hp: 4, maxHp: 4, skills: ["heart_a1", "heart_a2"] };
	lib.character["赛文"] = { hp: 4, maxHp: 4, skills: ["heart_b1", "heart_b2"] };
	putRun(0, {
		mode: "endless",
		curios: ["old_friend_heart"],
		characterId: "迪迦",
		skills: [],
		currentBattle: {
			status: "battle",
			enemies: [
				{ characterId: "佐菲", stats: { defense: 0, draw: 0, attack: 0 }, skills: [], maxHp: 0, hp: 0 },
				{ characterId: "赛文", stats: { defense: 0, draw: 0, attack: 0 }, skills: [], maxHp: 0, hp: 0 },
			],
		},
	});
	session();
	registerSacrificeProbeSkills(["heart_m1", "heart_m2", "heart_a1", "heart_a2", "heart_b1", "heart_b2"]);
	click("重新挑战这一关");
	const rowOf = name => nodesWithClass("wm-rogue-pick-row").find(row => dump(row).includes(name));
	click("heart_m1");
	click("heart_m2");
	click("下一步");
	click("heart_a1");
	click("heart_a2");
	click("返回");
	click("heart_m2");   // X 从 2 改回 1
	click("下一步");
	assert(rowOf("heart_a1") && !rowOf("heart_a1").classList.contains("wm-rogue-picked"), "X 变了：敌方旧选择被清空");
	assert(screenText().includes("已选 0/1"), "目标配额跟着改成 1");
	click("heart_b1");
	click("确认");
	await flush();
	const [enemyA, enemyB] = game.players.slice(1);
	assertEqual(game.me.hasSkill("heart_m1"), false, "玩家按新的 X=1 失去技能");
	assertEqual(game.me.hasSkill("heart_m2"), true, "返回后取消选中的技能保留");
	assertEqual(enemyA.hasSkill("heart_a1") && enemyA.hasSkill("heart_a2"), true, "旧目标未被结算");
	assertEqual(enemyB.hasSkill("heart_b1"), false, "新目标按 X=1 失去");
	assertEqual(enemyB.hasSkill("heart_b2"), true, "新目标没选的技能保留");
	return "返回改 X → 敌方选择清空 → 按新配额只结算新目标";
});

await check("故人的心：己方没有可失去的技能（只剩肉鸽载体）时不开界面，战斗直接开始", async () => {
	freshWorld();
	lib.character["迪迦"] = { hp: 4, maxHp: 4, skills: [] };
	lib.character["佐菲"] = { hp: 4, maxHp: 4, skills: [] };
	putRun(0, {
		mode: "endless",
		curios: ["old_friend_heart"],
		characterId: "迪迦",
		skills: [],
		currentBattle: {
			status: "battle",
			enemies: [{ characterId: "佐菲", stats: { defense: 0, draw: 0, attack: 0 }, skills: [], maxHp: 0, hp: 0 }],
		},
	});
	session();
	click("重新挑战这一关");
	await flush();
	assert(!common.currentScreenNode()?.classList?.contains("wm-rogue-heart-overlay"), "没有筹码可换时不开界面");
	assertEqual(game.me.hasSkill("rogue_stat"), true, "载体还在身上（说明只是被挡在候选之外）");
	assert(log.some(item => item.type === "trigger:gameStart"), "战斗照常开始，不卡在开局");
	return "筹码为空 → 静默跳过";
});

// ---------------------------------------------------------------- 故人的心：共享 group 伙伴 / 界面异常 / 选择失效

/** 某玩家此刻在某个时机上的钩子注册情况（对齐本体 `lib.hook[playerid_role_evt]` 是技能 id 数组） */
const playerHooks = (player, evt, role = "player") => lib.hook[`${player?.playerid}_${role}_${evt}`] ?? [];

/** A、B 都 group 到 C：三个技能各带一个触发时机，好从注册表里读出「谁还在听」 */
function registerShareProbeSkills() {
	lib.skill.sac_a = { trigger: { player: "phaseEnd" }, group: ["sac_c"] };
	lib.skill.sac_b = { trigger: { player: "damageEnd" }, group: ["sac_c"] };
	lib.skill.sac_c = { trigger: { player: "damageBegin1" } };
	lib.skill.sac_e1 = {};
	lib.skill.sac_e2 = {};
	for (const id of ["sac_a", "sac_b", "sac_c", "sac_e1", "sac_e2"]) {
		lib.translate[id] = id;
		lib.translate[`${id}_info`] = "冒烟测试用技能。";
	}
}

/** 主技能自己一条触发器都没有、效果全靠 group 伙伴，且 onremove 会抛错——专测异常补全的整组残留检查 */
function registerBoomProbeSkills() {
	lib.skill.sac_boom = { group: ["sac_partner"], onremove() { throw new Error("boom"); } };
	lib.skill.sac_partner = { trigger: { player: "damageBegin1" } };
	for (const id of ["sac_boom", "sac_partner"]) {
		lib.translate[id] = id;
		lib.translate[`${id}_info`] = "冒烟测试用技能。";
	}
}

/** 故人的心用例共用的开局夹具：玩家带 A、B、C 三个技能，敌人带 sac_e1 / sac_e2 两个技能 */function putShareProbeRun() {
	return putRun(0, {
		mode: "endless",
		curios: ["old_friend_heart"],
		characterId: "迪迦",
		skills: [],
		currentBattle: {
			status: "battle",
			enemies: [{ characterId: "佐菲", stats: { defense: 0, draw: 0, attack: 0 }, skills: ["sac_e1", "sac_e2"], maxHp: 0, hp: 0 }],
		},
	});
}

await check("故人的心：A、B 共享 group 伙伴 C —— 失去 A 后 C 连触发器一起活着，失去 B 后 C 彻底移除", async () => {
	freshWorld();
	lib.character["迪迦"] = { hp: 4, maxHp: 4, skills: ["sac_a", "sac_b", "sac_c"] };
	lib.character["佐菲"] = { hp: 4, maxHp: 4, skills: [] };
	putShareProbeRun();
	session();
	registerShareProbeSkills();
	click("重新挑战这一关");
	assert(common.currentScreenNode()?.classList?.contains("wm-rogue-heart-overlay"), "应弹出选择页");
	assert(playerHooks(game.me, "phaseEnd").includes("sac_a"), "开战前 A 的触发器已登记");
	assert(playerHooks(game.me, "damageEnd").includes("sac_b"), "开战前 B 的触发器已登记");
	assert(playerHooks(game.me, "damageBegin1").includes("sac_c"), "开战前 C 的触发器已登记");

	click("sac_a");
	click("下一步");
	click("sac_e1");
	click("确认");
	await flush();

	assertEqual(game.me.hasSkill("sac_c"), true, "共享伙伴 C 留在身上");
	assert(playerHooks(game.me, "damageBegin1").includes("sac_c"), "C 的触发器也补了回来（本体摘 A 时会连带摘掉它）");
	assertEqual(game.me.initedSkills.includes("sac_c"), true, "C 的 initedSkills 登记补回来了");
	assertEqual(playerHooks(game.me, "phaseEnd").includes("sac_a"), false, "A 自己的触发器摘干净了（同一条链上还有肉鸽自己的载体，不能只数条数）");
	assertEqual(playerHooks(game.me, "damageEnd").includes("sac_b"), true, "B 的触发器不受影响");

	// 第二场：重新载入页面再打一遍（技能从角色定义重新挂回），这次把 A、B 一起失去 →
	// 没人再依赖 C，它连同触发器彻底移除
	session();
	registerShareProbeSkills();
	click("重新挑战这一关");
	assertEqual(game.me.hasSkill("sac_a"), true, "新一场里 A 又回来了（战斗内的失去不进存档）");
	click("sac_a");
	click("sac_b");
	click("下一步");
	click("sac_e1");
	click("sac_e2");
	click("确认");
	await flush();
	assertEqual(game.me.hasSkill("sac_c"), false, "两个依赖者都失去后 → C 跟着失去");
	assertEqual(playerHooks(game.me, "damageBegin1").includes("sac_c"), false, "C 的触发器摘干净了");
	assertEqual(game.me.initedSkills.includes("sac_c"), false, "C 的 initedSkills 也清掉了");
	assertEqual(game.me.hasSkill("sac_a") || game.me.hasSkill("sac_b"), false, "A、B 都真失去");
	assertEqual(game.players[1].hasSkill("sac_e1"), false, "敌方指定的两件都真失去");
	assertEqual(game.players[1].hasSkill("sac_e2"), false, "敌方指定的两件都真失去（第二件）");
	return "共享伙伴触发器被连带摘掉后补回；最后一个依赖者失去时 C 彻底移除；跨场次零残留";
});

await check("故人的心：选择界面建到一半炸了也能照常开局（清浮层、零损失）", async () => {
	freshWorld();
	lib.character["迪迦"] = { hp: 4, maxHp: 4, skills: ["sac_a"] };
	lib.character["佐菲"] = { hp: 4, maxHp: 4, skills: [] };
	putShareProbeRun();
	session();
	registerShareProbeSkills();
	// 让「建技能条目」这一步炸掉：此时浮层与面板已经建好，正好检验异常路径会不会留下残页
	const realDiv = ui.create.div;
	ui.create.div = (...args) => {
		if (String(args[0] ?? "").includes("wm-rogue-pick-row")) {
			throw new Error("模拟建卡失败");
		}
		return realDiv(...args);
	};
	const savedError = console.error;
	console.error = () => {};
	try {
		click("重新挑战这一关");
	} finally {
		ui.create.div = realDiv;
		console.error = savedError;
	}
	await flush();
	assertEqual(document.body.querySelectorAll(".wm-rogue-overlay").length, 0, "半建的选择页被清掉，不留浮层");
	assert(log.some(item => item.type === "trigger:gameStart"), "战斗照常进入 gameStart，没被卡住");
	assert(log.some(item => item.type === "gameDraw"), "起手照常发牌");
	assertEqual(game.me.hasSkill("sac_a"), true, "一个技能都没失去");
	assertEqual(game.players[1].hasSkill("sac_e1"), true, "敌方也是");
	return "界面异常 → 清浮层 + 按未发动 + 照常开局";
});

await check("故人的心：选择失效时一个技能都不删（不拿没指定的技能顶替）", async () => {
	freshWorld();
	lib.character["迪迦"] = { hp: 4, maxHp: 4, skills: ["sac_a", "sac_b", "sac_c"] };
	lib.character["佐菲"] = { hp: 4, maxHp: 4, skills: [] };
	putShareProbeRun();
	session();
	registerShareProbeSkills();
	click("重新挑战这一关");
	click("不发动");   // 先让这一场正常开起来
	await flush();
	assertEqual(game.me.hasSkill("sac_a"), true, "不发动 = 零变化");

	// 直接调结算层：把「选中的技能已经不在身上」摆出来 —— 期望整单不做
	const result = sacrificeModule.settleSkillSacrifice(game.me, {
		mine: ["sac_a", "sac_b"],
		theirs: [{ player: game.players[1], ids: ["sac_e1", "sac_ghost"] }],
	});
	assertEqual(result.invalid.length, 1, "失效的条目被报回流程层");
	assertEqual(result.invalid[0].id, "sac_ghost", "失效的是哪一条");
	assertEqual(JSON.stringify(result.mine), "[]", "己方一个都没失去");
	assertEqual(JSON.stringify(result.theirs), "[]", "敌方也一个都没失去");
	assertEqual(game.me.hasSkill("sac_a") && game.me.hasSkill("sac_b"), true, "己方技能表原样");
	assertEqual(game.players[1].hasSkill("sac_e1"), true, "敌方技能表原样——没被指定的技能一个都不许动");
	return "选择失效 → 整单不做，零损失、零顶替";
});

await check("故人的心：onremove 抛错时不残留触发器，战斗照常继续", async () => {
	freshWorld();
	lib.character["迪迦"] = { hp: 4, maxHp: 4, skills: ["sac_boom", "sac_a"] };
	lib.character["佐菲"] = { hp: 4, maxHp: 4, skills: [] };
	putShareProbeRun();
	session();
	registerShareProbeSkills();
	lib.skill.sac_boom = { trigger: { player: "phaseZhunbei" }, onremove() { throw new Error("boom"); } };
	lib.translate.sac_boom = "sac_boom";
	lib.translate.sac_boom_info = "冒烟测试用技能。";
	const savedError = console.error;
	console.error = () => {};   // 这一条故意让它抛错，日志不进测试输出
	try {
		click("重新挑战这一关");
		assert(playerHooks(game.me, "phaseZhunbei").includes("sac_boom"), "抛错之前触发器是登记着的");
		click("sac_boom");
		click("下一步");
		click("sac_e1");
		click("确认");
		await flush();
	} finally {
		console.error = savedError;
	}
	assertEqual(game.me.hasSkill("sac_boom"), false, "技能确实失去了（技能表里已经不在了）");
	assertEqual(playerHooks(game.me, "phaseZhunbei").includes("sac_boom"), false, "半摘状态的触发器被补全摘掉，不留残余钩子");
	assertEqual(game.me.initedSkills.includes("sac_boom"), false, "initedSkills 登记也清掉了");
	assertEqual(game.me.hasSkill("sac_a"), true, "同一批里没选的技能不受影响");
	assertEqual(game.players[1].hasSkill("sac_e1"), false, "敌方指定的一件照常失去（两侧数量相等）");
	assert(log.some(item => item.type === "trigger:gameStart"), "战斗照常开始");
	return "onremove 抛错 → 照实记账 + 触发器/登记补全 + 开局照常";
});

await check("故人的心：共享 group 伙伴的 init() 不重复执行（真机链路）", async () => {
	freshWorld();
	lib.character["迪迦"] = { hp: 4, maxHp: 4, skills: ["sac_a", "sac_b", "sac_c"] };
	lib.character["佐菲"] = { hp: 4, maxHp: 4, skills: [] };
	putShareProbeRun();
	session();
	registerShareProbeSkills();
	// C 的 init 就是「加属性 / 加标记 / 发资源」那类一次性初始化：跑两次就翻倍
	lib.skill.sac_c = {
		trigger: { player: "damageBegin1" },
		init(player) {
			player.storage.sac_c_init = (player.storage.sac_c_init ?? 0) + 1;
		},
	};
	click("重新挑战这一关");
	assertEqual(game.me.storage.sac_c_init, 1, "开战前 C 只初始化一次");
	click("sac_a");
	click("下一步");
	click("sac_e1");
	click("确认");
	await flush();
	assertEqual(game.me.hasSkill("sac_c"), true, "共享伙伴留下");
	assertEqual(game.me.storage.sac_c_init, 1, "补注册只补触发器，init 一次都没重跑");
	assert(playerHooks(game.me, "damageBegin1").includes("sac_c"), "C 的触发器仍然有效");

	// 再失去 B（没人再依赖 C）：直接走结算层，省掉一次整页重载。
	// 结算现在要求至少一名有效目标，拿敌人剩下的 sac_e2 当这一笔的对手
	sacrificeModule.settleSkillSacrifice(game.me, { mine: ["sac_b"], theirs: [{ player: game.players[1], ids: ["sac_e2"] }] });
	assertEqual(game.me.hasSkill("sac_c"), false, "最后一个依赖者失去后 C 跟着失去");
	assertEqual(playerHooks(game.me, "damageBegin1").includes("sac_c"), false, "C 的钩子摘干净了");
	assertEqual(game.me.storage.sac_c_init, 1, "整条链路里 init 始终只跑过一次");
	return "init 一次 + 补注册不重跑 + 最终移除零残留（真机链路）";
});

await check("故人的心：带 global / hookTrigger 的共享伙伴，补注册与最终注销都正确", async () => {
	freshWorld();
	lib.character["迪迦"] = { hp: 4, maxHp: 4, skills: ["sac_a", "sac_b", "sac_c"] };
	lib.character["佐菲"] = { hp: 4, maxHp: 4, skills: [] };
	putShareProbeRun();
	session();
	registerShareProbeSkills();
	lib.skill.sac_glob = {};   // 全局技本体：C 通过 info.global 把它登记成全局技
	lib.skill.sac_c = { trigger: { player: "damageBegin1" }, global: ["sac_glob"], hookTrigger: true };
	click("重新挑战这一关");
	assert(lib.skill.global.includes("sac_glob"), "开战前全局技已登记进 lib.skill.global");
	assert((lib.skill.globalmap.sac_glob ?? []).includes(game.me), "玩家登记在 globalmap 里");
	assert(game.me._hookTrigger.includes("sac_c"), "hookTrigger 登记在案");

	click("sac_a");
	click("下一步");
	click("sac_e1");
	click("确认");
	await flush();
	assert(lib.skill.global.includes("sac_glob"), "失去 A 后全局技仍然登记着（共享伙伴留下的那半边）");
	assertEqual((lib.skill.globalmap.sac_glob ?? []).length, 1, "补注册不会把同一个玩家登记两遍");
	assert(game.me._hookTrigger.includes("sac_c"), "_hookTrigger 登记还在");
	assert(playerHooks(game.me, "damageBegin1").includes("sac_c"), "钩子还在");

	// 再失去 B：C 彻底移除，全局技与 hookTrigger 登记一起注销。
	// 结算现在要求至少一名有效目标，拿敌人剩下的 sac_e2 当这一笔的对手
	sacrificeModule.settleSkillSacrifice(game.me, { mine: ["sac_b"], theirs: [{ player: game.players[1], ids: ["sac_e2"] }] });
	assertEqual(game.me.hasSkill("sac_c"), false, "C 跟着失去");
	assertEqual(lib.skill.global.includes("sac_glob"), false, "全局技注销");
	assertEqual((lib.skill.globalmap.sac_glob ?? []).length, 0, "globalmap 清空");
	assertEqual((game.me._hookTrigger ?? []).includes("sac_c"), false, "_hookTrigger 摘干净");
	return "global / hookTrigger 的注册、补注册与注销都正确";
});

await check("故人的心：主技能没有 trigger、靠 group 伙伴做事 —— onremove 抛错后的两种结局都正确", async () => {
	const savedError = console.error;
	console.error = () => {};   // 这两段故意让 onremove 抛错，日志不进测试输出
	try {
		// 场景一：伙伴只被抛错的这个主技能依赖 → 抛错后它彻底移除
		freshWorld();
		lib.character["迪迦"] = { hp: 4, maxHp: 4, skills: ["sac_boom", "sac_partner"] };
		lib.character["佐菲"] = { hp: 4, maxHp: 4, skills: [] };
		putShareProbeRun();
		session();
		registerShareProbeSkills();
		registerBoomProbeSkills();
		click("重新挑战这一关");
		assert(playerHooks(game.me, "damageBegin1").includes("sac_partner"), "伙伴的钩子一开始登记着");
		click("sac_boom");
		click("下一步");
		click("sac_e1");
		click("确认");
		await flush();
		assertEqual(game.me.hasSkill("sac_boom"), false, "主技能已失去");
		assertEqual(game.me.hasSkill("sac_partner"), false, "没人再依赖它 → 伙伴跟着彻底移除");
		assertEqual(playerHooks(game.me, "damageBegin1").includes("sac_partner"), false, "伙伴的钩子摘干净（主技能自己没 trigger 也要查得到）");
		assert(log.some(item => item.type === "trigger:gameStart"), "战斗照常开始");

		// 场景二：伙伴还被 sac_b 依赖 → 抛错后它保留，且触发器仍然有效
		freshWorld();
		lib.character["迪迦"] = { hp: 4, maxHp: 4, skills: ["sac_boom", "sac_b", "sac_partner"] };
		lib.character["佐菲"] = { hp: 4, maxHp: 4, skills: [] };
		putShareProbeRun();
		session();
		registerShareProbeSkills();
		registerBoomProbeSkills();
		lib.skill.sac_b = { trigger: { player: "damageEnd" }, group: ["sac_partner"] };
		click("重新挑战这一关");
		click("sac_boom");
		click("下一步");
		click("sac_e1");
		click("确认");
		await flush();
		assertEqual(game.me.hasSkill("sac_partner"), true, "共享伙伴保留");
		assert(playerHooks(game.me, "damageBegin1").includes("sac_partner"), "它的触发器仍然有效（补注册过）");
		assertEqual(game.me.initedSkills.includes("sac_partner"), true, "initedSkills 登记在");
		assertEqual(game.me.hasSkill("sac_b"), true, "另一个主技能不受影响");
		assert(log.some(item => item.type === "trigger:gameStart"), "战斗照常开始");
	} finally {
		console.error = savedError;
	}
	return "抛错后伙伴该走的走、该留的留，开局不受影响";
});

// ---------------------------------------------------------------- 故人的心：group 伙伴自己的 onremove 抛错

/** 主技能 sac_trap group 到 sac_trap_b；sac_trap_b 自己会炸，还在 init 里给自己挂了一个派生技能 */
function registerTrappedPartnerProbeSkills() {
	lib.skill.sac_trap = { group: ["sac_trap_b"] };
	lib.skill.sac_trap_b = {
		trigger: { player: "damageBegin1" },
		onremove() { throw new Error("partner boom"); },
		init(player, skill) { player.addAdditionalSkill(skill, ["sac_trap_child"]); },
	};
	lib.skill.sac_trap_child = { trigger: { player: "phaseEnd" } };
	lib.skill.sac_e1 = {};
	lib.skill.sac_e2 = {};
	for (const id of ["sac_trap", "sac_trap_b", "sac_trap_child", "sac_e1", "sac_e2"]) {
		lib.translate[id] = id;
		lib.translate[`${id}_info`] = "冒烟测试用技能。";
	}
}

await check("故人的心：group 伙伴自己的 onremove 抛错 —— 触发器被连带摘光后，附加技能与收尾照样补全（真机链路）", async () => {
	freshWorld();
	lib.character["迪迦"] = { hp: 4, maxHp: 4, skills: ["sac_trap", "sac_trap_b"] };
	lib.character["佐菲"] = { hp: 4, maxHp: 4, skills: [] };
	putShareProbeRun();
	session();
	registerTrappedPartnerProbeSkills();
	const savedError = console.error;
	console.error = () => {};   // 这一条故意让 onremove 抛错，日志不进测试输出
	try {
		click("重新挑战这一关");
		assert(playerHooks(game.me, "damageBegin1").includes("sac_trap_b"), "开战前伙伴的钩子已登记");
		assertEqual(game.me.hasSkill("sac_trap_child"), true, "伙伴 init 里挂上的派生技能在身（本体 additionalSkills 机制）");
		assert(playerHooks(game.me, "phaseEnd").includes("sac_trap_child"), "派生技能的钩子也登记着");
		game.me.disabledSkills.sac_trap_b = ["sac_trap_b_awake"];   // 觉醒态：本体记成 `<id>_awake`

		click("sac_trap");
		click("下一步");
		click("sac_e1");
		click("确认");
		await flush();

		assertEqual(game.me.hasSkill("sac_trap"), false, "主技能真失去");
		assertEqual(game.me.hasSkill("sac_trap_b"), false, "伙伴跟着失去");
		assertEqual(playerHooks(game.me, "damageBegin1").includes("sac_trap_b"), false, "伙伴的钩子没有残留");
		assertEqual(game.me.initedSkills.includes("sac_trap_b"), false, "伙伴的 initedSkills 登记清掉");
		// 这几条是本轮的核心：触发器侧已被连带摘光，收尾不能因此被当作「已完成」
		assertEqual(game.me.hasSkill("sac_trap_child"), false, "伙伴名下的附加技能跟着清掉");
		assertEqual(game.me.additionalSkills.sac_trap_b, undefined, "additionalSkills 那本账删掉");
		assertEqual(playerHooks(game.me, "phaseEnd").includes("sac_trap_child"), false, "派生技能的钩子摘干净");
		assertEqual(game.me.disabledSkills.sac_trap_b, undefined, "觉醒禁用态清掉");
		assertEqual(game.players[1].hasSkill("sac_e1"), false, "敌方指定的一件照常失去（两侧数量相等）");
		assert(log.some(item => item.type === "trigger:gameStart"), "战斗照常开始");
		const notified = log.filter(item => item.type === "callHook" && item.name === "removeSkillCheck" && item.skills?.includes("sac_trap_b"));
		assertEqual(notified.length, 1, "伙伴的钩子通知恰好补一次，不重复");
	} finally {
		console.error = savedError;
	}
	return "连带摘光触发器的伙伴：附加技能 / 觉醒态 / 钩子通知照样补全且不重复";
});

console.log(`\nrogue-mode-smoke: passed=${passed} failed=${failures.length}`);
if (failures.length) {
	console.log(`失败用例：${failures.join("、")}`);
	process.exit(1);
}
