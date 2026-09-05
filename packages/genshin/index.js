import { lib, game, ui, get, ai, _status } from "../../../../noname.js";

import { characters as _c0 } from "./characters.js";
import { skills as _s0 } from "./skills.js";
import { translate as _st } from "./translate.js";
import { characterTranslate as _ctr, characterTitle as _cti, characterIntro as _cin } from "./characters-meta.js";
import { registerEquipment } from "./equipment.js";
import { registerEquipmentSkills } from "./equipment-skills.js";
import { voices } from "./voices.js";
import { dynamicTranslates } from "./dynamicTranslate.js";

export default {
	id: "genshin",
	name: "原神",
	characters: Object.assign({}, _c0),
	characterTranslate: Object.assign({}, _ctr),
	characterTitle: Object.assign({}, _cti),
	characterIntro: Object.assign({}, _cin),
	skills: Object.assign({}, _s0),
	skillTranslate: Object.assign({}, _st),
	voices,
	dynamicTranslate: dynamicTranslates,
	registerEquipment,
	registerEquipmentSkills,
};
