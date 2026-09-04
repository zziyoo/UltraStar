import { lib, game, ui, get, ai, _status } from "../../../../noname.js";

import { packages } from "./loader.js";

// 角色合并顺序 = 原扩展 package.character.character 的键顺序（决定选将界面显示顺序）
const CHARACTER_ORDER = [
		"普利茨墨",
		"曼波",
		"哈基米",
		"米浴",
		"安培拉星人",
		"特别周",
		"黄金船",
		"奈克瑟斯",
		"芙宁娜芙卡洛斯",
		"流萤",
		"大丽花",
		"忘归人",
		"灵砂",
		"谋曹丕",
		"那维莱特",
		"奥特之父",
		"阿蕾奇诺",
		"知更鸟",
		"丝柯克",
		"云璃",
		"奥特之王",
		"遐蝶",
		"目白麦昆",
		"闪耀迪迦",
		"迪迦",
		"黑暗迪迦",
		"赛迦",
		"希卡利",
		"芙宁娜",
		"奥特曼",
		"杰克",
		"恰斯卡",
		"玛薇卡",
		"希诺宁",
		"加坦杰厄",
		"伊格尼兹",
		"戴拿",
		"佐菲",
		"泰罗",
		"爻袁术",
		"艾斯",
		"赛文",
		"至高盖亚",
		"雷欧",
		"杰斯提斯",
		"黄泉",
		"未遂",
		"爱迪",
		"阿斯特拉",
];

export function buildPackage() {
	const charMap = {};
	for (const pkg of packages) Object.assign(charMap, pkg.characters);
	const character = {};
	for (const name of CHARACTER_ORDER) {
		if (charMap[name]) character[name] = charMap[name];
	}
	const characterTranslate = { 奥特之星: "奥特之星" };
	const characterTitle = {};
	const characterIntro = {};
	const skill = {};
	const skillTranslate = {};
	for (const pkg of packages) {
		Object.assign(characterTranslate, pkg.characterTranslate);
		Object.assign(characterTitle, pkg.characterTitle);
		Object.assign(characterIntro, pkg.characterIntro);
		Object.assign(skill, pkg.skills);
		Object.assign(skillTranslate, pkg.skillTranslate);
	}
	return {
		character: {
			character,
			translate: characterTranslate,
			characterTitle,
			characterIntro,
		},
		card: {
			card: {},
			translate: {},
			list: [],
		},
		skill: {
			skill,
			translate: skillTranslate,
		},
		intro: "奥特五大誓言：饿着肚子不能上学；好天气要晒被子；过马路时要注意来往车辆；不要依赖别人的力量；要光着脚在地上玩",
		author: "子右",
		diskURL: "https://github.com/zziyoo/UltraStar",
		forumURL: "",
		version: "2.1.1",
	};
}
