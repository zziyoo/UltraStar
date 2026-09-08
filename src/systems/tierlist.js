import { lib, game, ui, get, ai, _status } from "../../../../noname.js";

import { rankMap, rarityMap } from "../../data/characterRank.js";
import { tierList, tierConfig } from "../../data/tierConfig.js";
import { createChangelogOverlay, ensureChangelogStyles } from "../ui/overlay.js";
import { buildPackage } from "../core/registry.js";
import { packages } from "../core/loader.js";
import { VERSION } from "../core/version.js";

// 注册角色评级数据（arenaReady 时调用）
export function registerCharacterRanks() {
	if (window.noname_character_rank_wm && lib.rank) {
		const rankData = window.noname_character_rank_wm;
		for (const key of Object.keys(rankData)) {
			if (key === "rarity") continue;
			for (const name of rankData[key]) {
				if (!lib.rank[key]?.includes(name)) {
					lib.rank[key].push(name);
				}
			}
		}
	}
	if (lib.rank) {
		for (const [rankKey, names] of Object.entries(rankMap)) {
			for (const name of names) {
				if (!lib.rank[rankKey]?.includes(name)) {
					lib.rank[rankKey].push(name);
				}
			}
		}
		if (lib.rank.rarity) {
			for (const [key, names] of Object.entries(rarityMap)) {
				for (const name of names) {
					if (!lib.rank.rarity[key]?.includes(name)) {
						lib.rank.rarity[key].push(name);
					}
				}
			}
		}
		// if (lib.character["加坦杰厄"]) {
		// 	lib.character["加坦杰厄"].isHiddenBoss = true;
	}
}

// ---------- Tier 数据层 ----------

// 角色数据库 = buildPackage() 的最终角色包（游戏实际注册的集合，键序即选将顺序）。
// 不维护第二套角色列表：分包中存在但未进入最终包的角色（如漏登记 CHARACTER_ORDER）
// 不属于游戏内角色，Tier 配置引用它们时会被当作未知 ID 警告并跳过
export const buildCharacterMap = () => {
	const perPackage = packages
		.map((pkg, i) => `${pkg.id ?? pkg.name ?? "pack#" + i}:${Object.keys(pkg.characters ?? {}).length}`)
		.join(", ");
	const map = new Map(Object.entries(buildPackage().character.character));
	console.info(`[奥特之星][Tier诊断] packages=${packages.length}(${perPackage}), characterMap=${map.size}`);
	return map;
};

// 按 tierList 顺序解析配置：重复 ID 首次生效并警告；未知 ID 跳过并警告；
// 最终角色包中未列入任何 Tier 的角色按包内顺序（即选将顺序）进入「未评级」区
export const parseTierRows = characterMap => {
	const seen = new Set();
	const rows = [];
	for (const tier of tierList) {
		const members = [];
		for (const id of tierConfig[tier.id] ?? []) {
			if (seen.has(id)) {
				console.warn(`[奥特之星] 角色 ${id} 被多个 Tier 重复定义（${tier.name}），已忽略重复项`);
				continue;
			}
			const info = characterMap.get(id);
			if (!info) {
				console.warn(`[奥特之星] Tier ${tier.name} 中存在未知角色 ID：${id}，已跳过（该角色不在最终角色包中）`);
				continue;
			}
			seen.add(id);
			members.push({ id, info });
		}
		rows.push({ name: tier.name, members, unrated: false });
	}
	const unrated = [];
	for (const [id, info] of characterMap) {
		if (!seen.has(id)) {
			unrated.push({ id, info });
		}
	}
	rows.push({ name: "未评级", members: unrated, unrated: true });
	console.info(`[奥特之星][Tier诊断] 各Tier角色数: ${rows.map(r => `${r.name}=${r.members.length}`).join(", ")}`);
	return rows;
};

// img 字段已按项目素材约定存储完整相对路径（即 data/assets.js assetUrl 的产出形式）；
// DOM 加载时由本体的扩展素材机制补全为绝对 URL（同本体的扩展菜单图片加载逻辑：
// lib.assetURL + "extension/" + 扩展名 + "/" + 文件路径）
const resolveImageUrl = info => (typeof info?.img === "string" && info.img ? lib.assetURL + info.img : null);
const resolveName = id => lib.translate[id] ?? id;

// ---------- Tier 渲染层 ----------

const TIER_LABEL_COLORS = [
	"linear-gradient(160deg, #f7b733, #e08e0b)",
	"linear-gradient(160deg, #b892ff, #9a5cff)",
	"linear-gradient(160deg, #5cb3ff, #2f7fe0)",
	"linear-gradient(160deg, #6fd66f, #3aa83a)",
	"linear-gradient(160deg, #98a2b3, #6b7686)",
];
const UNRATED_COLOR = "linear-gradient(160deg, #7c8493, #565e6d)";

const ensureTierStyles = () => {
	if (document.getElementById("wm-tier-styles")) return;
	const style = document.createElement("style");
	style.id = "wm-tier-styles";
	style.textContent = `.wm-tier-content{flex:1;overflow-y:auto;padding:6px 10px 16px 0;-webkit-overflow-scrolling:touch;}
						.wm-tier-row{display:flex;align-items:stretch;margin-bottom:8px;}
						.wm-tier-label{width:86px;flex-shrink:0;display:flex;align-items:center;justify-content:center;border-radius:10px;color:#fff;font-size:20px;font-weight:bold;text-shadow:1px 1px 2px rgba(0,0,0,0.6);margin-right:8px;}
						.wm-tier-label.unrated{font-size:15px;}
						.wm-tier-cards{flex:1;display:flex;flex-wrap:wrap;gap:6px;align-content:flex-start;background:rgba(0,0,0,0.18);border-radius:10px;padding:8px;min-height:52px;box-sizing:border-box;}
						.wm-tier-cards.empty::after{content:"暂无";color:rgba(255,255,255,0.35);font-size:12px;align-self:center;margin:auto;}
						.wm-tier-card{width:72px;}
						.wm-tier-card img{display:block;width:100%;aspect-ratio:3/4;object-fit:cover;object-position:center top;border-radius:6px;background:rgba(0,0,0,0.3);box-shadow:0 2px 6px rgba(0,0,0,0.35);}
						.wm-tier-card.noimg::before{content:"无图";display:flex;align-items:center;justify-content:center;width:100%;aspect-ratio:3/4;border-radius:6px;background:rgba(0,0,0,0.25);border:1px dashed rgba(255,255,255,0.4);color:rgba(255,255,255,0.6);font-size:11px;box-sizing:border-box;}
						.wm-tier-name{display:block;font-size:11px;line-height:1.3;color:#fff;text-align:center;margin-top:3px;text-shadow:1px 1px 2px rgba(0,0,0,0.8);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
						.wm-tier-hide .wm-tier-name{display:none;}
						.wm-tier-toggle{cursor:pointer;color:#ffd700;margin-left:10px;text-decoration:underline;}`;
	document.head.appendChild(style);
};

const createTierCard = ({ id, info }) => {
	const card = document.createElement("div");
	card.className = "wm-tier-card";
	const url = resolveImageUrl(info);
	if (url) {
		const img = document.createElement("img");
		img.src = url;
		img.addEventListener("error", () => {
			console.warn(`[奥特之星][Tier诊断] 角色图片加载失败：${id} -> ${url}`);
			img.remove();
			card.classList.add("noimg");
		});
		card.appendChild(img);
	} else {
		console.warn(`[奥特之星][Tier诊断] 角色缺少 img 字段：${id}`);
		card.classList.add("noimg");
	}
	const name = document.createElement("span");
	name.className = "wm-tier-name";
	name.textContent = resolveName(id);
	card.appendChild(name);
	return card;
};

// 在游离 DOM 中完整构建 Tier 内容，全部成功后才由 openTierlist 挂载
const buildTierContent = rows => {
	const content = document.createElement("div");
	content.className = "wm-tier-content";
	rows.forEach((row, index) => {
		const rowEl = document.createElement("div");
		rowEl.className = "wm-tier-row";
		const label = document.createElement("div");
		label.className = "wm-tier-label" + (row.unrated ? " unrated" : "");
		label.style.background = row.unrated ? UNRATED_COLOR : TIER_LABEL_COLORS[index % TIER_LABEL_COLORS.length];
		label.textContent = row.name;
		const cards = document.createElement("div");
		cards.className = "wm-tier-cards" + (row.members.length === 0 ? " empty" : "");
		for (const member of row.members) {
			cards.appendChild(createTierCard(member));
		}
		rowEl.appendChild(label);
		rowEl.appendChild(cards);
		content.appendChild(rowEl);
	});
	return content;
};

// 名称显示开关（仅显示偏好，通过扩展配置记忆，不涉及排名数据）
const wireNameToggle = (box, toggleBtn) => {
	let showNames = lib.config["extension_奥特之星_tierShowNames"] !== false;
	const applyNameState = () => {
		box.classList.toggle("wm-tier-hide", !showNames);
		toggleBtn.textContent = showNames ? "隐藏名称" : "显示名称";
	};
	toggleBtn.addEventListener("click", () => {
		showNames = !showNames;
		game.saveExtensionConfig("奥特之星", "tierShowNames", showNames);
		applyNameState();
	});
	applyNameState();
};

// 失败兜底：给出完整可关闭的提示 Overlay，页面不留空白
const showTierLoadError = e => {
	const { box, title, hint } = createChangelogOverlay("【奥特之星】角色强度排行");
	hint.textContent = "角色强度排行加载失败，请查看控制台";
	const text = document.createElement("div");
	text.className = "wm-changelog-text";
	text.textContent = e?.stack ?? String(e);
	box.appendChild(title);
	box.appendChild(hint);
	box.appendChild(text);
};

export const openTierlist = () => {
	if (document.querySelector(".wm-changelog-overlay")) return;
	ensureChangelogStyles();
	ensureTierStyles();
	console.info("[奥特之星][Tier诊断] 开始构建 Tier 排行页面");
	try {
		// 数据构建与 DOM 渲染全部成功后才创建 Overlay，任何异常都不会留下空白页面
		const rows = parseTierRows(buildCharacterMap());
		const content = buildTierContent(rows);
		const { box, title, hint } = createChangelogOverlay("【奥特之星】角色强度排行");
		hint.textContent = "数据版本 v" + VERSION + " · 点击空白处关闭";
		const toggleBtn = document.createElement("span");
		toggleBtn.className = "wm-tier-toggle";
		hint.appendChild(toggleBtn);
		box.appendChild(title);
		box.appendChild(hint);
		box.appendChild(content);
		wireNameToggle(box, toggleBtn);
		console.info("[奥特之星][Tier诊断] Tier 排行渲染完成");
	} catch (e) {
		console.error("[奥特之星] Tier 排行加载失败：", e);
		showTierLoadError(e);
	}
};
