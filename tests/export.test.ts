import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCanvasExport, exportFilename } from '../src/export.ts';
import type { CanvasDocument } from '../src/model.ts';

test('export preserves the full composition, embedded images, text, layers and view', () => {
  const document: CanvasDocument = { version: 2, name: 'Ideas para mañana', items: [
    { id: 'image', kind: 'image', name: 'foto.png', src: 'data:image/png;base64,aGVsbG8=', x: -32.5, y: 15, width: 250, height: 125, naturalWidth: 500, naturalHeight: 250, visible: false, locked: true },
    { id: 'text', kind: 'text', name: 'Título', text: '¡Hola!\nIdeas ✨', fontSize: 34.5, color: '#687451', x: 60, y: -20, width: 320, height: 86.25, visible: true, locked: false },
  ] };
  const view = { x: -140, y: 200, scale: 1.2 };
  const before = JSON.stringify(document);
  const exported = createCanvasExport(document, view, new Date('2026-10-12T12:00:00Z'));
  const parsed = JSON.parse(exported.content);
  assert.equal(parsed.format, 'lokinvas'); assert.equal(parsed.version, 1);
  assert.equal(parsed.exportedAt, '2026-10-12T12:00:00.000Z');
  assert.deepEqual(parsed.document, document); assert.deepEqual(parsed.view, view);
  assert.equal(exported.filename, 'Ideas para mañana.lokinvas');
  assert.equal(JSON.stringify(document), before);
});

test('empty projects can be exported with a fallback filename', () => {
  const result = createCanvasExport({ version: 2, name: '', items: [] }, { x: 0, y: 0, scale: 1 });
  assert.equal(result.filename, 'Canvas sin título.lokinvas');
  assert.deepEqual(JSON.parse(result.content).document.items, []);
});

test('download filenames remove invalid characters and handle reserved names and long titles', () => {
  assert.equal(exportFilename('Mi canvas: /ideas?'), 'Mi canvas- -ideas-.lokinvas');
  assert.equal(exportFilename('  Proyecto...  '), 'Proyecto.lokinvas');
  assert.equal(exportFilename('CON'), 'Canvas CON.lokinvas');
  assert.equal(exportFilename('NUL.txt'), 'Canvas NUL.txt.lokinvas');
  assert.equal(exportFilename('proyecto.lokinvas'), 'proyecto.lokinvas');
  assert.equal(exportFilename('a'.repeat(200)).length, 120 + '.lokinvas'.length);
});
