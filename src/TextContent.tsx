import { useEffect, useRef, useState } from 'react';
import type { CanvasText, ItemPatch } from './model';
import { textHeight } from './text';

export default function TextContent({ item, fontSize, editing, onFinish, onChange }: {
  item: CanvasText; fontSize: number; editing: boolean; onFinish: () => void; onChange: (patch: ItemPatch) => void;
}) {
  const [draft, setDraft] = useState(item.text);
  const input = useRef<HTMLTextAreaElement>(null);
  const cancelled = useRef(false);
  useEffect(() => {
    if (editing) { setDraft(item.text); cancelled.current = false; input.current?.focus(); input.current?.select(); }
  }, [editing, item.text]);
  const style = { fontSize, color: item.color };
  if (!editing) return <div className="canvas-text-content" style={style}>{item.text}</div>;
  return <textarea ref={input} className="canvas-text-editor" style={style} aria-label="Editar texto en canvas" value={draft}
    onChange={event => setDraft(event.target.value)}
    onPointerDown={event => event.stopPropagation()}
    onBlur={() => {
      if (!cancelled.current && draft !== item.text) onChange({ text: draft, height: textHeight(draft, item.fontSize, item.width) });
      onFinish();
    }}
    onKeyDown={event => {
      event.stopPropagation();
      if (event.key === 'Escape') { cancelled.current = true; event.currentTarget.blur(); }
      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); event.currentTarget.blur(); }
    }}
  />;
}
