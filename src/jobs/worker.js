import { Worker } from 'bullmq';
import { config } from '../config/index.js';
import Processors from './processors.js';

export default class WorkerManager {
    constructor() {
        this.workers = [];
        this.processors = new Processors();
    }

    startAllWorkers() {
        this.createWorker('emailQueue', this.processors.email.bind(this.processors));
        this.createWorker('notificationQueue', this.processors.notification.bind(this.processors));
    }

    createWorker(queueName, processorFn) {
        const worker = new Worker(queueName, processorFn, {
            connection: config.connection,
            concurrency: 5,
        });

        worker.on('completed', (job) => console.log(`✅ ${queueName} job completed: ${job.id}`));
        worker.on('failed', (job, err) => console.error(`❌ ${queueName} job failed: ${job.id}`, err));

        this.workers.push(worker);
        console.log(`👷 Worker started for: ${queueName}`);
    }

    async shutdown() {
        console.log('🛑 Shutting down workers...');

        const closePromises = this.workers.map(async (worker) => {
            try {
                await worker.close();
                console.log('✅ Worker closed successfully');
            } catch (error) {
                console.error('❌ Error closing worker:', error);
            }
        });

        await Promise.all(closePromises);
        this.workers = [];
        console.log('🛑 All workers shut down');
    }
}
