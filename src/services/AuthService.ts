import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { User } from '../models/User';
import { IUser, IEmailAccount } from '../interfaces/IUser';

export class AuthService {
  private static readonly JWT_SECRET = process.env.JWT_SECRET!;
  private static readonly JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

  static async register(userData: {
    username: string;
    email: string;
    password: string;
    firstName?: string;
    lastName?: string;
  }): Promise<{ user: IUser; token: string }> {
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

  static async login(username: string, password: string): Promise<{ user: IUser; token: string }> {
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

  static async refreshToken(oldToken: string): Promise<{ token: string }> {
    try {
      const decoded = jwt.verify(oldToken, this.JWT_SECRET) as any;
      
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

  static async getUserById(userId: string): Promise<IUser | null> {
    const user = await User.findOne({ id: userId, isActive: true });
    return user ? user.toObject() : null;
  }

  static async updateUser(userId: string, updateData: Partial<IUser>): Promise<IUser | null> {
    const allowedUpdates = ['firstName', 'lastName', 'preferences'];
    const updates: any = {};

    Object.keys(updateData).forEach(key => {
      if (allowedUpdates.includes(key)) {
        updates[key] = updateData[key as keyof IUser];
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

  static async updatePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
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

  static async deactivateUser(userId: string): Promise<void> {
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
  static async addEmailAccount(
    userId: string, 
    accountData: Omit<IEmailAccount, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<IEmailAccount> {
    const user = await User.findOne({ id: userId, isActive: true });
    if (!user) {
      throw new Error('User not found');
    }

    // Check if email account already exists
    const existingAccount = user.emailAccounts.find(
      (account: IEmailAccount) => account.email === accountData.email
    );

    if (existingAccount) {
      throw new Error('Email account already exists');
    }

    const newAccount = user.addEmailAccount(accountData);
    await user.save();

    return newAccount;
  }

  static async updateEmailAccount(
    userId: string, 
    accountId: string, 
    updateData: Partial<IEmailAccount>
  ): Promise<IEmailAccount | null> {
    const user = await User.findOne({ id: userId, isActive: true });
    if (!user) {
      throw new Error('User not found');
    }

    const accountIndex = user.emailAccounts.findIndex(
      (account: IEmailAccount) => account.id === accountId
    );

    if (accountIndex === -1) {
      throw new Error('Email account not found');
    }

    const allowedUpdates = ['displayName', 'isActive', 'config'];
    Object.keys(updateData).forEach(key => {
      if (allowedUpdates.includes(key) && updateData[key as keyof IEmailAccount] !== undefined) {
        (user.emailAccounts[accountIndex] as any)[key] = updateData[key as keyof IEmailAccount];
      }
    });

    user.emailAccounts[accountIndex].updatedAt = new Date();
    user.updatedAt = new Date();
    
    await user.save();

    return user.emailAccounts[accountIndex];
  }

  static async removeEmailAccount(userId: string, accountId: string): Promise<void> {
    const user = await User.findOne({ id: userId, isActive: true });
    if (!user) {
      throw new Error('User not found');
    }

    user.removeEmailAccount(accountId);
    user.updatedAt = new Date();
    await user.save();
  }

  static async getEmailAccounts(userId: string): Promise<IEmailAccount[]> {
    const user = await User.findOne({ id: userId, isActive: true });
    if (!user) {
      throw new Error('User not found');
    }

    return user.emailAccounts.filter((account: IEmailAccount) => account.isActive);
  }

  static async getEmailAccount(userId: string, accountId: string): Promise<IEmailAccount | null> {
    const user = await User.findOne({ id: userId, isActive: true });
    if (!user) {
      return null;
    }

    return user.getEmailAccount(accountId) || null;
  }

  private static generateToken(userId: string): string {
    return jwt.sign(
      { userId, type: 'access' },
      this.JWT_SECRET,
      { expiresIn: this.JWT_EXPIRES_IN }
    );
  }

  private static generateUserId(): string {
    return `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Utility methods for token validation
  static verifyToken(token: string): { userId: string; type: string } | null {
    try {
      const decoded = jwt.verify(token, this.JWT_SECRET) as any;
      return { userId: decoded.userId, type: decoded.type };
    } catch (error) {
      return null;
    }
  }

  static async validateUserSession(token: string): Promise<IUser | null> {
    const decoded = this.verifyToken(token);
    if (!decoded) {
      return null;
    }

    return this.getUserById(decoded.userId);
  }
}