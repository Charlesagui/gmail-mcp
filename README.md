# Secure Gmail MCP Server

A secure Model Context Protocol (MCP) server for Gmail integration with Claude Desktop, featuring enhanced security and minimal dependencies.

[![Buy Me A Coffee](https://img.shields.io/badge/-buy_me_a%C2%A0coffee-gray?logo=buy-me-a-coffee)](https://coff.ee/aguiar843)

## 🔒 Security Features

- **Minimal OAuth Scopes**: Only essential Gmail permissions
- **Input Validation**: Complete sanitization of all inputs
- **Rate Limiting**: API abuse prevention (50 requests/minute)
- **Audit Logging**: All operations logged for security
- **Local Storage**: Credentials stored securely on your machine only
- **Email Validation**: Format verification for all email addresses

## 🚀 Quick Setup

### Prerequisites
- Node.js 18 or higher
- Google account with access to Google Cloud Console
- Claude Desktop application

### Installation Steps

1. **Clone and setup**:
```bash
git clone https://github.com/Charlesagui/gmail-mcp.git
cd gmail-mcp
npm install
npm run build
```

2. **Create Google Cloud Project & Credentials**:
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Create a new project or select existing one
   - Enable the Gmail API:
     - Navigate to "APIs & Services" → "Library"
     - Search for "Gmail API" and enable it
   - Create OAuth 2.0 credentials:
     - Go to "APIs & Services" → "Credentials"
     - Click "Create Credentials" → "OAuth client ID"
     - Choose "Desktop application"
     - Download the JSON file

3. **Setup credentials**:
```bash
# Create config directory
mkdir -p ~/.secure-gmail-mcp

# Copy your downloaded credentials file
cp /path/to/your/downloaded/client_secret_*.json ~/.secure-gmail-mcp/credentials.json
```

4. **Authenticate with Google**:
```bash
npm run auth
```
   - This will open a browser window
   - Sign in to your Google account
   - Grant permissions to the application
   - The authentication token will be saved automatically

5. **Configure Claude Desktop**:
   
   Edit your Claude Desktop configuration file:
   
   **On macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
   
   **On Windows**: `%APPDATA%/Claude/claude_desktop_config.json`   
   Add this configuration:
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

6. **Restart Claude Desktop** and verify the connection.

## 🛠️ Available Tools

The server provides these tools for Claude:

- **`search_emails`** - Search emails with Gmail query syntax (read-only)
- **`read_email`** - Read specific email content (read-only)  
- **`send_email`** - Send emails with security validation
- **`list_attachments`** - List email attachments (read-only)
- **`download_attachment`** - Download email attachments
- **`delete_email`** - Delete specific emails
- **`empty_spam`** - Empty spam folder

## 📊 Usage Examples

Once configured, you can ask Claude:

- "Search for emails from john@example.com in the last week"
- "Read the latest email from my boss"
- "Send an email to team@company.com about the meeting tomorrow"
- "Download the PDF attachment from the email about the contract"
- "Delete all emails in my spam folder"

## 🔐 Security & Privacy

- **No data collection**: All processing happens locally
- **Secure credentials**: OAuth tokens stored only on your machine
- **Audit trail**: All operations logged to `~/.secure-gmail-mcp/audit.log`
- **Minimal permissions**: Only Gmail read/write/modify access requested
- **Rate limiting**: Prevents API quota exhaustion

## 🛡️ File Structure

```
~/.secure-gmail-mcp/
├── credentials.json    # OAuth client credentials (you provide)
├── token.json         # Access token (generated after auth)
└── audit.log          # Operation logs
```

## 🔧 Configuration Scripts

- `npm run build` - Compile TypeScript to JavaScript
- `npm run auth` - Interactive OAuth setup
- `npm run auth-manual` - Manual token setup
- `npm start` - Start the MCP server
## ❗ Troubleshooting

### Authentication Issues
```bash
# Clear existing tokens and re-authenticate
rm ~/.secure-gmail-mcp/token.json
npm run auth
```

### Permission Denied Errors
- Ensure your Google Cloud project has Gmail API enabled
- Check that OAuth consent screen is configured
- Verify credentials.json is valid JSON

### Claude Desktop Connection Issues
- Confirm the absolute path in claude_desktop_config.json is correct
- Restart Claude Desktop after configuration changes
- Check Claude Desktop logs for error messages

### Rate Limiting
- The server limits to 50 requests per minute
- Wait before retrying if you hit limits
- Check audit.log for timing information

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Commit changes: `git commit -am 'Add feature'`
4. Push to branch: `git push origin feature-name`
5. Submit a Pull Request

## 📝 License

MIT License - see LICENSE file for details.

## 🆘 Support

If you encounter issues:

1. Check the troubleshooting section above
2. Review audit logs: `~/.secure-gmail-mcp/audit.log`
3. Ensure all prerequisites are met
4. Open an issue with detailed error information

## ☕ Support the Project

If this MCP server helps you, consider supporting its development:

[![Buy Me A Coffee](https://img.shields.io/badge/-buy_me_a%C2%A0coffee-gray?logo=buy-me-a-coffee)](https://coff.ee/aguiar843)

Your support helps maintain and improve this project!

---

**Note**: This server prioritizes security and privacy. All credentials remain on your local machine and are never transmitted to external services except Google's official APIs.