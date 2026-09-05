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

// ---- 恢复旧树（完整基线提交树，兼容任意基线结构）----
// Windows bsdtar 解 tar 流会损坏 UTF-8 文件名，故按文件逐个 git show 恢复；
// 素材二进制文件不参与 import 对比，跳过以加速
console.log("parity base commit: " + baseCommit);
const tracked = execFileSync(git, ["-C", repo, "ls-tree", "-r", "--name-only", "-z", baseCommit], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).split("\0").filter(Boolean);
for (const f of tracked) {
	if (/\.(jpg|jpeg|png|gif|webp|mp3|ogg|wav|zip|psd)$/i.test(f)) continue;
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
// 已知路径修复归一：素材路径归一到文件名（旧直连/旧分包/新平铺三种布局等效）
const FR = "(?:ultraman|genshin|honkai-star-rail|uma-musume|misc|common|kof)";
function normalizeStr(s) {
	return s
		.replaceAll("extension_奥特之星_easterEgg_enabled", "extension_无名扩展_easterEgg_enabled")
		.replace(new RegExp(`奥特之星/assets/(?:${FR}/)?(?:image|card|audio(?:/die|/skill)?|kingdom|easterEggs|easteregg|camp|tierlist)?/?`, "g"), "奥特之星/") // 素材迁移：新布局路径归一
		.replace(new RegExp(`奥特之星/(?:image|card|audio(?:/die|/skill)?|kingdom|easterEggs)/`, "g"), "奥特之星/") // 旧直连路径归一
		.replace("奥特之星/kingdom/", "奥特之星/")
		.replace("奥特之星/easterEggs/", "奥特之星/")
		.replace(new RegExp(`(?:无名扩展|奥特之星)/`, "g"), "<EXT>/") // 扩展改名遗留修复归一
		.replace(/\s*style="color:\s*#[0-9A-Fa-f]+;?"/g, ""); // 功能按钮自定义颜色为 UI 调整，归一
}
function normalizeFnText(t) {
	return normalizeStr(t)
		.replace(new RegExp(`(["'\`])assets/${FR}/`, "g"), "$1") // playAudio 多参形式
		.replace(new RegExp(`["'](?:${FR}/)?(?:audio(?:/die|/skill)?|image|card|kingdom)?/?([^"']+\\.(?:jpg|png|mp3))["']`, "g"), '"$1"') // 相对素材路径归一到文件名
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
// copyRepoUrl（复制仓库地址）为新增功能项，属预期差异；功能按钮颜色经 normalizeStr 归一
deepEqual(packOld.config, packNew.config, "pack.config", { ignoreKey: /^copyRepoUrl$/ });

// ---- 执行 content()，校验单包 + characterSort 结构 ----
const modOld = await import(pathToFileURL(path.join(tmp, "old-tree", "noname.js")).href);
const modNew = await import(pathToFileURL(path.join(tmp, "new-tree", "noname.js")).href);
if (typeof packOld.content === "function" && typeof packNew.content === "function") {
	packOld.content();
	packNew.content();
	// 关键不变量：新结构 content() 不得再注册任何独立分包（分包身份改由 characterSort 表达）
	const newCalls = modNew.lib.__calls.addCharacterPack;
	if (newCalls.length !== 0) {
		errors.push(`content() 仍注册了 ${newCalls.length} 个分包（应并入总包 characterSort）`);
	}
}

// ---- 旧分包角色集合（旧树 content() 经 addCharacterPack 注册的角色）----
const managedCalls = modOld.lib.__calls.addCharacterPack;
const managedNames = new Set(managedCalls.flatMap(c => Object.keys(c.character ?? {})));

// ---- 角色完整性：旧总包 ∪ 旧分包 = 新总包，且旧总包键序为新键序的子序列 ----
const charsOld = packOld.package.character.character;
const keysOld = Object.keys(charsOld);
const charsNew = packNew.package.character.character;
const keysNew = Object.keys(charsNew);
const allOldNames = new Set([...keysOld, ...managedNames]);
for (const k of allOldNames) {
	if (!(k in charsNew)) errors.push(`角色丢失: ${k}（未进入新总包）`);
}
for (const k of keysNew) {
	if (!allOldNames.has(k)) errors.push(`新总包出现未知角色: ${k}`);
}
let matched = 0;
for (const k of keysNew) {
	if (k === keysOld[matched]) matched++;
}
if (matched !== keysOld.length) {
	errors.push(`旧总包键序未保持（子序列匹配 ${matched}/${keysOld.length}）`);
}
note.push(`package.character.character: 旧总包 ${keysOld.length} + 旧分包 ${managedNames.size} = 新总包 ${keysNew.length}`);

// ---- 角色内容一致（旧总包角色 + 旧分包角色）----
for (const k of keysOld) deepEqual(charsOld[k], charsNew[k], `character.${k}`);
for (const call of managedCalls) {
	for (const [k, v] of Object.entries(call.character ?? {})) {
		if (!(k in charsNew)) continue; // 丢失已在上方报错
		deepEqual(v, charsNew[k], `character.${k}(旧分包${call.name})`);
	}
}

// ---- 旧包其余元数据必须原样保留于新包 ----
const charMetaOld = packOld.package.character, charMetaNew = packNew.package.character;
for (const key of ["characterTitle", "characterIntro"]) {
	deepEqual(charMetaOld[key] ?? {}, charMetaNew[key] ?? {}, `character.${key}`);
}
for (const [k, v] of Object.entries(charMetaOld.translate ?? {})) {
	deepEqual(v, charMetaNew.translate?.[k], `character.translate.${k}`);
}
deepEqual(packOld.package.skill, packNew.package.skill, "pack.skill");

// ---- characterSort 校验（新结构核心不变量）----
const csOuter = charMetaNew.characterSort;
if (!csOuter || typeof csOuter !== "object" || Array.isArray(csOuter)) {
	errors.push("package.character.characterSort 缺失或结构错误");
} else {
	const outerKeys = Object.keys(csOuter);
	if (outerKeys.length !== 1 || outerKeys[0] !== packNew.name) {
		errors.push(`characterSort 外层键应为包名 ${packNew.name}，实际 ${JSON.stringify(outerKeys)}`);
	}
	const cs = csOuter[packNew.name] ?? {};
	const sortTranslate = charMetaNew.translate ?? {};
	const seen = new Map();
	for (const [sortId, list] of Object.entries(cs)) {
		if (!Array.isArray(list)) {
			errors.push(`characterSort.${sortId} 不是数组`);
			continue;
		}
		if (!sortTranslate[sortId]) errors.push(`分类 ${sortId} 缺少 translate 显示名`);
		for (const k of list) {
			if (!(k in charsNew)) errors.push(`分类 ${sortId} 引用不存在的角色: ${k}`);
			if (seen.has(k)) errors.push(`角色 ${k} 重复出现在分类 ${seen.get(k)} 与 ${sortId}`);
			else seen.set(k, sortId);
		}
	}
	for (const k of keysNew) {
		if (!seen.has(k)) errors.push(`角色 ${k} 未归入任何分类`);
	}
	note.push(`characterSort: ${Object.keys(cs).length} 个分类覆盖 ${seen.size}/${keysNew.length} 角色`);
}

// 兼容不同基线：旧版 precontent 可能包装 lib.sort.group，mock 无 lib.sort 时需兜底
for (const mod of [modOld, modNew]) mod.lib.sort ??= { group: () => 0 };
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
