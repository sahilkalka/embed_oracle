import React from 'react';
import { Search, Mail, Sun, Moon, Keyboard, Menu, Sparkles, RefreshCw } from 'lucide-react';
import { User } from '../types';

interface HeaderProps {
  user: User | null;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  darkMode: boolean;
  onToggleDarkMode: () => void;
  onOpenShortcuts: () => void;
  onToggleMobileSidebar: () => void;
  onSimulateIncoming: () => void;
  onRefresh: () => void;
  isRefreshing?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  user,
  searchQuery,
  onSearchChange,
  darkMode,
  onToggleDarkMode,
  onOpenShortcuts,
  onToggleMobileSidebar,
  onSimulateIncoming,
  onRefresh,
  isRefreshing,
}) => {
  return (
    <header className="h-12 bg-[#0078d4] dark:bg-[#0c1322] border-b border-[#005a9e] dark:border-dark-border text-white flex items-center justify-between px-3 md:px-4 shadow-sm select-none z-30 flex-shrink-0 transition-colors duration-200">
      {/* Brand & Mobile Hamburger */}
      <div className="flex items-center space-x-2 md:space-x-3 flex-shrink-0">
        <button
          onClick={onToggleMobileSidebar}
          className="lg:hidden p-1.5 hover:bg-white/15 dark:hover:bg-white/10 rounded-md text-white transition-transform active:scale-90"
          title="Toggle Folders Drawer"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="bg-white/15 dark:bg-white/10 p-1.5 rounded-lg flex items-center justify-center shadow-xs">
          <Mail className="w-4 h-4 md:w-5 md:h-5 text-white" />
        </div>
        <span className="font-bold text-sm md:text-base tracking-wide leading-none text-white">
          Embedded India
        </span>
      </div>

      {/* Global Search Bar (Responsive) */}
      <div className="flex-1 max-w-md lg:max-w-xl mx-2 md:mx-4">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            placeholder="Search email, senders, or subjects... ('/' to focus)"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full bg-white/15 hover:bg-white/20 focus:bg-white text-white focus:text-slate-900 placeholder-white/70 focus:placeholder-slate-400 rounded-lg py-1.5 pl-9 pr-8 text-xs transition-all duration-150 outline-none border border-transparent focus:border-white/30 shadow-inner"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/70 hover:text-white text-xs font-bold"
            >
              ×
            </button>
          )}
        </div>
      </div>

      {/* Right Controls & Live Badge */}
      <div className="flex items-center space-x-1 md:space-x-2 flex-shrink-0">
        {/* Live Pulse Radar Indicator */}
        <div className="hidden sm:flex items-center space-x-2 text-[11px] bg-emerald-500/15 dark:bg-emerald-500/20 border border-emerald-400/30 px-2.5 py-1 rounded-full text-emerald-100 font-medium">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400"></span>
          </span>
          <span className="tracking-tight">Live SES</span>
        </div>

        {/* Bouncy Simulate Incoming Email Button */}
        <button
          onClick={onSimulateIncoming}
          title="Simulate Inbound Email via SES Webhook"
          className="hidden md:flex items-center space-x-1.5 bg-amber-400/20 hover:bg-amber-400/30 active:scale-95 text-amber-200 border border-amber-300/30 text-[11px] font-semibold px-2.5 py-1 rounded-full transition-all duration-150 cursor-pointer shadow-xs"
        >
          <Sparkles className="w-3.5 h-3.5 text-amber-300 animate-pulse" />
          <span>Simulate Mail</span>
        </button>

        {/* Sync / Refresh Button */}
        <button
          onClick={onRefresh}
          title="Sync & Refresh Inbox"
          className="p-1.5 hover:bg-white/15 dark:hover:bg-white/10 rounded-md text-white/90 hover:text-white transition-transform active:scale-90"
        >
          <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
        </button>

        {/* Keyboard Shortcuts */}
        <button
          onClick={onOpenShortcuts}
          title="Keyboard Shortcuts (?)"
          className="hidden sm:block p-1.5 hover:bg-white/15 dark:hover:bg-white/10 rounded-md text-white/90 hover:text-white transition-transform active:scale-90"
        >
          <Keyboard className="w-4 h-4" />
        </button>

        {/* Dark Mode Toggle */}
        <button
          onClick={onToggleDarkMode}
          title={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          className="p-1.5 hover:bg-white/15 dark:hover:bg-white/10 rounded-md text-white/90 hover:text-white transition-transform active:scale-90"
        >
          {darkMode ? <Sun className="w-4 h-4 text-amber-300" /> : <Moon className="w-4 h-4" />}
        </button>

        {/* User Avatar */}
        <div className="flex items-center space-x-2 pl-1.5 border-l border-white/20">
          <div className="w-7 h-7 rounded-full bg-white/20 dark:bg-white/10 flex items-center justify-center text-xs font-semibold uppercase tracking-wider text-white border border-white/30 shadow-xs">
            {user?.name ? user.name[0] : 'EI'}
          </div>
          <div className="hidden xl:flex flex-col text-left">
            <span className="text-xs font-medium leading-none">{user?.name || 'Administrator'}</span>
            <span className="text-[10px] text-white/75 truncate max-w-[120px]">
              {user?.email || 'info@embeddedindia.in'}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
};
