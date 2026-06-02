/**
 * Robust Token Manager with File Locking
 * 
 * Production-ready token management with multi-process safety
 * Features:
 * - In-memory caching to avoid repeated file reads
 * - Preventive refresh (30s buffer before expiration)
 * - Reactive recovery (on 401 errors)
 * - Promise tracking to avoid concurrent refreshes within same process
 * - File locking to prevent concurrent refreshes across processes
 * - Comprehensive debug logging (enabled via OPENCODE_QWEN_DEBUG=1)
 */

import { loadCredentials, saveCredentials, getCredentialsPath } from './auth.js';
import { refreshAccessToken } from '../qwen/oauth.js';
import type { QwenCredentials } from '../types.js';
import { createDebugLogger } from '../utils/debug-logger.js';
import { FileLock } from '../utils/file-lock.js';
import { watch } from 'node:fs';
import { CredentialsClearRequiredError } from '../errors.js';

const debugLogger = createDebugLogger('TOKEN_MANAGER');
const TOKEN_REFRESH_BUFFER_MS = 30 * 1000; // 30 seconds
const CACHE_CHECK_INTERVAL_MS = 5000; // 5 seconds (matches official client)

interface CacheState {
  credentials: QwenCredentials | null;
  lastCheck: number;
}

class TokenManager {
  private memoryCache: CacheState = {
    credentials: null,
    lastCheck: 0,
  };
  private refreshPromise: Promise<QwenCredentials | null> | null = null;
  private lastFileCheck = 0;
  private fileWatcherInitialized = false;

  constructor() {
    this.initializeFileWatcher();
  }

  /**
   * Initialize file watcher to detect external credential changes
   * Automatically invalidates cache when credentials file is modified
   */
  private initializeFileWatcher(): void {
    if (this.fileWatcherInitialized) return;

    const credPath = getCredentialsPath();
    
    try {
      watch(credPath, (eventType) => {
        if (eventType === 'change') {
          // File was modified externally (e.g., opencode auth login)
          // Invalidate cache to force reload on next request
          this.invalidateCache();
          debugLogger.info('Credentials file changed, cache invalidated');
        }
      });

      this.fileWatcherInitialized = true;
      debugLogger.debug('File watcher initialized', { path: credPath });
    } catch (error) {
      debugLogger.error('Failed to initialize file watcher', error);
      // File watcher is optional, continue without it
    }
  }

  /**
   * Invalidate in-memory cache
   * Forces reload from file on next getValidCredentials() call
   */
  private invalidateCache(): void {
    this.memoryCache = {
      credentials: null,
      lastCheck: 0,
    };
    this.lastFileCheck = 0;
  }

  /**
   * Get valid credentials, refreshing if necessary
   * 
   * @param forceRefresh - If true, refresh even if current token is valid
   * @returns Valid credentials or null if unavailable
   */
  async getValidCredentials(forceRefresh = false): Promise<QwenCredentials | null> {
    const startTime = Date.now();
    debugLogger.info('getValidCredentials called', { forceRefresh });

    try {
      // 1. Check in-memory cache first (unless force refresh)
      if (!forceRefresh && this.memoryCache.credentials && this.isTokenValid(this.memoryCache.credentials)) {
        debugLogger.info('Returning from memory cache', {
          age: Date.now() - startTime,
          validUntil: new Date(this.memoryCache.credentials.expiryDate!).toISOString()
        });
        return this.memoryCache.credentials;
      }

      // 2. If concurrent refresh is already happening, wait for it
      if (this.refreshPromise) {
        debugLogger.info('Waiting for ongoing refresh...');
        const result = await this.refreshPromise;
        debugLogger.info('Wait completed', { success: !!result, age: Date.now() - startTime });
        return result;
      }

      // 3. Need to perform refresh or reload from file
      this.refreshPromise = (async () => {
        const refreshStart = Date.now();
        const now = Date.now();
        
        // Throttle file checks to avoid excessive I/O (matches official client)
        const shouldCheckFile = forceRefresh || (now - this.lastFileCheck) >= CACHE_CHECK_INTERVAL_MS;
        
        let fromFile: QwenCredentials | null = null;
        
        if (shouldCheckFile) {
          // Always check file first (may have been updated by another process)
          fromFile = loadCredentials();
          this.lastFileCheck = now;
          
          debugLogger.info('File check (throttled)', {
            hasFile: !!fromFile,
            fileValid: fromFile ? this.isTokenValid(fromFile) : 'N/A',
            forceRefresh,
            timeSinceLastCheck: now - this.lastFileCheck,
            throttleInterval: CACHE_CHECK_INTERVAL_MS
          });
        } else {
          debugLogger.debug('Skipping file check (throttled)', {
            timeSinceLastCheck: now - this.lastFileCheck,
            throttleInterval: CACHE_CHECK_INTERVAL_MS
          });
          
          // Use memory cache if available
          fromFile = this.memoryCache.credentials;
        }

        // If not forcing refresh and file has valid credentials, use them
        if (!forceRefresh && fromFile && this.isTokenValid(fromFile)) {
          debugLogger.info('Using valid credentials from file');
          this.updateCacheState(fromFile, now);
          return fromFile;
        }

        // Need to perform actual refresh via API (with file locking for multi-process safety)
        const result = await this.performTokenRefreshWithLock(fromFile);
        debugLogger.info('Refresh operation completed', {
          success: !!result,
          age: Date.now() - refreshStart
        });
        return result;
      })();
      
      try {
        const result = await this.refreshPromise;
        return result;
      } finally {
        this.refreshPromise = null;
      }
    } catch (error) {
      debugLogger.error('Failed to get valid credentials', error);
      return null;
    }
  }

  /**
   * Update cache state atomically
   * Ensures all cache fields are updated together to prevent inconsistent states
   * Matches official client's updateCacheState() pattern
   */
  private updateCacheState(credentials: QwenCredentials | null, lastCheck?: number): void {
    this.memoryCache = {
      credentials,
      lastCheck: lastCheck ?? Date.now(),
    };
    
    debugLogger.debug('Cache state updated', {
      hasCredentials: !!credentials,
      lastCheck,
    });
  }

  /**
   * Check if token is valid (not expired with buffer)
   */
  private isTokenValid(credentials: QwenCredentials): boolean {
    if (!credentials.expiryDate || !credentials.accessToken) {
      return false;
    }
    const now = Date.now();
    const expiryWithBuffer = credentials.expiryDate - TOKEN_REFRESH_BUFFER_MS;
    const valid = now < expiryWithBuffer;
    
    debugLogger.debug('Token validity check', {
      now,
      expiryDate: credentials.expiryDate,
      buffer: TOKEN_REFRESH_BUFFER_MS,
      expiryWithBuffer,
      valid,
      timeUntilExpiry: expiryWithBuffer - now
    });
    
    return valid;
  }

  /**
   * Perform the actual token refresh
   */
  private async performTokenRefresh(current: QwenCredentials | null): Promise<QwenCredentials | null> {
    debugLogger.info('performTokenRefresh called', {
      hasCurrent: !!current,
      hasRefreshToken: !!current?.refreshToken
    });

    if (!current?.refreshToken) {
      debugLogger.warn('Cannot refresh: No refresh token available');
      return null;
    }

    try {
      debugLogger.info('Calling refreshAccessToken API...');
      const startTime = Date.now();
      const refreshed = await refreshAccessToken(current.refreshToken);
      const elapsed = Date.now() - startTime;
      
      debugLogger.info('Token refresh API response', {
        elapsed,
        hasAccessToken: !!refreshed.accessToken,
        hasRefreshToken: !!refreshed.refreshToken,
        expiryDate: refreshed.expiryDate ? new Date(refreshed.expiryDate).toISOString() : 'N/A'
      });
      
      // Save refreshed credentials
      saveCredentials(refreshed);
      debugLogger.info('Credentials saved to file');
      
      // Update cache atomically
      this.updateCacheState(refreshed);
      debugLogger.info('Token refreshed successfully');
      
      return refreshed;
    } catch (error) {
      const elapsed = Date.now() - startTime;
      
      // Handle credentials clear required error (invalid_grant)
      if (error instanceof CredentialsClearRequiredError) {
        debugLogger.warn('Credentials clear required - clearing memory cache');
        this.clearCache();
        throw error;
      }
      
      debugLogger.error('Token refresh failed', {
        error: error instanceof Error ? error.message : String(error),
        elapsed,
        hasRefreshToken: !!current?.refreshToken,
        stack: error instanceof Error ? error.stack?.split('\n').slice(0, 3).join('\n') : undefined
      });
      throw error; // Re-throw so caller knows it failed
    }
  }

  /**
   * Perform token refresh with file locking (multi-process safe)
   */
  private async performTokenRefreshWithLock(current: QwenCredentials | null): Promise<QwenCredentials | null> {
    const credPath = getCredentialsPath();
    const lock = new FileLock(credPath);

    debugLogger.info('Attempting to acquire file lock', { credPath });
    const lockStart = Date.now();
    const lockAcquired = await lock.acquire(5000, 100);
    const lockElapsed = Date.now() - lockStart;

    debugLogger.info('Lock acquisition result', {
      acquired: lockAcquired,
      elapsed: lockElapsed
    });

    if (!lockAcquired) {
      // Another process is doing refresh, wait and reload from file
      debugLogger.info('Another process is refreshing, waiting...', {
        lockTimeout: 5000,
        waitTime: 600
      });
      await this.delay(600); // Wait for other process to finish
      
      // Reload credentials from file (should have new token now)
      const reloaded = loadCredentials();
      debugLogger.info('Reloaded credentials after wait', {
        hasCredentials: !!reloaded,
        valid: reloaded ? this.isTokenValid(reloaded) : 'N/A',
        totalWaitTime: Date.now() - lockStart
      });
      
      if (reloaded && this.isTokenValid(reloaded)) {
        this.updateCacheState(reloaded);
        debugLogger.info('Loaded refreshed credentials from file (multi-process)');
        return reloaded;
      }
      
      // Still invalid, try again without lock (edge case: other process failed)
      debugLogger.warn('Fallback: attempting refresh without lock', {
        reason: 'Lock acquisition failed, assuming other process crashed'
      });
      return await this.performTokenRefresh(current);
    }

    try {
      // Critical section: only one process executes here
      
      // Double-check: another process may have refreshed while we were waiting for lock
      const fromFile = loadCredentials();
      const doubleCheckElapsed = Date.now() - lockStart;
      debugLogger.info('Double-check after lock acquisition', {
        hasFile: !!fromFile,
        fileValid: fromFile ? this.isTokenValid(fromFile) : 'N/A',
        elapsed: doubleCheckElapsed
      });
      
      if (fromFile && this.isTokenValid(fromFile)) {
        debugLogger.info('Credentials already refreshed by another process', {
          timeSinceLockStart: doubleCheckElapsed,
          usingFileCredentials: true
        });
        this.updateCacheState(fromFile);
        return fromFile;
      }

      // Perform the actual refresh
      debugLogger.info('Performing refresh in critical section', {
        hasRefreshToken: !!fromFile?.refreshToken,
        elapsed: doubleCheckElapsed
      });
      return await this.performTokenRefresh(fromFile);
    } finally {
      // Always release lock, even if error occurs
      lock.release();
      debugLogger.info('File lock released', {
        totalOperationTime: Date.now() - lockStart
      });
    }
  }

  /**
   * Get current state for debugging
   */
  getState(): {
    hasMemoryCache: boolean;
    memoryCacheValid: boolean;
    hasRefreshPromise: boolean;
    fileExists: boolean;
    fileValid: boolean;
  } {
    const fromFile = loadCredentials();
    return {
      hasMemoryCache: !!this.memoryCache.credentials,
      memoryCacheValid: this.memoryCache.credentials ? this.isTokenValid(this.memoryCache.credentials) : false,
      hasRefreshPromise: !!this.refreshPromise,
      fileExists: !!fromFile,
      fileValid: fromFile ? this.isTokenValid(fromFile) : false
    };
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Clear cached credentials
   */
  clearCache(): void {
    debugLogger.info('Cache cleared');
    this.updateCacheState(null);
  }

  /**
   * Manually set credentials
   */
  setCredentials(credentials: QwenCredentials): void {
    debugLogger.info('Setting credentials manually', {
      hasAccessToken: !!credentials.accessToken,
      hasRefreshToken: !!credentials.refreshToken,
      expiryDate: credentials.expiryDate ? new Date(credentials.expiryDate).toISOString() : 'N/A'
    });
    this.updateCacheState(credentials);
    saveCredentials(credentials);
  }
}

export { TokenManager };
// Singleton instance
export const tokenManager = new TokenManager();
