import { lib, game, ui, get, ai, _status } from "../../../../noname.js";

export const ensureChangelogStyles = () => {
if (document.getElementById("wm-changelog-styles")) return;
const style = document.createElement("style");
style.id = "wm-changelog-styles";
style.textContent = `@keyframes wmFadeIn{from{opacity:0}to{opacity:1}}
					@keyframes wmSlideIn{from{transform:scale(0.5) translateY(-100px);opacity:0}to{transform:scale(1) translateY(0);opacity:1}}
					.wm-changelog-overlay{position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);z-index:99999;display:flex;align-items:center;justify-content:center;animation:wmFadeIn 0.5s ease-in-out;}
					.wm-changelog-box{position:relative;width:77%;height:84%;max-width:990px;min-height:0;background:rgba(216,193,255,0.85);border-radius:20px;padding:0 40px;box-shadow:0 20px 60px rgba(180,150,255,0.5);animation:wmSlideIn 0.6s cubic-bezier(0.68,-0.55,0.265,1.55);overflow:hidden;display:flex;flex-direction:column;box-sizing:border-box;}
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
// 必须挂载到 document.body：ui.window(#window) 内部存在大量作用于任意后代 div 的
// 本体样式（layout/default/layout.css 等），会把 Overlay 内容布局破坏成空白；
// overlay 为 fixed 定位，挂在 body 与挂在 ui.window 视觉完全一致，但不受其干扰
document.body.appendChild(overlay);
return { overlay, box, title, hint };
};
// 统一轻触绑定：PC 端保持原生 click；触摸端在 touchend 上判定轻触（单指且位移
// 不超过 10px）。不依赖本体 onclick 的合成机制——本体在 document 级对 touchmove
// preventDefault（windowtouchmove）会吞掉合成 click，全局 _status.dragged 也会让
// 本体 listen 的 touchend 回调被跳过。命中轻触时 preventDefault 阻止合成 click
// 造成二次触发，click 分支再以时间戳兜底过滤，保证一次轻触最多执行一次回调
export const bindTap = (element, callback) => {
	let startX = 0;
	let startY = 0;
	let tracking = false;
	let handledAt = 0;
	element.addEventListener("touchstart", e => {
		if (e.touches.length !== 1) {
			tracking = false;
			return;
		}
		tracking = true;
		startX = e.changedTouches[0].clientX;
		startY = e.changedTouches[0].clientY;
	}, { passive: true });
	element.addEventListener("touchend", e => {
		if (!tracking || e.touches.length > 0) return;
		tracking = false;
		const touch = e.changedTouches[0];
		if (Math.abs(touch.clientX - startX) > 10 || Math.abs(touch.clientY - startY) > 10) return;
		handledAt = Date.now();
		e.preventDefault();
		callback(e);
	}, { passive: false });
	element.addEventListener("touchcancel", () => {
		tracking = false;
	});
	element.addEventListener("click", e => {
		if (Date.now() - handledAt < 800) return;
		callback(e);
	});
};
// 自定义 Overlay 的触摸隔离：本体在 document 上监听 touchmove 并无条件 preventDefault，
// 会阻断 Overlay 内 overflow 列表的原生滚动，touchstart/touchend 冒泡到 document 还会
// 记录滑动起点、触发全局手势判定。这里在 Overlay 根节点拦截触摸冒泡，
// 使 Overlay 内部触摸完全由 bindTap 与浏览器默认滚动接管，不影响本体其余 UI
export const isolateOverlayTouch = overlay => {
	for (const type of ["touchstart", "touchmove", "touchend"]) {
		overlay.addEventListener(type, e => e.stopPropagation(), { passive: true });
	}
};
