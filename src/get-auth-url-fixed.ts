#!/usr/bin/env node

/**
 * Fixed URL Generator for Gmail OAuth
 */

import { google } from 'googleapis';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

const CONFIG_DIR = path.join(os.homedir(), '.secure-gmail-mcp');
const CREDENTIALS_PATH = path.join(CONFIG_DIR, 'credentials.json');

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.modify',
];

async function main() {
  try {
    const credentialsContent = await fs.readFile(CREDENTIALS_PATH, 'utf8');
    const credentials = JSON.parse(credentialsContent);
    
    const { client_id, client_secret } = credentials.web || credentials.installed;
    
    // Use localhost redirect URI that's already configured
    const oAuth2Client = new google.auth.OAuth2(
      client_id, 
      client_secret, 
      'http://localhost'
    );

    const authUrl = oAuth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
      prompt: 'consent',
    });

    console.log('🔑 GMAIL MCP AUTHENTICATION (FIXED)');
    console.log('=========================================');
    console.log('');
    console.log('🌐 Copy this URL and paste it in your browser:');
    console.log('');
    console.log(authUrl);
    console.log('');
    console.log('📝 STEPS:');
    console.log('1. Visit the URL above');
    console.log('2. Authorize access to Gmail');
    console.log('3. You will be redirected to localhost (this will fail - that\'s OK!)');
    console.log('4. From the URL bar, copy the "code=" parameter');
    console.log('5. Run: npm run save-token YOUR_CODE');
    console.log('');
    console.log('✅ Using redirect URI: http://localhost');
    
  } catch (error: any) {
    console.error('Error:', error.message);
  }
}

main();
