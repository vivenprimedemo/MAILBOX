import { CalendarService } from '../services/CalendarService.js';
import { CalendarConfig } from '../models/Calendar.js';
import logger from '../lib/logger.js';

export class CalendarController {
    static calendarService = new CalendarService();

    static async getCalendars(req, res) {
        try {
            const { accountId } = req.params;

            const result = await CalendarController.calendarService.getCalendars(accountId, req.userId);

            res.json({
                success: true,
                data: result.data || result,
                error: null,
                metadata: result.metadata || {
                    timestamp: new Date()
                }
            });
        } catch (error) {
            logger.error('Failed to get calendars', { 
                error: error.message, 
                stack: error.stack, 
                accountId: req.params.accountId 
            });
            
            const errorCode = error.code || 'FETCH_CALENDARS_ERROR';
            const statusCode = errorCode === 'PROVIDER_INITIALIZATION_FAILED' ? 422 : 500;

            res.status(statusCode).json({
                success: false,
                data: null,
                error: {
                    code: errorCode,
                    message: error instanceof Error ? error.message : 'Failed to get calendars',
                    provider: 'google',
                    timestamp: new Date()
                },
                metadata: {}
            });
        }
    }

    static async getEvents(req, res) {
        try {
            const { accountId } = req.params;
            const now = new Date();
            const { 
                calendarId = 'primary', 
                timeMin, 
                timeMax, 
                maxResults = 250,
                orderBy = 'startTime',
                singleEvents = false,
                showDeleted = false 
            } = req.query;

            const request = {
                calendarId,
                timeMin: timeMin || now.toISOString().split('.')[0] + "Z",
                timeMax,
                maxResults: parseInt(maxResults),
                orderBy,
                singleEvents: singleEvents === 'true',
                showDeleted: showDeleted === 'true'
            };

            const result = await CalendarController.calendarService.getEvents(accountId, req.userId, request);

            res.json({
                success: true,
                data: result.data || result,
                error: null,
                metadata: result.metadata || {
                    timestamp: new Date()
                }
            });
        } catch (error) {
            logger.error('Failed to get events', { 
                error: error.message, 
                stack: error.stack, 
                accountId: req.params.accountId 
            });

            const errorCode = error.code || 'FETCH_EVENTS_ERROR';
            const statusCode = errorCode === 'PROVIDER_INITIALIZATION_FAILED' ? 422 : 500;

            res.status(statusCode).json({
                success: false,
                data: null,
                error: {
                    code: errorCode,
                    message: error instanceof Error ? error.message : 'Failed to get events',
                    provider: 'google',
                    timestamp: new Date()
                },
                metadata: {}
            });
        }
    }

    static async createEvent(req, res) {
        try {
            const { accountId } = req.params;
            const eventData = req.body;

            const result = await CalendarController.calendarService.createEvent(accountId, req.userId, eventData);

            res.status(201).json({
                success: true,
                data: result.data || result,
                error: null,
                metadata: result.metadata || {
                    timestamp: new Date()
                }
            });
        } catch (error) {
            logger.error('Failed to create event', { 
                error: error.message, 
                stack: error.stack, 
                accountId: req.params.accountId 
            });

            const errorCode = error.code || 'CREATE_EVENT_ERROR';
            const statusCode = errorCode === 'PROVIDER_INITIALIZATION_FAILED' ? 422 : 500;

            res.status(statusCode).json({
                success: false,
                data: null,
                error: {
                    code: errorCode,
                    message: error instanceof Error ? error.message : 'Failed to create event',
                    provider: 'google',
                    timestamp: new Date()
                },
                metadata: {}
            });
        }
    }

    static async updateEvent(req, res) {
        try {
            const { accountId, eventId } = req.params;
            const eventData = req.body;

            const result = await CalendarController.calendarService.updateEvent(
                accountId, 
                req.userId, 
                eventId, 
                eventData
            );

            res.json({
                success: true,
                data: result.data || result,
                error: null,
                metadata: result.metadata || {
                    timestamp: new Date()
                }
            });
        } catch (error) {
            logger.error('Failed to update event', { 
                error: error.message, 
                stack: error.stack, 
                accountId: req.params.accountId,
                eventId: req.params.eventId 
            });

            const errorCode = error.code || 'UPDATE_EVENT_ERROR';
            const statusCode = errorCode === 'PROVIDER_INITIALIZATION_FAILED' ? 422 : 500;

            res.status(statusCode).json({
                success: false,
                data: null,
                error: {
                    code: errorCode,
                    message: error instanceof Error ? error.message : 'Failed to update event',
                    provider: 'google',
                    timestamp: new Date()
                },
                metadata: {}
            });
        }
    }

    static async deleteEvent(req, res) {
        try {
            const { accountId, eventId } = req.params;
            const { calendarId = 'primary' } = req.query;

            const result = await CalendarController.calendarService.deleteEvent(
                accountId, 
                req.userId, 
                eventId, 
                calendarId
            );

            res.json({
                success: true,
                data: result.data || result,
                error: null,
                metadata: result.metadata || {
                    timestamp: new Date()
                }
            });
        } catch (error) {
            logger.error('Failed to delete event', { 
                error: error.message, 
                stack: error.stack, 
                accountId: req.params.accountId,
                eventId: req.params.eventId 
            });

            const errorCode = error.code || 'DELETE_EVENT_ERROR';
            const statusCode = errorCode === 'PROVIDER_INITIALIZATION_FAILED' ? 422 : 500;

            res.status(statusCode).json({
                success: false,
                data: null,
                error: {
                    code: errorCode,
                    message: error instanceof Error ? error.message : 'Failed to delete event',
                    provider: 'google',
                    timestamp: new Date()
                },
                metadata: {}
            });
        }
    }

    static async getAvailableSlots(req, res) {
        try {
            const { accountId } = req.params;
            const { 
                calendarId = 'primary',
                timeMin,
                timeMax,
                duration = 60,
                workingHoursStart = '09:00',
                workingHoursEnd = '17:00',
                timeZone = 'UTC'
            } = req.query;

            const request = {
                calendarId,
                timeMin: timeMin || new Date().toISOString(),
                timeMax: timeMax || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
                duration: parseInt(duration),
                workingHours: {
                    start: workingHoursStart,
                    end: workingHoursEnd
                },
                timeZone
            };

            const result = await CalendarController.calendarService.getAvailableSlots(
                accountId, 
                req.userId, 
                request
            );

            res.json({
                success: true,
                data: result.data || result,
                error: null,
                metadata: result.metadata || {
                    timestamp: new Date()
                }
            });
        } catch (error) {
            logger.error('Failed to get available slots', { 
                error: error.message, 
                stack: error.stack, 
                accountId: req.params.accountId 
            });

            const errorCode = error.code || 'GET_AVAILABLE_SLOTS_ERROR';
            const statusCode = errorCode === 'PROVIDER_INITIALIZATION_FAILED' ? 422 : 500;

            res.status(statusCode).json({
                success: false,
                data: null,
                error: {
                    code: errorCode,
                    message: error instanceof Error ? error.message : 'Failed to get available slots',
                    provider: 'google',
                    timestamp: new Date()
                },
                metadata: {}
            });
        }
    }

    // Calendar Account Management
    static async getCalendarAccounts(req, res) {
        try {
            const accounts = await CalendarConfig.find({ user_id: req.params.userId }).select('-__v -auth');

            res.json({
                success: true,
                data: { accounts },
                error: null,
                metadata: {
                    timestamp: new Date()
                }
            });
        } catch (error) {
            logger.error('Failed to get calendar accounts', { 
                error: error.message, 
                stack: error.stack, 
                userId: req.params.userId 
            });
            res.status(500).json({
                success: false,
                data: null,
                error: {
                    code: 'GET_CALENDAR_ACCOUNTS_ERROR',
                    message: error instanceof Error ? error.message : 'Failed to get calendar accounts',
                    provider: 'google',
                    timestamp: new Date()
                },
                metadata: {}
            });
        }
    }

    static async addCalendarAccount(req, res) {
        try {
            const accountData = req.body;
            
            // Ensure required fields
            if (!accountData.email || !accountData.auth?.access_token || !accountData.auth?.refresh_token) {
                return res.status(400).json({
                    success: false,
                    data: null,
                    error: {
                        code: 'INVALID_CALENDAR_CONFIG',
                        message: 'Missing required fields: email, access_token, refresh_token',
                        provider: 'google',
                        timestamp: new Date()
                    },
                    metadata: {}
                });
            }

            // Create new calendar config
            const newAccount = new CalendarConfig({
                user_id: req.userId,
                email: accountData.email,
                provider: accountData.provider || 'google',
                auth: {
                    access_token: accountData.auth.access_token,
                    refresh_token: accountData.auth.refresh_token,
                    token_expiry: accountData.auth.token_expiry || null
                },
                calendar_name: accountData.calendar_name || accountData.email,
                company_id: accountData.company_id || null,
                metadata: accountData.metadata || {},
                is_active: true
            });

            const savedAccount = await newAccount.save();

            // Try to connect to the calendar provider
            const connected = await CalendarController.calendarService.connectProvider(
                savedAccount._id,
                {
                    type: 'google',
                    email: accountData.email,
                    auth: {
                        accessToken: accountData.auth.access_token,
                        refreshToken: accountData.auth.refresh_token
                    }
                }
            );

            if (!connected) {
                // Remove the account if connection failed
                await CalendarConfig.findByIdAndDelete(savedAccount._id);

                logger.error('Calendar provider connection failed', {
                    userId: req.userId,
                    email: accountData.email
                });

                return res.status(400).json({
                    success: false,
                    data: null,
                    error: {
                        code: 'CALENDAR_CONNECTION_FAILED',
                        message: 'Failed to connect to Google Calendar. Please check your credentials.',
                        provider: 'google',
                        timestamp: new Date()
                    },
                    metadata: {}
                });
            }

            res.status(201).json({
                success: true,
                data: { account: savedAccount },
                error: null,
                metadata: {
                    timestamp: new Date()
                }
            });
        } catch (error) {
            logger.error('Failed to add calendar account', { 
                error: error.message, 
                stack: error.stack, 
                userId: req.userId 
            });
            res.status(500).json({
                success: false,
                data: null,
                error: {
                    code: 'ADD_CALENDAR_ACCOUNT_ERROR',
                    message: error instanceof Error ? error.message : 'Failed to add calendar account',
                    provider: 'google',
                    timestamp: new Date()
                },
                metadata: {}
            });
        }
    }

    static async updateCalendarAccount(req, res) {
        try {
            const { accountId } = req.params;
            const updateData = req.body;

            const updatedAccount = await CalendarConfig.findOneAndUpdate(
                { _id: accountId, user_id: req.userId },
                { 
                    $set: {
                        ...updateData,
                        updated_at: new Date()
                    }
                },
                { new: true, select: '-auth' }
            );

            if (!updatedAccount) {
                logger.warn('Calendar account not found for update', {
                    accountId: req.params.accountId,
                    userId: req.userId
                });

                return res.status(404).json({
                    success: false,
                    data: null,
                    error: {
                        code: 'CALENDAR_ACCOUNT_NOT_FOUND',
                        message: 'Calendar account not found',
                        provider: 'google',
                        timestamp: new Date()
                    },
                    metadata: {}
                });
            }

            res.json({
                success: true,
                data: { account: updatedAccount },
                error: null,
                metadata: {
                    timestamp: new Date()
                }
            });
        } catch (error) {
            logger.error('Failed to update calendar account', { 
                error: error.message, 
                stack: error.stack, 
                accountId: req.params.accountId,
                userId: req.userId 
            });
            res.status(500).json({
                success: false,
                data: null,
                error: {
                    code: 'UPDATE_CALENDAR_ACCOUNT_ERROR',
                    message: error instanceof Error ? error.message : 'Failed to update calendar account',
                    provider: 'google',
                    timestamp: new Date()
                },
                metadata: {}
            });
        }
    }

    static async removeCalendarAccount(req, res) {
        try {
            const { accountId } = req.params;

            // Remove provider connection
            await CalendarController.calendarService.removeProvider(accountId);

            // Remove account from database
            const deletedAccount = await CalendarConfig.findOneAndDelete({
                _id: accountId,
                user_id: req.userId
            });

            if (!deletedAccount) {
                logger.warn('Calendar account not found for removal', {
                    accountId: req.params.accountId,
                    userId: req.userId
                });

                return res.status(404).json({
                    success: false,
                    data: null,
                    error: {
                        code: 'CALENDAR_ACCOUNT_NOT_FOUND',
                        message: 'Calendar account not found',
                        provider: 'google',
                        timestamp: new Date()
                    },
                    metadata: {}
                });
            }

            res.json({
                success: true,
                data: { removed: true },
                error: null,
                metadata: {
                    timestamp: new Date()
                }
            });
        } catch (error) {
            logger.error('Failed to remove calendar account', { 
                error: error.message, 
                stack: error.stack, 
                accountId: req.params.accountId,
                userId: req.userId 
            });
            res.status(500).json({
                success: false,
                data: null,
                error: {
                    code: 'REMOVE_CALENDAR_ACCOUNT_ERROR',
                    message: error instanceof Error ? error.message : 'Failed to remove calendar account',
                    provider: 'google',
                    timestamp: new Date()
                },
                metadata: {}
            });
        }
    }
}