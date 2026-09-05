import { lib, game, ui, get, ai, _status } from "../../../../noname.js";

import { rankMap, rarityMap } from "../../data/characterRank.js";
import { createChangelogOverlay, ensureChangelogStyles } from "../ui/overlay.js";

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

export const openTierlist = () => {
if (document.querySelector(".wm-changelog-overlay")) return;
ensureChangelogStyles();
const extUrl = import.meta.url;
const { box, title, hint } = createChangelogOverlay("【奥特之星】角色强度排行");
const text = document.createElement("div");
text.className = "wm-changelog-text";
const img = document.createElement("img");
img.className = "wm-changelog-img";
img.src = extUrl.substring(0, extUrl.lastIndexOf("/") + 1) + "../../assets/image/tierlist/tierlist.png";
text.appendChild(img);
box.appendChild(title);
box.appendChild(hint);
box.appendChild(text);
};
