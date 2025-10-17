import marketingEmailService from '../services/MarketingEmailService.js';
import logger from '../utils/logger.js';
import { createTrackingEvent, extractRequestMetadata, getMarketingEmailById, handleMarketingEmailError } from '../helpers/marketingEmailHelper.js';
import { payloadService } from '../services/payload.js';

class MarketingController {

    async sendNow(req, res) {
        const { marketingEmailId } = req.body;
        const payloadToken = req.payloadToken;
        try {
            if (!marketingEmailId) {
                return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Marketing email ID is required' } });
            }

            const result = await marketingEmailService.processMarketingEmail(payloadToken, marketingEmailId);

            return res.status(200).json(result);

        } catch (error) {
            const errorResponse = handleMarketingEmailError(error, marketingEmailId, logger);
            return res.status(errorResponse.statusCode).json(errorResponse.body);
        }
    }


    async trackOpen(req, res) {
        let transparentGif = Buffer.from(
            'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
            'base64'
        );

        try {
            const { meid, cid, campaign, utm_source, utm_medium, utm_campaign, utm_content, utm_term } = req.query;

            const metadata = extractRequestMetadata(req);

            logger.info('Email opened', {
                marketingEmailId: meid,
                contactId: cid,
                campaignId: campaign,
                metadata,
                timestamp: new Date().toISOString()
            });

            const token = await payloadService.generateAdminToken();
            const marketingEmail = await getMarketingEmailById(token, meid);

            const createdOpenEvent = await createTrackingEvent(token, 'OPEN', {
                marketingEmailId: meid,
                contactId: cid,
                campaignId: campaign,
                companyId: marketingEmail?.company_id,
                senderEmail: marketingEmail?.from_email || null,
                emailSubject: marketingEmail?.subject || null,
                metadata,
                utmParams: {
                    utm_source: utm_source || 'marketing_email',
                    utm_medium: utm_medium || null,
                    utm_campaign: utm_campaign || null,
                    utm_content: utm_content || null,
                    utm_term: utm_term || null
                }
            });

            console.log('Created open event:', createdOpenEvent);
        } catch (error) {
            logger.error('Error tracking email open', {
                error: error.message,
                stack: error.stack
            });
        } finally {
            // Always send the transparent 1x1 pixel
            res.setHeader('Content-Type', 'image/gif');
            res.setHeader('Content-Length', transparentGif.length);
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
            res.setHeader('Pragma', 'no-cache');
            res.send(transparentGif);
        }
    }


    async trackClick(req, res) {
        try {
            const { meid, cid, campaign, url, utm_source, utm_medium, utm_campaign, utm_content, utm_term } = req.query;

            if (!url) {
                return res.status(400).json({
                    success: false,
                    error: {
                        code: 'MISSING_URL',
                        message: 'Destination URL is required'
                    }
                });
            }

            const metadata = extractRequestMetadata(req);

            logger.info('Email link clicked', {
                marketingEmailId: meid,
                contactId: cid,
                campaignId: campaign,
                destinationUrl: url,
                metadata,
                timestamp: new Date().toISOString()
            });

            payloadService.generateAdminToken()
                .then(async (token) => {
                    const marketingEmail = await getMarketingEmailById(token, meid);
                    
                    const createdClickEvent = await createTrackingEvent(token, 'CLICK', {
                        marketingEmailId: meid,
                        contactId: cid,
                        campaignId: campaign,
                        companyId: marketingEmail?.company_id,
                        senderEmail: marketingEmail?.from_email || null,
                        emailSubject: marketingEmail?.subject || null,
                        clickedUrl: decodeURIComponent(url),
                        metadata,
                        utmParams: {
                            utm_source: utm_source || 'marketing_email',
                            utm_medium: utm_medium || null,
                            utm_campaign: utm_campaign || null,
                            utm_content: utm_content || null,
                            utm_term: utm_term || null
                        }
                    });

                    console.log('Created click event:', createdClickEvent);
                })
                .catch((error) => {
                    logger.error('Failed to record CLICK event', {
                        error: error.message,
                        marketingEmailId: meid,
                        contactId: cid
                    });
                });

            // Decode the URL and redirect
            const destinationUrl = decodeURIComponent(url);

            // Redirect to the actual destination
            return res.redirect(302, destinationUrl);
        } catch (error) {
            logger.error('Error tracking email click', {
                error: error.message,
                stack: error.stack,
                query: req.query
            });

            return res.status(500).json({
                success: false,
                error: {
                    code: 'CLICK_TRACKING_ERROR',
                    message: 'Failed to track click and redirect'
                }
            });
        }
    }
}

export default new MarketingController();
