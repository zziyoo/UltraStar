// 奥特之星·肉鸽：模式流程冒烟夹具。node tools/test/rogue-mode-smoke.mjs
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
const modeModule = await load("src/rogue/mode.js");
const battleModule = await load("src/rogue/battle.js");
const stateModule = await load("src/rogue/state.js");
const statsData = await load("src/rogue/data/stats.js");
const groupsData = await load("src/rogue/data/enemyGroups.js");
const common = await load("src/rogue/ui/common.js");

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
	assert(node, `「${textValue}」及其父节点都没有绑定点击`);
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
	// 部分用例需要一个“池子之外”的技能 id，这里当作作者新增的技能
	lib.skill.rogue_extra = { forced: true };
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

await check("模式配置：肉鸽技能挂在模式上，dieAfter/checkResult 齐备", () => {
	freshWorld();
	const config = modeModule.createModeConfig();
	assertEqual(config.name, cfg.MODE_ID);
	assertEqual(config.splash, cfg.MODE_SPLASH);
	for (const id of ["rogue_xushui", "rogue_jiema", "rogue_guiyuan", "rogue_stat"]) {
		assert(config.skill[id], `${id} 应在模式 skill 表里`);
		assert(config.translate[id], `${id} 应有翻译`);
	}
	for (const old of ["rogue_stat_draw", "rogue_stat_hand", "rogue_stat_sha", "rogue_stat_usable"]) {
		assert(!config.skill[old], `${old} 应已合并进 rogue_stat`);
	}
	assertEqual(lib.character["死龙"].isHiddenBoss, true, "不应改动角色库");
	assert(typeof config.element.player.dieAfter === "function", "应提供 element.player.dieAfter");
	assert(typeof config.game.checkResult === "function", "应提供 game.checkResult");
	assert(typeof config.game.onover === "function", "应提供 game.onover（本体自动推进 lib.onover）");
	return Object.keys(config.skill).join(",");
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
	assertEqual(dialog.buttons.length, 63, "候选总数（桩里 4 个基础角色 + 59 个测试角色）");
	assertEqual(dialog.paginationMaxCount.get("character"), cfg.CHARACTER_PICKER_PAGE_SIZE, "每页张数应放开");
	assertEqual(dialog.buttons.filter(button => !button.classList.contains("nodisplay")).length, cfg.CHARACTER_PICKER_PAGE_SIZE, "第一页显示 24 张");
	const pager = dialog.paginationMap.get(dialog.content.querySelector(".buttons"));
	assertEqual(pager.state.totalPageCount, 3, `页数应重算：${pager.state.totalPageCount}`);
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

await check("Hub：角色/关卡/货币/属性与四个按钮（不再有技能入口）", async () => {
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
	return "营地信息齐备";
});

await check("开局：先落盘 groupId 再建局，本体事件调用顺序正确", async () => {
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
	assert(typeof run.currentBattle.groupId === "string" && run.currentBattle.groupId, "应写入 groupId");
	const arena = log.find(item => item.type === "prepareArena");
	const expected = 1 + groupsData.getEnemyGroup(run.currentBattle.groupId).enemies.length;
	assertEqual(arena.num, expected, `座位数应为 ${expected}`);
	assertEqual(log.find(item => item.type === "phaseLoop").player, "me", "应由玩家开始循环");
	assertEqual(game.no_continue_game, true, "应关闭本体的“再战”控件");
	return order.join(" → ");
});

await check("敌我强化只作用于 Player，不回写 lib.character", async () => {
	const snapshot = JSON.stringify(lib.character);
	const run = lib.storage.rogueSlots[0];
	const enemy = game.players[1];
	assert(enemy, "应存在敌方 Player");
	assert(enemy.__char, "敌方应已 init 角色");
	assertEqual(game.players.length, 1 + groupsData.getEnemyGroup(run.currentBattle.groupId).enemies.length, "座位数与阵容一致");
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

await check("玩家属性与技能在开局时按存档重建", async () => {
	putRun(2, {
		mode: "challenge",
		level: 1,
		skills: ["rogue_xushui"],
		stats: { defense: 1, draw: 0, attack: 0 },
		currentBattle: { groupId: "group_zofer", status: "battle" },
		currency: { gold: 0, exp: 0 },
	}, stateModule.createRun("challenge", "迪迦", 1));
	session();
	click("重新挑战这一关");
	await flush();
	assertEqual(game.me.__char, "迪迦", "玩家角色来自存档");
	assert(game.me.hasSkill("rogue_xushui"), "存档技能应重新赋予");
	// 触发类技能能否触发，取决于建局时是否分配了 playerid（本体 addSkill 的钩子注册条件）
	assert(game.me.playerid, "玩家应有 playerid");
	assert(game.players.every(player => player.playerid), "每个座位都应有 playerid");
	assertEqual(lib.hookmap.phaseDrawBegin2, true, "该技能的触发时机应已登记进 hookmap");
	const bare = stub.ui.create.player();
	bare.addSkill("rogue_xushui");
	assertEqual(lib.hookmap.phaseDrawBegin2, true, "无 playerid 的新座位不应影响已登记的钩子");
	assertEqual(game.me.maxHp, 4, "占位属性无数值，体力上限不该被凭空改动");
	assertEqual(game.me.hasSkill("rogue_stat"), false, "只有护甲时不该加数值强化技能");
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
		currentBattle: { groupId: "group_zofer", status: "battle" },
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
			shaDamage: expected.shaDamage,
			shaLimit: expected.shaLimit,
		}),
		"storage 应是一次性写入的四项最终值"
	);
	assertEqual(game.me.__skills.filter(id => id.startsWith("rogue_stat")).length, 1, "只应有一个强化技能");
	return `rogue_stat ${JSON.stringify(game.me.storage.rogue_stat)}`;
});

await check("敌人强化：额外技能与体力上限只加在该 Player 上", async () => {
	lib.character["赛文"] = { hp: 5, maxHp: 5, skills: [] };
	putRun(3, {
		mode: "challenge",
		level: 1,
		characterId: "赛文",
		currentBattle: { groupId: "group_seven", status: "battle" },
	}, stateModule.createRun("challenge", "赛文", 1));
	session();
	click("重新挑战这一关");
	await flush();
	const enemy = game.players[1];
	const cfgEnemy = groupsData.getEnemyGroup("group_seven").enemies[0];
	assertEqual(enemy.__char, "赛文", "敌人角色来自配置");
	assert(enemy.hasSkill("rogue_xushui"), "敌人额外技能应施加到该 Player");
	assertEqual(game.me.hasSkill("rogue_xushui"), false, "不该串到玩家身上");
	assertEqual(enemy.maxHp, lib.character["赛文"].maxHp + cfgEnemy.overrides.maxHp, "应叠加 overrides.maxHp");
	assertEqual(JSON.stringify(lib.character["赛文"]), JSON.stringify({ hp: 5, maxHp: 5, skills: [] }), "角色库不被改写");
	return `敌 ${enemy.__char} maxHp ${lib.character["赛文"].maxHp} → ${enemy.maxHp}`;
});

await check("胜利结算：奖励入账、关卡推进、清除标记且不重复结算", async () => {
	freshWorld();
	session();
	await newRunByUi("闯关模式");
	click("开始下一关");
	await flush();
	const beforeLevel = lib.storage.rogueSlots[0].level;
	const beforeGold = lib.storage.rogueSlots[0].currency.gold;
	for (const player of game.players.slice(1)) {
		player.__alive = false;
	}
	lib.element.player.dieAfter.call(game.players[1]);
	const run = lib.storage.rogueSlots[0];
	assertEqual(run.currentBattle, null, "战斗标记应清除");
	assertEqual(run.level, beforeLevel + 1, "推进一关");
	assert(run.currency.gold > beforeGold, "金币入账");
	const gold = run.currency.gold;
	for (const fn of lib.onover) {
		fn(true);
	}
	assertEqual(lib.storage.rogueSlots[0].currency.gold, gold, "不得重复结算");
	assertEqual(log.filter(item => item.type === "over").length, 1, "game.over 只应发生一次");
	const text = screenText();
	assert(text.includes("战斗胜利"), "应显示胜利页");
	assert(text.includes("本关奖励") && text.includes(`金币 +${gold - beforeGold}`), `奖励应分行突出：${text}`);
	assert(text.includes(`下一关：第 ${run.level} 关`), `应写明下一关：${text}`);
	return `第${beforeLevel}关 → 第${run.level}关，+${gold - beforeGold} 金币`;
});

await check("返回营地：directstart + reload，重启后落到 Hub", async () => {
	click("返回营地");
	assert(log.some(item => item.type === "reload"), "应调用 game.reload");
	assertEqual(globalThis.localStorage.getItem(`${lib.configprefix}directstart`), "true", "应设置 directstart");
	session();
	const text = screenText();
	assert(text.includes("开始下一关"), `重启后应回到 Hub：${text}`);
	assert(!text.includes("没有正常结算"), "已正常结算时不该提示恢复");
	return "Hub 复原";
});

await check("无尽最高记录：通关才更新，闯关不更新，失败删档也不清", async () => {
	freshWorld();
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
});

await check("选择玩法页：自建浮层 + 两张玩法卡 + 无尽历史最高记录", async () => {
	lib.storage.rogueBestEndless = { level: 27, characterId: "迪迦", updatedAt: 1 };
	session();
	click("空存档");
	let text = screenText();
	const stage = nodesWithClass("wm-rogue-modes")[0];
	assert(stage, "选择玩法也是自建浮层");
	assertEqual(nodesWithClass("wm-rogue-mode-card").length, 2, "两张玩法卡");
	for (const token of ["闯关模式", `固定总关卡数：${cfg.CHALLENGE_TOTAL_LEVELS} 关`, "失败：损失部分货币", "无尽模式", "关卡无限", "失败：整档删除"]) {
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

await check("异常退出恢复：重打同一组敌人，不判胜、不补奖、不跳关", async () => {
	const run = putRun(0, { currentBattle: { groupId: "group_seven", status: "battle" } });
	session();
	assert(screenText().includes("没有正常结算"), "应提示未完成战斗");
	const before = log.length;
	click("重新挑战这一关");
	await flush();
	assert(log.slice(before).map(item => item.type).includes("phaseLoop"), "应重新进入战斗");
	const saved = lib.storage.rogueSlots[0];
	assertEqual(saved.currentBattle.groupId, "group_seven", "沿用存档里的敌人组合，不重掷");
	assertEqual(saved.level, run.level, "关卡未被跳过");
	assertEqual(saved.currency.gold, run.currency.gold, "未重复领取奖励");
	assert(!log.slice(before).some(item => item.type === "over"), "不得自动判定胜利");
	return `沿用 ${saved.currentBattle.groupId}`;
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
	// 价格在生成候选时定死：第 1 局基准 5（4~6），重进商店 / 刷新 UI 都不会重掷
	const prices = saved.shopOffers.map(offer => offer.price);
	assert(prices.every(price => price >= 4 && price <= 6), `第1局售价应在 4~6：${prices.join(",")}`);
	click("返回");
	click("商店");
	assertEqual(
		lib.storage.rogueSlots[0].shopOffers.map(offer => offer.price).join(","),
		prices.join(","),
		"重进商店不重新随机价格"
	);
	return `候选 ${saved.shopOffers.map(offer => offer.id).join(",")} 价格 ${prices.join(",")}`;
});

await check("商店：技能卡画出出处头像，没有出处的标成专属", async () => {
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
	assert(text.includes("肉鸽专属技能"), "没有出处的候选标成专属");
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
	putRun(0, {
		characterId: "导航测试",
		level: 1,
		currentBattle: null,
		shopOffers: [],
		currency: { gold: 100, exp: 0 },
		skills: [],
	});
	session();
	// 把角色的原生技能设成「除 rogue_jiema 外的整个池子」：候选只剩一个，结果才可断言
	lib.character["导航测试"] = [4, "custom", 0, poolIds.filter(id => id !== "rogue_jiema"), 1];
	click("商店");
	const offers = lib.storage.rogueSlots[0].shopOffers;
	assertEqual(offers.length, 1, "排除角色原生技能后只剩一个候选");
	assertEqual(offers[0].id, "rogue_jiema", "不在当前持有里的技能可以正常出现");
	assert(!offers.some(offer => offer.id !== "rogue_jiema"), "不得随机到角色原生技能");
	// 当前持有的会被排除，角色原生技能也继续排除，其余池子照常给满候选
	putRun(0, { shopOffers: [], skills: ["rogue_jiema"] });
	session();
	lib.character["导航测试"] = [4, "custom", 0, ["rogue_xushui"], 1];
	click("商店");
	const again = lib.storage.rogueSlots[0].shopOffers;
	assert(!again.some(offer => offer.id === "rogue_jiema"), "当前持有的技能不该上架");
	assert(!again.some(offer => offer.id === "rogue_xushui"), "角色原生技能不该上架");
	assertEqual(again.length, cfg.SKILL_OFFER_COUNT, "其余池子照常给满候选");
	return `只剩 ${offers[0].id} / 持有与原生都排除`;
});

await check("商店：购买一个后本次不能再买第二个", async () => {
	putRun(0, {
		currentBattle: null,
		currency: { gold: 1000, exp: 0 },
		shopOffers: [
			{ id: "rogue_extra", price: 10, sold: false },
			{ id: "rogue_xushui", price: 10, sold: false },
			{ id: "rogue_jiema", price: 10, sold: false },
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

await check("技能上限：满槽购买走替换页，替换后仍不超过 3 个", async () => {
	putRun(0, {
		skills: ["rogue_xushui", "rogue_jiema", "rogue_guiyuan"],
		shopOffers: [{ id: "rogue_extra", price: 10, sold: false }],
		currency: { gold: 500, exp: 0 },
		currentBattle: null,
	});
	session();
	click("商店");
	clickNode(nodesWithClass("wm-rogue-shop-buy")[0]);
	assert(screenText().includes("选择要替换的技能"), "应进入替换页");
	click("用新技能替换它");
	const after = lib.storage.rogueSlots[0];
	assertEqual(after.skills.length, cfg.SKILL_SLOTS, "槽位数不超过上限");
	assert(!after.skills.includes("rogue_xushui"), "被选中的旧技能已移除");
	assert(after.skills.includes("rogue_extra"), "新技能已加入");
	return after.skills.join(",");
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
	assert(text.includes("初始护甲 +2") && text.includes("体力上限 +2"), "防御的累计效果要一起列出");
	assert(text.includes("暂无加成"), "其他两项没加成");
	return "防御含体力上限";
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
		skills: ["rogue_xushui"],
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
	putRun(0, { currentBattle: { groupId: "group_not_exists", status: "battle" }, shopOffers: [] });
	session();
	click("重新挑战这一关");
	const text = dump(ui.lastDialog);
	assert(text.includes("不存在") || text.includes("没有可用"), `应报出配置问题：${text}`);
	assertEqual(lib.storage.rogueSlots[0].currentBattle, null, "应清除无效的战斗标记");
	return "配置错误可见";
});

console.log(`\nrogue-mode-smoke: passed=${passed} failed=${failures.length}`);
if (failures.length) {
	console.log(`失败用例：${failures.join("、")}`);
	process.exit(1);
}
