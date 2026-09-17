# DeepSeek Harness Aemeath Desktop

[![Release](https://img.shields.io/github/v/release/THao712/deepseek-harness-aemeath-desktop)](https://github.com/THao712/deepseek-harness-aemeath-desktop/releases/latest)
[![Platform](https://img.shields.io/badge/platform-Windows%20x64-0078D4)](https://github.com/THao712/deepseek-harness-aemeath-desktop/releases)
[![License](https://img.shields.io/badge/license-MIT-31c48d)](LICENSE)

DeepSeek Harness Aemeath Desktop 是一个面向 Windows 的非官方桌面封装。它将官方 [`@deepseek-ai/dsh`](https://github.com/deepseek-ai/deepseek-harness) 运行时、Electron 桌面外壳和爱弥斯主题打包在一起，安装后点击快捷方式即可使用。

This is an unofficial Windows desktop distribution of DeepSeek Harness with the Aemeath theme. The installer bundles the runtime; end users do not need to install Node.js.

## 功能

- Windows 10/11 x64 桌面应用与可选安装目录的 NSIS 安装器。
- 爱弥斯主题：角色背景、像素助手、动态星空、星瞳高光、发丝渐变和晶羽折射效果。
- 设置 > 通用设置 > 外观提供浅色、深色、跟随系统、爱弥斯四个独立选项；选择立即生效并保存，官方主题不启用角色背景和动效。
- 欢迎页优先展示角色，同时以遮罩保证输入框和正文可读。
- 修复 Electron 下原生 Windows 目录选择器的跨盘切换崩溃。
- Windows 极简模式使用内置 `pwsh` 工具，避免不受支持的终端检查错误。
- 完整打包 DeepSeek Harness 动态插件依赖，可离开源码目录独立运行。
- 已同步 npm `latest` 的 `@deepseek-ai/dsh@0.1.5-rc.2`（对应 tag `dsh-v0.1.5-rc.2`）。
- 桌面端右上角提供更新按钮：从本仓库公开 Release 检查并下载新版安装包，安装时保留会话、API 设置和主题选择。
- 官方模型目录包含 `deepseek-v4-flash`、`deepseek-v4-pro` 和支持图片输入的 `deepseek-v4-flash-vision-exp`。
- 桌面端自动完成本地会话 Cookie 认证，不再额外打开外部浏览器；API Key 可稍后配置。

## 安装

1. 打开 [Releases](https://github.com/THao712/deepseek-harness-aemeath-desktop/releases/latest)。
2. 下载已发布版本的 `DeepSeek-Harness-Aemeath-Setup-*.exe`。本地构建的安装包位于 `dist/`，不代表该版本已经发布到 GitHub。
3. 运行安装器并选择安装目录，可安装到 C、D、E 等任意可写盘符。
4. 从桌面或开始菜单启动 `DeepSeek Harness Aemeath`。

当前安装包未购买商业代码签名证书，Windows SmartScreen 可能显示“未知发布者”。请只从本仓库 Release 下载，并可使用 Release 中的 SHA-256 文件核对完整性。

应用首次运行会显示 DeepSeek Harness 的开发者预览声明。可选择“稍后配置”先进入界面；选择工作区后，点击输入框右下角的模型名称，再点击“模型”，即可看到三个官方模型。实际调用需要有效的 DeepSeek API Key。

## 开发

要求：Windows 10/11、Node.js `^22.19.0` 或 `>=24.0.0`、pnpm 11.7+、Git。

```powershell
git clone https://github.com/THao712/deepseek-harness-aemeath-desktop.git
cd deepseek-harness-aemeath-desktop
pnpm install
pnpm start
```

`postinstall` 会自动检查并应用原生目录选择器补丁；Windows 极简模式会优先接受官方 `0.1.1-rc.2` 已提供的持久 PowerShell 实现，旧版 preset 才会使用兼容补丁。脚本在无法识别目标代码时会停止，而不是静默修改未知实现。

## 构建安装包

```powershell
pnpm install
pnpm run verify:minimal-windows
pnpm run dist
pnpm run verify:packaged
```

安装包输出到 `dist/`。使用仓库内的 `pnpm-lock.yaml` 和 `pnpm-workspace.yaml` 安装依赖。上游的部分必需 peer 插件已显式列入生产依赖，`verify:packaged` 会检查安装包是否遗漏它们。发布前还应独立启动 `dist/win-unpacked/` 中的应用验证模型菜单。

## 定制主题

`scripts/patch-theme-choice.mjs` 为官方 `0.1.5-rc.2` 主题注册表、设置 schema 和外观选项增加 `aemeath`，沿用 `ui-theme.preference` 保存选择。`postinstall`、启动和打包都会检查该补丁；升级上游版本时需重新验证补丁锚点。主题 CSS 仅在 `data-aemeath-theme` 存在时生效。

## 更新桌面应用

启动后点击右上角的循环箭头即可检查更新。发现新版时按钮会变为下载状态；安装包下载到 `E:\DeepSeek Harness Storage\updates`，确认后启动安装器并退出当前应用。安装器默认使用当前安装目录，也支持重新选择 C、D、E 等盘符。用户数据保存在独立的 `user-data` 目录，不会因更新删除。

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

## 上游同步记录

2026-09-18 核对官方 npm `latest` 后同步到 `@deepseek-ai/dsh@0.1.5-rc.2`，对应官方 tag `dsh-v0.1.5-rc.2`（提交 `fb2c4b9e698e30edb738bca4cf0618587db7d203`）。该版本提供三个官方模型及视觉输入支持。本地适配包括启动 Cookie 认证、预设拆包路径、必需 peer 插件、原生目录选择器、主题定位和桌面更新入口。官方另有 `0.1.6-alpha.2` alpha 通道，本次不将 alpha 作为稳定更新目标。

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

