import { google } from "googleapis";
import { consoleHelper } from "../../consoleHelper.js";
import { EmailController } from "./EmailController.js";
import { EmailConfig } from "../models/Email.js";
import { provider_config_map } from "../config/index.js";
import { logger } from "../config/logger.js";
import { payloadService } from "../services/payload.js";
import { emailProcesses } from "./EmailProcesses.js";

// In-memory cache for deduplication
const processedNotifications = new Map();
const processedGmailMessages = new Map();

export class WebhookController {

    static async processEmailMessage(emailMessage, emailConfig, provider) {
        const accessToken = await payloadService.generateAdminToken();
        try {
            let emailConfigId;
            if (!emailMessage) {
                logger.warn('Email message is null or undefined');
                return;
            }

            // Create unique processing key for this specific email
            const emailProcessingKey = `${provider}_${emailMessage.id || emailMessage.messageId}_${emailConfigId || emailConfig?._id}`;
            const now = Date.now();

            // Check if this email was already processed recently (last 5 minutes)
            const existingProcess = processedNotifications.get(emailProcessingKey);
            if (existingProcess && now - existingProcess < 5 * 60 * 1000) {
                logger.info('Skipping duplicate email processing', {
                    messageId: emailMessage.id || emailMessage.messageId,
                    provider,
                    timeSinceLastProcess: `${Math.round((now - existingProcess) / 1000)}s ago`
                });
                return;
            }

            // Mark as being processed
            processedNotifications.set(emailProcessingKey, now);

            let direction;
            // Determine if email is sent or received
            if (provider === 'outlook') {
                emailConfigId = emailConfig?.clientState?.split('_')[1];
                const type = emailConfig?.clientState?.split('_')[2];
                direction = type === 'outgoing' ? 'SENT' : 'RECEIVED';
            } else {
                emailConfigId = emailConfig?._id;
                const isSentEmail = WebhookController.isEmailSent(emailMessage, emailConfig);
                direction = isSentEmail ? 'SENT' : 'RECEIVED';
            }

            // Log email processing information
            logger.info('Processing email message');
            console.log({
                ...emailMessage,
                direction,
                emailConfig
            })

            const isneverLogged = await emailProcesses.handleIsEmailNeverLogged(accessToken, emailMessage, emailConfigId);
            if (isneverLogged) {
                consoleHelper('Email is Blocked');
                return;
            }

            consoleHelper("Email is logged");

            const contactFrom = await emailProcesses.handleCreateContact(accessToken, emailMessage?.from?.address, emailMessage?.from?.name);
            const contactTo = await emailProcesses.handleCreateContact(accessToken, emailMessage?.to?.[0]?.address, emailMessage?.to?.[0]?.name);
            const activity = await emailProcesses.handleCreateActivity(accessToken, emailMessage, [contactFrom, contactTo], direction, emailConfigId);

        } catch (error) {
            logger.error('Error processing email message', {
                error: error.message,
                stack: error.stack,
                messageId: emailMessage?.id || emailMessage?.messageId,
                accountId: emailConfig?._id
            });
        }
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
            consoleHelper(
                "Gmail Webhook Error - Invalid provider",
                emailConfig.provider
            );
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
            consoleHelper("WEBHOOK: Gmail webhook received", decodedData);

            const { emailAddress, historyId } = decodedData;
            if (!emailAddress || !historyId) {
                return res.status(400).json({
                    success: false,
                    error: "Invalid message fields (emailAddress or historyId missing)",
                });
            }

            // Find email configuration
            const emailConfig = await EmailConfig.findOne({ email: emailAddress });
            if (!emailConfig || emailConfig.provider !== "gmail") {
                return res.status(404).json({
                    success: false,
                    error: "Email config not found or invalid provider",
                });
            }

            const lastHistoryId = emailConfig.metadata?.watch?.history_id;

            // If no stored historyId, perform full initial sync
            if (!lastHistoryId) {
                consoleHelper(
                    "WEBHOOK: No stored historyId, performing full initial sync for INBOX and SENT"
                );

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
                    consoleHelper(
                        `WEBHOOK: History ID ${lastHistoryId} expired, resetting to current historyId`
                    );

                    // Reset to current historyId from webhook
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

            consoleHelper(
                `WEBHOOK: Processing ${filteredMessages.length} new messages in INBOX/SENT`
            );

            // Process each new message
            for (const messageInfo of filteredMessages) {
                try {
                    // Check for duplicates using messageId, historyId, and email address
                    if (WebhookController.isGmailMessageProcessed(
                        messageInfo.id,
                        historyId,
                        emailAddress
                    )) {
                        continue; // Skip this duplicate message
                    }

                    const emailService = EmailController.emailService;
                    const fullEmail = await emailService.getEmail(
                        emailConfig?._id,
                        messageInfo.id,
                        null, // folder not needed for direct message ID lookup
                        null // userId not needed for this operation
                    );

                    // Process the email message
                    if (fullEmail) {
                        await WebhookController.processEmailMessage(
                            fullEmail,
                            emailConfig,
                            "gmail"
                        );
                    }
                } catch (msgError) {
                    consoleHelper(
                        `WEBHOOK: Error processing message ${messageInfo.id}:`,
                        msgError.message
                    );
                }
            }

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
                consoleHelper(
                    `WEBHOOK: Updated historyId to ${historyResponse.data.historyId}`
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
                    const etag = notification.resourceData?.["@odata.etag"];
                    const notificationId = `${subscriptionId}_${messageId}_${changeType}_${etag}`;

                    // Check if we already processed this notification recently (last 5 minutes)
                    const now = Date.now();
                    const existing = processedNotifications.get(notificationId);
                    if (existing && now - existing < 5 * 60 * 1000) {
                        consoleHelper(
                            "Skipping duplicate notification (already processed):",
                            {
                                notificationId: notificationId.substring(0, 50) + "...",
                                timeSinceLastProcess: `${Math.round(
                                    (now - existing) / 1000
                                )}s ago`,
                            }
                        );
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

                    consoleHelper("Processing notification:", {
                        subscriptionId: notification.subscriptionId,
                        changeType: notification.changeType,
                        resource: notification.resource,
                        resourceData: notification.resourceData?.id,
                        notificationId,
                    });

                    // Extract message ID from the notification
                    if (messageId) {
                        // Fetch full email details and process notification
                        await WebhookController.processOutlookNotification(notification);
                    }
                } catch (error) {
                    consoleHelper("Failed to process notification", {
                        error: error.message,
                        notification: notification,
                    });
                }
            }

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

    static async processOutlookNotification(notification) {
        try {
            const { resourceData, clientState } = notification;
            const messageId = resourceData?.id;
            consoleHelper("Client State:", clientState);

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

                            // Determine if this looks like a special email type
                            const isUndeliverable = fullEmail.subject
                                ?.toLowerCase()
                                .includes("undeliverable");
                            const isAutoReply =
                                fullEmail.from?.address?.includes("noreply") ||
                                fullEmail.from?.address?.includes("MicrosoftExchange");
                            const isSystemEmail = isUndeliverable || isAutoReply;

                            if (isSystemEmail) {
                                consoleHelper(
                                    "⚠️  Email Type:",
                                    isUndeliverable ? "UNDELIVERABLE NOTICE" : "SYSTEM EMAIL"
                                );
                            }

                            consoleHelper("Full Email Object:", fullEmail);
                            // Only log full email object if debug mode is enabled
                            if (process.env.DEBUG_WEBHOOKS === "true") {
                                consoleHelper(
                                    "🐛 Full Email Object (DEBUG):",
                                    JSON.stringify(fullEmail, null, 2)
                                );
                            }
                        } else {
                            consoleHelper(
                                "❌ Could not fetch email content for message ID:",
                                messageId
                            );
                        }
                    } else {
                        consoleHelper(
                            "Could not extract account ID from client state:",
                            clientState
                        );
                    }
                } catch (emailError) {
                    consoleHelper("Error fetching full email:", emailError.message);
                }
            }

            return { success: true };
        } catch (error) {
            consoleHelper("Error processing Outlook notification", {
                error: error.message,
                notification,
            });
            throw error;
        }
    }

    static async handleCreateContact(emailAddress) {
        try {
            const contact = {
                email: emailAddress,
                name: emailAddress,
                type: "contact",
            };
            const response = await payloadService.create(accessToken, "contacts", contact);
            return response;
        } catch (error) {
            console.error("Error creating contact:", error);
            throw error;
        }
    }

    static isGmailMessageProcessed(messageId, historyId, emailAddress) {
        const gmailMessageKey = `${emailAddress}_${messageId}_${historyId}`;
        const now = Date.now();
        const existing = processedGmailMessages.get(gmailMessageKey);

        // Check if message was processed in last 10 minutes
        if (existing && now - existing < 10 * 60 * 1000) {
            logger.info('Skipping duplicate Gmail message', {
                messageId,
                historyId,
                emailAddress: emailAddress.substring(0, 20) + '...',
                timeSinceLastProcess: `${Math.round((now - existing) / 1000)}s ago`
            });
            return true;
        }

        // Mark as processed
        processedGmailMessages.set(gmailMessageKey, now);

        // Clean up old entries (older than 15 minutes)
        for (const [key, timestamp] of processedGmailMessages.entries()) {
            if (now - timestamp > 15 * 60 * 1000) {
                processedGmailMessages.delete(key);
            }
        }
        return false;
    }

}
