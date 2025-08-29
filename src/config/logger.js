import winston from 'winston';
import path from 'path';
import { config } from './index.js';

const logDir = 'logs';
const logLevel = config.LOG_LEVEL;

// Define log format
const logFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.json(),
    winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
        let logMessage = `${timestamp} [${level.toUpperCase()}]: ${message}`;

        if (stack) {
            logMessage += `\n${stack}`;
        }

        if (Object.keys(meta).length > 0) {
            logMessage += `\n${JSON.stringify(meta, null, 2)}`;
        }

        return logMessage;
    })
);

// Create logger instance
export const logger = winston.createLogger({
    level: logLevel,
    format: logFormat,
    defaultMeta: { service: 'email-client' },
    transports: [
        // Write all logs with level `error` and below to `error.log`
        new winston.transports.File({
            filename: path.join(logDir, 'error.log'),
            level: 'error',
            maxsize: 5242880, // 5MB
            maxFiles: 5,
            tailable: true
        }),

        // Write all logs with level `info` and below to `combined.log`
        new winston.transports.File({
            filename: path.join(logDir, 'combined.log'),
            maxsize: 5242880, // 5MB
            maxFiles: 5,
            tailable: true
        }),

        // Write all logs to console if not in production
        ...(config.NODE_ENV !== 'production'
            ? [new winston.transports.Console({
                format: winston.format.combine(
                    winston.format.colorize(),
                    winston.format.simple(),
                    winston.format.printf(({ timestamp, level, message, stack }) => {
                        let logMessage = `${timestamp} ${level}: ${message}`;
                        if (stack) {
                            logMessage += `\n${stack}`;
                        }
                        return logMessage;
                    })
                )
            })]
            : []
        )
    ],

    // Handle exceptions
    exceptionHandlers: [
        new winston.transports.File({ filename: path.join(logDir, 'exceptions.log') })
    ],

    // Handle rejections
    rejectionHandlers: [
        new winston.transports.File({ filename: path.join(logDir, 'rejections.log') })
    ]
});

// Stream for morgan HTTP logger
export const morganStream = {
    write: (message) => {
        logger.http(message.trim());
    }
};

// Email service specific logger
export const emailLogger = logger.child({ component: 'email-service' });
export const authLogger = logger.child({ component: 'auth-service' });
export const httpLogger = logger.child({ component: 'http' });

// Error logging utility
export const logError = (error, context) => {
    logger.error(error.message, {
        stack: error.stack,
        name: error.name,
        context
    });
};

// Debug logging utility
export const logDebug = (message, data) => {
    logger.debug(message, data);
};

// Info logging utility
export const logInfo = (message, data) => {
    logger.info(message, data);
};

// Warn logging utility
export const logWarn = (message, data) => {
    logger.warn(message, data);
};