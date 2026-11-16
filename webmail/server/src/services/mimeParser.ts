import { simpleParser, ParsedMail, Attachment as ParsedAttachment } from 'mailparser';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { config } from '../config';

export interface ParsedEmailData {
  messageId?: string;
  inReplyTo?: string;
  references?: string;
  fromName?: string;
  fromEmail: string;
  toRecipients: Array<{ name: string; address: string }>;
  ccRecipients: Array<{ name: string; address: string }>;
  bccRecipients: Array<{ name: string; address: string }>;
  replyTo?: string;
  subject: string;
  textBody?: string;
  htmlBody?: string;
  sentAt?: Date;
  attachments: Array<{
    filename: string;
    contentType: string;
    size: number;
    storagePath: string;
    contentId?: string;
    isInline: boolean;
  }>;
}

export async function parseRawEmail(rawBuffer: Buffer | string): Promise<ParsedEmailData> {
  const parsed: ParsedMail = await simpleParser(rawBuffer);

  const fromAddress = parsed.from?.value?.[0]?.address || 'unknown@sender.com';
  const fromName = parsed.from?.value?.[0]?.name || '';

  const mapAddresses = (field: any): Array<{ name: string; address: string }> => {
    if (!field) return [];
    const values = Array.isArray(field.value) ? field.value : [field.value];
    return values.filter(Boolean).map((v: any) => ({
      name: v.name || '',
      address: (v.address || '').toLowerCase(),
    }));
  };

  const toRecipients = mapAddresses(parsed.to);
  const ccRecipients = mapAddresses(parsed.cc);
  const bccRecipients = mapAddresses(parsed.bcc);

  // Extract and save attachments to disk
  const attachmentsList: ParsedEmailData['attachments'] = [];
  if (parsed.attachments && parsed.attachments.length > 0) {
    for (const att of parsed.attachments) {
      const ext = path.extname(att.filename || 'file.bin') || '.bin';
      const fileHash = crypto.randomBytes(16).toString('hex');
      const savedFileName = `${fileHash}${ext}`;
      const savedFilePath = path.join(config.attachmentsDir, savedFileName);

      fs.writeFileSync(savedFilePath, att.content);

      attachmentsList.push({
        filename: att.filename || 'attachment',
        contentType: att.contentType || 'application/octet-stream',
        size: att.size || att.content.length,
        storagePath: savedFileName,
        contentId: att.cid,
        isInline: Boolean(att.related),
      });
    }
  }

  return {
    messageId: parsed.messageId,
    inReplyTo: parsed.inReplyTo,
    references: parsed.references ? (Array.isArray(parsed.references) ? parsed.references.join(' ') : String(parsed.references)) : undefined,
    fromName,
    fromEmail: fromAddress,
    toRecipients,
    ccRecipients,
    bccRecipients,
    replyTo: parsed.replyTo?.value?.[0]?.address,
    subject: parsed.subject || '(No Subject)',
    textBody: parsed.text,
    htmlBody: parsed.html || (parsed.text ? `<pre>${parsed.text}</pre>` : ''),
    sentAt: parsed.date || new Date(),
    attachments: attachmentsList,
  };
}
