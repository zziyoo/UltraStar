// 奥特之星·肉鸽 背景音乐：大厅（存档页/营地/商店）循环播 LOBBY_BGM；战斗每场从 BATTLE_BGM_LIST 随机抽一首单曲循环。
// 音量跟随本体「音乐音量」（lib.config.volumn_background，0~8），与 ui.backgroundMusic 同一套刻度。

import { lib, ui } from "../../../../noname.js";
import { BATTLE_BGM_LIST, LOBBY_BGM } from "./config.js";

/** 整个会话只建一个 audio 元素：存档页↔营地↔商店之间来回切不会重起一份音轨 */
let bgm = null;
/** 当前是不是大厅在出声：进战斗立刻置 false，用来挡掉 play() 延迟兑现的 then */
let lobbyOn = false;
/** 战斗 BGM：进战斗时随机抽一首，整场循环这一首（一次页面会话只打一场战斗，重载后下一场重新抽） */
let battleBgm = null;
/** 当前是不是战斗在出声 */
let battleOn = false;
/** 本体自己的背景音乐被我们按成静音：只放回音量，不动它的播放状态 */
let engineMuted = false;

/** 大厅与战斗共用同一份「压下本体 BGM」：只要我们的任一音轨在出声，本体就不该出声 */
function ourBgmOn() {
	return lobbyOn || battleOn;
}

/**
 * 大厅/战斗期间静音本体 BGM（ui.backgroundMusic），两首曲子叠在一起会糊成一团。
 * 用音量而不是 pause()：本体这份在页面加载时往往还没开始放（还在缓冲），
 * 那时候 pause() 会漏掉它稍后的自动播放；音量是元素属性，什么时候开始放都生效。
 */
function muteEngineBgm() {
	if (!ourBgmOn()) {
		return;
	}
	const engine = ui.backgroundMusic;
	if (!engine) {
		return;
	}
	engine.volume = 0;
	engineMuted = true;
}

/** 我们的音轨全停了：把本体 BGM 的音量放回本体刻度（曲子一直没停，自然接在原进度上） */
function unmuteEngineBgm() {
	if (!engineMuted) {
		return;
	}
	engineMuted = false;
	const engine = ui.backgroundMusic;
	if (engine) {
		engine.volume = lib.config.volumn_background / 8;
	}
}

/**
 * 循环播放大厅 BGM。
 * 还在放就一个字都不动（换页面、删档这类原地重绘都不该把曲子掐回开头）；
 * 只有停下来过的（进过战斗、页面刚加载还没播）才 play()——从头放起。
 */
export function playLobbyBgm() {
	lobbyOn = true;
	if (!bgm) {
		bgm = document.createElement("audio");
		bgm.src = LOBBY_BGM;
		bgm.loop = true;
		document.body.appendChild(bgm);
	}
	bgm.volume = lib.config.volumn_background / 8;
	if (!bgm.paused) {
		// 已经在放：顺手再静音一次本体 BGM，防别的流程把音量改回来
		muteEngineBgm();
		return;
	}
	bgm.currentTime = 0;
	// 页面刚加载时可能还没有任何用户手势，浏览器会拦下第一次 play()；
	// 这里只吞掉那个 rejection，之后每次进页面都会再试。
	// 等我们真的出声了再静音本体 BGM：我们的被拦下时宁可听本体的，也不要整个大厅没声音
	bgm.play().then(muteEngineBgm, () => {});
}

/** 停止大厅 BGM：进战斗界面时调用，并把本体 BGM 的音量放回去 */
export function stopLobbyBgm() {
	lobbyOn = false;
	bgm?.pause();
	unmuteEngineBgm();
}

/**
 * 进战斗：从 BATTLE_BGM_LIST 随机抽一首单曲循环，接替大厅把本体 BGM 按成静音。
 * 随机只发生在进战斗这一下：整场战斗不换曲，重载后下一场重新抽。
 */
export function playBattleBgm() {
	battleOn = true;
	if (!battleBgm) {
		battleBgm = document.createElement("audio");
		battleBgm.loop = true;
		document.body.appendChild(battleBgm);
	}
	battleBgm.src = BATTLE_BGM_LIST[Math.floor(Math.random() * BATTLE_BGM_LIST.length)];
	battleBgm.volume = lib.config.volumn_background / 8;
	battleBgm.currentTime = 0;
	battleBgm.play().then(muteEngineBgm, () => {});
}

/** 战斗结束（game.onover）：停止战斗 BGM，并把本体 BGM 的音量放回去 */
export function stopBattleBgm() {
	battleOn = false;
	battleBgm?.pause();
	unmuteEngineBgm();
}
