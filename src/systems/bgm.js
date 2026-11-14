import { lib, game, ui, get } from "../../../../noname.js";

import bgmList from "../../data/bgmList.js";
import { MODE_ID } from "../rogue/config.js";

// 技能触发需要及时入场：两路音轨在同一个 1.5 秒窗口内交叉渐变。
const SKILL_BGM_FADE_MS = 1500;
const FADE_STEP_MS = 50;

// 初始化全局 BGM 播放系统（arenaReady 时调用）
export function initBgmSystem() {
	let activeAudio = null;
	let engineAudio = null;
	let engineGain = 1;
	let restoreTimer = null;
	const clamp = value => Math.max(0, Math.min(1, value));
	const engineVolume = () => {
		const value = Number(lib.config.volumn_background);
		return Number.isFinite(value) ? clamp(value / 8) : 1;
	};
	const applyEngineVolume = () => {
		// 肉鸽自己接管本体音量，旧技能的收尾不能把它的静音撤掉。
		if (!engineAudio || get.mode() === MODE_ID) return;
		const volume = engineVolume() * engineGain;
		if (engineAudio.volume !== volume) engineAudio.volume = volume;
	};
	const disconnectEngine = () => {
		engineAudio?.removeEventListener("volumechange", applyEngineVolume);
		engineAudio = null;
		engineGain = 1;
	};
	const connectEngine = () => {
		if (engineAudio === ui.backgroundMusic) return;
		disconnectEngine();
		engineAudio = ui.backgroundMusic;
		if (engineAudio) {
			const volume = engineVolume();
			engineGain = volume > 0 ? clamp(engineAudio.volume / volume) : 1;
			// 本体的音量菜单会直接写 volume；活动期间按当前渐变比例校正。
			engineAudio.addEventListener("volumechange", applyEngineVolume);
		}
	};
	const restoreEngine = duration => {
		clearTimeout(restoreTimer);
		const start = performance.now();
		const from = engineGain;
		const step = () => {
			restoreTimer = null;
			if (activeAudio) return;
			if (get.mode() === MODE_ID) {
				disconnectEngine();
				return;
			}
			const progress = duration > 0 ? clamp((performance.now() - start) / duration) : 1;
			engineGain = from + (1 - from) * progress;
			applyEngineVolume();
			if (progress < 1 && engineAudio) restoreTimer = setTimeout(step, FADE_STEP_MS);
			else disconnectEngine();
		};
		step();
	};

	game.customBgmList = [];
	game.hasOtherBgmPlaying = function (currentAudio) {
		return game.customBgmList.some(audio => audio !== currentAudio && !audio.paused);
	};
	game.addBgmToList = function (audio) {
		if (!lib.config.extension_奥特之星_bgm_enabled) {
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
		// 肉鸽模式自带大厅/战斗 BGM 独占声场，技能 BGM 叠上去会糊成一团：肉鸽会话里一律拦下。
		// 判据用本体现成的 get.mode()（lib.config.mode），directstart 重载续玩后依然有效，无需安装/恢复钩子
		if (get.mode() === MODE_ID || !lib.config.extension_奥特之星_bgm_enabled) return;
		const files = bgmList[key];
		if (!files?.length) return;
		const audioKey = `${key}_audio`;
		if (game[audioKey] && !game[audioKey].ended) return;
		if (game.hasOtherBgmPlaying(game[audioKey])) return;
		const file = files[Math.floor(Math.random() * files.length)];
		const audio = new Audio(`extension/奥特之星/assets/audio/${file}`);
		game[audioKey] = audio;
		game.addBgmToList(audio);
		const removeFromList = audio.onended;
		const targetVolume = audio.volume;
		audio.volume = 0;
		let startedAt = null;
		let initialEngineGain = 1;
		let fadeTimer = null;
		let finished = false;

		const finish = reason => {
			if (finished) return;
			finished = true;
			clearTimeout(fadeTimer);
			audio.onplaying = audio.ontimeupdate = audio.onended = audio.onpause = audio.onerror = null;
			audio.pause();
			removeFromList();
			// 播放被浏览器拦下或资源出错时 ended 不会变 true，必须允许下次重试。
			if (reason === "error" && game[audioKey] === audio) delete game[audioKey];
			if (activeAudio === audio) {
				activeAudio = null;
				restoreEngine(reason === "ended" ? 0 : SKILL_BGM_FADE_MS);
			}
		};
		const updateFade = () => {
			clearTimeout(fadeTimer);
			fadeTimer = null;
			if (finished || startedAt === null) return;
			if (audio.paused || audio.ended || activeAudio !== audio || get.mode() === MODE_ID) {
				finish(audio.ended ? "ended" : "pause");
				return;
			}
			const finiteTrack = !audio.loop && Number.isFinite(audio.duration) && audio.duration > 0;
			const rate = audio.playbackRate > 0 ? audio.playbackRate : 1;
			// 短音轨最多各用半首渐入/渐出；未知时长先正常渐入，不能误判为结尾。
			const duration = finiteTrack ? Math.min(SKILL_BGM_FADE_MS, audio.duration * 500 / rate) : SKILL_BGM_FADE_MS;
			const fadeIn = clamp((performance.now() - startedAt) / duration);
			const remaining = finiteTrack ? (audio.duration - audio.currentTime) * 1000 / rate : Infinity;
			const fadeOut = clamp(remaining / duration);
			audio.volume = targetVolume * Math.min(fadeIn, fadeOut);
			connectEngine();
			engineGain = Math.max(initialEngineGain * (1 - fadeIn), 1 - fadeOut);
			applyEngineVolume();
			// 稳态不常驻轮询；timeupdate 会在临近结尾时重新启动平滑渐变。
			if (fadeIn < 1 || remaining <= duration) fadeTimer = setTimeout(updateFade, FADE_STEP_MS);
		};
		const start = () => {
			if (finished || startedAt !== null) return;
			if (audio.paused || audio.ended || get.mode() === MODE_ID) {
				finish("pause");
				return;
			}
			startedAt = performance.now();
			activeAudio = audio;
			clearTimeout(restoreTimer);
			restoreTimer = null;
			connectEngine();
			initialEngineGain = engineGain;
			updateFade();
		};
		audio.onplaying = start;
		audio.ontimeupdate = updateFade;
		audio.onended = () => finish("ended");
		// 不延后原生 pause：黑暗迪迦会 pause 后立刻播放迪迦，必须立即释放互斥。
		audio.onpause = () => finish("pause");
		audio.onerror = () => finish("error");
		try {
			// 等实际起播再压本体：加载失败/自动播放被拒绝时仍能听到原音乐。
			Promise.resolve(audio.play()).then(start, () => finish("error"));
		} catch {
			finish("error");
		}
	};
}
