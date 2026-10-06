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
const stagesData = await load("src/rogue/data/challengeStages.js");
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

async function newRunByUi(modeLabel) {
	click("空存档");
	click(modeLabel);
	const chooser = screenRoot();
	assert(chooser.classList.contains("character"), "选将页应使用本体 characterDialog");
	assert(chooser.buttons.some(button => button.link === "迪迦"), "候选里应有迪迦");
	assert(!chooser.buttons.some(button => button.link === "死龙"), "隐藏 Boss 不该出现在候选里");
	click("迪迦");
	await flush();
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

await check("Hub：角色/关卡/货币/属性与两行动作按钮（不再有技能入口）", async () => {
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
		"图鉴",
		"返回存档",
		"退出肉鸽模式",
	]) {
		assert(text.includes(token), `Hub 应显示「${token}」，实际：${text}`);
	}
	// 营地也是自建浮层：技能入口已移到商店顶部的资源块，营地标题栏里不再有按钮
	const overlay = common.currentScreenNode();
	assertEqual(overlay?.id, "wm-rogue-overlay", "营地走自建浮层");
	assertEqual(nodesWithClass("wm-rogue-back").length, 0, "营地不再有技能入口");
	assertEqual(screenText().includes("当前成长"), true, "应有当前成长分区");
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
	// 动作区分两行：第一行是「继续玩」的三个入口，第二行才是离开当前局
	const rows = nodesWithClass("wm-rogue-hub-row");
	assertEqual(rows.length, 2, "动作区应恰好分两行");
	const labelsOf = row => row.children.map(node => textOf(node));
	assertEqual(JSON.stringify(labelsOf(rows[0])), JSON.stringify(["开始下一关", "商店", "图鉴"]), `第一行：${labelsOf(rows[0])}`);
	assertEqual(JSON.stringify(labelsOf(rows[1])), JSON.stringify(["返回存档", "退出肉鸽模式"]), `第二行：${labelsOf(rows[1])}`);
	assert(nodesWithClass("wm-rogue-hub-index")[0], "图鉴按钮用自己的配色类");
	return "营地信息齐备 + 动作分两行";
});

await check("开局：先落盘敌方阵容再建局，本体事件调用顺序正确", async () => {
	freshWorld();
	session();
	await newRunByUi("闯关模式");
	const before = log.length;
	click("开始下一关");
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

await check("运行时发技能：按本体 expandSkills 补齐 group 伙伴（字符串/数组/未注册/重复）", () => {
	lib.skill.grp_plain = {};
	lib.skill.grp_one = { group: "grp_one_part" };
	lib.skill.grp_one_part = {};
	lib.skill.grp_many = { group: ["grp_many_a", "grp_many_b"] };
	lib.skill.grp_many_a = {};
	lib.skill.grp_many_b = {};
	lib.skill.grp_ghost = { group: "grp_never_registered" };
	const player = stub.ui.create.player();
	const granted = battleModule.grantSkills(player, ["grp_plain", "grp_one", "grp_many", "grp_ghost", "grp_plain", "grp_absent"], "测试技能未注册");
	for (const id of ["grp_plain", "grp_one", "grp_one_part", "grp_many", "grp_many_a", "grp_many_b"]) {
		assert(player.hasSkill(id), `应挂上 ${id}`);
	}
	assertEqual(player.hasSkill("grp_never_registered"), false, "group 伙伴没注册时由本体 expandSkills 自己过滤");
	assertEqual(granted.includes("grp_absent"), false, "未注册的 id 应被过滤掉（并给出警告）");
	assertEqual(granted.filter(id => id === "grp_plain").length, 1, "同一技能重复传入只挂一次");
	assertEqual(player.__skills.length, granted.length, `挂上去的条数要和返回列表一致：${player.__skills.join(",")}`);
	return granted.join(",");
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
	lib.skill.grp_buy_locked = { forced: true };
	click("重新挑战这一关");
	await flush();
	// session() 会把 game.me 清掉，运行时的技能列表要先记下来
	const liveSkills = game.me.__skills.join(",");
	assert(liveSkills.includes("grp_buy") && liveSkills.includes("grp_buy_locked"), "玩家身上应有主技能与 group 伙伴");
	assert(game.me.hasSkill("grp_buy_locked"), "group 伙伴应随主技能一起挂上");
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
	lib.skill.grp_enemy_part = {};
	click("重新挑战这一关");
	await flush();
	const enemy = game.players[1];
	assert(enemy.hasSkill("grp_enemy"), "敌人应拿到配置里的主技能");
	assert(enemy.hasSkill("grp_enemy_part"), "敌人也应拿到 group 伙伴");
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
		lib.skill.grp_stat_part = {};
		click("重新挑战这一关");
		await flush();
		assert(game.me.hasSkill("grp_stat"), "属性 extraSkills 的主技能应挂上");
		assert(game.me.hasSkill("grp_stat_part"), "extraSkills 的 group 伙伴也应挂上");
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

	await check("胜利结算：固定奖励入账、关卡推进、清除标记且不重复结算", async () => {
		freshWorld();
		session();
		await newRunByUi("闯关模式");
		click("开始下一关");
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
		click("开始下一关");
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
		click("开始下一关");
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

await check("选择玩法页：自建浮层 + 两张玩法卡 + 无尽历史最高记录", async () => {
	lib.storage.rogueBestEndless = { level: 27, characterId: "迪迦", updatedAt: 1 };
	session();
	click("空存档");
	let text = screenText();
	const stage = nodesWithClass("wm-rogue-modes")[0];
	assert(stage, "选择玩法也是自建浮层");
	assertEqual(nodesWithClass("wm-rogue-mode-card").length, 2, "两张玩法卡");
	const modeTokens = ["闯关模式", `固定总关卡数：${cfg.CHALLENGE_TOTAL_LEVELS} 关`, "失败：损失部分货币", "无尽模式", "关卡无限", "失败：整档删除"];
	if (abyssCfg.ABYSS_ENABLED) {
		modeTokens.push(`第 ${abyssCfg.ABYSS_START_LEVEL} 关起开启深渊强化`);
	}
	for (const token of modeTokens) {
		assert(text.includes(token), `玩法卡应显示「${token}」：${text}`);
	}
	assert(text.includes("最高记录：第 27 关（迪迦）"), `应显示最高记录：${text}`);
	click("返回");
	lib.storage.rogueBestEndless = null;
	session();
	click("空存档");
	text = screenText();
	assert(text.includes("最高记录：暂无"), `无记录时应显示暂无：${text}`);
	// 点整张卡即选中：点无尽卡进入选将
	click("无尽模式");
	assert(screenText().includes("点击武将即完成选择"), "点卡片应进入选将页");
	click("返回");
	return "玩法卡 + 最高记录";
});

await check("技能查看页：商店顶部技能资源块进入、只读、poptip 转成技能名", async () => {
	freshWorld();
	session();
	await newRunByUi("闯关模式");
	click("商店");
	const skillCell = nodesWithClass("wm-rogue-res-skill")[0];
	assert(skillCell, "商店顶部应有可点击的技能资源块");
	clickNode(skillCell);
	let text = screenText();
	assert(text.includes("技能（0/3）"), `空态标题：${text}`);
	assert(text.includes("当前没有已购买技能"), `空态说明：${text}`);
	click("返回");
	assert(screenText().includes("技能商店"), "返回应回到商店");

	// 只读：进出技能页不该动存档
	const before = JSON.stringify(lib.storage.rogueSlots);
	clickNode(nodesWithClass("wm-rogue-res-skill")[0]);
	click("返回");
	assertEqual(JSON.stringify(lib.storage.rogueSlots), before, "查看技能不写存档");

	// 有技能（描述里带 poptip）时：显示清洗并转名后的完整描述
	putRun(0, {
		currency: { gold: 9999, exp: 0 },
		skills: ["rogue_poptip"],
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
	assert(text.includes("光test"), `应列出已购技能：${text}`);
	assert(text.includes("〖暗融〗造成的伤害+1"), `poptip 应转成〖技能名〗：${text}`);
	assert(!text.includes("noname-poptip"), `不得泄漏原始标签：${text}`);
	click("返回");
	assert(screenText().includes("技能商店"), "返回应回到商店");
	return "商店技能块入口 + poptip 转名";
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
	assertEqual(nodesWithClass("wm-rogue-res-num").map(node => textOf(node)).join(","), "1000,0,0/3", "资源数字");
	assertEqual(nodesWithClass("wm-rogue-res-label").map(node => textOf(node)).join(","), "金币,经验,技能", "资源标签");
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
	assert(lib.storage.rogueSlots[0].skills.includes("rogue_extra"), "技能已买到");
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
	assert(after.skills.includes("rogue_extra"), "技能已拥有");
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
	assertEqual(lib.storage.rogueSlots[0].skills.length, 1, "本局只能买一个技能");
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
	click("开始下一关");
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
	click("开始下一关");
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

await check("技能上限：满槽购买走替换页（新版式），三个位置都能替换且取消不替换", async () => {
	// 情况 B：正好 3 个技能再购买 → 进入替换页
	putRun(0, {
		skills: ["own_one", "own_two", "own_three"],
		shopOffers: [{ id: "rogue_extra", price: 10, sold: false }],
		currency: { gold: 500, exp: 0 },
		currentBattle: null,
	});
	session();
	click("商店");
	clickNode(nodesWithClass("wm-rogue-shop-buy")[0]);
	const text = screenText();
	assert(text.includes("选择要替换的技能"), `应进入替换页：${text}`);
	assert(text.includes("新技能") && text.includes("技能槽 3/3"), "应突出新技能与槽位");
	assertEqual(nodesWithClass("wm-rogue-replace-new").length, 1, "新技能应为一张加大卡");
	assertEqual(nodesWithClass("wm-rogue-replace-card").length, 3, "三张已有技能卡");
	assertEqual(nodesWithClass("wm-rogue-replace-btn").length, 3, "每张卡一个替换按钮");
	// 点已有技能卡看完整描述（弹层），关闭后仍在替换页
	clickNode(nodesWithClass("wm-rogue-replace-card")[0]);
	assertEqual(nodesWithClass("wm-rogue-popup").length, 1, "点卡片应弹完整描述");
	nodesWithClass("wm-rogue-popup")[0].remove();
	// 取消：右上角返回，不替换
	click("返回");
	await flush();
	let after = lib.storage.rogueSlots[0];
	assertEqual(after.skills.length, 3, "取消后技能不变");
	assert(!after.skills.includes("rogue_extra"), "取消未购买");
	// 情况 C：分别替换第 1、2、3 张卡
	putRun(0, { shopOffers: [{ id: "rogue_extra", price: 10, sold: false }], currency: { gold: 500, exp: 0 } }, after);
	session();
	click("商店");
	clickNode(nodesWithClass("wm-rogue-shop-buy")[0]);
	clickNode(nodesWithClass("wm-rogue-replace-btn")[0]);
	await flush();
	after = lib.storage.rogueSlots[0];
	assertEqual(after.skills.length, 3, "替换后仍是 3 个");
	assert(!after.skills.includes("own_one") && after.skills.includes("rogue_extra"), "第一个技能已替换");
	putRun(0, { shopOffers: [{ id: "own_four", price: 10, sold: false }], currency: { gold: 500, exp: 0 } }, after);
	session();
	click("商店");
	clickNode(nodesWithClass("wm-rogue-shop-buy")[0]);
	clickNode(nodesWithClass("wm-rogue-replace-btn")[1]);
	await flush();
	after = lib.storage.rogueSlots[0];
	assert(!after.skills.includes("own_three") && after.skills.includes("own_four"), "第二个位置的技能已替换");
	putRun(0, { shopOffers: [{ id: "own_five", price: 10, sold: false }], currency: { gold: 500, exp: 0 } }, after);
	session();
	click("商店");
	clickNode(nodesWithClass("wm-rogue-shop-buy")[0]);
	clickNode(nodesWithClass("wm-rogue-replace-btn")[2]);
	await flush();
	after = lib.storage.rogueSlots[0];
	assertEqual(after.skills.length, 3, "槽位数始终不超过上限");
	assert(!after.skills.includes("own_four") && after.skills.includes("own_five"), "第三个位置的技能已替换");
	return after.skills.join(",");
});

await check("替换页：超长描述与 poptip 都不撑爆页面、不漏原始标签", async () => {
	putRun(0, {
		skills: ["own_long", "own_poptip", "own_one"],
		shopOffers: [{ id: "rogue_extra", price: 10, sold: false }],
		currency: { gold: 500, exp: 0 },
		currentBattle: null,
	});
	session();
	// 会话会重置翻译，这两个夹具要在 session() 之后再塞
	lib.translate.own_long = `很长<hr>${"很长很长的技能描述。".repeat(40)}`;
	lib.translate.own_poptip = '带牌<hr>你造成的<noname-poptip poptip="sha"></noname-poptip>伤害+1。';
	click("商店");
	clickNode(nodesWithClass("wm-rogue-shop-buy")[0]);
	const text = screenText();
	assertEqual(nodesWithClass("wm-rogue-replace-card").length, 3, "长描述不会把其它卡片挤掉");
	assert(!text.includes("<noname-poptip"), `不得泄漏原始标签：${text.slice(0, 200)}`);
	assert(text.includes("很长很长的技能描述"), "长描述正常展示（限高滚动在 CSS 层）");
	// 情况 D：长描述在新技能卡上也只撑高自己（完整描述），已有卡限高约 5 行
	assert(nodesWithClass("wm-rogue-replace-new")[0].querySelector(".wm-rogue-desc-full"), "新技能卡应显示完整描述");
	click("返回");
	await flush();
	assert(screenText().includes("技能商店"), "返回应回到商店");
	return "长描述 + poptip";
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
	click("额外");
	const after = lib.storage.rogueSlots[0];
	assert(!after.skills.includes("rogue_extra"), "技能已失去");
	assertEqual(after.stats.defense, 1, "属性未被连带扣除");
	return "失去技能";
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
	click("开始下一关");
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
	click("开始下一关");
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
		click("开始下一关");
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
		click("开始下一关");
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
	click("开始下一关");
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
		assertEqual(nodesWithClass("wm-rogue-res-label").map(node => textOf(node)).join(","), "金币,经验,技能,奇物", "资源行标签");
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

await check("奇物商店：候选展示、购买落袋、整批售罄、重载保持", async () => {
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
	// 技能区的 3 个购买按钮在前，奇物区的 3 个在后
	const buyButtons = nodesWithClass("wm-rogue-shop-buy");
	assertEqual(buyButtons.length, 6, "技能与奇物各三个购买按钮");
	clickNode(buyButtons[3]);
	await flush();
	const after = lib.storage.rogueSlots[0];
	assertEqual(JSON.stringify(after.curios), JSON.stringify(["energy_core"]), "奇物入袋");
	assertEqual(JSON.stringify(after.collection.curios), JSON.stringify(["energy_core"]), "图鉴记录");
	assertEqual(after.currency.gold, 90, "扣款落盘");
	// 买到即整批下架：候选清空、分区整个隐藏，不留「已购买」残卡
	assertEqual(JSON.stringify(after.curioOffers), "[]", "买到即清空候选");
	assertEqual(nodesWithClass("wm-rogue-curio-card").length, 0, "候选卡全部撤下");
	assert(nodesWithClass("wm-rogue-curio-section")[0].classList.contains("wm-rogue-hidden"), "空批次时奇物商店分区隐藏");
	// 重载：奇物仍在、分区仍隐藏（旧档里的残卡也会在读档时被清洗掉）
	putRun(0, {}, after);
	session();
	click("商店");
	assertEqual(JSON.stringify(lib.storage.rogueSlots[0].curios), JSON.stringify(["energy_core"]), "重载后奇物仍在");
	assertEqual(JSON.stringify(lib.storage.rogueSlots[0].curioOffers), "[]", "重载后无残留候选");
	assertEqual(nodesWithClass("wm-rogue-curio-card").length, 0, "重载后分区仍无残卡");
	assert(nodesWithClass("wm-rogue-curio-section")[0].classList.contains("wm-rogue-hidden"), "重载后分区仍隐藏");
	// 顶部「奇物 n」资源块进奇物管理页：与「技能 n/3」同一套入口
	clickNode(nodesWithClass("wm-rogue-res-curio")[0]);
	assert(screenText().includes("奇物（1）"), `管理页标题：${screenText()}`);
	const manage = nodesWithClass("wm-rogue-curio-manage")[0];
	assert(manage, "管理页应渲染奇物卡");
	// 刚买到的能量核心停在初始品质：当前效果 + 下一品质预览 + 按当前关卡现算的升级价
	// （第 2 关基准 round(50×√2)=71，升级价 = 5×71 = 355；这一档 exp 为 0，所以按钮置灰）
	const manageText = dump(manage);
	// 当前效果与下一品质效果都按效果表自动生成，句式统一
	for (const token of ["能量核心", "普通", "摸牌阶段额外摸 1 张牌", "下一品质：稀有", "摸牌阶段额外摸 2 张牌", "升级 355 经验（持有 0）"]) {
		assert(manageText.includes(token), `管理页卡面应显示「${token}」：${manageText}`);
	}
	assert(nodesWithClass("wm-rogue-curio-up")[0].classList.contains("wm-rogue-disabled"), "经验不足时升级按钮置灰");
	click("返回");
	assert(screenText().includes("技能商店"), "返回应回到商店");
	return "买 1 个 → 整批售罄 → 重载保持 → 管理页预览";
});

await check("奇物管理页：点升级真的升一档、原位重绘，史诗档不给按钮", async () => {
	freshWorld();
	// 第 31 关：升级价 = 5 × round(50×√31) = 1390，给够两次的钱
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
	assertEqual(saved.currency.exp, 5000 - 1390, "扣掉 1390 经验");
	// 原位重绘：卡面自己变成稀有档的样子，没有重开页面
	let text = dump(cardOf("能量核心"));
	assert(text.includes("稀有") && text.includes("摸牌阶段额外摸 2 张牌"), `卡面应重绘成稀有档：${text}`);
	assert(text.includes("下一品质：史诗") && text.includes("摸牌阶段额外摸 4 张牌"), `下一档预览跟上：${text}`);
	assert(text.includes(`升级 ${1390 * 1} 经验`), `价签按当前档重算：${text}`);
	assertEqual(nodesWithClass("wm-rogue-curio-manage").length, 2, "页面没被重开（还是这两张卡）");
	// 再升一档到史诗：按钮整个拿掉，只留「已达最高品质」
	clickNode(nodesWithClass("wm-rogue-curio-up")[0]);
	await flush();
	saved = lib.storage.rogueSlots[0];
	assertEqual(saved.curioQuality.energy_core, "epic", "再升到史诗");
	assertEqual(saved.currency.exp, 5000 - 1390 * 2, "第二次也扣钱");
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
	assertEqual(lib.storage.rogueSlots[0].currency.exp, 5000 - 1390 * 2, "点链尾的按钮不扣钱");
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
		JSON.stringify(["「拾取」", "　50%：获得 1 倍胜利金币", "　50%：消耗 0.4 倍胜利金币", "「观察」", "　无奖励"]),
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
		collection: { events: [], curios: ["energy_core", "cursed_coin", "broken_watch"] },
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
	// 连点不同奇物：不叠层、不串台
	assertEqual(nodesWithClass("wm-rogue-detail-popup").length, 1, "任何时刻只有一个详情弹层");
	assert(!watch.text.includes("诅咒金币"), `详情内容不串台：${watch.text}`);
	click("关闭");
	assertEqual(nodesWithClass("wm-rogue-detail-popup").length, 0, "关闭后弹层销毁");
	assert(nodesWithClass("wm-rogue-index")[0], "关闭详情后图鉴还在原地");
	click("返回");
	assert(screenText().includes("开始下一关"), "返回应回到营地");
	return "能量核心 3 档 / 诅咒金币 4 档（含负面）/ 怀表 1 档";
});

await check("图鉴事件描述：裂隙三档/古代遗迹三门按 config 展示，交互选项不再写「无奖励」", async () => {
	freshWorld();
	putRun(0, {
		mode: "endless",
		collection: {
			events: ["abyss_rift", "ancient_ruins", "wandering_merchant", "curio_forge", "skill_forge", "spring_of_wisdom", "stat_training_ground"],
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
		const expect = `　开一场 ${cfg.RIFT_TIERS[i].enemies} 名敌人的裂隙战（不算层数），胜利得本层基准 ${cfg.RIFT_TIERS[i].multiplier} 倍金币与经验，每名敌人自带 ${cfg.RIFT_EXTRA_AFFIXES} 个深渊强化`;
		assert(rift.includes(expect), `裂隙第 ${i + 1} 档应写明奖励规则：${rift.join(" / ")}`);
	}
	assert(!rift.includes("无奖励"), `裂隙选项不该再显示无奖励：${rift.join(" / ")}`);
	// 古代遗迹：三扇门写明品质与折算经验（折算额 = expByWin + expIfNoCurioByWin）
	const ruins = openDetail("古代遗迹");
	assert(ruins.some(line => line.includes("获得一件普通奇物（该品质已集齐时改为获得 2 倍胜利经验）")),
		`白门应写明普通奇物与 0.5+1.5=2 倍折算：${ruins.join(" / ")}`);
	assert(ruins.some(line => line.includes("获得一件稀有奇物（该品质已集齐时改为获得 2 倍胜利经验）")),
		`紫门不再是「无奖励」：${ruins.join(" / ")}`);
	assert(ruins.some(line => line.includes("获得一件负面奇物") && !line.includes("改为获得")),
		`黑门没写折算就不写「改为」：${ruins.join(" / ")}`);
	// 交互选项：商人与融合炉写明价钱规则（读 config 倍率），换技能不再显示「无奖励」
	const merchant = openDetail("流浪商人");
	assert(merchant.some(line => line.includes(`奇物基准价 ×${cfg.MERCHANT_PRICE_MULTIPLIER}`) && line.includes("升一级品质")),
		`流浪商人应写明定价规则：${merchant.join(" / ")}`);
	const forge = openDetail("奇物融合炉");
	assert(forge.some(line => line.includes(`本层基准经验 ×${cfg.FORGE_EXP_MULTIPLIER}`)),
		`融合炉应写明费用规则：${forge.join(" / ")}`);
	const skillForge = openDetail("技能熔炉");
	assert(skillForge.some(line => line.includes("失去一个技能，换一个随机新技能")),
		`换技能选项不该是「无奖励」：${skillForge.join(" / ")}`);
	// 经验泉「再饮一口」：奖励与深渊债写同一行
	const spring = openDetail("经验泉");
	assert(spring.some(line => line.includes("获得 1 倍胜利经验") && line.includes(`每名敌人追加 ${cfg.SPRING_DEBT_AFFIXES} 个深渊强化`)),
		`再饮一口应连深渊债一起写：${spring.join(" / ")}`);
	// 属性训练场：写了 blockedText 的 statUp，全满注记换成原话，不再是「改送随机奇物」
	const training = openDetail("属性训练场");
	assert(training.some(line => line.includes("随机一项属性 +1（属性已满时：你太厉害了，没什么能学到的东西。）")),
		`训练场的全满注记应引自 blockedText：${training.join(" / ")}`);
	assert(!training.some(line => line.includes("改送一个随机奇物")),
		`训练场不该写「改送随机奇物」：${training.join(" / ")}`);
	click("返回");
	return "裂隙 3 档 + 遗迹 3 门 + 5 个交互选项全部有说明";
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
		// 三件老的 + 三件本轮新增的战斗内奇物：新键必须照样流到 storage。
		// battle.js 以前是逐个键手写这张表，漏一个键就是「技能挂上了但数值全是 0」——
		// 逻辑层测试自己往 storage 塞数所以照绿，只有这条真机链路的用例拦得住
		curios: ["energy_core", "lucky_stone", "broken_watch", "berserker_badge", "blood_rage_core", "counter_amulet"],
		// 能量核心升到史诗：战斗总表要按当前品质给 +4，而不是初始的 +1
		curioQuality: { energy_core: "epic", blood_rage_core: "rare", counter_amulet: "epic" },
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
		}),
		"storage 按当前品质写满每一张战斗内键（史诗能量核心 +4；稀有血怒核心带体力闸门与牌伤害 +1；史诗反击护符走本局那档；幸运石是结算类不进 storage）"
	);
	assertEqual(lib.hookmap.phaseBegin, true, "额外出牌阶段时机已登记");
	assertEqual(lib.hookmap.phaseDrawBegin2, true, "摸牌时机已登记");
	assertEqual(lib.hookmap.dying, true, "濒死时机已登记");
	assertEqual(lib.hookmap.roundEnd, true, "轮结束时机已登记");
	assertEqual(lib.hookmap.phaseEnd, true, "回合结束时机已登记（剩饭史诗档）");
	assertEqual(lib.hookmap.damageBegin1, true, "造成伤害加伤时机已登记（狂战/反击/血怒）");
	assertEqual(lib.hookmap.damage, true, "「我造成的伤害」时机已登记（狂战徽章认本回合第一下）");
	assertEqual(lib.hookmap.damageEnd, true, "受到伤害时机已登记（反击护符上 buff）");
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
		"反击护符（史诗）", "当你受到伤害后，本局游戏你造成的伤害 +1"]) {
		assert(curioText.includes(token), `奇物面板应显示「${token}」：${curioText.slice(0, 600)}`);
	}
	assertEqual(nodesWithClass("wm-rogue-stat-panel").length, 1, "奇物面板复用属性面板的版式");
	assertEqual(nodesWithClass("wm-rogue-stat-detail").length, 6, "六件奇物各一行");
	// 分两组：战斗里真生效的与结算才生效的分开，别让人以为诅咒金币/循环按钮这局马上能吃到
	const splitAt = curioText.indexOf("结算时生效");
	assert(curioText.includes("战斗内生效") && splitAt > 0, `两组标题都要在：${curioText.slice(0, 400)}`);
	assert(curioText.indexOf("能量核心") < splitAt, `战斗类的奇物不该落到结算组：${curioText.slice(0, 400)}`);
	assert(curioText.indexOf("破损怀表") < splitAt, `破损怀表是本局生效的：${curioText.slice(0, 400)}`);
	assert(curioText.indexOf("狂战徽章") < splitAt, `狂战徽章是战斗内生效的：${curioText.slice(0, 400)}`);
	assert(curioText.indexOf("幸运石") > splitAt, `幸运石只有结算加成，不该出现在战斗组：${curioText.slice(0, 400)}`);
	common.closeScreen();
	return "rogue_curio + storage 十三键全量 + 战斗/结算分组";
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

await check("奇物商店 10% 门控：未命中清空旧批次且不触发事件，命中才整批上新货（先奇物商店、后事件）", async () => {
	freshWorld();
	const originalRandom = Math.random;
	try {
		// 第一胜：rng=0.5 → 奇物商店 0.5≥0.1 未命中、事件 0.5≥0.3 未触发
		Math.random = () => 0.5;
		putRun(0, {
			mode: "endless",
			level: 3,
			curioOffers: [{ id: "lucky_stone", price: 66 }],
		});
		session();
		click("开始下一关");
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
		click("开始下一关");
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
	click("开始下一关");
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
	for (const [mode, level, label] of [
		["challenge", 30, "闯关封顶关"],
		["endless", 5, "无尽低层"],
	]) {
		freshWorld();
		lib.character["本体测试将"] ??= { hp: 4, maxHp: 4, skills: [] };
		putRun(0, { mode, level }, stateModule.createRun(mode, "迪迦", 1));
		session();
		click("开始下一关");
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
				{ text: "接受训练 → 随机属性 +1（-20 经验）", reward: { exp: -20, statUp: "defense" }, blockedText: "你太厉害了，没什么能学到的东西。" },
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
	return "资源条两块 + 满级弹提示不扣钱";
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
				{ text: "接受训练 → 随机属性 +1（-20 经验）", reward: { exp: -20, statUp: "defense" }, blockedText: "你太厉害了，没什么能学到的东西。" },
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

await check("深渊裂隙：先确认再进场，敌人数与词缀按事件参数生成，胜利只发定死的钱且不推进关卡", async () => {
	freshWorld();
	putRun(0, {
		mode: "endless",
		characterId: "迪迦",
		level: 5,
		currency: { gold: 0, exp: 0 },
		shopRefreshesRemaining: 0,
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
	assertEqual(entered.currentBattle.enemies.filter(entry => entry.abyss.length === 1).length, 5, "第 5 层本不该有词缀，裂隙每名敌人都要带一条");
	assertEqual(JSON.stringify(entered.currentBattle.rift), JSON.stringify({ level: 4, enemies: 5, affixes: 1, gold: 800, exp: 320 }), "rift 参数落盘，重载后靠它把这场该发多少带回来");
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
	assertEqual(won.currentBattle, null, "战斗标记清掉");
	return "确认 → 5 名带词缀 → 只发定死的钱";
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
	click("开始下一关");
	await flush();
	const run = lib.storage.rogueSlots[0];
	assertEqual(run.abyssDebt, 0, "开战即把债清掉");
	assertEqual(run.currentBattle.enemies.length, 1, "第 4 关常规 1 名敌人");
	assertEqual(run.currentBattle.enemies[0].abyss.length, 2, "欠两个就追加两个");
	assertEqual(new Set(run.currentBattle.enemies[0].abyss).size, 2, "追加的两个不重复");
	assertEqual(run.currentBattle.rift, null, "普通战斗不带裂隙参数（结算照旧推进关卡、照旧掷事件）");
	return "债在开战时兑现并清零";
});

console.log(`\nrogue-mode-smoke: passed=${passed} failed=${failures.length}`);
if (failures.length) {
	console.log(`失败用例：${failures.join("、")}`);
	process.exit(1);
}
