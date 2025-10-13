import { GoogleCalendarProvider } from '../providers/GoogleCalendarProvider.js';
import { CalendarConfig } from '../models/Calendar.js';
import { provider_config_map } from '../config/index.js';
import logger from '../utils/logger.js';

export class CalendarService {
    providerInstances = new Map();

    constructor() { }

    createProvider(config, accountId) {
        let provider;

        switch (config.type) {
            case 'google':
                provider = new GoogleCalendarProvider(config);
                break;
            default:
                throw new Error(`Unsupported calendar provider type: ${config.type}`);
        }

        this.providerInstances.set(accountId, provider);
        return provider;
    }

    async getProvider(accountId, userId = null) {
        let provider = this.providerInstances.get(accountId);
        try {
            const calendar_config = await CalendarConfig.findOne({ _id: accountId });
            if (!calendar_config) {
                logger.error('Calendar configuration not found', { accountId });
                throw new Error('Calendar configuration not found');
            }

            const calendar_provider = calendar_config?.provider;
            if (calendar_provider !== 'google') {
                logger.error('Unsupported calendar provider', { calendar_provider, accountId });
                throw new Error('Only Google Calendar is supported currently');
            }

            const provider_config = {
                id: accountId,
                type: calendar_provider,
                email: calendar_config?.email,
                auth: {
                    user: calendar_config?.email,
                    accessToken: calendar_config?.auth?.access_token,
                    refreshToken: calendar_config?.auth?.refresh_token,
                    clientId: provider_config_map?.gmail?.client_id, // Using gmail config for Google Calendar
                    clientSecret: provider_config_map?.gmail?.client_secret,
                }
            }
            provider = this.createProvider(provider_config, accountId);
            await provider.connect();
        } catch (error) {
            logger.error('Failed to get calendar provider', { error: error.message, accountId });
            return null;
        }

        return provider || null;
    }

    async removeProvider(accountId) {
        const provider = this.providerInstances.get(accountId);
        if (provider) {
            await provider.disconnect();
            this.providerInstances.delete(accountId);
        }
    }

    async connectProvider(accountId, config) {
        try {
            const provider = this.createProvider(config, accountId);
            await provider.connect();
            return true;
        } catch (error) {
            logger.error('Failed to connect calendar provider', { error: error.message, accountId });
            return false;
        }
    }

    async getCalendars(accountId, userId = null) {
        const provider = await this.getProvider(accountId, userId);
        if (!provider) {
            const error = new Error('Failed to initialize calendar provider. Please check your account configuration and credentials.');
            error.code = 'PROVIDER_INITIALIZATION_FAILED';
            throw error;
        }
        return provider.getCalendars();
    }

    async getEvents(accountId, userId, request) {
        const provider = await this.getProvider(accountId, userId);
        if (!provider) {
            const error = new Error('Failed to initialize calendar provider. Please check your account configuration and credentials.');
            error.code = 'PROVIDER_INITIALIZATION_FAILED';
            throw error;
        }
        return provider.getEvents(request);
    }

    async createEvent(accountId, userId, eventData) {
        const provider = await this.getProvider(accountId, userId);
        if (!provider) {
            const error = new Error('Failed to initialize calendar provider. Please check your account configuration and credentials.');
            error.code = 'PROVIDER_INITIALIZATION_FAILED';
            throw error;
        }
        return provider.createEvent(eventData);
    }

    async updateEvent(accountId, userId, eventId, eventData) {
        const provider = await this.getProvider(accountId, userId);
        if (!provider) {
            const error = new Error('Failed to initialize calendar provider. Please check your account configuration and credentials.');
            error.code = 'PROVIDER_INITIALIZATION_FAILED';
            throw error;
        }
        return provider.updateEvent(eventId, eventData);
    }

    async deleteEvent(accountId, userId, eventId, calendarId = 'primary') {
        const provider = await this.getProvider(accountId, userId);
        if (!provider) {
            const error = new Error('Failed to initialize calendar provider. Please check your account configuration and credentials.');
            error.code = 'PROVIDER_INITIALIZATION_FAILED';
            throw error;
        }
        return provider.deleteEvent(eventId, calendarId);
    }

    async getAvailableSlots(accountId, userId, request) {
        const provider = await this.getProvider(accountId, userId);
        if (!provider) {
            const error = new Error('Failed to initialize calendar provider. Please check your account configuration and credentials.');
            error.code = 'PROVIDER_INITIALIZATION_FAILED';
            throw error;
        }
        return provider.getAvailableSlots(request);
    }
}