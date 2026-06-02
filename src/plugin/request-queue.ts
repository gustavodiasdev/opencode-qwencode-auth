/**
 * Request Queue with throttling
 * Prevents hitting rate limits by controlling request frequency
 * Inspired by qwen-code-0.14.0 throttling patterns
 */

import { createDebugLogger } from '../utils/debug-logger.js';

const debugLogger = createDebugLogger('REQUEST_QUEUE');

export class RequestQueue {
  private lastRequestTime = 0;
  private readonly MIN_INTERVAL = 1000; // 1 second
  private readonly JITTER_MIN = 500;    // 0.5s
  private readonly JITTER_MAX = 1500;   // 1.5s

  /**
   * Get random jitter between JITTER_MIN and JITTER_MAX
   */
  private getJitter(): number {
    return Math.random() * (this.JITTER_MAX - this.JITTER_MIN) + this.JITTER_MIN;
  }

  /**
   * Execute a function with throttling
   * Ensures minimum interval between requests + random jitter
   */
  async enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const elapsed = Date.now() - this.lastRequestTime;
    const waitTime = Math.max(0, this.MIN_INTERVAL - elapsed);
    
    if (waitTime > 0) {
      const jitter = this.getJitter();
      const totalWait = waitTime + jitter;
      
      debugLogger.info(
        `Throttling: waiting ${totalWait.toFixed(0)}ms (${waitTime.toFixed(0)}ms + ${jitter.toFixed(0)}ms jitter)`
      );
      
      await new Promise(resolve => setTimeout(resolve, totalWait));
    }
    
    this.lastRequestTime = Date.now();
    return fn();
  }
}
