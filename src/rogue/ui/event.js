// 无尽模式事件页：战斗胜利后（或读档恢复时）展示待处理事件，玩家点选项结算。
// 与商店/营地同一套自建浮层视觉语言：事件大图 + 名称 + 描述 + 金币经验条（作者标 hideBalance 的
// 事件不画）+ 选项按钮。
// 纯 UI：一切数据变更走 api.choose(选项下标) 交给 mode.js，选项可用性按存档现算。
//
// 两种「用不了」在这一页长得不一样，不要混（判据都在 eventManager 里现读存档）：
//   · 钱不够 → 置灰 + 写明「货币不足」，点了没有任何反应（与商店的「金币不足」按钮同款双判）；
//   · 没有可作用的对象（属性已满 / 没技能可熔 / 没奇物可融合）→ 选项照常可点，
//     点下去由结算层弹作者写的那一句，钱一分不扣。

import { getEvent } from "../data/events.js";
import { canChooseChoice } from "../eventManager.js";
import { ui } from "../../../../../noname.js";
import { addOverlayButton, addResBar, openOverlay } from "./common.js";

export function showEvent(api) {
	const run = api.getRun();
	const pendingEvent = run.pendingEvent;
	const event = getEvent(pendingEvent?.id);
	// 存档挂了事件但定义已下架：理论上 normalizePendingEvent 拦得住，这里兜底直接走出口
	if (!pendingEvent || !event) {
		console.warn(`[rogue] 事件页无可用定义，直接走出口：${pendingEvent?.id ?? "缺 pendingEvent"}`);
		api.onDone();
		return;
	}

	const stage = openOverlay("wm-rogue-event-overlay");
	const panel = ui.create.div(".wm-rogue-event", stage);

	// 事件大图：assets/events/ 512x512，用 CSS 背景画（与商店出处头像同一思路，不走 setBackground）
	const art = ui.create.div(".wm-rogue-event-art", panel);
	art.style.backgroundImage = `url("${event.image}")`;

	ui.create.div(".wm-rogue-event-name", event.name, panel);
	ui.create.div(".wm-rogue-event-desc", event.description, panel);
	// 手上有多少金币经验就写在选项正上方：这一页好几个选项要花钱（训练场、商人、融合炉），
	// 玩家得先看得见余额，才知道置灰的那一项是「付不起」而不是「坏了」。
	// 作者标了 hideBalance 的事件（虫洞）不画这一条——整条都不创建，不留空容器和那段下边距，
	// 只不动余额本身（结算与存档一个字都不改）
	if (!event.hideBalance) {
		addResBar(panel, run);
	}

	const actions = ui.create.div(".wm-rogue-event-actions", panel);
	for (const [index, choice] of pendingEvent.choices.entries()) {
		// 「此刻能不能选」只走 canChooseChoice：没有可作用的对象（属性满 / 没技能 / 没奇物）
		// 照常可点、弹作者那句；clampLoss 的预掷赌局永不置灰（失手是掷出来的，置灰等于剧透）；
		// 其余按确定费用判余额——reward 的负数、流浪商人标价、融合炉经验费都在同一处折算。
		// 结算层用的是同一个判定，UI 只是把它说给玩家看
		const usable = canChooseChoice(run, choice);
		// 余额不足：置灰并写明原因，点了没有任何反应——与商店的「金币不足」按钮同款（结算层
		// 自身还会再验一次，见 resolveEventChoice），不做「点了再弹一句拒绝」的两步交互
		const button = addOverlayButton(
			usable ? choice.text : `${choice.text} · 货币不足`,
			actions,
			() => {
				if (canChooseChoice(api.getRun(), choice)) {
					api.choose(index);
				}
			},
			"wm-rogue-event-choice"
		);
		if (!usable) {
			button.classList.add("wm-rogue-disabled");
		}
	}
}
