import { lib, game, ui, get, ai, _status } from "../../../../noname.js";

import bgmList from "../../data/bgmList.js";

// 初始化全局 BGM 播放系统（arenaReady 时调用）
export function initBgmSystem() {
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
		const files = bgmList[key];
		if (!files?.length) return;
		const audioKey = `${key}_audio`;
		if (!game[audioKey] || game[audioKey].ended) {
			if (!game.hasOtherBgmPlaying(game[audioKey])) {
				const file = files[Math.floor(Math.random() * files.length)];
				game[audioKey] = new Audio(`extension/奥特之星/assets/${file}`);
				game.addBgmToList(game[audioKey]);
				game[audioKey].play();
			}
		}
	};
}
