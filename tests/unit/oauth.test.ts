/**
 * Tests for OAuth Device Flow
 */

import { describe, it, expect, mock } from 'bun:test';
import { createHash } from 'node:crypto';
import {
  generatePKCE,
  objectToUrlEncoded,
  tokenResponseToCredentials,
} from '../../src/qwen/oauth.js';
import type { TokenResponse } from '../../src/qwen/oauth.js';

describe('PKCE Generation', () => {
  it('should generate PKCE with verifier and challenge', () => {
    const pkce = generatePKCE();
    expect(pkce.verifier).toBeDefined();
    expect(pkce.challenge).toBeDefined();
    expect(pkce.verifier.length).toBeGreaterThanOrEqual(43);
    expect(pkce.verifier.length).toBeLessThanOrEqual(128);
  });

  it('should generate verifier with base64url characters only', () => {
    const { verifier } = generatePKCE();
    expect(verifier).toMatch(/^[a-zA-Z0-9_-]+$/);
  });

  it('should generate different PKCE pairs on each call', () => {
    const pkce1 = generatePKCE();
    const pkce2 = generatePKCE();
    expect(pkce1.verifier).not.toBe(pkce2.verifier);
    expect(pkce1.challenge).not.toBe(pkce2.challenge);
  });

  it('should generate code challenge from verifier', () => {
    const { verifier, challenge } = generatePKCE();

    // Verify code challenge is base64url encoded SHA256
    const hash = createHash('sha256')
      .update(verifier)
      .digest('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
    
    expect(challenge).toBe(hash);
  });
});

describe('objectToUrlEncoded', () => {
  it('should encode simple object', () => {
    const obj = { key1: 'value1', key2: 'value2' };
    const result = objectToUrlEncoded(obj);
    expect(result).toBe('key1=value1&key2=value2');
  });

  it('should encode special characters', () => {
    const obj = { key: 'value with spaces', special: 'a&b=c' };
    const result = objectToUrlEncoded(obj);
    expect(result).toBe('key=value%20with%20spaces&special=a%26b%3Dc');
  });

  it('should handle empty strings', () => {
    const obj = { key: '' };
    const result = objectToUrlEncoded(obj);
    expect(result).toBe('key=');
  });

  it('should handle multiple keys with same name (last one wins)', () => {
    // Note: JavaScript objects don't support duplicate keys
    // This test documents the behavior
    const obj = { key: 'first', key: 'second' };
    const result = objectToUrlEncoded(obj);
    expect(result).toBe('key=second');
  });
});

describe('tokenResponseToCredentials', () => {
  const mockTokenResponse: TokenResponse = {
    access_token: 'test_access_token',
    token_type: 'Bearer',
    refresh_token: 'test_refresh_token',
    resource_url: 'https://dashscope.aliyuncs.com',
    expires_in: 7200,
    scope: 'openid profile email model.completion',
  };

  it('should convert token response to credentials', () => {
    const credentials = tokenResponseToCredentials(mockTokenResponse);
    
    expect(credentials.accessToken).toBe('test_access_token');
    expect(credentials.tokenType).toBe('Bearer');
    expect(credentials.refreshToken).toBe('test_refresh_token');
    expect(credentials.resourceUrl).toBe('https://dashscope.aliyuncs.com');
    expect(credentials.scope).toBe('openid profile email model.completion');
  });

  it('should default token_type to Bearer if not provided', () => {
    const response = { ...mockTokenResponse, token_type: undefined as any };
    const credentials = tokenResponseToCredentials(response);
    expect(credentials.tokenType).toBe('Bearer');
  });

  it('should calculate expiryDate correctly', () => {
    const before = Date.now();
    const credentials = tokenResponseToCredentials(mockTokenResponse);
    const after = Date.now() + 7200000; // 2 hours in ms
    
    expect(credentials.expiryDate).toBeGreaterThanOrEqual(before + 7200000);
    expect(credentials.expiryDate).toBeLessThanOrEqual(after + 1000); // Small buffer
  });

  it('should handle missing refresh_token', () => {
    const response = { ...mockTokenResponse, refresh_token: undefined as any };
    const credentials = tokenResponseToCredentials(response);
    expect(credentials.refreshToken).toBeUndefined();
  });

  it('should handle missing resource_url', () => {
    const response = { ...mockTokenResponse, resource_url: undefined as any };
    const credentials = tokenResponseToCredentials(response);
    expect(credentials.resourceUrl).toBeUndefined();
  });
});

describe('OAuth Constants', () => {
  it('should have correct grant type', () => {
    const { QWEN_OAUTH_CONFIG } = require('../../src/constants.js');
    expect(QWEN_OAUTH_CONFIG.grantType).toBe('urn:ietf:params:oauth:grant-type:device_code');
  });

  it('should have scope including model.completion', () => {
    const { QWEN_OAUTH_CONFIG } = require('../../src/constants.js');
    expect(QWEN_OAUTH_CONFIG.scope).toContain('model.completion');
  });

  it('should have non-empty client_id', () => {
    const { QWEN_OAUTH_CONFIG } = require('../../src/constants.js');
    expect(QWEN_OAUTH_CONFIG.clientId).toBeTruthy();
    expect(QWEN_OAUTH_CONFIG.clientId.length).toBeGreaterThan(0);
  });
});
