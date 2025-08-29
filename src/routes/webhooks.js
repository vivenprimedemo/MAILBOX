import express from 'express';
import { WebhookController } from '../controllers/WebhookController.js';

const { Router } = express;
const router = Router();

// middleware goes here

// gmail webhook
router.post('/gmail' , WebhookController.handleGmailWebhook)

// outlook webhook
router.post('/outlook' , WebhookController.handleOutlookWebhook)


export default router;