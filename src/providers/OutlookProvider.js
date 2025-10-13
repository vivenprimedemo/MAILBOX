import { ConfidentialClientApplication } from '@azure/msal-node';
import { Client } from '@microsoft/microsoft-graph-client';
import 'isomorphic-fetch';
import logger from '../utils/logger.js';
import { config } from '../config/index.js';
import { EmailConfig } from '../models/Email.js';
import { BaseEmailProvider } from './BaseEmailProvider.js';

export class OutlookProvider extends BaseEmailProvider {
    constructor(config) {
        super(config);
        this.graphClient = null;
        this.accessToken = config.auth.accessToken;
        this.refreshToken = config.auth.refreshToken;
        this.msalInstance = null;
        this.initializeMsal();
    }

    initializeMsal() {
        if (this.config.auth.clientId && this.config.auth.clientSecret) {
            const msalConfig = {
                auth: {
                    clientId: this.config.auth.clientId,
                    authority: 'https://login.microsoftonline.com/common',
                    clientSecret: this.config.auth.clientSecret
                }
            };
            this.msalInstance = new ConfidentialClientApplication(msalConfig);
        } else {
            logger.warn('MSAL not properly configured - missing clientId or clientSecret', {
                hasClientId: !!this.config.auth.clientId,
                hasClientSecret: !!this.config.auth.clientSecret
            });
        }
    }
    getCapabilities() {
        return {
            supportsThreading: true,
            supportsLabels: false,
            supportsFolders: true,
            supportsSearch: true,
            supportsRealTimeSync: true,
            supportsSending: true,
            supportsAttachments: true,
            maxAttachmentSize: 150 * 1024 * 1024 // 150MB
        };
    }

    async connect() {
        if (!this.accessToken) {
            throw new Error('Access token required for Outlook');
        }

        try {
            this.graphClient = Client.init({
                authProvider: (done) => {
                    done(null, this.accessToken);
                }
            });

            // Test connection
            await this.graphClient.api('/me').get();
            this.isConnected = true;
        } catch (error) {
            if (this.refreshToken) {
                await this.refreshAccessToken();
                this.isConnected = true;
            } else {
                throw new Error('Invalid access token and no refresh token available');
            }
        }
    }

    async disconnect() {
        this.isConnected = false;
        this.graphClient = null;
        this.accessToken = undefined;
    }

    async authenticate(credentials) {
        try {
            if (credentials?.accessToken) {
                this.accessToken = credentials.accessToken;
                this.refreshToken = credentials.refreshToken;
            }
            await this.connect();
            return true;
        } catch (error) {
            return false;
        }
    }

    async refreshAccessToken() {
        logger.info('Attempting to refresh access token', {
            accountId: this.config.id,
            hasRefreshToken: !!this.refreshToken,
            hasClientId: !!this.config.auth.clientId,
            hasClientSecret: !!this.config.auth.clientSecret
        });
        if (!this.refreshToken || !this.config.auth.clientId || !this.config.auth.clientSecret) {
            throw new Error('Refresh token or OAuth credentials missing');
        }

        const tokenRequest = {
            refreshToken: this.refreshToken,
            scopes: config.SCOPES.outlook,
        };

        try {
            const response = await this.msalInstance.acquireTokenByRefreshToken(tokenRequest);
            this.accessToken = response.accessToken;


            await this.updateEmailAccessToken(this.config.id, response.accessToken);

            // Reinitialize Graph client with new token
            this.graphClient = Client.init({
                authProvider: (done) => {
                    done(null, this.accessToken);
                }
            });
        } catch (error) {
            logger.error('Failed to refresh access token', {
                accountId: this.config.id,
                error: error.message,
                stack: error.stack
            });
            throw new Error('Failed to refresh access token');
        }
    }

    async getFolders() {
        if (!this.graphClient) {
            throw new Error('Not connected to Outlook');
        }

        const folders = await this.graphClient.api('/me/mailFolders')
            .top(100)
            .get();

        return folders?.value;
    }

    mapFolderType(displayName) {
        const name = displayName.toLowerCase();
        if (name.includes('inbox')) return 'inbox';
        if (name.includes('sent')) return 'sent';
        if (name.includes('draft')) return 'drafts';
        if (name.includes('deleted') || name.includes('trash')) return 'trash';
        if (name.includes('junk') || name.includes('spam')) return 'spam';
        if (name.includes('archive')) return 'archive';
        return 'custom';
    }

    async getEmails(request) {
        const { folderId: folder = 'inbox', limit = 50, offset = 0 } = request;

        if (!this.graphClient) {
            throw new Error('Not connected to Outlook');
        }

        try {
            let endpoint = '/me/messages';
            if (folder && folder !== 'inbox') {
                endpoint = `/me/mailFolders/${folder}/messages`;
            }

            const messages = await this.graphClient
                .api(endpoint)
                .top(limit)
                .skip(offset)
                .expand('attachments')
                .orderby('receivedDateTime desc')
                .get();

            const emails = messages.value.map(message => this.parseOutlookMessage(message, folder));

            return emails;
        } catch (error) {
            throw error;
        }
    }

    async listEmails(request) {
        try {
            const {
                folderId = 'inbox',
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
                dateTo
            } = request;

            if (!this.graphClient) {
                throw new Error('Not connected to Outlook');
            }

            let endpoint = '/me/messages';
            if (folderId && folderId !== 'inbox') {
                endpoint = `/me/mailFolders/${folderId}/messages`;
            }

            let query = this.graphClient.api(endpoint);

            // Apply search filters using OData $filter
            const filters = [];

            // Handle search using Microsoft Graph Search API instead of filters
            // as filters with contains() are often too complex for Graph API
            let isUsingSearch = false;
            if (search) {
                const searchQuery = this.buildSearchQuery(search);
                if (searchQuery) {
                    // Use the search() API instead of filter()
                    query = query.search(searchQuery);
                    isUsingSearch = true;
                }
            }
            if (from) {
                filters.push(`from/emailAddress/address eq '${from}'`);
            }
            if (to) {
                filters.push(`toRecipients/any(r:r/emailAddress/address eq '${to}')`);
            }
            if (subject) {
                filters.push(`contains(subject,'${subject}')`);
            }
            if (isUnread === true) {
                filters.push(`isRead eq false`);
            }
            if (isUnread === false) {
                filters.push(`isRead eq true`);
            }
            if (isFlagged === true) {
                filters.push(`flag/flagStatus eq 'flagged'`);
            }
            if (isFlagged === false) {
                filters.push(`flag/flagStatus ne 'flagged'`);
            }
            if (hasAttachment === true) {
                filters.push(`hasAttachments eq true`);
            }
            if (hasAttachment === false) {
                filters.push(`hasAttachments eq false`);
            }
            if (dateFrom) {
                filters.push(`receivedDateTime ge ${dateFrom.toISOString()}`);
            }
            if (dateTo) {
                filters.push(`receivedDateTime le ${dateTo.toISOString()}`);
            }

            // Only apply filters if we're not using the search API
            if (filters.length > 0 && !isUsingSearch) {
                const filterString = filters.join(' and ');
                query = query.filter(filterString);
            }

            // Apply sorting
            const sortField = this.mapSortField(sortBy);
            const orderByClause = `${sortField} ${sortOrder}`;

            // Configure query with different options based on search vs filter
            if (isUsingSearch) {
                // When using search, $skip is not supported, only $top and $orderby work differently
                query = query
                    .top(limit)
                    .expand('attachments');
                // Note: orderby and count might also have limitations with search
            } else {
                query = query
                    .top(limit)
                    .skip(offset)
                    .expand('attachments')
                    .orderby(orderByClause)
                    .count(true); // Include total count
            }

            const messages = await query.get();
            const emails = messages.value.map(message => this.parseOutlookMessage(message, folderId));

            const total = messages['@odata.count'] || emails.length;
            const hasMore = offset + limit < total;

            return {
                emails,
                metadata: {
                    total,
                    limit,
                    offset,
                    hasMore,
                    currentPage: Math.floor(offset / limit) + 1,
                    totalPages: Math.ceil(total / limit),
                    nextOffset: hasMore ? offset + limit : null,
                    nextLink: messages['@odata.nextLink']
                }
            };
        } catch (error) {
            throw error;
        }
    }


    async listEmailsV2(request) {
        try {
            const {
                folderId = 'Inbox',
                limit = 20,
                search = '',
                isUnread,
                isFlagged,
                hasAttachment,
                from,
                to,
                subject,
                dateFrom,
                dateTo,
                nextPage = null,
                isListEmails = true
            } = request;

            if (!this.graphClient) throw new Error('Not connected to Outlook');

            let query;
            let total = 0;

            // 1️⃣ Get total count from folder metadata
            try {
                const folderInfo = await this.graphClient.api(`/me/mailFolders/${folderId}`).get();
                total = folderInfo.totalItemCount || 0;
            } catch {
                total = 0; // fallback
            }

            if (nextPage) {
                // 2️⃣ Use nextLink for pagination (do NOT append top/skip)
                const decodedNextPage = decodeURIComponent(nextPage);
                const relativePath = decodedNextPage.replace('https://graph.microsoft.com/v1.0', '');
                query = this.graphClient.api(relativePath);
            } else {
                // 3️⃣ First page: build endpoint
                const endpoint = folderId.toLowerCase() === 'inbox'
                    ? '/me/mailFolders/Inbox/messages'
                    : `/me/mailFolders/${folderId}/messages`;

                query = this.graphClient.api(endpoint);

                // 4️⃣ Apply filters
                const filters = [];
                if (from) filters.push(`from/emailAddress/address eq '${from}'`);
                if (to) filters.push(`toRecipients/any(r:r/emailAddress/address eq '${to}')`);
                if (subject) filters.push(`contains(subject,'${subject}')`);
                if (isUnread === true) filters.push(`isRead eq false`);
                if (isUnread === false) filters.push(`isRead eq true`);
                if (isFlagged === true) filters.push(`flag/flagStatus eq 'flagged'`);
                if (isFlagged === false) filters.push(`flag/flagStatus ne 'flagged'`);
                if (hasAttachment === true) filters.push(`hasAttachments eq true`);
                if (hasAttachment === false) filters.push(`hasAttachments eq false`);
                if (dateFrom) filters.push(`receivedDateTime ge ${dateFrom.toISOString()}`);
                if (dateTo) filters.push(`receivedDateTime le ${dateTo.toISOString()}`);

                if (filters.length > 0) query = query.filter(filters.join(' and '));

                if (search) query = query.search(`"${search}"`);

                // 5️⃣ Only use top for first page
                query = query.top(limit);
            }

            // 6️⃣ Fetch messages
            const messages = await query.get();
            const emails = messages.value.map(msg => this.parseOutlookMessage(msg, folderId));

            const hasMore = !!messages['@odata.nextLink'];

            // want the bodyhtml ,bodytext , attachment remove if isListEmails is true
            if(isListEmails === 'true' || isListEmails === true) {
                emails.forEach((email) => {
                    delete email.bodyHtml;
                    delete email.bodyText;
                    delete email.attachments;
                });
            }

            return {
                emails,
                metadata: {
                    total,
                    limit,
                    offset: nextPage ? null : 0,
                    hasMore,
                    currentPage: nextPage ? null : 1,
                    totalPages: Math.ceil(total / limit),
                    nextOffset: hasMore ? (nextPage ? null : limit) : null,
                    nextPage: hasMore ? encodeURIComponent(messages['@odata.nextLink']) : null
                }
            };
        } catch (err) {
            logger.error('listEmailsV2 error', {
                accountId: this.config.id,
                folderId: request.folderId,
                error: err.message,
                stack: err.stack
            });
            throw err;
        }
    }



    buildSearchQuery(search) {
        // Microsoft Graph Search API doesn't support field directives like "subject:value"
        // We need to extract just the search term from subject:WATCHER format

        // Regular expression to match search directives like "subject:value" or "from:value"  
        const directiveRegex = /(subject|from|to|body):\s*"([^"]+)"|(\w+):\s*(\S+)/gi;
        let match;
        const searchTerms = [];
        let remainingSearch = search;

        // Parse directives and extract just the values for searching
        while ((match = directiveRegex.exec(search)) !== null) {
            const directive = match[1] || match[3];
            let value = match[2] || match[4];

            // Handle email addresses specially - extract meaningful search terms
            if (directive && (directive.toLowerCase() === 'from' || directive.toLowerCase() === 'to')) {
                // For email searches, try to extract meaningful search terms
                if (value.includes('@')) {
                    const emailParts = value.split('@');
                    const username = emailParts[0];
                    const domain = emailParts[1];

                    // Use the username part for search (more likely to be meaningful)
                    // Remove common prefixes like "noreply", "no-reply", etc.
                    if (username && !username.match(/^(noreply|no-reply|donotreply|support|info|admin)$/i)) {
                        searchTerms.push(username);
                    } else if (domain) {
                        // If username is generic, use domain name without TLD
                        const domainName = domain.split('.')[0];
                        if (domainName && domainName.length > 2) {
                            searchTerms.push(domainName);
                        }
                    }
                } else {
                    searchTerms.push(value);
                }
            } else {
                // For non-email searches (subject, body), use the value directly
                searchTerms.push(value);
            }

            // Remove the matched directive from the remaining search
            remainingSearch = remainingSearch.replace(match[0], '').trim();
        }

        // Add any remaining non-directive search terms
        if (remainingSearch) {
            searchTerms.push(remainingSearch);
        }

        // If we have search terms, join them
        if (searchTerms.length > 0) {
            return searchTerms.join(' ');
        }


        if (search && search.trim()) {
            const trimmedSearch = search.trim();

            // For multi-word searches, handle based on word lengths
            // Very short words (like single letters) work better without quotes
            if (trimmedSearch.includes(' ') && !trimmedSearch.startsWith('"') && !trimmedSearch.endsWith('"')) {
                // Use flexible matching without quotes for better results
                return trimmedSearch;
            }

            return trimmedSearch;
        }

        return search;
    }

    parseSearchDirectives(search) {
        const filters = [];

        // Regular expression to match search directives like "subject:value" or "from:value"
        const directiveRegex = /(subject|from|to|body):\s*"([^"]+)"|(\w+):\s*(\S+)/gi;
        let match;
        let hasDirectives = false;

        while ((match = directiveRegex.exec(search)) !== null) {
            hasDirectives = true;
            const directive = match[1] || match[3];
            const value = match[2] || match[4];

            switch (directive.toLowerCase()) {
                case 'subject':
                    filters.push(`contains(subject,'${value}')`);
                    break;
                case 'from':
                    filters.push(`contains(from/emailAddress/address,'${value}') or contains(from/emailAddress/name,'${value}')`);
                    break;
                case 'to':
                    filters.push(`toRecipients/any(r:contains(r/emailAddress/address,'${value}') or contains(r/emailAddress/name,'${value}'))`);
                    break;
                case 'body':
                    filters.push(`contains(body/content,'${value}')`);
                    break;
            }
        }

        // If no directives were found but there's still search text, return empty array
        // to trigger the fallback generic search
        return hasDirectives ? filters : [];
    }

    mapSortField(sortBy) {
        switch (sortBy) {
            case 'date':
                return 'receivedDateTime';
            case 'subject':
                return 'subject';
            case 'from':
                return 'from/emailAddress/address';
            case 'size':
                return 'bodyPreview';
            default:
                return 'receivedDateTime';
        }
    }

    async getEmail(messageId, folder) {
        if (!this.graphClient) {
            throw new Error('Not connected to Outlook');
        }

        try {
            const message = await this.graphClient
                .api(`/me/messages/${messageId}`)
                .expand(`singleValueExtendedProperties($filter=id eq '${config.CUSTOM_HEADERS.OUTLOOK}')`)
                .select('*,internetMessageHeaders')
                .get();

            return this.parseOutlookMessage(message, folder);
        } catch (error) {
            return null;
        }
    }

    parseOutlookMessage(message, folder) {
        
        const { ignoreMessage, associations } = this.parseCustomHeaders(message);

        return {
            id: message.id,
            messageId: message.internetMessageId || message.id,
            threadId: message.conversationId,
            subject: message.subject || '(No Subject)',
            from: this.parseOutlookAddress(message.from),
            to: message.toRecipients?.map(addr => this.parseOutlookAddress(addr)) || [],
            cc: message.ccRecipients?.map(addr => this.parseOutlookAddress(addr)) || [],
            bcc: message.bccRecipients?.map(addr => this.parseOutlookAddress(addr)) || [],
            replyTo: message.replyTo?.map(addr => this.parseOutlookAddress(addr)) || [],
            date: new Date(message.receivedDateTime),
            bodyText: message.body?.contentType === 'text' ? message.body.content : '',
            bodyHtml: message.body?.contentType === 'html' ? message.body.content : '',
            attachments: this.parseOutlookAttachments(message.attachments),
            flags: {
                seen: message.isRead || false,
                flagged: message.flag?.flagStatus === 'flagged' || false,
                draft: message.isDraft || false,
                answered: false, // Not directly available in Graph API
                deleted: false
            },
            categories: message.categories || [],
            folder: folder || 'inbox',
            provider: 'outlook',
            inReplyTo: null, // Not directly available in Graph API
            references: [], // Not directly available in Graph API
            ignoreMessage: ignoreMessage,
            snippet: message?.bodyPreview,
            associations: associations
        };
    }

    parseCustomHeaders(message) {
        const getHeader = (name) => message?.internetMessageHeaders?.find(header => header?.name?.toLowerCase() === name?.toLowerCase())?.value;

        const ignorePropertyVal = message?.singleValueExtendedProperties?.find(
                prop => prop.id === config.CUSTOM_HEADERS.OUTLOOK
            )?.value === "true";

        const ignoreHeaderVal = getHeader(config.CUSTOM_HEADERS.CRM_IGNORE) === "true";
        const associationsHeaderVal = getHeader(config.CUSTOM_HEADERS.CRM_ASSOCIATIONS);

        return {
            ignoreMessage: ignorePropertyVal || ignoreHeaderVal,
            associations: JSON.parse(associationsHeaderVal || '{}')
        };
    }

    parseOutlookAddress(addressObj) {
        if (!addressObj) return { address: '' };

        return {
            name: addressObj.emailAddress?.name || '',
            address: addressObj.emailAddress?.address || ''
        };
    }

    parseOutlookAttachments(attachments) {
        if (!attachments) return [];

        return attachments.map(attachment => ({
            filename: attachment.name,
            contentType: attachment.contentType,
            size: attachment.size || 0,
            contentId: attachment.contentId,
            isInline: attachment.isInline || false,
            attachmentId: attachment.id,
            contentBytes: attachment?.contentBytes
        }));
    }

    async getThread(threadId, sortOptions = null) {
        if (!this.graphClient) {
            throw new Error('Not connected to Outlook');
        }


        try {
            const messages = await this.graphClient
                .api('/me/messages')
                .filter(`conversationId eq '${threadId}'`)
                .expand('attachments')
                .get();

            if (!messages.value || messages.value.length === 0) return null;

            const emails = messages.value.map(message => this.parseOutlookMessage(message));
            const threads = this.buildThreads(emails);
            const thread = threads[0] || null;
            
            // Sort the messages within the thread if sort options are provided
            if (thread && sortOptions) {
                thread.emails = this.sortThreadMessages(thread.emails, sortOptions);
            }
            
            return thread;
        } catch (error) {
            return null;
        }
    }

    async getThreads(request) {
        const emails = await this.getEmails(request);
        return this.buildThreads(emails);
    }

    async searchEmails(query) {
        if (!this.graphClient) {
            throw new Error('Not connected to Outlook');
        }

        let searchQuery = query.query || '';

        // Build search query using Outlook search syntax
        if (query.from) searchQuery += ` from:${query.from}`;
        if (query.to) searchQuery += ` to:${query.to}`;
        if (query.subject) searchQuery += ` subject:"${query.subject}"`;
        if (query.hasAttachment) searchQuery += ' hasattachments:true';
        if (query.isUnread) searchQuery += ' isread:false';
        if (query.isFlagged) searchQuery += ' isflagged:true';

        const messages = await this.graphClient
            .api('/me/messages')
            .search(searchQuery)
            .top(query.limit || 50)
            .expand('attachments')
            .get();

        const emails = messages.value.map(message => this.parseOutlookMessage(message));
        return { emails };
    }

    async searchThreads(query) {
        const emails = await this.searchEmails(query);
        return this.buildThreads(emails);
    }

    async markAsRead(request) {
        await this.updateMessageFlags(request.messageIds, { isRead: true });
        return { updated: request.messageIds.length };
    }

    async markAsUnread(request) {
        await this.updateMessageFlags(request.messageIds, { isRead: false });
        return { updated: request.messageIds.length };
    }

    async markAsFlagged(request) {
        await this.updateMessageFlags(request.messageIds, {
            flag: { flagStatus: 'flagged' }
        });
        return { updated: request.messageIds.length };
    }

    async markAsUnflagged(request) {
        await this.updateMessageFlags(request.messageIds, {
            flag: { flagStatus: 'notFlagged' }
        });
        return { updated: request.messageIds.length };
    }

    async updateMessageFlags(messageIds, updateData) {
        if (!this.graphClient) {
            throw new Error('Not connected to Outlook');
        }

        const updatePromises = messageIds.map(messageId =>
            this.graphClient.api(`/me/messages/${messageId}`).patch(updateData)
        );

        await Promise.all(updatePromises);
    }

    async deleteEmails(messageIds, folder) {
        
        if (!this.graphClient) {
            throw new Error('Not connected to Outlook');
        }

        // Handle both array format and object format for backward compatibility
        const ids = Array.isArray(messageIds) ? messageIds : messageIds.messageIds;
        
        // Validate input
        if (!ids || ids.length === 0) {
            throw new Error('No message IDs provided for deletion');
        }

        try {
            const deletePromises = ids.map(messageId =>
                this.graphClient.api(`/me/messages/${messageId}`).delete()
            );

            await Promise.all(deletePromises);
            return { deleted: ids.length };
        } catch (error) {
            logger.error('Outlook delete failed', {
                accountId: this.config.id,
                messageIds: ids,
                error: error.message,
                stack: error.stack
            });
            throw new Error(`Failed to delete Outlook emails: ${error.message}`);
        }
    }

    async moveEmails(request) {
        if (!this.graphClient) {
            throw new Error('Not connected to Outlook');
        }

        const movePromises = request.messageIds.map(messageId =>
            this.graphClient.api(`/me/messages/${messageId}/move`).post({
                destinationId: request.destinationFolder
            })
        );

        await Promise.all(movePromises);
        return { 
            data: { moved: request.messageIds.length },
            metadata: { provider: 'outlook' }
        };
    }

    async resolveOutlookMessageId(messageId) {
        if (!messageId) {
            throw new Error('Message ID is required');
        }

        // Check if this looks like an Outlook ID (alphanumeric with hyphens/underscores, no angle brackets or @)
        // Outlook IDs look like: AAMkAGE1M2IyZGNkLTE5NzUtNDYxZC04Y2E0LTkzZWVlNzM4MDg0MwBGAAAAAABkxw...
        const isOutlookId = /^[A-Za-z0-9_\-=]+$/.test(messageId);

        if (isOutlookId) {
            // Already an Outlook ID, return as-is
            return messageId;
        }

        // It's likely an internetMessageId (RFC 822 format like <abc@example.com>)
        // Search for the message using the internetMessageId filter
        try {
            const messages = await this.graphClient
                .api('/me/messages')
                .filter(`internetMessageId eq '${messageId}'`)
                .select('id')
                .top(1)
                .get();

            if (messages?.value && messages.value.length > 0) {
                return messages.value[0].id;
            }

            throw new Error(`Message not found with internetMessageId: ${messageId}`);
        } catch (error) {
            console.error('Error resolving Outlook message ID:', error);
            throw new Error(`Failed to resolve message ID: ${error.message}`);
        }
    }

    async sendEmail(options) {
        if (!this.graphClient) {
            throw new Error('Not connected to Outlook');
        }

        const message = {
            subject: options.subject,
            body: {
                contentType: options.bodyHtml ? 'html' : 'text',
                content: options.bodyHtml || options.bodyText || ''
            },
            toRecipients: options.to.map(addr => ({
                emailAddress: {
                    address: addr.address,
                    name: addr.name || addr.address
                }
            })),
            ccRecipients: options.cc?.map(addr => ({
                emailAddress: {
                    address: addr.address,
                    name: addr.name || addr.address
                }
            })) || [],
            bccRecipients: options.bcc?.map(addr => ({
                emailAddress: {
                    address: addr.address,
                    name: addr.name || addr.address
                }
            })) || []
        };

        // Add attachments if present
        if (options.attachments?.length) {
            message.attachments = options.attachments.map(attachment => {
                const graphAttachment = {
                    '@odata.type': '#microsoft.graph.fileAttachment',
                    name: attachment.filename,
                    contentType: attachment.contentType || 'application/octet-stream',
                    contentBytes: typeof attachment.content === 'string'
                        ? attachment.content
                        : Buffer.isBuffer(attachment.content)
                            ? attachment.content.toString('base64')
                            : Buffer.from(attachment.content).toString('base64')
                };

                // Add inline-specific properties for inline images
                if (attachment.isInline && attachment.cid) {
                    graphAttachment.contentId = attachment.cid;
                    graphAttachment.isInline = true;
                }

                return graphAttachment;
            });
        }

        await this.graphClient.api('/me/sendMail').post({
            message,
            saveToSentItems: true
        });

        return { messageId: 'sent', id: 'sent' };
    }

    async replyToEmail(originalMessageId, options) {
        if (!this.graphClient) {
            throw new Error('Not connected to Outlook');
        }

        // Resolve the Outlook message ID if internetMessageId is provided
        const outlookMessageId = await this.resolveOutlookMessageId(originalMessageId);

        if(options?.to?.length > 0) {
            options.to = options.to.map(addr => ({
                address: addr?.address,
                name: addr?.name || addr?.address
            }));
        }
    
        let toRecipient = options?.to?.map(addr => ({
            emailAddress: {
                address: addr?.address,
                name: addr?.name || addr?.address
            }
        })) || [];

        //remove duplicate addresses
        toRecipient = toRecipient.filter((recipient, index) => 
            toRecipient.findIndex(r => r.emailAddress.address.toLowerCase() === recipient.emailAddress.address.toLowerCase()) === index
        );

        const customHeaders = [
            {
                name: config.CUSTOM_HEADERS.CRM_IGNORE,
                value: (options.ignoreMessage || false).toString()
            },
        ];

        options?.associations && customHeaders.push({
            name: config.CUSTOM_HEADERS.CRM_ASSOCIATIONS,
            value: JSON.stringify(options.associations)
        });

        const replyMessage = {
            comment: options.bodyHtml || options.bodyText  || '',
            message: {
                toRecipients: toRecipient,
                singleValueExtendedProperties: [
                    {
                        "id": config.CUSTOM_HEADERS.OUTLOOK,
                        "value": (options.ignoreMessage || false).toString()
                    }
                ],
                internetMessageHeaders: customHeaders
            }
        };

        if (options.attachments?.length) {
            replyMessage.message.attachments = options.attachments.map(attachment => {
                const graphAttachment = {
                    '@odata.type': '#microsoft.graph.fileAttachment',
                    name: attachment.filename,
                    contentType: attachment.contentType || 'application/octet-stream',
                    contentBytes: typeof attachment.content === 'string'
                        ? attachment.content
                        : Buffer.isBuffer(attachment.content)
                            ? attachment.content.toString('base64')
                            : Buffer.from(attachment.content).toString('base64')
                };

                // Add inline-specific properties for inline images
                if (attachment.isInline && attachment.cid) {
                    graphAttachment.contentId = attachment.cid;
                    graphAttachment.isInline = true;
                }

                return graphAttachment;
            });
        }

        const endpoint = options.replyAll ? 'replyAll' : 'reply';
        await this.graphClient.api(`/me/messages/${outlookMessageId}/${endpoint}`).post(replyMessage);
    }

    async forwardEmail(originalMessageId, to, message, attachments = []) {
        if (!this.graphClient) {
            throw new Error('Not connected to Outlook');
        }

        // Resolve the Outlook message ID if internetMessageId is provided
        const outlookMessageId = await this.resolveOutlookMessageId(originalMessageId);

        const forwardMessage = {
            comment: message || '',
            toRecipients: to.map(addr => ({
                emailAddress: {
                    address: typeof addr === 'string' ? addr : addr.address,
                    name: typeof addr === 'string' ? addr : (addr.name || addr.address)
                }
            }))
        };

        // Add attachments if present
        if (attachments?.length) {
            forwardMessage.attachments = attachments.map(attachment => {
                const graphAttachment = {
                    '@odata.type': '#microsoft.graph.fileAttachment',
                    name: attachment.filename,
                    contentType: attachment.contentType || 'application/octet-stream',
                    contentBytes: typeof attachment.content === 'string'
                        ? attachment.content
                        : Buffer.isBuffer(attachment.content)
                            ? attachment.content.toString('base64')
                            : Buffer.from(attachment.content).toString('base64')
                };

                // Add inline-specific properties for inline images
                if (attachment.isInline && attachment.cid) {
                    graphAttachment.contentId = attachment.cid;
                    graphAttachment.isInline = true;
                }

                return graphAttachment;
            });
        }

        await this.graphClient.api(`/me/messages/${outlookMessageId}/forward`).post(forwardMessage);
    }

    async sync(folder) {
        // For real-time sync, implement Delta query or webhooks
        // This is a placeholder for polling-based sync
        logger.info('Sync called for folder', {
            accountId: this.config.id,
            folder,
            message: 'Delta query implementation needed for real-time updates'
        });
    }

    async createFolder(name, parentFolderId) {
        if (!this.graphClient) {
            throw new Error('Not connected to Outlook');
        }

        const folderData = {
            displayName: name
        };

        const endpoint = parentFolderId
            ? `/me/mailFolders/${parentFolderId}/childFolders`
            : '/me/mailFolders';

        return await this.graphClient.api(endpoint).post(folderData);
    }

    async deleteFolder(folderId) {
        if (!this.graphClient) {
            throw new Error('Not connected to Outlook');
        }

        await this.graphClient.api(`/me/mailFolders/${folderId}`).delete();
    }

    async getAttachment(messageId, attachmentId) {
        console.log("getting attachment for you ")
        if (!this.graphClient) {
            throw new Error('Not connected to Outlook');
        }

        try {
            const attachment = await this.graphClient.api(`/me/messages/${messageId}/attachments/${attachmentId}`).get();
            return {
                filename: attachment.name || 'attachment',
                contentType: attachment.contentType || 'application/octet-stream',
                size: attachment.size || 0,
                data: attachment.contentBytes ? Buffer.from(attachment.contentBytes, 'base64') : Buffer.alloc(0)
            };
        } catch (error) {
            throw new Error(`Failed to fetch Outlook attachment: ${error.message}`);
        }
    }

    async watchEmailAccount(accountId) {
        if (!this.graphClient) {
            throw new Error('Not connected to Outlook');
        }

        // Get notification URL from environment or use default
        const baseUrl = config.WEBHOOK_BASE_URL || 'https://6258c1ba9a1d.ngrok-free.app';
        const notificationUrl = `${baseUrl}/api/webhook/outlook`;

        // Expiration time (Microsoft Graph max ~70 hours = 4230 minutes)
        const expiration = new Date(Date.now() + 4230 * 60 * 1000).toISOString();

        // Resources to watch
        const resources = [
            { folder: "Inbox", type: "incoming" },
            { folder: "SentItems", type: "outgoing" }
        ];

        try {
            const results = {};

            // First, get user and clear ALL existing subscriptions ONCE before creating new ones
            let user = await EmailConfig.findOne({ _id: accountId });
            if (!user) throw new Error(`User with ID ${accountId} not found.`);

            // Ensure metadata field exists on the document
            if (!user.metadata) {
                await EmailConfig.updateOne({ _id: accountId }, { $set: { metadata: {} } });
                user = await EmailConfig.findOne({ _id: accountId });
            }

            user.metadata = user.metadata || {};
            const existingSubscriptions = user.metadata.subscriptions || [];

            // Remove ALL existing subscriptions for this account (only once, outside the loop)
            if (existingSubscriptions.length > 0) {
                await this.deleteSubscription(accountId);
                // Reload user data after deletions
                user = await EmailConfig.findOne({ _id: accountId });
                user.metadata = user.metadata || {};
            }

            // Ensure subscriptions array exists and is ready
            if (!user.metadata.subscriptions || !Array.isArray(user.metadata.subscriptions)) {
                await EmailConfig.updateOne(
                    { _id: accountId },
                    { $set: { 'metadata.subscriptions': [] } }
                );
                user = await EmailConfig.findOne({ _id: accountId });
            }

            // Now create new subscriptions
            for (const { folder, type } of resources) {
                const subscriptionPayload = {
                    changeType: "created",
                    notificationUrl,
                    resource: `/me/mailFolders/${folder}/messages`,
                    expirationDateTime: expiration,
                    clientState: `outlook_${this.config.id}_${type}_${Date.now()}`
                };

                const result = await this.graphClient.api("/subscriptions").post(subscriptionPayload);
                results[type] = result;

                // Add the new subscription to the database
                user.metadata.subscriptions.push({
                    subscriptionId: result.id,
                    expirationDateTime: result.expirationDateTime,
                    type: type,
                    isActive: true
                });

                logger.info('Created subscription', {
                    accountId: this.config.id,
                    type,
                    subscriptionId: result.id,
                    resource: result.resource,
                    expirationDateTime: result.expirationDateTime
                });
            }

            // Save all subscriptions at once using direct update to ensure persistence
            await EmailConfig.updateOne(
                { _id: accountId },
                { $set: { 'metadata.subscriptions': user.metadata.subscriptions } }
            );

            logger.info('Subscriptions saved for user', {
                accountId: user._id,
                subscriptionIds: user.metadata.subscriptions.map(s => s.subscriptionId),
                count: user.metadata.subscriptions.length
            });

            return {
                success: true,
                message: "Created subscriptions for Inbox and Sent Items",
                subscriptions: results,
                notificationUrl
            };

    } catch(error) {
        logger.error('Outlook subscription error', {
            accountId: this.config.id,
            error: error.message,
            responseData: error.response?.data,
            stack: error.stack
        });
        throw new Error(`Failed to create Outlook subscription: ${error.message}`);
    }
}


    async getSignature() {
        throw new Error('Microsoft Graph APIs do not support getting signatures');
    }

    async deleteSubscription(accountId) {
    if (!this.graphClient) {
        throw new Error('Not connected to Outlook');
    }

    try {
        const deletedSubscriptions = [];
        const errors = [];

        // Get user from database
        const user = await EmailConfig.findOne({ _id: accountId });
        if (!user) {
            throw new Error(`User with ID ${accountId} not found.`);
        }

        user.metadata = user.metadata || {};
        const existingSubscriptions = user.metadata.subscriptions || [];

        // List all active subscriptions from Microsoft Graph
        let activeSubscriptions = [];
        try {
            const subscriptionsResponse = await this.graphClient.api('/subscriptions').get();
            activeSubscriptions = subscriptionsResponse.value || [];
        } catch (error) {
            logger.error('Error fetching subscriptions from Microsoft Graph', {
                accountId,
                error: error.message,
                stack: error.stack
            });
        }

        // Combine subscriptions from database and Microsoft Graph
        const allSubscriptionIds = new Set();

        // Add from database
        existingSubscriptions.forEach(sub => {
            if (sub.subscriptionId) {
                allSubscriptionIds.add(sub.subscriptionId);
            }
        });

        // Add from Microsoft Graph (in case there are orphaned subscriptions)
        activeSubscriptions.forEach(sub => {
            allSubscriptionIds.add(sub.id);
        });


        // Delete each subscription from Microsoft Graph
        for (const subscriptionId of allSubscriptionIds) {
            try {
                await this.graphClient.api(`/subscriptions/${subscriptionId}`).delete();
                deletedSubscriptions.push(subscriptionId);
            } catch (error) {
                const errorMsg = `Failed to delete subscription ${subscriptionId}: ${error.message}`;
                errors.push(errorMsg);
            }
        }

        // Clear all subscriptions from database using direct update
        await EmailConfig.updateOne(
            { _id: accountId },
            { $set: { 'metadata.subscriptions': [] } }
        );

        return {
            success: true,
            message: `Deleted ${deletedSubscriptions.length} subscriptions, ${errors.length} errors`,
            deletedSubscriptions,
            errors,
            totalAttempted: allSubscriptionIds.size
        };
    } catch (error) {
        logger.error('Error deleting subscriptions', {
            accountId,
            error: error.message,
            responseData: error.response?.data,
            stack: error.stack
        });
        throw new Error(`Failed to delete subscriptions: ${error.message}`);
    }
}

    async listSubscriptions() {
    if (!this.graphClient) {
        throw new Error('Not connected to Outlook');
    }

    try {
        const subscriptions = await this.graphClient.api('/subscriptions').get();
        return {
            success: true,
            subscriptions: subscriptions.value || []
        };
    } catch (error) {
        logger.error('Error listing subscriptions', {
            accountId: this.config.id,
            error: error.message,
            responseData: error.response?.data,
            stack: error.stack
        });
        throw new Error(`Failed to list subscriptions: ${error.message}`);
    }
}
}