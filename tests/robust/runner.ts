/**
 * Robust Test Runner
 * 
 * Orchestrates multi-process tests for TokenManager and FileLock.
 * Uses isolated temporary files to avoid modifying user credentials.
 */

import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { existsSync, writeFileSync, unlinkSync, readFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { FileLock } from '../../src/utils/file-lock.js';
import { getCredentialsPath } from '../../src/plugin/auth.js';

// Isolated test directory (NOT user's ~/.qwen)
const TEST_TMP_DIR = join(tmpdir(), 'qwen-robust-tests');
const TEST_CREDS_PATH = join(TEST_TMP_DIR, 'oauth_creds.json');
const TEST_LOCK_PATH = TEST_CREDS_PATH + '.lock';
const SHARED_LOG = join(TEST_TMP_DIR, 'results.log');
const WORKER_SCRIPT = join(process.cwd(), 'tests/robust/worker.ts');

// Configurable timeout (default 90s for all tests)
const TEST_TIMEOUT = parseInt(process.env.TEST_TIMEOUT || '90000');

/**
 * Setup test environment with isolated credentials
 */
function setup() {
  if (!existsSync(TEST_TMP_DIR)) mkdirSync(TEST_TMP_DIR, { recursive: true });
  if (existsSync(SHARED_LOG)) unlinkSync(SHARED_LOG);
  
  // Copy real credentials to test location (read-only copy for testing)
  const realCredsPath = getCredentialsPath();
  if (existsSync(realCredsPath)) {
    copyFileSync(realCredsPath, TEST_CREDS_PATH);
  } else {
    // Create mock credentials if user has no login
    writeFileSync(TEST_CREDS_PATH, JSON.stringify({
      access_token: 'mock_test_token_' + Date.now(),
      token_type: 'Bearer',
      refresh_token: 'mock_refresh_token',
      resource_url: 'portal.qwen.ai',
      expiry_date: Date.now() + 3600000,
      scope: 'openid'
    }, null, 2));
  }
  
  // Clean up stale locks from test directory only
  if (existsSync(TEST_LOCK_PATH)) unlinkSync(TEST_LOCK_PATH);
}

/**
 * Cleanup test environment (only temp files, never user credentials)
 */
function cleanup() {
  try {
    if (existsSync(SHARED_LOG)) unlinkSync(SHARED_LOG);
    if (existsSync(TEST_CREDS_PATH)) unlinkSync(TEST_CREDS_PATH);
    if (existsSync(TEST_LOCK_PATH)) unlinkSync(TEST_LOCK_PATH);
  } catch (e) {
    console.warn('Cleanup warning:', e);
  }
}

/**
 * Run worker process with isolated test environment
 */
async function runWorker(id: string, type: string): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn('bun', [WORKER_SCRIPT, id, type, SHARED_LOG], {
      stdio: 'inherit',
      env: { 
        ...process.env, 
        OPENCODE_QWEN_DEBUG: '1',
        QWEN_TEST_TMP_DIR: TEST_TMP_DIR,
        QWEN_TEST_CREDS_PATH: TEST_CREDS_PATH
      }
    });
    child.on('close', resolve);
  });
}

async function testRaceCondition() {
  console.log('\n--- 🏁 TEST: Concurrent Race Condition (2 Processes) ---');
  setup();
  
  // Start 2 workers that both try to force refresh
  const p1 = runWorker('W1', 'race');
  const p2 = runWorker('W2', 'race');
  
  await Promise.all([p1, p2]);
  
  if (!existsSync(SHARED_LOG)) {
    console.error('❌ FAIL: No log file created');
    return;
  }

  const logContent = readFileSync(SHARED_LOG, 'utf8').trim();
  if (!logContent) {
    console.error('❌ FAIL: No results in log');
    return;
  }
  const results = logContent.split('\n').map(l => JSON.parse(l));
  console.log(`Results collected: ${results.length}`);
  
  const tokens = results.map(r => r.token);
  const uniqueTokens = new Set(tokens);
  
  console.log(`Unique tokens: ${uniqueTokens.size}`);

  if (uniqueTokens.size === 1 && results.every(r => r.status === 'success')) {
    console.log('✅ PASS: Both processes ended up with the SAME token. Locking worked!');
  } else {
    console.error('❌ FAIL: Processes have different tokens or failed.');
    console.error('Tokens:', tokens);
  }
  
  cleanup();
}

async function testStressConcurrency() {
  console.log('\n--- 🔥 TEST: Stress Concurrency (10 Processes) ---');
  setup();
  
  const workers = [];
  for (let i = 0; i < 10; i++) {
    workers.push(runWorker(`STRESS_${i}`, 'stress'));
  }
  
  const start = Date.now();
  await Promise.all(workers);
  const elapsed = Date.now() - start;
  
  if (!existsSync(SHARED_LOG)) {
    console.error('❌ FAIL: No log file created');
    return;
  }

  const logContent = readFileSync(SHARED_LOG, 'utf8').trim();
  if (!logContent) {
    console.error('❌ FAIL: No results in log');
    return;
  }
  const results = logContent.split('\n').map(l => JSON.parse(l));
  const successCount = results.filter(r => r.status === 'completed_stress').length;
  
  console.log(`Successes: ${successCount}/10 in ${elapsed}ms`);
  
  if (successCount === 10) {
    console.log('✅ PASS: High concurrency handled successfully.');
  } else {
    console.error('❌ FAIL: Some workers failed during stress test.');
  }
  
  cleanup();
}

async function testStaleLockRecovery() {
  console.log('\n--- 🛡️ TEST: Stale Lock Recovery (Wait for timeout) ---');
  setup();
  
  // Use TEST lock file, NEVER user's lock file
  writeFileSync(TEST_LOCK_PATH, 'stale-lock-data');
  console.log('Created stale lock file manually...');
  console.log(`Test file: ${TEST_LOCK_PATH}`);
  
  const start = Date.now();
  console.log('Starting worker that must force refresh and hit the lock...');
  console.log('Expected wait time: ~5-6 seconds (lock timeout)');
  
  // Force refresh ('race' type) to ensure it tries to acquire the lock
  await runWorker('RECOVERY_W1', 'race');
  
  const elapsed = Date.now() - start;
  console.log(`Worker finished in ${elapsed}ms`);
  
  if (!existsSync(SHARED_LOG)) {
    console.error('❌ FAIL: No log file created');
    return;
  }

  const logContent = readFileSync(SHARED_LOG, 'utf8').trim();
  const results = logContent ? logContent.split('\n').map(l => JSON.parse(l)) : [];
  
  // Check if worker succeeded and took appropriate time (5-10 seconds)
  const success = results.length > 0 && results[0].status === 'success';
  const timingOk = elapsed >= 4000 && elapsed <= 15000; // 4-15s window
  
  if (success && timingOk) {
    console.log('✅ PASS: Worker recovered from stale lock after timeout.');
    console.log(`   Elapsed: ${elapsed}ms (expected: 5-10s)`);
  } else {
    console.error(`❌ FAIL: Recovery failed.`);
    console.error(`   Status: ${success ? 'OK' : 'FAILED'}`);
    console.error(`   Timing: ${elapsed}ms ${timingOk ? 'OK' : '(expected 4-15s)'}`);
    if (results.length > 0) console.error('Worker result:', results[0]);
  }
  
  cleanup();
}

async function testCorruptedFileRecovery() {
  console.log('\n--- ☣️ TEST: Corrupted File Recovery ---');
  setup();
  
  // Use TEST credentials file, NEVER user's file
  writeFileSync(TEST_CREDS_PATH, 'NOT_JSON_DATA_CORRUPTED_{{{');
  console.log('Corrupted credentials file manually...');
  console.log(`Test file: ${TEST_CREDS_PATH}`);
  console.log('⚠️  This is a TEMPORARY test file (NOT user credentials)');
  
  // Worker should handle JSON parse error and ideally trigger re-auth or return null safely
  await runWorker('CORRUPT_W1', 'corrupt');
  
  if (!existsSync(SHARED_LOG)) {
    console.error('❌ FAIL: No log file created');
    return;
  }

  const logContent = readFileSync(SHARED_LOG, 'utf8').trim();
  const results = logContent ? logContent.split('\n').map(l => JSON.parse(l)) : [];
  
  if (results.length > 0) {
    console.log('Worker finished. Status:', results[0].status);
    console.log('✅ PASS: Worker handled corrupted file without crashing.');
  } else {
    console.error('❌ FAIL: Worker crashed or produced no log.');
  }
  
  cleanup();
}

async function main() {
  const overallStart = Date.now();
  
  console.log('╔════════════════════════════════════════════╗');
  console.log('║  Robust Tests - Multi-Process Safety      ║');
  console.log('╚════════════════════════════════════════════╝');
  console.log(`Configuration: ${TEST_TIMEOUT}ms total timeout`);
  console.log(`Test directory: ${TEST_TMP_DIR}`);
  console.log('⚠️  Using isolated temp files (NOT user credentials)');
  console.log('⚠️  User credentials at ~/.qwen/ are SAFE');
  
  try {
    console.log('\n[Test 1/4] Race Condition...');
    await testRaceCondition();
    
    console.log('\n[Test 2/4] Stress Concurrency...');
    await testStressConcurrency();
    
    console.log('\n[Test 3/4] Stale Lock Recovery...');
    await testStaleLockRecovery();
    
    console.log('\n[Test 4/4] Corrupted File Recovery...');
    await testCorruptedFileRecovery();
    
    const totalElapsed = Date.now() - overallStart;
    console.log(`\n🌟 ALL ROBUST TESTS COMPLETED 🌟`);
    console.log(`Total time: ${(totalElapsed / 1000).toFixed(1)}s`);
  } catch (error) {
    console.error('\n❌ Test Runner Error:', error);
    cleanup();
    process.exit(1);
  }
}

main();
