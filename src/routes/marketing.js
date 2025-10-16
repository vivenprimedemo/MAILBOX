import { Router } from 'express';
import MarketingController from '../controllers/MarketingController.js';

const router = Router();

// Public routes
router.post('/send-now', MarketingController.sendNow.bind(MarketingController));

export default router;