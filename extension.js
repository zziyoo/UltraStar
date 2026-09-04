import { lib, game, ui, get, ai, _status } from "../../noname.js";
import dynamicTranslates from "./dynamicTranslate.js";
import { registerEquipmentCards } from "./equipment/equipmentCards.js";
import { registerEquipmentSkills } from "./equipment/equipmentSkills.js";
import easterEggs from "./easterEggs.js";
import bgmList from "./bgmList.js";
import characterIntros from "./intro.js";
import assetsManifest from "./assetsManifest.js";
export const type = "extension";
const ensureChangelogStyles = () => {
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
const createChangelogOverlay = titleText => {
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
const openChangelog = async () => {
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
	const changelogUrl = extUrl.substring(0, extUrl.lastIndexOf("/") + 1) + "CHANGELOG.md";
	let html;
	try {
		const res = await fetch(changelogUrl);
		html = mdToHtml(await res.text());
	} catch (e) {
		html = "更新日志加载失败 (´；ω ；`)";
	}
	const { box, title, hint } = createChangelogOverlay("【无名扩展】历史更新");
	const text = document.createElement("div");
	text.className = "wm-changelog-text";
	text.innerHTML = html;
	box.appendChild(title);
	box.appendChild(hint);
	box.appendChild(text);
};
const openTierlist = () => {
	if (document.querySelector(".wm-changelog-overlay")) return;
	ensureChangelogStyles();
	const extUrl = import.meta.url;
	const { box, title, hint } = createChangelogOverlay("【无名扩展】角色强度排行");
	const text = document.createElement("div");
	text.className = "wm-changelog-text";
	const img = document.createElement("img");
	img.className = "wm-changelog-img";
	img.src = extUrl.substring(0, extUrl.lastIndexOf("/") + 1) + "image/tierlist.png";
	text.appendChild(img);
	box.appendChild(title);
	box.appendChild(hint);
	box.appendChild(text);
};
export default function () {
	return {
		name: "无名扩展",
		content: function (config, pack) {},
		arenaReady: function () {
			const currentVersion = "1.3.2";
			const extensionName = "无名扩展";
			const savedVersion = lib.config[`extension_${extensionName}_version`] || "1.0.0";

			if (savedVersion !== currentVersion) {
				game.saveExtensionConfig(extensionName, "version", currentVersion);
				setTimeout(() => {
					const updateContent = ["【无名扩展】v" + currentVersion, "本次更新内容：", "修复bug，增加彩蛋出现概率，压缩素材", "加强：赛文（冰斧）,雷欧（奋战）", "调整：爱迪（重置）", "削弱：", "新增：阿斯特拉"];
					const dialog = ui.create.dialog("hidden");
					dialog.classList.add("fixed");
					dialog.add('<div style="text-align:left">' + updateContent.join("<br>") + "</div>");
					dialog.open();
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
									"【无名扩展】检测到素材缺失",
									"检测到 " + missing.length + " 个语音/图片素材文件缺失，通常是因为跳过了中间版本更新。",
									"请使用最新完整包覆盖安装，否则部分角色语音、立绘或卡牌图片将无法正常显示。",
									"缺失文件：",
									shown + more,
								];
								const dialog = ui.create.dialog("hidden");
								dialog.classList.add("fixed");
								dialog.add('<div style="text-align:left">' + content.join("<br>") + "</div>");
								dialog.open();
							} else if (missing.length === 0 && savedMissing !== 0) {
								game.saveExtensionConfig(extensionName, "assetMissing", 0);
							}
						})
						.catch(e => console.error(e));
				}
			} catch (e) {
				console.error(e);
			}

			for (const key in dynamicTranslates) {
				lib.dynamicTranslate[key] = dynamicTranslates[key];
			}
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

			game.customBgmList = [];
			game.hasOtherBgmPlaying = function (currentAudio) {
				return game.customBgmList.some(audio => audio !== currentAudio && !audio.paused);
			};
			game.addBgmToList = function (audio) {
				if (!lib.config.extension_无名扩展_bgm_enabled) {
					audio.play = () => Promise.resolve();
					return;
				}
				game.customBgmList.push(audio);
				audio.onended = () => {
					const index = game.customBgmList.indexOf(audio);
					if (index > -1) game.customBgmList.splice(index, 1);
				};
			};
			game.playSkillBgm = function (key) {
				const files = bgmList[key];
				if (!files?.length) return;
				const audioKey = `${key}_audio`;
				if (!game[audioKey] || game[audioKey].ended) {
					if (!game.hasOtherBgmPlaying(game[audioKey])) {
						const file = files[Math.floor(Math.random() * files.length)];
						game[audioKey] = new Audio(`extension/无名扩展/audio/skill/${file}`);
						game.addBgmToList(game[audioKey]);
						game[audioKey].play();
					}
				}
			};
			easterEggs.init();
		},
		precontent: function () {
			game.addGroup("yv", "宇", "宇", {
				color: [129, 60, 133, 1],
				image: "ext:无名扩展/image/kingdom/yv.png",
			});
			game.addGroup("shou", "兽", "兽", {
				color: [246, 246, 246, 1],
				image: "ext:无名扩展/image/kingdom/shou.png",
			});
			game.addGroup("ao", "奥", "奥", {
				color: [255, 225, 76, 1],
				image: "ext:无名扩展/image/kingdom/ao.png",
			});
			game.addGroup("ao_red", "奥", "奥", {
				color: [255, 0, 0, 1],
				image: "ext:无名扩展/image/kingdom/ao_red.png",
			});
			game.addGroup("ao_black", "奥", "奥", {
				color: [255, 255, 255, 1],
				image: "ext:无名扩展/image/kingdom/ao_black.png",
			});
			game.addGroup("ji", "机", "机", {
				color: [176, 208, 226, 1],
				image: "ext:无名扩展/image/kingdom/ji.png",
			});

			lib.characterSubstitute = lib.characterSubstitute || {};
			lib.characterSubstitute["奈克瑟斯"] = [
				["奈克瑟斯-青年型", ["ext:无名扩展/image/奈克瑟斯-青年型.jpg"]],
				["奈克瑟斯-蓝色青年型", ["ext:无名扩展/image/奈克瑟斯-蓝色青年型.jpg"]],
			];
			lib.characterSubstitute["芙宁娜芙卡洛斯"] = [
				["芙宁娜-成功", ["ext:无名扩展/image/芙宁娜-成功.jpg"]],
				["芙宁娜-失败", ["ext:无名扩展/image/芙宁娜-失败.jpg"]],
			];
			lib.characterSubstitute["迪迦"] = [
				["迪迦-复合", ["ext:无名扩展/image/迪迦-复合.jpg"]],
				["迪迦-强力", ["ext:无名扩展/image/迪迦-强力.jpg"]],
				["迪迦-空中", ["ext:无名扩展/image/迪迦-空中.jpg"]],
			];
			lib.characterSubstitute["戴拿"] = [
				["戴拿-闪亮", ["ext:无名扩展/image/戴拿-闪亮.jpg"]],
				["戴拿-奇迹", ["ext:无名扩展/image/戴拿-奇迹.jpg"]],
				["戴拿-强壮", ["ext:无名扩展/image/戴拿-强壮.jpg"]],
			];
			lib.characterSubstitute["杰斯提斯"] = [["杰斯提斯-粉碎", ["ext:无名扩展/image/杰斯提斯-粉碎.jpg"]]];
			lib.characterSubstitute["黄泉"] = [["黄泉-啼泽", ["ext:无名扩展/image/黄泉-啼泽.jpg"]]];

			lib.characterReplace = lib.characterReplace || {};
			lib.characterReplace["迪迦"] = ["迪迦", "闪耀迪迦", "黑暗迪迦"];
			lib.characterReplace["芙宁娜"] = ["芙宁娜", "芙宁娜芙卡洛斯"];

			lib.character["死龙"] = ["none", "shen", 34, ["slyanxi", "slyinbi", "slhuiyi"], ["ext:无名扩展/image/死龙.jpg"]];
			lib.character["死龙"].isHiddenBoss = true;
			lib.character["死龙"].isAiForbidden = true;
			lib.translate["死龙"] = "死龙";

			lib.namePrefix = lib.namePrefix || new Map();
			lib.namePrefix.set("闪耀", { color: "#ffd700", nature: "glodenmm" });
			lib.namePrefix.set("黑暗", { color: "#000000", nature: "blackmm" });
			lib.namePrefix.set("至高", { color: "#FF0000", nature: "redmm" });

			registerEquipmentCards();
			registerEquipmentSkills();
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
		},
		help: {},
		config: {
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
		},
		package: {
			character: {
				character: {
					普利茨墨: {
						sex: "none",
						group: "shou",
						hp: 4,
						skills: ["plcmhuanjing", "plcmlengjing", "plcmjinghua"],
						names: "null|普利茨墨",
						img: "extension/无名扩展/image/普利茨墨.jpg",
						dieAudios: ["ext:无名扩展/audio/die/普利茨墨.mp3"],
					},
					曼波: {
						sex: "female",
						group: "shen",
						hp: 4,
						skills: ["mbmanbo"],
						names: "null|子右",
						img: "extension/无名扩展/image/曼波.jpg",
						dieAudios: ["ext:无名扩展/audio/die/曼波.mp3"],
					},
					哈基米: {
						sex: "female",
						group: "shen",
						hp: 3,
						skills: ["hjmhaqi"],
						names: "null|哈基米",
						img: "extension/无名扩展/image/哈基米.jpg",
						dieAudios: ["ext:无名扩展/audio/die/哈基米.mp3"],
					},
					米浴: {
						sex: "female",
						group: "shen",
						hp: 4,
						skills: ["myjuesheng"],
						names: "null|米浴",
						img: "extension/无名扩展/image/米浴.jpg",
						dieAudios: ["ext:无名扩展/audio/die/米浴.mp3"],
					},
					安培拉星人: {
						sex: "male",
						group: "yv",
						hp: 5,
						skills: ["aplxiongye", "aplaojie"],
						names: "null|安培拉星人",
						img: "extension/无名扩展/image/安培拉星人.jpg",
						dieAudios: ["ext:无名扩展/audio/die/安培拉星人.mp3"],
					},
					特别周: {
						sex: "female",
						group: "shen",
						hp: 5,
						skills: ["tbznengchi"],
						names: "null|特别周",
						img: "extension/无名扩展/image/特别周.jpg",
						dieAudios: ["ext:无名扩展/audio/die/特别周.mp3"],
					},
					黄金船: {
						sex: "female",
						group: "shen",
						hp: 4,
						skills: ["hjcsuixin"],
						names: "null|黄金船",
						img: "extension/无名扩展/image/黄金船.jpg",
						dieAudios: ["ext:无名扩展/audio/die/黄金船.mp3"],
					},
					奈克瑟斯: {
						sex: "male",
						group: "ao_red",
						hp: 4,
						skills: ["nkssjicheng"],
						names: "null|奈克瑟斯",
						img: "extension/无名扩展/image/奈克瑟斯.jpg",
						dieAudios: ["ext:无名扩展/audio/die/奈克瑟斯.mp3"],
					},
					芙宁娜芙卡洛斯: {
						sex: "female",
						group: "shen",
						hp: 3,
						skills: ["ffshenqu", "ffduwu", "ffshenpan"],
						names: "null|芙宁娜-null|芙卡洛斯",
						img: "extension/无名扩展/image/芙宁娜芙卡洛斯.jpg",
					},
					流萤: {
						sex: "female",
						group: "shen",
						hp: 5,
						skills: ["lyshishang", "lyranjin", "lyyuhuo"],
						names: "null|流萤",
						img: "extension/无名扩展/image/流萤.jpg",
						dieAudios: ["ext:无名扩展/audio/die/流萤.mp3"],
					},
					大丽花: {
						sex: "female",
						group: "shen",
						hp: 4,
						skills: ["dlhchizhuo"],
						names: "null|大丽花",
						img: "extension/无名扩展/image/大丽花.jpg",
						dieAudios: ["ext:无名扩展/audio/die/大丽花.mp3"],
					},
					忘归人: {
						sex: "female",
						group: "shen",
						hp: 4,
						skills: ["wgryanzhao"],
						names: "null|忘归人",
						img: "extension/无名扩展/image/忘归人.jpg",
						dieAudios: ["ext:无名扩展/audio/die/忘归人.mp3"],
					},
					灵砂: {
						sex: "female",
						group: "shen",
						hp: 4,
						skills: ["lszhuoyan", "lsfenyun"],
						names: "null|灵砂",
						img: "extension/无名扩展/image/灵砂.jpg",
						dieAudios: ["ext:无名扩展/audio/die/灵砂.mp3"],
					},
					谋曹丕: {
						sex: "male",
						group: "wei",
						hp: 3,
						skills: ["mcpxingshang", "mcpfangzhu", "mcpsongwei"],
						img: "extension/无名扩展/image/谋曹丕.jpg",
						dieAudios: ["ext:无名扩展/audio/die/谋曹丕.mp3"],
					},
					那维莱特: {
						sex: "male",
						group: "shen",
						hp: 5,
						skills: ["nwlthailang", "nwltgongzheng", "nwltjuecai"],
						names: "那维莱特|null",
						img: "extension/无名扩展/image/那维莱特.jpg",
						dieAudios: ["ext:无名扩展/audio/die/那维莱特.mp3"],
					},
					奥特之父: {
						sex: "male",
						group: "ao",
						hp: 4,
						skills: ["atzfzhenli", "atzfchiyuan"],
						names: "null|健",
						img: "extension/无名扩展/image/奥特之父.jpg",
						dieAudios: ["ext:无名扩展/audio/die/奥特之父.mp3"],
					},
					阿蕾奇诺: {
						sex: "female",
						group: "shen",
						hp: 4,
						skills: ["alqnhuahui", "alqnzhanshou", "alqneyue"],
						names: "null|佩露薇利",
						img: "extension/无名扩展/image/阿蕾奇诺.jpg",
						dieAudios: ["ext:无名扩展/audio/die/阿蕾奇诺.mp3"],
					},
					知更鸟: {
						sex: "female",
						group: "shen",
						hp: 3,
						skills: ["zgnxiezou"],
						names: "null|知更鸟",
						img: "extension/无名扩展/image/知更鸟.jpg",
						dieAudios: ["ext:无名扩展/audio/die/知更鸟.mp3"],
					},
					丝柯克: {
						sex: "female",
						group: "shen",
						hp: 4,
						skills: ["skkjimie", "skkduduan"],
						img: "extension/无名扩展/image/丝柯克.jpg",
						dieAudios: ["ext:无名扩展/audio/die/丝柯克.mp3"],
					},
					云璃: {
						sex: "female",
						group: "shen",
						hp: 4,
						skills: ["ylshanshuo", "ylxiahe", "ylkanpo"],
						img: "extension/无名扩展/image/云璃.jpg",
						dieAudios: ["ext:无名扩展/audio/die/云璃.mp3"],
					},
					奥特之王: {
						sex: "male",
						group: "ao",
						hp: 4,
						skills: ["atzwxingmian", "atzwbuxi"],
						names: "null|皮特",
						img: "extension/无名扩展/image/奥特之王.jpg",
						dieAudios: ["ext:无名扩展/audio/die/那位大人.mp3"],
					},
					遐蝶: {
						sex: "female",
						group: "shen",
						hp: 10,
						skills: ["xdanchao", "xdyuejian", "xdyoudie"],
						names: "null|遐蝶",
						img: "extension/无名扩展/image/遐蝶.jpg",
						dieAudios: ["ext:无名扩展/audio/die/遐蝶.mp3"],
					},
					目白麦昆: {
						sex: "female",
						group: "shen",
						hp: 4,
						skills: ["mbmkmingmen"],
						names: "目白|麦昆",
						img: "extension/无名扩展/image/目白麦昆.jpg",
						dieAudios: ["ext:无名扩展/audio/die/目白麦昆.mp3"],
					},
					闪耀迪迦: {
						sex: "male",
						group: "ao",
						hp: 4,
						skills: ["sydjqiji", "sydjhuihuang"],
						names: "null|迪迦",
						img: "extension/无名扩展/image/闪耀迪迦.jpg",
						dieAudios: ["ext:无名扩展/audio/die/那位大人.mp3"],
					},
					迪迦: {
						sex: "male",
						group: "ao",
						hp: 4,
						skills: ["djsj"],
						names: "null|迪迦",
						img: "extension/无名扩展/image/迪迦-复合.jpg",
						dieAudios: ["ext:无名扩展/audio/die/迪迦.mp3"],
					},
					黑暗迪迦: {
						sex: "male",
						group: "ao_black",
						hp: 4,
						skills: ["hadjheian", "hadjanrong", "hadjyihui"],
						names: "null|迪迦",
						img: "extension/无名扩展/image/黑暗迪迦.jpg",
						dieAudios: ["ext:无名扩展/audio/die/黑暗迪迦.mp3"],
					},
					赛迦: {
						sex: "male",
						group: "ao",
						hp: 4,
						skills: ["sjyuzhi", "sjzhanren"],
						names: "null|赛迦",
						img: "extension/无名扩展/image/赛迦.jpg",
						dieAudios: ["ext:无名扩展/audio/die/那位大人.mp3"],
					},
					希卡利: {
						sex: "male",
						group: "ao",
						hp: 3,
						skills: ["xklkeyan", "xkllizhu"],
						names: "null|希卡利",
						img: "extension/无名扩展/image/希卡利.jpg",
						dieAudios: ["ext:无名扩展/audio/die/希卡利.mp3"],
					},
					芙宁娜: {
						sex: "female",
						group: "shen",
						hp: 5,
						skills: ["ffshalong", "ffyuanwu", "ffkuanghuan"],
						names: "null|芙宁娜",
						img: "extension/无名扩展/image/芙宁娜.jpg",
						dieAudios: ["ext:无名扩展/audio/die/芙宁娜.mp3"],
					},
					奥特曼: {
						sex: "male",
						group: "ao",
						hp: 4,
						skills: ["atmguanglun", "atmzhuangshuo", "atmnianli"],
						names: "null|奥特曼",
						img: "extension/无名扩展/image/奥特曼.jpg",
						dieAudios: ["ext:无名扩展/audio/die/那位大人.mp3"],
					},
					杰克: {
						sex: "male",
						group: "ao",
						hp: 4,
						skills: ["jkshouzhuo", "jkjuedi", "atmnianli"],
						names: "null|杰克",
						img: "extension/无名扩展/image/杰克.jpg",
						dieAudios: ["ext:无名扩展/audio/die/杰克.mp3"],
					},
					恰斯卡: {
						sex: "female",
						group: "shen",
						hp: 3,
						skills: ["qsklingjiang", "qsksuohun"],
						names: "null|恰斯卡",
						img: "extension/无名扩展/image/恰斯卡.jpg",
						dieAudios: ["ext:无名扩展/audio/die/恰斯卡.mp3"],
					},
					玛薇卡: {
						sex: "female",
						group: "shen",
						hp: 4,
						skills: ["mwkzhihuo", "mwkfenyao", "mwkfantian"],
						names: "null|玛薇卡",
						img: "extension/无名扩展/image/玛薇卡.jpg",
						dieAudios: ["ext:无名扩展/audio/die/玛薇卡.mp3"],
					},
					希诺宁: {
						sex: "female",
						group: "shen",
						hp: 4,
						skills: ["xnnjuelie", "xnnduancui"],
						names: "null|希诺宁",
						img: "extension/无名扩展/image/希诺宁.jpg",
						dieAudios: ["ext:无名扩展/audio/die/希诺宁.mp3"],
					},
					加坦杰厄: {
						sex: "null",
						group: "shou",
						hp: 4,
						skills: ["jtjeheiwu", "jtjeluoke", "jtjeguanchuan"],
						names: "null|加坦杰厄",
						img: "extension/无名扩展/image/加坦杰厄.jpg",
						dieAudios: ["ext:无名扩展/audio/die/加坦杰厄.mp3"],
					},
					伊格尼兹: {
						sex: "male",
						group: "shen",
						hp: 4,
						skills: ["ignzshenji"],
						names: "null|伊格尼兹",
						img: "extension/无名扩展/image/伊格尼兹.jpg",
						dieAudios: ["ext:无名扩展/audio/die/伊格尼兹.mp3"],
					},
					戴拿: {
						sex: "male",
						group: "ao",
						hp: 4,
						skills: ["dnshuijing"],
						names: "null|戴拿",
						img: "extension/无名扩展/image/戴拿-闪亮.jpg",
						dieAudios: ["ext:无名扩展/audio/die/戴拿.mp3"],
					},
					佐菲: {
						sex: "male",
						group: "ao",
						hp: 4,
						skills: ["zfbaqi", "zfyakong", "atmnianli"],
						names: "null|佐菲",
						img: "extension/无名扩展/image/佐菲.jpg",
						dieAudios: ["ext:无名扩展/audio/die/佐菲.mp3"],
					},
					泰罗: {
						sex: "male",
						group: "ao",
						hp: 4,
						skills: ["tlpoquan", "tlzhadan", "atmnianli"],
						names: "null|泰罗",
						img: "extension/无名扩展/image/泰罗.jpg",
						dieAudios: ["ext:无名扩展/audio/die/泰罗.mp3"],
					},
					爻袁术: {
						sex: "male",
						group: "qun",
						hp: 4,
						skills: ["yaoyaoyi", "yaochenwei"],
						img: "extension/无名扩展/image/爻袁术.jpg",
						dieAudios: ["ext:无名扩展/audio/die/爻袁术.mp3"],
					},
					艾斯: {
						sex: "male",
						group: "ao",
						hp: 4,
						skills: ["asguangxian", "asduantou", "atmnianli"],
						names: "null|艾斯",
						img: "extension/无名扩展/image/艾斯.jpg",
						dieAudios: ["ext:无名扩展/audio/die/那位大人.mp3"],
					},
					赛文: {
						sex: "male",
						group: "ao",
						hp: 4,
						skills: ["swbingfu", "swxiongjia", "atmnianli"],
						names: "null|赛文",
						img: "extension/无名扩展/image/赛文.jpg",
						dieAudios: ["ext:无名扩展/audio/die/那位大人.mp3"],
					},
					至高盖亚: {
						sex: "male",
						group: "ao",
						hp: 4,
						skills: ["zggylianshuai", "zggyjili"],
						names: "null|盖亚",
						img: "extension/无名扩展/image/至高盖亚.jpg",
						dieAudios: ["ext:无名扩展/audio/die/那位大人.mp3"],
					},
					雷欧: {
						sex: "male",
						group: "ao_red",
						hp: 4,
						maxHp: 5,
						skills: ["leofenzhan", "leofeiti"],
						names: "null|雷欧",
						img: "extension/无名扩展/image/雷欧.jpg",
						dieAudios: ["ext:无名扩展/audio/die/那位大人.mp3"],
					},
					杰斯提斯: {
						sex: "none",
						group: "ao",
						hp: 4,
						skills: ["jstsfensui"],
						names: "null|杰斯提斯",
						img: "extension/无名扩展/image/杰斯提斯.jpg",
						dieAudios: ["ext:无名扩展/audio/die/那位大人.mp3"],
					},
					黄泉: {
						sex: "female",
						group: "shen",
						hp: 4,
						skills: ["hqchigui", "hqtize"],
						names: "雷电忘川守|芽衣",
						img: "extension/无名扩展/image/黄泉.jpg",
						dieAudios: ["ext:无名扩展/audio/die/黄泉.mp3"],
					},
					未遂: {
						sex: "female",
						group: "shen",
						hp: 3,
						skills: ["wsgucheng", "wsgeshi"],
						names: "符|图纳",
						img: "extension/无名扩展/image/未遂.jpg",
						dieAudios: ["ext:无名扩展/audio/die/未遂.mp3"],
					},
					爱迪: {
						sex: "male",
						group: "ao",
						hp: 4,
						skills: ["adkoudai", "adquanneng", "adjinghua"],
						names: "null|爱迪",
						img: "extension/无名扩展/image/爱迪.jpg",
						dieAudios: ["ext:无名扩展/audio/die/那位大人.mp3"],
					},
					阿斯特拉: {
						sex: "male",
						group: "ao_red",
						hp: 4,
						skills: ["astlqiuyv", "leofenzhan", "leofeiti"],
						names: "null|阿斯特拉",
						img: "extension/无名扩展/image/阿斯特拉.jpg",
						dieAudios: ["ext:无名扩展/audio/die/那位大人.mp3"],
					}
				},
				translate: {
					无名扩展: "无名扩展",
					普利茨墨: "普利茨墨",
					曼波: "曼波",
					哈基米: "哈基米",
					米浴: "米浴",
					安培拉星人: "安培拉星人",
					特别周: "特别周",
					黄金船: "黄金船",
					奈克瑟斯: "奈克瑟斯",
					芙宁娜芙卡洛斯: "芙宁娜芙卡洛斯",
					流萤: "流萤",
					大丽花: "大丽花",
					忘归人: "忘归人",
					灵砂: "灵砂",
					谋曹丕: "谋曹丕",
					那维莱特: "那维莱特",
					奥特之父: "奥特之父",
					阿蕾奇诺: "阿蕾奇诺",
					知更鸟: "知更鸟",
					丝柯克: "丝柯克",
					云璃: "云璃",
					奥特之王: "奥特之王",
					遐蝶: "遐蝶",
					死龙: "死龙",
					目白麦昆: "目白麦昆",
					闪耀迪迦: "闪耀迪迦",
					迪迦: "迪迦",
					黑暗迪迦: "黑暗迪迦",
					赛迦: "赛迦",
					希卡利: "希卡利",
					芙宁娜: "芙宁娜",
					杰克: "杰克",
					奥特曼: "奥特曼",
					恰斯卡: "恰斯卡",
					玛薇卡: "玛薇卡",
					希诺宁: "希诺宁",
					加坦杰厄: "加坦杰厄",
					伊格尼兹: "伊格尼兹",
					戴拿: "戴拿",
					佐菲: "佐菲",
					泰罗: "泰罗",
					爻袁术: "爻袁术",
					艾斯: "艾斯",
					赛文: "赛文",
					至高盖亚: "至高盖亚",
					雷欧: "雷欧",
					杰斯提斯: "杰斯提斯",
					黄泉: "黄泉",
					未遂: "未遂",
					爱迪: "爱迪",
					阿斯特拉: "阿斯特拉",

					闪耀迪迦_prefix: "闪耀",
					黑暗迪迦_prefix: "黑暗",
					谋曹丕_prefix: "谋",
					爻袁术_prefix: "爻",
					至高盖亚_prefix: "至高",
				},
				characterTitle: {
					普利茨墨: "光怪兽",
					曼波: "子右人间体",
					哈基米: "蜂蜜特饮",
					米浴: "向死而生",
					安培拉星人: "黑暗皇帝",
					特别周: "乡下马",
					奈克瑟斯: "光之纽带",
					芙宁娜芙卡洛斯: "罪人舞步旋",
					流萤: "为生而战",
					大丽花: "枯萎凋零",
					忘归人: "重获新生",
					灵砂: "宿香暗贮",
					谋曹丕: "魏文帝",
					那维莱特: "谕告的潮音",
					奥特之父: "宇宙警备队大队长",
					阿蕾奇诺: "孤暝厄月",
					知更鸟: "群星闪耀",
					丝柯克: "虚渊暗星",
					云璃: "猎剑士",
					奥特之王: "宇宙的守护者",
					遐蝶: "死荫的侍女",
					目白麦昆: "名门大小姐",
					闪耀迪迦: "人类的希望",
					迪迦: "光之巨人",
					黑暗迪迦: "暗之巨人",
					赛迦: "奇迹的战士",
					希卡利: "首席科学家",
					芙宁娜: "不休独舞",
					杰克: "归来的奥特曼",
					奥特曼: "初代奥特曼",
					恰斯卡: "巡宇翦定",
					玛薇卡: "焚夜以炎",
					希诺宁: "焮火铸魂",
					加坦杰厄: "黑暗支配者",
					伊格尼兹: "狂妄的伪神",
					戴拿: "星光战士",
					佐菲: "宇宙警备队队长",
					泰罗: "宇宙警备队总教官",
					爻袁术: "我怎么知道什么称号，官方又没出",
					艾斯: "光线之王",
					赛文: "传奇爱人王",
					至高盖亚: "撼地九式",
					雷欧: "孤独的雄狮",
					杰斯提斯: "绝对的正义",
					黄泉: "彼岸冥途",
					未遂: "异界的神使",
					爱迪: "负能量调查员",
					阿斯特拉: "漂泊的猛虎",
				},
				characterIntro: { ...characterIntros },
			},
			card: {
				card: {},
				translate: {},
				list: [],
			},
			skill: {
				skill: {
					plcmhuanjing: {
						audio: ["ext:无名扩展/audio/skill/huanjing"],
						trigger: {
							global: "judgeBegin",
						},
						filter() {
							return ui.cardPile.childNodes.length > 1;
						},
						async content(event, trigger, player) {
							const topCard = get.cards()[0];
							const bottomCard = get.bottomCards()[0];
							const cards = [topCard, bottomCard];
							let targetSuit = null;
							let evt = event.getParent();
							while (evt) {
								if (evt.name === "plcmlengjing") {
									if (evt.triggername === "useCardToBefore" || evt.triggername === "useCardToPlayered") {
										const trig = evt.getTrigger();
										if (trig?.card) {
											targetSuit = get.suit(trig.card);
											break;
										}
									}
								}
								evt = evt.parent;
							}
							if (targetSuit) {
								const topMatch = get.suit(topCard) === targetSuit;
								const bottomMatch = get.suit(bottomCard) === targetSuit;
								if (topMatch && !bottomMatch) {
									ui.cardPile.appendChild(bottomCard);
									game.cardsGotoPile(topCard, "insert");
									return;
								}
							}
							const str = '<div class="text center">牌堆顶/牌堆底</div>';
							const result = await player
								.chooseButton(["幻境：选择要获得的牌", str, cards], false)
								.set("ai", button => {
									const judgeFn = trigger.judge;
									if (typeof judgeFn !== "function") {
										return get.value(button.link, player);
									}
									const attitude = get.attitude(player, trigger.player);
									const desired = attitude > 0 ? 1 : attitude < 0 ? -1 : 0;
									const resultOf = card => ({
										card,
										name: card.name,
										number: get.number(card),
										suit: get.suit(card),
										color: get.color(card),
										node: card.node,
									});
									const benefit = card => desired * judgeFn(resultOf(card));
									const base = benefit(topCard);
									const nextCard = ui.cardPile.childNodes[0] || topCard;
									const cardVal = card => get.value(card, player) / 4;
									if (button.link === topCard) {
										return benefit(bottomCard) - base + cardVal(topCard);
									}
									return benefit(nextCard) - base + cardVal(bottomCard);
								})
								.forResult();
							if (result.bool) {
								const chosen = result.links[0];
								const isTop = chosen === topCard;
								if (isTop) {
									await player.gain(topCard, "draw");
									game.log(player, "获得了牌堆顶的一张牌");
									game.cardsGotoPile(bottomCard, "insert");
									game.log(player, "将", bottomCard, "置于了牌堆顶");
								} else {
									await player.gain(bottomCard, "gain2");
									game.log(player, "获得了牌堆底的一张牌");
									ui.cardPile.appendChild(topCard);
									game.log(player, "将", topCard, "置于了牌堆底");
								}
							} else {
								ui.cardPile.appendChild(bottomCard);
								game.cardsGotoPile(topCard, "insert");
								game.log("大家就当无事发生~(*^ω^*)");
							}
						},
						ai: {
							expose: 0.1,
							tag: {
								rejudge: 0.5,
							},
						},
					},
					plcmlengjing: {
						audio: ["ext:无名扩展/audio/skill/lengjing"],
						group: ["plcmlengjing_target"],
						trigger: {
							target: "useCardToTarget",
						},
						filter(event, player) {
							if (get.tag(event.card, "damage")) {
								return event.player !== player;
							}
							return false;
						},
						async content(event, trigger, player) {
							const targetSuit = get.suit(trigger.card);
							const result = await player
								.judge(card => {
									return get.suit(card) === targetSuit ? 10 : 0;
								})
								.set("judge2", result => result.suit === targetSuit)
								.forResult();
							if (result?.suit === targetSuit) {
								trigger.targets.remove(player);
								trigger.getParent().triggeredTargets2.remove(player);
								trigger.untrigger();
							}
						},
						ai: {
							effect: {
								target_use(card, player, target, current, isLink) {
									if (get.tag(card, "damage") || card?.name === "sha") {
										if (!isLink && player !== target) {
											return 0.5;
										}
									}
								},
							},
						},
						subSkill: {
							target: {
								audio: ["ext:无名扩展/audio/skill/lengjing"],
								trigger: {
									player: "useCardToPlayered",
								},
								filter(event, player) {
									if (event.player !== player) return false;
									if (event.target === player) return false;
									if (get.tag(event.card, "damage")) return false;
									return true;
								},
								async content(event, trigger, player) {
									const targetSuit = get.suit(trigger.card);
									const result = await player
										.judge(card => {
											return get.suit(card) === targetSuit ? 10 : 0;
										})
										.set("judge2", result => result.suit === targetSuit)
										.forResult();
									if (result?.suit === targetSuit) {
										trigger.directHit.add(trigger.target);
									}
								},
							},
						},
					},
					plcmjinghua: {
						audio: ["ext:无名扩展/audio/skill/jinghua"],
						forced: true,
						locked: false,
						trigger: { player: "useCardAfter" },
						filter(event, player) {
							if (!event.targets || event.targets.length === 0) return false;
							if (!lib.suit.includes(get.suit(event.card))) return false;
							const targets = event.targets.filter(target => target !== player && target.isAlive());
							return targets.some(target => {
								const hasResponded = target.hasHistory("useCard", evt => {
									return evt.respondTo && evt.respondTo[1] === event.card;
								});
								const hasResponded2 = target.hasHistory("respond", evt => {
									return evt.respondTo && evt.respondTo[1] === event.card;
								});
								return !hasResponded && !hasResponded2;
							});
						},
						async content(event, trigger, player) {
							const suit = get.suit(trigger.card);
							const targets = trigger.targets.filter(target => target !== player && target.isAlive());
							const unresponsedTargets = targets.filter(target => {
								if (!target.isAlive()) return false;
								const hasResponded = target.hasHistory("useCard", evt => {
									return evt.respondTo && evt.respondTo[1] === trigger.card;
								});
								const hasResponded2 = target.hasHistory("respond", evt => {
									return evt.respondTo && evt.respondTo[1] === trigger.card;
								});
								return !hasResponded && !hasResponded2;
							});
							if (unresponsedTargets.length === 0) return;
							for (const target of unresponsedTargets) {
								if (!target.isAlive()) continue;
								const dialog = ui.create.dialog(`晶化：对${get.translation(target)}发动，选择一项`, "hidden");
								dialog.add([
									[
										[1, "展示其手牌并获得与此牌相同花色的手牌和装备牌"],
										[2, "直到其下回合结束，其无法使用此花色的牌"],
									],
									"textbutton",
								]);
								const result = await player
									.chooseButton(dialog, true)
									.set("ai", button => {
										const choice = button.link;
										const knownCards = target.getCards("he").filter(card => card.isKnownBy(player));
										const knownSameSuit = knownCards.filter(card => get.suit(card) === suit).length;
										const totalHe = target.countCards("he");
										const estSameSuit = knownSameSuit + (totalHe - knownCards.length) / 4;
										const gainValue = estSameSuit * 2;
										if (choice === 1) return gainValue;
										const attitude = get.attitude(player, target);
										let banValue = 6;
										if (attitude < 0 && estSameSuit <= 1) banValue = 14;
										if (totalHe <= 2) banValue = 14;
										if (attitude >= 0) banValue = 1;
										return banValue;
									})
									.forResult();
								if (result.bool && result.links) {
									const choice = result.links[0];
									game.log(player, "对", target, "发动了【晶化】");
									if (choice === 1) {
										target.showHandcards();
										const targetHand = target.getCards("he");
										const sameSuitCards = targetHand.filter(card => get.suit(card) === suit);
										if (sameSuitCards.length > 0) {
											await player.gain(sameSuitCards, target);
											game.log(player, "获得了", target, `的${sameSuitCards.length}张`, get.translation(suit), "牌");
										}
									} else {
										target.addTempSkill("plcmjinghua_ban", { player: "phaseEnd" });
										target.markAuto("plcmjinghua_ban", [suit]);
										game.log(target, "无法使用", get.translation(suit), "牌直到其下回合结束");
									}
								}
							}
						},
						subSkill: {
							ban: {
								charlotte: true,
								mark: true,
								marktext: "晶",
								intro: {
									content(storage) {
										if (storage?.length > 0) {
											return `无法使用或打出${get.translation(storage)}牌`;
										}
										return "无法使用或打出特定花色的牌";
									},
								},
								init(player, skill) {
									const storage = player.getStorage(skill, []);
									if (storage.length) {
										player.addTip(skill, `晶化 限${get.translation(storage)}`);
									}
								},
								onremove(player, skill) {
									player.removeTip(skill);
									player.setStorage(skill, undefined);
								},
								mod: {
									cardEnabled(card, player) {
										if (player.getStorage("plcmjinghua_ban", []).includes(get.suit(card))) return false;
									},
									cardRespondable(card, player) {
										if (player.getStorage("plcmjinghua_ban", []).includes(get.suit(card))) return false;
									},
									cardSavable(card, player) {
										if (player.getStorage("plcmjinghua_ban", []).includes(get.suit(card))) return false;
									},
								},
							},
						},
					},
					mbmanbo: {
						audio: ["ext:无名扩展/audio/skill/manbo1", "ext:无名扩展/audio/skill/manbo2", "ext:无名扩展/audio/skill/manbo3"],
						group: ["mbmanbo_round"],
						trigger: { player: "damageEnd" },
						forced: true,
						check(event, player) {
							return true;
						},
						async content(event, trigger, player) {
							if (!_status.characterlist) game.initCharacterList();
							const obtainedSkills = player.getStorage("mbmanbo_skills", []);
							const availableList = _status.characterlist.filter(name => {
								const skills = lib.character[name]?.[3] || [];
								const validSkills = skills.filter(skill => {
									const info = get.info(skill);
									return info && !info.charlotte && !info.hiddenSkill && !player.hasSkill(skill);
								});
								return validSkills.length > 0;
							});
							const list = availableList.randomGets(3);
							if (list.length < 3) return;
							const result = await player
								.chooseButton(["曼波：选择一名角色", [list, "character"]], true)
								.set("ai", button => {
									const name = button.link;
									const skills = lib.character[name]?.[3] || [];
									const validSkills = skills.filter(skill => {
										const info = get.info(skill);
										return info && !info.charlotte && !info.hiddenSkill && !player.hasSkill(skill);
									});
									return validSkills.reduce((sum, skill) => sum + Math.max(get.skillRank(skill, "out"), get.skillRank(skill, "in")), 0);
								})
								.forResult();
							if (!result.bool || !result.links?.length) return;
							const chosen = result.links[0];
							const skills = lib.character[chosen]?.[3] || [];
							const validSkills = skills.filter(skill => {
								const info = get.info(skill);
								return info && !info.charlotte && !info.hiddenSkill && !player.hasSkill(skill);
							});
							if (validSkills.length === 0) return;
							const result2 = await player
								.chooseButton(["曼波：选择获得" + get.translation(chosen) + "的一个技能", [validSkills, "skill"]], true)
								.set("ai", button => get.skillRank(button.link, "inout"))
								.forResult();
							if (!result2.bool || !result2.links?.length) return;
							const skill = result2.links[0];
							player.popup(skill);
							await player.addSkills(skill);
							player.markAuto("mbmanbo_skills", [skill]);
						},
						subSkill: {
							round: {
								audio: ["ext:无名扩展/audio/skill/manbo1", "ext:无名扩展/audio/skill/manbo2", "ext:无名扩展/audio/skill/manbo3"],
								trigger: { global: ["roundStart", "roundEnd"] },
								forced: true,
								async content(event, trigger, player) {
									if (!_status.characterlist) game.initCharacterList();
									const obtainedSkills = player.getStorage("mbmanbo_skills", []);
									const availableList = _status.characterlist.filter(name => {
										const skills = lib.character[name]?.[3] || [];
										const validSkills = skills.filter(skill => {
											const info = get.info(skill);
											return info && !info.charlotte && !info.hiddenSkill && !player.hasSkill(skill);
										});
										return validSkills.length > 0;
									});
									const list = availableList.randomGets(3);
									if (list.length < 3) return;
									const result = await player
										.chooseButton(["曼波：选择一名角色", [list, "character"]], true)
										.set("ai", button => {
											const name = button.link;
											const skills = lib.character[name]?.[3] || [];
											const validSkills = skills.filter(skill => {
												const info = get.info(skill);
												return info && !info.charlotte && !info.hiddenSkill && !player.hasSkill(skill);
											});
											return validSkills.reduce((sum, skill) => sum + Math.max(get.skillRank(skill, "out"), get.skillRank(skill, "in")), 0);
										})
										.forResult();
									if (!result.bool || !result.links?.length) return;
									const chosen = result.links[0];
									const skills = lib.character[chosen]?.[3] || [];
									const validSkills = skills.filter(skill => {
										const info = get.info(skill);
										return info && !info.charlotte && !info.hiddenSkill && !player.hasSkill(skill);
									});
									if (validSkills.length === 0) return;
									const result2 = await player
										.chooseButton(["曼波：选择获得" + get.translation(chosen) + "的一个技能", [validSkills, "skill"]], true)
										.set("ai", button => get.skillRank(button.link, "inout"))
										.forResult();
									if (!result2.bool || !result2.links?.length) return;
									const skill = result2.links[0];
									player.popup(skill);
									await player.addSkills(skill);
									player.markAuto("mbmanbo_skills", [skill]);
								},
							},
						},
					},
					hjmhaqi: {
						audio: ["ext:无名扩展/audio/skill/haqi1", "ext:无名扩展/audio/skill/haqi2", "ext:无名扩展/audio/skill/haqi3"],
						group: ["hjmhaqi_phaseDraw"],
						mark: true,
						marktext: "哈",
						intro: {
							name: "哈气",
							content(storage, player) {
								const b = player.getStorage("haqi_draw", 0);
								const c = player.getStorage("haqi_max", 0);
								const d = player.getStorage("haqi_sha", 0);
								return "·摸牌阶段多摸" + b + "张牌<br>·手牌上限+" + c + "<br>·出牌阶段可多出" + d + "张【杀】";
							},
						},
						trigger: { global: ["damageSource", "damageEnd"] },
						forced: true,
						filter(event) {
							return event.num > 0;
						},
						async content(event, trigger, player) {
							const num = trigger.num;
							let count = player.getStorage("haqi_count", 0);
							for (let i = 0; i < num; i++) {
								count++;
								player.setStorage("haqi_count", count, true);
								switch (count % 6) {
									case 0:
										player.setStorage("haqi_max", player.getStorage("haqi_max", 0) + 1, true);
										break;
									case 1:
										await player.draw();
										break;
									case 2:
										player.setStorage("haqi_draw", player.getStorage("haqi_draw", 0) + 1, true);
										break;
									case 3:
										await player.recover();
										break;
									case 4:
										await player.gainMaxHp();
										break;
									case 5:
										player.setStorage("haqi_sha", player.getStorage("haqi_sha", 0) + 1, true);
										break;
								}
							}
						},
						subSkill: {
							phaseDraw: {
								mod: {
									maxHandcard(player, current) {
										return current + player.getStorage("haqi_max", 0);
									},
									cardUsable(card, player, num) {
										if (card.name === "sha") return num + player.getStorage("haqi_sha", 0);
									},
								},
								trigger: { player: "phaseDrawBegin" },
								forced: true,
								filter(event, player) {
									return player.getStorage("haqi_draw", 0) > 0;
								},
								async content(event, trigger, player) {
									trigger.num += player.getStorage("haqi_draw", 0);
								},
							},
						},
					},
					myjuesheng: {
						audio: ["ext:无名扩展/audio/skill/juesheng"],
						trigger: { player: ["useCardAfter", "respondAfter"] },
						forced: true,
						locked: false,
						filter(event, player) {
							if (!event.card) return false;
							const cardType = get.type(event.card, null, false);
							const cardName = event.card.name;
							const dict = player.getStorage("juesheng_records_dict", {});
							if (cardType === "equip" || cardType === "delay") {
								return true;
							}
							return !Object.hasOwn(dict, cardName);
						},
						async content(event, trigger, player) {
							const cardType = get.type(trigger.card, null, false);
							if (cardType === "equip" || cardType === "delay") {
								await player.draw(1);
								return;
							}
							const cardName = trigger.card.name;
							const dict = player.getStorage("juesheng_records_dict", {});
							if (!Object.hasOwn(dict, cardName)) {
								dict[cardName] = 0;
								player.setStorage("juesheng_records_dict", dict, true);
								game.log(player, "记录了牌名【" + get.translation(cardName) + "】");
							}
							await player.draw(1);
						},
						mark: true,
						marktext: "决",
						markcount(storage, player) {
							return Object.keys(player.getStorage("juesheng_records_dict", {})).length;
						},
						intro: {
							content(storage, player) {
								const dict = player.getStorage("juesheng_records_dict", {});
								const records = Object.keys(dict);
								if (records.length > 0) {
									return "已记录的牌：" + records.map(name => get.translation(name)).join("、");
								}
								return "未记录牌名";
							},
						},
						group: ["myjuesheng_respond", "myjuesheng_reset"],
						subSkill: {
							reset: {
								trigger: { global: "phaseAfter" },
								forced: true,
								charlotte: true,
								filter(event, player) {
									return player.getStorage("juesheng_used", false) === true;
								},
								async content(event, trigger, player) {
									const dict = player.getStorage("juesheng_records_dict", {});
									for (const name in dict) {
										dict[name] = 0;
									}
									player.setStorage("juesheng_records_dict", dict, true);
									player.setStorage("juesheng_used", false, true);
									game.log(player, "决生：回合结束，重置使用记录");
								},
							},
							respond: {
								enable: ["phaseUse", "chooseToUse", "chooseToRespond"],
								hiddenCard(player, name) {
									const dict = player.getStorage("juesheng_records_dict", {});
									return Object.hasOwn(dict, name) && dict[name] === 0;
								},
								filter(event, player) {
									const dict = player.getStorage("juesheng_records_dict", {});
									if (!dict || Object.keys(dict).length === 0) return false;
									for (const name in dict) {
										if (dict[name] !== 0) continue;
										const card = { name: name, isCard: true };
										if (event.name === "phaseUse") {
											if (player.hasUseTarget(card)) return true;
										} else if (event.name === "chooseToRespond") {
											if (event.filterCard?.(card, player, event)) return true;
										} else if (event.filterCard?.(card, player, event)) {
											return true;
										}
									}
									return false;
								},
								chooseButton: {
									dialog(event, player) {
										const dict = player.getStorage("juesheng_records_dict", {});
										const list = [];
										for (const name in dict) {
											if (dict[name] !== 0) continue;
											const card = { name: name, isCard: true };
											let canUse = false;
											if (event.name === "phaseUse") {
												canUse = player.hasUseTarget(card);
											} else if (event.filterCard) {
												canUse = event.filterCard(card, player, event);
											}
											if (canUse) {
												const cardType = get.type2(card);
												const typeText = cardType === "basic" ? "基本牌" : cardType === "trick" ? "锦囊" : "装备";
												list.push([typeText, "", name]);
											}
										}
										return ui.create.dialog("决生", [list, "vcard"], "hidden");
									},
									filter(button, player) {
										const evt = get.event().getParent();
										const card = { name: button.link[2], isCard: true };
										if (evt.name === "phaseUse") {
											return player.hasUseTarget(card);
										}
										return evt.filterCard?.(card, player, evt) ?? false;
									},
									check(button) {
										const player = get.player();
										const evt = get.event().getParent();
										if (evt?.name === "chooseToRespond") return true;
										if (evt?.type === "dying" && evt.dying) {
											const attitude = get.attitude(player, evt.dying);
											if (attitude <= 0) return -10;
											return true;
										}
									},
									backup(links, player) {
										return {
											audio: ["ext:无名扩展/audio/skill/juesheng"],
											filterCard() {
												return false;
											},
											selectCard: -1,
											viewAs: { name: links[0][2], isCard: true },
											popname: true,
											log: false,
											precontent() {
												const p = get.player();
												const name = get.event().result.card.name;
												const dict = p.getStorage("juesheng_records_dict", {});
												if (Object.hasOwn(dict, name)) {
													dict[name] = 1;
													p.setStorage("juesheng_records_dict", dict, true);
												}
												p.setStorage("juesheng_used", true, true);
												p.logSkill("myjuesheng");
												game.log(p, "发动决生，视为使用了【" + get.translation(name) + "】");
											},
										};
									},
									prompt(links, player) {
										return "选择【" + get.translation(links[0][2]) + "】的目标";
									},
								},
								ai: {
									order: 9,
									result: {
										player(player) {
											return 1;
										},
									},
								},
							},
						},
					},
					aplxiongye: {
						forced: true,
						audio: ["ext:无名扩展/audio/skill/xiongye1", "ext:无名扩展/audio/skill/xiongye2"],
						trigger: { global: ["damageBegin2", "damageBegin4"] },
						filter(event, player, triggerName) {
							if (triggerName === "damageBegin2" && event.source === player && event.player !== player) return true;
							if (triggerName === "damageBegin4" && event.player === player && event.source && event.source !== player) return true;
							return false;
						},
						async content(event, trigger, player) {
							const num = trigger.num;
							const cards = get.cards(num * 3);
							for (const card of cards) {
								card.classList.add("glory2");
							}
							const next = player.addToExpansion(cards, player, "give");
							next.gaintag.add("aplxiongye");
							await next;
							player.markSkill("aplxiongye");
							game.log(player, "将牌堆顶的" + num * 3 + "张牌扣置于武将牌上，称为“野”");
						},
						marktext: "野",
						intro: {
							name: "野",
							markcount: "expansion",
							mark(dialog, storage, player) {
								const cards = player.getExpansions("aplxiongye");
								if (player.isUnderControl(true)) dialog.addAuto(cards);
								else return "共有" + cards.length + "张“野”牌";
							},
						},
						async onremove(player, skill) {
							const cards = player.getExpansions("aplxiongye");
							if (cards.length) {
								await player.loseToDiscardpile(cards);
							}
						},
						mod: {
							aiOrder(player, card, num) {
								if (get.itemtype(card) === "card" && card.hasGaintag("aplxiongye")) {
									return num + 0.5;
								}
							},
						},
						group: ["aplxiongye_use"],
						subSkill: {
							use: {
								enable: ["phaseUse", "chooseToUse", "chooseToRespond"],
								hiddenCard(player, name) {
									if (!["wuxie", "tao", "jiu"].includes(name)) return false;
									const cards = player.getExpansions("aplxiongye");
									return cards.some(card => card.name === name);
								},
								filter(event, player) {
									const cards = player.getExpansions("aplxiongye");
									if (cards.length === 0) return false;
									for (const card of cards) {
										if (event.name === "phaseUse") {
											if (player.hasUseTarget(card)) return true;
										} else if (event.type === "wuxie") {
											if (card.name === "wuxie") return true;
										} else if (event.type === "dying") {
											if (card.name === "tao" || card.name === "jiu") return true;
										} else if (event.filterCard?.(card, player, event)) {
											return true;
										}
									}
									return false;
								},
								chooseButton: {
									dialog(event, player) {
										const cards = player.getExpansions("aplxiongye");
										const usableCards = [];
										for (const card of cards) {
											let canUse = false;
											if (event.name === "phaseUse") {
												canUse = player.hasUseTarget(card);
												if (canUse && card.name === "jiedaosharen") {
													canUse = game.hasPlayer(p => lib.filter.targetEnabled2(card, player, p));
												}
											} else if (event.type === "wuxie") {
												canUse = card.name === "wuxie";
											} else if (event.type === "dying") {
												canUse = card.name === "tao" || card.name === "jiu";
											} else if (event.filterCard) {
												canUse = event.filterCard(card, player, event);
											}
											if (canUse) usableCards.push(card);
										}
										const dialog = ui.create.dialog("雄野：选择一张牌");
										if (usableCards.length > 0) {
											dialog.add(usableCards);
										}
										return dialog;
									},
									filter(button, player) {
										const evt = get.event().getParent();
										const card = button.link;
										if (evt.name === "phaseUse") {
											let canUse = player.hasUseTarget(card);
											if (canUse && card.name === "jiedaosharen") {
												canUse = game.hasPlayer(p => lib.filter.targetEnabled2(card, player, p));
											}
											return canUse;
										} else if (evt.type === "wuxie") {
											return card.name === "wuxie";
										} else if (evt.type === "dying") {
											return card.name === "tao" || card.name === "jiu";
										}
										return evt.filterCard?.(card, player, evt) ?? false;
									},
									check(button) {
										const player = get.player();
										const card = button.link;
										const evt = get.event().getParent();
										if (evt.type === "dying" && evt.dying) {
											const attitude = get.attitude(player, evt.dying);
											if (attitude <= 0) return -10;
											return 5 + attitude;
										}
										return player.getUseValue(card);
									},
									backup(links, player) {
										const card = links[0];
										return {
											filterCard(c) {
												return c === card;
											},
											selectCard: -1,
											position: "x",
											viewAs: card,
											popname: true,
											card: card,
										};
									},
									prompt(links, player) {
										return "选择" + get.translation(links[0]) + "的目标";
									},
								},
								ai: {
									order: 10,
									result: {
										player(player) {
											return 1;
										},
										target(player, target) {
											const evt = get.event();
											if (evt.dying && evt.dying === target) {
												return get.attitude(player, target) > 0 ? 5 : -10;
											}
											return 0;
										},
									},
									respondSha: true,
									respondShan: true,
									respondWuxie: true,
									save: true,
									skillTagFilter(player, tag, arg) {
										const cards = player.getExpansions("aplxiongye");
										let name;
										if (tag === "respondSha") name = "sha";
										else if (tag === "respondShan") name = "shan";
										else if (tag === "respondWuxie") name = "wuxie";
										else if (tag === "save") name = "tao";
										else return false;
										return cards.some(card => card.name === name);
									},
								},
							},
						},
					},
					aplaojie: {
						mod: {
							cardEnabled(card, player) {
								if (card.name === "shan") return false;
							},
							cardRespondable(card, player) {
								if (card.name === "shan") return false;
							},
							cardSavable(card, player) {
								if (card.name === "shan") return false;
							},
						},
					},
					tbznengchi: {
						forced: true,
						trigger: {
							player: ["loseAfter", "disableEquipAfter", "enableEquipAfter"],
							global: ["equipAfter", "addJudgeAfter", "gainAfter", "loseAsyncAfter", "addToExpansionAfter"],
						},
						onremove: true,
						ai: {
							equipValue(card, player) {
								if (get.type2(card) !== "equip") return 0;
								const subtype = get.subtype(card);
								if (subtype === "equip3" || subtype === "equip4") return 100;
								const cardName = get.name(card);
								const storage = player.getStorage("tbznengchi_mark") ?? [];
								return storage.includes(cardName) ? 0 : 100;
							},
						},
						filter(event, player) {
							if (event.name === "disableEquip" || event.name === "enableEquip") return true;
							if (event.name === "equip" && event.player === player) {
								const card = event.card;
								if (!card) return false;
								const cardName = get.name(card);
								if (cardName === "muniu") return false;
								const info = get.info(card);
								return info?.skills?.length > 0 || !!info?.distance || get.subtype(card) === "equip1";
							}
							const evt = event.getl(player);
							if (!evt?.es?.length) return false;
							return evt.es.some(card => {
								const cardName = get.name(card);
								if (cardName === "muniu") return false;
								const info = get.info(card);
								return info?.skills?.length > 0 || !!info?.distance || get.subtype(card) === "equip1";
							});
						},
						async content(event, trigger, player) {
							if (trigger.name === "equip" && trigger.player === player) {
								const card = trigger.card;
								const cardName = get.name(card);
								if (cardName === "muniu") return;
								const info = get.info(card);
								const subtype = get.subtype(card);
								if (info?.distance && (subtype === "equip3" || subtype === "equip4")) {
									const dist = player.getStorage("tbznengchi_distance", { globalTo: 0, globalFrom: 0 });
									if (info.distance.globalTo) {
										dist.globalTo += info.distance.globalTo;
										game.log(player, "获得了加一马效果，其他角色计算与你的距离+" + info.distance.globalTo);
									}
									if (info.distance.globalFrom) {
										dist.globalFrom += info.distance.globalFrom;
										game.log(player, "获得了减一马效果，你计算与其他角色的距离" + info.distance.globalFrom);
									}
									player.setStorage("tbznengchi_distance", dist);
								}
								if (subtype === "equip1") {
									let attackRange = 1;
									if (typeof info?.distance?.attackRange === "function") {
										attackRange = info.distance.attackRange(card, player);
									} else if (typeof info?.distance?.attackFrom === "number") {
										attackRange = 1 - info.distance.attackFrom;
									}
									const currentRange = player.getStorage("tbznengchi_attackRange", 0);
									player.setStorage("tbznengchi_attackRange", currentRange + attackRange);
									game.log(player, "获得了攻击范围+" + attackRange + "的效果");
								}
								if (info?.skills?.length > 0) {
									const storage = player.getStorage("tbznengchi_mark") ?? [];
									if (!storage.includes(cardName)) {
										player.markAuto("tbznengchi_mark", [cardName]);
									}
									game.log(player, "获得了装备【" + get.translation(card) + "】的效果");
								}
								player.markSkill("tbznengchi_mark");
							}
							const storage = player.getStorage("tbznengchi_mark") ?? [];
							const skills = [];
							for (const cardName of storage) {
								if (cardName === "muniu") continue;
								const card = { name: cardName };
								const info = get.info(card);
								if (info?.skills) {
									for (const skill of info.skills) {
										if (!skills.includes(skill)) {
											skills.push(skill);
										}
									}
								}
							}
							if (skills.length > 0) {
								player.addSkill(skills);
							}
						},
						mod: {
							globalTo(from, to, distance) {
								const dist = to.getStorage("tbznengchi_distance", { globalTo: 0, globalFrom: 0 });
								if (dist.globalTo) {
									return distance + dist.globalTo;
								}
							},
							globalFrom(from, to, distance) {
								const dist = from.getStorage("tbznengchi_distance", { globalTo: 0, globalFrom: 0 });
								if (dist.globalFrom) {
									return distance + dist.globalFrom;
								}
							},
							attackRange(player, num) {
								const attackRange = player.getStorage("tbznengchi_attackRange", 0);
								if (attackRange > 0) {
									return num + attackRange;
								}
							},
							aiOrder(player, card, num) {
								if (get.itemtype(card) === "card" && get.type2(card) === "equip") {
									const cardName = get.name(card);
									const storage = player.getStorage("tbznengchi_mark") ?? [];
									if (!storage.includes(cardName)) {
										return num + 5;
									}
								}
							},
							aiValue(player, card, num) {
								if (get.itemtype(card) === "card" && get.type2(card) === "equip") {
									const cardName = get.name(card);
									const storage = player.getStorage("tbznengchi_mark") ?? [];
									if (!storage.includes(cardName)) {
										return num + 8;
									}
								}
							},
						},
						group: ["tbznengchi_draw"],
						subSkill: {
							draw: {
								audio: ["ext:无名扩展/audio/skill/nengchi"],
								trigger: { player: "phaseUseBegin" },
								forced: true,
								async content(event, trigger, player) {
									player.logSkill("tbznengchi_draw");
									const cards = [];
									for (let i = 0; i < 3; i++) {
										const card = get.cardPile(card => get.type2(card) === "equip" && !cards.includes(card));
										if (card) cards.push(card);
									}
									if (cards.length > 0) {
										await player.gain(cards, "gain2");
										game.log(player, "从牌堆或弃牌堆获得了" + cards.length + "张装备牌");
									} else {
										game.log("牌堆和弃牌堆中没有装备牌");
									}
								},
							},
							mark: {
								mark: true,
								marktext: "装",
								intro: {
									content(storage, player) {
										const s = player.getStorage("tbznengchi_mark") ?? [];
										const dist = player.getStorage("tbznengchi_distance", { globalTo: 0, globalFrom: 0 });
										const attackRange = player.getStorage("tbznengchi_attackRange", 0);
										let str = "";
										if (attackRange > 0) {
											str += "攻击范围+" + attackRange;
										}
										if (dist.globalTo > 0) {
											if (str.length > 0) str += "<br>";
											str += "其他角色与你的距离+" + dist.globalTo;
										}
										if (dist.globalFrom < 0) {
											if (str.length > 0) str += "<br>";
											str += "你与其他角色的距离" + dist.globalFrom;
										}
										if (s.length > 0) {
											if (str.length > 0) str += "<br>";
											str += "已获得以下装备的效果：";
											for (const name of s) {
												str += "<br>【" + get.translation(name) + "】";
											}
										}
										return str.length === 0 ? "暂无装备效果" : str;
									},
								},
								onremove: true,
							},
						},
					},
					hjcsuixin: {
						audio: ["ext:无名扩展/audio/skill/suixin1", "ext:无名扩展/audio/skill/suixin2"],
						trigger: { global: ["phaseBegin", "phaseEnd"] },
						frequent: true,
						async content(event, trigger, player) {
							player.logSkill("hjcsuixin");
							const num = game.countPlayer() + 1;
							const cards = get.cards(num);
							game.cardsGotoOrdering(cards);
							const result = await player
								.chooseToMove("allowChooseAll")
								.set("list", [["牌堆顶", cards], ["牌堆底"], ["获得"]])
								.set("prompt", "随心：获得一张牌，将其余牌以任意顺序置于牌堆顶或牌堆底")
								.set("filterOk", moved => moved[2].length === 1)
								.set("forced", true)
								.set("filterMove", (from, to, moved) => {
									if (moved[0].includes(from.link) || moved[1].includes(from.link)) {
										if (typeof to === "number") {
											return to === 0 || to === 1 || !moved[2].length;
										}
										return true;
									}
									if (typeof to === "number") {
										return to === 0 || to === 1;
									}
									return true;
								})
								.set("processAI", list => {
									const p = get.event().player;
									const cs = list[0][1].slice(0);
									if (cs?.length) {
										const card = cs.maxBy(c => get.value(c, p));
										cs.remove(card);
										return [cs, [], [card]];
									}
									return [cs, [], []];
								})
								.forResult();
							if (result.bool && result.moved) {
								const top = result.moved[0].reverse();
								const bottom = result.moved[1];
								const gains = result.moved[2];
								if (top?.length) {
									for (const card of top) {
										ui.cardPile.insertBefore(card, ui.cardPile.firstChild);
									}
								}
								if (bottom?.length) {
									for (const card of bottom) {
										ui.cardPile.appendChild(card);
									}
								}
								if (gains?.length) {
									await player.gain(gains, "gain2");
								}
							}
						},
						ai: {
							threaten: 1.2,
							guanxing: true,
						},
					},
					nkssjicheng: {
						trigger: { source: "damageAfter", player: "phaseUseBegin" },
						direct: true,
						derivation: ["nksslingyu", "nkssguangshi"],
						filter(event, player) {
							return !player.hasSkill("nksslingyu") || !player.hasSkill("nkssguangshi");
						},
						async content(event, trigger, player) {
							const gained = ["nksslingyu", "nkssguangshi"].find(skill => !player.hasSkill(skill));
							if (!gained) return;
							player.logSkill("nkssjicheng");
							const count = player.getStorage("nkssjicheng_count", 0);
							player.setStorage("nkssjicheng_count", count + 1);
							player.changeSkin("nkssjicheng", count === 0 ? "奈克瑟斯-青年型" : "奈克瑟斯-蓝色青年型");
							await player.addSkills(gained);
							await player.gainMaxHp(1);
							await player.recover();
							await player.draw();
						},
						group: ["nkssjicheng_die"],
						subSkill: {
							die: {
								trigger: { player: "dieBefore" },
								filter(event, player) {
									return game.hasPlayer(target => target !== player && target.isAlive());
								},
								async content(event, trigger, player) {
									const result = await player
										.chooseTarget(true, "选择一名其他角色继承", (card, player, target) => {
											return target !== player && target.isAlive();
										})
										.set("ai", target => get.attitude(player, target))
										.forResult();
									if (result.bool && result.targets?.length > 0) {
										const target = result.targets[0];
										const gained = ["nksslingyu", "nkssguangshi"].filter(skill => player.hasSkill(skill));
										await target.addSkills(gained.concat("nkssjicheng"));
									}
								},
							},
						},
					},
					nksslingyu: {
						usable: 1,
						direct: true,
						locked: false,
						enable: "phaseUse",
						multiline: true,
						multitarget: true,
						allowChooseAll: true,
						filterTarget(card, player, target) {
							return target !== player && !target.hasMark("nksslingyu_meita_mark");
						},
						selectTarget: [1, Infinity],
						async content(event, trigger, player) {
							game.playSkillBgm("nksslingyu");
							for (const target of event.targets) {
								target.addMark("nksslingyu_meita_mark", 1);
								target.addSkill("nksslingyu_meita_distance");
								target.addSkill("nksslingyu_meita_damage");
							}
							player.addTempSkill("nksslingyu_unlimited");
							player.logSkill("nksslingyu");
							game.log(player, "令", event.targets, "获得了“美塔”标记");
						},
						ai: {
							order(skill, player) {
								if (player.hasCard(card => get.tag(card, "damage"), "h")) {
									return 10;
								}
								return 0;
							},
							result: {
								player(player) {
									if (player.hasCard(card => get.tag(card, "damage"), "h")) {
										return 5;
									}
									if (player.hp > 2) return 1;
									return 0;
								},
								target(player, target) {
									return -1;
								},
							},
						},
						group: ["nksslingyu_distance", "nksslingyu_draw", "nksslingyu_clean"],
						global: "nksslingyu_blocker",
						subSkill: {
							distance: {
								mod: {
									targetInRange(card, player, target) {
										if (target.hasMark("nksslingyu_meita_mark")) return true;
									},
									globalFrom(from, to, distance) {
										if (to.hasMark("nksslingyu_meita_mark") || from.hasSkill("nksslingyu")) return 1 - distance;
									},
									playerEnabled(card, player, target) {
										if (player === target) return;
										if (game.hasPlayer(current => current.hasMark("nksslingyu_meita_mark"))) {
											if (!target.hasMark("nksslingyu_meita_mark")) return false;
										}
									},
								},
							},
							unlimited: {
								mod: {
									cardUsable(card) {
										if (card && card.name === "sha") return Infinity;
									},
								},
							},
							draw: {
								forced: true,
								trigger: { global: "drawBegin" },
								filter(event, player) {
									return event.player?.hasMark("nksslingyu_meita_mark");
								},
								async content(event, trigger, player) {
									trigger.num--;
								},
							},
							clean: {
								trigger: { player: "phaseBegin" },
								forced: true,
								silent: true,
								popup: false,
								async content(event, trigger, player) {
									game.countPlayer(current => {
										if (current.hasMark("nksslingyu_meita_mark")) {
											current.removeMark("nksslingyu_meita_mark", current.countMark("nksslingyu_meita_mark"));
											current.removeSkill("nksslingyu_meita_distance");
											current.removeSkill("nksslingyu_meita_damage");
										}
									});
									game.log("所有“美塔”标记已被移除");
								},
							},
							blocker: {
								mod: {
									targetEnabled(card, player, target) {
										if (player === target) return;
										if (!game.hasPlayer(current => current.hasSkill("nksslingyu"))) return;
										if (!game.hasPlayer(current => current.hasMark("nksslingyu_meita_mark"))) return;
										if (player.hasSkill("nksslingyu")) {
											if (!target.hasMark("nksslingyu_meita_mark") && !target.hasSkill("nksslingyu")) return false;
										} else if (player.hasMark("nksslingyu_meita_mark")) {
											if (!target.hasSkill("nksslingyu") && !target.hasMark("nksslingyu_meita_mark")) return false;
										} else {
											if (target.hasSkill("nksslingyu") || target.hasMark("nksslingyu_meita_mark")) return false;
										}
									},
									cardSavable(card, player, target) {
										if (player === target) return;
										if (!game.hasPlayer(current => current.hasSkill("nksslingyu"))) return;
										if (!game.hasPlayer(current => current.hasMark("nksslingyu_meita_mark"))) return;
										if (player.hasSkill("nksslingyu")) {
											if (!target.hasMark("nksslingyu_meita_mark") && !target.hasSkill("nksslingyu")) return false;
										} else if (player.hasMark("nksslingyu_meita_mark")) {
											if (!target.hasSkill("nksslingyu") && !target.hasMark("nksslingyu_meita_mark")) return false;
										} else {
											if (target.hasSkill("nksslingyu") || target.hasMark("nksslingyu_meita_mark")) return false;
										}
									},
								},
							},
							meita_distance: {
								charlotte: true,
								mod: {
									targetInRange(card, player, target) {
										if (target.hasMark("nksslingyu_meita_mark") || target.hasSkill("nksslingyu")) return true;
									},
									globalFrom(from, to, distance) {
										if ((from.hasMark("nksslingyu_meita_mark") && (to.hasMark("nksslingyu_meita_mark") || to.hasSkill("nksslingyu"))) || (from.hasSkill("nksslingyu") && to.hasMark("nksslingyu_meita_mark"))) {
											return 1 - distance;
										}
									},
									globalTo(from, to, distance) {
										if ((to.hasMark("nksslingyu_meita_mark") && (from.hasMark("nksslingyu_meita_mark") || from.hasSkill("nksslingyu"))) || (to.hasSkill("nksslingyu") && from.hasMark("nksslingyu_meita_mark"))) {
											return 1 - distance;
										}
									},
								},
							},
							meita_damage: {
								charlotte: true,
								forced: true,
								trigger: { player: "damageBegin1" },
								filter(event, player) {
									return player.hasMark("nksslingyu_meita_mark");
								},
								async content(event, trigger, player) {
									trigger.num++;
								},
							},
							meita_mark: {
								mark: true,
								marktext: "塔",
								intro: {
									name: "美塔",
									content: "已拥有美塔标记",
								},
							},
						},
					},
					nkssguangshi: {
						trigger: { player: "useCardAfter" },
						forced: true,
						filter(event, player) {
							return player.countMark("nkssguangshi_shi") < 2;
						},
						async content(event, trigger, player) {
							player.addMark("nkssguangshi_shi", 1);
						},
						group: ["nkssguangshi_use"],
						subSkill: {
							use: {
								enable: "phaseUse",
								usable: 1,
								filterTarget(card, player, target) {
									return target !== player && lib.filter.targetEnabled({ name: "sha" }, player, target);
								},
								selectTarget: 1,
								prompt(event, player) {
									return "弃置所有“矢”标记，视为使用一张伤害数为" + player.countMark("nkssguangshi_shi") + "的【杀】";
								},
								async content(event, trigger, player) {
									player.logSkill("nkssguangshi");
									const num = player.countMark("nkssguangshi_shi");
									player.removeMark("nkssguangshi_shi", num);
									const vcard = new lib.element.VCard({ name: "sha" });
									const next = player.useCard(vcard, event.targets[0], false);
									next.baseDamage = num;
								},
								ai: {
									order: 8,
									result: {
										target(player, target) {
											const num = player.countMark("nkssguangshi_shi") || 1;
											return get.effect(target, { name: "sha" }, player, player) * num;
										},
									},
								},
							},
							shi: {
								mark: true,
								marktext: "矢",
								intro: {
									name: "矢",
									markcount(storage, player) {
										return player.countMark("nkssguangshi_shi");
									},
									mark(dialog, storage, player) {
										dialog.addText("矢标记：" + player.countMark("nkssguangshi_shi") + "枚（至多两枚）");
									},
								},
							},
						},
					},
					ffshenqu: {
						audio: ["ext:无名扩展/audio/skill/shenqu1", "ext:无名扩展/audio/skill/shenqu2"],
						trigger: { player: "dying" },
						forced: true,
						async content(event, trigger, player) {
							if (player.maxHp > 3) await player.loseMaxHp(player.maxHp - 3);
							if (player.maxHp < 3) await player.gainHp(3 - player.maxHp);
							const num = 3 - player.hp;
							if (num > 0) await player.recover(num);
						},
						ai: {
							halfneg: true,
							effect: {
								target(card, player, target) {
									if (target.hasSkill("ffshenqu") && get.tag(card, "damage")) {
										if (get.attitude(player, target) < 0) return [0.85, 1];
									}
								},
							},
						},
					},
					ffshenpan: {
						dutySkill: true,
						derivation: ["ffguqi", "ffsongshi"],
						group: ["ffshenpan_main", "ffshenpan_target", "ffshenpan_targeted", "ffshenpan_round", "ffshenpan_achieve", "ffshenpan_fail", "ffshenpan_die"],
						subSkill: {
							main: {
								trigger: { global: "useCardAfter" },
								forced: true,
								filter(event, player) {
									if (!event.targets?.length) return false;
									const source = event.player;
									if (!source) return false;
									return event.targets.some(t => t !== source);
								},
								async content(event, trigger, player) {
									const isRealCard = card => {
										if (!card) return false;
										if (card.isCard === false) return false;
										if (card.cards?.length === 0) return false;
										return true;
									};
									const cards = [];
									if (trigger.cards?.length) {
										for (const c of trigger.cards) {
											if (isRealCard(c)) cards.push(c);
										}
									}
									if (trigger.card?.cards?.length) {
										for (const c of trigger.card.cards) {
											if (!cards.includes(c) && isRealCard(c)) cards.push(c);
										}
									}
									const respondedCards = [];
									const targets = trigger.targets;
									for (const target of targets) {
										if (!target) continue;
										const history1 = target.getHistory("useCard", evt => evt.respondTo?.[1] === trigger.card);
										for (const h of history1) {
											if (h?.cards) {
												for (const c of h.cards) {
													if (isRealCard(c)) respondedCards.push(c);
												}
											}
										}
										const history2 = target.getHistory("respond", evt => evt.respondTo?.[1] === trigger.card);
										for (const h of history2) {
											if (h?.cards) {
												for (const c of h.cards) {
													if (isRealCard(c)) respondedCards.push(c);
												}
											}
										}
									}
									const allCards = cards.concat(respondedCards);
									if (allCards.length === 0) return;
									let num = 0;
									for (const card of allCards) {
										const number = get.number(card, false);
										if (number > 0) num += number;
									}
									for (const c of allCards) c.classList.add("glory2");
									const next = player.addToExpansion(allCards, "gain2");
									next.gaintag.add("ffshenpan_lvchang");
									await next;
									game.log(player, "将", allCards.length, "张牌扣置于武将牌上，称为“律偿”牌");
									player.markSkill("ffshenpan_lvchang");
									if (num > 0) {
										player.addMark("ffshenpan_wu", num);
										player.markSkill("ffshenpan_wu");
									}
								},
							},
							target: {
								trigger: { player: "useCard1" },
								charlotte: true,
								forced: true,
								filter(event, player) {
									return event.targets?.length > 0;
								},
								async content(event, trigger, player) {
									if (trigger.targets?.length) {
										for (const t of trigger.targets) {
											player.markAuto("ffshenpan_target", [t]);
										}
									}
								},
							},
							targeted: {
								trigger: { target: "useCardToTargeted" },
								charlotte: true,
								forced: true,
								filter(event, player) {
									return event.player !== player;
								},
								async content(event, trigger, player) {
									player.markAuto("ffshenpan_targeted", [trigger.player]);
								},
							},
							round: {
								trigger: { global: "roundEnd" },
								forced: true,
								audio: ["ext:无名扩展/audio/skill/shenpan"],
								async content(event, trigger, player) {
									const aliveCount = game.countPlayer();
									const topCards = get.cards(aliveCount);
									for (const c of topCards) c.classList.add("glory2");
									const next = player.addToExpansion(topCards, "gain2");
									next.gaintag.add("ffshenpan_lvchang");
									await next;
									game.log(player, "将牌堆顶的", aliveCount, "张牌置于武将牌上，称为“律偿”牌");
									player.markSkill("ffshenpan_lvchang");
									let num = 0;
									for (const c of topCards) {
										const number = get.number(c, false);
										if (number > 0) num += number;
									}
									if (num > 0) {
										player.addMark("ffshenpan_wu", num);
									}
									const playerList = game.players.slice();
									const selfIndex = playerList.indexOf(player);
									if (selfIndex > 0) {
										playerList.splice(selfIndex, 1);
										playerList.unshift(player);
									}
									for (let i = 0; i < aliveCount; i++) {
										const lvchang = player.getExpansions("ffshenpan_lvchang");
										if (lvchang.length === 0) break;
										const currentTarget = playerList[i % playerList.length];
										const result = await player
											.chooseCardButton(lvchang, 1, "选择一张“律偿”牌发给" + get.translation(currentTarget), true)
											.set("ai", () => Math.random())
											.forResult();
										if (result.bool && result.links?.length) {
											const card = result.links[0];
											const number = get.number(card, false);
											await currentTarget.gain(card, "gain2");
											if (number > 0) {
												player.addMark("ffshenpan_wu", number);
											}
											game.log(currentTarget, "获得了一张“律偿”牌");
										}
									}
								},
							},
							achieve: {
								trigger: { global: "roundStart" },
								forced: true,
								skillAnimation: true,
								animationColor: "water",
								prompt2: "赦免",
								audio: ["ext:无名扩展/audio/skill/shenpan-success"],
								filter(event, player) {
									if (player.countMark("ffshenpan_wu") >= 500) return true;
									const allPlayers = game.filterPlayer(p => p.isAlive());
									const targets = player.getStorage("ffshenpan_target");
									return allPlayers.every(p => targets.includes(p));
								},
								async content(event, trigger, player) {
									game.log("使命成功！芙宁娜熬过了五百年");
									player.awakenSkill("ffshenpan");
									player.changeSkin("ffshenpan", "芙宁娜-成功");
									await player.removeSkills("ffduwu");
									await player.removeSkills("ffshenqu");
									await player.addSkills("ffsongshi");
								},
							},
							fail: {
								trigger: { global: "phaseAfter" },
								forced: true,
								skillAnimation: true,
								animationColor: "fire",
								prompt2: "死刑",
								audio: ["ext:无名扩展/audio/skill/shenpan-fail"],
								filter(event, player) {
									const otherPlayers = game.filterPlayer(p => p !== player && p.isAlive());
									if (otherPlayers.length === 0) return false;
									const targeted = player.getStorage("ffshenpan_targeted");
									return otherPlayers.every(p => targeted.includes(p));
								},
								async content(event, trigger, player) {
									game.log("使命失败！芙宁娜将在王座上独自哭泣");
									player.awakenSkill("ffshenpan");
									player.changeSkin("ffshenpan", "芙宁娜-失败");
									await player.removeSkills("ffshenqu");
									await player.addSkills("ffguqi");
								},
							},
							die: {
								trigger: { player: "dieBegin" },
								forced: true,
								silent: true,
								async content(event, trigger, player) {
									if (player.hasSkill("ffsongshi")) {
										game.playAudio("ext:无名扩展/audio/die/芙宁娜芙卡洛斯-赦免.mp3");
									} else if (player.hasSkill("ffguqi")) {
										game.playAudio("ext:无名扩展/audio/die/芙宁娜芙卡洛斯-死刑.mp3");
									} else {
										game.playAudio("ext:无名扩展/audio/die/芙宁娜芙卡洛斯.mp3");
									}
								},
							},
							lvchang: {
								mark: true,
								marktext: "律",
								intro: {
									name: "律偿",
									markcount: "expansion",
									mark(dialog, storage, player) {
										const cards = player.getExpansions("ffshenpan_lvchang");
										if (cards.length) {
											if (player.isUnderControl(true)) dialog.addAuto(cards);
											else dialog.addText("共有" + cards.length + "张“律偿”牌");
										} else {
											dialog.addText("暂无“律偿”牌");
										}
									},
								},
								async onremove(player, skill) {
									const cards = player.getExpansions(skill);
									if (cards.length) {
										await player.loseToDiscardpile(cards);
									}
								},
							},
							wu: {
								mark: true,
								marktext: "舞",
								intro: {
									name: "舞",
									content: "“舞”标记数量：#",
								},
							},
						},
					},
					ffduwu: {
						audio: ["ext:无名扩展/audio/skill/duwu"],
						trigger: { global: "phaseEnd" },
						forced: true,
						mark: true,
						marktext: "舞",
						intro: {
							name: "独舞",
							content(storage, player) {
								const targets = player.getStorage("ffshenpan_target");
								const targeted = player.getStorage("ffshenpan_targeted");
								let str = targets.length > 0 ? "你使用牌指定过的目标：" + targets.map(t => get.translation(t)).join("、") : "你尚未对其他角色使用过牌";
								str += "<br>";
								str += targeted.length > 0 ? "对你使用过牌的角色：" + targeted.map(t => get.translation(t)).join("、") : "尚无其他角色对你使用过牌";
								return str;
							},
						},
						async content(event, trigger, player) {
							const lvchang = player.getExpansions("ffshenpan_lvchang");
							const y = Math.max(1, lvchang.length);
							const topCards = get.cards(y);
							const result = await player
								.chooseCardButton(topCards, 1, `独舞：观看牌堆顶${get.cnNumber(y)}张牌，选择一张使用或获得（伤害类牌只能获得）`, true)
								.set("ai", button => {
									const card = button.link;
									if (get.tag(card, "damage")) return get.value(card);
									if (player.hasUseTarget(card, null, true)) return 10 + get.value(card);
									return get.value(card);
								})
								.forResult();
							if (!result.bool || !result.links?.length) return;
							const selectedCard = result.links[0];
							const isDamageCard = get.tag(selectedCard, "damage");
							const remaining = topCards.filter(c => c !== selectedCard);
							if (!isDamageCard && player.hasUseTarget(selectedCard, null, true)) {
								const useResult = await player
									.chooseUseTarget(selectedCard, `是否使用${get.translation(selectedCard)}？`, false, "nodistance")
									.set("ai1", () => get.effect_use(result.targets[0], selectedCard, player, player))
									.forResult();
								if (useResult.bool) {
									for (let i = remaining.length - 1; i >= 0; i--) {
										remaining[i].fix();
										ui.cardPile.insertBefore(remaining[i], ui.cardPile.firstChild);
									}
									return;
								}
							}
							await player.gain(selectedCard, "gain2");
							for (let i = remaining.length - 1; i >= 0; i--) {
								remaining[i].fix();
								ui.cardPile.insertBefore(remaining[i], ui.cardPile.firstChild);
							}
						},
					},
					ffsongshi: {
						trigger: { global: "phaseZhunbeiBegin" },
						filter(event, player) {
							return player.getExpansions("ffshenpan_lvchang").length > 0;
						},
						async cost(event, trigger, player) {
							const lvchang = player.getExpansions("ffshenpan_lvchang");
							const target = trigger.player;
							const result = await player
								.chooseCardButton({
									cards: lvchang,
									select: 1,
									prompt: `是否对${get.translation(target)}发动【颂诗】？选择一张"律偿"牌交给其`,
									ai(button) {
										const att = get.attitude(player, target);
										if (att <= 0) return -100;
										return get.value(button.link, target);
									},
								})
								.forResult();
							event.result = {
								bool: result.bool && result.links?.length > 0,
								cost_data: { selectedCard: result.links?.[0], target },
							};
						},
						async content(event, trigger, player) {
							const { selectedCard, target } = event.cost_data;
							player.logSkill("ffsongshi", target);
							game.playSkillBgm("ffsongshi");
							const next = target.gain(selectedCard, player, "giveAuto");
							next.gaintag.add("ffsongshi_lvchang");
							target.addSkill("ffsongshi_effect");
							target.markAuto("ffsongshi_effect", [selectedCard.cardid]);
							target.markAuto("ffsongshi_source", [player]);
							await next;
							const topCard = get.cards(1)[0];
							topCard.classList.add("glory2");
							const next2 = player.addToExpansion(topCard, "gain2");
							next2.gaintag.add("ffshenpan_lvchang");
							await next2;
							player.markSkill("ffshenpan_lvchang");
						},
						subSkill: {
							lvchang: {
								charlotte: true,
								onremove: true,
								intro: {
									name: "律偿牌",
									content: "这是芙宁娜通过【颂诗】交给你的“律偿”牌",
								},
							},
							effect: {
								charlotte: true,
								trigger: {
									player: ["useCardAfter", "respondAfter"],
									source: "damageBegin1",
								},
								forced: true,
								popup: false,
								mod: {
									targetInRange(card, player, target) {
										if (card.cards?.some(cx => cx.hasGaintag("ffsongshi_lvchang"))) return true;
									},
									cardValue(card, player) {
										if (card.cards?.some(cx => cx.hasGaintag("ffsongshi_lvchang"))) return 8;
									},
								},
								filter(event, player, name) {
									let oriEvent = event;
									if (event.name === "damage") oriEvent = event.getParent("useCard");
									else if (event.name === "respond") oriEvent = event;
									if (!oriEvent?.card) return false;
									return player.getStorage("ffsongshi_effect").includes(oriEvent.card.cardid);
								},
								async content(event, trigger, player) {
									if (trigger.name === "damage") {
										trigger.num++;
									} else if (event.triggername === "useCardAfter" || event.triggername === "respondAfter") {
										await player.recover();
										const sources = player.getStorage("ffsongshi_source");
										if (sources?.length) {
											for (const sp of sources) {
												if (sp?.isAlive()) await sp.draw(2);
											}
										}
										await player.draw(2);
										player.removeSkill("ffsongshi_effect");
									}
								},
							},
							source: {
								charlotte: true,
								onremove: true,
							},
						},
					},
					ffguqi: {
						trigger: { player: "phaseZhunbeiBegin" },
						forced: true,
						filter(event, player) {
							return player.getExpansions("ffshenpan_lvchang").length > 0;
						},
						async content(event, trigger, player) {
							if (!player.getStorage("ffguqi_played", false)) {
								player.setStorage("ffguqi_played", true);
								const audio = new Audio("extension/无名扩展/audio/skill/guqi.mp3");
								audio.play();
							}
							game.log(player, "发动了【孤泣】");
							while (true) {
								const lvchang = player.getExpansions("ffshenpan_lvchang");
								if (lvchang.length === 0) break;
								const card = lvchang[0];
								const canUse = player.hasUseTarget(card, null, true);
								if (canUse) {
									const useResult = await player
										.chooseUseTarget(card, "孤泣：使用" + get.translation(card), false, "nodistance")
										.set("addCount", false)
										.set("nouseLimit", true)
										.set("addDistance", false)
										.forResult();
									if (useResult.bool) {
										game.log(player, "使用了一张“律偿”牌");
									} else {
										await player.gain(card, "gain2");
										game.log(player, "获得了", card);
									}
								} else {
									await player.gain(card, "gain2");
									game.log(player, "获得了", card);
								}
							}
							game.log(player, "使用完所有“律偿”牌后死亡");
							await player.die();
						},
					},
					lyshishang: {
						audio: ["ext:无名扩展/audio/skill/shishang"],
						trigger: { player: "phaseEnd" },
						forced: true,
						async content(event, trigger, player) {
							if (player.hp === player.maxHp) {
								await player.loseHp(1);
							} else {
								await player.loseMaxHp(1);
							}
						},
					},
					lyranjin: {
						audio: ["ext:无名扩展/audio/skill/ranjin1", "ext:无名扩展/audio/skill/ranjin2", "ext:无名扩展/audio/skill/ranjin3"],
						zhuanhuanji: true,
						direct: true,
						locked: false,
						mark: true,
						marktext: "☯",
						intro: {
							content(storage, player) {
								return (storage ? "阴：你可以将X张牌当作无距离和次数限制的火【杀】使用，若此【杀】造成了伤害，你回复X点体力" : "阳：你可以失去X点体力（X为体力上限的一半，向下取整，且至多失去体力值至1），然后对一名其他角色造成1点火焰伤害") + "。当你造成火焰伤害后，此技能视为未发动过。";
							},
						},
						enable: "phaseUse",
						usable: 1,
						filter(event, player) {
							const isYin = player.storage.lyranjin;
							if (isYin) {
								const x = Math.max(1, Math.floor(player.maxHp / 2));
								return player.countCards("he") >= x;
							}
							return player.getHp() >= 1;
						},
						async content(event, trigger, player) {
							const isYin = player.storage.lyranjin;
							if (!isYin) {
								const x = Math.min(player.hp - 1, Math.floor(player.maxHp / 2));
								const targetResult = await player
									.chooseTarget({
										filterTarget(card, player, target) {
											return target !== player;
										},
										selectTarget: 1,
										prompt: `【燃烬】失去${Math.max(0, x)}点体力，对一名其他角色造成1点火焰伤害`,
										ai(target) {
											return get.damageEffect(target, player, player, "fire");
										},
									})
									.forResult();
								if (!targetResult?.bool || !targetResult.targets?.length) {
									delete player.getStat("skill").lyranjin;
									return;
								}
								const target = targetResult.targets[0];
								player.logSkill("lyranjin", target);
								let loseHp = x;
								if (player.getHp() - loseHp < 1) loseHp = player.getHp() - 1;
								if (loseHp > 0) {
									await player.loseHp(loseHp);
								}
								await target.damage(1, "fire", player);
								player.changeZhuanhuanji("lyranjin");
							} else {
								const x = Math.max(1, Math.floor(player.maxHp / 2));
								player.addTempSkill("lyranjin_check_damage", "phaseUseAfter");
								player.setStorage("lyranjin_usedCards", x);
								player.setStorage("lyranjin_yin_using", true);
								const result = await player
									.chooseToUse()
									.set("openskilldialog", `###燃烬###将${x}张牌当作无距离和次数限制的火【杀】使用`)
									.set("norestore", true)
									.set("_backupevent", "lyranjin_backup")
									.set("custom", { add: {}, replace: { window() {} } })
									.backup("lyranjin_backup")
									.set("addCount", true)
									.forResult();
								player.setStorage("lyranjin_yin_using", false);
								if (result.bool) {
									player.changeZhuanhuanji("lyranjin");
								} else {
									player.setStorage("lyranjin_usedCards", 0);
									delete player.getStat("skill").lyranjin;
								}
							}
						},
						group: ["lyranjin_check", "lyranjin_reset"],
						mod: {
							targetInRange(card, player, target) {
								if (player.getStorage("lyranjin_yin_using", false)) {
									if (card.name === "sha" && card.nature === "fire") return true;
								}
							},
							cardUsable(card, player) {
								if (player.getStorage("lyranjin_yin_using", false)) {
									if (card.name === "sha" && card.nature === "fire") return Infinity;
								}
							},
						},
						subSkill: {
							backup: {
								selectCard() {
									const player = get.player();
									return Math.max(1, Math.floor(player.maxHp / 2));
								},
								filterCard(card) {
									return get.itemtype(card) === "card";
								},
								position: "he",
								ignoreMod: true,
								viewAs: { name: "sha", nature: "fire" },
								filterTarget(card, player, target) {
									return player !== target && lib.filter.targetEnabled({ name: "sha", nature: "fire" }, player, target);
								},
								selectTarget: 1,
								ai1(card) {
									return 8 - get.value(card);
								},
								ai2(target) {
									const player = get.player();
									return get.damageEffect(target, player, player, "fire");
								},
							},
							check_damage: {
								trigger: { player: "useCardAfter" },
								filter(event, player) {
									return event.card.name === "sha" && event.card.nature === "fire" && player.getStorage("lyranjin_usedCards", 0) > 0;
								},
								charlotte: true,
								silent: true,
								async content(event, trigger, player) {
									const x = player.getStorage("lyranjin_usedCards", 0);
									player.setStorage("lyranjin_usedCards", 0);
									let causedDamage = false;
									for (const target of trigger.targets) {
										const damageHistory = target.getHistory("damage", evt => evt.card === trigger.card);
										if (damageHistory && damageHistory.length > 0) {
											causedDamage = true;
											break;
										}
									}
									if (causedDamage) {
										await player.recover(x);
									}
								},
							},
							check: {
								trigger: { global: "damageEnd" },
								filter(event, player) {
									return event.nature === "fire" && event.source === player && player.getStat("skill").lyranjin;
								},
								charlotte: true,
								silent: true,
								firstDo: true,
								async content(event, trigger, player) {
									delete player.getStat("skill").lyranjin;
									game.log(player, "因造成火焰伤害，重置了", "#g【燃烬】");
								},
							},
							reset: {
								trigger: { player: "phaseUseAfter" },
								charlotte: true,
								silent: true,
								async content(event, trigger, player) {
									player.setStorage("lyranjin_usedCards", 0);
								},
							},
						},
						ai: {
							order: 13,
							result: {
								player(player) {
									const isYin = player.storage.lyranjin;
									if (!isYin) {
										if (player.getHp() <= 2) return 10;
										if (player.getHp() <= 3) return 7;
										return 5;
									} else {
										const x = Math.max(1, Math.floor(player.maxHp / 2));
										return 10 + x;
									}
								},
								target(player, target) {
									return -5;
								},
							},
						},
					},
					lyyuhuo: {
						audio: ["ext:无名扩展/audio/skill/yvhuo"],
						trigger: { player: "useCard1" },
						filter(event, player) {
							return event.card.name === "sha" && event.targets?.length > 0;
						},
						prompt2(event, player) {
							const x = Math.min(Math.max(1, player.maxHp - player.getHp()), 5);
							return "你可以选择" + x + "项效果：①弃置目标的一张牌 ②摸一张牌 ③此【杀】无视防具 ④若其受到此【杀】伤害时没有手牌，此伤害+1 ⑤此【杀】造成伤害后，你回复1点体力";
						},
						ai: {
							threaten: 2,
							skillTagFilter(player, tag) {
								if (tag === "sha") return true;
							},
							result: {
								return: 13,
							},
						},
						async content(event, trigger, player) {
							const x = Math.min(Math.max(1, player.maxHp - player.getHp()), 5);
							const shaTargets = trigger.targets.slice(0);
							const result = await player
								.chooseButton([
									"浴火：选择" + x + "项效果",
									[
										[
											["弃牌", "弃置目标的一张牌"],
											["摸牌", "摸一张牌"],
											["无视", "此【杀】无视防具"],
											["增伤", "若目标没有手牌，此【杀】伤害+1"],
											["回血", "此【杀】造成伤害后回复1点体力"],
										],
										"textbutton",
									],
								])
								.set("selectButton", [1, x])
								.set("forced", true)
								.set("forcebutton", true)
								.set(
									"ai",
									(() => {
										const targets = trigger.targets;
										return button => {
											const choice = button.link[0];
											const p = get.player();
											const target = targets.length > 0 ? targets[0] : null;
											const targetHand = target ? target.countCards("h") : 999;
											switch (choice) {
												case "摸牌":
													return 10;
												case "弃牌":
													return 8;
												case "回血":
													return targetHand <= 1 ? 5 : 6;
												case "增伤":
													return targetHand <= 1 ? 7 : 4;
												case "无视":
													return 4;
											}
											return 1;
										};
									})()
								)
								.forResult();
							if (!result.bool || !result.links?.length) return;
							const choices = result.links;
							const hasDiscard = choices.includes("弃牌");
							const hasDraw = choices.includes("摸牌");
							const hasIgnore = choices.includes("无视");
							const hasAddDamage = choices.includes("增伤");
							const hasRecover = choices.includes("回血");
							if (hasIgnore) {
								for (const target of shaTargets) {
									target.addTempSkill("qinggang2");
									target.getStorage("qinggang2", []).add(trigger.card);
								}
							}
							if (hasAddDamage) {
								player.addTempSkill("lyyuhuo_adddamage");
								player.setStorage("lyyuhuo_shaTargets", shaTargets.slice(0));
								player.setStorage("lyyuhuo_triggerCard", trigger.card);
							}
							if (hasRecover) {
								player.addTempSkill("lyyuhuo_recover");
								player.setStorage("lyyuhuo_shaTargets_recover", shaTargets.slice(0));
							}
							if (hasDiscard) {
								const validTargets = shaTargets.filter(t => t.countCards("he") > 0);
								if (validTargets.length > 0) {
									const discardTargetResult = await player
										.chooseTarget(true, "弃置一名目标角色的一张牌", (card, p, target) => shaTargets.includes(target) && target.countCards("he") > 0)
										.set("forced", true)
										.set("ai", target => -get.attitude(player, target))
										.forResult();
									if (discardTargetResult.bool && discardTargetResult.targets?.length > 0) {
										await player.discardPlayerCard(discardTargetResult.targets[0], "he", true);
										game.log(player, "弃置了", get.translation(discardTargetResult.targets[0]), "的一张牌");
									}
								}
							}
							if (hasDraw) {
								await player.draw();
							}
						},
						subSkill: {
							adddamage: {
								charlotte: true,
								trigger: { global: "damageBegin1" },
								filter(event, player) {
									const shaTargets = player.getStorage("lyyuhuo_shaTargets", []);
									const triggerCard = player.getStorage("lyyuhuo_triggerCard", null);
									return shaTargets.length > 0 && triggerCard && event.source === player && event.card === triggerCard && shaTargets.includes(event.player) && event.player.countCards("h") === 0;
								},
								silent: true,
								async content(event, trigger, player) {
									trigger.num++;
									player.setStorage("lyyuhuo_shaTargets", []);
									player.setStorage("lyyuhuo_triggerCard", null);
								},
							},
							recover: {
								charlotte: true,
								trigger: { global: "damageEnd" },
								filter(event, player) {
									const shaTargets = player.getStorage("lyyuhuo_shaTargets_recover", []);
									return event.source === player && shaTargets.includes(event.player);
								},
								silent: true,
								async content(event, trigger, player) {
									await player.recover();
									player.setStorage("lyyuhuo_shaTargets_recover", []);
								},
							},
						},
					},
					dlhchizhuo: {
						audio: ["ext:无名扩展/audio/skill/chizhuo1", "ext:无名扩展/audio/skill/chizhuo2"],
						trigger: { global: "useCardToTargeted" },
						filter(event, player) {
							if (get.tag(event.card, "delay")) return false;
							if (!get.tag(event.card, "damage")) return false;
							const target = event.target;
							return target.countCards("hej") > 0;
						},
						direct: true,
						locked: false,
						clearStorage(player) {
							player.removeSkill("dlhchizhuo_adddamage");
							player.removeSkill("dlhchizhuo_back");
							player.removeSkill("dlhchizhuo_phase");
							player.removeSkill("dlhchizhuo_die");
							player.setStorage("dlhchizhuo_active", false);
							player.setStorage("dlhchizhuo_cards", undefined);
							player.setStorage("dlhchizhuo_source", undefined);
							player.setStorage("dlhchizhuo_cardId", undefined);
							player.setStorage("dlhchizhuo_phasePlayer", undefined);
						},
						async content(event, trigger, player) {
							const target = trigger.target;
							const shaCard = trigger.card;
							const choices = [];
							if (target.countCards("j") > 0) choices.push("判定区");
							if (target.countCards("e") > 0) choices.push("装备区");
							if (target.countCards("h") > 0) choices.push("手牌区");
							choices.push("cancel2");
							const controlResult = await player
								.chooseControl(choices)
								.set("prompt", get.prompt("dlhchizhuo", target))
								.set("target", target)
								.set("ai", () => {
									const t = _status.event.target;
									const p = _status.event.player;
									if (!t) return "cancel2";
									const att = get.attitude(p, t);
									if (att > 0) {
										if (t.countCards("j") > 0) return "判定区";
										return "cancel2";
									}
									if (t.countCards("h") > 0) return "手牌区";
									if (t.countCards("e") > 0) return "装备区";
									return "cancel2";
								})
								.forResult();
							if (!controlResult.control || controlResult.control === "cancel2") return;
							player.logSkill("dlhchizhuo", target);
							const area = controlResult.control;
							let cards;
							if (area === "判定区") cards = target.getCards("j").slice(0);
							else if (area === "装备区") cards = target.getCards("e").slice(0);
							else cards = target.getCards("h").slice(0);
							if (!cards?.length) return;
							for (const card of cards) card.classList.add("glory2");
							const next = target.addToExpansion("giveAuto", cards, target);
							next.gaintag.add("dlhchizhuo");
							await next;
							target.setStorage("dlhchizhuo_cards", cards.slice(0));
							target.setStorage("dlhchizhuo_source", player);
							target.setStorage("dlhchizhuo_cardId", shaCard.cardid);
							target.setStorage("dlhchizhuo_active", true);
							target.markSkill("dlhchizhuo");
							target.setStorage("dlhchizhuo_phasePlayer", _status.currentPhase || trigger.player);
							target.addSkill("dlhchizhuo_adddamage");
							target.addSkill("dlhchizhuo_back");
							target.addSkill("dlhchizhuo_phase");
							target.addSkill("dlhchizhuo_die");
						},
						marktext: "灼",
						intro: {
							name: "炽灼",
							markcount: "expansion",
							mark(dialog, storage, player) {
								const cards = player.getExpansions("dlhchizhuo");
								if (player.isUnderControl(true)) dialog.addAuto(cards);
								else return "共有" + cards.length + "张牌";
							},
						},
						ai: {
							expose: 0.3,
							threaten: 1.5,
						},
						subSkill: {
							adddamage: {
								trigger: { player: "damageBegin1" },
								charlotte: true,
								forced: true,
								filter(event, player) {
									if (!player.getStorage("dlhchizhuo_active", false)) return false;
									const cardId = player.getStorage("dlhchizhuo_cardId", null);
									return event.card?.cardid === cardId;
								},
								async content(event, trigger, player) {
									trigger.num++;
								},
							},
							back: {
								trigger: { player: "damageEnd" },
								charlotte: true,
								forced: true,
								filter(event, player) {
									if (!player.getStorage("dlhchizhuo_active", false)) return false;
									const cards = player.getExpansions("dlhchizhuo");
									if (!cards.length) return false;
									const source = player.getStorage("dlhchizhuo_source", null);
									if (!source?.isIn()) return false;
									const cardId = player.getStorage("dlhchizhuo_cardId", null);
									return event.card?.cardid === cardId;
								},
								async content(event, trigger, player) {
									const cards = player.getExpansions("dlhchizhuo");
									if (cards.length > 0) {
										await player.gain(cards, "draw");
									}
									lib.skill.dlhchizhuo.clearStorage(player);
								},
							},
							phase: {
								trigger: { global: "phaseEnd" },
								charlotte: true,
								forced: true,
								filter(event, player) {
									if (!player.getStorage("dlhchizhuo_active", false)) return false;
									const cards = player.getExpansions("dlhchizhuo");
									if (!cards.length) return false;
									const phasePlayer = player.getStorage("dlhchizhuo_phasePlayer", null);
									return event.player === phasePlayer;
								},
								async content(event, trigger, player) {
									const cards = player.getExpansions("dlhchizhuo");
									if (cards.length > 0) {
										await player.gain(cards, "draw");
									}
									lib.skill.dlhchizhuo.clearStorage(player);
								},
							},
							die: {
								trigger: { player: "dieBefore" },
								charlotte: true,
								forced: true,
								filter(event, player) {
									if (!player.getStorage("dlhchizhuo_active", false)) return false;
									const cards = player.getExpansions("dlhchizhuo");
									if (!cards.length) return false;
									const source = player.getStorage("dlhchizhuo_source", null);
									return source?.isIn();
								},
								async content(event, trigger, player) {
									const source = player.getStorage("dlhchizhuo_source", null);
									let cards = player.getExpansions("dlhchizhuo");
									lib.skill.dlhchizhuo.clearStorage(player);
									if (!cards.length || !source?.isIn()) return;
									const givenMap = {};
									while (cards.length > 0) {
										let result;
										if (cards.length > 1) {
											result = await source
												.chooseCardButton("炽灼：选择要分配的牌", true, cards, [1, cards.length])
												.set("ai", button => get.value(button.link, source))
												.forResult();
										} else {
											result = { bool: true, links: cards.slice(0) };
										}
										if (!result.bool) break;
										const toGive = result.links;
										result = await source
											.chooseTarget(`选择一名角色获得${get.translation(toGive)}`, true)
											.set("ai", t => {
												const att = get.attitude(source, t);
												if (att <= 0) return -1;
												return att + (t.countCards("h") < 2 ? 5 : 0);
											})
											.forResult();
										if (result.bool && result.targets.length) {
											cards.removeArray(toGive);
											const id = result.targets[0].playerid;
											if (!givenMap[id]) givenMap[id] = [];
											givenMap[id].addArray(toGive);
										}
									}
									for (const id in givenMap) {
										const t = (_status.connectMode ? lib.playerOL : game.playerMap)[id];
										if (t && givenMap[id].length > 0) {
											const gainNext = t.gain(givenMap[id], "draw");
											gainNext.log = false;
											await gainNext;
										}
									}
								},
							},
							clear: {
								charlotte: true,
								trigger: { player: "phaseAfter" },
								silent: true,
								async content(event, trigger, player) {
									if (player.getStorage("dlhchizhuo_active", false)) {
										lib.skill.dlhchizhuo.clearStorage(player);
									}
								},
							},
						},
					},
					wgryanzhao: {
						audio: ["ext:无名扩展/audio/skill/yanzhao1", "ext:无名扩展/audio/skill/yanzhao2"],
						trigger: {
							global: ["phaseZhunbeiBegin", "phaseJieshuBegin"],
						},
						direct: true,
						locked: false,
						async content(event, trigger, player) {
							const target = trigger.player;
							const controlResult = await player
								.chooseControl("牌堆", "弃牌堆", "cancel2")
								.set("prompt", get.prompt("wgryanzhao", target))
								.set("ai", () => {
									const p = _status.event.player;
									if (get.attitude(p, target) <= 0) return "cancel2";
									return "牌堆";
								})
								.forResult();
							if (!controlResult.control || controlResult.control === "cancel2") return;
							player.logSkill("wgryanzhao", target);
							const sourceType = controlResult.control;
							let damageCards = [];
							if (sourceType === "牌堆") {
								damageCards = Array.from(ui.cardPile.childNodes).filter(card => get.tag(card, "damage"));
							} else {
								damageCards = Array.from(ui.discardPile.childNodes).filter(card => get.tag(card, "damage"));
							}
							if (!damageCards.length) return;
							const cardResult = await target
								.chooseCardButton("焰炤：选择一张伤害牌使用", damageCards, true)
								.set("ai", button => {
									const card = button.link;
									if (!target.hasUseTarget(card)) return 0;
									const val = get.value(card, target);
									const cardName = card.name;
									if (cardName === "juedou") {
										const canJuedouEnemy = game.hasPlayer(p => p !== target && get.attitude(target, p) < 0 && lib.filter.targetEnabled2(card, target, p));
										if (!canJuedouEnemy) return -1;
										return val + 3;
									}
									if (cardName === "sha") {
										const canShaEnemy = game.hasPlayer(p => p !== target && get.attitude(target, p) < 0 && lib.filter.targetEnabled2(card, target, p));
										if (!canShaEnemy) return -1;
										if (card.nature === "fire" || card.nature === "thunder") {
											if (target.isDamaged()) return val + 10;
										}
										return val + 5;
									}
									if (cardName === "nanman" || cardName === "wanjian") {
										const hasShaNoRange = game.hasPlayer(p => p !== target && get.attitude(target, p) < 0);
										if (!hasShaNoRange) {
											const canShaAny = game.hasPlayer(p => p !== target && get.attitude(target, p) < 0 && lib.filter.targetEnabled2({ name: "sha" }, target, p));
											if (!canShaAny) return val + 15;
										}
										if (get.attitude(player, target) > 0) {
											const canJuedouEnemy = game.hasPlayer(p => p !== target && get.attitude(target, p) < 0 && lib.filter.targetEnabled2({ name: "juedou" }, target, p));
											if (!canJuedouEnemy) return val + 15;
										}
										return val;
									}
									if (cardName === "huogong") {
										const canShaEnemy = game.hasPlayer(p => p !== target && get.attitude(target, p) < 0 && lib.filter.targetEnabled2({ name: "sha" }, target, p));
										if (!canShaEnemy) return val + 10;
										return val;
									}
									return val;
								})
								.forResult();
							if (!cardResult.bool || !cardResult.links?.length) return;
							const selectedCard = cardResult.links[0];
							if (!target.hasUseTarget(selectedCard, true)) return;
							target.setStorage("wgryanzhao_cardid", selectedCard.cardid);
							target.addTempSkill("wgryanzhao_damage", "phaseAfter");
							await target.chooseUseTarget(selectedCard, true);
						},
						subSkill: {
							damage: {
								charlotte: true,
								trigger: { source: "damageEnd" },
								filter(event, player) {
									const cardid = player.getStorage("wgryanzhao_cardid");
									if (!cardid) return false;
									return event.card?.cardid === cardid;
								},
								forced: true,
								async content(event, trigger, player) {
									await player.draw(2);
									if (trigger.nature === "fire" || trigger.nature === "thunder") {
										await player.recover();
									}
									player.setStorage("wgryanzhao_cardid", null);
								},
							},
						},
					},
					lszhuoyan: {
						audio: ["ext:无名扩展/audio/skill/zhuoyan1", "ext:无名扩展/audio/skill/zhuoyan2", "ext:无名扩展/audio/skill/zhuoyan3"],
						chargeSkill: 5,
						usable: 1,
						mod: {
							maxCharge(player, max) {
								return 5;
							},
						},
						init(player, skill) {
							player.addCharge(3, false);
						},
						onremove: true,
						enable: "phaseUse",
						direct: true,
						group: [],
						filter(event, player) {
							return player.countCharge() > 0;
						},
						async content(event, trigger, player) {
							const maxCharge = player.countCharge();
							const controlResult = await player
								.chooseControl(Array.from({ length: maxCharge }, (_, i) => i + 1 + "点").concat("cancel2"))
								.set("prompt", "请选择要消耗的蓄力点数")
								.set("ai", () => {
									const p = _status.event.player;
									const charge = p.countCharge();
									const att = t => get.attitude(p, t);
									const allies = game.filterPlayer(t => t === p || att(t) > 0);
									const enemies = game.filterPlayer(t => att(t) < 0);
									if (charge >= 5) {
										const hasLowValueAlly = allies.some(t => {
											const cards = t.getCards("h");
											if (cards.length < 2) return false;
											const avg = cards.reduce((s, c) => s + get.value(c, t), 0) / cards.length;
											return avg < 5;
										});
										if (hasLowValueAlly) return "5点";
									}
									if (charge >= 4) {
										const hasAllyJudge = allies.some(t => t.countCards("j") > 0);
										const hasEnemyEquipForAlly = enemies.some(from => {
											return from.getCards("e").some(card => {
												return allies.some(to => to.canEquip(card));
											});
										});
										if (hasAllyJudge || hasEnemyEquipForAlly) return "4点";
									}
									if (charge >= 3) return "3点";
									if (charge === 2) {
										const hasInjuredAlly = allies.some(t => t.hp < t.maxHp);
										if (hasInjuredAlly) return "2点";
									}
									return "1点";
								})
								.forResult();
							if (!controlResult.control || controlResult.control === "cancel2") {
								delete player.getStat("skill").lszhuoyan;
								return;
							}
							const num = parseInt(controlResult.control);
							player.removeCharge(num);
							player.logSkill("lszhuoyan");
							if (num >= 1) {
								const targetResult1 = await player
									.chooseTarget("对一名角色造成1点火焰伤害", true)
									.set("ai", target => {
										const p = _status.event.player;
										return -get.attitude(p, target);
									})
									.forResult();
								if (targetResult1.bool && targetResult1.targets?.length) {
									await targetResult1.targets[0].damage(1, "fire", player);
								}
							}
							if (num >= 2) {
								const targetResult2 = await player
									.chooseTarget("令至多两名角色回复2点体力", [1, 2], true)
									.set("ai", target => {
										const p = _status.event.player;
										return get.attitude(p, target);
									})
									.forResult();
								if (targetResult2.bool && targetResult2.targets) {
									for (const target of targetResult2.targets) {
										await target.recover(2);
									}
								}
							}
							if (num >= 3) {
								const targetResult3 = await player
									.chooseTarget("令至多三名角色各摸三张牌", [1, 3], true)
									.set("ai", target => {
										const p = _status.event.player;
										return get.attitude(p, target);
									})
									.forResult();
								if (targetResult3.bool && targetResult3.targets) {
									for (const target of targetResult3.targets) {
										await target.draw(3);
									}
								}
							}
							if (num >= 4) {
								for (let moveCount = 0; moveCount < 4; moveCount++) {
									const remaining = 4 - moveCount;
									const hasValidMove = game.hasPlayer(from => {
										return (
											from.countCards("ej") > 0 &&
											game.hasPlayer(to => {
												if (to === from) return false;
												const cards = from.getCards("ej");
												return cards.some(card => to.canEquip(card) || (to.canAddJudge && to.canAddJudge(card)));
											})
										);
									});
									if (!hasValidMove) break;
									const moveResult = await player
										.chooseTarget(2, (card, player, target) => {
											if (ui.selected.targets.length) {
												const from = ui.selected.targets[0];
												if (target.isMin()) return false;
												const es = from.getCards("ej");
												return es.some(c => target.canEquip(c) || (target.canAddJudge && target.canAddJudge(c)));
											}
											return target.countCards("ej") > 0;
										})
										.set("ai", target => {
											const p = _status.event.player;
											const att = get.attitude(p, target);
											if (!ui.selected.targets.length) {
												if (att > 0) {
													if (target.countCards("j") > 0) return 10;
													if (target.countCards("e", c => get.value(c, target) < 0) > 0) return 8;
												}
												return -att;
											}
											const from = ui.selected.targets[0];
											const es = from.getCards("ej");
											for (const c of es) {
												if (target.canEquip(c) && get.effect(target, c, p, target) > 0) return att;
												if (target.canAddJudge && target.canAddJudge(c) && get.attitude(p, from) < 0) return att;
											}
											return 0;
										})
										.set("multitarget", true)
										.set("targetprompt", ["被移走", "移动目标"])
										.set("prompt", "移动场上的一张牌（剩余" + remaining + "次）")
										.forResult();
									if (!moveResult.bool || !moveResult.targets || moveResult.targets.length !== 2) break;
									const fromTarget = moveResult.targets[0];
									const toTarget = moveResult.targets[1];
									const cards = fromTarget.getCards("ej").filter(c => toTarget.canEquip(c) || (toTarget.canAddJudge && toTarget.canAddJudge(c)));
									if (cards.length === 0) continue;
									const cardResult = await player.chooseCardButton(cards, true, "选择要移动的牌").forResult();
									if (!cardResult.bool || !cardResult.links || cardResult.links.length === 0) break;
									const card = cardResult.links[0];
									if (get.position(card) === "e") {
										await toTarget.equip(card);
									} else if (get.position(card) === "j") {
										await toTarget.addJudge(card);
									}
									fromTarget.$give(card, toTarget);
									game.log(player, "将", card, "从", fromTarget, "移动到了", toTarget);
								}
							}
							if (num === 5) {
								const targetResult5 = await player
									.chooseTarget("至多令五名角色弃置区域内所有牌并摸等量的牌", [1, 5], true)
									.set("ai", target => {
										const p = _status.event.player;
										return -get.attitude(p, target);
									})
									.forResult();
								if (targetResult5.bool && targetResult5.targets) {
									for (const target of targetResult5.targets) {
										const count = target.countCards("hej");
										await target.discard(target.getCards("hej"));
										await target.draw(count);
									}
								}
							}
						},
						ai: {
							order: 10,
							result: {
								player(player) {
									return 1;
								},
							},
						},
					},
					lsfenyun: {
						audio: ["ext:无名扩展/audio/skill/fenyun"],
						chargeSkill: 5,
						forced: true,
						locked: false,
						mod: {
							maxCharge(player, max) {
								return 5;
							},
						},
						trigger: { global: "damageEnd" },
						filter(event, player) {
							if (!event.num || event.num <= 0) return false;
							const isFire = event.nature === "fire" || (event.hasNature && event.hasNature("fire"));
							if (event.num >= 2 || isFire) {
								return player.countCharge() < 5;
							}
							return false;
						},
						async content(event, trigger, player) {
							const isFire = trigger.nature === "fire" || (trigger.hasNature && trigger.hasNature("fire"));
							let gain = 0;
							if (trigger.num >= 2) gain++;
							if (isFire) gain++;
							const current = player.countCharge();
							const max = player.getMaxCharge();
							const actualGain = Math.min(gain, max - current);
							if (actualGain > 0) {
								player.addCharge(actualGain);
							}
						},
						group: ["lsfenyun_active"],
						subSkill: {
							active: {
								audio: ["ext:无名扩展/audio/skill/fenyun"],
								enable: "phaseUse",
								direct: true,
								locked: false,
								filter(event, player) {
									if (player.countCharge() >= player.getMaxCharge()) return false;
									const cards = player.getCards("he");
									const damageCards = cards.filter(card => get.tag(card, "damage"));
									return damageCards.length > 0;
								},
								async content(event, trigger, player) {
									const damageCards = player.getCards("he").filter(card => get.tag(card, "damage"));
									if (damageCards.length === 0) return;
									const cardResult = await player
										.chooseToDiscard(1, "he", false, "弃置1张伤害牌获得1点蓄力点")
										.set("filterCard", card => damageCards.includes(card))
										.set("ai", card => {
											const p = _status.event.player;
											return 7 - get.value(card, p);
										})
										.forResult();
									if (!cardResult.bool || !cardResult.cards || cardResult.cards.length === 0) return;
									player.logSkill("lsfenyun_active");
									player.addCharge(1);
								},
								ai: {
									order: 10,
									result: {
										player(player) {
											return 1;
										},
									},
								},
							},
						},
					},
					mcpxingshang: {
						getLimit: 9,
						getList: [
							{
								cost: 2,
								prompt: () => "令一名角色复原武将牌",
								filter: () => game.hasPlayer(target => target.isLinked() || target.isTurnedOver()),
								filterTarget: (card, player, target) => target.isLinked() || target.isTurnedOver(),
								async content(player, target) {
									if (target.isLinked()) {
										await target.link(false);
									}
									if (target.isTurnedOver()) {
										await target.turnOver(false);
									}
								},
								ai: {
									result: {
										target(player, target) {
											let res = 0;
											if (target.isLinked()) {
												res = 0.3;
											}
											if (target.isTurnedOver()) {
												res += 3.5 * get.threaten(target, player);
											}
											return res;
										},
									},
								},
							},
							{
								cost: 2,
								prompt: () => "令一名角色摸" + get.cnNumber(Math.min(5, Math.max(2, game.dead.length))) + "张牌",
								filter: () => true,
								filterTarget: true,
								async content(player, target) {
									await target.draw(Math.min(5, Math.max(2, game.dead.length)));
								},
								ai: {
									result: {
										player(player, target) {
											return get.effect(target, { name: "draw" }, player, player) * Math.min(5, Math.max(2, game.dead.length));
										},
									},
								},
							},
							{
								cost: 5,
								prompt: () => "令一名体力上限小于10的角色回复1点体力，增加1点体力上限，随机恢复一个废除的装备栏",
								filter: () => game.hasPlayer(target => target.maxHp < 10),
								filterTarget: (card, player, target) => target.maxHp < 10,
								async content(player, target) {
									await target.recover();
									await target.gainMaxHp();
									let list = Array.from({ length: 13 }).map((_, i) => "equip" + parseFloat(i + 1));
									list = list.filter(i => target.hasDisabledSlot(i));
									if (list.length) {
										await target.enableEquip(list.randomGet());
									}
								},
								ai: {
									result: {
										target(player, target) {
											let res = 0.2;
											if (target.isHealthy()) {
												res += 0.4;
											}
											if (
												Array.from({ length: 5 })
													.map((_, i) => "equip" + parseFloat(i + 1))
													.some(i => target.hasDisabledSlot(i))
											) {
												res += 0.3;
											}
											return res + get.recoverEffect(target, target, target) / 16;
										},
									},
								},
							},
							{
								cost: 5,
								prompt: () => "获得一名已阵亡角色的武将牌上的所有技能，然后失去〖行殇〗〖放逐〗〖颂威〗",
								filter: () => game.dead.some(target => target.getStockSkills(true, true).some(i => get.info(i) && !get.info(i).charlotte)),
								filterTarget(card, player, target) {
									if (!target.isDead()) {
										return false;
									}
									return target.getStockSkills(true, true).some(i => get.info(i) && !get.info(i).charlotte);
								},
								deadTarget: true,
								async content(player, target) {
									await player.changeSkills(
										target.getStockSkills(true, true).filter(skill => get.info(skill) && !get.info(skill).charlotte),
										["mcpxingshang", "mcpfangzhu", "mcpsongwei"]
									);
								},
								ai: {
									result: {
										player(player, target) {
											return ["name", "name1", "name2"].reduce((sum, name) => {
												if (!target[name] || !lib.character[target[name]] || (name == "name1" && target.name1 == target.name)) {
													return sum;
												}
												return sum + get.rank(target[name], true);
											}, 0);
										},
									},
								},
							},
						],
						mark: true,
						marktext: "颂",
						intro: {
							name: "颂",
							content: "mark",
						},
						enable: "phaseUse",
						filter(event, player) {
							return get.info("mcpxingshang").getList.some(effect => {
								return player.countMark("mcpxingshang") >= effect.cost && effect.filter(player);
							});
						},
						usable: 2,
						chooseButton: {
							dialog() {
								let dialog = ui.create.dialog("行殇：请选择一项", "hidden");
								const list = get.info("mcpxingshang").getList.slice();
								dialog.add([
									list.map(effect => {
										return [effect, "移去" + effect.cost + "个“颂”标记，" + effect.prompt()];
									}),
									"textbutton",
								]);
								return dialog;
							},
							filter(button, player) {
								const effect = button.link;
								return player.countMark("mcpxingshang") >= effect.cost && effect.filter(player);
							},
							check(button) {
								const player = get.event().player,
									effect = button.link;
								return Math.max(
									...game
										.filterPlayer(target => {
											const filterTarget = effect.filterTarget;
											if (!filterTarget) {
												return target == player;
											}
											if (typeof filterTarget == "function") {
												return filterTarget(null, player, target);
											}
											return true;
										})
										.map(target => {
											game.broadcastAll(effect => (lib.skill["mcpxingshang_aiSkill"].ai = effect.ai), effect);
											return get.effect(target, "mcpxingshang_aiSkill", player, player);
										})
								);
							},
							backup(links, player) {
								const effect = links[0];
								return {
									effect: effect,
									audio: ["ext:无名扩展/audio/skill/xingshang1", "ext:无名扩展/audio/skill/xingshang2"],
									filterCard: () => false,
									selectCard: -1,
									filterTarget: effect.filterTarget,
									deadTarget: effect.deadTarget,
									async content(event, trigger, player) {
										const target = event.targets[0],
											effect = lib.skill.mcpxingshang_backup.effect;
										player.removeMark("mcpxingshang", effect.cost);
										await effect.content(player, target);
									},
									ai: effect.ai,
								};
							},
							prompt(links, player) {
								const effect = links[0],
									str = "###行殇###";
								return str + '<div class="text center">' + "移去" + effect.cost + "个“颂”标记，" + effect.prompt() + "</div>";
							},
						},
						ai: {
							order: 6.5,
							result: {
								player(player) {
									const list = get.info("mcpxingshang").getList.filter(effect => {
										return player.countMark("mcpxingshang") >= effect.cost && effect.filter(player);
									});
									return Math.max(
										...list.map(effect => {
											return Math.max(
												...game
													.filterPlayer(target => {
														const filterTarget = effect.filterTarget;
														if (!filterTarget) {
															return target == player;
														}
														if (typeof filterTarget == "function") {
															return filterTarget(null, player, target);
														}
														return true;
													})
													.map(target => {
														game.broadcastAll(effect => (lib.skill["mcpxingshang_aiSkill"].ai = effect.ai), effect);
														return get.effect(target, "mcpxingshang_aiSkill", player, player);
													})
											);
										})
									);
								},
							},
						},
						group: "mcpxingshang_gain",
						subSkill: {
							aiSkill: {},
							backup: {},
							gain: {
								audio: ["ext:无名扩展/audio/skill/xingshang1", "ext:无名扩展/audio/skill/xingshang2"],
								trigger: { global: ["die", "damageEnd"] },
								filter(event, player) {
									if (player.countMark("mcpxingshang") >= get.info("mcpxingshang").getLimit) {
										return false;
									}
									return event.name == "die" || !player.getHistory("custom", evt => evt.mcpxingshang).length;
								},
								forced: true,
								locked: false,
								async content(event, trigger, player) {
									player.addMark("mcpxingshang", Math.min(2, get.info("mcpxingshang").getLimit - player.countMark("mcpxingshang")));
									if (trigger.name == "damage") {
										player.getHistory("custom").push({ mcpxingshang: true });
									}
								},
							},
						},
					},
					mcpfangzhu: {
						getList: [
							{
								cost: 1,
								prompt: () => "令一名其他角色于手牌中只能使用基本牌直到其回合结束",
								filter: player => game.hasPlayer(target => target != player && !target.getStorage("mcpfangzhu_ban").includes("basic")),
								filterTarget: (card, player, target) => target != player && !target.getStorage("mcpfangzhu_ban").includes("basic"),
								async content(player, target) {
									target.addTempSkill("mcpfangzhu_ban", { player: "phaseEnd" });
									target.markAuto("mcpfangzhu_ban", ["basic"]);
									lib.skill.mcpfangzhu_ban.init(target, "mcpfangzhu_ban");
								},
								ai: {
									result: {
										target(player, target) {
											return -(target.countCards("hs") + 2) / 3;
										},
									},
								},
							},
							{
								cost: 2,
								prompt: () => "令一名其他角色于手牌中只能使用锦囊牌直到其回合结束",
								filter: player => game.hasPlayer(target => target != player && !target.getStorage("mcpfangzhu_ban").includes("trick")),
								filterTarget: (card, player, target) => target != player && !target.getStorage("mcpfangzhu_ban").includes("trick"),
								async content(player, target) {
									target.addTempSkill("mcpfangzhu_ban", { player: "phaseEnd" });
									target.markAuto("mcpfangzhu_ban", ["trick"]);
									lib.skill.mcpfangzhu_ban.init(target, "mcpfangzhu_ban");
								},
								ai: {
									result: {
										target(player, target) {
											return -(target.countCards("hs") + 2) / 2;
										},
									},
								},
							},
							{
								cost: 3,
								prompt: () => "令一名其他角色于手牌中只能使用装备牌直到其回合结束",
								filter: player => game.hasPlayer(target => target != player && !target.getStorage("mcpfangzhu_ban").includes("equip")),
								filterTarget: (card, player, target) => target != player && !target.getStorage("mcpfangzhu_ban").includes("equip"),
								async content(player, target) {
									target.addTempSkill("mcpfangzhu_ban", { player: "phaseEnd" });
									target.markAuto("mcpfangzhu_ban", ["equip"]);
									lib.skill.mcpfangzhu_ban.init(target, "mcpfangzhu_ban");
								},
								ai: {
									result: {
										target(player, target) {
											return -target.countCards("hs") - 2;
										},
									},
								},
							},
							{
								cost: 2,
								prompt: () => "令一名其他角色的非Charlotte技能失效直到其回合结束",
								filter: player => game.hasPlayer(target => target != player),
								filterTarget: lib.filter.notMe,
								async content(player, target) {
									target.addTempSkill("mcpfangzhu_ban", { player: "phaseEnd" });
								},
								ai: {
									result: {
										target(player, target) {
											return -target.getSkills(null, false).filter(i => get.info(i) && !get.info(i).charlotte).length * get.threaten(target, player);
										},
									},
								},
							},
							{
								cost: 2,
								prompt: () => "令一名其他角色不能响应除其外的角色使用的牌直到其回合结束",
								filter: player => game.hasPlayer(target => target != player && !target.hasSkill("mcpfangzhu_kill")),
								filterTarget: lib.filter.notMe,
								async content(player, target) {
									target.addTempSkill("mcpfangzhu_kill", { player: "phaseEnd" });
								},
								ai: {
									result: {
										target(player, target) {
											return -(target.countCards("hs") + 2) / target.hp;
										},
									},
								},
							},
							{
								cost: 3,
								prompt: () => "令一名其他角色将武将牌翻面",
								filter: player => game.hasPlayer(target => target != player),
								filterTarget: lib.filter.notMe,
								async content(player, target) {
									await target.turnOver();
								},
								ai: {
									result: {
										target(player, target) {
											return target.isTurnedOver() ? 3.5 : -3.5;
										},
									},
								},
							},
						],
						audio: ["ext:无名扩展/audio/skill/fangzhu1", "ext:无名扩展/audio/skill/fangzhu2"],
						enable: "phaseUse",
						filter(event, player) {
							return get.info("mcpfangzhu").getList.some(effect => {
								return player.countMark("mcpxingshang") >= effect.cost && effect.filter(player);
							});
						},
						usable: 1,
						chooseButton: {
							dialog() {
								let dialog = ui.create.dialog("放逐：请选择一项", "hidden");
								const list = get.info("mcpfangzhu").getList.slice();
								dialog.add([
									list.map(effect => {
										return [effect, "移去" + effect.cost + "个“颂”标记，" + effect.prompt()];
									}),
									"textbutton",
								]);
								return dialog;
							},
							filter(button, player) {
								const effect = button.link;
								return player.countMark("mcpxingshang") >= effect.cost && effect.filter(player);
							},
							check(button) {
								const player = get.event().player,
									effect = button.link;
								return Math.max(
									...game
										.filterPlayer(target => {
											const filterTarget = effect.filterTarget;
											if (!filterTarget) {
												return target == player;
											}
											if (typeof filterTarget == "function") {
												return filterTarget(null, player, target);
											}
											return true;
										})
										.map(target => {
											game.broadcastAll(effect => (lib.skill["mcpxingshang_aiSkill"].ai = effect.ai), effect);
											return get.effect(target, "mcpxingshang_aiSkill", player, player);
										})
								);
							},
							backup(links, player) {
								const effect = links[0];
								return {
									effect: effect,
									audio: ["ext:无名扩展/audio/skill/fangzhu1", "ext:无名扩展/audio/skill/fangzhu2"],
									audioname: ["mb_caomao"],
									filterCard: () => false,
									selectCard: -1,
									filterTarget: effect.filterTarget,
									async content(event, trigger, player) {
										const target = event.targets[0],
											effect = lib.skill.mcpfangzhu_backup.effect;
										player.removeMark("mcpxingshang", effect.cost);
										await effect.content(player, target);
									},
									ai: effect.ai,
								};
							},
							prompt(links, player) {
								const effect = links[0],
									str = "###放逐###";
								return str + '<div class="text center">' + "移去" + effect.cost + "个“颂”标记，" + effect.prompt() + "</div>";
							},
						},
						ai: {
							combo: "mcpxingshang",
							order: 7,
							result: {
								player(player) {
									const list = get.info("mcpfangzhu").getList.filter(effect => {
										return player.countMark("mcpxingshang") >= effect.cost && effect.filter(player);
									});
									return Math.max(
										...list.map(effect => {
											return Math.max(
												...game
													.filterPlayer(target => {
														const filterTarget = effect.filterTarget;
														if (!filterTarget) {
															return target == player;
														}
														if (typeof filterTarget == "function") {
															return filterTarget(null, player, target);
														}
														return true;
													})
													.map(target => {
														game.broadcastAll(effect => (lib.skill["mcpxingshang_aiSkill"].ai = effect.ai), effect);
														return get.effect(target, "mcpxingshang_aiSkill", player, player);
													})
											);
										})
									);
								},
							},
						},
						subSkill: {
							backup: {},
							baiban: {
								init(player, skill) {
									player.addSkillBlocker(skill);
									player.addTip(skill, "放逐 技能失效");
								},
								onremove(player, skill) {
									player.removeSkillBlocker(skill);
									player.removeTip(skill);
								},
								inherit: "baiban",
								marktext: "逐",
							},
							kill: {
								charlotte: true,
								mark: true,
								marktext: "禁",
								intro: { content: "不能响应其他角色使用的牌" },
								trigger: { global: "useCard1" },
								filter(event, player) {
									return event.player != player;
								},
								forced: true,
								popup: false,
								async content(event, trigger, player) {
									trigger.directHit.add(player);
								},
								init(player, skill) {
									player.addTip(skill, "放逐 无法响应");
								},
								onremove(player, skill) {
									player.removeTip(skill);
								},
							},
							ban: {
								charlotte: true,
								mark: true,
								marktext: "禁",
								intro: {
									markcount: () => 0,
									content(storage) {
										if (storage.length > 1) {
											return "不能使用手牌";
										}
										return "于手牌中只能使用" + get.translation(storage[0]) + "牌";
									},
								},
								init(player, skill) {
									let storage = player.getStorage(skill);
									if (storage.length) {
										player.addTip(skill, "放逐 限" + (storage.length === 1 ? get.translation(storage[0])[0] : "手牌"));
									}
								},
								onremove(player, skill) {
									player.removeTip(skill);
									delete player.storage[skill];
								},
								mod: {
									cardEnabled(card, player) {
										const storage = player.getStorage("mcpfangzhu_ban");
										const hs = player.getCards("h"),
											cards = [card];
										if (Array.isArray(card.cards)) {
											cards.addArray(card.cards);
										}
										if (cards.containsSome(...hs) && (storage.length > 1 || !storage.includes(get.type2(card)))) {
											return false;
										}
									},
									cardSavable(card, player) {
										return lib.skill.mcpfangzhu_ban.mod.cardEnabled(card, player);
									},
								},
							},
						},
					},
					mcpsongwei: {
						audio: ["ext:无名扩展/audio/skill/songwei1", "ext:无名扩展/audio/skill/songwei2"],
						trigger: { player: "phaseUseBegin" },
						filter(event, player) {
							if (player.countMark("mcpxingshang") >= get.info("mcpxingshang").getLimit) {
								return false;
							}
							return game.hasPlayer(target => target.group == "wei" && target != player);
						},
						zhuSkill: true,
						forced: true,
						locked: false,
						async content(event, trigger, player) {
							player.addMark("mcpxingshang", Math.min(get.info("mcpxingshang").getLimit - player.countMark("mcpxingshang"), 2 * game.countPlayer(target => target.group == "wei" && target != player)));
						},
						group: "mcpsongwei_delete",
						subSkill: {
							delete: {
								audio: ["ext:无名扩展/audio/skill/songwei1", "ext:无名扩展/audio/skill/songwei2"],
								enable: "phaseUse",
								filter(event, player) {
									if (player.getStorage("mcpsongwei_delete", false)) {
										return false;
									}
									return game.hasPlayer(target => lib.skill.mcpsongwei.subSkill.delete.filterTarget(null, player, target));
								},
								filterTarget(card, player, target) {
									return target != player && target.group == "wei" && target.getStockSkills(false, true).length;
								},
								skillAnimation: true,
								animationColor: "thunder",
								async content(event, trigger, player) {
									player.setStorage("mcpsongwei_delete", true);
									player.awakenSkill(event.name);
									await event.target.removeSkills(event.target.getStockSkills(false, true));
								},
								ai: {
									order: 13,
									result: {
										target(player, target) {
											return -target.getStockSkills(false, true).length;
										},
									},
								},
							},
						},
					},
					nwlthailang: {
						audio: ["ext:无名扩展/audio/skill/hailang1", "ext:无名扩展/audio/skill/hailang2", "ext:无名扩展/audio/skill/hailang3"],
						trigger: { player: "useCard2" },
						filter(event, player) {
							const card = event.card;
							if (!card) return false;
							const type = get.type(card);
							if (type !== "basic" && type !== "trick") return false;
							return game.hasPlayer(current => {
								return !event.targets.includes(current) && lib.filter.targetEnabled2(card, player, current);
							});
						},
						async cost(event, trigger, player) {
							const halfMaxHp = Math.ceil(player.maxHp / 2);
							const needLoseHp = player.hp > halfMaxHp;
							const prompt = needLoseHp ? `失去1点体力，为${get.translation(trigger.card)}增加任意个目标` : `为${get.translation(trigger.card)}增加任意个目标`;
							const card = trigger.card;
							const name = card.name;
							const canTargetSelf = !(name === "sha" || name === "juedou" || name === "nanmanruqin" || name === "wanjianqifa");
							const availableTargets = game.filterPlayer(target => {
								if (trigger.targets.includes(target)) return false;
								if (!canTargetSelf && target === player) return false;
								return lib.filter.targetEnabled2(card, player, target);
							});
							const targetResult = await player
								.chooseTarget(get.prompt("nwlthailang"), prompt, [1, availableTargets.length], (cardx, player, target) => {
									const evt = get.event();
									if (evt.hailangTrigger.targets.includes(target)) return false;
									if (!evt.canTargetSelf && target === player) return false;
									return lib.filter.targetEnabled2(evt.hailangTrigger.card, player, target);
								})
								.set("hailangTrigger", trigger)
								.set("canTargetSelf", canTargetSelf)
								.set("ai", target => {
									const evt = get.event();
									const triggerCard = evt.hailangTrigger.card;
									const cardName = triggerCard.name;
									const att = get.attitude(player, target);
									if (cardName === "wuzhongshengyou" || cardName === "tao") {
										if (att > 0) return 10;
										return -1;
									}
									if (cardName === "shunshouqianyang" || cardName === "sha") {
										if (att < 0) return get.effect(target, triggerCard, player, player);
										return -1;
									}
									return get.effect(target, triggerCard, player, player);
								})
								.forResult();
							if (targetResult.bool && targetResult.targets?.length) {
								event.result = {
									bool: true,
									cost_data: { targets: targetResult.targets, needLoseHp },
								};
							}
						},
						async content(event, trigger, player) {
							const { targets, needLoseHp } = event.cost_data;
							if (needLoseHp) {
								await player.loseHp(1);
							}
							game.log(player, "为", trigger.card, "增加了", targets, "为目标");
							trigger.targets.addArray(targets);
						},
						ai: {
							expose: 0.2,
						},
						mod: {
							attackRange(player, num) {
								return num + 1;
							},
						},
					},
					nwltgongzheng: {
						audio: "ext:无名扩展/audio/skill/gongzheng",
						forced: true,
						trigger: {
							global: "useCardAfter",
						},
						filter(event, player) {
							if (_status.currentPhase !== event.player) return false;
							const card = event.card;
							if (!card) return false;
							const color = get.color(card);
							const evt = event.getParent("phase");
							if (!evt || evt.player !== event.player) return false;
							return !event.player.hasHistory(
								"useCard",
								evtx => {
									return evtx !== event && get.color(evtx.card) === color && evtx.getParent("phase") === evt;
								},
								event
							);
						},
						async content(event, trigger, player) {
							const card = trigger.card;
							if (!card) return;
							const color = get.color(card);
							const cards = game.cardsGotoOrdering(get.cards(2)).cards;
							player.showCards(cards, `${get.translation(player)}发动了【公正】`);
							const sameColorCards = cards.filter(c => get.color(c) === color);
							const shownCardsStr = cards.map(c => get.translation(c)).join("、");
							const sameColorStr = sameColorCards.map(c => get.translation(c)).join("、");
							const promptStr = `<div class="text center">亮出了：${shownCardsStr}<br>相同颜色的牌：${sameColorStr || "无"}`;
							const otherCards = cards.filter(c => get.color(c) !== color);
							const usedCardSuit = get.suit(card);
							const hasSameSuit = cards.some(c => get.suit(c) === usedCardSuit);
							const hasTao = cards.some(c => c.name === "tao");
							const cardsValue = cards.reduce((sum, c) => sum + (get.value(c, player) ?? 0), 0);
							const sameColorValue = sameColorCards.reduce((sum, c) => sum + (get.value(c, player) ?? 0), 0);
							const result = await player
								.chooseControl(["其获得相同颜色的牌", "其受到1点伤害", "其回复1点体力"])
								.set("prompt", promptStr)
								.set("gongzhengTrigger", trigger)
								.set("gongzhengColor", color)
								.set("gongzhengCards", cards)
								.set("ai", () => {
									const evt = get.event();
									const target = evt.gongzhengTrigger.player;
									if (target === player) {
										return "其回复1点体力";
									}
									const att = get.attitude(player, target);
									if (att > 0) {
										if (target.isDamaged()) return "其回复1点体力";
										if (evt.cardsValue > 6) {
											if (Math.random() < 0.5) return "其受到1点伤害";
										}
										if (evt.sameColorCards.length > 0) return "其获得相同颜色的牌";
										return "其回复1点体力";
									} else {
										if (evt.sameColorCards.length === evt.gongzhengCards.length) return "其受到1点伤害";
										if (target.hp === 1) return "其受到1点伤害";
										if (target.hp === target.maxHp) return "其回复1点体力";
										if (target.hp < target.maxHp && !evt.hasSameSuit && evt.sameColorCards.length > 0 && evt.otherCards.length > 0) return "其获得相同颜色的牌";
										if (target.hp < target.maxHp && evt.hasTao) return "其回复1点体力";
										if (evt.sameColorCards.length > 0 && evt.otherCards.length > 0) {
											if (evt.sameColorValue > 5) return "其回复1点体力";
											return "其受到1点伤害";
										}
										if (evt.cardsValue > 5) {
											if (evt.sameColorCards.length > 0 && evt.otherCards.length > 0) return "其获得相同颜色的牌";
											return "其回复1点体力";
										}
										return "其受到1点伤害";
									}
								})
								.set("sameColorCards", sameColorCards)
								.set("otherCards", otherCards)
								.set("hasSameSuit", hasSameSuit)
								.set("hasTao", hasTao)
								.set("cardsValue", cardsValue)
								.set("sameColorValue", sameColorValue)
								.forResult();
							if (result.control === "其获得相同颜色的牌") {
								if (sameColorCards.length > 0) {
									await trigger.player.gain(sameColorCards, "gain2");
								}
								if (otherCards.length > 0) {
									await player.gain(otherCards, "gain2");
								}
							} else if (result.control === "其受到1点伤害") {
								await trigger.player.damage(1, null, null, "nocard");
								await trigger.player.gain(cards, "gain2");
							} else if (result.control === "其回复1点体力") {
								await trigger.player.recover(1);
								await player.gain(cards, "gain2");
							}
						},
					},
					nwltjuecai: {
						audio: ["ext:无名扩展/audio/skill/juecai1", "ext:无名扩展/audio/skill/juecai2", "ext:无名扩展/audio/skill/juecai3"],
						enable: "phaseUse",
						usable: 1,
						direct: true,
						filter(event, player) {
							return player.countMark("nwltjuecai_chang") > 0 && !player.hasSkill("nwltjuecai_used");
						},
						async content(event, trigger, player) {
							const maxChang = player.countMark("nwltjuecai_chang");
							const result = await player
								.chooseControl(Array.from({ length: maxChang }, (_, i) => i + 1 + "个").concat("cancel2"))
								.set("prompt", "请选择要移去的“偿”标记数量")
								.set("ai", () => {
									const p = _status.event.player;
									return p.countMark("nwltjuecai_chang") + "个";
								})
								.forResult();
							if (!result.control || result.control === "cancel2") {
								delete player.getStat("skill").nwltjuecai;
								return;
							}
							const num = parseInt(result.control);
							player.removeMark("nwltjuecai_chang", num);
							player.logSkill("nwltjuecai");
							player.$skill("决裁", "legend", "water");
							const currentExtra = player.countMark("nwltjuecai_extra");
							player.addMark("nwltjuecai_extra", num);
							player.markSkill("nwltjuecai_extra");
							game.log(player, "下一张使用的牌额外结算" + (currentExtra + num) + "次");
							player.addTempSkill("nwltjuecai_used");
						},
						ai: {
							order: 7,
							result: {
								player(player) {
									return 1;
								},
							},
						},
						group: ["nwltjuecai_trigger", "nwltjuecai_effect"],
						subSkill: {
							chang: {
								mark: true,
								marktext: "偿",
								intro: {
									name: "偿",
									content: "mark",
								},
							},
							trigger: {
								trigger: { global: "phaseEnd" },
								forced: true,
								filter(event, player) {
									let count = 0;
									game.getGlobalHistory("cardMove", evt => {
										if (evt.name === "lose" && evt.position === ui.discardPile) {
											count += evt.cards?.length ?? 0;
										} else if (evt.name === "cardsDiscard") {
											count += evt.cards?.length ?? 0;
										}
									});
									return count >= 5;
								},
								async content(event, trigger, player) {
									player.addMark("nwltjuecai_chang", 1);
								},
							},
							effect: {
								trigger: { player: "useCardToTargeted" },
								filter(event, player) {
									return player.countMark("nwltjuecai_extra") > 0;
								},
								forced: true,
								async content(event, trigger, player) {
									const extra = player.countMark("nwltjuecai_extra");
									if (extra > 0) {
										player.removeMark("nwltjuecai_extra", extra);
										player.unmarkSkill("nwltjuecai_extra");
										game.log(player, "额外结算" + extra + "次");
										const useCardEvt = trigger.getParent("useCard");
										if (useCardEvt) {
											useCardEvt.effectCount = (useCardEvt.effectCount || 0) + extra;
										}
									}
								},
							},
							used: {
								charlotte: true,
							},
							extra: {
								charlotte: true,
								mark: true,
								marktext: "决",
								intro: {
									name: "决裁",
									content(storage, player) {
										const count = player.countMark("nwltjuecai_extra");
										if (count > 0) {
											return "下一张使用的牌额外结算" + count + "次";
										}
										return "";
									},
								},
							},
						},
					},
					atzfzhenli: {
						forced: true,
						trigger: {
							player: ["phaseBegin", "phaseEnd", "gainAfter", "loseAfter", "changeHp", "gainMaxHpAfter", "loseMaxHpAfter"],
							global: ["equipAfter", "addJudgeAfter", "gainAfter", "loseAsyncAfter", "addToExpansionAfter"],
						},
						filter(event, player) {
							if (event.getl && !event.getl(player)) return false;
							return player.countCards("h") < player.maxHp;
						},
						async content(event, trigger, player) {
							game.playSkillBgm("atzfzhenli");
							await player.draw(player.maxHp - player.countCards("h"));
						},

						mod: {
							attackRange(player, num) {
								return 999;
							},
							targetInRange(card, player) {
								return true;
							},
						},
					},
					atzfchiyuan: {
						audio: ["ext:无名扩展/audio/skill/chiyuan"],
						enable: "phaseUse",
						usable: 1,
						filter(event, player) {
							return player.hasCards("h");
						},
						filterTarget: lib.filter.notMe,
						filterCard(card) {
							return true;
						},
						selectCard: [1, Infinity],
						allowChooseAll: true,
						position: "h",
						discard: false,
						lose: false,
						delay: false,
						async content(event, trigger, player) {
							await player.give(event.cards, event.targets[0]);
						},
						check(card) {
							return 7 - get.value(card);
						},
						ai: {
							order: 1,
							result: {
								target(player, target) {
									if (target.hasSkillTag("nogain")) return 0;
									return Math.max(1, 5 - target.countCards("h"));
								},
							},
							effect: {
								player_use(card, player, target) {
									if (player.hasCards("h")) {
										const cards = player.getCards("h");
										const hasUsable = cards.some(c => player.hasUseTarget(c));
										if (!hasUsable) {
											return [1, 0, 1, 0];
										}
									}
								},
							},
						},
					},
					alqnhuahui: {
						audio: ["ext:无名扩展/audio/skill/huahui1", "ext:无名扩展/audio/skill/huahui2", "ext:无名扩展/audio/skill/huahui3"],
						trigger: { global: "roundStart" },
						frequent: true,
						locked: false,
						filter(event, player) {
							return game.hasPlayer(target => target !== player);
						},
						async cost(event, trigger, player) {
							const result = await player
								.chooseTarget({
									prompt: get.prompt("alqnhuahui"),
									selectTarget: [1, Infinity],
									filterTarget(card, player, target) {
										return target !== player;
									},
									ai(target) {
										return 1;
									},
								})
								.forResult();
							event.result = {
								bool: result.bool,
								targets: result.targets,
							};
						},
						async content(event, trigger, player) {
							if (!event.targets?.length) return;
							player.setStorage("alqnhuahui_huahuiUsed", true);
							const targetCount = event.targets.length;
							for (const target of event.targets) {
								target.addMark("alqnhuahui_xue", 1);
							}
							const roundGain = player.getStorage("alqnhuahui_roundGain", 0);
							const curMingqi = player.countMark("alqnhuahui_mingqi");
							const toGain = Math.min(targetCount, 3 - roundGain, 4 - curMingqi);
							if (toGain > 0) {
								player.addMark("alqnhuahui_mingqi", toGain);
								player.setStorage("alqnhuahui_roundGain", roundGain + toGain);
							}
						},
						group: ["alqnhuahui_xue", "alqnhuahui_gain", "alqnhuahui_roundreset", "alqnhuahui_roundend", "alqnhuahui_mingqi"],
						ai: {
							order: 1,
							result: {
								player(player) {
									return 1;
								},
							},
						},
						subSkill: {
							xue: {
								charlotte: true,
								mark: true,
								markcount(storage, player) {
									return player.countMark("alqnhuahui_xue");
								},
								marktext: "血",
								intro: {
									name: "血偿",
									content(storage, player) {
										const count = player.countMark("alqnhuahui_xue");
										if (count > 0) {
											return "你拥有" + count + "个“血偿”标记";
										}
										return "";
									},
								},
							},
							gain: {
								charlotte: true,
								trigger: { player: "useCardAfter" },
								forced: true,
								filter(event, player) {
									if (!event.targets) return false;
									return event.targets.some(target => target !== player && target.hasMark("alqnhuahui_xue"));
								},
								async content(event, trigger, player) {
								for (const target of trigger.targets) {
									target.removeMark("alqnhuahui_xue", 1);
										const roundGain = player.getStorage("alqnhuahui_roundGain", 0);
										const curMingqi = player.countMark("alqnhuahui_mingqi");
										if (roundGain < 3 && curMingqi < 4) {
											const toGain = Math.min(1, 3 - roundGain, 4 - curMingqi);
											if (toGain > 0) {
												player.addMark("alqnhuahui_mingqi", toGain);
												player.setStorage("alqnhuahui_roundGain", roundGain + toGain);
											}
										}
										await player.draw();
									}
								for (const target of trigger.targets) {
									if (target.countMark("alqnhuahui_xue") > 0) {
											target.markSkill("alqnhuahui_xue");
										} else {
											target.unmarkSkill("alqnhuahui_xue");
										}
									}
								},
							},
							roundreset: {
								charlotte: true,
								trigger: { global: "roundStart" },
								forced: true,
								silent: true,
								firstDo: true,
								async content(event, trigger, player) {
									player.setStorage("alqnhuahui_roundGain", 0);
								},
							},
							roundend: {
								charlotte: true,
								trigger: { global: "roundEnd" },
								forced: true,
								filter(event, player) {
									return game.hasPlayer(target => target.hasMark("alqnhuahui_xue"));
								},
								async content(event, trigger, player) {
									const allPlayers = game.filterPlayer();
									let xueCount = 0;
									for (const target of allPlayers) {
										if (target.hasMark("alqnhuahui_xue")) {
											const count = target.countMark("alqnhuahui_xue");
											xueCount += count;
											target.removeMark("alqnhuahui_xue", count);
										}
									}
									for (const target of allPlayers) {
										if (target.countMark("alqnhuahui_xue") > 0) {
											target.markSkill("alqnhuahui_xue");
										} else {
											target.unmarkSkill("alqnhuahui_xue");
										}
									}
									if (xueCount > 0) {
										await player.draw(xueCount);
									}
								},
							},
							mingqi: {
								charlotte: true,
								mark: true,
								markcount(storage, player) {
									return player.countMark("alqnhuahui_mingqi");
								},
								marktext: "契",
								intro: {
									name: "命契",
									content(storage, player) {
										const count = player.countMark("alqnhuahui_mingqi");
										if (count > 0) {
											return "你拥有" + count + "个“命契”标记";
										}
										return "";
									},
								},
							},
						},
					},
					alqnzhanshou: {
						charlotte: true,
						targetprompt2(target) {
							const player = get.player();
							if (target !== player && target.hasMark("alqnhuahui_xue")) {
								return "不可响应";
							}
						},
						onChooseToUse(event) {
							event.targetprompt2.add(lib.skill.alqnzhanshou.targetprompt2);
						},
						onChooseTarget(event) {
							event.targetprompt2.add(lib.skill.alqnzhanshou.targetprompt2);
						},
						forced: true,
						trigger: { player: "useCard" },
						filter(event, player) {
							if (!event.card) return false;
							if (!event.targets?.length) return false;
							return event.targets.some(target => target !== player && target.hasMark("alqnhuahui_xue"));
						},
						async content(event, trigger, player) {
							trigger.directHit.addArray(game.filterPlayer(current => current !== player && current.hasMark("alqnhuahui_xue")));
						},
						ai: {
							directHit_ai: true,
							skillTagFilter(player, tag, arg) {
								if (arg?.target?.hasMark("alqnhuahui_xue")) return true;
								return false;
							},
						},
						group: ["alqnzhanshou_damage"],
						subSkill: {
							damage: {
								charlotte: true,
								audio: ["ext:无名扩展/audio/skill/zhanshou1", "ext:无名扩展/audio/skill/zhanshou2"],
								trigger: { source: "damageBegin1" },
								filter(event, player) {
									if (event.source !== player) return false;
									if (get.attitude(player, event.player) >= 0) return false;
									return player.countMark("alqnhuahui_mingqi") > 0;
								},
								check(event, player) {
									return get.attitude(player, event.player) < 0 && player.countMark("alqnhuahui_mingqi") > 0;
								},
								direct: true,
								locked: false,
								async content(event, trigger, player) {
									const x = player.countMark("alqnhuahui_mingqi");
									const boolResult = await player
										.chooseBool("斩首：是否令此次伤害+" + x + "并改为火焰伤害，弃置一枚“命契”？")
										.set("ai", () => get.attitude(player, trigger.player) < 0)
										.forResult();
									if (boolResult.bool) {
										trigger.num += x;
										game.setNature(trigger, "fire");
										player.removeMark("alqnhuahui_mingqi", 1);
										if (player.countMark("alqnhuahui_mingqi") === 0) {
											player.unmarkSkill("alqnhuahui_mingqi");
										}
										player.logSkill("alqnzhanshou_damage");
									}
								},
								ai: {
									expose: 0.2,
								},
							},
						},
					},
					alqneyue: {
						audio: ["ext:无名扩展/audio/skill/eyue1", "ext:无名扩展/audio/skill/eyue2", "ext:无名扩展/audio/skill/eyue3"],
						enable: "chooseToUse",
						skillAnimation: true,
						group: ["alqneyue_roundreset", "alqneyue_norecover"],
						filter(event, player) {
							if (player.getStorage("alqneyue_used", false)) return false;
							if (player.countMark("alqnhuahui_mingqi") === 0) return false;
							if (event.type === "dying") {
								return player === event.dying;
							}
							if (_status.currentPhase === player && event.name === "chooseToUse") {
								if (event.respondTo) return false;
								return true;
							}
							return false;
						},
						async content(event, trigger, player) {
							const n = player.countMark("alqnhuahui_mingqi");
							player.removeMark("alqnhuahui_mingqi", n);
							if (player.countMark("alqnhuahui_mingqi") === 0) {
								player.unmarkSkill("alqnhuahui_mingqi");
							}
							await player.draw(n);
							player.removeSkill("alqneyue_norecover");
							await player.recover(n + 1);
							player.addSkill("alqneyue_norecover");
							player.setStorage("alqnhuahui_roundGain", 0);
							if (player.getStorage("alqnhuahui_huahuiUsed", false)) {
								player.setStorage("alqnhuahui_huahuiUsed", false);
								const stat = player.getStat("skill");
								if (stat.alqnhuahui !== undefined) {
									delete stat.alqnhuahui;
								}
							}
							player.setStorage("alqneyue_used", true);
						},
						ai: {
							order: 3,
							save: true,
							result: {
								player(player) {
									if (player.getHp() <= 0) return 13;
									const lostHp = player.maxHp - player.getHp();
									const handCount = player.countCards("h");
									if (lostHp >= 2 || handCount <= 1) {
										return 1;
									} else return 0;
								},
							},
						},
						subSkill: {
							roundreset: {
								charlotte: true,
								trigger: { global: "roundStart" },
								forced: true,
								silent: true,
								filter(event, player) {
									return player.getStorage("alqneyue_used", false);
								},
								async content(event, trigger, player) {
									player.setStorage("alqneyue_used", false);
								},
							},
							norecover: {
								charlotte: true,
								mark: true,
								intro: { content: "不能通过【厄月】外的途径回复体力" },
								trigger: { player: "recoverBefore" },
								forced: true,
								firstDo: true,
								check(event, player) {
									return false;
								},
								async content(event, trigger, player) {
									trigger.cancel();
								},
								ai: {
									effect: {
										target(card, player, target) {
											if (get.tag(card, "recover")) {
												return "zeroplayertarget";
											}
										},
									},
								},
							},
						},
					},
					zgnxiezou: {
						audio: ["ext:无名扩展/audio/skill/xiezou1", "ext:无名扩展/audio/skill/xiezou2"],
						enable: "phaseUse",
						direct: true,
						round: 1,
						skillAnimation: true,
						async content(event, trigger, player) {
							const targetResult = await player
								.chooseTarget("选择至少一名角色执行额外回合", [1, Infinity], (card, player, target) => {
									return target != player;
								})
								.set("ai", target => {
									const att = get.attitude(player, target);
									if (att <= 0) return 0;
									return att;
								})
								.forResult();
							if (!targetResult.bool || !targetResult.targets?.length) return;
							player.logSkill("zgnxiezou");
							setTimeout(() => {
								game.playSkillBgm("zgnxiezou");
							}, 3000);
							player.addSkill("zgnxiezou_extra");
							player.addSkill("zgnxiezou_kill");
							player.setStorage("zgnxiezou_extra_turns", targetResult.targets.slice());
							player.setStorage("zgnxiezou_extra_turn_index", 0);
							const evt = event.getParent("phaseUse");
							if (evt) {
								evt.skipped = true;
								game.log(player, "结束了出牌阶段");
							}
						},
						ai: {
							order: 3,
							result: {
								player(player) {
									if (!game.hasPlayer(p => p !== player && get.attitude(player, p) > 0)) {
										return 0;
									}
									return 1;
								},
							},
						},
						subSkill: {
							extra: {
								trigger: { global: "phaseEnd" },
								forced: true,
								filter(event, player) {
									const turns = player.getStorage("zgnxiezou_extra_turns", []);
									return turns.length > 0;
								},
								async content(event, trigger, player) {
									const turns = player.getStorage("zgnxiezou_extra_turns", []);
									let turnIndex = player.getStorage("zgnxiezou_extra_turn_index", 0);
									if (turns.length === 0) return;
									if (turnIndex < turns.length) {
										const target = turns[turnIndex];
										if (target?.isAlive()) {
											game.log(player, "令", target, "执行一个额外的回合");
											const next = target.insertPhase();
											next._noTurnOver = true;
											next.phaseList = ["phaseZhunbei", "phaseJudge", "phaseDraw", "phaseUse", "phaseDiscard", "phaseJieshu"];
											player.setStorage("zgnxiezou_current_target", target);
											player.setStorage("zgnxiezou_extra_turn_index", turnIndex + 1);
										} else {
											player.setStorage("zgnxiezou_extra_turn_index", turnIndex + 1);
										}
									} else {
										player.removeSkill("zgnxiezou_extra");
										player.removeSkill("zgnxiezou_kill");
										const judgeCards = player.getCards("j");
										if (judgeCards.length > 0) {
											await player.discard(judgeCards);
											game.log(player, "弃置了判定区的牌");
										}
										game.log(player, "执行一个额外的回合");
										const next = player.insertPhase();
										next._noTurnOver = true;
										next.phaseList = ["phaseZhunbei", "phaseJudge", "phaseDraw", "phaseUse", "phaseDiscard", "phaseJieshu"];
										player.setStorage("zgnxiezou_extra_turns", undefined);
										player.setStorage("zgnxiezou_extra_turn_index", undefined);
										player.setStorage("zgnxiezou_current_target", undefined);
									}
								},
							},
							kill: {
								trigger: { global: "useCardAfter" },
								filter(event, player) {
									const target = event.player;
									const turns = player.getStorage("zgnxiezou_extra_turns", []);
									if (!target || !turns.includes(target)) return false;
									if (!get.tag(event.card, "damage") || !event.targets?.length) return false;
									return game.hasPlayer(p => p != player && get.attitude(player, p) < 0 && player.canUse({ name: "sha" }, p));
								},
								async content(event, trigger, player) {
									await player.chooseUseTarget({ name: "sha" }, true).set("ai", target => -get.attitude(player, target));
								},
							},
						},
					},
					skkjimie: {
						forced: true,
						locked: false,
						trigger: { player: "phaseUseBegin" },
						async content(event, trigger, player) {
							let currentMarks = player.countMark("skkjimie_liexi");
							const toAdd = Math.min(5, 10 - currentMarks);
							if (toAdd > 0) {
								player.addMark("skkjimie_liexi", toAdd);
								player.markSkill("skkjimie_liexi");
								currentMarks += toAdd;
							}
							const x = currentMarks;
							const y = Math.ceil(currentMarks / 2);
							const choiceList = ["极恶技·闪：你使用前" + x + "张牌无次数限制", "极恶技·灭：对一名角色造成" + y + "点伤害并摸" + x + "张牌"];
							const controlResult = await player
								.chooseControl("极恶技·闪", "极恶技·灭", "取消", () => {
									const liexi = player.countMark("skkjimie_liexi");
									const hasEnemyOutOfRange = game.hasPlayer(target => {
										return target != player && get.attitude(player, target) < 0 && !player.inRange(target);
									});
									if (hasEnemyOutOfRange && liexi > 0) return "极恶技·灭";
									if (liexi > 0) return "极恶技·闪";
									return "取消";
								})
								.set("choiceList", choiceList)
								.set("prompt", "寂灭：请选择一项")
								.forResult();
							if (controlResult.control === "极恶技·闪") {
								player.setStorage("skkjimie_choice", "shan");
								player.logSkill("skkjimie");
								game.log(player, "选择了【极恶技·闪】");
							} else if (controlResult.control === "极恶技·灭") {
								player.$skill("极恶技·灭", "legend", "ice");
								player.setStorage("skkjimie_choice", "mie");
								player.logSkill("skkjimie");
								game.log(player, "选择了【极恶技·灭】");
							} else {
								return;
							}
							const choice = player.getStorage("skkjimie_choice");
							if (choice === "mie") {
								game.playAudio("..", "extension", "无名扩展", "audio/skill/jiejimie" + (Math.floor(Math.random() * 3) + 1));
								const mieCount = player.countMark("skkjimie_liexi");
								if (mieCount > 0) {
									player.removeMark("skkjimie_liexi", mieCount);
									const damage = Math.ceil(mieCount / 2);
									if (damage > 0) {
										const targetResult = await player
											.chooseTarget(true, "选择一名其他角色造成" + damage + "点伤害", (card, player, target) => {
												return target != player;
											})
											.set("ai", target => get.damageEffect(target, player, player))
											.forResult();
										await player.draw(mieCount);
										if (targetResult.targets?.length > 0) {
											const target = targetResult.targets[0];
											await target.damage(damage);
											game.log(player, "对", target, "造成了", damage, "点伤害");
										}
									}
								}
							}
							if (player.countMark("skkjimie_liexi") <= 0) {
								player.unmarkSkill("skkjimie_liexi");
							} else {
								player.markSkill("skkjimie_liexi");
							}
						},
						group: ["skkjimie_jieshan", "skkjimie_reset"],
						ai: {
							order: 1,
							result: {
								player(player) {
									return 1;
								},
							},
						},
						subSkill: {
							jieshan: {
								audio: ["ext:无名扩展/audio/skill/jiejishan1", "ext:无名扩展/audio/skill/jiejishan2", "ext:无名扩展/audio/skill/jiejishan3", "ext:无名扩展/audio/skill/jiejishan4", "ext:无名扩展/audio/skill/jiejishan5"],
								charlotte: true,
								trigger: { player: "useCardAfter" },
								firstDo: true,
								filter(event, player) {
									return player.getStorage("skkjimie_choice") === "shan" && player.countMark("skkjimie_liexi") > 0;
								},
								forced: true,
								silent: false,
								async content(event, trigger, player) {
									await player.draw(2);
									player.removeMark("skkjimie_liexi", 1);
									if (player.countMark("skkjimie_liexi") <= 0) {
										player.unmarkSkill("skkjimie_liexi");
										player.setStorage("skkjimie_choice", null);
									} else {
										player.markSkill("skkjimie_liexi");
									}
								},
								mod: {
									cardUsable(card, player, num) {
										if (player.getStorage("skkjimie_choice") === "shan" && player.countMark("skkjimie_liexi") > 0) {
											return Infinity;
										}
									},
								},
							},
							reset: {
								charlotte: true,
								trigger: { player: "phaseEnd" },
								forced: true,
								silent: true,
								async content(event, trigger, player) {
									const choice = player.getStorage("skkjimie_choice");
									if (choice === "shan") {
										player.setStorage("skkjimie_choice", null);
										if (player.countMark("skkjimie_liexi") <= 0) {
											player.unmarkSkill("skkjimie_liexi");
										}
									}
								},
							},
							liexi: {
								charlotte: true,
								mark: true,
								marktext: "隙",
								markcount(storage, player) {
									return player.countMark("skkjimie_liexi");
								},
								intro: {
									name: "裂隙",
									content(storage, player) {
										const count = player.countMark("skkjimie_liexi");
										if (count > 0) {
											return "你拥有" + count + "枚“裂隙”标记";
										}
										return "";
									},
								},
								onremove(player) {
									player.setStorage("skkjimie_choice", undefined);
									player.setStorage("skkduduan_roundGain", undefined);
								},
							},
						},
					},
					skkduduan: {
						audio: ["ext:无名扩展/audio/skill/duduan1", "ext:无名扩展/audio/skill/duduan2"],
						forced: true,
						locked: false,
						trigger: { global: "useCardAfter" },
						filter(event, player) {
							const roundGain = player.getStorage("skkduduan_roundGain", 0);
							if (roundGain >= 3) return false;
							if (player.countMark("skkjimie_liexi") >= 10) return false;
							if (!event.targets?.length) return false;
							const targets = event.targets.filter(target => target != player && target != event.player);
							return targets.some(target => {
								const hasResponded = target.hasHistory("useCard", evt => {
									return evt.respondTo && evt.respondTo[1] === event.card;
								});
								const hasResponded2 = target.hasHistory("respond", evt => {
									return evt.respondTo && evt.respondTo[1] === event.card;
								});
								return !hasResponded && !hasResponded2;
							});
						},
						async content(event, trigger, player) {
							let roundGain = player.getStorage("skkduduan_roundGain", 0);
							const targets = trigger.targets.filter(target => target != player && target != trigger.player);
							let unresponsedCount = 0;
							for (const target of targets) {
								const hasResponded = target.hasHistory("useCard", evt => {
									return evt.respondTo && evt.respondTo[1] === trigger.card;
								});
								const hasResponded2 = target.hasHistory("respond", evt => {
									return evt.respondTo && evt.respondTo[1] === trigger.card;
								});
								if (!hasResponded && !hasResponded2) {
									unresponsedCount++;
								}
							}
							for (let i = 0; i < unresponsedCount; i++) {
								if (roundGain < 3) {
									const currentMarks = player.countMark("skkjimie_liexi");
									if (currentMarks < 10) {
										player.addMark("skkjimie_liexi", 1);
										roundGain++;
										player.setStorage("skkduduan_roundGain", roundGain);
										player.markSkill("skkjimie_liexi");
									} else {
										break;
									}
								} else {
									break;
								}
							}
						},
						group: ["skkduduan_reset"],
						subSkill: {
							reset: {
								charlotte: true,
								trigger: { global: "phaseAfter" },
								forced: true,
								silent: true,
								async content(event, trigger, player) {
									const roundGain = player.getStorage("skkduduan_roundGain", 0);
									if (roundGain > 0) {
										player.setStorage("skkduduan_roundGain", 0);
									}
								},
							},
						},
					},
					ylshanshuo: {
						audio: ["ext:无名扩展/audio/skill/shanshuo1", "ext:无名扩展/audio/skill/shanshuo2"],
						trigger: { player: "damageEnd" },
						forced: true,
						locked: false,
						async content(event, trigger, player) {
							await player.draw();
							const fromKanpo = player.getStorage("ylshanshuo_fromKanpo", false);
							if (fromKanpo) {
								game.playAudio("..", "extension", "无名扩展", "audio/skill/kanpo" + (Math.floor(Math.random() * 2) + 2));
							}
							player.setStorage("ylshanshuo_using", true);
							const result = await player
								.chooseToUse()
								.set("openskilldialog", "###闪烁###将一张牌当作无距离限制、至多可指定三个目标的【杀】使用")
								.set("norestore", true)
								.set("_backupevent", "ylshanshuo_backup")
								.set("custom", { add: {}, replace: { window() {} } })
								.backup("ylshanshuo_backup")
								.set("addCount", false)
								.forResult();
							player.setStorage("ylshanshuo_using", false);
							if (result.bool) {
								game.log(player, "将", result.cards[0], "当作【杀】使用了");
							}
						},
						ai: {
							maixie: true,
							maixie_hp: true,
							effect: {
								target(card, player, target) {
									if (target.hasSkill("ylshanshuo") && target.hasSkill("ylxiahe") && get.tag(card, "damage")) {
										if (player.hasSkillTag("jueqing", false, target)) {
											return [1, -2];
										}
										if (get.attitude(target, player) > 0) {
											return [0.5, get.tag(card, "damage") * 2];
										}
										return [0, 0.4];
									}
								},
							},
							wuxie(card, player, target) {
								if (!target || !target.hasSkill("ylshanshuo") || !target.hasSkill("ylxiahe")) return;
								return -10;
							},
						},
						mod: {
							targetInRange(card, player, target) {
								if (player.getStorage("ylshanshuo_using", false)) {
									return true;
								}
							},
						},
						subSkill: {
							backup: {
								filterCard() {
									return get.itemtype(card) === "card";;
								},
								selectCard: 1,
								position: "he",
								viewAs: { name: "sha" },
								filterTarget(card, player, target) {
									return player !== target && lib.filter.targetEnabled({ name: "sha" }, player, target);
								},
								selectTarget: [1, 3],
								ai1(card) {
									return 15 - get.value(card);
								},
								ai2(target) {
									const player = get.player();
									const att = get.attitude(player, target);
									if (att >= 0) return -100;
									let effect = -att * 2;
									const targetHand = target.getCards("h");
									const hasShan = targetHand.some(c => get.name(c) === "shan");
									const hasJiu = targetHand.some(c => get.name(c) === "jiu");
									if (!hasShan) effect += 10;
									if (hasJiu) effect -= 5;
									return effect;
								},
							},
						},
					},
					ylxiahe: {
						audio: ["ext:无名扩展/audio/skill/xiahe1", "ext:无名扩展/audio/skill/xiahe2"],
						trigger: { source: "damageEnd" },
						forced: true,
						locked: false,
						async content(event, trigger, player) {
							const num = trigger.num || 1;
							await player.draw(num);
							const damage = player.getStorage("ylxiahe_damage", 0) + num;
							player.setStorage("ylxiahe_damage", damage);
							const recover = Math.floor(damage / 2);
							if (recover > 0) {
								player.setStorage("ylxiahe_damage", damage % 2);
								await player.recover(recover);
							}
						},
					},
					ylkanpo: {
						audio: ["ext:无名扩展/audio/skill/kanpo1"],
						trigger: { global: "phaseBegin" },
						forced: false,
						filter(event, player) {
							return event.player !== player && !event.player.hasSkill("xiuzheng") && player.getStorage("ylkanpo_round", 0) !== game.roundNumber;
						},
						check(event, player) {
							const target = event.player;
							if (get.attitude(player, target) >= 0) return false;
							const hand = target.getCards("h");
							const shaCount = hand.filter(c => get.name(c) === "sha" || get.name(c) === "juedou").length;
							if (shaCount >= 2 && player.hp <= 2) return false;
							return true;
						},
						skillAnimation: true,
						async content(event, trigger, player) {
							const target = trigger.player;
							player.setStorage("ylkanpo_round", game.roundNumber);
							let num = 0;
							let discardedCards = [];
							if (player.countCards("he") > 0) {
								const allCards = player.getCards("he");
								const dialog = ui.create.dialog("勘破：选择要弃置的牌");
								dialog.add([allCards, "card"]);
								dialog.add([
									[
										["all", "全选"],
										["none", "不弃置"],
									],
									"textbutton",
								]);
								const discardResult = await player
									.chooseButton(dialog, true)
									.set("filterButton", button => {
										return button.link === "all" || button.link === "none" || get.itemtype(button.link) === "card";
									})
									.set("selectButton", [0, allCards.length])
									.set("ai", button => {
										if (button.link === "all") {
											const totalValue = allCards.reduce((sum, c) => sum + get.value(c, player), 0);
											return 10 - totalValue / allCards.length;
										}
										if (button.link === "none") return 0;
										return 6 - get.value(button.link, player);
									})
									.forResult();
								if (discardResult.bool && discardResult.links?.length > 0) {
									if (discardResult.links.includes("all")) {
										num = allCards.length;
										discardedCards = allCards;
									} else if (!discardResult.links.includes("none")) {
										discardedCards = discardResult.links.filter(c => get.itemtype(c) === "card");
										num = discardedCards.length;
									}
									if (num > 0) {
										await player.discard(discardedCards);
									}
								}
							}
							player.setStorage("ylxiahe_fromKanpo", true);
							const topCards = num > 0 ? get.cards(num * 2, true) : [];
							const handCards = target.getCards("h");
							if (topCards.length > 0) {
								await target.showCards(topCards, "牌堆顶").set("delay_time", 3).set("nolog", true);
							}
							if (handCards.length > 0) {
								await target.showCards(handCards, "手牌").set("delay_time", 3).set("nolog", true);
							}
							player.setStorage("ylshanshuo_fromKanpo", true);
							const shaAndJuedou = [...topCards, ...handCards].filter(c => get.name(c) === "sha" || get.name(c) === "juedou");
							if (shaAndJuedou.length > 0) {
								for (const card of shaAndJuedou) {
									if (target.canUse(card, player, false, false)) {
										await target.useCard(card, player, false);
									}
								}
							}
							if (!event.damageReceived) {
								await player.draw();
								game.log(player, "发动了", "#g【闪烁】");
								game.playAudio("..", "extension", "无名扩展", "audio/skill/kanpo" + (Math.floor(Math.random() * 2) + 4));
								if (player.countCards("he") > 0) {
									player.setStorage("ylshanshuo_using", true);
									const useResult = await player
										.chooseToUse()
										.set("openskilldialog", "###闪烁###将一张牌当作无距离限制、至多可指定三个目标的【杀】使用")
										.set("norestore", true)
										.set("_backupevent", "ylkanpo_backup")
										.set("custom", { add: {}, replace: { window() {} } })
										.backup("ylkanpo_backup")
										.set("addCount", false)
										.forResult();
									player.setStorage("ylshanshuo_using", false);
									if (useResult.bool) {
										game.log(player, "将", useResult.cards[0], "当作【杀】使用了");
									}
								}
							}
							player.setStorage("ylxiahe_fromKanpo", false);
							player.setStorage("ylshanshuo_fromKanpo", false);
						},
						group: ["ylkanpo_damage"],
						subSkill: {
							backup: {
								filterCard(card, player) {
									return player.countCards("he", c => c === card) > 0;
								},
								selectCard: 1,
								position: "he",
								viewAs: { name: "sha" },
								filterTarget(card, player, target) {
									return player !== target && lib.filter.targetEnabled({ name: "sha" }, player, target);
								},
								selectTarget: [1, 3],
								ai1(card) {
									return 5 - get.value(card);
								},
								ai2(target) {
									const player = get.player();
									return get.effect(target, { name: "sha" }, player, player);
								},
							},
							damage: {
								charlotte: true,
								trigger: { player: "damageBegin4" },
								filter(event, player) {
									return event.getParent("ylkanpo");
								},
								silent: true,
								async content(event, trigger, player) {
									const evt = event.getParent("ylkanpo");
									if (evt) {
										evt.damageReceived = true;
									}
								},
							},
						},
					},
					atzwxingmian: {
						audio: ["ext:无名扩展/audio/skill/xingmian"],
						trigger: { global: "phaseBegin" },
						filter(event, player) {
							if (player.countCards("he") === 0) return false;
							const usedNames = player.getStorage("atzwxingmian_used", []);
							return (
								get.inpileVCardList(info => {
									if (!["basic", "trick"].includes(info[0])) return false;
									if (usedNames.includes(info[2])) return false;
									const card = get.autoViewAs({ name: info[2], nature: info[3] }, "unsure");
									return player.hasUseTarget(card);
								}).length > 0
							);
						},
						async cost(event, trigger, player) {
							const cardResult = await player
								.chooseCard("he", get.prompt2("atzwxingmian"))
								.set("ai", card => 6 - get.value(card))
								.forResult();
							if (!cardResult?.bool) {
								event.result = { bool: false };
								return;
							}
							const costCard = cardResult.cards[0];
							const usedNames = player.getStorage("atzwxingmian_used", []);
							const list = get.inpileVCardList(info => {
								if (!["basic", "trick"].includes(info[0])) return false;
								if (usedNames.includes(info[2])) return false;
								const card = get.autoViewAs({ name: info[2], nature: info[3] }, "unsure");
								return player.hasUseTarget(card);
							});
							if (list.length === 0) {
								event.result = { bool: false };
								return;
							}
							const buttonResult = await player
								.chooseButton(["星冕：选择要使用的牌", [list, "vcard"]], true)
								.set("ai", button => {
									return player.getUseValue({ name: button.link[2], nature: button.link[3] });
								})
								.forResult();
							if (!buttonResult?.bool) {
								event.result = { bool: false };
								return;
							}
							event.result = {
								bool: true,
								cost_data: {
									costCard: costCard,
									cardName: buttonResult.links[0][2],
									cardNature: buttonResult.links[0][3],
								},
							};
						},
						async content(event, trigger, player) {
							const { costCard, cardName, cardNature } = event.cost_data;
							player.addTempSkill("atzwxingmian_used", "roundStart");
							player.markAuto("atzwxingmian_used", [cardName]);
							const card = get.autoViewAs({ name: cardName, nature: cardNature }, [costCard]);
							await player.discard(costCard);
							await player.chooseUseTarget(card, true, false);
						},
						subSkill: {
							used: {
								charlotte: true,
								onremove: true,
								intro: { content: "本轮已使用牌名：$" },
							},
						},
					},
					atzwbuxi: {
						audio: ["ext:无名扩展/audio/skill/buxi1", "ext:无名扩展/audio/skill/buxi2"],
						trigger: { global: ["changeHp"] },
						filter(event, player) {
							if (!event.player || !event.player.isAlive()) return false;
							if (event.name === "damage") {
								return event.num > 0;
							}
							if (event.name === "changeHp") {
								return event.num !== 0;
							}
							return true;
						},
						async cost(event, trigger, player) {
							const target = trigger.player;
							const stat = player.getStat("skill");
							if (!stat.atzwbuxi) stat.atzwbuxi = 0;
							if (stat.atzwbuxi >= 4) {
								event.result = { bool: false };
								return;
							}
							const x = target.getHp();
							const choice1Valid = x > 0;
							const isHpFull = target.getHp() >= target.maxHp;
							const discardNum = Math.max(2, x);
							const choice3Valid = !isHpFull && target.countCards("he") >= discardNum;
							const choices = [];
							const choiceList = [];
							if (choice1Valid) {
								choices.push("摸牌");
								choiceList.push(`令其摸${get.cnNumber(x)}张牌`);
							}
							choices.push("取上取下");
							choiceList.push("选择两名角色执行摸牌弃牌");
							if (choice3Valid) {
								choices.push("弃牌回血");
								choiceList.push(`令其弃置${get.cnNumber(discardNum)}张牌，然后回复1点体力`);
							}
							choices.push("cancel");
							const remaining = 4 - stat.atzwbuxi;
							const result = await player
								.chooseControl(choices)
								.set("prompt", `【不息】（剩余${get.cnNumber(remaining)}次）是否令${get.translation(target)}执行一项？`)
								.set("choiceList", choiceList)
								.set("ai", () => {
									const att = get.attitude(player, target);
									const isDying = target.getHp() <= 0;
									if (att < 0) {
										if (choice3Valid && discardNum >= 4) {
											return "弃牌回血";
										}
										return "取上取下";
									} else {
										if (isDying) {
											if (choice3Valid) return "弃牌回血";
											return "取上取下";
										}
										let minfriendCards = 999;
										let maxEnemyCards = 0;
										for (const p of game.players) {
											const a = get.attitude(player, p);
											const cards = p.countCards("h");
											if (a > 0) {
												if (cards < minfriendCards) minfriendCards = cards;
											} else if (a < 0) {
												if (cards > maxEnemyCards) maxEnemyCards = cards;
											}
										}
										if (maxEnemyCards - minfriendCards >= 4) {
											return "取上取下";
										}
										if (choice1Valid && x >= 3) {
											return "摸牌";
										}
										if (choice3Valid && x <= 2) {
											return "弃牌回血";
										}
										return "取上取下";
									}
								})
								.forResult();
							if (result.control === "cancel") {
								event.result = { bool: false };
								return;
							}
							event.result = {
								bool: true,
								cost_data: {
									control: result.control,
									target: target,
									x: x,
									discardNum: discardNum,
								},
							};
						},
						async content(event, trigger, player) {
							const { control, target, x, discardNum } = event.cost_data;
							const stat = player.getStat("skill");
							if (!stat.atzwbuxi) stat.atzwbuxi = 0;
							stat.atzwbuxi++;
							if (control === "摸牌") {
								const num = target.getHp();
								if (num > 0) {
									await target.draw(num);
									game.log(player, "发动了【不息】，令", target, `摸了${get.cnNumber(num)}张牌`);
								}
							} else if (control === "取上取下") {
								let loopCount = 0;
								let targetA, targetB;
								while (loopCount < 20) {
									const targetResult = await player
										.chooseTarget("选择角色A（摸牌）和角色B（弃牌）", (card, player, target) => true, 2, true)
										.set("ai", target => {
											const att = get.attitude(player, target);
											const cards = target.countCards("h");
											if (ui.selected.targets.length === 0) {
												if (att > 0) {
													return 100 - cards;
												}
												return -100;
											} else {
												if (att < 0) {
													return 100 + cards;
												}
												return -100;
											}
										})
										.set("targetprompt", ["摸牌角色", "弃牌角色"])
										.forResult();
									if (!targetResult.bool || !targetResult.targets || targetResult.targets.length < 2) break;
									targetA = targetResult.targets[0];
									targetB = targetResult.targets[1];
									while (true) {
										await targetA.draw();
										if (targetB.countCards("he") > 0) {
											await player.discardPlayerCard(targetB, "he", true, `弃置${get.translation(targetB)}的一张牌`);
										}
										if (targetA.countCards("h") >= targetB.countCards("h")) {
											game.log(player, "发动了【不息】，令", targetA, "与", targetB, "进行了摸牌弃牌流程");
											return;
										}
										const continueResult = await player
											.chooseControl("取上取下", "结束流程")
											.set("prompt", "是否重新选择目标取上取下？")
											.set("ai", () => "取上取下")
											.forResult();
										if (continueResult.control !== "取上取下") {
											game.log(player, "发动了【不息】，令", targetA, "与", targetB, "进行了摸牌弃牌流程");
											return;
										}
										break;
									}
								}
								if (targetA && targetB) {
									game.log(player, "发动了【不息】，令", targetA, "与", targetB, "进行了摸牌弃牌流程");
								}
							} else if (control === "弃牌回血") {
								await target.chooseToDiscard(discardNum, true, "he", `弃置至少${get.cnNumber(discardNum)}张牌`);
								await target.recover();
								game.log(player, "发动了【不息】，令", target, "弃牌后回复了1点体力");
							}
						},
					},
					xdanchao: {
						audio: ["ext:无名扩展/audio/skill/anchao1"],
						trigger: { global: ["changeHp", "loseAfter", "cardsDiscardAfter", "loseAsyncAfter", "equipAfter"] },
						forced: true,
						locked: false,
						filter(event, player) {
							const silong = game.players.find(p => p.name === "死龙") ?? game.dead.find(p => p.name === "死龙");
							if (!silong) return false;
							if (event.name === "changeHp") {
								if (!event.player || event.player.name === "死龙") return false;
								if (event.num === 0) return false;
							} else {
								if (!silong.storage.sl_resting) return false;
								const cards = event.getd ? event.getd() : [];
								if (cards.length === 0) return false;
							}
							return true;
						},
						async content(event, trigger, player) {
							const silong = game.players.find(p => p.name === "死龙") ?? game.dead.find(p => p.name === "死龙");
							if (!silong) return;
							let count = 0;
							if (trigger.name === "changeHp") {
								count = Math.abs(trigger.num);
							} else {
								const cards = trigger.getd ? trigger.getd() : [];
								count = cards.length;
							}
							if (silong.storage.sl_resting) {
								const current = player.countMark("xdanchao_xinrui");
								const add = Math.min(count, 34 - current);
								if (add > 0) {
									player.addMark("xdanchao_xinrui", add);
								}
							} else {
								if (trigger.name === "changeHp") {
									await silong.recover(count);
								}
							}
						},
						group: ["xdanchao_gamestart", "xdanchao_phaseEnd", "xdanchao_dieCheck"],
						subSkill: {
							gamestart: {
								trigger: { global: "phaseBefore" },
								filter(event, player) {
									if (player.name !== "遐蝶") return false;
									return game.phaseNumber === 0;
								},
								forced: true,
								priority: 20,
								async content(event, trigger, player) {
									if (game.players.some(p => p.name === "死龙")) return;
									let silong;
									if (_status.connectMode) {
										silong = await game.addPlayerOL(player, "死龙", null, true);
									} else {
										silong = await game.addPlayerOL(player, "死龙", null, false, { animation: true });
									}
									if (!silong.parentNode && ui.arena) {
										ui.arena.appendChild(silong);
										game.arrangePlayers();
									}
									silong._trueMe = player;
									silong.identity = player.identity;
									silong.side = player.side;
									silong.maxHp = 34;
									silong.hp = 34;
									silong.storage = {};
									silong.storage.sl_resting = true;
									game.broadcastAll(
										(silong, player) => {
											silong.node.identity.firstChild.innerHTML = player.node.identity.firstChild.innerHTML;
											silong.node.identity.dataset.color = player.node.identity.dataset.color;
											silong.classList.add("out");
										},
										silong,
										player
									);
									game.log(player, "召唤了死龙进入休整状态");
									game.addGlobalSkill("autoswap");
									if (!_status.xdanchao_init) {
										_status.xdanchao_init = true;
										const origin_getFriends = lib.element.player.getFriends;
										lib.element.player.getFriends = function (func, includeDie) {
											const friends = origin_getFriends.apply(this, arguments);
											const silong = game.players.find(p => p.name === "死龙");
											if (silong && this._trueMe === silong._trueMe) {
												if (!friends.includes(silong)) friends.push(silong);
											}
											if (silong && this.name === "死龙") {
												const xiadie = game.players.find(p => p.hasSkill("xdanchao"));
												if (xiadie && !friends.includes(xiadie)) friends.push(xiadie);
											}
											return friends.unique();
										};
										const origin_isFriendOf = lib.element.player.isFriendOf;
										lib.element.player.isFriendOf = function (target) {
											const silong = game.players.find(p => p.name === "死龙");
											if (silong) {
												if ((this.name === "死龙" && target._trueMe === this._trueMe) || (target.name === "死龙" && this._trueMe === target._trueMe)) {
													return true;
												}
											}
											return origin_isFriendOf.apply(this, arguments);
										};
									}
								},
							},
							phaseEnd: {
								audio: ["ext:无名扩展/audio/skill/anchao"],
								trigger: { global: "phaseEnd" },
								filter(event, player) {
									return player.countMark("xdanchao_xinrui") >= 34;
								},
								forced: true,
								locked: true,
								async content(event, trigger, player) {
									const silong = game.players.find(p => p.name === "死龙");
									if (!silong) return;
									if (silong.storage.sl_resting) {
										game.playSkillBgm("fuxiao");
										player.$skill("拥抱新生吧，玻吕刻斯", "thunder", "fire");
										silong.storage.sl_resting = false;
										await silong.recover(silong.maxHp - silong.getHp());
										game.broadcastAll(silong => {
											silong.classList.remove("out");
										}, silong);
										player.removeMark("xdanchao_xinrui", player.countMark("xdanchao_xinrui"));
										game.log(player, "令死龙结束了休整状态，回复至满体力");
										await silong.addSkills("slcontrol");
									}
								},
							},
							dieCheck: {
								trigger: { global: "dieAfter" },
								forced: true,
								silent: true,
								filter(event, player) {
									if (get.mode() === "identity") return false;
									if (player.name !== "遐蝶") return false;
									if (!player.isAlive()) return false;
									const silong = game.players.find(p => p.name === "死龙");
									return silong && !silong.isDead();
								},
								async content(event, trigger, player) {
									const friendSide = player.side;
									const enemiesAlive = game.players.filter(p => p.side !== friendSide && !p.isDead());
									if (enemiesAlive.length === 0) {
										game.over(true);
									}
								},
							},
							xinrui: {
								mark: true,
								marktext: "蕊",
								intro: { content: "当前有#枚“新蕊”标记" },
							},
						},
						intro: {
							name: "新蕊",
							content: "当前有#枚“新蕊”标记",
						},
					},
					xdyuejian: {
						audio: ["ext:无名扩展/audio/skill/yuejian"],
						usable: 1,
						trigger: { global: "dying" },
						filter(event, player) {
							if (player.getStorage("xdyuejian_used", false)) return false;
							if (event.player && event.player.name === "死龙") return false;
							return true;
						},
						prompt(event, player) {
							return "是否对 " + get.translation(event.player) + " 发动【月茧】？";
						},
						check(event, player) {
							return get.attitude(player, event.player) > 0;
						},
						async content(event, trigger, player) {
							player.setStorage("xdyuejian_used", true);
							const target = trigger.player;
							const currentHp = target.hp;
							if (currentHp < 1) {
								const recoverNum = 1 - currentHp;
								trigger.untrigger();
								await target.recover(recoverNum);
								target.setStorage("xdyuejian_debt", recoverNum);
								target.addSkill("xdyuejian_debt");
							}
						},
						subSkill: {
							debt: {
								trigger: { player: "phaseEnd" },
								forced: true,
								charlotte: true,
								filter(event, player) {
									return player.getStorage("xdyuejian_debt", 0) > 0;
								},
								async content(event, trigger, player) {
									const debt = player.getStorage("xdyuejian_debt", 0);
									await player.loseHp(debt);
									player.setStorage("xdyuejian_debt", 0);
									player.removeSkill("xdyuejian_debt");
								},
							},
						},
					},
					xdyoudie: {
						audio: ["ext:无名扩展/audio/skill/youdie1", "ext:无名扩展/audio/skill/youdie2", "ext:无名扩展/audio/skill/youdie3", "ext:无名扩展/audio/skill/youdie4"],
						enable: "phaseUse",
						usable: 1,
						group: ["xdyoudie_damage"],
						async content(event, trigger, player) {
							const targets = game.players.filter(p => p.getHp() > 1);
							for (const t of targets) {
								await t.loseHp(1);
							}
							player.addMark("xdyoudie_damage", 1);
						},
						ai: {
							order: 6,
							result: {
								player(player) {
									const enemies = game.players.filter(p => get.attitude(player, p) < 0);
									const friends = game.players.filter(p => get.attitude(player, p) > 0 && p !== player);
									if (enemies.length > friends.length) return 1;
									return 0;
								},
							},
						},
						subSkill: {
							damage: {
								mark: true,
								marktext: "蝶",
								intro: { content: "下一张伤害牌造成的伤害+#" },
								trigger: { player: "useCard" },
								filter(event, player) {
									return get.is.damageCard(event.card) && player.countMark("xdyoudie_damage") > 0;
								},
								forced: true,
								locked: true,
								firstDo: true,
								async content(event, trigger, player) {
									const extra = player.countMark("xdyoudie_damage");
									player.removeMark("xdyoudie_damage", extra);
									player.unmarkSkill("xdyoudie_damage");
									player.addTempSkill("xdyoudie_damage_effect");
									player.markAuto("xdyoudie_damage_effect", [trigger.card]);
									player.setStorage("xdyoudie_extra", extra);
									game.log(player, "的【幽蝶】效果触发，下一张伤害牌伤害+" + extra);
								},
							},
							damage_effect: {
								charlotte: true,
								onremove: true,
								trigger: { source: "damageBegin1" },
								filter(event, player) {
									return event.card && player.getStorage("xdyoudie_damage_effect").includes(event.card);
								},
								forced: true,
								popup: false,
								async content(event, trigger, player) {
									const extra = player.getStorage("xdyoudie_extra", 0);
									trigger.num += extra;
									player.setStorage("xdyoudie_extra", 0);
									game.log(player, "的【幽蝶】效果生效，伤害+" + extra);
								},
							},
						},
					},
					slyanxi: {
						enable: "phaseUse",
						usable: 4,
						filter(event, player) {
							if (player.name !== "死龙") return false;
							if (!game.players.includes(player)) return false;
							return true;
						},
						filterTarget(card, player, target) {
							if (target === player) return false;
							const xiadie = player._trueMe ?? game.players.find(p => p.hasSkill("xdanchao"));
							if (xiadie && target === xiadie) return false;
							return true;
						},
						selectTarget: [1, Infinity],
						allowChooseAll: true,
						multitarget: true,
						async content(event, trigger, player) {
							const x = game.players.filter(p => !p.isDead()).length;
							await player.loseHp(5 + x);
							for (const t of event.targets) {
								if (t.isAlive()) {
									await t.damage(1, player);
								}
							}
						},
						ai: {
							order: 11,
							result: {
								player(player) {
									const xiadie = player._trueMe ?? game.players.find(p => p.hasSkill("xdanchao"));
									if (!xiadie) return -10;
									const enemies = game.players.filter(p => {
										if (p === player) return false;
										if (xiadie && p === xiadie) return false;
										if (get.attitude(xiadie, p) > 0) return false;
										return true;
									});
									if (enemies.length === 0) return -10;
									const x = game.players.filter(p => !p.isDead()).length;
									if (player.getHp() <= 5 + x) return 1;
									return enemies.length * 2;
								},
								target(player, target) {
									if (target === player) return 0;
									const xiadie = player._trueMe ?? game.players.find(p => p.hasSkill("xdanchao"));
									if (xiadie && target === xiadie) return 0;
									if (!xiadie) return 0;
									if (get.attitude(xiadie, target) > 0) return 0;
									return -1;
								},
							},
						},
					},
					slyinbi: {
						trigger: { global: "damageBegin4" },
						filter(event, player) {
							if (player.name !== "死龙") return false;
							if (!game.players.includes(player)) return false;
							if (!event.player) return false;
							if (event.player === player) return false;
							if (event.player.name === "死龙") return false;
							if (event.player.hp - event.num > 0) return false;
							return true;
						},
						prompt(event, player) {
							return `是否对 ${get.translation(event.player)} 发动【荫蔽】？`;
						},
						check(event, player) {
							const xiadie = player._trueMe ?? game.players.find(p => p.hasSkill("xdanchao"));
							if (!xiadie) return false;
							if (event.player === xiadie) return true;
							const xiadieIdentity = xiadie.identity;
							const targetIdentity = event.player.identity;
							if (xiadieIdentity === "fan") {
								if (targetIdentity !== "fan") return false;
							} else if (xiadieIdentity === "zhu" || xiadieIdentity === "zhong") {
								if (targetIdentity !== "zhu" && targetIdentity !== "zhong") return false;
							} else if (xiadieIdentity === "nei") {
								if (get.attitude(xiadie, event.player) <= 0) return false;
							}
							const reduceDamage = Math.max(0, event.num - Math.max(0, event.player.hp - 1));
							const damageX = 5 * reduceDamage;
							if (player.getHp() <= damageX) return false;
							return true;
						},
						async content(event, trigger, player) {
							const reduceDamage = Math.max(0, trigger.num - Math.max(0, trigger.player.hp - 1));
							trigger.num -= reduceDamage;
							game.log(player, "发动了【荫蔽】，令", trigger.player, `受到的伤害减少${reduceDamage}点`);
							const damageX = 5 * reduceDamage;
							if (trigger.source?.isAlive()) {
								await player.damage(damageX, trigger.source);
								game.log(player, "受到了来自", trigger.source, `的${damageX}点伤害`);
							} else {
								await player.damage(damageX);
								game.log(player, `受到了${damageX}点伤害`);
							}
						},
						ai: {
							effect: {
								target_use(card, player, target, current, isLink) {
									if (target.name === "死龙" && target.hp - current <= 0) {
										const xiadie = target._trueMe ?? game.players.find(p => p.hasSkill("xdanchao"));
										if (xiadie && get.attitude(xiadie, player) > 0) {
											return [0.5, 1];
										}
									}
								},
							},
						},
					},
					slhuiyi: {
						trigger: { player: ["dieBefore", "rest"] },
						filter(event, player, name) {
							if (player.name !== "死龙") return false;
							if (name !== "rest" && !game.players.includes(player)) return false;
							if (player.classList.contains("out")) return false;
							if (name === "rest") return true;
							return player.maxHp > 0;
						},
						forced: true,
						forceDie: true,
						forceOut: true,
						priority: 15,
						group: ["slhuiyi_phase", "slhuiyi_return", "slhuiyi_xiadieDie"],
						async content(event, trigger, player) {
							if (event.triggername === "rest") {
								game.broadcastAll(p => {
									p.classList.add("out");
								}, player);
								return;
							}
							trigger.cancel();
							player.logSkill("slhuiyi");
							const allCards = player.getCards("hej");
							if (allCards.length > 0) {
								await player.discard(allCards);
								game.log(player, "弃置了区域内所有的牌");
							}
							player.setStorage("sl_phaseCount", 0);
							player.storage.sl_resting = true;
							const turnCount = player.getStorage("sl_turnCount", 0) + 1;
							player.setStorage("sl_turnCount", turnCount);
							game.log(player, `进入了休整状态（第${turnCount}次），回合数已清零`);
							game.broadcastAll(p => {
								p.classList.add("out");
							}, player);
						},
						subSkill: {
							phase: {
								trigger: { player: "phaseAfter" },
								forced: true,
								forceDie: true,
								filter(event, player) {
									if (player.name !== "死龙") return false;
									if (!game.players.includes(player)) return false;
									return !player.storage.sl_resting;
								},
								async content(event, trigger, player) {
									const phaseCount = player.getStorage("sl_phaseCount", 0) + 1;
									player.setStorage("sl_phaseCount", phaseCount);
									game.log(player, `已执行${phaseCount}个回合`);
									if (phaseCount >= 3) {
										player.setStorage("sl_phaseCount", 0);
										player.setStorage("sl_turnCount", 0);
										player.storage.sl_resting = false;
										game.log(player, "已存在场上三个回合，即将死亡");
										await player.die();
									}
								},
							},
							return: {
								trigger: { player: "restEnd" },
								forced: true,
								locked: true,
								charlotte: true,
								silent: true,
								forceDie: true,
								forceOut: true,
								filter(event, player) {
									if (player.name !== "死龙") return false;
									if (!game.players.includes(player)) return false;
									return event.player === player;
								},
								async content(event, trigger, player) {
									game.broadcastAll(p => {
										p.classList.remove("out");
									}, player);
									await player.recover(player.maxHp - player.getHp());
									player.storage.sl_resting = false;
									game.log(player, "结束了休整状态，回复至满体力");
								},
							},
							xiadieDie: {
								trigger: { global: "dieAfter" },
								forced: true,
								forceDie: true,
								forceOut: true,
								filter(event, player) {
									if (player.name !== "死龙") return false;
									if (!game.players.includes(player)) return false;
									if (!player.isAlive()) return false;
									const xiadie = player._trueMe ?? game.players.find(p => p.hasSkill("xdanchao")) ?? game.dead.find(p => p.hasSkill("xdanchao"));
									if (!xiadie) return false;
									return event.player === xiadie;
								},
								async content(event, trigger, player) {
									if (player.storage.sl_resting) {
										game.broadcastAll(p => {
											p.classList.remove("out");
										}, player);
										player.setStorage("sl_phaseCount", 0);
										player.setStorage("sl_turnCount", 0);
										player.storage.sl_resting = false;
										game.log(player, "因遐蝶死亡而退出休整状态并移出游戏");
									} else {
										game.log(player, "因遐蝶死亡而移出游戏");
									}
									await player.removeSkills("slyanxi", "slyinbi", "slhuiyi", "slcontrol");
									const index = game.players.indexOf(player);
									if (index !== -1) {
										game.players.splice(index, 1);
									}
									const deadIndex = game.dead.indexOf(player);
									if (deadIndex !== -1) {
										game.dead.splice(deadIndex, 1);
									}
									player.remove();
									const friendSide = player.side;
									const friendliesAlive = game.players.filter(p => p.side === friendSide && !p.isDead());
									const enemiesAlive = game.players.filter(p => p.side !== friendSide && !p.isDead());
									if (friendliesAlive.length === 0) {
										game.over(false);
									} else if (enemiesAlive.length === 0) {
										game.over(true);
									}
								},
							},
						},
					},
					slcontrol: {
						trigger: { player: ["phaseAfter", "dieAfter"] },
						lastDo: true,
						charlotte: true,
						forceDie: true,
						forced: true,
						silent: true,
						filter(event, player) {
							return player.name === "死龙";
						},
						async content(event, trigger, player) {
							await player.removeSkills("slcontrol");
						},
						onremove(player) {
							if (player === game.me && player._trueMe) {
								game.swapPlayerAuto(player._trueMe);
								if (_status.auto) {
									ui.click.auto();
								}
							}
						},
					},
					mbmkmingmen: {
						audio: ["ext:无名扩展/audio/skill/mingmen"],
						trigger: { global: "phaseBegin" },
						direct: true,
						async content(event, trigger, player) {
							const target = trigger.player;
							const result = await player
								.chooseControl("基本牌", "锦囊牌", "装备牌", "cancel2")
								.set("prompt", "【名门】是否令" + get.translation(target) + "本回合只能摸指定类型的牌？")
								.set("ai", () => {
									return ["基本牌", "锦囊牌", "装备牌"].randomGet();
								})
								.forResult();
							if (result.control && result.control !== "cancel2") {
								const cardType = result.control;
								player.logSkill("mbmkmingmen", target);
								target.addTempSkill("mbmkmingmen_effect");
								target.setStorage("mbmkmingmen_type", cardType);
								target.setStorage("mbmkmingmen_source", player);
								game.log(target, "本回合只能摸", cardType);
								const otherCards = [];
								const pile = ui.cardPile.childNodes;
								for (let i = 0; i < pile.length; i++) {
									const card = pile[i];
									const type = get.type(card, false);
									if (cardType === "基本牌" && type !== "basic") {
										otherCards.push(card);
									} else if (cardType === "锦囊牌" && type !== "trick" && type !== "delay") {
										otherCards.push(card);
									} else if (cardType === "装备牌" && type !== "equip") {
										otherCards.push(card);
									}
								}
								if (otherCards.length > 0) {
									const gainCard = otherCards[0];
									gainCard.remove();
									await player.gain(gainCard, "gain2");
									game.log(player, "获得了一张非", cardType);
								}
							}
						},
						subSkill: {
							effect: {
								charlotte: true,
								trigger: { player: "drawBegin" },
								forced: true,
								filter(event, player) {
									return player.getStorage("mbmkmingmen_type", null) && player.getStorage("mbmkmingmen_source", null);
								},
								async content(event, trigger, player) {
									const cardType = player.getStorage("mbmkmingmen_type", "");
									const num = trigger.num;
									const typeCards = [];
									const pile = ui.cardPile.childNodes;
									for (let i = 0; i < pile.length; i++) {
										const card = pile[i];
										const type = get.type(card, false);
										if (cardType === "基本牌" && type === "basic") {
											typeCards.push(card);
										} else if (cardType === "锦囊牌" && (type === "trick" || type === "delay")) {
											typeCards.push(card);
										} else if (cardType === "装备牌" && type === "equip") {
											typeCards.push(card);
										}
									}
									const available = Math.min(typeCards.length, num);
									if (typeCards.length === 0 || typeCards.length < num) {
										player.getStorage("mbmkmingmen_source", null)?.chat("坏了没有了");
										for (const p of game.players) {
											if (p !== player && p.isAlive()) {
												p.throwEmotion(player, ["egg", "shoe"].randomGet());
											}
										}
										game.log("牌堆中没有", cardType, "，", player, "正常摸牌");
										return;
									}
									if (available > 0) {
										const toDraw = typeCards.slice(0, available);
										for (let i = toDraw.length - 1; i >= 0; i--) {
											toDraw[i].remove();
											ui.cardPile.insertBefore(toDraw[i], ui.cardPile.firstChild);
										}
										game.log(player, "将" + available + "张", cardType, "置于牌堆顶");
									}
								},
							},
						},
					},
					sydjqiji: {
						trigger: { global: "phaseAfter" },
						forced: true,
						filter(event, player) {
							const aliveCount = game.players.filter(p => p.isAlive() && !p.classList.contains("out")).length;
							const targetCount = aliveCount * 2;
							return player.countCards("h") < targetCount;
						},
						async content(event, trigger, player) {
							game.playSkillBgm("sydj");
							const aliveCount = game.players.filter(p => p.isAlive() && !p.classList.contains("out")).length;
							const targetCount = aliveCount * 2;
							const drawNum = targetCount - player.countCards("h");
							if (drawNum > 0) {
								await player.draw(drawNum);
							}
						},
						group: ["sydjqiji_loseHp"],
						subSkill: {
							loseHp: {
								trigger: { player: "loseHpBefore" },
								forced: true,
								filter(event, player) {
									return event.num > 0;
								},
								async content(event, trigger, player) {
									trigger.cancel();
									game.log(player, "发动了【祈冀】，防止失去体力");
								},
							},
						},
					},
					sydjhuihuang: {
						forced: true,
						locked: false,
						trigger: {
							target: "useCardToTarget",
						},
						filter(event, player) {
							if (event.player === player) return false;
							return !player.getStorage("sydjhuihuang", []).includes(event.card.name);
						},
						async content(event, trigger, player) {
							game.playSkillBgm("sydj");
							player.markAuto("sydjhuihuang", [trigger.card.name]);
							trigger.targets.remove(player);
							trigger.getParent().triggeredTargets2.remove(player);
							trigger.untrigger();
						},
						onremove: true,
						intro: { content: "已记录牌名：$" },
						group: ["sydjhuihuang_cancel", "sydjhuihuang_phase"],
						subSkill: {
							cancel: {
								direct: true,
								trigger: {
									target: "useCardToTarget",
								},
								filter(event, player) {
									if (event.player === player) return false;
									return player.getStorage("sydjhuihuang", []).includes(event.card.name);
								},
								async content(event, trigger, player) {
									const cardType2 = get.type2(trigger.card, false);
									const result = await player
										.chooseToDiscard("he", "是否弃置一张" + get.translation(cardType2) + "类型的牌取消" + get.translation(trigger.card) + "？")
										.set("ai", card => {
											if (get.attitude(player, trigger.player) >= 0) return -1;
											const type2 = get.type2(card, false);
											if (type2 === cardType2) return 5 - get.value(card);
											return -1;
										})
										.set("filterCard", card => {
											return get.type2(card, false) === cardType2;
										})
										.forResult();
									if (result.bool) {
										player.logSkill("sydjhuihuang");
										trigger.targets.remove(player);
										trigger.getParent().triggeredTargets2.remove(player);
										trigger.untrigger();
										game.log(player, "弃置了一张牌取消了", trigger.card);
									}
								},
							},
							phase: {
								trigger: { player: "phaseBegin" },
								direct: true,
								async content(event, trigger, player) {
									const recorded = player.getStorage("sydjhuihuang", []);
									const choices = ["弃牌移除记录", "弃牌使用锦囊", "cancel2"];
									const result = await player
										.chooseControl(choices)
										.set("prompt", "【辉煌】请选择一项")
										.set("ai", () => "cancel2")
										.forResult();
									if (result.control === "弃牌移除记录") {
										const discardResult = await player
											.chooseCard("he", [2, player.countCards("he")], "选择要弃置的牌")
											.set("ai", card => 9 - get.value(card))
											.set("filter", (card, player) => true)
											.set("select", () => {
												const max = player.countCards("he");
												return [2, max - (max % 2)];
											})
											.forResult();
										if (discardResult.bool && discardResult.cards && discardResult.cards.length % 2 === 0) {
											const discardNum = discardResult.cards.length;
											const x = Math.floor(discardNum / 2);
											const recorded = player.getStorage("sydjhuihuang", []);
											const canRemove = Math.min(x, recorded.length);
											if (canRemove > 0 && recorded.length > 0) {
												const cardList = recorded.map(name => ["卡片", "", name]);
												const removeResult = await player
													.chooseButton(["选择要移除的记录（移除" + canRemove + "种）", [cardList, "vcard"]], true, canRemove)
													.set("ai", button => {
														return Math.random();
													})
													.forResult();
												if (removeResult.bool && removeResult.links) {
													await player.discard(discardResult.cards);
													const removed = removeResult.links.map(link => link[2]);
													player.unmarkAuto("sydjhuihuang", removed);
													game.log(player, "弃置了" + discardNum + "张牌，移除了", removed.join("、"), "的记录");
												}
											} else {
												await player.discard(discardResult.cards);
												game.log(player, "弃置了" + discardNum + "张牌，但没有可移除的记录");
											}
										}
									} else if (result.control === "弃牌使用锦囊") {
										const cardResult = await player
											.chooseCard("he", 2, "弃置两张牌视为使用一张普通锦囊")
											.set("ai", card => 9 - get.value(card))
											.forResult();
										if (cardResult.bool && cardResult.cards?.length >= 2) {
											const costCards = cardResult.cards;
											const list = [];
											const cardNames = lib.inpile;
											const excludeNames = ["wuxie", "bingliang", "lebu", "shandian"];
											for (const name of cardNames) {
												const type = get.type2(name, false);
												if (type === "trick" && !excludeNames.includes(name)) {
													list.push([type, "", name]);
												}
											}
											if (list.length > 0) {
												const buttonResult = await player
													.chooseButton(["辉煌：选择要使用的锦囊牌", [list, "vcard"]], true)
													.set("ai", button => {
														const name = button.link[2];
														return player.getUseValue({ name: name });
													})
													.forResult();
												if (buttonResult.bool && buttonResult.links?.length > 0) {
													const name = buttonResult.links[0][2];
													for (const card of costCards) {
														await player.lose(card, ui.discardPile);
													}
													game.log(player, "弃置了", costCards);
													player.logSkill("sydjhuihuang");
													const vcard = { name: name };
													await player.chooseUseTarget(vcard, true, false);
												}
											}
										}
									}
								},
							},
						},
					},
					djsj: {
						derivation: ["djfuhe", "djqiangli", "djkongzhong"],
						trigger: { global: "gameStart" },
						forced: true,
						locked: false,
						async content(event, trigger, player) {
							await player.addSkills("djfuhe");
						},
						group: ["djsj_addSkill", "djsj_switch"],
						subSkill: {
							addSkill: {
								forced: true,
								trigger: { global: "changeSkillsAfter" },
								filter(event, player) {
									if (event.addSkill.includes("djsj")) {
										return !event.player.hasSkill("djqiangli") && !event.player.hasSkill("djkongzhong");
									}
									return false;
								},
								async content(event, trigger, player) {
									await player.addSkills("djfuhe");
								},
							},
							switch: {
								audio: ["ext:无名扩展/audio/skill/djsj0.mp3"],
								enable: "phaseUse",
								usable: 3,
								filter(event, player) {
									if (event.type !== "phase") return false;
									if (_status.currentPhase !== player) return false;
									return player.hasSkill("djfuhe") || player.hasSkill("djqiangli") || player.hasSkill("djkongzhong");
								},
								async content(event, trigger, player) {
									let target;
									game.playSkillBgm("djsj");
									const choiceSet = new Set();
									if (player.hasSkill("djfuhe")) {
										choiceSet.add("强力");
										choiceSet.add("空中");
									}
									if (player.hasSkill("djqiangli")) {
										choiceSet.add("复合");
										choiceSet.add("空中");
									}
									if (player.hasSkill("djkongzhong")) {
										choiceSet.add("复合");
										choiceSet.add("强力");
									}
									const choices = Array.from(choiceSet);
									if (choices.length === 0) return;
									const result = await player
										.chooseControl(choices)
										.set("prompt", "选择要切换的形态")
										.set("choices", choices)
										.set("ai", () => {
											const player = get.player();
											const choices = get.event().choices;
											const stat = player.getStat("skill");
											if (player.hasSkill("djfuhe")) {
												const usedFuh = stat.djfuhe ?? 0;
												if (usedFuh < 2 && player.hasCards("h")) {
													return choices.randomGet();
												}
												const hasDamage = player.hasCard(card => get.tag(card, "damage"), "h");
												if (hasDamage) return "强力";
												return "空中";
											}
											if (player.hasSkill("djqiangli")) {
												const hasDamage = player.hasCard(card => get.tag(card, "damage"), "h");
												if (hasDamage) return choices.randomGet();
												return "复合";
											}
											if (player.hasSkill("djkongzhong")) {
												const hasSha = player.hasCard(card => card.name === "sha", "h");
												if (hasSha) return choices.randomGet();
												return "复合";
											}
											return choices.randomGet();
										})
										.forResult();
									if (result.control) {
										target = result.control;
									} else {
										return;
									}
									if (target === "强力") {
										if (player.hasSkill("djfuhe")) await player.removeSkills("djfuhe");
										if (player.hasSkill("djkongzhong")) await player.removeSkills("djkongzhong");
										await player.addSkills("djqiangli");
										player.changeSkin("djsj", "迪迦-强力");
										game.log(player, "切换为【强力】形态");
									} else if (target === "空中") {
										if (player.hasSkill("djfuhe")) await player.removeSkills("djfuhe");
										if (player.hasSkill("djqiangli")) await player.removeSkills("djqiangli");
										await player.addSkills("djkongzhong");
										player.changeSkin("djsj", "迪迦-空中");
										game.log(player, "切换为【空中】形态");
									} else if (target === "复合") {
										if (player.hasSkill("djqiangli")) await player.removeSkills("djqiangli");
										if (player.hasSkill("djkongzhong")) await player.removeSkills("djkongzhong");
										await player.addSkills("djfuhe");
										player.changeSkin("djsj", "迪迦-复合");
										game.log(player, "切换为【复合】形态");
									}
								},
								ai: {
									order: 10,
									result: {
										player(player) {
											const stat = player.getStat("skill");
											const usedSwitch = stat.djsj_switch ?? 0;
											if (usedSwitch >= 3) return 0;
											if (player.hasSkill("djfuhe")) {
												const usedFuh = stat.djfuhe ?? 0;
												if (usedFuh >= 2 || !player.hasCards("h")) return 10;
												return 0;
											}
											if (usedSwitch === 0) {
												return 10;
											}
											if (player.hasSkill("djqiangli")) {
												const hasDamage = player.hasCard(card => get.tag(card, "damage"), "h");
												if (!hasDamage) return 10;
												return 0;
											}
											if (player.hasSkill("djkongzhong")) {
												const hasSha = player.hasCard(card => card.name === "sha", "h");
												if (!hasSha) return 10;
												return 0;
											}
											return 0;
										},
									},
								},
							},
						},
					},
					djfuhe: {
						enable: "chooseToUse",
						usable: 2,
						filter(event, player) {
							if (_status.currentPhase !== player && event.type !== "wuxie") return false;
							if (event.type && event.type !== "wuxie") {
								const nonTrickTypes = ["sha", "shan", "jiu", "taoyuanjieyi", "wuzhongshengyou", "jiedaozhangren"];
								if (nonTrickTypes.includes(event.type)) return false;
							}
							return player.countCards("h") > 0;
						},
						hiddenCard(player, name) {
							if (name === "wuxie") {
								return player.countCards("h") > 0;
							}
							return get.type(name) === "trick";
						},
						chooseButton: {
							dialog(event, player) {
								const list = [];
								if (event.type === "wuxie") {
									list.push(["锦囊", "", "wuxie"]);
								} else {
									const cardNames = lib.inpile;
									for (const name of cardNames) {
										const type = get.type(name);
										if (type === "trick") {
											list.push(["锦囊", "", name]);
										}
									}
								}
								return ui.create.dialog("复合：选择一张普通锦囊牌", [list, "vcard"]);
							},
							filter(button, player) {
								const name = button.link[2];
								const evt = _status.event.getParent();
								if (evt && evt.filterCard) {
									return evt.filterCard(get.autoViewAs({ name: name }, "unsure"), player, evt);
								}
								return lib.filter.filterCard({ name: name }, player, evt);
							},
							check(button) {
								const player = _status.event.player;
								const name = button.link[2];
								if (name === "wuxie") return 20;
								return player.getUseValue({ name: name }) + 10;
							},
							backup(links, player) {
								const name = links[0][2];
								return {
									filterCard: true,
									position: "h",
									viewAs: { name: name },
									selectTarget() {
										const card = { name: name };
										const range = lib.filter.selectTarget(card, player, _status.event);
										if (range) return range;
										return [0, 0];
									},
									filterTarget(card, player, target) {
										const vcard = { name: name };
										return lib.filter.filterTarget(vcard, player, target);
									},
									check(card) {
										return 20 - get.value(card);
									},
									async onuse(result, player) {
										player.logSkill("djfuhe");
										await player.draw();
									},
								};
							},
							prompt(links, player) {
								const name = links[0][2];
								if (name === "wuxie") return "将一张手牌当做【无懈可击】使用";
								return "请选择使用「" + get.translation(name) + "」的目标";
							},
						},
						ai: {
							respondWuxie: true,
							skillTagFilter(player, tag) {
								if (tag === "respondWuxie") {
									return player.countCards("h") > 0;
								}
								return false;
							},
							order: 11,
							result: {
								player(player) {
									return 1;
								},
							},
						},
					},
					djqiangli: {
						group: ["djqiangli_damage", "djqiangli_use"],
						locked: true,
						subSkill: {
							damage: {
								trigger: { source: "damageBegin1" },
								forced: true,
								filter(event, player) {
									return event.card && event.player !== player;
								},
								async content(event, trigger, player) {
									trigger.num++;
									game.log(player, "造成的伤害+1");
								},
							},
							use: {
								trigger: { player: "useCard" },
								forced: true,
								filter(event, player) {
									return event.card && get.suit(event.card) !== "none";
								},
								async content(event, trigger, player) {
									const suit = get.suit(trigger.card);
									player.setStorage("djqiangli_suit", suit);
									game.filterPlayer(current => {
										if (current !== player) {
											current.addTempSkill("djqiangli_respond");
											current.markSkill("djqiangli_respond");
										}
									});
								},
							},
							respond: {
								charlotte: true,
								onremove: true,
								mod: {
									cardRespondable(card, player) {
										const target = _status.currentPhase;
										if (target && target.hasSkill("djqiangli") && target !== player && target.getStorage("djqiangli_suit", null)) {
											let cardSuit = get.suit(card);
											if (cardSuit === "unsure") return;
											if (cardSuit === "none" || cardSuit === undefined) {
												if (card.cards && card.cards.length > 0) {
													cardSuit = get.suit(card.cards[0]);
												}
											}
											const targetSuit = target.getStorage("djqiangli_suit", "");
											if (cardSuit === "none" || cardSuit === undefined) {
												if (targetSuit === "none") return;
												return false;
											}
											if (cardSuit !== targetSuit) {
												return false;
											}
										}
									},
									cardEnabled(card, player) {
										const evt = _status.event;
										if (evt && (evt.type === "dying" || evt.name === "_save")) return;
										const target = _status.currentPhase;
										if (target && target.hasSkill("djqiangli") && target !== player && target.getStorage("djqiangli_suit", null)) {
											let cardSuit = get.suit(card);
											if (cardSuit === "unsure") return;
											if (cardSuit === "none" || cardSuit === undefined) {
												if (card.cards && card.cards.length > 0) {
													cardSuit = get.suit(card.cards[0]);
												}
											}
											const targetSuit = target.getStorage("djqiangli_suit", "");
											if (cardSuit === "none" || cardSuit === undefined) {
												if (targetSuit === "none") return;
												return false;
											}
											if (cardSuit !== targetSuit) {
												return false;
											}
										}
									},
								},
								trigger: { global: "useCardAfter" },
								forced: true,
								popup: false,
								filter(event, player) {
									return event.player === _status.currentPhase && event.player.hasSkill("djqiangli");
								},
								async content(event, trigger, player) {
									player.removeSkill("djqiangli_respond");
									player.setStorage("djqiangli_respond", null);
								},
							},
						},
						ai: {
							effect: {
								player(card, player) {
									if (get.tag(card, "damage")) {
										return [1, 0, 1, 0];
									}
								},
							},
						},
					},
					djkongzhong: {
						group: ["djkongzhong_to", "djkongzhong_from"],
						subSkill: {
							to: {
								mod: {
									globalTo(from, to, distance) {
										return distance + 1;
									},
								},
							},
							from: {
								mod: {
									globalFrom(from, to, distance) {
										return distance - 1;
									},
								},
							},
						},
						trigger: { player: "useCardToPlayer" },
						forced: true,
						filter(event, player) {
							return event.card.name === "sha" && event.target;
						},
						async content(event, trigger, player) {
							trigger.directHit.add(trigger.target);
							game.log(player, "使用的【杀】无法被响应");
						},
						ai: {
							directHit_ai: true,
							skillTagFilter(player, tag, arg) {
								return arg && arg.card && arg.card.name === "sha";
							},
						},
					},
					hadjheian: {
						locked: true,
						trigger: { player: "drawBefore" },
						forced: true,
						firstDo: true,
						async content(event, trigger, player) {
							const num = trigger.num || 1;
							trigger.num = 0;
							for (let i = 0; i < num && ui.discardPile.hasChildNodes(); i++) {
								const card = ui.discardPile.removeChild(ui.discardPile.lastChild);
								await player.gain(card, "draw");
							}
							game.log(player, "从弃牌堆摸了" + get.cnNumber(num) + "张牌");
						},
						group: ["hadjheian_use"],
						subSkill: {
							use: {
								trigger: { global: ["useCardAfter", "recast"] },
								forced: true,
								firstDo: true,
								priority: 15,
								sourceSkill: "hadjheian",
								filter(event, player) {
									if (!player.hasSkill("hadjheian")) return false;
									if (event.player !== player) return false;
									if (!event.cards || !event.cards.length) return false;
									if (event.name === "useCard") {
										const card = event.card;
										if (!card) return false;
										if (get.type(card) === "equip") return false;
										if (get.type(card) === "delay") return false;
									}
									return true;
								},
								async content(event, trigger, player) {
									const cards = trigger.cards.slice();
									for (const card of cards) {
										card.remove();
										ui.cardPile.appendChild(card);
									}
									game.log(player, "将使用或重铸的牌置入了牌堆底");
								},
							},
						},
					},
					hadjanrong: {
						trigger: { player: "damageEnd" },
						forced: true,
						mark: true,
						marktext: "融",
						group: ["hadjanrong_setup", "hadjanrong_refresh", "hadjanrong_maxHp", "hadjanrong_use"],
						filter(event, player) {
							if (event.num <= 0) return false;
							const card = event.card;
							if (card && get.name(card) === "sha" && get.color(card) === "red") return false;
							return true;
						},
						async content(event, trigger, player) {
							game.playSkillBgm("hadj");
							const source = trigger.source;
							const obtainedSkills = player.getStorage("hadjanrong", []);
							if (source && source !== player) {
								const validSkills = source.getStockSkills(true, true).filter(skill => {
									const info = get.info(skill);
									return info && !info.charlotte && !obtainedSkills.includes(skill);
								});
								if (validSkills.length > 0) {
									const dialog = ui.create.dialog("暗融：选择要获得的技能", "hidden");
									dialog.add([validSkills, "skill"]);
									const buttonResult = await player
										.chooseButton(dialog, true)
										.set("ai", button => get.skillRank(button.link, "inout"))
										.forResult();
									if (buttonResult.bool && buttonResult.links) {
										const skill = buttonResult.links[0];
										await player.addSkills(skill);
										player.markAuto("hadjanrong", [skill]);
									}
								}
							}
							await player.gainMaxHp();
						},
						intro: {
							name: "暗融",
							mark(dialog, storage, player) {
								const list = storage || [];
								if (list.length > 0) {
									dialog.addText("已获得技能：" + list.map(s => get.translation(s)).join("、"));
								}
								if (!list.length) {
									dialog.addText("尚未获得技能");
								}
							},
						},
						ai: {
							maixie: true,
							maixie_hp: true,
							effect: {
								target(card, player, target) {
									if (get.name(card) !== "sha" || get.color(card) !== "red") {
										if (get.attitude(player, target) <= 0) {
											if (target.hp - 1 > 0) {
												return [1, get.tag(card, "damage") * 2];
											}
										}
									}
								},
							},
						},
						init(player, skill) {
							player.addSkill("hadjanrong_nouse");
						},
						onremove(player, skill) {
							player.removeSkill("hadjanrong_nouse");
							const cards = player.getCards("s", card => card.hasGaintag("hadjanrong_discard"));
							for (const card of cards) {
								card.delete();
							}
							if (player === game.me) {
								ui.updatehl();
							}
						},
						subSkill: {
							nouse: {
								charlotte: true,
								locked: true,
							},
							use: {
								trigger: {
									player: ["useCardBefore", "respondBefore"],
								},
								forced: true,
								firstDo: true,
								sourceSkill: "hadjanrong",
								filter(event, player) {
									if (!event.cards) return false;
									return event.cards.some(card => card.hasGaintag && card.hasGaintag("hadjanrong_discard"));
								},
								async content(event, trigger, player) {
									const discardPile = Array.from(ui.discardPile.childNodes);
									for (let i = 0; i < trigger.cards.length; i++) {
										const card = trigger.cards[i];
										if (card.hasGaintag && card.hasGaintag("hadjanrong_discard")) {
											const originalCard = discardPile.find(c => c.cardid === card._cardid);
											if (originalCard) {
												originalCard.remove();
												trigger.cards[i] = originalCard;
												if (trigger.card && trigger.card.cards) {
													trigger.card.cards[i] = originalCard;
												}
											}
										}
									}
									const oldCards = player.getCards("s", card => card.hasGaintag("hadjanrong_discard"));
									game.deleteFakeCards(oldCards);
									const X = player.maxHp;
									const newDiscardPile = Array.from(ui.discardPile.childNodes);
									const bottomCards = newDiscardPile.slice(0, X);
									if (bottomCards.length > 0) {
										const cardsx = game.createFakeCards(bottomCards);
										player.directgains(cardsx, null, "hadjanrong_discard");
									}
									player._hadjanrong_last_cardids = bottomCards.map(c => c.cardid);
									if (player === game.me) {
										ui.updatehl();
									}
								},
							},
							setup: {
								trigger: {
									player: "enterGame",
									global: "phaseBefore",
								},
								forced: true,
								sourceSkill: "hadjanrong",
								filter(event, player) {
									if (!player.hasSkill("hadjanrong")) return false;
									if (event.name === "phase" && game.phaseNumber !== 0) return false;
									const discardCount = player.countCards("s", card => card.hasGaintag("hadjanrong_discard"));
									return discardCount === 0;
								},
								async content(event, trigger, player) {
									const X = player.maxHp;
									const discardPile = Array.from(ui.discardPile.childNodes);
									const bottomCards = discardPile.slice(0, X);
									if (bottomCards.length > 0) {
										const cardsx = game.createFakeCards(bottomCards);
										player.directgains(cardsx, null, "hadjanrong_discard");
										game.log(player, "观看了弃牌堆底的" + get.cnNumber(cardsx.length) + "张牌");
									}
									if (player === game.me) {
										ui.updatehl();
									}
								},
							},
							refresh: {
								trigger: { global: ["loseAfter", "cardsDiscardAfter", "loseAsyncAfter", "useCardAfter", "gainAfter"] },
								forced: true,
								priority: 5,
								sourceSkill: "hadjanrong",
								filter(event, player) {
									if (player._hadjanrong_refreshing) return false;
									if (!player.hasSkill("hadjanrong")) return false;
									const X = player.maxHp;
									const discardPile = Array.from(ui.discardPile.childNodes);
									const currentBottomCards = discardPile.slice(0, X);
									const currentCardIds = currentBottomCards.map(c => c.cardid);
									const lastCardIds = player._hadjanrong_last_cardids || [];
									const cardIdsChanged = JSON.stringify(currentCardIds) !== JSON.stringify(lastCardIds);
									if (!cardIdsChanged) return false;
									if (event.name === "useCard") {
										if (event.player !== player) return false;
										if (!event.cards || !event.cards.length) return false;
										return true;
									}
									if (event.name === "gain") {
										if (event.player !== player) return false;
										return true;
									}
									if (event.name === "lose" || event.name === "loseAsync") {
										if (!event.cards || !event.cards.length) return false;
										if (event.position !== ui.discardPile) return false;
									} else if (event.name === "cardsDiscard") {
										if (!event.cards || !event.cards.length) return false;
									}
									return true;
								},
								async content(event, trigger, player) {
									player._hadjanrong_refreshing = true;
									const oldCards = player.getCards("s", card => card.hasGaintag("hadjanrong_discard"));
									game.deleteFakeCards(oldCards);
									const X = player.maxHp;
									const discardPile = Array.from(ui.discardPile.childNodes);
									const bottomCards = discardPile.slice(0, X);
									if (bottomCards.length > 0) {
										const cardsx = game.createFakeCards(bottomCards);
										player.directgains(cardsx, null, "hadjanrong_discard");
									}
									player._hadjanrong_last_cardids = bottomCards.map(c => c.cardid);
									delete player._hadjanrong_using_cards;
									player._hadjanrong_refreshing = false;
									if (player === game.me) {
										ui.updatehl();
									}
								},
							},
							maxHp: {
								trigger: { player: "gainMaxHpAfter" },
								forced: true,
								sourceSkill: "hadjanrong",
								filter(event, player) {
									if (!player.hasSkill("hadjanrong")) return false;
									const X = player.maxHp;
									const discardCount = player.countCards("s", card => card.hasGaintag("hadjanrong_discard"));
									return discardCount < X;
								},
								async content(event, trigger, player) {
									const oldCards = player.getCards("s", card => card.hasGaintag("hadjanrong_discard"));
									game.deleteFakeCards(oldCards);
									const X = player.maxHp;
									const discardPile = Array.from(ui.discardPile.childNodes);
									const bottomCards = discardPile.slice(0, X);
									if (bottomCards.length > 0) {
										const cardsx = game.createFakeCards(bottomCards);
										player.directgains(cardsx, null, "hadjanrong_discard");
									}
									if (player === game.me) {
										ui.updatehl();
									}
								},
							},
						},
					},
					hadjyihui: {
						trigger: { player: "phaseBegin" },
						forced: true,
						locked: false,
						juexingji: true,
						skillAnimation: true,
						animationColor: "gold",
						filter(event, player) {
							const skills = player.getStorage("hadjanrong", []);
							return skills && skills.length >= 3;
						},
						async content(event, trigger, player) {
							player.awakenSkill(event.name);
							game.playSkillBgm("hadj");
							await player.recover(1);
							await player.removeSkills("hadjanrong");
							player.unmarkSkill("hadjanrong");
							game.log(player, "失去了技能【暗融】");
							if (game.hadj_audio && !game.hadj_audio.ended) {
								game.hadj_audio.pause();
								game.hadj_audio.currentTime = 0;
							}
							game.playSkillBgm("djsj");
							const skills = player.getStorage("hadjanrong", []);
							const oldMaxHp = player.maxHp;
							const oldHp = player.hp;
							const oldSingleHp = player.singleHp;
							const targetName = "黑暗迪迦";
							const newName = "迪迦";
							if (player.name1 === targetName) {
								player.reinitCharacter(player.name1, newName, false);
							} else if (player.name2 === targetName) {
								player.reinitCharacter(player.name2, newName, false);
							} else {
								player.reinitCharacter(player.name, newName, false);
							}
							player.maxHp = oldMaxHp;
							player.hp = Math.min(oldHp, oldMaxHp);
							player.singleHp = oldSingleHp;
							player.update();
							if (!player.hasSkill("djsj")) {
								await player.addSkills("djsj");
							}
							for (const skill of skills) {
								if (!player.hasSkill(skill)) {
									await player.addSkills(skill);
								}
							}
							game.log(player, "将武将牌替换为【迪迦】");
						},
					},
					sjyuzhi: {
						trigger: { global: ["changeHp", "loseAfter", "draw", "gainAfter"] },
						filter(event, player) {
							if (!player.hasSkill("sjzhanren")) return false;
							const target = event.player;
							if (!target || !target.isIn()) return false;
							if (target.storage?.sjyuzhi_executing) return false;
							let evt = event;
							while (evt) {
								if (evt.name === "sjzhanren_trigger" || evt.name === "sjzhanren") {
									return false;
								}
								evt = typeof evt.getParent === "function" ? evt.getParent() : null;
							}
							if (event.name === "changeHp") {
								return target.hp <= 1;
							} else if (event.name === "lose") {
								const cards = event.cards?.filter(card => event.hs?.includes(card));
								if (!cards || cards.length === 0) return false;
								return target.countCards("h") <= 1;
							} else if (event.name === "draw" || event.name === "gain") {
								if (!event.cards || event.cards.length === 0) return false;
								return target.countCards("h") <= 1;
							}
							return false;
						},
						async cost(event, trigger, player) {
							const triggerTarget = trigger.player;
							const result = await player
								.chooseTarget({
									prompt: get.prompt(event.skill),
									prompt2: "令其摸一张牌并对其发动【斩刃】",
									filterTarget: (card, player, target) => target === triggerTarget,
								})
								.set("ai", target => {
									if (target !== triggerTarget) return 0;
									return get.attitude(player, target) > 0 ? 10 : 0;
								})
								.forResult();
							if (!result?.bool) {
								event.result = { bool: false };
								return;
							}
							event.result = { bool: true, targets: result.targets };
						},
						async content(event, trigger, player) {
							const target = event.targets[0];
							if (!target.storage) target.storage = {};
							target.storage.sjyuzhi_executing = true;
							try {
								await target.draw(1);
								const next = game.createEvent("sjzhanren_trigger", false);
								next.player = player;
								next.target = target;
								next.setContent(lib.skill.sjzhanren.content);
								await next;
							} finally {
								delete target.storage.sjyuzhi_executing;
							}
						},
						ai: {
							combo: "sjzhanren",
							order: 10,
							result: {
								target(player, target) {
									if (get.attitude(player, target) > 0) return 3;
									return -3;
								},
							},
						},
					},
					sjzhanren: {
						enable: "phaseUse",
						usable: 1,
						filter(event, player) {
							return game.hasPlayer(current => current.countCards("h") > 0);
						},
						filterTarget(card, player, target) {
							return target.countCards("h") > 0;
						},
						selectTarget: 1,
						async content(event, trigger, player) {
							game.playSkillBgm("sj");
							const target = event.target;
							const num = target.countCards("h");
							const cards = get.cards(num, true);
							const targetHandCards = target.getCards("h");
							const allCards = cards.concat(targetHandCards);
							const handCount = targetHandCards.length;
							const suitMap = {};
							for (const card of allCards) {
								const suit = get.suit(card, target);
								if (suit && suit !== "none") {
									if (!suitMap[suit]) suitMap[suit] = [];
									suitMap[suit].push(card);
								}
							}
							let canOneClickDraw = false;
							let maxSuit = null;
							let maxSuitCount = 0;
							if (handCount > 1) {
								for (const suit in suitMap) {
									if (suitMap[suit].length >= handCount && suitMap[suit].length > maxSuitCount) {
										maxSuitCount = suitMap[suit].length;
										maxSuit = suit;
										canOneClickDraw = true;
									}
								}
							}
							let canOneClickDiscard = false;
							if (handCount > 1) {
								const uniqueSuits = Object.keys(suitMap);
								if (uniqueSuits.length >= handCount) {
									canOneClickDiscard = true;
								}
							}
							const moveEvent = player
								.chooseToMove_new("斩刃：选择任意张牌进行交换", true)
								.set("list", [
									["牌堆顶的牌", cards],
									[get.translation(target) + "的手牌", targetHandCards],
								])
								.set("filterMove", (from, to, moved) => typeof to !== "number")
								.set("processAI", list => {
									const player = get.player();
									const target = get.event().getParent().target;
									const attitude = get.attitude(player, target);
									const allCards = list.map(i => i[1]).flat();
									const handCount = target.countCards("h");
									if (attitude >= 0) {
										const suitMap = {};
										for (const card of allCards) {
											const suit = get.suit(card, target);
											if (!suitMap[suit]) suitMap[suit] = [];
											suitMap[suit].push(card);
										}
										let bestSuit = null;
										let maxCount = 0;
										for (const suit in suitMap) {
											if (suitMap[suit].length >= handCount && suitMap[suit].length > maxCount) {
												maxCount = suitMap[suit].length;
												bestSuit = suit;
											}
										}
										if (bestSuit) {
											const sameSuitCards = suitMap[bestSuit].slice(0, handCount);
											const remaining = allCards.filter(c => !sameSuitCards.includes(c));
											return [remaining, sameSuitCards];
										}
										const sorted = allCards.sort((a, b) => get.value(b, target) - get.value(a, target));
										const topCards = sorted.slice(0, handCount);
										const topSuits = new Set(topCards.map(c => get.suit(c, target)).filter(s => s && s !== "none"));
										if (topSuits.size === handCount && handCount > 1) {
											for (let i = handCount; i < sorted.length; i++) {
												const swapSuit = get.suit(sorted[i], target);
												if (swapSuit && swapSuit !== "none" && topSuits.has(swapSuit)) {
													sorted.splice(i, 1);
													sorted.pop();
													sorted.push(sorted.splice(handCount - 1, 1)[0]);
													break;
												}
											}
										}
										const highValue = sorted.slice(0, handCount);
										const remaining = sorted.slice(handCount);
										return [remaining, highValue];
									} else {
										const suitSet = new Set();
										const uniqueSuitCards = [];
										for (const card of allCards) {
											const suit = get.suit(card, target);
											if (!suitSet.has(suit) && uniqueSuitCards.length < handCount) {
												suitSet.add(suit);
												uniqueSuitCards.push(card);
											}
										}
										if (uniqueSuitCards.length === handCount) {
											const remaining = allCards.filter(c => !uniqueSuitCards.includes(c));
											return [remaining, uniqueSuitCards];
										}
										const sorted = allCards.sort((a, b) => get.value(a, target) - get.value(b, target));
										const topCards = sorted.slice(0, handCount);
										const firstSuit = get.suit(topCards[0], target);
										if (firstSuit && firstSuit !== "none" && topCards.every(c => get.suit(c, target) === firstSuit)) {
											for (let i = handCount; i < sorted.length; i++) {
												const swapSuit = get.suit(sorted[i], target);
												if (swapSuit && swapSuit !== "none" && swapSuit !== firstSuit) {
													sorted.splice(i, 1);
													sorted.pop();
													sorted.push(sorted.splice(handCount - 1, 1)[0]);
													break;
												}
											}
										}
										const lowValue = sorted.slice(0, handCount);
										const remaining = sorted.slice(handCount);
										return [remaining, lowValue];
									}
								});
							let sjControl = null;
							if (canOneClickDraw || canOneClickDiscard) {
								let retryCount = 0;
								const injectButtons = () => {
									const dialog = moveEvent.dialog;
									if (!dialog) {
										if (retryCount < 20) {
											retryCount++;
											setTimeout(injectButtons, 50);
										}
										return;
									}
									if (sjControl || ui.control.querySelector(".sjzhanren-control")) return;
									sjControl = ui.create.div(".control.sjzhanren-control");
									sjControl.style.opacity = "0";
									if (canOneClickDraw) {
										const drawBtn = document.createElement("div");
										drawBtn.link = "sj_draw";
										drawBtn.innerHTML = "一键摸牌（" + get.translation(maxSuit) + "）";
										drawBtn.css({ position: "relative", padding: "3px", margin: "0", cursor: "pointer" });
										drawBtn.addEventListener(lib.config.touchscreen ? "touchend" : "click", function (e) {
											e.stopPropagation();
											const containers = dialog.itemContainers;
											if (!containers || containers.length < 5) return;
											const pileContainer = containers[2];
											const handContainer = containers[4];
											const allCardElems = [...Array.from(pileContainer.children), ...Array.from(handContainer.children)];
											const sameSuitCards = suitMap[maxSuit].slice(0, handCount);
											const sameSuitElems = allCardElems.filter(elem => sameSuitCards.includes(elem.link));
											const remainingElems = allCardElems.filter(elem => !sameSuitCards.includes(elem.link));
											while (pileContainer.firstChild) pileContainer.removeChild(pileContainer.firstChild);
											while (handContainer.firstChild) handContainer.removeChild(handContainer.firstChild);
											for (const elem of remainingElems) pileContainer.appendChild(elem);
											for (const elem of sameSuitElems) handContainer.appendChild(elem);
											moveEvent.moved = [Array.from(pileContainer.children).map(e => e.link), Array.from(handContainer.children).map(e => e.link)];
											ui.create.confirm("o");
											game.log(player, "使用了一键摸牌，将" + get.translation(target) + "的手牌替换为" + get.translation(maxSuit) + "花色");
										});
										if (lib.config.button_press) {
											drawBtn.addEventListener(lib.config.touchscreen ? "touchstart" : "mousedown", function () {
												this.classList.add("controlpressdown");
											});
											drawBtn.addEventListener(lib.config.touchscreen ? "touchend" : "mouseup", function () {
												this.classList.remove("controlpressdown");
											});
										}
										sjControl.appendChild(drawBtn);
									}
									if (canOneClickDiscard) {
										const discardBtn = document.createElement("div");
										discardBtn.link = "sj_discard";
										discardBtn.innerHTML = "一键弃牌";
										discardBtn.css({ position: "relative", padding: "3px", margin: "0 0 0 6px", cursor: "pointer" });
										discardBtn.addEventListener(lib.config.touchscreen ? "touchend" : "click", function (e) {
											e.stopPropagation();
											const containers = dialog.itemContainers;
											if (!containers || containers.length < 5) return;
											const pileContainer = containers[2];
											const handContainer = containers[4];
											const allCardElems = [...Array.from(pileContainer.children), ...Array.from(handContainer.children)];
											const suitSet = new Set();
											const uniqueSuitElems = [];
											for (const elem of allCardElems) {
												const suit = get.suit(elem.link, target);
												if (suit && suit !== "none" && !suitSet.has(suit) && uniqueSuitElems.length < handCount) {
													suitSet.add(suit);
													uniqueSuitElems.push(elem);
												}
											}
											if (uniqueSuitElems.length < handCount) return;
											const remainingElems = allCardElems.filter(elem => !uniqueSuitElems.includes(elem));
											while (pileContainer.firstChild) pileContainer.removeChild(pileContainer.firstChild);
											while (handContainer.firstChild) handContainer.removeChild(handContainer.firstChild);
											for (const elem of remainingElems) pileContainer.appendChild(elem);
											for (const elem of uniqueSuitElems) handContainer.appendChild(elem);
											moveEvent.moved = [Array.from(pileContainer.children).map(e => e.link), Array.from(handContainer.children).map(e => e.link)];
											ui.create.confirm("o");
											game.log(player, "使用了一键弃牌，将" + get.translation(target) + "的手牌替换为不同花色");
										});
										if (lib.config.button_press) {
											discardBtn.addEventListener(lib.config.touchscreen ? "touchstart" : "mousedown", function () {
												this.classList.add("controlpressdown");
											});
											discardBtn.addEventListener(lib.config.touchscreen ? "touchend" : "mouseup", function () {
												this.classList.remove("controlpressdown");
											});
										}
										sjControl.appendChild(discardBtn);
									}
									ui.control.insertBefore(sjControl, ui.confirm);
									ui.updatec();
									setTimeout(() => {
										if (sjControl && sjControl.parentNode) {
											sjControl.style.transition = "opacity 0.5s";
											sjControl.style.opacity = "1";
											ui.refresh(sjControl);
											sjControl.style.transition = "";
										}
									}, 50);
								};
								setTimeout(injectButtons, 50);
							}
							const result = await moveEvent.forResult();
							if (sjControl && sjControl.parentNode) {
								sjControl.addTempClass("controlpressdownx", 500);
								setTimeout(() => {
									if (sjControl && sjControl.parentNode) sjControl.parentNode.removeChild(sjControl);
									sjControl = null;
									ui.updatec();
								});
							}
							if (result?.bool) {
								await game
									.loseAsync({
										player,
										target,
										cards: result.moved.flat(),
										moved: result.moved,
									})
									.setContent(async function (event, trigger, player) {
										const { target, cards, moved } = event;
										const hs = target.getCards("h");
										const gain = moved[1].filter(card => !hs.includes(card));
										const puts = moved[0].filter(card => hs.includes(card));
										const originPile = cards.slice().removeArray(hs);
										if (puts.length) {
											target.$throw(puts.length, 100);
											await target.lose(puts, ui.ordering).set("getlx", false);
										}
										await game.cardsGotoOrdering(originPile);
										if (gain.length) {
											await target.gain(gain, "draw").set("getlx", false);
										}
										await game.cardsGotoPile(moved[0].slice().reverse(), ["insert_card", true]);
										game.addCardKnower(moved[0], player);
									});
							}
							const hs = target.getCards("h");
							if (hs.length === 0) return;
							const suits = [];
							const map = {};
							for (const card of hs) {
								const suit = get.suit(card, target);
								if (!map[suit]) {
									map[suit] = 1;
								} else {
									map[suit]++;
								}
								suits.push(suit);
							}
							const uniqueSuits = suits.filter((v, i, a) => a.indexOf(v) === i);
							let triggered = false;
							if (hs.length === 1) {
								const result = await player
									.chooseControl(["弃牌", "摸牌"])
									.set("prompt", "斩刃：请为" + get.translation(target) + "选择一项")
									.set("ai", () => {
										const attitude = get.attitude(player, target);
										return attitude >= 0 ? "摸牌" : "弃牌";
									})
									.forResult();
								if (result.control === "弃牌") {
									await target.discard(hs);
									game.log(player, "弃置了" + get.translation(target) + "的所有手牌");
									triggered = true;
								} else {
									const bottomCards = get.bottomCards(1);
									if (bottomCards.length > 0) {
										await target.gain(bottomCards, "draw");
									}
									game.log(player, "令" + get.translation(target) + "从牌堆底摸了1张牌");
									triggered = true;
								}
							} else if (uniqueSuits.length === hs.length) {
								await target.discard(hs);
								game.log(player, "弃置了" + get.translation(target) + "的所有手牌（花色均不相同）");
								triggered = true;
							} else if (uniqueSuits.length === 1) {
								const drawNum = hs.length;
								const bottomCards = get.bottomCards(drawNum);
								if (bottomCards.length > 0) {
									await target.gain(bottomCards, "draw");
								}
								game.log(player, "令" + get.translation(target) + "从牌堆底摸了" + drawNum + "张牌（花色均相同）");
								triggered = true;
							}
							if (triggered) {
								const stat = player.getStat("skill");
								stat.sjzhanren = 0;
							}
						},
						ai: {
							order: 10,
							result: {
								target(player, target) {
									if (target !== player) {
										if (target.countCards("h") > 3) return -5;
										if (target.countCards("h") === 3) return -3;
									}
									return 0.5;
								},
							},
						},
					},
					xklkeyan: {
						audio: ["ext:无名扩展/audio/skill/keyan.mp3"],
						enable: "phaseUse",
						usable: 1,
						locked: false,
						filter(event, player) {
							return ui.cardPile.childNodes.length > 0;
						},
						get prompt() {
							const player = _status.currentPhase;
							if (!player) return "科研";
							const stat = player.getStat("skill");
							const used = stat.xklkeyan || 0;
							const remain = Math.max(0, 1 + (used < 0 ? -used : 0) - (used > 0 ? used : 0));
							return "科研（本回合剩余可发动" + remain + "次）";
						},
						async content(event, trigger, player) {
							const card = get.cards(1, true);
							event.card = card[0];
							if (!event.card) return;
							ui.cardPile.insertBefore(event.card, ui.cardPile.firstChild);
							game.updateRoundNumber();
							const cardName = get.name(event.card, player);
							const cardNature = get.nature(event.card, player);
							let natureText = "";
							if (cardNature) {
								const natureMap = { fire: "火", thunder: "雷", ice: "冰", poison: "毒" };
								natureText = natureMap[cardNature] || "";
							}
							const cardNameTranslation = get.translation(cardName);
							const message = "牌名：【" + natureText + cardNameTranslation + "】";
							event.dialog = ui.create.dialog(message);
							event.dialog.classList.add("fixed");
							await new Promise(resolve => setTimeout(resolve, 1200));
							event.dialog.close();
							delete event.dialog;
							const suitList = ["红心", "黑桃", "梅花", "方块"];
							const suitResult = await player
								.chooseControl(suitList)
								.set("prompt", "请猜测此牌的花色")
								.set("ai", () => get.rand(0, 3))
								.forResult();
							event.suitChoice = suitResult.index;
							const numberList = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
							const numberResult = await player
								.chooseControl(numberList)
								.set("prompt", "请猜测此牌的点数")
								.set("ai", () => get.rand(0, 12))
								.forResult();
							event.numberChoice = numberResult.index + 1;
							const cardSuit = get.suit(event.card);
							const cardNumber = get.number(event.card);
							const suitMap = { 红心: "heart", 黑桃: "spade", 梅花: "club", 方块: "diamond" };
							const suitNames = ["红心", "黑桃", "梅花", "方块"];
							let correctCount = 0;
							if (suitMap[suitNames[event.suitChoice]] === cardSuit) {
								correctCount++;
							}
							if (event.numberChoice === cardNumber) {
								correctCount++;
							}
							event.correctCount = correctCount;
							let resultMessage = "";
							if (correctCount >= 1) {
								const next = player.gain(event.card, "gain2");
								next.gaintag.add("xklkeyan_nolimit");
								await next;
								const stat = player.getStat("skill");
								stat.xklkeyan = (stat.xklkeyan || 0) - correctCount;
								resultMessage = "猜对了" + correctCount + "项！本回合科研可发动次数+" + correctCount;
							} else {
								await player.lose(event.card, ui.discardPile);
								resultMessage = "猜错了！";
							}
							event.dialog2 = ui.create.dialog(resultMessage);
							event.dialog2.classList.add("fixed");
							await new Promise(resolve => setTimeout(resolve, 800));
							if (event.dialog2) {
								event.dialog2.close();
								delete event.dialog2;
							}
						},
						ai: {
							order: 5,
							result: {
								player(player) {
									return 1;
								},
							},
						},
						mod: {
							ignoredHandcard(card, player) {
								if (card.hasGaintag("xklkeyan_nolimit")) {
									return true;
								}
							},
							cardDiscardable(card, player, name) {
								if (name == "phaseDiscard" && card.hasGaintag("xklkeyan_nolimit")) {
									return false;
								}
							},
							cardUsable(card, player) {
								if (typeof card === "object") {
									if ([card].concat(card.cards || []).some(cardx => get.itemtype(cardx) === "card" && cardx.hasGaintag("xklkeyan_nolimit"))) {
										return Infinity;
									}
								}
							},
							targetInRange(card, player, target) {
								if (typeof card === "object") {
									if ([card].concat(card.cards || []).some(cardx => get.itemtype(cardx) === "card" && cardx.hasGaintag("xklkeyan_nolimit"))) {
										return true;
									}
								}
							},
						},
					},
					xkllizhu: {
						trigger: { global: "addMark" },
						direct: true,
						firstDo: true,
						filter(event, player) {
							if (event._xkllizhu_triggered) return false;
							if (event.log === false) return false;
							return event.num > 0;
						},
						async content(event, trigger, player) {
							const target = trigger.player;
							const markName = trigger.markName;
							if (!target || !markName) return;
							const sourceEvent = trigger.getParent();
							const source = sourceEvent?.player;
							const result = await player
								.chooseControl("令标记+1", "不使用")
								.set("prompt", "力助：是否令" + get.translation(target) + "的" + get.translation(markName) + "标记数量+1？")
								.set("ai", () => {
									if (source && get.attitude(source, player) < 0) {
										return "不使用";
									}
									if (get.attitude(target, player) > 0) {
										return "令标记+1";
									}
									return "不使用";
								})
								.forResult();
							if (result.control === "令标记+1") {
								game.playSkillBgm("xikali");
								trigger._xkllizhu_triggered = true;
								target.setStorage(markName, target.getStorage(markName, 0) + 1);
								target.markSkill(markName);
								game.log(player, "令" + get.translation(target) + "的" + get.translation(markName) + "标记数量+1");
							}
						},
						group: ["xkllizhu_useEquip", "xkllizhu_die"],
						subSkill: {
							die: {
								trigger: { player: "die" },
								forced: true,
								silent: true,
								async content(event, trigger, player) {
									if (game.xikali_audio && !game.xikali_audio.ended) {
										game.xikali_audio.pause();
										game.xikali_audio.currentTime = 0;
									}
								},
							},
							useEquip: {
								trigger: { player: "phaseEnd" },
								prompt: "是否发动【力助】？选择一名其他角色获得装备",
								filter(event, player) {
									const history = player.getHistory("lose", evt => {
										if (evt.type !== "discard") return false;
										if (!evt.cards) return false;
										return evt.cards.some(c => get.type(c) === "equip");
									});
									if (history.length === 0) return false;
									for (const evt of history) {
										for (const c of evt.cards) {
											if (get.type(c) === "equip" && get.position(c) === "d") {
												return true;
											}
										}
									}
									return false;
								},
								check(event, player) {
									return game.hasPlayer(p => p !== player && get.attitude(player, p) > 0);
								},
								async content(event, trigger, player) {
									const history = player.getHistory("lose", evt => {
										if (evt.type !== "discard") return false;
										if (!evt.cards) return false;
										return evt.cards.some(c => get.type(c) === "equip");
									});
									const equipCards = [];
									for (const evt of history) {
										for (const c of evt.cards) {
											if (get.type(c) === "equip" && get.position(c) === "d") {
												equipCards.push(c);
											}
										}
									}
									if (equipCards.length === 0) return;
									const result = await player
										.chooseTarget(true)
										.set("filterTarget", (card, player, target) => target !== player)
										.set("ai", target => {
											if (target === player) return -10;
											const att = get.attitude(player, target);
											if (att <= 0) return -10;
											return att + Math.random();
										})
										.forResult();
									if (result.bool && result.targets?.length > 0) {
										const target = result.targets[0];
										const card = equipCards.randomGet();
										await target.gain(card, "give");
										if (target.canEquip(card)) {
											await target.equip(card);
											game.log(player, "令" + get.translation(target) + "获得并装备了" + get.translation(card));
										} else {
											game.log(player, "令" + get.translation(target) + "获得了" + get.translation(card));
										}
									}
								},
							},
						},
					},
					ffshalong: {
						enable: "phaseUse",
						usable: 2,
						zhuanhuanji: true,
						mark: true,
						marktext: "☯",
						prompt(event, player) {
							const isMang = player.storage.ffshalong;
							if (isMang) {
								return "芒：令所有“沙龙成员”回复体力";
							}
							return "荒：令所有“沙龙成员”崩血";
						},
						intro: {
							content(storage) {
								return storage ? "芒：令所有“沙龙成员”回复一点体力" : "荒：令所有“沙龙成员”崩血";
							},
						},
						filter(event, player) {
							return player.countMark("ffkuanghuan_member") > 0;
						},
						async content(event, trigger, player) {
							const isHuang = !player.storage.ffshalong;
							if (isHuang) {
								game.playAudio("..", "extension", "无名扩展", "audio/skill/shalong" + (Math.floor(Math.random() * 3) + 1));
								const members = game.filterPlayer(p => p.countMark("ffkuanghuan_member") > 0);
								const targets = members.filter(m => m.hp > Math.ceil(m.maxHp / 2));
								event.targets = targets;
								if (targets.length > 0) {
									for (const target of targets) {
										await target.loseHp();
									}
								}
								const result = await player
									.chooseTarget(true, "沙龙：选择一张【杀】的目标")
									.set("filterTarget", (card, player, target) => player !== target && lib.filter.targetEnabled({ name: "sha" }, player, target))
									.set("ai", target => get.effect(target, { name: "sha" }, player, player))
									.forResult();
								if (result.bool && result.targets?.length > 0) {
									const next = player.useCard({ name: "sha", isCard: false }, result.targets[0], false);
									next.addCount = false;
									game.log(player, "视为对", result.targets[0], "使用了一张【杀】");
									await next;
								}
							} else {
								game.playAudio("..", "extension", "无名扩展", "audio/skill/shalong" + (Math.floor(Math.random() * 3) + 4));
								const members = game.filterPlayer(p => p.countMark("ffkuanghuan_member") > 0);
								for (const member of members) {
									await member.recover(1);
								}
							}
						},
						ai: {
							order: 10,
							result: {
								player(player) {
									return 1;
								},
							},
						},
						group: ["ffshalong_change"],
						subSkill: {
							change: {
								trigger: { player: "phaseBegin" },
								direct: true,
								async content(event, trigger, player) {
									const state = player.storage.ffshalong ? "芒" : "荒";
									const result = await player
										.chooseControl("转换", "不转换")
										.set("prompt", "沙龙：当前状态为【" + state + "】，是否转换？")
										.set("ai", () => {
											const player = get.player();
											const isMang = !!player.storage.ffshalong;
											const members = game.filterPlayer(p => p.countMark("ffkuanghuan_member") > 0 && p.isIn());
											const hasDamagedMember = members.some(m => m.maxHp - m.hp >= 2);
											if (hasDamagedMember) {
												return isMang ? "不转换" : "转换";
											} else {
												return isMang ? "转换" : "不转换";
											}
										})
										.forResult();
									if (result.control === "转换") {
										player.changeZhuanhuanji("ffshalong");
										game.log(player, "将沙龙状态转换为【" + (player.storage.ffshalong ? "芒" : "荒") + "】");
									}
								},
							},
						},
					},
					ffyuanwu: {
						audio: ["ext:无名扩展/audio/skill/yuanwu1", "ext:无名扩展/audio/skill/yuanwu2"],
						group: ["ffyuanwu_huang", "ffyuanwu_mang", "ffyuanwu_mang_damage"],
						subSkill: {
							huang: {
								audio: "ffyuanwu",
								trigger: { source: "damageAfter" },
								filter(event, player) {
									return !player.storage.ffshalong;
								},
								async content(event, trigger, player) {
									const members = game.filterPlayer(p => p.countMark("ffkuanghuan_member") > 0);
									for (const member of members) {
										await member.recover();
									}
								},
							},
							mang: {
								audio: "ffyuanwu",
								trigger: { player: "recoverAfter" },
								filter(event, player) {
									return player.storage.ffshalong;
								},
								check(event, player) {
									const members = game.filterPlayer(m => m.countMark("ffkuanghuan_member") > 0);
									return members.every(m => m.hp > 1);
								},
								async content(event, trigger, player) {
									const result = await player
										.chooseTarget(true, "圆舞：选择一张【杀】的目标")
										.set("filterTarget", (card, player, target) => player !== target)
										.set("ai", target => get.effect(target, { name: "sha" }, player, player))
										.forResult();
									if (result.bool && result.targets?.length > 0) {
										const card = { name: "sha", isVirtual: true };
										card._ffyuanwu_mang_sha = true;
										const next = player.useCard(card, result.targets[0], "noai");
										next.addCount = false;
										game.log(player, "视为对", result.targets[0], "使用了一张【杀】");
										await next;
									}
								},
							},
							mang_damage: {
								trigger: { source: "damageAfter" },
								filter(event, player) {
									return event.card && event.card._ffyuanwu_mang_sha;
								},
								forced: true,
								async content(event, trigger, player) {
									const members = game.filterPlayer(m => m.countMark("ffkuanghuan_member") > 0);
									for (const member of members) {
										await member.loseHp();
									}
								},
							},
						},
					},
					ffkuanghuan: {
						audio: ["ext:无名扩展/audio/skill/kuanghuan1", "ext:无名扩展/audio/skill/kuanghuan2", "ext:无名扩展/audio/skill/kuanghuan3"],
						trigger: {
							global: ["gameStart", "roundStart"],
						},
						forced: true,
						locked: false,
						async content(event, trigger, player) {
							const name = event.triggername;
							if (name === "gameStart") {
								player.setStorage("ffkuanghuan_round", 1);
								const list = game.filterPlayer();
								const result = await player
									.chooseTarget("狂欢：选择任意名角色获得“沙龙成员”标记", [1, list.length], true)
									.set("ai", target => {
										const role = player.role;
										if (role === "zhu") {
											if (target !== player) return Math.random();
											return 0;
										} else if (role === "zhong" || role === "nei") {
											const lord = game.findPlayer(p => p.role === "zhu");
											if (target === lord) return 2;
											if (target !== player) return Math.random();
											return 0;
										} else if (role === "fan") {
											const lord = game.findPlayer(p => p.role === "zhu");
											if (target !== lord && target !== player) return Math.random();
											return 0;
										}
										return get.attitude(player, target) > 0 ? 1 : 0;
									})
									.forResult();
								if (result.bool && result.targets?.length > 0) {
									let hasSelf = false;
									for (const target of result.targets) {
										target.addMark("ffkuanghuan_member", 1);
										target.addSkill("ffkuanghuan_effect_skill");
										if (target === player) hasSelf = true;
									}
									if (!hasSelf) {
										player.addMark("ffkuanghuan_member", 1);
										player.addSkill("ffkuanghuan_effect_skill");
									}
								}
							} else if (name === "roundStart") {
								const qifenCount = player.countMark("ffkuanghuan_qifen");
								const effectCount = player.countMark("ffkuanghuan_effect");
								if (qifenCount > 0) player.removeMark("ffkuanghuan_qifen", qifenCount);
								if (effectCount > 0) player.removeMark("ffkuanghuan_effect", effectCount);
								if (player.getStorage("ffkuanghuan_round", 1) >= 2) {
									player.setStorage("ffkuanghuan_round", player.getStorage("ffkuanghuan_round", 1) + 1);
								}
							}
						},
						group: ["ffkuanghuan_changehp"],
						subSkill: {
							changehp: {
								trigger: { global: "changeHp" },
								filter(event, player) {
									return event.player?.countMark("ffkuanghuan_member") > 0;
								},
								forced: true,
								async content(event, trigger, player) {
									const num = Math.abs(trigger.num ?? 1);
									player.addMark("ffkuanghuan_qifen", num);
									if (!player.hasMark("ffkuanghuan_effect")) player.addMark("ffkuanghuan_effect", 1);
								},
							},
							member: {
								marktext: "沙",
								mark: true,
								intro: {
									name: "沙龙成员",
									content: "已成为沙龙成员",
								},
							},
							effect_skill: {
								mod: {
									targetInRange(card, player, target) {
										const ffn = game.findPlayer(p => p.hasSkill("ffkuanghuan"));
										if (ffn && ffn.countMark("ffkuanghuan_qifen") >= 4) return true;
									},
									cardUsable(card, player, num) {
										if (card.name === "sha") {
											const ffn = game.findPlayer(p => p.hasSkill("ffkuanghuan"));
											if (ffn && ffn.countMark("ffkuanghuan_qifen") >= 8) return num + 1;
										}
									},
								},
								trigger: { source: "damageBegin1" },
								filter(event, player) {
									const ffn = game.findPlayer(p => p.hasSkill("ffkuanghuan"));
									return ffn && ffn.countMark("ffkuanghuan_qifen") >= 12;
								},
								forced: true,
								async content(event, trigger, player) {
									trigger.num++;
								},
							},
							qifen: {
								marktext: "氛",
								mark: true,
								intro: {
									name: "气氛",
									content: "气氛标记数量：#",
								},
							},
							effect: {
								marktext: "欢",
								mark: true,
								intro: {
									name: "狂欢效果",
									content(storage, player) {
										const ffn = game.findPlayer(p => p.hasSkill("ffkuanghuan"));
										if (!ffn) return "无效果";
										const qifen = ffn.countMark("ffkuanghuan_qifen");
										let str = "";
										if (qifen >= 4) str += "使用牌无距离限制<br>";
										if (qifen >= 8) str += "使用【杀】次数上限+1<br>";
										if (qifen >= 12) str += "造成的伤害+1<br>";
										if (str === "") str = "暂无效果";
										return str;
									},
								},
							},
						},
					},
					jkshouzhuo: {
						audio: ["ext:无名扩展/audio/skill/shouzhuo"],
						enable: ["chooseToUse", "chooseToRespond"],
						hiddenCard(player, name) {
							if (name === "wuxie") {
								if (_status.currentPhase === player) return false;
								return player.hasCard(card => get.color(card) === "red", "he");
							}
							return false;
						},
						filter(event, player) {
							if (!player.hasCards("he")) return false;
							const isMyPhase = _status.currentPhase === player;
							if (event.type === "wuxie") {
								if (isMyPhase) return false;
								return player.hasCard(card => get.color(card) === "red", "he");
							}
							const list = [];
							if (isMyPhase) {
								if (player.hasCard(card => get.color(card) === "black", "he")) {
									if (event.filterCard(get.autoViewAs({ name: "sha" }, "unsure"), player, event)) list.push("sha");
									if (event.filterCard(get.autoViewAs({ name: "jiu" }, "unsure"), player, event)) list.push("jiu");
								}
							} else {
								if (player.hasCard(card => get.color(card) === "red", "he")) {
									if (event.filterCard(get.autoViewAs({ name: "shan" }, "unsure"), player, event)) list.push("shan");
								}
							}
							return list.length > 0;
						},
						chooseButton: {
							dialog(event, player) {
								const list = [];
								const isMyPhase = _status.currentPhase === player;
								if (event.type === "wuxie") {
									list.push(["锦囊", "", "wuxie"]);
								} else if (isMyPhase) {
									if (player.hasCard(card => get.color(card) === "black", "he")) {
										if (event.filterCard(get.autoViewAs({ name: "sha" }, "unsure"), player, event)) list.push(["基本", "", "sha"]);
										if (event.filterCard(get.autoViewAs({ name: "jiu" }, "unsure"), player, event)) list.push(["基本", "", "jiu"]);
									}
								} else {
									if (player.hasCard(card => get.color(card) === "red", "he")) {
										if (event.filterCard(get.autoViewAs({ name: "shan" }, "unsure"), player, event)) list.push(["基本", "", "shan"]);
									}
								}
								return ui.create.dialog("手镯", [list, "vcard"]);
							},
							check(button) {
								const player = get.player();
								const name = button.link[2];
								const val = player.getUseValue({ name: name });
								const drawNum = Math.max(0, player.maxHp - player.countCards("h") + 1);
								return val + drawNum * 1.5 + 10;
							},
							backup(links, player) {
								const name = links[0][2];
								return {
									filterCard(card) {
										if (name === "sha" || name === "jiu") return get.color(card) === "black";
										if (name === "shan" || name === "wuxie") return get.color(card) === "red";
										return false;
									},
									position: "he",
									popname: true,
									check(card) {
										return 15 - get.value(card);
									},
									viewAs(cards) {
										if (!cards || !cards.length) return { name: name };
										const card = cards[0];
										return { name: name, suit: get.suit(card), number: get.number(card) };
									},
									async onuse(result, player) {
										player.logSkill("jkshouzhuo");
										const usedFromHand = (result.cards || []).filter(card => get.position(card) === "h").length;
										const num = Math.max(0, player.maxHp - player.countCards("h") + usedFromHand);
										if (num > 0) await player.draw(num);
									},
								};
							},
							prompt(links, player) {
								const name = links[0][2];
								const map = {
									sha: "黑色牌当做【杀】使用或打出",
									jiu: "黑色牌当做【酒】使用或打出",
									shan: "红色牌当做【闪】使用或打出",
									wuxie: "红色牌当做【无懈可击】使用",
								};
								return "将一张" + map[name];
							},
						},
						ai: {
							respondSha: true,
							respondShan: true,
							respondWuxie: true,
							respondJiu: true,
							skillTagFilter(player, tag) {
								const isMyPhase = _status.currentPhase === player;
								if (tag === "respondSha") {
									if (!isMyPhase) return false;
									return player.hasCard(card => get.color(card) === "black", "he");
								}
								if (tag === "respondShan" || tag === "respondWuxie") {
									if (isMyPhase) return false;
									return player.hasCard(card => get.color(card) === "red", "he");
								}
								if (tag === "respondJiu") {
									if (!isMyPhase) return false;
									return player.hasCard(card => get.color(card) === "black", "he");
								}
								return false;
							},
							order: 9,
							result: {
								player(player) {
									const drawNum = Math.max(0, player.maxHp - player.countCards("h") + 1);
									return 1 + drawNum * 0.5;
								},
							},
						},
					},
					jkjuedi: {
						trigger: { global: ["gameStart", "dieAfter", "reviveAfter", "restBegin", "restEnd"] },
						forced: true,
						locked: true,
						skillAnimation: true,
						animationColor: "gold",
						filter(event, player, name) {
							const aliveCount = game.countPlayer(p => p.isAlive());
							return aliveCount === 3 && !player.getStorage("jkjuedi_active", false);
						},
						async content(event, trigger, player) {
							player.setStorage("jkjuedi_active", 3);
							game.log(player, "发动了【绝地】，将持续" + get.cnNumber(3) + "个回合");
							game.playSkillBgm("jkjuedi");
							const targets = game.filterPlayer(current => current !== player);
							for (const target of targets) {
								target.addSkill("jkjuedi_disabled");
							}
						},
						mod: {
							cardUsable(card, player, num) {
								if (player.getStorage("jkjuedi_active", 0) > 0) {
									if (card.name === "sha") return num + 1;
								}
							},
							targetInRange(card, player, target) {
								if (player.getStorage("jkjuedi_active", 0) > 0) {
									return true;
								}
							},
						},
						group: ["jkjuedi_skipJudge", "jkjuedi_skipDiscard", "jkjuedi_phaseEnd", "jkjuedi_die"],
						subSkill: {
							skipJudge: {
								trigger: { player: "phaseJudgeBefore" },
								forced: true,
								filter(event, player) {
									return player.getStorage("jkjuedi_active", 0) > 0;
								},
								async content(event, trigger, player) {
									trigger.cancel();
								},
							},
							skipDiscard: {
								trigger: { player: "phaseDiscardBefore" },
								forced: true,
								filter(event, player) {
									return player.getStorage("jkjuedi_active", 0) > 0;
								},
								async content(event, trigger, player) {
									trigger.cancel();
								},
							},
							phaseEnd: {
								trigger: { player: "phaseEnd" },
								forced: true,
								filter(event, player) {
									return player.getStorage("jkjuedi_active", 0) > 0;
								},
								async content(event, trigger, player) {
									const remaining = player.getStorage("jkjuedi_active", 0) - 1;
									player.setStorage("jkjuedi_active", remaining);
									if (remaining <= 0) {
										player.setStorage("jkjuedi_active", 0);
										const targets = game.filterPlayer(current => current !== player);
										for (const target of targets) {
											target.removeSkill("jkjuedi_disabled");
										}
										if (game.jkjuedi_audio && !game.jkjuedi_audio.ended) {
											game.jkjuedi_audio.pause();
											game.jkjuedi_audio.currentTime = 0;
										}
										game.log(player, "的【绝地】效果结束");
									}
								},
							},
							disabled: {
								inherit: "baiban",
								charlotte: true,
								mark: true,
								marktext: "绝",
								intro: {
									content(storage, player, skill) {
										const list = player.getSkills(null, false, false).filter(i => lib.skill.baiban.skillBlocker(i, player));
										const source = game.findPlayer(p => p.getStorage("jkjuedi_active", 0) > 0);
										const remaining = source ? source.getStorage("jkjuedi_active", 0) : 0;
										let str = "";
										if (list.length) str += "<li>" + get.translation(list) + "失效";
										if (remaining > 0) str += "<li>剩余" + get.cnNumber(remaining) + "个回合<br>";
										else str += "<li>无失效技能";
										return str;
									},
								},
								markcount(storage, player) {
									const source = game.findPlayer(p => p.getStorage("jkjuedi_active", 0) > 0);
									return source ? source.getStorage("jkjuedi_active", 0) : 0;
								},
								onremove(player) {
									delete player.storage.jkjuedi_disabled;
								},
							},
						},
					},
					atmguanglun: {
						audio: ["ext:无名扩展/audio/skill/guanglun"],
						group: ["atmguanglun_viewas", "atmguanglun_reset"],
						trigger: { player: "useCardEffectEnd" },
						direct: true,
						filter(event, player) {
							if (!event.card) return false;
							const name = event.card.name;
							if (!name) return false;
							if (get.type(event.card) === "delay") return false;
							if (!get.tag(event.card, "damage")) return false;
							const targets = event.targets ?? [];
							if (event.effectedCount < event.effectCount) return false;
							const triggeredNames = player.getStorage("atmguanglun_triggered_names", []);
							if (triggeredNames.includes(name)) return false;
							return true;
						},
						async content(event, trigger, player) {
							const card = trigger.card;
							const cardName = card.name;
							if (!cardName) return;
							const choices = ["摸两张牌"];
							if (player.hp < player.maxHp) {
								choices.push("回复一点体力");
							}
							choices.push("cancel2");
							const result = await player
								.chooseControl(choices)
								.set("prompt", "光轮：请选择")
								.set("ai", () => {
									const evt = get.event();
									const p = evt.player;
									if (p.hp < p.maxHp && p.hp <= 2) return "回复一点体力";
									return "摸两张牌";
								})
								.forResult();
							if (result.control !== "cancel2") {
								player.logSkill("atmguanglun");
								game.playSkillBgm("atmguanglun");
								const triggeredNames = player.getStorage("atmguanglun_triggered_names", []);
								if (!triggeredNames.includes(cardName)) {
									triggeredNames.push(cardName);
									player.setStorage("atmguanglun_triggered_names", triggeredNames);
								}
								if (result.control === "摸两张牌") {
									await player.draw(2);
								} else if (result.control === "回复一点体力") {
									await player.recover(1);
								}
								const targets = trigger.targets ?? [];
								if (targets.length > 0 && targets[0].isAlive()) {
									trigger.effectCount++;
									game.log(trigger.card, "额外结算一次");
								}
							}
						},
						subSkill: {
							viewas: {
								enable: "phaseUse",
								hiddenCard(player, name) {
									const usedNames = player.getStorage("atmguanglun_used", []);
									const allowedCards = ["juedou", "huogong"];
									return allowedCards.includes(name) && !usedNames.includes(name);
								},
								filter(event, player) {
									const usedNames = player.getStorage("atmguanglun_used", []);
									const allowedCards = ["juedou", "huogong"];
									return allowedCards.some(name => !usedNames.includes(name));
								},
								chooseButton: {
									dialog(event, player) {
										const usedNames = player.getStorage("atmguanglun_used", []);
										const allowedCards = ["juedou", "huogong"];
										const list = [];
										for (const name of allowedCards) {
											if (!usedNames.includes(name)) {
												list.push([get.type({ name: name }, "trick"), "", name]);
											}
										}
										return ui.create.dialog("光轮：选择一张牌视为使用", [list, "vcard"]);
									},
									check(button) {
										return get.player().getUseValue({ name: button.link[2] });
									},
									backup(links, player) {
										const name = links[0][2];
										return {
											audio: "ext:无名扩展/audio/skill/guanglun",
											filterCard: () => false,
											selectCard: -1,
											viewAs: { name: name },
											async onuse(result, player) {
												const usedNames = player.getStorage("atmguanglun_used", []);
												if (!usedNames.includes(name)) {
													usedNames.push(name);
													player.setStorage("atmguanglun_used", usedNames);
												}
											},
										};
									},
									prompt(links, player) {
										return "选择" + get.translation(links[0][2]) + "的目标";
									},
								},
								ai: {
									order: 7,
									result: {
										player(player) {
											return 1;
										},
									},
								},
							},
							reset: {
								trigger: { player: "phaseAfter" },
								forced: true,
								silent: true,
								async content(event, trigger, player) {
									player.setStorage("atmguanglun_used", []);
									player.setStorage("atmguanglun_triggered_names", []);
								},
							},
						},
						ai: {
							order: 10,
							result: {
								player(player) {
									return 1;
								},
							},
						},
					},
					atmzhuangshuo: {
						trigger: { player: "damageBefore" },
						forced: true,
						locked: true,
						filter(event, player) {
							return event.nature === "thunder";
						},
						async content(event, trigger, player) {
							trigger.cancel();
						},
						ai: {
							effect: {
								target(player, card, player2, target) {
									if (get.tag(card, "thunderDamage")) return "zerotarget";
								},
							},
						},
					},
					atmnianli: {
						enable: "phaseUse",
						usable: 1,
						filter(event, player) {
							return player.hp > 0 && game.hasPlayer(target => target !== player);
						},
						filterTarget(card, player, target) {
							return target !== player;
						},
						async content(event, trigger, player) {
							await player.loseHp(1);
							if (event.target && event.target.isAlive()) {
								await event.target.damage(1, player);
							}
						},
						ai: {
							order: 4,
							result: {
								player(player, target) {
									if (player.hp <= 1) return -10;
									return get.damageEffect(target, player, player) - 1;
								},
								target(player, target) {
									return -2;
								},
							},
						},
					},
					qsklingjiang: {
						audio: ["ext:无名扩展/audio/skill/lingjiang1", "ext:无名扩展/audio/skill/lingjiang2"],
						trigger: { global: "phaseBegin" },
						forced: true,
						locked: false,
						filter(event, player) {
							const records = player.getStorage("qsklingjiang_records", []);
							return records.length < 6;
						},
						async content(event, trigger, player) {
							const records = player.getStorage("qsklingjiang_records", []);
							const cardPool = ["sha", "shan", "tao", "jiu", "juedou", "huogong", "nanman", "wanjian", "guohe", "shunshou", "wuzhong", "wuxie", "taoyuan", "wugu", "tiesuo", "jiedao"];
							while (records.length < 6 && cardPool.length > 0) {
								const randomIndex = Math.floor(Math.random() * cardPool.length);
								records.push(cardPool[randomIndex]);
								cardPool.splice(randomIndex, 1);
							}
							player.setStorage("qsklingjiang_records", records);
							player.markSkill("qsklingjiang");
						},
						mark: true,
						marktext: "影",
						intro: {
							name: "追影",
							markcount(storage, player) {
								return player.getStorage("qsklingjiang_records", []).length;
							},
							mark(dialog, storage, player) {
								const records = player.getStorage("qsklingjiang_records", []);
								if (records.length > 0) {
									dialog.addText("已记录：" + records.map(r => get.translation(r)).join("、"));
								} else {
									dialog.addText("暂无记录");
								}
							},
						},
						group: ["qsklingjiang_use", "qsklingjiang_refill"],
						subSkill: {
							refill: {
								trigger: { player: "qsklingjiang_recordEmpty" },
								forced: true,
								filter(event, player) {
									return player.getStorage("qsklingjiang_records", []).length === 0;
								},
								async content(event, trigger, player) {
									const records = [];
									const cardPool = ["sha", "shan", "tao", "jiu", "juedou", "huogong", "nanman", "wanjian", "guohe", "shunshou", "wuzhong", "wuxie", "taoyuan", "wugu", "tiesuo", "jiedao"];
									while (records.length < 6 && cardPool.length > 0) {
										const randomIndex = Math.floor(Math.random() * cardPool.length);
										records.push(cardPool[randomIndex]);
										cardPool.splice(randomIndex, 1);
									}
									player.setStorage("qsklingjiang_records", records);
									player.markSkill("qsklingjiang");
								},
							},
							use: {
								enable: ["phaseUse", "chooseToUse", "chooseToRespond"],
								hiddenCard(player, name) {
									return player.getStorage("qsklingjiang_records", []).includes(name);
								},
								filter(event, player) {
									const records = player.getStorage("qsklingjiang_records", []);
									if (records.length === 0) return false;
									for (const cardName of records) {
										const card = { name: cardName, isCard: true };
										if (event.name === "phaseUse") {
											if (player.hasUseTarget(card)) return true;
										} else if (event.filterCard?.(card, player, event)) {
											return true;
										}
									}
									return false;
								},
								chooseButton: {
									dialog(event, player) {
										const records = player.getStorage("qsklingjiang_records", []);
										const list = [];
										const added = {};
										for (const cardName of records) {
											if (added[cardName]) continue;
											const card = { name: cardName, isCard: true };
											let canUse = false;
											if (event.name === "phaseUse") {
												canUse = player.hasUseTarget(card);
											} else if (event.filterCard) {
												canUse = event.filterCard(card, player, event);
											}
											if (canUse) {
												list.push(["", "", cardName]);
												added[cardName] = true;
											}
										}
										return ui.create.dialog("灵缰：选择要使用的牌", [list, "vcard"]);
									},
									filter(button, player) {
										const evt = get.event().getParent();
										const card = { name: button.link[2], isCard: true };
										if (evt.name === "phaseUse") {
											return player.hasUseTarget(card);
										}
										return evt.filterCard?.(card, player, evt) ?? false;
									},
									check(button) {
										const player = get.player();
										const evt = get.event().getParent();
										const cardName = button.link[2];
										if (evt?.name === "chooseToRespond" || evt?.name === "chooseToUse") {
											if (evt.type === "dying") {
												const attitude = get.attitude(player, evt.dying);
												if (attitude <= 0) return -10;
												return 5 + attitude;
											}
											return 1;
										}
										return player.getUseValue({ name: cardName });
									},
									backup(links, player) {
										const cardName = links[0][2];
										const evt = get.event().getParent();
										const isSave = evt.name !== "phaseUse" && cardName === "tao";
										const isRespondOnly = evt.name === "chooseToRespond";
										return {
											audio: ["ext:无名扩展/audio/skill/lingjiang1", "ext:无名扩展/audio/skill/lingjiang2"],
											filterCard: () => false,
											selectCard: -1,
											selectTarget: isSave || isRespondOnly ? -1 : undefined,
											cardName: cardName,
											viewAs: { name: cardName },
											popname: true,
											async onuse(result, player) {
												const name = lib.skill.qsklingjiang_use_backup.cardName;
												const records = player.getStorage("qsklingjiang_records", []);
												const idx = records.indexOf(name);
												if (idx > -1) {
													records.splice(idx, 1);
													player.setStorage("qsklingjiang_records", records);
													player.markSkill("qsklingjiang");
													if (records.length === 0) {
														const next = game.createEvent("qsklingjiang_recordEmpty", false);
														next.player = player;
														next.setContent("emptyEvent");
													}
												}
											},
											async onrespond(result, player) {
												const name = lib.skill.qsklingjiang_use_backup.cardName;
												const records = player.getStorage("qsklingjiang_records", []);
												const idx = records.indexOf(name);
												if (idx > -1) {
													records.splice(idx, 1);
													player.setStorage("qsklingjiang_records", records);
													player.markSkill("qsklingjiang");
													if (records.length === 0) {
														const next = game.createEvent("qsklingjiang_recordEmpty", false);
														next.player = player;
														next.setContent("emptyEvent");
													}
												}
											},
										};
									},
									prompt(links, player) {
										const cardName = links[0][2];
										if (cardName === "sha") return "选择杀的目标";
										return "选择" + get.translation(cardName) + "的目标";
									},
								},
								ai: {
									order: 12,
									result: {
										player: 1,
										target(player, target) {
											const evt = get.event();
											if (evt.dying && evt.dying === target) return get.attitude(player, target) > 0 ? 5 : -10;
											return 0;
										},
									},
									respondShan: true,
									respondWuxie: true,
									save: true,
									skillTagFilter(player, tag, arg) {
										const records = player.getStorage("qsklingjiang_records", []);
										const nameMap = { respondShan: "shan", respondWuxie: "wuxie", save: "tao" };
										const name = nameMap[tag];
										if (!name) return false;
										if (!records.includes(name)) return false;
										const evt = get.event();
										if (!evt) return false;
										if (evt.filterCard) {
											const card = { name: name, isCard: true };
											if (!evt.filterCard(card, player, evt)) return false;
										}
										if (tag === "save" && !evt.dying) return false;
										return true;
									},
								},
							},
						},
					},
					qsksuohun: {
						usable: 1,
						enable: "phaseUse",
						filter(event, player) {
							const records = player.getStorage("qsklingjiang_records", []);
							if (records.length === 0) return false;
							if (event.type === "phase") {
								if (player.hasUseTarget({ name: "sha" })) return true;
								return lib.inpile_nature.some(nature => player.hasUseTarget({ name: "sha", nature }));
							}
							const card = { name: "sha", isCard: true };
							if (event.filterCard?.(card, player, event)) return true;
							return lib.inpile_nature.some(nature => {
								const natureCard = { name: "sha", nature, isCard: true };
								return event.filterCard?.(natureCard, player, event) ?? false;
							});
						},
						chooseButton: {
							dialog(event, player) {
								const list = [];
								if (event.type === "phase") {
									if (player.hasUseTarget({ name: "sha" })) {
										list.push(["基本", "", "sha"]);
									}
									for (const nature of lib.inpile_nature) {
										if (player.hasUseTarget({ name: "sha", nature })) {
											list.push(["基本", "", "sha", nature]);
										}
									}
								} else {
									const card = { name: "sha", isCard: true };
									if (event.filterCard?.(card, player, event)) {
										list.push(["基本", "", "sha"]);
									}
									for (const nature of lib.inpile_nature) {
										const natureCard = { name: "sha", nature, isCard: true };
										if (event.filterCard?.(natureCard, player, event)) {
											list.push(["基本", "", "sha", nature]);
										}
									}
								}
								return ui.create.dialog("索魂：选择【杀】的类型", [list, "vcard"]);
							},
							filter(button, player) {
								const evt = get.event().getParent();
								const nature = button.link[3];
								if (evt.type === "phase") {
									return nature ? player.hasUseTarget({ name: "sha", nature }) : player.hasUseTarget({ name: "sha" });
								}
								const card = nature ? { name: "sha", nature, isCard: true } : { name: "sha", isCard: true };
								return evt.filterCard?.(card, player, evt) ?? false;
							},
							check(button) {
								const nature = button.link[3];
								if (nature === "fire") return 2.95;
								if (nature === "thunder" || nature === "ice") return 2.92;
								return 2.9;
							},
							backup(links, player) {
								const nature = links[0][3];
								player.addTempSkill("qsksuohun_no_distance");
								player.setStorage("_qsksuohun_no_distance", true);
								return {
									audio: ["ext:无名扩展/audio/skill/suohun1", "ext:无名扩展/audio/skill/suohun2"],
									filterCard: () => false,
									selectCard: -1,
									viewAs: nature ? { name: "sha", nature } : { name: "sha" },
									async onuse(result, player) {
										player.setStorage("qsklingjiang_records", []);
										player.markSkill("qsklingjiang");
										player.setStorage("_qsksuohun_no_distance", false);
										player.removeSkill("qsksuohun_no_distance");
										const next = game.createEvent("qsklingjiang_recordEmpty", false);
										next.player = player;
										next.setContent("emptyEvent");
									},
								};
							},
							prompt(links, player) {
								const nature = links[0][3];
								const shaName = nature ? "【" + get.translation(nature) + "杀】" : "【杀】";
								return "选择" + shaName + "的目标";
							},
						},
						ai: {
							order: 4,
							result: {
								player(player) {
									return 1;
								},
							},
							combo: "qsklingjiang",
						},
						subSkill: {
							no_distance: {
								charlotte: true,
								mod: {
									cardUsable(card, player) {
										if (card.name === "sha" && player.getStorage("_qsksuohun_no_distance", false)) {
											return Infinity;
										}
									},
									targetInRange(card, player, target) {
										if (card.name === "sha" && player.getStorage("_qsksuohun_no_distance", false)) {
											return true;
										}
									},
								},
							},
						},
					},
					mwkzhihuo: {
						audio: ["ext:无名扩展/audio/skill/zhihuo1", "ext:无名扩展/audio/skill/zhihuo2", "ext:无名扩展/audio/skill/zhihuo3"],
						direct: true,
						mod: {
							cardnature(card, player) {
								if (card.name === "sha" && !card.nature) return "fire";
							},
						},
						trigger: { player: "useCardToTargeted" },
						filter(event, player) {
							if (event.player !== player) return false;
							if (!event.card || event.card.name !== "sha") return false;
							if (!event.card.nature || event.card.nature !== "fire") return false;
							if (!event.isFirstTarget) return false;
							return true;
						},
						getPath(player, target) {
							const left = [];
							const right = [];
							let left2 = player;
							let right2 = player;
							while (!(left2 === target && right2 === target)) {
								if (left2 !== target) {
									left2 = left2.getPrevious();
									if (left2.isIn() && left2 !== target) left.push(left2);
								}
								if (right2 !== target) {
									right2 = right2.getNext();
									if (right2.isIn() && right2 !== target) right.push(right2);
								}
							}
							return [left, right];
						},
						async content(event, trigger, player) {
							const target = trigger.targets[0];
							const list = [];
							const otherPlayers = game.filterPlayer(p => p !== player && p.isIn());
							const unlinkedPlayers = otherPlayers.filter(p => !p.isLinked());
							if (unlinkedPlayers.length > 0) {
								list.push(["option2", "令任意名其他角色进入连环状态"]);
							}
							const noFireDebuffEnemies = otherPlayers.filter(p => !p.hasSkill("mwkzhihuo_firedebuff"));
							if (noFireDebuffEnemies.length > 0) {
								list.push(["option3", "令任意名其他角色本回合受到的火焰伤害+1"]);
							}
							const path = lib.skill.mwkzhihuo.getPath(player, target);
							const leftTarget = path[0].length > 0 ? path[0][path[0].length - 1] : null;
							const rightTarget = path[1].length > 0 ? path[1][path[1].length - 1] : null;
							const canAddLeft = leftTarget && leftTarget !== player && lib.filter.targetEnabled2({ name: "sha", nature: "fire" }, player, leftTarget);
							const canAddRight = rightTarget && rightTarget !== player && lib.filter.targetEnabled2({ name: "sha", nature: "fire" }, player, rightTarget);
							if (canAddLeft || canAddRight) {
								list.push(["option4", "令其上家或下家也成为此牌目标"]);
							}
							if (list.length === 0) return;
							const result = await player
								.chooseButton(["是否对" + get.translation(target) + "发动【织火】", "请选择一项效果", [list, "textbutton"]])
								.set("ai", button => {
									const p = get.player();
									const c = button.link[0];
									if (c === "option3") {
										const enemies = game.filterPlayer(t => t !== p && t.isIn() && !t.hasSkill("mwkzhihuo_firedebuff") && get.attitude(p, t) < 0);
										return enemies.length > 0 ? 20 : 1;
									}
									if (c === "option4") {
										const left = get.event().getParent().leftTarget;
										const right = get.event().getParent().rightTarget;
										let eff = 0;
										if (left && lib.filter.targetEnabled2({ name: "sha", nature: "fire" }, p, left)) {
											eff = Math.max(eff, get.effect(left, { name: "sha", nature: "fire" }, p, p));
										}
										if (right && lib.filter.targetEnabled2({ name: "sha", nature: "fire" }, p, right)) {
											eff = Math.max(eff, get.effect(right, { name: "sha", nature: "fire" }, p, p));
										}
										return eff > 0 ? 15 + eff : 1;
									}
									if (c === "option2") {
										const enemies = game.filterPlayer(t => t !== p && t.isIn() && !t.isLinked() && get.attitude(p, t) < 0);
										return enemies.length > 0 ? 10 : 1;
									}
									return 1;
								})
								.forResult();
							if (!result?.links?.length) return;
							const choice = result.links[0];
							player.logSkill("mwkzhihuo");
							if (choice === "option2") {
								const result2 = await player
									.chooseTarget("请选择要进入连环状态的角色", [1, Infinity], (card, p, t) => t.isIn() && !t.isLinked() && t !== p)
									.set("ai", t => {
										const p = get.event().player;
										if (get.attitude(p, t) < 0 && !t.isLinked()) return 10;
										return 0;
									})
									.forResult();
								if (result2?.targets?.length) {
									for (const t of result2.targets) {
										if (!t.isLinked()) await t.link();
									}
								}
							} else if (choice === "option3") {
								const result2 = await player
									.chooseTarget("请选择本回合受到火焰伤害+1的其他角色", [1, Infinity], (card, p, t) => t.isIn() && !t.hasSkill("mwkzhihuo_firedebuff") && t !== p)
									.set("ai", t => {
										const p = get.event().player;
										if (get.attitude(p, t) < 0 && !t.hasSkill("mwkzhihuo_firedebuff")) return 10;
										return 0;
									})
									.forResult();
								if (result2?.targets?.length) {
									for (const t of result2.targets) {
										t.setStorage("_mwkzhihuo_fireround", game.roundNumber);
										t.addTempSkill("mwkzhihuo_firedebuff");
										t.markSkill("mwkzhihuo_firedebuff");
									}
								}
							} else if (choice === "option4") {
								const choices = [];
								if (canAddLeft) choices.push(get.translation(leftTarget));
								if (canAddRight) choices.push(get.translation(rightTarget));
								if (choices.length === 0) return;
								const result2 = await player
									.chooseControl(choices)
									.set("prompt", "请选择要成为此牌目标的角色")
									.set("ai", () => {
										const p = get.player();
										const left = get.event().getParent().leftTarget;
										const right = get.event().getParent().rightTarget;
										if (!left) return get.translation(right);
										if (!right) return get.translation(left);
										const effL = get.effect(left, { name: "sha", nature: "fire" }, p, p);
										const effR = get.effect(right, { name: "sha", nature: "fire" }, p, p);
										return effL >= effR ? get.translation(left) : get.translation(right);
									})
									.set("leftTarget", leftTarget)
									.set("rightTarget", rightTarget)
									.forResult();
								if (result2.control === get.translation(leftTarget) && leftTarget) {
									trigger.targets.push(leftTarget);
								} else if (result2.control === get.translation(rightTarget) && rightTarget) {
									trigger.targets.push(rightTarget);
								}
							}
						},
						subSkill: {
							firedebuff: {
								charlotte: true,
								mark: true,
								trigger: { player: "damageBegin1" },
								forced: true,
								popup: false,
								filter(event, player) {
									if (player.getStorage("_mwkzhihuo_fireround", 0) > 0 && game.roundNumber > player.getStorage("_mwkzhihuo_fireround", 0)) return false;
									return event.hasNature?.("fire") ?? false;
								},
								async content(event, trigger, player) {
									if (player.getStorage("_mwkzhihuo_fireround", 0) > 0 && game.roundNumber > player.getStorage("_mwkzhihuo_fireround", 0)) {
										player.removeSkill("mwkzhihuo_firedebuff");
										player.setStorage("_mwkzhihuo_fireround", 0);
										return;
									}
									trigger.num++;
								},
								mark: true,
								marktext: "\u{1F525}",
								intro: { content: "本回合受到火焰伤害+1" },
								ai: {
									effect: {
										target(card, player, target) {
											if (!get.tag(card, "damage")) return;
											if (card.nature === "fire" || get.nature?.(card, player) === "fire") return 2;
										},
									},
								},
							},
						},
					},
					mwkfenyao: {
						audio: ["ext:无名扩展/audio/skill/fenyao1", "ext:无名扩展/audio/skill/fenyao2", "ext:无名扩展/audio/skill/fenyao3"],
						trigger: { global: "phaseBegin" },
						direct: true,
						filter(event, player) {
							if (event.player === player) return false;
							return true;
						},
						async content(event, trigger, player) {
							const target = trigger.player;
							const result = await player
								.chooseCard("he", "是否发动【焚曜】？选择一张【杀】对" + get.translation(target) + "使用", card => {
									return card.name === "sha" && lib.filter.targetEnabled2(card, player, target);
								})
								.set("ai", card => {
									const p = get.player();
									if (get.attitude(p, target) < 0) return get.effect(target, { name: "sha" }, p, p);
									return 0;
								})
								.set("target", target)
								.forResult();
							if (result?.bool && result.cards?.length) {
								const card = result.cards[0];
								player.logSkill("mwkfenyao", target);
								await player.useCard(card, target, false);
							}
						},
						ai: {
							expose: 0.2,
						},
					},
					mwkfantian: {
						trigger: { global: "damage" },
						direct: true,
						popup: false,
						filter(event, player) {
							return event.num > 0;
						},
						async content(event, trigger, player) {
							let gain = (trigger.num ?? 1) + 1;
							player.addMark("mwkfantian", gain, true);
							const current = player.getStorage("mwkfantian", 0);
							if (current > 20) {
								player.setStorage("mwkfantian", 20);
								player.markSkill("mwkfantian");
							}
							await player.draw();
						},
						mark: true,
						marktext: "焚",
						intro: {
							name: "焚",
							markcount(storage, player) {
								return player.getStorage("mwkfantian", 0);
							},
							mark(dialog, storage, player) {
								const count = player.getStorage("mwkfantian", 0);
								dialog.addText("焚标记：" + count + "枚");
							},
						},
						group: ["mwkfantian_use"],
						subSkill: {
							use: {
								audio: ["ext:无名扩展/audio/skill/fantian1", "ext:无名扩展/audio/skill/fantian2", "ext:无名扩展/audio/skill/fantian3"],
								enable: "phaseUse",
								skillAnimation: true,
								filter(event, player) {
									if (player.getStorage("mwkfantian", 0) < 10) return false;
									if (player.getStorage("mwkfantian_round", 0) === game.roundNumber) return false;
									return true;
								},
								filterTarget(card, player, target) {
									return target !== player;
								},
								selectTarget: 1,
								prompt(event, player) {
									const count = player.getStorage("mwkfantian", 0);
									const dmg = Math.floor(count / 2);
									return "发动【燔天】造成" + dmg + "点火焰伤害";
								},
								async content(event, trigger, player) {
									const count = player.getStorage("mwkfantian", 0);
									const dmg = Math.floor(count / 2);
									player.logSkill("mwkfantian");
									player.setStorage("mwkfantian", 0);
									player.unmarkSkill("mwkfantian");
									player.setStorage("mwkfantian_round", game.roundNumber);
									if (event.target?.isAlive()) {
										await event.target.damage(dmg, "fire", player);
									}
								},
								ai: {
									order: 7,
									result: {
										target(player, target) {
											const count = player.getStorage("mwkfantian", 0);
											const dmg = Math.floor(count / 2);
											return -dmg * 2;
										},
									},
								},
							},
						},
						onremove(player) {
							player.setStorage("mwkfantian", 0);
							player.unmarkSkill("mwkfantian");
						},
					},
					xnnjuelie: {
						audio: ["ext:无名扩展/audio/skill/juelie1", "ext:无名扩展/audio/skill/juelie2", "ext:无名扩展/audio/skill/juelie3"],
						enable: "phaseUse",
						usable: 3,
						async content(event, trigger, player) {
							const card = get.cardPile(c => true, false, "random");
							if (!card) return;
							await player.showCards([card], get.translation(player) + "随机亮出了牌堆内的一张牌", true).set("clearArena", false);
							const cardType = get.type(card);
							const cardName = card.name;
							const damageTrickCards = ["shandian", "huoshan"];
							const damageTag = get.tag(card, "damage");
							const isTrickCard = cardType === "trick" || cardType === "delay";
							const isDamageCard = isTrickCard && ((damageTag && damageTag > 0.5) || damageTrickCards.includes(cardName));
							const isShuiKanCard = cardName === "tao" || cardName === "jiu" || cardName === "shan";
							let prompt = "";
							let filterFn = (card, p, t) => true;
							let aiFn = t => 0;
							if (cardType === "equip") {
								prompt = "山艮：选择被【杀】的目标";
								aiFn = t => {
									const att = get.attitude(player, t);
									if (att > 0) {
										if (t.hasSkillTag("maixie") || t.hasSkillTag("maixie_hp")) return 5;
										return -10;
									}
									return 10 - att;
								};
							} else if (isShuiKanCard) {
								prompt = "水坎：选择回复体力的角色";
								filterFn = (card, p, t) => t.getHp() < t.maxHp;
								aiFn = t => {
									const att = get.attitude(player, t);
									if (att <= 0) return 0;
									return att + 5;
								};
							} else if (cardName === "sha") {
								prompt = "火离：选择受到无来源火焰伤害的角色";
								aiFn = t => {
									const att = get.attitude(player, t);
									if (att > 0) {
										if (t.hasSkillTag("maixie") || t.hasSkillTag("maixie_hp")) return 5;
										return -10;
									}
									return 10 - att;
								};
							} else if (isDamageCard) {
								prompt = "冰华：选择弃置其牌的角色";
								aiFn = t => {
									const att = get.attitude(player, t);
									if (att > 0) {
										if (t.hasSkillTag("maixie") || t.hasSkillTag("maixie_hp")) return 3;
										return -10;
									}
									return 8 - att;
								};
							} else {
								prompt = "雷震：选择摸牌的角色";
								aiFn = t => {
									const att = get.attitude(player, t);
									if (att <= 0) return 0;
									return att + 5;
								};
							}
							const result = await player
								.chooseTarget({
									prompt,
									select: [1, 1],
									filterTarget: filterFn,
									ai: aiFn,
								})
								.forResult();
							if (!result?.targets?.length) return;
							const firstTarget = result.targets[0];
							if (cardType === "equip") {
								const shaTarget = firstTarget;
								const allPlayers = game.filterPlayer(p => p !== shaTarget && p.isIn());
								if (allPlayers.length > 0) {
									const shaUser = allPlayers.randomGet();
									await shaUser.useCard({ name: "sha", isVirtual: true }, shaTarget, "noai");
								}
							} else if (isShuiKanCard) {
								await firstTarget.recover(1);
							} else if (cardName === "sha") {
								await firstTarget.damage(1, "fire", "nosource");
							} else if (isTrickCard) {
								if (isDamageCard) {
									const heCards = firstTarget.getCards("he");
									const discardCount = Math.min(heCards.length, Math.floor(Math.random() * 3) + 1);
									const cards = heCards.slice(0, discardCount);
									if (cards.length > 0) {
										await firstTarget.discard(cards, "nosource");
									}
								} else {
									await firstTarget.draw(2);
								}
							}
						},
						ai: {
							order: 10,
							result: {
								player(player) {
									return 1;
								},
							},
						},
					},
					xnnduancui: {
						audio: ["ext:无名扩展/audio/skill/duancui1", "ext:无名扩展/audio/skill/duancui2"],
						enable: "phaseUse",
						usable: 3,
						async content(event, trigger, player) {
							const equipmentNames = ["wslydd", "jslyzh", "fyqy", "yfxg", "cy", "cyzx", "atpf", "sgb", "hasgb", "xjcy", "lybsq", "glm", "atyl"];
							const weights = {};
							for (let i = 0; i < equipmentNames.length; i++) {
								weights[equipmentNames[i]] = 1;
							}
							let clickCount = 0;
							const cards = [];
							for (let i = 0; i < equipmentNames.length; i++) {
								const eqName = equipmentNames[i];
								let cardInfo = lib.card[eqName];
								let actualName = eqName;
								if (!cardInfo && eqName === "atpf") {
									cardInfo = lib.card["atpf1"];
									actualName = "atpf1";
								}
								if (!cardInfo) continue;
								const suit = cardInfo.suit ?? "diamond";
								const number = cardInfo.number ?? 13;
								try {
									const card = game.createCard(actualName, suit, number);
									if (card) cards.push(card);
								} catch (e) {
									game.log("创建装备牌失败:", eqName);
								}
							}
							cards.sort((a, b) => {
								const nameA = get.translation(a.name);
								const nameB = get.translation(b.name);
								return nameA.localeCompare(nameB, "zh-CN");
							});
							while (clickCount < 3) {
								const result = await player
									.chooseButton(["锻淬：点击装备牌增加权重（剩余" + (3 - clickCount) + "次）", cards])
									.set("ai", button => Math.random())
									.forResult();
								if (!result?.links?.length) break;
								const clickedCard = result.links[0];
								let clickedName = clickedCard.name;
								if (clickedName.startsWith("atpf")) {
									clickedName = "atpf";
								}
								weights[clickedName] = (weights[clickedName] ?? 1) + 1.21 * equipmentNames.length;
								clickCount++;
								game.playAudio("..", "extension", "无名扩展", "audio/skill/duancui" + (Math.floor(Math.random() * 2) + 1));
							}
							const selectedEquips = [];
							const tempEquipList = equipmentNames.slice(0);
							for (let k = 0; k < 3 && tempEquipList.length > 0; k++) {
								let totalWeight = 0;
								for (let m = 0; m < tempEquipList.length; m++) {
									const loopName = tempEquipList[m];
									const w = weights[loopName] ?? 1;
									totalWeight += w;
								}
								if (totalWeight === 0) break;
								let randomWeight = Math.random() * totalWeight;
								let equipName = null;
								for (let m = 0; m < tempEquipList.length; m++) {
									const loopName = tempEquipList[m];
									const w = weights[loopName] ?? 1;
									randomWeight -= w;
									if (randomWeight <= 0) {
										equipName = loopName;
										break;
									}
								}
								if (!equipName) break;
								tempEquipList.splice(tempEquipList.indexOf(equipName), 1);
								let actualEquipName = equipName;
								if (equipName === "atpf") {
									const atpfNumber = Math.floor(Math.random() * 6) + 1;
									actualEquipName = "atpf" + atpfNumber;
								}
								let equipCard = get.cardPile(c => {
									if (actualEquipName.startsWith("atpf")) {
										return c.name?.startsWith("atpf");
									}
									return c.name === actualEquipName;
								}, false);
								if (!equipCard) {
									equipCard = get.discardPile(c => {
										if (actualEquipName.startsWith("atpf")) {
											return c.name?.startsWith("atpf");
										}
										return c.name === actualEquipName;
									});
								}
								if (!equipCard) {
									const cardInfo = lib.card[actualEquipName];
									const suit = cardInfo?.suit ?? "diamond";
									const number = cardInfo?.number ?? 13;
									equipCard = game.createCard(actualEquipName, suit, number);
								}
								if (equipCard) {
									selectedEquips.push(equipCard);
								}
							}
							if (selectedEquips.length === 0) return;
							const result2 = await player.chooseButton(["锻淬：选择一张装备牌", selectedEquips], true).forResult();
							if (!result2?.links?.length) return;
							const equipCard = result2.links[0];
							const result3 = await player
								.chooseTarget({
									prompt: "锻淬：选择一名角色装备【" + get.translation(equipCard) + "】",
									select: [1, 1],
									filterTarget: (card, p, t) => t.canEquip(equipCard, true),
									forced: true,
									ai: t => {
										const att = get.attitude(player, t);
										if (att <= 0) return -10;
										const equipNameList = ["wslydd", "jslyzh", "fyqy", "yfxg", "cy"];
										const hasEquip = t.countCards("e") > 0;
										const hasOwnEquip = t.hasCard(card => equipNameList.includes(card.name), "e");
										const currentEquipValue = t.getCards("e").reduce((sum, card) => sum + get.equipValue(card, t), 0);
										const baseValue = att > 3 ? 15 : 10;
										if (!hasEquip) return baseValue;
										if (!hasOwnEquip) return baseValue - 3 - currentEquipValue * 0.3;
										return baseValue - 6 - currentEquipValue * 0.2;
									},
								})
								.forResult();
							if (!result3?.targets?.length) return;
							const target = result3.targets[0];
							await target.gain(equipCard, "gain2");
							await target.chooseUseTarget(equipCard, true);
						},
						ai: {
							order: 11,
							result: {
								player(player) {
									return 1;
								},
							},
						},
					},
					jtjeheiwu: {
						audio: ["ext:无名扩展/audio/skill/jtje"],
						trigger: { global: "phaseEnd" },
						forced: true,
						filter(event, player) {
							if (event.player === player) return false;
							if (!event.player.isIn()) return false;
							return true;
						},
						async content(event, trigger, player) {
							game.playSkillBgm("guaishou");
							const target = trigger.player;
							const num1 = player.getStorage("jtjeheiwu_num1", 1);
							const num2 = player.getStorage("jtjeheiwu_num2", 1);
							const choices = [];
							if (target.countCards("he") >= num1) {
								choices.push("弃置" + num1 + "张牌");
							}
							choices.push("失去" + num2 + "点体力");
							const result = await target
								.chooseControl(choices)
								.set("prompt", "黑雾：请选择一项")
								.set("ai", () => {
									const p = get.player();
									const n1 = get.event().num1;
									const n2 = get.event().num2;
									const opts = get.event().choices;
									const canDiscard = opts.includes("弃置" + n1 + "张牌");
									const loseHpOption = "失去" + n2 + "点体力";
									if (p.hp <= n2 && canDiscard) {
										return "弃置" + n1 + "张牌";
									}
									if (!canDiscard) {
										return loseHpOption;
									}
									if (p.hp - n2 > 2) {
										return loseHpOption;
									}
									return "弃置" + n1 + "张牌";
								})
								.set("num1", num1)
								.set("num2", num2)
								.set("choices", choices)
								.forResult();
							if (!result?.control) return;
							if (result.control === "弃置" + num1 + "张牌") {
								await target.chooseToDiscard(num1, "he", true);
								player.setStorage("jtjeheiwu_num1", num1 + 1);
							} else if (result.control === "失去" + num2 + "点体力") {
								await target.loseHp(num2);
								player.setStorage("jtjeheiwu_num2", num2 + 1);
							}
						},
					},
					jtjeluoke: {
						audio: ["ext:无名扩展/audio/skill/jtje"],
						trigger: { player: "damageBegin3" },
						forced: true,
						filter(event, player) {
							if (!event.card) return false;
							const color = get.color(event.card);
							if (color !== "black") return false;
							return get.tag(event.card, "damage");
						},
						async content(event, trigger, player) {
							game.playSkillBgm("guaishou");
							trigger.cancel();
						},
						ai: {
							effect: {
								target(card, player, target) {
									if (get.color(card) === "black" && get.tag(card, "damage")) return 0;
								},
							},
						},
					},
					jtjeguanchuan: {
						mark: true,
						audio: ["ext:无名扩展/audio/skill/jtje"],
						enable: "phaseUse",
						usable: 1,
						skillAnimation: true,
						init(player) {
							if (!player.getStorage("jtjeguanchuan_used", null)) player.setStorage("jtjeguanchuan_used", []);
						},
						filter(event, player) {
							return game.hasPlayer(target => target !== player && target.hp < Math.ceil(target.maxHp / 2) && !player.getStorage("jtjeguanchuan_used", []).includes(target));
						},
						filterTarget(card, player, target) {
							if (target === player) return false;
							if (target.hp >= Math.ceil(target.maxHp / 2)) return false;
							if (player.getStorage("jtjeguanchuan_used", []).includes(target)) return false;
							return true;
						},
						check(card, player) {
							const targets = game.filterPlayer(target => target !== player && target.hp < Math.ceil(target.maxHp / 2) && !player.getStorage("jtjeguanchuan_used", []).includes(target));
							if (targets.length === 0) return 0;
							let max = 0;
							for (const t of targets) {
								const att = get.attitude(player, t);
								if (att < 0) {
									const val = Math.abs(att) * t.hp;
									if (val > max) max = val;
								}
							}
							return max;
						},
						async content(event, trigger, player) {
							game.playSkillBgm("guaishou");
							const target = event.targets[0];
							const hp = target.hp;
							player.markAuto("jtjeguanchuan_used", [target]);
							await target.loseHp(hp);
						},
						ai: {
							order: 10,
							result: {
								target(player, target) {
									if (target.hp >= Math.ceil(target.maxHp / 2)) return 0;
									return -target.hp;
								},
							},
						},
						marktext: "石",
						intro: {
							name: "贯穿",
							content(storage, player) {
								const used = player.getStorage("jtjeguanchuan_used", []);
								if (!used.length) return "此技能未发动过";
								return "已对" + used.map(target => get.translation(target)).join("、") + "发动过此技能";
							},
						},
					},
					ignzshenji: {
						audio: ["ext:无名扩展/audio/skill/ignz1", "ext:无名扩展/audio/skill/ignz2", "ext:无名扩展/audio/skill/ignz3", "ext:无名扩展/audio/skill/ignz4", "ext:无名扩展/audio/skill/ignz5", "ext:无名扩展/audio/skill/ignz6", "ext:无名扩展/audio/skill/ignz7", "ext:无名扩展/audio/skill/ignz8"],
						enable: ["chooseToUse", "chooseToRespond"],
						usable: 1,
						forced: true,
						locked: false,
						autoSort(cards, num) {
							if (!cards || cards.length < num) return cards.slice(0, num);
							const result = [];
							const used = new Set();
							const backtrack = () => {
								if (result.length === num) {
									return true;
								}
								for (let i = 0; i < cards.length; i++) {
									if (used.has(i)) continue;
									const card = cards[i];
									if (result.length > 0) {
										const lastCard = result[result.length - 1];
										if (get.type(card) === get.type(lastCard) || get.suit(card) === get.suit(lastCard)) {
											continue;
										}
									}
									result.push(card);
									used.add(i);
									if (backtrack()) {
										return true;
									}
									result.pop();
									used.delete(i);
								}
								return false;
							};
							if (backtrack()) {
								return result;
							}
							return cards.slice(0, num);
						},
						hiddenCard(player, name) {
							const info = get.info({ name });
							if (info && info.type === "delay") return false;
							if (info && info.type === "equip") return false;
							return true;
						},
						chooseButton: {
							dialog(event, player) {
								const list = get.inpileVCardList(info => {
									if (info[0] === "equip") return false;
									const name = info[2];
									const info2 = get.info({ name });
									if (info2 && info2.type === "delay") return false;
									if (event.name === "phaseUse") {
										return player.hasUseTarget({ name: name, nature: info[3] });
									}
									return true;
								});
								return ui.create.dialog("神计：选择要使用的牌", [list, "vcard"]);
							},
							filter(button, player) {
								const name = button.link[2];
								const info = get.info({ name });
								if (info && info.type === "delay") return false;
								if (info && info.type === "equip") return false;
								const evt = _status.event.getParent();
								if (evt && evt.filterCard) {
									return evt.filterCard(get.autoViewAs({ name: name, nature: button.link[3] }, "unsure"), player, evt);
								}
								return player.hasUseTarget({ name: name, nature: button.link[3] });
							},
							check(button) {
								const player = get.player();
								const name = button.link[2];
								const nature = button.link[3];
								const evt = _status.event.getParent();
								if (evt?.type === "dying" && evt.dying) {
									const attitude = get.attitude(player, evt.dying);
									if (attitude <= 0) return -10;
									return 5 + player.getUseValue({ name: name, nature: nature });
								}
								if (evt && evt.name !== "phaseUse" && evt.filterCard) {
									const card = get.autoViewAs({ name: name, nature: nature }, "unsure");
									if (evt.filterCard(card, player, evt)) {
										return 5 + player.getUseValue({ name: name, nature: nature });
									}
								}
								return player.getUseValue({ name: name, nature: nature });
							},
							backup(links, player) {
								const name = links[0][2];
								const nature = links[0][3];
								return {
									filterCard: () => false,
									selectCard: -1,
									viewAs: { name: name, nature: nature, isCard: true },
									log: false,
									async precontent(event, trigger, player) {
										player.logSkill("ignzshenji");
										const countUse = () => {
											const stat = player.getStat("skill");
											stat.ignzshenji = (stat.ignzshenji || 0) + 1;
										};
										const cardName = event.result.card.name;
										const cardNature = event.result.card.nature;
										const x = player.getStorage("ignzshenji_x", 1);
										let drawNum = 1;
										if (x > 1) {
											const list = [];
											for (let i = 1; i <= x; i++) {
												list.push(i.toString());
											}
											const result2 = await player
												.chooseControl(list)
												.set("prompt", "神计：选择要摸的牌数")
												.set("ai", () => {
													return list[list.length - 1];
												})
												.forResult();
											if (!result2?.control) {
												event.result.bool = false;
												return;
											}
											drawNum = parseInt(result2.control) || 1;
										}
										await player.draw(drawNum);
										if (drawNum === x) {
											player.setStorage("ignzshenji_x", x + 1);
										} else {
											player.setStorage("ignzshenji_x", Math.max(1, x - 1));
										}
										const allCards = player.getCards("h");
										let showCards = [];
										if (!event.isMine()) {
											showCards = lib.skill.ignzshenji.autoSort(allCards, drawNum);
										} else {
											const autoResult = await player
												.chooseControl(["手动选牌", "一键选牌"])
												.set("prompt", "神计：选择选牌方式")
												.set("ai", () => "一键选牌")
												.forResult();
											if (autoResult.control === "一键选牌") {
												showCards = lib.skill.ignzshenji.autoSort(allCards, drawNum);
												game.log(player, "使用一键选牌");
											} else {
												const result3 = await player
													.chooseButton(["神计：排序展示手牌（按顺序展示）", allCards], true, drawNum)
													.set("ai", button => {
														const cards = get.event().dialog.buttons.map(b => b.link);
														const selected = get.event().selected || [];
														if (selected.length >= drawNum) return 0;
														const card = button.link;
														for (const prev of selected) {
															if (get.type(card) === get.type(prev) || get.suit(card) === get.suit(prev)) {
																return -1;
															}
														}
														return 1;
													})
													.forResult();
												if (!result3?.links?.length) {
													game.log(player, "神计展示失败，弃置" + drawNum + "张牌");
													await player.chooseToDiscard("he", drawNum, true);
													countUse();
													event.result.bool = false;
													return;
												}
												showCards = result3.links;
											}
										}
										await player.showCards(showCards, "神计：展示手牌");
										let success = true;
										for (let i = 0; i < showCards.length - 1; i++) {
											const card = showCards[i];
											const nextCard = showCards[i + 1];
											if (get.type(card) === get.type(nextCard) || get.suit(card) === get.suit(nextCard)) {
												success = false;
												break;
											}
										}
										if (!success) {
											await player.chooseToDiscard("he", drawNum, true);
											countUse();
											event.cancel();
											event.getParent().goto(0);
											return;
										}
									},
								};
							},
							prompt(links, player) {
								const name = links[0][2];
								return "神计：选择要使用的牌";
							},
						},
						ai: {
							order: 10,
							result: {
								player(player) {
									return 1;
								},
								target(player, target, card) {
									const evt = _status.event;
									if (evt.dying && evt.dying === target) {
										return get.attitude(player, target) > 0 ? 5 : -10;
									}
									return 0;
								},
							},
							respondSha: true,
							respondShan: true,
							respondWuxie: true,
							save: true,
							skillTagFilter(player, tag) {
								return true;
							},
						},
					},
					dnshuijing: {
						derivation: ["dnshanliang", "dnqiji", "dnqiangzhuang"],
						trigger: { global: "gameStart" },
						forced: true,
						locked: false,
						async content(event, trigger, player) {
							await player.addSkills("dnshanliang");
						},
						group: ["dnshuijing_addSkill", "dnshuijing_switch"],
						subSkill: {
							addSkill: {
								forced: true,
								trigger: { global: "changeSkillsAfter" },
								filter(event, player) {
									if (event.addSkill.includes("dnshuijing")) {
										return !event.player.hasSkill("dnqiji") && !event.player.hasSkill("dnqiangzhuang");
									}
								},
								async content(event, trigger, player) {
									await player.addSkills("dnshanliang");
								},
							},
							switch: {
								audio: ["ext:无名扩展/audio/skill/dnsj"],
								enable: "phaseUse",
								filter(event, player) {
									const stat = player.getStat("skill");
									const usedCount = stat.dnshuijing_switch ?? 0;
									if (usedCount >= 1) return false;
									return player.hasSkill("dnshanliang") || player.hasSkill("dnqiji") || player.hasSkill("dnqiangzhuang");
								},
								async content(event, trigger, player) {
									const choices = [];
									if (player.hasSkill("dnshanliang")) {
										choices.push("奇迹", "强壮");
									}
									if (player.hasSkill("dnqiji") || player.hasSkill("dnqiangzhuang")) {
										choices.push("闪亮");
									}
									if (choices.length === 0) return;
									const result = await player
										.chooseControl(choices)
										.set("prompt", "选择要切换的形态")
										.set("choices", choices)
										.set("ai", () => {
											const player = get.player();
											const choices = get.event().choices;
											if (player.hasSkill("dnqiangzhuang")) {
												return "闪亮";
											}
											if (player.hasSkill("dnshanliang")) {
												const stat = player.getStat("skill");
												const usedShan = stat.dnshanliang ?? 0;
												const trickCount = player.countCards("h", card => {
													return get.type(card) === "trick" && !get.tag(card, "delay");
												});
												if (usedShan >= 2 && trickCount >= 2) {
													return "强壮";
												}
												if (Math.random() < 0.3) {
													return "奇迹";
												}
												const hasDamage = player.hasCard(card => get.tag(card, "damage"), "h");
												if (hasDamage) return "强壮";
												return choices.randomGet();
											}
											if (player.hasSkill("dnqiji")) {
												if (Math.random() < 0.3) {
													return "闪亮";
												}
												const hasDamage = player.hasCard(card => get.tag(card, "damage"), "h");
												if (!hasDamage) {
													return "闪亮";
												}
												return choices.randomGet();
											}
											return choices.randomGet();
										})
										.forResult();
									if (result.control === "奇迹") {
										if (player.hasSkill("dnshanliang")) await player.removeSkills("dnshanliang");
										if (player.hasSkill("dnqiangzhuang")) await player.removeSkills("dnqiangzhuang");
										await player.addSkills("dnqiji");
										player.changeSkin("dnshuijing", "戴拿-奇迹");
										game.log(player, "切换为【奇迹】形态");
									} else if (result.control === "强壮") {
										if (player.hasSkill("dnshanliang")) await player.removeSkills("dnshanliang");
										if (player.hasSkill("dnqiji")) await player.removeSkills("dnqiji");
										await player.addSkills("dnqiangzhuang");
										player.changeSkin("dnshuijing", "戴拿-强壮");
										game.log(player, "切换为【强壮】形态");
									} else if (result.control === "闪亮") {
										if (player.hasSkill("dnqiji")) await player.removeSkills("dnqiji");
										if (player.hasSkill("dnqiangzhuang")) await player.removeSkills("dnqiangzhuang");
										await player.addSkills("dnshanliang");
										player.changeSkin("dnshuijing", "戴拿-闪亮");
										game.log(player, "切换为【闪亮】形态");
									}
								},
								ai: {
									order: 8,
									result: {
										player(player) {
											if (player.hasSkill("dnshanliang")) {
												const trickCount = player.countCards("h", card => {
													return get.type(card) === "trick" && !get.tag(card, "delay");
												});
												if (trickCount >= 2) return 10;
												else if (Math.random() < 0.66) return 8;
												return 0;
											}
											if (player.hasSkill("dnqiangzhuang")) {
												const trickCount = player.countCards("h", card => {
													return get.type(card) === "trick" && !get.tag(card, "delay");
												});
												if (trickCount < 2) return 10;
												return 0;
											}
											if (player.hasSkill("dnqiji")) {
												if (Math.random() < 0.33) return 10;
												return 0;
											}
											return 0;
										},
									},
								},
							},
						},
					},
					dnshanliang: {
						enable: "chooseToUse",
						usable: 1,
						filter(event, player) {
							return player.countCards("he") > 0;
						},
						hiddenCard(player, name) {
							const type = get.type(name);
							if (type === "trick") {
								const info = lib.card[name];
								if (info && !info.delay) return true;
							}
							if (type === "basic") return true;
							return false;
						},
						chooseButton: {
							dialog(event, player) {
								const list = [];
								const cardNames = lib.inpile;
								for (const name of cardNames) {
									const type = get.type(name);
									if (type === "trick") {
										const info = lib.card[name];
										if (info && !info.delay) list.push(["锦囊", "", name]);
									}
									if (type === "basic") {
										list.push(["基本", "", name]);
									}
								}
								return ui.create.dialog("闪亮：选择一张牌", [list, "vcard"]);
							},
							filter(button, player) {
								const name = button.link[2];
								const evt = _status.event.getParent();
								if (evt && evt.filterCard) {
									const vcard = get.autoViewAs({ name: name }, "unsure");
									return evt.filterCard(vcard, player, evt);
								}
								return lib.filter.filterCard({ name: name }, player, evt);
							},
							check(button) {
								const player = _status.event.player;
								const name = button.link[2];
								if (name === "wuxie") return 20;
								return player.getUseValue({ name: name });
							},
							backup(links, player) {
								const name = links[0][2];
								const type = get.type(name);
								return {
									filterCard(card, player) {
										const cardType = get.type(card);
										if (type === "trick") {
											return cardType === "basic";
										}
										if (type === "basic") {
											return cardType !== "basic";
										}
										return false;
									},
									position: "he",
									viewAs: { name: name },
									log: false,
									check(card) {
										return 10 - get.value(card);
									},
									async onuse(result, player) {
										player.logSkill("dnshanliang");
										await player.draw(2);
										game.playSkillBgm("dn");
									},
								};
							},
							prompt(links, player) {
								return "请选择使用「" + get.translation(links[0][2]) + "」的目标";
							},
						},
						ai: {
							order: 11,
							result: {
								player(player) {
									return 1;
								},
							},
							respondSha: true,
							respondShan: true,
							respondTao: true,
							respondJiu: true,
							respondWuxie: true,
							skillTagFilter(player, tag, arg) {
								if (tag === "respondWuxie") {
									const hasBasic = player.hasCards("he", card => get.type(card) === "basic");
									if (!hasBasic) return false;
									const evt = _status.event;
									if (evt && evt.filterCard) {
										const vcard = get.autoViewAs({ name: "wuxie" }, "unsure");
										return evt.filterCard(vcard, player, evt);
									}
									return true;
								}
								if (tag === "respondSha" || tag === "respondShan" || tag === "respondTao" || tag === "respondJiu") {
									const hasNonBasic = player.hasCards("he", card => get.type(card) !== "basic");
									if (!hasNonBasic) return false;
									const evt = _status.event;
									if (evt && evt.filterCard) {
										const name = tag.replace("respond", "").toLowerCase();
										const vcard = get.autoViewAs({ name: name }, "unsure");
										return evt.filterCard(vcard, player, evt);
									}
									return true;
								}
								return false;
							},
						},
					},
					dnqiji: {
						trigger: { global: "useCardBegin" },
						filter(event, player) {
							if (event.player === player) return false;
							if (!event.card || !event.targets || !event.targets.includes(player)) return false;
							const cardType = get.type2(event.card);
							return cardType === "basic" || cardType === "trick" || cardType === "equip";
						},
						async cost(event, trigger, player) {
							const card = trigger.card;
							const cardType = get.type2(card);
							if (cardType === "equip") {
								event.result = {
									bool: true,
									cost_data: { guess: "equip" },
								};
								return;
							}
							const choices = ["基本牌", "锦囊牌", "cancel2"];
							const result = await player
								.chooseControl(choices)
								.set("prompt", "是否发动【奇迹】")
								.set("ai", () => {
									if (Math.random() > 0.5) return "基本牌";
									if (Math.random() <= 0.5) return "锦囊牌";
								})
								.set("card", card)
								.forResult();
							if (result.control === "cancel2") {
								event.result = { bool: false };
								return;
							}
							event.result = {
								bool: true,
								cost_data: { guess: result.control },
							};
						},
						async content(event, trigger, player) {
							game.playSkillBgm("dn");
							const card = trigger.card;
							const cardType = get.type2(card);
							const guess = event.cost_data?.guess;
							let correct = false;
							if (guess === "equip" && cardType === "equip") correct = true;
							if (guess === "基本牌" && cardType === "basic") correct = true;
							if (guess === "锦囊牌" && cardType === "trick") correct = true;
							if (correct) {
								trigger.cancel();
								game.log(player, "猜对了", get.translation(card), "的类型");
								const cardName = get.translation(card);
								const canDiscard4 = player.countCards("he") >= 4;
								const choices = ["使用" + cardName + "", "回复体力并摸牌"];
								if (canDiscard4) {
									choices.push("移除角色");
								}
								const result2 = await player
									.chooseControl(choices)
									.set("prompt", "请选择一项执行")
									.set("ai", () => {
										const player = get.player();
										const canDiscard4 = get.event().canDiscard4;
										const cardName = get.event().cardName;
										const rand = Math.random();
										if (canDiscard4 && rand < 0.15) return "移除角色";
										if (rand < 0.85) return "回复体力并摸牌";
										return "使用" + cardName + "";
									})
									.set("canDiscard4", canDiscard4)
									.set("cardName", cardName)
									.forResult();
								let actualCards = [];
								if (trigger.cards?.length > 0) {
									actualCards = trigger.cards.filter(c => c && c.isCard !== false);
								}
								if (actualCards.length > 0) {
									await trigger.player.lose(actualCards, ui.ordering).set("getlx", false);
								}
								if (result2.control === "使用" + cardName + "") {
									const actualCard = actualCards.length > 0 ? actualCards[0] : card;
									const cardObj = card.name;
									const selectTarget = lib.filter.selectTarget({ name: cardObj }, player, _status.event);
									player.addTempSkill("dnqiji_directHit", "useCardAfter");
									if (selectTarget && selectTarget[0] > 0) {
										const targetResult = await player
											.chooseTarget("奇迹：选择" + cardName + "的目标", (card, player, target) => {
												return lib.filter.filterTarget({ name: cardObj }, player, target);
											})
											.set("ai", target => {
												return get.effect(target, { name: cardObj }, player, player);
											})
											.set("forced", true)
											.forResult();
										if (targetResult.targets?.length > 0) {
											await player.useCard(actualCard, targetResult.targets);
										}
									} else {
										const autoTargets = game.filterPlayer(target => {
											return lib.filter.filterTarget({ name: cardObj }, player, target);
										});
										if (autoTargets.length > 0) {
											await player.useCard(actualCard, autoTargets);
										} else {
											await player.useCard(actualCard);
										}
									}
								} else if (result2.control === "回复体力并摸牌") {
									await player.recover(1);
									await player.draw(2);
								} else if (result2.control === "移除角色") {
									const discardResult = await player
										.chooseCard({
											position: "he",
											selectCard: 4,
											forced: true,
											prompt: "奇迹：请弃置四张牌",
											filterCard(card) {
												return true;
											},
										})
										.set("ai", card => {
											return -get.value(card);
										})
										.forResult();
									if (discardResult.bool && discardResult.cards?.length >= 4) {
										await player.discard(discardResult.cards);
										const targetResult = await player
											.chooseTarget("奇迹：选择一名其他角色移除游戏", (card, player, target) => {
												return target !== player && target.isIn();
											})
											.set("ai", target => {
												return -get.attitude(player, target);
											})
											.set("forced", true)
											.forResult();
										if (targetResult.targets?.length > 0) {
											const target = targetResult.targets[0];
											const allCards = target.getCards("hej");
											if (allCards.length > 0) {
												target.$give(allCards, target, false);
											}
											await target.rest({ type: "round", count: 1 });
										}
									}
								}
							} else {
								game.log(player, "猜错了", get.translation(card), "的类型");
							}
						},
						ai: {
							effect: {
								target(card, player, target) {
									return [0.5, 0.5];
								},
							},
						},
						subSkill: {
							directHit: {
								charlotte: true,
								trigger: { player: "useCard0" },
								forced: true,
								popup: false,
								firstDo: true,
								async content(event, trigger, player) {
									trigger.directHit.addArray(game.players);
								},
							},
						},
					},
					dnqiangzhuang: {
						group: ["dnqiangzhuang_viewAs", "dnqiangzhuang_unrespondable", "dnqiangzhuang_gainTrick"],
						locked: true,
						subSkill: {
							viewAs: {
								mod: {
									cardname(card, player) {
										if (card.name === "juedou") return;
										const info = lib.card[card.name];
										if (info && (info.type === "trick" || info.subtype === "trick") && !info.delay) {
											if (get.position(card) === "h") return "juedou";
										}
									},
								},
							},
							unrespondable: {
								trigger: { player: "useCardToPlayered" },
								forced: true,
								async content(event, trigger, player) {
									game.playSkillBgm("dn");
									for (const target of trigger.targets) {
										trigger.directHit.add(target);
									}
								},
							},
							gainTrick: {
								trigger: { player: "useCardAfter" },
								forced: true,
								filter(event, player) {
									return event.card.name === "sha";
								},
								async content(event, trigger, player) {
									const pileCards = Array.from(ui.cardPile.childNodes);
									const trickCards = pileCards.filter(card => {
										const info = lib.card[card.name];
										return info && info.type === "trick" && !info.delay;
									});
									if (trickCards.length > 0) {
										const toGain = trickCards[0];
										await player.gain(toGain, "draw2");
									} else {
										const discardCards = Array.from(ui.discardPile.childNodes);
										const trickDiscards = discardCards.filter(card => {
											const info = lib.card[card.name];
											return info && info.type === "trick" && !info.delay;
										});
										if (trickDiscards.length > 0) {
											const toGain = trickDiscards[0];
											await player.gain(toGain, "draw2");
										}
									}
								},
							},
						},
						ai: {
							effect: {
								player(card, player) {
									if (get.type2(card) === "trick" && get.subtype(card) !== "delay") {
										return [10, 0, 10, 0];
									}
								},
							},
						},
					},
					zfbaqi: {
						enable: "phaseUse",
						usable: 1,
						filter(event, player) {
							return player.getExpansions("zfbaqi_star").length > 0;
						},
						async content(event, trigger, player) {
							const stars = player.getExpansions("zfbaqi_star");
							const selectedCards = stars.slice();
							let values = selectedCards.map((card, index) => ({
								value: get.number(card),
								type: "card",
								card: card,
								index: index,
							}));
							let usedCards = [];
							player.logSkill("zfbaqi");
							while (values.length > 0) {
								if (values.length === 1) {
									if (values[0].value === 87 && usedCards.length > 0) {
										await player.lose(usedCards, "discard");
										const targetResult = await player
											.chooseTarget({
												prompt: "请选择一名其他角色，对其造成其体力上限点伤害",
												forced: true,
												filterTarget: (card, player, target) => target !== player,
											})
											.forResult();
										if (targetResult?.targets && targetResult.targets.length > 0) {
											const target = targetResult.targets[0];
											game.log(player, "对", target, "造成了其体力上限的伤害");
											await target.damage(target.maxHp, player);
										}
									} else {
										game.log(player, "最终结果为" + values[0].value + "，不等于87");
									}
									break;
								}
								const valueControls = values.map(v => v.value.toString());
								const leftResult = await player
									.chooseControl(valueControls)
									.set("prompt", "请选择第一个数")
									.set("ai", (event, player) => {
										if (values.some(v => v.type === "result")) {
											const resultValue = values.find(v => v.type === "result").value;
											return resultValue.toString();
										}
										const numbers = values.filter(v => v.type === "card").map(v => v.value);
										const coreCombos = [
											{ mult1: 6, mult2: [13] },
											{ mult1: 7, mult2: [13, 12, 11] },
											{ mult1: 8, mult2: [12, 11, 10] },
											{ mult1: 9, mult2: [10, 9] },
										];
										for (const combo of coreCombos) {
											if (numbers.includes(combo.mult1)) {
												const matchedMult2 = combo.mult2.find(n => numbers.includes(n));
												if (matchedMult2) {
													if (values.some(v => v.value === combo.mult1)) return combo.mult1.toString();
													if (values.some(v => v.value === matchedMult2)) return matchedMult2.toString();
												}
											}
										}
										return Math.max(...values.map(v => v.value)).toString();
									})
									.forResult();
								if (!leftResult?.control) break;
								const leftValue = parseFloat(leftResult.control);
								const leftMatches = [];
								for (let i = 0; i < values.length; i++) {
									if (values[i].value === leftValue) leftMatches.push(i);
								}
								if (leftMatches.length === 0) break;
								const leftIndex = leftMatches[0];
								const remainingValues = values.filter((_, i) => i !== leftIndex);
								const remainingControls = remainingValues.map(v => v.value.toString());
								const rightResult = await player
									.chooseControl(remainingControls)
									.set("prompt", "请选择第二个数")
									.set("ai", (event, player) => {
										if (values.some(v => v.type === "result" && v.value === leftValue)) {
											const adjustment = Math.abs(leftValue - 87);
											const closest = remainingValues.filter(v => v.type === "card").reduce((prev, curr) => (Math.abs(curr.value - adjustment) < Math.abs(prev.value - adjustment) ? curr : prev));
											return closest.value.toString();
										}
										const numbers = remainingValues.filter(v => v.type === "card").map(v => v.value);
										const coreCombos = [
											{ mult1: 6, mult2: [13] },
											{ mult1: 7, mult2: [13, 12, 11] },
											{ mult1: 8, mult2: [12, 11, 10] },
											{ mult1: 9, mult2: [10, 9] },
										];
										for (const combo of coreCombos) {
											if (leftValue === combo.mult1) {
												const matchedMult2 = combo.mult2.find(n => numbers.includes(n));
												if (matchedMult2) return matchedMult2.toString();
											}
											if (combo.mult2.includes(leftValue)) {
												if (numbers.includes(combo.mult1)) return combo.mult1.toString();
											}
										}
										return Math.max(...remainingValues.map(v => v.value)).toString();
									})
									.forResult();
								if (!rightResult?.control) break;
								const rightValue = parseFloat(rightResult.control);
								const rightMatches = [];
								for (let i = 0; i < values.length; i++) {
									if (i !== leftIndex && values[i].value === rightValue) rightMatches.push(i);
								}
								if (rightMatches.length === 0) break;
								const actualRightIndex = rightMatches[0];
								const leftItem = values[leftIndex];
								const rightItem = values[actualRightIndex];
								values = values.filter((_, i) => i !== leftIndex && i !== actualRightIndex);
								const opList = ["+", "-", "*", "/"];
								const opResult = await player
									.chooseControl(opList)
									.set("prompt", leftItem.value + " ? " + rightItem.value)
									.set("ai", (event, player) => {
										const coreCombos = [
											{ mult1: 6, mult2: [13] },
											{ mult1: 7, mult2: [13, 12, 11] },
											{ mult1: 8, mult2: [12, 11, 10] },
											{ mult1: 9, mult2: [10, 9] },
										];
										for (const combo of coreCombos) {
											if ((leftItem.value === combo.mult1 && combo.mult2.includes(rightItem.value)) || (rightItem.value === combo.mult1 && combo.mult2.includes(leftItem.value))) {
												return "*";
											}
										}
										const results = {
											"+": leftItem.value + rightItem.value,
											"-": leftItem.value - rightItem.value,
											"*": leftItem.value * rightItem.value,
											"/": rightItem.value !== 0 ? Math.floor(leftItem.value / rightItem.value) : Infinity,
										};
										let bestOp = "+";
										let minDist = Math.abs(results["+"] - 87);
										for (const op of ["-", "*", "/"]) {
											const dist = Math.abs(results[op] - 87);
											if (dist < minDist) {
												minDist = dist;
												bestOp = op;
											}
										}
										return bestOp;
									})
									.forResult();
								if (!opResult?.control) break;
								const op = opResult.control;
								let result;
								switch (op) {
									case "+":
										result = leftItem.value + rightItem.value;
										break;
									case "-":
										result = leftItem.value - rightItem.value;
										break;
									case "*":
										result = leftItem.value * rightItem.value;
										break;
									case "/":
										result = rightItem.value !== 0 ? Math.floor(leftItem.value / rightItem.value) : NaN;
										break;
								}
								if (isNaN(result) || !isFinite(result)) {
									game.log(player, "的计算结果无效");
									break;
								}
								game.log(player, "计算：" + leftItem.value + " " + op + " " + rightItem.value + " = " + result);
								if (leftItem.type === "card" && !usedCards.includes(leftItem.card)) usedCards.push(leftItem.card);
								if (rightItem.type === "card" && !usedCards.includes(rightItem.card)) usedCards.push(rightItem.card);
								values.push({
									value: result,
									type: "result",
								});
								if (result === 87) {
									game.playSkillBgm("zf");
									await player.lose(usedCards, "discard");
									const targetResult = await player
										.chooseTarget({
											prompt: "请选择一名其他角色，对其造成其体力上限-1点伤害",
											forced: true,
											filterTarget: (card, player, target) => target !== player,
										})
										.set("ai", target => {
											return get.damageEffect(target, player, player);
										})
										.forResult();
									if (targetResult?.targets && targetResult.targets.length > 0) {
										const target = targetResult.targets[0];
										const baqi = Math.max(3, target.maxHp - 1);
										await target.damage(baqi, player);
									}
									break;
								}
								const continueResult = await player.chooseBool("当前结果为" + result + "，是否继续计算？").forResult();
								if (!continueResult?.bool) break;
							}
						},
						ai: {
							order: 8,
							result: {
								player(player) {
									const stars = player.getExpansions("zfbaqi_star");
									const numbers = stars.map(card => get.number(card));
									if (numbers.includes(87)) return 10;
									const coreCombos = [
										{ mult1: 6, mult2: [13] },
										{ mult1: 7, mult2: [13, 12, 11] },
										{ mult1: 8, mult2: [12, 11, 10] },
										{ mult1: 9, mult2: [10, 9] },
									];
									for (const combo of coreCombos) {
										if (!numbers.includes(combo.mult1)) continue;
										const matchedMult2 = combo.mult2.find(n => numbers.includes(n));
										if (!matchedMult2) continue;
										const product = combo.mult1 * matchedMult2;
										const adjustment = 87 - product;
										const remaining = numbers.filter(n => n !== combo.mult1 && n !== matchedMult2);
										for (const num of remaining) {
											if (num === Math.abs(adjustment)) return 10;
										}
										for (let i = 0; i < remaining.length; i++) {
											for (let j = i + 1; j < remaining.length; j++) {
												const n1 = remaining[i];
												const n2 = remaining[j];
												if (n1 + n2 === adjustment) return 10;
												if (n1 - n2 === adjustment) return 10;
												if (-n1 + n2 === adjustment) return 10;
												if (-n1 - n2 === adjustment) return 10;
											}
										}
										if (remaining.length >= 3) {
											for (let i = 0; i < remaining.length; i++) {
												for (let j = i + 1; j < remaining.length; j++) {
													for (let k = j + 1; k < remaining.length; k++) {
														const n1 = remaining[i];
														const n2 = remaining[j];
														const n3 = remaining[k];
														if (n1 + n2 + n3 === adjustment) return 10;
														if (n1 + n2 - n3 === adjustment) return 10;
														if (n1 - n2 + n3 === adjustment) return 10;
														if (n1 - n2 - n3 === adjustment) return 10;
														if (-n1 + n2 + n3 === adjustment) return 10;
														if (-n1 + n2 - n3 === adjustment) return 10;
														if (-n1 - n2 + n3 === adjustment) return 10;
														if (-n1 - n2 - n3 === adjustment) return 10;
													}
												}
											}
										}
									}
									return 0;
								},
							},
						},
						group: ["zfbaqi_gain"],
						subSkill: {
							gain: {
								trigger: { player: "useCardAfter" },
								forced: true,
								async content(event, trigger, player) {
									const topCards = get.cards(2);
									if (topCards.length > 0) {
										const next = player.addToExpansion(topCards, player, "give");
										next.gaintag.add("zfbaqi_star");
										await next;
										player.markSkill("zfbaqi_star");
										game.log(player, "将牌堆顶" + get.cnNumber(topCards.length, true) + "张牌置于武将牌上，称为“星”");
									}
								},
							},
							star: {
								mark: true,
								marktext: "星",
								intro: {
									name: "星",
									content: "expansion",
									markcount: "expansion",
								},
								async onremove(player, skill) {
									const cards = player.getExpansions(skill);
									if (cards.length) {
										await player.loseToDiscardpile(cards);
									}
								},
							},
						},
					},
					zfyakong: {
						audio: ["ext:无名扩展/audio/skill/yakong"],
						trigger: {
							global: "dieAfter",
						},
						limited: true,
						filter(event, player) {
							return event.player !== player;
						},
						check(event, player) {
							return get.attitude(player, event.player) > 0;
						},
						async content(event, trigger, player) {
							player.awakenSkill(event.name);
							const deadPlayer = trigger.player;
							await deadPlayer.revive();
							await deadPlayer.recoverTo(2);
							await deadPlayer.draw(1);
						},
						ai: {
							order: 10,
							result: {
								player(player) {
									return 10;
								},
							},
						},
					},
					tlpoquan: {
						enable: ["phaseUse", "chooseToUse"],
						filterCard(card, player) {
							if (!ui.selected.cards.length) return true;
							const firstCard = ui.selected.cards[0];
							return get.type2(card) !== get.type2(firstCard) && get.color(card) !== get.color(firstCard);
						},
						selectCard: 2,
						viewAs: { name: "sha" },
						check(card) {
							return 5 - get.value(card);
						},
						ai: {
							order: 7,
							result: {
								player(player) {
									return 1;
								},
							},
						},
						group: ["tlpoquan_afterUse", "tlpoquan_draw"],
						subSkill: {
							afterUse: {
								trigger: { player: "useCardAfter" },
								direct: true,
								filter(event, player) {
									if (event.targets.length !== 1 || event.targets[0] === player || event.targets[0].isDead()) {
										return false;
									}
									return true;
								},
								async content(event, trigger, player) {
									const target = trigger.targets[0];
									const firstCard = trigger.card;
									player._tlpoquan_firstCard = {
										color: get.color(firstCard),
										type: get.type2(firstCard),
									};
									await player
										.chooseToUse(
											function (card, player, event) {
												const select = get.info(card).selectTarget;
												if (select !== 1) return false;
												return lib.filter.cardEnabled.apply(this, arguments);
											},
											"迫拳：是否对" + get.translation(target) + "使用一张牌？"
										)
										.set("filterTarget", function (card, player2, targetx) {
											if (targetx === _status.event.playerx) return false;
											if (targetx !== _status.event.sourcex && !ui.selected.targets.includes(_status.event.sourcex)) {
												return false;
											}
											return lib.filter.targetEnabled.apply(this, arguments);
										})
										.set("sourcex", target)
										.set("playerx", player)
										.set("addCount", false);
								},
							},
							draw: {
								trigger: { player: "useCard" },
								forced: true,
								popup: false,
								filter(event, player) {
									return event.getParent(2).name === "tlpoquan_afterUse" && player._tlpoquan_firstCard;
								},
								async content(event, trigger, player) {
									game.playSkillBgm("poquan");
									const firstCard = player._tlpoquan_firstCard;
									const secondCard = trigger.card;
									const firstColor = firstCard.color;
									const secondColor = get.color(secondCard);
									const firstType = firstCard.type;
									const secondType = get.type2(secondCard);
									const colorSame = firstColor === secondColor;
									const typeSame = firstType === secondType;
									if (colorSame || typeSame) {
										await player.draw(1);
									}
									delete player._tlpoquan_firstCard;
								},
							},
						},
					},
					tlzhadan: {
						audio: ["ext:无名扩展/audio/skill/zhadan"],
						enable: "phaseUse",
						limited: true,
						filterTarget(card, player, target) {
							return target !== player && target.isIn();
						},
						selectTarget: 1,
						check(event, player) {
							const targets = game.filterPlayer(cur => cur !== player && get.attitude(player, cur) < 0 && cur.isIn());
							for (const target of targets) {
								const potentialDamage = player.hp - 1;
								if (target.hp - potentialDamage <= 1) {
									return true;
								}
							}
							return false;
						},
						async content(event, trigger, player) {
							player.awakenSkill(event.name);
							const target = event.target;
							const currentHp = player.hp;
							const damageAmount = Math.max(1, currentHp - 1);
							await player.discard(player.getCards("h"));
							const reduceAmount = player.maxHp - 1;
							await player.loseMaxHp(reduceAmount);
							await target.damage(damageAmount);
						},
						ai: {
							order: 4,
							result: {
								player(player) {
									const targets = game.filterPlayer(cur => cur !== player && get.attitude(player, cur) < 0 && cur.isIn());
									for (const target of targets) {
										const potentialDamage = Math.max(1, player.hp);
										if (target.hp - potentialDamage < 1) {
											return 10;
										}
									}
									return 0;
								},
								target(player, target) {
									if (!target) return 0;
									return get.attitude(player, target) < 0 ? 1 : -10;
								},
							},
						},
					},
					yaoyaoyi: {
						audio: 2,
						init(player, skill) {
							game.broadcastAll(
								(player, skill) => {
									const observer = new MutationObserver(mutationsList => {
										for (const mutation of mutationsList) {
											if (mutation.type === "childList") {
												const cards = player._start_cards ?? [];
												if (player.node.handcards1.cardMod[skill] && !_status.gameDrawed) {
													for (const card of mutation.addedNodes) {
														if (cards.includes(card)) {
															game.broadcastAll(
																(card, player, skill) => {
																	card.addGaintag(`${skill}_tag`);
																	game.addVideo("addGaintag", player, [[get.cardInfo(card)], `${skill}_tag`]);
																	card.classList.add(skill);
																	game.addVideo("skill", player, [skill, [true, [get.cardInfo(card)]]]);
																},
																card,
																player,
																skill
															);
														}
													}
												}
												for (const card of mutation.removedNodes) {
													if (cards.includes(card) && !card.hasGaintag(`${skill}_tag`)) {
														game.broadcastAll(
															(card, player, skill) => {
																card.classList.remove(skill);
																game.addVideo("skill", player, [skill, [false, [get.cardInfo(card)]]]);
															},
															card,
															player,
															skill
														);
													}
												}
											}
										}
									});
									const config = { childList: true };
									observer.observe(player.node.handcards1, config);
									observer.observe(player.node.handcards2, config);
									player.node.handcards1.cardMod ??= {};
									player.node.handcards2.cardMod ??= {};
									const cardMod = card => {
										if (card.classList.contains(skill)) {
											return ["爻疑", "此牌对你不可见"];
										}
									};
									player.node.handcards1.cardMod[skill] = cardMod;
									player.node.handcards2.cardMod[skill] = cardMod;
									player.node.handcards1.classList.add(skill);
									player.node.handcards2.classList.add(skill);
									if (_status.gameDrawed) {
										const cards = player._start_cards ?? [];
										player.getCards("h").forEach(card => {
											if (cards.includes(card)) {
												game.broadcastAll(
													(card, player, skill) => {
														card.addGaintag(`${skill}_tag`);
														game.addVideo("addGaintag", player, [[get.cardInfo(card)], `${skill}_tag`]);
														card.classList.add(skill);
														game.addVideo("skill", player, [skill, [true, [get.cardInfo(card)]]]);
													},
													card,
													player,
													skill
												);
											}
										});
									}
									const { card, blank, ...others } = ui.create.buttonPresets;
									ui.create.buttonPresets = {
										...others,
										card(item, ...args) {
											if (item.classList.contains(skill) && args[args.length - 1] !== skill) {
												return blank(item, ...args, skill);
											}
											return card(item, ...args);
										},
										blank(item, ...args) {
											if (item.classList.contains(skill) && args[args.length - 1] !== skill) {
												return card(item, ...args, skill);
											}
											return blank(item, ...args);
										},
									};
								},
								player,
								skill
							);
						},
						onremove(player, skill) {
							player.removeGaintag(`${skill}_tag`);
							game.broadcastAll(
								(player, skill) => {
									player.node.handcards1.classList.remove(skill);
									player.node.handcards2.classList.remove(skill);
									delete player.node.handcards1.cardMod[skill];
									delete player.node.handcards2.cardMod[skill];
									player.getCards("h").forEach(card => {
										if (card.classList.contains(skill)) {
											card.classList.remove(skill);
											game.addVideo("skill", player, [skill, [false, [get.cardInfo(card)]]]);
										}
									});
								},
								player,
								skill
							);
						},
						video(player, info) {
							for (const cardid of info[1]) {
								for (const card of player.getCards("h")) {
									if (card.cardid === cardid[4]) {
										card.classList[info[0] ? "add" : "remove"]("yaoyaoyi");
									}
								}
							}
						},
						enable: "chooseToUse",
						filter(event, player) {
							return get
								.inpileVCardList(info => lib.skill.yaoyaoyi.hiddenCard(player, info[2]))
								.some(info => {
									const card = { name: info[2], nature: info[3] };
									return player.hasCard(cardx => cardx.classList.contains("yaoyaoyi") && event.filterCard({ ...card, cards: [cardx] }, player, event), "h");
								});
						},
						chooseButton: {
							dialog(event, player) {
								const list = get
									.inpileVCardList(info => lib.skill.yaoyaoyi.hiddenCard(player, info[2]))
									.filter(info => {
										const card = { name: info[2], nature: info[3] };
										return player.hasCard(cardx => cardx.classList.contains("yaoyaoyi") && event.filterCard({ ...card, cards: [cardx] }, player, event), "h");
									});
								return ui.create.dialog("爻疑", [list, "vcard"]);
							},
							filter(button, player) {
								const event = get.event().getParent(),
									info = button.link,
									card = { name: info[2], nature: info[3] };
								return player.hasCard(cardx => cardx.classList.contains("yaoyaoyi") && event.filterCard({ ...card, cards: [cardx] }, player, event), "h");
							},
							check(button) {
								const event = get.event().getParent();
								if (event.type !== "phase") {
									return 1;
								}
								return get.player().getUseValue({ name: button.link[2], nature: button.link[3] });
							},
							prompt(links) {
								const event = get.event().getParent();
								return "将一张背置牌当作" + (get.translation(links[0][3]) || "") + "【" + get.translation(links[0][2]) + "】" + (event.name === "chooseToRespond" ? "打出" : "使用");
							},
							backup(links, player) {
								return {
									audio: "yaoyaoyi",
									filterCard(card) {
										return get.itemtype(card) == "card" && card.classList.contains("yaoyaoyi");
									},
									popname: true,
									check(card) {
										return 1 + Math.random();
									},
									position: "hse",
									viewAs: { name: links[0][2], nature: links[0][3] },
									async precontent(event, trigger, player) {
										player.addTempSkill("yaoyaoyi_used");
										player.markAuto("yaoyaoyi_used", [event.result.card?.name]);
									},
								};
							},
						},
						hiddenCard(player, name) {
							if (!lib.inpile.includes(name) || player.getStorage("yaoyaoyi_used").includes(name)) {
								return false;
							}
							return ["basic", "trick"].includes(get.type(name)) && player.hasCard(card => _status.connectMode || card.classList.contains("yaoyaoyi"), "h");
						},
						locked: false,
						mod: {
							cardEnabled(card, player) {
								if (!card || get.is.convertedCard(card)) {
									return;
								}
								if (card?.cards?.some(cardx => cardx.classList.contains("yaoyaoyi"))) {
									return false;
								}
							},
							cardRespondable(card, player) {
								return get.info("yaoyaoyi").mod.cardEnabled.apply(this, arguments);
							},
							cardSavable(card, player) {
								return get.info("yaoyaoyi").mod.cardEnabled.apply(this, arguments);
							},
						},
						ai: {
							respondSha: true,
							respondShan: true,
							skillTagFilter(player) {
								if (!player.hasCard(card => _status.connectMode || card.classList.contains("yaoyaoyi"), "h")) {
									return false;
								}
							},
							order(item, player) {
								if (player && _status.event.type == "phase") {
									const list = get.inpileVCardList(info => lib.skill.yaoyaoyi.hiddenCard(player, info[2]));
									let max = 0;
									list.forEach(info => {
										const card = { name: info[2], nature: info[3] };
										if (player.getUseValue(card) > 0) {
											const temp = get.order(card);
											if (temp > max) {
												max = temp;
											}
										}
									});
									if (max > 0) {
										max += 1;
									}
									return max;
								}
								return 1;
							},
							result: {
								player(player) {
									return get.event().dying ? get.attitude(player, get.event().dying) : 1;
								},
							},
						},
						subSkill: {
							backup: {},
							tag: {},
							used: {
								charlotte: true,
								onremove: true,
							},
						},
					},
					yaochenwei: {
						audio: 2,
						trigger: { player: "useCard" },
						filter(event, player) {
							const storage = player.storage.yaochenwei;
							if (!storage) {
								if (
									!player.hasHistory("lose", evt => {
										if (evt.getParent() !== event) return false;
										return Object.values(evt.gaintag_map).flat().includes("yaoyaoyi_tag");
									})
								) {
									return false;
								}
								return player.countCards("h") > 0;
							}
							const usedBackCard = player.hasHistory("lose", evt => {
								if (evt.getParent() !== event) return false;
								return Object.values(evt.gaintag_map).flat().includes("yaoyaoyi_tag");
							});
							if (usedBackCard) return false;
							return game.hasPlayer(target => target !== player && target.countGainableCards(player, "he"));
						},
						async cost(event, trigger, player) {
							const storage = player.storage[event.skill];
							const next = player.chooseTarget(get.prompt(event.skill));
							if (storage) {
								next.prompt2 = "获得一名其他角色的一张牌并将此牌背置";
								next.filterTarget = function (card, player, target) {
									return target !== player && target.countGainableCards(player, "he");
								};
								next.ai = function (target) {
									const player = get.player();
									return get.effect(target, { name: "shunshou_copy2" }, player, player);
								};
							} else {
								next.prompt2 = "令一名角色将你的一张手牌翻面";
								next.ai = function (target) {
									const player = get.player();
									return 1 + Math.sign(get.attitude(player, target)) + Math.random();
								};
							}
							event.result = await next.forResult();
						},
						async content(event, trigger, player) {
							const storage = player.storage[event.name],
								target = event.targets[0];
							player.changeZhuanhuanji(event.name);
							if (storage) {
								const result = await player.gainPlayerCard(target, "he", true).forResult();
								if (result?.bool && result.cards?.some(i => get.position(i) === "h" && get.owner(i) === player && !i.classList.contains("yaoyaoyi"))) {
									game.broadcastAll(
										cards => {
											for (const card of cards) {
												card.classList.add("yaoyaoyi");
												card.addGaintag("yaoyaoyi_tag");
											}
										},
										result.cards.filter(i => get.position(i) === "h" && get.owner(i) === player && !i.classList.contains("yaoyaoyi"))
									);
								}
							} else {
								const result = await target
									.choosePlayerCard(player, "h", true)
									.set("prompt2", `将${get.translation(player)}的一张手牌翻面`)
									.forResult();
								if (result?.bool && result.cards?.some(i => get.position(i) === "h" && get.owner(i) === player)) {
									game.broadcastAll(
										cards => {
											for (const card of cards) {
												if (card.hasGaintag("yaoyaoyi_tag")) {
													card.removeGaintag("yaoyaoyi_tag");
													game.addVideo("removeGaintag", player, ["yaoyaoyi_tag", [get.cardInfo(card)]]);
													card.classList.remove("yaoyaoyi");
													game.addVideo("skill", player, ["yaoyaoyi", [false, [get.cardInfo(card)]]]);
												} else {
													card.addGaintag("yaoyaoyi_tag");
													game.addVideo("addGaintag", player, [[get.cardsInfo(card)], "yaoyaoyi_tag"]);
													card.classList.add("yaoyaoyi");
													game.addVideo("skill", player, ["yaoyaoyi", [true, [get.cardInfo(card)]]]);
												}
											}
										},
										result.cards.filter(i => get.position(i) === "h" && get.owner(i) === player)
									);
								}
							}
						},
						zhuanhuanji: true,
						marktext: "☯",
						mark: true,
						intro: {
							content(storage, player) {
								return storage ? "阴：当你使用一张非背置牌时，你可以获得一名其他角色的一张牌并将此牌背置" : "阳：当你使用一张背置牌时，你可以令一名角色将你的一张手牌翻面";
							},
						},
						ai: {
							combo: "yaoyaoyi",
						},
					},
					asguangxian: {
						direct: true,
						trigger: { player: "useCard" },
						async cost(event, trigger, player) {
							event.result = await player.chooseBool(get.prompt(event.skill)).forResult();
						},
						async content(event, trigger, player) {
							game.playSkillBgm("guangxian");
							if (get.tag(trigger.card, "damage")) {
								trigger.baseDamage = (trigger.baseDamage || 1) + 1;
							} else {
								await player.draw(1);
							}
						},
					},
					asduantou: {
						audio: ["ext:无名扩展/audio/skill/duantou"],
						enable: "phaseUse",
						usable: 1,
						skillAnimation: true,
						filterCard(card, player) {
							return !ui.selected.cards.some(cardx => get.suit(cardx, player) === get.suit(card, player));
						},
						selectCard: [1, 4],
						position: "h",
						complexCard: true,
						complexSelect: true,
						filterTarget: lib.filter.notMe,
						selectTarget: 1,
						async content(event, trigger, player) {
							const { cards, targets } = event;
							const target = targets[0];
							const suitsUsed = cards.map(card => get.suit(card, player));
							const targetHand = target.getCards("h");
							if (targetHand.length === 0) {
								await target.damage(2, player);
								return;
							}
							target.showHandcards();
							const cardsToDiscard = targetHand.filter(card => suitsUsed.includes(get.suit(card, target)));
							if (cardsToDiscard.length > 0) {
								await target.discard(cardsToDiscard);
							}
							const remainingHand = target.countCards("h");
							await target.damage(remainingHand === 0 ? 2 : 1, player);
						},
						ai: {
							order: 7,
							result: {
								target(player, target) {
									return -2;
								},
								player(player, target) {
									if (!target) return 0;
									if (player.countCards("h") < 1) return -10;
									return get.damageEffect(target, player, player) - 1;
								},
							},
						},
					},
					swbingfu: {
						audio: ["ext:无名扩展/audio/skill/bingfu"],
						trigger: { player: "useCardToTarget" },
						filter(event, player) {
							if (!event.card) return false;
							if (!event.target) return false;
							return event.target !== player && event.target.isIn();
						},
						prompt(event, player) {
							return `是否对 ${get.translation(event.target)} 发动【冰斧】？`;
						},
						check(event, player) {
							return get.attitude(player, event.target) < 0;
						},
						async content(event, trigger, player) {
							game.playSkillBgm("sw");
							const target = trigger.target;
							player.logSkill("swbingfu", target);
							const result = await player.judge(card => 1).forResult();
							const suit = result.suit;
							const card = trigger.card;
							if (suit === "heart") {
								await player.useCard({ name: "sha", isCard: true }, target).set("addCount", false);
								game.log(player, "判定结果为红心，视为对" + get.translation(target) + "使用了一张普通【杀】");
							} else if (suit === "diamond") {
								player.setStorage("swbingfu_unrespondable", true);
								player.setStorage("swbingfu_target", target);
								trigger.directHit.add(target);
								game.log(player, "判定结果为方块，" + get.translation(card) + "对" + get.translation(target) + "不可响应");
							} else if (suit === "spade") {
								if (target.countCards("he") > 0) {
									await player.discardPlayerCard({ target, position: "he", forced: true });
								}
								game.log(player, "判定结果为黑桃，弃置" + get.translation(target) + "一张牌");
							} else if (suit === "club") {
								if (target.countDiscardableCards(target, "he") > 0) {
									await target.chooseToDiscard(2, "he", true);
								}
								game.log(player, "判定结果为梅花，" + get.translation(target) + "弃置两张牌");
							}
						},
						targetprompt2(target) {
							const player = get.player();
							if (player.getStorage("swbingfu_unrespondable") && player.getStorage("swbingfu_target") === target) {
								return "不可响应";
							}
						},
						onChooseToUse(event) {
							event.targetprompt2.add(lib.skill.swbingfu.targetprompt2);
						},
						onChooseTarget(event) {
							event.targetprompt2.add(lib.skill.swbingfu.targetprompt2);
						},
						ai: {
							directHit_ai: true,
							skillTagFilter(player, tag, arg) {
								if (player.getStorage("swbingfu_unrespondable") && arg?.target === player.getStorage("swbingfu_target")) {
									return true;
								}
								return false;
							},
						},
						group: "swbingfu_clear",
						subSkill: {
							clear: {
								trigger: { player: "useCardAfter" },
								charlotte: true,
								forced: true,
								popup: false,
								filter(event, player) {
									return player.getStorage("swbingfu_unrespondable");
								},
								async content(event, trigger, player) {
									player.removeStorage("swbingfu_unrespondable");
									player.removeStorage("swbingfu_target");
								},
							},
						},
					},
					swxiongjia: {
						trigger: { global: "phaseJieshuBegin" },
						forced: true,
						filter(event, player) {
							const round = game.rounds;
							const discarded = get.discarded().filter(card => card._swxiongjia_round === round);
							if (discarded.length === 0) return false;
							const suits = new Set(discarded.map(card => get.suit(card)));
							return suits.size >= 2;
						},
						async content(event, trigger, player) {
							const round = game.rounds;
							const discarded = get.discarded().filter(card => card._swxiongjia_round === round);
							const suits = new Set(discarded.map(card => get.suit(card)));
							const suitCount = suits.size;
							if (suitCount >= 2) {
								await player.draw();
								if (suitCount >= 3) {
									await player.recover();
								}
							}
						},
						group: "swxiongjia_record",
						subSkill: {
							record: {
								trigger: { global: "loseToDiscardpile" },
								charlotte: true,
								forced: true,
								popup: false,
								filter(event, player) {
									return event.cards && event.cards.length > 0;
								},
								content(event, trigger, player) {
									const round = game.rounds;
									for (const card of trigger.cards) {
										card._swxiongjia_round = round;
									}
								},
							},
						},
					},
					zggylianshuai: {
						trigger: { global: "roundStart" },
						forced: true,
						async content(event, trigger, player) {
							player.setStorage("zggylianshuai", { combos: [] });
						},
						group: ["zggylianshuai_sha"],
						subSkill: {
							sha: {
								trigger: { player: "useCardAfter" },
								filter(event, player) {
									if (event.card.name !== "sha") return false;
									const handCards = player.getCards("h");
									const typeMap = { basic: "基本牌", trick: "锦囊牌" };
									const suits = ["spade", "heart", "club", "diamond"];
									const data = player.getStorage("zggylianshuai");
									for (const card of handCards) {
										const cardType = get.type2(card);
										const typeText = typeMap[cardType];
										if (!typeText) continue;
										const suit = get.suit(card);
										if (suit === "none" || suit === "unsure") continue;
										const key = cardType + suit;
										if (!data.combos.includes(key)) return true;
									}
									return false;
								},
								async cost(event, trigger, player) {
									const handCards = player.getCards("h");
									const suitSymbols = { spade: "♠", heart: "♥", club: "♣", diamond: "♦" };
									const typeMap = { basic: "基本牌", trick: "锦囊牌" };
									const reverseTypeMap = { 基本牌: "basic", 锦囊牌: "trick" };
									const suits = ["spade", "heart", "club", "diamond"];
									const types = ["基本牌", "锦囊牌"];
									const data = player.getStorage("zggylianshuai");
									const groups = {};
									for (const card of handCards) {
										const cardType = get.type2(card);
										const typeText = typeMap[cardType];
										if (!typeText) continue;
										const suit = get.suit(card);
										if (suit === "none" || suit === "unsure") continue;
										const key = cardType + suit;
										if (!groups[key]) groups[key] = [];
										groups[key].push(card);
									}
									let hasAvailable = false;
									for (const type of types) {
										const engType = reverseTypeMap[type];
										for (const suit of suits) {
											const key = engType + suit;
											if (!data.combos.includes(key) && groups[key]?.length) {
												hasAvailable = true;
												break;
											}
										}
										if (hasAvailable) break;
									}
									if (!hasAvailable) {
										event.result = { bool: false };
										return;
									}
									if (!event.isMine()) {
										let bestKey = null;
										let bestCards = null;
										let bestScore = Infinity;
										for (const type of types) {
											const engType = reverseTypeMap[type];
											for (const suit of suits) {
												const key = engType + suit;
												if (data.combos.includes(key) || !groups[key]?.length) continue;
												const score = groups[key].reduce((sum, card) => sum + get.value(card), 0);
												if (score < bestScore) {
													bestScore = score;
													bestKey = key;
													bestCards = groups[key];
												}
											}
										}
										if (bestKey && bestScore <= 10) {
											event.result = { bool: true, cost_data: { cards: bestCards.slice(), key: bestKey } };
										} else {
											event.result = { bool: false };
										}
										return;
									}
									const { promise, resolve } = Promise.withResolvers();
									const evt = _status.event;
									evt.selectedCards = [];
									evt.selectedButtons = [];
									const selected = { key: null };
									const dialog = ui.create.dialog("至高");
									dialog.style.zoom = "0.85";
									const subCss = { border: "none", minHeight: "0px", background: "transparent" };
									dialog.addNewRow(
										{
											item: [],
											ItemNoclick: true,
											custom: function (c) {
												var d = ui.create.div(c);
												d.innerHTML = "基本牌";
												d.css({ display: "flex", justifyContent: "center", alignItems: "center", width: "100%", height: "100%", fontSize: "1.2em", fontWeight: "bold" });
											},
											itemContainerCss: subCss,
										},
										{
											item: [],
											ItemNoclick: true,
											custom: function (c) {
												var d = ui.create.div(c);
												d.innerHTML = "锦囊牌";
												d.css({ display: "flex", justifyContent: "center", alignItems: "center", width: "100%", height: "100%", fontSize: "1.2em", fontWeight: "bold" });
											},
											itemContainerCss: subCss,
										}
									);
									const okButton = ui.create.control("ok", () => {
										_status.imchoosing = false;
										dialog.close();
										okButton.close();
										cancelButton?.close();
										resolve({ bool: true, cards: evt.selectedCards.slice(), key: selected.key });
										game.resume();
									});
									okButton.classList.add("disabled");
									const cancelButton = ui.create.control("cancel2", () => {
										_status.imchoosing = false;
										dialog.close();
										okButton.close();
										cancelButton.close();
										resolve({ bool: false });
										game.resume();
									});
									dialog.switchToAuto = function () {
										_status.imchoosing = false;
										dialog.close();
										okButton.close();
										cancelButton.close();
										let bestKey = null;
										let bestCards = null;
										let minLen = Infinity;
										for (const type of types) {
											const engType = reverseTypeMap[type];
											for (const suit of suits) {
												const key = engType + suit;
												if (!data.combos.includes(key) && groups[key]?.length && groups[key].length < minLen) {
													minLen = groups[key].length;
													bestKey = key;
													bestCards = groups[key];
												}
											}
										}
										if (bestKey) {
											resolve({ bool: true, cards: bestCards.slice(), key: bestKey });
											game.resume();
											return;
										}
										resolve({ bool: false });
										game.resume();
									};
									const itemCss = { border: "solid #c6b3b3 2px", minHeight: "100px" };
									function makeClickHandler(key) {
										return function (container, item) {
											if (!item?.length) return;
											if (evt.selectedButtons.includes(container)) {
												container.classList.remove("selected");
												evt.selectedButtons.remove(container);
												evt.selectedCards.removeArray(item);
												selected.key = null;
											} else {
												if (evt.selectedButtons.length) {
													const prev = evt.selectedButtons[0];
													prev.classList.remove("selected");
													evt.selectedButtons.remove(prev);
													evt.selectedCards = [];
													selected.key = null;
												}
												container.classList.add("selected");
												evt.selectedButtons.add(container);
												evt.selectedCards.addArray(item);
												selected.key = key;
											}
											okButton.classList[evt.selectedButtons.length ? "remove" : "add"]("disabled");
										};
									}
									function createCustom(text, color) {
										return function (itemContainer) {
											const div = ui.create.div(itemContainer);
											div.innerHTML = text;
											div.css({
												position: "absolute",
												width: "100%",
												bottom: "1%",
												height: "25%",
												background: "#352929bf",
												display: "flex",
												justifyContent: "center",
												alignItems: "center",
												fontSize: "1em",
												zIndex: "2",
												color: color || "white",
											});
										};
									}
									for (const suit of suits) {
										const engType1 = "basic";
										const engType2 = "trick";
										const key1 = engType1 + suit;
										const key2 = engType2 + suit;
										const cards1 = groups[key1];
										const cards2 = groups[key2];
										const discarded1 = data.combos.includes(key1);
										const discarded2 = data.combos.includes(key2);
										const status1 = discarded1 ? "discarded" : cards1 ? "available" : "empty";
										const status2 = discarded2 ? "discarded" : cards2 ? "available" : "empty";
										const suitStr = suitSymbols[suit];
										const item1 = { item: status1 === "available" ? cards1 : [], ItemNoclick: status1 !== "available", itemContainerCss: itemCss };
										const item2 = { item: status2 === "available" ? cards2 : [], ItemNoclick: status2 !== "available", itemContainerCss: itemCss };
										if (status1 === "available") {
											item1.custom = createCustom(suitStr, "red");
											item1.clickItemContainer = makeClickHandler(key1);
										} else if (status1 === "discarded") {
											item1.custom = createCustom(suitStr + " 已弃置过", "blue");
										} else {
											item1.custom = createCustom(suitStr + " 无牌可弃");
										}
										if (status2 === "available") {
											item2.custom = createCustom(suitStr, "red");
											item2.clickItemContainer = makeClickHandler(key2);
										} else if (status2 === "discarded") {
											item2.custom = createCustom(suitStr + " 已弃置过", "blue");
										} else {
											item2.custom = createCustom(suitStr + " 无牌可弃");
										}
										dialog.addNewRow(item1, item2);
									}
									dialog.open();
									_status.imchoosing = true;
									const result = await promise;
									if (!result?.bool) {
										event.result = { bool: false };
										return;
									}
									event.result = { bool: true, cost_data: { cards: result.cards, key: result.key } };
								},
								async content(event, trigger, player) {
									game.playSkillBgm("zggy");
									const { cards, key } = event.cost_data;
									await player.discard(cards);
									const data = player.getStorage("zggylianshuai");
									data.combos.push(key);
									player.setStorage("zggylianshuai", data, true);
									const vcard = new lib.element.VCard({ name: "sha" });
									await player.chooseUseTarget(vcard, false, false);
								},
							},
						},
						init(player, skill) {
							player.initStorage(skill, { combos: [] });
						},
						ai: {
							threaten: 1.5,
						},
					},
					zggyjili: {
						enable: ["phaseUse", "chooseToUse"],
						filterCard(card, player) {
							return !get.tag(card, "damage");
						},
						viewAs: { name: "sha" },
						prompt: "将一张非伤害类牌当普通的【杀】使用",
						check(card) {
							return 6 - get.value(card);
						},
						hiddenCard(player, name) {
							if (name === "sha") {
								return player.hasCards("h", card => !get.is.damageCard(card));
							}
							return false;
						},
						ai: {
							respondSha: true,
							skillTagFilter(player, tag) {
								if (tag === "respondSha") {
									return player.hasCards("h", card => !get.is.damageCard(card));
								}
								return false;
							},
							order: 10,
							result: {
								player(player) {
									return 1;
								},
							},
						},
						group: ["zggyjili_use"],
						subSkill: {
							use: {
								trigger: { player: "useCardToPlayered" },
								filter(event, player) {
									if (get.name(event.card) !== "sha") return false;
									if (event.targets[0] !== event.target) return false;
									if (!player.countCards("h")) return false;
									return true;
								},
								chooseCard(player, eventId) {
									return player
										.chooseCard({
											prompt: "极力：展示一张手牌",
											forced: true,
											position: "h",
											selectCard: 1,
											ai: () => Math.random(),
										})
										.set("id", eventId)
										.set("_global_waiting", true);
								},
								async cost(event, trigger, player) {
									const targets = trigger.targets.filter(t => t !== player && t.isIn());
									if (!targets.length) {
										event.result = { bool: false };
										return;
									}
									const hasEnemy = targets.some(t => get.attitude(player, t) < 0);
									if (!hasEnemy) {
										event.result = { bool: false };
										return;
									}
									const names = targets.map(t => get.translation(t)).join("、");
									const promptText = `你可以与${names}依次展示一张手牌并执行效果`;
									const result = await player
										.chooseBool(get.prompt("zggyjili"), promptText)
										.set("ai", () => true)
										.forResult();
									if (!result.bool) {
										event.result = { bool: false };
										return;
									}
									event.result = { bool: true, cost_data: { targets } };
								},
								async content(event, trigger, player) {
									game.playSkillBgm("zggy");
									const targets = event.cost_data.targets;
									const chooseCard = get.info("zggyjili_use").chooseCard;
									for (const target of targets) {
										let pResult, tResult;
										if (player.isOnline() || target.isOnline()) {
											const map = await game.chooseAnyOL([player, target], chooseCard, []).forResult();
											pResult = map.get(player);
											tResult = map.get(target);
										} else {
											const eventId = get.id();
											pResult = await chooseCard(player, eventId).forResult();
											if (target.countCards("h")) {
												tResult = await chooseCard(target, eventId).forResult();
											}
										}
										if (!pResult?.bool || !pResult.cards?.length) continue;
										const pCard = pResult.cards[0];
										player.showCards([pCard], `${get.translation(player)}对${get.translation(target)}展示了手牌`);
										const pNum = get.number(pCard, false) || 0;
										let tNum = 7;
										if (tResult?.bool && tResult.cards?.length) {
											const tCard = tResult.cards[0];
											target.showCards([tCard], `${get.translation(target)}展示了手牌`);
											tNum = get.number(tCard, false) || 0;
										} else {
											game.log(target, "无手牌，视为展示7点");
										}
										const X = Math.floor(Math.abs(pNum - tNum) / 2);
										const Y = Math.ceil(X / 2);
										if (X === 0) {
											trigger.directHit.add(target);
											game.log(player, "令此【杀】对", get.translation(target), "不可被响应");
											continue;
										}
										const choices = ["选项一", "选项二", "选项三"];
										const choiceList = [`摸${get.cnNumber(X)}张牌`, `此【杀】对${get.translation(target)}伤害+${Y}`, `令此【杀】对${get.translation(target)}无法被响应`];
										const control = await player
											.chooseControl({
												controls: choices,
												prompt: `极力：对${get.translation(target)}选择一项`,
												choiceList,
												ai: () => {
													if (X >= 4) return "选项一";
													const rand = Math.random();
													if (rand < 0.4) return "选项一";
													if (0.4 < rand && rand < 0.8) return "选项二";
													return "选项三";
												},
											})
											.forResult();
										if (control.control === "选项一") {
											await player.draw(X);
										} else if (control.control === "选项二") {
											player.addTempSkill("zggyjili_damage");
											const list = player.getStorage("zggyjili_damage_list") || [];
											list.push({ target, card: trigger.card, num: Y });
											player.setStorage("zggyjili_damage_list", list, true);
										} else {
											trigger.directHit.add(target);
											game.log(player, "令此【杀】对", get.translation(target), "不可被响应");
										}
									}
								},
							},
							damage: {
								charlotte: true,
								trigger: { global: "damageBegin1" },
								forced: true,
								silent: true,
								popup: false,
								filter(event, player) {
									const list = player.getStorage("zggyjili_damage_list") || [];
									return list.some(item => item.num > 0 && item.card === event.card && item.target === event.player && event.source === player);
								},
								content(event, trigger, player) {
									const list = player.getStorage("zggyjili_damage_list") || [];
									const item = list.find(i => i.num > 0 && i.card === trigger.card && i.target === trigger.player);
									if (item) {
										trigger.num += item.num;
										const newList = list.filter(i => i !== item);
										player.setStorage("zggyjili_damage_list", newList, true);
									}
								},
							},
						},
					},
					leofenzhan: {
						forced: true,
						group: ["leofenzhan_draw", "leofenzhan_end"],
						mod: {
							cardUsable(card, player) {
								if (get.name(card) === "sha" && player.getDamagedHp() > 0) {
									return 1 + player.getDamagedHp();
								}
							},
						},
						subSkill: {
							draw: {
								trigger: { player: "phaseDrawBegin2" },
								forced: true,
								filter(event, player) {
									return !event.numFixed && player.getDamagedHp() > 0;
								},
								async content(event, trigger, player) {
									trigger.num += player.getDamagedHp();
									game.playSkillBgm("leiou");
								},
							},
							end: {
								trigger: { player: "phaseEnd" },
								forced: true,
								filter(event, player) {
									return player.getDamagedHp() > 0;
								},
								async content(event, trigger, player) {
									const X = player.getDamagedHp();
									await player.draw(X);
								},
							},
						},
					},
					leofeiti: {
						audio: ["ext:无名扩展/audio/skill/feiti"],
						enable: "phaseUse",
						usable: 1,
						filterCard: true,
						selectCard: [1, Infinity],
						position: "he",
						skillAnimation: true,
						filterTarget(card, player, target) {
							return target !== player && lib.filter.targetEnabled({ name: "sha" }, player, target) && lib.filter.targetInRange({ name: "sha" }, player, target);
						},
						selectTarget: 1,
						async content(event, trigger, player) {
							const cards = event.cards;
							const target = event.target;
							const X = cards.length;
							const choices = ["选项一", "选项二", "背水！"];
							const choiceList = [`令其弃置${get.cnNumber(X)}张牌`, "此【杀】伤害+1", `背水！失去一点体力`];
							const result = await player
								.chooseControl(choices)
								.set("choiceList", choiceList)
								.set("prompt", "飞踢：选择一项")
								.set("X", X)
								.set("ai", () => {
									const evt = _status.event;
									const player = evt.player;
									const X = evt.X;
									if (player.getHp() >= 2) return "背水！";
									if (X >= 3) return "选项二";
									return "选项一";
								})
								.forResult();
							if (typeof result?.control == "string" && result.control != "cancel2") {
								await player.discard(cards);
								if (["选项一", "背水！"].includes(result.control)) {
									player.setStorage("leofeiti_discard", X);
								}
								if (["选项二", "背水！"].includes(result.control)) {
									player.setStorage("leofeiti_damage", 1);
								}
								if (result.control === "背水！") {
									await player.loseHp(1);
								}
								player.addTempSkill("leofeiti_effect");
								player.addTempSkill("leofeiti_after");
								const vcard = new lib.element.VCard({ name: "sha" });
								const next = player.useCard(vcard, target, false);
								await next;
							}
						},
						ai: {
							order: 4,
							result: {
								player(player) {
									const X = player.getDamagedHp();
									const maxKeep = Math.max(0, X - 1);
									if (player.countCards("h") > maxKeep) return 1;
									return 0;
								},
								target(player, target) {
									return get.damageEffect(target, player, player);
								},
							},
						},
						subSkill: {
							effect: {
								charlotte: true,
								trigger: { global: "damageBegin1" },
								forced: true,
								silent: true,
								popup: false,
								filter(event, player) {
									return event.source === player && get.name(event.card) === "sha" && player.getStorage("leofeiti_damage", 0) > 0;
								},
								content(event, trigger, player) {
									const num = player.getStorage("leofeiti_damage", 0);
									trigger.num += num;
									player.removeStorage("leofeiti_damage");
								},
							},
							after: {
								charlotte: true,
								trigger: { player: "useCardToPlayered" },
								forced: true,
								silent: true,
								popup: false,
								filter(event, player) {
									return get.name(event.card) === "sha" && player.getStorage("leofeiti_discard", 0) > 0;
								},
								async content(event, trigger, player) {
									const X = player.getStorage("leofeiti_discard", 0);
									const target = trigger.target;
									if (target && target.isIn()) {
										await target.chooseToDiscard("he", X, true);
									}
									player.removeStorage("leofeiti_discard");
								},
							},
						},
					},
					jstsfensui: {
						zhuanhuanji: true,
						mark: true,
						marktext: "☯",
						intro: {
							content(storage, player) {
								if (!player) {
									return storage ? "转换技，【阴】：当其他角色成为牌的目标后，你可以令一名角色执行：①受到一点伤害然后回复两点体力；②受到两点伤害然后回复一点体力。" : "转换技，【阳】：当你成为牌的目标后，你可以令一名角色执行：①摸两张牌并弃置一张牌；②摸一张牌并弃置两张牌。";
								}
								const isYin = !!player.storage.jstsfensui;
								const option = player.getStorage(isYin ? "jstsfensui_yin" : "jstsfensui_yang", 0);
								const color = isYin ? "bluetext" : "firetext";
								const label = isYin ? "阴" : "阳";
								const trigger = isYin ? "当其他角色成为牌的目标后，你可以令一名角色执行" : "当你成为牌的目标后，你可以令一名角色执行";
								const effects = isYin ? ["受到一点伤害然后回复两点体力", "受到两点伤害然后回复一点体力"] : ["摸两张牌并弃置一张牌", "摸一张牌并弃置两张牌"];
								const str = effects
									.map((text, i) => {
										const cn = i === 0 ? "①" : "②";
										return i === option ? `<span class='${color}'>${cn}${text}</span>` : cn + text;
									})
									.join("；");
								return `转换技，${label}：${trigger}：${str}。`;
							},
						},
						trigger: { global: "useCardToTarget" },
						filter(event, player) {
							if (player.storage.jstsfensui) {
								return event.target !== player && game.hasPlayer(target => target.isIn() && target !== player);
							}
							return event.target === player;
						},
						async cost(event, trigger, player) {
							const isYin = player.storage.jstsfensui;
							const option = player.getStorage(isYin ? "jstsfensui_yin" : "jstsfensui_yang", 0);
							const next = player.chooseTarget(get.prompt(event.skill));
							if (isYin) {
								next.set("prompt2", option === 0 ? "令一名角色受到一点伤害然后回复两点体力" : "令一名角色受到两点伤害然后回复一点体力");
							} else {
								next.set("prompt2", option === 0 ? "令一名角色摸两张牌并弃置一张牌" : "令一名角色摸一张牌并弃置两张牌");
							}
							next.set("ai", target => {
								const player = get.player();
								const isYin = player.storage.jstsfensui;
								const option = player.getStorage(isYin ? "jstsfensui_yin" : "jstsfensui_yang", 0);
								const attitude = get.attitude(player, target);
								if (!isYin) {
									if (option === 0) {
										return attitude > 0 ? attitude + Math.random() : -1;
									}
									return attitude < 0 ? -attitude + Math.random() : -1;
								}
								if (option === 0) {
									if (attitude > 0 && target.getHp() < target.maxHp && target.getHp() > 1) {
										return 20 + attitude;
									}
									if (attitude < 0 && target.getHp() === 1) {
										return 10 - attitude;
									}
									return 1 + attitude;
								}
								if (attitude < 0) {
									return -attitude + (target.maxHp - target.getHp()) * 100;
								}
								return -1;
							});
							event.result = await next.forResult();
						},
						async content(event, trigger, player) {
							game.playSkillBgm("jsts");
							const isYin = player.storage.jstsfensui;
							const key = isYin ? "jstsfensui_yin" : "jstsfensui_yang";
							const option = player.getStorage(key, 0);
							player.setStorage(key, 1 - option);
							player.changeZhuanhuanji(event.name);
							player.changeSkin("jstsfensui", player.storage.jstsfensui ? "杰斯提斯-粉碎" : "杰斯提斯");
							const target = event.targets[0];
							if (isYin) {
								await target.damage(option === 0 ? 1 : 2);
								if (target.isIn()) {
									await target.recover(option === 0 ? 2 : 1);
								}
							} else {
								await target.draw(option === 0 ? 2 : 1);
								if (target.isIn()) {
									await target.chooseToDiscard("he", option === 0 ? 1 : 2, true);
								}
							}
						},
						ai: {
							order: 10,
							result: {
								player(player) {
									return 1;
								},
							},
						},
					},
					hqchigui: {
						trigger: {
							global: ["loseHpAfter", "loseMaxHpAfter", "damageEnd", "linkAfter", "turnOverAfter", "discardAfter", "phaseDrawSkipped", "phaseUseSkipped"],
						},
						filter(event, player) {
							if (player.countMark("hqchigui") >= 9) return false;
							if (event.player === player) return false;
							if (event._hqchigui) return false;
							if (event.name === "loseHp") return true;
							if (event.name === "loseMaxHp") return true;
							if (event.name === "damage") return event.nature === "fire" || event.nature === "thunder";
							if (event.name === "link") return event.player.isLinked();
							if (event.name === "turnOver") return event.player.isTurnedOver();
							if (event.name === "discard") return event.cards?.length > 0;
							if (event.name === "phaseDraw" || event.name === "phaseUse") return true;
							return false;
						},
						forced: true,
						async content(event, trigger, player) {
							const target = trigger.player;
							if (!target) return;
							trigger._hqchigui = true;
							let num = 1;
							if (trigger.name === "loseHp" || trigger.name === "loseMaxHp") {
								num = trigger.num || 1;
							} else if (trigger.name === "damage") {
								num = trigger.num || 1;
							} else if (trigger.name === "discard") {
								num = trigger.cards?.length || 1;
							}
							const current = player.countMark("hqchigui");
							const maxAdd = 9 - current;
							if (maxAdd <= 0) return;
							player.addMark("hqchigui", Math.min(num, maxAdd));
						},
						mark: true,
						marktext: "梦",
						intro: {
							name: "残梦",
							content: "mark",
						},
						group: ["hqchigui_init", "hqchigui_phaseUse"],
						subSkill: {
							init: {
								audio: ["ext:无名扩展/audio/skill/chigui1"],
								trigger: {
									global: "phaseBefore",
									player: "enterGame",
								},
								forced: true,
								filter(event, player) {
									if (player.hasMark("hqchigui")) return false;
									return event.name !== "phase" || game.phaseNumber === 0;
								},
								async content(event, trigger, player) {
									player.addMark("hqchigui", 5);
								},
							},
							phaseUse: {
								audio: ["ext:无名扩展/audio/skill/chigui2", "ext:无名扩展/audio/skill/chigui3"],
								trigger: {
									player: "phaseUseBegin",
								},
								async content(event, trigger, player) {
									const result = await player
										.chooseTarget("赤鬼：选择一名其他角色执行一项负面效果", true, (card, player, target) => player !== target)
										.set("ai", target => (get.attitude(player, target) < 0 ? 1 : 0))
										.forResult();
									const target = result.targets[0];
									if (!player.storage.hqchigui_usedChoices) player.storage.hqchigui_usedChoices = [];
									const allOptions = [
										["skipDraw", "跳过下一个摸牌阶段"],
										["skipUse", "跳过下一个出牌阶段"],
										["loseHp", "失去1点体力"],
										["loseMaxHp", "失去1点体力上限"],
										["fireDamage", "受到一点火焰伤害"],
										["thunderDamage", "受到一点雷电伤害"],
										["link", "进入连环状态"],
										["turnOver", "武将牌翻至背面"],
										["discard", "随机弃置一张牌"],
									];
									let list = allOptions.filter(([choice]) => {
										if (player.storage.hqchigui_usedChoices.includes(choice)) return false;
										switch (choice) {
											case "skipDraw":
												return !target.hasSkill("hqchigui_skipDraw");
											case "skipUse":
												return !target.hasSkill("hqchigui_skipUse");
											case "link":
												return !target.isLinked();
											case "turnOver":
												return !target.isTurnedOver();
											case "discard":
												return target.countCards("he") > 0;
											default:
												return true;
										}
									});
									if (!list.length) {
										player.storage.hqchigui_usedChoices = [];
										list = allOptions.filter(([choice]) => {
											switch (choice) {
												case "skipDraw":
													return !target.hasSkill("hqchigui_skipDraw");
												case "skipUse":
													return !target.hasSkill("hqchigui_skipUse");
												case "link":
													return !target.isLinked();
												case "turnOver":
													return !target.isTurnedOver();
												case "discard":
													return target.countCards("he") > 0;
												default:
													return true;
											}
										});
										if (!list.length) return;
									}
									const choiceResult = await player
										.chooseButton(["赤鬼：选择一项负面效果", [list, "textbutton"]])
										.set("ai", button => {
											const c = button.link;
											if (["skipUse", "turnOver"].includes(c)) return 8;
											if (["skipDraw", "loseMaxHp"].includes(c)) return 6;
											if (["loseHp", "fireDamage", "thunderDamage"].includes(c)) return 4;
											if (["link", "discard"].includes(c)) return 2;
											return 1;
										})
										.forResult();
									if (!choiceResult?.links?.length) return;
									const choice = choiceResult.links[0];
									player.storage.hqchigui_usedChoices.push(choice);
									switch (choice) {
										case "skipDraw":
											target.addSkill("hqchigui_skipDraw");
											game.log(player, "令", target, "跳过下一个摸牌阶段");
											break;
										case "skipUse":
											target.addSkill("hqchigui_skipUse");
											game.log(player, "令", target, "跳过下一个出牌阶段");
											break;
										case "loseHp":
											await target.loseHp();
											break;
										case "loseMaxHp":
											await target.loseMaxHp();
											break;
										case "fireDamage":
											await target.damage(1, "fire", player);
											break;
										case "thunderDamage":
											await target.damage(1, "thunder", player);
											break;
										case "link":
											await target.link();
											break;
										case "turnOver":
											await target.turnOver();
											break;
										case "discard":
											await target.discard(target.getCards("he").randomGets(1));
											break;
									}
								},
							},
							skipDraw: {
								trigger: {
									player: "phaseDrawBefore",
								},
								forced: true,
								popup: false,
								silent: true,
								charlotte: true,
								async content(event, trigger, player) {
									trigger.cancel();
									player.removeSkill("hqchigui_skipDraw");
								},
								mark: true,
								marktext: "兵",
								intro: {
									content: "跳过下一个摸牌阶段",
								},
							},
							skipUse: {
								trigger: {
									player: "phaseUseBefore",
								},
								forced: true,
								popup: false,
								silent: true,
								charlotte: true,
								content(event, trigger, player) {
									trigger.cancel();
									player.removeSkill("hqchigui_skipUse");
								},
								mark: true,
								marktext: "乐",
								intro: {
									content: "跳过下一个出牌阶段",
								},
							},
						},
					},
					hqtize: {
						audio: ["ext:无名扩展/audio/skill/tize1"],
						skillAnimation: true,
						animationColor: "thunder",
						trigger: {
							global: "phaseEnd",
						},
						filter(event, player) {
							return player.countMark("hqchigui") >= 9;
						},
						direct: true,
						async content(event, trigger, player) {
							const activateResult = await player
								.chooseBool("啼泽：是否移除所有“残梦”标记并发动技能？")
								.set("ai", () => true)
								.forResult();
							if (!activateResult.bool) return;
							player.logSkill("hqtize");
							const count = player.countMark("hqchigui");
							player.removeMark("hqchigui", count);
							player.changeSkin("hqtize", "黄泉-啼泽");
							for (let i = 0; i < 3; i++) {
								const result = await player
									.chooseTarget({
										forced: true,
										prompt: "啼泽：选择第" + (i + 1) + "张雷【杀】的目标",
										filterTarget(card, player, target) {
											return (
												player != target &&
												lib.filter.targetEnabled(
													{
														name: "sha",
														nature: "thunder",
													},
													player,
													target
												)
											);
										},
										ai(target) {
											return get.effect(
												target,
												{
													name: "sha",
													nature: "thunder",
												},
												player,
												player
											);
										},
									})
									.forResult();
								if (!result.bool || !result.targets?.length) break;
								const target = result.targets[0];
								const card = {
									name: "sha",
									nature: "thunder",
									isCard: false,
								};
								game.log(player, "视为对", target, "使用了一张雷【杀】");
								const next = player.useCard(card, target, false);
								next.addCount = false;
								next.nodistance = true;
								await next;
							}
							const result = await player
								.chooseTarget({
									forced: true,
									prompt: "啼泽：视为使用一张指定任意名角色的雷【杀】",
									selectTarget: [1, game.countPlayer(current => current !== player)],
									filterTarget(card, player, target) {
										return (
											player != target &&
											lib.filter.targetEnabled(
												{
													name: "sha",
													nature: "thunder",
												},
												player,
												target
											)
										);
									},
									ai(target) {
										return get.effect(
											target,
											{
												name: "sha",
												nature: "thunder",
											},
											player,
											player
										);
									},
								})
								.forResult();
							game.playAudio("ext:无名扩展/audio/skill/tize2.mp3");
							if (result.bool && result.targets?.length) {
								const card = {
									name: "sha",
									nature: "thunder",
									isCard: false,
								};
								const next = player.useCard(card, result.targets, false);
								next.addCount = false;
								next.nodistance = true;
								await next;
							}
							player.changeSkin("hqtize", "黄泉");
						},
						ai: {
							combo: "hqchigui",
							order: 10,
							result: {
								player(player) {
									return 1;
								},
							},
						},
					},
					wsgucheng: {
						audio: ["ext:无名扩展/audio/skill/gucheng.mp3"],
						trigger: {
							player: ["recoverBefore", "gainBefore"],
						},
						forced: true,
						firstDo: true,
						filter(event, player) {
							if (event.name === "recover" || event.name === "gain") {
								return event.source && event.source !== player;
							}
						},
						async content(event, trigger) {
							trigger.cancel();
							game.log(trigger.player, "的", "#g【孤承】", "生效，取消了", trigger.name);
						},
						ai: {
							effect: {
								target(card, player, target) {
									if (target.hasSkill("wsgucheng")) {
										if (get.tag(card, "recover")) return "zeroplayertarget";
										if (get.tag(card, "gain")) return "zeroplayertarget";
									}
								},
							},
						},
					},
					wsgeshi: {
						audio: ["ext:无名扩展/audio/skill/geshi.mp3"],
						forced: true,
						trigger: {
							global: "phaseEnd",
						},
						filter(event, player) {
							return (!player.hasHistory("damage"));
						},
						async content(event, trigger, player) {
							player.addMark("wsgeshi", 1);
						},
						group: ["wsgeshi_turn"],
						subSkill: {
							turn: {
								trigger: { player: "phaseBegin" },
								forced: true,
								filter(event, player) {
									return player.countMark("wsgeshi") > 0;
								},
								async content(event, trigger, player) {
									const count = player.countMark("wsgeshi");
									player.removeMark("wsgeshi", count);
									game.playSkillBgm("ws");
									await player.recover(count);
									const result = await player
										.chooseTarget(`隔世：选择一名其他角色造成${count}点伤害`, true, (card, player, target) => player !== target)
										.set("ai", target => (get.attitude(player, target) < 0 ? 1 : 0))
										.forResult();
									if (result.bool && result.targets?.length) {
										await result.targets[0].damage(count, "nosource", player);
									}
									await player.draw(count);
								},
							},
						},
						mark: true,
						marktext: "世",
						intro: {
							name: "世",
							content: "mark",
						},
					},
					adkoudai: {
						group: ["adkoudai_damage", "adkoudai_damaged"],
						subSkill: {
							damage: {
								usable: 1,
								trigger: { source: "damageBegin1" },
								filter(event, player) {
									return event.player && event.player !== player && event.num > 0;
								},
								async cost(event, trigger, player) {
									event.result = await player
										.chooseBool("光晕：是否令此伤害+1？")
										.set("ai", () => (get.attitude(player, trigger.player) < 0 ? 1 : 0))
										.forResult();
								},
								async content(event, trigger, player) {
									trigger.num++;
									game.playSkillBgm("ad");
								},
							},
							damaged: {
								usable: 1,
								trigger: { player: "damageBegin3" },
								filter(event, player) {
									return event.num > 0;
								},
								async cost(event, trigger, player) {
									event.result = await player
										.chooseBool("光晕：是否令此伤害-1？")
										.set("ai", () => 1)
										.forResult();
								},
								async content(event, trigger, player) {
									trigger.num--;
									game.playSkillBgm("ad");
								},
							},
						},
					},
					adquanneng: {
						group: ["adquanneng_clear"],
						trigger: { player: "useCard" },
						direct: true,
						filter(event, player) {
							const used = player.getStorage("adquanneng_used", {});
							return game.hasPlayer(current => {
								const pid = current.playerid;
								if (!(used.draw || []).includes(pid)) return true;
								if (!(used.recover || []).includes(pid) && current.hp < current.maxHp) return true;
								if (!(used.turnOver || []).includes(pid) && (current.isTurnedOver() || current.isLinked())) return true;
								return false;
							});
						},
						async content(event, trigger, player) {
							const used = player.getStorage("adquanneng_used", {});
							const result = await player
								.chooseTarget("全能：是否令一名角色执行一项效果？", (card, player, target) => {
									const used = player.getStorage("adquanneng_used", {});
									const pid = target.playerid;
									if (!(used.draw || []).includes(pid)) return true;
									if (!(used.recover || []).includes(pid) && target.hp < target.maxHp) return true;
									if (!(used.turnOver || []).includes(pid) && (target.isTurnedOver() || target.isLinked())) return true;
									return false;
								})
								.set("ai", target => {
									if (get.attitude(player, target) <= 0) return 0;
									const used = player.getStorage("adquanneng_used", {});
									const pid = target.playerid;
									let num = 1;
									if (!(used.draw || []).includes(pid)) num++;
									if (!(used.recover || []).includes(pid) && target.hp < target.maxHp) num++;
									if (!(used.turnOver || []).includes(pid) && (target.isTurnedOver() || target.isLinked())) num++;
									return num;
								})
								.forResult();
							if (!result.bool || !result.targets?.length) return;
							const target = result.targets[0];
							const pid = target.playerid;
							const choiceMap = [
								["recover", "回复1点体力"],
								["draw", "摸两张牌"],
								["turnOver", "重置武将牌"],
							];
							const valid = choiceMap.filter(([key]) => {
								if ((used[key] || []).includes(pid)) return false;
								if (key === "recover") return target.hp < target.maxHp;
								if (key === "turnOver") return target.isTurnedOver() || target.isLinked();
								return true;
							});
							if (!valid.length) return;
							const control = await player
								.chooseControl(valid.map(v => v[1]))
								.set("prompt", `全能：令${get.translation(target)}执行一项`)
								.set("ai", () => {
									if (valid.some(v => v[0] === "turnOver")) return valid.findIndex(v => v[0] === "turnOver");
									if (valid.some(v => v[0] === "recover")) return valid.findIndex(v => v[0] === "recover");
									return 0;
								})
								.forResult();
							const chosen = valid.find(v => v[1] === control.control);
							if (!chosen) return;
							player.logSkill("adquanneng", target);
							game.playSkillBgm("ad");
							const used2 = player.getStorage("adquanneng_used", {});
							if (!Array.isArray(used2[chosen[0]])) used2[chosen[0]] = [];
							used2[chosen[0]].push(pid);
							player.setStorage("adquanneng_used", used2);
							if (chosen[0] === "recover") await target.recover();
							else if (chosen[0] === "draw") await target.draw(2);
							else if (chosen[0] === "turnOver") {
								if (target.isTurnedOver()) await target.turnOver();
								if (target.isLinked()) await target.link();
							}
						},
						subSkill: {
							clear: {
								charlotte: true,
								forced: true,
								trigger: { global: "phaseAfter" },
								filter(event, player) {
									const used = player.getStorage("adquanneng_used", {});
									return used && typeof used === "object" && Object.keys(used).length > 0;
								},
								async content(event, trigger, player) {
									player.setStorage("adquanneng_used", {});
								},
							},
						},
					},
					adjinghua: {
						chargeSkill: Infinity,
						group: ["adjinghua_get"],
						enable: "phaseUse",
						direct: true,
						filter(event, player) {
							return player.countCharge() >= 3;
						},
						async content(event, trigger, player) {
							const targetResult = await player
								.chooseTarget("净化：是否消耗3点蓄力点，令一名角色重置所有技能？", (card, from, target) => true)
								.set("ai", target => {
									const p = _status.event.player;
									const att = get.attitude(p, target);
									const hasMarks = Object.keys(target.storage).some(key => {
										const v = target.storage[key];
										return (typeof v === "number" && v > 0) || (Array.isArray(v) && v.length > 0);
									});
									const hasExileCards = target.countCards("x") > 0;
									const hasLimited = target.getSkills().some(skill => {
										const info = get.info(skill);
										return info && info.limited;
									});
									if (att < 0 && (hasMarks || hasExileCards)) {
										return 15;
									}
									if (target === p || (att >= 0 && hasLimited)) {
										return 10;
									}
									return 1;
								})
								.forResult();
							if (!targetResult.bool || !targetResult.targets?.length) {
								delete player.getStat("skill").adjinghua;
								return;
							}
							player.removeCharge(3);
							player.logSkill("adjinghua", targetResult.targets[0]);
							const target = targetResult.targets[0];
							player.line(target);
							const removeSkills = target.getSkills(null, false, false).filter(i => {
								const info = get.info(i);
								return !info || !info.charlotte;
							});
							if (removeSkills.length) {
								target.removeSkill(removeSkills);
							}
							const gainSkills = target.getStockSkills(true, true).filter(i => {
								const info = get.info(i);
								return info && !info.charlotte && (!info.zhuSkill || target.isZhu2());
							});
							if (gainSkills.length) {
								Object.keys(target.storage)
									.filter(i => gainSkills.some(skill => i.startsWith(skill)))
									.forEach(storage => delete target.storage[storage]);
								target.addSkill(gainSkills);
								const suffixs = ["used", "round", "block", "blocker"];
								for (const skill of game.expandSkills(gainSkills)) {
									const info = get.info(skill);
									if (info.usable !== undefined) {
										if (typeof target.getStat("triggerSkill")[skill] === "number" && target.getStat("triggerSkill")[skill] >= 1) {
											delete target.getStat("triggerSkill")[skill];
										}
										if (typeof target.getStat("skill")[skill] === "number" && target.getStat("skill")[skill] >= 1) {
											delete target.getStat("skill")[skill];
										}
									}
									if (info.round && target.storage[skill + "_roundcount"]) {
										delete target.storage[skill + "_roundcount"];
									}
									if (target.storage[`temp_ban_${skill}`]) {
										delete target.storage[`temp_ban_${skill}`];
									}
									if (target.awakenedSkills.includes(skill)) {
										target.restoreSkill(skill);
									}
									for (const suffix of suffixs) {
										if (target.hasSkill(skill + "_" + suffix)) {
											target.removeSkill(skill + "_" + suffix);
										}
									}
								}
							}
						},
						ai: {
							order: 9,
							result: {
								player(player) {
									return 1;
								},
							},
						},
						subSkill: {
							get: {
								forced: true,
								locked: false,
								trigger: { global: ["drawAfter", "recoverEnd", "turnOverAfter", "linkAfter"] },
								filter(event, player) {
									if (event.name === "turnOver" && event.player.isTurnedOver()) return false;
									if (event.name === "link" && event.player.isLinked()) return false;
									return true;
								},
								async content(event, trigger, player) {
									player.addCharge(1);
								},
							},
						},
					},
					astlqiuyv: {
						dutySkill: true,
						derivation: ["astlgongjin", "leofenzhan"],
						mark: true,
						marktext: "囚",
						intro: {
							name: "囚",
							content: "mark",
						},
						mod: {
							globalFrom(from, to, distance) {
								return distance + from.countMark("astlqiuyv");
							},
							globalTo(from, to, distance) {
								return distance + to.countMark("astlqiuyv");
							},
						},
						group: ["astlqiuyv_gain", "astlqiuyv_remove", "astlqiuyv_achieve"],
						subSkill: {
							gain: {
								trigger: { global: "gameStart" },
								forced: true,
								async content(event, trigger, player) {
									const num = game.countPlayer();
									player.addMark("astlqiuyv", num);
								},
							},
							remove: {
								trigger: { global: "useCardToTargeted" },
								forced: true,
								filter(event, player) {
									return event.target !== player && player.countMark("astlqiuyv") > 0;
								},
								async content(event, trigger, player) {
									player.removeMark("astlqiuyv", 1);
								},
							},
							achieve: {
								trigger: { player: "phaseBegin" },
								forced: true,
								skillAnimation: true,
								animationColor: "gold",
								filter(event, player) {
									return player.countMark("astlqiuyv") === 0;
								},
								async content(event, trigger, player) {
									await player.awakenSkill("astlqiuyv");
									await player.addSkills(["astlgongjin"]);
								},
							},
						},
					},
					astlgongjin: {
						enable: "phaseUse",
						limited: true,
						skillAnimation: true,
						animationColor: "gold",
						filterTarget(card, player, target) {
							return target !== player && target.isIn();
						},
						selectTarget: 1,
						async content(event, trigger, player) {
							const target = event.target;
							player.line(target);
							player.addSkills("astlgongjin_link");
							target.addSkills("astlgongjin_link");
							player.markAuto("astlgongjin_link", [target]);
							target.markAuto("astlgongjin_link", [player]);
							player.awakenSkill("astlgongjin");	
						},
						ai: {
							order: 10,
							result: {
								target(player, target) {
									return get.attitude(player, target) > 0 ? 3 : 0;
								},
							},
						},
						subSkill: {
							link: {
								charlotte: true,
								mark: true,
								marktext: "共",
								intro: {
									name: "共进",
									content(storage, player) {
										const brothers = (storage || []).filter(current => current && current.isIn());
										return "与" + brothers.map(current => get.translation(current)).join("、") + "结为兄弟";
									},
								},
								group: ["astlgongjin_damage", "astlgongjin_draw"],
							},
							damage: {
								trigger: { player: "damageBegin4" },
								direct: true,
								filter(event, player) {
									if (event._astlgongjin || event.num <= 0) return false;
									return (player.getStorage("astlgongjin_link") || []).some(brother => brother && brother.isIn());
								},
								async content(event, trigger, player) {
									const brother = (player.getStorage("astlgongjin_link") || []).find(brother => brother && brother.isIn());
									if (!brother) return;
									const result = await brother
										.chooseBool(`共进：是否改为由你受到这${get.cnNumber(trigger.num)}点伤害？`)
										.set("ai", () => {
											return get.attitude(brother, player) > 0 && ((brother.hp > trigger.num + 1) || brother.hp <= 1) ? 1 : 0;
										})
										.forResult();
									if (result.bool) {
										trigger._astlgongjin = true;
										trigger.player = brother;
										game.log(brother, "改为了此伤害的目标");
									}
								},
							},
							draw: {
								trigger: { player: "drawBegin" },
								forced: true,
								popup: false,
								filter(event, player) {
									if (event.gongjin || event.num <= 0) return false;
									if (event.getParent("phaseDraw").name == "phaseDraw") return false;
									return (player.getStorage("astlgongjin_link") || []).some(brother => brother && brother.isIn());
								},
								async content(event, trigger, player) {
									const brother = (player.getStorage("astlgongjin_link") || []).find(brother => brother && brother.isIn());
									if (!brother) return;
									const next = brother.draw(trigger.num);
									next.set("gongjin", true);
									await next;
								},
							},
						},
					},
				},
				translate: {
					plcmhuanjing: "幻境",
					plcmhuanjing_info: "任意一名角色进行判定前，你可以观看牌堆顶和牌堆底各一张牌，然后可以获得其中一张，将另一张置于另一端。",
					plcmlengjing: "棱镜",
					plcmlengjing_info: "当你成为伤害类牌的目标时/使用非伤害类牌时，你可以进行判定：若判定花色与该牌相同，取消之/此牌无法被响应。",
					plcmjinghua: "晶化",
					plcmjinghua_info: "其他角色未响应你对其使用的牌后，你选择一项：1.展示其手牌并获得与此牌花色相同的手牌和装备牌；2.直到其下个回合结束，其无法使用此花色的牌。",
					hjmhaqi: "哈气",
					hjmhaqi_info: "锁定技，当任意角色造成或受到伤害后，你依次执行等量项：摸一张牌、摸牌阶段摸牌数+1、回复1点体力、体力上限+1、出牌阶段使用【杀】的次数上限+1、手牌上限+1。",
					myjuesheng: "决生",
					myjuesheng_info: "当你使用或打出一张牌后，若你未记录过此牌牌名，你记录之并摸一张牌；每回合每个牌名限一次，你可以视为使用或打出一张你记录过的牌。",
					mbmanbo: "曼波",
					mbmanbo_info: "锁定技，每轮开始或结束、或你受到伤害后，你随机抽取三名未登场角色，选择其中一名角色并获得其一个技能。",
					aplxiongye: "雄野",
					aplxiongye_info: "锁定技，当你对其他角色造成伤害时，或其他角色对你造成伤害时，你将牌堆顶的3X张牌扣置于你的武将牌上（X为伤害数），称为“野”；你可以将“野”当做手牌使用或打出。",
					aplaojie: "傲节",
					aplaojie_info: "锁定技，你无法使用或打出【闪】。",
					tbznengchi: "能吃",
					tbznengchi_info: "锁定技，当你装备装备牌后，你视为始终拥有该装备效果；出牌阶段开始时，你从牌堆或弃牌堆随机获得三张装备牌。",
					hjcsuixin: "随心",
					hjcsuixin_info: "任意角色回合开始或结束时，你可以观看牌堆顶的X+1张牌（X为存活人数），获得其中一张牌，并将其余牌以任意顺序置于牌堆顶或牌堆底。",
					nkssjicheng: "继承",
					nkssjicheng_info: "当你造成伤害后，或出牌阶段开始时，若以下技能你未全部获得，你获得第一个未获得的技能：" + get.poptip("nksslingyu") + "，" + get.poptip("nkssguangshi") + "，并增加一点体力上限，回复一点体力，摸一张牌。当你死亡时，你可以令一名其他角色获得" + get.poptip("nkssjicheng") + "和你因此获得的技能。",
					nksslingyu: "领域",
					nksslingyu_info: "出牌阶段限一次，你可以选择任意名其他角色，令其获得“美塔”标记。若场上有“美塔”：你对有“美塔”的角色使用牌无次数限制，且你们之间的距离视为1；有“美塔”的角色受到的伤害+1，其摸牌时摸牌数-1；你与有“美塔”的角色使用牌只能指定你们为目标；没有“美塔”的其他角色使用牌只能指定没有“美塔”的其他角色为目标。你的回合开始时，移除场上所有的“美塔”。",
					nkssguangshi: "光矢",
					nkssguangshi_info: "当你使用牌后，你获得一枚“矢”标记（至多两枚）。出牌阶段限一次，你可以弃置所有“矢”标记，视为使用一张伤害数等同于弃置标记数的【杀】。",
					ffshenqu: "神躯",
					ffshenqu_info: "锁定技，当你死亡时，你回复体力上限和体力值至3。",
					ffshenpan: "审判",
					ffshenpan_achieve: "赦免",
					ffshenpan_fail: "死刑",
					ffshenpan_info: "使命技，当一名角色使用含另一名角色为目标的牌结算结束后，你将此牌和其响应的牌扣置于武将牌上，称为“律偿”牌。每轮结束时，你将牌堆顶X张牌置入“律偿”牌内，然后你令从你开始的玩家依次获得一张“律偿”牌。当你获得或失去“律偿”牌后，你获得同变化点数数量的“舞”标记。<br>成功：每轮开始时，若“舞”标记数至少五百枚，或你对所有角色使用过牌，你失去" + get.poptip("ffduwu") + "和" + get.poptip("ffshenqu") + "，获得" + get.poptip("ffsongshi") + "。<br>失败：任意角色回合结束后，若其他角色均对你使用过牌，你失去" + get.poptip("ffshenqu") + "，获得" + get.poptip("ffguqi") + "。",
					ffduwu: "独舞",
					ffduwu_info: "锁定技，任意角色回合结束后，你观看牌堆顶Y张牌（Y为“律偿”牌数，且至少为1），然后使用或获得其中一张牌（无距离限制，只能使用非伤害类牌）。",
					ffsongshi: "颂诗",
					ffsongshi_info: "一名角色的准备阶段，你可以交给其一张“律偿”牌并将牌堆顶一张牌置入“律偿”牌中，其使用这张牌造成的伤害+1，回复一点体力，无距离限制，使用或打出后你与其各摸两张牌。",
					ffguqi: "孤泣",
					ffguqi_info: "锁定技，回合开始时，你依次使用和获得所有”律偿“牌（无距离和次数限制），然后死亡。",
					lyshishang: "失熵",
					lyshishang_info: "锁定技，回合结束时，若你的体力值等于体力上限，你失去一点体力，否则减少一点体力上限。",
					lyranjin: "燃烬",
					lyranjin_info: "转换技，出牌阶段限一次，阳：你可以失去X点体力（X为体力上限的一半，向下取整，且至多失去体力值至1），然后对一名其他角色造成一点火焰伤害；阴：你可以将X张牌当作无距离和次数限制的火【杀】使用，若此【杀】造成了伤害，你回复X点体力。当你造成火焰伤害后，此技能视为未发动过。",
					lyyuhuo: "浴火",
					lyyuhuo_info: "当你使用【杀】时，你可以选择Y项（Y为你已损失的体力值，且至少为1）：①弃置目标的一张牌。②你摸一张牌。③此【杀】无视防具。④若其受到此【杀】伤害时没有手牌，此伤害+1。⑤此【杀】造成伤害后，你回复1点体力。",
					dlhchizhuo: "炽灼",
					dlhchizhuo_info: "当一名角色成为非【闪电】的伤害类牌的目标时，你可以令其将一个区域内的牌扣置于武将牌上，其因此受到的伤害+1，且其受到此牌造成的伤害后或回合结束时，其获得扣置的这些牌。若其因此死亡，你将这些扣置的牌分配给任意角色。",
					wgryanzhao: "焰炤",
					wgryanzhao_info: "一名角色准备阶段或结束阶段，你可以令其从牌堆或弃牌堆中使用一张伤害牌。若此牌造成伤害，其摸两张牌；若造成属性伤害，其回复一点体力。",
					lszhuoyan: "灼焉",
					lszhuoyan_info: "蓄力技（3/5），出牌阶段限一次，你可以消耗任意点蓄力点并执行对应效果：不小于1，对一名角色造成一点火焰伤害；不小于2，令至多两名角色回复两点体力；不小于3，令至多三名角色各摸三张牌；不小于4，至多移动场上的四张牌；等于5，至多令五名角色弃置区域内所有牌并摸等量的牌。",
					lsfenyun: "氛氲",
					lsfenyun_info: "当一名角色造成至少两点伤害或火焰伤害后，你获得一点蓄力点。出牌阶段，你可以弃置一张伤害牌，然后获得一点蓄力点。",
					mcpxingshang: "行殇",
					mcpxingshang_info: "①当一名角色受到伤害后（每回合限一次）或死亡时，你获得2个“颂”标记（你至多拥有9个“颂”标记）。②出牌阶段限两次，你可以：1.移去2个“颂”标记，令一名角色复原武将牌；2.移去2个“颂”标记，令一名角色摸X张牌（X为场上死亡角色数，且X至少为2，至多为5）；3.移去5个“颂”标记，令一名体力上限小于10的角色回复1点体力，增加1点体力上限，随机恢复一个已废除的装备栏；4.移去5个“颂”标记，获得一名阵亡角色武将牌上的所有技能，然后你失去〖行殇〗〖放逐〗〖颂威〗。",
					mcpfangzhu: "放逐",
					mcpfangzhu_info: "出牌阶段限一次，你可以：1.移去1个“颂”标记，令一名其他角色于手牌中只能使用基本牌直到其回合结束；2.移去2个“颂”标记，令一名其他角色于手牌中只能使用锦囊牌直到其回合结束。3.移去3个“颂”标记，令一名其他角色于手牌中只能使用装备牌直到其回合结束；4.移去2个“颂”标记，令一名其他角色的非Charlotte技能失效直到其回合结束；5.移去2个“颂”标记，令一名其他角色不能响应除其以外的角色使用的牌直到其回合结束；6.移去3个“颂”标记，令一名其他角色将武将牌翻面；",
					mcpsongwei: "颂威",
					mcpsongwei_info: "主公技。①出牌阶段开始时，你获得Y个“颂”标记（Y为场上其他魏势力角色数的两倍）。②每局游戏限一次，你可以令一名其他魏势力角色失去武将牌上的所有技能。",
					nwlthailang: "骇浪",
					nwlthailang_info: "你的攻击范围+1。当你使用牌时，你可以失去一点体力（若不小于体力上限的一半则跳过，向上取整），额外指定任意名角色为目标（无视距离）。",
					nwltgongzheng: "公正",
					nwltgongzheng_info: "锁定技，当一名角色于其回合内首次使用一种颜色的牌后，你亮出牌堆顶两张牌并选择一项：①令其获得与本次使用颜色相同的牌，你获得剩下的牌。②其受到一点伤害，获得这些牌。③其回复一点体力，你获得这些牌。",
					nwltjuecai: "决裁",
					nwltjuecai_info: "一名角色回合结束时，若本回合有至少五张牌进入弃牌堆，你获得一枚“偿”标记。出牌阶段限一次，你可以弃置任意枚“偿”标记，令你下一次使用牌额外结算等量次。",
					atzfzhenli: "真力",
					atzfzhenli_info: "锁定技，当你手牌数少于体力上限时，你将手牌摸至体力上限。你使用牌无距离限制。",
					atzfchiyuan: "驰援",
					atzfchiyuan_info: "出牌阶段限一次，你可以将任意张手牌交给一名其他角色。",
					alqnhuahui: "化灰",
					alqnhuahui_info: "回合开始时，你可以指定任意名其他角色获得“血偿”标记并获得等量枚“命契”标记（每轮限获得三枚“命契”标记，至多拥有四枚）。当你对有“血偿”标记的角色使用牌后，移除其“血偿”标记。每轮游戏结束时，移除场上所有的“血偿”标记。每有一枚“命契”标记被移除，你获得一个“命契”标记并摸一张牌。",
					alqnzhanshou: "斩首",
					alqnzhanshou_info: "有“血偿”标记的角色无法响应你的牌。当你造成伤害时，你可以令此伤害+X并改为火焰伤害（X为“命契”标记数），然后弃置一枚“命契”。",
					alqneyue: "厄月",
					alqneyue_info: "你只能通过" + get.poptip("alqneyue") + "回复体力。每轮限一次，出牌阶段或当你进入濒死状态时，你可以弃置所有的“命契”标记X，摸等量的牌，回复X+1点体力并重置" + get.poptip("alqnhuahui") + "。",
					zgnxiezou: "协奏",
					zgnxiezou_info: "每轮限一次，出牌阶段，你可以指定至少一名其他角色，结束此阶段并令这些角色依次执行一个额外的回合，且这些角色于此额外回合内每对一名其他角色使用伤害类牌后，你可以视为使用一张普通【杀】；这些角色执行完额外回合后，你弃置判定区的牌并执行一个额外的回合。",
					skkjimie: "寂灭",
					skkjimie_info: "出牌阶段开始时，你获得五枚“裂隙”标记，然后你可以选择一项：极恶技·闪：若你有“裂隙”标记，本回合你使用牌无次数限制，且使用后摸两张牌并移除一枚“裂隙”标记。极恶技·灭：移除所有的“裂隙”标记，并对一名其他角色造成X/2点伤害并摸X张牌（X为“裂隙”标记数，结果向上取整）。",
					skkduduan: "渡断",
					skkduduan_info: "当一名角色对一名非玩家的其他角色使用牌后，若目标角色未响应，你获得一枚“裂隙”标记（每回合至多因此获得三枚，至多拥有十枚）。",
					ylshanshuo: "闪烁",
					ylshanshuo_info: "当你受到伤害后，你摸一张牌并可以将一张牌当作无距离限制，至多可指定三个目标的普通【杀】使用。",
					ylxiahe: "铗赫",
					ylxiahe_info: "当你造成伤害后，你摸等同伤害数的牌；当你每造成两点伤害后，你回复一点体力。",
					ylkanpo: "勘破",
					ylkanpo_info: "每轮限一次，其他角色回合开始时，你可以弃置任意张牌，展示牌堆顶两倍的牌以及其手牌，令其对你使用其中的【杀】和【决斗】；若你未因此受到伤害，你发动一次" + get.poptip("ylshanshuo") + "。",
					atzwxingmian: "星冕",
					atzwxingmian_info: "任意角色回合开始时，你可以弃置一张牌并视为使用一张你本轮未以此法使用过的牌（延时锦囊牌除外）。",
					atzwbuxi: "不息",
					atzwbuxi_info: "每回合限四次，当一名角色的体力值发生变化时，你可以选择一项：①令其摸X张牌（X为当前其体力值）。②选择一名角色A和另一名角色B，A摸一张牌，B弃置一张牌，若A手牌数小于B，你可以重新选择A，B并执行流程。③令其弃置X张牌（至少为二），然后回复一点体力。",
					xdanchao: "暗潮",
					xdanchao_info: "你登场时，死龙加入游戏并进入休整状态。每当一名除死龙外的角色体力值变化X点后，或有X张牌进入弃牌堆后：若死龙处于休整状态，你获得X枚“新蕊”标记（上限34枚）；若死龙在场上，则死龙回复X点体力（有牌进入弃牌堆不触发）。任意角色回合结束后，若“新蕊”标记达到上限，你令死龙结束休整并移除所有的“新蕊”标记。",
					xdyuejian: "月茧",
					xdyuejian_info: "每局游戏限一次，当一名角色进入濒死状态时，你可以令其回复体力至1，其下个回合结束时，失去回复的等量体力。",
					xdyoudie: "幽蝶",
					xdyoudie_info: "出牌阶段限一次，你可以令所有角色失去1点体力（1点体力则跳过），令你下一张伤害牌造成的伤害+1。",
					slyanxi: "焰息",
					slyanxi_info: "出牌阶段限四次，你可以选择对任意角色造成一点伤害，然后失去5+X点体力（X为场上存活角色数），。",
					slyinbi: "荫蔽",
					slyinbi_info: "当一名除死龙外的角色受到致命伤害后，你可以令此伤害减少Y点（Y为此伤害值-其体力值+1），然后你受到此伤害来源的5Y点伤害。",
					slhuiyi: "晦翼",
					slhuiyi_info: "锁定技，当你死亡时，你进入休整状态；你的三个回合结束后，你死亡。若遐蝶死亡，你死亡。",
					mbmkmingmen: "名门",
					mbmkmingmen_info: "一名角色回合开始时，你可以令其本回合摸牌只能摸指定类型的牌，并且你获得一张非此类型的牌。",
					sydjqiji: "祈冀",
					sydjqiji_info: "锁定技，任意角色回合结束后，你摸牌至两倍场上存活角色数；当你失去体力时，取消之。",
					sydjhuihuang: "辉煌",
					sydjhuihuang_info: "当你成为其他角色使用牌的目标时，若你未记录此牌名，记录并取消之；否则你可以弃置一张同类型的牌并取消之。回合开始时，你可以：①弃置2X张牌并减少X种记录过的牌名。②弃置两张牌，视为使用一张普通锦囊牌。",
					djsj: "水晶",
					djsj_info: "游戏开始时或获得此技能时，你获得" + get.poptip("djfuhe") + "。出牌阶段限三次，你可以：①失去" + get.poptip("djfuhe") + "，获得" + get.poptip("djqiangli") + "或" + get.poptip("djkongzhong") + "。②失去" + get.poptip("djqiangli") + "或" + get.poptip("djkongzhong") + "，获得" + get.poptip("djfuhe") + "。",
					djfuhe: "复合",
					djfuhe_info: "每回合限两次，你可以将一张手牌当作一张普通锦囊牌使用并摸一张牌。",
					djqiangli: "强力",
					djqiangli_info: "锁定技，你造成的伤害+1；其他角色只能使用相同花色的牌响应你使用的牌。",
					djkongzhong: "空中",
					djkongzhong_info: "锁定技，其他角色计算与你的距离+1，你计算与其他角色的距离-1；其他角色无法响应你的【杀】。",
					hadjheian: "黑暗",
					hadjheian_info: "锁定技，你摸牌改为从弃牌堆摸，使用或重铸后的牌改为置入牌堆底。",
					hadjanrong: "暗融",
					hadjanrong_discard: "暗融",
					hadjanrong_info: "锁定技，当你受到非红色【杀】造成的伤害后，你获得伤害来源的一个技能并增加一点体力上限。你可以如手牌般使用或打出弃牌堆底的X张牌（X为你的体力上限）。",
					hadjyihui: "熠辉",
					hadjyihui_info: "觉醒技，回合开始时，若你因" + get.poptip("hadjanrong") + "获得过至少三个技能，你回复一点体力并失去" + get.poptip("hadjanrong") + "，并将武将牌替换为”迪迦”。",
					sjyuzhi: "域知",
					sjyuzhi_info: "一名角色体力/手牌数不因" + get.poptip("sjzhanren") + "发生变化时，若其体力/手牌数小于等于1且你拥有" + get.poptip("sjzhanren") + "，你可以令其摸一张牌并对其发动" + get.poptip("sjzhanren") + "。",
					sjzhanren: "斩刃",
					sjzhanren_info: "出牌阶段限一次，你可以观看一名角色的手牌与牌堆顶等量的牌，然后你可以将其中任意张牌交换。若其手牌花色均不同/相同，你弃置其所有手牌/令其从牌堆底摸等量张牌；若其手牌数为1，则由你选择弃牌或摸牌。若其因此弃牌或摸牌，重置此技能发动次数。",
					xklkeyan: "科研",
					xklkeyan_info: "出牌阶段限一次，你可以观看牌堆顶的一张牌并猜测此牌花色和点数；若你至少猜对一项，你获得此牌且本回合此技能可发动次数加猜对项数，此牌不计入手牌上限，且使用此牌无次数与距离限制。",
					xkllizhu: "力助",
					xkllizhu_info: "一名角色获得标记时，你可以令此标记数+1。你的回合结束时，你可以令一名其他角色将一张本回合从你区域内进入弃牌区的装备牌置入其装备区中。",
					xklkeyan_nolimit: "无限制",
					ffshalong: "沙龙",
					ffshalong_info: "回合开始时，你可以转换此技能状态。出牌阶段限两次，荒：你可以令所有体力值大于上限一半的“沙龙成员”失去一点体力（向上取整），然后视为使用一张无距离限制，不计入次数且无次数限制的【杀】。芒：你可以令所有“沙龙成员”回复一点体力。",
					ffyuanwu: "圆舞",
					ffyuanwu_info: "当你造成伤害后，若" + get.poptip("ffshalong") + "状态为：荒：你可以令所有“沙龙成员”回复一点体力。当你回复体力后，若" + get.poptip("ffshalong") + "状态为：芒：你可以视为使用一张无距离限制，不计入次数且无次数限制的【杀】，此【杀】造成伤害后，你令所有“沙龙成员”失去一点体力。",
					ffyuanwu_huang: "圆舞-荒",
					ffyuanwu_mang: "圆舞-芒",
					ffkuanghuan: "狂欢",
					ffkuanghuan_info: "游戏开始时，你选择任意名角色（必须选择自己），令其获得“沙龙成员”标记。当“沙龙成员”体力值发生变化时，你获得等量枚“气氛”标记。每轮开始时，移除所有的“气氛”标记。“沙龙成员”根据“气氛”标记获得以下效果：至少4枚：使用牌无距离限制。至少8枚：出牌阶段使用【杀】次数上限+1。至少12枚：造成的伤害+1。",
					ffkuanghuan_member: "沙龙成员",
					ffkuanghuan_qifen: "气氛",
					ffkuanghuan_effect: "狂欢",
					jkshouzhuo: "手镯",
					jkshouzhuo_info: "回合内，你可以将黑牌当【杀】或【酒】使用或打出；回合外，红牌当【闪】或【无懈可击】使用或打出，并摸牌至体力上限。",
					jkjuedi: "绝地",
					jkjuedi_info: "锁定技，当场上仅剩三名角色时，直到你累计三个回合结束前，你跳过判定阶段和弃牌阶段，出牌阶段使用【杀】的次数上限+1，使用牌无距离限制，其他角色的所有技能失效。",
					jkjuedi_disabled: "这是杰克首次对战两只怪兽",
					atmnianli: "念力",
					atmnianli_info: "出牌阶段限一次，你可以失去一点体力并令一名其他角色受到一点伤害。",
					atmguanglun: "光轮",
					atmguanglun_info: "每回合每种牌名限一次，当你使用伤害牌后（【闪电】除外），你可以摸两张牌或回复一点体力，令此牌额外结算一次。出牌阶段各限一次，你可以视为使用一张【决斗】或【火攻】。",
					atmzhuangshuo: "壮硕",
					atmzhuangshuo_info: "锁定技，雷属性伤害对你无效。",
					qsklingjiang: "灵缰",
					qsklingjiang_info: "任意角色回合开始时或“追影”记录牌名数清空时，你随机添加“追影”牌名记录至6个（装备牌和延时锦囊牌除外）。你可以移去一个记录并视为使用一张对应的牌。",
					qsksuohun: "索魂",
					qsksuohun_info: "出牌阶段限一次，你可以移去所有“追影”记录，视为使用一张无距离和次数限制的任意【杀】。",
					mwkzhihuo: "织火",
					mwkzhihuo_info: "你的普通【杀】视为火【杀】。当你使用火【杀】指定其他角色为目标后，你可以选择一项：①令任意名其他角色进入连环状态。②令任意名其他角色本回合受到的火焰伤害+1。③令其上家或下家也成为此牌目标。",
					mwkfenyao: "焚曜",
					mwkfenyao_info: "其他角色回合开始时，你可以对其使用一张【杀】。",
					mwkfantian: "燔天",
					mwkfantian_info: "当一名角色造成伤害后，你获得等量+1枚“焚”标记（上限二十枚）并摸一张牌。出牌阶段限一次，你可以移除所有“焚”标记（至少十枚），对一名其他角色造成一半的火焰伤害（向下取整）。",
					xnnjuelie: "攫猎",
					xnnjuelie_info: "出牌阶段限三次，你可以随机亮出牌堆内的一张牌，根据对应类型令一名角色执行对应效果：山艮（装备牌）：随机其他角色对其使用一张【杀】；水坎（闪桃酒）：回复一点体力；火离（杀）：受到一点无来源火焰伤害；冰华（伤害类锦囊）：随机弃置一到三张牌；雷震（非伤害类锦囊）：摸两张牌。",
					xnnduancui: "锻淬",
					xnnduancui_info: "出牌阶段限三次，你可以随机打造一件装备，并令一名角色使用之。",
					jtjeheiwu: "黑雾",
					jtjeheiwu_info: "锁定技，其他角色回合结束时，你令其选择一项：①弃置一张牌。②失去一点体力。然后对应选项的数字+1。",
					jtjeheiwu_num1: "黑雾",
					jtjeheiwu_num2: "黑雾",
					jtjeluoke: "螺壳",
					jtjeluoke_info: "锁定技，黑色伤害牌造成的伤害对你无效。",
					jtjeguanchuan: "贯穿",
					jtjeguanchuan_info: "每名角色限一次，出牌阶段限一次，你可以令一名体力值小于体力上限一半（向上取整）的其他角色失去全部体力。",
					ignzshenji: "神计",
					ignzshenji_info: "每回合限一次，当你需要使用或打出一张牌时（延时锦囊牌除外），你可以摸至多X张牌（初始为1），然后排序并展示Y张手牌（Y为你摸牌的数量），若展示的每张牌的类别和花色组合均与其相邻的牌不同，视为你使用或打出此牌，否则你弃置Y张牌。若你因此摸了X张牌，则X值+1，否则-1。",
					dnshuijing: "水晶",
					dnshuijing_info: "游戏开始时或获得此技能时，你获得" + get.poptip("dnshanliang") + "。出牌阶段限一次，你可以：①失去" + get.poptip("dnshanliang") + "，获得" + get.poptip("dnqiji") + "或" + get.poptip("dnqiangzhuang") + "。②失去" + get.poptip("dnqiji") + "或" + get.poptip("dnqiangzhuang") + "，获得" + get.poptip("dnshanliang") + "。",
					dnshanliang: "闪亮",
					dnshanliang_info: "每回合限一次，你可以将一张基本牌当作任意非延时锦囊牌使用，或将一张非基本牌当任意基本牌使用，并摸两张牌。",
					dnqiji: "奇迹",
					dnqiji_info: "当其他角色选择牌的目标指定你时，你可以猜测此牌类型（装备牌直接视为猜对），若你猜对，你令此牌无效然后选择一项：①使用此牌（不可响应）。②回复一点体力并摸两张牌。③弃置四张牌并选择一名其他角色，保留其区域内所有牌并移除游戏直至其下个回合开始。然后将此牌置入弃牌堆。",
					dnqiangzhuang: "强壮",
					dnqiangzhuang_info: "锁定技，你的普通锦囊牌均视为【决斗】。其他角色无法响应你使用的牌。你使用【杀】后获得一张普通锦囊牌。",
					zfbaqi: "八七",
					zfbaqi_info: "当你使用一张牌后，你将牌堆顶两张牌置于武将牌上，称为“星”。出牌阶段限一次，你可以通过“+-*/()”组合任意张“星”的点数，若结果为87，则你弃置这些“星”，然后对一名其他角色造成其体力上限-1点伤害（至少三点）。",
					zfbaqi_star: "星",
					zfyakong: "亚空",
					zfyakong_info: "限定技，一名其他角色死亡后，你可以令其复活，回复体力至两点并摸一张牌。",
					tlpoquan: "迫拳",
					tlpoquan_info: "你可以将两张不同类型且不同颜色的牌当作一张普通的【杀】使用。当你对其他角色使用牌后，若其为唯一目标，你可以对其使用一张不计入次数且无次数限制的单目标牌；若这两张牌颜色或类型相同，则你摸一张牌。",
					tlzhadan: "炸弹",
					tlzhadan_info: "限定技，出牌阶段，你可以选择一名其他角色，你弃置所有手牌并失去体力上限至1，然后对其造成X-1点伤害（X为你发动时的体力值，且至少为2）。",
					yaoyaoyi: "爻疑",
					yaoyaoyi_tag: "invisible",
					yaoyaoyi_info: "锁定技。①你的起始手牌背置。②每回合每种牌名限一次，你可以将一张背置的牌当作任意基本牌或普通锦囊牌使用或打出。",
					yaochenwei: "谶纬",
					yaochenwei_info: "转换技。阳：当你使用背置牌时，令一名角色将你的一张手牌翻面；阴：当你使用非背置牌时，获得一名其他角色的一张牌并将此牌背置。",
					asguangxian: "光线",
					asguangxian_info: "当你使用一张牌时，若此牌为伤害类牌，则此牌造成的伤害+1，否则你摸一张牌。",
					asduantou: "断头",
					asduantou_info: "出牌阶段限一次，你可以弃置任意张花色不同的手牌并选择一名其他角色，展示其手牌并弃置其中与你弃置花色相同的牌，然后你对其造成一点伤害，若执行弃牌前或弃牌后没有手牌则造成两点伤害。",
					swbingfu: "冰斧",
					swbingfu_info: "当你使用牌指定一名其他角色为目标后，你可以进行一次判定，若结果为：红心，视为对其使用一张无次数限制且不计入次数的普通【杀】；方块，其不可响应此牌；黑桃，你弃置其一张牌；梅花，其弃置两张牌。",
					swxiongjia: "胸甲",
					swxiongjia_info: "每名角色结束阶段，若本回合有：至少两种花色的牌进入弃牌堆，你摸一张牌；至少三种花色的牌进入弃牌堆，你回复一点体力。",
					zggylianshuai: "连摔",
					zggylianshuai_info: "当你使用【杀】后，你可以弃置手牌中一种类型与花色组合的所有牌（需为基本牌或锦囊牌且不能是本轮弃置过的组合），并视为使用一张无次数限制的【杀】。",
					zggyjili: "极力",
					zggyjili_info: "你可以将一张非伤害类牌当普通的【杀】使用。当你使用【杀】指定目标后，你可以与目标同时展示一张手牌，然后弃置你展示的牌并执行一项（若对方无牌则视为展示7点）：1.摸X张牌（X为两张牌点数差值的一半，向下取整）；2.此【杀】伤害+Y（Y为X的一半，向上取整）；3.令此【杀】无法被响应。",
					leofenzhan: "奋战",
					leofenzhan_info: "锁定技。摸牌阶段，你多摸X张牌；出牌阶段，可额外使用X张【杀】。结束阶段，你摸X张牌（X为你已损失的体力值）。",
					leofeiti: "飞踢",
					leofeiti_info: "出牌阶段限一次，你可以弃置任意张牌，视为使用一张无次数限制且不计入次数的普通【杀】，并选择一项：1.令其弃置X张牌（X为弃牌数）；2.此【杀】伤害+1。背水：失去一点体力。",
					jstsfensui: "粉碎",
					jstsfensui_info: "转换技，阳：当你成为牌的目标后，你可以令一名角色执行：①摸两张牌并弃置一张牌；②摸一张牌并弃置两张牌。阴：当其他角色成为牌的目标后，你可以令一名角色执行：①受到一点伤害然后回复两点体力；②受到两点伤害然后回复一点体力。（初始均执行①，每次执行与同一分支上一次选项不同的选项）",
					hqchigui: "赤鬼",
					hqchigui_info: "游戏开始时，你获得五枚“残梦”标记（至多九枚）。一名其他角色执行负面效果后，你获得一枚“残梦”标记。出牌阶段开始时，你令一名其他角色执行一项负面效果（数值为1，且不能与之前的选项相同，均执行或无法执行时重置）。",
					hqchigui_append: `<span style="font-family:yuanli">负面效果：①跳过摸牌阶段；②跳过出牌阶段；③失去1点体力；④失去1点体力上限；⑤受到1点火焰伤害；⑥受到1点雷电伤害；⑦武将牌横置；⑧武将牌翻至背面；⑨弃置一张牌</span>`,
					hqtize: "啼泽",
					hqtize_info: "任意角色结束阶段，若=你的“残梦”标记达到上限，你可以移除所有“残梦”标记，视为使用三张无距离和次数限制的雷【杀】，然后视为使用一张指定任意角色为目标的雷【杀】。",
					wsgucheng: "孤承",
					wsgucheng_info: "锁定技，其他角色不能令你回复体力，你不能获得其他角色的牌。",
					wsgeshi: "隔世",
					wsgeshi_info: "锁定技，任意回合结束时，若你本回合未受到过伤害，你获得一枚“世”标记；回合开始时，你移去所有“世”标记，然后执行：回复等量体力；对一名其他角色造成等量伤害；摸等量的牌。",
					adkoudai: "扣带",
					adkoudai_info: "每回合每项限一次，当你造成伤害时，你可以令此伤害+1；当你受到伤害时，你可以令此伤害-1。",
					adquanneng: "全能",
					adquanneng_info: "每回合每名角色每项限一次，当你使用牌时，你可以令一名角色执行一项：1.回复一点体力；2.摸两张牌；3.重置武将牌。",
					adjinghua: "净化",
					adjinghua_info: "蓄力技（0/∞），当一名角色回复体力，摸牌，武将牌翻至正面或解除连环状态后，你获得一点蓄力点。出牌阶段，你可以消耗3点蓄力点，令一名角色重置所有技能。",
					astlqiuyv: "囚狱",
					astlqiuyv_info: `使命技，游戏开始时，你获得游戏角色数枚”囚“标记。其他角色计算与你的距离，你计算与其他角色的距离均+X；其他角色成为牌的目标后，你移去一枚”囚“标记。<br>成功：回合开始时，若你没有”囚“标记，你获得${get.poptip("astlgongjin")}`,
					astlgongjin: "共进",
					astlgongjin_info: "限定技，出牌阶段，你可以选择一名其他角色。其/你受到伤害时，你/其可以改为你/其受到此伤害；你/其于摸牌阶段外不因此技能摸牌时，其/你摸等量的牌。",
				},
			},
			intro: "奥特五大誓言：饿着肚子不能上学；好天气要晒被子；过马路时要注意来往车辆；不要依赖别人的力量；要光着脚在地上玩",
			author: "子右",
			diskURL: "",
			forumURL: "",
			version: "1.3.2",
		},
	};
}
