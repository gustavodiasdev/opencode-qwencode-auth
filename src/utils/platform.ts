/**
 * Platform detection utilities
 * Detects OS and architecture dynamically for User-Agent generation
 */

const PLATFORM_MAP: Record<string, string> = {
  linux: 'Linux',
  darwin: 'macOS',
  win32: 'Windows',
  freebsd: 'FreeBSD',
  openbsd: 'OpenBSD',
  sunos: 'Solaris',
  aix: 'AIX',
};

const ARCH_MAP: Record<string, string> = {
  x64: 'x64',
  arm64: 'arm64',
  ia32: 'ia32',
  ppc64: 'ppc64',
  arm: 'arm',
  mips: 'mips',
};

/**
 * Detect current platform and return human-readable name
 */
export function detectPlatform(): string {
  return PLATFORM_MAP[process.platform] || 'Unknown';
}

/**
 * Detect current architecture and return human-readable name
 */
export function detectArch(): string {
  return ARCH_MAP[process.arch] || 'unknown';
}

/**
 * Get platform info in format suitable for User-Agent
 */
export function getPlatformInfo(): string {
  return `${detectPlatform()}; ${detectArch()}`;
}
