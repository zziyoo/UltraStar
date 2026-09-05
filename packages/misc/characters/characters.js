import { lib, game, ui, get, ai, _status } from "../../../../../noname.js";

export const characters = {
	谋曹丕: {
		sex: "male",
		group: "wei",
		hp: 3,
		skills: ["mcpxingshang", "mcpfangzhu", "mcpsongwei"],
		img: "extension/奥特之星/assets/谋曹丕.jpg",
		dieAudios: ["ext:奥特之星/assets/谋曹丕.mp3"],
	},
	爻袁术: {
		sex: "male",
		group: "qun",
		hp: 4,
		skills: ["yaoyaoyi", "yaochenwei"],
		img: "extension/奥特之星/assets/爻袁术.jpg",
		dieAudios: ["ext:奥特之星/assets/爻袁术.mp3"],
	},
	未遂: {
		sex: "female",
		group: "shen",
		hp: 3,
		skills: ["wsgucheng", "wsgeshi"],
		names: "符|图纳",
		img: "extension/奥特之星/assets/未遂.jpg",
		dieAudios: ["ext:奥特之星/assets/未遂.mp3"],
	},
};
