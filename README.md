# 🤖 Qwen Code OAuth Plugin for OpenCode

![npm version](https://img.shields.io/npm/v/opencode-qwencode-auth)
![License](https://img.shields.io/github/license/gustavodiasdev/opencode-qwencode-auth)
![GitHub stars](https://img.shields.io/github/stars/gustavodiasdev/opencode-qwencode-auth)

<p align="center">
  <img src="assets/screenshot.png" alt="OpenCode with Qwen Code" width="800">
</p>

**Authenticate OpenCode CLI with your qwen.ai account.** This plugin enables you to use Qwen models (Coder, Max, Plus and more) with **2,000 free requests per day** - no API key or credit card required!

[🇧🇷 Leia em Português](./README.pt-BR.md)

## ✨ Features

- 🔐 **OAuth Device Flow** - Secure browser-based authentication (RFC 8628)
- ⚡ **Automatic Polling** - No need to press Enter after authorizing
- 🆓 **2,000 req/day free** - Generous free tier with no credit card
- 🧠 **1M context window** - Models with 1 million token context
- 🔄 **Auto-refresh** - Tokens renewed automatically before expiration
- 🔗 **qwen-code compatible** - Reuses credentials from `~/.qwen/oauth_creds.json`
- 🌐 **Multi-endpoint support** - Automatically routes to portal.qwen.ai or DashScope based on your token

## 🆕 What's New in v1.4.0

### Dynamic API Endpoint Resolution

The plugin now automatically detects and uses the correct API endpoint based on the `resource_url` returned by the OAuth server:

| resource_url | API Endpoint | Region |
|-------------|--------------|--------|
| `portal.qwen.ai` | `https://portal.qwen.ai/v1` | International |
| `dashscope` | `https://dashscope.aliyuncs.com/compatible-mode/v1` | China |
| `dashscope-intl` | `https://dashscope-intl.aliyuncs.com/compatible-mode/v1` | International |

This means the plugin works correctly regardless of which region your Qwen account is associated with.

### DashScope Headers Support

When using DashScope endpoints, the plugin automatically injects the required headers:
- `X-DashScope-CacheControl: enable`
- `X-DashScope-UserAgent: opencode-qwencode-auth/1.4.0`
- `X-DashScope-AuthType: qwen-oauth`

### Fixed: Loader Return Format

Fixed a critical bug where the loader was returning `baseUrl` instead of `baseURL` (capital letters), which caused `ERR_INVALID_URL` errors.

## 📋 Prerequisites

- [OpenCode CLI](https://opencode.ai) installed
- A [qwen.ai](https://chat.qwen.ai) account (free to create)

## 🚀 Installation

### 1. Install the plugin

**From npm (recommended):**
```bash
cd ~/.config/opencode && npm install opencode-qwencode-auth
```

**Or with bun:**
```bash
cd ~/.config/opencode && bun add opencode-qwencode-auth
```

**From GitHub (latest unreleased changes):**
```bash
cd ~/.config/opencode && npm install ishan-parihar/opencode-qwencode-auth
# or with bun
cd ~/.config/opencode && bun add ishan-parihar/opencode-qwencode-auth
```

### 2. Enable the plugin

Edit `~/.config/opencode/opencode.json`:

```json
{
  "plugin": ["opencode-qwencode-auth"]
}
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

### Coding Models

| Model | Context | Max Output | Best For |
|-------|---------|------------|----------|
| `qwen3-coder-plus` | 1M tokens | 64K tokens | Complex coding tasks |
| `qwen3-coder-flash` | 1M tokens | 64K tokens | Fast coding responses |

### Alias Models

| Model | Context | Max Output | Description |
|-------|---------|------------|-------------|
| `coder-model` | 1M tokens | 64K tokens | Auto-routed coding model |
| `vision-model` | 128K tokens | 32K tokens | Vision-language model (qwen3-vl-plus) |

### Using a specific model

```bash
opencode --provider qwen-code --model qwen3-coder-plus
opencode --provider qwen-code --model vision-model
```

## ⚙️ How It Works

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   OpenCode CLI  │────▶│  qwen.ai OAuth   │────▶│  Qwen Models    │
│                 │◀────│  (Device Flow)   │◀────│  API            │
└─────────────────┘     └──────────────────┘     └─────────────────┘
```

1. **Device Flow (RFC 8628)**: Opens your browser to `chat.qwen.ai` for authentication
2. **Automatic Polling**: Detects authorization completion automatically
3. **Token Storage**: Saves credentials to `~/.qwen/oauth_creds.json`
4. **Dynamic URL Resolution**: Uses `resource_url` from token to determine API endpoint
5. **Auto-refresh**: Renews tokens 60 seconds before expiration

## 📊 API Endpoints

The plugin supports multiple API endpoints:

| Endpoint | URL | Headers | Region |
|----------|-----|---------|--------|
| Portal | `https://portal.qwen.ai/v1` | Standard Bearer | International |
| DashScope | `https://dashscope.aliyuncs.com/compatible-mode/v1` | DashScope-specific | China |
| DashScope Intl | `https://dashscope-intl.aliyuncs.com/compatible-mode/v1` | DashScope-specific | International |

The correct endpoint is automatically selected based on your OAuth token's `resource_url` field.

## 📊 Usage Limits

| Plan | Rate Limit | Daily Limit |
|------|------------|-------------|
| Free (OAuth) | 60 req/min | 2,000 req/day |

> [!NOTE]
> Limits reset at midnight UTC. For higher limits, consider using an API key from [DashScope](https://dashscope.aliyun.com).

## 🔧 Troubleshooting

### ERR_INVALID_URL error

This was a bug in versions before 1.4.0. Update to the latest version:

```bash
cd ~/.config/opencode && npm update opencode-qwencode-auth
```

### "Incorrect API key provided" error

This happens when the wrong API endpoint is used. The v1.4.0 update fixes this by automatically detecting the correct endpoint from your token's `resource_url`.

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

### Debug Mode

Enable debug logging to see technical details:

```bash
export OPENCODE_QWEN_DEBUG=1
opencode
```

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

Edit `~/.config/opencode/package.json`:

```json
{
  "dependencies": {
    "opencode-qwencode-auth": "file:///absolute/path/to/opencode-qwencode-auth"
  }
}
```

Then reinstall:

```bash
cd ~/.config/opencode && npm install
```

## 📁 Project Structure

```
src/
├── constants.ts        # OAuth endpoints, API URLs, models config
├── types.ts            # TypeScript interfaces
├── index.ts            # Main plugin entry point
├── qwen/
│   └── oauth.ts        # OAuth Device Flow + PKCE
└── plugin/
    └── auth.ts         # Credentials management + URL resolution
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
