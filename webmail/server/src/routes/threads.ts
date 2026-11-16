import { Router, Request, Response } from 'express';
import { prisma } from '../db';

const router = Router();

// GET /api/threads
router.get('/', async (req: Request, res: Response) => {
  const folderSlug = (req.query.folder as string) || 'inbox';
  const search = (req.query.q as string) || '';
  const isUnreadOnly = req.query.unread === 'true';
  const hasAttachmentsOnly = req.query.attachments === 'true';
  const tagFilter = req.query.tag as string;
  const page = parseInt(req.query.page as string || '1', 10);
  const limit = parseInt(req.query.limit as string || '50', 10);
  const skip = (page - 1) * limit;

  // Build where clause
  let where: any = {};

  if (folderSlug === 'starred') {
    where.isStarred = true;
  } else {
    const folder = await prisma.folder.findUnique({ where: { slug: folderSlug } });
    if (folder) {
      where.folderId = folder.id;
    }
  }

  if (isUnreadOnly) where.isRead = false;
  if (hasAttachmentsOnly) where.hasAttachments = true;

  if (tagFilter) {
    where.tags = { some: { tag: { name: tagFilter } } };
  }

  if (search.trim()) {
    const q = search.trim();
    where.OR = [
      { subject: { contains: q } },
      { snippet: { contains: q } },
      { messages: { some: { fromEmail: { contains: q } } } },
      { messages: { some: { fromName: { contains: q } } } },
      { messages: { some: { toRecipients: { contains: q } } } },
    ];
  }

  const [threads, totalCount] = await Promise.all([
    prisma.thread.findMany({
      where,
      orderBy: { lastMessageAt: 'desc' },
      skip,
      take: limit,
      include: {
        folder: true,
        tags: { include: { tag: true } },
        messages: {
          select: {
            id: true,
            fromName: true,
            fromEmail: true,
            isRead: true,
            isStarred: true,
            sentAt: true,
            receivedAt: true,
          },
          orderBy: { receivedAt: 'asc' },
        },
      },
    }),
    prisma.thread.count({ where }),
  ]);

  // Format thread summaries for list view
  const formattedThreads = threads.map((thread) => {
    const participants = Array.from(
      new Set(thread.messages.map((m) => m.fromName || m.fromEmail.split('@')[0]))
    );
    const lastMsg = thread.messages[thread.messages.length - 1];

    return {
      id: thread.id,
      subject: thread.subject,
      snippet: thread.snippet,
      folder: thread.folder.slug,
      isRead: thread.isRead,
      isStarred: thread.isStarred,
      hasAttachments: thread.hasAttachments,
      lastMessageAt: thread.lastMessageAt,
      messageCount: thread.messages.length,
      participants,
      lastSender: lastMsg?.fromName || lastMsg?.fromEmail || '',
      tags: thread.tags.map((t) => t.tag),
    };
  });

  return res.json({
    threads: formattedThreads,
    pagination: {
      page,
      limit,
      totalCount,
      totalPages: Math.ceil(totalCount / limit),
    },
  });
});

// PATCH /api/threads/batch - Batch operations
router.patch('/batch', async (req: Request, res: Response) => {
  const { threadIds, action, value } = req.body;
  if (!Array.isArray(threadIds) || threadIds.length === 0) {
    return res.status(400).json({ error: 'threadIds array is required' });
  }

  switch (action) {
    case 'markRead':
      await prisma.thread.updateMany({
        where: { id: { in: threadIds } },
        data: { isRead: Boolean(value) },
      });
      await prisma.message.updateMany({
        where: { threadId: { in: threadIds } },
        data: { isRead: Boolean(value) },
      });
      break;

    case 'star':
      await prisma.thread.updateMany({
        where: { id: { in: threadIds } },
        data: { isStarred: Boolean(value) },
      });
      break;

    case 'move':
      const targetFolder = await prisma.folder.findUnique({ where: { slug: value } });
      if (!targetFolder) return res.status(400).json({ error: 'Target folder not found' });

      await prisma.thread.updateMany({
        where: { id: { in: threadIds } },
        data: { folderId: targetFolder.id },
      });
      await prisma.message.updateMany({
        where: { threadId: { in: threadIds } },
        data: { folderId: targetFolder.id },
      });
      break;

    case 'delete':
      const trashFolder = await prisma.folder.findUnique({ where: { slug: 'trash' } });
      if (!trashFolder) return res.status(400).json({ error: 'Trash folder not found' });

      await prisma.thread.updateMany({
        where: { id: { in: threadIds } },
        data: { folderId: trashFolder.id },
      });
      await prisma.message.updateMany({
        where: { threadId: { in: threadIds } },
        data: { folderId: trashFolder.id },
      });
      break;

    default:
      return res.status(400).json({ error: `Unknown action: ${action}` });
  }

  return res.json({ success: true, count: threadIds.length });
});

export default router;
