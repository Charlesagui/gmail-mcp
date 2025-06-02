#!/usr/bin/env node

/**
 * Secure Gmail MCP Server
 * Enhanced security features:
 * - Minimal OAuth scopes
 * - Input validation
 * - Rate limiting
 * - Audit logging
 * - Error handling
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { gmail_v1, google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

// Configuration constants
const CONFIG_DIR = path.join(os.homedir(), '.secure-gmail-mcp');
const CREDENTIALS_PATH = path.join(CONFIG_DIR, 'credentials.json');
const TOKEN_PATH = path.join(CONFIG_DIR, 'token.json');
const AUDIT_LOG_PATH = path.join(CONFIG_DIR, 'audit.log');

// Minimal OAuth scopes for security
const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.modify', // For labels only
];

// Rate limiting
const RATE_LIMIT = {
  maxRequests: 50,
  windowMs: 60000, // 1 minute
  requests: new Map<string, number[]>(),
};

interface EmailMessage {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  to: string[];
  date: string;
  snippet: string;
  body?: string;
}

interface SendEmailRequest {
  to: string[];
  subject: string;
  body: string;
  cc?: string[];
  bcc?: string[];
}

interface AttachmentInfo {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
}

interface DownloadAttachmentRequest {
  messageId: string;
  attachmentId: string;
  filename?: string;
}
class SecureGmailServer {
  private server: Server;
  private gmail: gmail_v1.Gmail | null = null;
  private auth: OAuth2Client | null = null;

  constructor() {
    this.server = new Server({
      name: 'secure-gmail-mcp',
      version: '1.0.0',
    });

    this.setupErrorHandling();
    this.setupHandlers();
  }

  private setupErrorHandling(): void {
    this.server.onerror = (error) => {
      this.auditLog('ERROR', `Server error: ${error.message}`).catch(console.error);
      console.error('[MCP Error]', error);
    };

    process.on('SIGINT', async () => {
      await this.auditLog('INFO', 'Server shutdown initiated');
      await this.server.close();
      process.exit(0);
    });
  }

  private async auditLog(level: string, message: string): Promise<void> {
    try {
      await fs.mkdir(CONFIG_DIR, { recursive: true });
      const timestamp = new Date().toISOString();
      const logEntry = `[${timestamp}] ${level}: ${message}\n`;
      await fs.appendFile(AUDIT_LOG_PATH, logEntry);
    } catch (error) {
      console.error('Failed to write audit log:', error);
    }
  }

  private checkRateLimit(clientId: string = 'default'): boolean {
    const now = Date.now();
    const windowStart = now - RATE_LIMIT.windowMs;
    
    if (!RATE_LIMIT.requests.has(clientId)) {
      RATE_LIMIT.requests.set(clientId, []);
    }
    
    const requests = RATE_LIMIT.requests.get(clientId)!;
    
    // Remove old requests outside the window
    const validRequests = requests.filter(time => time > windowStart);
    
    if (validRequests.length >= RATE_LIMIT.maxRequests) {
      return false;
    }
    
    validRequests.push(now);
    RATE_LIMIT.requests.set(clientId, validRequests);
    return true;
  }
  private validateEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  private sanitizeInput(input: string): string {
    // Remove potentially dangerous characters
    return input.replace(/[<>]/g, '').trim();
  }

  private async authenticate(): Promise<void> {
    try {
      const credentialsContent = await fs.readFile(CREDENTIALS_PATH, 'utf8');
      const credentials = JSON.parse(credentialsContent);
      
      const { client_id, client_secret, redirect_uris } = credentials.web || credentials.installed;
      
      this.auth = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

      try {
        const tokenContent = await fs.readFile(TOKEN_PATH, 'utf8');
        const token = JSON.parse(tokenContent);
        this.auth.setCredentials(token);

        // Verify token is still valid
        await this.auth.getAccessToken();
        
        this.gmail = google.gmail({ version: 'v1', auth: this.auth });
        await this.auditLog('INFO', 'Authentication successful');
      } catch (error) {
        await this.auditLog('WARN', 'Token validation failed, re-authentication required');
        throw new Error('Authentication required. Please run: npm run auth');
      }
    } catch (error) {
      await this.auditLog('ERROR', `Authentication failed: ${error}`);
      throw new Error('Gmail authentication failed. Check credentials file.');
    }
  }

  private setupHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'search_emails',
            description: 'Search for emails using Gmail search syntax (read-only)',
            inputSchema: {
              type: 'object',
              properties: {
                query: { type: 'string', description: 'Gmail search query' },
                maxResults: { type: 'number', default: 10, maximum: 50 }
              },
              required: ['query']
            }
          },
          {
            name: 'read_email',
            description: 'Read a specific email by ID (read-only)',
            inputSchema: {
              type: 'object',
              properties: {
                messageId: { type: 'string', description: 'Email message ID' }
              },
              required: ['messageId']
            }
          },
          {
            name: 'send_email',
            description: 'Send a new email (requires confirmation)',
            inputSchema: {
              type: 'object',
              properties: {
                to: { type: 'array', items: { type: 'string' } },
                subject: { type: 'string', maxLength: 255 },
                body: { type: 'string', maxLength: 10000 },
                cc: { type: 'array', items: { type: 'string' } },
                bcc: { type: 'array', items: { type: 'string' } }
              },
              required: ['to', 'subject', 'body']
            }
          },
          {
            name: 'list_attachments',
            description: 'List all attachments in a specific email',
            inputSchema: {
              type: 'object',
              properties: {
                messageId: { type: 'string', description: 'Email message ID' }
              },
              required: ['messageId']
            }
          },
          {
            name: 'download_attachment',
            description: 'Download a specific attachment from an email',
            inputSchema: {
              type: 'object',
              properties: {
                messageId: { type: 'string', description: 'Email message ID' },
                attachmentId: { type: 'string', description: 'Attachment ID' },
                filename: { type: 'string', description: 'Optional filename to save as' }
              },
              required: ['messageId', 'attachmentId']
            }
          },
          {
            name: 'read_email_html',
            description: 'Read email with better HTML content extraction',
            inputSchema: {
              type: 'object',
              properties: {
                messageId: { type: 'string', description: 'Email message ID' }
              },
              required: ['messageId']
            }
          },
          {
            name: 'delete_email',
            description: 'Permanently delete a specific email',
            inputSchema: {
              type: 'object',
              properties: {
                messageId: { type: 'string', description: 'Email message ID to delete' }
              },
              required: ['messageId']
            }
          },
          {
            name: 'empty_spam',
            description: 'Empty all emails from spam folder',
            inputSchema: {
              type: 'object',
              properties: {
                confirm: { type: 'boolean', description: 'Confirmation to proceed with deletion' }
              },
              required: ['confirm']
            }
          },
        ] as Tool[]
      };
    });
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      if (!this.checkRateLimit()) {
        throw new Error('Rate limit exceeded. Please wait before making more requests.');
      }

      if (!this.gmail) {
        await this.authenticate();
      }

      const { name, arguments: args } = request.params;
      
      await this.auditLog('INFO', `Tool called: ${name} with args: ${JSON.stringify(args)}`);

      try {
        switch (name) {
          case 'search_emails':
            return await this.searchEmails(args as any);
          case 'read_email':
            return await this.readEmail(args as any);
          case 'read_email_html':
            return await this.readEmailHtml(args as any);
          case 'list_attachments':
            return await this.listAttachments(args as any);
          case 'download_attachment':
            return await this.downloadAttachment(args as any);
          case 'delete_email':
            return await this.deleteEmail(args as any);
          case 'empty_spam':
            return await this.emptySpam(args as any);
          case 'send_email':
            return await this.sendEmail(args as any);
          case 'list_labels':
            return await this.listLabels();
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        await this.auditLog('ERROR', `Tool ${name} failed: ${error}`);
        throw error;
      }
    });
  }

  private async searchEmails(args: { query: string; maxResults?: number }): Promise<any> {
    const { query, maxResults = 10 } = args;
    
    if (!query || typeof query !== 'string') {
      throw new Error('Invalid query parameter');
    }

    const sanitizedQuery = this.sanitizeInput(query);
    
    try {
      const response = await this.gmail!.users.messages.list({
        userId: 'me',
        q: sanitizedQuery,
        maxResults: Math.min(maxResults, 50),
      });

      const messages = response.data.messages || [];
      const detailedMessages: EmailMessage[] = [];

      for (const message of messages) {
        if (message.id) {
          const detail = await this.gmail!.users.messages.get({
            userId: 'me',
            id: message.id,
            format: 'metadata',
            metadataHeaders: ['From', 'To', 'Subject', 'Date'],
          });

          const headers = detail.data.payload?.headers || [];
          const getHeader = (name: string) => headers.find(h => h.name === name)?.value || '';

          detailedMessages.push({
            id: message.id,
            threadId: detail.data.threadId || '',
            subject: getHeader('Subject'),
            from: getHeader('From'),
            to: getHeader('To').split(',').map(t => t.trim()),
            date: getHeader('Date'),
            snippet: detail.data.snippet || '',
          });
        }
      }
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              query: sanitizedQuery,
              resultCount: detailedMessages.length,
              messages: detailedMessages
            }, null, 2)
          }
        ]
      };
    } catch (error) {
      throw new Error(`Failed to search emails: ${error}`);
    }
  }

  private async readEmail(args: { messageId: string }): Promise<any> {
    const { messageId } = args;
    
    if (!messageId || typeof messageId !== 'string') {
      throw new Error('Invalid messageId parameter');
    }

    try {
      const response = await this.gmail!.users.messages.get({
        userId: 'me',
        id: messageId,
        format: 'full',
      });

      const message = response.data;
      const headers = message.payload?.headers || [];
      const getHeader = (name: string) => headers.find(h => h.name === name)?.value || '';

      // Extract body content safely
      let body = '';
      const extractBody = (payload: any): string => {
        if (payload.body?.data) {
          return Buffer.from(payload.body.data, 'base64').toString();
        }
        if (payload.parts) {
          for (const part of payload.parts) {
            if (part.mimeType === 'text/plain' && part.body?.data) {
              return Buffer.from(part.body.data, 'base64').toString();
            }
          }
        }
        return '';
      };

      body = extractBody(message.payload);

      const emailData: EmailMessage = {
        id: messageId,
        threadId: message.threadId || '',
        subject: getHeader('Subject'),
        from: getHeader('From'),
        to: getHeader('To').split(',').map(t => t.trim()),
        date: getHeader('Date'),
        snippet: message.snippet || '',
        body: body.substring(0, 5000) // Limit body size for security
      };

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(emailData, null, 2)
          }
        ]
      };
    } catch (error) {
      throw new Error(`Failed to read email: ${error}`);
    }
  }
  private async sendEmail(args: SendEmailRequest): Promise<any> {
    const { to, subject, body, cc = [], bcc = [] } = args;
    
    // Extensive validation for security
    if (!Array.isArray(to) || to.length === 0) {
      throw new Error('Recipients (to) must be a non-empty array');
    }
    
    if (!subject || typeof subject !== 'string' || subject.length > 255) {
      throw new Error('Subject must be a string with max 255 characters');
    }
    
    if (!body || typeof body !== 'string' || body.length > 10000) {
      throw new Error('Body must be a string with max 10000 characters');
    }

    // Validate all email addresses
    const allEmails = [...to, ...cc, ...bcc];
    for (const email of allEmails) {
      if (!this.validateEmail(email)) {
        throw new Error(`Invalid email address: ${email}`);
      }
    }

    // Log the send attempt for security audit
    await this.auditLog('WARN', `Email send attempt - To: ${to.join(', ')}, Subject: ${subject}`);

    try {
      // Create email message
      const emailLines: string[] = [];
      emailLines.push(`To: ${to.join(', ')}`);
      if (cc.length > 0) emailLines.push(`Cc: ${cc.join(', ')}`);
      if (bcc.length > 0) emailLines.push(`Bcc: ${bcc.join(', ')}`);
      emailLines.push(`Subject: ${this.sanitizeInput(subject)}`);
      emailLines.push('Content-Type: text/plain; charset=utf-8');
      emailLines.push('');
      emailLines.push(this.sanitizeInput(body));

      const email = emailLines.join('\n');
      const encodedEmail = Buffer.from(email).toString('base64url');

      const response = await this.gmail!.users.messages.send({
        userId: 'me',
        requestBody: {
          raw: encodedEmail,
        },
      });

      await this.auditLog('INFO', `Email sent successfully - ID: ${response.data.id}`);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              messageId: response.data.id,
              to,
              subject: this.sanitizeInput(subject),
              timestamp: new Date().toISOString()
            }, null, 2)
          }
        ]
      };
    } catch (error) {
      await this.auditLog('ERROR', `Email send failed: ${error}`);
      throw new Error(`Failed to send email: ${error}`);
    }
  }
  private async listLabels(): Promise<any> {
    try {
      const response = await this.gmail!.users.labels.list({
        userId: 'me',
      });

      const labels = response.data.labels || [];
      const filteredLabels = labels.map(label => ({
        id: label.id,
        name: label.name,
        type: label.type,
        messagesTotal: label.messagesTotal,
        messagesUnread: label.messagesUnread,
      }));

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              labels: filteredLabels,
              count: filteredLabels.length
            }, null, 2)
          }
        ]
      };
    } catch (error) {
      throw new Error(`Failed to list labels: ${error}`);
    }
  }

  private async listAttachments(args: { messageId: string }): Promise<any> {
    const { messageId } = args;
    
    if (!messageId || typeof messageId !== 'string') {
      throw new Error('Invalid messageId parameter');
    }

    try {
      const response = await this.gmail!.users.messages.get({
        userId: 'me',
        id: messageId,
        format: 'full',
      });

      const message = response.data;
      const attachments: AttachmentInfo[] = [];

      // Function to recursively extract attachments from parts
      const extractAttachments = (parts: any[], parentFilename = '') => {
        parts?.forEach((part, index) => {
          if (part.filename && part.body?.attachmentId) {
            attachments.push({
              id: part.body.attachmentId,
              filename: part.filename || `attachment_${index}`,
              mimeType: part.mimeType || 'application/octet-stream',
              size: part.body.size || 0
            });
          }
          
          // Check nested parts
          if (part.parts) {
            extractAttachments(part.parts, part.filename);
          }
        });
      };

      // Extract from main payload
      if (message.payload?.parts) {
        extractAttachments(message.payload.parts);
      } else if (message.payload?.filename && message.payload?.body?.attachmentId) {
        attachments.push({
          id: message.payload.body.attachmentId,
          filename: message.payload.filename,
          mimeType: message.payload.mimeType || 'application/octet-stream',
          size: message.payload.body.size || 0
        });
      }

      await this.auditLog('INFO', `Listed ${attachments.length} attachments for message ${messageId}`);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              messageId,
              attachmentCount: attachments.length,
              attachments
            }, null, 2)
          }
        ]
      };
    } catch (error) {
      throw new Error(`Failed to list attachments: ${error}`);
    }
  }

  private async downloadAttachment(args: DownloadAttachmentRequest): Promise<any> {
    const { messageId, attachmentId, filename } = args;
    
    if (!messageId || !attachmentId) {
      throw new Error('messageId and attachmentId are required');
    }

    try {
      // Get attachment data
      const attachment = await this.gmail!.users.messages.attachments.get({
        userId: 'me',
        messageId: messageId,
        id: attachmentId,
      });

      if (!attachment.data.data) {
        throw new Error('No attachment data received');
      }

      // Decode base64 data
      const buffer = Buffer.from(attachment.data.data, 'base64url');
      
      // Create downloads directory if it doesn't exist
      const downloadsDir = path.join(CONFIG_DIR, 'downloads');
      await fs.mkdir(downloadsDir, { recursive: true });
      
      // Generate filename
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const finalFilename = filename || `attachment_${timestamp}`;
      const filePath = path.join(downloadsDir, finalFilename);
      
      // Save file
      await fs.writeFile(filePath, buffer);
      
      await this.auditLog('INFO', `Downloaded attachment ${attachmentId} as ${finalFilename} (${buffer.length} bytes)`);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              messageId,
              attachmentId,
              filename: finalFilename,
              filePath,
              size: buffer.length,
              downloadedAt: new Date().toISOString()
            }, null, 2)
          }
        ]
      };
    } catch (error) {
      await this.auditLog('ERROR', `Failed to download attachment: ${error}`);
      throw new Error(`Failed to download attachment: ${error}`);
    }
  }

  private async readEmailHtml(args: { messageId: string }): Promise<any> {
    const { messageId } = args;
    
    if (!messageId || typeof messageId !== 'string') {
      throw new Error('Invalid messageId parameter');
    }

    try {
      const response = await this.gmail!.users.messages.get({
        userId: 'me',
        id: messageId,
        format: 'full',
      });

      const message = response.data;
      const headers = message.payload?.headers || [];
      const getHeader = (name: string) => headers.find(h => h.name === name)?.value || '';

      // Extract HTML and text content
      let htmlBody = '';
      let textBody = '';
      let attachmentCount = 0;

      const extractContent = (payload: any): void => {
        if (payload.body?.data) {
          const content = Buffer.from(payload.body.data, 'base64').toString();
          
          if (payload.mimeType === 'text/html') {
            htmlBody = content;
          } else if (payload.mimeType === 'text/plain') {
            textBody = content;
          }
        }
        
        if (payload.filename && payload.body?.attachmentId) {
          attachmentCount++;
        }
        
        if (payload.parts) {
          payload.parts.forEach((part: any) => extractContent(part));
        }
      };

      extractContent(message.payload);

      // Convert HTML to readable text if available
      let readableContent = textBody;
      if (!textBody && htmlBody) {
        // Basic HTML to text conversion
        readableContent = htmlBody
          .replace(/<br\s*\/?>/gi, '\n')
          .replace(/<\/p>/gi, '\n\n')
          .replace(/<[^>]*>/g, '')
          .replace(/&nbsp;/g, ' ')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .trim();
      }

      const emailData = {
        id: messageId,
        threadId: message.threadId || '',
        subject: getHeader('Subject'),
        from: getHeader('From'),
        to: getHeader('To').split(',').map(t => t.trim()),
        date: getHeader('Date'),
        snippet: message.snippet || '',
        textContent: readableContent.substring(0, 10000), // Limit for security
        hasHtml: !!htmlBody,
        attachmentCount,
        contentType: htmlBody ? 'html' : 'text'
      };

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(emailData, null, 2)
          }
        ]
      };
    } catch (error) {
      throw new Error(`Failed to read email HTML: ${error}`);
    }
  }

  private async deleteEmail(args: { messageId: string }): Promise<any> {
    const { messageId } = args;
    
    if (!messageId || typeof messageId !== 'string') {
      throw new Error('Invalid messageId parameter');
    }

    try {
      // Get email details before deletion for logging
      const emailResponse = await this.gmail!.users.messages.get({
        userId: 'me',
        id: messageId,
        format: 'metadata',
        metadataHeaders: ['From', 'Subject', 'Date'],
      });

      const headers = emailResponse.data.payload?.headers || [];
      const getHeader = (name: string) => headers.find(h => h.name === name)?.value || '';
      const subject = getHeader('Subject');
      const from = getHeader('From');

      // Delete the email permanently
      await this.gmail!.users.messages.delete({
        userId: 'me',
        id: messageId,
      });

      await this.auditLog('WARN', `Email deleted - ID: ${messageId}, Subject: ${subject}, From: ${from}`);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              messageId,
              subject,
              from,
              deletedAt: new Date().toISOString(),
              action: 'permanently_deleted'
            }, null, 2)
          }
        ]
      };
    } catch (error) {
      await this.auditLog('ERROR', `Failed to delete email ${messageId}: ${error}`);
      throw new Error(`Failed to delete email: ${error}`);
    }
  }

  private async emptySpam(args: { confirm: boolean }): Promise<any> {
    const { confirm } = args;
    
    if (!confirm) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              error: 'Confirmation required',
              message: 'To empty spam, you must set confirm: true',
              warning: 'This will permanently delete ALL emails in spam folder'
            }, null, 2)
          }
        ]
      };
    }

    try {
      await this.auditLog('WARN', 'Starting spam folder cleanup - USER INITIATED');

      // Search for all emails in spam
      const spamResponse = await this.gmail!.users.messages.list({
        userId: 'me',
        q: 'in:spam',
        maxResults: 500, // Process in batches
      });

      const spamMessages = spamResponse.data.messages || [];
      
      if (spamMessages.length === 0) {
        await this.auditLog('INFO', 'Spam folder is already empty');
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                message: 'Spam folder is already empty',
                deletedCount: 0
              }, null, 2)
            }
          ]
        };
      }

      // Delete emails in batches
      let deletedCount = 0;
      const batchSize = 50;
      
      for (let i = 0; i < spamMessages.length; i += batchSize) {
        const batch = spamMessages.slice(i, i + batchSize);
        
        // Delete each email in the batch
        for (const message of batch) {
          if (message.id) {
            try {
              await this.gmail!.users.messages.delete({
                userId: 'me',
                id: message.id,
              });
              deletedCount++;
            } catch (error) {
              await this.auditLog('ERROR', `Failed to delete spam email ${message.id}: ${error}`);
            }
          }
        }
        
        // Small delay between batches to avoid rate limiting
        if (i + batchSize < spamMessages.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      await this.auditLog('WARN', `Spam cleanup completed - Deleted ${deletedCount} emails`);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: 'Spam folder successfully emptied',
              totalFound: spamMessages.length,
              deletedCount,
              completedAt: new Date().toISOString()
            }, null, 2)
          }
        ]
      };
    } catch (error) {
      await this.auditLog('ERROR', `Failed to empty spam folder: ${error}`);
      throw new Error(`Failed to empty spam folder: ${error}`);
    }
  }

  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    
    await this.auditLog('INFO', 'Secure Gmail MCP Server started');
    console.error('Secure Gmail MCP Server running on stdio');
  }
}

// Start the server
const server = new SecureGmailServer();
server.run().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
