import { createClient } from "redis";
import { config } from "./index.js";
import { logger } from "./logger.js";

const redisClient = createClient({
    socket: { host: config.redis.host, port: config.redis.port },
    password: config.redis.password
});

redisClient.connect().then(() => logger.info("Redis connection established")).catch(err => logger.error("Redis connection error:", err));

export default redisClient;
