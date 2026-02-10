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
// O resource_url das credenciais é usado para determinar a URL base
export const QWEN_API_CONFIG = {
  // Default base URL (pode ser sobrescrito pelo resource_url das credenciais)
  defaultBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  // Portal URL (usado quando resource_url = "portal.qwen.ai")
  portalBaseUrl: 'https://portal.qwen.ai/v1',
  // Endpoint de chat completions
  chatEndpoint: '/chat/completions',
  // Endpoint de models
  modelsEndpoint: '/models',
  // Usado pelo OpenCode para configurar o provider
  baseUrl: 'https://portal.qwen.ai/v1',
} as const;

// OAuth callback port (para futuro Device Flow no plugin)
export const CALLBACK_PORT = 14561;

// Available Qwen models through OAuth (portal.qwen.ai)
// Testados e confirmados funcionando via token OAuth
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
