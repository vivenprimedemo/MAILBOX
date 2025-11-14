import { Router } from 'express';
import authRoutes from './auth.js';
import emailRoutes from './emails.js';
import calendarRoutes from './calendar.js';
import oauthRoutes from './oauth.js';
import webhookRoutes from './webhooks.js';
import basicController from '../controllers/BasicController.js';
import marketingRoutes from './marketing.js';
import { generalLimiter } from '../middleware/security.js';

const router = Router();

// Health Check
router.get('/health', basicController.getHealth);
router.get('/', basicController.getApiInfo);

// Auth Routes
router.use('/auth', authRoutes);
router.use('/oauth' , oauthRoutes);

// Protected with general rate limiter
router.use('/emails', generalLimiter, emailRoutes);
router.use('/calendar', generalLimiter, calendarRoutes);

// Webhook Routes
router.use('/webhook' , webhookRoutes)

// Marketing Routes
router.use('/marketing-email', generalLimiter, marketingRoutes);

// 404 handler for API routes
router.use('*', basicController.handleNotFound);



export default router;