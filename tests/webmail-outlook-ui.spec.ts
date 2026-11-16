import { test, expect } from '@playwright/test';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';

const CSS_PATH = path.join(__dirname, '../embed_mail/webmail/roundcube/plugins/embedded_branding/outlook.css');
const JS_PATH = path.join(__dirname, '../embed_mail/webmail/roundcube/plugins/embedded_branding/outlook.js');

const VIEWPORTS = [
  { name: 'Desktop-1920', width: 1920, height: 1080 },
  { name: 'Laptop-1366',  width: 1366, height: 768 },
  { name: 'Tablet-768',   width: 768,  height: 1024 },
  { name: 'Mobile-390',   width: 390,  height: 844 },
];

let server: http.Server;
let port: number;

function generateWebmailHtml(viewType: 'mail' | 'compose' | 'sent' | 'drafts' = 'mail'): string {
  const cssContent = fs.readFileSync(CSS_PATH, 'utf-8');
  const jsContent = fs.readFileSync(JS_PATH, 'utf-8');

  const isCompose = viewType === 'compose';
  const isSent = viewType === 'sent';

  return `<!DOCTYPE html>
<html lang="en" class="ei-skin-outlook layout-desktop">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Embedded India Mail :: ${isCompose ? 'Compose' : (isSent ? 'Sent Items' : 'Inbox')}</title>
  <style>
    /* Reset & Base */
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
    ${cssContent}
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
              <a href="#inbox" data-folder="Inbox">
                <span>Inbox</span>
                <span class="unreadcount">2</span>
              </a>
            </li>
            <li class="mailbox junk" id="rcmli_junk">
              <a href="#junk" data-folder="Junk">
                <span>Junk Email</span>
              </a>
            </li>
            <li class="mailbox drafts" id="rcmli_drafts">
              <a href="#drafts" data-folder="Drafts">
                <span>Drafts</span>
                <span class="unreadcount">[1]</span>
              </a>
            </li>
            <li class="mailbox sent ${isSent ? 'selected active' : ''}" id="rcmli_sent">
              <a href="#sent" data-folder="Sent">
                <span>Sent Items</span>
              </a>
            </li>
            <li class="mailbox trash" id="rcmli_trash">
              <a href="#trash" data-folder="Trash">
                <span>Deleted Items</span>
                <span class="unreadcount">2</span>
              </a>
            </li>
            <li class="mailbox archive" id="rcmli_archive">
              <a href="#archive" data-folder="Archive">
                <span>Archive</span>
                <span class="unreadcount">1</span>
              </a>
            </li>
            <li class="mailbox custom" id="rcmli_amazon">
              <a href="#amazon" data-folder="Amazon">
                <span>Amazon</span>
              </a>
            </li>
            <li class="mailbox custom" id="rcmli_backup">
              <a href="#backup" data-folder="Backup">
                <span>Backup</span>
              </a>
            </li>
            <li class="mailbox custom" id="rcmli_notes">
              <a href="#notes" data-folder="Notes">
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
                <span class="subject"><a>${isSent ? 'FALSE COMMITMENT Order 402-3505122-0233925' : 'Many files were recently deleted from your OneDrive'}</a></span>
              </td>
              <td class="date">${isSent ? 'Fri 6/26/2026' : 'Sun 11/15/2026'}</td>
            </tr>
            <tr class="message" id="rcmrow2">
              <td class="subject">
                <span class="fromto">Amazon.in</span>
                <span class="subject"><a>Delivered: "Neurobion Plus - Strip of..." and 2 more items</a></span>
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
        return true;
      },
      addEventListener: function(ev, cb) {}
    };
  </script>
  <script>${jsContent}</script>
</body>
</html>`;
}

test.beforeAll(async () => {
  server = http.createServer((req, res) => {
    const url = new URL(req.url || '/', `http://localhost`);
    const view = url.searchParams.get('view') || 'mail';
    const html = generateWebmailHtml(view as any);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (addr && typeof addr === 'object') {
        port = addr.port;
      }
      resolve();
    });
  });
});

test.afterAll(async () => {
  if (server) {
    server.close();
  }
});

test.describe('Outlook Webmail Skin Comprehensive UI Suite', () => {
  for (const vp of VIEWPORTS) {
    test.describe(`Viewport: ${vp.name} (${vp.width}x${vp.height})`, () => {
      test('1. Mail View — Top Header & Ribbon Actions', async ({ page }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        const errors: string[] = [];
        page.on('pageerror', (err) => errors.push(err.message));

        await page.goto(`http://127.0.0.1:${port}/?view=mail`);
        await page.waitForSelector('#ei-outlook-top-container');

        // Verify Top container exists & is visible
        const topContainer = page.locator('#ei-outlook-top-container');
        await expect(topContainer).toBeVisible();

        // Check Hamburger button
        const hamburger = page.locator('.ei-ol-hamburger');
        await expect(hamburger).toBeVisible();
        await expect(hamburger.locator('svg')).toBeVisible();

        // Test Hamburger toggle on mobile
        if (vp.width < 768) {
          await hamburger.click();
          await expect(page.locator('body')).toHaveClass(/ei-sidebar-open/);
          await hamburger.click();
          await expect(page.locator('body')).not.toHaveClass(/ei-sidebar-open/);
        }

        // Check Menu Tabs
        const tabs = page.locator('.ei-ol-tab');
        expect(await tabs.count()).toBeGreaterThanOrEqual(4);
        await expect(page.locator('.ei-ol-tab.active')).toHaveText('Home');

        // Check New Mail split button
        const newMailBtn = page.locator('.ei-ol-split-newmail');
        await expect(newMailBtn).toBeVisible();
        await expect(newMailBtn.locator('.ei-ol-split-main svg')).toBeVisible();
        await expect(newMailBtn.locator('.ei-ol-split-arrow svg')).toBeVisible();

        // Check that all Ribbon action buttons have icons (Rule: Always have icon buttons)
        const ribbonButtons = page.locator('.ei-ol-ribbon button');
        const count = await ribbonButtons.count();
        expect(count).toBeGreaterThanOrEqual(8);

        for (let i = 0; i < count; i++) {
          const btn = ribbonButtons.nth(i);
          const hasSvg = await btn.locator('svg').count();
          expect(hasSvg).toBeGreaterThanOrEqual(1);
        }

        // Check no horizontal scrollbar on root
        const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
        const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
        expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 2);

        expect(errors).toEqual([]);
      });

      test('2. Folders Navigation — All Folders & Interactive Selection', async ({ page }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.goto(`http://127.0.0.1:${port}/?view=mail`);

        // Check Account Header injected
        const accountHdr = page.locator('.ei-ol-account-hdr');
        await expect(accountHdr).toBeVisible();
        await expect(accountHdr).toContainText('fans_ahmad@outlook.in');

        // Check Favorites section
        const favoritesHdr = page.locator('.ei-ol-favorites-hdr');
        await expect(favoritesHdr).toBeVisible();

        // If on mobile screen (< 768px), open off-canvas sidebar first via hamburger
        if (vp.width < 768) {
          const hamburger = page.locator('.ei-ol-hamburger');
          await hamburger.click();
          await expect(page.locator('body')).toHaveClass(/ei-sidebar-open/);
        }

        // Check folder items
        const folders = ['Inbox', 'Junk Email', 'Drafts', 'Sent Items', 'Deleted Items', 'Archive'];
        for (const folder of folders) {
          const fEl = page.locator(`#mailboxlist li a:has-text("${folder}")`);
          await expect(fEl).toBeVisible();
        }

        // Check initial active folder pill styling
        const activeFolder = page.locator('#mailboxlist li.selected');
        await expect(activeFolder).toBeVisible();
        await expect(activeFolder).toContainText('Inbox');

        // Test clicking another folder (e.g. Sent Items)
        const sentLink = page.locator('#rcmli_sent a');
        await sentLink.click();
        await expect(page.locator('#rcmli_sent')).toHaveClass(/selected/);
        await expect(page.locator('#rcmli_inbox')).not.toHaveClass(/selected/);

        // Check Go to Groups footer
        const groupsFooter = page.locator('.ei-ol-groups-footer');
        await expect(groupsFooter).toBeVisible();
        await expect(groupsFooter.locator('svg')).toBeVisible();
      });

      test('3. Reading Pane — Headers, Avatar, and Bottom Action Pills', async ({ page }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.goto(`http://127.0.0.1:${port}/?view=mail`);

        // Reading Top Header
        const readingHdr = page.locator('#ei-ol-reading-header');
        await expect(readingHdr).toBeVisible();
        await expect(readingHdr.locator('.ei-ol-close-reading svg')).toBeVisible();
        await expect(readingHdr.locator('.ei-ol-reading-subject')).toHaveText('Many files were recently deleted from your OneDrive');

        // Reading Bottom Action Pills: [Reply] [Forward]
        const bottomActions = page.locator('#ei-ol-message-bottom-actions');
        await expect(bottomActions).toBeVisible();
        const replyPill = bottomActions.locator('button:has-text("Reply")');
        const forwardPill = bottomActions.locator('button:has-text("Forward")');
        await expect(replyPill).toBeVisible();
        await expect(forwardPill).toBeVisible();
        await expect(replyPill.locator('svg')).toBeVisible();
        await expect(forwardPill.locator('svg')).toBeVisible();
      });

      test('4. Sent Items Mail View (Image 3 match)', async ({ page }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.goto(`http://127.0.0.1:${port}/?view=sent`);

        // Check Sent Items is selected folder
        const activeFolder = page.locator('#mailboxlist li.selected');
        await expect(activeFolder).toContainText('Sent Items');

        // Reading header with False commitment subject
        const readingHdr = page.locator('#ei-ol-reading-header');
        await expect(readingHdr).toBeVisible();
        await expect(readingHdr.locator('.ei-ol-reading-subject')).toHaveText('FALSE COMMITMENT Order 402-3505122-0233925');

        // Bottom action pills present
        const bottomActions = page.locator('#ei-ol-message-bottom-actions');
        await expect(bottomActions).toBeVisible();
      });

      test('5. Compose Draft View (Image 2 match)', async ({ page }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.goto(`http://127.0.0.1:${port}/?view=compose`);

        // Check Message tab is active
        const messageTab = page.locator('.ei-ol-tab.active');
        await expect(messageTab).toHaveText('Message');

        // Check Send split button
        const sendSplitBtn = page.locator('.ei-ol-split-send');
        await expect(sendSplitBtn).toBeVisible();
        await expect(sendSplitBtn.locator('.ei-ol-split-main svg')).toBeVisible();
        await expect(sendSplitBtn.locator('.ei-ol-split-arrow svg')).toBeVisible();
        await expect(sendSplitBtn).toContainText('Send');

        // Check Discard button on far right
        const discardBtn = page.locator('.ei-ol-discard-btn');
        await expect(discardBtn).toBeVisible();
        await expect(discardBtn.locator('svg')).toBeVisible();

        // Check recipient pill
        const recipientPill = page.locator('.recipient-pill');
        await expect(recipientPill).toBeVisible();

        // Check natural editor height without clipping
        const editor = page.locator('#composebody');
        await expect(editor).toBeVisible();
        const box = await editor.boundingBox();
        expect(box?.height).toBeGreaterThanOrEqual(150);
      });

      test('6. Bottom Open Tabs Strip (Images 2 & 3 match)', async ({ page }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.goto(`http://127.0.0.1:${port}/?view=compose`);

        // Bottom tabs strip exists
        const tabsBar = page.locator('#ei-ol-bottom-tabs');
        await expect(tabsBar).toBeVisible();

        // Active tab exists with close X button
        const activeTab = tabsBar.locator('.ei-ol-bottom-tab.active');
        await expect(activeTab).toBeVisible();
        await expect(activeTab.locator('svg').first()).toBeVisible();
        await expect(activeTab.locator('.ei-ol-bottom-tab-close')).toBeVisible();

        // Reference tab also visible (Image 2 multi-tab view)
        const refTab = tabsBar.locator('.ei-ol-bottom-tab:not(.active)');
        await expect(refTab).toBeVisible();
        await expect(refTab).toContainText('Delivered: "Neurobion Plus..."');
      });
    });
  }
});
