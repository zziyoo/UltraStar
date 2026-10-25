// 宇宙日冕高斯 / 日蚀高斯 / 未来高斯 专项测试（含红黑公共基座）。
// shared 与各包 skills.js 直接 import 浏览器包 noname.js 及 shared 工具，
// 这里剥掉 import 后用最小桩件求值，验证红黑基座、“宇”扩展区、拼点奖励与弃牌堆获得的实际代码路径。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..", "..");
const ultraman = path.join(root, "packages", "ultraman");
const sharedFile = path.join(ultraman, "shared", "skills.js");
const eternalSkillsFile = path.join(ultraman, "packs", "eternal-torch", "skills.js");
const daybreakSkillsFile = path.join(ultraman, "packs", "daybreak", "skills.js");

// 包内 skills.js 会 import shared 工具（getNewDiscardCards），剥掉全部 import 后由桩件注入
function loadExports(file, names, extraArgs = {}) {
	const source = fs
		.readFileSync(file, "utf8")
		.replace(/^import[^\n]*;/gm, "")
		.replace(/^export\s+(const|let|var|async function|function)\s+/gm, "$1 ");
	const argNames = ["lib", "game", "ui", "get", "ai", "_status", ...Object.keys(extraArgs)];
	return new Function(...argNames, `${source}\nreturn {${names.join(",")}};`);
}

function makeCard(name, suit, number, type = "basic", tags = {}) {
	const color = suit === "heart" || suit === "diamond" ? "red" : suit === "spade" || suit === "club" ? "black" : "none";
	return {
		name,
		suit,
		number,
		type,
		color,
		tags,
		gaintag: [],
		pos: null,
		isCard: true,
		addGaintag(tag) {
			if (!this.gaintag.includes(tag)) this.gaintag.push(tag);
		},
		hasGaintag(tag) {
			return this.gaintag.includes(tag);
		},
	};
}

function makeVCard(name, cards) {
	return { name, cards, isVCard: true };
}

const _status = { mode: "identity", event: null };
const logs = [];
const game = {
	players: [],
	log(...args) {
		logs.push(args);
	},
};
const ui = {
	cardPile: { childNodes: [] },
	discardPile: { childNodes: [] },
};
const get = {
	mode() {
		return _status.mode;
	},
	player() {
		return _status.event?.player;
	},
	event() {
		return _status.event;
	},
	itemtype(value) {
		if (!value || typeof value !== "object") return undefined;
		if (value.isVCard) return "vcard";
		if (value.isCard) return "card";
		return undefined;
	},
	position(card) {
		return card ? card.pos : null;
	},
	number(card) {
		return card?.number;
	},
	color(card) {
		if (card?.color !== undefined) return card.color;
		const suit = card?.suit;
		if (suit === "heart" || suit === "diamond") return "red";
		if (suit === "spade" || suit === "club") return "black";
		return "none";
	},
	cards(num) {
		const list = [];
		while (num-- > 0 && ui.cardPile.childNodes.length) {
			const card = ui.cardPile.childNodes.shift();
			card.pos = "o";
			list.push(card);
		}
		return list;
	},
	cnNumber(value) {
		return String(value);
	},
	translation(value) {
		return value;
	},
	attitude(from, to) {
		if (!from || !to) return 0;
		if (typeof from.side === "boolean" && typeof to.side === "boolean") return from.side === to.side ? 5 : -5;
		return 1;
	},
};
const ai = {};

const libTable = {
	skill: {},
	translate: {},
	character: {},
	filter: {
		notMe() {},
		all() {
			return true;
		},
	},
};

// 1) 先加载 shared，得到基座技能与弃牌堆工具
const shared = loadExports(sharedFile, ["skills", "getNewDiscardCards"])(libTable, game, ui, get, ai, _status);

// 2) 再加载两个分包技能（注入 shared 的 getNewDiscardCards）
const eternalSkills = loadExports(eternalSkillsFile, ["skills"], { getNewDiscardCards: shared.getNewDiscardCards })(
	libTable,
	game,
	ui,
	get,
	ai,
	_status,
	shared.getNewDiscardCards,
).skills;
const daybreakSkills = loadExports(daybreakSkillsFile, ["skills"], { getNewDiscardCards: shared.getNewDiscardCards })(
	libTable,
	game,
	ui,
	get,
	ai,
	_status,
	shared.getNewDiscardCards,
).skills;

// 3) 模拟本体 game.finishSkill 的 inherit 处理（仅键级覆盖语义）
function applyInherit(table, id) {
	const info = table[id];
	if (!info?.inherit) return;
	const parent = table[info.inherit];
	if (!parent) throw new Error(`inherit 目标不存在: ${info.inherit}`);
	for (const key of Object.keys(parent)) {
		if (info[key] == null) {
			const value = parent[key];
			info[key] = Array.isArray(value) ? value.slice() : value && typeof value === "object" ? { ...value } : value;
		}
	}
}
const skills = {
	...shared.skills,
	...eternalSkills,
	...daybreakSkills,
};
for (const id of ["yzrmgsyuzhou", "rsgsrishi", "wlgswl"]) applyInherit(skills, id);

let passed = 0;
const failures = [];
async function check(name, fn) {
	try {
		await fn();
		passed++;
		console.log(`  ok   ${name}`);
	} catch (error) {
		failures.push({ name, error });
		console.error(`  FAIL ${name}: ${error.message}`);
	}
}
function assert(condition, message) {
	if (!condition) throw new Error(message);
}
function equal(actual, expected, message) {
	if (actual !== expected) throw new Error(`${message}: ${JSON.stringify(actual)} !== ${JSON.stringify(expected)}`);
}
function resetBoard() {
	ui.cardPile.childNodes.length = 0;
	ui.discardPile.childNodes.length = 0;
	logs.length = 0;
}

function makePlayer(options = {}) {
	const name = options.name ?? "宇宙日冕高斯";
	const player = {
		name,
		hp: options.hp ?? 4,
		maxHp: options.maxHp ?? 4,
		side: options.side,
		storage: options.storage ?? {},
		skills: options.skills ?? [],
		hand: options.hand ?? [],
		expansions: [],
		dead: options.dead ?? false,
		markCalls: [],
		insertCalls: [],
		drawCalls: [],
		gainCalls: [],
		loseCalls: [],
		recoverCalls: [],
		compareQueue: options.compareQueue ?? [],
		compareCalls: [],
		controlQueue: options.controlQueue ?? null,
		canCompareResults: options.canCompareResults ?? null,
		isIn() {
			return !this.dead;
		},
		getStorage(name2, defaultValue = []) {
			return this.storage[name2] || defaultValue;
		},
		setStorage(name2, value) {
			this.storage[name2] = value;
			return value;
		},
		countExpansions(tag) {
			return this.getExpansions(tag).length;
		},
		getExpansions(tag) {
			return this.expansions.filter(card => card.hasGaintag(tag));
		},
		addToExpansion(cards, source, animate) {
			const list = Array.isArray(cards) ? cards : [cards];
			for (const card of list) {
				card.pos = "x";
				this.expansions.push(card);
			}
			// 本体 addToExpansion 同步返回可 await 的事件对象，gaintag.add 在 await 前调用
			return {
				gaintag: {
					add: tag => list.forEach(card => card.addGaintag(tag)),
				},
			};
		},
		markSkill(skill) {
			this.markCalls.push(["mark", skill]);
		},
		unmarkSkill(skill) {
			this.markCalls.push(["unmark", skill]);
		},
		async loseToDiscardpile(cards) {
			const list = Array.isArray(cards) ? cards : [cards];
			for (const card of list) {
				const index = this.expansions.indexOf(card);
				if (index >= 0) this.expansions.splice(index, 1);
				card.pos = "d";
				ui.discardPile.childNodes.push(card);
			}
			this.loseCalls.push(list.slice());
		},
		async gain(cards, animate) {
			const list = Array.isArray(cards) ? cards.slice() : [cards];
			for (const card of list) {
				const pileIndex = ui.cardPile.childNodes.indexOf(card);
				if (pileIndex >= 0) ui.cardPile.childNodes.splice(pileIndex, 1);
				const discardIndex = ui.discardPile.childNodes.indexOf(card);
				if (discardIndex >= 0) ui.discardPile.childNodes.splice(discardIndex, 1);
				const expansionIndex = this.expansions.indexOf(card);
				if (expansionIndex >= 0) this.expansions.splice(expansionIndex, 1);
				card.pos = "h";
				if (!this.hand.includes(card)) this.hand.push(card);
			}
			this.gainCalls.push(list.slice());
			return list;
		},
		getCards(position) {
			if (position === "h") return this.hand.slice();
			if (position === "x") return this.expansions.slice();
			return [...this.hand, ...this.expansions];
		},
		hasCard(filter, position) {
			return this.getCards(position ?? "h").some(filter);
		},
		insertPhase(skill) {
			this.insertCalls.push(skill);
		},
		async draw(num) {
			this.drawCalls.push(num ?? 1);
		},
		canCompare(target) {
			if (this.canCompareResults) return this.canCompareResults.shift();
			return target.hand.length > 0;
		},
		chooseToCompare(target) {
			this.compareCalls.push(target);
			const result = this.compareQueue.shift() ?? { bool: true, winner: this };
			return {
				result,
				async forResult() {
					return result;
				},
			};
		},
		chooseControl(choices) {
			const state = { choices, prompt: null, sets: {} };
			const api = {
				sets: state.sets,
				set(key, value) {
					state.sets[key] = value;
					_status.event = { ...(_status.event ?? {}), player, ...state.sets };
					return api;
				},
				async forResult() {
					if (player.controlQueue) return { control: player.controlQueue.shift() };
					const decision = state.sets.ai?.();
					return { control: decision };
				},
			};
			return api;
		},
		async recover(num) {
			this.recoverCalls.push(num);
			this.hp = Math.min(this.maxHp, this.hp + num);
		},
	};
	return player;
}

function pileCard(name, suit, number, pos) {
	const card = makeCard(name, suit, number);
	card.pos = pos ?? "c";
	if (pos === "d") ui.discardPile.childNodes.push(card);
	else ui.cardPile.childNodes.push(card);
	return card;
}

console.log("宇宙日冕 / 日蚀 / 未来（红黑公共基座）");

await check("三名新角色登记齐全：角色、称号、前缀、介绍与素材", () => {
	const eternalChars = fs.readFileSync(path.join(ultraman, "packs", "eternal-torch", "characters.js"), "utf8");
	const daybreakChars = fs.readFileSync(path.join(ultraman, "packs", "daybreak", "characters.js"), "utf8");
	const eternalMeta = fs.readFileSync(path.join(ultraman, "packs", "eternal-torch", "characters-meta.js"), "utf8");
	const daybreakMeta = fs.readFileSync(path.join(ultraman, "packs", "daybreak", "characters-meta.js"), "utf8");
	assert(eternalChars.includes("宇宙日冕高斯") && eternalChars.includes("日蚀高斯"), "eternal-torch 角色未登记");
	assert(daybreakChars.includes("未来高斯"), "daybreak 角色未登记");
	for (const [name, title, prefix] of [
		["宇宙日冕高斯", "光辉与宇宙", "宇宙日冕"],
		["日蚀高斯", "仁慈与力量", "日蚀"],
	]) {
		assert(eternalMeta.includes(`${name}: "${title}"`), `${name} 称号`);
		assert(eternalMeta.includes(`${name}_prefix: "${prefix}"`), `${name} 前缀`);
	}
	assert(daybreakMeta.includes('未来高斯: "未来与希望"'), "未来高斯 称号");
	assert(daybreakMeta.includes('未来高斯_prefix: "未来"'), "未来高斯 前缀");
	const bootstrap = fs.readFileSync(path.join(root, "src", "core", "bootstrap.js"), "utf8");
	for (const [prefix, color] of [
		["宇宙日冕", "#A276E8"],
		["日蚀", "#F3B544"],
		["未来", "#27E6D2"],
	]) {
		assert(bootstrap.includes(`lib.namePrefix.set("${prefix}", { color: "${color}"`), `${prefix} 前缀颜色未注册`);
	}
	const registry = fs.readFileSync(path.join(root, "src", "core", "registry.js"), "utf8");
	for (const name of ["宇宙日冕高斯", "日蚀高斯", "未来高斯"]) {
		assert(registry.includes(`"${name}"`), `${name} 未进入 CHARACTER_ORDER`);
	}
	// 角色字段与占位图（复用现有高斯图片，文件必须真实存在）
	const eternalModule = loadExports(path.join(ultraman, "packs", "eternal-torch", "characters.js"), ["characters"])(
		libTable,
		game,
		ui,
		get,
		ai,
		_status,
	).characters;
	const daybreakModule = loadExports(path.join(ultraman, "packs", "daybreak", "characters.js"), ["characters"])(
		libTable,
		game,
		ui,
		get,
		ai,
		_status,
	).characters;
	const expectations = [
		[eternalModule["宇宙日冕高斯"], "yzrmgsyuzhou"],
		[eternalModule["日蚀高斯"], "rsgsrishi"],
		[daybreakModule["未来高斯"], "wlgswl"],
	];
	for (const [info, skill] of expectations) {
		assert(info, "角色信息缺失");
		equal(info.sex, "male", "性别");
		equal(info.group, "ao", "势力");
		equal(info.hp, 4, "体力");
		equal(info.names, "null|高斯", "names");
		equal(info.skills.join(","), skill, "技能");
		const imgPath = path.join(root, info.img.slice("extension/奥特之星/".length));
		assert(fs.existsSync(imgPath), `占位立绘不存在: ${info.img}`);
	}
});

await check("红黑基座：inherit 结构正确，不携带日冕的花色强化", () => {
	// 基座只包含 useCard1 的红黑效果
	assert(skills.aohonghei, "基座技能缺失");
	assert(JSON.stringify(skills.aohonghei.group) === JSON.stringify(["aohonghei_use"]), "基座 group");
	assert(skills.aohonghei.subSkill.use.trigger.player === "useCard1", "基座触发时机");
	const expectedGroups = {
		yzrmgsyuzhou: ["aohonghei_use", "yzrmgsyuzhou_place", "yzrmgsyuzhou_gain"],
		rsgsrishi: ["aohonghei_use", "rsgsrishi_pindian"],
		wlgswl: ["aohonghei_use", "wlgswl_markDamage", "wlgswl_gain", "wlgswl_reset"],
	};
	for (const id of ["yzrmgsyuzhou", "rsgsrishi", "wlgswl"]) {
		equal(skills[id].inherit, "aohonghei", `${id} inherit 指向`);
		// group 必须显式列出基座 use 与全部自身子技能（引擎 expandSkills 只展开 group 引用）
		assert(JSON.stringify(skills[id].group) === JSON.stringify(expectedGroups[id]), `${id} group`);
		for (const entry of expectedGroups[id].slice(1)) {
			assert(skills[id].subSkill[entry.slice(id.length + 1)], `${id} group 引用的子技能已定义: ${entry}`);
		}
		equal(skills[id].locked, true, `${id} 锁定技`);
		assert(skills[id].mod === undefined, `${id} 不应继承任何 mod`);
		assert(skills[id].subSkill.use === undefined, `${id} 不应继承基座 use 子技能对象`);
	}
	// 既有日冕六项效果不受影响
	const rmgs = eternalSkills.rmgsrimian;
	assert(
		JSON.stringify(rmgs.group) ===
			JSON.stringify(["rmgsrimian_use", "rmgsrimian_heart", "rmgsrimian_spade", "rmgsrimian_prepare", "rmgsrimian_mark"]),
		"日冕 group 被改动",
	);
	assert(rmgs.mod && rmgs.mod.targetInRange && rmgs.mod.cardUsable, "日冕 mod 被改动");
	// 分包技能 id 与 shared 无冲突
	const sharedIds = new Set(Object.keys(shared.skills));
	for (const id of Object.keys(eternalSkills)) assert(!sharedIds.has(id), `eternal-torch 技能重复: ${id}`);
	for (const id of Object.keys(daybreakSkills)) assert(!sharedIds.has(id), `daybreak 技能重复: ${id}`);
});

await check("红黑基座：红牌只额外结算一次，黑牌全体不可响应", async () => {
	const use = skills.aohonghei.subSkill.use;
	game.players = [makePlayer({ name: "甲" }), makePlayer({ name: "乙" })];
	const directHit = Object.assign([], {
		addArray(cards) {
			this.push(...cards);
		},
	});
	const redSha = makeCard("sha", "heart", 5);
	const redTrigger = { card: redSha, effectCount: 1, directHit };
	assert(use.filter(redTrigger), "红牌 filter");
	await use.content({}, redTrigger, game.players[0]);
	equal(redTrigger.effectCount, 2, "红牌额外结算次数");
	equal(redTrigger.directHit.length, 0, "红牌不应加 directHit");
	const blackSha = makeCard("sha", "spade", 5);
	const blackDirectHit = Object.assign([], {
		addArray(cards) {
			this.push(...cards);
		},
	});
	const blackTrigger = { card: blackSha, effectCount: 1, directHit: blackDirectHit };
	await use.content({}, blackTrigger, game.players[0]);
	equal(blackTrigger.effectCount, 1, "黑牌不应额外结算");
	equal(blackTrigger.directHit.length, game.players.length, "黑牌 directHit 覆盖全体玩家");
	const noneCard = makeCard("tao", "heart", 3);
	const noneTrigger = { card: noneCard, effectCount: 1, directHit: Object.assign([], { addArray() {} }) };
	await use.content({}, noneTrigger, game.players[0]);
	equal(noneTrigger.effectCount, 2, "红桃仍走红牌分支");
});

await check("getNewDiscardCards：loseAsync 包装去重与位置过滤", () => {
	const inDiscard = makeCard("sha", "spade", 7);
	inDiscard.pos = "d";
	const taken = makeCard("shan", "heart", 7);
	taken.pos = "h";
	const wrapped = {
		name: "lose",
		getd: () => [inDiscard, taken],
		getParent: () => ({ name: "loseAsync" }),
	};
	equal(shared.getNewDiscardCards(wrapped).length, 0, "loseAsync 直属子 lose 事件应跳过");
	const standalone = {
		name: "lose",
		getd: () => [inDiscard, taken],
		getParent: () => ({ name: "discard" }),
	};
	const result = shared.getNewDiscardCards(standalone);
	equal(result.length, 1, "独立 lose 只保留仍在弃牌堆的牌");
	equal(result[0], inDiscard, "独立 lose 保留的牌");
	const cardsDiscardEvent = {
		name: "cardsDiscard",
		getd: () => [inDiscard],
	};
	equal(shared.getNewDiscardCards(cardsDiscardEvent)[0], inDiscard, "cardsDiscard 事件返回其牌");
	const noGetd = { name: "phaseBegin" };
	equal(shared.getNewDiscardCards(noGetd).length, 0, "无 getd 的事件安全返回空");
});

await check("宇宙：任意角色回合开始放置“宇”，已有“宇”不再放置", async () => {
	resetBoard();
	const place = skills.yzrmgsyuzhou.subSkill.place;
	const player = makePlayer();
	game.players = [player];
	assert(place.filter({ player: makePlayer({ name: "别人" }) }, player), "他人回合也应触发");
	const topCard = pileCard("sha", "spade", 9);
	await place.content({}, { player: game.players[0] }, player);
	equal(player.expansions.length, 1, "宇置于武将牌上");
	equal(player.expansions[0], topCard, "宇来自牌堆顶");
	assert(player.expansions[0].hasGaintag("yzrmgsyuzhou_yu"), "宇带扩展区标记");
	assert(player.markCalls.some(call => call[0] === "mark" && call[1] === "yzrmgsyuzhou_yu"), "宇标记显示");
	assert(!place.filter({}, player), "已有宇时不再放置");
	const yuMark = skills.yzrmgsyuzhou.subSkill.yu;
	equal(yuMark.marktext, "宇", "宇标记文本");
	equal(yuMark.intro.content, "expansion", "宇展示扩展区牌面");
	// 主技能 onremove 清理扩展区
	const other = pileCard("shan", "heart", 3);
	player.expansions.push(other);
	other.addGaintag("yzrmgsyuzhou_yu");
	other.pos = "x";
	skills.yzrmgsyuzhou.onremove(player);
	equal(player.expansions.length, 0, "技能移除时宇被弃置");
	equal(ui.discardPile.childNodes.includes(other), true, "宇进入弃牌堆");
});

await check("宇宙：相同点数入弃牌堆触发，点数不同不触发", async () => {
	resetBoard();
	const gain = skills.yzrmgsyuzhou.subSkill.gain;
	const player = makePlayer();
	game.players = [player];
	const yu = makeCard("sha", "club", 6);
	yu.addGaintag("yzrmgsyuzhou_yu");
	yu.pos = "x";
	player.expansions.push(yu);
	const batch = [pileCard("shan", "heart", 6, "d"), pileCard("tao", "diamond", 6, "d"), pileCard("sha", "spade", 8, "d")];
	const event = { name: "cardsDiscard", getd: () => batch, cards: batch };
	assert(gain.filter(event, player), "存在同点数牌应触发");
	const different = [pileCard("shan", "heart", 5, "d")];
	assert(!gain.filter({ name: "cardsDiscard", getd: () => different, cards: different }, player), "点数不同不应触发");
});

await check("宇宙：触发后弃置宇、获得牌堆与弃牌堆全部同点数牌并获得额外回合", async () => {
	resetBoard();
	const gain = skills.yzrmgsyuzhou.subSkill.gain;
	const player = makePlayer();
	game.players = [player];
	const yu = makeCard("sha", "club", 6);
	yu.addGaintag("yzrmgsyuzhou_yu");
	yu.pos = "x";
	player.expansions.push(yu);
	const discardMatch1 = pileCard("shan", "heart", 6, "d");
	const discardMatch2 = pileCard("tao", "diamond", 6, "d");
	pileCard("sha", "spade", 8, "d");
	const pileMatch1 = pileCard("wugu", "club", 6);
	const pileMatch2 = pileCard("juedou", "spade", 6);
	pileCard("shan", "diamond", 7);
	const batch = [discardMatch1, discardMatch2];
	await gain.content({}, { name: "cardsDiscard", getd: () => batch }, player);
	equal(player.loseCalls.length, 1, "宇被弃置一次");
	equal(player.expansions.length, 0, "扩展区清空");
	assert(player.markCalls.some(call => call[0] === "unmark" && call[1] === "yzrmgsyuzhou_yu"), "宇标记移除");
	const gained = player.gainCalls[0] ?? [];
	for (const card of [yu, discardMatch1, discardMatch2, pileMatch1, pileMatch2]) {
		assert(gained.includes(card), `应获得同点数牌: ${card.name}`);
	}
	assert(!gained.some(card => card.number === 7 || card.number === 8), "不同点数牌不应获得");
	equal(player.insertCalls.join(","), "yzrmgsyuzhou", "本回合结束后额外回合");
	// 弃置宇产生的 loseAfter 不会再触发：扩展区已空
	assert(!gain.filter({ name: "lose", getd: () => [yu] }, player), "移除宇自身不重复触发");
});

await check("宇宙：一次多张同点数牌只触发一次，不重复插入回合", async () => {
	resetBoard();
	const gain = skills.yzrmgsyuzhou.subSkill.gain;
	const player = makePlayer();
	game.players = [player];
	const yu = makeCard("sha", "club", 6);
	yu.addGaintag("yzrmgsyuzhou_yu");
	yu.pos = "x";
	player.expansions.push(yu);
	const batch = [pileCard("shan", "heart", 6, "d"), pileCard("tao", "diamond", 6, "d"), pileCard("sha", "spade", 6, "d")];
	// 触发器对同一事件只结算一次（引擎保证），内容只执行一轮
	assert(gain.filter({ name: "cardsDiscard", getd: () => batch }, player), "存在同点数即触发");
	await gain.content({}, { name: "cardsDiscard", getd: () => batch }, player);
	equal(player.insertCalls.length, 1, "单次触发只插入一个额外回合");
});

await check("日蚀：对其他角色使用牌后触发，目标过滤正确", () => {
	const pindian = skills.rsgsrishi.subSkill.pindian;
	const player = makePlayer({ name: "日蚀高斯" });
	const enemy = makePlayer({ name: "敌人" });
	game.players = [player, enemy];
	assert(
		pindian.filter({ card: makeCard("sha", "spade", 7), targets: [enemy] }, player),
		"对其他角色使用牌应触发",
	);
	assert(
		!pindian.filter({ card: makeCard("tao", "heart", 3), targets: [player] }, player),
		"只对自己使用不触发",
	);
	assert(!pindian.filter({ card: makeCard("tao", "heart", 3), targets: [] }, player), "无目标不触发");
	const deadEnemy = makePlayer({ name: "死者", dead: true });
	assert(!pindian.filter({ card: makeCard("sha", "spade", 7), targets: [deadEnemy] }, player), "死亡目标不触发");
});

await check("日蚀：摸牌后拼点，胜者按选择回复或摸牌", async () => {
	const pindian = skills.rsgsrishi.subSkill.pindian;
	// 日蚀胜：胜者是日蚀自己，选摸两张牌
	const player = makePlayer({ name: "日蚀高斯", controlQueue: ["摸两张牌"] });
	const enemy = makePlayer({ name: "敌人", hp: 4, hand: [makeCard("shan", "heart", 3)] });
	game.players = [player, enemy];
	player.compareQueue.push({ bool: true, winner: player });
	await pindian.content({}, { targets: [enemy] }, player);
	equal(player.drawCalls.join(","), "1,2", "先摸一张牌拼点，自己胜时再摸两张");
	equal(player.compareCalls.length, 1, "与目标拼点一次");
	equal(enemy.drawCalls.length, 0, "败方无奖励");
	equal(enemy.recoverCalls.length, 0, "败方无奖励");
	// 目标胜：选回复一点体力
	const player2 = makePlayer({ name: "日蚀高斯", controlQueue: ["回复一点体力"] });
	const enemy2 = makePlayer({ name: "敌人", hp: 2, maxHp: 4, hand: [makeCard("shan", "diamond", 4)] });
	game.players = [player2, enemy2];
	player2.compareQueue.push({ bool: false, winner: enemy2 });
	await pindian.content({}, { targets: [enemy2] }, player2);
	equal(enemy2.recoverCalls.join(","), "1", "目标胜时按选择回复一点体力");
	equal(enemy2.hp, 3, "回复生效");
	// 目标胜：选摸两张牌
	const player3 = makePlayer({ name: "日蚀高斯", controlQueue: ["摸两张牌"] });
	const enemy3 = makePlayer({ name: "敌人", hp: 4, hand: [makeCard("shan", "club", 5)] });
	game.players = [player3, enemy3];
	player3.compareQueue.push({ bool: false, winner: enemy3 });
	await pindian.content({}, { targets: [enemy3] }, player3);
	equal(enemy3.drawCalls.join(","), "2", "目标胜时按选择摸两张牌");
});

await check("日蚀：拼点平局无奖励，不可拼点与死亡目标跳过", async () => {
	const pindian = skills.rsgsrishi.subSkill.pindian;
	// 平局
	const player = makePlayer({ name: "日蚀高斯" });
	const enemy = makePlayer({ name: "敌人", hp: 4, hand: [makeCard("shan", "heart", 3)] });
	game.players = [player, enemy];
	player.compareQueue.push({ bool: false, tie: true });
	await pindian.content({}, { targets: [enemy] }, player);
	equal(player.drawCalls.length, 1, "平局仍完成摸牌与拼点");
	equal(enemy.drawCalls.length, 0, "平局无奖励");
	equal(enemy.recoverCalls.length, 0, "平局无奖励");
	// 目标无手牌：整体跳过（不摸牌不拼点）
	const player3 = makePlayer({ name: "日蚀高斯" });
	const emptyEnemy = makePlayer({ name: "空手敌人", hand: [], hp: 4 });
	game.players = [player3, emptyEnemy];
	await pindian.content({}, { targets: [emptyEnemy] }, player3);
	equal(player3.drawCalls.length, 0, "无法拼点时不摸牌");
	equal(player3.compareCalls.length, 0, "无法拼点时不拼点");
	// noCompareSource 视为不可拼点
	const player4 = makePlayer({ name: "日蚀高斯", canCompareResults: [false] });
	const enemy4 = makePlayer({ name: "敌人", hp: 4, hand: [makeCard("shan", "heart", 3)] });
	game.players = [player4, enemy4];
	await pindian.content({}, { targets: [enemy4] }, player4);
	equal(player4.drawCalls.length, 0, "noCompare 标签时不摸牌");
});

await check("日蚀：多目标逐一处理，红牌额外结算不重复拼点", async () => {
	const pindian = skills.rsgsrishi.subSkill.pindian;
	const player = makePlayer({ name: "日蚀高斯", controlQueue: ["摸两张牌", "摸两张牌"] });
	const enemy1 = makePlayer({ name: "敌人一", hp: 4, hand: [makeCard("shan", "heart", 3)] });
	const enemy2 = makePlayer({ name: "敌人二", hp: 4, hand: [makeCard("shan", "diamond", 4)] });
	game.players = [player, enemy1, enemy2];
	player.compareQueue.push({ bool: true, winner: player }, { bool: true, winner: player });
	// 模拟南蛮入侵多目标：useCardAfter 每次使用只触发一次，内容由引擎单次执行处理全部目标
	assert(pindian.filter({ card: makeCard("nanman", "spade", 7), targets: [enemy1, enemy2] }, player), "多目标应触发");
	await pindian.content({}, { targets: [enemy1, enemy2] }, player);
	equal(player.compareCalls.length, 2, "两个目标各拼点一次");
	equal(player.compareCalls[0], enemy1, "第一个目标");
	equal(player.compareCalls[1], enemy2, "第二个目标");
	// 拼点各先摸一张，两轮奖励都归自己 → 1(拼点)+2(奖励)+1(拼点)+2(奖励)
	equal(player.drawCalls.join(","), "1,2,1,2", "拼点摸牌与奖励按序执行");
	equal(enemy1.drawCalls.length, 0, "敌人一无奖励");
	equal(enemy2.drawCalls.length, 0, "敌人二无奖励");
});

await check("日蚀 AI：友方残血回复、友方满血摸牌、敌方固定回复", async () => {
	const pindian = skills.rsgsrishi.subSkill.pindian;
	// controlQueue 为空时走真实技能内注册的 ai 闭包
	const runScenario = async winnerSpec => {
		const player = makePlayer({ name: "日蚀高斯", side: true });
		const winner = makePlayer(winnerSpec);
		game.players = [player, winner];
		player.compareQueue.push({ bool: winner !== player, winner });
		await pindian.content({}, { targets: [winner] }, player);
		return { player, winner };
	};
	const wounded = await runScenario({ name: "残血友方", side: true, hp: 1, maxHp: 4, hand: [makeCard("shan", "heart", 3)] });
	equal(wounded.winner.recoverCalls.join(","), "1", "残血友方回复");
	const healthy = await runScenario({ name: "满血友方", side: true, hp: 4, maxHp: 4, hand: [makeCard("shan", "heart", 3)] });
	equal(healthy.winner.drawCalls.join(","), "2", "满血友方摸牌");
	// 自己胜：胜者就是日蚀高斯本人（拼点目标另有人）
	const selfPlayer = makePlayer({ name: "日蚀高斯", side: true, hp: 4, maxHp: 4 });
	const selfTarget = makePlayer({ name: "对手", side: true, hp: 4, maxHp: 4, hand: [makeCard("shan", "heart", 3)] });
	game.players = [selfPlayer, selfTarget];
	selfPlayer.compareQueue.push({ bool: true, winner: selfPlayer });
	await pindian.content({}, { targets: [selfTarget] }, selfPlayer);
	equal(selfPlayer.drawCalls[selfPlayer.drawCalls.length - 1], 2, "自己胜时选择摸两张牌");
	const enemyCase = await runScenario({ name: "敌人", side: false, hp: 1, maxHp: 4, hand: [makeCard("shan", "heart", 3)] });
	equal(enemyCase.winner.recoverCalls.join(","), "1", "敌方胜时选收益较小的回复");
});

await check("未来：实体牌伤害标记覆盖载体牌，未造成伤害不标记", () => {
	const markDamage = skills.wlgswl.subSkill.markDamage;
	const entitySha = makeCard("sha", "spade", 7);
	const vcard = makeVCard("huogong", [entitySha]);
	assert(markDamage.filter({ num: 1, card: vcard }), "实际伤害应标记");
	markDamage.content({}, { num: 1, card: vcard });
	equal(entitySha.wlgswl_damaged, true, "虚拟牌载体牌被标记");
	const directCard = makeCard("sha", "club", 9);
	markDamage.content({}, { num: 1, card: directCard });
	equal(directCard.wlgswl_damaged, true, "直接使用实体牌被标记");
	const withCards = makeCard("sha", "spade", 7);
	withCards.cards = [entitySha];
	markDamage.content({}, { num: 1, card: withCards });
	equal(entitySha.wlgswl_damaged, true, "复合牌载体被标记");
	assert(!markDamage.filter({ num: 0, card: directCard }), "零伤害不标记");
	assert(!markDamage.filter({ num: 1, unreal: true, card: directCard }), "视为伤害不标记");
	assert(!markDamage.filter({ num: 1 }), "无牌不标记");
});

await check("未来：未造成伤害的牌可获得，造成过伤害的牌不可获得", async () => {
	const gain = skills.wlgswl.subSkill.gain;
	const player = makePlayer({ name: "未来高斯" });
	game.players = [player];
	const cleanSha = makeCard("sha", "spade", 7);
	cleanSha.pos = "d";
	const dirtySha = makeCard("sha", "club", 8);
	dirtySha.wlgswl_damaged = true;
	dirtySha.pos = "d";
	const event = { name: "cardsDiscard", getd: () => [cleanSha, dirtySha] };
	assert(gain.filter(event, player), "存在可获得的牌应触发");
	// content：只获得未造成伤害的牌
	await gain.content({}, event, player);
	assert(player.hand.includes(cleanSha), "未造成伤害的杀已获得");
	assert(!player.hand.includes(dirtySha), "造成过伤害的牌不获得");
	equal(player.getStorage("wlgswl_used").join(","), "sha", "牌名记录");
});

await check("未来：同名手牌阻止获得，非伤害牌进入弃牌堆可正常获得", async () => {
	const gain = skills.wlgswl.subSkill.gain;
	const taoInHand = makeCard("tao", "heart", 3);
	const player = makePlayer({ name: "未来高斯", hand: [taoInHand] });
	game.players = [player];
	const taoDiscard = makeCard("tao", "diamond", 9);
	taoDiscard.pos = "d";
	const wugu = makeCard("wugu", "heart", 1);
	wugu.pos = "d";
	const event = { name: "lose", getd: () => [taoDiscard, wugu], getParent: () => ({ name: "discard" }) };
	await gain.content({}, event, player);
	assert(!player.hand.includes(taoDiscard), "手牌已有同名牌不获得");
	assert(player.hand.includes(wugu), "非伤害牌正常获得");
});

await check("未来：同回合每种牌名只获得一次，换回合后重置", async () => {
	const gain = skills.wlgswl.subSkill.gain;
	const reset = skills.wlgswl.subSkill.reset;
	const player = makePlayer({ name: "未来高斯" });
	game.players = [player];
	const sha1 = makeCard("sha", "spade", 7);
	sha1.pos = "d";
	const event1 = { name: "cardsDiscard", getd: () => [sha1] };
	await gain.content({}, event1, player);
	equal(player.hand.length, 1, "第一张获得");
	const sha2 = makeCard("sha", "club", 8);
	sha2.pos = "d";
	const event2 = { name: "cardsDiscard", getd: () => [sha2] };
	assert(!gain.filter(event2, player), "同回合同名不触发");
	await gain.content({}, event2, player);
	equal(player.hand.length, 1, "同回合同名不重复获得");
	const juedou = makeCard("juedou", "spade", 9);
	juedou.pos = "d";
	assert(gain.filter({ name: "cardsDiscard", getd: () => [juedou] }, player), "不同牌名分别计数");
	// 全场回合开始重置
	assert(reset.filter({ player: makePlayer({ name: "别人" }) }, player), "任意角色回合开始都重置");
	await reset.content({}, {}, player);
	equal(player.getStorage("wlgswl_used").length, 0, "重置后牌名记录清空");
	// 已获得的名牌仍在手牌时依旧受限；移出后新回合可重新获得
	assert(!gain.filter(event2, player), "手牌仍有同名牌时不获得");
	player.hand.length = 0;
	assert(gain.filter(event2, player), "换回合后同名可再次获得");
	await gain.content({}, event2, player);
	equal(player.hand.length, 1, "新回合重新获得");
});

await check("未来：一次事件多张同名牌只获得其中一张", async () => {
	const gain = skills.wlgswl.subSkill.gain;
	const player = makePlayer({ name: "未来高斯" });
	game.players = [player];
	const shan1 = makeCard("shan", "heart", 3);
	const shan2 = makeCard("shan", "diamond", 4);
	shan1.pos = "d";
	shan2.pos = "d";
	const event = { name: "lose", getd: () => [shan1, shan2], getParent: () => ({ name: "discard" }) };
	await gain.content({}, event, player);
	assert(player.hand.includes(shan1) !== player.hand.includes(shan2), "两张同名牌只获得一张");
	equal(player.getStorage("wlgswl_used").join(","), "shan", "牌名只记录一次");
});

await check("未来：被其他效果先拿走的牌不会重复获得", async () => {
	const gain = skills.wlgswl.subSkill.gain;
	const player = makePlayer({ name: "未来高斯" });
	const other = makePlayer({ name: "抢牌者" });
	game.players = [player, other];
	const card = makeCard("shan", "heart", 3);
	card.pos = "d";
	const event = { name: "cardsDiscard", getd: () => [card] };
	assert(gain.filter(event, player), "过滤时牌仍在弃牌堆");
	// 模拟另一角色在两次触发之间把牌拿走
	other.hand.push(card);
	card.pos = "h";
	assert(!gain.filter(event, player), "牌已离开弃牌堆不再触发");
	await gain.content({}, event, player);
	equal(player.hand.length, 0, "不会获得他人已拿走的牌");
});

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
	process.exitCode = 1;
	for (const failure of failures) {
		console.error(`FAIL: ${failure.name}`);
		console.error(failure.error.stack ?? failure.error.message);
	}
}
