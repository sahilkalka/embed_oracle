import React from 'react';
import { X, Keyboard } from 'lucide-react';

interface ShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ShortcutsModal: React.FC<ShortcutsModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const shortcuts = [
    { key: 'C', description: 'Compose new message' },
    { key: 'J / ↓', description: 'Move to next conversation' },
    { key: 'K / ↑', description: 'Move to previous conversation' },
    { key: 'Enter', description: 'Open selected conversation' },
    { key: 'R', description: 'Reply to latest message' },
    { key: 'A', description: 'Reply all' },
    { key: 'F', description: 'Forward message' },
    { key: 'E', description: 'Archive conversation' },
    { key: '# / Delete', description: 'Delete conversation' },
    { key: '/', description: 'Focus search bar' },
    { key: '?', description: 'Open this shortcuts help' },
    { key: 'Esc', description: 'Close modals / active selection' },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white dark:bg-[#201f1e] rounded-xl shadow-2xl border border-[#edebe9] dark:border-[#3b3a39] w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="h-12 px-5 bg-slate-50 dark:bg-[#252423] border-b border-[#edebe9] dark:border-[#3b3a39] flex items-center justify-between">
          <div className="flex items-center space-x-2 font-semibold text-sm text-slate-800 dark:text-slate-200">
            <Keyboard className="w-4 h-4 text-[#0078d4]" />
            <span>Keyboard Shortcuts</span>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded">
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>

        <div className="p-5 max-h-[420px] overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 text-xs">
          {shortcuts.map((sc) => (
            <div key={sc.key} className="py-2.5 flex items-center justify-between">
              <span className="text-slate-600 dark:text-slate-300">{sc.description}</span>
              <kbd className="px-2 py-1 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded font-mono font-semibold text-slate-700 dark:text-slate-200 shadow-xs">
                {sc.key}
              </kbd>
            </div>
          ))}
        </div>

        <div className="p-3 bg-slate-50 dark:bg-[#252423] border-t border-[#edebe9] dark:border-[#3b3a39] text-center text-[11px] text-slate-400">
          Superhuman &amp; Gmail compatible shortcuts
        </div>
      </div>
    </div>
  );
};
