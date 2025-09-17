import { Database } from '../config/database.js';
import { config } from '../config/index.js';

class BasicController {
    async getHealth(req, res) {
        try {
            const database = Database.getInstance();
            const dbHealthy = await database.isHealthy();
            const dbInfo = database.getConnectionInfo();

            const healthStatus = {
                status: 'ok',
                timestamp: new Date().toISOString(),
                uptime: process.uptime(),
                environment: config.NODE_ENV,
                version: config.VERSION,
                database: {
                    status: dbHealthy ? 'connected' : 'disconnected',
                    readyState: dbInfo?.readyState,
                    isConnected: dbInfo?.isConnected,
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
                data: healthStatus,
                error: null,
                metadata: {
                    timestamp: new Date()
                }
            });
        } catch (error) {
            res.status(503).json({
                success: false,
                data: null,
                error: {
                    code: 'HEALTH_CHECK_FAILED',
                    message: 'Health check failed',
                    provider: '',
                    timestamp: new Date(),
                    details: error instanceof Error ? error.message : 'Unknown error'
                },
                metadata: {}
            });
        }
    }

    getApiInfo(req, res) {
        res.json({
            success: true,
            data: {
                message: 'Universal Email Client API',
                version: '1.0.0',
                documentation: '/api/docs',
                endpoints: {
                    auth: '/api/auth',
                    emails: '/api/emails',
                    calendar: '/api/calendar',
                    health: '/api/health'
                },
                features: [
                    'Multi-provider support (Gmail, Outlook, IMAP)',
                    'Email threading',
                    'Real-time synchronization',
                    'Advanced search',
                    'Folder management',
                    'Attachment support',
                    'Google Calendar integration',
                    'Available slots detection',
                    'Rate limiting',
                    'Security middleware'
                ]
            },
            error: null,
            metadata: {
                timestamp: new Date()
            }
        });
    }

    handleNotFound(req, res) {
        res.status(404).json({
            success: false,
            data: null,
            error: {
                code: 'ENDPOINT_NOT_FOUND',
                message: `API endpoint not found: ${req.method} ${req.originalUrl}`,
                provider: '',
                timestamp: new Date(),
                availableEndpoints: [
                    'GET /api/',
                    'GET /api/health',
                    'POST /api/auth/register',
                    'POST /api/auth/login',
                    'GET /api/emails/accounts/:userId',
                    'POST /api/emails/accounts',
                    'GET /api/calendar/accounts/:userId',
                    'POST /api/calendar/accounts',
                    'GET /api/calendar/accounts/:accountId/calendars',
                    'GET /api/calendar/accounts/:accountId/events',
                    'POST /api/calendar/accounts/:accountId/events',
                    'GET /api/calendar/accounts/:accountId/available-slots'
                ]
            },
            metadata: {}
        });
    }
}

export default new BasicController();