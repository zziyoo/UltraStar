import { lib, game, ui, get, ai, _status } from "../../../../noname.js";

import { packages } from "./loader.js";

// 角色合并顺序 = 原扩展 package.character.character 的键顺序（决定选将界面显示顺序）
const CHARACTER_ORDER = [
		"普利茨墨",//奥特曼
		"曼波",//赛马娘
		"哈基米",//赛马娘
		"米浴",//赛马娘
		"安培拉星人",//奥特曼
		"特别周",//赛马娘
		"黄金船",//赛马娘
		"奈克瑟斯",//奥特曼
		"芙宁娜芙卡洛斯",//原神
		"流萤",//崩坏
		"大丽花",//崩坏
		"忘归人",//崩坏
		"灵砂",//崩坏
		"谋曹丕",//杂项
		"那维莱特",//原神
		"奥特之父",//奥特曼
		"阿蕾奇诺",//原神
		"知更鸟",//崩坏
		"丝柯克",//原神
		"云璃",//崩坏
		"奥特之王",//奥特曼
		"遐蝶",//崩坏 --死龙也属于崩坏分包
		"目白麦昆",//赛马娘
		"闪耀迪迦",//奥特曼
		"迪迦",//奥特曼
		"黑暗迪迦",//奥特曼
		"赛迦",//奥特曼
		"希卡利",//奥特曼
		"芙宁娜",//原神
		"奥特曼",//奥特曼
		"杰克",//奥特曼
		"恰斯卡",//原神
		"玛薇卡",//原神
		"希诺宁",//原神
		"加坦杰厄",//奥特曼
		"伊格尼兹",//KOF
		"戴拿",//奥特曼
		"佐菲",//奥特曼
		"泰罗",//奥特曼
		"爻袁术",//杂项
		"艾斯",//奥特曼
		"赛文",//奥特曼
		"至高盖亚",//奥特曼
		"雷欧",//奥特曼
		"杰斯提斯",//奥特曼
		"黄泉",//崩坏
		"未遂",//杂项
		"爱迪",//奥特曼
		"阿斯特拉",//奥特曼
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
