/**
 * Qwen OAuth Device Flow Implementation
 *
 * Based on qwen-code's implementation (RFC 8628)
 * Handles PKCE, device authorization, and token polling
 */

import { randomBytes, createHash, randomUUID } from 'node:crypto';

import { QWEN_OAUTH_CONFIG } from '../constants.js';
import type { QwenCredentials } from '../types.js';

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
 * Generate random state for OAuth
 */
export function generateState(): string {
  return randomBytes(16).toString('hex');
}

/**
 * Convert object to URL-encoded form data
 */
function objectToUrlEncoded(data: Record<string, string>): string {
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

  const response = await fetch(QWEN_OAUTH_CONFIG.deviceCodeEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
      'x-request-id': randomUUID(),
    },
    body: objectToUrlEncoded(bodyData),
  });

  if (!response.ok) {
    const errorData = await response.text();
    throw new Error(
      `Device authorization failed: ${response.status} ${response.statusText}. Response: ${errorData}`
    );
  }

  const result = await response.json() as DeviceAuthorizationResponse;

  if (!result.device_code || !result.user_code) {
    throw new Error('Invalid device authorization response');
  }

  return result;
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

  const response = await fetch(QWEN_OAUTH_CONFIG.tokenEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
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
        return null; // Still pending, but should slow down
      }

      throw new Error(
        `Token poll failed: ${errorData.error || 'Unknown error'} - ${errorData.error_description || responseText}`
      );
    } catch (parseError) {
      if (parseError instanceof SyntaxError) {
        throw new Error(
          `Token poll failed: ${response.status} ${response.statusText}. Response: ${responseText}`
        );
      }
      throw parseError;
    }
  }

  return (await response.json()) as TokenResponse;
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
 */
export async function refreshAccessToken(refreshToken: string): Promise<QwenCredentials> {
  const bodyData = {
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: QWEN_OAUTH_CONFIG.clientId,
  };

  const response = await fetch(QWEN_OAUTH_CONFIG.tokenEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: objectToUrlEncoded(bodyData),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Token refresh failed: ${response.status} - ${errorText}`);
  }

  const data = await response.json() as TokenResponse;

  return {
    accessToken: data.access_token,
    tokenType: data.token_type || 'Bearer',
    refreshToken: data.refresh_token || refreshToken,
    resourceUrl: data.resource_url,
    expiryDate: Date.now() + data.expires_in * 1000,
    scope: data.scope,
  };
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
      if (error instanceof Error && error.message.includes('slow_down')) {
        interval = Math.min(interval * 1.5, 10000); // Increase interval, max 10s
      } else {
        throw error;
      }
    }
  }

  throw new Error('Device authorization timeout');
}
