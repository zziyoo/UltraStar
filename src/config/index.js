import { lib, game, ui, get, ai, _status } from "../../../../noname.js";

import { openChangelog } from "../systems/changelog.js";
import { openTierlist } from "../systems/tierlist.js";
import easterEggs from "../systems/easterEgg.js";

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
		name: "版本：2.1.1",
		clear: true,
		nopointer: true,
	},
};
