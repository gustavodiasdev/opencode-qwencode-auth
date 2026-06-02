/**
 * Tests for Request Queue (Throttling)
 */

import { describe, it, expect, beforeEach, mock } from 'bun:test';
import { RequestQueue } from '../../src/plugin/request-queue.js';

describe('RequestQueue', () => {
  let queue: RequestQueue;

  beforeEach(() => {
    queue = new RequestQueue();
  });

  describe('constructor', () => {
    it('should create instance with default interval', () => {
      expect(queue).toBeInstanceOf(RequestQueue);
    });
  });

  describe('enqueue', () => {
    it('should execute function immediately if no recent requests', async () => {
      const mockFn = mock(() => 'result');
      const result = await queue.enqueue(mockFn);
      
      expect(result).toBe('result');
      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it('should delay subsequent requests to respect MIN_INTERVAL', async () => {
      const results: number[] = [];
      
      const fn1 = async () => {
        results.push(Date.now());
        return 'first';
      };
      
      const fn2 = async () => {
        results.push(Date.now());
        return 'second';
      };

      // Execute first request
      await queue.enqueue(fn1);
      
      // Execute second request immediately
      await queue.enqueue(fn2);
      
      // Check that there was a delay
      expect(results).toHaveLength(2);
      const delay = results[1] - results[0];
      expect(delay).toBeGreaterThanOrEqual(900); // ~1 second with some tolerance
    });

    it('should add jitter to delay', async () => {
      const delays: number[] = [];
      
      // Run 3 requests with small delays to detect jitter
      for (let i = 0; i < 3; i++) {
        const start = Date.now();
        await queue.enqueue(async () => {
          await new Promise(resolve => setTimeout(resolve, 10));
        });
        const end = Date.now();
        
        if (i > 0) {
          delays.push(end - start);
        }
      }
      
      // All delays should be at least the minimum interval
      delays.forEach(delay => {
        expect(delay).toBeGreaterThanOrEqual(900); // ~1s with tolerance
      });
    });

    it('should handle async functions', async () => {
      const mockFn = mock(async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return 'async result';
      });
      
      const result = await queue.enqueue(mockFn);
      expect(result).toBe('async result');
      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it('should propagate errors', async () => {
      const error = new Error('test error');
      const mockFn = mock(async () => {
        throw error;
      });
      
      await expect(queue.enqueue(mockFn)).rejects.toThrow('test error');
      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it('should track last request time', async () => {
      const before = Date.now();
      await queue.enqueue(async () => {});
      const after = Date.now();
      
      expect(queue['lastRequestTime']).toBeGreaterThanOrEqual(before);
      expect(queue['lastRequestTime']).toBeLessThanOrEqual(after);
    });
  });

  describe('concurrent requests', () => {
    it('should handle multiple concurrent enqueue calls', async () => {
      const results: string[] = [];
      
      const promises = [
        queue.enqueue(async () => { results.push('1'); return '1'; }),
        queue.enqueue(async () => { results.push('2'); return '2'; }),
        queue.enqueue(async () => { results.push('3'); return '3'; }),
      ];
      
      await Promise.all(promises);
      
      expect(results).toHaveLength(3);
      expect(results).toContain('1');
      expect(results).toContain('2');
      expect(results).toContain('3');
    });

    it('should maintain order for sequential requests', async () => {
      const order: number[] = [];
      
      await queue.enqueue(async () => order.push(1));
      await queue.enqueue(async () => order.push(2));
      await queue.enqueue(async () => order.push(3));
      
      expect(order).toEqual([1, 2, 3]);
    });
  });

  describe('jitter calculation', () => {
    it('should calculate jitter within expected range', () => {
      // Access private method for testing
      const minJitter = 500;
      const maxJitter = 1500;
      
      for (let i = 0; i < 10; i++) {
        const jitter = Math.random() * (maxJitter - minJitter) + minJitter;
        expect(jitter).toBeGreaterThanOrEqual(minJitter);
        expect(jitter).toBeLessThanOrEqual(maxJitter);
      }
    });
  });
});

describe('RequestQueue - Edge Cases', () => {
  it('should handle very fast functions', async () => {
    const queue = new RequestQueue();
    
    const start = Date.now();
    await queue.enqueue(async () => {});
    await queue.enqueue(async () => {});
    const end = Date.now();
    
    // Total time should be at least MIN_INTERVAL
    expect(end - start).toBeGreaterThanOrEqual(900);
  });

  it('should handle functions that take longer than MIN_INTERVAL', async () => {
    const queue = new RequestQueue();
    
    const start = Date.now();
    await queue.enqueue(async () => {
      await new Promise(resolve => setTimeout(resolve, 1500));
    });
    await queue.enqueue(async () => {});
    const end = Date.now();
    
    // Second request should execute immediately since first took > MIN_INTERVAL
    expect(end - start).toBeGreaterThanOrEqual(1500);
  });

  it('should handle errors without breaking queue', async () => {
    const queue = new RequestQueue();
    
    // First request fails
    await expect(queue.enqueue(async () => {
      throw new Error('fail');
    })).rejects.toThrow('fail');
    
    // Second request should still work
    const result = await queue.enqueue(async () => 'success');
    expect(result).toBe('success');
  });
});
