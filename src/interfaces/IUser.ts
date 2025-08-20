export interface IEmailAccount {
  id: string;
  email: string;
  provider: 'gmail' | 'outlook' | 'imap';
  displayName: string;
  config: any;
  isActive: boolean;
  lastSyncAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface IUser {
  id: string;
  username: string;
  email: string;
  firstName?: string;
  lastName?: string;
  passwordHash: string;
  emailAccounts: IEmailAccount[];
  preferences: {
    threadsEnabled: boolean;
    autoMarkAsRead: boolean;
    syncInterval: number;
    displayDensity: 'comfortable' | 'compact' | 'cozy';
    theme: 'light' | 'dark' | 'auto';
  };
  isActive: boolean;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface IAuthToken {
  userId: string;
  token: string;
  type: 'access' | 'refresh';
  expiresAt: Date;
  createdAt: Date;
}