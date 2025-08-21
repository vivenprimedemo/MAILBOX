# Email API Routes Documentation

Complete reference for all email-related API endpoints with request/response specifications.

## Base URL
```
http://localhost:3000/api
```

## Authentication
All routes require JWT authentication via Bearer token:
```
Authorization: Bearer <your_jwt_token>
```

---

## 📁 Folder Operations

### Get Account Folders
```
GET /emails/accounts/:accountId/folders
```

**Parameters:**
- `accountId` (path) - Email account ID

**Query Parameters:**
- `includeHidden` (boolean) - Include hidden folders (default: false)

**Response:**
```json
{
  "success": true,
  "data": {
    "folders": [
      {
        "id": "INBOX",
        "name": "INBOX",
        "displayName": "Inbox",
        "type": "inbox",
        "unreadCount": 25,
        "totalCount": 150,
        "isSystem": true
      }
    ]
  }
}
```

---

## 📧 Email Operations

### List Emails (Enhanced)
```
GET /emails/accounts/:accountId/list-emails
```

**Parameters:**
- `accountId` (path) - Email account ID

**Query Parameters:**
- `folderId` (string) - Folder ID (default: 'INBOX')
- `limit` (number) - Results limit (default: 50, max: 100)
- `offset` (number) - Pagination offset (default: 0)
- `sortBy` (string) - Sort field: 'date', 'subject', 'from', 'size' (default: 'date')
- `sortOrder` (string) - Sort direction: 'asc', 'desc' (default: 'desc')
- `search` (string) - Search query
- `isUnread` (boolean) - Filter unread emails
- `isFlagged` (boolean) - Filter flagged emails
- `hasAttachment` (boolean) - Filter emails with attachments
- `from` (string) - Filter by sender
- `to` (string) - Filter by recipient
- `subject` (string) - Filter by subject
- `dateFrom` (string) - Start date (ISO format)
- `dateTo` (string) - End date (ISO format)
- `useCache` (boolean) - Use cache (default: true)

**Request Example:**
```
GET /emails/accounts/acc_123/list-emails?isUnread=true&hasAttachment=true&limit=20
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "msg_123",
      "messageId": "<unique-message-id>",
      "threadId": "thread_456",
      "subject": "Meeting Tomorrow",
      "from": {
        "name": "Jane Smith",
        "address": "jane@example.com"
      },
      "to": [
        {
          "name": "John Doe", 
          "address": "john@example.com"
        }
      ],
      "cc": [],
      "date": "2024-01-15T14:30:00.000Z",
      "bodyText": "Hi John, let's meet tomorrow at 2 PM.",
      "bodyHtml": "<p>Hi John, let's meet tomorrow at 2 PM.</p>",
      "snippet": "Hi John, let's meet tomorrow...",
      "attachments": [
        {
          "filename": "agenda.pdf",
          "contentType": "application/pdf", 
          "size": 15420,
          "attachmentId": "att_789"
        }
      ],
      "flags": {
        "seen": false,
        "flagged": true,
        "draft": false,
        "answered": false,
        "deleted": false
      },
      "labels": ["IMPORTANT", "INBOX"],
      "folderId": "INBOX",
      "provider": "gmail",
      "size": 2048,
      "priority": "normal"
    }
  ],
  "metadata": {
    "total": 1250,
    "limit": 50,
    "offset": 0,
    "hasMore": true,
    "currentPage": 1,
    "totalPages": 25,
    "nextOffset": 50,
    "provider": "gmail",
    "sortBy": "date",
    "sortOrder": "desc",
    "appliedFilters": {
      "isUnread": true,
      "hasAttachment": true
    }
  }
}
```

### Get Single Email
```
GET /emails/accounts/:accountId/emails/:folder/email/:messageId
```

**Parameters:**
- `accountId` (path) - Email account ID  
- `folder` (path) - Folder name
- `messageId` (path) - Message ID

**Response:**
```json
{
  "success": true,
  "data": {
    "email": {
      // Same email object structure as list endpoint
    }
  }
}
```

### Advanced Email Search
```
GET /emails/accounts/:accountId/search
```

**Parameters:**
- `accountId` (path) - Email account ID

**Query Parameters:**
- `query` (string) - General search query
- `from` (string) - Sender email filter
- `to` (string) - Recipient email filter
- `subject` (string) - Subject filter
- `hasAttachment` (boolean) - Has attachments filter
- `isUnread` (boolean) - Unread emails filter
- `isFlagged` (boolean) - Flagged emails filter
- `folder` (string) - Folder filter
- `dateStart` (string) - Start date (ISO format)
- `dateEnd` (string) - End date (ISO format)
- `limit` (number) - Results limit (default: 50)
- `offset` (number) - Pagination offset (default: 0)

**Request Example:**
```
GET /emails/accounts/acc_123/search?query=meeting&from=jane@example.com&isUnread=true&limit=20
```

**Response:**
```json
{
  "success": true,
  "data": {
    "emails": [
      // Array of email objects
    ],
    "count": 15,
    "metadata": {
      "searchQuery": "meeting",
      "appliedFilters": {
        "from": "jane@example.com",
        "isUnread": true
      }
    }
  }
}
```

---

## ✉️ Send Email Operations

### Send New Email
```
POST /emails/accounts/:accountId/send
```

**Parameters:**
- `accountId` (path) - Email account ID

**Request Body:**
```json
{
  "to": [
    {
      "name": "Jane Smith",
      "address": "jane@example.com"
    }
  ],
  "cc": [
    {
      "name": "Bob Wilson", 
      "address": "bob@example.com"
    }
  ],
  "subject": "Meeting Reminder",
  "bodyText": "Don't forget about our meeting tomorrow at 2 PM.",
  "bodyHtml": "<p>Don't forget about our meeting tomorrow at <strong>2 PM</strong>.</p>",
  "attachments": [
    {
      "filename": "agenda.pdf",
      "content": "base64-encoded-content",
      "contentType": "application/pdf"
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "message": "Email sent successfully",
  "data": {
    "messageId": "<CAF+bwQ...@mail.gmail.com>"
  }
}
```

### Reply to Email
```
POST /emails/accounts/:accountId/reply/:messageId
```

**Parameters:**
- `accountId` (path) - Email account ID
- `messageId` (path) - Original message ID

**Request Body:**
```json
{
  "bodyText": "Thanks for the reminder! See you tomorrow.",
  "bodyHtml": "<p>Thanks for the reminder! See you tomorrow.</p>",
  "attachments": []
}
```

**Response:**
```json
{
  "success": true,
  "message": "Reply sent successfully", 
  "data": {
    "messageId": "<reply-message-id>"
  }
}
```

### Forward Email
```
POST /emails/accounts/:accountId/forward/:messageId
```

**Parameters:**
- `accountId` (path) - Email account ID
- `messageId` (path) - Original message ID

**Request Body:**
```json
{
  "to": [
    {
      "name": "Alice Johnson",
      "address": "alice@example.com"
    }
  ],
  "message": "FYI - please review this meeting agenda."
}
```

**Response:**
```json
{
  "success": true,
  "message": "Email forwarded successfully",
  "data": {
    "messageId": "<forward-message-id>"
  }
}
```

---

## 🏷️ Email Actions

### Mark as Read
```
PUT /emails/accounts/:accountId/emails/read
```

**Parameters:**
- `accountId` (path) - Email account ID

**Request Body:**
```json
{
  "messageIds": ["msg_123", "msg_456"],
  "folder": "INBOX"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Emails marked as read",
  "data": {
    "updated": 2
  }
}
```

### Mark as Unread
```
PUT /emails/accounts/:accountId/emails/unread
```

**Request Body:**
```json
{
  "messageIds": ["msg_123", "msg_456"],
  "folder": "INBOX"
}
```

### Mark as Flagged
```
PUT /emails/accounts/:accountId/emails/flag
```

**Request Body:**
```json
{
  "messageIds": ["msg_123", "msg_456"],
  "folder": "INBOX"
}
```

### Mark as Unflagged
```
PUT /emails/accounts/:accountId/emails/unflag
```

**Request Body:**
```json
{
  "messageIds": ["msg_123", "msg_456"],
  "folder": "INBOX"
}
```

### Delete Emails
```
DELETE /emails/accounts/:accountId/emails
```

**Request Body:**
```json
{
  "messageIds": ["msg_123", "msg_456"],
  "folder": "INBOX"
}
```

### Move Emails
```
PUT /emails/accounts/:accountId/emails/move
```

**Request Body:**
```json
{
  "messageIds": ["msg_123", "msg_456"],
  "fromFolder": "INBOX",
  "toFolder": "Archive"
}
```

---

## 🧵 Threading Operations

### Get Threads
```
GET /emails/accounts/:accountId/threads/:folder
```

**Parameters:**
- `accountId` (path) - Email account ID
- `folder` (path) - Folder name

**Query Parameters:**
- `limit` (number) - Results limit
- `offset` (number) - Pagination offset

**Response:**
```json
{
  "success": true,
  "data": {
    "threads": [
      {
        "id": "thread_456",
        "subject": "Meeting Tomorrow",
        "participants": [
          {
            "name": "Jane Smith",
            "address": "jane@example.com"
          }
        ],
        "messageCount": 3,
        "unreadCount": 1,
        "lastMessageDate": "2024-01-15T16:45:00.000Z",
        "hasAttachments": false,
        "emails": [
          // Array of email objects
        ]
      }
    ],
    "count": 1
  }
}
```

### Get Single Thread
```
GET /emails/accounts/:accountId/thread/:threadId
```

**Parameters:**
- `accountId` (path) - Email account ID
- `threadId` (path) - Thread ID

---

## 🔧 Provider Management

### Connect Provider
```
POST /accounts/:accountId/connect
```

**Parameters:**
- `accountId` (path) - Email account ID

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
POST /accounts/:accountId/disconnect
```

### Get Provider Capabilities
```
GET /accounts/:accountId/capabilities
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

## 🔄 Synchronization

### Manual Sync
```
POST /emails/accounts/:accountId/sync
```

**Parameters:**
- `accountId` (path) - Email account ID

**Response:**
```json
{
  "success": true,
  "message": "Account synced successfully",
  "data": {
    "syncedAt": "2024-01-15T12:00:00.000Z",
    "newEmails": 5,
    "updatedEmails": 2
  }
}
```

---

## ❌ Error Responses

All endpoints return errors in this format:

```json
{
  "success": false,
  "message": "Error description",
  "errors": [
    {
      "field": "email",
      "message": "Email is required"
    }
  ]
}
```

### Common Error Codes

- **400** - Bad Request (validation errors)
- **401** - Unauthorized (invalid/missing token)
- **403** - Forbidden (insufficient permissions)
- **404** - Not Found (account/email not found)
- **429** - Too Many Requests (rate limited)
- **500** - Internal Server Error

---

## 📊 Rate Limits

- Authentication endpoints: 5 requests per 15 minutes
- Email sending: 100 emails per hour  
- General endpoints: 100 requests per 15 minutes

Rate limit headers are included in responses:
- `X-RateLimit-Limit` - Request limit
- `X-RateLimit-Remaining` - Remaining requests
- `X-RateLimit-Reset` - Reset time (Unix timestamp)

---

## 🧪 Testing Examples

### cURL Examples

**List Emails:**
```bash
curl -X GET "http://localhost:3000/api/emails/accounts/acc_123/list-emails?limit=10&isUnread=true" \
  -H "Authorization: Bearer your-jwt-token"
```

**Send Email:**
```bash
curl -X POST "http://localhost:3000/api/emails/accounts/acc_123/send" \
  -H "Authorization: Bearer your-jwt-token" \
  -H "Content-Type: application/json" \
  -d '{
    "to": [{"name": "Test User", "address": "test@example.com"}],
    "subject": "Test Email", 
    "bodyText": "This is a test email."
  }'
```

**Search Emails:**
```bash
curl -X GET "http://localhost:3000/api/emails/accounts/acc_123/search?query=important&hasAttachment=true" \
  -H "Authorization: Bearer your-jwt-token"
```

**Mark as Read:**
```bash
curl -X PUT "http://localhost:3000/api/emails/accounts/acc_123/emails/read" \
  -H "Authorization: Bearer your-jwt-token" \
  -H "Content-Type: application/json" \
  -d '{
    "messageIds": ["msg_123", "msg_456"],
    "folder": "INBOX"
  }'
```

---

## 🧪 Postman Collection

Import this collection for easy testing:

```json
{
  "info": {
    "name": "Email API Routes",
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
        "url": "{{base_url}}/emails/accounts/{{account_id}}/folders"
      }
    },
    {
      "name": "List Emails",
      "request": {
        "method": "GET",
        "url": "{{base_url}}/emails/accounts/{{account_id}}/list-emails?limit=20&isUnread=true"
      }
    },
    {
      "name": "Search Emails",
      "request": {
        "method": "GET",
        "url": "{{base_url}}/emails/accounts/{{account_id}}/search?query=important&hasAttachment=true"
      }
    },
    {
      "name": "Send Email",
      "request": {
        "method": "POST",
        "url": "{{base_url}}/emails/accounts/{{account_id}}/send",
        "body": {
          "mode": "raw",
          "raw": "{\n  \"to\": [{\"name\": \"Test User\", \"address\": \"test@example.com\"}],\n  \"subject\": \"Test Email\",\n  \"bodyText\": \"This is a test email.\"\n}",
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