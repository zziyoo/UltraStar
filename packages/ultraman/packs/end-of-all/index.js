import { lib, game, ui, get, ai, _status } from "../../../../../../noname.js";

import { characters } from "./characters.js";
import { skills } from "./skills.js";
import { characterTranslate, skillTranslate } from "./translate.js";
import { characterTitle, characterIntro } from "./data.js";

// id 用于代码与路径；name 用于游戏内分包显示名，二者分离，改名只需改 name
export default {
	id: "end-of-all",
	name: "万物终焉",
	characters,
	skills,
	characterTranslate,
	skillTranslate,
	characterTitle,
	characterIntro,
};
