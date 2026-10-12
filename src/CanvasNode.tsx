import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent } from 'react';
import { resizeImage, transformItem } from './model';
import type { CanvasItem, Geometry, ItemPatch, ResizeHandle } from './model';
import TextContent from './TextContent';
import { moveWithReferences, resizeWithReferences } from './references';
import type { ResizePreview } from './references';

const handles: ResizeHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
const labels: Record<ResizeHandle, string> = { nw: 'superior izquierda', n: 'superior', ne: 'superior derecha', e: 'derecha', se: 'inferior derecha', s: 'inferior', sw: 'inferior izquierda', w: 'izquierda' };

export default function CanvasNode({ item, images, selected, multiple, offset, preview, scale, ratioLocked, interactive, editing, onEdit, onFinishEdit, onSelect, onGroupStart, onChange, onReferences }: {
  item: CanvasItem; selected: boolean; scale: number; ratioLocked: boolean;
  multiple: boolean; offset?: { dx: number; dy: number }; onGroupStart: (event: PointerEvent<HTMLDivElement>) => boolean;
  preview?: Geometry;
  images: CanvasItem[]; onReferences: (preview: ResizePreview | null) => void;
  editing: boolean; onEdit: () => void; onFinishEdit: () => void;
  interactive: boolean; onSelect: () => void; onChange: (patch: ItemPatch) => void;
}) {
  const [geometry, setGeometry] = useState<Geometry>(item);
  const gesture = useRef<{ pointer: number; x: number; y: number; original: Geometry; handle?: ResizeHandle; latest: Geometry } | null>(null);
  useEffect(() => { if (!gesture.current) setGeometry(item); }, [item]);
  const displayed = preview ?? geometry;
  if (!item.visible) return null;

  return <div className={`canvas-image ${item.kind === 'text' ? 'canvas-text' : ''} ${selected ? 'is-selected' : ''} ${item.locked ? 'is-locked' : ''}`}
    role="button" aria-label={`${item.kind === 'text' ? 'Texto' : 'Imagen'} ${item.name}`} aria-pressed={selected} tabIndex={interactive ? 0 : -1}
    style={{ left: displayed.x + (offset?.dx ?? 0), top: displayed.y + (offset?.dy ?? 0), width: displayed.width, height: displayed.height, '--inverse-scale': 1 / scale, outlineWidth: `${1 / scale}px` } as CSSProperties}
    onKeyDown={event => { if (event.key === 'Enter' && interactive) { onSelect(); if (item.kind === 'text' && !item.locked) onEdit(); } }}
    onDoubleClick={() => { if (item.kind === 'text' && interactive && !item.locked) { onSelect(); onEdit(); } }}
    onPointerDown={event => {
      if (!interactive || editing || event.button !== 0) return;
      if (onGroupStart(event)) return;
      onSelect(); event.stopPropagation();
      if (item.locked) return;
      event.preventDefault();
      const handle = event.target instanceof HTMLElement ? event.target.dataset.handle as ResizeHandle | undefined : undefined;
      const original = { x: item.x, y: item.y, width: item.width, height: item.height };
      gesture.current = { pointer: event.pointerId, x: event.clientX, y: event.clientY, original, latest: original, handle };
      event.currentTarget.setPointerCapture(event.pointerId);
    }}
    onPointerMove={event => {
      const current = gesture.current;
      if (!current || current.pointer !== event.pointerId) return;
      const dx = (event.clientX - current.x) / scale; const dy = (event.clientY - current.y) / scale;
      const raw = current.handle ? resizeImage(current.original, current.handle, dx, dy, ratioLocked) : { ...current.original, x: current.original.x + dx, y: current.original.y + dy };
      const preview = current.handle
        ? resizeWithReferences(current.original, raw, current.handle, ratioLocked, images, item.id, scale, event.altKey)
        : moveWithReferences(raw, images, item.id, scale, event.altKey);
      const next = preview.geometry;
      onReferences(preview);
      current.latest = next; setGeometry(next);
      event.stopPropagation();
    }}
    onPointerUp={event => {
      const current = gesture.current;
      if (!current || current.pointer !== event.pointerId) return;
      gesture.current = null;
      onReferences(null);
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      if (Object.keys(current.original).some(key => current.original[key as keyof Geometry] !== current.latest[key as keyof Geometry])) onChange(transformItem(item, current.latest));
      event.stopPropagation();
    }}
    onPointerCancel={() => { gesture.current = null; setGeometry(item); onReferences(null); }}
    onLostPointerCapture={() => { if (gesture.current) { gesture.current = null; setGeometry(item); onReferences(null); } }}
  >
    {item.kind === 'text'
      ? <TextContent item={item} fontSize={item.fontSize * displayed.height / item.height} editing={editing} onFinish={onFinishEdit} onChange={onChange} />
      : <img src={item.src} alt="" draggable={false} />}
    {selected && !multiple && !item.locked && interactive && !editing && <>
      {handles.filter(handle => !ratioLocked || handle.length === 2).map(handle => <button key={handle} type="button" tabIndex={-1} className={`resize-handle handle-${handle}`} data-handle={handle} aria-label={`Redimensionar ${labels[handle]}`} />)}
      <span className="dimension-badge">{Math.round(geometry.width)} × {Math.round(geometry.height)}</span>
    </>}
  </div>;
}
