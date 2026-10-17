# Spine Physics Presets

用于 Spine 4.2 / 4.3 的 Windows 独立物理约束预设编辑工具，当前版本 **1.4.2**。基于 Electron，安装后无需额外安装 Node.js 或浏览器。

## 安装

从 [Releases](https://github.com/ygm2019/spine-physics-presets/releases) 下载 Windows x64 安装包，选择软件安装目录即可。安装过程中自动识别已有的 Spine.com 并保存路径；找到后直接继续，不显示额外配置页。只有自动查找失败时才提示浏览选择 Spine.com。

基础运行组件已包含，无需额外安装 Node.js 或浏览器。安装器只定位已有的 Spine，不下载、安装或激活 Spine。取消安装不会保存路径或修改用户预设。

新安装包沿用同一应用标识，正常安装的旧版会在原目录升级并保留用户预设。本机旧部署目录 `Programs/CreativeTools/SpinePhysicsPresets` 即使缺少安装注册记录也会被识别；手动指定其他目录时按用户选择安装。

## 软件更新

安装此版本后，启动约 2.5 秒后自动检查本仓库正式 Release。有新版时，右下角“提示与操作记录”中显示可点击的更新提示。点击后下载并显示进度，完成后点击“重启安装”自动升级到当前软件目录。会先保存已绑定的工程；保存失败或仍有未保存修改时阻止重启。

更新仅使用正式版，不下载预发布版或降级；不自动下载、不在普通退出时安装。下载使用 electron-updater 的 SHA512 校验。发布新版本时必须同时上传 EXE、latest.yml 和 blockmap，先上传全部文件再发布 Release。当前安装包未签名。

## 功能

- 骨骼与物理约束选择、链式选择、同色骨骼选择。
- 物理参数直接编辑并自动应用到所选骨骼：已有约束更新、没有约束自动创建；多选只同步刚改动的字段，保留其他参数差异。
- 预设保存、应用、导入与导出；原有 3 项及新增的 16 项部位预设，已有用户库自动追加且不覆盖同名自定义项。
- Ctrl+左键实时框选，框内有未选骨骼时优先增选，只有已选骨骼时减选；骨骼树和对应物理约束同步高亮定位。
- 点骨骼按工程图标显示，默认十字含中心小圆；常见几何图标显示内部方向标记。
- 操作记录始终显示最新条目，实心骨骼不再出现内部黑色描边。
- 可编辑快捷键设置；同色选择默认 `Ctrl+Q`，取消选择默认 `Esc` / `Ctrl+Shift+A`，动画播放默认 `Space`。
- 选择或拖入一个文件，自动识别同目录的 JSON、`.skel`、`.skel.bytes`、`.atlas`、`.atlas.txt` 和 atlas 引用的纹理。
- 骨骼旋转和缩放继承复选框、撤销与重做、保存和导出 JSON。
- 动画平铺列表、播放/暂停、循环、速度、进度控制，以及可拖动的动画与操作记录分隔线。

二进制骨骼导入需要已安装并激活的官方 Spine CLI，可通过 `SPINE_CLI` 指定 `Spine.com` 路径。转换使用文件对应的 Spine 版本，生成独立的 `.physics.json`，不覆盖原始二进制文件和已有 JSON。修改后在 Spine 中使用 Import Data 导入 JSON。

参数变动约每 120 毫秒合并应用，完成输入或拖动后立即提交；自动保存沿用原 JSON 的备份与冲突保护。未选骨骼时仅编辑面板，不修改工程；同一骨骼存在多个物理约束时，请在约束列表明确选择后编辑。已移除“应用物理参数”按钮，`Ctrl+Enter` 可立即应用待处理改动。“更新载入的约束”仍保留，用于显式完整更新和目标重定向。

本版改动详见 [CHANGELOG.md](CHANGELOG.md)。

## 开发与测试

安装 Node.js 和 npm 后，在项目目录执行：

```sh
npm ci
npm start
npm run check
npm test
npm run test:desktop
npm run test:auto-parameters
```

桌面测试需要 Windows；二进制测试还需要官方 Spine CLI。内置预设已经随源码提交，构建不依赖开发者桌面上的文件。

## 构建

```sh
npm run dist
```

安装包输出到 `dist/Spine-Physics-Presets-Setup-1.4.2.exe`。当前安装包没有商业代码签名证书。安装和卸载不会主动删除已保存的用户预设库。

仅验证安装依赖改动并重新打包：`npm run dist:installer`。依赖定位测试：`npm run test:installer`。安装向导以实际安装包检查，不再生成额外的原生测试 EXE。测试目录、临时假 CLI 和测试报告均不属于发布载荷。

更新针对性测试：`npm run test:updates`；打包后的通知与保存保护检查：`node scripts/update-smoke.cjs "dist/win-unpacked/Spine Physics Presets.exe"`。本次仅测试相关改动，未重跑整体回归，也未真实执行覆盖安装。

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
