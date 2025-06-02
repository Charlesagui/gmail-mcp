#!/usr/bin/env node

/**
 * Gmail OAuth with Public Scope Only
 */

import { google } from 'googleapis';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

const CONFIG_DIR = path.join(os.homedir(), '.secure-gmail-mcp');
const CREDENTIALS_PATH = path.join(CONFIG_DIR, 'credentials.json');

// Only use public scope that doesn't require app verification
const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
];

async function main() {
  try {
    const credentialsContent = await fs.readFile(CREDENTIALS_PATH, 'utf8');
    const credentials = JSON.parse(credentialsContent);
    
    const { client_id, client_secret } = credentials.web || credentials.installed;
    
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

    console.log('🔑 GMAIL MCP AUTHENTICATION (PUBLIC SCOPE)');
    console.log('============================================');
    console.log('');
    console.log('⚠️  Using only READ-ONLY scope to avoid verification');
    console.log('');
    console.log('🌐 Copy this URL and paste it in your browser:');
    console.log('');
    console.log(authUrl);
    console.log('');
    console.log('📝 This will only allow reading emails, not sending.');
    console.log('');
    
  } catch (error: any) {
    console.error('Error:', error.message);
  }
}

main();
