// 战斗结算页（胜利 / 失败 / 无尽删档）与失败惩罚的 fallback 选择页。
// 结算页是自建浮层：大标题 + 标记 + 奖励/损失分行 + 下一步 + 显著返回按钮；
// 惩罚选择页是本体 Dialog 列表（条目平铺在 dialog.content 下，见 ui/common.js 顶部说明）。

import { CURRENCIES, CURRENCY_LABEL, STAT_IDS } from "../config.js";
import { ui } from "../../../../../noname.js";
import { stats } from "../data/stats.js";
import {
	addButton,
	addDisabledButton,
	addGap,
	addLine,
	addOverlayButton,
	openOverlay,
	openScreen,
	skillName,
} from "./common.js";

const currencyRows = (money, sign) =>
	CURRENCIES.filter(key => Number.isFinite(money?.[key]) && money[key]).map(
		key => `${CURRENCY_LABEL[key] ?? key} ${sign}${money[key]}`
	);

/**
 * 肉鸽结算页。
 * @param {{
 *   kind: "victory" | "defeat" | "endless",
 *   title: string,
 *   level?: number,
 *   reward?: Record<string, number>,
 *   loss?: Record<string, number>,
 *   nextLevel?: number | null,
 *   cleared?: boolean,
 *   totalLevels?: number,
 *   lines?: string[],
 *   buttonLabel?: string,
 *   onDone: Function,
 * }} info
 */
export function showResult(info) {
	const stage = openOverlay("wm-rogue-result-overlay");
	const win = info.kind === "victory";
	const panel = ui.create.div(win ? ".wm-rogue-result.wm-rogue-win" : ".wm-rogue-result.wm-rogue-lose", stage);

	ui.create.div(".wm-rogue-result-mark", win ? "✓" : "✕", panel);
	ui.create.div(".wm-rogue-result-title", info.title, panel);
	if (Number.isFinite(info.level)) {
		ui.create.div(".wm-rogue-result-sub", win ? `已通关第 ${info.level} 关` : `第 ${info.level} 关`, panel);
	}

	addResultSection(panel, "本关奖励", currencyRows(info.reward, "+"));
	addResultSection(panel, "本次损失", currencyRows(info.loss, "-"));
	for (const line of info.lines ?? []) {
		ui.create.div(".wm-rogue-result-line", line, panel);
	}

	const next = win
		? info.cleared
			? `已通关全部 ${info.totalLevels} 关，可以重复挑战`
			: `下一关：第 ${info.nextLevel} 关`
		: info.kind === "defeat"
			? "关卡保持不变，可以重新挑战本关"
			: "";
	if (next) {
		ui.create.div(".wm-rogue-result-next", next, panel);
	}

	const actions = ui.create.div(".wm-rogue-result-actions", panel);
	addOverlayButton(info.buttonLabel ?? "返回营地", actions, () => info.onDone(), "wm-rogue-result-btn");
}

function addResultSection(panel, label, rows) {
	if (!rows.length) {
		return;
	}
	ui.create.div(".wm-rogue-result-section", label, panel);
	for (const row of rows) {
		ui.create.div(".wm-rogue-result-row", row, panel);
	}
}

/** 货币不足时，玩家在“失去一个技能 / 一项属性 -1”之间自选 */
export function showPenaltyChoice(run, fallback, api) {
	const content = openScreen("失败惩罚：选择一项承担");

	addLine(content, "货币已不足以支付失败惩罚。关卡保持不变，可以重新挑战。");
	addGap(content);

	if (fallback.canLoseSkill) {
		addLine(content, "<b>失去一个技能</b>");
		for (const id of run.skills) {
			addButton(skillName(id), content, () => api.chooseLoseSkill(id));
		}
	} else {
		addDisabledButton("失去一个技能", content, "没有可失去的技能");
	}
	addGap(content);

	if (fallback.canLowerStat) {
		addLine(content, "<b>属性等级 -1</b>");
		for (const statId of STAT_IDS) {
			const level = run.stats[statId] ?? 0;
			if (level <= 0) {
				addDisabledButton(`${stats[statId].name} Lv.0`, content, "已是最低等级");
				continue;
			}
			addButton(`${stats[statId].name} Lv.${level}`, content, () => api.chooseLowerStat(statId));
		}
	} else {
		addDisabledButton("属性等级 -1", content, "所有属性都已是最低等级");
	}
}
