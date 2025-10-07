// lib/redisCache.js
import redisClient from "../config/redis.js";
import { logger } from "../config/logger.js";
import { config } from "../config/index.js";

export const setCache = async (key, value, ttl = 3600) => {
    try {
        if(!config.cache) return null;
        await redisClient.set(key, JSON.stringify(value), { EX: ttl });
    } catch (err) {
        logger.error("Redis setCache error:", err);
    }
};

export const getCache = async (key) => {
    try {
        if(!config.cache) return null;
        const data = await redisClient.get(key);
        return data ? JSON.parse(data) : null;
    } catch (err) {
        logger.error("Redis getCache error:", err);
        return null;
    }
};

export const deleteCache = async (key) => {
    try {
        if(!config.cache) return null;
        await redisClient.del(key);
    } catch (err) {
        logger.error("Redis deleteCache error:", err);
    }
};