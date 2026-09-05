import { lib, game, ui, get, ai, _status } from "../../../../noname.js";

import ultraman from "../../packages/ultraman/index.js";
import genshin from "../../packages/genshin/index.js";
import honkaiStarRail from "../../packages/honkai-star-rail/index.js";
import umaMusume from "../../packages/uma-musume/index.js";
import misc from "../../packages/misc/index.js";
import kof from "../../packages/kof/index.js";

export const packages = [ultraman, genshin, honkaiStarRail, umaMusume, kof, misc];

// 注册全部作品装备：先卡片后技能，与原扩展行为一致
export function registerAllEquipment() {
	for (const pkg of packages) {
		if (pkg.registerEquipment) pkg.registerEquipment();
	}
	for (const pkg of packages) {
		if (pkg.registerEquipmentSkills) pkg.registerEquipmentSkills();
	}
}
