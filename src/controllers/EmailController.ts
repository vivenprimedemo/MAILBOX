import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { EmailService } from '../services/EmailService';
import { AuthService } from '../services/AuthService';

export class EmailController {
  private static emailService = new EmailService();

  static async getFolders(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { accountId } = req.params;

      const folders = await EmailController.emailService.getFolders(accountId);

      res.json({
        success: true,
        data: { folders }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to get folders'
      });
    }
  }

  static async getEmails(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { accountId, folder } = req.params;
      const { limit, offset, useCache } = req.query;

      const emails = await EmailController.emailService.getEmails(
        accountId,
        req.userId!,
        folder,
        limit ? parseInt(limit as string) : undefined,
        offset ? parseInt(offset as string) : undefined,
        useCache !== 'false'
      );

      res.json({
        success: true,
        data: { emails, count: emails.length }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to get emails'
      });
    }
  }

  static async getEmail(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { accountId, messageId } = req.params;
      const { folder } = req.query;

      const email = await EmailController.emailService.getEmail(
        accountId, 
        messageId, 
        folder as string
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
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to get email'
      });
    }
  }

  static async getThreads(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { accountId, folder } = req.params;
      const { limit, offset } = req.query;

      const threads = await EmailController.emailService.getThreads(
        accountId,
        req.userId!,
        folder,
        limit ? parseInt(limit as string) : undefined,
        offset ? parseInt(offset as string) : undefined
      );

      res.json({
        success: true,
        data: { threads, count: threads.length }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to get threads'
      });
    }
  }

  static async getThread(req: AuthRequest, res: Response): Promise<void> {
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
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to get thread'
      });
    }
  }

  static async searchEmails(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { accountId } = req.params;
      const searchQuery = req.query;

      // Convert date strings to Date objects
      if (searchQuery.dateStart) {
        searchQuery.dateRange = {
          start: new Date(searchQuery.dateStart as string),
          end: searchQuery.dateEnd ? new Date(searchQuery.dateEnd as string) : new Date()
        };
        delete searchQuery.dateStart;
        delete searchQuery.dateEnd;
      }

      const emails = await EmailController.emailService.searchEmails(
        accountId,
        req.userId!,
        searchQuery as any
      );

      res.json({
        success: true,
        data: { emails, count: emails.length }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Search failed'
      });
    }
  }

  static async markAsRead(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { accountId } = req.params;
      const { messageIds, folder } = req.body;

      await EmailController.emailService.markAsRead(accountId, messageIds, folder);

      res.json({
        success: true,
        message: 'Emails marked as read'
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to mark emails as read'
      });
    }
  }

  static async markAsUnread(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { accountId } = req.params;
      const { messageIds, folder } = req.body;

      await EmailController.emailService.markAsUnread(accountId, messageIds, folder);

      res.json({
        success: true,
        message: 'Emails marked as unread'
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to mark emails as unread'
      });
    }
  }

  static async markAsFlagged(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { accountId } = req.params;
      const { messageIds, folder } = req.body;

      await EmailController.emailService.markAsFlagged(accountId, messageIds, folder);

      res.json({
        success: true,
        message: 'Emails flagged'
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to flag emails'
      });
    }
  }

  static async markAsUnflagged(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { accountId } = req.params;
      const { messageIds, folder } = req.body;

      await EmailController.emailService.markAsUnflagged(accountId, messageIds, folder);

      res.json({
        success: true,
        message: 'Emails unflagged'
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to unflag emails'
      });
    }
  }

  static async deleteEmails(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { accountId } = req.params;
      const { messageIds, folder } = req.body;

      await EmailController.emailService.deleteEmails(accountId, messageIds, folder);

      res.json({
        success: true,
        message: 'Emails deleted'
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to delete emails'
      });
    }
  }

  static async moveEmails(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { accountId } = req.params;
      const { messageIds, fromFolder, toFolder } = req.body;

      await EmailController.emailService.moveEmails(accountId, messageIds, fromFolder, toFolder);

      res.json({
        success: true,
        message: 'Emails moved'
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to move emails'
      });
    }
  }

  static async sendEmail(req: AuthRequest, res: Response): Promise<void> {
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
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to send email'
      });
    }
  }

  static async replyToEmail(req: AuthRequest, res: Response): Promise<void> {
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
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to send reply'
      });
    }
  }

  static async forwardEmail(req: AuthRequest, res: Response): Promise<void> {
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
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to forward email'
      });
    }
  }

  static async syncAccount(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { accountId } = req.params;

      await EmailController.emailService.syncAccount(accountId, req.userId!);

      res.json({
        success: true,
        message: 'Account synced successfully'
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to sync account'
      });
    }
  }

  // Email Account Management
  static async getEmailAccounts(req: AuthRequest, res: Response): Promise<void> {
    try {
      const accounts = await AuthService.getEmailAccounts(req.userId!);

      res.json({
        success: true,
        data: { accounts }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to get email accounts'
      });
    }
  }

  static async addEmailAccount(req: AuthRequest, res: Response): Promise<void> {
    try {
      const accountData = req.body;

      const newAccount = await AuthService.addEmailAccount(req.userId!, accountData);

      // Try to connect to the email provider
      const connected = await EmailController.emailService.connectProvider(
        newAccount.id, 
        accountData.config
      );

      if (!connected) {
        // Remove the account if connection failed
        await AuthService.removeEmailAccount(req.userId!, newAccount.id);
        
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
      res.status(400).json({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to add email account'
      });
    }
  }

  static async updateEmailAccount(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { accountId } = req.params;
      const updateData = req.body;

      const updatedAccount = await AuthService.updateEmailAccount(
        req.userId!, 
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
      res.status(400).json({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to update email account'
      });
    }
  }

  static async removeEmailAccount(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { accountId } = req.params;

      // Remove provider connection
      await EmailController.emailService.removeProvider(accountId);

      // Remove account from user
      await AuthService.removeEmailAccount(req.userId!, accountId);

      res.json({
        success: true,
        message: 'Email account removed successfully'
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to remove email account'
      });
    }
  }
}