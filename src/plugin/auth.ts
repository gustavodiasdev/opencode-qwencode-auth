/**
 * Qwen Credentials Management
 *
 * Handles loading, saving, and validating credentials
 */

import { homedir } from 'node:os';
import { join } from 'node:path';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';

import type { QwenCredentials } from '../types.js';
import { refreshAccessToken, isCredentialsExpired } from '../qwen/oauth.js';

/**
 * Get the path to the credentials file
 * Uses the same location as qwen-code for compatibility
 */
export function getCredentialsPath(): string {
  const homeDir = homedir();
  return join(homeDir, '.qwen', 'oauth_creds.json');
}

/**
 * Get the OpenCode auth store path
 */
export function getOpenCodeAuthPath(): string {
  const homeDir = homedir();
  return join(homeDir, '.local', 'share', 'opencode', 'auth.json');
}

/**
 * Load existing Qwen credentials if available
 * Supports qwen-code format with expiry_date and resource_url
 */
export function loadCredentials(): QwenCredentials | null {
  const credPath = getCredentialsPath();

  if (!existsSync(credPath)) {
    return null;
  }

  try {
    const data = readFileSync(credPath, 'utf-8');
    const parsed = JSON.parse(data);

    // Handle qwen-code format and variations
    if (parsed.access_token || parsed.accessToken) {
      return {
        accessToken: parsed.access_token || parsed.accessToken,
        tokenType: parsed.token_type || parsed.tokenType || 'Bearer',
        refreshToken: parsed.refresh_token || parsed.refreshToken,
        resourceUrl: parsed.resource_url || parsed.resourceUrl,
        // qwen-code uses expiry_date, fallback to expires_at for compatibility
        expiryDate: parsed.expiry_date || parsed.expiresAt || parsed.expires_at,
        scope: parsed.scope,
      };
    }

    return null;
  } catch (error) {
    console.error('Error loading Qwen credentials:', error);
    return null;
  }
}

/**
 * Save credentials to file in qwen-code compatible format
 */
export function saveCredentials(credentials: QwenCredentials): void {
  const credPath = getCredentialsPath();
  const dir = join(homedir(), '.qwen');

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  // Save in qwen-code format for compatibility
  const data = {
    access_token: credentials.accessToken,
    token_type: credentials.tokenType || 'Bearer',
    refresh_token: credentials.refreshToken,
    resource_url: credentials.resourceUrl,
    expiry_date: credentials.expiryDate,
    scope: credentials.scope,
  };

  writeFileSync(credPath, JSON.stringify(data, null, 2));
}

/**
 * Get valid credentials, refreshing if necessary
 */
export async function getValidCredentials(): Promise<QwenCredentials | null> {
  let credentials = loadCredentials();

  if (!credentials) {
    return null;
  }

  if (isCredentialsExpired(credentials) && credentials.refreshToken) {
    try {
      credentials = await refreshAccessToken(credentials.refreshToken);
      saveCredentials(credentials);
    } catch (error) {
      console.error('Failed to refresh token:', error);
      return null;
    }
  }

  return credentials;
}

// Re-export isCredentialsExpired for convenience
export { isCredentialsExpired } from '../qwen/oauth.js';
