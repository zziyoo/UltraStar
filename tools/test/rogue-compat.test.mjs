// 奥特之星·肉鸽：肉鸽技能兼容性 / 全局污染 / 商店闸门 / 关卡配置抽取 的专项测试。
// node tools/test/rogue-compat.test.mjs
//
// 覆盖这一轮重构引入的新机制（其余用例在 rogue.test / rogue-data.test / rogue-mode-smoke 里）：
//   1. isSellable 异常 / 缺过滤器 → fail-closed，技能不进池；
//   2. 肉鸽不兼容技能（身份、角色专属、特殊 mode、全局 UI/变量、重副作用）不进商店；
//   3. yaoyaoyi 安装/移除后 buttonPresets 完整恢复，重复安装不污染；
//   4. mcpxingshang / mcpfangzhu 不再改写全局 AI 技能定义，AI 分值仍按「当前那一项」算；
//   5. SKILL_PURCHASE_COUNT 真正驱动一局购买上限；
//   6. 存档里的过期/非法 shopOffers 绕不过技能合法性闸门；
//   7. challengeStages 可用配置不足 10 条时明确判为配置不足，绝不循环补齐；
//   8. challengeStages 只有 1~9 项的残缺存档明确判为需重新生成。
//
// 这里的 noname 桩比 rogue.test 的多两块：ui.create.buttonPresets / MutationObserver（爻疑要改全局 UI），
// 以及 get.effect + game.filterPlayer（行殇的 AI 求值要走本体那条路）。

import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { registerHooks } from "node:module";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");

const MOCK_URL = "rogue-compat-stub:noname";
const MOCK_SRC = `
const anyFn = function () {};
export const __broadcast = [];
export const lib = {
	character: {}, skill: {}, card: {}, translate: {},
	characterSubstitute: {}, characterReplace: {},
	namePrefix: null,
	element: {}, config: { all: { mode: [] } }, rank: {}, assetURL: "", configprefix: "noname_",
	filter: {
		characterDisabled2: () => false,
		characterDisabled: () => false,
		skillDisabled(skill) {
			if (!lib.translate[skill] || !lib.translate[skill + "_info"]) {
				return true;
			}
			const info = lib.skill[skill];
			return Boolean(!info || info.unique || info.temp || info.sub || info.fixed || info.vanish);
		},
	},
	skillTags: {},
};
export const game = {
	addGroup: () => {}, addCharacterPack: () => {},
	saveExtensionConfig: () => {}, getExtensionConfig: () => null,
	playAudio: () => {}, log: () => {}, addVideo: () => {},
	players: [], dead: [],
	filterPlayer(fn) { return game.players.filter(fn); },
	hasPlayer(fn) { return game.players.some(fn); },
	countPlayer(fn) { return game.players.filter(fn).length; },
	/** 联机桩：broadcastAll 只在本机跑一遍（真机联机时这段会整段跳过） */
	broadcastAll(fn, ...args) { __broadcast.push(fn); return fn(...args); },
};
export const ui = { window: null, create: {} };
export const ai = {};
export const _status = {};

/** 本体 get.result / get.effect 的最小可信实现：只保留「读技能定义的 ai.result 并求值」这一段 */
export const get = {
	poptip: s => s,
	translation: id => lib.translate[id] ?? id,
	cnNumber: num => String(num),
	threaten: () => 1,
	recoverEffect: () => 0,
	rank: () => 0,
	cardInfo: card => card,
	filterCard: () => true,
	info: item => lib.skill[item],
	event: () => _status.event,
	result(item, skill) {
		const info = lib.skill[item];
		const result = info?.ai?.result ? { ...info.ai.result } : {};
		if (skill) {
			const extra = lib.skill[skill]?.ai?.result;
			if (extra) {
				Object.assign(result, extra);
			}
		}
		return result;
	},
	effect(target, card, player, player2) {
		const result = get.result(card, null);
		const one = typeof result.player === "function" ? result.player(player, target, card) : 0;
		const two = typeof result.target === "function" ? result.target(player, target, card) : 0;
		return (Number.isFinite(one) ? one : 0) + (Number.isFinite(two) ? two : 0);
	},
};
globalThis.MutationObserver = class {
	constructor(callback) { this.callback = callback; this.targets = []; }
	observe(target) { this.targets.push(target); }
	disconnect() { this.targets = []; }
};
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
globalThis.window = { location: { reload: () => {} } };
globalThis.document = { createElement: () => ({ style: {}, classList: { add() {}, remove() {} } }) };
`;

registerHooks({
	resolve(specifier, context, next) {
		if (specifier.endsWith("noname.js")) {
			return { url: MOCK_URL, shortCircuit: true };
		}
		return next(specifier, context);
	},
	load(url, context, next) {
		if (url === MOCK_URL) {
			return { format: "module", shortCircuit: true, source: MOCK_SRC };
		}
		return next(url, context);
	},
});

const load = async rel => import(pathToFileURL(path.join(root, rel)).href);

const cfg = await load("src/rogue/config.js");
const state = await load("src/rogue/state.js");
const shop = await load("src/rogue/shop.js");
const skillPool = await load("src/rogue/skillPool.js");
const skillCompat = await load("src/rogue/skillCompat.js");
const stagesData = await load("src/rogue/data/challengeStages.js");
const enemy = await load("src/rogue/enemy.js");
const packSkills = await load("packages/misc/skills.js");
const rogueSkills = await load("src/rogue/data/skills.js");
const { lib, game, ui, get, _status, __broadcast } = await import(MOCK_URL);

// 真机上分包技能是随扩展包注册进 lib.skill / lib.translate 的；桩里补上这一步，
// 否则「本体口径的 skillDisabled（要有 id + id_info 两个翻译键）」会把所有候选都判成不可用
Object.assign(lib.skill, rogueSkills.skill);
Object.assign(lib.translate, rogueSkills.translate);

let passed = 0;
const failures = [];

function check(name, fn) {
	try {
		const detail = fn();
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
	assert(actual === expected, `${msg ?? "值不符"}：期望 ${expected}，实际 ${actual}`);
}
function makeRng(seed) {
	let value = seed;
	return () => {
		value = (value * 1103515245 + 12345) % 2147483648;
		return value / 2147483648;
	};
}
const NOW = 1700000000000;

/** 一个只带 classList 的「手牌区」节点：爻疑要往上面挂 cardMod 与样式类 */
function makeHandNode() {
	const classes = new Set();
	return {
		cardMod: {},
		classList: {
			add: (...names) => names.forEach(name => classes.add(name)),
			remove: (...names) => names.forEach(name => classes.delete(name)),
			contains: name => classes.has(name),
		},
	};
}

console.log("奥特之星·肉鸽 兼容性与闸门专项测试\n");

// ---------------------------------------------------------------- 1. 技能池 fail-closed

check("isSellable 异常 / 缺过滤器一律 fail-closed：技能不进池", () => {
	const id = "probe_ok_skill";
	const savedFilter = lib.filter.skillDisabled;
	lib.skill[id] = { forced: true };
	lib.translate[id] = "探针";
	lib.translate[`${id}_info`] = "用来验 fail-closed 的探针技能。";
	lib.character["探针角色"] = [4, "male", "shu", [id], 1];
	try {
		// 正常时进池
		let ids = new Set(skillPool.getShopPool().map(item => item.id));
		assert(ids.has(id), "正常情况下应在池里");
		// 1) 本体过滤器抛异常 → 直接不可上架
		lib.filter.skillDisabled = () => {
			throw new Error("本体过滤器炸了");
		};
		ids = new Set(skillPool.getShopPool().map(item => item.id));
		assert(!ids.has(id), "过滤器抛异常时不得上架（fail-closed）");
		// 2) 本体过滤器缺失 → 同样不可上架
		delete lib.filter.skillDisabled;
		ids = new Set(skillPool.getShopPool().map(item => item.id));
		assert(!ids.has(id), "没有过滤器时不得上架（fail-closed）");
		// 3) 恢复后又能上架，确认不是被永久拉黑
		lib.filter.skillDisabled = savedFilter;
		ids = new Set(skillPool.getShopPool().map(item => item.id));
		assert(ids.has(id), "恢复后应重新上架");
		return "抛异常 / 缺过滤器 / 恢复 三态都对";
	} finally {
		lib.filter.skillDisabled = savedFilter;
		delete lib.skill[id];
		delete lib.translate[id];
		delete lib.translate[`${id}_info`];
		delete lib.character["探针角色"];
	}
});

check("兼容性校验层：明确禁止 / 明确允许 / 规则命中 / 定义缺失 四档都要分得开", () => {
	// 明确禁止优先于一切
	const denied = skillCompat.checkRogueSkillCompat("mcpsongwei", { zhuSkill: true });
	assert(!denied.ok && denied.by === "deny", `主公技应被明确禁止：${JSON.stringify(denied)}`);
	// 规则命中：写全局变量的技能
	const writes = skillCompat.checkRogueSkillCompat("probe_write", {
		trigger: { global: "roundEnd" },
		content() {
			_status.imchoosing = true;
		},
	});
	assert(!writes.ok && writes.by === "rule", `写 _status 应被规则拦下：${JSON.stringify(writes)}`);
	// 规则命中：硬绑角色名
	const bound = skillCompat.checkRogueSkillCompat("probe_bound", {
		filter: (event, player) => player.name === "死龙",
	});
	assert(!bound.ok && bound.by === "rule", `角色名硬绑定应被规则拦下：${JSON.stringify(bound)}`);
	// 规则命中：往场上加人
	const adder = skillCompat.checkRogueSkillCompat("probe_add", {
		async content() {
			await game.addPlayerOL(null, "路人", null, false);
		},
	});
	assert(!adder.ok && adder.by === "rule", `game.addPlayerOL 应被规则拦下：${JSON.stringify(adder)}`);
	// 明确允许压过规则
	const allowed = skillCompat.checkRogueSkillCompat("yaoyaoyi", {
		init() {
			ui.create.buttonPresets = { ...ui.create.buttonPresets };
		},
	});
	assert(allowed.ok && allowed.by === "allow", `爻疑在明确允许名单里：${JSON.stringify(allowed)}`);
	// 定义缺失 → 无法确认 → 不允许
	assert(!skillCompat.checkRogueSkillCompat("probe_none").ok, "没有定义时不得上架");
	assert(!skillCompat.checkRogueSkillCompat("").ok, "空 id 不得上架");
	// 普通技能照常通过
	assert(skillCompat.checkRogueSkillCompat("probe_plain", { trigger: { player: "phaseBegin" } }).ok, "普通技能应放行");
	return "deny / rule / allow / missing / pass 五档分清";
});

check("不兼容技能不会进商店：主公技与角色专属技能都拿不到候选", () => {
	const deniedIds = ["mcpsongwei", "xdanchao", "slyanxi", "zggylianshuai"];
	const keptIds = ["yaoyaoyi", "mcpxingshang", "mcpfangzhu", "djqiangli"];
	// 这些技能本来就在作者上架清单里（xdanchao 等），这里确认它们一个都没漏进池
	const ids = new Set(skillPool.getShopPool().map(item => item.id));
	for (const id of deniedIds) {
		assert(!ids.has(id), `肉鸽不兼容技能不得上架：${id}`);
		assert(skillCompat.ROGUE_SKILL_DENY.has(id), `${id} 必须在明确禁止名单里（不许靠规则碰巧命中）`);
	}
	for (const id of keptIds) {
		assert(ids.has(id), `已确认安全的技能不该被误杀：${id}`);
	}
	// 角色技能那一路同样过校验：给一个武将被禁用的角色挂上主公技也不该进池
	lib.character["挂主公技的"] = [4, "male", "shu", ["mcpsongwei"], 1];
	const after = new Set(skillPool.getShopPool().map(item => item.id));
	assert(!after.has("mcpsongwei"), "从武将技能这条路进来也要过兼容校验");
	delete lib.character["挂主公技的"];
	return `禁 ${deniedIds.length} 条 / 留 ${keptIds.length} 条`;
});

// ---------------------------------------------------------------- 2. 爻疑的全局 UI 覆盖

check("爻疑：安装/移除后 buttonPresets 完整恢复，重复获得不二次包裹", () => {
	const yao = packSkills.skills.yaoyaoyi;
	// 本体原始实现（用可辨识的返回值证明「还原到的是同一份实现」）
	const original = {
		card: item => `原card:${item}`,
		blank: item => `原blank:${item}`,
		tdnodes: item => `原tdnodes:${item}`,
	};
	// 装之前 ui.create.buttonPresets 的**实际内容**就是这一份对象（真机上不是本函数自己 new 的）
	const installed = { ...original };
	ui.create.buttonPresets = installed;
	const player = {
		node: { handcards1: makeHandNode(), handcards2: makeHandNode() },
		_start_cards: [],
		getCards: () => [],
		removeGaintag: () => {},
	};
	try {
		// 1) 装一次
		yao.init(player, "yaoyaoyi");
		const wrappedOnce = ui.create.buttonPresets;
		assert(wrappedOnce !== installed, "装上之后应当换成 wrapper");
		assert(wrappedOnce.card !== installed.card && wrappedOnce.blank !== installed.blank, "card/blank 都要被包住");
		assertEqual(wrappedOnce.tdnodes, installed.tdnodes, "与本技能无关的预设原样透传");
		assert(wrappedOnce.__yaoyaoyi_backup === installed, "覆盖前的原始实现整份存在 wrapper 上");

		// 2) 重复获得：只加持有数，绝不二次包裹、也绝不能把 wrapper 当成原始实现
		yao.init(player, "yaoyaoyi");
		assert(ui.create.buttonPresets === wrappedOnce, "重复获得不得再包一层");
		assertEqual(wrappedOnce.__yaoyaoyi_holders, 2, "持有数累加");
		assert(wrappedOnce.__yaoyaoyi_backup === installed, "重复获得不得覆盖备份");

		// 3) 摘一次：还有人带着 → 只减计数，wrapper 留着
		yao.onremove(player, "yaoyaoyi");
		assert(ui.create.buttonPresets === wrappedOnce, "还有人带着时不许提前拆掉 wrapper");
		assertEqual(wrappedOnce.__yaoyaoyi_holders, 1, "持有数递减");

		// 4) 摘最后一次：整份还原成覆盖前那一份
		yao.onremove(player, "yaoyaoyi");
		assert(ui.create.buttonPresets === installed, "最后一人摘掉后必须原样还原成覆盖前那一份");
		assertEqual(ui.create.buttonPresets.card("X"), "原card:X", "card 回到本体实现");
		assertEqual(ui.create.buttonPresets.blank("X"), "原blank:X", "blank 回到本体实现");

		// 5) 再走一轮装/摘：不得把上一轮的 wrapper 当成「原始实现」存起来
		yao.init(player, "yaoyaoyi");
		yao.onremove(player, "yaoyaoyi");
		assert(ui.create.buttonPresets === installed, "第二轮装摘后仍然还原到本体实现");

		// 6) 没装过就摘：不许乱动全局
		const clean = { card: () => "clean", blank: () => "clean" };
		ui.create.buttonPresets = clean;
		yao.onremove(player, "yaoyaoyi");
		assert(ui.create.buttonPresets === clean, "没装过就摘时不得改动 buttonPresets");
		return "装 1 → 重复装 2 → 摘 1 → 摘 0 完整还原；空摘不动全局";
	} finally {
		ui.create.buttonPresets = original;
	}
});

// ---------------------------------------------------------------- 3. 行殇的 AI 求值

/** 行殇/放逐求值用到的最小角色桩：两个目标刻意不一样，用来验「逐项逐目标」都绑对了 */
function makeAiPlayer(id, linked) {
	return {
		playerid: id,
		maxHp: 4,
		hp: 4,
		isLinked: () => linked,
		isTurnedOver: () => false,
		isHealthy: () => true,
		hasDisabledSlot: () => false,
		hasSkill: () => false,
		getSkills: () => [],
		getStorage: () => [],
		getStockSkills: () => [],
		countMark: () => 9,
		countCards: () => 4,
	};
}

/**
 * 「改动前那套算法」的等价复刻：先把该项的 ai 挂到全局技能定义上再求值。
 * 期望值用它算——如果新写法在「哪一项用哪一项的 ai」上有任何偏差，两边就对不上了。
 */
function valueWithPollutedGlobal(effect, target, player) {
	const def = lib.skill.mcpxingshang_aiSkill;
	const previous = def.ai;
	try {
		def.ai = effect.ai;
		return get.effect(target, "mcpxingshang_aiSkill", player, player);
	} finally {
		def.ai = previous;
	}
}

check("行殇/放逐：AI 求值不再改写全局技能定义，也不广播任何东西", () => {
	// 本体的注册结果：aiSkill 会被注册成 lib.skill.mcpxingshang_aiSkill
	lib.skill.mcpxingshang_aiSkill = packSkills.skills.mcpxingshang.subSkill.aiSkill;
	const aiRef = lib.skill.mcpxingshang_aiSkill.ai;
	const player = makeAiPlayer("p1", false);
	const other = makeAiPlayer("p2", true);
	game.players = [player, other];
	game.dead = [];
	__broadcast.length = 0;
	try {
		// 期望值：原算法（逐项过滤 → 逐目标 → 用该项自己的 ai 求），与新写法必须逐位相同
		const usable = packSkills.skills.mcpxingshang.getList.filter(effect =>
			player.countMark("mcpxingshang") >= effect.cost && effect.filter(player)
		);
		const expected = Math.max(
			...usable.map(effect => Math.max(
				...[player, other].map(target => valueWithPollutedGlobal(effect, target, player))
			))
		);
		const value = packSkills.skills.mcpxingshang.ai.result.player(player);
		assertEqual(value, expected, "分值仍按「当前正在评估的那一项 × 当前目标」算");
		assert(Number.isFinite(value), `分值必须是有限数：${value}`);
		// 至少两项真的参与了求值，否则「绑对了」这句话是空的
		assert(usable.length >= 2, `可用项至少两项：${usable.length}`);
		assert(usable.some(effect => Number.isFinite(valueWithPollutedGlobal(effect, other, player)))
			&& usable.some(effect => Number.isFinite(valueWithPollutedGlobal(effect, player, player))),
			"两个目标都能算出分值");

		// 关键断言：全局技能定义一个字节都没被改
		assert(lib.skill.mcpxingshang_aiSkill.ai === aiRef, "求值后 lib.skill.mcpxingshang_aiSkill.ai 必须是同一个对象");
		assertEqual(__broadcast.length, 0, "求值过程不得广播任何东西");

		// chooseButton.check 走的是同一条求值路径
		__broadcast.length = 0;
		// chooseButton.check 走 get.event().player，这里把当前事件摆好
		_status.event = { player };
		const buttonScore = packSkills.skills.mcpxingshang.chooseButton.check({ link: usable[usable.length - 1] });
		assert(Number.isFinite(buttonScore), `按钮排序分必须是有限数：${buttonScore}`);
		assert(lib.skill.mcpxingshang_aiSkill.ai === aiRef, "按钮排序同样不改写技能定义");
		assertEqual(__broadcast.length, 0, "按钮排序也不得广播");

		// 放逐共用同一条求值路径，一起验
		__broadcast.length = 0;
		const fangzhu = packSkills.skills.mcpfangzhu.ai.result.player(player);
		assert(Number.isFinite(fangzhu), `放逐分值必须是有限数：${fangzhu}`);
		assert(lib.skill.mcpxingshang_aiSkill.ai === aiRef, "放逐复用同一个假技能，定义同样没被改写");
		assertEqual(__broadcast.length, 0, "放逐求值也不得广播");
		return `行殇 ${value} 分 = 逐项逐目标取最大；零广播、零改写`;
	} finally {
		game.players = [];
		_status.event = null;
		delete lib.skill.mcpxingshang_aiSkill;
	}
});

check("行殇：求值异常时上下文照样还原（不留半个 ai 在身上）", () => {
	lib.skill.mcpxingshang_aiSkill = packSkills.skills.mcpxingshang.subSkill.aiSkill;
	const aiRef = lib.skill.mcpxingshang_aiSkill.ai;
	const boom = { ai: { result: { target: () => {
		throw new Error("求值炸了");
	} } }, cost: 2, filter: () => true, filterTarget: true };
	const list = packSkills.skills.mcpxingshang.getList;
	packSkills.skills.mcpxingshang.getList = [boom];
	const player = makeAiPlayer("p", false);
	game.players = [player];
	game.dead = [];
	try {
		let threw = false;
		try {
			packSkills.skills.mcpxingshang.ai.result.player(player);
		} catch {
			threw = true;
		}
		assert(threw, "技能本身抛错时不该被吞掉");
		assert(lib.skill.mcpxingshang_aiSkill.ai === aiRef, "抛错后技能定义仍然原样");
		// 上下文没留下：再求一次普通项，分值应回到正常值
		packSkills.skills.mcpxingshang.getList = list;
		const value = packSkills.skills.mcpxingshang.ai.result.player(player);
		assert(Number.isFinite(value), "异常之后还能正常求值");
		return "异常穿透 + 上下文归零";
	} finally {
		packSkills.skills.mcpxingshang.getList = list;
		game.players = [];
		delete lib.skill.mcpxingshang_aiSkill;
	}
});

// ---------------------------------------------------------------- 4. 商店闸门

check("SKILL_PURCHASE_COUNT 真正生效：买满额度后再买直接被拒", () => {
	const offers = ["g1", "g2", "g3"].map(id => ({ id, price: 10, sold: false }));
	const run = { ...state.createRun(cfg.RUN_MODE.challenge, "迪迦", NOW), currency: { gold: 999, exp: 0 }, shopOffers: offers, skills: [] };
	const first = shop.buySkill(run, "g1", null);
	assert(first.ok, first.error ?? "第一次应能买");
	assertEqual(shop.getPurchasedCount(first.run), 1, "已购计数");
	assertEqual(shop.checkSkillPurchase(first.run, "g2").ok, false, "额度用光后 checkSkillPurchase 应拒");
	const second = shop.buySkill(first.run, "g2", null);
	assert(!second.ok, `第二次必须被拒：${second.error}`);
	assert(second.error.includes(String(cfg.SKILL_PURCHASE_COUNT)), `提示要带上上限数字：${second.error}`);
	assertEqual(second.run, undefined, "被拒时不返回改过的 run");
	// 按钮侧的售罄判定与 buySkill 同一口径
	assertEqual(shop.getPurchasedCount(first.run) >= cfg.SKILL_PURCHASE_COUNT, true, "UI 侧的 isSoldOut 应为真");
	return `上限 ${cfg.SKILL_PURCHASE_COUNT} 次，第二次被拒`;
});

check("非法/过期 shopOffers 绕不过技能合法性闸门", () => {
	const stale = { id: "rogue_xushui", price: 10, sold: false };
	const notInPool = { id: "pack_wat", price: 10, sold: false };
	const good = { id: "pack_yao", price: 10, sold: false };
	const run = {
		...state.createRun(cfg.RUN_MODE.challenge, "迪迦", NOW),
		currency: { gold: 999, exp: 0 },
		shopOffers: [stale, notInPool, good],
		skills: [],
	};
	const gate = { isSkillAllowed: id => id === "pack_yao" };
	// 1) 读档清洗：下架技与非池内技直接不还原，合法的那条留着
	const cleaned = state.normalizeRun(run, gate);
	assertEqual(cleaned.shopOffers.length, 1, `读档后只应留合法候选：${JSON.stringify(cleaned.shopOffers)}`);
	assertEqual(cleaned.shopOffers[0].id, "pack_yao", "留下的是合法候选");
	// 2) 就算存档侥幸留着（不做清洗），购买前那道校验也必须挡住
	for (const id of ["rogue_xushui", "pack_wat"]) {
		const bad = shop.buySkill(run, id, null, gate);
		assert(!bad.ok, `${id} 必须买不到`);
		assert(bad.error.includes("下架"), `提示要说清是下架/不可售：${bad.error}`);
	}
	// 3) 已经买到手上的技能不受影响：清洗只动 shopOffers，skills 原样保留
	const owned = state.normalizeRun({ ...run, skills: ["pack_wat", "pack_yao"] }, gate);
	assert(owned.skills.includes("pack_wat"), "已持有的技能不得被读档清洗抢走（规则只清 shopOffers）");
	// 4) 不传闸门时保持纯逻辑行为（兼容既有调用方）
	const plain = shop.buySkill(run, "rogue_xushui", null);
	assert(plain.ok, "不传闸门时不额外拦截（纯逻辑层不读 lib）");
	return "读档清洗 + 购买前校验 双道闸门";
});

// ---------------------------------------------------------------- 5. 关卡配置抽取

check("challengeStages：可用配置不足 10 条时判为配置不足并阻止生成", () => {
	const tail = stagesData.challengeStagePool.slice(0, 4);
	const ids = tail.map(config => config.id);
	const onlyTail = config => ids.includes(config?.id);
	// 抽取层：只返回可用的 4 条，不循环补齐
	const drawn = stagesData.drawChallengeStageIds(makeRng(7), onlyTail);
	assertEqual(drawn.length, 4, "不足时按可用条数返回");
	assertEqual(new Set(drawn).size, 4, "绝不重复同一份配置");
	// ensure 层：明确判为 insufficient，且**不写回任何东西**
	const fresh = state.createRun(cfg.RUN_MODE.challenge, "迪迦", NOW);
	const ensured = enemy.ensureChallengeStages(fresh, makeRng(7), onlyTail);
	assertEqual(ensured.status, enemy.CHALLENGE_STAGE_STATE.insufficient, "应判为配置不足");
	assertEqual(ensured.generated, false, "配置不足时不算生成过");
	assertEqual(ensured.available, 4, "回报可用条数");
	assertEqual(ensured.run.challengeStages.length, 0, "配置不足时不得写回半截结果");
	assert(ensured.run === fresh, "配置不足时原 run 一个字段都不动");
	// 全部不可用：可用条数为 0，同样是 insufficient
	const none = enemy.ensureChallengeStages(fresh, makeRng(7), () => false);
	assertEqual(none.status, enemy.CHALLENGE_STAGE_STATE.insufficient, "全部不可用也是配置不足");
	assertEqual(none.available, 0, "可用条数 0");
	return "4 条可用 → insufficient，不循环补齐、不写回";
});

check("challengeStages：1~9 项的残缺存档判为需重新生成，满 10 项才是 ready", () => {
	const full = stagesData.challengeStagePool.slice(0, cfg.CHALLENGE_STAGE_LEVELS).map(config => config.id);
	const base = state.createRun(cfg.RUN_MODE.challenge, "迪迦", NOW);
	// 1) 残缺（5 项）：重抽，不当作「已经生成」
	const partial = { ...base, challengeStages: full.slice(0, 5) };
	const fixed = enemy.ensureChallengeStages(partial, makeRng(9), () => true);
	assertEqual(fixed.status, enemy.CHALLENGE_STAGE_STATE.generated, "残缺存档应重抽");
	assertEqual(fixed.generated, true, "重抽算生成");
	assertEqual(fixed.run.challengeStages.length, cfg.CHALLENGE_STAGE_LEVELS, `重抽后应满 ${cfg.CHALLENGE_STAGE_LEVELS} 项`);
	assertEqual(new Set(fixed.run.challengeStages).size, cfg.CHALLENGE_STAGE_LEVELS, "重抽结果互不重复");
	// 2) 满 10 项：ready，一个字节都不动
	const ready = { ...base, challengeStages: full };
	const kept = enemy.ensureChallengeStages(ready, makeRng(9), () => true);
	assertEqual(kept.status, enemy.CHALLENGE_STAGE_STATE.ready, "满额存档应判为 ready");
	assertEqual(kept.generated, false, "ready 不算生成");
	assert(kept.run === ready, "ready 时原 run 原样返回，绝不重掷");
	// 3) 第 11 关 / 无尽模式：完全不参与
	const late = { ...base, level: 11, challengeStages: [] };
	assertEqual(enemy.ensureChallengeStages(late, makeRng(9), () => true).status, enemy.CHALLENGE_STAGE_STATE.skipped, "第 11 关不抽");
	const endless = { ...base, mode: cfg.RUN_MODE.endless, challengeStages: [] };
	assertEqual(enemy.ensureChallengeStages(endless, makeRng(9), () => true).status, enemy.CHALLENGE_STAGE_STATE.skipped, "无尽模式不抽");
	return "5 项 → 重抽 / 10 项 → ready / 越界与无尽 → skipped";
});

console.log(`\nrogue-compat.test: passed=${passed} failed=${failures.length}`);

if (failures.length) {
	console.log(`失败用例：${failures.join("、")}`);
	process.exit(1);
}
