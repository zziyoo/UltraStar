// 奥特之星·肉鸽 冒烟测试用的本体桩模块。
// 只实现肉鸽代码真正用到的那部分，行为对齐 resources/app/src/noname 的对应函数：
// game.addMode / game.save / game.over + lib.onover / prepareArena / gameDraw / phaseLoop /
// createEvent + loop / element.player.dieAfter / Dialog + listen() / ui.create.div 参数解析。

import { challengeStagePool } from "../../src/rogue/data/challengeStages.js";
import { challengeComboPool } from "../../src/rogue/data/challengeCombos.js";

export const __log = [];
const log = entry => __log.push(entry);

/** 闯关关卡配置池引用的全部角色 id：真实游戏里由本体/其他扩展提供，桩里必须补齐，
 *  否则抽取时全部被判不可用，闯关前 10 关永远开不了战 */
const stagePoolCharacters = [...new Set(challengeStagePool.flatMap(config =>
	(config.players ?? []).map(player => player?.character).filter(id => typeof id === "string" && id)
))];
/** 闯关双人组合池引用的角色 id：同样补齐，否则 11~30 关的组合抽取全部被判不可用 */
const comboPoolCharacters = [...new Set(challengeComboPool.flatMap(config =>
	(config.players ?? []).map(player => player?.character).filter(id => typeof id === "string" && id)
))];
const FIXED_CHARACTER_IDS = ["迪迦", "佐菲", "赛文", "巴尔坦星人", "死龙", ...stagePoolCharacters, ...comboPoolCharacters];

export function resetState() {
	__log.length = 0;
	lib.config.all.mode.length = 0;
	for (const key of Object.keys(lib.mode)) {
		delete lib.mode[key];
	}
	for (const key of Object.keys(lib.skill)) {
		delete lib.skill[key];
	}
	for (const key of Object.keys(lib.translate)) {
		delete lib.translate[key];
	}
	for (const key of Object.keys(game)) {
		if (GAME_OWN_KEYS.includes(key)) {
			continue;
		}
		delete game[key];
	}
	lib.onover.length = 0;
	lib.hookmap = {};
	lib.hook = {};
	ui.dialogs.length = 0;
	ui.lastDialog = null;
	game.players.length = 0;
	game.dead.length = 0;
	game.me = null;
	game.zhu = null;
	_status.over = false;
	_status.event = null;
	delete game.no_continue_game;
	for (const key of Object.keys(storage)) {
		delete storage[key];
	}
	for (const id of Object.keys(lib.character)) {
		if (FIXED_CHARACTER_IDS.includes(id)) {
			continue;
		}
		delete lib.character[id];
	}
	// 已存在的条目保留：允许测试替换某个角色的基础数值来验强化叠加
	lib.character["迪迦"] ??= { hp: 4, maxHp: 4, skills: [] };
	lib.character["佐菲"] ??= { hp: 4, maxHp: 4, skills: [] };
	lib.character["赛文"] ??= { hp: 4, maxHp: 4, skills: [] };
	lib.character["巴尔坦星人"] ??= { hp: 4, maxHp: 4, skills: [] };
	lib.character["死龙"] ??= { hp: 34, maxHp: 34, skills: [], isHiddenBoss: true };
	for (const id of stagePoolCharacters) {
		lib.character[id] ??= { hp: 4, maxHp: 4, skills: [] };
	}
	for (const id of comboPoolCharacters) {
		lib.character[id] ??= { hp: 4, maxHp: 4, skills: [] };
	}
	for (const id of FIXED_CHARACTER_IDS) {
		lib.translate[id] = id;
	}
}

function makeNodeList(node) {
	const set = new Set((node.__classes ??= []));
	return {
		add(...args) {
			for (const item of args) {
				set.add(item);
			}
			node.__classes = [...set];
		},
		remove(...args) {
			for (const item of args) {
				set.delete(item);
			}
			node.__classes = [...set];
		},
		contains(item) {
			return set.has(item);
		},
	};
}

/** 桩只认 “.a.b” 这种纯类名选择器（本体与肉鸽代码用到的就这一种） */
function matchesSelector(node, selector) {
	return String(selector).split(".").filter(Boolean).every(cls => node.classList?.contains?.(cls));
}

function queryDescendants(node, selector, all) {
	const out = [];
	const walk = parent => {
		for (const child of parent.children ?? []) {
			if (matchesSelector(child, selector)) {
				out.push(child);
			}
			walk(child);
		}
	};
	walk(node);
	return all ? out : out.slice(0, 1);
}

export function makeNode(tag) {
	const node = {
		tagName: tag,
		children: [],
		style: {},
		dataset: {},
		__classes: [],
		__html: "",
		__listeners: [],
		__text: "",
	};
	node.classList = makeNodeList(node);
	node.style.setProperty = (key, value) => {
		node.style[key] = value;
	};
	Object.defineProperty(node, "className", {
		get: () => node.__classes.join(" "),
		set: value => {
			node.__classes = String(value).split(" ").filter(Boolean);
			node.classList = makeNodeList(node);
		},
	});
	Object.defineProperty(node, "innerHTML", {
		get: () => node.__html,
		set: value => {
			node.__html = String(value);
			// 真 DOM 里 innerHTML 会替换掉原有文本节点，桩也照做：
			// 否则「先 innerHTML 建节点、再改 textContent」的节点会留着旧文案，
			// textOf/dump 读的是 __html || __text，就会读到过期值
			node.__text = "";
		},
	});
	Object.defineProperty(node, "textContent", {
		get: () => node.__text ?? "",
		set: value => {
			node.__text = String(value);
			node.__html = "";
		},
	});
	Object.defineProperty(node, "firstChild", { get: () => node.children[0] ?? null });
	Object.defineProperty(node, "childNodes", { get: () => node.children });
	node.appendChild = child => {
		node.children.push(child);
		child.parentNode = node;
		return child;
	};
	node.insertBefore = (child, before) => {
		const from = node.children.indexOf(child);
		if (from >= 0) {
			node.children.splice(from, 1);
		}
		const index = before ? node.children.indexOf(before) : node.children.length;
		node.children.splice(index < 0 ? node.children.length : index, 0, child);
		child.parentNode = node;
		return child;
	};
	node.removeChild = child => {
		const index = node.children.indexOf(child);
		if (index >= 0) {
			node.children.splice(index, 1);
		}
		return child;
	};
	node.remove = () => {
		node.parentNode?.removeChild(node);
		node.__removed = true;
	};
	node.delete = () => {
		node.__removed = true;
		const index = ui.dialogs.indexOf(node);
		if (index >= 0) {
			ui.dialogs.splice(index, 1);
		}
		if (ui.lastDialog === node) {
			ui.lastDialog = ui.dialogs[ui.dialogs.length - 1] ?? null;
		}
	};
	node.listen = func => {
		node.__listeners.push(func);
		return node;
	};
	/** 本体给任意 div 都挂了 setBackground（HTMLDivElement.prototype，init/polyfill.js:198）；桩只记录调用 */
	node.setBackground = (link, type) => {
		node.__background = [link, type];
		return node;
	};
	node.addEventListener = (type, func) => {
		if (type === "click") {
			node.__listeners.push(func);
		}
	};
	node.querySelector = selector => queryDescendants(node, selector, false)[0] ?? null;
	node.querySelectorAll = selector => queryDescendants(node, selector, true);
	node.setPosition = () => node;
	node.css = style => Object.assign(node.style, style);
	node.getBoundingClientRect = () => ({ top: 0, left: 0, right: 300, bottom: 104, width: 300, height: 104 });
	node.update = () => node;
	node.open = () => {
		node.__opened = true;
		if (!ui.dialogs.includes(node)) {
			ui.dialogs.push(node);
		}
		ui.lastDialog = node;
		log({ type: "dialog.open" });
		return node;
	};
	node.close = () => {
		node.__opened = false;
		const index = ui.dialogs.indexOf(node);
		if (index >= 0) {
			ui.dialogs.splice(index, 1);
		}
		if (ui.lastDialog === node) {
			ui.lastDialog = ui.dialogs[ui.dialogs.length - 1] ?? null;
		}
		return node;
	};
	return node;
}

/** 对齐 ui.create.div 的参数归一化：选择串 / 内容 / 父节点 / 样式 / 监听 */
function createDiv(...args) {
	let selector = "";
	let inner = null;
	let parent = null;
	let style = null;
	let listen = null;
	for (const arg of args) {
		if (typeof arg === "function") {
			listen = arg;
		} else if (typeof arg === "number") {
			// 插入位置，桩里不需要
		} else if (arg && typeof arg === "object" && Array.isArray(arg.children)) {
			parent = arg;
		} else if (typeof arg === "object" && arg) {
			style = arg;
		} else if (typeof arg === "string") {
			if (arg[0] === "." || arg[0] === "#") {
				selector = arg;
			} else {
				inner = arg;
			}
		}
	}
	const node = makeNode("div");
	for (const part of selector.split(/(?=[.#])/)) {
		if (part[0] === ".") {
			node.classList.add(part.slice(1));
		} else if (part[0] === "#") {
			node.id = part.slice(1);
		}
	}
	if (inner !== null) {
		node.innerHTML = inner;
	}
	if (style) {
		node.css(style);
	}
	if (parent) {
		parent.appendChild(node);
	}
	if (listen) {
		node.listen(listen);
	}
	return node;
}

/** 对齐 lib.element.Dialog 的对外接口 */
function createDialog(...args) {
	const dialog = makeNode("div");
	dialog.classList.add("dialog");
	let hidden = false;
	for (const arg of args) {
		if (arg === "hidden") {
			hidden = true;
		} else if (typeof arg === "string") {
			dialog.add(arg);
		}
	}
	dialog.__hidden = hidden;
	dialog.buttons = [];
	dialog.contentContainer = dialog.appendChild(makeNode("div"));
	dialog.contentContainer.classList.add("content-container");
	dialog.content = dialog.contentContainer.appendChild(makeNode("div"));
	dialog.content.classList.add("content");
	dialog.add = item => {
		if (typeof item === "string") {
			const node = createDiv(item, dialog.content);
			node.innerHTML = item;
			return node;
		}
		return dialog.content.appendChild(item);
	};
	dialog.addText = (str, center) => {
		const node = createDiv(center ? ".text center" : ".text", dialog.content);
		node.innerHTML = str;
		return node;
	};
	dialog.addSmall = str => dialog.addText(str);
	dialog.setCaption = str => {
		dialog.__caption = str;
	};
	return dialog;
}

function makePlayer() {
	const node = createDiv(".player");
	node.__char = null;
	node.__skills = [];
	node.__alive = true;
	node.hp = 0;
	node.maxHp = 0;
	node.identity = null;
	// 对齐 player.js:131：真实 Player 创建时就带 storage
	node.storage = {};
	// 对齐本体：mark:true 的技能 addSkill 时会在角色身上建一个徽记节点（点击链路要能测）
	node.marks = {};
	node.init = character => {
		node.name = character;
		node.__char = character;
		const info = lib.character[character];
		if (!info) {
			return;
		}
		node.hp = info.hp;
		node.maxHp = info.maxHp;
		node.__skills = info.skills.slice(0);
		node.__inited = true;
	};
	node.getId = () => {
		if (!node.playerid) {
			node.playerid = "stub_player_" + (game.players.indexOf(node) + 1);
			game.playerMap[node.playerid] = node;
		}
		return node;
	};
	node.addSkill = id => {
		node.__skills.push(id);
		const info = lib.skill[id];
		// 对齐本体 addSkill 的标记分支：mark:true 才建徽记，marktext 走 id_bg 翻译
		if (info?.mark && !node.marks[id]) {
			const mark = createDiv(".mark");
			mark.link = id;
			mark.innerHTML = lib.translate[`${id}_bg`] ?? info.marktext ?? get.translation(id);
			node.appendChild(mark);
			node.marks[id] = mark;
		}
		// 对齐 player.js:11088：只有 playerid 存在时才登记触发钩子
		if (info?.trigger && node.playerid) {
			for (const role of Object.keys(info.trigger)) {
				const events = Array.isArray(info.trigger[role]) ? info.trigger[role] : [info.trigger[role]];
				for (const event of events) {
					lib.hookmap[event] = true;
				}
			}
		}
	};
	node.hasSkill = id => node.__skills.includes(id);
	node.removeSkill = id => {
		node.__skills = node.__skills.filter(item => item !== id);
		if (node.marks[id]) {
			node.marks[id].remove();
			delete node.marks[id];
		}
	};
	node.update = () => node;
	node.addTempClass = () => node;
	node.isAlive = () => node.__alive && node.hp > 0;
	node.isDead = () => !node.isAlive();
	node.getSeatNum = () => Number(node.dataset.position ?? 0);
	return node;
}

export const lib = {
	version: "stub",
	configprefix: "noname_stub_",
	config: { all: { mode: [] }, forbidai: [], mode: "identity", volumn_background: 8 },
	mode: {},
	skill: {},
	skills: {},
	translate: {},
	character: {},
	characterPack: {},
	storage: {},
	onover: [],
	hookmap: {},
	hook: {},
	onphase: [],
	onround: [],
	element: { Dialog: function (...args) { return createDialog(...args); } },
	filter: {
		characterDisabled2: id => !(lib.character[id] && !lib.character[id].isHiddenBoss),
		characterDisabled: () => false,
		/** 对齐 library/index.js 的 skillDisabled：缺翻译或带内部技标签的技能都不可选用 */
		skillDisabled(skill) {
			if (!lib.translate[skill] || !lib.translate[`${skill}_info`]) {
				return true;
			}
			const info = lib.skill[skill];
			return Boolean(!info || info.unique || info.temp || info.sub || info.fixed || info.vanish);
		},
	},
	characterSubstitute: {},
	characterReplace: {},
	namePrefix: null,
	rank: {},
	setScroll: node => node,
	setPopped: () => {},
	init: {},
	assetURL: "",
};

export const _status = { over: false, event: null, paused: false, gameStarted: false };

export const game = {
	players: [],
	playerMap: {},
	dead: [],
	me: null,
	zhu: null,
	layout: "default",
	// 分包链（data/skills.js 汇总分包技能）求值期可能调用的本体 API：桩为无害空实现
	addGroup: () => {},
	addCharacterPack: () => {},
	saveExtensionConfig: () => {},
	getExtensionConfig: () => null,
	playAudio: () => {},
	addMode(name, info, info2) {
		lib.config.all.mode.push(name);
		lib.translate[name] = info2.translate;
		info.name = name;
		lib.mode[name] = {
			name: info2.translate,
			config: info2.config,
			splash: info.splash ?? `ext:${info2.extension ?? "unknown"}/${name}.jpg`,
			fromextension: true,
		};
		lib.init[`setMode_${name}`] = async () => {
			log({ type: "importMode.lazy", name });
		};
		log({ type: "addMode", name, translate: info2.translate, extension: info2.extension, splash: lib.mode[name].splash });
	},
	saveConfig: (key, value, mode) => log({ type: "saveConfig", key, mode }),
	save(key, value) {
		// 对齐本体：value == undefined（含 null）时删除该键
		if (value == undefined) {
			delete lib.storage[key];
		} else {
			lib.storage[key] = value;
		}
		log({ type: "save", key, value: JSON.parse(JSON.stringify(value ?? null)) });
	},
	getDB: () => Promise.resolve(null),
	reload() {
		log({ type: "reload" });
	},
	reloadCurrent() {
		log({ type: "reloadCurrent" });
	},
	createEvent(name, trigger, parent) {
		const event = {
			name,
			parent: parent ?? _status.event,
			__children: [],
			setContent(content) {
				event.__content = content;
				return event;
			},
			set(key, value) {
				event[key] = value;
				return event;
			},
			async trigger(triggerName) {
				log({ type: `trigger:${triggerName}` });
			},
			forResult: () => Promise.resolve({}),
		};
		log({ type: "createEvent", name });
		return event;
	},
	loop(event = _status.event) {
		if (!event) {
			throw new Error("There is no _status.event when game.loop.");
		}
		_status.event = event;
		log({ type: "loop", name: event.name });
		if (typeof event.__content === "function") {
			event.__content(event, null, game.me);
		}
		return event;
	},
	prepareArena(num) {
		log({ type: "prepareArena", num });
		_status.prepareArena = true;
		ui.create.players(num);
		ui.create.me();
	},
	/** 对齐 game/index.js:9626 expandSkills：把每个技能声明的 group 伙伴原地去重追加进同一个数组并返回；只展开一层，group 写字符串或数组都吃 */
	expandSkills(skills, subSkill = false) {
		const adds = [];
		for (const id of skills) {
			const info = lib.skill[id];
			if (!info) {
				continue;
			}
			if (info.group) {
				const list = Array.isArray(info.group) ? info.group : [info.group];
				adds.push(...list.filter(item => lib.skill[item]));
			}
			if (subSkill && info.subSkill) {
				adds.push(...Object.keys(info.subSkill).map(key => `${id}_${key}`).filter(item => lib.skill[item]));
			}
		}
		// 本体靠 Array.prototype.add 的 includes 判断去重（polyfill 没在桩里装），这里保持同一语义
		for (const id of adds) {
			if (!skills.includes(id)) {
				skills.push(id);
			}
		}
		return skills;
	},
	gameDraw(player, num, targets) {
		const list = targets ?? game.players;
		const counts = list.map(current => (typeof num === "function" ? num(current) : num));
		log({ type: "gameDraw", from: player === game.me ? "me" : player?.__char, counts });
		return game.createEvent("gameDraw");
	},
	phaseLoop(player) {
		log({ type: "phaseLoop", player: player === game.me ? "me" : player?.__char });
		return game.createEvent("phaseLoop");
	},
	switchMode(name) {
		log({ type: "switchMode", name });
	},
	over(result) {
		if (_status.over) {
			log({ type: "over.skipped", result });
			return;
		}
		_status.over = true;
		const resultbool = typeof result === "boolean" ? result : null;
		log({ type: "over", result: resultbool });
		// 对齐本体：controls 建好之后再依次调用 lib.onover
		for (let i = 0; i < lib.onover.length; i++) {
			lib.onover[i](resultbool);
		}
	},
	log: (...args) => log({ type: "game.log", args: args.map(String) }),
	playAudio: () => {},
	getPlayer: () => null,
	giveup: () => {},
};

const GAME_OWN_KEYS = Object.keys(game);

/** 建出来的 audio 元素：大厅 BGM 用例要读它的 paused/currentTime/loop 状态 */
export const createdAudios = [];

/** 桩只实现 bgm.js 真正碰到的那几个成员，状态放在节点上供断言（不进 __log，免得打乱 API 顺序断言） */
function makeAudio() {
	const node = makeNode("audio");
	node.paused = true;
	node.ended = false;
	node.currentTime = 0;
	node.volume = 1;
	node.play = () => {
		node.paused = false;
		return Promise.resolve();
	};
	node.pause = () => {
		node.paused = true;
	};
	createdAudios.push(node);
	return node;
}

export const ui = {
	arena: makeNode("div"),
	window: makeNode("div"),
	control: { show: () => {}, hide: () => {} },
	controls: [],
	dialogs: [],
	lastDialog: null,
	clear: () => {},
	update: () => {},
	updated: () => {},
	create: {
		div: createDiv,
		dialog: (...args) => createDialog(...args),
		player: () => makePlayer(),
		/** 对齐 ui.create.button 的两种预设：character 武将牌 / tdnodes 技能按钮 */
		button(item, type, position, noClick) {
			const node = createDiv(`.button.${type}`, position);
			if (type === "tdnodes") {
				node.link = Array.isArray(item) ? item[0] : item;
				node.innerHTML = Array.isArray(item) ? item[1] : String(item);
			} else {
				node.link = item;
				node.innerHTML = get.translation(item) || String(item);
			}
			if (noClick) {
				node.classList.add("noclick");
			}
			return node;
		},
		buttons(list, type, position) {
			return list.map(item => ui.create.button(item, type, position));
		},
		/** 对齐 ui.create.characterDialog 的对外行为：搜索框 + 过滤 + dialog.buttons */
		characterDialog(...args) {
			const filter = args.find(arg => typeof arg === "function");
			const dialog = createDialog("hidden");
			dialog.classList.add("character");
			const searcher = ui.create.div(".searcher.caption", dialog.content);
			searcher.__html = "支持正则搜索和技能搜索";
			const listNode = ui.create.div(".buttons", dialog.content);
			for (const id of Object.keys(lib.character)) {
				const info = lib.character[id];
				if (info?.isBoss === true || info?.isHiddenBoss === true) {
					continue;
				}
				if (lib.config.banned?.includes(id)) {
					continue;
				}
				if (filter && filter(id)) {
					continue;
				}
				const button = ui.create.div(".button.character", get.translation(id), listNode);
				button.link = id;
				dialog.buttons.push(button);
			}
			// 对齐本体的分页：配置 showMax_character_number 决定每页张数，
			// 超出当前页的武将牌只是被加上 .nodisplay（display:none），不是被删掉
			dialog.supportsPagination = Boolean(parseInt(lib.config.showMax_character_number));
			dialog.paginationMap = new Map();
			dialog.paginationMaxCount = new Map();
			const perPage = parseInt(lib.config.showMax_character_number) || 0;
			if (perPage) {
				const data = listNode.children.slice();
				dialog.paginationMaxCount.set("character", perPage);
				const pager = {
					state: { data, pageNumber: 1, totalPageCount: Math.ceil(data.length / perPage) },
					setTotalPageCount(total) {
						pager.state.totalPageCount = total;
						pager.state.pageNumber = 1;
					},
				};
				dialog.paginationMap.set(listNode, pager);
				data.forEach((item, index) => {
					if (index >= perPage) {
						item.classList.add("nodisplay");
					}
				});
			}
			return dialog;
		},
		players(number) {
			for (let i = 0; i < number; i++) {
				const player = makePlayer();
				player.dataset.position = i;
				game.players.push(player);
			}
		},
		me() {
			if (game.players.length) {
				game.me = game.players[0];
			}
		},
		cardsAsync: () => {},
		control(label, func) {
			const node = createDiv(".control", label, ui.arena);
			node.listen(func);
			ui.controls.push(node);
			return node;
		},
	},
	setPopped: () => {},
};

/** 本体自己的背景音乐（真机是 create/index.js 建的 ui.backgroundMusic）：大厅期间要被静音、进战斗还原音量 */
ui.backgroundMusic = makeAudio();
ui.backgroundMusic.src = "audio/background/engine.mp3";
ui.backgroundMusic.loop = true;
ui.backgroundMusic.paused = false;

export const get = {
	/** 对齐本体 get/index.js 的 mode()：lib[联机 ? configOL : config].mode；桩只有单机 config */
	mode: () => lib.config.mode,
	poptip: s => s,
	translation: id => lib.translate[id] ?? id,
	config: key => lib.config[`${lib.config.mode}_${key}`] ?? lib.config[key],
	is: { phoneLayout: () => false },
	cnNumber: num => String(num),
	itemtype: () => null,
};

export const ai = {};

const storage = new Map();
globalThis.localStorage = {
	getItem: key => (storage.has(key) ? storage.get(key) : null),
	setItem: (key, value) => storage.set(key, String(value)),
	removeItem: key => storage.delete(key),
};
globalThis.window = {
	innerWidth: 1175,
	innerHeight: 800,
	location: {
		/** 真机上 window.location.reload() 与 game.reload() 都会整页重载；桩里统一记成 reload */
		reload: () => {
			log({ type: "reload" });
		},
	},
	addEventListener: () => {},
	removeEventListener: () => {},
};
globalThis.document = {
	createElement: tag => (tag === "audio" ? makeAudio() : makeNode(tag)),
	getElementById: () => null,
	head: makeNode("head"),
	body: makeNode("body"),
	querySelector: selector => globalThis.document.body.querySelector(selector),
	querySelectorAll: selector => globalThis.document.body.querySelectorAll(selector),
};

/** 技能 BGM（src/systems/bgm.js）用 new Audio(src) 建音轨：对齐真机 HTMLAudioElement 的起手式 */
globalThis.Audio = function (src) {
	const node = makeAudio();
	node.src = src;
	return node;
};

export function dumpStorage() {
	return Object.fromEntries(storage);
}
