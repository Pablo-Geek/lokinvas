export type CanvasBase = {
  id: string; name: string;
  x: number; y: number; width: number; height: number;
  visible: boolean; locked: boolean;
};
export type CanvasImage = CanvasBase & { kind?: 'image'; src: string; naturalWidth: number; naturalHeight: number };
export type CanvasText = CanvasBase & { kind: 'text'; text: string; fontSize: number; color: string };
export type CanvasItem = CanvasImage | CanvasText;
export type ItemPatch = Partial<CanvasBase> & Partial<Pick<CanvasText, 'text' | 'fontSize' | 'color'>>;
export type CanvasDocument = { version: 2; name: string; items: CanvasItem[] };
export type LegacyDocument = { version: 1; name: string; images: CanvasImage[] };
export type View = { x: number; y: number; scale: number };
export type History = { past: CanvasDocument[]; present: CanvasDocument; future: CanvasDocument[] };
export const initialDocument: CanvasDocument = { version: 2, name: 'Mi primer canvas', items: [] };
export function migrateDocument(saved: CanvasDocument | LegacyDocument): CanvasDocument {
  if (saved.version === 2) return saved;
  return { version: 2, name: saved.name, items: saved.images.map(image => ({ ...image, kind: 'image' })) };
}
export function createText(x: number, y: number): CanvasText {
  return { id: crypto.randomUUID(), kind: 'text', name: 'Texto', text: 'Escribe tu texto', x, y, width: 280, height: 40, fontSize: 32, color: '#34372e', visible: true, locked: false };
}
export function transformItem(item: CanvasItem, geometry: Geometry): ItemPatch {
  return item.kind === 'text' ? { ...geometry, fontSize: item.fontSize * geometry.height / item.height } : geometry;
}
export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
export type Geometry = { x: number; y: number; width: number; height: number };
export type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
export function resizeImage(original: Geometry, handle: ResizeHandle, dx: number, dy: number, keepRatio: boolean): Geometry {
  const west = handle.includes('w'); const north = handle.includes('n');
  const horizontal = west || handle.includes('e'); const vertical = north || handle.includes('s');
  let width = horizontal ? clamp(original.width + (west ? -dx : dx), 8, 20000) : original.width;
  let height = vertical ? clamp(original.height + (north ? -dy : dy), 8, 20000) : original.height;
  if (keepRatio) {
    const changeX = (west ? -dx : dx) / original.width;
    const changeY = (north ? -dy : dy) / original.height;
    const delta = horizontal && (!vertical || Math.abs(changeX) > Math.abs(changeY)) ? changeX : changeY;
    const factor = clamp(1 + delta, Math.max(8 / original.width, 8 / original.height), Math.min(20000 / original.width, 20000 / original.height));
    width = original.width * factor; height = original.height * factor;
  }
  return { width, height, x: west ? original.x + original.width - width : original.x, y: north ? original.y + original.height - height : original.y };
}
export function commit(history: History, next: CanvasDocument): History {
  if (next === history.present) return history;
  return { past: [...history.past.slice(-49), history.present], present: next, future: [] };
}
export function undo(history: History): History {
  if (!history.past.length) return history;
  return { past: history.past.slice(0, -1), present: history.past.at(-1)!, future: [history.present, ...history.future] };
}
export function redo(history: History): History {
  if (!history.future.length) return history;
  return { past: [...history.past, history.present], present: history.future[0], future: history.future.slice(1) };
}
export function reorder<T extends CanvasBase>(images: T[], id: string, target: number): T[] {
  const from = images.findIndex(image => image.id === id);
  if (from === -1) return images;
  const result = [...images];
  const [image] = result.splice(from, 1);
  result.splice(clamp(target, 0, images.length - 1), 0, image);
  return result;
}
export function zoomAt(view: View, point: { x: number; y: number }, scale: number): View {
  const next = clamp(scale, .1, 4);
  return { x: point.x - (point.x - view.x) / view.scale * next, y: point.y - (point.y - view.y) / view.scale * next, scale: next };
}
export function fitImages(images: CanvasBase[], width: number, height: number): View {
  const visible = images.filter(image => image.visible);
  if (!visible.length) return { x: width / 2, y: height / 2, scale: 1 };
  const left = Math.min(...visible.map(image => image.x));
  const top = Math.min(...visible.map(image => image.y));
  const right = Math.max(...visible.map(image => image.x + image.width));
  const bottom = Math.max(...visible.map(image => image.y + image.height));
  const scale = clamp(Math.min((width - 120) / (right - left), (height - 120) / (bottom - top), 1), .1, 4);
  return { x: width / 2 - (left + right) / 2 * scale, y: height / 2 - (top + bottom) / 2 * scale, scale };
}
