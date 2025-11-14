import express from 'express';
import { CalendarController } from '../controllers/CalendarController.js';
import { authenticateToken } from '../middleware/auth.js';

const { Router } = express;

const router = Router();

// All calendar routes require authentication
router.use(authenticateToken);

/**
 * Get calendar events
 * GET /api/calendar/accounts/:accountId/events
 *
 * Query parameters:
 * - calendarId: Calendar ID (optional, defaults to primary/default)
 *
 * For Gmail:
 * - timeMin: Start time (ISO format)
 * - timeMax: End time (ISO format)
 * - maxResults: Maximum number of results (default: 100)
 * - orderBy: Order by field (default: 'startTime')
 * - singleEvents: Expand recurring events (default: true)
 * - q: Search query
 *
 * For Outlook:
 * - startDateTime: Start time (ISO format)
 * - endDateTime: End time (ISO format)
 * - top: Maximum number of results (default: 100)
 * - orderBy: Order by field (default: 'start/dateTime desc/asc')
 * - filter: OData filter query
 */
router.get('/accounts/:accountId/events', CalendarController.getEvents);

/**
 * Create a calendar event
 * POST /api/calendar/accounts/:accountId/events
 *
 * Request body (flexible format - supports both Gmail and Outlook formats):
 * {
 *   // Common fields
 *   "summary" or "subject": "Event Title",
 *   "description" or "body": "Event Description",
 *   "start": {
 *     "dateTime": "2024-01-15T10:00:00",
 *     "timeZone": "America/New_York"
 *   },
 *   "end": {
 *     "dateTime": "2024-01-15T11:00:00",
 *     "timeZone": "America/New_York"
 *   },
 *   "location": "Conference Room" or { "displayName": "Conference Room" },
 *   "attendees": [...],
 *   "calendarId": "primary" (optional)
 * }
 */
router.post('/accounts/:accountId/events', CalendarController.createEvent);

/**
 * Get list of calendars
 * GET /api/calendar/accounts/:accountId/calendars
 */
router.get('/accounts/:accountId/calendars', CalendarController.getCalendars);

export default router;
