import {
    getMarketingEmailById,
    getEmailAccount,
    getRecipients,
    saveSendSummaryToFile,
    sendMarketingEmail,
    updateMarketingEmailSummary
} from '../helpers/marketingEmailHelper.js';
import { payloadService } from '../services/payload.js';
import logger from '../utils/logger.js';

export class MarketingEmailService {
    constructor() { }

    /**
     * Process and send marketing email to all recipients
     * @param {string} payloadToken - JWT token for Payload CMS authentication
     * @param {string} marketingEmailId - ID of the marketing email to send
     * @returns {Promise<Object>} - Result object with send statistics
     */
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

            // Fetch email account configuration
            const emailAccount = await getEmailAccount(marketingEmail.from_email);

            if (!emailAccount) {
                logger.error('Email account not found', { fromEmail: marketingEmail.from_email });
                const error = new Error(`Email account not found for ${marketingEmail.from_email}`);
                error.code = 'EMAIL_ACCOUNT_NOT_FOUND';
                throw error;
            }

            // Fetch recipients
            const contacts = await getRecipients(payloadToken, marketingEmail);

            logger.info('Marketing email total contacts', { contactCount: contacts.length });

            // Send emails to all contacts
            const sendStats = await this.sendEmailsInBatches(
                marketingEmail,
                contacts,
                emailAccount._id.toString()
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

            // Save detailed summary to JSON file (development only)
            if (process.env.NODE_ENV === 'development') {
                await saveSendSummaryToFile(marketingEmailId, {
                    totalContacts: contacts.length,
                    totalSent: sendStats.sent,
                    totalFailed: sendStats.failed,
                    totalDelivered: sendStats.delivered,
                    subject: marketingEmail.subject,
                    fromEmail: marketingEmail.from_email,
                    fromName: marketingEmail.from_name,
                    replyTo: marketingEmail.reply_to,
                    scheduledAt: marketingEmail.scheduled_at,
                    sentAt: new Date().toISOString(),
                    sendResults: sendStats.sendResults,
                    errors: sendStats.errors,
                    batchSize: sendStats.batchSize,
                    totalBatches: sendStats.totalBatches,
                    processingTime
                });
            }

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

    /**
     * Send emails to contacts in batches to avoid overwhelming the email provider
     * @param {Object} marketingEmail - Marketing email data
     * @param {Array} contacts - List of contacts to send to
     * @param {string} emailAccountId - Email account ID to use for sending
     * @returns {Promise<Object>} - Send statistics
     */
    async sendEmailsInBatches(marketingEmail, contacts, emailAccountId) {
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
                            emailAccountId
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

    /**
     * Validate marketing email data before sending
     * @param {Object} marketingEmail - Marketing email data
     * @returns {Object} - Validation result
     */
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
