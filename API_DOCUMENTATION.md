# Universal Email Client API Documentation

## Overview

This is a comprehensive email client API that supports multiple email providers (Gmail, Outlook, IMAP) with advanced features including email threading, real-time synchronization, and secure authentication.

## Base URL
```
http://localhost:3000/api
```

## Authentication

The API uses JWT (JSON Web Token) based authentication. Include the token in the Authorization header:

```
Authorization: Bearer <your_jwt_token>
```

## Response Format

All API responses follow this consistent format:

```json
{
  "success": boolean,
  "message": string,
  "data": object | array,
  "errors": array (only for validation errors)
}
```

## Rate Limiting

- Authentication endpoints: 5 requests per 15 minutes
- Email sending: 100 emails per hour
- General endpoints: 100 requests per 15 minutes

---

# Authentication Endpoints

## POST /api/auth/register

Register a new user account.

**Request Body:**
```json
{
  "username": "johndoe",
  "email": "john@example.com",
  "password": "securepassword123",
  "firstName": "John",
  "lastName": "Doe"
}
```

**Response:**
```json
{
  "success": true,
  "message": "User registered successfully",
  "data": {
    "user": {
      "id": "user_1234567890_abc123",
      "username": "johndoe",
      "email": "john@example.com",
      "firstName": "John",
      "lastName": "Doe",
      "emailAccounts": [],
      "preferences": {
        "threadsEnabled": true,
        "autoMarkAsRead": false,
        "syncInterval": 300000,
        "displayDensity": "comfortable",
        "theme": "light"
      },
      "createdAt": "2024-01-15T10:30:00.000Z"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

## POST /api/auth/login

Authenticate user and get access token.

**Request Body:**
```json
{
  "username": "johndoe",
  "password": "securepassword123"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "user": { /* user object */ },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

## POST /api/auth/refresh-token

Refresh an expired or near-expired JWT token.

**Request Body:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

## GET /api/auth/profile

Get current user profile. Requires authentication.

**Response:**
```json
{
  "success": true,
  "data": {
    "user": { /* user object without passwordHash */ }
  }
}
```

## PUT /api/auth/profile

Update user profile. Requires authentication.

**Request Body:**
```json
{
  "firstName": "John",
  "lastName": "Smith",
  "preferences": {
    "threadsEnabled": false,
    "autoMarkAsRead": true,
    "displayDensity": "compact",
    "theme": "dark"
  }
}
```

## PUT /api/auth/password

Update user password. Requires authentication.

**Request Body:**
```json
{
  "currentPassword": "oldpassword123",
  "newPassword": "newpassword456"
}
```

## POST /api/auth/logout

Logout user (client-side token removal). Requires authentication.

## DELETE /api/auth/account

Deactivate user account. Requires authentication.

---

# Email Account Management

## GET /api/emails/accounts

Get all email accounts for the authenticated user.

**Response:**
```json
{
  "success": true,
  "data": {
    "accounts": [
      {
        "id": "acc_1234567890",
        "email": "user@gmail.com",
        "provider": "gmail",
        "displayName": "My Gmail Account",
        "isActive": true,
        "lastSyncAt": "2024-01-15T10:30:00.000Z",
        "createdAt": "2024-01-10T08:00:00.000Z"
      }
    ]
  }
}
```

## POST /api/emails/accounts

Add a new email account.

**Request Body for Gmail:**
```json
{
  "email": "user@gmail.com",
  "provider": "gmail",
  "displayName": "My Gmail Account",
  "config": {
    "type": "gmail",
    "auth": {
      "user": "user@gmail.com",
      "accessToken": "ya29.a0ARrd...",
      "refreshToken": "1//04...",
      "clientId": "your-client-id",
      "clientSecret": "your-client-secret"
    }
  }
}
```

**Request Body for IMAP:**
```json
{
  "email": "user@company.com",
  "provider": "imap",
  "displayName": "Work Email",
  "config": {
    "type": "imap",
    "host": "mail.company.com",
    "port": 993,
    "secure": true,
    "auth": {
      "user": "user@company.com",
      "pass": "your-password"
    }
  }
}
```

## PUT /api/emails/accounts/:accountId

Update an email account.

**Request Body:**
```json
{
  "displayName": "Updated Account Name",
  "isActive": false
}
```

## DELETE /api/emails/accounts/:accountId

Remove an email account.

---

# Email Operations

## GET /api/emails/accounts/:accountId/folders

Get all folders/labels for an email account.

**Response:**
```json
{
  "success": true,
  "data": {
    "folders": [
      {
        "name": "INBOX",
        "displayName": "Inbox",
        "type": "inbox",
        "unreadCount": 25,
        "totalCount": 150
      },
      {
        "name": "SENT",
        "displayName": "Sent",
        "type": "sent",
        "unreadCount": 0,
        "totalCount": 45
      }
    ]
  }
}
```

## GET /api/emails/accounts/:accountId/emails/:folder

Get emails from a specific folder.

**Query Parameters:**
- `limit` (optional): Number of emails to return (default: 50, max: 100)
- `offset` (optional): Number of emails to skip (default: 0)
- `useCache` (optional): Use cached emails if available (default: true)

**Response:**
```json
{
  "success": true,
  "data": {
    "emails": [
      {
        "id": "msg_123",
        "messageId": "<CAF+bwQ...@mail.gmail.com>",
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
        "attachments": [],
        "flags": {
          "seen": false,
          "flagged": true,
          "draft": false,
          "answered": false,
          "deleted": false
        },
        "labels": ["IMPORTANT", "INBOX"],
        "folder": "INBOX",
        "provider": "gmail"
      }
    ],
    "count": 1
  }
}
```

## GET /api/emails/accounts/:accountId/emails/:folder/email/:messageId

Get a specific email by message ID.

**Query Parameters:**
- `folder` (optional): Folder name to search in

**Response:**
```json
{
  "success": true,
  "data": {
    "email": { /* email object */ }
  }
}
```

## GET /api/emails/accounts/:accountId/search

Search emails with advanced filters.

**Query Parameters:**
- `query` (optional): General search query
- `from` (optional): Filter by sender email
- `to` (optional): Filter by recipient email  
- `subject` (optional): Filter by subject
- `hasAttachment` (optional): Filter emails with attachments (true/false)
- `isUnread` (optional): Filter unread emails (true/false)
- `isFlagged` (optional): Filter flagged emails (true/false)
- `folder` (optional): Filter by folder
- `dateStart` (optional): Start date (ISO format)
- `dateEnd` (optional): End date (ISO format)
- `limit` (optional): Results limit (default: 50)
- `offset` (optional): Results offset (default: 0)

**Example:**
```
GET /api/emails/accounts/acc_123/search?query=meeting&from=jane@example.com&isUnread=true&limit=20
```

---

# Threading

## GET /api/emails/accounts/:accountId/threads/:folder

Get email threads from a folder.

**Query Parameters:**
- `limit` (optional): Number of threads to return
- `offset` (optional): Number of threads to skip

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
          },
          {
            "name": "John Doe",
            "address": "john@example.com"
          }
        ],
        "messageCount": 3,
        "unreadCount": 1,
        "lastMessageDate": "2024-01-15T16:45:00.000Z",
        "hasAttachments": false,
        "emails": [ /* array of email objects */ ]
      }
    ],
    "count": 1
  }
}
```

## GET /api/emails/accounts/:accountId/thread/:threadId

Get a specific email thread by thread ID.

---

# Email Actions

## PUT /api/emails/accounts/:accountId/emails/read

Mark emails as read.

**Request Body:**
```json
{
  "messageIds": ["msg_123", "msg_456"],
  "folder": "INBOX"
}
```

## PUT /api/emails/accounts/:accountId/emails/unread

Mark emails as unread.

## PUT /api/emails/accounts/:accountId/emails/flag

Flag emails.

## PUT /api/emails/accounts/:accountId/emails/unflag

Unflag emails.

## DELETE /api/emails/accounts/:accountId/emails

Delete emails.

## PUT /api/emails/accounts/:accountId/emails/move

Move emails between folders.

**Request Body:**
```json
{
  "messageIds": ["msg_123", "msg_456"],
  "fromFolder": "INBOX",
  "toFolder": "Archive"
}
```

---

# Sending Emails

## POST /api/emails/accounts/:accountId/send

Send a new email.

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

## POST /api/emails/accounts/:accountId/reply/:messageId

Reply to an email.

**Request Body:**
```json
{
  "bodyText": "Thanks for the reminder! See you tomorrow.",
  "bodyHtml": "<p>Thanks for the reminder! See you tomorrow.</p>",
  "attachments": []
}
```

## POST /api/emails/accounts/:accountId/forward/:messageId

Forward an email.

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

---

# Synchronization

## POST /api/emails/accounts/:accountId/sync

Manually sync an email account.

**Response:**
```json
{
  "success": true,
  "message": "Account synced successfully"
}
```

---

# Health Check

## GET /api/health

Check API and database health.

**Response:**
```json
{
  "success": true,
  "data": {
    "status": "ok",
    "timestamp": "2024-01-15T12:00:00.000Z",
    "uptime": 3600,
    "environment": "development",
    "version": "1.0.0",
    "database": {
      "status": "connected",
      "isConnected": true,
      "readyState": 1
    },
    "memory": {
      "used": 45.67,
      "total": 128.45,
      "external": 12.34
    }
  }
}
```

---

# Error Codes

- **400**: Bad Request - Invalid request data
- **401**: Unauthorized - Missing or invalid authentication
- **403**: Forbidden - Access denied or rate limit exceeded
- **404**: Not Found - Resource not found
- **422**: Unprocessable Entity - Validation errors
- **429**: Too Many Requests - Rate limit exceeded
- **500**: Internal Server Error - Server error
- **503**: Service Unavailable - Database or service unavailable

## Error Response Format

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

---

# Provider-Specific Configuration

## Gmail Configuration

To use Gmail, you need to:

1. Create a Google Cloud Project
2. Enable Gmail API
3. Create OAuth 2.0 credentials
4. Get access and refresh tokens

```json
{
  "type": "gmail",
  "auth": {
    "user": "user@gmail.com",
    "accessToken": "ya29.a0ARrd...",
    "refreshToken": "1//04...",
    "clientId": "your-client-id.apps.googleusercontent.com",
    "clientSecret": "your-client-secret"
  }
}
```

## IMAP Configuration

For IMAP providers (including Outlook):

```json
{
  "type": "imap",
  "host": "imap.gmail.com",
  "port": 993,
  "secure": true,
  "auth": {
    "user": "user@example.com",
    "pass": "app-specific-password"
  },
  "tls": {
    "rejectUnauthorized": false
  }
}
```

### Common IMAP Settings:

**Gmail:**
- Host: `imap.gmail.com`
- Port: `993`
- Security: SSL/TLS

**Outlook/Hotmail:**
- Host: `outlook.office365.com`
- Port: `993`
- Security: SSL/TLS

**Yahoo:**
- Host: `imap.mail.yahoo.com`
- Port: `993`
- Security: SSL/TLS

---

# Security Features

- JWT-based authentication
- Request rate limiting
- Input sanitization
- CORS protection
- Security headers (Helmet)
- Password hashing (bcrypt)
- Environment variable configuration
- Request/response logging
- Error handling and monitoring

---

# Development Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Set environment variables:**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. **Start MongoDB:**
   ```bash
   mongod --dbpath /path/to/your/db
   ```

4. **Run in development mode:**
   ```bash
   npm run dev
   ```

5. **Run in production:**
   ```bash
   npm run build
   npm start
   ```

---

# Architecture Overview

The email client follows a layered architecture:

- **Controllers**: Handle HTTP requests and responses
- **Services**: Business logic and provider management
- **Providers**: Email provider implementations (Gmail, IMAP)
- **Models**: Database schemas and data access
- **Middleware**: Authentication, validation, security
- **Routes**: API endpoint definitions

The system supports multiple email providers through a common interface, enabling easy addition of new providers while maintaining consistent functionality across different email services.