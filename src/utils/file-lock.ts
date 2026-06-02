/**
 * File Locking Utility
 * 
 * Provides atomic file locking to prevent concurrent writes
 * Uses fs.openSync with 'wx' flag (atomic create-if-not-exists)
 */

import { openSync, closeSync, unlinkSync, existsSync, statSync } from 'node:fs';
import { createDebugLogger } from './debug-logger.js';

const debugLogger = createDebugLogger('FILE_LOCK');

export class FileLock {
  private lockPath: string;
  private fd: number | null = null;
  private cleanupRegistered = false;

  constructor(filePath: string) {
    this.lockPath = filePath + '.lock';
    this.registerCleanupHandlers();
  }

  /**
   * Register cleanup handlers for process exit signals
   * Ensures lock file is removed even if process crashes
   */
  private registerCleanupHandlers(): void {
    if (this.cleanupRegistered) return;

    const cleanup = () => {
      try {
        if (this.fd !== null) {
          closeSync(this.fd);
        }
        if (existsSync(this.lockPath)) {
          unlinkSync(this.lockPath);
          debugLogger.info('Lock file cleaned up on exit');
        }
      } catch (e) {
        // Cleanup best-effort, ignore errors
      }
    };

    process.on('exit', cleanup);
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
    process.on('uncaughtException', (err) => {
      cleanup();
      throw err; // Re-throw after cleanup
    });
    process.on('unhandledRejection', (reason, promise) => {
      cleanup();
      debugLogger.error('Unhandled Rejection detected', {
        reason: reason instanceof Error ? reason.message : String(reason),
        promise: promise.constructor.name
      });
    });

    this.cleanupRegistered = true;
  }

  /**
   * Acquire the lock with timeout
   * 
   * @param timeoutMs - Maximum time to wait for lock (default: 5000ms)
   * @param retryIntervalMs - Time between retry attempts (default: 100ms)
   * @returns true if lock acquired, false if timeout
   */
  async acquire(timeoutMs = 5000, retryIntervalMs = 100): Promise<boolean> {
    const start = Date.now();
    let attempts = 0;
    const STALE_THRESHOLD_MS = 10000; // 10 seconds (matches official client)

    while (Date.now() - start < timeoutMs) {
      attempts++;
      try {
        // Check for stale lock before attempting to acquire
        if (existsSync(this.lockPath)) {
          try {
            // Wrap stat in timeout to prevent hangs (3 second timeout, matches official client)
            const stats = await this.withTimeout(
              Promise.resolve(statSync(this.lockPath)),
              3000,
              'Lock file stat',
            );
            const lockAge = Date.now() - stats.mtimeMs;
            
            if (lockAge > STALE_THRESHOLD_MS) {
              debugLogger.warn(`Removing stale lock (age: ${lockAge}ms)`);
              // Wrap unlink in timeout as well
              await this.withTimeout(
                Promise.resolve(unlinkSync(this.lockPath)),
                3000,
                'Stale lock removal',
              );
              // Continue to acquire the lock
            }
          } catch (statError) {
            // Lock may have been removed by another process, continue
            debugLogger.debug('Stale lock check failed, continuing', statError);
          }
        }

        // 'wx' = create file, fail if exists (atomic operation!)
        this.fd = openSync(this.lockPath, 'wx');
        debugLogger.info(`Lock acquired after ${attempts} attempts (${Date.now() - start}ms)`);
        return true;
      } catch (e: any) {
        if (e.code !== 'EEXIST') {
          // Unexpected error, not just "file exists"
          debugLogger.error('Unexpected error acquiring lock:', e);
          throw e;
        }
        // Lock file exists, another process has it
        await this.delay(retryIntervalMs);
      }
    }

    debugLogger.warn(`Lock acquisition timeout after ${timeoutMs}ms (${attempts} attempts)`);
    return false;
  }

  /**
   * Release the lock
   * Must be called in finally block to ensure cleanup
   */
  release(): void {
    if (this.fd !== null) {
      try {
        closeSync(this.fd);
        if (existsSync(this.lockPath)) {
          unlinkSync(this.lockPath);
        }
        this.fd = null;
        debugLogger.info('Lock released');
      } catch (e) {
        debugLogger.error('Error releasing lock:', e);
        // Don't throw, cleanup is best-effort
      }
    }
  }

  /**
   * Check if lock file exists (without acquiring)
   */
  static isLocked(filePath: string): boolean {
    const lockPath = filePath + '.lock';
    return existsSync(lockPath);
  }

  /**
   * Clean up stale lock file (if process crashed without releasing)
   */
  static cleanup(filePath: string): void {
    const lockPath = filePath + '.lock';
    try {
      if (existsSync(lockPath)) {
        unlinkSync(lockPath);
        debugLogger.info('Cleaned up stale lock file');
      }
    } catch (e) {
      debugLogger.error('Error cleaning up lock file:', e);
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Wrap a promise with a timeout
   * Prevents file operations from hanging indefinitely
   * Matches official client's withTimeout() pattern
   */
  private withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    operationType = 'File operation',
  ): Promise<T> {
    let timeoutId: NodeJS.Timeout | undefined;

    return Promise.race([
      promise.finally(() => {
        // Clear timeout when main promise completes (success or failure)
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
      }),
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(
          () =>
            reject(
              new Error(`${operationType} timed out after ${timeoutMs}ms`),
            ),
          timeoutMs,
        );
      }),
    ]);
  }
}
