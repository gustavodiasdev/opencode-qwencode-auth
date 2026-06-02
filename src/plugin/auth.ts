/**
 * Qwen Credentials Management
 *
 * Handles saving credentials to ~/.qwen/oauth_creds.json
 */

import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { existsSync, writeFileSync, mkdirSync, readFileSync, renameSync, unlinkSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

import type { QwenCredentials } from '../types.js';
import { QWEN_API_CONFIG } from '../constants.js';

/**
 * Get the path to the credentials file
 * Supports test override via QWEN_TEST_CREDS_PATH environment variable
 */
export function getCredentialsPath(): string {
  // Check for test override (prevents tests from modifying user credentials)
  if (process.env.QWEN_TEST_CREDS_PATH) {
    return process.env.QWEN_TEST_CREDS_PATH;
  }
  const homeDir = homedir();
  return join(homeDir, '.qwen', 'oauth_creds.json');
}

/**
 * Validate credentials structure
 * Matches official client's validateCredentials() function
 */
function validateCredentials(data: unknown): QwenCredentials {
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid credentials format: expected object');
  }

  const creds = data as Partial<QwenCredentials>;
  const requiredFields = ['accessToken', 'tokenType'] as const;

  // Validate required string fields
  for (const field of requiredFields) {
    if (!creds[field] || typeof creds[field] !== 'string') {
      throw new Error(`Invalid credentials: missing or invalid ${field}`);
    }
  }

  // Validate refreshToken (optional but should be string if present)
  if (creds.refreshToken !== undefined && typeof creds.refreshToken !== 'string') {
    throw new Error('Invalid credentials: refreshToken must be a string');
  }

  // Validate expiryDate (required for token management)
  if (!creds.expiryDate || typeof creds.expiryDate !== 'number') {
    throw new Error('Invalid credentials: missing or invalid expiryDate');
  }

  // Validate resourceUrl (optional but should be string if present)
  if (creds.resourceUrl !== undefined && typeof creds.resourceUrl !== 'string') {
    throw new Error('Invalid credentials: resourceUrl must be a string');
  }

  // Validate scope (optional but should be string if present)
  if (creds.scope !== undefined && typeof creds.scope !== 'string') {
    throw new Error('Invalid credentials: scope must be a string');
  }

  return {
    accessToken: creds.accessToken!,
    tokenType: creds.tokenType!,
    refreshToken: creds.refreshToken,
    resourceUrl: creds.resourceUrl,
    expiryDate: creds.expiryDate!,
    scope: creds.scope,
  };
}

/**
 * Load credentials from file and map to camelCase QwenCredentials
 * Includes comprehensive validation matching official client
 */
export function loadCredentials(): QwenCredentials | null {
  const credPath = getCredentialsPath();
  if (!existsSync(credPath)) {
    return null;
  }

  try {
    const content = readFileSync(credPath, 'utf8');
    const data = JSON.parse(content);
    
    // Convert snake_case (file format) to camelCase (internal format)
    // This matches qwen-code format for compatibility
    const converted: QwenCredentials = {
      accessToken: data.access_token,
      tokenType: data.token_type || 'Bearer',
      refreshToken: data.refresh_token,
      resourceUrl: data.resource_url,
      expiryDate: data.expiry_date,
      scope: data.scope,
    };
    
    // Validate converted credentials structure
    const validated = validateCredentials(converted);
    
    return validated;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[QwenAuth] Failed to load credentials:', message);
    
    // Corrupted file - suggest re-authentication
    console.error('[QwenAuth] Credentials file may be corrupted. Please re-authenticate.');
    return null;
  }
}

/**
 * Resolve the API base URL based on the token region
 */
export function resolveBaseUrl(resourceUrl?: string): string {
  if (!resourceUrl) return QWEN_API_CONFIG.portalBaseUrl;

  if (resourceUrl.includes('portal.qwen.ai')) {
    return QWEN_API_CONFIG.portalBaseUrl;
  }

  if (resourceUrl.includes('dashscope')) {
    // Both dashscope and dashscope-intl use similar URL patterns
    if (resourceUrl.includes('dashscope-intl')) {
      return 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1';
    }
    return QWEN_API_CONFIG.defaultBaseUrl;
  }

  return QWEN_API_CONFIG.portalBaseUrl;
}

/**
 * Save credentials to file in qwen-code compatible format
 * Uses atomic write (temp file + rename) to prevent corruption
 */
export function saveCredentials(credentials: QwenCredentials): void {
  const credPath = getCredentialsPath();
  const dir = dirname(credPath);

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

  // ATOMIC WRITE: temp file + rename to prevent corruption
  const tempPath = `${credPath}.tmp.${randomUUID()}`;
  
  try {
    writeFileSync(tempPath, JSON.stringify(data, null, 2));
    renameSync(tempPath, credPath); // Atomic on POSIX systems
  } catch (error) {
    // Cleanup temp file if rename fails
    try {
      if (existsSync(tempPath)) {
        unlinkSync(tempPath);
      }
    } catch {}
    throw error;
  }
}
