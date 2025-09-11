import { BaseCalendarProvider } from './BaseCalendarProvider.js';
import { google } from 'googleapis';
import { consoleHelper } from '../../consoleHelper.js';
import { provider_config_map } from '../config/index.js';
import { CalendarConfig } from '../models/Calendar.js';

export class GoogleCalendarProvider extends BaseCalendarProvider {
    constructor(config) {
        super(config);
        this.accessToken = config.auth.accessToken;
        this.refreshToken = config.auth.refreshToken;
        this.config = config;
    }

    async connect() {
        if (!this.accessToken) {
            throw new Error('Access token required for Google Calendar');
        }

        try {
            await this.makeGoogleRequest('https://www.googleapis.com/calendar/v3/users/me/calendarList');
            this.isConnected = true;
        } catch (error) {
            if (this.refreshToken) {
                await this.refreshAccessToken();
                this.isConnected = true;
            } else {
                throw new Error('Invalid access token and no refresh token available');
            }
        }
    }

    async disconnect() {
        this.isConnected = false;
        this.accessToken = undefined;
    }

    async authenticate(credentials) {
        try {
            if (credentials?.accessToken) {
                this.accessToken = credentials.accessToken;
                this.refreshToken = credentials.refreshToken;
            }
            await this.connect();
            return true;
        } catch (error) {
            return false;
        }
    }

    async refreshAccessToken() {
        try {
            consoleHelper("ATTEMPTING GOOGLE CALENDAR REFRESH ACCESS TOKEN");
            if (!this.refreshToken) {
                throw new Error('Refresh token or OAuth credentials missing');
            }

            const oauth2Client = new google.auth.OAuth2(
                provider_config_map?.gmail?.client_id,
                provider_config_map?.gmail?.client_secret,
                provider_config_map?.gmail?.redirect_uri
            );
            oauth2Client.setCredentials({ refresh_token: this.refreshToken });
            const { credentials } = await oauth2Client.refreshAccessToken();
            this.accessToken = credentials.access_token;
            this.refreshToken = credentials.refresh_token;

            await this.updateCalendarAccessToken(this.config.id, this.accessToken);
        } catch (error) {
            consoleHelper("GOOGLE CALENDAR REFRESH ACCESS TOKEN FAILED", error);
            throw error;
        }
    }

    async makeGoogleRequest(url, options = {}) {
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
            consoleHelper("GOOGLE CALENDAR REQUEST FAILED", error);
            throw error;
        });

        consoleHelper("GOOGLE CALENDAR REQUEST", { response });
        consoleHelper("this.accessToken", this.accessToken );

        if (response.status === 401 && this.refreshToken) {
            await this.refreshAccessToken();
            return this.makeGoogleRequest(url, options);
        }

        if (!response.ok) {
            const error = new Error(`Google Calendar API error: ${response.status} ${response.statusText}`);
            consoleHelper("GOOGLE CALENDAR REQUEST FAILED", error);
            throw error;
        }

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

    async getCalendars() {
        try {
            const data = await this.makeGoogleRequest('https://www.googleapis.com/calendar/v3/users/me/calendarList');
            
            const calendars = data.items.map((calendar) => ({
                id: calendar.id,
                summary: calendar.summary,
                description: calendar.description || '',
                location: calendar.location || '',
                timeZone: calendar.timeZone,
                accessRole: calendar.accessRole,
                primary: calendar.primary || false,
                backgroundColor: calendar.backgroundColor,
                foregroundColor: calendar.foregroundColor,
                selected: calendar.selected || false
            }));

            return this.createSuccessResponse(calendars);
        } catch (error) {
            return this.createErrorResponse('GET_CALENDARS_ERROR', `Failed to fetch calendars: ${error.message}`);
        }
    }

    async getEvents(request) {
        try {
            const {
                calendarId = 'primary',
                timeMin = new Date().toISOString(),
                timeMax,
                maxResults = 250,
                orderBy = 'startTime',
                singleEvents = false,
                showDeleted = false
            } = request;

            const params = new URLSearchParams({
                timeMin,
                maxResults: maxResults.toString(),
                orderBy,
                singleEvents: singleEvents.toString(),
                showDeleted: showDeleted.toString()
            });

            if (timeMax) {
                params.append('timeMax', timeMax);
            }

            if (singleEvents === false && orderBy === "startTime") {
               params.delete("orderBy");
            }

            const data = await this.makeGoogleRequest(
                `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`
            );

            const events = data.items?.map(this.formatEvent) || [];

            return this.createSuccessResponse({
                events,
                nextPageToken: data.nextPageToken,
                nextSyncToken: data.nextSyncToken
            });
        } catch (error) {
            return this.createErrorResponse('GET_EVENTS_ERROR', `Failed to fetch events: ${error.message}`);
        }
    }

    async createEvent(eventData) {
        try {
            const { calendarId = 'primary', ...event } = eventData;

            // Convert UTC datetime strings to Google Calendar format
            if (event.start) {
                if (typeof event.start === 'string') {
                    // Convert UTC string to Google Calendar format
                    event.start = { dateTime: event.start, timeZone: 'UTC' };
                }
            }
            if (event.end) {
                if (typeof event.end === 'string') {
                    // Convert UTC string to Google Calendar format
                    event.end = { dateTime: event.end, timeZone: 'UTC' };
                }
            }

            const data = await this.makeGoogleRequest(
                `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
                {
                    method: 'POST',
                    body: JSON.stringify(event)
                }
            );

            return this.createSuccessResponse(this.formatEvent(data));
        } catch (error) {
            return this.createErrorResponse('CREATE_EVENT_ERROR', `Failed to create event: ${error.message}`);
        }
    }

    async updateEvent(eventId, eventData) {
        try {
            const { calendarId = 'primary', ...event } = eventData;

            // Convert UTC datetime strings to Google Calendar format
            if (event.start) {
                if (typeof event.start === 'string') {
                    // Convert UTC string to Google Calendar format
                    event.start = { dateTime: event.start, timeZone: 'UTC' };
                }
            }
            if (event.end) {
                if (typeof event.end === 'string') {
                    // Convert UTC string to Google Calendar format
                    event.end = { dateTime: event.end, timeZone: 'UTC' };
                }
            }

            const data = await this.makeGoogleRequest(
                `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`,
                {
                    method: 'PUT',
                    body: JSON.stringify(event)
                }
            );

            return this.createSuccessResponse(this.formatEvent(data));
        } catch (error) {
            return this.createErrorResponse('UPDATE_EVENT_ERROR', `Failed to update event: ${error.message}`);
        }
    }

    async deleteEvent(eventId, calendarId = 'primary') {
        try {
            await this.makeGoogleRequest(
                `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`,
                {
                    method: 'DELETE'
                }
            );

            return this.createSuccessResponse({ deleted: true, eventId });
        } catch (error) {
            return this.createErrorResponse('DELETE_EVENT_ERROR', `Failed to delete event: ${error.message}`);
        }
    }

    async getAvailableSlots(request) {
        try {
            const {
                calendarId = 'primary',
                timeMin = new Date().toISOString(),
                timeMax = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
                duration = 60,
                workingHours = { start: '09:00', end: '17:00' },
                timeZone = 'UTC'
            } = request;

            const eventsResponse = await this.getEvents({
                calendarId,
                timeMin,
                timeMax,
                maxResults: 2500,
                singleEvents: true
            });

            if (!eventsResponse.success) {
                return eventsResponse;
            }

            const busySlots = eventsResponse.data.events
                .filter(event => event.start && event.end)
                .map(event => ({
                    start: new Date(event.start.dateTime || event.start.date),
                    end: new Date(event.end.dateTime || event.end.date)
                }))
                .sort((a, b) => a.start.getTime() - b.start.getTime());

            const availableSlots = this.findAvailableSlots({
                busySlots,
                timeMin: new Date(timeMin),
                timeMax: new Date(timeMax),
                duration,
                workingHours,
                timeZone
            });

            return this.createSuccessResponse({
                availableSlots,
                busySlots: busySlots.map(slot => ({
                    start: slot.start.toISOString(),
                    end: slot.end.toISOString()
                })),
                duration,
                workingHours,
                timeZone
            });
        } catch (error) {
            return this.createErrorResponse('GET_AVAILABLE_SLOTS_ERROR', `Failed to get available slots: ${error.message}`);
        }
    }

    findAvailableSlots({ busySlots, timeMin, timeMax, duration, workingHours, timeZone }) {
        const availableSlots = [];
        const slotDurationMs = duration * 60 * 1000;
        
        const currentDay = new Date(timeMin);
        const endDay = new Date(timeMax);

        while (currentDay <= endDay) {
            const dayStart = new Date(currentDay);
            const [startHour, startMinute] = workingHours.start.split(':').map(Number);
            dayStart.setHours(startHour, startMinute, 0, 0);

            const dayEnd = new Date(currentDay);
            const [endHour, endMinute] = workingHours.end.split(':').map(Number);
            dayEnd.setHours(endHour, endMinute, 0, 0);

            if (dayStart < timeMin) {
                dayStart.setTime(timeMin.getTime());
            }
            if (dayEnd > timeMax) {
                dayEnd.setTime(timeMax.getTime());
            }

            const dayBusySlots = busySlots.filter(slot => 
                (slot.start >= dayStart && slot.start < dayEnd) ||
                (slot.end > dayStart && slot.end <= dayEnd) ||
                (slot.start < dayStart && slot.end > dayEnd)
            );

            let currentTime = new Date(dayStart);

            for (const busySlot of dayBusySlots) {
                while (currentTime.getTime() + slotDurationMs <= Math.min(busySlot.start.getTime(), dayEnd.getTime())) {
                    if (currentTime.getTime() + slotDurationMs <= dayEnd.getTime()) {
                        availableSlots.push({
                            start: new Date(currentTime).toISOString(),
                            end: new Date(currentTime.getTime() + slotDurationMs).toISOString(),
                            duration
                        });
                    }
                    currentTime = new Date(currentTime.getTime() + slotDurationMs);
                }
                currentTime = new Date(Math.max(currentTime.getTime(), busySlot.end.getTime()));
            }

            while (currentTime.getTime() + slotDurationMs <= dayEnd.getTime()) {
                availableSlots.push({
                    start: new Date(currentTime).toISOString(),
                    end: new Date(currentTime.getTime() + slotDurationMs).toISOString(),
                    duration
                });
                currentTime = new Date(currentTime.getTime() + slotDurationMs);
            }

            currentDay.setDate(currentDay.getDate() + 1);
            currentDay.setHours(0, 0, 0, 0);
        }

        return availableSlots;
    }

    formatEvent(event) {
        // Convert start/end times to UTC format
        const formatDateTime = (dateTimeObj) => {
            if (!dateTimeObj) return null;
            
            if (dateTimeObj.dateTime) {
                // Convert to UTC ISO string
                return new Date(dateTimeObj.dateTime).toISOString();
            } else if (dateTimeObj.date) {
                // All-day event - keep as date string but in UTC
                return new Date(dateTimeObj.date + 'T00:00:00.000Z').toISOString();
            }
            return null;
        };

        return {
            id: event.id,
            summary: event.summary || '',
            description: event.description || '',
            location: event.location || '',
            start: formatDateTime(event.start),
            end: formatDateTime(event.end),
            attendees: event.attendees || [],
            creator: event.creator,
            organizer: event.organizer,
            status: event.status,
            visibility: event.visibility,
            recurringEventId: event.recurringEventId,
            originalStartTime: event.originalStartTime,
            transparency: event.transparency,
            iCalUID: event.iCalUID,
            sequence: event.sequence,
            hangoutLink: event.hangoutLink,
            conferenceData: event.conferenceData,
            gadget: event.gadget,
            anyoneCanAddSelf: event.anyoneCanAddSelf,
            guestsCanInviteOthers: event.guestsCanInviteOthers,
            guestsCanModify: event.guestsCanModify,
            guestsCanSeeOtherGuests: event.guestsCanSeeOtherGuests,
            privateCopy: event.privateCopy,
            locked: event.locked,
            reminders: event.reminders,
            source: event.source,
            attachments: event.attachments,
            eventType: event.eventType,
            created: event.created,
            updated: event.updated,
            htmlLink: event.htmlLink
        };
    }

    async updateCalendarAccessToken(accountId, accessToken) {
        try {
            await CalendarConfig.updateOne(
                { _id: accountId },
                { 
                    $set: { 
                        'auth.access_token': accessToken,
                        'auth.refresh_token': this.refreshToken,
                        updated_at: new Date()
                    }
                }
            );
        } catch (error) {
            consoleHelper("Failed to update calendar access token in database", error);
        }
    }
}