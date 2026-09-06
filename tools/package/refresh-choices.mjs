// 用当前 v* Tag 刷新 .github/workflows/package.yml 的版本下拉选项
// 选项块以 <VERSION_OPTIONS> / <OLD_VERSION_OPTIONS> / <NEW_VERSION_OPTIONS> 注释标记界定
// 无变化时不做任何操作；有变化时提交并推送（由 workflow 配置 git 身份）
import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import { execFileSync } from "node:child_process";

const root = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "..", "..");
const workflowPath = path.join(root, ".github", "workflows", "package.yml");

function fail(msg) {
	console.error(`[刷新失败] ${msg}`);
	process.exit(1);
}

function git(args, opts = {}) {
	return execFileSync("git", args, { encoding: "utf8", ...opts });
}

const tags = git(["tag", "--list", "v*", "--sort=-v:refname"]).split("\n").map(t => t.trim()).filter(Boolean);
if (!tags.length) fail("仓库中没有任何 v* Tag，跳过刷新（请先创建版本 Tag）");

const blocks = {
	VERSION_OPTIONS: ["最新版", ...tags],
	OLD_VERSION_OPTIONS: ["上一版", ...tags],
	NEW_VERSION_OPTIONS: ["最新版", ...tags],
};

let yml = fs.readFileSync(workflowPath, "utf8").replace(/^\uFEFF/, "");
let changed = false;
for (const [marker, options] of Object.entries(blocks)) {
	const start = yml.indexOf(`# <${marker}>`);
	const end = yml.indexOf(`# </${marker}>`);
	if (start < 0 || end < 0 || end < start) fail(`workflow 中找不到选项标记 <${marker}>`);
	const indent = yml.slice(0, start).split("\n").pop()?.match(/^\s*/)?.[0] ?? "";
	const block = [
		`${indent}# <${marker}>`,
		...options.map(t => `${indent}- ${t}`),
		`${indent}# </${marker}>`,
	].join("\n") + "\n";
	const startLine = yml.lastIndexOf("\n", start) + 1;
	const endLine = yml.indexOf("\n", end) + 1;
	const replacement = `${startLine >= 0 ? yml.slice(0, startLine) : ""}${block}${endLine > 0 ? yml.slice(endLine) : ""}`;
	if (replacement !== yml) {
		yml = replacement;
		changed = true;
	}
}

if (!changed) {
	console.log("版本下拉选项已是最新，无需更新");
	process.exit(0);
}
fs.writeFileSync(workflowPath, yml, "utf8");
git(["add", ".github/workflows/package.yml"]);
git(["commit", "-m", "chore: 刷新打包版本下拉选项"]);
try {
	git(["push"]);
	console.log(`版本下拉选项已刷新并推送：${tags.slice(0, 10).join(", ")}${tags.length > 10 ? ` 等共 ${tags.length} 个` : ""}`);
} catch {
	console.log("版本下拉选项已刷新并提交，但推送失败（下次运行会重试）");
}
