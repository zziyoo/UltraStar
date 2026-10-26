// 大丽花【炽灼】多批次回归测试。
// 桩件按本体源码复刻事件链与派发顺序，改动前先确认它能复现旧实现的两个已证实 Bug：
//   resources/app/src/noname/library/element/content.ts:10153-10190（useCardToTargeted 由 useCard 逐目标触发，targets 全量、target 当前目标，父事件是 useCard）
//   resources/app/src/noname/library/element/content.ts:10344-10353（牌结算事件 next.card = event.card，同一 VCard 对象）
//   resources/app/src/noname/library/element/player.js:9131-9146（damage() 不传 card 时抄 _status.event.card）
//   resources/app/src/noname/library/element/content.ts:12155-12219（伤害内容里 await dying→die，dieBefore 早于 damageEnd）
//   resources/app/src/noname/library/element/content.ts:12604-12609（死亡弃置 hejsx，含扩展区）
//   resources/app/src/noname/library/element/GameEvent/compilers/ArrayCompiler.ts:33（content 实参为 event、event._trigger、event.player）
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..", "..");
const skillsFile = path.join(root, "packages", "honkai-star-rail", "skills.js");

let nextId = 0;
const getId = () => ++nextId;

const cardDefs = {
	sha: { tags: { damage: true } },
	huosha: { tags: { damage: true } },
	leisha: { tags: { damage: true } },
	juedou: { tags: { damage: true } },
	wanjian: { tags: { damage: true } },
	shan: { tags: {} },
	tao: { tags: {} },
	yao: { tags: {} },
	huaping: { tags: {} },
	gudingdao: { tags: {} },
};

const lib = { skill: {}, card: cardDefs, playerOL: {}, config: {}, translate: {} };
const _status = { event: null, currentPhase: null, connectMode: false, video: false, mode: "identity" };
const game = {
	players: [],
	dead: [],
	playerMap: {},
	online: false,
	log() {},
	broadcast() {},
	broadcastAll() {},
	delay: () => Promise.resolve(),
	delayx: () => Promise.resolve(),
	createEvent(name) {
		const event = new GameEvent(name);
		const parent = _status.event;
		if (parent) {
			event.parent = parent;
			parent.children.push(event);
			// 本体联机时 getParent 沿 _modparent 走（gameEvent.ts:166-170）
			if (game.online) event._modparent = parent;
		}
		return event;
	},
};
const ui = { cardPile: [], discardPile: [] };
const attitudes = {};
const decisions = { control: [], cards: [], target: [] };
const ai = {};

Object.defineProperties(Array.prototype, {
	add: { value(item) { if (!this.includes(item)) this.push(item); return this; }, configurable: true, writable: true },
	addArray: { value(items) { for (const item of items) this.add(item); return this; }, configurable: true, writable: true },
	remove: { value(item) { const i = this.indexOf(item); if (i >= 0) this.splice(i, 1); return this; }, configurable: true, writable: true },
	removeArray: { value(items) { for (const item of items) this.remove(item); return this; }, configurable: true, writable: true },
	unique: { value() { return [...new Set(this)]; }, configurable: true, writable: true },
	sortBySeat: {
		value(start) {
			const order = game.players.slice();
			if (!start || !order.includes(start)) return order;
			const i = order.indexOf(start);
			return [...order.slice(i), ...order.slice(0, i)];
		},
		configurable: true,
		writable: true,
	},
});

class GameEvent {
	constructor(name) {
		this.name = name;
		this.parent = null;
		this.children = [];
		this._trigger = null;
		this.triggername = null;
		this.result = {};
		this.finished = false;
	}
	set(key, value) {
		this[key] = value;
		return this;
	}
	setContent(content) {
		this.__content = content;
		return this;
	}
	/** 与本体 gameEvent.ts:149-176 同语义：number=深度、string=名字、function=特征 */
	getParent(level = 1, forced = false, includeSelf = false) {
		let event = this;
		let i = 0;
		const toreturn = forced ? undefined : {};
		const visited = [];
		const filter =
			typeof level === "function" ? level : typeof level === "number" ? evt => i === level : evt => evt.name === level;
		while (true) {
			if (!event) return toreturn;
			visited.push(event);
			if (filter(event) && (includeSelf || i !== 0)) return event;
			event = game.online && event._modparent ? event._modparent : event.parent;
			if (visited.includes(event)) return toreturn;
			i++;
		}
	}
	getTrigger() {
		return this.getParent(e => e._trigger, false, true)._trigger;
	}
	finish() {
		this.finished = true;
	}
	then(resolve, reject) {
		this.__start ??= this.__run();
		const derived = this.__start.then(
			value => {
				resolve?.(this.result);
				return this.result;
			},
			error => {
				reject?.(error);
				throw error;
			},
		);
		// await 只走 resolve/reject 回调，派生 Promise 需自行标记已处理
		derived.catch(() => {});
		return derived;
	}
	forResult() {
		this.__start ??= this.__run();
		return this.__start.then(() => this.result);
	}
	async __run() {
		const outer = _status.event;
		_status.event = this;
		try {
			if (this.__content) await this.__content(this);
		} finally {
			_status.event = outer;
		}
		return this.result;
	}
}

function actionEvent(name, runner) {
	const event = {
		name,
		result: {},
		set(key, value) {
			event[key] = value;
			return event;
		},
		then(resolve, reject) {
			event.__start ??= Promise.resolve(runner());
			const derived = event.__start.then(
				value => {
					resolve?.(value);
					return value;
				},
				error => {
					reject?.(error);
					throw error;
				},
			);
			derived.catch(() => {});
			return derived;
		},
		forResult() {
			event.__start ??= Promise.resolve(runner());
			return event.__start;
		},
	};
	return event;
}

function detach(card) {
	const owner = card.owner;
	if (!owner) return;
	owner.hand.remove(card);
	owner.equips.remove(card);
	owner.judges.remove(card);
	owner.expansion.remove(card);
	card.owner = null;
}

function makeCard(name) {
	const card = {
		name,
		isCard: true,
		number: getId(),
		suit: "spade",
		gaintag: [],
		classes: new Set(),
		area: null,
		owner: null,
		cardid: getId(),
	};
	card.classList = {
		add: cls => card.classes.add(cls),
		remove: cls => card.classes.delete(cls),
		contains: cls => card.classes.has(cls),
	};
	card.addGaintag = tag => {
		if (!card.gaintag.includes(tag)) card.gaintag.push(tag);
	};
	card.hasGaintag = tag => card.gaintag.includes(tag);
	card.removeGaintag = tag => {
		card.gaintag = card.gaintag.filter(value => value !== tag);
	};
	return card;
}

function makePlayer(name, hp = 4) {
	const player = {
		name,
		hp,
		maxHp: hp,
		isPlayer: true,
		playerid: getId(),
		skills: [],
		hiddenSkills: [],
		storage: {},
		marks: [],
		hand: [],
		equips: [],
		judges: [],
		expansion: [],
		dead: false,
		histories: {},
	};
	game.playerMap[player.playerid] = player;
	lib.playerOL[player.playerid] = player;
	Object.assign(player, {
		getId() {
			// 本体 player.js:4259-4267：录像/联机下返回自身
			if (_status.video || _status.connectMode) return player;
			game.playerMap[player.playerid] = player;
			return player.playerid;
		},
		addSkill(skill) {
			for (const item of toArray(skill)) if (!player.skills.includes(item)) player.skills.push(item);
		},
		removeSkill(skill) {
			for (const item of toArray(skill)) player.skills.remove(item);
		},
		hasSkill(skill) {
			return player.skills.includes(skill);
		},
		markSkill(skill) {
			player.marks.add(skill);
		},
		unmarkSkill(skill) {
			player.marks.remove(skill);
		},
		/** 与本体 player.js:10619-10694 同语义：getStorage 缺省返回 []，setStorage(x, undefined) 仍留着键 */
		setStorage(name, value) {
			player.storage[name] = value;
			return value;
		},
		getStorage(name, defaultValue = []) {
			return player.storage[name] || defaultValue;
		},
		hasStorage(name, value) {
			if (!(name in player.storage)) return false;
			if (value === undefined) return true;
			const stored = player.storage[name];
			if (stored === value) return true;
			return Array.isArray(stored) && stored.includes(value);
		},
		removeStorage(name) {
			if (!(name in player.storage)) return false;
			delete player.storage[name];
			return true;
		},
		isIn: () => game.players.includes(player),
		isAlive: () => !player.dead && game.players.includes(player),
		isDead: () => player.dead,
		isOut: () => player.dead,
		getHp: () => player.hp,
		getCards(spec, filter) {
			const list = [];
			for (const area of spec) {
				if (area === "h") list.push(...player.hand);
				else if (area === "e") list.push(...player.equips);
				else if (area === "j") list.push(...player.judges);
				else if (area === "x") list.push(...player.expansion);
			}
			return filter ? list.filter(filter) : list;
		},
		countCards(spec, filter) {
			return player.getCards(spec, filter).length;
		},
		hasCards(spec, filter) {
			return player.getCards(spec, filter).length > 0;
		},
		hasCard(filter, spec) {
			return player.getCards(spec ?? "hejx", filter).length > 0;
		},
		getExpansions(tag) {
			return tag ? player.getCards("x", card => card.hasGaintag(tag)) : player.getCards("x");
		},
		countExpansions(tag) {
			return player.getExpansions(tag).length;
		},
		getHistory(kind, filter = () => true) {
			return (player.histories[kind] ?? []).filter(filter);
		},
		getAllHistory(kind, filter = () => true) {
			return player.getHistory(kind, filter);
		},
		pushHistory(kind, event) {
			(player.histories[kind] ??= []).push(event);
		},
		/** 本体 addToExpansion：位置参数里的字符串是动画名，牌数组进 cards，玩家进 source，gaintag 在 await 时生效 */
		addToExpansion(...args) {
			const cards = [];
			const event = actionEvent("addToExpansion", async () => {
				for (const card of cards.slice()) {
					detach(card);
					player.expansion.push(card);
					card.area = "x";
					card.owner = player;
					for (const tag of event.gaintag) card.addGaintag(tag);
					if (event.gaintag.length) player.markSkill(event.gaintag[0]);
				}
				return { cards: cards.slice() };
			});
			event.gaintag = [];
			for (const arg of args) {
				if (Array.isArray(arg)) cards.addArray(arg);
				else if (arg?.isPlayer) event.source = arg;
				else if (typeof arg === "string") event.animate = arg;
			}
			event.cards = cards.slice();
			return event;
		},
		gain(list) {
			return actionEvent("gain", async () => {
				for (const card of list.slice()) {
					detach(card);
					player.hand.push(card);
					card.area = "h";
					card.owner = player;
					// 本体 gain 只清 glow/glows 与非 eternal gaintag，glory2 需要技能自己清
					card.classes.delete("glow");
					card.classes.delete("glows");
					card.gaintag = card.gaintag.filter(tag => tag.startsWith("eternal_"));
				}
				player.pushHistory("gain", { name: "gain", cards: list.slice(), player });
				return { cards: list.slice() };
			});
		},
		draw(num = 1) {
			return actionEvent("draw", async () => {
				const drawn = [];
				for (let i = 0; i < num; i++) {
					const card = makeCard("sha");
					card.area = "h";
					card.owner = player;
					player.hand.push(card);
					drawn.push(card);
				}
				return { cards: drawn };
			});
		},
		discard(list) {
			return actionEvent("discard", async () => {
				for (const card of list.slice()) {
					detach(card);
					ui.discardPile.push(card);
					card.area = "d";
					card.classes.delete("glow");
					card.classes.delete("glows");
					card.gaintag = card.gaintag.filter(tag => tag.startsWith("eternal_"));
				}
				return { cards: list.slice() };
			});
		},
		/** 与本体 player.damage 同形：不传 card 时抄 _status.event.card */
		damage(...args) {
			const event = game.createEvent("damage");
			event.player = player;
			let noCard = false;
			let noSource = false;
			for (const arg of args) {
				if (typeof arg === "number") event.num = arg;
				else if (typeof arg === "string") {
					if (arg === "nocard") noCard = true;
					else if (arg === "nosource") noSource = true;
					else event.nature = arg;
				} else if (arg?.isPlayer) event.source = arg;
				else if (arg?.isCard || arg?.isVCard) event.card = arg;
			}
			const current = _status.event;
			if (!event.card && !noCard) event.card = current?.card;
			if (!event.cards && !noCard) event.cards = current?.cards;
			if (!event.source && !noSource) event.source = current?.customSource ?? current?.player;
			if (typeof event.num !== "number") event.num = (current?.baseDamage ?? 0) + 1;
			return event;
		},
		loseHp(num = 1) {
			const event = game.createEvent("loseHp");
			event.player = player;
			event.num = num;
			return event;
		},
		chooseControl(list) {
			const event = game.createEvent("chooseControl");
			event.player = player;
			event.__list = list;
			event.__run = async () => {};
			event.result = decisions.control.length ? { control: decisions.control.shift() } : { control: toArray(list)[0] };
			return event;
		},
		chooseCardButton() {
			const event = game.createEvent("chooseCardButton");
			event.player = player;
			event.__run = async () => {};
			const pick = decisions.cards.shift();
			event.result = pick ? { bool: true, links: pick } : { bool: false, links: [] };
			return event;
		},
		chooseTarget() {
			const event = game.createEvent("chooseTarget");
			event.player = player;
			event.__run = async () => {};
			const pick = decisions.target.shift();
			event.result = pick ? { bool: true, targets: [pick] } : { bool: false, targets: [] };
			return event;
		},
		logSkill() {},
		line() {},
		update() {},
	});
	return player;
}

function toArray(value) {
	return value == null ? [] : Array.isArray(value) ? value : [value];
}

function giveCards(player, spec) {
	const list = [];
	for (const [area, names] of spec) {
		for (const name of names) {
			const card = makeCard(name);
			card.area = area;
			card.owner = player;
			if (area === "h") player.hand.push(card);
			else if (area === "e") player.equips.push(card);
			else if (area === "j") player.judges.push(card);
			list.push(card);
		}
	}
	return list;
}

function plan(next) {
	if (next.control) decisions.control.push(...next.control);
	if (next.cards) decisions.cards.push(...next.cards);
	if (next.target) decisions.target.push(...next.target);
}

const get = {
	id: getId,
	tag(card, tag) {
		return cardDefs[card?.name]?.tags?.[tag];
	},
	name: card => card?.name,
	type: card => card?.type ?? "basic",
	itemtype(value) {
		if (!value) return undefined;
		if (value.isPlayer) return "player";
		if (Array.isArray(value) && value.every(item => item?.isCard)) return "cards";
		if (value.isCard) return "card";
		if (value.isVCard) return "vcard";
		return undefined;
	},
	is: {
		object: value => value !== null && typeof value === "object",
		damageCard: card => Boolean(get.tag(card, "damage")),
		locked: () => false,
	},
	event: () => _status.event,
	player: () => _status.event?.player,
	owner: card => card?.owner,
	position: card => card?.area,
	translation(value) {
		if (Array.isArray(value)) return value.map(card => lib.translate[card.name] ?? card.name).join("、");
		if (value?.isPlayer) return value.name;
		if (value?.name) return lib.translate[value.name] ?? value.name;
		return String(value);
	},
	prompt(skillId, target) {
		return `是否对${target?.name ?? ""}发动${lib.translate[skillId] ?? skillId}`;
	},
	cnNumber: num => String(num),
	attitude(a, b) {
		if (a === b) return 1;
		return attitudes[[a.name, b.name].sort().join("|")] ?? -1;
	},
	value: card => card?.number ?? 0,
	info: card => (typeof card === "string" ? lib.card[card] : card),
	/** 本体 get.autoViewAs：每次使用牌都新建 VCard；包实体牌时带上 cardid，纯虚拟牌没有 cardid */
	autoViewAs(card, cards) {
		if (card?.isVCard) return card;
		const vcard = { name: card.name, isVCard: true, cards: cards ? cards.slice() : [card], tags: { ...cardDefs[card.name]?.tags } };
		if (get.itemtype(card) === "card") {
			vcard.isCard = true;
			vcard.cardid = card.cardid;
		}
		return vcard;
	},
};

/** 触发派发：本体先按座位收集本时机的技能再逐个执行，本轮新建的触发技不会补进本次时机 */
async function dispatch(baseEvent, timing) {
	const start = _status.currentPhase ?? baseEvent.source ?? baseEvent.player ?? game.players[0];
	const order = game.players.concat(game.dead).sortBySeat(start);
	const todo = [];
	for (const player of order) {
		if (player.dead && !baseEvent.forceDie) continue;
		for (const skillId of player.skills.slice()) {
			const info = lib.skill[skillId];
			if (!info?.trigger) continue;
			for (const role of ["player", "source", "target", "global"]) {
				if (!toArray(info.trigger[role]).includes(timing)) continue;
				if (role !== "global" && baseEvent[role] !== player) continue;
				todo.push({ skillId, info, player });
			}
		}
	}
	for (const item of todo) {
		if (item.info.filter && !item.info.filter(baseEvent, item.player, timing)) continue;
		const event = game.createEvent(item.skillId);
		event.player = item.player;
		event.skill = item.skillId;
		event._trigger = baseEvent;
		event.triggername = timing;
		event.forceDie = true;
		event.setContent(() => item.info.content(event, baseEvent, item.player));
		(baseEvent.triggered ??= []).push(item.skillId);
		await event;
	}
}

/** 本体 useCard 的切片：包 VCard → 逐目标 useCardToTargeted → 逐目标牌结算事件 → 伤害 */
async function useCard(user, usedCard, targets, options = {}) {
	const cards = options.cards ?? (usedCard.isCard ? [usedCard] : []);
	const vcard = get.autoViewAs(usedCard, cards);
	const useEvent = game.createEvent("useCard");
	useEvent.player = user;
	useEvent.card = vcard;
	useEvent.cards = cards;
	useEvent.targets = targets.slice();
	useEvent.num = 0;
	const record = { useEvent, vcard, damages: [], targeted: [] };
	await useEvent.setContent(async () => {
		for (const target of useEvent.targets) {
			const targeted = game.createEvent("useCardToTargeted");
			targeted.player = user;
			targeted.card = vcard;
			targeted.cards = cards;
			targeted.targets = useEvent.targets;
			targeted.target = target;
			record.targeted.push(targeted);
			await dispatch(targeted, "useCardToTargeted");
		}
		if (options.responded) return;
		for (const target of useEvent.targets) {
			const cardEvent = game.createEvent(vcard.name);
			cardEvent.player = user;
			cardEvent.card = vcard;
			cardEvent.cards = cards;
			cardEvent.targets = useEvent.targets;
			cardEvent.target = target;
			cardEvent.type = "card";
			await cardEvent.setContent(async () => {
				record.damages.push(await resolveDamage(target, user, options.damage ?? 1, options.nature, options));
			});
		}
	});
	user.pushHistory("useCard", useEvent);
	return record;
}

/** 本体伤害切片：damageBegin1 → 扣血 →（致死则 dying→die，dieBefore 在这一段内）→ damageEnd */
async function resolveDamage(target, source, num, nature, options = {}) {
	const damage = target.damage(num, nature);
	if (source !== undefined) damage.source = source;
	if (options.nocause) {
		delete damage.card;
		delete damage.cards;
		damage.source = null;
	}
	const record = { event: damage, numBegin: damage.num, applied: 0 };
	await damage.setContent(async () => {
		await dispatch(damage, "damageBegin1");
		record.numBegin = damage.num;
		if (options.nocause) return;
		record.applied = damage.num;
		target.hp -= damage.num;
		target.pushHistory("damage", damage);
		await dispatch(damage, "damage");
		if (target.hp <= 0 && !target.dead) await kill(target, damage);
	});
	await dispatch(damage, "damageEnd");
	return record;
}

async function kill(target, reason) {
	const dying = game.createEvent("dying");
	dying.player = target;
	dying.reason = reason;
	dying.source = reason?.source ?? null;
	dying.forceDie = true;
	await dying.setContent(async () => {
		const die = game.createEvent("die");
		die.player = target;
		die.reason = reason;
		die.source = reason?.source ?? null;
		die.forceDie = true;
		await dispatch(die, "dieBefore");
		const cards = target.getCards("hejsx");
		if (cards.length) await target.discard(cards);
		game.players.remove(target);
		game.dead.push(target);
		target.dead = true;
		return die;
	});
	return dying;
}

/** 普通技能伤害：伤害事件的父链上没有 useCard，也抄不到牌 */
async function skillDamage(source, target, num = 1) {
	const event = game.createEvent("test_jinneng");
	event.player = source;
	let record;
	await event.setContent(async () => {
		record = await resolveDamage(target, source, num);
	});
	return record;
}

async function loseHp(target, num = 1) {
	const event = target.loseHp(num);
	await event.setContent(async () => {
		target.hp -= num;
		if (target.hp <= 0 && !target.dead) await kill(target, event);
	});
	return event;
}

async function startPhase(player) {
	_status.currentPhase = player;
	const event = game.createEvent("phase");
	event.player = player;
	await dispatch(event, "phaseBegin");
	return event;
}

async function endPhase(player) {
	const event = game.createEvent("phaseEnd");
	event.player = player;
	await dispatch(event, "phaseEnd");
	const after = game.createEvent("phaseAfter");
	after.player = player;
	await dispatch(after, "phaseAfter");
	if (_status.currentPhase === player) _status.currentPhase = null;
	return event;
}

// ---------------------------------------------------------------- 装载被测技能

function loadSkills() {
	const source = fs
		.readFileSync(skillsFile, "utf8")
		.replace(/^﻿/, "")
		.replace(/^import[^\n]*;/gm, "")
		.replace(/^export\s+const\s+/gm, "const ");
	const factory = new Function("lib", "game", "ui", "get", "ai", "_status", `${source}\nreturn { skills };`);
	return factory(lib, game, ui, get, ai, _status).skills;
}

function resetWorld() {
	nextId = 0;
	game.players = [];
	game.dead = [];
	game.playerMap = {};
	game.online = false;
	lib.playerOL = {};
	lib.skill = {};
	ui.cardPile = [];
	ui.discardPile = [];
	_status.event = null;
	_status.currentPhase = null;
	_status.connectMode = false;
	_status.video = false;
	decisions.control = [];
	decisions.cards = [];
	decisions.target = [];
	for (const key of Object.keys(attitudes)) delete attitudes[key];
	const skills = loadSkills();
	lib.translate.dlhchizhuo = "炽灼";
	register("dlhchizhuo", skills.dlhchizhuo);
	return skills;
}

function register(skillId, info) {
	lib.skill[skillId] = info;
	for (const key of Object.keys(info?.subSkill ?? {})) register(`${skillId}_${key}`, info.subSkill[key]);
}

function setup(hpMap = { 大丽花: 4, 关羽: 4 }) {
	resetWorld();
	const players = {};
	for (const [name, hp] of Object.entries(hpMap)) {
		players[name] = makePlayer(name, hp);
		game.players.push(players[name]);
	}
	players.大丽花.addSkill("dlhchizhuo");
	return players;
}

function addPlayer(name, hp = 4) {
	const player = makePlayer(name, hp);
	game.players.push(player);
	return player;
}

// ---------------------------------------------------------------- 断言

const results = [];
function check(label, ok, detail = "") {
	results.push({ label, ok: Boolean(ok), detail });
}
function sameSet(actual, expected) {
	const a = (actual ?? []).map(card => card.cardid).sort((x, y) => x - y);
	const b = (expected ?? []).map(card => card.cardid).sort((x, y) => x - y);
	return a.length === b.length && a.every((value, i) => value === b[i]);
}
const held = player => player.getExpansions("dlhchizhuo");

// ---------------------------------------------------------------- 用例

/** 1：A 扣置后未造成伤害，B 造成伤害但未发动炽灼 —— A 的扣置牌不得被回收 */
async function case1() {
	const { 大丽花, 关羽 } = setup();
	giveCards(关羽, [["h", ["sha", "tao"]]]);
	await startPhase(大丽花);
	plan({ control: ["手牌区"] });
	const batchA = 关羽.getCards("h");
	await useCard(大丽花, makeCard("sha"), [关羽], { responded: true });
	check("1-A 扣置生效", sameSet(held(关羽), batchA), `扩展区${held(关羽).length}张`);
	plan({ control: ["cancel2"] });
	await useCard(大丽花, makeCard("huosha"), [关羽], { damage: 1 });
	check("1-B 伤害后 A 仍扣着", sameSet(held(关羽), batchA), `扩展区${held(关羽).length}张`);
	check("1-A 未被 B 误加伤", 关羽.hp === 3, `hp=${关羽.hp}`);
	await endPhase(大丽花);
	check("1-回合结束回收 A", sameSet(关羽.getCards("h"), batchA), `手牌${关羽.getCards("h").length}张`);
}

/** 2：A 扣置后吃普通技能伤害 —— 不回收也不加伤 */
async function case2() {
	const { 大丽花, 关羽 } = setup();
	const 张飞 = addPlayer("张飞");
	giveCards(关羽, [["h", ["sha", "tao"]]]);
	await startPhase(大丽花);
	plan({ control: ["手牌区"] });
	const batchA = 关羽.getCards("h");
	await useCard(大丽花, makeCard("sha"), [关羽], { responded: true });
	const before = 关羽.hp;
	const record = await skillDamage(张飞, 关羽, 1);
	check("2-技能伤害不回收 A", sameSet(held(关羽), batchA), `扩展区${held(关羽).length}张`);
	check("2-技能伤害不被 A 加伤", record.numBegin === 1, `num=${record.numBegin}`);
	check("2-体力只按原值扣", 关羽.hp === before - 1, `hp=${关羽.hp}`);
	await endPhase(大丽花);
	check("2-回合结束回收", sameSet(关羽.getCards("h"), batchA), `手牌${关羽.getCards("h").length}张`);
}

/** 3：A 扣置后 B 再次触发炽灼并造成伤害 —— 只回收 B */
async function case3() {
	const { 大丽花, 关羽 } = setup();
	giveCards(关羽, [["h", ["sha"]], ["e", ["gudingdao"]]]);
	await startPhase(大丽花);
	plan({ control: ["手牌区"] });
	const batchA = 关羽.getCards("h");
	await useCard(大丽花, makeCard("sha"), [关羽], { responded: true });
	plan({ control: ["装备区"] });
	const batchB = 关羽.getCards("e");
	await useCard(大丽花, makeCard("huosha"), [关羽], { damage: 1 });
	check("3-B 加伤生效", 关羽.hp === 2, `hp=${关羽.hp} 期望2（1+炽灼1）`);
	check("3-B 已回收进手牌", sameSet(关羽.getCards("h"), batchB), `手牌${关羽.getCards("h").length}张`);
	check("3-装备区已空", 关羽.getCards("e").length === 0, `装备区${关羽.getCards("e").length}张`);
	check("3-A 未被动", sameSet(held(关羽), batchA), `扩展区${held(关羽).map(c => c.name).join()}`);
	await endPhase(大丽花);
	check("3-回合结束回收 A", sameSet(关羽.getCards("h"), [...batchA, ...batchB]), `手牌${关羽.getCards("h").length}张`);
}

/** 4：A、B 均扣置并分别造成伤害 —— 分别加伤、分别回收 */
async function case4() {
	const { 大丽花, 关羽 } = setup({ 大丽花: 6, 关羽: 8 });
	giveCards(关羽, [["h", ["sha", "tao"]], ["e", ["gudingdao", "huaping"]]]);
	await startPhase(大丽花);
	plan({ control: ["手牌区"] });
	const batchA = 关羽.getCards("h");
	const recordA = await useCard(大丽花, makeCard("sha"), [关羽], { damage: 1 });
	check("4-A 自己加伤", recordA.damages[0].numBegin === 2, `num=${recordA.damages[0].numBegin} 期望2`);
	check("4-A 已回收", sameSet(关羽.getCards("h"), batchA), `手牌${关羽.getCards("h").length}张`);
	plan({ control: ["装备区"] });
	const batchB = 关羽.getCards("e");
	const recordB = await useCard(大丽花, makeCard("huosha"), [关羽], { damage: 1 });
	check("4-B 自己加伤", recordB.damages[0].numBegin === 2, `num=${recordB.damages[0].numBegin} 期望2`);
	check("4-B 已回收进手牌", sameSet(关羽.getCards("h"), [...batchA, ...batchB]), `手牌${关羽.getCards("h").length}张`);
	check("4-装备区已空", 关羽.getCards("e").length === 0, `装备区${关羽.getCards("e").length}张`);
	check("4-扩展区无残留", held(关羽).length === 0, `扩展区${held(关羽).length}张`);
}

/** 5：A、B 均扣置且都未造成伤害 —— 回合结束全部回收 */
async function case5() {
	const { 大丽花, 关羽 } = setup();
	giveCards(关羽, [["h", ["sha", "tao"]], ["e", ["gudingdao"]]]);
	await startPhase(大丽花);
	plan({ control: ["手牌区"] });
	const batchA = 关羽.getCards("h");
	await useCard(大丽花, makeCard("sha"), [关羽], { responded: true });
	plan({ control: ["装备区"] });
	const batchB = 关羽.getCards("e");
	await useCard(大丽花, makeCard("huosha"), [关羽], { responded: true });
	check("5-两批并存", held(关羽).length === 3, `扩展区${held(关羽).length}张`);
	await endPhase(大丽花);
	check("5-回合结束全部回收", sameSet(关羽.getCards("h"), [...batchA, ...batchB]), `回收后${关羽.getCards("he").length}张`);
	check("5-标记已移除", !关羽.marks.includes("dlhchizhuo"), `marks=${关羽.marks.join()}`);
	check("5-无 glory2 残留", [...batchA, ...batchB].every(card => !card.classes.has("glory2")), "牌上仍有glory2");
	check("5-子技能已卸载", !关羽.skills.some(skill => skill.startsWith("dlhchizhuo_")), `skills=${关羽.skills.join()}`);
}

/** 6：A 造成伤害时目标死亡 —— 由发动者分配 A 的扣置牌 */
async function case6() {
	const { 大丽花, 关羽 } = setup({ 大丽花: 4, 关羽: 1 });
	const 张飞 = addPlayer("张飞");
	giveCards(关羽, [["h", ["sha", "tao"]]]);
	await startPhase(大丽花);
	plan({ control: ["手牌区"] });
	const batchA = 关羽.getCards("h");
	plan({ cards: [batchA.slice()], target: [张飞] });
	await useCard(大丽花, makeCard("sha"), [关羽], { damage: 1 });
	check("6-目标死亡", 关羽.dead, `dead=${关羽.dead}`);
	check("6-牌分配给所选角色", sameSet(张飞.getCards("h"), batchA), `张飞手牌${张飞.getCards("h").length}张`);
	check("6-扩展区无残留", held(关羽).length === 0, `扩展区${held(关羽).length}张`);
	check("6-分配后无 glory2", batchA.every(card => !card.classes.has("glory2")), "残留glory2");
}

/** 7：A、B 两批并存，B 造成致命伤害 —— 不能把 A 当成 B 的扣置牌 */
async function case7() {
	const { 大丽花, 关羽 } = setup({ 大丽花: 4, 关羽: 1 });
	const 张飞 = addPlayer("张飞");
	giveCards(关羽, [["h", ["sha", "tao"]], ["e", ["gudingdao"]]]);
	await startPhase(大丽花);
	plan({ control: ["手牌区"] });
	const batchA = 关羽.getCards("h");
	await useCard(大丽花, makeCard("sha"), [关羽], { responded: true });
	plan({ control: ["装备区"] });
	const batchB = 关羽.getCards("e");
	plan({ cards: [batchB.slice()], target: [张飞] });
	await useCard(大丽花, makeCard("huosha"), [关羽], { damage: 1 });
	check("7-只分配 B", sameSet(张飞.getCards("h"), batchB), `张飞手牌${张飞.getCards("h").length}张`);
	check("7-A 未被当成 B 分配", !张飞.getCards("h").some(card => batchA.includes(card)), `混入A批${张飞.getCards("h").filter(c => batchA.includes(c)).length}张`);
	check("7-A 不留无效扩展牌", held(关羽).length === 0, `扩展区${held(关羽).length}张`);
	check("7-A 牌去向明确（本体死亡弃置）", batchA.every(card => card.area === "d"), `A批位置=${batchA.map(c => c.area).join()}`);
	check("7-目标死亡", 关羽.dead, `dead=${关羽.dead}`);
}

/** 8：两名大丽花先后对同一目标发动 —— 来源独立 */
async function case8() {
	resetWorld();
	const 大丽花A = addPlayer("大丽花A", 4);
	const 大丽花B = addPlayer("大丽花B", 4);
	const 关羽 = addPlayer("关羽", 1);
	const 张飞 = addPlayer("张飞");
	大丽花A.addSkill("dlhchizhuo");
	大丽花B.addSkill("dlhchizhuo");
	giveCards(关羽, [["h", ["sha", "tao"]], ["e", ["gudingdao", "huaping"]]]);
	await startPhase(大丽花A);
	plan({ control: ["手牌区"] });
	const batchA = 关羽.getCards("h");
	await useCard(大丽花A, makeCard("sha"), [关羽], { responded: true });
	plan({ control: ["装备区"] });
	const batchB = 关羽.getCards("e");
	plan({ cards: [batchB.slice()], target: [张飞] });
	await useCard(大丽花B, makeCard("huosha"), [关羽], { damage: 1 });
	check("8-B 的牌由 B 分配", sameSet(张飞.getCards("h"), batchB), `张飞手牌${张飞.getCards("h").length}张`);
	check("8-A 的牌未被 B 分配", !张飞.getCards("h").some(card => batchA.includes(card)));
	check("8-目标死亡", 关羽.dead, `dead=${关羽.dead}`);
	check("8-未留下无效扩展牌", held(关羽).length === 0, `扩展区${held(关羽).length}张`);
}

/** 9：多目标伤害牌 —— 各目标批次独立 */
async function case9() {
	const { 大丽花, 关羽 } = setup({ 大丽花: 6, 关羽: 6 });
	const 张飞 = addPlayer("张飞", 6);
	giveCards(关羽, [["h", ["sha"]]]);
	giveCards(张飞, [["h", ["tao"]]]);
	await startPhase(大丽花);
	plan({ control: ["手牌区", "手牌区"] });
	const guanBatch = 关羽.getCards("h");
	const zhangBatch = 张飞.getCards("h");
	const record = await useCard(大丽花, makeCard("wanjian"), [关羽, 张飞], { damage: 1 });
	check("9-两目标各加一次伤", record.damages.every(damage => damage.numBegin === 2), `num=${record.damages.map(d => d.numBegin).join()}`);
	check("9-关羽回收", sameSet(关羽.getCards("h"), guanBatch), `关羽手牌${关羽.getCards("h").length}张`);
	check("9-张飞回收", sameSet(张飞.getCards("h"), zhangBatch), `张飞手牌${张飞.getCards("h").length}张`);
	check("9-扩展区清空", held(关羽).length === 0 && held(张飞).length === 0);
	check("9-两张牌没混成一批", sameSet(guanBatch, 关羽.getCards("h")) && !张飞.getCards("h").some(card => guanBatch.includes(card)));
}

/** 10：虚拟牌没有 cardid、同一实体牌二次使用 —— 不得靠 cardid 误关联 */
async function case10() {
	const { 大丽花, 关羽 } = setup({ 大丽花: 6, 关羽: 8 });
	const 张飞 = addPlayer("张飞");
	giveCards(关羽, [["h", ["sha", "tao"]], ["e", ["gudingdao"]]]);
	await startPhase(大丽花);
	// 纯虚拟牌发动：批次记的 cardid 是 undefined
	plan({ control: ["手牌区"] });
	const batchV = 关羽.getCards("h");
	await useCard(大丽花, { name: "sha" }, [关羽], { cards: [makeCard("tao"), makeCard("yao")], responded: true });
	check("10-虚拟牌批次已建立", sameSet(held(关羽), batchV) && batchV.length === 2, `扩展区${held(关羽).length}张`);
	const viaSkill = await skillDamage(张飞, 关羽, 1);
	check("10-cardid 缺失不给技能伤害加伤", viaSkill.numBegin === 1, `num=${viaSkill.numBegin}`);
	check("10-cardid 缺失不误回收", sameSet(held(关羽), batchV), `扩展区${held(关羽).length}张`);
	// 同一实体牌第一次使用：发动炽灼扣装备区
	const reused = makeCard("huosha");
	plan({ control: ["装备区"] });
	const batchE = 关羽.getCards("e");
	await useCard(大丽花, reused, [关羽], { responded: true });
	check("10-装备区批次已建立", sameSet(held(关羽), [...batchV, ...batchE]), `扩展区${held(关羽).length}张`);
	// 同一实体牌第二次使用（cardid 相同、VCard 不同）：此时 hej 已空，炽灼不再触发
	const second = await useCard(大丽花, reused, [关羽], { damage: 1 });
	check("10-同实体牌二次使用不加旧批伤", second.damages[0].numBegin === 1, `num=${second.damages[0].numBegin}`);
	check("10-同实体牌二次使用不回收旧批", held(关羽).length === 3, `扩展区${held(关羽).length}张`);
	await endPhase(大丽花);
	check("10-回合结束全部回收", sameSet(关羽.getCards("h"), [...batchV, ...batchE]), `回收后${关羽.getCards("h").length}张`);
}

/** 11：目标已扣空所有区域 —— 不再发动，也不因新伤害回收旧批次 */
async function case11() {
	const { 大丽花, 关羽 } = setup({ 大丽花: 6, 关羽: 6 });
	giveCards(关羽, [["h", ["sha"]]]);
	await startPhase(大丽花);
	plan({ control: ["手牌区"] });
	const batchA = 关羽.getCards("h");
	await useCard(大丽花, makeCard("sha"), [关羽], { responded: true });
	check("11-扣置后所有区域为空", 关羽.countCards("hej") === 0, `hej=${关羽.countCards("hej")}`);
	const record = await useCard(大丽花, makeCard("huosha"), [关羽], { damage: 1 });
	check("11-空区域时炽灼不再触发", record.targeted.every(event => !(event.triggered ?? []).includes("dlhchizhuo")), `触发=${record.targeted.map(e => (e.triggered ?? []).join()).join()}`);
	check("11-新伤害不回收旧批次", sameSet(held(关羽), batchA), `扩展区${held(关羽).length}张`);
	await endPhase(大丽花);
	check("11-回合结束回收", sameSet(关羽.getCards("h"), batchA), `手牌${关羽.getCards("h").length}张`);
}

/** 12：状态变化后不留无效扩展牌、标记与样式 */
async function case12() {
	const { 大丽花, 关羽 } = setup();
	giveCards(关羽, [["h", ["sha", "tao"]]]);
	await startPhase(大丽花);
	plan({ control: ["手牌区"] });
	const batchA = 关羽.getCards("h");
	await useCard(大丽花, makeCard("sha"), [关羽], { responded: true });
	check("12-扣置期间有标记", 关羽.marks.includes("dlhchizhuo"), `marks=${关羽.marks.join()}`);
	check("12-扣置期间有 glory2", batchA.every(card => card.classes.has("glory2")), "未打glory2");
	await endPhase(大丽花);
	check("12-回收后无标记", !关羽.marks.includes("dlhchizhuo"), `marks=${关羽.marks.join()}`);
	check("12-回收后无子技能", !关羽.skills.some(skill => skill.startsWith("dlhchizhuo_")), `skills=${关羽.skills.join()}`);
	check("12-回收后无 glory2", batchA.every(card => !card.classes.has("glory2")), "残留glory2");
	check("12-回收后无 gaintag", batchA.every(card => !card.hasGaintag("dlhchizhuo")), "残留gaintag");
	const keys = Object.keys(关羽.storage).filter(key => key.startsWith("dlhchizhuo"));
	check("12-无残留 storage", keys.every(key => !关羽.storage[key] || (关羽.storage[key].length ?? 0) === 0), `keys=${keys.join()}`);
}

/** 13：同一次伤害事件不重复加伤、不重复回收 */
async function case13() {
	const { 大丽花, 关羽 } = setup({ 大丽花: 6, 关羽: 6 });
	giveCards(关羽, [["h", ["sha", "tao"]]]);
	await startPhase(大丽花);
	plan({ control: ["手牌区"] });
	const batchA = 关羽.getCards("h");
	const record = await useCard(大丽花, makeCard("sha"), [关羽], { damage: 1 });
	check("13-只加一次伤", record.damages[0].numBegin === 2, `num=${record.damages[0].numBegin} 期望2`);
	check("13-只回收一次", sameSet(关羽.getCards("h"), batchA), `手牌${关羽.getCards("h").length}张`);
	const extra = await resolveDamage(关羽, 大丽花, 1);
	check("13-重复同牌伤害不再加伤", extra.numBegin === 1, `num=${extra.numBegin}`);
	check("13-重复同牌伤害不再回收", 关羽.getCards("h").length === 2, `手牌${关羽.getCards("h").length}张`);
	await endPhase(大丽花);
	check("13-回合结束不多发牌", 关羽.getCards("h").length === 2, `手牌${关羽.getCards("h").length}张`);
}

/** 14：联机 / 录像形态下批次仍按事件引用结算 */
async function case14(form) {
	const { 大丽花, 关羽 } = setup({ 大丽花: 6, 关羽: form === "video" ? 1 : 6 });
	_status.connectMode = true;
	if (form === "online") game.online = true;
	else _status.video = true;
	giveCards(关羽, [["h", ["sha", "tao"]], ["e", ["gudingdao"]]]);
	await startPhase(大丽花);
	plan({ control: ["手牌区"] });
	const batchA = 关羽.getCards("h");
	await useCard(大丽花, makeCard("sha"), [关羽], { responded: true });
	plan({ control: ["装备区"] });
	const batchB = 关羽.getCards("e");
	if (form === "video") {
		const 张飞 = addPlayer("张飞");
		plan({ cards: [batchB.slice()], target: [张飞] });
	}
	await useCard(大丽花, makeCard("huosha"), [关羽], { damage: 1 });
	if (form === "online") {
		check("14-联机下 B 回收进手牌", sameSet(关羽.getCards("h"), batchB), `手牌${关羽.getCards("h").length}张`);
		check("14-联机下装备区已空", 关羽.getCards("e").length === 0, `装备区${关羽.getCards("e").length}张`);
		check("14-联机下 A 保留", sameSet(held(关羽), batchA), `扩展区${held(关羽).length}张`);
		await endPhase(大丽花);
		check("14-联机下 A 回合结束回收", sameSet(关羽.getCards("h"), [...batchA, ...batchB]), `手牌${关羽.getCards("h").length}张`);
	} else {
		const 张飞 = game.players.find(player => player.name === "张飞") ?? addPlayer("张飞");
		check("14-录像下致死分配给所选角色", sameSet(张飞.getCards("h"), batchB), `张飞手牌${张飞.getCards("h").length}张`);
		check("14-录像下 A 不当 B 分配", !张飞.getCards("h").some(card => batchA.includes(card)));
		check("14-录像下无无效扩展牌", held(关羽).length === 0, `扩展区${held(关羽).length}张`);
	}
	_status.connectMode = false;
	_status.video = false;
	game.online = false;
}

/** 15：发动者在批次挂起期间死亡 —— 牌不丢，回合结束兜底回收 */
async function caseSourceDies() {
	const { 大丽花, 关羽 } = setup({ 大丽花: 4, 关羽: 6 });
	addPlayer("张飞");
	giveCards(关羽, [["h", ["sha", "tao"]]]);
	await startPhase(大丽花);
	plan({ control: ["手牌区"] });
	const batchA = 关羽.getCards("h");
	await useCard(大丽花, makeCard("sha"), [关羽], { responded: true });
	check("15-批次已挂起", sameSet(held(关羽), batchA), `扩展区${held(关羽).length}张`);
	await kill(大丽花, null);
	check("15-发动者已死亡", 大丽花.dead, `dead=${大丽花.dead}`);
	const 张飞 = game.players.find(player => player.name === "张飞");
	await startPhase(张飞);
	await useCard(关羽, makeCard("huosha"), [关羽], { damage: 1 });
	check("15-发动者死后无关伤害不回收", sameSet(held(关羽), batchA), `扩展区${held(关羽).length}张`);
	await endPhase(张飞);
	check("15-他人回合结束兜底回收", sameSet(关羽.getCards("h"), batchA), `手牌${关羽.getCards("h").length}张`);
	check("15-回收后无残留", !关羽.skills.some(skill => skill.startsWith("dlhchizhuo_")) && !关羽.marks.includes("dlhchizhuo"), `skills=${关羽.skills.join()} marks=${关羽.marks.join()}`);
}

/** 16：炽灼中途被移除 —— 目标侧的结算与回收不受影响 */
async function caseSkillRemoved() {
	const { 大丽花, 关羽 } = setup({ 大丽花: 6, 关羽: 6 });
	giveCards(关羽, [["h", ["sha", "tao"]], ["e", ["gudingdao"]]]);
	await startPhase(大丽花);
	plan({ control: ["手牌区"] });
	const batchA = 关羽.getCards("h");
	await useCard(大丽花, makeCard("sha"), [关羽], { responded: true });
	大丽花.removeSkill("dlhchizhuo");
	plan({ control: ["cancel2"] });
	await useCard(大丽花, makeCard("huosha"), [关羽], { damage: 1 });
	check("16-技能移除后无关伤害不回收", sameSet(held(关羽), batchA), `扩展区${held(关羽).length}张`);
	await endPhase(大丽花);
	check("16-技能移除后仍回收", sameSet(关羽.getCards("h"), batchA), `手牌${关羽.getCards("h").length}张`);
	check("16-无残留状态", 关羽.getExpansions("dlhchizhuo").length === 0 && !关羽.marks.includes("dlhchizhuo"), `扩展区${held(关羽).length}张 marks=${关羽.marks.join()}`);
}

/** 17：扣置的牌被第三方拿走 —— 不重复给牌，空批次不残留 */
async function caseCardsStolen() {
	const { 大丽花, 关羽 } = setup({ 大丽花: 6, 关羽: 6 });
	const 张飞 = addPlayer("张飞");
	giveCards(关羽, [["h", ["sha", "tao"]]]);
	await startPhase(大丽花);
	plan({ control: ["手牌区"] });
	const batchA = 关羽.getCards("h");
	await useCard(大丽花, makeCard("sha"), [关羽], { responded: true });
	await 张飞.gain(batchA.slice(), "draw");
	check("17-牌已被第三方拿走", held(关羽).length === 0 && 张飞.getCards("h").length === 2, `扩展区${held(关羽).length} 张飞手牌${张飞.getCards("h").length}`);
	await endPhase(大丽花);
	check("17-回合结束不多发牌", 关羽.getCards("h").length === 0 && 张飞.getCards("h").length === 2, `关羽${关羽.getCards("h").length} 张飞${张飞.getCards("h").length}`);
	await startPhase(关羽);
	await endPhase(关羽);
	const keys = Object.keys(关羽.storage).filter(key => key.startsWith("dlhchizhuo"));
	check("17-空批次被清扫", keys.every(key => !关羽.storage[key] || (关羽.storage[key].length ?? 0) === 0) && !关羽.marks.includes("dlhchizhuo") && !关羽.skills.some(skill => skill.startsWith("dlhchizhuo_")), `keys=${keys.join()} marks=${关羽.marks.join()} skills=${关羽.skills.join()}`);
}

/** 附：无来源伤害与失去体力都不能回收 */
async function caseExtra() {
	const { 大丽花, 关羽 } = setup({ 大丽花: 6, 关羽: 6 });
	giveCards(关羽, [["h", ["sha", "tao"]]]);
	await startPhase(大丽花);
	plan({ control: ["手牌区"] });
	const batchA = 关羽.getCards("h");
	await useCard(大丽花, makeCard("sha"), [关羽], { responded: true });
	await resolveDamage(关羽, null, 1, undefined, { nocause: true });
	check("附-无来源伤害不回收", sameSet(held(关羽), batchA), `扩展区${held(关羽).length}张`);
	await loseHp(关羽, 1);
	check("附-失去体力不回收", sameSet(held(关羽), batchA), `扩展区${held(关羽).length}张`);
	await endPhase(大丽花);
	check("附-回合结束回收", sameSet(关羽.getCards("h"), batchA), `手牌${关羽.getCards("h").length}张`);
}

const cases = [
	["1", case1],
	["2", case2],
	["3", case3],
	["4", case4],
	["5", case5],
	["6", case6],
	["7", case7],
	["8", case8],
	["9", case9],
	["10", case10],
	["11", case11],
	["12", case12],
	["13", case13],
	["14a", () => case14("online")],
	["14b", () => case14("video")],
	["附", caseExtra],
	["15", caseSourceDies],
	["16", caseSkillRemoved],
	["17", caseCardsStolen],
];

for (const [label, runner] of cases) {
	try {
		await runner();
	} catch (error) {
		results.push({ label: `${label}（用例异常）`, ok: false, detail: String(error?.stack ?? error).split("\n").slice(0, 4).join(" | ") });
	}
}

const failed = results.filter(item => !item.ok);
console.log(`炽灼多批次用例：${results.length - failed.length}/${results.length} 条断言通过`);
for (const item of results) {
	console.log(`${item.ok ? "  ok" : "  FAIL"} ${item.label}${item.detail && !item.ok ? ` —— ${item.detail}` : ""}`);
}
if (failed.length) process.exitCode = 1;
