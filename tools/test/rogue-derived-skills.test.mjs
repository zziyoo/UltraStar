// node tools/test/rogue-derived-skills.test.mjs
// 执行真实 skillPool.js；隔离宿主、分包加载和兼容性扫描，专项验证派生关系筛选。
// 四个回归 ID 及 derivation 声明来自迪迦 djsj 与芙卡洛斯 ffshenpan；不模拟战斗效果。
import assert from "node:assert/strict";
import { registerHooks } from "node:module";

const hostUrl = "rogue-derived-test:host";
const mockSources = new Map([
	[hostUrl, `
		export const lib = { skill: {}, character: {}, config: {}, filter: {} };
		export const pool = [];
		export const calls = { compat: 0 };
	`],
	["rogue-derived-test:battle", `
		import { lib } from "${hostUrl}";
		export const isPlayerUsable = id => !!lib.character?.[id] && !lib.character[id].unusable;
	`],
	["rogue-derived-test:compat", `
		import { calls } from "${hostUrl}";
		export function checkRogueSkillCompat(id, def) {
			calls.compat++;
			return { ok: !def.incompatible };
		}
	`],
]);
registerHooks({
	resolve(specifier, context, next) {
		if (mockSources.has(specifier)) return { url: specifier, shortCircuit: true };
		if (context.parentURL?.endsWith("/src/rogue/skillPool.js")) {
			const url = specifier.endsWith("noname.js") || specifier === "./data/skills.js"
				? hostUrl
				: specifier === "./battle.js" ? "rogue-derived-test:battle"
					: specifier === "./skillCompat.js" ? "rogue-derived-test:compat" : null;
			if (url) return { url, shortCircuit: true };
		}
		return next(specifier, context);
	},
	load(url, context, next) {
		if (mockSources.has(url)) return { format: "module", source: mockSources.get(url), shortCircuit: true };
		return next(url, context);
	},
});
const { lib, pool, calls } = await import(hostUrl);
const { getShopPool, isRogueSkillAllowed, isSkillBlockedByBan } = await import("../../src/rogue/skillPool.js");
const children = ["djfuhe", "djqiangli", "djkongzhong", "ffsongshi", "ffguqi"];
const ids = () => getShopPool().map(item => item.id);
// 与 runtime.skillGate 相同的组合；单条入口供旧候选读档与购买复查调用。
const allowed = id => isRogueSkillAllowed(id) && !isSkillBlockedByBan(id);
function reset() {
	lib.skill = {
		djsj: { derivation: ["djfuhe", "djqiangli", "djkongzhong"] },
		ffshenpan: { derivation: ["ffguqi", "ffsongshi"] },
		...Object.fromEntries(children.map(id => [id, { forced: true }])),
		ordinary: { forced: true },
	};
	lib.character = { tiga: { skills: ["djsj"] }, furina: ["female", "shen", 3, ["ffshenpan"]] };
	lib.config = { all: { mode: ["identity"] } };
	lib.filter = { skillDisabled: id => !lib.skill[id] || !!lib.skill[id].charlotte };
	pool.splice(0, pool.length, ...Object.keys(lib.skill).map(id => ({ id, price: 100 })));
	calls.compat = 0;
}
let passed = 0;
let failed = 0;
function check(name, fn) {
	reset();
	try {
		fn();
		passed++;
		console.log(`ok - ${name}`);
	} catch (error) {
		failed++;
		console.error(`FAIL - ${name}\n${error.stack}`);
	}
}

check("复合/强力/空中/颂诗/孤泣不作为独立商品", () => {
	for (const id of children) assert(!ids().includes(id), `${id} leaked into shop`);
});
check("单条闸门同样拒绝旧存档候选中的派生技能", () => {
	for (const id of children) assert.equal(allowed(id), false, id);
});
check("声明 derivation 的主技能保留，不误删水晶与审判", () => {
	for (const id of ["djsj", "ffshenpan"]) {
		assert(ids().includes(id), id);
		assert.equal(allowed(id), true, id);
	}
});
check("非派生的作者独立上架项仍保留", () => assert(ids().includes("ordinary")));
check("本体武将技能仍能从角色表合并，不依赖分包清单", () => {
	lib.skill.native = {};
	lib.character.native = { skills: ["native"] };
	assert(ids().includes("native"));
});
for (const format of ["object", "array"]) {
	check(`兼具其他武将初始技能身份时保留（${format}）`, () => {
		lib.character.other = format === "object"
			? { skills: ["djfuhe"] } : ["male", "wei", 4, ["djfuhe"]];
		assert(ids().includes("djfuhe"));
		assert.equal(allowed("djfuhe"), true);
		assert(!ids().includes("djqiangli"));
	});
}
check("原有禁将硬否决仍优先于初始技能豁免", () => {
	lib.character.other = { skills: ["djfuhe"] };
	lib.config.identity_banned = ["tiga"];
	assert(!ids().includes("djfuhe"));
	assert.equal(allowed("djfuhe"), false);
	assert(!ids().includes("djsj"));
	assert(ids().includes("ffshenpan"));
});
check("字符串 derivation 与任意技能 ID 均生效，不靠名称黑名单", () => {
	lib.skill.external = { derivation: "ordinary" };
	assert(!ids().includes("ordinary"));
	assert.equal(allowed("ordinary"), false);
});
check("主技能未上架或不兼容时，仍识别其派生关系", () => {
	pool.splice(pool.findIndex(item => item.id === "djsj"), 1);
	lib.skill.djsj.incompatible = true;
	delete lib.character.tiga;
	assert(!ids().includes("djfuhe"));
});
check("尚未展开注册的 subSkill 内部 derivation 也被识别", () => {
	lib.skill.nested = { subSkill: { awaken: { subSkill: { finish: { derivation: "ordinary" } } } } };
	assert(!ids().includes("ordinary"));
});
check("多级派生链只保留原始主技能", () => {
	lib.skill.djfuhe.derivation = "ordinary";
	assert(!ids().includes("ordinary"));
	assert(!ids().includes("djfuhe"));
	assert(ids().includes("djsj"));
});
check("共享/循环 subSkill 引用不会无限递归", () => {
	const shared = { derivation: "ordinary" };
	shared.subSkill = { self: shared };
	lib.skill.loop = { subSkill: { a: shared, b: shared } };
	assert.equal(allowed("ordinary"), false);
});
check("非法 derivation 项被忽略，不影响合法项与其他商品", () => {
	lib.skill.malformed = { derivation: [null, undefined, "", 7, {}, "ordinary"], subSkill: null };
	lib.skill.empty = null;
	assert(!ids().includes("ordinary"));
	assert(ids().includes("djsj"));
});
check("同一对象内原地新增/撤销 derivation 时不会使用过期缓存", () => {
	assert.equal(allowed("ordinary"), true);
	lib.skill.djsj.derivation.push("ordinary");
	assert.equal(allowed("ordinary"), false);
	lib.skill.djsj.derivation.pop();
	assert.equal(allowed("ordinary"), true);
});
check("角色初始技能表原地变化时同步更新豁免", () => {
	assert.equal(allowed("djfuhe"), false);
	lib.character.tiga.skills.push("djfuhe");
	assert.equal(allowed("djfuhe"), true);
	lib.character.tiga.skills.pop();
	assert.equal(allowed("djfuhe"), false);
});
check("不改写技能定义、形态获取关系或角色技能表", () => {
	const before = JSON.stringify({ skill: lib.skill, character: lib.character });
	Object.freeze(lib.skill.djsj.derivation);
	Object.freeze(lib.skill.djsj);
	for (const id of children) Object.freeze(lib.skill[id]);
	ids();
	for (const id of children) allowed(id);
	assert.equal(JSON.stringify({ skill: lib.skill, character: lib.character }), before);
});
check("兼容性与本体内部技能过滤仍然有效", () => {
	lib.skill.ordinary.incompatible = true;
	assert.equal(allowed("ordinary"), false);
	lib.skill.ordinary = { charlotte: true };
	assert.equal(allowed("ordinary"), false);
	lib.skill.ordinary = {};
	assert.equal(allowed("ordinary"), true);
});
check("缺少/异常本体过滤器仍 fail-closed，恢复后重新开放", () => {
	const saved = lib.filter.skillDisabled;
	const log = console.error;
	console.error = () => {};
	try {
		delete lib.filter.skillDisabled;
		assert.equal(allowed("ordinary"), false);
		lib.filter.skillDisabled = () => { throw new Error("probe"); };
		assert.equal(allowed("ordinary"), false);
		lib.filter.skillDisabled = saved;
		assert.equal(allowed("ordinary"), true);
	} finally { console.error = log; }
});
check("整池构建只扫描一次派生声明，不按每个候选重复全表扫描", () => {
	let reads = 0;
	Object.defineProperty(lib.skill.djsj, "derivation", {
		get() { reads++; return ["djfuhe", "djqiangli", "djkongzhong"]; },
	});
	const result = ids();
	assert(!result.includes("djfuhe"));
	assert.equal(reads, 1);
});
check("无效/缺失技能一律拒绝，空角色表不使纯派生变成商品", () => {
	for (const id of [null, undefined, "", 12, "missing"]) assert.equal(isRogueSkillAllowed(id), false);
	lib.character = {};
	assert(!ids().includes("djfuhe"));
});
check("输出不重复，价格占位与兼容性缓存保持不变", () => {
	pool.push({ id: "djsj", price: 42 });
	const result = getShopPool();
	assert.equal(new Set(result.map(item => item.id)).size, result.length);
	assert(result.every(item => item.price === 100));
	const count = calls.compat;
	getShopPool();
	assert.equal(calls.compat, count);
});
console.log(`\nrogue-derived-skills: passed=${passed} failed=${failed}`);
if (failed) process.exitCode = 1;
