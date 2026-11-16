import React, { useState, useEffect, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import {
  Send,
  Paperclip,
  Trash2,
  Minimize2,
  Maximize2,
  X,
  Bold,
  Italic,
  Strikethrough,
  Code,
  List,
  ListOrdered,
  Quote,
  Check
} from 'lucide-react';
import { searchContacts } from '../api';
import { Contact } from '../types';

export interface ComposerProps {
  isOpen: boolean;
  onClose: () => void;
  onSend: (payload: {
    to: string[];
    cc?: string[];
    bcc?: string[];
    subject: string;
    html: string;
    files: File[];
    inReplyTo?: string;
    references?: string;
  }) => Promise<void>;
  initialData?: {
    to?: string[];
    cc?: string[];
    subject?: string;
    html?: string;
    inReplyTo?: string;
    references?: string;
  };
}

export const Composer: React.FC<ComposerProps> = ({
  isOpen,
  onClose,
  onSend,
  initialData,
}) => {
  const [isMinimized, setIsMinimized] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);

  // Form states
  const [toAddresses, setToAddresses] = useState<string[]>([]);
  const [toInput, setToInput] = useState('');
  const [showCc, setShowCc] = useState(false);
  const [ccAddresses, setCcAddresses] = useState<string[]>([]);
  const [ccInput, setCcInput] = useState('');
  const [showBcc, setShowBcc] = useState(false);
  const [bccAddresses, setBccAddresses] = useState<string[]>([]);
  const [bccInput, setBccInput] = useState('');
  const [subject, setSubject] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [contactSuggestions, setContactSuggestions] = useState<Contact[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // TipTap WYSIWYG Editor Setup
  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({ openOnClick: false }),
      Placeholder.configure({ placeholder: 'Write your email message here...' }),
    ],
    content: '',
  });

  // Reset or initialize whenever modal opens or initialData changes
  useEffect(() => {
    if (!isOpen) return;

    if (initialData) {
      // Replying or Forwarding
      setToAddresses(initialData.to || []);
      setCcAddresses(initialData.cc || []);
      setShowCc(Boolean(initialData.cc && initialData.cc.length > 0));
      setBccAddresses([]);
      setShowBcc(false);
      setSubject(initialData.subject || '');
      setFiles([]);
      if (editor) {
        editor.commands.setContent(initialData.html || '');
      }
    } else {
      // Clean slate for brand new email
      setToAddresses([]);
      setToInput('');
      setCcAddresses([]);
      setCcInput('');
      setShowCc(false);
      setBccAddresses([]);
      setBccInput('');
      setShowBcc(false);
      setSubject('');
      setFiles([]);
      if (editor) {
        editor.commands.setContent('');
      }
    }
  }, [isOpen, initialData, editor]);

  // Autocomplete contacts
  useEffect(() => {
    const activeInput = toInput.trim();
    if (activeInput.length >= 2) {
      searchContacts(activeInput).then((contacts) => {
        setContactSuggestions(contacts);
      });
    } else {
      setContactSuggestions([]);
    }
  }, [toInput]);

  if (!isOpen) return null;

  const handleAddRecipient = (address: string, type: 'to' | 'cc' | 'bcc') => {
    const clean = address.trim().toLowerCase();
    if (!clean || !clean.includes('@')) return;

    if (type === 'to' && !toAddresses.includes(clean)) setToAddresses([...toAddresses, clean]);
    if (type === 'cc' && !ccAddresses.includes(clean)) setCcAddresses([...ccAddresses, clean]);
    if (type === 'bcc' && !bccAddresses.includes(clean)) setBccAddresses([...bccAddresses, clean]);

    setToInput('');
    setCcInput('');
    setBccInput('');
    setContactSuggestions([]);
  };

  const handleRemoveRecipient = (address: string, type: 'to' | 'cc' | 'bcc') => {
    if (type === 'to') setToAddresses(toAddresses.filter((a) => a !== address));
    if (type === 'cc') setCcAddresses(ccAddresses.filter((a) => a !== address));
    if (type === 'bcc') setBccAddresses(bccAddresses.filter((a) => a !== address));
  };

  const handleClearAndClose = () => {
    setToAddresses([]);
    setToInput('');
    setCcAddresses([]);
    setBccAddresses([]);
    setSubject('');
    setFiles([]);
    editor?.commands.setContent('');
    onClose();
  };

  const handleSend = async () => {
    if (toAddresses.length === 0 && !toInput.trim()) {
      alert('Please specify at least one recipient.');
      return;
    }

    const finalTo = [...toAddresses];
    if (toInput.trim() && toInput.includes('@')) finalTo.push(toInput.trim().toLowerCase());

    setIsSending(true);
    try {
      await onSend({
        to: finalTo,
        cc: ccAddresses,
        bcc: bccAddresses,
        subject: subject.trim() || '(No Subject)',
        html: editor?.getHTML() || '',
        files,
        inReplyTo: initialData?.inReplyTo,
        references: initialData?.references,
      });
      handleClearAndClose();
    } catch (err: any) {
      alert(`Send failed: ${err.message}`);
    } finally {
      setIsSending(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles([...files, ...Array.from(e.target.files)]);
    }
  };

  return (
    <div
      className={`fixed z-50 bg-white dark:bg-slate-900 shadow-2xl rounded-t-xl md:rounded-xl border border-slate-300 dark:border-slate-700 flex flex-col transition-all duration-200 overflow-hidden animate-spring-pop ${
        isMaximized
          ? 'top-4 left-4 right-4 bottom-4 md:top-8 md:left-8 md:right-8 md:bottom-8'
          : isMinimized
          ? 'bottom-0 right-4 md:right-8 w-72 h-10'
          : 'bottom-0 right-0 left-0 h-[85vh] md:h-[540px] md:left-auto md:right-8 md:w-[620px]'
      }`}
    >
      {/* Window Titlebar */}
      <div className="h-11 bg-slate-100 dark:bg-slate-800 px-4 flex items-center justify-between border-b border-slate-200 dark:border-slate-700 select-none">
        <span className="text-xs font-bold text-slate-800 dark:text-white truncate">
          {subject.trim() || 'New Message'}
        </span>
        <div className="flex items-center space-x-1.5 text-slate-500 dark:text-slate-400">
          <button
            onClick={() => setIsMinimized(!isMinimized)}
            className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded active:scale-90"
          >
            <Minimize2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setIsMaximized(!isMaximized)}
            className="hidden md:block p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded active:scale-90"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleClearAndClose}
            className="p-1 hover:bg-rose-100 dark:hover:bg-rose-950/60 hover:text-rose-600 rounded active:scale-90"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {!isMinimized && (
        <div className="flex-1 flex flex-col overflow-hidden bg-white dark:bg-slate-900">
          {/* Header Inputs Container */}
          <div className="px-4 py-2.5 space-y-1.5 border-b border-slate-100 dark:border-slate-800 text-xs">
            {/* "To" Field */}
            <div className="relative flex items-center flex-wrap gap-1.5 min-h-[32px]">
              <span className="text-slate-400 dark:text-slate-400 font-bold w-8">To</span>
              {toAddresses.map((addr) => (
                <span
                  key={addr}
                  className="bg-blue-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 px-2.5 py-0.5 rounded-full flex items-center space-x-1 font-medium border border-blue-200 dark:border-slate-700"
                >
                  <span>{addr}</span>
                  <button
                    onClick={() => handleRemoveRecipient(addr, 'to')}
                    className="hover:text-rose-500 font-bold ml-1"
                  >
                    ×
                  </button>
                </span>
              ))}
              <input
                type="text"
                placeholder={toAddresses.length === 0 ? 'Enter email recipient...' : ''}
                value={toInput}
                onChange={(e) => setToInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ',') {
                    e.preventDefault();
                    handleAddRecipient(toInput, 'to');
                  }
                }}
                className="flex-1 min-w-[140px] outline-none bg-transparent text-slate-800 dark:text-white"
              />
              <div className="ml-auto flex items-center space-x-2 text-[11px] text-slate-400">
                {!showCc && (
                  <button onClick={() => setShowCc(true)} className="hover:text-[#0078d4] dark:hover:text-sky-400 font-semibold">
                    Cc
                  </button>
                )}
                {!showBcc && (
                  <button onClick={() => setShowBcc(true)} className="hover:text-[#0078d4] dark:hover:text-sky-400 font-semibold">
                    Bcc
                  </button>
                )}
              </div>

              {/* Autocomplete Dropdown */}
              {contactSuggestions.length > 0 && (
                <div className="absolute left-8 top-full z-50 w-72 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-xl rounded-lg mt-1 divide-y divide-slate-100 dark:divide-slate-700/60 overflow-hidden animate-spring-pop">
                  {contactSuggestions.map((c) => (
                    <div
                      key={c.id}
                      onClick={() => handleAddRecipient(c.email, 'to')}
                      className="px-3.5 py-2.5 hover:bg-blue-50 dark:hover:bg-slate-700 cursor-pointer flex flex-col transition-colors"
                    >
                      <span className="font-bold text-slate-800 dark:text-white">{c.name || c.email}</span>
                      <span className="text-[11px] text-slate-400">{c.email}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Optional Cc Field */}
            {showCc && (
              <div className="flex items-center flex-wrap gap-1.5 min-h-[32px]">
                <span className="text-slate-400 dark:text-slate-400 font-bold w-8">Cc</span>
                {ccAddresses.map((addr) => (
                  <span
                    key={addr}
                    className="bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 px-2 py-0.5 rounded-full flex items-center space-x-1 border border-slate-200 dark:border-slate-700"
                  >
                    <span>{addr}</span>
                    <button onClick={() => handleRemoveRecipient(addr, 'cc')}>×</button>
                  </span>
                ))}
                <input
                  type="text"
                  value={ccInput}
                  onChange={(e) => setCcInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ',') {
                      e.preventDefault();
                      handleAddRecipient(ccInput, 'cc');
                    }
                  }}
                  className="flex-1 min-w-[140px] outline-none bg-transparent text-slate-800 dark:text-white"
                />
              </div>
            )}

            {/* Optional Bcc Field */}
            {showBcc && (
              <div className="flex items-center flex-wrap gap-1.5 min-h-[32px]">
                <span className="text-slate-400 dark:text-slate-400 font-bold w-8">Bcc</span>
                {bccAddresses.map((addr) => (
                  <span
                    key={addr}
                    className="bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 px-2 py-0.5 rounded-full flex items-center space-x-1 border border-slate-200 dark:border-slate-700"
                  >
                    <span>{addr}</span>
                    <button onClick={() => handleRemoveRecipient(addr, 'bcc')}>×</button>
                  </span>
                ))}
                <input
                  type="text"
                  value={bccInput}
                  onChange={(e) => setBccInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ',') {
                      e.preventDefault();
                      handleAddRecipient(bccInput, 'bcc');
                    }
                  }}
                  className="flex-1 min-w-[140px] outline-none bg-transparent text-slate-800 dark:text-white"
                />
              </div>
            )}

            {/* Subject Input */}
            <div className="flex items-center pt-1 border-t border-slate-100 dark:border-slate-800">
              <input
                type="text"
                placeholder="Subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="w-full font-bold outline-none bg-transparent text-slate-900 dark:text-white text-xs md:text-sm placeholder-slate-400"
              />
            </div>
          </div>

          {/* TipTap Rich Text Toolbar */}
          {editor && (
            <div className="px-3 py-1.5 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 flex items-center space-x-1 text-slate-600 dark:text-slate-300 overflow-x-auto">
              <button
                onClick={() => editor.chain().focus().toggleBold().run()}
                className={`p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 active:scale-90 ${editor.isActive('bold') ? 'bg-slate-200 dark:bg-slate-700 text-[#0078d4] dark:text-sky-400 font-bold' : ''}`}
                title="Bold (Ctrl+B)"
              >
                <Bold className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => editor.chain().focus().toggleItalic().run()}
                className={`p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 active:scale-90 ${editor.isActive('italic') ? 'bg-slate-200 dark:bg-slate-700 text-[#0078d4] dark:text-sky-400' : ''}`}
                title="Italic (Ctrl+I)"
              >
                <Italic className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => editor.chain().focus().toggleStrike().run()}
                className={`p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 active:scale-90 ${editor.isActive('strike') ? 'bg-slate-200 dark:bg-slate-700 text-[#0078d4] dark:text-sky-400' : ''}`}
                title="Strikethrough"
              >
                <Strikethrough className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => editor.chain().focus().toggleCode().run()}
                className={`p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 active:scale-90 ${editor.isActive('code') ? 'bg-slate-200 dark:bg-slate-700 text-[#0078d4] dark:text-sky-400' : ''}`}
                title="Inline Code"
              >
                <Code className="w-3.5 h-3.5" />
              </button>
              <div className="h-4 w-[1px] bg-slate-300 dark:bg-slate-700 mx-1" />
              <button
                onClick={() => editor.chain().focus().toggleBulletList().run()}
                className={`p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 active:scale-90 ${editor.isActive('bulletList') ? 'bg-slate-200 dark:bg-slate-700 text-[#0078d4] dark:text-sky-400' : ''}`}
                title="Bullet List"
              >
                <List className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => editor.chain().focus().toggleOrderedList().run()}
                className={`p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 active:scale-90 ${editor.isActive('orderedList') ? 'bg-slate-200 dark:bg-slate-700 text-[#0078d4] dark:text-sky-400' : ''}`}
                title="Numbered List"
              >
                <ListOrdered className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => editor.chain().focus().toggleBlockquote().run()}
                className={`p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 active:scale-90 ${editor.isActive('blockquote') ? 'bg-slate-200 dark:bg-slate-700 text-[#0078d4] dark:text-sky-400' : ''}`}
                title="Blockquote"
              >
                <Quote className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Editor Body */}
          <div className="flex-1 overflow-y-auto cursor-text text-slate-800 dark:text-slate-100" onClick={() => editor?.commands.focus()}>
            <EditorContent editor={editor} className="h-full" />
          </div>

          {/* Attached Files List */}
          {files.length > 0 && (
            <div className="px-4 py-2 bg-slate-50 dark:bg-slate-800/60 border-t border-slate-200 dark:border-slate-700 flex flex-wrap gap-2 text-xs">
              {files.map((file, idx) => (
                <div
                  key={idx}
                  className="flex items-center space-x-1.5 px-2.5 py-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xs"
                >
                  <Paperclip className="w-3 h-3 text-slate-400" />
                  <span className="truncate max-w-[140px] font-medium text-slate-700 dark:text-slate-200">{file.name}</span>
                  <span className="text-[10px] text-slate-400">({Math.round(file.size / 1024)} KB)</span>
                  <button
                    onClick={() => setFiles(files.filter((_, i) => i !== idx))}
                    className="text-slate-400 hover:text-rose-500 font-bold ml-1 active:scale-90"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Footer Actions */}
          <div className="h-12 px-4 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between bg-slate-50 dark:bg-slate-800/80">
            <div className="flex items-center space-x-2">
              <button
                onClick={handleSend}
                disabled={isSending}
                className="bg-[#0078d4] hover:bg-[#106ebe] active:scale-95 disabled:opacity-50 text-white font-bold text-xs px-4 py-2 rounded-lg flex items-center space-x-2 shadow-sm shadow-blue-500/20 transition-all cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{isSending ? 'Sending via SES...' : 'Send'}</span>
              </button>

              <input
                type="file"
                ref={fileInputRef}
                multiple
                onChange={handleFileChange}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                title="Attach Files"
                className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg text-slate-600 dark:text-slate-300 transition-transform active:scale-90"
              >
                <Paperclip className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center space-x-3 text-slate-400 text-xs">
              <span className="text-[11px] flex items-center space-x-1 font-medium text-emerald-600 dark:text-emerald-400">
                <Check className="w-3.5 h-3.5" />
                <span>Ready</span>
              </span>
              <button
                onClick={handleClearAndClose}
                title="Discard draft"
                className="p-1.5 hover:text-rose-500 rounded active:scale-90"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
