// 存档页：六个永久槽位的读取 / 删除 / 新建（先选玩法，再选角色）。
// 外观仿「造梦西游」的存档记录面板：标题栏 + 2 列卡片网格 + 大号橙色编号 + 角色名与时间戳。
// 只负责画界面，存档读写与进入逻辑由 mode.js 通过 api 注入。
//
// 承载方式：自建浮层（openOverlay）而不是 #window 内的对话框——
// 网格版式会被 #window 作用域的主题样式压掉（真机试过 class 与内联两轮），
// 浮层挂在 document.body 上、样式独立，是仓库里 src/ui/overlay.js 已验证过的做法。

import { ui, get } from "../../../../../noname.js";
import { CURRENCIES, CHARACTER_PICKER_PAGE_SIZE, CURRENCY_LABEL, LIBRARY_TEXT, RUN_MODE, RUN_MODE_LABEL, SKILL_SLOTS, SLOT_COUNT, STAT_IDS } from "../config.js";
import { stats } from "../data/stats.js";
import { bindTap } from "../../ui/overlay.js";
import {
	addButton,
	addDisabledButton,
	addGap,
	addLine,
	addOverlayButton,
	adoptScreen,
	bindOverlayTap,
	openOverlay,
	openScreen,
	showChoice,
	skillName,
	translateCharacter,
} from "./common.js";

function levelTextOf(run) {
	return run.mode === RUN_MODE.endless
		? `第${run.level}关 / 无尽`
		: `第${run.level} / ${run.totalLevels}关`;
}

function moneyText(run) {
	const money = CURRENCIES
		.filter(key => (run.currency?.[key] ?? 0) > 0)
		.map(key => `${CURRENCY_LABEL[key] ?? key} ${run.currency[key]}`);
	return money.length ? money.join("　") : "货币 0";
}

function summaryLines(run) {
	const lines = [`${RUN_MODE_LABEL[run.mode]}　${levelTextOf(run)}${run.cleared ? "（已通关）" : ""}`, translateCharacter(run.characterId)];
	lines.push(moneyText(run));
	lines.push(`技能（${run.skills.length}/${SKILL_SLOTS}）：${run.skills.length ? run.skills.map(skillName).join("、") : "无"}`);
	lines.push(STAT_IDS.map(id => `${stats[id].name} Lv.${run.stats[id] ?? 0}`).join("　"));
	if (run.currentBattle) {
		lines.push("有未完成战斗");
	}
	return lines;
}

function describeRunShort(run) {
	return run ? summaryLines(run).slice(0, 2).join("　") : LIBRARY_TEXT.emptySlot;
}

/** 造梦西游那种 YYYY-MM-DD HH:mm:ss 时间戳 */
function formatTime(timestamp) {
	const value = Number.isFinite(timestamp) && timestamp > 0 ? timestamp : Date.now();
	const date = new Date(value);
	const pad = number => String(number).padStart(2, "0");
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

/** 顶部标题栏：居中的标题 + 右上角返回 */
function buildTitlebar(parent, title, onBack) {
	const bar = ui.create.div(".wm-rogue-titlebar", parent);
	ui.create.div(".wm-rogue-title", title, bar);
	if (onBack) {
		// 尺寸统一在 ui/styles.js 的 .wm-rogue-back .wm-rogue-btn 块里调（唯一来源）
		const holder = ui.create.div(".wm-rogue-back", bar);
		addOverlayButton("返回", holder, onBack, "wm-rogue-small");
	}
	return bar;
}

/** 删除走确认框：一次点击只做一件事 */
function removeSlot(api, index) {
	showChoice([LIBRARY_TEXT.confirmRemove, `当前：存档${index + 1}　${describeRunShort(api.slots[index])}`], [
		{ label: "确认删除", onClick: () => api.remove(index) },
		{ label: "取消", onClick: () => {} },
	]);
}

/**
 * 尺寸全部用显式像素，并且用表格承载两列——不再用 grid / flex / float 做分列。
 * 起因：真机上 grid 容器宽度算成 0px、浮动卡片又整片不渲染，而表格单元格的分列
 * 与高度由表格算法给出，最难被主题样式改掉。
 */
function sizeSlotPage(panel, wide) {
	const gap = 14;
	const viewport = window.innerWidth || document.documentElement.clientWidth || 1175;
	const tableWidth = Math.max(320, Math.min(900, viewport - 24));
	panel.style.width = `${tableWidth}px`;
	panel.style.maxWidth = "none";
	panel.style.padding = "0";
	return { tableWidth, gap, wide };
}

/** 两列卡片表格：每个单元格放一张卡，行距由单元格 padding 提供 */
function buildSlotTable(api, layout) {
	const table = document.createElement("table");
	table.style.width = `${layout.tableWidth}px`;
	table.style.tableLayout = "fixed";
	table.style.borderCollapse = "collapse";
	table.style.borderSpacing = "0";
	const tbody = document.createElement("tbody");
	table.appendChild(tbody);
	const columns = layout.wide ? 2 : 1;
	const cellWidth = Math.floor(layout.tableWidth / columns);
	for (let start = 0; start < SLOT_COUNT; start += columns) {
		const tr = document.createElement("tr");
		for (let i = start; i < Math.min(start + columns, SLOT_COUNT); i++) {
			const td = document.createElement("td");
			td.style.width = `${cellWidth}px`;
			td.style.verticalAlign = "top";
			td.style.padding = `0 ${i < start + columns - 1 ? layout.gap : 0}px ${layout.gap}px 0`;
			td.appendChild(buildSlotCard(api, i));
			tr.appendChild(td);
		}
		tbody.appendChild(tr);
	}
	return table;
}

/** 卡片内部也用表格分两格：编号格固定 44px，内容格吃掉剩余宽度（文字才会正常换行） */
function buildCardContent(card, index) {
	const table = document.createElement("table");
	table.style.width = "100%";
	table.style.tableLayout = "fixed";
	table.style.borderCollapse = "collapse";
	const tr = document.createElement("tr");
	const noCell = document.createElement("td");
	noCell.className = "wm-rogue-nocell";
	noCell.style.width = "44px";
	noCell.style.padding = "0";
	noCell.style.verticalAlign = "top";
	const bodyCell = document.createElement("td");
	bodyCell.className = "wm-rogue-content";
	bodyCell.style.padding = "0";
	bodyCell.style.verticalAlign = "top";
	tr.appendChild(noCell);
	tr.appendChild(bodyCell);
	table.appendChild(tr);
	card.appendChild(table);
	ui.create.div(".wm-rogue-no", String(index + 1), noCell);
	return ui.create.div(".wm-rogue-body", bodyCell);
}

function buildSlotCard(api, index) {
	const run = api.slots[index];
	const card = ui.create.div(run ? ".wm-rogue-card" : ".wm-rogue-card.wm-rogue-empty");
	// 卡片在单元格里会被主题压窄，关键尺寸一律内联写死（行内样式在本环境是生效的）
	card.style.display = "block";
	card.style.width = "100%";
	card.style.boxSizing = "border-box";
	// 统一高度：空档三行、有档五行，按能容纳五行的尺寸取齐
	card.style.minHeight = "176px";
	ui.create.div(".wm-rogue-tag", `存档${index + 1}`, card);
	const body = buildCardContent(card, index);

	if (!run) {
		ui.create.div(".wm-rogue-name", LIBRARY_TEXT.emptySlot, body);
		ui.create.div(".wm-rogue-time", "尚无记录", body);
		ui.create.div(".wm-rogue-hint", `点击${LIBRARY_TEXT.newRun}`, body);
		bindOverlayTap(card, () => api.createAt(index));
		return card;
	}

	ui.create.div(".wm-rogue-name", translateCharacter(run.characterId), body);
	ui.create.div(".wm-rogue-time", formatTime(run.updatedAt || run.createdAt), body);
	ui.create.div(".wm-rogue-meta", `${RUN_MODE_LABEL[run.mode]}　${levelTextOf(run)}${run.cleared ? "（已通关）" : ""}`, body);
	ui.create.div(".wm-rogue-meta", `${moneyText(run)}　技能：${run.skills.length ? run.skills.map(skillName).join("、") : "无"}`, body);
	ui.create.div(".wm-rogue-meta", STAT_IDS.map(id => `${stats[id].name} Lv.${run.stats[id] ?? 0}`).join("　"), body);
	if (run.currentBattle) {
		ui.create.div(".wm-rogue-flag", "有未完成战斗", body);
	}

	// 点卡片即读取；卡内「删除」是文字链接，自身阻止冒泡，不会连带触发读取
	const remove = ui.create.div(".wm-rogue-link", LIBRARY_TEXT.remove, card);
	bindTap(remove, event => {
		event?.stopPropagation?.();
		removeSlot(api, index);
	});
	bindOverlayTap(card, () => api.enter(index));
	return card;
}

/** 竖直居中：按面板实际高度算像素外边距，不依赖 flex 的自动外边距 */
function centerPanel(panel) {
	const rect = typeof panel.getBoundingClientRect === "function" ? panel.getBoundingClientRect() : null;
	const height = (rect && rect.height) || panel.offsetHeight || 0;
	const viewport = window.innerHeight || document.documentElement.clientHeight || 800;
	const top = Math.max(24, Math.round((viewport - height) / 2));
	panel.style.marginTop = `${top}px`;
	panel.style.marginBottom = "24px";
}

function renderSlots(api) {
	const wide = !get.is.phoneLayout();
	const overlay = openOverlay(wide ? "" : "wm-rogue-narrow");
	const panel = ui.create.div(".wm-rogue-panel", overlay);
	const layout = sizeSlotPage(panel, wide);
	buildTitlebar(panel, "存档记录", () => api.leaveMode());
	panel.appendChild(buildSlotTable(api, layout));
	centerPanel(panel);
}

/** 新建：先选玩法 */
export function showRunModeChoice(api) {
	const content = openScreen("选择玩法");
	for (const mode of [RUN_MODE.challenge, RUN_MODE.endless]) {
		addButton(RUN_MODE_LABEL[mode], content, () => api.pickMode(mode));
	}
	addLine(content, "闯关：固定关卡数，失败损失一半货币。无尽：关卡无上限，失败即整档删除。");
	addGap(content);
	addButton(LIBRARY_TEXT.back, content, () => api.cancel());
}

/**
 * 新建：选角色。直接用本体的 characterDialog——它自带拼音/势力/收藏筛选条、
 * 「支持正则搜索和技能搜索」搜索框与分页，和本体选将界面一致。
 * 第二参 noclick=true：此时还没开局、没有 Player，本体的 chooseButton 用不了，
 * 所以按钮点击由我们接管。候选集合由 mode.js 按本体过滤规则给出。
 */
export function showCharacterChoice(api, roster) {
	if (!roster.length) {
		const content = openScreen("选择角色");
		addDisabledButton("没有可选角色", content, "角色候选为空：请检查扩展角色包是否开启");
		addGap(content);
		addButton(LIBRARY_TEXT.back, content, () => api.cancel());
		return;
	}

	const allowed = new Set(roster);
	const dialog = ui.create.characterDialog(id => !allowed.has(id), true);
	dialog.classList.add("fullwidth");
	dialog.classList.add("fullheight");
	adoptScreen(dialog);

	const caption = addLine(dialog.content, `点击武将即完成选择（共 ${roster.length} 名可选）`);
	const back = addButton(LIBRARY_TEXT.back, dialog.content, () => api.cancel());
	// 说明与返回挪到最前面：贴在几百张武将牌后面会掉出滚动区，看不见也点不到
	dialog.content.insertBefore(back, dialog.content.firstChild);
	dialog.content.insertBefore(caption, dialog.content.firstChild);
	for (const button of dialog.buttons) {
		button.listen(() => api.pickCharacter(button.link));
	}
	fitCharacterPage(dialog, CHARACTER_PICKER_PAGE_SIZE);
}

/**
 * 放开选将页每页的武将牌张数。
 * 本体的分页只认配置 showMax_character_number（这台机器上是 10），一页摊成几行取决于窗口多宽，
 * 超出当前页的牌只是被加上 .nodisplay——所以光把窗口拉高刷不出多余的行，必须改每页张数。
 * 页码组件拿不到也要把显隐放开：显隐是玩家看得见的部分，页码条只是数字。
 */
function fitCharacterPage(dialog, pageSize) {
	const counts = dialog.paginationMaxCount;
	const perPage = counts?.get?.("character") ?? 0;
	// 本体没分页（配置为 0）时全部牌本来就可见；它给的张数已够多也不用改
	if (perPage <= 0 || perPage >= pageSize) {
		return;
	}
	const buttonsNode = dialog.content.querySelector(".buttons");
	const pager = buttonsNode ? dialog.paginationMap?.get?.(buttonsNode) : null;
	const data = pager?.state?.data?.length ? pager.state.data : dialog.buttons;
	counts.set("character", pageSize);
	if (pager) {
		// setTotalPageCount 只重置页码并重画页码条，卡片显隐要自己按新的一页张数过一遍（当前是第一页）
		pager.setTotalPageCount(Math.ceil(data.length / pageSize));
	} else {
		console.warn("[rogue] 没拿到选将页的分页组件：已放开当前页，页码条数字仍是本体算的");
	}
	for (let i = 0; i < data.length; i++) {
		data[i].classList[i < pageSize ? "remove" : "add"]("nodisplay");
	}
}

export { renderSlots };
