import { getValkeyClient } from '../config/redis.js';
import logger from '../utils/logger.js';

/**
 * CacheService - Comprehensive caching service using Valkey GLIDE
 * Provides a high-level API for cache operations with namespace support
 */
export class CacheService {
    /**
     * @param {string} namespace - Optional namespace prefix for keys
     */
    constructor(namespace = '') {
        this.namespace = namespace;
    }

    /**
     * Build namespaced key
     * @param {string} key
     * @returns {string}
     */
    _buildKey(key) {
        return this.namespace ? `${this.namespace}:${key}` : key;
    }

    /**
     * Get cache client
     * @returns {Promise<GlideClient|null>}
     */
    async _getClient() {
        const client = await getValkeyClient();
        if (!client) {
            logger.error('Cache client unavailable');
        }
        return client;
    }

    // ==================== Basic Operations ====================

    /**
     * Set a value in cache
     * @param {string} key
     * @param {*} value - Will be JSON stringified
     * @param {number} ttl - Time to live in seconds (optional)
     * @returns {Promise<boolean>} Success status
     */
    async set(key, value, ttl = null) {
        try {
            const client = await this._getClient();
            if (!client) {
                logger.error('Cache SET skipped - client unavailable', { key });
                return false;
            }

            const namespacedKey = this._buildKey(key);
            const serializedValue = JSON.stringify(value);

            const options = {};
            if (ttl !== null && ttl > 0) {
                options.expiry = {
                    type: "EX",  // EX = seconds, PX = milliseconds
                    count: ttl
                };
            }

            logger.info('Cache SET attempt', { key: namespacedKey, ttl, valueSize: serializedValue.length });
            const result = await client.set(namespacedKey, serializedValue, options);
            logger.info('Cache SET result', { key: namespacedKey, ttl, result, success: result === 'OK' });
            return result === 'OK';
        } catch (err) {
            logger.error('Cache SET error', { key, error: err.message, stack: err.stack });
            return false;
        }
    }

    /**
     * Get a value from cache
     * @param {string} key
     * @returns {Promise<*|null>} Parsed value or null
     */
    async get(key) {
        try {
            const client = await this._getClient();
            if (!client) return null;

            const namespacedKey = this._buildKey(key);
            const value = await client.get(namespacedKey);

            if (value === null) {
                logger.error('Cache MISS', { key: namespacedKey });
                return null;
            }

            logger.info('Cache HIT', { key: namespacedKey });
            return JSON.parse(value);
        } catch (err) {
            logger.error('Cache GET error', { key, error: err.message });
            return null;
        }
    }

    /**
     * Delete a key from cache
     * @param {string} key
     * @returns {Promise<boolean>} Success status
     */
    async delete(key) {
        try {
            const client = await this._getClient();
            if (!client) return false;

            const namespacedKey = this._buildKey(key);
            const count = await client.del([namespacedKey]);
            logger.info('Cache DELETE', { key: namespacedKey, deleted: count });
            return count > 0;
        } catch (err) {
            logger.error('Cache DELETE error', { key, error: err.message });
            return false;
        }
    }

    /**
     * Check if a key exists
     * @param {string} key
     * @returns {Promise<boolean>}
     */
    async exists(key) {
        try {
            const client = await this._getClient();
            if (!client) return false;

            const namespacedKey = this._buildKey(key);
            const count = await client.exists([namespacedKey]);
            return count > 0;
        } catch (err) {
            logger.error('Cache EXISTS error', { key, error: err.message });
            return false;
        }
    }

    // ==================== Expiration Operations ====================

    /**
     * Set expiration on a key
     * @param {string} key
     * @param {number} seconds - TTL in seconds
     * @returns {Promise<boolean>}
     */
    async expire(key, seconds) {
        try {
            const client = await this._getClient();
            if (!client) return false;

            const namespacedKey = this._buildKey(key);
            const result = await client.expire(namespacedKey, seconds);
            logger.info('Cache EXPIRE', { key: namespacedKey, seconds, success: result });
            return result;
        } catch (err) {
            logger.error('Cache EXPIRE error', { key, error: err.message });
            return false;
        }
    }

    /**
     * Get time to live for a key
     * @param {string} key
     * @returns {Promise<number>} TTL in seconds, -1 if no expiry, -2 if key doesn't exist
     */
    async ttl(key) {
        try {
            const client = await this._getClient();
            if (!client) return -2;

            const namespacedKey = this._buildKey(key);
            const ttl = await client.ttl(namespacedKey);
            return ttl;
        } catch (err) {
            logger.error('Cache TTL error', { key, error: err.message });
            return -2;
        }
    }

    // ==================== Batch Operations ====================

    /**
     * Set multiple key-value pairs
     * @param {Object} keyValuePairs - Object with key-value pairs
     * @param {number} ttl - Optional TTL for all keys
     * @returns {Promise<boolean>}
     */
    async mset(keyValuePairs, ttl = null) {
        try {
            const client = await this._getClient();
            if (!client) return false;

            const pairs = {};

            for (const [key, value] of Object.entries(keyValuePairs)) {
                const namespacedKey = this._buildKey(key);
                pairs[namespacedKey] = JSON.stringify(value);
            }

            const result = await client.mset(pairs);

            // Set TTL for all keys if specified
            if (ttl !== null && ttl > 0 && result === 'OK') {
                const expirePromises = Object.keys(pairs).map(key =>
                    client.expire(key, ttl).catch(err =>
                        logger.error('Cache MSET expire error', { key, error: err.message })
                    )
                );
                await Promise.all(expirePromises);
            }

            logger.info('Cache MSET', { count: Object.keys(pairs).length, ttl, success: result === 'OK' });
            return result === 'OK';
        } catch (err) {
            logger.error('Cache MSET error', { error: err.message });
            return false;
        }
    }

    /**
     * Get multiple values
     * @param {string[]} keys
     * @returns {Promise<Object>} Object with key-value pairs (null for missing keys)
     */
    async mget(keys) {
        try {
            const client = await this._getClient();
            if (!client) return {};

            const namespacedKeys = keys.map(key => this._buildKey(key));
            const values = await client.mget(namespacedKeys);

            const result = {};
            keys.forEach((key, index) => {
                const value = values[index];
                result[key] = value !== null ? JSON.parse(value) : null;
            });

            logger.info('Cache MGET', { count: keys.length });
            return result;
        } catch (err) {
            logger.error('Cache MGET error', { error: err.message });
            return {};
        }
    }

    /**
     * Delete multiple keys
     * @param {string[]} keys
     * @returns {Promise<number>} Number of deleted keys
     */
    async mdel(keys) {
        try {
            const client = await this._getClient();
            if (!client) return 0;

            const namespacedKeys = keys.map(key => this._buildKey(key));
            const count = await client.del(namespacedKeys);
            logger.info('Cache MDEL', { count });
            return count;
        } catch (err) {
            logger.error('Cache MDEL error', { error: err.message });
            return 0;
        }
    }

    // ==================== Hash Operations ====================

    /**
     * Set a field in a hash
     * @param {string} key - Hash key
     * @param {string} field - Field name
     * @param {*} value - Value to set
     * @returns {Promise<boolean>}
     */
    async hset(key, field, value) {
        try {
            const client = await this._getClient();
            if (!client) return false;

            const namespacedKey = this._buildKey(key);
            const serializedValue = JSON.stringify(value);
            const count = await client.hset(namespacedKey, { [field]: serializedValue });
            logger.info('Cache HSET', { key: namespacedKey, field, added: count });
            return count >= 0;
        } catch (err) {
            logger.error('Cache HSET error', { key, field, error: err.message });
            return false;
        }
    }

    /**
     * Get a field from a hash
     * @param {string} key - Hash key
     * @param {string} field - Field name
     * @returns {Promise<*|null>}
     */
    async hget(key, field) {
        try {
            const client = await this._getClient();
            if (!client) return null;

            const namespacedKey = this._buildKey(key);
            const value = await client.hget(namespacedKey, field);

            if (value === null) {
                return null;
            }

            return JSON.parse(value);
        } catch (err) {
            logger.error('Cache HGET error', { key, field, error: err.message });
            return null;
        }
    }

    /**
     * Get all fields and values from a hash
     * @param {string} key - Hash key
     * @returns {Promise<Object>}
     */
    async hgetall(key) {
        try {
            const client = await this._getClient();
            if (!client) return {};

            const namespacedKey = this._buildKey(key);
            const hash = await client.hgetall(namespacedKey);

            if (!hash || Object.keys(hash).length === 0) {
                return {};
            }

            const result = {};
            for (const [field, value] of Object.entries(hash)) {
                result[field] = JSON.parse(value);
            }

            return result;
        } catch (err) {
            logger.error('Cache HGETALL error', { key, error: err.message });
            return {};
        }
    }

    /**
     * Delete a field from a hash
     * @param {string} key - Hash key
     * @param {string|string[]} fields - Field name(s) to delete
     * @returns {Promise<number>} Number of deleted fields
     */
    async hdel(key, fields) {
        try {
            const client = await this._getClient();
            if (!client) return 0;

            const namespacedKey = this._buildKey(key);
            const fieldArray = Array.isArray(fields) ? fields : [fields];
            const count = await client.hdel(namespacedKey, fieldArray);
            logger.info('Cache HDEL', { key: namespacedKey, fields: fieldArray, deleted: count });
            return count;
        } catch (err) {
            logger.error('Cache HDEL error', { key, fields, error: err.message });
            return 0;
        }
    }

    /**
     * Check if a field exists in a hash
     * @param {string} key - Hash key
     * @param {string} field - Field name
     * @returns {Promise<boolean>}
     */
    async hexists(key, field) {
        try {
            const client = await this._getClient();
            if (!client) return false;

            const namespacedKey = this._buildKey(key);
            const exists = await client.hexists(namespacedKey, field);
            return exists;
        } catch (err) {
            logger.error('Cache HEXISTS error', { key, field, error: err.message });
            return false;
        }
    }

    // ==================== Utility Operations ====================

    /**
     * Increment a counter
     * @param {string} key
     * @param {number} increment - Amount to increment by (default: 1)
     * @returns {Promise<number|null>} New value or null on error
     */
    async incr(key, increment = 1) {
        try {
            const client = await this._getClient();
            if (!client) return null;

            const namespacedKey = this._buildKey(key);
            const value = increment === 1
                ? await client.incr(namespacedKey)
                : await client.incrBy(namespacedKey, increment);
            logger.info('Cache INCR', { key: namespacedKey, increment, newValue: value });
            return value;
        } catch (err) {
            logger.error('Cache INCR error', { key, error: err.message });
            return null;
        }
    }

    /**
     * Decrement a counter
     * @param {string} key
     * @param {number} decrement - Amount to decrement by (default: 1)
     * @returns {Promise<number|null>} New value or null on error
     */
    async decr(key, decrement = 1) {
        try {
            const client = await this._getClient();
            if (!client) return null;

            const namespacedKey = this._buildKey(key);
            const value = decrement === 1
                ? await client.decr(namespacedKey)
                : await client.decrBy(namespacedKey, decrement);
            logger.info('Cache DECR', { key: namespacedKey, decrement, newValue: value });
            return value;
        } catch (err) {
            logger.error('Cache DECR error', { key, error: err.message });
            return null;
        }
    }

    /**
     * Delete all keys matching a pattern
     * @param {string} pattern - Pattern to match (e.g., "EMAIL:INBOX:123:*")
     * @returns {Promise<number>} Number of deleted keys
     */
    async deleteByPattern(pattern) {
        try {
            const client = await this._getClient();
            if (!client) return 0;

            const matchPattern = this.namespace ? `${this.namespace}:${pattern}` : pattern;
            const keysToDelete = [];
            let cursor = "0";

            // Use SCAN to find all matching keys
            do {
                const result = await client.scan(cursor, { match: matchPattern, count: 100 });
                cursor = result[0];
                const keys = result[1];

                if (keys && keys.length > 0) {
                    keysToDelete.push(...keys);
                }
            } while (cursor !== "0");

            // Delete all found keys
            let deletedCount = 0;
            if (keysToDelete.length > 0) {
                deletedCount = await client.del(keysToDelete);
            }

            return deletedCount;
        } catch (err) {
            logger.error('Cache DELETE_BY_PATTERN error', { pattern, error: err.message, stack: err.stack });
            return 0;
        }
    }

    /**
     * Flush all keys in the current namespace (use with caution!)
     * If no namespace, flushes entire cache
     * @returns {Promise<boolean>}
     */
    async flush() {
        try {
            const client = await this._getClient();
            if (!client) return false;

            if (this.namespace) {
                // Flush only keys in this namespace
                // Note: This requires SCAN command which we'll implement as a basic version
                logger.warn('Namespace flush not fully implemented - flushes entire cache', {
                    namespace: this.namespace
                });
            }

            // Flush entire database (use with caution)
            await client.flushdb();
            logger.info('Cache FLUSH', { namespace: this.namespace || 'all' });
            return true;
        } catch (err) {
            logger.error('Cache FLUSH error', { error: err.message });
            return false;
        }
    }

    /**
     * Check if cache connection is healthy
     * @returns {Promise<boolean>}
     */
    async healthCheck() {
        try {
            const client = await this._getClient();
            if (!client) return false;

            const response = await client.ping();
            return response === 'PONG';
        } catch (err) {
            logger.error('Cache health check failed', { error: err.message });
            return false;
        }
    }

    /**
     * Get cache statistics (basic implementation)
     * @returns {Promise<Object>}
     */
    async getStats() {
        try {
            const client = await this._getClient();
            if (!client) {
                return {
                    connected: false,
                    namespace: this.namespace || 'default',
                    error: 'Client not available'
                };
            }

            const info = await client.info([]);

            return {
                connected: true,
                namespace: this.namespace || 'default',
                info: info
            };
        } catch (err) {
            logger.error('Cache stats error', { error: err.message });
            return {
                connected: false,
                namespace: this.namespace || 'default',
                error: err.message
            };
        }
    }
}

// Export default instance with no namespace
export default new CacheService();
