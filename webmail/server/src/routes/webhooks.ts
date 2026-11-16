import { Router, Request, Response } from 'express';
import https from 'https';
import { parseRawEmail } from '../services/mimeParser';
import { ingestEmail } from '../services/threading';

const router = Router();

// POST /api/webhooks/ses-inbound - Handle incoming AWS SES SNS notifications
router.post('/ses-inbound', async (req: Request, res: Response) => {
  try {
    const payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

    // 1. Auto-confirm AWS SNS Subscription
    if (payload.Type === 'SubscriptionConfirmation' && payload.SubscribeURL) {
      console.log('Confirming AWS SNS subscription at:', payload.SubscribeURL);
      https.get(payload.SubscribeURL, (resp) => {
        console.log('SNS subscription confirmation HTTP status:', resp.statusCode);
      });
      return res.status(200).send('Subscription confirmed');
    }

    // 2. Process SES Inbound Notification
    if (payload.Type === 'Notification' && payload.Message) {
      const sesMessage = typeof payload.Message === 'string' ? JSON.parse(payload.Message) : payload.Message;

      // Handle raw content if included in SES event
      if (sesMessage.content) {
        const rawBuffer = Buffer.from(sesMessage.content, 'utf-8');
        const parsed = await parseRawEmail(rawBuffer);
        const { threadId, messageId } = await ingestEmail(parsed, 'inbox');
        return res.json({ success: true, threadId, messageId });
      }

      // Handle standard SES inbound metadata
      if (sesMessage.mail) {
        const mail = sesMessage.mail;
        const parsed = {
          messageId: mail.messageId,
          fromName: mail.commonHeaders?.from?.[0] || mail.source,
          fromEmail: mail.source,
          toRecipients: (mail.destination || []).map((addr: string) => ({ name: '', address: addr })),
          ccRecipients: [],
          bccRecipients: [],
          subject: mail.commonHeaders?.subject || '(No Subject)',
          textBody: sesMessage.content || 'Incoming email received via Amazon SES',
          htmlBody: sesMessage.content ? `<p>${sesMessage.content}</p>` : undefined,
          sentAt: new Date(mail.timestamp),
          attachments: [],
        };

        const { threadId, messageId } = await ingestEmail(parsed, 'inbox');
        return res.json({ success: true, threadId, messageId });
      }
    }

    return res.status(200).json({ received: true });
  } catch (err: any) {
    console.error('SES Inbound Webhook Error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/webhooks/test-inbound-eml - Developer endpoint to test raw .eml ingestion
router.post('/test-inbound-eml', async (req: Request, res: Response) => {
  try {
    const rawEml = req.body.eml || req.body;
    if (!rawEml) return res.status(400).json({ error: 'Raw EML payload required' });

    const parsed = await parseRawEmail(typeof rawEml === 'string' ? rawEml : JSON.stringify(rawEml));
    const result = await ingestEmail(parsed, 'inbox');

    return res.json({
      success: true,
      message: 'EML ingested successfully',
      ...result,
      subject: parsed.subject,
    });
  } catch (err: any) {
    console.error('Test Inbound EML Error:', err);
    return res.status(500).json({ error: err.message });
  }
});

export default router;
