// 图鉴页：记录本局「已发现的事件」与「曾经拥有过的奇物」——不是当前拥有，
// 卖掉/丢弃/被替换过的奇物也永远留在图鉴里。未收录的条目以「??？」剪影展示，给玩家收集目标。
// 纯 UI：只读展示存档 collection，不写任何数据。

import { events, eventIds } from "../data/events.js";
import { curioIds, getCurio, CURIOSITY_RARITY } from "../data/curios.js";
import { describeCurio } from "../curioManager.js";
import { RUN_MODE, RUN_MODE_LABEL } from "../config.js";
import { ui } from "../../../../../noname.js";
import { addOverlayButton, openOverlay } from "./common.js";

function buildEntry(parent, { name, image, desc, known, tag }) {
	const card = ui.create.div(known ? ".wm-rogue-index-card.wm-rogue-index-known" : ".wm-rogue-index-card", parent);
	const art = ui.create.div(".wm-rogue-index-art", card);
	if (known && image) {
		art.style.backgroundImage = `url("${image}")`;
	} else {
		art.style.backgroundImage = "none";
		ui.create.div(".wm-rogue-index-unknown", "？？？", art);
	}
	ui.create.div(".wm-rogue-index-name", known ? name : "未发现", card);
	if (known && tag) {
		ui.create.div(".wm-rogue-index-tag", tag, card);
	}
	ui.create.div(".wm-rogue-index-desc", known ? desc : "尚未遇见的际遇。", card);
	return card;
}

export function showCollection(api) {
	const run = api.run;
	const endless = run.mode === RUN_MODE.endless;
	const stage = openOverlay("wm-rogue-index-overlay");
	const panel = ui.create.div(".wm-rogue-index", stage);

	const titlebar = ui.create.div(".wm-rogue-titlebar", panel);
	ui.create.div(".wm-rogue-title", "图鉴", titlebar);
	addOverlayButton("返回", ui.create.div(".wm-rogue-back", titlebar), () => api.back());

	const body = ui.create.div(".wm-rogue-index-body", panel);
	ui.create.div(".wm-rogue-index-sub", RUN_MODE_LABEL[run.mode] ?? run.mode, body);

	// 已发现事件：全集按 events 定义顺序排列，收录过的点亮
	const discovered = new Set(endless ? (run.collection?.events ?? []) : []);
	ui.create.div(".wm-rogue-index-section", `事件（${discovered.size}/${eventIds.length}）`, body);
	const eventRow = ui.create.div(".wm-rogue-index-cards", body);
	for (const id of eventIds) {
		const def = events[id];
		buildEntry(eventRow, {
			name: def.name,
			image: def.image,
			desc: def.description,
			known: discovered.has(id),
		});
	}

	// 曾拥有过的奇物：含已丢弃的；effectText 优先，附稀有度标签
	const owned = new Set(endless ? (run.collection?.curios ?? []) : []);
	ui.create.div(".wm-rogue-index-section", `奇物（${owned.size}/${curioIds.length}）`, body);
	const curioRow = ui.create.div(".wm-rogue-index-cards", body);
	for (const id of curioIds) {
		const def = getCurio(id);
		buildEntry(curioRow, {
			name: def.name,
			image: def.image,
			desc: describeCurio(id).join("；"),
			known: owned.has(id),
			tag: CURIOSITY_RARITY[def.rarity] ?? "",
		});
	}
}
