import React, { useState, useRef, useEffect } from 'react';
import { format } from 'date-fns';
import {
  Reply,
  ReplyAll,
  Forward,
  Trash2,
  Archive,
  Mail,
  Paperclip,
  Download,
  AlertCircle,
  Eye,
  ChevronDown,
  ChevronUp,
  ArrowLeft
} from 'lucide-react';
import { ThreadDetail, MessageDetail } from '../types';

interface ReadingPaneProps {
  thread: ThreadDetail | null;
  isLoading: boolean;
  onReply: (message: MessageDetail, type: 'reply' | 'replyAll' | 'forward') => void;
  onDelete: (threadId: string) => void;
  onArchive: (threadId: string) => void;
  onMarkUnread: (threadId: string) => void;
  onLoadRemoteImages: () => void;
  remoteImagesLoaded: boolean;
  isMobileView?: boolean;
  onBackToInbox?: () => void;
  darkMode?: boolean;
}

export const ReadingPane: React.FC<ReadingPaneProps> = ({
  thread,
  isLoading,
  onReply,
  onDelete,
  onArchive,
  onMarkUnread,
  onLoadRemoteImages,
  remoteImagesLoaded,
  isMobileView,
  onBackToInbox,
  darkMode,
}) => {
  const [expandedMessageIds, setExpandedMessageIds] = useState<string[]>([]);

  // When thread changes, expand the latest message by default
  useEffect(() => {
    if (thread && thread.messages.length > 0) {
      const lastMsg = thread.messages[thread.messages.length - 1];
      setExpandedMessageIds([lastMsg.id]);
    }
  }, [thread?.id]);

  const toggleExpand = (messageId: string) => {
    setExpandedMessageIds((prev) =>
      prev.includes(messageId) ? prev.filter((id) => id !== messageId) : [...prev, messageId]
    );
  };

  if (isLoading) {
    return (
      <main className="flex-1 bg-white dark:bg-slate-950 flex items-center justify-center text-xs text-slate-400">
        <div className="flex flex-col items-center space-y-2">
          <div className="animate-spin w-6 h-6 border-2 border-[#0078d4] border-t-transparent rounded-full" />
          <p>Loading conversation...</p>
        </div>
      </main>
    );
  }

  if (!thread) {
    return (
      <main className="flex-1 bg-slate-50/50 dark:bg-slate-950 flex flex-col items-center justify-center text-slate-400 dark:text-slate-500 p-8 select-none">
        <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-900 flex items-center justify-center mb-4 shadow-inner">
          <Mail className="w-8 h-8 text-slate-400 dark:text-slate-500" />
        </div>
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Select an item to read</p>
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Nothing is selected</p>
      </main>
    );
  }

  const latestMessage = thread.messages[thread.messages.length - 1];

  return (
    <main className="flex-1 bg-white dark:bg-slate-950 flex flex-col h-full overflow-hidden transition-colors duration-150">
      {/* Action Toolbar */}
      <div className="h-11 px-3 md:px-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-600 dark:text-slate-300 bg-slate-50/80 dark:bg-slate-900/80 backdrop-blur-xs flex-shrink-0">
        <div className="flex items-center space-x-1 md:space-x-1.5">
          {/* Mobile Back Button */}
          {isMobileView && onBackToInbox && (
            <button
              onClick={onBackToInbox}
              className="flex items-center space-x-1 mr-2 px-2.5 py-1.5 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-white rounded-md font-semibold text-xs active:scale-95 transition-all"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back</span>
            </button>
          )}

          <button
            onClick={() => onReply(latestMessage, 'reply')}
            title="Reply (R)"
            className="flex items-center space-x-1 px-2.5 py-1.5 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-md text-slate-700 dark:text-slate-200 transition-all active:scale-95 font-medium"
          >
            <Reply className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Reply</span>
          </button>
          <button
            onClick={() => onReply(latestMessage, 'replyAll')}
            title="Reply All (A)"
            className="hidden md:flex items-center space-x-1 px-2.5 py-1.5 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-md text-slate-700 dark:text-slate-200 transition-all active:scale-95 font-medium"
          >
            <ReplyAll className="w-3.5 h-3.5" />
            <span>Reply all</span>
          </button>
          <button
            onClick={() => onReply(latestMessage, 'forward')}
            title="Forward (F)"
            className="flex items-center space-x-1 px-2.5 py-1.5 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-md text-slate-700 dark:text-slate-200 transition-all active:scale-95 font-medium"
          >
            <Forward className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Forward</span>
          </button>

          <div className="h-4 w-[1px] bg-slate-300 dark:bg-slate-700 mx-1" />

          <button
            onClick={() => onDelete(thread.id)}
            title="Delete (#)"
            className="p-1.5 hover:bg-rose-100 dark:hover:bg-rose-950/60 rounded-md text-rose-600 dark:text-rose-400 active:scale-90"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => onArchive(thread.id)}
            title="Archive (E)"
            className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-md text-slate-600 dark:text-slate-300 active:scale-90"
          >
            <Archive className="w-4 h-4" />
          </button>
          <button
            onClick={() => onMarkUnread(thread.id)}
            title="Mark as unread"
            className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-md text-slate-600 dark:text-slate-300 active:scale-90"
          >
            <Mail className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Conversation Scroll Container - Single Clean Scrollbar */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 md:px-6 py-4 space-y-4">
        {/* Subject Header */}
        <div className="border-b border-slate-200 dark:border-slate-800 pb-3">
          <h1 className="text-base md:text-xl font-bold text-slate-900 dark:text-white leading-tight">
            {thread.subject || '(No Subject)'}
          </h1>
          {thread.tags.length > 0 && (
            <div className="flex items-center space-x-1.5 mt-2.5">
              {thread.tags.map((tag) => (
                <span
                  key={tag.id}
                  className="text-[10px] px-2.5 py-0.5 rounded-full font-semibold border shadow-xs"
                  style={{
                    backgroundColor: `${tag.color}15`,
                    borderColor: `${tag.color}40`,
                    color: tag.color,
                  }}
                >
                  {tag.name}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Message Thread Cards */}
        <div className="space-y-4">
          {thread.messages.map((msg) => {
            const isExpanded = expandedMessageIds.includes(msg.id);

            return (
              <div
                key={msg.id}
                className="border border-slate-200 dark:border-slate-800 rounded-xl shadow-xs bg-white dark:bg-slate-900 overflow-hidden transition-all duration-200"
              >
                {/* Message Header */}
                <div
                  onClick={() => toggleExpand(msg.id)}
                  className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-slate-50/80 dark:hover:bg-slate-800/60 transition-colors"
                >
                  <div className="flex items-center space-x-3 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/60 text-[#0078d4] dark:text-sky-300 font-bold flex items-center justify-center text-xs uppercase flex-shrink-0 shadow-xs">
                      {msg.fromName ? msg.fromName[0] : msg.fromEmail[0]}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center space-x-2">
                        <span className="font-bold text-xs text-slate-900 dark:text-white truncate">
                          {msg.fromName || msg.fromEmail}
                        </span>
                        <span className="text-[11px] text-slate-400 dark:text-slate-400 font-normal truncate">
                          &lt;{msg.fromEmail}&gt;
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                        to {msg.toRecipients.map((r) => r.name || r.address).join(', ')}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 md:space-x-3 flex-shrink-0">
                    <span className="text-[11px] text-slate-400 dark:text-slate-400 font-medium">
                      {msg.sentAt ? format(new Date(msg.sentAt), 'MMM d, h:mm a') : ''}
                    </span>
                    <button className="p-1 hover:bg-slate-200 dark:hover:bg-slate-800 rounded text-slate-400">
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Message Body (When Expanded) */}
                {isExpanded && (
                  <div className="px-5 py-4 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900">
                    {/* Privacy Alert for Remote Images */}
                    {msg.hasRemoteImages && !remoteImagesLoaded && (
                      <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 rounded-lg flex items-center justify-between text-xs text-amber-900 dark:text-amber-200 animate-spring-pop">
                        <div className="flex items-center space-x-2">
                          <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0" />
                          <span>External images blocked to protect your IP privacy.</span>
                        </div>
                        <button
                          onClick={onLoadRemoteImages}
                          className="flex items-center space-x-1 font-bold text-[#0078d4] dark:text-sky-400 hover:underline ml-3 flex-shrink-0 active:scale-95"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Load images</span>
                        </button>
                      </div>
                    )}

                    {/* Sandboxed HTML Body with Zero-Scrollbar Guarantee & High-Contrast Dark Styling */}
                    <div className="relative w-full overflow-hidden">
                      <SandboxedEmailIframe
                        html={msg.htmlBody || `<p>${msg.textBody}</p>`}
                        darkMode={Boolean(darkMode)}
                      />
                    </div>

                    {/* Attachments Section */}
                    {msg.attachments.length > 0 && (
                      <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800">
                        <div className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center space-x-1.5 mb-2.5">
                          <Paperclip className="w-3.5 h-3.5 text-slate-400" />
                          <span>{msg.attachments.length} Attachments</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {msg.attachments.map((att) => (
                            <a
                              key={att.id}
                              href={`/api/messages/attachment/${att.id}`}
                              download={att.filename}
                              className="flex items-center space-x-2 px-3 py-2 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-800 dark:text-white transition-all active:scale-95 shadow-xs"
                            >
                              <Paperclip className="w-3.5 h-3.5 text-slate-400" />
                              <span className="font-semibold truncate max-w-[180px]">{att.filename}</span>
                              <span className="text-[10px] text-slate-400">
                                ({Math.round(att.size / 1024)} KB)
                              </span>
                              <Download className="w-3.5 h-3.5 text-slate-400 hover:text-[#0078d4]" />
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
};

// Safe Sandboxed Iframe with NO inner scrollbar and high-contrast typography
const SandboxedEmailIframe: React.FC<{ html: string; darkMode: boolean }> = ({ html, darkMode }) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc) return;

    const darkStyles = darkMode
      ? `
        html, body {
          background-color: transparent !important;
          color: #f8fafc !important;
          overflow: hidden !important;
        }
        p, div, span, li, td, th {
          color: #f1f5f9 !important;
        }
        h1, h2, h3, h4, h5, h6, strong, b {
          color: #ffffff !important;
          font-weight: 700 !important;
        }
        a {
          color: #38bdf8 !important;
          text-decoration: underline !important;
        }
        table {
          width: 100% !important;
          border-collapse: collapse !important;
          margin: 12px 0 !important;
        }
        td, th {
          border: 1px solid #334155 !important;
          padding: 8px 10px !important;
          color: #f1f5f9 !important;
          background-color: #1e293b !important;
        }
        code, pre {
          background-color: #0b0f19 !important;
          color: #38bdf8 !important;
          padding: 2px 6px !important;
          border-radius: 4px !important;
          border: 1px solid #334155 !important;
        }
        blockquote {
          border-left: 3px solid #38bdf8 !important;
          margin: 8px 0 !important;
          padding-left: 12px !important;
          color: #94a3b8 !important;
        }
      `
      : `
        html, body {
          background-color: transparent !important;
          color: #1e293b !important;
          overflow: hidden !important;
        }
        p, div, span, li, td, th {
          color: #334155 !important;
        }
        h1, h2, h3, h4, h5, h6, strong, b {
          color: #0f172a !important;
          font-weight: 700 !important;
        }
        a {
          color: #0078d4 !important;
        }
        table {
          width: 100% !important;
          border-collapse: collapse !important;
          margin: 12px 0 !important;
        }
        td, th {
          border: 1px solid #e2e8f0 !important;
          padding: 8px 10px !important;
          color: #1e293b !important;
          background-color: #f8fafc !important;
        }
        code, pre {
          background-color: #f1f5f9 !important;
          color: #0f172a !important;
          padding: 2px 6px !important;
          border-radius: 4px !important;
          border: 1px solid #e2e8f0 !important;
        }
        blockquote {
          border-left: 3px solid #0078d4 !important;
          margin: 8px 0 !important;
          padding-left: 12px !important;
          color: #64748b !important;
        }
      `;

    doc.open();
    doc.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            * { box-sizing: border-box; }
            html, body {
              margin: 0;
              padding: 0;
              width: 100%;
              overflow: hidden !important;
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
              font-size: 14px;
              line-height: 1.6;
              word-break: break-word;
            }
            img { max-width: 100%; height: auto; border-radius: 4px; }
            ${darkStyles}
          </style>
        </head>
        <body>${html}</body>
      </html>
    `);
    doc.close();

    // Dynamically adjust height and eliminate inner scrollbar completely
    const adjustHeight = () => {
      if (iframe && iframe.contentDocument?.documentElement) {
        const bodyH = iframe.contentDocument.body?.scrollHeight || 0;
        const docH = iframe.contentDocument.documentElement.scrollHeight || 0;
        const finalH = Math.max(bodyH, docH, 60);
        iframe.style.height = `${finalH + 12}px`;
      }
    };

    iframe.onload = adjustHeight;
    const timer = setTimeout(adjustHeight, 100);
    const timer2 = setTimeout(adjustHeight, 400);

    return () => {
      clearTimeout(timer);
      clearTimeout(timer2);
    };
  }, [html, darkMode]);

  return (
    <iframe
      ref={iframeRef}
      scrolling="no"
      allowTransparency={true}
      sandbox="allow-popups allow-popups-to-escape-sandbox allow-same-origin"
      style={{ overflow: 'hidden', background: 'transparent' }}
      className="w-full border-none transition-all duration-150 block"
      title="Email Message Content"
    />
  );
};
