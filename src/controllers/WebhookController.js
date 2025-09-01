import { consoleHelper } from "../../consoleHelper.js";
import { EmailController } from './EmailController.js';

// In-memory cache for deduplication
const processedNotifications = new Map();

export class WebhookController {
    static async handleGmailWebhook(req, res) {
    }

    static async handleOutlookWebhook(req, res) {
        try {
            // Microsoft Graph sends validation token for webhook verification
            if (req.query.validationToken) {
                res.status(200).send(req.query.validationToken);
                return;
            }

            const notifications = req.body.value || [];

            // Process each notification
            for (const notification of notifications) {
                try {
                    const messageId = notification.resourceData?.id;
                    const changeType = notification.changeType;
                    const subscriptionId = notification.subscriptionId;

                    // Create unique notification ID for deduplication
                    const etag = notification.resourceData?.['@odata.etag'];
                    const notificationId = `${subscriptionId}_${messageId}_${changeType}_${etag}`;

                    // Check if we already processed this notification recently (last 5 minutes)
                    const now = Date.now();
                    const existing = processedNotifications.get(notificationId);
                    if (existing && (now - existing) < 5 * 60 * 1000) {
                        consoleHelper('Skipping duplicate notification (already processed):', {
                            notificationId: notificationId.substring(0, 50) + '...',
                            timeSinceLastProcess: `${Math.round((now - existing) / 1000)}s ago`
                        });
                        continue;
                    }

                    // Mark as processed
                    processedNotifications.set(notificationId, now);


                    // Clean up old entries (older than 10 minutes)
                    for (const [id, timestamp] of processedNotifications.entries()) {
                        if (now - timestamp > 10 * 60 * 1000) {
                            processedNotifications.delete(id);
                        }
                    }

                    consoleHelper('Processing notification:', {
                        subscriptionId: notification.subscriptionId,
                        changeType: notification.changeType,
                        resource: notification.resource,
                        resourceData: notification.resourceData?.id,
                        notificationId
                    });

                    // Extract message ID from the notification
                    if (messageId) {


                        // Fetch full email details and process notification
                        await WebhookController.processOutlookNotification(notification);
                    }
                } catch (error) {
                    consoleHelper('Failed to process notification', {
                        error: error.message,
                        notification: notification
                    });
                }
            }

            res.status(200).json({ success: true });
        } catch (error) {
            consoleHelper('Failed to handle Outlook notification', {
                error: error.message,
                stack: error.stack
            });
            res.status(500).json({
                success: false,
                error: {
                    code: 'NOTIFICATION_HANDLER_ERROR',
                    message: 'Failed to process notification',
                    timestamp: new Date()
                }
            });
        }
    }

    static async processOutlookNotification(notification) {
        try {
            const { resourceData, clientState } = notification;
            const messageId = resourceData?.id;
            consoleHelper('Client State:', clientState);



            if (messageId) {
                try {
                    // Extract account ID from client state (format: outlook_accountId_timestamp)
                    const accountId = clientState?.split('_')[1];

                    if (accountId) {

                        // Get the email details using our existing service
                        const emailService = EmailController.emailService;
                        const fullEmail = await emailService.getEmail(
                            accountId,
                            messageId,
                            null, // folder not needed for direct message ID lookup
                            null  // userId not needed for this operation
                        );

                        if (fullEmail) {
                            // Determine if this looks like a special email type
                            const isUndeliverable = fullEmail.subject?.toLowerCase().includes('undeliverable');
                            const isAutoReply = fullEmail.from?.address?.includes('noreply') || fullEmail.from?.address?.includes('MicrosoftExchange');
                            const isSystemEmail = isUndeliverable || isAutoReply;



                            if (isSystemEmail) {
                                consoleHelper('⚠️  Email Type:', isUndeliverable ? 'UNDELIVERABLE NOTICE' : 'SYSTEM EMAIL');
                            }

                            consoleHelper('Full Email Object:', fullEmail);
                            // Only log full email object if debug mode is enabled
                            if (process.env.DEBUG_WEBHOOKS === 'true') {
                                consoleHelper('🐛 Full Email Object (DEBUG):', JSON.stringify(fullEmail, null, 2));
                            }
                        } else {
                            consoleHelper('❌ Could not fetch email content for message ID:', messageId);
                        }
                    } else {
                        consoleHelper('Could not extract account ID from client state:', clientState);
                    }
                } catch (emailError) {
                    consoleHelper('Error fetching full email:', emailError.message);
                }
            }

            return { success: true };
        } catch (error) {
            consoleHelper('Error processing Outlook notification', { error: error.message, notification });
            throw error;
        }
    }

}
