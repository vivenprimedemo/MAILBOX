import { getMarketingEmailById } from '../helpers/marketingEmailHelper.js';
import { getQueue } from '../queues/marketingEmailQueue.js';
import { payloadService } from '../services/payload.js';

class MarketingController {

    async sendNow(req, res) {
        try {
            const { marketingEmailId } = req.body;

            // Extract payload token from Authorization header
            const authHeader = req.headers.authorization;
            if (!authHeader || !authHeader.startsWith('Bearer ')) {
                return res.status(401).json({
                    success: false,
                    error: {
                        code: 'TOKEN_REQUIRED',
                        message: 'Authorization token is required in header'
                    }
                });
            }

            const payloadToken = authHeader.substring(7);

            if (!payloadToken) {
                return res.status(401).json({
                    success: false,
                    error: {
                        code: 'TOKEN_REQUIRED',
                        message: 'Payload token is required'
                    }
                });
            }

            const marketingEmail = await getMarketingEmailById(payloadToken, marketingEmailId);

            if (!marketingEmail) {
                return res.status(404).json({
                    success: false,
                    error: {
                        code: 'MARKETING_EMAIL_NOT_FOUND',
                        message: 'Marketing email not found'
                    }
                });
            }

            // Add job to queue
            const queue = await getQueue();
            await queue.add("send-now", { marketingEmailId, payloadToken });

            // Return success response
            return res.status(200).json({
                success: true,
                data: {
                    marketingEmail,
                    message: 'Marketing email job queued successfully',
                    jobData: { marketingEmailId, status: 'queued' }
                }
            });
        } catch (error) {
            console.log("[ERROR] Marketing email send now:", error);
            return res.status(500).json({
                success: false,
                error: {
                    code: 'SERVER_ERROR',
                    message: 'Internal server error'
                }
            });
        }
    }
}

export default new MarketingController();
