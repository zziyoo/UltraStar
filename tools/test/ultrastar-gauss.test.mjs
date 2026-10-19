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
	me: null,
	friendZhu: null,
	enemyZhu: null,
	boss: null,
	logs: [],
	checkResultCalls: 0,
	tryResultCalls: 0,
	overCalls: [],
	log(...args) {
		this.logs.push(args);
	},
	hasPlayer(fn) {
		return this.players.some(fn);
	},
	broadcastAll(fn, ...args) {
		return fn(...args);
	},
	checkResult() {
		this.checkResultCalls++;
	},
	tryResult() {
		this.tryResultCalls++;
	},
	over(result) {
		this.overCalls.push(result);
	},
	expandSkills(skills) {
		return skills;
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
	name(card) {
		return card?.name || card;
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
	attitude(from, to) {
		if (typeof from?.side === "boolean" && typeof to?.side === "boolean") return from.side === to.side ? 5 : -5;
		if (from?.identity && to?.identity) {
			const loyal = ["zhu", "zhong", "mingzhong"];
			if (from.identity === to.identity) return 5;
			if (loyal.includes(from.identity) && loyal.includes(to.identity)) return 5;
			return -5;
		}
		return 1;
	},
	translation(value) {
		return lib.translate[value] ?? value;
	},
	poptip(value) {
		return value;
	},
	info(item) {
		if (typeof item === "string") return lib.skill[item];
		if (item && item.name) return lib.card[item.name];
		return undefined;
	},
	result(card, skill) {
		const info = get.info(card);
		let result = info?.ai?.result ? { ...info.ai.result } : {};
		if (skill) {
			const skillInfo = get.info(skill);
			if (skillInfo?.ai?.result) result = { ...result, ...skillInfo.ai.result };
		}
		return result;
	},
	card() {
		return _status.event?._get_card;
	},
	copy(value) {
		return Array.isArray(value) ? value.slice() : value;
	},
	itemtype(value) {
		if (Array.isArray(value) && value.length === 2 && value.every(Number.isFinite)) return "select";
		return undefined;
	},
	priority() {
		return 0;
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
	card: {
		tao: {
			selectTarget: -1,
			filterTarget(card, player, target) {
				return target === player && target.isDamaged();
			},
			async content(event) {
				await event.target.recover();
			},
			ai: {
				result: {
					target_use: () => 2,
				},
			},
		},
	},
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
lib.skill.global = [];
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
		identityShown: options.identityShown ?? false,
		unseen: options.unseen,
		special_identity: options.special_identity,
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
		equipment: (options.equipment ?? []).slice(),
		judge: (options.judge ?? []).slice(),
		choices: (options.choices ?? []).slice(),
		drawCalls: [],
		recoverCalls: [],
		onRecover: options.onRecover,
		calls: [],
		chats: [],
		stat: { card: { sha: 1 } },
		node: { identity: { dataset: { color: "x" } } },
		isAlive() {
			return true;
		},
		isDamaged() {
			return this.hp < this.maxHp;
		},
		isOut() {
			return false;
		},
		isDead() {
			return false;
		},
		removed: false,
		async recover() {
			this.recoverCalls.push(this);
			if (typeof this.onRecover === "function") await this.onRecover(this);
		},
		isUnseen(num) {
			return Boolean(this.unseen?.[num]);
		},
		getHp() {
			return this.hp;
		},
		getSkills() {
			return this.skills.slice();
		},
		countCards(position, filter) {
			return this.getCards(position).filter(card => !filter || filter(card, this)).length;
		},
		getCards(position) {
			position = String(position);
			if (position === "h") return this.hand;
			if (position === "e") return this.equipment;
			if (position === "j") return this.judge;
			return [...this.hand, ...this.equipment];
		},
		hasCards(position, filter) {
			return this.getCards(position).some(card => !filter || filter(card, this));
		},
		hasSkill(skill) {
			return this.skills.includes(skill);
		},
		hasSkillTag() {
			return false;
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
		chat(message) {
			this.chats.push(message);
		},
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
function resetCalls() {
	game.checkResultCalls = 0;
	game.tryResultCalls = 0;
	game.overCalls.length = 0;
	game.logs.length = 0;
}

const sha = makeCard("sha", "spade", 7, "basic", { damage: 1 });
const clubSha = makeCard("sha", "club", 8, "basic", { damage: 1 });
const juedou = makeCard("juedou", "club", 9, "trick", { damage: 1 });
const tao = makeCard("tao", "heart", 3, "basic", { recover: 1 });
const shan = makeCard("shan", "diamond", 2, "basic", { respondShan: 1 });
const nanman = makeCard("nanman", "spade", 7, "trick", { damage: 1, multitarget: 1 });
const wanjian = makeCard("wanjian", "heart", 1, "trick", { damage: 1, multitarget: 1 });
const huogong = makeCard("huogong", "heart", 2, "trick", { damage: 1 });
const shandian = makeCard("shandian", "spade", 1, "delay", { damage: 0.16, thunderDamage: 0.16 });
const fulei = makeCard("fulei", "heart", 5, "delay", { damage: 1, thunderDamage: 1 });
const lebu = makeCard("lebu", "club", 6, "delay", {});
const bingliang = makeCard("bingliang", "spade", 6, "delay", {});

console.log("月神高斯 / 日蚀高斯");

await check("角色、技能与替换注册齐全", () => {
	for (const name of ["月神高斯", "日蚀高斯"]) {
		const info = characters[name];
		assert(info, `${name} 未注册`);
		equal(info.sex, "male", `${name} 性别`);
		equal(info.group, "ao", `${name} 势力`);
		equal(info.hp, 4, `${name} 体力`);
		equal(info.names, "null|高斯", `${name} names`);
		if (info.img?.startsWith("extension/奥特之星/")) {
			assert(fs.existsSync(path.join(root, info.img.slice("extension/奥特之星/".length))), `${name} 引用的立绘文件应存在`);
		}
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

await check("满月：伤害牌统一按 damage 标签识别，包含伤害延时锦囊", () => {
	const shared = skills.ysmanyue.shared;
	for (const card of [sha, juedou, nanman, wanjian, huogong, shandian, fulei]) {
		assert(shared.isDamageCard(card), `${card.name} 应识别为伤害牌`);
	}
	for (const card of [tao, shan, lebu, bingliang]) {
		assert(!shared.isDamageCard(card), `${card.name} 不应识别为伤害牌`);
	}
	assert(!get.is.damageCard(shandian), "本体 get.is.damageCard 默认排除延时锦囊，测试桩必须保持该行为");
	const player = makePlayer({ hand: [shandian], hp: 3 });
	game.players = [player];
	equal(skills.ysmanyue.mod.cardEnabled(shandian, player), false, "闪电不能以原牌使用");
	assert(skills.ysmanyue.mod.cardEnabled(lebu, player) === undefined, "非伤害延时锦囊不应被误伤");
	_status.event = { name: "chooseToRespond", type: "sha" };
	equal(skills.ysmanyue.mod.cardRespondable(shandian, player), false, "闪电不能原样打出");
	_status.event = { name: "chooseToRespond", type: "sha", skill: "ysmanyue_backup" };
	assert(skills.ysmanyue.mod.cardRespondable(shandian, player) === undefined, "满月转化应放行闪电");
	_status.event = null;
	assert(skills.ysmanyue.hiddenCard(player, "wuxie"), "只有闪电时仍可声明无懈转化");
	assert(skills.ysmanyue.filter({ name: "chooseToUse", type: "phase", filterCard: card => card.name === "tao" }, player), "闪电可以当桃");
	assert(skills.ysmanyue.filter({ name: "chooseToUse", type: "respondShan", filterCard: card => card.name === "shan" }, player), "闪电可以当闪");
	assert(skills.ysmanyue.filter({ name: "chooseToUse", type: "wuxie", filterCard: card => card.name === "wuxie" }, player), "闪电可以当无懈");
	const backup = skills.ysmanyue.chooseButton.backup([["锦囊", "", "tao"]], player);
	assert(backup.filterCard(shandian), "闪电可作为满月转化载体");
	assert(backup.filterCard(fulei), "其他伤害延时锦囊可作为满月转化载体");
	assert(!backup.filterCard(lebu), "非伤害延时锦囊不能作为载体");
	const judgePlayer = makePlayer({ hand: [], judge: [shandian], hp: 3 });
	game.players = [judgePlayer];
	assert(!skills.ysmanyue.filter({ name: "chooseToUse", type: "phase", filterCard: card => card.name === "tao" }, judgePlayer), "判定区闪电不能触发满月转化");
	assert(!skills.ysmanyue.hiddenCard(judgePlayer, "wuxie"), "判定区闪电不能凭空转化");
});

await check("满月：伤害牌禁止原样使用/打出，桃可对其他角色使用", () => {
	const player = makePlayer({ choices: [] });
	const other = makePlayer({ name: "迪迦", hp: 2, skills: [] });
	game.players = [player, other];
	equal(skills.ysmanyue.mod.cardEnabled(sha, player), false, "伤害牌原样使用");
	equal(skills.ysmanyue.mod.cardEnabled(tao, player), true, "满血时可对其他受伤角色用桃");
	_status.event = { name: "chooseToUse", type: "phase" };
	const range = [-1, -1];
	skills.ysmanyue.mod.selectTarget(tao, player, range);
	equal(JSON.stringify(range), "[1,1]", "出牌阶段桃应原地改为单目标");
	_status.event = { name: "chooseToUse", type: "dying" };
	const dyingRange = [-1, -1];
	skills.ysmanyue.mod.selectTarget(tao, player, dyingRange);
	equal(JSON.stringify(dyingRange), "[-1,-1]", "濒死救援不修改本体目标范围");
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
		{ hand: [shandian, tao], expected: 1, name: "闪电+桃" },
		{ hand: [shandian], expected: 2, name: "仅闪电" },
		{ hand: [shandian, sha], expected: 2, name: "闪电+杀" },
		{ hand: [shandian, lebu], expected: 1, name: "闪电+非伤害延时锦囊" },
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
	equal(target.chats.join(""), "其实，我早就找回奥特精神了", "接受加入阵营时目标应发言");
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
	equal(target.chats.length, 0, "未接受加入时目标不应发言");
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
	equal(target.chats.join(""), "其实，我早就找回奥特精神了", "阵营模式接受时目标应发言");
});

await check("感化：反贼阵营招降后成为反贼并触发本体胜负检查", async () => {
	_status.mode = "identity";
	resetCalls();
	const source = makePlayer({ identity: "fan", identityShown: true });
	const target = makePlayer({ name: "迪迦", identity: "zhong", skills: [], choices: [true] });
	game.players = [source, target];
	game.zhu = makePlayer({ name: "佐菲", identity: "zhu", skills: [] });
	await skills.ysganhua.content({}, { source, player: target, num: 1 }, source);
	equal(target.identity, "fan", "目标应成为反贼");
	equal(game.checkResultCalls, 1, "身份变更后应调用本体胜负检查");
});

await check("感化：同阵营接受不产生身份改动与重复胜负检查", async () => {
	_status.mode = "identity";
	resetCalls();
	const source = makePlayer({ identity: "fan", identityShown: true });
	const target = makePlayer({ name: "迪迦", identity: "fan", skills: [], choices: [true] });
	game.players = [source, target];
	game.zhu = makePlayer({ name: "佐菲", identity: "zhu", skills: [] });
	await skills.ysganhua.content({}, { source, player: target, num: 1 }, source);
	equal(target.identity, "fan", "同阵营身份不应改变");
	equal(target.chats.length, 0, "同阵营无变化时不应发言");
	equal(game.checkResultCalls, 0, "无状态变化不应重复判胜");
});

await check("感化：内奸来源为不支持，不询问目标也不视为拒绝", async () => {
	_status.mode = "identity";
	resetCalls();
	const source = makePlayer({ identity: "nei", identityShown: true, choices: [true] });
	const target = makePlayer({ name: "迪迦", identity: "fan", skills: [], choices: [true] });
	game.players = [source, target];
	game.zhu = makePlayer({ name: "佐菲", identity: "zhu", skills: [] });
	await skills.ysganhua.content({}, { source, player: target, num: 1 }, source);
	equal(target.identity, "fan", "内奸来源不应伪造招降");
	equal(target.choices.length, 1, "不支持时不应询问目标");
	equal(source.choices.length, 1, "不支持时不应弹出变身选择");
	equal(source.name1, "月神高斯", "不支持时不应切换形态");
});

await check("感化：加入失败不发言、不判胜、不视为拒绝", async () => {
	_status.mode = "identity";
	resetCalls();
	const shared = skills.ysganhua.shared;
	const originalJoin = shared.join;
	const source = makePlayer({ identity: "fan", identityShown: true, choices: [true] });
	const target = makePlayer({ name: "迪迦", identity: "zhong", skills: [], choices: [true] });
	game.players = [source, target];
	game.zhu = makePlayer({ name: "佐菲", identity: "zhu", skills: [] });
	shared.join = async () => ({ ok: false, changed: false });
	try {
		await skills.ysganhua.content({}, { source, player: target, num: 1 }, source);
	} finally {
		shared.join = originalJoin;
	}
	equal(target.identity, "zhong", "失败时不改身份");
	equal(target.chats.length, 0, "失败时不发言");
	equal(source.choices.length, 1, "失败时不弹出变身选择");
	equal(game.checkResultCalls, 0, "失败时不判胜");
});

await check("感化：斗地主地主/农民高斯都跳过招降，只由高斯选择变身", async () => {
	_status.mode = "doudizhu";
	for (const identity of ["zhu", "fan"]) {
		resetCalls();
		const source = makePlayer({ identity, choices: [false] });
		const target = makePlayer({ name: "农民", identity: "fan", skills: [], choices: [true] });
		game.players = [source, target];
		game.zhu = identity === "zhu" ? source : makePlayer({ name: "另一个地主", identity: "zhu", skills: [] });
		game.players.push(game.zhu);
		await skills.ysganhua.content({}, { source, player: target, num: 1 }, source);
		equal(target.choices.length, 1, `${identity}: 不应询问地主/农民目标`);
		equal(target.identity, "fan", `${identity}: 身份不得改变`);
		equal(target.side, undefined, `${identity}: 不得写入阵营`);
		equal(source.choices.length, 0, `${identity}: 应直接询问高斯是否变身`);
		equal(source.name1, "月神高斯", `${identity}: 玩家选择不变身时应保留月神`);
	}
});

await check("感化：身份模式主公阵营招降调用本体胜负检查", async () => {
	_status.mode = "identity";
	resetCalls();
	const source = makePlayer({ identity: "zhu", identityShown: true });
	const target = makePlayer({ name: "迪迦", identity: "fan", skills: [], choices: [true] });
	game.players = [source, target];
	game.zhu = source;
	await skills.ysganhua.content({}, { source, player: target, num: 1 }, source);
	equal(target.identity, "zhong", "应变为忠臣");
	equal(game.checkResultCalls, 1, "应调用 game.checkResult");
});

await check("感化：侧阵营最后一名敌人加入后按本体 side 判胜", async () => {
	_status.mode = "versus";
	resetCalls();
	const source = makePlayer({ identity: "zhu", side: true });
	const target = makePlayer({ name: "迪迦", identity: "zhong", side: false, skills: [], choices: [true] });
	game.players = [source, target];
	game.me = source;
	await skills.ysganhua.content({}, { source, player: target, num: 1 }, source);
	equal(target.side, true, "side 应变更");
	equal(game.overCalls.length, 1, "最后一名敌人加入后应判胜");
	equal(game.overCalls[0], true, "本机应与新阵营同胜");
});

await check("感化：国战势力与身份同步并调用 tryResult", async () => {
	_status.mode = "guozhan";
	resetCalls();
	const source = makePlayer({ identity: "wei", identityShown: true, group: "wei" });
	const target = makePlayer({ name: "迪迦", identity: "shu", identityShown: true, group: "shu", skills: [], choices: [true] });
	game.players = [source, target];
	await skills.ysganhua.content({}, { source, player: target, num: 1 }, source);
	equal(target.identity, "wei", "阵营身份应同步");
	equal(target.group, "wei", "势力应同步");
	equal(game.tryResultCalls, 1, "应调用国战 tryResult");
});

await check("感化 AI：劣势独狼会投降，强势与接近局不投降", () => {
	_status.mode = "versus";
	const shared = skills.ysganhua.shared;
	const strongCards = [tao, tao, tao, tao, tao];
	const strongEquip = [tao, tao];
	const makeStrong = (name, side) => makePlayer({ name, side, hand: strongCards, equipment: strongEquip });
	const source = makeStrong("月神高斯", true);
	const lone = makePlayer({ name: "独狼", side: false, hp: 1, hand: [], skills: [] });
	game.players = [source, lone];
	assert(shared.shouldJoin(source, lone), "孤立濒危敌人应投降");
	const ally = makeStrong("高斯盟友", true);
	const enemyAlly = makeStrong("敌方大将", false);
	const oneHpEnemy = makePlayer({ name: "一血敌人", side: false, hp: 1, hand: [], skills: [] });
	game.players = [makePlayer({ name: "月神高斯", side: true, hp: 2, hand: [tao], skills: ["ysmanyue", "ysganhua"] }), ally, oneHpEnemy, enemyAlly];
	assert(!shared.shouldJoin(game.players[0], oneHpEnemy), "己方明显领先时不应只因一血投降");
	const closeSource = makePlayer({ name: "月神高斯", side: true, hp: 4, hand: [tao, tao] });
	const closeTarget = makePlayer({ name: "敌人", side: false, hp: 4, hand: [tao, tao], skills: [] });
	game.players = [closeSource, closeTarget];
	assert(!shared.shouldJoin(closeSource, closeTarget), "实力接近时应保持原阵营");
	const losingSource = makePlayer({ name: "月神高斯", side: true, hp: 2, hand: [], skills: ["ysmanyue", "ysganhua"] });
	const strongTarget = makePlayer({ name: "强敌", side: false, hp: 4, hand: [tao, tao, tao], equipment: [tao], skills: ["a", "b", "c"] });
	const strongTargetAlly = makeStrong("强敌援军", false);
	game.players = [losingSource, strongTarget, strongTargetAlly];
	assert(!shared.shouldJoin(losingSource, strongTarget), "高斯阵营明显败局时敌人应拒绝");
	assert(shared.shouldJoin(source, makePlayer({ name: "同阵营", side: true, hp: 3, skills: [] })), "同阵营应接受");
});

await check("满月 AI：治疗有招降价值的敌人，不治疗无价值目标", () => {
	_status.mode = "versus";
	const shared = skills.ysganhua.shared;
	const source = makePlayer({
		name: "月神高斯",
		side: true,
		hand: [sha, sha, tao],
		equipment: [tao, tao],
	});
	const target = makePlayer({ name: "濒危敌人", side: false, hp: 2, hand: [], skills: [] });
	game.players = [source, target];
	const value = shared.getRecruitTargetValue(source, target);
	assert(value > 0, "有招降价值的敌人应被识别");
	const playerUse = skills.ysmanyue.ai.effect.player_use(tao, source, target);
	assert(Array.isArray(playerUse) && playerUse.length === 4 && playerUse[1] > 0 && playerUse[3] < 0, "使用路径应同时提高来源收益并压低目标治疗收益");
	const normalEffect = skills.ysmanyue.ai.effect.player(tao, source, target);
	assert(Array.isArray(normalEffect) && normalEffect.length === 4 && normalEffect[1] > 0 && normalEffect[3] < 0, "普通效果路径应返回同一组招降权重");
	equal(skills.ysmanyue.ai.effect.target, undefined, "来源技能不提供 target 回调，避免依赖本不会调用的路径");
	_status.event = { player: source };
	const score = skills.ysmanyue.chooseButton.check({ link: [null, null, "tao"] });
	assert(score > 10, "招降价值应提高转换桃的 AI 权重");
	const weakSource = makePlayer({ name: "月神高斯", side: true, hp: 4, hand: [], skills: ["ysmanyue", "ysganhua"] });
	const strongEnemy = makePlayer({ name: "强势敌人", side: false, hp: 4, hand: [tao, tao, tao], skills: [] });
	const enemyAlly = makePlayer({ name: "敌方援军", side: false, hp: 4, hand: [tao, tao, tao], skills: [] });
	game.players = [weakSource, strongEnemy, enemyAlly];
	equal(shared.getRecruitTargetValue(weakSource, strongEnemy), 0, "败局敌人不应被视为可招降");
	equal(skills.ysmanyue.ai.effect.player_use(tao, weakSource, strongEnemy), undefined, "败局不应给出使用加权");
	equal(skills.ysmanyue.ai.effect.player(tao, weakSource, strongEnemy), undefined, "败局不应给出普通效果加权");
	_status.event = { player: weakSource };
	const weakScore = skills.ysmanyue.chooseButton.check({ link: [null, null, "tao"] });
	equal(weakScore, 0, "月神满血且无友方受伤时不应主动治疗无招降价值敌人");
});

await check("感化 AI：变身判断不会无条件切换，也不会永远拒绝", () => {
	_status.mode = "doudizhu";
	const shared = skills.ysganhua.shared;
	const weakSource = makePlayer({ name: "月神高斯", identity: "fan", hp: 1, hand: [], skills: ["ysmanyue", "ysganhua"] });
	const strongEnemy = makePlayer({ name: "地主", identity: "zhu", hp: 4, hand: [tao, tao], skills: [] });
	game.players = [weakSource, strongEnemy];
	assert(shared.shouldTransform(weakSource, strongEnemy), "斗地主危险局势应倾向变身");
	const safeSource = makePlayer({ name: "月神高斯", identity: "fan", hp: 4, hand: [], skills: ["ysmanyue", "ysganhua"] });
	const weakEnemy = makePlayer({ name: "地主", identity: "zhu", hp: 1, hand: [], skills: [] });
	game.players = [safeSource, weakEnemy];
	assert(!shared.shouldTransform(safeSource, weakEnemy), "斗地主优势局不应无脑变身");
	_status.mode = "versus";
	const source = makePlayer({ name: "月神高斯", side: true, hp: 4, hand: [tao, tao], skills: ["ysmanyue", "ysganhua"] });
	const target = makePlayer({ name: "拒绝者", side: false, hp: 1, hand: [], skills: [] });
	const enemy2 = makePlayer({ name: "敌人二", side: false, hp: 1, hand: [], skills: [] });
	const enemy3 = makePlayer({ name: "敌人三", side: false, hp: 1, hand: [], skills: [] });
	game.players = [source, target, enemy2, enemy3];
	assert(!shared.shouldTransform(source, target), "多个可招降敌人且优势明显时应保留月神");
	const losingSource = makePlayer({ name: "月神高斯", side: true, hp: 1, hand: [], skills: ["ysmanyue", "ysganhua"] });
	const losingEnemy = makePlayer({ name: "敌军", side: false, hp: 4, hand: [tao, tao, tao], skills: [] });
	game.players = [losingSource, losingEnemy];
	assert(shared.shouldTransform(losingSource, losingEnemy), "劣势局应倾向变身");
});

await check("感化：侧阵营尚有敌人时不提前结束", async () => {
	_status.mode = "versus";
	resetCalls();
	const source = makePlayer({ identity: "zhu", side: true });
	const target = makePlayer({ name: "迪迦", identity: "zhong", side: false, skills: [], choices: [true] });
	const enemy = makePlayer({ name: "赛文", identity: "zhong", side: false, skills: [] });
	game.players = [source, target, enemy];
	game.me = source;
	await skills.ysganhua.content({}, { source, player: target, num: 1 }, source);
	equal(target.side, true, "目标应加入");
	equal(enemy.side, false, "第三人仍敌对");
	equal(game.overCalls.length, 0, "尚有敌人时不应判胜");
});

await check("感化：目标内奸可以改投，目标特殊身份不伪造转换", async () => {
	_status.mode = "identity";
	resetCalls();
	const source = makePlayer({ identity: "fan", identityShown: true });
	const nei = makePlayer({ name: "内奸", identity: "nei", skills: [], choices: [true] });
	game.players = [source, nei];
	game.zhu = makePlayer({ name: "佐菲", identity: "zhu", skills: [] });
	await skills.ysganhua.content({}, { source, player: nei, num: 1 }, source);
	equal(nei.identity, "fan", "目标内奸应实际改投反贼");
	const specialSource = makePlayer({ identity: "fan", identityShown: true, choices: [true] });
	const specialTarget = makePlayer({ name: "贼首", identity: "zhong", special_identity: "identity_zeishou", skills: [], choices: [true] });
	game.players = [specialSource, specialTarget];
	await skills.ysganhua.content({}, { source: specialSource, player: specialTarget, num: 1 }, specialSource);
	equal(specialTarget.identity, "zhong", "特殊身份目标不得伪造转换");
	equal(specialTarget.choices.length, 1, "特殊身份目标不应被询问");
	equal(specialSource.choices.length, 1, "不支持时不应弹出变身选择");
});

await check("感化：存在替补/后续波次时侧阵营转换被禁用", async () => {
	_status.mode = "versus";
	_status.replacelist = ["替补"];
	resetCalls();
	const source = makePlayer({ identity: "zhu", side: true, choices: [true] });
	const target = makePlayer({ name: "迪迦", identity: "zhong", side: false, skills: [], choices: [true] });
	game.players = [source, target];
	game.me = source;
	await skills.ysganhua.content({}, { source, player: target, num: 1 }, source);
	delete _status.replacelist;
	equal(target.side, false, "有替补时不得改阵营");
	equal(target.choices.length, 1, "有替补时不应询问目标");
	equal(source.choices.length, 1, "有替补时不应视为拒绝并弹出变身");
	equal(game.overCalls.length, 0, "有替补时不得提前判胜");
});

await check("感化：国战未完全亮将或身份未公开时不伪造转换", async () => {
	_status.mode = "guozhan";
	resetCalls();
	const source = makePlayer({ identity: "wei", identityShown: true, group: "wei", choices: [true] });
	const target = makePlayer({ name: "迪迦", identity: "shu", identityShown: true, group: "shu", unseen: [true, false], choices: [true] });
	game.players = [source, target];
	await skills.ysganhua.content({}, { source, player: target, num: 1 }, source);
	equal(target.identity, "shu", "未亮将目标不得改阵营");
	equal(target.choices.length, 1, "不支持时不应询问目标");
	equal(source.choices.length, 1, "不支持时不应弹出变身选择");
	equal(game.tryResultCalls, 0, "未转换时不应判胜");
});

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
	const match = source.match(new RegExp(`\\n\\t+${name}\\(`));
	const start = match ? match.index : -1;
	if (start < 0) throw new Error(`本体缺少 ${name}`);
	const open = source.indexOf("{", start);
	const close = findMatchingBrace(source, open);
	if (close < 0) throw new Error(`无法定位 ${name} 的方法体`);
	const method = source.slice(start + 1, close + 1);
	const cache = {
		delegate(value) {
			return value;
		},
		get: {
			attitude: (...args) => get.attitude(...args),
			effect: () => 0,
		},
	};
	const CacheContext = {
		requireCacheContext() {
			return cache;
		},
	};
	return new Function(
		"get",
		"game",
		"lib",
		"_status",
		"ui",
		"CacheContext",
		`return (function ${method});`,
	)(get, game, lib, _status, ui, CacheContext);
}

await check("满月 AI：本体 effect_use/effect 实际调用招降权重", () => {
	_status.mode = "versus";
	const hostFile = path.join(root, "..", "..", "src", "noname", "get", "index.js");
	if (!fs.existsSync(hostFile)) {
		console.log("  skip 本体源码不存在，无法验证 AI 调用路径");
		return;
	}
	const contentFile = path.join(root, "..", "..", "src", "noname", "library", "element", "content.ts");
	const contentSource = fs.readFileSync(contentFile, "utf8");
	assert(contentSource.includes('next.set("ai", event.ai || get.effect_use);'), "本体使用牌目标选择应走 get.effect_use");
	const hostSource = fs.readFileSync(hostFile, "utf8");
	const effectUse = loadHostMethod(hostSource, "effect_use");
	const effect = loadHostMethod(hostSource, "effect");
	const originalAttitude = get.attitude;
	get.attitude = (from, to) => {
		if (from === to) return 1;
		if (typeof from?.side === "boolean" && typeof to?.side === "boolean" && from.side !== to.side) return -4;
		return originalAttitude(from, to);
	};
	const source = makePlayer({ name: "月神高斯", side: true, hand: [sha, sha, tao], equipment: [tao, tao] });
	const target = makePlayer({ name: "濒危敌人", side: false, hp: 2, hand: [], skills: [] });
	game.players = [source, target];
	_status.event = { player: source, skill: "ysmanyue_backup" };
	const converted = { name: "tao", type: "basic", suit: "heart", number: 3, color: "red", tags: {}, cards: [shandian], isCard: false };
	const originalUse = skills.ysmanyue.ai.effect.player_use;
	const originalPlayer = skills.ysmanyue.ai.effect.player;
	let useCalls = 0;
	let playerCalls = 0;
	let targetCalls = 0;
	skills.ysmanyue.ai.effect.player_use = function (...args) {
		useCalls++;
		return originalUse.apply(this, args);
	};
	skills.ysmanyue.ai.effect.player = function (...args) {
		playerCalls++;
		return originalPlayer.apply(this, args);
	};
	lib.skill.__gauss_probe = {
		ai: {
			effect: {
				target() {
					targetCalls++;
				},
			},
		},
	};
	source.skills.push("__gauss_probe");
	try {
		const physicalUse = effectUse(target, tao, source, source);
		const convertedUse = effectUse(target, converted, source, source);
		const normal = effect(target, tao, source, source);
		assert(useCalls >= 2, "本体 effect_use 应调用来源技能 player_use");
		equal(playerCalls, 1, "本体 effect 应调用来源技能 effect.player");
		assert(physicalUse > 0, "普通桃经本体 effect_use 应得到正收益");
		assert(convertedUse > 0, "满月转换桃经本体 effect_use 应得到正收益");
		assert(normal > 0, "普通桃经本体 effect 应得到正收益");
		equal(targetCalls, 0, "本体不会读取来源技能的 effect.target，招降权重不能放在这里");
	} finally {
		source.skills.pop();
		delete lib.skill.__gauss_probe;
		skills.ysmanyue.ai.effect.player_use = originalUse;
		skills.ysmanyue.ai.effect.player = originalPlayer;
		get.attitude = originalAttitude;
	}
	const weakSource = makePlayer({ name: "月神高斯", side: true, hp: 4, hand: [], skills: ["ysmanyue", "ysganhua"] });
	const strongEnemy = makePlayer({ name: "强势敌人", side: false, hp: 4, hand: [tao, tao, tao], skills: [] });
	const enemyAlly = makePlayer({ name: "敌方援军", side: false, hp: 4, hand: [tao, tao, tao], skills: [] });
	game.players = [weakSource, strongEnemy, enemyAlly];
	_status.event = { player: weakSource, skill: "ysmanyue_backup" };
	assert(effectUse(strongEnemy, tao, weakSource, weakSource) <= 0, "无招降价值时本体 effect_use 不应鼓励治疗敌人");
	assert(effect(strongEnemy, tao, weakSource, weakSource) <= 0, "无招降价值时本体 effect 不应鼓励治疗敌人");
});

function loadSaveFilterTarget(source) {
	const saveStart = source.indexOf("async _save(");
	if (saveStart < 0) return null;
	const saveOpen = source.indexOf("{", saveStart);
	const saveClose = findMatchingBrace(source, saveOpen);
	if (saveClose < 0) return null;
	const saveSource = source.slice(saveStart, saveClose + 1);
	const marker = "filterTarget(card, player, target) {";
	const start = saveSource.indexOf(marker);
	if (start < 0) return null;
	const open = saveSource.indexOf("{", start);
	const close = findMatchingBrace(saveSource, open);
	if (close < 0) return null;
	const method = saveSource.slice(start, close + 1);
	return new Function("get", "game", "ui", "_status", "lib", `return (function ${method});`)(get, game, ui, _status, lib);
}

let hostTargetChain;
function installHostTargetChain() {
	if (hostTargetChain) return hostTargetChain;
	const src = path.join(root, "..", "..", "src", "noname");
	const gameFile = path.join(src, "game", "index.js");
	const libFile = path.join(src, "library", "index.js");
	const getFile = path.join(src, "get", "index.js");
	if (!fs.existsSync(gameFile) || !fs.existsSync(libFile) || !fs.existsSync(getFile)) return null;
	const checkMod = loadHostMethod(fs.readFileSync(gameFile, "utf8"), "checkMod");
	const selectTarget = loadHostMethod(fs.readFileSync(libFile, "utf8"), "selectTarget");
	const targetEnabled = loadHostMethod(fs.readFileSync(libFile, "utf8"), "targetEnabled");
	const select = loadHostMethod(fs.readFileSync(getFile, "utf8"), "select");
	game.checkMod = checkMod;
	lib.filter.selectTarget = selectTarget;
	lib.filter.targetEnabled = targetEnabled;
	get.select = select;
	hostTargetChain = { checkMod, selectTarget, targetEnabled, select };
	return hostTargetChain;
}

await check("满月：本体 selectTarget 链路把普通/转换桃限制为单目标", () => {
	_status.mode = "versus";
	const chain = installHostTargetChain();
	if (!chain) {
		console.log("  skip 本体源码不存在，无法验证目标数量链路");
		return;
	}
	const playerFile = path.join(root, "..", "..", "src", "noname", "library", "element", "player.js");
	assert(fs.readFileSync(playerFile, "utf8").includes("next.selectTarget = lib.filter.selectTarget;"), "chooseToUse 应默认使用 lib.filter.selectTarget");
	game.zhu = null;
	game.friendZhu = null;
	game.enemyZhu = null;
	game.boss = null;
	const source = makePlayer({ name: "月神高斯", side: true, hp: 2, hand: [tao], skills: ["ysmanyue", "ysganhua"] });
	const ally = makePlayer({ name: "友方", side: true, hp: 2, hand: [], skills: [] });
	const enemy = makePlayer({ name: "敌方", side: false, hp: 2, hand: [], skills: [] });
	game.players = [source, ally, enemy];
	const converted = { name: "tao", type: "basic", suit: "heart", number: 3, color: "red", tags: {}, cards: [shandian], isCard: false };
	for (const [label, card] of [
		["普通桃", tao],
		["转换桃", converted],
	]) {
		_status.event = { name: "chooseToUse", type: "phase", player: source, _get_card: card, selectTarget: lib.filter.selectTarget };
		const range = get.select(_status.event.selectTarget);
		equal(range[0], 1, `${label} 目标下限应为1`);
		equal(range[1], 1, `${label} 目标上限应为1`);
	}
	for (const [label, target] of [
		["自己", source],
		["友方", ally],
		["敌方", enemy],
	]) {
		assert(chain.targetEnabled.call(lib.filter, converted, source, target), `${label}受伤时应可选`);
	}
	const healthyEnemy = makePlayer({ name: "健康敌人", side: false, hp: 4, hand: [], skills: [] });
	game.players.push(healthyEnemy);
	assert(!chain.targetEnabled.call(lib.filter, converted, source, healthyEnemy), "未受伤敌人不应可选");
	const dying = makePlayer({ name: "濒死角色", side: true, hp: 0, hand: [], skills: [] });
	game.players.push(dying);
	_status.event = { name: "chooseToUse", type: "dying", player: source, dying, _get_card: converted, selectTarget: lib.filter.selectTarget };
	const dyingRange = get.select(_status.event.selectTarget);
	equal(dyingRange[0], -1, "濒死救援保留本体目标下限");
	equal(dyingRange[1], -1, "濒死救援保留本体目标上限");
	const contentSource = fs.readFileSync(path.join(root, "..", "..", "src", "noname", "library", "element", "content.ts"), "utf8");
	const saveFilter = loadSaveFilterTarget(contentSource);
	assert(saveFilter, "应能读取本体濒死救援 filterTarget");
	ui.selected = { targets: [] };
	assert(saveFilter(converted, source, dying), "濒死目标应可被桃救援");
	assert(!saveFilter(converted, source, ally), "濒死救援不应选择友方");
	assert(!saveFilter(converted, source, enemy), "濒死救援不应选择敌方");
});

await check("满月：三名受伤角色只回复被选中者，感化只跟该目标", async () => {
	_status.mode = "versus";
	const chain = installHostTargetChain();
	if (!chain) {
		console.log("  skip 本体源码不存在，无法验证目标数量链路");
		return;
	}
	game.zhu = null;
	game.friendZhu = null;
	game.enemyZhu = null;
	game.boss = null;
	const source = makePlayer({ name: "月神高斯", side: true, hp: 2, hand: [tao], skills: ["ysmanyue", "ysganhua"] });
	const ally = makePlayer({ name: "友方", side: true, hp: 2, hand: [], skills: [] });
	const enemy = makePlayer({ name: "敌方", side: false, hp: 2, hand: [], skills: [] });
	game.players = [source, ally, enemy];
	const converted = { name: "tao", type: "basic", suit: "heart", number: 3, color: "red", tags: {}, cards: [shandian], isCard: false };
	_status.event = { name: "chooseToUse", type: "phase", player: source, _get_card: converted, selectTarget: lib.filter.selectTarget };
	const range = get.select(_status.event.selectTarget);
	equal(range[0], 1, "三名受伤角色时目标下限为1");
	equal(range[1], 1, "三名受伤角色时目标上限为1");
	for (const selected of [source, ally, enemy]) {
		let recoverAfterTargets = [];
		let ganhuaTargets = [];
		for (const current of game.players) {
			current.recoverCalls.length = 0;
			current.onRecover = current => {
				recoverAfterTargets.push(current);
				if (skills.ysganhua.filter({ source, player: current, num: 1 }, source)) ganhuaTargets.push(current);
			};
		}
		await lib.card.tao.content({ target: selected, card: converted, cards: [shandian] }, null, source);
		equal(selected.recoverCalls.length, 1, `${selected.name} 应回复一次`);
		for (const other of game.players.filter(current => current !== selected)) {
			equal(other.recoverCalls.length, 0, `${other.name} 不应被自动治疗`);
		}
		equal(recoverAfterTargets.length, 1, "只应产生一个 recoverAfter");
		equal(recoverAfterTargets[0], selected, "recoverAfter 应只指向被选中者");
		if (selected === source) {
			equal(ganhuaTargets.length, 0, "自己回复不应触发感化");
		} else {
			equal(ganhuaTargets.length, 1, "被选中的其他角色应只触发一次感化");
			equal(ganhuaTargets[0], selected, "感化应只指向被选中者");
		}
	}
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
