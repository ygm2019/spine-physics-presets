# Spine Physics Presets

用于 Spine 4.2 / 4.3 的 Windows 独立物理约束预设编辑工具，当前版本 **1.3.1**。基于 Electron，安装后无需额外安装 Node.js 或浏览器。

## 功能

- 骨骼与物理约束选择、链式选择、同色骨骼选择。
- 物理参数编辑，预设保存、应用、导入与导出；内置头发、胸部、蓬松衣服预设。
- 可编辑快捷键设置；同色选择默认 `Ctrl+Q`，取消选择默认 `Esc` / `Ctrl+Shift+A`，动画播放默认 `Space`。
- 选择或拖入一个文件，自动识别同目录的 JSON、`.skel`、`.skel.bytes`、`.atlas`、`.atlas.txt` 和 atlas 引用的纹理。
- 骨骼旋转和缩放继承复选框、撤销与重做、保存和导出 JSON。
- 动画平铺列表、播放/暂停、循环、速度、进度控制，以及可拖动的动画与操作记录分隔线。

二进制骨骼导入需要已安装并激活的官方 Spine CLI，可通过 `SPINE_CLI` 指定 `Spine.com` 路径。转换使用文件对应的 Spine 版本，生成独立的 `.physics.json`，不覆盖原始二进制文件和已有 JSON。修改后在 Spine 中使用 Import Data 导入 JSON。

## 开发与测试

安装 Node.js 和 npm 后，在项目目录执行：

```sh
npm ci
npm start
npm run check
npm test
npm run test:desktop
```

桌面测试需要 Windows；二进制测试还需要官方 Spine CLI。内置预设已经随源码提交，构建不依赖开发者桌面上的文件。

## 构建

```sh
npm run dist
```

安装包输出到 `dist/Spine-Physics-Presets-Setup-1.3.1.exe`。当前安装包没有商业代码签名证书。安装和卸载不会主动删除已保存的用户预设库。

如需主动更新内置预设，可把符合格式的 `spine-physics-presets1.json` 放在当前用户桌面，再执行 `node scripts/sync-default-presets.cjs`；此步骤不是正常构建的前提。

## 源码结构

```text
src/desktop/                Electron 主进程、IPC、文件导入和保存
src/renderer/               界面、参数编辑、快捷键和动画预览
src/renderer/spine-runtime/ 官方 Spine WebGL 运行时
tests/                      单元测试与演示素材
scripts/                    校验、桌面回归和构建辅助
build/                      程序图标
LICENSES/                   第三方许可
```

`HANDOFF-CODEX.md` 记录实现、验证和历史版本细节。`scripts/migrate.cjs` 是历史迁移工具，需要旧网页文件，不属于开发或构建流程。

## 第三方许可

官方 Spine Runtimes 许可保留于 `LICENSES/Spine-Runtimes.txt`，图标许可保留于 `LICENSES/lucide.txt`。使用与分发需遵守对应许可。

本仓库仅包含物理预设工具；正在制作的 Mesh 自动布点项目、学习样本和分析结果不在此仓库中。
