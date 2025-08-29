import dotenv from "dotenv";
dotenv.config();

export const config = {
    // Server configuration
    PORT: parseInt(process.env.PORT || "3000"),
    NODE_ENV: process.env.NODE_ENV || "development",

    // Database configuration
    MONGODB_URI:
        process.env.MONGODB_URI || "mongodb://localhost:27017/email_client",
    DB_NAME: process.env.DB_NAME || "imap_client",

    // JWT configuration
    JWT_SECRET: process.env.JWT_SECRET,
    JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || "7d",

    // Logging configuration
    LOG_LEVEL: process.env.LOG_LEVEL || "info",

    // Security configuration
    RATE_LIMIT_WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS || "900000"),
    RATE_LIMIT_MAX_REQUESTS: parseInt(
        process.env.RATE_LIMIT_MAX_REQUESTS || "100"
    ),
    ALLOWED_ORIGINS: ["http://localhost:3000", "http://localhost:6010"],

    // Version
    VERSION: process.env.npm_package_version || "1.0.0",
    API_BASE_URL: process.env.API_BASE_URL || "http://localhost:3000",

    // Google configuration
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI:
        process.env.GOOGLE_REDIRECT_URI ||
        "http://localhost:6010/api/oauth/callback/google",
    GOOGLE_CLOUD_PROJECT_ID: process.env.GOOGLE_CLOUD_PROJECT_ID,
    GOOGLE_PUBSUB_TOPIC: process.env.GOOGLE_PUBSUB_TOPIC,
    GOOGLE_PUBSUB_SUBSCRIPTION: process.env.GOOGLE_PUBSUB_SUBSCRIPTION,

    // Outlook configuration
    OUTLOOK_CLIENT_ID: process.env.OUTLOOK_CLIENT_ID,
    OUTLOOK_CLIENT_SECRET: process.env.OUTLOOK_CLIENT_SECRET,
    OUTLOOK_REDIRECT_URI:
        process.env.OUTLOOK_REDIRECT_URI ||
        "http://localhost:6010/api/oauth/callback/outlook",
};

export const provider_config_map = {
    gmail: {
        client_id: config.GOOGLE_CLIENT_ID,
        client_secret: config.GOOGLE_CLIENT_SECRET,
        redirect_uri: config.GOOGLE_REDIRECT_URI,
    },
    outlook: {
        client_id: config.OUTLOOK_CLIENT_ID,
        client_secret: config.OUTLOOK_CLIENT_SECRET,
        redirect_uri: config.OUTLOOK_REDIRECT_URI,
    },
};
