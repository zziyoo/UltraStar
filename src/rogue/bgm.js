// 奥特之星·肉鸽 背景音乐：大厅（存档页/营地/商店）循环播 LOBBY_BGM；战斗从 BATTLE_BGM_LIST 随机起一首、一首放完随机接下一首连播。
// 音量走扩展自己的独立设置 rogue_bgm_volume（0~100，默认 100，选项在 src/config/index.js），
// 与本体「音乐音量」完全解耦：本体那把滑条调到多低、甚至调零，都只动 ui.backgroundMusic，不动本模式的音轨。

import { lib, ui } from "../../../../noname.js";
import { BATTLE_BGM_LIST, LOBBY_BGM } from "./config.js";

/** 整个会话只建一个 audio 元素：存档页↔营地↔商店之间来回切不会重起一份音轨 */
let bgm = null;
/** 当前是不是大厅在出声：进战斗立刻置 false，用来挡掉 play() 延迟兑现的 then */
let lobbyOn = false;
/** 战斗 BGM：进战斗随机起一首，一首放完随机接下一首连播（一次页面会话只打一场战斗，重载后整个音轨重建） */
let battleBgm = null;
/** 战斗 BGM 当前曲目路径：真机上 audio.src 会被解析成绝对 URL 不能反查，自己记着做「不与刚放完的重复」 */
let battleBgmPath = null;
let battleOn = false;
/** 本体自己的背景音乐被我们按成静音：只放回音量，不动它的播放状态 */
let engineMuted = false;

/** 大厅与战斗共用同一份「压下本体 BGM」：只要我们的任一音轨在出声，本体就不该出声 */
function ourBgmOn() {
	return lobbyOn || battleOn;
}

/**
 * 肉鸽 BGM 的独立音量（0~1）：只认扩展设置 rogue_bgm_volume（0~100，默认 100），
 * 与本体「音乐音量」完全解耦；旧配置缺这个键时按默认 100 读，越界值夹回 0~100。
 * 大厅与战斗的全部音轨都只经由这里取音量，不在别处各算各的。
 */
export function getRogueBgmVolume() {
	const raw = Number(lib.config?.extension_奥特之星_rogue_bgm_volume);
	const percent = Number.isFinite(raw) ? Math.max(0, Math.min(100, raw)) : 100;
	return percent / 100;
}

/** 把独立音量应用到已建出的肉鸽音轨：选项界面改动后可即时生效，不用等下一首 */
export function refreshRogueBgmVolume() {
	const volume = getRogueBgmVolume();
	if (bgm) bgm.volume = volume;
	if (battleBgm) battleBgm.volume = volume;
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
	bgm.volume = getRogueBgmVolume();
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

/** 随机抽一首战斗曲目并起播：排除刚放完的那首，避免连播同一首（列表只有一首时退回全表） */
function playNextBattleBgm() {
	if (!battleOn || !battleBgm) {
		return;
	}
	let pool = BATTLE_BGM_LIST.filter(path => path !== battleBgmPath);
	if (!pool.length) {
		pool = BATTLE_BGM_LIST;
	}
	battleBgmPath = pool[Math.floor(Math.random() * pool.length)];
	battleBgm.src = battleBgmPath;
	battleBgm.volume = getRogueBgmVolume();
	battleBgm.currentTime = 0;
	battleBgm.play().then(muteEngineBgm, () => {});
}

/**
 * 进战斗：随机起一首，一首放完由 onended 接下一首（整场连播，不与刚放完的重复），
 * 接替大厅把本体 BGM 按成静音；停止只发生在失败结算与整页重载。
 */
export function playBattleBgm() {
	battleOn = true;
	if (!battleBgm) {
		battleBgm = document.createElement("audio");
		battleBgm.loop = false;
		battleBgm.onended = playNextBattleBgm;
		document.body.appendChild(battleBgm);
	}
	playNextBattleBgm();
}

/** 停止战斗 BGM 并还原本体 BGM 音量（失败结算的 onover 调用；胜利结算故意不调——BGM 一路响到返回营地时的整页重载） */
export function stopBattleBgm() {
	battleOn = false;
	battleBgm?.pause();
	unmuteEngineBgm();
}
