import { EventEmitter } from 'events';

export class BaseCalendarProvider {
    config;
    isConnected = false;
    eventEmitter;

    constructor(config) {
        this.config = config;
        this.eventEmitter = new EventEmitter();
    }

    getConnectionStatus() {
        return this.isConnected;
    }

    async connect() {
        throw new Error('Method must be implemented by subclass');
    }

    async disconnect() {
        throw new Error('Method must be implemented by subclass');
    }

    async authenticate(credentials) {
        throw new Error('Method must be implemented by subclass');
    }

    async getCalendars() {
        throw new Error('Method must be implemented by subclass');
    }

    async getEvents(request) {
        throw new Error('Method must be implemented by subclass');
    }

    async createEvent(event) {
        throw new Error('Method must be implemented by subclass');
    }

    async updateEvent(eventId, event) {
        throw new Error('Method must be implemented by subclass');
    }

    async deleteEvent(eventId) {
        throw new Error('Method must be implemented by subclass');
    }

    async getAvailableSlots(request) {
        throw new Error('Method must be implemented by subclass');
    }

    createSuccessResponse(data, metadata = {}) {
        return {
            success: true,
            data,
            error: null,
            metadata: {
                provider: this.config?.type || 'unknown',
                timestamp: new Date(),
                ...metadata
            }
        };
    }

    createErrorResponse(code, message, details = null) {
        return {
            success: false,
            data: null,
            error: {
                code,
                message,
                provider: this.config?.type || 'unknown',
                timestamp: new Date(),
                details
            },
            metadata: {}
        };
    }
}