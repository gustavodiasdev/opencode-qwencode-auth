/**
 * OpenCode Qwen Auth Plugin
 *
 * Plugin de autenticação OAuth para Qwen, baseado no qwen-code.
 * Implementa Device Flow (RFC 8628) para autenticação.
 *
 * Provider único: qwen-code → portal.qwen.ai/v1
 * Modelos confirmados: qwen3-coder-plus, qwen3-coder-flash, coder-model, vision-model
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

/** Verifica se existem credenciais válidas em ~/.qwen/oauth_creds.json */
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

/** Obtém um access token válido (com refresh se necessário) */
async function getValidAccessToken(
  getAuth: () => Promise<{ type: string; access?: string; refresh?: string; expires?: number }>,
): Promise<string | null> {
  const auth = await getAuth();

  // Se não é OAuth, tentar carregar credenciais locais do qwen-code
  if (!auth || auth.type !== 'oauth') {
    const creds = checkExistingCredentials();
    return creds?.accessToken ?? null;
  }

  let accessToken = auth.access;

  // Refresh se expirado (com margem de 30s)
  if (accessToken && auth.expires && Date.now() > auth.expires - 30000 && auth.refresh) {
    try {
      const refreshed = await refreshAccessToken(auth.refresh);
      accessToken = refreshed.accessToken;
      saveCredentials(refreshed);
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      logTechnicalDetail(`Token refresh falhou: ${detail}`);
      accessToken = undefined;
    }
  }

  // Fallback para credenciais locais do qwen-code
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

  return accessToken ?? null;
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
        provider: { models?: Record<string, { cost?: { input: number; output: number } }> },
      ) => {
        // Zerar custo dos modelos (gratuito via OAuth)
        if (provider?.models) {
          for (const model of Object.values(provider.models)) {
            if (model) model.cost = { input: 0, output: 0 };
          }
        }

        const accessToken = await getValidAccessToken(getAuth);
        if (!accessToken) return null;

        return {
          apiKey: accessToken,
          baseURL: QWEN_API_CONFIG.baseUrl,
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
