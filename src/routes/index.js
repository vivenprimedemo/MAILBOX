import { Router } from 'express';
import authRoutes from './auth.js';
import emailRoutes from './emails.js';
import calendarRoutes from './calendar.js';
import oauthRoutes from './oauth.js';
import webhookRoutes from './webhooks.js';
import basicController from '../controllers/BasicController.js';
import marketingRoutes from './marketing.js';

import jobs from '../jobs/index.js';

const router = Router();

// Health Check
router.get('/health', basicController.getHealth);
router.get('/', basicController.getApiInfo);

// Auth Routes
router.use('/auth', authRoutes);
router.use('/oauth' , oauthRoutes);
router.use('/emails', emailRoutes);
router.use('/calendar', calendarRoutes);

// Webhook Routes
router.use('/webhook' , webhookRoutes)

// Marketing Routes
router.use('/marketing-email', marketingRoutes);

router.get('/test-job', async (req, res) => {
    try {
        await jobs.addEmailJob({
            to: 'Gc6lP@example.com',
            subject: 'Test Email',
            bodyText: 'This is a test email.',
        });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 404 handler for API routes
router.use('*', basicController.handleNotFound);



export default router;