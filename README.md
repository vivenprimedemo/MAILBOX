# MAILBOX - Universal Email API

Multi-provider email API supporting Gmail, Outlook, and IMAP with unified interface.

## Quick Start

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your settings
   ```

3. **Start the server:**
   ```bash
   npm run dev
   ```

## Documentation

- **[Email API Routes](EMAIL_ROUTES.md)** - Complete email API reference with request/response examples

## Project Structure

```
src/
├── controllers/      # Request handlers
├── providers/        # Email provider implementations
├── routes/           # API endpoints
├── services/         # Business logic
└── models/          # Database schemas
```