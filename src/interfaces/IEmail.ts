export interface IEmailAddress {
  name?: string;
  address: string;
}

export interface IAttachment {
  filename: string;
  contentType: string;
  size: number;
  contentId?: string;
  data?: Buffer;
  url?: string;
}

export interface IEmail {
  id: string;
  messageId: string;
  threadId?: string;
  subject: string;
  from: IEmailAddress;
  to: IEmailAddress[];
  cc?: IEmailAddress[];
  bcc?: IEmailAddress[];
  replyTo?: IEmailAddress[];
  date: Date;
  receivedDate?: Date;
  bodyText?: string;
  bodyHtml?: string;
  attachments?: IAttachment[];
  flags: {
    seen: boolean;
    flagged: boolean;
    draft: boolean;
    answered: boolean;
    deleted: boolean;
  };
  labels?: string[];
  folder: string;
  provider: string;
  raw?: string;
  inReplyTo?: string;
  references?: string[];
}

export interface IEmailThread {
  id: string;
  subject: string;
  participants: IEmailAddress[];
  messageCount: number;
  unreadCount: number;
  lastMessageDate: Date;
  emails: IEmail[];
  labels?: string[];
  hasAttachments: boolean;
}

export interface IFolder {
  name: string;
  displayName: string;
  type: 'inbox' | 'sent' | 'drafts' | 'trash' | 'spam' | 'custom';
  unreadCount: number;
  totalCount: number;
  parent?: string;
  children?: IFolder[];
}

export interface IEmailSearchQuery {
  query?: string;
  from?: string;
  to?: string;
  subject?: string;
  hasAttachment?: boolean;
  isUnread?: boolean;
  isFlagged?: boolean;
  folder?: string;
  dateRange?: {
    start: Date;
    end: Date;
  };
  limit?: number;
  offset?: number;
}