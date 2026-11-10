// src/services/mailboxService.js
// Native IMAP & SMTP Service for Embedded India Outlook Web Client
// Connects to Dovecot IMAP (port 993/143) and Postfix SMTP (port 587/465)

const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');
const nodemailer = require('nodemailer');

const IMAP_HOST = process.env.MAIL_IMAP_HOST || '127.0.0.1';
const IMAP_PORT = parseInt(process.env.MAIL_IMAP_PORT || '993', 10);
const SMTP_HOST = process.env.MAIL_SMTP_HOST || '127.0.0.1';
const SMTP_PORT = parseInt(process.env.MAIL_SMTP_PORT || '587', 10);

class MailboxService {
  /**
   * Helper to instantiate an ImapFlow client
   */
  getImapClient(email, password) {
    return new ImapFlow({
      host: IMAP_HOST,
      port: IMAP_PORT,
      secure: IMAP_PORT === 993,
      auth: {
        user: email,
        pass: password
      },
      tls: {
        rejectUnauthorized: false // Allow internal/loopback SSL certificates
      },
      logger: false
    });
  }

  /**
   * Helper to create an SMTP transporter for outgoing mail
   */
  getSmtpTransporter(email, password) {
    return nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465,
      auth: {
        user: email,
        pass: password
      },
      tls: {
        rejectUnauthorized: false
      }
    });
  }

  /**
   * Authenticate mailbox credentials against Dovecot IMAP
   */
  async authenticate(email, password) {
    const client = this.getImapClient(email, password);
    try {
      await client.connect();
      await client.logout();
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message || 'Authentication failed' };
    }
  }

  /**
   * List folders and unread counts for mailbox
   */
  async listFolders(email, password) {
    const client = this.getImapClient(email, password);
    try {
      await client.connect();
      const list = await client.list();
      const folders = [];

      for (const item of list) {
        let unread = 0;
        try {
          const status = await client.status(item.path, { unseen: true, messages: true });
          unread = status.unseen || 0;
        } catch {
          // ignore status read errors on special folders
        }

        folders.push({
          name: item.name,
          path: item.path,
          specialUse: item.specialUse || '',
          unread
        });
      }

      await client.logout();
      return folders;
    } catch (err) {
      if (client.usable) await client.logout();
      throw err;
    }
  }

  /**
   * Fetch recent messages from a folder
   */
  async fetchMessages(email, password, { folder = 'INBOX', limit = 30 } = {}) {
    const client = this.getImapClient(email, password);
    try {
      await client.connect();
      const lock = await client.getMailboxLock(folder);
      const messages = [];

      try {
        const total = client.mailbox.exists || 0;
        if (total === 0) {
          lock.release();
          await client.logout();
          return [];
        }

        const startSeq = Math.max(1, total - limit + 1);
        const range = `${startSeq}:${total}`;

        for await (const message of client.fetch(range, {
          uid: true,
          flags: true,
          envelope: true,
          internalDate: true,
          size: true
        })) {
          const sender = message.envelope.from && message.envelope.from[0]
            ? (message.envelope.from[0].name || message.envelope.from[0].address)
            : 'Unknown';
          const senderEmail = message.envelope.from && message.envelope.from[0]
            ? message.envelope.from[0].address
            : '';

          const isUnread = !message.flags.has('\\Seen');

          messages.push({
            uid: message.uid,
            seq: message.seq,
            subject: message.envelope.subject || '(No subject)',
            sender: sender,
            senderEmail: senderEmail,
            date: message.envelope.date || message.internalDate,
            flags: Array.from(message.flags),
            unread: isUnread,
            size: message.size
          });
        }
      } finally {
        lock.release();
      }

      await client.logout();
      // Sort newest first
      messages.reverse();
      return messages;
    } catch (err) {
      if (client.usable) await client.logout();
      throw err;
    }
  }

  /**
   * Fetch and parse single message by UID
   */
  async getMessage(email, password, { folder = 'INBOX', uid }) {
    const client = this.getImapClient(email, password);
    try {
      await client.connect();
      const lock = await client.getMailboxLock(folder);
      let parsed = null;

      try {
        const message = await client.download(uid, ['RFC822'], { uid: true });
        if (message && message.content) {
          parsed = await simpleParser(message.content);
        }

        // Mark message as read
        await client.messageFlagsAdd(uid, ['\\Seen'], { uid: true });
      } finally {
        lock.release();
      }

      await client.logout();

      if (!parsed) throw new Error('Message not found');

      return {
        uid,
        subject: parsed.subject || '(No subject)',
        from: parsed.from ? parsed.from.text : '',
        to: parsed.to ? parsed.to.text : '',
        date: parsed.date,
        html: parsed.html || `<div style="white-space: pre-wrap; font-family: inherit;">${parsed.text || ''}</div>`,
        text: parsed.text || '',
        attachments: (parsed.attachments || []).map(att => ({
          filename: att.filename || 'attachment',
          contentType: att.contentType,
          size: att.size
        }))
      };
    } catch (err) {
      if (client.usable) await client.logout();
      throw err;
    }
  }

  /**
   * Send email via Postfix SMTP and copy to Sent folder
   */
  async sendMail(email, password, { to, subject, html, text }) {
    const transporter = this.getSmtpTransporter(email, password);

    // 1. Send via SMTP
    const info = await transporter.sendMail({
      from: email,
      to,
      subject,
      html: html || text,
      text: text || ''
    });

    // 2. Try to append to Sent items folder
    try {
      const client = this.getImapClient(email, password);
      await client.connect();
      
      const rawMessage = Buffer.from(
        `From: ${email}\r\nTo: ${to}\r\nSubject: ${subject}\r\nDate: ${new Date().toUTCString()}\r\nContent-Type: text/html; charset=utf-8\r\n\r\n${html || text}`
      );

      // Detect Sent folder name
      const list = await client.list();
      const sentFolder = list.find(f => f.specialUse === '\\Sent' || /^sent/i.test(f.name)) || { path: 'Sent' };

      await client.append(sentFolder.path, rawMessage, ['\\Seen']);
      await client.logout();
    } catch (appendErr) {
      console.warn('[MailboxService] Could not append sent message to Sent folder:', appendErr.message);
    }

    return info;
  }

  /**
   * Delete message by moving to Trash or marking deleted
   */
  async deleteMessage(email, password, { folder = 'INBOX', uid }) {
    const client = this.getImapClient(email, password);
    try {
      await client.connect();
      const lock = await client.getMailboxLock(folder);
      try {
        const list = await client.list();
        const trash = list.find(f => f.specialUse === '\\Trash' || /^trash/i.test(f.name));

        if (trash && trash.path !== folder) {
          await client.messageMove(uid, trash.path, { uid: true });
        } else {
          await client.messageFlagsAdd(uid, ['\\Deleted'], { uid: true });
        }
      } finally {
        lock.release();
      }
      await client.logout();
      return { success: true };
    } catch (err) {
      if (client.usable) await client.logout();
      throw err;
    }
  }
}

module.exports = new MailboxService();
