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

function loadExports(file, names) {
	const source = fs
		.readFileSync(file, "utf8")
		.replace(/^import[^\n]*;/gm, "")
		.replace(/^export\s+(const|let|var|async function|function)\s+/gm, "$1 ");
	const argNames = ["lib", "game", "ui", "get", "ai", "_status"];
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
		removeGaintag(tag) {
			this.gaintag = this.gaintag.filter(value => value !== tag);
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
	dead: [],
	additionaldead: [],
	events: [],
	createEvent(name) {
		const event = { name, setContent(content) { this.content = content; return this; } };
		this.events.push(event);
		return event;
	},
	phaseNumber: 0,
	history: [],
	getAllGlobalHistory(key, filter = () => true) {
		return this.history.filter(filter);
	},
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
	owner(card) {
		return game.players.find(player => player.hand.includes(card));
	},
	suit(card) {
		return card.suit;
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
const shared = loadExports(sharedFile, ["skills"])(libTable, game, ui, get, ai, _status);

const eternalSkills = loadExports(eternalSkillsFile, ["skills"])(
	libTable,
	game,
	ui,
	get,
	ai,
	_status,
).skills;
const daybreakSkills = loadExports(daybreakSkillsFile, ["skills"])(
	libTable,
	game,
	ui,
	get,
	ai,
	_status,
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
Object.assign(libTable.skill, skills);
for (const [id, info] of Object.entries(skills)) {
	for (const [name, sub] of Object.entries(info.subSkill ?? {})) libTable.skill[`${id}_${name}`] = sub;
}

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
	game.history.length = 0;
	game.events.length = 0;
	game.players.length = 0;
	game.dead.length = 0;
	game.additionaldead.length = 0;
}

function makePlayer(options = {}) {
	const name = options.name ?? "宇宙日冕高斯";
	const player = {
		name,
		hp: options.hp ?? 4,
		maxHp: options.maxHp ?? 4,
		side: options.side,
		storage: options.storage ?? {},
		skills: options.skills ?? [{ 宇宙日冕高斯: "yzrmgsyuzhou", 日蚀高斯: "rsgsrishi", 未来高斯: "wlgswl" }[name]].filter(Boolean),
		damageHistory: [],
		gainHistory: [],
		gaintagCalls: [],
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
		hasSkill(id) {
			return this.skills.some(skill => skill === id || skills[skill]?.group?.includes(id));
		},
		getAllHistory(key, filter) {
			const list = key === "damage" ? this.damageHistory : [];
			this.historyQueries = (this.historyQueries ?? 0) + 1;
			this.historyVisits = (this.historyVisits ?? 0) + list.length;
			return filter ? list.filter(filter) : list;
		},
		getHistory(key, filter = () => true) {
			return (key === "gain" ? this.gainHistory : []).filter(filter);
		},
		addGaintag(cards, tag) {
			for (const card of Array.isArray(cards) ? cards : [cards]) card.addGaintag(tag);
			this.gaintagCalls.push(["add", tag]);
		},
		removeGaintag(tag, cards) {
			for (const card of cards) card.removeGaintag(tag);
			this.gaintagCalls.push(["remove", tag]);
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
			const next = { player: this, name: "phase", next: [], setContent(content) { this.content = content; return this; } };
			this.insertEvents ??= [];
			this.insertEvents.push(next);
			return next;
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
					return { control: typeof decision === "number" ? choices[decision] : decision };
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
	assert(skills.aohonghei, "基座技能缺失");
	assert(JSON.stringify(skills.aohonghei.group) === JSON.stringify(["aohonghei_use", "aohonghei_mark"]), "基座 group");
	assert(skills.aohonghei.subSkill.use.trigger.player === "useCard1", "基座触发时机");
	const expectedGroups = {
		yzrmgsyuzhou: ["aohonghei_use", "aohonghei_mark", "yzrmgsyuzhou_place", "yzrmgsyuzhou_gain"],
		rsgsrishi: ["aohonghei_use", "aohonghei_mark", "rsgsrishi_pindian"],
		wlgswl: ["aohonghei_use", "aohonghei_mark", "wlgswl_gain", "wlgswl_reset"],
	};
	for (const id of ["yzrmgsyuzhou", "rsgsrishi", "wlgswl"]) {
		equal(skills[id].inherit, "aohonghei", `${id} inherit 指向`);
		// group 必须显式列出基座 use 与全部自身子技能（引擎 expandSkills 只展开 group 引用）
		assert(JSON.stringify(skills[id].group) === JSON.stringify(expectedGroups[id]), `${id} group`);
		for (const entry of expectedGroups[id].filter(entry => !entry.startsWith("aohonghei_"))) {
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
	equal(shared.skills.aohonghei.shared.getNewDiscardCards(wrapped).length, 0, "loseAsync 直属子 lose 事件应跳过");
	const standalone = {
		name: "lose",
		getd: () => [inDiscard, taken],
		getParent: () => ({ name: "discard" }),
	};
	const result = shared.skills.aohonghei.shared.getNewDiscardCards(standalone);
	equal(result.length, 1, "独立 lose 只保留仍在弃牌堆的牌");
	equal(result[0], inDiscard, "独立 lose 保留的牌");
	const cardsDiscardEvent = {
		name: "cardsDiscard",
		getd: () => [inDiscard],
	};
	equal(shared.skills.aohonghei.shared.getNewDiscardCards(cardsDiscardEvent)[0], inDiscard, "cardsDiscard 事件返回其牌");
	const noGetd = { name: "phaseBegin" };
	equal(shared.skills.aohonghei.shared.getNewDiscardCards(noGetd).length, 0, "无 getd 的事件安全返回空");
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
	const player3 = makePlayer({ name: "日蚀高斯" });
	const emptyEnemy = makePlayer({ name: "空手敌人", hand: [], hp: 4 });
	game.players = [player3, emptyEnemy];
	await pindian.content({}, { targets: [emptyEnemy] }, player3);
	equal(player3.drawCalls.join(","), "1", "无法拼点仍摸一张牌");
	equal(player3.compareCalls.length, 0, "无法拼点时不拼点");
	// noCompareSource 视为不可拼点
	const player4 = makePlayer({ name: "日蚀高斯", canCompareResults: [false] });
	const enemy4 = makePlayer({ name: "敌人", hp: 4, hand: [makeCard("shan", "heart", 3)] });
	game.players = [player4, enemy4];
	await pindian.content({}, { targets: [enemy4] }, player4);
	equal(player4.drawCalls.join(","), "1", "noCompare 标签只阻止拼点");
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

await check("日蚀 AI：友方残血回复、友方满血摸牌、敌方按伤势减少收益", async () => {
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
	equal(enemyCase.winner.drawCalls.join(","), "2", "敌方受伤时避免替其回复体力");
	const fullEnemy = await runScenario({ name: "满血敌人", side: false, hp: 4, maxHp: 4, hand: [makeCard("shan", "heart", 3)] });
	equal(fullEnemy.winner.drawCalls.length, 0, "满血敌方选择无收益的回复");
});

function recordDamage(card, cards, extra = {}) {
 const victim = makePlayer({ name: "伤害承受者" });
 if (!game.players.includes(victim)) game.players.push(victim);
 const damage = { name: "damage", num: 1, card, cards, player: victim, ...extra };
 victim.damageHistory.push(damage);
 game.history.push(damage);
 return damage;
}
await check("未来：技能获得前的实体、转化与复合牌历史伤害持续生效", () => {
 resetBoard();
 const gain = skills.wlgswl.subSkill.gain;
 const player = makePlayer({ name: "未来高斯" });
 const cards = [makeCard("sha", "spade", 7), makeCard("shan", "heart", 3), makeCard("tao", "diamond", 9)];
 cards.forEach(card => card.pos = "d");
 recordDamage(cards[0]);
 recordDamage(makeVCard("huogong", [cards[1], cards[2]]), [cards[1], cards[2]]);
 for (const card of cards) assert(!gain.filter({ name: "cardsDiscard", getd: () => [card] }, player), "历史伤害载体不可获得");
 const clean = makeCard("sha", "spade", 7);
 clean.pos = "d";
 assert(gain.filter({ name: "cardsDiscard", getd: () => [clean] }, player), "同名同点数的不同实体不能共享记录");
 cards[0].pos = "h";
 cards[0].pos = "d";
 assert(!gain.filter({ name: "cardsDiscard", getd: () => [cards[0]] }, player), "移动或重新使用不清空历史");
});
await check("未来：取消、零点、视为伤害及无实体虚拟牌不污染实体", () => {
 resetBoard();
 const gain = skills.wlgswl.subSkill.gain;
 const player = makePlayer({ name: "未来高斯" });
 for (const extra of [{ num: 0 }, { unreal: true }, { cancelled: true }]) {
  const card = makeCard("sha", "spade", 7);
  card.pos = "d";
  const damage = recordDamage(card, undefined, extra);
  if (extra.cancelled) damage.player.damageHistory.length = 0;
  assert(gain.filter({ name: "cardsDiscard", getd: () => [card] }, player), "未实际造成伤害仍可获得");
 }
 recordDamage(makeVCard("sha", []));
 const card = makeCard("sha", "club", 8);
 card.pos = "d";
 assert(gain.filter({ name: "cardsDiscard", getd: () => [card] }, player), "纯虚拟伤害不影响同名实体");
});
await check("未来：未造成伤害的牌可获得，造成过伤害的牌不可获得", async () => {
	const gain = skills.wlgswl.subSkill.gain;
	const player = makePlayer({ name: "未来高斯" });
	game.players = [player];
	const cleanSha = makeCard("sha", "spade", 7);
	cleanSha.pos = "d";
	const dirtySha = makeCard("sha", "club", 8);
	recordDamage(dirtySha);
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
	game.phaseNumber++;
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

await check("公共手牌标记：三形态开局、变色、转移、获得及移除技能", async () => {
	for (const id of ["yzrmgsyuzhou", "rsgsrishi", "wlgswl"]) {
		const red = makeCard("shan", "heart", 3), black = makeCard("sha", "spade", 7);
		red.addGaintag("other_skill");
		const player = makePlayer({ skills: [id], hand: [red, black] });
		game.players = [player];
		skills[id].init(player);
		equal(red.hasGaintag("aohonghei_mark_red"), true, "初始红色标记");
		equal(black.hasGaintag("aohonghei_mark_black"), true, "初始黑色标记");
		const mark = skills.aohonghei.subSkill.mark;
		assert(mark.trigger.global.includes("gameDrawEnd"), "初始发牌后必须刷新");
		const calls = player.gaintagCalls.length;
		skills[id].init2(player);
		await mark.content({}, {}, player);
		equal(player.gaintagCalls.length, calls, "重复初始化或刷新不重复添加");
		black.color = "red";
		await mark.content({}, {}, player);
		assert(black.hasGaintag("aohonghei_mark_red") && !black.hasGaintag("aohonghei_mark_black"), "变色替换标记");
		const other = makePlayer({ name: "普通角色", hand: [black] });
		player.hand = [red];
		game.players.push(other);
		await mark.content({}, {}, player);
		assert(!black.hasGaintag("aohonghei_mark_red"), "离手后清理");
		player.skills = [];
		skills[id].onremove(player);
		assert(!red.hasGaintag("aohonghei_mark_red") && red.hasGaintag("other_skill"), "技能移除只清理自有标记");
		player.skills = [id];
		skills[id].init2(player);
		assert(red.hasGaintag("aohonghei_mark_red"), "中途获得技能立即标记");
	}
});
await check("公共手牌标记：多个继承技能共存、持有者之间交换及原日冕隔离", () => {
	const card = makeCard("sha", "heart", 9);
	const first = makePlayer({ skills: ["wlgswl", "rsgsrishi"], hand: [card] });
	const second = makePlayer({ skills: ["yzrmgsyuzhou"] });
	game.players = [first, second];
	skills.wlgswl.init(first);
	first.skills = ["rsgsrishi"];
	skills.wlgswl.onremove(first);
	assert(card.hasGaintag("aohonghei_mark_red"), "移除其中一个基座技能继续保留标记");
	first.hand = [];
	second.hand = [card];
	skills.yzrmgsyuzhou.init(second);
	skills.aohonghei.shared.refreshMarks(first);
	assert(card.hasGaintag("aohonghei_mark_red"), "旧持有者不误清新持有者标记");
	second.skills = ["rmgsrimian"];
	skills.rmgsrimian.init(second);
	skills.yzrmgsyuzhou.onremove(second);
	assert(card.hasGaintag("rmgsrimian_mark_red") && card.hasGaintag("rmgsrimian_mark_heart"), "日冕红黑与花色标记保留");
	assert(!card.hasGaintag("aohonghei_mark_red"), "日冕不获得公共基座标记");
});
await check("公共手牌标记：无关角色得失牌不触发，手牌变动与技能变化照常刷新", () => {
	const player = makePlayer({ skills: ["wlgswl"], hand: [makeCard("shan", "heart", 3)] });
	const other = makePlayer({ name: "别人", hand: [makeCard("sha", "spade", 7)] });
	game.players = [player, other];
	const mark = skills.aohonghei.subSkill.mark;
	assert(!mark.trigger.global.includes("equipAfter"), "装备事件不再全量刷新");
	assert(!mark.trigger.global.includes("addJudgeAfter"), "判定区事件不再全量刷新");
	assert(!mark.trigger.global.includes("addToExpansionAfter"), "扩展区事件不再全量刷新");
	assert(!mark.filter({ name: "gain", player: other, cards: [makeCard("tao", "heart", 1)] }, player), "他人获得牌不刷新");
	assert(mark.filter({ name: "gain", player, cards: [makeCard("tao", "heart", 1)] }, player), "自己获得手牌刷新");
	assert(!mark.filter({ name: "lose", player: other, hs: [makeCard("sha", "spade", 7)] }, player), "他人失去手牌不刷新");
	assert(mark.filter({ name: "lose", player, hs: [makeCard("shan", "heart", 3)] }, player), "自己失去手牌刷新");
	assert(mark.filter({ name: "lose", player, hs: [makeCard("shan", "heart", 3)] }, player), "装备或使用导致离手同样经过 lose.hs 刷新");
	assert(mark.filter({ name: "loseAsync", getl: target => (target === player ? { hs: [makeCard("shan", "heart", 3)] } : { hs: [] }) }, player), "loseAsync 涉及自己手牌刷新");
	assert(!mark.filter({ name: "loseAsync", getl: () => ({ hs: [] }) }, player), "loseAsync 未涉及自己不刷新");
	assert(mark.filter({ name: "changeSkills" }, player), "技能变化始终刷新");
	assert(mark.filter({ name: "die" }, player), "死亡始终清理");
	assert(mark.filter({ name: "phaseBegin" }, player), "回合开始保留兜底刷新");
});
await check("日蚀：重复目标只处理一次，摸牌期间死亡或离场停止拼点", async () => {
	const pindian = skills.rsgsrishi.subSkill.pindian;
	const target = makePlayer({ name: "目标", hand: [makeCard("shan", "heart", 2)] });
	const player = makePlayer({ name: "日蚀高斯", compareQueue: [{ tie: true }], controlQueue: [] });
	await pindian.content({}, { targets: [target, target, player] }, player);
	equal(player.drawCalls.join(","), "1", "重复目标不重复摸牌");
	equal(player.compareCalls.length, 1, "重复目标不重复拼点");
	const dying = makePlayer({ name: "日蚀高斯" });
	dying.draw = async () => { dying.dead = true; };
	await pindian.content({}, { targets: [target] }, dying);
	equal(dying.compareCalls.length, 0, "摸牌时死亡不再拼点");
	const leaving = makePlayer({ name: "日蚀高斯" });
	leaving.draw = async () => { target.dead = true; };
	await pindian.content({}, { targets: [target] }, leaving);
	equal(leaving.compareCalls.length, 0, "摸牌时目标离场不再拼点");
});
await check("未来：移除重获不绕过每回合同名限次，缺席回合重置不滞留", async () => {
	resetBoard();
	const player = makePlayer({ name: "未来高斯" });
	const gain = skills.wlgswl.subSkill.gain;
	const first = pileCard("sha", "spade", 3, "d");
	await gain.content({}, { name: "cardsDiscard", getd: () => [first] }, player);
	player.hand = [];
	player.skills = [];
	skills.wlgswl.onremove(player);
	player.skills = ["wlgswl"];
	skills.wlgswl.init2(player);
	const next = pileCard("sha", "club", 4, "d");
	const event = { name: "cardsDiscard", getd: () => [next] };
	assert(!gain.filter(event, player), "同一回合重获仍限制同名");
	game.phaseNumber++;
	assert(gain.filter(event, player), "缺席回合开始也可重新获得");
});
await check("宇宙：弃宇过程中死亡不得获得牌或安排额外回合", async () => {
	resetBoard();
	const player = makePlayer();
	const yu = makeCard("sha", "club", 6);
	yu.addGaintag("yzrmgsyuzhou_yu");
	player.expansions = [yu];
	const lose = player.loseToDiscardpile;
	player.loseToDiscardpile = async cards => { await lose.call(player, cards); player.dead = true; };
	const match = pileCard("shan", "heart", 6, "d");
	await skills.yzrmgsyuzhou.subSkill.gain.content({}, { name: "cardsDiscard", getd: () => [match] }, player);
	equal(player.gainCalls.length, 0, "死亡后不获得");
	equal(player.insertCalls.length, 0, "死亡后不安排回合");
});
await check("未来：更换武将清空 storage 后仍保留当前回合获得历史", () => {
	resetBoard();
	const player = makePlayer({ name: "未来高斯" });
	player.gainHistory.push({ cards: [makeCard("sha", "spade", 3)], getParent: () => ({ name: "wlgswl_gain" }) });
	player.storage = {};
	const next = pileCard("sha", "club", 7, "d");
	assert(!skills.wlgswl.subSkill.gain.filter({ name: "cardsDiscard", getd: () => [next] }, player), "本体换将清空 storage 不得重置同回合次数");
});
await check("宇宙：两个持有者弃宇事件嵌套时各触发一次", async () => {
	resetBoard();
	const first = makePlayer(), second = makePlayer();
	game.players = [first, second];
	for (const player of game.players) {
		const yu = makeCard("sha", "club", 6);
		yu.addGaintag("yzrmgsyuzhou_yu");
		player.expansions = [yu];
	}
	const gain = skills.yzrmgsyuzhou.subSkill.gain;
	const lose = first.loseToDiscardpile;
	first.loseToDiscardpile = async cards => {
		await lose.call(first, cards);
		const nested = { name: "lose", getParent: () => ({ name: "loseToDiscardpile" }), getd: () => cards };
		if (gain.filter(nested, second)) await gain.content({}, nested, second);
	};
	const match = pileCard("shan", "heart", 6, "d");
	const event = { name: "cardsDiscard", getd: () => [match] };
	await gain.content({}, event, first);
	equal(first.loseCalls.length, 1, "第一名弃宇一次");
	equal(second.loseCalls.length, 1, "第二名弃宇一次");
	equal(first.insertCalls.length, 1, "第一名一个额外回合");
	equal(second.insertCalls.length, 1, "第二名一个额外回合");
	assert(!gain.filter(event, first) && !gain.filter(event, second), "原弃牌事件不再重复触发");
});
await check("宇宙：额外回合直接使用本体 insertPhase，不包装事件内容", async () => {
	resetBoard();
	const player = makePlayer();
	const yu = makeCard("sha", "club", 6);
	yu.addGaintag("yzrmgsyuzhou_yu");
	player.expansions = [yu];
	await skills.yzrmgsyuzhou.subSkill.gain.content({}, {}, player);
	equal(player.insertCalls.join(","), "yzrmgsyuzhou", "调用本体 insertPhase");
	const scheduled = player.insertEvents[0];
	assert(scheduled && scheduled.content === undefined, "不覆盖本体 phase 内容");
	assert(scheduled.forceDie === undefined && scheduled.includeOut === undefined, "不改写本体回合的死亡/离场参数");
	player.dead = true;
	player.skills = [];
	assert(scheduled.content === undefined && scheduled.forceDie === undefined, "已安排的额外回合不因死亡或失去技能被改写");
});
await check("宇宙：额外回合期间再次触发仍各安排一次", async () => {
	resetBoard();
	const player = makePlayer();
	game.players = [player];
	for (let round = 0; round < 2; round++) {
		const yu = makeCard("sha", "club", 6);
		yu.addGaintag("yzrmgsyuzhou_yu");
		player.expansions = [yu];
		const match = pileCard("shan", "heart", 6, "d");
		await skills.yzrmgsyuzhou.subSkill.gain.content({}, { name: "cardsDiscard", getd: () => [match] }, player);
	}
	equal(player.insertCalls.length, 2, "每次触发各插入一个额外回合");
});
await check("未来：loseAsync 子事件不先拿牌，汇总后按实体去重", async () => {
	resetBoard();
	const player = makePlayer({ name: "未来高斯" });
	const card = pileCard("shan", "heart", 3, "d");
	const gain = skills.wlgswl.subSkill.gain;
	const wrapper = { name: "loseAsync", getd: () => [card, card] };
	const child = { name: "lose", getParent: () => wrapper, getd: () => [card] };
	assert(!gain.filter(child, player), "子事件跳过");
	await gain.content({}, wrapper, player);
	equal(player.gainCalls.length, 1, "汇总只获得一次");
	assert(player.hand.includes(card), "实体牌已获得");
});
await check("未来：长对局历史仅查询伤害历史，已伤害实体命中缓存", () => {
	resetBoard();
	const victims = Array.from({ length: 5 }, (_, index) => makePlayer({ name: `承伤者${index}` }));
	game.players = victims;
	const damagedCards = [];
	const queriedDamaged = [];
	const cleanCards = [];
	for (let i = 0; i < 20000; i++) game.history.push({ name: i % 50 === 0 ? "useCard" : "gain", num: 0 });
	for (let i = 0; i < 300; i++) {
		const card = makeCard(i % 2 ? "sha" : "shan", i % 2 ? "spade" : "heart", (i % 13) + 1);
		card.pos = "d";
		const victim = victims[i % victims.length];
		const damage = { name: "damage", num: 1, card, player: victim };
		victim.damageHistory.push(damage);
		game.history.push(damage);
		damagedCards.push(card);
	}
	for (let i = 0; i < 100; i++) {
		const card = makeCard("tao", "diamond", (i % 13) + 1);
		card.pos = "d";
		cleanCards.push(card);
	}
	const queries = [...cleanCards, ...damagedCards.slice(0, 50), ...damagedCards.slice(0, 50)];
	const legacyHasDamaged = card => {
		let visited = 0;
		const hit = game.getAllGlobalHistory("everything", event => {
			visited++;
			return event.name === "damage" && event.num > 0 && !event.unreal && libTable.skill.wlgswl.shared.getDamageCards(event).includes(card) && event.player.getAllHistory("damage").includes(event);
		}).length > 0;
		legacyVisits += visited;
		return hit;
	};
	let legacyVisits = 0;
	const legacyStart = performance.now();
	const legacyResults = queries.map(legacyHasDamaged);
	const legacyCost = performance.now() - legacyStart;
	for (const victim of victims) {
		victim.historyQueries = 0;
		victim.historyVisits = 0;
	}
	const newStart = performance.now();
	const newResults = queries.map(card => libTable.skill.wlgswl.shared.hasDamaged(card));
	const newCost = performance.now() - newStart;
	const newVisits = victims.reduce((sum, victim) => sum + victim.historyVisits, 0);
	equal(JSON.stringify(newResults), JSON.stringify(legacyResults), "优化前后判定完全一致");
	equal(newResults.filter(Boolean).length, 100, "仅造成过伤害的实体不可获得");
	equal(legacyResults.filter(Boolean).length, 100, "旧实现同样识别 100 张伤害牌");
	assert(newVisits * 20 < legacyVisits, `伤害历史查询量应大幅下降: 旧=${legacyVisits} 新=${newVisits}`);
	const cachedQueries = victims.reduce((sum, victim) => sum + victim.historyQueries, 0);
	const cachedVisits = newVisits;
	libTable.skill.wlgswl.shared.hasDamaged(damagedCards[0]);
	equal(victims.reduce((sum, victim) => sum + victim.historyQueries, 0), cachedQueries, "已伤害实体命中缓存不再查询历史");
	equal(victims.reduce((sum, victim) => sum + victim.historyVisits, 0), cachedVisits, "缓存命中后扫描量为零");
	const late = cleanCards[0];
	assert(!libTable.skill.wlgswl.shared.hasDamaged(late), "未伤害实体首次判定为可获得");
	const lateDamage = { name: "damage", num: 1, card: late, player: victims[0] };
	victims[0].damageHistory.push(lateDamage);
	game.history.push(lateDamage);
	assert(libTable.skill.wlgswl.shared.hasDamaged(late), "之后造成伤害立即更新，不缓存未伤害结论");
	console.log(`  历史扫描: 旧=${legacyVisits} 新=${newVisits}（${(legacyVisits / newVisits).toFixed(1)}x）, 耗时 旧=${legacyCost.toFixed(2)}ms 新=${newCost.toFixed(2)}ms`);
});
await check("公共基座：三技能逐个移除时只为剩余继承技能恢复公共触发器", async () => {
	resetBoard();
	const player = makePlayer({ skills: ["yzrmgsyuzhou", "rsgsrishi", "wlgswl"] });
	const active = new Set();
	let addCalls = 0;
	player.addSkillTrigger = ids => {
		addCalls++;
		ids.forEach(id => active.add(id));
	};
	player.addSkillTrigger(["aohonghei_use", "aohonghei_mark"]);
	addCalls = 0;
	const drainRestores = async () => {
		const events = game.events.splice(0);
		for (const event of events) await event.content(event, undefined, event.player);
	};
	const verifyShared = async (label, expected) => {
		equal(active.has("aohonghei_use"), expected, `${label} use 触发器状态`);
		equal(active.has("aohonghei_mark"), expected, `${label} mark 触发器状态`);
		if (!expected) return;
		const card = makeCard("shan", "heart", 3);
		player.hand = [card];
		await skills.aohonghei.subSkill.mark.content({}, {}, player);
		assert(card.hasGaintag("aohonghei_mark_red"), `${label} 手牌标记正常`);
		const use = { card, effectCount: 1 };
		await skills.aohonghei.subSkill.use.content({}, use, player);
		equal(use.effectCount, 2, `${label} 红牌仍额外结算一次`);
	};
	const remove = async id => {
		player.skills = player.skills.filter(skill => skill !== id);
		skills[id].onremove(player);
		for (const sub of skills[id].group) active.delete(sub);
		await drainRestores();
	};
	await remove("yzrmgsyuzhou");
	await verifyShared("移除宇宙后", true);
	await remove("rsgsrishi");
	await verifyShared("移除日蚀后", true);
	const card = player.hand[0];
	await remove("wlgswl");
	equal(active.has("aohonghei_use"), false, "全部移除后不残留 use 触发器");
	equal(active.has("aohonghei_mark"), false, "全部移除后不残留 mark 触发器");
	assert(!card.hasGaintag("aohonghei_mark_red"), "全部移除后手牌标记清理");
	equal(addCalls, 2, "只在仍有继承技能时恢复，且每次恢复一次");
	equal(game.events.length, 0, "恢复事件均已结算");
});
console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
	process.exitCode = 1;
	for (const failure of failures) {
		console.error(`FAIL: ${failure.name}`);
		console.error(failure.error.stack ?? failure.error.message);
	}
}
