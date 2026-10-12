import type { CanvasItem, Geometry, ResizeHandle } from './model';

export type ResizeGuide = {
  kind: 'size' | 'alignment'; axis: 'x' | 'y';
  reference: CanvasItem; value: number;
};
export type ResizePreview = { geometry: Geometry; guides: ResizeGuide[]; mode?: 'move' };
type Candidate = { axis: 'x' | 'y'; size: number; error: number; distance: number; kind: ResizeGuide['kind'] };

/** Align any moving edge or center to another image without changing its size. */
export function moveWithReferences(raw: Geometry, images: CanvasItem[], id: string, scale: number, bypass = false): ResizePreview {
  if (bypass) return { geometry: raw, guides: [], mode: 'move' };
  const references = images.filter(image => image.id !== id && image.visible);
  const threshold = 6 / scale;
  const geometry = { ...raw };
  const guides: ResizeGuide[] = [];
  for (const axis of ['x', 'y'] as const) {
    const position = axis === 'x' ? 'x' : 'y';
    const dimension = axis === 'x' ? 'width' : 'height';
    const matches: { delta: number; value: number; reference: CanvasItem; priority: number; distance: number }[] = [];
    for (const reference of references) {
      const distance = Math.hypot(raw.x + raw.width / 2 - reference.x - reference.width / 2, raw.y + raw.height / 2 - reference.y - reference.height / 2);
      for (const anchor of [0, .5, 1]) {
        const activeValue = raw[position] + raw[dimension] * anchor;
        for (const target of [0, .5, 1]) {
          const value = reference[position] + reference[dimension] * target;
          const delta = value - activeValue;
          if (Math.abs(delta) <= threshold + 1e-8) matches.push({ delta, value, reference, distance, priority: anchor === target ? anchor === .5 ? 0 : 1 : 2 });
        }
      }
    }
    matches.sort((a, b) => Math.abs(a.delta) - Math.abs(b.delta) || a.priority - b.priority || a.distance - b.distance);
    const best = matches[0];
    if (best) {
      geometry[position] += best.delta;
      guides.push({ kind: 'alignment', axis, reference: best.reference, value: best.value });
    }
  }
  return { geometry, guides, mode: 'move' };
}

/** Match within six screen pixels, independently of the canvas zoom. */
export function resizeWithReferences(original: Geometry, raw: Geometry, handle: ResizeHandle, keepRatio: boolean, images: CanvasItem[], id: string, scale: number, bypass = false): ResizePreview {
  if (bypass) return { geometry: raw, guides: [] };
  const references = images.filter(image => image.id !== id && image.visible);
  const horizontal = /[ew]/.test(handle); const vertical = /[ns]/.test(handle);
  const west = handle.includes('w'); const north = handle.includes('n');
  const ratio = original.width / original.height;
  const threshold = 6 / scale;
  const distance = (image: Geometry) => Math.hypot(raw.x + raw.width / 2 - image.x - image.width / 2, raw.y + raw.height / 2 - image.y - image.height / 2);
  const candidates: Candidate[] = [];
  const add = (axis: 'x' | 'y', size: number, image: CanvasItem, kind: Candidate['kind']) => {
    const error = Math.abs(size - (axis === 'x' ? raw.width : raw.height));
    const width = axis === 'x' ? size : keepRatio ? size * ratio : raw.width;
    const height = axis === 'y' ? size : keepRatio ? size / ratio : raw.height;
    if (error <= threshold + 1e-8 && width >= 8 && height >= 8 && width <= 20000 && height <= 20000) candidates.push({ axis, size, error, distance: distance(image), kind });
  };
  for (const image of references) {
    if (horizontal) {
      add('x', image.width, image, 'size');
      for (const edge of [image.x, image.x + image.width / 2, image.x + image.width]) add('x', west ? original.x + original.width - edge : edge - original.x, image, 'alignment');
    }
    if (vertical) {
      add('y', image.height, image, 'size');
      for (const edge of [image.y, image.y + image.height / 2, image.y + image.height]) add('y', north ? original.y + original.height - edge : edge - original.y, image, 'alignment');
    }
  }
  const score = (candidate: Candidate) => candidate.error * (keepRatio ? Math.hypot(1, candidate.axis === 'x' ? 1 / ratio : ratio) : 1);
  candidates.sort((a, b) => score(a) - score(b) || (a.kind === 'size' ? 0 : 1) - (b.kind === 'size' ? 0 : 1) || a.distance - b.distance);
  let width = raw.width; let height = raw.height;
  if (keepRatio && candidates.length) {
    const best = candidates[0];
    if (best.axis === 'x') { width = best.size; height = width / ratio; }
    else { height = best.size; width = height * ratio; }
  } else if (!keepRatio) {
    width = candidates.find(candidate => candidate.axis === 'x')?.size ?? width;
    height = candidates.find(candidate => candidate.axis === 'y')?.size ?? height;
  }
  const geometry = { width, height, x: west ? original.x + original.width - width : original.x, y: north ? original.y + original.height - height : original.y };
  const guides: ResizeGuide[] = [];
  const nearest = [...references].sort((a, b) => distance(a) - distance(b));
  for (const axis of ['x', 'y'] as const) {
    if (!(axis === 'x' ? horizontal || keepRatio && vertical : vertical || keepRatio && horizontal)) continue;
    const value = axis === 'x' ? width : height;
    const sameSize = nearest.find(image => Math.abs((axis === 'x' ? image.width : image.height) - value) < 1e-6);
    if (sameSize) guides.push({ kind: 'size', axis, reference: sameSize, value });
    if (!(axis === 'x' ? horizontal : vertical)) continue;
    const movingEdge = axis === 'x' ? west ? geometry.x : geometry.x + width : north ? geometry.y : geometry.y + height;
    for (const image of nearest) {
      const start = axis === 'x' ? image.x : image.y;
      const size = axis === 'x' ? image.width : image.height;
      if ([start, start + size / 2, start + size].some(edge => Math.abs(edge - movingEdge) < 1e-6)) {
        guides.push({ kind: 'alignment', axis, reference: image, value: movingEdge });
        break;
      }
    }
  }
  return { geometry, guides };
}
