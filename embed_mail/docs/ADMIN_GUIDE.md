# Embedded India Mail Server - Administrator & Client Guide

Welcome to the **Embedded India Mail Infrastructure**. This guide outlines how to manage domains, create/edit/delete mailboxes, reset passwords, access the **Outlook Web Client**, and connect Microsoft Outlook and mobile devices using Exchange ActiveSync (EAS).

---

## 🌐 Server Access Endpoints

- **Email Admin Dashboard**: [`https://mail.embeddedindia.in/admin`](https://mail.embeddedindia.in/admin) (Domain & user provisioning, styled to match Website Admin Dashboard)
- **User Webmail (Outlook Web)**: [`https://mail.embeddedindia.in/mail`](https://mail.embeddedindia.in/mail) or [`https://mail.embeddedindia.in/`](https://mail.embeddedindia.in/) (Outlook Web interface for mail, calendar, and contacts)
- **Website Admin Email Hub**: [`https://embeddedindia.in/admin/email`](https://embeddedindia.in/admin/email) (Quick launch and server telemetry)
- **Microsoft Exchange ActiveSync (EAS)**: `https://mail.embeddedindia.in/Microsoft-Server-ActiveSync`
- **IMAP over SSL**: `mail.embeddedindia.in:993` (SSL/TLS)
- **SMTP Submission**: `mail.embeddedindia.in:587` (STARTTLS) or `465` (SSL/TLS)
- **POP3 over SSL**: `mail.embeddedindia.in:995` (SSL/TLS)

---

## 🛠️ Admin Dashboard Operations

### 1. First-Time Administrator Login
1. Open [`https://mail.embeddedindia.in/admin`](https://mail.embeddedindia.in/admin) in your browser.
   > **Note**: Superadmin credentials authenticate exclusively at the `/admin` path. The root `/` or `/mail` path is reserved for individual user email accounts (`user@embeddedindia.in`).
2. Log in using default credentials:
   - **Username**: `admin`
   - **Password**: the value printed once by `deploy-email-server.sh` (or the `ADMIN_PASSWORD` you supplied). There is no default password.
3. The dashboard features the **Embedded India dark emerald theme** (`#0b1412`, `#10b981`), matching the main website admin dashboard with responsive cards and icon buttons.
4. Click <kbd>👤 Profile</kbd> in the top navigation bar.
5. Click <kbd>🔑 Change Password</kbd> to set a strong master administrative password.
6. *(Recommended)* Enable Two-Factor Authentication:
   - Click <kbd>🛡️ Enable 2FA / WebAuthn</kbd> and scan the QR code with Google Authenticator or an enterprise TOTP app.

---

### 2. Onboarding Domain: `embeddedindia.in`
1. Navigate to **Configuration** -> **Mail Setup**.
2. Click the <kbd>➕ Add Domain</kbd> icon button.
3. Fill in the domain settings:
   - **Domain**: `embeddedindia.in`
   - **Description**: `Embedded India Main Domain`
   - **Max Mailboxes**: e.g., `20` (or leave empty for unlimited)
   - **Max Quota per Mailbox**: e.g., `10240 MB` (10 GB)
4. Click <kbd>💾 Save & Add Domain</kbd>.

---

### 3. User & Mailbox Management (CRUD)

All mailbox operations are performed under **Configuration** -> **Mail Setup** -> **Mailboxes Tab**.

#### ➕ Adding a New User Mailbox
1. Click the <kbd>➕ Add Mailbox</kbd> icon button.
2. Configure mailbox parameters:
   - **Username / Alias**: e.g. `sahil` (Full address: `sahil@embeddedindia.in`)
   - **Full Name**: `Sahil Kalka`
   - **Domain**: Select `embeddedindia.in`
   - **Password**: Enter user password (or click <kbd>🎲 Generate Random Password</kbd>)
   - **Quota**: Set storage limit (e.g., `5120 MB` for 5 GB)
   - **ActiveSync**: Ensure <kbd>✅ ActiveSync Enabled</kbd> is checked.
3. Click <kbd>💾 Save Mailbox</kbd>.

#### ✏️ Editing User Details & Quotas
1. Find the user row in the **Mailboxes** list.
2. Click the <kbd>✏️ Edit</kbd> icon button.
3. Update full name, adjust mailbox storage quota, or toggle protocol access (IMAP, POP3, Sieve).
4. Click <kbd>💾 Update Settings</kbd>.

#### 🔑 Resetting a User Password
1. In the **Mailboxes** list, find the target account.
2. Click the <kbd>✏️ Edit</kbd> icon button.
3. Scroll to the **Password** field.
4. Type the new password (or click <kbd>🎲 Generate Password</kbd>).
5. Click <kbd>💾 Save Changes</kbd>. The user can immediately log in with the new password.

#### 🗑️ Deleting a User Mailbox
1. In the **Mailboxes** list, locate the account to remove.
2. Click the <kbd>🗑️ Delete</kbd> icon button.
3. Confirm mailbox deletion in the prompt dialog.

---

### 4. Email Aliases and Forwarding
1. Under **Mail Setup**, switch to the **Aliases** tab.
2. Click <kbd>➕ Add Alias</kbd>.
3. Specify alias address (e.g. `info@embeddedindia.in`, `support@embeddedindia.in`).
4. Enter target mailbox destination (e.g. `sahil@embeddedindia.in`).
5. Click <kbd>💾 Save Alias</kbd>.

---

## 📱 User Webmail (Outlook Web) & Client Setup

### 📨 Accessing Outlook Webmail
1. Visit [`https://mail.embeddedindia.in/mail`](https://mail.embeddedindia.in/mail) or [`https://mail.embeddedindia.in/`](https://mail.embeddedindia.in/).
2. You will see the **Microsoft 365 / Outlook Web** login interface with Embedded India branding.
3. Enter your full email address (e.g. `sahil@embeddedindia.in`) and password.
4. Click <kbd>➡️ Sign in</kbd> icon button.
5. The webmail interface provides a genuine **Microsoft Outlook Web** experience:
   - **Top Ribbon**: Outlook Blue `#0078d4` header with 9-dot waffle app launcher icon button, central search input `(Ctrl+E)`, and user profile avatar.
   - **Left Icon Rail**: Narrow vertical bar with icon buttons for <kbd>✉️ Mail</kbd>, <kbd>📅 Calendar</kbd>, <kbd>👥 People/Contacts</kbd>, and <kbd>☑️ To-Do/Tasks</kbd>.
   - **Folders Pane**: Prominent rounded pill <kbd>➕ New mail</kbd> icon button, Favorites, and full folder tree with unread count badges.
   - **Message & Reading Panes**: 3-pane responsive layout with message snippet cards, blue unread dot indicators, and Outlook action ribbon (<kbd>↩️ Reply</kbd>, <kbd>🗑️ Delete</kbd>, <kbd>📦 Archive</kbd>, <kbd>🚫 Junk</kbd>, <kbd>📁 Move</kbd>).

---

### 💻 Microsoft Outlook Desktop Setup (Exchange ActiveSync)

The mail server natively supports Microsoft Exchange ActiveSync (EAS). Setting up Outlook provides instant push notifications, auto-syncing emails, calendars, and address books.

#### In Outlook for Windows / macOS:
1. Open Outlook and click **File** -> <kbd>➕ Add Account</kbd>.
2. Select **Manual setup or additional server types** -> Click **Next**.
3. Select **Exchange ActiveSync** -> Click **Next**.
4. Fill in Account Information:
   - **Your Name**: Your Full Name
   - **Email Address**: `user@embeddedindia.in`
   - **Mail Server**: `mail.embeddedindia.in`
   - **User Name**: `user@embeddedindia.in` (Full email address)
   - **Password**: Your Mailbox Password
5. Click **More Settings** -> Ensure SSL/TLS is checked.
6. Click <kbd>Next</kbd>. Outlook will verify connection and begin push syncing.

---

### 📱 Mobile Setup (iPhone / iPad / Android)

#### iOS (Apple Mail):
1. Go to **Settings** -> **Mail** -> **Accounts** -> <kbd>➕ Add Account</kbd>.
2. Choose **Microsoft Exchange**.
3. Enter:
   - **Email**: `user@embeddedindia.in`
   - **Description**: `Embedded India Mail`
4. Tap **Configure Manually**.
5. Enter:
   - **Server**: `mail.embeddedindia.in`
   - **Domain**: `embeddedindia.in` (or leave blank)
   - **Username**: `user@embeddedindia.in`
   - **Password**: Your Password
6. Tap <kbd>💾 Save</kbd>. Enable Mail, Contacts, and Calendars.

#### Android (Gmail or Outlook App):
1. Open **Settings** -> **Accounts** -> <kbd>➕ Add Account</kbd> -> **Exchange / Corporate**.
2. Enter `user@embeddedindia.in` and password.
3. Server: `mail.embeddedindia.in`, Security Type: `SSL/TLS (accept all certificates)`.
4. Port: `443`.
5. Tap <kbd>✅ Done</kbd>.
