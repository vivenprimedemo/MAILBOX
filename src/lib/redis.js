// lib/redisCache.js
import redisClient from "../config/redis.js";
import { logger } from "../config/logger.js";

export const setCache = async (key, value, ttl = 3600) => {
    try {
        await redisClient.set(key, JSON.stringify(value), { EX: ttl });
    } catch (err) {
        logger.error("Redis setCache error:", err);
    }
};

export const getCache = async (key) => {
    try {
        const data = await redisClient.get(key);
        return data ? JSON.parse(data) : null;
    } catch (err) {
        logger.error("Redis getCache error:", err);
        return null;
    }
};

export const deleteCache = async (key) => {
    try {
        await redisClient.del(key);
    } catch (err) {
        logger.error("Redis deleteCache error:", err);
    }
};