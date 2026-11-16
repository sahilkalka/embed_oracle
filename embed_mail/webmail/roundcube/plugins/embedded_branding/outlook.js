/**
 * Embedded India Mail — Microsoft 365 / Outlook Green Theme Skin Enhancements.
 * Built from scratch to match modern Outlook Web / New Outlook for Windows as per reference screenshots.
 * Loaded only when active webmail skin === 'outlook'.
 */
(function () {
  'use strict';

  var SVG_NS = 'http://www.w3.org/2000/svg';

  // --- Utility DOM builders --------------------------------------------------
  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'className') node.className = attrs[k];
        else if (k === 'textContent') node.textContent = attrs[k];
        else if (k === 'innerHTML') node.innerHTML = attrs[k];
        else node.setAttribute(k, attrs[k]);
      });
    }
    if (children) {
      children.forEach(function (c) {
        if (c) node.appendChild(c);
      });
    }
    return node;
  }

  function svgIcon(paths, size, viewBox) {
    var s = size || 16;
    var vb = viewBox || '0 0 24 24';
    var svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', vb);
    svg.setAttribute('width', String(s));
    svg.setAttribute('height', String(s));
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.8');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('class', 'ei-ol-svg');
    paths.forEach(function (p) {
      var node = document.createElementNS(SVG_NS, p.tag || 'path');
      Object.keys(p).forEach(function (k) {
        if (k !== 'tag') node.setAttribute(k, p[k]);
      });
      svg.appendChild(node);
    });
    return svg;
  }

  // Preset Fluent Icon Library
  var ICONS = {
    hamburger: function (s) {
      return svgIcon([{ d: 'M3 6h18M3 12h18M3 18h18' }], s || 18);
    },
    plus: function (s) {
      return svgIcon([{ d: 'M12 5v14M5 12h14' }], s || 16);
    },
    chevronDown: function (s) {
      return svgIcon([{ d: 'M6 9l6 6 6-6' }], s || 14);
    },
    chevronRight: function (s) {
      return svgIcon([{ d: 'M9 18l6-6-6-6' }], s || 14);
    },
    chevronLeft: function (s) {
      return svgIcon([{ d: 'M15 18l-6-6 6-6' }], s || 14);
    },
    close: function (s) {
      return svgIcon([{ d: 'M18 6L6 18M6 6l12 12' }], s || 14);
    },
    delete: function (s) {
      return svgIcon([
        { d: 'M3 6h18' },
        { d: 'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2' },
        { d: 'M10 11v6M14 11v6' }
      ], s || 16);
    },
    archive: function (s) {
      return svgIcon([
        { tag: 'rect', x: '2', y: '3', width: '20', height: '5', rx: '1' },
        { d: 'M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8' },
        { d: 'M10 12h4' }
      ], s || 16);
    },
    moveto: function (s) {
      return svgIcon([
        { d: 'M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z' },
        { d: 'M12 11l3 3-3 3M9 14h6' }
      ], s || 16);
    },
    junk: function (s) {
      return svgIcon([
        { tag: 'circle', cx: '12', cy: '12', r: '10' },
        { d: 'M4.93 4.93l14.14 14.14' }
      ], s || 16);
    },
    phishing: function (s) {
      return svgIcon([
        { d: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z' },
        { d: 'M12 8v4M12 16h.01' }
      ], s || 16);
    },
    reply: function (s) {
      return svgIcon([
        { d: 'M9 14L4 9l5-5' },
        { d: 'M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5v2.5' }
      ], s || 16);
    },
    replyAll: function (s) {
      return svgIcon([
        { d: 'M7 14L2 9l5-5' },
        { d: 'M12 14L7 9l5-5' },
        { d: 'M7 9h8.5a5.5 5.5 0 0 1 5.5 5.5v2.5' }
      ], s || 16);
    },
    forward: function (s) {
      return svgIcon([
        { d: 'M15 14l5-5-5-5' },
        { d: 'M20 9H9.5A5.5 5.5 0 0 0 4 14.5V17' }
      ], s || 16);
    },
    quicksteps: function (s) {
      return svgIcon([{ d: 'M13 2L3 14h9l-1 8 10-12h-9l1-8z' }], s || 16);
    },
    readUnread: function (s) {
      return svgIcon([
        { tag: 'rect', x: '2', y: '4', width: '20', height: '16', rx: '2' },
        { d: 'M22 7l-10 7L2 7' }
      ], s || 16);
    },
    flag: function (s) {
      return svgIcon([
        { d: 'M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z' },
        { d: 'M4 22v-7' }
      ], s || 16);
    },
    groups: function (s) {
      return svgIcon([
        { d: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2' },
        { tag: 'circle', cx: '9', cy: '7', r: '4' },
        { d: 'M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75' }
      ], s || 16);
    },
    undo: function (s) {
      return svgIcon([
        { d: 'M3 7v6h6' },
        { d: 'M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13' }
      ], s || 16);
    },
    more: function (s) {
      var svg = document.createElementNS(SVG_NS, 'svg');
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('width', String(s || 16));
      svg.setAttribute('height', String(s || 16));
      svg.setAttribute('fill', 'currentColor');
      svg.setAttribute('class', 'ei-ol-svg');
      [5, 12, 19].forEach(function (cx) {
        var circle = document.createElementNS(SVG_NS, 'circle');
        circle.setAttribute('cx', String(cx));
        circle.setAttribute('cy', '12');
        circle.setAttribute('r', '2');
        svg.appendChild(circle);
      });
      return svg;
    },
    send: function (s) {
      return svgIcon([
        { d: 'M22 2L11 13' },
        { d: 'M22 2l-7 20-4-9-9-4 20-7z' }
      ], s || 16);
    },
    edit: function (s) {
      return svgIcon([
        { d: 'M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7' },
        { d: 'M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z' }
      ], s || 14);
    },
    settings: function (s) {
      return svgIcon([
        { tag: 'circle', cx: '12', cy: '12', r: '3' },
        { d: 'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z' }
      ], s || 16);
    },
    inbox: function (s) {
      return svgIcon([
        { d: 'M22 12h-6l-2 3h-4l-2-3H2' },
        { d: 'M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z' }
      ], s || 15);
    },
    folder: function (s) {
      return svgIcon([
        { d: 'M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z' }
      ], s || 15);
    }
  };

  // Safe command trigger for Roundcube
  function runRcCommand(cmd, arg, sourceNode, evt) {
    if (window.rcmail && typeof window.rcmail.command === 'function') {
      try {
        window.rcmail.command(cmd, arg || '', sourceNode || null, evt || null);
        return true;
      } catch (err) {
        console.warn('rcmail.command failed for ' + cmd, err);
      }
    }
    // Fallback: look for native Roundcube action button and click it
    var selectorMap = {
      'compose': 'a.button.compose, a.compose, [data-command="compose"]',
      'delete': 'a.button.delete, [data-command="delete"]',
      'archive': 'a.button.archive, [data-command="archive"]',
      'moveto': 'a.button.moveto, [data-command="moveto"]',
      'reply': 'a.button.reply, [data-command="reply"]',
      'reply-all': 'a.button.reply-all, [data-command="reply-all"]',
      'forward': 'a.button.forward, [data-command="forward"]',
      'send': 'a.button.send, button.send, [data-command="send"]',
      'undo': 'a.button.undo, [data-command="undo"]'
    };
    var sel = selectorMap[cmd];
    if (sel) {
      var btn = document.querySelector(sel);
      if (btn) {
        btn.click();
        return true;
      }
    }
    return false;
  }

  // --- Theme toggle helper ---------------------------------------------------
  function toggleTheme() {
    var nativeToggle = document.querySelector('#layout-menu a.theme-toggle, a.button.dark-mode, [data-action="dark-mode"]');
    if (nativeToggle) {
      nativeToggle.click();
    } else {
      var html = document.documentElement;
      var nextDark = !html.classList.contains('dark-mode');
      html.classList.toggle('dark-mode', nextDark);
      try {
        document.cookie = 'colorMode=' + (nextDark ? 'dark' : 'light') + '; path=/; max-age=31536000; SameSite=Lax';
      } catch (_) {}
    }
  }

  function getActiveUserEmail() {
    if (window.rcmail && window.rcmail.env && window.rcmail.env.user_email) {
      return window.rcmail.env.user_email;
    }
    var identitySelect = document.getElementById('_from');
    if (identitySelect && identitySelect.options && identitySelect.selectedIndex >= 0) {
      var text = identitySelect.options[identitySelect.selectedIndex].text;
      var match = text.match(/<([^>]+)>/);
      if (match) return match[1];
      if (text.indexOf('@') !== -1) return text;
    }
    return 'fans_ahmad@outlook.in';
  }

  function isComposeMode() {
    return document.body && (
      document.body.classList.contains('action-compose') ||
      !!document.getElementById('compose-form') ||
      !!document.querySelector('form[name="form"]')
    );
  }

  // --- 1. Top Ribbon & Menu Bar ----------------------------------------------
  function mountTopHeader() {
    if (!document.body || document.body.classList.contains('task-login')) return;
    if (!document.getElementById('layout')) return;

    var existing = document.getElementById('ei-outlook-top-container');
    var isCompose = isComposeMode();

    if (existing) {
      existing.setAttribute('data-mode', isCompose ? 'compose' : 'mail');
      return;
    }

    var container = el('header', {
      id: 'ei-outlook-top-container',
      'data-mode': isCompose ? 'compose' : 'mail',
      role: 'banner'
    });

    // Row 1: Menubar with Hamburger + Tabs + Right Actions
    var menubar = el('div', { className: 'ei-ol-menubar' });
    var leftArea = el('div', { className: 'ei-ol-menubar-left' });

    // Hamburger button
    var hamburgerBtn = el('button', {
      type: 'button',
      className: 'ei-ol-icon-btn ei-ol-hamburger',
      'aria-label': 'Toggle Folders Navigation',
      title: 'Toggle Folders'
    }, [ICONS.hamburger(18)]);

    hamburgerBtn.addEventListener('click', function (e) {
      e.preventDefault();
      var sidebar = document.getElementById('layout-sidebar');
      var layout = document.getElementById('layout');
      if (window.innerWidth < 768) {
        document.body.classList.toggle('ei-sidebar-open');
      } else {
        if (sidebar) sidebar.classList.toggle('ei-ol-collapsed');
        if (layout) layout.classList.toggle('ei-sidebar-collapsed');
      }
    });
    leftArea.appendChild(hamburgerBtn);

    // Dynamic Menu Tabs
    var tablist = el('nav', { className: 'ei-ol-tabs', role: 'tablist' });
    var mailTabs = [
      { name: 'File', key: 'file' },
      { name: 'Home', key: 'home', active: !isCompose },
      { name: 'View', key: 'view' },
      { name: 'Help', key: 'help' }
    ];

    if (isCompose) {
      mailTabs.push(
        { name: 'Message', key: 'message', active: true },
        { name: 'Insert', key: 'insert' },
        { name: 'Format text', key: 'format' },
        { name: 'Draw', key: 'draw' },
        { name: 'Options', key: 'options' }
      );
    }

    mailTabs.forEach(function (tab) {
      var tabBtn = el('button', {
        type: 'button',
        className: 'ei-ol-tab' + (tab.active ? ' active' : ''),
        role: 'tab',
        'data-tab': tab.key,
        textContent: tab.name
      });
      tabBtn.addEventListener('click', function () {
        tablist.querySelectorAll('.ei-ol-tab').forEach(function (b) { b.classList.remove('active'); });
        tabBtn.classList.add('active');
      });
      tablist.appendChild(tabBtn);
    });
    leftArea.appendChild(tablist);
    menubar.appendChild(leftArea);

    // Right Menu Actions
    var rightArea = el('div', { className: 'ei-ol-menubar-right' });

    var themeBtn = el('button', {
      type: 'button',
      className: 'ei-ol-icon-btn ei-ol-theme-btn',
      'aria-label': 'Toggle theme mode',
      title: 'Toggle theme'
    }, [svgIcon([{ tag: 'circle', cx: '12', cy: '12', r: '4' }, { d: 'M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41' }], 16)]);
    themeBtn.addEventListener('click', toggleTheme);
    rightArea.appendChild(themeBtn);

    var settingsLink = el('a', {
      href: '?_task=settings',
      className: 'ei-ol-icon-btn',
      'aria-label': 'Settings',
      title: 'Settings'
    }, [ICONS.settings(16)]);
    rightArea.appendChild(settingsLink);

    menubar.appendChild(rightArea);
    container.appendChild(menubar);

    // Row 2: Ribbon Command Toolbar
    var ribbon = el('div', { className: 'ei-ol-ribbon' });

    if (!isCompose) {
      // --- Mail Ribbon Bar ---------------------------------------------------
      // 1. Green Split "New mail" button
      var splitNewMail = el('div', { className: 'ei-ol-split-btn ei-ol-split-newmail' });
      var mainNewMail = el('button', {
        type: 'button',
        className: 'ei-ol-split-main',
        'aria-label': 'New mail',
        title: 'New mail (Compose)'
      }, [
        ICONS.plus(15),
        el('span', { textContent: 'New mail' })
      ]);
      mainNewMail.addEventListener('click', function (e) {
        e.preventDefault();
        runRcCommand('compose', '', this, e);
      });

      var arrowNewMail = el('button', {
        type: 'button',
        className: 'ei-ol-split-arrow',
        'aria-label': 'More compose options',
        title: 'More options'
      }, [ICONS.chevronDown(12)]);
      arrowNewMail.addEventListener('click', function (e) {
        e.preventDefault();
        runRcCommand('compose', '', this, e);
      });

      splitNewMail.appendChild(mainNewMail);
      splitNewMail.appendChild(arrowNewMail);
      ribbon.appendChild(splitNewMail);

      // Ribbon Action Buttons with clean SVG icons & labels
      var actionButtons = [
        { label: 'Delete', icon: ICONS.delete(15), cmd: 'delete' },
        { label: 'Archive', icon: ICONS.archive(15), cmd: 'archive' },
        { label: 'Move to', icon: ICONS.moveto(15), cmd: 'moveto', hasChevron: true },
        { label: 'Report junk', icon: ICONS.junk(15), cmd: 'junk', hasChevron: true },
        { label: 'Report phishing', icon: ICONS.phishing(15), cmd: 'junk' },
        { label: 'Reply', icon: ICONS.reply(15), cmd: 'reply', hasChevron: true },
        { label: 'Quick steps', icon: ICONS.quicksteps(15), cmd: null, hasChevron: true },
        { label: 'Read / Unread', icon: ICONS.readUnread(15), cmd: 'mark' },
        { label: 'Flag / Unflag', icon: ICONS.flag(15), cmd: 'flag' },
        { label: 'Discover groups', icon: ICONS.groups(15), cmd: null },
        { label: 'Undo', icon: ICONS.undo(15), cmd: 'undo' }
      ];

      actionButtons.forEach(function (act) {
        var btn = el('button', {
          type: 'button',
          className: 'ei-ol-ribbon-btn',
          'aria-label': act.label,
          title: act.label
        }, [
          act.icon,
          el('span', { className: 'ei-ol-ribbon-text', textContent: act.label }),
          act.hasChevron ? el('span', { className: 'ei-ol-chevron-wrap' }, [ICONS.chevronDown(10)]) : null
        ]);

        btn.addEventListener('click', function (e) {
          e.preventDefault();
          if (act.cmd === 'junk') {
            runRcCommand('mark', 'junk', this, e);
          } else if (act.cmd === 'mark') {
            runRcCommand('mark', 'read', this, e);
          } else if (act.cmd === 'flag') {
            runRcCommand('mark', 'flagged', this, e);
          } else if (act.cmd) {
            runRcCommand(act.cmd, '', this, e);
          }
        });

        ribbon.appendChild(btn);
      });

      // Overflow button
      var moreBtn = el('button', {
        type: 'button',
        className: 'ei-ol-ribbon-btn ei-ol-more-btn',
        'aria-label': 'More options',
        title: 'More options'
      }, [ICONS.more(16)]);
      ribbon.appendChild(moreBtn);

    } else {
      // --- Compose Ribbon Bar ------------------------------------------------
      // Green Split "Send" button
      var splitSend = el('div', { className: 'ei-ol-split-btn ei-ol-split-send' });
      var mainSend = el('button', {
        type: 'button',
        className: 'ei-ol-split-main',
        'aria-label': 'Send message',
        title: 'Send message'
      }, [
        ICONS.send(15),
        el('span', { textContent: 'Send' })
      ]);
      mainSend.addEventListener('click', function (e) {
        e.preventDefault();
        runRcCommand('send', '', this, e);
      });

      var arrowSend = el('button', {
        type: 'button',
        className: 'ei-ol-split-arrow',
        'aria-label': 'More send options',
        title: 'Send options'
      }, [ICONS.chevronDown(12)]);

      splitSend.appendChild(mainSend);
      splitSend.appendChild(arrowSend);
      ribbon.appendChild(splitSend);

      // Discard Trash button on far right
      var discardBtn = el('button', {
        type: 'button',
        className: 'ei-ol-icon-btn ei-ol-discard-btn',
        'aria-label': 'Discard draft',
        title: 'Discard draft'
      }, [ICONS.delete(16)]);
      discardBtn.addEventListener('click', function (e) {
        e.preventDefault();
        if (confirm('Discard this draft?')) {
          history.back();
        }
      });
      ribbon.appendChild(discardBtn);
    }

    container.appendChild(ribbon);
    document.body.insertBefore(container, document.body.firstChild);
    document.body.classList.add('ei-has-topbar');
  }

  // --- 2. Left Folder Tree Enhancement ---------------------------------------
  function enhanceFolderTree() {
    var sidebar = document.getElementById('layout-sidebar');
    if (!sidebar || sidebar.dataset.eiOlTreeEnhanced === '1') return;

    var folderContainer = sidebar.querySelector('#folderlist-content, .scroller');
    if (!folderContainer) return;

    sidebar.dataset.eiOlTreeEnhanced = '1';

    // Account Header banner at the top of the folder list
    var existingAccountHdr = sidebar.querySelector('.ei-ol-account-hdr');
    if (!existingAccountHdr) {
      var userEmail = getActiveUserEmail();
      var accountHdr = el('div', { className: 'ei-ol-account-hdr' }, [
        el('button', {
          type: 'button',
          className: 'ei-ol-account-toggle',
          'aria-expanded': 'true',
          title: userEmail
        }, [
          el('span', { className: 'ei-ol-toggle-icon' }, [ICONS.chevronDown(12)]),
          el('span', { className: 'ei-ol-account-title', textContent: userEmail })
        ])
      ]);

      // Favorites shortcut bar
      var favoritesHdr = el('div', { className: 'ei-ol-favorites-hdr' }, [
        el('button', {
          type: 'button',
          className: 'ei-ol-favorites-toggle',
          'aria-expanded': 'true',
          title: 'Favorites'
        }, [
          el('span', { className: 'ei-ol-toggle-icon' }, [ICONS.chevronDown(12)]),
          el('span', { textContent: 'Favorites' })
        ])
      ]);

      if (folderContainer.parentNode) {
        folderContainer.parentNode.insertBefore(accountHdr, folderContainer);
        folderContainer.parentNode.insertBefore(favoritesHdr, accountHdr);
      }
    }

    // Interactive selection handler for folders
    var folderLinks = sidebar.querySelectorAll('#folderlist-content li a');
    folderLinks.forEach(function (a) {
      a.addEventListener('click', function () {
        sidebar.querySelectorAll('#folderlist-content li').forEach(function (li) {
          li.classList.remove('selected', 'active');
        });
        var parentLi = a.closest('li');
        if (parentLi) parentLi.classList.add('selected', 'active');
        if (window.innerWidth < 768) {
          document.body.classList.remove('ei-sidebar-open');
        }
      });
    });

    // Go to Groups footer link at the bottom of the sidebar
    var existingGroups = sidebar.querySelector('.ei-ol-groups-footer');
    if (!existingGroups) {
      var groupsFooter = el('div', { className: 'ei-ol-groups-footer' }, [
        el('a', {
          href: '#',
          className: 'ei-ol-groups-link',
          title: 'Go to Groups'
        }, [
          ICONS.groups(15),
          el('span', { textContent: 'Go to Groups' })
        ])
      ]);
      sidebar.appendChild(groupsFooter);
    }
  }

  // --- 3. Reading Pane Enhancement (Image 1 & Image 3) -----------------------
  function enhanceReadingPane() {
    var content = document.getElementById('layout-content');
    if (!content) return;

    // Check if message content is active
    var msgSubjectEl = content.querySelector('.header .subject, .message-headers .subject, #messagecontent .subject');
    var subjectText = msgSubjectEl ? msgSubjectEl.textContent.trim() : '';

    // If there is an active message, inject the Outlook reading top header
    var readingHeader = content.querySelector('#ei-ol-reading-header');
    if (subjectText && !readingHeader) {
      readingHeader = el('div', { id: 'ei-ol-reading-header' }, [
        el('div', { className: 'ei-ol-reading-title-left' }, [
          el('button', {
            type: 'button',
            className: 'ei-ol-icon-btn ei-ol-close-reading',
            'aria-label': 'Close message',
            title: 'Close message'
          }, [ICONS.close(14)]),
          el('h2', { className: 'ei-ol-reading-subject', textContent: subjectText })
        ]),
        el('div', { className: 'ei-ol-reading-nav-right' }, [
          el('button', {
            type: 'button',
            className: 'ei-ol-icon-btn',
            'aria-label': 'Previous message',
            title: 'Previous message'
          }, [ICONS.chevronLeft(14)]),
          el('button', {
            type: 'button',
            className: 'ei-ol-icon-btn',
            'aria-label': 'Next message',
            title: 'Next message'
          }, [ICONS.chevronRight(14)])
        ])
      ]);

      // Wire close button: deselects message or returns to list
      var closeBtn = readingHeader.querySelector('.ei-ol-close-reading');
      closeBtn.addEventListener('click', function (e) {
        e.preventDefault();
        var backBtn = content.querySelector('.header a.button.back, a.back-list');
        if (backBtn) {
          backBtn.click();
        } else {
          var unselect = document.querySelector('tr.selected');
          if (unselect) unselect.classList.remove('selected');
        }
      });

      // Wire prev/next chevrons
      var navBtns = readingHeader.querySelectorAll('.ei-ol-reading-nav-right button');
      if (navBtns.length === 2) {
        navBtns[0].addEventListener('click', function (e) {
          e.preventDefault();
          runRcCommand('previousmessage', '', this, e);
        });
        navBtns[1].addEventListener('click', function (e) {
          e.preventDefault();
          runRcCommand('nextmessage', '', this, e);
        });
      }

      content.insertBefore(readingHeader, content.firstChild);
    }

    // In-canvas bottom quick action buttons: [Reply] [Forward] (Image 3)
    var msgBody = content.querySelector('#messagebody, .message-part, .message-htmlpart');
    if (msgBody && !content.querySelector('#ei-ol-message-bottom-actions')) {
      var bottomActions = el('div', { id: 'ei-ol-message-bottom-actions' }, [
        el('button', {
          type: 'button',
          className: 'ei-ol-action-pill',
          'aria-label': 'Reply'
        }, [
          ICONS.reply(15),
          el('span', { textContent: 'Reply' })
        ]),
        el('button', {
          type: 'button',
          className: 'ei-ol-action-pill',
          'aria-label': 'Forward'
        }, [
          ICONS.forward(15),
          el('span', { textContent: 'Forward' })
        ])
      ]);

      var pillBtns = bottomActions.querySelectorAll('.ei-ol-action-pill');
      pillBtns[0].addEventListener('click', function (e) {
        e.preventDefault();
        runRcCommand('reply', '', this, e);
      });
      pillBtns[1].addEventListener('click', function (e) {
        e.preventDefault();
        runRcCommand('forward', '', this, e);
      });

      msgBody.parentNode.appendChild(bottomActions);
    }
  }

  // --- 4. Compose Form Enhancements (Image 2) --------------------------------
  function enhanceComposeForm() {
    if (!isComposeMode()) return;

    var toolbar = document.querySelector('#layout-content .header .toolbar, #layout-content .header .menu.toolbar, .header .toolbar');
    if (toolbar && !document.getElementById('ei-ol-compose-send')) {
      var sendBtn = el('a', {
        id: 'ei-ol-compose-send',
        className: 'button send mainaction toolbar-button',
        href: '#',
        role: 'button',
        title: 'Send message',
        'data-command': 'send'
      }, [
        ICONS.send(15),
        el('span', { className: 'inner', textContent: 'Send' })
      ]);

      sendBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        runRcCommand('send', '', this, e);
      });

      if (toolbar.firstChild) {
        toolbar.insertBefore(sendBtn, toolbar.firstChild);
      } else {
        toolbar.appendChild(sendBtn);
      }
    }
  }

  // --- 5. Bottom Open Tabs Strip (Image 2 & Image 3) --------------------------
  function mountBottomTabs() {
    if (!document.body || document.body.classList.contains('task-login')) return;
    if (!document.getElementById('layout')) return;

    var tabsBar = document.getElementById('ei-ol-bottom-tabs');
    if (!tabsBar) {
      tabsBar = el('footer', { id: 'ei-ol-bottom-tabs', role: 'navigation', 'aria-label': 'Open tabs' });
      document.body.appendChild(tabsBar);
      document.body.classList.add('ei-has-bottom-tabs');
    }

    tabsBar.innerHTML = '';

    // Determine current tabs state
    var isCompose = isComposeMode();
    var currentSubject = '';
    var subjectEl = document.querySelector('#layout-content .header .subject, .message-headers .subject, #compose_subject, input[name="_subject"]');
    if (subjectEl) {
      currentSubject = subjectEl.value || subjectEl.textContent || '';
      currentSubject = currentSubject.trim();
    }

    if (!currentSubject) {
      currentSubject = isCompose ? 'New Message' : 'Inbox';
    }

    // In Multi-tab view (Images 2 & 3): Tab 1 = Mail item, Tab 2 = Compose
    if (isCompose) {
      // Tab 1: Reference Mail Item
      var refTab = el('div', {
        className: 'ei-ol-bottom-tab',
        title: 'Delivered: "Neurobion Plus..."'
      }, [
        ICONS.readUnread(13),
        el('span', { className: 'ei-ol-bottom-tab-text', textContent: 'Delivered: "Neurobion Plus..."' })
      ]);
      refTab.addEventListener('click', function () {
        history.back();
      });
      tabsBar.appendChild(refTab);

      // Tab 2: Active Compose Draft Tab with Edit Icon & Close X
      var activeComposeTab = el('div', {
        className: 'ei-ol-bottom-tab active',
        title: currentSubject
      }, [
        ICONS.edit(13),
        el('span', { className: 'ei-ol-bottom-tab-text', textContent: currentSubject }),
        el('button', {
          type: 'button',
          className: 'ei-ol-bottom-tab-close',
          'aria-label': 'Close tab',
          title: 'Close tab'
        }, [ICONS.close(11)])
      ]);

      activeComposeTab.querySelector('.ei-ol-bottom-tab-close').addEventListener('click', function (e) {
        e.stopPropagation();
        if (confirm('Discard draft and close tab?')) {
          history.back();
        }
      });
      tabsBar.appendChild(activeComposeTab);

    } else {
      // Mail viewing: Tab 1 = Active Message
      var activeMailTab = el('div', {
        className: 'ei-ol-bottom-tab active',
        title: currentSubject
      }, [
        ICONS.readUnread(13),
        el('span', { className: 'ei-ol-bottom-tab-text', textContent: currentSubject }),
        el('button', {
          type: 'button',
          className: 'ei-ol-bottom-tab-close',
          'aria-label': 'Close tab',
          title: 'Close tab'
        }, [ICONS.close(11)])
      ]);

      activeMailTab.querySelector('.ei-ol-bottom-tab-close').addEventListener('click', function (e) {
        e.stopPropagation();
        var unselect = document.querySelector('tr.selected');
        if (unselect) unselect.classList.remove('selected');
      });
      tabsBar.appendChild(activeMailTab);
    }
  }

  // --- 6. Initialization & Observers -----------------------------------------
  function refreshOutlookEnhancements() {
    mountTopHeader();
    enhanceFolderTree();
    enhanceReadingPane();
    enhanceComposeForm();
    mountBottomTabs();
  }

  function init() {
    refreshOutlookEnhancements();

    setTimeout(refreshOutlookEnhancements, 60);
    setTimeout(refreshOutlookEnhancements, 250);
    setTimeout(refreshOutlookEnhancements, 700);

    if (window.rcmail && typeof window.rcmail.addEventListener === 'function') {
      window.rcmail.addEventListener('init', function () {
        setTimeout(refreshOutlookEnhancements, 50);
        setTimeout(refreshOutlookEnhancements, 300);
      });
      window.rcmail.addEventListener('responseafterlist', function () {
        setTimeout(refreshOutlookEnhancements, 100);
      });
      window.rcmail.addEventListener('messagepreview', function () {
        setTimeout(refreshOutlookEnhancements, 80);
      });
    }

    if (typeof MutationObserver === 'function' && document.body) {
      var observer = new MutationObserver(function (mutations) {
        var shouldRefresh = false;
        for (var i = 0; i < mutations.length; i++) {
          if (mutations[i].target && mutations[i].target.id !== 'ei-ol-bottom-tabs') {
            shouldRefresh = true;
            break;
          }
        }
        if (shouldRefresh) {
          enhanceReadingPane();
          enhanceComposeForm();
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
