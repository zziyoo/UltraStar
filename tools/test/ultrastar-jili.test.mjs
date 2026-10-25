// 至高盖亚【极力】专项测试。
// 直接执行本体 hasSha/hasSkillTag/hasUsableCard，验证 AI 可出杀判断与实际 filterCard 一致。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..", "..");
const appRoot = path.join(root, "..", "..");
const pack = path.join(root, "packages", "ultraman", "packs", "daybreak");

function loadExports(file, names) {
	const source = fs
		.readFileSync(file, "utf8")
		.replace(/^import[^\n]*;/gm, "")
		.replace(/^export\s+(const|let|var)\s+/gm, "$1 ");
	// skills.js 可能 import shared 工具（getNewDiscardCards），本测试不触发相关路径，注入空桩
	return new Function(
		"lib",
		"game",
		"ui",
		"get",
		"ai",
		"_status",
		"getNewDiscardCards",
		`${source}\nreturn {${names.join(",")}};`,
	);
}

function makeCard(name, type, tags = {}) {
	return { name, type, tags };
}

const _status = { mode: "identity", event: null };
const game = {
	players: [],
	expandSkills(skills) {
		return skills;
	},
};
const get = {
	tag(card, tag) {
		return card?.tags?.[tag];
	},
	is: {
		object(value) {
			return value !== null && typeof value === "object";
		},
		damageCard(card) {
			return Boolean(card?.tags?.damage) && get.type(card) !== "delay";
		},
	},
	type(card) {
		return card?.type || "basic";
	},
	name(card) {
		return card?.name || card;
	},
	event() {
		return _status.event;
	},
	itemtype(value) {
		return value && typeof value === "object" ? "event" : "unknown";
	},
	autoViewAs(card) {
		return card;
	},
	info(item) {
		return typeof item === "string" ? lib.skill[item] : undefined;
	},
	value() {
		return 5;
	},
};
const lib = {
	skill: { global: [] },
	translate: {},
	filter: {
		notMe() {
			return true;
		},
		cardEnabled() {
			return true;
		},
		cardRespondable() {
			return true;
		},
	},
};
const skills = loadExports(path.join(pack, "skills.js"), ["skills"])(lib, game, {}, get, {}, _status).skills;
lib.skill = skills;
lib.skill.global = [];

function findMatchingBrace(source, open) {
	let depth = 0;
	for (let i = open; i < source.length; i++) {
		const char = source[i];
		if (char === '"' || char === "'" || char === "`") {
			const quote = char;
			for (i++; i < source.length; i++) {
				if (source[i] === "\\") {
					i++;
					continue;
				}
				if (source[i] === quote) break;
			}
		} else if (char === "/" && source[i + 1] === "/") {
			i = source.indexOf("\n", i);
			if (i < 0) return -1;
		} else if (char === "/" && source[i + 1] === "*") {
			i = source.indexOf("*/", i + 2) + 1;
			if (i < 1) return -1;
		} else if (char === "{") {
			depth++;
		} else if (char === "}") {
			depth--;
			if (depth === 0) return i;
		}
	}
	return -1;
}

function loadHostMethod(source, name) {
	const start = source.indexOf(`\n\t${name}(`);
	if (start < 0) throw new Error(`本体缺少 ${name}`);
	const open = source.indexOf("{", start);
	const close = findMatchingBrace(source, open);
	if (close < 0) throw new Error(`无法定位 ${name} 的方法体`);
	const method = source.slice(start + 1, close + 1);
	return new Function("get", "game", "lib", "_status", "ui", `return (function ${method});`)(get, game, lib, _status, {});
}

const hostPlayerFile = path.join(appRoot, "src", "noname", "library", "element", "player.js");
const hostAvailable = fs.existsSync(hostPlayerFile);
let hasSkillTag, hasUsableCard, hasSha;
if (hostAvailable) {
	const hostSource = fs.readFileSync(hostPlayerFile, "utf8");
	hasSkillTag = loadHostMethod(hostSource, "hasSkillTag");
	hasUsableCard = loadHostMethod(hostSource, "hasUsableCard");
	hasSha = loadHostMethod(hostSource, "hasSha");
}

function makeHostPlayer({ hand = [], equipment = [], special = [] } = {}) {
	const player = {
		hand,
		equipment,
		special,
		storage: {},
		getCards(position) {
			const pos = String(position);
			const cards = [];
			if (pos.includes("h")) cards.push(...this.hand);
			if (pos.includes("e")) cards.push(...this.equipment);
			if (pos.includes("s")) cards.push(...this.special);
			return cards;
		},
		hasCards(position, filter) {
			return this.getCards(position).some(card => !filter || filter(card, this));
		},
		hasCard(filter, position) {
			return this.getCards(position).some(card => filter(card));
		},
		countCards(position, filter) {
			if (typeof filter === "string") return this.getCards(position).filter(card => get.name(card) === filter).length;
			return this.getCards(position).filter(card => !filter || filter(card, this)).length;
		},
		getSkills() {
			const list = ["zggyjili"];
			list.addArray = function (items) {
				for (const item of items || []) {
					if (!this.includes(item)) this.push(item);
				}
				return this;
			};
			return list;
		},
	};
	if (hostAvailable) {
		player.hasSkillTag = hasSkillTag;
		player.hasUsableCard = hasUsableCard;
		player.hasSha = hasSha;
	}
	return player;
}

function makeEvent(name = "chooseToUse", type = "phase", player = null) {
	return {
		name,
		type,
		player,
		getParent(evtName) {
			return this.name === evtName ? this : null;
		},
		filterCard() {
			return true;
		},
	};
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

const lightning = makeCard("shandian", "delay", { damage: 0.16, thunderDamage: 0.16 });
const fulei = makeCard("fulei", "delay", { damage: 1, thunderDamage: 1 });
const lebu = makeCard("lebu", "delay", {});
const tao = makeCard("tao", "basic", { recover: 1 });

console.log("至高盖亚【极力】");

await check("极力：规则文本、可消耗区域与实际筛选未改动", () => {
	const skill = skills.zggyjili;
	equal(skill.position, "he", "可消耗区域仍为手牌与装备区");
	equal(skill.prompt, "将一张非伤害类牌当普通的【杀】使用", "技能提示文本未改动");
	assert(skill.enable.includes("phaseUse") && skill.enable.includes("chooseToUse"), "发动时机未改动");
	equal(skill.filterCard(lightning, makeHostPlayer({ hand: [lightning] })), false, "闪电不得作为极力载体");
	equal(skill.filterCard(fulei, makeHostPlayer({ hand: [fulei] })), false, "浮雷不得作为极力载体");
	equal(skill.filterCard(lebu, makeHostPlayer({ hand: [lebu] })), true, "非伤害延时锦囊仍可作为载体");
	equal(skill.filterCard(tao, makeHostPlayer({ hand: [tao] })), true, "普通非伤害牌可作为载体");
	assert(!get.is.damageCard(lightning) && !get.is.damageCard(fulei), "测试必须保留本体 is.damageCard 排除延时锦囊的行为");
});

await check("极力：伤害延时锦囊不再被声明为可用杀", () => {
	const skill = skills.zggyjili;
	for (const card of [lightning, fulei]) {
		const player = makeHostPlayer({ hand: [card] });
		_status.event = makeEvent("chooseToUse", "phase", player);
		equal(skill.viewAsFilter(player), false, `${card.name} 不应通过 viewAsFilter`);
		equal(skill.hiddenCard(player, "sha"), false, `${card.name} 不应被 hiddenCard 声明为杀`);
		equal(skill.ai.skillTagFilter(player, "respondSha"), false, `${card.name} 不应提供 respondSha 标签`);
	}
	const empty = makeHostPlayer();
	_status.event = makeEvent("chooseToUse", "phase", empty);
	equal(skill.viewAsFilter(empty), false, "空手牌不应因 viewAs 被误判为可用");
	equal(skill.hiddenCard(empty, "sha"), false, "空手牌不应声明杀");
});

await check("极力：合法非伤害牌正常识别，装备区与手牌一致", () => {
	const skill = skills.zggyjili;
	const hand = makeHostPlayer({ hand: [tao] });
	const equip = makeHostPlayer({ equipment: [tao] });
	const mixed = makeHostPlayer({ hand: [lightning], equipment: [tao] });
	for (const [label, player] of [
		["手牌", hand],
		["装备区", equip],
		["伤害牌+装备区非伤害牌", mixed],
	]) {
		_status.event = makeEvent("chooseToUse", "phase", player);
		equal(skill.viewAsFilter(player), true, `${label} 应识别为可用`);
		equal(skill.hiddenCard(player, "sha"), true, `${label} 应声明杀`);
		equal(skill.ai.skillTagFilter(player, "respondSha"), true, `${label} 应提供 respondSha 标签`);
	}
});

await check("极力：本体 hasSha/hasSkillTag/hasUsableCard 路径与筛选一致", () => {
	assert(hostAvailable, "本体源码不存在，无法验证 AI 调用路径");
	for (const card of [lightning, fulei]) {
		const player = makeHostPlayer({ hand: [card] });
		_status.event = makeEvent("chooseToUse", "phase", player);
		equal(player.hasSkillTag("respondSha", true, "respond", true), false, `${card.name} 不应被本体 hasSkillTag 判为可出杀`);
		equal(player.hasSha(false), false, `${card.name} 不应被本体 hasSha(use) 判为可出杀`);
		equal(player.hasSha(true), false, `${card.name} 不应被本体 hasSha(respond) 判为可出杀`);
		equal(player.hasUsableCard("sha", "use"), false, `${card.name} 不应被本体 hasUsableCard 判为可用`);
	}
	const empty = makeHostPlayer();
	_status.event = makeEvent("chooseToUse", "phase", empty);
	equal(empty.hasSha(false), false, "空手牌不应被本体 hasSha 判为可出杀");
	equal(empty.hasSha(true), false, "空手牌不应被本体 hasSha(respond) 判为可出杀");
	for (const [label, player] of [
		["手牌", makeHostPlayer({ hand: [tao] })],
		["装备区", makeHostPlayer({ equipment: [tao] })],
	]) {
		_status.event = makeEvent("chooseToUse", "phase", player);
		equal(player.hasSkillTag("respondSha", true, "respond", true), true, `${label} 应被本体 hasSkillTag 识别`);
		equal(player.hasSha(false), true, `${label} 应被本体 hasSha(use) 识别`);
		equal(player.hasSha(true), true, `${label} 应被本体 hasSha(respond) 识别`);
		equal(player.hasUsableCard("sha", "use"), true, `${label} 应被本体 hasUsableCard 识别`);
	}
});

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
	for (const failure of failures) {
		console.error(`\n${failure.name}\n${failure.error.stack}`);
	}
	process.exit(1);
}
