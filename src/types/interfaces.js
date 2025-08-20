/**
 * @fileoverview JSDoc type definitions converted from TypeScript interfaces
 * This file contains type definitions for the email client application.
 */

/**
 * @typedef {Object} IEmailAddress
 * @property {string} [name] - Display name for the email address
 * @property {string} address - The email address
 */

/**
 * @typedef {Object} IAttachment
 * @property {string} filename - Name of the attachment file
 * @property {string} contentType - MIME type of the attachment
 * @property {number} size - Size of the attachment in bytes
 * @property {string} [contentId] - Content ID for inline attachments
 * @property {Buffer} [data] - Attachment data buffer
 * @property {string} [url] - URL to the attachment if stored externally
 */

/**
 * @typedef {Object} IEmailFlags
 * @property {boolean} seen - Whether the email has been read
 * @property {boolean} flagged - Whether the email is flagged/starred
 * @property {boolean} draft - Whether the email is a draft
 * @property {boolean} answered - Whether the email has been replied to
 * @property {boolean} deleted - Whether the email is deleted
 */

/**
 * @typedef {Object} IEmail
 * @property {string} id - Unique identifier for the email
 * @property {string} messageId - Message ID from email headers
 * @property {string} [threadId] - Thread identifier for grouping emails
 * @property {string} subject - Email subject line
 * @property {IEmailAddress} from - Sender information
 * @property {IEmailAddress[]} to - Recipients
 * @property {IEmailAddress[]} [cc] - CC recipients
 * @property {IEmailAddress[]} [bcc] - BCC recipients
 * @property {IEmailAddress[]} [replyTo] - Reply-to addresses
 * @property {Date} date - Email date
 * @property {Date} [receivedDate] - Date when email was received
 * @property {string} [bodyText] - Plain text body
 * @property {string} [bodyHtml] - HTML body
 * @property {IAttachment[]} [attachments] - Email attachments
 * @property {IEmailFlags} flags - Email flags
 * @property {string[]} [labels] - Email labels/tags
 * @property {string} folder - Folder containing the email
 * @property {string} provider - Email provider name
 * @property {string} [raw] - Raw email content
 * @property {string} [inReplyTo] - Message ID this email is replying to
 * @property {string[]} [references] - Referenced message IDs
 */

/**
 * @typedef {Object} IEmailThread
 * @property {string} id - Thread identifier
 * @property {string} subject - Thread subject
 * @property {IEmailAddress[]} participants - All thread participants
 * @property {number} messageCount - Total messages in thread
 * @property {number} unreadCount - Unread messages in thread
 * @property {Date} lastMessageDate - Date of last message
 * @property {IEmail[]} emails - All emails in the thread
 * @property {string[]} [labels] - Thread labels
 * @property {boolean} hasAttachments - Whether thread has attachments
 */

/**
 * @typedef {'inbox' | 'sent' | 'drafts' | 'trash' | 'spam' | 'custom'} FolderType
 */

/**
 * @typedef {Object} IFolder
 * @property {string} name - Internal folder name
 * @property {string} displayName - Display name for the folder
 * @property {FolderType} type - Folder type
 * @property {number} unreadCount - Number of unread emails
 * @property {number} totalCount - Total number of emails
 * @property {string} [parent] - Parent folder name
 * @property {IFolder[]} [children] - Child folders
 */

/**
 * @typedef {Object} IDateRange
 * @property {Date} start - Start date
 * @property {Date} end - End date
 */

/**
 * @typedef {Object} IEmailSearchQuery
 * @property {string} [query] - Search query text
 * @property {string} [from] - From email address filter
 * @property {string} [to] - To email address filter
 * @property {string} [subject] - Subject filter
 * @property {boolean} [hasAttachment] - Filter by attachment presence
 * @property {boolean} [isUnread] - Filter by read status
 * @property {boolean} [isFlagged] - Filter by flagged status
 * @property {string} [folder] - Folder to search in
 * @property {IDateRange} [dateRange] - Date range filter
 * @property {number} [limit] - Maximum results to return
 * @property {number} [offset] - Results offset for pagination
 */

/**
 * @typedef {'gmail' | 'outlook' | 'imap' | 'pop3'} ProviderType
 */

/**
 * @typedef {Object} IEmailProviderAuth
 * @property {string} user - Username or email
 * @property {string} [pass] - Password
 * @property {string} [accessToken] - OAuth access token
 * @property {string} [refreshToken] - OAuth refresh token
 * @property {string} [clientId] - OAuth client ID
 * @property {string} [clientSecret] - OAuth client secret
 */

/**
 * @typedef {Object} IEmailProviderTLS
 * @property {boolean} [rejectUnauthorized] - Reject unauthorized certificates
 */

/**
 * @typedef {Object} IEmailProviderConfig
 * @property {ProviderType} type - Provider type
 * @property {string} [host] - Server hostname
 * @property {number} [port] - Server port
 * @property {boolean} [secure] - Use secure connection
 * @property {IEmailProviderAuth} auth - Authentication configuration
 * @property {IEmailProviderTLS} [tls] - TLS configuration
 */

/**
 * @typedef {Object} IEmailProviderCapabilities
 * @property {boolean} supportsThreading - Thread support
 * @property {boolean} supportsLabels - Label support
 * @property {boolean} supportsFolders - Folder support
 * @property {boolean} supportsSearch - Search support
 * @property {boolean} supportsRealTimeSync - Real-time sync support
 * @property {boolean} supportsSending - Email sending support
 * @property {boolean} supportsAttachments - Attachment support
 * @property {number} maxAttachmentSize - Maximum attachment size in bytes
 */

/**
 * @typedef {Object} ISendEmailAttachment
 * @property {string} filename - Attachment filename
 * @property {Buffer | string} content - Attachment content
 * @property {string} [contentType] - MIME type
 */

/**
 * @typedef {Object} ISendEmailOptions
 * @property {IEmailAddress[]} to - Recipients
 * @property {IEmailAddress[]} [cc] - CC recipients
 * @property {IEmailAddress[]} [bcc] - BCC recipients
 * @property {string} subject - Email subject
 * @property {string} [bodyText] - Plain text body
 * @property {string} [bodyHtml] - HTML body
 * @property {ISendEmailAttachment[]} [attachments] - Attachments
 * @property {string} [replyTo] - Reply-to address
 * @property {string} [inReplyTo] - In-reply-to message ID
 * @property {string[]} [references] - Referenced message IDs
 */

/**
 * @typedef {'gmail' | 'outlook' | 'imap'} AccountProvider
 */

/**
 * @typedef {Object} IEmailAccount
 * @property {string} id - Account identifier
 * @property {string} email - Email address
 * @property {AccountProvider} provider - Email provider
 * @property {string} displayName - Display name
 * @property {any} config - Provider-specific configuration
 * @property {boolean} isActive - Whether account is active
 * @property {Date} [lastSyncAt] - Last synchronization date
 * @property {Date} createdAt - Creation date
 * @property {Date} updatedAt - Last update date
 */

/**
 * @typedef {'comfortable' | 'compact' | 'cozy'} DisplayDensity
 */

/**
 * @typedef {'light' | 'dark' | 'auto'} Theme
 */

/**
 * @typedef {Object} IUserPreferences
 * @property {boolean} threadsEnabled - Threading enabled
 * @property {boolean} autoMarkAsRead - Auto-mark as read
 * @property {number} syncInterval - Sync interval in minutes
 * @property {DisplayDensity} displayDensity - UI density preference
 * @property {Theme} theme - Theme preference
 */

/**
 * @typedef {Object} IUser
 * @property {string} id - User identifier
 * @property {string} username - Username
 * @property {string} email - User email address
 * @property {string} [firstName] - First name
 * @property {string} [lastName] - Last name
 * @property {string} passwordHash - Hashed password
 * @property {IEmailAccount[]} emailAccounts - User's email accounts
 * @property {IUserPreferences} preferences - User preferences
 * @property {boolean} isActive - Whether user is active
 * @property {Date} [lastLoginAt] - Last login date
 * @property {Date} createdAt - Creation date
 * @property {Date} updatedAt - Last update date
 */

/**
 * @typedef {'access' | 'refresh'} TokenType
 */

/**
 * @typedef {Object} IAuthToken
 * @property {string} userId - User ID
 * @property {string} token - Token value
 * @property {TokenType} type - Token type
 * @property {Date} expiresAt - Expiration date
 * @property {Date} createdAt - Creation date
 */

export {};