# Spine Physics Presets

用于 **Spine 4.2 / 4.3** 的 Windows 物理约束预设工具，方便批量调整参数、复用预设和预览效果。

**[下载最新安装包](https://github.com/ygm2019/spine-physics-presets/releases/latest)** · [更新记录](CHANGELOG.md)

## 主要功能

- **批量编辑**：选择多根骨骼调整物理参数，自动创建或更新约束；支持框选、链式选择和同色选择。
- **预设管理**：内置常用部位预设，支持保存、应用、导入和导出自定义预设。
- **实时预览**：显示骨骼、约束与贴图，支持动画播放、暂停和进度调整。
- **编辑辅助**：撤销与重做、自动保存、旋转与缩放继承设置，以及自定义快捷键。

## 使用方法

1. 从 Spine 导出 JSON，勾选“非必要的数据”和“纹理图集的打包”，将导出的文件拖入本工具。
2. 选择骨骼，应用预设或直接调整参数；修改会自动应用并保存到导入的原 JSON，首次保存时备份原文件。
3. 回到 Spine，通过“导入数据”载入修改后的 JSON。需要单独保存时，可使用“另存为 JSON”。

也支持直接导入 `.skel` / `.skel.bytes`，需要已安装并激活的官方 Spine。转换会生成独立的 `.physics.json`，不覆盖原始二进制文件。

## 安装与更新

下载 Windows x64 EXE 安装包运行即可，无需另装 Node.js 或浏览器。1.4.4 起使用 Inno Setup 打包。安装时自动定位已有的 `Spine.com`，找不到时可手动选择；升级默认沿用旧版目录并保留用户预设。

软件启动后自动检查更新。有新版时，点击右下角提示下载，完成后点击重启安装；未保存的工程会阻止重启。1.4.3 及更早版本需先手动运行新版安装包完成安装器迁移。当前安装包未签名。

<details>
<summary>开发与构建</summary>

```sh
npm ci
npm start
```

检查与测试：`npm run check`、`npm test`。构建 Windows 安装包：先安装 [Inno Setup](https://jrsoftware.org/isdl.php)，必要时设置 `INNO_SETUP_ISCC` 为 `ISCC.exe` 的绝对路径，再执行 `npm run dist`，输出位于 `dist/`。构建先生成 Electron 程序目录，再用 `build/installer.iss` 生成 EXE 和更新校验元数据，不再生成 NSIS 安装器。

桌面回归需要 Windows，二进制导入测试还需要官方 Spine CLI。更多实现与维护说明见 [HANDOFF-CODEX.md](HANDOFF-CODEX.md)。

</details>

## 第三方许可

使用与分发请遵守 [Spine Runtimes](LICENSES/Spine-Runtimes.txt) 和 [Lucide 图标](LICENSES/lucide.txt) 的许可。
