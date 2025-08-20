import { EventEmitter } from 'events';

export class BaseEmailProvider {
  config;
  isConnected = false;
  eventEmitter;
  
  constructor(config) {
    this.config = config;
    this.eventEmitter = new EventEmitter();
  }

  buildThreads(emails) {
    const threadMap = new Map();
    
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
    
    // Sort threads by last message date
    return Array.from(threadMap.values()).sort(
      (a, b) => b.lastMessageDate.getTime() - a.lastMessageDate.getTime()
    );
  }

  generateMessageId() {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}@emailclient.local`;
  }

  parseReferences(references) {
    if (!references) return [];
    return references.filter(ref => ref.trim().length > 0);
  }

  onNewEmail(callback) {
    this.eventEmitter.on('newEmail', callback);
  }

  onEmailUpdate(callback) {
    this.eventEmitter.on('emailUpdate', callback);
  }

  emitNewEmail(email) {
    this.eventEmitter.emit('newEmail', email);
  }

  emitEmailUpdate(email) {
    this.eventEmitter.emit('emailUpdate', email);
  }

  getConnectionStatus() {
    return this.isConnected;
  }

  // Abstract methods that must be implemented by subclasses
  getCapabilities() {
    throw new Error('Method must be implemented by subclass');
  }
  
  connect() {
    throw new Error('Method must be implemented by subclass');
  }

  disconnect() {
    throw new Error('Method must be implemented by subclass');
  }

  authenticate(credentials) {
    throw new Error('Method must be implemented by subclass');
  }
  
  getFolders() {
    throw new Error('Method must be implemented by subclass');
  }

  getEmails(folder, limit, offset) {
    throw new Error('Method must be implemented by subclass');
  }

  getEmail(messageId, folder) {
    throw new Error('Method must be implemented by subclass');
  }

  getThread(threadId) {
    throw new Error('Method must be implemented by subclass');
  }

  getThreads(folder, limit, offset) {
    throw new Error('Method must be implemented by subclass');
  }
  
  searchEmails(query) {
    throw new Error('Method must be implemented by subclass');
  }

  searchThreads(query) {
    throw new Error('Method must be implemented by subclass');
  }
  
  markAsRead(messageIds, folder) {
    throw new Error('Method must be implemented by subclass');
  }

  markAsUnread(messageIds, folder) {
    throw new Error('Method must be implemented by subclass');
  }

  markAsFlagged(messageIds, folder) {
    throw new Error('Method must be implemented by subclass');
  }

  markAsUnflagged(messageIds, folder) {
    throw new Error('Method must be implemented by subclass');
  }

  deleteEmails(messageIds, folder) {
    throw new Error('Method must be implemented by subclass');
  }

  moveEmails(messageIds, fromFolder, toFolder) {
    throw new Error('Method must be implemented by subclass');
  }
  
  sendEmail(options) {
    throw new Error('Method must be implemented by subclass');
  }

  replyToEmail(originalMessageId, options) {
    throw new Error('Method must be implemented by subclass');
  }

  forwardEmail(originalMessageId, to, message) {
    throw new Error('Method must be implemented by subclass');
  }
  
  sync(folder) {
    throw new Error('Method must be implemented by subclass');
  }
}