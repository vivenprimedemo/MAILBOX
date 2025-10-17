import {
    getMarketingEmailById,
    getEmailAccount,
    getRecipients,
    sendMarketingEmail,
    updateMarketingEmailSummary,
    getCampaignById
} from '../helpers/marketingEmailHelper.js';
import { payloadService } from '../services/payload.js';
import logger from '../utils/logger.js';

export class MarketingEmailService {
    constructor() { }
    
    async processMarketingEmail(payloadToken, marketingEmailId) {
        const startTime = Date.now();

        try {
            logger.info('Marketing email processing started', { marketingEmailId });

            // Fetch marketing email
            const marketingEmail = await getMarketingEmailById(payloadToken, marketingEmailId);

            if (!marketingEmail) {
                const error = new Error('Marketing email not found');
                error.code = 'MARKETING_EMAIL_NOT_FOUND';
                throw error;
            }

            // Fetch recipients
            const contacts = await getRecipients(payloadToken, marketingEmail);

            // Fetch campaign
            const campaign  = await getCampaignById(payloadToken, marketingEmail.campaign_id);

            // Send emails to all contacts
            const sendStats = await this.sendEmailsInBatches(
                marketingEmail,
                contacts,
                campaign,
            );

            // Calculate processing time
            const processingTime = Math.round((Date.now() - startTime) / 1000);

            // Update marketing email summary in database
            await updateMarketingEmailSummary(payloadToken, marketingEmailId, {
                totalSent: sendStats.sent,
                totalFailed: sendStats.failed,
                totalDelivered: sendStats.delivered,
                errors: sendStats.errors.slice(0, 100) // Limit to first 100 errors
            });

            logger.info('Marketing email processing completed', {
                marketingEmailId,
                sent: sendStats.sent,
                failed: sendStats.failed,
                delivered: sendStats.delivered,
                processingTime
            });

            return {
                success: true,
                data: {
                    marketingEmailId,
                    totalContacts: contacts.length,
                    sent: sendStats.sent,
                    failed: sendStats.failed,
                    delivered: sendStats.delivered,
                    processingTime,
                    message: 'Marketing email sent successfully'
                }
            };

        } catch (error) {
            logger.error('Marketing email processing failed', {
                error: error.message,
                marketingEmailId,
                stack: error.stack
            });

            // Update status to indicate failure
            try {
                await payloadService.update(
                    payloadToken,
                    'marketing_emails',
                    marketingEmailId,
                    {
                        status: 'draft',
                        error_log: error.message
                    }
                );
            } catch (updateError) {
                logger.error('Failed to update marketing email status', { error: updateError.message });
            }

            throw error;
        }
    }

    async sendEmailsInBatches(marketingEmail, contacts, campaign) {
        let sent = 0, failed = 0, delivered = 0;
        const errors = [];
        const sendResults = [];

        // Process contacts in batches to avoid overwhelming the email provider
        const batchSize = 10;
        const totalBatches = Math.ceil(contacts.length / batchSize);

        for (let i = 0; i < contacts.length; i += batchSize) {
            const batch = contacts.slice(i, i + batchSize);
            const batchNumber = Math.floor(i / batchSize) + 1;

            await Promise.allSettled(
                batch.map(async (contact) => {
                    try {
                        const result = await sendMarketingEmail(
                            marketingEmail,
                            contact,
                            campaign,
                        );

                        if (result.success) {
                            sent++;
                            delivered++;

                            // Track successful send
                            sendResults.push({
                                contact_id: contact._id,
                                contact_email: contact.email,
                                contact_name: contact.name || contact.first_name || '',
                                status: 'sent',
                                sent_at: new Date().toISOString()
                            });
                        } else {
                            failed++;
                            const errorMsg = `Failed to send to ${contact.email}: ${result.error}`;
                            errors.push(errorMsg);

                            // Track failed send
                            sendResults.push({
                                contact_id: contact._id,
                                contact_email: contact.email,
                                contact_name: contact.name || contact.first_name || '',
                                status: 'failed',
                                error: result.error,
                                failed_at: new Date().toISOString()
                            });
                        }

                        return result;
                    } catch (err) {
                        failed++;
                        const errorMsg = `Exception sending to ${contact.email}: ${err.message}`;
                        errors.push(errorMsg);

                        // Track exception
                        sendResults.push({
                            contact_id: contact._id,
                            contact_email: contact.email,
                            contact_name: contact.name || contact.first_name || '',
                            status: 'failed',
                            error: err.message,
                            failed_at: new Date().toISOString()
                        });

                        throw err;
                    }
                })
            );

            // Log batch completion
            logger.info('Batch processed', {
                marketingEmailId: marketingEmail.id,
                batchNumber,
                totalBatches,
                sent,
                failed
            });

            // Add small delay between batches to avoid rate limiting
            if (i + batchSize < contacts.length) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        return {
            sent,
            failed,
            delivered,
            errors,
            sendResults,
            batchSize,
            totalBatches
        };
    }

    validateMarketingEmail(marketingEmail) {
        const errors = [];

        if (!marketingEmail.subject) {
            errors.push('Subject is required');
        }

        if (!marketingEmail.from_email) {
            errors.push('From email is required');
        }

        if (!marketingEmail.email_body_html) {
            errors.push('Email body is required');
        }

        if (!marketingEmail.recipient_type) {
            errors.push('Recipient type is required');
        }

        if (marketingEmail.recipient_type === 'segments' && (!marketingEmail.segments || marketingEmail.segments.length === 0)) {
            errors.push('At least one segment is required when recipient type is segments');
        }

        if (marketingEmail.recipient_type === 'contacts' && (!marketingEmail.contacts || marketingEmail.contacts.length === 0)) {
            errors.push('At least one contact is required when recipient type is contacts');
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }
}

export default new MarketingEmailService();
