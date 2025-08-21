import { config } from './config/index.js';
import express from 'express';
import cors from 'cors';
// import dotenv from 'dotenv';
import { Database } from './config/database.js';
import { logger, httpLogger } from './config/logger.js';
import apiRoutes from './routes/index.js';
import {
  securityHeaders,
  generalLimiter,
  compressionMiddleware,
  sanitizeRequest,
  corsOptions,
  securityErrorHandler,
  securityLogger
} from './middleware/security.js';

// Load environment variables
// dotenv.config();

class EmailClientServer {
  app;
  port;
  database;

  constructor() {
    this.app = express();
    this.port = config.PORT;
    this.database = Database.getInstance();
    
    this.initializeMiddleware();
    this.initializeRoutes();
    this.initializeErrorHandling();
  }

  initializeMiddleware() {
    // Security middleware
    this.app.use(securityHeaders);
    this.app.use(securityLogger);
    this.app.use(cors(corsOptions));
    this.app.use(generalLimiter);
    this.app.use(compressionMiddleware);
    
    // Body parsing middleware
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));
    
    // Request sanitization
    this.app.use(sanitizeRequest);

    // Request logging
    this.app.use((req, res, next) => {
      httpLogger.info(`${req.method} ${req.path}`, {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        query: req.query,
        body: req.method === 'POST' || req.method === 'PUT' ? 
          this.sanitizeLogData(req.body) : undefined
      });
      next();
    });
  }

  initializeRoutes() {
    // Root endpoint
    this.app.get('/', (req, res) => {
      res.json({
        success: true,
        data: {
          message: 'Universal Email Client Server',
          version: '1.0.0',
          status: 'running',
          endpoints: {
            api: '/api',
            health: '/api/health',
            docs: '/api/docs'
          }
        },
        error: null,
        metadata: {
          timestamp: new Date()
        }
      });
    });

    // API routes
    this.app.use('/api', apiRoutes);

    // Static files (if needed for documentation)
    this.app.use('/public', express.static('public'));

    // Catch 404
    this.app.use('*', (req, res) => {
      res.status(404).json({
        success: false,
        data: null,
        error: {
          code: 'ROUTE_NOT_FOUND',
          message: `Route not found: ${req.method} ${req.originalUrl}`,
          provider: '',
          timestamp: new Date(),
          suggestion: 'Check the API documentation at /api for available endpoints'
        },
        metadata: {}
      });
    });
  }

  initializeErrorHandling() {
    // Security error handler
    this.app.use(securityErrorHandler);

    // Global error handler
    this.app.use((err, req, res, next) => {
      logger.error('Unhandled error:', {
        error: err.message,
        stack: err.stack,
        path: req.path,
        method: req.method,
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });

      // Don't leak error details in production
      const isDevelopment = config.NODE_ENV === 'development';
      
      res.status(500).json({
        success: false,
        data: null,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Internal server error',
          provider: '',
          timestamp: new Date(),
          ...(isDevelopment && { 
            details: err.message,
            stack: err.stack 
          })
        },
        metadata: {}
      });
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception:', error);
      this.gracefulShutdown();
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
      this.gracefulShutdown();
    });

    // Handle process termination
    process.on('SIGTERM', () => {
      logger.info('SIGTERM received, starting graceful shutdown...');
      this.gracefulShutdown();
    });

    process.on('SIGINT', () => {
      logger.info('SIGINT received, starting graceful shutdown...');
      this.gracefulShutdown();
    });
  }

  sanitizeLogData(data) {
    if (!data) return data;
    
    const sensitiveFields = ['password', 'token', 'accessToken', 'refreshToken', 'secret'];
    const sanitized = { ...data };
    
    for (const field of sensitiveFields) {
      if (sanitized[field]) {
        sanitized[field] = '[REDACTED]';
      }
    }
    
    return sanitized;
  }

  async start() {
    try {
      // Connect to database
      await this.database.connect();
      logger.info('Database connected successfully');

      // Start server
      this.app.listen(this.port, () => {
        logger.info(`Email Client Server is running on port ${this.port}`, {
          port: this.port,
          environment: config.NODE_ENV,
          nodeVersion: process.version,
          pid: process.pid
        });

        if (config.NODE_ENV === 'development') {
          console.log(`\n🚀 Server running at:`);
          console.log(`   Local:    http://localhost:${this.port}`);
          console.log(`   API:      http://localhost:${this.port}/api`);
          console.log(`   Health:   http://localhost:${this.port}/api/health`);
          console.log(`\n📧 Email Client Features:`);
          console.log(`   • Multi-provider support (Gmail, Outlook, IMAP)`);
          console.log(`   • Email threading and search`);
          console.log(`   • Real-time synchronization`);
          console.log(`   • Security middleware and rate limiting`);
          console.log(`\n📖 API Documentation available at /api`);
        }
      });

    } catch (error) {
      logger.error('Failed to start server:', error);
      process.exit(1);
    }
  }

  async gracefulShutdown() {
    logger.info('Starting graceful shutdown...');

    try {
      // Close database connection
      await this.database.disconnect();
      logger.info('Database connection closed');

      // Close server
      logger.info('Server shutdown complete');
      process.exit(0);
    } catch (error) {
      logger.error('Error during shutdown:', error);
      process.exit(1);
    }
  }
}

// Start server if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const server = new EmailClientServer();
  server.start().catch((error) => {
    console.error('Failed to start server:', error);
    process.exit(1);
  });
}

export default EmailClientServer;