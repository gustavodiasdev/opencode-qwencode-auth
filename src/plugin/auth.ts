/**
 * Qwen Credentials Management
 *
 * Handles saving and loading credentials to ~/.qwen/oauth_creds.json
 * Provides URL resolution based on resource_url from OAuth token
 */

import { homedir } from 'node:os';
import { join } from 'node:path';
import { existsSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs';

import { QWEN_API_CONFIG } from '../constants.js';
import type { QwenCredentials } from '../types.js';

/**
 * Get the path to the credentials file
 */
export function getCredentialsPath(): string {
  const homeDir = homedir();
  return join(homeDir, '.qwen', 'oauth_creds.json');
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
 * Load credentials from file
 * Returns null if file doesn't exist or is invalid
 */
export function loadCredentials(): QwenCredentials | null {
  const credPath = getCredentialsPath();
  
  if (!existsSync(credPath)) {
    return null;
  }

  try {
    const content = readFileSync(credPath, 'utf-8');
    const data = JSON.parse(content);

    if (!data.access_token) {
      return null;
    }

    return {
      accessToken: data.access_token,
      tokenType: data.token_type || 'Bearer',
      refreshToken: data.refresh_token,
      resourceUrl: data.resource_url,
      expiryDate: data.expiry_date,
      scope: data.scope,
    };
  } catch {
    return null;
  }
}

/**
 * Resolve the API base URL based on resource_url from OAuth token
 * 
 * The resource_url in the token response determines which API endpoint to use:
 * - "portal.qwen.ai" -> https://portal.qwen.ai/v1
 * - "dashscope" -> https://dashscope.aliyuncs.com/compatible-mode/v1
 * - "dashscope-intl" -> https://dashscope-intl.aliyuncs.com/compatible-mode/v1
 * 
 * If no resource_url is provided, falls back to default DashScope URL
 */
export function resolveBaseUrl(resourceUrl?: string): string {
  if (!resourceUrl) {
    return QWEN_API_CONFIG.baseUrl;
  }

  const normalized = resourceUrl.toLowerCase().trim();

  // Portal endpoint (international users often get this)
  if (normalized.includes('portal.qwen.ai')) {
    return QWEN_API_CONFIG.portalBaseUrl;
  }

  // DashScope International
  if (normalized.includes('dashscope-intl')) {
    return QWEN_API_CONFIG.dashscopeIntlBaseUrl;
  }

  // DashScope (Chinese region)
  if (normalized.includes('dashscope')) {
    return QWEN_API_CONFIG.dashscopeBaseUrl;
  }

  // If resource_url is a full URL, use it directly
  if (normalized.startsWith('http://') || normalized.startsWith('https://')) {
    // Ensure it ends with /v1 for OpenAI-compatible API
    const url = resourceUrl.endsWith('/v1') ? resourceUrl : `${resourceUrl}/v1`;
    return url;
  }

  // Default fallback
  return QWEN_API_CONFIG.baseUrl;
}
