
/**
 * Deduplication utility class for managing processed notifications and messages
 */
export class DeduplicationManager {
    constructor() {
        this.processedNotifications = new Map();
        this.processedGmailMessages = new Map();
        this.CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
        this.GMAIL_CACHE_DURATION = 10 * 60 * 1000; // 10 minutes
        this.CLEANUP_THRESHOLD = 10 * 60 * 1000; // 10 minutes
    }

    /**
     * Check if a notification has been processed recently
     * @param {string} key - Unique identifier for the notification
     * @param {number} duration - Cache duration in milliseconds
     * @returns {boolean} True if already processed
     */
    isProcessed(key, duration = this.CACHE_DURATION) {
        const now = Date.now();
        const existing = this.processedNotifications.get(key);
        return existing && now - existing < duration;
    }

    /**
     * Mark a notification as processed
     * @param {string} key - Unique identifier for the notification
     */
    markProcessed(key) {
        this.processedNotifications.set(key, Date.now());
        this.cleanup();
    }

    /**
     * Check if a Gmail message has been processed recently
     * @param {string} messageId - Gmail message ID
     * @param {string} historyId - Gmail history ID
     * @param {string} emailAddress - Email address
     * @returns {boolean} True if already processed
     */
    isGmailMessageProcessed(messageId, historyId, emailAddress) {
        const gmailMessageKey = `${emailAddress}_${messageId}_${historyId}`;
        const now = Date.now();
        const existing = this.processedGmailMessages.get(gmailMessageKey);

        if (existing && now - existing < this.GMAIL_CACHE_DURATION) {
            logger.info('Skipping duplicate Gmail message', {
                messageId,
                historyId,
                emailAddress: emailAddress.substring(0, 20) + '...',
                timeSinceLastProcess: `${Math.round((now - existing) / 1000)}s ago`
            });
            return true;
        }

        this.processedGmailMessages.set(gmailMessageKey, now);
        this.cleanupGmailMessages();
        return false;
    }

    /**
     * Clean up old notification entries
     */
    cleanup() {
        const now = Date.now();
        for (const [key, timestamp] of this.processedNotifications.entries()) {
            if (now - timestamp > this.CLEANUP_THRESHOLD) {
                this.processedNotifications.delete(key);
            }
        }
    }

    /**
     * Clean up old Gmail message entries
     */
    cleanupGmailMessages() {
        const now = Date.now();
        for (const [key, timestamp] of this.processedGmailMessages.entries()) {
            if (now - timestamp > 15 * 60 * 1000) { // 15 minutes
                this.processedGmailMessages.delete(key);
            }
        }
    }
}