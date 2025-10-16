import {
    getEmailAccount,
    getMarketingEmailById,
    getRecipients,
    saveSendSummaryToFile,
    sendMarketingEmail,
    updateMarketingEmailSummary
} from "../../helpers/marketingEmailHelper.js";
import { payloadService } from "../../services/payload.js";
import logger from "../../utils/logger.js";
import { createWorker } from "../marketingEmailQueue.js";

export const startWorker = async () => {
  
    await createWorker(async (job) => {
        
        const { marketingEmailId, payloadToken } = job.data;
        const startTime = Date.now();

        try {

            logger.info('Marketing email job started', marketingEmailId);

            // Fetch marketing email
            const marketingEmail = await getMarketingEmailById(payloadToken, marketingEmailId);

            if (!marketingEmail) {
                throw new Error("Marketing email not found");
            }

            // Fetch email account configuration
            const emailAccount = await getEmailAccount(marketingEmail.from_email);

            if (!emailAccount) {
                throw new Error(`Email account not found for ${marketingEmail.from_email}`);
            }

            // Fetch recipients
            const contacts = await getRecipients(payloadToken, marketingEmail);

            logger.info('Marketing email total contacts', contacts.length );

            // Send emails to all contacts
            let sent = 0, failed = 0, delivered = 0;
            const errors = [];
            const sendResults = [];

            // Process contacts in batches to avoid overwhelming the email provider
            const batchSize = 10;
            const totalBatches = Math.ceil(contacts.length / batchSize);

            for (let i = 0; i < contacts.length; i += batchSize) {
                const batch = contacts.slice(i, i + batchSize);
                const batchNumber = Math.floor(i / batchSize) + 1;

                const results = await Promise.allSettled(
                    batch.map(async (contact) => {
                        try {
                            const result = await sendMarketingEmail(
                                marketingEmail,
                                contact,
                                emailAccount._id.toString()
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
                    marketingEmailId,
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

            // Calculate processing time
            const processingTime = Math.round((Date.now() - startTime) / 1000);

            // Update marketing email summary in database
            await updateMarketingEmailSummary(payloadToken, marketingEmailId, {
                totalSent: sent,
                totalFailed: failed,
                totalDelivered: delivered,
                errors: errors.slice(0, 100) // Limit to first 100 errors
            });

            // Save detailed summary to JSON file
            if(process.env.NODE_ENV === 'development') {
                await saveSendSummaryToFile(marketingEmailId, {
                    totalContacts: contacts.length,
                    totalSent: sent,
                    totalFailed: failed,
                    totalDelivered: delivered,
                    subject: marketingEmail.subject,
                    fromEmail: marketingEmail.from_email,
                    fromName: marketingEmail.from_name,
                    replyTo: marketingEmail.reply_to,
                    scheduledAt: marketingEmail.scheduled_at,
                    sentAt: new Date().toISOString(),
                    sendResults,
                    errors,
                    batchSize,
                    totalBatches,
                    processingTime
                });
            }

            logger.info('Marketing email job completed', {
                marketingEmailId,
                sent,
                failed,
                delivered,
                processingTime
            });

            return {
                success: true,
                sent,
                failed,
                delivered,
                processingTime
            };

        } catch (error) {
            logger.error('Marketing email job failed', {
                error: error.message,
                marketingEmailId,
                stack: error.stack
            });

            // Update status to indicate failure
            await payloadService.update(
                payloadToken,
                'marketing_emails',
                marketingEmailId,
                {
                    status: 'draft',
                    error_log: error.message
                }
            );

            throw error;
        }
    });
};
