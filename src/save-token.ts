#!/usr/bin/env node

/**
 * Save OAuth Token Script
 */

import { google } from 'googleapis';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

const CONFIG_DIR = path.join(os.homedir(), '.secure-gmail-mcp');
const CREDENTIALS_PATH = path.join(CONFIG_DIR, 'credentials.json');
const TOKEN_PATH = path.join(CONFIG_DIR, 'token.json');

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || !args[0]) {
    console.log('❌ Please provide the authorization code:');
    console.log('   npm run save-token YOUR_AUTHORIZATION_CODE');
    process.exit(1);
  }

  const authCode: string = args[0];

  try {
    const credentialsContent = await fs.readFile(CREDENTIALS_PATH, 'utf8');
    const credentials = JSON.parse(credentialsContent);
    
    const { client_id, client_secret } = credentials.web || credentials.installed;
    const oAuth2Client = new google.auth.OAuth2(
      client_id, 
      client_secret, 
      'http://localhost'
    );

    console.log('🔄 Exchanging authorization code for tokens...');
    const tokenResponse = await oAuth2Client.getToken(authCode);
    
    await fs.writeFile(TOKEN_PATH, JSON.stringify(tokenResponse.tokens, null, 2));
    
    console.log('✅ Authentication successful!');
    console.log(`🔐 Tokens saved to: ${TOKEN_PATH}`);
    console.log('');
    console.log('Your Gmail MCP server is now ready to use!');
    console.log('Run: npm run test');
    
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    console.log('');
    console.log('Make sure you:');
    console.log('1. Used the correct authorization code');
    console.log('2. The code is not expired');
    console.log('3. Try getting a new URL: npm run get-auth-url');
  }
}

main();
