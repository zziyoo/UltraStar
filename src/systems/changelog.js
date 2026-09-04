import { lib, game, ui, get, ai, _status } from "../../../../noname.js";

import { createChangelogOverlay, ensureChangelogStyles } from "../ui/overlay.js";

export const openChangelog = async () => {
if (document.querySelector(".wm-changelog-overlay")) return;
ensureChangelogStyles();
const mdToHtml = markdown => {
	let html = markdown.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\r\n/g, "\n")
		.replace(/^## (v\d+[^\n]*)$/gm, "<h2>$1</h2>")
		.replace(/^### (.+)$/gm, "<h3>$1</h3>")
		.replace(/^## (.+)$/gm, "<h3>$1</h3>")
		.replace(/^\d+\.\s+(.+)$/gm, "<li>$1</li>")
		.replace(/^- (.+)$/gm, "<li>$1</li>")
		.replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>')
		.replace(/\n/g, "<br>");
	return html.replace(/(?:<li>.*?<\/li>(?:<br>)?)+/gs, m => "<ul>" + m.replace(/<br>/g, "") + "</ul>");
};
const extUrl = import.meta.url;
const changelogUrl = extUrl.substring(0, extUrl.lastIndexOf("/") + 1) + "../../CHANGELOG.md";
let html;
try {
	const res = await fetch(changelogUrl);
	html = mdToHtml(await res.text());
} catch (e) {
	html = "更新日志加载失败 (´；ω ；`)";
}
const { box, title, hint } = createChangelogOverlay("【奥特之星】历史更新");
const text = document.createElement("div");
text.className = "wm-changelog-text";
text.innerHTML = html;
box.appendChild(title);
box.appendChild(hint);
box.appendChild(text);
};
