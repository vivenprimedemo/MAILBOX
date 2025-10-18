import { Queue } from 'bullmq';
import { config } from '../config/index.js';

export default class QueueManager {
    constructor() {
        if (!QueueManager.instance) {
            this.queues = {};
            QueueManager.instance = this;
        }
        return QueueManager.instance;
    }

    getQueue(queueName) {
        if (!this.queues[queueName]) {
            this.queues[queueName] = new Queue(queueName, { connection: config.connection });
            console.log(`📦 Queue initialized: ${queueName}`);
        }
        return this.queues[queueName];
    }

    async addJob(queueName, jobName, data, options = {}) {
        const queue = this.getQueue(queueName);
        const job = await queue.add(jobName, data, {
            attempts: 3,
            backoff: { type: 'exponential', delay: 5000 },
            removeOnComplete: true,
            ...options,
        });
        console.log(`📬 Job added to ${queueName}: ${jobName}`);
        return job;
    }

    async closeAll() {
        console.log('🛑 Closing all queues...');

        const closePromises = Object.entries(this.queues).map(async ([name, queue]) => {
            try {
                await queue.close();
                console.log(`✅ Queue closed: ${name}`);
            } catch (error) {
                console.error(`❌ Error closing queue ${name}:`, error);
            }
        });

        await Promise.all(closePromises);
        this.queues = {};
        console.log('🛑 All queues closed');
    }
}
