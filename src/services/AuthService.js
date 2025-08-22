import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { User } from '../models/User.js';
import { config } from '../config/index.js';

export class AuthService {
  static JWT_SECRET = config.JWT_SECRET;
  static JWT_EXPIRES_IN = config.JWT_EXPIRES_IN;

  static async register(userData) {
    // Check if user already exists
    const existingUser = await User.findOne({
      $or: [{ username: userData.username }, { email: userData.email }]
    });

    if (existingUser) {
      throw new Error('Username or email already exists');
    }

    // Hash password
    const saltRounds = 12;
    const passwordHash = await bcrypt.hash(userData.password, saltRounds);

    // Create user
    const userId = this.generateUserId();
    const user = new User({
      id: userId,
      username: userData.username,
      email: userData.email,
      firstName: userData.firstName,
      lastName: userData.lastName,
      passwordHash,
      emailAccounts: [],
      preferences: {
        threadsEnabled: true,
        autoMarkAsRead: false,
        syncInterval: 300000, // 5 minutes
        displayDensity: 'comfortable',
        theme: 'light'
      },
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    await user.save();

    // Generate token
    const token = this.generateToken(userId);

    return { user: user.toObject(), token };
  }

  static async login(username, password) {
    // Find user
    const user = await User.findOne({
      $or: [{ username }, { email: username }],
      isActive: true
    });

    if (!user) {
      throw new Error('Invalid credentials');
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.passwordHash);
    if (!isValidPassword) {
      throw new Error('Invalid credentials');
    }

    // Update last login
    user.lastLoginAt = new Date();
    await user.save();

    // Generate token
    const token = this.generateToken(user.id);

    return { user: user.toObject(), token };
  }

  static async refreshToken(oldToken) {
    try {
      const decoded = jwt.verify(oldToken, this.JWT_SECRET);
      
      const user = await User.findOne({ id: decoded.userId, isActive: true });
      if (!user) {
        throw new Error('User not found');
      }

      const token = this.generateToken(user.id);
      return { token };
    } catch (error) {
      throw new Error('Invalid or expired token');
    }
  }

  static async getUserById(userId) {
    const user = await User.findOne({ id: userId, isActive: true });
    return user ? user.toObject() : null;
  }

  static async updateUser(userId, updateData) {
    const allowedUpdates = ['firstName', 'lastName', 'preferences'];
    const updates = {};

    Object.keys(updateData).forEach(key => {
      if (allowedUpdates.includes(key)) {
        updates[key] = updateData[key];
      }
    });

    updates.updatedAt = new Date();

    const user = await User.findOneAndUpdate(
      { id: userId, isActive: true },
      { $set: updates },
      { new: true, runValidators: true }
    );

    return user ? user.toObject() : null;
  }

  static async updatePassword(userId, currentPassword, newPassword) {
    const user = await User.findOne({ id: userId, isActive: true });
    if (!user) {
      throw new Error('User not found');
    }

    // Verify current password
    const isValidPassword = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isValidPassword) {
      throw new Error('Invalid current password');
    }

    // Hash new password
    const saltRounds = 12;
    const passwordHash = await bcrypt.hash(newPassword, saltRounds);

    // Update password
    user.passwordHash = passwordHash;
    user.updatedAt = new Date();
    await user.save();
  }

  static async deactivateUser(userId) {
    await User.findOneAndUpdate(
      { id: userId },
      { 
        $set: { 
          isActive: false, 
          updatedAt: new Date() 
        } 
      }
    );
  }

  // Email Account Management
  static async addEmailAccount(userId, accountData) {
    const user = await User.findOne({ id: userId, isActive: true });
    if (!user) {
      throw new Error('User not found');
    }

    // Check if email account already exists
    const existingAccount = user.emailAccounts.find(
      (account) => account.email === accountData.email
    );

    if (existingAccount) {
      throw new Error('Email account already exists');
    }

    const newAccount = user.addEmailAccount(accountData);
    await user.save();

    return newAccount;
  }

  static async updateEmailAccount(userId, accountId, updateData) {
    const user = await User.findOne({ id: userId, isActive: true });
    if (!user) {
      throw new Error('User not found');
    }

    const accountIndex = user.emailAccounts.findIndex(
      (account) => account.id === accountId
    );

    if (accountIndex === -1) {
      throw new Error('Email account not found');
    }

    const allowedUpdates = ['displayName', 'isActive', 'config'];
    Object.keys(updateData).forEach(key => {
      if (allowedUpdates.includes(key) && updateData[key] !== undefined) {
        user.emailAccounts[accountIndex][key] = updateData[key];
      }
    });

    user.emailAccounts[accountIndex].updatedAt = new Date();
    user.updatedAt = new Date();
    
    await user.save();

    return user.emailAccounts[accountIndex];
  }

  static async removeEmailAccount(userId, accountId) {
    const user = await User.findOne({ id: userId, isActive: true });
    if (!user) {
      throw new Error('User not found');
    }

    user.removeEmailAccount(accountId);
    user.updatedAt = new Date();
    await user.save();
  }

  static async getEmailAccounts(userId) {
    const user = await User.findOne({ id: userId, isActive: true });
    if (!user) {
      throw new Error('User not found');
    }

    const accounts = user.emailAccounts.filter((account) => account.isActive);
    return accounts;
  }

  static async getEmailAccount(userId, accountId) {
    const user = await User.findOne({ id: userId, isActive: true });
    if (!user) {
      return null;
    }

    return user.getEmailAccount(accountId) || null;
  }

  static generateToken(userId) {
    return jwt.sign(
      { userId, type: 'access' },
      this.JWT_SECRET,
      { expiresIn: this.JWT_EXPIRES_IN }
    );
  }

  static generateUserId() {
    return `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Utility methods for token validation
  static verifyToken(token) {
    try {
      const decoded = jwt.verify(token, this.JWT_SECRET);
      return { userId: decoded.userId, type: decoded.type };
    } catch (error) {
      return null;
    }
  }

  static async validateUserSession(token) {
    const decoded = this.verifyToken(token);
    if (!decoded) {
      return null;
    }

    return this.getUserById(decoded.userId);
  }
}