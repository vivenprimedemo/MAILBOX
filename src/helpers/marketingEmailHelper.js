import { commonService } from "../services/commonService.js";
import { payloadService } from "../services/payload.js";
import { EmailService } from "../services/EmailService.js";
import { EmailConfig } from "../models/Email.js";
import logger from "../utils/logger.js";
import fs from "fs/promises";
import path from "path";

const emailService = new EmailService();

export const getMarketingEmailById = async (payloadToken, marketingEmailId) => {
    try {
        return await payloadService.find(payloadToken, 'marketing_emails', {
            queryParams: [`where[id][equals]=${marketingEmailId}`],
            depth: 0,
            returnSingle: true
        });
    } catch (error) {
        logger.error('Error fetching marketing email', { error: error.message, marketingEmailId });
        throw error;
    }
}


export const getEmailAccount = async (fromEmail) => {
    try {
        const emailConfig = await EmailConfig.findOne({
            email: fromEmail,
            is_active: { $ne: false }
        });

        if (!emailConfig) {
            throw new Error(`No active email account found for ${fromEmail}`);
        }

        return emailConfig;
    } catch (error) {
        logger.error('Error fetching email account', { error: error.message, fromEmail });
        throw error;
    }
}


export const getRecipients = async (payloadToken, marketingEmail) => {
    const recipientType = marketingEmail.recipient_type;
    const contactRecipient = [];
    let contactIds = [];

    if(recipientType === 'segments'){
        const segmentIds = marketingEmail?.segments;
        const segments = await commonService.fetch({
            payloadToken,
            collection: 'segments',
            condition: { _id: { $in: segmentIds } },
            fields: ['contacts']
        });
        contactIds = segments?.data?.map((segment) => segment.contacts).flat();
    } else {
        contactIds = marketingEmail?.contacts;
    }

    contactRecipient.push(...contactIds);
    const contactsRes = await commonService.fetch({
        payloadToken,
        collection: 'contacts',
        condition: { _id: { $in: contactIds } },
        fields: ['email', 'first_name', 'last_name', 'name']
    });

    return contactsRes?.data;
}


export const sendMarketingEmail = async (marketingEmail, contact, emailAccountId) => {
    try {
        const personalizedHtml = personalizeHtml(
            marketingEmail.email_body_html,
            marketingEmail.preview_text,
            contact
        );

        const htmlWithTracking = insertTrackingParams(
            personalizedHtml,
            marketingEmail,
            contact._id
        );

        // Send email using EmailService
        const sendRequest = {
            to: [{ address: contact.email, name: contact.name || contact.email }],
            subject: marketingEmail.subject,
            bodyHtml: htmlWithTracking,
            from: {
                address: marketingEmail.from_email,
                name: marketingEmail.from_name || ""
            },
            replyTo: marketingEmail.reply_to ? [{ address: marketingEmail.reply_to }] : undefined,
        };

        const result = await emailService.sendEmail(emailAccountId, sendRequest);

        return {
            success: true,
            contactId: contact._id,
            contactEmail: contact.email,
            result
        };
    } catch (error) {
        logger.error('Error sending marketing email', {
            error: error.message,
            contactId: contact._id,
            marketingEmailId: marketingEmail.id
        });

        return {
            success: false,
            contactId: contact._id,
            contactEmail: contact.email,
            error: error.message
        };
    }
}


export const personalizeHtml = (html, previewText, contact) => {
    const flatData = flattenContactData(contact);

    // Correctly assign the replaced HTML
    html = html.replace(/\{contact_(\w+)\}/g, (match, token) => {
        return flatData[token] != null ? flatData[token] : '';
    });

    // Add invisible preview text
    const invisiblePreviewTag = `<div style="display:none; max-height:0px; overflow:hidden; font-size:0; line-height:0; color:#ffffff; opacity:0;">${previewText || ''}</div>`;
    return invisiblePreviewTag + html;
}


function flattenContactData(obj, res = {}) {
    for (const key in obj) {
        const val = obj[key];

        if (Array.isArray(val)) {
            // Handle array by iterating objects inside
            val.forEach(item => {
                if (typeof item === 'object' && item !== null) {
                    flattenContactData(item, res);
                }
            });
        } else if (typeof val === 'object' && val !== null) {
            flattenContactData(val, res);
        } else {
            res[key] = val;
        }
    }
    return res;
}

export const insertTrackingParams = (html, marketingEmail, contactId) => {
    // TODO: implement logic to insert tracking params for open tracking and click tracking
    // For now, return HTML as-is
    // Future implementation can add tracking pixels and modify links
    return html;
}


export const updateMarketingEmailSummary = async (payloadToken, marketingEmailId, summary) => {
    try {
        const updateData = {
            send_summary: {
                total_sent: summary.totalSent,
                total_failed: summary.totalFailed,
                total_delivered: summary.totalDelivered
            },
            status: summary.totalSent > 0 ? 'sent' : 'draft'
        };

        if (summary.errors && summary.errors.length > 0) {
            updateData.error_log = summary.errors.join('\n');
        }

        await payloadService.update(
            payloadToken,
            'marketing_emails',
            marketingEmailId,
            updateData
        );

        return true;
    } catch (error) {
        logger.error('Error updating marketing email summary', {
            error: error.message,
            marketingEmailId
        });
        return false;
    }
}

export const recordSendResult = async (payloadToken, marketingEmailId, contactId, contactEmail, status, errorDetails = null) => {
    try {
        // Create a send log entry (you may need to create this collection in your system)
        const logData = {
            marketing_email: marketingEmailId,
            contact_id: contactId,
            contact_email: contactEmail,
            status, // 'sent', 'failed', 'delivered', 'bounced', etc.
            error_message: errorDetails?.error || null,
            sent_at: new Date()
        };

        // Optionally log to a separate collection for detailed tracking
        // await payloadService.create(payloadToken, 'marketing_email_logs', logData);

        logger.info('Marketing email send result recorded', {
            marketingEmailId,
            contactId,
            status
        });

        return true;
    } catch (error) {
        logger.error('Error recording send result', {
            error: error.message,
            marketingEmailId,
            contactId
        });
        return false;
    }
}

export const saveSendSummaryToFile = async (marketingEmailId, summaryData) => {
    try {
        // Create logs directory if it doesn't exist
        const logsDir = path.join(process.cwd(), 'logs', 'marketing_emails');
        await fs.mkdir(logsDir, { recursive: true });

        // Create filename with timestamp
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `marketing-email-${marketingEmailId}-${timestamp}.json`;
        const filePath = path.join(logsDir, filename);

        // Prepare summary data
        const summaryJson = {
            marketing_email_id: marketingEmailId,
            timestamp: new Date().toISOString(),
            summary: {
                total_contacts: summaryData.totalContacts || 0,
                total_sent: summaryData.totalSent || 0,
                total_failed: summaryData.totalFailed || 0,
                total_delivered: summaryData.totalDelivered || 0,
                success_rate: summaryData.totalContacts > 0
                    ? ((summaryData.totalSent / summaryData.totalContacts) * 100).toFixed(2) + '%'
                    : '0%'
            },
            email_details: {
                subject: summaryData.subject,
                from_email: summaryData.fromEmail,
                from_name: summaryData.fromName,
                reply_to: summaryData.replyTo,
                scheduled_at: summaryData.scheduledAt,
                sent_at: summaryData.sentAt
            },
            send_results: summaryData.sendResults || [],
            errors: summaryData.errors || [],
            metadata: {
                batch_size: summaryData.batchSize || 10,
                total_batches: summaryData.totalBatches || 0,
                processing_time_seconds: summaryData.processingTime || 0
            }
        };

        // Write to file
        await fs.writeFile(filePath, JSON.stringify(summaryJson, null, 2), 'utf8');

        logger.info('Send summary saved to file', {
            marketingEmailId,
            filePath,
            totalSent: summaryData.totalSent,
            totalFailed: summaryData.totalFailed
        });

        return {
            success: true,
            filePath,
            filename
        };
    } catch (error) {
        logger.error('Error saving send summary to file', {
            error: error.message,
            marketingEmailId,
            stack: error.stack
        });
        return {
            success: false,
            error: error.message
        };
    }
}