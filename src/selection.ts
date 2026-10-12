import type { CanvasBase, CanvasItem, Geometry, ResizeHandle } from './model';
import { clamp, resizeImage, transformItem } from './model.ts';
import { moveWithReferences, resizeWithReferences } from './references.ts';

export function selectionBounds(items: Geometry[]): Geometry | null {
  if (!items.length) return null;
  const x = Math.min(...items.map(item => item.x));
  const y = Math.min(...items.map(item => item.y));
  return { x, y, width: Math.max(...items.map(item => item.x + item.width)) - x, height: Math.max(...items.map(item => item.y + item.height)) - y };
}
export function selectionRect(start: { x: number; y: number }, end: { x: number; y: number }): Geometry {
  return { x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), width: Math.abs(end.x - start.x), height: Math.abs(end.y - start.y) };
}
export function itemsInRect(items: CanvasBase[], rect: Geometry): string[] {
  return items.filter(item => item.visible && !item.locked && item.x <= rect.x + rect.width && item.x + item.width >= rect.x && item.y <= rect.y + rect.height && item.y + item.height >= rect.y).map(item => item.id);
}
export function toggleSelection(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids.filter(existing => existing !== id) : [...ids, id];
}
export function translateSelection<T extends CanvasBase>(items: T[], ids: string[], dx: number, dy: number): T[] {
  if (!dx && !dy) return items;
  const selected = new Set(ids);
  let changed = false;
  const result = items.map(item => {
    if (!selected.has(item.id) || !item.visible || item.locked) return item;
    changed = true;
    return { ...item, x: item.x + dx, y: item.y + dy };
  });
  return changed ? result : items;
}
export function moveSelectionWithReferences(items: CanvasItem[], ids: string[], dx: number, dy: number, scale: number, bypass = false) {
  const selected = new Set(ids);
  const bounds = selectionBounds(items.filter(item => selected.has(item.id) && item.visible && !item.locked));
  if (!bounds) return { dx: 0, dy: 0, preview: null };
  const raw = { ...bounds, x: bounds.x + dx, y: bounds.y + dy };
  const preview = moveWithReferences(raw, items.filter(item => !selected.has(item.id)), '', scale, bypass);
  return { dx: preview.geometry.x - bounds.x, dy: preview.geometry.y - bounds.y, preview };
}

export function constrainSelectionResize(items: CanvasItem[], ids: string[], original: Geometry, target: Geometry, handle: ResizeHandle, keepRatio: boolean): Geometry {
  const selected = items.filter(item => ids.includes(item.id) && item.visible && !item.locked);
  if (!selected.length) return original;
  const minX = Math.max(...selected.map(item => 8 / item.width));
  const minY = Math.max(...selected.map(item => 8 / item.height));
  const maxX = Math.min(...selected.map(item => 20000 / item.width));
  const maxY = Math.min(...selected.map(item => 20000 / item.height));
  let scaleX = clamp(target.width / original.width, minX, maxX);
  let scaleY = clamp(target.height / original.height, minY, maxY);
  if (keepRatio) scaleX = scaleY = clamp(target.width / original.width, Math.max(minX, minY), Math.min(maxX, maxY));
  const width = original.width * scaleX; const height = original.height * scaleY;
  return { width, height, x: handle.includes('w') ? original.x + original.width - width : original.x, y: handle.includes('n') ? original.y + original.height - height : original.y };
}

export function resizeSelection(items: CanvasItem[], ids: string[], original: Geometry, target: Geometry): CanvasItem[] {
  if (target.x === original.x && target.y === original.y && target.width === original.width && target.height === original.height) return items;
  const scaleX = target.width / original.width; const scaleY = target.height / original.height;
  return items.map(item => {
    if (!ids.includes(item.id) || !item.visible || item.locked) return item;
    const geometry = { x: target.x + (item.x - original.x) * scaleX, y: target.y + (item.y - original.y) * scaleY, width: item.width * scaleX, height: item.height * scaleY };
    return { ...item, ...transformItem(item, geometry) };
  });
}

export function resizeSelectionWithReferences(items: CanvasItem[], ids: string[], handle: ResizeHandle, dx: number, dy: number, scale: number, keepRatio: boolean, bypass = false) {
  const original = selectionBounds(items.filter(item => ids.includes(item.id) && item.visible && !item.locked));
  if (!original) return { items, bounds: null, preview: null };
  const raw = constrainSelectionResize(items, ids, original, resizeImage(original, handle, dx, dy, keepRatio), handle, keepRatio);
  const snapped = resizeWithReferences(original, raw, handle, keepRatio, items.filter(item => !ids.includes(item.id)), '', scale, bypass);
  const bounds = constrainSelectionResize(items, ids, original, snapped.geometry, handle, keepRatio);
  const limited = Math.abs(bounds.width - snapped.geometry.width) > 1e-6 || Math.abs(bounds.height - snapped.geometry.height) > 1e-6;
  return { items: resizeSelection(items, ids, original, bounds), bounds, preview: { ...snapped, geometry: bounds, guides: limited ? [] : snapped.guides } };
}
