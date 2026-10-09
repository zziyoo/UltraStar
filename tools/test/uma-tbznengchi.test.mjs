// 特别周·能吃（tbznengchi）专项测试。
// packages/uma-musume/skills.js 直接 import 了 ../../../../noname.js（浏览器包，Node 里跑不起来），
// 所以这里剥掉 import/export，用最小桩件把技能定义重新求值出来，再逐条验证规则。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const skillsPath = path.join(here, "..", "..", "packages", "uma-musume", "skills.js");

// ---------------------------------------------------------------- 桩件
class Card {
	constructor(name) {
		this.name = name;
	}
}

/** 装备定义与 resources/app/src/card/standard.js / extra.js 保持一致 */
const lib = {
	card: {
		sha: { type: "basic" },
		// 武器
		qinglong: { type: "equip", subtype: "equip1", distance: { attackFrom: -2 }, skills: ["qinglong_skill"] },
		cixiong: { type: "equip", subtype: "equip1", distance: { attackFrom: -1 }, skills: ["cixiong_skill"] },
		zhuge: { type: "equip", subtype: "equip1", skills: ["zhuge_skill"] },
		// 防具
		bagua: { type: "equip", subtype: "equip2", skills: ["bagua_skill"] },
		renwang: { type: "equip", subtype: "equip2", skills: ["renwang_skill"] },
		// 防御马 equip3：其他角色计算与你的距离 +1
		dilu: { type: "equip", subtype: "equip3", distance: { globalTo: 1 } },
		// 进攻马 equip4：你计算与其他角色的距离 -1
		chitu: { type: "equip", subtype: "equip4", distance: { globalFrom: -1 } },
		// 明确排除
		muniu: { type: "equip", subtype: "equip5", skills: ["muniu_skill"] },
		// 没有任何可继承效果（驽马/女装就是这种形态：只有 onEquip/onLose 或 toself:false）
		numa: { type: "equip", subtype: "equip4", ai: {} },
		nvzhuang: { type: "equip", subtype: "equip2", ai: {} },
	},
	skill: {},
	translate: {},
};
for (const info of Object.values(lib.card)) {
	for (const skill of info.skills ?? []) {
		lib.skill[skill] = {};
	}
}

const game = {
	logs: [],
	log(player, str) {
		this.logs.push(String(str));
	},
};
const ui = {};
const ai = {};
const _status = { event: {} };

const get = {
	itemtype(obj) {
		if (obj instanceof Card) return "card";
		if (obj && typeof obj === "object" && obj.name && lib.card[obj.name]) return "vcard";
		return undefined;
	},
	name(card) {
		return card?.name;
	},
	info(item) {
		const name = typeof item === "string" ? item : item?.name;
		return lib.card[name];
	},
	type(obj) {
		return get.info(obj)?.type;
	},
	type2(card) {
		const type = get.type(card);
		return type === "delay" ? "trick" : type;
	},
	subtype(obj) {
		return get.info(obj)?.subtype;
	},
	translation(x) {
		return typeof x === "string" ? x : x?.name;
	},
};

function makePlayer(opts = {}) {
	return {
		skills: [],
		storage: { ...(opts.storage ?? {}) },
		disabledSlots: new Set(opts.disabledSlots ?? []),
		equips: { ...(opts.equips ?? {}) },
		marked: null,
		getStorage(name, defaultValue = []) {
			return this.storage[name] || defaultValue;
		},
		setStorage(name, value) {
			this.storage[name] = value;
			return value;
		},
		markAuto(name, info) {
			if (!Array.isArray(this.storage[name])) this.storage[name] = [];
			const list = Array.isArray(info) ? info : [info];
			for (const item of list) {
				if (!this.storage[name].includes(item)) this.storage[name].push(item);
			}
			this.markSkill(name);
		},
		markSkill(name) {
			this.marked = name;
		},
		addSkill(skill) {
			if (Array.isArray(skill)) {
				skill.forEach(item => this.addSkill(item));
				return;
			}
			if (!lib.skill[skill] || this.skills.includes(skill)) return;
			this.skills.push(skill);
		},
		// 简化版 canEquip：装备槽被禁用 -> false；槽位已占且不允许替换 -> false
		canEquip(card, replace) {
			const subtype = get.subtype(card);
			if (!subtype || this.disabledSlots.has(subtype)) return false;
			if (!replace && this.equips[subtype]) return false;
			return true;
		},
	};
}

// ---------------------------------------------------------------- 加载技能
const source = fs
	.readFileSync(skillsPath, "utf8")
	.replace(/^import[^;]*;/m, "")
	.replace(/^export\s+const\s+skills\s*=/m, "const skills =");
const factory = new Function("lib", "game", "ui", "get", "ai", "_status", `${source}\nreturn skills;`);
const skill = factory(lib, game, ui, get, ai, _status).tbznengchi;

/** 模拟一次「player 装备了 card」 */
const equip = (player, card) => skill.content({}, { name: "equip", player, card }, player);
/** 模拟一次「装备被失去 / 装备槽被禁用后」的补回 */
const recheck = player => skill.content({}, { name: "lose", player }, player);
/** mod 里值为 0 时返回 undefined，这里统一成「不改动传入值」 */
const modTo = (...args) => skill.mod.globalTo(...args) ?? args[2];
const modFrom = (...args) => skill.mod.globalFrom(...args) ?? args[2];
const modRange = (player, num) => skill.mod.attackRange(player, num) ?? num;

// ---------------------------------------------------------------- 断言
let passed = 0;
const failures = [];
async function check(name, fn) {
	try {
		const detail = await fn();
		passed++;
		console.log(`  ok   ${name}${detail ? " —— " + detail : ""}`);
	} catch (error) {
		failures.push(name);
		console.log(`  FAIL ${name} —— ${error.message}`);
	}
}
function assertEqual(actual, expected, message) {
	if (actual !== expected) throw new Error(`${message}：期望 ${expected}，实际 ${actual}`);
}
function assert(condition, message) {
	if (!condition) throw new Error(message);
}
function assertSameSet(actual, expected, message) {
	assertEqual(JSON.stringify([...actual].sort()), JSON.stringify([...expected].sort()), message);
}

console.log("uma-tbznengchi.test");

await check("武器攻击范围按装备定义计算，且不默认 +1", async () => {
	const player = makePlayer();
	await equip(player, new Card("qinglong"));
	assertEqual(player.storage.tbznengchi_attackRange, 2, "青龙偃月刀 attackFrom:-2 的永久增量");
	assertSameSet(player.storage.tbznengchi_mark, ["qinglong"], "青龙偃月刀已记录");
	assert(player.skills.includes("qinglong_skill"), "拿到青龙偃月刀的装备技能");

	await equip(player, new Card("zhuge"));
	assertEqual(player.storage.tbznengchi_attackRange, 2, "诸葛连弩没有 distance，不产生攻击范围增量");
	assert(player.skills.includes("zhuge_skill"), "拿到诸葛连弩的装备技能");
	return "青龙 +2 / 诸葛 +0";
});

await check("同名装备反复装备不重复叠加", async () => {
	const p1 = makePlayer();
	await equip(p1, new Card("dilu"));
	await equip(p1, new Card("dilu"));
	await equip(p1, new Card("dilu"));
	assertEqual(p1.storage.tbznengchi_distance.globalTo, 1, "的卢 +1 马只拿一次");
	assertEqual(p1.storage.tbznengchi_mark.filter(n => n === "dilu").length, 1, "的卢只记录一次");

	const p2 = makePlayer();
	await equip(p2, new Card("chitu"));
	await equip(p2, new Card("chitu"));
	assertEqual(p2.storage.tbznengchi_distance.globalFrom, -1, "赤兔 -1 马只拿一次");

	const p3 = makePlayer();
	await equip(p3, new Card("qinglong"));
	await equip(p3, new Card("qinglong"));
	assertEqual(p3.storage.tbznengchi_attackRange, 2, "青龙攻击范围只加一次");
	return "武器/进攻马/防御马各只结算一次";
});

await check("不同名装备正常叠加永久增益", async () => {
	const player = makePlayer();
	await equip(player, new Card("qinglong"));
	await equip(player, new Card("cixiong"));
	assertEqual(player.storage.tbznengchi_attackRange, 3, "青龙 +2 与雌雄双股剑 +1 叠加");
	await equip(player, new Card("dilu"));
	await equip(player, new Card("chitu"));
	assertEqual(player.storage.tbznengchi_distance.globalTo, 1, "防御马距离 +1");
	assertEqual(player.storage.tbznengchi_distance.globalFrom, -1, "进攻马距离 -1");
	assertSameSet(player.storage.tbznengchi_mark, ["qinglong", "cixiong", "dilu", "chitu"], "四种装备全部记录");
	return "武器/进攻马/防御马累计生效";
});

await check("防具等没有 distance 的装备同样识别并记录", async () => {
	const player = makePlayer();
	await equip(player, new Card("bagua"));
	await equip(player, new Card("renwang"));
	assertSameSet(player.storage.tbznengchi_mark, ["bagua", "renwang"], "防具被记录");
	assert(player.skills.includes("bagua_skill") && player.skills.includes("renwang_skill"), "防具技能被永久获得");
	return "八卦阵 / 仁王盾";
});

await check("确认没有可继承效果的装备被排除", async () => {
	const player = makePlayer();
	await equip(player, new Card("numa"));
	await equip(player, new Card("nvzhuang"));
	await equip(player, new Card("muniu"));
	assertEqual(JSON.stringify(player.storage.tbznengchi_mark ?? []), "[]", "驽马/女装/木牛流马不记录");
	assertEqual(player.storage.tbznengchi_attackRange ?? 0, 0, "无效果装备不加攻击范围");
	assertEqual(player.skills.length, 0, "无效果装备不给技能");
	return "驽马 / 女装 / 木牛流马";
});

await check("AI 加分只给「新且能合法装备」的装备", async () => {
	const player = makePlayer();
	const order = skill.mod.aiOrder;
	const effectUse = skill.ai.effect.player_use;

	assertEqual(order(player, new Card("bagua"), 8), 13, "新防具拿到 +5 出牌优先级");
	assertEqual(JSON.stringify(effectUse(new Card("bagua"), player, player, 0)), "[1,4]", "新防具拿到出牌收益加成");

	await equip(player, new Card("bagua"));
	assertEqual(order(player, new Card("bagua"), 8), undefined, "已获得过的装备不再有优先级加成");
	assertEqual(effectUse(new Card("bagua"), player, player, 0), undefined, "已获得过的装备不再有收益加成");

	const blocked = makePlayer({ disabledSlots: ["equip2"] });
	assertEqual(order(blocked, new Card("bagua"), 8), undefined, "装备槽被禁用时不加分");
	assertEqual(effectUse(new Card("bagua"), blocked, blocked, 0), undefined, "装备槽被禁用时无收益加成");

	const occupied = makePlayer({ equips: { equip2: "bagua" } });
	assertEqual(order(occupied, new Card("renwang"), 8), 13, "槽位已占但可替换时仍然加分");
	assertEqual(JSON.stringify(effectUse(new Card("renwang"), occupied, occupied, 0)), "[1,4]", "可替换时仍有收益加成");

	assertEqual(order(player, new Card("sha"), 6), undefined, "非装备牌不被加分");
	assertEqual(effectUse(new Card("sha"), player, player, 0), undefined, "非装备牌无收益加成");
	assertEqual(order(player, new Card("numa"), 8), undefined, "无继承效果的装备不被加分");
	return "aiOrder +5 / ai.effect +4，均带合法性校验";
});

await check("AI 能识别虚拟牌与牌名对象，不只认 itemtype==='card'", async () => {
	const player = makePlayer();
	assertEqual(skill.mod.aiOrder(player, { name: "dilu" }, 8), 13, "vcard 形态的防御马被加分");
	assertEqual(skill.mod.aiOrder(player, { name: "chitu" }, 8), 13, "vcard 形态的进攻马被加分");
	assertEqual(skill.mod.aiOrder(player, { name: "qinglong" }, 8), 13, "vcard 形态的武器被加分");
	assertEqual(skill.mod.aiOrder(player, { name: "bagua" }, 8), 13, "vcard 形态的防具被加分");
	assertEqual(skill.mod.aiOrder(player, "bagua", 8), undefined, "字符串不误判为牌");
	assertEqual(skill.mod.aiOrder(player, null, 8), undefined, "空值不报错");
	return "card / vcard 都覆盖";
});

await check("旧存档不报错且可继续叠加", async () => {
	const legacy = makePlayer({ storage: { tbznengchi_mark: ["bagua"], tbznengchi_distance: { globalTo: 1 } } });
	assertEqual(modRange(legacy, 1), 1, "旧存档缺 attackRange 时按 0 处理");
	assertEqual(modTo(null, legacy, 2), 3, "旧存档缺 globalFrom 时仍能读 globalTo");
	assertEqual(modFrom(legacy, null, 2), 2, "旧存档缺 globalFrom 时不产生 NaN");
	await recheck(legacy);
	assert(legacy.skills.includes("bagua_skill"), "旧存档里已记录的装备技能会被补回");
	// 旧存档只记录有 info.skills 的装备，马匹从未入过 mark；
	// 因此「旧存档里已经吃过一匹马」无法反推马名，重装备同名马会再吃一次 —— 已知遗留，见报告。
	await equip(legacy, new Card("bagua"));
	assertEqual(legacy.storage.tbznengchi_mark.filter(n => n === "bagua").length, 1, "旧存档里已记录的装备不重复记录");
	assertEqual(legacy.storage.tbznengchi_distance.globalTo, 1, "旧存档里已记录的装备不重复叠加");

	const legacy2 = makePlayer({ storage: { tbznengchi_distance: { globalFrom: -1 } } });
	await equip(legacy2, new Card("dilu"));
	assertEqual(legacy2.storage.tbznengchi_distance.globalTo, 1, "旧存档基础上继续叠加 globalTo");
	assertEqual(legacy2.storage.tbznengchi_distance.globalFrom, -1, "旧存档的 globalFrom 不丢");
	return "缺字段 / 旧数组都能继续用";
});

await check("装备被替换或失去后永久技能不丢，也不会重复添加", async () => {
	const player = makePlayer();
	await equip(player, new Card("qinglong"));
	await equip(player, new Card("bagua"));
	const expect = ["qinglong_skill", "bagua_skill"];
	assertSameSet(player.skills, expect, "两个装备技能都在");

	player.skills.length = 0; // 模拟本体在装备离开 / 装备槽禁用时清掉了装备技能
	await recheck(player);
	assertSameSet(player.skills, expect, "失去装备后永久技能被补回");
	assertEqual(modRange(player, 1), 3, "失去装备后攻击范围永久增益仍然生效");

	await recheck(player);
	assertEqual(player.skills.filter(s => s === "bagua_skill").length, 1, "补回不会重复添加同一技能");
	return "失去 / 禁用 / 恢复都不丢";
});

await check("filter 与各触发时机对应", async () => {
	const player = makePlayer();
	assertEqual(skill.filter({ name: "equip", player, card: new Card("bagua") }, player), true, "装备有继承效果时触发");
	assertEqual(skill.filter({ name: "equip", player, card: new Card("numa") }, player), false, "无继承效果时不触发");
	assertEqual(skill.filter({ name: "equip", player, card: new Card("muniu") }, player), false, "木牛流马不触发");
	assertEqual(skill.filter({ name: "disableEquip" }, player), false, "没有记录时装备槽禁用不触发");
	await equip(player, new Card("bagua"));
	assertEqual(skill.filter({ name: "disableEquip" }, player), true, "有记录时装备槽禁用触发（补回技能）");
	assertEqual(skill.filter({ name: "enableEquip" }, player), true, "有记录时装备槽恢复触发");
	assertEqual(skill.filter({ name: "lose", getl: () => ({ es: [new Card("bagua")] }) }, player), true, "失去装备后触发");
	assertEqual(skill.filter({ name: "lose", getl: () => ({ es: [] }) }, player), false, "没失去装备时不触发");
	return "equip / disableEquip / enableEquip / lose";
});

await check("mod.globalTo / globalFrom / attackRange 读数正确（正负号不反）", async () => {
	const player = makePlayer();
	assertEqual(modTo(null, player, 1), 1, "没有马时距离不变");
	assertEqual(modRange(player, 1), 1, "没有武器时攻击范围不变");
	await equip(player, new Card("dilu"));
	await equip(player, new Card("chitu"));
	await equip(player, new Card("qinglong"));
	assertEqual(modTo(null, player, 1), 2, "防御马：其他角色计算距离 +1");
	assertEqual(modFrom(player, null, 3), 2, "进攻马：自己计算距离 -1");
	assertEqual(modRange(player, 1), 3, "武器：攻击范围 +2");
	return "+1马 / -1马 / 攻击范围";
});

console.log(`\numa-tbznengchi.test: passed=${passed} failed=${failures.length}`);
if (failures.length) {
	console.log(`失败用例：${failures.join("、")}`);
	process.exit(1);
}
