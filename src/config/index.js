import { lib, game, ui, get, ai, _status } from "../../../../noname.js";

import { openChangelog } from "../systems/changelog.js";
import { openTierlist } from "../systems/tierlist.js";
import { VERSION } from "../core/version.js";
import easterEggs from "../systems/easterEgg.js";

// 手机端触摸优化：扩展菜单按钮在本体的触摸判定中，手指轻微移动（>10px）会被当作滑动
// （touchScroll 将 _status.dragged 置 true），touchend 回调被跳过，导致快速轻点常常无效，
// 必须长按稳定后才触发。这里在捕获阶段响应合成 click（手机端轻点/短划仍会产生，且不依赖
// _status.dragged），使这两个入口用手指轻点即可打开；打开函数有幂等保护，重复触发无害。
if (typeof document !== "undefined") {
	(() => {
		const configNames = new Set(["extension_奥特之星_viewTierlist", "extension_奥特之星_viewEggCatalog"]);
		document.addEventListener("click", e => {
			if (!lib.config.touchscreen) return;
			for (let node = e.target; node && node !== document; node = node.parentNode) {
				const name = node._link?.config?._name;
				if (!configNames.has(name)) continue;
				if (name === "extension_奥特之星_viewTierlist") openTierlist();
				else easterEggs.openCatalog();
				return;
			}
		}, true);
	})();
}

export default {
	bgm_enabled: {
		name: "BGM播放",
		intro: "开启后，触发技能时有BGM的角色会播放BGM",
		init: true,
	},
	easterEgg_enabled: {
		name: "彩蛋系统",
		intro: "开启后，特定条件下会触发角色台词和音效",
		init: true,
	},
	copyRepoUrl: {
		name: `<ins style="color: #5CADFF;">点击复制仓库地址</ins>`,
		clear: true,
		onclick: () => {
			navigator.clipboard.writeText("https://github.com/zziyoo/UltraStar").then(() => alert("已成功复制，粘贴到浏览器打开，部分进不去需要翻墙")).catch(() => alert("复制失败，请手动复制"));
			return false;
		},
	},
	viewChangelog: {
		name: `<ins style="color: #FFD700;">查看历史更新记录</ins>`,
		clear: true,
		onclick: () => {
			openChangelog();
			return false;
		},
	},
	viewTierlist: {
		name: "<ins>查看角色强度排行</ins>",
		clear: true,
		onclick: () => {
			openTierlist();
			return false;
		},
	},
	viewEggCatalog: {
		name: `<ins style="color: #C77DFF;">查看彩蛋图鉴</ins>`,
		clear: true,
		onclick: () => {
			easterEggs.openCatalog();
			return false;
		},
	},
	version: {
		name: `版本：${VERSION}`,
		clear: true,
		nopointer: true,
	},
};
