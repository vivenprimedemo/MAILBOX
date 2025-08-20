import { AuthService } from '../services/AuthService.js';
import { logger } from '../config/logger.js';

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
        message: 'User registered successfully',
        data: {
          user: userResponse,
          token
        }
      });
    } catch (error) {
      logger.error('User registration failed', { error: error.message, stack: error.stack, username: req.body.username, email: req.body.email });
      res.status(400).json({
        success: false,
        message: error instanceof Error ? error.message : 'Registration failed'
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
        message: 'Login successful',
        data: {
          user: userResponse,
          token
        }
      });
    } catch (error) {
      logger.error('User login failed', { error: error.message, stack: error.stack, username: req.body.username });
      res.status(401).json({
        success: false,
        message: error instanceof Error ? error.message : 'Login failed'
      });
    }
  }

  static async refreshToken(req, res) {
    try {
      const { token: oldToken } = req.body;

      if (!oldToken) {
        res.status(400).json({
          success: false,
          message: 'Token is required'
        });
        return;
      }

      const { token } = await AuthService.refreshToken(oldToken);

      res.json({
        success: true,
        message: 'Token refreshed successfully',
        data: { token }
      });
    } catch (error) {
      logger.error('Token refresh failed', { error: error.message, stack: error.stack });
      res.status(401).json({
        success: false,
        message: error instanceof Error ? error.message : 'Token refresh failed'
      });
    }
  }

  static async getProfile(req, res) {
    try {
      const user = await AuthService.getUserById(req.userId);
      
      if (!user) {
        res.status(404).json({
          success: false,
          message: 'User not found'
        });
        return;
      }

      // Don't send password hash
      const { passwordHash, ...userResponse } = user;

      res.json({
        success: true,
        data: { user: userResponse }
      });
    } catch (error) {
      logger.error('Failed to get user profile', { error: error.message, stack: error.stack, userId: req.userId });
      res.status(500).json({
        success: false,
        message: 'Failed to get profile'
      });
    }
  }

  static async updateProfile(req, res) {
    try {
      const updateData = req.body;

      const user = await AuthService.updateUser(req.userId, updateData);

      if (!user) {
        res.status(404).json({
          success: false,
          message: 'User not found'
        });
        return;
      }

      // Don't send password hash
      const { passwordHash, ...userResponse } = user;

      res.json({
        success: true,
        message: 'Profile updated successfully',
        data: { user: userResponse }
      });
    } catch (error) {
      logger.error('Profile update failed', { error: error.message, stack: error.stack, userId: req.userId });
      res.status(400).json({
        success: false,
        message: error instanceof Error ? error.message : 'Profile update failed'
      });
    }
  }

  static async updatePassword(req, res) {
    try {
      const { currentPassword, newPassword } = req.body;

      if (!currentPassword || !newPassword) {
        res.status(400).json({
          success: false,
          message: 'Current password and new password are required'
        });
        return;
      }

      await AuthService.updatePassword(req.userId, currentPassword, newPassword);

      res.json({
        success: true,
        message: 'Password updated successfully'
      });
    } catch (error) {
      logger.error('Password update failed', { error: error.message, stack: error.stack, userId: req.userId });
      res.status(400).json({
        success: false,
        message: error instanceof Error ? error.message : 'Password update failed'
      });
    }
  }

  static async deactivateAccount(req, res) {
    try {
      await AuthService.deactivateUser(req.userId);

      res.json({
        success: true,
        message: 'Account deactivated successfully'
      });
    } catch (error) {
      logger.error('Account deactivation failed', { error: error.message, stack: error.stack, userId: req.userId });
      res.status(500).json({
        success: false,
        message: 'Account deactivation failed'
      });
    }
  }

  static async logout(req, res) {
    // For JWT tokens, logout is handled client-side by removing the token
    // In a production environment, you might want to blacklist tokens
    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  }
}