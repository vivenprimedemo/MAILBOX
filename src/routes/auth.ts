import { Router } from 'express';
import { AuthController } from '../controllers/AuthController';
import { validate, schemas } from '../middleware/validation';
import { authenticateToken } from '../middleware/auth';
import { authLimiter } from '../middleware/security';

const router = Router();

// Public routes (with rate limiting)
router.post('/register', authLimiter, validate(schemas.register), AuthController.register);
router.post('/login', authLimiter, validate(schemas.login), AuthController.login);
router.post('/refresh-token', authLimiter, AuthController.refreshToken);

// Protected routes
router.use(authenticateToken);

router.get('/profile', AuthController.getProfile);
router.put('/profile', validate(schemas.updatePreferences), AuthController.updateProfile);
router.put('/password', AuthController.updatePassword);
router.post('/logout', AuthController.logout);
router.delete('/account', AuthController.deactivateAccount);

export default router;