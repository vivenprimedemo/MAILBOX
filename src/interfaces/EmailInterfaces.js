/**
 * Unified Email API Interfaces
 * This file defines standardized request and response structures for all email providers
 */

// ============================================================================
// REQUEST INTERFACES
// ============================================================================

/**
 * Standard authentication credentials
 */
export const AuthRequest = {
  // OAuth providers (Gmail, Outlook)
  accessToken: undefined,
  refreshToken: undefined,
  clientId: undefined,
  clientSecret: undefined,
  
  // IMAP/SMTP providers
  username: undefined,
  password: undefined,
  host: undefined,
  port: undefined,
  secure: undefined,
  
  // Common
  providerType: undefined // 'gmail', 'outlook', 'imap'
};

/**
 * Standard folder query parameters
 */
export const FolderRequest = {
  includeHidden: false,
  includeSystemFolders: true
};

/**
 * Standard email query parameters
 */
export const EmailListRequest = {
  folderId: undefined,
  limit: 50,
  offset: 0,
  orderBy: 'date',
  order: 'desc', // 'asc' or 'desc'
  includeBody: true,
  includeAttachments: true
};

/**
 * Standard email search parameters
 */
export const EmailSearchRequest = {
  query: undefined,
  from: undefined,
  to: undefined,
  subject: undefined,
  body: undefined,
  hasAttachment: undefined,
  isUnread: undefined,
  isFlagged: undefined,
  dateFrom: undefined,
  dateTo: undefined,
  folderId: undefined,
  limit: 50,
  offset: 0
};

/**
 * Standard thread query parameters
 */
export const ThreadRequest = {
  folderId: undefined,
  limit: 50,
  offset: 0,
  includeEmails: true
};

/**
 * Standard email actions parameters
 */
export const EmailActionRequest = {
  messageIds: [],
  folderId: undefined
};

/**
 * Standard move emails parameters
 */
export const MoveEmailRequest = {
  messageIds: [],
  fromFolderId: undefined,
  toFolderId: undefined
};

/**
 * Standard send email parameters
 */
export const SendEmailRequest = {
  to: [], // Array of EmailAddress objects
  cc: [], // Array of EmailAddress objects
  bcc: [], // Array of EmailAddress objects
  replyTo: [], // Array of EmailAddress objects
  subject: '',
  bodyText: undefined,
  bodyHtml: undefined,
  attachments: [], // Array of EmailAttachment objects
  inReplyTo: undefined,
  references: [],
  priority: 'normal', // 'low', 'normal', 'high'
  isRead: false,
  isDraft: false
};

/**
 * Standard reply email parameters
 */
export const ReplyEmailRequest = {
  originalMessageId: undefined,
  replyAll: false,
  bodyText: undefined,
  bodyHtml: undefined,
  attachments: [],
  includeOriginal: true
};

/**
 * Standard forward email parameters
 */
export const ForwardEmailRequest = {
  originalMessageId: undefined,
  to: [], // Array of EmailAddress objects
  bodyText: undefined,
  bodyHtml: undefined,
  attachments: [],
  includeOriginal: true
};

// ============================================================================
// RESPONSE INTERFACES
// ============================================================================

/**
 * Standard email address structure
 */
export const EmailAddress = {
  name: '',
  address: ''
};

/**
 * Standard email attachment structure
 */
export const EmailAttachment = {
  id: undefined,
  filename: '',
  contentType: 'application/octet-stream',
  size: 0,
  contentId: undefined,
  isInline: false,
  data: undefined // Base64 encoded content when fetched
};

/**
 * Standard email flags structure
 */
export const EmailFlags = {
  seen: false,
  flagged: false,
  draft: false,
  answered: false,
  deleted: false,
  recent: false
};

/**
 * Standard folder structure
 */
export const EmailFolder = {
  id: '',
  name: '',
  displayName: '',
  type: 'custom', // 'inbox', 'sent', 'drafts', 'trash', 'spam', 'archive', 'custom'
  unreadCount: 0,
  totalCount: 0,
  parentId: undefined,
  children: [],
  isSystem: false,
  canDelete: true,
  canRename: true
};

/**
 * Standard email structure
 */
export const Email = {
  id: '',
  messageId: '',
  threadId: undefined,
  subject: '',
  from: EmailAddress,
  to: [], // Array of EmailAddress
  cc: [], // Array of EmailAddress
  bcc: [], // Array of EmailAddress
  replyTo: [], // Array of EmailAddress
  date: new Date(),
  bodyText: '',
  bodyHtml: '',
  snippet: '', // Short preview text
  attachments: [], // Array of EmailAttachment
  flags: EmailFlags,
  labels: [], // Provider-specific labels/categories
  folderId: '',
  provider: '', // 'gmail', 'outlook', 'imap'
  inReplyTo: undefined,
  references: [],
  priority: 'normal', // 'low', 'normal', 'high'
  size: 0, // Email size in bytes
  isEncrypted: false,
  isSigned: false
};

/**
 * Standard thread structure
 */
export const EmailThread = {
  id: '',
  subject: '',
  participants: [], // Array of EmailAddress
  messageCount: 0,
  unreadCount: 0,
  lastMessageDate: new Date(),
  firstMessageDate: new Date(),
  emails: [], // Array of Email objects
  hasAttachments: false,
  labels: [],
  folderId: '',
  isStarred: false,
  snippet: '' // Preview from latest message
};

/**
 * Standard API response wrapper
 */
export const ApiResponse = {
  success: true,
  data: undefined,
  error: undefined,
  metadata: {
    total: 0,
    limit: 0,
    offset: 0,
    hasMore: false,
    nextPageToken: undefined,
    provider: '',
    timestamp: new Date()
  }
};

/**
 * Standard error structure
 */
export const ApiError = {
  code: '',
  message: '',
  details: undefined,
  provider: '',
  timestamp: new Date()
};

/**
 * Provider capabilities structure
 */
export const ProviderCapabilities = {
  supportsThreading: false,
  supportsLabels: false,
  supportsFolders: false,
  supportsSearch: false,
  supportsRealTimeSync: false,
  supportsSending: false,
  supportsAttachments: false,
  supportsEncryption: false,
  supportsPush: false,
  maxAttachmentSize: 0,
  searchOperators: [], // Supported search operators
  folderOperations: [], // Supported folder operations
  supportedAuthTypes: [] // Supported authentication types
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Create a standardized API response
 */
export function createApiResponse(data, metadata = {}) {
  return {
    success: true,
    data,
    error: null,
    metadata: {
      total: 0,
      limit: 50,
      offset: 0,
      hasMore: false,
      nextPageToken: null,
      provider: '',
      timestamp: new Date(),
      ...metadata
    }
  };
}

/**
 * Create a standardized API error response
 */
export function createApiError(code, message, details = null, provider = '') {
  return {
    success: false,
    data: null,
    error: {
      code,
      message,
      details,
      provider,
      timestamp: new Date()
    },
    metadata: null
  };
}

/**
 * Validate email address structure
 */
export function validateEmailAddress(address) {
  if (!address || typeof address !== 'object') {
    return false;
  }
  return address.hasOwnProperty('address') && typeof address.address === 'string';
}

/**
 * Normalize email address to standard format
 */
export function normalizeEmailAddress(address) {
  if (!address) {
    return { name: '', address: '' };
  }
  
  if (typeof address === 'string') {
    return { name: '', address };
  }
  
  return {
    name: address.name || '',
    address: address.address || address.email || ''
  };
}

/**
 * Normalize email addresses array
 */
export function normalizeEmailAddresses(addresses) {
  if (!Array.isArray(addresses)) {
    return [];
  }
  return addresses.map(normalizeEmailAddress);
}

/**
 * Create standard email flags
 */
export function createEmailFlags(flags = {}) {
  return {
    seen: Boolean(flags.seen),
    flagged: Boolean(flags.flagged || flags.starred),
    draft: Boolean(flags.draft),
    answered: Boolean(flags.answered || flags.replied),
    deleted: Boolean(flags.deleted),
    recent: Boolean(flags.recent)
  };
}