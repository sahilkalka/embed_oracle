import { Folder, Tag, ThreadSummary, ThreadDetail, User, Contact } from './types';

const API_BASE = '/api';

export async function fetchCurrentUser(): Promise<User | null> {
  try {
    const res = await fetch(`${API_BASE}/auth/me`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.user;
  } catch {
    return null;
  }
}

export async function fetchFolders(): Promise<{ folders: Folder[]; tags: Tag[] }> {
  const res = await fetch(`${API_BASE}/folders`);
  if (!res.ok) throw new Error('Failed to load folders');
  return res.json();
}

export interface FetchThreadsParams {
  folder?: string;
  q?: string;
  unread?: boolean;
  attachments?: boolean;
  tag?: string;
  page?: number;
}

export async function fetchThreads(params: FetchThreadsParams = {}): Promise<{
  threads: ThreadSummary[];
  pagination: { page: number; limit: number; totalCount: number; totalPages: number };
}> {
  const query = new URLSearchParams();
  if (params.folder) query.set('folder', params.folder);
  if (params.q) query.set('q', params.q);
  if (params.unread) query.set('unread', 'true');
  if (params.attachments) query.set('attachments', 'true');
  if (params.tag) query.set('tag', params.tag);
  if (params.page) query.set('page', String(params.page));

  const res = await fetch(`${API_BASE}/threads?${query.toString()}`);
  if (!res.ok) throw new Error('Failed to load threads');
  return res.json();
}

export async function fetchThreadDetail(threadId: string, blockRemote: boolean = true): Promise<ThreadDetail> {
  const res = await fetch(`${API_BASE}/messages/thread/${threadId}?blockRemote=${blockRemote}`);
  if (!res.ok) throw new Error('Failed to load message');
  const data = await res.json();
  return data.thread;
}

export async function executeBatchAction(
  threadIds: string[],
  action: 'markRead' | 'star' | 'move' | 'delete',
  value: any
): Promise<void> {
  const res = await fetch(`${API_BASE}/threads/batch`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ threadIds, action, value }),
  });
  if (!res.ok) throw new Error('Batch operation failed');
}

export interface SendMailPayload {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  html: string;
  text?: string;
  inReplyTo?: string;
  references?: string;
  files?: File[];
}

export async function sendEmail(payload: SendMailPayload): Promise<any> {
  const formData = new FormData();
  formData.append('to', JSON.stringify(payload.to));
  if (payload.cc) formData.append('cc', JSON.stringify(payload.cc));
  if (payload.bcc) formData.append('bcc', JSON.stringify(payload.bcc));
  formData.append('subject', payload.subject);
  formData.append('html', payload.html);
  if (payload.text) formData.append('text', payload.text);
  if (payload.inReplyTo) formData.append('inReplyTo', payload.inReplyTo);
  if (payload.references) formData.append('references', payload.references);

  if (payload.files && payload.files.length > 0) {
    for (const file of payload.files) {
      formData.append('attachments', file);
    }
  }

  const res = await fetch(`${API_BASE}/messages/send`, {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to send message');
  }

  return res.json();
}

export async function searchContacts(q: string): Promise<Contact[]> {
  if (!q.trim()) return [];
  const res = await fetch(`${API_BASE}/messages/contacts/search?q=${encodeURIComponent(q)}`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.contacts || [];
}

export function subscribeToRealtimeUpdates(onEvent: (event: string, payload: any) => void): () => void {
  const eventSource = new EventSource(`${API_BASE}/realtime`);

  eventSource.addEventListener('thread:update', (e) => {
    try {
      const data = JSON.parse(e.data);
      onEvent('thread:update', data);
    } catch (err) {
      console.error('SSE parse error:', err);
    }
  });

  return () => {
    eventSource.close();
  };
}
