/**
 * OpenCode Qwen Auth Plugin
 *
 * Plugin de autenticação OAuth para Qwen, baseado no qwen-code.
 * Implementa Device Flow (RFC 8628) para autenticação.
 */

import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';

import { QWEN_MODELS, QWEN_API_CONFIG } from './constants.js';
import type { QwenCredentials } from './types.js';
import {
  loadCredentials,
  saveCredentials,
  getCredentialsPath,
  isCredentialsExpired,
} from './plugin/auth.js';
import {
  generatePKCE,
  requestDeviceAuthorization,
  pollDeviceToken,
  tokenResponseToCredentials,
  refreshAccessToken,
} from './qwen/oauth.js';

// ============================================
// Helpers
// ============================================

function getBaseUrl(resourceUrl?: string): string {
  if (!resourceUrl) return QWEN_API_CONFIG.baseUrl;
  if (resourceUrl.startsWith('http')) {
    return resourceUrl.endsWith('/v1') ? resourceUrl : `${resourceUrl}/v1`;
  }
  return `https://${resourceUrl}/v1`;
}

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

export function checkExistingCredentials(): QwenCredentials | null {
  const credPath = getCredentialsPath();
  if (existsSync(credPath)) {
    const creds = loadCredentials();
    if (creds && !isCredentialsExpired(creds)) {
      return creds;
    }
  }
  return null;
}

// ============================================
// Plugin Principal
// ============================================

export const QwenAuthPlugin = async (_input: unknown) => {
  return {
    auth: {
      provider: 'qwen',

      loader: async (
        getAuth: () => Promise<{ type: string; access?: string; refresh?: string; expires?: number }>,
        provider: { models?: Record<string, { cost?: { input: number; output: number } }> }
      ) => {
        const auth = await getAuth();

        // Se não é OAuth, tentar carregar credenciais do qwen-code
        if (!auth || auth.type !== 'oauth') {
          const creds = checkExistingCredentials();
          if (creds) {
            return {
              apiKey: creds.accessToken,
              baseURL: getBaseUrl(creds.resourceUrl),
            };
          }
          return null;
        }

        // Zerar custo dos modelos (gratuito via OAuth)
        if (provider?.models) {
          for (const model of Object.values(provider.models)) {
            if (model) model.cost = { input: 0, output: 0 };
          }
        }

        let accessToken = auth.access;

        // Refresh se expirado
        if (accessToken && auth.expires && Date.now() > auth.expires - 30000 && auth.refresh) {
          try {
            const refreshed = await refreshAccessToken(auth.refresh);
            accessToken = refreshed.accessToken;
            saveCredentials(refreshed);
          } catch (e) {
            console.error('[Qwen] Token refresh failed:', e);
          }
        }

        // Fallback para credenciais do qwen-code
        if (!accessToken) {
          const creds = checkExistingCredentials();
          if (creds) accessToken = creds.accessToken;
        }

        if (!accessToken) return null;

        const creds = loadCredentials();
        return {
          apiKey: accessToken,
          baseURL: getBaseUrl(creds?.resourceUrl),
        };
      },

      methods: [
        {
          type: 'oauth',
          label: 'Login com Qwen (Device Flow)',
          authorize: async () => {
            const { verifier, challenge } = generatePKCE();

            try {
              const deviceAuth = await requestDeviceAuthorization(challenge);
              openBrowser(deviceAuth.verification_uri_complete);

              return {
                url: deviceAuth.verification_uri_complete,
                instructions: `Abra o link e autorize.\n\nCódigo: ${deviceAuth.user_code}\n\nApós autorizar, pressione Enter...`,
                method: 'code',
                callback: async (_code: string) => {
                  // Polling após Enter
                  const startTime = Date.now();
                  const timeoutMs = deviceAuth.expires_in * 1000;
                  let interval = 2000;

                  while (Date.now() - startTime < timeoutMs) {
                    await new Promise(r => setTimeout(r, interval));

                    try {
                      const tokenResponse = await pollDeviceToken(deviceAuth.device_code, verifier);

                      if (tokenResponse) {
                        const credentials = tokenResponseToCredentials(tokenResponse);
                        saveCredentials(credentials);

                        return {
                          type: 'success',
                          access: credentials.accessToken,
                          refresh: credentials.refreshToken || '',
                          expires: credentials.expiryDate || Date.now() + 3600000,
                        };
                      }
                    } catch (e) {
                      const msg = e instanceof Error ? e.message : '';
                      if (msg.includes('slow_down')) {
                        interval = Math.min(interval * 1.5, 10000);
                      } else if (!msg.includes('authorization_pending')) {
                        return { type: 'failed' };
                      }
                    }
                  }

                  return { type: 'failed' };
                },
              };
            } catch (e) {
              const msg = e instanceof Error ? e.message : 'Erro desconhecido';
              return {
                url: '',
                instructions: `Erro: ${msg}`,
                method: 'code',
                callback: async () => ({ type: 'failed' }),
              };
            }
          },
        },
        {
          type: 'oauth',
          label: 'Importar do qwen-code',
          authorize: async () => {
            const creds = checkExistingCredentials();

            if (creds) {
              return {
                url: '',
                instructions: 'Credenciais encontradas! Pressione Enter.',
                method: 'code',
                callback: async () => ({
                  type: 'success',
                  access: creds.accessToken,
                  refresh: creds.refreshToken || '',
                  expires: creds.expiryDate || Date.now() + 3600000,
                }),
              };
            }

            return {
              url: '',
              instructions: 'Credenciais não encontradas. Execute "qwen" primeiro.',
              method: 'code',
              callback: async () => ({ type: 'failed' }),
            };
          },
        },
      ],
    },

    config: async (config: Record<string, unknown>) => {
      const providers = (config.provider as Record<string, unknown>) || {};

      providers.qwen = {
        npm: '@ai-sdk/openai-compatible',
        name: 'Qwen (OAuth)',
        options: { baseURL: QWEN_API_CONFIG.baseUrl },
        models: Object.fromEntries(
          Object.entries(QWEN_MODELS).map(([id, m]) => [
            id,
            {
              id: m.id,
              name: m.name,
              reasoning: false,
              limit: { context: m.contextWindow, output: m.maxOutput },
              cost: m.cost,
              modalities: { input: ['text'], output: ['text'] },
            },
          ])
        ),
      };

      config.provider = providers;
    },

    event: async () => {
      // Event handler
    },
  };
};

export default QwenAuthPlugin;
