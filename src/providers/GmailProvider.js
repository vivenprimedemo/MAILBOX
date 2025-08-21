import { BaseEmailProvider } from './BaseEmailProvider.js';
import { normalizeEmailAddress } from '../interfaces/EmailInterfaces.js';

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

  async getFolders(request = {}) {
    try {
      const data = await this.makeGmailRequest('https://gmail.googleapis.com/gmail/v1/users/me/labels');
      
      const folders = data.labels.map((label) => ({
        id: label.id,
        name: label.id,
        displayName: label.name,
        type: this.mapLabelType(label.id),
        unreadCount: parseInt(label.messagesUnread) || 0,
        totalCount: parseInt(label.messagesTotal) || 0,
        parentId: null,
        children: [],
        isSystem: ['INBOX', 'SENT', 'DRAFT', 'TRASH', 'SPAM'].includes(label.id.toUpperCase()),
        canDelete: label.type === 'user',
        canRename: label.type === 'user'
      }));

      return this.createSuccessResponse(folders, {
        total: folders.length,
        limit: folders.length,
        offset: 0,
        hasMore: false
      });
    } catch (error) {
      return this.createErrorResponse('FETCH_FOLDERS_ERROR', error.message, error);
    }
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

  async getEmails(request) {
    try {
      const { folderId = 'INBOX', limit = 50, offset = 0, orderBy = 'date', order = 'desc' } = request;
      
      let query = `in:${folderId}`;
      const params = new URLSearchParams({
        maxResults: limit.toString(),
        q: query
      });

      const data = await this.makeGmailRequest(`https://gmail.googleapis.com/gmail/v1/users/me/messages?${params}`);
      
      if (!data.messages) {
        return this.createSuccessResponse([], {
          total: 0,
          limit,
          offset,
          hasMore: false
        });
      }

      const emailPromises = data.messages.slice(offset, offset + limit).map((message) =>
        this.getEmail(message.id, folderId)
      );

      const emailResults = await Promise.all(emailPromises);
      const emails = emailResults.filter(result => result.success).map(result => result.data);
      
      return this.createSuccessResponse(emails, {
        total: data.resultSizeEstimate || emails.length,
        limit,
        offset,
        hasMore: data.messages.length > offset + limit,
        nextPageToken: data.nextPageToken
      });
    } catch (error) {
      return this.createErrorResponse('FETCH_EMAILS_ERROR', error.message, error);
    }
  }

  async listEmails(request) {
    try {
      const {
        folderId = 'INBOX',
        limit = 50,
        offset = 0,
        sortBy = 'date',
        sortOrder = 'desc',
        search = '',
        isUnread,
        isFlagged,
        hasAttachment,
        from,
        to,
        subject,
        dateFrom,
        dateTo
      } = request;

      // Build Gmail search query
      let query = `in:${folderId}`;
      
      // Add search text
      if (search) {
        query += ` ${search}`;
      }
      
      // Add filters
      if (from) query += ` from:${from}`;
      if (to) query += ` to:${to}`;
      if (subject) query += ` subject:"${subject}"`;
      if (hasAttachment) query += ' has:attachment';
      if (isUnread === true) query += ' is:unread';
      if (isUnread === false) query += ' -is:unread';
      if (isFlagged === true) query += ' is:starred';
      if (isFlagged === false) query += ' -is:starred';
      
      // Add date filters
      if (dateFrom) {
        const fromStr = dateFrom.toISOString().split('T')[0];
        query += ` after:${fromStr}`;
      }
      if (dateTo) {
        const toStr = dateTo.toISOString().split('T')[0];
        query += ` before:${toStr}`;
      }

      const params = new URLSearchParams({
        maxResults: limit.toString(),
        q: query
      });

      const data = await this.makeGmailRequest(`https://gmail.googleapis.com/gmail/v1/users/me/messages?${params}`);
      
      if (!data.messages) {
        return this.createSuccessResponse([], {
          total: 0,
          limit,
          offset,
          hasMore: false,
          currentPage: Math.floor(offset / limit) + 1,
          totalPages: 0,
          nextOffset: null
        });
      }

      // Apply offset manually since Gmail doesn't support native offset
      const messagesToFetch = data.messages.slice(offset, offset + limit);
      const emailPromises = messagesToFetch.map((message) =>
        this.getEmail(message.id, folderId)
      );

      const emailResults = await Promise.all(emailPromises);
      let emails = emailResults.filter(result => result.success).map(result => result.data);
      
      // Apply sorting (Gmail returns by relevance/date by default)
      if (sortBy !== 'date' || sortOrder === 'asc') {
        emails = this.sortEmails(emails, sortBy, sortOrder);
      }

      const total = data.resultSizeEstimate || data.messages.length;
      const hasMore = offset + limit < total;

      return this.createSuccessResponse(emails, {
        total,
        limit,
        offset,
        hasMore,
        currentPage: Math.floor(offset / limit) + 1,
        totalPages: Math.ceil(total / limit),
        nextOffset: hasMore ? offset + limit : null,
        nextPageToken: data.nextPageToken
      });
    } catch (error) {
      return this.createErrorResponse('LIST_EMAILS_ERROR', error.message, error);
    }
  }

  sortEmails(emails, sortBy, sortOrder) {
    return emails.sort((a, b) => {
      let aVal, bVal;
      
      switch (sortBy) {
        case 'date':
          aVal = new Date(a.date);
          bVal = new Date(b.date);
          break;
        case 'subject':
          aVal = (a.subject || '').toLowerCase();
          bVal = (b.subject || '').toLowerCase();
          break;
        case 'from':
          aVal = (a.from?.name || a.from?.address || '').toLowerCase();
          bVal = (b.from?.name || b.from?.address || '').toLowerCase();
          break;
        case 'size':
          aVal = a.size || 0;
          bVal = b.size || 0;
          break;
        default:
          return 0;
      }
      
      if (aVal < bVal) return sortOrder === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });
  }

  async getEmail(messageId, folderId) {
    try {
      const data = await this.makeGmailRequest(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`
      );
      
      const email = this.parseGmailMessage(data, folderId);
      return this.createSuccessResponse(email);
    } catch (error) {
      return this.createErrorResponse('FETCH_EMAIL_ERROR', error.message, error);
    }
  }

  parseGmailMessage(message, folderId) {
    const headers = message.payload.headers;
    const getHeader = (name) => headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value;

    const bodyText = this.extractTextFromPayload(message.payload, 'text/plain');
    const bodyHtml = this.extractTextFromPayload(message.payload, 'text/html');
    const snippet = bodyText ? bodyText.substring(0, 150) : (bodyHtml ? bodyHtml.replace(/<[^>]*>/g, '').substring(0, 150) : '');

    return {
      id: message.id,
      messageId: getHeader('Message-ID') || message.id,
      threadId: message.threadId,
      subject: getHeader('Subject') || '(No Subject)',
      from: this.normalizeAddresses([this.parseGmailAddress(getHeader('From'))])[0] || { name: '', address: '' },
      to: this.normalizeAddresses(this.parseGmailAddresses(getHeader('To'))),
      cc: this.normalizeAddresses(this.parseGmailAddresses(getHeader('Cc'))),
      bcc: this.normalizeAddresses(this.parseGmailAddresses(getHeader('Bcc'))),
      replyTo: this.normalizeAddresses(this.parseGmailAddresses(getHeader('Reply-To'))),
      date: new Date(parseInt(message.internalDate)),
      bodyText,
      bodyHtml,
      snippet,
      attachments: this.extractAttachmentsFromPayload(message.payload),
      flags: this.createStandardFlags({
        seen: !message.labelIds?.includes('UNREAD'),
        flagged: message.labelIds?.includes('STARRED') || false,
        draft: message.labelIds?.includes('DRAFT') || false,
        answered: false, // Gmail doesn't provide this directly
        deleted: message.labelIds?.includes('TRASH') || false,
        recent: false
      }),
      labels: message.labelIds || [],
      folderId: folderId || 'INBOX',
      provider: 'gmail',
      inReplyTo: getHeader('In-Reply-To'),
      references: this.parseReferences(getHeader('References')?.split(' ')),
      priority: 'normal',
      size: message.sizeEstimate || 0,
      isEncrypted: false,
      isSigned: false
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

  async searchEmails(request) {
    try {
      const { query = '', from, to, subject, hasAttachment, isUnread, isFlagged, folderId, limit = 50, offset = 0 } = request;
      
      let searchQuery = query;
      
      if (from) searchQuery += ` from:${from}`;
      if (to) searchQuery += ` to:${to}`;
      if (subject) searchQuery += ` subject:"${subject}"`;
      if (hasAttachment) searchQuery += ' has:attachment';
      if (isUnread) searchQuery += ' is:unread';
      if (isFlagged) searchQuery += ' is:starred';
      if (folderId) searchQuery += ` in:${folderId}`;

      const params = new URLSearchParams({
        q: searchQuery,
        maxResults: limit.toString()
      });

      const data = await this.makeGmailRequest(`https://gmail.googleapis.com/gmail/v1/users/me/messages?${params}`);
      
      if (!data.messages) {
        return this.createSuccessResponse([], {
          total: 0,
          limit,
          offset,
          hasMore: false
        });
      }

      const emailPromises = data.messages.slice(offset, offset + limit).map((message) =>
        this.getEmail(message.id)
      );

      const emailResults = await Promise.all(emailPromises);
      const emails = emailResults.filter(result => result.success).map(result => result.data);
      
      return this.createSuccessResponse(emails, {
        total: data.resultSizeEstimate || emails.length,
        limit,
        offset,
        hasMore: data.messages.length > offset + limit
      });
    } catch (error) {
      return this.createErrorResponse('SEARCH_EMAILS_ERROR', error.message, error);
    }
  }

  async searchThreads(query) {
    const emails = await this.searchEmails(query);
    return this.buildThreads(emails);
  }

  async markAsRead(request) {
    try {
      await this.updateLabels(request.messageIds, [], ['UNREAD']);
      return this.createSuccessResponse({ updated: request.messageIds.length });
    } catch (error) {
      return this.createErrorResponse('MARK_READ_ERROR', error.message, error);
    }
  }

  async markAsUnread(request) {
    try {
      await this.updateLabels(request.messageIds, ['UNREAD'], []);
      return this.createSuccessResponse({ updated: request.messageIds.length });
    } catch (error) {
      return this.createErrorResponse('MARK_UNREAD_ERROR', error.message, error);
    }
  }

  async markAsFlagged(request) {
    try {
      await this.updateLabels(request.messageIds, ['STARRED'], []);
      return this.createSuccessResponse({ updated: request.messageIds.length });
    } catch (error) {
      return this.createErrorResponse('MARK_FLAGGED_ERROR', error.message, error);
    }
  }

  async markAsUnflagged(request) {
    try {
      await this.updateLabels(request.messageIds, [], ['STARRED']);
      return this.createSuccessResponse({ updated: request.messageIds.length });
    } catch (error) {
      return this.createErrorResponse('MARK_UNFLAGGED_ERROR', error.message, error);
    }
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

  async sendEmail(request) {
    try {
      const email = this.buildMimeMessage(request);
      const encodedEmail = Buffer.from(email).toString('base64url');

      const data = await this.makeGmailRequest('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
        method: 'POST',
        body: JSON.stringify({ raw: encodedEmail })
      });

      return this.createSuccessResponse({ messageId: data.id, id: data.id });
    } catch (error) {
      return this.createErrorResponse('SEND_EMAIL_ERROR', error.message, error);
    }
  }

  buildMimeMessage(request) {
    const boundary = `----boundary_${Date.now()}`;
    let message = '';

    // Headers
    message += `From: ${this.config.auth.user}\r\n`;
    message += `To: ${request.to.map(addr => `${addr.name ? `"${addr.name}" ` : ''}<${addr.address}>`).join(', ')}\r\n`;
    
    if (request.cc?.length) {
      message += `Cc: ${request.cc.map(addr => `${addr.name ? `"${addr.name}" ` : ''}<${addr.address}>`).join(', ')}\r\n`;
    }
    
    if (request.bcc?.length) {
      message += `Bcc: ${request.bcc.map(addr => `${addr.name ? `"${addr.name}" ` : ''}<${addr.address}>`).join(', ')}\r\n`;
    }

    message += `Subject: ${request.subject}\r\n`;
    
    if (request.inReplyTo) {
      message += `In-Reply-To: ${request.inReplyTo}\r\n`;
    }
    
    if (request.references?.length) {
      message += `References: ${request.references.join(' ')}\r\n`;
    }

    message += `MIME-Version: 1.0\r\n`;
    message += `Content-Type: multipart/mixed; boundary="${boundary}"\r\n\r\n`;

    // Text content
    if (request.bodyText) {
      message += `--${boundary}\r\n`;
      message += `Content-Type: text/plain; charset=utf-8\r\n\r\n`;
      message += `${request.bodyText}\r\n\r\n`;
    }

    // HTML content
    if (request.bodyHtml) {
      message += `--${boundary}\r\n`;
      message += `Content-Type: text/html; charset=utf-8\r\n\r\n`;
      message += `${request.bodyHtml}\r\n\r\n`;
    }

    // Attachments
    if (request.attachments?.length) {
      for (const attachment of request.attachments) {
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