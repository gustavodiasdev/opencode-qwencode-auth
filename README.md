# 🤖 Qwen Code OAuth Plugin for OpenCode

![npm version](https://img.shields.io/npm/v/opencode-qwencode-auth)
![License](https://img.shields.io/github/license/gustavodiasdev/opencode-qwencode-auth)
![GitHub stars](https://img.shields.io/github/stars/gustavodiasdev/opencode-qwencode-auth)

<p align="center">
  <img src="assets/screenshot.png" alt="OpenCode with Qwen Code" width="800">
</p>

**Authenticate OpenCode CLI with your qwen.ai account.** This plugin enables you to use the `coder-model` with **1,000 free requests per day** — powered by Qwen 3.6 Plus with video and vision support. No API key or credit card required!

[🇧🇷 Leia em Português](./README.pt-BR.md) | [📜 Changelog](./CHANGELOG.md)

## ✨ Features

- 🔐 **OAuth Device Flow** - Secure browser-based authentication (RFC 8628)
- 🆓 **1,000 req/day free** - Free quota reset daily at midnight UTC
- ⚡ **60 req/min** - Rate limit of 60 requests per minute
- 🧠 **1M context window** - Massive context support for large projects
- 🔄 **Auto-refresh** - Tokens renewed automatically before expiration
- ⏱️ **Reliability** - Built-in request throttling and automatic retry for transient errors
- 🔗 **qwen-code compatible** - Reuses credentials from `~/.qwen/oauth_creds.json`

## 🚀 Installation

Edit `~/.config/opencode/opencode.json`:

```json
{
  "plugin": ["opencode-qwencode-auth"]
}
```

**That's it!** OpenCode will automatically install the plugin at startup.

### Alternative installation methods

#### From npm (explicit version)
```json
{
  "plugin": ["opencode-qwencode-auth@latest"]
}
```

#### From Git repository
```json
{
  "plugin": ["opencode-qwencode-auth@git+https://github.com/gustavodiasdev/opencode-qwencode-auth.git#main"]
}
```

#### Specific version
```json
{
  "plugin": ["opencode-qwencode-auth@1.3.0"]
}
```

## ⚠️ Limits & Quotas

- **Rate Limit:** 60 requests per minute
- **Daily Quota:** 1,000 requests per day (reset at midnight UTC)
- **Web Search:** 200 requests/minute, 1,000/day (separate quota)

> **Note:** These limits are set by the Qwen OAuth API and may change. For professional use with higher quotas, consider using a [DashScope API Key](https://dashscope.aliyun.com).

## 🔑 Usage

### 1. Login

Run the following command to start the OAuth flow:

```bash
opencode auth login
```

### 2. Select Provider

Choose **"Other"** and type `qwen-code`.

### 3. Authenticate

Select **"Qwen Code (qwen.ai OAuth)"**.

- A browser window will open for you to authorize.
- The plugin automatically detects when you complete authorization.
- **No need to copy/paste codes or press Enter!**

## 🎯 Available Models

### Coding Model

| Model | Context | Max Output | Features |
|-------|---------|------------|----------|
| `coder-model` | 1M tokens | Up to 64K tokens | Qwen 3.6 Plus — video & vision support |

> **Note:** This plugin aligns with the official `qwen-code` client. The `coder-model` alias maps to Qwen 3.6 Plus with hybrid reasoning, vision, and video input capabilities.

### Using the model

```bash
opencode --provider qwen-code --model coder-model
```

## 🔧 Troubleshooting

### "Invalid access token" or "Token expired"

The plugin usually handles refresh automatically. If you see this error immediately:

1.  **Re-authenticate:** Run `opencode auth login` again.
2.  **Clear cache:** Delete the credentials file and login again:
    ```bash
    rm ~/.qwen/oauth_creds.json
    opencode auth login
    ```

### Rate limit exceeded (429 errors)

If you hit the 60 req/min or 1,000 req/day limits:
- **Rate limit (60/min):** Wait a few minutes before trying again
- **Daily quota (1,000/day):** Wait until midnight UTC for the quota to reset
- **Web Search (200/min, 1,000/day):** Separate quota for web search tool
- Consider using a [DashScope API Key](https://dashscope.aliyun.com) for professional use with higher quotas

### Enable Debug Logs

If something isn't working, you can see detailed logs by setting the debug environment variable:

```bash
OPENCODE_QWEN_DEBUG=1 opencode
```

## 🛠️ Development

```bash
# Clone the repository
git clone https://github.com/gustavodiasdev/opencode-qwencode-auth.git
cd opencode-qwencode-auth

# Install dependencies
bun install

# Run tests
bun run tests/debug.ts full
```

### Project Structure

```
src/
├── qwen/               # OAuth implementation
├── plugin/             # Token management & caching
├── utils/              # Retry, locking and logging utilities
├── constants.ts        # Models and endpoints
└── index.ts            # Plugin entry point
```

## 📄 License

MIT

---

<p align="center">
  Made with ❤️ for the OpenCode community
</p>
