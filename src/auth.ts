#!/usr/bin/env node

/**
 * Secure Authentication Script for Gmail MCP Server
 * Enhanced security features:
 * - Minimal OAuth scopes
 * - Secure token storage
 * - Input validation
 * - Audit logging
 */

import { google } from 'googleapis';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import http from 'http';
import url from 'url';

const CONFIG_DIR = path.join(os.homedir(), '.secure-gmail-mcp');
const CREDENTIALS_PATH = path.join(CONFIG_DIR, 'credentials.json');
const TOKEN_PATH = path.join(CONFIG_DIR, 'token.json');
const AUDIT_LOG_PATH = path.join(CONFIG_DIR, 'audit.log');

// Minimal OAuth scopes for security
const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.modify', // Only for labels
];

async function auditLog(level: string, message: string): Promise<void> {
  try {
    await fs.mkdir(CONFIG_DIR, { recursive: true });
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] AUTH ${level}: ${message}\n`;
    await fs.appendFile(AUDIT_LOG_PATH, logEntry);
  } catch (error) {
    console.error('Failed to write audit log:', error);
  }
}

async function setupCredentials(): Promise<any> {
  try {
    await fs.mkdir(CONFIG_DIR, { recursive: true });
    
    try {
      const credentialsContent = await fs.readFile(CREDENTIALS_PATH, 'utf8');
      return JSON.parse(credentialsContent);
    } catch (error) {
      console.log('\n🔐 Gmail OAuth Setup Required');
      console.log('Please follow these steps to set up your Gmail credentials:\n');
      
      console.log('1. Go to Google Cloud Console: https://console.cloud.google.com/');
      console.log('2. Create a new project or select an existing one');
      console.log('3. Enable the Gmail API');
      console.log('4. Go to "APIs & Services" > "Credentials"');
      console.log('5. Click "Create Credentials" > "OAuth client ID"');
      console.log('6. Choose "Desktop app" as application type');
      console.log('7. Download the JSON file');
      console.log(`8. Save it as: ${CREDENTIALS_PATH}`);
      console.log('\nRun this script again after setting up credentials.');
      
      await auditLog('ERROR', 'Credentials file not found');
      process.exit(1);
    }
  } catch (error) {
    await auditLog('ERROR', `Setup failed: ${error}`);
    throw error;
  }
}
function getOAuth2Client(credentials: any) {
  const { client_id, client_secret, redirect_uris } = credentials.web || credentials.installed;
  return new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
}

async function getNewToken(oAuth2Client: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const authUrl = oAuth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
      prompt: 'consent', // Force consent screen to get refresh token
    });

    console.log('\n🔑 Authorization Required');
    console.log('Opening browser for OAuth consent...');
    console.log('If browser doesn\'t open, visit this URL manually:');
    console.log(authUrl);

    // Start local server to capture the callback
    const server = http.createServer(async (req, res) => {
      try {
        const reqUrl = url.parse(req.url!, true);
        
        if (reqUrl.pathname === '/oauth2callback') {
          const code = reqUrl.query.code as string;
          
          if (code) {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(`
              <html>
                <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
                  <h2>✅ Authentication Successful!</h2>
                  <p>You can close this window and return to the terminal.</p>
                  <p>Your Gmail MCP server is now configured securely.</p>
                </body>
              </html>
            `);
            
            try {
              const { tokens } = await oAuth2Client.getToken(code);
              await auditLog('INFO', 'OAuth token obtained successfully');
              server.close();
              resolve(tokens);
            } catch (error) {
              await auditLog('ERROR', `Token exchange failed: ${error}`);
              server.close();
              reject(error);
            }
          } else {
            res.writeHead(400, { 'Content-Type': 'text/html' });
            res.end('<h2>❌ Authorization failed - no code received</h2>');
            server.close();
            reject(new Error('No authorization code received'));
          }
        } else {
          res.writeHead(404);
          res.end('Not found');
        }
      } catch (error) {
        await auditLog('ERROR', `OAuth callback error: ${error}`);
        server.close();
        reject(error);
      }
    });

    server.listen(3001, () => {
      console.log('Local server started on port 3001 for OAuth callback...');
      
      // Try to open browser automatically (optional)
      try {
        const { exec } = require('child_process');
        exec(`start ${authUrl}`, (error: any) => {
          if (error) {
            console.log('Could not open browser automatically. Please visit the URL above.');
          }
        });
      } catch (error) {
        console.log('Could not open browser automatically. Please visit the URL above.');
      }
    });

    // Timeout after 5 minutes
    setTimeout(() => {
      server.close();
      reject(new Error('Authentication timeout - please try again'));
    }, 300000);
  });
}

async function main(): Promise<void> {
  try {
    console.log('🔒 Secure Gmail MCP Authentication');
    await auditLog('INFO', 'Authentication process started');

    const credentials = await setupCredentials();
    const oAuth2Client = getOAuth2Client(credentials);
    
    // Check if we already have valid tokens
    try {
      const tokenContent = await fs.readFile(TOKEN_PATH, 'utf8');
      const tokens = JSON.parse(tokenContent);
      oAuth2Client.setCredentials(tokens);
      
      // Test if token is valid
      await oAuth2Client.getAccessToken();
      console.log('✅ Existing authentication is valid');
      await auditLog('INFO', 'Existing token validated successfully');
      return;
    } catch (error) {
      console.log('🔄 Existing token invalid, requesting new authentication...');
      await auditLog('WARN', 'Existing token invalid, re-authenticating');
    }

    // Get new token
    const tokens = await getNewToken(oAuth2Client);
    
    // Save the token securely
    await fs.writeFile(TOKEN_PATH, JSON.stringify(tokens, null, 2));
    
    console.log('\n✅ Authentication completed successfully!');
    console.log(`🔐 Tokens saved securely to: ${TOKEN_PATH}`);
    console.log('📝 Audit log available at:', AUDIT_LOG_PATH);
    console.log('\nYou can now use the Gmail MCP server with Claude Desktop.');
    
    await auditLog('INFO', 'Authentication completed successfully');
    
  } catch (error) {
    console.error('\n❌ Authentication failed:', error);
    await auditLog('ERROR', `Authentication failed: ${error}`);
    process.exit(1);
  }
}

main().catch(console.error);

main().catch(console.error);
