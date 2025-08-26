import { BaseEmailProvider } from './BaseEmailProvider.js';
import { google } from 'googleapis';
import { consoleHelper } from '../../consoleHelper.js';
import { provider_config_map } from '../config/index.js';

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
    try {
      consoleHelper("ATTEMPTING GMAIL REFRESH ACCESS TOKEN");
      if (!this.refreshToken) {
        throw new Error('Refresh token or OAuth credentials missing');
      }

      const oauth2Client = new google.auth.OAuth2(
        provider_config_map?.gmail?.client_id,
        provider_config_map?.gmail?.client_secret,
        provider_config_map?.gmail?.redirect_uri
      );
      oauth2Client.setCredentials({ refresh_token: this.refreshToken });
      const { credentials } = await oauth2Client.refreshAccessToken(); // uses fetch internally
      this.accessToken = credentials.access_token;
      this.refreshToken = credentials.refresh_token;

      await this.updateEmailAccessToken(this.config.id, this.accessToken);
    } catch (error) {
      consoleHelper("GMAIL REFRESH ACCESS TOKEN FAILED", error);
      throw error;
    }
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
        displayName: label.name,
      }));
      return folders;
    } catch (error) {
      throw error;
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
        return [];
      }

      const emailPromises = data.messages.slice(offset, offset + limit).map((message) =>
        this.getEmail(message.id, folderId)
      );

      const emailResults = await Promise.all(emailPromises);
      const emails = emailResults.filter(email => email != null);
      
      return emails;
    } catch (error) {
      throw error;
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
        return {
          emails: [],
          metadata: {
            total: 0,
            limit,
            offset,
            hasMore: false,
            currentPage: Math.floor(offset / limit) + 1,
            totalPages: 0,
            nextOffset: null
          }
        };
      }

      // Apply offset manually since Gmail doesn't support native offset
      const messagesToFetch = data.messages.slice(offset, offset + limit);
      const emailPromises = messagesToFetch.map((message) =>
        this.getEmail(message.id, folderId)
      );

      const emailResults = await Promise.all(emailPromises);
      let emails = emailResults.filter(email => email != null);
      
      // Apply sorting (Gmail returns by relevance/date by default)
      if (sortBy !== 'date' || sortOrder === 'asc') {
        emails = this.sortEmails(emails, sortBy, sortOrder);
      }

      const total = data.resultSizeEstimate || data.messages.length;
      const hasMore = offset + limit < total;

      return {
        emails,
        metadata: {
          total,
          limit,
          offset,
          hasMore,
          currentPage: Math.floor(offset / limit) + 1,
          totalPages: Math.ceil(total / limit),
          nextOffset: hasMore ? offset + limit : null,
          nextPageToken: data.nextPageToken
        }
      };
    } catch (error) {
      throw error;
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
      return email;
    } catch (error) {
      consoleHelper('getEMAIL ERROR', error);
      throw error;
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
      references: this.parseReferences(getHeader('References')?.split(/\s+/).filter(ref => ref.trim())),
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
        return {
          emails: [],
          metadata: {
            total: 0,
            limit,
            offset,
            hasMore: false
          }
        };
      }

      const emailPromises = data.messages.slice(offset, offset + limit).map((message) =>
        this.getEmail(message.id)
      );

      const emailResults = await Promise.all(emailPromises);
      const emails = emailResults.filter(email => email != null);
      
      return {
        emails,
        metadata: {
          total: data.resultSizeEstimate || emails.length,
          limit,
          offset,
          hasMore: data.messages.length > offset + limit
        }
      };
    } catch (error) {
      throw error;
    }
  }

  async searchThreads(query) {
    const searchResult = await this.searchEmails(query);
    const emails = searchResult.emails || searchResult; // Handle both wrapped and raw responses
    return this.buildThreads(emails);
  }

  async markAsRead(request) {
    try {
      await this.updateLabels(request.messageIds, [], ['UNREAD']);
      return { updated: request.messageIds.length };
    } catch (error) {
      throw error;
    }
  }

  async markAsUnread(request) {
    try {
      await this.updateLabels(request.messageIds, ['UNREAD'], []);
      return { updated: request.messageIds.length };
    } catch (error) {
      throw error;
    }
  }

  async markAsFlagged(request) {
    try {
      await this.updateLabels(request.messageIds, ['STARRED'], []);
      return { updated: request.messageIds.length };
    } catch (error) {
      throw error;
    }
  }

  async markAsUnflagged(request) {
    try {
      await this.updateLabels(request.messageIds, [], ['STARRED']);
      return { updated: request.messageIds.length };
    } catch (error) {
      throw error;
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

  async deleteEmails(request) {
    const batchRequest = { ids: request.messageIds };
    
    await this.makeGmailRequest('https://gmail.googleapis.com/gmail/v1/users/me/messages/batchDelete', {
      method: 'POST',
      body: JSON.stringify(batchRequest)
    });
    
    return { deleted: request.messageIds.length };
  }

  async moveEmails(request) {
    await this.updateLabels(request.messageIds, [request.destinationFolder], [request.sourceFolder]);
    return { moved: request.messageIds.length };
  }

  async sendEmail(request) {
    try {
      const email = this.buildMimeMessage(request);
      const encodedEmail = Buffer.from(email).toString('base64url');

      const requestBody = { raw: encodedEmail };
      if (request.threadId) {
        requestBody.threadId = request.threadId;
      }

      const data = await this.makeGmailRequest('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
        method: 'POST',
        body: JSON.stringify(requestBody)
      });

      return { messageId: data.id, id: data.id };
    } catch (error) {
      throw error;
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
    if (request.attachments?.length > 0) {
      for (const attachment of request.attachments) {
        message += `--${boundary}\r\n`;
        message += `Content-Type: ${attachment.contentType || 'application/octet-stream'}\r\n`;
        message += `Content-Disposition: attachment; filename="${attachment.filename}"\r\n`;
        message += `Content-Transfer-Encoding: base64\r\n\r\n`;
        
        if (!attachment.content) {
          console.error(`Attachment ${attachment.filename} has no content data`);
          continue;
        }
        
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
    if (!originalEmail || !originalEmail?.messageId) {
      throw new Error('Original email not found');
    }

    return this.sendEmail({
      to: [{ address: originalEmail?.from?.address, name: originalEmail?.from?.name }],
      subject: originalEmail.subject.trim().startsWith('Re:') ? originalEmail.subject : `Re: ${originalEmail.subject}`,
      inReplyTo: originalEmail?.messageId,
      references: [...(originalEmail?.references || []), originalEmail?.messageId].filter(Boolean),
      threadId: originalEmail?.threadId,
      ...options
    });
  }

  async forwardEmail(originalMessageId, to, message) {
    const originalEmail = await this.getEmail(originalMessageId);
    if (!originalEmail || !originalEmail?.id) {
      throw new Error('Original email not found');
    }

    const forwardedContent = `
            ${message || ""}

            ---------- Forwarded message ---------
            From: ${
              originalEmail.from.name ? `"${originalEmail.from.name}" ` : ""
            }<${originalEmail.from.address}>
            Date: ${originalEmail.date.toLocaleString()}
            Subject: ${originalEmail.subject}
            To: ${originalEmail.to
              .map(
                (addr) =>
                  `${addr.name ? `"${addr.name}" ` : ""}<${addr.address}>`
              )
              .join(", ")}

            ${originalEmail.bodyText || originalEmail.bodyHtml || ""}
          `;

    // Fetch attachment data for each attachment
    let attachmentsWithData = [];
    if (originalEmail.attachments && originalEmail.attachments.length > 0) {
      attachmentsWithData = await Promise.all(
        originalEmail.attachments.map(async (att) => {
          try {
            const attachmentData = await this.getAttachment(
              originalEmail.id,
              att.attachmentId
            );
            return {
              filename: att.filename,
              content: attachmentData.data,
              contentType: att.contentType,
            };
          } catch (error) {
            console.error(`Failed to fetch attachment ${att.filename}:`, error);
            return null;
          }
        })
      );
      // Filter out failed attachments
      attachmentsWithData = attachmentsWithData.filter((att) => att !== null);
    }

    return this.sendEmail({
      to,
      subject: `Fwd: ${originalEmail.subject}`,
      bodyText: forwardedContent,
      attachments: attachmentsWithData,
    });
  }

  async sync(folder) {
    // Gmail doesn't support IDLE, but we can implement polling
    // This would typically be handled by webhooks in a production environment
    console.log(`Sync not implemented for Gmail - use webhooks for real-time updates`);
  }

  async getAttachment(messageId, attachmentId) {
    try {
      if (!this.accessToken) {
        throw new Error('Not authenticated');
      }

      const data = await this.makeGmailRequest(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/attachments/${attachmentId}`
      );

      return {
        filename: data.filename || 'attachment',
        contentType: data.contentType || 'application/octet-stream',
        size: data.size || 0,
        data: Buffer.from(data.data, 'base64')
      };
    } catch (error) {
      throw new Error(`Failed to fetch Gmail attachment: ${error.message}`);
    }
  }
}