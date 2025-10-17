import marketingEmailService from '../services/MarketingEmailService.js';
import logger from '../utils/logger.js';

class MarketingController {

    async sendNow(req, res) {
        const { marketingEmailId } = req.body;

        try {
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

            // Validate marketingEmailId is provided
            if (!marketingEmailId) {
                return res.status(400).json({
                    success: false,
                    error: {
                        code: 'VALIDATION_ERROR',
                        message: 'Marketing email ID is required'
                    }
                });
            }

            // Process marketing email using the service
            const result = await marketingEmailService.processMarketingEmail(payloadToken, marketingEmailId);

            return res.status(200).json(result);

        } catch (error) {
            logger.error('Marketing email send request failed', {
                error: error.message,
                marketingEmailId,
                stack: error.stack
            });

            // Determine appropriate status code based on error type
            let statusCode = 500;
            let errorCode = 'MARKETING_EMAIL_SEND_ERROR';

            if (error.code === 'MARKETING_EMAIL_NOT_FOUND') {
                statusCode = 404;
                errorCode = error.code;
            } else if (error.code === 'EMAIL_ACCOUNT_NOT_FOUND') {
                statusCode = 404;
                errorCode = error.code;
            } else if (error.code === 'VALIDATION_ERROR') {
                statusCode = 400;
                errorCode = error.code;
            }

            return res.status(statusCode).json({
                success: false,
                error: {
                    code: errorCode,
                    message: error.message || 'Failed to send marketing email'
                }
            });
        }
    }
}

export default new MarketingController();
