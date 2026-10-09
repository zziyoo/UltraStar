// 奥特之星·肉鸽：数据层/逻辑层测试。node tools/test/rogue.test.mjs
// 逐条覆盖规格书第三十五节的清单。data/skills.js 会拉起分包技能链，
// 因此与 rogue-data.test.mjs 一样用桩顶掉 noname.js。
import path from "node:path";
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
	filter: new Proxy({}, { get: (t, k) => { if (!(k in t)) t[k] = anyFn; return t[k]; } }),
};
export const game = {
	addGroup: () => {}, addCharacterPack: () => {},
	saveExtensionConfig: () => {}, getExtensionConfig: () => null,
	playAudio: () => {}, log: () => {},
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
const rogueBgm = await load("src/rogue/bgm.js");
const eventsData = await load("src/rogue/data/events.js");
const curiosData = await load("src/rogue/data/curios.js");
const curioManager = await load("src/rogue/curioManager.js");
const eventManager = await load("src/rogue/eventManager.js");
const abyss = await load("src/rogue/endless/abyss.js");
const abyssConfig = await load("src/rogue/endless/abyssConfig.js");
const abyssAffixes = await load("src/rogue/endless/abyssAffixes.js");
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

check("技能上限：最多 SKILL_SLOTS 个，满了必须替换", () => {
	const run = freshRun();
	run.currency[cfg.SKILL_CURRENCY] = 9999;
	run.skills = [SKILL_A, SKILL_B, SKILL_C];
	run.shopOffers = [{ id: "rogue_swap_in", price: 10, sold: false }];
	assertEqual(run.skills.length, cfg.SKILL_SLOTS, "先填满技能槽");
	const noReplace = shop.buySkill(run, "rogue_swap_in", null);
	assert(!noReplace.ok && noReplace.error.includes("替换"), "满槽未给替换项应被拒");
	const bought = shop.buySkill(run, "rogue_swap_in", SKILL_A);
	assert(bought.ok, bought.error ?? "替换购买应成功");
	assertEqual(bought.run.skills.length, cfg.SKILL_SLOTS, "购买后仍是满槽");
	assert(!bought.run.skills.includes(SKILL_A), "旧技能已移除");
	assert(bought.run.skills.includes("rogue_swap_in"), "新技能已加入");
	// 拥有数永远不超过上限
	const overflow = state.normalizeRun({ ...run, skills: [SKILL_A, SKILL_B, SKILL_C, "rogue_d", "rogue_e"] });
	assertEqual(overflow.skills.length, cfg.SKILL_SLOTS, "脏数据超槽被截断");
	return `槽位 ${cfg.SKILL_SLOTS}`;
});

check("技能替换：非法替换目标被拒绝且不扣钱", () => {
	const run = freshRun();
	run.currency[cfg.SKILL_CURRENCY] = 500;
	run.skills = [SKILL_A, SKILL_B, SKILL_C];
	run.shopOffers = [{ id: "rogue_new", price: 100, sold: false }];
	const before = run.currency[cfg.SKILL_CURRENCY];
	const bad = shop.buySkill(run, "rogue_new", "rogue_not_owned");
	assert(!bad.ok, "替换未拥有的技能应被拒");
	assertEqual(run.currency[cfg.SKILL_CURRENCY], before, "原 run 未被修改");
	return "拒绝非法替换";
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

check("重复技能过滤：已拥有的技能不进入候选池", () => {
	const run = freshRun();
	// 拥有整个池（含分包技能）时才应一个候选都刷不出
	run.skills = skillsData.pool.map(item => item.id);
	const offers = shop.rollSkillOffers(run, makeRng(3), [], skillsData.pool);
	assertEqual(offers.length, 0, "全拥有时候选为空");
	const repeat = shop.buySkill({ ...run, shopOffers: [{ id: SKILL_A, price: 1, sold: false }] }, SKILL_A, SKILL_C);
	assert(!repeat.ok, "已拥有的技能不应可重复购买");
	return "候选 0";
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
	const res = shop.buySkill(run, SKILL_A, null);
	assert(!res.ok, "钱不够应被拒");
	assertEqual(run.currency[cfg.SKILL_CURRENCY], 5, "余额未变");
	run.currency[cfg.SKILL_CURRENCY] = 100;
	const ok = shop.buySkill(run, SKILL_A, null);
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
	const run = state.normalizeRun({ ...freshRun(), currentBattle: { status: "battle", enemies, extra: "junk" } });
	assertEqual(run.currentBattle.status, "battle", "状态保留");
	assertEqual(run.currentBattle.enemies.length, 2, "敌人数保留");
	assertEqual(JSON.stringify(run.currentBattle.enemies), JSON.stringify(enemies), "阵容原样保留（多余字段剔除、boss 标记保留）");
	// 缺 boss 字段的旧档按普通敌人补 false，绝不报错
	const legacy = state.normalizeRun({
		...freshRun(),
		currentBattle: { status: "battle", enemies: [{ characterId: "佐菲", stats: {}, abyss: [], skills: [], maxHp: 0, hp: 0 }] },
	});
	assertEqual(legacy.currentBattle.enemies[0].boss, false, "旧档缺 boss 字段按 false 补齐");
	assertEqual(Object.keys(run.currentBattle).sort().join(","), "enemies,isBossBattle,rift,status", "只保留 status / enemies / rift / isBossBattle");
	assertEqual(run.currentBattle.isBossBattle, false, "v12：这一场没被判定为 Boss 战（阵容里有 boss 敌人也不等于整场是 Boss 战）");
	assertEqual(run.currentBattle.rift, null, "普通战斗没有裂隙参数");
	// 重启游戏重读同一份存档：阵容完全一致，不允许重新随机
	const reloaded = state.normalizeRun({ ...run });
	assertEqual(JSON.stringify(reloaded.currentBattle.enemies), JSON.stringify(enemies), "重载不重掷");
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

check("商店排除：角色原生技能与当前持有不上架，替换掉的可以再出现", () => {
	const poolIds = skillsData.pool.map(item => item.id);
	const free = poolIds[poolIds.length - 1]; // 既非持有也非原生的「自由」技能
	const run = { ...freshRun(), characterId: "迪迦", skills: [SKILL_B], level: 1 };
	const characterSkills = poolIds.filter(id => id !== free);

	const excluded = shop.getExcludedSkillIds(run, characterSkills);
	assert(excluded.has(SKILL_B), "当前持有应被排除");
	assert(excluded.has(characterSkills[0]), "角色原生技能应被排除");
	assert(!excluded.has(free), "既非持有也非原生时不该被排除");

	// 池子被排到只剩一个：不死循环、不重复、不返回被排除项
	const offers = shop.rollSkillOffers({ ...run, skills: [] }, makeRng(3), characterSkills, skillsData.pool);
	assertEqual(offers.length, 1, "候选不足时按实际数量返回");
	assertEqual(offers[0].id, free, "只能是没被排除的那个");

	// 曾经买过但已不在 run.skills 里的技能可以重新出现（用池内技能验证这条）
	const poolOwned = poolIds[0];
	const replaced = shop.rollSkillOffers({ ...run, skills: [] }, makeRng(5), poolIds.filter(id => id !== poolOwned), skillsData.pool);
	assertEqual(replaced.length, 1, "只剩原持有那一个候选");
	assertEqual(replaced[0].id, poolOwned, "被替换掉的技能可以再出现");

	// 全被排除：返回空候选而不是报错/死循环
	assertEqual(shop.rollSkillOffers({ ...run, skills: [] }, makeRng(1), poolIds, skillsData.pool).length, 0, "全被排除时返回空候选");
	return "原生/持有/替换/边界";
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
	const bought = shop.buySkill(run, run.shopOffers[0].id, null);
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

check("刷新后排除规则不变：原生/持有仍排除，被替换掉的仍可回来", () => {
	const poolIds = skillsData.pool.map(item => item.id);
	const [p0, p1, p2] = poolIds;
	const base = { ...freshRun(), characterId: "迪迦", level: 1, skills: [p1] };
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
	// 以前买过、后来被替换掉的（p2 已不在 run.skills 里），刷新池里照样能再出现
	assert(reuse.offers.some(offer => offer.id === p2), "被替换掉的技能可以重新出现");
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

check("购买奇物：扣款入袋、写图鉴、买到即整批下架不留残卡", () => {
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
	assertEqual(JSON.stringify(bought.run.curioOffers), "[]", "买到即整批下架：不残留「已购买」候选");
	// 批次已撤：再点其它候选直接落空（一批只卖一个）
	const again = curioManager.buyCurio(bought.run, "lucky_stone");
	assert(!again.ok && again.error.includes("不在本次候选"), "整批下架后无可买");
	// 余额不足被拒
	const poor = curioManager.buyCurio({ ...run, currency: { gold: 5, exp: 0 }, curioOffers: run.curioOffers.slice() }, "energy_core");
	assert(!poor.ok && poor.error.includes("金币"), "金币不足被拒");
	assertEqual(poor.run.currency.gold, 5, "被拒不扣款");
	// 未知候选被拒
	assert(!curioManager.buyCurio(run, "不存在").ok, "不在候选中被拒");
	// 购买结果可持久化（图鉴与奇物同一条曲线）
	const stored = state.normalizeRun(bought.run);
	assertEqual(JSON.stringify(stored.curios), JSON.stringify(["energy_core"]), "入袋可持久化");
	// 图鉴是「曾经拥有」：删掉奇物后图鉴不丢
	const discarded = state.normalizeRun({ ...stored, curios: [] });
	assertEqual(JSON.stringify(discarded.collection.curios), JSON.stringify(["energy_core"]), "丢弃后图鉴仍在");
	return "扣款/图鉴/售罄";
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
	assertEqual(cfg.EVENT_TRIGGER_RATE, 0.33, "事件触发率按规格 33%");
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
	// 幸运硬币：rng=0 预掷第一段（+1 倍），rng→1 预掷第二段（-0.4 倍）
	const heads = eventManager.buildPendingEvent("lucky_coin", 1, () => 0, NOW);
	assertEqual(JSON.stringify(heads.choices[0].reward), JSON.stringify({ gold: 50 }), "rng=0 → +50");
	const tails = eventManager.buildPendingEvent("lucky_coin", 1, () => 0.999, NOW);
	assertEqual(JSON.stringify(tails.choices[0].reward), JSON.stringify({ gold: -20 }), "rng→1 → -20（round(50×-0.4)）");
	// 赌局选项（outcomes）不把预掷金额写进按钮：写出正负等于剧透结果
	assertEqual(heads.choices[0].text, "拾取", `正面不剧透：${heads.choices[0].text}`);
	assertEqual(tails.choices[0].text, "拾取", `反面不剧透：${tails.choices[0].text}`);
	// 许愿池的投入百分比与结果无关，保留说明
	const pool = eventManager.buildPendingEvent("wishing_pool", 1, () => 0, NOW);
	assert(pool.choices[0].text.includes("投入 10% 金币"), `许愿池保留投入说明：${pool.choices[0].text}`);
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
	// 随机技能：从候选池排除持有与原生，槽满时落空
	const skillRun = freshRun(cfg.RUN_MODE.endless);
	skillRun.pendingEvent = { id: "mystery_merchant", choices: [{ text: "购买情报", reward: { skill: "random" } }], createdAt: NOW };
	const learned = eventManager.resolveEventChoice(skillRun, 0, {
		candidates: [{ id: SKILL_A }, { id: SKILL_B }, { id: SKILL_C }],
		characterSkills: [SKILL_A],
	}, () => 0);
	assert(learned.ok && learned.skillId === SKILL_B, "原生技能被排除后取 SKILL_B");
	assertEqual(learned.run.skills.join(","), SKILL_B, "技能入槽");
	const fullSlots = { ...skillRun, skills: [SKILL_B, SKILL_C, "rogue_extra"], pendingEvent: skillRun.pendingEvent };
	const noRoom = eventManager.resolveEventChoice(fullSlots, 0, { candidates: [{ id: SKILL_A }] }, () => 0);
	assert(noRoom.ok && noRoom.lines.some(line => line.includes("技能槽已满")), "槽满落空但不报错");
	assertEqual(noRoom.run.skills.length, 3, "槽满不加技能");
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
	// 中奖：投 10%（1000→扣 100）拿回 100 倍（+10000）→ 净 10900
	const hit = wager(1000, { goldPct: 10, goldPayout: 100 });
	assert(hit.ok, hit.error ?? "投入应成功");
	assertEqual(hit.run.currency.gold, 10900, "10% 投入 ×100 倍");
	assert(hit.lines.some(line => line.includes("投入金币 -100")), `投入文案：${hit.lines.join(" | ")}`);
	assert(hit.lines.some(line => line.includes("100 倍")), "返还写明倍数");
	// 落空：投入全额亏掉
	const miss = wager(1000, { goldPct: 10, goldPayout: 0 });
	assertEqual(miss.run.currency.gold, 900, "落空只剩 900");
	assert(miss.lines.some(line => line.includes("落空")), "落空文案");
	// 必中档：投 50% 拿回 2 倍 → 净赚一倍
	const sure = wager(1000, { goldPct: 50, goldPayout: 2 });
	assertEqual(sure.run.currency.gold, 1500, "50% 投入 ×2 倍");
	// 投入额按「点击那一刻」的金币算，不是事件生成时：生成后金币变多也要按新余额投
	const grown = { ...freshRun(cfg.RUN_MODE.endless), currency: { gold: 2000, exp: 0 } };
	const pending = eventManager.buildPendingEvent("wishing_pool", 3, () => 0, NOW);
	const afterGrowth = eventManager.resolveEventChoice({ ...grown, pendingEvent: pending }, 2, {}, () => 0);
	assertEqual(afterGrowth.run.currency.gold, 3000, "按点击时余额 2000 投 50% 拿 2 倍");
	// 金币为 0：选项直接不可选、结算被拒，绝不落成负数
	const empty = wager(0, { goldPct: 50, goldPayout: 2 });
	assert(!empty.ok, "0 金币时投入被拒");
	assertEqual(empty.run.currency.gold, 0, "没有金币不落成负数");
	const poorRun = { ...freshRun(cfg.RUN_MODE.endless), currency: { gold: 0, exp: 0 } };
	assert(!eventManager.isChoiceAffordable(poorRun, { goldPct: 50, goldPayout: 2 }), "0 金币时选项不可选");
	assert(eventManager.isChoiceAffordable({ ...poorRun, currency: { gold: 1, exp: 0 } }, { goldPct: 50, goldPayout: 2 }), "有 1 块也能投 50%");
	// 余额小到四舍五入后投不出 1 块：结算不报错、不倒扣，原样返回
	const dust = wager(1, { goldPct: 10, goldPayout: 100 });
	assert(dust.ok, dust.error ?? "小额不该报错");
	assertEqual(dust.run.currency.gold, 1, "投不出的 1 块不动");
	assert(dust.lines.some(line => line.includes("金币不足")), `投不出时写明：${dust.lines.join(" | ")}`);
	// 百分比与倍率都被夹在合法范围，不接受 0 / 负数倍率
	const clean = eventManager.normalizeEventReward({ goldPct: -500, goldPayout: -3 });
	assertEqual(clean.goldPct, -100, "百分比夹到 -100");
	assertEqual(clean.goldPayout, 0, "负倍率归零");
	// 文案带百分比（金额随余额浮动，此时算不准）
	const text = eventManager.buildPendingEvent("wishing_pool", 3, () => 0, NOW).choices[0].text;
	assert(text.includes("10%"), `许愿池选项写明比例：${text}`);
	return "投入/返还/落空/边界";
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
	// 读档清洗：已拥有 → 一律剔除（买到即下架、事件送出会撤下，这里兜底清洗旧档残留）；未拥有 → 保留
	const stored = state.normalizeRun({
		...freshRun(cfg.RUN_MODE.endless),
		curios: ["energy_core"],
		curioOffers: [
			{ id: "energy_core", price: 10, sold: true },
			{ id: "lucky_stone", price: 10 },
			{ id: "broken_watch", price: 10 },
			{ id: "幽灵", price: 10 },
		],
	});
	assertEqual(JSON.stringify(stored.curioOffers.map(offer => offer.id)), JSON.stringify(["lucky_stone", "broken_watch"]), "过期条目剔除，其余保留");
	assertEqual(JSON.stringify(stored.curioOffers[0]), JSON.stringify({ id: "lucky_stone", price: 10 }), "候选只留 id 与定死的价格");
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
	// 费用 = 5 × 本层胜利经验（floor(20×√关卡)），按「升级时」的关卡现算
	assertEqual(curioManager.getCurioUpgradePrice({ level: 31 }, "energy_core"), 555, "31 层：胜利经验 111 → 555");
	assertEqual(curioManager.getCurioUpgradePrice({ level: 100 }, "energy_core"), 1000, "100 层：胜利经验 200 → 1000");
	assertEqual(curioManager.getCurioUpgradePrice({ level: 234 }, "energy_core"), 1525, "234 层：胜利经验 305 → 1525");
	assertEqual(curioManager.getCurioUpgradePrice({ level: 1 }, "energy_core"), 100, "第 1 层：胜利经验 20 → 100（5 倍胜利经验）");
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
	assertEqual(first.run.currency.exp, 5000 - 555, "扣掉当层费用");
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
	let coin = { ...freshRun(cfg.RUN_MODE.endless), level: 31, currency: { gold: 0, exp: 555 * 3 }, curios: ["cursed_coin"] };
	coin = curioManager.upgradeCurio(coin, "cursed_coin").run;
	assertEqual(coin.curioQuality.cursed_coin, "common", "负面 → 普通");
	coin = curioManager.upgradeCurio(coin, "cursed_coin").run;
	assertEqual(coin.curioQuality.cursed_coin, "rare", "普通 → 稀有");
	coin = curioManager.upgradeCurio(coin, "cursed_coin").run;
	assertEqual(coin.curioQuality.cursed_coin, "epic", "稀有 → 史诗");
	// 幸运石：稀有 → 史诗
	const stone = { ...freshRun(cfg.RUN_MODE.endless), level: 31, currency: { gold: 0, exp: 555 }, curios: ["lucky_stone"] };
	assertEqual(curioManager.upgradeCurio(stone, "lucky_stone").run.curioQuality.lucky_stone, "epic", "幸运石 稀有 → 史诗");
	// 经验差一点都不行
	const broke = { ...freshRun(cfg.RUN_MODE.endless), level: 31, currency: { gold: 0, exp: 554 }, curios: ["energy_core"] };
	const denied = curioManager.upgradeCurio(broke, "energy_core");
	assert(!denied.ok && denied.error.includes("经验不足"), `差 1 点也要拒：${denied.error}`);
	assertEqual(denied.run, broke, "失败时原样返回传入的 run");
	assertEqual(denied.run.currency.exp, 554, "经验不变");
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

check("经验泉：饮用与再饮一口，后者把深渊债记进存档", () => {
	const spring = eventManager.buildPendingEvent("spring_of_wisdom", BASE_LEVEL, () => 0, NOW, { curios: [] });
	assertEqual(spring.choices.length, 3, "三个选项");
	assertEqual(JSON.stringify(spring.choices[0].reward), JSON.stringify({ exp: Math.round(BASE_EXP * 1.5) }), "饮用 = 150% 本层胜利经验");
	assertEqual(JSON.stringify(spring.choices[1].reward), JSON.stringify({ exp: BASE_EXP }), "再饮一口 = 100%");
	assertEqual(JSON.stringify(spring.choices[1].action), JSON.stringify({ kind: "abyssDebt", perEnemy: cfg.SPRING_DEBT_AFFIXES }), "债的个数由配置注入");
	const run = { ...freshRun(cfg.RUN_MODE.endless), pendingEvent: spring, currency: { gold: 0, exp: 5 } };
	const drank = eventManager.resolveEventChoice(run, 1, {}, () => 0);
	assert(drank.ok && drank.action === null, "再饮一口在本层就结算完，不需要子页面");
	assertEqual(drank.run.abyssDebt, cfg.SPRING_DEBT_AFFIXES, "债记进存档");
	assertEqual(drank.run.currency.exp, 5 + BASE_EXP, "经验照发");
	assertEqual(drank.run.pendingEvent, null, "事件收掉");
	assert(drank.lines.some(line => line.includes("深渊强化")), `文案要写明欠了什么：${drank.lines.join(" / ")}`);
	// 连着欠两次的债是累加的，不能被后一次抹掉
	const twice = eventManager.resolveEventChoice({ ...drank.run, pendingEvent: spring }, 1, {}, () => 0);
	assertEqual(twice.run.abyssDebt, cfg.SPRING_DEBT_AFFIXES * 2, "债累加不覆盖");
	return `饮用 ${Math.round(BASE_EXP * 1.5)} 经验 / 再饮 ${BASE_EXP} 经验 + 债 ${cfg.SPRING_DEBT_AFFIXES}`;
});

check("属性训练场：半层基准经验换随机属性，全满时只弹提示不扣钱", () => {
	const maxed = {};
	for (const id of cfg.STAT_IDS) {
		maxed[id] = statsData.stats[id].maxLevel;
	}
	const ground = eventManager.buildPendingEvent("stat_training_ground", BASE_LEVEL, () => 0, NOW, { statLevels: maxed, curios: [] });
	assertEqual(JSON.stringify(ground.choices[0].reward), JSON.stringify({ exp: -Math.round(BASE_EXP * 0.5), statUp: cfg.STAT_IDS[0] }), "消耗半层基准经验 + 定死随机到的那一项");
	assert(ground.choices[0].text.includes(`${-Math.round(BASE_EXP * 0.5)} 经验`), `花经验也要把价钱写进文案：${ground.choices[0].text}`);
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
	// 生产路径会给完整存档：满级的那一项按钮上不再标价（点了本来就不花钱），
	// 而且经验不够也不会被「货币不足」挡下——否则作者那句提示永远看不到
	const liveRun = { ...freshRun(cfg.RUN_MODE.endless), level: BASE_LEVEL + 1, stats: { ...maxed }, curios: [] };
	const live = eventManager.buildPendingEvent("stat_training_ground", BASE_LEVEL, () => 0, NOW, {
		level: liveRun.level, statLevels: liveRun.stats, curios: liveRun.curios, run: liveRun,
	});
	assert(!live.choices[0].text.includes("经验"), `满级时不再写价钱：${live.choices[0].text}`);
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

check("技能熔炉：交回 mode.js 且一个钱都不扣，没有技能时弹提示", () => {
	const forge = eventManager.buildPendingEvent("skill_forge", BASE_LEVEL, () => 0, NOW, { curios: [] });
	assertEqual(JSON.stringify(forge.choices[0].reward), JSON.stringify({ exp: BASE_EXP * 2 }), "熔炼换的 = 2 倍本层基准经验");
	assertEqual(JSON.stringify(forge.choices[0].action), JSON.stringify({ kind: "skillForge", grant: "exp" }), "第一档：换经验");
	assertEqual(JSON.stringify(forge.choices[1].action), JSON.stringify({ kind: "skillForge", grant: "skill" }), "第二档：换技能");
	assertEqual(forge.choices[0].blockedText, forge.choices[1].blockedText, "两档说的是同一件事");
	const noSkill = { ...freshRun(cfg.RUN_MODE.endless), skills: [], pendingEvent: forge };
	const told = eventManager.resolveEventChoice(noSkill, 0, {}, () => 0);
	assertEqual(told.lines[0], forge.choices[0].blockedText, "没技能时弹提示而不是置灰");
	assertEqual(told.run.currency.exp, noSkill.currency.exp, "没技能时经验不进账");
	// 有技能：本层不扣不发、事件还挂着，等子页面里真选定
	const holder = { ...freshRun(cfg.RUN_MODE.endless), skills: ["rogue_any"], pendingEvent: forge };
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
		assert(rift.choices[i].text.includes(`${conf.enemies} 名敌人`), `敌人数写进文案：${rift.choices[i].text}`);
		assert(rift.choices[i].text.includes(`${BASE_GOLD * conf.multiplier} 金币`), "胜利可得也写进文案");
		assertEqual(JSON.stringify(rift.choices[i].reward), JSON.stringify({}), "裂隙绝不在选项里发钱（打赢才算）");
	}
	assertEqual(rift.choices[3].text, "我不打扰了，我走了哈", "离开选项照作者原话");
	const before = { ...freshRun(cfg.RUN_MODE.endless), pendingEvent: rift };
	const entered = eventManager.resolveEventChoice(before, 1, {}, () => 0);
	assert(entered.run === before && entered.action?.kind === "rift", "开战交回 mode.js，事件先挂着");
	return cfg.RIFT_TIERS.map(tier => `${tier.enemies}人/${tier.multiplier}倍`).join(" ");
});

check("流浪商人：单件货与恒定售价，只有练满了才拦", () => {
	const price = curioManager.getMerchantPrice(BASE_LEVEL);
	assertEqual(price, curioManager.getCurioBasePrice(BASE_LEVEL) * cfg.MERCHANT_PRICE_MULTIPLIER, "恒定售价 = 奇物基准价 ×4");
	// 掷的是全部奇物（含已拥有）——「买已经有的那件」正是这家商人的卖点。
	// 挑一件初始品质还没到顶的，才能验出「已拥有但还能升 → 照卖」这条分支
	const upgradable = curiosData.curioIds.find(id => curioManager.getNextCurioQuality(id, null) !== null);
	const rollFor = id => () => (curiosData.curioIds.indexOf(id) + 0.5) / curiosData.curioIds.length;
	const merchant = eventManager.buildPendingEvent("wandering_merchant", BASE_LEVEL, rollFor(upgradable), NOW, { curios: [] });
	assertEqual(JSON.stringify(merchant.choices[0].action), JSON.stringify({ kind: "merchant", curioId: upgradable, price }), "rng 定位到那件还能升的货");
	assert(merchant.choices[0].text.includes(`${price} 金币`), `标价写进文案：${merchant.choices[0].text}`);
	const ownedRun = { ...freshRun(cfg.RUN_MODE.endless), curios: curiosData.curioIds.slice(0), pendingEvent: merchant };
	assertEqual(eventManager.getBlockedMessage(ownedRun, merchant.choices[0]), null, "已拥有但还能升 → 照卖");
	const maxedOut = { ...ownedRun, curioQuality: { [upgradable]: "epic" } };
	assertEqual(eventManager.getBlockedMessage(maxedOut, merchant.choices[0]), merchant.choices[0].blockedText, "已拥有且练满 → 弹提示");
	// 商人的价不吃品质倍率与 ±25% 波动：同一关永远同一个数
	assertEqual(curioManager.getMerchantPrice(BASE_LEVEL), price, "重复调用不掷随机");
	return `${upgradable} 标价 ${price}`;
});

check("奇物融合炉：融合费 = 本层基准经验 ×3，没有可融合的才弹提示", () => {
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
	assert(lines("golden_compass")[0].includes("10%") && lines("golden_compass")[0].includes("额外刷出一批奇物商店候选"), `黄金罗盘：${lines("golden_compass")[0]}`);
	assert(lines("piggy_bank")[0].includes("当前持有金币的 5%"), `储蓄罐要说清乘的是余额：${lines("piggy_bank")[0]}`);
	assert(!lines("piggy_bank")[0].includes("经验获取"), "储蓄罐不能混进 goldRate 那条文案");
	assert(lines("oblivion_stone")[0].includes("替换技能时") && lines("oblivion_stone")[0].includes("5 倍"), `遗忘之石：${lines("oblivion_stone")[0]}`);
	// 本轮新增的五件：回响之铃按概率出句、破碎王冠三档合成一句、魔盒的替换经验、饥饿之匣四档、橱窗两个开关
	assertEqual(lines("echo_bell")[0], "当你进入濒死状态时，有 50% 的概率获得本局游戏你使用过且位于弃牌堆的牌", "回响之铃普通档");
	assertEqual(lines("echo_bell", "rare")[0], "当你进入濒死状态时，有 75% 的概率获得本局游戏你使用过且位于弃牌堆的牌", "稀有档只换概率");
	assertEqual(lines("echo_bell", "epic")[0], "当你进入濒死状态时，获得本局游戏你使用过且位于弃牌堆的牌", "史诗档不再写概率");
	assertEqual(lines("broken_crown")[0], "你杀死一名角色后，你增加 1 点体力上限并回复 1 点体力", "破碎王冠普通档");
	assertEqual(lines("broken_crown", "rare")[0], "你杀死一名角色后，你增加 1 点体力上限并回复 1 点体力，然后摸牌至体力上限", "稀有档补摸牌至上限");
	assertEqual(lines("broken_crown", "epic")[0], "你杀死一名角色后，你增加 1 点体力上限并回复体力至上限，然后摸体力上限张牌", "史诗档回满 + 摸上限张");
	assertEqual(lines("broken_crown").length, 1, "破碎王冠的三个配套键不得单独出行");
	assertEqual(lines("gluttonous_box")[0], "每次替换技能时获得本层胜利经验的 5 倍", "贪食魔盒");
	const hungry = lines("hungry_box").join(" / ");
	assert(hungry.includes("金币获取 -15%") && hungry.includes("经验获取 +5%"), `饥饿之匣负面档：${hungry}`);
	assertEqual(lines("hungry_box").length, 2, "饥饿之匣两行（一扣一加）");
	assertEqual(lines("hungry_box", "epic").length, 1, "史诗档只剩经验一行");
	assertEqual(lines("hungry_box", "epic")[0], "经验获取 +20%", "史诗档经验 +20%");
	assertEqual(lines("collector_showcase").join(" / "), "你可以锁定技能商店，锁定后下一场战斗不再刷新技能商店的候选", "橱窗稀有档只锁技能商店");
	assertEqual(lines("collector_showcase", "epic").length, 1, "橱窗史诗档合成一条");
	assertEqual(lines("collector_showcase", "epic")[0], "你可以锁定技能或奇物商店，锁定后下一场战斗不再刷新技能或奇物商店的候选", "橱窗史诗档两店都能锁");
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

check("奇物商店队列：黄金罗盘多出的那批在买完当前批后提上货架", () => {
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
	assertEqual(JSON.stringify(bought.run.curioOffers), JSON.stringify([{ id: "lucky_stone", price: 20 }]), "第二批提上货架");
	assertEqual(JSON.stringify(bought.run.curioOfferQueue), JSON.stringify([]), "队列随之清空");
	// 刚买掉的那件即使在队列里也必须被过滤掉（已拥有不得再上架）
	const stale = { ...run, curioOfferQueue: [[{ id: "lucky_stone", price: 20 }, { id: "broken_watch", price: 30 }]] };
	const bought2 = curioManager.buyCurio(stale, "broken_watch");
	assertEqual(JSON.stringify(bought2.run.curioOffers), JSON.stringify([{ id: "lucky_stone", price: 20 }]), "刚买掉的那件不得从队列里冒出来");
	// 没有队列时行为与原来完全一致
	const plain = { ...run, curioOfferQueue: [] };
	assertEqual(JSON.stringify(curioManager.buyCurio(plain, "broken_watch").run.curioOffers), JSON.stringify([]), "无队列 → 照旧整批下架");
	// 传入的 run 绝不能被原地污染
	assertEqual(JSON.stringify(run.curioOfferQueue), JSON.stringify([[{ id: "lucky_stone", price: 20 }]]), "原 run 的队列不动");
	// 连着摇两批时第二排要排掉第一排已挂出去的货
	const offers2 = curioManager.rollCurioOffers({ ...run, curios: [] }, seq([0]), ["broken_watch"]);
	assert(!offers2.some(offer => offer.id === "broken_watch"), "exclude 生效");
	return "上架 / 过滤 / 无队列原样";
});

check("储蓄罐与遗忘之石：结算侧两处加成", () => {
	// 储蓄罐乘的是「已经拿到手的总额」，所以必须排在基础奖励入账之后
	const bank = { ...freshRun(cfg.RUN_MODE.endless), level: BASE_LEVEL, currency: { gold: 1000, exp: 0 }, curios: ["piggy_bank"] };
	const got = reward.settleVictory(bank, NOW, () => 0.999);
	const expected = BASE_GOLD + Math.floor((1000 + BASE_GOLD) * 0.05);
	assertEqual(got.gained.gold, expected, `基础 ${BASE_GOLD} + 余额抽成：${got.gained.gold}`);
	assertEqual(got.run.currency.gold, 1000 + expected, "全部入账");
	const plain = reward.settleVictory({ ...bank, curios: [] }, NOW, () => 0.999);
	assertEqual(plain.gained.gold, BASE_GOLD, "没有储蓄罐就只发基础");
	// 黄金罗盘：正常那批与罗盘那批互不排斥，于是同一关能买两次
	const compass = { ...freshRun(cfg.RUN_MODE.endless), level: BASE_LEVEL, currency: { gold: 0, exp: 0 }, curios: ["golden_compass"] };
	const onlyCompass = reward.settleVictory(compass, NOW, seq([0.5, 0]));
	assert(onlyCompass.run.curioOffers.length, "罗盘命中就直接把那一批摆上货架，不留空队列");
	assertEqual(onlyCompass.run.curioOfferQueue.length, 0, "只有一批时不留队列");
	const both = reward.settleVictory(compass, NOW, seq([0, 0]));
	assertEqual(both.run.curioOffers.length, cfg.CURIO_OFFER_COUNT, "第一批照常");
	assertEqual(both.run.curioOfferQueue.length, 1, "第二批进队列");
	const offered = [...both.run.curioOffers, ...both.run.curioOfferQueue[0]].map(offer => offer.id);
	assertEqual(new Set(offered).size, offered.length, "两批之间不得出现同一件货");
	const none = reward.settleVictory(compass, NOW, seq([0.9, 0.9]));
	assertEqual(none.run.curioOffers.length, 0, "都没中 → 清空当前批");
	assertEqual(none.run.curioOfferQueue.length, 0, "都没中 → 清空队列");
	// 遗忘之石：本层基准金币 ×5，没有这块奇物返回 0
	const stone = { ...freshRun(cfg.RUN_MODE.endless), level: BASE_LEVEL, curios: ["oblivion_stone"] };
	assertEqual(curioManager.getReplaceRewardGold(stone), BASE_GOLD * 5, "五倍本层基准金币");
	assertEqual(curioManager.getReplaceRewardGold({ ...stone, curios: [] }), 0, "没这块石头不发钱");
	return `储蓄罐 +${expected - BASE_GOLD} / 罗盘两批 / 石头 ${BASE_GOLD * 5}`;
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

check("饥饿之匣与贪食魔盒：金币换经验、替换技能发经验", () => {
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
	// 贪食魔盒：本层基准经验 ×5，与遗忘之石的金币同一条口径；没有它返回 0
	const box = { ...freshRun(cfg.RUN_MODE.endless), level: BASE_LEVEL, curios: ["gluttonous_box"] };
	assertEqual(curioManager.getReplaceRewardExp(box), BASE_EXP * 5, "五倍本层基准经验");
	assertEqual(curioManager.getReplaceRewardExp({ ...box, curios: [] }), 0, "没有魔盒不发经验");
	return `饥饿之匣 ${gained.gold}/${gained.exp} → 史诗 ${maxedGained.gold}/${maxedGained.exp}；魔盒 ${BASE_EXP * 5}`;
});

check("收藏家的橱窗：锁的能力闸门、结算保留与存档清洗", () => {
	const rare = { ...freshRun(cfg.RUN_MODE.endless), curios: ["collector_showcase"] };
	const epic = { ...rare, curioQuality: { collector_showcase: "epic" } };
	assert(curioManager.canLockShop(rare, "skill"), "稀有档能锁技能商店");
	assert(!curioManager.canLockShop(rare, "curio"), "稀有档锁不了奇物商店");
	assert(curioManager.canLockShop(epic, "curio"), "史诗档能锁奇物商店");
	assert(!curioManager.canLockShop({ ...rare, curios: [] }, "skill"), "没持有橱窗时没有锁定能力");
	// 切换：纯函数、不原地改 run；没能力时 ok:false 且零副作用
	const on = curioManager.toggleShopLock(rare, "skill");
	assert(on.ok && on.locked === true && on.run.skillShopLocked === true, "锁上");
	assert(on.run !== rare, "返回的是新对象，不与传入的 run 共享引用");
	assertEqual(rare.skillShopLocked, false, "传入的 run 不被原地改写（还是未锁的旧状态）");
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
	// 存档清洗：只有「当前确实持有对应能力」才保留锁字段
	const epicCleaned = state.normalizeRun({ ...epic, skillShopLocked: true, curioShopLocked: true });
	assertEqual(epicCleaned.skillShopLocked, true, "史诗档技能锁保留");
	assertEqual(epicCleaned.curioShopLocked, true, "史诗档奇物锁保留");
	const rareCleaned = state.normalizeRun({ ...rare, skillShopLocked: true, curioShopLocked: true });
	assertEqual(rareCleaned.skillShopLocked, true, "稀有档技能锁保留");
	assertEqual(rareCleaned.curioShopLocked, false, "稀有档奇物锁清零（还锁不了奇物商店）");
	const noneCleaned = state.normalizeRun({ ...freshRun(cfg.RUN_MODE.endless), skillShopLocked: true, curioShopLocked: true });
	assertEqual(noneCleaned.skillShopLocked, false, "没橱窗时技能锁清零");
	assertEqual(noneCleaned.curioShopLocked, false, "没橱窗时奇物锁清零");
	assertEqual(freshRun(cfg.RUN_MODE.endless).skillShopLocked, false, "旧档（缺字段）默认未锁定");
	return "能力闸门 / 切换不变异 / 两类商店的结算保留（买过的留货并显示已购买） / 清洗按能力闸门";
});

check("新增四事件：倍率按刚打赢那关的基准换算成固定值，消耗写进文案", () => {
	const build = id => eventManager.buildPendingEvent(id, BASE_LEVEL, () => 0, NOW, { curios: [] });
	// 废弃补给站：翻找是纯金币，仔细搜寻是「金币换经验」的五五开
	const supply = build("abandoned_supply");
	assertEqual(supply.id, "abandoned_supply", "待处理事件只存 id（名字由事件页现读定义）");
	assertEqual(JSON.stringify(supply.choices[0].reward), JSON.stringify({ gold: BASE_GOLD }), "翻找补给箱 = 1 倍基准金币");
	assertEqual(JSON.stringify(supply.choices[1].reward), JSON.stringify({ gold: BASE_GOLD / 2, exp: BASE_EXP / 2 }), "仔细搜寻 = 0.5 / 0.5");
	assert(!supply.choices[0].text.includes("金币"), `白拿的选项不加价钱后缀：${supply.choices[0].text}`);
	// 老兵的训练：让他训练 = 1 倍经验；花钱请教 = 扣半层金币换 2 倍经验
	const veteran = build("veteran_training");
	assertEqual(JSON.stringify(veteran.choices[0].reward), JSON.stringify({ exp: BASE_EXP }), "让他训练 = 1 倍基准经验");
	assertEqual(JSON.stringify(veteran.choices[1].reward), JSON.stringify({ gold: -Math.round(BASE_GOLD / 2), exp: BASE_EXP * 2 }), "花钱请教 = -0.5 金币 / +2 经验");
	assert(veteran.choices[1].text.includes(`${-Math.round(BASE_GOLD / 2)} 金币`), `消耗要写进文案：${veteran.choices[1].text}`);
	// 黄金矿脉：立即开采两头各 1 倍，仔细采集金币更多（1.5）经验更少（0.5）
	const vein = build("gold_vein");
	assertEqual(JSON.stringify(vein.choices[0].reward), JSON.stringify({ gold: BASE_GOLD, exp: BASE_EXP }), "立即开采 = 1 / 1");
	assertEqual(JSON.stringify(vein.choices[1].reward), JSON.stringify({ gold: Math.round(BASE_GOLD * 1.5), exp: BASE_EXP / 2 }), "仔细采集 = 1.5 / 0.5");
	// 经验商人：两个方向是同一个汇率的两头，第三项是白走的出口
	const merchant = build("exp_merchant");
	assertEqual(merchant.choices.length, 3, "商人三个选项");
	assertEqual(JSON.stringify(merchant.choices[0].reward), JSON.stringify({ gold: -BASE_GOLD, exp: BASE_EXP * 2 }), "金币换经验");
	assertEqual(JSON.stringify(merchant.choices[1].reward), JSON.stringify({ gold: BASE_GOLD, exp: -BASE_EXP * 2 }), "经验换金币");
	assertEqual(JSON.stringify(merchant.choices[2].reward), JSON.stringify({}), "我不需要，谢谢 = 零变化");
	assert(merchant.choices[1].text.includes(`${-BASE_EXP * 2} 经验`), `花经验也要写价钱：${merchant.choices[1].text}`);
	// 结算：钱够才扣得动，不够整单拒绝且一个钱不动
	const rich = { ...freshRun(cfg.RUN_MODE.endless), currency: { gold: 500, exp: 500 }, pendingEvent: merchant };
	const bought = eventManager.resolveEventChoice(rich, 0, {}, () => 0);
	assert(bought.ok, bought.error ?? "金币换经验应成交");
	assertEqual(bought.run.currency.gold, 500 - BASE_GOLD, "扣一倍基准金币");
	assertEqual(bought.run.currency.exp, 500 + BASE_EXP * 2, "拿两倍基准经验");
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

check("Boss 标记归场：整局 bossRun 已移除，isBossBattle 随 currentBattle 往返且读档不重掷", () => {
	assertEqual(cfg.BOSS_RUN_RATE, 0.05, "判定概率仍是 5%（本次只改判定时机，不改概率）");
	assertEqual(cfg.RUN_VERSION, 12, "存档版本抬到 v12");
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
	assert(midBoss.errors.some(error => error.includes("迁移到12")), "v11 旧档报一条迁移提示");
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

check("v11 旧档阵容带 boss 敌人但旧 bossRun 为 false：折算结果仍是普通战斗", () => {
	const run = state.normalizeRun({
		...freshRun(cfg.RUN_MODE.endless),
		bossRun: false,
		currentBattle: { status: "battle", enemies: [{ characterId: "佐菲", boss: true }], rift: null },
	});
	assertEqual(run.currentBattle.isBossBattle, false, "旧档判定为普通局时不因阵容里有 boss 敌人而翻案");
	// 损坏的 legacy 入参（整局字段不是布尔）也绝不能被当成 Boss 场
	const junk = state.normalizeRun({
		...freshRun(cfg.RUN_MODE.endless),
		bossRun: "yes",
		currentBattle: { status: "battle", enemies: [{ characterId: "佐菲", boss: true }], rift: null },
	});
	assertEqual(junk.currentBattle.isBossBattle, false, "非 true 的旧字段按 false 处理");
	return "旧 false / 非法值两态";
});

check("Boss 战阵容：单敌、非禁将抽取、复制两个其他角色的全部技能、自带一个深渊强化", () => {
	Object.assign(lib.character, {
		测试甲: [4, "male", "ao", ["donor_a1", "donor_a2"], 1],
		测试乙: [4, "male", "ao", ["donor_b1", "donor_bad"], 1],
		测试丙: [4, "male", "ao", ["donor_c1"], 1],
		本体测试将: [4, "male", "qun", [], 1],
	});
	Object.assign(lib.skill, {
		donor_a1: {}, donor_a2: {}, donor_b1: {}, donor_c1: {},
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
		// 技能来源是「另外两个不同角色」：来源角色可以是禁将（规格不限制），但技能要过兼容性校验
		assert(boss.skills.length >= 2, `至少复制到两个来源角色的技能：${boss.skills.join(",")}`);
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
		assertEqual(JSON.stringify(forced[0].skills), JSON.stringify(["donor_b1", "donor_c1"]), "技能来源不受禁将限制（规格明确不加这条）");
		// 全员禁用：返回空阵容交给上层提示，而不是报错
		lib.config.identity_banned = challengePool;
		assertEqual(enemy.createBossEnemyConfig(3, cfg.RUN_MODE.challenge, () => 0).length, 0, "可用池为空返回空阵容");
		delete lib.config.identity_banned;
		delete lib.config.all;
		// 阵容可原样落盘读回（boss 标记与技能列表都是白名单字段），本场的 Boss 身份一起带走
		const stored = state.normalizeRun({ ...freshRun(), currentBattle: { status: "battle", enemies: forced, rift: null, isBossBattle: true } });
		assertEqual(stored.currentBattle.enemies[0].boss, true, "boss 标记读档保留");
		assertEqual(stored.currentBattle.isBossBattle, true, "本场 Boss 身份与阵容一起落盘、一起读回");
		assertEqual(JSON.stringify(stored.currentBattle.enemies[0].skills), JSON.stringify(["donor_b1", "donor_c1"]), "复制来的技能读档保留");
		return "单敌 / 禁将拦 Boss / 两来源全技能 / 自带 1 强化 / 空池兜底";
	} finally {
		for (const id of ["测试甲", "测试乙", "测试丙", "本体测试将"]) {
			delete lib.character[id];
		}
		for (const id of ["donor_a1", "donor_a2", "donor_b1", "donor_c1", "donor_bad"]) {
			delete lib.skill[id];
		}
		delete lib.config.identity_banned;
		delete lib.config.all;
	}
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

check("Boss 战胜利：本场标记回传 + 20 倍奖励（不吃奇物加成）+ 奇物商店强制刷新，下一场普通战斗不受牵连", () => {
	const rng = () => 0.999;
	// rng 钉在 0.999：普通场必不刷奇物商店（0.999 ≥ 0.2），Boss 场必须刷出——证明是强制而非概率
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
	assertEqual(bossWin.gained.exp, base.exp * cfg.BOSS_REWARD_MULTIPLIER, "经验 = 20 倍本关胜利经验");
	assert(bossWin.run.curioOffers.length > 0, "奇物商店强制刷新出一批");
	assertEqual(bossWin.run.level, run.level + 1, "关卡照常推进");
	assertEqual(bossWin.run.currentBattle, null, "本场战斗状态已清理");
	assertEqual(bossWin.run.shopRefreshesRemaining, cfg.SKILL_REFRESH_PER_LEVEL, "免费刷新次数照常恢复");
	// 关键：Boss 的倍率与强刷只生效这一次。下一场是普通战斗（currentBattle 已空 = 由 flow 重新判定），
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
	// 收藏家的橱窗（史诗档）锁着旧货：Boss 场照样强制刷新替换
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
	assert(!lockedWin.run.curioOffers.some(offer => offer.id === "energy_core"), "锁着的旧货被强制刷新替换");
	assert(lockedWin.run.curioOffers.length > 0, "强制刷新后仍有新货");
	return `第 4 关 Boss ${base.gold * 20}/${base.exp * 20}，下一场回 1 倍 + 强制刷新与锁覆盖各验一次`;
});

check("Boss 战强制惩罚：随机失去 1 个购买技能与 1 件奇物，空列表安全跳过", () => {
	const run = {
		...freshRun(cfg.RUN_MODE.endless),
		skills: [SKILL_A, SKILL_B, SKILL_C],
		curios: ["energy_core", "cursed_coin"],
		curioQuality: { energy_core: "rare" },
		collection: { events: [], curios: ["energy_core", "cursed_coin"] },
	};
	const lostSkill = penalty.loseRandomSkill(run, () => 0, NOW);
	assertEqual(lostSkill.removed, SKILL_A, "rng=0 丢第一个");
	assertEqual(JSON.stringify(lostSkill.run.skills), JSON.stringify([SKILL_B, SKILL_C]), "其余技能保留");
	const lostCurio = penalty.loseRandomCurio(lostSkill.run, () => 0.99, NOW);
	assertEqual(lostCurio.removed, "cursed_coin", "rng=0.99 丢第二件");
	assertEqual(JSON.stringify(lostCurio.run.curios), JSON.stringify(["energy_core"]), "其余奇物保留");
	assertEqual(lostCurio.run.curioQuality.energy_core, "rare", "没丢的奇物品质保留");
	assertEqual(lostCurio.run.curioQuality.cursed_coin, undefined, "被丢奇物的品质条目一并清掉");
	assertEqual(JSON.stringify(lostCurio.run.collection.curios), JSON.stringify(["energy_core", "cursed_coin"]), "图鉴「曾经拥有过」不受影响");
	// 空列表安全：ok:false 原样返回，绝不报错、绝不动别的数据
	const noSkills = penalty.loseRandomSkill({ ...freshRun(), skills: [] }, () => 0, NOW);
	assert(!noSkills.ok && noSkills.run.skills.length === 0, "没有购买技能时不报错");
	const noCurios = penalty.loseRandomCurio({ ...freshRun(), curios: [] }, () => 0, NOW);
	assert(!noCurios.ok && noCurios.run.curios.length === 0, "没有奇物时不报错");
	// 原 run 一个字节都不动
	assertEqual(JSON.stringify(run.skills), JSON.stringify([SKILL_A, SKILL_B, SKILL_C]), "传入 run 不被修改");
	return "技能/奇物各丢一件 + 两次空列表兜底";
});

console.log(`\nrogue.test: passed=${passed} failed=${failures.length}`);

if (failures.length) {
	console.log(`失败用例：${failures.join("、")}`);
	process.exit(1);
}
