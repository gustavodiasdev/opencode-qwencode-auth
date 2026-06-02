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
// The resource_url from credentials determines the base URL
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
// Aligned with qwen-code-0.14.0 official client - coder-model maps to Qwen 3.6 Plus
export const QWEN_MODELS = {
  // --- Active Model (matches qwen-code-0.14.0) ---
  'coder-model': {
    id: 'coder-model',
    name: 'Qwen 3.6 Plus (auto)',
    contextWindow: 1048576,
    maxOutput: 65536,
    description: 'Qwen 3.6 Plus — efficient hybrid model with leading coding performance',
    reasoning: false,
    capabilities: { vision: true, video: true },
    cost: { input: 0, output: 0 },
  },
} as const;

// Official Qwen Code CLI Headers for performance and quota recognition
// User-Agent is generated dynamically based on current platform
import { generateUserAgent, generateDashScopeUserAgent } from './utils/user-agent.js';

export function getQwenHeaders(): Record<string, string> {
  return {
    'X-DashScope-CacheControl': 'enable',
    'X-DashScope-AuthType': 'qwen-oauth',
    'X-DashScope-UserAgent': generateDashScopeUserAgent(),
    'User-Agent': generateUserAgent(),
  };
}
