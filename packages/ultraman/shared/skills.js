import { lib, game, ui, get, ai, _status } from "../../../../../noname.js";

// 奥特曼跨分包共用技能。
// 准入规则：只有被两个及以上分包实际依赖的代码才能放这里，禁止把无归属的技能丢进 shared。
export const skills = {};
