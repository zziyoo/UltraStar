import { lib, game, ui, get, ai, _status } from "../../../../noname.js";

import { openChangelog } from "../systems/changelog.js";
import { openTierlist } from "../systems/tierlist.js";
import { VERSION } from "../core/version.js";
import easterEggs from "../systems/easterEgg.js";

// 手机端触摸优化：扩展菜单按钮经本体 listen 绑定，touchend 回调受全局 _status.dragged
// 门控，而手机上手指轻微抖动（按 documentZoom 换算后超过 10px）即会把 _status.dragged
// 置 true；合成 click 又被本体 document 级 touchmove preventDefault（windowtouchmove）
// 抑制，且 click 兜底在首次触摸后因 _status.touchconfirmed 永久失效。三者叠加导致快速
// 轻点经常无效，只能长按静止后松开才触发。这里改为在 document 捕获阶段直接识别落在这
// 两个入口上的轻触（单指且位移不超过 10px），命中后 stopPropagation + preventDefault，
// 保证一次轻触只触发一次，也不影响本体其他 UI 的触摸行为；两个打开函数均有幂等保护。
if (typeof document !== "undefined") {
	(() => {
		const configNames = new Set(["extension_奥特之星_viewTierlist", "extension_奥特之星_viewEggCatalog"]);
		const findEntryName = node => {
			for (; node && node !== document; node = node.parentNode) {
				const name = node._link?.config?._name;
				if (configNames.has(name)) return name;
			}
			return null;
		};
		let startX = 0;
		let startY = 0;
		let tracking = false;
		document.addEventListener("touchstart", e => {
			tracking = !!lib.config?.touchscreen && e.touches.length === 1 && !!findEntryName(e.target);
			if (!tracking) return;
			startX = e.changedTouches[0].clientX;
			startY = e.changedTouches[0].clientY;
		}, true);
		document.addEventListener("touchend", e => {
			if (!tracking || e.touches.length > 0) return;
			tracking = false;
			const touch = e.changedTouches[0];
			if (Math.abs(touch.clientX - startX) > 10 || Math.abs(touch.clientY - startY) > 10) return;
			const name = findEntryName(e.target);
			if (!name) return;
			e.preventDefault();
			e.stopPropagation();
			if (name === "extension_奥特之星_viewTierlist") openTierlist();
			else easterEggs.openCatalog();
		}, { capture: true, passive: false });
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
