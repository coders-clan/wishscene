import { ClientApiError } from '@/i18n/api-error';
export async function feedbackRequest<T>(path = '', init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/feedback${path}`, {
    cache: 'no-store',
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  const data = await response.json();
  if (response.status === 401 && typeof location !== 'undefined') {
    const next = `${location.pathname}${location.search}${location.hash}`;
    location.assign(`/login?next=${encodeURIComponent(next)}`);
  }
  if (!response.ok) throw new ClientApiError(data.error?.code ?? 'GENERIC');
  return data as T;
}
export function readName() {
  try {
    return localStorage.getItem('wishscene-feedback-name') || '';
  } catch {
    return '';
  }
}
export function saveName(name: string) {
  try {
    localStorage.setItem('wishscene-feedback-name', name);
  } catch {
    /* Still allow submission without browser storage. */
  }
}
export function downloadFile(content: string, filename: string, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function readable(value: string) {
  return value.replaceAll('-', ' ');
}
export async function fetchAuthSession(): Promise<{
  authRequired: boolean;
  user: { login: string; name: string | null; avatarUrl: string } | null;
}> {
  const response = await fetch('/api/auth/session', { cache: 'no-store' });
  return response.json();
}
export async function signOut() {
  await fetch('/api/auth/logout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  location.href = '/login';
}
