/**
 * OpenCode Qwen Auth Plugin
 *
 * Plugin de autenticação OAuth para Qwen, baseado no qwen-code.
 * Implementa Device Flow (RFC 8628) para autenticação.
 */

import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';

import { QWEN_PROVIDER_ID, QWEN_API_CONFIG, QWEN_MODELS } from './constants.js';
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
import { logTechnicalDetail } from './errors.js';
export { QwenAuthError, QwenApiError } from './errors.js';
export type { AuthErrorKind } from './errors.js';

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
      provider: QWEN_PROVIDER_ID,

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
            const detail = e instanceof Error ? e.message : String(e);
            logTechnicalDetail(`Token refresh falhou: ${detail}`);
            // Não continuar com token expirado - tentar fallback
            accessToken = undefined;
          }
        }

        // Fallback para credenciais do qwen-code
        if (!accessToken) {
          const creds = checkExistingCredentials();
          if (creds) {
            accessToken = creds.accessToken;
          } else {
            console.warn(
              '[Qwen] Token expirado e sem credenciais alternativas. ' +
              'Execute "npx opencode-qwencode-auth" ou "qwen-code auth login" para re-autenticar.'
            );
            return null;
          }
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
          label: 'Qwen Code (qwen.ai OAuth)',
          authorize: async () => {
            const { verifier, challenge } = generatePKCE();

            try {
              const deviceAuth = await requestDeviceAuthorization(challenge);
              openBrowser(deviceAuth.verification_uri_complete);

              const POLLING_MARGIN_MS = 3000;

              return {
                url: deviceAuth.verification_uri_complete,
                instructions: `Código: ${deviceAuth.user_code}`,
                method: 'auto' as const,
                callback: async () => {
                  const startTime = Date.now();
                  const timeoutMs = deviceAuth.expires_in * 1000;
                  let interval = 5000;

                  while (Date.now() - startTime < timeoutMs) {
                    await Bun.sleep(interval + POLLING_MARGIN_MS);

                    try {
                      const tokenResponse = await pollDeviceToken(deviceAuth.device_code, verifier);

                      if (tokenResponse) {
                        const credentials = tokenResponseToCredentials(tokenResponse);
                        saveCredentials(credentials);

                        return {
                          type: 'success' as const,
                          access: credentials.accessToken,
                          refresh: credentials.refreshToken || '',
                          expires: credentials.expiryDate || Date.now() + 3600000,
                        };
                      }
                    } catch (e) {
                      const msg = e instanceof Error ? e.message : '';
                      if (msg.includes('slow_down')) {
                        interval = Math.min(interval + 5000, 15000);
                      } else if (!msg.includes('authorization_pending')) {
                        return { type: 'failed' as const };
                      }
                    }
                  }

                  return { type: 'failed' as const };
                },
              };
            } catch (e) {
              const msg = e instanceof Error ? e.message : 'Erro desconhecido';
              return {
                url: '',
                instructions: `Erro: ${msg}`,
                method: 'auto' as const,
                callback: async () => ({ type: 'failed' as const }),
              };
            }
          },
        },
      ],
    },

    config: async (config: Record<string, unknown>) => {
      const providers = (config.provider as Record<string, unknown>) || {};

      providers[QWEN_PROVIDER_ID] = {
        npm: '@ai-sdk/openai-compatible',
        name: 'Qwen Code',
        options: { baseURL: QWEN_API_CONFIG.baseUrl },
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
