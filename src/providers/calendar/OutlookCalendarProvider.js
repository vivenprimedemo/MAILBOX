import { ConfidentialClientApplication } from '@azure/msal-node';
import logger from '../../utils/logger.js';
import { config } from '../../config/index.js';
import { AuthService } from '../../services/AuthService.js';

export class OutlookCalendarProvider {
    constructor(emailConfig) {
        this.config = emailConfig;
        this.accessToken = emailConfig.oauth_config?.access_token;
        this.refreshToken = emailConfig.oauth_config?.refresh_token;
        this.accountId = emailConfig._id;
        this.email = emailConfig.email;
        this.initializeMsal();
    }

    /**
     * Initialize MSAL client for token refresh
     */
    initializeMsal() {
        const msalConfig = {
            auth: {
                clientId: config.OUTLOOK_CLIENT_ID,
                authority: 'https://login.microsoftonline.com/common',
                clientSecret: config.OUTLOOK_CLIENT_SECRET
            }
        };
        this.msalInstance = new ConfidentialClientApplication(msalConfig);
    }

    /**
     * Refresh the access token using the refresh token
     */
    async refreshAccessToken() {
        try {
            if (!this.refreshToken) {
                throw new Error('Refresh token missing');
            }

            const tokenRequest = {
                refreshToken: this.refreshToken,
                scopes: config.SCOPES.outlook
            };

            const response = await this.msalInstance.acquireTokenByRefreshToken(tokenRequest);
            this.accessToken = response.accessToken;

            // Update the token in database
            await AuthService.updateEmailAccessToken(this.accountId, this.accessToken);
        } catch (error) {
            logger.error('Failed to refresh Outlook Calendar access token', {
                email: this.email,
                accountId: this.accountId,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Make an authenticated request to Microsoft Graph API
     */
    async makeGraphRequest(url, options = {}) {
        if (!this.accessToken) {
            throw new Error('Not authenticated');
        }

        const fullUrl = url.startsWith('https://') ? url : `https://graph.microsoft.com/v1.0${url}`;

        const response = await fetch(fullUrl, {
            ...options,
            headers: {
                'Authorization': `Bearer ${this.accessToken}`,
                'Content-Type': 'application/json',
                ...options.headers
            }
        }).catch((error) => {
            logger.error('Microsoft Graph API request failed', {
                url: fullUrl,
                email: this.email,
                error: error.message
            });
            throw error;
        });

        // Handle 401 - token expired, refresh and retry
        if (response.status === 401 && this.refreshToken) {
            await this.refreshAccessToken();
            return this.makeGraphRequest(url, options);
        }

        if (!response.ok) {
            const errorText = await response.text();
            const error = new Error(`Microsoft Graph API error: ${response.status} ${response.statusText}`);
            logger.error('Microsoft Graph API request failed', {
                url: fullUrl,
                status: response.status,
                statusText: response.statusText,
                email: this.email,
                errorBody: errorText
            });
            throw error;
        }

        // Handle empty responses
        const contentLength = response.headers.get('content-length');
        if (contentLength === '0' || response.status === 204) {
            return {};
        }

        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
            return response.json();
        }

        return {};
    }

    /**
     * Get events from Outlook Calendar
     * @param {Object} options - Query options
     * @param {string} options.calendarId - Calendar ID (default: uses default calendar)
     * @param {string} options.startDateTime - Start time (ISO format)
     * @param {string} options.endDateTime - End time (ISO format)
     * @param {number} options.top - Maximum number of results (default: 100)
     * @param {string} options.orderBy - Order by field (default: 'start/dateTime')
     * @param {string} options.filter - OData filter query
     * @returns {Promise<Object>} Events response
     */
    async getEvents(options = {}) {
        try {
            const {
                calendarId,
                startDateTime,
                endDateTime,
                top = 100,
                orderBy = 'start/dateTime',
                filter
            } = options;

            // Build the API endpoint
            let endpoint = calendarId
                ? `/me/calendars/${calendarId}/events`
                : '/me/calendar/events';

            // Build query parameters
            const params = new URLSearchParams({
                $top: top.toString(),
                $orderby: orderBy
            });

            // Add filter for date range if provided
            const filters = [];
            if (startDateTime) {
                filters.push(`start/dateTime ge '${startDateTime}'`);
            }
            if (endDateTime) {
                filters.push(`end/dateTime le '${endDateTime}'`);
            }
            if (filter) {
                filters.push(filter);
            }
            if (filters.length > 0) {
                params.append('$filter', filters.join(' and '));
            }

            const url = `${endpoint}?${params.toString()}`;

            const response = await this.makeGraphRequest(url);

            // Normalize events to unified format
            const normalizedEvents = (response.value || []).map(event => this.normalizeEvent(event));

            return {
                success: true,
                data: {
                    events: normalizedEvents,
                    nextPageToken: response['@odata.nextLink'] || null
                },
                metadata: {
                    total: normalizedEvents.length,
                    calendarId: calendarId || 'default',
                    provider: 'outlook',
                    hasMore: !!response['@odata.nextLink']
                }
            };
        } catch (error) {
            logger.error('Failed to fetch Outlook Calendar events', {
                email: this.email,
                accountId: this.accountId,
                error: error.message,
                stack: error.stack
            });

            return {
                success: false,
                error: {
                    code: 'GET_EVENTS_ERROR',
                    message: error.message,
                    provider: 'outlook'
                }
            };
        }
    }

    /**
     * Create a new event in Outlook Calendar
     * @param {Object} eventData - Event data
     * @param {string} eventData.subject - Event title
     * @param {string} eventData.body - Event description {content, contentType}
     * @param {Object} eventData.start - Start time {dateTime, timeZone}
     * @param {Object} eventData.end - End time {dateTime, timeZone}
     * @param {Array} eventData.attendees - Array of {emailAddress: {address, name}, type}
     * @param {Object} eventData.location - Event location {displayName}
     * @param {string} eventData.calendarId - Calendar ID (default: uses default calendar)
     * @returns {Promise<Object>} Created event response
     */
    async createEvent(eventData) {
        try {
            const { calendarId, ...event } = eventData;

            if (!event.subject) {
                throw new Error('Event subject (title) is required');
            }
            if (!event.start || !event.start.dateTime) {
                throw new Error('Event start time is required');
            }
            if (!event.end || !event.end.dateTime) {
                throw new Error('Event end time is required');
            }

            // Ensure body has proper format if provided
            if (event.body && typeof event.body === 'string') {
                event.body = {
                    content: event.body,
                    contentType: 'HTML'
                };
            }

            // Build the API endpoint
            const endpoint = calendarId
                ? `/me/calendars/${calendarId}/events`
                : '/me/calendar/events';

            const response = await this.makeGraphRequest(endpoint, {
                method: 'POST',
                body: JSON.stringify(event)
            });

            return {
                success: true,
                data: {
                    event: response
                },
                metadata: {
                    eventId: response.id,
                    calendarId: calendarId || 'default',
                    provider: 'outlook'
                }
            };
        } catch (error) {
            logger.error('Failed to create Outlook Calendar event', {
                email: this.email,
                accountId: this.accountId,
                error: error.message,
                stack: error.stack
            });

            return {
                success: false,
                error: {
                    code: 'CREATE_EVENT_ERROR',
                    message: error.message,
                    provider: 'outlook'
                }
            };
        }
    }

    /**
     * Get list of calendars for the user
     * @returns {Promise<Object>} Calendars response
     */
    async getCalendars() {
        try {
            const url = '/me/calendars';

            const response = await this.makeGraphRequest(url);

            return {
                success: true,
                data: {
                    calendars: response.value || []
                },
                metadata: {
                    total: response.value?.length || 0,
                    provider: 'outlook'
                }
            };
        } catch (error) {
            logger.error('Failed to fetch Outlook Calendar list', {
                email: this.email,
                accountId: this.accountId,
                error: error.message
            });

            return {
                success: false,
                error: {
                    code: 'GET_CALENDARS_ERROR',
                    message: error.message,
                    provider: 'outlook'
                }
            };
        }
    }

    /**
     * Normalize Outlook Calendar event to unified format
     * @param {Object} event - Outlook Calendar event
     * @returns {Object} Normalized event
     */
    normalizeEvent(event) {
        return {
            id: event.id,
            title: event.subject || '',
            description: event.body?.content || event.bodyPreview || '',
            startDate: event.start?.dateTime,
            endDate: event.end?.dateTime,
            timeZone: event.start?.timeZone || event.originalStartTimeZone || null,
            location: event.location?.displayName || event.location?.uniqueId || '',
            isAllDay: event.isAllDay || false,
            status: this.mapOutlookStatus(event.showAs),
            attendees: (event.attendees || []).map(attendee => ({
                email: attendee.emailAddress?.address || '',
                name: attendee.emailAddress?.name || attendee.emailAddress?.address || '',
                responseStatus: this.mapAttendeeResponse(attendee.status?.response),
                isOrganizer: attendee.type === 'organizer'
            })),
            organizer: event.organizer ? {
                email: event.organizer.emailAddress?.address || '',
                name: event.organizer.emailAddress?.name || event.organizer.emailAddress?.address || ''
            } : null,
            meetingUrl: event.onlineMeeting?.joinUrl || null,
            createdAt: event.createdDateTime,
            updatedAt: event.lastModifiedDateTime,
            provider: 'outlook'
        };
    }

    /**
     * Map Outlook status to unified status
     */
    mapOutlookStatus(showAs) {
        const statusMap = {
            'free': 'available',
            'tentative': 'tentative',
            'busy': 'confirmed',
            'oof': 'outOfOffice',
            'workingElsewhere': 'confirmed',
            'unknown': 'confirmed'
        };
        return statusMap[showAs] || 'confirmed';
    }

    /**
     * Map Outlook attendee response to unified format
     */
    mapAttendeeResponse(response) {
        const responseMap = {
            'none': 'needsAction',
            'organizer': 'accepted',
            'tentativelyAccepted': 'tentative',
            'accepted': 'accepted',
            'declined': 'declined',
            'notResponded': 'needsAction'
        };
        return responseMap[response] || 'needsAction';
    }
}
