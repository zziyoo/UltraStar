import { lib, game, ui, get, ai, _status } from "../../../../noname.js";

import { packages } from "./loader.js";

// 将各作品声明的分包注册为无名杀原生 characterPack（扩展 content() 阶段调用）。
// 本体机制：lib.characterPack[包ID] = {角色ID: 角色数据}，
// 分包显示名 = lib.translate[包ID + "_character_config"]，
// 武将包菜单、选将筛选、角色详情分包小字（含十周年UI）均由本体自动反查显示。
export function registerCharacterPacks() {
	for (const pkg of packages) {
		for (const cp of pkg.characterPacks ?? []) {
			if (!cp.id || !cp.name) continue;
			const pack = { character: cp.character ?? {} };
			if (cp.characterSort) pack.characterSort = cp.characterSort;
			game.addCharacterPack(pack, cp.id);
			// addCharacterPack 会先把显示名设为包ID，此处覆盖为分包正式名（id 与显示名分离）
			lib.translate[`${cp.id}_character_config`] = cp.name;
		}
	}
}
