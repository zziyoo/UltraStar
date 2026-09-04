import { lib, game, ui, get, ai, _status } from "../../../../noname.js";

import { characters as _c0 } from "./characters/showa.js";
import { characters as _c1 } from "./characters/heisei.js";
import { characters as _c2 } from "./characters/monsters.js";
import { skills as _s0 } from "./skills/showa.js";
import { skills as _s1 } from "./skills/heisei.js";
import { skills as _s2 } from "./skills/monsters.js";
import { skills as _s3 } from "./skills/shared.js";
import { translate as _st } from "./skills/translate.js";
import { characterTranslate as _ctr, characterTitle as _cti, characterIntro as _cin } from "./data/characters-meta.js";
import { registerEquipmentCards } from "./equipment/cards.js";
import { registerEquipmentSkills } from "./equipment/skills.js";

export default {
	characters: Object.assign({}, _c0, _c1, _c2),
	characterTranslate: Object.assign({}, _ctr),
	characterTitle: Object.assign({}, _cti),
	characterIntro: Object.assign({}, _cin),
	skills: Object.assign({}, _s0, _s1, _s2, _s3),
	skillTranslate: Object.assign({}, _st),
	registerEquipmentCards,
	registerEquipmentSkills,
};
