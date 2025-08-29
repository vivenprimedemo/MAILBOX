import jwt from 'jsonwebtoken';
import { User } from '../models/User.js';
import { config } from '../config/index.js';

export const authenticateToken = async (req, res, next) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

        if (!token) {
            return res.status(401).json({
                success: false,
                data: null,
                error: {
                    code: 'TOKEN_REQUIRED',
                    message: 'Access token is required',
                    provider: '',
                    timestamp: new Date()
                },
                metadata: {}
            });
        }

        const decoded = jwt.verify(token, config.JWT_SECRET);

        const user = await User.findOne({ id: decoded.userId, isActive: true });
        if (!user) {
            return res.status(401).json({
                success: false,
                data: null,
                error: {
                    code: 'INVALID_TOKEN',
                    message: 'Invalid token or user not found',
                    provider: '',
                    timestamp: new Date()
                },
                metadata: {}
            });
        }

        req.user = user;
        req.userId = user.id;
        next();
    } catch (error) {
        if (error instanceof jwt.JsonWebTokenError) {
            return res.status(403).json({
                success: false,
                data: null,
                error: {
                    code: 'TOKEN_INVALID',
                    message: 'Invalid token',
                    provider: '',
                    timestamp: new Date()
                },
                metadata: {}
            });
        }

        return res.status(500).json({
            success: false,
            data: null,
            error: {
                code: 'TOKEN_VERIFICATION_FAILED',
                message: 'Token verification failed',
                provider: '',
                timestamp: new Date()
            },
            metadata: {}
        });
    }
};

export const optionalAuth = async (req, res, next) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];

        if (!token) {
            return next();
        }

        const decoded = jwt.verify(token, config.JWT_SECRET);
        const user = await User.findOne({ id: decoded.userId, isActive: true });

        if (user) {
            req.user = user;
            req.userId = user.id;
        }

        next();
    } catch (error) {
        // Continue without authentication
        next();
    }
};

export const requireEmailAccount = (req, res, next) => {
    const { accountId } = req.params;

    if (!req.user) {
        return res.status(401).json({
            success: false,
            data: null,
            error: {
                code: 'AUTH_REQUIRED',
                message: 'Authentication required',
                provider: '',
                timestamp: new Date()
            },
            metadata: {}
        });
    }

    const account = req.user.emailAccounts.find((acc) => acc.id === accountId);
    if (!account) {
        return res.status(404).json({
            success: false,
            data: null,
            error: {
                code: 'ACCOUNT_NOT_FOUND',
                message: 'Email account not found',
                provider: '',
                timestamp: new Date()
            },
            metadata: {}
        });
    }

    if (!account.isActive) {
        return res.status(403).json({
            success: false,
            data: null,
            error: {
                code: 'ACCOUNT_DISABLED',
                message: 'Email account is disabled',
                provider: '',
                timestamp: new Date()
            },
            metadata: {}
        });
    }

    req.emailAccount = account;
    next();
};