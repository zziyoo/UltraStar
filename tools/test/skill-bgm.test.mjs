// 技能 BGM 的音量交接与异步生命周期：node --test tools/test/skill-bgm.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import bgmList from "../../data/bgmList.js";
import { MODE_ID } from "../../src/rogue/config.js";

const source = readFileSync(new URL("../../src/systems/bgm.js", import.meta.url), "utf8")
	.replace(/^import[\s\S]*?;\s*/gm, "")
	.replace(/^export\s+/gm, "");
const settle = async () => { await Promise.resolve(); await Promise.resolve(); };
const near = (actual, expected, message) => assert(Math.abs(actual - expected) < 0.02, `${message}: ${actual} ≠ ${expected}`);
const between = (value, maximum, message) => assert(value > 0 && value < maximum, `${message}: ${value}`);

function fixture() {
	let now = 0, timerId = 0;
	const timers = new Map(), audios = [], playModes = [];
	const setTimeout = (fn, delay = 0) => {
		const id = ++timerId;
		timers.set(id, { fn, at: now + Math.max(0, Number(delay) || 0) });
		return id;
	};
	class FakeAudio {
		constructor(src = "") {
			Object.assign(this, { src, paused: true, ended: false, duration: 60, currentTime: 0,
				loop: false, muted: false, error: null, playing: false, listeners: new Map(), _volume: 1 });
			audios.push(this);
		}
		get volume() { return this._volume; }
		set volume(value) {
			if (!Number.isFinite(value) || value < 0 || value > 1) throw new RangeError("invalid volume");
			if (value === this._volume) return;
			this._volume = value;
			setTimeout(() => this.emit("volumechange"));
		}
		addEventListener(type, fn, options) {
			if (!this.listeners.has(type)) this.listeners.set(type, new Map());
			this.listeners.get(type).set(fn, options?.once === true);
		}
		removeEventListener(type, fn) { this.listeners.get(type)?.delete(fn); }
		emit(type) {
			const event = { type, target: this };
			this[`on${type}`]?.call(this, event);
			for (const [fn, once] of [...(this.listeners.get(type) ?? [])]) {
				if (once) this.removeEventListener(type, fn);
				fn.call(this, event);
			}
		}
		play() {
			if (playModes.shift() === "throw") throw new Error("synchronous play failure");
			this.paused = false;
			this.ended = false;
			const promise = new Promise((resolve, reject) => {
				this.resolvePlay = resolve;
				this.rejectPlay = reject;
			});
			// 让旧实现的未处理拒绝不污染其他用例；恢复与重试仍由真实生产代码负责。
			promise.catch(() => {});
			return promise;
		}
		succeed() {
			if (!this.paused) { this.playing = true; this.emit("playing"); }
			this.resolvePlay?.();
		}
		reject() {
			this.paused = true;
			this.playing = false;
			this.rejectPlay(new Error("play rejected"));
		}
		pause() {
			const changed = !this.paused;
			this.paused = true;
			this.playing = false;
			// 浏览器同步更新 paused，稍后才发 pause 事件；下一技能可在事件前进入。
			if (changed) setTimeout(() => this.emit("pause"));
		}
		finish() {
			this.currentTime = this.duration;
			this.ended = true;
			this.pause();
			this.emit("timeupdate");
			this.emit("ended");
		}
	}
	const engine = new FakeAudio("engine.mp3");
	audios.pop();
	Object.assign(engine, { _volume: 0.75, paused: false, playing: true, currentTime: 7, duration: Infinity });
	const lib = { config: { mode: "identity", extension_奥特之星_bgm_enabled: true, volumn_background: 6 } };
	const game = {}, ui = { backgroundMusic: engine };
	vm.runInNewContext(`${source}\ninitBgmSystem();`, {
		lib, game, ui, get: { mode: () => lib.config.mode }, ai: {}, _status: {}, bgmList, MODE_ID,
		Audio: FakeAudio, performance: { now: () => now }, setTimeout, clearTimeout: id => timers.delete(id),
		Date: class extends Date { static now() { return now; } }, console,
	}, { filename: "src/systems/bgm.js" });
	function moveTo(time) {
		const seconds = (time - now) / 1000;
		now = time;
		for (const audio of [engine, ...audios]) {
			if (!audio.playing || audio.paused) continue;
			audio.currentTime += seconds;
			if (Number.isFinite(audio.duration) && audio.currentTime >= audio.duration) {
				if (audio.loop) audio.currentTime %= audio.duration;
				else audio.finish();
			}
		}
	}
	async function advance(ms) {
		await settle();
		const target = now + ms;
		let count = 0;
		while (true) {
			const next = [...timers].filter(([, task]) => task.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
			if (!next) {
				if (now < target) { moveTo(target); await settle(); continue; }
				break;
			}
			assert(++count < 10000, "timer/volumechange feedback loop");
			timers.delete(next[0]);
			moveTo(next[1].at);
			next[1].fn();
			await settle();
		}
	}
	async function start(key = "xikali", properties = {}) {
		game.playSkillBgm(key);
		const audio = game[`${key}_audio`];
		Object.assign(audio, properties);
		audio.succeed();
		await advance(1500);
		return audio;
	}
	return { lib, game, engine, audios, playModes, advance, start };
}

test("起播成功前不压本体，成功后以 1.5 秒交叉渐变接管", async () => {
	const f = fixture();
	f.game.playSkillBgm("xikali");
	const audio = f.game.xikali_audio;
	await f.advance(500);
	assert.equal(f.engine.volume, 0.75, "缓冲中保留本体音乐");
	assert.equal(audio.volume, 0, "技能起播前先静音，避免音量突跳");
	audio.succeed();
	await f.advance(750);
	between(audio.volume, 1, "技能正在渐入");
	between(f.engine.volume, 0.75, "本体正在渐出");
	await f.advance(750);
	near(audio.volume, 1, "保留技能原目标音量");
	near(f.engine.volume, 0, "技能独占");
	assert.equal(f.engine.src, "engine.mp3");
	assert.equal(f.engine.paused, false);
	near(f.engine.currentTime, 9, "本体继续原曲进度");
});

test("自然结尾最后 1.5 秒双向渐变，结束时本体恢复", async () => {
	const f = fixture(), audio = await f.start("xikali", { duration: 10 });
	audio.currentTime = 8.5;
	audio.emit("timeupdate");
	await f.advance(750);
	between(audio.volume, 1, "结尾技能正在渐出");
	between(f.engine.volume, 0.75, "本体同时渐入");
	await f.advance(750);
	assert.equal(audio.ended, true);
	near(f.engine.volume, 0.75, "自然结束恢复本体");
});

for (const failure of ["reject", "throw", "error"]) {
	test(`${failure} 后释放音轨并可重试同一技能`, async () => {
		const f = fixture();
		if (failure === "throw") f.playModes.push("throw");
		assert.doesNotThrow(() => f.game.playSkillBgm("xikali"));
		const failed = f.audios.at(-1);
		if (failure === "reject") failed.reject();
		if (failure === "error") {
			failed.succeed();
			await f.advance(1500);
			failed.error = { code: 4 };
			failed.playing = false;
			failed.emit("error");
		}
		await f.advance(1500);
		near(f.engine.volume, 0.75, "失败后恢复本体");
		f.game.playSkillBgm("xikali");
		const retry = f.game.xikali_audio;
		assert(retry && retry !== failed, "失败缓存不得阻止同 key 重试");
		retry.succeed();
		await f.advance(1500);
		near(retry.volume, 1, "重试正常渐入");
		near(f.engine.volume, 0, "重试成功接管本体");
	});
}

test("等待播放时被暂停，迟到的成功不得静音本体", async () => {
	const f = fixture();
	f.game.playSkillBgm("xikali");
	const audio = f.game.xikali_audio;
	audio.pause();
	audio.succeed();
	await f.advance(3000);
	assert.equal(audio.paused, true);
	assert.equal(f.engine.volume, 0.75);
});

test("原生 pause 立即停播，并在 1.5 秒内恢复本体", async () => {
	const f = fixture(), audio = await f.start();
	near(f.engine.volume, 0, "暂停前已接管");
	audio.pause();
	assert.equal(audio.paused, true, "不能延迟原生 pause");
	await f.advance(750);
	between(f.engine.volume, 0.75, "暂停后本体正在渐入");
	await f.advance(750);
	near(f.engine.volume, 0.75, "暂停后不能永久静音");
});

test("黑暗迪迦同步暂停换曲，旧 pause/ended 不影响新曲", async () => {
	const f = fixture(), old = await f.start("hadj");
	old.pause();
	old.currentTime = 0;
	f.game.playSkillBgm("djsj");
	const next = f.game.djsj_audio;
	assert(next, "原生暂停后下一技能必须能立即起播");
	next.succeed();
	await f.advance(1500);
	old.finish();
	await f.advance(1500);
	assert.equal(next.paused, false);
	near(next.volume, 1, "新曲不受旧事件影响");
	near(f.engine.volume, 0, "旧曲不能解除新曲对本体的覆盖");
});

test("调本体音量不打破独占，结束按最新设置恢复", async () => {
	const f = fixture(), audio = await f.start();
	f.lib.config.volumn_background = 2;
	f.engine.volume = 0.25;
	await f.advance(0);
	near(f.engine.volume, 0, "volumechange 后仍独占");
	near(audio.volume, 1, "技能音量不受本体设置影响");
	audio.pause();
	await f.advance(1500);
	near(f.engine.volume, 0.25, "读取最新本体音量");
});

for (const started of [false, true]) {
	test(`不同技能互斥：${started ? "已经播放" : "仍在等待播放"}`, async () => {
		const f = fixture();
		f.game.playSkillBgm("xikali");
		if (started) { f.game.xikali_audio.succeed(); await f.advance(1500); }
		f.game.playSkillBgm("mks");
		assert.equal(f.audios.length, 1, "不能叠加第二首技能曲");
	});
}

for (const guard of ["rogue", "disabled", "unknown"]) {
	test(`${guard} 入口不创建音轨、不动本体`, async () => {
		const f = fixture();
		if (guard === "rogue") f.lib.config.mode = MODE_ID;
		if (guard === "disabled") f.lib.config.extension_奥特之星_bgm_enabled = false;
		f.game.playSkillBgm(guard === "unknown" ? "missing-skill-key" : "xikali");
		await f.advance(2000);
		assert.equal(f.audios.length, 0);
		assert.equal(f.engine.volume, 0.75);
		assert.equal(f.engine.paused, false);
		assert.equal(f.engine.src, "engine.mp3");
	});
}

for (const duration of [NaN, Infinity]) {
	test(`未知时长 ${duration} 不触发错误的尾段静音`, async () => {
		const f = fixture(), audio = await f.start("xikali", { duration });
		audio.currentTime = 100;
		audio.emit("timeupdate");
		await f.advance(3000);
		near(audio.volume, 1, "未知尾段继续正常播放");
		near(f.engine.volume, 0, "技能仍覆盖本体");
	});
}
