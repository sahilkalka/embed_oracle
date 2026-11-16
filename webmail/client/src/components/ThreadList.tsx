import React from 'react';
import { format, isToday, isYesterday } from 'date-fns';
import { Paperclip, Star, MailOpen, Mail, Trash2, Square, CheckSquare, Sparkles } from 'lucide-react';
import { ThreadSummary } from '../types';

interface ThreadListProps {
  threads: ThreadSummary[];
  selectedThreadId: string | null;
  onSelectThread: (id: string) => void;
  checkedThreadIds: string[];
  onToggleCheckThread: (id: string) => void;
  onSelectAll: () => void;
  onClearAllChecks: () => void;
  onBatchAction: (action: 'markRead' | 'star' | 'delete', value: any) => void;
  filterUnreadOnly: boolean;
  onToggleUnreadOnly: () => void;
  filterAttachmentsOnly: boolean;
  onToggleAttachmentsOnly: () => void;
  isLoading: boolean;
  isMobileView?: boolean;
}

export const ThreadList: React.FC<ThreadListProps> = ({
  threads,
  selectedThreadId,
  onSelectThread,
  checkedThreadIds,
  onToggleCheckThread,
  onSelectAll,
  onClearAllChecks,
  onBatchAction,
  filterUnreadOnly,
  onToggleUnreadOnly,
  filterAttachmentsOnly,
  onToggleAttachmentsOnly,
  isLoading,
  isMobileView,
}) => {
  const formatTime = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      if (isToday(d)) return format(d, 'h:mm a');
      if (isYesterday(d)) return 'Yesterday';
      return format(d, 'MMM d');
    } catch {
      return '';
    }
  };

  return (
    <section
      className={`${
        isMobileView ? 'w-full' : 'w-80 md:w-88 lg:w-96'
      } bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col h-full select-none flex-shrink-0 transition-colors duration-150`}
    >
      {/* Top Filter and Batch Action Bar - Unified h-11 with ReadingPane toolbar */}
      <div className="h-11 px-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-300 flex-shrink-0 bg-slate-50/80 dark:bg-slate-900/80 backdrop-blur-xs">
        {checkedThreadIds.length > 0 ? (
          <div className="flex items-center space-x-2 animate-spring-pop">
            <button
              onClick={onClearAllChecks}
              className="p-1 hover:bg-slate-200 dark:hover:bg-slate-800 rounded active:scale-95"
            >
              <CheckSquare className="w-4 h-4 text-[#0078d4] dark:text-sky-400" />
            </button>
            <span className="font-bold text-slate-800 dark:text-white text-[11px]">
              {checkedThreadIds.length} selected
            </span>
            <div className="h-4 w-[1px] bg-slate-300 dark:bg-slate-700 mx-1" />
            <button
              onClick={() => onBatchAction('markRead', true)}
              title="Mark as read"
              className="p-1 hover:bg-slate-200 dark:hover:bg-slate-800 rounded text-slate-700 dark:text-slate-200 active:scale-90"
            >
              <MailOpen className="w-4 h-4" />
            </button>
            <button
              onClick={() => onBatchAction('markRead', false)}
              title="Mark as unread"
              className="p-1 hover:bg-slate-200 dark:hover:bg-slate-800 rounded text-slate-700 dark:text-slate-200 active:scale-90"
            >
              <Mail className="w-4 h-4" />
            </button>
            <button
              onClick={() => onBatchAction('delete', true)}
              title="Delete"
              className="p-1 hover:bg-rose-100 dark:hover:bg-rose-950/60 rounded text-rose-600 dark:text-rose-400 active:scale-90"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="flex items-center space-x-2">
            <button
              onClick={onSelectAll}
              title="Select all"
              className="p-1 hover:bg-slate-200 dark:hover:bg-slate-800 rounded text-slate-400 dark:text-slate-500 active:scale-90"
            >
              <Square className="w-4 h-4" />
            </button>
            {/* Filter Pills */}
            <div className="flex items-center space-x-1">
              <button
                onClick={onToggleUnreadOnly}
                className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold transition-all duration-150 cursor-pointer active:scale-95 ${
                  filterUnreadOnly
                    ? 'bg-[#0078d4] dark:bg-sky-500 text-white shadow-xs'
                    : 'bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200'
                }`}
              >
                Unread
              </button>
              <button
                onClick={onToggleAttachmentsOnly}
                className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold transition-all duration-150 cursor-pointer active:scale-95 ${
                  filterAttachmentsOnly
                    ? 'bg-[#0078d4] dark:bg-sky-500 text-white shadow-xs'
                    : 'bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200'
                }`}
              >
                Files
              </button>
            </div>
          </div>
        )}

        <div className="text-[11px] font-semibold text-slate-400 dark:text-slate-400 flex items-center space-x-1">
          <span>{threads.length} {threads.length === 1 ? 'item' : 'items'}</span>
        </div>
      </div>

      {/* Thread Cards List */}
      <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/80 p-1.5 space-y-1">
        {isLoading && threads.length === 0 ? (
          <div className="p-10 text-center text-xs text-slate-400 space-y-2">
            <div className="animate-spin w-5 h-5 border-2 border-[#0078d4] border-t-transparent rounded-full mx-auto" />
            <p>Loading messages...</p>
          </div>
        ) : threads.length === 0 ? (
          <div className="p-10 text-center text-xs text-slate-400 dark:text-slate-500">
            <Sparkles className="w-6 h-6 mx-auto mb-2 text-slate-300 dark:text-slate-600" />
            <p className="font-semibold text-slate-700 dark:text-slate-300">All caught up!</p>
            <p className="text-[11px] mt-1 text-slate-400">No emails found in this view</p>
          </div>
        ) : (
          threads.map((thread) => {
            const isSelected = selectedThreadId === thread.id;
            const isChecked = checkedThreadIds.includes(thread.id);
            const isUnread = !thread.isRead;

            return (
              <div
                key={thread.id}
                onClick={() => onSelectThread(thread.id)}
                className={`group relative px-3 py-2.5 rounded-lg cursor-pointer transition-all duration-150 flex items-start space-x-2.5 ${
                  isSelected
                    ? 'bg-blue-50 dark:bg-blue-950/70 border-l-4 border-l-[#0078d4] dark:border-l-sky-400 shadow-sm'
                    : isUnread
                    ? 'bg-white dark:bg-slate-800/90 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-xs'
                    : 'bg-slate-50/70 dark:bg-slate-900/90 hover:bg-slate-100 dark:hover:bg-slate-800/60 border border-transparent'
                } hover:-translate-y-0.5 active:scale-[0.99]`}
              >
                {/* Checkbox & Star */}
                <div
                  className="pt-0.5 flex flex-col items-center space-y-1.5"
                  onClick={(e) => e.stopPropagation()}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => onToggleCheckThread(thread.id)}
                    className="w-3.5 h-3.5 rounded text-[#0078d4] dark:bg-slate-950 dark:border-slate-600 focus:ring-0 cursor-pointer transition-transform active:scale-75"
                  />
                  <button
                    onClick={() => onBatchAction('star', !thread.isStarred)}
                    className="p-0.5 text-slate-300 hover:text-amber-500 transition-transform active:scale-130"
                  >
                    <Star
                      className={`w-3.5 h-3.5 ${
                        thread.isStarred
                          ? 'text-amber-500 fill-amber-500 drop-shadow-xs'
                          : 'text-slate-300 dark:text-slate-600'
                      }`}
                    />
                  </button>
                </div>

                {/* Main Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between text-xs mb-0.5">
                    <span
                      className={`truncate max-w-[180px] ${
                        isUnread
                          ? 'font-bold text-slate-900 dark:text-white'
                          : 'font-semibold text-slate-700 dark:text-slate-200'
                      }`}
                    >
                      {thread.participants.join(', ') || thread.lastSender}
                      {thread.messageCount > 1 && (
                        <span className="ml-1 text-[10px] font-bold text-[#0078d4] dark:text-sky-300 bg-blue-100 dark:bg-blue-900/60 px-1.5 py-0.2 rounded-full">
                          {thread.messageCount}
                        </span>
                      )}
                    </span>
                    <span className="text-[10px] text-slate-400 dark:text-slate-400 flex-shrink-0 font-medium">
                      {formatTime(thread.lastMessageAt)}
                    </span>
                  </div>

                  <div
                    className={`text-xs truncate leading-snug ${
                      isUnread
                        ? 'font-bold text-slate-900 dark:text-white'
                        : 'font-medium text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {thread.subject || '(No Subject)'}
                  </div>

                  <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                    {thread.snippet || 'No preview available'}
                  </div>

                  {/* Badges strip (Attachments & Tags) */}
                  {(thread.hasAttachments || thread.tags.length > 0) && (
                    <div className="flex items-center space-x-1.5 mt-2">
                      {thread.hasAttachments && (
                        <span className="text-slate-400 dark:text-slate-400 flex items-center text-[10px] bg-slate-200/50 dark:bg-slate-800 px-1.5 py-0.5 rounded font-medium">
                          <Paperclip className="w-3 h-3 mr-0.5" />
                          <span>File</span>
                        </span>
                      )}
                      {thread.tags.map((tag) => (
                        <span
                          key={tag.id}
                          className="text-[9px] px-2 py-0.5 rounded-full font-bold border shadow-xs"
                          style={{
                            backgroundColor: `${tag.color}18`,
                            borderColor: `${tag.color}50`,
                            color: tag.color,
                          }}
                        >
                          {tag.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Unread Blue Dot Indicator */}
                {isUnread && (
                  <span className="relative flex h-2 w-2 mt-1.5 flex-shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#0078d4] opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-[#0078d4] dark:bg-sky-400"></span>
                  </span>
                )}
              </div>
            );
          })
        )}
      </div>
    </section>
  );
};
