import { GlideClient } from "@valkey/valkey-glide";
import { config } from "./index.js";
import logger from "../utils/logger.js";

let valkeyClient = null;

/**
 * Initialize Valkey GLIDE client connection
 * @returns {Promise<GlideClient>}
 */
async function initializeValkeyClient() {
    if (valkeyClient) {
        return valkeyClient;
    }

    try {
        const clientConfig = {
            addresses: [{
                host: config.redis.host,
                port: config.redis.port
            }],
            clientName: config.redis.clientName || 'mailbox-valkey-client',
            requestTimeout: config.redis.requestTimeout || 500, // 500ms default
        };

        // Add authentication if password is provided
        if (config.redis.password) {
            clientConfig.credentials = {
                password: config.redis.password
            };
        }

        // Add TLS configuration if enabled
        if (config.redis.useTLS) {
            clientConfig.useTLS = true;
        }

        valkeyClient = await GlideClient.createClient(clientConfig);
        logger.info("Valkey GLIDE connection established", {
            host: config.redis.host,
            port: config.redis.port,
            clientName: clientConfig.clientName
        });

        return valkeyClient;
    } catch (err) {
        logger.error("Valkey connection error:", {
            error: err.message,
            host: config.redis.host,
            port: config.redis.port
        });
        throw err;
    }
}

/**
 * Get the Valkey client instance
 * Returns null if connection fails (graceful degradation)
 * @returns {Promise<GlideClient|null>}
 */
export async function getValkeyClient() {
    if (!valkeyClient) {
        try {
            return await initializeValkeyClient();
        } catch (err) {
            logger.warn("Valkey cache unavailable - continuing without cache", {
                error: err.message
            });
            logger.info('Server running without cache layer');
            return null;
        }
    }
    return valkeyClient;
}

/**
 * Close Valkey client connection gracefully
 */
export async function closeValkeyClient() {
    if (valkeyClient) {
        try {
            valkeyClient.close();
            valkeyClient = null;
            logger.info("Valkey connection closed gracefully");
        } catch (err) {
            logger.error("Error closing Valkey connection:", err);
        }
    }
}

// For backward compatibility with existing imports
export default {
    get client() {
        if (!valkeyClient) {
            throw new Error("Valkey client not initialized. Use getValkeyClient() for async access.");
        }
        return valkeyClient;
    }
};
