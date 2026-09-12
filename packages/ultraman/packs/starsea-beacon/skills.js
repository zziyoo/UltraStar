import { lib, game, ui, get, ai, _status } from "../../../../../../noname.js";

export const skills = {
	betdongjie: {
		audio: ["ext:奥特之星/assets/audio/dongjie"],
		enable: "phaseUse",
		usable: 1,
		position: "he",
		filterCard: true,
		selectCard: 1,
		filterTarget(card, player, target) {
			return target !== player && target.isIn();
		},
		selectTarget: 1,
		prompt: "冻结：弃置一张牌，令一名其他角色被冻结",
		async content(event, trigger, player) {
			const target = event.target;
			const x = Math.max(0, player.hp - target.hp);
			const num = x + 1;
			player.line(target);
			target.addSkill("betdongjie_freeze");
			target.addMark("betdongjie_freeze", num);
			target.storage.betdongjie_source = player;
		},
		ai: {
			order: 10,
			result: {
				player: 1,
				target(player, target) {
					return -(Math.max(0, player.hp - target.hp) + 1) * 2;
				},
			},
		},
		subSkill: {
			freeze: {
				charlotte: true,
				mark: true,
				marktext: "冻",
				intro: {
					name: "冻结",
					content: "剩余#回合无法使用或打出手牌",
				},
				mod: {
					cardEnabled2(card, player) {
						if (get.position(card) === "h") return false;
					},
				},
				group: ["betdongjie_gainlost"],
				trigger: {
					global: "phaseAfter",
					player: "damageEnd",
				},
				forced: true,
				silent: true,
				sourceSkill: "betdongjie",
				filter(event, player) {
					if (!player.countMark("betdongjie_freeze")) return false;
					if (event.name === "damage") return event.num > 0;
					return true;
				},
				async content(event, trigger, player) {
					player.removeMark("betdongjie_freeze", 1);
					if (!player.countMark("betdongjie_freeze")) {
						player.unmarkSkill("betdongjie_freeze");
						player.removeSkill("betdongjie_freeze");
						delete player.storage.betdongjie_source;
					}
				},
			},
			gainlost: {
				charlotte: true,
				forced: true,
				silent: true,
				sourceSkill: "betdongjie",
				trigger: { player: "loseAfter" },
				filter(event, player) {
					if (!player.countMark("betdongjie_freeze")) return false;
					if (event.type !== "discard") return false;
					if (!event.cards2?.length) return false;
					const source = player.storage.betdongjie_source;
					if (!source || !source.isIn()) return false;
					return event.cards2.some(card => get.position(card, true) === "d");
				},
				async content(event, trigger, player) {
					const source = player.storage.betdongjie_source;
					const cards = trigger.cards2.filter(card => get.position(card, true) === "d");
					if (cards.length) {
						await source.gain(cards, "gain2");
					}
				},
			},
		},
	},
	betfenshen: {
		audio: ["ext:奥特之星/assets/audio/fenshen"],
		group: ["betfenshen_damage", "betfenshen_target"],
		subSkill: {
			mark: {
				mark: true,
				marktext: "身",
				intro: {
					name: "分身",
					content: "当前共有#枚“分身”",
				},
			},
			damage: {
				audio: "betfenshen",
				charlotte: true,
				trigger: { player: "damageBegin4" },
				direct: true,
				filter(event, player) {
					return event.num > 0 && (player.countCards("he") >= 2 || player.hp > 0);
				},
				async content(event, trigger, player) {
					const choices = [];
					if (player.countCards("he") >= 2) choices.push("弃置两张牌");
					if (player.hp > 0) choices.push("失去一点体力");
					choices.push("cancel2");
					const result = await player
						.chooseControl(choices)
						.set("prompt", `分身：是否防止对你造成的${get.cnNumber(trigger.num)}点伤害？`)
						.set("ai", () => {
							if (trigger.num >= player.hp) {
								if (player.countCards("he") >= 2) return 0;
								if (player.hp > 1) return 1;
								return choices.length - 1;
							}
							if (trigger.num > 1) {
								if (player.countCards("he") >= 2) return 0;
								if (player.hp > 2) return 1;
							}
							return choices.length - 1;
						})
						.forResult();
					if (!result || result.control === "cancel2" || result.index === choices.length - 1) return;
					player.logSkill("betfenshen");
					if (result.control === "弃置两张牌") {
						await player.chooseToDiscard("he", 2, true, "分身：弃置两张牌，防止此伤害").set("ai", card => 5 - get.value(card)).forResult();
					} else {
						await player.loseHp(1);
					}
					trigger.num = 0;
					player.addMark("betfenshen_mark", 1);
					game.log(player, "防止了此伤害，获得了一枚“分身”标记");
				},
			},
			target: {
				audio: "betfenshen",
				charlotte: true,
				trigger: { target: "useCardToTargeted" },
				direct: true,
				filter(event, player) {
					if (event.player === player) return false;
					if (event.target !== player) return false;
					if (event.excluded?.includes(player)) return false;
					return player.countMark("betfenshen_mark") > 0;
				},
				async content(event, trigger, player) {
					const result = await player
						.chooseBool(`分身：是否移去一枚“分身”标记，防止${get.translation(trigger.player)}对你使用的【${get.translation(trigger.card)}】？`)
						.set("ai", () => (get.effect(player, trigger.card, trigger.player, player) < 0 ? 1 : 0))
						.forResult();
					if (!result?.bool) return;
					player.logSkill("betfenshen");
					player.removeMark("betfenshen_mark", 1);
					if (!player.countMark("betfenshen_mark")) {
						player.unmarkSkill("betfenshen_mark");
					}
					trigger.excluded.push(player);
					game.log(player, "防止了", trigger.card, "的效果");
				},
			},
		},
	},
	betshunyi: {
		audio: ["ext:奥特之星/assets/audio/shunyi"],
		limited: true,
		skillAnimation: true,
		animationColor: "water",
		seatRelated: "changeSeat",
		trigger: { target: "useCardToTargeted" },
		direct: true,
		filter(event, player) {
			if (player.storage.betshunyi) return false;
			if (event.player === player) return false;
			if (event.target !== player) return false;
			if (event.excluded?.includes(player)) return false;
			return game.players.length > 2;
		},
		async content(event, trigger, player) {
			const source = trigger.player;
			const result = await player
				.chooseTarget(
					"瞬移：选择两名相邻的角色，你将移动到他们之间",
					2,
					(card, player, target) => {
						if (target === player) return false;
						const selected = ui.selected.targets;
						if (!selected.length) return true;
						const first = selected[0];
						return first.next === target || first.previous === target;
					},
					target => {
						if (!source || get.attitude(player, source) >= 0) return 0;
						if (!source.inRange(player)) return 0;
						let best = -1;
						for (const other of [target.next, target.previous]) {
							if (!other || other === player || !other.isIn()) continue;
							const dist = get.info("betshunyi").insertDistance(player, target, other, source);
							if (dist > best) best = dist;
						}
						if (best < 0) return -1;
						return best > source.getAttackRange() ? 5 + best : -1;
					}
				)
				.forResult();
			if (!result?.bool || result.targets?.length !== 2) return;
			const [a, b] = result.targets;
			player.logSkill("betshunyi");
			player.awakenSkill("betshunyi");
			const current = game.players.slice();
			const arr = current.slice();
			arr.splice(arr.indexOf(player), 1);
			const iA = arr.indexOf(a);
			let insertIdx;
			if (arr[(iA + 1) % arr.length] === b) insertIdx = iA + 1;
			else insertIdx = arr.indexOf(b) + 1;
			arr.splice(insertIdx, 0, player);
			const targetIds = arr.map(current => current.playerid);
			const toSwapList = [];
			const cmp = (x, y) => targetIds.indexOf(x.playerid) - targetIds.indexOf(y.playerid);
			const swapArr = current.slice();
			for (let i = 0; i < swapArr.length; i++) {
				for (let j = 0; j < swapArr.length; j++) {
					if (cmp(swapArr[i], swapArr[j]) < 0) {
						toSwapList.push([swapArr[i], swapArr[j]]);
						[swapArr[i], swapArr[j]] = [swapArr[j], swapArr[i]];
					}
				}
			}
			game.broadcastAll(list => {
				for (const pair of list) game.swapSeat(pair[0], pair[1], false);
			}, toSwapList);
			game.log(player, "移动到了", a, "和", b, "之间");
			if (!source.inRange(player)) {
				trigger.excluded.push(player);
				game.log(player, "不在", source, "的攻击范围内，", trigger.card, "对其无效");
			}
		},
		insertDistance(player, a, b, source) {
			const arr = game.players.slice();
			arr.splice(arr.indexOf(player), 1);
			const iA = arr.indexOf(a);
			let insertIdx;
			if (arr[(iA + 1) % arr.length] === b) insertIdx = iA + 1;
			else insertIdx = arr.indexOf(b) + 1;
			arr.splice(insertIdx, 0, player);
			const n = arr.length;
			const sIdx = arr.indexOf(source);
			const pIdx = arr.indexOf(player);
			const fwd = (pIdx - sIdx + n) % n;
			return Math.min(fwd, n - fwd);
		},
	},
};
