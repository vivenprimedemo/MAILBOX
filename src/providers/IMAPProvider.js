import Imap from 'imap';
import nodemailer from 'nodemailer';
import { simpleParser } from 'mailparser';
import { BaseEmailProvider } from './BaseEmailProvider.js';
import logger from '../lib/logger.js';
// Import types would normally be here for TypeScript
// For JavaScript, we'll use JSDoc comments instead

export class IMAPProvider extends BaseEmailProvider {
    imapClient;
    smtpTransporter;
    folders = [];

    constructor(config) {
        super(config);
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
            maxAttachmentSize: 25 * 1024 * 1024 // 25MB
        };
    }

    async connect() {
        return new Promise((resolve, reject) => {
            this.imapClient = new Imap({
                host: this.config.host,
                port: this.config.port || 993,
                tls: this.config.secure !== false,
                user: this.config.auth.user,
                password: this.config.auth.pass,
                tlsOptions: this.config.tls || { rejectUnauthorized: false }
            });

            this.imapClient.once('ready', () => {
                this.isConnected = true;
                this.setupSMTP();
                resolve();
            });

            this.imapClient.once('error', (err) => {
                this.isConnected = false;
                reject(err);
            });

            this.imapClient.once('end', () => {
                this.isConnected = false;
            });

            this.imapClient.connect();
        });
    }

    setupSMTP() {
        this.smtpTransporter = nodemailer.createTransport({
            host: this.config.host.replace('imap', 'smtp'),
            port: 587,
            secure: false,
            auth: {
                user: this.config.auth.user,
                pass: this.config.auth.pass
            }
        });
    }

    async disconnect() {
        if (this.imapClient) {
            this.imapClient.end();
            this.isConnected = false;
        }
    }

    async authenticate(credentials) {
        try {
            await this.connect();
            return true;
        } catch (error) {
            return false;
        }
    }

    async getFolders() {
        return new Promise((resolve, reject) => {
            if (!this.imapClient) {
                reject(new Error('Not connected'));
                return;
            }

            this.imapClient.getBoxes((err, boxes) => {
                if (err) {
                    reject(err);
                    return;
                }

                this.folders = this.parseBoxes(boxes);
                resolve(this.folders);
            });
        });
    }

    parseBoxes(boxes, parent) {
        const folders = [];

        Object.keys(boxes).forEach(name => {
            const box = boxes[name];
            const fullName = parent ? `${parent}${box.delimiter}${name}` : name;

            const folder = {
                name: fullName,
                displayName: name,
                type: this.getFolderType(name.toLowerCase()),
                unreadCount: 0,
                totalCount: 0,
                parent
            };

            if (box.children) {
                folder.children = this.parseBoxes(box.children, fullName);
            }

            folders.push(folder);
        });

        return folders;
    }

    getFolderType(name) {
        if (name.includes('inbox')) return 'inbox';
        if (name.includes('sent')) return 'sent';
        if (name.includes('draft')) return 'drafts';
        if (name.includes('trash') || name.includes('deleted')) return 'trash';
        if (name.includes('spam') || name.includes('junk')) return 'spam';
        return 'custom';
    }

    async getEmails(request) {
        const { folderId: folder = 'INBOX', limit = 50, offset = 0 } = request;
        return new Promise((resolve, reject) => {
            if (!this.imapClient) {
                reject(new Error('Not connected'));
                return;
            }

            this.imapClient.openBox(folder, true, (err, box) => {
                if (err) {
                    reject(err);
                    return;
                }

                const total = box.messages.total;
                const start = Math.max(1, total - offset - limit + 1);
                const end = total - offset;

                if (start > end) {
                    resolve([]);
                    return;
                }

                const fetch = this.imapClient.seq.fetch(`${start}:${end}`, {
                    bodies: '',
                    struct: true
                });

                const emails = [];

                fetch.on('message', (msg, seqno) => {
                    let uid;
                    let flags = [];

                    msg.once('attributes', (attrs) => {
                        uid = attrs.uid;
                        flags = attrs.flags || [];
                    });

                    msg.once('body', (stream) => {
                        let buffer = '';
                        stream.on('data', (chunk) => {
                            buffer += chunk.toString('utf8');
                        });

                        stream.once('end', async () => {
                            try {
                                const parsed = await simpleParser(buffer);
                                const email = this.parseEmailFromImap(parsed, uid.toString(), flags, folder);
                                emails.push(email);
                            } catch (error) {
                                logger.error('Error parsing IMAP email', {
                                    error: error.message,
                                    seqno,
                                    uid,
                                    folderId: folder
                                });
                            }
                        });
                    });
                });

                fetch.once('error', reject);
                fetch.once('end', () => {
                    emails.sort((a, b) => b.date.getTime() - a.date.getTime());
                    resolve(emails);
                });
            });
        });
    }

    async listEmails(request) {
        try {
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
                dateTo
            } = request;

            return new Promise((resolve, reject) => {
                if (!this.imapClient) {
                    reject(new Error('Not connected'));
                    return;
                }

                this.imapClient.openBox(folderId, true, (err, box) => {
                    if (err) {
                        reject(err);
                        return;
                    }

                    const total = box.messages.total;

                    // Build search criteria for IMAP
                    let searchCriteria = ['ALL'];

                    if (search) {
                        searchCriteria.push(['OR', ['SUBJECT', search], ['BODY', search]]);
                    }
                    if (from) searchCriteria.push(['FROM', from]);
                    if (to) searchCriteria.push(['TO', to]);
                    if (subject) searchCriteria.push(['SUBJECT', subject]);
                    if (isUnread === true) searchCriteria.push(['UNSEEN']);
                    if (isUnread === false) searchCriteria.push(['SEEN']);
                    if (isFlagged === true) searchCriteria.push(['FLAGGED']);
                    if (isFlagged === false) searchCriteria.push(['UNFLAGGED']);
                    if (dateFrom) searchCriteria.push(['SINCE', dateFrom]);
                    if (dateTo) searchCriteria.push(['BEFORE', dateTo]);

                    this.imapClient.search(searchCriteria, (err, uids) => {
                        if (err) {
                            reject(err);
                            return;
                        }

                        if (!uids.length) {
                            resolve({
                                emails: [],
                                metadata: {
                                    total: 0,
                                    limit,
                                    offset,
                                    hasMore: false,
                                    currentPage: Math.floor(offset / limit) + 1,
                                    totalPages: 0,
                                    nextOffset: null
                                }
                            });
                            return;
                        }

                        // Apply pagination to UIDs
                        const paginatedUids = uids.slice(offset, offset + limit);

                        const fetch = this.imapClient.fetch(paginatedUids, {
                            bodies: '',
                            struct: true
                        });

                        const emails = [];

                        fetch.on('message', (msg, seqno) => {
                            let uid;
                            let flags = [];

                            msg.once('attributes', (attrs) => {
                                uid = attrs.uid;
                                flags = attrs.flags || [];
                            });

                            msg.once('body', (stream) => {
                                let buffer = '';
                                stream.on('data', (chunk) => {
                                    buffer += chunk.toString('utf8');
                                });

                                stream.once('end', async () => {
                                    try {
                                        const parsed = await simpleParser(buffer);
                                        const email = this.parseEmailFromImap(parsed, uid.toString(), flags, folderId);
                                        emails.push(email);
                                    } catch (error) {
                                        logger.error('Error parsing IMAP email in listEmails', {
                                            error: error.message,
                                            seqno,
                                            uid,
                                            folderId
                                        });
                                    }
                                });
                            });
                        });

                        fetch.once('error', reject);
                        fetch.once('end', () => {
                            // Apply sorting
                            const sortedEmails = this.sortEmails(emails, sortBy, sortOrder);

                            const hasMore = offset + limit < uids.length;

                            resolve({
                                emails: sortedEmails,
                                metadata: {
                                    total: uids.length,
                                    limit,
                                    offset,
                                    hasMore,
                                    currentPage: Math.floor(offset / limit) + 1,
                                    totalPages: Math.ceil(uids.length / limit),
                                    nextOffset: hasMore ? offset + limit : null
                                }
                            });
                        });
                    });
                });
            });
        } catch (error) {
            throw error;
        }

    }
    async listEmailsV2(request) {
        try {
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
                dateTo
            } = request;

            return new Promise((resolve, reject) => {
                if (!this.imapClient) {
                    reject(new Error('Not connected'));
                    return;
                }

                this.imapClient.openBox(folderId, true, (err, box) => {
                    if (err) {
                        reject(err);
                        return;
                    }

                    const total = box.messages.total;

                    // Build search criteria for IMAP
                    let searchCriteria = ['ALL'];

                    if (search) {
                        searchCriteria.push(['OR', ['SUBJECT', search], ['BODY', search]]);
                    }
                    if (from) searchCriteria.push(['FROM', from]);
                    if (to) searchCriteria.push(['TO', to]);
                    if (subject) searchCriteria.push(['SUBJECT', subject]);
                    if (isUnread === true) searchCriteria.push(['UNSEEN']);
                    if (isUnread === false) searchCriteria.push(['SEEN']);
                    if (isFlagged === true) searchCriteria.push(['FLAGGED']);
                    if (isFlagged === false) searchCriteria.push(['UNFLAGGED']);
                    if (dateFrom) searchCriteria.push(['SINCE', dateFrom]);
                    if (dateTo) searchCriteria.push(['BEFORE', dateTo]);

                    this.imapClient.search(searchCriteria, (err, uids) => {
                        if (err) {
                            reject(err);
                            return;
                        }

                        if (!uids.length) {
                            resolve({
                                emails: [],
                                metadata: {
                                    total: 0,
                                    limit,
                                    offset,
                                    hasMore: false,
                                    currentPage: Math.floor(offset / limit) + 1,
                                    totalPages: 0,
                                    nextOffset: null
                                }
                            });
                            return;
                        }

                        // Apply pagination to UIDs
                        const paginatedUids = uids.slice(offset, offset + limit);

                        const fetch = this.imapClient.fetch(paginatedUids, {
                            bodies: '',
                            struct: true
                        });

                        const emails = [];

                        fetch.on('message', (msg, seqno) => {
                            let uid;
                            let flags = [];

                            msg.once('attributes', (attrs) => {
                                uid = attrs.uid;
                                flags = attrs.flags || [];
                            });

                            msg.once('body', (stream) => {
                                let buffer = '';
                                stream.on('data', (chunk) => {
                                    buffer += chunk.toString('utf8');
                                });

                                stream.once('end', async () => {
                                    try {
                                        const parsed = await simpleParser(buffer);
                                        const email = this.parseEmailFromImap(parsed, uid.toString(), flags, folderId);
                                        emails.push(email);
                                    } catch (error) {
                                        logger.error('Error parsing IMAP email in listEmailsV2', {
                                            error: error.message,
                                            seqno,
                                            uid,
                                            folderId
                                        });
                                    }
                                });
                            });
                        });

                        fetch.once('error', reject);
                        fetch.once('end', () => {
                            // Apply sorting
                            const sortedEmails = this.sortEmails(emails, sortBy, sortOrder);

                            const hasMore = offset + limit < uids.length;

                            resolve({
                                emails: sortedEmails,
                                metadata: {
                                    total: uids.length,
                                    limit,
                                    offset,
                                    hasMore,
                                    currentPage: Math.floor(offset / limit) + 1,
                                    totalPages: Math.ceil(uids.length / limit),
                                    nextOffset: hasMore ? offset + limit : null
                                }
                            });
                        });
                    });
                });
            });
        } catch (error) {
            throw error;
        }
    }

    sortEmails(emails, sortBy, sortOrder) {
        return emails.sort((a, b) => {
            let aVal, bVal;

            switch (sortBy) {
                case 'date':
                    aVal = new Date(a.date);
                    bVal = new Date(b.date);
                    break;
                case 'subject':
                    aVal = (a.subject || '').toLowerCase();
                    bVal = (b.subject || '').toLowerCase();
                    break;
                case 'from':
                    aVal = (a.from?.name || a.from?.address || '').toLowerCase();
                    bVal = (b.from?.name || b.from?.address || '').toLowerCase();
                    break;
                case 'size':
                    aVal = a.size || 0;
                    bVal = b.size || 0;
                    break;
                default:
                    return 0;
            }

            if (aVal < bVal) return sortOrder === 'asc' ? -1 : 1;
            if (aVal > bVal) return sortOrder === 'asc' ? 1 : -1;
            return 0;
        });
    }

    parseEmailFromImap(parsed, uid, flags, folder) {
        return {
            id: uid,
            messageId: parsed.messageId || this.generateMessageId(),
            threadId: this.extractThreadId(parsed),
            subject: parsed.subject || '(No Subject)',
            from: this.parseAddress(parsed.from?.value?.[0]),
            to: this.parseAddresses(parsed.to?.value || []),
            cc: this.parseAddresses(parsed.cc?.value || []),
            bcc: this.parseAddresses(parsed.bcc?.value || []),
            replyTo: this.parseAddresses(parsed.replyTo?.value || []),
            date: parsed.date || new Date(),
            bodyText: parsed.text,
            bodyHtml: parsed.html,
            attachments: this.parseAttachments(parsed.attachments || []),
            flags: {
                seen: flags.includes('\\Seen'),
                flagged: flags.includes('\\Flagged'),
                draft: flags.includes('\\Draft'),
                answered: flags.includes('\\Answered'),
                deleted: flags.includes('\\Deleted')
            },
            folder,
            provider: 'imap',
            inReplyTo: parsed.inReplyTo,
            references: this.parseReferences(parsed.references?.split(' '))
        };
    }

    extractThreadId(parsed) {
        // Use In-Reply-To or References for threading
        if (parsed.inReplyTo) return parsed.inReplyTo;
        if (parsed.references) {
            const refs = parsed.references.split(' ');
            return refs[0] || parsed.messageId;
        }
        return parsed.messageId;
    }

    parseAddress(addr) {
        if (!addr) return { address: '' };
        return {
            name: addr.name,
            address: addr.address
        };
    }

    parseAddresses(addresses) {
        return addresses.map(addr => this.parseAddress(addr));
    }

    parseAttachments(attachments) {
        return attachments.map(att => ({
            filename: att.filename,
            contentType: att.contentType,
            size: att.size,
            contentId: att.cid,
            data: att.content
        }));
    }

    async getEmail(messageId, folder) {
        // Implementation for getting specific email
        const emails = await this.getEmails({ folderId: folder || 'INBOX', limit: 1000 });
        return emails.find(email => email.messageId === messageId) || null;
    }

    async getThread(threadId, sortOptions = null) {
        const emails = await this.getEmails({ folderId: 'INBOX', limit: 1000 });
        const threadEmails = emails.filter(email => email.threadId === threadId);
        if (threadEmails.length === 0) return null;

        const threads = this.buildThreads(threadEmails);
        const thread = threads[0] || null;
        
        // Sort the messages within the thread if sort options are provided
        if (thread && sortOptions) {
            thread.emails = this.sortThreadMessages(thread.emails, sortOptions);
        }
        
        return thread;
    }

    async getThreads(request) {
        const emails = await this.getEmails(request);
        return this.buildThreads(emails);
    }

    async searchEmails(query) {
        // Basic implementation - can be enhanced
        const emails = await this.getEmails({ folderId: query.folder || 'INBOX', limit: 1000 });

        const filteredEmails = emails.filter(email => {
            if (query.query && !email.subject.toLowerCase().includes(query.query.toLowerCase())) {
                return false;
            }
            if (query.from && !email.from.address.includes(query.from)) {
                return false;
            }
            if (query.isUnread !== undefined && query.isUnread !== !email.flags.seen) {
                return false;
            }
            return true;
        });

        return { emails: filteredEmails };
    }

    async searchThreads(query) {
        const emails = await this.searchEmails(query);
        return this.buildThreads(emails);
    }

    async markAsRead(request) {
        await this.updateFlags(request.messageIds, ['\\Seen'], 'add', request.folderId);
        return { updated: request.messageIds.length };
    }

    async markAsUnread(request) {
        await this.updateFlags(request.messageIds, ['\\Seen'], 'remove', request.folderId);
        return { updated: request.messageIds.length };
    }

    async markAsFlagged(request) {
        await this.updateFlags(request.messageIds, ['\\Flagged'], 'add', request.folderId);
        return { updated: request.messageIds.length };
    }

    async markAsUnflagged(request) {
        await this.updateFlags(request.messageIds, ['\\Flagged'], 'remove', request.folderId);
        return { updated: request.messageIds.length };
    }

    async updateFlags(messageIds, flags, action, folder) {
        return new Promise((resolve, reject) => {
            if (!this.imapClient) {
                reject(new Error('Not connected'));
                return;
            }

            this.imapClient.openBox(folder || 'INBOX', false, (err) => {
                if (err) {
                    reject(err);
                    return;
                }

                const operation = action === 'add' ? 'addFlags' : 'delFlags';
                this.imapClient[operation](messageIds, flags, (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });
        });
    }

    async deleteEmails(request) {
        await this.updateFlags(request.messageIds, ['\\Deleted'], 'add', request.folderId);
        await this.expunge(request.folderId);
        return { deleted: request.messageIds.length };
    }

    async expunge(folder) {
        return new Promise((resolve, reject) => {
            if (!this.imapClient) {
                reject(new Error('Not connected'));
                return;
            }

            this.imapClient.openBox(folder || 'INBOX', false, (err) => {
                if (err) {
                    reject(err);
                    return;
                }

                this.imapClient.expunge((err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });
        });
    }

    async moveEmails(request) {
        return new Promise((resolve, reject) => {
            if (!this.imapClient) {
                reject(new Error('Not connected'));
                return;
            }

            this.imapClient.openBox(request.sourceFolder, false, (err) => {
                if (err) {
                    reject(err);
                    return;
                }

                this.imapClient.move(request.messageIds, request.destinationFolder, (err) => {
                    if (err) reject(err);
                    else resolve({ moved: request.messageIds.length });
                });
            });
        });
    }

    async sendEmail(options) {
        if (!this.smtpTransporter) {
            throw new Error('SMTP not configured');
        }

        const mailOptions = {
            from: this.config.auth.user,
            to: options.to.map(addr => `${addr.name ? `"${addr.name}" ` : ''}<${addr.address}>`).join(', '),
            cc: options.cc?.map(addr => `${addr.name ? `"${addr.name}" ` : ''}<${addr.address}>`).join(', '),
            bcc: options.bcc?.map(addr => `${addr.name ? `"${addr.name}" ` : ''}<${addr.address}>`).join(', '),
            subject: options.subject,
            text: options.bodyText,
            html: options.bodyHtml,
            attachments: options.attachments,
            inReplyTo: options.inReplyTo,
            references: options.references?.join(' '),
            headers: {
                'X-CRM-IGNORE': 'true'
            }
        };

        const info = await this.smtpTransporter.sendMail(mailOptions);
        return { messageId: info.messageId, id: info.messageId };
    }

    async replyToEmail(originalMessageId, options) {
        const originalEmail = await this.getEmail(originalMessageId);
        if (!originalEmail) {
            throw new Error('Original email not found');
        }

        return this.sendEmail({
            to: [originalEmail.from],
            subject: `Re: ${originalEmail.subject}`,
            inReplyTo: originalEmail.messageId,
            references: [originalEmail.messageId, ...(originalEmail.references || [])],
            ...options
        });
    }

    async forwardEmail(originalMessageId, to, message) {
        const originalEmail = await this.getEmail(originalMessageId);
        if (!originalEmail) {
            throw new Error('Original email not found');
        }

        const forwardedContent = `
${message || ''}

---------- Forwarded message ---------
From: ${originalEmail.from.name ? `"${originalEmail.from.name}" ` : ''}<${originalEmail.from.address}>
Date: ${originalEmail.date.toLocaleString()}
Subject: ${originalEmail.subject}
To: ${originalEmail.to.map(addr => `${addr.name ? `"${addr.name}" ` : ''}<${addr.address}>`).join(', ')}

${originalEmail.bodyText || originalEmail.bodyHtml || ''}
    `;

        return this.sendEmail({
            to,
            subject: `Fwd: ${originalEmail.subject}`,
            bodyText: forwardedContent,
            attachments: originalEmail.attachments?.map(att => ({
                filename: att.filename,
                content: att.data,
                contentType: att.contentType
            }))
        });
    }

    async sync(folder) {
        // Implement real-time sync using IMAP IDLE
        if (!this.imapClient) return;

        this.imapClient.openBox(folder || 'INBOX', true, (err) => {
            if (err) return;

            this.imapClient.on('mail', () => {
                // New mail received
                this.getEmails({ folderId: folder || 'INBOX', limit: 1 }).then(emails => {
                    if (emails.length > 0) {
                        this.emitNewEmail(emails[0]);
                    }
                });
            });
        });
    }

    async getSignature() {
        // IMAP doesn't have a direct way to fetch signatures as they're client-side
        return this.createSuccessResponse({
            signature: '',
            provider: 'imap',
            hasSignature: false,
            message: 'IMAP signatures are managed client-side and not accessible via protocol'
        });
    }

    async getAttachment(_messageId, _attachmentId) {
        // Basic implementation - would need to be expanded based on actual IMAP attachment handling
        return this.createErrorResponse('NOT_IMPLEMENTED', 
            'Attachment retrieval not implemented for IMAP provider');
    }
}