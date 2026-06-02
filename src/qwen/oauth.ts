/**
 * Qwen OAuth Device Flow Implementation
 *
 * Based on qwen-code's implementation (RFC 8628)
 * Handles PKCE, device authorization, and token polling
 */

import { randomBytes, createHash, randomUUID } from 'node:crypto';

import { QWEN_OAUTH_CONFIG } from '../constants.js';
import type { QwenCredentials } from '../types.js';
import { QwenAuthError, CredentialsClearRequiredError, logTechnicalDetail } from '../errors.js';
import { retryWithBackoff, getErrorStatus } from '../utils/retry.js';

/**
 * Error thrown when the server requests slow_down (RFC 8628)
 * The caller should increase the polling interval
 */
export class SlowDownError extends Error {
  constructor() {
    super('slow_down: server requested increased polling interval');
    this.name = 'SlowDownError';
  }
}

/**
 * Device authorization response from Qwen OAuth
 */
export interface DeviceAuthorizationResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete: string;
  expires_in: number;
}

/**
 * Token response from Qwen OAuth
 */
export interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  token_type: string;
  expires_in: number;
  scope?: string;
  resource_url?: string;
}

/**
 * Generate PKCE code verifier and challenge (RFC 7636)
 */
export function generatePKCE(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256')
    .update(verifier)
    .digest('base64url');

  return { verifier, challenge };
}

/**
 * Convert object to URL-encoded form data
 */
export function objectToUrlEncoded(data: Record<string, string>): string {
  return Object.keys(data)
    .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(data[key])}`)
    .join('&');
}

/**
 * Request device authorization from Qwen OAuth
 * Returns device_code, user_code, and verification URL
 */
export async function requestDeviceAuthorization(
  codeChallenge: string
): Promise<DeviceAuthorizationResponse> {
  const bodyData = {
    client_id: QWEN_OAUTH_CONFIG.clientId,
    scope: QWEN_OAUTH_CONFIG.scope,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

  try {
    const response = await fetch(QWEN_OAUTH_CONFIG.deviceCodeEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
        'x-request-id': randomUUID(),
      },
      signal: controller.signal,
      body: objectToUrlEncoded(bodyData),
    });

  if (!response.ok) {
    const errorData = await response.text();
    logTechnicalDetail(`Device auth HTTP ${response.status}: ${errorData}`);
    throw new QwenAuthError('auth_required', `HTTP ${response.status}: ${errorData}`);
  }

  const result = await response.json() as DeviceAuthorizationResponse;

  if (!result.device_code || !result.user_code) {
    throw new Error('Invalid device authorization response');
  }

  return result;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Poll for device token after user authorization
 * Returns null if still pending, throws on error
 */
export async function pollDeviceToken(
  deviceCode: string,
  codeVerifier: string
): Promise<TokenResponse | null> {
  const bodyData = {
    grant_type: QWEN_OAUTH_CONFIG.grantType,
    client_id: QWEN_OAUTH_CONFIG.clientId,
    device_code: deviceCode,
    code_verifier: codeVerifier,
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

  try {
    const response = await fetch(QWEN_OAUTH_CONFIG.tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      signal: controller.signal,
      body: objectToUrlEncoded(bodyData),
    });

    if (!response.ok) {
      const responseText = await response.text();

      // Try to parse error response
      try {
        const errorData = JSON.parse(responseText) as { error?: string; error_description?: string };

        // RFC 8628: authorization_pending means user hasn't authorized yet
        if (response.status === 400 && errorData.error === 'authorization_pending') {
          return null; // Still pending
        }

        // RFC 8628: slow_down means we should increase poll interval
        if (response.status === 429 && errorData.error === 'slow_down') {
          throw new SlowDownError();
        }

        const error = new Error(
          `Token poll failed: ${errorData.error || 'Unknown error'} - ${errorData.error_description || responseText}`
        );
        (error as Error & { status?: number }).status = response.status;
        throw error;
      } catch (parseError) {
        if (parseError instanceof SyntaxError) {
          const error = new Error(
            `Token poll failed: ${response.status} ${response.statusText}. Response: ${responseText}`
          );
          (error as Error & { status?: number }).status = response.status;
          throw error;
        }
        throw parseError;
      }
    }

    return (await response.json()) as TokenResponse;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Convert token response to QwenCredentials format
 */
export function tokenResponseToCredentials(tokenResponse: TokenResponse): QwenCredentials {
  return {
    accessToken: tokenResponse.access_token,
    tokenType: tokenResponse.token_type || 'Bearer',
    refreshToken: tokenResponse.refresh_token,
    resourceUrl: tokenResponse.resource_url,
    expiryDate: Date.now() + tokenResponse.expires_in * 1000,
    scope: tokenResponse.scope,
  };
}

/**
 * Refresh the access token using refresh_token grant
 * Includes automatic retry for transient errors (429, 5xx)
 */
export async function refreshAccessToken(refreshToken: string): Promise<QwenCredentials> {
  const bodyData = {
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: QWEN_OAUTH_CONFIG.clientId,
  };

  return retryWithBackoff(
    async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

      try {
        const response = await fetch(QWEN_OAUTH_CONFIG.tokenEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: 'application/json',
          },
          signal: controller.signal,
          body: objectToUrlEncoded(bodyData),
        });

      if (!response.ok) {
        const errorText = await response.text();
        logTechnicalDetail(`Token refresh HTTP ${response.status}: ${errorText}`);
        
        // Don't retry on invalid_grant (refresh token expired/revoked)
        // Signal that credentials need to be cleared
        if (errorText.includes('invalid_grant')) {
          throw new CredentialsClearRequiredError('Refresh token expired or revoked');
        }
        
        throw new QwenAuthError('refresh_failed', `HTTP ${response.status}: ${errorText}`);
      }

      const data = await response.json() as TokenResponse;

      // Validate required fields
      if (!data.access_token) {
        throw new QwenAuthError('refresh_failed', 'No access token in refresh response');
      }

      return {
        accessToken: data.access_token,
        tokenType: data.token_type || 'Bearer',
        refreshToken: data.refresh_token || refreshToken,
        resourceUrl: data.resource_url,
        expiryDate: Date.now() + data.expires_in * 1000,
        scope: data.scope,
      };
      } finally {
        clearTimeout(timeoutId);
      }
    },
    {
      maxAttempts: 5,
      initialDelayMs: 1000,
      maxDelayMs: 15000,
      shouldRetryOnError: (error) => {
        // Don't retry on invalid_grant errors
        if (error.message.includes('invalid_grant')) {
          return false;
        }
        // Retry on 429 or 5xx errors
        const status = getErrorStatus(error);
        return status === 429 || (status !== undefined && status >= 500 && status < 600);
      },
    }
  );
}

/**
 * Check if credentials are expired
 * Uses 30 second buffer like qwen-code
 */
export function isCredentialsExpired(credentials: QwenCredentials): boolean {
  if (!credentials.expiryDate) {
    return false; // Assume not expired if no expiry time
  }

  // Add 30 second buffer (same as qwen-code)
  return Date.now() > credentials.expiryDate - 30 * 1000;
}

/**
 * Perform full device authorization flow
 * Opens browser for user to authorize, polls for token
 */
export async function performDeviceAuthFlow(
  onVerificationUrl: (url: string, userCode: string) => void,
  pollIntervalMs = 2000,
  timeoutMs = 5 * 60 * 1000
): Promise<QwenCredentials> {
  // Generate PKCE
  const { verifier, challenge } = generatePKCE();

  // Request device authorization
  const deviceAuth = await requestDeviceAuthorization(challenge);

  // Notify caller of verification URL
  onVerificationUrl(deviceAuth.verification_uri_complete, deviceAuth.user_code);

  // Poll for token
  const startTime = Date.now();
  let interval = pollIntervalMs;

  while (Date.now() - startTime < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, interval));

    try {
      const tokenResponse = await pollDeviceToken(deviceAuth.device_code, verifier);

      if (tokenResponse) {
        return tokenResponseToCredentials(tokenResponse);
      }
    } catch (error) {
      // Check if we should slow down
      if (error instanceof SlowDownError) {
        interval = Math.min(interval * 1.5, 10000); // Increase interval, max 10s
      } else if ((error as Error & { status?: number }).status === 401) {
        throw new Error('Device code expired or invalid. Please restart authentication.');
      } else {
        throw error;
      }
    }
  }

  throw new Error('Device authorization timeout');
}
