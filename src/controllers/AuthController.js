import { AuthService } from '../services/AuthService.js';
import logger from '../lib/logger.js';

export class AuthController {
    static async register(req, res) {
        try {
            const { username, email, password, firstName, lastName } = req.body;

            const { user, token } = await AuthService.register({
                username,
                email,
                password,
                firstName,
                lastName
            });

            // Don't send password hash
            const { passwordHash, ...userResponse } = user;

            res.status(201).json({
                success: true,
                data: {
                    user: userResponse,
                    token
                },
                error: null,
                metadata: {
                    timestamp: new Date()
                }
            });
        } catch (error) {
            logger.error('User registration failed', { error: error.message, stack: error.stack, username: req.body.username, email: req.body.email });
            res.status(400).json({
                success: false,
                data: null,
                error: {
                    code: 'REGISTRATION_FAILED',
                    message: error instanceof Error ? error.message : 'Registration failed',
                    provider: '',
                    timestamp: new Date()
                },
                metadata: {}
            });
        }
    }

    static async login(req, res) {
        try {
            const { username, password } = req.body;

            const { user, token } = await AuthService.login(username, password);

            // Don't send password hash
            const { passwordHash, ...userResponse } = user;

            res.json({
                success: true,
                data: {
                    user: userResponse,
                    token
                },
                error: null,
                metadata: {
                    timestamp: new Date()
                }
            });
        } catch (error) {
            logger.error('User login failed', { error: error.message, stack: error.stack, username: req.body.username });
            res.status(401).json({
                success: false,
                data: null,
                error: {
                    code: 'LOGIN_FAILED',
                    message: error instanceof Error ? error.message : 'Login failed',
                    provider: '',
                    timestamp: new Date()
                },
                metadata: {}
            });
        }
    }

    static async refreshToken(req, res) {
        try {
            const { token: oldToken } = req.body;

            if (!oldToken) {
                res.status(400).json({
                    success: false,
                    data: null,
                    error: {
                        code: 'TOKEN_REQUIRED',
                        message: 'Token is required',
                        provider: '',
                        timestamp: new Date()
                    },
                    metadata: {}
                });
                return;
            }

            const { token } = await AuthService.refreshToken(oldToken);

            res.json({
                success: true,
                data: { token },
                error: null,
                metadata: {
                    timestamp: new Date()
                }
            });
        } catch (error) {
            logger.error('Token refresh failed', { error: error.message, stack: error.stack });
            res.status(401).json({
                success: false,
                data: null,
                error: {
                    code: 'TOKEN_REFRESH_FAILED',
                    message: error instanceof Error ? error.message : 'Token refresh failed',
                    provider: '',
                    timestamp: new Date()
                },
                metadata: {}
            });
        }
    }

    static async getProfile(req, res) {
        try {
            const user = await AuthService.getUserById(req.userId);

            if (!user) {
                logger.warn('User profile not found', { userId: req.userId });
                res.status(404).json({
                    success: false,
                    data: null,
                    error: {
                        code: 'USER_NOT_FOUND',
                        message: 'User not found',
                        provider: '',
                        timestamp: new Date()
                    },
                    metadata: {}
                });
                return;
            }

            // Don't send password hash
            const { passwordHash, ...userResponse } = user;

            res.json({
                success: true,
                data: { user: userResponse },
                error: null,
                metadata: {
                    timestamp: new Date()
                }
            });
        } catch (error) {
            logger.error('Failed to get user profile', { error: error.message, stack: error.stack, userId: req.userId });
            res.status(500).json({
                success: false,
                data: null,
                error: {
                    code: 'GET_PROFILE_ERROR',
                    message: 'Failed to get profile',
                    provider: '',
                    timestamp: new Date()
                },
                metadata: {}
            });
        }
    }

    static async updateProfile(req, res) {
        try {
            const updateData = req.body;

            const user = await AuthService.updateUser(req.userId, updateData);

            if (!user) {
                logger.warn('User not found for profile update', { userId: req.userId });
                res.status(404).json({
                    success: false,
                    data: null,
                    error: {
                        code: 'USER_NOT_FOUND',
                        message: 'User not found',
                        provider: '',
                        timestamp: new Date()
                    },
                    metadata: {}
                });
                return;
            }

            // Don't send password hash
            const { passwordHash, ...userResponse } = user;

            res.json({
                success: true,
                data: { user: userResponse },
                error: null,
                metadata: {
                    timestamp: new Date()
                }
            });
        } catch (error) {
            logger.error('Profile update failed', { error: error.message, stack: error.stack, userId: req.userId });
            res.status(400).json({
                success: false,
                data: null,
                error: {
                    code: 'PROFILE_UPDATE_FAILED',
                    message: error instanceof Error ? error.message : 'Profile update failed',
                    provider: '',
                    timestamp: new Date()
                },
                metadata: {}
            });
        }
    }

    static async updatePassword(req, res) {
        try {
            const { currentPassword, newPassword } = req.body;

            if (!currentPassword || !newPassword) {
                res.status(400).json({
                    success: false,
                    data: null,
                    error: {
                        code: 'PASSWORD_REQUIRED',
                        message: 'Current password and new password are required',
                        provider: '',
                        timestamp: new Date()
                    },
                    metadata: {}
                });
                return;
            }

            await AuthService.updatePassword(req.userId, currentPassword, newPassword);

            res.json({
                success: true,
                data: { updated: true },
                error: null,
                metadata: {
                    timestamp: new Date()
                }
            });
        } catch (error) {
            logger.error('Password update failed', { error: error.message, stack: error.stack, userId: req.userId });
            res.status(400).json({
                success: false,
                data: null,
                error: {
                    code: 'PASSWORD_UPDATE_FAILED',
                    message: error instanceof Error ? error.message : 'Password update failed',
                    provider: '',
                    timestamp: new Date()
                },
                metadata: {}
            });
        }
    }

    static async deactivateAccount(req, res) {
        try {
            await AuthService.deactivateUser(req.userId);

            res.json({
                success: true,
                data: { deactivated: true },
                error: null,
                metadata: {
                    timestamp: new Date()
                }
            });
        } catch (error) {
            logger.error('Account deactivation failed', { error: error.message, stack: error.stack, userId: req.userId });
            res.status(500).json({
                success: false,
                data: null,
                error: {
                    code: 'DEACTIVATION_FAILED',
                    message: 'Account deactivation failed',
                    provider: '',
                    timestamp: new Date()
                },
                metadata: {}
            });
        }
    }

    static async logout(req, res) {
        // For JWT tokens, logout is handled client-side by removing the token
        // In a production environment, you might want to blacklist tokens
        res.json({
            success: true,
            data: { loggedOut: true },
            error: null,
            metadata: {
                timestamp: new Date()
            }
        });
    }
}