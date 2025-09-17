import { google } from "googleapis";
import { consoleHelper } from "../../consoleHelper.js";
import { EmailController } from "./EmailController.js";
import { EmailConfig } from "../models/Email.js";
import { provider_config_map } from "../config/index.js";
import { logger } from "../config/logger.js";
import { payloadService } from "../services/payload.js";
import { emailProcesses } from "./EmailProcesses.js";
import { DeduplicationManager } from "../helpers/DeduplicationManager.js";

// Singleton instance for deduplication
const deduplicationManager = new DeduplicationManager();

export class WebhookController {

    static async processEmailMessage(emailMessage, emailConfig, provider) {
        const accessToken = await payloadService.generateAdminToken();
        try {
            let emailConfigId;
            if (!emailMessage) {
                logger.warn('Email message is null or undefined');
                return;
            }
            const emailProcessingKey = `${provider}_${emailMessage.id || emailMessage.messageId}_${emailConfigId || emailConfig?._id}`;

            // Check for duplicate processing
            if (deduplicationManager.isProcessed(emailProcessingKey)) {
                logger.info('Skipping duplicate email processing', {
                    messageId: emailMessage.id || emailMessage.messageId,
                    provider
                });
                return;
            }

            // Mark as being processed
            deduplicationManager.markProcessed(emailProcessingKey);

            // Determine email direction and configuration ID
            const { direction, configId } = WebhookController.determineEmailDirection(
                emailMessage,
                emailConfig,
                provider
            );
            emailConfigId = configId;
            emailConfig.direction = direction;

            // Check if email should be processed
            if (await WebhookController.shouldSkipEmail(accessToken, emailMessage, emailConfigId)) {
                return;
            }

            // Process email and create activity
            await WebhookController.processEmailAndCreateActivity(
                accessToken,
                emailMessage,
                emailConfig,
                direction
            );

        } catch (error) {
            logger.error('Error processing email message', {
                error: error.message,
                stack: error.stack,
                messageId: emailMessage?.id || emailMessage?.messageId,
                accountId: emailConfig?._id
            });
        }
    }

    static determineEmailDirection(emailMessage, emailConfig, provider) {
        if (provider === 'outlook') {
            const configId = emailConfig?.clientState?.split('_')[1];
            const type = emailConfig?.clientState?.split('_')[2];
            const direction = type === 'outgoing' ? 'SENT' : 'RECEIVED';
            return { direction, configId };
        } else {
            const configId = emailConfig?._id;
            const isSentEmail = WebhookController.isEmailSent(emailMessage, emailConfig);
            const direction = isSentEmail ? 'SENT' : 'RECEIVED';
            return { direction, configId };
        }
    }

    static async shouldSkipEmail(accessToken, emailMessage, emailConfigId) {
        const isNeverLogged = await emailProcesses.handleIsEmailNeverLogged({
            payloadToken: accessToken,
            emailMessage,
            emailConfigId
        });

        if (isNeverLogged) {
            consoleHelper('Email is Blocked');
            return true;
        }
        return false;
    }

    static async processEmailAndCreateActivity(accessToken, emailMessage, emailConfig, direction) {
        // Create contacts
        const [contactFrom, contactTo] = await Promise.all([
            emailProcesses.handleCreateContact({
                payloadToken: accessToken,
                contactEmailAddress: emailMessage?.from?.address,
                contactName: emailMessage?.from?.name,
                emailMessage,
                emailConfig,
            }),
            emailProcesses.handleCreateContact({
                payloadToken: accessToken,
                contactEmailAddress: emailMessage?.to?.[0]?.address,
                contactName: emailMessage?.to?.[0]?.name,
                emailMessage,
                emailConfig,
            })
        ]);

        // Create activity
        const createdActivity = await emailProcesses.handleCreateActivity({
            payloadToken: accessToken,
            emailMessage,
            associatedContacts: [contactFrom, contactTo],
            direction,
            emailConfig
        });

        consoleHelper("Activity Created", createdActivity);
    }

    static isEmailSent(emailMessage, emailConfig) {
        try {
            // Method 1: Check labels (Gmail)
            if (emailMessage.labels) {
                const hasSentLabel = emailMessage.labels.some((label) =>
                    typeof label === "string"
                        ? label.toUpperCase().includes("SENT")
                        : label.id?.toUpperCase().includes("SENT") ||
                        label.name?.toUpperCase().includes("SENT")
                );
                if (hasSentLabel) return true;
            }

            // Method 2: Check labelIds (Gmail)
            if (emailMessage.labelIds) {
                const hasSentLabelId = emailMessage.labelIds.some(
                    (labelId) =>
                        labelId === "SENT" || labelId.toUpperCase().includes("SENT")
                );
                if (hasSentLabelId) return true;
            }

            // Method 3: Compare sender email with account email
            if (emailConfig?.email && emailMessage.from) {
                const fromAddress = emailMessage.from.address || emailMessage.from;
                const accountEmail = emailConfig.email;

                // Normalize email addresses for comparison
                const normalizedFrom = fromAddress?.toLowerCase().trim();
                const normalizedAccount = accountEmail?.toLowerCase().trim();

                if (normalizedFrom === normalizedAccount) {
                    return true;
                }
            }

            // Method 4: Check folder/folderId (if available)
            if (emailMessage.folderId) {
                const sentFolders = ["SENT", "SENTITEMS", "SENT ITEMS", "OUTBOX"];
                const folderUpper = emailMessage.folderId.toUpperCase();
                if (sentFolders.includes(folderUpper)) {
                    return true;
                }
            }

            // Default to received if no sent indicators found
            return false;
        } catch (error) {
            logger.error("Error determining email direction", {
                error: error.message,
                messageId: emailMessage?.id || emailMessage?.messageId,
            });
            return false; // Default to received on error
        }
    }

    static async getGmailClient(emailConfig) {
        if (emailConfig.provider !== "gmail") {
            return null;
        }

        const { client_id, client_secret } =
            provider_config_map?.[emailConfig.provider] || {};
        if (!client_id || !client_secret) {
            consoleHelper("Gmail Webhook Error - Missing client credentials");
            return null;
        }

        const oauth2Client = new google.auth.OAuth2(client_id, client_secret);
        oauth2Client.setCredentials({
            access_token: emailConfig.oauth_config?.access_token,
            refresh_token: emailConfig.oauth_config?.refresh_token,
        });

        return google.gmail({
            version: "v1",
            auth: oauth2Client,
        });
    }

    static async handleGmailWebhook(req, res) {
        try {
            const message = req.body?.message;
            if (!message?.data) {
                return res
                    .status(400)
                    .json({ success: false, error: "Invalid message data" });
            }

            // Decode Pub/Sub data
            const decodedData = JSON.parse(
                Buffer.from(message.data, "base64").toString("utf-8")
            );

            const { emailAddress, historyId } = decodedData;
            if (!emailAddress || !historyId) {
                return res.status(400).json({
                    success: false,
                    error: "Invalid message fields (emailAddress or historyId missing)",
                });
            }

            // Find and validate email configuration
            const emailConfig = await WebhookController.findAndValidateEmailConfig(emailAddress, 'gmail');
            if (!emailConfig) {
                return res.status(404).json({
                    success: false,
                    error: "Email config not found or invalid provider",
                });
            }

            const lastHistoryId = emailConfig.metadata?.watch?.history_id;

            // If no stored historyId, perform full initial sync
            if (!lastHistoryId) {
                // Set current historyId as starting point
                await EmailConfig.updateOne(
                    { email: emailAddress },
                    {
                        $set: {
                            "metadata.watch.history_id": historyId,
                            "metadata.watch.last_updated": new Date(),
                            "metadata.watch.initialized": true,
                        },
                    }
                );

                return res.status(200).json({
                    success: true,
                    message: "Initial historyId set, watching for new emails",
                });
            }

            // Create Gmail client
            const gmail = await WebhookController.getGmailClient(emailConfig);
            if (!gmail) {
                return res
                    .status(500)
                    .json({ success: false, error: "Failed to create Gmail client" });
            }

            // Fetch changes since last historyId
            let historyResponse;
            try {
                historyResponse = await gmail.users.history.list({
                    userId: "me",
                    startHistoryId: lastHistoryId,
                    historyTypes: ["messageAdded"],
                });
            } catch (error) {
                // Handle expired/invalid history ID (404 error)
                if (error.code === 404 || error.status === 404) {
                    await EmailConfig.updateOne(
                        { email: emailAddress },
                        {
                            $set: {
                                "metadata.watch.history_id": historyId,
                                "metadata.watch.last_updated": new Date(),
                                "metadata.watch.reset_count":
                                    (emailConfig.metadata?.watch?.reset_count || 0) + 1,
                            },
                        }
                    );

                    return res.status(200).json({
                        success: true,
                        message: "HistoryId reset due to expiration",
                    });
                }
                throw error;
            }

            const historyData = historyResponse.data.history || [];
            const filteredMessages = [];

            // Only process messagesAdded events with INBOX or SENT labels
            historyData.forEach((h) => {
                h.messagesAdded?.forEach((m) => {
                    const hasInboxOrSent = m.message.labelIds?.some(
                        (labelId) => labelId === "INBOX" || labelId === "SENT"
                    );
                    if (hasInboxOrSent) {
                        filteredMessages.push({
                            id: m.message.id,
                            labels: m.message.labelIds,
                            threadId: m.message.threadId,
                        });
                    }
                });
            });

            // Process each new message
            await WebhookController.processGmailMessages(
                filteredMessages,
                historyId,
                emailAddress,
                emailConfig
            );

            // Update historyId only after successful processing of all events
            if (historyResponse.data.historyId) {
                await EmailConfig.updateOne(
                    { email: emailAddress },
                    {
                        $set: {
                            "metadata.watch.history_id": historyResponse.data.historyId,
                            "metadata.watch.last_updated": new Date(),
                            "metadata.watch.processed_count":
                                (emailConfig.metadata?.watch?.processed_count || 0) +
                                filteredMessages.length,
                        },
                    }
                );
            }

            return res.status(200).json({
                success: true,
                processedMessages: filteredMessages.length,
                lastHistoryId: historyResponse.data.historyId,
            });
        } catch (error) {
            consoleHelper("WEBHOOK: Gmail processing error:", error.message);
            return res.status(500).json({
                success: false,
                error: error.message,
                timestamp: new Date().toISOString(),
            });
        }
    }

    static async findAndValidateEmailConfig(emailAddress, provider) {
        const emailConfig = await EmailConfig.findOne({ email: emailAddress });
        if (!emailConfig || emailConfig.provider !== provider) {
            return null;
        }
        return emailConfig;
    }

    static async processGmailMessages(messages, historyId, emailAddress, emailConfig) {
        for (const messageInfo of messages) {
            try {
                // Check for duplicates
                if (deduplicationManager.isGmailMessageProcessed(
                    messageInfo.id,
                    historyId,
                    emailAddress
                )) {
                    continue;
                }

                // Fetch and process email
                const emailService = EmailController.emailService;
                const fullEmail = await emailService.getEmail(
                    emailConfig?._id,
                    messageInfo.id,
                    null,
                    null
                );

                if (fullEmail) {
                    await WebhookController.processEmailMessage(
                        fullEmail,
                        emailConfig,
                        "gmail"
                    );
                }
            } catch (msgError) {
                logger.error(`WEBHOOK: Error processing Gmail message ${messageInfo.id}`, {
                    error: msgError.message,
                    messageId: messageInfo.id,
                    emailAddress
                });
            }
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
            await WebhookController.processOutlookNotifications(notifications);

            res.status(200).json({ success: true });
        } catch (error) {
            consoleHelper("Failed to handle Outlook notification", {
                error: error.message,
                stack: error.stack,
            });
            res.status(500).json({
                success: false,
                error: {
                    code: "NOTIFICATION_HANDLER_ERROR",
                    message: "Failed to process notification",
                    timestamp: new Date(),
                },
            });
        }
    }

    static async processOutlookNotifications(notifications) {
        for (const notification of notifications) {
            try {
                const messageId = notification.resourceData?.id;
                const changeType = notification.changeType;
                const subscriptionId = notification.subscriptionId;

                // Create unique notification ID for deduplication
                const etag = notification.resourceData?.["@odata.etag"];
                const notificationId = `${subscriptionId}_${messageId}_${changeType}_${etag}`;

                // Check for duplicates
                if (deduplicationManager.isProcessed(notificationId)) {
                    continue;
                }

                // Mark as processed
                deduplicationManager.markProcessed(notificationId);

                // Process notification if valid
                if (messageId) {
                    await WebhookController.processOutlookNotification(notification);
                }
            } catch (error) {
                logger.error("Failed to process Outlook notification", {
                    error: error.message,
                    notification: notification,
                });
            }
        }
    }

    static async processOutlookNotification(notification) {
        try {
            const { resourceData, clientState } = notification;
            const messageId = resourceData?.id;
            
            if (messageId) {
                try {
                    // Extract account ID from client state (format: outlook_accountId_timestamp)
                    const accountId = clientState?.split("_")[1];

                    if (accountId) {
                        // Get the email details using our existing service
                        const emailService = EmailController.emailService;
                        const fullEmail = await emailService.getEmail(
                            accountId,
                            messageId,
                            null, // folder not needed for direct message ID lookup
                            null // userId not needed for this operation
                        );

                        if (fullEmail) {

                            await WebhookController.processEmailMessage(fullEmail, { clientState }, 'outlook');

                            // Log special email types and debug info
                            WebhookController.logEmailTypeInfo(fullEmail);
                        } else {
                            consoleHelper("❌ Could not fetch email content for message ID:", messageId);
                        }
                    } else {
                        consoleHelper("Could not extract account ID from client state:", clientState);
                    }
                } catch (emailError) {
                    consoleHelper("Error fetching full email:", emailError.message);
                }
            }

            return { success: true };
        } catch (error) {
            consoleHelper("Error processing Outlook notification", error.message);
            throw error;
        }
    }

    static logEmailTypeInfo(fullEmail) {
        const isUndeliverable = fullEmail.subject
            ?.toLowerCase()
            .includes("undeliverable");
        const isAutoReply =
            fullEmail.from?.address?.includes("noreply") ||
            fullEmail.from?.address?.includes("MicrosoftExchange");
        const isSystemEmail = isUndeliverable || isAutoReply;

        if (isSystemEmail) {
            logger.info("Special email type detected", {
                type: isUndeliverable ? "UNDELIVERABLE NOTICE" : "SYSTEM EMAIL",
                subject: fullEmail.subject,
                from: fullEmail.from?.address
            });
        }

        // Debug logging
        if (process.env.DEBUG_WEBHOOKS === "true") {
            logger.debug("Full Email Object (DEBUG)", { email: fullEmail });
        }
    }
}
