import Imap from 'imap';
import nodemailer from 'nodemailer';
import { simpleParser } from 'mailparser';
import { BaseEmailProvider } from './BaseEmailProvider.js';
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

  async getEmails(folder, limit = 50, offset = 0) {
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
                console.error('Error parsing email:', error);
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
    const emails = await this.getEmails(folder || 'INBOX', 1000);
    return emails.find(email => email.messageId === messageId) || null;
  }

  async getThread(threadId) {
    const emails = await this.getEmails('INBOX', 1000);
    const threadEmails = emails.filter(email => email.threadId === threadId);
    if (threadEmails.length === 0) return null;
    
    const threads = this.buildThreads(threadEmails);
    return threads[0] || null;
  }

  async getThreads(folder, limit, offset) {
    const emails = await this.getEmails(folder, limit, offset);
    return this.buildThreads(emails);
  }

  async searchEmails(query) {
    // Basic implementation - can be enhanced
    const emails = await this.getEmails(query.folder || 'INBOX', 1000);
    
    return emails.filter(email => {
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
  }

  async searchThreads(query) {
    const emails = await this.searchEmails(query);
    return this.buildThreads(emails);
  }

  async markAsRead(messageIds, folder) {
    await this.updateFlags(messageIds, ['\\Seen'], 'add', folder);
  }

  async markAsUnread(messageIds, folder) {
    await this.updateFlags(messageIds, ['\\Seen'], 'remove', folder);
  }

  async markAsFlagged(messageIds, folder) {
    await this.updateFlags(messageIds, ['\\Flagged'], 'add', folder);
  }

  async markAsUnflagged(messageIds, folder) {
    await this.updateFlags(messageIds, ['\\Flagged'], 'remove', folder);
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

  async deleteEmails(messageIds, folder) {
    await this.updateFlags(messageIds, ['\\Deleted'], 'add', folder);
    await this.expunge(folder);
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

  async moveEmails(messageIds, fromFolder, toFolder) {
    return new Promise((resolve, reject) => {
      if (!this.imapClient) {
        reject(new Error('Not connected'));
        return;
      }

      this.imapClient.openBox(fromFolder, false, (err) => {
        if (err) {
          reject(err);
          return;
        }

        this.imapClient.move(messageIds, toFolder, (err) => {
          if (err) reject(err);
          else resolve();
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
      references: options.references?.join(' ')
    };

    const info = await this.smtpTransporter.sendMail(mailOptions);
    return info.messageId;
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
        this.getEmails(folder || 'INBOX', 1).then(emails => {
          if (emails.length > 0) {
            this.emitNewEmail(emails[0]);
          }
        });
      });
    });
  }
}