/**
 * Qwen OAuth and API Constants
 * Based on qwen-code implementation
 */

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

// Available Qwen models through OAuth
// Baseado nos modelos disponíveis no qwen-code
export const QWEN_MODELS = {
  'qwen3-coder-plus': {
    id: 'qwen3-coder-plus',
    name: 'Qwen3 Coder Plus (OAuth)',
    contextWindow: 1048576, // 1M tokens
    maxOutput: 65536, // 64K tokens
    description: 'Most capable Qwen coding model with 1M context window',
    cost: { input: 0, output: 0 }, // Free via OAuth
  },
  'qwen3-coder-flash': {
    id: 'qwen3-coder-flash',
    name: 'Qwen3 Coder Flash (OAuth)',
    contextWindow: 1048576,
    maxOutput: 65536,
    description: 'Faster Qwen coding model for quick responses',
    cost: { input: 0, output: 0 },
  },
} as const;
