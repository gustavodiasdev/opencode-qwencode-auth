/**
 * OpenCode Qwen Auth Plugin
 *
 * OAuth authentication plugin for Qwen, based on qwen-code.
 * Implements Device Flow (RFC 8628) for authentication.
 *
 * Provider: qwen-code -> portal.qwen.ai/v1
 * Models: coder-model (Qwen 3.6 Plus with video)
 */

import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';

import { QWEN_PROVIDER_ID, QWEN_API_CONFIG, QWEN_MODELS, getQwenHeaders } from './constants.js';
import type { QwenCredentials } from './types.js';
import { resolveBaseUrl } from './plugin/auth.js';
import {
  generatePKCE,
  requestDeviceAuthorization,
  pollDeviceToken,
  tokenResponseToCredentials,
  SlowDownError,
} from './qwen/oauth.js';
import { retryWithBackoff, getErrorStatus } from './utils/retry.js';
import { RequestQueue } from './plugin/request-queue.js';
import { tokenManager } from './plugin/token-manager.js';
import { createDebugLogger } from './utils/debug-logger.js';

const debugLogger = createDebugLogger('PLUGIN');

// Global session ID for the plugin lifetime
const PLUGIN_SESSION_ID = randomUUID();

// Singleton request queue for throttling (shared across all requests)
const requestQueue = new RequestQueue();

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
    console.error('\n[Qwen Auth] Unable to open browser automatically.');
    console.error('Please open this URL manually to authenticate:\n');
    console.error(`  ${url}\n`);
  }
}

// ============================================
// Plugin Principal
// ============================================

export const QwenAuthPlugin = async (input: any) => {
  const client = input?.client;
  
  return {
    auth: {
      provider: QWEN_PROVIDER_ID,

      loader: async (
        getAuth: any,
        provider: { models?: Record<string, { cost?: { input: number; output: number } }> },
      ) => {
        // Zero model costs (free via OAuth)
        if (provider?.models) {
          for (const model of Object.values(provider.models)) {
            if (model) model.cost = { input: 0, output: 0 };
          }
        }

        // Get latest valid credentials
        let credentials = await tokenManager.getValidCredentials();

        // POLLING: No credentials yet, wait for OAuth to complete (race condition fix)
        // This resolves the /connect issue where the loader may be called DURING OAuth polling
        if (!credentials?.accessToken) {
          debugLogger.info('No credentials found, polling for OAuth completion...');
          for (let i = 0; i < 6; i++) {
            await new Promise(resolve => setTimeout(resolve, 500));
            credentials = await tokenManager.getValidCredentials();
            if (credentials?.accessToken) {
              debugLogger.info('OAuth completed during loader polling', {
                attempt: i + 1,
                elapsed: (i + 1) * 500
              });
              break;
            }
          }
        }

        const baseURL = resolveBaseUrl(credentials?.resourceUrl);

        return {
          apiKey: credentials?.accessToken || 'pending-auth',
          baseURL,
          headers: {
            ...getQwenHeaders(),
          },
          // Custom fetch with throttling, retry and 401 recovery
          fetch: async (url: string, options: any = {}) => {
            return requestQueue.enqueue(async () => {
              let authRetryCount = 0;

              const executeRequest = async (): Promise<Response> => {
                // Get latest token (possibly refreshed by concurrent request)
                const currentCreds = await tokenManager.getValidCredentials();
                const token = currentCreds?.accessToken;
                
                if (!token) throw new Error('No access token available');

                // Prepare merged headers
                const mergedHeaders: Record<string, string> = {
                  ...getQwenHeaders(),
                };

                // Merge provided headers (handles both plain object and Headers instance)
                if (options.headers) {
                  if (typeof (options.headers as any).entries === 'function') {
                    for (const [k, v] of (options.headers as any).entries()) {
                      const kl = k.toLowerCase();
                      if (!kl.startsWith('x-dashscope') && kl !== 'user-agent' && kl !== 'authorization') {
                        mergedHeaders[k] = v;
                      }
                    }
                  } else {
                    for (const [k, v] of Object.entries(options.headers)) {
                      const kl = k.toLowerCase();
                      if (!kl.startsWith('x-dashscope') && kl !== 'user-agent' && kl !== 'authorization') {
                        mergedHeaders[k] = v as string;
                      }
                    }
                  }
                }

                // Force our Authorization token
                mergedHeaders['Authorization'] = `Bearer ${token}`;

                // Perform the request
                const response = await fetch(url, {
                  ...options,
                  headers: mergedHeaders
                });

                // Reactive recovery for 401 (token expired mid-session)
                if (response.status === 401 && authRetryCount < 1) {
                  authRetryCount++;
                  debugLogger.warn('401 detected, forcing token refresh...');
                  
                  const refreshed = await tokenManager.getValidCredentials(true);
                  
                  if (refreshed?.accessToken) {
                    debugLogger.info('Token refreshed, retrying request');
                    return executeRequest();
                  }
                }

                // Error handling for retryWithBackoff
                if (!response.ok) {
                  const errorText = await response.text().catch(() => '');
                  const error: any = new Error(`HTTP ${response.status}: ${errorText}`);
                  error.status = response.status;
                  throw error;
                }

                return response;
              };

              // Use retryWithBackoff for 429/5xx errors (401 is handled by executeRequest)
              return retryWithBackoff(() => executeRequest(), {
                authType: 'qwen-oauth',
                maxAttempts: 7,
                shouldRetryOnError: (error: any) => {
                  const status = error.status || getErrorStatus(error);
                  return status === 429 || (status !== undefined && status >= 500 && status < 600);
                }
              });
            });
          }
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
                        tokenManager.setCredentials(credentials);

                        // Save credentials to OpenCode auth system so provider appears in UI without restart
                        if (client?.auth?.set) {
                          try {
                            await client.auth.set({
                              providerID: QWEN_PROVIDER_ID,
                              auth: { 
                                type: "oauth",
                                access: credentials.accessToken,
                                refresh: credentials.refreshToken ?? '',
                                expires: credentials.expiryDate || Date.now() + 3600000
                              }
                            });
                          } catch (authError) {
                            debugLogger.error('Failed to save credentials to OpenCode auth', authError);
                          }
                        }

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

    config: async (config: Record<string, unknown>) => {
      const providers = (config.provider as Record<string, unknown>) || {};
      
      providers[QWEN_PROVIDER_ID] = {
        npm: '@ai-sdk/openai-compatible',
        name: 'Qwen Code',
        options: { 
          baseURL: QWEN_API_CONFIG.baseUrl,
          headers: getQwenHeaders()
        },
        models: Object.fromEntries(
          Object.entries(QWEN_MODELS).map(([id, m]) => {
            const caps = 'capabilities' in m ? m.capabilities : {};
            const inputModalities = ['text'];
            if (caps?.vision) inputModalities.push('image');
            if (caps?.video) inputModalities.push('video');
            return [
              id,
              {
                id: m.id,
                name: m.name,
                reasoning: m.reasoning,
                limit: { context: m.contextWindow, output: m.maxOutput },
                cost: m.cost,
                modalities: { 
                  input: inputModalities, 
                  output: ['text'] 
                },
              },
            ];
          })
        ),
      };

      config.provider = providers;
    },
  };
};

export default QwenAuthPlugin;
