# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### 🚨 Critical Fixes

- **Fixed provider reload after authentication** - Complete fix for provider disappearing after `/connect`
  - **Root cause**: OpenCode filters providers based on its own auth system (`Auth.get()`), not plugin's tokenManager
  - **Solution**: Call `client.auth.set()` in OAuth callback to save credentials to OpenCode auth system
  - Provider models now appear immediately after `/connect` without requiring restart
  - Added 3-second polling in loader to wait for OAuth callback completion (fixes race condition)
  - First request may trigger 401, but automatic recovery fetches fresh credentials transparently
  - Works for both first-time authentication and re-authentication scenarios
  - Leverages existing 401 recovery mechanism in fetch() for seamless auth on-demand

### 🔧 Fixes

- **Dynamic User-Agent detection** - User-Agent header now dynamically detects platform and architecture instead of hardcoded Linux/x64
  - Supports Linux, macOS, Windows, FreeBSD, OpenBSD, Solaris, AIX
  - Supports x64, arm64, ia32, ppc64, arm, mips architectures
  - Maintains qwen-code v0.12.0 client version for compatibility
  - Fixes authentication on non-Linux systems and ARM devices (M1/M2/M3 Macs, Raspberry Pi, etc.)


## [1.5.0] - 2026-03-14 (Updated)

### 🚨 Critical Fixes

- **Fixed credentials loading on new sessions** - Added explicit snake_case to camelCase conversion in `loadCredentials()` to correctly parse `~/.qwen/oauth_creds.json`
- **Fixed rate limiting issue (#4)** - Added official Qwen Code headers to prevent aggressive rate limiting
  - Headers include `X-DashScope-CacheControl`, `X-DashScope-AuthType`, `X-DashScope-UserAgent`
  - Requests now recognized as legitimate Qwen Code client
  - Full 1,000 requests/day quota now available (OAuth free tier)
- **HTTP 401 handling in device polling** - Added explicit error handling for HTTP 401 during device authorization polling
  - Attaches HTTP status code to errors for proper classification
  - User-friendly error message: "Device code expired or invalid. Please restart authentication."
- **Token refresh response validation** - Validates access_token presence in refresh response before accepting
- **Refresh token security** - Removed refresh token from console logs to prevent credential leakage

### 🔧 Production Hardening

- **Multi-process safety**
  - Implemented file locking with atomic `fs.openSync('wx')`
  - Added stale lock detection (10s threshold) matching official client
  - Registered 5 process exit handlers (exit, SIGINT, SIGTERM, uncaughtException, unhandledRejection)
  - Implemented atomic file writes using temp file + rename pattern
- **Token Management**
  - Added `TokenManager` with in-memory caching and promise tracking
  - Implemented file check throttling (5s interval) to reduce I/O overhead
  - Added file watcher for real-time cache invalidation when credentials change externally
  - Implemented atomic cache state updates to prevent inconsistent states
- **Error Recovery**
  - Added reactive 401 recovery: automatically forces token refresh and retries request
  - Implemented comprehensive credentials validation matching official client
  - Added timeout wrappers (3s) for file operations to prevent indefinite hangs
- **Performance & Reliability**
  - Added request throttling (1s min interval + random jitter) to prevent hitting 60 req/min limits
  - Implemented `retryWithBackoff` with exponential backoff and jitter (up to 7 attempts)
  - Added support for `Retry-After` header from server
  - OAuth requests now use 30s timeout to prevent indefinite hangs

### ✨ New Features

- **Dynamic API endpoint resolution** - Automatic region detection based on `resource_url` in OAuth token
- **Aligned with qwen-code-0.12.1** - Achieved 98% feature parity with official client
- **Enhanced Debug Logging** - Detailed context, timing, and state information (enabled via `OPENCODE_QWEN_DEBUG=1`)
- **Custom error hierarchy** - `QwenAuthError`, `CredentialsClearRequiredError`, `TokenManagerError` with error classification
- **Error classification system** - `classifyError()` helper for programmatic error handling with retry hints

### 🧪 Testing Infrastructure

- **Comprehensive test suite** - 104 unit tests across 6 test files with 197 assertions
  - `errors.test.ts` - Error handling and classification tests (30+ tests)
  - `oauth.test.ts` - OAuth device flow and PKCE tests (20+ tests)
  - `file-lock.test.ts` - File locking and concurrency tests (20 tests)
  - `token-manager.test.ts` - Token caching and refresh tests (10 tests)
  - `request-queue.test.ts` - Request throttling tests (15+ tests)
  - `auth-integration.test.ts` - End-to-end integration tests (15 tests)
- **Integration tests** - Manual test scripts for race conditions and end-to-end debugging
- **Robust stress tests** - Multi-process concurrency tests with 10 parallel workers
- **Test isolation** - `QWEN_TEST_CREDS_PATH` environment variable prevents tests from modifying user credentials
- **Test configuration** - `bunfig.toml` for test runner configuration
- **Test documentation** - `tests/README.md` with complete testing guide

### 📚 Documentation

- User-focused README cleanup (English and Portuguese)
- Updated troubleshooting section with practical recovery steps
- Detailed CHANGELOG for technical history
- Test suite documentation with commands and examples
- Architecture documentation in code comments

---

## [1.4.0] - 2026-02-27

### Added
- Dynamic API endpoint resolution
- DashScope headers support
- `loadCredentials()` and `resolveBaseUrl()` functions

### Fixed
- `ERR_INVALID_URL` error - loader now returns `baseURL` correctly
- "Incorrect API key provided" error for portal.qwen.ai tokens

---

## [1.3.0] - 2026-02-10

### Added
- OAuth Device Flow authentication
- Support for qwen3-coder-plus, qwen3-coder-flash models
- Automatic token refresh
- Compatibility with qwen-code credentials

---

## [1.2.0] - 2026-01-15

### Added
- Initial release
- Basic OAuth authentication
- Model configuration for Qwen providers
