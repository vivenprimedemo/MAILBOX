import { IEmail, IEmailThread, IFolder, IEmailSearchQuery, IEmailAddress } from './IEmail';

export interface IEmailProviderConfig {
  type: 'gmail' | 'outlook' | 'imap' | 'pop3';
  host?: string;
  port?: number;
  secure?: boolean;
  auth: {
    user: string;
    pass?: string;
    accessToken?: string;
    refreshToken?: string;
    clientId?: string;
    clientSecret?: string;
  };
  tls?: {
    rejectUnauthorized?: boolean;
  };
}

export interface IEmailProviderCapabilities {
  supportsThreading: boolean;
  supportsLabels: boolean;
  supportsFolders: boolean;
  supportsSearch: boolean;
  supportsRealTimeSync: boolean;
  supportsSending: boolean;
  supportsAttachments: boolean;
  maxAttachmentSize: number;
}

export interface ISendEmailOptions {
  to: IEmailAddress[];
  cc?: IEmailAddress[];
  bcc?: IEmailAddress[];
  subject: string;
  bodyText?: string;
  bodyHtml?: string;
  attachments?: {
    filename: string;
    content: Buffer | string;
    contentType?: string;
  }[];
  replyTo?: string;
  inReplyTo?: string;
  references?: string[];
}

export abstract class IEmailProvider {
  protected config: IEmailProviderConfig;
  protected isConnected: boolean = false;
  
  constructor(config: IEmailProviderConfig) {
    this.config = config;
  }

  abstract getCapabilities(): IEmailProviderCapabilities;
  
  abstract connect(): Promise<void>;
  abstract disconnect(): Promise<void>;
  abstract authenticate(credentials?: any): Promise<boolean>;
  
  abstract getFolders(): Promise<IFolder[]>;
  abstract getEmails(folder: string, limit?: number, offset?: number): Promise<IEmail[]>;
  abstract getEmail(messageId: string, folder?: string): Promise<IEmail | null>;
  abstract getThread(threadId: string): Promise<IEmailThread | null>;
  abstract getThreads(folder: string, limit?: number, offset?: number): Promise<IEmailThread[]>;
  
  abstract searchEmails(query: IEmailSearchQuery): Promise<IEmail[]>;
  abstract searchThreads(query: IEmailSearchQuery): Promise<IEmailThread[]>;
  
  abstract markAsRead(messageIds: string[], folder?: string): Promise<void>;
  abstract markAsUnread(messageIds: string[], folder?: string): Promise<void>;
  abstract markAsFlagged(messageIds: string[], folder?: string): Promise<void>;
  abstract markAsUnflagged(messageIds: string[], folder?: string): Promise<void>;
  abstract deleteEmails(messageIds: string[], folder?: string): Promise<void>;
  abstract moveEmails(messageIds: string[], fromFolder: string, toFolder: string): Promise<void>;
  
  abstract sendEmail(options: ISendEmailOptions): Promise<string>;
  abstract replyToEmail(originalMessageId: string, options: Omit<ISendEmailOptions, 'to' | 'subject' | 'inReplyTo' | 'references'>): Promise<string>;
  abstract forwardEmail(originalMessageId: string, to: IEmailAddress[], message?: string): Promise<string>;
  
  abstract sync(folder?: string): Promise<void>;
  abstract onNewEmail(callback: (email: IEmail) => void): void;
  abstract onEmailUpdate(callback: (email: IEmail) => void): void;
  
  getConnectionStatus(): boolean {
    return this.isConnected;
  }
}