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
/** 桩里的 lib：与各模块拿到的是同一个对象，用来临时塞 lib.poptip 之类的桩数据 */
const { lib } = await import(MOCK_URL);

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

check("新局初始资源：金币 50（=技能基准价，第一关即可购买）/ 经验 2，旧存档不会被补发", () => {
	for (const mode of [cfg.RUN_MODE.challenge, cfg.RUN_MODE.endless]) {
		const run = freshRun(mode);
		assertEqual(run.currency.gold, cfg.INITIAL_CURRENCY.gold, `${mode} 初始金币`);
		assertEqual(run.currency.exp, cfg.INITIAL_CURRENCY.exp, `${mode} 初始经验`);
	}
	// 旧档（没有 currency 字段）按 0 处理；明确记 0 的也保持 0
	const old = state.normalizeRun({ version: 1, mode: "challenge", characterId: "迪迦", level: 3 });
	assertEqual(old.currency.gold, 0, "旧档不补发金币");
	assertEqual(old.currency.exp, 0, "旧档不补发经验");
	const zero = state.normalizeRun({ ...freshRun(), currency: { gold: 0, exp: 0 } });
	assertEqual(zero.currency.gold, 0, "明确记 0 的存档保持 0");
	// 初始金币必须保证第一关进商店就买得起技能：不低于基准价 ±25% 的下界（38）
	assert(cfg.INITIAL_CURRENCY.gold >= shop.getRandomSkillPrice(() => 0), `初始金币 ${cfg.INITIAL_CURRENCY.gold} 应 ≥ 售价下界`);
	return `${cfg.INITIAL_CURRENCY.gold}/${cfg.INITIAL_CURRENCY.exp}`;
});

check("技能价格：基准价固定 50，售价在 ±25% 内取整，与关卡彻底无关", () => {
	assertEqual(shop.getSkillBasePrice(), 50, "基准价固定 50");
	// 50 × 0.75 ~ 50 × 1.25 = 37.5 ~ 62.5，Math.round 下实际落在 38~63
	assertEqual(shop.getRandomSkillPrice(() => 0), 38, "下界");
	assertEqual(shop.getRandomSkillPrice(() => 0.999999), 62, "接近上界");
	assertEqual(shop.getRandomSkillPrice(() => 0.5), 50, "中值");
	// 同一 rng 序列下，无论第 1、10、30、100、1000 关，价格序列完全一致
	const prices = level => {
		const run = { ...freshRun(), level };
		return shop.rollSkillOffers(run, makeRng(7), [], skillsData.pool).map(offer => offer.price).join(",");
	};
	assertEqual(prices(1), prices(10), "第 1 关与第 10 关价格一致");
	assertEqual(prices(1), prices(30), "第 1 关与第 30 关价格一致");
	assertEqual(prices(1), prices(100), "第 1 关与第 100 关价格一致");
	assertEqual(prices(1), prices(1000), "第 1 关与第 1000 关价格一致");
	const rolled = prices(1).split(",").map(Number);
	assert(rolled.every(price => price >= 38 && price <= 63), `售价应落在 38~63：${rolled.join(",")}`);
	return "38 ~ 63";
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

check("无尽奖励：floor(√n × 系数)（金币 5 / 经验 2），按刚完成的关卡编号结算", () => {
	for (const [level, gold, exp] of [[1, 5, 2], [2, 7, 2], [3, 8, 3], [4, 10, 4], [100, 50, 20]]) {
		const gained = rewardsData.getEndlessReward(level, cfg.CURRENCIES);
		assertEqual(gained.gold, gold, `第${level}关金币`);
		assertEqual(gained.exp, exp, `第${level}关经验`);
	}
	// 结算用刚完成的关卡编号：level=2 的存档打赢后按 n=2 发奖，然后才推进到 3
	const run = { ...freshRun(cfg.RUN_MODE.endless), level: 2 };
	const won = reward.settleVictory(run, NOW);
	assertEqual(won.gained.gold, 7, "按刚完成的第 2 关发金币");
	assertEqual(won.gained.exp, 2, "按刚完成的第 2 关发经验");
	assertEqual(won.run.level, 3, "发完奖再推进到第 3 关");
	return "1:5/2 2:7/2 3:8/3 100:50/20";
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

check("属性规则：攻击概率按等级递增且展示接口复用真实效果", () => {
	assertEqual(statsData.describeStat("attack", 0).lines[0], "未强化", "0 级明确显示未强化");
	assertEqual(statsData.getStatSummary("attack", 1).shaDamageChance, 10, "攻击 Lv.1 概率");
	assertEqual(statsData.getStatSummary("attack", 2).shaDamageChance, 10, "攻击 Lv.2 概率");
	assertEqual(statsData.getStatSummary("attack", 3).shaDamageChance, 20, "攻击 Lv.3 概率");
	assertEqual(statsData.getStatSummary("attack", 10).shaDamageChance, 50, "攻击 Lv.10 概率封顶");
	assertEqual(statsData.getStatSummary("attack", 1).shaLimit, 0, "攻击 Lv.1 不增加出杀");
	assertEqual(statsData.getStatSummary("attack", 2).shaLimit, 1, "攻击 Lv.2 出杀 +1");
	assertEqual(statsData.getStatSummary("attack", 3).shaLimit, 1, "攻击 Lv.3 出杀 +1");
	const all = statsData.describeStat("attack", 4);
	assert(all.lines.some(line => line.includes("20%") && line.includes("+1")), "面板说明应来自攻击真实效果");
	return "Lv.1/2/3/10 = 10%/10%/20%/50%";
});

check("属性强化合并成一个技能：四种效果都还在，标记说明列全部加成", () => {
	const stat = skillsData.helpers.rogue_stat;
	const player = { storage: { rogue_stat: { extraDraw: 2, handLimit: 1, shaDamageChance: 20, shaLimit: 1 } } };

	// 摸牌阶段
	const draw = { name: "phaseDrawBegin2", num: 2 };
	assert(stat.filter(draw, player, "phaseDrawBegin2"), "有摸牌加成时应通过 filter");
	stat.content({}, draw, player);
	assertEqual(draw.num, 4, "摸牌 +2");
	assert(!stat.filter({ name: "phaseDrawBegin2", num: 2, numFixed: true }, player, "phaseDrawBegin2"), "numFixed 时不触发");

	// 【杀】伤害：命中时只额外 +1，未命中与非【杀】不变
	const originalRandom = Math.random;
	try {
		Math.random = () => 0.1;
		const hit = { name: "damageBegin1", num: 1, card: { name: "sha" } };
		assert(stat.filter(hit, player, "damageBegin1"), "用杀造成伤害时应通过 filter");
		stat.content({}, hit, player);
		assertEqual(hit.num, 2, "概率命中时杀伤害只 +1");
		Math.random = () => 0.2;
		const miss = { name: "damageBegin1", num: 1, card: { name: "sha" } };
		stat.content({}, miss, player);
		assertEqual(miss.num, 1, "概率未命中时伤害不变");
		const nonSha = { name: "damageBegin1", num: 1, card: { name: "juedou" } };
		assert(!stat.filter(nonSha, player, "damageBegin1"), "不是杀就不触发");
	} finally {
		Math.random = originalRandom;
	}

	// 手牌上限 / 出杀次数
	assertEqual(stat.mod.maxHandcard(player, 4), 5, "手牌上限 +1");
	assertEqual(stat.mod.cardUsable({ name: "sha" }, player, 1), 2, "出杀次数 +1");
	assertEqual(stat.mod.cardUsable({ name: "shan" }, player, 1), undefined, "非杀不改次数");

	// 数值全 0 时不触发
	const bare = { storage: { rogue_stat: { extraDraw: 0, handLimit: 0, shaDamageChance: 0, shaLimit: 0 } } };
	assert(!stat.filter({ name: "phaseDrawBegin2", num: 2 }, bare, "phaseDrawBegin2"), "无加成不触发");
	assert(!stat.filter({ name: "damageBegin1", card: { name: "sha" } }, bare, "damageBegin1"), "无加成不触发（伤害）");

	// 唯一标记：说明里列出四项实时数值
	const html = stat.intro.mark(null, player.storage.rogue_stat, player);
	for (const token of ["摸牌阶段 +2 张", "手牌上限 +1", "使用【杀】时 20% 概率额外造成 +1 伤害", "出【杀】次数 +1"]) {
		assert(html.includes(token), `标记说明应包含「${token}」：${html}`);
	}
	assert(!html.includes("[object Object]"), "不能出现 [object Object]");
	assertEqual(stat.intro.nocount, true, "对象型 storage 不该让本体去数标记数量");
	return "四效果 + 单标记";
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
	assert(next.offers.every(offer => offer.price >= 38 && offer.price <= 63), `刷新价格仍按固定基准价 50 ±25% 生成（38~63）：${next.offers.map(o => o.price).join(",")}`);
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

console.log(`\nrogue.test: passed=${passed} failed=${failures.length}`);
if (failures.length) {
	console.log(`失败用例：${failures.join("、")}`);
	process.exit(1);
}
