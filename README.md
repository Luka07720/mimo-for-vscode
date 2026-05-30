# MiMo for Copilot Chat

**在 Copilot Chat 模型选择器中直接使用小米 MiMo 模型——无需离开你熟悉的 Copilot 工作流。**

喜欢 MiMo 的性价比，但不想放弃 GitHub Copilot 的 Agent 模式、工具调用和成熟的交互体验？本扩展将 **MiMo V2.5 Pro、V2.5 和 V2 Flash** 直接接入 Copilot Chat 模型选择器，支持**思考模式**，使用你自己的 API Key。

## 功能特性

### MiMo 模型出现在模型选择器中

三个模型与 GPT-4o、Claude 等并列在 Copilot Chat 的模型选择器中。可在对话中途切换模型，不丢失聊天历史。

### 思考模式与推理深度控制

完整支持 MiMo V2.5 Pro 的 thinking 模式。通过 Copilot Chat 模型选择器的菜单选择 `停用`、`标准`（均衡，默认）或 `深度`（适用于复杂 Agent 任务）。

### 继承全部 Copilot 能力

由于本扩展接入的是 Copilot 的原生 provider API，你免费获得完整能力栈：

- **Agent 模式** ——自主执行多步骤任务
- **工具调用** ——文件编辑、终端操作、工作区搜索、Git、测试
- **Instructions & Skills** ——你的 `.instructions.md`、`AGENTS.md` 和各项 Skills 开箱即用

### 安全优先

API Key 存储在 VS Code 的 `SecretStorage` 中（macOS 钥匙串 / Windows 凭据管理器 / Linux 密钥环）。绝不会出现在 `settings.json` 中，也不会被提交到 Git 历史。

### 零运行时依赖

纯 VS Code API + Node.js 内置模块。无需 Python、Docker 或本地代理进程。

## 快速开始

### 前置条件

- VS Code 1.116 及以上版本
- GitHub Copilot 订阅（Free / Pro / Enterprise——免费版即可使用）
- MiMo API Key，从 MiMo 开放平台获取

### 安装方式

1. 从 [GitHub Releases](https://github.com/Luka07720/mimo-for-vscode/releases) 下载最新的 `.vsix` 文件
2. 在 VS Code 中按 `Ctrl+Shift+P`（macOS 为 `Cmd+Shift+P`）
3. 输入 `Extensions: Install from VSIX...`
4. 选择下载的 `.vsix` 文件

### 使用步骤

1. 通过命令面板（`Ctrl+Shift+P`）运行 **MiMo: 设置 API Key**
2. 粘贴你的 Key（通常以 `sk-` 或 `tp-` 开头）
3. 打开 Copilot Chat，点击模型选择器，选择 **MiMo V2 Flash**、**MiMo V2.5** 或 **MiMo V2.5 Pro**
4. 搞定——开始聊天

## 模型

| 模型 | 适用场景 |
|------|----------|
| **MiMo V2 Flash** | 日常快速编码、小改动、低成本迭代 |
| **MiMo V2.5** | 平衡性能与速度，支持图片输入 |
| **MiMo V2.5 Pro** | 复杂重构、Agent 任务、深度推理（支持思考模式） |

## 设置项

| 设置项 | 默认值 | 说明 |
|--------|--------|------|
| `mimo-copilot.baseUrl` | `https://api.xiaomimimo.com/anthropic` | API 端点——可改为自托管或代理部署地址 |
| `mimo-copilot.maxTokens` | `0` | 最大输出 Token 数（`0` = 不限制）。可用于成本控制 |
| `mimo-copilot.modelIdOverrides` | 预填官方 ID 映射 | 模型 ID 映射。仅在使用模型名不同的兼容第三方 API 时修改 |
| `mimo-copilot.debugMode` | `minimal` | 诊断模式：`minimal` 仅上报 token 用量，`metadata` 输出日志，`verbose` 将完整请求 dump 写入扩展 global storage |
| `mimo-copilot.visionModel` | *(自动)* | 用作视觉代理的 Copilot 模型 |
| `mimo-copilot.visionPrompt` | *(内置)* | 用于描述图片附件的提示词 |

思考深度可通过 Copilot Chat 的模型选择器对 MiMo V2.5 Pro 模型单独设置。

兼容 API 代理的 `settings.json` 配置示例：

```json
{
  "mimo-copilot.modelIdOverrides": {
    "mimo-v2-flash": "your-flash-model-id",
    "mimo-v2.5": "your-model-id",
    "mimo-v2.5-pro": "your-pro-model-id"
  }
}
```

## 方案对比

|  | 本扩展 | 本地代理（如 LiteLLM） | 独立扩展 |
|--|--------|----------------------|----------|
| 在 Copilot Chat 内使用 | ✅ | ✅ | ❌ 独立界面 |
| Agent 模式、工具、Skills | ✅ | ✅ | ⚠️ 自行实现 |
| 无需额外运行进程 | ✅ | ❌ | ✅ |
| 一键安装 | ✅ | ❌ | ✅ |
| API Key 存系统密钥链 | ✅ | ❌ | ⚠️ 各异 |

## 技术架构

本扩展使用 Anthropic Messages API 协议与 MiMo 服务端通信：

```
VS Code Copilot Chat
    ↓ (LanguageModelChatProvider API)
本扩展 (TypeScript)
    ↓ (Anthropic Messages API, SSE streaming)
MiMo API (api.xiaomimimo.com)
```

## 许可证

[MIT](LICENSE)
