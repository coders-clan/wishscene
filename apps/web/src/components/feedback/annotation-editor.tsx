'use client';

import { useCopy } from '@/i18n/copy';
import { useEffect, useRef, useState } from 'react';
import type { Annotation } from '@wishscene/contracts';
import { ArrowUpRight, Square, Pencil, Type, Undo2, Download, Copy, EyeOff } from 'lucide-react';
export async function paintImage(
  source: string,
  marks: Annotation[],
  canvas = document.createElement('canvas'),
) {
  const image = new Image();
  image.src = source;
  await image.decode();
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(image, 0, 0);
  for (const mark of marks) {
    const points = mark.points.map((p) => ({ x: p.x * canvas.width, y: p.y * canvas.height }));
    const a = points[0],
      b = points[points.length - 1];
    ctx.strokeStyle = mark.color;
    ctx.fillStyle = mark.color;
    ctx.lineWidth = Math.max(3, canvas.width / 250);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (mark.tool === 'rectangle') ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
    else if (mark.tool === 'redact') {
      ctx.fillStyle = '#11111a';
      ctx.fillRect(
        Math.min(a.x, b.x),
        Math.min(a.y, b.y),
        Math.max(5, Math.abs(b.x - a.x)),
        Math.max(5, Math.abs(b.y - a.y)),
      );
    } else if (mark.tool === 'text') {
      ctx.font = `bold ${Math.max(18, canvas.width / 28)}px sans-serif`;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 5;
      ctx.strokeText(mark.text || '', a.x, a.y);
      ctx.fillText(mark.text || '', a.x, a.y);
    } else {
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      points.slice(1).forEach((p) => ctx.lineTo(p.x, p.y));
      ctx.stroke();
      if (mark.tool === 'arrow') {
        const angle = Math.atan2(b.y - a.y, b.x - a.x),
          length = Math.max(14, canvas.width / 35);
        ctx.beginPath();
        ctx.moveTo(b.x - length * Math.cos(angle - 0.5), b.y - length * Math.sin(angle - 0.5));
        ctx.lineTo(b.x, b.y);
        ctx.lineTo(b.x - length * Math.cos(angle + 0.5), b.y - length * Math.sin(angle + 0.5));
        ctx.stroke();
      }
    }
  }
  return canvas;
}
export async function annotatedJpeg(source: string, marks: Annotation[]) {
  return (await paintImage(source, marks)).toDataURL('image/jpeg', 0.86);
}
const tools = [
  { id: 'rectangle', label: 'Rectangle', icon: Square },
  { id: 'arrow', label: 'Arrow', icon: ArrowUpRight },
  { id: 'pen', label: 'Draw', icon: Pencil },
  { id: 'text', label: 'Text', icon: Type },
  { id: 'redact', label: 'Hide area', icon: EyeOff },
] as const;
export function AnnotationEditor({
  source,
  marks,
  onChange,
}: {
  source: string;
  marks: Annotation[];
  onChange: (marks: Annotation[]) => void;
}) {
  const msg = useCopy('feedback');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef<Annotation | null>(null);
  const [tool, setTool] = useState<Annotation['tool']>('rectangle');
  const [color, setColor] = useState<Annotation['color']>('#ff5263');
  const [label, setLabel] = useState(msg('m7a925b7614'));
  const [note, setNote] = useState('');
  useEffect(() => {
    let active = true;
    void paintImage(source, marks)
      .then((canvas) => {
        if (active && canvasRef.current) {
          canvasRef.current.width = canvas.width;
          canvasRef.current.height = canvas.height;
          canvasRef.current.getContext('2d')!.drawImage(canvas, 0, 0);
        }
      })
      .catch(() => setNote(msg('m4bcf7bfc7f')));
    return () => {
      active = false;
    };
  }, [source, marks]);
  function point(event: React.PointerEvent<HTMLCanvasElement>) {
    const r = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (event.clientX - r.left) / r.width)),
      y: Math.max(0, Math.min(1, (event.clientY - r.top) / r.height)),
    };
  }
  async function download(copy: boolean) {
    try {
      const canvas = await paintImage(source, marks);
      if (copy) {
        const blob = await new Promise<Blob>((resolve, reject) =>
          canvas.toBlob(
            (b) => (b ? resolve(b) : reject(new Error(msg('mb1dc42859b')))),
            'image/png',
          ),
        );
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        setNote(msg('m03cec76f15'));
      } else {
        const anchor = document.createElement('a');
        anchor.href = canvas.toDataURL('image/jpeg', 0.9);
        anchor.download = 'wishscene-feedback.jpg';
        anchor.click();
        setNote(msg('m69cf8a5dd7'));
      }
    } catch {
      setNote(msg('m09cca6ed16'));
    }
  }
  return (
    <div className="feedback-editor">
      <div className="feedback-tools" aria-label={msg('m8ea1801dd0')}>
        {tools.map((t) => (
          <button
            type="button"
            key={t.id}
            className={`button ${tool === t.id ? 'selected' : ''}`}
            aria-pressed={tool === t.id}
            onClick={() => setTool(t.id)}
          >
            <t.icon size={17} />
            {msg(`enum_${t.id}`)}
          </button>
        ))}
        <button
          type="button"
          className="button"
          onClick={() => onChange(marks.slice(0, -1))}
          disabled={!marks.length}
        >
          <Undo2 size={17} />
          {msg('m39fc721248')}
        </button>
      </div>
      <div className="feedback-tools">
        {(['#ff5263', '#8057e7', '#f7bd3e', '#19a88b'] as const).map((c, i) => (
          <button
            key={c}
            type="button"
            className={`feedback-color ${color === c ? 'active' : ''}`}
            style={{ background: c }}
            aria-label={
              [msg('m3f32672178'), msg('m33f13fdb89'), msg('m55aafc9905'), msg('m7a56564137')][i]
            }
            aria-pressed={color === c}
            onClick={() => setColor(c)}
          />
        ))}
        {tool === 'text' && (
          <input
            aria-label={msg('mff8fb98f40')}
            value={label}
            maxLength={120}
            onChange={(e) => setLabel(e.target.value)}
          />
        )}
        <span>{tool === 'redact' ? msg('mc0b2eb8345') : msg('m71317b86c3')}</span>
      </div>
      <canvas
        ref={canvasRef}
        className="feedback-canvas"
        aria-label={msg('me65df79cf5')}
        onPointerDown={(e) => {
          if (marks.length >= 50) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          const p = point(e);
          drawing.current = {
            id: crypto.randomUUID(),
            tool,
            color,
            points: [p, p],
            ...(tool === 'text' ? { text: label } : {}),
          };
          if (tool === 'text') {
            onChange([...marks, drawing.current]);
            drawing.current = null;
          }
        }}
        onPointerMove={(e) => {
          if (!drawing.current) return;
          const mark = drawing.current;
          const p = point(e);
          mark.points =
            mark.tool === 'pen' ? [...mark.points.slice(0, 499), p] : [mark.points[0], p];
          void paintImage(source, [...marks, mark], e.currentTarget);
        }}
        onPointerUp={() => {
          if (drawing.current) {
            onChange([...marks, drawing.current]);
            drawing.current = null;
          }
        }}
        onPointerCancel={() => {
          drawing.current = null;
          void paintImage(source, marks, canvasRef.current!);
        }}
      />
      <div className="feedback-tools">
        <button type="button" className="button" onClick={() => void download(true)}>
          <Copy size={17} />
          {msg('m883f2df073')}
        </button>
        <button type="button" className="button" onClick={() => void download(false)}>
          <Download size={17} />
          {msg('md6f34a97a5')}
        </button>
        <small>{msg('markCount', { count: marks.length })}</small>
      </div>
      {note && <p role="status">{note}</p>}
    </div>
  );
}
