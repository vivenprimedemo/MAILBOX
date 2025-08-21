import { EventEmitter } from 'events';
import { 
  createApiResponse, 
  createApiError, 
  normalizeEmailAddresses,
  createEmailFlags,
  ProviderCapabilities
} from '../interfaces/EmailInterfaces.js';

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

  // Abstract methods that must be implemented by subclasses - Now with unified interfaces
  
  /**
   * Get provider capabilities
   * @returns {ProviderCapabilities}
   */
  getCapabilities() {
    throw new Error('Method must be implemented by subclass');
  }
  
  /**
   * Connect to the provider
   * @returns {Promise<ApiResponse>}
   */
  async connect() {
    throw new Error('Method must be implemented by subclass');
  }

  /**
   * Disconnect from the provider
   * @returns {Promise<ApiResponse>}
   */
  async disconnect() {
    throw new Error('Method must be implemented by subclass');
  }

  /**
   * Authenticate with the provider
   * @param {AuthRequest} credentials - Authentication credentials
   * @returns {Promise<ApiResponse>}
   */
  async authenticate(credentials) {
    throw new Error('Method must be implemented by subclass');
  }
  
  /**
   * Get all folders
   * @param {FolderRequest} request - Folder query parameters
   * @returns {Promise<ApiResponse<EmailFolder[]>>}
   */
  async getFolders(request = {}) {
    throw new Error('Method must be implemented by subclass');
  }

  /**
   * Get emails from a folder
   * @param {EmailListRequest} request - Email query parameters
   * @returns {Promise<ApiResponse<Email[]>>}
   */
  async getEmails(request) {
    throw new Error('Method must be implemented by subclass');
  }

  /**
   * Get a specific email
   * @param {string} messageId - Message ID
   * @param {string} folderId - Folder ID (optional)
   * @returns {Promise<ApiResponse<Email>>}
   */
  async getEmail(messageId, folderId) {
    throw new Error('Method must be implemented by subclass');
  }

  /**
   * Get a specific thread
   * @param {string} threadId - Thread ID
   * @returns {Promise<ApiResponse<EmailThread>>}
   */
  async getThread(threadId) {
    throw new Error('Method must be implemented by subclass');
  }

  /**
   * Get threads from a folder
   * @param {ThreadRequest} request - Thread query parameters
   * @returns {Promise<ApiResponse<EmailThread[]>>}
   */
  async getThreads(request) {
    throw new Error('Method must be implemented by subclass');
  }
  
  /**
   * Search emails
   * @param {EmailSearchRequest} request - Search parameters
   * @returns {Promise<ApiResponse<Email[]>>}
   */
  async searchEmails(request) {
    throw new Error('Method must be implemented by subclass');
  }

  /**
   * Search threads
   * @param {EmailSearchRequest} request - Search parameters
   * @returns {Promise<ApiResponse<EmailThread[]>>}
   */
  async searchThreads(request) {
    throw new Error('Method must be implemented by subclass');
  }
  
  /**
   * Mark emails as read
   * @param {EmailActionRequest} request - Action parameters
   * @returns {Promise<ApiResponse>}
   */
  async markAsRead(request) {
    throw new Error('Method must be implemented by subclass');
  }

  /**
   * Mark emails as unread
   * @param {EmailActionRequest} request - Action parameters
   * @returns {Promise<ApiResponse>}
   */
  async markAsUnread(request) {
    throw new Error('Method must be implemented by subclass');
  }

  /**
   * Mark emails as flagged
   * @param {EmailActionRequest} request - Action parameters
   * @returns {Promise<ApiResponse>}
   */
  async markAsFlagged(request) {
    throw new Error('Method must be implemented by subclass');
  }

  /**
   * Mark emails as unflagged
   * @param {EmailActionRequest} request - Action parameters
   * @returns {Promise<ApiResponse>}
   */
  async markAsUnflagged(request) {
    throw new Error('Method must be implemented by subclass');
  }

  /**
   * Delete emails
   * @param {EmailActionRequest} request - Action parameters
   * @returns {Promise<ApiResponse>}
   */
  async deleteEmails(request) {
    throw new Error('Method must be implemented by subclass');
  }

  /**
   * Move emails between folders
   * @param {MoveEmailRequest} request - Move parameters
   * @returns {Promise<ApiResponse>}
   */
  async moveEmails(request) {
    throw new Error('Method must be implemented by subclass');
  }
  
  /**
   * Send email
   * @param {SendEmailRequest} request - Email to send
   * @returns {Promise<ApiResponse>}
   */
  async sendEmail(request) {
    throw new Error('Method must be implemented by subclass');
  }

  /**
   * Reply to email
   * @param {ReplyEmailRequest} request - Reply parameters
   * @returns {Promise<ApiResponse>}
   */
  async replyToEmail(request) {
    throw new Error('Method must be implemented by subclass');
  }

  /**
   * Forward email
   * @param {ForwardEmailRequest} request - Forward parameters
   * @returns {Promise<ApiResponse>}
   */
  async forwardEmail(request) {
    throw new Error('Method must be implemented by subclass');
  }
  
  /**
   * Sync folder for real-time updates
   * @param {string} folderId - Folder to sync
   * @returns {Promise<ApiResponse>}
   */
  async sync(folderId) {
    throw new Error('Method must be implemented by subclass');
  }

  // Helper methods for subclasses to use
  
  /**
   * Create a successful API response
   */
  createSuccessResponse(data, metadata = {}) {
    return createApiResponse(data, {
      provider: this.config?.type || 'unknown',
      ...metadata
    });
  }

  /**
   * Create an error API response
   */
  createErrorResponse(code, message, details = null) {
    return createApiError(code, message, details, this.config?.type || 'unknown');
  }

  /**
   * Normalize email addresses to standard format
   */
  normalizeAddresses(addresses) {
    return normalizeEmailAddresses(addresses);
  }

  /**
   * Create standard email flags
   */
  createStandardFlags(flags) {
    return createEmailFlags(flags);
  }
}