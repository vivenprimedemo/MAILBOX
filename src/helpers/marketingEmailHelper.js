import { commonService } from "../services/commonService.js";
import { payloadService } from "../services/payload.js";
import { EmailService } from "../services/EmailService.js";
import { EmailConfig } from "../models/Email.js";
import logger from "../utils/logger.js";
import fs from "fs/promises";
import path from "path";
import { config } from "../config/index.js";
import { UAParser } from "ua-parser-js";

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

export const getCampaignById = async (payloadToken, campaignId) => {
    try {
        return await payloadService.find(payloadToken, 'campaigns', {
            queryParams: [`where[id][equals]=${campaignId}`],
            depth: 0,
            returnSingle: true
        });
    } catch (error) {
        logger.error('Error fetching campaign', { error: error.message, campaignId });
        return null;
    }
}


export const sendMarketingEmail = async (marketingEmail, contact, campaign, emailAccountId, payloadToken) => {
    try {
        const personalizedHtml = personalizeHtml(
            marketingEmail.email_body_html,
            marketingEmail.preview_text,
            contact
        );

        const htmlWithTracking = insertTrackingParams(
            personalizedHtml,
            marketingEmail,
            contact._id,
            campaign
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

        // Record SENT event in tracking database
        if (result.success && payloadToken) {
            await createTrackingEvent(payloadToken, 'SENT', {
                marketingEmailId: marketingEmail.id,
                contactId: contact._id,
                campaignId: campaign?.id,
                companyId: contact.company || null,
                senderEmail: marketingEmail.from_email,
                emailSubject: marketingEmail.subject,
                messageId: result.data?.messageId || result.data?.id || null,
                utmParams: {
                    utm_source: 'marketing_email',
                    utm_medium: 'email',
                    utm_campaign: campaign?.name || null
                }
            });
        }

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


export const insertTrackingParams = (html, marketingEmail, contactId, campaign) => {

    const trackingParams = {
        meid: marketingEmail.id,
        cid: contactId,
        campaign: campaign.id,
        utm_source: 'marketing_email',
        email_subject: marketingEmail.subject
    };

    // Convert the object to a query string
    const queryString = new URLSearchParams(trackingParams).toString();

    // Replace all anchor tags with tracking URLs
    const trackedHtml = replaceAnchorsWithTracking(html, queryString);

    // Append tracking pixel at the end of the email body
    return insertTrackingPixel(trackedHtml, queryString);
}


const insertTrackingPixel = (html, queryString) => {
    const trackingPixelUrl = `${config.APP_BASE_URL}/api/marketing-email/tracking/open?${queryString}`;
    const trackingPixel = `<img src="${trackingPixelUrl}" style="display:none; width:1px; height:1px;" alt="" />`;
    return html + trackingPixel;
}


const replaceAnchorsWithTracking = (html, queryString) => {
    // Regex to match anchor tags with href attribute
    const anchorRegex = /<a\s+([^>]*href\s*=\s*["']([^"']+)["'][^>]*)>/gi;

    return html.replace(anchorRegex, (match, attributes, originalUrl) => {
        // Skip if it's a mailto: or tel: link
        if (originalUrl.startsWith('mailto:') || originalUrl.startsWith('tel:') || originalUrl.startsWith('#')) {
            return match;
        }

        const trackingUrl = `${config.APP_BASE_URL}/api/marketing-email/tracking/click?${queryString}&url=${encodeURIComponent(originalUrl)}`;

        // Replace the original href with tracking URL
        const trackedAttributes = attributes.replace(
            /href\s*=\s*["']([^"']+)["']/i,
            `href="${trackingUrl}"`
        );

        return `<a ${trackedAttributes}>`;
    });
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


export const extractRequestMetadata = (req) => {
    if (!req) return {};
    const userAgent = req.headers['user-agent'] || '';
    const parser = new UAParser(userAgent);
    const result = parser.getResult();
    const ipAddress = req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
                      req.headers['x-real-ip'] ||
                      req.socket?.remoteAddress ||
                      req.ip ||
                      'unknown';
    return {
        ipAddress: ipAddress,
        userAgent,
        browser: result.browser?.name || 'unknown',
        operatingSystem: result.os?.name || 'unknown',
        deviceType: determineDeviceType(result.device?.type),
        referrer: req.headers['referer'] || req.headers['referrer'] || 'unknown'
    };
};


const determineDeviceType = (deviceType) => {
    if (!deviceType) return 'desktop';

    const type = deviceType.toLowerCase();
    if (type.includes('mobile') || type.includes('phone')) return 'mobile';
    if (type.includes('tablet')) return 'tablet';
    return 'desktop';
};


export const createTrackingEvent = async (payloadToken, eventType, data) => {
    try {
        const {
            marketingEmailId,
            contactId,
            campaignId,
            companyId,
            senderEmail,
            emailSubject,
            messageId,
            clickedUrl,
            metadata = {},
            utmParams = {}
        } = data;

        // Build tracking event payload
        const trackingPayload = {
            event_type: eventType,
            marketing_email_id: marketingEmailId,
            contact: contactId,
            campaign: campaignId,
            company: companyId,
            sender_email: senderEmail,
            email_subject: emailSubject,
            message_id: messageId || null,
            utm_source: utmParams.utm_source || 'marketing_email',
            utm_medium: utmParams.utm_medium || null,
            utm_campaign: utmParams.utm_campaign || null,
            utm_content: utmParams.utm_content || null,
            utm_term: utmParams.utm_term || null,
            metadata: {
                ipAddress: metadata.ipAddress || null,
                userAgent: metadata.userAgent || null,
                browser: metadata.browser || null,
                operatingSystem: metadata.operatingSystem || null,
                deviceType: metadata.deviceType || 'unknown',
                referrer: metadata.referrer || null,
                clickedUrl: clickedUrl || null,
                country: metadata.country || null,
                city: metadata.city || null,
                geoLocation: metadata.geoLocation || null,
                bounceReason: metadata.bounceReason || null
            }
        };

        console.log("Tracking payload", trackingPayload)

        // Create tracking event in database
        const result = await payloadService.create(payloadToken, 'tracking_emails', trackingPayload);

        if (result.statusCode === 200) {
            logger.info('Tracking event created', {
                eventType,
                marketingEmailId,
                contactId,
                trackingEventId: result.itemId
            });
            return { success: true, trackingEventId: result.itemId };
        } else {
            logger.error('Failed to create tracking event', {
                eventType,
                marketingEmailId,
                contactId,
                error: result.message
            });
            return { success: false, error: result.message };
        }
    } catch (error) {
        logger.error('Error creating tracking event', {
            error: error.message,
            eventType,
            stack: error.stack
        });
        return { success: false, error: error.message };
    }
};

export const handleMarketingEmailError = (error, marketingEmailId, logger) => {
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

    return {
        statusCode,
        body: {
            success: false,
            error: {
                code: errorCode,
                message: error.message || 'Failed to send marketing email'
            }
        }
    };
}