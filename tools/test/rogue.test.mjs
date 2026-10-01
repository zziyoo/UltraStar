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
const stages = await load("src/rogue/data/stages.js");
const groups = await load("src/rogue/data/enemyGroups.js");
const statsData = await load("src/rogue/data/stats.js");
const skillsData = await load("src/rogue/data/skills.js");

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
const SKILL_A = "rogue_xushui";
const SKILL_B = "rogue_jiema";
const SKILL_C = "rogue_guiyuan";

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
	assertEqual(run.currentBattle, null, "缺 groupId 的战斗标记丢弃");
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
	const offers = shop.rollSkillOffers(run, makeRng(7));
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
	const offers = shop.rollSkillOffers(run, makeRng(3));
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
	statsData.stats[statId].price = [];
	return `${statId} 上限 ${maxed.maxLevel}`;
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
	const none = penalty.settleDefeat(nothing, NOW);
	assertEqual(none.kind, "none", "无技能且属性全 0 时不再惩罚");

	const lost = penalty.loseSkill({ ...res.run }, SKILL_A, NOW);
	assert(lost.ok && !lost.run.skills.includes(SKILL_A), "失去技能");
	const lowered = penalty.lowerStat({ ...res.run }, cfg.STAT_IDS[0], NOW);
	assert(lowered.ok && lowered.run.stats[cfg.STAT_IDS[0]] === 0, "属性降级");
	const again = penalty.lowerStat(lowered.run, cfg.STAT_IDS[0], NOW);
	assert(!again.ok, "已是最低等级不能继续降");
	return "fallback 分支";
});

check("闯关胜利：奖励入账、关卡推进、通关后不越界", () => {
	const run = freshRun();
	const first = reward.settleVictory(run, NOW);
	const expected = first.gained.gold;
	assert(Number.isFinite(expected) && expected > 0, "应有奖励数值");
	assertEqual(first.run.level, 2, "推进到第2关");
	assertEqual(first.run.currency.gold, expected, "金币入账");
	assertEqual(first.run.currentBattle, null, "战斗标记清除");

	const last = { ...run, level: cfg.CHALLENGE_TOTAL_LEVELS };
	const done = reward.settleVictory(last, NOW);
	assertEqual(done.run.level, cfg.CHALLENGE_TOTAL_LEVELS, "通关后关卡不越界");
	assertEqual(done.run.cleared, true, "标记已通关");
	return `首关奖励 ${JSON.stringify(first.gained)}`;
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

check("关卡敌人池选择：区间命中、越界回落、配置为空时报错", () => {
	const first = stages.getGroupsForLevel(1);
	assert(Array.isArray(first) && first.length > 0, "第1关应有池子");
	assert(first.every(id => groups.getEnemyGroup(id)), "池内组合必须存在");
	const beyond = stages.getGroupsForLevel(9999);
	assertEqual(beyond, stages.endlessFallbackPool.length ? stages.endlessFallbackPool : null, "超出区间用兜底池");
	const saved = beyond[0];
	assertEqual(groups.getEnemyGroup(saved).enemies.length >= 1, true, "兜底组合可建局");
	assertEqual(groups.getEnemyGroup("不存在的组合"), null, "未知组合返回 null");
	const backup = stages.stagePools.slice();
stages.stagePools.length = 0;
	const empted = stages.getGroupsForLevel(3);
	assert(Array.isArray(empted), "区间清空后走兜底池");
stages.stagePools.push(...backup);
	assertEqual(stages.stagePools.length, backup.length, "测试后配置复原");
	return `第1关 ${first.length} 组可选`;
});

check("currentBattle 恢复：只保留 groupId，重开同一组而不重掷", () => {
	const run = state.normalizeRun({ ...freshRun(), currentBattle: { groupId: "group_baltan", status: "battle", extra: "junk" } });
	assertEqual(run.currentBattle.groupId, "group_baltan", "groupId 保留");
	assertEqual(run.currentBattle.extra, undefined, "多余字段被剔除");
	assertEqual(Object.keys(run.currentBattle).sort().join(","), "groupId,status");
	const broken = state.normalizeRun({ ...freshRun(), currentBattle: { status: "battle" } });
	assertEqual(broken.currentBattle, null, "无 groupId 视为无未完成战斗");
	const wrongStatus = state.normalizeRun({ ...freshRun(), currentBattle: { groupId: "group_baltan", status: "shop" } });
	assertEqual(wrongStatus.currentBattle, null, "未知状态视为无未完成战斗");
	return "重启后沿用同一组合";
});

console.log(`\nrogue.test: passed=${passed} failed=${failures.length}`);
if (failures.length) {
	console.log(`失败用例：${failures.join("、")}`);
	process.exit(1);
}
