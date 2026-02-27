/**
 * OpenCode Qwen Auth Plugin
 *
 * OAuth authentication plugin for Qwen, based on qwen-code.
 * Implements Device Flow (RFC 8628) for authentication.
 *
 * Features:
 * - Dynamic API endpoint resolution based on resource_url from token
 * - Supports portal.qwen.ai and DashScope endpoints
 * - Automatic token refresh
 * - DashScope-specific headers when needed
 *
 * Provider: qwen-code
 * Models: qwen3-coder-plus, qwen3-coder-flash, coder-model, vision-model
 */

import { spawn } from 'node:child_process';

import { QWEN_PROVIDER_ID, QWEN_API_CONFIG, QWEN_MODELS, DASHSCOPE_HEADERS, QWEN_USER_AGENT } from './constants.js';
import type { QwenCredentials } from './types.js';
import { saveCredentials, resolveBaseUrl, loadCredentials } from './plugin/auth.js';
import {
  generatePKCE,
  requestDeviceAuthorization,
  pollDeviceToken,
  tokenResponseToCredentials,
  refreshAccessToken,
  SlowDownError,
} from './qwen/oauth.js';
import { logTechnicalDetail } from './errors.js';

// ============================================
// Helpers
// ============================================

function openBrowser(url: string): void {
  try {
    const platform = process.platform;
    const command = platform === 'darwin' ? 'open' : platform === 'win32' ? 'rundll32' : 'xdg-open';
    const args = platform === 'win32' ? ['url.dll,FileProtocolHandler', url] : [url];
    const child = spawn(command, args, { stdio: 'ignore', detached: true });
    child.unref?.();
  } catch {
    // Ignore errors
  }
}

// Store current credentials for headers hook
let currentCredentials: QwenCredentials | null = null;

/** Get a valid access token (with refresh if needed) */
async function getValidAccessToken(
  getAuth: () => Promise<{ type: string; access?: string; refresh?: string; expires?: number }>,
): Promise<{ accessToken: string; baseUrl: string; resourceUrl?: string } | null> {
  const auth = await getAuth();

  if (!auth || auth.type !== 'oauth') {
    return null;
  }

  let accessToken = auth.access;
  let refreshToken = auth.refresh;
  let resourceUrl: string | undefined;

  // Try to load credentials from file to get resource_url
  // (OpenCode doesn't pass resourceUrl through the auth callback)
  const fileCredentials = loadCredentials();
  if (fileCredentials) {
    resourceUrl = fileCredentials.resourceUrl;
    // Use file credentials if auth doesn't have refresh token
    if (!refreshToken && fileCredentials.refreshToken) {
      refreshToken = fileCredentials.refreshToken;
    }
  }

  // Refresh if expired (with 60s margin)
  if (accessToken && auth.expires && Date.now() > auth.expires - 60_000 && refreshToken) {
    try {
      const refreshed = await refreshAccessToken(refreshToken);
      accessToken = refreshed.accessToken;
      resourceUrl = refreshed.resourceUrl;
      saveCredentials(refreshed);
      
      // Update stored credentials
      currentCredentials = refreshed;
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      logTechnicalDetail(`Token refresh failed: ${detail}`);
      accessToken = undefined;
    }
  }

  if (!accessToken) {
    return null;
  }

  // Resolve base URL from resource_url (like qwen-code does)
  const baseUrl = resolveBaseUrl(resourceUrl);

  // Update current credentials
  currentCredentials = {
    accessToken,
    resourceUrl,
  };

  return { accessToken, baseUrl, resourceUrl };
}

// ============================================
// Main Plugin
// ============================================

export const QwenAuthPlugin = async (_input: unknown) => {
  return {
    auth: {
      provider: QWEN_PROVIDER_ID,

      loader: async (
        getAuth: () => Promise<{ type: string; access?: string; refresh?: string; expires?: number }>,
        provider: { models?: Record<string, { cost?: { input: number; output: number } }> },
      ) => {
        // Zero out model costs (free via OAuth)
        if (provider?.models) {
          for (const model of Object.values(provider.models)) {
            if (model) model.cost = { input: 0, output: 0 };
          }
        }

        const result = await getValidAccessToken(getAuth);
        if (!result) return null;

        const { accessToken, baseUrl } = result;

        // Return apiKey and baseURL (note: capital URL!)
        // OpenCode provider options use 'baseURL' not 'baseUrl'
        return {
          apiKey: accessToken,
          baseURL: baseUrl,
        };
      },

      methods: [
        {
          type: 'oauth' as const,
          label: 'Qwen Code (qwen.ai OAuth)',
          authorize: async () => {
            const { verifier, challenge } = generatePKCE();

            try {
              const deviceAuth = await requestDeviceAuthorization(challenge);
              openBrowser(deviceAuth.verification_uri_complete);

              const POLLING_MARGIN_MS = 3000;

              return {
                url: deviceAuth.verification_uri_complete,
                instructions: `Code: ${deviceAuth.user_code}`,
                method: 'auto' as const,
                callback: async () => {
                  const startTime = Date.now();
                  const timeoutMs = deviceAuth.expires_in * 1000;
                  let interval = 5000;

                  while (Date.now() - startTime < timeoutMs) {
                    await new Promise(resolve => setTimeout(resolve, interval + POLLING_MARGIN_MS));

                    try {
                      const tokenResponse = await pollDeviceToken(deviceAuth.device_code, verifier);

                      if (tokenResponse) {
                        const credentials = tokenResponseToCredentials(tokenResponse);
                        
                        // Save credentials (including resource_url) to file
                        saveCredentials(credentials);

                        // Store credentials in memory
                        currentCredentials = credentials;

                        return {
                          type: 'success' as const,
                          access: credentials.accessToken,
                          refresh: credentials.refreshToken ?? '',
                          expires: credentials.expiryDate || Date.now() + 3600000,
                        };
                      }
                    } catch (e) {
                      if (e instanceof SlowDownError) {
                        interval = Math.min(interval + 5000, 15000);
                      } else if (!(e instanceof Error) || !e.message.includes('authorization_pending')) {
                        return { type: 'failed' as const };
                      }
                    }
                  }

                  return { type: 'failed' as const };
                },
              };
            } catch (e) {
              const msg = e instanceof Error ? e.message : 'Unknown error';
              return {
                url: '',
                instructions: `Error: ${msg}`,
                method: 'auto' as const,
                callback: async () => ({ type: 'failed' as const }),
              };
            }
          },
        },
      ],
    },

    // Add headers hook to inject DashScope headers when needed
    "chat.headers": async (_input: unknown, output: { headers: Record<string, string> }) => {
      // Check if we're using DashScope URL
      const resourceUrl = currentCredentials?.resourceUrl;
      const isDashScope = resourceUrl?.includes('dashscope') || !resourceUrl;
      
      // Only add DashScope headers if using DashScope endpoint
      if (isDashScope) {
        output.headers[DASHSCOPE_HEADERS.cacheControl] = 'enable';
        output.headers[DASHSCOPE_HEADERS.userAgent] = QWEN_USER_AGENT;
        output.headers[DASHSCOPE_HEADERS.authType] = 'qwen-oauth';
      }
      
      // For portal.qwen.ai, the Bearer token should work directly
    },

    config: async (config: Record<string, unknown>) => {
      const providers = (config.provider as Record<string, unknown>) || {};

      providers[QWEN_PROVIDER_ID] = {
        npm: '@ai-sdk/openai-compatible',
        name: 'Qwen Code',
        // Don't set baseURL in options - let the loader set it dynamically
        options: {},
        models: Object.fromEntries(
          Object.entries(QWEN_MODELS).map(([id, m]) => [
            id,
            {
              id: m.id,
              name: m.name,
              reasoning: m.reasoning,
              limit: { context: m.contextWindow, output: m.maxOutput },
              cost: m.cost,
              modalities: { input: ['text'], output: ['text'] },
            },
          ])
        ),
      };

      config.provider = providers;
    },
  };
};

export default QwenAuthPlugin;
