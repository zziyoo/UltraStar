// 校验 3：新旧注册结果一致性（verify-parity）
// 用法：node verify-parity.mjs <仓库路径> <git.exe路径>
// 1) 从 git HEAD 恢复旧树到 tmp/old-tree
// 2) 复制当前仓库到 tmp/new-tree
// 3) 两侧各配 mock noname.js，import extension.js 构建包并执行 precontent()
// 4) 深度对比 pack 结构 + 注册结果（lib.*）
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const repo = path.resolve(process.argv[2] ?? ".");
const git = process.argv[3] ?? "git";
const baseCommit = process.argv[4] ?? "HEAD"; // 注册对比基准（重构前为 639787b）
const tmp = path.join(os.tmpdir(), "ultrastar-parity");
fs.rmSync(tmp, { recursive: true, force: true });

const oldRoot = path.join(tmp, "old-tree", "extension", "奥特之星");
const newRoot = path.join(tmp, "new-tree", "extension", "奥特之星");
fs.mkdirSync(oldRoot, { recursive: true });
fs.mkdirSync(newRoot, { recursive: true });

// ---- 恢复旧树 ----
console.log("parity base commit: " + baseCommit);
const headFiles = [
	"extension.js", "assetsManifest.js", "bgmList.js",
	"dynamicTranslate.js", "easterEggs.js", "intro.js",
	"equipment/equipmentCards.js", "equipment/equipmentSkills.js", "equipment/xnnequipment.js",
];
for (const f of headFiles) {
	const dest = path.join(oldRoot, f);
	fs.mkdirSync(path.dirname(dest), { recursive: true });
	const buf = execFileSync(git, ["-C", repo, "show", `${baseCommit}:${f}`], { maxBuffer: 64 * 1024 * 1024 });
	fs.writeFileSync(dest, buf);
}

// ---- 复制新树 ----
fs.cpSync(repo, newRoot, { recursive: true, filter: src => !src.includes(`${path.sep}.git${path.sep}`) && path.basename(src) !== ".git" });

// ---- mock noname.js ----
const mockSrc = `const calls = { addGroup: [], addCharacterPack: [] };
const anyFn = function () {};
export const lib = {
	character: {}, skill: {}, card: {}, translate: {},
	characterSubstitute: {}, characterReplace: {},
	namePrefix: null,
	element: {}, config: {}, rank: {},
	filter: new Proxy({}, { get: (t, k) => { if (!(k in t)) t[k] = anyFn; return t[k]; } }),
	__calls: calls,
};
export const game = {
	addGroup: (...args) => { calls.addGroup.push(args); },
	addCharacterPack: (pack, name) => { calls.addCharacterPack.push({ name, character: pack.character }); },
	saveExtensionConfig: () => {},
	getExtensionConfig: () => null,
	playAudio: () => {},
	log: () => {},
};
export const ui = { window: null, create: {} };
export const get = { poptip: s => s };
export const ai = {};
export const _status = {};
`;
fs.writeFileSync(path.join(tmp, "old-tree", "noname.js"), mockSrc);
fs.writeFileSync(path.join(tmp, "new-tree", "noname.js"), mockSrc);

const errors = [];
const note = [];

// ---- 深度对比工具 ----
// 已知路径修复归一：assets/<作品>/ → 旧直连路径（素材迁移的必要同步）
const FR = "(?:ultraman|genshin|honkai-star-rail|uma-musume|misc|common|kof)";
function normalizeStr(s) {
	return s
		.replaceAll("extension_奥特之星_easterEgg_enabled", "extension_无名扩展_easterEgg_enabled")
		.replace(new RegExp(`奥特之星/assets/${FR}/`, "g"), "奥特之星/") // 素材迁移：作品前缀归一
		.replace(new RegExp(`(?:无名扩展|奥特之星)/`, "g"), "<EXT>/"); // 扩展改名遗留修复归一
}
function normalizeFnText(t) {
	return normalizeStr(t)
		.replace(new RegExp(`(["'\`])assets/${FR}/`, "g"), "$1") // playAudio 多参形式
		.replaceAll("<EXT>/audio/skill/", "<EXT>/") // 旧 bgm 拼接形式归一
		.replaceAll("<EXT>/assets/", "<EXT>/") // 新 bgm 拼接形式归一
		.replaceAll('"../../CHANGELOG.md"', '"../CHANGELOG.md"') // changelog fetch 归一
		.split("\n").map(l => l.replace(/^\s+/, "")).filter(l => l.length > 0).join("\n"); // 缩进/空行无关
}

function deepEqual(a, b, p, opts = {}) {
	if (typeof a === "string" && typeof b === "string") {
		if (normalizeStr(a) !== normalizeStr(b)) {
			errors.push(`VALUE DIFF at ${p}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`);
		}
		return;
	}
	if (typeof a === "function" || typeof b === "function") {
		if (typeof a !== "function" || typeof b !== "function") {
			errors.push(`TYPE MISMATCH at ${p}: function vs ${typeof b === "function" ? "function" : typeof b}`);
			return;
		}
		if (opts.relaxedFn) return; // 已知块替换差异的函数只要求存在
		const na = normalizeFnText(a.toString().trim());
		const nb = normalizeFnText(b.toString().trim());
		if (na !== nb) {
			errors.push(`FN DIFF at ${p}\n  OLD: ${na.slice(0, 300)}\n  NEW: ${nb.slice(0, 300)}`);
		}
		return;
	}
	if (a === null || b === null || typeof a !== "object" || typeof b !== "object") {
		if (a !== b) errors.push(`VALUE DIFF at ${p}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`);
		return;
	}
	if (Array.isArray(a) !== Array.isArray(b)) {
		errors.push(`ARRAY/OBJ MISMATCH at ${p}`);
		return;
	}
	if (Array.isArray(a)) {
		if (a.length !== b.length) {
			errors.push(`ARRAY LENGTH at ${p}: ${a.length} !== ${b.length}`);
			return;
		}
		for (let i = 0; i < a.length; i++) deepEqual(a[i], b[i], `${p}[${i}]`, opts);
		return;
	}
	const ka = Object.keys(a), kb = Object.keys(b);
	const setA = new Set(ka), setB = new Set(kb);
	const ign = k => opts.ignoreKey?.test(k);
	for (const k of ka) if (!setB.has(k) && !ign(k)) errors.push(`KEY ONLY-IN-OLD at ${p}.${k}`);
	for (const k of kb) if (!setA.has(k) && !ign(k)) errors.push(`KEY ONLY-IN-NEW at ${p}.${k}`);
	for (const k of ka) if (setB.has(k)) deepEqual(a[k], b[k], `${p}.${k}`, opts);
}

// ---- import 两侧 ----
const extOld = await import(pathToFileURL(path.join(oldRoot, "extension.js")).href);
const extNew = await import(pathToFileURL(path.join(newRoot, "extension.js")).href);
const packOld = extOld.default();
const packNew = extNew.default();

// pack 顶层对比（arenaReady/precontent 宽松：块替换已知差异）
deepEqual(packOld.name, packNew.name, "pack.name");
deepEqual(typeof packOld.content, typeof packNew.content, "pack.content-type");
if (typeof packOld.arenaReady !== "function" || typeof packNew.arenaReady !== "function")
	errors.push("arenaReady not function on both sides");
if (typeof packOld.precontent !== "function" || typeof packNew.precontent !== "function")
	errors.push("precontent not function on both sides");
deepEqual(packOld.help, packNew.help, "pack.help");
deepEqual(packOld.config, packNew.config, "pack.config");
// package 必须全等，但 character.character 键序另做严格检查
deepEqual(packOld.package, packNew.package, "pack.package");
const keysOld = Object.keys(packOld.package.character.character);
const keysNew = Object.keys(packNew.package.character.character);
if (keysOld.length !== keysNew.length) errors.push(`CHAR COUNT: ${keysOld.length} !== ${keysNew.length}`);
for (let i = 0; i < Math.min(keysOld.length, keysNew.length); i++)
	if (keysOld[i] !== keysNew[i]) errors.push(`CHAR ORDER at #${i}: ${keysOld[i]} !== ${keysNew[i]}`);
note.push(`package.character.character keys: ${keysOld.length}（顺序严格对比${errors.length ? "存在差异" : "一致"}）`);

// ---- 执行 content()/precontent()，对比注册结果 ----
const modOld = await import(pathToFileURL(path.join(tmp, "old-tree", "noname.js")).href);
const modNew = await import(pathToFileURL(path.join(tmp, "new-tree", "noname.js")).href);
if (typeof packOld.content === "function" && typeof packNew.content === "function") {
	packOld.content();
	packNew.content();
	// 分包注册是分包框架引入的新能力（旧版无此机制），不做新旧相等对比；
	// 关键不变量：分包角色不得同时出现在总包 package.character.character 中（避免重复注册）
	const newCalls = modNew.lib.__calls.addCharacterPack;
	console.log("NOTE: content() addCharacterPack calls: old=" + modOld.lib.__calls.addCharacterPack.length + " new=" + newCalls.length);
	const packChars = new Set(Object.keys(packNew.package.character.character));
	for (const call of newCalls) {
		for (const name of Object.keys(call.character ?? {})) {
			if (packChars.has(name)) errors.push(`分包 ${call.name} 的角色 ${name} 同时存在于总包（重复注册）`);
		}
		console.log(`NOTE: 分包 ${call.name}（${Object.keys(call.character ?? {}).length} 角色）`);
	}
}
packOld.precontent();
packNew.precontent();

function mapToObj(m) {
	if (!(m instanceof Map)) return m;
	const o = {};
	for (const [k, v] of m.entries()) o[k] = v;
	return o;
}
for (const key of ["card", "skill", "translate", "character", "characterSubstitute", "characterReplace"]) {
	// <分包ID>_character_config 为分包框架新增的包显示名键，属预期差异
	deepEqual(modOld.lib[key], modNew.lib[key], `lib.${key}`, { ignoreKey: /_character_config$/ });
}
deepEqual(mapToObj(modOld.lib.namePrefix), mapToObj(modNew.lib.namePrefix), "lib.namePrefix");
deepEqual(modOld.lib.__calls.addGroup, modNew.lib.__calls.addGroup, "game.addGroup calls");

// ---- 输出 ----
for (const n of note) console.log("NOTE: " + n);
if (errors.length) {
	console.log(`\nverify-parity: FAILED, ${errors.length} diffs`);
	for (const e of errors.slice(0, 80)) console.log("  " + e.replaceAll("\n", "\n  "));
	process.exit(1);
} else {
	console.log("verify-parity: ALL EQUAL ✓");
}
