import { Router, Request, Response } from 'express';
import { prisma } from '../db';

const router = Router();

// GET /api/folders - List all folders with live unread counts
router.get('/', async (_req: Request, res: Response) => {
  const folders = await prisma.folder.findMany({
    orderBy: { sortOrder: 'asc' },
  });

  // Calculate unread count per folder
  const foldersWithCounts = await Promise.all(
    folders.map(async (folder) => {
      const [unreadCount, totalCount] = await Promise.all([
        prisma.thread.count({
          where: { folderId: folder.id, isRead: false },
        }),
        prisma.thread.count({
          where: { folderId: folder.id },
        }),
      ]);

      return {
        ...folder,
        unreadCount,
        totalCount,
      };
    })
  );

  const tags = await prisma.tag.findMany({
    orderBy: { name: 'asc' },
  });

  return res.json({ folders: foldersWithCounts, tags });
});

export default router;
