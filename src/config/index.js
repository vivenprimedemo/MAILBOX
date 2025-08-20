export const config = {
  // Server configuration
  PORT: parseInt(process.env.PORT || '3000'),
  NODE_ENV: process.env.NODE_ENV || 'development',
  
  // Database configuration
  MONGODB_URI: process.env.MONGODB_URI || 'mongodb://localhost:27017/email_client',
  
  // JWT configuration
  JWT_SECRET: process.env.JWT_SECRET,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
  
  // Logging configuration
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  
  // Security configuration
  RATE_LIMIT_WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'),
  RATE_LIMIT_MAX_REQUESTS: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'),
  ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  
  // Version
  VERSION: process.env.npm_package_version || '1.0.0'
};