import { google } from "googleapis";
import { consoleHelper } from "../../consoleHelper.js";
import { EmailController } from './EmailController.js';
import { EmailConfig } from "../models/Email.js";
import { provider_config_map } from "../config/index.js";


// In-memory cache for deduplication
const processedNotifications = new Map();

export class WebhookController {

    static async getGmailClient(emailConfig) {
            if (emailConfig.provider !== "gmail") {
                consoleHelper("Gmail Webhook Error - Invalid provider", emailConfig.provider);
                return null;
            }
    
            const { client_id, client_secret } = provider_config_map?.[emailConfig.provider] || {};
            if (!client_id || !client_secret) {
                consoleHelper("Gmail Webhook Error - Missing client credentials");
                return null;
            }
    
            const oauth2Client = new google.auth.OAuth2(client_id, client_secret);
            oauth2Client.setCredentials({
                access_token: emailConfig.oauth_config?.access_token,
                refresh_token: emailConfig.oauth_config?.refresh_token
            });
    
            return google.gmail({
                version: 'v1',
                auth: oauth2Client
            });
        }

       static async handleGmailWebhook(req, res) {
           try {
               const message = req.body?.message;
               if (!message?.data) {
                   return res.status(400).json({ success: false, error: "Invalid message data" });
               }
   
               // Decode Pub/Sub data
               const decodedData = JSON.parse(
                   Buffer.from(message.data, 'base64').toString('utf-8')
               );
               consoleHelper("WEBHOOK: Gmail webhook received", decodedData);
   
               const { emailAddress, historyId } = decodedData;
               if (!emailAddress || !historyId) {
                   return res.status(400).json({
                       success: false,
                       error: "Invalid message fields (emailAddress or historyId missing)"
                   });
               }
   
               // Find email configuration
               const emailConfig = await EmailConfig.findOne({ email: emailAddress });
               if (!emailConfig || emailConfig.provider !== 'gmail') {
                   return res.status(404).json({
                       success: false,
                       error: "Email config not found or invalid provider"
                   });
               }
   
               const lastHistoryId = emailConfig.metadata?.watch?.history_id;
               
               // If no stored historyId, perform full initial sync
               if (!lastHistoryId) {
                   consoleHelper("WEBHOOK: No stored historyId, performing full initial sync for INBOX and SENT");
                   
                   // Set current historyId as starting point
                   await EmailConfig.updateOne(
                       { email: emailAddress },
                       { 
                           $set: { 
                               'metadata.watch.history_id': historyId,
                               'metadata.watch.last_updated': new Date(),
                               'metadata.watch.initialized': true
                           } 
                       }
                   );
   
                   return res.status(200).json({
                       success: true,
                       message: "Initial historyId set, watching for new emails"
                   });
               }
   
               // Create Gmail client
               const gmail = await WebhookController.getGmailClient(emailConfig);
               if (!gmail) {
                   return res.status(500).json({ success: false, error: "Failed to create Gmail client" });
               }
   
               // Fetch changes since last historyId
               let historyResponse;
               try {
                   historyResponse = await gmail.users.history.list({
                       userId: 'me',
                       startHistoryId: lastHistoryId,
                       historyTypes: ['messageAdded']
                   });
               } catch (error) {
                   // Handle expired/invalid history ID (404 error)
                   if (error.code === 404 || error.status === 404) {
                       consoleHelper(`WEBHOOK: History ID ${lastHistoryId} expired, resetting to current historyId`);
                       
                       // Reset to current historyId from webhook
                       await EmailConfig.updateOne(
                           { email: emailAddress },
                           {
                               $set: {
                                   'metadata.watch.history_id': historyId,
                                   'metadata.watch.last_updated': new Date(),
                                   'metadata.watch.reset_count': (emailConfig.metadata?.watch?.reset_count || 0) + 1
                               }
                           }
                       );
   
                       return res.status(200).json({
                           success: true,
                           message: "HistoryId reset due to expiration"
                       });
                   }
                   throw error;
               }
   
               const historyData = historyResponse.data.history || [];
               const filteredMessages = [];
               
               // Only process messagesAdded events with INBOX or SENT labels
               historyData.forEach(h => {
                   h.messagesAdded?.forEach(m => {
                       const hasInboxOrSent = m.message.labelIds?.some(labelId => 
                           labelId === 'INBOX' || labelId === 'SENT'
                       );
                       if (hasInboxOrSent) {
                           filteredMessages.push({
                               id: m.message.id,
                               labels: m.message.labelIds,
                               threadId: m.message.threadId
                           });
                       }
                   });
               });
   
               consoleHelper(`WEBHOOK: Processing ${filteredMessages.length} new messages in INBOX/SENT`);
   
               // Process each new message
               for (const messageInfo of filteredMessages) {
                   try {
                       const message = await gmail.users.messages.get({
                           userId: 'me',
                           id: messageInfo.id,
                           format: 'full'
                       });
   
                       const labelType = messageInfo.labels.includes('INBOX') ? 'INBOX' : 'SENT';
                       const snippet = message.data.snippet?.substring(0, 100) || 'No snippet';
                       
                       consoleHelper(`WEBHOOK: New ${labelType} message - ${snippet}`);
   
                       // TODO: Process and store the email in database
   
                   } catch (msgError) {
                       consoleHelper(`WEBHOOK: Error processing message ${messageInfo.id}:`, msgError.message);
                   }
               }
   
               // Update historyId only after successful processing of all events
               if (historyResponse.data.historyId) {
                   await EmailConfig.updateOne(
                       { email: emailAddress },
                       {
                           $set: {
                               'metadata.watch.history_id': historyResponse.data.historyId,
                               'metadata.watch.last_updated': new Date(),
                               'metadata.watch.processed_count': (emailConfig.metadata?.watch?.processed_count || 0) + filteredMessages.length
                           }
                       }
                   );
                   consoleHelper(`WEBHOOK: Updated historyId to ${historyResponse.data.historyId}`);
               }
   
               return res.status(200).json({
                   success: true,
                   processedMessages: filteredMessages.length,
                   lastHistoryId: historyResponse.data.historyId
               });
   
           } catch (error) {
               consoleHelper("WEBHOOK: Gmail processing error:", error.message);
               return res.status(500).json({
                   success: false,
                   error: error.message,
                   timestamp: new Date().toISOString()
               });
           }
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
