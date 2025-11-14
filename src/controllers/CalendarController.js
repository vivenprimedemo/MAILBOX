import logger from '../utils/logger.js';
import { EmailConfig } from '../models/Email.js';
import { GmailCalendarProvider } from '../providers/calendar/GmailCalendarProvider.js';
import { OutlookCalendarProvider } from '../providers/calendar/OutlookCalendarProvider.js';

export class CalendarController {
    /**
     * Get calendar provider instance for an email account
     * @param {string} accountId - Email account ID
     * @returns {Promise<GmailCalendarProvider|OutlookCalendarProvider>}
     */
    static async getCalendarProvider(accountId) {
        const emailConfig = await EmailConfig.findById(accountId);

        if (!emailConfig) {
            throw new Error('Email account not found');
        }

        if (!emailConfig.is_active) {
            throw new Error('Email account is not active');
        }

        if (!emailConfig.is_calendar) {
            throw new Error('Calendar functionality is not enabled for this account');
        }

        // Check if provider supports calendar
        if (emailConfig.provider !== 'gmail' && emailConfig.provider !== 'outlook') {
            throw new Error(`Calendar is not supported for provider: ${emailConfig.provider}`);
        }

        // Create appropriate provider instance
        let provider;
        if (emailConfig.provider === 'gmail') {
            provider = new GmailCalendarProvider(emailConfig);
        } else if (emailConfig.provider === 'outlook') {
            provider = new OutlookCalendarProvider(emailConfig);
        }

        return provider;
    }

    /**
     * Get calendar events
     * GET /api/emails/accounts/:accountId/calendar/events
     */
    static async getEvents(req, res) {
        try {
            const { accountId } = req.params;
            const {
                calendarId,
                startDate,
                endDate,
                limit,
                orderBy,
                search
            } = req.query;

            const provider = await CalendarController.getCalendarProvider(accountId);

            // Build provider-specific options from unified parameters
            let options = {};
            if (provider instanceof GmailCalendarProvider) {
                options = {
                    calendarId: calendarId || 'primary',
                    timeMin: startDate,
                    timeMax: endDate,
                    maxResults: limit ? parseInt(limit) : 100,
                    orderBy: 'startTime', // Gmail only supports startTime/updated
                    singleEvents: true,
                    q: search
                };
            } else if (provider instanceof OutlookCalendarProvider) {
                options = {
                    calendarId,
                    startDateTime: startDate,
                    endDateTime: endDate,
                    top: limit ? parseInt(limit) : 100,
                    orderBy: orderBy || 'start/dateTime',
                    filter: search
                };
            }

            const result = await provider.getEvents(options);

            if (!result.success) {
                return res.status(500).json({
                    success: false,
                    data: null,
                    error: {
                        ...result.error,
                        timestamp: new Date()
                    },
                    metadata: {}
                });
            }

            res.json({
                success: true,
                data: result.data,
                error: null,
                metadata: {
                    ...result.metadata,
                    timestamp: new Date()
                }
            });
        } catch (error) {
            logger.error('Failed to get calendar events', {
                error: error.message,
                stack: error.stack,
                accountId: req.params.accountId,
                userId: req.userId
            });

            res.status(500).json({
                success: false,
                data: null,
                error: {
                    code: 'GET_CALENDAR_EVENTS_ERROR',
                    message: error instanceof Error ? error.message : 'Failed to get calendar events',
                    timestamp: new Date()
                },
                metadata: {}
            });
        }
    }

    /**
     * Create a calendar event
     * POST /api/calendar/accounts/:accountId/events
     *
     * NOTE: Currently disabled - OAuth scopes for creating calendar events are not configured
     */
    static async createEvent(req, res) {
        try {
            const { accountId } = req.params;

            // Return error - calendar event creation scope not configured
            return res.status(403).json({
                success: false,
                data: null,
                error: {
                    code: 'CALENDAR_CREATE_SCOPE_NOT_CONFIGURED',
                    message: 'Calendar event creation is not available. The required OAuth scopes (Calendars.ReadWrite for Outlook, calendar.events for Gmail) are not configured. Please contact your administrator to enable calendar write permissions.',
                    timestamp: new Date()
                },
                metadata: {
                    // requiredScopes: {
                    //     gmail: 'https://www.googleapis.com/auth/calendar.events (write)',
                    //     outlook: 'https://graph.microsoft.com/Calendars.ReadWrite'
                    // },
                    currentlyConfigured: {
                        gmail: 'calendar (read-only), calendar.events (read)',
                        outlook: 'Calendars.Read (read-only)'
                    }
                }
            });

            /* TODO: Uncomment this code once write scopes are added to OAuth configuration

            const eventData = req.body;

            logger.info('Creating calendar event', {
                accountId,
                userId: req.userId,
                eventSummary: eventData.summary || eventData.subject
            });

            const provider = await CalendarController.getCalendarProvider(accountId);

            // Normalize event data based on provider
            let normalizedEventData = { ...eventData };

            if (provider instanceof GmailCalendarProvider) {
                // Google Calendar expects: summary, description, start, end, attendees, location
                // Ensure proper format
                if (!normalizedEventData.summary && normalizedEventData.subject) {
                    normalizedEventData.summary = normalizedEventData.subject;
                }
                if (normalizedEventData.body && typeof normalizedEventData.body === 'object') {
                    normalizedEventData.description = normalizedEventData.body.content || normalizedEventData.body;
                }
            } else if (provider instanceof OutlookCalendarProvider) {
                // Outlook expects: subject, body, start, end, attendees, location
                // Ensure proper format
                if (!normalizedEventData.subject && normalizedEventData.summary) {
                    normalizedEventData.subject = normalizedEventData.summary;
                }
                if (normalizedEventData.description) {
                    normalizedEventData.body = {
                        content: normalizedEventData.description,
                        contentType: 'HTML'
                    };
                }
            }

            const result = await provider.createEvent(normalizedEventData);

            if (!result.success) {
                return res.status(400).json({
                    success: false,
                    data: null,
                    error: {
                        ...result.error,
                        timestamp: new Date()
                    },
                    metadata: {}
                });
            }

            res.status(201).json({
                success: true,
                data: result.data,
                error: null,
                metadata: {
                    ...result.metadata,
                    timestamp: new Date()
                }
            });
            */
        } catch (error) {
            logger.error('Failed to create calendar event', {
                error: error.message,
                stack: error.stack,
                accountId: req.params.accountId,
                userId: req.userId
            });

            res.status(500).json({
                success: false,
                data: null,
                error: {
                    code: 'CREATE_CALENDAR_EVENT_ERROR',
                    message: error instanceof Error ? error.message : 'Failed to create calendar event',
                    timestamp: new Date()
                },
                metadata: {}
            });
        }
    }

    /**
     * Get list of calendars for the account
     * GET /api/emails/accounts/:accountId/calendar/calendars
     */
    static async getCalendars(req, res) {
        try {
            const { accountId } = req.params;

            const provider = await CalendarController.getCalendarProvider(accountId);
            const result = await provider.getCalendars();

            if (!result.success) {
                return res.status(500).json({
                    success: false,
                    data: null,
                    error: {
                        ...result.error,
                        timestamp: new Date()
                    },
                    metadata: {}
                });
            }

            res.json({
                success: true,
                data: result.data,
                error: null,
                metadata: {
                    ...result.metadata,
                    timestamp: new Date()
                }
            });
        } catch (error) {
            logger.error('Failed to get calendars', {
                error: error.message,
                stack: error.stack,
                accountId: req.params.accountId,
                userId: req.userId
            });

            res.status(500).json({
                success: false,
                data: null,
                error: {
                    code: 'GET_CALENDARS_ERROR',
                    message: error instanceof Error ? error.message : 'Failed to get calendars',
                    timestamp: new Date()
                },
                metadata: {}
            });
        }
    }
}
