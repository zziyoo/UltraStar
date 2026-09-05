import { lib, game, ui, get, ai, _status } from "../../../noname.js";

import { arenaReady, precontent } from "./core/bootstrap.js";
import { buildPackage } from "./core/registry.js";
import config from "./config/index.js";

export default function () {
	return {
		name: "奥特之星",
		content: function () {
			// 分包已并入总包 characterSort，无需在 content 阶段注册；
			// content 须保留，本体仅在存在 content 时才将 arenaReady 挂载进启动流程
		},
		arenaReady,
		precontent,
		help: {},
		config,
		package: buildPackage(),
	};
}
