// import Redis from "ioredis";
// import { config } from "./index.js";
// import logger from "../utils/logger.js";

// let redisClient = null;

// /**
//  * Initialize Redis client connection using ioredis
//  * @returns {Promise<Redis>}
//  */
// async function initializeRedisClient() {
//     if (redisClient) {
//         return redisClient;
//     }

//     try {
//         const clientConfig = {
//             host: config.redis.host,
//             port: config.redis.port,
//             connectTimeout: 10000,
//             retryStrategy: (times) => {
//                 const delay = Math.min(times * 50, 2000);
//                 return delay;
//             },
//             maxRetriesPerRequest: 3,
//         };

//         // Add authentication if password is provided
//         if (config.redis.password) {
//             clientConfig.password = config.redis.password;
//         }

//         // Add TLS configuration if enabled
//         if (config.redis.useTLS) {
//             clientConfig.tls = {};
//         }

//         // Set client name if provided
//         if (config.redis.clientName) {
//             clientConfig.connectionName = config.redis.clientName;
//         }

//         redisClient = new Redis(clientConfig);

//         // Handle connection events
//         redisClient.on('connect', () => {
//             logger.info("Redis connection established", {
//                 host: config.redis.host,
//                 port: config.redis.port
//             });
//         });

//         redisClient.on('ready', () => {
//             logger.info("Redis client ready", {
//                 host: config.redis.host,
//                 port: config.redis.port
//             });
//         });

//         redisClient.on('error', (err) => {
//             logger.error("Redis connection error:", {
//                 error: err.message,
//                 host: config.redis.host,
//                 port: config.redis.port
//             });
//         });

//         redisClient.on('close', () => {
//             logger.warn("Redis connection closed");
//         });

//         redisClient.on('reconnecting', () => {
//             logger.info("Redis reconnecting...");
//         });

//         // Wait for connection to be ready
//         await redisClient.ping();
//         logger.info("Redis PING successful");

//         return redisClient;
//     } catch (err) {
//         logger.error("Redis initialization error:", {
//             error: err.message,
//             host: config.redis.host,
//             port: config.redis.port
//         });
//         throw err;
//     }
// }

// /**
//  * Get the Redis client instance
//  * Returns null if connection fails (graceful degradation)
//  * @returns {Promise<Redis|null>}
//  */
// export async function getValkeyClient() {
//     if (!redisClient) {
//         try {
//             return await initializeRedisClient();
//         } catch (err) {
//             logger.warn("Redis cache unavailable - continuing without cache", {
//                 error: err.message
//             });
//             logger.info('Server running without cache layer');
//             return null;
//         }
//     }
//     return redisClient;
// }

// /**
//  * Close Redis client connection gracefully
//  */
// export async function closeValkeyClient() {
//     if (redisClient) {
//         try {
//             await redisClient.quit();
//             redisClient = null;
//             logger.info("Redis connection closed gracefully");
//         } catch (err) {
//             logger.error("Error closing Redis connection:", err);
//             // Force close if quit fails
//             redisClient.disconnect();
//             redisClient = null;
//         }
//     }
// }

// // For backward compatibility with existing imports
// export default {
//     get client() {
//         if (!redisClient) {
//             throw new Error("Redis client not initialized. Use getValkeyClient() for async access.");
//         }
//         return redisClient;
//     }
// };




// src/config/redis.js
import Redis from 'ioredis';
import { config } from './index.js';
import logger from "../utils/logger.js";


class RedisClient {
  constructor() {
    if (!RedisClient.instance) {
      this.client = new Redis({
        host: config.redis.host || '127.0.0.1',
        port: config.redis.port || 6379,
        password: config.redis.password || undefined,
        db: 0,
        // optional: set retry strategy
        retryStrategy: times => {
          const delay = Math.min(times * 50, 2000);
          return delay;
        },
      });

      this.client.on('connect', () => {
        logger.info('Redis client connected');
      });

      this.client.on('error', (err) => {
        logger.error('Redis error', err);
      });

      RedisClient.instance = this;
    }

    return RedisClient.instance;
  }

  getClient() {
    return this.client;
  }
}

// Export a single instance of Redis client
const redisInstance = new RedisClient();
export const redisClient = redisInstance.getClient();
