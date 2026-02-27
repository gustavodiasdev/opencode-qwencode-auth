/**
 * Qwen OAuth and API Constants
 * Based on qwen-code implementation
 */

// Provider ID
export const QWEN_PROVIDER_ID = 'qwen-code';

// OAuth Device Flow Endpoints (descobertos do qwen-code)
export const QWEN_OAUTH_CONFIG = {
  baseUrl: 'https://chat.qwen.ai',
  deviceCodeEndpoint: 'https://chat.qwen.ai/api/v1/oauth2/device/code',
  tokenEndpoint: 'https://chat.qwen.ai/api/v1/oauth2/token',
  clientId: 'f0304373b74a44d2b584a3fb70ca9e56',
  scope: 'openid profile email model.completion',
  grantType: 'urn:ietf:params:oauth:grant-type:device_code',
} as const;

// Qwen API Configuration
// The resource_url from credentials is used to determine the base URL
export const QWEN_API_CONFIG = {
  // DashScope (Chinese region)
  dashscopeBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  // DashScope International
  dashscopeIntlBaseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
  // Portal URL (used when resource_url = "portal.qwen.ai")
  portalBaseUrl: 'https://portal.qwen.ai/v1',
  // Default fallback
  baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  // Endpoint de chat completions
  chatEndpoint: '/chat/completions',
  // Endpoint de models
  modelsEndpoint: '/models',
} as const;

// DashScope-specific headers required for OAuth tokens
// These are needed when using DashScope endpoints with OAuth tokens
export const DASHSCOPE_HEADERS = {
  cacheControl: 'X-DashScope-CacheControl',
  userAgent: 'X-DashScope-UserAgent',
  authType: 'X-DashScope-AuthType',
} as const;

// User agent string for DashScope
export const QWEN_USER_AGENT = 'opencode-qwencode-auth/1.4.0';

// OAuth callback port (para futuro Device Flow no plugin)
export const CALLBACK_PORT = 14561;

// Available Qwen models through OAuth
// Supports both portal.qwen.ai and DashScope endpoints
export const QWEN_MODELS = {
  // --- Coding Models ---
  'qwen3-coder-plus': {
    id: 'qwen3-coder-plus',
    name: 'Qwen3 Coder Plus',
    contextWindow: 1048576, // 1M tokens
    maxOutput: 65536, // 64K tokens
    description: 'Most capable Qwen coding model with 1M context window',
    reasoning: false,
    cost: { input: 0, output: 0 }, // Free via OAuth
  },
  'qwen3-coder-flash': {
    id: 'qwen3-coder-flash',
    name: 'Qwen3 Coder Flash',
    contextWindow: 1048576,
    maxOutput: 65536,
    description: 'Faster Qwen coding model for quick responses',
    reasoning: false,
    cost: { input: 0, output: 0 },
  },
  // --- Alias Models (portal mapeia internamente) ---
  'coder-model': {
    id: 'coder-model',
    name: 'Qwen Coder (auto)',
    contextWindow: 1048576,
    maxOutput: 65536,
    description: 'Auto-routed coding model (maps to qwen3-coder-plus)',
    reasoning: false,
    cost: { input: 0, output: 0 },
  },
  // --- Vision Model ---
  'vision-model': {
    id: 'vision-model',
    name: 'Qwen VL Plus (vision)',
    contextWindow: 131072, // 128K tokens
    maxOutput: 32768, // 32K tokens
    description: 'Vision-language model (maps to qwen3-vl-plus), supports image input',
    reasoning: false,
    cost: { input: 0, output: 0 },
  },
} as const;
