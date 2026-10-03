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
const enemyModule = await load("src/rogue/enemy.js");
const stateModule = await load("src/rogue/state.js");
const statsData = await load("src/rogue/data/stats.js");
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
	assert(Object.keys(config.skill).length > 100, "分包技能应一并并入模式 skill 表");
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
	return `${Object.keys(config.skill).length} 项技能定义（全部为分包技能 + rogue_stat）`;
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
	const pool = enemyModule.getChallengeEnemyPool();
	assert(pool.includes(enemies[0].characterId), `敌人 ${enemies[0].characterId} 应来自扩展角色池`);
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
	const bare = stub.ui.create.player();
	bare.addSkill("rogue_extra");
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
			shaDamage: expected.shaDamage,
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
	assert(enemy.hasSkill("rogue_stat"), "摸牌/杀伤害加成应由同一强化技能承载");
	assertEqual(
		JSON.stringify(enemy.storage.rogue_stat),
		JSON.stringify({ extraDraw: 1, handLimit: 0, shaDamage: 1, shaLimit: 0 }),
	 "敌人 storage 四项数值与玩家同一套"
	);
	assertEqual(game.me.hasSkill("rogue_stat"), false, "强化技能不该串到玩家身上");
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
	assertEqual(liveSkills, "grp_buy,grp_buy_locked", "玩家身上应是主技能 + group 伙伴");
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
		assertEqual(game.me.hasSkill("rogue_stat"), false, "无数值加成时不该加强化技能");
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
	// 价格在生成候选时定死：基准价固定 50 ±25%（38~63），与关卡无关，重进商店 / 刷新 UI 都不会重掷
	const prices = saved.shopOffers.map(offer => offer.price);
	assert(prices.every(price => price >= 38 && price <= 63), `售价应在 38~63：${prices.join(",")}`);
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
	assert(text.includes("没有当前可用"), `应报出阵容问题：${text}`);
	assertEqual(lib.storage.rogueSlots[0].currentBattle, null, "应清除无效的战斗标记");
	return "阵容错误可见";
});

await check("大厅 BGM：进大厅循环播、换页面与删档都不打断、进战斗停止并静音/还原本体 BGM", async () => {
	freshWorld();
	putRun(0, {});
	putRun(1, {});
	lib.storage.rogueActive = 0;
	// 页面加载时本体自己的 BGM 通常在放
	ui.backgroundMusic.paused = false;
	ui.backgroundMusic.currentTime = 7;
	ui.backgroundMusic.volume = 1;
	session();
	const audio = stub.createdAudios.filter(node => node !== ui.backgroundMusic).at(-1);
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
	// 进战斗：我们的停止，本体的放回音量（曲子本来就没停，自然接着原进度）
	click("开始下一关");
	await flush();
	assert(audio.paused, "进战斗应停止 BGM");
	assertEqual(ui.backgroundMusic.volume, 1, "进战斗应把本体 BGM 音量放回去");
	assert(!ui.backgroundMusic.paused, "本体 BGM 不该被停掉：大厅期间只是静音");
	assertEqual(ui.backgroundMusic.currentTime, 7, "本体 BGM 保持原进度");
	return audio.src;
});

console.log(`\nrogue-mode-smoke: passed=${passed} failed=${failures.length}`);
if (failures.length) {
	console.log(`失败用例：${failures.join("、")}`);
	process.exit(1);
}
