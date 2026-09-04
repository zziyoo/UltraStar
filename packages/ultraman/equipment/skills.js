import { lib, game, get, _status } from "../../../../../noname.js";

export function registerEquipmentSkills() {
	lib.skill.atpf_skill = {
		equipSkill: true,
		trigger: { player: ["chooseToRespondBegin", "chooseToUseBegin"] },
		filter(event, player) {
			if (event.responded) return false;
			if (event.atpf_skill) return false;
			if (player === _status.currentPhase) return false;
			const card = player.getEquip("atpf1") || player.getEquip("atpf2") || player.getEquip("atpf3") || player.getEquip("atpf4") || player.getEquip("atpf5") || player.getEquip("atpf6");
			if (!card) return false;
			return (event.filterCard({ name: "sha" }, player, event) || event.filterCard({ name: "shan" }, player, event));
		},
		check(event, player) {
			if (event.ai) {
				const tmp = _status.event;
				_status.event = event;
				let result = event.ai({ name: "shan" }, player, event);
				if (!result) result = event.ai({ name: "sha" }, player, event);
				_status.event = tmp;
				return result > 0;
			}
			return true;
		},
		async content(event, trigger, player) {
			trigger.atpf_skill = true;
			const list = [];
			if (trigger.filterCard({ name: "sha" }, player, trigger)) list.push(["基本", "", "sha"]);
			if (trigger.filterCard({ name: "shan" }, player, trigger)) list.push(["基本", "", "shan"]);
			let atpfName = null;
			if (list.length === 1) {
				atpfName = list[0][2];
			} else if (list.length > 1) {
				const btnResult = await player.chooseButton(["奥特披风：选择要判定使用的牌", [list, "vcard"]], true).forResult();
				if (btnResult?.links?.length) {
					atpfName = btnResult.links[0][2];
				}
			} else {
				return;
			}
			if (atpfName) {
				const judgeEvent = await player.judge(function(judgeCard) {
					if (get.suit(judgeCard) !== "heart") {
						return 1.5;
					}
					return -0.5;
				});
				if (!judgeEvent) return;
				judgeEvent.judge2 = function(result) {
					return result.bool;
				};
				if (judgeEvent.result.judge > 0) {
					if (trigger.name === "chooseToUse") {
						const vcard = new lib.element.VCard({ name: atpfName });
						await player.chooseUseTarget(vcard, true, false);
					} else {
						trigger.set("responded", true);
						trigger.result = { bool: true, card: { name: atpfName, isCard: true } };
						trigger.set("untrigger", true);
					}
				}
			}
		},
		ai: {
			respondShan: true,
			respondSha: true,
			freeShan: true,
			freeSha: true,
		},
	};
	lib.skill.sgb_skill = {
		equipSkill: true,
		trigger: { player: "useCardToPlayered" },
		filter(event, player) {
			if (!event.isFirstTarget || (event.card.storage && event.card.storage.sgb_skill)) return false;
			const type = get.type(event.card);
			if (type !== "trick") return false;
			if (get.tag(event.card, "damage")) return false;
			return true;
		},
		check(event, player) {
			return !get.tag(event.card, "norepeat");
		},
		prompt2(event, player) {
			return "令【" + get.translation(event.card) + "】额外结算一次";
		},
		async content(event, trigger, player) {
			trigger.getParent().effectCount += 1;
		},
	};
	lib.skill.hasgb_skill = {
		equipSkill: true,
		trigger: { player: "damageEnd" },
		filter(event, player) {
			return player.countCards("he") >= 2 && !player.hasSkill("hasgb_skill_used");
		},
		check(event, player) {
			return player.countCards("he") >= 2;
		},
		prompt2(event, player) {
			return "是否发动【黑暗神光棒】弃置两张牌并回复一点体力";
		},
		async content(event, trigger, player) {
			const result = await player.chooseToDiscard("he", 2, true, "黑暗神光棒：弃置两张牌，回复一点体力").set("ai", card => 5 - get.value(card)).forResult();
			if (result.bool) {
				await player.recover(1);
				player.addTempSkill("hasgb_skill_used", "phaseAfter");
			}
		},
	};
	lib.skill.atyl_skill = {
		equipSkill: true,
		trigger: { global: "judgeFixing" },
		filter(event, player) {
			return !!event.result;
		},
		check(event, player) {
			const target = event.player;
			const card = event.card;
			if (card && get.type(card) === "delay") {
				if (get.attitude(player, target) > 0) return true;
			}
			let parent = event.getParent();
			while (parent) {
				if (parent.player && parent.player !== target && parent.name !== "useCard") {
					return true;
				}
			}
			return false;
		},
		prompt2(event, player) {
			return "是否发动【奥特哑铃】终止此次判定";
		},
		async content(event, trigger, player) {
			const evt = trigger.getParent();
			evt.finish();
			evt._triggered = null;
			if (evt.name.startsWith("pre_")) {
				const evtx = evt.getParent();
				evtx.finish();
				evtx._triggered = null;
			}
			const nexts = trigger.next.slice();
			for (let i = nexts.length - 1; i >= 0; i--) {
				if (nexts[i].name === "judgeCallback") {
					trigger.next.remove(nexts[i]);
				}
			}
		},
	};



	lib.translate.atpf_skill = "奥特披风";
	lib.translate.sgb_skill = "神光棒";
	lib.translate.hasgb_skill = "黑暗神光棒";
	lib.translate.atyl_skill = "奥特哑铃";

}
