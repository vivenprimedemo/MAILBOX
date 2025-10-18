import QueueManager from './queues.js';

class Jobs {
    constructor() {
        console.log('🚀 Jobs initialized');
        this.queueManager = new QueueManager();
    }

    async addEmailJob(data) {
        return this.queueManager.addJob('emailQueue', 'sendEmail', data);
    }

    async addNotificationJob(data) {
        return this.queueManager.addJob('notificationQueue', 'sendNotification', data);
    }

    async shutdown() {
        return this.queueManager.closeAll();
    }
}

export default new Jobs();