import type { FeedbackTarget } from '@wishscene/contracts';
const hidden = '[data-feedback-ui], [data-feedback-private], input, textarea, select, .skip-link';
export function safeText(element: HTMLElement) {
  const clone = element.cloneNode(true) as HTMLElement;
  clone.querySelectorAll(`${hidden}, script, style`).forEach((node) => node.remove());
  return (clone.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 600);
}
export function selectorFor(element: HTMLElement) {
  const stable = element.closest<HTMLElement>('[data-feedback-id]');
  if (stable === element) return `[data-feedback-id="${CSS.escape(stable.dataset.feedbackId!)}"]`;
  if (element.id) return `#${CSS.escape(element.id)}`;
  const parts: string[] = [];
  let node: HTMLElement | null = element;
  while (node && node !== document.body && parts.length < 6) {
    if (node.dataset.feedbackId) {
      parts.unshift(`[data-feedback-id="${CSS.escape(node.dataset.feedbackId)}"]`);
      break;
    }
    if (node.id) {
      parts.unshift(`#${CSS.escape(node.id)}`);
      break;
    }
    const index = node.parentElement
      ? Array.from(node.parentElement.children)
          .filter((x) => x.tagName === node!.tagName)
          .indexOf(node) + 1
      : 1;
    parts.unshift(`${node.tagName.toLowerCase()}:nth-of-type(${index})`);
    node = node.parentElement;
  }
  return parts.join(' > ').slice(0, 500);
}
export function targetFor(
  kind: FeedbackTarget['kind'],
  rect: { x: number; y: number; width: number; height: number },
  element?: HTMLElement,
  regionLabel = '',
): FeedbackTarget {
  return {
    kind,
    path: location.pathname,
    selector: element ? selectorFor(element) : '',
    label: element
      ? (
          element.getAttribute('aria-label') ||
          safeText(element) ||
          element.tagName.toLowerCase()
        ).slice(0, 120)
      : kind === 'region'
        ? regionLabel
        : document.title.slice(0, 120),
    excerpt: element ? safeText(element) : '',
    viewport: { width: innerWidth, height: innerHeight, dpr: Math.min(devicePixelRatio, 10) },
    rect: { ...rect, x: Math.max(0, rect.x + scrollX), y: Math.max(0, rect.y + scrollY) },
  };
}
export function pageTarget() {
  return targetFor('page', { x: 0, y: 0, width: innerWidth, height: innerHeight });
}
export async function screenshotSection(target: FeedbackTarget) {
  const { toCanvas } = await import('html-to-image');
  const height = Math.max(document.body.scrollHeight, innerHeight);
  if (height > 14000)
    throw new Error('This page is too long to capture. You can still send a text report.');
  const scale = Math.min(1, 1200 / innerWidth, 7000 / height);
  const source = await toCanvas(document.body, {
    pixelRatio: scale,
    width: innerWidth,
    height,
    skipFonts: true,
    backgroundColor: '#f7f6fb',
    filter: (node) => !(node instanceof Element && node.matches(hidden)),
  });
  const rect = target.rect;
  const x = Math.max(0, Math.min(source.width - 1, rect.x * scale));
  const y = Math.max(0, Math.min(source.height - 1, rect.y * scale));
  const width = Math.min(rect.width * scale, source.width - x);
  const cropHeight = Math.min(rect.height * scale, source.height - y);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(cropHeight));
  canvas
    .getContext('2d')!
    .drawImage(source, x, y, width, cropHeight, 0, 0, canvas.width, canvas.height);
  const data = canvas.toDataURL('image/jpeg', 0.86);
  if (data.length > 1500000) throw new Error('Capture is too large. Choose a smaller section.');
  return data;
}
