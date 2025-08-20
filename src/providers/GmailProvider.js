import { BaseEmailProvider } from './BaseEmailProvider.js';

export class GmailProvider extends BaseEmailProvider {
  constructor(config) {
    super(config);
    this.accessToken = config.auth.accessToken;
    this.refreshToken = config.auth.refreshToken;
  }

  getCapabilities() {
    return {
      supportsThreading: true,
      supportsLabels: true,
      supportsFolders: true,
      supportsSearch: true,
      supportsRealTimeSync: true,
      supportsSending: true,
      supportsAttachments: true,
      maxAttachmentSize: 25 * 1024 * 1024 // 25MB
    };
  }

  async connect() {
    if (!this.accessToken) {
      throw new Error('Access token required for Gmail');
    }
    
    try {
      // Verify token by making a test request
      await this.makeGmailRequest('https://gmail.googleapis.com/gmail/v1/users/me/profile');
      this.isConnected = true;
    } catch (error) {
      if (this.refreshToken) {
        await this.refreshAccessToken();
        this.isConnected = true;
      } else {
        throw new Error('Invalid access token and no refresh token available');
      }
    }
  }

  async disconnect() {
    this.isConnected = false;
    this.accessToken = undefined;
  }

  async authenticate(credentials) {
    try {
      if (credentials?.accessToken) {
        this.accessToken = credentials.accessToken;
        this.refreshToken = credentials.refreshToken;
      }
      await this.connect();
      return true;
    } catch (error) {
      return false;
    }
  }

  async refreshAccessToken() {
    if (!this.refreshToken || !this.config.auth.clientId || !this.config.auth.clientSecret) {
      throw new Error('Refresh token or OAuth credentials missing');
    }

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: this.config.auth.clientId,
        client_secret: this.config.auth.clientSecret,
        refresh_token: this.refreshToken,
        grant_type: 'refresh_token'
      })
    });

    if (!response.ok) {
      throw new Error('Failed to refresh access token');
    }

    const data = await response.json();
    this.accessToken = data.access_token;
  }

  async makeGmailRequest(url, options = {}) {
    if (!this.accessToken) {
      throw new Error('Not authenticated');
    }

    const response = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
        ...options.headers
      }
    });

    if (response.status === 401 && this.refreshToken) {
      await this.refreshAccessToken();
      return this.makeGmailRequest(url, options);
    }

    if (!response.ok) {
      throw new Error(`Gmail API error: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  async getFolders() {
    const data = await this.makeGmailRequest('https://gmail.googleapis.com/gmail/v1/users/me/labels');
    
    return data.labels.map((label) => ({
      name: label.id,
      displayName: label.name,
      type: this.mapLabelType(label.id),
      unreadCount: parseInt(label.messagesUnread) || 0,
      totalCount: parseInt(label.messagesTotal) || 0
    }));
  }

  mapLabelType(labelId) {
    switch (labelId.toUpperCase()) {
      case 'INBOX': return 'inbox';
      case 'SENT': return 'sent';
      case 'DRAFT': return 'drafts';
      case 'TRASH': return 'trash';
      case 'SPAM': return 'spam';
      default: return 'custom';
    }
  }

  async getEmails(folder, limit = 50, offset = 0) {
    let query = `in:${folder}`;
    const params = new URLSearchParams({
      maxResults: limit.toString(),
      q: query
    });

    const data = await this.makeGmailRequest(`https://gmail.googleapis.com/gmail/v1/users/me/messages?${params}`);
    
    if (!data.messages) return [];

    const emailPromises = data.messages.map((message) =>
      this.getEmail(message.id, folder)
    );

    const emails = await Promise.all(emailPromises);
    return emails.filter(email => email !== null);
  }

  async getEmail(messageId, folder) {
    try {
      const data = await this.makeGmailRequest(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`
      );
      
      return this.parseGmailMessage(data, folder);
    } catch (error) {
      return null;
    }
  }

  parseGmailMessage(message, folder) {
    const headers = message.payload.headers;
    const getHeader = (name) => headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value;

    return {
      id: message.id,
      messageId: getHeader('Message-ID') || message.id,
      threadId: message.threadId,
      subject: getHeader('Subject') || '(No Subject)',
      from: this.parseGmailAddress(getHeader('From')),
      to: this.parseGmailAddresses(getHeader('To')),
      cc: this.parseGmailAddresses(getHeader('Cc')),
      bcc: this.parseGmailAddresses(getHeader('Bcc')),
      replyTo: this.parseGmailAddresses(getHeader('Reply-To')),
      date: new Date(parseInt(message.internalDate)),
      bodyText: this.extractTextFromPayload(message.payload, 'text/plain'),
      bodyHtml: this.extractTextFromPayload(message.payload, 'text/html'),
      attachments: this.extractAttachmentsFromPayload(message.payload),
      flags: {
        seen: !message.labelIds?.includes('UNREAD'),
        flagged: message.labelIds?.includes('STARRED') || false,
        draft: message.labelIds?.includes('DRAFT') || false,
        answered: false, // Gmail doesn't provide this directly
        deleted: message.labelIds?.includes('TRASH') || false
      },
      labels: message.labelIds || [],
      folder: folder || 'INBOX',
      provider: 'gmail',
      inReplyTo: getHeader('In-Reply-To'),
      references: this.parseReferences(getHeader('References')?.split(' '))
    };
  }

  parseGmailAddress(addressStr) {
    if (!addressStr) return { address: '' };
    
    const match = addressStr.match(/^(.+?)\s*<(.+)>$/) || addressStr.match(/^(.+)$/);
    if (!match) return { address: '' };
    
    if (match.length === 3) {
      return {
        name: match[1].trim().replace(/"/g, ''),
        address: match[2].trim()
      };
    }
    
    return { address: match[1].trim() };
  }

  parseGmailAddresses(addressStr) {
    if (!addressStr) return [];
    
    return addressStr.split(',').map(addr => this.parseGmailAddress(addr.trim()));
  }

  extractTextFromPayload(payload, mimeType) {
    if (payload.mimeType === mimeType && payload.body?.data) {
      return Buffer.from(payload.body.data, 'base64').toString('utf-8');
    }
    
    if (payload.parts) {
      for (const part of payload.parts) {
        const text = this.extractTextFromPayload(part, mimeType);
        if (text) return text;
      }
    }
    
    return '';
  }

  extractAttachmentsFromPayload(payload) {
    const attachments = [];
    
    const extractFromPart = (part) => {
      if (part.filename && part.body?.attachmentId) {
        attachments.push({
          filename: part.filename,
          contentType: part.mimeType,
          size: part.body.size || 0,
          attachmentId: part.body.attachmentId
        });
      }
      
      if (part.parts) {
        part.parts.forEach(extractFromPart);
      }
    };
    
    if (payload.parts) {
      payload.parts.forEach(extractFromPart);
    }
    
    return attachments;
  }

  async getThread(threadId) {
    try {
      const data = await this.makeGmailRequest(
        `https://gmail.googleapis.com/gmail/v1/users/me/threads/${threadId}?format=full`
      );
      
      const emails = data.messages.map((message) => this.parseGmailMessage(message));
      if (emails.length === 0) return null;
      
      const threads = this.buildThreads(emails);
      return threads[0] || null;
    } catch (error) {
      return null;
    }
  }

  async getThreads(folder, limit, offset) {
    const emails = await this.getEmails(folder, limit, offset);
    return this.buildThreads(emails);
  }

  async searchEmails(query) {
    let searchQuery = query.query || '';
    
    if (query.from) searchQuery += ` from:${query.from}`;
    if (query.to) searchQuery += ` to:${query.to}`;
    if (query.subject) searchQuery += ` subject:"${query.subject}"`;
    if (query.hasAttachment) searchQuery += ' has:attachment';
    if (query.isUnread) searchQuery += ' is:unread';
    if (query.isFlagged) searchQuery += ' is:starred';
    if (query.folder) searchQuery += ` in:${query.folder}`;

    const params = new URLSearchParams({
      q: searchQuery,
      maxResults: (query.limit || 50).toString()
    });

    const data = await this.makeGmailRequest(`https://gmail.googleapis.com/gmail/v1/users/me/messages?${params}`);
    
    if (!data.messages) return [];

    const emailPromises = data.messages.map((message) =>
      this.getEmail(message.id)
    );

    const emails = await Promise.all(emailPromises);
    return emails.filter(email => email !== null);
  }

  async searchThreads(query) {
    const emails = await this.searchEmails(query);
    return this.buildThreads(emails);
  }

  async markAsRead(messageIds, folder) {
    await this.updateLabels(messageIds, [], ['UNREAD']);
  }

  async markAsUnread(messageIds, folder) {
    await this.updateLabels(messageIds, ['UNREAD'], []);
  }

  async markAsFlagged(messageIds, folder) {
    await this.updateLabels(messageIds, ['STARRED'], []);
  }

  async markAsUnflagged(messageIds, folder) {
    await this.updateLabels(messageIds, [], ['STARRED']);
  }

  async updateLabels(messageIds, addLabelIds, removeLabelIds) {
    const batchRequest = {
      ids: messageIds,
      addLabelIds,
      removeLabelIds
    };

    await this.makeGmailRequest('https://gmail.googleapis.com/gmail/v1/users/me/messages/batchModify', {
      method: 'POST',
      body: JSON.stringify(batchRequest)
    });
  }

  async deleteEmails(messageIds, folder) {
    const batchRequest = { ids: messageIds };
    
    await this.makeGmailRequest('https://gmail.googleapis.com/gmail/v1/users/me/messages/batchDelete', {
      method: 'POST',
      body: JSON.stringify(batchRequest)
    });
  }

  async moveEmails(messageIds, fromFolder, toFolder) {
    await this.updateLabels(messageIds, [toFolder], [fromFolder]);
  }

  async sendEmail(options) {
    const email = this.buildMimeMessage(options);
    const encodedEmail = Buffer.from(email).toString('base64url');

    const data = await this.makeGmailRequest('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      body: JSON.stringify({ raw: encodedEmail })
    });

    return data.id;
  }

  buildMimeMessage(options) {
    const boundary = `----boundary_${Date.now()}`;
    let message = '';

    // Headers
    message += `From: ${this.config.auth.user}\r\n`;
    message += `To: ${options.to.map(addr => `${addr.name ? `"${addr.name}" ` : ''}<${addr.address}>`).join(', ')}\r\n`;
    
    if (options.cc?.length) {
      message += `Cc: ${options.cc.map(addr => `${addr.name ? `"${addr.name}" ` : ''}<${addr.address}>`).join(', ')}\r\n`;
    }
    
    if (options.bcc?.length) {
      message += `Bcc: ${options.bcc.map(addr => `${addr.name ? `"${addr.name}" ` : ''}<${addr.address}>`).join(', ')}\r\n`;
    }

    message += `Subject: ${options.subject}\r\n`;
    
    if (options.inReplyTo) {
      message += `In-Reply-To: ${options.inReplyTo}\r\n`;
    }
    
    if (options.references?.length) {
      message += `References: ${options.references.join(' ')}\r\n`;
    }

    message += `MIME-Version: 1.0\r\n`;
    message += `Content-Type: multipart/mixed; boundary="${boundary}"\r\n\r\n`;

    // Text content
    if (options.bodyText) {
      message += `--${boundary}\r\n`;
      message += `Content-Type: text/plain; charset=utf-8\r\n\r\n`;
      message += `${options.bodyText}\r\n\r\n`;
    }

    // HTML content
    if (options.bodyHtml) {
      message += `--${boundary}\r\n`;
      message += `Content-Type: text/html; charset=utf-8\r\n\r\n`;
      message += `${options.bodyHtml}\r\n\r\n`;
    }

    // Attachments
    if (options.attachments?.length) {
      for (const attachment of options.attachments) {
        message += `--${boundary}\r\n`;
        message += `Content-Type: ${attachment.contentType || 'application/octet-stream'}\r\n`;
        message += `Content-Disposition: attachment; filename="${attachment.filename}"\r\n`;
        message += `Content-Transfer-Encoding: base64\r\n\r\n`;
        
        const content = Buffer.isBuffer(attachment.content) 
          ? attachment.content 
          : Buffer.from(attachment.content);
        message += content.toString('base64') + '\r\n\r\n';
      }
    }

    message += `--${boundary}--\r\n`;
    return message;
  }

  async replyToEmail(originalMessageId, options) {
    const originalEmail = await this.getEmail(originalMessageId);
    if (!originalEmail) {
      throw new Error('Original email not found');
    }

    return this.sendEmail({
      to: [originalEmail.from],
      subject: `Re: ${originalEmail.subject}`,
      inReplyTo: originalEmail.messageId,
      references: [originalEmail.messageId, ...(originalEmail.references || [])],
      ...options
    });
  }

  async forwardEmail(originalMessageId, to, message) {
    const originalEmail = await this.getEmail(originalMessageId);
    if (!originalEmail) {
      throw new Error('Original email not found');
    }

    const forwardedContent = `
${message || ''}

---------- Forwarded message ---------
From: ${originalEmail.from.name ? `"${originalEmail.from.name}" ` : ''}<${originalEmail.from.address}>
Date: ${originalEmail.date.toLocaleString()}
Subject: ${originalEmail.subject}
To: ${originalEmail.to.map(addr => `${addr.name ? `"${addr.name}" ` : ''}<${addr.address}>`).join(', ')}

${originalEmail.bodyText || originalEmail.bodyHtml || ''}
    `;

    return this.sendEmail({
      to,
      subject: `Fwd: ${originalEmail.subject}`,
      bodyText: forwardedContent,
      attachments: originalEmail.attachments?.map(att => ({
        filename: att.filename,
        content: att.data,
        contentType: att.contentType
      }))
    });
  }

  async sync(folder) {
    // Gmail doesn't support IDLE, but we can implement polling
    // This would typically be handled by webhooks in a production environment
    console.log(`Sync not implemented for Gmail - use webhooks for real-time updates`);
  }
}