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
	viewChangelog: {
		name: "<ins>查看历史更新记录</ins>",
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
		name: "<ins>查看彩蛋图鉴</ins>",
		clear: true,
		onclick: () => {
			easterEggs.openCatalog();
			return false;
		},
	},
	version: {
		name: "版本：1.3.2",
		clear: true,
		nopointer: true,
	},
};
