#!/usr/bin/env node

/**
 * Simplified Authentication Script for Gmail MCP Server
 * Manual OAuth flow without local server
 */

import { google } from 'googleapis';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import readline from 'readline';

const CONFIG_DIR = path.join(os.homedir(), '.secure-gmail-mcp');
const CREDENTIALS_PATH = path.join(CONFIG_DIR, 'credentials.json');
const TOKEN_PATH = path.join(CONFIG_DIR, 'token.json');
const AUDIT_LOG_PATH = path.join(CONFIG_DIR, 'audit.log');

// Minimal OAuth scopes for security
const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.modify',
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

function getOAuth2Client(credentials: any) {
  const { client_id, client_secret, redirect_uris } = credentials.web || credentials.installed;
  return new google.auth.OAuth2(client_id, client_secret, 'urn:ietf:wg:oauth:2.0:oob');
}

async function getNewTokenManual(oAuth2Client: any): Promise<any> {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
  });

  console.log('\n🔑 Manual Authorization Required');
  console.log('Visit this URL in your browser:');
  console.log('\n' + authUrl + '\n');
  console.log('After authorization, you will get an authorization code.');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve, reject) => {
    rl.question('Enter the authorization code here: ', async (code) => {
      rl.close();
      try {
        const { tokens } = await oAuth2Client.getToken(code);
        await auditLog('INFO', 'OAuth token obtained successfully (manual)');
        resolve(tokens);
      } catch (error) {
        await auditLog('ERROR', `Token exchange failed: ${error}`);
        reject(error);
      }
    });
  });
}

async function main(): Promise<void> {
  try {
    console.log('🔒 Secure Gmail MCP Authentication (Manual Mode)');
    await auditLog('INFO', 'Manual authentication process started');

    // Read credentials
    const credentialsContent = await fs.readFile(CREDENTIALS_PATH, 'utf8');
    const credentials = JSON.parse(credentialsContent);
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

    // Get new token manually
    const tokens = await getNewTokenManual(oAuth2Client);
    
    // Save the token securely
    await fs.writeFile(TOKEN_PATH, JSON.stringify(tokens, null, 2));
    
    console.log('\n✅ Authentication completed successfully!');
    console.log(`🔐 Tokens saved securely to: ${TOKEN_PATH}`);
    console.log('📝 Audit log available at:', AUDIT_LOG_PATH);
    console.log('\nYou can now use the Gmail MCP server with Claude Desktop.');
    
    await auditLog('INFO', 'Manual authentication completed successfully');
    
  } catch (error) {
    console.error('\n❌ Authentication failed:', error);
    await auditLog('ERROR', `Manual authentication failed: ${error}`);
    process.exit(1);
  }
}

main().catch(console.error);
