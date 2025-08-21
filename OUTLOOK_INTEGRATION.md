# Outlook Integration Guide

This document describes how to integrate Microsoft Outlook/Office 365 email accounts with the email client using Microsoft Graph API.

## Overview

The Outlook integration uses Microsoft Graph API to provide full access to Outlook.com and Office 365 email accounts. This implementation supports all core email operations including reading, sending, organizing, and managing emails.

## Features

- ✅ Full email reading and sending capabilities
- ✅ Folder/mailbox management
- ✅ Email threading support
- ✅ Advanced search functionality
- ✅ Attachment handling (up to 150MB)
- ✅ Real-time synchronization support
- ✅ OAuth2 authentication
- ✅ Token refresh handling

## Prerequisites

1. **Microsoft Azure Application Registration**
   - Register your application in the Azure Portal
   - Configure OAuth2 permissions for Microsoft Graph
   - Obtain `clientId` and `clientSecret`

2. **Required Permissions**
   Your Azure app needs these Microsoft Graph permissions:
   - `Mail.Read` - Read user mail
   - `Mail.Send` - Send mail on behalf of user
   - `Mail.ReadWrite` - Read and write access to user mail
   - `MailboxSettings.Read` - Read user mailbox settings

## Configuration

### 1. Environment Variables

Add these to your `.env` file:

```env
# Microsoft Graph API Configuration
OUTLOOK_CLIENT_ID=your_azure_app_client_id
OUTLOOK_CLIENT_SECRET=your_azure_app_client_secret
OUTLOOK_REDIRECT_URI=http://localhost:3000/auth/outlook/callback
```

### 2. Email Account Configuration

When adding an Outlook account via the API, use this structure:

```json
{
  "email": "user@outlook.com",
  "provider": "outlook",
  "displayName": "My Outlook Account",
  "config": {
    "type": "outlook",
    "auth": {
      "clientId": "your_azure_app_client_id",
      "clientSecret": "your_azure_app_client_secret",
      "accessToken": "user_access_token",
      "refreshToken": "user_refresh_token"
    }
  }
}
```

## OAuth2 Authentication Flow

### 1. Authorization URL

Direct users to Microsoft's authorization endpoint:

```
https://login.microsoftonline.com/common/oauth2/v2.0/authorize?
  client_id=YOUR_CLIENT_ID&
  response_type=code&
  redirect_uri=YOUR_REDIRECT_URI&
  scope=https://graph.microsoft.com/Mail.Read https://graph.microsoft.com/Mail.Send&
  response_mode=query
```

### 2. Token Exchange

Exchange the authorization code for tokens:

```javascript
const tokenResponse = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    client_id: 'YOUR_CLIENT_ID',
    client_secret: 'YOUR_CLIENT_SECRET',
    code: 'AUTHORIZATION_CODE',
    redirect_uri: 'YOUR_REDIRECT_URI',
    grant_type: 'authorization_code'
  })
});

const tokens = await tokenResponse.json();
// Use tokens.access_token and tokens.refresh_token
```

## API Usage Examples

### Adding an Outlook Account

```javascript
// POST /api/emails/accounts
{
  "email": "john@outlook.com",
  "provider": "outlook", 
  "displayName": "John's Outlook",
  "config": {
    "type": "outlook",
    "auth": {
      "clientId": "your_client_id",
      "clientSecret": "your_client_secret", 
      "accessToken": "user_access_token",
      "refreshToken": "user_refresh_token"
    }
  }
}
```

### Getting Emails

```javascript
// GET /api/emails/{accountId}/folders/inbox/emails?limit=50&offset=0
```

### Sending an Email

```javascript
// POST /api/emails/{accountId}/send
{
  "to": [{"address": "recipient@example.com", "name": "Recipient Name"}],
  "subject": "Hello from Outlook API",
  "bodyHtml": "<p>This email was sent via Microsoft Graph API!</p>",
  "bodyText": "This email was sent via Microsoft Graph API!"
}
```

### Searching Emails

```javascript
// GET /api/emails/{accountId}/search?query=important&from=boss@company.com&hasAttachment=true
```

## Error Handling

The OutlookProvider includes comprehensive error handling:

- **401 Unauthorized**: Automatically attempts token refresh
- **403 Forbidden**: Insufficient permissions
- **429 Too Many Requests**: Rate limiting (implement retry logic)
- **5xx Server Errors**: Microsoft Graph service issues

## Rate Limits

Microsoft Graph API has rate limits:
- **Mail API**: 10,000 requests per 10 minutes per app per mailbox
- **Throttling**: Implement exponential backoff for 429 responses

## Folder Types

Outlook folders are mapped to standard types:

| Outlook Folder | Standard Type |
|----------------|---------------|
| Inbox          | inbox         |
| Sent Items     | sent          |
| Drafts         | drafts        |
| Deleted Items  | trash         |
| Junk Email     | spam          |
| Archive        | archive       |
| Custom Folders | custom        |

## Limitations

1. **Archive Mailboxes**: In-place archives are not supported
2. **Shared Mailboxes**: Requires additional permissions
3. **Public Folders**: Not supported by Microsoft Graph
4. **Real-time Sync**: Uses webhooks (requires additional setup)

## Troubleshooting

### Common Issues

1. **Invalid Access Token**
   - Check token expiration
   - Verify scopes are correct
   - Ensure refresh token is valid

2. **Permission Denied**
   - Verify Azure app permissions
   - Check admin consent for organizational accounts
   - Ensure user has granted consent

3. **Rate Limiting**
   - Implement exponential backoff
   - Use batch operations where possible
   - Consider caching strategies

### Debug Mode

Enable debug logging by setting:

```env
DEBUG=outlook-provider
```

## Security Considerations

1. **Token Storage**: Store tokens securely (encrypted at rest)
2. **HTTPS Only**: Always use HTTPS in production
3. **Token Rotation**: Implement automatic token refresh
4. **Permissions**: Request minimal required permissions
5. **Audit Logging**: Log all email operations for compliance

## Production Deployment

1. **Webhooks**: Set up Microsoft Graph webhooks for real-time updates
2. **Monitoring**: Monitor API usage and rate limits
3. **Backup**: Implement token backup and recovery
4. **Scaling**: Consider connection pooling for high volume

## Support

For issues related to:
- **Microsoft Graph API**: Check [Microsoft Graph documentation](https://docs.microsoft.com/en-us/graph/)
- **Azure App Registration**: See [Azure Active Directory documentation](https://docs.microsoft.com/en-us/azure/active-directory/)
- **This Implementation**: Review the `OutlookProvider.js` source code

## Examples

See the `test-outlook.js` file for basic usage examples and testing patterns.