// 「故人的心」的选择界面：两阶段——先挑自己要失去的技能，再把这笔账分摊到敌方头上。
//
// 版式沿用「标题 + 分隔线 + 可滚动正文 + 钉底按钮」这一套（与属性/奇物面板、Boss 惩罚页同一语言）：
// 技能可能有几十条，正文条必须自己滚、标题与按钮留在原位；选择状态全在内存里，
// 点条目只是切换选中，真正的失去由 skillSacrifice.js 在**确认那一刻**统一结算。
//
// 返回一个 Promise：{ cancelled: true } 表示这一场不发动，否则是
// { mine: [技能id], theirs: [{ player, ids: [技能id] }] }。

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
		ui.create.div(".wm-rogue-pick-hint", "选中你要失去的技能；它们只在这一场战斗里失去，存档不受影响。", minePane);
		const minePicked = new Set();
		const mineRows = new Map();
		for (const id of mine) {
			mineRows.set(id, buildPickRow(minePane, id, () => {
				if (minePicked.has(id)) {
					minePicked.delete(id);
				} else {
					minePicked.add(id);
				}
				paint();
			}));
		}

		// ---- 第二阶段：敌方（按角色分区，逐人指定）
		const enemyTotal = targets.reduce((sum, target) => sum + target.skills.length, 0);
		ui.create.div(".wm-rogue-pick-hint", "敌方的总失去数必须与你相等。", enemyPane);
		const enemyRows = [];
		for (const target of targets) {
			const section = ui.create.div(".wm-rogue-heart-target", enemyPane);
			const heading = ui.create.div(".wm-rogue-stat-section-title", "", section);
			const picked = new Set();
			const rows = new Map();
			for (const id of target.skills) {
				rows.set(id, buildPickRow(section, id, () => {
					if (picked.has(id)) {
						picked.delete(id);
					} else {
						picked.add(id);
					}
					paint();
				}));
			}
			enemyRows.push({ target, heading, picked, rows });
		}

		// ---- 按钮：两阶段各一套，切换的是同一行里的显隐
		const foot = ui.create.div(".wm-rogue-heart-actions", panel);
		const cancelButton = addOverlayButton("不发动", foot, () => finish(null), "wm-rogue-heart-cancel");
		const nextButton = addOverlayButton("下一步", foot, () => {
			if (nextButton.classList.contains("wm-rogue-disabled")) {
				return;
			}
			showStage(2);
		}, "wm-rogue-heart-next");
		const backButton = addOverlayButton("返回", foot, () => showStage(1), "wm-rogue-heart-back");
		const abortButton = addOverlayButton("取消", foot, () => finish(null), "wm-rogue-heart-abort");
		const confirmButton = addOverlayButton("确认", foot, () => {
			if (confirmButton.classList.contains("wm-rogue-disabled")) {
				return;
			}
			finish({
				mine: [...minePicked],
				theirs: enemyRows
					.map(row => ({ player: row.target.player, ids: [...row.picked] }))
					.filter(entry => entry.ids.length),
			});
		}, "wm-rogue-heart-confirm");

		let stageNow = 1;
		let settled = false;
		function finish(choice) {
			if (settled) {
				return;
			}
			settled = true;
			closeScreen();
			resolve(choice ?? { cancelled: true });
		}
		function showStage(next) {
			stageNow = next;
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

		function enemyPickedCount() {
			return enemyRows.reduce((sum, row) => sum + row.picked.size, 0);
		}

		function paint() {
			for (const [id, row] of mineRows) {
				row.classList[minePicked.has(id) ? "add" : "remove"]("wm-rogue-picked");
			}
			for (const row of enemyRows) {
				for (const [id, node] of row.rows) {
					node.classList[row.picked.has(id) ? "add" : "remove"]("wm-rogue-picked");
				}
				row.heading.textContent = `${translateCharacter(row.target.player?.name)}（已选 ${row.picked.size}）`;
			}
			const mineCount = minePicked.size;
			const enemyCount = enemyPickedCount();
			if (stageNow === 1) {
				subtitle.textContent = `选择你要失去的技能（已选 ${mineCount} 个，最多 ${enemyTotal} 个）`;
				nextButton.classList[mineCount >= 1 && mineCount <= enemyTotal ? "remove" : "add"]("wm-rogue-disabled");
			} else {
				subtitle.textContent = `为敌方指定 ${mineCount} 个技能（已选 ${enemyCount} 个）`;
				confirmButton.classList[enemyCount === mineCount ? "remove" : "add"]("wm-rogue-disabled");
			}
		}

		showStage(1);
	});
}
