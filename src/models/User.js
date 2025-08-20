import mongoose, { Schema } from 'mongoose';

const EmailAccountSchema = new Schema({
  id: { type: String, required: true },
  email: { type: String, required: true },
  provider: { type: String, enum: ['gmail', 'outlook', 'imap'], required: true },
  displayName: { type: String, required: true },
  config: { type: Schema.Types.Mixed, required: true },
  isActive: { type: Boolean, default: true },
  lastSyncAt: { type: Date },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const UserPreferencesSchema = new Schema({
  threadsEnabled: { type: Boolean, default: true },
  autoMarkAsRead: { type: Boolean, default: false },
  syncInterval: { type: Number, default: 300000 }, // 5 minutes
  displayDensity: { type: String, enum: ['comfortable', 'compact', 'cozy'], default: 'comfortable' },
  theme: { type: String, enum: ['light', 'dark', 'auto'], default: 'light' }
});

const UserSchema = new Schema({
  id: { type: String, unique: true, required: true },
  username: { type: String, unique: true, required: true },
  email: { type: String, unique: true, required: true },
  firstName: { type: String },
  lastName: { type: String },
  passwordHash: { type: String, required: true },
  emailAccounts: [EmailAccountSchema],
  preferences: { type: UserPreferencesSchema, default: {} },
  isActive: { type: Boolean, default: true },
  lastLoginAt: { type: Date },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

UserSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

UserSchema.methods.addEmailAccount = function(account) {
  const newAccount = {
    ...account,
    id: new mongoose.Types.ObjectId().toString(),
    createdAt: new Date(),
    updatedAt: new Date()
  };
  this.emailAccounts.push(newAccount);
  return newAccount;
};

UserSchema.methods.removeEmailAccount = function(accountId) {
  this.emailAccounts = this.emailAccounts.filter((account) => account.id !== accountId);
};

UserSchema.methods.getEmailAccount = function(accountId) {
  return this.emailAccounts.find((account) => account.id === accountId);
};

export const User = mongoose.model('User', UserSchema);