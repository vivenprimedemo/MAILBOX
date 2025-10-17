import { Router } from 'express';
import MarketingController from '../controllers/MarketingController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

// public Routes
router.get('/tracking/open', MarketingController.trackOpen.bind(MarketingController));
router.get('/tracking/click', MarketingController.trackClick.bind(MarketingController));

// protected Routes
router.use(authenticateToken);
router.post('/send-now', MarketingController.sendNow.bind(MarketingController));

export default router;