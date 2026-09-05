# 奥特之星 (UltraStar)

无名杀扩展：以奥特曼为主题的多作品角色包（奥特曼 / 原神 / 崩坏：星穹铁道 / 赛马娘 / KOF / 其他）。

## 目录结构

- `extension.js` — 无名杀扩展入口（极简）
- `src/` — 扩展级公共代码（core 加载与注册 / systems 公共系统 / ui / config）
- `packages/` — 作品内容包（小型包文件直接平铺在包根目录：index / characters / skills / translate / characters-meta / equipment（装备卡牌）/ equipment-skills（装备技能）/ voices（台词，格式同本体 character/<包>/voices.js）/ dynamicTranslate（动态技能描述）；ultraman 大包保留 equipment / packs / shared 子目录模块化组织，各分包内同样含 voices.js 与 dynamicTranslate.js）
- `assets/` — 普通素材（图片 + 音频平铺存放，文件名全局唯一）
  - `assets/camp/` — 势力（阵营）图片
  - `assets/easteregg/` — 彩蛋音频（dayunlaile / saiwen）
  - `assets/tierlist/` — 角色评级图 tierlist.png
- `data/` — 纯数据（素材清单 / BGM / 装备信息）
- `tools/` — 构建、检查、脚本

## 新增作品

在 `packages/` 下新建作品目录并实现 `index.js`（导出 characters / skills / translate 等），
加入 `src/core/loader.js` 的 packages 列表，普通素材直接放入 `assets/`（彩蛋音频放入 `assets/easteregg/`）。
