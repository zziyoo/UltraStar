import { lib, game, ui, get, ai, _status } from "../../../../noname.js";

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
		const rankMap = {
			s: ["芙宁娜芙卡洛斯", "奥特之王", "遐蝶", "赛迦", "谋曹丕", "那维莱特", "阿蕾奇诺", "云璃", "闪耀迪迦", "玛薇卡", "安培拉星人", "流萤", "奥特之父", "丝柯克", "迪迦", "希卡利", "芙宁娜", "奥特曼", "恰斯卡", "希诺宁", "奈克瑟斯", "黑暗迪迦", "杰克", "普利茨墨", "曼波", "哈基米", "米浴", "特别周", "黄金船", "忘归人", "灵砂", "知更鸟", "目白麦昆", "大丽花", "加坦杰厄", "伊格尼兹", "戴拿", "佐菲", "泰罗", "爻袁术", "艾斯", "赛文", "至高盖亚", "雷欧", "杰斯提斯", "黄泉", "未遂", "爱迪", "阿斯特拉"],
			ap: [],
			a: [],
			am: [],
			b: [],
			c: [],
		};
		const rarityMap = {
			legend: ["芙宁娜芙卡洛斯", "奥特之王", "遐蝶", "赛迦", "谋曹丕", "那维莱特", "阿蕾奇诺", "云璃", "闪耀迪迦", "玛薇卡", "安培拉星人", "流萤", "奥特之父", "丝柯克", "迪迦", "希卡利", "芙宁娜", "奥特曼", "恰斯卡", "希诺宁", "奈克瑟斯", "黑暗迪迦", "杰克", "普利茨墨", "曼波", "哈基米", "米浴", "特别周", "黄金船", "忘归人", "灵砂", "知更鸟", "目白麦昆", "大丽花", "加坦杰厄", "伊格尼兹", "戴拿", "佐菲", "泰罗", "爻袁术", "艾斯", "赛文", "至高盖亚", "雷欧", "杰斯提斯", "黄泉", "未遂", "爱迪", "阿斯特拉"],
			epic: [],
			rare: [],
			junk: [],
		};
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
img.src = extUrl.substring(0, extUrl.lastIndexOf("/") + 1) + "../../assets/common/image/tierlist.png";
text.appendChild(img);
box.appendChild(title);
box.appendChild(hint);
box.appendChild(text);
};
