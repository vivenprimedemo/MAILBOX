import { BaseEmailProvider } from './BaseEmailProvider.js';
import { Client } from '@microsoft/microsoft-graph-client';
import { PublicClientApplication } from '@azure/msal-node';
import 'isomorphic-fetch';

export class OutlookProvider extends BaseEmailProvider {
  constructor(config) {
    super(config);
    this.graphClient = null;
    this.accessToken = config.auth.accessToken;
    this.refreshToken = config.auth.refreshToken;
    this.msalInstance = null;
    this.initializeMsal();
  }

  initializeMsal() {
    if (this.config.auth.clientId) {
      const msalConfig = {
        auth: {
          clientId: this.config.auth.clientId,
          authority: 'https://login.microsoftonline.com/common',
          clientSecret: this.config.auth.clientSecret
        }
      };
      this.msalInstance = new PublicClientApplication(msalConfig);
    }
  }

  getCapabilities() {
    return {
      supportsThreading: true,
      supportsLabels: false,
      supportsFolders: true,
      supportsSearch: true,
      supportsRealTimeSync: true,
      supportsSending: true,
      supportsAttachments: true,
      maxAttachmentSize: 150 * 1024 * 1024 // 150MB
    };
  }

  async connect() {
    if (!this.accessToken) {
      throw new Error('Access token required for Outlook');
    }
    
    try {
      this.graphClient = Client.init({
        authProvider: (done) => {
          done(null, this.accessToken);
        }
      });

      // Test connection
      await this.graphClient.api('/me').get();
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
    this.graphClient = null;
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

    const tokenRequest = {
      refreshToken: this.refreshToken,
      scopes: ['email',
        'https://graph.microsoft.com/IMAP.AccessAsUser.All',
        'https://graph.microsoft.com/Mail.Read',
        'https://graph.microsoft.com/Mail.Read.Shared',
        'https://graph.microsoft.com/Mail.ReadBasic',
        'https://graph.microsoft.com/Mail.Send',
        'https://graph.microsoft.com/Mail.Send.Shared',
        'https://graph.microsoft.com/Mail.ReadWrite',
        'https://graph.microsoft.com/MailboxFolder.Read',
        'offline_access',
        'openid',
        'profile',
        'https://graph.microsoft.com/User.Read'],
    };

    try {
      const response = await this.msalInstance.acquireTokenByRefreshToken(tokenRequest);
      this.accessToken = response.accessToken;

      // Reinitialize Graph client with new token
      this.graphClient = Client.init({
        authProvider: (done) => {
          done(null, this.accessToken);
        }
      });
    } catch (error) {
      console.error('Failed to refresh access token:', error);
      throw new Error('Failed to refresh access token');
    }
  }

  async getFolders() {
    if (!this.graphClient) {
      throw new Error('Not connected to Outlook');
    }

    const folders = await this.graphClient.api('/me/mailFolders').get();
    
    return folders.value.map((folder) => ({
      name: folder.id,
      displayName: folder.displayName,
      type: this.mapFolderType(folder.displayName),
      unreadCount: folder.unreadItemCount || 0,
      totalCount: folder.totalItemCount || 0,
      parentFolderId: folder.parentFolderId
    }));
  }

  mapFolderType(displayName) {
    const name = displayName.toLowerCase();
    if (name.includes('inbox')) return 'inbox';
    if (name.includes('sent')) return 'sent';
    if (name.includes('draft')) return 'drafts';
    if (name.includes('deleted') || name.includes('trash')) return 'trash';
    if (name.includes('junk') || name.includes('spam')) return 'spam';
    if (name.includes('archive')) return 'archive';
    return 'custom';
  }

  async getEmails(request) {
    const { folderId: folder = 'inbox', limit = 50, offset = 0 } = request;
    
    if (!this.graphClient) {
      throw new Error('Not connected to Outlook');
    }

    try {
      let endpoint = '/me/messages';
      if (folder && folder !== 'inbox') {
        endpoint = `/me/mailFolders/${folder}/messages`;
      }

      const messages = await this.graphClient
        .api(endpoint)
        .top(limit)
        .skip(offset)
        .expand('attachments')
        .orderby('receivedDateTime desc')
        .get();

      const emails = messages.value.map(message => this.parseOutlookMessage(message, folder));
      
      return emails;
    } catch (error) {
      throw error;
    }
  }

  async listEmails(request) {
    try {
      const {
        folderId = 'inbox',
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

      if (!this.graphClient) {
        throw new Error('Not connected to Outlook');
      }

      let endpoint = '/me/messages';
      if (folderId && folderId !== 'inbox') {
        endpoint = `/me/mailFolders/${folderId}/messages`;
      }

      let query = this.graphClient.api(endpoint);

      // Apply search filters using OData $filter
      const filters = [];
      
      if (search) {
        filters.push(`contains(subject,'${search}') or contains(body/content,'${search}')`);
      }
      if (from) {
        filters.push(`from/emailAddress/address eq '${from}'`);
      }
      if (to) {
        filters.push(`toRecipients/any(r:r/emailAddress/address eq '${to}')`);
      }
      if (subject) {
        filters.push(`contains(subject,'${subject}')`);
      }
      if (isUnread === true) {
        filters.push(`isRead eq false`);
      }
      if (isUnread === false) {
        filters.push(`isRead eq true`);
      }
      if (isFlagged === true) {
        filters.push(`flag/flagStatus eq 'flagged'`);
      }
      if (isFlagged === false) {
        filters.push(`flag/flagStatus ne 'flagged'`);
      }
      if (hasAttachment === true) {
        filters.push(`hasAttachments eq true`);
      }
      if (hasAttachment === false) {
        filters.push(`hasAttachments eq false`);
      }
      if (dateFrom) {
        filters.push(`receivedDateTime ge ${dateFrom.toISOString()}`);
      }
      if (dateTo) {
        filters.push(`receivedDateTime le ${dateTo.toISOString()}`);
      }

      if (filters.length > 0) {
        query = query.filter(filters.join(' and '));
      }

      // Apply sorting
      const sortField = this.mapSortField(sortBy);
      const orderByClause = `${sortField} ${sortOrder}`;
      
      query = query
        .top(limit)
        .skip(offset)
        .expand('attachments')
        .orderby(orderByClause)
        .count(true); // Include total count

      const messages = await query.get();
      const emails = messages.value.map(message => this.parseOutlookMessage(message, folderId));

      const total = messages['@odata.count'] || emails.length;
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
          nextLink: messages['@odata.nextLink']
        }
      };
    } catch (error) {
      throw error;
    }
  }

  mapSortField(sortBy) {
    switch (sortBy) {
      case 'date':
        return 'receivedDateTime';
      case 'subject':
        return 'subject';
      case 'from':
        return 'from/emailAddress/address';
      case 'size':
        return 'bodyPreview';
      default:
        return 'receivedDateTime';
    }
  }

  async getEmail(messageId, folder) {
    if (!this.graphClient) {
      throw new Error('Not connected to Outlook');
    }

    try {
      const message = await this.graphClient
        .api(`/me/messages/${messageId}`)
        .expand('attachments')
        .get();
      
      return this.parseOutlookMessage(message, folder);
    } catch (error) {
      return null;
    }
  }

  parseOutlookMessage(message, folder) {
    return {
      id: message.id,
      messageId: message.internetMessageId || message.id,
      threadId: message.conversationId,
      subject: message.subject || '(No Subject)',
      from: this.parseOutlookAddress(message.from),
      to: message.toRecipients?.map(addr => this.parseOutlookAddress(addr)) || [],
      cc: message.ccRecipients?.map(addr => this.parseOutlookAddress(addr)) || [],
      bcc: message.bccRecipients?.map(addr => this.parseOutlookAddress(addr)) || [],
      replyTo: message.replyTo?.map(addr => this.parseOutlookAddress(addr)) || [],
      date: new Date(message.receivedDateTime),
      bodyText: message.body?.contentType === 'text' ? message.body.content : '',
      bodyHtml: message.body?.contentType === 'html' ? message.body.content : '',
      attachments: this.parseOutlookAttachments(message.attachments),
      flags: {
        seen: message.isRead || false,
        flagged: message.flag?.flagStatus === 'flagged' || false,
        draft: message.isDraft || false,
        answered: false, // Not directly available in Graph API
        deleted: false
      },
      categories: message.categories || [],
      folder: folder || 'inbox',
      provider: 'outlook',
      inReplyTo: null, // Not directly available in Graph API
      references: [] // Not directly available in Graph API
    };
  }

  parseOutlookAddress(addressObj) {
    if (!addressObj) return { address: '' };
    
    return {
      name: addressObj.emailAddress?.name || '',
      address: addressObj.emailAddress?.address || ''
    };
  }

  parseOutlookAttachments(attachments) {
    if (!attachments || !attachments.value) return [];
    
    return attachments.value.map(attachment => ({
      filename: attachment.name,
      contentType: attachment.contentType,
      size: attachment.size || 0,
      contentId: attachment.contentId,
      isInline: attachment.isInline || false,
      attachmentId: attachment.id
    }));
  }

  async getThread(threadId) {
    if (!this.graphClient) {
      throw new Error('Not connected to Outlook');
    }


    try {
      const messages = await this.graphClient
        .api('/me/messages')
        .filter(`conversationId eq '${threadId}'`)
        .expand('attachments')
        .get();

      if (!messages.value || messages.value.length === 0) return null;

      const emails = messages.value.map(message => this.parseOutlookMessage(message));
      const threads = this.buildThreads(emails);
      return threads[0] || null;
    } catch (error) {
      return null;
    }
  }

  async getThreads(request) {
    const emails = await this.getEmails(request);
    return this.buildThreads(emails);
  }

  async searchEmails(query) {
    if (!this.graphClient) {
      throw new Error('Not connected to Outlook');
    }

    let searchQuery = query.query || '';
    
    // Build search query using Outlook search syntax
    if (query.from) searchQuery += ` from:${query.from}`;
    if (query.to) searchQuery += ` to:${query.to}`;
    if (query.subject) searchQuery += ` subject:"${query.subject}"`;
    if (query.hasAttachment) searchQuery += ' hasattachments:true';
    if (query.isUnread) searchQuery += ' isread:false';
    if (query.isFlagged) searchQuery += ' isflagged:true';

    const messages = await this.graphClient
      .api('/me/messages')
      .search(searchQuery)
      .top(query.limit || 50)
      .expand('attachments')
      .get();

    const emails = messages.value.map(message => this.parseOutlookMessage(message));
    return { emails };
  }

  async searchThreads(query) {
    const emails = await this.searchEmails(query);
    return this.buildThreads(emails);
  }

  async markAsRead(request) {
    await this.updateMessageFlags(request.messageIds, { isRead: true });
    return { updated: request.messageIds.length };
  }

  async markAsUnread(request) {
    await this.updateMessageFlags(request.messageIds, { isRead: false });
    return { updated: request.messageIds.length };
  }

  async markAsFlagged(request) {
    await this.updateMessageFlags(request.messageIds, { 
      flag: { flagStatus: 'flagged' }
    });
    return { updated: request.messageIds.length };
  }

  async markAsUnflagged(request) {
    await this.updateMessageFlags(request.messageIds, { 
      flag: { flagStatus: 'notFlagged' }
    });
    return { updated: request.messageIds.length };
  }

  async updateMessageFlags(messageIds, updateData) {
    if (!this.graphClient) {
      throw new Error('Not connected to Outlook');
    }

    const updatePromises = messageIds.map(messageId =>
      this.graphClient.api(`/me/messages/${messageId}`).patch(updateData)
    );

    await Promise.all(updatePromises);
  }

  async deleteEmails(request) {
    if (!this.graphClient) {
      throw new Error('Not connected to Outlook');
    }

    const deletePromises = request.messageIds.map(messageId =>
      this.graphClient.api(`/me/messages/${messageId}`).delete()
    );

    await Promise.all(deletePromises);
    return { deleted: request.messageIds.length };
  }

  async moveEmails(request) {
    if (!this.graphClient) {
      throw new Error('Not connected to Outlook');
    }

    const movePromises = request.messageIds.map(messageId =>
      this.graphClient.api(`/me/messages/${messageId}/move`).post({
        destinationId: request.destinationFolder
      })
    );

    await Promise.all(movePromises);
    return { moved: request.messageIds.length };
  }

  async sendEmail(options) {
    if (!this.graphClient) {
      throw new Error('Not connected to Outlook');
    }

    const message = {
      subject: options.subject,
      body: {
        contentType: options.bodyHtml ? 'html' : 'text',
        content: options.bodyHtml || options.bodyText || ''
      },
      toRecipients: options.to.map(addr => ({
        emailAddress: {
          address: addr.address,
          name: addr.name || addr.address
        }
      })),
      ccRecipients: options.cc?.map(addr => ({
        emailAddress: {
          address: addr.address,
          name: addr.name || addr.address
        }
      })) || [],
      bccRecipients: options.bcc?.map(addr => ({
        emailAddress: {
          address: addr.address,
          name: addr.name || addr.address
        }
      })) || []
    };

    // Add attachments if present
    if (options.attachments?.length) {
      message.attachments = options.attachments.map(attachment => ({
        '@odata.type': '#microsoft.graph.fileAttachment',
        name: attachment.filename,
        contentType: attachment.contentType || 'application/octet-stream',
        contentBytes: Buffer.isBuffer(attachment.content) 
          ? attachment.content.toString('base64') 
          : Buffer.from(attachment.content).toString('base64')
      }));
    }

    await this.graphClient.api('/me/sendMail').post({
      message,
      saveToSentItems: true
    });

    return { messageId: 'sent', id: 'sent' };
  }

  async replyToEmail(originalMessageId, options) {
    if (!this.graphClient) {
      throw new Error('Not connected to Outlook');
    }

    const replyMessage = {
      comment: options.bodyText || options.bodyHtml || ''
    };

    if (options.attachments?.length) {
      replyMessage.attachments = options.attachments.map(attachment => ({
        '@odata.type': '#microsoft.graph.fileAttachment',
        name: attachment.filename,
        contentType: attachment.contentType || 'application/octet-stream',
        contentBytes: Buffer.isBuffer(attachment.content) 
          ? attachment.content.toString('base64') 
          : Buffer.from(attachment.content).toString('base64')
      }));
    }

    const endpoint = options.replyAll ? 'replyAll' : 'reply';
    await this.graphClient.api(`/me/messages/${originalMessageId}/${endpoint}`).post(replyMessage);
  }

  async forwardEmail(originalMessageId, to, message) {
    if (!this.graphClient) {
      throw new Error('Not connected to Outlook');
    }

    const forwardMessage = {
      comment: message || '',
      toRecipients: to.map(addr => ({
        emailAddress: {
          address: typeof addr === 'string' ? addr : addr.address,
          name: typeof addr === 'string' ? addr : (addr.name || addr.address)
        }
      }))
    };

    await this.graphClient.api(`/me/messages/${originalMessageId}/forward`).post(forwardMessage);
  }

  async sync(folder) {
    // For real-time sync, implement Delta query or webhooks
    // This is a placeholder for polling-based sync
    console.log(`Sync for folder ${folder} - implement Delta query for real-time updates`);
  }

  async createFolder(name, parentFolderId) {
    if (!this.graphClient) {
      throw new Error('Not connected to Outlook');
    }

    const folderData = {
      displayName: name
    };

    const endpoint = parentFolderId 
      ? `/me/mailFolders/${parentFolderId}/childFolders`
      : '/me/mailFolders';

    return await this.graphClient.api(endpoint).post(folderData);
  }

  async deleteFolder(folderId) {
    if (!this.graphClient) {
      throw new Error('Not connected to Outlook');
    }

    await this.graphClient.api(`/me/mailFolders/${folderId}`).delete();
  }

  async getAttachment(messageId, attachmentId) {
    if (!this.graphClient) {
      throw new Error('Not connected to Outlook');
    }

    return await this.graphClient.api(`/me/messages/${messageId}/attachments/${attachmentId}`).get();
  }
}