import { GmailProvider } from '../providers/GmailProvider.js';
import { IMAPProvider } from '../providers/IMAPProvider.js';
import { OutlookProvider } from '../providers/OutlookProvider.js';
import { Email } from '../models/Email.js';

export class EmailService {
  providers = new Map();
  providerInstances = new Map();

  constructor() {}

  createProvider(config, accountId) {
    let provider;

    switch (config.type) {
      case 'gmail':
        provider = new GmailProvider(config);
        break;
      case 'imap':
        provider = new IMAPProvider(config);
        break;
      case 'outlook':
        provider = new OutlookProvider(config);
        break;
      default:
        throw new Error(`Unsupported provider type: ${config.type}`);
    }

    this.providerInstances.set(accountId, provider);
    return provider;
  }

  async getProvider(accountId) {
    return this.providerInstances.get(accountId) || null;
  }

  async removeProvider(accountId) {
    const provider = this.providerInstances.get(accountId);
    if (provider) {
      await provider.disconnect();
      this.providerInstances.delete(accountId);
    }
  }

  async connectProvider(accountId, config) {
    try {
      const provider = this.createProvider(config, accountId);
      await provider.connect();
      return true;
    } catch (error) {
      console.error(`Failed to connect provider for account ${accountId}:`, error);
      return false;
    }
  }

  async getFolders(accountId, request = {}) {
    const provider = await this.getProvider(accountId);
    if (!provider) {
      throw new Error('Provider not found');
    }
    return provider.getFolders(request);
  }

  async getEmails(accountId, userId, request, useCache = true) {
    const provider = await this.getProvider(accountId);
    if (!provider) {
      throw new Error('Provider not found');
    }

    const { folderId, limit = 50, offset = 0 } = request;

    // Try to get from cache first
    if (useCache) {
      const cachedEmails = await Email.find({
        userId,
        accountId,
        folderId
      }).sort({ date: -1 }).limit(limit).skip(offset);

      if (cachedEmails.length > 0) {
        return {
          success: true,
          data: cachedEmails.map(this.convertToInterface),
          metadata: {
            total: cachedEmails.length,
            limit,
            offset,
            hasMore: cachedEmails.length === limit,
            provider: provider.config?.type || 'unknown'
          }
        };
      }
    }

    // Fetch from provider and cache
    const response = await provider.getEmails(request);
    if (response.success) {
      await this.cacheEmails(response.data, userId, accountId);
    }
    
    return response;
  }

  async getEmail(accountId, messageId, folderId) {
    const provider = await this.getProvider(accountId);
    if (!provider) {
      throw new Error('Provider not found');
    }
    return provider.getEmail(messageId, folderId);
  }

  async getThreads(accountId, userId, request) {
    const provider = await this.getProvider(accountId);
    if (!provider) {
      throw new Error('Provider not found');
    }

    const capabilities = provider.getCapabilities();
    if (!capabilities.supportsThreading) {
      // Fall back to grouping emails by subject
      const emailsResponse = await this.getEmails(accountId, userId, request, false);
      if (emailsResponse.success) {
        const threads = this.buildThreadsFromEmails(emailsResponse.data);
        return {
          success: true,
          data: threads,
          metadata: emailsResponse.metadata
        };
      }
      return emailsResponse;
    }

    return provider.getThreads(request);
  }

  async getThread(accountId, threadId) {
    const provider = await this.getProvider(accountId);
    if (!provider) {
      throw new Error('Provider not found');
    }
    return provider.getThread(threadId);
  }

  async searchEmails(accountId, userId, request) {
    const provider = await this.getProvider(accountId);
    if (!provider) {
      throw new Error('Provider not found');
    }

    const capabilities = provider.getCapabilities();
    if (!capabilities.supportsSearch) {
      // Fall back to local search
      const results = await this.searchEmailsLocally(userId, accountId, request);
      return {
        success: true,
        data: results,
        metadata: {
          total: results.length,
          limit: request.limit || 50,
          offset: request.offset || 0,
          hasMore: false,
          provider: provider.config?.type || 'unknown'
        }
      };
    }

    return provider.searchEmails(request);
  }

  async markAsRead(accountId, request) {
    const provider = await this.getProvider(accountId);
    if (!provider) {
      throw new Error('Provider not found');
    }
    
    const response = await provider.markAsRead(request);
    if (response.success) {
      await this.updateEmailFlags(request.messageIds, { seen: true });
    }
    return response;
  }

  async markAsUnread(accountId, request) {
    const provider = await this.getProvider(accountId);
    if (!provider) {
      throw new Error('Provider not found');
    }
    
    const response = await provider.markAsUnread(request);
    if (response.success) {
      await this.updateEmailFlags(request.messageIds, { seen: false });
    }
    return response;
  }

  async markAsFlagged(accountId, request) {
    const provider = await this.getProvider(accountId);
    if (!provider) {
      throw new Error('Provider not found');
    }
    
    const response = await provider.markAsFlagged(request);
    if (response.success) {
      await this.updateEmailFlags(request.messageIds, { flagged: true });
    }
    return response;
  }

  async markAsUnflagged(accountId, request) {
    const provider = await this.getProvider(accountId);
    if (!provider) {
      throw new Error('Provider not found');
    }
    
    const response = await provider.markAsUnflagged(request);
    if (response.success) {
      await this.updateEmailFlags(request.messageIds, { flagged: false });
    }
    return response;
  }

  async deleteEmails(accountId, messageIds, folder) {
    const provider = await this.getProvider(accountId);
    if (!provider) {
      throw new Error('Provider not found');
    }
    
    await provider.deleteEmails(messageIds, folder);
    await this.updateEmailFlags(messageIds, { deleted: true });
  }

  async moveEmails(accountId, messageIds, fromFolder, toFolder) {
    const provider = await this.getProvider(accountId);
    if (!provider) {
      throw new Error('Provider not found');
    }
    
    await provider.moveEmails(messageIds, fromFolder, toFolder);
    
    // Update local cache
    await Email.updateMany(
      { messageId: { $in: messageIds } },
      { $set: { folder: toFolder } }
    );
  }

  async sendEmail(accountId, request) {
    const provider = await this.getProvider(accountId);
    if (!provider) {
      throw new Error('Provider not found');
    }
    
    const capabilities = provider.getCapabilities();
    if (!capabilities.supportsSending) {
      return {
        success: false,
        error: {
          code: 'SENDING_NOT_SUPPORTED',
          message: 'Provider does not support sending emails',
          provider: provider.config?.type || 'unknown'
        }
      };
    }
    
    return provider.sendEmail(request);
  }

  async replyToEmail(accountId, originalMessageId, options) {
    const provider = await this.getProvider(accountId);
    if (!provider) {
      throw new Error('Provider not found');
    }
    
    return provider.replyToEmail(originalMessageId, options);
  }

  async forwardEmail(accountId, originalMessageId, to, message) {
    const provider = await this.getProvider(accountId);
    if (!provider) {
      throw new Error('Provider not found');
    }
    
    return provider.forwardEmail(originalMessageId, to, message);
  }

  async syncAccount(accountId, userId) {
    const provider = await this.getProvider(accountId);
    if (!provider) {
      throw new Error('Provider not found');
    }

    try {
      // Get all folders
      const folders = await provider.getFolders();
      
      // Sync each folder
      for (const folder of folders) {
        try {
          const emails = await provider.getEmails(folder.name, 100);
          await this.cacheEmails(emails, userId, accountId);
        } catch (error) {
          console.error(`Error syncing folder ${folder.name}:`, error);
        }
      }
    } catch (error) {
      console.error(`Error syncing account ${accountId}:`, error);
      throw error;
    }
  }

  async cacheEmails(emails, userId, accountId) {
    for (const email of emails) {
      try {
        await Email.findOneAndUpdate(
          { messageId: email.messageId, userId },
          {
            ...email,
            userId,
            accountId,
            folder: email.folderId // Map folderId to folder for backward compatibility
          },
          { upsert: true, new: true }
        );
      } catch (error) {
        console.error('Error caching email:', error);
      }
    }
  }

  async updateEmailFlags(messageIds, flags) {
    await Email.updateMany(
      { messageId: { $in: messageIds } },
      { $set: { [`flags.${Object.keys(flags)[0]}`]: Object.values(flags)[0] } }
    );
  }

  convertToInterface(doc) {
    return doc.toObject();
  }

  async searchEmailsLocally(userId, accountId, request) {
    const searchQuery = Email.search(userId, {
      ...request,
      accountId
    });
    
    const results = await searchQuery.exec();
    return results.map(this.convertToInterface);
  }

  buildThreadsFromEmails(emails) {
    const threadMap = new Map();
    
    emails.forEach(email => {
      const threadId = this.getThreadIdFromSubject(email.subject);
      
      if (!threadMap.has(threadId)) {
        threadMap.set(threadId, {
          id: threadId,
          subject: email.subject.replace(/^(Re:|Fwd?:)\s*/i, ''),
          participants: [],
          messageCount: 0,
          unreadCount: 0,
          lastMessageDate: email.date,
          emails: [],
          hasAttachments: false
        });
      }
      
      const thread = threadMap.get(threadId);
      thread.emails.push(email);
      thread.messageCount++;
      
      if (!email.flags.seen) {
        thread.unreadCount++;
      }
      
      if (email.attachments && email.attachments.length > 0) {
        thread.hasAttachments = true;
      }
      
      if (email.date > thread.lastMessageDate) {
        thread.lastMessageDate = email.date;
      }
      
      // Add participants
      const allAddresses = [email.from, ...email.to, ...(email.cc || [])];
      allAddresses.forEach(addr => {
        if (!thread.participants.find(p => p.address === addr.address)) {
          thread.participants.push(addr);
        }
      });
    });
    
    return Array.from(threadMap.values()).sort(
      (a, b) => b.lastMessageDate.getTime() - a.lastMessageDate.getTime()
    );
  }

  getThreadIdFromSubject(subject) {
    // Simple subject-based threading
    const cleanSubject = subject.replace(/^(Re:|Fwd?:)\s*/i, '').trim();
    return Buffer.from(cleanSubject).toString('base64');
  }
}