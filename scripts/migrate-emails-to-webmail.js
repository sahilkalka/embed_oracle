#!/usr/bin/env node
/**
 * ==============================================================================
 * scripts/migrate-emails-to-webmail.js
 * Imports existing emails from Dovecot / Maildir / SOGo / IMAP into Modern Webmail.
 *
 * Usage:
 *   node scripts/migrate-emails-to-webmail.js --maildir /embed_mail/data/vmail/embeddedindia.in/info
 *   node scripts/migrate-emails-to-webmail.js --eml-dir /path/to/eml/files
 * ==============================================================================
 */

const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const { simpleParser } = require('mailparser');

// Initialize Webmail Prisma Client pointing to webmail SQLite database
const webmailDbPath = path.resolve(__dirname, '../webmail/server/prisma/webmail.db');
process.env.DATABASE_URL = `file:${webmailDbPath}`;

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: `file:${webmailDbPath}`,
    },
  },
});

function normalizeSubject(subject) {
  return String(subject || '')
    .replace(/^(\s*(re|fwd|fw|aw|sv|vs)\s*:\s*)+/i, '')
    .replace(/\[external\]/i, '')
    .trim();
}

async function ingestParsedEmail(parsed, folderSlug = 'inbox') {
  const folder = await prisma.folder.findUnique({ where: { slug: folderSlug } });
  if (!folder) throw new Error(`Folder ${folderSlug} not found`);

  const normSubject = normalizeSubject(parsed.subject);
  let threadId = null;

  // Thread match by references or inReplyTo
  if (parsed.inReplyTo || parsed.references) {
    const parentMsg = await prisma.message.findFirst({
      where: {
        OR: [
          ...(parsed.inReplyTo ? [{ messageId: parsed.inReplyTo }] : []),
          ...(parsed.references ? [{ messageId: { in: Array.isArray(parsed.references) ? parsed.references : [String(parsed.references)] } }] : []),
        ],
      },
      select: { threadId: true },
    });
    if (parentMsg) threadId = parentMsg.threadId;
  }

  // Thread match by normalized subject
  if (!threadId && normSubject) {
    const existingThread = await prisma.thread.findFirst({
      where: { subject: { contains: normSubject } },
      orderBy: { lastMessageAt: 'desc' },
    });
    if (existingThread) threadId = existingThread.id;
  }

  const snippet = (parsed.textBody || parsed.htmlBody || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 160);

  const hasAttachments = parsed.attachments && parsed.attachments.length > 0;

  if (!threadId) {
    const newThread = await prisma.thread.create({
      data: {
        subject: parsed.subject || '(No Subject)',
        snippet,
        folderId: folder.id,
        isRead: folderSlug === 'sent',
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
        hasAttachments: hasAttachments ? true : undefined,
      },
    });
  }

  const message = await prisma.message.create({
    data: {
      threadId,
      folderId: folder.id,
      messageId: parsed.messageId || `<migrated-${Date.now()}-${Math.random()}@embeddedindia.in>`,
      inReplyTo: parsed.inReplyTo,
      references: parsed.references ? (Array.isArray(parsed.references) ? parsed.references.join(' ') : String(parsed.references)) : null,
      fromName: parsed.fromName,
      fromEmail: parsed.fromEmail,
      toRecipients: JSON.stringify(parsed.toRecipients),
      ccRecipients: parsed.ccRecipients?.length ? JSON.stringify(parsed.ccRecipients) : null,
      subject: parsed.subject || '(No Subject)',
      textBody: parsed.textBody,
      htmlBody: parsed.htmlBody,
      isRead: folderSlug === 'sent',
      sentAt: parsed.sentAt,
      receivedAt: parsed.sentAt || new Date(),
    },
  });

  return { threadId, messageId: message.id };
}

async function processEmlFile(filePath, folderSlug = 'inbox') {
  try {
    const rawContent = fs.readFileSync(filePath);
    const parsed = await simpleParser(rawContent);

    const fromAddress = parsed.from?.value?.[0]?.address || 'unknown@sender.com';
    const fromName = parsed.from?.value?.[0]?.name || '';

    const mapAddresses = (field) => {
      if (!field) return [];
      const values = Array.isArray(field.value) ? field.value : [field.value];
      return values.filter(Boolean).map((v) => ({
        name: v.name || '',
        address: (v.address || '').toLowerCase(),
      }));
    };

    const payload = {
      messageId: parsed.messageId,
      inReplyTo: parsed.inReplyTo,
      references: parsed.references,
      fromName,
      fromEmail: fromAddress,
      toRecipients: mapAddresses(parsed.to),
      ccRecipients: mapAddresses(parsed.cc),
      subject: parsed.subject || '(No Subject)',
      textBody: parsed.text,
      htmlBody: parsed.html || (parsed.text ? `<pre>${parsed.text}</pre>` : ''),
      sentAt: parsed.date || new Date(),
      attachments: [],
    };

    await ingestParsedEmail(payload, folderSlug);
    return true;
  } catch (err) {
    console.error(`Error processing ${filePath}:`, err.message);
    return false;
  }
}

async function scanDirectory(dir, folderSlug = 'inbox') {
  if (!fs.existsSync(dir)) {
    console.warn(`Directory not found: ${dir}`);
    return 0;
  }

  let count = 0;
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      let subFolderSlug = folderSlug;
      if (/sent/i.test(entry.name)) subFolderSlug = 'sent';
      if (/draft/i.test(entry.name)) subFolderSlug = 'drafts';
      if (/trash/i.test(entry.name)) subFolderSlug = 'trash';
      count += await scanDirectory(fullPath, subFolderSlug);
    } else if (entry.isFile() && (entry.name.endsWith('.eml') || entry.name.includes(':2,'))) {
      const ok = await processEmlFile(fullPath, folderSlug);
      if (ok) count++;
    }
  }

  return count;
}

async function main() {
  const args = process.argv.slice(2);
  let targetDir = args[0] || path.resolve(__dirname, '../embed_mail/data/vmail');

  console.log('='.repeat(70));
  console.log('  Embedded India — Mailbox Migration to Modern Webmail');
  console.log('='.repeat(70));
  console.log(`Scanning emails from: ${targetDir}`);
  console.log(`Target Webmail DB:    ${webmailDbPath}`);

  const total = await scanDirectory(targetDir, 'inbox');
  console.log(`\n==> Migration Complete! Successfully migrated ${total} emails into Modern Webmail.`);
}

main()
  .catch((e) => {
    console.error('Fatal error during migration:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
