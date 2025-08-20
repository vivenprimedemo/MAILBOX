import { GmailProvider } from '../providers/GmailProvider.js';
import { IMAPProvider } from '../providers/IMAPProvider.js';
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
        // Outlook can use IMAP or Graph API - implementing as IMAP for now
        const outlookConfig = {
          ...config,
          type: 'imap',
          host: 'outlook.office365.com',
          port: 993,
          secure: true
        };
        provider = new IMAPProvider(outlookConfig);
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

  async getFolders(accountId) {
    const provider = await this.getProvider(accountId);
    if (!provider) {
      throw new Error('Provider not found');
    }
    return provider.getFolders();
  }

  async getEmails(accountId, userId, folder, limit, offset, useCache = true) {
    const provider = await this.getProvider(accountId);
    if (!provider) {
      throw new Error('Provider not found');
    }

    // Try to get from cache first
    if (useCache) {
      const cachedEmails = await Email.find({
        userId,
        accountId,
        folder
      }).sort({ date: -1 }).limit(limit || 50).skip(offset || 0);

      if (cachedEmails.length > 0) {
        return cachedEmails.map(this.convertToInterface);
      }
    }

    // Fetch from provider and cache
    const emails = await provider.getEmails(folder, limit, offset);
    await this.cacheEmails(emails, userId, accountId);
    
    return emails;
  }

  async getEmail(accountId, messageId, folder) {
    const provider = await this.getProvider(accountId);
    if (!provider) {
      throw new Error('Provider not found');
    }
    return provider.getEmail(messageId, folder);
  }

  async getThreads(accountId, userId, folder, limit, offset) {
    const provider = await this.getProvider(accountId);
    if (!provider) {
      throw new Error('Provider not found');
    }

    const capabilities = provider.getCapabilities();
    if (!capabilities.supportsThreading) {
      // Fall back to grouping emails by subject
      const emails = await this.getEmails(accountId, userId, folder, limit, offset);
      return this.buildThreadsFromEmails(emails);
    }

    return provider.getThreads(folder, limit, offset);
  }

  async getThread(accountId, threadId) {
    const provider = await this.getProvider(accountId);
    if (!provider) {
      throw new Error('Provider not found');
    }
    return provider.getThread(threadId);
  }

  async searchEmails(accountId, userId, query) {
    const provider = await this.getProvider(accountId);
    if (!provider) {
      throw new Error('Provider not found');
    }

    const capabilities = provider.getCapabilities();
    if (!capabilities.supportsSearch) {
      // Fall back to local search
      return this.searchEmailsLocally(userId, accountId, query);
    }

    return provider.searchEmails(query);
  }

  async markAsRead(accountId, messageIds, folder) {
    const provider = await this.getProvider(accountId);
    if (!provider) {
      throw new Error('Provider not found');
    }
    
    await provider.markAsRead(messageIds, folder);
    await this.updateEmailFlags(messageIds, { seen: true });
  }

  async markAsUnread(accountId, messageIds, folder) {
    const provider = await this.getProvider(accountId);
    if (!provider) {
      throw new Error('Provider not found');
    }
    
    await provider.markAsUnread(messageIds, folder);
    await this.updateEmailFlags(messageIds, { seen: false });
  }

  async markAsFlagged(accountId, messageIds, folder) {
    const provider = await this.getProvider(accountId);
    if (!provider) {
      throw new Error('Provider not found');
    }
    
    await provider.markAsFlagged(messageIds, folder);
    await this.updateEmailFlags(messageIds, { flagged: true });
  }

  async markAsUnflagged(accountId, messageIds, folder) {
    const provider = await this.getProvider(accountId);
    if (!provider) {
      throw new Error('Provider not found');
    }
    
    await provider.markAsUnflagged(messageIds, folder);
    await this.updateEmailFlags(messageIds, { flagged: false });
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

  async sendEmail(accountId, options) {
    const provider = await this.getProvider(accountId);
    if (!provider) {
      throw new Error('Provider not found');
    }
    
    const capabilities = provider.getCapabilities();
    if (!capabilities.supportsSending) {
      throw new Error('Provider does not support sending emails');
    }
    
    return provider.sendEmail(options);
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
            accountId
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

  async searchEmailsLocally(userId, accountId, query) {
    const searchQuery = Email.search(userId, {
      ...query,
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