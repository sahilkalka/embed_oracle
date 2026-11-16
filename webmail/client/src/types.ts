export interface Folder {
  id: string;
  name: string;
  slug: string;
  icon?: string;
  sortOrder: number;
  isSystem: boolean;
  unreadCount: number;
  totalCount: number;
}

export interface Tag {
  id: string;
  name: string;
  color: string;
}

export interface ThreadSummary {
  id: string;
  subject: string;
  snippet?: string;
  folder: string;
  isRead: boolean;
  isStarred: boolean;
  hasAttachments: boolean;
  lastMessageAt: string;
  messageCount: number;
  participants: string[];
  lastSender: string;
  tags: Tag[];
}

export interface EmailAttachment {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  isInline: boolean;
}

export interface EmailAddress {
  name: string;
  address: string;
}

export interface MessageDetail {
  id: string;
  messageId?: string;
  fromName?: string;
  fromEmail: string;
  toRecipients: EmailAddress[];
  ccRecipients: EmailAddress[];
  bccRecipients: EmailAddress[];
  replyTo?: string;
  subject: string;
  textBody?: string;
  htmlBody: string;
  hasRemoteImages: boolean;
  isRead: boolean;
  isStarred: boolean;
  sentAt?: string;
  receivedAt: string;
  attachments: EmailAttachment[];
}

export interface ThreadDetail {
  id: string;
  subject: string;
  folder: string;
  isStarred: boolean;
  isArchived: boolean;
  tags: Tag[];
  messages: MessageDetail[];
}

export interface User {
  id: string;
  email: string;
  name: string;
  signature?: string;
  theme: string;
}

export interface Contact {
  id: string;
  email: string;
  name?: string;
}
