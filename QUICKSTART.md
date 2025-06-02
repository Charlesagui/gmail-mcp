# Quick Start Guide

Get your Secure Gmail MCP server running in 5 minutes!

## ⚡ Fast Setup

### 1. Install & Build
```bash
git clone https://github.com/Charlesagui/gmail-mcp.git
cd gmail-mcp
npm install
npm run build
```

### 2. Get Google Credentials
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create new project (or use existing)
3. Enable Gmail API: APIs & Services → Library → Gmail API → Enable
4. Create credentials: APIs & Services → Credentials → Create OAuth client ID → Desktop app
5. Download the JSON file

### 3. Setup Credentials
```bash
# Create directory
mkdir -p ~/.secure-gmail-mcp

# Copy your downloaded file (replace filename)
cp ~/Downloads/client_secret_XXXXX.json ~/.secure-gmail-mcp/credentials.json
```

### 4. Authenticate
```bash
npm run auth
```
Follow browser prompts to sign in and grant permissions.

### 5. Configure Claude Desktop

Find your Claude config file:
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%/Claude/claude_desktop_config.json`

Add this (update the path):
```json
{
  "mcpServers": {
    "secure-gmail": {
      "command": "node",
      "args": ["/absolute/path/to/gmail-mcp/dist/index.js"]
    }
  }
}
```

### 6. Restart Claude Desktop

Done! Try asking Claude: "Show me my latest emails"

## ❗ Troubleshooting

**Authentication failed?**
```bash
rm ~/.secure-gmail-mcp/token.json
npm run auth
```

**Claude can't connect?**
- Verify absolute path in config
- Restart Claude Desktop
- Check file exists: `ls dist/index.js`

**Need help?** Check the main README.md for detailed instructions.
