import React, { useState, useEffect, useCallback } from 'react';
import {
  fetchCurrentUser,
  fetchFolders,
  fetchThreads,
  fetchThreadDetail,
  executeBatchAction,
  sendEmail,
  subscribeToRealtimeUpdates,
  SendMailPayload
} from './api';
import { Folder, Tag, ThreadSummary, ThreadDetail, User, MessageDetail } from './types';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { ThreadList } from './components/ThreadList';
import { ReadingPane } from './components/ReadingPane';
import { Composer } from './components/Composer';
import { ShortcutsModal } from './components/ShortcutsModal';
import { Sparkles, CheckCircle2 } from 'lucide-react';

export const App: React.FC = () => {
  // Global States
  const [user, setUser] = useState<User | null>(null);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [activeFolder, setActiveFolder] = useState<string>('inbox');
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    const saved = localStorage.getItem('ei_webmail_theme');
    if (saved) return saved === 'dark';
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  });
  const [isShortcutsOpen, setIsShortcutsOpen] = useState<boolean>(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState<boolean>(false);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [liveToast, setLiveToast] = useState<string | null>(null);

  // Responsive breakpoint detection
  const [isMobile, setIsMobile] = useState<boolean>(() => window.innerWidth < 768);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Thread list states
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [checkedThreadIds, setCheckedThreadIds] = useState<string[]>([]);
  const [filterUnreadOnly, setFilterUnreadOnly] = useState<boolean>(false);
  const [filterAttachmentsOnly, setFilterAttachmentsOnly] = useState<boolean>(false);
  const [isThreadsLoading, setIsThreadsLoading] = useState<boolean>(false);

  // Active Reading Thread
  const [threadDetail, setThreadDetail] = useState<ThreadDetail | null>(null);
  const [isDetailLoading, setIsDetailLoading] = useState<boolean>(false);
  const [remoteImagesLoaded, setRemoteImagesLoaded] = useState<boolean>(false);

  // Composer Modal State
  const [isComposerOpen, setIsComposerOpen] = useState<boolean>(false);
  const [composerInitialData, setComposerInitialData] = useState<{
    to?: string[];
    cc?: string[];
    subject?: string;
    html?: string;
    inReplyTo?: string;
    references?: string;
  } | undefined>(undefined);

  // 1. Initial Load: User & Folders
  useEffect(() => {
    fetchCurrentUser().then(setUser);
    loadFolders();
  }, []);

  const loadFolders = async () => {
    try {
      const data = await fetchFolders();
      setFolders(data.folders);
      setTags(data.tags);
    } catch (err) {
      console.error('Error loading folders:', err);
    }
  };

  // 2. Load Threads when folder/tag/search/filters change
  const loadThreads = useCallback(async () => {
    setIsThreadsLoading(true);
    try {
      const data = await fetchThreads({
        folder: activeFolder,
        tag: activeTag || undefined,
        q: searchQuery || undefined,
        unread: filterUnreadOnly,
        attachments: filterAttachmentsOnly,
      });
      setThreads(data.threads);

      // On desktop, auto-select first thread if none is selected
      if (!isMobile && data.threads.length > 0) {
        if (!selectedThreadId || !data.threads.some((t) => t.id === selectedThreadId)) {
          setSelectedThreadId(data.threads[0].id);
        }
      } else if (data.threads.length === 0) {
        setSelectedThreadId(null);
        setThreadDetail(null);
      }
    } catch (err) {
      console.error('Error loading threads:', err);
    } finally {
      setIsThreadsLoading(false);
    }
  }, [activeFolder, activeTag, searchQuery, filterUnreadOnly, filterAttachmentsOnly, isMobile]);

  useEffect(() => {
    loadThreads();
  }, [loadThreads]);

  // 3. Load Thread Detail when selectedThreadId changes
  useEffect(() => {
    if (!selectedThreadId) {
      setThreadDetail(null);
      return;
    }

    setIsDetailLoading(true);
    setRemoteImagesLoaded(false);
    fetchThreadDetail(selectedThreadId, true)
      .then((detail) => {
        setThreadDetail(detail);
        loadFolders();
      })
      .catch((err) => {
        console.error('Error loading thread detail:', err);
      })
      .finally(() => {
        setIsDetailLoading(false);
      });
  }, [selectedThreadId]);

  // 4. Real-time Updates via Server-Sent Events (SSE)
  useEffect(() => {
    const unsubscribe = subscribeToRealtimeUpdates((event, payload) => {
      console.log('[Live SSE Event Received]:', event, payload);
      loadThreads();
      loadFolders();

      // Show live bouncy toast
      if (payload?.subject) {
        setLiveToast(`New mail: ${payload.subject}`);
        setTimeout(() => setLiveToast(null), 4000);
      }
    });
    return unsubscribe;
  }, [loadThreads]);

  // 5. Dark Mode Sync with html tag and localStorage
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('ei_webmail_theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('ei_webmail_theme', 'light');
    }
  }, [darkMode]);

  // Actions
  const handleLoadRemoteImages = () => {
    if (selectedThreadId) {
      setRemoteImagesLoaded(true);
      fetchThreadDetail(selectedThreadId, false).then(setThreadDetail);
    }
  };

  const handleBatchAction = async (action: 'markRead' | 'star' | 'delete', value: any) => {
    const ids = checkedThreadIds.length > 0 ? checkedThreadIds : (selectedThreadId ? [selectedThreadId] : []);
    if (ids.length === 0) return;

    await executeBatchAction(ids, action, value);
    setCheckedThreadIds([]);
    await loadThreads();
    await loadFolders();
  };

  const handleReply = (message: MessageDetail, type: 'reply' | 'replyAll' | 'forward') => {
    const cleanSubject = message.subject.startsWith('Re:') || message.subject.startsWith('Fwd:')
      ? message.subject
      : `${type === 'forward' ? 'Fwd: ' : 'Re: '}${message.subject}`;

    const quoteHtml = `
      <br><br>
      <div style="border-left: 2px solid #0078d4; padding-left: 8px; margin-left: 4px; color: #64748b;">
        <p><strong>On ${message.sentAt || message.receivedAt}, ${message.fromName || message.fromEmail} wrote:</strong></p>
        ${message.htmlBody || `<p>${message.textBody}</p>`}
      </div>
    `;

    setComposerInitialData({
      to: type === 'forward' ? [] : [message.fromEmail],
      cc: type === 'replyAll' ? message.toRecipients.map((r) => r.address).filter((a) => a !== user?.email) : [],
      subject: cleanSubject,
      html: quoteHtml,
      inReplyTo: message.messageId,
      references: message.messageId,
    });
    setIsComposerOpen(true);
  };

  const handleSendEmail = async (payload: SendMailPayload) => {
    await sendEmail(payload);
    await loadFolders();
    if (activeFolder === 'sent') loadThreads();
    setLiveToast('Message dispatched via Amazon SES!');
    setTimeout(() => setLiveToast(null), 3000);
  };

  // Live Simulation Trigger
  const handleSimulateIncoming = async () => {
    const topics = [
      {
        from: '"Ananya Rao (Defence Systems)" <ananya.rao@drdo-systems.gov.in>',
        sub: 'High-Temperature PCB Substrate Consultation for Aerospace Radar',
        body: '<p>Hello Embedded India Team,</p><p>We would like to review your RF substrate layout specifications for our high-temperature phased-array radar controller.</p>'
      },
      {
        from: '"Amazon SES Telemetry" <no-reply@amazonses.com>',
        sub: 'Daily SES Delivery Report: 100% Inbound Delivery Rate',
        body: '<p>All outbound emails sent from embeddedindia.in achieved 100% inbox placement with 0% bounce rate in the last 24 hours.</p>'
      },
      {
        from: '"Oracle Cloud Watchdog" <watchdog@oraclecloud.internal>',
        sub: 'System Telemetry: Zero Packet Loss on ARM64 Flex VM',
        body: '<p>Oracle Linux kernel reports optimal throughput on OCI 4Gbps NIC with active systemd webmail cluster.</p>'
      }
    ];

    const pick = topics[Math.floor(Math.random() * topics.length)];
    const rawEml = `From: ${pick.from}\nTo: info@embeddedindia.in\nSubject: ${pick.sub}\nDate: ${new Date().toUTCString()}\nMessage-ID: <sim-${Date.now()}@simulation.com>\nContent-Type: text/html; charset=utf-8\n\n${pick.body}`;

    try {
      await fetch('/api/webhooks/test-inbound-eml', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eml: rawEml }),
      });
    } catch (err) {
      console.error('Simulation error:', err);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([loadThreads(), loadFolders()]);
    setTimeout(() => setIsRefreshing(false), 500);
  };

  // 6. Global Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        if (e.key === 'Escape') target.blur();
        return;
      }

      if (e.key === 'c' || e.key === 'C') {
        e.preventDefault();
        setComposerInitialData(undefined);
        setIsComposerOpen(true);
      } else if (e.key === 'j' || e.key === 'ArrowDown') {
        e.preventDefault();
        if (threads.length > 0) {
          const idx = threads.findIndex((t) => t.id === selectedThreadId);
          if (idx < threads.length - 1) setSelectedThreadId(threads[idx + 1].id);
        }
      } else if (e.key === 'k' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (threads.length > 0) {
          const idx = threads.findIndex((t) => t.id === selectedThreadId);
          if (idx > 0) setSelectedThreadId(threads[idx - 1].id);
        }
      } else if (e.key === 'e' || e.key === 'E') {
        e.preventDefault();
        handleBatchAction('delete', 'archive');
      } else if (e.key === '#' || e.key === 'Delete') {
        e.preventDefault();
        handleBatchAction('delete', true);
      } else if (e.key === 'r' || e.key === 'R') {
        if (threadDetail && threadDetail.messages.length > 0) {
          e.preventDefault();
          handleReply(threadDetail.messages[threadDetail.messages.length - 1], 'reply');
        }
      } else if (e.key === 'a' || e.key === 'A') {
        if (threadDetail && threadDetail.messages.length > 0) {
          e.preventDefault();
          handleReply(threadDetail.messages[threadDetail.messages.length - 1], 'replyAll');
        }
      } else if (e.key === 'f' || e.key === 'F') {
        if (threadDetail && threadDetail.messages.length > 0) {
          e.preventDefault();
          handleReply(threadDetail.messages[threadDetail.messages.length - 1], 'forward');
        }
      } else if (e.key === '/') {
        e.preventDefault();
        const searchInput = document.querySelector('header input') as HTMLInputElement;
        searchInput?.focus();
      } else if (e.key === '?') {
        e.preventDefault();
        setIsShortcutsOpen(true);
      } else if (e.key === 'Escape') {
        setIsShortcutsOpen(false);
        setIsComposerOpen(false);
        setIsMobileSidebarOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [threads, selectedThreadId, threadDetail, user]);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100 transition-colors duration-150">
      {/* Top Application Header */}
      <Header
        user={user}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        darkMode={darkMode}
        onToggleDarkMode={() => setDarkMode(!darkMode)}
        onOpenShortcuts={() => setIsShortcutsOpen(true)}
        onToggleMobileSidebar={() => setIsMobileSidebarOpen(!isMobileSidebarOpen)}
        onSimulateIncoming={handleSimulateIncoming}
        onRefresh={handleRefresh}
        isRefreshing={isRefreshing}
      />

      {/* Responsive Workspace Layout with min-w-0 to prevent horizontal overflow */}
      <div className="flex-1 flex overflow-hidden relative min-w-0">
        {/* Sidebar (Desktop sticky / Mobile drawer) */}
        <Sidebar
          folders={folders}
          tags={tags}
          activeFolder={activeFolder}
          activeTag={activeTag}
          onSelectFolder={(slug) => {
            setActiveFolder(slug);
            if (isMobile) setSelectedThreadId(null);
          }}
          onSelectTag={(tag) => {
            setActiveTag(tag);
            if (isMobile) setSelectedThreadId(null);
          }}
          onCompose={() => {
            setComposerInitialData(undefined);
            setIsComposerOpen(true);
          }}
          isMobileOpen={isMobileSidebarOpen}
          onCloseMobile={() => setIsMobileSidebarOpen(false)}
        />

        {/* Responsive Mobile Condition: Show ThreadList OR ReadingPane */}
        {isMobile ? (
          selectedThreadId ? (
            <div className="flex-1 min-w-0 h-full overflow-hidden">
              <ReadingPane
                thread={threadDetail}
                isLoading={isDetailLoading}
                onReply={handleReply}
                onDelete={(_id) => {
                  handleBatchAction('delete', true);
                  setSelectedThreadId(null);
                }}
                onArchive={(_id) => {
                  handleBatchAction('delete', 'archive');
                  setSelectedThreadId(null);
                }}
                onMarkUnread={(_id) => handleBatchAction('markRead', false)}
                onLoadRemoteImages={handleLoadRemoteImages}
                remoteImagesLoaded={remoteImagesLoaded}
                isMobileView={true}
                onBackToInbox={() => setSelectedThreadId(null)}
                darkMode={darkMode}
              />
            </div>
          ) : (
            <ThreadList
              threads={threads}
              selectedThreadId={selectedThreadId}
              onSelectThread={(id) => setSelectedThreadId(id)}
              checkedThreadIds={checkedThreadIds}
              onToggleCheckThread={(id) =>
                setCheckedThreadIds((prev) =>
                  prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
                )
              }
              onSelectAll={() => setCheckedThreadIds(threads.map((t) => t.id))}
              onClearAllChecks={() => setCheckedThreadIds([])}
              onBatchAction={handleBatchAction}
              filterUnreadOnly={filterUnreadOnly}
              onToggleUnreadOnly={() => setFilterUnreadOnly(!filterUnreadOnly)}
              filterAttachmentsOnly={filterAttachmentsOnly}
              onToggleAttachmentsOnly={() => setFilterAttachmentsOnly(!filterAttachmentsOnly)}
              isLoading={isThreadsLoading}
              isMobileView={true}
            />
          )
        ) : (
          /* Desktop / Tablet Multi-Pane View (min-w-0 ensures no flex blowout) */
          <>
            <ThreadList
              threads={threads}
              selectedThreadId={selectedThreadId}
              onSelectThread={setSelectedThreadId}
              checkedThreadIds={checkedThreadIds}
              onToggleCheckThread={(id) =>
                setCheckedThreadIds((prev) =>
                  prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
                )
              }
              onSelectAll={() => setCheckedThreadIds(threads.map((t) => t.id))}
              onClearAllChecks={() => setCheckedThreadIds([])}
              onBatchAction={handleBatchAction}
              filterUnreadOnly={filterUnreadOnly}
              onToggleUnreadOnly={() => setFilterUnreadOnly(!filterUnreadOnly)}
              filterAttachmentsOnly={filterAttachmentsOnly}
              onToggleAttachmentsOnly={() => setFilterAttachmentsOnly(!filterAttachmentsOnly)}
              isLoading={isThreadsLoading}
              isMobileView={false}
            />

            <div className="flex-1 min-w-0 h-full overflow-hidden">
              <ReadingPane
                thread={threadDetail}
                isLoading={isDetailLoading}
                onReply={handleReply}
                onDelete={(_id) => handleBatchAction('delete', true)}
                onArchive={(_id) => handleBatchAction('delete', 'archive')}
                onMarkUnread={(_id) => handleBatchAction('markRead', false)}
                onLoadRemoteImages={handleLoadRemoteImages}
                remoteImagesLoaded={remoteImagesLoaded}
                isMobileView={false}
                darkMode={darkMode}
              />
            </div>
          </>
        )}

        {/* Live Bouncy Event Toast */}
        {liveToast && (
          <div className="fixed bottom-5 left-5 z-50 bg-slate-900 dark:bg-sky-600 text-white px-4 py-2.5 rounded-xl shadow-2xl flex items-center space-x-2.5 text-xs font-bold animate-spring-pop border border-white/20">
            <Sparkles className="w-4 h-4 text-amber-300 animate-spin" />
            <span>{liveToast}</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
        )}
      </div>

      {/* Floating / Docked Rich Text Composer Modal */}
      <Composer
        isOpen={isComposerOpen}
        onClose={() => setIsComposerOpen(false)}
        onSend={handleSendEmail}
        initialData={composerInitialData}
      />

      {/* Keyboard Shortcuts Cheat Sheet Modal */}
      <ShortcutsModal
        isOpen={isShortcutsOpen}
        onClose={() => setIsShortcutsOpen(false)}
      />
    </div>
  );
};
