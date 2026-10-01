// 战斗结果页（奖励/惩罚说明）与失败惩罚的 fallback 选择页。
// 排版：所有条目平铺在 dialog.content 下，见 ui/common.js 顶部的说明。

import { CURRENCY_LABEL, STAT_IDS } from "../config.js";
import { stats } from "../data/stats.js";
import { addGap, addLine, addButton, addDisabledButton, openScreen, skillName } from "./common.js";

/**
 * @param {{ title: string, lines: string[], buttonLabel?: string, onDone: Function }} info
 */
export function showResult(info) {
	const content = openScreen(info.title);
	for (const line of info.lines) {
		addLine(content, line);
	}
	addGap(content);
	addButton(info.buttonLabel ?? "返回营地", content, () => info.onDone());
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

export function describeCurrencyChange(lost, gained) {
	const keys = new Set([...Object.keys(lost ?? {}), ...Object.keys(gained ?? {})]);
	const parts = [];
	for (const key of keys) {
		const label = CURRENCY_LABEL[key] ?? key;
		const up = gained?.[key] ?? 0;
		const down = lost?.[key] ?? 0;
		if (up) {
			parts.push(`${label} +${up}`);
		}
		if (down) {
			parts.push(`${label} -${down}`);
		}
	}
	return parts.length ? parts.join("　") : "货币无变化";
}
