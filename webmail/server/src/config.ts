import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3005', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',
  appUrl: process.env.APP_URL || 'http://localhost:5173',
  jwtSecret: process.env.JWT_SECRET || 'webmail-dev-jwt-secret-key-32chars',
  cookieName: process.env.COOKIE_NAME || 'ei_webmail_token',

  // Default Mailbox Identity
  defaultMailboxName: process.env.DEFAULT_MAILBOX_NAME || 'Embedded India',
  defaultMailboxEmail: process.env.DEFAULT_MAILBOX_EMAIL || 'info@embeddedindia.in',

  // AWS SES Configuration
  aws: {
    region: process.env.AWS_REGION || 'us-east-1',
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
    fromEmail: process.env.AWS_SES_FROM_EMAIL || 'Embedded India <info@embeddedindia.in>',
  },

  // Fallback SMTP
  smtp: {
    host: process.env.SMTP_HOST || 'email-smtp.us-east-1.amazonaws.com',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    secure: process.env.SMTP_SECURE === 'true',
  },

  // Storage
  storageDir: path.resolve(__dirname, '../../storage'),
  attachmentsDir: path.resolve(__dirname, '../../storage/attachments'),
  emlDir: path.resolve(__dirname, '../../storage/eml'),
};
