import { lib, game, ui, get, ai, _status } from "../../../../../../noname.js";

import { characters } from "./characters.js";
import { skills } from "./skills.js";
import { characterTranslate, skillTranslate } from "./translate.js";
import { characterTitle, characterIntro } from "./data.js";
import { voices } from "./voices.js";
import { dynamicTranslates } from "./dynamicTranslate.js";

// id 用于代码与路径；name 用于游戏内分包显示名，二者分离，改名只需改 name
export default {
	id: "boundless-cosmos",
	name: "寰宇无极",
	characters,
	skills,
	characterTranslate,
	skillTranslate,
	characterTitle,
	characterIntro,
	voices,
	dynamicTranslate: dynamicTranslates,
};
