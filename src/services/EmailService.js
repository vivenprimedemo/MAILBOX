import { consoleHelper } from '../../consoleHelper.js';
import { provider_config_map } from '../config/index.js';
import { Email, EmailConfig } from '../models/Email.js';
import { GmailProvider } from '../providers/GmailProvider.js';
import { IMAPProvider } from '../providers/IMAPProvider.js';
import { OutlookProvider } from '../providers/OutlookProvider.js';

export class EmailService {
    providers = new Map();
    providerInstances = new Map();

    constructor() { }

    createProvider(config, accountId) {
        let provider;

        switch (config.type) {
            case 'gmail':
                provider = new GmailProvider(config);
                break;
            case 'imap':
                provider = new IMAPProvider(config);
                break;
            case 'outlook':
                provider = new OutlookProvider(config);
                break;
            default:
                throw new Error(`Unsupported provider type: ${config.type}`);
        }

        this.providerInstances.set(accountId, provider);
        return provider;
    }

    async getProvider(accountId, userId = null) {
        let provider = this.providerInstances.get(accountId);
        try {
            const email_config = await EmailConfig.findOne({ _id: accountId });
            const email_provider = email_config?.provider;
            const provider_config = {
                id: accountId,
                type: email_provider,
                auth: {
                    user: email_config?.email,
                    accessToken: email_config?.oauth_config?.access_token,
                    refreshToken: email_config?.oauth_config?.refresh_token,
                    clientId: provider_config_map?.[email_provider]?.client_id,
                    clientSecret: provider_config_map?.[email_provider]?.client_secret,
                }
            }
            provider = this.createProvider(provider_config, accountId);
            await provider.connect();
        } catch (error) {
            consoleHelper("EmailService@getProvider", error);
            return null;
        }

        return provider || null;
    }

    async removeProvider(accountId) {
        const provider = this.providerInstances.get(accountId);
        if (provider) {
            await provider.disconnect();
            this.providerInstances.delete(accountId);
        }
    }

    async connectProvider(accountId, config) {
        try {
            const provider = this.createProvider(config, accountId);
            await provider.connect();
            return true;
        } catch (error) {
            console.error(`Failed to connect provider for account ${accountId}:`, error);
            return false;
        }
    }

    async getFolders(accountId, userId = null, request = {}) {
        const provider = await this.getProvider(accountId, userId);
        if (!provider) {
            const error = new Error('Failed to initialize email provider. Please check your account configuration and credentials.');
            error.code = 'PROVIDER_INITIALIZATION_FAILED';
            throw error;
        }
        return provider.getFolders(request);
    }

    async getEmails(accountId, userId, request, useCache = true) {
        const provider = await this.getProvider(accountId, userId);
        if (!provider) {
            const error = new Error('Failed to initialize email provider. Please check your account configuration and credentials.');
            error.code = 'PROVIDER_INITIALIZATION_FAILED';
            throw error;
        }

        const { folderId, limit = 50, offset = 0 } = request;

        // Try to get from cache first
        if (useCache) {
            const cachedEmails = await Email.find({
                userId,
                accountId,
                folderId
            }).sort({ date: -1 }).limit(limit).skip(offset);

            if (cachedEmails.length > 0) {
                return {
                    data: cachedEmails.map(this.convertToInterface),
                    metadata: {
                        total: cachedEmails.length,
                        limit,
                        offset,
                        hasMore: cachedEmails.length === limit,
                        provider: provider.config?.type || 'unknown'
                    }
                };
            }
        }

        // Fetch from provider and cache
        const response = await provider.getEmails(request);
        if (response.data) {
            await this.cacheEmails(response.data, userId, accountId);
        }

        return response;
    }

    async listEmails(accountId, userId, options = {}) {
        const provider = await this.getProvider(accountId, userId);
        if (!provider) {
            const error = new Error('Failed to initialize email provider. Please check your account configuration and credentials.');
            error.code = 'PROVIDER_INITIALIZATION_FAILED';
            throw error;
        }

        const {
            folderId = 'INBOX',
            limit = 50,
            offset = 0,
            sortBy = 'date',
            sortOrder = 'desc',
            search = '',
            filters = {},
            useCache = true
        } = options;

        // Build enhanced request object
        const request = {
            folderId,
            limit,
            offset,
            sortBy,
            sortOrder,
            search,
            filters,
            // Additional filter options
            isUnread: filters.isUnread,
            isFlagged: filters.isFlagged,
            hasAttachment: filters.hasAttachment,
            from: filters.from,
            to: filters.to,
            subject: filters.subject,
            dateFrom: filters.dateFrom ? new Date(filters.dateFrom) : undefined,
            dateTo: filters.dateTo ? new Date(filters.dateTo) : undefined
        };

        try {
            // Try cache first if enabled
            if (useCache && !search && Object.keys(filters).length === 0) {
                const cacheResult = await this.getEmailsFromCache(accountId, userId, request);
                if (cacheResult) {
                    return cacheResult;
                }
            }

            // Fetch from provider with enhanced request
            const response = await provider.listEmails(request);

            if (response.data) {
                // Cache emails for future use
                await this.cacheEmails(response.data, userId, accountId);

                // Ensure consistent response format
                return {
                    data: response.data,
                    metadata: {
                        total: response.metadata?.total || response.data.length,
                        limit,
                        offset,
                        hasMore: response.metadata?.hasMore || (response.data.length === limit),
                        currentPage: Math.floor(offset / limit) + 1,
                        totalPages: response.metadata?.total ? Math.ceil(response.metadata.total / limit) : null,
                        nextOffset: response.metadata?.hasMore ? offset + limit : null,
                        provider: provider.config?.type || 'unknown',
                        sortBy,
                        sortOrder,
                        appliedFilters: filters
                    }
                };
            }

            return response;
        } catch (error) {
            console.error('Error in listEmails:', error);
            const listError = new Error(error.message);
            listError.code = 'LIST_EMAILS_ERROR';
            listError.provider = provider.config?.type || 'unknown';
            throw listError;
        }
    }
    async listEmailsV2(accountId, userId, options = {}) {
        const provider = await this.getProvider(accountId, userId);
        if (!provider) {
            const error = new Error('Failed to initialize email provider. Please check your account configuration and credentials.');
            error.code = 'PROVIDER_INITIALIZATION_FAILED';
            throw error;
        }

        const {
            folderId = 'INBOX',
            limit = 50,
            offset = 0,
            sortBy = 'date',
            sortOrder = 'desc',
            search = '',
            filters = {},
            useCache = true,
            nextPage = "",
            isListEmails = true
        } = options;

        // Build enhanced request object
        const request = {
            folderId,
            limit,
            offset,
            sortBy,
            sortOrder,
            search,
            filters,
            // Additional filter options
            isUnread: filters.isUnread,
            isFlagged: filters.isFlagged,
            hasAttachment: filters.hasAttachment,
            from: filters.from,
            to: filters.to,
            subject: filters.subject,
            dateFrom: filters.dateFrom ? new Date(filters.dateFrom) : undefined,
            dateTo: filters.dateTo ? new Date(filters.dateTo) : undefined,
            nextPage,
            isListEmails
        };

        try {
            // Try cache first if enabled
            if (useCache && !search && Object.keys(filters).length === 0) {
                const cacheResult = await this.getEmailsFromCache(accountId, userId, request);
                if (cacheResult) {
                    return cacheResult;
                }
            }

            // Fetch from provider with enhanced request
            const response = await provider.listEmailsV2(request);

            if (response.data) {
                // Cache emails for future use
                await this.cacheEmails(response.data, userId, accountId);

                // Ensure consistent response format
                return {
                    data: response.data,
                    metadata: {
                        total: response.metadata?.total || response.data.length,
                        limit,
                        offset,
                        hasMore: response.metadata?.hasMore || (response.data.length === limit),
                        currentPage: Math.floor(offset / limit) + 1,
                        totalPages: response.metadata?.total ? Math.ceil(response.metadata.total / limit) : null,
                        nextOffset: response.metadata?.hasMore ? offset + limit : null,
                        provider: provider.config?.type || 'unknown',
                        sortBy,
                        sortOrder,
                        appliedFilters: filters
                    }
                };
            }

            return response;
        } catch (error) {
            console.error('Error in listEmails:', error);
            const listError = new Error(error.message);
            listError.code = 'LIST_EMAILS_ERROR';
            listError.provider = provider.config?.type || 'unknown';
            throw listError;
        }
    }
    async getEmailsFromCache(accountId, userId, request) {
        const { folderId, limit, offset, sortBy, sortOrder } = request;

        try {
            // Build sort object
            const sortObj = {};
            sortObj[sortBy] = sortOrder === 'desc' ? -1 : 1;

            // Get total count for pagination
            const totalCount = await Email.countDocuments({
                userId,
                accountId,
                folderId
            });

            // Get emails with sorting and pagination
            const cachedEmails = await Email.find({
                userId,
                accountId,
                folderId
            })
                .sort(sortObj)
                .limit(limit)
                .skip(offset);

            if (cachedEmails.length > 0) {
                return {
                    data: cachedEmails.map(this.convertToInterface),
                    metadata: {
                        total: totalCount,
                        limit,
                        offset,
                        hasMore: offset + limit < totalCount,
                        currentPage: Math.floor(offset / limit) + 1,
                        totalPages: Math.ceil(totalCount / limit),
                        nextOffset: offset + limit < totalCount ? offset + limit : null,
                        provider: 'cache',
                        sortBy,
                        sortOrder
                    }
                };
            }
        } catch (error) {
            console.error('Error fetching from cache:', error);
        }

        return null;
    }

    async getEmail(accountId, messageId, folderId, userId = null) {
        const provider = await this.getProvider(accountId, userId);
        if (!provider) {
            const error = new Error('Failed to initialize email provider. Please check your account configuration and credentials.');
            error.code = 'PROVIDER_INITIALIZATION_FAILED';
            throw error;
        }
        return provider.getEmail(messageId, folderId);
    }

    async getThreads(accountId, userId, request) {
        const provider = await this.getProvider(accountId, userId);
        if (!provider) {
            const error = new Error('Failed to initialize email provider. Please check your account configuration and credentials.');
            error.code = 'PROVIDER_INITIALIZATION_FAILED';
            throw error;
        }

        const capabilities = provider.getCapabilities();
        if (!capabilities.supportsThreading) {
            // Fall back to grouping emails by subject
            const emailsResponse = await this.getEmails(accountId, userId, request, false);
            if (emailsResponse.data) {
                const threads = this.buildThreadsFromEmails(emailsResponse.data);
                return {
                    data: threads,
                    metadata: {
                        ...emailsResponse.metadata,
                        provider: provider.config?.type || 'unknown'
                    }
                };
            }
            return emailsResponse;
        }

        return provider.getThreads(request);
    }

    async getThread(accountId, threadId, userId = null, sortOptions = null) {
        const provider = await this.getProvider(accountId, userId);
        if (!provider) {
            const error = new Error('Failed to initialize email provider. Please check your account configuration and credentials.');
            error.code = 'PROVIDER_INITIALIZATION_FAILED';
            throw error;
        }
        return provider.getThread(threadId, sortOptions);
    }

    async searchEmails(accountId, userId, request) {
        const provider = await this.getProvider(accountId, userId);
        if (!provider) {
            const error = new Error('Failed to initialize email provider. Please check your account configuration and credentials.');
            error.code = 'PROVIDER_INITIALIZATION_FAILED';
            throw error;
        }

        const capabilities = provider.getCapabilities();
        if (!capabilities.supportsSearch) {
            // Fall back to local search
            const results = await this.searchEmailsLocally(userId, accountId, request);
            return {
                data: results,
                metadata: {
                    total: results.length,
                    limit: request.limit || 50,
                    offset: request.offset || 0,
                    hasMore: false,
                    provider: provider.config?.type || 'unknown'
                }
            };
        }

        return provider.searchEmails(request);
    }

    async markAsRead(accountId, request, userId = null) {
        const provider = await this.getProvider(accountId, userId);
        if (!provider) {
            const error = new Error('Failed to initialize email provider. Please check your account configuration and credentials.');
            error.code = 'PROVIDER_INITIALIZATION_FAILED';
            throw error;
        }

        const response = await provider.markAsRead(request);
        if (response.data) {
            await this.updateEmailFlags(request.messageIds, { seen: true });
        }
        return response;
    }

    async markAsUnread(accountId, request, userId = null) {
        const provider = await this.getProvider(accountId, userId);
        if (!provider) {
            const error = new Error('Failed to initialize email provider. Please check your account configuration and credentials.');
            error.code = 'PROVIDER_INITIALIZATION_FAILED';
            throw error;
        }

        const response = await provider.markAsUnread(request);
        if (response.data) {
            await this.updateEmailFlags(request.messageIds, { seen: false });
        }
        return response;
    }

    async markAsFlagged(accountId, request, userId = null) {
        const provider = await this.getProvider(accountId, userId);
        if (!provider) {
            const error = new Error('Failed to initialize email provider. Please check your account configuration and credentials.');
            error.code = 'PROVIDER_INITIALIZATION_FAILED';
            throw error;
        }

        const response = await provider.markAsFlagged(request);
        if (response.data) {
            await this.updateEmailFlags(request.messageIds, { flagged: true });
        }
        return response;
    }

    async markAsUnflagged(accountId, request, userId = null) {
        const provider = await this.getProvider(accountId, userId);
        if (!provider) {
            const error = new Error('Failed to initialize email provider. Please check your account configuration and credentials.');
            error.code = 'PROVIDER_INITIALIZATION_FAILED';
            throw error;
        }

        const response = await provider.markAsUnflagged(request);
        if (response.data) {
            await this.updateEmailFlags(request.messageIds, { flagged: false });
        }
        return response;
    }

    async deleteEmails(accountId, messageIds, folder, userId = null) {
        const provider = await this.getProvider(accountId, userId);
        if (!provider) {
            const error = new Error('Failed to initialize email provider. Please check your account configuration and credentials.');
            error.code = 'PROVIDER_INITIALIZATION_FAILED';
            throw error;
        }

        const response = await provider.deleteEmails(messageIds, folder);
        if (response && response.data) {
            await this.updateEmailFlags(messageIds, { deleted: true });
        }
        return response || {
            data: { deleted: messageIds.length },
            metadata: { provider: provider.config?.type || 'unknown' }
        };
    }

    async moveEmails(accountId, messageIds, fromFolder, toFolder, userId = null) {
        const provider = await this.getProvider(accountId, userId);
        if (!provider) {
            const error = new Error('Failed to initialize email provider. Please check your account configuration and credentials.');
            error.code = 'PROVIDER_INITIALIZATION_FAILED';
            throw error;
        }

        // Create proper request object for providers
        const moveRequest = {
            messageIds,
            sourceFolder: fromFolder,
            destinationFolder: toFolder
        };

        const response = await provider.moveEmails(moveRequest);
        if (response && (response.data || response.moved)) {
            // Update local cache
            await Email.updateMany(
                { messageId: { $in: messageIds } },
                { $set: { folder: toFolder } }
            );
        }
        return response || {
            data: { moved: messageIds.length },
            metadata: { provider: provider.config?.type || 'unknown' }
        };
    }

    async sendEmail(accountId, request, userId = null) {
        const provider = await this.getProvider(accountId, userId);
        if (!provider) {
            const error = new Error('Failed to initialize email provider. Please check your account configuration and credentials.');
            error.code = 'PROVIDER_INITIALIZATION_FAILED';
            throw error;
        }

        const capabilities = provider.getCapabilities();
        if (!capabilities.supportsSending) {
            const error = new Error('Provider does not support sending emails');
            error.code = 'SENDING_NOT_SUPPORTED';
            error.provider = provider.config?.type || 'unknown';
            throw error;
        }

        return provider.sendEmail(request);
    }

    async replyToEmail(accountId, originalMessageId, options, userId = null) {
        const provider = await this.getProvider(accountId, userId);
        if (!provider) {
            const error = new Error('Failed to initialize email provider. Please check your account configuration and credentials.');
            error.code = 'PROVIDER_INITIALIZATION_FAILED';
            throw error;
        }

        return provider.replyToEmail(originalMessageId, options);
    }

    async forwardEmail(accountId, originalMessageId, to, message, attachments = [], userId = null) {
        const provider = await this.getProvider(accountId, userId);
        if (!provider) {
            const error = new Error('Failed to initialize email provider. Please check your account configuration and credentials.');
            error.code = 'PROVIDER_INITIALIZATION_FAILED';
            throw error;
        }

        return provider.forwardEmail(originalMessageId, to, message, attachments);
    }

    async syncAccount(accountId, userId) {
        const provider = await this.getProvider(accountId, userId);
        if (!provider) {
            const error = new Error('Failed to initialize email provider. Please check your account configuration and credentials.');
            error.code = 'PROVIDER_INITIALIZATION_FAILED';
            throw error;
        }

        try {
            // Get all folders
            const foldersResponse = await provider.getFolders();
            const folders = foldersResponse.data || [];

            let syncedCount = 0;
            // Sync each folder
            for (const folder of folders) {
                try {
                    const emailsResponse = await provider.getEmails({ folderId: folder.id || folder.name, limit: 100 });
                    if (emailsResponse.data) {
                        await this.cacheEmails(emailsResponse.data, userId, accountId);
                        syncedCount += emailsResponse.data.length;
                    }
                } catch (error) {
                    console.error(`Error syncing folder ${folder.name}:`, error);
                }
            }

            return {
                data: { synced: syncedCount, folders: folders.length },
                metadata: {
                    provider: provider.config?.type || 'unknown',
                    timestamp: new Date()
                }
            };
        } catch (error) {
            console.error(`Error syncing account ${accountId}:`, error);
            const syncError = new Error(error.message);
            syncError.code = 'SYNC_ERROR';
            syncError.provider = provider.config?.type || 'unknown';
            syncError.details = error;
            throw syncError;
        }
    }

    async cacheEmails(emails, userId, accountId) {
        for (const email of emails) {
            try {
                await Email.findOneAndUpdate(
                    { messageId: email.messageId, userId },
                    {
                        ...email,
                        userId,
                        accountId,
                        folder: email.folderId // Map folderId to folder for backward compatibility
                    },
                    { upsert: true, new: true }
                );
            } catch (error) {
                console.error('Error caching email:', error);
            }
        }
    }

    async updateEmailFlags(messageIds, flags) {
        await Email.updateMany(
            { messageId: { $in: messageIds } },
            { $set: { [`flags.${Object.keys(flags)[0]}`]: Object.values(flags)[0] } }
        );
    }

    convertToInterface(doc) {
        return doc.toObject();
    }

    async searchEmailsLocally(userId, accountId, request) {
        const searchQuery = Email.search(userId, {
            ...request,
            accountId
        });

        const results = await searchQuery.exec();
        return results.map(this.convertToInterface);
    }

    buildThreadsFromEmails(emails) {
        const threadMap = new Map();

        emails.forEach(email => {
            const threadId = this.getThreadIdFromSubject(email.subject);

            if (!threadMap.has(threadId)) {
                threadMap.set(threadId, {
                    id: threadId,
                    subject: email.subject.replace(/^(Re:|Fwd?:)\s*/i, ''),
                    participants: [],
                    messageCount: 0,
                    unreadCount: 0,
                    lastMessageDate: email.date,
                    emails: [],
                    hasAttachments: false
                });
            }

            const thread = threadMap.get(threadId);
            thread.emails.push(email);
            thread.messageCount++;

            if (!email.flags.seen) {
                thread.unreadCount++;
            }

            if (email.attachments && email.attachments.length > 0) {
                thread.hasAttachments = true;
            }

            if (email.date > thread.lastMessageDate) {
                thread.lastMessageDate = email.date;
            }

            // Add participants
            const allAddresses = [email.from, ...email.to, ...(email.cc || [])];
            allAddresses.forEach(addr => {
                if (!thread.participants.find(p => p.address === addr.address)) {
                    thread.participants.push(addr);
                }
            });
        });

        return Array.from(threadMap.values()).sort(
            (a, b) => b.lastMessageDate.getTime() - a.lastMessageDate.getTime()
        );
    }

    getThreadIdFromSubject(subject) {
        // Simple subject-based threading
        const cleanSubject = subject.replace(/^(Re:|Fwd?:)\s*/i, '').trim();
        return Buffer.from(cleanSubject).toString('base64');
    }

    async getAttachment(accountId, messageId, attachmentId, userId = null) {
        const provider = await this.getProvider(accountId, userId);
        if (!provider) {
            const error = new Error('Failed to initialize email provider. Please check your account configuration and credentials.');
            error.code = 'PROVIDER_INITIALIZATION_FAILED';
            throw error;
        }

        return provider.getAttachment(messageId, attachmentId);
    }

    async watchEmailAccount(accountId, userId = null) {
        const provider = await this.getProvider(accountId, userId);
        if (!provider) {
            const error = new Error('Failed to initialize email provider. Please check your account configuration and credentials.');
            error.code = 'PROVIDER_INITIALIZATION_FAILED';
            throw error;
        }
        return provider.watchEmailAccount(accountId);
    }

    async deleteSubscription(accountId, userId = null) {
        const provider = await this.getProvider(accountId, userId);
        if (!provider) {
            const error = new Error('Failed to initialize email provider. Please check your account configuration and credentials.');
            error.code = 'PROVIDER_INITIALIZATION_FAILED';
            throw error;
        }

        // Check if provider supports subscription management
        if (typeof provider.deleteSubscription !== 'function') {
            const error = new Error('Subscription management is not supported by this provider');
            error.code = 'SUBSCRIPTION_NOT_SUPPORTED';
            throw error;
        }

        return provider.deleteSubscription(accountId);
    }

    async listSubscriptions(accountId, userId = null) {
        const provider = await this.getProvider(accountId, userId);
        if (!provider) {
            const error = new Error('Failed to initialize email provider. Please check your account configuration and credentials.');
            error.code = 'PROVIDER_INITIALIZATION_FAILED';
            throw error;
        }

        // Check if provider supports subscription management
        if (typeof provider.listSubscriptions !== 'function') {
            const error = new Error('Subscription listing is not supported by this provider');
            error.code = 'SUBSCRIPTION_NOT_SUPPORTED';
            throw error;
        }

        return provider.listSubscriptions();
    }

    async getSignature(accountId, userId = null) {
        const provider = await this.getProvider(accountId, userId);
        if (!provider) {
            const error = new Error('Failed to initialize email provider. Please check your account configuration and credentials.');
            error.code = 'PROVIDER_INITIALIZATION_FAILED';
            throw error;
        }

        return provider.getSignature();
    }
}
