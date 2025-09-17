import { Router } from 'express';
import { authLimiter } from '../middleware/security.js';
import { OauthController } from '../controllers/OauthController.js';

const router = Router();

// Public routes (with rate limiting)
router.post('/url/:provider/:service', authLimiter, OauthController.getAuthorizationUrl);
router.get('/callback', OauthController.handleCallback);

export default router;