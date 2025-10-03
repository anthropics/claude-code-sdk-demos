# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### ✨ Features
- **Docker support**: Added `Dockerfile` and `docker-compose.yml` for containerized deployment
- **Node.js compatibility**: Full support for Node.js 18+ runtime alongside Bun
- **Node.js server**: Alternative HTTP server implementation (`server/server-node.ts`) using native Node.js APIs
- **Better error handling**: Improved error messages and fallbacks for IMAP operations

### 🐛 Bug Fixes
- **Gmail IMAP timeouts**: Resolved body fetch timeouts that prevented full email content retrieval
- **Search results ordering**: Fixed issue where "last email" searches returned oldest emails first
- **Request body handling**: Fixed Node.js Request API duplex stream issues with POST requests
- **File operations**: Replaced Bun-specific file APIs with Node.js `fs/promises`

### 🔄 Changed
- **Email body fetching**: Switched from `bodyParts` to `source` + `simpleParser` for reliable Gmail IMAP compatibility
- **Email sorting**: Results now sorted by date descending (most recent first) for better UX
- **IMAP implementation**: Rewrote IMAP manager using `search()` + `fetchOne()` pattern to avoid lock contention
- **Database layer**: Migrated from `bun:sqlite` to `better-sqlite3` for cross-runtime compatibility
- **WebSocket server**: Migrated from Bun's built-in WebSocket to `ws` package
- **Build system**: Added `esbuild` for client-side TypeScript transpilation

### 📦 Dependencies
- Added: `better-sqlite3`, `ws`, `esbuild`, `tsx`
- Updated: `package.json` scripts to support both Bun and Node.js

### ⚡ Performance
- Email body fetching: ~2.6 seconds for single email with full content (previously timed out)
- Multi-email fetch: ~3 seconds for 3 emails with full bodies
- Successfully fetches 5KB text + 18KB HTML content from Gmail

### 📚 Documentation
- Added comprehensive troubleshooting guide in README
- Updated installation instructions with Docker and Node.js options
- Documented Gmail IMAP setup process
- Added performance notes and common issues

### 🔧 Technical Details

**IMAP Implementation Changes:**
- Before: Used `client.fetch()` iterator with `bodyParts: ['1', '2']`
- After: Use `client.search()` + `client.fetchOne()` with `source: true`
- Reason: Gmail IMAP through ImapFlow doesn't populate `bodyParts`; `source` approach works reliably

**Runtime Compatibility Matrix:**
| Feature | Bun | Node.js 18+ |
|---------|-----|-------------|
| Server | ✅ | ✅ |
| IMAP | ✅ | ✅ |
| WebSocket | ✅ | ✅ |
| Database | ✅ | ✅ |
| Docker | ✅ | ✅ |

### 🔧 Chores
- Initial project setup and configuration

## [1.0.0] - 2025-08-01

### ✨ Features
- Initial release of Email IMAP Search Script
- TypeScript implementation with EmailSearcher class
- Support for IMAP email searching with various criteria
- Comprehensive test suite with Jest
- Email search examples and documentation

### 📚 Documentation
- Complete README with setup and usage instructions
- Environment configuration examples
- API documentation for EmailSearcher class

### 🧪 Tests
- Unit tests for EmailSearcher functionality
- Test coverage reporting
- Continuous integration setup

### 📦 Build System
- TypeScript configuration
- Jest testing framework setup
- npm package configuration

### 👥 Contributors
- Initial development team