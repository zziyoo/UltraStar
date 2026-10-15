// 性能计时设施：统一开关见 config.js 的 PERF_LOG（默认关闭）。
//
// 用法（都在同步或异步流程里逐段调用）：
//   perfStart("Boss 战开局");         // 打开一次计时；开关关着时是空操作
//   perfMark("①Boss 判定");           // 记录「自上一次 mark 起」的耗时
//   perfCount("候选人数", 2506);      // 记录一个计数，随摘要一起打印
//   perfEnd();                        // 打印摘要并结束（同时写 window.roguePerfLast）
//
// 设计约束：
//   · 关闭时零负担——state 恒为 null，每个入口只多一次 `if (!state) return;`；
//   · 一次只允许一条活跃计时（同一时刻只可能有一场战斗开局），perfStart 会覆盖旧的；
//   · 摘要只走 console.log 与 window 上的副本，绝不写存档、绝不进游戏 UI。
import { PERF_LOG } from "./config.js";

let state = null;

/** 开关本身：常量 或 运行时全局变量 或 localStorage（懒查询，只在 perfStart 时判一次） */
export function perfLogEnabled() {
	if (PERF_LOG === true) {
		return true;
	}
	try {
		if (globalThis.roguePerfLog === true) {
			return true;
		}
	} catch { /* 无 globalThis 的环境按关闭处理 */ }
	try {
		if (globalThis.localStorage?.getItem("roguePerfLog") === "1") {
			return true;
		}
	} catch { /* localStorage 不可用按关闭处理 */ }
	return false;
}

/** 开始一次计时。返回值只是给测试看的对象标识；调用点不需要保存它 */
export function perfStart(scope) {
	if (!perfLogEnabled()) {
		state = null;
		return null;
	}
	const now = performance.now();
	state = { scope, start: now, last: now, rows: [], counts: {} };
	return state;
}

/** 记录一段耗时（自上一次 mark / perfStart 起） */
export function perfMark(name, extra = "") {
	if (!state) {
		return;
	}
	const now = performance.now();
	state.rows.push({ name, ms: now - state.last, total: now - state.start, extra });
	state.last = now;
}

/** 记录一个计数（候选人数、检查的技能条数……），随摘要末尾一起打印 */
export function perfCount(name, value) {
	if (!state) {
		return;
	}
	state.counts[name] = value;
}

/** 结束并打印摘要；没有活跃计时时是空操作 */
export function perfEnd(extra = "") {
	if (!state) {
		return;
	}
	const current = state;
	state = null;
	const total = performance.now() - current.start;
	const lines = [`[rogue/perf] ${current.scope} 总耗时 ${total.toFixed(1)}ms${extra ? `（${extra}）` : ""}`];
	current.rows.forEach((row, index) => {
		lines.push(`  ${index + 1}. ${row.name} ${row.ms.toFixed(1)}ms（累计 ${row.total.toFixed(1)}ms）${row.extra ?? ""}`);
	});
	const counts = Object.entries(current.counts);
	if (counts.length) {
		lines.push(`  计数：${counts.map(([key, value]) => `${key}=${value}`).join(" / ")}`);
	}
	const text = lines.join("\n");
	console.log(text);
	try {
		globalThis.roguePerfLast = text;
	} catch { /* 没有 globalThis 就只打日志 */ }
}

/** 当前是否有活跃计时（测试用） */
export function perfActive() {
	return !!state;
}
