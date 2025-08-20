import { IEmailProvider, IEmailProviderConfig } from '../interfaces/IEmailProvider';
import { IEmail, IEmailThread, IFolder, IEmailSearchQuery, IEmailAddress } from '../interfaces/IEmail';
import { ISendEmailOptions } from '../interfaces/IEmailProvider';
import { GmailProvider } from '../providers/GmailProvider';
import { IMAPProvider } from '../providers/IMAPProvider';
import { Email } from '../models/Email';

export class EmailService {
  private providers: Map<string, IEmailProvider> = new Map();
  private providerInstances: Map<string, IEmailProvider> = new Map();

  constructor() {}

  createProvider(config: IEmailProviderConfig, accountId: string): IEmailProvider {
    let provider: IEmailProvider;

    switch (config.type) {
      case 'gmail':
        provider = new GmailProvider(config);
        break;
      case 'imap':
        provider = new IMAPProvider(config);
        break;
      case 'outlook':
        // Outlook can use IMAP or Graph API - implementing as IMAP for now
        const outlookConfig: IEmailProviderConfig = {
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

  async getProvider(accountId: string): Promise<IEmailProvider | null> {
    return this.providerInstances.get(accountId) || null;
  }

  async removeProvider(accountId: string): Promise<void> {
    const provider = this.providerInstances.get(accountId);
    if (provider) {
      await provider.disconnect();
      this.providerInstances.delete(accountId);
    }
  }

  async connectProvider(accountId: string, config: IEmailProviderConfig): Promise<boolean> {
    try {
      const provider = this.createProvider(config, accountId);
      await provider.connect();
      return true;
    } catch (error) {
      console.error(`Failed to connect provider for account ${accountId}:`, error);
      return false;
    }
  }

  async getFolders(accountId: string): Promise<IFolder[]> {
    const provider = await this.getProvider(accountId);
    if (!provider) {
      throw new Error('Provider not found');
    }
    return provider.getFolders();
  }

  async getEmails(
    accountId: string, 
    userId: string,
    folder: string, 
    limit?: number, 
    offset?: number,
    useCache: boolean = true
  ): Promise<IEmail[]> {
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

  async getEmail(accountId: string, messageId: string, folder?: string): Promise<IEmail | null> {
    const provider = await this.getProvider(accountId);
    if (!provider) {
      throw new Error('Provider not found');
    }
    return provider.getEmail(messageId, folder);
  }

  async getThreads(
    accountId: string, 
    userId: string,
    folder: string, 
    limit?: number, 
    offset?: number
  ): Promise<IEmailThread[]> {
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

  async getThread(accountId: string, threadId: string): Promise<IEmailThread | null> {
    const provider = await this.getProvider(accountId);
    if (!provider) {
      throw new Error('Provider not found');
    }
    return provider.getThread(threadId);
  }

  async searchEmails(
    accountId: string, 
    userId: string,
    query: IEmailSearchQuery
  ): Promise<IEmail[]> {
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

  async markAsRead(accountId: string, messageIds: string[], folder?: string): Promise<void> {
    const provider = await this.getProvider(accountId);
    if (!provider) {
      throw new Error('Provider not found');
    }
    
    await provider.markAsRead(messageIds, folder);
    await this.updateEmailFlags(messageIds, { seen: true });
  }

  async markAsUnread(accountId: string, messageIds: string[], folder?: string): Promise<void> {
    const provider = await this.getProvider(accountId);
    if (!provider) {
      throw new Error('Provider not found');
    }
    
    await provider.markAsUnread(messageIds, folder);
    await this.updateEmailFlags(messageIds, { seen: false });
  }

  async markAsFlagged(accountId: string, messageIds: string[], folder?: string): Promise<void> {
    const provider = await this.getProvider(accountId);
    if (!provider) {
      throw new Error('Provider not found');
    }
    
    await provider.markAsFlagged(messageIds, folder);
    await this.updateEmailFlags(messageIds, { flagged: true });
  }

  async markAsUnflagged(accountId: string, messageIds: string[], folder?: string): Promise<void> {
    const provider = await this.getProvider(accountId);
    if (!provider) {
      throw new Error('Provider not found');
    }
    
    await provider.markAsUnflagged(messageIds, folder);
    await this.updateEmailFlags(messageIds, { flagged: false });
  }

  async deleteEmails(accountId: string, messageIds: string[], folder?: string): Promise<void> {
    const provider = await this.getProvider(accountId);
    if (!provider) {
      throw new Error('Provider not found');
    }
    
    await provider.deleteEmails(messageIds, folder);
    await this.updateEmailFlags(messageIds, { deleted: true });
  }

  async moveEmails(accountId: string, messageIds: string[], fromFolder: string, toFolder: string): Promise<void> {
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

  async sendEmail(accountId: string, options: ISendEmailOptions): Promise<string> {
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

  async replyToEmail(
    accountId: string, 
    originalMessageId: string, 
    options: Omit<ISendEmailOptions, 'to' | 'subject' | 'inReplyTo' | 'references'>
  ): Promise<string> {
    const provider = await this.getProvider(accountId);
    if (!provider) {
      throw new Error('Provider not found');
    }
    
    return provider.replyToEmail(originalMessageId, options);
  }

  async forwardEmail(
    accountId: string, 
    originalMessageId: string, 
    to: IEmailAddress[], 
    message?: string
  ): Promise<string> {
    const provider = await this.getProvider(accountId);
    if (!provider) {
      throw new Error('Provider not found');
    }
    
    return provider.forwardEmail(originalMessageId, to, message);
  }

  async syncAccount(accountId: string, userId: string): Promise<void> {
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

  private async cacheEmails(emails: IEmail[], userId: string, accountId: string): Promise<void> {
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

  private async updateEmailFlags(messageIds: string[], flags: Partial<IEmail['flags']>): Promise<void> {
    await Email.updateMany(
      { messageId: { $in: messageIds } },
      { $set: { [`flags.${Object.keys(flags)[0]}`]: Object.values(flags)[0] } }
    );
  }

  private convertToInterface(doc: any): IEmail {
    return doc.toObject();
  }

  private async searchEmailsLocally(userId: string, accountId: string, query: IEmailSearchQuery): Promise<IEmail[]> {
    const searchQuery = Email.search(userId, {
      ...query,
      accountId
    });
    
    const results = await searchQuery.exec();
    return results.map(this.convertToInterface);
  }

  private buildThreadsFromEmails(emails: IEmail[]): IEmailThread[] {
    const threadMap = new Map<string, IEmailThread>();
    
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
      
      const thread = threadMap.get(threadId)!;
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

  private getThreadIdFromSubject(subject: string): string {
    // Simple subject-based threading
    const cleanSubject = subject.replace(/^(Re:|Fwd?:)\s*/i, '').trim();
    return Buffer.from(cleanSubject).toString('base64');
  }
}