# Universal Email Client

A comprehensive, OOP-based email client built with Express.js that supports multiple email providers (Gmail, Outlook, IMAP) with advanced features including email threading, real-time synchronization, and secure authentication.

## 🚀 Features

- **Multi-Provider Support**: Gmail, Outlook, IMAP, and POP3
- **Email Threading**: Advanced conversation grouping and management
- **Real-Time Sync**: Live email synchronization across providers
- **Advanced Search**: Full-text search with filters and date ranges
- **Security First**: JWT authentication, rate limiting, input sanitization
- **RESTful API**: Comprehensive REST API with consistent response format
- **Folder Management**: Support for folders, labels, and custom organization
- **Attachment Support**: Handle file attachments up to 25MB
- **Rate Limiting**: Prevents abuse with configurable limits
- **Comprehensive Logging**: Winston-based logging with multiple transports

## 🏗️ Architecture

Built using Object-Oriented Programming principles:

- **Provider Pattern**: Unified interface for different email providers
- **Service Layer**: Business logic separation from HTTP concerns
- **Middleware Stack**: Authentication, validation, and security layers
- **Database Abstraction**: MongoDB with Mongoose ODM
- **Error Handling**: Centralized error management and logging

## 📋 Prerequisites

- Node.js (v16 or higher)
- MongoDB (v4.4 or higher)
- TypeScript (v4.5 or higher)

## 🛠️ Installation

1. **Clone the repository:**
   ```bash
   git clone <repository-url>
   cd EMAIL_Client
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Set up environment variables:**
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` with your configuration:
   ```env
   PORT=3000
   NODE_ENV=development
   MONGODB_URI=mongodb://localhost:27017/email_client
   JWT_SECRET=your_jwt_secret_key_here
   JWT_EXPIRES_IN=7d
   
   # Gmail OAuth (optional)
   GMAIL_CLIENT_ID=your_gmail_client_id
   GMAIL_CLIENT_SECRET=your_gmail_client_secret
   
   # Rate limiting
   RATE_LIMIT_WINDOW_MS=900000
   RATE_LIMIT_MAX_REQUESTS=100
   ```

4. **Start MongoDB:**
   ```bash
   mongod --dbpath /path/to/your/db
   ```

5. **Run the application:**
   
   **Development mode:**
   ```bash
   npm run dev
   ```
   
   **Production mode:**
   ```bash
   npm run build
   npm start
   ```

## 🔧 Configuration

### Email Provider Setup

#### Gmail Configuration

1. Create a Google Cloud Project
2. Enable Gmail API
3. Create OAuth 2.0 credentials
4. Configure redirect URI: `http://localhost:3000/auth/gmail/callback`

#### IMAP Configuration

Configure any IMAP-compatible email provider:

```json
{
  "type": "imap",
  "host": "imap.example.com",
  "port": 993,
  "secure": true,
  "auth": {
    "user": "user@example.com",
    "pass": "app-specific-password"
  }
}
```

## 📚 API Documentation

Comprehensive API documentation is available at `/api` when the server is running, or view [API_DOCUMENTATION.md](./API_DOCUMENTATION.md).

### Quick Start Examples

#### 1. Register a User
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "johndoe",
    "email": "john@example.com",
    "password": "securepassword123",
    "firstName": "John",
    "lastName": "Doe"
  }'
```

#### 2. Add an Email Account
```bash
curl -X POST http://localhost:3000/api/emails/accounts \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@gmail.com",
    "provider": "gmail",
    "displayName": "My Gmail Account",
    "config": {
      "type": "gmail",
      "auth": {
        "user": "user@gmail.com",
        "accessToken": "ya29.a0ARrd...",
        "refreshToken": "1//04..."
      }
    }
  }'
```

#### 3. Get Emails
```bash
curl -X GET "http://localhost:3000/api/emails/accounts/ACCOUNT_ID/emails/INBOX?limit=10" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## 🏛️ Project Structure

```
src/
├── config/           # Configuration files
│   ├── database.ts   # MongoDB configuration
│   └── logger.ts     # Winston logging setup
├── controllers/      # HTTP request controllers
│   ├── AuthController.ts
│   └── EmailController.ts
├── interfaces/       # TypeScript interfaces
│   ├── IEmail.ts
│   ├── IEmailProvider.ts
│   └── IUser.ts
├── middleware/       # Express middleware
│   ├── auth.ts       # Authentication middleware
│   ├── security.ts   # Security headers and rate limiting
│   └── validation.ts # Request validation
├── models/          # Database models
│   ├── Email.ts
│   └── User.ts
├── providers/       # Email provider implementations
│   ├── BaseEmailProvider.ts
│   ├── GmailProvider.ts
│   └── IMAPProvider.ts
├── routes/          # API route definitions
│   ├── auth.ts
│   ├── emails.ts
│   └── index.ts
├── services/        # Business logic services
│   ├── AuthService.ts
│   └── EmailService.ts
└── server.ts        # Main application server
```

## 🔐 Security Features

- **JWT Authentication**: Secure token-based authentication
- **Rate Limiting**: Prevents API abuse
- **Input Sanitization**: Protects against XSS and injection attacks
- **CORS Protection**: Configurable cross-origin resource sharing
- **Security Headers**: Helmet.js for security headers
- **Password Hashing**: bcrypt for secure password storage
- **Request Logging**: Comprehensive request/response logging
- **Error Handling**: Secure error messages without information leakage

## 🧪 Testing

Run the test suite:
```bash
npm test
```

Run linting:
```bash
npm run lint
```

Run type checking:
```bash
npm run typecheck
```

## 📊 Monitoring

The application includes comprehensive logging and monitoring:

- **Health Check**: `GET /api/health`
- **Logs Directory**: `./logs/`
- **Error Tracking**: Automatic error logging and stack traces
- **Performance Monitoring**: Request duration and memory usage
- **Security Events**: Failed authentication attempts and suspicious activity

## 🚀 Deployment

### Docker (Recommended)

1. Build the Docker image:
   ```bash
   docker build -t email-client .
   ```

2. Run with Docker Compose:
   ```bash
   docker-compose up -d
   ```

### Manual Deployment

1. Build the application:
   ```bash
   npm run build
   ```

2. Set production environment variables
3. Start the application:
   ```bash
   npm start
   ```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Commit your changes: `git commit -am 'Add some feature'`
4. Push to the branch: `git push origin feature-name`
5. Submit a pull request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🐛 Known Issues

- OAuth refresh token handling may need periodic re-authentication
- Large attachments may cause timeout issues on slow connections
- IMAP IDLE support varies by provider

## 🗺️ Roadmap

- [ ] WebSocket support for real-time notifications
- [ ] Mobile app integration APIs
- [ ] Calendar integration
- [ ] Advanced spam filtering
- [ ] Email templates
- [ ] Backup and export functionality
- [ ] Plugin architecture for custom providers

## 📞 Support

For support, email [support@example.com] or create an issue in the GitHub repository.

## 🙏 Acknowledgments

- Express.js for the robust web framework
- MongoDB for flexible document storage
- Gmail API for seamless Gmail integration
- The open-source community for various libraries and tools