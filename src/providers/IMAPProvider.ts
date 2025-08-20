import * as Imap from 'imap';
import * as nodemailer from 'nodemailer';
import { simpleParser } from 'mailparser';
import { BaseEmailProvider } from './BaseEmailProvider';
import { 
  IEmailProviderCapabilities, 
  ISendEmailOptions,
  IEmailProviderConfig 
} from '../interfaces/IEmailProvider';
import { IEmail, IFolder, IEmailSearchQuery, IEmailThread, IEmailAddress } from '../interfaces/IEmail';

export class IMAPProvider extends BaseEmailProvider {
  private imapClient?: Imap;
  private smtpTransporter?: nodemailer.Transporter;
  private folders: IFolder[] = [];

  constructor(config: IEmailProviderConfig) {
    super(config);
  }

  getCapabilities(): IEmailProviderCapabilities {
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

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.imapClient = new Imap({
        host: this.config.host!,
        port: this.config.port || 993,
        tls: this.config.secure !== false,
        user: this.config.auth.user,
        password: this.config.auth.pass!,
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

  private setupSMTP(): void {
    this.smtpTransporter = nodemailer.createTransporter({
      host: this.config.host!.replace('imap', 'smtp'),
      port: 587,
      secure: false,
      auth: {
        user: this.config.auth.user,
        pass: this.config.auth.pass!
      }
    });
  }

  async disconnect(): Promise<void> {
    if (this.imapClient) {
      this.imapClient.end();
      this.isConnected = false;
    }
  }

  async authenticate(credentials?: any): Promise<boolean> {
    try {
      await this.connect();
      return true;
    } catch (error) {
      return false;
    }
  }

  async getFolders(): Promise<IFolder[]> {
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

  private parseBoxes(boxes: any, parent?: string): IFolder[] {
    const folders: IFolder[] = [];

    Object.keys(boxes).forEach(name => {
      const box = boxes[name];
      const fullName = parent ? `${parent}${box.delimiter}${name}` : name;
      
      const folder: IFolder = {
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

  private getFolderType(name: string): IFolder['type'] {
    if (name.includes('inbox')) return 'inbox';
    if (name.includes('sent')) return 'sent';
    if (name.includes('draft')) return 'drafts';
    if (name.includes('trash') || name.includes('deleted')) return 'trash';
    if (name.includes('spam') || name.includes('junk')) return 'spam';
    return 'custom';
  }

  async getEmails(folder: string, limit: number = 50, offset: number = 0): Promise<IEmail[]> {
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

        const fetch = this.imapClient!.seq.fetch(`${start}:${end}`, {
          bodies: '',
          struct: true
        });

        const emails: IEmail[] = [];

        fetch.on('message', (msg, seqno) => {
          let uid: number;
          let flags: string[] = [];

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

  private parseEmailFromImap(parsed: any, uid: string, flags: string[], folder: string): IEmail {
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

  private extractThreadId(parsed: any): string {
    // Use In-Reply-To or References for threading
    if (parsed.inReplyTo) return parsed.inReplyTo;
    if (parsed.references) {
      const refs = parsed.references.split(' ');
      return refs[0] || parsed.messageId;
    }
    return parsed.messageId;
  }

  private parseAddress(addr: any): IEmailAddress {
    if (!addr) return { address: '' };
    return {
      name: addr.name,
      address: addr.address
    };
  }

  private parseAddresses(addresses: any[]): IEmailAddress[] {
    return addresses.map(addr => this.parseAddress(addr));
  }

  private parseAttachments(attachments: any[]): any[] {
    return attachments.map(att => ({
      filename: att.filename,
      contentType: att.contentType,
      size: att.size,
      contentId: att.cid,
      data: att.content
    }));
  }

  async getEmail(messageId: string, folder?: string): Promise<IEmail | null> {
    // Implementation for getting specific email
    const emails = await this.getEmails(folder || 'INBOX', 1000);
    return emails.find(email => email.messageId === messageId) || null;
  }

  async getThread(threadId: string): Promise<IEmailThread | null> {
    const emails = await this.getEmails('INBOX', 1000);
    const threadEmails = emails.filter(email => email.threadId === threadId);
    if (threadEmails.length === 0) return null;
    
    const threads = this.buildThreads(threadEmails);
    return threads[0] || null;
  }

  async getThreads(folder: string, limit?: number, offset?: number): Promise<IEmailThread[]> {
    const emails = await this.getEmails(folder, limit, offset);
    return this.buildThreads(emails);
  }

  async searchEmails(query: IEmailSearchQuery): Promise<IEmail[]> {
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

  async searchThreads(query: IEmailSearchQuery): Promise<IEmailThread[]> {
    const emails = await this.searchEmails(query);
    return this.buildThreads(emails);
  }

  async markAsRead(messageIds: string[], folder?: string): Promise<void> {
    await this.updateFlags(messageIds, ['\\Seen'], 'add', folder);
  }

  async markAsUnread(messageIds: string[], folder?: string): Promise<void> {
    await this.updateFlags(messageIds, ['\\Seen'], 'remove', folder);
  }

  async markAsFlagged(messageIds: string[], folder?: string): Promise<void> {
    await this.updateFlags(messageIds, ['\\Flagged'], 'add', folder);
  }

  async markAsUnflagged(messageIds: string[], folder?: string): Promise<void> {
    await this.updateFlags(messageIds, ['\\Flagged'], 'remove', folder);
  }

  private async updateFlags(messageIds: string[], flags: string[], action: 'add' | 'remove', folder?: string): Promise<void> {
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
        this.imapClient![operation](messageIds, flags, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    });
  }

  async deleteEmails(messageIds: string[], folder?: string): Promise<void> {
    await this.updateFlags(messageIds, ['\\Deleted'], 'add', folder);
    await this.expunge(folder);
  }

  private async expunge(folder?: string): Promise<void> {
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

        this.imapClient!.expunge((err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    });
  }

  async moveEmails(messageIds: string[], fromFolder: string, toFolder: string): Promise<void> {
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

        this.imapClient!.move(messageIds, toFolder, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    });
  }

  async sendEmail(options: ISendEmailOptions): Promise<string> {
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

  async replyToEmail(originalMessageId: string, options: Omit<ISendEmailOptions, 'to' | 'subject' | 'inReplyTo' | 'references'>): Promise<string> {
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

  async forwardEmail(originalMessageId: string, to: IEmailAddress[], message?: string): Promise<string> {
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
        content: att.data!,
        contentType: att.contentType
      }))
    });
  }

  async sync(folder?: string): Promise<void> {
    // Implement real-time sync using IMAP IDLE
    if (!this.imapClient) return;

    this.imapClient.openBox(folder || 'INBOX', true, (err) => {
      if (err) return;
      
      this.imapClient!.on('mail', () => {
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