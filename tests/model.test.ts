import { test } from 'node:test';
import assert from 'node:assert/strict';
import { commit, createText, fitImages, initialDocument, migrateDocument, redo, reorder, resizeImage, transformItem, undo, zoomAt } from '../src/model.ts';
import type { CanvasImage, History } from '../src/model.ts';

const image = (id: string, x = 0): CanvasImage => ({ id, name: id, src: '', x, y: 0, width: 200, height: 100, naturalWidth: 200, naturalHeight: 100, visible: true, locked: false });

test('a new edit after undo clears redo and preserves the previous document', () => {
  const start: History = { past: [], present: initialDocument, future: [] };
  const added = commit(start, { ...initialDocument, items: [image('a')] });
  assert.equal(undo(added).present.items.length, 0);
  assert.equal(redo(undo(added)).present.items[0].id, 'a');
  const branch = commit(undo(added), { ...initialDocument, items: [image('b')] });
  assert.equal(branch.future.length, 0);
  assert.equal(added.present.items[0].id, 'a');
});

test('layer ordering moves one image without mutating the original array', () => {
  const images = [image('a'), image('b'), image('c')];
  assert.deepEqual(reorder(images, 'a', 2).map(item => item.id), ['b', 'c', 'a']);
  assert.deepEqual(reorder(images, 'c', 0).map(item => item.id), ['c', 'a', 'b']);
  assert.deepEqual(images.map(item => item.id), ['a', 'b', 'c']);
  assert.equal(reorder(images, 'missing', 0), images);
});

test('zoom preserves the world point under the pointer and clamps its scale', () => {
  const view = { x: 140, y: -40, scale: .5 };
  const pointer = { x: 240, y: 160 };
  const next = zoomAt(view, pointer, 2);
  assert.equal((pointer.x - next.x) / next.scale, (pointer.x - view.x) / view.scale);
  assert.equal((pointer.y - next.y) / next.scale, (pointer.y - view.y) / view.scale);
  assert.equal(zoomAt(view, pointer, 100).scale, 4);
  assert.equal(zoomAt(view, pointer, 0).scale, .1);
});

test('corner resizing keeps the ratio and fixes the opposite corner', () => {
  const original = { x: 10, y: 20, width: 200, height: 100 };
  const resized = resizeImage(original, 'nw', -50, -15, true);
  assert.equal(resized.width / resized.height, 2);
  assert.equal(resized.x + resized.width, original.x + original.width);
  assert.equal(resized.y + resized.height, original.y + original.height);
  assert.equal(resized.width, 250);
});

test('free resizing and minimum limits prevent inverted images', () => {
  const original = { x: 10, y: 20, width: 200, height: 100 };
  assert.deepEqual(resizeImage(original, 'e', 50, 30, false), { x: 10, y: 20, width: 250, height: 100 });
  const resized = resizeImage(original, 'nw', 400, 400, false);
  assert.equal(resized.width, 8);
  assert.equal(resized.height, 8);
  const proportional = resizeImage(original, 'se', -400, -400, true);
  assert.equal(proportional.height, 8);
  assert.equal(proportional.width, 16);
});

test('fit centers visible images and ignores hidden layers', () => {
  const images = [image('a', -200), image('b', 200), { ...image('hidden', 10000), visible: false }];
  const view = fitImages(images, 1000, 600);
  assert.equal(view.x + 100 * view.scale, 500);
  assert.equal(view.y + 50 * view.scale, 300);
  assert.equal(view.scale, 1);
  assert.deepEqual(fitImages([], 1000, 600), { x: 500, y: 300, scale: 1 });
});

test('existing image-only documents migrate without losing image data or order', () => {
  const original = { version: 1 as const, name: 'Mi composición', images: [image('a'), image('b')] };
  const migrated = migrateDocument(original);
  assert.equal(migrated.version, 2);
  assert.equal(migrated.name, original.name);
  assert.deepEqual(migrated.items.map(item => item.id), ['a', 'b']);
  assert.deepEqual(migrated.items[0], { ...original.images[0], kind: 'image' });
  assert.equal(migrateDocument(migrated), migrated);
});

test('text resizes its lettering with its height and preserves font size when moving', () => {
  const text = createText(40, 80);
  assert.equal(text.kind, 'text');
  const doubled = transformItem(text, { x: 40, y: 80, width: text.width * 2, height: text.height * 2 });
  assert.equal(doubled.fontSize, text.fontSize * 2);
  const moved = transformItem(text, { x: 100, y: 200, width: text.width, height: text.height });
  assert.equal(moved.fontSize, text.fontSize);
  assert.equal(moved.width, text.width);
});

test('text and image layers share ordering, history and content bounds', () => {
  const text = createText(400, 0);
  const items = [image('a'), text];
  assert.deepEqual(reorder(items, text.id, 0).map(item => item.id), [text.id, 'a']);
  const history: History = { past: [], present: initialDocument, future: [] };
  const changed = commit(history, { ...initialDocument, items });
  assert.equal(redo(undo(changed)).present.items[1].kind, 'text');
  const view = fitImages(items, 1000, 600);
  assert.equal(view.x + 340 * view.scale, 500);
});

