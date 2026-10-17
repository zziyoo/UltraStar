// 商店逻辑：技能候选随机、购买（闯关满槽替换 / 无尽进背包）、装备/卸下（仅无尽）、属性升级。
// 纯函数，可在 Node 里直接测。候选结果由调用方写进存档（shopOffers），本文件不碰 game；
// 候选池本身见 skillPool.js。

import {
	ALLOW_DUPLICATE_SKILLS,
	CURRENCY_LABEL,
	ENDLESS_STAT_UPGRADE_BASE,
	RUN_MODE,
	SKILL_BASE_PRICE,
	SKILL_CURRENCY,
	SKILL_OFFER_COUNT,
	SKILL_PRICE_SPREAD,
	SKILL_PURCHASE_COUNT,
	SKILL_REFRESH_PER_LEVEL,
	SKILL_SLOTS,
	STAT_CURRENCY,
	STAT_IDS,
} from "./config.js";
import { getStatPrice, stats } from "./data/stats.js";
import { isShopLocked } from "./curioManager.js";

const SKILL_CURRENCY_NAME = CURRENCY_LABEL[SKILL_CURRENCY] ?? SKILL_CURRENCY;
const STAT_CURRENCY_NAME = CURRENCY_LABEL[STAT_CURRENCY] ?? STAT_CURRENCY;

/** 无尽模式对外不认识的 mode 一律按闯关处理（与 getSkillBasePrice 同一口径） */
export function isEndlessRun(run) {
	return (run?.mode ?? RUN_MODE.challenge) === RUN_MODE.endless;
}

/**
 * 「当前拥有」的技能列表——所有容量/重复/失去判定都以它为准：
 *   · 无尽：run.skillInventory（完整背包；装备只是它的子集）；
 *   · 闯关：run.skills（技能栏本身就是全部持有，没有背包）。
 * 闯关存档里可能残留 v14 时代的 skillInventory 条目（背包机制后来只留给无尽）：
 * 这里一律不读，它们既不会自动装备，也不提供任何额外存储能力。
 */
export function getOwnedSkillIds(run) {
	const list = isEndlessRun(run) ? run?.skillInventory : run?.skills;
	return Array.isArray(list) ? list : [];
}

function shuffle(list, rng) {
	const out = list.slice(0);
	for (let i = out.length - 1; i > 0; i--) {
		const j = Math.floor(rng() * (i + 1));
		const keep = out[i];
		out[i] = out[j];
		out[j] = keep;
	}
	return out;
}

function hasCurrency(run, currency, amount) {
	return (run.currency?.[currency] ?? 0) >= amount;
}

function spend(run, currency, amount) {
	run.currency[currency] = Math.max(0, (run.currency?.[currency] ?? 0) - amount);
}

/**
 * 技能基准价：
 *   闯关——永远固定 SKILL_BASE_PRICE（50），与关卡彻底无关；
 *   无尽——floor(SKILL_BASE_PRICE × √当前关卡)，第 1 关即 50，之后随 √n 增长。
 * level 缺失或非法按第 1 关算；不认识的模式一律按闯关处理（固定 50）。
 */
export function getSkillBasePrice(run = null) {
	if ((run?.mode ?? RUN_MODE.challenge) !== RUN_MODE.endless) {
		return SKILL_BASE_PRICE;
	}
	const level = Number.isFinite(run?.level) ? Math.max(1, Math.floor(run.level)) : 1;
	return Math.floor(SKILL_BASE_PRICE * Math.sqrt(level));
}

/** 实际售价：基准价 ±25% 内随机后向下取整（至少 1）。rng 可注入，方便测试 */
export function getRandomSkillPrice(run = null, rng = Math.random) {
	const base = getSkillBasePrice(run);
	const min = base * (1 - SKILL_PRICE_SPREAD);
	const max = base * (1 + SKILL_PRICE_SPREAD);
	return Math.max(1, Math.floor(min + rng() * (max - min)));
}

/**
 * 属性升级经验：按模式分离，只从 run.mode + run.stats 现算，两模式互不共享。
 *   闯关——data/stats.js 的固定价格表（2,4,…,20，三项 330 与 29 关累计经验对平）；
 *   无尽——自己的 √ 曲线 floor(ENDLESS_STAT_UPGRADE_BASE × √目标等级)，随属性等级递增、可持续成长。
 * 不认识的模式按闯关处理（与 getSkillBasePrice 同一口径）；闯关表里没配价的等级返回 null。
 */
export function getStatUpgradePrice(run, statId, level) {
	const target = Math.floor(Number(level));
	if (!Number.isFinite(target) || target <= 0) {
		return null;
	}
	if ((run?.mode ?? RUN_MODE.challenge) === RUN_MODE.endless) {
		return Math.floor(ENDLESS_STAT_UPGRADE_BASE * Math.sqrt(target));
	}
	return getStatPrice(statId, target);
}

/**
 * 随机时要排除的技能 id：当前角色原生技能 + **当前拥有的全部技能**（见 getOwnedSkillIds：
 * 无尽读完整背包，含没装备的那些；闯关读技能栏本身）。
 * 只按“当前拥有状态”算，不做永久购买历史——真正被删除/失去的技能下次商店还能再出现。
 * @param {object} run 存档
 * @param {string[]} [characterSkills] 角色原生技能（由 mode.js 从 lib.character 取出后传入，保持本文件纯逻辑）
 */
export function getExcludedSkillIds(run, characterSkills = []) {
	const excluded = new Set();
	for (const list of [getOwnedSkillIds(run), characterSkills]) {
		for (const id of Array.isArray(list) ? list : []) {
			if (typeof id === "string" && id) {
				excluded.add(id);
			}
		}
	}
	return excluded;
}

/**
 * 每次进商店随机 SKILL_OFFER_COUNT 个候选。
 * 排除当前持有与角色原生技能；池子被排空时返回更少的候选（不重复填充、不死循环）。
 * @param {object} run 存档
 * @param {() => number} [rng] 可注入的随机源
 * @param {string[]} [characterSkills] 角色原生技能（见 getExcludedSkillIds）
 * @param {{ id: string }[]} candidates 候选池，由调用方用 skillPool.getShopPool() 现算——
 *        本文件保持纯逻辑，不去读本体的 lib.character
 */
export function rollSkillOffers(run, rng = Math.random, characterSkills = [], candidates = []) {
	const excluded = getExcludedSkillIds(run, characterSkills);
	const owned = new Set(getOwnedSkillIds(run));
	const pickedFrom = (Array.isArray(candidates) ? candidates : []).filter(entry => {
		if (!entry || typeof entry.id !== "string" || !entry.id) {
			return false;
		}
		if (!excluded.has(entry.id)) {
			return true;
		}
		// 已排除的只在开了“允许重复购买”时放回，且仅限“当前持有”那一条（角色原生技能永不上架）
		return ALLOW_DUPLICATE_SKILLS && owned.has(entry.id);
	});
	// 售价在生成候选时随机定死并写进存档：重载、重进商店、刷新 UI 都不再重掷。
	// 基准价按模式取（闯关固定 50，无尽 floor(50×√当前关)），只带 ±25% 浮动。
	// carried 与读档清洗后的候选同形（新摇出来的当然不是橱窗留货），免得存档里两种形状的候选混在一起
	const picked = shuffle(pickedFrom, rng).slice(0, Math.max(0, SKILL_OFFER_COUNT));
	return picked.map(entry => ({ id: entry.id, price: getRandomSkillPrice(run, rng), sold: false, carried: false }));
}

/** 剩余免费刷新次数：缺字段（旧档没这一项）按每局满额算，已经刷成 0 的原样返回 */
export function getRefreshesRemaining(run) {
	const raw = Number(run?.shopRefreshesRemaining);
	return Number.isFinite(raw) ? Math.max(0, Math.floor(raw)) : SKILL_REFRESH_PER_LEVEL;
}

/**
 * 花一次免费刷新，把本局商店的候选重掷：技能 id 与售价都重新随机（走同一个 rollSkillOffers，
 * 于是「当前角色原生技能 + 当前持有技能」的排除规则原样生效）。
 * 三条门槛：
 *   1. 技能商店没被收藏家的橱窗锁着——🔒 就是「这一批候选不许再换」，手动刷新与战斗结束的自动
 *      刷新走的是同一条禁令（按钮同时置灰，见 ui/hub.js 的 paintRefresh；判据只有这一处，
 *      所以任何 UI 入口都绕不过去）；
 *   2. 还有剩余次数；
 *   3. 本次商店还没买过技能——重掷出来的候选 sold 全是 false，已买过还让刷就等于绕过
 *      SKILL_PURCHASE_COUNT 的一局购买上限。
 * 旧候选优先排除（刷完不该原样看到同三个）；池子不够 SKILL_OFFER_COUNT 条时退回完整池子，
 * 允许旧候选重新出现——不死循环、不报错、不塞进原生/持有技能。
 * @param {object} run 存档
 * @param {() => number} [rng] 可注入的随机源
 * @param {string[]} [characterSkills] 当前角色原生技能
 * @param {{ id: string }[]} candidates 候选池（见 skillPool.getShopPool）
 * @returns {{ ok: boolean, error: string|null, run?: object, offers?: object[] }} 失败时不返回改过的 run
 */
export function refreshSkillOffers(run, rng = Math.random, characterSkills = [], candidates = []) {
	if (isShopLocked(run, "skill")) {
		return { ok: false, error: "技能商店已被收藏家的橱窗锁定，锁定期间不能刷新候选" };
	}
	const remaining = getRefreshesRemaining(run);
	if (remaining <= 0) {
		return { ok: false, error: "本局免费刷新次数已经用完" };
	}
	const current = Array.isArray(run?.shopOffers) ? run.shopOffers : [];
	if (getPurchasedCount(run) >= SKILL_PURCHASE_COUNT) {
		return { ok: false, error: "本局已经购买过技能，不能继续刷新" };
	}
	const previousIds = current.map(offer => offer?.id).filter(id => typeof id === "string" && id);
	const fresh = (Array.isArray(candidates) ? candidates : []).filter(entry => entry && !previousIds.includes(entry.id));
	let offers = rollSkillOffers(run, rng, characterSkills, fresh);
	if (offers.length < SKILL_OFFER_COUNT) {
		// 排掉旧候选就凑不满一局，说明池子太窄：这时允许旧候选重新出现
		offers = rollSkillOffers(run, rng, characterSkills, candidates);
	}
	return {
		ok: true,
		error: null,
		offers,
		run: { ...run, shopOffers: offers, shopRefreshesRemaining: remaining - 1 },
	};
}

/**
 * 本局商店（= 本次进店）已经买了几个技能：按候选上的 sold 记数，旧档缺 sold 字段按没买算。
 * 收藏家的橱窗锁着技能商店时，上一关留下的那张带 carried 标记——它继续显示「已购买」，
 * 但不再吃新的一局的额度（否则留一张就把整排货架连同刷新一起锁死了）。
 */
export function getPurchasedCount(run) {
	let count = 0;
	for (const offer of Array.isArray(run?.shopOffers) ? run.shopOffers : []) {
		if (offer?.sold && !offer?.carried) {
			count++;
		}
	}
	return count;
}

/** 按 id 取商店候选；不存在返回 null */
export function getOffer(run, offerId) {
	return (run?.shopOffers ?? []).find(offer => offer.id === offerId) ?? null;
}

/**
 * 买技能前的最后一道合法性与次数校验，与 buySkill 同源，UI 可以先问一次再决定怎么提示。
 * @param {object} run
 * @param {string} offerId
 * @param {{ isSkillAllowed?: (id: string) => boolean }} [options]
 *        isSkillAllowed 由调用方（mode.js）注入——本文件保持纯逻辑，不去读本体的 lib.skill：
 *        「技能现在还在不在池子里」只有技能池答得出来。不传就跳过这一项。
 */
export function checkSkillPurchase(run, offerId, options = {}) {
	const offer = getOffer(run, offerId);
	if (!offer) {
		return { ok: false, error: "该技能不在本次商店候选中" };
	}
	if (offer.sold) {
		// 橱窗留着的那批里买过的那张：说清楚是「早先那一关已经买掉了」，不是本次商店的额度问题
		return { ok: false, error: offer.carried ? "橱窗留着的那件已经买过了" : "本次商店已购买过技能" };
	}
	if (getPurchasedCount(run) >= SKILL_PURCHASE_COUNT) {
		return { ok: false, error: `本局最多只能购买 ${SKILL_PURCHASE_COUNT} 个技能` };
	}
	const allowed = options.isSkillAllowed;
	if (typeof allowed === "function" && !allowed(offerId)) {
		// 存档里的 shopOffers 可能来自旧版本 / 被改过：技能可能已经下架、被判不兼容、甚至根本不存在。
		// 这里统一挡掉，避免过期候选绕过技能池规则。
		return { ok: false, error: "该技能已下架或不再可售，换个别的吧" };
	}
	return { ok: true, error: null, offer };
}

/**
 * 购买技能，按模式分两条路：
 *   · 闯关（旧版机制）：技能栏就是全部持有，上限 SKILL_SLOTS。未满直接获得；已满时**必须**
 *     给出合法的 replaceId（技能栏里已有的一个）才能成交，被替换的旧技能直接失去、不进任何背包；
 *     取消/没给 replaceId 时 ok:false、不扣款。
 *   · 无尽（背包机制）：购买只进 run.skillInventory，**不替换、不自动装备**，装备位满也照买不误。
 * 三道闸门：
 *   1. 本局购买次数上限由 SKILL_PURCHASE_COUNT 真正驱动（不再只是刷新时的旁敲侧击）；
 *   2. 技能合法性最终校验：技能存在、当前仍允许进入肉鸽池、不是已禁用/已失效技能；
 *   3. 货币、重复持有（按当前拥有判重）等原有规则。
 * 返回 { ok, error, run, removed }；失败时 run 与传入的 run 是同一份未修改数据。
 * removed 只在闯关满槽替换时是被换下的技能 id（商店据此结算遗忘之石/贪食魔盒），其余情况为 null。
 * @param {string|null} [replaceId] 闯关满槽时指定要被替换的技能；无尽忽略
 * @param {{ isSkillAllowed?: (id: string) => boolean }} [options] 见 checkSkillPurchase
 */
export function buySkill(run, offerId, replaceId = null, options = {}) {
	const check = checkSkillPurchase(run, offerId, options);
	if (!check.ok) {
		return { ok: false, error: check.error };
	}
	const offer = check.offer;
	if (!Number.isFinite(offer.price) || !hasCurrency(run, SKILL_CURRENCY, offer.price)) {
		return { ok: false, error: `${SKILL_CURRENCY_NAME}不足` };
	}
	if (getOwnedSkillIds(run).includes(offerId) && !ALLOW_DUPLICATE_SKILLS) {
		return { ok: false, error: "已拥有该技能" };
	}

	const next = {
		...run,
		skills: Array.isArray(run.skills) ? run.skills.slice(0) : [],
		currency: { ...run.currency },
		shopOffers: run.shopOffers.map(item => ({ ...item })),
	};
	let removed = null;
	if (isEndlessRun(run)) {
		const inventory = getOwnedSkillIds(run).slice(0);
		inventory.push(offerId);
		next.skillInventory = inventory;
	} else {
		if (next.skills.length >= SKILL_SLOTS) {
			if (!replaceId || !next.skills.includes(replaceId)) {
				return { ok: false, error: `技能槽已满（${next.skills.length}/${SKILL_SLOTS}），需要先替换一个已有技能` };
			}
			next.skills = next.skills.filter(id => id !== replaceId);
			removed = replaceId;
		}
		next.skills.push(offerId);
		// 闯关的权威列表是 skills；skillInventory 只是给旧 v14 档保留的历史数据（可能为空/残留）。
		// 这里只同步本次真正换入/换出的技能，绝不把换下的旧技能留在背包里变成额外存储。
		const inventory = (Array.isArray(run.skillInventory) ? run.skillInventory : []).slice(0);
		if (removed) {
			const index = inventory.indexOf(removed);
			if (index >= 0) {
				inventory.splice(index, 1);
			}
		}
		if (!inventory.includes(offerId)) {
			inventory.push(offerId);
		}
		next.skillInventory = inventory;
	}
	spend(next, SKILL_CURRENCY, offer.price);
	const target = next.shopOffers.find(item => item.id === offerId);
	if (target) {
		target.sold = true;
	}

	return { ok: true, error: null, run: next, removed };
}

/**
 * 装备一个已拥有的技能（**仅无尽**）：只改 run.skills（从背包挪进装备位），背包与货币一个字不动。
 * 不满足时 ok:false 且零副作用；换装策略由玩家决定——装备位满时必须先卸下（这里不提供隐式替换）。
 * 闯关没有背包概念，装备/卸下入口整个不存在；这里也挡一道，防止别的路径绕过容量规则。
 */
export function equipSkill(run, skillId) {
	if (!isEndlessRun(run)) {
		return { ok: false, error: "闯关模式没有技能背包，不能装备或卸下技能", run };
	}
	const inventory = Array.isArray(run?.skillInventory) ? run.skillInventory : [];
	if (!inventory.includes(skillId)) {
		return { ok: false, error: "并未拥有该技能", run };
	}
	const skills = Array.isArray(run?.skills) ? run.skills : [];
	if (skills.includes(skillId)) {
		return { ok: false, error: "该技能已经装备", run };
	}
	if (skills.length >= SKILL_SLOTS) {
		return { ok: false, error: `装备位已满（${skills.length}/${SKILL_SLOTS}），先卸下一个技能再装备`, run };
	}
	return { ok: true, error: null, run: { ...run, skills: [...skills, skillId] } };
}

/**
 * 卸下一个已装备的技能（**仅无尽**）：只把它从 run.skills 拿掉，技能仍留在 run.skillInventory——
 * 「卸下」不是「失去」，既不触发遗忘之石/贪食魔盒，也不影响任何以持有为准的判定。
 * 闯关模式没有背包，卸下后技能就无处可放，所以整条入口不存在。
 */
export function unequipSkill(run, skillId) {
	if (!isEndlessRun(run)) {
		return { ok: false, error: "闯关模式没有技能背包，不能装备或卸下技能", run };
	}
	const skills = Array.isArray(run?.skills) ? run.skills : [];
	if (!skills.includes(skillId)) {
		return { ok: false, error: "该技能并未装备", run };
	}
	return { ok: true, error: null, run: { ...run, skills: skills.filter(id => id !== skillId) } };
}

/** 属性升级检查：当前等级、上限、货币三项一起判 */
export function checkStatUpgrade(run, statId) {
	if (!STAT_IDS.includes(statId)) {
		return { ok: false, error: "没有该属性" };
	}
	const cfg = stats[statId];
	const level = run?.stats?.[statId] ?? 0;
	if (level >= cfg.maxLevel) {
		return { ok: false, error: "已达最高等级", level, maxLevel: cfg.maxLevel };
	}
	const price = getStatUpgradePrice(run, statId, level + 1);
	if (!Number.isFinite(price)) {
		return { ok: false, error: "该属性尚未配置升级价格", level, maxLevel: cfg.maxLevel };
	}
	if (!hasCurrency(run, STAT_CURRENCY, price)) {
		return { ok: false, error: `${STAT_CURRENCY_NAME}不足`, level, maxLevel: cfg.maxLevel, price };
	}
	return { ok: true, error: null, level, maxLevel: cfg.maxLevel, price };
}

export function upgradeStat(run, statId) {
	const check = checkStatUpgrade(run, statId);
	if (!check.ok) {
		return { ok: false, error: check.error, run };
	}
	const next = { ...run, stats: { ...run.stats, [statId]: run.stats[statId] + 1 }, currency: { ...run.currency } };
	spend(next, STAT_CURRENCY, check.price);
	return { ok: true, error: null, run: next, price: check.price };
}
