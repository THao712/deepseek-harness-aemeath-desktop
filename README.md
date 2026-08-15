# DeepSeek Harness Aemeath Desktop

[![Release](https://img.shields.io/github/v/release/THao712/deepseek-harness-aemeath-desktop)](https://github.com/THao712/deepseek-harness-aemeath-desktop/releases/latest)
[![Platform](https://img.shields.io/badge/platform-Windows%20x64-0078D4)](https://github.com/THao712/deepseek-harness-aemeath-desktop/releases)
[![License](https://img.shields.io/badge/license-MIT-31c48d)](LICENSE)

DeepSeek Harness Aemeath Desktop 是一个面向 Windows 的非官方桌面封装。它将官方 [`@deepseek-ai/dsh`](https://github.com/deepseek-ai/deepseek-harness) 运行时、Electron 桌面外壳和爱弥斯主题打包在一起，安装后点击快捷方式即可使用。

This is an unofficial Windows desktop distribution of DeepSeek Harness with the Aemeath theme. The installer bundles the runtime; end users do not need to install Node.js.

## 功能

- Windows 10/11 x64 桌面应用与可选安装目录的 NSIS 安装器。
- 爱弥斯主题：角色背景、像素助手、动态星空、星瞳高光、发丝渐变和晶羽折射效果。
- 欢迎页优先展示角色，同时以遮罩保证输入框和正文可读。
- 修复 Electron 下原生 Windows 目录选择器的跨盘切换崩溃。
- Windows 极简模式使用内置 `pwsh` 工具，避免不受支持的终端检查错误。
- 完整打包 DeepSeek Harness 动态插件依赖，可离开源码目录独立运行。

## 安装

1. 打开 [Releases](https://github.com/THao712/deepseek-harness-aemeath-desktop/releases/latest)。
2. 下载 `DeepSeek-Harness-Aemeath-Setup-0.1.0.exe`。
3. 运行安装器并选择安装目录，可安装到 C、D、E 等任意可写盘符。
4. 从桌面或开始菜单启动 `DeepSeek Harness Aemeath`。

当前安装包未购买商业代码签名证书，Windows SmartScreen 可能显示“未知发布者”。请只从本仓库 Release 下载，并可使用 Release 中的 SHA-256 文件核对完整性。

应用首次运行会显示 DeepSeek Harness 的开发者预览声明。模型和 API 凭据需要在 Harness 的设置页面中自行配置。

## 开发

要求：Windows 10/11、Node.js 22 或更高版本、npm、Git。

```powershell
git clone https://github.com/THao712/deepseek-harness-aemeath-desktop.git
cd deepseek-harness-aemeath-desktop
npm ci
npm start
```

`postinstall` 会自动应用两个针对 DeepSeek Harness `0.1.0-rc.6` 的补丁。上游版本升级后，补丁脚本会在无法识别目标代码时停止，而不是静默修改未知实现。

## 构建安装包

```powershell
npm ci
npm run verify:minimal-windows
npm run dist
```

安装包输出到 `dist/`。为了让 Electron Builder 正确遍历生产依赖，请在普通目录中执行干净的 `npm ci`；不要把 `node_modules` 做成指向其他盘的目录链接后直接发布。

## 定制主题

主要入口如下：

- `src/aemeath-theme.css`：颜色变量、布局覆盖和动效。
- `assets/aemeath-main-background.webp`：主会话背景。
- `assets/aemeath-pixel-assistant.webp`：欢迎空状态像素角色。
- `assets/aemeath-eye-backdrop.webp`：启动页眼眸背景。
- `assets/aemeath-app-icon.png`：应用图标与侧栏水印。
- `docs/AEMEATH_THEME.md`：身体特征到设计令牌的完整映射。

替换资产时保留相同文件名即可。应用启动时会把主题资产嵌入 CSS，因此发布包不依赖本机图片路径。图标可通过以下命令重新生成：

```powershell
npm run icons
```

DeepSeek Harness 仍处于 developer preview，上游组件类名或插件结构变化后，主题选择器和补丁可能需要同步调整。建议升级 `@deepseek-ai/dsh` 时先在独立分支运行和打包测试。

## 项目结构

```text
assets/   主题运行时资产
docs/     主题设计规范
scripts/  图标生成、上游补丁与验证脚本
src/      Electron 主进程、预加载脚本、启动页和主题 CSS
```

## 归属与许可证

本项目是社区作品，不是 DeepSeek 官方桌面客户端，也不代表 DeepSeek 官方立场。DeepSeek Harness、DeepSeek 名称和相关标识归各自权利人所有。

本仓库代码与仓库自有主题资产采用 [MIT License](LICENSE)。DeepSeek Harness 及各第三方依赖保留其原始许可证，详见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

## 上游

- DeepSeek Harness: https://github.com/deepseek-ai/deepseek-harness
- npm package: https://www.npmjs.com/package/@deepseek-ai/dsh
