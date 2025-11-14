import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import compression from 'compression';
import { config } from '../config/index.js';
import logger from '../utils/logger.js';

// Rate limiting configurations (using centralized config)
export const authLimiter = rateLimit({
    ...config.rateLimiting.auth
});

export const generalLimiter = rateLimit({
    ...config.rateLimiting.general
});

export const emailSendLimiter = rateLimit({
    ...config.rateLimiting.emailSend,
    // Custom key generator to rate limit per user (IP + userId)
    keyGenerator: (req) => {
        return `${req.ip}-${req.userId || 'anonymous'}`;
    }
});

// Security headers
export const securityHeaders = helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'"],
            fontSrc: ["'self'"],
            objectSrc: ["'none'"],
            mediaSrc: ["'self'"],
            frameSrc: ["'none'"],
        },
    },
    crossOriginEmbedderPolicy: false,
});

// Compression middleware
export const compressionMiddleware = compression({
    filter: (req, res) => {
        if (req.headers['x-no-compression']) {
            return false;
        }
        return compression.filter(req, res);
    },
    threshold: 1024, // Only compress if size > 1KB
});

// Request sanitization
export const sanitizeRequest = (req, res, next) => {
    // Remove potentially dangerous characters from string inputs
    const sanitizeObject = (obj) => {
        if (typeof obj === 'string') {
            return obj.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
                .replace(/javascript:/gi, '')
                .replace(/on\w+\s*=/gi, '');
        }

        if (Array.isArray(obj)) {
            return obj.map(sanitizeObject);
        }

        if (typeof obj === 'object' && obj !== null) {
            const sanitized = {};
            for (const key in obj) {
                if (obj.hasOwnProperty(key)) {
                    sanitized[key] = sanitizeObject(obj[key]);
                }
            }
            return sanitized;
        }

        return obj;
    };

    if (req.body && typeof req.body === 'object') {
        req.body = sanitizeObject(req.body);
    }

    next();
};

// CORS configuration
export const corsOptions = {
    origin: (origin, callback) => {
        const allowedOrigins = config.ALLOWED_ORIGINS;

        // Allow requests with no origin (mobile apps, etc.)
        if (!origin) return callback(null, true);

        if (allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    exposedHeaders: ['X-Total-Count', 'X-Page-Count']
};

// Error handling for security middleware
export const securityErrorHandler = (err, req, res, next) => {
    if (err.message === 'Not allowed by CORS') {
        return res.status(403).json({
            success: false,
            message: 'CORS: Origin not allowed'
        });
    }

    // Log security-related errors
    logger.error('Security middleware error', {
        error: err.message,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        path: req.path,
        method: req.method
    });

    res.status(500).json({
        success: false,
        message: 'Security error occurred'
    });
};

// Request logging for security monitoring
export const securityLogger = (req, res, next) => {
    const startTime = Date.now();

    res.on('finish', () => {
        const duration = Date.now() - startTime;
        const logData = {
            method: req.method,
            path: req.path,
            statusCode: res.statusCode,
            duration,
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            userId: req.userId || 'anonymous',
            timestamp: new Date().toISOString()
        };

        // Log suspicious activities
        if (res.statusCode === 401 || res.statusCode === 403 || res.statusCode === 429) {
            logger.warn('Security event', logData);
        }
    });

    next();
};