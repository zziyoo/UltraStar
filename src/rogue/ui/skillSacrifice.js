// 「故人的心」的选择界面：两阶段——先挑自己要失去的 X 个技能，再指定任意名其他角色，
// **每名被指定的角色各失去 X 个**（不是让所有敌人合起来分摊 X 个）。
//
// 版式沿用「标题 + 分隔线 + 可滚动正文 + 钉底按钮」这一套（与属性/奇物面板、Boss 惩罚页同一语言）：
// 技能可能有几十条，正文条必须自己滚、标题与按钮留在原位；选择状态全在内存里，
// 点条目只是切换选中，真正的失去由 skillSacrifice.js 在**确认那一刻**统一结算。
//
// 返回一个 Promise：{ cancelled: true } 表示这一场不发动，否则是
// { mine: [技能id], theirs: [{ player, ids: [技能id] }] }。
// **这个 Promise 一定会兑现**：创建失败、切阶段或重绘抛错都会走同一个出口（关界面 + 按未发动交回），
// 不会把调用方（开局流程）永久挂在这里。

import { ui } from "../../../../../noname.js";

import { addOverlayButton, bindOverlayTap, closeScreen, openOverlay, skillInfo, skillName, translateCharacter } from "./common.js";

/** 一条可选的技能：名称 + 完整描述，整条可点（选中挂 .wm-rogue-picked） */
function buildPickRow(parent, id, onToggle) {
	const row = ui.create.div(".wm-rogue-pick-row", parent);
	const head = ui.create.div(".wm-rogue-pick-head", row);
	ui.create.div(".wm-rogue-pick-name", skillName(id), head);
	ui.create.div(".wm-rogue-pick-check", "✓", head);
	ui.create.div(".wm-rogue-pick-desc", skillInfo(id) || "（该技能没有描述）", row);
	bindOverlayTap(row, onToggle);
	return row;
}

/**
 * 打开选择界面。
 * @param {object} options
 * @param {object} options.me 玩家 Player（只用于显示角色名）
 * @param {string[]} options.mine 玩家可失去的技能
 * @param {{player: object, skills: string[]}[]} options.targets 可失去技能的敌方（每人一批）
 * @returns {Promise<{cancelled?: boolean, mine?: string[], theirs?: {player: object, ids: string[]}[]}>}
 */
export function showSkillSacrifice({ me, mine, targets }) {
	return new Promise(resolve => {
		let settled = false;
		/** 唯一出口：关掉界面并把结果交回去 */
		const finish = choice => {
			if (settled) {
				return;
			}
			settled = true;
			closeScreen();
			resolve(choice ?? { cancelled: true });
		};
		/**
		 * 界面上任何一步（建条目、切阶段、重绘）出意外都安全退出：清掉浮层、按「未发动」交回，
		 * 开局流程照常继续——绝不把 Promise 悬在那里把这一场卡死。
		 */
		const guarded = (label, fn) => (...args) => {
			if (settled) {
				return;
			}
			try {
				return fn(...args);
			} catch (error) {
				console.error(`[rogue] 故人的心选择页（${label}）异常，按未发动退出：`, error);
				finish(null);
				return undefined;
			}
		};

		try {
			const stage = openOverlay("wm-rogue-heart-overlay");
			const panel = ui.create.div(".wm-rogue-panel.wm-rogue-heart-panel", stage);
			ui.create.div(".wm-rogue-stat-title", "故人的心", panel);
			const subtitle = ui.create.div(".wm-rogue-stat-subtitle", "", panel);
			ui.create.div(".wm-rogue-stat-divider", panel);

			const body = ui.create.div(".wm-rogue-heart-body", panel);
			const minePane = ui.create.div(".wm-rogue-heart-pane", body);
			const enemyPane = ui.create.div(".wm-rogue-heart-pane.wm-rogue-hidden", body);

			// ---- 第一阶段：己方技能
			ui.create.div(".wm-rogue-stat-section-title", `${translateCharacter(me?.name)}（你）`, minePane);
			ui.create.div(".wm-rogue-pick-hint", "选中你要失去的技能；它们只在这一场战斗里失去，存档不受影响。进入下一阶段后，可以指定任意名其他角色，每名各失去同样多个技能。", minePane);
			const minePicked = new Set();
			const mineRows = new Map();
			// 第一阶段最多能选「单个敌人身上最多的可失去技能数」：再多就没有任何敌人接得住。
			const maxTargetSkills = targets.reduce((max, target) => Math.max(max, target.skills.length), 0);
			// X = 玩家最终选了几个；进入第二阶段时固定下来，作为每名敌人的独立配额
			let quota = 0;
			let stageNow = 1;
			for (const id of mine) {
				mineRows.set(id, buildPickRow(minePane, id, guarded("切换选中", () => {
					if (!minePicked.has(id) && minePicked.size >= maxTargetSkills) {
						return;
					}
					if (minePicked.has(id)) {
						minePicked.delete(id);
					} else {
						minePicked.add(id);
					}
					paint();
				})));
			}

			// ---- 第二阶段：敌方（按角色分区，逐人独立维护选择）
			// 每名敌人各有一份 picked；被选中的必须恰好选满 X 个，未选中的保持 0 个。
			const enemyHint = ui.create.div(".wm-rogue-pick-hint", "", enemyPane);
			const enemyRows = [];
			for (const target of targets) {
				const section = ui.create.div(".wm-rogue-heart-target", enemyPane);
				const heading = ui.create.div(".wm-rogue-stat-section-title", "", section);
				const picked = new Set();
				const rows = new Map();
				for (const id of target.skills) {
					rows.set(id, buildPickRow(section, id, guarded("切换选中", () => {
						if (stageNow !== 2 || target.skills.length < quota) {
							return;
						}
						if (picked.has(id)) {
							picked.delete(id);
						} else if (picked.size < quota) {
							picked.add(id);
						} else {
							return;
						}
						paint();
					})));
				}
				enemyRows.push({ target, heading, picked, rows });
			}

			// ---- 按钮：两阶段各一套，切换的是同一行里的显隐
			const foot = ui.create.div(".wm-rogue-heart-actions", panel);
			const cancelButton = addOverlayButton("不发动", foot, guarded("不发动", () => finish(null)), "wm-rogue-heart-cancel");
			const nextButton = addOverlayButton("下一步", foot, guarded("进入敌方阶段", () => {
				if (nextButton.classList.contains("wm-rogue-disabled")) {
					return;
				}
				showStage(2);
			}), "wm-rogue-heart-next");
			const backButton = addOverlayButton("返回", foot, guarded("返回上一步", () => showStage(1)), "wm-rogue-heart-back");
			const abortButton = addOverlayButton("取消", foot, guarded("取消", () => finish(null)), "wm-rogue-heart-abort");
			const confirmButton = addOverlayButton("确认", foot, guarded("确认结算", () => {
				if (confirmButton.classList.contains("wm-rogue-disabled")) {
					return;
				}
				finish({
					mine: [...minePicked],
					theirs: enemyRows
						.map(row => ({ player: row.target.player, ids: [...row.picked] }))
						.filter(entry => entry.ids.length),
				});
			}), "wm-rogue-heart-confirm");

			function showStage(next) {
				stageNow = next;
				if (next === 2) {
					// X 变了（返回上一步改了数量）就清空敌方选择：旧配额下的选择不再成立，
					// 保留一部分会让「选了但不够数」的目标看起来像已确认。
					const nextQuota = minePicked.size;
					if (nextQuota !== quota) {
						quota = nextQuota;
						for (const row of enemyRows) {
							row.picked.clear();
						}
					}
				}
				minePane.classList[next === 1 ? "remove" : "add"]("wm-rogue-hidden");
				enemyPane.classList[next === 1 ? "add" : "remove"]("wm-rogue-hidden");
				// 两个阶段各三枚按钮：阶段一「不发动 / 下一步」，阶段二「返回 / 取消 / 确认」
				cancelButton.classList[next === 1 ? "remove" : "add"]("wm-rogue-hidden");
				nextButton.classList[next === 1 ? "remove" : "add"]("wm-rogue-hidden");
				backButton.classList[next === 1 ? "add" : "remove"]("wm-rogue-hidden");
				abortButton.classList[next === 1 ? "add" : "remove"]("wm-rogue-hidden");
				confirmButton.classList[next === 1 ? "add" : "remove"]("wm-rogue-hidden");
				body.scrollTop = 0;
				paint();
			}

			function paint() {
				for (const [id, row] of mineRows) {
					row.classList[minePicked.has(id) ? "add" : "remove"]("wm-rogue-picked");
				}
				const mineCount = minePicked.size;
				if (stageNow === 1) {
					subtitle.textContent = `选择你要失去的技能（已选 ${mineCount} 个，最多 ${maxTargetSkills} 个；敌方每名被指定者各失去同样多个）`;
					nextButton.classList[mineCount >= 1 && mineCount <= maxTargetSkills ? "remove" : "add"]("wm-rogue-disabled");
					return;
				}
				enemyHint.textContent = `每名被指定的敌人各失去 ${quota} 个技能；可以只指定其中一部分。可失去技能不足 ${quota} 个的敌人无法作为目标。`;
				let selectedTargets = 0;
				let incomplete = false;
				for (const row of enemyRows) {
					const eligible = row.target.skills.length >= quota;
					const full = eligible && row.picked.size >= quota;
					for (const [id, node] of row.rows) {
						const picked = row.picked.has(id);
						node.classList[picked ? "add" : "remove"]("wm-rogue-picked");
						node.classList[eligible ? "remove" : "add"]("wm-rogue-target-locked");
						node.classList[eligible && !picked && full ? "add" : "remove"]("wm-rogue-quota-full");
					}
					row.heading.textContent = eligible
						? `${translateCharacter(row.target.player?.name)}（已选 ${row.picked.size}/${quota}）`
						: `${translateCharacter(row.target.player?.name)}（可失去技能只有 ${row.target.skills.length} 个，不足 ${quota} 个，无法作为目标）`;
					if (row.picked.size === quota) {
						selectedTargets++;
					} else if (row.picked.size > 0) {
						incomplete = true;
					}
				}
				subtitle.textContent = `每名被选中的角色各失去 ${quota} 个技能（已指定 ${selectedTargets} 名，合计 ${selectedTargets * quota} 个）`;
				confirmButton.classList[quota >= 1 && selectedTargets >= 1 && !incomplete ? "remove" : "add"]("wm-rogue-disabled");
			}

			guarded("初始渲染", () => showStage(1))();
		} catch (error) {
			console.error("[rogue] 故人的心选择页创建失败，按未发动退出：", error);
			finish(null);
		}
	});
}
