import { EventEmitter } from 'events';
import { IEmailProvider, IEmailProviderConfig, IEmailProviderCapabilities } from '../interfaces/IEmailProvider';
import { IEmail, IEmailThread, IFolder, IEmailSearchQuery } from '../interfaces/IEmail';

export abstract class BaseEmailProvider extends IEmailProvider {
  protected eventEmitter: EventEmitter;
  
  constructor(config: IEmailProviderConfig) {
    super(config);
    this.eventEmitter = new EventEmitter();
  }

  protected buildThreads(emails: IEmail[]): IEmailThread[] {
    const threadMap = new Map<string, IEmailThread>();
    
    emails.forEach(email => {
      const threadId = email.threadId || email.messageId;
      
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
    
    // Sort threads by last message date
    return Array.from(threadMap.values()).sort(
      (a, b) => b.lastMessageDate.getTime() - a.lastMessageDate.getTime()
    );
  }

  protected generateMessageId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}@emailclient.local`;
  }

  protected parseReferences(references?: string[]): string[] {
    if (!references) return [];
    return references.filter(ref => ref.trim().length > 0);
  }

  onNewEmail(callback: (email: IEmail) => void): void {
    this.eventEmitter.on('newEmail', callback);
  }

  onEmailUpdate(callback: (email: IEmail) => void): void {
    this.eventEmitter.on('emailUpdate', callback);
  }

  protected emitNewEmail(email: IEmail): void {
    this.eventEmitter.emit('newEmail', email);
  }

  protected emitEmailUpdate(email: IEmail): void {
    this.eventEmitter.emit('emailUpdate', email);
  }
}