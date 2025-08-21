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
      scopes: ['https://graph.microsoft.com/mail.read', 'https://graph.microsoft.com/mail.send'],
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

  async getEmails(folder, limit = 50, offset = 0) {
    if (!this.graphClient) {
      throw new Error('Not connected to Outlook');
    }

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

    return messages.value.map(message => this.parseOutlookMessage(message, folder));
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
        .orderby('receivedDateTime asc')
        .get();
      
      if (!messages.value || messages.value.length === 0) return null;
      
      const emails = messages.value.map(message => this.parseOutlookMessage(message));
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

    return messages.value.map(message => this.parseOutlookMessage(message));
  }

  async searchThreads(query) {
    const emails = await this.searchEmails(query);
    return this.buildThreads(emails);
  }

  async markAsRead(messageIds, folder) {
    await this.updateMessageFlags(messageIds, { isRead: true });
  }

  async markAsUnread(messageIds, folder) {
    await this.updateMessageFlags(messageIds, { isRead: false });
  }

  async markAsFlagged(messageIds, folder) {
    await this.updateMessageFlags(messageIds, { 
      flag: { flagStatus: 'flagged' }
    });
  }

  async markAsUnflagged(messageIds, folder) {
    await this.updateMessageFlags(messageIds, { 
      flag: { flagStatus: 'notFlagged' }
    });
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

  async deleteEmails(messageIds, folder) {
    if (!this.graphClient) {
      throw new Error('Not connected to Outlook');
    }

    const deletePromises = messageIds.map(messageId =>
      this.graphClient.api(`/me/messages/${messageId}`).delete()
    );

    await Promise.all(deletePromises);
  }

  async moveEmails(messageIds, fromFolder, toFolder) {
    if (!this.graphClient) {
      throw new Error('Not connected to Outlook');
    }

    const movePromises = messageIds.map(messageId =>
      this.graphClient.api(`/me/messages/${messageId}/move`).post({
        destinationId: toFolder
      })
    );

    await Promise.all(movePromises);
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

    const sentMessage = await this.graphClient.api('/me/sendMail').post({
      message,
      saveToSentItems: true
    });

    return sentMessage;
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