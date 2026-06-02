import { describe, test, expect } from 'bun:test';
import { detectPlatform, detectArch, getPlatformInfo } from '../../src/utils/platform.js';
import { generateUserAgent } from '../../src/utils/user-agent.js';

describe('Platform Detection', () => {
  test('should detect current platform', () => {
    const platform = detectPlatform();
    expect(platform).toBeTruthy();
    expect(typeof platform).toBe('string');
    expect(platform.length).toBeGreaterThan(0);
  });

  test('should detect current architecture', () => {
    const arch = detectArch();
    expect(arch).toBeTruthy();
    expect(typeof arch).toBe('string');
    expect(arch.length).toBeGreaterThan(0);
  });

  test('should return valid platform info format', () => {
    const platformInfo = getPlatformInfo();
    expect(platformInfo).toContain('; ');
    const [platform, arch] = platformInfo.split('; ');
    expect(platform).toBeTruthy();
    expect(arch).toBeTruthy();
  });
});

describe('User-Agent Generation', () => {
  test('should generate valid User-Agent format', () => {
    const userAgent = generateUserAgent();
    expect(userAgent).toMatch(/^QwenCode\/\d+\.\d+\.\d+ \(.+; .+\)$/);
  });

  test('should include version 0.14.0', () => {
    const userAgent = generateUserAgent();
    expect(userAgent).toContain('QwenCode/0.14.0');
  });

  test('should include detected platform', () => {
    const userAgent = generateUserAgent();
    const platform = detectPlatform();
    expect(userAgent).toContain(platform);
  });

  test('should include detected architecture', () => {
    const userAgent = generateUserAgent();
    const arch = detectArch();
    expect(userAgent).toContain(arch);
  });
});

describe('Platform Mapping', () => {
  test('should map known platforms correctly', () => {
    // This test verifies the mapping logic works
    // Actual values depend on the runtime environment
    const platform = detectPlatform();
    const knownPlatforms = ['Linux', 'macOS', 'Windows', 'FreeBSD', 'OpenBSD', 'Solaris', 'AIX', 'Unknown'];
    expect(knownPlatforms).toContain(platform);
  });

  test('should map known architectures correctly', () => {
    const arch = detectArch();
    const knownArches = ['x64', 'arm64', 'ia32', 'ppc64', 'arm', 'mips', 'unknown'];
    expect(knownArches).toContain(arch);
  });
});
