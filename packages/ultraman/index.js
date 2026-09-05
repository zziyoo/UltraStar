import { lib, game, ui, get, ai, _status } from "../../../../noname.js";

import { loadPacks, packs } from "./loader.js";

// 旧分类迁移源：角色正式迁入 packs/<分包>/ 后，对应文件中的条目应移除
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

const { merged, charToPack } = loadPacks();

export default {
	characters: Object.assign({}, _c0, _c1, _c2, merged.characters),
	characterTranslate: Object.assign({}, _ctr, merged.characterTranslate),
	characterTitle: Object.assign({}, _cti, merged.characterTitle),
	characterIntro: Object.assign({}, _cin, merged.characterIntro),
	skills: Object.assign({}, _s0, _s1, _s2, _s3, merged.skills),
	skillTranslate: Object.assign({}, _st, merged.skillTranslate),
	// 角色 → 分包 id 映射（仅含已迁入分包的角色），registry 据此将分包角色从总包中排除
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
