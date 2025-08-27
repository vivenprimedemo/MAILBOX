import express from 'express';
import { EmailController } from '../controllers/EmailController.js';
import { authenticateToken, requireEmailAccount } from '../middleware/auth.js';
import { emailSendLimiter } from '../middleware/security.js';
import { schemas, validate, validateQuery } from '../middleware/validation.js';

const { Router } = express;

const router = Router();

// All routes require authentication
// router.use(authenticateToken);

// Email Account Management Routes
router.get('/accounts/:userId', EmailController.getEmailAccounts);
router.post('/accounts', validate(schemas.addEmailAccount), EmailController.addEmailAccount);
router.put('/accounts/:accountId', validate(schemas.updateEmailAccount), EmailController.updateEmailAccount);
router.delete('/accounts/:accountId', EmailController.removeEmailAccount);

// Email Provider Routes (require specific account)
// router.use('/accounts/:accountId', requireEmailAccount);

// Folder operations
router.get('/accounts/:accountId/folders', EmailController.getFolders);

// Email operations
// Fetch emails in a specific folder
router.get('/accounts/:accountId/emails/:folder', validateQuery(schemas.search), EmailController.getEmails);
router.get('/accounts/:accountId/emails/:folder/email/:messageId', EmailController.getEmail);

// Fetch emails with pagination and advanced filtering
router.get('/accounts/:accountId/emails', validateQuery(schemas.listEmails), EmailController.listEmails);
router.get('/accounts/:accountId/emails-v2', validateQuery(schemas.listEmails), EmailController.listEmailsV2);
router.get('/accounts/:accountId/search', validateQuery(schemas.search), EmailController.searchEmails);

// Thread operations
router.get('/accounts/:accountId/threads/:folder', validateQuery(schemas.search), EmailController.getThreads);
router.get('/accounts/:accountId/thread/:threadId', EmailController.getThread);

// Email actions
router.put('/accounts/:accountId/emails/read', validate(schemas.markEmails), EmailController.markAsRead);
router.put('/accounts/:accountId/emails/unread', validate(schemas.markEmails), EmailController.markAsUnread);
router.put('/accounts/:accountId/emails/flag', validate(schemas.markEmails), EmailController.markAsFlagged);
router.put('/accounts/:accountId/emails/unflag', validate(schemas.markEmails), EmailController.markAsUnflagged);
router.delete('/accounts/:accountId/emails', validate(schemas.markEmails), EmailController.deleteEmails);
router.put('/accounts/:accountId/emails/move', validate(schemas.moveEmails), EmailController.moveEmails);

// Send/Reply/Forward operations (with rate limiting)
router.post('/accounts/:accountId/send', emailSendLimiter, validate(schemas.sendEmail), EmailController.sendEmail);
router.post('/accounts/:accountId/reply/:messageId', emailSendLimiter, EmailController.replyToEmail);
router.post('/accounts/:accountId/forward/:messageId', emailSendLimiter, EmailController.forwardEmail);

// Sync operations
router.post('/accounts/:accountId/sync', EmailController.syncAccount);

// Attachment operations
router.get('/accounts/:accountId/message/:messageId/attachment/:attachmentId', EmailController.getAttachment);

export default router;