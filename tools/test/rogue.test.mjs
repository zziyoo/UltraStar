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
const statsData = await load("src/rogue/data/stats.js");
const skillsData = await load("src/rogue/data/skills.js");
const skillPool = await load("src/rogue/skillPool.js");
const rewardsData = await load("src/rogue/data/rewards.js");
const enemy = await load("src/rogue/enemy.js");
const rogueBgm = await load("src/rogue/bgm.js");
const eventsData = await load("src/rogue/data/events.js");
const curiosData = await load("src/rogue/data/curios.js");
const curioManager = await load("src/rogue/curioManager.js");
const eventManager = await load("src/rogue/eventManager.js");
/** 桩里的 lib：与各模块拿到的是同一个对象，用来临时塞 lib.poptip 之类的桩数据 */
const { lib, game: mockGame } = await import(MOCK_URL);

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
		{ characterId: "巴尔坦星人", stats: { defense: 3, draw: 5, attack: 2 }, skills: [], maxHp: 0, hp: 0 },
		{ characterId: "佐菲", stats: { defense: 10, draw: 0, attack: 0 }, skills: ["test_enemy_skill"], maxHp: 2, hp: 0 },
	];
	const run = state.normalizeRun({ ...freshRun(), currentBattle: { status: "battle", enemies, extra: "junk" } });
	assertEqual(run.currentBattle.status, "battle", "状态保留");
	assertEqual(run.currentBattle.enemies.length, 2, "敌人数保留");
	assertEqual(JSON.stringify(run.currentBattle.enemies), JSON.stringify(enemies), "阵容原样保留（多余字段剔除）");
	assertEqual(Object.keys(run.currentBattle).sort().join(","), "enemies,status", "只保留 status 与 enemies");
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
	assert(ids.has("pool_shared"), "还有别的未禁用武将拥有时不该被排除");
	assert(!ids.has("pool_banned"), "禁用武将的技能不该进池");
	assert(!ids.has("pool_derived"), "禁用武将技能的衍生技不该进池");
	assert(!ids.has("pool_boss"), "玩家选不到的 Boss 技能不该进池");
	assert(!ids.has("pool_internal"), "本体判为不可选用的内部技能不该进池");
	assert(curated.every(id => ids.has(id)), `作者上架清单 ${curated.length} 条要全数保留`);
	return `池 ${ids.size} 条 / 作者清单 ${curated.length} 条`;
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
	assertEqual(state.normalizeRun({ ...legacy, shopRefreshesRemaining: 99 }).shopRefreshesRemaining, cfg.SKILL_REFRESH_PER_LEVEL, "脏数据按上限钳制");
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
	assertEqual(run.curioOffers[1].price, 0, "负价钳到 0");
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

check("奇物定价：基准 round(50×√关卡)，±25% 随机后 round，倍率生效", () => {
	assertEqual(curioManager.getCurioBasePrice(1), 50, "第 1 关基准");
	assertEqual(curioManager.getCurioBasePrice(10), 158, "第 10 关基准 round(158.11)");
	assertEqual(curioManager.getCurioBasePrice(2), 71, "第 2 关基准 round(70.7)（技能 floor 是 70）");
	assertEqual(curioManager.getCurioBasePrice(), 50, "缺省按第 1 关");
	const level10 = { mode: cfg.RUN_MODE.endless, level: 10 };
	assertEqual(curioManager.getCurioPrice(10, 1, () => 0), 119, "下界 round(118.5)=119");
	assertEqual(curioManager.getCurioPrice(10, 1, () => 0.999999), 197, "接近上界 round(197.4)");
	assertEqual(curioManager.getCurioPrice(10, 2, () => 0), 237, "倍率 2：round(118.5×2)");
	assertEqual(curioManager.getCurioPrice(10, undefined, () => 0), 119, "倍率缺失按 1");
	for (let i = 0; i < 100; i++) {
		const price = curioManager.getCurioPrice(10, 1);
		assert(Number.isInteger(price) && price >= 119 && price <= 198, `售价 ${price} 越界`);
	}
	return "第 10 关 119~197";
});

check("奇物候选：胜利时摇三个、排除已拥有、池空给少、结果可持久化", () => {
	const rng = makeRng(7);
	const run = freshRun(cfg.RUN_MODE.endless);
	const offers = curioManager.rollCurioOffers(run, rng);
	assertEqual(offers.length, cfg.CURIO_OFFER_COUNT, "候选数");
	assertEqual(new Set(offers.map(offer => offer.id)).size, cfg.CURIO_OFFER_COUNT, "不重复");
	const poolIds = new Set(curiosData.curioIds);
	assert(offers.every(offer => poolIds.has(offer.id)), "候选来自奇物池");
	assert(offers.every(offer => Number.isFinite(offer.price) && offer.sold === false), "候选结构");
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

check("购买奇物：扣款入袋、写图鉴、标记已购、重复购买被拒", () => {
	const run = freshRun(cfg.RUN_MODE.endless);
	run.currency.gold = 1000;
	run.curioOffers = [
		{ id: "energy_core", price: 10, sold: false },
		{ id: "lucky_stone", price: 10, sold: false },
	];
	const bought = curioManager.buyCurio(run, "energy_core");
	assert(bought.ok, bought.error ?? "购买应成功");
	assertEqual(bought.run.currency.gold, 990, "扣款");
	assertEqual(JSON.stringify(bought.run.curios), JSON.stringify(["energy_core"]), "奇物入袋");
	assertEqual(JSON.stringify(bought.run.collection.curios), JSON.stringify(["energy_core"]), "图鉴记录");
	assertEqual(bought.run.curioOffers.find(offer => offer.id === "energy_core").sold, true, "标记已购");
	assertEqual(bought.run.curioOffers.find(offer => offer.id === "lucky_stone").sold, false, "另一候选不受影响");
	// 买过之后整批售罄：直接买第二个被拒
	const again = curioManager.buyCurio(bought.run, "lucky_stone");
	assert(!again.ok && again.error.includes("售罄"), "一局限买一个");
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

check("事件触发：概率判定用注入 rng，闯关绝不触发，已有事件绝不重掷", () => {
	const endless = freshRun(cfg.RUN_MODE.endless);
	assertEqual(eventManager.shouldTriggerEvent(() => 0.29), true, "0.29 < 0.3 触发");
	assertEqual(eventManager.shouldTriggerEvent(() => 0.3), false, "0.3 不触发");
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
	// 第 1 关胜利奖励 50 金币 / 20 经验：修复机器人 = -50 金币 +20 经验
	const built = eventManager.buildPendingEvent("lost_robot", 1, makeRng(1), NOW);
	assertEqual(built.choices.length, 3, "选项数");
	assertEqual(JSON.stringify(built.choices[0].reward), JSON.stringify({ gold: -50, exp: 20 }), "倍率换算成固定值");
	assertEqual(JSON.stringify(built.choices[1].reward), JSON.stringify({ curio: "random" }), "随机奇物保持标记");
	assertEqual(JSON.stringify(built.choices[2].reward), JSON.stringify({}), "离开无奖励");
	// 第 100 关：金币 floor(500)、经验 floor(200) → 倍率跟着放大
	const late = eventManager.buildPendingEvent("lost_robot", 100, makeRng(1), NOW);
	assertEqual(JSON.stringify(late.choices[0].reward), JSON.stringify({ gold: -500, exp: 200 }), "高关卡按当关奖励缩放");
	// 幸运硬币：rng=0 预掷第一段（+1 倍），rng→1 预掷第二段（-0.4 倍）
	const heads = eventManager.buildPendingEvent("lucky_coin", 1, () => 0, NOW);
	assertEqual(JSON.stringify(heads.choices[0].reward), JSON.stringify({ gold: 50 }), "rng=0 → +50");
	const tails = eventManager.buildPendingEvent("lucky_coin", 1, () => 0.999, NOW);
	assertEqual(JSON.stringify(tails.choices[0].reward), JSON.stringify({ gold: -20 }), "rng→1 → -20（round(50×-0.4)）");
	// 同一 rng 序列下构建两次结果一致（预掷可复现），且能原样写进存档
	const a = eventManager.buildPendingEvent("unknown_lab", 3, makeRng(9), NOW);
	const b = eventManager.buildPendingEvent("unknown_lab", 3, makeRng(9), NOW);
	assertEqual(JSON.stringify(a), JSON.stringify(b), "同种子构建一致");
	const saved = state.normalizeRun({ ...freshRun(cfg.RUN_MODE.endless), pendingEvent: a });
	assertEqual(JSON.stringify(saved.pendingEvent), JSON.stringify(a), "预掷结果可持久化");
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

check("胜利结算（无尽）：摇奇物候选、幸运石放大经验；闯关两项都不做", () => {
	// 无尽第 1 关胜利：候选按推进后的第 2 关定价（round(50×√2)=71 → 53~89）
	const endless = freshRun(cfg.RUN_MODE.endless);
	const won = reward.settleVictory(endless, NOW, () => 0);
	assertEqual(won.run.level, 2, "推进到第 2 关");
	assertEqual(won.run.curioOffers.length, cfg.CURIO_OFFER_COUNT, "候选三个");
	assert(won.run.curioOffers.every(offer => offer.price >= 53 && offer.price <= 89), `第 2 关售价 53~89：${won.run.curioOffers.map(offer => offer.price).join(",")}`);
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
	// 10% 门控：rng ≥ CURIO_SHOP_RATE 未命中 → 原候选原样保留（还挂着上一批没买的）；
	// rng < CURIO_SHOP_RATE 命中 → 整批重摇。事件判定在 mode.js 里排在其后（先奇物商店、再事件）
	const keep = { ...freshRun(cfg.RUN_MODE.endless), level: 4, curioOffers: [{ id: "lucky_stone", price: 66, sold: false }] };
	const kept = reward.settleVictory(keep, NOW, () => 0.5);
	assertEqual(kept.run.level, 5, "未命中同样推进关卡");
	assertEqual(JSON.stringify(kept.run.curioOffers), JSON.stringify([{ id: "lucky_stone", price: 66, sold: false }]), "未命中保留原候选");
	const rerolled = reward.settleVictory({ ...keep }, NOW, () => 0);
	assertEqual(rerolled.run.curioOffers.length, cfg.CURIO_OFFER_COUNT, "命中整批重摇");
	assert(rerolled.run.curioOffers.every(offer => offer.sold === false), "新一批全部未售出");
	// 结算不清奇物与图鉴
	assertEqual(JSON.stringify(blessed.run.curios), JSON.stringify(["lucky_stone"]), "胜利不清奇物");
	return `无尽候选 ${won.run.curioOffers.length} 个 / 幸运石 exp 20→22`;
});

check("过期候选清理：事件送的奇物撤下候选，读档剔除已拥有未售出的条目", () => {
	// 事件送奇物：若送出的同款还挂在商店候选里（生成候选时还没拥有），整条撤下
	const run = freshRun(cfg.RUN_MODE.endless);
	run.curioOffers = [
		{ id: "lucky_stone", price: 10, sold: false },
		{ id: "energy_core", price: 10, sold: false },
	];
	const lucky = curioManager.grantRandomCurio({ ...run }, () => 0.2);
	assertEqual(lucky.curioId, "lucky_stone", "rng 定位幸运石");
	assert(!lucky.run.curioOffers.some(offer => offer.id === "lucky_stone"), "送出的奇物从候选撤下");
	assertEqual(lucky.run.curioOffers.length, 1, "其它候选不受影响");
	assertEqual(lucky.run.curioOffers[0].id, "energy_core", "剩余候选原样");
	// 读档清洗：已拥有且未售出 → 剔除；已拥有且已售出 → 保留（「已购买」展示）；未拥有 → 保留
	const stored = state.normalizeRun({
		...freshRun(cfg.RUN_MODE.endless),
		curios: ["energy_core"],
		curioOffers: [
			{ id: "energy_core", price: 10, sold: false },
			{ id: "lucky_stone", price: 10, sold: true },
			{ id: "broken_watch", price: 10, sold: false },
			{ id: "幽灵", price: 10, sold: false },
		],
	});
	assertEqual(JSON.stringify(stored.curioOffers.map(offer => offer.id)), JSON.stringify(["lucky_stone", "broken_watch"]), "过期条目剔除，其余保留");
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

console.log(`\nrogue.test: passed=${passed} failed=${failures.length}`);
if (failures.length) {
	console.log(`失败用例：${failures.join("、")}`);
	process.exit(1);
}
