# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

**Start the application:**
```bash
npm run dev      # Development mode with nodemon
npm start        # Production mode
```

**Testing:**
```bash
npm test         # Run Jest tests
node test-unified-api.js  # Test unified API structure
```

**Database:**
- Ensure MongoDB is running on `mongodb://localhost:27017/email_client`
- No migration scripts - uses Mongoose auto-schema

## Architecture Overview

This is a **universal email API** that provides a unified interface across multiple email providers (Gmail, Outlook, IMAP). The architecture follows a **provider pattern** with these key layers:

### Core Architecture

**Provider Pattern**: The system uses `BaseEmailProvider` as an abstract base class that all email providers (`GmailProvider`, `IMAPProvider`, `OutlookProvider`) extend. This ensures consistent interfaces regardless of the underlying email service.

**Service Layer**: `EmailService` acts as the orchestrator that:
- Manages provider instances (`providerInstances` Map)
- Handles provider creation and lifecycle
- Provides caching layer using MongoDB
- Falls back to local implementations when providers don't support features

**Controller Layer**: `EmailController` handles HTTP requests and delegates to `EmailService`, with comprehensive middleware for authentication, validation, and rate limiting.

### Key Design Patterns

**Provider Abstraction**: Each provider implements the same interface defined in `BaseEmailProvider`, with methods like `getFolders()`, `getEmails()`, `sendEmail()`, etc. The service layer handles provider-specific differences.

**Capability-Based Features**: Providers expose capabilities via `getCapabilities()` - features like threading, search, and real-time sync are conditionally available based on provider support.

**Caching Strategy**: `EmailService` implements a two-tier approach:
- First check MongoDB cache (`getEmailsFromCache`)
- Fall back to provider API, then cache results (`cacheEmails`)

**Authentication Flow**: JWT-based auth with middleware chain:
1. `authenticateToken` - validates JWT
2. `requireEmailAccount` - ensures account access
3. Provider-specific OAuth handling

### Email Threading Logic

The system builds email threads using either:
- Provider-native threading (Gmail/Outlook)
- Subject-based fallback threading (`buildThreadsFromEmails`)

Threading involves grouping emails by `threadId` or normalized subject, tracking participants, counts, and chronological ordering.

## Configuration Structure

**Environment Variables**: Defined in `src/config/index.js`, supports:
- Multiple OAuth providers (Gmail, Outlook)
- MongoDB connection
- JWT settings
- Rate limiting configuration
- CORS origins

**Provider Configuration**: Each email account stores provider-specific config:
```javascript
{
  type: 'gmail|outlook|imap',
  auth: { /* provider-specific auth */ }
}
```

## Database Schema

**User Model**: Basic user info with email account references
**Email Model**: Cached email data with provider-agnostic structure
- Uses `messageId` as primary identifier across providers
- Stores `folderId`, `flags`, `attachments` in unified format
- Supports provider-specific metadata in `labels` field

## API Route Structure

Routes follow pattern: `/api/emails/accounts/:accountId/*`
- All routes require JWT authentication
- Account-specific middleware validates account ownership
- Rate limiting applied to send/reply/forward operations

## Error Handling

The system uses structured error responses:
```javascript
{
  success: false,
  error: {
    code: 'ERROR_CODE',
    message: 'Description',
    provider: 'gmail|outlook|imap'
  }
}
```

Providers return consistent errors via `createApiError()` helper.

## Security Implementation

**Multi-layer security**:
- Helmet.js security headers
- CORS configuration
- Rate limiting (general + email sending)
- Request sanitization
- JWT token validation
- Sensitive data redaction in logs

## Development Notes

- **ES Modules**: Project uses `"type": "module"` in package.json
- **No TypeScript**: Uses JSDoc comments for type hints
- **Logging**: Winston-based logging with multiple transports (`logs/` directory)
- **Graceful Shutdown**: Server handles SIGTERM/SIGINT with database cleanup

The codebase prioritizes **provider abstraction** and **unified API responses** - when adding new providers or modifying existing ones, maintain the same interface contracts defined in `BaseEmailProvider`.