import { lib, game, ui, get, ai, _status } from "../../../../noname.js";

import { skills as sharedSkills } from "./shared/skills.js";
import endOfAll from "./packs/end-of-all/index.js";
import devourWorld from "./packs/devour-world/index.js";
import eternalTorch from "./packs/eternal-torch/index.js";
import daybreak from "./packs/daybreak/index.js";
import boundlessCosmos from "./packs/boundless-cosmos/index.js";

// 奥特曼分包清单：新增分包只需新建 packs/<id>/ 并加入此数组
export const packs = [eternalTorch, daybreak, devourWorld, endOfAll, boundlessCosmos];

// 加载并验证所有分包，返回合并结果。
// 校验项：分包 id 重复/缺失、name 缺失、角色重复、技能重复、角色引用技能是否存在。
// 问题通过 console.error 报告，便于开发期快速发现。
export function loadPacks() {
	const problems = [];
	const merged = {
		characters: {},
		skills: { ...sharedSkills },
		characterTranslate: {},
		skillTranslate: {},
		characterTitle: {},
		characterIntro: {},
		voices: {},
		dynamicTranslate: {},
	};
	const seenIds = new Set();
	const seenChars = new Set();
	const seenSkills = new Set(Object.keys(sharedSkills));

	for (const pack of packs) {
		const pid = pack.id ?? "(缺少id)";
		if (!pack.id) problems.push("分包缺少 id");
		else if (seenIds.has(pack.id)) problems.push(`分包 id 重复: ${pack.id}`);
		else seenIds.add(pack.id);
		if (!pack.name) problems.push(`分包 ${pid} 缺少显示名 name`);

		for (const id of Object.keys(pack.characters ?? {})) {
			if (seenChars.has(id)) problems.push(`角色重复注册: ${id}（分包 ${pid}）`);
			else {
				seenChars.add(id);
				merged.characters[id] = pack.characters[id];
			}
		}
		for (const id of Object.keys(pack.skills ?? {})) {
			if (seenSkills.has(id)) problems.push(`技能重复注册: ${id}（分包 ${pid}）`);
			else {
				seenSkills.add(id);
				merged.skills[id] = pack.skills[id];
			}
		}
		for (const [name, info] of Object.entries(pack.characters ?? {})) {
			for (const sk of info?.skills ?? []) {
				if (!(sk in merged.skills) && !(sk in sharedSkills)) {
					problems.push(`角色 ${name}（分包 ${pid}）引用了不存在的技能: ${sk}`);
				}
			}
		}

		Object.assign(merged.characterTranslate, pack.characterTranslate ?? {});
		Object.assign(merged.skillTranslate, pack.skillTranslate ?? {});
		Object.assign(merged.characterTitle, pack.characterTitle ?? {});
		Object.assign(merged.characterIntro, pack.characterIntro ?? {});
		Object.assign(merged.voices, pack.voices ?? {});
		Object.assign(merged.dynamicTranslate, pack.dynamicTranslate ?? {});
	}

	for (const p of problems) console.error("[ultraman pack loader] " + p);

	return { merged, problems };
}
