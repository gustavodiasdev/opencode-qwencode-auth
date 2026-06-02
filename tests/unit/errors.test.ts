/**
 * Tests for error handling and classification
 */

import { describe, it, expect } from 'bun:test';
import {
  QwenAuthError,
  QwenApiError,
  QwenNetworkError,
  CredentialsClearRequiredError,
  TokenManagerError,
  TokenError,
  classifyError,
} from '../../src/errors.js';

describe('QwenAuthError', () => {
  it('should create token_expired error with correct message', () => {
    const error = new QwenAuthError('token_expired');
    expect(error.name).toBe('QwenAuthError');
    expect(error.kind).toBe('token_expired');
    expect(error.message).toContain('Token expired');
    expect(error.message).toContain('opencode auth login');
  });

  it('should create refresh_failed error with correct message', () => {
    const error = new QwenAuthError('refresh_failed');
    expect(error.kind).toBe('refresh_failed');
    expect(error.message).toContain('Failed to renew token');
  });

  it('should create auth_required error with correct message', () => {
    const error = new QwenAuthError('auth_required');
    expect(error.kind).toBe('auth_required');
    expect(error.message).toContain('Authentication required');
  });

  it('should create credentials_clear_required error with correct message', () => {
    const error = new QwenAuthError('credentials_clear_required');
    expect(error.kind).toBe('credentials_clear_required');
    expect(error.message).toContain('Invalid or revoked credentials');
  });

  it('should store technical detail when provided', () => {
    const error = new QwenAuthError('refresh_failed', 'HTTP 400: invalid_grant');
    expect(error.technicalDetail).toBe('HTTP 400: invalid_grant');
  });
});

describe('CredentialsClearRequiredError', () => {
  it('should extend QwenAuthError', () => {
    const error = new CredentialsClearRequiredError();
    expect(error).toBeInstanceOf(QwenAuthError);
    expect(error.name).toBe('CredentialsClearRequiredError');
    expect(error.kind).toBe('credentials_clear_required');
  });

  it('should store technical detail', () => {
    const error = new CredentialsClearRequiredError('Refresh token revoked');
    expect(error.technicalDetail).toBe('Refresh token revoked');
  });
});

describe('QwenApiError', () => {
  it('should classify 401 as unauthorized', () => {
    const error = new QwenApiError(401);
    expect(error.kind).toBe('unauthorized');
    expect(error.message).toContain('Invalid or expired token');
  });

  it('should classify 403 as unauthorized', () => {
    const error = new QwenApiError(403);
    expect(error.kind).toBe('unauthorized');
  });

  it('should classify 429 as rate_limit', () => {
    const error = new QwenApiError(429);
    expect(error.kind).toBe('rate_limit');
    expect(error.message).toContain('Rate limit reached');
  });

  it('should classify 500 as server_error', () => {
    const error = new QwenApiError(500);
    expect(error.kind).toBe('server_error');
    expect(error.message).toContain('Qwen server unavailable');
  });

  it('should classify 503 as server_error', () => {
    const error = new QwenApiError(503);
    expect(error.kind).toBe('server_error');
  });

  it('should classify unknown errors correctly', () => {
    const error = new QwenApiError(400);
    expect(error.kind).toBe('unknown');
  });

  it('should store status code', () => {
    const error = new QwenApiError(429);
    expect(error.statusCode).toBe(429);
  });
});

describe('QwenNetworkError', () => {
  it('should create network error with correct message', () => {
    const error = new QwenNetworkError('fetch failed');
    expect(error.name).toBe('QwenNetworkError');
    expect(error.message).toContain('Network error');
    expect(error.message).toContain('fetch failed');
  });

  it('should store technical detail', () => {
    const error = new QwenNetworkError('timeout', 'ETIMEDOUT');
    expect(error.technicalDetail).toBe('ETIMEDOUT');
  });
});

describe('TokenManagerError', () => {
  it('should create error with REFRESH_FAILED type', () => {
    const error = new TokenManagerError(TokenError.REFRESH_FAILED, 'Refresh failed');
    expect(error.name).toBe('TokenManagerError');
    expect(error.type).toBe(TokenError.REFRESH_FAILED);
    expect(error.message).toBe('Refresh failed');
  });

  it('should create error with NO_REFRESH_TOKEN type', () => {
    const error = new TokenManagerError(TokenError.NO_REFRESH_TOKEN, 'No refresh token');
    expect(error.type).toBe(TokenError.NO_REFRESH_TOKEN);
  });

  it('should create error with LOCK_TIMEOUT type', () => {
    const error = new TokenManagerError(TokenError.LOCK_TIMEOUT, 'Lock timeout');
    expect(error.type).toBe(TokenError.LOCK_TIMEOUT);
  });

  it('should create error with FILE_ACCESS_ERROR type', () => {
    const error = new TokenManagerError(TokenError.FILE_ACCESS_ERROR, 'File access error');
    expect(error.type).toBe(TokenError.FILE_ACCESS_ERROR);
  });

  it('should create error with NETWORK_ERROR type', () => {
    const error = new TokenManagerError(TokenError.NETWORK_ERROR, 'Network error');
    expect(error.type).toBe(TokenError.NETWORK_ERROR);
  });

  it('should create error with CREDENTIALS_CLEAR_REQUIRED type', () => {
    const error = new TokenManagerError(TokenError.CREDENTIALS_CLEAR_REQUIRED, 'Clear required');
    expect(error.type).toBe(TokenError.CREDENTIALS_CLEAR_REQUIRED);
  });
});

describe('classifyError', () => {
  it('should classify CredentialsClearRequiredError correctly', () => {
    const error = new CredentialsClearRequiredError();
    const result = classifyError(error);
    expect(result.kind).toBe('auth');
    expect(result.isRetryable).toBe(false);
    expect(result.shouldClearCache).toBe(true);
  });

  it('should classify QwenAuthError token_expired correctly', () => {
    const error = new QwenAuthError('token_expired');
    const result = classifyError(error);
    expect(result.kind).toBe('auth');
    expect(result.isRetryable).toBe(false);
    expect(result.shouldClearCache).toBe(false);
  });

  it('should classify QwenAuthError refresh_failed as retryable', () => {
    const error = new QwenAuthError('refresh_failed');
    const result = classifyError(error);
    expect(result.kind).toBe('auth');
    expect(result.isRetryable).toBe(true);
    expect(result.shouldClearCache).toBe(false);
  });

  it('should classify QwenApiError rate_limit as retryable', () => {
    const error = new QwenApiError(429);
    const result = classifyError(error);
    expect(result.kind).toBe('api');
    expect(result.isRetryable).toBe(true);
    expect(result.shouldClearCache).toBe(false);
  });

  it('should classify QwenApiError unauthorized as not retryable', () => {
    const error = new QwenApiError(401);
    const result = classifyError(error);
    expect(result.kind).toBe('api');
    expect(result.isRetryable).toBe(false);
    expect(result.shouldClearCache).toBe(false);
  });

  it('should classify QwenApiError server_error as retryable', () => {
    const error = new QwenApiError(503);
    const result = classifyError(error);
    expect(result.kind).toBe('api');
    expect(result.isRetryable).toBe(true);
    expect(result.shouldClearCache).toBe(false);
  });

  it('should classify QwenNetworkError as retryable', () => {
    const error = new QwenNetworkError('fetch failed');
    const result = classifyError(error);
    expect(result.kind).toBe('network');
    expect(result.isRetryable).toBe(true);
    expect(result.shouldClearCache).toBe(false);
  });

  it('should classify AbortError as timeout', () => {
    const error = new Error('timeout');
    error.name = 'AbortError';
    const result = classifyError(error);
    expect(result.kind).toBe('timeout');
    expect(result.isRetryable).toBe(true);
    expect(result.shouldClearCache).toBe(false);
  });

  it('should classify network errors by message', () => {
    const error = new Error('fetch failed: network error');
    const result = classifyError(error);
    expect(result.kind).toBe('network');
    expect(result.isRetryable).toBe(true);
  });

  it('should classify timeout errors by message', () => {
    const error = new Error('request timeout');
    const result = classifyError(error);
    expect(result.kind).toBe('network');
    expect(result.isRetryable).toBe(true);
  });

  it('should classify unknown errors as not retryable', () => {
    const error = new Error('unknown error');
    const result = classifyError(error);
    expect(result.kind).toBe('unknown');
    expect(result.isRetryable).toBe(false);
    expect(result.shouldClearCache).toBe(false);
  });
});
