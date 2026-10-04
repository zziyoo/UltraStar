// 无尽模式事件页：战斗胜利后（或读档恢复时）展示待处理事件，玩家点选项结算。
// 与商店/营地同一套自建浮层视觉语言：事件大图 + 名称 + 描述 + 选项按钮。
// 纯 UI：一切数据变更走 api.choose(选项下标) 交给 mode.js，选项可用性按存档现算。

import { getEvent } from "../data/events.js";
import { isChoiceAffordable } from "../eventManager.js";
import { ui } from "../../../../../noname.js";
import { addOverlayButton, openOverlay } from "./common.js";

export function showEvent(api) {
	const run = api.getRun();
	const pendingEvent = run.pendingEvent;
	const event = getEvent(pendingEvent?.id);
	// 存档挂了事件但定义已下架：理论上 normalizePendingEvent 拦得住，这里兜底直接走出口
	if (!pendingEvent || !event) {
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

	const actions = ui.create.div(".wm-rogue-event-actions", panel);
	for (const [index, choice] of pendingEvent.choices.entries()) {
		const affordable = isChoiceAffordable(run, choice.reward);
		const button = addOverlayButton(
			affordable ? choice.text : `${choice.text}（货币不足）`,
			actions,
			() => api.choose(index),
			"wm-rogue-event-choice"
		);
		if (!affordable) {
			button.classList.add("wm-rogue-disabled");
		}
	}
}
