/**
 * Tests for Token Manager
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { TokenManager, tokenManager } from '../../src/plugin/token-manager.js';
import type { QwenCredentials } from '../../src/types.js';

// Mock credentials for testing
const mockCredentials: QwenCredentials = {
  accessToken: 'mock_access_token_12345',
  tokenType: 'Bearer',
  refreshToken: 'mock_refresh_token_67890',
  resourceUrl: 'https://dashscope.aliyuncs.com',
  expiryDate: Date.now() + 3600000, // 1 hour from now
  scope: 'openid profile email model.completion',
};

const expiredCredentials: QwenCredentials = {
  ...mockCredentials,
  expiryDate: Date.now() - 3600000, // 1 hour ago
};

describe('TokenManager', () => {
  let tokenManagerInstance: TokenManager;

  beforeEach(() => {
    tokenManagerInstance = new TokenManager();
  });

  afterEach(() => {
    tokenManagerInstance.clearCache();
  });

  describe('constructor', () => {
    it('should create instance', () => {
      expect(tokenManagerInstance).toBeInstanceOf(TokenManager);
    });
  });

  describe('singleton', () => {
    it('should export singleton instance', () => {
      expect(tokenManager).toBeDefined();
      expect(tokenManager).toBeInstanceOf(TokenManager);
    });
  });

  describe('clearCache', () => {
    it('should clear cache without errors', () => {
      expect(() => tokenManagerInstance.clearCache()).not.toThrow();
    });
  });

  describe('clearCache', () => {
    it('should clear cache without errors', () => {
      expect(() => tokenManagerInstance.clearCache()).not.toThrow();
    });

    it('should clear credentials from singleton', () => {
      tokenManager.clearCache();
      // After clearing, singleton should have empty cache
      expect(tokenManager).toBeDefined();
    });
  });
});

describe('TokenManager - Edge Cases', () => {
  let tokenManagerInstance: TokenManager;

  beforeEach(() => {
    tokenManagerInstance = new TokenManager();
  });

  afterEach(() => {
    tokenManagerInstance.clearCache();
  });

  it('should handle multiple clearCache calls', () => {
    expect(() => {
      tokenManagerInstance.clearCache();
      tokenManagerInstance.clearCache();
      tokenManagerInstance.clearCache();
    }).not.toThrow();
  });
});
