import { lib, game, ui, get, ai, _status } from "../../../../noname.js";

import { rankMap, rarityMap } from "../../data/characterRank.js";
import { tierList, tierConfig } from "../../data/tierConfig.js";
import { createChangelogOverlay, ensureChangelogStyles } from "../ui/overlay.js";
import { packages } from "../core/loader.js";
import { CHARACTER_ORDER } from "../core/registry.js";
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

// 合并所有分包角色 → Map<角色ID, 角色数据>（与 registry 角色库同源的单一数据源）
export const buildCharacterMap = () => {
	const map = new Map();
	for (const pkg of packages) {
		for (const [name, info] of Object.entries(pkg.characters ?? {})) {
			if (!map.has(name)) map.set(name, info);
		}
	}
	return map;
};

// 按 tierList 顺序解析配置：重复 ID 首次生效并警告；未知 ID 跳过并警告；
// 角色库中未列入任何 Tier 的角色按选将顺序进入「未评级」区
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
				console.warn(`[奥特之星] Tier ${tier.name} 中存在未知角色 ID：${id}，已跳过`);
				continue;
			}
			seen.add(id);
			members.push({ id, info });
		}
		rows.push({ name: tier.name, members, unrated: false });
	}
	const unrated = [];
	for (const id of CHARACTER_ORDER) {
		const info = characterMap.get(id);
		if (info && !seen.has(id)) {
			seen.add(id);
			unrated.push({ id, info });
		}
	}
	// 兜底：角色库中存在但未登记进 CHARACTER_ORDER 的角色，同样进入未评级区
	for (const [id, info] of characterMap) {
		if (!seen.has(id)) {
			seen.add(id);
			unrated.push({ id, info });
		}
	}
	rows.push({ name: "未评级", members: unrated, unrated: true });
	return rows;
};

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
			img.remove();
			card.classList.add("noimg");
		});
		card.appendChild(img);
	} else {
		card.classList.add("noimg");
	}
	const name = document.createElement("span");
	name.className = "wm-tier-name";
	name.textContent = resolveName(id);
	card.appendChild(name);
	return card;
};

export const openTierlist = () => {
	if (document.querySelector(".wm-changelog-overlay")) return;
	ensureChangelogStyles();
	ensureTierStyles();
	const { box, title, hint } = createChangelogOverlay("【奥特之星】角色强度排行");
	hint.textContent = "数据版本 v" + VERSION + " · 点击空白处关闭";
	const toggleBtn = document.createElement("span");
	toggleBtn.className = "wm-tier-toggle";
	hint.appendChild(toggleBtn);

	const rows = parseTierRows(buildCharacterMap());
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

	box.appendChild(title);
	box.appendChild(hint);
	box.appendChild(content);

	// 名称显示开关（仅显示偏好，通过扩展配置记忆，不涉及排名数据）
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
