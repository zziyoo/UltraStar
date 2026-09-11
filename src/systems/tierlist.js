import { lib, game, ui, get, ai, _status } from "../../../../noname.js";

import { rankMap, rarityMap } from "../../data/characterRank.js";
import { tierList } from "../../data/tierConfig.js";
import { characterAnalysis, calculateCharacterScore, getCharacterTier } from "../../data/characterAnalysis.js";
import { createChangelogOverlay, ensureChangelogStyles, bindTap } from "../ui/overlay.js";
import { openCharacterAnalysis } from "../ui/characterAnalysis.js";
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

// 评分驱动自动分级：遍历实际角色 → 六维评分 → getCharacterTier 自动判定 T0/T1/T2/T3；
// 同 Tier 内按总分降序（同分保持角色数据库顺序）；无分析数据或六维不完整/非法者进入「未评级」，
// 成员结构统一为 { id, info, analysis, score, tier }，供排行榜与分析面板共用
export const parseTierRows = characterMap => {
	const rows = tierList.map(tier => ({ name: tier.name, members: [], unrated: false, tierId: tier.id }));
	const unrated = { name: "未评级", members: [], unrated: true };
	for (const [id, info] of characterMap) {
		const analysis = characterAnalysis?.[id] ?? null;
		const score = calculateCharacterScore(analysis);
		if (score == null) {
			console.warn(`[奥特之星][Tier] 角色 ${id} 缺少完整有效的六维分析数据，已归入「未评级」`);
			unrated.members.push({ id, info, analysis, score: null, tier: null });
			continue;
		}
		const tierId = getCharacterTier(score);
		const row = rows.find(item => item.tierId === tierId);
		if (!row) {
			console.warn(`[奥特之星][Tier] 未知 Tier ${tierId}（角色 ${id}），已归入「未评级」`);
			unrated.members.push({ id, info, analysis, score, tier: tierId });
			continue;
		}
		row.members.push({ id, info, analysis, score, tier: tierId });
	}
	for (const row of rows) {
		row.members.sort((a, b) => b.score - a.score);
	}
	rows.push(unrated);
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
	style.textContent = `.wm-tier-content{position:relative;display:block !important;width:100%;flex:1 1 auto !important;min-height:0;overflow-y:auto !important;overflow-x:hidden;box-sizing:border-box;padding:6px 10px 16px 0;-webkit-overflow-scrolling:touch;}
						.wm-tier-row{position:relative;display:flex !important;width:100%;min-height:96px;box-sizing:border-box;margin-bottom:8px;}
						.wm-tier-label{position:relative;width:86px;flex-shrink:0;display:flex;align-items:center;justify-content:center;border-radius:10px;color:#fff;font-size:20px;font-weight:bold;text-shadow:1px 1px 2px rgba(0,0,0,0.6);margin-right:8px;}
						.wm-tier-label.unrated{font-size:15px;}
						.wm-tier-cards{position:relative;display:flex !important;flex:1 1 auto;min-width:0;min-height:96px;flex-wrap:wrap;align-content:flex-start;gap:6px;background:rgba(0,0,0,0.18);border-radius:10px;padding:8px;box-sizing:border-box;}
						.wm-tier-cards.empty::after{content:"暂无";color:#fff;font-size:20px;align-self:center;margin:auto;text-shadow:1px 1px 2px rgba(0,0,0,0.8);}
						.wm-tier-card{position:relative;width:72px;flex:0 0 72px;box-sizing:border-box;}
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
	bindTap(card, () => openCharacterAnalysis(id, info));
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
	// lib.config 在部分环境（如页面未完全引导）下可能为 undefined，不能直接索引
	let showNames = lib.config?.["extension_奥特之星_tierShowNames"] !== false;
	const applyNameState = () => {
		box.classList.toggle("wm-tier-hide", !showNames);
		toggleBtn.textContent = showNames ? "隐藏名称" : "显示名称";
	};
	toggleBtn.addEventListener("click", () => {
		showNames = !showNames;
		try {
			game.saveExtensionConfig("奥特之星", "tierShowNames", showNames);
		} catch (e) {
			console.warn("[奥特之星] 名称显示偏好暂存失败（本次会话内仍生效）", e);
		}
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
