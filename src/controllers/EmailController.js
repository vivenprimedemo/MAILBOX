// Import dependencies
import { EmailService } from '../services/EmailService.js';
import { AuthService } from '../services/AuthService.js';
import { logger } from '../config/logger.js';
import { EmailConfig } from '../models/Email.js';

export class EmailController {
  static emailService = new EmailService();

  static async getFolders(req, res) {
    try {
      const { accountId } = req.params;

      const result = await EmailController.emailService.getFolders(accountId, req.userId);

      res.json({
        success: true,
        data: result.data || result,
        error: null,
        metadata: result.metadata || {
          timestamp: new Date()
        }
      });
    } catch (error) {
      logger.error('Failed to get folders', { error: error.message, stack: error.stack, accountId: req.params.accountId });
      res.status(500).json({
        success: false,
        data: null,
        error: {
          code: 'FETCH_FOLDERS_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get folders',
          provider: '',
          timestamp: new Date()
        },
        metadata: {}
      });
    }
  }

  static async getEmails(req, res) {
    try {
      const { accountId, folder } = req.params;
      const { limit, offset, useCache } = req.query;

      const result = await EmailController.emailService.getEmails(
        accountId,
        req.userId,
        {
          folderId: folder,
          limit: limit ? parseInt(limit) : undefined,
          offset: offset ? parseInt(offset) : undefined
        },
        useCache !== 'false'
      );

      res.json({
        success: true,
        data: result.data || result,
        error: null,
        metadata: result.metadata || {
          timestamp: new Date()
        }
      });
    } catch (error) {
      logger.error('Failed to get emails', { error: error.message, stack: error.stack, accountId: req.params.accountId, folder: req.params.folder });

      const errorCode = error.code || 'FETCH_EMAILS_ERROR';
      const statusCode = errorCode === 'PROVIDER_INITIALIZATION_FAILED' ? 422 : 500;

      res.status(statusCode).json({
        success: false,
        data: null,
        error: {
          code: errorCode,
          message: error instanceof Error ? error.message : 'Failed to get emails',
          provider: '',
          timestamp: new Date()
        },
        metadata: {}
      });
    }
  }

  static async getEmail(req, res) {
    try {
      const { accountId, messageId } = req.params;
      const { folder } = req.query;

      const result = await EmailController.emailService.getEmail(
        accountId,
        messageId,
        folder,
        req.userId
      );

      if (!result || (!result.data && !result.success)) {
        res.status(404).json({
          success: false,
          error: {
            code: 'EMAIL_NOT_FOUND',
            message: 'Email not found',
            provider: '',
            timestamp: new Date()
          },
          data: null,
          metadata: {}
        });
        return;
      }

      res.json({
        success: true,
        data: result.data || result,
        error: null,
        metadata: result.metadata || {
          timestamp: new Date()
        }
      });
    } catch (error) {
      logger.error('Failed to get email', { error: error.message, stack: error.stack, accountId: req.params.accountId, messageId: req.params.messageId });
      res.status(500).json({
        success: false,
        data: null,
        error: {
          code: 'FETCH_EMAIL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get email',
          provider: '',
          timestamp: new Date()
        },
        metadata: {}
      });
    }
  }

  static async getThreads(req, res) {
    try {
      const { accountId, folder } = req.params;
      const { limit, offset } = req.query;

      const result = await EmailController.emailService.getThreads(
        accountId,
        req.userId,
        folder,
        limit ? parseInt(limit) : undefined,
        offset ? parseInt(offset) : undefined
      );

      res.json({
        success: true,
        data: result.data || result,
        error: null,
        metadata: result.metadata || {
          timestamp: new Date()
        }
      });
    } catch (error) {
      logger.error('Failed to get threads', { error: error.message, stack: error.stack, accountId: req.params.accountId, folder: req.params.folder });
      res.status(500).json({
        success: false,
        data: null,
        error: {
          code: 'FETCH_THREADS_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get threads',
          provider: '',
          timestamp: new Date()
        },
        metadata: {}
      });
    }
  }

  static async getThread(req, res) {
    try {
      const { accountId, threadId } = req.params;

      const result = await EmailController.emailService.getThread(accountId, threadId, req.userId);
      if (!result) {
        res.status(404).json({
          success: false,
          error: {
            code: 'THREAD_NOT_FOUND',
            message: 'Thread not found',
            provider: '',
            timestamp: new Date()
          },
          data: null,
          metadata: {}
        });
        return;
      }

      res.json({
        success: true,
        data: result.data || result,
        error: null,
        metadata: result.metadata || {
          timestamp: new Date()
        }
      });
    } catch (error) {
      logger.error('Failed to get thread', { error: error.message, stack: error.stack, accountId: req.params.accountId, threadId: req.params.threadId });
      res.status(500).json({
        success: false,
        data: null,
        error: {
          code: 'FETCH_THREAD_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get thread',
          provider: '',
          timestamp: new Date()
        },
        metadata: {}
      });
    }
  }

  static async searchEmails(req, res) {
    try {
      const { accountId } = req.params;
      const searchQuery = req.query;

      // Convert date strings to Date objects
      if (searchQuery.dateStart) {
        searchQuery.dateRange = {
          start: new Date(searchQuery.dateStart),
          end: searchQuery.dateEnd ? new Date(searchQuery.dateEnd) : new Date()
        };
        delete searchQuery.dateStart;
        delete searchQuery.dateEnd;
      }

      const result = await EmailController.emailService.searchEmails(
        accountId,
        req.userId,
        searchQuery
      );

      res.json({
        success: true,
        data: result.data || result,
        error: null,
        metadata: result.metadata || {
          timestamp: new Date()
        }
      });
    } catch (error) {
      logger.error('Search emails failed', { error: error.message, stack: error.stack, accountId: req.params.accountId, searchQuery: req.query });
      res.status(500).json({
        success: false,
        data: null,
        error: {
          code: 'SEARCH_EMAILS_ERROR',
          message: error instanceof Error ? error.message : 'Search failed',
          provider: '',
          timestamp: new Date()
        },
        metadata: {}
      });
    }
  }

  static async listEmails(req, res) {
    try {
      const { accountId } = req.params;
      const {
        folderId = 'INBOX',
        limit = 50,
        offset = 0,
        sortBy = 'date',
        sortOrder = 'desc',
        search = '',
        isUnread,
        isFlagged,
        hasAttachment,
        from,
        to,
        subject,
        dateFrom,
        dateTo,
        useCache = true
      } = req.query;

      // Parse boolean query parameters
      const filters = {};
      if (isUnread !== undefined) filters.isUnread = isUnread === 'true';
      if (isFlagged !== undefined) filters.isFlagged = isFlagged === 'true';
      if (hasAttachment !== undefined) filters.hasAttachment = hasAttachment === 'true';
      if (from) filters.from = from;
      if (to) filters.to = to;
      if (subject) filters.subject = subject;
      if (dateFrom) filters.dateFrom = dateFrom;
      if (dateTo) filters.dateTo = dateTo;

      const options = {
        folderId,
        limit: parseInt(limit),
        offset: parseInt(offset),
        sortBy,
        sortOrder,
        search,
        filters,
        useCache: useCache !== 'false'
      };

      const result = await EmailController.emailService.listEmails(
        accountId,
        req.userId,
        options
      );

      res.json({
        success: true,
        data: result.data || result,
        error: null,
        metadata: result.metadata || {
          timestamp: new Date()
        }
      });
    } catch (error) {
      logger.error('Failed to list emails', {
        error: error.message,
        stack: error.stack,
        accountId: req.params.accountId,
        query: req.query
      });
      res.status(500).json({
        success: false,
        data: null,
        error: {
          code: 'LIST_EMAILS_ERROR',
          message: error instanceof Error ? error.message : 'Failed to list emails',
          provider: '',
          timestamp: new Date()
        },
        metadata: {}
      });
    }
  }

  static async listEmailsV2(req, res) {
    try {
      const { accountId } = req.params;
      const {
        folderId = 'INBOX',
        limit = 50,
        offset = 0,
        sortBy = 'date',
        sortOrder = 'desc',
        search = '',
        isUnread,
        isFlagged,
        hasAttachment,
        from,
        to,
        subject,
        dateFrom,
        dateTo,
        useCache = true,
        nextPage
      } = req.query;

      // Parse boolean query parameters
      const filters = {};
      if (isUnread !== undefined) filters.isUnread = isUnread === 'true';
      if (isFlagged !== undefined) filters.isFlagged = isFlagged === 'true';
      if (hasAttachment !== undefined) filters.hasAttachment = hasAttachment === 'true';
      if (from) filters.from = from;
      if (to) filters.to = to;
      if (subject) filters.subject = subject;
      if (dateFrom) filters.dateFrom = dateFrom;
      if (dateTo) filters.dateTo = dateTo;

      const options = {
        folderId,
        limit: parseInt(limit),
        offset: parseInt(offset),
        sortBy,
        sortOrder,
        search,
        filters,
        useCache: useCache !== 'false',
        nextPage
      };

      const result = await EmailController.emailService.listEmailsV2(
        accountId,
        req.userId,
        options
      );

      res.json({
        success: true,
        data: result.data ? {
          emails: result.data,
          metadata: result.metadata
        } : result,
        error: null,
        metadata: result.metadata || {
          timestamp: new Date()
        }
      });
    } catch (error) {
      logger.error('Failed to list emails', {
        error: error.message,
        stack: error.stack,
        accountId: req.params.accountId,
        query: req.query
      });
      res.status(500).json({
        success: false,
        data: null,
        error: {
          code: 'LIST_EMAILS_ERROR',
          message: error instanceof Error ? error.message : 'Failed to list emails',
          provider: '',
          timestamp: new Date()
        },
        metadata: {}
      });
    }
  }

  static async markAsRead(req, res) {
    try {
      const { accountId } = req.params;
      const { messageIds, folder } = req.body;

      const result = await EmailController.emailService.markAsRead(accountId, { messageIds, folderId: folder }, req.userId);

      res.json({
        success: true,
        data: result.data || result,
        error: null,
        metadata: result.metadata || {
          timestamp: new Date()
        }
      });
    } catch (error) {
      logger.error('Failed to mark emails as read', { error: error.message, stack: error.stack, accountId: req.params.accountId, messageIds: req.body.messageIds });
      res.status(500).json({
        success: false,
        data: null,
        error: {
          code: 'MARK_READ_ERROR',
          message: error instanceof Error ? error.message : 'Failed to mark emails as read',
          provider: '',
          timestamp: new Date()
        },
        metadata: {}
      });
    }
  }

  static async markAsUnread(req, res) {
    try {
      const { accountId } = req.params;
      const { messageIds, folder } = req.body;

      const result = await EmailController.emailService.markAsUnread(accountId, { messageIds, folderId: folder }, req.userId);

      res.json({
        success: true,
        data: result.data || result,
        error: null,
        metadata: result.metadata || {
          timestamp: new Date()
        }
      });
    } catch (error) {
      logger.error('Failed to mark emails as unread', { error: error.message, stack: error.stack, accountId: req.params.accountId, messageIds: req.body.messageIds });
      res.status(500).json({
        success: false,
        data: null,
        error: {
          code: 'MARK_UNREAD_ERROR',
          message: error instanceof Error ? error.message : 'Failed to mark emails as unread',
          provider: '',
          timestamp: new Date()
        },
        metadata: {}
      });
    }
  }

  static async markAsFlagged(req, res) {
    try {
      const { accountId } = req.params;
      const { messageIds, folder } = req.body;

      const result = await EmailController.emailService.markAsFlagged(accountId, { messageIds, folderId: folder }, req.userId);

      res.json({
        success: true,
        data: result.data || result,
        error: null,
        metadata: result.metadata || {
          timestamp: new Date()
        }
      });
    } catch (error) {
      logger.error('Failed to flag emails', { error: error.message, stack: error.stack, accountId: req.params.accountId, messageIds: req.body.messageIds });
      res.status(500).json({
        success: false,
        data: null,
        error: {
          code: 'MARK_FLAGGED_ERROR',
          message: error instanceof Error ? error.message : 'Failed to flag emails',
          provider: '',
          timestamp: new Date()
        },
        metadata: {}
      });
    }
  }

  static async markAsUnflagged(req, res) {
    try {
      const { accountId } = req.params;
      const { messageIds, folder } = req.body;

      const result = await EmailController.emailService.markAsUnflagged(accountId, { messageIds, folderId: folder }, req.userId);

      res.json({
        success: true,
        data: result.data || result,
        error: null,
        metadata: result.metadata || {
          timestamp: new Date()
        }
      });
    } catch (error) {
      logger.error('Failed to unflag emails', { error: error.message, stack: error.stack, accountId: req.params.accountId, messageIds: req.body.messageIds });
      res.status(500).json({
        success: false,
        data: null,
        error: {
          code: 'MARK_UNFLAGGED_ERROR',
          message: error instanceof Error ? error.message : 'Failed to unflag emails',
          provider: '',
          timestamp: new Date()
        },
        metadata: {}
      });
    }
  }

  static async deleteEmails(req, res) {
    try {
      const { accountId } = req.params;
      const { messageIds, folder } = req.body;

      const result = await EmailController.emailService.deleteEmails(accountId, messageIds, folder, req.userId);

      res.json({
        success: true,
        data: result.data || result,
        error: null,
        metadata: result.metadata || {
          timestamp: new Date()
        }
      });
    } catch (error) {
      logger.error('Failed to delete emails', { error: error.message, stack: error.stack, accountId: req.params.accountId, messageIds: req.body.messageIds });
      res.status(500).json({
        success: false,
        data: null,
        error: {
          code: 'DELETE_EMAILS_ERROR',
          message: error instanceof Error ? error.message : 'Failed to delete emails',
          provider: '',
          timestamp: new Date()
        },
        metadata: {}
      });
    }
  }

  static async moveEmails(req, res) {
    try {
      const { accountId } = req.params;
      const { messageIds, fromFolder, toFolder } = req.body;

      const result = await EmailController.emailService.moveEmails(accountId, messageIds, fromFolder, toFolder, req.userId);

      res.json({
        success: true,
        data: result.data || result,
        error: null,
        metadata: result.metadata || {
          timestamp: new Date()
        }
      });
    } catch (error) {
      logger.error('Failed to move emails', { error: error.message, stack: error.stack, accountId: req.params.accountId, messageIds: req.body.messageIds, fromFolder: req.body.fromFolder, toFolder: req.body.toFolder });
      res.status(500).json({
        success: false,
        data: null,
        error: {
          code: 'MOVE_EMAILS_ERROR',
          message: error instanceof Error ? error.message : 'Failed to move emails',
          provider: '',
          timestamp: new Date()
        },
        metadata: {}
      });
    }
  }

  static async sendEmail(req, res) {
    try {
      const { accountId } = req.params;
      const emailOptions = req.body;

      const result = await EmailController.emailService.sendEmail(accountId, emailOptions, req.userId);
      console.log(result)

      res.status(201).json({
        success: true,
        data: result,
        error: null,
        metadata: {
          timestamp: new Date()
        }
      });
    } catch (error) {
      logger.error('Failed to send email', { error: error.message, stack: error.stack, accountId: req.params.accountId });
      res.status(500).json({
        success: false,
        data: null,
        error: {
          code: 'SEND_EMAIL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to send email',
          provider: '',
          timestamp: new Date()
        },
        metadata: {}
      });
    }
  }

  static async replyToEmail(req, res) {
    try {
      const { accountId, messageId } = req.params;
      const replyOptions = req.body;

      const result = await EmailController.emailService.replyToEmail(
        accountId,
        messageId,
        replyOptions,
        req.userId
      );

      res.status(201).json({
        success: true,
        data: result,
        error: null,
        metadata: {
          timestamp: new Date()
        }
      });
    } catch (error) {
      logger.error('Failed to send reply', { error: error.message, stack: error.stack, accountId: req.params.accountId, messageId: req.params.messageId });
      res.status(500).json({
        success: false,
        data: null,
        error: {
          code: 'REPLY_EMAIL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to send reply',
          provider: '',
          timestamp: new Date()
        },
        metadata: {}
      });
    }
  }

  static async forwardEmail(req, res) {
    try {
      const { accountId, messageId } = req.params;
      const { to, message } = req.body;

      const result = await EmailController.emailService.forwardEmail(
        accountId,
        messageId,
        to,
        message,
        req.userId
      );

      res.status(201).json({
        success: true,
        data: result,
        error: null,
        metadata: {
          timestamp: new Date()
        }
      });
    } catch (error) {
      logger.error('Failed to forward email', { error: error.message, stack: error.stack, accountId: req.params.accountId, messageId: req.params.messageId });
      res.status(500).json({
        success: false,
        data: null,
        error: {
          code: 'FORWARD_EMAIL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to forward email',
          provider: '',
          timestamp: new Date()
        },
        metadata: {}
      });
    }
  }

  static async syncAccount(req, res) {
    try {
      const { accountId } = req.params;

      await EmailController.emailService.syncAccount(accountId, req.userId);

      res.json({
        success: true,
        data: { synced: true },
        error: null,
        metadata: {
          timestamp: new Date()
        }
      });
    } catch (error) {
      logger.error('Failed to sync account', { error: error.message, stack: error.stack, accountId: req.params.accountId, userId: req.userId });
      res.status(500).json({
        success: false,
        data: null,
        error: {
          code: 'SYNC_ACCOUNT_ERROR',
          message: error instanceof Error ? error.message : 'Failed to sync account',
          provider: '',
          timestamp: new Date()
        },
        metadata: {}
      });
    }
  }

  // Email Account Management
  static async getEmailAccounts(req, res) {
    try {
      // const accounts = await AuthService.getEmailAccounts(req.userId);
      const accounts = await EmailConfig.find({ user_id: req.params.userId }).select('-__v -oauth_config -smtp_config -imap_config');

      res.json({
        success: true,
        data: { accounts },
        error: null,
        metadata: {
          timestamp: new Date()
        }
      });
    } catch (error) {
      logger.error('Failed to get email accounts', { error: error.message, stack: error.stack, userId: req.userId });
      res.status(500).json({
        success: false,
        data: null,
        error: {
          code: 'GET_ACCOUNTS_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get email accounts',
          provider: '',
          timestamp: new Date()
        },
        metadata: {}
      });
    }
  }

  static async addEmailAccount(req, res) {
    try {
      const accountData = req.body;

      const newAccount = await AuthService.addEmailAccount(req.userId, accountData);

      // Try to connect to the email provider
      const connected = await EmailController.emailService.connectProvider(
        newAccount.id,
        accountData.config
      );

      if (!connected) {
        // Remove the account if connection failed
        await AuthService.removeEmailAccount(req.userId, newAccount.id);

        res.status(400).json({
          success: false,
          data: null,
          error: {
            code: 'PROVIDER_CONNECTION_FAILED',
            message: 'Failed to connect to email provider. Please check your credentials.',
            provider: accountData.type || '',
            timestamp: new Date()
          },
          metadata: {}
        });
        return;
      }

      res.status(201).json({
        success: true,
        data: newAccount,
        error: null,
        metadata: {
          provider: newAccount.provider,
          timestamp: new Date()
        }
      });
    } catch (error) {
      logger.error('Failed to add email account', { error: error.message, stack: error.stack, userId: req.userId });
      res.status(400).json({
        success: false,
        data: null,
        error: {
          code: 'ADD_ACCOUNT_ERROR',
          message: error instanceof Error ? error.message : 'Failed to add email account',
          provider: '',
          timestamp: new Date()
        },
        metadata: {}
      });
    }
  }

  static async updateEmailAccount(req, res) {
    try {
      const { accountId } = req.params;
      const updateData = req.body;

      const updatedAccount = await AuthService.updateEmailAccount(
        req.userId,
        accountId,
        updateData
      );

      if (!updatedAccount) {
        res.status(404).json({
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
        return;
      }

      res.json({
        success: true,
        data: updatedAccount,
        error: null,
        metadata: {
          provider: updatedAccount.provider,
          timestamp: new Date()
        }
      });
    } catch (error) {
      logger.error('Failed to update email account', { error: error.message, stack: error.stack, accountId: req.params.accountId, userId: req.userId });
      res.status(400).json({
        success: false,
        data: null,
        error: {
          code: 'UPDATE_ACCOUNT_ERROR',
          message: error instanceof Error ? error.message : 'Failed to update email account',
          provider: '',
          timestamp: new Date()
        },
        metadata: {}
      });
    }
  }

  static async removeEmailAccount(req, res) {
    try {
      const { accountId } = req.params;

      // Remove provider connection
      await EmailController.emailService.removeProvider(accountId);

      // Remove account from user
      await AuthService.removeEmailAccount(req.userId, accountId);

      res.json({
        success: true,
        data: { removed: true },
        error: null,
        metadata: {
          timestamp: new Date()
        }
      });
    } catch (error) {
      logger.error('Failed to remove email account', { error: error.message, stack: error.stack, accountId: req.params.accountId, userId: req.userId });
      res.status(500).json({
        success: false,
        data: null,
        error: {
          code: 'REMOVE_ACCOUNT_ERROR',
          message: error instanceof Error ? error.message : 'Failed to remove email account',
          provider: '',
          timestamp: new Date()
        },
        metadata: {}
      });
    }
  }

  static async getAttachment(req, res) {
    try {
      const { accountId, messageId, attachmentId } = req.params;

      const result = await EmailController.emailService.getAttachment(
        accountId,
        messageId,
        attachmentId,
        req.userId
      );

      if (!result) {
        res.status(404).json({
          success: false,
          error: {
            code: 'ATTACHMENT_NOT_FOUND',
            message: 'Attachment not found',
            provider: '',
            timestamp: new Date()
          },
          data: null,
          metadata: {}
        });
        return;
      }

      // Set appropriate headers for file download
      res.setHeader('Content-Type', result.contentType || 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
      res.setHeader('Content-Length', result.size || result.data.length);

      // Send the binary data
      res.send(result.data);
    } catch (error) {
      logger.error('Failed to get attachment', {
        error: error.message,
        stack: error.stack,
        accountId: req.params.accountId,
        messageId: req.params.messageId,
        attachmentId: req.params.attachmentId
      });

      const errorCode = error.code || 'FETCH_ATTACHMENT_ERROR';
      const statusCode = errorCode === 'PROVIDER_INITIALIZATION_FAILED' ? 422 : 500;

      res.status(statusCode).json({
        success: false,
        data: null,
        error: {
          code: errorCode,
          message: error instanceof Error ? error.message : 'Failed to get attachment',
          provider: '',
          timestamp: new Date()
        },
        metadata: {}
      });
    }
  }
}