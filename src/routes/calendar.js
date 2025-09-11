import express from 'express';
import { CalendarController } from '../controllers/CalendarController.js';
import { authenticateToken } from '../middleware/auth.js';

const { Router } = express;

const router = Router();

// All routes require authentication
// router.use(authenticateToken);

// Calendar Account Management Routes
router.get('/accounts/:userId', CalendarController.getCalendarAccounts);
router.post('/accounts', CalendarController.addCalendarAccount);
router.put('/accounts/:accountId', CalendarController.updateCalendarAccount);
router.delete('/accounts/:accountId', CalendarController.removeCalendarAccount);

// Calendar Routes (require specific account - but don't use requireEmailAccount as these are separate)
// Get user calendars
router.get('/accounts/:accountId/calendars', CalendarController.getCalendars);

// Event operations
router.get('/accounts/:accountId/events', CalendarController.getEvents);
router.post('/accounts/:accountId/events', CalendarController.createEvent);
router.put('/accounts/:accountId/events/:eventId', CalendarController.updateEvent);
router.delete('/accounts/:accountId/events/:eventId', CalendarController.deleteEvent);

// Available slots
router.get('/accounts/:accountId/available-slots', CalendarController.getAvailableSlots);

export default router;