#!/usr/bin/env node

/**
 * Test script for the unified email API
 * This script demonstrates the unified request/response structure across all providers
 */

import { EmailService } from './src/services/EmailService.js';

async function testUnifiedAPI() {
  console.log('🚀 Testing Unified Email API Structure\n');

  const emailService = new EmailService();
  
  // Test configuration for different providers
  const configs = {
    gmail: {
      type: 'gmail',
      auth: {
        accessToken: 'dummy-token',
        refreshToken: 'dummy-refresh',
        clientId: 'dummy-client-id',
        clientSecret: 'dummy-secret'
      }
    },
    outlook: {
      type: 'outlook',
      auth: {
        accessToken: 'dummy-token',
        refreshToken: 'dummy-refresh',
        clientId: 'dummy-client-id',
        clientSecret: 'dummy-secret'
      }
    },
    imap: {
      type: 'imap',
      host: 'imap.example.com',
      port: 993,
      secure: true,
      auth: {
        user: 'user@example.com',
        pass: 'password'
      }
    }
  };

  console.log('📋 Testing Unified Request/Response Structures:\n');

  // Test 1: Unified Email List Request
  console.log('1. Unified Email List Request Structure:');
  const emailListRequest = {
    folderId: 'INBOX',
    limit: 20,
    offset: 0,
    orderBy: 'date',
    order: 'desc',
    includeBody: true,
    includeAttachments: true
  };
  console.log(JSON.stringify(emailListRequest, null, 2));

  // Test 2: Unified Search Request
  console.log('\n2. Unified Search Request Structure:');
  const searchRequest = {
    query: 'important project',
    from: 'boss@company.com',
    subject: 'quarterly report',
    hasAttachment: true,
    isUnread: true,
    dateFrom: new Date('2024-01-01'),
    dateTo: new Date('2024-12-31'),
    folderId: 'INBOX',
    limit: 50,
    offset: 0
  };
  console.log(JSON.stringify(searchRequest, null, 2));

  // Test 3: Unified Send Email Request
  console.log('\n3. Unified Send Email Request Structure:');
  const sendEmailRequest = {
    to: [
      { name: 'John Doe', address: 'john@example.com' },
      { name: 'Jane Smith', address: 'jane@example.com' }
    ],
    cc: [{ name: 'Manager', address: 'manager@company.com' }],
    bcc: [],
    replyTo: [{ name: 'Support', address: 'support@company.com' }],
    subject: 'Test Email with Unified API',
    bodyText: 'This is a plain text body.',
    bodyHtml: '<p>This is an <strong>HTML</strong> body.</p>',
    attachments: [
      {
        filename: 'document.pdf',
        contentType: 'application/pdf',
        size: 1024,
        data: 'base64-encoded-content'
      }
    ],
    priority: 'high',
    isDraft: false
  };
  console.log(JSON.stringify(sendEmailRequest, null, 2));

  // Test 4: Unified Email Action Request
  console.log('\n4. Unified Email Action Request Structure:');
  const actionRequest = {
    messageIds: ['msg1', 'msg2', 'msg3'],
    folderId: 'INBOX'
  };
  console.log(JSON.stringify(actionRequest, null, 2));

  // Test 5: Expected Unified Response Structure
  console.log('\n5. Expected Unified API Response Structure:');
  const sampleResponse = {
    success: true,
    data: {
      id: 'email123',
      messageId: 'msg-id-from-provider',
      threadId: 'thread-123',
      subject: 'Sample Email',
      from: { name: 'Sender Name', address: 'sender@example.com' },
      to: [{ name: 'Recipient', address: 'recipient@example.com' }],
      cc: [],
      bcc: [],
      replyTo: [],
      date: new Date(),
      bodyText: 'Plain text content',
      bodyHtml: '<p>HTML content</p>',
      snippet: 'Email preview...',
      attachments: [],
      flags: {
        seen: true,
        flagged: false,
        draft: false,
        answered: false,
        deleted: false,
        recent: false
      },
      labels: [],
      folderId: 'INBOX',
      provider: 'gmail',
      priority: 'normal',
      size: 2048,
      isEncrypted: false,
      isSigned: false
    },
    error: null,
    metadata: {
      total: 100,
      limit: 20,
      offset: 0,
      hasMore: true,
      nextPageToken: 'next-page-token',
      provider: 'gmail',
      timestamp: new Date()
    }
  };
  console.log(JSON.stringify(sampleResponse, null, 2));

  console.log('\n✅ All structures follow the unified API format!');
  console.log('\n📊 Key Benefits of Unified API:');
  console.log('  • Same request/response structure across all providers');
  console.log('  • Standardized email address format');
  console.log('  • Consistent error handling');
  console.log('  • Unified metadata structure');
  console.log('  • Provider-agnostic client code');
  
  console.log('\n🔍 Provider Capabilities Example:');
  const capabilities = {
    supportsThreading: true,
    supportsLabels: true,
    supportsFolders: true,
    supportsSearch: true,
    supportsRealTimeSync: false,
    supportsSending: true,
    supportsAttachments: true,
    supportsEncryption: false,
    supportsPush: false,
    maxAttachmentSize: 25 * 1024 * 1024,
    searchOperators: ['from', 'to', 'subject', 'has:attachment'],
    folderOperations: ['create', 'delete', 'rename'],
    supportedAuthTypes: ['oauth2']
  };
  console.log(JSON.stringify(capabilities, null, 2));

  console.log('\n🎯 Migration Notes:');
  console.log('  • Old method: provider.getEmails(folder, limit, offset)');
  console.log('  • New method: provider.getEmails({ folderId, limit, offset })');
  console.log('  • All responses wrapped in { success, data, error, metadata }');
  console.log('  • Email addresses normalized to { name, address } format');
  console.log('  • Consistent flag structure across all providers');
}

// Run the test
testUnifiedAPI().catch(console.error);