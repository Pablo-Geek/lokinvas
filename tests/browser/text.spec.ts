import { test, expect } from '@playwright/test';

test('create, edit, scale, duplicate and persist text without triggering canvas shortcuts while typing', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Añadir texto (T)', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Añadir texto (T)', exact: true }).click();
  await page.getByRole('main').click({ position: { x: 240, y: 160 } });
  const editor = page.getByRole('textbox', { name: 'Editar texto en canvas', exact: true });
  await expect(editor).toBeFocused();
  await editor.fill('Hola canvas\nUna nueva idea');
  await editor.press('Control+Enter');
  await expect(editor).toHaveCount(0);
  await expect(page.locator('.canvas-text-content')).toHaveText('Hola canvas\nUna nueva idea');
  await expect(page.getByRole('spinbutton', { name: 'Alto', exact: true })).toHaveValue('80');
  await page.getByRole('spinbutton', { name: 'Ancho', exact: true }).fill('560');
  await page.getByRole('spinbutton', { name: 'Ancho', exact: true }).press('Enter');
  await expect(page.getByRole('spinbutton', { name: 'Fuente (px)', exact: true })).toHaveValue('64');
  await expect(page.locator('.canvas-text-content')).toHaveCSS('font-size', '64px');
  await page.getByRole('button', { name: 'Texto Texto', exact: true }).dblclick();
  await editor.fill('Este cambio se cancela');
  await editor.press('Escape');
  await expect(page.locator('.canvas-text-content')).toHaveText('Hola canvas\nUna nueva idea');
  const content = page.getByRole('textbox', { name: 'Contenido del texto', exact: true });
  await content.fill('Texto desde propiedades');
  await content.press('Tab');
  await expect(page.locator('.canvas-text-content')).toHaveText('Texto desde propiedades');
  await page.getByRole('button', { name: 'Duplicar', exact: true }).click();
  await expect(page.locator('.canvas-text')).toHaveCount(2);
  await page.getByRole('button', { name: 'Deshacer (Ctrl + Z)', exact: true }).click();
  await expect(page.locator('.canvas-text')).toHaveCount(1);
  await page.getByRole('button', { name: 'Rehacer (Ctrl + Shift + Z)', exact: true }).click();
  await expect(page.locator('.canvas-text')).toHaveCount(2);
  await expect(page.getByRole('status')).toHaveText('Guardado local');
  await page.reload();
  await expect(page.locator('.canvas-text')).toHaveCount(2);
  await page.getByRole('button', { name: 'Seleccionar Texto (copia)', exact: true }).click();
  await expect(content).toHaveValue('Texto desde propiedades');
  await expect(page.getByRole('spinbutton', { name: 'Fuente (px)', exact: true })).toHaveValue('64');
  await page.getByRole('button', { name: 'Bloquear Texto (copia)', exact: true }).click();
  await expect(content).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Eliminar', exact: true })).toBeDisabled();
  expect(errors).toEqual([]);
});

test('texts snap to image edges and dimensions at 120% zoom, scaling the lettering', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Añadir texto (T)', exact: true })).toBeEnabled();
  await page.getByLabel('Subir imágenes').setInputFiles({ name: 'referencia.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="150"><rect width="300" height="150" fill="#ccad8a"/></svg>') });
  const setPosition = async (x: number, y: number) => {
    for (const [label, value] of [['X', x], ['Y', y]] as const) {
      const input = page.getByRole('spinbutton', { name: label, exact: true });
      await input.fill(String(value)); await input.press('Enter');
    }
  };
  await setPosition(-300, -100);
  await page.keyboard.press('t');
  await page.getByRole('main').click({ position: { x: 530, y: 470 } });
  const editor = page.getByRole('textbox', { name: 'Editar texto en canvas', exact: true });
  await editor.fill('Un título'); await editor.press('Control+Enter');
  await setPosition(60, 160);
  await page.getByRole('button', { name: 'Acercar', exact: true }).click();
  const text = page.getByRole('button', { name: 'Texto Texto', exact: true });
  const box = (await text.boundingBox())!;
  const x = box.x + box.width / 2; const y = box.y + box.height / 2;
  await page.mouse.move(x, y); await page.mouse.down();
  await page.mouse.move(x - 57 * 1.2, y - 107 * 1.2, { steps: 5 });
  await expect(page.getByRole('img', { name: 'Guías de referencia de posición' })).toBeVisible();
  await page.mouse.up();
  await expect(page.getByRole('spinbutton', { name: 'X', exact: true })).toHaveValue('0');
  await expect(page.getByRole('spinbutton', { name: 'Y', exact: true })).toHaveValue('50');
  const handle = (await page.getByLabel('Redimensionar inferior derecha', { exact: true }).boundingBox())!;
  const hx = handle.x + handle.width / 2; const hy = handle.y + handle.height / 2;
  await page.mouse.move(hx, hy); await page.mouse.down();
  await page.mouse.move(hx + 17 * 1.2, hy + (17 / 7) * 1.2, { steps: 5 });
  await expect(page.locator('[data-guide="equal-width"]')).toHaveCount(1);
  await page.screenshot({ path: 'test-results/text-references.png' });
  await page.mouse.up();
  await expect(page.getByRole('spinbutton', { name: 'Ancho', exact: true })).toHaveValue('300');
  expect(Number(await page.getByRole('spinbutton', { name: 'Fuente (px)', exact: true }).inputValue())).toBeCloseTo(32 * 300 / 280, 1);
  await expect(page.locator('.resize-guides')).toHaveCount(0);
  await page.getByRole('button', { name: 'Enviar al fondo', exact: true }).click();
  await expect(page.locator('.layer-select').last()).toHaveText('Texto');
  await page.getByRole('button', { name: 'Traer al frente', exact: true }).click();
  await expect(page.locator('.layer-select').first()).toHaveText('Texto');
});

test('previous image-only documents recover after the document migration', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Añadir texto (T)', exact: true })).toBeEnabled();
  await expect(page.getByRole('status')).toHaveText('Guardado local');
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('lokinvas', 1);
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('documents', 'readwrite');
      tx.objectStore('documents').put({ version: 1, name: 'Documento anterior', images: [{ id: 'old', name: 'Antes.svg', src: 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><rect width="200" height="100" fill="green"/></svg>'), x: -100, y: -50, width: 200, height: 100, naturalWidth: 200, naturalHeight: 100, visible: true, locked: false }] }, 'current');
      tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
    });
    db.close();
  });
  await page.reload();
  await expect(page.getByRole('button', { name: 'Documento anterior', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Imagen Antes.svg', exact: true })).toBeVisible();
  await expect(page.getByText('1 imagen en el canvas')).toBeVisible();
});
