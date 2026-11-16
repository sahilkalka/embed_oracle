# Modern Fluid Webmail (Node.js + Amazon SES + Oracle Cloud)

A fluid, lightweight, modern webmail application designed to deliver an **Office 365 & Gmail desktop experience** without bloated PHP or heavy mail server containers. Built with Node.js 22 LTS, Express, SQLite (WAL mode), React 18, Tailwind CSS, TipTap rich text composer, and Amazon SES.

---

## ✨ Key Features

- **⚡ Blazing Fast & Fluid UX**:
  - Three-pane responsive layout (Navigation Folders, Message List, Reading Pane) inspired by modern Outlook 365 and Gmail.
  - Sub-60MB server RAM footprint, running on an embedded SQLite database with Write-Ahead Logging (WAL mode) and in-memory cache tuning.
- **🛡️ Sandboxed Email Rendering & Privacy**:
  - HTML emails are sanitized via `DOMPurify` + `jsdom`.
  - Rendered inside an isolated `<iframe>` with tracking pixel blocking by default, featuring a *"Load remote images"* toggle.
- **✍️ Modern Floating / Docked Rich-Text Composer**:
  - Powered by **TipTap** WYSIWYG editor (Bold, Italic, Strikethrough, Code, Lists, Blockquotes, Links).
  - Drafts auto-saved directly to SQLite.
  - Recipient autocomplete populated from past correspondence.
  - File attachment drag-and-drop.
- **🚀 High-Deliverability Sending via Amazon SES**:
  - Integrated with `@aws-sdk/client-sesv2` and fallback to Nodemailer SMTP.
  - Handles DKIM 2048-bit signatures, SPF, and DMARC alignment.
- **📥 Inbound Email Processing**:
  - Inbound webhook endpoint `/api/webhooks/ses-inbound` (for SES + S3 / SNS notifications).
  - Automatic SNS subscription confirmation handshake.
  - MIME parser extracting headers, HTML/plain text, embedded CID images, and attachments.
  - Thread grouping algorithm matching `Message-ID`, `In-Reply-To`, `References`, and normalized subject lines.
- **⚡ Real-Time Instant Inbox Sync**:
  - Native **Server-Sent Events (SSE)** at `/api/realtime` pushes new messages and read states to active browser tabs instantly without manual refreshing.
- **⌨️ Keyboard Shortcuts**:
  - Full keyboard navigation: `C` (compose), `J`/`K` (navigate conversations), `R` (reply), `A` (reply all), `F` (forward), `E` (archive), `#` (delete), `/` (search), `?` (shortcuts cheat sheet).
- **🌓 Dark & Light Modes**:
  - Clean theme switching matching macOS/Windows system preferences or manual toggle.

---

## 🏗️ Project Architecture

```
d:\Github\webmail
├── client/                     # Fluid React 18 + Vite + Tailwind CSS SPA
│   ├── src/
│   │   ├── components/         # Header, Sidebar, ThreadList, ReadingPane, Composer, ShortcutsModal
│   │   ├── api.ts              # REST and SSE client
│   │   ├── types.ts            # TypeScript interfaces
│   │   └── App.tsx             # Root workspace container & keyboard navigation
│   └── vite.config.ts          # Builds directly into server/public
│
├── server/                     # Node.js 22 LTS Express API Engine
│   ├── prisma/
│   │   ├── schema.prisma       # SQLite models (User, Folder, Tag, Thread, Message, Attachment)
│   │   └── webmail.db          # Embedded database with WAL mode
│   ├── src/
│   │   ├── services/
│   │   │   ├── ses.ts          # Amazon SES SDK v2 & SMTP transport
│   │   │   ├── mimeParser.ts   # mailparser MIME / .eml processor
│   │   │   ├── threading.ts    # Conversation thread resolution & contacts engine
│   │   │   ├── realtime.ts     # Server-Sent Events (SSE) broadcaster
│   │   │   └── sanitizer.ts    # DOMPurify HTML sanitizer & tracking pixel blocker
│   │   ├── routes/             # auth, folders, threads, messages, webhooks, realtime
│   │   ├── scripts/seed.ts     # Database seed with default mailboxes & sample emails
│   │   └── index.ts            # Main application server
│   └── public/                 # Compiled production frontend assets
│
└── deploy/                     # Oracle Cloud VM Production Deployment
    ├── webmail.service         # Systemd service unit
    ├── nginx-webmail.conf      # Host Nginx reverse proxy with SSL and SSE streaming
    └── deploy-oracle.sh        # Automated SSH deployment script
```

---

## 🚀 Quick Start (Local Development)

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment
```bash
cp server/.env.example server/.env
```

### 3. Initialize Database & Seed Sample Data
```bash
npm run db:push
npm run db:seed
```

### 4. Run the Dev Servers
```bash
npm run dev
```
- Web Client: [http://localhost:5173](http://localhost:5173)
- Express API: [http://localhost:3005/api](http://localhost:3005/api)

---

## 📧 Amazon SES Configuration Guide

### 1. Outbound (Sending Emails)
1. In the **AWS SES Console** (`console.aws.amazon.com/ses/`):
   - Navigate to **Configuration** -> **Identities**.
   - Verify `embeddedindia.in` (already active in your Cloudflare SPF `include:amazonses.com`).
2. Add AWS Credentials in `server/.env`:
   ```ini
   AWS_REGION=us-east-1
   AWS_ACCESS_KEY_ID=AKIA...
   AWS_SECRET_ACCESS_KEY=...
   AWS_SES_FROM_EMAIL="Embedded India <info@embeddedindia.in>"
   ```

### 2. Inbound (Receiving Emails)
1. In AWS SES Console -> **Configuration** -> **Email receiving**:
   - Create a **Receipt Rule Set**.
   - Add a rule for recipient `embeddedindia.in`.
   - Add an **Action: S3** to save the raw message to an S3 bucket (e.g. `ei-inbound-mail`).
   - Add an **Action: SNS** pointing to an SNS topic.
2. In AWS SNS Console:
   - Create an HTTPS Subscription pointing to `https://mail.embeddedindia.in/api/webhooks/ses-inbound`.
   - The webmail server automatically approves the subscription handshake upon creation.

---

## 🌐 Deploying to Oracle Cloud Server (`129.225.79.183`)

```bash
# Run the automated deployment script
bash deploy/deploy-oracle.sh
```

Or manually:
1. Copy `deploy/webmail.service` to `/etc/systemd/system/webmail.service`.
2. Reload systemd: `sudo systemctl daemon-reload && sudo systemctl restart webmail.service`.
3. Copy `deploy/nginx-webmail.conf` to `/etc/nginx/sites-available/webmail`.
4. Link and reload: `sudo ln -sf /etc/nginx/sites-available/webmail /etc/nginx/sites-enabled/ && sudo systemctl reload nginx`.
