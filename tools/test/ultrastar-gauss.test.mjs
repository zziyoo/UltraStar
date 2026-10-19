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
	const card = {
		name,
		suit,
		number,
		type,
		color,
		tags,
		gaintag: [],
		node: { gaintag: { innerHTML: "" } },
		classList: {
			values: new Set(),
			add(...classes) {
				classes.forEach(className => this.values.add(className));
			},
			remove(...classes) {
				classes.forEach(className => this.values.delete(className));
			},
			contains(className) {
				return this.values.has(className);
			},
		},
		updateGaintagNode() {
			this.node.gaintag.innerHTML = this.gaintag.map(tag => get.translation(tag)).join(" ");
		},
		addGaintag(tag) {
			if (Array.isArray(tag)) this.gaintag = tag.slice();
			else if (!this.gaintag.includes(tag)) this.gaintag.push(tag);
			this.updateGaintagNode();
		},
		removeGaintag(tag) {
			if (tag === true) this.gaintag = [];
			else this.gaintag = this.gaintag.filter(item => item !== tag);
			this.updateGaintagNode();
		},
		hasGaintag(tag) {
			return this.gaintag.includes(tag);
		},
	};
	return card;
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
	cardPile: { childNodes: [] },
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
	owner(card) {
		for (const player of game.players) {
			if (player.getCards("hejsx").includes(card)) return player;
		}
		return null;
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
Object.assign(lib.translate, skillTranslate, { other_skill_tag: "其他技能标记" });

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
		aiChoice: options.aiChoice ?? false,
		aiResults: [],
		drawCalls: [],
		gainCalls: [],
		gaintagCalls: [],
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
			if (position === "hejsx") return [...this.hand, ...this.equipment, ...this.judge];
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
		async gain(cards, animate) {
			const list = Array.isArray(cards) ? cards : (cards?.cards ?? []);
			const gained = list.slice();
			for (const card of gained) {
				if (!this.hand.includes(card)) this.hand.push(card);
			}
			this.gainCalls.push({ cards: gained, animate });
			return gained;
		},
		addGaintag(cards, tag) {
			const list = Array.isArray(cards) ? cards : [cards];
			const owned = this.getCards("hejsx");
			for (const card of list) {
				if (owned.includes(card)) card.addGaintag(tag);
			}
			this.gaintagCalls.push({ cards: list, tag, action: "add" });
		},
		removeGaintag(tag, cards) {
			const list = cards ? (Array.isArray(cards) ? cards : [cards]) : this.getCards("h");
			for (const card of list) card.removeGaintag(tag);
			this.gaintagCalls.push({ cards: list, tag, action: "remove" });
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
			for (const item of list) {
				if (!this.skills.includes(item)) continue;
				this.skills = this.skills.filter(current => current !== item);
				lib.skill[item]?.onremove?.(this, item);
			}
		},
		async addSkills(skill) {
			const list = Array.isArray(skill) ? skill : [skill];
			for (const item of list) {
				if (!this.skills.includes(item)) this.skills.push(item);
				lib.skill[item]?.init2?.(this, item);
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
				ai: undefined,
				set(key, value) {
					if (key === "source" || key === "ai") this[key] = value;
					return this;
				},
				getParent() {
					return undefined;
				},
				async forResult() {
					_status.event = this;
					if (this.player.aiChoice) {
						const result = Boolean(this.ai?.(this.getParent(), this.player));
						this.player.aiResults.push({ prompt: this.prompt, result });
						return { bool: result };
					}
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

await check("技能描述与当前规格一致", () => {
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
		"锁定技，你使用的：红色牌额外结算一次；黑色牌无法响应；红心牌无视防具；方块牌无距离限制；黑桃牌造成的伤害+1；梅花牌不计入次数且无次数限制。准备阶段，若你手牌中的伤害牌与非伤害牌数量不相等，你随机从牌堆中获得数量较少类别的牌，直至两类牌数量相等或牌堆中没有符合条件的牌。",
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
	equal(target.chats.join(""), "但是我拒绝", "拒绝加入阵营时目标应发言");
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

function resetRecruitState(mode = "versus") {
	_status.mode = mode;
	_status.over = false;
	game.players = [];
	game.zhu = null;
	game.friendZhu = null;
	game.enemyZhu = null;
	game.boss = null;
	game.me = null;
	for (const key of ["replacelist", "enemyreplacelist", "additionallist", "mylist", "enemylist"]) delete _status[key];
}
function repeatCard(count) {
	return Array.from({ length: count }, () => tao);
}

await check("感化 AI：残局与治疗预测共用纯计算核心", () => {
	const shared = skills.ysganhua.shared;
	const rows = [];

	resetRecruitState();
	let source = makePlayer({ name: "月神高斯", side: true, hp: 4, hand: [tao] });
	let ally1 = makePlayer({ name: "友方1", side: true, hp: 3, skills: ["a", "b"] });
	let ally2 = makePlayer({ name: "友方2", side: true, hp: 3, skills: ["a"] });
	let target = makePlayer({ name: "敌人", side: false, hp: 1, hand: [], skills: [] });
	game.players = [source, ally1, ally2, target];
	game.me = source;
	let analysis = shared.evaluateSurrender(source, target, false);
	let recruit = shared.getRecruitTargetValue(source, target);
	assert(analysis.endgameConfirmed, "3v1 应确认加入后结束战斗");
	assert(analysis.endgameBonus > 0, "3v1 明显领先应获得残局加分");
	assert(analysis.score >= 0.62 && analysis.powerEdge >= 0.5, "3v1 评分应过线");
	assert(shared.shouldJoin(source, target), "3v1 最后敌人应接受");
	assert(recruit > 0, "3v1 治疗预测应识别为可招降");
	assert(Array.isArray(skills.ysmanyue.shared.recruitEffect(tao, source, target)), "3v1 应给治疗 AI 四元组招降加权");
	rows.push(["3v1", analysis, true]);

	resetRecruitState();
	source = makePlayer({ name: "月神高斯", side: true, hp: 4, hand: [tao] });
	ally1 = makePlayer({ name: "友方1", side: true, hp: 3, skills: ["a", "b"] });
	target = makePlayer({ name: "敌人", side: false, hp: 1, hand: [], skills: [] });
	game.players = [source, ally1, target];
	game.me = source;
	analysis = shared.evaluateSurrender(source, target, false);
	recruit = shared.getRecruitTargetValue(source, target);
	assert(analysis.endgameBonus > 0, "2v1 明显领先应获得残局加分");
	assert(shared.shouldJoin(source, target), "2v1 最后敌人应接受");
	assert(recruit > 0, "2v1 治疗预测应识别为可招降");
	rows.push(["2v1", analysis, true]);

	resetRecruitState();
	source = makePlayer({ name: "月神高斯", side: true, hp: 4, hand: [tao] });
	target = makePlayer({ name: "敌人", side: false, hp: 1, hand: [], skills: [] });
	game.players = [source, target];
	game.me = source;
	analysis = shared.evaluateSurrender(source, target, false);
	recruit = shared.getRecruitTargetValue(source, target);
	assert(analysis.endgameBonus > 0, "1v1 敌人回复后仍落后应获得残局加分");
	assert(shared.shouldJoin(source, target), "1v1 敌人回复后仍落后应接受");
	assert(recruit > 0, "1v1 治疗预测应识别为可招降");
	rows.push(["1v1 落后", analysis, true]);

	resetRecruitState();
	source = makePlayer({ name: "月神高斯", side: true, hp: 1, hand: [], skills: ["ysmanyue", "ysganhua"] });
	target = makePlayer({ name: "强敌", side: false, hp: 3, hand: repeatCard(3), equipment: repeatCard(3), skills: ["a", "b", "c"] });
	game.players = [source, target];
	game.me = source;
	analysis = shared.evaluateSurrender(source, target, false);
	recruit = shared.getRecruitTargetValue(source, target);
	assert(analysis.endgameConfirmed, "1v1 强敌也属于可确认的残局");
	equal(analysis.endgameBonus, 0, "高斯阵营不占优时不得获得残局加分");
	assert(analysis.score < 0.62 && analysis.powerEdge < 0.5, "1v1 强敌评分应低于阈值");
	assert(!shared.shouldJoin(source, target), "1v1 强敌应拒绝");
	equal(recruit, 0, "明显拒绝的目标不应被治疗 AI 预判为可招降");
	equal(skills.ysmanyue.shared.recruitEffect(tao, source, target), undefined, "明显拒绝的目标不应获得治疗 AI 加权");
	rows.push(["1v1 强敌", analysis, false]);

	resetRecruitState();
	source = makePlayer({ name: "月神高斯", side: true, hp: 3, skills: ["ysmanyue", "ysganhua"] });
	ally1 = makePlayer({ name: "友方1", side: true, hp: 3, skills: ["a"] });
	ally2 = makePlayer({ name: "友方2", side: true, hp: 3, skills: ["a"] });
	target = makePlayer({ name: "敌人", side: false, hp: 3, skills: ["a"] });
	const enemy2 = makePlayer({ name: "敌人2", side: false, hp: 3, skills: ["a"] });
	const enemy3 = makePlayer({ name: "敌人3", side: false, hp: 3, skills: ["a"] });
	game.players = [source, ally1, ally2, target, enemy2, enemy3];
	game.me = source;
	analysis = shared.evaluateSurrender(source, target, false);
	assert(!analysis.endgameConfirmed, "3v3 目标仍有同阵营角色，不得触发残局");
	equal(analysis.endgameBonus, 0, "3v3 不得套用残局加分");
	assert(analysis.score < 0.62, "3v3 接近局评分不应过线");
	assert(!shared.shouldJoin(source, target), "3v3 接近局不应无理由投降");
	equal(shared.getRecruitTargetValue(source, target), 0, "3v3 接近局不应鼓励治疗招降");
	rows.push(["3v3 接近", analysis, false]);

	resetRecruitState();
	source = makePlayer({ name: "月神高斯", side: true, hp: 4, skills: ["ysmanyue", "ysganhua"] });
	ally1 = makePlayer({ name: "友方1", side: true, hp: 3, skills: ["a"] });
	target = makePlayer({ name: "敌人", side: false, hp: 1, skills: [], hand: [] });
	const strongAlly = makePlayer({ name: "强敌援军", side: false, hp: 4, hand: repeatCard(3), equipment: repeatCard(3), skills: ["a", "b", "c"] });
	game.players = [source, ally1, target, strongAlly];
	game.me = source;
	analysis = shared.evaluateSurrender(source, target, false);
	assert(!analysis.endgameConfirmed, "目标仍有强力队友时不得确认残局");
	equal(analysis.endgameBonus, 0, "目标有强力队友时不得套用残局加分");
	assert(!shared.shouldJoin(source, target), "目标有强力队友时不应投降");
	equal(shared.getRecruitTargetValue(source, target), 0, "目标有强力队友时不应鼓励治疗招降");
	rows.push(["有强力队友", analysis, false]);

	resetRecruitState();
	source = makePlayer({ name: "月神高斯", side: true, hp: 4, hand: [tao] });
	target = makePlayer({ name: "敌人", side: false, hp: 1, hand: [], skills: [] });
	game.players = [source, target];
	game.me = source;
	_status.replacelist = ["替补"];
	equal(shared.getJoinPlan(source, target), null, "有替补时不得给出加入计划");
	equal(shared.getRecruitTargetValue(source, target), 0, "有替补时不得给出治疗招降价值");
	assert(!shared.shouldJoin(source, target), "有替补时不得判定投降");
	const pendingEndgame = shared.getRecruitEndgameContext(source, target, { kind: "side", side: true, identity: "zhong", same: false });
	assert(!pendingEndgame.confirmed && pendingEndgame.bonus === 0, "有替补时不得触发残局加分");
	delete _status.replacelist;

	resetRecruitState("identity");
	source = makePlayer({ name: "月神高斯", identity: "zhong", identityShown: true, hp: 4, skills: ["ysmanyue", "ysganhua"] });
	const zhu = makePlayer({ name: "佐菲", identity: "zhu", isZhu: true, hp: 4, skills: [] });
	target = makePlayer({ name: "未亮身份", identity: "fan", hp: 2, hand: [], skills: [] });
	game.players = [source, zhu, target];
	game.zhu = zhu;
	game.me = source;
	const publicFan = shared.evaluateSurrender(source, target, false);
	const actualFan = shared.evaluateSurrender(source, target, true);
	const recruitFan = shared.getRecruitValue(source, target);
	assert(!publicFan.endgameConfirmed, "身份未公开时不得触发高斯侧残局加分");
	target.identity = "zhong";
	const publicZhong = shared.evaluateSurrender(source, target, false);
	const actualZhong = shared.evaluateSurrender(source, target, true);
	const recruitZhong = shared.getRecruitValue(source, target);
	equal(publicFan.score, publicZhong.score, "高斯侧预测不得因隐藏身份变化");
	equal(recruitFan, recruitZhong, "高斯侧招降预测不得读取隐藏身份");
	assert(actualFan.score !== actualZhong.score, "目标自身实际决策可以使用自己的身份");
	target.identity = "nei";
	const publicNei = shared.evaluateSurrender(source, target, false);
	const recruitNei = shared.getRecruitValue(source, target);
	equal(publicFan.score, publicNei.score, "隐藏内奸身份也不得改变高斯侧预测");
	equal(recruitFan, recruitNei, "隐藏内奸身份也不得改变招降预测");

	resetRecruitState("identity");
	source = makePlayer({ name: "月神高斯", identity: "zhong", identityShown: false, hp: 4, skills: ["ysmanyue", "ysganhua"] });
	const hiddenSourceZhu = makePlayer({ name: "佐菲", identity: "zhu", isZhu: true, hp: 4, skills: [] });
	target = makePlayer({ name: "已亮敌人", identity: "fan", identityShown: true, hp: 2, skills: [] });
	game.players = [source, hiddenSourceZhu, target];
	game.zhu = hiddenSourceZhu;
	game.me = source;
	const hiddenSourcePlan = shared.getJoinPlan(source, target);
	assert(hiddenSourcePlan, "身份模式仍应给出加入计划");
	const hiddenSourceActual = shared.evaluateSurrender(source, target, true);
	const hiddenSourceEndgame = shared.getRecruitEndgameContext(source, target, hiddenSourcePlan, { includePrivate: true });
	assert(!hiddenSourceActual.endgameConfirmed, "目标看不到高斯身份时不得确认残局");
	assert(!hiddenSourceEndgame.confirmed && hiddenSourceEndgame.bonus === 0, "目标看不到高斯身份时不得获得残局加分");

	resetRecruitState();
	source = makePlayer({ name: "月神高斯", side: true, hp: 4, hand: [tao] });
	target = makePlayer({ name: "敌人", side: false, hp: 2, hand: [tao], skills: [] });
	game.players = [source, target];
	game.me = source;
	const publicDefense = shared.evaluateSurrender(source, target, false);
	const actualDefense = shared.evaluateSurrender(source, target, true);
	const recruitDefense = shared.getRecruitValue(source, target);
	assert(Math.abs(publicDefense.survival - 0.5) > 1e-9, "公开生存压力不得再固定为0.5");
	target.hand = [sha];
	const publicAttack = shared.evaluateSurrender(source, target, false);
	const actualAttack = shared.evaluateSurrender(source, target, true);
	equal(publicDefense.score, publicAttack.score, "高斯侧预测不得读取隐藏手牌内容");
	equal(recruitDefense, shared.getRecruitValue(source, target), "高斯侧招降预测不得读取隐藏手牌内容");
	assert(actualDefense.score !== actualAttack.score, "目标实际决策可以使用自己的手牌信息");

	resetRecruitState();
	source = makePlayer({ name: "月神高斯", side: true, hp: 4, hand: [tao] });
	target = makePlayer({ name: "敌人", side: false, hp: 1, hand: repeatCard(3), skills: [] });
	game.players = [source, target];
	game.me = source;
	assert(shared.getRecruitTargetValue(source, target) > 0, "残局领先时隐藏防御牌不应让预测改判拒绝");
	assert(shared.shouldJoin(source, target), "残局领先且目标有隐藏防御牌时仍应接受");

	resetRecruitState();
	source = makePlayer({ name: "月神高斯", side: true, hp: 4, hand: [tao] });
	target = makePlayer({ name: "敌人", side: false, hp: 1, hand: [], skills: [] });
	game.players = [source, target];
	game.me = source;
	const projectedHp = shared.getProjectedHp(target, 1);
	equal(projectedHp, 2, "桃应按回复1点体力预测");
	equal(target.hp, 1, "预测不得临时修改目标体力");
	const predicted = shared.evaluateSurrender(source, target, false, { hp: projectedHp });
	const predictedRecruit = shared.getRecruitTargetValue(source, target);
	equal(target.hp, 1, "治疗预测后不得修改目标体力");
	assert(Math.abs(predictedRecruit - predicted.score) < 1e-9, "治疗 AI 应使用同一预测评分");
	target.hp = 2;
	const actual = shared.evaluateSurrender(source, target, true);
	assert(Math.abs(predicted.score - actual.score) < 1e-9, "信息一致时治疗前后评分应一致");
	equal(shared.shouldJoin(source, target), shared.isAcceptable(predicted), "治疗前后决策应一致");

	for (const [label, result, accepted] of rows) {
		console.log(
			`    ${label}: score=${result.score.toFixed(4)}, base=${result.baseScore.toFixed(4)}, powerEdge=${result.powerEdge.toFixed(4)}, endgame=${result.endgameBonus.toFixed(4)}, accept=${accepted}`,
		);
	}
});

await check("感化 AI：chooseBool 实际回调接受并在此后判胜", async () => {
	resetRecruitState();
	resetCalls();
	const source = makePlayer({ name: "月神高斯", side: true, hp: 4, hand: [tao] });
	const ally = makePlayer({ name: "友方", side: true, hp: 3, skills: ["a"] });
	const target = makePlayer({ name: "敌人", side: false, hp: 2, hand: [], skills: [], aiChoice: true });
	game.players = [source, ally, target];
	game.me = source;
	let sideAtVictory = null;
	const originalOver = game.over;
	game.over = function (result) {
		sideAtVictory = target.side;
		return originalOver.call(this, result);
	};
	try {
		await skills.ysganhua.content({}, { source, player: target, num: 1 }, source);
	} finally {
		game.over = originalOver;
	}
	equal(target.aiResults.length, 1, "应执行目标 chooseBool 的 AI 回调");
	equal(target.aiResults[0].result, true, "目标 AI 应接受");
	assert(target.aiResults[0].prompt.includes("加入"), "应执行加入阵营的 AI 回调");
	equal(target.side, true, "目标应实际加入");
	equal(target.chats.join(""), "其实，我早就找回奥特精神了", "加入后应发言");
	equal(game.overCalls.length, 1, "成功加入后应调用本体侧阵营胜负检查");
	equal(game.overCalls[0], true, "高斯应判定为胜方");
	equal(sideAtVictory, true, "胜负检查应发生在加入阵营之后");
	equal(game.checkResultCalls, 0, "侧阵营不应调用身份胜负检查");
});

await check("感化 AI：身份模式隐藏目标按自身信息决策并调用 checkResult", async () => {
	resetRecruitState("identity");
	resetCalls();
	const source = makePlayer({ name: "月神高斯", identity: "zhong", identityShown: true, hp: 4, skills: ["ysmanyue", "ysganhua"] });
	const zhu = makePlayer({ name: "佐菲", identity: "zhu", isZhu: true, hp: 4, skills: [] });
	const target = makePlayer({ name: "未亮身份", identity: "fan", hp: 1, hand: [], skills: [], aiChoice: true });
	game.players = [source, zhu, target];
	game.zhu = zhu;
	game.me = source;
	assert(skills.ysganhua.shared.getRecruitTargetValue(source, target) > 0, "高斯侧公开预测应认为治疗可招降");
	target.hp = 2;
	let identityAtVictory = null;
	const originalCheckResult = game.checkResult;
	game.checkResult = function () {
		identityAtVictory = target.identity;
		return originalCheckResult.call(this);
	};
	try {
		await skills.ysganhua.content({}, { source, player: target, num: 1 }, source);
	} finally {
		game.checkResult = originalCheckResult;
	}
	equal(target.aiResults.length, 1, "应执行目标 chooseBool 的 AI 回调");
	equal(target.aiResults[0].result, true, "目标应使用自身身份信息接受");
	equal(target.identity, "zhong", "目标应加入忠臣阵营");
	equal(identityAtVictory, "zhong", "身份胜负检查应发生在身份变更之后");
	equal(game.checkResultCalls, 1, "成功加入后应调用本体身份胜负检查");
	equal(game.overCalls.length, 0, "身份模式不应调用 side 胜负检查");
});

await check("感化 AI：chooseBool 实际回调拒绝后保留变身决策", async () => {
	resetRecruitState();
	resetCalls();
	const source = makePlayer({ name: "月神高斯", side: true, hp: 1, hand: [], skills: ["ysmanyue", "ysganhua"], aiChoice: true });
	const target = makePlayer({ name: "强敌", side: false, hp: 3, hand: repeatCard(3), equipment: repeatCard(3), skills: ["a", "b", "c"], aiChoice: true });
	game.players = [source, target];
	game.me = source;
	equal(skills.ysganhua.shared.getRecruitTargetValue(source, target), 0, "强敌不应被治疗 AI 预判为可招降");
	target.hp = 4;
	await skills.ysganhua.content({}, { source, player: target, num: 1 }, source);
	equal(target.aiResults.length, 1, "应执行目标 chooseBool 的 AI 回调");
	equal(target.aiResults[0].result, false, "目标 AI 应拒绝");
	equal(target.side, false, "拒绝后不得加入");
	equal(target.chats.join(""), "但是我拒绝", "拒绝后应发言");
	equal(source.aiResults.length, 1, "高斯应执行变身 chooseBool 的 AI 回调");
	equal(source.aiResults[0].result, true, "高斯 AI 应选择变身");
	equal(source.name1, "日蚀高斯", "拒绝后应保留自主变身逻辑");
	equal(game.overCalls.length, 0, "拒绝后不得判胜");
	equal(game.checkResultCalls, 0, "拒绝后不得调用身份胜负检查");
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
	assert(fs.existsSync(hostFile), "本体源码不存在，无法验证 AI 调用路径");
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
	assert(chain, "本体源码不存在，无法验证目标数量链路");
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
	assert(chain, "本体源码不存在，无法验证目标数量链路");
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

await check("感化 AI：国战阵营使用势力键且不泄露未亮将", () => {
	const shared = skills.ysganhua.shared;

	resetRecruitState("guozhan");
	let source = makePlayer({ name: "月神高斯", identity: "wei", group: "wei", identityShown: true, hp: 4, skills: ["ysmanyue", "ysganhua"] });
	let sourceAlly = makePlayer({ name: "魏友", identity: "wei", group: "wei", identityShown: true, hp: 3, skills: ["a"] });
	let target = makePlayer({ name: "蜀将", identity: "shu", group: "shu", identityShown: true, hp: 3, skills: ["a"] });
	let shuAlly1 = makePlayer({ name: "蜀友1", identity: "shu", group: "shu", identityShown: true, hp: 4, skills: ["a", "b"] });
	let shuAlly2 = makePlayer({ name: "蜀友2", identity: "shu", group: "shu", identityShown: true, hp: 4, skills: ["a"] });
	game.players = [source, sourceAlly, target, shuAlly1, shuAlly2];
	game.me = source;
	let plan = shared.getJoinPlan(source, target);
	assert(plan && plan.kind === "guozhan", "国战应给出加入计划");
	const expectedStay = shared.getPublicPower(shuAlly1, source) + shared.getPublicPower(shuAlly2, source);
	equal(shared.getCampPower(plan, source, target, false, source), expectedStay, "目标原阵营应计入已亮同势力队友");
	shuAlly2.unseen = [false, true];
	const partialExpected = shared.getPublicPower(shuAlly1, source) + shared.getPublicPower(shuAlly2, source);
	equal(shared.getCampPower(plan, source, target, false, source), partialExpected, "单将已亮的同势力队友应按公开实力计入");
	shuAlly2.unseen = undefined;
	const expectedJoin = shared.getPublicPower(source, source) + shared.getPublicPower(sourceAlly, source);
	equal(shared.getCampPower(plan, source, target, true, source), expectedJoin, "加入方应计入已亮同势力队友");
	equal(shared.getCoreStatus(plan, source, target, false, source), 0.5, "国战无核心角色时应返回中性值");
	const withAlliesEndgame = shared.getRecruitEndgameContext(source, target, plan);
	const withAlliesAnalysis = shared.evaluateSurrender(source, target, false);
	assert(!withAlliesEndgame.confirmed && withAlliesEndgame.bonus === 0, "目标有已亮同势力队友时不得获得残局加分");
	assert(!shared.shouldJoin(source, target), "目标有强力同势力队友时不应投降");
	equal(shared.getRecruitTargetValue(source, target), 0, "目标有强力同势力队友时不应鼓励治疗招降");
	console.log(
		`    国战有同势力队友: score=${withAlliesAnalysis.score.toFixed(4)}, powerEdge=${withAlliesAnalysis.powerEdge.toFixed(4)}, endgame=${withAlliesAnalysis.endgameBonus.toFixed(4)}, accept=false`,
	);

	resetRecruitState("guozhan");
	source = makePlayer({ name: "月神高斯", identity: "wei", group: "wei", identityShown: true, hp: 4, skills: ["ysmanyue", "ysganhua"] });
	sourceAlly = makePlayer({ name: "魏友", identity: "wei", group: "wei", identityShown: true, hp: 3, skills: ["a"] });
	target = makePlayer({ name: "蜀将", identity: "shu", group: "shu", identityShown: true, hp: 2, skills: [] });
	game.players = [source, sourceAlly, target];
	game.me = source;
	plan = shared.getJoinPlan(source, target);
	const lastEnemyEndgame = shared.getRecruitEndgameContext(source, target, plan);
	const lastEnemyAnalysis = shared.evaluateSurrender(source, target, false);
	assert(lastEnemyEndgame.confirmed && lastEnemyEndgame.bonus > 0, "国战最后敌方且高斯领先时应获得残局加分");
	assert(shared.shouldJoin(source, target), "国战最后敌方明显落后时应接受");
	assert(shared.getRecruitTargetValue(source, target) > 0, "国战最后敌方应被治疗 AI 识别为可招降");
	assert(Array.isArray(skills.ysmanyue.shared.recruitEffect(tao, source, target)), "国战应给治疗 AI 四元组招降加权");
	console.log(
		`    国战最后敌方: score=${lastEnemyAnalysis.score.toFixed(4)}, powerEdge=${lastEnemyAnalysis.powerEdge.toFixed(4)}, endgame=${lastEnemyAnalysis.endgameBonus.toFixed(4)}, accept=true`,
	);

	resetRecruitState("guozhan");
	source = makePlayer({ name: "月神高斯", identity: "wei", group: "wei", identityShown: true, hp: 4, skills: ["ysmanyue", "ysganhua"] });
	sourceAlly = makePlayer({ name: "魏友", identity: "wei", group: "wei", identityShown: true, hp: 3, skills: ["a"] });
	target = makePlayer({ name: "蜀将", identity: "shu", group: "shu", identityShown: true, hp: 2, skills: [] });
	const hiddenAlly = makePlayer({ name: "未亮将", identity: "shu", group: "shu", identityShown: false, unseen: [true, true], hp: 4, skills: ["a", "b"] });
	game.players = [source, sourceAlly, target, hiddenAlly];
	game.me = source;
	plan = shared.getJoinPlan(source, target);
	equal(shared.getCampPower(plan, source, target, false, source), 0, "未亮将队友不得计入势力实力");
	assert(!shared.getRecruitEndgameContext(source, target, plan).confirmed, "存在未亮将时不得确认残局");
	const publicShu = shared.evaluateSurrender(source, target, false).score;
	hiddenAlly.identity = "wei";
	hiddenAlly.group = "wei";
	const publicWei = shared.evaluateSurrender(source, target, false).score;
	equal(publicShu, publicWei, "未亮将的隐藏势力不得影响高斯侧预测");
	console.log(`    国战未亮将: publicScore=${publicShu.toFixed(4)}, endgame=false`);

	resetRecruitState("identity");
	source = makePlayer({ name: "月神高斯", identity: "zhong", identityShown: true, hp: 4, skills: ["ysmanyue", "ysganhua"] });
	const zhu = makePlayer({ name: "佐菲", identity: "zhu", isZhu: true, hp: 4, skills: [] });
	target = makePlayer({ name: "反贼", identity: "fan", identityShown: true, hp: 2, skills: [] });
	const fanAlly = makePlayer({ name: "反贼友", identity: "fan", identityShown: true, hp: 3, skills: ["a"] });
	game.players = [source, zhu, target, fanAlly];
	game.zhu = zhu;
	game.me = source;
	const identityPlan = shared.getJoinPlan(source, target);
	equal(shared.getCampPower(identityPlan, source, target, true, source), shared.getPublicPower(source, source) + shared.getPublicPower(zhu, source), "身份加入方阵营实力");
	equal(shared.getCampPower(identityPlan, source, target, false, source), shared.getPublicPower(fanAlly, source), "身份原阵营实力");

	resetRecruitState("versus");
	source = makePlayer({ name: "月神高斯", side: true, hp: 4, skills: ["ysmanyue", "ysganhua"] });
	sourceAlly = makePlayer({ name: "友方", side: true, hp: 3, skills: ["a"] });
	target = makePlayer({ name: "敌人", side: false, hp: 3, skills: ["a"] });
	const enemyAlly = makePlayer({ name: "敌方友", side: false, hp: 3, skills: ["b"] });
	game.players = [source, sourceAlly, target, enemyAlly];
	game.me = source;
	const sidePlan = shared.getJoinPlan(source, target);
	equal(shared.getCampPower(sidePlan, source, target, true, source), shared.getPublicPower(source, source) + shared.getPublicPower(sourceAlly, source), "side 加入方阵营实力");
	equal(shared.getCampPower(sidePlan, source, target, false, source), shared.getPublicPower(enemyAlly, source), "side 原阵营实力");
});

await check("感化 AI：国战 chooseBool 实际回调接受并调用 tryResult", async () => {
	const shared = skills.ysganhua.shared;
	resetRecruitState("guozhan");
	resetCalls();
	const source = makePlayer({ name: "月神高斯", identity: "wei", group: "wei", identityShown: true, hp: 4, skills: ["ysmanyue", "ysganhua"] });
	const sourceAlly = makePlayer({ name: "魏友", identity: "wei", group: "wei", identityShown: true, hp: 3, skills: ["a"] });
	const target = makePlayer({ name: "蜀将", identity: "shu", group: "shu", identityShown: true, hp: 2, skills: [], aiChoice: true });
	game.players = [source, sourceAlly, target];
	game.me = source;
	assert(shared.shouldJoin(source, target), "国战最后敌方应接受");
	await skills.ysganhua.content({}, { source, player: target, num: 1 }, source);
	equal(target.aiResults.length, 1, "应执行国战目标 chooseBool 的 AI 回调");
	equal(target.aiResults[0].result, true, "国战目标 AI 应接受");
	equal(target.group, "wei", "国战目标势力应变更为魏");
	equal(target.identity, "wei", "国战目标身份应变更为魏");
	equal(game.tryResultCalls, 1, "成功加入后应调用本体国战胜负检查");
	equal(game.checkResultCalls, 0, "国战不应调用身份胜负检查");
	equal(game.overCalls.length, 0, "国战不应调用 side 胜负检查");
});

await check("感化 AI：公开防御期望与私人真实防御", () => {
	const shared = skills.ysganhua.shared;
	const counts = [0, 1, 3, 5, 8];
	const perHand = shared.publicDefensePerHand;
	const cap = shared.publicDefenseCap;
	assert(perHand > 0 && perHand < 1, "单张手牌防御期望应为正且小于1");
	assert(cap > 0, "防御期望上限应为正");
	let previous = -1;
	for (const count of counts) {
		const target = makePlayer({ name: `敌人${count}`, side: false, hp: 2, maxHp: 4, hand: repeatCard(count), skills: [] });
		const estimate = shared.getPublicDefenseEstimate(target);
		const expected = Math.min(cap, count * perHand);
		assert(Math.abs(estimate - expected) < 1e-9, `${count} 张手牌的公开防御期望应为 ${expected}`);
		assert(estimate <= count, "公开防御期望不得把每张手牌都视为防御牌");
		assert(estimate <= cap && estimate >= previous, "公开防御期望应平滑增长且有上限");
		previous = estimate;
		console.log(`    手牌${count}: 公开防御期望=${estimate.toFixed(2)}`);
	}

	resetRecruitState("versus");
	const source = makePlayer({ name: "月神高斯", side: true, hp: 4, hand: [tao], skills: ["ysmanyue", "ysganhua"] });
	const defenseTarget = makePlayer({ name: "防御型敌人", side: false, hp: 2, maxHp: 4, hand: [shan, tao, makeCard("jiu", "spade", 9, "basic", { recover: 1 })], skills: [] });
	const attackTarget = makePlayer({ name: "攻击型敌人", side: false, hp: 2, maxHp: 4, hand: [sha, sha, sha], skills: [] });
	game.players = [source, defenseTarget];
	game.me = source;
	const publicDefense = shared.evaluateSurrender(source, defenseTarget, false);
	const actualDefense = shared.evaluateSurrender(source, defenseTarget, true);
	const expectedEstimate = Math.min(shared.publicDefenseCap, 3 * shared.publicDefensePerHand);
	assert(Math.abs(shared.getPublicDefenseEstimate(defenseTarget) - expectedEstimate) < 1e-9, "三张手牌的公开防御期望不读取牌名");
	game.players = [source, attackTarget];
	const publicAttack = shared.evaluateSurrender(source, attackTarget, false);
	const actualAttack = shared.evaluateSurrender(source, attackTarget, true);
	equal(publicDefense.score, publicAttack.score, "相同手牌数量下，高斯预测不得读取隐藏牌名");
	assert(actualDefense.survival < actualAttack.survival, "目标实际持有闪桃酒时私人防御压力应更低");
	assert(actualDefense.score < actualAttack.score, "目标实际防御牌应降低其投降倾向");
});

await check("日蚀：准备阶段补齐少类并随机从牌堆获得实体牌", async () => {
	const shared = skills.ysganhua.shared;
	const prepare = skills.rsrishi.subSkill.prepare;
	assert(prepare, "应存在准备阶段子技能");
	assert(skills.rsrishi.group.includes("rsrishi_prepare"), "日蚀组应包含准备阶段子技能");
	equal(prepare.trigger.player, "phaseZhunbeiBegin", "准备阶段触发时机");
	const makeEclipse = (hand, pile) => {
		const player = makePlayer({ name: "日蚀高斯", skills: ["rsrishi"], hand });
		ui.cardPile = { childNodes: pile };
		return player;
	};
	const countHand = player => {
		const hand = player.getCards("h");
		const damage = hand.filter(card => skills.ysmanyue.shared.isDamageCard(card)).length;
		return { damage, nonDamage: hand.length - damage };
	};
	const originalRandom = Math.random;
	try {
		let player = makeEclipse([sha, tao], [makeCard("sha", "spade", 1, "basic", { damage: 1 })]);
		equal(prepare.filter({ name: "phaseZhunbeiBegin" }, player), false, "两类数量相等时不触发");
		await prepare.content({}, { name: "phaseZhunbeiBegin" }, player);
		equal(player.gainCalls.length, 0, "两类数量相等时不获得牌");

		player = makeEclipse([], [makeCard("sha", "spade", 1, "basic", { damage: 1 })]);
		equal(prepare.filter({ name: "phaseZhunbeiBegin" }, player), false, "空手牌两类均为0时不触发");

		const damagePile = Array.from({ length: 6 }, (_, i) => makeCard("sha", "spade", i + 1, "basic", { damage: 1 }));
		player = makeEclipse([sha, tao, tao, tao, tao, tao], damagePile);
		equal(prepare.filter({ name: "phaseZhunbeiBegin" }, player), true, "少类为伤害牌时应触发");
		await prepare.content({}, { name: "phaseZhunbeiBegin" }, player);
		equal(player.gainCalls.length, 1, "应获得一次牌");
		equal(player.gainCalls[0].cards.length, 4, "应按差值4补牌");
		assert(player.gainCalls[0].cards.every(card => damagePile.includes(card) && skills.ysmanyue.shared.isDamageCard(card)), "应获得牌堆中的实体伤害牌");
		assert(countHand(player).damage === countHand(player).nonDamage, "补牌后两类数量应相等");

		const bigPile = Array.from({ length: 10 }, (_, i) => makeCard("sha", "club", i + 1, "basic", { damage: 1 }));
		player = makeEclipse(repeatCard(8), bigPile);
		await prepare.content({}, { name: "phaseZhunbeiBegin" }, player);
		equal(player.gainCalls[0].cards.length, 8, "获得数量不设上限，应补满差值8");
		assert(countHand(player).damage === countHand(player).nonDamage, "大量补牌后两类数量应相等");

		const nonDamagePile = Array.from({ length: 4 }, (_, i) => makeCard("tao", "heart", i + 1, "basic", { recover: 1 }));
		player = makeEclipse([sha, sha, sha, tao], nonDamagePile);
		await prepare.content({}, { name: "phaseZhunbeiBegin" }, player);
		equal(player.gainCalls[0].cards.length, 2, "少类为非伤害牌时应补2张");
		assert(player.gainCalls[0].cards.every(card => nonDamagePile.includes(card) && !skills.ysmanyue.shared.isDamageCard(card)), "应获得牌堆中的实体非伤害牌");

		const shortPile = [makeCard("sha", "heart", 1, "basic", { damage: 1 }), makeCard("sha", "heart", 2, "basic", { damage: 1 })];
		player = makeEclipse([sha, tao, tao, tao, tao, tao], shortPile);
		await prepare.content({}, { name: "phaseZhunbeiBegin" }, player);
		equal(player.gainCalls[0].cards.length, 2, "牌堆不足时应获得所有可用牌");
		assert(player.gainCalls[0].cards.every(card => shortPile.includes(card)), "不足时不得凭空生成牌");
		assert(countHand(player).damage !== countHand(player).nonDamage, "牌堆不足时允许两类仍不相等");

		const randomPile = [makeCard("sha", "spade", 1, "basic", { damage: 1 }), makeCard("sha", "spade", 2, "basic", { damage: 1 }), makeCard("sha", "spade", 3, "basic", { damage: 1 })];
		Math.random = () => 0;
		player = makeEclipse([sha, tao, tao], randomPile);
		await prepare.content({}, { name: "phaseZhunbeiBegin" }, player);
		const firstRandom = player.gainCalls[0].cards[0];
		Math.random = () => 0.99;
		player = makeEclipse([sha, tao, tao], randomPile);
		await prepare.content({}, { name: "phaseZhunbeiBegin" }, player);
		const lastRandom = player.gainCalls[0].cards[0];
		assert(firstRandom !== lastRandom, "随机抽取不应固定检索第一张");

		const delayPile = [makeCard("fulei", "heart", 5, "delay", { damage: 1, thunderDamage: 1 })];
		player = makeEclipse([shandian, tao, tao], delayPile);
		await prepare.content({}, { name: "phaseZhunbeiBegin" }, player);
		equal(player.gainCalls[0].cards[0], delayPile[0], "伤害延时锦囊按满月口径归为伤害牌");

		const moon = makePlayer({ name: "月神高斯", skills: ["ysmanyue", "ysganhua"], hand: [sha, tao, tao] });
		assert(!moon.skills.includes("rsrishi"), "变身前的月神没有日蚀");
		await shared.switchToEclipse(moon);
		equal(moon.name1, "日蚀高斯", "变身应切换为日蚀高斯");
		assert(moon.skills.includes("rsrishi"), "变身后应获得日蚀");
		ui.cardPile = { childNodes: [makeCard("sha", "spade", 4, "basic", { damage: 1 })] };
		equal(prepare.filter({ name: "phaseZhunbeiBegin" }, moon), true, "变身后的下一个准备阶段应触发");
		await prepare.content({}, { name: "phaseZhunbeiBegin" }, moon);
		equal(moon.gainCalls[0].cards.length, 1, "变身后的准备阶段应正常补牌");
	} finally {
		Math.random = originalRandom;
		ui.cardPile = { childNodes: [] };
	}
});

await check("日蚀牌面标记：四花色六效果各自成对并支持多标记", () => {
	const shared = skills.rsrishi.shared;
	assert(shared && typeof shared.getCardMarkTags === "function", "应提供牌面标记计算");
	const tagsFor = suit => shared.getCardMarkTags(makeCard("sha", suit, 1, "basic", { damage: 1 }));
	equal(JSON.stringify(tagsFor("heart")), JSON.stringify(["rsrishi_mark_red", "rsrishi_mark_heart"]), "红桃牌标记");
	equal(JSON.stringify(tagsFor("diamond")), JSON.stringify(["rsrishi_mark_red", "rsrishi_mark_diamond"]), "方块牌标记");
	equal(JSON.stringify(tagsFor("spade")), JSON.stringify(["rsrishi_mark_black", "rsrishi_mark_spade"]), "黑桃牌标记");
	equal(JSON.stringify(tagsFor("club")), JSON.stringify(["rsrishi_mark_black", "rsrishi_mark_club"]), "梅花牌标记");
	const labels = {
		rsrishi_mark_red: "再结算",
		rsrishi_mark_black: "免响应",
		rsrishi_mark_heart: "穿甲",
		rsrishi_mark_diamond: "无距",
		rsrishi_mark_spade: "伤+1",
		rsrishi_mark_club: "无限",
	};
	for (const [tag, label] of Object.entries(labels)) {
		equal(skillTranslate[tag], label, `${tag} 应是供本体 gaintag 直接渲染的纯文本`);
		assert(!String(skillTranslate[tag]).includes("<"), `${tag} 不得内嵌自定义 DOM`);
	}
	const modified = makeCard("sha", "spade", 1, "basic", { damage: 1 });
	modified.color = "red";
	equal(JSON.stringify(shared.getCardMarkTags(modified)), JSON.stringify(["rsrishi_mark_red", "rsrishi_mark_spade"]), "颜色与花色被修改时分别叠加");
	const colorless = makeCard("sha", "none", 1, "basic", {});
	colorless.color = "black";
	equal(JSON.stringify(shared.getCardMarkTags(colorless)), JSON.stringify(["rsrishi_mark_black"]), "无花色只显示颜色效果");
	equal(JSON.stringify(shared.getCardMarkTags({ name: "sha", suit: "unsure", color: "unsure", cards: [] })), "[]", "不确定花色与复合虚拟牌不显示标记");
});

await check("日蚀牌面标记：给予、失去、使用与花色变化后实时刷新", async () => {
	const shared = skills.rsrishi.shared;
	const mark = skills.rsrishi.subSkill.mark;
	assert(mark, "应存在牌面标记子技能");
	assert(skills.rsrishi.group.includes("rsrishi_mark"), "日蚀组应包含标记子技能");
	const triggerEvents = [].concat(mark.trigger?.player ?? [], mark.trigger?.global ?? []);
	for (const eventName of ["gainAfter", "loseAfter", "changeSkillsAfter", "phaseBegin"]) {
		assert(triggerEvents.includes(eventName), `应在 ${eventName} 后刷新标记`);
	}
	const heart = makeCard("tao", "heart", 3, "basic", { recover: 1 });
	const spade = makeCard("sha", "spade", 5, "basic", { damage: 1 });
	const club = makeCard("sha", "club", 6, "basic", { damage: 1 });
	const diamond = makeCard("shan", "diamond", 2, "basic", { respondShan: 1 });
	heart.addGaintag("other_skill_tag");
	const player = makePlayer({ name: "日蚀高斯", skills: ["rsrishi"], hand: [heart, spade, club, diamond] });
	game.players = [player];
	shared.refreshMarks(player);
	const expected = new Map([
		[heart, ["rsrishi_mark_red", "rsrishi_mark_heart"]],
		[spade, ["rsrishi_mark_black", "rsrishi_mark_spade"]],
		[club, ["rsrishi_mark_black", "rsrishi_mark_club"]],
		[diamond, ["rsrishi_mark_red", "rsrishi_mark_diamond"]],
	]);
	for (const [card, tags] of expected) {
		for (const tag of tags) assert(card.hasGaintag(tag), `${card.suit}牌应显示 ${skillTranslate[tag]}`);
		const ours = card.gaintag.filter(tag => tag.startsWith("rsrishi_mark_"));
		equal(JSON.stringify(ours), JSON.stringify(tags), `${card.suit}牌不应混入其他日蚀标记`);
	}
	assert(heart.hasGaintag("other_skill_tag"), "不得移除其他技能的牌面标记");
	equal(heart.node.gaintag.innerHTML, heart.gaintag.map(tag => get.translation(tag)).join(" "), "本体 gaintag 应原样拼接多个标记文案");
	assert(heart.node.gaintag.innerHTML.includes("再结算") && heart.node.gaintag.innerHTML.includes("穿甲"), "多标记文案应同时可见");
	equal(`${heart.suit}/${heart.color}/${heart.number}`, "heart/red/3", "刷新标记不得改实体牌属性");

	player.hand = player.hand.filter(card => card !== spade);
	await mark.content({}, {}, player);
	assert(!spade.hasGaintag("rsrishi_mark_black") && !spade.hasGaintag("rsrishi_mark_spade"), "使用或失去后应清理离手牌标记");
	assert(!player.rsrishiMarkedCards.includes(spade), "离手牌应移出标记跟踪");

	const gained = makeCard("tao", "heart", 7, "basic", { recover: 1 });
	player.hand.push(gained);
	await mark.content({}, {}, player);
	assert(gained.hasGaintag("rsrishi_mark_red") && gained.hasGaintag("rsrishi_mark_heart"), "获得手牌后应补上标记");

	club.suit = "heart";
	club.color = "red";
	await mark.content({}, {}, player);
	assert(club.hasGaintag("rsrishi_mark_red") && club.hasGaintag("rsrishi_mark_heart"), "花色变化后应换用新标记");
	assert(!club.hasGaintag("rsrishi_mark_black") && !club.hasGaintag("rsrishi_mark_club"), "花色变化后应移除旧标记");

	club.suit = "none";
	club.color = "none";
	await mark.content({}, {}, player);
	assert(!club.gaintag.some(tag => tag.startsWith("rsrishi_mark_")), "颜色与花色均无效时不应保留标记");

	const receiver = makePlayer({ name: "迪迦", skills: [], hand: [] });
	diamond.addGaintag("other_skill_tag");
	game.players = [player, receiver];
	player.hand = player.hand.filter(card => card !== diamond);
	receiver.hand.push(diamond);
	await mark.content({}, {}, player);
	assert(!diamond.gaintag.some(tag => tag.startsWith("rsrishi_mark_")), "转移给没有日蚀的角色后不得残留标记");
	assert(diamond.hasGaintag("other_skill_tag"), "转移时不得清除其他技能标记");

	const otherEclipse = makePlayer({ name: "日蚀高斯B", skills: ["rsrishi"], hand: [] });
	game.players = [player, otherEclipse];
	player.hand = player.hand.filter(card => card !== heart);
	otherEclipse.hand.push(heart);
	await mark.content({}, {}, player);
	assert(heart.hasGaintag("rsrishi_mark_red") && heart.hasGaintag("rsrishi_mark_heart"), "转移给另一名日蚀时旧持有者不得误清标记");
	await mark.content({}, {}, otherEclipse);
	assert(heart.hasGaintag("rsrishi_mark_red") && heart.hasGaintag("rsrishi_mark_heart"), "新持有者应继续显示日蚀标记");
});

await check("日蚀牌面标记：技能获得、失去与月神变身日蚀后刷新", async () => {
	const shared = skills.ysganhua.shared;
	const heart = makeCard("tao", "heart", 8, "basic", { recover: 1 });
	const spade = makeCard("sha", "spade", 9, "basic", { damage: 1 });
	const moon = makePlayer({ name: "月神高斯", skills: ["ysmanyue", "ysganhua"], hand: [heart, spade] });
	game.players = [moon];
	assert(!heart.gaintag.some(tag => tag.startsWith("rsrishi_mark_")), "变身前的月神不应有日蚀标记");
	await shared.switchToEclipse(moon);
	assert(moon.skills.includes("rsrishi"), "变身后应获得日蚀");
	assert(heart.hasGaintag("rsrishi_mark_red") && heart.hasGaintag("rsrishi_mark_heart"), "变身时红桃牌应立即标记");
	assert(spade.hasGaintag("rsrishi_mark_black") && spade.hasGaintag("rsrishi_mark_spade"), "变身时黑桃牌应立即标记");
	heart.addGaintag("other_skill_tag");
	await moon.removeSkills("rsrishi");
	assert(!heart.gaintag.some(tag => tag.startsWith("rsrishi_mark_")) && !spade.gaintag.some(tag => tag.startsWith("rsrishi_mark_")), "失去日蚀后应清理全部日蚀标记");
	assert(heart.hasGaintag("other_skill_tag"), "失去日蚀不得影响其他技能标记");

	const club = makeCard("sha", "club", 10, "basic", { damage: 1 });
	const eclipse = makePlayer({ name: "日蚀高斯", skills: ["rsrishi"], hand: [club] });
	game.players = [eclipse];
	skills.rsrishi.init2(eclipse, "rsrishi");
	assert(club.hasGaintag("rsrishi_mark_black") && club.hasGaintag("rsrishi_mark_club"), "获得日蚀时应为现有手牌补标记");
	skills.rsrishi.onremove(eclipse, "rsrishi");
	assert(!club.gaintag.some(tag => tag.startsWith("rsrishi_mark_")), "onremove 应清理现有手牌标记");
});

await check("日蚀牌面标记：只调用本体 gaintag，不注入自定义样式或 DOM", () => {
	const source = fs.readFileSync(path.join(pack, "skills.js"), "utf8");
	assert(!source.includes("markStyleText"), "不得保留自定义标记样式表");
	assert(!source.includes("rsrishi-mark"), "不得内嵌自定义标记 DOM 类名");
	assert(!source.includes("ensureStyles"), "不得注入样式表");
	assert(!source.includes('document.createElement("style")'), "不得创建自定义样式节点");
	assert(source.includes("player.addGaintag"), "应通过本体 Player.addGaintag 添加标记");
	assert(source.includes("player.removeGaintag"), "应通过本体 Player.removeGaintag 清理标记");
	assert(source.includes("card.hasGaintag"), "更新时应读取本体 gaintag 状态");
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
