import { lib, game, ui, get, ai, _status } from "../../../../noname.js";

export const ensureChangelogStyles = () => {
if (document.getElementById("wm-changelog-styles")) return;
const style = document.createElement("style");
style.id = "wm-changelog-styles";
style.textContent = `@keyframes wmFadeIn{from{opacity:0}to{opacity:1}}
					@keyframes wmSlideIn{from{transform:scale(0.5) translateY(-100px);opacity:0}to{transform:scale(1) translateY(0);opacity:1}}
					.wm-changelog-overlay{position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);z-index:99999;display:flex;align-items:center;justify-content:center;animation:wmFadeIn 0.5s ease-in-out;}
					.wm-changelog-box{position:relative;width:70%;height:80%;max-width:900px;background:rgba(216,193,255,0.85);border-radius:20px;padding:0 40px;box-shadow:0 20px 60px rgba(180,150,255,0.5);animation:wmSlideIn 0.6s cubic-bezier(0.68,-0.55,0.265,1.55);overflow:hidden;display:flex;flex-direction:column;box-sizing:border-box;}
					.wm-changelog-title{position:relative;color:#fff;font-size:22px;font-weight:bold;text-shadow:1px 1px 2px rgba(0,0,0,0.8);padding:20px 0 5px 0;text-align:center;flex-shrink:0;}
					.wm-changelog-hint{position:relative;color:rgba(255,255,255,0.85);font-size:13px;text-align:center;text-shadow:1px 1px 2px rgba(0,0,0,0.6);padding-bottom:8px;flex-shrink:0;}
					.wm-changelog-text{position:relative;color:#fff;line-height:1.8;font-size:14px;word-wrap:break-word;text-shadow:1px 1px 2px rgba(0,0,0,0.8);overflow-y:auto;flex:1;padding:10px 10px 20px 0;-webkit-overflow-scrolling:touch;}
					.wm-changelog-text h1{font-size:22px;margin:8px 0 5px 0;}
					.wm-changelog-text h2{font-size:21px;margin:14px 0 5px 0;}
					.wm-changelog-text h3{font-size:15px;margin:5px 0 3px 0;}
					.wm-changelog-text li{margin:2px 0;}
					.wm-changelog-text ul{margin:3px 0 5px 15px;padding-left:15px;}
					.wm-changelog-text a{color:#ffd700;text-decoration:underline;}
					.wm-changelog-img{display:block;max-width:100%;margin:0 auto;border-radius:8px;}`;
document.head.appendChild(style);
};
export const createChangelogOverlay = titleText => {
const overlay = document.createElement("div");
overlay.className = "wm-changelog-overlay";
const box = document.createElement("div");
box.className = "wm-changelog-box";
const title = document.createElement("div");
title.className = "wm-changelog-title";
title.textContent = titleText;
const hint = document.createElement("div");
hint.className = "wm-changelog-hint";
hint.textContent = "点击空白处关闭";
overlay.appendChild(box);
overlay.addEventListener("click", e => {
	if (e.target === overlay) overlay.remove();
});
ui.window.appendChild(overlay);
return { overlay, box, title, hint };
};
