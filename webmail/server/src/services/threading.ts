import { prisma } from '../db';
import { ParsedEmailData } from './mimeParser';
import { realtime } from './realtime';

export function normalizeSubject(subject: string): string {
  return subject
    .replace(/^(\s*(re|fwd|fw|aw|sv|vs)\s*:\s*)+/i, '')
    .replace(/\[external\]/i, '')
    .trim();
}

export async function ingestEmail(
  parsed: ParsedEmailData,
  folderSlug: 'inbox' | 'sent' = 'inbox'
) {
  // 1. Find the target folder
  const folder = await prisma.folder.findUnique({
    where: { slug: folderSlug },
  });
  if (!folder) throw new Error(`Target folder ${folderSlug} not found`);

  const normSubject = normalizeSubject(parsed.subject);
  let threadId: string | null = null;

  // 2. Thread Discovery Strategy A: Match by inReplyTo or references
  if (parsed.inReplyTo || parsed.references) {
    const parentMsg = await prisma.message.findFirst({
      where: {
        OR: [
          ...(parsed.inReplyTo ? [{ messageId: parsed.inReplyTo }] : []),
          ...(parsed.references ? [{ messageId: { in: parsed.references.split(/\s+/) } }] : []),
        ],
      },
      select: { threadId: true },
    });

    if (parentMsg) {
      threadId = parentMsg.threadId;
    }
  }

  // 3. Thread Discovery Strategy B: Match by normalized subject within the last 30 days
  if (!threadId && normSubject) {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const existingThread = await prisma.thread.findFirst({
      where: {
        subject: { contains: normSubject },
        lastMessageAt: { gte: thirtyDaysAgo },
      },
      orderBy: { lastMessageAt: 'desc' },
    });

    if (existingThread) {
      threadId = existingThread.id;
    }
  }

  const snippet = (parsed.textBody || parsed.htmlBody || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 160);

  const hasAttachments = parsed.attachments.length > 0;

  // 4. Create or Update Thread
  if (!threadId) {
    const newThread = await prisma.thread.create({
      data: {
        subject: parsed.subject,
        snippet,
        folderId: folder.id,
        isRead: folderSlug === 'sent', // Sent mail is already read
        hasAttachments,
        lastMessageAt: parsed.sentAt || new Date(),
      },
    });
    threadId = newThread.id;
  } else {
    await prisma.thread.update({
      where: { id: threadId },
      data: {
        lastMessageAt: parsed.sentAt || new Date(),
        snippet,
        isRead: folderSlug === 'sent',
        hasAttachments: hasAttachments ? true : undefined,
      },
    });
  }

  // 5. Create Message
  const message = await prisma.message.create({
    data: {
      threadId,
      folderId: folder.id,
      messageId: parsed.messageId,
      inReplyTo: parsed.inReplyTo,
      references: parsed.references,
      fromName: parsed.fromName,
      fromEmail: parsed.fromEmail,
      toRecipients: JSON.stringify(parsed.toRecipients),
      ccRecipients: parsed.ccRecipients.length > 0 ? JSON.stringify(parsed.ccRecipients) : null,
      bccRecipients: parsed.bccRecipients.length > 0 ? JSON.stringify(parsed.bccRecipients) : null,
      replyTo: parsed.replyTo,
      subject: parsed.subject,
      textBody: parsed.textBody,
      htmlBody: parsed.htmlBody,
      isRead: folderSlug === 'sent',
      sentAt: parsed.sentAt,
      receivedAt: new Date(),
      attachments: {
        create: parsed.attachments.map((att) => ({
          filename: att.filename,
          contentType: att.contentType,
          size: att.size,
          storagePath: att.storagePath,
          contentId: att.contentId,
          isInline: att.isInline,
        })),
      },
    },
    include: {
      attachments: true,
    },
  });

  // 6. Auto-update Contacts table for autocomplete
  const contactsToUpsert = [
    { email: parsed.fromEmail, name: parsed.fromName },
    ...parsed.toRecipients.map((r) => ({ email: r.address, name: r.name })),
  ];

  for (const c of contactsToUpsert) {
    if (c.email && c.email.includes('@')) {
      await prisma.contact.upsert({
        where: { email: c.email.toLowerCase() },
        update: {
          frequency: { increment: 1 },
          lastContactedAt: new Date(),
          name: c.name || undefined,
        },
        create: {
          email: c.email.toLowerCase(),
          name: c.name,
          frequency: 1,
        },
      }).catch(() => {});
    }
  }

  // 7. Broadcast real-time SSE update
  realtime.broadcast('thread:update', {
    threadId,
    messageId: message.id,
    folderSlug,
    subject: parsed.subject,
    from: parsed.fromEmail,
  });

  return { threadId, messageId: message.id };
}
