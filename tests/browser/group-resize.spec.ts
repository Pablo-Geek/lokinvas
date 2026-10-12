import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

async function prepare(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Añadir texto (T)', exact: true })).toBeEnabled();
  const svg = (width: number, height: number, fill: string) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="${fill}"/></svg>`);
  await page.getByLabel('Subir imágenes').setInputFiles([
    { name: 'a.svg', mimeType: 'image/svg+xml', buffer: svg(100, 80, '#687451') },
    { name: 'referencia.svg', mimeType: 'image/svg+xml', buffer: svg(300, 96, '#ccad8a') },
  ]);
  const setPosition = async (x: number, y: number) => {
    for (const [label, value] of [['X', x], ['Y', y]] as const) {
      const input = page.getByRole('spinbutton', { name: label, exact: true });
      await input.fill(String(value)); await input.press('Enter');
    }
  };
  await setPosition(-350, -200);
  await page.getByRole('button', { name: 'Seleccionar a.svg', exact: true }).click();
  await setPosition(0, 0);
  await page.getByRole('button', { name: 'Añadir texto (T)', exact: true }).click();
  await page.getByRole('main').click({ position: { x: 530, y: 470 } });
  const editor = page.getByRole('textbox', { name: 'Editar texto en canvas', exact: true });
  await editor.fill('Hola'); await editor.press('Control+Enter');
  await page.getByRole('button', { name: 'Mantener proporción', exact: true }).click();
  const width = page.getByRole('spinbutton', { name: 'Ancho', exact: true });
  await width.fill('100'); await width.press('Enter');
  await page.getByRole('button', { name: 'Mantener proporción', exact: true }).click();
  await setPosition(150, 0);
  await expect(page.getByRole('button', { name: 'Seleccionar Texto', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Seleccionar a.svg', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('button', { name: 'Seleccionar a.svg', exact: true }).click({ modifiers: ['Shift'] });
  await expect(page.getByRole('spinbutton', { name: 'Ancho del conjunto', exact: true })).toHaveValue('250');
  await expect(page.getByRole('spinbutton', { name: 'Alto del conjunto', exact: true })).toHaveValue('80');
}

test('resize a mixed group at 120% zoom with guides, scale letters, undo once and save numeric sizes', async ({ page }) => {
  await prepare(page);
  await page.getByRole('button', { name: 'Acercar', exact: true }).click();
  const image = page.getByRole('button', { name: 'Imagen a.svg', exact: true });
  const text = page.getByRole('button', { name: 'Texto Texto', exact: true });
  const beforeImage = (await image.boundingBox())!; const beforeText = (await text.boundingBox())!;
  const box = (await page.getByRole('button', { name: 'Redimensionar conjunto inferior derecha', exact: true }).boundingBox())!;
  const x = box.x + box.width / 2; const y = box.y + box.height / 2;
  await page.mouse.move(x, y); await page.mouse.down();
  await page.mouse.move(x + 47 * 1.2, y + 47 * 80 / 250 * 1.2, { steps: 6 });
  await expect(page.locator('[data-guide="equal-width"]')).toHaveCount(1);
  await expect(page.getByRole('spinbutton', { name: 'Ancho del conjunto', exact: true })).toHaveValue('300');
  await expect(page.locator('.canvas-text-content')).toHaveCSS('font-size', '38.4px');
  await page.screenshot({ path: 'test-results/group-resize.png' });
  await page.mouse.up();
  await expect(page.getByRole('spinbutton', { name: 'Alto del conjunto', exact: true })).toHaveValue('96');
  await expect(page.locator('.resize-guides')).toHaveCount(0);
  const afterImage = (await image.boundingBox())!; const afterText = (await text.boundingBox())!;
  expect(afterImage.width / beforeImage.width).toBeCloseTo(1.2, 2);
  expect(afterImage.height / beforeImage.height).toBeCloseTo(1.2, 2);
  expect((afterText.x - afterImage.x) / (beforeText.x - beforeImage.x)).toBeCloseTo(1.2, 2);
  await page.getByRole('button', { name: 'Deshacer (Ctrl + Z)', exact: true }).click();
  await expect(page.getByRole('spinbutton', { name: 'Ancho del conjunto', exact: true })).toHaveValue('250');
  await expect(page.locator('.canvas-text-content')).toHaveCSS('font-size', '32px');
  expect((await text.boundingBox())!.x).toBeCloseTo(beforeText.x);
  await page.getByRole('button', { name: 'Rehacer (Ctrl + Shift + Z)', exact: true }).click();
  await expect(page.getByRole('spinbutton', { name: 'Ancho del conjunto', exact: true })).toHaveValue('300');
  const width = page.getByRole('spinbutton', { name: 'Ancho del conjunto', exact: true });
  await width.fill('500'); await width.press('Enter');
  await expect(page.getByRole('spinbutton', { name: 'Alto del conjunto', exact: true })).toHaveValue('160');
  await expect(page.locator('.canvas-text-content')).toHaveCSS('font-size', '64px');
  await expect(page.getByRole('status')).toHaveText('Guardado local');
  await page.reload();
  await page.getByRole('button', { name: 'Seleccionar Texto', exact: true }).click();
  await expect(page.getByRole('spinbutton', { name: 'Fuente (px)', exact: true })).toHaveValue('64');
  await expect(page.getByRole('spinbutton', { name: 'X', exact: true })).toHaveValue('300');
  await page.getByRole('button', { name: 'Seleccionar a.svg', exact: true }).click();
  await expect(page.getByRole('spinbutton', { name: 'Ancho', exact: true })).toHaveValue('200');
});

test('free group resize, Escape cancellation, Alt bypass and locked-layer restrictions', async ({ page }) => {
  await prepare(page);
  await page.getByRole('button', { name: 'Mantener proporción del conjunto', exact: true }).click();
  await expect(page.locator('.group-resize-handle')).toHaveCount(8);
  const box = (await page.getByRole('button', { name: 'Redimensionar conjunto derecha', exact: true }).boundingBox())!;
  const x = box.x + box.width / 2; const y = box.y + box.height / 2;
  await page.mouse.move(x, y); await page.mouse.down();
  await page.mouse.move(x + 47, y, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByRole('spinbutton', { name: 'Ancho del conjunto', exact: true })).toHaveValue('300');
  await expect(page.getByRole('spinbutton', { name: 'Alto del conjunto', exact: true })).toHaveValue('80');
  await expect(page.locator('.canvas-text-content')).toHaveCSS('font-size', '32px');
  const corner = (await page.getByRole('button', { name: 'Redimensionar conjunto superior izquierda', exact: true }).boundingBox())!;
  await page.keyboard.down('Alt');
  await page.mouse.move(corner.x + corner.width / 2, corner.y + corner.height / 2); await page.mouse.down();
  await page.mouse.move(corner.x + corner.width / 2 + 30, corner.y + corner.height / 2 + 10, { steps: 5 });
  await expect(page.locator('.resize-guides')).toHaveCount(0);
  await expect(page.getByRole('spinbutton', { name: 'Ancho del conjunto', exact: true })).toHaveValue('270');
  await page.keyboard.press('Escape'); await page.mouse.up(); await page.keyboard.up('Alt');
  await page.getByRole('button', { name: 'Seleccionar a.svg', exact: true }).click();
  await page.getByRole('button', { name: 'Seleccionar Texto', exact: true }).click({ modifiers: ['Shift'] });
  await expect(page.getByRole('spinbutton', { name: 'Ancho del conjunto', exact: true })).toHaveValue('300');
  await expect(page.getByRole('spinbutton', { name: 'Alto del conjunto', exact: true })).toHaveValue('80');
  await page.getByRole('button', { name: 'Bloquear Texto', exact: true }).click();
  await expect(page.locator('.group-resize-handle')).toHaveCount(0);
  await expect(page.getByRole('spinbutton', { name: 'Ancho del conjunto', exact: true })).toBeDisabled();
  await expect(page.getByText('Desbloquea y muestra todas las capas seleccionadas para ajustar el tamaño del conjunto.')).toBeVisible();
});
