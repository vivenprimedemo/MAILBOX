# Email API Documentation - Unified Structure

This document describes the unified API structure for all email providers (Gmail, Outlook, IMAP).

## Base URL
```
http://localhost:3000/api
```

## Authentication
All requests require authentication. Include the user's account ID in the request headers or URL parameters.

## Unified Response Structure

All API responses follow this consistent structure:

```json
{
  "success": true,
  "data": {}, // Response data
  "error": null, // Error object if success is false
  "metadata": {
    "total": 100,
    "limit": 50,
    "offset": 0,
    "hasMore": true,
    "nextPageToken": "optional-token",
    "provider": "gmail|outlook|imap",
    "timestamp": "2025-08-21T11:23:44.072Z"
  }
}
```

## Error Response Structure

```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable error message",
    "details": {}, // Optional additional error details
    "provider": "gmail|outlook|imap",
    "timestamp": "2025-08-21T11:23:44.072Z"
  },
  "metadata": null
}
```

---

## 📁 Folder Endpoints

### Get Folders
```
GET /accounts/{accountId}/folders
```

**Query Parameters:**
```json
{
  "includeHidden": false,
  "includeSystemFolders": true
}
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "folder_id",
      "name": "INBOX",
      "displayName": "Inbox",
      "type": "inbox", // inbox|sent|drafts|trash|spam|archive|custom
      "unreadCount": 15,
      "totalCount": 150,
      "parentId": null,
      "children": [],
      "isSystem": true,
      "canDelete": false,
      "canRename": false
    }
  ],
  "metadata": {
    "total": 10,
    "provider": "gmail"
  }
}
```

---

## 📧 Email Endpoints

### Get Emails from Folder
```
POST /accounts/{accountId}/emails/list
```

**Request Body:**
```json
{
  "folderId": "INBOX",
  "limit": 50,
  "offset": 0,
  "orderBy": "date",
  "order": "desc",
  "includeBody": true,
  "includeAttachments": true
}
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "email_id",
      "messageId": "unique-message-id",
      "threadId": "thread_id",
      "subject": "Email Subject",
      "from": {
        "name": "John Doe",
        "address": "john@example.com"
      },
      "to": [
        {
          "name": "Jane Smith",
          "address": "jane@example.com"
        }
      ],
      "cc": [],
      "bcc": [],
      "replyTo": [],
      "date": "2025-08-21T10:30:00Z",
      "bodyText": "Plain text content",
      "bodyHtml": "<p>HTML content</p>",
      "snippet": "Email preview text...",
      "attachments": [
        {
          "id": "attachment_id",
          "filename": "document.pdf",
          "contentType": "application/pdf",
          "size": 1024,
          "contentId": "optional-content-id",
          "isInline": false,
          "data": null // Only populated when specifically requested
        }
      ],
      "flags": {
        "seen": true,
        "flagged": false,
        "draft": false,
        "answered": false,
        "deleted": false,
        "recent": false
      },
      "labels": ["IMPORTANT", "CATEGORY_PERSONAL"],
      "folderId": "INBOX",
      "provider": "gmail",
      "inReplyTo": "original-message-id",
      "references": ["ref1", "ref2"],
      "priority": "normal", // low|normal|high
      "size": 2048,
      "isEncrypted": false,
      "isSigned": false
    }
  ],
  "metadata": {
    "total": 1500,
    "limit": 50,
    "offset": 0,
    "hasMore": true,
    "provider": "gmail"
  }
}
```

### Get Single Email
```
GET /accounts/{accountId}/emails/{messageId}?folderId={folderId}
```

**Response:**
```json
{
  "success": true,
  "data": {
    // Same email object structure as above
  },
  "metadata": {
    "provider": "gmail"
  }
}
```

### Search Emails
```
POST /accounts/{accountId}/emails/search
```

**Request Body:**
```json
{
  "query": "important project",
  "from": "boss@company.com",
  "to": "me@company.com",
  "subject": "quarterly report",
  "body": "revenue",
  "hasAttachment": true,
  "isUnread": true,
  "isFlagged": false,
  "dateFrom": "2024-01-01T00:00:00Z",
  "dateTo": "2024-12-31T23:59:59Z",
  "folderId": "INBOX",
  "limit": 50,
  "offset": 0
}
```

**Response:**
```json
{
  "success": true,
  "data": [
    // Array of email objects
  ],
  "metadata": {
    "total": 25,
    "limit": 50,
    "offset": 0,
    "hasMore": false,
    "provider": "gmail"
  }
}
```

---

## 🧵 Thread Endpoints

### Get Threads
```
POST /accounts/{accountId}/threads/list
```

**Request Body:**
```json
{
  "folderId": "INBOX",
  "limit": 50,
  "offset": 0,
  "includeEmails": true
}
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "thread_id",
      "subject": "Thread Subject",
      "participants": [
        {
          "name": "John Doe",
          "address": "john@example.com"
        }
      ],
      "messageCount": 5,
      "unreadCount": 2,
      "lastMessageDate": "2025-08-21T10:30:00Z",
      "firstMessageDate": "2025-08-20T09:00:00Z",
      "emails": [
        // Array of email objects if includeEmails is true
      ],
      "hasAttachments": true,
      "labels": ["IMPORTANT"],
      "folderId": "INBOX",
      "isStarred": false,
      "snippet": "Latest message preview..."
    }
  ],
  "metadata": {
    "total": 100,
    "limit": 50,
    "offset": 0,
    "hasMore": true,
    "provider": "gmail"
  }
}
```

### Get Single Thread
```
GET /accounts/{accountId}/threads/{threadId}
```

**Response:**
```json
{
  "success": true,
  "data": {
    // Thread object with all emails
  },
  "metadata": {
    "provider": "gmail"
  }
}
```

---

## ✉️ Send Email Endpoints

### Send New Email
```
POST /accounts/{accountId}/emails/send
```

**Request Body:**
```json
{
  "to": [
    {
      "name": "John Doe",
      "address": "john@example.com"
    }
  ],
  "cc": [
    {
      "name": "Manager",
      "address": "manager@company.com"
    }
  ],
  "bcc": [],
  "replyTo": [
    {
      "name": "Support",
      "address": "support@company.com"
    }
  ],
  "subject": "Email Subject",
  "bodyText": "Plain text version of email",
  "bodyHtml": "<p>HTML version of <strong>email</strong></p>",
  "attachments": [
    {
      "filename": "document.pdf",
      "contentType": "application/pdf",
      "data": "base64-encoded-content"
    }
  ],
  "inReplyTo": "original-message-id", // Optional
  "references": ["ref1", "ref2"], // Optional
  "priority": "high", // low|normal|high
  "isRead": false,
  "isDraft": false
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "messageId": "sent-message-id",
    "id": "sent-message-id"
  },
  "metadata": {
    "provider": "gmail",
    "timestamp": "2025-08-21T11:30:00Z"
  }
}
```

### Reply to Email
```
POST /accounts/{accountId}/emails/reply
```

**Request Body:**
```json
{
  "originalMessageId": "original-message-id",
  "replyAll": false,
  "bodyText": "Reply text content",
  "bodyHtml": "<p>Reply HTML content</p>",
  "attachments": [],
  "includeOriginal": true
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "messageId": "reply-message-id"
  },
  "metadata": {
    "provider": "gmail"
  }
}
```

### Forward Email
```
POST /accounts/{accountId}/emails/forward
```

**Request Body:**
```json
{
  "originalMessageId": "original-message-id",
  "to": [
    {
      "name": "Recipient",
      "address": "recipient@example.com"
    }
  ],
  "bodyText": "Forward message content",
  "bodyHtml": "<p>Forward HTML content</p>",
  "attachments": [],
  "includeOriginal": true
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "messageId": "forward-message-id"
  },
  "metadata": {
    "provider": "gmail"
  }
}
```

---

## 🏷️ Email Action Endpoints

### Mark as Read
```
POST /accounts/{accountId}/emails/mark-read
```

**Request Body:**
```json
{
  "messageIds": ["msg1", "msg2", "msg3"],
  "folderId": "INBOX"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "updated": 3
  },
  "metadata": {
    "provider": "gmail"
  }
}
```

### Mark as Unread
```
POST /accounts/{accountId}/emails/mark-unread
```

**Request Body:**
```json
{
  "messageIds": ["msg1", "msg2"],
  "folderId": "INBOX"
}
```

### Mark as Flagged/Starred
```
POST /accounts/{accountId}/emails/mark-flagged
```

**Request Body:**
```json
{
  "messageIds": ["msg1", "msg2"],
  "folderId": "INBOX"
}
```

### Mark as Unflagged
```
POST /accounts/{accountId}/emails/mark-unflagged
```

**Request Body:**
```json
{
  "messageIds": ["msg1", "msg2"],
  "folderId": "INBOX"
}
```

### Delete Emails
```
POST /accounts/{accountId}/emails/delete
```

**Request Body:**
```json
{
  "messageIds": ["msg1", "msg2"],
  "folderId": "INBOX"
}
```

### Move Emails
```
POST /accounts/{accountId}/emails/move
```

**Request Body:**
```json
{
  "messageIds": ["msg1", "msg2"],
  "fromFolderId": "INBOX",
  "toFolderId": "Archive"
}
```

---

## 🔧 Provider Management Endpoints

### Connect Provider
```
POST /accounts/{accountId}/connect
```

**Request Body:**
```json
{
  "providerType": "gmail", // gmail|outlook|imap
  "accessToken": "oauth-access-token", // For OAuth providers
  "refreshToken": "oauth-refresh-token", // For OAuth providers
  "clientId": "oauth-client-id", // For OAuth providers
  "clientSecret": "oauth-client-secret", // For OAuth providers
  "username": "user@example.com", // For IMAP
  "password": "password", // For IMAP
  "host": "imap.example.com", // For IMAP
  "port": 993, // For IMAP
  "secure": true // For IMAP
}
```

### Disconnect Provider
```
POST /accounts/{accountId}/disconnect
```

### Get Provider Capabilities
```
GET /accounts/{accountId}/capabilities
```

**Response:**
```json
{
  "success": true,
  "data": {
    "supportsThreading": true,
    "supportsLabels": true,
    "supportsFolders": true,
    "supportsSearch": true,
    "supportsRealTimeSync": false,
    "supportsSending": true,
    "supportsAttachments": true,
    "supportsEncryption": false,
    "supportsPush": false,
    "maxAttachmentSize": 26214400,
    "searchOperators": ["from", "to", "subject", "has:attachment"],
    "folderOperations": ["create", "delete", "rename"],
    "supportedAuthTypes": ["oauth2"]
  },
  "metadata": {
    "provider": "gmail"
  }
}
```

---

## 📱 Testing Examples

### cURL Examples

**Get Folders:**
```bash
curl -X GET "http://localhost:3000/api/accounts/acc123/folders" \
  -H "Authorization: Bearer your-token"
```

**List Emails:**
```bash
curl -X POST "http://localhost:3000/api/accounts/acc123/emails/list" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-token" \
  -d '{
    "folderId": "INBOX",
    "limit": 10,
    "offset": 0
  }'
```

**Search Emails:**
```bash
curl -X POST "http://localhost:3000/api/accounts/acc123/emails/search" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-token" \
  -d '{
    "query": "important",
    "isUnread": true,
    "limit": 20
  }'
```

**Send Email:**
```bash
curl -X POST "http://localhost:3000/api/accounts/acc123/emails/send" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-token" \
  -d '{
    "to": [{"name": "Test User", "address": "test@example.com"}],
    "subject": "Test Email",
    "bodyText": "This is a test email."
  }'
```

**Mark as Read:**
```bash
curl -X POST "http://localhost:3000/api/accounts/acc123/emails/mark-read" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-token" \
  -d '{
    "messageIds": ["msg1", "msg2"],
    "folderId": "INBOX"
  }'
```

---

## 🚨 Error Codes

| Code | Description |
|------|-------------|
| `PROVIDER_NOT_FOUND` | Email provider not configured |
| `AUTHENTICATION_FAILED` | Invalid credentials |
| `FETCH_FOLDERS_ERROR` | Failed to retrieve folders |
| `FETCH_EMAILS_ERROR` | Failed to retrieve emails |
| `FETCH_EMAIL_ERROR` | Failed to retrieve specific email |
| `SEARCH_EMAILS_ERROR` | Search operation failed |
| `SEND_EMAIL_ERROR` | Failed to send email |
| `MARK_READ_ERROR` | Failed to mark as read |
| `MARK_UNREAD_ERROR` | Failed to mark as unread |
| `MARK_FLAGGED_ERROR` | Failed to mark as flagged |
| `MARK_UNFLAGGED_ERROR` | Failed to mark as unflagged |
| `DELETE_EMAILS_ERROR` | Failed to delete emails |
| `MOVE_EMAILS_ERROR` | Failed to move emails |
| `SENDING_NOT_SUPPORTED` | Provider doesn't support sending |
| `INVALID_REQUEST` | Request validation failed |

---

## 🔄 Migration Guide

**Old API structure (before unification):**
```javascript
// Different for each provider
GET /emails?folder=INBOX&limit=50&offset=0
```

**New API structure (unified):**
```javascript
// Same for all providers
POST /emails/list
{
  "folderId": "INBOX",
  "limit": 50,
  "offset": 0
}
```

All responses now include consistent metadata and error handling across all providers (Gmail, Outlook, IMAP).

---

## 🧪 Postman Collection

Here's a ready-to-use Postman collection for testing:

```json
{
  "info": {
    "name": "Unified Email API",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "auth": {
    "type": "bearer",
    "bearer": [
      {
        "key": "token",
        "value": "{{auth_token}}",
        "type": "string"
      }
    ]
  },
  "variable": [
    {
      "key": "base_url",
      "value": "http://localhost:3000/api"
    },
    {
      "key": "account_id",
      "value": "test-account-123"
    }
  ],
  "item": [
    {
      "name": "Get Folders",
      "request": {
        "method": "GET",
        "url": "{{base_url}}/accounts/{{account_id}}/folders"
      }
    },
    {
      "name": "List Emails",
      "request": {
        "method": "POST",
        "url": "{{base_url}}/accounts/{{account_id}}/emails/list",
        "body": {
          "mode": "raw",
          "raw": "{\n  \"folderId\": \"INBOX\",\n  \"limit\": 20,\n  \"offset\": 0\n}",
          "options": {
            "raw": {
              "language": "json"
            }
          }
        }
      }
    },
    {
      "name": "Search Emails",
      "request": {
        "method": "POST",
        "url": "{{base_url}}/accounts/{{account_id}}/emails/search",
        "body": {
          "mode": "raw",
          "raw": "{\n  \"query\": \"important\",\n  \"isUnread\": true,\n  \"limit\": 10\n}",
          "options": {
            "raw": {
              "language": "json"
            }
          }
        }
      }
    },
    {
      "name": "Send Email",
      "request": {
        "method": "POST",
        "url": "{{base_url}}/accounts/{{account_id}}/emails/send",
        "body": {
          "mode": "raw",
          "raw": "{\n  \"to\": [{\"name\": \"Test User\", \"address\": \"test@example.com\"}],\n  \"subject\": \"Test Email\",\n  \"bodyText\": \"This is a test email from the unified API.\"\n}",
          "options": {
            "raw": {
              "language": "json"
            }
          }
        }
      }
    }
  ]
}
```

Save this as `unified-email-api.postman_collection.json` and import into Postman for easy testing.