import { lib, game, ui, get, ai, _status } from "../../../../noname.js";
import { extAssetUrl } from "../core/assets.js";

// ===== 公用函数 =====
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const sameCamp = (a, b) => {
	if (a === b) return true;
	if (get.mode() === "identity") {
		const camp = p => {
			const id = p.identity || "";
			if (["zhu", "zhong", "mingzhong", "commoner"].includes(id)) return 1;
			if (id === "fan") return 2;
			if (["rZhu", "rZhong", "bNei"].includes(id)) return 3;
			if (["bZhu", "bZhong", "rNei"].includes(id)) return 4;
			return 0;
		};
		const campA = camp(a);
		return campA > 0 && campA === camp(b);
	}
	return typeof a.isFriendOf === "function" && a.isFriendOf(b);
};

const weaponRepair = (callText, sameText, weapon) =>
	async function (players) {
		const petitioner = players[0];
		const xinnuo = players[1];
		petitioner.chat(callText);
		await sleep(800);
		if (sameCamp(petitioner, xinnuo)) {
			xinnuo.chat(sameText);
			await sleep(800);
			const card = game.createCard(weapon);
			await petitioner.gain(card, xinnuo, "give", true);
			await petitioner.equip(card);
		} else {
			xinnuo.chat("不修！！！");
		}
	};

// ===== 发现记录 =====
const DISCOVERED_KEY = "wm_easterEgg_discovered";

const triggerTypeName = {
	gameStart: "开局",
	useCard: "出牌",
	damage: "伤害",
	die: "死亡",
	recover: "回复",
};

// ===== 简洁彩蛋 =====
const eggs = {
	useCard: [],
	damage: [
		{ id: "ultraman_red_form", character: "迪迦强力型", cardName: "sha", skill: "djqiangli", text: "一开始用红色形态作战不就行了吗？" },
		{ id: "ultraman_red_form", character: "戴拿强壮型", cardName: "sha", skill: "dnqiangzhuang", text: "一开始用红色形态作战不就行了吗？" },
		{ id: "ultraman_red_form", character: "戴拿强壮型", cardName: "juedou", skill: "dnqiangzhuang", text: "一开始用红色形态作战不就行了吗？" },
		{ id: "ultraman_red_form", character: "至高盖亚", cardName: "sha", skill: "zggylianshuai", text: "一开始用红色形态作战不就行了吗？" },
	],
	die: [],
};

// ===== 复杂彩蛋 =====
eggs.gameStart = [
	{
		id: "gongda_tianting",
		characters: ["未遂", "曼波"],
		run: async function (players) {
			const variants = [
				[{ character: "未遂", text: "凑子右" }, { character: "曼波", text: "凑未遂" }],
				[{ character: "未遂", text: "和我一起攻打天庭吧子右" }, { character: "曼波", text: "有何不敢！" }],
			];
			const actions = variants.randomGet();
			for (const action of actions) {
				await sleep(1000);
				const actor = players[["未遂", "曼波"].indexOf(action.character)];
				if (actor) actor.chat(action.text);
			}
		},
	},
	{ id: "genshin_mavika_xilonen", characters: ["玛薇卡", "希诺宁"], run: weaponRepair("宁宁～车车～坏坏～修修～", "玛薇卡！！！这是最后一次了", "fyqy"), },
	{ id: "genshin_chasca_xilonen", characters: ["恰斯卡", "希诺宁"], run: weaponRepair("宁宁～枪枪～坏坏～修修～", "恰斯卡！！！这是最后一次了", "xjcy"), },
	{
		id: "ultraman_zoffy_king",
		characters: ["佐菲", "奥特之王"],
		run: async function (players) {
			const zofei = players[0];
			const aotewang = players[1];
			zofei.chat("大王！");
			await sleep(2000);
			zofei.say("🤝");
			aotewang.say("🤝");
			await sleep(2000);
			zofei.chat("为什么折断奥特钥匙？！");
		},
	},
	{
		id: "ultraman_jack_seven",
		characters: ["杰克", "赛文"],
		run: async function (players) {
			players[0].chat("谢谢你泰罗");
		},
	},
	{
		id: "genshin_furina_arlecchino",
		characters: ["芙宁娜", "阿蕾奇诺"],
		run: async function (players) {
			players[0].chat("有鬼啊啊啊！");
			await sleep(1000);
			players[1].chat("......");
		},
	},
	{
		id: "starrail_huangquan_lost",
		characters: ["黄泉"],
		run: async function (players) {
			if (Math.random() < 0.32) {
				players[0].chat("迷路了...");
				return true;
			}
			return false;
		},
	},
];

// ===== 彩蛋图鉴数据 =====
eggs.catalog = {
	"奥特曼": [
		{
			id: "ultraman_zoffy_king",
			category: "奥特曼",
			title: "为什么折断奥特钥匙？",
			characters: ["佐菲", "奥特之王"],
			triggerType: "gameStart",
			triggerDescription: "佐菲与奥特之王同时出现时触发。",
			hint: "寻找与“奥特钥匙”有关的角色组合。",
			content: ["大王！", "🤝", "为什么折断奥特钥匙？！"],
		},
		{
			id: "ultraman_jack_seven",
			category: "奥特曼",
			title: "谢谢你泰罗",
			characters: ["杰克", "赛文"],
			triggerType: "gameStart",
			triggerDescription: "杰克与赛文同时出现时触发。",
			hint: "有位奥特曼认错了人。",
			content: ["谢谢你泰罗"],
		},
		{
			id: "ultraman_seven_chase",
			category: "奥特曼",
			title: "赛文还在追我tmd",
			characters: ["赛文"],
			triggerType: "useCard",
			triggerDescription: "赛文使用牌指定其他存活角色时，有概率触发。",
			hint: "有一个红银巨人在追你？",
			content: ["赛文还在追我tmd"],
		},
		{
			id: "ultraman_red_form",
			category: "奥特曼",
			title: "一开始用红色形态作战不就行了吗？",
			characters: ["迪迦强力型", "戴拿强壮型", "至高盖亚"],
			skills: ["djqiangli", "dnqiangzhuang", "zggylianshuai"],
			triggerType: "damage",
			triggerDescription: "对应角色使用【杀】或【决斗】造成伤害时触发。",
			hint: "想想某些力量形态。",
			content: ["大运来咯"],
		},
	],
	"原神": [
		{
			id: "genshin_mavika_xilonen",
			category: "原神",
			title: "宁宁～车车～坏坏～修修～",
			characters: ["玛薇卡", "希诺宁"],
			triggerType: "gameStart",
			triggerDescription: "玛薇卡与希诺宁同时出现时触发。",
			hint: "找一位锻造师，和一位总把车开坏的骑手。",
			content: ["宁宁～车车～坏坏～修修～", "玛薇卡！！！这是最后一次了"],
		},
		{
			id: "genshin_chasca_xilonen",
			category: "原神",
			title: "宁宁～枪枪～坏坏～修修～",
			characters: ["恰斯卡", "希诺宁"],
			triggerType: "gameStart",
			triggerDescription: "恰斯卡与希诺宁同时出现时触发。",
			hint: "找一位锻造师，和一位总把枪用坏的射手。",
			content: ["宁宁～枪枪～坏坏～修修～", "恰斯卡！！！这是最后一次了"],
		},
		{
			id: "genshin_furina_arlecchino",
			category: "原神",
			title: "有鬼啊啊啊！",
			characters: ["芙宁娜", "阿蕾奇诺"],
			triggerType: "gameStart",
			triggerDescription: "芙宁娜与阿蕾奇诺同时出现时触发。",
			hint: "一胆小的“神明”，遇到了一位“鬼”。",
			content: ["有鬼啊啊啊！", "......"],
		},
	],
	"崩坏：星穹铁道": [
		{
			id: "starrail_huangquan_lost",
			category: "崩坏：星穹铁道",
			title: "迷路了...",
			characters: ["黄泉"],
			triggerType: "gameStart",
			triggerDescription: "开局存在黄泉时，有概率触发。",
			hint: "一位角色迷路了。",
			content: ["迷路了..."],
		},
		{
			id: "starrail_huangquan_peach",
			category: "崩坏：星穹铁道",
			title: "🍑",
			characters: ["黄泉"],
			triggerType: "recover",
			triggerDescription: "黄泉因使用【桃】回复体力时，有概率触发。",
			hint: "她爱吃桃子。",
			content: ["🍑"],
		},
	],
	"其他": [
		{
			id: "gongda_tianting",
			category: "其他",
			title: "和我一起攻打天庭吧",
			characters: ["未遂", "曼波"],
			triggerType: "gameStart",
			triggerDescription: "未遂与曼波同时出现时触发。",
			hint: "子右和未遂。",
			content: ["凑子右 → 凑未遂", "和我一起攻打天庭吧子右 → 有何不敢！"],
		},
	],
};

// ===== 发现记录 API =====
const DISCOVERED_CHARACTERS_KEY = "wm_easterEgg_characters";
eggs.getDiscovered = function () {
	const list = game.getExtensionConfig("奥特之星", DISCOVERED_KEY);
	return Array.isArray(list) ? list : [];
};

eggs.markDiscovered = function (id) {
	if (!id) return;
	const discovered = eggs.getDiscovered();
	if (discovered.includes(id)) return;
	discovered.push(id);
	game.saveExtensionConfig("奥特之星", DISCOVERED_KEY, discovered);
};

eggs.getEggCharacters = function (id) {
	const map = game.getExtensionConfig("奥特之星", DISCOVERED_CHARACTERS_KEY);
	const list = map?.[id];
	return Array.isArray(list) ? list : [];
};

eggs.markEggCharacter = function (id, character) {
	if (!id || !character) return;
	const map = game.getExtensionConfig("奥特之星", DISCOVERED_CHARACTERS_KEY) || {};
	const list = Array.isArray(map[id]) ? map[id] : [];
	if (list.includes(character)) return;
	list.push(character);
	map[id] = list;
	game.saveExtensionConfig("奥特之星", DISCOVERED_CHARACTERS_KEY, map);
};

eggs.init = function () {
	if (_status.wmEasterEggHooked) return;
	_status.wmEasterEggHooked = true;
	lib._wmEasterEggs = eggs;
	const eggPlayAudio = audio => game.playAudio(`ext:奥特之星/assets/audio/easteregg/${audio}`);
	const eggMatchPlayer = (player, name) => {
		if (!name) return true;
		const names = lib.characterReplace?.[name] || [name];
		return names.includes(player.name) || names.includes(player.name1) || names.includes(player.name2);
	};
	const origUseCard = lib.element.Player.prototype.useCard;
	lib.element.Player.prototype.useCard = function (...args) {
		const event = origUseCard.apply(this, args);
		if (!lib.config.extension_奥特之星_easterEgg_enabled) return event;
		if (event?.card) {
			const cardName = get.name(event.card);
			for (const egg of eggs.useCard) {
				if (egg.cards && !egg.cards.includes(cardName)) continue;
				if (egg.player && !eggMatchPlayer(this, egg.player)) continue;
				if (egg.skill && !this.hasSkill(egg.skill)) continue;
				this.chat(egg.text);
				if (egg.audio) eggPlayAudio(egg.audio);
				eggs.markDiscovered(egg.id);
				break;
			}
			if (eggMatchPlayer(this, "赛文")) {
				const targets = event.targets?.filter(target => target !== this && target.isAlive());
				if (targets?.length && Math.random() < 0.1) {
					targets[0].chat("赛文还在追我tmd");
					eggPlayAudio("saiwen.mp3");
					eggs.markDiscovered("ultraman_seven_chase");
				}
			}
		}
		return event;
	};
	const origDamage = lib.element.Player.prototype.damage;
	lib.element.Player.prototype.damage = function (...args) {
		const event = origDamage.apply(this, args);
		if (!lib.config.extension_奥特之星_easterEgg_enabled) return event;
		const source = event?.source;
		if (source?.hasSkill) {
			for (const egg of eggs.damage) {
				if (egg.cardName && (!event.card || get.name(event.card) !== egg.cardName)) continue;
				if (egg.skill && !source.hasSkill(egg.skill)) continue;
				if (egg.player && !eggMatchPlayer(source, egg.player)) continue;
				source.chat(egg.text);
				if (egg.audio) eggPlayAudio(egg.audio);
				eggs.markDiscovered(egg.id);
				if (egg.character) eggs.markEggCharacter(egg.id, egg.character);
				break;
			}
		}
		return event;
	};
	const origDie = lib.element.Player.prototype.$die;
	lib.element.Player.prototype.$die = function (...args) {
		const result = origDie.apply(this, args);
		if (!lib.config.extension_奥特之星_easterEgg_enabled) return result;
		for (const egg of eggs.die) {
			if (egg.deceased && !eggMatchPlayer(this, egg.deceased)) continue;
			const speaker = egg.speaker ? game.players?.find(p => eggMatchPlayer(p, egg.speaker)) : this;
			if (speaker) {
				speaker.chat(egg.text);
				if (egg.audio) eggPlayAudio(egg.audio);
				eggs.markDiscovered(egg.id);
				break;
			}
		}
		return result;
	};
	const origRecover = lib.element.Player.prototype.recover;
	lib.element.Player.prototype.recover = function (...args) {
		const next = origRecover.apply(this, args);
		if (!lib.config.extension_奥特之星_easterEgg_enabled) return next;
		if (eggMatchPlayer(this, "黄泉")) {
			let cur = _status.event;
			while (cur) {
				if (cur.name === "useCard" && cur.card && get.name(cur.card) === "tao" && cur.player === this) break;
				cur = cur.parent;
			}
			if (cur && Math.random() < 0.08) {
				next.num = (next.num || 1) + 1;
				this.say("🍑");
				eggs.markDiscovered("starrail_huangquan_peach");
			}
		}
		return next;
	};
	if (!lib.skill._wmEasterEggGameStart) {
		lib.skill._wmEasterEggGameStart = {
			trigger: { global: "phaseBefore" },
			forced: true,
			silent: true,
			popup: false,
			firstDo: true,
			filter(event, player) {
				return game.phaseNumber === 0 && !_status.wmEasterEggGameStartChecked;
			},
			async content() {
				_status.wmEasterEggGameStartChecked = true;
				if (!lib.config.extension_奥特之星_easterEgg_enabled) return;
				const gameStartEggs = lib._wmEasterEggs?.gameStart;
				if (!gameStartEggs?.length) return;
				const matchPlayer = (player, name) => {
					const names = lib.characterReplace?.[name] || [name];
					return names.includes(player.name) || names.includes(player.name1) || names.includes(player.name2);
				};
				for (const egg of gameStartEggs) {
					const matched = egg.characters.map(name => game.players?.find(p => matchPlayer(p, name)));
					const allPresent = matched.every(p => !!p);
					if (!allPresent) continue;
					if (typeof egg.run === "function") {
						const done = await egg.run(matched);
						if (done !== false) eggs.markDiscovered(egg.id);
						continue;
					}
					for (let i = 0; i < egg.actions.length; i++) {
						const action = egg.actions[i];
						const actor = matched[egg.characters.indexOf(action.character)];
						if (actor) {
							setTimeout(() => actor.chat(action.text), 800 * (i + 1));
						}
					}
					eggs.markDiscovered(egg.id);
				}
			},
		};
		game.addGlobalSkill("_wmEasterEggGameStart");
	}
};

// ===== 彩蛋图鉴界面 =====
const ensureEggCatalogStyles = () => {
	if (document.getElementById("wm-egg-catalog-styles")) return;
	const style = document.createElement("style");
	style.id = "wm-egg-catalog-styles";
	style.textContent = `.wm-egg-catalog-overlay div:not(.wm-egg-catalog-box):not(.wm-egg-tabs):not(.wm-egg-list){position:relative !important;display:block !important;}
						@keyframes wmEggFadeIn{from{opacity:0}to{opacity:1}}
						@keyframes wmEggSlideIn{from{transform:scale(0.5) translateY(-100px);opacity:0}to{transform:scale(1) translateY(0);opacity:1}}
						.wm-egg-catalog-overlay{position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);z-index:99999;display:flex;align-items:center;justify-content:center;animation:wmEggFadeIn 0.5s ease-in-out;}
						.wm-egg-catalog-overlay.detail{z-index:100000;}
						.wm-egg-catalog-overlay .wm-egg-catalog-box{position:relative;width:70%;height:80%;max-width:900px;background:rgba(216,193,255,0.85);border-radius:20px;padding:0 40px;box-shadow:0 20px 60px rgba(180,150,255,0.5);animation:wmEggSlideIn 0.6s cubic-bezier(0.68,-0.55,0.265,1.55);overflow:hidden;display:flex;flex-direction:column;box-sizing:border-box;}
						.wm-egg-catalog-title{color:#fff;font-size:26px;font-weight:bold;text-shadow:1px 1px 2px rgba(0,0,0,0.8);padding:20px 0 5px 0;text-align:center;flex-shrink:0;position:relative;}
						.wm-egg-catalog-progress{color:#fff;font-size:18px;text-align:center;text-shadow:1px 1px 2px rgba(0,0,0,0.6);flex-shrink:0;position:relative;}
						.wm-egg-catalog-hint{color:rgba(255,255,255,0.85);font-size:14px;text-align:center;text-shadow:1px 1px 2px rgba(0,0,0,0.6);padding-bottom:8px;flex-shrink:0;position:relative;}
						.wm-egg-catalog-banner{margin:4px auto 0;padding:5px 18px;background:rgba(255,80,80,0.35);border:1px solid rgba(255,120,120,0.6);border-radius:10px;color:#fff;font-size:15px;text-align:center;text-shadow:1px 1px 2px rgba(0,0,0,0.6);flex-shrink:0;width:fit-content;position:relative;}
						.wm-egg-catalog-overlay .wm-egg-tabs{display:flex;flex-wrap:wrap;justify-content:center;gap:10px;padding:12px 0 6px 0;flex-shrink:0;position:relative;}
						.wm-egg-tab{padding:6px 18px;border-radius:14px;background:rgba(255,255,255,0.25);color:rgba(255,255,255,0.75);font-size:16px;cursor:pointer;text-shadow:1px 1px 2px rgba(0,0,0,0.6);user-select:none;position:relative;}
						.wm-egg-tab.active{background:rgba(255,255,255,0.9);color:#7a5fc7;font-weight:bold;text-shadow:none;}
						.wm-egg-catalog-overlay .wm-egg-list{flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:8px;padding:10px 10px 16px 0;-webkit-overflow-scrolling:touch;position:relative;}
						.wm-egg-card{background:rgba(255,255,255,0.18);border:1px solid rgba(255,255,255,0.35);border-radius:10px;padding:10px 14px;cursor:pointer;transition:background 0.2s;position:relative;flex-shrink:0;}
						.wm-egg-card:hover{background:rgba(255,255,255,0.32);}
						.wm-egg-card.locked{opacity:0.78;}
						.wm-egg-card-title{color:#fff;font-size:18px;font-weight:bold;text-shadow:1px 1px 2px rgba(0,0,0,0.8);}
						.wm-egg-card-title.found{color:#ffd700;}
						.wm-egg-card-sub{color:rgba(255,255,255,0.85);font-size:14px;margin-top:4px;text-shadow:1px 1px 2px rgba(0,0,0,0.6);}
						.wm-egg-detail-title{color:#fff;font-size:28px;font-weight:bold;text-align:center;text-shadow:1px 1px 2px rgba(0,0,0,0.8);padding:18px 0 12px 0;flex-shrink:0;position:relative;}
						.wm-egg-detail-title.found{color:#ffd700;}
						.wm-egg-detail-text{color:#fff;line-height:2;font-size:22px;text-shadow:1px 1px 2px rgba(0,0,0,0.8);overflow-y:auto;flex:1;padding:0 10px;-webkit-overflow-scrolling:touch;position:relative;}
						.wm-egg-detail-row{margin-bottom:12px;}
						.wm-egg-detail-row b{color:#ffd700;}
						.wm-egg-back{align-self:center;margin:10px 0 16px 0;padding:8px 30px;border-radius:14px;background:rgba(255,255,255,0.9);color:#7a5fc7;font-size:16px;font-weight:bold;cursor:pointer;user-select:none;flex-shrink:0;position:relative;}`;
	document.head.appendChild(style);
};

eggs.openCatalog = function () {
	if (document.querySelector(".wm-egg-catalog-overlay")) return;
	ensureEggCatalogStyles();
	const allEggs = Object.values(eggs.catalog).flat();
	const categories = Object.keys(eggs.catalog).filter(cat => eggs.catalog[cat].length > 0);
	const discovered = eggs.getDiscovered();
	const enabled = !!lib.config.extension_奥特之星_easterEgg_enabled;
	let currentCategory = "全部";

	const overlay = document.createElement("div");
	overlay.className = "wm-egg-catalog-overlay";
	const box = document.createElement("div");
	box.className = "wm-egg-catalog-box";
	const title = document.createElement("div");
	title.className = "wm-egg-catalog-title";
	title.textContent = "🎁 彩蛋图鉴";
	const progress = document.createElement("div");
	progress.className = "wm-egg-catalog-progress";
	const updateProgress = () => {
		const scope = currentCategory === "全部" ? allEggs : eggs.catalog[currentCategory] || [];
		const count = discovered.filter(id => scope.some(egg => egg.id === id)).length;
		progress.textContent = `已发现 ${count} / ${scope.length}`;
	};
	updateProgress();
	const hint = document.createElement("div");
	hint.className = "wm-egg-catalog-hint";
	hint.textContent = "点击空白处关闭";
	const tabs = document.createElement("div");
	tabs.className = "wm-egg-tabs";
	const list = document.createElement("div");
	list.className = "wm-egg-list";
	box.appendChild(title);
	box.appendChild(progress);
	if (!enabled) {
		const banner = document.createElement("div");
		banner.className = "wm-egg-catalog-banner";
		banner.textContent = "⚠ 彩蛋功能当前已关闭，图鉴仅供浏览";
		box.appendChild(banner);
	}
	box.appendChild(hint);
	box.appendChild(tabs);
	box.appendChild(list);
	overlay.appendChild(box);
	overlay.addEventListener("click", e => {
		if (e.target === overlay) overlay.remove();
	});
	ui.window.appendChild(overlay);

	const showDetail = egg => {
		const found = discovered.includes(egg.id);
		const detailOverlay = document.createElement("div");
		detailOverlay.className = "wm-egg-catalog-overlay detail";
		const detailBox = document.createElement("div");
		detailBox.className = "wm-egg-catalog-box";
		const detailTitle = document.createElement("div");
		detailTitle.className = "wm-egg-detail-title" + (found ? " found" : "");
		detailTitle.textContent = `【${found ? egg.title : "???"}】`;
		const detailText = document.createElement("div");
		detailText.className = "wm-egg-detail-text";
		const rows = [];
		rows.push(`<b>分类：</b>${egg.category}`);
		rows.push(`<b>触发方式：</b>${triggerTypeName[egg.triggerType] || "特殊"}`);
		if (egg.characters?.length) {
			const triggeredChars = found ? eggs.getEggCharacters(egg.id) : [];
			const charText = egg.characters
				.map(name => (found && (triggeredChars.length === 0 || triggeredChars.includes(name)) ? name : "？？？"))
				.join(" × ");
			rows.push(`<b>触发角色：</b>${charText}`);
		}
		if (found) {
			if (egg.triggerDescription) rows.push(`<b>触发条件：</b>${egg.triggerDescription}`);
		}
		if (egg.hint) rows.push(`<b>提示：</b>${egg.hint}`);
		rows.push(`<b>状态：</b>${found ? "★ 已发现" : "尚未发现"}`);
		detailText.innerHTML = rows.map(row => `<div class="wm-egg-detail-row">${row}</div>`).join("");
		const back = document.createElement("div");
		back.className = "wm-egg-back";
		back.textContent = "← 返回列表";
		back.onclick = () => detailOverlay.remove();
		detailBox.appendChild(detailTitle);
		detailBox.appendChild(detailText);
		detailBox.appendChild(back);
		detailOverlay.appendChild(detailBox);
		detailOverlay.addEventListener("click", e => {
			if (e.target === detailOverlay) detailOverlay.remove();
		});
		ui.window.appendChild(detailOverlay);
	};

	const renderTabs = () => {
		tabs.innerHTML = "";
		for (const cat of ["全部", ...categories]) {
			const tab = document.createElement("div");
			tab.className = "wm-egg-tab" + (cat === currentCategory ? " active" : "");
			tab.textContent = cat;
			tab.onclick = () => {
				currentCategory = cat;
				renderTabs();
				renderList();
				updateProgress();
			};
			tabs.appendChild(tab);
		}
	};

	const renderList = () => {
		list.innerHTML = "";
		const eggsToShow = currentCategory === "全部" ? allEggs : eggs.catalog[currentCategory];
		for (const egg of eggsToShow) {
			const found = discovered.includes(egg.id);
			const card = document.createElement("div");
			card.className = "wm-egg-card" + (found ? "" : " locked");
			const cardTitle = document.createElement("div");
			cardTitle.className = "wm-egg-card-title" + (found ? " found" : "");
			cardTitle.textContent = `${found ? "★" : "🔒"} ${found ? egg.title : "???"}`;
			card.appendChild(cardTitle);
			const subLine = egg.category;
			if (subLine) {
				const cardSub = document.createElement("div");
				cardSub.className = "wm-egg-card-sub";
				cardSub.textContent = subLine;
				card.appendChild(cardSub);
			}
			const cardTrigger = document.createElement("div");
			cardTrigger.className = "wm-egg-card-sub";
			cardTrigger.textContent = `${triggerTypeName[egg.triggerType] || "特殊"}彩蛋`;
			card.appendChild(cardTrigger);
			card.onclick = () => showDetail(egg);
			list.appendChild(card);
		}
	};

	renderTabs();
	renderList();
};

export default eggs;
