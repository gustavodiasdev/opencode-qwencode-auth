/**
 * Robust Test Worker
 * 
 * Executed as a separate process to simulate concurrent plugin instances.
 * Uses isolated temporary credentials via environment variables.
 */

import { tokenManager } from '../../src/plugin/token-manager.js';
import { appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const workerId = process.argv[2] || 'unknown';
const testType = process.argv[3] || 'standard';
const sharedLogPath = process.argv[4];

// Use isolated test directory from environment variable
const TEST_TMP_DIR = process.env.QWEN_TEST_TMP_DIR || join(tmpdir(), 'qwen-robust-tests');
const TEST_CREDS_PATH = process.env.QWEN_TEST_CREDS_PATH || join(TEST_TMP_DIR, 'oauth_creds.json');

// Set environment variable BEFORE tokenManager is used
process.env.QWEN_TEST_CREDS_PATH = TEST_CREDS_PATH;

async function logResult(data: any) {
  if (!sharedLogPath) {
    console.log(JSON.stringify(data));
    return;
  }

  const result = {
    workerId,
    timestamp: Date.now(),
    pid: process.pid,
    ...data
  };

  appendFileSync(sharedLogPath, JSON.stringify(result) + '\n');
}

async function runTest() {
  try {
    switch (testType) {
      case 'race':
        const creds = await tokenManager.getValidCredentials(true);
        await logResult({
          status: 'success',
          token: creds?.accessToken
        });
        break;

      case 'corrupt':
        const c3 = await tokenManager.getValidCredentials();
        await logResult({ status: 'success', token: c3?.accessToken?.substring(0, 10) });
        break;

      case 'stress':
        for (let i = 0; i < 5; i++) {
          await tokenManager.getValidCredentials(i === 0);
          await new Promise(r => setTimeout(r, Math.random() * 200));
        }
        await logResult({ status: 'completed_stress' });
        break;

      default:
        const c2 = await tokenManager.getValidCredentials();
        await logResult({ status: 'success', token: c2?.accessToken?.substring(0, 10) });
    }
  } catch (error: any) {
    await logResult({ status: 'error', error: error.message });
    process.exit(1);
  }
  
  process.exit(0);
}

runTest().catch(async (e) => {
  await logResult({ status: 'fatal', error: e.message });
  process.exit(1);
});
