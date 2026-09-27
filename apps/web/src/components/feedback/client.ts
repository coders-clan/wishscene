export async function feedbackRequest<T>(path = '', init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/feedback${path}`, {
    cache: 'no-store',
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || 'Could not reach the feedback board.');
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
