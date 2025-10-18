import dotenv from "dotenv";
dotenv.config();

const outlook_scopes = [
    'offline_access',
    'https://graph.microsoft.com/User.Read',
    'https://graph.microsoft.com/Mail.Send',
    'https://graph.microsoft.com/Mail.ReadWrite',
    'https://graph.microsoft.com/MailboxFolder.Read',
    'https://graph.microsoft.com/Calendars.Read',
];

const gmail_scopes = [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/gmail.modify',
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/calendar.events'
]

export const config = {
    // Server configuration
    PORT: parseInt(process.env.PORT || "3000"),
    NODE_ENV: process.env.NODE_ENV || "development",
    APP_BASE_URL: process.env.APP_BASE_URL || `http://localhost:${process.env.PORT}`,

    // Database configuration
    MONGODB_URI:
        process.env.MONGODB_URI || "mongodb://localhost:27017/email_client",
    DB_NAME: process.env.DB_NAME || "imap_client",

    // API configuration
    API_BASE_URL: process.env.API_BASE_URL || "http://localhost:3000",

    // JWT configuration
    JWT_SECRET: process.env.JWT_SECRET,
    JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || "7d",

    // GOOGLE
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI: process.env.GOOGLE_REDIRECT_URI,
    GOOGLE_PUBSUB_TOPIC: process.env.GOOGLE_PUBSUB_TOPIC,
    GOOGLE_PUBSUB_SUBSCRIPTION: process.env.GOOGLE_PUBSUB_SUBSCRIPTION,
    GOOGLE_CLOUD_PROJECT_ID: process.env.GOOGLE_CLOUD_PROJECT_ID,


    // OUTLOOK
    OUTLOOK_CLIENT_ID: process.env.OUTLOOK_CLIENT_ID,
    OUTLOOK_CLIENT_SECRET: process.env.OUTLOOK_CLIENT_SECRET,
    OUTLOOK_TENANT_ID: process.env.OUTLOOK_TENANT_ID,
    OUTLOOK_REDIRECT_URI: process.env.OUTLOOK_REDIRECT_URI,

    // MICROSOFT GRAPH
    MICROSOFT_CLIENT_ID: process.env.MICROSOFT_CLIENT_ID,
    MICROSOFT_CLIENT_SECRET: process.env.MICROSOFT_CLIENT_SECRET,

    // WEBHOOK CONFIGURATION
    WEBHOOK_BASE_URL: process.env.WEBHOOK_BASE_URL,

    // CORS
    ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS.split(","),

    // Logging configuration
    LOG_LEVEL: process.env.LOG_LEVEL || "info",

    // RATE LIMITING
    RATE_LIMIT_WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS || "900000"),
    RATE_LIMIT_MAX_REQUESTS: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || "100"),

    // Version
    VERSION: process.env.npm_package_version || "1.0.0",

    // OUTLOOK SCOPES
    SCOPES: {
        outlook: outlook_scopes,
        gmail: gmail_scopes,
    },

    // IGNORE HEADERS - custom header name to identify and ignore specific email messages
    CUSTOM_HEADERS: {
        GOOGLE: 'X-CRM-IGNORE',
        OUTLOOK: `String {a2b93407-9b8e-4011-bcbb-c44f50c1a915} Name X-CRM-IGNORE`,
        CRM_IGNORE: 'X-CRM-IGNORE',
        CRM_ASSOCIATIONS: 'X-CRM-ASSOCIATIONS',
    },

    OAUTH_STATE_SECRET: 'super secret token for oauth state',
    OAUTH_STATE_EXPIRES_IN: '10m',
    OAUTH_REDIRECT_URI: 'http://localhost:8081/api/oauth/callback',

    // Valkey/Redis configuration
    redis: {
        host: process.env.REDIS_HOST || "127.0.0.1", // default to localhost
        port: parseInt(process.env.REDIS_PORT) || 6379, // default to 6379
        password: process.env.REDIS_PASSWORD || null, // default to null
        clientName: process.env.REDIS_CLIENT_NAME || 'mailbox-valkey-client',
        requestTimeout: parseInt(process.env.REDIS_REQUEST_TIMEOUT) || 500, // default 500ms
        useTLS: process.env.REDIS_USE_TLS === 'true' // default false
    },

    connection: {
        host: process.env.REDIS_HOST || "127.0.0.1", // default to localhost
        port: parseInt(process.env.REDIS_PORT) || 6379, // default to 6379
        // password: process.env.REDIS_PASSWORD || null, // default to null
        // tls: {}
        // clientName: process.env.REDIS_CLIENT_NAME || 'mailbox-valkey-client',
        // requestTimeout: parseInt(process.env.REDIS_REQUEST_TIMEOUT) || 500, // default 500ms
        // useTLS: process.env.REDIS_USE_TLS === 'true' // default false
    },

    cache: process.env.CACHE === 'true',

    // SMTP Configuration (for sending marketing emails)
    SMTP_HOST: process.env.SMTP_HOST,
    SMTP_PORT: parseInt(process.env.SMTP_PORT) || 587,
    SMTP_SECURE: process.env.SMTP_SECURE === 'true' || false,
    SMTP_USER: process.env.SMTP_USER,
    SMTP_PASSWORD: process.env.SMTP_PASSWORD,
    SMTP_USER_EMAIL: process.env.SMTP_USER_EMAIL,
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
