import { test } from 'node:test';
import assert from 'node:assert/strict';
import { constrainSelectionResize, itemsInRect, moveSelectionWithReferences, resizeSelection, resizeSelectionWithReferences, selectionBounds, selectionRect, toggleSelection, translateSelection } from '../src/selection.ts';
import { commit, initialDocument, undo } from '../src/model.ts';
import type { CanvasImage, CanvasText, History } from '../src/model.ts';

const image = (id: string, x = 0, y = 0, patch: Partial<CanvasImage> = {}): CanvasImage => ({ id, name: id, src: '', x, y, width: 100, height: 80, naturalWidth: 100, naturalHeight: 80, visible: true, locked: false, ...patch });

test('selection rectangles work in all drag directions and include intersecting unlocked layers', () => {
  const rect = selectionRect({ x: 200, y: 200 }, { x: -10, y: -10 });
  assert.deepEqual(rect, { x: -10, y: -10, width: 210, height: 210 });
  assert.deepEqual(itemsInRect([image('inside'), image('touching', 190), image('outside', 250), image('hidden', 0, 0, { visible: false }), image('locked', 0, 0, { locked: true })], rect), ['inside', 'touching']);
});

test('Shift selection toggles IDs without duplicates or mutating the previous selection', () => {
  const ids = ['a'];
  assert.deepEqual(toggleSelection(ids, 'b'), ['a', 'b']);
  assert.deepEqual(toggleSelection(['a', 'b'], 'a'), ['b']);
  assert.deepEqual(ids, ['a']);
});

test('group translation preserves spacing and dimensions and respects hidden and locked items', () => {
  const items = [image('a', -100, -50), image('b', 60, 90), image('locked', 10, 0, { locked: true }), image('hidden', 10, 0, { visible: false }), image('other', 500)];
  const moved = translateSelection(items, ['a', 'b', 'locked', 'hidden'], 30, 15);
  assert.equal(moved[1].x - moved[0].x, items[1].x - items[0].x);
  assert.equal(moved[1].y - moved[0].y, items[1].y - items[0].y);
  assert.equal(moved[0].width, 100);
  assert.equal(moved[0].height, 80);
  assert.equal(moved[2], items[2]); assert.equal(moved[3], items[3]); assert.equal(moved[4], items[4]);
  assert.equal(items[0].x, -100);
  assert.equal(translateSelection(items, ['a'], 0, 0), items);
});

test('group snapping uses the collective bounds and excludes selected images as references', () => {
  const items = [image('a', -300, -100), image('b', -140, 40), image('reference', 140, -220)];
  const result = moveSelectionWithReferences(items, ['a', 'b'], 177, 117, 1.2);
  assert.equal(result.dx, 180); assert.equal(result.dy, 117);
  assert.equal(result.preview?.guides[0].reference.id, 'reference');
  assert.deepEqual(selectionBounds(items.slice(0, 2)), { x: -300, y: -100, width: 260, height: 220 });
  const noSelfSnap = moveSelectionWithReferences(items.slice(0, 2), ['a', 'b'], 3, 3, 1);
  assert.equal(noSelfSnap.dx, 3); assert.equal(noSelfSnap.dy, 3); assert.equal(noSelfSnap.preview?.guides.length, 0);
});

test('group snapping respects zoom tolerance, Alt, and selections with no movable items', () => {
  const items = [image('a'), image('b', 120), image('reference', 400, 500)];
  assert.equal(moveSelectionWithReferences(items, ['a', 'b'], 170, 0, .5).dx, 180);
  assert.equal(moveSelectionWithReferences(items, ['a', 'b'], 170, 0, 2).dx, 170);
  assert.equal(moveSelectionWithReferences(items, ['a', 'b'], 177, 0, 1, true).dx, 177);
  assert.deepEqual(moveSelectionWithReferences([image('locked', 0, 0, { locked: true })], ['locked'], 10, 10, 1), { dx: 0, dy: 0, preview: null });
});

test('one history entry restores every image moved as a group', () => {
  const items = [image('a'), image('b', 150)];
  const history: History = { past: [], present: { ...initialDocument, items }, future: [] };
  const moved = commit(history, { ...history.present, items: translateSelection(items, ['a', 'b'], 30, 40) });
  assert.deepEqual(undo(moved).present.items, items);
  assert.equal(moved.past.length, 1);
  assert.equal(selectionBounds([]), null);
});

test('resizing a group scales sizes, gaps and font sizes from a shared anchor', () => {
  const text: CanvasText = { id: 'text', kind: 'text', name: 'Texto', text: 'Hola', x: 150, y: 100, width: 100, height: 40, fontSize: 32, color: '#000000', visible: true, locked: false };
  const items = [image('image'), text, image('outside', 700)];
  const original = selectionBounds(items.slice(0, 2))!;
  const resized = resizeSelection(items, ['image', 'text'], original, { ...original, width: original.width * 2, height: original.height * 2 });
  assert.equal(resized[0].width, 200); assert.equal(resized[0].height, 160);
  assert.equal(resized[1].x, 300); assert.equal(resized[1].y, 200);
  assert.equal(resized[1].width, 200); assert.equal(resized[1].height, 80);
  assert.equal(resized[1].kind === 'text' && resized[1].fontSize, 64);
  assert.equal(resized[2], items[2]);
  assert.equal(items[1].width, 100);
  assert.equal(resizeSelection(items, ['image', 'text'], original, original), items);
});

test('the opposite corner remains fixed when shrinking a group from the top left', () => {
  const items = [image('a', -100, -50), image('b', 100, 100)];
  const original = selectionBounds(items)!;
  const result = resizeSelectionWithReferences(items, ['a', 'b'], 'nw', original.width / 2, original.height / 2, 1, true);
  assert.equal(result.bounds!.x + result.bounds!.width, original.x + original.width);
  assert.equal(result.bounds!.y + result.bounds!.height, original.y + original.height);
  assert.equal(result.items[0].width, 50);
  assert.equal(result.items[0].height, 40);
});

test('minimum and maximum sizes apply to each individual element', () => {
  const items = [image('small', 0, 0, { width: 10, height: 8 }), image('big', 100, 100, { width: 200, height: 160 })];
  const original = selectionBounds(items)!;
  const tiny = constrainSelectionResize(items, ['small', 'big'], original, { ...original, width: 1, height: 1 }, 'nw', true);
  assert.equal(tiny.width, original.width); assert.equal(tiny.height, original.height);
  const huge = constrainSelectionResize(items, ['small', 'big'], original, { ...original, width: original.width * 200, height: original.height * 200 }, 'se', true);
  const resized = resizeSelection(items, ['small', 'big'], original, huge);
  assert.equal(resized[1].width, 20000);
  assert.ok(resized.every(item => item.width >= 8 && item.height >= 8 && item.width <= 20000 && item.height <= 20000));
});

test('free group resizing changes each axis independently and ignores locked and hidden items', () => {
  const items = [image('a'), image('b', 150), image('locked', 400, 0, { locked: true }), image('hidden', 400, 0, { visible: false })];
  const original = selectionBounds(items.slice(0, 2))!;
  const target = { ...original, width: original.width * 2, height: original.height };
  const resized = resizeSelection(items, items.map(item => item.id), original, target);
  assert.equal(resized[0].width, 200); assert.equal(resized[0].height, 80);
  assert.equal(resized[1].x, 300);
  assert.equal(resized[2], items[2]); assert.equal(resized[3], items[3]);
});

test('group size guides match other elements, exclude the selection, and support Alt', () => {
  const items = [image('a'), image('b', 150), image('reference', -500, -300, { width: 300, height: 96 })];
  const result = resizeSelectionWithReferences(items, ['a', 'b'], 'se', 47, 47 * 80 / 250, 1.2, true);
  assert.equal(result.bounds!.width, 300);
  assert.equal(result.bounds!.height, 96);
  assert.ok(result.preview!.guides.some(guide => guide.kind === 'size' && guide.reference.id === 'reference'));
  const bypass = resizeSelectionWithReferences(items, ['a', 'b'], 'se', 47, 47 * 80 / 250, 1.2, true, true);
  assert.equal(bypass.bounds!.width, 297);
  assert.equal(bypass.preview!.guides.length, 0);
  const ownOnly = resizeSelectionWithReferences(items.slice(0, 2), ['a', 'b'], 'se', 47, 47 * 80 / 250, 1, true);
  assert.equal(ownOnly.preview!.guides.length, 0);
});

test('one undo step restores sizes and positions of the entire resized group', () => {
  const items = [image('a'), image('b', 150)];
  const original = selectionBounds(items)!;
  const history: History = { past: [], present: { ...initialDocument, items }, future: [] };
  const resized = resizeSelection(items, ['a', 'b'], original, { ...original, width: original.width * 2, height: original.height * 2 });
  const changed = commit(history, { ...history.present, items: resized });
  assert.deepEqual(undo(changed).present.items, items);
  assert.equal(changed.past.length, 1);
});
