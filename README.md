# 奥特之星 (UltraStar)

无名杀扩展：以奥特曼为主题的多作品角色包（奥特曼 / 原神 / 崩坏：星穹铁道 / 赛马娘 / KOF / 其他）。

## 目录结构

- `extension.js` — 无名杀扩展入口（极简）
- `src/` — 扩展级公共代码（core 加载与注册 / systems 公共系统 / ui / config）
- `packages/` — 作品内容包（characters / skills / equipment / data）
- `assets/` — 素材（按作品分包，common 为公共素材）
- `data/` — 纯数据（素材清单 / BGM / 装备信息）
- `tools/` — 构建、检查、脚本

## 新增作品

在 `packages/` 下新建作品目录并实现 `index.js`（导出 characters / skills / translate 等），
加入 `src/core/loader.js` 的 packages 列表，素材放入 `assets/<作品>/`。
