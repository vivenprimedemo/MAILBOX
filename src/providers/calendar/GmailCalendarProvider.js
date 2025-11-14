import { google } from 'googleapis';
import logger from '../../utils/logger.js';
import { provider_config_map } from '../../config/index.js';
import { AuthService } from '../../services/AuthService.js';

export class GmailCalendarProvider {
    constructor(emailConfig) {
        this.config = emailConfig;
        this.accessToken = emailConfig.oauth_config?.access_token;
        this.refreshToken = emailConfig.oauth_config?.refresh_token;
        this.accountId = emailConfig._id;
        this.email = emailConfig.email;
    }

    /**
     * Refresh the access token using the refresh token
     */
    async refreshAccessToken() {
        try {
            if (!this.refreshToken) {
                throw new Error('Refresh token missing');
            }

            const oauth2Client = new google.auth.OAuth2(
                provider_config_map?.gmail?.client_id,
                provider_config_map?.gmail?.client_secret,
                provider_config_map?.gmail?.redirect_uri
            );

            oauth2Client.setCredentials({ refresh_token: this.refreshToken });
            const { credentials } = await oauth2Client.refreshAccessToken();

            this.accessToken = credentials.access_token;
            if (credentials.refresh_token) {
                this.refreshToken = credentials.refresh_token;
            }

            // Update the token in database
            await AuthService.updateEmailAccessToken(this.accountId, this.accessToken);

        } catch (error) {
            logger.error('Failed to refresh Google Calendar access token', {
                email: this.email,
                accountId: this.accountId,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Make an authenticated request to Google Calendar API
     */
    async makeCalendarRequest(url, options = {}) {
        if (!this.accessToken) {
            throw new Error('Not authenticated');
        }

        const response = await fetch(url, {
            ...options,
            headers: {
                'Authorization': `Bearer ${this.accessToken}`,
                'Content-Type': 'application/json',
                ...options.headers
            }
        }).catch((error) => {
            logger.error('Google Calendar API request failed', {
                url,
                email: this.email,
                error: error.message
            });
            throw error;
        });

        // Handle 401 - token expired, refresh and retry
        if (response.status === 401 && this.refreshToken) {
            await this.refreshAccessToken();
            return this.makeCalendarRequest(url, options);
        }

        if (!response.ok) {
            const errorText = await response.text();
            const error = new Error(`Google Calendar API error: ${response.status} ${response.statusText}`);
            logger.error('Google Calendar API request failed', {
                url,
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
     * Get events from Google Calendar
     * @param {Object} options - Query options
     * @param {string} options.calendarId - Calendar ID (default: 'primary')
     * @param {string} options.timeMin - Start time (ISO format)
     * @param {string} options.timeMax - End time (ISO format)
     * @param {number} options.maxResults - Maximum number of results
     * @param {string} options.orderBy - Order by field ('startTime' or 'updated')
     * @param {boolean} options.singleEvents - Expand recurring events
     * @param {string} options.q - Search query
     * @returns {Promise<Object>} Events response
     */
    async getEvents(options = {}) {
        try {
            const {
                calendarId = 'primary',
                timeMin,
                timeMax,
                maxResults = 100,
                orderBy = 'startTime',
                singleEvents = true,
                q
            } = options;

            // Build query parameters
            const params = new URLSearchParams({
                maxResults: maxResults.toString(),
                singleEvents: singleEvents.toString()
            });

            if (timeMin) params.append('timeMin', timeMin);
            if (timeMax) params.append('timeMax', timeMax);
            if (orderBy) params.append('orderBy', orderBy);
            if (q) params.append('q', q);

            const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`;

            const response = await this.makeCalendarRequest(url);

            // Normalize events to unified format
            const normalizedEvents = (response.items || []).map(event => this.normalizeEvent(event));

            return {
                success: true,
                data: {
                    events: normalizedEvents,
                    nextPageToken: response.nextPageToken || null
                },
                metadata: {
                    total: normalizedEvents.length,
                    calendarId,
                    provider: 'gmail',
                    hasMore: !!response.nextPageToken
                }
            };
        } catch (error) {
            logger.error('Failed to fetch Google Calendar events', {
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
                    provider: 'gmail'
                }
            };
        }
    }

    /**
     * Create a new event in Google Calendar
     * @param {Object} eventData - Event data
     * @param {string} eventData.summary - Event title
     * @param {string} eventData.description - Event description
     * @param {Object} eventData.start - Start time {dateTime, timeZone}
     * @param {Object} eventData.end - End time {dateTime, timeZone}
     * @param {Array} eventData.attendees - Array of {email, displayName, responseStatus}
     * @param {string} eventData.location - Event location
     * @param {string} eventData.calendarId - Calendar ID (default: 'primary')
     * @returns {Promise<Object>} Created event response
     */
    async createEvent(eventData) {
        try {
            const { calendarId = 'primary', ...event } = eventData;

            // Validate required fields
            if (!event.summary) {
                throw new Error('Event summary (title) is required');
            }
            if (!event.start || !event.start.dateTime) {
                throw new Error('Event start time is required');
            }
            if (!event.end || !event.end.dateTime) {
                throw new Error('Event end time is required');
            }

            const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`;

            const response = await this.makeCalendarRequest(url, {
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
                    calendarId,
                    provider: 'gmail'
                }
            };
        } catch (error) {
            logger.error('Failed to create Google Calendar event', {
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
                    provider: 'gmail'
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
            const url = 'https://www.googleapis.com/calendar/v3/users/me/calendarList';

            const response = await this.makeCalendarRequest(url);

            return {
                success: true,
                data: {
                    calendars: response.items || []
                },
                metadata: {
                    total: response.items?.length || 0,
                    provider: 'gmail'
                }
            };
        } catch (error) {
            logger.error('Failed to fetch Google Calendar list', {
                email: this.email,
                accountId: this.accountId,
                error: error.message
            });

            return {
                success: false,
                error: {
                    code: 'GET_CALENDARS_ERROR',
                    message: error.message,
                    provider: 'gmail'
                }
            };
        }
    }

    /**
     * Normalize Google Calendar event to unified format
     * @param {Object} event - Google Calendar event
     * @returns {Object} Normalized event
     */
    normalizeEvent(event) {
        // Convert start/end to UTC if they have timezone info
        const startDate = event.start?.dateTime || event.start?.date;
        const endDate = event.end?.dateTime || event.end?.date;

        // Convert to UTC format (ISO 8601 with Z suffix)
        const startDateUTC = startDate ? this.convertToUTC(startDate, event.start?.timeZone) : null;
        const endDateUTC = endDate ? this.convertToUTC(endDate, event.end?.timeZone) : null;

        return {
            id: event.id,
            title: event.summary || '',
            description: event.description || '',
            startDate: startDateUTC,
            endDate: endDateUTC,
            timeZone: 'UTC', // Always UTC
            originalTimeZone: event.start?.timeZone || null, // Preserve original timezone
            location: event.location || '',
            isAllDay: !!event.start?.date, // If date field exists (no time), it's all-day
            status: event.status || 'confirmed',
            attendees: (event.attendees || []).map(attendee => ({
                email: attendee.email,
                name: attendee.displayName || attendee.email,
                responseStatus: attendee.responseStatus || 'needsAction',
                isOrganizer: attendee.organizer || false
            })),
            organizer: event.organizer ? {
                email: event.organizer.email,
                name: event.organizer.displayName || event.organizer.email
            } : null,
            meetingUrl: event.hangoutLink || event.conferenceData?.entryPoints?.[0]?.uri || null,
            createdAt: event.created,
            updatedAt: event.updated,
            provider: 'gmail'
        };
    }

    /**
     * Convert date/time to UTC format
     * @param {string} dateTime - ISO 8601 date string
     * @param {string} timeZone - IANA timezone name (optional)
     * @returns {string} UTC date string with Z suffix
     */
    convertToUTC(dateTime, timeZone) {
        if (!dateTime) return null;

        try {
            // If it's already in UTC format (ends with Z), return as is
            if (dateTime.endsWith('Z')) {
                return dateTime;
            }

            // If it's a date-only format (YYYY-MM-DD), return as is (all-day event)
            if (/^\d{4}-\d{2}-\d{2}$/.test(dateTime)) {
                return dateTime;
            }

            // Parse the date and convert to UTC
            const date = new Date(dateTime);

            // Check if date is valid
            if (isNaN(date.getTime())) {
                return dateTime; // Return original if invalid
            }

            // Return in UTC format with Z suffix
            return date.toISOString();
        } catch (error) {
            logger.error('Failed to convert date to UTC', {
                dateTime,
                timeZone,
                error: error.message
            });
            return dateTime; // Return original on error
        }
    }
}
