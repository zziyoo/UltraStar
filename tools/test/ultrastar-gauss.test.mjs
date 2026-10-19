// 月神高斯 / 日蚀高斯专项测试。
// skills.js 直接 import 浏览器包 noname.js，这里剥掉 import/export 后用最小桩件求值，
// 验证转换、摸牌、感化阵营分支与日蚀六项效果的实际代码路径。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..", "..");
const pack = path.join(root, "packages", "ultraman", "packs", "eternal-torch");

function loadExports(file, names) {
	const source = fs
		.readFileSync(file, "utf8")
		.replace(/^import[^;]*;/m, "")
		.replace(/^export\s+(const|let|var)\s+/gm, "$1 ");
	return new Function(
		"lib",
		"game",
		"ui",
		"get",
		"ai",
		"_status",
		`${source}\nreturn {${names.join(",")}};`,
	);
}

function makeCard(name, suit, number, type = "basic", tags = {}) {
	const color = suit === "heart" || suit === "diamond" ? "red" : suit === "spade" || suit === "club" ? "black" : "none";
	return { name, suit, number, type, color, tags };
}

const _status = { mode: "identity", event: null };
const game = {
	players: [],
	zhu: null,
	logs: [],
	log(...args) {
		this.logs.push(args);
	},
	hasPlayer(fn) {
		return this.players.some(fn);
	},
	broadcastAll(fn, ...args) {
		return fn(...args);
	},
};
const ui = {
	create: {
		dialog(title, content) {
			return { title, content };
		},
	},
};
const ai = {};
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
	is: {
		damageCard(card) {
			return Boolean(card?.tags?.damage) && get.type(card) !== "delay";
		},
	},
	tag(card, tag) {
		return card?.tags?.[tag];
	},
	type(card) {
		if (card?.type) return card.type;
		if (card?.name === "wuxie") return "trick";
		return "basic";
	},
	suit(card) {
		return card?.suit;
	},
	color(card) {
		return card?.color;
	},
	number(card) {
		return card?.number;
	},
	autoViewAs(card) {
		return { ...card, isVCard: true };
	},
	value() {
		return 5;
	},
	attitude() {
		return 1;
	},
	translation(value) {
		return lib.translate[value] ?? value;
	},
	poptip(value) {
		return value;
	},
};
let skillTable;
const lib = {
	character: {
		月神高斯: { sex: "male", group: "ao", hp: 4, skills: ["ysmanyue", "ysganhua"], names: "null|高斯" },
		日蚀高斯: { sex: "male", group: "ao", hp: 4, skills: ["rsrishi"], names: "null|高斯" },
	},
	translate: {},
	skill: {},
	filter: {
		cardEnabled(card, player, event) {
			if (event === "forceEnable") return true;
			const result = skillTable?.ysmanyue?.mod?.cardEnabled?.(card, player);
			if (result !== undefined) return Boolean(result);
			if (card?.name === "tao") return Boolean(player?.isDamaged?.());
			return true;
		},
	},
};
const loadSkills = loadExports(path.join(pack, "skills.js"), ["skills"]);
const skills = loadSkills(lib, game, ui, get, ai, _status).skills;
skillTable = skills;
lib.skill = skills;
const loadCharacters = loadExports(path.join(pack, "characters.js"), ["characters"]);
const characters = loadCharacters(lib, game, ui, get, ai, _status).characters;
const loadMeta = loadExports(path.join(pack, "characters-meta.js"), ["characterTranslate", "characterTitle", "characterIntro"]);
const meta = loadMeta(lib, game, ui, get, ai, _status);
const loadTranslate = loadExports(path.join(pack, "translate.js"), ["skillTranslate"]);
const skillTranslate = loadTranslate(lib, game, ui, get, ai, _status).skillTranslate;

function makePlayer(options = {}) {
	const name = options.name ?? "月神高斯";
	const player = {
		name,
		name1: name,
		name2: options.name2,
		identity: options.identity,
		group: options.group ?? "ao",
		side: options.side,
		hp: options.hp ?? 4,
		maxHp: options.maxHp ?? 4,
		singleHp: options.singleHp,
		hujia: options.hujia,
		isZhu: options.isZhu ?? false,
		storage: options.storage ?? {},
		skills: (options.skills ?? ["ysmanyue", "ysganhua"]).slice(),
		hand: (options.hand ?? []).slice(),
		choices: (options.choices ?? []).slice(),
		drawCalls: [],
		calls: [],
		stat: { card: { sha: 1 } },
		node: { identity: { dataset: { color: "x" } } },
		isAlive() {
			return true;
		},
		isDamaged() {
			return this.hp < this.maxHp;
		},
		getCards(position) {
			return String(position).includes("h") ? this.hand : [];
		},
		hasCards(position, filter) {
			return this.getCards(position).some(card => !filter || filter(card, this));
		},
		hasSkill(skill) {
			return this.skills.includes(skill);
		},
		getStat() {
			return this.stat;
		},
		getUseValue() {
			return 1;
		},
		async draw(num) {
			this.drawCalls.push(num);
			return [];
		},
		async changeCharacter(names) {
			this.calls.push(["changeCharacter", names]);
			this.name1 = names[0];
			this.name = names[0];
			this.name2 = names[1];
			this.skills = names[0] === "日蚀高斯" ? ["rsrishi"] : this.skills;
		},
		async removeSkills(skill) {
			const list = Array.isArray(skill) ? skill : [skill];
			this.skills = this.skills.filter(item => !list.includes(item));
		},
		async addSkills(skill) {
			const list = Array.isArray(skill) ? skill : [skill];
			for (const item of list) {
				if (!this.skills.includes(item)) this.skills.push(item);
			}
		},
		async changeGroup(group) {
			this.calls.push(["changeGroup", group]);
			this.group = group;
		},
		addTempSkill(skill) {
			this.calls.push(["addTempSkill", skill]);
			this.skills.push(skill);
		},
		markSkill(skill) {
			this.calls.push(["markSkill", skill]);
		},
		update() {},
		setIdentity() {
			this.identityUpdates = (this.identityUpdates ?? 0) + 1;
		},
		showIdentity() {
			this.identityShown = true;
		},
		logSkill() {},
		chooseBool(prompt) {
			const event = {
				player: this,
				prompt,
				source: undefined,
				set(key, value) {
					if (key === "source") this.source = value;
					return this;
				},
				async forResult() {
					return { bool: this.player.choices.shift() ?? false };
				},
			};
			_status.event = event;
			return event;
		},
	};
	return player;
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

const sha = makeCard("sha", "spade", 7, "basic", { damage: 1 });
const clubSha = makeCard("sha", "club", 8, "basic", { damage: 1 });
const juedou = makeCard("juedou", "club", 9, "trick", { damage: 1 });
const tao = makeCard("tao", "heart", 3, "basic", { recover: 1 });
const shan = makeCard("shan", "diamond", 2, "basic", { respondShan: 1 });

console.log("月神高斯 / 日蚀高斯");

await check("角色、技能与替换注册齐全", () => {
	for (const name of ["月神高斯", "日蚀高斯"]) {
		const info = characters[name];
		assert(info, `${name} 未注册`);
		equal(info.sex, "male", `${name} 性别`);
		equal(info.group, "ao", `${name} 势力`);
		equal(info.hp, 4, `${name} 体力`);
		equal(info.names, "null|高斯", `${name} names`);
		assert(!("img" in info), `${name} 不应引用不存在的立绘`);
	}
	equal(characters["月神高斯"].skills.join(","), "ysmanyue,ysganhua", "月神高斯技能");
	equal(characters["日蚀高斯"].skills.join(","), "rsrishi", "日蚀高斯技能");
	equal(meta.characterTitle["月神高斯"], "慈爱的战士", "月神高斯称号");
	equal(meta.characterTitle["日蚀高斯"], "炽热与勇猛", "日蚀高斯称号");
	equal(meta.characterTranslate["月神高斯_prefix"], "月神", "月神前缀");
	equal(meta.characterTranslate["日蚀高斯_prefix"], "日蚀", "日蚀前缀");
	const bootstrap = fs.readFileSync(path.join(root, "src", "core", "bootstrap.js"), "utf8");
	assert(bootstrap.includes('lib.characterReplace["高斯"] = ["月神高斯", "日蚀高斯"];'), "替换组未注册");
	const registry = fs.readFileSync(path.join(root, "src", "core", "registry.js"), "utf8");
	assert(registry.includes('"月神高斯","日蚀高斯"'), "CHARACTER_ORDER 未登记");
});

await check("三段技能描述原样保留", () => {
	equal(
		skillTranslate.ysmanyue_info,
		"锁定技，你的伤害牌只能当【闪】，【桃】，【无懈可击】使用或打出；出牌阶段，你可以主动对其他角色使用【桃】。当你使用牌时，若你手牌中有伤害牌和非伤害牌，你摸一张牌，否则摸两张牌。",
		"满月描述",
	);
	equal(
		skillTranslate.ysganhua_info,
		"当你令其他角色回复体力后，若其不为主公或地主，其可以加入你的阵营或将身份牌换为与你一致，若其拒绝，你可以将武将牌切换为日蚀高斯。",
		"感化描述",
	);
	equal(
		skillTranslate.rsrishi_info,
		"锁定技，你使用的：红色牌额外结算一次；黑色牌无法响应；红心牌无视防具；方块牌无距离限制；黑桃牌造成的伤害+1；梅花牌不计入次数且无次数限制。",
		"日蚀描述",
	);
});

await check("满月：伤害牌禁止原样使用/打出，桃可对其他角色使用", () => {
	const player = makePlayer({ choices: [] });
	const other = makePlayer({ name: "迪迦", hp: 2, skills: [] });
	game.players = [player, other];
	equal(skills.ysmanyue.mod.cardEnabled(sha, player), false, "伤害牌原样使用");
	equal(skills.ysmanyue.mod.cardEnabled(tao, player), true, "满血时可对其他受伤角色用桃");
	equal(JSON.stringify(skills.ysmanyue.mod.selectTarget(tao)), "[1,1]", "桃保持单目标");
	_status.event = { name: "chooseToRespond", type: "sha" };
	equal(skills.ysmanyue.mod.cardRespondable(sha, player), false, "杀不能原样打出");
	_status.event = { name: "chooseToRespond", type: "sha", skill: "ysmanyue_backup" };
	assert(skills.ysmanyue.mod.cardRespondable(sha, player) === undefined, "满月转化选牌应放行");
	_status.event = { name: "chooseToRespond", type: "tao", skill: "ysmanyue_backup" };
	assert(skills.ysmanyue.mod.cardRespondable(sha, player) === undefined, "打出桃的转化选牌应放行");
	_status.event = null;
});

await check("满月：合法时机只提供对应转化牌", () => {
	const player = makePlayer({ hand: [sha] });
	const damaged = makePlayer({ name: "迪迦", hp: 2, skills: [] });
	game.players = [player, damaged];
	const makeEvent = (name, type, allowed) => ({
		name,
		type,
		filterCard(card) {
			return allowed.includes(card.name);
		},
	});
	assert(skills.ysmanyue.filter(makeEvent("chooseToUse", "phase", ["tao"]), player), "出牌阶段可用桃");
	assert(!skills.ysmanyue.filter(makeEvent("chooseToUse", "phase", ["shan", "wuxie"]), player), "出牌阶段不提供闪/无懈");
	assert(skills.ysmanyue.filter(makeEvent("chooseToUse", "wuxie", ["wuxie"]), player), "无懈时机");
	assert(!skills.ysmanyue.filter(makeEvent("chooseToUse", "wuxie", ["shan", "tao"]), player), "无懈时机不能出闪/桃");
	assert(skills.ysmanyue.filter(makeEvent("chooseToUse", "respondShan", ["shan"]), player), "杀响应时用闪");
	assert(skills.ysmanyue.filter(makeEvent("chooseToRespond", "shan", ["shan"]), player), "闪响应时机");
	assert(!skills.ysmanyue.filter(makeEvent("chooseToRespond", "sha", ["sha"]), player), "不能把伤害牌当杀打出");
	assert(skills.ysmanyue.hiddenCard(player, "wuxie"), "hiddenCard 支持无懈");
	assert(!skills.ysmanyue.hiddenCard(player, "sha"), "hiddenCard 不声明杀");
	const backup = skills.ysmanyue.chooseButton.backup([["基本", "", "shan"]], player);
	const virtual = backup.viewAs([sha]);
	equal(virtual.name, "shan", "backup viewAs 牌名");
	equal(virtual.suit, "spade", "backup viewAs 花色");
	equal(virtual.number, 7, "backup viewAs 点数");
	assert(backup.filterCard(sha), "backup 可消耗伤害牌");
	assert(!backup.filterCard(tao), "backup 不消耗非伤害牌");
});

await check("满月：三种手牌构成摸牌数正确", async () => {
	const drawSkill = skills.ysmanyue.subSkill.draw;
	const player = makePlayer();
	const cases = [
		{ hand: [sha, tao], expected: 1, name: "伤害+非伤害" },
		{ hand: [sha], expected: 2, name: "仅伤害" },
		{ hand: [sha, juedou], expected: 2, name: "多种伤害牌" },
		{ hand: [tao], expected: 2, name: "仅非伤害" },
		{ hand: [], expected: 2, name: "零手牌" },
	];
	for (const item of cases) {
		player.hand = item.hand;
		player.drawCalls.length = 0;
		await drawSkill.content({}, { card: sha }, player);
		equal(player.drawCalls.join(","), String(item.expected), item.name);
	}
});

await check("感化：来源、主公与地主过滤", () => {
	const source = makePlayer();
	const target = makePlayer({ name: "迪迦", identity: "fan", skills: [] });
	const zhu = makePlayer({ name: "佐菲", identity: "zhu", skills: [] });
	_status.mode = "identity";
	game.zhu = zhu;
	const filter = skills.ysganhua.filter;
	assert(filter({ source, player: target, num: 1 }, source), "正常回复应触发");
	assert(!filter({ source, player: source, num: 1 }, source), "不能对自己触发");
	assert(!filter({ source: target, player: target, num: 1 }, source), "来源必须是月神高斯");
	assert(!filter({ source, player: target, num: 0 }, source), "未实际回复不触发");
	assert(!filter({ source, player: zhu, num: 1 }, source), "主公不能成为目标");
	game.zhu = target;
	assert(!filter({ source, player: target, num: 1 }, source), "game.zhu 不能成为目标");
	game.zhu = zhu;
	const notMoon = makePlayer({ name: "迪迦" });
	assert(!filter({ source: notMoon, player: target, num: 1 }, notMoon), "技能被复制后来源不是月神高斯不触发");
	_status.mode = "doudizhu";
	game.zhu = zhu;
	const landlord = makePlayer({ name: "地主", identity: "zhu", skills: [] });
	assert(!filter({ source, player: landlord, num: 1 }, source), "地主不能成为目标");
});

await check("感化：身份模式接受后身份与胜利关系真实变更", async () => {
	_status.mode = "identity";
	const source = makePlayer({ identity: "zhong" });
	const target = makePlayer({ name: "迪迦", identity: "fan", skills: [], choices: [true] });
	game.players = [source, target];
	game.zhu = makePlayer({ name: "佐菲", identity: "zhu", skills: [] });
	await skills.ysganhua.content({}, { source, player: target, num: 1 }, source);
	equal(target.identity, "zhong", "目标身份应变为忠臣");
	assert(target.identityUpdates > 0, "身份牌 UI 应刷新");
});

await check("感化：主公阵营以忠臣身份承接，不产生第二个主公", async () => {
	_status.mode = "identity";
	const source = makePlayer({ identity: "zhu" });
	const target = makePlayer({ name: "迪迦", identity: "fan", skills: [], choices: [true] });
	game.players = [source, target];
	game.zhu = source;
	await skills.ysganhua.content({}, { source, player: target, num: 1 }, source);
	equal(target.identity, "zhong", "目标应以忠臣身份加入主公阵营");
	equal(game.zhu, source, "game.zhu 不应被替换");
});

await check("感化：拒绝后切换为日蚀高斯并保留状态", async () => {
	_status.mode = "identity";
	const source = makePlayer({ identity: "zhong", hp: 2, maxHp: 4, singleHp: false, hujia: 1, choices: [true] });
	const target = makePlayer({ name: "迪迦", identity: "fan", skills: [], choices: [false] });
	game.players = [source, target];
	game.zhu = makePlayer({ name: "佐菲", identity: "zhu", skills: [] });
	await skills.ysganhua.content({}, { source, player: target, num: 1 }, source);
	equal(source.name1, "日蚀高斯", "武将牌应切换");
	assert(source.skills.includes("rsrishi"), "应获得日蚀");
	assert(!source.skills.includes("ysmanyue"), "应移除满月");
	assert(!source.skills.includes("ysganhua"), "应移除感化");
	equal(source.hp, 2, "体力应保留");
	equal(source.maxHp, 4, "体力上限应保留");
	equal(source.hujia, 1, "护甲应保留");
	assert(source.calls.some(call => call[0] === "changeCharacter"), "应走本体 changeCharacter");
	assert(!source.calls.some(call => call[0] === "gameStart"), "不应触发游戏开始");
});

await check("感化：斗地主不伪造地主阵营", async () => {
	_status.mode = "doudizhu";
	const source = makePlayer({ identity: "zhu", choices: [true] });
	const target = makePlayer({ name: "农民", identity: "fan", skills: [], choices: [true] });
	game.players = [source, target];
	game.zhu = source;
	await skills.ysganhua.content({}, { source, player: target, num: 1 }, source);
	equal(target.identity, "fan", "不能把农民伪装成地主阵营");
	equal(target.choices.length, 1, "无法安全加入时不应消耗目标的选择");
	equal(source.name1, "日蚀高斯", "拒绝后仍可正常切换形态");
});

await check("感化：阵营模式按 side 真实变更且主公身份降为忠臣", async () => {
	_status.mode = "versus";
	const source = makePlayer({ identity: "zhu", side: true });
	const target = makePlayer({ name: "迪迦", identity: "zhong", side: false, skills: [], choices: [true] });
	game.players = [source, target];
	await skills.ysganhua.content({}, { source, player: target, num: 1 }, source);
	equal(target.side, true, "side 应变更");
	equal(target.identity, "zhong", "不应复制出第二个主公");
});

await check("日蚀：红/黑、红心/方块/黑桃/梅花效果可叠加", async () => {
	_status.mode = "identity";
	const source = makePlayer({ name: "日蚀高斯", skills: ["rsrishi"] });
	const targetPlayer = makePlayer({ name: "迪迦", skills: [] });
	game.players = [source, targetPlayer];
	const use = skills.rsrishi.subSkill.use;
	const makeDirectHit = () => {
		const directHit = [];
		directHit.addArray = array => {
			for (const item of array) {
				if (!directHit.includes(item)) directHit.push(item);
			}
		};
		return directHit;
	};
	const makeUse = card => ({ name: "useCard", card, effectCount: 1, directHit: makeDirectHit(), addCount: true });
	const heart = makeCard("tao", "heart", 3, "basic", { recover: 1 });
	let trigger = makeUse(heart);
	await use.content({}, trigger, source);
	equal(trigger.effectCount, 2, "红心牌额外结算");
	equal(trigger.directHit.length, 0, "红心不是黑色不可响应");
	const diamond = makeCard("juedou", "diamond", 4, "trick", { damage: 1 });
	trigger = makeUse(diamond);
	await use.content({}, trigger, source);
	equal(trigger.effectCount, 2, "方块牌同为红色，额外结算");
	equal(skills.rsrishi.mod.targetInRange(diamond), true, "方块无距离限制");
	const spade = makeCard("sha", "spade", 5, "basic", { damage: 1 });
	trigger = makeUse(spade);
	await use.content({}, trigger, source);
	equal(trigger.directHit.length, game.players.length, "黑桃牌不可响应");
	equal(trigger.effectCount, 1, "黑桃不是红色，不额外结算");
	const club = makeCard("sha", "club", 6, "basic", { damage: 1 });
	trigger = makeUse(club);
	source.stat.card.sha = 1;
	await use.content({}, trigger, source);
	equal(trigger.addCount, false, "梅花不计入次数");
	equal(source.stat.card.sha, 0, "使用计数应回退");
	equal(trigger.directHit.length, game.players.length, "梅花同样不可响应");
	equal(skills.rsrishi.mod.cardUsable(club), Infinity, "梅花无次数限制");
});

await check("日蚀：红心无视防具与黑桃伤害+1", async () => {
	const source = makePlayer({ name: "日蚀高斯", skills: ["rsrishi"] });
	const target = makePlayer({ name: "迪迦", skills: [] });
	target.storage.qinggang2 = { add(card) { this.card = card; } };
	const heart = makeCard("sha", "heart", 9, "basic", { damage: 1 });
	await skills.rsrishi.subSkill.heart.content({}, { card: heart, target }, source);
	assert(target.skills.includes("qinggang2"), "应挂上本体破防状态");
	equal(target.storage.qinggang2.card, heart, "破防应绑定本次牌");
	const spade = makeCard("sha", "spade", 10, "basic", { damage: 1 });
	const damage = { card: spade, source, num: 1, numFixed: false };
	await skills.rsrishi.subSkill.spade.content({}, damage, source);
	equal(damage.num, 2, "黑桃伤害+1");
	assert(!skills.rsrishi.subSkill.spade.filter({ card: spade, source, numFixed: true }, source), "numFixed 不叠加");
});

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
	for (const failure of failures) {
		console.error(`\n${failure.name}\n${failure.error.stack}`);
	}
	process.exit(1);
}
