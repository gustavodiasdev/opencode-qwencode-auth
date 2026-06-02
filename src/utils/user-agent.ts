/**
 * User-Agent generator for Qwen Code client emulation
 * 
 * Emulates the official qwen-code CLI User-Agent format:
 * QwenCode/{version} ({platform}; {arch})
 * 
 * Example: QwenCode/0.14.0 (Linux; x64)
 */

import { getPlatformInfo } from './platform.js';

/**
 * Version of the official qwen-code client that we're emulating.
 * Update this when the official client updates to a new version.
 */
const QWEN_CODE_VERSION = '0.14.0';

/**
 * Generate User-Agent string with dynamic platform detection
 */
export function generateUserAgent(): string {
  const platformInfo = getPlatformInfo();
  return `QwenCode/${QWEN_CODE_VERSION} (${platformInfo})`;
}

/**
 * Generate X-DashScope-UserAgent header value
 * (same as User-Agent for now, but separated for future customization)
 */
export function generateDashScopeUserAgent(): string {
  return generateUserAgent();
}
