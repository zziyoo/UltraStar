import { lib, game, ui, get, ai, _status } from "../../../../noname.js";

import { characters as _c0 } from "./characters/characters.js";
import { skills as _s0 } from "./skills/skills.js";
import { translate as _st } from "./skills/translate.js";
import { characterTranslate as _ctr, characterTitle as _cti, characterIntro as _cin } from "./data/characters-meta.js";

export default {
	characters: Object.assign({}, _c0),
	characterTranslate: Object.assign({}, _ctr),
	characterTitle: Object.assign({}, _cti),
	characterIntro: Object.assign({}, _cin),
	skills: Object.assign({}, _s0),
	skillTranslate: Object.assign({}, _st),
};
