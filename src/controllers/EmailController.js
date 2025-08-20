// Import dependencies
import { EmailService } from '../services/EmailService.js';
import { AuthService } from '../services/AuthService.js';
import { logger } from '../config/logger.js';

export class EmailController {
  static emailService = new EmailService();

  static async getFolders(req, res) {
    try {
      const { accountId } = req.params;

      const folders = await EmailController.emailService.getFolders(accountId);

      res.json({
        success: true,
        data: { folders }
      });
    } catch (error) {
      logger.error('Failed to get folders', { error: error.message, stack: error.stack, accountId: req.params.accountId });
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to get folders'
      });
    }
  }

  static async getEmails(req, res) {
    try {
      const { accountId, folder } = req.params;
      const { limit, offset, useCache } = req.query;

      const emails = await EmailController.emailService.getEmails(
        accountId,
        req.userId,
        folder,
        limit ? parseInt(limit) : undefined,
        offset ? parseInt(offset) : undefined,
        useCache !== 'false'
      );

      res.json({
        success: true,
        data: { emails, count: emails.length }
      });
    } catch (error) {
      logger.error('Failed to get emails', { error: error.message, stack: error.stack, accountId: req.params.accountId, folder: req.params.folder });
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to get emails'
      });
    }
  }

  static async getEmail(req, res) {
    try {
      const { accountId, messageId } = req.params;
      const { folder } = req.query;

      const email = await EmailController.emailService.getEmail(
        accountId, 
        messageId, 
        folder
      );

      if (!email) {
        res.status(404).json({
          success: false,
          message: 'Email not found'
        });
        return;
      }

      res.json({
        success: true,
        data: { email }
      });
    } catch (error) {
      logger.error('Failed to get email', { error: error.message, stack: error.stack, accountId: req.params.accountId, messageId: req.params.messageId });
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to get email'
      });
    }
  }

  static async getThreads(req, res) {
    try {
      const { accountId, folder } = req.params;
      const { limit, offset } = req.query;

      const threads = await EmailController.emailService.getThreads(
        accountId,
        req.userId,
        folder,
        limit ? parseInt(limit) : undefined,
        offset ? parseInt(offset) : undefined
      );

      res.json({
        success: true,
        data: { threads, count: threads.length }
      });
    } catch (error) {
      logger.error('Failed to get threads', { error: error.message, stack: error.stack, accountId: req.params.accountId, folder: req.params.folder });
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to get threads'
      });
    }
  }

  static async getThread(req, res) {
    try {
      const { accountId, threadId } = req.params;

      const thread = await EmailController.emailService.getThread(accountId, threadId);

      if (!thread) {
        res.status(404).json({
          success: false,
          message: 'Thread not found'
        });
        return;
      }

      res.json({
        success: true,
        data: { thread }
      });
    } catch (error) {
      logger.error('Failed to get thread', { error: error.message, stack: error.stack, accountId: req.params.accountId, threadId: req.params.threadId });
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to get thread'
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

      const emails = await EmailController.emailService.searchEmails(
        accountId,
        req.userId,
        searchQuery
      );

      res.json({
        success: true,
        data: { emails, count: emails.length }
      });
    } catch (error) {
      logger.error('Search emails failed', { error: error.message, stack: error.stack, accountId: req.params.accountId, searchQuery: req.query });
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Search failed'
      });
    }
  }

  static async markAsRead(req, res) {
    try {
      const { accountId } = req.params;
      const { messageIds, folder } = req.body;

      await EmailController.emailService.markAsRead(accountId, messageIds, folder);

      res.json({
        success: true,
        message: 'Emails marked as read'
      });
    } catch (error) {
      logger.error('Failed to mark emails as read', { error: error.message, stack: error.stack, accountId: req.params.accountId, messageIds: req.body.messageIds });
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to mark emails as read'
      });
    }
  }

  static async markAsUnread(req, res) {
    try {
      const { accountId } = req.params;
      const { messageIds, folder } = req.body;

      await EmailController.emailService.markAsUnread(accountId, messageIds, folder);

      res.json({
        success: true,
        message: 'Emails marked as unread'
      });
    } catch (error) {
      logger.error('Failed to mark emails as unread', { error: error.message, stack: error.stack, accountId: req.params.accountId, messageIds: req.body.messageIds });
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to mark emails as unread'
      });
    }
  }

  static async markAsFlagged(req, res) {
    try {
      const { accountId } = req.params;
      const { messageIds, folder } = req.body;

      await EmailController.emailService.markAsFlagged(accountId, messageIds, folder);

      res.json({
        success: true,
        message: 'Emails flagged'
      });
    } catch (error) {
      logger.error('Failed to flag emails', { error: error.message, stack: error.stack, accountId: req.params.accountId, messageIds: req.body.messageIds });
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to flag emails'
      });
    }
  }

  static async markAsUnflagged(req, res) {
    try {
      const { accountId } = req.params;
      const { messageIds, folder } = req.body;

      await EmailController.emailService.markAsUnflagged(accountId, messageIds, folder);

      res.json({
        success: true,
        message: 'Emails unflagged'
      });
    } catch (error) {
      logger.error('Failed to unflag emails', { error: error.message, stack: error.stack, accountId: req.params.accountId, messageIds: req.body.messageIds });
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to unflag emails'
      });
    }
  }

  static async deleteEmails(req, res) {
    try {
      const { accountId } = req.params;
      const { messageIds, folder } = req.body;

      await EmailController.emailService.deleteEmails(accountId, messageIds, folder);

      res.json({
        success: true,
        message: 'Emails deleted'
      });
    } catch (error) {
      logger.error('Failed to delete emails', { error: error.message, stack: error.stack, accountId: req.params.accountId, messageIds: req.body.messageIds });
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to delete emails'
      });
    }
  }

  static async moveEmails(req, res) {
    try {
      const { accountId } = req.params;
      const { messageIds, fromFolder, toFolder } = req.body;

      await EmailController.emailService.moveEmails(accountId, messageIds, fromFolder, toFolder);

      res.json({
        success: true,
        message: 'Emails moved'
      });
    } catch (error) {
      logger.error('Failed to move emails', { error: error.message, stack: error.stack, accountId: req.params.accountId, messageIds: req.body.messageIds, fromFolder: req.body.fromFolder, toFolder: req.body.toFolder });
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to move emails'
      });
    }
  }

  static async sendEmail(req, res) {
    try {
      const { accountId } = req.params;
      const emailOptions = req.body;

      const messageId = await EmailController.emailService.sendEmail(accountId, emailOptions);

      res.status(201).json({
        success: true,
        message: 'Email sent successfully',
        data: { messageId }
      });
    } catch (error) {
      logger.error('Failed to send email', { error: error.message, stack: error.stack, accountId: req.params.accountId });
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to send email'
      });
    }
  }

  static async replyToEmail(req, res) {
    try {
      const { accountId, messageId } = req.params;
      const replyOptions = req.body;

      const newMessageId = await EmailController.emailService.replyToEmail(
        accountId, 
        messageId, 
        replyOptions
      );

      res.status(201).json({
        success: true,
        message: 'Reply sent successfully',
        data: { messageId: newMessageId }
      });
    } catch (error) {
      logger.error('Failed to send reply', { error: error.message, stack: error.stack, accountId: req.params.accountId, messageId: req.params.messageId });
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to send reply'
      });
    }
  }

  static async forwardEmail(req, res) {
    try {
      const { accountId, messageId } = req.params;
      const { to, message } = req.body;

      const newMessageId = await EmailController.emailService.forwardEmail(
        accountId, 
        messageId, 
        to, 
        message
      );

      res.status(201).json({
        success: true,
        message: 'Email forwarded successfully',
        data: { messageId: newMessageId }
      });
    } catch (error) {
      logger.error('Failed to forward email', { error: error.message, stack: error.stack, accountId: req.params.accountId, messageId: req.params.messageId });
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to forward email'
      });
    }
  }

  static async syncAccount(req, res) {
    try {
      const { accountId } = req.params;

      await EmailController.emailService.syncAccount(accountId, req.userId);

      res.json({
        success: true,
        message: 'Account synced successfully'
      });
    } catch (error) {
      logger.error('Failed to sync account', { error: error.message, stack: error.stack, accountId: req.params.accountId, userId: req.userId });
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to sync account'
      });
    }
  }

  // Email Account Management
  static async getEmailAccounts(req, res) {
    try {
      const accounts = await AuthService.getEmailAccounts(req.userId);

      res.json({
        success: true,
        data: { accounts }
      });
    } catch (error) {
      logger.error('Failed to get email accounts', { error: error.message, stack: error.stack, userId: req.userId });
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to get email accounts'
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
          message: 'Failed to connect to email provider. Please check your credentials.'
        });
        return;
      }

      res.status(201).json({
        success: true,
        message: 'Email account added successfully',
        data: { account: newAccount }
      });
    } catch (error) {
      logger.error('Failed to add email account', { error: error.message, stack: error.stack, userId: req.userId });
      res.status(400).json({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to add email account'
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
          message: 'Email account not found'
        });
        return;
      }

      res.json({
        success: true,
        message: 'Email account updated successfully',
        data: { account: updatedAccount }
      });
    } catch (error) {
      logger.error('Failed to update email account', { error: error.message, stack: error.stack, accountId: req.params.accountId, userId: req.userId });
      res.status(400).json({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to update email account'
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
        message: 'Email account removed successfully'
      });
    } catch (error) {
      logger.error('Failed to remove email account', { error: error.message, stack: error.stack, accountId: req.params.accountId, userId: req.userId });
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to remove email account'
      });
    }
  }
}