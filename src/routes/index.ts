import { Router, Request, Response } from 'express';
import authRoutes from './auth';
import emailRoutes from './emails';
import { Database } from '../config/database';

const router = Router();

// Health check endpoint
router.get('/health', async (req: Request, res: Response) => {
  try {
    const database = Database.getInstance();
    const dbHealthy = await database.isHealthy();
    const dbInfo = database.getConnectionInfo();

    const healthStatus = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
      version: process.env.npm_package_version || '1.0.0',
      database: {
        status: dbHealthy ? 'connected' : 'disconnected',
        ...dbInfo
      },
      memory: {
        used: Math.round((process.memoryUsage().heapUsed / 1024 / 1024) * 100) / 100,
        total: Math.round((process.memoryUsage().heapTotal / 1024 / 1024) * 100) / 100,
        external: Math.round((process.memoryUsage().external / 1024 / 1024) * 100) / 100
      }
    };

    const statusCode = dbHealthy ? 200 : 503;
    
    res.status(statusCode).json({
      success: dbHealthy,
      data: healthStatus
    });
  } catch (error) {
    res.status(503).json({
      success: false,
      message: 'Health check failed',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// API information endpoint
router.get('/', (req: Request, res: Response) => {
  res.json({
    success: true,
    message: 'Universal Email Client API',
    version: '1.0.0',
    documentation: '/api/docs',
    endpoints: {
      auth: '/api/auth',
      emails: '/api/emails',
      health: '/api/health'
    },
    features: [
      'Multi-provider support (Gmail, Outlook, IMAP)',
      'Email threading',
      'Real-time synchronization',
      'Advanced search',
      'Folder management',
      'Attachment support',
      'Rate limiting',
      'Security middleware'
    ]
  });
});

// Mount route modules
router.use('/auth', authRoutes);
router.use('/emails', emailRoutes);

// 404 handler for API routes
router.use('*', (req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    message: `API endpoint not found: ${req.method} ${req.originalUrl}`,
    availableEndpoints: [
      'GET /api/',
      'GET /api/health',
      'POST /api/auth/register',
      'POST /api/auth/login',
      'GET /api/emails/accounts',
      'POST /api/emails/accounts'
    ]
  });
});

export default router;