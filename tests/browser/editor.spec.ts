import { test, expect } from '@playwright/test';

const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><rect width="200" height="100" fill="#687451"/></svg>';

test.beforeEach(async ({ page }) => {
  page.on('pageerror', error => console.error('Browser error:', error.message));
});

test('upload, move at a different zoom, resize, duplicate, reorder, undo and persist', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Agregar mis primeras imágenes' })).toBeEnabled();
  await page.screenshot({ path: 'test-results/empty-canvas.png' });
  await page.getByLabel('Subir imágenes').setInputFiles([
    { name: 'primera.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(svg) },
    { name: 'segunda.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(svg) },
  ]);
  await expect(page.getByText('2 imágenes en el canvas')).toBeVisible();
  await expect(page.getByLabel('Nombre de la capa')).toHaveValue('segunda.svg');
  await page.getByRole('button', { name: 'Acercar', exact: true }).click();
  const element = page.getByRole('button', { name: 'Imagen segunda.svg', exact: true });
  const box = (await element.boundingBox())!;
  const xBefore = Number(await page.getByRole('spinbutton', { name: 'X', exact: true }).inputValue());
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2 + 24, { steps: 5 });
  await page.mouse.up();
  const xAfter = Number(await page.getByRole('spinbutton', { name: 'X', exact: true }).inputValue());
  expect(xAfter - xBefore).toBeCloseTo(50, 1);

  const handle = (await page.getByLabel('Redimensionar inferior derecha', { exact: true }).boundingBox())!;
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x + handle.width / 2 + 60, handle.y + handle.height / 2 + 30, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByRole('spinbutton', { name: 'Ancho', exact: true })).toHaveValue('250');
  await expect(page.getByRole('spinbutton', { name: 'Alto', exact: true })).toHaveValue('125');

  await page.getByRole('button', { name: 'Duplicar', exact: true }).click();
  await expect(page.getByText('3 imágenes en el canvas')).toBeVisible();
  await page.getByRole('button', { name: 'Enviar al fondo', exact: true }).click();
  await expect(page.locator('.layer-select').last()).toHaveText('segunda.svg (copia)');
  await page.getByRole('button', { name: 'Deshacer (Ctrl + Z)', exact: true }).click();
  await expect(page.locator('.layer-select').first()).toHaveText('segunda.svg (copia)');
  await page.getByRole('button', { name: 'Rehacer (Ctrl + Shift + Z)', exact: true }).click();
  await expect(page.locator('.layer-select').last()).toHaveText('segunda.svg (copia)');

  await expect(page.getByRole('status')).toHaveText('Guardado local');
  await page.screenshot({ path: 'test-results/editor.png' });
  await page.reload();
  await expect(page.getByText('3 imágenes en el canvas')).toBeVisible();
  await page.getByRole('button', { name: 'Seleccionar segunda.svg (copia)', exact: true }).click();
  await expect(page.getByRole('spinbutton', { name: 'Ancho', exact: true })).toHaveValue('250');
  await page.getByRole('button', { name: 'Bloquear segunda.svg (copia)', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Eliminar', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Desbloquear segunda.svg (copia)', exact: true }).click();
  await page.getByRole('button', { name: 'Eliminar', exact: true }).click();
  await expect(page.getByText('2 imágenes en el canvas')).toBeVisible();
  expect(errors).toEqual([]);
});

test('invalid uploads show errors without losing valid images; keyboard shortcuts respect inputs', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Agregar mis primeras imágenes' })).toBeEnabled();
  await page.getByLabel('Subir imágenes').setInputFiles([
    { name: 'válida.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(svg) },
    { name: 'texto.txt', mimeType: 'text/plain', buffer: Buffer.from('no image') },
  ]);
  await expect(page.getByRole('alert')).toContainText('formato no compatible');
  await expect(page.getByText('1 imagen en el canvas')).toBeVisible();
  await page.getByRole('spinbutton', { name: 'Ancho', exact: true }).fill('300');
  await page.getByRole('spinbutton', { name: 'Ancho', exact: true }).press('Enter');
  await expect(page.getByRole('spinbutton', { name: 'Alto', exact: true })).toHaveValue('150');
  await page.keyboard.press('Control+d');
  await expect(page.getByText('2 imágenes en el canvas')).toBeVisible();
  await page.keyboard.press('Delete');
  await expect(page.getByText('1 imagen en el canvas')).toBeVisible();
  await page.keyboard.press('Control+z');
  await expect(page.getByText('2 imágenes en el canvas')).toBeVisible();
});

test('sample board, visibility, panning, help and narrow layout', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /O explora con un ejemplo/ }).click();
  await expect(page.getByText('3 imágenes en el canvas')).toBeVisible();
  await page.getByRole('button', { name: 'Seleccionar 01 · Arquitectura', exact: true }).click();
  await page.getByRole('button', { name: 'Ocultar 01 · Arquitectura', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Imagen 01 · Arquitectura', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Mostrar 01 · Arquitectura', exact: true }).click();
  const before = (await page.getByRole('button', { name: 'Imagen 01 · Arquitectura', exact: true }).boundingBox())!;
  const canvas = (await page.getByRole('main').boundingBox())!;
  await page.getByRole('button', { name: 'Mover canvas (H)', exact: true }).click();
  await page.mouse.move(canvas.x + 30, canvas.y + 160);
  await page.mouse.down();
  await page.mouse.move(canvas.x + 90, canvas.y + 200, { steps: 5 });
  await page.mouse.up();
  const after = (await page.getByRole('button', { name: 'Imagen 01 · Arquitectura', exact: true }).boundingBox())!;
  expect(after.x - before.x).toBeCloseTo(60);
  expect(after.y - before.y).toBeCloseTo(40);
  await page.getByRole('button', { name: 'Atajos de teclado', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Cerrar atajos', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Atajos de teclado', exact: true })).toBeFocused();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/mobile.png' });
});

test('drop images, resize freely, drag layers and zoom with the wheel', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Agregar mis primeras imágenes' })).toBeEnabled();
  const transfer = await page.evaluateHandle(svg => {
    const data = new DataTransfer();
    data.items.add(new File([svg], 'arrastrada.svg', { type: 'image/svg+xml' }));
    return data;
  }, svg);
  await page.getByRole('main').dispatchEvent('drop', { dataTransfer: transfer, clientX: 700, clientY: 400 });
  await expect(page.getByText('1 imagen en el canvas')).toBeVisible();
  await page.getByRole('button', { name: 'Mantener proporción', exact: true }).click();
  await page.getByRole('spinbutton', { name: 'Ancho', exact: true }).fill('300');
  await page.getByRole('spinbutton', { name: 'Ancho', exact: true }).press('Enter');
  await expect(page.getByRole('spinbutton', { name: 'Alto', exact: true })).toHaveValue('100');
  await page.getByRole('button', { name: 'Duplicar', exact: true }).click();
  await page.getByRole('button', { name: 'Seleccionar arrastrada.svg (copia)', exact: true }).dragTo(page.getByRole('button', { name: 'Seleccionar arrastrada.svg', exact: true }));
  await expect(page.locator('.layer-select').last()).toHaveText('arrastrada.svg (copia)');
  const canvas = (await page.getByRole('main').boundingBox())!;
  await page.mouse.move(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2);
  await page.mouse.wheel(0, -150);
  await expect(page.locator('.zoom-value')).not.toHaveText('100%');
});
