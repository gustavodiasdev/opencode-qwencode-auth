#!/usr/bin/env node
/**
 * Qwen Auth CLI Helper
 *
 * This script helps with manual authentication when the automatic
 * OAuth flow doesn't work (e.g., in SSH sessions, containers, etc.)
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';

const CREDS_PATH = join(homedir(), '.qwen', 'oauth_creds.json');

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

async function main() {
  console.log('\nQwen Auth CLI Helper\n');
  console.log('This tool helps you set up Qwen authentication manually.\n');

  // Check for existing credentials
  if (existsSync(CREDS_PATH)) {
    const data = JSON.parse(readFileSync(CREDS_PATH, 'utf-8'));
    console.log('Existing credentials found at:', CREDS_PATH);

    if (data.access_token) {
      console.log('Access token: Present');
      console.log('Email:', data.email || 'Not set');
      console.log('Updated at:', data.updated_at ? new Date(data.updated_at).toISOString() : 'Unknown');

      const overwrite = await question('\nOverwrite existing credentials? (y/N): ');
      if (overwrite.toLowerCase() !== 'y') {
        console.log('\nKeeping existing credentials. Exiting.');
        rl.close();
        return;
      }
    }
  }

  console.log('\nInstructions:');
  console.log('1. Open https://chat.qwen.ai in your browser');
  console.log('2. Sign in with your account');
  console.log('3. Open Developer Tools (F12) -> Network tab');
  console.log('4. Make any chat request');
  console.log('5. Find a request to chat.qwen.ai');
  console.log('6. Copy the "Authorization" header value (starts with "Bearer ...")');
  console.log('');

  const token = await question('Paste your Bearer token (or just the token without "Bearer "): ');

  if (!token.trim()) {
    console.log('No token provided. Exiting.');
    rl.close();
    return;
  }

  // Clean up the token
  let accessToken = token.trim();
  if (accessToken.toLowerCase().startsWith('bearer ')) {
    accessToken = accessToken.slice(7);
  }

  const email = await question('Email (optional, press Enter to skip): ');

  // Save credentials
  const dir = join(homedir(), '.qwen');
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const credentials = {
    access_token: accessToken,
    email: email.trim() || undefined,
    updated_at: Date.now(),
  };

  writeFileSync(CREDS_PATH, JSON.stringify(credentials, null, 2));

  console.log('\nCredentials saved to:', CREDS_PATH);
  console.log('\nYou can now use OpenCode with Qwen models:');
  console.log('  opencode --model qwen/qwen3-coder-plus');

  rl.close();
}

main().catch((error) => {
  console.error('Error:', error);
  rl.close();
  process.exit(1);
});
