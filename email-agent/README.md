# Email Agent Demo

> ⚠️ **IMPORTANT**: This is a demo application by Anthropic. It is intended for local development only and should NOT be deployed to production or used at scale.

A demonstration email client powered by Claude and the Claude Code SDK, showcasing AI-powered email management capabilities.

## Architecture

![Architecture Diagram](./architecture.png)

## 🔒 Security Warning

**This application should ONLY be run locally on your personal machine.** It:
- Stores email credentials in plain text environment variables
- Has no authentication or multi-user support
- Is not designed for production security standards

## Prerequisites

- **Runtime**: [Bun](https://bun.sh) or Node.js 18+
- **API Key**: [Anthropic API key](https://console.anthropic.com)
- **Email**: Account with IMAP access enabled (Gmail recommended)

## Installation

### Option 1: Docker (Recommended)

The easiest way to run the email agent:

```bash
# 1. Clone the repository
git clone https://github.com/anthropics/sdk-demos.git
cd sdk-demos/email-agent

# 2. Create and configure .env file
cp .env.example .env
# Edit .env with your credentials (see IMAP Setup below)

# 3. Run with Docker
docker compose up
```

Open your browser to `http://localhost:3000`

### Option 2: Local Development

**With Node.js:**
```bash
# 1. Clone and navigate
git clone https://github.com/anthropics/sdk-demos.git
cd sdk-demos/email-agent

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env
# Edit .env with your credentials

# 4. Run the server
npm run dev
```

**With Bun:**
```bash
# 1-3. Same as above

# 4. Run with Bun
bun run dev
```

Open your browser to `http://localhost:3000`

## IMAP Setup Guide

### Gmail Setup

Gmail requires an **App Password** instead of your regular password:

1. **Enable 2-Factor Authentication** (required for app passwords):
   - Go to [Google Account Security](https://myaccount.google.com/security)
   - Click on "2-Step Verification" and follow the setup

2. **Generate an App Password**:
   - Go to [Google App Passwords](https://myaccount.google.com/apppasswords)
   - Select "Mail" from the dropdown
   - Select your device (or choose "Other" and name it "Email Agent")
   - Click "Generate"
   - **Copy the 16-character password** (you won't see it again!)

3. **Configure `.env`**:
```env
ANTHROPIC_API_KEY=your-anthropic-api-key
EMAIL_ADDRESS=your-email@gmail.com
EMAIL_APP_PASSWORD=your-16-char-app-password  # NOT your regular password!
IMAP_HOST=imap.gmail.com
IMAP_PORT=993
```

## Troubleshooting

### Gmail IMAP Issues

**Problem**: Emails fetch slowly or time out

**Solutions**:
1. Verify your app password is correct (not your regular Gmail password)
2. Check that IMAP is enabled in Gmail settings
3. Ensure 2-factor authentication is enabled (required for app passwords)
4. If using Docker, restart the container: `docker compose restart`

**Performance Notes**:
- Initial email sync may take a few seconds
- Full email bodies (including attachments) are fetched on-demand
- Typical fetch time: ~2-3 seconds for 1-3 emails with full content

### Docker Issues

**Problem**: Container fails to start

**Solutions**:
- Verify Docker is running: `docker ps`
- Check .env file exists and has correct credentials
- Rebuild the container: `docker compose build --no-cache`
- View logs: `docker compose logs -f`

### Node.js Issues

**Problem**: Module not found or dependency errors

**Solutions**:
- Clear node_modules and reinstall: `rm -rf node_modules && npm install`
- Ensure Node.js version 18 or higher: `node --version`
- Try using npm instead of yarn or pnpm

## Support

This is a demo application provided as-is. For issues related to:
- **Claude Code SDK**: [SDK Documentation](https://docs.anthropic.com/claude-code)
- **Demo Issues**: [GitHub Issues](https://github.com/anthropics/sdk-demos/issues)
- **API Questions**: [Anthropic Support](https://support.anthropic.com)

## License

MIT License - This is sample code for demonstration purposes.

---

Built by Anthropic to demonstrate the [Claude Code SDK](https://github.com/anthropics/claude-code-sdk)