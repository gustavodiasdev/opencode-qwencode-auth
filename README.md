# 🤖 Qwen Code OAuth Plugin for OpenCode

![npm version](https://img.shields.io/npm/v/opencode-qwencode-auth)
![License](https://img.shields.io/github/license/gustavodiasdev/opencode-qwencode-auth)
![GitHub stars](https://img.shields.io/github/stars/gustavodiasdev/opencode-qwencode-auth)

**Authenticate OpenCode CLI with your qwen.ai account.** This plugin enables you to use Qwen3-Coder models with **2,000 free requests per day** - no API key or credit card required!

[🇧🇷 Leia em Português](./README.pt-BR.md)

## ✨ Features

- 🔐 **OAuth Device Flow** - Secure browser-based authentication (RFC 8628)
- ⚡ **Automatic Polling** - No need to press Enter after authorizing
- 🆓 **2,000 req/day free** - Generous free tier with no credit card
- 🧠 **1M context window** - Models with 1 million token context
- 🔄 **Auto-refresh** - Tokens renewed automatically before expiration
- 🔗 **qwen-code compatible** - Reuses credentials from `~/.qwen/oauth_creds.json`

## 📋 Prerequisites

- [OpenCode CLI](https://opencode.ai) installed
- A [qwen.ai](https://chat.qwen.ai) account (free to create)

## 🚀 Installation

### 1. Add the plugin to OpenCode

Edit `~/.opencode/package.json`:

```json
{
  "dependencies": {
    "opencode-qwencode-auth": "github:gustavodiasdev/opencode-qwencode-auth"
  }
}
```

Edit `~/.opencode/opencode.jsonc`:

```json
{
  "plugin": ["opencode-qwencode-auth"]
}
```

### 2. Install dependencies

```bash
cd ~/.opencode && npm install
```

## 🔑 Usage

### 1. Login

```bash
opencode auth login
```

### 2. Select Provider

Choose **"Other"** and type `qwen-code`

### 3. Authenticate

Select **"Qwen Code (qwen.ai OAuth)"**

- A browser window will open for you to authorize
- The plugin automatically detects when you complete authorization
- No need to copy/paste codes or press Enter!

> [!TIP]
> In the OpenCode TUI (graphical interface), the **Qwen Code** provider appears automatically in the provider list.

## 🎯 Available Models

| Model | Context | Max Output | Best For |
|-------|---------|------------|----------|
| `qwen3-coder-plus` | 1M tokens | 64K tokens | Complex coding tasks |
| `qwen3-coder-flash` | 1M tokens | 64K tokens | Fast responses |

### Using a specific model

```bash
opencode --provider qwen-code --model qwen3-coder-plus
```

## ⚙️ How It Works

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   OpenCode CLI  │────▶│  qwen.ai OAuth   │────▶│  Qwen3-Coder    │
│                 │◀────│  (Device Flow)   │◀────│  API            │
└─────────────────┘     └──────────────────┘     └─────────────────┘
```

1. **Device Flow (RFC 8628)**: Opens your browser to `chat.qwen.ai` for authentication
2. **Automatic Polling**: Detects authorization completion automatically
3. **Token Storage**: Saves credentials to `~/.qwen/oauth_creds.json`
4. **Auto-refresh**: Renews tokens 30 seconds before expiration

## 📊 Usage Limits

| Plan | Rate Limit | Daily Limit |
|------|------------|-------------|
| Free (OAuth) | 60 req/min | 2,000 req/day |

> [!NOTE]
> Limits reset at midnight UTC. For higher limits, consider using an API key from [DashScope](https://dashscope.aliyun.com).

## 🔧 Troubleshooting

### Token expired

The plugin automatically renews tokens. If issues persist:

```bash
# Remove old credentials
rm ~/.qwen/oauth_creds.json

# Re-authenticate
opencode auth login
```

### Provider not showing in `auth login`

The `qwen-code` provider is added via plugin. In the `opencode auth login` command:

1. Select **"Other"**
2. Type `qwen-code`

### Rate limit exceeded (429 errors)

- Wait until midnight UTC for quota reset
- Try using `qwen3-coder-flash` for faster, lighter requests
- Consider [DashScope API](https://dashscope.aliyun.com) for higher limits

## 🛠️ Development

```bash
# Clone the repository
git clone https://github.com/gustavodiasdev/opencode-qwencode-auth.git
cd opencode-qwencode-auth

# Install dependencies
bun install

# Type check
bun run typecheck
```

### Local testing

Edit `~/.opencode/package.json`:

```json
{
  "dependencies": {
    "opencode-qwencode-auth": "file:///absolute/path/to/opencode-qwencode-auth"
  }
}
```

Then reinstall:

```bash
cd ~/.opencode && npm install
```

## 📁 Project Structure

```
src/
├── constants.ts        # OAuth endpoints, models config
├── types.ts            # TypeScript interfaces
├── index.ts            # Main plugin entry point
├── qwen/
│   └── oauth.ts        # OAuth Device Flow + PKCE
└── plugin/
    ├── auth.ts         # Credentials management
    └── utils.ts        # Helper utilities
```

## 🔗 Related Projects

- [qwen-code](https://github.com/QwenLM/qwen-code) - Official Qwen coding CLI
- [OpenCode](https://opencode.ai) - AI-powered CLI for development
- [opencode-gemini-auth](https://github.com/jenslys/opencode-gemini-auth) - Similar plugin for Google Gemini

## 📄 License

MIT

---

<p align="center">
  Made with ❤️ for the OpenCode community
</p>
