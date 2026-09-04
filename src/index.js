import { lib, game, ui, get, ai, _status } from "../../../noname.js";

import { arenaReady, precontent } from "./core/bootstrap.js";
import { buildPackage } from "./core/registry.js";
import config from "./config/index.js";

export default function () {
	return {
		name: "奥特之星",
		content: function (config, pack) {},
		arenaReady,
		precontent,
		help: {},
		config,
		package: buildPackage(),
	};
}
