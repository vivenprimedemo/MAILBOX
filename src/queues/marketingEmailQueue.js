// lib/queue.js
import { Queue, Worker } from "bullmq";
import Redis from "ioredis";
import { config } from "../config/index.js";
import constant from "../utils/constants.js";
import logger from "../utils/logger.js";

let queue = null;

// Create a connection configuration for BullMQ
const getRedisConnection = () => {
    return new Redis({
        host: config.redis.host || '127.0.0.1',
        port: config.redis.port || 6379,
        password: config.redis.password || undefined,
        db: 0,
        maxRetriesPerRequest: null, // Required for BullMQ
        enableReadyCheck: false, // Required for BullMQ
        retryStrategy: (times) => {
            const delay = Math.min(times * 50, 2000);
            return delay;
        }
    });
};

// Get Marketing email queue
export const getQueue = async () => {
    if (!queue) {
        try {
            queue = new Queue(constant.QUEUE.MARKETING_EMAILS, {
                connection: getRedisConnection(),
                defaultJobOptions: {
                    attempts: 3,
                    backoff: {
                        type: 'exponential',
                        delay: 2000
                    },
                    removeOnComplete: 100, // Keep last 100 completed jobs
                    removeOnFail: 200 // Keep last 200 failed jobs
                }
            });
            logger.info('Marketing email queue initialized');
        } catch (error) {
            logger.error('Failed to initialize queue:', error);
            throw error;
        }
    }
    return queue;
};

export const createWorker = async (processor) => {
    try {
        const worker = new Worker(constant.QUEUE.MARKETING_EMAILS, processor, {
            connection: getRedisConnection(),
            concurrency: 20,
            limiter: {
                max: 10, // Max 10 jobs
                duration: 1000 // per second
            }
        });

        // Worker event listeners
        worker.on('completed', (job) => {
            logger.info('Marketing email job completed', {
                jobId: job.id,
                marketingEmailId: job.data.marketingEmailId
            });
        });

        worker.on('failed', (job, err) => {
            logger.error('Marketing email job failed', {
                jobId: job?.id,
                marketingEmailId: job?.data?.marketingEmailId,
                error: err.message
            });
        });

        worker.on('error', (err) => {
            logger.error('Worker error:', err);
        });

        logger.info('Marketing email worker created successfully');
        return worker;
    } catch (error) {
        logger.error('Failed to create worker:', error);
        throw error;
    }
};
