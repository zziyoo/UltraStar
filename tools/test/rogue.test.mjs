// 奥特之星·肉鸽：数据层/逻辑层测试。node tools/test/rogue.test.mjs
// 逐条覆盖规格书第三十五节的清单。data/skills.js 会拉起分包技能链，
// 因此与 rogue-data.test.mjs 一样用桩顶掉 noname.js。
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { registerHooks } from "node:module";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");

const MOCK_URL = "rogue-test-stub:noname";
const MOCK_SRC = `
const anyFn = function () {};
export const lib = {
	character: {}, skill: {}, card: {}, translate: {},
	characterSubstitute: {}, characterReplace: {},
	namePrefix: null,
	element: {}, config: {}, rank: {}, assetURL: "",
	hook: {}, hookmap: {}, relatedTrigger: {},
	filter: new Proxy({}, { get: (t, k) => { if (!(k in t)) t[k] = anyFn; return t[k]; } }),
};
export const game = {
	addGroup: () => {}, addCharacterPack: () => {},
	saveExtensionConfig: () => {}, getExtensionConfig: () => null,
	playAudio: () => {}, log: () => {},
	// 对齐本体：removeSkill 收尾会给 removeSkillCheck 的听众发一次通知；这里记账，
	// 供断言「收尾已完成的不会被重复通知、被打断的恰好补一次」
	callHook: (name, args) => game.__hooks.push({ name, skill: args?.[0] }),
	__hooks: [],
	// 对齐本体 game.expandSkills：把每个技能声明的 group 伙伴原地去重追加进同一个数组并返回；
	// 只展开一层，group 写字符串或数组都吃（subSkill 要第二参 true，这里用不到）
	expandSkills(skills, subSkill = false) {
		const adds = [];
		for (const id of skills) {
			const info = lib.skill[id];
			if (!info) continue;
			if (info.group) {
				const list = Array.isArray(info.group) ? info.group : [info.group];
				adds.push(...list.filter(item => lib.skill[item]));
			}
			if (subSkill && info.subSkill) {
				adds.push(...Object.keys(info.subSkill).map(key => id + "_" + key).filter(item => lib.skill[item]));
			}
		}
		for (const id of adds) {
			if (!skills.includes(id)) skills.push(id);
		}
		return skills;
	},
};
export const ui = { window: null, create: {} };
export const get = { poptip: s => s, translation: id => id };
export const ai = {};
export const _status = {};
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
const reward = await load("src/rogue/reward.js");
const penalty = await load("src/rogue/penalty.js");
const common = await load("src/rogue/ui/common.js");
const groups = await load("src/rogue/data/enemyGroups.js");
const stagesData = await load("src/rogue/data/challengeStages.js");
const combosData = await load("src/rogue/data/challengeCombos.js");
const statsData = await load("src/rogue/data/stats.js");
const skillsData = await load("src/rogue/data/skills.js");
const skillPool = await load("src/rogue/skillPool.js");
const skillCompat = await load("src/rogue/skillCompat.js");
const rewardsData = await load("src/rogue/data/rewards.js");
const enemy = await load("src/rogue/enemy.js");
const battle = await load("src/rogue/battle.js");
const sacrifice = await load("src/rogue/skillSacrifice.js");
const rogueBgm = await load("src/rogue/bgm.js");
const eventsData = await load("src/rogue/data/events.js");
const curiosData = await load("src/rogue/data/curios.js");
const curioManager = await load("src/rogue/curioManager.js");
const eventManager = await load("src/rogue/eventManager.js");
const abyss = await load("src/rogue/endless/abyss.js");
const abyssConfig = await load("src/rogue/endless/abyssConfig.js");
const abyssAffixes = await load("src/rogue/endless/abyssAffixes.js");
const perf = await load("src/rogue/perf.js");
/** 桩里的 lib：与各模块拿到的是同一个对象，用来临时塞 lib.poptip 之类的桩数据 */
const { lib, game: mockGame, get: mockGet } = await import(MOCK_URL);

let passed = 0;
const failures = [];

function check(name, fn) {
	try {
		const detail = fn();
		passed++;
		if (detail) {
			console.log(`  ok   ${name} — ${detail}`);
		} else {
			console.log(`  ok   ${name}`);
		}
	} catch (error) {
		failures.push(name);
		console.log(`  FAIL ${name} — ${error?.message ?? error}`);
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

/** 异步版 check：深渊词缀的 content 全是 async（本体对同步 content 会反编译源码、丢闭包），必须等完再断言 */
async function checkAsync(name, fn) {
	try {
		const detail = await fn();
		passed++;
		if (detail) {
			console.log(`  ok   ${name} — ${detail}`);
		} else {
			console.log(`  ok   ${name}`);
		}
	} catch (error) {
		failures.push(name);
		console.log(`  FAIL ${name} — ${error?.message ?? error}`);
	}
}

const NOW = 1700000000000;
// 普通夹具技能 id：购买/存档等纯逻辑测试用，不需要真实技能定义，也避开已下架的 rogue_ 原创技能
const SKILL_A = "test_skill_a";
const SKILL_B = "test_skill_b";
const SKILL_C = "test_skill_c";

function freshRun(mode = cfg.RUN_MODE.challenge) {
	return state.createRun(mode, "迪迦", NOW);
}

// 固定的伪随机，保证候选随机的结果可复现
function makeRng(seed) {
	let value = seed;
	return () => {
		value = (value * 1103515245 + 12345) % 2147483648;
		return value / 2147483648;
	};
}

console.log("奥特之星·肉鸽 逻辑层测试\n");

check("六槽读写：空容器补齐为 6 项且可写入/读回", () => {
	const migrated = state.migrateSlots([]);
	assertEqual(migrated.slots.length, cfg.SLOT_COUNT, "槽位数");
	assert(migrated.slots.every(slot => slot === null), "初始应全为空");
	let slots = migrated.slots;
	slots = state.setSlot(slots, 2, freshRun(), NOW);
	assert(slots[2] !== null, "第3槽应有数据");
	assert(slots[0] === null && slots[5] === null, "其它槽不受影响");
	const again = state.migrateSlots(slots);
	assertEqual(again.errors.length, 0, "读回不应报错");
	assert(again.slots[2] !== null, "读回第3槽");
	return `写入/读回 ${cfg.SLOT_COUNT} 槽`;
});

check("新建存档：闯关与无尽字段正确", () => {
	const ch = freshRun(cfg.RUN_MODE.challenge);
	assertEqual(ch.mode, "challenge");
	assertEqual(ch.level, 1);
	assertEqual(ch.totalLevels, cfg.CHALLENGE_TOTAL_LEVELS);
	assertEqual(ch.skills.length, 0);
	const en = freshRun(cfg.RUN_MODE.endless);
	assertEqual(en.totalLevels, 0, "无尽无总关卡数");
	assertEqual(en.characterId, "迪迦");
	return "闯关/无尽";
});

check("删除存档：置空该槽且不影响其它槽", () => {
	let slots = state.migrateSlots([]).slots;
	slots = state.setSlot(slots, 0, freshRun(), NOW);
	slots = state.setSlot(slots, 1, freshRun(cfg.RUN_MODE.endless), NOW);
	slots = state.setSlot(slots, 0, null, NOW);
	assertEqual(slots.length, cfg.SLOT_COUNT, "长度不变");
	assert(slots[0] === null, "第1槽应为空");
	assert(slots[1] !== null, "第2槽仍在");
	return "6 槽独立";
});

check("存档校验：脏数据被修复而不崩溃", () => {
	const run = state.normalizeRun({
		version: 1,
		mode: "不存在的玩法",
		characterId: "  迪迦  ",
		level: -5,
		totalLevels: "abc",
		currency: { gold: -3, exp: Number.NaN, extra: 99 },
		skills: [SKILL_A, SKILL_A, 123, "", SKILL_B],
		stats: { defense: 99, draw: -1, attack: 2, unknownStat: 5 },
		currentBattle: { groupId: "", status: "battle" },
		shopOffers: [{ id: "", price: 1 }, { id: SKILL_A, price: "x" }, null],
		createdAt: "bad",
	});
	assertEqual(run.mode, cfg.RUN_MODE.challenge, "非法玩法回落");
	assertEqual(run.characterId, "迪迦", "去空白");
	assertEqual(run.level, 1, "关卡下限");
	assertEqual(run.totalLevels, cfg.CHALLENGE_TOTAL_LEVELS, "非法总关卡数回落默认");
	assertEqual(run.currency.gold, 0, "负数货币归零");
	assertEqual(run.currency.exp, 0, "NaN 货币归零");
	assert(!("extra" in run.currency), "未知货币被剔除");
	assertEqual(run.skills.length, 2, "技能去重后数量");
	assertEqual(JSON.stringify(run.skillInventory), JSON.stringify([SKILL_A, SKILL_B]), "清洗后的技能同步进背包（装备 ⊆ 背包）");
	assertEqual(run.stats.defense, statsData.stats.defense.maxLevel, "属性等级封顶");
	assertEqual(run.stats.draw, 0, "负属性归零");
	assertEqual(run.stats.attack, 2);
	assertEqual(run.currentBattle, null, "无有效阵容且无合法旧组合的战斗标记丢弃");
	assertEqual(run.shopOffers.length, 1, "非法候选丢弃");
	assertEqual(run.createdAt, 0, "非法时间戳归零");
	return "9 类脏数据";
});

check("存档校验：超出 6 个槽位时忽略多余数据", () => {
	const raw = [freshRun(), freshRun(), freshRun(), freshRun(), freshRun(), freshRun(), freshRun()];
	const migrated = state.migrateSlots(raw);
	assertEqual(migrated.slots.length, cfg.SLOT_COUNT, "槽位数被夹到 6");
	assert(migrated.errors.some(text => text.includes(String(cfg.SLOT_COUNT))), "应给出提示");
	return migrated.errors.join(" / ");
});

check("存档迁移：高版本存档不崩溃并明确提示", () => {
	const bad = { ...freshRun(), version: cfg.RUN_VERSION + 1 };
	const migrated = state.migrateSlots([bad]);
	assertEqual(migrated.slots[0], null, "高版本按空处理");
	assert(migrated.errors.length === 1 && migrated.errors[0].includes("高于"), "提示版本过高");
	const junk = state.migrateSlots(["字符串", 42, null]);
	assertEqual(junk.slots[0], null, "非对象按空处理");
	assert(junk.errors.length >= 1, "非对象应有提示");
	return "高版本 + 非对象";
});

check("序列化安全：函数/DOM/循环引用进不了存档", () => {
	const slots = [freshRun()];
	slots[0] = { ...slots[0], currentBattle: { groupId: "x", status: "battle" } };
	const round = state.toSerializable(slots);
	assert(round.ok, "正常存档应可序列化");
	const withFn = [{ ...freshRun(), skills: [() => 1] }];
	const normalized = state.migrateSlots(withFn);
	assertEqual(normalized.slots[0].skills.length, 0, "函数技能 id 被剔除");
	assert(state.toSerializable(normalized.slots).ok, "经校验后的存档可序列化");
	const cyclic = { skills: [] };
cyclic.self = cyclic;
	assert(!state.toSerializable([cyclic]).ok, "循环引用必须被拒绝并给出错误");
	const domLike = [{ ...freshRun(), stats: { defense: { nodeType: 1 } } }];
	assert(state.migrateSlots(domLike).slots[0].stats.defense === 0, "对象型属性值被夹成数字");
	return "拒绝循环引用";
});

check("无尽装备上限：最多 SKILL_SLOTS 个，购买一律进背包、绝不替换", () => {
	const run = freshRun(cfg.RUN_MODE.endless);
	run.currency[cfg.SKILL_CURRENCY] = 9999;
	run.skills = [SKILL_A, SKILL_B, SKILL_C];
	run.skillInventory = [SKILL_A, SKILL_B, SKILL_C];
	run.shopOffers = [{ id: "rogue_swap_in", price: 10, sold: false }];
	assertEqual(run.skills.length, cfg.SKILL_SLOTS, "先填满装备位");
	// 装备位已满照样买得动：新技能进背包，一个已装备的技能都不动（不再有替换页）
	const bought = shop.buySkill(run, "rogue_swap_in");
	assert(bought.ok, bought.error ?? "满装备也允许购买");
	assertEqual(JSON.stringify(bought.run.skills), JSON.stringify([SKILL_A, SKILL_B, SKILL_C]), "购买不动装备");
	assertEqual(JSON.stringify(bought.run.skillInventory), JSON.stringify([SKILL_A, SKILL_B, SKILL_C, "rogue_swap_in"]), "新技能进入背包");
	assertEqual(run.currency[cfg.SKILL_CURRENCY], 9999, "不改传入的 run");
	assertEqual(bought.run.currency[cfg.SKILL_CURRENCY], 9999 - 10, "照常扣款");
	// 脏数据：装备位截到上限，背包一个都不许丢（背包不设游戏规则上限）
	const overflow = state.normalizeRun({ ...run, skills: [SKILL_A, SKILL_B, SKILL_C, "rogue_d", "rogue_e"] });
	assertEqual(overflow.skills.length, cfg.SKILL_SLOTS, "装备位超槽被截断");
	for (const id of [SKILL_A, SKILL_B, SKILL_C, "rogue_d", "rogue_e"]) {
		assert(overflow.skillInventory.includes(id), `背包不得因上限丢技能：${id}`);
	}
	return `装备位 ${cfg.SKILL_SLOTS}，背包不设限`;
});

check("闯关技能栏：未满直接获得，满槽必须替换、旧技能不进背包", () => {
	const newSkill = "rogue_swap_in";
	const makeRun = () => {
		const run = freshRun(cfg.RUN_MODE.challenge);
		run.currency[cfg.SKILL_CURRENCY] = 9999;
		run.shopOffers = [{ id: newSkill, price: 10, sold: false }];
		return run;
	};
	// 未满：直接获得，不触发替换；skills 就是全部持有
	const roomy = makeRun();
	const direct = shop.buySkill(roomy, newSkill);
	assert(direct.ok, direct.error ?? "未满时应直接购买成功");
	assertEqual(JSON.stringify(direct.run.skills), JSON.stringify([newSkill]), "新技能直接进技能栏");
	assertEqual(direct.removed, null, "未满没有替换");
	assertEqual(direct.run.currency[cfg.SKILL_CURRENCY], 9999 - 10, "照常扣款");
	assertEqual(JSON.stringify(direct.run.shopOffers), JSON.stringify([{ id: newSkill, price: 10, sold: true }]), "候选标记已购");
	// 满槽：不给 replaceId 或给一个不在技能栏里的都会被拒，且零副作用
	const full = makeRun();
	full.skills = [SKILL_A, SKILL_B, SKILL_C];
	full.skillInventory = [SKILL_A, SKILL_B, SKILL_C];
	const missing = shop.buySkill(full, newSkill);
	assert(!missing.ok && missing.error.includes("技能槽已满"), "满槽必须替换");
	assertEqual(missing.run, undefined, "被拒不返回改过的 run");
	assertEqual(full.currency[cfg.SKILL_CURRENCY], 9999, "被拒不扣款");
	assertEqual(JSON.stringify(full.skills), JSON.stringify([SKILL_A, SKILL_B, SKILL_C]), "被拒不改技能栏");
	const invalid = shop.buySkill(full, newSkill, "rogue_not_owned");
	assert(!invalid.ok && invalid.error.includes("技能槽已满"), "替换目标必须是技能栏里的技能");
	// 合法替换：旧技能让位、新技能进栏；旧技能直接失去（不进背包），背包条目数不增长
	const replaced = shop.buySkill(full, newSkill, SKILL_B);
	assert(replaced.ok, replaced.error ?? "合法替换应成功");
	assertEqual(replaced.removed, SKILL_B, "回传被换下的技能");
	assertEqual(JSON.stringify(replaced.run.skills), JSON.stringify([SKILL_A, SKILL_C, newSkill]), "新技能顶替旧技能");
	assert(!replaced.run.skillInventory.includes(SKILL_B), "被换下的旧技能不得留在背包里");
	assert(replaced.run.skillInventory.includes(newSkill), "新技能同步进历史镜像（读档不变量 skills ⊆ inventory）");
	assertEqual(replaced.run.skillInventory.length, 3, "背包条目数不增长（没有额外存储）");
	assertEqual(replaced.run.currency[cfg.SKILL_CURRENCY], 9999 - 10, "成交才扣款");
	return "未满直得 / 满槽三态 / 换下即失去";
});

check("闯关旧档：残留的背包技能不提供额外存储，容量与拥有判定只认技能栏", () => {
	const legacy = state.normalizeRun({
		...freshRun(cfg.RUN_MODE.challenge),
		skills: [SKILL_A],
		skillInventory: [SKILL_B, SKILL_A, SKILL_C, "rogue_d"],
	});
	assertEqual(JSON.stringify(legacy.skills), JSON.stringify([SKILL_A]), "技能栏原样（不自动从背包装备）");
	assertEqual(legacy.skillInventory.length, 4, "背包条目保留（不静默删数据）");
	assertEqual(JSON.stringify(shop.getOwnedSkillIds(legacy)), JSON.stringify([SKILL_A]), "闯关拥有列表 = 技能栏");
	const excluded = shop.getExcludedSkillIds(legacy);
	assert(excluded.has(SKILL_A), "技能栏里的技能被排除");
	assert(!excluded.has(SKILL_B) && !excluded.has(SKILL_C), "背包残留条目不算拥有：可以重新刷出/购买");
	// 满槽时仍需替换，绝不会因为背包里有条目就直接收下
	const full = {
		...legacy,
		skills: [SKILL_A, SKILL_B, SKILL_C],
		currency: { gold: 999, exp: 0 },
		shopOffers: [{ id: "rogue_d", price: 10, sold: false }],
	};
	assertEqual(shop.getOwnedSkillIds(full).length, cfg.SKILL_SLOTS, "容量仍按技能栏计");
	assert(!shop.buySkill(full, "rogue_d").ok, "满槽不给替换目标时照旧拒绝");
	assert(!shop.equipSkill(legacy, SKILL_B).ok, "闯关不能通过装备接口把背包残留塞进技能栏");
	assert(!shop.unequipSkill(legacy, SKILL_A).ok, "闯关没有背包，不能卸下技能");
	assertEqual(legacy.currency.gold, cfg.INITIAL_CURRENCY.gold, "读档不动金币");
	return "技能栏 3 上限 + 背包条目冻结";
});

check("装备与卸下（无尽）：只改装备列表、背包与奖励都不动", () => {
	const run = state.normalizeRun({ ...freshRun(cfg.RUN_MODE.endless), skillInventory: [SKILL_A, SKILL_B] });
	// 装备：背包里的技能进装备位
	const up = shop.equipSkill(run, SKILL_A);
	assert(up.ok, up.error ?? "背包里的技能应能装备");
	assertEqual(JSON.stringify(up.run.skills), JSON.stringify([SKILL_A]), "进装备位");
	assertEqual(JSON.stringify(up.run.skillInventory), JSON.stringify([SKILL_A, SKILL_B]), "背包原样");
	// 重复装备 / 未拥有 / 满位都被拒，且零副作用
	assert(!shop.equipSkill(up.run, SKILL_A).ok, "已装备的不能再装备");
	assert(!shop.equipSkill(up.run, "rogue_not_owned").ok, "背包里没有的不能装备");
	const full = shop.equipSkill({ ...up.run, skills: [SKILL_A, SKILL_B, "rogue_c"], skillInventory: [SKILL_A, SKILL_B, "rogue_c", "rogue_d"] }, "rogue_d");
	assert(!full.ok && full.error.includes("已满"), "装备位满时拒绝并说清原因");
	// 卸下：只挪装备状态，背包保留，不算失去
	const down = shop.unequipSkill(up.run, SKILL_A);
	assert(down.ok, down.error ?? "已装备的应能卸下");
	assertEqual(JSON.stringify(down.run.skills), JSON.stringify([]), "允许 0 个装备技能");
	assertEqual(JSON.stringify(down.run.skillInventory), JSON.stringify([SKILL_A, SKILL_B]), "卸下后技能仍在背包");
	assert(!shop.unequipSkill(down.run, SKILL_A).ok, "没装备的卸不下");
	return "装备/卸下 = 只用 run.skills 与 run.skillInventory 换位";
});

check("技能背包迁移：旧档技能全量进背包、装备保持、不截断、二次读档幂等", () => {
	// v13 及更早只有 skills、没有 skillInventory：原装备保持，技能全量进背包
	const old = state.normalizeRun({ ...freshRun(), version: 13, skills: [SKILL_A, SKILL_B] });
	assertEqual(JSON.stringify(old.skills), JSON.stringify([SKILL_A, SKILL_B]), "旧档装备原样保持");
	assertEqual(JSON.stringify(old.skillInventory), JSON.stringify([SKILL_A, SKILL_B]), "旧档技能全部迁入背包");
	// 已有背包的：装备必须在背包里（缺的补进去），背包条目一个不丢、去重保序
	const mixed = state.normalizeRun({ ...freshRun(), skills: [SKILL_A], skillInventory: [SKILL_B, "rogue_c", SKILL_A, SKILL_B] });
	assertEqual(JSON.stringify(mixed.skills), JSON.stringify([SKILL_A]), "装备不受背包影响");
	assertEqual(JSON.stringify(mixed.skillInventory), JSON.stringify([SKILL_B, "rogue_c", SKILL_A]), "去重保序");
	// 装备中但背包缺失的脏数据：补进背包，绝不让「装备里有的不在背包里」
	const repaired = state.normalizeRun({ ...freshRun(), skills: [SKILL_A], skillInventory: [SKILL_B] });
	assertEqual(JSON.stringify(repaired.skillInventory), JSON.stringify([SKILL_B, SKILL_A]), "装备里的技能必须存在于背包");
	// 背包不设游戏规则上限：超过装备位也一条不截
	const many = state.normalizeRun({ ...freshRun(), skillInventory: [SKILL_A, SKILL_B, SKILL_C, "rogue_d", "rogue_e", "rogue_f"] });
	assertEqual(many.skillInventory.length, 6, "背包超过 3 个不截断");
	assertEqual(many.skills.length, 0, "背包里的技能不会自动装备");
	// 幂等：二次读档（含落盘往返）不再变化
	const once = state.normalizeRun(old);
	assertEqual(JSON.stringify(state.normalizeRun(once).skillInventory), JSON.stringify(once.skillInventory), "二次读档背包不变化");
	assertEqual(JSON.stringify(state.normalizeRun(once).skills), JSON.stringify(once.skills), "二次读档装备不变化");
	// 函数 / 数字 / 下架技能一律进不了背包
	const junk = state.normalizeRun({ ...freshRun(), skillInventory: [() => 1, "rogue_xushui", SKILL_A, 123] });
	assertEqual(JSON.stringify(junk.skillInventory), JSON.stringify([SKILL_A]), "非法与下架技能剔除");
	// 新档：空装备 + 空背包
	const fresh = freshRun();
	assertEqual(JSON.stringify(fresh.skills), JSON.stringify([]), "新档空装备");
	assertEqual(JSON.stringify(fresh.skillInventory), JSON.stringify([]), "新档空背包");
	return "旧档全量迁移 / 不截断 / 幂等 / 新档双空";
});

check("技能候选随机：数量受配置控制且写入存档后可复现", () => {
	const run = freshRun();
	const offers = shop.rollSkillOffers(run, makeRng(7), [], skillsData.pool);
	assertEqual(offers.length, Math.min(cfg.SKILL_OFFER_COUNT, skillsData.pool.length), "候选数");
	assertEqual(offers.length, cfg.SKILL_OFFER_COUNT, "候选数应等于配置");
	assert(offers.every(offer => typeof offer.id === "string" && Number.isFinite(offer.price) && offer.sold === false), "候选结构");
	const stored = state.normalizeRun({ ...run, shopOffers: offers });
	assertEqual(stored.shopOffers.length, offers.length, "候选可持久化");
	return offers.map(offer => offer.id).join(",");
});

check("重复技能过滤（无尽）：已拥有的技能不进入候选池（按完整背包判，含未装备的）", () => {
	const run = freshRun(cfg.RUN_MODE.endless);
	// 拥有整个池（含分包技能）时才应一个候选都刷不出——全放背包、一件都不装备
	run.skillInventory = skillsData.pool.map(item => item.id);
	run.skills = [];
	const offers = shop.rollSkillOffers(run, makeRng(3), [], skillsData.pool);
	assertEqual(offers.length, 0, "全拥有时候选为空");
	// 卸下不等于丢掉：只在背包里（没装备）的技能同样不可重复购买
	const ownedId = run.skillInventory[0];
	run.shopOffers = [{ id: ownedId, price: 1, sold: false }];
	const repeat = shop.buySkill(run, ownedId);
	assert(!repeat.ok && repeat.error.includes("已拥有"), "背包里已有的技能不应可重复购买");
	// 背包里的未装备技能同样要被候选排除：把它从背包删掉它才能重新出现
	const freed = shop.rollSkillOffers({ ...run, skillInventory: run.skillInventory.filter(id => id !== ownedId) }, makeRng(3), [], skillsData.pool);
	assert(freed.some(offer => offer.id === ownedId), "真正失去后才回到候选池");
	return `背包 ${run.skillInventory.length} 条全排除`;
});

check("属性最大等级：不可超过配置上限，且必须配置价格", () => {
	const run = freshRun();
	const statId = cfg.STAT_IDS[0];
	run.stats[statId] = statsData.stats[statId].maxLevel;
	const maxed = shop.checkStatUpgrade(run, statId);
	assert(!maxed.ok && maxed.error.includes("最高等级"), "满级应被拒");

	const originalPrice = statsData.stats[statId].price;
	try {
		const low = freshRun();
		low.currency[cfg.STAT_CURRENCY] = 0;
		statsData.stats[statId].price = [];
		const noPrice = shop.upgradeStat(low, statId);
		assert(!noPrice.ok, "未配置价格时购买失败");
		assert(noPrice.error.includes("价格"), "应给出未配置价格的提示");

		const priced = { ...low, currency: { ...low.currency, [cfg.STAT_CURRENCY]: 1000 } };
		statsData.stats[statId].price = [10];
		const ok = shop.upgradeStat(priced, statId);
		assert(ok.ok, ok.error ?? "配置价格后应能升级");
		assertEqual(ok.run.stats[statId], 1, "升到 1 级");
		assertEqual(ok.run.currency[cfg.STAT_CURRENCY], 990, "扣款");
	} finally {
		statsData.stats[statId].price = originalPrice;
	}
	return `${statId} 上限 ${maxed.maxLevel}`;
});

check("属性升级·无尽：按 floor(20×√目标等级) 的 √ 曲线递增，0→10 共 445", () => {
	const statId = cfg.STAT_IDS[0];
	const expected = [[1, 20], [2, 28], [3, 34], [4, 40], [5, 44], [6, 48], [7, 52], [8, 56], [9, 60], [10, 63]];
	const run = freshRun(cfg.RUN_MODE.endless);
	run.currency[cfg.STAT_CURRENCY] = 10000;
	let current = run;
	const paid = [];
	for (const [level, price] of expected) {
		const res = shop.upgradeStat(current, statId);
		assert(res.ok, res.error ?? `升到 ${level} 级应成功`);
		assertEqual(res.price, price, `升到 ${level} 级的经验`);
		assertEqual(res.run.stats[statId], level, `等级推进到 ${level}`);
		paid.push(res.price);
		current = res.run;
	}
	for (let i = 1; i < paid.length; i++) {
		assert(paid[i] >= paid[i - 1], `√ 曲线不得随等级回落：${paid.join(",")}`);
	}
	assertEqual(paid.reduce((sum, value) => sum + value, 0), 445, "单属性 0→10 总经验");
	assert(!shop.checkStatUpgrade(current, statId).ok, "满级后不再可升级");
	// 与闯关表彻底分离：同一目标等级两边报价不同
	assertEqual(shop.checkStatUpgrade(freshRun(cfg.RUN_MODE.endless), statId).price, 20, "无尽第 1 级 20 经验");
	assertEqual(shop.checkStatUpgrade(freshRun(), statId).price, 2, "闯关第 1 级仍是 2 经验");
	return `无尽 ${paid.join("→")} 共 445`;
});

check("属性升级·闯关：29 关的 330 经验能把三项全部升满（现有平衡不动）", () => {
	const run = freshRun();
	run.currency[cfg.STAT_CURRENCY] = 330; // 初始 2 + 前 29 关 328
	let current = run;
	for (const statId of cfg.STAT_IDS) {
		for (let level = 1; level <= statsData.stats[statId].maxLevel; level++) {
			const res = shop.upgradeStat(current, statId);
			assert(res.ok, res.error ?? `${statId} 升到 ${level} 级应成功`);
			current = res.run;
		}
		assertEqual(current.stats[statId], statsData.stats[statId].maxLevel, `${statId} 满级`);
	}
	assertEqual(current.currency[cfg.STAT_CURRENCY], 0, "330 经验恰好花完");
	return "三项满级，余额 0";
});

check("两模式升级经验互不共享：同一等级两边报价不同，交替读取不串档", () => {
	const statId = cfg.STAT_IDS[0];
	const challenge = freshRun();
	const endless = freshRun(cfg.RUN_MODE.endless);
	for (const run of [challenge, endless]) {
		run.stats[statId] = 3;
	}
	// 交替查询：闯关 3→4 级 8（表 [2,4,6,8]）→ 无尽 3→4 级 40（floor(20×2)）→ 再回闯关仍是 8
	assertEqual(shop.checkStatUpgrade(challenge, statId).price, 8, "闯关 3→4 级 8 经验");
	assertEqual(shop.checkStatUpgrade(endless, statId).price, 40, "无尽 3→4 级 40 经验");
	assertEqual(shop.checkStatUpgrade(challenge, statId).price, 8, "再查闯关不变（无缓存串档）");
	// 价格只认 run.mode 现算：同一份数据换个模式字段就换曲线
	assertEqual(shop.checkStatUpgrade({ ...endless, mode: cfg.RUN_MODE.challenge }, statId).price, 8, "无尽存档标成闯关时按闯关表算");
	// 扣款也各自按自己的曲线
	const rich = amount => ({ currency: { gold: 0, [cfg.STAT_CURRENCY]: amount } });
	const paidChallenge = shop.upgradeStat({ ...challenge, ...rich(100) }, statId);
	assertEqual(paidChallenge.price, 8, "闯关扣 8");
	assertEqual(paidChallenge.run.currency[cfg.STAT_CURRENCY], 92, "闯关余额");
	const paidEndless = shop.upgradeStat({ ...endless, ...rich(100) }, statId);
	assertEqual(paidEndless.price, 40, "无尽扣 40");
	assertEqual(paidEndless.run.currency[cfg.STAT_CURRENCY], 60, "无尽余额");
	return "闯关 8 / 无尽 40，互不影响";
});

check("肉鸽 BGM 独立音量：只认扩展设置（缺省 100、夹 0~100），本体音乐音量任意取值都不影响", () => {
	const key = "extension_奥特之星_rogue_bgm_volume";
	const prevMaster = lib.config.volumn_background;
	const prevRogue = lib.config[key];
	try {
		for (const master of [0, 2, 8]) {
			lib.config.volumn_background = master;
			lib.config[key] = 100;
			assertEqual(rogueBgm.getRogueBgmVolume(), 1, `本体 ${master} 时肉鸽 100% 应为 1`);
			lib.config[key] = 40;
			assertEqual(rogueBgm.getRogueBgmVolume(), 0.4, `本体 ${master} 时肉鸽 40% 应为 0.4`);
			lib.config[key] = 0;
			assertEqual(rogueBgm.getRogueBgmVolume(), 0, "肉鸽 0% 应为 0（完全静音）");
		}
		delete lib.config[key];
		assertEqual(rogueBgm.getRogueBgmVolume(), 1, "旧配置缺这个键时按默认 100");
		lib.config[key] = 250;
		assertEqual(rogueBgm.getRogueBgmVolume(), 1, "超过 100 夹到 1");
		lib.config[key] = -5;
		assertEqual(rogueBgm.getRogueBgmVolume(), 0, "负值夹到 0");
		return "本体 0/2/8 均不影响";
	} finally {
		if (prevMaster === undefined) {
			delete lib.config.volumn_background;
		} else {
			lib.config.volumn_background = prevMaster;
		}
		if (prevRogue === undefined) {
			delete lib.config[key];
		} else {
			lib.config[key] = prevRogue;
		}
	}
});

check("货币扣除：余额不足时拒绝购买且不产生负数", () => {
	const run = freshRun();
	run.currency[cfg.SKILL_CURRENCY] = 5;
	run.shopOffers = [{ id: SKILL_A, price: 100, sold: false }];
	const res = shop.buySkill(run, SKILL_A);
	assert(!res.ok, "钱不够应被拒");
	assertEqual(run.currency[cfg.SKILL_CURRENCY], 5, "余额未变");
	run.currency[cfg.SKILL_CURRENCY] = 100;
	const ok = shop.buySkill(run, SKILL_A);
	assert(ok.ok, ok.error ?? "刚好够时应成功");
	assertEqual(ok.run.currency[cfg.SKILL_CURRENCY], 0, "扣到 0");
	assertEqual(ok.run.shopOffers.find(offer => offer.id === SKILL_A).sold, true, "候选标记为已购");
	return "扣款/防负数";
});

check("货币不足 fallback：清零后给出可选惩罚，全 0 时不惩罚", () => {
	const broke = freshRun();
	for (const key of cfg.CURRENCIES) {
		broke.currency[key] = 0;
	}
	broke.skills = [SKILL_A];
	broke.skillInventory = [SKILL_A];
	broke.stats[cfg.STAT_IDS[0]] = 1;
	const res = penalty.settleDefeat(broke, NOW);
	assertEqual(res.kind, "fallback", "货币全 0 走 fallback");
	assert(res.fallback.canLoseSkill && res.fallback.canLowerStat, "两个惩罚都可选");

	const nothing = freshRun();
	for (const key of cfg.CURRENCIES) {
		nothing.currency[key] = 0;
	}
	const none = penalty.settleDefeat(nothing, NOW);
	assertEqual(none.kind, "none", "无技能、属性全 0、货币也清空时不再惩罚");

	// 闯关：背包残留条目不算「可失去的技能」——技能栏为空时不能拿它顶包（否则等于变相多出存储位）
	const bagOnly = freshRun(cfg.RUN_MODE.challenge);
	for (const key of cfg.CURRENCIES) {
		bagOnly.currency[key] = 0;
	}
	bagOnly.skills = [];
	bagOnly.skillInventory = [SKILL_A];
	const bagOnlyRes = penalty.settleDefeat(bagOnly, NOW);
	assertEqual(bagOnlyRes.kind, "none", "闯关背包残留不算可失去技能");
	assert(!bagOnlyRes.fallback.canLoseSkill, "fallback 不把背包条目列为可失去");

	const lost = penalty.loseSkill({ ...res.run }, SKILL_A, NOW);
	assert(lost.ok && !lost.run.skills.includes(SKILL_A), "失去技能");
	const lowered = penalty.lowerStat({ ...res.run }, cfg.STAT_IDS[0], NOW);
	assert(lowered.ok && lowered.run.stats[cfg.STAT_IDS[0]] === 0, "属性降级");
	const again = penalty.lowerStat(lowered.run, cfg.STAT_IDS[0], NOW);
	assert(!again.ok, "已是最低等级不能继续降");
	return "fallback 分支";
});

check("闯关胜利：固定 +50 金币、经验表入账、关卡推进、通关后不越界", () => {
	const run = freshRun();
	const first = reward.settleVictory(run, NOW);
	assertEqual(first.gained.gold, 50, "第 1 关金币固定 50");
	assertEqual(first.gained.exp, rewardsData.CHALLENGE_EXP_TABLE[1], "第 1 关经验按表");
	assertEqual(first.run.level, 2, "推进到第2关");
	assertEqual(first.run.currency.gold, cfg.INITIAL_CURRENCY.gold + 50, "金币入账（新局自带初始金币）");
	assertEqual(first.run.currency.exp, cfg.INITIAL_CURRENCY.exp + first.gained.exp, "经验入账");
	assertEqual(first.run.currentBattle, null, "战斗标记清除");

	// 奖励永远按刚完成的关卡编号算：第 10 关打赢时 level 还是 10
	const mid = { ...run, level: 10 };
	const tenth = reward.settleVictory(mid, NOW);
	assertEqual(tenth.gained.gold, 50, "第 10 关金币也是 50");
	assertEqual(tenth.gained.exp, rewardsData.CHALLENGE_EXP_TABLE[10], "第 10 关经验按表");
	assertEqual(tenth.run.level, 11, "之后再推进");

	const last = { ...run, level: cfg.CHALLENGE_TOTAL_LEVELS };
	const done = reward.settleVictory(last, NOW);
	assertEqual(done.gained.gold, 50, "第 30 关照常发最终奖励");
	assertEqual(done.run.level, cfg.CHALLENGE_TOTAL_LEVELS, "通关后关卡不越界");
	assertEqual(done.run.cleared, true, "标记已通关");
	return `首关 ${JSON.stringify(first.gained)}`;
});

check("闯关 29 连胜：经验累计恰好 330（属性三项可全部升满），金币固定 50×n", () => {
	let run = freshRun();
	for (let wonLevel = 1; wonLevel <= 29; wonLevel++) {
		assertEqual(run.level, wonLevel, `连胜第 ${wonLevel} 关前的 level`);
		const result = reward.settleVictory(run, NOW);
		assertEqual(result.gained.exp, rewardsData.CHALLENGE_EXP_TABLE[wonLevel], `第${wonLevel}关经验`);
		assertEqual(result.gained.gold, 50, `第${wonLevel}关金币固定 50`);
		run = result.run;
	}
	assertEqual(run.currency.exp, 330, "初始 2 + 前 29 关 328 = 330");
	assertEqual(run.currency.gold, cfg.INITIAL_CURRENCY.gold + 29 * 50, `金币 = 初始${cfg.INITIAL_CURRENCY.gold} + 1450`);
	// 与属性价格表对账：三项各 2+4+…+20 = 110，330 正好够全部升满
	const perStat = statsData.stats.defense.price.reduce((sum, price) => sum + price, 0);
	assertEqual(perStat, 110, "单个属性 0→10 花费");
	assertEqual(perStat * cfg.STAT_IDS.length, run.currency.exp, "总花费与总经验持平");
	return `${run.currency.exp} EXP / ${run.currency.gold} 金币`;
});

check("闯关失败：按比例损失货币且关卡不后退", () => {
	const run = freshRun();
	run.level = 8;
	for (const key of cfg.CURRENCIES) {
		run.currency[key] = 100;
	}
	run.currentBattle = { groupId: "group_zofer", status: "battle" };
	const res = penalty.settleDefeat(run, NOW);
	assertEqual(res.kind, "currency", "有货币时按比例扣");
	const rate = cfg.FAILURE_POLICY.currencyLossRate;
	assertEqual(res.run.currency.gold, Math.round(100 - Math.ceil(100 * rate)), "按配置比例扣除");
	assertEqual(res.run.level, 8, "关卡保持不变");
	assertEqual(res.run.currentBattle, null, "战斗标记清除");
	return `100 → ${res.run.currency.gold}`;
});

check("无尽失败删档：整个 run 作废而不是只扣钱", () => {
	const run = freshRun(cfg.RUN_MODE.endless);
	run.currency.gold = 5000;
	run.skills = [SKILL_A];
	run.stats[cfg.STAT_IDS[0]] = 3;
	const res = penalty.settleDefeat(run, NOW);
	assertEqual(res.kind, "delete", "无尽失败返回删档");
	assertEqual(res.run, null, "不提供残留 run");
	const slots = state.setSlot(state.migrateSlots([run]).slots, 0, null, NOW);
	assertEqual(slots[0], null, "槽位恢复为空");
	return "存档整槽清空";
});

check("敌人数：1~10 关 1 个、11~20 关 2 个、21~30 关 3 个；无尽 31 关起固定 3 个", () => {
	const bands = [[1, 1], [10, 1], [11, 2], [20, 2], [21, 3], [30, 3]];
	for (const [level, count] of bands) {
		assertEqual(enemy.getEnemyCount(level, cfg.RUN_MODE.challenge), count, `闯关第${level}关`);
		assertEqual(enemy.getEnemyCount(level, cfg.RUN_MODE.endless), count, `无尽第${level}关`);
	}
	assertEqual(enemy.getEnemyCount(31, cfg.RUN_MODE.endless), 3, "无尽第31关");
	assertEqual(enemy.getEnemyCount(100, cfg.RUN_MODE.endless), 3, "无尽第100关");
	return "两模式同一张数量表";
});

check("敌方属性分配：0~30 每一档都恰好分完，单项 0~10，超 30 按封顶处理", () => {
	for (let points = 0; points <= 30; points++) {
		for (const seed of [1, 7, 42, 99, 12345]) {
			const stats = enemy.allocateEnemyStats(points, makeRng(seed));
			assertEqual(stats.defense + stats.draw + stats.attack, points, `${points} 点必须恰好分完`);
			for (const key of cfg.STAT_IDS) {
				assert(stats[key] >= 0 && stats[key] <= 10, `${key}=${stats[key]} 越界（${points} 点）`);
			}
		}
	}
	// 超过 30 按 30 处理：三项固定满级
	assertEqual(
		JSON.stringify(enemy.allocateEnemyStats(31, makeRng(1))),
		JSON.stringify({ defense: 10, draw: 10, attack: 10 }),
		"31 点按 30 处理"
	);
	assertEqual(
		JSON.stringify(enemy.allocateEnemyStats(999, makeRng(2))),
		JSON.stringify({ defense: 10, draw: 10, attack: 10 }),
		"999 点按 30 处理"
	);
	// 15 / 29 的所有随机结果总和必须精确（抽多个种子）
	for (const seed of [1, 2, 3, 4, 5]) {
		const s15 = enemy.allocateEnemyStats(15, makeRng(seed));
		assertEqual(s15.defense + s15.draw + s15.attack, 15, "15 点分完");
		const s29 = enemy.allocateEnemyStats(29, makeRng(seed));
		assertEqual(s29.defense + s29.draw + s29.attack, 29, "29 点分完");
	}
	// 30 点只能是 10/10/10
	assertEqual(
		JSON.stringify(enemy.allocateEnemyStats(30, makeRng(3))),
		JSON.stringify({ defense: 10, draw: 10, attack: 10 }),
		"30 点固定 10/10/10"
	);
	return "0~30 全档位通过";
});

check("敌方角色池：闯关只用扩展角色，无尽只用本体未禁用角色，两池分离", () => {
	// 桩的 lib.character 初始为空：塞进扩展角色与两类本体角色后再验池子
	for (const id of ["迪迦", "佐菲", "赛文", "巴尔坦星人"]) {
		lib.character[id] = [4, "male", "shu", [], 1];
	}
	lib.character.本体武将 = [4, "male", "qun", [], 1];
	lib.character.禁用武将 = [4, "male", "qun", [], 1];
	lib.character.模式禁用 = [4, "male", "qun", [], 1];
	lib.character.死龙 = { hp: 34, maxHp: 34, skills: [], isAiForbidden: true };
	const challenge = enemy.getChallengeEnemyPool();
	assert(challenge.includes("迪迦") && challenge.includes("巴尔坦星人"), "扩展角色应进闯关池");
	assert(!challenge.includes("本体武将"), "本体角色不得混入闯关池");
	assert(!challenge.includes("死龙"), "AI 禁用的隐藏角色不得进闯关池");

	lib.config.banned = ["禁用武将"];
	lib.config.all = { mode: ["identity", "versus"] };
	lib.config.identity_banned = ["模式禁用"];
	lib.config.versus_banned = [];
	let endless;
	try {
		endless = enemy.getEndlessEnemyPool();
		// 禁将配置生效期间：getEnemyPool 应与直接调用无尽池完全一致
		assertEqual(enemy.getEnemyPool(cfg.RUN_MODE.endless).join(","), endless.join(","), "getEnemyPool 按模式分流（无尽）");
	} finally {
		delete lib.config.identity_banned;
		delete lib.config.versus_banned;
		delete lib.config.all;
		delete lib.config.banned;
	}
	assert(endless.includes("本体武将"), "未禁用的本体角色应进无尽池");
	assert(!endless.includes("迪迦") && !endless.includes("佐菲"), "扩展角色不得混入无尽池");
	assert(!endless.includes("死龙"), "AI 禁用的隐藏角色不得进无尽池");
	assert(!endless.includes("禁用武将"), "全局禁将的角色不得进无尽池");
	assert(!endless.includes("模式禁用"), "mode_banned 名单里的角色不得进无尽池");
	assertEqual(enemy.getEnemyPool(cfg.RUN_MODE.challenge).join(","), challenge.join(","), "getEnemyPool 按模式分流（闯关）");
	for (const id of ["迪迦", "佐菲", "赛文", "巴尔坦星人", "本体武将", "禁用武将", "模式禁用", "死龙"]) {
		delete lib.character[id];
	}
	return `闯关 ${challenge.length} 名 / 无尽 ${endless.length} 名`;
});

check("敌方阵容生成：数量按关卡、属性总和恰为关卡数、每名敌人独立随机", () => {
	for (const id of ["迪迦", "佐菲", "赛文", "巴尔坦星人"]) {
		lib.character[id] = [4, "male", "shu", [], 1];
	}
	const challengeIds = enemy.getChallengeEnemyPool();
	const configs = enemy.createEnemyConfigs(15, cfg.RUN_MODE.challenge, makeRng(3));
	assertEqual(configs.length, 2, "第 15 关 2 个敌人");
	for (const entry of configs) {
		assert(challengeIds.includes(entry.characterId), `角色 ${entry.characterId} 应来自扩展池`);
		assertEqual(entry.stats.defense + entry.stats.draw + entry.stats.attack, 15, "每名敌人恰 15 点");
		for (const key of cfg.STAT_IDS) {
			assert(entry.stats[key] >= 0 && entry.stats[key] <= 10, `${key} 越界`);
		}
		assertEqual(entry.skills.length, 0, "随机敌人不带额外技能");
		assertEqual(entry.maxHp, 0, "随机敌人不带体力覆盖");
	}
	// 同一场战斗里的敌人属性各随机各的：多档关卡下多次抽样应出现不同组合
	const shapes = new Set();
	for (let i = 0; i < 24; i++) {
		for (const entry of enemy.createEnemyConfigs(12, cfg.RUN_MODE.challenge, makeRng(i + 1))) {
			shapes.add(`${entry.stats.defense},${entry.stats.draw},${entry.stats.attack}`);
		}
	}
	assert(shapes.size > 1, `属性分配应随 rng 变化：${[...shapes].join(" / ")}`);
	// 无尽第 31 关：3 敌人且全部满属性（这里需要塞一个本体角色，让无尽池非空）
	lib.character.本体武将 = [4, "male", "qun", [], 1];
	const late = enemy.createEnemyConfigs(31, cfg.RUN_MODE.endless, makeRng(9));
	assertEqual(late.length, 3, "无尽第 31 关 3 个敌人");
	for (const entry of late) {
		assertEqual(JSON.stringify(entry.stats), JSON.stringify({ defense: 10, draw: 10, attack: 10 }), "满属性封顶");
	}
	assert(late.every(entry => entry.characterId === "本体武将"), "无尽敌人应来自本体池");
	delete lib.character.本体武将;
	// 池子为空时返回空数组交给上层提示，而不是报错
	for (const id of ["迪迦", "佐菲", "赛文", "巴尔坦星人"]) {
		delete lib.character[id];
	}
	assertEqual(enemy.createEnemyConfigs(5, cfg.RUN_MODE.challenge, makeRng(1)).length, 0, "池子为空返回空阵容");
	return `第15关 ${configs.map(entry => `${entry.characterId}(${entry.stats.defense}/${entry.stats.draw}/${entry.stats.attack})`).join("、")}`;
});

check("currentBattle 恢复：保存完整敌方阵容，重载原样读回而不重掷", () => {
	const enemies = [
		{ characterId: "巴尔坦星人", stats: { defense: 3, draw: 5, attack: 2 }, abyss: [], skills: [], boss: false, maxHp: 0, hp: 0 },
		{ characterId: "佐菲", stats: { defense: 10, draw: 0, attack: 0 }, abyss: [], skills: ["test_enemy_skill"], boss: true, maxHp: 2, hp: 0 },
	];
	// 整场没被判成 Boss 战（两名敌人本来就不是 Boss 形状）：残留的 boss 标记按权威标记抹平，
	// 角色/属性/技能/血量一个都不动，也不许借机重建阵容。
	// 期望值按白名单的**规范键序**逐字段写出来（含只供「复制技能」徽记展示的来源映射），
	// 这样新增一个存档字段时这里必须显式补一行，不会被 spread 悄悄带过。
	const aligned = enemies.map(entry => ({
		characterId: entry.characterId,
		stats: entry.stats,
		abyss: entry.abyss,
		skills: entry.skills,
		skillSources: {},
		boss: false,
		maxHp: entry.maxHp,
		hp: entry.hp,
	}));
	const run = state.normalizeRun({ ...freshRun(), currentBattle: { status: "battle", enemies, extra: "junk" } });
	assertEqual(run.currentBattle.status, "battle", "状态保留");
	assertEqual(run.currentBattle.enemies.length, 2, "敌人数保留");
	assertEqual(JSON.stringify(run.currentBattle.enemies), JSON.stringify(aligned), "阵容原样保留（多余字段剔除、矛盾的 boss 标记被抹平）");
	// 缺 boss 字段的旧档按普通敌人补 false，绝不报错
	const legacy = state.normalizeRun({
		...freshRun(),
		currentBattle: { status: "battle", enemies: [{ characterId: "佐菲", stats: {}, abyss: [], skills: [], maxHp: 0, hp: 0 }] },
	});
	assertEqual(legacy.currentBattle.enemies[0].boss, false, "旧档缺 boss 字段按 false 补齐");
	assertEqual(Object.keys(run.currentBattle).sort().join(","), "enemies,isBossBattle,rift,status,tempSkill", "只保留 status / enemies / rift / isBossBattle / tempSkill");
	assertEqual(run.currentBattle.tempSkill, null, "旧档没有临时技能字段 → null（不因为现在持有万象武装匣补抽）");
	assertEqual(run.currentBattle.isBossBattle, false, "v12：这一场没被判定为 Boss 战（阵容里有 boss 敌人也不等于整场是 Boss 战）");
	assertEqual(run.currentBattle.rift, null, "普通战斗没有裂隙参数");
	// 重启游戏重读同一份存档：阵容完全一致，不允许重新随机
	const reloaded = state.normalizeRun({ ...run });
	assertEqual(JSON.stringify(reloaded.currentBattle.enemies), JSON.stringify(aligned), "重载不重掷");
	assertEqual(reloaded.currentBattle.isBossBattle, false, "重载也不会把普通场翻成 Boss 场");
	// 脏数据：非法条目剔除、属性越界夹回 0~10
	const dirty = state.normalizeRun({
		...freshRun(),
		currentBattle: { status: "battle", enemies: [null, { characterId: "", stats: {} }, { characterId: "佐菲", stats: { defense: 99, draw: -3, attack: 1 } }] },
	});
	assertEqual(dirty.currentBattle.enemies.length, 1, "非法条目剔除");
	assertEqual(dirty.currentBattle.enemies[0].stats.defense, 10, "属性越界封顶");
	assertEqual(dirty.currentBattle.enemies[0].stats.draw, 0, "负属性归零");
	const broken = state.normalizeRun({ ...freshRun(), currentBattle: { status: "battle" } });
	assertEqual(broken.currentBattle, null, "无阵容视为无未完成战斗");
	const wrongStatus = state.normalizeRun({ ...freshRun(), currentBattle: { status: "shop", enemies } });
	assertEqual(wrongStatus.currentBattle, null, "未知状态视为无未完成战斗");
	return "阵容随存档固定";
});

check("旧档迁移：v2 只存 groupId 的进行中战斗按原组合还原阵容，不重掷", () => {
	const legacy = state.normalizeRun({ ...freshRun(), currentBattle: { groupId: "group_seven", status: "battle" } });
	const expected = groups.getEnemyGroup("group_seven").enemies;
	assertEqual(legacy.currentBattle.enemies.length, expected.length, "还原出的敌人数");
	assertEqual(legacy.currentBattle.enemies[0].characterId, expected[0].characterId, "角色一致");
	assertEqual(legacy.currentBattle.enemies[0].stats.defense, expected[0].overrides.defense, "属性等级一致");
	assertEqual(legacy.currentBattle.enemies[0].maxHp, expected[0].overrides.maxHp, "体力上限覆盖保留");
	assertEqual(legacy.currentBattle.enemies[0].skills.length, 0, "组合没配额外技能时阵容技能为空");
	const again = state.normalizeRun(legacy);
	assertEqual(JSON.stringify(again.currentBattle.enemies), JSON.stringify(legacy.currentBattle.enemies), "迁移结果稳定（第二次读档不变化）");
	const gone = state.normalizeRun({ ...freshRun(), currentBattle: { groupId: "group_not_exists", status: "battle" } });
	assertEqual(gone.currentBattle, null, "组合配置已删除时按无未完成战斗处理");
	return `还原 ${legacy.currentBattle.enemies.length} 个敌人`;
});

// ---------------------------------------------------------------- 闯关前 10 关：关卡配置池

check("关卡配置抽取：一次抽满前 10 关、互不重复、全部来自配置池、同一 rng 可复现", () => {
	const poolIds = new Set(stagesData.challengeStagePool.map(config => config.id));
	assert(poolIds.size >= cfg.CHALLENGE_STAGE_LEVELS, "配置池足够抽满前 10 关");
	const first = stagesData.drawChallengeStageIds(makeRng(42), () => true);
	assertEqual(first.length, cfg.CHALLENGE_STAGE_LEVELS, "第 1~10 关每关一个配置");
	assertEqual(new Set(first).size, first.length, "10 关之间不重复");
	assert(first.every(id => poolIds.has(id)), "全部来自配置池，没有 undefined / 未知 id");
	assertEqual(JSON.stringify(stagesData.drawChallengeStageIds(makeRng(42), () => true)), JSON.stringify(first), "同一 rng 序列结果一致（可复现）");
	const orders = new Set();
	for (let seed = 1; seed <= 20; seed++) {
		orders.add(JSON.stringify(stagesData.drawChallengeStageIds(makeRng(seed), () => true)));
	}
	assert(orders.size > 1, "不同 rng 应产生不同的抽取顺序（不写死固定顺序）");
	return first.join(" → ");
});

check("关卡配置抽取（注入判定）：被剔配置绝不出现；可用不足 10 个时明确返回不足而不是循环补齐", () => {
	const excluded = stagesData.challengeStagePool[0].id;
	const filtered = stagesData.drawChallengeStageIds(makeRng(7), config => config.id !== excluded);
	assert(filtered.every(id => id !== excluded), "被判定不可用的配置不参与抽取");
	assertEqual(new Set(filtered).size, filtered.length, "可用配置够时前 10 关互不重复");
	const tail = stagesData.challengeStagePool.slice(0, 4).map(config => config.id);
	const short = stagesData.drawChallengeStageIds(makeRng(7), config => tail.includes(config.id));
	assertEqual(short.length, tail.length, "可用不足 10 个时按可用条数返回，绝不循环补齐");
	assert(short.every(id => tail.includes(id)), "返回的都在可用集合里");
	assertEqual(new Set(short).size, short.length, "不为凑数而重复同一份配置");
	assertEqual(stagesData.drawChallengeStageIds(makeRng(7), () => false).length, 0, "全部不可用时返回空数组交上层报错");
	return `可用 4 个时只返回 ${short.length} 条：${short.join("、")}`;
});

check("关卡配置抽取默认闸门：只看角色是否存在，禁将的照抽照打", () => {
	const config = stagesData.challengeStagePool[0];
	const characterId = config.players[0].character;
	const savedEnemy = lib.character[characterId];
	const savedPlayer = lib.character["迪迦"];
	try {
		assertEqual(enemy.isStageConfigDrawable(config), false, "角色不存在 → 不参与抽取");
		lib.character[characterId] = { hp: 4, maxHp: 4, skills: [] };
		lib.character["迪迦"] ??= { hp: 4, maxHp: 4, skills: [] };
		assertEqual(enemy.isStageConfigDrawable(config), true, "角色存在 → 参与抽取");
		lib.config.forbidai = [characterId];
		assertEqual(enemy.isEnemyUsable(characterId), false, "禁将口径下 isEnemyUsable 为假");
		assertEqual(enemy.isStageConfigDrawable(config), true, "禁将不影响抽取判定");
		// 开战校验：闯关前 10 关放行禁将角色，其余战斗路径维持原口径
		const enemies = enemy.createStageEnemyConfigs(config, 3, makeRng(1));
		const run = freshRun();
		assertEqual(battle.resolveBattle(run, enemies, { allowBanned: true }).enemies.length, 1, "allowBanned 放行禁将角色");
		assertEqual(battle.resolveBattle(run, enemies).ok, false, "默认口径下禁将角色仍被拒");
		// 角色不存在时放行路径也兜底报错
		delete lib.character[characterId];
		assertEqual(battle.resolveBattle(run, enemies, { allowBanned: true }).ok, false, "角色不存在时 allowBanned 也报错");
	} finally {
		delete lib.config.forbidai;
		if (savedEnemy) {
			lib.character[characterId] = savedEnemy;
		} else {
			delete lib.character[characterId];
		}
		if (!savedPlayer) {
			delete lib.character["迪迦"];
		}
	}
	return "存在才抽；禁将照抽照打（仅闯关前 10 关放行）";
});

check("ensureChallengeStages：新局一次性生成；已生成 / 第 11 关起 / 无尽一律不动", () => {
	const always = () => true;
	const created = enemy.ensureChallengeStages(freshRun(), makeRng(11), always);
	assert(created.generated, "闯关新局应生成");
	assertEqual(created.run.challengeStages.length, cfg.CHALLENGE_STAGE_LEVELS, "一次生成前 10 关");
	const untouched = enemy.ensureChallengeStages(created.run, makeRng(12), always);
	assert(!untouched.generated, "已有抽取结果不再生成");
	assertEqual(JSON.stringify(untouched.run.challengeStages), JSON.stringify(created.run.challengeStages), "读档/重进沿用原结果，不重抽");
	const late = enemy.ensureChallengeStages({ ...freshRun(), level: 11 }, makeRng(13), always);
	assert(!late.generated && late.run.challengeStages.length === 0, "第 11 关起不再需要关卡配置");
	const endless = enemy.ensureChallengeStages(freshRun(cfg.RUN_MODE.endless), makeRng(14), always);
	assert(!endless.generated && endless.run.challengeStages.length === 0, "无尽模式不生成");
	return "只在「闯关 + 前 10 关 + 尚无结果」时生成一次";
});

check("关卡配置 → 阵容：single 与 group 统一按 players 解析，指定属性/技能直接生效", () => {
	const single = stagesData.challengeStagePool.find(config => config.type === "single");
	const one = enemy.createStageEnemyConfigs(single, 5, makeRng(3));
	assertEqual(one.length, 1, "single 生成 1 个敌人");
	assertEqual(one[0].characterId, single.players[0].character, "角色来自配置");
	assertEqual(one[0].stats.defense + one[0].stats.draw + one[0].stats.attack, 5, "未指定属性时按关卡数随机分配（与常规随机同口径）");
	assertEqual(one[0].abyss.length, 0, "闯关没有深渊词缀");
	assertEqual(one[0].skills.length, 0, "未指定技能时阵容技能为空");
	const group = {
		id: "测试组合",
		type: "group",
		players: [
			{ character: "角色A" },
			{ character: "角色B", stats: { defense: 3, draw: 1 } },
			{ character: "角色C", skills: [SKILL_A], maxHp: 2 },
		],
	};
	const many = enemy.createStageEnemyConfigs(group, 8, makeRng(4));
	assertEqual(many.length, 3, "group 按成员数生成敌人");
	assertEqual(many[0].characterId, "角色A", "逐个成员解析");
	assertEqual(many[0].stats.defense + many[0].stats.draw + many[0].stats.attack, 8,
		"多人不共享预算：随机成员各自独立吃满关卡数 8 点");
	assertEqual(JSON.stringify(many[1].stats), JSON.stringify({ defense: 3, draw: 1, attack: 0 }), "指定属性原样生效（缺省键按 0）");
	assertEqual(many[1].stats.defense + many[1].stats.draw + many[1].stats.attack, 4, "指定属性不再随机分配");
	assertEqual(many[2].skills.join(","), SKILL_A, "指定技能进入阵容");
	assertEqual(many[2].maxHp, 2, "体力覆盖进入阵容");
	assertEqual(JSON.stringify(enemy.createStageEnemyConfigs(single, 5, makeRng(3))), JSON.stringify(one), "同一 rng 可复现");
	return `${single.id}（single）与 ${group.id}（group）走同一条生成路径`;
});

check("组合预算：每个未指定属性的成员各自独立吃一份完整等级预算（多人不再共享）", () => {
	const total = entry => entry.stats.defense + entry.stats.draw + entry.stats.attack;
	const inBounds = entry => Object.values(entry.stats).every(value => value >= 0 && value <= 10);
	// 2 人组合：每人各吃 8 点，互不分摊（第 11~20 关同规则）
	const pair = { id: "两人", type: "group", players: [{ character: "角色A" }, { character: "角色B" }] };
	const built = enemy.createStageEnemyConfigs(pair, 8, makeRng(4));
	assertEqual(built.length, 2, "组合仍是 2 个敌人");
	assertEqual(total(built[0]), 8, "敌人A 独立 8 点");
	assertEqual(total(built[1]), 8, "敌人B 独立 8 点（不被敌人A 分走）");
	assert(built.every(inBounds), "两人三项都在 0~10 内");
	// 写了固定 stats 的成员照用配置值，不参与随机也不被覆盖
	const mixed = {
		id: "混合", type: "group",
		players: [{ character: "角色A", stats: { defense: 5, draw: 5, attack: 0 } }, { character: "角色B" }, { character: "角色C" }],
	};
	const many = enemy.createStageEnemyConfigs(mixed, 9, makeRng(4));
	assertEqual(JSON.stringify(many[0].stats), JSON.stringify({ defense: 5, draw: 5, attack: 0 }), "固定属性原样保留");
	assertEqual(total(many[1]), 9, "随机成员B 独立 9 点");
	assertEqual(total(many[2]), 9, "随机成员C 独立 9 点");
	// 第 30 关边界：单人可分到 10/10/10（单项上限 10、总上限 30）
	const cap = enemy.createStageEnemyConfigs({ id: "满级", type: "single", players: [{ character: "角色A" }] }, 30, makeRng(5));
	assertEqual(JSON.stringify(cap[0].stats), JSON.stringify({ defense: 10, draw: 10, attack: 10 }), "第 30 关单人恰好 10/10/10");
	return "双人 8+8 / 固定属性原样保留 / 30 关 10/10/10";
});

check("challengeStages 存档：白名单清洗、位置稳定、cloneRun 读档不重掷", () => {
	const stages = stagesData.drawChallengeStageIds(makeRng(21), () => true);
	const run = state.normalizeRun({ ...freshRun(), challengeStages: stages });
	assertEqual(JSON.stringify(run.challengeStages), JSON.stringify(stages), "合法抽取结果原样落档");
	assertEqual(JSON.stringify(state.cloneRun(run).challengeStages), JSON.stringify(stages), "cloneRun（读档路径）原样还原");
	// 位置表：非字符串剔除、空白修剪；池里已不存在的 id 保留原位（剔除会让后面的关卡整体前移 = 换敌人）
	const dirty = state.normalizeRun({ ...freshRun(), challengeStages: [42, null, "  界孙权  ", "已删除的配置", ""] });
	assertEqual(JSON.stringify(dirty.challengeStages), JSON.stringify(["界孙权", "已删除的配置"]), "只剔除非字符串与空白，字符串原位保留");
	const legacy = state.normalizeRun({ ...freshRun() });
	assertEqual(legacy.challengeStages.length, 0, "旧档没有字段时按空数组补齐（首次开战再补抽）");
	const overflow = state.normalizeRun({ ...freshRun(), challengeStages: [...stages, "extra_a", "extra_b"] });
	assertEqual(overflow.challengeStages.length, cfg.CHALLENGE_STAGE_LEVELS, "超出前 10 关的截断");
	return "位置表随存档固定，读档绝不重掷";
});

check("新局流程（mode.js 同款调用）：createRun + ensure 后逐关可按 challengeStages[level-1] 解析", () => {
	const run = enemy.ensureChallengeStages(state.createRun(cfg.RUN_MODE.challenge, "迪迦", NOW), makeRng(5), () => true).run;
	for (let level = 1; level <= cfg.CHALLENGE_STAGE_LEVELS; level++) {
		const config = stagesData.getChallengeStageConfig(run.challengeStages[level - 1]);
		assert(config, `第 ${level} 关应能取到配置`);
		const enemies = enemy.createStageEnemyConfigs(config, level, makeRng(level));
		assert(enemies.length > 0, `第 ${level} 关能生成阵容`);
		assert(enemies.every(entry => entry.characterId === (config.players[0]?.character ?? "")), `第 ${level} 关角色与配置一致`);
	}
	return `第 1~10 关逐关解析通过：${run.challengeStages.join("、")}`;
});

// ---------------------------------------------------------------- 闯关第 11~30 关：双人组合池

check("组合抽取（ensureChallengeComboStages）：首次进入第 11 关一次性抽 10 个并存档，之后绝不重抽", () => {
	const always = () => true;
	const created = enemy.ensureChallengeComboStages({ ...freshRun(), level: 11 }, makeRng(21), always);
	assertEqual(created.status, enemy.CHALLENGE_STAGE_STATE.generated, "第 11 关首次进入应生成");
	assertEqual(created.run.challengeComboStages.length, cfg.CHALLENGE_COMBO_LEVELS, "一次生成 10 个组合");
	assertEqual(new Set(created.run.challengeComboStages).size, cfg.CHALLENGE_COMBO_LEVELS, "10 个组合互不重复");
	assert(created.run.challengeComboStages.every(id => combosData.getChallengeComboConfig(id)), "全部来自组合池");
	const untouched = enemy.ensureChallengeComboStages(created.run, makeRng(22), always);
	assertEqual(untouched.status, enemy.CHALLENGE_STAGE_STATE.ready, "已有抽取结果不再生成");
	assertEqual(JSON.stringify(untouched.run.challengeComboStages), JSON.stringify(created.run.challengeComboStages), "读档/重进/进入 21~30 关都沿用原结果，不重抽");
	return `第 11~20 关顺序：${created.run.challengeComboStages.join(" → ")}`;
});

check("组合抽取（ensureChallengeComboStages）：第 1~10 关 / 第 31 关外 / 无尽一律不生成", () => {
	const always = () => true;
	const early = enemy.ensureChallengeComboStages(freshRun(), makeRng(23), always);
	assertEqual(early.status, enemy.CHALLENGE_STAGE_STATE.skipped, "前 10 关不需要组合");
	assertEqual(early.run.challengeComboStages.length, 0, "前 10 关不写组合字段");
	const endless = enemy.ensureChallengeComboStages(freshRun(cfg.RUN_MODE.endless), makeRng(24), always);
	assertEqual(endless.status, enemy.CHALLENGE_STAGE_STATE.skipped, "无尽模式不生成");
	assertEqual(endless.run.challengeComboStages.length, 0, "无尽模式不写组合字段");
	return "只在「闯关 + 11~30 关 + 尚无结果」时生成一次";
});

check("组合映射：第 N 关（11~30）取 challengeComboStages[(N-11) % 10]，21~30 与 11~20 一一对应", () => {
	// 与 flow/battle.js 同一条映射公式
	const comboAt = (run, level) => combosData.getChallengeComboConfig(run.challengeComboStages[(level - 1 - cfg.CHALLENGE_STAGE_LEVELS) % cfg.CHALLENGE_COMBO_LEVELS]);
	const run = enemy.ensureChallengeComboStages({ ...freshRun(), level: 11 }, makeRng(25), () => true).run;
	for (let i = 0; i < cfg.CHALLENGE_COMBO_LEVELS; i++) {
		const first = comboAt(run, cfg.CHALLENGE_STAGE_LEVELS + 1 + i);
		const second = comboAt(run, cfg.CHALLENGE_STAGE_LEVELS + cfg.CHALLENGE_COMBO_LEVELS + 1 + i);
		assert(first, `第 ${cfg.CHALLENGE_STAGE_LEVELS + 1 + i} 关应能取到组合`);
		assert(second, `第 ${cfg.CHALLENGE_STAGE_LEVELS + cfg.CHALLENGE_COMBO_LEVELS + 1 + i} 关应能取到组合`);
		assertEqual(second.id, first.id, `第 ${21 + i} 关应复用第 ${11 + i} 关的组合`);
	}
	return `第 21~30 关严格复用第 11~20 关的组合（${comboAt(run, 21).id} 等）`;
});

check("组合 → 阵容：双人组合按 players 顺序生成，左右顺序永远不变", () => {
	const combo = combosData.challengeComboPool[0];
	const [left, right] = combo.players.map(player => player.character);
	for (let seed = 1; seed <= 10; seed++) {
		const enemies = enemy.createStageEnemyConfigs(combo, 15, makeRng(seed));
		assertEqual(enemies.length, 2, "双人组合生成 2 个敌人");
		assertEqual(enemies[0].characterId, left, "左角色在前（顺序 1）");
		assertEqual(enemies[1].characterId, right, "右角色在后（顺序 2）");
		assertEqual(enemies[0].stats.defense + enemies[0].stats.draw + enemies[0].stats.attack, 15,
			"左角色独立吃满关卡数 15 点");
		assertEqual(enemies[1].stats.defense + enemies[1].stats.draw + enemies[1].stats.attack, 15,
			"右角色独立吃满关卡数 15 点（不被队友分走）");
	}
	return `${combo.id}：顺序固定 + 每人独立 15 点（10 个种子全部一致）`;
});

check("第三人：来自扩展池、不与固定两人重复、三个位置都可能出现且左右顺序不变", () => {
	const combo = combosData.challengeComboPool[0];
	const [left, right] = combo.players.map(player => player.character);
	const pool = ["迪迦", "佐菲", "赛文", "巴尔坦星人"];
	const seenPositions = new Set();
	for (let seed = 1; seed <= 60; seed++) {
		const built = enemy.createChallengeComboConfigs(combo, 25, makeRng(seed), { pool });
		assert(built.ok, `种子 ${seed} 应能生成第三人`);
		assert(pool.includes(built.third), "第三人来自注入的扩展池");
		assert(built.third !== left && built.third !== right, "第三人不得与固定两人重复");
		const enemies = built.enemies;
		assertEqual(enemies.length, 3, "阵容为 3 人");
		seenPositions.add(built.position);
		const leftIndex = enemies.findIndex(entry => entry.characterId === left);
		const rightIndex = enemies.findIndex(entry => entry.characterId === right);
		const thirdIndex = enemies.findIndex(entry => entry.characterId === built.third);
		assert(leftIndex >= 0 && rightIndex >= 0 && thirdIndex >= 0, "三人都在阵容里");
		assert(leftIndex < rightIndex, "左角色永远在右角色之前");
		assert([0, 1, 2].includes(built.position), "插入位只能是三个空位之一");
		assertEqual(thirdIndex, built.position, "position 与实际插入位一致");
		for (const entry of enemies) {
			assertEqual(entry.stats.defense + entry.stats.draw + entry.stats.attack, 25,
				`${entry.characterId} 独立吃满关卡数 25 点`);
		}
	}
	assert(seenPositions.size === 3, `三个位置都应出现过，实际 ${seenPositions.size} 种`);
	// 组合里两个同名角色（夏侯徽×夏侯徽的极端情况）：第三人仍不得是夏侯徽
	const mirror = { id: "镜像组合", type: "group", players: [{ character: left }, { character: left }] };
	const built = enemy.createChallengeComboConfigs(mirror, 21, makeRng(3), { pool: [left, "迪迦"] });
	assert(built.ok && built.third === "迪迦", "组合撞名时第三人仍排除该角色");
	// 池子里只剩固定角色自己：明确失败，绝不复制固定角色凑数
	const empty = enemy.createChallengeComboConfigs(combo, 21, makeRng(3), { pool: [left, right] });
	assert(!empty.ok, "没有合法第三人时明确返回失败");
	return `60 个种子覆盖 3 个插入位；第三人 ${built.third}（镜像组合）`;
});

check("闯关 1~30 关验收：每个未指定属性的敌人独立吃满关卡数（单人/双人/三人全覆盖）", () => {
	const assertMember = (entry, level, tag) => {
		const total = entry.stats.defense + entry.stats.draw + entry.stats.attack;
		assertEqual(total, level, `${tag} ${entry.characterId}：总点数恰为 ${level}`);
		assert(entry.stats.defense >= 0 && entry.stats.defense <= 10
			&& entry.stats.draw >= 0 && entry.stats.draw <= 10
			&& entry.stats.attack >= 0 && entry.stats.attack <= 10, `${tag} ${entry.characterId}：三项都在 0~10 内`);
	};
	// 1~10 关：单人配置池逐关生成
	const stages = stagesData.drawChallengeStageIds(makeRng(41), () => true);
	for (let level = 1; level <= cfg.CHALLENGE_STAGE_LEVELS; level++) {
		const config = stagesData.getChallengeStageConfig(stages[level - 1]);
		const enemies = enemy.createStageEnemyConfigs(config, level, makeRng(level));
		assertEqual(enemies.length, 1, `第 ${level} 关 1 个敌人`);
		assertMember(enemies[0], level, `第 ${level} 关`);
	}
	// 11~30 关：双人组合（11~20 直接生成；21~30 走 createChallengeComboConfigs 加第三人）
	const combos = combosData.drawChallengeComboIds(makeRng(42), () => true);
	const pool = ["迪迦", "佐菲", "赛文"];
	for (let i = 0; i < cfg.CHALLENGE_COMBO_LEVELS; i++) {
		const combo = combosData.getChallengeComboConfig(combos[i]);
		const levelPair = cfg.CHALLENGE_STAGE_LEVELS + 1 + i;
		const pairEnemies = enemy.createStageEnemyConfigs(combo, levelPair, makeRng(levelPair));
		assertEqual(pairEnemies.length, 2, `第 ${levelPair} 关 2 个敌人`);
		pairEnemies.forEach(entry => assertMember(entry, levelPair, `第 ${levelPair} 关`));
		const levelTrio = cfg.CHALLENGE_STAGE_LEVELS + cfg.CHALLENGE_COMBO_LEVELS + 1 + i;
		const built = enemy.createChallengeComboConfigs(combo, levelTrio, makeRng(levelTrio), { pool });
		assert(built.ok, `第 ${levelTrio} 关应能生成第三人`);
		assertEqual(built.enemies.length, 3, `第 ${levelTrio} 关 3 个敌人`);
		built.enemies.forEach(entry => assertMember(entry, levelTrio, `第 ${levelTrio} 关`));
	}
	return "第 1~10 关单人各吃 N 点；第 11~20 关每人 N 点；第 21~30 关三人各吃 N 点";
});

check("challengeComboStages 存档（v10）：白名单清洗、位置稳定、cloneRun 读档不重掷、旧档补空", () => {
	const combos = combosData.drawChallengeComboIds(makeRng(31), () => true);
	const run = state.normalizeRun({ ...freshRun(), challengeComboStages: combos });
	assertEqual(JSON.stringify(run.challengeComboStages), JSON.stringify(combos), "合法抽取结果原样落档");
	assertEqual(JSON.stringify(state.cloneRun(run).challengeComboStages), JSON.stringify(combos), "cloneRun（读档路径）原样还原");
	const dirty = state.normalizeRun({ ...freshRun(), challengeComboStages: [42, null, "  威董卓×侯昭宁  ", "已删除的组合", ""] });
	assertEqual(JSON.stringify(dirty.challengeComboStages), JSON.stringify(["威董卓×侯昭宁", "已删除的组合"]), "只剔除非字符串与空白，字符串原位保留");
	const legacy = state.normalizeRun({ ...freshRun() });
	assertEqual(legacy.challengeComboStages.length, 0, "旧档（v9 及更早）没有字段时按空数组补齐（首次进入 11~30 关再补抽）");
	const overflow = state.normalizeRun({ ...freshRun(), challengeComboStages: [...combos, "extra_a"] });
	assertEqual(overflow.challengeComboStages.length, cfg.CHALLENGE_COMBO_LEVELS, "超出 10 项的截断");
	return "位置表随存档固定，读档绝不重掷";
});

check("v9 → v10 迁移：challengeStages 原样保留、challengeComboStages 补空、currentBattle 不受影响、无尽不受影响", () => {
	const stages = stagesData.drawChallengeStageIds(makeRng(41), () => true);
	const legacy = {
		...state.normalizeRun({ ...freshRun(), challengeStages: stages, level: 25 }),
		version: 9,
		challengeComboStages: undefined,
	};
	const migrated = state.migrateSlots([legacy, null, null, null, null, null]);
	const run = migrated.slots[0];
	assert(run, "v9 档应迁移成功");
	assertEqual(run.version, cfg.RUN_VERSION, "迁移后标成当前版本");
	assertEqual(JSON.stringify(run.challengeStages), JSON.stringify(stages), "前 10 关的抽取结果绝不重抽");
	assertEqual(run.challengeComboStages.length, 0, "组合字段按空数组补齐，首次进入 11~30 关时补抽");
	assert(migrated.errors.some(error => error.includes("迁移")), "要提示做过版本迁移");
	const endless = state.normalizeRun({ ...freshRun(cfg.RUN_MODE.endless), challengeComboStages: ["威董卓×侯昭宁"] });
	assertEqual(endless.challengeComboStages.length, 1, "无尽档里的组合字段原样保留（永不使用，不影响任何流程）");
	return `v9 → v${cfg.RUN_VERSION}：闯关旧档前 10 关不变、11~30 关首次开战时补抽组合`;
});

check("废弃技能清理：已下架的肉鸽专属技能在读档时从存档各处清除", () => {
	const run = state.normalizeRun({
		...freshRun(),
		skills: ["rogue_xushui", SKILL_A, "rogue_guiyuan", SKILL_B, "rogue_jiema"],
		shopOffers: [
			{ id: "rogue_jiema", price: 9, sold: false },
			{ id: SKILL_C, price: 10, sold: true },
		],
		currentBattle: {
			status: "battle",
			enemies: [{ characterId: "佐菲", stats: { defense: 0, draw: 0, attack: 0 }, skills: ["rogue_xushui"], maxHp: 0, hp: 0 }],
		},
	});
	assertEqual(run.skills.join(","), `${SKILL_A},${SKILL_B}`, "三个下架技能全部清除，其余保留且不占槽");
	assertEqual(run.shopOffers.length, 1, "下架技能的候选剔除");
	assertEqual(run.shopOffers[0].id, SKILL_C, "正常候选原样保留（含已购标记）");
	assertEqual(run.currentBattle.enemies[0].skills.length, 0, "敌方阵容里的下架技能清除");
	assertEqual(JSON.stringify(state.normalizeRun(run).skills), JSON.stringify(run.skills), "清理幂等（再读一遍不变化）");
	return "skills / shopOffers / 敌方阵容 三处清理";
});

check("新局初始资源：金币 50（=技能基准价）；初始经验与首级升级价对平（闯关 2 / 无尽 20），旧存档不会被补发", () => {
	for (const [mode, firstLevel] of [[cfg.RUN_MODE.challenge, 2], [cfg.RUN_MODE.endless, 20]]) {
		const run = freshRun(mode);
		assertEqual(run.currency.gold, cfg.INITIAL_CURRENCY.gold, `${mode} 初始金币`);
		assertEqual(run.currency.exp, firstLevel, `${mode} 初始经验`);
		// 与 shop 的首级价对账：初始经验必须恰好够第一次属性升级（防两处数字各自漂移）
		assertEqual(shop.checkStatUpgrade(run, cfg.STAT_IDS[0]).price, firstLevel, `${mode} 首级升级价`);
	}
	// 旧档（没有 currency 字段）按 0 处理；明确记 0 的也保持 0
	const old = state.normalizeRun({ version: 1, mode: "challenge", characterId: "迪迦", level: 3 });
	assertEqual(old.currency.gold, 0, "旧档不补发金币");
	assertEqual(old.currency.exp, 0, "旧档不补发经验");
	const zero = state.normalizeRun({ ...freshRun(), currency: { gold: 0, exp: 0 } });
	assertEqual(zero.currency.gold, 0, "明确记 0 的存档保持 0");
	// 初始金币必须保证第一关进商店就买得起技能：不低于基准价 ±25% 的下界（floor(37.5)=37）
	assert(cfg.INITIAL_CURRENCY.gold >= shop.getRandomSkillPrice(freshRun(), () => 0), `初始金币 ${cfg.INITIAL_CURRENCY.gold} 应 ≥ 售价下界`);
	return "闯关 2 / 无尽 20 经验";
});

check("技能基准价：闯关恒为 50（与关卡彻底无关），无尽 floor(50×√n) 从第 1 关起随关卡增长", () => {
	// 闯关：第 1、10、30 关与不传 run 的调用全部固定 50
	for (const level of [1, 10, 30]) {
		assertEqual(shop.getSkillBasePrice({ ...freshRun(), level }), 50, `闯关第${level}关基准价`);
	}
	assertEqual(shop.getSkillBasePrice(), 50, "不传 run 按闯关处理");
	// 无尽：floor(50 × √n)——n=1 就从 50 起步（不是旧规则的 5），n=2 也不再是 50
	const expected = [[1, 50], [2, 70], [3, 86], [4, 100], [5, 111], [9, 150], [10, 158], [100, 500]];
	for (const [level, price] of expected) {
		assertEqual(shop.getSkillBasePrice({ mode: cfg.RUN_MODE.endless, level }), price, `无尽第${level}关基准价`);
	}
	assertEqual(shop.getSkillBasePrice({ mode: cfg.RUN_MODE.endless }), 50, "无尽 level 缺失按第 1 关");
	return `无尽 1/2/3/4/5/9/10 关 → ${expected.slice(0, 7).map(([, price]) => price).join(",")}`;
});

check("技能售价：基准价 ±25% 内随机后向下取整（至少 1），floor 统一替换旧 round", () => {
	// 闯关第 1 关基准 50：floor(37.5)=37 ~ floor(62.5)=62（旧 round 规则是 38~63）
	const ch1 = { ...freshRun(), level: 1 };
	assertEqual(shop.getRandomSkillPrice(ch1, () => 0), 37, "下界（floor 37.5）");
	assertEqual(shop.getRandomSkillPrice(ch1, () => 0.5), 50, "中值");
	assertEqual(shop.getRandomSkillPrice(ch1, () => 0.999999), 62, "接近上界");
	// 无尽第 2 关基准 70：floor(52.5)=52 ~ floor(87.5)=87 —— 候选不再永远按 50 定价
	const en2 = { mode: cfg.RUN_MODE.endless, level: 2 };
	assertEqual(shop.getRandomSkillPrice(en2, () => 0), 52, "无尽第2关下界");
	assertEqual(shop.getRandomSkillPrice(en2, () => 0.999999), 87, "无尽第2关接近上界");
	// 无尽第 10 关基准 158：floor(118.5)=118 ~ floor(197.5)=197
	const en10 = { mode: cfg.RUN_MODE.endless, level: 10 };
	assertEqual(shop.getRandomSkillPrice(en10, () => 0), 118, "无尽第10关下界");
	assertEqual(shop.getRandomSkillPrice(en10, () => 0.999999), 197, "无尽第10关接近上界");
	// 连续随机采样必须整体落在闭区间内，且全是整数
	for (let i = 0; i < 200; i++) {
		const price = shop.getRandomSkillPrice(en10);
		assert(Number.isInteger(price) && price >= 118 && price <= 197, `售价 ${price} 越界`);
	}
	return "闯关 37~62 / 无尽按基准价同步浮动";
});

check("技能候选售价：同一 rng 下闯关任意关卡价格序列一致，无尽随关卡整体抬升", () => {
	const prices = run => shop.rollSkillOffers(run, makeRng(7), [], skillsData.pool).map(offer => offer.price).join(",");
	// 闯关：价格与关卡彻底无关，同一 rng 序列下第 1 / 10 / 1000 关完全一致
	assertEqual(prices({ ...freshRun(), level: 1 }), prices({ ...freshRun(), level: 10 }), "闯关第 1 关与第 10 关价格一致");
	assertEqual(prices({ ...freshRun(), level: 1 }), prices({ ...freshRun(), level: 1000 }), "闯关第 1 关与第 1000 关价格一致");
	// 无尽：同一 rng 序列下基准价随 √n 增长，价格逐档整体抬升
	const seq = level => prices({ ...freshRun(cfg.RUN_MODE.endless), level }).split(",").map(Number);
	const first = seq(1), second = seq(2), tenth = seq(10);
	assert(second.every((price, i) => price > first[i]), `第 2 关售价应整体高于第 1 关：${first} → ${second}`);
	assert(tenth.every((price, i) => price > second[i]), `第 10 关售价应整体高于第 2 关：${second} → ${tenth}`);
	return "闯关与关卡无关 / 无尽随 √n 抬升";
});

check("无尽最高记录：只记成功通关过的最高一关，且与存档无关", () => {
	assertEqual(state.normalizeBest(undefined), null, "初始没有记录");
	let best = state.updateBest(null, 1, "迪迦", NOW);
	assertEqual(best.level, 1, "通关第1关 → 1");
	best = state.updateBest(best, 5, "迪迦", NOW);
	assertEqual(best.level, 5, "通关第5关 → 5");
	best = state.updateBest(best, 3, "迪迦", NOW);
	assertEqual(best.level, 5, "更低的通关不改写记录");
	assertEqual(best.characterId, "迪迦", "记录角色");
	assertEqual(state.normalizeBest({ level: 0 }), null, "0 关视为无记录");
	assertEqual(state.normalizeBest({ level: "12", characterId: " 迪迦 " }).level, 12, "脏数据可修复");
	assertEqual(state.updateBest(best, 0, "迪迦", NOW).level, 5, "非法关卡不改记录");
	return `最高第 ${best.level} 关`;
});

check("闯关最高记录：金币与经验各取各的历史最大，没通过过就是没有记录", () => {
	assertEqual(state.normalizeBestChallenge(undefined), null, "初始没有记录");
	assertEqual(state.normalizeBestChallenge({ gold: 0, exp: 0 }), null, "两项都是 0 视为没通过（界面不显示）");
	assertEqual(state.normalizeBestChallenge({ gold: 300, exp: -5 }).gold, 300, "负数按 0 处理");
	assertEqual(state.normalizeBestChallenge({ gold: "100", exp: " 10 ", characterId: " 迪迦 " }).exp, 10, "脏数据可修复");
	let best = state.updateBestChallenge(null, { gold: 100, exp: 10 }, "迪迦", NOW);
	assertEqual(`${best.gold}/${best.exp}`, "100/10", "第一次通关：照记");
	// 用户给的例子：一把「金币 100 经验 10」、一把「金币 50 经验 20」→ 最高金币 100、最高经验 20
	best = state.updateBestChallenge(best, { gold: 50, exp: 20 }, "赛文", NOW);
	assertEqual(`${best.gold}/${best.exp}`, "100/20", "两项各取各的最大（金币留 100、经验抬到 20）");
	assertEqual(best.characterId, "赛文", "记破纪录这一把的角色");
	best = state.updateBestChallenge(best, { gold: 10, exp: 5 }, "佐菲", NOW);
	assertEqual(`${best.gold}/${best.exp}`, "100/20", "两项都没涨 → 记录不动");
	assert(state.updateBestChallenge(best, { gold: 10, exp: 5 }, "佐菲", NOW) === best, "没涨时返回同一个对象（调用方据此不落盘）");
	assert(state.updateBestChallenge(best, undefined, "佐菲", NOW) === best, "拿不到货币时原样返回");
	return `最高金币 ${best.gold} / 最高经验 ${best.exp}`;
});

check("无尽奖励：floor(√n × 系数)（金币 50 / 经验 20），按刚完成的关卡编号结算", () => {
	// 金币从第 1 关起以 50 为基准：1→50、2→70、3→86、4→100、9→150、10→158；
	// 经验与属性升级价同系数（20）：1→20、2→28、3→34、4→40、9→60、10→63
	for (const [level, gold, exp] of [[1, 50, 20], [2, 70, 28], [3, 86, 34], [4, 100, 40], [9, 150, 60], [10, 158, 63], [100, 500, 200]]) {
		const gained = rewardsData.getEndlessReward(level, cfg.CURRENCIES);
		assertEqual(gained.gold, gold, `第${level}关金币`);
		assertEqual(gained.exp, exp, `第${level}关经验`);
	}
	// 对平：第 1~10 关每胜给的经验 = 升到该级的价钱（同一条 floor(20×√n) 曲线）
	for (let level = 1; level <= 10; level++) {
		assertEqual(
			rewardsData.getEndlessReward(level, cfg.CURRENCIES).exp,
			shop.getStatUpgradePrice({ mode: cfg.RUN_MODE.endless }, cfg.STAT_IDS[0], level),
			`第${level}关经验应等于升到 ${level} 级的价钱`
		);
	}
	// 结算用刚完成的关卡编号：level=2 的存档打赢后按 n=2 发奖，然后才推进到 3
	const run = { ...freshRun(cfg.RUN_MODE.endless), level: 2 };
	const won = reward.settleVictory(run, NOW);
	assertEqual(won.gained.gold, 70, "按刚完成的第 2 关发金币");
	assertEqual(won.gained.exp, 28, "按刚完成的第 2 关发经验");
	assertEqual(won.run.level, 3, "发完奖再推进到第 3 关");
	return "1:50/20 2:70/28 3:86/34 10:158/63 100:500/200";
});

check("技能文本清洗：poptip 转成可读名字，正文一个字不丢", () => {
	lib.poptip = {
		getName: id => ({ hadjanrong: "暗融", sha: "杀", zhinan: "指南针" }[id] ?? id),
		getType: id => (id === "hadjanrong" ? "skill" : id === "sha" ? "card" : "rule"),
	};
	assertEqual(
		common.sanitizeSkillText('锁定技，当你因<noname-poptip poptip="hadjanrong"></noname-poptip>获得技能。'),
		"锁定技，当你因〖暗融〗获得技能。",
		"技能 poptip → 〖名〗"
	);
	assertEqual(
		common.sanitizeSkillText("<noname-poptip poptip = sha></noname-poptip>"),
		"【杀】",
		"卡牌 poptip → 【名】（兼容 get.poptip 输出的 `poptip = id` 写法）"
	);
	assertEqual(common.sanitizeSkillText("<noname-poptip poptip='zhinan'></noname-poptip>"), "指南针", "rule poptip → 名字");
	assertEqual(
		common.sanitizeSkillText('<noname-poptip poptip="unknownid">兜底文本</noname-poptip>'),
		"兜底文本",
		"查不到 id 时用标签内文本，且不重复显示"
	);
	assertEqual(
		common.sanitizeSkillText('<noname-poptip poptip="unknownid"></noname-poptip>'),
		"unknownid",
		"连内部文本都没有时退回 id，不删正文"
	);
	assertEqual(common.sanitizeSkillText("第一行<br>第二行"), "第一行\n第二行", "<br> 转换行");
	assertEqual(common.sanitizeSkillText("纯中文，无标签"), "纯中文，无标签", "无标签原样返回");
	assertEqual(common.sanitizeSkillText(undefined), "", "非字符串安全");
	assert(!common.sanitizeSkillText('a<noname-poptip poptip="hadjanrong"></noname-poptip>b').includes("noname-poptip"), "不残留标签名");
	return "poptip 转名";
});

check("属性规则：防御与攻击逐级累计并复用展示接口", () => {
	assertEqual(statsData.describeStat("attack", 0).lines[0], "未强化", "0 级明确显示未强化");
	const defenseExpected = [[1, 0], [1, 1], [2, 1], [2, 2], [3, 2], [3, 3], [4, 3], [4, 4], [5, 4], [5, 5]];
	const attackExpected = [[10, 0], [20, 1], [30, 1], [40, 2], [50, 2], [60, 3], [70, 3], [80, 4], [90, 4], [100, 5]];
	for (let level = 1; level <= 10; level++) {
		const defense = statsData.getStatSummary("defense", level);
		assertEqual(defense.armor, defenseExpected[level - 1][0], `防御 Lv.${level} 护甲`);
		assertEqual(defense.maxHp, defenseExpected[level - 1][1], `防御 Lv.${level} 体力上限`);
		const attack = statsData.getStatSummary("attack", level);
		assertEqual(attack.damageChance, attackExpected[level - 1][0], `攻击 Lv.${level} 概率`);
		assertEqual(attack.shaLimit, attackExpected[level - 1][1], `攻击 Lv.${level} 出杀次数`);
	}
	const defenseText = statsData.describeStat("defense", 10).lines.join("|");
	const attackText = statsData.describeStat("attack", 10).lines.join("|");
	assert(defenseText.includes("体力上限 +5") && !defenseText.includes("+9"), "防御 Lv.10 文案应为 +5");
	assert(attackText.includes("100%") && attackText.includes("出【杀】次数 +5"), "攻击 Lv.10 文案应为 100%/+5");
	return "防御与攻击 Lv.1~10 全等级通过";
});

check("属性强化合并成一个技能：四种效果都还在，标记说明列全部加成", () => {
	const stat = skillsData.helpers.rogue_stat;
	const player = { storage: { rogue_stat: { extraDraw: 2, handLimit: 1, damageChance: 20, shaLimit: 1 } } };
	// 本体契约：filter 收到的是「基事件 + 时机名」两个东西（lib.filter.filterTrigger →
	// info.filter(event, player, triggerName)），content 的第二个参数是 event._trigger，
	// 即那个基事件本身，它的 name 只会是 phaseDraw / damage，永远不等于时机名。
	// 时机名只挂在技能事件的 triggername 上（game.createTrigger → next.triggername）。
	const skillEvent = (timing, base) => ({ triggername: timing, _trigger: base });

	// 摸牌阶段
	const draw = { name: "phaseDraw", num: 2 };
	assert(stat.filter(draw, player, "phaseDrawBegin2"), "有摸牌加成时应通过 filter");
	stat.content(skillEvent("phaseDrawBegin2", draw), draw, player);
	assertEqual(draw.num, 4, "摸牌 +2");
	assert(!stat.filter({ name: "phaseDraw", num: 2, numFixed: true }, player, "phaseDrawBegin2"), "numFixed 时不触发");

	// 造成伤害：概率命中时 +1，且不限【杀】
	const originalRandom = Math.random;
	try {
		Math.random = () => 0.1;
		const hit = { name: "damage", num: 1, card: { name: "sha" } };
		assert(stat.filter(hit, player, "damageBegin1"), "用杀造成伤害时应通过 filter");
		stat.content(skillEvent("damageBegin1", hit), hit, player);
		assertEqual(hit.num, 2, "概率命中时杀伤害只 +1");
		Math.random = () => 0.2;
		const miss = { name: "damage", num: 1, card: { name: "sha" } };
		stat.content(skillEvent("damageBegin1", miss), miss, player);
		assertEqual(miss.num, 1, "概率未命中时伤害不变");
		Math.random = () => 0.1;
		const noCard = { name: "damage", num: 1 };
		assert(stat.filter(noCard, player, "damageBegin1"), "无来源牌的伤害也应触发");
		stat.content(skillEvent("damageBegin1", noCard), noCard, player);
		assertEqual(noCard.num, 2, "非杀伤害同样 +1");
		const otherCard = { name: "damage", num: 1, card: { name: "juedou" } };
		stat.content(skillEvent("damageBegin1", otherCard), otherCard, player);
		assertEqual(otherCard.num, 2, "其他牌造成的伤害同样 +1");
		const fixed = { name: "damage", num: 0, numFixed: true };
		assert(!stat.filter(fixed, player, "damageBegin1"), "固定伤害不加成");
	} finally {
		Math.random = originalRandom;
	}

	// 手牌上限 / 出杀次数
	assertEqual(stat.mod.maxHandcard(player, 4), 5, "手牌上限 +1");
	assertEqual(stat.mod.cardUsable({ name: "sha" }, player, 1), 2, "出杀次数 +1");
	assertEqual(stat.mod.cardUsable({ name: "shan" }, player, 1), undefined, "非杀不改次数");

	// 数值全 0 时不触发
	const bare = { storage: { rogue_stat: { extraDraw: 0, handLimit: 0, damageChance: 0, shaLimit: 0 } } };
	assert(!stat.filter({ name: "phaseDraw", num: 2 }, bare, "phaseDrawBegin2"), "无加成不触发");
	assert(!stat.filter({ name: "damage", num: 1, card: { name: "sha" } }, bare, "damageBegin1"), "无加成不触发（伤害）");

	// 唯一标记：说明里列出四项实时数值
	const html = stat.intro.mark(null, player.storage.rogue_stat, player);
	for (const token of ["摸牌阶段 +2 张", "手牌上限 +1", "造成伤害时 20% 概率伤害 +1", "出【杀】次数 +1"]) {
		assert(html.includes(token), `标记说明应包含「${token}」：${html}`);	
	}
	assert(!html.includes("[object Object]"), "不能出现 [object Object]");
	assertEqual(stat.intro.nocount, true, "对象型 storage 不该让本体去数标记数量");
	const guaranteed = { storage: { rogue_stat: { damageChance: 100 } } };
	const guaranteedDamage = { name: "damage", num: 1, card: { name: "sha" } };
	assert(stat.filter(guaranteedDamage, guaranteed, "damageBegin1"), "Lv.10 应触发概率加伤");
	stat.content(skillEvent("damageBegin1", guaranteedDamage), guaranteedDamage, guaranteed);
	assertEqual(guaranteedDamage.num, 2, "Lv.10 应必定只额外 +1");
	return "四效果 + 概率命中/未命中 + 非杀也加伤 + Lv.10 必定命中";
});

check("闯关经验：第28关结算后 310，第29关结算后 330", () => {
	let run = freshRun();
	for (let level = 1; level <= 29; level++) {
		const result = reward.settleVictory(run, NOW);
		run = result.run;
		if (level === 28) {
			assertEqual(result.gained.exp, 20, "第28关经验");
			assertEqual(run.currency.exp, 310, "第28关结算后经验");
		}
		if (level === 29) {
			assertEqual(result.gained.exp, 20, "第29关经验");
			assertEqual(run.currency.exp, 330, "第29关结算后经验");
			assertEqual(run.level, 30, "第29关后进入第30关");
		}
	}
	return "进入第29关前 310，完成第29关后 330";
});

check("商店排除（无尽）：角色原生技能与当前拥有（含未装备）不上架，真正失去的可以再出现", () => {
	const poolIds = skillsData.pool.map(item => item.id);
	const free = poolIds[poolIds.length - 1]; // 既非拥有也非原生的「自由」技能
	// 装备一个 + 背包里再放一个（没装备）：两者都算「当前拥有」，都必须被排除
	const run = { ...freshRun(cfg.RUN_MODE.endless), characterId: "迪迦", skills: [SKILL_B], skillInventory: [SKILL_B, SKILL_A], level: 1 };
	const characterSkills = poolIds.filter(id => id !== free);

	const excluded = shop.getExcludedSkillIds(run, characterSkills);
	assert(excluded.has(SKILL_B), "当前持有应被排除");
	assert(excluded.has(SKILL_A), "只在背包里（没装备）的技能同样应被排除");
	assert(excluded.has(characterSkills[0]), "角色原生技能应被排除");
	assert(!excluded.has(free), "既非持有也非原生时不该被排除");

	// 池子被排到只剩一个：不死循环、不重复、不返回被排除项
	const offers = shop.rollSkillOffers({ ...run, skills: [], skillInventory: [] }, makeRng(3), characterSkills, skillsData.pool);
	assertEqual(offers.length, 1, "候选不足时按实际数量返回");
	assertEqual(offers[0].id, free, "只能是没被排除的那个");

	// 曾经拥有、后来真正失去（从背包删除）的技能可以重新出现（用池内技能验证这条）
	const poolOwned = poolIds[0];
	const freed = shop.rollSkillOffers({ ...run, skills: [], skillInventory: [] }, makeRng(5), poolIds.filter(id => id !== poolOwned), skillsData.pool);
	assertEqual(freed.length, 1, "只剩「失去过的」那一个候选");
	assertEqual(freed[0].id, poolOwned, "真正失去的技能可以再出现");

	// 全被排除：返回空候选而不是报错/死循环
	assertEqual(shop.rollSkillOffers({ ...run, skills: [], skillInventory: [] }, makeRng(1), poolIds, skillsData.pool).length, 0, "全被排除时返回空候选");
	return "原生/装备/背包/失去后回归 四态";
});

check("候选池：并上全体武将技能，禁用武将的技能与其衍生技不上架", () => {
	const curated = skillsData.pool.map(item => item.id);
	// 桩里的 lib.character/lib.skill 本来是空的：作者清单要先当成「已注册」
	for (const id of curated) {
		lib.skill[id] ??= {};
	}
	// 临时塞四类角色：正常/禁用/Boss/技能不合法
	Object.assign(lib.skill, {
		pool_a: {},
		pool_shared: {},
		pool_banned: { derivation: ["pool_derived"] },
		pool_derived: {},
		pool_boss: {},
		pool_internal: {},
	});
	Object.assign(lib.character, {
		池甲: [4, "male", "shu", ["pool_a", "pool_shared", "pool_internal"], 1],
		池乙: [4, "male", "shu", ["pool_boss"], 1],
		池丙: [4, "male", "shu", ["pool_banned", "pool_shared"], 1],
	});
	lib.character["池乙"].isBoss = true;
	// 禁将名单按模式分开存：这里只禁在 identity 下，别的模式禁用过也算禁用
	lib.config.all = { mode: ["identity", "versus"] };
	lib.config.identity_banned = ["池丙"];
	lib.config.versus_banned = [];
	// 本体用 skillDisabled 筛掉没有描述的内部技
	const skillDisabled = lib.filter.skillDisabled;
	lib.filter.skillDisabled = id => id === "pool_internal";
	let ids;
	try {
		ids = new Set(skillPool.getShopPool().map(item => item.id));
	} finally {
		lib.filter.skillDisabled = skillDisabled;
		for (const key of ["池甲", "池乙", "池丙"]) {
			delete lib.character[key];
		}
		for (const key of ["pool_a", "pool_shared", "pool_banned", "pool_derived", "pool_boss", "pool_internal", ...curated]) {
			delete lib.skill[key];
		}
		delete lib.config.all;
		delete lib.config.identity_banned;
		delete lib.config.versus_banned;
	}
	assert(ids.has("pool_a"), "未禁用武将的技能应进池");
	assert(!ids.has("pool_shared"), "禁将武将也拥有的共享技能一并下架（禁将技能硬否决，不得进池）");
	assert(!ids.has("pool_banned"), "禁用武将的技能不该进池");
	assert(!ids.has("pool_derived"), "禁用武将技能的衍生技不该进池");
	assert(!ids.has("pool_boss"), "玩家选不到的 Boss 技能不该进池");
	assert(!ids.has("pool_internal"), "本体判为不可选用的内部技能不该进池");
	// 作者清单只说明「作者想卖」，不说明「挂到别人身上安全」：兼容性校验一样要过。
	// 明确禁止的那几条必须不在池里，其余一条都不能少。
	const denied = curated.filter(id => skillCompat.ROGUE_SKILL_DENY.has(id));
	assert(denied.length > 0, "兼容性禁止名单要在作者清单里真的命中几条（否则这条断言没在测东西）");
	for (const id of denied) {
		assert(!ids.has(id), `肉鸽不兼容技能不该进池：${id}`);
	}
	const expected = curated.filter(id => !skillCompat.ROGUE_SKILL_DENY.has(id));
	assert(expected.every(id => ids.has(id)), `作者上架清单里兼容的 ${expected.length} 条要全数保留`);
	return `池 ${ids.size} 条 / 作者清单 ${curated.length} 条（禁入 ${denied.length} 条）`;
});

check("免费刷新次数：新档给满、逐次扣到 0、第三次拒绝，且重开与重载都不补次数", () => {
	const base = freshRun();
	assertEqual(base.shopRefreshesRemaining, cfg.SKILL_REFRESH_PER_LEVEL, "新档次数");
	const rolled = shop.rollSkillOffers(base, makeRng(11), [], skillsData.pool);
	const run = { ...base, shopOffers: rolled };
	const first = shop.refreshSkillOffers(run, makeRng(1), [], skillsData.pool);
	assert(first.ok, first.error ?? "第一次刷新应成功");
	assertEqual(first.run.shopRefreshesRemaining, 1, "刷一次剩 1");
	const second = shop.refreshSkillOffers(first.run, makeRng(2), [], skillsData.pool);
	assertEqual(second.run.shopRefreshesRemaining, 0, "刷两次剩 0");
	const third = shop.refreshSkillOffers(second.run, makeRng(3), [], skillsData.pool);
	assert(!third.ok && third.error.includes("用完"), "第三次应被拒");
	assertEqual(third.run, undefined, "失败时不返回改过的 run");
	assertEqual(third.offers, undefined, "失败时不返回新候选");
	// 次数属于「这一局」：返回营地、重开商店、重启游戏读档都不能把它补回来
	assertEqual(state.cloneRun(second.run).shopRefreshesRemaining, 0, "重开商店不补次数");
	assertEqual(state.normalizeRun(second.run).shopRefreshesRemaining, 0, "0 不能被视为「没这个字段」");
	const reloaded = state.migrateSlots([null, second.run, null, null, null, null]);
	assertEqual(reloaded.errors.length, 0, "同版本读档不该报迁移错误");
	assertEqual(reloaded.slots[1].shopRefreshesRemaining, 0, "重载存档次数保持原样");
	return "2 → 1 → 0 → 拒绝";
});

check("刷新会重掷技能与价格，价格定死后写进存档不再变", () => {
	const tiny = ["t1", "t2", "t3", "t4", "t5", "t6"].map(id => ({ id, price: 100 }));
	const base = { ...freshRun(), level: 2 };
	const run = { ...base, shopOffers: shop.rollSkillOffers(base, makeRng(4), [], tiny) };
	const oldIds = new Set(run.shopOffers.map(offer => offer.id));
	const next = shop.refreshSkillOffers(run, makeRng(9), [], tiny);
	assert(next.ok, next.error ?? "刷新应成功");
	assertEqual(next.offers.length, cfg.SKILL_OFFER_COUNT, "候选数照常给满");
	assert(next.offers.every(offer => !oldIds.has(offer.id)), `池子够时不该原样抽到旧候选：${next.offers.map(o => o.id).join(",")}`);
	assert(next.offers.every(offer => offer.sold === false), "新候选都未售出");
	assertEqual(next.run.shopOffers, next.offers, "run 里写的是同一份新候选");
	assert(next.offers.every(offer => offer.price >= 37 && offer.price <= 62), `刷新价格仍按闯关基准价 50 ±25% floor 生成（37~62）：${next.offers.map(o => o.price).join(",")}`);
	const stored = state.normalizeRun(next.run);
	assertEqual(JSON.stringify(stored.shopOffers), JSON.stringify(next.run.shopOffers), "刷新结果可原样持久化");
	assertEqual(JSON.stringify(state.normalizeRun(stored).shopOffers), JSON.stringify(stored.shopOffers), "再次读档不重掷");
	return `${[...oldIds].join("/")} → ${next.offers.map(o => `${o.id}:${o.price}`).join(" ")}`;
});

check("刷新不得绕过一局限买一个：买过之后刷新直接被拒且不扣次数", () => {
	const base = { ...freshRun(), currency: { gold: 9999, exp: 0 } };
	const run = { ...base, shopOffers: shop.rollSkillOffers(base, makeRng(5), [], skillsData.pool) };
	const bought = shop.buySkill(run, run.shopOffers[0].id);
	assert(bought.ok, bought.error ?? "先买一个技能");
	assert(bought.run.shopOffers.some(offer => offer.sold), "已购标记写在候选上");
	const tryRefresh = shop.refreshSkillOffers(bought.run, makeRng(6), [], skillsData.pool);
	assert(!tryRefresh.ok && tryRefresh.error.includes("已经购买"), "买过之后不能刷新");
	assertEqual(tryRefresh.run, undefined, "被拒不返回改过的 run");
	assertEqual(bought.run.shopRefreshesRemaining, cfg.SKILL_REFRESH_PER_LEVEL, "被拒时次数一次都没少");
	assertEqual(tryRefresh.offers, undefined, "被拒时不能返回新候选——重掷会把 sold 全清成 false，那才是真正的绕过入口");
	// 还有未购买的候选，说明「一局限买一个」的第二道闸在 UI 上（买过后其余按钮变已售罄），由冒烟用例点真实按钮验
	assert(bought.run.shopOffers.filter(offer => !offer.sold).length > 0, "本局仍有未购买候选，只能靠刷新门槛拦住绕过");
	return "买过后刷新被拒 + 次数不扣";
});

check("刷新后排除规则不变：原生/拥有仍排除，真正失去的仍可回来", () => {
	const poolIds = skillsData.pool.map(item => item.id);
	const [p0, p1, p2] = poolIds;
	const base = { ...freshRun(), characterId: "迪迦", level: 1, skills: [p1], skillInventory: [p1] };
	const run = { ...base, shopOffers: shop.rollSkillOffers(base, makeRng(2), [], skillsData.pool) };
	const characterSkills = poolIds.filter(id => id !== p0 && id !== p1);
	const next = shop.refreshSkillOffers(run, makeRng(8), characterSkills, skillsData.pool);
	assert(next.ok, next.error ?? "刷新应成功");
	assert(next.offers.every(offer => !characterSkills.includes(offer.id)), "刷新后仍不得出现角色原生技能");
	assert(next.offers.every(offer => offer.id !== p1), "刷新后仍不得出现当前持有技能");
	// 池子只够旧候选时：允许旧候选重新出现，但不死循环、不塞进当前持有、不重复填充
	const narrow = [p0, p1, p2].map(id => ({ id, price: 100 }));
	const stuck = { ...base, shopOffers: narrow.map(entry => ({ id: entry.id, price: 5, sold: false })) };
	const reuse = shop.refreshSkillOffers(stuck, makeRng(3), [], narrow);
	assert(reuse.ok, reuse.error ?? "池子不足时也应成功");
	assertEqual(reuse.offers.length, narrow.length - 1, "只把当前持有的那条排掉，其余旧候选允许重新出现");
	assert(reuse.offers.every(offer => offer.id !== p1), "池子再窄也不能给当前持有的技能");
	assertEqual(new Set(reuse.offers.map(offer => offer.id)).size, reuse.offers.length, "不得重复填充凑数");
	// 曾经拥有、后来真正失去的（p2 已不在背包里），刷新池里照样能再出现
	assert(reuse.offers.some(offer => offer.id === p2), "真正失去的技能可以重新出现");
	return "原生/持有排除不变 + 窄池不卡死";
});

check("旧存档补字段：v1 缺刷新次数时补满且其它字段不动，已用掉的不补回", () => {
	const legacy = {
		version: 1,
		mode: "challenge",
		characterId: "迪迦",
		level: 5,
		totalLevels: 30,
		currency: { gold: 17, exp: 3 },
		skills: [SKILL_B],
		stats: { defense: 2, draw: 1, attack: 0 },
		currentBattle: null,
		shopOffers: [{ id: SKILL_A, price: 9, sold: false }],
		cleared: false,
		createdAt: NOW,
		updatedAt: NOW,
	};
	const migrated = state.migrateSlots([legacy, null, null, null, null, null]);
	const run = migrated.slots[0];
	assertEqual(run.version, cfg.RUN_VERSION, "迁移后标成当前版本");
	assertEqual(run.shopRefreshesRemaining, cfg.SKILL_REFRESH_PER_LEVEL, "旧档补满次数");
	assertEqual(run.level, 5, "当前关卡不变");
	assertEqual(JSON.stringify(run.currency), JSON.stringify({ gold: 17, exp: 3 }), "金币经验不变");
	assertEqual(run.skills.join(","), SKILL_B, "已学技能不变");
	assertEqual(run.stats.defense, 2, "属性等级不变");
	assertEqual(run.shopOffers[0].price, 9, "上次的候选与定死的价格不变");
	assert(migrated.errors.some(error => error.includes("迁移")), "要提示做过版本迁移");
	assertEqual(state.normalizeRun({ ...legacy, version: 2, shopRefreshesRemaining: 1 }).shopRefreshesRemaining, 1, "v2 剩 1 次不能被抬回 2");
	assertEqual(state.normalizeRun({ ...legacy, shopRefreshesRemaining: 0 }).shopRefreshesRemaining, 0, "刷成 0 也不补");
	// 上限 = 基础额度 + 全部刷新类奇物的加成（循环按钮在池子里时 > SKILL_REFRESH_PER_LEVEL）
	assertEqual(state.normalizeRun({ ...legacy, shopRefreshesRemaining: 99 }).shopRefreshesRemaining, curioManager.getMaxShopRefreshes(), "脏数据按上限钳制");
	return `v1 → v${cfg.RUN_VERSION}`;
});

check("刷新次数只在通关时恢复：胜利进下一局补满，失败与无尽保持原规则", () => {
	const run = {
		...freshRun(),
		level: 4,
		shopRefreshesRemaining: 1,
		currency: { gold: 20, exp: 5 },
		shopOffers: [{ id: SKILL_A, price: 5, sold: false }],
	};
	const won = reward.settleVictory(run, NOW);
	assertEqual(won.run.level, 5, "进入第 5 局");
	assertEqual(won.run.shopRefreshesRemaining, cfg.SKILL_REFRESH_PER_LEVEL, "通关后补满次数");
	assertEqual(won.run.shopOffers.length, 0, "候选清空，下次进店重掷");
	const lost = penalty.settleDefeat(run, NOW);
	assertEqual(lost.kind, "currency", "闯关失败按货币比例扣");
	assertEqual(lost.run.shopRefreshesRemaining, 1, "失败还是第 4 局，次数不能恢复");
	assertEqual(lost.run.level, 4, "关卡不后退");
	const endlessWon = reward.settleVictory({ ...run, mode: "endless", totalLevels: 0, level: 10 }, NOW);
	assertEqual(endlessWon.run.level, 11, "无尽推进到第 11 局");
	assertEqual(endlessWon.run.shopRefreshesRemaining, cfg.SKILL_REFRESH_PER_LEVEL, "无尽通关同样补满");
	const endlessLost = penalty.settleDefeat({ ...run, mode: "endless", totalLevels: 0, level: 10 }, NOW);
	assertEqual(endlessLost.kind, "delete", "无尽失败仍是整档删除");
	return "胜利补满 / 失败保持";
});

// ---------------------------------------------------------------- 无尽模式：事件与奇物（v4）

check("旧档补字段：v3 存档读入后自动补 pendingEvent/collection/curios/curioOffers，其它字段不动", () => {
	const legacy = {
		version: 3,
		mode: "endless",
		characterId: "迪迦",
		level: 7,
		totalLevels: 0,
		currency: { gold: 88, exp: 9 },
		skills: [SKILL_A],
		stats: { defense: 1, draw: 0, attack: 0 },
		currentBattle: null,
		shopOffers: [],
		shopRefreshesRemaining: 1,
		cleared: false,
		createdAt: NOW,
		updatedAt: NOW,
	};
	const migrated = state.migrateSlots([legacy, null, null, null, null, null]);
	const run = migrated.slots[0];
	assertEqual(run.version, cfg.RUN_VERSION, "迁移后标成当前版本");
	assertEqual(run.pendingEvent, null, "旧档补 pendingEvent=null");
	assertEqual(JSON.stringify(run.collection), JSON.stringify({ events: [], curios: [] }), "旧档补空图鉴");
	assertEqual(JSON.stringify(run.curios), "[]", "旧档补空奇物");
	assertEqual(JSON.stringify(run.curioOffers), "[]", "旧档补空奇物候选");
	assertEqual(run.currency.gold, 88, "金币不变");
	assertEqual(run.skills.join(","), SKILL_A, "技能不变");
	assertEqual(run.level, 7, "关卡不变");
	assert(migrated.errors.some(error => error.includes("迁移")), "要提示做过版本迁移");
	// 新档同样带全 v4 字段
	const fresh = state.createRun(cfg.RUN_MODE.endless, "迪迦", NOW);
	assertEqual(fresh.pendingEvent, null, "新档 pendingEvent");
	assertEqual(fresh.curios.length, 0, "新档 curios");
	return `v3 → v${cfg.RUN_VERSION}`;
});

check("v4 字段校验：脏数据剔除、未知 id 丢弃、round-trip 保持", () => {
	const run = state.normalizeRun({
		...freshRun(cfg.RUN_MODE.endless),
		pendingEvent: {
			id: "不存在的事件",
			choices: [{ text: "假选项", reward: {} }],
			createdAt: NOW,
		},
		collection: { events: ["lost_robot", "lost_robot", "幽灵事件"], curios: ["energy_core", "幽灵奇物", "energy_core"] },
		curios: ["energy_core", "energy_core", "幽灵奇物"],
		curioOffers: [{ id: "lucky_stone", price: 9, sold: false }, { id: "幽灵奇物", price: 5 }, { id: "broken_watch", price: -3 }],
	});
	assertEqual(run.pendingEvent, null, "未知事件 id 整体丢弃");
	assertEqual(JSON.stringify(run.collection), JSON.stringify({ events: ["lost_robot"], curios: ["energy_core"] }), "图鉴去重且剔未知");
	assertEqual(JSON.stringify(run.curios), JSON.stringify(["energy_core"]), "奇物去重且剔未知");
	assertEqual(run.curioOffers.length, 2, "未知奇物的候选剔除");
	assertEqual(run.curioOffers[1].price, -3, "负价原样保留（负面奇物购买反得金币）");
	// 合法 pendingEvent 原样保留（choices 白名单重建后仍一致）
	const pending = {
		id: "lost_robot",
		choices: [
			{ text: "修复机器人", reward: { gold: -50, exp: 20 } },
			{ text: "拆卸零件", reward: { curio: "random" } },
			{ text: "离开", reward: {} },
		],
		createdAt: NOW,
	};
	const saved = state.normalizeRun({ ...freshRun(cfg.RUN_MODE.endless), pendingEvent: pending });
	assertEqual(JSON.stringify(saved.pendingEvent), JSON.stringify(pending), "合法事件原样保留");
	assertEqual(JSON.stringify(state.cloneRun(saved).pendingEvent), JSON.stringify(pending), "cloneRun round-trip 不变");
	// 选项形状非法的条目剔除，text 全空则整个事件丢弃
	const dirty = state.normalizeRun({
		...freshRun(cfg.RUN_MODE.endless),
		pendingEvent: { id: "lost_robot", choices: [null, { text: "  ", reward: {} }, { text: "离开", reward: { junk: 1 } }], createdAt: "x" },
	});
	assertEqual(dirty.pendingEvent.choices.length, 1, "非法选项剔除");
	assertEqual(JSON.stringify(dirty.pendingEvent.choices[0].reward), "{}", "未知奖励键剔除");
	const empty = state.normalizeRun({ ...freshRun(), pendingEvent: { id: "lost_robot", choices: [{ text: "  " }] } });
	assertEqual(empty.pendingEvent, null, "没有合法选项时丢弃整个事件");
	return "4 类脏数据 + round-trip";
});

check("公有图鉴合并：两份图鉴取并集，去重、剔未知、幂等", () => {
	const a = { events: ["lucky_coin"], curios: ["energy_core", "幽灵奇物"] };
	const b = { events: ["lost_robot", "lucky_coin"], curios: ["broken_watch", "energy_core"] };
	const merged = state.mergeCollections(a, b);
	assertEqual(JSON.stringify(merged), JSON.stringify({ events: ["lucky_coin", "lost_robot"], curios: ["energy_core", "broken_watch"] }), "并集且去重");
	assertEqual(JSON.stringify(state.mergeCollections(merged, merged)), JSON.stringify(merged), "再并不变（幂等）");
	assertEqual(JSON.stringify(state.mergeCollections(null, undefined)), JSON.stringify({ events: [], curios: [] }), "两边都缺给空图鉴");
	assertEqual(JSON.stringify(state.mergeCollections(a, null)), JSON.stringify({ events: ["lucky_coin"], curios: ["energy_core"] }), "另一边为空不丢内容");
	return "并集 / 幂等 / 缺省";
});

check("奇物定价：基准 round(50×√关卡) × 品质倍率（普通2/稀有5/史诗10/负面-5）× ±25% 随机", () => {
	assertEqual(curioManager.getCurioBasePrice(1), 50, "第 1 关基准");
	assertEqual(curioManager.getCurioBasePrice(10), 158, "第 10 关基准 round(158.11)");
	assertEqual(curioManager.getCurioBasePrice(2), 71, "第 2 关基准 round(70.7)（技能 floor 是 70）");
	assertEqual(curioManager.getCurioBasePrice(), 50, "缺省按第 1 关");
	const common = { rarity: "common" };
	const rare = { rarity: "rare" };
	const epic = { rarity: "epic" };
	const negative = { rarity: "negative" };
	// 下界 118.5、上界 197.5（第 10 关基准 158 ±25%）
	assertEqual(curioManager.getCurioPrice(10, common, () => 0), 237, "普通下界 round(118.5×2)");
	assertEqual(curioManager.getCurioPrice(10, undefined, () => 0), 119, "定义缺失按 ×1 兜底，不是普通档");
	assertEqual(curioManager.getCurioPrice(10, common, () => 0.999999), 395, "普通接近上界");
	assertEqual(curioManager.getCurioPrice(10, rare, () => 0), 593, "稀有下界 round(118.5×5)");
	assertEqual(curioManager.getCurioPrice(10, rare, () => 0.999999), 987, "稀有接近上界");
	assertEqual(curioManager.getCurioPrice(10, epic, () => 0), 1185, "史诗下界 round(118.5×10)");
	assertEqual(curioManager.getCurioPrice(10, epic, () => 0.999999), 1975, "史诗接近上界");
	// 负面 ×-5：价格为负，购买反而获得金币。Math.round 对 .5 向 +∞ 进位，所以下界是 -592 而非 -593
	assertEqual(curioManager.getCurioPrice(10, negative, () => 0), -592, "负面下界 round(118.5×-5)");
	assertEqual(curioManager.getCurioPrice(10, negative, () => 0.999999), -987, "负面接近上界");
	// 个人倍率与品质倍率相乘
	assertEqual(curioManager.getCurioPrice(10, { rarity: "rare", priceMultiplier: 1.5 }, () => 0), 889, "稀有 ×1.5：round(118.5×7.5)");
	// 真实数据对账：破损怀表=史诗、幸运石=稀有、诅咒金币=负面
	assertEqual(curiosData.curios.broken_watch.rarity, "epic", "破损怀表史诗");
	assertEqual(curiosData.curios.lucky_stone.rarity, "rare", "幸运石稀有");
	assertEqual(curiosData.curios.cursed_coin.rarity, "negative", "诅咒金币负面");
	for (let i = 0; i < 100; i++) {
		const price = curioManager.getCurioPrice(10, common);
		assert(Number.isInteger(price) && price >= 237 && price <= 395, `普通售价 ${price} 越界`);
	}
	return "第 10 关普通 237~395 / 史诗 1185~1975 / 负面 -987~-592";
});

check("奇物候选：胜利时摇三个、排除已拥有、池空给少、结果可持久化", () => {
	const rng = makeRng(7);
	const run = freshRun(cfg.RUN_MODE.endless);
	const offers = curioManager.rollCurioOffers(run, rng);
	assertEqual(offers.length, cfg.CURIO_OFFER_COUNT, "候选数");
	assertEqual(new Set(offers.map(offer => offer.id)).size, cfg.CURIO_OFFER_COUNT, "不重复");
	const poolIds = new Set(curiosData.curioIds);
	assert(offers.every(offer => poolIds.has(offer.id)), "候选来自奇物池");
	assert(offers.every(offer => typeof offer.id === "string" && Number.isFinite(offer.price)), "候选结构");
	// 排除已拥有：拥有 4 个时只能摇出剩下的那 1 个
	const owned = curiosData.curioIds.slice(0, curiosData.curioIds.length - 1);
	const narrow = curioManager.rollCurioOffers({ ...run, curios: owned }, makeRng(3));
	assertEqual(narrow.length, 1, "排除已拥有后只剩一个");
	assertEqual(narrow[0].id, curiosData.curioIds[curiosData.curioIds.length - 1], "只能是未拥有的那个");
	// 全拥有：空候选，不报错
	assertEqual(curioManager.rollCurioOffers({ ...run, curios: curiosData.curioIds }, makeRng(1)).length, 0, "集齐时候选为空");
	// 候选写进存档后原样读回
	const stored = state.normalizeRun({ ...run, curioOffers: offers });
	assertEqual(JSON.stringify(stored.curioOffers), JSON.stringify(offers), "候选可持久化");
	assertEqual(JSON.stringify(state.normalizeRun(stored).curioOffers), JSON.stringify(offers), "再读档不重掷");
	return offers.map(offer => `${offer.id}:${offer.price}`).join(" ");
});

check("购买奇物：扣款入袋、保留已购卡、本场限购一件、读档保持", () => {
	const run = freshRun(cfg.RUN_MODE.endless);
	run.currency.gold = 1000;
	run.curioOffers = [
		{ id: "energy_core", price: 10 },
		{ id: "lucky_stone", price: 10 },
	];
	const bought = curioManager.buyCurio(run, "energy_core");
	assert(bought.ok, bought.error ?? "购买应成功");
	assertEqual(bought.run.currency.gold, 990, "扣款");
	assertEqual(JSON.stringify(bought.run.curios), JSON.stringify(["energy_core"]), "奇物入袋");
	assertEqual(JSON.stringify(bought.run.collection.curios), JSON.stringify(["energy_core"]), "图鉴记录");
	assertEqual(bought.run.curioOffers.length, 2, "保留整批奇物候选以供购买后锁定");
	assertEqual(bought.run.curioOffers[0].sold, true, "买到的奇物应标记为已购买");
	assertEqual(bought.run.curioBoughtThisRound, true, "本场已购买标记生效");
	const again = curioManager.buyCurio(bought.run, "lucky_stone");
	assert(!again.ok && again.error.includes("已购买"), "同一场不允许再买第二件");
	// 余额不足被拒
	const poor = curioManager.buyCurio({ ...run, currency: { gold: 5, exp: 0 }, curioOffers: run.curioOffers.slice() }, "energy_core");
	assert(!poor.ok && poor.error.includes("金币"), "金币不足被拒");
	assertEqual(poor.run.currency.gold, 5, "被拒不扣款");
	// 未知候选被拒
	assert(!curioManager.buyCurio(run, "不存在").ok, "不在候选中被拒");
	// 购买结果可持久化（图鉴与奇物同一条曲线）
	const stored = state.normalizeRun(bought.run);
	assertEqual(JSON.stringify(stored.curios), JSON.stringify(["energy_core"]), "入袋可持久化");
	assertEqual(stored.curioOffers[0].sold, true, "已购买卡读档后保留");
	assertEqual(stored.curioBoughtThisRound, true, "限购状态读档后保留");
	assert(!curioManager.buyCurio(stored, "lucky_stone").ok, "读档不能再次购买");
	// 图鉴是「曾经拥有」：删掉奇物后图鉴不丢
	const discarded = state.normalizeRun({ ...stored, curios: [] });
	assertEqual(JSON.stringify(discarded.collection.curios), JSON.stringify(["energy_core"]), "丢弃后图鉴仍在");
	return "扣款/图鉴/保留已购卡/限购";
});

check("随机奇物奖励：排除已拥有、集齐时落空", () => {
	const run = freshRun(cfg.RUN_MODE.endless);
	const granted = curioManager.grantRandomCurio(run, () => 0);
	assert(granted.ok, "首次应成功");
	assertEqual(granted.run.curios.length, 1, "奇物入袋");
	assertEqual(JSON.stringify(granted.run.collection.curios), JSON.stringify(granted.run.curios), "图鉴同步");
	// 拥有全部-1 时只能给剩下的
	const owned = curiosData.curioIds.slice(0, -1);
	const last = curioManager.grantRandomCurio({ ...run, curios: owned }, () => 0.9);
	assert(last.ok && last.curioId === curiosData.curioIds[curiosData.curioIds.length - 1], "只能是剩下的那个");
	const full = curioManager.grantRandomCurio({ ...run, curios: curiosData.curioIds }, () => 0);
	assert(!full.ok && full.error.includes("集齐"), "集齐时落空");
	return granted.curioId;
});

check("CurioManager 统一接口：getBonus 聚合全部奇物的同类效果", () => {
	const ids = ["energy_core", "lucky_stone"];
	assertEqual(curioManager.sumCurioEffects(ids).extraDraw, 1, "extraDraw 聚合");
	assertEqual(curioManager.getBonus(ids, "expRate"), 0.1, "expRate 聚合");
	assertEqual(curioManager.getBonus(ids, "不存在"), 0, "未知键返回 0");
	assertEqual(curioManager.getBonus([], "extraDraw"), 0, "空列表返回 0");
	assertEqual(curioManager.getBonus(["幽灵"], "extraDraw"), 0, "未知奇物忽略");
	const lines = curioManager.describeCurioEffects(curioManager.sumCurioEffects(["broken_watch", "energy_core", "lucky_stone", "breath_belt", "leftover_rice"]));
	assertEqual(lines.length, 5, "五个战斗/结算效果都有文案");
	assert(lines.some(line => line.includes("额外的出牌阶段")), "怀表文案");
	assert(lines.some(line => line.includes("濒死")), "腰带文案");
	assert(lines.some(line => line.includes("+10%")), "幸运石文案");
	return lines.join(" / ");
});

check("奇物升级路线：图鉴读的就是奇物定义，每一档与实战效果同源", () => {
	// 全线核对：路线里每一档的文案必须与「该品质下实战用的效果表」逐字一致，
	// 图鉴据此不可能出现第二份效果配置
	for (const id of curiosData.curioIds) {
		const track = curioManager.getCurioUpgradeTrack(id);
		assert(track.length >= 1, `${id} 至少要有初始档`);
		for (const step of track) {
			assertEqual(
				JSON.stringify(step.lines.map(line => line.text)),
				JSON.stringify(curioManager.describeCurioEffects(curioManager.getCurioEffectAt(id, step.quality))),
				`${id} 的 ${step.quality} 档与实战效果同源`,
			);
		}
	}
	// 数值成长：普通 1 → 稀有 2 → 史诗 4，逐档给出最终值，且注记写清上一档
	const core = curioManager.getCurioUpgradeTrack("energy_core");
	assertEqual(core.map(step => step.quality).join(">"), "common>rare>epic", "从初始品质一路到链尾");
	assertEqual(
		JSON.stringify(core.map(step => step.lines[0].text)),
		JSON.stringify(["摸牌阶段额外摸 1 张牌", "摸牌阶段额外摸 2 张牌", "摸牌阶段额外摸 4 张牌"]),
		`每一档的最终数值：${core.map(step => step.lines[0].text).join(" / ")}`,
	);
	assertEqual(core[0].lines[0].prev, null, "初始档没有上一档");
	assertEqual(core[1].lines[0].prev, "摸牌阶段额外摸 1 张牌", "第二档注记上一档");
	assertEqual(core[0].changed, false, "初始档不算变化");
	assert(core.slice(1).every(step => step.changed), "后面几档都标了变化");
	// 负面奇物：从「金币 -10%」一路净化到「+20%」，四档全给
	const coin = curioManager.getCurioUpgradeTrack("cursed_coin");
	assertEqual(coin.length, 4, `负面奇物走满品质链：${coin.map(step => step.quality).join(">")}`);
	assert(coin[0].lines[0].text.includes("-10%"), `负面初始：${coin[0].lines[0].text}`);
	assert(coin[3].lines[0].text.includes("+20%"), `最高品质：${coin[3].lines[0].text}`);
	// 链尾起手（史诗）只有一档：不伪造升级档
	const watch = curioManager.getCurioUpgradeTrack("broken_watch");
	assertEqual(watch.length, 1, "史诗起手没有后续档位");
	assertEqual(watch[0].changed, false, "单档不算变化");
	// 玩家当前品质只是路线里的一档：升到史诗后图鉴仍给全链路（图鉴是资料册，不是状态面板）
	assertEqual(
		JSON.stringify(curioManager.describeCurio("energy_core", { energy_core: "epic" })),
		JSON.stringify([core[2].lines[0].text]),
		"玩家当前品质的效果 = 路线里对应那一档",
	);
	assert(core.length > 1, "图鉴不因玩家已升到史诗就只剩史诗档");
	// 不存在的奇物：返回空表而不是抛错
	assertEqual(curioManager.getCurioUpgradeTrack("幽灵奇物").length, 0, "未知奇物返回空路线");
	assertEqual(curioManager.getCurioUpgradeTrack(null).length, 0, "空 id 返回空路线");
	return `能量核心 3 档 / 诅咒金币 4 档（含负面）/ 怀表 1 档`;
});

check("事件触发：概率判定用注入 rng，闯关绝不触发，已有事件绝不重掷", () => {
	const endless = freshRun(cfg.RUN_MODE.endless);
	assertEqual(cfg.EVENT_TRIGGER_RATE, 0.4, "事件触发率按规格 40%");
	assertEqual(eventManager.shouldTriggerEvent(() => cfg.EVENT_TRIGGER_RATE - 0.01), true, "低于概率触发");
	assertEqual(eventManager.shouldTriggerEvent(() => cfg.EVENT_TRIGGER_RATE), false, "恰好等于不触发（严格小于）");
	// 闯关：一律原样返回
	const challenge = freshRun(cfg.RUN_MODE.challenge);
	assertEqual(eventManager.maybeCreatePendingEvent(challenge, 1, NOW, () => 0), challenge, "闯关不触发");
	// 无尽：rng 达标才触发
	assertEqual(eventManager.maybeCreatePendingEvent(endless, 1, NOW, () => 0.9), endless, "未触发时原样返回");
	const triggered = eventManager.maybeCreatePendingEvent(endless, 1, NOW, () => 0);
	assert(triggered !== endless && triggered.pendingEvent, "达标时生成待处理事件");
	assertEqual(triggered.pendingEvent.id, "lost_robot", "rng=0 抽中第一个事件");
	assertEqual(triggered.pendingEvent.createdAt, NOW, "记录 createdAt");
	assertEqual(JSON.stringify(triggered.collection.events), JSON.stringify(["lost_robot"]), "图鉴记录已发现事件");
	// 已有 pendingEvent：不再触发、不再重掷
	const kept = eventManager.maybeCreatePendingEvent(triggered, 2, NOW, () => 0);
	assertEqual(JSON.stringify(kept.pendingEvent), JSON.stringify(triggered.pendingEvent), "已有事件原样保留");
	assertEqual(kept.collection.events.length, 1, "图鉴不重复记录");
	return triggered.pendingEvent.id;
});

check("事件构建：倍率按胜利奖励换算、outcomes 当场预掷、读档恢复不重掷", () => {
	// 第 1 关胜利奖励 50 金币 / 20 经验：修复机器人 = -50 金币 +100 经验（5 倍胜利经验）
	const built = eventManager.buildPendingEvent("lost_robot", 1, makeRng(1), NOW);
	assertEqual(built.choices.length, 3, "选项数");
	assertEqual(JSON.stringify(built.choices[0].reward), JSON.stringify({ gold: -50, exp: 100 }), "倍率换算成固定值");
	assertEqual(JSON.stringify(built.choices[1].reward), JSON.stringify({ curio: "random" }), "随机奇物保持标记");
	assertEqual(JSON.stringify(built.choices[2].reward), JSON.stringify({}), "离开无奖励");
	// 消耗类选项把价钱写进文案（玩家点之前就知道要花多少）
	assert(built.choices[0].text.includes("-50 金币"), `消耗文案带金额：${built.choices[0].text}`);
	assert(!built.choices[2].text.includes("金币"), "无消耗选项不加金额后缀");
	// 金币不足时消耗项不可选（事件页置灰与结算拒绝共用这一判定）；奇物选项没有货币消耗，0 金币照常可选
	assert(!eventManager.isChoiceAffordable({ ...freshRun(cfg.RUN_MODE.endless), currency: { gold: 10, exp: 0 } }, built.choices[0].reward), "10 金币不够 50 的消耗项");
	assert(eventManager.isChoiceAffordable({ ...freshRun(cfg.RUN_MODE.endless), currency: { gold: 50, exp: 0 } }, built.choices[0].reward), "恰好够时不判不足");
	assert(eventManager.isChoiceAffordable({ ...freshRun(cfg.RUN_MODE.endless), currency: { gold: 0, exp: 0 } }, built.choices[1].reward), "奇物选项不看金币");
	// 神秘商人：花 5 倍胜利金币换一个随机奇物
	const merchant = eventManager.buildPendingEvent("mystery_merchant", 1, () => 0, NOW);
	assertEqual(JSON.stringify(merchant.choices[0].reward), JSON.stringify({ gold: -250, curio: "random" }), "奇物 ×5 基准倍率（第 1 关 50×5=250）");
	assert(merchant.choices[0].text.includes("-250 金币"), `商人选项写明花费：${merchant.choices[0].text}`);
	// 集齐奇物时该选项不算「货币不足」（跳过分支不花钱，不能被置灰）
	const brokeFull = { ...freshRun(cfg.RUN_MODE.endless), currency: { gold: 0, exp: 0 }, curios: curiosData.curioIds.slice() };
	assert(eventManager.isChoiceAffordable(brokeFull, merchant.choices[0].reward), "集齐奇物 + 金币不足也不置灰");
	// 第 100 关：金币 floor(500)、经验 floor(200×5)=1000 → 倍率跟着放大
	const late = eventManager.buildPendingEvent("lost_robot", 100, makeRng(1), NOW);
	assertEqual(JSON.stringify(late.choices[0].reward), JSON.stringify({ gold: -500, exp: 1000 }), "高关卡按当关奖励缩放");
	// 幸运硬币：rng=0 预掷第一段（+2 倍金币 +2 倍经验），rng→1 预掷第二段（-0.5 倍金币）
	const heads = eventManager.buildPendingEvent("lucky_coin", 1, () => 0, NOW);
	assertEqual(JSON.stringify(heads.choices[0].reward), JSON.stringify({ gold: 100, exp: 40 }), "rng=0 → +100 金币 +40 经验");
	const tails = eventManager.buildPendingEvent("lucky_coin", 1, () => 0.999, NOW);
	assertEqual(JSON.stringify(tails.choices[0].reward), JSON.stringify({ gold: -25 }), "rng→1 → -25（round(50×-0.5)）");
	// 赌局选项（outcomes）不把预掷金额写进按钮：写出正负等于剧透结果
	assertEqual(heads.choices[0].text, "拾取", `正面不剧透：${heads.choices[0].text}`);
	assertEqual(tails.choices[0].text, "拾取", `反面不剧透：${tails.choices[0].text}`);
	// 许愿池的投入百分比与结果无关，保留说明；倍率允许小数，不能被 floor 成整数
	const pool = eventManager.buildPendingEvent("wishing_pool", 1, () => 0, NOW);
	assert(pool.choices[0].text.includes("投入 10% 金币"), `许愿池保留投入说明：${pool.choices[0].text}`);
	assertEqual(pool.choices[0].reward.goldPayout, 13, "小额中奖 13 倍");
	assertEqual(pool.choices[1].reward.goldPayout, 2.2, "中额中奖 2.2 倍（小数不得被截断）");
	assertEqual(pool.choices[2].reward.goldPayout, 1.02, "大额中奖 1.02 倍（小数不得被截断）");
	// 同一 rng 序列下构建两次结果一致（预掷可复现），且能原样写进存档
	const a = eventManager.buildPendingEvent("unknown_lab", 3, makeRng(9), NOW);
	const b = eventManager.buildPendingEvent("unknown_lab", 3, makeRng(9), NOW);
	assertEqual(JSON.stringify(a), JSON.stringify(b), "同种子构建一致");
	const saved = state.normalizeRun({ ...freshRun(cfg.RUN_MODE.endless), pendingEvent: a });
	assertEqual(JSON.stringify(saved.pendingEvent), JSON.stringify(a), "预掷结果可持久化");
	// 未知实验室的 statUp/statDown "random" 必须在生成时就地解析成具体属性（否则结算时无事发生）
	assert(
		["statUp", "statDown"].some(key => cfg.STAT_IDS.includes(a.choices[0].reward[key])),
		"未知实验室随机属性已定死",
	);
	// 未知事件 / 空选项：返回 null
	assertEqual(eventManager.buildPendingEvent("不存在", 1), null, "未知事件");
	return "倍率 + 预掷 + 复现";
});

check("事件结算：入账与扣款、奇物/技能/属性奖励、pendingEvent 清空", () => {
	const run = freshRun(cfg.RUN_MODE.endless);
	run.currency = { gold: 100, exp: 0 };
	run.pendingEvent = {
		id: "lost_robot",
		choices: [
			{ text: "修复机器人", reward: { gold: -50, exp: 20 } },
			{ text: "拆卸零件", reward: { curio: "random" } },
		],
		createdAt: NOW,
	};
	const repair = eventManager.resolveEventChoice(run, 0);
	assert(repair.ok, repair.error ?? "修复应成功");
	assertEqual(repair.run.currency.gold, 50, "扣金币");
	assertEqual(repair.run.currency.exp, 20, "得经验");
	assertEqual(repair.run.pendingEvent, null, "事件完成清空");
	assertEqual(JSON.stringify(repair.lines), JSON.stringify(["金币 -50", "经验 +20"]), "结算文案");
	// 金币不足：拒绝且不改数据
	const broke = { ...run, currency: { gold: 10, exp: 0 }, pendingEvent: run.pendingEvent };
	const denied = eventManager.resolveEventChoice(broke, 0);
	assert(!denied.ok && denied.error.includes("不足"), "扣款不足被拒");
	assertEqual(denied.run.currency.gold, 10, "被拒不扣款");
	// 随机奇物：入袋 + 图鉴 + 文案带名字
	const dismantle = eventManager.resolveEventChoice({ ...run, pendingEvent: run.pendingEvent }, 1, {}, () => 0);
	assert(dismantle.ok && dismantle.curioId, "应获得奇物");
	assert(dismantle.run.curios.includes(dismantle.curioId), "奇物入袋");
	assert(dismantle.run.collection.curios.includes(dismantle.curioId), "图鉴记录");
	assert(dismantle.lines.some(line => line.includes("获得奇物")), "文案说明奇物");
	// 随机技能：从候选池排除持有（含未装备）与原生，一律进背包、不自动装备；装备位满也照收
	const skillRun = freshRun(cfg.RUN_MODE.endless);
	skillRun.pendingEvent = { id: "mystery_merchant", choices: [{ text: "购买情报", reward: { skill: "random" } }], createdAt: NOW };
	const learned = eventManager.resolveEventChoice(skillRun, 0, {
		candidates: [{ id: SKILL_A }, { id: SKILL_B }, { id: SKILL_C }],
		characterSkills: [SKILL_A],
	}, () => 0);
	assert(learned.ok && learned.skillId === SKILL_B, "原生技能被排除后取 SKILL_B");
	assertEqual(JSON.stringify(learned.run.skillInventory), JSON.stringify([SKILL_B]), "技能入背包");
	assertEqual(learned.run.skills.length, 0, "事件拿到的技能不自动装备");
	const fullSlots = {
		...skillRun,
		skills: [SKILL_B, SKILL_C, "rogue_extra"],
		skillInventory: [SKILL_B, SKILL_C, "rogue_extra"],
		pendingEvent: skillRun.pendingEvent,
	};
	const noRoom = eventManager.resolveEventChoice(fullSlots, 0, { candidates: [{ id: SKILL_A }] }, () => 0);
	assert(noRoom.ok && noRoom.skillId === SKILL_A, "装备位满也照常学到技能");
	assertEqual(JSON.stringify(noRoom.run.skillInventory), JSON.stringify([SKILL_B, SKILL_C, "rogue_extra", SKILL_A]), "新技能进背包，绝不因装备满而丢失");
	assertEqual(noRoom.run.skills.length, 3, "装备位不被自动占用");
	// 闯关（旧版机制）：未满直接进技能栏；满槽学不会，也不许偷偷进任何背包
	const chEvent = { id: "mystery_merchant", choices: [{ text: "购买情报", reward: { skill: "random" } }], createdAt: NOW };
	const chRun = { ...freshRun(cfg.RUN_MODE.challenge), pendingEvent: chEvent };
	const chLearned = eventManager.resolveEventChoice(chRun, 0, { candidates: [{ id: SKILL_A }] }, () => 0);
	assert(chLearned.ok && chLearned.skillId === SKILL_A, "闯关未满时应学会技能");
	assertEqual(JSON.stringify(chLearned.run.skills), JSON.stringify([SKILL_A]), "闯关事件技能直接进技能栏");
	const chFull = {
		...chRun,
		skills: [SKILL_A, SKILL_B, SKILL_C],
		skillInventory: [SKILL_A, SKILL_B, SKILL_C],
		pendingEvent: chEvent,
	};
	const chNoRoom = eventManager.resolveEventChoice(chFull, 0, { candidates: [{ id: "rogue_extra" }] }, () => 0);
	assert(chNoRoom.ok && chNoRoom.skillId === null, "闯关满槽学不会");
	assertEqual(JSON.stringify(chNoRoom.run.skills), JSON.stringify([SKILL_A, SKILL_B, SKILL_C]), "技能栏不变");
	assertEqual(JSON.stringify(chNoRoom.run.skillInventory), JSON.stringify([SKILL_A, SKILL_B, SKILL_C]), "不会偷偷进背包");
	assert(chNoRoom.lines.some(line => line.includes("技能槽已满")), "文案写明未学会");
	// 属性随机 +1：rng 定死属性、越界钳制并写明
	const labRun = freshRun(cfg.RUN_MODE.endless);
	labRun.pendingEvent = { id: "unknown_lab", choices: [{ text: "进入", reward: { statUp: "attack" } }], createdAt: NOW };
	const up = eventManager.resolveEventChoice(labRun, 0, {}, () => 0);
	assertEqual(up.run.stats.attack, 1, "攻击 +1");
	assert(up.lines.some(line => line.includes("攻击")), "文案写明属性");
	const maxed = { ...labRun, stats: { defense: 0, draw: 0, attack: statsData.stats.attack.maxLevel }, pendingEvent: labRun.pendingEvent };
	const capped = eventManager.resolveEventChoice(maxed, 0, {}, () => 0);
	assertEqual(capped.run.stats.attack, statsData.stats.attack.maxLevel, "满级不再加");
	assert(capped.lines.some(line => line.includes("已达最高等级")), "满级文案");
	// 属性随机 -1 到 0 的下限
	const labDown = { ...labRun, pendingEvent: { ...labRun.pendingEvent, choices: [{ text: "进入", reward: { statDown: "attack" } }] } };
	const down = eventManager.resolveEventChoice(labDown, 0, {}, () => 0);
	assertEqual(down.run.stats.attack, 0, "最低不再减");
	assert(down.lines.some(line => line.includes("已是最低等级")), "下限文案");
	return "入账/扣款/奇物/技能/属性";
});

check("未知实验室：属性全满时随机到升级改给一个随机奇物", () => {
	const maxed = {};
	for (const id of cfg.STAT_IDS) {
		maxed[id] = statsData.stats[id].maxLevel;
	}
	// 直接按事件 id 构建：本用例测的是「全满时改给随机奇物」这条生成期改写，
	// 不该依赖「池子里第几个恰好是未知实验室」——事件池会随内容扩充换位
	const pending = eventManager.buildPendingEvent("unknown_lab", 31, () => 0, NOW, { statLevels: maxed, curios: [] });
	assert(pending?.id === "unknown_lab", "构建出未知实验室事件");
	assertEqual(JSON.stringify(pending.choices[0].reward), JSON.stringify({ curio: "random" }), "全满时升级已换成随机奇物");
	const run = { ...freshRun(cfg.RUN_MODE.endless), stats: { ...maxed }, pendingEvent: pending };
	const settled = eventManager.resolveEventChoice(run, 0, {}, () => 0);
	assert(settled.ok && settled.curioId, `应获得奇物：${settled.error ?? ""}`);
	assert(settled.run.curios.includes(settled.curioId), "奇物入袋");
	assert(cfg.STAT_IDS.every(id => settled.run.stats[id] === maxed[id]), `全满属性保持原样：${JSON.stringify(settled.run.stats)}`);
	assert(settled.lines.some(line => line.includes("获得奇物")), `文案写明获得奇物：${settled.lines.join(" / ")}`);
	// 只有一项没满：不换，仍按原样给属性升级（越界钳制由结算层负责）
	const notQuite = { ...maxed, [cfg.STAT_IDS[cfg.STAT_IDS.length - 1]]: statsData.stats[cfg.STAT_IDS[cfg.STAT_IDS.length - 1]].maxLevel - 1 };
	const kept = eventManager.buildPendingEvent("unknown_lab", 31, () => 0, NOW, { statLevels: notQuite, curios: [] });
	assert(cfg.STAT_IDS.includes(kept.choices[0].reward.statUp), `未满时仍是属性升级：${JSON.stringify(kept.choices[0].reward)}`);
	// 全满时的 statDown 是真实减益，不参与替换
	const down = eventManager.buildPendingEvent("unknown_lab", 31, () => 0.999, NOW, { statLevels: maxed, curios: [] });
	assert(cfg.STAT_IDS.includes(down.choices[0].reward.statDown), `减益保持原样：${JSON.stringify(down.choices[0].reward)}`);
	return "全满 → 随机奇物（含结算与两条边界）";
});

check("许愿池：按当前金币百分比投入，赢时按倍率返还", () => {
	const wager = (gold, reward) => {
		const run = { ...freshRun(cfg.RUN_MODE.endless), currency: { gold, exp: 0 } };
		run.pendingEvent = { id: "wishing_pool", choices: [{ text: "投入", reward }], createdAt: NOW };
		return eventManager.resolveEventChoice(run, 0, {}, () => 0);
	};
	// 中奖：投 10%（1000→扣 100）拿回 13 倍（+1300）→ 净 2200
	const hit = wager(1000, { goldPct: 10, goldPayout: 13 });
	assert(hit.ok, hit.error ?? "投入应成功");
	assertEqual(hit.run.currency.gold, 2200, "10% 投入 ×13 倍");
	assert(hit.lines.some(line => line.includes("投入金币 -100")), `投入文案：${hit.lines.join(" | ")}`);
	assert(hit.lines.some(line => line.includes("13 倍")), "返还写明倍数");
	// 落空：投入全额亏掉
	const miss = wager(1000, { goldPct: 10, goldPayout: 0 });
	assertEqual(miss.run.currency.gold, 900, "落空只剩 900");
	assert(miss.lines.some(line => line.includes("落空")), "落空文案");
	// 中额：投 20%（200）拿回 2.2 倍（440）→ 净 1240
	const mediumHit = wager(1000, { goldPct: 20, goldPayout: 2.2 });
	assertEqual(mediumHit.run.currency.gold, 1240, "20% 投入 ×2.2 倍");
	assert(mediumHit.lines.some(line => line.includes("2.2 倍")), `中额返还写明小数倍率：${mediumHit.lines.join(" | ")}`);
	const mediumMiss = wager(1000, { goldPct: 20, goldPayout: 0 });
	assertEqual(mediumMiss.run.currency.gold, 800, "中额落空只剩 800");
	// 必中档：投 50% 拿回 1.02 倍（500 + 510）→ 1010（+1%）
	const sure = wager(1000, { goldPct: 50, goldPayout: 1.02 });
	assertEqual(sure.run.currency.gold, 1010, "50% 投入 ×1.02 倍");
	// 小数倍率不得被截断：2.2 若变成 2、1.02 若变成 1，返还额会少一截
	assertEqual(wager(10, { goldPct: 100, goldPayout: 2.2 }).run.currency.gold, 22, "10 × 2.2 = 22（截成 2 会只剩 20）");
	assertEqual(wager(1000, { goldPct: 100, goldPayout: 1.02 }).run.currency.gold, 1020, "1000 × 1.02 = 1020（截成 1 会只剩 1000）");
	// 投入额按「点击那一刻」的金币算，不是事件生成时：生成后金币变多也要按新余额投
	const grown = { ...freshRun(cfg.RUN_MODE.endless), currency: { gold: 2000, exp: 0 } };
	const pending = eventManager.buildPendingEvent("wishing_pool", 3, () => 0, NOW);
	const afterGrowth = eventManager.resolveEventChoice({ ...grown, pendingEvent: pending }, 2, {}, () => 0);
	assertEqual(afterGrowth.run.currency.gold, 2020, "按点击时余额 2000 投 50% 拿 1.02 倍");
	// 投入取整：101 的 50% → round(50.5)=51，返还 round(51×1.02)=52 → 102
	const odd = wager(101, { goldPct: 50, goldPayout: 1.02 });
	assertEqual(odd.run.currency.gold, 102, "投入与返还都按整数金币结算");
	// 金币为 0：选项直接不可选、结算被拒，绝不落成负数
	const empty = wager(0, { goldPct: 50, goldPayout: 1.02 });
	assert(!empty.ok, "0 金币时投入被拒");
	assertEqual(empty.run.currency.gold, 0, "没有金币不落成负数");
	const poorRun = { ...freshRun(cfg.RUN_MODE.endless), currency: { gold: 0, exp: 0 } };
	assert(!eventManager.isChoiceAffordable(poorRun, { goldPct: 50, goldPayout: 1.02 }), "0 金币时选项不可选");
	assert(eventManager.isChoiceAffordable({ ...poorRun, currency: { gold: 1, exp: 0 } }, { goldPct: 50, goldPayout: 1.02 }), "有 1 块也能投 50%");
	// 余额小到四舍五入后投不出 1 块：结算不报错、不倒扣，原样返回
	const dust = wager(1, { goldPct: 10, goldPayout: 13 });
	assert(dust.ok, dust.error ?? "小额不该报错");
	assertEqual(dust.run.currency.gold, 1, "投不出的 1 块不动");
	assert(dust.lines.some(line => line.includes("金币不足")), `投不出时写明：${dust.lines.join(" | ")}`);
	// 百分比与倍率都被夹在合法范围，不接受负数倍率；小数倍率原样保留
	const clean = eventManager.normalizeEventReward({ goldPct: -500, goldPayout: -3 });
	assertEqual(clean.goldPct, -100, "百分比夹到 -100");
	assertEqual(clean.goldPayout, 0, "负倍率归零");
	assertEqual(eventManager.normalizeEventReward({ goldPayout: 2.2 }).goldPayout, 2.2, "2.2 不被截断");
	assertEqual(eventManager.normalizeEventReward({ goldPayout: 1.02 }).goldPayout, 1.02, "1.02 不被截断");
	// 文案带百分比（金额随余额浮动，此时算不准）
	const text = eventManager.buildPendingEvent("wishing_pool", 3, () => 0, NOW).choices[0].text;
	assert(text.includes("10%"), `许愿池选项写明比例：${text}`);
	return "投入/返还/落空/取整/小数倍率/边界";
});

check("许愿池：历史存档保留预掷结果，只把返还倍率迁到新表", () => {
	const legacyRun = reward => ({
		...freshRun(cfg.RUN_MODE.endless),
		currency: { gold: 1000, exp: 0 },
		pendingEvent: { id: "wishing_pool", choices: [{ text: "许愿", reward }], createdAt: NOW },
	});
	// 旧档里预掷定的「小额命中 + 100 倍」：命中保留，倍率改成现行 13 倍
	const migrated = state.normalizeRun(legacyRun({ goldPct: 10, goldPayout: 100 }));
	assertEqual(migrated.pendingEvent.choices[0].reward.goldPayout, 13, "旧 100 倍改为 13 倍");
	const settled = eventManager.resolveEventChoice(migrated, 0, {}, () => 0);
	assertEqual(settled.run.currency.gold, 2200, "按新倍率结算，不再发 100 倍");
	assertEqual(settled.run.pendingEvent, null, "结算后事件清空");
	// 再读档不会重掷、也不会把奖励再发一遍
	const reloaded = state.normalizeRun(settled.run);
	assertEqual(reloaded.pendingEvent, null, "事件不会被重新挂回");
	assertEqual(reloaded.currency.gold, 2200, "读档不会重复领取奖励");
	// 三档旧倍率都迁移；落空保持落空
	for (const [reward, expected] of [
		[{ goldPct: 10, goldPayout: 100 }, 13],
		[{ goldPct: 20, goldPayout: 10 }, 2.2],
		[{ goldPct: 50, goldPayout: 2 }, 1.02],
		[{ goldPct: 10, goldPayout: 0 }, 0],
	]) {
		const loaded = state.normalizeRun(legacyRun(reward));
		assertEqual(loaded.pendingEvent.choices[0].reward.goldPayout, expected, `旧档迁移：${JSON.stringify(reward)} → ${expected}`);
	}
	// 新档预掷结果（已是新倍率）往返存档后小数不丢，可原样结算
	const built = eventManager.buildPendingEvent("wishing_pool", 3, () => 0, NOW);
	const saved = state.normalizeRun({ ...freshRun(cfg.RUN_MODE.endless), pendingEvent: built });
	assertEqual(saved.pendingEvent.choices[1].reward.goldPayout, 2.2, "2.2 在存档往返中保持小数");
	assertEqual(saved.pendingEvent.choices[2].reward.goldPayout, 1.02, "1.02 在存档往返中保持小数");
	// 真实落盘走 JSON：序列化往返后小数倍率同样不能被截断
	const wire = JSON.parse(JSON.stringify(saved));
	assertEqual(state.normalizeRun(wire).pendingEvent.choices[2].reward.goldPayout, 1.02, "JSON 往返后 1.02 仍不被截断");
	// 旧档落空仍损失全部投入，不会因为迁移变成命中
	const legacyMiss = state.normalizeRun(legacyRun({ goldPct: 20, goldPayout: 0 }));
	const missed = eventManager.resolveEventChoice(legacyMiss, 0, {}, () => 0);
	assertEqual(missed.run.currency.gold, 800, "旧档落空照旧损失 20% 投入");
	assert(missed.lines.some(line => line.includes("落空")), "落空文案");
	return "旧 100/10/2 → 13/2.2/1.02，落空不变，读档不重复入账";
});

check("循环按钮：每场战斗结束额外补一次技能商城刷新", () => {
	const base = { ...freshRun(cfg.RUN_MODE.endless), level: 3 };
	const plain = reward.settleVictory(base, NOW, () => 0);
	assertEqual(plain.run.shopRefreshesRemaining, cfg.SKILL_REFRESH_PER_LEVEL, "无奇物时按基础额度");
	const withLoop = { ...base, curios: ["loop_button"] };
	const won = reward.settleVictory(withLoop, NOW, () => 0);
	assertEqual(won.run.shopRefreshesRemaining, cfg.SKILL_REFRESH_PER_LEVEL + 1, "循环按钮 +1 次");
	// 读档不得把多出来的次数夹掉：上限按奇物**最高品质**放宽（循环按钮史诗档是 +2）
	const cap = curioManager.getMaxShopRefreshes();
	assertEqual(cap, cfg.SKILL_REFRESH_PER_LEVEL + 2, "上限按奇物最高品质放宽");
	assertEqual(state.normalizeRun(won.run).shopRefreshesRemaining, cfg.SKILL_REFRESH_PER_LEVEL + 1, "稀有档额外次数原样读回，不被夹掉");
	// 升到史诗后 +2，读档同样放得下
	const epicLoop = { ...withLoop, curioQuality: { loop_button: "epic" } };
	const epicWon = reward.settleVictory(epicLoop, NOW, () => 0);
	assertEqual(epicWon.run.shopRefreshesRemaining, cfg.SKILL_REFRESH_PER_LEVEL + 2, "史诗循环按钮 +2");
	assertEqual(state.normalizeRun(epicWon.run).shopRefreshesRemaining, cfg.SKILL_REFRESH_PER_LEVEL + 2, "史诗档不会被上限夹掉");
	// 攒着不花：连续两场战斗各 +1（每场都重置，不累积成 4）
	assertEqual(reward.settleVictory(won.run, NOW, () => 0).run.shopRefreshesRemaining, cfg.SKILL_REFRESH_PER_LEVEL + 1, "每场重置为 3，不累积");
	// 真的能多刷一次：基础额度只有 2 次，循环按钮让第 3 次也能刷
	const pool = [{ id: SKILL_A }, { id: SKILL_B }, { id: SKILL_C }];
	let shopRun = { ...won.run, shopOffers: [] };
	for (let i = 0; i < cfg.SKILL_REFRESH_PER_LEVEL; i++) {
		const step = shop.refreshSkillOffers(shopRun, () => 0, [], pool);
		assert(step.ok, `第 ${i + 1} 次刷新可用`);
		shopRun = step.run;
	}
	assertEqual(shopRun.shopRefreshesRemaining, 1, "基础 2 次刷完还剩 1 次（循环按钮给的）");
	const third = shop.refreshSkillOffers(shopRun, () => 0, [], pool);
	assert(third.ok, "第 3 次刷新可用（基础额度之外的额外机会）");
	assertEqual(third.run.shopRefreshesRemaining, 0, "额外那次也用掉");
	assert(!shop.refreshSkillOffers(third.run, () => 0, [], pool).ok, "真的用光了");
	return "每战 +1 / 可持久化 / 真能多刷";
});

check("胜利结算（无尽）：摇奇物候选、幸运石放大经验；闯关两项都不做", () => {
	// 无尽第 1 关胜利：候选按推进后的第 2 关定价（round(50×√2)=71 → 普通 53~89，再乘品质倍率）
	const endless = freshRun(cfg.RUN_MODE.endless);
	const won = reward.settleVictory(endless, NOW, () => 0);
	assertEqual(won.run.level, 2, "推进到第 2 关");
	assertEqual(won.run.curioOffers.length, cfg.CURIO_OFFER_COUNT, "候选三个");
	// rng=()=>0 取下界：round(71×0.75×品质倍率)，普通 107（106.5 进位）/ 稀有 266 / 史诗 533 / 负面 -266
	const levelFloor = 71 * (1 - cfg.CURIO_PRICE_SPREAD);
	assert(
		won.run.curioOffers.every(offer => offer.price === curioManager.getCurioPrice(2, curiosData.getCurio(offer.id), () => 0)),
		`第 2 关售价 = round(71×0.75×品质倍率)：${won.run.curioOffers.map(offer => `${offer.id}:${offer.price}`).join(",")}`,
	);
	assert(
		won.run.curioOffers.every(offer => offer.price === Math.round(levelFloor * curiosData.CURIOSITY_RARITY_PRICE[curiosData.getCurio(offer.id).rarity])),
		`第 2 关售价 = round(71×0.75×品质倍率)：${won.run.curioOffers.map(offer => `${offer.id}:${offer.price}`).join(",")}`,
	);
	assertEqual(won.gained.exp, 20, "无奇物时经验不变");
	// 幸运石：经验 +10% → round(20×1.1)=22，金币不变
	const lucky = { ...freshRun(cfg.RUN_MODE.endless), curios: ["lucky_stone"] };
	const blessed = reward.settleVictory(lucky, NOW, () => 0);
	assertEqual(blessed.gained.exp, 22, "幸运石经验 round(20×1.1)");
	assertEqual(blessed.gained.gold, 50, "金币不受影响");
	// 高关卡对账：第 9 关（floor(150)/floor(60)）持有幸运石 → exp round(60×1.1)=66
	const lucky9 = { ...freshRun(cfg.RUN_MODE.endless), level: 9, curios: ["lucky_stone"] };
	assertEqual(reward.settleVictory(lucky9, NOW, () => 0).gained.exp, 66, "第 9 关经验加成");
	// 闯关：无候选、无加成（旧平衡完全不动）
	const challenge = freshRun(cfg.RUN_MODE.challenge);
	const challengeWon = reward.settleVictory(challenge, NOW, () => 0);
	assertEqual(JSON.stringify(challengeWon.run.curioOffers), "[]", "闯关无奇物候选");
	assertEqual(challengeWon.gained.gold, 50, "闯关金币固定");
	// 按 CURIO_SHOP_RATE 门控：rng ≥ 配置值未命中 → 整批清空（旧批次不留着，同一批货不许挂十几关）；
	// rng < 配置值命中 → 整批重摇。事件判定在 mode.js 里排在其后（先奇物商店、再事件）
	const stale = { ...freshRun(cfg.RUN_MODE.endless), level: 4, curioOffers: [{ id: "lucky_stone", price: 66, sold: false }] };
	const missed = reward.settleVictory(stale, NOW, () => 0.5);
	assertEqual(missed.run.level, 5, "未命中同样推进关卡");
	assertEqual(JSON.stringify(missed.run.curioOffers), "[]", "未命中清空旧批次");
	const rerolled = reward.settleVictory({ ...stale }, NOW, () => 0);
	assertEqual(rerolled.run.curioOffers.length, cfg.CURIO_OFFER_COUNT, "命中整批重摇");
	assert(!rerolled.run.curioOffers.some(offer => offer.id === "lucky_stone" && offer.price === 66), "重摇是换新货，不是把旧批次留着");
	assert(rerolled.run.curioOffers.every(offer => Number.isFinite(offer.price)), "新一批连价定死");
	// 结算不清奇物与图鉴
	assertEqual(JSON.stringify(blessed.run.curios), JSON.stringify(["lucky_stone"]), "胜利不清奇物");
	return `无尽候选 ${won.run.curioOffers.length} 个（${won.run.curioOffers.map(offer => `${curiosData.getCurio(offer.id).name} ${offer.price}`).join(" / ")}）/ 幸运石 exp 20→22`;
});

/**
 * 让 grantRandomCurio 恰好抽中指定的那件奇物。
 * 随机池 = 「未拥有的奇物」按定义顺序，加一件奇物整套下标就全变——记死的 rng 数只能测出「数组第几个」，
 * 测不出任何真实行为，还会在每次内容扩充时假红。所以这里按当前池子反推 rng。
 */
const rngForCurio = (run, target) => {
	const pool = curioManager.curioIds.filter(id => !(run.curios ?? []).includes(id));
	if (!pool.includes(target)) {
		throw new Error(`rngForCurio：${target} 不在可随机池里`);
	}
	return () => (pool.indexOf(target) + 0.5) / pool.length;
};

check("过期候选清理：事件送的奇物撤下候选并补货，读档剔除已拥有的条目", () => {
	// 事件送奇物：若送出的同款还挂在商店候选里（生成候选时还没拥有），整条撤下，
	// 撤下的那格当场补摇新货——货架保持满员（旧版只撤不补，商店只剩两个候选）
	const run = freshRun(cfg.RUN_MODE.endless);
	run.curioOffers = [
		{ id: "lucky_stone", price: 10 },
		{ id: "energy_core", price: 10 },
	];
	const lucky = curioManager.grantRandomCurio({ ...run }, rngForCurio(run, "lucky_stone"));
	assertEqual(lucky.curioId, "lucky_stone", "rng 定位幸运石");
	assert(!lucky.run.curioOffers.some(offer => offer.id === "lucky_stone"), "送出的奇物从候选撤下");
	assertEqual(lucky.run.curioOffers.length, cfg.CURIO_OFFER_COUNT, "撤下的格子补上新货：货架恢复满员");
	assertEqual(lucky.run.curioOffers[0].id, "energy_core", "原有候选原样保留在原位");
	// 补上的新货：互不重复、不在架上原有候选里、未拥有、连价定死（价格可正可负——负面奇物反得金币）
	const restocked = lucky.run.curioOffers.slice(1);
	assertEqual(new Set(restocked.map(offer => offer.id)).size, restocked.length, "补货互不重复");
	assert(!restocked.some(offer => offer.id === "energy_core"), "补货不与架上原有候选重复");
	assert(restocked.every(offer => curiosData.getCurio(offer.id) && !lucky.run.curios.includes(offer.id)), "补货排除已拥有");
	assert(restocked.every(offer => Number.isFinite(offer.price)), "补货连价定死");
	// 空货架不补：这一关没刷出奇物商店，送奇物不该凭空开出一家店
	const bare = curioManager.grantRandomCurio({ ...run, curioOffers: [] }, rngForCurio(run, "energy_core"));
	assertEqual(JSON.stringify(bare.run.curioOffers), "[]", "空货架保持空");
	// 读档清洗：已拥有但非 sold 的旧过期候选剔除；已购买的 sold 卡保留显示；未拥有候选保留
	const stored = state.normalizeRun({
		...freshRun(cfg.RUN_MODE.endless),
		curios: ["energy_core", "broken_watch"],
		curioOffers: [
			{ id: "energy_core", price: 10, sold: true },
			{ id: "broken_watch", price: 10 },
			{ id: "lucky_stone", price: 10 },
			{ id: "幽灵", price: 10 },
		],
	});
	assertEqual(JSON.stringify(stored.curioOffers.map(offer => offer.id)), JSON.stringify(["energy_core", "lucky_stone"]), "已购卡保留、过期未售卡剔除、未拥有候选保留");
	assertEqual(JSON.stringify(stored.curioOffers[0]), JSON.stringify({ id: "energy_core", price: 10, sold: true }), "已购卡连 sold 标记一起保留");
	assertEqual(JSON.stringify(stored.curioOffers[1]), JSON.stringify({ id: "lucky_stone", price: 10 }), "候选只留 id 与定死的价格");
	// 重新读档幂等：清洗后的存档再读一遍不变
	assertEqual(JSON.stringify(state.normalizeRun(stored).curioOffers), JSON.stringify(stored.curioOffers), "清洗幂等");
	return "撤下 + 剔除 + 幂等";
});

check("奇物机制技：四种战斗内效果都由 rogue_curio 承载", () => {
	const info = skillsData.helpers.rogue_curio;
	assert(info, "rogue_curio 应注册");
	const skillEvent = (timing, base) => ({ triggername: timing, _trigger: base });
	const makePlayer = storage => ({
		storage: { rogue_curio: storage },
		hp: 4,
		maxHp: 4,
		isAlive: () => true,
		recoverTo: async value => {
			makePlayer.recoveredTo = value;
		},
		recover: async value => {
			makePlayer.healed = (makePlayer.healed ?? 0) + value;
		},
	});
	// 游戏开始时：额外出牌阶段插进 phaseList，只插一次（game 是 data/skills.js 从桩里 import 的同一对象）
	mockGame.phaseNumber = 1;
	const watcher = makePlayer({ extraPhase: 1 });
	assert(info.filter({ name: "phase" }, watcher, "phaseBegin"), "首个回合应通过 filter");
	const phaseEvent = { phaseList: ["phaseZhunbei", "phaseJudge", "phaseDraw", "phaseUse", "phaseDiscard", "phaseJieshu"], num: 0 };
	info.content(skillEvent("phaseBegin", { name: "phase" }), phaseEvent, watcher);
	assertEqual(phaseEvent.phaseList[0], "phaseUse|rogue_curio", "额外出牌阶段插在最前");
	assertEqual(phaseEvent.phaseList.length, 7, "阶段列表 +1");
	assertEqual(watcher.storage.rogue_curio_watch, true, "记录已触发");
	assert(!info.filter({ name: "phase" }, watcher, "phaseBegin"), "同一局不重复触发");
	mockGame.phaseNumber = 5;
	const later = makePlayer({ extraPhase: 1 });
	assert(!info.filter({ name: "phase" }, later, "phaseBegin"), "游戏开始后不再触发");
	mockGame.phaseNumber = 1;
	// 摸牌 +1
	const drawer = makePlayer({ extraDraw: 1 });
	assert(info.filter({ name: "phaseDraw", num: 2 }, drawer, "phaseDrawBegin2"), "摸牌加成 filter");
	info.content(skillEvent("phaseDrawBegin2", { name: "phaseDraw", num: 2 }), { num: 2 }, drawer);
	assert(!info.filter({ name: "phaseDraw", num: 2, numFixed: true }, drawer, "phaseDrawBegin2"), "numFixed 不触发");
	// 濒死：首次回复至 1，之后不再触发（content 的副作用在同步段完成，无需 await）
	const belter = makePlayer({ dyingSave: 1 });
	belter.hp = 0;
	assert(info.filter({ name: "dying" }, belter, "dying"), "濒死应触发");
	info.content(skillEvent("dying", { name: "dying" }), { name: "dying" }, belter);
	assertEqual(makePlayer.recoveredTo, 1, "回复体力值至 1");
	assertEqual(belter.storage.rogue_curio_belt, true, "记录已用过");
	assert(!info.filter({ name: "dying" }, belter, "dying"), "每局只救一次");
	// 史诗档回「体力上限的一半」：取整方向是**向上**（Math.ceil），界面文案就按这个写。
	// 上限特意给奇数——偶数上下取整同值，钉不住方向
	const belter2 = makePlayer({ dyingSave: 1, dyingRecoverToRatio: 0.5 });
	belter2.maxHp = 5;
	belter2.hp = 0;
	info.content(skillEvent("dying", { name: "dying" }), { name: "dying" }, belter2);
	assertEqual(makePlayer.recoveredTo, 3, "上限 5 → 回复至 3（向上取整）");
	// 每轮结束回 1 血
	const rice = makePlayer({ roundHeal: 1 });
	rice.hp = 2;
	assert(info.filter({ name: "phase" }, rice, "roundEnd"), "轮结束 filter");
	info.content(skillEvent("roundEnd", { name: "phase" }), { name: "phase" }, rice);
	assertEqual(makePlayer.healed, 1, "回复一点体力");
	rice.hp = 4;
	assert(!info.filter({ name: "phase" }, rice, "roundEnd"), "满血不触发");
	const dead = makePlayer({ roundHeal: 1 });
	dead.hp = 0;
	dead.isAlive = () => false;
	assert(!info.filter({ name: "phase" }, dead, "roundEnd"), "已阵亡不触发");
	// 标记说明列出全部效果
	const html = info.intro.mark(null, { extraPhase: 1, extraDraw: 1, dyingSave: 1, roundHeal: 1 }, null);
	for (const token of ["额外的出牌阶段", "额外摸 1 张牌", "濒死", "每轮结束时回复 1 点"]) {
		assert(html.includes(token), `标记说明应包含「${token}」：${html}`);
	}
	return "phaseList 插入 + 摸牌 + 濒死救回 + 轮回复";
});

// ---------------------------------------------------------------- 深渊化强化（无尽模式）

// 词缀要靠 get.itemtype 区分「实体牌」与「虚拟/转化牌」（本体的判据：Card 实例 → "card"）。
// 桩里原本没有这个函数，整段深渊用例共用这一份最小实现。
mockGet.itemtype = obj => {
	if (!obj || typeof obj !== "object") {
		return null;
	}
	if (obj.__realCard) {
		return "card";
	}
	return obj.name ? "vcard" : null;
};

/** 造一个能沿父链上溯的假事件：本体的 getParent 支持「层数 / 名字 / 判定函数」三种用法，这里逐一对齐 */
function makeEvent(name, fields, ancestors) {
	const evt = { name, ...(fields ?? {}) };
	evt.getParent = (level = 1, forced, includeSelf) => {
		const chain = [evt, ...(ancestors ?? [])];
		const miss = forced ? undefined : {};
		if (typeof level === "function") {
			for (let i = 1; i < chain.length; i++) {
				if (level(chain[i])) {
					return chain[i];
				}
			}
			return miss;
		}
		if (typeof level === "number") {
			return chain[level] ?? miss;
		}
		for (let i = includeSelf ? 0 : 1; i < chain.length; i++) {
			if (chain[i].name === level) {
				return chain[i];
			}
		}
		return miss;
	};
	return evt;
}

/** 深渊词缀的假角色：把十个 content 会碰的 Player API 全记下来，断言看的就是这些记录 */
function makeAbyssPlayer(options) {
	const rec = { discard: [], gain: [], recoverTo: [], damage: [], insertPhase: [], addSkill: [], tempSkill: [], blocker: [] };
	const player = {
		storage: {},
		hp: options.hp ?? 4,
		maxHp: options.maxHp ?? 4,
		playerid: options.playerid ?? "abyss_holder",
		rogueSide: options.rogueSide ?? 1,
		isAlive: () => options.alive !== false,
		getCards: position => (position === "h" ? (options.hand ?? []).slice() : position === "j" ? (options.judge ?? []).slice() : []),
		getEquips: () => (options.equips ?? []).slice(),
		discard: async card => {
			rec.discard.push(card);
			if (Array.isArray(options.hand)) {
				const index = options.hand.indexOf(card);
				if (index >= 0) {
					options.hand.splice(index, 1);
				}
			}
		},
		gain: async card => {
			rec.gain.push(card);
			// 本体摸牌后牌真的会在手牌里，词缀的「锁哪张」判据吃的就是这个，桩不能只记不看
			(options.hand ??= []).push(card);
		},
		recoverTo: async value => {
			rec.recoverTo.push(value);
			player.hp = value;
		},
		// 本体 damage() 返回的是「还没跑」的事件对象，词缀会先往上面写标记再 await
		damage: (num, source) => {
			const evt = { num, source, forResult: async () => evt };
			rec.damage.push(evt);
			return evt;
		},
		addSkill: id => {
			rec.addSkill.push(id);
		},
		// 本体的 addTempSkill 是 this.addSkill(skill, ...)，桩也同步记一笔，方便断言「挂给了谁」
		addTempSkill: (id, expire) => {
			rec.tempSkill.push({ id, expire });
			rec.addSkill.push(id);
		},
		// 照本体的口径来：屏蔽器记在 storage.skill_blocker 数组里，remove 一次只删第一个，
		// 空了就把键删掉（player.js:2405-2421），否则「已经在按着就不叠层」那条判据测不出来
		addSkillBlocker: id => {
			(player.storage.skill_blocker ??= []).push(id);
			rec.blocker.push({ op: "add", id });
		},
		removeSkillBlocker: id => {
			const list = player.storage.skill_blocker;
			if (Array.isArray(list)) {
				const index = list.indexOf(id);
				if (index >= 0) {
					list.splice(index, 1);
				}
				if (!list.length) {
					delete player.storage.skill_blocker;
				}
			}
			rec.blocker.push({ op: "remove", id });
		},
		judge: () => ({ forResult: async () => ({ color: options.judgeColor ?? "black" }) }),
		addGaintag: (card, tag) => {
			if (card && typeof card.addGaintag === "function") {
				card.addGaintag(tag);
			}
		},
		insertPhase: skill => {
			const phase = { skill, _noTurnOver: false, phaseList: null };
			rec.insertPhase.push(phase);
			return phase;
		},
	};
	return { player, rec };
}

/** 本体契约：content 的第二个参数才是基事件 */
const abyssSkillEvent = (timing, base) => ({ triggername: timing, _trigger: base });
// gaintag 记在牌对象上：深渊·污染会往被锁的牌面挂标记，桩要能记下来才能断言
const realCard = name => ({
	name,
	__realCard: true,
	__type: name === "tao" ? "basic" : name === "sha" ? "basic" : "vcard",
	__gaintags: [],
	hasGaintag(tag) {
		return this.__gaintags.includes(tag);
	},
	addGaintag(tag) {
		this.__gaintags.push(tag);
	},
	removeGaintag(tag) {
		this.__gaintags = this.__gaintags.filter(item => item !== tag);
	},
});
const virtualCard = name => ({ name });

check("深渊词缀池配置：池子项数、id 唯一、与技能定义和翻译一一对应", () => {
	const ids = abyssConfig.AFFIX_POOL.map(item => item.id);
	// 项数是刻意钉住的：深渊·禁欲删除后是 9 个，再增删词缀时这里要跟着改（漏改就是提醒「池子被动过了」）
	assertEqual(ids.length, 9, "词缀数（深渊·禁欲已删除）");
	assertEqual(new Set(ids).size, 9, "id 不重复");
	for (const id of ids) {
		assert(abyssAffixes.affix[id], `${id} 应有技能本体`);
		assert(abyssAffixes.affixText[id]?.name, `${id} 应有名称`);
		assert(abyssAffixes.affixText[id]?.desc, `${id} 应有描述`);
		assert(abyssAffixes.translate[id] === abyssAffixes.affixText[id].name, `${id} 的翻译名与文案表同源`);
		assert(!!abyssAffixes.translate[`${id}_info`], `${id} 缺 id_info 双键描述`);
	}
	// 标记载体不进随机池，否则会被当成一个「强化」发到敌人身上
	assert(!ids.includes("abyss_affix"), "abyss_affix 不该在词缀池里");
	assert(!!abyssAffixes.abyssMarkSkill.abyss_affix?.mark, "abyss_affix 应是标记载体");
	// 词缀自带的三个载体：不可能被随机到，但必须在注册表里（本体的 get.is.blocked 与 checkMod 都按 id 现查）
	for (const id of ["abyss_xuwu_blocker", "abyss_xuwu_release", "abyss_wuran_lock"]) {
		assert(!ids.includes(id), `${id} 是载体，不该被随机到`);
		assert(!!abyssAffixes.abyssHelperSkills[id], `${id} 应有载体定义`);
		assert(!!abyssAffixes.translate[id] && !!abyssAffixes.translate[`${id}_info`], `${id} 缺翻译双键`);
	}
	assert(abyssAffixes.abyssHelperSkills.abyss_xuwu_blocker.skillBlocker("any_skill", {}) === true,
		"封印载体要把所有技能一律算作失效");
	assertEqual(abyssAffixes.abyssHelperSkills.abyss_xuwu_blocker.skillBlocker("abyss_wuran_lock", {}), false,
		"污染封牌载体是别人施加的状态载体，不该被虚无一起滤掉");
	assert(typeof abyssAffixes.abyssHelperSkills.abyss_xuwu_release.onremove === "function",
		"解除载体要靠 removeSkill 时的 onremove 放人");
	return `${ids.length} 个词缀 + 3 个载体，定义/文案/翻译三处对齐`;
});

check("深渊词缀数量：1~99 层按 stage%，100 层起 floor(stage/100) 再按余数%追加一个", () => {
	const always0 = () => 0;
	const alwaysAlmost1 = () => 0.999999;
	// 第 1 层起就参与随机：stage% 概率给 1 个
	assertEqual(abyss.rollAbyssAffixCount(1, always0), 1, "1 层 rng=0 命中 1%");
	assertEqual(abyss.rollAbyssAffixCount(1, alwaysAlmost1), 0, "1 层 99.99% 未过 1% 线");
	assertEqual(abyss.rollAbyssAffixCount(20, () => 0.19), 1, "20 层 19% 命中");
	assertEqual(abyss.rollAbyssAffixCount(20, () => 0.2), 0, "20 层 20% 边界不命中");
	// 1~99：rng 落在 stage% 之内才给 1 个
	assertEqual(abyss.rollAbyssAffixCount(31, () => 0.3), 1, "31 层 30% 命中");
	assertEqual(abyss.rollAbyssAffixCount(31, () => 0.31), 0, "31 层 31% 边界不命中（严格小于）");
	assertEqual(abyss.rollAbyssAffixCount(50, () => 0.49), 1, "50 层 49% 命中");
	assertEqual(abyss.rollAbyssAffixCount(50, () => 0.5), 0, "50 层 50% 边界不命中");
	assertEqual(abyss.rollAbyssAffixCount(99, () => 0.98), 1, "99 层 98% 命中");
	assertEqual(abyss.rollAbyssAffixCount(99, alwaysAlmost1), 0, "99 层 99.99% 已过 99% 线");
	// 100 层起：必定 floor(stage/100) 个，余数再掷一次
	assertEqual(abyss.rollAbyssAffixCount(100, alwaysAlmost1), 1, "100 层必定 1 个且没有额外");
	assertEqual(abyss.rollAbyssAffixCount(199, () => 0.5), 2, "199 层 1 个 + 99% 追加");
	assertEqual(abyss.rollAbyssAffixCount(199, alwaysAlmost1), 1, "199 层 99.9999% 未过余数线时只给必定值");
	assertEqual(abyss.rollAbyssAffixCount(200, alwaysAlmost1), 2, "200 层必定 2 个");
	assertEqual(abyss.rollAbyssAffixCount(234, () => 0.3), 3, "234 层 2 个 + 34% 拿到第 3 个");
	assertEqual(abyss.rollAbyssAffixCount(234, () => 0.4), 2, "234 层 40% 未过时保持 2 个");
	assertEqual(abyss.rollAbyssAffixCount(300, always0), 3, "300 层必定 3 个");
	return "31/50/99/100/199/200/234/300 全分支";
});

check("深渊词缀随机：不放回不重复、数量受池子约束、同一种子结果可复现", () => {
	const poolSize = abyssConfig.AFFIX_POOL.length;
	const list = abyss.rollAbyssAffixes(234, makeRng(7));
	assert(list.length > 0, "高层应有词缀");
	assertEqual(new Set(list).size, list.length, "同一敌人身上不重复同一个词缀");
	for (const id of list) {
		assert(abyss.isAbyssAffixId(id), `${id} 应在词缀池里`);
	}
	assertEqual(
		abyss.rollAbyssAffixes(234, makeRng(7)).join(","),
		list.join(","),
		"同一随机源应给出同一结果（存档不重掷的前提）",
	);
	// 层数再高也不可能超过池子大小
	const huge = abyss.rollAbyssAffixes(1000 + poolSize * 100, () => 0);
	assertEqual(huge.length, poolSize, `超高层最多拿满 ${poolSize} 个词缀`);
	assertEqual(new Set(huge).size, poolSize, "拿满时仍然互不重复");
	return `234 层 ${list.length} 个 / 超高层 ${huge.length} 个`;
});

check("深渊从第 1 层起作用于无尽：闯关阵容一个词缀都不带，无尽每个敌人各自掷", () => {
	assert(!abyss.isAbyssStage(999, cfg.RUN_MODE.challenge), "闯关模式再高层也不该深渊化");
	assert(abyss.isAbyssStage(1, cfg.RUN_MODE.endless), "无尽第 1 层就应开始深渊化");
	assert(abyss.isAbyssStage(abyssConfig.ABYSS_START_LEVEL, cfg.RUN_MODE.endless), "无尽起始层应开始深渊化");
	// 把角色塞进桩里的 lib.character，两个敌方池才真的有东西可挑（空池会让断言假绿）
	const extensionIds = [...enemy.getExtensionCharacterIds()];
	assert(extensionIds.length > 0, "扩展角色池不应为空");
	for (const id of extensionIds) {
		lib.character[id] ??= { hp: 4, maxHp: 4, skills: [] };
	}
	lib.character["本体测试将"] ??= { hp: 4, maxHp: 4, skills: [] };

	for (const level of [31, 120, 500]) {
		const enemies = enemy.createEnemyConfigs(level, cfg.RUN_MODE.challenge, () => 0);
		assert(enemies.length > 0, `闯关 ${level} 层应能组出阵容`);
		for (const entry of enemies) {
			assertEqual(entry.abyss.length, 0, `闯关 ${level} 层不该有词缀`);
		}
	}
	// rng 恒为 0：1~99 层必中，100 层起的余数也必中，所以每个敌人都该拿满必定值 + 1
	const late = enemy.createEnemyConfigs(234, cfg.RUN_MODE.endless, () => 0);
	assert(late.length > 0, "无尽高层应能组出阵容");
	for (const entry of late) {
		assertEqual(entry.abyss.length, 3, "234 层每个敌人必定 2 个 + 命中余数 1 个");
		assertEqual(new Set(entry.abyss).size, 3, "同一敌人身上词缀不重复");
		for (const id of entry.abyss) {
			assert(abyss.isAbyssAffixId(id), `${id} 应在词缀池里`);
		}
	}
	// 第 1 层也参与随机：rng 恒为 0 时 1% 概率必中，首个敌人应带 1 个词缀
	const firstLevel = enemy.createEnemyConfigs(1, cfg.RUN_MODE.endless, () => 0);
	assert(firstLevel.length > 0, "无尽第 1 层应能组出阵容");
	for (const entry of firstLevel) {
		assertEqual(entry.abyss.length, 1, "第 1 层（rng=0 必中 1%）每个敌人 1 个词缀");
	}
	return `闯关 3 档全空 / 无尽 234 层每人 ${late[0].abyss.length} 个 / 第 1 层每人 ${firstLevel[0].abyss.length} 个`;
});

check("深渊存档往返：脏词缀被清洗、下架的被剔除、重载原样读回而不重掷", () => {
	const ids = abyssConfig.AFFIX_POOL.map(item => item.id);
	const run = state.normalizeRun({
		...freshRun(cfg.RUN_MODE.endless),
		level: 45,
		currentBattle: {
			status: "battle",
			enemies: [{
				characterId: "佐菲",
				stats: { defense: 1, draw: 1, attack: 1 },
				// 顺序故意打乱、塞重复、塞不存在与空串：读档应清成「池子顺序、去重、只留合法项」
				abyss: [ids[3], ids[1], ids[3], "abyss_not_exists", "", null, ids[0]],
				skills: [],
				maxHp: 0,
				hp: 0,
			}],
		},
	});
	const saved = run.currentBattle.enemies[0].abyss;
	assertEqual(saved.join(","), [ids[0], ids[1], ids[3]].join(","), "清洗后按池子顺序去重");
	const again = state.normalizeRun({ ...run });
	assertEqual(again.currentBattle.enemies[0].abyss.join(","), saved.join(","), "重载不重掷、结果稳定");
	// 旧档（v4 及更早）根本没有这个字段：按「本关没有词缀」补齐，不能凭空随机出几个来
	const legacy = state.normalizeRun({ ...freshRun(cfg.RUN_MODE.endless), level: 250, currentBattle: null });
	assertEqual(legacy.currentBattle, null, "没有进行中战斗时不造词缀");
	const legacyEnemy = state.normalizeRun({
		...freshRun(cfg.RUN_MODE.endless),
		currentBattle: { status: "battle", enemies: [{ characterId: "佐菲", stats: {}, skills: [] }] },
	});
	assertEqual(legacyEnemy.currentBattle.enemies[0].abyss.length, 0, "缺 abyss 字段的旧档补齐为空");
	return `清洗 ${saved.length} 项 / 旧档补空`;
});

await checkAsync("深渊·不屈：本局前「体力上限」次濒死都回满体力，不再防止伤害", async () => {
	const info = abyssAffixes.affix.abyss_buqu;
	const turn = makeEvent("phase");
	const { player, rec } = makeAbyssPlayer({ hp: 1, maxHp: 3 });
	assertEqual(info.trigger.player, "dying", "只剩濒死一个时机（护盾那半段已删）");
	// 上限 3：前三次濒死每次都回满，用掉的次数累加在 storage 的标量上
	for (const used of [1, 2, 3]) {
		assert(info.filter(makeEvent("dying", {}, [turn]), player, "dying"), `第 ${used} 次濒死应触发`);
		await info.content(abyssSkillEvent("dying", makeEvent("dying", {}, [turn])), makeEvent("dying", {}, [turn]), player);
		assertEqual(player.storage.abyss_buqu_used, used, "次数累加而不是覆盖");
		assertEqual(rec.recoverTo.length, used, "每次濒死都回一次满");
		assertEqual(rec.recoverTo[used - 1], player.maxHp, "回复至体力上限（不是固定值）");
	}
	// 第四次：X 次用完，filter 直接判不过（本体只对过了 filter 的触发技跑 content，所以这里不再回血）
	assert(!info.filter(makeEvent("dying", {}, [turn]), player, "dying"), "用完体力上限那么多次后不再触发");
	assertEqual(rec.recoverTo.length, 3, "用完之后没有第二次回复");
	// 额度是濒死那一刻现读 maxHp 的：上限被别的途径抬上去，可用次数跟着涨
	player.maxHp = 4;
	assert(info.filter(makeEvent("dying", {}, [turn]), player, "dying"), "体力上限涨了，次数上限跟着涨");
	await info.content(abyssSkillEvent("dying", makeEvent("dying", {}, [turn])), makeEvent("dying", {}, [turn]), player);
	assertEqual(rec.recoverTo.length, 4, "涨出来的那一次照样回满");
	assert(!info.filter(makeEvent("dying", {}, [turn]), player, "dying"), "回满后仍然只到新的上限为止");
	// 伤害不再被防止：这个技能压根没有 damageBegin4 这条分支
	assert(!info.filter(makeEvent("damage", { num: 2 }, [turn]), player, "damageBegin4"), "本回合防止伤害那半段已删除");
	return "上限 3 → 三次回满、第四次静默；maxHp 涨了额度跟着涨";
});

await checkAsync("深渊·坚壁与猎杀：减免额＝伤害一半向上取整且至少 2 点、造成伤害×2，固定伤害都不参与", async () => {
	const wall = abyssAffixes.affix.abyss_jianbi;
	const holder = makeAbyssPlayer({}).player;
	assert(wall.filter({ numFixed: false, num: 3 }, holder, "damageBegin4"), "非固定伤害应触发");
	assert(!wall.filter({ numFixed: true, num: 3 }, holder, "damageBegin4"), "固定伤害不触发");
	assert(!wall.filter({ numFixed: false, num: 0 }, holder, "damageBegin4"), "0 点伤害不触发");
	// 向上取整取在「减免额」上：5 点减免 ceil(2.5)=3、实受 2；减免下界 2 让 1、2 点砍到 0
	for (const [before, after] of [[1, 0], [2, 0], [3, 1], [4, 2], [5, 2], [6, 3], [7, 3], [8, 4]]) {
		const trigger = { num: before };
		await wall.content(abyssSkillEvent("damageBegin4", trigger), trigger, holder);
		assertEqual(trigger.num, after, `受到伤害 ${before} → ${after}`);
	}

	const hunter = abyssAffixes.affix.abyss_liesha;
	assertEqual(hunter.mod.attackRange(makeAbyssPlayer({}).player, 1), Infinity, "攻击范围无限");
	assert(hunter.filter({ numFixed: false }, holder, "damageBegin1"), "造成伤害时应加伤");
	assert(!hunter.filter({ numFixed: true }, holder, "damageBegin1"), "固定伤害不加倍");
	for (const [before, after] of [[1, 2], [3, 6]]) {
		const trigger = { num: before };
		await hunter.content(abyssSkillEvent("damageBegin1", trigger), trigger, holder);
		assertEqual(trigger.num, after, `造成 ${before} → ${after}（翻倍吃原始值）`);
	}
	return "坚壁减半带减免下界 2 / 猎杀无限距离翻倍";
});

await checkAsync("深渊·狂热：黑色判定给一个完整额外回合，红色不给，且一轮只判一次", async () => {
	const info = abyssAffixes.affix.abyss_kuangre;
	mockGame.roundNumber = 3;
	const black = makeAbyssPlayer({ judgeColor: "black" });
	assert(info.filter(makeEvent("roundStart"), black.player, "roundStart"), "新一轮应触发");
	await info.content(abyssSkillEvent("roundStart", makeEvent("roundStart")), makeEvent("roundStart"), black.player);
	assertEqual(black.rec.insertPhase.length, 1, "黑色判定给一个额外回合");
	const phase = black.rec.insertPhase[0];
	assertEqual(phase._noTurnOver, true, "额外回合不被翻面跳过");
	assertEqual(phase.phaseList.length, 6, "是完整回合（六个阶段），不是只加一个出牌阶段");
	assertEqual(phase.phaseList[0], "phaseZhunbei", "回合从准备阶段开始");
	assert(!info.filter(makeEvent("roundStart"), black.player, "roundStart"), "同一轮不重复判定（防无限连锁）");
	mockGame.roundNumber = 4;
	assert(info.filter(makeEvent("roundStart"), black.player, "roundStart"), "换轮后可以再判");
	const red = makeAbyssPlayer({ judgeColor: "red" });
	await info.content(abyssSkillEvent("roundStart", makeEvent("roundStart")), makeEvent("roundStart"), red.player);
	assertEqual(red.rec.insertPhase.length, 0, "红色判定不给回合");
	assertEqual(red.player.storage.abyss_kuangre_round, 4, "红色也吃掉本轮那次判定");
	mockGame.roundNumber = 1;
	return "黑色→完整额外回合 / 红色无 / 每轮一次";
});

await checkAsync("深渊·虚无：玩家的非实体牌伤害把其全部技能封到本回合结束，封着期间不叠层", async () => {
	const info = abyssAffixes.affix.abyss_xuwu;
	const release = abyssAffixes.abyssHelperSkills.abyss_xuwu_release;
	const caster = makeAbyssPlayer({ playerid: "caster", rogueSide: 0 });
	const holder = makeAbyssPlayer({ playerid: "holder" });
	const turn = makeEvent("phase");
	const first = makeEvent("damage", { num: 1, source: caster.player }, [turn]);
	assert(info.filter(first, holder.player, "damageEnd"), "玩家的非实体牌伤害应触发");
	await info.content(abyssSkillEvent("damageEnd", first), first, holder.player);
	assertEqual(caster.rec.blocker.length, 1, "给来源按上一层封印");
	assertEqual(caster.rec.blocker[0].id, "abyss_xuwu_blocker", "封印走本体的技能屏蔽载体，不是逐个 disableSkill");
	assertEqual(caster.rec.tempSkill.length, 1, "解除靠挂在被封印玩家身上的临时技");
	assertEqual(caster.rec.tempSkill[0].id, "abyss_xuwu_release", "临时技用的是解除载体");
	// 本体的到期口径：role 为 global 时不看是谁的回合，下一个 phaseEnd 就解除＝「本回合内」
	assertEqual(caster.rec.tempSkill[0].expire.global, "phaseEnd", "到期时机是回合结束");

	// 不再限制「本局一次」，但已经在按着就不叠第二层（本体解除一次只删一个）
	const second = makeEvent("damage", { num: 2, source: caster.player }, [turn]);
	assert(info.filter(second, holder.player, "damageEnd"), "同一回合第二次挨打照样触发");
	await info.content(abyssSkillEvent("damageEnd", second), second, holder.player);
	assertEqual(caster.rec.blocker.length, 1, "已经封着就不再叠层");
	assertEqual(caster.rec.tempSkill.length, 1, "也不重复挂解除宿主");

	// 判据只卡「玩家方」与「非实体牌」
	const enemyHit = makeAbyssPlayer({ playerid: "enemy_hit", rogueSide: 1 });
	assert(!info.filter(makeEvent("damage", { num: 1, card: realCard("sha"), source: caster.player }, [turn]), holder.player, "damageEnd"),
		"有实体牌参与的伤害不封");
	assert(info.filter(makeEvent("damage", { num: 1, card: virtualCard("sha"), source: caster.player }, [turn]), holder.player, "damageEnd"),
		"纯虚拟牌没有实体牌，照样封");
	assert(!info.filter(makeEvent("damage", { num: 1, source: enemyHit.player }, [turn]), holder.player, "damageEnd"), "非玩家方的伤害不封");
	assert(!info.filter(makeEvent("damage", { num: 0, source: caster.player }, [turn]), holder.player, "damageEnd"), "0 点伤害不封");

	// 解除走的是 removeSkill → onremove，宿主在被封印的人身上，所以持有者先死也照样解得开
	release.onremove(caster.player);
	assertEqual(caster.rec.blocker[1].op, "remove", "回合结束把封印放开");
	assertEqual(caster.player.storage.skill_blocker, undefined, "解除后不留空数组");
	// 放开后同名玩家再打一发还能重新封住（本局不限次数）
	const third = makeEvent("damage", { num: 1, source: caster.player }, [makeEvent("phase")]);
	await info.content(abyssSkillEvent("damageEnd", third), third, holder.player);
	assertEqual(caster.rec.blocker.length, 3, "重新按了一层");
	assertEqual(caster.rec.tempSkill.length, 2, "重新挂了解除宿主");
	return "封全部技能到回合结束 / 不叠层 / 解除挂被封印者身上";
});

await checkAsync("深渊·镜像：任何伤害都按等量反弹给来源，反弹出去的那发不再被反弹", async () => {
	const info = abyssAffixes.affix.abyss_jingxiang;
	const holder = makeAbyssPlayer({ playerid: "holder" });
	const attacker = makeAbyssPlayer({ playerid: "attacker" });
	const hit = makeEvent("damage", { num: 3, card: realCard("sha"), source: attacker.player });
	assert(info.filter(hit, holder.player, "damageEnd"), "实体牌伤害应反弹");
	await info.content(abyssSkillEvent("damageEnd", hit), hit, holder.player);
	assertEqual(attacker.rec.damage.length, 1, "反弹一次");
	assertEqual(attacker.rec.damage[0].num, 3, "反弹等量（不再是固定 1 点）");
	assertEqual(attacker.rec.damage[0].source, holder.player, "反弹的伤害记在持有者名下");
	assertEqual(attacker.rec.damage[0].abyssMirror, true, "反弹事件要带上「已被反弹」的标记");

	const skillHit = makeEvent("damage", { num: 2, source: attacker.player });
	assert(info.filter(skillHit, holder.player, "damageEnd"), "没有牌的技能伤害现在也反弹");
	await info.content(abyssSkillEvent("damageEnd", skillHit), skillHit, holder.player);
	assertEqual(attacker.rec.damage[1].num, 2, "第二发照样按等量");
	// 另一名镜像持有者接手这发时靠标记停住，否则两个镜像会互相反弹到永远
	const reflected = { ...attacker.rec.damage[1], source: holder.player };
	assert(!info.filter(reflected, attacker.player, "damageEnd"), "反弹出去的伤害不再被反弹");
	assert(!info.filter(makeEvent("damage", { num: 0, source: attacker.player }), holder.player, "damageEnd"), "被减到 0 的伤害不反弹");
	assert(!info.filter(makeEvent("damage", { num: 1, source: holder.player }), holder.player, "damageEnd"), "来源是自己时不反弹");
	const dead = makeAbyssPlayer({ playerid: "dead_attacker", alive: false });
	assert(!info.filter(makeEvent("damage", { num: 1, source: dead.player }), holder.player, "damageEnd"), "来源已阵亡不反弹");
	return "等量反弹（含技能伤害）/ 标记挡住互相反弹";
});

await checkAsync("深渊·污染：玩家对持有者用牌后随机锁一张手牌，换进来的那张不能用不能打也不能弃", async () => {
	const info = abyssAffixes.affix.abyss_wuran;
	const lock = abyssAffixes.abyssHelperSkills.abyss_wuran_lock;
	const holder = makeAbyssPlayer({ playerid: "holder" });
	const played = realCard("sha");
	const spare = realCard("install");
	const hand = [played, spare];
	const victim = makeAbyssPlayer({ rogueSide: 0, hand });
	// 「对你使用牌」：这张牌的目标里得有词缀持有者自己
	const used = makeEvent("useCard", { player: victim.player, card: played, targets: [holder.player] });
	assert(info.filter(used, holder.player, "useCardAfter"), "玩家用牌且手牌里有可锁的牌时应触发");
	await info.content(abyssSkillEvent("useCardAfter", used), used, holder.player);
	assertEqual(victim.rec.discard.length, 0, "污染只锁牌不弃牌");
	// 刚使用的那张牌不算候选：手牌里可锁的只剩 spare，锁的必是它
	assert(victim.player.abyssWuranLocked.includes(spare), "随机锁掉一张手牌");
	assert(!victim.player.abyssWuranLocked.includes(played), "刚使用的那张牌不算候选");
	assert(spare.hasGaintag("abyss_wuran"), "被污染的牌面上有污染标记");
	assertEqual(victim.rec.addSkill[0], "abyss_wuran_lock", "封牌载体挂在玩家自己身上（checkMod 只读执行者）");

	assertEqual(lock.mod.cardEnabled2(spare, victim.player, null, "unchanged"), false, "被污染的牌不能用");
	assertEqual(lock.mod.cardRespondable(spare, victim.player, "unchanged"), false, "被污染的牌不能打出");
	assertEqual(lock.mod.cardDiscardable(spare, victim.player, "phaseDiscard", "unchanged"), false, "被污染的牌不能自己弃置");
	assertEqual(lock.mod.cardEnabled2(played, victim.player, null, "unchanged"), "unchanged", "别的牌照常能用");
	assertEqual(lock.mod.cardDiscardable(played, victim.player, "phaseDiscard", "unchanged"), "unchanged", "别的牌照常能弃");

	// 剩下的手牌全是刚用的牌或已被锁的牌：不再空转
	assert(!info.filter(used, holder.player, "useCardAfter"), "没有可锁的手牌时不该空转");
	const enemyUser = makeAbyssPlayer({ playerid: "enemy_user", rogueSide: 1 });
	assert(!info.filter(makeEvent("useCard", { player: enemyUser.player, targets: [holder.player] }), holder.player, "useCardAfter"), "敌人用牌不受污染");
	assert(!info.filter(makeEvent("useCard", { player: victim.player, card: played, targets: ["别人"] }), holder.player, "useCardAfter"), "目标不含持有者时不触发");
	return "锁一张手牌（已用的牌除外）/ 使用·打出·弃置三处锁死 / 无牌可锁不触发";
});

// 本体屏蔽链的最小镜像：get.is.blocked（get/is.js:286）→ game.filterSkills（game/index.js:9615）
// → player.getSkills（player.js:5454，默认 applySkillFilter）→ getModableSkills（player.js:5432）
// → game.checkMod（game/index.js:8486）。虚无 × 污染的回归必须走这条链：直接调
// abyss_wuran_lock.mod.cardEnabled2 会绕过「技能被 filterSkills 滤掉」这一步，恰好漏掉本 Bug。
const nativeSkillChain = {
	blocked(skill, player) {
		const blockers = player?.storage?.skill_blocker;
		if (!Array.isArray(blockers) || !blockers.length) {
			return false;
		}
		for (const id of blockers) {
			if (lib.skill[id]?.skillBlocker?.(skill, player)) {
				return true;
			}
		}
		return false;
	},
	filterSkills(skills, player, exclude) {
		const out = skills.filter(id => !(id in (player.disabledSkills ?? {})));
		if (!Array.isArray(player?.storage?.skill_blocker) || !player.storage.skill_blocker.length) {
			return out;
		}
		return out.filter(id => exclude?.includes(id) || !nativeSkillChain.blocked(id, player));
	},
};
mockGet.is = { blocked: nativeSkillChain.blocked };
mockGame.filterSkills = nativeSkillChain.filterSkills;
mockGame.checkMod = function () {
	const args = Array.from(arguments);
	const name = args[args.length - 2];
	let skills = args[args.length - 1];
	if (typeof skills.getModableSkills === "function") {
		skills = skills.getModableSkills();
	}
	const argv = args.slice(0, -2);
	for (const id of skills) {
		const mod = lib.skill[id]?.mod?.[name];
		if (typeof mod !== "function") {
			continue;
		}
		const result = mod.call(this, ...argv);
		if (result !== undefined && typeof argv[argv.length - 1] !== "object") {
			argv[argv.length - 1] = result;
		}
	}
	return argv[argv.length - 1];
};

/** makeAbyssPlayer 的技能表版本：补上本体 getSkills / getModableSkills / removeSkill 的语义 */
function makeEngineAbyssPlayer(options = {}) {
	const { player, rec } = makeAbyssPlayer(options);
	player.skills = (options.skills ?? []).slice();
	player.tempSkills = {};
	player.disabledSkills = {};
	player.getSkills = function (skillMode, includeEquipSkills, applySkillFilter) {
		const list = player.skills.slice();
		for (const id of Object.keys(player.tempSkills)) {
			if (!list.includes(id)) {
				list.push(id);
			}
		}
		if (applySkillFilter === false) {
			return list;
		}
		return nativeSkillChain.filterSkills(list, player, []);
	};
	player.getModableSkills = function () {
		const list = player.getSkills().concat(Array.isArray(lib.skill.global) ? lib.skill.global : []);
		mockGame.expandSkills(list);
		return list.filter(id => lib.skill[id]?.mod);
	};
	player.hasSkill = id => player.getSkills(null, false, false).includes(id);
	// 对齐本体 addSkill：已在技能表里就直接返回（污染重复触发不会重复注册）
	player.addSkill = id => {
		rec.addSkill.push(id);
		if (lib.skill[id] && !player.skills.includes(id)) {
			player.skills.push(id);
		}
	};
	player.addTempSkill = (id, expire) => {
		rec.tempSkill.push({ id, expire });
		rec.addSkill.push(id);
		if (lib.skill[id]) {
			if (!player.skills.includes(id)) {
				player.skills.push(id);
			}
			player.tempSkills[id] = expire ?? true;
		}
	};
	// 只实现本用例用到的收尾：先摘技能表，再到点走 onremove（虚无的解除宿主就挂在这里）
	player.removeSkill = (id, force) => {
		const info = lib.skill[id];
		if (info?.fixed && force !== true) {
			return id;
		}
		player.skills = player.skills.filter(item => item !== id);
		delete player.tempSkills[id];
		if (typeof info?.onremove === "function") {
			info.onremove(player, id);
		}
		return id;
	};
	return { player, rec };
}

await checkAsync("深渊·虚无 × 污染：虚无屏蔽期间，污染封牌经本体 getModableSkills/checkMod 链仍然生效", async () => {
	const xuwu = abyssAffixes.affix.abyss_xuwu;
	const wuran = abyssAffixes.affix.abyss_wuran;
	const savedSkills = new Map();
	const register = {
		...abyssAffixes.abyssHelperSkills,
		abyss_wuran: wuran,
		abyss_xuwu: xuwu,
		test_normal_mod: { mod: { attackRange: () => 9 } },
		test_normal_trigger: { trigger: { player: "phaseDraw" }, forced: true, async content() {} },
		// 虚无不许被「整类豁免」削弱：持恒技、锁定技照旧封住
		test_normal_persevere: { persevereSkill: true, mod: { attackRange: () => 7 } },
		test_normal_locked: { locked: true, forced: true, trigger: { player: "phaseDraw" }, async content() {} },
	};
	for (const [id, info] of Object.entries(register)) {
		savedSkills.set(id, lib.skill[id]);
		lib.skill[id] = info;
	}
	const played = realCard("sha");
	const spare = realCard("install");
	const hand = [played, spare];
	const victim = makeEngineAbyssPlayer({
		playerid: "wuran_victim",
		rogueSide: 0,
		hand,
		skills: ["test_normal_mod", "test_normal_trigger", "test_normal_persevere", "test_normal_locked"],
	});
	const holder = makeEngineAbyssPlayer({ playerid: "wuran_holder", skills: ["abyss_wuran", "abyss_xuwu"] });
	const holder2 = makeEngineAbyssPlayer({ playerid: "wuran_holder2", skills: ["abyss_wuran"] });
	const other = makeEngineAbyssPlayer({ playerid: "other_actor" });
	mockGame.players = [victim.player, holder.player, holder2.player, other.player];
	const canUse = card => mockGame.checkMod(card, victim.player, null, "unchanged", "cardEnabled2", victim.player);
	const canRespond = card => mockGame.checkMod(card, victim.player, "unchanged", "cardRespondable", victim.player);
	const canDiscard = card => mockGame.checkMod(card, victim.player, "phaseDiscard", "unchanged", "cardDiscardable", victim.player);
	try {
		// ① 只有污染：三处限制都要经过本体 checkMod 链生效
		const used = makeEvent("useCard", { player: victim.player, card: played, targets: [holder.player] });
		await wuran.content(abyssSkillEvent("useCardAfter", used), used, holder.player);
		assert(victim.player.abyssWuranLocked.includes(spare), "污染锁住 spare");
		assert(spare.hasGaintag("abyss_wuran"), "牌面有污染标签");
		assert(victim.player.getModableSkills().includes("abyss_wuran_lock"), "封牌载体进入了本体的可 mod 技能表");
		assertEqual(canUse(spare), false, "只有污染：本体链判定不能使用");
		assertEqual(canRespond(spare), false, "只有污染：本体链判定不能打出");
		assertEqual(canDiscard(spare), false, "只有污染：本体链判定不能自己弃置");
		assertEqual(canUse(played), "unchanged", "没被污染的手牌照常可用");
		assertEqual(mockGame.checkMod(spare, other.player, "phaseDiscard", "unchanged", "cardDiscardable", other.player), "unchanged",
			"别的角色拆牌读的是执行者自己的技能，不受持牌者载体影响");

		// ② 虚无触发：玩家的非实体牌伤害按住其所有技能
		const hit = makeEvent("damage", { num: 1, card: virtualCard("sha"), source: victim.player });
		assert(xuwu.filter(hit, holder.player, "damageEnd"), "虚无应对玩家的非实体牌伤害触发");
		await xuwu.content(abyssSkillEvent("damageEnd", hit), hit, holder.player);
		assertEqual(victim.player.storage.skill_blocker?.[0], "abyss_xuwu_blocker", "虚无按上屏蔽器");
		assert(nativeSkillChain.blocked("test_normal_mod", victim.player), "虚无期间普通 mod 技失效");
		assert(nativeSkillChain.blocked("test_normal_trigger", victim.player), "虚无期间普通触发技失效");
		assert(nativeSkillChain.blocked("test_normal_persevere", victim.player), "持恒技照旧被封，虚无没有被整类豁免削弱");
		assert(nativeSkillChain.blocked("test_normal_locked", victim.player), "锁定技照旧被封，虚无没有被整类豁免削弱");
		assert(!nativeSkillChain.blocked("abyss_wuran_lock", victim.player), "污染载体不吃虚无屏蔽（精确豁免）");
		assert(victim.player.getModableSkills().includes("abyss_wuran_lock"), "虚无期间载体仍在可 mod 技能表里");
		assert(!victim.player.getModableSkills().includes("test_normal_mod"), "虚无期间普通 mod 技被滤出判定链");
		assertEqual(canUse(spare), false, "虚无期间：污染牌仍不能使用");
		assertEqual(canRespond(spare), false, "虚无期间：污染牌仍不能打出");
		assertEqual(canDiscard(spare), false, "虚无期间：污染牌仍不能自己弃置");

		// ③ 虚无期间再次污染：新牌立刻受限，旧牌不受影响，载体不重复注册
		hand.splice(hand.indexOf(played), 1); // 用掉的牌离开手牌
		const played2 = realCard("sha");
		const fresh = realCard("tao");
		hand.push(played2, fresh);
		const used2 = makeEvent("useCard", { player: victim.player, card: played2, targets: [holder.player] });
		await wuran.content(abyssSkillEvent("useCardAfter", used2), used2, holder.player);
		assert(victim.player.abyssWuranLocked.includes(fresh), "虚无期间新污染照常落点");
		assert(fresh.hasGaintag("abyss_wuran"), "新污染牌面也有标签");
		for (const card of [spare, fresh]) {
			assertEqual(canUse(card), false, "虚无期间新旧污染牌都不能使用");
			assertEqual(canRespond(card), false, "虚无期间新旧污染牌都不能打出");
			assertEqual(canDiscard(card), false, "虚无期间新旧污染牌都不能自己弃置");
		}
		assertEqual(victim.player.skills.filter(id => id === "abyss_wuran_lock").length, 1, "载体不重复注册");

		// ④ 第二名污染持有者追加污染：引用累加不覆盖，载体仍只有一份
		hand.splice(hand.indexOf(played2), 1);
		const played3 = realCard("sha");
		const fresh2 = realCard("tao");
		hand.push(played3, fresh2);
		const used3 = makeEvent("useCard", { player: victim.player, card: played3, targets: [holder2.player] });
		await wuran.content(abyssSkillEvent("useCardAfter", used3), used3, holder2.player);
		assert(victim.player.abyssWuranLocked.includes(fresh2), "第二名持有者也能追加污染");
		assertEqual(victim.player.abyssWuranLocked.length, 3, "多条污染引用累加而不是互相覆盖");
		assertEqual(victim.player.skills.filter(id => id === "abyss_wuran_lock").length, 1, "多持有者不重复注册载体");

		// ⑤ 重复虚无：不叠屏蔽层、不重复挂解除宿主
		const hit2 = makeEvent("damage", { num: 2, source: victim.player });
		await xuwu.content(abyssSkillEvent("damageEnd", hit2), hit2, holder.player);
		assertEqual(victim.player.storage.skill_blocker.length, 1, "重复虚无只保留一层屏蔽器");
		assertEqual(victim.rec.tempSkill.length, 1, "重复虚无不重复挂解除宿主");

		// ⑥ 虚无期间第一次污染（此前没有载体）：addSkill 后要立刻走判定链
		const latePlayed = realCard("sha");
		const lateLocked = realCard("install");
		const lateHand = [latePlayed, lateLocked];
		const lateVictim = makeEngineAbyssPlayer({ playerid: "late_victim", rogueSide: 0, hand: lateHand, skills: ["test_normal_mod"] });
		mockGame.players.push(lateVictim.player);
		const lateHit = makeEvent("damage", { num: 1, source: lateVictim.player });
		await xuwu.content(abyssSkillEvent("damageEnd", lateHit), lateHit, holder.player);
		assert(nativeSkillChain.blocked("test_normal_mod", lateVictim.player), "先封住该玩家");
		const lateUsed = makeEvent("useCard", { player: lateVictim.player, card: latePlayed, targets: [holder.player] });
		await wuran.content(abyssSkillEvent("useCardAfter", lateUsed), lateUsed, holder.player);
		assertEqual(mockGame.checkMod(lateLocked, lateVictim.player, null, "unchanged", "cardEnabled2", lateVictim.player), false,
			"封技能期间新挂上的污染载体也立刻生效");

		// ⑦ 本回合结束：虚无解除，其他技能恢复，污染继续生效
		victim.player.removeSkill("abyss_xuwu_release", true); // 本体到点 removeSkill → onremove 放人
		assertEqual(victim.player.storage.skill_blocker, undefined, "虚无解除后屏蔽器清空");
		assert(!nativeSkillChain.blocked("test_normal_mod", victim.player), "普通技能恢复");
		assert(victim.player.getModableSkills().includes("test_normal_mod"), "普通 mod 技回到判定链");
		assert(victim.player.getModableSkills().includes("test_normal_persevere"), "持恒技在虚无结束后也恢复");
		assert(!nativeSkillChain.blocked("test_normal_locked", victim.player), "锁定技在虚无结束后也恢复");
		assertEqual(canUse(spare), false, "虚无结束后：旧污染牌仍不能使用");
		assertEqual(canRespond(spare), false, "虚无结束后：旧污染牌仍不能打出");
		assertEqual(canDiscard(spare), false, "虚无结束后：旧污染牌仍不能自己弃置");
		assert(victim.player.abyssWuranLocked.includes(spare) && victim.player.abyssWuranLocked.includes(fresh) && victim.player.abyssWuranLocked.includes(fresh2),
			"污染引用没有随虚无解除被清掉");
		const clean = realCard("jiu");
		hand.push(clean);
		assertEqual(canUse(clean), "unchanged", "没被污染的新摸牌照常可用");

		// ⑧ 多持有者只失去一个：清理机制不能替另一个持有者免掉污染
		holder.player.removeSkill("abyss_wuran"); // 故意留着 abyss_xuwu，下一步验证「封着技能也能清理污染」
		sacrifice.releaseLostAffixEffects();
		assertEqual(victim.player.abyssWuranLocked.length, 3, "还有污染持有者时封牌引用一条都不放");
		assert(victim.player.skills.includes("abyss_wuran_lock"), "还有污染持有者时载体留在身上");

		// ⑨ 最后一名持有者也失去：releaseWuranLocks 清引用、摘标签、摘载体
		holder2.player.removeSkill("abyss_wuran");
		sacrifice.releaseLostAffixEffects();
		assertEqual(victim.player.abyssWuranLocked.length, 0, "无持有者后封牌引用清空");
		for (const card of [spare, fresh, fresh2]) {
			assert(!card.hasGaintag("abyss_wuran"), "无持有者后牌面污染标签摘掉");
			assertEqual(canUse(card), "unchanged", "清理后手牌恢复可用");
		}
		assert(!victim.player.skills.includes("abyss_wuran_lock"), "无持有者后封牌载体摘掉");
		// 此时 holder 还带着虚无：lateVictim 仍被封着，但它的污染载体也必须被清掉
		assertEqual(lateVictim.player.abyssWuranLocked.length, 0, "虚无仍封着时，污染引用也照常清空");
		assert(!lateLocked.hasGaintag("abyss_wuran"), "虚无仍封着时，牌面标签也照常摘掉");
		assert(!lateVictim.player.skills.includes("abyss_wuran_lock"), "虚无仍封着时，封牌载体也照常摘掉（不能因屏蔽过滤漏清）");
		assert((lateVictim.player.storage.skill_blocker ?? []).includes("abyss_xuwu_blocker"), "此时虚无屏蔽器仍在，清理没有误当成解封");

		// ⑩ 虚无源最后失去：屏蔽器与解除宿主照旧被 releaseXuwuBlocks 收走
		holder.player.removeSkill("abyss_xuwu");
		sacrifice.releaseLostAffixEffects();
		assertEqual(lateVictim.player.storage.skill_blocker, undefined, "虚无源失去后屏蔽器清空");
		assert(!lateVictim.player.skills.includes("abyss_xuwu_release"), "解除宿主一并摘掉");
		return "本体链三限制 / 虚无中新旧污染 / 重复虚无不叠层 / 回合结束恢复 / 多持有者清理";
	} finally {
		mockGame.players = [];
		for (const [id, info] of savedSkills) {
			if (info === undefined) {
				delete lib.skill[id];
			} else {
				lib.skill[id] = info;
			}
		}
	}
});

await checkAsync("深渊·永恒：任意角色回合开始都补满体力，满血与阵亡不空转", async () => {
	const info = abyssAffixes.affix.abyss_yongheng;
	assertEqual(info.trigger.global, "phaseBegin", "挂在「回合开始」的全局时机上，不再是每轮一次");
	const hurt = makeAbyssPlayer({ playerid: "hurt", hp: 2, maxHp: 4 });
	const otherTurn = makeEvent("phase", { player: makeAbyssPlayer({ playerid: "someone" }).player });
	assert(info.filter(otherTurn, hurt.player, "phaseBegin"), "别人回合开始也该触发");
	await info.content(abyssSkillEvent("phaseBegin", otherTurn), otherTurn, hurt.player);
	assertEqual(hurt.rec.recoverTo.length, 1, "回复一次");
	assertEqual(hurt.rec.recoverTo[0], 4, "回复至上限 4");
	assert(!info.filter(makeEvent("phase"), hurt.player, "phaseBegin"), "满血不再触发");
	const dead = makeAbyssPlayer({ playerid: "dead", hp: 0, alive: false });
	assert(!info.filter(makeEvent("phase"), dead.player, "phaseBegin"), "阵亡不再触发");
	return "每个回合补满 / 满血与死亡不空转";
});

await checkAsync("深渊·复仇：每受一次伤永久+1 伤害，可叠加且不吃固定伤害", async () => {
	const info = abyssAffixes.affix.abyss_fuchou;
	const holder = makeAbyssPlayer({});
	assert(!info.filter({ num: 0 }, holder.player, "damageBegin1"), "还没受过伤时不加伤");
	for (const expect of [1, 2]) {
		const hit = makeEvent("damage", { num: 1 });
		assert(info.filter(hit, holder.player, "damageEnd"), "受到伤害后应叠加");
		await info.content(abyssSkillEvent("damageEnd", hit), hit, holder.player);
		assertEqual(holder.player.storage.abyss_fuchou, expect, `第 ${expect} 次受伤叠加到 +${expect}`);
	}
	assert(info.filter({ numFixed: false }, holder.player, "damageBegin1"), "有层数时应加伤");
	assert(!info.filter({ numFixed: true }, holder.player, "damageBegin1"), "固定伤害不加");
	const trigger = { num: 1 };
	await info.content(abyssSkillEvent("damageBegin1", trigger), trigger, holder.player);
	assertEqual(trigger.num, 3, "累计层数全部加进伤害");
	return "两层叠加 + 固定伤害豁免";
});

check("深渊标记：徽记说明按存档里的词缀 id 列出名称与描述", () => {
	// 按 id 从池子里挑，不按池子下标：删掉一个词缀会让后面的下标整体前移，用下标的夹具会假红
	const inPool = id => abyssConfig.AFFIX_POOL.some(item => item.id === id);
	assert(inPool("abyss_buqu") && inPool("abyss_liesha"), "夹具用的两枚词缀必须还在池子里");
	const ids = ["abyss_buqu", "abyss_liesha"];
	const html = abyssAffixes.abyssMarkSkill.abyss_affix.intro.mark(null, ids, null);
	for (const token of ["深渊·不屈", "深渊·猎杀", "攻击范围无限"]) {
		assert(html.includes(token), `标记说明应包含「${token}」：${html}`);
	}
	const empty = abyssAffixes.abyssMarkSkill.abyss_affix.intro.mark(null, [], null);
	assert(empty.includes("无深渊强化"), "空列表要有兜底文案");
	assertEqual(abyssAffixes.abyssAffixLines(["abyss_not_exists"]).length, 0, "下架词缀不进说明");
	return "两枚词缀进说明 / 空列表兜底";
});

check("奇物品质：升级链、费用与「升级只改 exp 与 curioQuality」", () => {
	assertEqual(JSON.stringify(curiosData.CURIOSITY_QUALITY_CHAIN), JSON.stringify(["negative", "common", "rare", "epic"]), "品质链");
	assertEqual(curioManager.getCurioQuality("energy_core", {}), "common", "没记品质就是初始品质");
	assertEqual(curioManager.getCurioQuality("energy_core", undefined), "common", "缺省的 qualityMap 也按初始品质");
	assertEqual(curioManager.getCurioQuality("cursed_coin", { cursed_coin: "rare" }), "rare", "记了就用记的");
	assertEqual(curioManager.getNextCurioQuality("energy_core", {}), "rare", "普通 → 稀有");
	assertEqual(curioManager.getNextCurioQuality("cursed_coin", {}), "common", "负面 → 普通");
	assertEqual(curioManager.getNextCurioQuality("broken_watch", {}), null, "史诗没有下一档");
	assert(curioManager.isCurioMaxQuality("broken_watch", {}), "破损怀表已是链尾");
	assert(!curioManager.isCurioMaxQuality("cursed_coin", {}), "负面奇物照样升得动");
	// 费用 = 10 × 本层胜利经验（floor(20×√关卡)），按「升级时」的关卡现算
	assertEqual(curioManager.getCurioUpgradePrice({ level: 31 }, "energy_core"), 1110, "31 层：胜利经验 111 → 1110");
	assertEqual(curioManager.getCurioUpgradePrice({ level: 100 }, "energy_core"), 2000, "100 层：胜利经验 200 → 2000");
	assertEqual(curioManager.getCurioUpgradePrice({ level: 234 }, "energy_core"), 3050, "234 层：胜利经验 305 → 3050");
	assertEqual(curioManager.getCurioUpgradePrice({ level: 1 }, "energy_core"), 200, "第 1 层：胜利经验 20 → 200（10 倍胜利经验）");
	assertEqual(
		curioManager.getCurioUpgradePrice({ level: 50 }, "cursed_coin"),
		curioManager.getCurioUpgradePrice({ level: 50 }, "energy_core"),
		"同层同价，与是哪件奇物无关"
	);
	assertEqual(curioManager.getCurioUpgradePrice({ level: 31 }, "不存在的奇物"), null, "不存在的奇物没有价格");
	// 升级：只改 currency.exp 与 curioQuality，原 run 一个字节都不动
	const run = { ...freshRun(cfg.RUN_MODE.endless), level: 31, currency: { gold: 100, exp: 5000 }, curios: ["energy_core"] };
	const first = curioManager.upgradeCurio(run, "energy_core");
	assert(first.ok, first.error ?? "升级应成功");
	assertEqual(first.run.currency.exp, 5000 - 1110, "扣掉当层费用");
	assertEqual(first.run.currency.gold, 100, "金币不动");
	assertEqual(first.run.curioQuality.energy_core, "rare", "品质写进 curioQuality");
	assertEqual(run.currency.exp, 5000, "原 run 的经验没被扣");
	assertEqual(JSON.stringify(run.curioQuality), "{}", "原 run 的品质没被写");
	assertEqual(JSON.stringify(run.curios), JSON.stringify(["energy_core"]), "持有列表不动");
	const second = curioManager.upgradeCurio(first.run, "energy_core");
	assertEqual(second.run.curioQuality.energy_core, "epic", "稀有 → 史诗");
	const top = curioManager.upgradeCurio(second.run, "energy_core");
	assert(!top.ok && top.error.includes("最高"), `史诗不能再升：${top.error}`);
	assertEqual(top.run.currency.exp, second.run.currency.exp, "被拒时不扣经验");
	// 负面奇物一路净化到史诗
	let coin = { ...freshRun(cfg.RUN_MODE.endless), level: 31, currency: { gold: 0, exp: 1110 * 3 }, curios: ["cursed_coin"] };
	coin = curioManager.upgradeCurio(coin, "cursed_coin").run;
	assertEqual(coin.curioQuality.cursed_coin, "common", "负面 → 普通");
	coin = curioManager.upgradeCurio(coin, "cursed_coin").run;
	assertEqual(coin.curioQuality.cursed_coin, "rare", "普通 → 稀有");
	coin = curioManager.upgradeCurio(coin, "cursed_coin").run;
	assertEqual(coin.curioQuality.cursed_coin, "epic", "稀有 → 史诗");
	// 幸运石：稀有 → 史诗
	const stone = { ...freshRun(cfg.RUN_MODE.endless), level: 31, currency: { gold: 0, exp: 1110 }, curios: ["lucky_stone"] };
	assertEqual(curioManager.upgradeCurio(stone, "lucky_stone").run.curioQuality.lucky_stone, "epic", "幸运石 稀有 → 史诗");
	// 经验差一点都不行
	const broke = { ...freshRun(cfg.RUN_MODE.endless), level: 31, currency: { gold: 0, exp: 1109 }, curios: ["energy_core"] };
	const denied = curioManager.upgradeCurio(broke, "energy_core");
	assert(!denied.ok && denied.error.includes("经验不足"), `差 1 点也要拒：${denied.error}`);
	assertEqual(denied.run, broke, "失败时原样返回传入的 run");
	assertEqual(denied.run.currency.exp, 1109, "经验不变");
	assertEqual(JSON.stringify(denied.run.curioQuality), "{}", "品质不变");
	// 未拥有 / 已下架
	const notOwned = curioManager.upgradeCurio({ ...freshRun(cfg.RUN_MODE.endless), level: 31, currency: { gold: 0, exp: 9999 }, curios: [] }, "energy_core");
	assert(!notOwned.ok && notOwned.error.includes("未拥有"), `没持有就升不了：${notOwned.error}`);
	const gone = curioManager.upgradeCurio({ ...freshRun(cfg.RUN_MODE.endless), level: 31, currency: { gold: 0, exp: 9999 }, curios: ["幽灵奇物"] }, "幽灵奇物");
	assert(!gone.ok && gone.error.includes("下架"), `下架的奇物升不了：${gone.error}`);
	return "品质链 + 三段费用 + 只改两字段";
});

check("奇物品质：七件奇物的逐档效果与文案", () => {
	const at = (id, quality) => curioManager.getCurioEffect(id, { [id]: quality });
	// 能量核心：普通 1 → 稀有 2 → 史诗 4
	assertEqual(at("energy_core", "common").extraDraw, 1, "能量核心 普通 +1");
	assertEqual(at("energy_core", "rare").extraDraw, 2, "能量核心 稀有 +2");
	assertEqual(at("energy_core", "epic").extraDraw, 4, "能量核心 史诗 +4");
	// 剩饭：1 → 2（每轮）→ 2（每回合），史诗换的是时机，不是叠加
	assertEqual(at("leftover_rice", "common").roundHeal, 1, "剩饭 普通每轮 1");
	assertEqual(at("leftover_rice", "rare").roundHeal, 2, "剩饭 稀有每轮 2");
	assertEqual(at("leftover_rice", "epic").turnHeal, 2, "剩饭 史诗改成每回合 2");
	assertEqual(at("leftover_rice", "epic").roundHeal ?? 0, 0, "史诗不再每轮回血（整份替换，不是叠加）");
	// 幸运石 10% → 20%
	assertEqual(at("lucky_stone", "rare").expRate, 0.1, "幸运石 稀有 +10%");
	assertEqual(at("lucky_stone", "epic").expRate, 0.2, "幸运石 史诗 +20%");
	// 气息腰带：回 1 → 回上限一半
	assertEqual(at("breath_belt", "rare").dyingRecoverToRatio ?? 0, 0, "气息腰带 稀有没有比例（回 1）");
	assertEqual(at("breath_belt", "epic").dyingRecoverToRatio, 0.5, "气息腰带 史诗回上限一半");
	assertEqual(at("breath_belt", "epic").dyingSave, 1, "史诗仍只有一次濒死保护");
	// 循环按钮 +1 → +2
	assertEqual(at("loop_button", "rare").extraShopRefresh, 1, "循环按钮 稀有 +1");
	assertEqual(at("loop_button", "epic").extraShopRefresh, 2, "循环按钮 史诗 +2");
	// 诅咒金币：-10% → ±10% → -5%~+15% → +20%
	assertEqual(at("cursed_coin", "negative").goldRate, -0.1, "诅咒金币 负面 -10%");
	assertEqual(at("cursed_coin", "common").goldRate, 0, "普通中心 0");
	assertEqual(at("cursed_coin", "common").goldRateSpread, 0.1, "普通 ±10%");
	assertEqual(at("cursed_coin", "rare").goldRate, 0.05, "稀有中心 +5%");
	assertEqual(at("cursed_coin", "rare").goldRateSpread, 0.1, "稀有 ±10%（即 -5%~+15%）");
	assertEqual(at("cursed_coin", "epic").goldRate, 0.2, "史诗 +20%");
	assertEqual(at("cursed_coin", "epic").goldRateSpread ?? 0, 0, "史诗不再波动");
	// 破损怀表：史诗且不可升级
	assertEqual(at("broken_watch", "epic").extraPhase, 1, "破损怀表 +1 出牌阶段");
	assert(curioManager.isCurioMaxQuality("broken_watch", {}), "破损怀表不能升级");
	// 文案：波动档写成区间、比例档写进濒死那一行
	assertEqual(curioManager.describeCurioEffects({ goldRate: 0, goldRateSpread: 0.1 })[0], "金币获取 -10%~+10%", "波动档文案");
	assertEqual(curioManager.describeCurioEffects({ goldRate: 0.05, goldRateSpread: 0.1 })[0], "金币获取 -5%~+15%", "偏移波动档文案");
	assertEqual(
		curioManager.describeCurioEffects({ dyingSave: 1, dyingRecoverToRatio: 0.5 })[0],
		"每局游戏首次进入濒死状态时，回复体力值至体力上限的一半（向上取整）",
		"比例档文案：一半就说一半，取整方向与 data/skills.js 的 Math.ceil 对齐"
	);
	assertEqual(
		curioManager.describeCurioEffects({ dyingSave: 1 })[0],
		"每局游戏首次进入濒死状态时，回复体力值至1",
		"没写比例的档仍回固定 1"
	);
	// 文案一律自动生成（没有手写兜底字段），同一个奇物各档之间句式因此统一
	assertEqual(curioManager.describeCurio("energy_core", {})[0], "摸牌阶段额外摸 1 张牌", "初始档按效果生成");
	assertEqual(curioManager.describeCurio("energy_core", { energy_core: "epic" })[0], "摸牌阶段额外摸 4 张牌", "升级档同样生成，句式一致");
	assertEqual(curioManager.describeCurio("broken_watch", {})[0], "游戏开始时，获得 1 个额外的出牌阶段", "没有手写文案可回退");
	return "七件奇物 × 逐档效果 + 文案";
});

check("奇物品质：战斗与结算都按当前品质算，最高档与存档清洗也对齐", () => {
	// 战斗内总表（battle.js 写进 storage 的那张表）
	assertEqual(curioManager.sumCurioEffects(["energy_core"], { energy_core: "epic" }).extraDraw, 4, "史诗能量核心进总表 +4");
	assertEqual(curioManager.sumCurioEffects(["breath_belt"], { breath_belt: "epic" }).dyingRecoverToRatio, 0.5, "史诗气息腰带把比例带进总表");
	assertEqual(curioManager.sumCurioEffects(["leftover_rice"], { leftover_rice: "epic" }).turnHeal, 2, "史诗剩饭带的是每回合回血");
	assertEqual(curioManager.getBonus(["lucky_stone"], "expRate", { lucky_stone: "epic" }), 0.2, "getBonus 吃 qualityMap");
	// 循环按钮：最高档 +2，且上限按最高档放宽
	assertEqual(curioManager.getMaxCurioEffect("loop_button", "extraShopRefresh"), 2, "循环按钮最高档 +2");
	assertEqual(curioManager.getMaxShopRefreshes(), cfg.SKILL_REFRESH_PER_LEVEL + 2, "刷新上限按最高品质算");
	const epicLoop = { ...freshRun(cfg.RUN_MODE.endless), level: 8, curios: ["loop_button"], curioQuality: { loop_button: "epic" } };
	assertEqual(reward.settleVictory(epicLoop, NOW, () => 0).run.shopRefreshesRemaining, cfg.SKILL_REFRESH_PER_LEVEL + 2, "史诗循环按钮每战 +2");
	// 结算：幸运石（经验）与诅咒金币（金币，含波动）
	const level = 10;
	const noCurio = reward.settleVictory({ ...freshRun(cfg.RUN_MODE.endless), level }, NOW, () => 0).gained;
	const expOf = quality => reward.settleVictory(
		{ ...freshRun(cfg.RUN_MODE.endless), level, curios: ["lucky_stone"], curioQuality: quality ? { lucky_stone: quality } : {} },
		NOW, () => 0
	).gained.exp;
	assertEqual(expOf(null), Math.round(noCurio.exp * 1.1), "不写品质就是初始档（稀有）+10%");
	assertEqual(expOf("rare"), expOf(null), "显式写 rare 与初始档一致");
	assertEqual(expOf("epic"), Math.round(noCurio.exp * 1.2), "史诗幸运石 +20%");
	const goldOf = (quality, rng) => reward.settleVictory(
		{ ...freshRun(cfg.RUN_MODE.endless), level, curios: ["cursed_coin"], curioQuality: quality ? { cursed_coin: quality } : {} },
		NOW, rng
	).gained.gold;
	assertEqual(goldOf(null, () => 0), Math.round(noCurio.gold * 0.9), "诅咒金币 负面 -10%");
	assertEqual(goldOf("common", () => 0), Math.round(noCurio.gold * 0.9), "普通波动下界 -10%");
	assertEqual(goldOf("common", () => 1), Math.round(noCurio.gold * 1.1), "普通波动上界 +10%");
	assertEqual(goldOf("rare", () => 0), Math.round(noCurio.gold * 0.95), "稀有波动下界 -5%");
	assertEqual(goldOf("rare", () => 1), Math.round(noCurio.gold * 1.15), "稀有波动上界 +15%");
	assertEqual(goldOf("epic", () => 0), Math.round(noCurio.gold * 1.2), "史诗固定 +20%，不消耗 rng 也照样算");
	// 存档：升级结果能原样读回，脏数据一律清掉
	let saved = { ...freshRun(cfg.RUN_MODE.endless), level: 5, currency: { gold: 0, exp: 99999 }, curios: ["energy_core", "cursed_coin"] };
	saved = curioManager.upgradeCurio(saved, "energy_core").run;
	saved = curioManager.upgradeCurio(saved, "energy_core").run;
	assertEqual(saved.curioQuality.energy_core, "epic", "先升到史诗");
	assertEqual(state.normalizeRun(saved).curioQuality.energy_core, "epic", "读档仍是史诗");
	assertEqual(state.cloneRun(saved).curioQuality.energy_core, "epic", "cloneRun 仍是史诗");
	const roundTrip = state.normalizeRun(saved);
	assertEqual(JSON.stringify(state.normalizeRun(roundTrip).curioQuality), JSON.stringify(roundTrip.curioQuality), "清洗幂等");
	const dirty = state.normalizeRun({
		...saved,
		curios: ["energy_core", "cursed_coin"],
		curioQuality: {
			幽灵奇物: "epic",
			broken_watch: "epic",
			energy_core: "legendary",
			cursed_coin: "negative",
		},
	});
	assertEqual(JSON.stringify(dirty.curioQuality), "{}", "不存在的奇物 / 未持有 / 非法品质 / 等于初始品质全部清掉");
	const downgraded = state.normalizeRun({ ...saved, curios: ["energy_core"], curioQuality: { energy_core: "negative" } });
	assertEqual(JSON.stringify(downgraded.curioQuality), "{}", "普通奇物写成负面 = 反向降级，清掉");
	const kept = state.normalizeRun({ ...saved, curios: ["cursed_coin"], curioQuality: { cursed_coin: "common", energy_core: "epic" } });
	assertEqual(JSON.stringify(kept.curioQuality), JSON.stringify({ cursed_coin: "common" }), "合法的保留，未持有的剔除");
	return "战斗/结算按品质 + 上限 + 清洗";
});

check("奇物品质：新获得的奇物一律回到初始品质（与图鉴/旧品质无关）", () => {
	// 先拥有一件并升到史诗，再丢弃
	let run = { ...freshRun(cfg.RUN_MODE.endless), level: 5, currency: { gold: 0, exp: 99999 }, curios: ["energy_core"] };
	run = curioManager.upgradeCurio(run, "energy_core").run;
	run = curioManager.upgradeCurio(run, "energy_core").run;
	assertEqual(run.curioQuality.energy_core, "epic", "先升到史诗");
	// 丢弃：curios 去掉，品质记录由读档清洗一并剔除（图鉴保留 id）
	const dropped = state.normalizeRun({ ...run, curios: [], collection: { events: [], curios: ["energy_core"] } });
	assertEqual(JSON.stringify(dropped.curioQuality), "{}", "未持有 → 品质记录剔除");
	assertEqual(JSON.stringify(dropped.collection.curios), JSON.stringify(["energy_core"]), "图鉴保留 id");
	assertEqual(JSON.stringify(dropped.collection), JSON.stringify({ events: [], curios: ["energy_core"] }), `图鉴里不该出现任何品质信息：${JSON.stringify(dropped.collection)}`);
	// 重新拿到：随机获得走的是初始品质（抽哪一件由 rngForCurio 定位，不靠池子下标）
	const again = curioManager.grantRandomCurio(dropped, rngForCurio(dropped, "energy_core"));
	assertEqual(JSON.stringify(again.run.curios), JSON.stringify(["energy_core"]), "重新拿回能量核心");
	assertEqual(JSON.stringify(again.run.curioQuality), "{}", "新获得不带任何品质记录");
	assertEqual(curioManager.getCurioQuality("energy_core", again.run.curioQuality), "common", "回到普通");
	// 诅咒金币：史诗丢失后重新获得是负面
	let coin = { ...freshRun(cfg.RUN_MODE.endless), level: 31, currency: { gold: 0, exp: 1390 * 3 }, curios: ["cursed_coin"] };
	coin = curioManager.upgradeCurio(coin, "cursed_coin").run;
	coin = curioManager.upgradeCurio(coin, "cursed_coin").run;
	coin = curioManager.upgradeCurio(coin, "cursed_coin").run;
	assertEqual(coin.curioQuality.cursed_coin, "epic", "诅咒金币先升到史诗");
	const coinDropped = state.normalizeRun({ ...coin, curios: [] });
	const coinAgain = curioManager.grantRandomCurio(coinDropped, rngForCurio(coinDropped, "cursed_coin"));
	assertEqual(coinAgain.curioId, "cursed_coin", "重新拿到诅咒金币");
	assertEqual(curioManager.getCurioQuality("cursed_coin", coinAgain.run.curioQuality), "negative", "回到负面");
	// 商店：已拥有的不进候选，所以候选永远按初始品质展示与定价
	const offers = curioManager.rollCurioOffers({ ...freshRun(cfg.RUN_MODE.endless), level: 5, curios: ["energy_core"] }, makeRng(4));
	assert(!offers.some(offer => offer.id === "energy_core"), "已拥有的奇物不进候选");
	const offerText = offers.flatMap(offer => curioManager.describeCurio(offer.id));
	assert(!offerText.some(line => line.includes("4 张牌")), `候选展示用的是初始品质：${offerText.join(" / ")}`);
	return "史诗丢弃 → 重新获得回初始品质";
});

// ---------------------------------------------------------------- 本轮新增：无尽事件扩容与新奇物

/** 按顺序吐值的 rng；吐完重复最后一个（关心之外的调用不会把序列打乱） */
const seq = values => {
	const list = values.slice();
	return () => (list.length > 1 ? list.shift() : list[0]);
};

/** 第 4 关的胜利基准：√4 = 2，金币 100、经验 40，所有倍率类断言都拿它算，不出现取整噪声 */
const BASE_LEVEL = 4;
const BASE_GOLD = rewardsData.getEndlessReward(BASE_LEVEL, ["gold"]).gold;
const BASE_EXP = rewardsData.getEndlessReward(BASE_LEVEL, ["exp"]).exp;
/** 带父链的伤害假事件：机制技判「本回合」要沿父链取 phase */
const damageEvent = (fields, phase) => makeEvent("damage", { name: "damage", num: 1, ...(fields ?? {}) }, phase ? [phase] : []);
const makeCarrier = storage => ({ storage: { rogue_curio: storage }, hp: 4, maxHp: 4, isAlive: () => true });

check("经验泉：页面上只有「饮用」，点了才追问「再饮一口」，两口并成一次结算", () => {
	const spring = eventManager.buildPendingEvent("spring_of_wisdom", BASE_LEVEL, () => 0, NOW, { curios: [] });
	assertEqual(spring.choices.length, 2, "事件页只给「饮用 / 离开」两个按钮");
	assertEqual(spring.choices[0].text, "饮用", "第一个按钮就叫饮用");
	assertEqual(JSON.stringify(spring.choices[0].reward), JSON.stringify({ exp: Math.round(BASE_EXP * 3) }), "饮用 = 300% 本层胜利经验");
	const sip = spring.choices[0].followUp;
	assert(sip, "「饮用」带一句追问");
	assertEqual(JSON.stringify(sip.reward), JSON.stringify({ exp: Math.round(BASE_EXP * 2) }), "再饮一口 = 在第一口之上再加 200%");
	assertEqual(JSON.stringify(sip.action), JSON.stringify({ kind: "abyssDebt", perEnemy: cfg.SPRING_DEBT_AFFIXES }), "债的个数由配置注入");
	assert(sip.text.includes(`每个敌人 +${cfg.SPRING_DEBT_AFFIXES} 个深渊强化`), `按钮上要写明代价：${sip.text}`);
	assert(sip.question.includes("再饮一口"), `追问那句话随存档定死：${sip.question}`);
	// 追问句跟着存档往返：读档回到事件页，点「饮用」问出来的必须还是同一句、同一口
	const round = state.normalizeRun({ ...freshRun(cfg.RUN_MODE.endless), pendingEvent: spring });
	assertEqual(JSON.stringify(round.pendingEvent.choices[0].followUp), JSON.stringify(sip), "读档不重掷、追问原样回来");

	const run = { ...freshRun(cfg.RUN_MODE.endless), pendingEvent: spring, currency: { gold: 0, exp: 5 } };
	// 第一趟（流程层还没问过）：只把追问回过去，存档一个字都不改
	const asked = eventManager.resolveEventChoice(run, 0, {}, () => 0);
	assert(asked.ok && asked.followUp && !asked.lines.length, "第一趟只回追问，不结算");
	assertEqual(asked.run, run, "第一趟原样返回，事件照旧挂着");
	// 答应：两口并成一次结算——经验相加、深渊债照记
	const drank = eventManager.resolveEventChoice(run, 0, { followUpTaken: true }, () => 0);
	assert(drank.ok && drank.action === null, "再饮一口在本层就结算完，不需要子页面");
	assertEqual(drank.run.currency.exp, 5 + Math.round(BASE_EXP * 3) + Math.round(BASE_EXP * 2), "两口的经验一起到账");
	assertEqual(drank.run.abyssDebt, cfg.SPRING_DEBT_AFFIXES, "债记进存档");
	assertEqual(drank.run.pendingEvent, null, "事件收掉");
	assert(drank.lines.some(line => line.includes("深渊强化")), `文案要写明欠了什么：${drank.lines.join(" / ")}`);
	// 拒绝：只落第一口，一分不欠
	const oneSip = eventManager.resolveEventChoice(run, 0, { followUpTaken: false }, () => 0);
	assertEqual(oneSip.run.currency.exp, 5 + Math.round(BASE_EXP * 3), "不喝第二口就只拿第一口的经验");
	assertEqual(oneSip.run.abyssDebt, 0, "拒绝追问就不欠债");
	// 连着欠两次的债是累加的，不能被后一次抹掉
	const twice = eventManager.resolveEventChoice({ ...drank.run, pendingEvent: spring }, 0, { followUpTaken: true }, () => 0);
	assertEqual(twice.run.abyssDebt, cfg.SPRING_DEBT_AFFIXES * 2, "债累加不覆盖");
	return `饮用 ${Math.round(BASE_EXP * 3)} + 再饮 ${Math.round(BASE_EXP * 2)} 经验 / 追问一次 · 债 ${cfg.SPRING_DEBT_AFFIXES}`;
});

check("属性训练场：按钮不标价，半层基准经验换随机属性，全满时只弹提示不扣钱", () => {
	const maxed = {};
	for (const id of cfg.STAT_IDS) {
		maxed[id] = statsData.stats[id].maxLevel;
	}
	const ground = eventManager.buildPendingEvent("stat_training_ground", BASE_LEVEL, () => 0, NOW, { statLevels: maxed, curios: [] });
	assertEqual(JSON.stringify(ground.choices[0].reward), JSON.stringify({ exp: -Math.round(BASE_EXP * 0.5), statUp: cfg.STAT_IDS[0] }), "消耗半层基准经验 + 定死随机到的那一项");
	assertEqual(ground.choices[0].text, "接受训练", "hideCost：按钮上只显示「接受训练」，不写要花多少经验");
	assertEqual(ground.choices[0].reward.exp, -Math.round(BASE_EXP * 0.5), "价钱照旧定死在奖励里（只是不写在按钮上）");
	assertEqual(ground.choices[0].blockedText, "你太厉害了，没什么能学到的东西。", "作者给的提示句随存档定死");
	// 全满：照常可点、只弹那句、经验一分不扣、属性一格不动
	const rich = { ...freshRun(cfg.RUN_MODE.endless), stats: { ...maxed }, currency: { gold: 0, exp: 999 }, pendingEvent: ground };
	assert(eventManager.isChoiceAffordable(rich, ground.choices[0].reward), "钱够就不该置灰（满级是「没对象」不是「付不起」）");
	const blocked = eventManager.resolveEventChoice(rich, 0, {}, () => 0);
	assertEqual(blocked.lines.length, 1, `只弹一句：${blocked.lines.join(" / ")}`);
	assertEqual(blocked.lines[0], ground.choices[0].blockedText, "弹的就是作者那句话");
	assertEqual(blocked.run.currency.exp, 999, "被拦下时不扣经验");
	assertEqual(JSON.stringify(blocked.run.stats), JSON.stringify(maxed), "属性不动");
	assertEqual(blocked.run.pendingEvent, null, "事件照样收掉");
	// 生产路径（会给完整存档）下按钮同样不写价钱，而且经验不够也不会被「货币不足」挡下——
	// 满级是「没对象可作用」，挡下了作者那句提示就永远看不到
	const liveRun = { ...freshRun(cfg.RUN_MODE.endless), level: BASE_LEVEL + 1, stats: { ...maxed }, curios: [] };
	const live = eventManager.buildPendingEvent("stat_training_ground", BASE_LEVEL, () => 0, NOW, {
		level: liveRun.level, statLevels: liveRun.stats, curios: liveRun.curios, run: liveRun,
	});
	assert(!live.choices[0].text.includes("经验"), `生产路径的按钮也不写价钱：${live.choices[0].text}`);
	const poor = { ...liveRun, currency: { gold: 0, exp: 5 }, pendingEvent: live };
	assertEqual(eventManager.getBlockedMessage(poor, live.choices[0]), live.choices[0].blockedText, "满级是「没对象」，优先于「付不起」");
	const told = eventManager.resolveEventChoice(poor, 0, {}, () => 0);
	assertEqual(told.lines[0], live.choices[0].blockedText, "缺经验也照弹提示，而不是被拒绝");
	assertEqual(told.run.currency.exp, 5, "一分不扣");
	// 随机属性只在「还能升」的属性里掷：两项满级时必给剩下的那一项（抽中已满项 = 白付经验）
	const partial = { ...maxed, [cfg.STAT_IDS[0]]: 0 };
	const partialRun = { ...liveRun, stats: { ...partial }, currency: { gold: 0, exp: 999 } };
	const ground2 = eventManager.buildPendingEvent("stat_training_ground", BASE_LEVEL, () => 0.999, NOW, {
		level: partialRun.level, statLevels: partialRun.stats, curios: [], run: partialRun,
	});
	assertEqual(ground2.choices[0].reward.statUp, cfg.STAT_IDS[0], "两项满级 → 只掷得到还能升的那一项");
	const trained2 = eventManager.resolveEventChoice({ ...partialRun, pendingEvent: ground2 }, 0, {}, () => 0);
	assertEqual(trained2.run.stats[cfg.STAT_IDS[0]], 1, "花了经验就必然 +1");
	assertEqual(trained2.run.currency.exp, 999 - Math.round(BASE_EXP * 0.5), "扣的还是半层基准经验");
	// 没满：正常扣钱升一级
	const firstStat = cfg.STAT_IDS[0];
	const trained = eventManager.resolveEventChoice({ ...rich, stats: { ...maxed, [firstStat]: 0 } }, 0, {}, () => 0);
	assertEqual(trained.run.currency.exp, 999 - Math.round(BASE_EXP * 0.5), "扣掉半层基准经验");
	assertEqual(trained.run.stats[firstStat], 1, "该项 +1");
	// 钱不够仍是「置灰 + 点了没反应」
	assert(!eventManager.isChoiceAffordable({ ...rich, stats: { ...maxed, [firstStat]: 0 }, currency: { gold: 0, exp: 5 } }, ground.choices[0].reward), "经验不够按货币不足置灰");
	// 未知实验室没写 blockedText，满级时照旧改送随机奇物（两条规则互不影响）
	const lab = eventManager.buildPendingEvent("unknown_lab", BASE_LEVEL, () => 0, NOW, { statLevels: maxed, curios: [] });
	assertEqual(lab.choices[0].reward.curio, "random", "无 blockedText 的 statUp 仍被改写成随机奇物");
	return "满级弹提示不扣钱 / 只掷还能升的那一项 / 未满正常生效";
});

check("虫洞：跳过十关，期间的基础金币与经验一次性入账", () => {
	const from = BASE_LEVEL + 1;                       // 刚打赢第 4 关 → 接下来该打第 5 关
	const expect = rewardsData.sumEndlessRewards(from, 10);
	const run = { ...freshRun(cfg.RUN_MODE.endless), level: from, currency: { gold: 0, exp: 0 }, curios: [] };
	const pending = eventManager.buildPendingEvent("wormhole", BASE_LEVEL, () => 0, NOW, {
		level: run.level, statLevels: run.stats, curios: run.curios, run,
	});
	assertEqual(pending.id, "wormhole", "待处理事件只存 id（名字由事件页现读定义）");
	assertEqual(pending.choices.length, 2, "进入 / 离开 两个选项");
	assertEqual(pending.choices[0].reward.skipLevels, 10, "跳过十关");
	assertEqual(pending.choices[0].reward.gold, expect.gold, "构建期就把第 5~14 关的金币求和定死");
	assertEqual(pending.choices[0].reward.exp, expect.exp, "构建期就把第 5~14 关的经验求和定死");
	assertEqual(JSON.stringify(pending.choices[1].reward), "{}", "离开没有奖励");
	// 基础口径：拿着会砍金币的奇物也不会因此缩水（与裂隙同一条「胜利加成不生效」）
	const hungry = { ...run, curios: ["hungry_box"] };
	const boosted = eventManager.buildPendingEvent("wormhole", BASE_LEVEL, () => 0, NOW, {
		level: hungry.level, statLevels: hungry.stats, curios: hungry.curios, run: hungry,
	});
	assertEqual(boosted.choices[0].reward.gold, expect.gold, "带饥饿之匣也只发基础口径");
	// 结算：关卡一次性推进十关、期间奖励入账、文案写明跳到第几关
	const settled = eventManager.resolveEventChoice({ ...run, pendingEvent: pending }, 0, {}, () => 0);
	assertEqual(settled.run.level, from + 10, "关卡推进十关");
	assertEqual(settled.run.currency.gold, expect.gold, "期间金币一次性入账");
	assertEqual(settled.run.currency.exp, expect.exp, "期间经验一次性入账");
	assert(settled.lines.some(line => line.includes(`第 ${from + 10} 关`)), `文案写明跳到第几关：${settled.lines.join(" / ")}`);
	assertEqual(settled.run.pendingEvent, null, "事件收掉");
	// 存档往返：skipLevels 与已经定死的金额原样读回（读档不重算、不重掷）
	const roundTrip = state.normalizeRun({ ...freshRun(cfg.RUN_MODE.endless), level: from, pendingEvent: pending });
	const kept = roundTrip.pendingEvent.choices[0].reward;
	assertEqual(kept.skipLevels, 10, "跳关参数随存档定死");
	assertEqual(kept.gold, expect.gold, "金币金额读档不重算");
	assertEqual(kept.exp, expect.exp, "经验金额读档不重算");
	// 「离开」：关卡与钱包一动不动
	const left = eventManager.resolveEventChoice({ ...run, pendingEvent: pending }, 1, {}, () => 0);
	assertEqual(left.run.level, from, "离开不推关卡");
	assertEqual(left.run.currency.gold, 0, "离开不发钱");
	return `第 ${from}~${from + 9} 关共 ${expect.gold} 金币 / ${expect.exp} 经验`;
});

check("技能熔炉：交回 mode.js 且一个钱都不扣，背包为空时才弹提示", () => {
	const forge = eventManager.buildPendingEvent("skill_forge", BASE_LEVEL, () => 0, NOW, { curios: [] });
	assertEqual(JSON.stringify(forge.choices[0].reward), JSON.stringify({ exp: BASE_EXP * 6 }), "熔炼换的 = 6 倍本层基准经验");
	assertEqual(JSON.stringify(forge.choices[0].action), JSON.stringify({ kind: "skillForge", grant: "exp" }), "第一档：换经验");
	assertEqual(JSON.stringify(forge.choices[1].action), JSON.stringify({ kind: "skillForge", grant: "skill" }), "第二档：换技能");
	assertEqual(forge.choices[0].blockedText, forge.choices[1].blockedText, "两档说的是同一件事");
	const noSkill = { ...freshRun(cfg.RUN_MODE.endless), skills: [], skillInventory: [], pendingEvent: forge };
	const told = eventManager.resolveEventChoice(noSkill, 0, {}, () => 0);
	assertEqual(told.lines[0], forge.choices[0].blockedText, "没技能时弹提示而不是置灰");
	assertEqual(told.run.currency.exp, noSkill.currency.exp, "没技能时经验不进账");
	// 有技能：本层不扣不发、事件还挂着，等子页面里真选定；
	// 「有对象」按**完整背包**判——只躺在背包里、没装备的技能同样能熔（熔炉候选也走它）
	const holder = { ...freshRun(cfg.RUN_MODE.endless), skills: [], skillInventory: ["rogue_any"], pendingEvent: forge };
	const handed = eventManager.resolveEventChoice(holder, 0, {}, () => 0);
	assertEqual(JSON.stringify(handed.action), JSON.stringify(forge.choices[0].action), "回给 mode.js 的就是存档里那份参数");
	assert(handed.run === holder, "一个钱都不扣、事件也不清");
	assertEqual(handed.lines.length, 0, "结果行由子页面落地时才生成");
	return "两档 action + 空槽弹提示";
});

check("深渊裂隙：三档参数构建期定死，开战与发奖全部交给裂隙分支", () => {
	const rift = eventManager.buildPendingEvent("abyss_rift", BASE_LEVEL, () => 0, NOW, { curios: [] });
	assertEqual(rift.choices.length, cfg.RIFT_TIERS.length + 1, "三档战斗 + 一个离开");
	for (const [i, conf] of cfg.RIFT_TIERS.entries()) {
		const action = rift.choices[i].action;
		assertEqual(JSON.stringify(action), JSON.stringify({
			kind: "rift", tier: i, level: BASE_LEVEL, enemies: conf.enemies, affixes: cfg.RIFT_EXTRA_AFFIXES,
			gold: BASE_GOLD * conf.multiplier, exp: BASE_EXP * conf.multiplier,
		}), `第 ${i + 1} 档参数`);
		assert(rift.choices[i].text.startsWith(["打一个", "打五个", "打十个"][i]), `档位按钮保留作者原话：${rift.choices[i].text}`);
		assert(rift.choices[i].text.includes(`${BASE_GOLD * conf.multiplier} 金币`), "胜利可得也写进文案");
		assertEqual(JSON.stringify(rift.choices[i].reward), JSON.stringify({}), "裂隙绝不在选项里发钱（打赢才算）");
	}
	assertEqual(rift.choices[3].text, "我不打扰了，我走了哈", "离开选项照作者原话");
	const before = { ...freshRun(cfg.RUN_MODE.endless), pendingEvent: rift };
	const entered = eventManager.resolveEventChoice(before, 1, {}, () => 0);
	assert(entered.run === before && entered.action?.kind === "rift", "开战交回 mode.js，事件先挂着");
	return cfg.RIFT_TIERS.map(tier => `${tier.enemies}人/${tier.multiplier}倍`).join(" ");
});

check("流浪商人：只在有效候选池里抽，单件货与恒定售价，练满了才拦", () => {
	const price = curioManager.getMerchantPrice(BASE_LEVEL);
	assertEqual(price, curioManager.getCurioBasePrice(BASE_LEVEL) * cfg.MERCHANT_PRICE_MULTIPLIER, "恒定售价 = 奇物基准价 ×4");
	// 有效池 = 未拥有 + 已拥有但还能升；已拥有且满级的必须排除
	const allIds = curiosData.curioIds.slice(0);
	const upgradable = allIds.find(id => curioManager.getNextCurioQuality(id, null) !== null);
	const unowned = allIds.find(id => id !== upgradable);
	const ownedIds = allIds.filter(id => id !== unowned);
	const quality = {};
	for (const id of ownedIds) {
		if (id !== upgradable) {
			quality[id] = "epic";
		}
	}
	const filteredRun = {
		...freshRun(cfg.RUN_MODE.endless),
		curios: ownedIds,
		curioQuality: quality,
	};
	const validPool = allIds.filter(id => !ownedIds.includes(id) || id === upgradable);
	const maxedOwned = ownedIds.filter(id => id !== upgradable);
	assertEqual(validPool.length, 2, "夹具：只剩一件未拥有 + 一件可升级");
	assertEqual(curioManager.rollMerchantCurio(filteredRun, () => 0), validPool[0], "rng=0 抽有效池第一件");
	assertEqual(curioManager.rollMerchantCurio(filteredRun, () => 0.999), validPool[1], "rng→1 抽有效池最后一件");
	assert(!maxedOwned.includes(curioManager.rollMerchantCurio(filteredRun, () => 0.5)), "已拥有且满级绝不出现");
	let calls = 0;
	curioManager.rollMerchantCurio(filteredRun, () => { calls += 1; return 0.5; });
	assertEqual(calls, 1, "先过滤再抽一次，不做拒绝采样");
	const maxedRun = {
		...freshRun(cfg.RUN_MODE.endless),
		curios: allIds.slice(0),
		curioQuality: Object.fromEntries(allIds.map(id => [id, "epic"])),
	};
	assertEqual(curioManager.rollMerchantCurio(maxedRun, () => 0), null, "全部满级 → 无候选");

	// 构建期同样只在有效池里抽；rng 定位到那件还能升的货（空存档时池子就是全部奇物）
	const rollFor = id => () => (allIds.indexOf(id) + 0.5) / allIds.length;
	const merchant = eventManager.buildPendingEvent("wandering_merchant", BASE_LEVEL, rollFor(upgradable), NOW, { curios: [] });
	assertEqual(JSON.stringify(merchant.choices[0].action), JSON.stringify({ kind: "merchant", curioId: upgradable, price }), "rng 定位到那件还能升的货");
	assert(merchant.choices[0].text.includes(`${price} 金币`), `标价写进文案：${merchant.choices[0].text}`);
	const filteredMerchant = eventManager.buildPendingEvent("wandering_merchant", BASE_LEVEL, () => 0, NOW, {
		curios: filteredRun.curios,
		run: filteredRun,
	});
	assertEqual(filteredMerchant.choices[0].action.curioId, validPool[0], "生成期从有效池第一件开始抽");
	assert(!maxedOwned.includes(filteredMerchant.choices[0].action.curioId), "生成期绝不产出满级奇物");

	// 已拥有但还能升 → 照卖；练满了 → 弹提示
	const ownedRun = { ...freshRun(cfg.RUN_MODE.endless), curios: allIds.slice(0), pendingEvent: merchant };
	assertEqual(eventManager.getBlockedMessage(ownedRun, merchant.choices[0]), null, "已拥有但还能升 → 照卖");
	const maxedOut = { ...ownedRun, curioQuality: { [upgradable]: "epic" } };
	assertEqual(eventManager.getBlockedMessage(maxedOut, merchant.choices[0]), merchant.choices[0].blockedText, "已拥有且练满 → 弹提示");

	// 全部满级：生成 soldOut 空档，不标价、点击只弹提示并收掉事件，金币与奇物都不动
	const soldOut = eventManager.buildPendingEvent("wandering_merchant", BASE_LEVEL, () => 0, NOW, {
		curios: maxedRun.curios,
		run: maxedRun,
	});
	assertEqual(JSON.stringify(soldOut.choices[0].action), JSON.stringify({ kind: "merchant", soldOut: true }), "全满 → soldOut 空档");
	assertEqual(soldOut.choices[0].text, "和商人交易", `空档不写标价：${soldOut.choices[0].text}`);
	assertEqual(eventManager.getBlockedMessage(maxedRun, soldOut.choices[0]), soldOut.choices[0].blockedText, "全满点击弹提示");
	const settledSoldOut = eventManager.resolveEventChoice({ ...maxedRun, currency: { gold: 123, exp: 0 }, pendingEvent: soldOut }, 0, {}, () => 0);
	assert(settledSoldOut.ok, settledSoldOut.error ?? "空候选应正常结束");
	assertEqual(settledSoldOut.run.currency.gold, 123, "空候选不扣金币");
	assertEqual(settledSoldOut.run.pendingEvent, null, "空候选正常结束事件");
	assertEqual(settledSoldOut.lines[0], soldOut.choices[0].blockedText, "空候选弹作者那句");
	const savedSoldOut = state.normalizeRun({ ...maxedRun, pendingEvent: soldOut });
	assertEqual(JSON.stringify(savedSoldOut.pendingEvent.choices[0].action), JSON.stringify({ kind: "merchant", soldOut: true }), "soldOut 经读档清洗仍保留");

	// 旧档已生成、但商品现在满级：不重掷、不扣费、不发放，只弹提示并结束
	const legacyBlocked = {
		...freshRun(cfg.RUN_MODE.endless),
		currency: { gold: 500, exp: 0 },
		curios: [upgradable],
		curioQuality: { [upgradable]: "epic" },
		pendingEvent: {
			id: "wandering_merchant",
			choices: [
				{ text: `和商人交易（一件货 · 标价 ${price} 金币）`, reward: {}, action: { kind: "merchant", curioId: upgradable, price }, blockedText: "他已经把最好的一件卖给你了，这一笔做不成。" },
				{ text: "不买了", reward: {} },
			],
			createdAt: NOW,
		},
	};
	const loadedLegacy = state.normalizeRun(legacyBlocked);
	assertEqual(loadedLegacy.pendingEvent.choices[0].action.curioId, upgradable, "旧档商品 id 不重掷");
	const blockedLegacy = eventManager.resolveEventChoice(loadedLegacy, 0, {}, () => 0);
	assertEqual(blockedLegacy.run.currency.gold, 500, "旧档满级商品不扣费");
	assertEqual(JSON.stringify(blockedLegacy.run.curios), JSON.stringify([upgradable]), "旧档满级商品不重复发放");
	assertEqual(blockedLegacy.run.pendingEvent, null, "旧档满级商品安全结束事件");
	assertEqual(blockedLegacy.lines[0], legacyBlocked.pendingEvent.choices[0].blockedText, "旧档满级商品弹提示");

	// 旧档商品定义已失效：读档标成 soldOut，点击同样只提示并结束
	const legacyInvalid = state.normalizeRun({
		...freshRun(cfg.RUN_MODE.endless),
		currency: { gold: 500, exp: 0 },
		pendingEvent: {
			id: "wandering_merchant",
			choices: [
				{ text: "和商人交易", reward: {}, action: { kind: "merchant", curioId: "不存在的奇物", price: 400 }, blockedText: "这一笔做不成。" },
				{ text: "不买了", reward: {} },
			],
			createdAt: NOW,
		},
	});
	assertEqual(JSON.stringify(legacyInvalid.pendingEvent.choices[0].action), JSON.stringify({ kind: "merchant", soldOut: true }), "失效商品读档标成 soldOut");
	const blockedInvalid = eventManager.resolveEventChoice(legacyInvalid, 0, {}, () => 0);
	assertEqual(blockedInvalid.run.currency.gold, 500, "失效商品不扣费");
	assertEqual(blockedInvalid.run.pendingEvent, null, "失效商品安全结束事件");

	// 商人的价不吃品质倍率与 ±25% 波动：同一关永远同一个数
	assertEqual(curioManager.getMerchantPrice(BASE_LEVEL), price, "重复调用不掷随机");
	return `${upgradable} 标价 ${price} / 有效池 ${validPool.join(",")} / 全满 soldOut`;
});

check("奇物融合炉：融合费 = 本层基准经验 ×5，没有可融合的才弹提示", () => {
	const forge = eventManager.buildPendingEvent("curio_forge", BASE_LEVEL, () => 0, NOW, { curios: [] });
	const cost = Math.round(BASE_EXP * cfg.FORGE_EXP_MULTIPLIER);
	assertEqual(forge.choices[0].action.costExp, cost, "融合费按配置折算成固定值");
	assert(forge.choices[0].text.includes(`消耗 ${cost} 经验`), `价钱写进文案：${forge.choices[0].text}`);
	assertEqual(JSON.stringify(forge.choices[0].reward), JSON.stringify({}), "钱不写进 reward：点了不该立刻扣");
	const none = { ...freshRun(cfg.RUN_MODE.endless), pendingEvent: forge };
	assertEqual(eventManager.resolveEventChoice(none, 0, {}, () => 0).lines[0], forge.choices[0].blockedText, "一件奇物都没有 → 弹提示");
	const maxedAll = { ...none, curios: curiosData.curioIds.slice(0), curioQuality: Object.fromEntries(curiosData.curioIds.map(id => [id, "epic"])) };
	assertEqual(eventManager.getBlockedMessage(maxedAll, forge.choices[0]), forge.choices[0].blockedText, "全部练满同样「没有可作用的对象」");
	assertEqual(eventManager.getBlockedMessage({ ...none, curios: ["energy_core"] }, forge.choices[0]), null, "有可升的就不拦");
	// 融合本身走 curioManager.upgradeCurio 的覆盖价：只扣这一笔，不看商店的 5× 基准价
	const run = { ...freshRun(cfg.RUN_MODE.endless), level: BASE_LEVEL, currency: { gold: 0, exp: cost }, curios: ["energy_core"] };
	const upgraded = curioManager.upgradeCurio(run, "energy_core", cost);
	assert(upgraded.ok, upgraded.error);
	assertEqual(upgraded.run.currency.exp, 0, "扣的就是事件里那个数");
	assertEqual(upgraded.curioId, "energy_core", "升的是选定的那一件");
	assertEqual(curioManager.getCurioQuality("energy_core", upgraded.run.curioQuality), "rare", "沿品质链走一级");
	return `融合费 ${cost} 经验`;
});

check("古代遗迹：三扇门在构建期掷定给哪一件，掷不到折成经验", () => {
	const byRarity = rarity => curiosData.curioIds.filter(id => curiosData.getCurio(id).rarity === rarity);
	const ruins = eventManager.buildPendingEvent("ancient_ruins", BASE_LEVEL, () => 0, NOW, { curios: [] });
	// 白门：有未拥有的普通款 → 定死那一件 + 0.5 倍基准经验
	assertEqual(ruins.choices[0].reward.curio, byRarity("common")[0], "rng=0 命中池子里第一件普通款");
	assertEqual(ruins.choices[0].reward.exp, Math.round(BASE_EXP * 0.5), "白门附带 0.5 倍基准经验");
	assert(!("curioRarity" in ruins.choices[0].reward), "品质名只是构建期参数，不进存档");
	// 紫门：只给那一件，不给经验
	assertEqual(ruins.choices[1].reward.curio, byRarity("rare")[0], "紫门给稀有款");
	assert(!("exp" in ruins.choices[1].reward), "紫门本身不带经验");
	// 普通款全拥有 → 0.5 + 1.5 = 2 倍经验，与紫门落空同额
	const noCommon = { curios: byRarity("common") };
	const drained = eventManager.buildPendingEvent("ancient_ruins", BASE_LEVEL, () => 0, NOW, noCommon);
	assert(!("curio" in drained.choices[0].reward), "普通款全有 → 不再送奇物");
	assertEqual(drained.choices[0].reward.exp, Math.round(BASE_EXP * 0.5) + Math.round(BASE_EXP * 1.5), "折成 2 倍基准经验");
	// 稀有款全有 → 2 倍
	const rareOnly = { curios: byRarity("rare") };
	const noRare = eventManager.buildPendingEvent("ancient_ruins", BASE_LEVEL, () => 0, NOW, rareOnly);
	assertEqual(noRare.choices[1].reward.exp, Math.round(BASE_EXP * 2), "紫门落空 = 2 倍经验");
	// 黑门：4 倍经验照发；负面款已获得过就只拿经验
	assertEqual(ruins.choices[2].reward.exp, BASE_EXP * 4, "黑门 4 倍基准经验");
	assertEqual(ruins.choices[2].reward.curio, byRarity("negative")[0], "负面款照给");
	const darkTaken = eventManager.buildPendingEvent("ancient_ruins", BASE_LEVEL, () => 0, NOW, { curios: byRarity("negative") });
	assert(!("curio" in darkTaken.choices[2].reward), "负面款已获得过就不再给");
	assertEqual(darkTaken.choices[2].reward.exp, BASE_EXP * 4, "4 倍经验不受影响");
	// 结算照单发放定死的那一件
	const run = { ...freshRun(cfg.RUN_MODE.endless), pendingEvent: ruins, currency: { gold: 0, exp: 0 } };
	const opened = eventManager.resolveEventChoice(run, 0, {}, () => 0);
	assertEqual(opened.curioId, byRarity("common")[0], "发的是构建期定死的那一件");
	assert(opened.run.curios.includes(opened.curioId), "奇物入袋");
	assertEqual(opened.run.currency.exp, Math.round(BASE_EXP * 0.5), "经验同时到账");
	assert(opened.lines.some(line => line.includes("获得奇物")), `文案写明给了哪件：${opened.lines.join(" / ")}`);
	return "三门 + 三条落空分支";
});

check("事件存档往返：action 与 blockedText 随存档定死，非法参数整块剔除", () => {
	const rift = eventManager.buildPendingEvent("abyss_rift", BASE_LEVEL, () => 0, NOW, { curios: [] });
	const roundTrip = state.normalizeRun({ ...freshRun(cfg.RUN_MODE.endless), pendingEvent: rift });
	assertEqual(JSON.stringify(roundTrip.pendingEvent.choices[2].action), JSON.stringify(rift.choices[2].action), "裂隙参数原样读回");
	const forge = eventManager.buildPendingEvent("curio_forge", BASE_LEVEL, () => 0, NOW, { curios: [] });
	const kept = state.normalizeRun({ ...freshRun(cfg.RUN_MODE.endless), pendingEvent: forge });
	assertEqual(kept.pendingEvent.choices[0].blockedText, forge.choices[0].blockedText, "提示句随存档定死");
	// 认不出的 kind 与空白提示句都被丢掉，选项本身保留（事件页还能点，退回普通奖励流程）
	const dirty = state.normalizeRun({
		...freshRun(cfg.RUN_MODE.endless),
		pendingEvent: { id: "abyss_rift", choices: [{ text: "打一个", reward: {}, action: { kind: "teleport" }, blockedText: "   " }], createdAt: 5 },
	});
	assertEqual(JSON.stringify(dirty.pendingEvent.choices[0]), JSON.stringify({ text: "打一个", reward: {} }), "非法 action / 空白提示句整块剔除");
	// tier 越界夹回表内，敌人数与奖励仍按存档里已定死的值（不重掷）
	const clamped = state.normalizeRun({
		...freshRun(cfg.RUN_MODE.endless),
		pendingEvent: { id: "abyss_rift", choices: [{ text: "x", reward: {}, action: { kind: "rift", tier: 99, enemies: 3, gold: 7, exp: 9, affixes: 1, level: 4 } }], createdAt: 5 },
	});
	const action = clamped.pendingEvent.choices[0].action;
	assert(action.tier >= 0 && action.tier < cfg.RIFT_TIERS.length, `tier 夹回表内：${action.tier}`);
	assertEqual(JSON.stringify({ e: action.enemies, g: action.gold, x: action.exp, l: action.level }), JSON.stringify({ e: 3, g: 7, x: 9, l: 4 }), "已定死的数值原样保留");
	// 裂隙战的参数随战斗存档读回：选了「打五个」之后中途刷新，回来还得知道这场该发多少
	const battleRun = state.normalizeRun({
		...freshRun(cfg.RUN_MODE.endless),
		currentBattle: {
			status: "battle",
			rift: { level: 4, enemies: 5, affixes: 1, gold: 800, exp: 320 },
			enemies: [{ characterId: "迪迦", stats: {}, abyss: [], skills: [], maxHp: 0, hp: 0 }],
		},
	});
	assertEqual(JSON.stringify(battleRun.currentBattle.rift), JSON.stringify({ level: 4, enemies: 5, affixes: 1, gold: 800, exp: 320 }), "rift 原样读回");
	// 旧档（v6 及更早）没有这两个字段：按空值补齐，绝不重掷
	const legacy = state.normalizeRun({ ...freshRun(cfg.RUN_MODE.endless), pendingEvent: null });
	delete legacy.curioOfferQueue;
	const revived = state.normalizeRun({ ...legacy, curioOfferQueue: undefined, abyssDebt: undefined });
	assertEqual(JSON.stringify(revived.curioOfferQueue), JSON.stringify([]), "旧档队列补空表");
	assertEqual(revived.abyssDebt, 0, "旧档债补 0");
	// 队列逐批清洗：已拥有 / 已下架 / 空批一律不上架
	const cleaned = state.normalizeRun({
		...freshRun(cfg.RUN_MODE.endless),
		curios: ["broken_watch"],
		curioOfferQueue: [[{ id: "broken_watch", price: 1 }, { id: "nope", price: 2 }], [], [{ id: "lucky_stone", price: 3 }]],
	});
	assertEqual(JSON.stringify(cleaned.curioOfferQueue), JSON.stringify([[{ id: "lucky_stone", price: 3 }]]), "队列清洗掉已拥有、下架与空批");
	return "action/blockedText/rift/队列 四条往返";
});

check("新奇物效果文案：每档都由效果键生成，血怒核心合成一句", () => {
	const lines = (id, quality) => curioManager.describeCurio(id, quality ? { [id]: quality } : null);
	assertEqual(lines("berserker_badge")[0], "每回合首次造成伤害后，本回合你造成的伤害 +1", "狂战徽章普通档");
	assertEqual(lines("berserker_badge", "epic")[0], "每回合首次造成伤害后，本回合你造成的伤害 +2", "狂战徽章史诗档只换数字不换句式");
	// 血怒核心：条件与附带加成都合成同一句，两个配套键自己不出行
	assertEqual(lines("blood_rage_core")[0], "体力低于体力上限的一半（向上取整）时，你使用的牌无法被响应", "普通档");
	assertEqual(lines("blood_rage_core", "rare")[0], "体力低于体力上限的一半（向上取整）时，你使用的牌无法被响应，且此牌造成的伤害 +1", "稀有档补伤害");
	assertEqual(lines("blood_rage_core", "epic")[0], "你使用的牌无法被响应，且此牌造成的伤害 +1", "史诗档去掉体力条件");
	assertEqual(lines("blood_rage_core").length, 1, "配套键不得单独出行");
	assertEqual(lines("counter_amulet")[0], "当你受到伤害后，你下一次造成的伤害 +1", "反击护符普通档");
	assertEqual(lines("counter_amulet", "rare")[0], "当你受到伤害后，本回合你造成的伤害 +1", "稀有档换时机不换句式");
	assertEqual(lines("counter_amulet", "epic")[0], "当你受到伤害后，本局游戏你造成的伤害 +1", "史诗档");
	assert(lines("golden_compass")[0].includes("10%") && lines("golden_compass")[0].includes("奇物商店的刷新概率提高"), `黄金罗盘要说清是百分点累加：${lines("golden_compass")[0]}`);
	assert(!lines("golden_compass")[0].includes("额外刷出一批"), "罗盘不再是「另掷一次的一批」，文案不能还这么写");
	assert(lines("piggy_bank")[0].includes("当前持有金币的 1%"), `储蓄罐要说清乘的是余额：${lines("piggy_bank")[0]}`);
	assert(!lines("piggy_bank")[0].includes("经验获取"), "储蓄罐不能混进 goldRate 那条文案");
	assertEqual(lines("oblivion_stone")[0], "每次失去技能时获得本层胜利金币的 10 倍", "遗忘之石：失去即结账，不再写「替换技能时」");
	assert(!lines("oblivion_stone")[0].includes("替换"), "购买不再替换技能，文案不许再提替换");
	// 本轮新增的五件：回响之铃按概率出句、破碎王冠三档合成一句、魔盒的替换经验、饥饿之匣四档、橱窗两个开关
	assertEqual(lines("echo_bell")[0], "当你进入濒死状态时，有 50% 的概率获得本局游戏你使用过且位于弃牌堆的牌", "回响之铃普通档");
	assertEqual(lines("echo_bell", "rare")[0], "当你进入濒死状态时，有 75% 的概率获得本局游戏你使用过且位于弃牌堆的牌", "稀有档只换概率");
	assertEqual(lines("echo_bell", "epic")[0], "当你进入濒死状态时，获得本局游戏你使用过且位于弃牌堆的牌", "史诗档不再写概率");
	assertEqual(lines("broken_crown")[0], "你杀死一名角色后，你增加 1 点体力上限并回复 1 点体力", "破碎王冠普通档");
	assertEqual(lines("broken_crown", "rare")[0], "你杀死一名角色后，你增加 1 点体力上限并回复 1 点体力，然后摸牌至体力上限", "稀有档补摸牌至上限");
	assertEqual(lines("broken_crown", "epic")[0], "你杀死一名角色后，你增加 1 点体力上限并回复体力至上限，然后摸体力上限张牌", "史诗档回满 + 摸上限张");
	assertEqual(lines("broken_crown").length, 1, "破碎王冠的三个配套键不得单独出行");
	assertEqual(lines("gluttonous_box")[0], "每次失去技能时获得本层胜利经验的 10 倍", "贪食魔盒");
	const hungry = lines("hungry_box").join(" / ");
	assert(hungry.includes("金币获取 -15%") && hungry.includes("经验获取 +5%"), `饥饿之匣负面档：${hungry}`);
	assertEqual(lines("hungry_box").length, 2, "饥饿之匣两行（一扣一加）");
	assertEqual(lines("hungry_box", "epic").length, 1, "史诗档只剩经验一行");
	assertEqual(lines("hungry_box", "epic")[0], "经验获取 +20%", "史诗档经验 +20%");
	assertEqual(lines("collector_showcase").join(" / "), "你可以锁定技能商店，锁定后不再刷新它的候选", "橱窗稀有档只锁技能商店");
	assertEqual(lines("collector_showcase", "epic").length, 1, "橱窗史诗档合成一条");
	assertEqual(lines("collector_showcase", "epic")[0], "你可以锁定技能或奇物商店；奇物商店锁定后可逐场购买剩余候选，全部售出自动解锁", "橱窗史诗档两店都能锁");
	return "十一件文案齐备 + 配套键不出行";
});

check("rogue_curio 新增机制：三件加伤奇物的判据与「只加一层」", () => {
	const info = skillsData.helpers.rogue_curio;
	const skillEvent = (timing, base) => ({ triggername: timing, _trigger: base });
	const phase = { name: "phase" };
	// —— 狂战徽章：本回合第一下不吃加成，第二下起才吃
	const badger = makeCarrier({ firstDamageBonus: 1 });
	const first = damageEvent({}, phase);
	assert(!info.filter(first, badger, "damageBegin1"), "第一下不该加成");
	assert(info.filter(first, badger, "damage"), "造成伤害后要武装本回合");
	info.content(skillEvent("damage", first), first, badger);
	assertEqual(badger.rogueCurioRagePhase, phase, "记的就是当前这个回合对象");
	const second = damageEvent({}, phase);
	assert(info.filter(second, badger, "damageBegin1"), "同回合第二下该加");
	info.content(skillEvent("damageBegin1", second), second, badger);
	assertEqual(second.num, 2, "加 1 点");
	const nextTurn = damageEvent({}, { name: "phase" });
	assert(!info.filter(nextTurn, badger, "damageBegin1"), "换个回合加成自然失效（比的是回合对象，不用清状态）");
	// —— 反击护符普通档：下一次 +1，吃过就没了，反复挨打也只有一层
	const amulet = makeCarrier({ hurtDamageNext: 1 });
	const hurt = damageEvent({ source: makeCarrier({}) }, phase);
	assert(info.filter(hurt, amulet, "damageEnd"), "受到伤害后触发");
	info.content(skillEvent("damageEnd", hurt), hurt, amulet);
	info.content(skillEvent("damageEnd", hurt), hurt, amulet);
	assertEqual(amulet.rogueCurioCounterNext, true, "两层还是一层");
	const paid = damageEvent({}, phase);
	info.content(skillEvent("damageBegin1", paid), paid, amulet);
	assertEqual(paid.num, 2, "下一次 +1 兑现");
	assertEqual(amulet.rogueCurioCounterNext, false, "吃过即清空");
	assert(!info.filter(damageEvent({}, phase), amulet, "damageBegin1"), "没有第二层");
	// —— 稀有档「本回合」：换回合即失效
	const rounder = makeCarrier({ hurtDamageRound: 1 });
	info.content(skillEvent("damageEnd", hurt), hurt, rounder);
	assert(info.filter(damageEvent({}, phase), rounder, "damageBegin1"), "本回合内加伤");
	assert(!info.filter(damageEvent({}, { name: "phase" }), rounder, "damageBegin1"), "下个回合不再加");
	// —— 史诗档「本局」：挨多少次都只有一层
	const guard = makeCarrier({ hurtDamageGame: 1 });
	info.content(skillEvent("damageEnd", hurt), hurt, guard);
	info.content(skillEvent("damageEnd", hurt), hurt, guard);
	const forever = damageEvent({}, phase);
	info.content(skillEvent("damageBegin1", forever), forever, guard);
	assertEqual(forever.num, 2, "本局那档也只加一层");
	// —— 血怒核心：体力闸门 + 两个响应标签 + 只对「有牌」的伤害
	assertEqual(info.ai.norespond, true, "必须声明 ai.norespond");
	assertEqual(info.ai.playernowuxie, true, "无懈可击走的是另一条路，必须一起声明");
	assertEqual(typeof info.ai.skillTagFilter, "function", "标签要配 skillTagFilter，否则体力条件形同虚设");
	const core = makeCarrier({ unrespondable: 1, unrespondableLowHp: 1, unrespondableCardDamage: 1 });
	core.hp = 2;
	core.maxHp = 4;
	assertEqual(info.ai.skillTagFilter(core, "norespond"), false, "体力恰好等于上限一半（向上取整）时还不算「低于」");
	core.hp = 1;
	assertEqual(info.ai.skillTagFilter(core, "norespond"), true, "低于一半才生效");
	assertEqual(info.ai.skillTagFilter(core, "playernowuxie"), true, "两条路必须一起封住");
	assertEqual(info.ai.skillTagFilter(core, "something_else"), false, "别的标签一律不认");
	const cardHit = damageEvent({ card: { name: "sha" } }, phase);
	assert(info.filter(cardHit, core, "damageBegin1"), "带牌造成伤害该 +1");
	info.content(skillEvent("damageBegin1", cardHit), cardHit, core);
	assertEqual(cardHit.num, 2, "此牌伤害 +1");
	assert(!info.filter(damageEvent({}, phase), core, "damageBegin1"), "纯技能伤害没有「这张牌」");
	const epic = makeCarrier({ unrespondable: 1, unrespondableCardDamage: 1 });
	assertEqual(info.ai.skillTagFilter(epic, "norespond"), true, "史诗档无条件生效");
	assert(!info.filter(damageEvent({}, phase), makeCarrier({}), "damageBegin1"), "什么奇物都没有时一行都不加");
	// 固定伤害一律不参与
	const fixed = damageEvent({ numFixed: true, card: { name: "sha" } }, phase);
	assert(!info.filter(fixed, core, "damageBegin1"), "numFixed 不加伤");
	return "狂战/反击三档/血怒双标签";
});

check("奇物橱窗：买后可锁定剩余货，跨关逐件购买，售完自动解锁", () => {
	const run = freshRun(cfg.RUN_MODE.endless);
	run.currency.gold = 10000;
	run.curios = ["collector_showcase"];
	run.curioQuality = { collector_showcase: "epic" };
	run.curioOffers = [
		{ id: "energy_core", price: 10 },
		{ id: "lucky_stone", price: 20 },
		{ id: "broken_watch", price: 30 },
	];
	const first = curioManager.buyCurio(run, "energy_core");
	assert(first.ok, "第一件能购买");
	assert(!curioManager.buyCurio(first.run, "lucky_stone").ok, "本场不能连买");
	const locked = curioManager.toggleShopLock(first.run, "curio");
	assert(locked.ok && locked.locked, "购买后仍能锁定整批剩余货");
	const afterWin = reward.settleVictory(locked.run, NOW, () => 0.999).run;
	assertEqual(afterWin.curioOffers.length, 3, "已购卡与未购卡均保留");
	assertEqual(afterWin.curioOffers[0].sold, true, "已购卡仍不可再次购买");
	assertEqual(afterWin.curioOffers[1].price, 20, "保留原价");
	assertEqual(afterWin.curioBoughtThisRound, false, "真正胜利后恢复购买额度");
	const second = curioManager.buyCurio(afterWin, "lucky_stone");
	assert(second.ok && second.run.curioShopLocked, "第二关买后仍保持锁定");
	const anotherWin = reward.settleVictory(second.run, NOW, () => 0.999).run;
	const last = curioManager.buyCurio(anotherWin, "broken_watch");
	assert(last.ok, "第三次胜利后能买最后一件");
	assertEqual(last.run.curioShopLocked, false, "整批买完自动解锁");
	assert(last.run.curioOffers.every(offer => offer.sold), "全部保留已购买展示");
	assert(!curioManager.toggleShopLock(last.run, "curio").ok, "已售罄的批次不能重新上锁");
	assert(!curioManager.buyCurio(last.run, "broken_watch").ok, "买过的卡不能重复买");
	const freshChance = reward.settleVictory(last.run, NOW, () => 0.999).run;
	assertEqual(JSON.stringify(freshChance.curioOffers), "[]", "自动解锁后，下一场照常按概率刷新");
	return "买后锁定/跨关逐件买/售完解锁/恢复概率";
});

check("奇物商店队列：旧档存货下一场胜利才上架，保留本场已购卡", () => {
	const run = {
		...freshRun(cfg.RUN_MODE.endless),
		level: BASE_LEVEL,
		currency: { gold: 9999, exp: 0 },
		curios: [],
		curioOffers: [{ id: "broken_watch", price: 10 }],
		curioOfferQueue: [[{ id: "lucky_stone", price: 20 }]],
	};
	const bought = curioManager.buyCurio(run, "broken_watch");
	assert(bought.ok, bought.error);
	assertEqual(JSON.stringify(bought.run.curioOffers), JSON.stringify([{ id: "broken_watch", price: 10, sold: true }]), "购买后先保留已购卡");
	assertEqual(bought.run.curioOfferQueue.length, 1, "旧档存货队列在胜利之前不消失");
	const advanced = reward.settleVictory(bought.run, NOW, () => 0.999).run;
	assertEqual(JSON.stringify(advanced.curioOffers), JSON.stringify([{ id: "lucky_stone", price: 20 }]), "下一场胜利提上旧档第二批");
	assertEqual(JSON.stringify(advanced.curioOfferQueue), JSON.stringify([]), "队列随之清空");
	// 刚买掉的那件即使在队列里也必须被过滤掉（已拥有不得再上架）
	const stale = { ...run, curioOfferQueue: [[{ id: "lucky_stone", price: 20 }, { id: "broken_watch", price: 30 }]] };
	const bought2 = curioManager.buyCurio(stale, "broken_watch");
	const advanced2 = reward.settleVictory(bought2.run, NOW, () => 0.999).run;
	assertEqual(JSON.stringify(advanced2.curioOffers), JSON.stringify([{ id: "lucky_stone", price: 20 }]), "刚买掉的奇物不得从队列里冒出来");
	// 没有队列时行为与原来完全一致
	const plain = { ...run, curioOfferQueue: [] };
	assertEqual(JSON.stringify(curioManager.buyCurio(plain, "broken_watch").run.curioOffers), JSON.stringify([{ id: "broken_watch", price: 10, sold: true }]), "无队列 → 留下已购卡供玩家决定是否锁定");
	// 传入的 run 绝不能被原地污染
	assertEqual(JSON.stringify(run.curioOfferQueue), JSON.stringify([[{ id: "lucky_stone", price: 20 }]]), "原 run 的队列不动");
	// 连着摇两批时第二排要排掉第一排已挂出去的货
	const offers2 = curioManager.rollCurioOffers({ ...run, curios: [] }, seq([0]), ["broken_watch"]);
	assert(!offers2.some(offer => offer.id === "broken_watch"), "exclude 生效");
	return "上架 / 过滤 / 无队列原样";
});

check("储蓄罐与遗忘之石：结算侧两处加成", () => {
	// 储蓄罐乘的是「已经拿到手的总额」，所以必须排在基础奖励入账之后；1% 向下取整
	const bank = { ...freshRun(cfg.RUN_MODE.endless), level: BASE_LEVEL, currency: { gold: 1000, exp: 0 }, curios: ["piggy_bank"] };
	const got = reward.settleVictory(bank, NOW, () => 0.999);
	const expected = BASE_GOLD + Math.floor((1000 + BASE_GOLD) * 0.01);
	assertEqual(got.gained.gold, expected, `基础 ${BASE_GOLD} + 余额抽成：${got.gained.gold}`);
	assertEqual(got.run.currency.gold, 1000 + expected, "全部入账");
	// 旧档里已有储蓄罐的，读档后同样按当前 1% 结算（效果是数据现查，不进存档）
	const savedBank = state.normalizeRun(bank);
	assertEqual(reward.settleVictory(savedBank, NOW, () => 0.999).gained.gold, expected, "旧档储蓄罐按现行 1% 结算");
	const plain = reward.settleVictory({ ...bank, curios: [] }, NOW, () => 0.999);
	assertEqual(plain.gained.gold, BASE_GOLD, "没有储蓄罐就只发基础");
	// 黄金罗盘：概率统一为「百分点累加 + 一次判定」（v13 口径），不再单独掷第二次
	const compass = { ...freshRun(cfg.RUN_MODE.endless), level: BASE_LEVEL, currency: { gold: 0, exp: 0 }, curios: ["golden_compass"] };
	// 基础线 25% + 罗盘 10 个百分点＝35%：0.3 落在两条线之间，只有罗盘能救回来
	const hitByBonus = reward.settleVictory(compass, NOW, seq([0.3, 0.999]));
	assert(hitByBonus.run.curioOffers.length > 0, "25%+10 个百分点＝35%，0.3 必须命中（基础线 25% 自己是命不中的）");
	assertEqual(hitByBonus.run.curioOfferQueue.length, 0, "一次结算只摇这一批，罗盘不再生产第二批");
	// 与旧写法的分歧点：以前「基础未中 + 第二次独立判定命中」会凭空多出一批，现在必须整体未命中
	// 线值取现算结果本身：以后改 CURIO_SHOP_RATE 时这条仍然钉在「恰好压线 → 不命中」上
	const noSecondRoll = reward.settleVictory(compass, NOW, seq([curioManager.getCurioShopChance(compass), 0]));
	assertEqual(noSecondRoll.run.curioOffers.length, 0, "第二个随机数不得再决定一次商店刷新");
	assertEqual(noSecondRoll.run.curioOfferQueue.length, 0, "同样不留队列");
	// 没有罗盘时判定线就是基础概率本身：线下一丝出货、恰好压在线上不出货（严格小于）
	const plainSave = { ...compass, curios: [] };
	assertEqual(cfg.CURIO_SHOP_RATE, 0.25, "奇物商店基础概率按本轮定为 25%");
	assert(reward.settleVictory(plainSave, NOW, seq([0.249])).run.curioOffers.length > 0, "0.249 < 25% → 出货");
	assertEqual(reward.settleVictory(plainSave, NOW, seq([0.25])).run.curioOffers.length, 0, "0.25 正压在线上 → 严格小于才命中");
	// 遗忘之石：本层基准金币 ×10，没有这块奇物返回 0
	const stone = { ...freshRun(cfg.RUN_MODE.endless), level: BASE_LEVEL, curios: ["oblivion_stone"] };
	assertEqual(curioManager.getSkillLossRewardGold(stone), BASE_GOLD * 10, "十倍本层基准金币");
	assertEqual(curioManager.getSkillLossRewardGold({ ...stone, curios: [] }), 0, "没这块石头不发钱");
	// 品质按当前档现查：遗忘之石是史诗（无更高档），数值不因品质变化
	assertEqual(curioManager.getSkillLossRewardGold({ ...stone, curioQuality: { oblivion_stone: "epic" } }), BASE_GOLD * 10, "按当前品质现查");
	return `储蓄罐 +${expected - BASE_GOLD} / 罗盘按百分点累加一次判定 / 石头 ${BASE_GOLD * 10}`;
});

check("深渊词缀追加：与常规随机同一条不放回规则", () => {
	const ids = abyssConfig.AFFIX_POOL.filter(item => item.enabled !== false).map(item => item.id);
	const added = abyss.appendAbyssAffixes(["abyss_buqu"], 1, () => 0, { mode: cfg.RUN_MODE.endless });
	assertEqual(added.length, 2, "追加一个");
	assertEqual(added[0], "abyss_buqu", "已有的排在前面、顺序不动");
	assertEqual(new Set(added).size, added.length, "不得与已随到的重复");
	assert(ids.includes(added[1]), "追加的必须在池子里");
	assertEqual(JSON.stringify(abyss.appendAbyssAffixes([], 0, () => 0, {})), JSON.stringify([]), "0 个时原样返回");
	assertEqual(JSON.stringify(abyss.appendAbyssAffixes(ids.slice(0), 3, () => 0, { mode: cfg.RUN_MODE.endless })), JSON.stringify(ids), "池子占满就不再追加，也不报错");
	// 追加结果必须能过读档清洗，否则中途刷新会被静默吃掉
	assertEqual(abyss.normalizeAbyssIds(added, { mode: cfg.RUN_MODE.endless }).length, 2, "读档清洗不吃掉追加的词缀");
	// 传入的数组不能被原地改写
	const source = ["abyss_buqu"];
	abyss.appendAbyssAffixes(source, 2, () => 0, { mode: cfg.RUN_MODE.endless });
	assertEqual(JSON.stringify(source), JSON.stringify(["abyss_buqu"]), "原数组不动");
	return `池 ${ids.length} 条，追加后 ${added.join("、")}`;
});

check("裂隙开战：敌人数可覆盖且每名都带额外词缀（31 层以下也给）", () => {
	lib.character.本体武将 = [4, "male", "qun", [], 1];
	const tier = cfg.RIFT_TIERS[1];
	const configs = enemy.createEnemyConfigs(BASE_LEVEL, cfg.RUN_MODE.endless, makeRng(5), {
		enemies: tier.enemies,
		extraAffixes: cfg.RIFT_EXTRA_AFFIXES,
	});
	assertEqual(configs.length, tier.enemies, `裂隙指定的 ${tier.enemies} 名敌人`);
	for (const entry of configs) {
		assertEqual(entry.abyss.length, cfg.RIFT_EXTRA_AFFIXES, "第 4 层本不该有词缀，裂隙必给的那条要加上");
		assert(abyssConfig.AFFIX_POOL.some(item => item.id === entry.abyss[0]), "词缀 id 合法");
	}
	// 31 层起：常规随机 + 裂隙追加，同一名敌人身上不重复。
	// rng 钉在 0 → 每名敌人都必定随到 1 条常规词缀（31% 判定必过），于是「常规 1 + 裂隙 1 = 2」是确定的
	const late = enemy.createEnemyConfigs(31, cfg.RUN_MODE.endless, seq([0]), { enemies: 2, extraAffixes: 1 });
	for (const entry of late) {
		assertEqual(entry.abyss.length, 2, `常规 1 条 + 裂隙 1 条：${entry.abyss.join(",")}`);
		assertEqual(new Set(entry.abyss).size, entry.abyss.length, "同一名敌人身上不得重复");
	}
	// 不传覆盖参数时与原来完全一致：普通战斗一行逻辑都没多走
	const plain = enemy.createEnemyConfigs(BASE_LEVEL, cfg.RUN_MODE.endless, makeRng(5));
	assertEqual(plain.length, 1, "常规第 4 关 1 名敌人");
	assertEqual(plain[0].abyss.length, 0, "常规战斗第 4 关没有词缀");
	// 经验泉的债走同一个入口
	const owed = enemy.createEnemyConfigs(BASE_LEVEL, cfg.RUN_MODE.endless, makeRng(5), { extraAffixes: cfg.SPRING_DEBT_AFFIXES });
	assertEqual(owed[0].abyss.length, cfg.SPRING_DEBT_AFFIXES, "泉水的债也按每名敌人追加");
	delete lib.character.本体武将;
	return `裂隙 ${tier.enemies} 名 / 每名 +${cfg.RIFT_EXTRA_AFFIXES} 条`;
});

// ---------------------------------------------------------------- 本轮新增：回响之铃 / 破碎王冠 / 贪食魔盒 / 饥饿之匣 / 收藏家的橱窗

/** 战斗内机制技的最小 player 桩：只带它真正会碰的几个口子，全部记账 */
function makeGrowthHero(storage) {
	const hero = {
		storage: { rogue_curio: storage },
		hp: 2,
		maxHp: 4,
		handCount: 1,
		rec: { maxHp: [], heal: [], recoverTo: [], draw: [], gained: [] },
		isAlive: () => true,
		gainMaxHp: async num => {
			hero.rec.maxHp.push(num);
			hero.maxHp += num;
		},
		recover: async num => {
			hero.rec.heal.push(num);
		},
		recoverTo: async num => {
			hero.rec.recoverTo.push(num);
		},
		countCards: () => hero.handCount,
		draw: async num => {
			hero.rec.draw.push(num);
		},
		gain: async cards => {
			hero.rec.gained.push(...(Array.isArray(cards) ? cards : [cards]));
		},
	};
	return hero;
}

await checkAsync("回响之铃：只记「使用」的实体牌，濒死时按概率收回弃牌堆里的那几张", async () => {
	const info = skillsData.helpers.rogue_curio;
	const originalPosition = mockGet.position;
	// 照本体 get.position 的口径：结算区（ordering）不带 true 时算 "d"、带 true 时是独立的 "o"
	mockGet.position = (card, ordering) => {
		if (!card?.__area) {
			return null;
		}
		if (card.__area === "ordering") {
			return ordering ? "o" : "d";
		}
		return card.__area === "discard" ? "d" : card.__area === "hand" ? "h" : null;
	};
	const withRandom = async (value, fn) => {
		const original = Math.random;
		Math.random = () => value;
		try {
			return await fn();
		} finally {
			Math.random = original;
		}
	};
	try {
		const hero = makeGrowthHero({ dyingRecallChance: 1 });
		const useEvent = card => ({ name: "useCard", card });
		// 记账：实体牌进账本、同一张不重复记（转化/虚拟牌没有实体，回不到弃牌堆，不记账）
		const sha = realCard("sha");
		const virtual = { name: "tao" };
		await info.content({ triggername: "useCard", _trigger: useEvent(sha) }, useEvent(sha), hero);
		await info.content({ triggername: "useCard", _trigger: useEvent(sha) }, useEvent(sha), hero);
		await info.content({ triggername: "useCard", _trigger: useEvent(virtual) }, useEvent(virtual), hero);
		assertEqual(hero.rogueCurioUsedCards.length, 1, "只记实体牌且不重复");
		assertEqual(hero.rogueCurioUsedCards[0], sha, "记的就是出牌事件上的那张实体牌");
		assert(!info.filter({ name: "useCard", card: sha }, makeGrowthHero({}), "useCard"), "没有回响之铃不监听出牌");
		// 濒死：只收「此刻真位于弃牌堆」的那几张；手上 / 结算区里飞着 / 已移出游戏的都不算
		const inDiscard = realCard("jiu");
		inDiscard.__area = "discard";
		const inHand = realCard("shan");
		inHand.__area = "hand";
		const inFlight = realCard("juedou");
		inFlight.__area = "ordering";
		const gone = realCard("wuxie");
		hero.rogueCurioUsedCards = [inDiscard, inHand, inFlight, gone];
		hero.hp = 0;
		assert(info.filter({ name: "dying" }, hero, "dying"), "只带回响之铃也要进濒死分支");
		await info.content({ triggername: "dying", _trigger: { name: "dying" } }, { name: "dying" }, hero);
		assertEqual(hero.rec.gained.length, 1, "只回收真在弃牌堆里的那一张（结算区里飞着的不算）");
		assertEqual(hero.rec.gained[0], inDiscard, "收的就是躺在弃牌堆里的那张");
		// 与气息腰带共用同一个濒死时机：腰带用过之后，回响照常还能响
		const both = makeGrowthHero({ dyingSave: 1, dyingRecallChance: 1 });
		both.hp = 0;
		both.rogueCurioUsedCards = [inDiscard];
		await info.content({ triggername: "dying", _trigger: { name: "dying" } }, { name: "dying" }, both);
		assertEqual(both.rec.recoverTo.join(","), "1", "腰带照旧救回 1 点");
		assertEqual(both.rec.gained.length, 1, "同一击里回响也照常回收");
		assertEqual(both.storage.rogue_curio_belt, true, "腰带的「已用过」标记照旧");
		assert(info.filter({ name: "dying" }, both, "dying"), "腰带用过后，只带回响的濒死仍要进分支");
		assert(!info.filter({ name: "dying" }, makeGrowthHero({ dyingRecallChance: 1 }), "dying"), "没到濒死（hp>0）不触发");
		// 概率档：0.5 时 0.9 掷不中、0.1 掷中
		const lucky = makeGrowthHero({ dyingRecallChance: 0.5 });
		lucky.hp = 0;
		lucky.rogueCurioUsedCards = [inDiscard];
		await withRandom(0.9, () => info.content({ triggername: "dying", _trigger: { name: "dying" } }, { name: "dying" }, lucky));
		assertEqual(lucky.rec.gained.length, 0, "50% 档掷到 0.9 不回收");
		await withRandom(0.1, () => info.content({ triggername: "dying", _trigger: { name: "dying" } }, { name: "dying" }, lucky));
		assertEqual(lucky.rec.gained.length, 1, "50% 档掷到 0.1 照常回收");
		return "记账 1 张 / 只收弃牌堆 / 概率两掷 / 与腰带同击共存";
	} finally {
		if (originalPosition === undefined) {
			delete mockGet.position;
		} else {
			mockGet.position = originalPosition;
		}
	}
});

await checkAsync("破碎王冠：击杀后涨上限、回血、按（涨过的）上限摸牌", async () => {
	const info = skillsData.helpers.rogue_curio;
	const dieEvent = dead => ({ name: "die", player: dead, source: null });
	// filter：自己杀死的才触发；自己阵亡不算；没这块王冠不触发
	const plain = makeGrowthHero({ killGainMaxHp: 1, killHeal: 1 });
	assert(info.filter(dieEvent(makeGrowthHero({})), plain, "die"), "杀死别人应触发");
	assert(!info.filter(dieEvent(plain), plain, "die"), "自己阵亡不算击杀");
	assert(!info.filter(dieEvent(makeGrowthHero({})), makeGrowthHero({}), "die"), "没王冠不触发");
	// 普通档：+1 上限、回 1 血、不摸牌
	await info.content({ triggername: "die", _trigger: dieEvent({}) }, dieEvent({}), plain);
	assertEqual(plain.maxHp, 5, "体力上限 4→5");
	assertEqual(plain.rec.maxHp.join(","), "1", "涨 1 点上限（走本体的 gainMaxHp）");
	assertEqual(plain.rec.heal.join(","), "1", "回复 1 点体力");
	assertEqual(plain.rec.draw.length, 0, "普通档不摸牌");
	// 稀有档：+1 上限、回 1 血、手牌补至上限（手牌 1、上限 5 → 摸 4）
	const rare = makeGrowthHero({ killGainMaxHp: 1, killHeal: 1, killDrawToMaxHp: 1 });
	await info.content({ triggername: "die", _trigger: dieEvent({}) }, dieEvent({}), rare);
	assertEqual(rare.rec.draw.join(","), "4", "摸牌至体力上限：手牌 1、上限 5 → 补 4 张");
	assertEqual(rare.rec.heal.join(","), "1", "稀有档照旧回 1 点");
	// 手牌已超过上限时不倒扣也不摸牌
	const full = makeGrowthHero({ killGainMaxHp: 1, killDrawToMaxHp: 1 });
	full.handCount = 9;
	await info.content({ triggername: "die", _trigger: dieEvent({}) }, dieEvent({}), full);
	assertEqual(full.rec.draw.length, 0, "手牌已超上限就不摸");
	// 史诗档：回复至上限 + 摸「体力上限」张
	const epic = makeGrowthHero({ killGainMaxHp: 1, killHealToMax: 1, killDrawMaxHp: 1 });
	await info.content({ triggername: "die", _trigger: dieEvent({}) }, dieEvent({}), epic);
	assertEqual(epic.rec.recoverTo.join(","), "5", "回复体力至涨过之后的上限 5");
	assertEqual(epic.rec.draw.join(","), "5", "摸「体力上限」张牌");
	return "普通回 1 / 稀有补至手牌上限 / 史诗回满 + 摸上限张";
});

check("饥饿之匣与贪食魔盒：金币换经验、失去技能发经验", () => {
	const at = quality => curioManager.getCurioEffectAt("hungry_box", quality);
	assertEqual(at("negative").goldRate, -0.15, "负面档金币 -15%");
	assertEqual(at("negative").expRate, 0.05, "负面档经验 +5%");
	assertEqual(at("common").goldRate, -0.1, "普通档金币 -10%");
	assertEqual(at("rare").goldRate, -0.05, "稀有档金币 -5%");
	assertEqual(at("epic").goldRate, undefined, "史诗档不再扣金币");
	assertEqual(at("epic").expRate, 0.2, "史诗档经验 +20%");
	// 结算里金币与经验各按自己的倍率走：负面档金币缩水、经验变多
	const hungry = { ...freshRun(cfg.RUN_MODE.endless), level: BASE_LEVEL, curios: ["hungry_box"] };
	const gained = reward.settleVictory(hungry, NOW, () => 0.999).gained;
	assertEqual(gained.gold, Math.round(BASE_GOLD * 0.85), `金币 -15%：${gained.gold}`);
	assertEqual(gained.exp, Math.round(BASE_EXP * 1.05), `经验 +5%：${gained.exp}`);
	const maxed = { ...hungry, curioQuality: { hungry_box: "epic" } };
	const maxedGained = reward.settleVictory(maxed, NOW, () => 0.999).gained;
	assertEqual(maxedGained.gold, BASE_GOLD, "史诗档金币不再打折扣");
	assertEqual(maxedGained.exp, Math.round(BASE_EXP * 1.2), "史诗档经验 +20%");
	// 贪食魔盒：本层基准经验 ×10，与遗忘之石的金币同一条口径；没有它返回 0
	const box = { ...freshRun(cfg.RUN_MODE.endless), level: BASE_LEVEL, curios: ["gluttonous_box"] };
	assertEqual(curioManager.getSkillLossRewardExp(box), BASE_EXP * 10, "十倍本层基准经验");
	assertEqual(curioManager.getSkillLossRewardExp({ ...box, curios: [] }), 0, "没有魔盒不发经验");
	return `饥饿之匣 ${gained.gold}/${gained.exp} → 史诗 ${maxedGained.gold}/${maxedGained.exp}；魔盒 ${BASE_EXP * 10}`;
});

check("收藏家的橱窗：锁的能力闸门、结算保留与存档清洗", () => {
	const rare = { ...freshRun(cfg.RUN_MODE.endless), curios: ["collector_showcase"] };
	const epic = { ...rare, curioQuality: { collector_showcase: "epic" } };
	assert(curioManager.canLockShop(rare, "skill"), "稀有档能锁技能商店");
	assert(!curioManager.canLockShop(rare, "curio"), "稀有档锁不了奇物商店");
	assert(curioManager.canLockShop(epic, "curio"), "史诗档能锁奇物商店");
	assert(!curioManager.canLockShop({ ...rare, curios: [] }, "skill"), "没持有橱窗时没有锁定能力");
	// 切换：纯函数、不原地改 run；没能力时 ok:false 且零副作用。
	// 空技能货架不允许上锁（与奇物同一道闸门），所以先补一张未售候选
	const lockable = { ...rare, shopOffers: [{ id: SKILL_B, price: 40, sold: false }] };
	assert(!curioManager.toggleShopLock(rare, "skill").ok, "空技能货架不允许锁定");
	const on = curioManager.toggleShopLock(lockable, "skill");
	assert(on.ok && on.locked === true && on.run.skillShopLocked === true, "锁上");
	assert(on.run !== lockable, "返回的是新对象，不与传入的 run 共享引用");
	assertEqual(lockable.skillShopLocked, false, "传入的 run 不被原地改写（还是未锁的旧状态）");
	const off = curioManager.toggleShopLock(on.run, "skill");
	assert(off.ok && off.locked === false && off.run.skillShopLocked === false, "再切一下解锁");
	assert(!curioManager.toggleShopLock(rare, "curio").ok, "稀有档切奇物锁被拒");
	assert(!curioManager.isShopLocked({ ...rare, skillShopLocked: true, curios: [] }, "skill"), "没有对应能力的锁定字段一律不算锁着");
	// 结算：技能锁 → 候选连价保留、买过的那张继续显示「已购买」、免费刷新次数照常刷新
	const locked = {
		...rare,
		level: BASE_LEVEL,
		skills: [SKILL_A],
		shopOffers: [{ id: SKILL_B, price: 40, sold: true }, { id: SKILL_C, price: 50, sold: false }],
		skillShopLocked: true,
		shopRefreshesRemaining: 0,
	};
	const kept = reward.settleVictory(locked, NOW, () => 0.999).run;
	assertEqual(kept.shopOffers.map(offer => `${offer.id}:${offer.price}`).join(","), `${SKILL_B}:40,${SKILL_C}:50`, "锁着的技能商店不刷新（连价保留）");
	assertEqual(
		kept.shopOffers.map(offer => `${offer.id}:${offer.sold ? "已购买" : "可售"}${offer.carried ? "+留货" : ""}`).join(","),
		`${SKILL_B}:已购买+留货,${SKILL_C}:可售`,
		"买过的那张留在货架上继续显示已购买，并打上留货标记"
	);
	assertEqual(shop.getPurchasedCount(kept), 0, "留货的已购买不算本局购买数（否则一张残卡就把整排货架连同刷新锁死）");
	assert(shop.checkSkillPurchase(kept, SKILL_C).ok, "留下来的另一张在新的一关仍然买得动");
	assertEqual(kept.shopRefreshesRemaining, cfg.SKILL_REFRESH_PER_LEVEL, "免费的刷新次数照常刷新（规格原话：只是三个技能不刷新）");
	assertEqual(reward.settleVictory({ ...locked, skillShopLocked: false }, NOW, () => 0.999).run.shopOffers.length, 0, "没锁就照旧清空（与原来逐字一致）");
	// 用户定稿（2026-10-06）：买了 A 再锁 → 下一关 A 仍在货架上，和正常购买一样显示「已购买」、点不动，
	// 另外两张连同刷新额度都是新的一局（旧写法把 sold 一律清零，才会出现「已拥有的技能显示成可购买」）
	const boughtThenLocked = {
		...rare,
		level: BASE_LEVEL,
		skills: [SKILL_A],
		shopOffers: [
			{ id: SKILL_A, price: 40, sold: true },
			{ id: SKILL_B, price: 50, sold: false },
			{ id: SKILL_C, price: 60, sold: false },
		],
		skillShopLocked: true,
	};
	const afterBuy = reward.settleVictory(boughtThenLocked, NOW, () => 0.999).run;
	assertEqual(afterBuy.shopOffers.map(offer => `${offer.id}:${offer.price}`).join(","), `${SKILL_A}:40,${SKILL_B}:50,${SKILL_C}:60`, "三张候选一张不少、价格原样（下次刷新时那个技能仍保留）");
	assertEqual(afterBuy.shopOffers.map(offer => (offer.sold ? "已购买" : "可售")).join(","), "已购买,可售,可售", "买过的 A 显示成与正常购买一样的已购买");
	assert(!shop.checkSkillPurchase(afterBuy, SKILL_A).ok, "A 买不动（不会再进替换页被「已拥有该技能」挡回来）");
	assert(shop.checkSkillPurchase(afterBuy, SKILL_B).ok, "留下的候选在新的一关确实买得动");
	// 新的一关再买 B：额度用光 → C 被挡；再通关时 A、B 都算留货，第三关又是新的一次进店
	const boughtAgain = shop.buySkill(afterBuy, SKILL_B, null, { isSkillAllowed: () => true }).run;
	assertEqual(shop.getPurchasedCount(boughtAgain), 1, "本局买过 B → 购买额度用光");
	assertEqual(shop.checkSkillPurchase(boughtAgain, SKILL_C).error, `本局最多只能购买 ${cfg.SKILL_PURCHASE_COUNT} 个技能`, "C 被本局额度挡住");
	const secondKeep = reward.settleVictory(boughtAgain, NOW, () => 0.999).run;
	assertEqual(
		secondKeep.shopOffers.map(offer => `${offer.id}:${offer.sold ? "已购买" : "可售"}${offer.carried ? "+留货" : ""}`).join(","),
		`${SKILL_A}:已购买+留货,${SKILL_B}:已购买+留货,${SKILL_C}:可售`,
		"两关各自买掉的都留货、都不吃新的一局的额度"
	);
	assertEqual(shop.getPurchasedCount(secondKeep), 0, "第三关又是新的一次进店");
	// 读档清洗必须原样带回留货标记，否则重进商店它又算成本局买的、整排货架被锁死
	const reloadedKeep = state.normalizeRun(secondKeep, { isSkillAllowed: () => true });
	assertEqual(reloadedKeep.shopOffers.map(offer => `${offer.id}:${offer.carried ? "留货" : "新"}`).join(","), `${SKILL_A}:留货,${SKILL_B}:留货,${SKILL_C}:新`, "normalizeRun 原样带回 carried");
	assertEqual(shop.getPurchasedCount(reloadedKeep), 0, "重载后留货的仍然不算本局购买数");
	// 结算：奇物锁 → 整批不掷不置空（rng 钉在 0.999，正常路径会把旧批次清空）
	const curioLocked = {
		...epic,
		level: BASE_LEVEL,
		curioShopLocked: true,
		curioOffers: [{ id: "lucky_stone", price: 66 }],
		curioOfferQueue: [[{ id: "piggy_bank", price: 77 }]],
	};
	const keptCurio = reward.settleVictory(curioLocked, NOW, () => 0.999).run;
	assertEqual(JSON.stringify(keptCurio.curioOffers), JSON.stringify([{ id: "lucky_stone", price: 66 }]), "锁着就原样留货（不因战斗结束的随机刷新被置空）");
	assertEqual(keptCurio.curioOfferQueue.length, 1, "黄金罗盘压着的队列也不动");
	assertEqual(reward.settleVictory({ ...curioLocked, curioShopLocked: false }, NOW, () => 0.999).run.curioOffers.length, 0, "没锁照旧置空");
	// 锁着但货架本来就空：不拦（否则玩家被锁在空货架上，分区一隐藏连解锁图标都点不到）
	const emptyLocked = { ...curioLocked, curioOffers: [], curioOfferQueue: [] };
	assertEqual(reward.settleVictory(emptyLocked, NOW, seq([0, 0])).run.curioOffers.length, cfg.CURIO_OFFER_COUNT, "空货架时照常摇新货");
	// 存档清洗：只有「当前确实持有对应能力」才保留锁字段；技能锁还要求批次里还有未售候选
	const lockableOffers = [{ id: SKILL_B, price: 40, sold: false }];
	const epicCleaned = state.normalizeRun({ ...epic, shopOffers: lockableOffers, skillShopLocked: true, curioShopLocked: true });
	assertEqual(epicCleaned.skillShopLocked, true, "史诗档技能锁保留（还有未售候选）");
	assertEqual(epicCleaned.curioShopLocked, true, "史诗档奇物锁保留");
	const rareCleaned = state.normalizeRun({ ...rare, shopOffers: lockableOffers, skillShopLocked: true, curioShopLocked: true });
	assertEqual(rareCleaned.skillShopLocked, true, "稀有档技能锁保留（还有未售候选）");
	assertEqual(rareCleaned.curioShopLocked, false, "稀有档奇物锁清零（还锁不了奇物商店）");
	// 旧档兜底：技能批次全售罄（carried 也算）或空货架时读档解锁，已购买卡片原样保留
	const soldCleaned = state.normalizeRun({
		...rare,
		shopOffers: [
			{ id: SKILL_A, price: 40, sold: true, carried: true },
			{ id: SKILL_B, price: 50, sold: true, carried: true },
			{ id: SKILL_C, price: 60, sold: true },
		],
		skillShopLocked: true,
	});
	assertEqual(soldCleaned.skillShopLocked, false, "技能批次全售罄 → 读档自动解锁");
	assertEqual(soldCleaned.shopOffers.length, 3, "三张已购买卡仍保留（读档不提前重掷）");
	const emptyCleaned = state.normalizeRun({ ...rare, shopOffers: [], skillShopLocked: true });
	assertEqual(emptyCleaned.skillShopLocked, false, "空技能货架 → 读档自动解锁");
	const noneCleaned = state.normalizeRun({ ...freshRun(cfg.RUN_MODE.endless), skillShopLocked: true, curioShopLocked: true });
	assertEqual(noneCleaned.skillShopLocked, false, "没橱窗时技能锁清零");
	assertEqual(noneCleaned.curioShopLocked, false, "没橱窗时奇物锁清零");
	assertEqual(freshRun(cfg.RUN_MODE.endless).skillShopLocked, false, "旧档（缺字段）默认未锁定");
	// v15：🔒 期间免费刷新在逻辑层被拒（按钮同时置灰，冒烟用例点真实按钮验），🔓 才放行；
	// 奇物锁管不到技能刷新这一条入口
	const refreshBase = { ...rare, level: BASE_LEVEL, currency: { gold: 9999, exp: 0 } };
	const refreshRun = { ...refreshBase, shopOffers: shop.rollSkillOffers(refreshBase, makeRng(21), [], skillsData.pool) };
	const lockedRun = { ...refreshRun, skillShopLocked: true };
	const denied = shop.refreshSkillOffers(lockedRun, makeRng(22), [], skillsData.pool);
	assert(!denied.ok && denied.error.includes("锁定"), `锁着技能商店时刷新被拒：${denied.error}`);
	assertEqual(denied.run, undefined, "被拒时不返回改过的 run");
	assertEqual(denied.offers, undefined, "被拒时不返回新候选（重掷会把 sold 清成 false，那是绕过购买上限的口子）");
	assertEqual(shop.getRefreshesRemaining(lockedRun), cfg.SKILL_REFRESH_PER_LEVEL, "锁着时被拒，次数一次都没少");
	assertEqual(shop.getRefreshesRemaining(shop.refreshSkillOffers(refreshRun, makeRng(23), [], skillsData.pool).run), cfg.SKILL_REFRESH_PER_LEVEL - 1, "解锁状态才放行，并扣掉一次");
	assert(shop.refreshSkillOffers({ ...refreshRun, curioShopLocked: true }, makeRng(24), [], skillsData.pool).ok, "只锁奇物商店不该拦住技能刷新");
	return "能力闸门 / 切换不变异 / 两类商店的结算保留（买过的留货并显示已购买） / 清洗按能力闸门 / 🔒 期间刷新被逻辑层拒绝";
});

check("技能橱窗：整批售罄立即解锁，carried 计入，下一关才刷新", () => {
	const runBase = {
		...freshRun(cfg.RUN_MODE.endless),
		level: BASE_LEVEL,
		currency: { gold: 9999, exp: 0 },
		curios: ["collector_showcase"],
		skillShopLocked: true,
		shopOffers: [SKILL_A, SKILL_B, SKILL_C].map((id, index) => ({ id, price: 40 + index * 10, sold: false, carried: false })),
		shopRefreshesRemaining: cfg.SKILL_REFRESH_PER_LEVEL,
	};
	const buy = (run, id) => shop.buySkill(run, id, null, { isSkillAllowed: () => true });

	// 第一关买 A：还有两张未售 → 锁保留
	const first = buy(runBase, SKILL_A);
	assert(first.ok, first.error ?? "第一关应买到 A");
	assertEqual(first.run.skillShopLocked, true, "还有两张未买 → 保持锁定");
	assertEqual(shop.getPurchasedCount(first.run), 1, "本局购买额度用掉");
	assert(!shop.refreshSkillOffers(first.run, makeRng(1), [], skillsData.pool).ok, "买过后不能刷新");
	// 下一关：A 留货，B/C 可售
	const secondLevel = reward.settleVictory(first.run, NOW, () => 0.999).run;
	assertEqual(secondLevel.skillShopLocked, true, "跨关保留锁定");
	assertEqual(
		secondLevel.shopOffers.map(offer => `${offer.id}:${offer.sold ? "已购买" : "可售"}${offer.carried ? "+留货" : ""}`).join(","),
		`${SKILL_A}:已购买+留货,${SKILL_B}:可售,${SKILL_C}:可售`,
		"A 留货，B/C 可售",
	);
	assertEqual(shop.getPurchasedCount(secondLevel), 0, "留货不算本局额度");
	// 第二关买 B：还剩 C → 锁保留
	const second = buy(secondLevel, SKILL_B);
	assert(second.ok, second.error ?? "第二关应买到 B");
	assertEqual(second.run.skillShopLocked, true, "还剩 C 未买 → 保持锁定");
	const thirdLevel = reward.settleVictory(second.run, NOW, () => 0.999).run;
	assertEqual(
		thirdLevel.shopOffers.map(offer => `${offer.sold ? "已购买" : "可售"}${offer.carried ? "+留货" : ""}`).join(","),
		"已购买+留货,已购买+留货,可售",
		"两关买掉的都留货",
	);
	// 第三关买 C：三张（含两张 carried）全部 sold → 立即解锁
	const third = buy(thirdLevel, SKILL_C);
	assert(third.ok, third.error ?? "第三关应买到 C");
	assertEqual(third.run.skillShopLocked, false, "整批（含 carried）售罄 → 立即解锁");
	assertEqual(third.run.shopOffers.length, cfg.SKILL_OFFER_COUNT, "当前商店仍保留三张卡");
	assertEqual(third.run.shopOffers.every(offer => offer.sold), true, "三张都显示已购买");
	assertEqual(shop.getPurchasedCount(third.run), 1, "本局只算 C 这一张");
	assert(!shop.refreshSkillOffers(third.run, makeRng(2), [], skillsData.pool).ok, "解锁后本局仍不能刷新（购买上限）");
	const relock = curioManager.toggleShopLock(third.run, "skill");
	assert(!relock.ok && relock.error.includes("售罄"), "售罄批次不能重新锁定");
	// 下一次真正胜利：旧批次清空，之后进店现摇新一批
	const nextVictory = reward.settleVictory(third.run, NOW, () => 0.999).run;
	assertEqual(nextVictory.shopOffers.length, 0, "下一次胜利后清空旧批次");
	assertEqual(nextVictory.skillShopLocked, false, "保持解锁");
	const fresh = shop.rollSkillOffers(nextVictory, makeRng(3), [], skillsData.pool);
	assertEqual(fresh.length, cfg.SKILL_OFFER_COUNT, "下一关能摇满新候选");
	assert(fresh.every(offer => !offer.sold), "新候选全是未购买");
	assertEqual(shop.getPurchasedCount({ ...nextVictory, shopOffers: fresh }), 0, "新的一关额度恢复");

	// 少候选：两张批次买完才算售罄；单张批次买完立即售罄
	const twoOffers = {
		...runBase,
		shopOffers: [
			{ id: SKILL_A, price: 40, sold: false, carried: false },
			{ id: SKILL_B, price: 50, sold: false, carried: false },
		],
	};
	const twoFirst = buy(twoOffers, SKILL_A);
	assertEqual(twoFirst.run.shopOffers.length, 2, "夹具：实际只有两张候选");
	assertEqual(twoFirst.run.skillShopLocked, true, "两张批次买一张后仍锁着");
	const twoNext = reward.settleVictory(twoFirst.run, NOW, () => 0.999).run;
	const twoSecond = buy(twoNext, SKILL_B);
	assertEqual(twoSecond.run.skillShopLocked, false, "两张批次买完按实际数量判断售罄");
	const oneOffer = { ...runBase, shopOffers: [{ id: SKILL_A, price: 40, sold: false, carried: false }] };
	assertEqual(buy(oneOffer, SKILL_A).run.skillShopLocked, false, "单张批次买完立即解锁");

	// 旧档全售罄（全是 carried）只解锁、保留已购买卡；读档后手动刷新不得提前换货
	const carriedOnly = state.normalizeRun({
		...runBase,
		skillShopLocked: true,
		shopOffers: [SKILL_A, SKILL_B, SKILL_C].map(id => ({ id, price: 40, sold: true, carried: true })),
	});
	assertEqual(carriedOnly.skillShopLocked, false, "旧档全售罄 → 读档自动解锁");
	assertEqual(carriedOnly.shopOffers.length, 3, "旧档三张已购买卡原样保留");
	assertEqual(shop.getPurchasedCount(carriedOnly), 0, "夹具：全是 carried，本局购买数为 0");
	const blockedRefresh = shop.refreshSkillOffers(carriedOnly, makeRng(9), [], skillsData.pool);
	assert(!blockedRefresh.ok, "旧档解锁后不能手动刷新提前换货");
	assertEqual(blockedRefresh.offers, undefined, "被拒时不返回新候选");
	assertEqual(shop.getRefreshesRemaining(carriedOnly), cfg.SKILL_REFRESH_PER_LEVEL, "被拒时不扣刷新次数");
	const carriedNext = reward.settleVictory(carriedOnly, NOW, () => 0.999).run;
	assertEqual(carriedNext.shopOffers.length, 0, "下一次胜利后才清空售罄批次");
	assertEqual(carriedNext.skillShopLocked, false, "保持解锁");

	// 结算兜底：旧档仍带 true + 全售罄时，清空批次与解锁必须同时发生
	const soldOutLocked = {
		...runBase,
		skillShopLocked: true,
		shopOffers: [SKILL_A, SKILL_B, SKILL_C].map(id => ({ id, price: 40, sold: true, carried: true })),
	};
	const settledSoldOut = reward.settleVictory(soldOutLocked, NOW, () => 0.999).run;
	assertEqual(settledSoldOut.shopOffers.length, 0, "结算兜底：售罄批次必须被清空，不能只改锁字段");
	assertEqual(settledSoldOut.skillShopLocked, false, "结算兜底：售罄批次同时解锁");
	// 空候选：读档解锁、下一场胜利兜底解锁、不允许上锁
	const emptyLocked = { ...runBase, shopOffers: [] };
	assertEqual(state.normalizeRun(emptyLocked).skillShopLocked, false, "空候选读档自动解锁");
	assert(!curioManager.toggleShopLock({ ...emptyLocked, skillShopLocked: false }, "skill").ok, "空候选不允许锁定");
	const emptySettled = reward.settleVictory(emptyLocked, NOW, () => 0.999).run;
	assertEqual(emptySettled.skillShopLocked, false, "空候选下一场胜利兜底解锁");
	assertEqual(emptySettled.shopOffers.length, 0, "空候选不强行造货");
	return "三关三买 → 自动解锁 / carried 计入 / 当前卡保留 / 旧档只解锁不重掷 / 下一关刷新";
});

check("技能橱窗：购买价值与当前可购买分离，外部获得不占次数", () => {
	const base = {
		...freshRun(cfg.RUN_MODE.endless),
		level: BASE_LEVEL,
		currency: { gold: 9999, exp: 0 },
		curios: ["collector_showcase"],
		skillShopLocked: true,
		shopOffers: [SKILL_A, SKILL_B, SKILL_C].map((id, index) => ({ id, price: 40 + index * 10, sold: false, carried: false })),
		shopRefreshesRemaining: cfg.SKILL_REFRESH_PER_LEVEL,
	};
	const buy = (run, id) => shop.buySkill(run, id, null, { isSkillAllowed: () => true });

	// 场景1：买 A 后本局额度用光 + 金币不足，B/C 仍有购买价值 → 锁必须保持
	const afterA = buy(base, SKILL_A).run;
	assertEqual(afterA.skillPurchasedThisRound, 1, "成功购买计数 +1");
	const poorRun = { ...afterA, currency: { ...afterA.currency, gold: 0 } };
	assertEqual(shop.getSkillOfferState(poorRun, poorRun.shopOffers[1], { isSkillAllowed: () => true }), "poor", "金币不足时当前状态是 poor");
	assert(shop.canSkillOfferStillBeBought(poorRun, poorRun.shopOffers[1], { isSkillAllowed: () => true }), "B 仍有购买价值");
	assert(shop.hasBuyableSkillOffer(poorRun, { isSkillAllowed: () => true }), "整批仍有购买价值");
	assertEqual(poorRun.skillShopLocked, true, "额度用光/金币不足不能解除锁定");
	const failed = buy({ ...poorRun, skillPurchasedThisRound: 0 }, SKILL_B);
	assert(!failed.ok && failed.run === undefined, "余额不足购买失败不返回改过的 run");
	assertEqual(shop.getPurchasedCount(poorRun), 1, "失败购买不增加计数");
	const nextLevel = reward.settleVictory(poorRun, NOW, () => 0.999).run;
	assertEqual(nextLevel.skillPurchasedThisRound, 0, "真正胜利后购买次数归零");
	assertEqual(nextLevel.skillShopLocked, true, "B/C 仍有价值 → 跨关保持锁定");
	const boughtB = buy({ ...nextLevel, currency: { gold: 9999, exp: 0 } }, SKILL_B);
	assert(boughtB.ok, boughtB.error ?? "下一关应能购买 B");
	assertEqual(boughtB.run.skillPurchasedThisRound, 1, "下一关购买计数重新从 1 开始");

	// 场景2：买 A → 外部获得 B → C 未售 → 不得提前解锁；下一关买 C 后自动解锁
	const externalB = {
		...afterA,
		skillInventory: [...(afterA.skillInventory ?? []), SKILL_B],
	};
	assertEqual(externalB.shopOffers.find(offer => offer.id === SKILL_B).sold, false, "外部获得不写 sold");
	assertEqual(externalB.skillPurchasedThisRound, 1, "外部获得不占本局购买次数");
	assertEqual(shop.getSkillOfferState(externalB, externalB.shopOffers[1], { isSkillAllowed: () => true }), "owned", "B 显示已拥有");
	assertEqual(shop.getSkillOfferState(externalB, externalB.shopOffers[2], { isSkillAllowed: () => true }), "soldOut", "C 受本局额度限制，当前买不了");
	assert(shop.hasBuyableSkillOffer(externalB, { isSkillAllowed: () => true }), "C 仍有购买价值");
	assertEqual(externalB.skillShopLocked, true, "有 C 在售 → 锁保持");
	const externalNext = reward.settleVictory(externalB, NOW, () => 0.999).run;
	assertEqual(externalNext.skillShopLocked, true, "跨关仍锁着");
	const boughtC = buy({ ...externalNext, currency: { gold: 9999, exp: 0 } }, SKILL_C);
	assert(boughtC.ok, boughtC.error ?? "下一关应能购买 C");
	assertEqual(boughtC.run.skillPurchasedThisRound, 1, "买 C 计一次");
	assertEqual(boughtC.run.skillShopLocked, false, "A/C 已购、B 已拥有 → 无购买价值 → 自动解锁");
	assertEqual(boughtC.run.shopOffers.length, 3, "当前批次仍保留");
	assertEqual(boughtC.run.shopOffers.find(offer => offer.id === SKILL_B).sold, false, "外部获得的 B 从未被写成已购买");
	assert(!curioManager.toggleShopLock(boughtC.run, "skill", {
		canLockSkill: run => shop.hasBuyableSkillOffer(run, { isSkillAllowed: () => true }),
	}).ok, "已无购买价值时禁止重新锁定");

	// 失去 B：sold 仍是 false；额度可用时恢复可购买，不永久标记已购买
	const lostB = {
		...boughtC.run,
		skillInventory: boughtC.run.skillInventory.filter(id => id !== SKILL_B),
	};
	assert(shop.canSkillOfferStillBeBought(lostB, lostB.shopOffers[1], { isSkillAllowed: () => true }), "失去后 B 恢复购买价值");
	assertEqual(
		shop.getSkillOfferState({ ...lostB, skillPurchasedThisRound: 0 }, lostB.shopOffers[1], { isSkillAllowed: () => true }),
		"buy",
		"失去后额度可用时恢复购买",
	);
	assertEqual(lostB.shopOffers.find(offer => offer.id === SKILL_B).sold, false, "失去技能不会把候选写成已购买");

	// 技能合法性：提供 gate 时才判非法；拿不到 gate 不擅自判非法
	const illegalRun = { ...afterA, currency: { gold: 9999, exp: 0 }, skillShopLocked: true };
	assert(!shop.canSkillOfferStillBeBought(illegalRun, illegalRun.shopOffers[1], { isSkillAllowed: id => id !== SKILL_B }), "gate 判非法时无购买价值");
	assert(shop.canSkillOfferStillBeBought(illegalRun, illegalRun.shopOffers[1]), "拿不到 gate 时不判非法");
	const gateKeep = reward.settleVictory(illegalRun, NOW, () => 0.999).run;
	assertEqual(gateKeep.skillShopLocked, true, "结算层拿不到 gate → 保守保留锁定");
	// 闯关满槽但未指定/给错替换技能：购买失败，次数不增加
	const challengeBase = {
		...freshRun(cfg.RUN_MODE.challenge),
		currency: { gold: 500, exp: 0 },
		skills: [SKILL_A, SKILL_B, SKILL_C],
		skillInventory: [SKILL_A, SKILL_B, SKILL_C],
		shopOffers: [{ id: "test_skill_d", price: 10, sold: false, carried: false }],
	};
	const canceled = shop.buySkill(challengeBase, "test_skill_d", null, { isSkillAllowed: () => true });
	assert(!canceled.ok, "闯关满槽未指定替换技能 → 拒绝");
	assertEqual(shop.getPurchasedCount(challengeBase), 0, "取消/失败不增加购买次数");
	return "购买价值/当前可购买分离 / 额度金币不足不解锁 / 外部获得不写 sold / 失去恢复 / gate 缺失保守 / 取消不计数";
});

check("技能商店：独立购买计数迁移与候选清洗", () => {
	const rawRun = patch => {
		const run = { ...freshRun(cfg.RUN_MODE.endless) };
		delete run.skillPurchasedThisRound;
		return { ...run, ...patch };
	};
	// 旧档的已购买候选被 isSkillAllowed 过滤掉，购买次数仍要从过滤前迁移出来
	const migrated = state.normalizeRun(rawRun({
		shopOffers: [
			{ id: "filtered_skill", price: 10, sold: true, carried: false },
			{ id: SKILL_B, price: 20, sold: false, carried: false },
		],
	}), { isSkillAllowed: id => id !== "filtered_skill" });
	assertEqual(migrated.skillPurchasedThisRound, 1, "旧档在过滤非法候选前统计 sold && !carried");
	assertEqual(migrated.shopOffers.length, 1, "非法候选被过滤");
	assertEqual(shop.getPurchasedCount(migrated), 1, "购买计数不因候选被过滤而丢失");
	assert(!shop.checkSkillPurchase(migrated, SKILL_B).ok, "本局额度仍被占用");
	// 已有字段为 0 也必须保留，不能误判为缺失
	const zero = state.normalizeRun(rawRun({
		shopOffers: [{ id: SKILL_B, price: 20, sold: true, carried: false }],
		skillPurchasedThisRound: 0,
	}));
	assertEqual(zero.skillPurchasedThisRound, 0, "已有字段 0 原样保留");
	assertEqual(shop.getPurchasedCount(zero), 0, "字段 0 就是 0");
	// 已有字段 >0，即使候选全被清洗也保留
	const preserved = state.normalizeRun(rawRun({
		shopOffers: [],
		skillPurchasedThisRound: 1,
	}));
	assertEqual(preserved.skillPurchasedThisRound, 1, "已有字段 1 原样保留");
	// carried 历史购买不迁移进本局额度
	const carried = state.normalizeRun(rawRun({
		shopOffers: [{ id: SKILL_B, price: 20, sold: true, carried: true }],
	}));
	assertEqual(carried.skillPurchasedThisRound, 0, "carried 不计本局购买次数");
	return "过滤前迁移 / 0 保留 / 候选清空仍保留 / carried 不计";
});

check("流浪商人旧档：失效商品清掉历史价签，安全结束", () => {
	const raw = {
		...freshRun(cfg.RUN_MODE.endless),
		currency: { gold: 500, exp: 0 },
		pendingEvent: {
			id: "wandering_merchant",
			choices: [
				{
					text: "和商人交易（一件货 · 标价 400 金币）",
					reward: {},
					action: { kind: "merchant", curioId: "不存在的奇物", price: 400 },
					blockedText: "这一笔做不成。",
				},
				{ text: "不买了", reward: {} },
			],
			createdAt: NOW,
		},
	};
	const loaded = state.normalizeRun(raw);
	assertEqual(loaded.pendingEvent.choices[0].text, "和商人交易", "失效商品的历史价签被清掉");
	assertEqual(JSON.stringify(loaded.pendingEvent.choices[0].action), JSON.stringify({ kind: "merchant", soldOut: true }), "降级为 soldOut");
	const settled = eventManager.resolveEventChoice(loaded, 0, {}, () => 0);
	assertEqual(settled.run.currency.gold, 500, "零扣费");
	assertEqual(settled.run.pendingEvent, null, "事件正常结束");
	assertEqual(settled.lines[0], "这一笔做不成。", "保留 soldOut 提示");
	// 仍有效的商品价签不能误删
	const valid = state.normalizeRun({
		...freshRun(cfg.RUN_MODE.endless),
		pendingEvent: {
			id: "wandering_merchant",
			choices: [
				{ text: "和商人交易（一件货 · 标价 400 金币）", reward: {}, action: { kind: "merchant", curioId: "energy_core", price: 400 }, blockedText: "这一笔做不成。" },
				{ text: "不买了", reward: {} },
			],
			createdAt: NOW,
		},
	});
	assertEqual(valid.pendingEvent.choices[0].text, "和商人交易（一件货 · 标价 400 金币）", "有效商品价签保留");
	return "失效价签清理 / 有效价签保留 / 零扣费零发放";
});

check("新增四事件：倍率按刚打赢那关的基准换算成固定值，消耗写进文案", () => {
	const build = id => eventManager.buildPendingEvent(id, BASE_LEVEL, () => 0, NOW, { curios: [] });
	// 废弃补给站：翻找补给箱保持 1 倍金币 + 1 倍经验；深入搜寻改成 12/8/60/20 四档互斥预掷
	const supply = build("abandoned_supply");
	assertEqual(supply.id, "abandoned_supply", "待处理事件只存 id（名字由事件页现读定义）");
	assertEqual(JSON.stringify(supply.choices[0].reward), JSON.stringify({ gold: BASE_GOLD, exp: BASE_EXP }), "翻找补给箱 = 1 倍金币 + 1 倍经验");
	assertEqual(supply.choices[1].text, "深入搜寻", "另一个选项改名");
	assertEqual(JSON.stringify(supply.choices[1].reward), JSON.stringify({ skill: "random" }), "rng=0 落在 12% 技能档（结果预掷定死）");
	const supplyAt = rng => eventManager.buildPendingEvent("abandoned_supply", BASE_LEVEL, rng, NOW, { curios: [] });
	assertEqual(JSON.stringify(supplyAt(() => 0.2).choices[1].reward), JSON.stringify({ curio: "random" }), "rng=0.2 落在 8% 奇物档");
	assertEqual(JSON.stringify(supplyAt(() => 0.5).choices[1].reward), JSON.stringify({ gold: Math.round(BASE_GOLD / 2), exp: BASE_EXP }), "rng=0.5 落在 60% 半倍金币 + 一倍经验档");
	assertEqual(JSON.stringify(supplyAt(() => 0.9).choices[1].reward), JSON.stringify({}), "rng=0.9 落在 20% 落空档");
	assertEqual(supply.choices[1].text, supplyAt(() => 0.9).choices[1].text, "预掷结果不进按钮文案（不剧透）");
	assert(!supply.choices[0].text.includes("金币"), `白拿的选项不加价钱后缀：${supply.choices[0].text}`);
	// 结算：技能进无尽背包、奇物按初始品质入袋、金币经验按定死值入账、落空只提示
	const skillRun = { ...freshRun(cfg.RUN_MODE.endless), pendingEvent: supply };
	const skillGot = eventManager.resolveEventChoice(skillRun, 1, { candidates: [{ id: "own_four" }], characterSkills: [] }, () => 0);
	assert(skillGot.ok, skillGot.error ?? "技能档应结算");
	assertEqual(JSON.stringify(skillGot.run.skillInventory), JSON.stringify(["own_four"]), "随机技能进背包，不占装备位");
	assertEqual(JSON.stringify(skillGot.run.skills), JSON.stringify([]), "不会自动装备");
	assertEqual(skillGot.run.pendingEvent, null, "事件收掉");
	const curioRun = { ...freshRun(cfg.RUN_MODE.endless), pendingEvent: supplyAt(() => 0.2) };
	const curioGot = eventManager.resolveEventChoice(curioRun, 1, {}, () => 0);
	assert(curioGot.ok && curioGot.curioId, curioGot.error ?? "奇物档应结算");
	assertEqual(curioManager.getCurioQuality(curioGot.curioId, curioGot.run.curioQuality), curiosData.getCurio(curioGot.curioId).rarity, "新奇物按自身初始品质获得（不继承任何历史品质）");
	const moneyRun = { ...freshRun(cfg.RUN_MODE.endless), currency: { gold: 0, exp: 0 }, pendingEvent: supplyAt(() => 0.5) };
	const moneyGot = eventManager.resolveEventChoice(moneyRun, 1, {}, () => 0);
	assertEqual(JSON.stringify(moneyGot.run.currency), JSON.stringify({ gold: Math.round(BASE_GOLD / 2), exp: BASE_EXP }), "60% 档的金币经验按预掷值入账");
	const emptyRun = { ...freshRun(cfg.RUN_MODE.endless), currency: { gold: 0, exp: 0 }, pendingEvent: supplyAt(() => 0.9) };
	const emptyGot = eventManager.resolveEventChoice(emptyRun, 1, {}, () => 0);
	assertEqual(JSON.stringify(emptyGot.run.currency), JSON.stringify({ gold: 0, exp: 0 }), "落空档一分钱不发");
	assertEqual(emptyGot.lines.length, 0, "落空档没有账目行（流程层按「什么也没有发生」提示）");
	// 空奖池：不生造技能 / 奇物，给出失败提示
	const noSkill = eventManager.resolveEventChoice({ ...freshRun(cfg.RUN_MODE.endless), pendingEvent: supply }, 1, { candidates: [], characterSkills: [] }, () => 0);
	assertEqual(noSkill.run.skillInventory.length, 0, "技能池为空时不生成无效技能");
	assert(noSkill.lines.includes("没有可学的技能"), `技能池为空要有失败提示：${noSkill.lines.join(" / ")}`);
	const allCurios = [...curiosData.curioIds];
	const noCurio = eventManager.resolveEventChoice({ ...freshRun(cfg.RUN_MODE.endless), curios: allCurios, pendingEvent: supplyAt(() => 0.2) }, 1, {}, () => 0);
	assertEqual(noCurio.run.curios.length, allCurios.length, "奇物集齐时不再给重复/不存在的奇物");
	assert(noCurio.lines[0].includes("什么也没有找到"), `奇物集齐要有事件自己的失败提示：${noCurio.lines.join(" / ")}`);
	// 老兵的训练：让他训练 = 2 倍经验；花钱请教 = 扣半层金币换 4 倍经验
	const veteran = build("veteran_training");
	assertEqual(JSON.stringify(veteran.choices[0].reward), JSON.stringify({ exp: BASE_EXP * 2 }), "让他训练 = 2 倍基准经验");
	assertEqual(JSON.stringify(veteran.choices[1].reward), JSON.stringify({ gold: -Math.round(BASE_GOLD / 2), exp: BASE_EXP * 4 }), "花钱请教 = -0.5 金币 / +4 经验");
	assert(veteran.choices[1].text.includes(`${-Math.round(BASE_GOLD / 2)} 金币`), `消耗要写进文案：${veteran.choices[1].text}`);
	// 黄金矿脉：立即开采两头各 1 倍，仔细采集金币更多（1.5）经验更少（0.5）；本轮未调值
	const vein = build("gold_vein");
	assertEqual(JSON.stringify(vein.choices[0].reward), JSON.stringify({ gold: BASE_GOLD, exp: BASE_EXP }), "立即开采 = 1 / 1");
	assertEqual(JSON.stringify(vein.choices[1].reward), JSON.stringify({ gold: Math.round(BASE_GOLD * 1.5), exp: BASE_EXP / 2 }), "仔细采集 = 1.5 / 0.5");
	// 经验商人：两个方向是同一个汇率的两头（1 倍金币 <-> 3 倍经验），第三项是白走的出口
	const merchant = build("exp_merchant");
	assertEqual(merchant.choices.length, 3, "商人三个选项");
	assertEqual(JSON.stringify(merchant.choices[0].reward), JSON.stringify({ gold: -BASE_GOLD, exp: BASE_EXP * 3 }), "金币换经验（1 倍金币换 3 倍经验）");
	assertEqual(JSON.stringify(merchant.choices[1].reward), JSON.stringify({ gold: BASE_GOLD, exp: -BASE_EXP * 3 }), "经验换金币（3 倍经验换 1 倍金币）");
	assertEqual(JSON.stringify(merchant.choices[2].reward), JSON.stringify({}), "我不需要，谢谢 = 零变化");
	assert(merchant.choices[1].text.includes(`${-BASE_EXP * 3} 经验`), `花经验也要写价钱：${merchant.choices[1].text}`);
	// 结算：钱够才扣得动，不够整单拒绝且一个钱不动
	const rich = { ...freshRun(cfg.RUN_MODE.endless), currency: { gold: 500, exp: 500 }, pendingEvent: merchant };
	const bought = eventManager.resolveEventChoice(rich, 0, {}, () => 0);
	assert(bought.ok, bought.error ?? "金币换经验应成交");
	assertEqual(bought.run.currency.gold, 500 - BASE_GOLD, "扣一倍基准金币");
	assertEqual(bought.run.currency.exp, 500 + BASE_EXP * 3, "拿三倍基准经验");
	assertEqual(bought.run.pendingEvent, null, "事件收掉");
	const poor = { ...rich, currency: { gold: 10, exp: 500 } };
	assert(!eventManager.isChoiceAffordable(poor, merchant.choices[0].reward), "金币不足应判付不起");
	assert(eventManager.isChoiceAffordable(poor, merchant.choices[2].reward), "出口项永远可选");
	const denied = eventManager.resolveEventChoice(poor, 0, {}, () => 0);
	assert(!denied.ok && denied.error.includes("不足"), "结算层再验一次：付不起整单拒绝");
	assertEqual(denied.run.currency.gold, 10, "被拒时一个钱不动");
	// 读档往返：倍率早在构建期换算成固定值，读档只照抄、绝不重算
	const revived = state.normalizeRun({ ...rich, pendingEvent: merchant });
	assertEqual(JSON.stringify(revived.pendingEvent.choices.map(choice => choice.reward)), JSON.stringify(merchant.choices.map(choice => choice.reward)), "读档不重算倍率");
	// 关卡越高基准越大：第 9 关（√9=3）的翻找补给箱应是 3 倍第 3 关的基准金币
	const late = eventManager.buildPendingEvent("abandoned_supply", 9, () => 0, NOW, { curios: [] });
	assertEqual(late.choices[0].reward.gold, rewardsData.getEndlessReward(9, ["gold"]).gold, "基准按「刚打赢那一关」现算");
	return `第 ${BASE_LEVEL} 关基准 ${BASE_GOLD} 金币 / ${BASE_EXP} 经验；四事件共 ${supply.choices.length + veteran.choices.length + vein.choices.length + merchant.choices.length} 个选项`;
});

check("四件新事件：能从事件池抽到、构建器全部认，既有事件一个不少", () => {
	const ids = ["lost_database", "memory_corridor", "interstellar_exchange", "extreme_training"];
	for (const id of ids) {
		assert(eventsData.eventIds.includes(id), `池子里要有 ${id}`);
		const built = eventManager.buildPendingEvent(id, BASE_LEVEL, () => 0, NOW, { curios: [] });
		assert(built && built.id === id, `${id} 能被构建器识别`);
		assert(!built.choices.some(choice => !choice.text), `${id} 每个选项都有文案`);
	}
	assertEqual(eventsData.eventIds.length, 22, "22 个事件（17 原件 + 4 上一轮 + 1 深空悬赏）；新条目一律追加在末尾");
	assertEqual(eventsData.eventIds[0], "lost_robot", "第一个事件不变（rng=0 的既有夹具不漂移）");
	// 抽签能覆盖到新增段：rng→1 落在最后一个（下标 = floor(rng × 22)）
	assertEqual(eventManager.rollEventId(() => 0.999), "deep_space_bounty", "rng→1 抽到最后一件（深空悬赏可达）");
	// 深空悬赏：技能 + 下一场深渊债必须同时生效；没有技能时整项拒绝、绝不只记债
	const bounty = eventManager.buildPendingEvent("deep_space_bounty", BASE_LEVEL, () => 0, NOW, { curios: [] });
	assertEqual(bounty.choices.length, 3, "接受悬赏 / 领取普通报酬 / 离开");
	assertEqual(JSON.stringify(bounty.choices[0].reward), JSON.stringify({ skill: "random" }), "接受悬赏先随机发一个技能");
	assertEqual(JSON.stringify(bounty.choices[0].action), JSON.stringify({ kind: "abyssDebt", perEnemy: 1 }), "下一场每名敌人 +1 个深渊强化");
	assert(bounty.choices[0].text.includes("每个敌人 +1 个深渊强化"), `按钮上写明代价：${bounty.choices[0].text}`);
	assertEqual(JSON.stringify(bounty.choices[1].reward), JSON.stringify({ gold: Math.round(BASE_GOLD / 2) }), "普通报酬 = 0.5 倍本层金币");
	assertEqual(JSON.stringify(bounty.choices[2].reward), JSON.stringify({}), "离开无奖励无惩罚");
	const bountyRun = { ...freshRun(cfg.RUN_MODE.endless), abyssDebt: 2, pendingEvent: bounty };
	const accepted = eventManager.resolveEventChoice(bountyRun, 0, { candidates: [{ id: "own_four" }], characterSkills: [] }, () => 0);
	assert(accepted.ok, accepted.error ?? "有技能时应能接受悬赏");
	assertEqual(JSON.stringify(accepted.run.skillInventory), JSON.stringify(["own_four"]), "技能进背包");
	assertEqual(accepted.run.abyssDebt, 3, "深渊债与其他来源叠加（2 + 1），不是覆盖");
	assertEqual(accepted.run.pendingEvent, null, "事件收掉");
	const noSkillBounty = eventManager.resolveEventChoice({ ...bountyRun, pendingEvent: bounty }, 0, { candidates: [], characterSkills: [] }, () => 0);
	assert(!noSkillBounty.ok, "没有技能时应按失败返回，而不是成功结束事件");
	assertEqual(noSkillBounty.error, "没有可学的技能，无法接受悬赏", "失败提示");
	assertEqual(noSkillBounty.run.abyssDebt, 2, "没有技能时绝不能只加债");
	assertEqual(noSkillBounty.run.skillInventory.length, 0, "也不会发无效技能");
	assert(noSkillBounty.run.pendingEvent, "失败后事件保持待处理，玩家可以改选其他选项");
	assertEqual(noSkillBounty.run.pendingEvent.id, "deep_space_bounty", "保留的是原来那个事件");
	// 读档往返：技能来源与债的个数都按存档原样还原
	const bountyRound = state.normalizeRun({ ...freshRun(cfg.RUN_MODE.endless), pendingEvent: bounty });
	assertEqual(JSON.stringify(bountyRound.pendingEvent.choices[0].action), JSON.stringify({ kind: "abyssDebt", perEnemy: 1 }), "读档不重掷债的个数");
	// 星际兑换所：两档消耗与收益按倍率换算，钱不够整单拒绝
	const exchange = eventManager.buildPendingEvent("interstellar_exchange", BASE_LEVEL, () => 0, NOW, { curios: [] });
	assertEqual(JSON.stringify(exchange.choices[0].reward), JSON.stringify({ gold: -BASE_GOLD, exp: BASE_EXP * 3 }), "小额 = -1 倍金币 / +3 倍经验");
	assertEqual(JSON.stringify(exchange.choices[1].reward), JSON.stringify({ gold: -BASE_GOLD * 5, exp: BASE_EXP * 18 }), "大额 = -5 倍金币 / +18 倍经验");
	assert(exchange.choices[1].text.includes(`${-BASE_GOLD * 5} 金币`), `大额价钱写进按钮：${exchange.choices[1].text}`);
	assert(!eventManager.isChoiceAffordable({ ...freshRun(cfg.RUN_MODE.endless), currency: { gold: BASE_GOLD * 5 - 1, exp: 0 } }, exchange.choices[1].reward), "差 1 金币也判付不起");
	const bought = eventManager.resolveEventChoice({ ...freshRun(cfg.RUN_MODE.endless), currency: { gold: BASE_GOLD * 5, exp: 0 }, pendingEvent: exchange }, 1, {}, () => 0);
	assert(bought.ok && bought.run.currency.gold === 0 && bought.run.currency.exp === BASE_EXP * 18, "恰好付得起就整单成交、余额不为负");
	// 失落数据库：免费 / 付费 / 搏一把三档；搏一把的两支预掷都可复现、按钮不剧透
	const db = eventManager.buildPendingEvent("lost_database", BASE_LEVEL, () => 0, NOW, { curios: [] });
	assertEqual(JSON.stringify(db.choices[0].reward), JSON.stringify({ exp: BASE_EXP * 2 }), "免费读取 = 2 倍本层经验");
	assertEqual(JSON.stringify(db.choices[1].reward), JSON.stringify({ gold: -BASE_GOLD * 2, exp: BASE_EXP * 8 }), "付费解锁 = -2 倍金币 / +8 倍经验");
	assertEqual(JSON.stringify(db.choices[2].reward), JSON.stringify({ exp: BASE_EXP * 12 }), "rng=0 搏中 12 倍");
	const dbMiss = eventManager.buildPendingEvent("lost_database", BASE_LEVEL, () => 0.999, NOW, { curios: [] });
	assertEqual(JSON.stringify(dbMiss.choices[2].reward), JSON.stringify({}), "rng→1 搏空、什么也没有");
	assertEqual(db.choices[2].text, dbMiss.choices[2].text, "搏一把的按钮不写预掷结果");
	return "21 事件 / 新增段可达 / 兑换所与数据库逐档核对";
});

check("记忆回廊：深入记忆的失手分支不置灰、不剧透，扣款最多扣光、绝不为负", () => {
	// 预掷：rng=0 → +7 倍；rng→1 → -2 倍。两支都在构建期定死，读档不重掷
	const win = eventManager.buildPendingEvent("memory_corridor", BASE_LEVEL, () => 0, NOW, { curios: [] });
	assertEqual(win.choices.length, 4, "回顾过去 / 深入记忆 / 遗忘过去 / 离开");
	assertEqual(JSON.stringify(win.choices[1].reward), JSON.stringify({ exp: BASE_EXP * 7 }), "rng=0 预掷到 +7 倍那一支");
	assertEqual(win.choices[1].clampLoss, true, "深入记忆带「最多扣光」安全阀");
	const lose = eventManager.buildPendingEvent("memory_corridor", BASE_LEVEL, () => 0.999, NOW, { curios: [] });
	assertEqual(JSON.stringify(lose.choices[1].reward), JSON.stringify({ exp: -BASE_EXP * 2 }), "rng→1 预掷到 -2 倍那一支");
	assertEqual(win.choices[1].text, lose.choices[1].text, "预掷结果不进按钮文案（不剧透）");
	// 不置灰：失手档在 0 经验时也照常可点——置灰等于把预掷结果漏给玩家，所以结算层要直接放行
	const broke = { ...freshRun(cfg.RUN_MODE.endless), currency: { gold: 0, exp: 0 } };
	assert(!eventManager.isChoiceAffordable(broke, lose.choices[1].reward), "底层判定确实认为买不起（这正是要绕开的那道）");
	assert(eventManager.resolveEventChoice({ ...broke, pendingEvent: lose }, 1, {}, () => 0).ok, "clampLoss 选项结算层直接放行，不看余额");
	// 最多扣光：手里 30 点、失手扣 80 → 只扣 30、余额为 0，账目行报的是真扣的数
	const poor = { ...freshRun(cfg.RUN_MODE.endless), currency: { gold: 0, exp: 30 }, pendingEvent: lose };
	const paid = eventManager.resolveEventChoice(poor, 1, {}, () => 0);
	assertEqual(paid.run.currency.exp, 0, "扣到 0 为止（绝不为负）");
	assert(paid.lines.some(line => line === "经验 -30"), `账目行与余额一致：${paid.lines.join(" / ")}`);
	assertEqual(paid.run.pendingEvent, null, "事件照常收掉");
	// 手里 0 点：一分不扣，也不报一行假账
	const nothing = eventManager.resolveEventChoice({ ...broke, pendingEvent: lose }, 1, {}, () => 0);
	assertEqual(nothing.run.currency.exp, 0, "没得扣就不扣");
	assert(!nothing.lines.some(line => line.includes("经验")), `没有经验账目行：${nothing.lines.join(" / ")}`);
	// 读档往返：失手金额与安全阀原样回来
	const revived = state.normalizeRun({ ...poor, pendingEvent: lose });
	assertEqual(JSON.stringify(revived.pendingEvent.choices[1].reward), JSON.stringify({ exp: -BASE_EXP * 2 }), "失手金额读档不重算");
	assertEqual(revived.pendingEvent.choices[1].clampLoss, true, "clampLoss 随存档带回");
	// 正常收费事件不受影响：经验商人余额不足照旧被结算层整单拒绝
	const merchant = eventManager.buildPendingEvent("exp_merchant", BASE_LEVEL, () => 0, NOW, { curios: [] });
	const denied = eventManager.resolveEventChoice({ ...freshRun(cfg.RUN_MODE.endless), currency: { gold: 10, exp: 0 }, pendingEvent: merchant }, 0, {}, () => 0);
	assert(!denied.ok && denied.error.includes("不足"), "没有 clampLoss 的事件支付规则一个字不动");
	return "预掷不剧透 / 不置灰 / 最多扣光 / 老事件不受影响";
});

check("事件支付判定：商人标价 / 融合费与 reward 消耗共用一份，恰好够可付", () => {
	const merchant = eventManager.buildPendingEvent("wandering_merchant", BASE_LEVEL, () => 0, NOW, { curios: [] });
	const price = merchant.choices[0].action.price;
	assertEqual(price, curioManager.getMerchantPrice(BASE_LEVEL), "商人标价仍按基准价现算");
	assertEqual(JSON.stringify(eventManager.getChoiceCost(merchant.choices[0])), JSON.stringify({ gold: price }), "商人选项的确定费用 = 标价");
	const atGold = gold => ({ ...freshRun(cfg.RUN_MODE.endless), currency: { gold, exp: 0 }, curios: [] });
	assert(!eventManager.isChoiceAffordable(atGold(price - 1), merchant.choices[0]), "差 1 金币 → 付不起");
	assert(eventManager.isChoiceAffordable(atGold(price), merchant.choices[0]), "恰好够 → 付得起");
	assert(eventManager.isChoiceAffordable(atGold(price + 1), merchant.choices[0]), "超过标价 → 付得起");
	assert(!eventManager.canChooseChoice(atGold(price - 1), merchant.choices[0]), "事件页同一判定：不足置灰");
	assert(eventManager.canChooseChoice(atGold(price), merchant.choices[0]), "事件页同一判定：恰好够可点");
	assert(eventManager.canChooseChoice(atGold(0), merchant.choices[1]), "出口项永远可点");

	const forge = eventManager.buildPendingEvent("curio_forge", BASE_LEVEL, () => 0, NOW, { curios: [] });
	const cost = forge.choices[0].action.costExp;
	assertEqual(cost, Math.round(BASE_EXP * cfg.FORGE_EXP_MULTIPLIER), "融合费口径不变");
	assertEqual(eventManager.getChoiceCost(forge.choices[0]).exp, cost, "融合炉的确定费用 = 经验费");
	const atExp = exp => ({ ...freshRun(cfg.RUN_MODE.endless), currency: { gold: 0, exp }, curios: ["energy_core"] });
	assert(!eventManager.isChoiceAffordable(atExp(cost - 1), forge.choices[0]), "差 1 经验 → 付不起");
	assert(eventManager.isChoiceAffordable(atExp(cost), forge.choices[0]), "恰好够 → 付得起");
	assert(!eventManager.canChooseChoice(atExp(cost - 1), forge.choices[0]), "事件页同一判定：不足置灰");
	// 「没有可作用的对象」优先于「付不起」：0 经验也能点，点下去只弹作者那句
	assert(eventManager.canChooseChoice({ ...atExp(0), curios: [] }, forge.choices[0]), "没奇物时可点（blocked 优先）");
	// 不收费的交互型 action 与裸 reward 的旧调用口径都不受影响
	assertEqual(JSON.stringify(eventManager.getChoiceCost({ reward: {}, action: { kind: "rift", tier: 0 } })), JSON.stringify({}), "裂隙不收费");
	assertEqual(JSON.stringify(eventManager.getChoiceCost({ reward: {}, action: { kind: "skillForge", grant: "exp" } })), JSON.stringify({}), "技能熔炉不收费");
	assertEqual(JSON.stringify(eventManager.getChoiceCost({ reward: { gold: -30, exp: -10 } })), JSON.stringify({ gold: 30, exp: 10 }), "reward 负数折算");
	assert(eventManager.isChoiceAffordable(atGold(0), { gold: 0, exp: 0 }), "裸 reward 旧口径照旧可用");
	assertEqual(JSON.stringify(eventManager.getChoiceCost({ reward: {}, action: { kind: "merchant", soldOut: true } })), JSON.stringify({}), "soldOut 不产生费用");
	return `商人 ${price} 金币 / 融合 ${cost} 经验 / 边界均按「恰好够可付」`;
});

check("交互型收费选项：结算层最终校验，付不起整单拒绝且不进子页", () => {
	const price = 400;
	const event = {
		id: "wandering_merchant",
		choices: [
			{ text: `和商人交易（一件货 · 标价 ${price} 金币）`, reward: {}, action: { kind: "merchant", curioId: "energy_core", price }, blockedText: "他已经把最好的一件卖给你了，这一笔做不成。" },
			{ text: "不买了", reward: {} },
		],
		createdAt: NOW,
	};
	const base = { ...freshRun(cfg.RUN_MODE.endless), currency: { gold: price - 1, exp: 0 }, pendingEvent: event };
	const denied = eventManager.resolveEventChoice(base, 0, {}, () => 0);
	assert(!denied.ok, "金币不足必须整单拒绝");
	assert(denied.error.includes("不足"), `拒绝原因要写明：${denied.error}`);
	assertEqual(denied.run, base, "被拒时原样返回同一份存档");
	assertEqual(JSON.stringify(base.currency), JSON.stringify({ gold: price - 1, exp: 0 }), "金币一个不动");
	assertEqual(JSON.stringify(base.pendingEvent), JSON.stringify(event), "事件仍挂着，不会进无意义的子页");
	// 恰好够：放行 action，但这一刻不扣钱、不清事件（子页里选定才落地）
	const exact = { ...base, currency: { gold: price, exp: 0 } };
	const opened = eventManager.resolveEventChoice(exact, 0, {}, () => 0);
	assert(opened.ok && opened.action?.kind === "merchant", "恰好够时把 action 交回流程层");
	assertEqual(JSON.stringify(exact.currency), JSON.stringify({ gold: price, exp: 0 }), "进子页不预先扣费");
	assertEqual(JSON.stringify(exact.pendingEvent), JSON.stringify(event), "落地前事件不摘");
	// 融合炉走同一条路
	const forgeEvent = {
		id: "curio_forge",
		choices: [
			{ text: "把一件奇物投进炉子（消耗 200 经验）", reward: {}, action: { kind: "curioForge", costExp: 200 }, blockedText: "奇物不足，炉子里没有可以融合的东西。" },
			{ text: "离开", reward: {} },
		],
		createdAt: NOW,
	};
	const poorForge = { ...freshRun(cfg.RUN_MODE.endless), currency: { gold: 0, exp: 199 }, curios: ["energy_core"], pendingEvent: forgeEvent };
	const forgeDenied = eventManager.resolveEventChoice(poorForge, 0, {}, () => 0);
	assert(!forgeDenied.ok && forgeDenied.error.includes("不足"), "融合炉经验不足整单拒绝");
	assertEqual(poorForge.pendingEvent, forgeEvent, "融合炉事件仍挂着");
	assertEqual(poorForge.currency.exp, 199, "经验一个不扣");
	// 免费出口照常
	assert(eventManager.resolveEventChoice({ ...base, currency: { gold: 0, exp: 0 } }, 1, {}, () => 0).ok, "出口项照常结算");
	return "商人 / 融合炉：入口拒绝 + 不预扣 + 事件保留";
});

check("幸运硬币：失手支带 clampLoss，不置灰不剧透、最多扣光金币", () => {
	const lose = eventManager.buildPendingEvent("lucky_coin", BASE_LEVEL, () => 0.999, NOW, { curios: [] });
	const loss = Math.round(BASE_GOLD * 0.5);
	assertEqual(JSON.stringify(lose.choices[0].reward), JSON.stringify({ gold: -loss }), "rng→1 预掷到失手支");
	assertEqual(lose.choices[0].clampLoss, true, "失手支写 clampLoss");
	assertEqual(lose.choices[0].text, "拾取", "按钮不写预掷金额");
	const broke = { ...freshRun(cfg.RUN_MODE.endless), currency: { gold: 0, exp: 0 } };
	assert(eventManager.canChooseChoice(broke, lose.choices[0]), "0 金币也照常可点（置灰会剧透）");
	assert(!eventManager.isChoiceAffordable({ ...broke, currency: { gold: loss - 1, exp: 0 } }, lose.choices[0]), "底层判定确实认为付不起（这正是要绕开的那道）");
	// 最多扣光：手里 10、失手 50 → 只扣 10
	const paid = eventManager.resolveEventChoice({ ...broke, currency: { gold: 10, exp: 0 }, pendingEvent: lose }, 0, {}, () => 0);
	assert(paid.ok, paid.error ?? "clampLoss 放行");
	assertEqual(paid.run.currency.gold, 0, "扣到 0 为止（绝不为负）");
	assert(paid.lines.includes("金币 -10"), `账目行与余额一致：${paid.lines.join(" / ")}`);
	// 手里 0：一分不扣，事件照常结束
	const nothing = eventManager.resolveEventChoice({ ...broke, pendingEvent: lose }, 0, {}, () => 0);
	assertEqual(nothing.run.currency.gold, 0, "没得扣就不扣");
	assert(!nothing.lines.some(line => line.startsWith("金币")), "不写假账");
	assertEqual(nothing.run.pendingEvent, null, "事件照常结束");
	// 中奖支同样带 clampLoss（两支按钮必须一样），且正常入账
	const win = eventManager.buildPendingEvent("lucky_coin", BASE_LEVEL, () => 0, NOW, { curios: [] });
	assertEqual(win.choices[0].clampLoss, true, "中奖支也带（否则置灰同样泄露结果）");
	const gained = eventManager.resolveEventChoice({ ...broke, pendingEvent: win }, 0, {}, () => 0);
	assertEqual(gained.run.currency.gold, BASE_GOLD * 2, "中奖照常 +2 倍金币");
	assertEqual(gained.run.currency.exp, BASE_EXP * 2, "中奖照常 +2 倍经验");
	// 读档往返
	const revived = state.normalizeRun({ ...broke, pendingEvent: lose });
	assertEqual(revived.pendingEvent.choices[0].clampLoss, true, "clampLoss 随存档带回");
	return "失手不置灰 / 最多扣光 / 中奖正常";
});

check("事件池自检：随机损失必须 clampLoss，确定收费都能折算成同一份代价", () => {
	let risky = 0;
	for (const [id, def] of Object.entries(eventsData.events)) {
		for (const choice of def.choices ?? []) {
			const outcomes = Array.isArray(choice.outcomes) ? choice.outcomes : [];
			const hasLoss = outcomes.some(item => ["gold", "exp", "goldByWin", "expByWin"]
				.some(key => Number(item?.reward?.[key]) < 0));
			if (!hasLoss) {
				continue;
			}
			risky++;
			assertEqual(choice.clampLoss, true, `${id}「${choice.text}」有随机损失，必须 clampLoss（否则置灰会泄露预掷）`);
		}
	}
	assertEqual(risky, 2, "当前只有记忆回廊与幸运硬币两处随机损失");
	// 所有确定收费都能被 getChoiceCost 折算成 gold/exp，UI 与结算层不会各写一套
	const costs = [];
	for (const id of ["lost_robot", "stat_training_ground", "wandering_merchant", "curio_forge"]) {
		const built = eventManager.buildPendingEvent(id, BASE_LEVEL, () => 0, NOW, { curios: [] });
		costs.push(...built.choices.map(choice => eventManager.getChoiceCost(choice)));
	}
	assert(costs.some(cost => cost.gold > 0), "有金币收费项");
	assert(costs.some(cost => cost.exp > 0), "有经验收费项");
	assert(costs.every(cost => Object.values(cost).every(value => value > 0)), "折算值恒为正");
	return `随机损失 ${risky} 处 / 收费项 ${costs.filter(cost => Object.keys(cost).length).length} 个`;
});

check("事件池自检：付费 action 不与负数 reward 混用（入口判定与实际扣费同源）", () => {
	const paidKinds = new Set(["merchant", "curioForge"]);
	for (const [id, def] of Object.entries(eventsData.events)) {
		for (const choice of def.choices ?? []) {
			if (!choice.action || !paidKinds.has(choice.action.kind)) {
				continue;
			}
			const hasLoss = ["gold", "exp", "goldByWin", "expByWin"].some(key => Number(choice.reward?.[key]) < 0);
			assert(!hasLoss, `${id}「${choice.text}」同时写了负数 reward 与付费 action：入口按合计判、子页只扣 action，必然对不上`);
		}
	}
	// 现有两个付费 action：入口折算的费用必须与子页真实扣款完全相同
	const merchant = eventManager.buildPendingEvent("wandering_merchant", BASE_LEVEL, () => 0, NOW, { curios: [] });
	assertEqual(
		JSON.stringify(eventManager.getChoiceCost(merchant.choices[0])),
		JSON.stringify({ gold: merchant.choices[0].action.price }),
		"商人：入口费用 = 子页实扣（标价）",
	);
	const forge = eventManager.buildPendingEvent("curio_forge", BASE_LEVEL, () => 0, NOW, { curios: [] });
	assertEqual(
		JSON.stringify(eventManager.getChoiceCost(forge.choices[0])),
		JSON.stringify({ exp: forge.choices[0].action.costExp }),
		"融合炉：入口费用 = 子页实扣（经验费）",
	);
	return "付费 action 均未叠加负数 reward";
});

check("神秘商人集齐奇物：不扣费、直接结束事件（与「付不起」区分）", () => {
	const merchant = eventManager.buildPendingEvent("mystery_merchant", BASE_LEVEL, () => 0, NOW, { curios: [] });
	const full = {
		...freshRun(cfg.RUN_MODE.endless),
		currency: { gold: 0, exp: 0 },
		curios: curiosData.curioIds.slice(),
		pendingEvent: merchant,
	};
	assert(eventManager.canChooseChoice(full, merchant.choices[0]), "集齐时 0 金币也可点（跳过分支不花钱）");
	const settled = eventManager.resolveEventChoice(full, 0, {}, () => 0);
	assert(settled.ok, settled.error ?? "集齐时应正常结束");
	assertEqual(settled.run.currency.gold, 0, "不扣金币");
	assertEqual(settled.run.curios.length, curiosData.curioIds.length, "不重复发放奇物");
	assertEqual(settled.run.pendingEvent, null, "直接结束事件");
	assert(settled.lines[0].includes("集齐"), `给出理由：${settled.lines[0]}`);
	return "集齐：可点、零扣费、事件结束";
});

check("极限模拟训练：极限与终极两档的深渊债按 1 / 2 记档，经验照发；经验泉默认值不受影响", () => {
	const built = eventManager.buildPendingEvent("extreme_training", BASE_LEVEL, () => 0, NOW, { curios: [] });
	assertEqual(built.choices.length, 4, "基础 / 极限 / 终极 / 离开");
	assertEqual(JSON.stringify(built.choices[0].reward), JSON.stringify({ exp: BASE_EXP * 2 }), "基础训练 = 2 倍本层基准经验");
	assertEqual(JSON.stringify(built.choices[1].action), JSON.stringify({ kind: "abyssDebt", perEnemy: 1 }), "极限训练 = 每名敌人 +1");
	assertEqual(JSON.stringify(built.choices[2].action), JSON.stringify({ kind: "abyssDebt", perEnemy: 2 }), "终极训练 = 每名敌人 +2");
	assert(built.choices[2].text.includes("每个敌人 +2 个深渊强化"), `债数写进按钮：${built.choices[2].text}`);
	const run = { ...freshRun(cfg.RUN_MODE.endless), currency: { gold: 0, exp: 0 }, pendingEvent: built };
	const trained = eventManager.resolveEventChoice(run, 2, {}, () => 0);
	assertEqual(trained.run.currency.exp, BASE_EXP * 10, "终极训练 = 10 倍本层基准经验");
	assertEqual(trained.run.abyssDebt, 2, "债记 2");
	assert(trained.lines.some(line => line.includes("深渊强化")), `文案写明欠了什么：${trained.lines.join(" / ")}`);
	// 债累加不覆盖：再吃一次极限训练的 +1 → 3（与经验泉同一条纪律）
	const again = eventManager.resolveEventChoice({ ...trained.run, pendingEvent: built }, 1, {}, () => 0);
	assertEqual(again.run.abyssDebt, 3, "连着欠的债累加");
	assertEqual(again.run.currency.exp, BASE_EXP * 10 + BASE_EXP * 6, "两次经验照发");
	// 读档往返：perEnemy 随存档定死
	const revived = state.normalizeRun({ ...run, pendingEvent: built });
	assertEqual(JSON.stringify(revived.pendingEvent.choices[2].action), JSON.stringify({ kind: "abyssDebt", perEnemy: 2 }), "perEnemy 读档不重掷");
	assertEqual(cfg.SPRING_DEBT_AFFIXES, 1, "经验泉的默认债数保持 1（不写 perEnemy 的照旧吃配置）");
	return "1 / 2 记档 + 累加 + 读档 + 泉的默认值";
});

check("记忆棱镜：只加成事件自己发的正数经验（稀有 +25% / 史诗 +50%），消耗与战斗结算都不吃", () => {
	const bare = { ...freshRun(cfg.RUN_MODE.endless), currency: { gold: 0, exp: 0 } };
	assertEqual(eventManager.boostEventExp(bare, { exp: 80 }).exp, 80, "没有棱镜原样返回");
	const rare = { ...bare, curios: ["memory_prism"] };
	assertEqual(eventManager.boostEventExp(rare, { exp: 80 }).exp, 100, "稀有：80 → 100（round(80×1.25)）");
	const epic = { ...rare, curioQuality: { memory_prism: "epic" } };
	assertEqual(eventManager.boostEventExp(epic, { exp: 80 }).exp, 120, "史诗：80 → 120（品质现读 curioQuality）");
	assertEqual(JSON.stringify(eventManager.boostEventExp(rare, { exp: -80 })), JSON.stringify({ exp: -80 }), "经验消耗不加成");
	assertEqual(JSON.stringify(eventManager.boostEventExp(rare, { gold: 50, exp: 80 })), JSON.stringify({ gold: 50, exp: 100 }), "只动 exp，别的键原样");
	assertEqual(eventManager.boostEventExp(rare, { exp: 0 }).exp, 0, "0 不变");
	assertEqual(eventManager.boostEventExp(rare, { skipLevels: 10, exp: 630 }).exp, 630, "虫洞跳关汇总的经验不加成");
	// 端到端：事件结算的余额与账目行吃的是同一份加成后的数字
	const built = eventManager.buildPendingEvent("lost_database", BASE_LEVEL, () => 0, NOW, { curios: [] });
	const paid = eventManager.resolveEventChoice({ ...rare, pendingEvent: built }, 0, {}, () => 0);
	assertEqual(paid.run.currency.exp, 100, "免费读取 80 → 稀有棱镜后 100");
	assert(paid.lines.some(line => line === "经验 +100"), `账目行与余额一致：${paid.lines.join(" / ")}`);
	// 追问句合并成一口之后只算一次
	const spring = eventManager.buildPendingEvent("spring_of_wisdom", BASE_LEVEL, () => 0, NOW, { curios: [] });
	const drank = eventManager.resolveEventChoice({ ...rare, pendingEvent: spring }, 0, { followUpTaken: true }, () => 0);
	assertEqual(drank.run.currency.exp, Math.round((BASE_EXP * 3 + BASE_EXP * 2) * 1.25), "两口合并后只加成一次");
	assertEqual(drank.run.abyssDebt, 1, "债照旧记（棱镜不碰它）");
	// 战斗胜利结算（reward.js）不经过事件这条链：拿同一份存档对比，经验分毫不动
	const plainBattle = reward.settleVictory({ ...freshRun(cfg.RUN_MODE.endless), level: BASE_LEVEL, currency: { gold: 0, exp: 0 } }, NOW, () => 0.999).run.currency.exp;
	const prismBattle = reward.settleVictory({ ...freshRun(cfg.RUN_MODE.endless), level: BASE_LEVEL, currency: { gold: 0, exp: 0 }, curios: ["memory_prism"] }, NOW, () => 0.999).run.currency.exp;
	assertEqual(prismBattle, plainBattle, "普通战斗胜利的结算经验不吃棱镜");
	return "稀有 / 史诗 / 消耗 / 虫洞 / 兼容追问与战斗结算";
});

check("Boss 标记归场：整局 bossRun 已移除，isBossBattle 随 currentBattle 往返且读档不重掷", () => {
	// Boss 判定是逐场独立的 0.06666，保底是独立的第二道保证（不吃这个概率），两条线各测各的
	assertEqual(cfg.BOSS_RUN_RATE, 0.06666, "单次判定概率与规格一致（0.06666）");
	assertEqual(cfg.BOSS_PITY_BATTLES, 15, "保底关卡差与规格一致（距上次 Boss 满 15 关必出）");
	assertEqual(cfg.RUN_VERSION, 15, "存档版本抬到 v15（bossPityCount 退役、改记关卡 bossPityLevel）");
	// 新档不再带整局的 bossRun：这个字段一旦还能被读到，就可能继续影响后面的关卡
	const fresh = freshRun(cfg.RUN_MODE.endless);
	assertEqual(fresh.bossRun, undefined, "新档没有整局 bossRun");
	assertEqual(fresh.currentBattle, null, "新档没有进行中战斗");
	// Boss 场与普通场各自显式记录，读档/cloneRun 原样带回，绝不重新随机
	const bossBattle = state.normalizeRun({
		...fresh,
		currentBattle: { status: "battle", enemies: [{ characterId: "佐菲", boss: true }], rift: null, isBossBattle: true },
	});
	assertEqual(bossBattle.currentBattle.isBossBattle, true, "本场 Boss 标记读回 true");
	assertEqual(state.normalizeRun({ ...bossBattle }).currentBattle.isBossBattle, true, "二次读档仍为 true，绝不重掷");
	assertEqual(state.cloneRun(bossBattle).currentBattle.isBossBattle, true, "cloneRun 也不丢");
	const normalSaved = state.normalizeRun({
		...fresh,
		currentBattle: { status: "battle", enemies: [{ characterId: "佐菲" }], rift: null, isBossBattle: false },
	});
	assertEqual(normalSaved.currentBattle.isBossBattle, false, "普通战斗显式记 false，不沿用上一场");
	assertEqual(state.normalizeRun({ ...normalSaved }).currentBattle.isBossBattle, false, "false 也照抄（不被 legacy 分支翻案）");
	// 旧 v11 档迁移三态
	// ① 正处于 Boss 场：按旧 bossRun + 阵容里的 boss 敌人折算出这一场，原阵容与原结算规则都保住
	const midBoss = state.migrateSlots([{
		...fresh,
		version: 11,
		bossRun: true,
		currentBattle: { status: "battle", enemies: [{ characterId: "佐菲", boss: true }], rift: null },
	}]);
	assert(midBoss.errors.some(error => error.includes(`迁移到${cfg.RUN_VERSION}`)), "v11 旧档报一条迁移提示");
	assertEqual(midBoss.slots[0].bossRun, undefined, "迁移后整局 bossRun 字段消失，无法再影响后续关卡");
	assertEqual(midBoss.slots[0].currentBattle.isBossBattle, true, "正在进行的这一场保住 Boss 战身份");
	assertEqual(midBoss.slots[0].currentBattle.enemies[0].boss, true, "敌方阵容原样保留");
	// ② 正处于深渊裂隙那一场（旧档 bossRun 也是整局的）：裂隙有自己的独立结算，不折算成 Boss 场
	const midRift = state.normalizeRun({
		...fresh,
		bossRun: true,
		currentBattle: { status: "battle", enemies: [{ characterId: "佐菲" }], rift: { level: 3, enemies: 5, affixes: 2, gold: 100, exp: 40 } },
	});
	assertEqual(midRift.currentBattle.isBossBattle, false, "裂隙场不因旧 bossRun 变成 Boss 场");
	assertEqual(midRift.currentBattle.rift.enemies, 5, "裂隙参数原样保留");
	// ③ 没有进行中战斗：旧 bossRun 一律不补，下一场按逐场规则独立判定
	const idle = state.normalizeRun({ ...fresh, version: 11, bossRun: true });
	assertEqual(idle.currentBattle, null, "没有进行中战斗");
	assertEqual(idle.bossRun, undefined, "旧字段被丢弃，下一场不会必然成为 Boss 战");
	// v10 及更早的旧档：同样安全补齐，不报错
	const old = state.migrateSlots([{ ...freshRun(), version: 10 }]);
	assert(old.slots[0] !== null, "v10 旧档照常读入");
	assertEqual(old.slots[0].bossRun, undefined, "v10 旧档不带整局 bossRun");
	return "字段移除 / true·false 原样往返 / v11 三态迁移 / v10 补齐";
});

check("Boss 保底：只判无尽、距上次 Boss 满 15 关必出、虫洞跳关计入进度、受保底时不掷骰、v14 旧档折算与越界夹住", () => {
	const endless = cfg.RUN_MODE.endless;
	const pity = cfg.BOSS_PITY_BATTLES;
	assertEqual(pity, 15, "保底关卡差按规格定为 15");
	// 未到保底：仍按生产概率正常判定（严格小于），判定线一律读 BOSS_RUN_RATE，改旋钮不用改用例
	assertEqual(enemy.shouldBossBattle(endless, 1, 0, () => 0.999), false, "0.999 未命中");
	assertEqual(enemy.shouldBossBattle(endless, 1, 0, () => cfg.BOSS_RUN_RATE - 1e-9), true, "低于判定线命中");
	assertEqual(enemy.shouldBossBattle(endless, 1, 0, () => cfg.BOSS_RUN_RATE), false, "正好等于判定线不中（严格小于）");
	assertEqual(enemy.shouldBossBattle(endless, pity - 1, 0, () => 0.999), false, `第 ${pity - 1} 关（距上次 Boss 才 ${pity - 1} 关）仍按概率`);
	assertEqual(enemy.shouldBossBattle(endless, 14, 4, () => 0.999), false, "刚出过 Boss 的第 4 关附近更不可能保底");
	// 距上一次 Boss 满 BOSS_PITY_BATTLES 关：必定 Boss，且**不消费随机源**——传一个会抛的 rng 证明没掷骰
	const boom = () => {
		throw new Error("受保底保护时不应掷骰");
	};
	assertEqual(enemy.shouldBossBattle(endless, pity, 0, boom), true, `新档第 ${pity} 关必定 Boss（不掷骰）`);
	assertEqual(enemy.shouldBossBattle(endless, 5 + pity, 5, boom), true, `第 5 关出过 Boss → 其后第 ${5 + pity} 关保底`);
	assertEqual(enemy.shouldBossBattle(endless, 999, 0, boom), true, "关卡涨到哪儿都算得出来，绝不漏保底");
	// 虫洞一次跳十关：跳过的关照样计入保底——关卡差一到阈值就当场保底
	assertEqual(enemy.shouldBossBattle(endless, pity, 0, boom), true, "跳关后的关卡差直接决定保底（判据只有关卡，不数场次）");
	// **模式闸门**：闯关永远不判 Boss——关卡再高、保底再到期都不掷骰、直接 false
	assertEqual(enemy.shouldBossBattle(cfg.RUN_MODE.challenge, 999, 0, boom), false, "闯关第 999 关也不是 Boss 战（不掷骰）");
	assertEqual(enemy.shouldBossBattle(cfg.RUN_MODE.challenge, pity, 0, boom), false, "闯关到保底关卡差同样不判 Boss");
	for (let level = 1; level <= cfg.CHALLENGE_TOTAL_LEVELS; level++) {
		if (enemy.shouldBossBattle(cfg.RUN_MODE.challenge, level, 0, () => 0)) {
			throw new Error(`闯关第 ${level} 关被判成了 Boss 战`);
		}
	}
	assert(true, "闯关前 30 关逐关判定：没有一场是 Boss 战（哪怕 rng 钉死在 0）");
	// 未知/缺失的 mode 值同样走闸门外：判不出 Boss，免得模式字符串写错就漏出 Boss
	assertEqual(enemy.shouldBossBattle(undefined, 999, 0, boom), false, "mode 缺失 → 不判 Boss");
	// 全流程模拟：第 5 关提前命中 → 记下 5，其后第 5+阈值 关保底
	let lastBoss = 0;
	const bossAt = [];
	for (let level = 1; level <= pity * 2 + 1; level++) {
		const isBoss = enemy.shouldBossBattle(endless, level, lastBoss, () => (level === 5 ? 0 : 0.999));
		if (isBoss) {
			bossAt.push(level);
			lastBoss = level;
		}
	}
	assertEqual(JSON.stringify(bossAt), JSON.stringify([5, 5 + pity]), `第 5 关提前命中后重新记关卡，第 ${5 + pity} 关保底`);
	// 存档往返：新档 0、v14 的计数器折算成关卡、旧范围清洗、越界夹住、合法值幂等
	assertEqual(freshRun(cfg.RUN_MODE.endless).bossPityLevel, 0, `新档记录从 0 开始（第 ${pity} 关必出）`);
	// 造一份原始旧档：先摘掉 createRun 自带的 v15 字段，再按 patch 摆上「这一版真正有的字段」。
	// v14/v13 的用例都必须走这条路——freshRun 的形状自带 bossPityLevel，验不出真实旧档
	// （无尽档，关卡不受闯关 30 关上界夹）
	const legacyRun = (version, patch = {}, level = 45) => {
		const raw = { ...freshRun(cfg.RUN_MODE.endless), version, level };
		delete raw.bossPityLevel;
		delete raw.bossPityCount;
		Object.assign(raw, patch);
		return state.normalizeRun(raw);
	};
	const legacyV14 = (count, level = 45) => legacyRun(14, { bossPityCount: count }, level);
	// 折表：bossPityLevel = 本关 − 1 − 旧计数（已打完的普通场次原样保留，距下次保底按当前 BOSS_PITY_BATTLES 重算）。
	// 上界必须用 v14 自己的 0..19：拿新口径的阈值上界去夹会把超出它的那几档压掉，保底被整体提前若干关
	assertEqual(legacyV14(0).bossPityLevel, 44, "45 关 / 旧计数 0 → 44");
	assertEqual(legacyV14(14).bossPityLevel, 30, "45 关 / 旧计数 14 → 30");
	assertEqual(legacyV14(15).bossPityLevel, 29, "45 关 / 旧计数 15 → 29（合法旧计数必须原样保留）");
	assertEqual(legacyV14(19).bossPityLevel, 25, "45 关 / 旧计数 19 → 25（v14 的合法上界）");
	// 数字但越界：按 v14 自己的 0..19 清洗（负数归 0、超范围夹 19）后照常折算——它确实是一个旧计数器
	assertEqual(legacyV14(-5).bossPityLevel, 44, "负数按旧版清洗归 0 后折算");
	assertEqual(legacyV14(99).bossPityLevel, 25, "超范围夹到旧上界 19 后折算，不越界");
	assertEqual(legacyV14(99, 10).bossPityLevel, 0, "第 10 关 + 满计数：折出负数归 0");
	// 不是数字的脏值（null / 字符串 / NaN）不算「有记录」——不能拿默认值 0 冒充一个合法的旧计数
	assertEqual(legacyV14(null).bossPityLevel, 0, "null 不是可信计数 → 视同没有记录");
	assertEqual(legacyV14("x").bossPityLevel, 0, "非数字不是可信计数 → 视同没有记录");
	assertEqual(legacyV14(NaN).bossPityLevel, 0, "NaN 不是可信计数 → 视同没有记录");
	// 场景 A：v13 及更早的存档两个字段都不存在 → 补 0，绝不拿当前关卡反推历史记录
	const rawV13 = legacyRun(13);
	assertEqual(rawV13.bossPityLevel, 0, "第 45 关的 v13 旧档：没有记录就是 0（不是 44）");
	// 版本闸门（本轮修复点）：走哪条迁移路径只看**存档版本**，跨版本混进来的字段一律不作数
	assertEqual(legacyRun(13, { bossPityCount: 19 }).bossPityLevel, 0, "v13 意外混入旧计数器 → 不认，仍 0");
	assertEqual(legacyRun(13, { bossPityLevel: 25 }).bossPityLevel, 0, "v13 意外混入新版记录 → 不认，仍 0");
	assertEqual(legacyRun(13, { bossPityCount: 19, bossPityLevel: 25 }).bossPityLevel, 0, "v13 两个字段都混进来 → 仍 0");
	assertEqual(legacyRun(14, { bossPityCount: 19 }).bossPityLevel, 25, "v14 按旧计数器折算");
	assertEqual(legacyRun(14, { bossPityCount: 19, bossPityLevel: 40 }).bossPityLevel, 25, "v14 混入 bossPityLevel 40 也不跳过迁移，仍按计数器得 25");
	assertEqual(legacyRun(15, { bossPityLevel: 25, bossPityCount: 0 }).bossPityLevel, 25, "v15 保留合法记录（旁边压着旧计数器也不动）");
	assertEqual(legacyRun(15, { bossPityCount: 19 }).bossPityLevel, 0, "v15 记录缺失 → 0，不回退旧计数器");
	assertEqual(legacyRun(15, { bossPityLevel: "x", bossPityCount: 19 }).bossPityLevel, 0, "v15 记录非法 → 0，不回退旧计数器");
	// 版本号缺失/非法：与 migrateSlots 同一口径（`Number.isFinite(data.version) ? … : RUN_VERSION`）
	// → 按当前版本处理，既不认定成 v14、也不会回头吃旧计数器
	const noVersion = { ...freshRun(cfg.RUN_MODE.endless), level: 45, bossPityCount: 19 };
	delete noVersion.bossPityLevel;
	delete noVersion.version;
	assertEqual(state.normalizeRun(noVersion).bossPityLevel, 0, "版本号缺失 → 按当前版本：旧计数器不参与，补 0");
	assertEqual(state.normalizeRun({ ...noVersion, version: "abc" }).bossPityLevel, 0, "版本号非法 → 同上，补 0");
	assertEqual(state.normalizeRun({ ...noVersion, version: 99 }).bossPityLevel, 0, "版本号比当前新 → 同样只认新版字段（缺失即 0）");
	// 场景 D：新版记录缺失或非法时同样不产出非法值（按「没有记录」补 0）
	const missingLevel = { ...freshRun(cfg.RUN_MODE.endless), level: 45, bossPityLevel: null };
	assertEqual(state.normalizeRun(missingLevel).bossPityLevel, 0, "bossPityLevel 为 null → 按没有记录补 0");
	// 脏值全表扫一遍：无论输入什么，结果都只能是 [0, 本关] 的整数，绝不出现 NaN 或负数
	for (const [label, count] of [["缺失", undefined], ["null", null], ["字符串", "x"], ["NaN", NaN], ["负数", -5], ["超范围", 99], ["合法 0", 0], ["合法 7", 7]]) {
		const out = legacyV14(count).bossPityLevel;
		assert(Number.isInteger(out) && out >= 0 && out <= 45, `${label}(${String(count)}) 必须是 [0, 45] 的整数，实际 ${out}`);
	}
	// 已经折算过一次的存档不再迁移：v15 的 bossPityLevel 说了算，旁边压着的旧计数器不参与
	assertEqual(state.normalizeRun({ ...freshRun(cfg.RUN_MODE.endless), level: 45, bossPityLevel: 25, bossPityCount: 0 }).bossPityLevel, 25, "v15 存档以关卡记录为准，旧计数器不参与");
	assertEqual(state.normalizeRun({ ...freshRun(cfg.RUN_MODE.endless), level: 45, bossPityLevel: 0, bossPityCount: 19 }).bossPityLevel, 0, "新记录哪怕是 0 也不被旧计数器翻案");
	assertEqual(state.normalizeRun({ ...freshRun(cfg.RUN_MODE.endless), level: 45, bossPityLevel: null, bossPityCount: 19 }).bossPityLevel, 0, "v15 档的关卡记录非法时也不回头吃旧计数器（不得重复迁移）");
	// 折算的可见后果：记录只看关卡差，所以「保底到期」的旧档下一场直接是 Boss（只判无尽）
	assertEqual(enemy.shouldBossBattle(endless, 45, legacyV14(19).bossPityLevel, () => 0.999), true, `旧计数 19 → 45-25=20 ≥ ${pity}，保底已到期`);
	assertEqual(enemy.shouldBossBattle(endless, 45, legacyV14(0).bossPityLevel, () => 0.999), false, "旧计数 0 → 45-44=1，离保底还早，仍按概率");
	assertEqual(enemy.shouldBossBattle(endless, 45, rawV13.bossPityLevel, () => 0.999), true, `v13 无记录旧档（0）→ 45-0 ≥ ${pity}，保底已到期（0 只表示没有记录，不是刚出过 Boss）`);
	assertEqual(enemy.shouldBossBattle(cfg.RUN_MODE.challenge, 45, rawV13.bossPityLevel, boom), false, "同一份到期记录在闯关也不判 Boss（模式闸门优先于保底）");
	assertEqual(state.normalizeRun({ ...freshRun(), bossPityLevel: -5 }).bossPityLevel, 0, "负值归零");
	assertEqual(state.normalizeRun({ ...freshRun(), level: 9, bossPityLevel: 99 }).bossPityLevel, 9, "未来的关卡不认，夹到本关");
	assertEqual(state.normalizeRun({ ...freshRun(), bossPityLevel: "x" }).bossPityLevel, 0, "非法值按「还没出过」处理");
	const round = state.normalizeRun({ ...freshRun(), level: 30, bossPityLevel: 7 });
	assertEqual(round.bossPityLevel, 7, "合法值原样往返");
	assertEqual(state.normalizeRun(round).bossPityLevel, 7, "二次读档幂等（不会二次折算）");
	assertEqual(freshRun(cfg.RUN_MODE.endless).bossPityCount, undefined, "v15 起不再产出旧计数器字段");
	return "只判无尽 / 关卡差边界 / 跳关计入 / 提前命中重记 / 旧计数折表 0·14·15·19 / 往返";
});

check("虫洞跳关计入 Boss 保底：跳过的关照样推进关卡差，补满阈值那一关即保底", () => {
	const endless = cfg.RUN_MODE.endless;
	// 起跳点摆在「保底阈值前一关 - 10」：跳完十关正好落在阈值前一关，再推进一关就保底
	const from = cfg.BOSS_PITY_BATTLES - 11;
	const boom = () => {
		throw new Error("受保底保护时不应掷骰");
	};
	const run = { ...freshRun(cfg.RUN_MODE.endless), level: from, bossPityLevel: 0, currency: { gold: 0, exp: 0 }, curios: [] };
	// 进洞前：距上一次 Boss 才 from 关，掷不中就是普通场（数场次的老口径在这里也一样）
	assertEqual(enemy.shouldBossBattle(endless, from, run.bossPityLevel, () => 0.999), false, `第 ${from} 关仍按概率`);
	const pending = eventManager.buildPendingEvent("wormhole", from - 1, () => 0, NOW, { level: run.level, statLevels: run.stats, curios: run.curios, run });
	const settled = eventManager.resolveEventChoice({ ...run, pendingEvent: pending }, 0, {}, () => 0).run;
	assertEqual(settled.level, cfg.BOSS_PITY_BATTLES - 1, "进洞把关卡推到保底阈值前一关");
	assertEqual(settled.bossPityLevel, 0, "跳关本身不改保底记录（记录只在 Boss 真的触发时才写）");
	// 保底只读关卡：跳过的十关照样计入，所以离保底只剩「阈值 − 关卡差」场，而不是从头再数一整个阈值
	const toPity = cfg.BOSS_PITY_BATTLES - (settled.level - settled.bossPityLevel);
	assert(toPity > 0, `落点第 ${settled.level} 关尚未到保底（还差 ${toPity} 关）`);
	assertEqual(enemy.shouldBossBattle(endless, settled.level, settled.bossPityLevel, () => 0.999), false, "落点那关还没到保底，仍按概率");
	assertEqual(enemy.shouldBossBattle(endless, settled.level + toPity, settled.bossPityLevel, boom), true, `再推进 ${toPity} 关就保底（不掷骰；数场次的老口径会漏掉跳过的十关）`);
	// Boss 触发后记录翻到这一关：下一次保底在「这一关 + 阈值」
	const afterBoss = {
		...settled,
		currentBattle: { status: "battle", enemies: [{ characterId: "佐菲", boss: true }], rift: null, isBossBattle: true },
		bossPityLevel: settled.level,
	};
	assertEqual(enemy.shouldBossBattle(endless, settled.level + cfg.BOSS_PITY_BATTLES - 1, afterBoss.bossPityLevel, () => 0.999), false, "阈值前一关仍按概率");
	assertEqual(enemy.shouldBossBattle(endless, settled.level + cfg.BOSS_PITY_BATTLES, afterBoss.bossPityLevel, boom), true, `第 ${settled.level + cfg.BOSS_PITY_BATTLES} 关回到保底`);
	assertEqual(enemy.shouldBossBattle(cfg.RUN_MODE.challenge, settled.level + toPity, 0, boom), false, "同样到保底的关卡，闯关照样不判 Boss");
	assertEqual(state.cloneRun(afterBoss).bossPityLevel, settled.level, "cloneRun 原样带回记录");
	assertEqual(state.normalizeRun(afterBoss).bossPityLevel, settled.level, "读档仍认这一关（恢复存档不丢保底进度）");
	return `进洞前按概率 / 跳到第 ${settled.level} 关（差 ${toPity} 关）/ 补满即保底 / Boss 后记录翻新`;
});

check("10-06 实机旧档（v9，无尽 45 关）与新建存档归一化后对比：字段集合一致、判定字段全中性、进度原样保留、再读幂等", () => {
	// 该机器游戏 UserData/IndexedDB 里解出的真实旧档：写于 10-06，存档版本 9，
	// v10（challengeComboStages）/v11（bossRun）/v12（isBossBattle）/v13（pendingBossPenalty）的字段一个都还没有。
	// 「旧存档长期不触发 Boss 与奇物商店」的报告就是指这份形状——它读进来必须与新建存档行为同构。
	const realV9 = {
		version: 9,
		mode: "endless",
		characterId: "艾斯",
		level: 45,
		totalLevels: 0,
		challengeStages: [],
		currency: { gold: 14785, exp: 1402 },
		skills: ["olpaoxiao", "mbshiju", "repojun"],
		stats: { defense: 10, draw: 10, attack: 10 },
		currentBattle: null,
		shopOffers: [
			{ id: "jsrgzhengbing", price: 385, sold: false, carried: false },
			{ id: "sxrmqiewang", price: 294, sold: false, carried: false },
		],
		shopRefreshesRemaining: 0,
		pendingEvent: null,
		collection: { events: ["lost_robot", "wandering_merchant"], curios: ["loop_button"] },
		curios: ["loop_button", "energy_core", "cursed_coin", "broken_watch", "lucky_stone", "echo_bell"],
		curioQuality: { cursed_coin: "epic", loop_button: "epic" },
		curioOffers: [],
		curioOfferQueue: [],
		skillShopLocked: false,
		curioShopLocked: false,
		abyssDebt: 0,
		cleared: false,
		createdAt: 1791131233227,
		updatedAt: 1791281575494,
	};
	const old = state.normalizeRun(realV9);
	const fresh = state.createRun(cfg.RUN_MODE.endless, "迪迦", 1);
	// ① 字段集合一致：旧档不会缺字段、也不会多出下游判断不了的键（「旧档当新档用」的底线）
	assertEqual(JSON.stringify(Object.keys(old).sort()), JSON.stringify(Object.keys(fresh).sort()), "归一化后的字段集合与新建存档完全一致");
	// ② 判定用字段全部是中性值：逐场 Boss 判定、商店概率、事件、惩罚都从零开始，没有任何残留能绕过它们
	assertEqual(old.version, cfg.RUN_VERSION, "版本升到当前");
	assertEqual(old.bossRun, undefined, "不输出整局 bossRun（旧档本来也没有它）");
	assertEqual(old.currentBattle, null, "没有进行中的战斗");
	assertEqual(old.skillShopLocked, false, "没有橱窗 → 技能锁清零");
	assertEqual(old.curioShopLocked, false, "没有橱窗 → 奇物锁清零");
	assertEqual(old.pendingEvent, null, "无待处理事件");
	assertEqual(old.pendingBossPenalty, null, "无待处理惩罚");
	assertEqual(old.abyssDebt, 0, "无深渊债");
	// 这份旧档既没有 v14 的计数器也没有 v15 的关卡记录 → 没有可信的历史记录，按兼容约定补 0，
	// 绝不拿 45 关反推出一条假记录。注意 0 只表示「没有记录」而不是「刚出过 Boss」：
	// 这一档的下一场就是保底到期（45-0 ≥ 15），这是本轮口径的直接后果
	assertEqual(old.bossPityLevel, 0, "两个保底字段都没有 → 补 0（不按当前关卡反推）");
	assertEqual(JSON.stringify(old.curioOfferQueue), "[]", "无压着的候选批次");
	// ③ 进度照原样保留：等级/资源/奇物/品质/属性/刷新额度都不能被「迁移」洗掉
	assertEqual(old.level, 45, "关卡保留");
	assertEqual(old.currency.gold, 14785, "金币保留");
	assertEqual(old.currency.exp, 1402, "经验保留");
	assertEqual(JSON.stringify(old.curios), JSON.stringify(realV9.curios), "奇物保序保留");
	assertEqual(old.curioQuality.cursed_coin, "epic", "品质覆盖表保留");
	assertEqual(JSON.stringify(old.stats), JSON.stringify(realV9.stats), "属性等级保留");
	assertEqual(JSON.stringify(old.skills), JSON.stringify(realV9.skills), "旧档装备原样保留");
	assertEqual(JSON.stringify(old.skillInventory), JSON.stringify(realV9.skills), "旧档三个技能全部迁入背包（不丢、不截断）");
	assertEqual(old.shopRefreshesRemaining, 0, "刷新次数为 0 原样保留（读档不白送次数）");
	// ④ 过期候选的合法性清理由 store 层注入闸门负责；本层只做形状清洗，字符串 id 一律不剔
	assertEqual(old.shopOffers.length, 2, "缺省 options 下只做形状清洗");
	assertEqual(state.normalizeRun(old, { isSkillAllowed: () => false }).shopOffers.length, 0, "注入闸门后过期候选被清掉（真机读档走这条）");
	// ⑤ 反复归一化幂等：旧档被读第二遍、第三遍不会持续「变形」
	assertEqual(JSON.stringify(state.normalizeRun(old)), JSON.stringify(old), "二次归一化逐字节相同");
	return "45 关旧档：字段集合一致 / 判定字段中性 / 进度保留 / 幂等";
});

check("v11 旧档阵容带 boss 敌人但旧 bossRun 为 false：折算结果仍是普通战斗", () => {
	const run = state.normalizeRun({
		...freshRun(cfg.RUN_MODE.endless),
		bossRun: false,
		currentBattle: { status: "battle", enemies: [{ characterId: "佐菲", boss: true }], rift: null },
	});
	assertEqual(run.currentBattle.isBossBattle, false, "旧档判定为普通局时不因阵容里有 boss 敌人而翻案");
	assertEqual(run.currentBattle.enemies[0].boss, false, "普通旧档不会因为残留的 boss 字段拿到 Boss 体力强化");
	// 损坏的 legacy 入参（整局字段不是布尔）也绝不能被当成 Boss 场
	const junk = state.normalizeRun({
		...freshRun(cfg.RUN_MODE.endless),
		bossRun: "yes",
		currentBattle: { status: "battle", enemies: [{ characterId: "佐菲", boss: true }], rift: null },
	});
	assertEqual(junk.currentBattle.isBossBattle, false, "非 true 的旧字段按 false 处理");
	assertEqual(junk.currentBattle.enemies[0].boss, false, "非法旧字段同样不留 Boss 强化");
	// 旧档整局 bossRun=true 但阵容是多敌（v11 不可能出现形状，视作损坏）：折算出来的身份也要被形状校验挡掉
	const legacyMulti = state.normalizeRun({
		...freshRun(cfg.RUN_MODE.endless),
		bossRun: true,
		currentBattle: { status: "battle", enemies: [{ characterId: "佐菲", boss: true }, { characterId: "赛文", boss: true }], rift: null },
	});
	assertEqual(legacyMulti.currentBattle.isBossBattle, false, "多名敌人不是 Boss 战形状，旧字段也抬不动");
	assertEqual(legacyMulti.currentBattle.enemies.every(enemy => enemy.boss === false), true, "两名敌人都没有 Boss 强化");
	assertEqual(legacyMulti.currentBattle.enemies.length, 2, "旧档阵容不被删减");
	return "旧 false / 非法值 / 旧 true 但形状不符 三态";
});

check("旧档回退的边界：只有 isBossBattle 字段真的不存在才允许用 bossRun 折算", () => {
	/**
	 * 一份「整局 bossRun + 单个 boss 敌人」的存档形状。
	 * withField=false 表示存档里**根本没有** isBossBattle 这个键（真·v11 旧档）；
	 * 传了 isBossBattle 就按原样写进去（含 null / 非法值 / undefined）。
	 */
	const battleOf = ({ isBossBattle, withField = true, bossRun = true, enemies = [{ characterId: "佐菲", boss: true }] } = {}) => {
		const battle = { status: "battle", enemies, rift: null };
		if (withField) {
			battle.isBossBattle = isBossBattle;
		}
		return state.normalizeRun({ ...freshRun(cfg.RUN_MODE.endless), bossRun, currentBattle: battle }).currentBattle;
	};
	/** 把归一化结果原样当成存档再读一次：结果必须稳定，不能来回翻转 */
	const reread = battle => state.normalizeRun({
		...freshRun(cfg.RUN_MODE.endless),
		currentBattle: { status: battle.status, enemies: battle.enemies, rift: battle.rift, isBossBattle: battle.isBossBattle },
	}).currentBattle;
	// ① 字段真的不存在（v11 旧档）→ 才允许用 bossRun 折算，合法的进行中 Boss 战保住
	const migrated = battleOf({ withField: false });
	assertEqual(migrated.isBossBattle, true, "字段不存在才走旧档折算");
	assertEqual(migrated.enemies[0].boss, true, "折算后敌人 Boss 标记原样保留");
	assertEqual(JSON.stringify(reread(migrated)), JSON.stringify(migrated), "折算结果再读档保持稳定");
	// ② 字段存在但值是 null（异常存档）→ 不许旧版回退，安全降级为普通战斗
	//    （本轮修的缺陷：过去 `== null` 会把 null 与「缺字段」混为一谈）
	const nullField = battleOf({ isBossBattle: null });
	assertEqual(nullField.isBossBattle, false, "null 是非法值、不是「没这个字段」→ 不得借 bossRun 回退成 Boss 战");
	assertEqual(nullField.enemies[0].boss, false, "降级后清除敌人的 Boss 标记");
	assertEqual(JSON.stringify(reread(nullField)), JSON.stringify(nullField), "降级结果再读档稳定，不会重新变成 Boss 战");
	// ③ 字段存在且明确 false → 普通战斗，旧 bossRun 不得翻转
	const explicitFalse = battleOf({ isBossBattle: false });
	assertEqual(explicitFalse.isBossBattle, false, "明确 false 保持普通战斗");
	assertEqual(explicitFalse.enemies[0].boss, false, "敌人标记同样被抹平");
	// ④ 字段存在且是 null、整局旧字段也不是 true → 同样降级
	const nullWithPlainRun = battleOf({ isBossBattle: null, bossRun: false });
	assertEqual(nullWithPlainRun.isBossBattle, false, "null + 旧 bossRun=false → 普通战斗");
	assertEqual(nullWithPlainRun.enemies[0].boss, false, "敌人 Boss 标记清为 false");
	// ⑤ 其它非法值（字符串/数字/对象/undefined）一律安全降级，且重复读档不回退
	for (const bad of ["yes", 1, {}, undefined]) {
		const broken = battleOf({ isBossBattle: bad });
		assertEqual(broken.isBossBattle, false, `isBossBattle=${JSON.stringify(bad) ?? String(bad)} 属非法值 → 普通战斗`);
		assertEqual(broken.enemies[0].boss, false, `isBossBattle=${JSON.stringify(bad) ?? String(bad)} 不留 Boss 强化`);
		assertEqual(JSON.stringify(reread(broken)), JSON.stringify(broken), `isBossBattle=${JSON.stringify(bad) ?? String(bad)} 再读档不回退`);
	}
	// ⑥ 旧档回退仍然要过形状校验：多敌阵容与裂隙战都抬不动
	const legacyMulti = battleOf({ withField: false, enemies: [{ characterId: "佐菲", boss: true }, { characterId: "赛文", boss: true }] });
	assertEqual(legacyMulti.isBossBattle, false, "旧档回退也过不了多人形状校验");
	assertEqual(legacyMulti.enemies.length, 2, "多敌阵容不被删减");
	const riftSave = state.normalizeRun({
		...freshRun(cfg.RUN_MODE.endless),
		bossRun: true,
		currentBattle: { status: "battle", enemies: [{ characterId: "佐菲", boss: true }], rift: { level: 3, enemies: 1, affixes: 1, gold: 100, exp: 40 } },
	}).currentBattle;
	assertEqual(riftSave.isBossBattle, false, "旧档的裂隙战不参与 Boss 判定（字段缺失也不折算）");
	assertEqual(riftSave.enemies[0].boss, false, "裂隙战敌人不吃 Boss 强化");
	assertEqual(riftSave.rift.gold, 100, "裂隙的定死奖励参数原样保留");
	return "字段缺失兼容 / null·非法值降级 / 明确 false 不翻转 / 重复读档稳定 / 形状与裂隙闸门仍生效";
});

check("Boss 状态一致性：isBossBattle 是整场唯一权威标记，敌人的 boss 必须与它对得上", () => {
	// 一份「合法的 Boss 敌人」夹具：角色/属性/技能/深渊词缀/血量都齐备，用来验对齐时不丢数据
	const bossEnemy = () => ({
		characterId: "佐菲",
		stats: { defense: 3, draw: 5, attack: 2 },
		abyss: ["abyss_jianbi"],
		skills: ["test_enemy_skill"],
		skillSources: { test_enemy_skill: "赛文" },
		boss: true,
		maxHp: 2,
		hp: 1,
	});
	const runOf = (patch) => state.normalizeRun({
		...freshRun(cfg.RUN_MODE.endless),
		level: 4,
		currentBattle: { status: "battle", rift: null, ...patch },
	});
	const battleOf = (patch) => runOf(patch).currentBattle;
	/** 去掉 boss 字段后的形状：用来验证对齐只动这一个字段、绝不重建阵容 */
	const withoutBoss = entry => {
		const { boss, ...rest } = entry;
		return rest;
	};
	/** 与 bossEnemy 同内容、但**没有** boss 字段的条目（旧档/残缺形态），与「明确 boss: false」必须区别对待 */
	const plainEnemy = () => withoutBoss(bossEnemy());
	const rng = () => 0.999;
	const base = rewardsData.getEndlessReward(4, ["gold", "exp"]);
	// ① 整场 false + 敌人残留 boss: true（矛盾组合）：以整场标记为准抹掉敌人标记，其余字段原样保留
	const cleared = battleOf({ enemies: [bossEnemy()], isBossBattle: false });
	assertEqual(cleared.isBossBattle, false, "整场标记保持 false");
	assertEqual(cleared.enemies[0].boss, false, "普通场里不留 Boss 强化");
	assertEqual(JSON.stringify(withoutBoss(cleared.enemies[0])), JSON.stringify(withoutBoss(bossEnemy())), "除 boss 外每个字段原样保留（不重建阵容）");
	// 对齐过的数据再存再读必须稳定：不会来回翻转，也不会重掷
	assertEqual(JSON.stringify(battleOf({ enemies: cleared.enemies, isBossBattle: cleared.isBossBattle })), JSON.stringify(cleared), "二次归一化完全幂等");
	// 结算层拿到同一份状态：整场 false 就按普通奖励走，不翻倍、商店按概率（rng=0.999 未命中）
	const clearedWin = reward.settleVictory(runOf({ enemies: [bossEnemy()], isBossBattle: false }), NOW, rng);
	assertEqual(clearedWin.isBossBattle, false, "结算按普通场处理");
	assertEqual(clearedWin.gained.gold, base.gold, "矛盾状态修正后不再拿 20 倍");
	assertEqual(clearedWin.run.curioOffers.length, 0, "奇物商店按概率判定，未命中即空");
	// ② 整场 true + 敌人明确 boss: true（合法的进行中 Boss 战）：标记与倍率全部照常
	const legal = battleOf({ enemies: [bossEnemy()], isBossBattle: true });
	assertEqual(legal.isBossBattle, true, "合法 Boss 战原样保留");
	assertEqual(legal.enemies[0].boss, true, "敌人 Boss 标记原样保留");
	assertEqual(JSON.stringify(withoutBoss(legal.enemies[0])), JSON.stringify(withoutBoss(bossEnemy())), "合法场也不会被重建");
	const legalWin = reward.settleVictory(runOf({ enemies: [bossEnemy()], isBossBattle: true }), NOW, rng);
	assertEqual(legalWin.isBossBattle, true, "合法 Boss 战仍按 Boss 结算");
	assertEqual(legalWin.gained.gold, base.gold * cfg.BOSS_REWARD_MULTIPLIER, "合法 Boss 战金币仍拿 20 倍");
	assertEqual(legalWin.gained.exp, base.exp * cfg.BOSS_EXP_MULTIPLIER, "合法 Boss 战经验拿 8 倍");
	assertEqual(legalWin.run.curioOffers.length, 0, "奇物商店不再因 Boss 战特权刷新：rng=0.999 与普通场一样未命中");
	// ③ 整场 true 但敌人**明确写着** boss: false：存档自己说这名敌人是普通的，
	//    不许因为「只有一人」就升级成 Boss → 整场安全降级为普通战斗
	const explicitPlain = battleOf({ enemies: [{ ...bossEnemy(), boss: false }], isBossBattle: true });
	assertEqual(explicitPlain.isBossBattle, false, "明确的普通敌人把整场降为普通战斗");
	assertEqual(explicitPlain.enemies[0].boss, false, "敌人标记保持 false，不被强行改成 true");
	assertEqual(JSON.stringify(withoutBoss(explicitPlain.enemies[0])), JSON.stringify(withoutBoss(bossEnemy())), "降级只动标记，其余字段原样保留");
	assertEqual(JSON.stringify(battleOf({ enemies: explicitPlain.enemies, isBossBattle: explicitPlain.isBossBattle })), JSON.stringify(explicitPlain), "降级结果再归一化保持稳定（不来回翻转）");
	const downgradedWin = reward.settleVictory(runOf({ enemies: [{ ...bossEnemy(), boss: false }], isBossBattle: true }), NOW, rng);
	assertEqual(downgradedWin.isBossBattle, false, "降级场按普通战斗结算");
	assertEqual(downgradedWin.gained.gold, base.gold, "降级场拿 1 倍基准，不是 20 倍");
	assertEqual(downgradedWin.run.curioOffers.length, 0, "降级场不强制刷新奇物商店");
	// ④ 整场 true、单人、且存档**根本没有 boss 字段**：这才是可补齐的形态 —— 补齐后本场保持 Boss 身份
	const patched = battleOf({ enemies: [plainEnemy()], isBossBattle: true });
	assertEqual(patched.isBossBattle, true, "整场明确记着 Boss 战 → 保持 Boss 身份");
	assertEqual(patched.enemies[0].boss, true, "缺字段可补齐（与③的明确 false 是不同输入）");
	assertEqual(JSON.stringify(withoutBoss(patched.enemies[0])), JSON.stringify(withoutBoss(bossEnemy())), "补齐只加标记，其余字段原样保留");
	assertEqual(JSON.stringify(battleOf({ enemies: patched.enemies, isBossBattle: true })), JSON.stringify(patched), "补齐结果再归一化保持稳定");
	const patchedWin = reward.settleVictory(runOf({ enemies: [plainEnemy()], isBossBattle: true }), NOW, rng);
	assertEqual(patchedWin.gained.gold, base.gold * cfg.BOSS_REWARD_MULTIPLIER, "补齐后的这一场仍按 20 倍结算");
	// ⑤ 敌人 boss 是非法值（null / 字符串）：按「数据明确冲突」处理，降级且不补
	for (const bad of [null, "yes", 1, {}]) {
		const broken = battleOf({ enemies: [{ ...bossEnemy(), boss: bad }], isBossBattle: true });
		assertEqual(broken.isBossBattle, false, `boss=${JSON.stringify(bad)} 属非法值 → 整场降级`);
		assertEqual(broken.enemies[0].boss, false, `boss=${JSON.stringify(bad)} 不补标记`);
	}
	// ⑥ 整场 true 但形状不合法（多名敌人）→ 既不把普通敌人升级成 Boss，也不让无效阵容领 Boss 奖励
	const invalid = battleOf({ enemies: [bossEnemy(), { ...bossEnemy(), characterId: "赛文" }], isBossBattle: true });
	assertEqual(invalid.isBossBattle, false, "多名敌人不是 Boss 战的合法形状 → 整场降为普通");
	assertEqual(invalid.enemies.every(enemy => enemy.boss === false), true, "降级后两名敌人都没有 Boss 强化");
	assertEqual(invalid.enemies.length, 2, "敌人数量原样保留（不删人、不重建）");
	// ⑦ 裂隙场自带 true 也不参与 Boss 判定（它有另一套独立结算），rift 参数本身原样保留
	const rifted = battleOf({ enemies: [bossEnemy()], rift: { level: 3, enemies: 1, affixes: 1, gold: 100, exp: 40 }, isBossBattle: true });
	assertEqual(rifted.isBossBattle, false, "裂隙场一律按普通场处理");
	assertEqual(rifted.enemies[0].boss, false, "裂隙敌人不吃 Boss 强化");
	assertEqual(rifted.rift.gold, 100, "rift 的定死奖励参数原样保留");
	return "false+boss 抹平 / 合法场保留 / 明确 false 降级 / 缺字段补齐 / 非法值降级 / 多人降级 / 裂隙不参与";
});

check("Boss 战阵容：单敌、非禁将抽取、复制三个其他非禁将角色的全部技能、自带一个深渊强化", () => {
	Object.assign(lib.character, {
		测试甲: [4, "male", "ao", ["donor_a1", "donor_a2"], 1],
		测试乙: [4, "male", "ao", ["donor_b1", "donor_bad"], 1],
		测试丙: [4, "male", "ao", ["donor_c1"], 1],
		测试丁: [4, "male", "ao", ["donor_d1"], 1],
		本体测试将: [4, "male", "qun", [], 1],
	});
	Object.assign(lib.skill, {
		donor_a1: {}, donor_a2: {}, donor_b1: {}, donor_c1: {}, donor_d1: {},
		donor_bad: { zhuSkill: true },
	});
	try {
		// rng=0 恒取池首：用相对断言对前序用例残留的 lib.character 数据免疫
		const challengePool = enemy.getChallengeEnemyPool();
		assert(challengePool.length >= 1, "闯关池应有可用角色");
		const enemies = enemy.createBossEnemyConfig(3, cfg.RUN_MODE.challenge, () => 0);
		assertEqual(enemies.length, 1, "Boss 战只有 1 名敌人");
		const boss = enemies[0];
		assertEqual(boss.boss, true, "boss 标记随阵容落盘");
		assertEqual(boss.characterId, challengePool[0], "Boss 从当前模式敌方池抽取（闯关 = 扩展角色池）");
		// 来源抽取改成「对资格池无偏洗牌 + 按随机顺序现查技能、凑够三个即停」之后，rng=0 的
		// 可观察结果 = 洗牌后从前往后第一个、第二个、第三个**合法**来源。资格池里还有不带
		// 合法技能的残留角色（如上面的 本体测试将），它们只占洗牌位、不供能——所以直接断言
		// 「恰好三名夹具来源供能、第四名一个技能都不沾、每人贡献自己的全部合法技能」，
		// 不把结果钉死在具体人名上（对前序用例残留的 lib.character 数据免疫）
		const fixtureSkills = {
			测试甲: ["donor_a1", "donor_a2"],
			测试乙: ["donor_b1"],
			测试丙: ["donor_c1"],
			测试丁: ["donor_d1"],
		};
		const contributing = Object.entries(fixtureSkills)
			.filter(([, list]) => list.some(id => boss.skills.includes(id)));
		assertEqual(contributing.length, cfg.BOSS_SKILL_DONOR_COUNT,
			`恰好 ${cfg.BOSS_SKILL_DONOR_COUNT} 名来源供能（第四名不许沾）：实际 ${contributing.map(([id]) => id).join(",") || "无"}`);
		for (const [donor, list] of contributing) {
			assertEqual(JSON.stringify(list.filter(id => boss.skills.includes(id))), JSON.stringify(list),
				`来源「${donor}」应贡献自己的全部合法技能`);
		}
		assertEqual(boss.skills.length, contributing.reduce((n, [, list]) => n + list.length, 0),
			`复制列表只由这几名来源的技能组成：${boss.skills.join(",")}`);
		assertEqual([...new Set(Object.values(boss.skillSources))].length, cfg.BOSS_SKILL_DONOR_COUNT,
			"来源角色记在 skillSources 里随阵容落盘，且是三个不同的人");
		// 技能来源角色必须是非禁将的：来源可以是本扩展角色，也可以是别种来源，但禁将一律不供能
		assert(!boss.skills.includes("donor_bad"), "主公技等不兼容技能不得复制");
		assert(!boss.skills.includes("donor_b1") || boss.characterId !== "测试乙", "不能复制 Boss 自己的技能");
		// 深渊：正常计算（闯关恒为 0）之外固定追加 1 个
		assertEqual(boss.abyss.length, 1, "闯关 Boss 也固定自带 1 个深渊强化");
		assert(abyss.isAbyssAffixId(boss.abyss[0]), "自带的强化在词缀池里");
		// 无尽 234 层（rng=0 必中）：正常 3 个 + 自带 1 个 = 4 个，互不重复
		const endlessPool = enemy.getEndlessEnemyPool();
		assert(endlessPool.length >= 1, "无尽池应有可用角色");
		const late = enemy.createBossEnemyConfig(234, cfg.RUN_MODE.endless, () => 0);
		assertEqual(late[0].characterId, endlessPool[0], "无尽 Boss 来自本体池口径");
		assertEqual(late[0].abyss.length, 4, "234 层 Boss：正常 3 个 + 自带 1 个");
		assertEqual(new Set(late[0].abyss).size, 4, "正常随机与自带强化互不重复（不放回追加）");
		// 禁将绝不入选担当 Boss：把闯关池里除池首之外的角色全部禁掉，Boss 只能是池首
		lib.config.all = { mode: ["identity"] };
		lib.config.identity_banned = challengePool.slice(1);
		const forced = enemy.createBossEnemyConfig(3, cfg.RUN_MODE.challenge, () => 0);
		assertEqual(forced[0].characterId, challengePool[0], "被禁用的角色不能当 Boss");
		// 被禁掉的池成员同时也会退出来源资格池（它们不是夹具来源，本来就不供能），
		// 三名合法夹具来源照常各供各的全量技能——禁将过滤只认「来源武将本身」
		const forcedContributing = Object.entries(fixtureSkills)
			.filter(([, list]) => list.some(id => forced[0].skills.includes(id)));
		assertEqual(forcedContributing.length, cfg.BOSS_SKILL_DONOR_COUNT,
			`担当 Boss 的禁将过滤不影响来源抽取（来源只看禁将名单本身）：${forced[0].skills.join(",")}`);
		// 把来源角色也禁掉：禁将角色一律不再供能，剩下的来源不足三个就全用（不凑数、不重复）
		lib.config.identity_banned = [...challengePool.slice(1), "测试乙", "测试丁"];
		const bannedDonors = enemy.createBossEnemyConfig(3, cfg.RUN_MODE.challenge, () => 0);
		assertEqual(JSON.stringify(bannedDonors[0].skills), JSON.stringify(["donor_a1", "donor_a2", "donor_c1"]),
			`禁将角色不得当技能来源，剩下的两个来源全用：${bannedDonors[0].skills.join(",")}`);
		assertEqual([...new Set(Object.values(bannedDonors[0].skillSources))].sort().join(","), "测试丙,测试甲",
			"被禁的乙/丁一个都不在来源映射里");
		// 全员禁用：返回空阵容交给上层提示，而不是报错
		lib.config.identity_banned = challengePool;
		assertEqual(enemy.createBossEnemyConfig(3, cfg.RUN_MODE.challenge, () => 0).length, 0, "可用池为空返回空阵容");
		delete lib.config.identity_banned;
		delete lib.config.all;
		// 阵容可原样落盘读回（boss 标记与技能列表都是白名单字段），本场的 Boss 身份一起带走
		const stored = state.normalizeRun({ ...freshRun(), currentBattle: { status: "battle", enemies: forced, rift: null, isBossBattle: true } });
		assertEqual(stored.currentBattle.enemies[0].boss, true, "boss 标记读档保留");
		assertEqual(stored.currentBattle.isBossBattle, true, "本场 Boss 身份与阵容一起落盘、一起读回");
		assertEqual(JSON.stringify(stored.currentBattle.enemies[0].skills), JSON.stringify(forced[0].skills), "复制来的技能读档保留");
		return "单敌 / 禁将拦 Boss / 三来源全技能 / 禁将不供能 / 自带 1 强化 / 空池兜底";
	} finally {
		for (const id of ["测试甲", "测试乙", "测试丙", "测试丁", "本体测试将"]) {
			delete lib.character[id];
		}
		for (const id of ["donor_a1", "donor_a2", "donor_b1", "donor_c1", "donor_d1", "donor_bad"]) {
			delete lib.skill[id];
		}
		delete lib.config.identity_banned;
		delete lib.config.all;
	}
});

check("Boss 技能来源候选：禁将角色与 AI 不可操控的角色都不供能（技能只看来源武将）", () => {
	const prevForbidai = lib.config.forbidai;
	const prevAll = lib.config.all;
	const prevBanned = lib.config.identity_banned;
	Object.assign(lib.character, {
		来源禁AI: [4, "male", "ao", ["donor_forbidai"], 1],
		来源AI字段: [4, "male", "ao", ["donor_aifield"], 1],
		来源禁将: [4, "male", "ao", ["donor_banned", "donor_banned_only"], 1],
		来源混合: [4, "male", "ao", ["donor_mixed_ok", "donor_zhu"], 1],
		来源共有: [4, "male", "ao", ["donor_banned", "donor_shared_ok"], 1],
		本体测试将: [4, "male", "qun", [], 1],
	});
	// 注册后的角色条目是数组，本体把 isAiForbidden 挂在数组对象上，这里照同一形状写
	lib.character["来源AI字段"].isAiForbidden = true;
	for (const id of ["donor_forbidai", "donor_aifield", "donor_banned", "donor_banned_only", "donor_mixed_ok", "donor_shared_ok"]) {
		lib.skill[id] = {};
	}
	lib.skill.donor_zhu = { zhuSkill: true };
	lib.config.forbidai = ["来源禁AI"];
	lib.config.all = { mode: ["identity"] };
	lib.config.identity_banned = ["来源禁将"];
	try {
		const found = enemy.getBossSkillDonorCandidates("本体测试将");
		const ids = found.map(item => item.id);
		assert(!ids.includes("来源禁AI"), "forbidai 里的角色不能当技能来源");
		assert(!ids.includes("来源AI字段"), "isAiForbidden 的角色不能当技能来源");
		assert(!ids.includes("来源禁将"), "禁将角色不能当技能来源");
		// 角色过闸 ≠ 技能全过闸：同一条技能表里不兼容的那条照样被剔掉
		const mixed = found.find(item => item.id === "来源混合");
		assertEqual(JSON.stringify(mixed.skills), JSON.stringify(["donor_mixed_ok"]), "逐技能兼容性校验必须保留");
		// 禁将只看来源武将：donor_banned 挂在禁将角色身上，但这条供能来源本身没被禁 → 照样复制
		const shared = found.find(item => item.id === "来源共有");
		assertEqual(JSON.stringify(shared.skills), JSON.stringify(["donor_banned", "donor_shared_ok"]),
			"来源武将未被禁用时，与禁将角色共有的技能不得被连带过滤");
		// 端到端也拦得住：无论抽到哪三个来源，被禁 AI 与被禁将角色**独有**的技能都不许出现
		const challengePool = enemy.getChallengeEnemyPool();
		const boss = enemy.createBossEnemyConfig(3, cfg.RUN_MODE.challenge, () => 0)[0];
		assert(!boss.skills.includes("donor_forbidai") && !boss.skills.includes("donor_aifield"),
			`Boss 不得复制到 AI 不可操控角色的技能：${boss.skills.join(",")}`);
		assert(!boss.skills.includes("donor_banned_only"),
			`Boss 不得复制到禁将角色独有的技能：${boss.skills.join(",")}`);
		assertEqual(boss.characterId, challengePool[0], "Boss 本体抽取口径不变");
	} finally {
		for (const id of ["来源禁AI", "来源AI字段", "来源禁将", "来源混合", "来源共有", "本体测试将"]) {
			delete lib.character[id];
		}
		for (const id of ["donor_forbidai", "donor_aifield", "donor_banned", "donor_banned_only", "donor_mixed_ok", "donor_shared_ok", "donor_zhu"]) {
			delete lib.skill[id];
		}
		if (prevForbidai === undefined) { delete lib.config.forbidai; } else { lib.config.forbidai = prevForbidai; }
		if (prevAll === undefined) { delete lib.config.all; } else { lib.config.all = prevAll; }
		if (prevBanned === undefined) { delete lib.config.identity_banned; } else { lib.config.identity_banned = prevBanned; }
	}
	return "forbidai/isAiForbidden 拦来源 + 禁将不供能 + 共享技能按来源判定 + 逐技能校验仍在";
});

check("Boss 复制技能只看来源武将禁不禁：与禁将共有的技能完整复制，商店那道硬否决不变", () => {
	Object.assign(lib.character, {
		// 两个来源都没被禁将；shared_b 同时挂在禁将角色身上，且两个来源共有（验去重与来源记录）
		共享来源甲: [4, "male", "ao", ["shared_a", "shared_b", "shared_zhu"], 1],
		共享来源乙: [4, "male", "ao", ["shared_b", "shared_c"], 1],
		禁将同有: [4, "male", "ao", ["shared_b", "banned_only"], 1],
		本体测试将: [4, "male", "qun", [], 1],
	});
	Object.assign(lib.skill, {
		shared_a: {}, shared_b: {}, shared_c: {},
		shared_zhu: { zhuSkill: true },
		banned_only: {},
	});
	lib.config.all = { mode: ["identity"] };
	lib.config.identity_banned = ["禁将同有"];
	try {
		const found = enemy.getBossSkillDonorCandidates("本体测试将");
		const donor = found.find(item => item.id === "共享来源甲");
		assertEqual(JSON.stringify(donor.skills), JSON.stringify(["shared_a", "shared_b"]),
			"未禁将来源的两条合法技能都要供能，主公技照样剔掉");
		assert(!found.map(item => item.id).includes("禁将同有"), "禁将角色本身仍不得当技能来源");

		// 候选只有两个合法来源，全部用上（不足三个不凑数）：洗牌后 甲 在先，shared_b 由先到的甲供能、
		// 乙那边只留 shared_c；每条技能在列表里恰好出现一次
		const boss = enemy.createBossEnemyConfig(3, cfg.RUN_MODE.challenge, () => 0)[0];
		assertEqual(JSON.stringify(boss.skills), JSON.stringify(["shared_a", "shared_b", "shared_c"]),
			`候选不足三个就全用，同名技能去重：${boss.skills.join(",")}`);
		assertEqual(new Set(boss.skills).size, boss.skills.length, "复制列表不得出现重复技能");
		assertEqual(boss.skillSources.shared_b, "共享来源甲", "同名技能的来源记先到先得那一个");
		assert(!boss.skills.includes("banned_only"), "禁将角色独有的技能仍然不得复制");
		assert(!boss.skills.includes("shared_zhu"), "不兼容技能仍然不得复制");

		// 商店口径一个字都不动：这条共享技能在商城那道禁将复查里照旧是硬否决
		assertEqual(skillPool.isSkillBlockedByBan("shared_b"), true, "禁将复查（商店口径）不得放宽");
		assertEqual(skillPool.isSkillBlockedByBan("banned_only"), true, "禁将独有的技能照旧拦");
		assertEqual(skillPool.isSkillBlockedByBan("shared_a"), false, "与禁将无关的技能照旧放行");
	} finally {
		for (const id of ["共享来源甲", "共享来源乙", "禁将同有", "本体测试将"]) {
			delete lib.character[id];
		}
		for (const id of ["shared_a", "shared_b", "shared_c", "shared_zhu", "banned_only"]) {
			delete lib.skill[id];
		}
		delete lib.config.identity_banned;
		delete lib.config.all;
	}
	return "未禁来源完整复制 / 禁将不当来源 / 不兼容仍拦 / 跨来源去重 / 商店复查不变";
});

check("Boss 来源按需抽取：凑够三个来源就停手，不再对全库技能做深度扫描", () => {
	// 尺子选「技能表被真实遍历的次数」：skillsOf 会读角色的直接技能表，每扫一名角色就 +1。
	// 库的形状照真机来铺——绝大多数角色都是合法来源（真机 2618 人里 2506 个合法），
	// 噪声角色技能表用 getter 计数；再量同环境下「全量扫描 vs 按需抽取」各走了多少人
	const prevCharacter = {};
	const prevSkill = lib.skill.noise_shared;
	const prevName = lib.translate.noise_shared;
	const prevInfo = lib.translate.noise_shared_info;
	const fixtures = {};
	let walked = 0;
	lib.skill.noise_shared = {};
	lib.translate.noise_shared = "噪声技";
	lib.translate.noise_shared_info = "描述";
	for (let i = 0; i < 120; i++) {
		const id = `按需噪声${i}`;
		prevCharacter[id] = lib.character[id];
		fixtures[id] = {
			hp: 4,
			get skills() {
				walked++;
				return ["noise_shared"];
			},
		};
	}
	lib.character = { ...lib.character, ...fixtures };
	try {
		const mark = walked;
		enemy.getBossSkillDonorCandidates("占位Boss");
		const fullScan = walked - mark;
		assert(fullScan >= 120, `前提：全量扫描确实走遍了全部角色（实际 ${fullScan}）`);
		const mark2 = walked;
		const donors = enemy.pickBossSkillDonors("占位Boss", makeRng(20261015));
		const lazyScan = walked - mark2;
		assertEqual(donors.length, cfg.BOSS_SKILL_DONOR_COUNT, "按需抽取照常凑够三名来源");
		assert(lazyScan * 10 < fullScan,
			`按需抽取只走了 ${lazyScan} 名角色，应远小于全量扫描的 ${fullScan} 名`);
		assert(lazyScan <= 20,
			`按需抽取的扫描人数应贴着「凑够三名」这个量级：${lazyScan}`);
	} finally {
		for (const id of Object.keys(fixtures)) {
			if (prevCharacter[id] === undefined) {
				delete lib.character[id];
			} else {
				lib.character[id] = prevCharacter[id];
			}
		}
		if (prevSkill === undefined) {
			delete lib.skill.noise_shared;
		} else {
			lib.skill.noise_shared = prevSkill;
		}
		if (prevName === undefined) {
			delete lib.translate.noise_shared;
		} else {
			lib.translate.noise_shared = prevName;
		}
		if (prevInfo === undefined) {
			delete lib.translate.noise_shared_info;
		} else {
			lib.translate.noise_shared_info = prevInfo;
		}
	}
	return "凑够即停：扫描人数远小于全量";
});

check("Boss 来源抽取的公平性：资格池均匀排列，各合法来源中签概率一致", () => {
	// 受控资格池：12 个合法来源 + 4 个没有合法技能的角色。均匀随机排列 + 按序取前三，
	// 等价于从 12 个合法来源里无放回均匀抽样——每个来源当「第一名」的次数应接近 3000/12=250
	const backup = lib.character;
	const fixtures = {};
	const skillBackup = {};
	const translateBackup = {};
	const validIds = [];
	for (let i = 0; i < 12; i++) {
		const id = `公平来源${i}`;
		fixtures[id] = [4, "male", "ao", [`fair_skill_${i}`], 1];
		skillBackup[`fair_skill_${i}`] = lib.skill[`fair_skill_${i}`];
		lib.skill[`fair_skill_${i}`] = {};
		translateBackup[`fair_skill_${i}`] = lib.translate[`fair_skill_${i}`];
		translateBackup[`fair_skill_${i}_info`] = lib.translate[`fair_skill_${i}_info`];
		lib.translate[`fair_skill_${i}`] = `公平技${i}`;
		lib.translate[`fair_skill_${i}_info`] = "描述";
		validIds.push(id);
	}
	for (let i = 0; i < 4; i++) {
		fixtures[`无技能${i}`] = [4, "male", "ao", [`unregistered_fair_${i}`], 1];
	}
	try {
		lib.character = fixtures;
		const rng = makeRng(4242);
		const firsts = new Map(validIds.map(id => [id, 0]));
		const seen = new Set();
		for (let i = 0; i < 3000; i++) {
			const donors = enemy.pickBossSkillDonors("占位Boss", rng, cfg.BOSS_SKILL_DONOR_COUNT);
			assertEqual(donors.length, cfg.BOSS_SKILL_DONOR_COUNT, "每轮都恰好三名来源");
			assertEqual(new Set(donors.map(donor => donor.id)).size, cfg.BOSS_SKILL_DONOR_COUNT, "同一轮来源不重复");
			assert(donors.every(donor => validIds.includes(donor.id)), "没有合法技能的合格角色绝不当来源");
			firsts.set(donors[0].id, firsts.get(donors[0].id) + 1);
			for (const donor of donors) {
				seen.add(donor.id);
			}
		}
		const values = [...firsts.values()];
		assertEqual(values.reduce((sum, value) => sum + value, 0), 3000, "每一轮的第一名都落在 12 个合法来源里");
		assertEqual(seen.size, 12, "3000 轮里全部合法来源都被抽到过");
		assert(Math.min(...values) > 190 && Math.max(...values) < 310,
			`第一名分布应接近均匀（期望 250）：${JSON.stringify(Object.fromEntries(firsts))}`);
	} finally {
		lib.character = backup;
		for (const [id, value] of Object.entries(skillBackup)) {
			if (value === undefined) {
				delete lib.skill[id];
			} else {
				lib.skill[id] = value;
			}
		}
		for (const [id, value] of Object.entries(translateBackup)) {
			if (value === undefined) {
				delete lib.translate[id];
			} else {
				lib.translate[id] = value;
			}
		}
	}
	return "3000 轮统计：第一名分布均匀、来源不重复、无技能角色零供能";
});

check("兼容性缓存不掺禁将：技能定义换掉立即重判，禁将名单变化立刻反映到来源候选", () => {
	const skillBackup = lib.skill.cache_probe;
	const nameBackup = lib.translate.cache_probe;
	const infoBackup = lib.translate.cache_probe_info;
	const characterBackup = lib.character["禁将来源探针"];
	const prevAll = lib.config.all;
	try {
		lib.translate.cache_probe = "缓存探针";
		lib.translate.cache_probe_info = "描述";
		lib.skill.cache_probe = { content: async () => {} };
		assertEqual(skillPool.isRogueSkillAllowed("cache_probe"), true, "干净定义先判为可上架");
		// ① 定义被换成另一个对象：缓存必须按新对象重判，不能沿用旧结论
		lib.skill.cache_probe = { content: async () => {}, zhuSkill: true };
		assertEqual(skillPool.isRogueSkillAllowed("cache_probe"), false, "换成主公技定义后立即重判为不可上架");
		lib.skill.cache_probe = { content: async () => {} };
		assertEqual(skillPool.isRogueSkillAllowed("cache_probe"), true, "再换回来立即重新放行");
		// ② 兼容性缓存只依赖技能定义，禁将信息每次现读：同一会话里禁将名单变化，来源立刻跟着变
		lib.character["禁将来源探针"] = [4, "male", "ao", ["cache_probe"], 1];
		assert(enemy.getBossSkillDonorIdPool("占位Boss").includes("禁将来源探针"), "前提：未禁将时它在来源资格池里");
		lib.config.all = { mode: ["identity"] };
		lib.config.identity_banned = ["禁将来源探针"];
		assert(!enemy.getBossSkillDonorIdPool("占位Boss").includes("禁将来源探针"), "禁将后立刻退出资格池（不读历史判断）");
		assert(!enemy.getBossSkillDonorCandidates("占位Boss").some(item => item.id === "禁将来源探针"),
			"完整候选列表同样现读禁将名单");
	} finally {
		lib.config.identity_banned = undefined;
		delete lib.config.identity_banned;
		if (prevAll === undefined) {
			delete lib.config.all;
		} else {
			lib.config.all = prevAll;
		}
		if (characterBackup === undefined) {
			delete lib.character["禁将来源探针"];
		} else {
			lib.character["禁将来源探针"] = characterBackup;
		}
		if (skillBackup === undefined) {
			delete lib.skill.cache_probe;
		} else {
			lib.skill.cache_probe = skillBackup;
		}
		for (const [id, value] of [["cache_probe", nameBackup], ["cache_probe_info", infoBackup]]) {
			if (value === undefined) {
				delete lib.translate[id];
			} else {
				lib.translate[id] = value;
			}
		}
	}
	return "定义换掉即重判 / 禁将现读现算 / 两处口径同步";
});

check("Boss 技能来源不排除本扩展角色：注册过、技能过了兼容闸就能供能", () => {
	const extIds = [...enemy.getExtensionCharacterIds()];
	assert(extIds.length > 0, "角色包应给出本扩展角色 id");
	const extId = extIds[0];
	// Boss 本人用夹具角色，不用 extIds[0]：来源扫描只排除「Boss 本人」，
	// 而闯关敌人池的第一名恰恰就是 extIds[0]，拿它当 Boss 会把要验的角色当成排除对象。
	const prevCharacter = lib.character[extId];
	const prevSkill = lib.skill.donor_ext;
	try {
		// 用真实的本扩展角色 id，但把技能表换成夹具技能：断言只关心「本扩展角色能不能当来源」，
		// 不依赖该角色实际有哪些技能（换角色包也不会红）。
		lib.character[extId] = [4, "male", "ao", ["donor_ext"], 1];
		lib.skill.donor_ext = {};
		const found = enemy.getBossSkillDonorCandidates("本体测试将");
		const donor = found.find(item => item.id === extId);
		assert(!!donor, `本扩展角色 ${extId} 应能进入 Boss 技能来源候选`);
		assert(donor.skills.includes("donor_ext"), "其通过校验的技能应可被复制");
		// 来源不属于当前模式的常规敌人池也照样供能：无尽池刻意排除本扩展角色，那是本体抽取的口径
		const endlessPool = enemy.getEndlessEnemyPool();
		assert(!endlessPool.includes(extId), "前提：无尽常规敌人池不含本扩展角色，但它照样能当技能来源");
	} finally {
		if (prevCharacter === undefined) { delete lib.character[extId]; } else { lib.character[extId] = prevCharacter; }
		if (prevSkill === undefined) { delete lib.skill.donor_ext; } else { lib.skill.donor_ext = prevSkill; }
	}
	return `本扩展角色 ${extId} 可作为 Boss 技能来源`;
});

check("Boss 复制技能不含本体直接已有的技能（只比直接技能表，不做 group/derivation 展开）", () => {
	const pool = enemy.getChallengeEnemyPool();
	const bossId = pool[0];
	const prevBoss = lib.character[bossId];
	const fixtureDonors = [];
	for (let i = 1; i <= 12; i++) {
		fixtureDonors.push({ id: `共有来源${i}`, skills: ["own_shared", `donor_new_${i}`] });
	}
	try {
		// Boss 本体带 own_shared + own_only；每个夹具来源都共有 own_shared，另带一条自己的新技能。
		// 铺 12 个来源是为了让「至少有一个夹具来源真被抽中」成为可断言的前提，
		// 否则「own_shared 没出现在复制列表里」可能是空转。
		lib.character[bossId] = [4, "male", "ao", ["own_shared", "own_only"], 1];
		for (const donor of fixtureDonors) {
			lib.character[donor.id] = [4, "male", "ao", donor.skills, 1];
		}
		for (const id of ["own_shared", "own_only"]) {
			lib.skill[id] = {};
		}
		for (let i = 1; i <= 12; i++) {
			lib.skill[`donor_new_${i}`] = {};
		}
		const boss = enemy.createBossEnemyConfig(3, cfg.RUN_MODE.challenge, () => 0)[0];
		assert(boss.skills.some(id => id.startsWith("donor_new_")),
			`前提：夹具来源应真的被选中，否则本用例是空转：${boss.skills.join(",")}`);
		assert(!boss.skills.includes("own_shared"),
			`本体已有的直接技能不该再进复制技能列表：${boss.skills.join(",")}`);
		assert(!boss.skills.includes("own_only"), `本体独有技能同样不该出现：${boss.skills.join(",")}`);
		assert(!boss.skills.includes(bossId), "复制列表里不该出现角色 id");
	} finally {
		if (prevBoss === undefined) { delete lib.character[bossId]; } else { lib.character[bossId] = prevBoss; }
		for (const donor of fixtureDonors) {
			delete lib.character[donor.id];
		}
		for (const id of ["own_shared", "own_only"]) {
			delete lib.skill[id];
		}
		for (let i = 1; i <= 12; i++) {
			delete lib.skill[`donor_new_${i}`];
		}
	}
	return "与本体直接技能同名的 id 在生成阶段就被滤掉";
});

check("Boss 复制技能来源随阵容落盘，读档只留合法条目、旧档不伪造", () => {
	const prevDonor = lib.character["来源甲"];
	try {
		lib.character["来源甲"] = [4, "male", "ao", ["src_a1", "src_a2"], 1];
		for (const id of ["src_a1", "src_a2"]) {
			lib.skill[id] = {};
		}
		// ① 生成端：每条复制来的技能都记下来源角色
		const boss = enemy.createBossEnemyConfig(3, cfg.RUN_MODE.challenge, () => 0)[0];
		assert(boss.skills.length > 0, `夹具应当能复制到技能：${boss.skills.join(",")}`);
		for (const id of boss.skills) {
			const donor = boss.skillSources[id];
			assert(typeof donor === "string" && donor && donor !== boss.characterId,
				`复制技能 ${id} 应记下来源角色（且不是 Boss 本人）：${JSON.stringify(donor)}`);
			assert(Object.prototype.hasOwnProperty.call(lib.character, donor), `来源 ${donor} 应是真实角色`);
		}
		for (const id of Object.keys(boss.skillSources)) {
			assert(boss.skills.includes(id), `来源映射不得带没有复制的技能：${id}`);
		}
		// ② 落盘原样读回
		const stored = state.normalizeRun({
			...freshRun(),
			currentBattle: { status: "battle", isBossBattle: true, rift: null, enemies: [boss] },
		});
		assertEqual(JSON.stringify(stored.currentBattle.enemies[0].skillSources), JSON.stringify(boss.skillSources),
			"来源映射随存档读回");
		// ③ 清洗：值非字符串、键不在 skills 里的一律丢掉
		const dirty = { ...boss, skills: ["src_a1"], skillSources: { src_a1: "来源甲", src_ghost: "来源甲", src_a2: 42, "": "来源甲" } };
		const cleaned = state.normalizeRun({
			...freshRun(),
			currentBattle: { status: "battle", isBossBattle: true, rift: null, enemies: [dirty] },
		});
		assertEqual(JSON.stringify(cleaned.currentBattle.enemies[0].skillSources), JSON.stringify({ src_a1: "来源甲" }),
			"来源映射按 skills 白名单清洗");
		// ④ 旧档没有这个字段 → 空对象（面板据此不显示来源，绝不倒推一个来源）
		const legacy = { ...boss, skillSources: undefined };
		const revived = state.normalizeRun({
			...freshRun(),
			currentBattle: { status: "battle", isBossBattle: true, rift: null, enemies: [legacy] },
		});
		assertEqual(JSON.stringify(revived.currentBattle.enemies[0].skillSources), JSON.stringify({}),
			"旧档没有来源字段 → 空对象，不伪造来源");
	} finally {
		if (prevDonor === undefined) { delete lib.character["来源甲"]; } else { lib.character["来源甲"] = prevDonor; }
		for (const id of ["src_a1", "src_a2"]) {
			delete lib.skill[id];
		}
	}
	return "来源落盘 + 白名单清洗 + 旧档不伪造";
});

check("rogue_copy 是纯标记载体：有 mark 没有效果，双键翻译齐备", () => {
	const copy = skillsData.helpers.rogue_copy;
	assert(!!copy, "复制技能载体应随 helpers 导出（mode.js 展开 helpers 即注册）");
	assert(copy.mark === true && copy.marktext === "复制技能", "应是「复制技能」徽记载体");
	assert(copy.trigger === undefined && copy.content === undefined && copy.mod === undefined && copy.filter === undefined,
		"载体不许带任何效果：它只负责多一枚可点的徽记");
	assert(copy.intro?.nocount === true && copy.popup === false, "应不弹大字、不计入技能数");
	lib.skill.rogue_copy_probe = {};
	lib.translate.rogue_copy_probe = "探针技<hr>探针的描述";
	const html = copy.intro.mark(null, ["rogue_copy_probe", "rogue_copy_missing"], null);
	assert(html.includes("探针技") && html.includes("rogue_copy_missing"), `徽记说明应逐条列技能名：${html}`);
	// 描述只在点开的面板里出现，徽记浮窗不铺开长文
	assert(!html.includes("探针的描述"), "浮窗只给技能名，描述归面板");
	assertEqual(copy.intro.mark(null, [], null).includes("无复制技能"), true, "空列表给「无复制技能」");
	assertEqual(skillsData.helperTranslate.rogue_copy, "复制技能", "双键翻译的名字要在");
	assert(!!skillsData.helperTranslate.rogue_copy_info, "双键翻译的描述要在（本体只认 id/id_info 双键）");
	delete lib.translate.rogue_copy_probe;
	delete lib.skill.rogue_copy_probe;
	return "载体无效果 / 浮窗列名 / 空列表有兜底文案";
});

check("Boss 深渊标签链路：追加带 boss 标签，词缀清洗排在身份校准之后，普通敌人不保留专属强化", () => {
	// 夹具：一条带 tags 的专属强化。词缀池里没有实际配置 tags 的项（不为了测试上线真的专属技），
	// 所以临时插一条，测完在 finally 里原样摘掉——留着会污染按池子数断言的其它用例。
	const fixture = { id: "abyss_fixture_boss", weight: 1, enabled: true, tags: [abyssConfig.BOSS_AFFIX_TAG] };
	abyssConfig.AFFIX_POOL.unshift(fixture);
	// 夹具排在池首：normalizeAbyssIds 按池子顺序重排，所以保留时它在前
	const both = JSON.stringify(["abyss_fixture_boss", "abyss_buqu"]);
	const entryOf = (patch) => ({
		characterId: "本体测试将", stats: {}, abyss: ["abyss_fixture_boss", "abyss_buqu"],
		skills: [], maxHp: 0, hp: 0, ...patch,
	});
	const readBack = (battle, patch) => state.normalizeRun({
		...freshRun(cfg.RUN_MODE.endless), ...patch, currentBattle: { status: "battle", rift: null, ...battle },
	});
	// 本用例位置上前序用例已删掉若干角色：自己登记一个本体侧角色，保证无尽池非空
	const prevTestChar = lib.character["本体测试将"];
	lib.character["本体测试将"] = [4, "male", "qun", [], 1];
	try {
		assert(enemy.getEndlessEnemyPool().length > 0, "前提：无尽敌方池非空");
		// ① 生成：常规那一份按关卡口径（不带标签，所以 Boss 照样随到通用强化），固定追加的那一份带标签
		const boss = enemy.createBossEnemyConfig(1, cfg.RUN_MODE.endless, () => 0)[0];
		assert(boss.abyss.includes("abyss_fixture_boss"),
			`Boss 的固定追加应能随到带 boss 标签的强化：${boss.abyss.join(",")}`);
		assert(boss.abyss.includes("abyss_buqu"), `常规强化仍从通用池来：${boss.abyss.join(",")}`);
		// ② 普通敌人不得因为这条标签获得专属强化
		for (const entry of enemy.createEnemyConfigs(1, cfg.RUN_MODE.endless, () => 0)) {
			assert(!entry.abyss.includes("abyss_fixture_boss"), `普通敌人不得随到专属强化：${entry.abyss.join(",")}`);
		}
		// ③ 合法 Boss 读档：专属强化必须还在
		const keep = readBack({ isBossBattle: true, enemies: [entryOf({ boss: true })] });
		assertEqual(keep.currentBattle.isBossBattle, true, "整场仍是 Boss 战");
		assertEqual(JSON.stringify(keep.currentBattle.enemies[0].abyss), both, "Boss 的专属强化读档后还在");
		// ④ 普通敌人读档：专属强化剔除
		const drop = readBack({ isBossBattle: false, enemies: [entryOf({ boss: false })] });
		assertEqual(JSON.stringify(drop.currentBattle.enemies[0].abyss), JSON.stringify(["abyss_buqu"]),
			"普通敌人不得保留 Boss 专属强化");
		// ⑤ 关键顺序：整场写着 Boss 战、敌人却漏了 boss 字段（残缺形态）。补齐之后专属强化仍要在——
		//    清洗若排在校准之前，这里会先被默认空标签删掉，补回 boss 也找不回来。
		const patched = readBack({ isBossBattle: true, enemies: [entryOf({})] });
		assertEqual(patched.currentBattle.enemies[0].boss, true, "缺失的 boss 字段被补齐");
		assertEqual(JSON.stringify(patched.currentBattle.enemies[0].abyss), both, "补齐 Boss 身份后专属强化必须还在");
		// ⑥ v11 旧档（没有 isBossBattle、带整局 bossRun、阵容里有 boss 敌人才折算）
		const legacy = readBack({ enemies: [entryOf({ boss: true })] }, { version: 11, bossRun: true });
		assertEqual(legacy.currentBattle.isBossBattle, true, "旧档按既有规则折算成本场 Boss 战");
		assertEqual(JSON.stringify(legacy.currentBattle.enemies[0].abyss), both, "旧档折算后专属强化还在");
		// ⑦ 无效形状（多名敌人）：整场降级，谁都不许留专属强化
		const multi = readBack({ isBossBattle: true, enemies: [entryOf({ boss: true }), entryOf({ boss: true })] });
		assertEqual(multi.currentBattle.isBossBattle, false, "多人形状不是 Boss 战的合法形状");
		for (const entry of multi.currentBattle.enemies) {
			assertEqual(JSON.stringify(entry.abyss), JSON.stringify(["abyss_buqu"]), "降级后专属强化一并剔除");
		}
	} finally {
		abyssConfig.AFFIX_POOL.shift();
		if (prevTestChar === undefined) { delete lib.character["本体测试将"]; } else { lib.character["本体测试将"] = prevTestChar; }
	}
	return "生成带标签 / 校准后再清洗 / 普通敌人剔除 / 旧档与补齐仍保留";
});

check("禁将复查：单条技能属于当前禁将角色（含衍生技、含共享）一律拦截", () => {
	Object.assign(lib.character, {
		复查甲: [4, "male", "ao", ["bancheck_shared"], 1],
		复查乙: [4, "male", "ao", ["bancheck_owned"], 1],
		复查丙: [4, "male", "ao", ["bancheck_derived"], 1],
	});
	lib.skill.bancheck_shared = {};
	lib.skill.bancheck_owned = {};
	lib.skill.bancheck_derived = { derivation: ["bancheck_child"] };
	try {
		assertEqual(skillPool.isSkillBlockedByBan("bancheck_owned"), false, "没人禁用时放行");
		lib.config.all = { mode: ["identity"] };
		lib.config.identity_banned = ["复查甲", "复查丙"];
		assertEqual(skillPool.isSkillBlockedByBan("bancheck_shared"), true, "禁将角色的共享技能也要拦（哪怕别人也拥有）");
		assertEqual(skillPool.isSkillBlockedByBan("bancheck_derived"), true, "禁将技能本身被拦");
		assertEqual(skillPool.isSkillBlockedByBan("bancheck_child"), true, "禁将技能的衍生技被拦");
		assertEqual(skillPool.isSkillBlockedByBan("bancheck_owned"), false, "未禁将角色的技能放行");
		assertEqual(skillPool.isSkillBlockedByBan("不存在的技能"), false, "未知技能不误报");
		assertEqual(skillPool.isSkillBlockedByBan(null), false, "非法入参安全返回");
		return "共享/本体/衍生/放行/未知 五态";
	} finally {
		for (const id of ["复查甲", "复查乙", "复查丙"]) {
			delete lib.character[id];
		}
		for (const id of ["bancheck_shared", "bancheck_owned", "bancheck_derived", "bancheck_child"]) {
			delete lib.skill[id];
		}
		delete lib.config.identity_banned;
		delete lib.config.all;
	}
});

check("Boss 战胜利：本场标记回传 + 金币 20 倍 / 经验 8 倍（不吃奇物加成）+ 奇物商店只按概率刷，下一场普通战斗不受牵连", () => {
	const rng = () => 0.999;
	// rng 钉在 0.999：这一掷无论 Boss 还是普通场都不刷奇物商店（0.999 ≥ 10%）
	// v12：Boss 身份只写在「刚打完的这一场」currentBattle.isBossBattle 上
	const run = state.normalizeRun({
		...freshRun(cfg.RUN_MODE.endless),
		level: 4,
		currentBattle: { status: "battle", enemies: [{ characterId: "佐菲", boss: true }], rift: null, isBossBattle: true },
	});
	const base = rewardsData.getEndlessReward(4, ["gold", "exp"]);
	const bossWin = reward.settleVictory(run, NOW, rng);
	assertEqual(bossWin.isBossBattle, true, "本场标记随结算回传（next 里 currentBattle 已清空，只能靠回传）");
	assertEqual(bossWin.gained.gold, base.gold * cfg.BOSS_REWARD_MULTIPLIER, "金币 = 20 倍本关胜利金币");
	assertEqual(bossWin.gained.exp, base.exp * cfg.BOSS_EXP_MULTIPLIER, "经验 = 8 倍本关胜利经验");
	assertEqual(bossWin.run.curioOffers.length, 0, "Boss 战胜利不再强制刷新奇物商店：rng=0.999 就按未命中清空");
	assertEqual(bossWin.run.level, run.level + 1, "关卡照常推进");
	assertEqual(bossWin.run.currentBattle, null, "本场战斗状态已清理");
	assertEqual(bossWin.run.shopRefreshesRemaining, cfg.SKILL_REFRESH_PER_LEVEL, "免费刷新次数照常恢复");
	// 反过来也得验：命中概率时 Boss 场照常出货——它现在吃的就是普通场那一条概率
	const hit = reward.settleVictory(run, NOW, () => 0.05);
	assert(hit.run.curioOffers.length > 0, "0.05 < 10% 时 Boss 场与普通场一样刷出一批");
	// 关键：Boss 的倍率只生效这一次。下一场是普通战斗（currentBattle 已空 = 由 flow 重新判定），
	// 结算必须回到 1 倍基准、商店按概率不刷——绝不能把 Boss 规则带给下一关
	const nextNormal = reward.settleVictory(bossWin.run, NOW, rng);
	assertEqual(nextNormal.isBossBattle, false, "下一场不再是 Boss 战");
	assertEqual(nextNormal.gained.gold, rewardsData.getEndlessReward(5, ["gold"]).gold, "下一场按 1 倍基准");
	assertEqual(nextNormal.gained.exp, rewardsData.getEndlessReward(5, ["exp"]).exp, "下一场经验也不加倍");
	assertEqual(nextNormal.run.curioOffers.length, 0, "下一场 rng=0.999 不刷奇物商店");
	// 带金币/经验加成的奇物也不叠加： LuckyStone(+10% 经验) / 诅咒金币(±金币) 对 Boss 奖励无效
	const boosted = state.normalizeRun({ ...run, curios: ["lucky_stone", "cursed_coin"] });
	assertEqual(boosted.currentBattle.isBossBattle, true, "加奇物后本场身份不变");
	const boostedWin = reward.settleVictory(boosted, NOW, rng);
	assertEqual(boostedWin.gained.gold, bossWin.gained.gold, "金币加成不叠到 Boss 奖励上");
	assertEqual(boostedWin.gained.exp, bossWin.gained.exp, "经验加成不叠到 Boss 奖励上");
	// 对照：普通场同 rng 下 1 倍基准、商店不刷（普通战斗显式记 isBossBattle: false）
	const normalWin = reward.settleVictory(state.normalizeRun({
		...freshRun(cfg.RUN_MODE.endless),
		level: 4,
		currentBattle: { status: "battle", enemies: [{ characterId: "佐菲" }], rift: null, isBossBattle: false },
	}), NOW, rng);
	assertEqual(normalWin.isBossBattle, false, "普通场回传 false");
	assertEqual(normalWin.gained.gold, base.gold, "普通场保持 1 倍基准");
	assertEqual(normalWin.gained.exp, base.exp, "普通场经验不加倍");
	assertEqual(normalWin.run.curioOffers.length, 0, "普通场 rng=0.999 不刷奇物商店");
	// 收藏家的橱窗（史诗档）锁着旧货：Boss 场不再有任何特权，与普通场一样整批留货
	const locked = state.normalizeRun({
		...freshRun(cfg.RUN_MODE.endless),
		level: 4,
		curios: ["collector_showcase"],
		curioQuality: { collector_showcase: "epic" },
		curioShopLocked: true,
		curioOffers: [{ id: "energy_core", price: 100 }],
		currentBattle: { status: "battle", enemies: [{ characterId: "佐菲", boss: true }], rift: null, isBossBattle: true },
	});
	const lockedWin = reward.settleVictory(locked, NOW, rng);
	assertEqual(lockedWin.run.curioOffers.map(offer => offer.id).join(","), "energy_core", "锁着的旧货原样保留（Boss 场不再强刷顶替）");
	assertEqual(lockedWin.run.curioOffers[0].price, 100, "连价定死的那一份也保留");
	return `第 4 关 Boss 金币 ${base.gold * 20} / 经验 ${base.exp * 8}，下一场回 1 倍 + 商店改回按概率、锁照常生效`;
});

check("统一失去技能：从背包删除、已装备的同时卸下、遗忘之石/贪食魔盒按件结算", () => {
	const base = state.normalizeRun({
		...freshRun(cfg.RUN_MODE.endless),
		level: 31,
		currency: { gold: 0, exp: 0 },
		skills: [SKILL_A, SKILL_B],
		skillInventory: [SKILL_A, SKILL_B, SKILL_C],
		curios: ["oblivion_stone", "gluttonous_box"],
	});
	const reward = rewardsData.getEndlessReward(31, ["gold", "exp"]);
	// 单件：失去背包里未装备的那个 → 只从背包删、装备不动、按件发奖
	const one = penalty.loseSkill(base, SKILL_C, NOW);
	assert(one.ok, one.error ?? "背包里有的技能应当可以失去");
	assertEqual(one.removed, SKILL_C, "回传被删除的技能");
	assertEqual(JSON.stringify(one.run.skillInventory), JSON.stringify([SKILL_A, SKILL_B]), "从背包删除");
	assertEqual(JSON.stringify(one.run.skills), JSON.stringify([SKILL_A, SKILL_B]), "未装备的不动装备");
	assertEqual(one.gold, reward.gold * 10, "遗忘之石：10 倍本层胜利金币");
	assertEqual(one.exp, reward.exp * 10, "贪食魔盒：10 倍本层胜利经验");
	assertEqual(one.run.currency.gold, one.gold, "金币入账");
	assertEqual(one.run.currency.exp, one.exp, "经验入账");
	assertEqual(one.lines.length, 2, "两件奇物各出一条结算行");
	// 已装备的：同时从装备位卸下
	const equipped = penalty.loseSkill(base, SKILL_A, NOW);
	assertEqual(JSON.stringify(equipped.run.skills), JSON.stringify([SKILL_B]), "已装备的被一并卸下");
	assertEqual(JSON.stringify(equipped.run.skillInventory), JSON.stringify([SKILL_B, SKILL_C]), "背包同步删除");
	// 批量（Boss 清算走这条）：一次失去 3 个 → 按件累加三次奖励
	const all = penalty.loseSkills(base, [SKILL_A, SKILL_B, SKILL_C], NOW);
	assert(all.ok, all.error ?? "批量失去应当成功");
	assertEqual(all.removed.length, 3, "三个都删掉");
	assertEqual(JSON.stringify(all.run.skills), JSON.stringify([]), "装备清空");
	assertEqual(JSON.stringify(all.run.skillInventory), JSON.stringify([]), "背包清空");
	assertEqual(all.gold, reward.gold * 10 * 3, "金币按件累加");
	assertEqual(all.exp, reward.exp * 10 * 3, "经验按件累加");
	// 没有遗忘之石/贪食魔盒：删除照常、一分钱不发
	const plain = { ...base, curios: [] };
	const plainLost = penalty.loseSkill(plain, SKILL_C, NOW);
	assert(plainLost.ok && plainLost.gold === 0 && plainLost.exp === 0, "没有对应奇物就不发奖");
	assertEqual(plainLost.run.currency.gold, 0, "金币不动");
	// 未拥有 / 重复删除：ok:false 且零副作用（绝不偷偷再发一次奖）
	const notOwned = penalty.loseSkill(base, "rogue_none", NOW);
	assert(!notOwned.ok && notOwned.run === base && notOwned.removed === null, "未拥有 → ok:false 零副作用");
	const again = penalty.loseSkill(one.run, SKILL_C, NOW);
	assert(!again.ok && again.run === one.run, "重复执行同一删除不再派奖励");
	// 卸下不算失去：unequipSkill 只动装备、背包留人、不发奖（与 loseSkill 是两件事）
	const unequipped = shop.unequipSkill(base, SKILL_A);
	assert(unequipped.ok, unequipped.error ?? "卸下应成功");
	assertEqual(JSON.stringify(unequipped.run.skillInventory), JSON.stringify([SKILL_A, SKILL_B, SKILL_C]), "卸下后技能仍留在背包");
	assertEqual(unequipped.run.currency.gold, 0, "卸下不触发遗忘之石");
	// 传入的 run 一个字节都不动
	assertEqual(JSON.stringify(base.skills), JSON.stringify([SKILL_A, SKILL_B]), "传入 run 不被原地修改");
	assertEqual(JSON.stringify(base.skillInventory), JSON.stringify([SKILL_A, SKILL_B, SKILL_C]), "背包同样不被原地修改");
	return "单件/批量/无奇物/零副作用 + 卸下不算失去";
});

check("技能失去奖励的基准关卡：Boss 结算必须传刚打赢的那一关，不能读推进后的 level", () => {
	const wonLevel = 2;
	// 真跑一次 Boss 胜利结算：无尽结算会把 level 从 2 推进到 3 —— 这正是「误用下一关基准」的来源
	const atBoss = state.normalizeRun({
		...freshRun(cfg.RUN_MODE.endless),
		level: wonLevel,
		currency: { gold: 0, exp: 0 },
		skills: [SKILL_A, SKILL_B, SKILL_C],
		skillInventory: [SKILL_A, SKILL_B, SKILL_C],
		curios: ["oblivion_stone", "gluttonous_box"],
		currentBattle: { status: "battle", enemies: [{ characterId: "佐菲", boss: true }], rift: null, isBossBattle: true },
	});
	const settled = reward.settleVictory(atBoss, NOW, () => 0.999);
	assertEqual(settled.run.level, wonLevel + 1, "胜利结算已把关卡推进到下一关");
	const goldBefore = settled.run.currency.gold;
	const expBefore = settled.run.currency.exp;
	const wonBase = rewardsData.getEndlessReward(wonLevel, ["gold", "exp"]);
	const nextBase = rewardsData.getEndlessReward(wonLevel + 1, ["gold", "exp"]);
	assert(wonBase.gold !== nextBase.gold && wonBase.exp !== nextBase.exp, "两关基准必须不同，否则这个用例分辨不出用了哪一关");
	// Boss 流程（flow/result.js 的做法）：显式传刚打赢的那一关，遗石/魔盒都按它的基准 ×10 ×件数
	const fixed = penalty.loseSkills(settled.run, [SKILL_A, SKILL_B, SKILL_C], NOW, wonLevel);
	assert(fixed.ok, fixed.error ?? "批量失去应当成功");
	assertEqual(fixed.gold, wonBase.gold * 10 * 3, `遗忘之石 = 第 ${wonLevel} 关基准 ${wonBase.gold} ×10 ×3 件`);
	assertEqual(fixed.exp, wonBase.exp * 10 * 3, `贪食魔盒 = 第 ${wonLevel} 关基准 ${wonBase.exp} ×10 ×3 件`);
	assert(fixed.gold !== nextBase.gold * 10 * 3, "奖励不得按推进后的下一关基准算");
	// 显式基准不是 Boss 倍率：它必须是**基础奖励**，绝不叠 ×20 金币 / ×8 经验
	assert(fixed.gold !== wonBase.gold * cfg.BOSS_REWARD_MULTIPLIER * 10 * 3, "不得拿乘过 20 倍的金币当基准");
	assert(fixed.exp !== wonBase.exp * cfg.BOSS_EXP_MULTIPLIER * 10 * 3, "不得拿乘过 8 倍的经验当基准");
	// 与原口径的对照：不传基准时仍读 run.level（事件熔炉、失败惩罚等路径一个字没变）
	const byRunLevel = penalty.loseSkills(settled.run, [SKILL_A, SKILL_B, SKILL_C], NOW);
	assertEqual(byRunLevel.gold, nextBase.gold * 10 * 3, "不传基准时按 run.level 现算（其余路径的原口径）");
	assertEqual(byRunLevel.exp, nextBase.exp * 10 * 3, "经验同理");
	// 单件版与两个奖励函数本身都要认这个可选基准
	assertEqual(penalty.loseSkill(settled.run, SKILL_C, NOW, wonLevel).gold, wonBase.gold * 10, "单件版认显式基准");
	assertEqual(curioManager.getSkillLossRewardGold(settled.run, wonLevel), wonBase.gold * 10, "奖励函数认显式基准");
	assertEqual(curioManager.getSkillLossRewardExp(settled.run, wonLevel), wonBase.exp * 10, "奖励函数认显式基准（经验）");
	assertEqual(curioManager.getSkillLossRewardGold(settled.run), nextBase.gold * 10, "不传时仍按 run.level（原口径）");
	// 没有对应奇物时，显式基准也不改变「一分钱不发」
	const bare = { ...settled.run, curios: [] };
	const nothing = penalty.loseSkills(bare, [SKILL_A], NOW, wonLevel);
	assert(nothing.ok && nothing.gold === 0 && nothing.exp === 0, "没有奇物照样不发奖");
	// 传入的 run 不被原地修改（基准只是读数，不写档）
	assertEqual(JSON.stringify(settled.run.skills), JSON.stringify([SKILL_A, SKILL_B, SKILL_C]), "传入 run 不被原地修改");
	assertEqual(settled.run.currency.gold, goldBefore, "传入 run 的货币一分不动");
	assertEqual(settled.run.currency.exp, expBefore, "同上（经验）");
	return `第 ${wonLevel} 关 Boss：遗石 ${wonBase.gold * 10} ×3 件 / 魔盒 ${wonBase.exp * 10} ×3 件`;
});

check("v13 旧档的基准还原：按推进规则反推「刚打赢的那一关」", () => {
	const at = patch => state.normalizeRun({ ...freshRun(cfg.RUN_MODE.endless), ...patch });
	// 无尽：每胜利必 +1 → 档案里的 level 是「下一关」
	assertEqual(penalty.recoverBossWonLevel(at({ mode: "endless", level: 46 })), 45, "无尽第 46 关的档案 → 刚打赢的是第 45 关");
	// 闯关没打完最后一关：同样 +1
	assertEqual(penalty.recoverBossWonLevel(at({ mode: "challenge", level: 5, totalLevels: 30, cleared: false })), 4, "闯关推进过 → level - 1");
	// 闯关刚好打通最后一关：level 原地不动、只记 cleared → 刚打赢的就是 level 本身
	assertEqual(penalty.recoverBossWonLevel(at({ mode: "challenge", level: 30, totalLevels: 30, cleared: true })), 30, "通关那一局 level 不推进 → 基准就是 level");
	// 下限与非法值：绝不返回 0 或负数（第 1 关是最低档）
	assertEqual(penalty.recoverBossWonLevel(at({ mode: "endless", level: 1 })), 1, "最低第 1 关");
	assertEqual(penalty.recoverBossWonLevel({ mode: "endless", level: Number.NaN }), 1, "非法 level 兜底第 1 关");
	assertEqual(penalty.recoverBossWonLevel(null), 1, "空存档兜底第 1 关");
	// 与显式基准合流：迁移路径把反推值当第 4 参传下去，最终算式与正常 Boss 结算同一份
	const archive = at({
		mode: "endless",
		level: 46,
		currency: { gold: 0, exp: 0 },
		skills: [SKILL_A, SKILL_B],
		skillInventory: [SKILL_A, SKILL_B],
		curios: ["oblivion_stone", "gluttonous_box"],
	});
	const wonLevel = penalty.recoverBossWonLevel(archive);
	const wonBase = rewardsData.getEndlessReward(wonLevel, ["gold", "exp"]);
	const advancedBase = rewardsData.getEndlessReward(46, ["gold", "exp"]);
	assert(wonBase.gold !== advancedBase.gold && wonBase.exp !== advancedBase.exp, "第 45 / 46 关基准必须不同，否则分辨不出用了哪一关");
	const lost = penalty.loseSkills(archive, [SKILL_A, SKILL_B], NOW, wonLevel);
	assertEqual(lost.gold, wonBase.gold * 10 * 2, "迁移清算按反推出的第 45 关基准 ×10 ×2 件");
	assertEqual(lost.exp, wonBase.exp * 10 * 2, "经验同理");
	assert(lost.gold !== advancedBase.gold * 10 * 2, "不得按档案里已推进的第 46 关算");
	return `无尽 46 → 45 / 闯关 5 → 4 / 通关 30 → 30 / 下限 1`;
});

check("黄金罗盘：刷新概率按存档实算、存档之间互不影响、边界夹住", () => {
	const base = cfg.CURIO_SHOP_RATE;
	const saveOf = curios => state.normalizeRun({ ...freshRun(cfg.RUN_MODE.endless), curios });
	const plain = saveOf([]);
	const owned = saveOf(["golden_compass"]);
	assertEqual(curioManager.getCurioShopChance(plain), base, "无罗盘 = 基础概率");
	assertEqual(curioManager.getCurioShopChance(owned), base + 0.1, "初始品质罗盘 = 基础 + 10 个百分点");
	// 存档之间互不影响：先算有罗盘的那份、再算没罗盘的那份，结果不许被前一次「带跑」（没有全局缓存）
	assertEqual(curioManager.getCurioShopChance(owned), base + 0.1, "连着算两次同一个存档结果一致");
	assertEqual(curioManager.getCurioShopChance(plain), base, "算过别人的罗盘之后，无罗盘存档仍是基础概率");
	// 描述与判定同源：奇物文案里的百分数就是加进判定线的那个数
	const line = curioManager.describeCurio("golden_compass")[0];
	const quoted = Number(line.match(/(\d+)%/)?.[1]);
	assertEqual(quoted, Math.round((curioManager.getCurioShopChance(owned) - base) * 100), "文案报的百分点 == 实际抬高的判定线");
	// 图鉴只读定义，绝不能把「曾经拥有过」当成本存档的效果
	assertEqual(curioManager.getCurioUpgradeTrack("golden_compass").length, 1, "罗盘只有史诗一档（初始即链尾）");
	// 边界：叠出 100% 以上只夹到 1，非法入参与缺字段按基础概率
	assertEqual(curioManager.getCurioShopChance({ curios: Array(20).fill("golden_compass") }), 1, "上限夹到 100%");
	assertEqual(curioManager.getCurioShopChance({}), base, "缺字段按无奇物算");
	assertEqual(curioManager.getCurioShopChance(null), base, "null 不抛错");
	// 读档往返：概率不从存档里读，永远按此刻持有的奇物现算
	assertEqual(curioManager.getCurioShopChance(state.cloneRun(owned)), base + 0.1, "cloneRun 后仍是基础 + 10 个百分点");
	return `无罗盘 ${Math.round(base * 100)}% / 有罗盘 ${Math.round((base + 0.1) * 100)}% / 上限 100%`;
});

check("黄金罗盘：额外候选批次的旧档仍能显示、购买、读档恢复，且新结算绝不重复生成", () => {
	const legacy = state.normalizeRun({
		...freshRun(cfg.RUN_MODE.endless),
		currency: { gold: 5000, exp: 5000 },
		curios: ["golden_compass"],
		curioOffers: [{ id: "broken_watch", price: 100 }],
		curioOfferQueue: [[{ id: "energy_core", price: 120 }], [], ["nope"]],
	});
	assertEqual(legacy.curioOfferQueue.length, 1, "读档洗掉空批与下架货，合法那批原样留着、不重摇");
	assertEqual(JSON.stringify(legacy.curioOfferQueue[0]), JSON.stringify([{ id: "energy_core", price: 120 }]), "价格随存档定死");
	// 新规则同场限购：买完继续显示已购卡，旧存档队列改在下一场胜利后提上货架。
	const bought = curioManager.buyCurio(legacy, "broken_watch");
	assertEqual(bought.ok, true, "买得掉");
	assertEqual(JSON.stringify(bought.run.curioOffers), JSON.stringify([{ id: "broken_watch", price: 100, sold: true }]), "购买后原卡继续显示");
	assertEqual(bought.run.curioOfferQueue.length, 1, "旧队列暂存到下一场胜利");
	const advanced = reward.settleVictory(bought.run, NOW, () => 0.999).run;
	assertEqual(JSON.stringify(advanced.curioOffers), JSON.stringify([{ id: "energy_core", price: 120 }]), "下一次胜利后队列提上货架");
	assertEqual(advanced.curioOfferQueue.length, 0, "提完即空");
	// 重进页面 / 反复读档都不会凭空多出一批
	const again = state.cloneRun(advanced);
	assertEqual(again.curioOfferQueue.length, 0, "读档不重复生成");
	// 新一次胜利结算：命中也只留这一批
	const settled = reward.settleVictory(legacy, NOW, seq([0])).run;
	assert(settled.curioOffers.length > 0, "rng=0 命中 → 有货");
	assertEqual(settled.curioOfferQueue.length, 0, "新口径不再生产第二批");
	return "旧队列可显示可购买 / 读档不重复生成";
});

check("未知实验室：预掷 ±1 两分支各自兑现、存档往返不重掷不反转、上下限不破", () => {
	const ids = cfg.STAT_IDS;
	const mk = (stats, rolls) => {
		const run = state.normalizeRun({ ...freshRun(cfg.RUN_MODE.endless), level: 6, stats });
		const pending = eventManager.buildPendingEvent("unknown_lab", 5, seq(rolls), NOW, {
			level: 7, statLevels: run.stats, curios: [], run,
		});
		return { run: { ...run, pendingEvent: pending }, pending };
	};
	// 第一掷决定 ±：≤0.5 增益、>0.5 减益；第二掷定具体属性
	const up = mk({ defense: 3, draw: 2, attack: 2 }, [0.1, 0.2]);
	const down = mk({ defense: 3, draw: 2, attack: 2 }, [0.9, 0.2]);
	assertEqual(up.pending.choices[0].reward.statUp, ids[0], "增益分支当场定死具体属性");
	assertEqual(down.pending.choices[0].reward.statDown, ids[0], "减益分支当场定死具体属性");
	const upDone = eventManager.resolveEventChoice(up.run, 0, {}, seq([0.5]));
	const downDone = eventManager.resolveEventChoice(down.run, 0, {}, seq([0.5]));
	assertEqual(upDone.run.stats[ids[0]], 4, "增益那一支 +1");
	assertEqual(downDone.run.stats[ids[0]], 2, "减益那一支 -1（不许跟着描述变号）");
	assertEqual(upDone.run.pendingEvent, null, "结算后事件收掉");
	// 只动被点到的那一项，其余两项原样
	assertEqual(downDone.run.stats[ids[1]], 2, "没点到的属性不动");
	assertEqual(downDone.run.stats[ids[2]], 2, "没点到的属性不动");
	// 读档 / 重进页面 / 重复渲染都不重掷、不反转
	for (let i = 0; i < 3; i++) {
		const revived = state.cloneRun(down.run);
		assertEqual(JSON.stringify(revived.pendingEvent.choices[0].reward), JSON.stringify({ statDown: ids[0] }), `第 ${i + 1} 次读档结果不变`);
	}
	// 结算只看存档里定死的那一项，不看事件描述、也不看选项序号
	const swapped = state.normalizeRun({
		...freshRun(cfg.RUN_MODE.endless),
		level: 6,
		stats: { defense: 4, draw: 1, attack: 0 },
		pendingEvent: {
			id: "unknown_lab",
			choices: [
				{ text: "进入", reward: { statDown: "draw" } },
				{ text: "离开", reward: { statUp: "attack" } },
			],
			createdAt: NOW,
		},
	});
	const pickDown = eventManager.resolveEventChoice(swapped, 0, {}, seq([0.5]));
	assertEqual(pickDown.run.stats.draw, 0, "选项 0 写着减益就必减");
	assertEqual(pickDown.run.stats.attack, 0, "没点的选项一个字都不生效");
	// 上下限：满级走增益不越界、零级走减益不为负、也不反过来涨
	const maxed = state.normalizeRun({
		...freshRun(cfg.RUN_MODE.endless),
		level: 6,
		stats: Object.fromEntries(ids.map(id => [id, statsData.stats[id].maxLevel])),
		pendingEvent: { id: "unknown_lab", choices: [{ text: "进入", reward: { statUp: ids[0] } }], createdAt: NOW },
	});
	const capped = eventManager.resolveEventChoice(maxed, 0, {}, seq([0.5]));
	assertEqual(capped.run.stats[ids[0]], statsData.stats[ids[0]].maxLevel, "满级增益保持满级");
	assert(capped.lines.some(line => line.includes("已达最高等级")), `满级要说清未生效：${capped.lines}`);
	const floor = state.normalizeRun({
		...freshRun(cfg.RUN_MODE.endless),
		level: 6,
		stats: { defense: 0, draw: 0, attack: 0 },
		pendingEvent: { id: "unknown_lab", choices: [{ text: "进入", reward: { statDown: ids[0] } }], createdAt: NOW },
	});
	const floored = eventManager.resolveEventChoice(floor, 0, {}, seq([0.5]));
	assertEqual(floored.run.stats[ids[0]], 0, "零级减益停在 0，绝不出现负等级");
	assert(floored.lines.some(line => line.includes("已是最低等级")), `零级要说清未生效：${floored.lines}`);
	return "±1 两支各兑现 / 三次读档不变 / 上下限守住";
});

check("Boss 惩罚改为玩家自选：候选只认真实持有、删除各归各的账、欠项随存档往返", () => {
	const base = state.normalizeRun({
		...freshRun(cfg.RUN_MODE.endless),
		skills: [SKILL_A, SKILL_B],
		curios: ["energy_core", "cursed_coin"],
		curioQuality: { energy_core: "rare", cursed_coin: "common" },
		collection: { events: [], curios: ["energy_core", "cursed_coin", "broken_watch"] },
		pendingBossPenalty: { reason: "bossVictory", needSkill: true, needCurio: true },
	});
	// 候选名单 = 这一局真实持有的购买技能与奇物（角色本体技能从来不在 run.skills 里）
	const targets = penalty.getBossPenaltyTargets(base);
	assertEqual(JSON.stringify(targets.skills), JSON.stringify([SKILL_A, SKILL_B]), "技能栏只列已购买技能");
	assertEqual(JSON.stringify(targets.curios), JSON.stringify(["energy_core", "cursed_coin"]), "奇物栏只列当前持有");
	assertEqual(JSON.stringify(penalty.getBossPenaltyTargets(null)), JSON.stringify({ skills: [], curios: [] }), "空入参安全返回空表");
	// 选奇物：只删点到的那件，品质条目一并清掉、别的品质留着、图鉴一个字不动
	const lostCurio = penalty.loseCurio(base, "cursed_coin", NOW);
	assertEqual(lostCurio.ok, true, "持有即能删");
	assertEqual(JSON.stringify(lostCurio.run.curios), JSON.stringify(["energy_core"]), "只删点到的那件");
	assertEqual(lostCurio.run.curioQuality.cursed_coin, undefined, "品质覆盖表不留悬挂条目");
	assertEqual(lostCurio.run.curioQuality.energy_core, "rare", "没被删的奇物品质保留");
	assertEqual(JSON.stringify(lostCurio.run.collection.curios), JSON.stringify(["energy_core", "cursed_coin", "broken_watch"]), "图鉴「曾经拥有过」不受影响");
	assertEqual(JSON.stringify(base.curios), JSON.stringify(["energy_core", "cursed_coin"]), "传入的 run 不被原地修改");
	// 没持有的东西删不动，且不产生任何副作用
	const notOwned = penalty.loseCurio(base, "broken_watch", NOW);
	assert(!notOwned.ok && notOwned.run === base && notOwned.removed === null, "未拥有 → ok:false 且零副作用");
	// 选技能：从背包删除，同时解除装备（这两个技能本来就装备着）
	const lostSkill = penalty.loseSkill(base, SKILL_A, NOW);
	assertEqual(lostSkill.ok, true, "已拥有技能可删");
	assertEqual(JSON.stringify(lostSkill.run.skills), JSON.stringify([SKILL_B]), "只删点到的那一个");
	assertEqual(JSON.stringify(lostSkill.run.skillInventory), JSON.stringify([SKILL_B]), "背包同步删除");
	assertEqual(lostSkill.run.pendingBossPenalty.needCurio, true, "删技能不该顺手把奇物那项也标记成已还（欠项各记各的）");
	// 欠项状态随存档往返：部分兑现后读档，只欠没还的那几项，绝不重新随机
	const halfDone = { ...lostCurio.run, pendingBossPenalty: { reason: "bossVictory", needSkill: true, needCurio: false } };
	const revived = state.cloneRun(halfDone);
	assertEqual(JSON.stringify(revived.pendingBossPenalty), JSON.stringify({ reason: "bossVictory", needSkill: true, needCurio: false }), "读档回到同一个待处理惩罚");
	assertEqual(revived.curios.length, 1, "已删掉的那件不会回来");
	// 两项都还清 / 形状非法 / 旧档缺字段 —— 一律归 null，读档后绝不会停在无处可点的页上
	assertEqual(state.cloneRun({ ...halfDone, pendingBossPenalty: { reason: "bossVictory", needSkill: false, needCurio: false } }).pendingBossPenalty, null, "还清即归 null");
	assertEqual(state.cloneRun({ ...halfDone, pendingBossPenalty: { reason: "别的", needSkill: true } }).pendingBossPenalty, null, "认不出的 reason 不认");
	assertEqual(state.cloneRun({ ...halfDone, pendingBossPenalty: "x" }).pendingBossPenalty, null, "非法类型安全归 null");
	assertEqual(freshRun(cfg.RUN_MODE.endless).pendingBossPenalty, null, "新档不欠惩罚");
	// v12 及更早的旧档没有这个字段：那一版随机惩罚当场就已兑现，读档绝不能凭空补出一笔债
	const legacy = state.normalizeRun({ ...freshRun(cfg.RUN_MODE.endless), version: 12 });
	assertEqual(legacy.pendingBossPenalty, null, "旧档不补待处理惩罚");
	// v13 旧档的 needSkill: true 原样保留（由流程层按新规则做一次性自动清算，绝不在清洗层动手）
	const v13 = state.normalizeRun({ ...freshRun(cfg.RUN_MODE.endless), version: 13, pendingBossPenalty: { reason: "bossVictory", needSkill: true, needCurio: false } });
	assertEqual(JSON.stringify(v13.pendingBossPenalty), JSON.stringify({ reason: "bossVictory", needSkill: true, needCurio: false }), "v13 的欠技能标记读档保留，等流程层清算");
	assertEqual(JSON.stringify(state.normalizeRun(v13).pendingBossPenalty), JSON.stringify(v13.pendingBossPenalty), "清洗层幂等、绝不重复处罚");
	return "候选现读 / 各删各的 / 欠项往返 / 旧档不补债";
});

check("玩家可见事件文案：指代胜利奖励的一律「本层胜利金币/本层胜利经验」", () => {
	const banned = [/基准金币/, /基准经验/, /基准奖励/];
	const visible = [];
	for (const def of Object.values(eventsData.events)) {
		visible.push(["事件名", def.id, def.name], ["事件描述", def.id, def.description]);
		for (const choice of def.choices ?? []) {
			visible.push(
				["选项文案", def.id, choice.text],
				["选项提示", def.id, choice.blockedText ?? ""],
				// 子页文案（skillForge 的 subtitle / pickLabel）同样是玩家看到的字
				["子页文案", def.id, choice.action?.subtitle ?? ""],
				["子页按钮", def.id, choice.action?.pickLabel ?? ""],
			);
			for (const item of choice.outcomes ?? []) {
				visible.push(["随机结果说明", def.id, item.text ?? ""]);
			}
		}
	}
	// 奇物效果、事件结算行这一类由代码生成的说明也一起扫（它们同样是玩家看到的字）
	for (const id of curiosData.curioIds) {
		for (const quality of curioManager.CURIOSITY_QUALITY_CHAIN) {
			visible.push(["奇物效果", id, curioManager.describeCurio(id, { [id]: quality }).join(" / ")]);
		}
	}
	const offenders = [];
	for (const [kind, id, text] of visible) {
		for (const pattern of banned) {
			if (pattern.test(text)) {
				offenders.push(`${kind}「${id}」含 ${pattern}：${text}`);
			}
		}
	}
	assertEqual(offenders.join("；"), "", "玩家可见文案不得出现「基准金币/基准经验/基准奖励」");
	// 反向上也要求：凡是按胜利奖励倍率写的奇物效果行，必须带「本层」
	for (const id of ["oblivion_stone", "gluttonous_box"]) {
		const line = curioManager.describeCurio(id)[0];
		assert(line.includes("本层胜利"), `${id} 的效果文案要用统一命名：${line}`);
	}
	return `扫描 ${visible.length} 条玩家可见文案，零残留`;
});

check("事件页数字防溢出与锁图标微调：样式判据直读 styles.js", () => {
	// 冒烟夹具是 DOM 桩，没有排版引擎，量不出「顶到边框」——这两条只能在样式层钉死：
	// 数字允不允许折行、按位数降到哪几档、锁图标挪了多少，改了样式这里立刻红
	const css = fs.readFileSync(path.join(root, "src/rogue/ui/styles.js"), "utf8").replace(/\s+/g, " ");
	assert(/\.wm-rogue-res-num \{ [^}]*font-size: 26px; [^}]*overflow-wrap: anywhere; [^}]*\}/.test(css), "数字默认字号不变，且允许逐位折行（大额金额只换行、不裁剪）");
	assert(/\.wm-rogue-res-num \{ [^}]*color: #ffd479; [^}]*\}/.test(css), "字体配色原样保留");
	assert(/\.wm-rogue-res-num\.wm-rogue-res-long \{ font-size: 21px; \}/.test(css), "六位数起降一档字号（21px）");
	assert(/\.wm-rogue-res-num\.wm-rogue-res-xlong \{ font-size: 17px; \}/.test(css), "九位数起再降一档（17px）");
	assert(/\.wm-rogue-res-num\.wm-rogue-res-xxlong \{ font-size: 14px; \}/.test(css), "十二位数起再降一档（14px）");
	assert(!/\.wm-rogue-res-num[^{]*\{[^}]*overflow: hidden/.test(css), "不许用 overflow: hidden 裁掉溢出的数字");
	assert(!/\.wm-rogue-res-num[^{]*\{[^}]*text-overflow/.test(css), "也不许用省略号藏起来");
	assert(/#wm-rogue-overlay \.wm-rogue-shop-lock \{ [^}]*transform: translateY\(12px\) !important; [^}]*\}/.test(css), "锁图标整体下移 12px（原 2px + 10px）");
	assert(/#wm-rogue-overlay \.wm-rogue-shop-refresh \{ [^}]*transform: translateY\(10px\) !important; [^}]*\}/.test(css), "刷新按钮整体下移 10px");
	assert(/#wm-rogue-overlay \.wm-rogue-shop-section-row\.wm-rogue-shop-section-actions \{ [^}]*padding-bottom: 10px !important; [^}]*\}/.test(css), "含按钮的分区标题行预留 10px 底部空间，按钮下移后不压住副标题/卡片");
	assert(/#wm-rogue-overlay \.wm-rogue-shop-lock \{ [^}]*width: 46px !important; [^}]*height: 40px !important; [^}]*\}/.test(css), "锁图标的尺寸与横向位置不动");
	return "数字折行 + 三档降字号 + 不裁剪 + 锁/刷新按钮各下移 10px";
});

check("事件页资源条撑满面板 + 金额单行：样式判据直读 styles.js（只挂事件页作用域）", () => {
	// 根因在样式层，DOM 桩量不出：事件面板是 align-items:center 的 flex 列，
	// 资源条作为 flex 项收缩到内容宽 → 两格挤在中间、数字逐位折行。这里把「撑满 + 单行 + 只改事件页」
	// 三条钉在样式源文本上，改了立刻红
	const css = fs.readFileSync(path.join(root, "src/rogue/ui/styles.js"), "utf8").replace(/\s+/g, " ");
	assert(/#wm-rogue-overlay \.wm-rogue-event \.wm-rogue-res \{ [^}]*width: 100% !important; [^}]*align-self: stretch !important; [^}]*\}/.test(css),
		"事件页资源条必须占满面板宽度（width:100% + align-self:stretch）");
	assert(/#wm-rogue-overlay \.wm-rogue-event \.wm-rogue-res-num, #wm-rogue-overlay \.wm-rogue-replace \.wm-rogue-res-num \{ white-space: nowrap !important; \}/.test(css),
		"事件页与三个事件子页面的金额一律单行（nowrap），超长交给字号降档");
	assert(/#wm-rogue-overlay \.wm-rogue-event \.wm-rogue-res-cell \{ padding: 7px 14px 5px !important; \}/.test(css),
		"事件页资源格纵向收一收（去多余留白，不动字号与颜色）");
	// 只准挂事件页作用域：裸 .wm-rogue-res 一旦被拉宽/禁止折行，商店、营地、结算的资源条会跟着变。
	// 先把两条允许的带作用域选择器从 CSS 文本里剔掉，再看还有没有别的 .wm-rogue-res 规则带这两个属性
	const stripped = css
		.split("#wm-rogue-overlay .wm-rogue-event .wm-rogue-res").join("")
		.split("#wm-rogue-overlay .wm-rogue-replace .wm-rogue-res").join("");
	assert(!/\.wm-rogue-res \{ [^}]*width: 100%/.test(stripped), "不得把 width:100% 写进通用的 .wm-rogue-res");
	assert(!/\.wm-rogue-res \{ [^}]*align-self/.test(stripped), "不得把 align-self 写进通用的 .wm-rogue-res");
	assert(!/\.wm-rogue-res-num[^{]*\{[^}]*white-space: nowrap/.test(stripped), "通用规则里不得出现 nowrap（只有事件页作用域可以）");
	// 面板本身的宽度与居中语义不许动（大图靠 align-items:center 居中）
	assert(/\.wm-rogue-event \{ [^}]*align-items: center; [^}]*width: min\(560px, calc\(100% - 24px\)\); [^}]*\}/.test(css),
		"事件面板宽度与 align-items:center 原样保留（不改面板尺寸来掩盖问题）");
	return "撑满 + 单行 + 纵向收紧 + 事件页作用域 + 面板尺寸不动";
});

check("性能日志：默认关闭零输出；打开后打印一条分阶段摘要并同步 roguePerfLast", () => {
	const logs = [];
	const originalLog = console.log;
	console.log = (...args) => {
		logs.push(args.join(" "));
	};
	try {
		perf.perfStart("测试场");
		perf.perfMark("第一段");
		perf.perfEnd("收尾");
		assertEqual(logs.length, 0, "开关关闭时一条日志都不打（计时入口全为空操作）");
		globalThis.roguePerfLog = true;
		perf.perfStart("测试场");
		perf.perfCount("扫过人数", 3);
		perf.perfMark("第一段");
		perf.perfEnd("收尾");
		assertEqual(logs.length, 1, "打开后恰好打一条摘要");
		assert(logs[0].startsWith("[rogue/perf] 测试场 总耗时 "), `摘要格式：${logs[0]}`);
		assert(logs[0].includes("第一段") && logs[0].includes("扫过人数=3") && logs[0].includes("收尾"),
			`摘要要含阶段名、计数与收尾备注：${logs[0]}`);
		assertEqual(globalThis.roguePerfLast, logs[0], "摘要同时挂到 roguePerfLast（真机/探针读取用）");
		// 收尾后计时关闭：再 mark 不应往旧摘要里写
		perf.perfMark("收尾之后的标记");
		assertEqual(logs.length, 1, "结束后不再有任何输出");
	} finally {
		console.log = originalLog;
		delete globalThis.roguePerfLog;
		delete globalThis.roguePerfLast;
	}
	return "关闭静默 / 打开一条摘要 + 计数 + roguePerfLast";
});

check("资源数字自适应降档：量得出宽度的容器放不下时逐档降字号，放得下不回弹", () => {
	const fakeClassList = () => {
		const set = new Set();
		return { add: cls => set.add(cls), remove: cls => set.delete(cls), contains: cls => set.has(cls) };
	};
	// 五位数在 100px 容器里放不下 → 一路降到最小档；数字原样保留，不裁剪不省略
	const tight = { innerHTML: "", classList: fakeClassList(), isConnected: true, clientWidth: 100, scrollWidth: 300 };
	common.paintResNum(tight, 22300);
	assertEqual(tight.innerHTML, "22300", "数字原样写入，不裁剪不改写");
	assert(tight.classList.contains("wm-rogue-res-xxlong"), "放不下一路降到最小档（14px）");
	// 容器够宽：保持基础档
	const roomy = { innerHTML: "", classList: fakeClassList(), isConnected: true, clientWidth: 200, scrollWidth: 200 };
	common.paintResNum(roomy, 22300);
	assert(!roomy.classList.contains("wm-rogue-res-long")
		&& !roomy.classList.contains("wm-rogue-res-xlong")
		&& !roomy.classList.contains("wm-rogue-res-xxlong"), "放得下就保持基础档（26px）");
	// 位数先定起手档：六位数即使量出宽度够也不回弹到 26px
	const six = { innerHTML: "", classList: fakeClassList(), isConnected: true, clientWidth: 400, scrollWidth: 400 };
	common.paintResNum(six, 123456);
	assert(six.classList.contains("wm-rogue-res-long") && !six.classList.contains("wm-rogue-res-xxlong"),
		"六位数起手降一档，且不与更小档同时挂");
	// 量不出宽度（测试桩、离屏构建）时不做测量，只按位数分档——与旧行为一致
	const detached = { innerHTML: "", classList: fakeClassList() };
	common.paintResNum(detached, 12345);
	assert(!detached.classList.contains("wm-rogue-res-long"), "量不出宽度时不做自适应，只按位数分档");
	// 十二位数直接进最小档
	const twelve = { innerHTML: "", classList: fakeClassList() };
	common.paintResNum(twelve, 123456789012);
	assert(twelve.classList.contains("wm-rogue-res-xxlong"), "十二位数起手就挂最小档");
	return "逐档降字号 + 不裁剪 + 位数起手档不回弹 + 无法测量时退化";
});

check("Boss 代价面板删标题区 + 技能卡与商店同版式：样式判据直读 styles.js", () => {
	// 冒烟夹具是 DOM 桩，没有排版引擎，只能把「删干净 / 限高还在」钉在样式源文本上：
	// 顶部标题区三件套一旦回流就会重新占位、把奖励区挤下去；描述限高一旦被豁免，长描述又会撑高卡片
	const css = fs.readFileSync(path.join(root, "src/rogue/ui/styles.js"), "utf8").replace(/\s+/g, " ");
	assert(!css.includes("wm-rogue-boss-title"), "Boss 惩罚页顶部大标题样式已删除（不留占位高度）");
	assert(!css.includes("wm-rogue-boss-subtitle"), "固定说明样式已删除");
	assert(!css.includes("wm-rogue-boss-divider"), "分隔线样式已删除");
	// 奖励区仍作为面板第一块展示：样式原样保留，间距全部交给面板自己的 padding
	assert(/\.wm-rogue-boss-reward \{ flex: none; padding: 10px 12px; border-radius: 8px; text-align: center;/.test(css), "奖励结算容器样式原样保留");
	// 技能卡：背包与管理页共用商店这一条限高；「完整描述」豁免规则必须已删除
	assert(/\.wm-rogue-shop-desc \{ [^}]*max-height: 7\.5em; [^}]*overflow: hidden; [^}]*\}/.test(css), "描述限高 7.5em + overflow: hidden（商店与技能背包共用）");
	assert(!css.includes("wm-rogue-desc-full"), "「不限高」的完整描述豁免规则已删除（长描述不再撑高卡片）");
	assert(/\.wm-rogue-btn\.wm-rogue-skill-btn \{ flex: none; min-width: 92px; margin-left: auto; \}/.test(css),
		"管理页动作按钮靠右，与商店的「购买」同一位置");
	return "标题区三件套删净 + 描述限高保留 + 按钮靠右";
});

// ---------------------------------------------------------------- 故人的心（技能筹码）
//
// 开局的两阶段界面由冒烟用例覆盖（这里没有 DOM）；本段盯四件逻辑：枚举口径、真失去与徽记同步、
// 结算的数量纪律与异常容忍、污染/虚无留在玩家身上的持续状态怎么收。

/** 注册一批测试技能：默认双键翻译齐备（界面读得出名字与描述），sac_ 前缀避免与别的用例撞名 */
function registerSacrificeSkills(defs) {
	for (const [id, info] of Object.entries(defs)) {
		lib.skill[id] = info;
		lib.translate[id] = id;
		lib.translate[`${id}_info`] = "测试技能描述。";
	}
}

let fakePlayerSeq = 0;

/** 某个玩家此刻在某个时机上的钩子注册情况（对齐本体 `lib.hook[playerid_role_evt]` 是技能 id 数组） */
const hooksOf = (player, evt, role = "player") => lib.hook[`${player.playerid}_${role}_${evt}`] ?? [];

/**
 * 只实现 skillSacrifice.js 真正碰到的那几个成员，语义对齐本体：
 * fixed 拦截、onremove 清理**顺序**（先摘技能表 → onremove → 最后摘触发器），以及**触发器注册表**
 * （`lib.hook[playerid_role_evt]` 技能 id 数组 + `hookmap` + `initedSkills`）。
 * 有了注册表才测得出「共享伙伴的触发器被连带摘掉」「onremove 抛错留下半摘状态」这类问题——
 * 只比技能数组是不够的。
 */
function makeFakeSkillPlayer(skills = [], options = {}) {
	const node = {
		name: options.name ?? "测试角色",
		playerid: options.playerid ?? `sac_player_${++fakePlayerSeq}`,
		skills: skills.slice(0),
		initedSkills: [],
		// 对齐本体：派生技能（addAdditionalSkill 挂上来的）与觉醒禁用态各有一本账
		additionalSkills: { ...(options.additionalSkills ?? {}) },
		disabledSkills: { ...(options.disabledSkills ?? {}) },
		storage: { ...(options.storage ?? {}) },
		updates: 0,
		// 对齐本体 getSkills：技能表 + 各 additionalSkills 名下的派生技能合并去重
		getSkills: () => {
			const list = node.skills.slice(0);
			for (const source of Object.keys(node.additionalSkills)) {
				const value = node.additionalSkills[source];
				for (const id of Array.isArray(value) ? value : [value]) {
					if (id && !list.includes(id)) {
						list.push(id);
					}
				}
			}
			return list;
		},
		// 对齐本体 hasSkill（player.js:13272）：先展开 group 再判断；group 伙伴不独立进技能表也算拥有
		hasSkill: id => mockGame.expandSkills(node.getSkills().slice(0)).includes(id),
		/** 对齐本体 addSkillTrigger：展开 group 后逐个登记钩子与 initedSkills（init 只跑一次） */
		addSkillTrigger(ids, hidden, triggeronly) {
			for (const skill of mockGame.expandSkills(Array.isArray(ids) ? ids : [ids])) {
				const info = lib.skill[skill];
				if (!info) {
					continue;
				}
				// triggeronly===true 是本体「只补触发器、不碰 global/initedSkills/init」的那条路
				if (!triggeronly) {
					if (!node.initedSkills.includes(skill)) {
						node.initedSkills.push(skill);
						if (typeof info.init === "function") {
							info.init(node, skill);
						}
					} else {
						continue;
					}
				}
				node.registerHooks(skill);
				if (info.hookTrigger) {
					node._hookTrigger ??= [];
					if (!node._hookTrigger.includes(skill)) {
						node._hookTrigger.push(skill);
					}
				}
			}
			return node;
		},
		/** 对齐本体 removeSkillTrigger：**展开 group** 后对每一项摘钩子、从 initedSkills 除名 */
		removeSkillTrigger(ids) {
			for (const skill of mockGame.expandSkills(Array.isArray(ids) ? ids : [ids])) {
				if (!lib.skill[skill] || !node.initedSkills.includes(skill)) {
					continue;
				}
				node.initedSkills = node.initedSkills.filter(item => item !== skill);
				node.unregisterHooks(skill);
				if (Array.isArray(node._hookTrigger)) {
					node._hookTrigger = node._hookTrigger.filter(item => item !== skill);
					if (!node._hookTrigger.length) {
						delete node._hookTrigger;
					}
				}
			}
			return node;
		},
		registerHooks(skill) {
			const trigger = lib.skill[skill]?.trigger;
			if (!trigger) {
				return;
			}
			for (const role of Object.keys(trigger)) {
				const events = Array.isArray(trigger[role]) ? trigger[role] : [trigger[role]];
				for (const evt of events) {
					const key = `${node.playerid}_${role}_${evt}`;
					lib.hook[key] ??= [];
					if (!lib.hook[key].includes(skill)) {
						lib.hook[key].push(skill);
					}
					lib.hookmap[evt] = true;
				}
			}
		},
		unregisterHooks(skill) {
			for (const key of Object.keys(lib.hook)) {
				if (!key.startsWith(`${node.playerid}_`)) {
					continue;
				}
				lib.hook[key] = lib.hook[key].filter(item => item !== skill);
				if (!lib.hook[key].length) {
					delete lib.hook[key];
				}
			}
		},
		/** 本体 getRemovableAdditionalSkills 的 `hasAnotherSKill` 口径：还被技能表或别的账保着就不算能摘 */
		derivedKeptElsewhere(id, source) {
			if (node.skills.includes(id)) {
				return true;
			}
			return Object.keys(node.additionalSkills).some(key => {
				if (key === source) {
					return false;
				}
				const value = node.additionalSkills[key];
				return Array.isArray(value) ? value.includes(id) : value === id;
			});
		},
		/** 对齐本体 addAdditionalSkill：派生技能挂进 `additionalSkills[source]` 并登记触发器
		 *  （本体 addSkill(x, null, null, true)——addToSkills=true 不进技能表，但触发器照登） */
		addAdditionalSkill(source, skillsToAdd) {
			node.additionalSkills[source] ??= [];
			for (const id of Array.isArray(skillsToAdd) ? skillsToAdd : [skillsToAdd]) {
				node.additionalSkills[source].push(id);
				node.addSkillTrigger(id);
			}
			return node;
		},
		/** 对齐本体 removeAdditionalSkills（→ removeSkillLog + $removeAdditionalSkills）：
		 *  名下没被别处保住的派生技能逐个走完整 removeSkill，最后把这本账删掉 */
		removeAdditionalSkills(source) {
			for (const id of (node.additionalSkills[source] ?? []).slice(0)) {
				if (!node.derivedKeptElsewhere(id, source)) {
					node.removeSkill(id);
				}
			}
			delete node.additionalSkills[source];
			return node;
		},
		/** 对齐本体 enableSkill：把 skill 从每本 disabledSkills 账里摘掉 */
		enableSkill(skill) {
			for (const key of Object.keys(node.disabledSkills)) {
				node.disabledSkills[key] = node.disabledSkills[key].filter(item => item !== skill);
				if (!node.disabledSkills[key].length) {
					delete node.disabledSkills[key];
				}
			}
			return node;
		},
		removeSkill(id, force) {
			const info = lib.skill[id];
			if (info?.fixed && force !== true) {
				return id;
			}
			// 对齐本体语句顺序：先摘技能表（并把被摘者从各 additionalSkills 的成员表里剔掉）→
			// onremove → 最后才是 removeSkillTrigger / removeAdditionalSkills / enableSkill / 钩子通知。
			// onremove 抛错就会停在中途（技能表里没了、收尾一步没走）——真机语义，桩必须照搬
			node.skills = node.skills.filter(item => item !== id);
			for (const key of Object.keys(node.additionalSkills)) {
				const value = node.additionalSkills[key];
				if (Array.isArray(value) && value.includes(id)) {
					node.additionalSkills[key] = value.filter(item => item !== id);
				}
			}
			if (info?.onremove === true) {
				delete node.storage[id];
			} else if (typeof info?.onremove === "function") {
				info.onremove(node, id);
			}
			if (info) {
				node.removeSkillTrigger(id);
				if (!info.keepSkill) {
					node.removeAdditionalSkills(id);
				}
			}
			node.enableSkill(`${id}_awake`);
			mockGame.callHook("removeSkillCheck", [id, node]);
			return id;
		},
		update() {
			node.updates += 1;
			return node;
		},
	};
	if (options.enhance) {
		node.rogueEnhanceInfo = options.enhance;
	}
	// 初始就挂在身上的技能：按本体 init 的口径把触发器登记好
	for (const skill of node.skills) {
		node.addSkillTrigger(skill);
	}
	return node;
}

check("故人的心：共享伙伴补注册只补触发器——init 不重跑、hookTrigger 登记在，最终移除零残留", () => {
	// C 的 init 就是那种「加属性 / 加标记 / 发资源」的一次性初始化：跑两次就会翻倍
	registerSacrificeSkills({
		sac_a: { trigger: { player: "phaseEnd" }, group: ["sac_c"] },
		sac_b: { trigger: { player: "damageEnd" }, group: ["sac_c"] },
		sac_c: {
			trigger: { player: "damageBegin1" },
			hookTrigger: true,
			init(player) { player.storage.sac_c_init = (player.storage.sac_c_init ?? 0) + 1; },
		},
	});
	const player = makeFakeSkillPlayer(["sac_a", "sac_b", "sac_c"], { playerid: "sac_init_player" });
	assertEqual(player.storage.sac_c_init, 1, "开局 C 只初始化一次");
	assertEqual(player.initedSkills.includes("sac_c"), true, "C 的 initedSkills 登记在案");
	assert(player._hookTrigger.includes("sac_c"), "hookTrigger 登记在案");

	// 失去 A：C 被 B 依赖 → 留下，且补注册**不能**重跑 init
	sacrifice.loseSkillsForBattle(player, ["sac_a"]);
	assertEqual(player.hasSkill("sac_c"), true, "共享伙伴留下");
	assertEqual(player.storage.sac_c_init, 1, "补注册没重跑 init（走的是 triggeronly 模式）");
	assertEqual(player.initedSkills.includes("sac_c"), true, "initedSkills 登记补回来了（否则它将来真被摘时钩子摘不掉）");
	assert(hooksOf(player, "damageBegin1").includes("sac_c"), "C 的钩子补回来了");
	assert(player._hookTrigger.includes("sac_c"), "_hookTrigger 登记也在");
	assertEqual(hooksOf(player, "phaseEnd").includes("sac_a"), false, "A 自己的钩子摘干净了");

	// 失去 B：没人再依赖 C → 彻底移除，注册状态一条不留
	sacrifice.loseSkillsForBattle(player, ["sac_b"]);
	assertEqual(player.hasSkill("sac_c"), false, "最后一个依赖者失去后 C 跟着失去");
	assertEqual(hooksOf(player, "damageBegin1").includes("sac_c"), false, "C 的钩子摘干净了");
	assertEqual(player.initedSkills.includes("sac_c"), false, "initedSkills 清掉了");
	assertEqual((player._hookTrigger ?? []).includes("sac_c"), false, "_hookTrigger 清掉了");
	assertEqual(player.storage.sac_c_init, 1, "整个流程里 init 只跑过一次");
	return "init 一次 + 只补触发器 + 最终移除零残留";
});

check("故人的心：group 伙伴不在技能表里（本体 grant 形态）——失去一个主技能不能注销共享伙伴的触发器", () => {
	// 真机修好 grantSkills 后的形态：技能表里只有主技能 A / B，伙伴 C 仅由 addSkillTrigger 展开登记。
	// 本体 removeSkillTrigger(A) 会把 C 的钩子与 initedSkills 一并摘掉，但 B 还依赖 C，必须补回来。
	registerSacrificeSkills({
		sac_native_a: { trigger: { player: "phaseEnd" }, group: ["sac_native_c"] },
		sac_native_b: { trigger: { player: "damageEnd" }, group: ["sac_native_c"] },
		sac_native_c: { trigger: { player: "damageBegin1" }, init(player) { player.storage.sac_native_c_init = (player.storage.sac_native_c_init ?? 0) + 1; } },
	});
	const player = makeFakeSkillPlayer(["sac_native_a", "sac_native_b"], { playerid: "sac_native_share" });
	assertEqual(player.hasSkill("sac_native_c"), true, "hasSkill 按 group 展开语义认伙伴");
	assertEqual(player.initedSkills.includes("sac_native_c"), true, "伙伴的 init 登记在案");
	assertEqual(player.storage.sac_native_c_init, 1, "伙伴 init 只跑一次");
	assert(hooksOf(player, "damageBegin1").includes("sac_native_c"), "伙伴的钩子一开始登记着");

	sacrifice.loseSkillsForBattle(player, ["sac_native_a"]);
	assertEqual(player.hasSkill("sac_native_a"), false, "A 已失去");
	assertEqual(player.hasSkill("sac_native_b"), true, "B 不受影响");
	assert(hooksOf(player, "damageBegin1").includes("sac_native_c"), "B 仍依赖 C → 钩子必须补回来");
	assertEqual(player.initedSkills.includes("sac_native_c"), true, "C 的 initedSkills 登记补回来");
	assertEqual(player.storage.sac_native_c_init, 1, "补注册不重跑 init");
	assertEqual(hooksOf(player, "phaseEnd").includes("sac_native_a"), false, "A 自己的钩子摘干净");

	sacrifice.loseSkillsForBattle(player, ["sac_native_b"]);
	assertEqual(player.hasSkill("sac_native_b"), false, "B 已失去");
	assertEqual(hooksOf(player, "damageBegin1").includes("sac_native_c"), false, "没人再依赖 C → 钩子摘干净");
	assertEqual(player.initedSkills.includes("sac_native_c"), false, "C 的 initedSkills 清掉");
	return "伙伴不进技能表：共享触发器补回、最终零残留";
});

check("故人的心：主技能没有 trigger、group 伙伴有 —— onremove 抛错也不留残留", () => {
	registerSacrificeSkills({
		// 主技能自己一条触发器都没有，效果全靠 group 伙伴；它的 onremove 会炸
		sac_boom: { group: ["sac_partner"], onremove() { throw new Error("boom"); } },
		sac_partner: { trigger: { player: "damageBegin1" } },
		sac_keep_main: { group: ["sac_partner"] },   // 另一个也声明这个伙伴的主技能
		sac_other: {},
	});
	const savedError = console.error;
	console.error = () => {};   // 这一条故意让它抛错，日志不进测试输出
	try {
		// 场景一：伙伴只被抛错的这个主技能依赖 → 抛错后它必须彻底移除（含触发器）
		const solo = makeFakeSkillPlayer(["sac_boom", "sac_partner", "sac_other"], { playerid: "sac_boom_solo" });
		assert(hooksOf(solo, "damageBegin1").includes("sac_partner"), "伙伴的钩子一开始是登记着的");
		assertEqual(sacrifice.loseSkillsForBattle(solo, ["sac_boom"]).join(","), "sac_boom", "抛错的技能照实记账");
		assertEqual(solo.hasSkill("sac_boom"), false, "主技能已失去");
		assertEqual(solo.hasSkill("sac_partner"), false, "没人再依赖它 → 伙伴跟着彻底移除");
		assertEqual(hooksOf(solo, "damageBegin1").includes("sac_partner"), false, "伙伴的钩子摘干净（主技能自己没 trigger 也要查得到）");
		assertEqual(solo.initedSkills.includes("sac_partner"), false, "伙伴的 initedSkills 也清掉");
		assertEqual(solo.hasSkill("sac_other"), true, "无关技能一个都不动");

		// 场景二：伙伴还被另一个主技能依赖 → 抛错后它保留，且触发器仍然有效
		const shared = makeFakeSkillPlayer(["sac_boom", "sac_keep_main", "sac_partner"], { playerid: "sac_boom_shared" });
		sacrifice.loseSkillsForBattle(shared, ["sac_boom"]);
		assertEqual(shared.hasSkill("sac_partner"), true, "共享伙伴保留");
		assert(hooksOf(shared, "damageBegin1").includes("sac_partner"), "它的触发器仍然有效（补注册过）");
		assertEqual(shared.initedSkills.includes("sac_partner"), true, "initedSkills 登记在");
		assertEqual(shared.hasSkill("sac_keep_main"), true, "另一个主技能不受影响");

		// 场景三：主技能自己没 trigger、只有 global，onremove 抛错 → 注册状态也必须清干净
		// （只查「主技能有没有钩子」会漏掉这一种：钩子一个都没有，注册状态却在 initedSkills 里）
		lib.skill.sac_glob = {};
		lib.skill.sac_global_main = { global: ["sac_glob"], onremove() { throw new Error("boom"); } };
		registerSacrificeSkills({ sac_glob_main_other: {} });
		const globalMain = makeFakeSkillPlayer(["sac_global_main", "sac_glob_main_other"], { playerid: "sac_global_main" });
		assertEqual(globalMain.initedSkills.includes("sac_global_main"), true, "主技能的注册状态本来在案（补全要靠它认出残留）");
		sacrifice.loseSkillsForBattle(globalMain, ["sac_global_main"]);
		assertEqual(globalMain.hasSkill("sac_global_main"), false, "主技能已失去");
		assertEqual(globalMain.initedSkills.includes("sac_global_main"), false, "它的注册状态清干净了（没有残留登记）");

		// 场景四：跟随件自己的 onremove 抛错 → 它的钩子也必须补摘干净
		// 这里用 `subSkill` 子技能：它**不参与** `expandSkills`，主技能的 removeSkillTrigger 碰不到它，
		// 抛错后残留只能靠「整组 id」逐个查才找得出来（只查主技能一个 id 必漏）
		registerSacrificeSkills({
			sac_child_boom: { trigger: { player: "phaseZhunbei" }, sub: true, sourceSkill: "sac_parent_main", onremove() { throw new Error("child boom"); } },
			sac_parent_main: {},
		});
		const parent = makeFakeSkillPlayer(["sac_parent_main", "sac_child_boom"], { playerid: "sac_parent_main" });
		assert(hooksOf(parent, "phaseZhunbei").includes("sac_child_boom"), "跟随件的钩子一开始登记着");
		assertEqual(sacrifice.loseSkillsForBattle(parent, ["sac_parent_main"]).join(","), "sac_parent_main", "主技能照实记账");
		assertEqual(parent.hasSkill("sac_child_boom"), false, "跟随件（没人依赖）跟着失去");
		assertEqual(hooksOf(parent, "phaseZhunbei").includes("sac_child_boom"), false, "它的钩子补摘干净了");
		assertEqual(parent.initedSkills.includes("sac_child_boom"), false, "initedSkills 也清掉");
		return "抛错后按整组查残留：非共享伙伴彻底移除、共享伙伴保留且触发器有效、global 与跟随件残留都清干净";
	} finally {
		console.error = savedError;
	}
});

check("故人的心：group 伙伴自己的 onremove 抛错 —— 触发器已被「失去主技能」连带摘光，收尾照样补全", () => {
	registerSacrificeSkills({
		sac_trap_main: { group: ["sac_trap_partner"] },
		// 摘主技能时本体 removeSkillTrigger 会展开 group，把伙伴的钩子与 initedSkills 登记一并摘掉；
		// 之后伙伴自己被摘时 onremove 抛错——触发器侧一点残留都没有，收尾却一步都没走
		sac_trap_partner: { trigger: { player: "damageBegin1" }, onremove() { throw new Error("partner boom"); } },
		sac_trap_child: { trigger: { player: "phaseEnd" } },   // 伙伴名下的派生技能（本体 additionalSkills 机制）
		sac_trap_other: {},
	});
	const savedError = console.error;
	console.error = () => {};   // 这一条故意让 onremove 抛错，日志不进测试输出
	try {
		const player = makeFakeSkillPlayer(["sac_trap_main", "sac_trap_partner", "sac_trap_other"], {
			playerid: "sac_trap_player",
			additionalSkills: { sac_trap_partner: ["sac_trap_child"] },
			disabledSkills: { sac_trap_partner: ["sac_trap_partner_awake"] },   // 觉醒态：本体记成 `<id>_awake`
		});
		player.addSkillTrigger("sac_trap_child");   // 派生技能按本体口径本来就听着
		assert(hooksOf(player, "damageBegin1").includes("sac_trap_partner"), "伙伴的钩子一开始登记着");
		assert(hooksOf(player, "phaseEnd").includes("sac_trap_child"), "派生技能的钩子也登记着");
		const notified = mockGame.__hooks.length;

		assertEqual(sacrifice.loseSkillsForBattle(player, ["sac_trap_main"]).join(","), "sac_trap_main", "主技能照实记账");
		assertEqual(player.hasSkill("sac_trap_main"), false, "主技能已失去");
		assertEqual(player.hasSkill("sac_trap_partner"), false, "没人再依赖它 → 伙伴跟着失去");
		assertEqual(player.initedSkills.includes("sac_trap_partner"), false, "伙伴的 initedSkills 登记清掉了");
		assertEqual(player.initedSkills.includes("sac_trap_child"), false, "派生技能的登记也清掉了");
		assertEqual(hooksOf(player, "damageBegin1").includes("sac_trap_partner"), false, "伙伴的钩子没有残留");
		assertEqual(hooksOf(player, "phaseEnd").includes("sac_trap_child"), false, "派生技能的钩子没有残留");
		// 这三条就是本轮的核心：触发器侧已无残留，收尾的另外几步不能因此被跳过
		assertEqual(player.hasSkill("sac_trap_child"), false, "伙伴名下的附加技能跟着清掉（不能因为触发器已摘就认定收尾完成）");
		assertEqual(player.additionalSkills.sac_trap_partner, undefined, "additionalSkills 那本账删掉");
		assertEqual(player.disabledSkills.sac_trap_partner, undefined, "觉醒禁用态清掉");
		assertEqual(player.hasSkill("sac_trap_other"), true, "无关技能一个都不动");

		// 有副作用的钩子不许重复：收尾已完成的只通知一次，被打断的补的那一次也是唯一的
		const fired = mockGame.__hooks.slice(notified).filter(item => item.name === "removeSkillCheck");
		const notifyCount = id => fired.filter(item => item.skill === id).length;
		assertEqual(notifyCount("sac_trap_main"), 1, "收尾完成的技能只收到一次钩子通知");
		assertEqual(notifyCount("sac_trap_partner"), 1, "收尾被打断的技能把这一次补齐，也不重复");

		// 契约：被打断的伙伴自己也有 group 伙伴时，补全的最后一步要替它裁决「留还是走」
		registerSacrificeSkills({
			sac_trap_main: { group: ["sac_trap_partner"] },
			sac_trap_partner: { group: ["sac_trap_grand"], onremove() { throw new Error("partner boom"); } },
			sac_trap_grand: { trigger: { player: "phaseDrawBegin2" } },
		});
		const nested = makeFakeSkillPlayer(["sac_trap_main", "sac_trap_partner", "sac_trap_grand"], {
			playerid: "sac_trap_nested",
			disabledSkills: { sac_trap_partner: ["sac_trap_partner_awake"] },   // 伙伴带觉醒态（收尾第三步的痕迹）
		});
		assert(hooksOf(nested, "phaseDrawBegin2").includes("sac_trap_grand"), "伙伴自己的伙伴一开始也听着");
		sacrifice.loseSkillsForBattle(nested, ["sac_trap_main"]);
		assertEqual(nested.hasSkill("sac_trap_partner"), false, "伙伴失去");
		assertEqual(nested.disabledSkills.sac_trap_partner, undefined, "觉醒禁用态被清掉（触发器侧干净也得查这一步）");
		assertEqual(nested.hasSkill("sac_trap_grand"), false, "没人再依赖它 → 它也跟着彻底移除");
		assertEqual(hooksOf(nested, "phaseDrawBegin2").includes("sac_trap_grand"), false, "它的钩子摘干净");

		// 同一个形状，但伙伴自己的伙伴还被别人依赖：留下，且补全里被连带摘掉的触发器要补回来
		registerSacrificeSkills({
			sac_trap_main: { group: ["sac_trap_partner"] },
			sac_trap_partner: { group: ["sac_trap_grand"], onremove() { throw new Error("partner boom"); } },
			sac_trap_grand: { trigger: { player: "phaseDrawBegin2" } },
			sac_trap_keep: { trigger: { player: "damageEnd" }, group: ["sac_trap_grand"] },
		});
		const nestedShared = makeFakeSkillPlayer(["sac_trap_main", "sac_trap_partner", "sac_trap_grand", "sac_trap_keep"], {
			playerid: "sac_trap_nested_shared",
			additionalSkills: { sac_trap_partner: ["sac_trap_child"] },
		});
		sacrifice.loseSkillsForBattle(nestedShared, ["sac_trap_main"]);
		assertEqual(nestedShared.hasSkill("sac_trap_partner"), false, "伙伴失去");
		assertEqual(nestedShared.hasSkill("sac_trap_grand"), true, "它自己的伙伴还被 sac_trap_keep 依赖 → 留下");
		assert(hooksOf(nestedShared, "phaseDrawBegin2").includes("sac_trap_grand"), "补全里被连带摘掉的触发器补了回来");
		assertEqual(nestedShared.initedSkills.includes("sac_trap_grand"), true, "登记也在");
		assertEqual(nestedShared.hasSkill("sac_trap_child"), false, "伙伴的派生技能照样清掉");
		return "触发器侧零残留之外的收尾（附加技能 / 觉醒态 / 钩子通知）照样补全且不重复；被打断者的伙伴留/走各有裁决";
	} finally {
		console.error = savedError;
	}
});

check("故人的心：可失去技能的枚举口径（本体「失去已有技能」口径，不照搬商店的获取过滤）", () => {
	registerSacrificeSkills({
		sac_normal: {},
		sac_locked: { locked: true },
		sac_limited: { limited: true, unique: true },   // 限定技（本体 shenfen 那类，unique 也照放）
		sac_awake: { juexingji: true, unique: true },   // 觉醒技（本体 drlt_hongju 那类）
		sac_unique: { unique: true },
		sac_vanish: { vanish: true },
		sac_temp: { temp: true },
		sac_persevere: { persevereSkill: true },
		sac_charlotte: { charlotte: true },             // 本体自己的内部痕记（tianxiang2 / `${主}_used`）
		sac_super: { superCharlotte: true },
		sac_fixed: { fixed: true },                     // 固有技：本体 removeSkill 自己就拒摘
		sac_main: { group: ["sac_part", "sac_part2"] },
		sac_part: {},
		sac_part2: {},
		sac_parent: {},
		sac_child: { sub: true, sourceSkill: "sac_parent" },   // subSkill 子技能：折进父技能
	});
	// 界面上读不出名字/描述的（内部技）与根本没定义的 id 都不该出现
	lib.skill.sac_nodesc = {};
	lib.translate.sac_nodesc = "sac_nodesc";
	lib.skill.sac_notrans = {};
	const player = makeFakeSkillPlayer([
		"sac_normal", "sac_locked", "sac_limited", "sac_awake", "sac_unique", "sac_vanish", "sac_temp",
		"sac_persevere", "sac_charlotte", "sac_super", "sac_fixed",
		"sac_main", "sac_part", "sac_part2", "sac_parent", "sac_child",
		"sac_nodesc", "sac_notrans", "sac_ghost",
		"rogue_stat", "rogue_curio", "rogue_copy", "abyss_affix",
	]);
	assertEqual(
		sacrifice.listChoosableSkills(player).join(","),
		"sac_normal,sac_locked,sac_limited,sac_awake,sac_unique,sac_vanish,sac_temp,sac_persevere,sac_main,sac_parent",
		"限定技 / 觉醒技 / unique / 一次性技 / 持恒技都放行；内部技、固有技、载体与跟随件全部挡掉"
	);
	return "unique 与限定/觉醒技放行（迎乡/恤民同口径），charlotte/superCharlotte/fixed/无文案/载体挡掉";
});

check("故人的心：真失去（跟随件跟随、共享伙伴留下）并把两条徽记按实际持有同步", () => {
	registerSacrificeSkills({
		sac_native: { trigger: { player: "phaseDrawBegin2" } },
		sac_main: { group: ["sac_part", "sac_shared"], trigger: { player: "phaseEnd" } },
		sac_part: { trigger: { player: "phaseZhunbei" } },
		sac_shared: { trigger: { player: "damageBegin1" } },
		sac_shared_main: { group: ["sac_shared"], trigger: { player: "damageEnd" } },   // 另一个主技能也声明这个伙伴
		sac_parent: {},
		sac_child: { sub: true, sourceSkill: "sac_parent" },
		sac_abyss: { persevereSkill: true, onremove: player => { delete player.storage.sac_abyss_count; } },
		sac_copy: {},
	});
	lib.skill.abyss_affix = { forced: true, mark: true };
	lib.skill.rogue_copy = { forced: true, mark: true };
	const enemy = makeFakeSkillPlayer(
		["sac_native", "sac_main", "sac_part", "sac_shared", "sac_shared_main", "sac_parent", "sac_child", "sac_abyss", "sac_copy", "abyss_affix", "rogue_copy"],
		{
			storage: { abyss_affix: ["sac_abyss"], rogue_copy: ["sac_copy", "sac_copy"], sac_abyss_count: 2 },
			enhance: { stats: {}, abyss: ["sac_abyss"], copySkills: ["sac_copy"] },
		}
	);
	const removed = sacrifice.loseSkillsForBattle(enemy, ["sac_main"]);
	assertEqual(removed.join(","), "sac_main", "返回值只报上层技能，跟随件不另计一件");
	assertEqual(enemy.hasSkill("sac_part"), false, "独占的 group 伙伴跟着一起失去");
	assertEqual(enemy.hasSkill("sac_shared"), true, "共享伙伴还被别的已拥有技能（sac_shared_main）依赖，原地留下");
	assertEqual(enemy.hasSkill("sac_native"), true, "没选的技能一个都不动");
	assertEqual(enemy.updates, 1, "失去之后只刷新一次");

	// 触发器注册表（不只技能数组）：本体 removeSkillTrigger 展开 group 时会**连带摘掉**共享伙伴的钩子与
	// initedSkills 登记，只保证「技能还在列表里」是不够的——B 的效果会跟着哑掉
	assertEqual(hooksOf(enemy, "damageBegin1").join(","), "sac_shared", "共享伙伴的钩子被连带摘掉后又补了回来");
	assertEqual(enemy.initedSkills.includes("sac_shared"), true, "它的 initedSkills 登记也补回来了");
	assertEqual(hooksOf(enemy, "phaseZhunbei").length, 0, "跟着走的伙伴钩子已摘干净");
	assertEqual(hooksOf(enemy, "phaseEnd").length, 0, "被摘主技能的钩子已摘干净");
	assertEqual(hooksOf(enemy, "damageEnd").join(","), "sac_shared_main", "别的技能的钩子不受影响");
	assertEqual(hooksOf(enemy, "phaseDrawBegin2").join(","), "sac_native", "没选的技能钩子也不受影响");

	// 失去最后一个依赖它的主技能：共享伙伴自己也跟着走，钩子一并摘干净
	assertEqual(sacrifice.loseSkillsForBattle(enemy, ["sac_shared_main"]).join(","), "sac_shared_main", "另一个主技能也能单独失去");
	assertEqual(enemy.hasSkill("sac_shared"), false, "没有主技能再依赖它 → 共享伙伴跟着失去");
	assertEqual(hooksOf(enemy, "damageBegin1").length, 0, "它的钩子摘干净了");
	assertEqual(enemy.initedSkills.includes("sac_shared"), false, "initedSkills 也清掉了");

	assertEqual(sacrifice.loseSkillsForBattle(enemy, ["sac_parent"]).join(","), "sac_parent", "普通技能也能单独选中");
	assertEqual(enemy.hasSkill("sac_child"), false, "subSkill 子技能跟着父技能一起失去（本体不会自动摘，得自己收）");

	assertEqual(sacrifice.loseSkillsForBattle(enemy, ["sac_abyss"]).join(","), "sac_abyss", "词缀可以被单独选中");
	assertEqual(enemy.storage.sac_abyss_count, undefined, "技能自己的 onremove 收尾生效");
	assertEqual(JSON.stringify(enemy.storage.abyss_affix), "[]", "深渊标记列表按实际持有同步");
	assertEqual(enemy.hasSkill("abyss_affix"), false, "词缀摘光后连徽记本体一起摘掉");
	assertEqual(JSON.stringify(enemy.rogueEnhanceInfo.abyss), "[]", "徽记面板的数据同步");
	assertEqual(JSON.stringify(enemy.storage.rogue_copy), JSON.stringify(["sac_copy"]), "复制技能还在身上：列表按实际持有去重（同一条只算一件）");
	assertEqual(JSON.stringify(enemy.rogueEnhanceInfo.copySkills), JSON.stringify(["sac_copy"]), "面板数据同样按实际持有去重");
	return "跟随件跟随 + 共享伙伴留下 + onremove 收尾 + 徽记列表/面板按实际持有同步";
});

check("故人的心：结算只删玩家指定过的技能（选择失效 → 整单不做，绝不自动顶替）", () => {
	registerSacrificeSkills({ sac_a: {}, sac_b: {}, sac_e1: {}, sac_e2: {}, sac_e3: {} });
	// 正常路径：两侧各 1，各归各的
	const me = makeFakeSkillPlayer(["sac_a", "sac_b"]);
	const enemy = makeFakeSkillPlayer(["sac_e1", "sac_e2", "sac_e3"]);
	let result = sacrifice.settleSkillSacrifice(me, { mine: ["sac_a"], theirs: [{ player: enemy, ids: ["sac_e1"] }] });
	assertEqual(result.mine.join(","), "sac_a", "己方实际失去");
	assertEqual(result.theirs[0].removed.join(","), "sac_e1", "敌方实际失去");
	assertEqual(result.mine.length, result.theirs[0].removed.length, "正常情况下两侧数量完全一致");

	// 选中项里有一件此刻已不在身上（这里用没上身的 id 模拟）：整单不做，
	// **绝不**拿别的技能顶替——那等于替玩家做了选择，还会出现「己方 3 个、敌方 2 个」这种正常完成态
	const me2 = makeFakeSkillPlayer(["sac_a", "sac_b"]);
	const enemy2 = makeFakeSkillPlayer(["sac_e1", "sac_e2", "sac_e3"]);
	result = sacrifice.settleSkillSacrifice(me2, {
		mine: ["sac_a", "sac_b"],
		theirs: [{ player: enemy2, ids: ["sac_e1", "sac_ghost"] }],
	});
	assertEqual(result.invalid.length, 1, "失效的条目被报回流程层");
	assertEqual(result.invalid[0].id, "sac_ghost", "失效的是哪一条");
	assertEqual(JSON.stringify(result.mine), "[]", "己方一个都没失去");
	assertEqual(JSON.stringify(result.theirs), "[]", "敌方也一个都没失去");
	assertEqual(me2.skills.join(","), "sac_a,sac_b", "己方技能表原样");
	assertEqual(enemy2.skills.join(","), "sac_e1,sac_e2,sac_e3", "敌方技能表原样——没被指定的技能一个都不许动");

	// 单件 onremove 抛错：技能表里确实已经不在了（照实记账）、半摘状态的触发器被补全摘掉、其余照常结算
	registerSacrificeSkills({ sac_boom: { trigger: { player: "phaseDrawBegin2" }, onremove() { throw new Error("boom"); } } });
	const savedError = console.error;
	console.error = () => {};   // 这一条故意让它抛错，日志不进测试输出
	try {
		const boomMe = makeFakeSkillPlayer(["sac_boom", "sac_a"]);
		assertEqual(hooksOf(boomMe, "phaseDrawBegin2").join(","), "sac_boom", "抛错之前触发器是登记着的");
		const boomEnemy = makeFakeSkillPlayer(["sac_e1", "sac_e2"]);
		const boom = sacrifice.settleSkillSacrifice(boomMe, {
			mine: ["sac_boom", "sac_a"],
			theirs: [{ player: boomEnemy, ids: ["sac_e1", "sac_e2"] }],
		});
		assertEqual(boom.mine.join(","), "sac_boom,sac_a", "抛错的那一件照实记账（技能表里确实已经不在了）");
		assertEqual(boomMe.hasSkill("sac_a"), false, "抛错不连累同一批后面的技能");
		assertEqual(hooksOf(boomMe, "phaseDrawBegin2").length, 0, "半摘状态的触发器被补全摘掉，不留残余钩子");
		assertEqual(boomMe.initedSkills.includes("sac_boom"), false, "initedSkills 登记也清掉了");
		assertEqual(boom.theirs[0].removed.join(","), "sac_e1,sac_e2", "敌方该失去的两件一个不少");
		assertEqual(boom.mine.length, boom.theirs[0].removed.length, "两侧数量相等");
		return "指定才删 + 失效整单不做 + 单件异常补全残留且不连累其余";
	} finally {
		console.error = savedError;
	}
});

check("故人的心：每名被指定的敌人各失去 X 个（次数独立，可只选部分敌人）", () => {
	registerSacrificeSkills({
		sac_m1: {}, sac_m2: {},
		sac_a1: {}, sac_a2: {},
		sac_b1: {}, sac_b2: {},
		sac_c1: {}, sac_c2: {},
	});
	const mineTwo = makeFakeSkillPlayer(["sac_m1", "sac_m2"]);
	const enemyA = makeFakeSkillPlayer(["sac_a1", "sac_a2"]);
	const enemyB = makeFakeSkillPlayer(["sac_b1", "sac_b2"]);
	const enemyC = makeFakeSkillPlayer(["sac_c1", "sac_c2"]);
	let result = sacrifice.settleSkillSacrifice(mineTwo, {
		mine: ["sac_m1", "sac_m2"],
		theirs: [
			{ player: enemyA, ids: ["sac_a1", "sac_a2"] },
			{ player: enemyB, ids: ["sac_b1", "sac_b2"] },
			{ player: enemyC, ids: ["sac_c1", "sac_c2"] },
		],
	});
	assertEqual(result.invalid, undefined, "完整选择不应被判失效");
	assertEqual(result.mine.length, 2, "玩家失去 X=2 个");
	assertEqual(result.theirs.map(entry => entry.removed.length).join(","), "2,2,2", "三名敌人每人各失去 2 个");
	assertEqual(result.theirs.reduce((sum, entry) => sum + entry.removed.length, 0), 6, "敌方合计 6 个，不共用玩家那 2 个配额");
	for (const [player, ids] of [
		[enemyA, ["sac_a1", "sac_a2"]],
		[enemyB, ["sac_b1", "sac_b2"]],
		[enemyC, ["sac_c1", "sac_c2"]],
	]) {
		for (const id of ids) {
			assertEqual(player.hasSkill(id), false, `${id} 真失去`);
		}
	}

	// X=1：三名敌人各失去 1 个，合计 3 个
	const mineOne = makeFakeSkillPlayer(["sac_m1"]);
	const oneA = makeFakeSkillPlayer(["sac_a1", "sac_a2"]);
	const oneB = makeFakeSkillPlayer(["sac_b1", "sac_b2"]);
	const oneC = makeFakeSkillPlayer(["sac_c1", "sac_c2"]);
	result = sacrifice.settleSkillSacrifice(mineOne, {
		mine: ["sac_m1"],
		theirs: [
			{ player: oneA, ids: ["sac_a1"] },
			{ player: oneB, ids: ["sac_b1"] },
			{ player: oneC, ids: ["sac_c1"] },
		],
	});
	assertEqual(result.theirs.map(entry => entry.removed.length).join(","), "1,1,1", "X=1 时每人也各失去 1 个");
	assertEqual(result.theirs.reduce((sum, entry) => sum + entry.removed.length, 0), 3, "敌方合计 3 个");
	assertEqual(oneA.hasSkill("sac_a2"), true, "没选的技能保留");

	// 只选部分敌人：未选中的一个都不动
	const minePartial = makeFakeSkillPlayer(["sac_m1", "sac_m2"]);
	const partialA = makeFakeSkillPlayer(["sac_a1", "sac_a2"]);
	const partialB = makeFakeSkillPlayer(["sac_b1", "sac_b2"]);
	result = sacrifice.settleSkillSacrifice(minePartial, {
		mine: ["sac_m1", "sac_m2"],
		theirs: [{ player: partialA, ids: ["sac_a1", "sac_a2"] }],
	});
	assertEqual(result.theirs.length, 1, "只结算被指定的那名敌人");
	assertEqual(partialB.hasSkill("sac_b1") && partialB.hasSkill("sac_b2"), true, "未指定的敌人技能原样");
	return "X=2×3 人 = 6；X=1×3 人 = 3；只选部分敌人时其余不动";
});

check("故人的心：结算前整单核验（每名各 X、无重复、无重复目标），不合格零损失", () => {
	registerSacrificeSkills({ sac_m1: {}, sac_m2: {}, sac_e1: {}, sac_e2: {}, sac_solo: {} });
	const makePair = () => ({
		me: makeFakeSkillPlayer(["sac_m1", "sac_m2"]),
		enemy: makeFakeSkillPlayer(["sac_e1", "sac_e2"]),
	});
	let pair = makePair();
	let result = sacrifice.settleSkillSacrifice(pair.me, {
		mine: ["sac_m1", "sac_m2"],
		theirs: [{ player: pair.enemy, ids: ["sac_e1"] }],
	});
	assert(result.invalid?.some(item => item.reason.includes("需要失去 2 个技能")), "目标少选一个被拦下");
	assertEqual(result.mine.length + result.theirs.length, 0, "整单未执行");
	assertEqual(pair.me.hasSkill("sac_m1") && pair.me.hasSkill("sac_m2"), true, "玩家技能原样");
	assertEqual(pair.enemy.hasSkill("sac_e1"), true, "敌人技能原样");

	pair = makePair();
	result = sacrifice.settleSkillSacrifice(pair.me, {
		mine: ["sac_m1", "sac_m1"],
		theirs: [{ player: pair.enemy, ids: ["sac_e1", "sac_e2"] }],
	});
	assert(result.invalid?.some(item => item.reason.includes("重复选择")), "玩家重复选同一技能被拦下");
	assertEqual(pair.me.hasSkill("sac_m1"), true, "零损失");

	pair = makePair();
	result = sacrifice.settleSkillSacrifice(pair.me, {
		mine: ["sac_m1", "sac_m2"],
		theirs: [{ player: pair.enemy, ids: ["sac_e1", "sac_e1"] }],
	});
	assert(result.invalid?.some(item => item.reason.includes("重复选择")), "敌人重复选同一技能被拦下");
	assertEqual(pair.enemy.hasSkill("sac_e1"), true, "零损失");

	pair = makePair();
	result = sacrifice.settleSkillSacrifice(pair.me, {
		mine: ["sac_m1", "sac_m2"],
		theirs: [
			{ player: pair.enemy, ids: ["sac_e1", "sac_e2"] },
			{ player: pair.enemy, ids: ["sac_e1", "sac_e2"] },
		],
	});
	assert(result.invalid?.some(item => item.reason.includes("重复指定")), "同一角色被列两次被拦下");
	assertEqual(pair.enemy.hasSkill("sac_e1"), true, "零损失");

	pair = makePair();
	result = sacrifice.settleSkillSacrifice(pair.me, {
		mine: ["sac_m1"],
		theirs: [{ player: pair.me, ids: ["sac_m2"] }],
	});
	assert(result.invalid?.some(item => item.reason.includes("不能把自己")), "把自己列为目标被拦下");
	assertEqual(pair.me.hasSkill("sac_m2"), true, "零损失");

	// 目标可失去技能不足 X：即便把仅有的一个报上来，数量也对不上 → 整单不做
	const soloMe = makeFakeSkillPlayer(["sac_m1", "sac_m2"]);
	const solo = makeFakeSkillPlayer(["sac_solo"]);
	result = sacrifice.settleSkillSacrifice(soloMe, {
		mine: ["sac_m1", "sac_m2"],
		theirs: [{ player: solo, ids: ["sac_solo"] }],
	});
	assert(result.invalid?.length, "技能不足 X 的目标不可能凑够数量");
	assertEqual(solo.hasSkill("sac_solo"), true, "零损失");
	return "数量不足 / 玩家重复 / 目标重复 / 重复目标角色 / 自指 / 技能不足，全部整单拒绝";
});

check("故人的心：没有有效敌方目标时整单拒绝（theirs 空 / 缺失 / 全空 ids）", () => {
	registerSacrificeSkills({ sac_t1: {}, sac_o1: {}, sac_o2: {} });
	const makePair = () => ({
		me: makeFakeSkillPlayer(["sac_t1"]),
		enemy: makeFakeSkillPlayer(["sac_o1", "sac_o2"]),
	});

	// theirs: []
	let pair = makePair();
	let result = sacrifice.settleSkillSacrifice(pair.me, { mine: ["sac_t1"], theirs: [] });
	assert(result.invalid?.some(item => item.reason.includes("至少")), "空 theirs 被拒绝");
	assertEqual(result.mine.length + result.theirs.length, 0, "空目标：整单未执行");
	assertEqual(pair.me.hasSkill("sac_t1"), true, "玩家技能原样");
	assertEqual(pair.enemy.hasSkill("sac_o1") && pair.enemy.hasSkill("sac_o2"), true, "敌人技能原样");

	// 未提供 theirs
	pair = makePair();
	result = sacrifice.settleSkillSacrifice(pair.me, { mine: ["sac_t1"] });
	assert(result.invalid?.some(item => item.reason.includes("至少")), "缺 theirs 被拒绝");
	assertEqual(pair.me.hasSkill("sac_t1"), true, "零损失");

	// 所有目标的 ids 均为空
	pair = makePair();
	result = sacrifice.settleSkillSacrifice(pair.me, { mine: ["sac_t1"], theirs: [{ player: pair.enemy, ids: [] }] });
	assert(result.invalid?.some(item => item.reason.includes("至少")), "全空 ids 被拒绝");
	assertEqual(pair.me.hasSkill("sac_t1"), true, "零损失");
	assertEqual(pair.enemy.hasSkill("sac_o1") && pair.enemy.hasSkill("sac_o2"), true, "目标技能原样");

	// ids 缺失同样视为没选
	pair = makePair();
	result = sacrifice.settleSkillSacrifice(pair.me, { mine: ["sac_t1"], theirs: [{ player: pair.enemy }] });
	assert(result.invalid?.some(item => item.reason.includes("至少")), "缺 ids 被拒绝");
	assertEqual(pair.me.hasSkill("sac_t1"), true, "零损失");

	// 边界：空目标 + 有效目标并存 → 空的那名视为跳过，整单正常结算
	const emptyTarget = makeFakeSkillPlayer(["sac_o1", "sac_o2"]);
	const validTarget = makeFakeSkillPlayer(["sac_o1", "sac_o2"]);
	pair = makePair();
	result = sacrifice.settleSkillSacrifice(pair.me, {
		mine: ["sac_t1"],
		theirs: [
			{ player: emptyTarget, ids: [] },
			{ player: validTarget, ids: ["sac_o1"] },
		],
	});
	assertEqual(result.invalid, undefined, "至少一名有效目标即可结算");
	assertEqual(pair.me.hasSkill("sac_t1"), false, "玩家正常失去");
	assertEqual(validTarget.hasSkill("sac_o1"), false, "有效目标正常失去");
	assertEqual(emptyTarget.hasSkill("sac_o1") && emptyTarget.hasSkill("sac_o2"), true, "空目标一个都不动");
	return "空数组 / 缺字段 / 全空 ids / 缺 ids 一律拒绝；空目标 + 有效目标正常";
});

check("故人的心：奇物效果文案明确「每名被指定的角色各失去等量个技能」", () => {
	const text = curioManager.describeCurioEffects({ skillSacrifice: 1 }).join("\n");
	assert(text.includes("令这些角色各失去等量个技能"), `文案没有写清每名各失去：${text}`);
	return text;
});

await checkAsync("故人的心：选择界面创建失败时按未发动继续（不抛错、不损失任何技能）", async () => {
	registerSacrificeSkills({ sac_ok: {} });
	const me = makeFakeSkillPlayer(["sac_ok"]);
	const enemy = makeFakeSkillPlayer(["sac_ok"]);
	const savedError = console.error;
	console.error = () => {};   // 这一条故意让界面建不起来，日志不进测试输出
	try {
		// 单测环境没有 DOM：选择页的构建会失败，流程层必须安全退出并照常开局
		const result = await sacrifice.runSkillSacrifice(me, [enemy]);
		assertEqual(result.cancelled, true, "界面建不起来 → 按未发动交回");
		assertEqual(me.hasSkill("sac_ok"), true, "己方一个技能都没失去");
		assertEqual(enemy.hasSkill("sac_ok"), true, "敌方也是");
	} finally {
		console.error = savedError;
	}
});

check("故人的心：污染与虚无失去后放开它们留在玩家身上的封牌与屏蔽器（还有别人带着时不动）", () => {
	lib.skill.abyss_wuran = {};
	lib.skill.abyss_xuwu = {};
	const card = { tag: true, hasGaintag: () => true, removeGaintag() { this.removed = true; } };
	const me = makeFakeSkillPlayer(["abyss_wuran_lock", "abyss_xuwu_release"], { name: "玩家" });
	me.storage.skill_blocker = ["abyss_xuwu_blocker", "abyss_xuwu_blocker"];
	me.removeSkillBlocker = id => {
		const index = me.storage.skill_blocker.indexOf(id);
		if (index >= 0) {
			me.storage.skill_blocker.splice(index, 1);
		}
		if (!me.storage.skill_blocker.length) {
			delete me.storage.skill_blocker;
		}
	};
	me.abyssWuranLocked = [card];
	const holder = makeFakeSkillPlayer(["abyss_wuran", "abyss_xuwu"]);
	mockGame.players = [me, holder];
	try {
		sacrifice.releaseLostAffixEffects();
		assertEqual(JSON.stringify(me.storage.skill_blocker), JSON.stringify(["abyss_xuwu_blocker", "abyss_xuwu_blocker"]), "还有持有者时屏蔽器一层都不放");
		assertEqual(me.abyssWuranLocked.length, 1, "封牌引用不动");
		assertEqual(card.removed, undefined, "牌面标签也不摘");

		holder.removeSkill("abyss_wuran");
		holder.removeSkill("abyss_xuwu");
		sacrifice.releaseLostAffixEffects();
		assertEqual(me.storage.skill_blocker, undefined, "屏蔽器按层全部放开");
		assertEqual(me.hasSkill("abyss_xuwu_release"), false, "解除宿主一并摘掉");
		assertEqual(me.abyssWuranLocked.length, 0, "封牌引用清空");
		assertEqual(card.removed, true, "牌面标签摘掉");
		assertEqual(me.hasSkill("abyss_wuran_lock"), false, "封牌载体摘掉");
		return "无持有者才放开：两层屏蔽器全解 + 封牌引用/标签/载体全清";
	} finally {
		mockGame.players = [];
	}
});

await checkAsync("故人的心：任一侧没有可失去的技能就整件事跳过（不开界面、不报错）", async () => {
	registerSacrificeSkills({ sac_only: {} });
	const empty = makeFakeSkillPlayer([]);
	const armed = makeFakeSkillPlayer(["sac_only"]);
	const noPlayer = await sacrifice.runSkillSacrifice(empty, [armed]);
	assertEqual(noPlayer.skipped, "no-player-skills", "己方没牌可出：跳过");
	const noEnemy = await sacrifice.runSkillSacrifice(armed, [empty]);
	assertEqual(noEnemy.skipped, "no-enemy-skills", "敌方没牌可出：跳过");
	assertEqual(armed.hasSkill("sac_only"), true, "跳过时双方一点变化都没有");
});

check("故人的心选择页：flex 加固、正文可滚、按钮钉底、描述不截断（样式判据直读 styles.js）", () => {
	// 冒烟夹具是 DOM 桩，没有排版引擎，量不出「技能几十条会不会溢出」——这些只能在样式层钉死
	const css = fs.readFileSync(path.join(root, "src/rogue/ui/styles.js"), "utf8").replace(/\s+/g, " ");
	assert(/#wm-rogue-overlay \.wm-rogue-heart-body \{ [^}]*display: block !important; position: static !important; [^}]*flex: 1 1 auto; min-height: 0; [^}]*overflow-y: auto; [^}]*overscroll-behavior: contain; [^}]*\}/.test(css),
		"正文条必须是唯一的可伸缩项（min-height:0 + overflow-y:auto + 触摸滚动隔离），技能再多也滚得动");
	assert(/#wm-rogue-overlay\.wm-rogue-heart-overlay \.wm-rogue-heart-panel \{ [^}]*max-height: 100%; display: flex; flex-direction: column; [^}]*\}/.test(css),
		"面板限高到 stage（max-height:100% + flex 列），标题与按钮不会被挤出屏幕");
	assert(/#wm-rogue-overlay \.wm-rogue-stat-panel, #wm-rogue-overlay \.wm-rogue-heart-panel,/.test(css),
		"故人的心面板必须登记进 id 级 flex 加固名单，否则会被通用 .wm-rogue-panel{display:block!important} 压回 block");
	assert(css.indexOf("#wm-rogue-overlay .wm-rogue-panel { display: block !important; }") < css.indexOf("#wm-rogue-overlay .wm-rogue-heart-panel"),
		"flex 加固必须排在通用 block 规则之后（同权重按顺序取胜）");
	assert(/#wm-rogue-overlay \.wm-rogue-heart-actions \{ [^}]*display: flex !important; flex-wrap: wrap !important; [^}]*flex: none; [^}]*\}/.test(css),
		"按钮行 flex:none + 窄屏折行：永远钉在面板底部，也不横向溢出");
	const descRule = /#wm-rogue-overlay \.wm-rogue-pick-desc \{[^}]*\}/.exec(css)?.[0] ?? "";
	assert(descRule && !/max-height|overflow(?!-wrap)|text-overflow|-webkit-line-clamp/.test(descRule),
		"技能描述没有限高 / 裁剪 / 省略规则，长描述必须完整保留");
	assert(/\.wm-rogue-pick-desc, #wm-rogue-overlay \.wm-rogue-pick-hint \{ white-space: normal !important; overflow-wrap: break-word !important; \}/.test(css),
		"描述与提示允许正常换行，长文本不会被推出面板");
	assert(/#wm-rogue-overlay \.wm-rogue-index-art \{ display: flex !important; align-items: center !important; justify-content: center !important; \}/.test(css),
		"图鉴图位的 flex 居中也要补回（同类 display:block!important 冲突，审计时发现）");
	assert(css.indexOf(".wm-rogue-heart-pane {") < css.lastIndexOf(".wm-rogue-hidden { display: none !important; }"),
		"隐藏开关（.wm-rogue-hidden）必须排在分区显隐规则之后，同权重下后者才压得住");
	// 移动端滚动不误触：条目走 bindTap（位移 >10px 不算轻触），正文条隔离本体触摸
	const overlaySource = fs.readFileSync(path.join(root, "src/ui/overlay.js"), "utf8");
	assert(/Math\.abs\(touch\.clientX - startX\) > 10 \|\| Math\.abs\(touch\.clientY - startY\) > 10/.test(overlaySource),
		"轻触判定带 10px 位移阈值：滑动列表不会触发技能选择");
	const pageSource = fs.readFileSync(path.join(root, "src/rogue/ui/skillSacrifice.js"), "utf8");
	assert(/bindOverlayTap\(row, onToggle\)/.test(pageSource), "技能条目仍走 bindTap 轻触判定");
	return "flex 加固 + 可滚 + 按钮钉底 + 描述完整 + 同类冲突补回 + 移动端轻触阈值，全部钉在源文本上";
});

check("商店禁用卡的悬停不发光：样式判据直读 styles.js", () => {
	const css = fs.readFileSync(path.join(root, "src/rogue/ui/styles.js"), "utf8").replace(/\s+/g, " ");
	assert(css.includes(".wm-rogue-shop-card:not(.wm-rogue-off):hover"), "置灰卡被排除在悬停高亮之外（桌面悬停与移动端 :hover 残留都不发光）");
	assert(!css.includes(".wm-rogue-shop-card:hover"), "不允许留下未排除置灰卡的裸 :hover 规则");
	return "禁用卡无悬停高亮";
});

// ---------------------------------------------------------------- 本轮新增：星穹壁垒 / 万象武装匣

await checkAsync("星穹壁垒：damageBegin4 至少 2 点才减 1，同一触发里摸牌，多次受伤每次触发，固定伤害不参与", async () => {
	const info = skillsData.helpers.rogue_barrier;
	const carrier = storage => {
		const player = { storage: { rogue_curio: storage }, hp: 10, maxHp: 10, drawn: 0 };
		player.draw = async num => {
			player.drawn += num;
		};
		return player;
	};
	const trigger = num => ({ num, numFixed: false });
	const event = { triggername: "damageBegin4" };
	// 稀有档：2 → 1、3 → 2；1 点不触发（绝不能被减成 0）
	const rare = carrier({ highDamageMin: 2, highDamageReduce: 1, highDamageDraw: 0 });
	const two = trigger(2);
	assert(info.filter(two, rare, "damageBegin4"), "2 点伤害应触发");
	await info.content(event, two, rare);
	assertEqual(two.num, 1, "2 点减为 1 点");
	assertEqual(rare.drawn, 0, "稀有档不摸牌");
	const one = trigger(1);
	assert(!info.filter(one, rare, "damageBegin4"), "1 点伤害不触发");
	await info.content(event, one, rare);
	assertEqual(one.num, 1, "1 点原样保留，绝不减成 0");
	const three = trigger(3);
	assert(info.filter(three, rare, "damageBegin4"), "3 点同样触发");
	await info.content(event, three, rare);
	assertEqual(three.num, 2, "3 点减为 2 点");
	// 连续多次：每次都是独立触发，没有次数限制
	let total = 0;
	for (let i = 0; i < 5; i++) {
		const hit = trigger(2);
		assert(info.filter(hit, rare, "damageBegin4"), `第 ${i + 1} 次 2 点伤害仍触发`);
		await info.content(event, hit, rare);
		total += hit.num;
	}
	assertEqual(total, 5, "连续 5 次 2 点伤害各减 1（共 5 点），没有每轮/每回合/每场限制");
	assert(!info.filter({ num: 2, numFixed: true }, rare, "damageBegin4"), "固定伤害（numFixed）不参与改写");
	// 其它减伤技能先把它降到 1：按实际结算数值判断，不再触发
	const alreadyReduced = trigger(1);
	assert(!info.filter(alreadyReduced, rare, "damageBegin4"), "前置减伤后只剩 1 点时不触发（判据是实际结算数值）");
	// 史诗档：减伤与摸两张在同一次触发里完成
	const epic = carrier({ highDamageMin: 2, highDamageReduce: 1, highDamageDraw: 2 });
	const epicHit = trigger(4);
	assert(info.filter(epicHit, epic, "damageBegin4"), "史诗档 4 点应触发");
	await info.content(event, epicHit, epic);
	assertEqual(epicHit.num, 3, "史诗档同样只减 1 点");
	assertEqual(epic.drawn, 2, "同一次触发摸两张");
	const secondEpic = trigger(2);
	await info.content(event, secondEpic, epic);
	assertEqual(secondEpic.num, 1, "史诗档 2 点减为 1 点");
	assertEqual(epic.drawn, 4, "第二次再摸两张（不是一次性额度）");
	// 战斗面板按当前品质生成文案：稀有只有减伤，史诗把摸牌并进同一句
	assertEqual(curioManager.describeCurio("star_dome_barrier").join(" / "), "当你将受到至少 2 点伤害时，令此伤害 -1", "稀有档文案");
	assertEqual(curioManager.describeCurio("star_dome_barrier", { star_dome_barrier: "epic" }).join(" / "),
		"当你将受到至少 2 点伤害时，令此伤害 -1，并摸 2 张牌", "史诗档文案");
	return "2→1 / 3→2 / 1 不触发 / 固定伤害不参与 / 5 连发 / 史诗同触发摸 2";
});

check("万象武装匣：临时候选只来自背包里未装备的合法技能，0~3 个装备时各补 1 个", () => {
	const ids = ["own_one", "own_two", "own_three", "own_four"];
	const base = {
		...freshRun(cfg.RUN_MODE.endless),
		curios: ["myriad_armory"],
		skillInventory: ids.slice(0),
	};
	for (let equippedCount = 0; equippedCount <= 3; equippedCount++) {
		const run = { ...base, skills: ids.slice(0, equippedCount) };
		const picked = curioManager.pickTemporarySkill(run, () => 0.999);
		assert(picked, `装备 ${equippedCount} 个时应能补 1 个临时技能`);
		assert(ids.includes(picked), `抽到的 ${picked} 应来自背包`);
		assert(!run.skills.includes(picked), `装备 ${equippedCount} 个时不能抽到已装备的 ${picked}`);
	}
	// 4 个全装备：没有候选 → 不触发
	assertEqual(curioManager.pickTemporarySkill({ ...base, skills: ids.slice(0) }, () => 0.999), null, "背包里没有未装备技能时不触发");
	// 没有这件奇物 / 非无尽：一律不触发，且不消费随机数
	assertEqual(curioManager.pickTemporarySkill({ ...base, skills: [], curios: [] }, () => 0.999), null, "没有万象武装匣不触发");
	assertEqual(curioManager.pickTemporarySkill({ ...base, skills: [], mode: cfg.RUN_MODE.challenge }, () => 0.999), null, "闯关模式不触发（不碰技能栏机制）");
	// 合法性闸门：被判非法/下架的技能不进候选
	assertEqual(curioManager.pickTemporarySkill({ ...base, skills: [] }, () => 0.999, id => id !== "own_four"), "own_three", "非法技能被排除，只剩合法候选");
	assertEqual(curioManager.pickTemporarySkill({ ...base, skills: [] }, () => 0.999, () => false), null, "全部非法时没有候选");
	// 重复条目不会让概率偏移
	const duplicated = curioManager.pickTemporarySkill({ ...base, skills: [], skillInventory: ["own_one", "own_one", "own_two"] }, () => 0.999);
	assert(duplicated === "own_one" || duplicated === "own_two", `重复条目去重后仍只抽合法技能：${duplicated}`);
	// 奇物本身：史诗初始品质、效果文案一行
	assertEqual(curiosData.getCurio("myriad_armory").rarity, "epic", "万象武装匣初始品质为史诗");
	assertEqual(curioManager.describeCurio("myriad_armory").join(" / "),
		"每场战斗开始时，随机将背包中一个未装备的技能临时装备（不占用装备位）", "效果文案由效果键生成");
	return "0~3 装备各补 1 个 / 全装备不触发 / 无奇物·闯关·非法候选一律不触发";
});

check("万象武装匣：tempSkill 随 currentBattle 存档往返，旧档缺字段按 null、读档不补抽", () => {
	const base = {
		...freshRun(cfg.RUN_MODE.endless),
		skills: ["own_one"],
		skillInventory: ["own_one", "own_two"],
		currentBattle: {
			status: "battle",
			enemies: [{ characterId: "佐菲", stats: { defense: 0, draw: 0, attack: 0 }, skills: [], maxHp: 0, hp: 0 }],
			isBossBattle: false,
			tempSkill: "own_two",
		},
	};
	const normalized = state.normalizeRun(base);
	assertEqual(normalized.currentBattle.tempSkill, "own_two", "临时技能 id 随存档保留");
	const reloaded = state.normalizeRun(normalized);
	assertEqual(reloaded.currentBattle.tempSkill, "own_two", "二次读档不重掷");
	// 旧档没有这个字段：按 null（这一场没有临时技能），不会因为现在持有武装匣就补抽
	const legacy = state.normalizeRun({
		...base,
		currentBattle: { status: "battle", enemies: base.currentBattle.enemies, isBossBattle: false },
	});
	assertEqual(legacy.currentBattle.tempSkill, null, "旧档缺字段按 null 补齐");
	// 脏值清洗
	for (const dirty of [123, "", "   ", null, { id: "own_two" }, ["own_two"]]) {
		const clean = state.normalizeRun({ ...base, currentBattle: { ...base.currentBattle, tempSkill: dirty } });
		assertEqual(clean.currentBattle.tempSkill, null, `非法 tempSkill（${JSON.stringify(dirty)}）清成 null`);
	}
	assertEqual(state.normalizeRun({ ...base, currentBattle: { ...base.currentBattle, tempSkill: "rogue_xushui" } }).currentBattle.tempSkill, null, "已下架技能清掉");
	return "往返保留 / 旧档 null / 脏值与下架技能清掉";
});

check("万象武装匣：胜利结算带回本场 tempSkill，Boss 失去名单可含第 4 个技能并逐件发失技奖励", () => {
	const base = {
		...freshRun(cfg.RUN_MODE.endless),
		level: BASE_LEVEL,
		skills: ["own_one", "own_two", "own_three"],
		skillInventory: ["own_one", "own_two", "own_three", "own_four"],
		curios: ["myriad_armory", "oblivion_stone", "gluttonous_box"],
		currentBattle: {
			status: "battle",
			enemies: [{ characterId: "佐菲", stats: { defense: 0, draw: 0, attack: 0 }, skills: [], boss: true, maxHp: 0, hp: 0 }],
			isBossBattle: true,
			tempSkill: "own_four",
		},
	};
	const settled = reward.settleVictory(base, NOW, () => 0.999);
	assertEqual(settled.tempSkill, "own_four", "结算在清空 currentBattle 前带回本场临时技能");
	assertEqual(settled.run.currentBattle, null, "胜利后 currentBattle 清空（普通场临时技能随之消失）");
	const removal = penalty.loseSkills(settled.run, [...settled.run.skills, settled.tempSkill], NOW, BASE_LEVEL);
	assert(removal.ok, removal.error);
	assertEqual(removal.removed.length, 4, "Boss 失去名单含原有 3 个 + 临时第 4 个");
	assertEqual(JSON.stringify(removal.run.skillInventory), "[]", "四个技能都从背包永久删除");
	assertEqual(JSON.stringify(removal.run.skills), "[]", "装备栏同时清空");
	const gold = 4 * curioManager.getSkillLossRewardGold(settled.run, BASE_LEVEL);
	const exp = 4 * curioManager.getSkillLossRewardExp(settled.run, BASE_LEVEL);
	assertEqual(removal.gold, gold, "遗忘之石按 4 件结算");
	assertEqual(removal.exp, exp, "贪食魔盒按 4 件结算");
	// 故人的心只动战斗角色：tempSkill 仍在背包里，Boss 仍按本场开战名单删除
	const afterSacrifice = { ...settled.run, skillInventory: base.skillInventory.slice(0) };
	const stillThere = penalty.loseSkills(afterSacrifice, ["own_one", "own_two", "own_three", "own_four"], NOW, BASE_LEVEL);
	assertEqual(JSON.stringify(stillThere.run.skillInventory), "[]", "即使临时技能已被故人的心从 Player 摘掉，仍从背包删除");
	assertEqual(stillThere.removed.length, 4, "按本场开战名单计 4 件失技奖励");
	return "tempSkill 回传 / 4 件删除 / 遗石与魔盒各 4 份";
});

// ---------------------------------------------------------------- 补修：深空悬赏失败保留事件 / 星穹壁垒最终伤害时机

check("深空悬赏：没有可学技能时失败返回并保留事件，可继续领报酬或离开", () => {
	const bounty = eventManager.buildPendingEvent("deep_space_bounty", BASE_LEVEL, () => 0, NOW, { curios: [] });
	const run = {
		...freshRun(cfg.RUN_MODE.endless),
		abyssDebt: 2,
		currency: { gold: 300, exp: 300 },
		pendingEvent: bounty,
	};
	const fail = eventManager.resolveEventChoice(run, 0, { candidates: [], characterSkills: [] }, () => 0);
	assert(!fail.ok, "无技能时应按失败返回，而不是成功结束事件");
	assertEqual(fail.error, "没有可学的技能，无法接受悬赏", "失败提示");
	assertEqual(fail.run, run, "失败必须原样返回存档（零副作用）");
	assert(fail.run.pendingEvent, "事件仍然挂着，玩家可以重选");
	assertEqual(fail.run.abyssDebt, 2, "不增加深渊债");
	assertEqual(JSON.stringify(fail.run.skillInventory), "[]", "不发技能");
	assertEqual(JSON.stringify(fail.run.currency), JSON.stringify({ gold: 300, exp: 300 }), "不扣/不加货币");
	// 连续点两次失败：仍是同一个事件、同样的存档
	const failAgain = eventManager.resolveEventChoice(fail.run, 0, { candidates: [], characterSkills: [] }, () => 0);
	assert(!failAgain.ok && failAgain.run === run, "连续点击失败不改变任何状态");
	// 失败后改领普通报酬：正常入账并结束事件
	const paid = eventManager.resolveEventChoice(fail.run, 1, {}, () => 0);
	assert(paid.ok, paid.error ?? "领报酬应成功");
	assertEqual(paid.run.pendingEvent, null, "领报酬后事件结束");
	assertEqual(paid.run.currency.gold, 300 + Math.round(BASE_GOLD * 0.5), "只发 0.5 倍本层金币");
	assertEqual(paid.run.abyssDebt, 2, "领报酬不加债");
	// 失败后离开：无奖励、无惩罚、事件结束
	const left = eventManager.resolveEventChoice(fail.run, 2, {}, () => 0);
	assert(left.ok, left.error ?? "离开应成功");
	assertEqual(left.run.pendingEvent, null, "离开后事件结束");
	assertEqual(JSON.stringify(left.run.currency), JSON.stringify({ gold: 300, exp: 300 }), "离开不发货币");
	assertEqual(left.run.abyssDebt, 2, "离开不加债");
	// 有合法技能：技能与债务同时结算
	const successRun = { ...run, skillInventory: [], skills: [] };
	const success = eventManager.resolveEventChoice(successRun, 0, { candidates: [{ id: "own_four" }], characterSkills: [] }, () => 0);
	assert(success.ok, success.error ?? "有技能时应成功");
	assertEqual(JSON.stringify(success.run.skillInventory), JSON.stringify(["own_four"]), "技能进背包");
	assertEqual(success.run.abyssDebt, 3, "债务与原有 2 叠加为 3");
	assertEqual(success.run.pendingEvent, null, "成功后事件结束");
	// 不影响废弃补给站：技能池空时仍按原有「没有可学的技能」结束，不进深渊债分支
	const supply = eventManager.buildPendingEvent("abandoned_supply", BASE_LEVEL, () => 0, NOW, { curios: [] });
	const supplyRun = { ...freshRun(cfg.RUN_MODE.endless), pendingEvent: supply };
	const supplyEmpty = eventManager.resolveEventChoice(supplyRun, 1, { candidates: [], characterSkills: [] }, () => 0);
	assert(supplyEmpty.ok, "废弃补给站不走悬赏的失败返回");
	assertEqual(supplyEmpty.run.pendingEvent, null, "废弃补给站照旧结束事件");
	assert(supplyEmpty.lines.includes("没有可学的技能"), "废弃补给站仍给原有失败提示");
	return "失败保留事件 / 重选报酬与离开 / 成功同时发技能+债 / 废弃补给站不受影响";
});

await checkAsync("星穹壁垒 × 深渊·坚壁：按最终伤害决定是否触发，lastDo 排在普通减伤之后", async () => {
	const barrier = skillsData.helpers.rogue_barrier;
	assert(barrier, "helpers 里应有 rogue_barrier（星穹壁垒的最终伤害载体）");
	assertEqual(skillsData.helpers.rogue_curio.group, "rogue_barrier", "rogue_curio 用 group 挂载，不额外占技能表");
	assertEqual(barrier.lastDo, true, "必须排在普通 damageBegin4 技能之后");
	assertEqual(barrier.charlotte, true, "内部载体不出现在技能面板/不可被故人的心选中");
	const trigger = barrier.trigger?.player;
	assertEqual(Array.isArray(trigger) ? trigger.join(",") : trigger, "damageBegin4", "载体挂在 damageBegin4");
	const make = storage => {
		const player = { storage: { rogue_curio: storage }, hp: 10, maxHp: 10, drawn: 0 };
		player.draw = async num => {
			player.drawn += num;
		};
		return player;
	};
	const jianbi = abyssAffixes.affix.abyss_jianbi;
	assert(jianbi, "深渊·坚壁定义应存在");
	// 3 点：坚壁先 3→1（ceil(3/2)=2），星穹壁垒看到最终 1 点，不触发也不摸牌
	const three = make({ highDamageMin: 2, highDamageReduce: 1, highDamageDraw: 2 });
	const e3 = { num: 3, numFixed: false };
	assert(jianbi.filter(e3, three, "damageBegin4"), "坚壁在普通 damageBegin4 触发");
	await jianbi.content({ triggername: "damageBegin4" }, e3, three);
	assertEqual(e3.num, 1, "坚壁把 3 点减到 1 点");
	assert(!barrier.filter(e3, three, "damageBegin4"), "最终 1 点不满足至少 2 点 → 星穹壁垒不触发");
	await barrier.content({ triggername: "damageBegin4" }, e3, three);
	assertEqual(e3.num, 1, "没触发就不改伤害");
	assertEqual(three.drawn, 0, "没触发就不摸牌");
	// 4 点：坚壁 4→2；星穹壁垒看到 2，减到 1 并摸 2
	const four = make({ highDamageMin: 2, highDamageReduce: 1, highDamageDraw: 2 });
	const e4 = { num: 4, numFixed: false };
	await jianbi.content({ triggername: "damageBegin4" }, e4, four);
	assertEqual(e4.num, 2, "坚壁把 4 点减到 2 点");
	assert(barrier.filter(e4, four, "damageBegin4"), "最终 2 点满足条件");
	await barrier.content({ triggername: "damageBegin4" }, e4, four);
	assertEqual(e4.num, 1, "星穹壁垒再减 1");
	assertEqual(four.drawn, 2, "史诗同触发摸 2");
	// 2 点：没有后续减伤时正常触发；连续 3 次各摸 2，不重复叠加
	const plain = make({ highDamageMin: 2, highDamageReduce: 1, highDamageDraw: 2 });
	for (let i = 0; i < 3; i++) {
		const hit = { num: 2, numFixed: false };
		assert(barrier.filter(hit, plain, "damageBegin4"), `第 ${i + 1} 次 2 点应触发`);
		await barrier.content({ triggername: "damageBegin4" }, hit, plain);
		assertEqual(hit.num, 1, "每次只减 1");
	}
	assertEqual(plain.drawn, 6, "三次各摸 2，共 6 张");
	// 1 点 / 固定伤害不触发
	assert(!barrier.filter({ num: 1, numFixed: false }, plain, "damageBegin4"), "1 点不触发");
	assert(!barrier.filter({ num: 2, numFixed: true }, plain, "damageBegin4"), "固定伤害不参与");
	return "坚壁 3→1 不触发 / 4→2 触发 / 连续 3 次各摸 2 / 1 点与固定伤害不触发";
});

// ---------------------------------------------------------------- 黑市契约：神秘商人改造（三种契约 + 标的耦合 + 血债）

check("黑市契约：四选项构建期定死，稀有/史诗按初始品质掷标的，读档不重掷", () => {
	const built = eventManager.buildPendingEvent("mystery_merchant", 4, () => 0, NOW, { curios: [] });
	assertEqual(built.choices.length, 4, "金币/鲜血/深渊/拒绝四个选项");
	// 金币契约：5 倍本层胜利金币（第 4 关 100×5=500）换随机奇物，原交易逻辑不变
	assertEqual(JSON.stringify(built.choices[0].reward), JSON.stringify({ gold: -500, curio: "random" }), "金币契约 = -500 金币 + 随机奇物");
	assert(built.choices[0].text.includes("-500 金币"), `价钱写进按钮：${built.choices[0].text}`);
	// 鲜血契约：初始品质为稀有的未拥有奇物（rng=0 掷稀有池第一件），后果写在按钮上
	assertEqual(built.choices[1].reward.curio, "lucky_stone", "稀有池第一件被掷定成具体 id");
	assertEqual(curiosData.getCurio("lucky_stone").rarity, "rare", "标的按定义里的初始品质筛");
	assertEqual(JSON.stringify(built.choices[1].action), JSON.stringify({ kind: "bloodDebt", requireCurio: true }), "血债动作带标的耦合");
	assert(built.choices[1].text.includes("体力变为 1"), `后果写进按钮：${built.choices[1].text}`);
	// 深渊契约：初始品质为史诗的未拥有奇物 + 每名敌人 2 个深渊强化
	assertEqual(built.choices[2].reward.curio, "broken_watch", "史诗池第一件被掷定成具体 id");
	assertEqual(curiosData.getCurio("broken_watch").rarity, "epic", "标的按定义里的初始品质筛");
	assertEqual(JSON.stringify(built.choices[2].action), JSON.stringify({ kind: "abyssDebt", perEnemy: 2, requireCurio: true }), "深渊债动作带 perEnemy 与标的耦合");
	assert(built.choices[2].text.includes("+2 个深渊强化"), `后果写进按钮：${built.choices[2].text}`);
	assertEqual(JSON.stringify(built.choices[3].reward), JSON.stringify({}), "拒绝交易无奖励");
	// 同一 rng 构建两次完全一致，且连契约动作一起原样写进存档（读档不重掷、requireCurio 随存档定死）
	const again = eventManager.buildPendingEvent("mystery_merchant", 4, () => 0, NOW, { curios: [] });
	assertEqual(JSON.stringify(again), JSON.stringify(built), "同种子构建一致");
	const saved = state.normalizeRun({ ...freshRun(cfg.RUN_MODE.endless), pendingEvent: built });
	assertEqual(JSON.stringify(saved.pendingEvent), JSON.stringify(built), "契约选项可持久化");
	// 换一个 rng 换一件：标的确实来自随机，不是写死的
	const shifted = eventManager.buildPendingEvent("mystery_merchant", 4, makeRng(7), NOW, { curios: [] });
	assert(shifted.choices[1].reward.curio && shifted.choices[1].reward.curio !== undefined, "换 rng 仍掷得出一件稀有");
	assert(shifted.choices[2].reward.curio && curiosData.getCurio(shifted.choices[2].reward.curio).rarity === "epic", "换 rng 掷出的仍是史诗");
	// 契约选项没有货币消耗：0 金币也照常可点（代价不是钱，不该被置灰）
	const broke = { ...freshRun(cfg.RUN_MODE.endless), currency: { gold: 0, exp: 0 } };
	for (const index of [1, 2, 3]) {
		assert(eventManager.isChoiceAffordable(broke, built.choices[index]), `第 ${index + 1} 项零金币可选`);
	}
	assert(!eventManager.isChoiceAffordable({ ...broke, currency: { gold: 499, exp: 0 } }, built.choices[0]), "金币契约 499 不够 500");
	return "四选项 / 标的按初始品质掷定 / 动作与后果上按钮 / 读档不重掷";
});

check("黑市契约：对应品质已集齐时整单作废，不发奇物、不施加代价、事件保留", () => {
	const rareIds = curiosData.curioIds.filter(id => curiosData.getCurio(id).rarity === "rare");
	const epicIds = curiosData.curioIds.filter(id => curiosData.getCurio(id).rarity === "epic");
	const built = eventManager.buildPendingEvent("mystery_merchant", 4, () => 0, NOW, {
		curios: [...rareIds, ...epicIds],
	});
	assertEqual(JSON.stringify(built.choices[1].reward), JSON.stringify({}), "稀有池空：构建期掷不到标的，也不折经验");
	assert(built.choices[1].action, "动作仍挂着，等结算层整单拒绝");
	const run = { ...freshRun(cfg.RUN_MODE.endless), pendingEvent: built };
	const blood = eventManager.resolveEventChoice(run, 1, {}, () => 0);
	assert(!blood.ok, "鲜血契约应按失败返回");
	assert(blood.error.includes("已全部集齐"), `失败提示要明确：${blood.error}`);
	assertEqual(blood.run, run, "失败原样返回存档（零副作用）");
	assert(blood.run.pendingEvent, "事件保留，可改选别的契约");
	assert(!blood.run.bloodDebt, "血债未记账");
	assertEqual(JSON.stringify(blood.run.curios), JSON.stringify([]), "奇物未发");
	// 深渊契约同理：史诗池空不给奇物、也绝不欠债
	const abyss = eventManager.resolveEventChoice(run, 2, {}, () => 0);
	assert(!abyss.ok && abyss.error.includes("已全部集齐"), "深渊契约同样整单作废");
	assertEqual(abyss.run, run, "零副作用");
	assertEqual(abyss.run.abyssDebt ?? 0, 0, "深渊债未记账");
	// 失败后改签金币契约（钱够）照常成交：同一次事件里换选不冲突
	const rich = { ...run, currency: { gold: 600, exp: 0 } };
	const gold = eventManager.resolveEventChoice(rich, 0, {}, () => 0);
	assert(gold.ok, gold.error ?? "改签金币契约应成交");
	assertEqual(gold.run.currency.gold, 100, "扣 500 金币");
	assertEqual(gold.run.curios.length, 1, "随机奇物照常入袋");
	assertEqual(gold.run.pendingEvent, null, "成交后事件结束");
	return "品质池空整单作废 / 事件与代价分文不动 / 改选金币契约照常成交";
});

check("黑市契约：鲜血契约入袋稀有奇物并记血债，深渊契约史诗入袋且债与其它来源累加", () => {
	// 鲜血契约：奇物立即到手，血债只记账不消费
	const bloodBuilt = eventManager.buildPendingEvent("mystery_merchant", 4, () => 0, NOW, { curios: [] });
	const bloodRun = { ...freshRun(cfg.RUN_MODE.endless), pendingEvent: bloodBuilt };
	const blood = eventManager.resolveEventChoice(bloodRun, 1, {}, () => 0);
	assert(blood.ok, blood.error ?? "鲜血契约应成交");
	assertEqual(blood.curioId, "lucky_stone", "稀有奇物入袋");
	assert(blood.run.curios.includes("lucky_stone"), "背包里有标的");
	assert(blood.run.collection.curios.includes("lucky_stone"), "图鉴记曾经拥有");
	assertEqual(blood.run.bloodDebt, true, "下一场正式战斗的体力债记账");
	assertEqual(blood.run.pendingEvent, null, "成交后事件结束");
	assert(blood.lines.some(line => line.includes("体力将变为 1")), `账目说明代价：${blood.lines.join("；")}`);
	assertEqual(JSON.stringify(blood.run.currency), JSON.stringify(bloodRun.currency), "血契不收货币");
	assertEqual(blood.run.abyssDebt ?? 0, 0, "血契不碰深渊债");
	// 深渊契约：史诗入袋；已有 3 点债（经验泉/悬赏等来源）时再签 = 3 + 2 = 5，累加不覆盖
	const abyssBuilt = eventManager.buildPendingEvent("mystery_merchant", 4, () => 0, NOW, { curios: [] });
	const abyss = eventManager.resolveEventChoice({ ...freshRun(cfg.RUN_MODE.endless), abyssDebt: 3, pendingEvent: abyssBuilt }, 2, {}, () => 0);
	assert(abyss.ok, abyss.error ?? "深渊契约应成交");
	assertEqual(abyss.curioId, "broken_watch", "史诗奇物入袋");
	assertEqual(abyss.run.abyssDebt, 5, "债累加：3 + 2 = 5");
	assert(abyss.lines.some(line => line.includes("5 个随机深渊强化")), `账目说明总债：${abyss.lines.join("；")}`);
	assertEqual(abyss.run.bloodDebt ?? false, false, "深渊契不碰血债");
	return "稀有/史诗立即入袋 / 血债记账 / 深渊债累加 / 两笔债互不干扰";
});

check("黑市契约：血债随存档往返、旧档按没有债补齐，纯增量字段不抬版本号", () => {
	assertEqual(state.normalizeRun({ ...freshRun(cfg.RUN_MODE.endless), bloodDebt: true }).bloodDebt, true, "血债读档保留");
	assertEqual(state.normalizeRun({ ...freshRun(cfg.RUN_MODE.endless) }).bloodDebt, false, "旧档缺字段补 false");
	assertEqual(state.normalizeRun({ ...freshRun(cfg.RUN_MODE.endless), bloodDebt: "yes" }).bloodDebt, false, "非布尔一律按没有债");
	assertEqual(state.normalizeRun({ ...freshRun(cfg.RUN_MODE.endless), version: 14, bloodDebt: true }).bloodDebt, true, "旧版本号档里的血债照样保留（不因版本被清）");
	// 退出游戏重进等价于 normalizeRun 一趟：血债与契约选项都在
	const run = { ...freshRun(cfg.RUN_MODE.endless), bloodDebt: true, abyssDebt: 2 };
	const revived = state.normalizeRun(JSON.parse(JSON.stringify(run)));
	assertEqual(revived.bloodDebt, true, "血债在存档往返后仍是 true");
	assertEqual(revived.abyssDebt, 2, "深渊债照旧保留");
	// 深渊债上限清洗与结算同一条 ABYSS_DEBT_MAX（通用池 9 − 满层前常规随机最多 1 = 8）：
	// 手改的超额债读档回到 8，绝不出现「内存 11 层读档变 10 层」的静默丢债
	assertEqual(state.normalizeRun({ ...freshRun(cfg.RUN_MODE.endless), abyssDebt: 12 }).abyssDebt, 8, "超额债清洗到 ABYSS_DEBT_MAX");
	assertEqual(state.normalizeRun({ ...freshRun(cfg.RUN_MODE.endless), abyssDebt: 8 }).abyssDebt, 8, "上限内的债原样保留");
	return "true 保留 / 缺失与非法补 false / 与版本号无关 / 深渊债清洗不变";
});

check("黑市契约：正式战斗胜利解除血债，普通与 Boss 一视同仁", () => {
	const base = {
		...freshRun(cfg.RUN_MODE.endless),
		level: 4,
		bloodDebt: true,
		currentBattle: { status: "battle", enemies: [{ characterId: "巴尔坦星人", stats: {}, skills: [] }], rift: null, isBossBattle: false },
	};
	assertEqual(reward.settleVictory(base, NOW, () => 0.999).run.bloodDebt, false, "普通胜利解除血债");
	assertEqual(
		reward.settleVictory({ ...base, currentBattle: { ...base.currentBattle, isBossBattle: true } }, NOW, () => 0.999).run.bloodDebt,
		false,
		"Boss 胜利同样解除",
	);
	assertEqual(reward.settleVictory({ ...base, bloodDebt: false }, NOW, () => 0.999).run.bloodDebt, false, "无债照旧 false，字段稳定");
	return "普通与 Boss 胜利都解除";
});

check("黑市契约：金币契约沿用原交易逻辑——付得起源价成交，集齐时按商人原话跳过", () => {
	const built = eventManager.buildPendingEvent("mystery_merchant", 4, () => 0, NOW, { curios: [] });
	const deal = eventManager.resolveEventChoice(
		{ ...freshRun(cfg.RUN_MODE.endless), currency: { gold: 500, exp: 0 }, pendingEvent: built },
		0, {}, () => 0,
	);
	assert(deal.ok, deal.error ?? "恰好付得起应成交");
	assertEqual(deal.run.currency.gold, 0, "扣掉 500");
	assertEqual(deal.run.curios.length, 1, "随机奇物入袋");
	// 图鉴集齐 + 金币不足：跳过分支不花钱、按商人口吻说明（沿用既有行为，不受本次改造影响）
	const brokeFull = {
		...freshRun(cfg.RUN_MODE.endless),
		currency: { gold: 0, exp: 0 },
		curios: curiosData.curioIds.slice(),
		pendingEvent: built,
	};
	const skipped = eventManager.resolveEventChoice(brokeFull, 0, {}, () => 0);
	assert(skipped.ok, skipped.error ?? "集齐时跳过不拒");
	assert(skipped.lines.some(line => line.includes("没有可出售的东西")), `商人口吻：${skipped.lines.join("；")}`);
	assertEqual(JSON.stringify(skipped.run.currency), JSON.stringify({ gold: 0, exp: 0 }), "跳过不扣货币");
	assertEqual(skipped.run.pendingEvent, null, "跳过后事件结束（沿用既有语义）");
	// 其它事件不受影响：经验泉/悬赏的深渊债仍无条件兑现（没有 requireCurio 标的耦合）
	const extreme = eventManager.buildPendingEvent("extreme_training", 4, () => 0, NOW, { curios: [] });
	const trained = eventManager.resolveEventChoice({ ...freshRun(cfg.RUN_MODE.endless), pendingEvent: extreme }, 2, {}, () => 0);
	assert(trained.ok && trained.run.abyssDebt === 2, "极限训练照旧无条件记账 2");
	return "源价成交 / 集齐跳过不扣钱 / 其它事件的债不受标的耦合影响";
});

check("深渊债务：结算按 ABYSS_DEBT_MAX 封顶且明说，内存与读档永一致", () => {
	const trained = eventManager.buildPendingEvent("extreme_training", 4, () => 0, NOW, { curios: [] });
	// 6 + 2 = 8：恰好装满，走原有全额文案
	const full = eventManager.resolveEventChoice({ ...freshRun(cfg.RUN_MODE.endless), abyssDebt: 6, pendingEvent: trained }, 2, {}, () => 0);
	assert(full.ok, full.error ?? "应成交");
	assertEqual(full.run.abyssDebt, 8, "6 + 2 = 8 恰好到上限");
	assert(full.lines.some(line => line.includes("8 个随机深渊强化")), `全额文案：${full.lines.join("；")}`);
	// 7 + 2 = 9 > 8：只能再记 1 个，账目明说，绝不静默截断
	const partial = eventManager.resolveEventChoice({ ...freshRun(cfg.RUN_MODE.endless), abyssDebt: 7, pendingEvent: trained }, 2, {}, () => 0);
	assert(partial.ok, partial.error ?? "部分入账也应成交");
	assertEqual(partial.run.abyssDebt, 8, "封顶在 ABYSS_DEBT_MAX");
	assert(partial.lines.some(line => line.includes("只能再记 1 个") && line.includes("共 8 个")), `部分入账要明说：${partial.lines.join("；")}`);
	// 8 + 2：一个都记不进去，同样明说；经验奖励照常入账（债只是代价，不该连坐奖励）
	const capped = eventManager.resolveEventChoice({ ...freshRun(cfg.RUN_MODE.endless), abyssDebt: 8, pendingEvent: trained }, 2, {}, () => 0);
	assert(capped.ok, capped.error ?? "满上限时也应成交");
	assertEqual(capped.run.abyssDebt, 8, "满上限不再增加");
	assert(capped.lines.some(line => line.includes("已记满 8 个") && line.includes("没有新增")), `满上限要明说：${capped.lines.join("；")}`);
	assert(capped.run.currency.exp > 0, "经验奖励不因债满而丢失");
	// 内存里的数读档后一个都不变：结算封顶与存档清洗是同一条 ABYSS_DEBT_MAX
	assertEqual(state.normalizeRun(JSON.parse(JSON.stringify(partial.run))).abyssDebt, 8, "封顶值随存档往返一致");
	return "6+2=8 全额 / 7+2 只记 1 / 8+2 明说不新增 / 存档往返一致";
});

check("深渊契约：已有债记不满额（+2 装不下）整单拒签，事件保留可改签", () => {
	const built = eventManager.buildPendingEvent("mystery_merchant", 4, () => 0, NOW, { curios: [] });
	// 已有 7 层：7 + 2 装不进 8 → 拒签，分文不动
	const refuse = eventManager.resolveEventChoice({ ...freshRun(cfg.RUN_MODE.endless), abyssDebt: 7, pendingEvent: built }, 2, {}, () => 0);
	assert(!refuse.ok, "记不满额应拒签");
	assert(refuse.error.includes("记不下了"), `拒签提示：${refuse.error}`);
	assertEqual(refuse.run.abyssDebt, 7, "债务分文不动");
	assertEqual(refuse.run.curios.length, 0, "奇物未发");
	assert(refuse.run.pendingEvent, "事件保留可改选");
	// 已有 8 层（顶格）：同样拒签
	const refuseFull = eventManager.resolveEventChoice({ ...freshRun(cfg.RUN_MODE.endless), abyssDebt: 8, pendingEvent: built }, 2, {}, () => 0);
	assert(!refuseFull.ok && refuseFull.run.abyssDebt === 8, "顶格时同样拒签且零副作用");
	// 已有 6 层：6 + 2 = 8 恰好装满 → 照常签订
	const sign = eventManager.resolveEventChoice({ ...freshRun(cfg.RUN_MODE.endless), abyssDebt: 6, pendingEvent: built }, 2, {}, () => 0);
	assert(sign.ok, sign.error ?? "装得下应照常签订");
	assertEqual(sign.run.abyssDebt, 8, "签订后债到上限");
	assertEqual(sign.curioId, "broken_watch", "史诗奇物照发");
	// 深空悬赏（+1）在 7 层时 7 + 1 = 8 装得下 → 照常签订，全额文案（悬赏的债不是全部代价，不走拒签）
	const bounty = eventManager.buildPendingEvent("deep_space_bounty", 4, () => 0, NOW, { curios: [] });
	const accepted = eventManager.resolveEventChoice(
		{ ...freshRun(cfg.RUN_MODE.endless), abyssDebt: 7, pendingEvent: bounty },
		0, { candidates: [{ id: SKILL_A }], characterSkills: [] }, () => 0,
	);
	assert(accepted.ok, accepted.error ?? "悬赏 +1 装得下应成交");
	assertEqual(accepted.run.abyssDebt, 8, "7 + 1 = 8");
	assert(accepted.lines.some(line => line.includes("8 个随机深渊强化")), `全额文案：${accepted.lines.join("；")}`);
	return "7+2 拒签 / 6+2 签到 8 / 悬赏 +1 装得下照常";
});

check("深渊债务优先落位：承诺的追加个数足额兑现，常规随机让位且永不重复", () => {
	// 把角色塞进桩里的 lib.character（空池会让断言假绿）：本体侧至少一个、用完即删
	const added = [];
	for (const id of [...enemy.getExtensionCharacterIds(), "本体测试将"]) {
		if (!lib.character[id]) {
			lib.character[id] = { hp: 4, maxHp: 4, skills: [] };
			added.push(id);
		}
	}
	try {
		// 第 4 层 rng=0.999：常规随机掷 0 个，欠 8 记 8 → 恰好 8 条
		const low = enemy.createEnemyConfigs(4, cfg.RUN_MODE.endless, () => 0.999, { enemies: 1, extraAffixes: 8 });
		assertEqual(low[0].abyss.length, 8, "无常规随机时债务足额");
		assertEqual(new Set(low[0].abyss).size, 8, "不重复");
		// 234 层 rng=0：常规随机掷 3 个，但池子只剩 1 个座位 → 常规让位、债足额 8，合计 9 = 池满
		const high = enemy.createEnemyConfigs(234, cfg.RUN_MODE.endless, () => 0, { enemies: 1, extraAffixes: 8 });
		assertEqual(high[0].abyss.length, 9, "234 层：常规让位后 1 + 债 8 = 池满 9");
		assertEqual(high[0].abyss[0], "abyss_buqu", "常规随机让位后剩下的那 1 个留在最前");
		assertEqual(new Set(high[0].abyss).size, 9, "合计 9 条互不重复");
		// 每名敌人独立：多人各自足额、互不重复
		const multi = enemy.createEnemyConfigs(4, cfg.RUN_MODE.endless, () => 0.999, { enemies: 3, extraAffixes: 8 });
		assertEqual(multi.length, 3, "3 名敌人");
		for (const entry of multi) {
			assertEqual(entry.abyss.length, 8, "每人各自足额 8 条");
			assertEqual(new Set(entry.abyss).size, 8, "每人身上不重复");
		}
		// 对照：不欠债时 234 层照旧 3 条（常规随机的数量口径一个字没改）
		const plain = enemy.createEnemyConfigs(234, cfg.RUN_MODE.endless, () => 0, { enemies: 1 });
		assertEqual(plain[0].abyss.length, 3, "不欠债时常规随机照旧");
	} finally {
		for (const id of added) {
			delete lib.character[id];
		}
	}
	return "债足额 / 常规让位 / 池满 9 不重复 / 不欠债口径不变";
});

console.log(`\nrogue.test: passed=${passed} failed=${failures.length}`);

if (failures.length) {
	console.log(`失败用例：${failures.join("、")}`);
	process.exit(1);
}
