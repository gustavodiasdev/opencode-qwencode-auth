/**
 * Integration tests for authentication utilities
 * Tests components that work together but don't require real API calls
 */

import { describe, it, expect, mock } from 'bun:test';
import {
  generatePKCE,
  isCredentialsExpired,
  SlowDownError,
} from '../../src/qwen/oauth.js';
import {
  resolveBaseUrl,
  getCredentialsPath,
} from '../../src/plugin/auth.js';
import { QWEN_API_CONFIG } from '../../src/constants.js';
import { retryWithBackoff, getErrorStatus } from '../../src/utils/retry.js';
import type { QwenCredentials } from '../../src/types.js';

describe('resolveBaseUrl', () => {
  it('should return portal URL for undefined', () => {
    const result = resolveBaseUrl(undefined);
    expect(result).toBe(QWEN_API_CONFIG.portalBaseUrl);
  });

  it('should return portal URL for portal.qwen.ai', () => {
    const result = resolveBaseUrl('portal.qwen.ai');
    expect(result).toBe(QWEN_API_CONFIG.portalBaseUrl);
  });

  it('should return dashscope URL for dashscope', () => {
    const result = resolveBaseUrl('dashscope');
    expect(result).toBe(QWEN_API_CONFIG.defaultBaseUrl);
  });

  it('should return dashscope URL for dashscope.aliyuncs.com', () => {
    const result = resolveBaseUrl('dashscope.aliyuncs.com');
    expect(result).toBe(QWEN_API_CONFIG.defaultBaseUrl);
  });

  it('should return portal URL for unknown URLs', () => {
    const customUrl = 'https://custom.api.example.com';
    const result = resolveBaseUrl(customUrl);
    expect(result).toBe(QWEN_API_CONFIG.portalBaseUrl);
  });
});

describe('isCredentialsExpired', () => {
  const createCredentials = (expiryOffset: number): QwenCredentials => ({
    accessToken: 'test_token',
    tokenType: 'Bearer',
    refreshToken: 'test_refresh',
    resourceUrl: 'portal.qwen.ai',
    expiryDate: Date.now() + expiryOffset,
    scope: 'openid',
  });

  it('should return false for valid credentials (not expired)', () => {
    const creds = createCredentials(3600000);
    expect(isCredentialsExpired(creds)).toBe(false);
  });

  it('should return true for expired credentials', () => {
    const creds = createCredentials(-3600000);
    expect(isCredentialsExpired(creds)).toBe(true);
  });

  it('should return true for credentials expiring within buffer', () => {
    const creds = createCredentials(20000);
    expect(isCredentialsExpired(creds)).toBe(true);
  });
});

describe('generatePKCE', () => {
  it('should generate verifier with correct length', () => {
    const { verifier } = generatePKCE();
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(verifier.length).toBeLessThanOrEqual(128);
  });

  it('should generate verifier with base64url characters only', () => {
    const { verifier } = generatePKCE();
    expect(verifier).toMatch(/^[a-zA-Z0-9_-]+$/);
  });

  it('should generate challenge from verifier', () => {
    const { verifier, challenge } = generatePKCE();
    expect(challenge).toBeDefined();
    expect(challenge.length).toBeGreaterThan(0);
    expect(challenge).not.toBe(verifier);
  });

  it('should generate different pairs on each call', () => {
    const pkce1 = generatePKCE();
    const pkce2 = generatePKCE();
    
    expect(pkce1.verifier).not.toBe(pkce2.verifier);
    expect(pkce1.challenge).not.toBe(pkce2.challenge);
  });
});

describe('retryWithBackoff', () => {
  it('should succeed on first attempt', async () => {
    const mockFn = mock(() => 'success');
    const result = await retryWithBackoff(mockFn, { maxAttempts: 3 });
    expect(result).toBe('success');
    expect(mockFn).toHaveBeenCalledTimes(1);
  });

  it('should retry on transient errors', async () => {
    let attempts = 0;
    const result = await retryWithBackoff(async () => {
      attempts++;
      if (attempts < 3) throw { status: 429 };
      return 'success';
    }, { maxAttempts: 5, initialDelayMs: 50 });
    
    expect(result).toBe('success');
    expect(attempts).toBe(3);
  });

  it('should not retry on permanent errors', async () => {
    let attempts = 0;
    await expect(
      retryWithBackoff(async () => {
        attempts++;
        throw { status: 400 };
      }, { maxAttempts: 3, initialDelayMs: 50 })
    ).rejects.toThrow();
    
    expect(attempts).toBe(1);
  });

  it('should respect maxAttempts', async () => {
    let attempts = 0;
    await expect(
      retryWithBackoff(async () => {
        attempts++;
        throw { status: 429 };
      }, { maxAttempts: 3, initialDelayMs: 50 })
    ).rejects.toThrow();
    
    expect(attempts).toBe(3);
  });

  it('should handle 401 errors with custom retry logic', async () => {
    let attempts = 0;
    const result = await retryWithBackoff(async () => {
      attempts++;
      if (attempts === 1) throw { status: 401 };
      return 'success';
    }, { 
      maxAttempts: 3, 
      initialDelayMs: 50,
      shouldRetryOnError: (error: any) => error.status === 401 
    });
    
    expect(result).toBe('success');
    expect(attempts).toBe(2);
  });
});

describe('getErrorStatus', () => {
  it('should extract status from error object', () => {
    const error = { status: 429, message: 'Too Many Requests' };
    expect(getErrorStatus(error)).toBe(429);
  });

  it('should return undefined for error without status', () => {
    const error = { message: 'Something went wrong' };
    expect(getErrorStatus(error)).toBeUndefined();
  });

  it('should return undefined for null/undefined', () => {
    expect(getErrorStatus(null as any)).toBeUndefined();
    expect(getErrorStatus(undefined)).toBeUndefined();
  });
});

describe('SlowDownError', () => {
  it('should create error with correct name', () => {
    const error = new SlowDownError();
    expect(error.name).toBe('SlowDownError');
    expect(error.message).toContain('slow_down');
  });
});

describe('getCredentialsPath', () => {
  it('should return path in home directory', () => {
    const path = getCredentialsPath();
    expect(path).toContain('.qwen');
    expect(path).toContain('oauth_creds.json');
  });

  it('should return consistent path', () => {
    const path1 = getCredentialsPath();
    const path2 = getCredentialsPath();
    expect(path1).toBe(path2);
  });
});
