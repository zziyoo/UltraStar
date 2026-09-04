import { lib, game, ui, get, ai, _status } from "../../../../noname.js";

import assetsManifest from "../../data/manifests/assets.js";
import easterEggs from "../systems/easterEgg.js";
import { initBgmSystem } from "../systems/bgm.js";
import { registerDynamicTranslates } from "../systems/dynamicTranslate.js";
import { registerCharacterRanks } from "../systems/tierlist.js";
import { registerAllEquipment } from "./loader.js";

export function arenaReady() {
			const currentVersion = "2.1.1";
			const extensionName = "奥特之星";
			const savedVersion = lib.config[`extension_${extensionName}_version`] || "1.0.0";

			if (savedVersion !== currentVersion) {
				game.saveExtensionConfig(extensionName, "version", currentVersion);
				setTimeout(() => {
					const updateContent = ["【奥特之星】v" + currentVersion, "本次更新内容：", "修复bug，增加彩蛋出现概率，压缩素材", "加强：赛文（冰斧）,雷欧（奋战）", "调整：爱迪（重置）", "削弱：", "新增：阿斯特拉"];
					const mask = document.createElement("div");
					Object.assign(mask.style, {
						position: "fixed",
						left: "0",
						top: "0",
						width: "100%",
						height: "100%",
						zIndex: 9998,
						background: "rgba(0,0,0,0.5)"
					});
					ui.window.appendChild(mask);
					const dialog = ui.create.dialog("hidden");
					dialog.classList.add("fixed");
					dialog.style.zIndex = 9999;
					dialog.add('<div style="text-align:left">' + updateContent.join("<br>") + "</div>");
					dialog.open();
					const closeNotice = () => {
						dialog.close();
						mask.remove();
					};
					mask.addEventListener("click", closeNotice);
					dialog.addEventListener("click", closeNotice);
				}, 100);
			}

			try {
				if (game.promises && game.promises.checkFile) {
					Promise.all(assetsManifest.map(f => game.promises.checkFile("extension/" + extensionName + "/" + f)))
						.then(results => {
							const missing = assetsManifest.filter((f, i) => results[i] !== 1);
							const savedMissing = lib.config[`extension_${extensionName}_assetMissing`] || 0;
							if (missing.length > 0 && savedMissing !== missing.length) {
								game.saveExtensionConfig(extensionName, "assetMissing", missing.length);
								const shown = missing.slice(0, 8).map(f => "· " + f).join("<br>");
								const more = missing.length > 8 ? "<br>...等，共缺失 " + missing.length + " 个文件" : "";
								const content = [
									"【奥特之星】检测到素材缺失",
									"检测到 " + missing.length + " 个语音/图片素材文件缺失，通常是因为跳过了中间版本更新。",
									"请使用最新完整包覆盖安装，否则部分角色语音、立绘或卡牌图片将无法正常显示。",
									"缺失文件：",
									shown + more,
								];
								const mask = document.createElement("div");
								Object.assign(mask.style, {
									position: "fixed",
									left: "0",
									top: "0",
									width: "100%",
									height: "100%",
									zIndex: 9998,
									background: "rgba(0,0,0,0.5)"
								});
								ui.window.appendChild(mask);
								const dialog = ui.create.dialog("hidden");
								dialog.classList.add("fixed");
								dialog.style.zIndex = 9999;
								dialog.add('<div style="text-align:left">' + content.join("<br>") + "</div>");
								dialog.open();
								const closeNotice = () => {
									dialog.close();
									mask.remove();
								};
								mask.addEventListener("click", closeNotice);
								dialog.addEventListener("click", closeNotice);
							} else if (missing.length === 0 && savedMissing !== 0) {
								game.saveExtensionConfig(extensionName, "assetMissing", 0);
							}
						})
						.catch(e => console.error(e));
				}
			} catch (e) {
				console.error(e);
			}

			registerDynamicTranslates();
			registerCharacterRanks();

			initBgmSystem();
			easterEggs.init();
}

export function precontent() {
			game.addGroup("yv", "宇", "宇", {
				color: [129, 60, 133, 1],
				image: "ext:奥特之星/assets/common/image/kingdom/yv.png",
			});
			game.addGroup("shou", "兽", "兽", {
				color: [246, 246, 246, 1],
				image: "ext:奥特之星/assets/common/image/kingdom/shou.png",
			});
			game.addGroup("ao", "奥", "奥", {
				color: [255, 225, 76, 1],
				image: "ext:奥特之星/assets/common/image/kingdom/ao.png",
			});
			game.addGroup("ao_red", "奥", "奥", {
				color: [255, 0, 0, 1],
				image: "ext:奥特之星/assets/common/image/kingdom/ao_red.png",
			});
			game.addGroup("ao_black", "奥", "奥", {
				color: [255, 255, 255, 1],
				image: "ext:奥特之星/assets/common/image/kingdom/ao_black.png",
			});
			game.addGroup("ji", "机", "机", {
				color: [176, 208, 226, 1],
				image: "ext:奥特之星/assets/common/image/kingdom/ji.png",
			});

			lib.characterSubstitute = lib.characterSubstitute || {};
			lib.characterSubstitute["奈克瑟斯"] = [
				["奈克瑟斯-青年型", ["ext:奥特之星/assets/ultraman/image/奈克瑟斯-青年型.jpg"]],
				["奈克瑟斯-蓝色青年型", ["ext:奥特之星/assets/ultraman/image/奈克瑟斯-蓝色青年型.jpg"]],
			];
			lib.characterSubstitute["芙宁娜芙卡洛斯"] = [
				["芙宁娜-成功", ["ext:奥特之星/assets/genshin/image/芙宁娜-成功.jpg"]],
				["芙宁娜-失败", ["ext:奥特之星/assets/genshin/image/芙宁娜-失败.jpg"]],
			];
			lib.characterSubstitute["迪迦"] = [
				["迪迦-复合", ["ext:奥特之星/assets/ultraman/image/迪迦-复合.jpg"]],
				["迪迦-强力", ["ext:奥特之星/assets/ultraman/image/迪迦-强力.jpg"]],
				["迪迦-空中", ["ext:奥特之星/assets/ultraman/image/迪迦-空中.jpg"]],
			];
			lib.characterSubstitute["戴拿"] = [
				["戴拿-闪亮", ["ext:奥特之星/assets/ultraman/image/戴拿-闪亮.jpg"]],
				["戴拿-奇迹", ["ext:奥特之星/assets/ultraman/image/戴拿-奇迹.jpg"]],
				["戴拿-强壮", ["ext:奥特之星/assets/ultraman/image/戴拿-强壮.jpg"]],
			];
			lib.characterSubstitute["杰斯提斯"] = [["杰斯提斯-粉碎", ["ext:奥特之星/assets/ultraman/image/杰斯提斯-粉碎.jpg"]]];
			lib.characterSubstitute["黄泉"] = [["黄泉-啼泽", ["ext:奥特之星/assets/honkai-star-rail/image/黄泉-啼泽.jpg"]]];

			lib.characterReplace = lib.characterReplace || {};
			lib.characterReplace["迪迦"] = ["迪迦", "闪耀迪迦", "黑暗迪迦"];
			lib.characterReplace["芙宁娜"] = ["芙宁娜", "芙宁娜芙卡洛斯"];

			lib.character["死龙"] = ["none", "shen", 34, ["slyanxi", "slyinbi", "slhuiyi"], ["ext:奥特之星/assets/misc/image/死龙.jpg"]];
			lib.character["死龙"].isHiddenBoss = true;
			lib.character["死龙"].isAiForbidden = true;
			lib.translate["死龙"] = "死龙";

			lib.namePrefix = lib.namePrefix || new Map();
			lib.namePrefix.set("闪耀", { color: "#ffd700", nature: "glodenmm" });
			lib.namePrefix.set("黑暗", { color: "#000000", nature: "blackmm" });
			lib.namePrefix.set("至高", { color: "#FF0000", nature: "redmm" });

			registerAllEquipment();
			// //神秘补丁
			// if (lib.element.content.useCard && !lib.element.content.useCard._useCardEffectEndInjected) {
			// 	lib.element.content.useCard._useCardEffectEndInjected = true;
			// 	const arr = lib.element.content.useCard;
			// 	let idx = -1;
			// 	for (let i = 0; i < arr.length; i++) {
			// 		const src = typeof arr[i] === "function" ? arr[i].toString() : "";
			// 		if (src.includes("effectedCount") && src.includes("effectCount") && src.includes("goto")) {
			// 			idx = i;
			// 			break;
			// 		}
			// 	}
			// 	if (idx !== -1) {
			// 		arr.splice(idx, 0, async (event, trigger, player) => {
			// 			if (event.all_excluded) {
			// 				return;
			// 			}
			// 			const next = game.createEvent("useCardEffectEnd", false, event);
			// 			next.setContent(async (event, trigger, player) => {
			// 				await event.trigger("useCardEffectEnd");
			// 			});
			// 			next.card = event.card;
			// 			next.cards = event.cards;
			// 			next.targets = event.targets;
			// 			next.target = event.target;
			// 			next.player = event.player;
			// 			next.skill = event.skill;
			// 			next.effectedCount = event.effectedCount;
			// 			next.effectCount = event.effectCount;
			// 			await next;
			// 		});
			// 	}
			// }
}
