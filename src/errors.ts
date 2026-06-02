/**
 * Custom errors for the Qwen Auth plugin
 *
 * Provides user-friendly messages instead of raw API JSON.
 * Technical details only appear when OPENCODE_QWEN_DEBUG=1.
 */

const REAUTH_HINT =
  'Run "opencode auth login" and select "Qwen Code (qwen.ai OAuth)" to authenticate.';

// ============================================
// Token Manager Error Types
// ============================================

/**
 * Error types for token manager operations
 * Mirrors official client's TokenError enum
 */
export enum TokenError {
  REFRESH_FAILED = 'REFRESH_FAILED',
  NO_REFRESH_TOKEN = 'NO_REFRESH_TOKEN',
  LOCK_TIMEOUT = 'LOCK_TIMEOUT',
  FILE_ACCESS_ERROR = 'FILE_ACCESS_ERROR',
  NETWORK_ERROR = 'NETWORK_ERROR',
  CREDENTIALS_CLEAR_REQUIRED = 'CREDENTIALS_CLEAR_REQUIRED',
}

// ============================================
// Authentication Errors
// ============================================

export type AuthErrorKind = 'token_expired' | 'refresh_failed' | 'auth_required' | 'credentials_clear_required';

const AUTH_MESSAGES: Record<AuthErrorKind, string> = {
  token_expired: `[Qwen] Token expired. ${REAUTH_HINT}`,
  refresh_failed: `[Qwen] Failed to renew token. ${REAUTH_HINT}`,
  auth_required: `[Qwen] Authentication required. ${REAUTH_HINT}`,
  credentials_clear_required: `[Qwen] Invalid or revoked credentials. ${REAUTH_HINT}`,
};

export class QwenAuthError extends Error {
  public readonly kind: AuthErrorKind;
  public readonly technicalDetail?: string;

  constructor(kind: AuthErrorKind, technicalDetail?: string) {
    super(AUTH_MESSAGES[kind]);
    this.name = 'QwenAuthError';
    this.kind = kind;
    this.technicalDetail = technicalDetail;
  }
}

/**
 * Special error signaling that cached credentials should be cleared.
 * Thrown when refresh token is revoked (invalid_grant).
 */
export class CredentialsClearRequiredError extends QwenAuthError {
  constructor(technicalDetail?: string) {
    super('credentials_clear_required', technicalDetail);
    this.name = 'CredentialsClearRequiredError';
  }
}

/**
 * Custom error class for token manager operations
 * Provides better error classification for handling
 */
export class TokenManagerError extends Error {
  public readonly type: TokenError;
  public readonly technicalDetail?: string;

  constructor(type: TokenError, message: string, technicalDetail?: string) {
    super(message);
    this.name = 'TokenManagerError';
    this.type = type;
    this.technicalDetail = technicalDetail;
  }
}

// ============================================
// Authentication Errors
// ============================================

/**
 * Specific error types for API errors
 */
export type ApiErrorKind = 
  | 'rate_limit'
  | 'unauthorized'
  | 'forbidden'
  | 'server_error'
  | 'network_error'
  | 'unknown';

function classifyApiStatus(statusCode: number): { message: string; kind: ApiErrorKind } {
  if (statusCode === 401 || statusCode === 403) {
    return {
      message: `[Qwen] Invalid or expired token. ${REAUTH_HINT}`,
      kind: 'unauthorized'
    };
  }
  if (statusCode === 429) {
    return {
      message: '[Qwen] Rate limit reached. Wait a few minutes before trying again.',
      kind: 'rate_limit'
    };
  }
  if (statusCode >= 500) {
    return {
      message: `[Qwen] Qwen server unavailable (error ${statusCode}). Try again in a few minutes.`,
      kind: 'server_error'
    };
  }
  return {
    message: `[Qwen] Qwen API error (${statusCode}). Check your connection and try again.`,
    kind: 'unknown'
  };
}

export class QwenApiError extends Error {
  public readonly statusCode: number;
  public readonly kind: ApiErrorKind;
  public readonly technicalDetail?: string;

  constructor(statusCode: number, technicalDetail?: string) {
    const classification = classifyApiStatus(statusCode);
    super(classification.message);
    this.name = 'QwenApiError';
    this.statusCode = statusCode;
    this.kind = classification.kind;
    this.technicalDetail = technicalDetail;
  }
}

/**
 * Error for network-related issues (fetch failures, timeouts, etc.)
 */
export class QwenNetworkError extends Error {
  public readonly technicalDetail?: string;

  constructor(message: string, technicalDetail?: string) {
    super(`[Qwen] Network error: ${message}`);
    this.name = 'QwenNetworkError';
    this.technicalDetail = technicalDetail;
  }
}

// ============================================
// Conditional logging helper
// ============================================

/**
 * Logs technical details only when debug is active.
 */
export function logTechnicalDetail(detail: string): void {
  if (process.env.OPENCODE_QWEN_DEBUG === '1') {
    console.debug('[Qwen Debug]', detail);
  }
}

/**
 * Classify error type for better error handling
 * Returns specific error kind for programmatic handling
 */
export function classifyError(error: unknown): {
  kind: 'auth' | 'api' | 'network' | 'timeout' | 'unknown';
  isRetryable: boolean;
  shouldClearCache: boolean;
} {
  // Check for our custom error types
  if (error instanceof CredentialsClearRequiredError) {
    return { kind: 'auth', isRetryable: false, shouldClearCache: true };
  }
  
  if (error instanceof QwenAuthError) {
    return {
      kind: 'auth',
      isRetryable: error.kind === 'refresh_failed',
      shouldClearCache: error.kind === 'credentials_clear_required'
    };
  }
  
  if (error instanceof QwenApiError) {
    return {
      kind: 'api',
      isRetryable: error.kind === 'rate_limit' || error.kind === 'server_error',
      shouldClearCache: false
    };
  }
  
  if (error instanceof QwenNetworkError) {
    return { kind: 'network', isRetryable: true, shouldClearCache: false };
  }
  
  // Check for timeout errors
  if (error instanceof Error && error.name === 'AbortError') {
    return { kind: 'timeout', isRetryable: true, shouldClearCache: false };
  }
  
  // Check for standard Error with status
  if (error instanceof Error) {
    const errorMessage = error.message.toLowerCase();
    
    // Network-related errors
    if (errorMessage.includes('fetch') || 
        errorMessage.includes('network') || 
        errorMessage.includes('timeout') ||
        errorMessage.includes('abort')) {
      return { kind: 'network', isRetryable: true, shouldClearCache: false };
    }
  }
  
  // Default: unknown error, not retryable
  return { kind: 'unknown', isRetryable: false, shouldClearCache: false };
}
