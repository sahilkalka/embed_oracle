// src/services/mailboxService.js
// Native IMAP & SMTP Service for Embedded India Outlook Web Client
// Connects to Dovecot IMAP (port 993 SSL / port 143 STARTTLS) and Postfix SMTP (port 587)

const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');
const nodemailer = require('nodemailer');
const MailComposer = require('nodemailer/lib/mail-composer');

const IMAP_HOST = process.env.MAIL_IMAP_HOST || '127.0.0.1';
const IMAP_PORT = parseInt(process.env.MAIL_IMAP_PORT || '993', 10);
const SMTP_HOST = process.env.MAIL_SMTP_HOST || '127.0.0.1';
const SMTP_PORT = parseInt(process.env.MAIL_SMTP_PORT || '587', 10);

class MailboxService {
  constructor() {
    this.preferredImapPort = IMAP_PORT;
  }

  /**
   * Helper to instantiate an ImapFlow client
   */
  getImapClient(email, password, port = this.preferredImapPort) {
    const isSsl = port === 993;
    return new ImapFlow({
      host: IMAP_HOST,
      port: port,
      secure: isSsl,
      auth: {
        user: email,
        pass: password
      },
      tls: {
        rejectUnauthorized: false // Allow internal/loopback SSL certificates
      },
      connectionTimeout: 8000,
      greetingTimeout: 8000,
      socketTimeout: 30000,
      logger: false
    });
  }

  /**
   * Run an operation with an auto-connecting IMAP client (with 993 -> 143 fallback)
   */
  async withClient(email, password, fn) {
    const portsToTry = this.preferredImapPort === 143 ? [143, 993] : [this.preferredImapPort, 143];
    let lastError = null;

    for (const port of portsToTry) {
      let client = this.getImapClient(email, password, port);
      try {
        await client.connect();
        this.preferredImapPort = port;
        try {
          return await fn(client);
        } finally {
          if (client.usable) {
            try { await client.logout(); } catch { }
          }
        }
      } catch (err) {
        lastError = err;
        try {
          if (client.usable) await client.logout();
        } catch { }
        // If connection refused, timed out, or TLS handshake issue, try next port
        const isConnErr = err.code === 'ECONNREFUSED' ||
                          err.code === 'ETIMEDOUT' ||
                          err.code === 'EHOSTUNREACH' ||
                          /timeout|refused|handshake|tls/i.test(err.message || '');
        if (!isConnErr) {
          // Auth error or protocol error, do not retry other port
          throw err;
        }
      }
    }

    throw lastError || new Error('Could not connect to IMAP server');
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
      },
      connectionTimeout: 8000,
      greetingTimeout: 8000
    });
  }

  /**
   * Authenticate mailbox credentials against Dovecot IMAP
   */
  async authenticate(email, password) {
    try {
      await this.withClient(email, password, async () => {
        return true;
      });
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message || 'Authentication failed' };
    }
  }

  /**
   * List folders and unread counts for mailbox
   */
  async listFolders(email, password) {
    return await this.withClient(email, password, async (client) => {
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

      return folders;
    });
  }

  /**
   * Fetch recent messages from a folder
   */
  async fetchMessages(email, password, { folder = 'INBOX', limit = 30 } = {}) {
    return await this.withClient(email, password, async (client) => {
      const lock = await client.getMailboxLock(folder);
      const messages = [];

      try {
        const total = client.mailbox.exists || 0;
        if (total === 0) {
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

      // Sort newest first
      messages.reverse();
      return messages;
    });
  }

  /**
   * Fetch and parse single message by UID
   */
  async getMessage(email, password, { folder = 'INBOX', uid }) {
    return await this.withClient(email, password, async (client) => {
      const lock = await client.getMailboxLock(folder);
      let parsed = null;

      try {
        const messageUid = String(uid);
        let sourceBuffer = null;

        // 1. Try fetchOne with source: true (fastest and most reliable)
        try {
          const fetched = await client.fetchOne(messageUid, { source: true, flags: true }, { uid: true });
          if (fetched && fetched.source) {
            sourceBuffer = fetched.source;
          }
        } catch (fetchErr) {
          console.warn('[MailboxService] fetchOne error:', fetchErr.message);
        }

        // 2. Fallback to download stream if fetchOne did not yield buffer
        if (!sourceBuffer) {
          try {
            const dl = await client.download(messageUid, undefined, { uid: true });
            if (dl && dl.content) {
              sourceBuffer = await new Promise((resolve, reject) => {
                const chunks = [];
                dl.content.on('data', chunk => chunks.push(chunk));
                dl.content.on('end', () => resolve(Buffer.concat(chunks)));
                dl.content.on('error', reject);
              });
            }
          } catch (dlErr) {
            console.warn('[MailboxService] download error:', dlErr.message);
          }
        }

        if (!sourceBuffer) {
          throw new Error('Message content could not be retrieved from mail server');
        }

        parsed = await simpleParser(sourceBuffer);

        // Mark message as read
        try {
          await client.messageFlagsAdd(messageUid, ['\\Seen'], { uid: true });
        } catch (flagErr) {
          // ignore flag update warning
        }
      } finally {
        lock.release();
      }

      if (!parsed) throw new Error('Message could not be parsed');

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
    });
  }

  /**
   * Send email via Postfix SMTP and copy to Sent folder
   */
  async sendMail(email, password, { to, subject, html, text }) {
    const transporter = this.getSmtpTransporter(email, password);

    // 1. Send via SMTP
    const mailOptions = {
      from: email,
      to,
      subject,
      html: html || undefined,
      text: text || ''
    };
    const info = await transporter.sendMail(mailOptions);

    // 2. Try to append to Sent items folder. The copy is built by nodemailer's
    //    composer so headers are encoded properly and cannot be injected.
    try {
      const rawMessage = await new MailComposer({ ...mailOptions, messageId: info.messageId, date: new Date() })
        .compile()
        .build();
      await this.withClient(email, password, async (client) => {

        // Detect Sent folder name
        const list = await client.list();
        const sentFolder = list.find(f => f.specialUse === '\\Sent' || /^sent/i.test(f.name)) || { path: 'Sent' };

        await client.append(sentFolder.path, rawMessage, ['\\Seen']);
      });
    } catch (appendErr) {
      console.warn('[MailboxService] Could not append sent message to Sent folder:', appendErr.message);
    }

    return info;
  }

  /**
   * Delete message by moving to Trash or marking deleted
   */
  async deleteMessage(email, password, { folder = 'INBOX', uid }) {
    return await this.withClient(email, password, async (client) => {
      const lock = await client.getMailboxLock(folder);
      try {
        const messageUid = String(uid);
        const list = await client.list();
        const trash = list.find(f => f.specialUse === '\\Trash' || /^trash/i.test(f.name));

        if (trash && trash.path !== folder) {
          await client.messageMove(messageUid, trash.path, { uid: true });
        } else {
          await client.messageFlagsAdd(messageUid, ['\\Deleted'], { uid: true });
        }
        return { success: true };
      } finally {
        lock.release();
      }
    });
  }
}

module.exports = new MailboxService();
