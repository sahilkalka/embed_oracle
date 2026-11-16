import React from 'react';
import {
  Inbox,
  Send,
  FileEdit,
  Archive,
  ShieldAlert,
  Trash2,
  Folder as FolderIcon,
  Tag as TagIcon,
  Plus,
  HardDrive,
  Star,
  X
} from 'lucide-react';
import { Folder, Tag } from '../types';

interface SidebarProps {
  folders: Folder[];
  tags: Tag[];
  activeFolder: string;
  activeTag: string | null;
  onSelectFolder: (slug: string) => void;
  onSelectTag: (name: string | null) => void;
  onCompose: () => void;
  isMobileOpen: boolean;
  onCloseMobile: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  folders,
  tags,
  activeFolder,
  activeTag,
  onSelectFolder,
  onSelectTag,
  onCompose,
  isMobileOpen,
  onCloseMobile,
}) => {
  const getFolderIcon = (slug: string) => {
    switch (slug) {
      case 'inbox':
        return <Inbox className="w-4 h-4" />;
      case 'sent':
        return <Send className="w-4 h-4" />;
      case 'drafts':
        return <FileEdit className="w-4 h-4" />;
      case 'archive':
        return <Archive className="w-4 h-4" />;
      case 'junk':
        return <ShieldAlert className="w-4 h-4" />;
      case 'trash':
        return <Trash2 className="w-4 h-4" />;
      default:
        return <FolderIcon className="w-4 h-4" />;
    }
  };

  const sidebarContent = (
    <div className="flex flex-col h-full bg-[#f8fafc] dark:bg-slate-950 text-slate-800 dark:text-slate-100 border-r border-slate-200 dark:border-slate-800 select-none transition-colors duration-150">
      {/* Top Mobile Bar */}
      <div className="lg:hidden h-12 px-4 flex items-center justify-between border-b border-slate-200 dark:border-slate-800">
        <span className="font-bold text-xs tracking-wider uppercase text-slate-500 dark:text-slate-400">
          Mailboxes
        </span>
        <button
          onClick={onCloseMobile}
          className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg text-slate-500 active:scale-95"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Primary Compose Action Button */}
      <div className="p-3">
        <button
          onClick={() => {
            onCompose();
            onCloseMobile();
          }}
          className="w-full bg-[#0078d4] hover:bg-[#106ebe] active:scale-95 text-white py-2.5 px-3.5 rounded-lg font-bold text-xs flex items-center justify-center space-x-2 shadow-sm shadow-blue-500/20 hover:shadow-md transition-all duration-150 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>New mail</span>
          <span className="text-[10px] bg-white/20 px-1.5 py-0.5 rounded font-mono ml-auto">C</span>
        </button>
      </div>

      {/* Navigation Folder List */}
      <div className="flex-1 overflow-y-auto px-2 space-y-1">
        <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500 px-3 py-1 tracking-widest uppercase">
          Folders
        </div>

        {/* Starred folder */}
        <button
          onClick={() => {
            onSelectFolder('starred');
            onSelectTag(null);
            onCloseMobile();
          }}
          className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold transition-all duration-150 cursor-pointer ${
            activeFolder === 'starred' && !activeTag
              ? 'bg-blue-50 dark:bg-slate-800 font-bold text-[#0078d4] dark:text-sky-300 shadow-xs'
              : 'text-slate-700 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800/60 active:scale-98'
          }`}
        >
          <div className="flex items-center space-x-2.5">
            <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
            <span>Starred</span>
          </div>
        </button>

        {folders.map((folder) => {
          const isActive = activeFolder === folder.slug && !activeTag;
          return (
            <button
              key={folder.id}
              onClick={() => {
                onSelectFolder(folder.slug);
                onSelectTag(null);
                onCloseMobile();
              }}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold transition-all duration-150 cursor-pointer ${
                isActive
                  ? 'bg-blue-50 dark:bg-slate-800 font-bold text-[#0078d4] dark:text-sky-300 shadow-xs'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800/60 active:scale-98'
              }`}
            >
              <div className="flex items-center space-x-2.5 truncate">
                <span className={isActive ? 'text-[#0078d4] dark:text-sky-400' : 'text-slate-500 dark:text-slate-400'}>
                  {getFolderIcon(folder.slug)}
                </span>
                <span className="truncate">{folder.name}</span>
              </div>
              {folder.unreadCount > 0 && (
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold transition-transform ${
                  isActive
                    ? 'bg-[#0078d4] text-white shadow-xs'
                    : 'bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200'
                }`}>
                  {folder.unreadCount}
                </span>
              )}
            </button>
          );
        })}

        {/* Labels / Tags Section */}
        {tags.length > 0 && (
          <div className="pt-4">
            <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500 px-3 py-1 tracking-widest uppercase flex items-center justify-between">
              <span>Categories</span>
              <TagIcon className="w-3 h-3 text-slate-400" />
            </div>
            <div className="space-y-0.5 mt-1">
              {tags.map((tag) => {
                const isActive = activeTag === tag.name;
                return (
                  <button
                    key={tag.id}
                    onClick={() => {
                      onSelectTag(isActive ? null : tag.name);
                      onCloseMobile();
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold transition-all duration-150 cursor-pointer ${
                      isActive
                        ? 'bg-blue-50 dark:bg-slate-800 font-bold text-[#0078d4] dark:text-sky-300 shadow-xs'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800/60 active:scale-98'
                    }`}
                  >
                    <div className="flex items-center space-x-2.5 truncate">
                      <span
                        className="w-2.5 h-2.5 rounded-full flex-shrink-0 shadow-xs ring-1 ring-white/20"
                        style={{ backgroundColor: tag.color }}
                      />
                      <span className="truncate">{tag.name}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Footer System Status */}
      <div className="p-3 border-t border-slate-200 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-between">
        <div className="flex items-center space-x-1.5">
          <HardDrive className="w-3.5 h-3.5 text-slate-400" />
          <span>Oracle VM</span>
        </div>
        <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-500/20 px-1.5 py-0.5 rounded font-bold">
          WAL Active
        </span>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Sticky Sidebar */}
      <aside className="hidden lg:flex w-52 xl:w-56 flex-col h-full flex-shrink-0">
        {sidebarContent}
      </aside>

      {/* Mobile Drawer Overlay */}
      {isMobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden flex">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity duration-200"
            onClick={onCloseMobile}
          />
          <div className="relative w-72 max-w-[85vw] h-full shadow-2xl z-50 animate-spring-pop">
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  );
};
