import marketingEmailService from "../../services/MarketingEmailService.js";
import logger from "../../utils/logger.js";
import { createWorker } from "../marketingEmailQueue.js";

export const startWorker = async () => {

    await createWorker(async (job) => {
        const { marketingEmailId, payloadToken } = job.data;

        try {
            logger.info('Marketing email job started', { marketingEmailId });

            // Process marketing email using the service
            const result = await marketingEmailService.processMarketingEmail(payloadToken, marketingEmailId);

            logger.info('Marketing email job completed', {
                marketingEmailId,
                sent: result.data.sent,
                failed: result.data.failed,
                delivered: result.data.delivered,
                processingTime: result.data.processingTime
            });

            return {
                success: true,
                sent: result.data.sent,
                failed: result.data.failed,
                delivered: result.data.delivered,
                processingTime: result.data.processingTime
            };

        } catch (error) {
            logger.error('Marketing email job failed', {
                error: error.message,
                marketingEmailId,
                stack: error.stack
            });

            throw error;
        }
    });
};
