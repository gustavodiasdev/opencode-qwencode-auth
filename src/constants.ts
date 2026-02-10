/**
 * Qwen OAuth and API Constants
 * Based on qwen-code implementation
 */

// Provider ID - cria provider separado para OAuth
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

// Available Qwen models through OAuth
// Baseado nos modelos disponíveis no qwen-code + modelos gerais via portal.qwen.ai
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
  // --- General Purpose Models ---
  'qwen3-max': {
    id: 'qwen3-max',
    name: 'Qwen3 Max',
    contextWindow: 262144, // 256K tokens
    maxOutput: 65536, // 64K tokens
    description: 'Flagship ~1T parameter MoE model, best for complex reasoning and tool use',
    reasoning: false,
    cost: { input: 0, output: 0 },
  },
  'qwen-plus-latest': {
    id: 'qwen-plus-latest',
    name: 'Qwen Plus',
    contextWindow: 131072, // 128K tokens
    maxOutput: 16384, // 16K tokens
    description: 'Balanced model with thinking mode, good quality-speed tradeoff',
    reasoning: true,
    cost: { input: 0, output: 0 },
  },
  'qwen3-235b-a22b': {
    id: 'qwen3-235b-a22b',
    name: 'Qwen3 235B-A22B',
    contextWindow: 131072, // 128K tokens
    maxOutput: 32768, // 32K tokens
    description: 'Largest open-weight Qwen3 MoE model with thinking mode',
    reasoning: true,
    cost: { input: 0, output: 0 },
  },
  'qwen-flash': {
    id: 'qwen-flash',
    name: 'Qwen Flash',
    contextWindow: 1048576, // 1M tokens
    maxOutput: 8192, // 8K tokens
    description: 'Ultra-fast and low-cost model for simple tasks',
    reasoning: false,
    cost: { input: 0, output: 0 },
  },
} as const;
