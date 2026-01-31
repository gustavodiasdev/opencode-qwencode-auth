# Qwen OAuth Plugin for OpenCode

Authenticate OpenCode CLI with your qwen.ai account to use Qwen3-Coder models with **2,000 free requests per day**!

## Features

- 🔐 **OAuth Authentication** - Sign in with your qwen.ai account
- 🆓 **Free Tier** - 2,000 requests/day, 60 requests/minute (no token limits!)
- 🔄 **Auto-refresh** - Automatic token refresh
- 🔗 **qwen-code compatible** - Reuses credentials from qwen-code CLI
- ⚡ **1M Context** - Access to models with 1M token context windows

## Quick Start

### 1. Add the plugin to your OpenCode config

Create or edit `~/.config/opencode/opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-qwen-auth"]
}
```

### 2. Authenticate

```bash
opencode auth login
```

Choose the **Qwen** provider and select **OAuth with Qwen (qwen.ai account)**.

### 3. Start using Qwen models

```bash
opencode --model qwen/qwen3-coder-plus
```

## Available Models

| Model | Context | Output | Description |
|-------|---------|--------|-------------|
| `qwen3-coder-plus` | 1M tokens | 64K tokens | Most capable coding model |
| `qwen3-coder-flash` | 1M tokens | 64K tokens | Faster responses |
| `qwen-coder-plus` | 128K tokens | 32K tokens | Standard coding model |

## Alternative: Import from qwen-code

If you already use [qwen-code](https://github.com/QwenLM/qwen-code), this plugin will automatically detect and reuse your existing credentials from `~/.qwen/oauth_creds.json`.

Just run:

```bash
# First, authenticate with qwen-code
qwen  # This will prompt for OAuth login

# Then OpenCode will automatically use those credentials
opencode --model qwen/qwen3-coder-plus
```

## Configuration

### Full config example

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-qwen-auth"],
  "provider": {
    "qwen": {
      "models": {
        "qwen3-coder-plus": {
          "name": "Qwen3 Coder Plus (OAuth)",
          "limit": {
            "context": 1048576,
            "output": 65536
          }
        }
      }
    }
  }
}
```

### Environment Variables

| Variable | Description |
|----------|-------------|
| `OPENCODE_QWEN_DEBUG` | Set to `1` to enable debug logging |

## Quota Information

| Plan | Rate Limit | Daily Limit |
|------|------------|-------------|
| Free (OAuth) | 60 requests/min | 2,000 requests/day |

## Local Development

```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/opencode-qwen-auth.git
cd opencode-qwen-auth

# Install dependencies
bun install

# Build
bun run build

# Link to OpenCode config
# Add to ~/.config/opencode/opencode.json:
{
  "plugin": ["file:///absolute/path/to/opencode-qwen-auth/dist/index.js"]
}
```

## How It Works

1. **OAuth Flow**: Opens your browser to qwen.ai for authentication
2. **Token Storage**: Saves credentials to `~/.qwen/oauth_creds.json`
3. **Auto-refresh**: Refreshes tokens automatically when they expire
4. **API Proxy**: Routes OpenCode requests through Qwen's chat API

## Troubleshooting

### Port 14561 already in use

The plugin uses port 14561 for the OAuth callback. If it's busy:

1. Check for other processes: `lsof -i :14561`
2. Kill the process or wait for it to finish

### Token expired

The plugin automatically refreshes tokens. If issues persist:

```bash
# Remove old credentials
rm ~/.qwen/oauth_creds.json

# Re-authenticate
opencode auth login
```

### Rate limit exceeded

If you hit the daily limit (2,000 requests):
- Wait until midnight UTC for quota reset
- Consider using API keys for higher limits

## Related Projects

- [qwen-code](https://github.com/QwenLM/qwen-code) - Official Qwen coding CLI
- [opencode-gemini-auth](https://github.com/jenslys/opencode-gemini-auth) - Gemini OAuth plugin (inspiration for this project)
- [qwen-code-oai-proxy](https://github.com/aptdnfapt/qwen-code-oai-proxy) - Proxy for using Qwen with any OpenAI-compatible client

## License

MIT
