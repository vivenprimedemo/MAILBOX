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
node test-unified-api.js  # Test unified API structure and demonstrate request/response formats
```

**Environment setup:**
```bash
cp .env.example .env     # Copy environment template
# Edit .env with your configuration
```

**Database:**
- Ensure MongoDB is running on `mongodb://localhost:27017/email_client`
- No migration scripts - uses Mongoose auto-schema
- Database connection handled via singleton pattern in `src/config/database.js`
- Main models: `User` (user accounts), `Email` (cached email data), `EmailConfig` (provider configurations)

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

Threading involves grouping emails by `threadId` or normalized subject, tracking participants, counts, and chronological ordering. The `BaseEmailProvider.buildThreads()` method provides common threading logic that providers can use or override.

### Provider Instance Management

`EmailService` maintains provider instances using a Map-based cache (`providerInstances`). Each provider is instantiated per email account and handles:
- Connection management (connect/disconnect lifecycle)
- Authentication token refresh
- Provider-specific API calls with unified response formatting

## Configuration Structure

**Environment Variables**: Defined in `src/config/index.js`, supports:
- Multiple OAuth providers (Gmail, Outlook)
- MongoDB connection
- JWT settings
- Rate limiting configuration
- CORS origins

**Provider Configuration**: Each email account stores provider-specific config in `EmailConfig` model:
```javascript
{
  type: 'gmail|outlook|imap',
  auth: { /* provider-specific auth */ },
  user_id: ObjectId,
  email: 'user@example.com',
  oauth_config: { access_token, refresh_token },
  smtp_config: { /* IMAP/SMTP settings */ },
  imap_config: { /* IMAP settings */ }
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
- All routes require JWT authentication via `authenticateToken` middleware
- Account-specific middleware validates account ownership via `requireEmailAccount`
- Rate limiting applied to send/reply/forward operations
- Enhanced email listing via `/list-emails` and `/list-emailsV2` endpoints
- Comprehensive API documentation available in `EMAIL_ROUTES.md`

**Key Endpoints**:
- `GET /folders` - Get account folders
- `GET /list-emails` - Enhanced email listing with filtering/sorting
- `GET /search` - Advanced email search
- `POST /send` - Send new email
- `POST /reply/:messageId` - Reply to email
- `PUT /emails/read` - Mark emails as read
- `GET /emails/:messageId/attachments/:attachmentId` - Download attachments

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
- **Helper Utilities**: `consoleHelper.js` for debugging, `test-unified-api.js` for API structure validation

## Key Implementation Details

**Server Structure**: Uses a class-based approach (`EmailClientServer`) with lifecycle management:
- `initializeMiddleware()` - Security, compression, body parsing, request sanitization
- `initializeRoutes()` - API routing with structured 404 handling
- `initializeErrorHandling()` - Global error handlers and process signal handling

**Security Layers** (defined in `src/middleware/security.js`):
- Helmet.js with CSP policies
- Multiple rate limiters: general (100 req/15min), auth (5 req/15min), email send (100/hour)
- Request sanitization to remove script tags and event handlers
- CORS with origin validation
- JWT token validation with user lookup

**Authentication Flow** (`src/middleware/auth.js`):
1. `authenticateToken` - Validates JWT and loads user
2. `optionalAuth` - Non-blocking auth for public endpoints  
3. `requireEmailAccount` - Validates account ownership and active status

**Error Response Format**: All APIs return consistent structure:
```javascript
{
  success: boolean,
  data: any | null,
  error: {
    code: string,
    message: string, 
    provider: string,
    timestamp: Date
  } | null,
  metadata: object
}
```

**Environment Variables**: Configure via `.env` (see `.env.example`):
- `JWT_SECRET` (required), `MONGODB_URI`, provider OAuth credentials
- Rate limiting and CORS settings
- All loaded through `src/config/index.js`

## Important Implementation Notes

**Provider Abstraction**: The codebase prioritizes **provider abstraction** and **unified API responses**. When adding new providers or modifying existing ones:
- Maintain the same interface contracts defined in `BaseEmailProvider`
- Implement all required abstract methods (`connect`, `getEmails`, `sendEmail`, etc.)
- Use the `createSuccessResponse` and `createErrorResponse` helper methods
- Follow the unified request/response structures demonstrated in `test-unified-api.js`

**Caching Strategy**: `EmailService` implements intelligent caching:
- Checks MongoDB cache first (`getEmailsFromCache`) for better performance
- Falls back to provider APIs and caches results (`cacheEmails`)
- Cache can be bypassed with `useCache=false` parameter

**Error Handling**: Providers should use structured error responses with consistent codes:
- `PROVIDER_INITIALIZATION_FAILED` - Provider setup issues
- `FETCH_EMAILS_ERROR` - General email retrieval errors
- `SEND_EMAIL_ERROR` - Email sending failures
- All errors include provider type and timestamp

**Threading Implementation**: Email threading supports both:
- Provider-native threading (Gmail `threadId`, Outlook conversation groups)
- Fallback subject-based threading using `buildThreadsFromEmails()`
- Thread participants, counts, and chronological ordering are automatically managed