/**
 * Debug logger utility
 * Only outputs when OPENCODE_QWEN_DEBUG=1 is set
 */

const DEBUG_ENABLED = process.env.OPENCODE_QWEN_DEBUG === '1';

export interface DebugLogger {
  info: (message: string, ...args: unknown[]) => void;
  warn: (message: string, ...args: unknown[]) => void;
  error: (message: string, ...args: unknown[]) => void;
  debug: (message: string, ...args: unknown[]) => void;
}

export function createDebugLogger(prefix: string): DebugLogger {
  const logPrefix = `[${prefix}]`;

  return {
    info: (message: string, ...args: unknown[]) => {
      if (DEBUG_ENABLED) {
        console.log(`${logPrefix} [INFO] ${message}`, ...args);
      }
    },
    warn: (message: string, ...args: unknown[]) => {
      if (DEBUG_ENABLED) {
        console.warn(`${logPrefix} [WARN] ${message}`, ...args);
      }
    },
    error: (message: string, ...args: unknown[]) => {
      if (DEBUG_ENABLED) {
        console.error(`${logPrefix} [ERROR] ${message}`, ...args);
      }
    },
    debug: (message: string, ...args: unknown[]) => {
      if (DEBUG_ENABLED) {
        console.log(`${logPrefix} [DEBUG] ${message}`, ...args);
      }
    },
  };
}
