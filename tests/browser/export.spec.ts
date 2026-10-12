import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import type { CanvasExport } from '../../src/export';

test('download the entire project with embedded images, hidden layers and the latest text edit', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Exportar canvas', exact: true })).toBeEnabled();
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><rect width="200" height="100" fill="#687451"/></svg>';
  await page.getByLabel('Subir imágenes').setInputFiles(['primera.svg', 'segunda.svg'].map(name => ({ name, mimeType: 'image/svg+xml', buffer: Buffer.from(svg) })));
  await page.getByRole('button', { name: 'Seleccionar primera.svg', exact: true }).click();
  const x = page.getByRole('spinbutton', { name: 'X', exact: true });
  await x.fill('-120.5'); await x.press('Enter');
  await page.getByRole('button', { name: 'Ocultar primera.svg', exact: true }).click();
  await page.getByRole('button', { name: 'Bloquear primera.svg', exact: true }).click();
  await page.getByRole('button', { name: 'Añadir texto (T)', exact: true }).click();
  await page.getByRole('main').click({ position: { x: 300, y: 200 } });
  const editor = page.getByRole('textbox', { name: 'Editar texto en canvas', exact: true });
  await editor.fill('Título ✨\nTexto actualizado'); await editor.press('Control+Enter');
  await page.getByRole('button', { name: 'Mi primer canvas', exact: true }).click();
  const title = page.getByRole('textbox', { name: 'Nombre del canvas', exact: true });
  await title.fill('Mis ideas: otoño / café'); await title.press('Enter');
  await page.getByRole('button', { name: 'Acercar', exact: true }).click();
  await page.getByRole('textbox', { name: 'Contenido del texto', exact: true }).fill('Último cambio ✨\nsin esperar al guardado');
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar canvas', exact: true }).click();
  const download = await downloaded;
  expect(download.suggestedFilename()).toBe('Mis ideas- otoño - café.lokinvas');
  const exported = JSON.parse(await readFile((await download.path())!, 'utf8')) as CanvasExport;
  expect(exported.format).toBe('lokinvas'); expect(exported.version).toBe(1);
  expect(exported.document.name).toBe('Mis ideas: otoño / café');
  expect(exported.document.items.map(item => item.name)).toEqual(['primera.svg', 'segunda.svg', 'Texto']);
  const first = exported.document.items[0];
  expect(first.visible).toBe(false); expect(first.locked).toBe(true); expect(first.x).toBe(-120.5);
  if (first.kind === 'text') throw new Error('Expected an embedded image');
  expect(first.src).toMatch(/^data:image\/svg\+xml;base64,/);
  expect(Buffer.from(first.src.split(',')[1], 'base64').toString()).toBe(svg);
  const text = exported.document.items[2];
  if (text.kind !== 'text') throw new Error('Expected a text layer');
  expect(text.text).toBe('Último cambio ✨\nsin esperar al guardado');
  expect(text.color).toBe('#34372e'); expect(text.fontSize).toBe(32);
  expect(exported.view.scale).toBeCloseTo(1.2);
  await expect(page.getByRole('status')).toHaveText('Guardado local');
  const saved = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>(resolve => { const request = indexedDB.open('lokinvas', 1); request.onsuccess = () => resolve(request.result); });
    const result = await new Promise(resolve => { const request = db.transaction('documents').objectStore('documents').get('current'); request.onsuccess = () => resolve(request.result); });
    db.close(); return result;
  });
  expect(exported.document).toEqual(saved);
});

test('export an empty canvas on a narrow screen without overflow', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('/');
  const button = page.getByRole('button', { name: 'Exportar canvas', exact: true });
  await expect(button).toBeEnabled(); await expect(button).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const downloaded = page.waitForEvent('download'); await button.click();
  const download = await downloaded;
  const exported = JSON.parse(await readFile((await download.path())!, 'utf8')) as CanvasExport;
  expect(download.suggestedFilename()).toBe('Mi primer canvas.lokinvas');
  expect(exported.document.items).toEqual([]);
});

test('a download failure shows an error and a retry leaves the canvas intact', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Exportar canvas', exact: true })).toBeEnabled();
  await page.evaluate(() => {
    const original = URL.createObjectURL.bind(URL);
    URL.createObjectURL = () => { URL.createObjectURL = original; throw new Error('Simulated download failure'); };
  });
  await page.getByRole('button', { name: 'Exportar canvas', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText(/No se pudo exportar el canvas/);
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar canvas', exact: true }).click();
  await downloaded;
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByText('0 imágenes en el canvas')).toBeVisible();
});
