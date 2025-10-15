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