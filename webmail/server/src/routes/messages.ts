import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { prisma } from '../db';
import { config } from '../config';
import { mailSender } from '../services/ses';
import { ingestEmail } from '../services/threading';
import { sanitizeEmailHtml } from '../services/sanitizer';

const router = Router();
const upload = multer({ dest: config.attachmentsDir });

// GET /api/messages/thread/:threadId - Fetch full thread with sanitized emails
router.get('/thread/:threadId', async (req: Request, res: Response) => {
  const { threadId } = req.params;
  const blockRemote = req.query.blockRemote !== 'false';

  const thread = await prisma.thread.findUnique({
    where: { id: threadId },
    include: {
      folder: true,
      tags: { include: { tag: true } },
      messages: {
        orderBy: { receivedAt: 'asc' },
        include: {
          attachments: true,
        },
      },
    },
  });

  if (!thread) return res.status(404).json({ error: 'Thread not found' });

  // Mark thread and messages as read when opened
  if (!thread.isRead) {
    await prisma.thread.update({
      where: { id: threadId },
      data: { isRead: true },
    });
    await prisma.message.updateMany({
      where: { threadId },
      data: { isRead: true },
    });
  }

  // Format messages with sanitization
  const messages = thread.messages.map((msg) => {
    const { cleanHtml, hasRemoteImages } = sanitizeEmailHtml(msg.htmlBody || '', {
      blockRemoteImages: blockRemote,
    });

    return {
      id: msg.id,
      messageId: msg.messageId,
      fromName: msg.fromName,
      fromEmail: msg.fromEmail,
      toRecipients: JSON.parse(msg.toRecipients || '[]'),
      ccRecipients: JSON.parse(msg.ccRecipients || '[]'),
      bccRecipients: JSON.parse(msg.bccRecipients || '[]'),
      replyTo: msg.replyTo,
      subject: msg.subject,
      textBody: msg.textBody,
      htmlBody: cleanHtml,
      hasRemoteImages,
      isRead: msg.isRead,
      isStarred: msg.isStarred,
      sentAt: msg.sentAt,
      receivedAt: msg.receivedAt,
      attachments: msg.attachments.map((att) => ({
        id: att.id,
        filename: att.filename,
        contentType: att.contentType,
        size: att.size,
        isInline: att.isInline,
      })),
    };
  });

  return res.json({
    thread: {
      id: thread.id,
      subject: thread.subject,
      folder: thread.folder.slug,
      isStarred: thread.isStarred,
      isArchived: thread.isArchived,
      tags: thread.tags.map((t) => t.tag),
      messages,
    },
  });
});

// POST /api/messages/send - Send mail via SES / SMTP
router.post('/send', upload.array('attachments'), async (req: Request, res: Response) => {
  try {
    const { to, cc, bcc, subject, text, html, inReplyTo, references } = req.body;

    const toAddresses: string[] = typeof to === 'string' ? JSON.parse(to) : to || [];
    const ccAddresses: string[] = typeof cc === 'string' ? JSON.parse(cc) : cc || [];
    const bccAddresses: string[] = typeof bcc === 'string' ? JSON.parse(bcc) : bcc || [];

    if (!toAddresses.length || !subject) {
      return res.status(400).json({ error: 'Recipients and subject are required' });
    }

    const files = (req.files as Express.Multer.File[]) || [];
    const attachmentsPayload = files.map((f) => ({
      filename: f.originalname,
      content: fs.readFileSync(f.path),
      contentType: f.mimetype,
    }));

    // 1. Dispatch via Amazon SES (or SMTP fallback)
    const result = await mailSender.sendMail({
      from: config.aws.fromEmail,
      to: toAddresses,
      cc: ccAddresses,
      bcc: bccAddresses,
      subject,
      text: text || '',
      html: html || '',
      inReplyTo,
      references,
      attachments: attachmentsPayload,
    });

    if (!result.success) {
      return res.status(500).json({ error: result.error || 'Failed to dispatch email' });
    }

    // 2. Ingest into "Sent" mailbox
    const sentData = {
      messageId: result.messageId,
      inReplyTo,
      references,
      fromName: config.defaultMailboxName,
      fromEmail: config.defaultMailboxEmail,
      toRecipients: toAddresses.map((addr) => ({ name: '', address: addr })),
      ccRecipients: ccAddresses.map((addr) => ({ name: '', address: addr })),
      bccRecipients: bccAddresses.map((addr) => ({ name: '', address: addr })),
      subject,
      textBody: text,
      htmlBody: html,
      sentAt: new Date(),
      attachments: files.map((f) => ({
        filename: f.originalname,
        contentType: f.mimetype,
        size: f.size,
        storagePath: f.filename,
        isInline: false,
      })),
    };

    const { threadId, messageId } = await ingestEmail(sentData, 'sent');

    return res.json({
      success: true,
      messageId,
      threadId,
      provider: result.provider,
    });
  } catch (err: any) {
    console.error('Send mail error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// GET /api/messages/attachment/:id - Download attachment
router.get('/attachment/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const attachment = await prisma.attachment.findUnique({ where: { id } });

  if (!attachment) return res.status(404).json({ error: 'Attachment not found' });

  const filePath = path.join(config.attachmentsDir, attachment.storagePath);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Attachment file missing from disk' });
  }

  res.setHeader('Content-Type', attachment.contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(attachment.filename)}"`);
  return fs.createReadStream(filePath).pipe(res);
});

// GET /api/messages/contacts/search - Contact autocomplete for composer
router.get('/contacts/search', async (req: Request, res: Response) => {
  const q = ((req.query.q as string) || '').trim().toLowerCase();
  if (!q) return res.json({ contacts: [] });

  const contacts = await prisma.contact.findMany({
    where: {
      OR: [
        { email: { contains: q } },
        { name: { contains: q } },
      ],
    },
    orderBy: { frequency: 'desc' },
    take: 8,
  });

  return res.json({ contacts });
});

export default router;
