// 肉鸽技能兼容性 / 安全校验层。
//
// 为什么要有这一层：肉鸽把「别人的技能」挂到玩家身上，而 lib.filter.skillDisabled 只回答
// 「这条技能有没有翻译、是不是内部技」（unique/temp/sub/fixed/vanish），**不管**它挂在别人身上
// 会不会炸。以下六类技能挂上去必出问题，必须拦在商店外面：
//
//   1. 依赖身份 / 主公        —— zhuSkill、写 identity：肉鸽没有身份与主公，恒不发动或乱写身份；
//   2. 角色专属状态           —— 变身/觉醒（charlotte）、硬编码「我是某某角色」：条件永远不成立，
//                                或者反过来把别人当成那个专属角色来操作；
//   3. 特殊 mode              —— 读 get.mode() / _status.mode 分流：肉鸽是个自己的 mode，会走到错分支；
//   4. 全局 UI / 全局变量     —— 覆盖 ui.create.*、写 _status.* / lib.*：技能一摘就永久残留；
//   5. 副作用明显             —— 重载页面、加人、弹全局对话框、写 localStorage：肉鸽一局里无法回收；
//   6. 说不清的               —— 判不出来的一律不上架（fail-closed）。
//
// 本文件**纯函数、不 import noname**：技能定义由调用方传进来，方便在 Node 里直接测。
// 判定分三档，优先级从高到低：
//   明确禁止（ROGUE_SKILL_DENY） > 明确允许（ROGUE_SKILL_ALLOW） > 规则扫描 > 通过
// 新增/下架技能只改上面两张表；规则扫描只用来兜住「还没被人工过目」的技能。

/** 明确禁止进入肉鸽池：id → 原因（写给人看的，会进日志与自检输出） */
export const ROGUE_SKILL_DENY = new Map([
	// 身份 / 主公
	["mcpsongwei", "主公技（zhuSkill）：肉鸽没有身份与主公，恒不发动"],
	// 角色专属状态：整条技能链都硬绑「死龙 / 遐蝶」，离开了那两个人全是死代码
	["xdanchao", "角色专属：硬绑遐蝶/死龙，还会往场上加人、读 get.mode()"],
	["xdyuejian", "角色专属：硬绑遐蝶/死龙"],
	["slyanxi", "角色专属：硬绑死龙"],
	["slyinbi", "角色专属：硬绑死龙"],
	["slhuiyi", "角色专属：硬绑死龙"],
	["slcontrol", "角色专属：死龙换人控制技（charlotte），已在作者清单里下架，这里再兜一次"],
	// 全局 UI / 全局变量
	["zggylianshuai", "自建全局选择流程：写 _status.imchoosing 并接管 game.resume，摘掉技能后收不回来"],
]);

/**
 * 明确允许进入肉鸽池：命中规则但已确认安全，规则不再拦它。
 * 加进来前请写清楚为什么安全——这里每一项都要能在 code review 里答得上来。
 */
export const ROGUE_SKILL_ALLOW = new Map([
	// init 里确实覆盖了 ui.create.buttonPresets（规则「全局 UI 覆盖」会命中），
	// 但 onremove 会把它整个还原成覆盖前那一份，且重复获得不会二次包裹，故放行。
	["yaoyaoyi", "buttonPresets 覆盖已在 onremove 完整还原，且重复获得不会二次包裹"],
]);

/**
 * 规则扫描：只在「函数源码」上做正则匹配，不执行任何技能代码。
 * 每条规则都要求零误报——宁可漏，不可错杀（漏了还有人工清单兜底）。
 */
const SOURCE_RULES = [
	// 3. 特殊 mode
	["特殊 mode", /\bget\.mode\s*\(|\blib\.mode\s*\[|\b_status\.mode\b/],
	// 4. 全局 UI 覆盖：给 ui.create.* 整体赋值，或碰 buttonPresets
	["全局 UI 覆盖", /\bui\.create\.[A-Za-z_$][\w$]*\s*=(?!=)|\bui\.create\.buttonPresets\b|\bui\.clear\s*\(/],
	// 4. 全局变量写入：lib.* / _status.* 的**赋值**（== 不算，故用 =(?!=)）
	["全局变量写入", /\blib\.skill\s*\[[^\]]*\]\s*=(?!=)|\blib\.translate\s*\[[^\]]*\]\s*=(?!=)|\blib\.character\s*\[[^\]]*\]\s*=(?!=)|\blib\.card\s*\[[^\]]*\]\s*=(?!=)|\blib\.config\.[A-Za-z_$][\w$]*\s*=(?!=)|\b_status\.[A-Za-z_$][\w$]*\s*=(?!=)/],
	// 1. 依赖身份
	["依赖身份", /\.identity\s*=(?!=)/],
	// 2. 角色专属状态：把 player/target/source 的名字与某个中文角色名直接比
	["角色专属状态", /\b(?:player|target|source|p)\.name\s*(?:!==|===)\s*["'`][\u4e00-\u9fa5]/],
	// 5. 副作用明显
	["副作用明显", /\bgame\.reload\s*\(|\blocation\.reload\s*\(|\bwindow\.location\b|\blocalStorage\b|\balert\s*\(|\bgame\.save\s*\(|\bgame\.addPlayer\s*\(|\bgame\.addPlayerOL\s*\(/],
];

/** 结构性字段判定：不扫源码，看技能定义自己声明了什么 */
const FIELD_RULES = [
	["依赖身份", def => def.zhuSkill === true],
	["角色专属状态", def => def.charlotte === true],
];

const MAX_DEPTH = 6;

/** 递归收集技能定义里所有函数的源码；超过层数就停，别在循环引用里绕死 */
function collectSource(value, out, depth = 0, seen = new Set()) {
	if (depth > MAX_DEPTH || value == null) {
		return;
	}
	if (typeof value === "function") {
		out.push(String(value));
		return;
	}
	if (typeof value !== "object") {
		return;
	}
	if (seen.has(value)) {
		return;
	}
	seen.add(value);
	for (const key of Object.keys(value)) {
		collectSource(value[key], out, depth + 1, seen);
	}
}

/**
 * 兼容性判定。
 * @param {string} skillId 技能 id
 * @param {object} [def] 技能定义（lib.skill[skillId]）；不传视为「无法确认」→ 不允许
 * @returns {{ ok: boolean, reason: string, by: "deny"|"allow"|"rule"|"field"|"pass"|"missing" }}
 */
export function checkRogueSkillCompat(skillId, def = null) {
	if (typeof skillId !== "string" || !skillId) {
		return { ok: false, reason: "技能 id 非法", by: "missing" };
	}
	const denied = ROGUE_SKILL_DENY.get(skillId);
	if (denied) {
		return { ok: false, reason: denied, by: "deny" };
	}
	if (!def || typeof def !== "object") {
		// 没有定义 = 无法确认，按「宁可不上架」处理
		return { ok: false, reason: "技能定义缺失，无法确认安全性", by: "missing" };
	}
	if (ROGUE_SKILL_ALLOW.has(skillId)) {
		return { ok: true, reason: ROGUE_SKILL_ALLOW.get(skillId), by: "allow" };
	}
	for (const [reason, hit] of FIELD_RULES) {
		if (hit(def)) {
			return { ok: false, reason, by: "field" };
		}
	}
	const sources = [];
	collectSource(def, sources);
	const text = sources.join("\n");
	for (const [reason, pattern] of SOURCE_RULES) {
		const matched = text.match(pattern);
		if (matched) {
			return { ok: false, reason: `${reason}（${matched[0]}）`, by: "rule" };
		}
	}
	return { ok: true, reason: "未命中任何风险规则", by: "pass" };
}

/** 命中规则扫描的技能 id 清单：给自检脚本用（人工过目后再决定进 DENY 还是 ALLOW） */
export function listRiskySkillIds(defs) {
	const risky = [];
	for (const [id, def] of Object.entries(defs ?? {})) {
		const result = checkRogueSkillCompat(id, def);
		if (!result.ok && (result.by === "rule" || result.by === "field")) {
			risky.push({ id, reason: result.reason });
		}
	}
	return risky;
}
