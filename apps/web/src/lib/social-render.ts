import { socialPlatforms, type ExportManifest } from '@wishscene/contracts';

type ExportAsset = ExportManifest['assets'][number];
type Box = { left: number; top: number; right: number; bottom: number };

export const disclosureLabel = 'AI-created · Fictional scene';
const rtl = /[֐-ࣿיִ-﷿ﹰ-ﻼ]/;

// SVG fixtures only declare a viewBox, and browsers may draw such images at a default 300×150.
// Give the root element the recorded pixel size so it rasterizes sharply at the right ratio.
async function loadSource(asset: ExportAsset) {
  let objectUrl: string | null = null;
  try {
    let src = asset.image;
    if (asset.media === 'illustration') {
      const response = await fetch(asset.image);
      if (!response.ok) throw new Error('Could not load a demo image for export.');
      const svg = (await response.text()).replace(
        '<svg ',
        `<svg width="${asset.width}" height="${asset.height}" `,
      );
      src = objectUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    }
    const image = new Image();
    image.src = src;
    await image.decode().catch(() => {
      throw new Error('Could not load a demo image for export.');
    });
    return image;
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}

function wrap(context: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const fits = (value: string) => context.measureText(value).width <= maxWidth;
  // Break words that are wider than the box on their own, such as long hashtags.
  const pieces = (word: string) => {
    if (fits(word)) return [word];
    const parts = [''];
    for (const char of word)
      if (parts[parts.length - 1] && !fits(parts[parts.length - 1] + char)) parts.push(char);
      else parts[parts.length - 1] += char;
    return parts;
  };
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean).flatMap(pieces)) {
      const next = line ? `${line} ${word}` : word;
      if (!line || fits(next)) line = next;
      else {
        lines.push(line);
        line = word;
      }
    }
    if (line) lines.push(line);
  }
  return lines.slice(0, 5);
}

function panel(context: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  context.fillStyle = 'rgba(33, 21, 41, 0.84)';
  context.beginPath();
  context.roundRect(x, y, w, h, Math.round(h > 80 ? 16 : 8));
  context.fill();
}

/** Centered text on a dark panel, anchored to the top or bottom edge of the box. */
function textBlock(
  context: CanvasRenderingContext2D,
  text: string,
  box: Box,
  size: number,
  weight: number,
  family: string,
  anchor: 'top' | 'bottom',
) {
  context.font = `${weight} ${size}px ${family}`;
  context.direction = rtl.test(text) ? 'rtl' : 'ltr';
  const pad = Math.round(size * 0.55);
  const lines = wrap(context, text.trim(), box.right - box.left - pad * 2);
  if (!lines.length) return box;
  const lineHeight = Math.round(size * 1.3);
  const height = lines.length * lineHeight + pad * 2;
  const top = anchor === 'top' ? box.top : box.bottom - height;
  panel(context, box.left, top, box.right - box.left, height);
  context.fillStyle = '#ffffff';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  lines.forEach((line, index) =>
    context.fillText(line, (box.left + box.right) / 2, top + pad + lineHeight * (index + 0.5)),
  );
  return anchor === 'top' ? { ...box, top: top + height } : { ...box, bottom: top };
}

// hunch-why: Crop geometry comes from the server manifest (the same exportFrame the preview uses), so the file matches the recorded pixel size. Text stays inside the format's safe area, and every image carries a visible AI label because social platforms strip file metadata.
export async function renderPostImage(
  asset: ExportAsset,
  coverTitle: string,
  label = disclosureLabel,
): Promise<Blob> {
  const image = await loadSource(asset);
  // Draw at the recorded source size first so crop coordinates mean the same thing for photos
  // and illustrations, even if a fixture file is resampled later.
  const source = document.createElement('canvas');
  source.width = asset.width;
  source.height = asset.height;
  source.getContext('2d')?.drawImage(image, 0, 0, asset.width, asset.height);
  const { width, height, crop } = asset.output;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('This browser cannot render export images.');
  context.imageSmoothingQuality = 'high';
  context.drawImage(source, crop.x, crop.y, crop.width, crop.height, 0, 0, width, height);

  await document.fonts?.ready;
  const family = getComputedStyle(document.body).fontFamily || 'sans-serif';
  const preset = socialPlatforms[asset.social.platform];
  const unit = Math.min(width, height) / 100;
  let box: Box = {
    left: (width * preset.safeArea.left) / 100,
    top: (height * preset.safeArea.top) / 100,
    right: width - (width * preset.safeArea.right) / 100,
    bottom: height - (height * preset.safeArea.bottom) / 100,
  };
  if (asset.cover && coverTitle.trim())
    box = textBlock(context, coverTitle, box, Math.round(unit * 6.4), 700, family, 'top');

  const labelSize = Math.max(12, Math.round(unit * 2.6));
  context.font = `600 ${labelSize}px ${family}`;
  context.direction = rtl.test(label) ? 'rtl' : 'ltr';
  const labelPad = Math.round(labelSize * 0.5);
  const labelWidth = context.measureText(label).width + labelPad * 2;
  const labelHeight = labelSize + labelPad * 2;
  panel(context, box.left, box.bottom - labelHeight, labelWidth, labelHeight);
  context.fillStyle = '#ffffff';
  context.textAlign = 'left';
  context.textBaseline = 'middle';
  context.fillText(label, box.left + labelPad, box.bottom - labelHeight / 2);
  box = { ...box, bottom: box.bottom - labelHeight - Math.round(unit * 2) };

  if (preset.vertical && asset.social.overlayText.trim())
    textBlock(context, asset.social.overlayText, box, Math.round(unit * 5), 600, family, 'bottom');

  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not encode an export image.'))),
      asset.output.type,
      0.9,
    ),
  );
}
