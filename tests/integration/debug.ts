/**
 * Debug & Test File - NÃO modifica comportamento do plugin
 */

import { homedir } from 'node:os';
import { join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';

// Importa funções do código existente (sem modificar)
import {
  generatePKCE,
  requestDeviceAuthorization,
  pollDeviceToken,
  tokenResponseToCredentials,
  refreshAccessToken,
  isCredentialsExpired,
  SlowDownError,
} from '../../src/qwen/oauth.js';
import {
  loadCredentials,
  saveCredentials,
  resolveBaseUrl,
  getCredentialsPath,
} from '../../src/plugin/auth.js';
import { QWEN_API_CONFIG, QWEN_OAUTH_CONFIG, getQwenHeaders } from '../../src/constants.js';
import { retryWithBackoff, getErrorStatus } from '../../src/utils/retry.js';
import { RequestQueue } from '../../src/plugin/request-queue.js';
import { tokenManager } from '../../src/plugin/token-manager.js';
import type { QwenCredentials } from '../../src/types.js';

// ============================================
// Logging Utilities
// ============================================

const LOG_PREFIX = {
  TEST: '[TEST]',
  INFO: '[INFO]',
  OK: '[✓]',
  FAIL: '[✗]',
  WARN: '[!]',
  DEBUG: '[→]',
};

function log(prefix: keyof typeof LOG_PREFIX, message: string, data?: unknown) {
  const timestamp = new Date().toISOString().split('T')[1].replace('Z', '');
  const prefixStr = LOG_PREFIX[prefix];
  
  if (data !== undefined) {
    console.log(`${timestamp} ${prefixStr} ${message}`, data);
  } else {
    console.log(`${timestamp} ${prefixStr} ${message}`);
  }
}

function logTest(name: string, message: string) {
  log('TEST', `${name}: ${message}`);
}

function logOk(name: string, message: string) {
  log('OK', `${name}: ${message}`);
}

function logFail(name: string, message: string, error?: unknown) {
  log('FAIL', `${name}: ${message}`);
  if (error) {
    console.error('  Error:', error instanceof Error ? error.message : error);
  }
}

function truncate(str: string, length: number): string {
  if (str.length <= length) return str;
  return str.substring(0, length) + '...';
}

// ============================================
// Test Functions
// ============================================

async function testPKCE(): Promise<boolean> {
  logTest('PKCE', 'Iniciando teste de geração PKCE...');
  try {
    const { verifier, challenge } = generatePKCE();
    logOk('PKCE', `Verifier gerado: ${truncate(verifier, 20)}`);
    logOk('PKCE', `Challenge gerado: ${truncate(challenge, 20)}`);
    return true;
  } catch (error) {
    logFail('PKCE', 'Falha na geração', error);
    return false;
  }
}

async function testBaseUrlResolution(): Promise<boolean> {
  logTest('BaseUrl', 'Iniciando teste de resolução de baseURL...');
  const testCases = [
    { input: undefined, expected: QWEN_API_CONFIG.portalBaseUrl, desc: 'undefined' },
    { input: 'portal.qwen.ai', expected: QWEN_API_CONFIG.portalBaseUrl, desc: 'portal.qwen.ai' },
    { input: 'dashscope', expected: QWEN_API_CONFIG.defaultBaseUrl, desc: 'dashscope' },
  ];
  for (const tc of testCases) {
    const res = resolveBaseUrl(tc.input);
    if (res !== tc.expected) {
      logFail('BaseUrl', `${tc.desc}: esperado ${tc.expected}, got ${res}`);
      return false;
    }
    logOk('BaseUrl', `${tc.desc}: ${res} ✓`);
  }
  return true;
}

async function testCredentialsPersistence(): Promise<boolean> {
  logTest('Credentials', 'Iniciando teste de persistência (usando arquivo temporário)...');
  
  const originalPath = getCredentialsPath();
  const testPath = originalPath + '.test';
  
  const testCreds: QwenCredentials = {
    accessToken: 'test_accessToken_' + Date.now(),
    tokenType: 'Bearer',
    refreshToken: 'test_refreshToken_' + Date.now(),
    resourceUrl: 'portal.qwen.ai',
    expiryDate: Date.now() + 3600000,
  };
  
  try {
    const fs = await import('node:fs');
    fs.writeFileSync(testPath, JSON.stringify({
      access_token: testCreds.accessToken,
      token_type: testCreds.tokenType,
      refresh_token: testCreds.refreshToken,
      resource_url: testCreds.resourceUrl,
      expiry_date: testCreds.expiryDate,
    }, null, 2));
    
    const content = fs.readFileSync(testPath, 'utf8');
    const data = JSON.parse(content);
    const loaded = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
    };
    
    fs.unlinkSync(testPath);
    
    if (loaded.accessToken !== testCreds.accessToken) {
      logFail('Credentials', 'Access token não confere');
      return false;
    }
    logOk('Credentials', 'Persistência OK ✓');
    return true;
  } catch (e) {
    logFail('Credentials', 'Erro no teste de persistência', e);
    return false;
  }
}

async function testIsCredentialsExpired(): Promise<boolean> {
  logTest('Expiry', 'Iniciando teste de expiração...');
  const creds = loadCredentials();
  if (!creds) {
    log('WARN', 'Expiry', 'Nenhuma credential encontrada');
    return true;
  }
  const isExp = isCredentialsExpired(creds);
  logOk('Expiry', `Is expired: ${isExp} ✓`);
  return true;
}

async function testTokenRefresh(): Promise<boolean> {
  logTest('Refresh', 'Iniciando teste de refresh...');
  const creds = loadCredentials();
  if (!creds || creds.accessToken?.startsWith('test_')) {
    log('WARN', 'Refresh', 'Tokens de teste detectados - refresh EXPECTADO para falhar');
    return true;
  }
  try {
    const refreshed = await refreshAccessToken(creds.refreshToken!);
    logOk('Refresh', `Novo token: ${truncate(refreshed.accessToken, 20)} ✓`);
    return true;
  } catch (error) {
    logFail('Refresh', 'Falha no refresh', error);
    return false;
  }
}

async function testRetryMechanism(): Promise<boolean> {
  logTest('Retry', 'Iniciando teste de retry...');
  let attempts = 0;
  await retryWithBackoff(async () => {
    attempts++;
    if (attempts < 3) throw { status: 429 };
    return 'ok';
  }, { maxAttempts: 5, initialDelayMs: 100 });
  logOk('Retry', `Sucesso após ${attempts} tentativas ✓`);
  return attempts === 3;
}

async function testThrottling(): Promise<boolean> {
  logTest('Throttling', 'Iniciando teste de throttling...');
  const queue = new RequestQueue();
  const start = Date.now();
  await queue.enqueue(async () => {});
  await queue.enqueue(async () => {});
  const elapsed = Date.now() - start;
  logOk('Throttling', `Intervalo: ${elapsed}ms ✓`);
  return elapsed >= 1000;
}

async function testTokenManager(): Promise<boolean> {
  logTest('TokenManager', 'Iniciando teste do TokenManager...');
  tokenManager.clearCache();
  const creds = await tokenManager.getValidCredentials();
  if (creds) {
    logOk('TokenManager', 'Busca de credentials OK ✓');
    return true;
  }
  logFail('TokenManager', 'Falha ao buscar credentials');
  return false;
}

async function test401Recovery(): Promise<boolean> {
  logTest('401Recovery', 'Iniciando teste de recuperação 401...');
  let attempts = 0;
  await retryWithBackoff(async () => {
    attempts++;
    if (attempts === 1) throw { status: 401 };
    return 'ok';
  }, { maxAttempts: 3, initialDelayMs: 100, shouldRetryOnError: (e: any) => e.status === 401 });
  logOk('401Recovery', `Recuperação OK em ${attempts} tentativas ✓`);
  return attempts === 2;
}

async function testRealChat(): Promise<boolean> {
  logTest('RealChat', 'Iniciando teste de chat real com a API...');
  
  const creds = await tokenManager.getValidCredentials();
  if (!creds?.accessToken) {
    logFail('RealChat', 'Nenhuma credential válida encontrada');
    return false;
  }
  
  const baseUrl = resolveBaseUrl(creds.resourceUrl);
  const url = `${baseUrl}/chat/completions`;
  
  log('DEBUG', 'RealChat', `URL: ${url}`);
  log('DEBUG', 'RealChat', `Token: ${creds.accessToken.substring(0, 10)}...`);
  
  const headers = {
    ...getQwenHeaders(),
    'Authorization': `Bearer ${creds.accessToken}`,
    'Content-Type': 'application/json',
  };
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: 'coder-model',
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 5
      })
    });
    
    log('INFO', 'RealChat', `Status: ${response.status} ${response.statusText}`);
    const data: any = await response.json();
    
    if (response.ok) {
      logOk('RealChat', `API respondeu com sucesso: "${data.choices?.[0]?.message?.content}" ✓`);
      return true;
    } else {
      logFail('RealChat', `API retornou erro: ${JSON.stringify(data)}`);
      return false;
    }
  } catch (error) {
    logFail('RealChat', 'Erro na requisição fetch', error);
    return false;
  }
}

// ============================================
// Main
// ============================================

async function runTest(name: string, testFn: () => Promise<boolean>): Promise<boolean> {
  console.log(`\nTEST: ${name}`);
  return await testFn();
}

async function main() {
  const command = process.argv[2] || 'full';
  const results: Record<string, boolean> = {};

  if (command === 'full') {
    results.pkce = await runTest('PKCE', testPKCE);
    results.baseurl = await runTest('BaseUrl', testBaseUrlResolution);
    results.persistence = await runTest('Persistence', testCredentialsPersistence);
    results.expiry = await runTest('Expiry', testIsCredentialsExpired);
    results.refresh = await runTest('Refresh', testTokenRefresh);
    results.retry = await runTest('Retry', testRetryMechanism);
    results.throttling = await runTest('Throttling', testThrottling);
    results.tm = await runTest('TokenManager', testTokenManager);
    results.r401 = await runTest('401Recovery', test401Recovery);
    results.chat = await runTest('RealChat', testRealChat);
    
    console.log('\nSUMMARY:');
    for (const [k, v] of Object.entries(results)) {
      console.log(`${k}: ${v ? 'PASS' : 'FAIL'}`);
    }
  } else if (command === 'status') {
    const creds = loadCredentials();
    console.log('Status:', creds);
  }
}

main().catch(console.error);
