/**
 * Tests for FileLock mechanism
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { FileLock } from '../../src/utils/file-lock.js';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { existsSync, unlinkSync } from 'node:fs';

const TEST_FILE = join(homedir(), '.qwen-test-lock.txt');
const LOCK_FILE = TEST_FILE + '.lock';

describe('FileLock', () => {
  beforeEach(() => {
    // Clean up any stale lock files
    if (existsSync(LOCK_FILE)) {
      unlinkSync(LOCK_FILE);
    }
    if (existsSync(TEST_FILE)) {
      unlinkSync(TEST_FILE);
    }
  });

  afterEach(() => {
    // Clean up after tests
    if (existsSync(LOCK_FILE)) {
      unlinkSync(LOCK_FILE);
    }
    if (existsSync(TEST_FILE)) {
      unlinkSync(TEST_FILE);
    }
  });

  describe('acquire', () => {
    it('should acquire lock successfully', async () => {
      const lock = new FileLock(TEST_FILE);
      const acquired = await lock.acquire(1000);
      expect(acquired).toBe(true);
      lock.release();
    });

    it('should create lock file', async () => {
      const lock = new FileLock(TEST_FILE);
      await lock.acquire(1000);
      
      expect(existsSync(LOCK_FILE)).toBe(true);
      lock.release();
    });

    it('should fail to acquire when lock is held', async () => {
      const lock1 = new FileLock(TEST_FILE);
      const lock2 = new FileLock(TEST_FILE);
      
      const acquired1 = await lock1.acquire(1000);
      expect(acquired1).toBe(true);
      
      // Try to acquire with short timeout (should fail)
      const acquired2 = await lock2.acquire(200, 50);
      expect(acquired2).toBe(false);
      
      lock1.release();
    });

    it('should succeed after lock is released', async () => {
      const lock1 = new FileLock(TEST_FILE);
      const lock2 = new FileLock(TEST_FILE);
      
      await lock1.acquire(1000);
      lock1.release();
      
      const acquired2 = await lock2.acquire(1000);
      expect(acquired2).toBe(true);
      
      lock2.release();
    });

    it('should wait and acquire when lock is released by another holder', async () => {
      const lock1 = new FileLock(TEST_FILE);
      const lock2 = new FileLock(TEST_FILE);
      
      await lock1.acquire(1000);
      
      // Start acquiring lock2 in background
      const lock2Promise = lock2.acquire(2000, 100);
      
      // Release lock1 after a short delay
      setTimeout(() => lock1.release(), 300);
      
      const acquired2 = await lock2Promise;
      expect(acquired2).toBe(true);
      
      lock2.release();
    });
  });

  describe('release', () => {
    it('should remove lock file', async () => {
      const lock = new FileLock(TEST_FILE);
      await lock.acquire(1000);
      expect(existsSync(LOCK_FILE)).toBe(true);
      
      lock.release();
      expect(existsSync(LOCK_FILE)).toBe(false);
    });

    it('should not throw if called without acquire', () => {
      const lock = new FileLock(TEST_FILE);
      expect(() => lock.release()).not.toThrow();
    });

    it('should be idempotent', async () => {
      const lock = new FileLock(TEST_FILE);
      await lock.acquire(1000);
      lock.release();
      
      expect(() => lock.release()).not.toThrow();
    });
  });

  describe('timeout', () => {
    it('should timeout after specified time', async () => {
      const lock1 = new FileLock(TEST_FILE);
      const lock2 = new FileLock(TEST_FILE);
      
      await lock1.acquire(1000);
      
      const start = Date.now();
      const acquired = await lock2.acquire(500, 100);
      const elapsed = Date.now() - start;
      
      expect(acquired).toBe(false);
      expect(elapsed).toBeGreaterThanOrEqual(400);
      expect(elapsed).toBeLessThanOrEqual(700);
      
      lock1.release();
    });

    it('should handle very short timeouts', async () => {
      const lock1 = new FileLock(TEST_FILE);
      const lock2 = new FileLock(TEST_FILE);
      
      await lock1.acquire(1000);
      
      const start = Date.now();
      const acquired = await lock2.acquire(100, 50);
      const elapsed = Date.now() - start;
      
      expect(acquired).toBe(false);
      expect(elapsed).toBeGreaterThanOrEqual(50);
      
      lock1.release();
    });
  });

  describe('concurrent access', () => {
    it('should handle multiple acquire attempts', async () => {
      const locks = Array.from({ length: 5 }, () => new FileLock(TEST_FILE));
      
      // First lock acquires
      const acquired1 = await locks[0].acquire(1000);
      expect(acquired1).toBe(true);
      
      // Others try to acquire with short timeout
      const results = await Promise.all(
        locks.slice(1).map(lock => lock.acquire(200, 50))
      );
      
      // All should fail
      expect(results.every(r => r === false)).toBe(true);
      
      locks[0].release();
    });

    it('should serialize access when waiting', async () => {
      const lock1 = new FileLock(TEST_FILE);
      const lock2 = new FileLock(TEST_FILE);
      const lock3 = new FileLock(TEST_FILE);
      
      await lock1.acquire(1000);
      
      const results: boolean[] = [];
      const timestamps: number[] = [];
      
      // Start lock2 and lock3 waiting
      const p2 = (async () => {
        const r = await lock2.acquire(3000, 100);
        timestamps.push(Date.now());
        results.push(r);
        if (r) lock2.release();
      })();
      
      const p3 = (async () => {
        const r = await lock3.acquire(3000, 100);
        timestamps.push(Date.now());
        results.push(r);
        if (r) lock3.release();
      })();
      
      // Release lock1 after short delay
      setTimeout(() => lock1.release(), 200);
      
      await Promise.all([p2, p3]);
      
      // Both should eventually succeed
      expect(results.filter(r => r).length).toBe(2);
    });
  });

  describe('edge cases', () => {
    it('should handle multiple release calls', () => {
      const lock = new FileLock(TEST_FILE);
      expect(() => {
        lock.release();
        lock.release();
      }).not.toThrow();
    });
  });
});
