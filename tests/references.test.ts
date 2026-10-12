import { test } from 'node:test';
import assert from 'node:assert/strict';
import { moveWithReferences, resizeWithReferences } from '../src/references.ts';
import type { CanvasImage, CanvasText, Geometry } from '../src/model.ts';

const original: Geometry = { x: 100, y: 200, width: 200, height: 100 };
const reference = (id: string, patch: Partial<CanvasImage> = {}): CanvasImage => ({ id, name: id, src: '', x: -300, y: -100, width: 300, height: 150, naturalWidth: 300, naturalHeight: 150, visible: true, locked: false, ...patch });

test('snap equal dimensions while preserving ratio and the fixed corner', () => {
  const raw = { x: 3, y: 151.5, width: 297, height: 148.5 };
  const result = resizeWithReferences(original, raw, 'nw', true, [reference('other')], 'active', 1);
  assert.deepEqual(result.geometry, { x: 0, y: 150, width: 300, height: 150 });
  assert.equal(result.guides.filter(guide => guide.kind === 'size').length, 2);
});

test('screen-space tolerance remains constant at different zoom levels', () => {
  const raw = { ...original, width: 290, height: 145 };
  const images = [reference('other', { height: 400 })];
  assert.equal(resizeWithReferences(original, raw, 'se', true, images, 'active', .5).geometry.width, 300);
  assert.equal(resizeWithReferences(original, raw, 'se', true, images, 'active', 2).geometry.width, 290);
});

test('exclude the active image and hidden images, but allow locked references', () => {
  const raw = { ...original, width: 297, height: 148.5 };
  const ignored = resizeWithReferences(original, raw, 'se', true, [reference('active'), reference('hidden', { visible: false })], 'active', 1);
  assert.deepEqual(ignored.geometry, raw);
  assert.equal(ignored.guides.length, 0);
  const locked = resizeWithReferences(original, raw, 'se', true, [reference('locked', { locked: true })], 'active', 1);
  assert.equal(locked.geometry.width, 300);
});

test('free resizing can match width and height from different references', () => {
  const raw = { ...original, width: 297, height: 178 };
  const result = resizeWithReferences(original, raw, 'se', false, [reference('width'), reference('height', { width: 450, height: 180 })], 'active', 1);
  assert.equal(result.geometry.width, 300);
  assert.equal(result.geometry.height, 180);
  assert.deepEqual(result.guides.filter(guide => guide.kind === 'size').map(guide => guide.reference.id), ['width', 'height']);
});

test('side handles preserve the stationary dimension and snap to aligned edges', () => {
  const raw = { ...original, width: 247 };
  const result = resizeWithReferences(original, raw, 'e', false, [reference('edge', { x: 350, width: 100 })], 'active', 1);
  assert.equal(result.geometry.width, 250);
  assert.equal(result.geometry.height, 100);
  assert.ok(result.guides.some(guide => guide.kind === 'alignment' && guide.value === 350));
  assert.ok(result.guides.every(guide => guide.axis === 'x'));
});

test('choose the closest match and bypass all snapping with Alt', () => {
  const raw = { ...original, width: 297, height: 148.5 };
  const references = [reference('farther', { width: 302, height: 600 }), reference('closest', { width: 299, height: 600 })];
  assert.equal(resizeWithReferences(original, raw, 'se', true, references, 'active', 1).geometry.width, 299);
  assert.deepEqual(resizeWithReferences(original, raw, 'se', true, references, 'active', 1, true), { geometry: raw, guides: [] });
});

test('incompatible ratios match one dimension without distorting the image', () => {
  const raw = { ...original, width: 297, height: 148.5 };
  const result = resizeWithReferences(original, raw, 'se', true, [reference('square', { width: 300, height: 300 })], 'active', 1);
  assert.equal(result.geometry.width, 300);
  assert.equal(result.geometry.height, 150);
  assert.equal(result.guides.filter(guide => guide.kind === 'size').length, 1);
});

test('snapping never exceeds size bounds when the aspect ratio is locked', () => {
  const tall = { x: 0, y: 0, width: 100, height: 10000 };
  const raw = { ...tall, width: 199, height: 19900 };
  const result = resizeWithReferences(tall, raw, 'se', true, [reference('too-big', { x: -500, y: -500, width: 202, height: 500 })], 'active', 1);
  assert.equal(result.geometry.width, 199);
  assert.equal(result.geometry.height, 19900);
});

test('moving aligns edges on both axes without changing dimensions', () => {
  const raw = { x: 3, y: 97, width: 200, height: 100 };
  const result = moveWithReferences(raw, [reference('edge', { x: 0, y: 0, width: 300, height: 100 })], 'active', 1);
  assert.deepEqual(result.geometry, { x: 0, y: 100, width: 200, height: 100 });
  assert.equal(result.guides.length, 2);
  assert.equal(result.mode, 'move');
});

test('moving aligns centers of differently sized images', () => {
  const raw = { x: 53, y: 600, width: 200, height: 100 };
  const result = moveWithReferences(raw, [reference('center', { x: 0, y: 0, width: 300, height: 150 })], 'active', 1);
  assert.equal(result.geometry.x, 50);
  assert.equal(result.geometry.y, 600);
  assert.equal(result.guides[0].value, 150);
});

test('movement snapping uses screen pixels and chooses the closest reference', () => {
  const raw = { x: 10, y: 600, width: 200, height: 100 };
  const images = [reference('a', { x: 0, y: 0, width: 200 }), reference('b', { x: 25, y: 0, width: 200 })];
  assert.equal(moveWithReferences(raw, images, 'active', .5).geometry.x, 0);
  assert.equal(moveWithReferences(raw, images, 'active', 2).geometry.x, 10);
  const closest = moveWithReferences({ ...raw, x: 22 }, images, 'active', 1);
  assert.equal(closest.geometry.x, 25);
  assert.equal(closest.guides[0].reference.id, 'b');
});

test('movement ignores hidden and active layers, supports locked references and Alt', () => {
  const raw = { x: 3, y: 600, width: 200, height: 100 };
  const ignored = [reference('active', { x: 0 }), reference('hidden', { x: 0, visible: false })];
  assert.deepEqual(moveWithReferences(raw, ignored, 'active', 1).geometry, raw);
  assert.equal(moveWithReferences(raw, ignored, 'active', 1).guides.length, 0);
  const locked = [reference('locked', { x: 0, locked: true })];
  assert.equal(moveWithReferences(raw, locked, 'active', 1).geometry.x, 0);
  assert.deepEqual(moveWithReferences(raw, locked, 'active', 1, true), { geometry: raw, guides: [], mode: 'move' });
});

test('movement prefers center guides when equal-sized edges and centers match', () => {
  const raw = { x: 3, y: 600, width: 300, height: 150 };
  const result = moveWithReferences(raw, [reference('center', { x: 0 })], 'active', 1);
  assert.equal(result.geometry.x, 0);
  assert.equal(result.guides[0].value, 150);
});

test('texts and images can reference each other during movement and resizing', () => {
  const text: CanvasText = { id: 'text', kind: 'text', name: 'Título', text: 'Hola', fontSize: 32, color: '#000000', x: 0, y: -100, width: 300, height: 150, visible: true, locked: false };
  const moved = moveWithReferences({ x: 3, y: 600, width: 200, height: 100 }, [text], 'image', 1);
  assert.equal(moved.geometry.x, 0);
  assert.equal(moved.guides[0].reference.kind, 'text');
  const resized = resizeWithReferences(original, { ...original, width: 297, height: 148.5 }, 'se', true, [text], 'image', 1);
  assert.equal(resized.geometry.width, 300);
  const textMove = moveWithReferences({ x: 3, y: 600, width: 300, height: 150 }, [reference('image', { x: 0 })], 'text', 1);
  assert.equal(textMove.geometry.x, 0);
});
