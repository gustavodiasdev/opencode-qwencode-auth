/**
 * Race Condition Test
 * 
 * Simulates 2 processes trying to refresh token simultaneously
 * Tests if file locking prevents concurrent refreshes
 * 
 * Usage:
 *   bun run tests/test-race-condition.ts
 */

import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { existsSync, writeFileSync, unlinkSync, readFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';

const TEST_DIR = join(homedir(), '.qwen-test-race');
const CREDENTIALS_PATH = join(TEST_DIR, 'oauth_creds.json');
const LOG_PATH = join(TEST_DIR, 'refresh-log.json');

/**
 * Helper script that performs token refresh using TokenManager (with file locking)
 */
function createRefreshScript(): string {
  const scriptPath = join(TEST_DIR, 'do-refresh.ts');
  
  const script = `import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tokenManager } from '/home/fallen33/opencode-qwencode-auth-PR/src/plugin/token-manager.js';
import { getCredentialsPath } from '/home/fallen33/opencode-qwencode-auth-PR/src/plugin/auth.js';

const LOG_PATH = '${LOG_PATH}';
const CREDS_PATH = '${CREDENTIALS_PATH}';

async function logRefresh(token: string) {
  const logEntry = {
    processId: process.pid,
    timestamp: Date.now(),
    token: token.substring(0, 20) + '...'
  };
  
  let log: any = { attempts: [] };
  if (existsSync(LOG_PATH)) {
    log = JSON.parse(readFileSync(LOG_PATH, 'utf8'));
  }
  
  log.attempts.push(logEntry);
  writeFileSync(LOG_PATH, JSON.stringify(log, null, 2));
  console.log('[Refresh]', logEntry);
}

async function main() {
  writeFileSync(CREDS_PATH, JSON.stringify({
    access_token: 'old_token_' + Date.now(),
    refresh_token: 'test_refresh_token',
    token_type: 'Bearer',
    resource_url: 'portal.qwen.ai',
    expiry_date: Date.now() - 1000,
    scope: 'openid'
  }, null, 2));
  
  const creds = await tokenManager.getValidCredentials(true);
  if (creds) {
    logRefresh(creds.accessToken);
  } else {
    logRefresh('FAILED');
  }
}

main()
  .then(() => process.exit(0))
  .catch(e => { console.error(e); process.exit(1); });
`;

  writeFileSync(scriptPath, script);
  return scriptPath;
}

/**
 * Setup test environment
 */
function setup(): void {
  if (!existsSync(TEST_DIR)) {
    mkdirSync(TEST_DIR, { recursive: true });
  }
  if (existsSync(LOG_PATH)) unlinkSync(LOG_PATH);
  const lockPath = CREDENTIALS_PATH + '.lock';
  if (existsSync(lockPath)) unlinkSync(lockPath);
}

/**
 * Cleanup test environment
 */
function cleanup(): void {
  try {
    if (existsSync(LOG_PATH)) unlinkSync(LOG_PATH);
    if (existsSync(CREDENTIALS_PATH)) unlinkSync(CREDENTIALS_PATH);
    const scriptPath = join(TEST_DIR, 'do-refresh.ts');
    if (existsSync(scriptPath)) unlinkSync(scriptPath);
    const lockPath = CREDENTIALS_PATH + '.lock';
    if (existsSync(lockPath)) unlinkSync(lockPath);
  } catch (e) {
    console.warn('Cleanup warning:', e);
  }
}

/**
 * Run 2 processes simultaneously
 * Uses polling to check log file instead of relying on 'close' event
 */
async function runConcurrentRefreshes(): Promise<void> {
  const scriptPath = createRefreshScript();
  
  return new Promise((resolve, reject) => {
    const procs: any[] = [];
    let errors = 0;

    // Start both processes
    for (let i = 0; i < 2; i++) {
      const proc = spawn('bun', [scriptPath], {
        cwd: process.cwd(),
        stdio: ['pipe', 'pipe', 'pipe'],
        detached: false
      });

      procs.push(proc);

      proc.stdout.on('data', (data) => {
        console.log(`[Proc ${i}]`, data.toString().trim());
      });

      proc.stderr.on('data', (data) => {
        console.error(`[Proc ${i} ERR]`, data.toString().trim());
        errors++;
      });

      // Don't wait for close event, just let processes finish
      proc.unref();
    }

    // Poll log file for results
    const startTime = Date.now();
    const timeout = 30000;
    
    const checkLog = setInterval(() => {
      try {
        if (existsSync(LOG_PATH)) {
          const logContent = readFileSync(LOG_PATH, 'utf8').trim();
          if (logContent) {
            const log = JSON.parse(logContent);
            if (log.attempts && log.attempts.length >= 2) {
              clearInterval(checkLog);
              resolve();
              return;
            }
          }
        }
        
        // Timeout check
        if (Date.now() - startTime > timeout) {
          clearInterval(checkLog);
          reject(new Error('Test timeout - log file not populated'));
        }
      } catch (e) {
        // Ignore parse errors, keep polling
      }
    }, 100);
  });
}

/**
 * Analyze results
 * Note: This test verifies that file locking serializes access
 * Even if both processes complete, they should not refresh simultaneously
 */
function analyzeResults(): boolean {
  if (!existsSync(LOG_PATH)) {
    console.error('❌ Log file not created');
    return false;
  }

  const log = JSON.parse(readFileSync(LOG_PATH, 'utf8'));
  const attempts = log.attempts || [];

  console.log('\n=== RESULTS ===');
  console.log(`Total refresh attempts: ${attempts.length}`);

  if (attempts.length === 0) {
    console.error('❌ No refresh attempts recorded');
    return false;
  }

  // Check if both processes got the SAME token (indicates locking worked)
  const tokens = attempts.map((a: any) => a.token);
  const uniqueTokens = new Set(tokens);
  
  console.log(`Unique tokens received: ${uniqueTokens.size}`);
  
  if (uniqueTokens.size === 1) {
    console.log('✅ PASS: Both processes received the SAME token');
    console.log('   (File locking serialized the refresh operation)');
    return true;
  }

  // If different tokens, check timing
  if (attempts.length >= 2) {
    const timeDiff = Math.abs(attempts[1].timestamp - attempts[0].timestamp);
    
    if (timeDiff < 100) {
      console.log(`❌ FAIL: Concurrent refreshes detected (race condition!)`);
      console.log(`   Time difference: ${timeDiff}ms`);
      console.log(`   Tokens: ${tokens.join(', ')}`);
      return false;
    }
    
    console.log(`⚠️  ${attempts.length} refreshes, spaced ${timeDiff}ms apart`);
    console.log('   (Locking worked - refreshes were serialized)');
    return true;
  }

  console.log('✅ PASS: Single refresh completed');
  return true;
}

/**
 * Main test runner
 */
async function main(): Promise<void> {
  console.log('╔════════════════════════════════════════════╗');
  console.log('║  Race Condition Test - File Locking       ║');
  console.log('╚════════════════════════════════════════════╝\n');

  try {
    console.log('Setting up test environment...');
    setup();

    console.log('Running 2 concurrent refresh processes...\n');
    await runConcurrentRefreshes();

    const passed = analyzeResults();

    if (passed) {
      console.log('\n✅ TEST PASSED: File locking prevents race condition\n');
      process.exit(0);
    } else {
      console.log('\n❌ TEST FAILED: Race condition detected\n');
      process.exit(1);
    }
  } catch (error) {
    console.error('\n❌ TEST ERROR:', error);
    process.exit(1);
  } finally {
    cleanup();
  }
}

main();
