import { lib, game, ui, get, ai, _status } from "../../../../noname.js";

import { loadPacks, packs } from "./loader.js";
import { registerEquipmentCards } from "./equipment/cards.js";
import { registerEquipmentSkills } from "./equipment/skills.js";

const { merged } = loadPacks();

export default {
	characters: merged.characters,
	characterTranslate: merged.characterTranslate,
	characterTitle: merged.characterTitle,
	characterIntro: merged.characterIntro,
	skills: merged.skills,
	skillTranslate: merged.skillTranslate,
	// 分包 → 总包内部分类（characterSort）清单，registry 据此在奥特之星总包内生成分组
	characterSorts: packs.map(pack => ({
		id: pack.id,
		name: pack.name,
		characters: pack.characters ?? {},
	})),
	registerEquipmentCards,
	registerEquipmentSkills,
};
