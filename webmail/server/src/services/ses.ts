import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import nodemailer from 'nodemailer';
import { config } from '../config';

export interface SendMailOptions {
  from?: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  replyTo?: string;
  subject: string;
  text?: string;
  html?: string;
  inReplyTo?: string;
  references?: string;
  attachments?: Array<{
    filename: string;
    content: Buffer | string;
    contentType?: string;
  }>;
}

export interface SendMailResult {
  success: boolean;
  messageId: string;
  provider: 'aws-ses' | 'smtp' | 'simulated';
  error?: string;
}

class MailSenderService {
  private sesClient: SESv2Client | null = null;
  private smtpTransporter: nodemailer.Transporter | null = null;

  constructor() {
    this.initClients();
  }

  private initClients() {
    // 1. Initialize AWS SES if credentials exist
    if (config.aws.accessKeyId && config.aws.secretAccessKey) {
      this.sesClient = new SESv2Client({
        region: config.aws.region,
        credentials: {
          accessKeyId: config.aws.accessKeyId,
          secretAccessKey: config.aws.secretAccessKey,
        },
      });
    }

    // 2. Initialize Nodemailer SMTP fallback
    if (config.smtp.host && config.smtp.user) {
      this.smtpTransporter = nodemailer.createTransport({
        host: config.smtp.host,
        port: config.smtp.port,
        secure: config.smtp.secure,
        auth: {
          user: config.smtp.user,
          pass: config.smtp.pass,
        },
      });
    }
  }

  async sendMail(options: SendMailOptions): Promise<SendMailResult> {
    const fromAddress = options.from || config.aws.fromEmail || config.defaultMailboxEmail;
    const generatedMessageId = `<${Date.now()}.${Math.random().toString(36).substring(2, 11)}@${config.defaultMailboxEmail.split('@')[1] || 'embeddedindia.in'}>`;

    // Strategy A: If AWS SES SDK is configured
    if (this.sesClient) {
      try {
        const command = new SendEmailCommand({
          FromEmailAddress: fromAddress,
          Destination: {
            ToAddresses: options.to,
            CcAddresses: options.cc,
            BccAddresses: options.bcc,
          },
          ReplyToAddresses: options.replyTo ? [options.replyTo] : undefined,
          Content: {
            Simple: {
              Subject: { Data: options.subject, Charset: 'UTF-8' },
              Body: {
                Text: options.text ? { Data: options.text, Charset: 'UTF-8' } : undefined,
                Html: options.html ? { Data: options.html, Charset: 'UTF-8' } : undefined,
              },
              Headers: [
                { Name: 'Message-ID', Value: generatedMessageId },
                ...(options.inReplyTo ? [{ Name: 'In-Reply-To', Value: options.inReplyTo }] : []),
                ...(options.references ? [{ Name: 'References', Value: options.references }] : []),
              ],
            },
          },
        });

        const response = await this.sesClient.send(command);
        return {
          success: true,
          messageId: response.MessageId || generatedMessageId,
          provider: 'aws-ses',
        };
      } catch (err: any) {
        console.error('AWS SES Send Error:', err);
        // Fallback to SMTP if available
      }
    }

    // Strategy B: Nodemailer SMTP (e.g. SES SMTP endpoint)
    if (this.smtpTransporter) {
      try {
        const info = await this.smtpTransporter.sendMail({
          from: fromAddress,
          to: options.to,
          cc: options.cc,
          bcc: options.bcc,
          replyTo: options.replyTo,
          subject: options.subject,
          text: options.text,
          html: options.html,
          messageId: generatedMessageId,
          inReplyTo: options.inReplyTo,
          references: options.references,
          attachments: options.attachments,
        });

        return {
          success: true,
          messageId: info.messageId || generatedMessageId,
          provider: 'smtp',
        };
      } catch (err: any) {
        console.error('SMTP Send Error:', err);
        return {
          success: false,
          messageId: generatedMessageId,
          provider: 'smtp',
          error: err.message,
        };
      }
    }

    // Strategy C: Development / Simulation mode (when no AWS keys are set yet)
    console.log(`[SIMULATED EMAIL SENT via SES Mock] to: ${options.to.join(', ')} | subject: "${options.subject}"`);
    return {
      success: true,
      messageId: generatedMessageId,
      provider: 'simulated',
    };
  }
}

export const mailSender = new MailSenderService();
