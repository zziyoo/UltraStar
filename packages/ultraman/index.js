import { lib, game, ui, get, ai, _status } from "../../../../noname.js";

import { loadPacks, packs } from "./loader.js";
import { registerEquipmentCards } from "./equipment/cards.js";
import { registerEquipmentSkills } from "./equipment/skills.js";

const { merged, charToPack } = loadPacks();

export default {
	characters: merged.characters,
	characterTranslate: merged.characterTranslate,
	characterTitle: merged.characterTitle,
	characterIntro: merged.characterIntro,
	skills: merged.skills,
	skillTranslate: merged.skillTranslate,
	// 角色 → 分包 id 映射，registry 据此将分包角色从扩展总包中排除
	charToPack,
	// 分包注册数据：content() 阶段经 game.addCharacterPack 注册为无名杀原生分包
	characterPacks: packs.map(pack => ({
		id: pack.id,
		name: pack.name,
		character: pack.characters ?? {},
	})),
	registerEquipmentCards,
	registerEquipmentSkills,
};
