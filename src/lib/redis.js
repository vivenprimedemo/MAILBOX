// lib/redisCache.js - Legacy wrapper for backward compatibility
// Uses new CacheService under the hood
import cacheService from "../services/CacheService.js";
import logger from "../utils/logger.js";
import { config } from "../config/index.js";

/**
 * Set a value in cache
 * @param {string} key
 * @param {*} value
 * @param {number} ttl - Time to live in seconds (default: 3600)
 * @returns {Promise<void>}
 * @deprecated Use CacheService directly for better functionality
 */
export const setCache = async (key, value, ttl = 3600) => {
    try {
        if(!config.cache) throw new Error("Cache is disabled. Please enable it in config.");
        await cacheService.set(key, value, ttl);
    } catch (err) {
        logger.error("Redis setCache error:", err);
    }
};

/**
 * Get a value from cache
 * @param {string} key
 * @returns {Promise<*|null>}
 * @deprecated Use CacheService directly for better functionality
 */
export const getCache = async (key) => {
    try {
        if(!config.cache) throw new Error("Cache is disabled. Please enable it in config.");
        return await cacheService.get(key);
    } catch (err) {
        logger.error("Redis getCache error:", err);
        return null;
    }
};

/**
 * Delete a key from cache
 * @param {string} key
 * @returns {Promise<void>}
 * @deprecated Use CacheService directly for better functionality
 */
export const deleteCache = async (key) => {
    try {
        await cacheService.delete(key);
    } catch (err) {
        logger.error("Redis deleteCache error:", err);
    }
};

/**
 * Clear inbox cache for a specific folder
 * Clears the default cache key (first page) when nextPage is not provided
 * @param {string} accountId - Account ID
 * @param {string} folderId - Folder ID
 * @param {string} nextPage - Next page token (optional, defaults to clearing first page)
 * @returns {Promise<boolean>}
 */
export const clearInboxCache = async (accountId, folderId, nextPage = '') => {
    try {
         if(!config.cache) throw new Error("Cache is disabled. Please enable it in config.");
        const { inbox } = await import('../helpers/index.js');

        // Clear the default/first page cache (most common case)
        const defaultKey = inbox(accountId, folderId, '');
        logger.info('Clearing inbox cache (default page)', {
            accountId,
            folderId,
            cacheKey: defaultKey
        });
        const defaultDeleted = await cacheService.delete(defaultKey);

        // If a specific nextPage is provided, also clear that
        if (nextPage) {
            const pageKey = inbox(accountId, folderId, nextPage);
            const pageDeleted = await cacheService.delete(pageKey);
            logger.info('Cleared inbox cache (with pagination)', {
                accountId,
                folderId,
                nextPage,
                defaultKey,
                pageKey,
                defaultDeleted,
                pageDeleted
            });
            return defaultDeleted || pageDeleted;
        }

        logger.info('Cleared inbox cache (default page)', {
            accountId,
            folderId,
            cacheKey: defaultKey,
            deleted: defaultDeleted
        });
        return defaultDeleted;
    } catch (err) {
        logger.error("Clear inbox cache error:", err);
        return false;
    }
};

/**
 * Clear ALL inbox cache entries for a specific account
 * This removes all inbox caches across all folders and pagination states
 * @param {string} accountId - Account ID
 * @returns {Promise<number>} Number of cache entries deleted
 */
export const clearAccountCache = async (accountId) => {
    try {
        if(!config.cache) throw new Error("Cache is disabled. Please enable it in config.");

        // Clear all inbox caches (EMAIL:INBOX:${accountId}:*)
        const inboxPattern = `EMAIL:INBOX:${accountId}:*`;
        const deletedCount = await cacheService.deleteByPattern(inboxPattern);

        return deletedCount;
    } catch (err) {
        logger.error("Clear account cache error:", err);
        return 0;
    }
};