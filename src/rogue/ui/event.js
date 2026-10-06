// 无尽模式事件页：战斗胜利后（或读档恢复时）展示待处理事件，玩家点选项结算。
// 与商店/营地同一套自建浮层视觉语言：事件大图 + 名称 + 描述 + 金币经验条 + 选项按钮。
// 纯 UI：一切数据变更走 api.choose(选项下标) 交给 mode.js，选项可用性按存档现算。
//
// 两种「用不了」在这一页长得不一样，不要混（判据都在 eventManager 里现读存档）：
//   · 钱不够 → 置灰 + 写明「货币不足」，点了没有任何反应（与商店的「金币不足」按钮同款双判）；
//   · 没有可作用的对象（属性已满 / 没技能可熔 / 没奇物可融合）→ 选项照常可点，
//     点下去由结算层弹作者写的那一句，钱一分不扣。

import { getEvent } from "../data/events.js";
import { getBlockedMessage, isChoiceAffordable } from "../eventManager.js";
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
	// 玩家得先看得见余额，才知道置灰的那一项是「付不起」而不是「坏了」
	addResBar(panel, run);

	const actions = ui.create.div(".wm-rogue-event-actions", panel);
	for (const [index, choice] of pendingEvent.choices.entries()) {
		// 「没有可作用的对象」（属性已满 / 没技能 / 没奇物）优先于「付不起」：这类选项点下去本来就是
		// 弹作者那一句、一个钱都不扣（结算层也是先判 blocked 再看钱），所以不能因为钱不够就把提示
		// 挡在置灰按钮后面。判据与结算层共用 getBlockedMessage 一份，现读存档
		const blocked = !!getBlockedMessage(run, choice);
		// 奇物已集齐时「随机给奇物」的选项不花钱（结算走跳过分支），不能按货币不足置灰
		const usable = blocked || isChoiceAffordable(run, choice.reward);
		// 余额不足：置灰并写明原因，点了没有任何反应——与商店的「金币不足」按钮同款（结算层
		// 自身还会再验一次，见 resolveEventChoice），不做「点了再弹一句拒绝」的两步交互
		const button = addOverlayButton(
			usable ? choice.text : `${choice.text} · 货币不足`,
			actions,
			() => {
				const current = api.getRun();
				if (getBlockedMessage(current, choice) || isChoiceAffordable(current, choice.reward)) {
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
