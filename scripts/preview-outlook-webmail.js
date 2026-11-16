/**
 * Local Interactive Preview Server for Outlook Webmail Skin.
 * Serves the webmail interface with live outlook.css and outlook.js on http://localhost:8080.
 *
 * Usage:
 *   node scripts/preview-outlook-webmail.js
 *
 * Views available:
 *   http://localhost:8080/             -> Mail / Inbox view
 *   http://localhost:8080/?view=compose -> Compose draft view
 *   http://localhost:8080/?view=sent    -> Sent Items view
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8080;
const BRANDING_DIR = path.join(__dirname, '../embed_mail/webmail/roundcube/plugins/embedded_branding');
const CSS_PATH = path.join(BRANDING_DIR, 'outlook.css');
const JS_PATH = path.join(BRANDING_DIR, 'outlook.js');

function renderPage(viewType) {
  const css = fs.readFileSync(CSS_PATH, 'utf-8');
  const js = fs.readFileSync(JS_PATH, 'utf-8');
  const isCompose = viewType === 'compose';
  const isSent = viewType === 'sent';

  return `<!DOCTYPE html>
<html lang="en" class="ei-skin-outlook layout-desktop">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Embedded India Mail :: ${isCompose ? 'Compose' : (isSent ? 'Sent Items' : 'Inbox')}</title>
  <style>
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; width: 100%; height: 100%; }
    #layout { display: flex; width: 100%; height: 100%; overflow: hidden; }
    #layout-sidebar { width: 230px; height: 100%; overflow-y: auto; flex-shrink: 0; }
    #layout-list { width: 320px; height: 100%; overflow-y: auto; flex-shrink: 0; }
    #layout-content { flex: 1; height: 100%; overflow-y: auto; min-width: 0; }
    .listing { list-style: none; margin: 0; padding: 0; }
    .listing li { display: block; }
    .listing li a { display: flex; align-items: center; justify-content: space-between; text-decoration: none; }
    table.messagelist { width: 100%; border-collapse: collapse; }
    table.messagelist td { padding: 10px 12px; border-bottom: 1px solid #edebe9; }
    ${css}
  </style>
</head>
<body class="task-mail ${isCompose ? 'action-compose' : 'action-index'} layout-widescreen ei-has-topbar ei-has-bottom-tabs">
  <div id="layout">
    <!-- Folder Sidebar -->
    <div id="layout-sidebar" role="navigation">
      <div class="scroller">
        <div id="folderlist-content">
          <ul id="mailboxlist" class="treelist listing folderlist">
            <li class="mailbox inbox ${!isCompose && !isSent ? 'selected active' : ''}" id="rcmli_inbox">
              <a href="/?view=mail" data-folder="Inbox">
                <span>Inbox</span>
                <span class="unreadcount">2</span>
              </a>
            </li>
            <li class="mailbox junk" id="rcmli_junk">
              <a href="/?view=mail" data-folder="Junk">
                <span>Junk Email</span>
              </a>
            </li>
            <li class="mailbox drafts" id="rcmli_drafts">
              <a href="/?view=compose" data-folder="Drafts">
                <span>Drafts</span>
                <span class="unreadcount">[1]</span>
              </a>
            </li>
            <li class="mailbox sent ${isSent ? 'selected active' : ''}" id="rcmli_sent">
              <a href="/?view=sent" data-folder="Sent">
                <span>Sent Items</span>
              </a>
            </li>
            <li class="mailbox trash" id="rcmli_trash">
              <a href="/?view=mail" data-folder="Trash">
                <span>Deleted Items</span>
                <span class="unreadcount">2</span>
              </a>
            </li>
            <li class="mailbox archive" id="rcmli_archive">
              <a href="/?view=mail" data-folder="Archive">
                <span>Archive</span>
                <span class="unreadcount">1</span>
              </a>
            </li>
            <li class="mailbox custom" id="rcmli_amazon">
              <a href="/?view=mail" data-folder="Amazon">
                <span>Amazon</span>
              </a>
            </li>
            <li class="mailbox custom" id="rcmli_backup">
              <a href="/?view=mail" data-folder="Backup">
                <span>Backup</span>
              </a>
            </li>
            <li class="mailbox custom" id="rcmli_notes">
              <a href="/?view=mail" data-folder="Notes">
                <span>Notes</span>
              </a>
            </li>
          </ul>
        </div>
      </div>
    </div>

    <!-- Message List -->
    <div id="layout-list" role="region">
      <div id="messagelistcontainer" class="scroller">
        <table class="listing messagelist records-table">
          <tbody>
            <tr class="message selected unread" id="rcmrow1">
              <td class="subject">
                <span class="fromto">${isSent ? 'Fahim Ahmad' : 'OneDrive &lt;no-reply@onedrive.com&gt;'}</span>
                <span class="subject"><a href="/?view=${isSent ? 'sent' : 'mail'}">${isSent ? 'FALSE COMMITMENT Order 402-3505122-0233925' : 'Many files were recently deleted from your OneDrive'}</a></span>
              </td>
              <td class="date">${isSent ? 'Fri 6/26/2026' : 'Sun 11/15/2026'}</td>
            </tr>
            <tr class="message" id="rcmrow2">
              <td class="subject">
                <span class="fromto">Amazon.in</span>
                <span class="subject"><a href="/?view=compose">Delivered: "Neurobion Plus - Strip of..." and 2 more items</a></span>
              </td>
              <td class="date">Sun 11/15/2026</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Reading / Compose Content -->
    <div id="layout-content" role="main">
      ${isCompose ? `
        <form id="compose-form" name="form" method="post">
          <div class="header">
            <div class="toolbar">
              <a href="#" class="button save">Save</a>
              <a href="#" class="button attach">Attach</a>
            </div>
          </div>
          <div id="compose-content">
            <div class="compose-headers" style="padding: 12px;">
              <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
                <label style="font-weight:600; width:40px;">To</label>
                <div class="recipient-input" style="flex:1; border:1px solid #ccc; padding:4px 8px; border-radius:4px;">
                  <span class="recipient-pill" style="background:#e1dfdd; padding:2px 8px; border-radius:12px; font-size:12px;">
                    Amazon.in &lt;order-update@amazon.in&gt; &times;
                  </span>
                </div>
              </div>
              <div style="display:flex; align-items:center; gap:8px;">
                <label style="font-weight:600; width:40px;">Subject</label>
                <input type="text" id="compose_subject" value="Re: Delivered: 'Neurobion Plus - Strip of...' and 2 more items" style="flex:1; padding:6px; border:1px solid #ccc; border-radius:4px;">
              </div>
            </div>
            <div id="composebodycontainer" style="flex:1; padding:12px;">
              <textarea id="composebody" style="width:100%; height:100%; min-height:280px; border:1px solid #eee; padding:10px;">Dear Customer Support,&#10;&#10;Regarding my order...</textarea>
            </div>
          </div>
        </form>
      ` : `
        <div class="header" style="display:none;">
          <h2 class="subject">${isSent ? 'FALSE COMMITMENT Order 402-3505122-0233925' : 'Many files were recently deleted from your OneDrive'}</h2>
        </div>
        <div id="messagecontent" style="padding: 16px;">
          <div class="message-headers" style="margin-bottom:16px;">
            <div class="from" style="font-weight:700;">${isSent ? 'Fahim Ahmad' : 'OneDrive &lt;no-reply@onedrive.com&gt;'}</div>
            <div class="to" style="color:#605e5c; font-size:12px;">${isSent ? 'To: grievance-officer@amazon.in' : 'To: You'}</div>
            <div class="date" style="color:#605e5c; font-size:12px;">${isSent ? 'Fri 6/26/2026 12:24 AM' : 'Sun 11/15/2026 6:10 PM'}</div>
          </div>
          <div id="messagebody">
            <p>Dear Support,</p>
            <p>${isSent ? 'I am writing regarding order number 402-3505122-0233925...' : 'We noticed that you recently deleted a large number of files from your OneDrive.'}</p>
          </div>
        </div>
      `}
    </div>
  </div>

  <script>
    // Mock minimal Roundcube rcmail environment
    window.rcmail = {
      env: { user_email: 'fans_ahmad@outlook.in' },
      command: function(cmd, arg) {
        console.log('rcmail.command invoked: ' + cmd, arg);
        if (cmd === 'compose') window.location.href = '/?view=compose';
        return true;
      },
      addEventListener: function(ev, cb) {}
    };
  </script>
  <script>${js}</script>
</body>
</html>`;
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const view = url.searchParams.get('view') || 'mail';
  const html = renderPage(view);
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
});

server.listen(PORT, () => {
  console.log(`\n============================================================`);
  console.log(` Outlook Webmail Skin Preview Server`);
  console.log(` Listening on: http://localhost:${PORT}`);
  console.log(`============================================================`);
  console.log(` - Inbox view:   http://localhost:${PORT}/?view=mail`);
  console.log(` - Compose view: http://localhost:${PORT}/?view=compose`);
  console.log(` - Sent view:    http://localhost:${PORT}/?view=sent`);
  console.log(`\nPress Ctrl+C to stop.\n`);
});
