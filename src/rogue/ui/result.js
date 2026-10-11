// 战斗结算页（胜利 / 失败 / 无尽删档）、未正常结算战斗的恢复页，与失败惩罚的 fallback 选择页。
// 结算页与恢复页是自建浮层：大标题 + 标记 + 信息卡 + 显著操作按钮；
// 惩罚选择页是本体 Dialog 列表（条目平铺在 dialog.content 下，见 ui/common.js 顶部说明）。

import { CURRENCIES, CURRENCY_LABEL, RUN_MODE_LABEL, STAT_IDS } from "../config.js";
import { ui } from "../../../../../noname.js";
import { stats } from "../data/stats.js";
import { describeCurio, getCurio, getCurioQuality, CURIOSITY_RARITY } from "../curioManager.js";
import {
	addButton,
	addDisabledButton,
	addGap,
	addLine,
	addOverlayButton,
	openOverlay,
	openScreen,
	skillInfo,
	skillName,
	translateCharacter,
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

/**
 * 未正常结算战斗的恢复页：告知玩家恢复的是哪一关、用的是什么阵容。
 * 纯 UI：api.onResume() 由 mode.js 用存档里已保存的敌方阵容重开本关（不重掷），api.onBack() 回存档页。
 * 敌人只展示存档 currentBattle.enemies 里已序列化的 characterId（角色名 + 头像），不碰任何随机逻辑。
 *
 * 带 rift 的那一场（深渊裂隙）也走这一页——它本来就是「落盘 + 重载 + 在这里开打」进来的，
 * 所以标题与按钮换成裂隙的说法，免得玩家以为自己打了一半崩了。
 */
export function showResume(api) {
	const run = api.run;
	const rift = run.currentBattle?.rift ?? null;
	const panel = ui.create.div(".wm-rogue-resume", openOverlay("wm-rogue-resume-overlay"));

	ui.create.div(".wm-rogue-resume-mark", "!", panel);
	ui.create.div(".wm-rogue-resume-title", rift ? "深渊裂隙已开启" : "战斗未正常结算", panel);

	const card = ui.create.div(".wm-rogue-resume-card", panel);
	ui.create.div(".wm-rogue-resume-mode", RUN_MODE_LABEL[run.mode] ?? run.mode, card);
	ui.create.div(".wm-rogue-resume-level", `第 ${run.level} 关`, card);
	ui.create.div(".wm-rogue-resume-hint", rift
		? "将使用已保存的阵容进入裂隙：这一场不计入关卡层数，战败与平常失败同罪"
		: "将使用上次保存的敌方阵容继续挑战", card);

	const enemies = (Array.isArray(run.currentBattle?.enemies) ? run.currentBattle.enemies : []).filter(
		entry => entry?.characterId
	);
	if (enemies.length) {
		ui.create.div(".wm-rogue-resume-section", "本关敌人", card);
		const row = ui.create.div(".wm-rogue-resume-enemies", card);
		for (const entry of enemies) {
			const chip = ui.create.div(".wm-rogue-resume-enemy", row);
			// 与商店出处头像同一套 setBackground
			ui.create.div(".wm-rogue-shop-avatar", chip).setBackground(entry.characterId, "character");
			ui.create.div(".wm-rogue-resume-enemy-name", translateCharacter(entry.characterId), chip);
		}
	}

	const actions = ui.create.div(".wm-rogue-resume-actions", panel);
	addOverlayButton(rift ? "进入裂隙" : "重新挑战这一关", actions, () => api.onResume(), "wm-rogue-resume-primary");
	addOverlayButton("返回存档页", actions, () => api.onBack(), "wm-rogue-small");
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

/**
 * Boss 战胜利惩罚的选择页（v13）：把「随机弃置」换成玩家自己挑。
 * 需要失去哪几项由存档里的 pendingBossPenalty 说（`run` 与 `pending` 都是模式层现读后喂进来的，
 * 这一页不认识任何「随机抽到了谁」）；每一栏列出条目名与效果，点一下就失去它。
 * 已经还清 / 本来就没有可作用对象的那一栏只写一句说明、不放按钮——按既有规则一句带过，
 * 绝不拿别的类型凑数。
 * 页面没有「跳过」按钮：这场代价必须付清。玩家直接关游戏也不影响，读档回来仍是这张页、仍只欠没还清的那几项。
 * 纯 UI：删除与落盘一律交回 api（见 flow/result.js）。
 */
export function showBossPenaltyChoice(run, pending, api) {
	const content = openScreen("Boss 战的代价：选择要失去的东西");
	addLine(content, "按规则，Boss 战胜利后要从你<b>当前持有</b>的技能与奇物里各失去一项。点条目即确认失去，落盘后不可撤销。");
	addGap(content);
	if (pending.needSkill) {
		addLine(content, "<b>失去一个技能</b>");
		for (const id of run.skills) {
			const intro = skillInfo(id);
			addButton(skillName(id), content, () => api.loseSkill(id));
			addLine(content, intro || "（该技能没有描述）");
		}
	} else {
		// 两种「不需要再选」要分得开：玩家手上确实没东西可失去，还是这一项方才已经挑完并落盘了
		addLine(content, run.skills.length ? "技能：这一项已经选好，不必再动。" : "技能：没有可失去的已购买技能，这一项按规则带过。");
	}
	addGap(content);
	if (pending.needCurio) {
		addLine(content, "<b>失去一件奇物</b>");
		for (const id of run.curios) {
			const def = getCurio(id);
			const quality = getCurioQuality(id, run.curioQuality);
			addButton(`${def?.name ?? id}（${CURIOSITY_RARITY[quality] ?? quality}）`, content, () => api.loseCurio(id));
			addLine(content, describeCurio(id, run.curioQuality).join("；"));
		}
	} else {
		addLine(content, run.curios.length ? "奇物：这一项已经选好，不必再动。" : "奇物：当前没有奇物可失去，这一项按规则带过。");
	}
	if (pending.needSkill && pending.needCurio) {
		addGap(content);
		addLine(content, "两项都选完才会离开这一页。");
	}
}
