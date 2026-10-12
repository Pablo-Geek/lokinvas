import { test, expect } from '@playwright/test';

test('resize guides snap dimensions at 120% zoom, clear on release and allow Alt bypass', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Agregar mis primeras imágenes' })).toBeEnabled();
  const svg = (width: number, height: number, fill: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="${fill}"/></svg>`;
  await page.getByLabel('Subir imágenes').setInputFiles([
    { name: 'referencia.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(svg(300, 150, '#ccad8a')) },
    { name: 'ajustar.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(svg(200, 100, '#687451')) },
  ]);
  const setPosition = async (x: number, y: number) => {
    for (const [label, value] of [['X', x], ['Y', y]] as const) {
      const input = page.getByRole('spinbutton', { name: label, exact: true });
      await input.fill(String(value)); await input.press('Enter');
    }
  };
  await page.getByRole('button', { name: 'Seleccionar referencia.svg', exact: true }).click();
  await setPosition(-310, -180);
  await page.getByRole('button', { name: 'Seleccionar ajustar.svg', exact: true }).click();
  await setPosition(40, 60);
  await page.getByRole('button', { name: 'Acercar', exact: true }).click();
  const startResize = async () => {
    const box = (await page.getByLabel('Redimensionar inferior derecha', { exact: true }).boundingBox())!;
    const x = box.x + box.width / 2; const y = box.y + box.height / 2;
    await page.mouse.move(x, y); await page.mouse.down();
    await page.mouse.move(x + 116.4, y + 58.2, { steps: 5 });
  };
  await startResize();
  await expect(page.getByRole('img', { name: 'Guías de referencia de tamaño' })).toBeVisible();
  await expect(page.locator('[data-guide="equal-width"]')).toHaveCount(1);
  await expect(page.locator('[data-guide="equal-height"]')).toHaveCount(1);
  await page.screenshot({ path: 'test-results/resize-references.png' });
  await page.mouse.up();
  await expect(page.getByRole('spinbutton', { name: 'Ancho', exact: true })).toHaveValue('300');
  await expect(page.getByRole('spinbutton', { name: 'Alto', exact: true })).toHaveValue('150');
  await expect(page.locator('.resize-guides')).toHaveCount(0);
  await page.getByRole('button', { name: 'Deshacer (Ctrl + Z)', exact: true }).click();
  await expect(page.getByRole('spinbutton', { name: 'Ancho', exact: true })).toHaveValue('200');
  await page.keyboard.down('Alt');
  await startResize();
  await expect(page.locator('.resize-guides')).toHaveCount(0);
  await page.mouse.up(); await page.keyboard.up('Alt');
  const width = Number(await page.getByRole('spinbutton', { name: 'Ancho', exact: true }).inputValue());
  expect(width).toBeGreaterThan(295); expect(width).toBeLessThan(299);
});

test('moving shows edge and center guides with zoom, commits one undo step and supports Alt', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Agregar mis primeras imágenes' })).toBeEnabled();
  const svg = (width: number, height: number, fill: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="${fill}"/></svg>`;
  await page.getByLabel('Subir imágenes').setInputFiles([
    { name: 'referencia.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(svg(300, 150, '#ccad8a')) },
    { name: 'mover.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(svg(200, 100, '#687451')) },
  ]);
  const setPosition = async (x: number, y: number) => {
    for (const [label, value] of [['X', x], ['Y', y]] as const) {
      const input = page.getByRole('spinbutton', { name: label, exact: true });
      await input.fill(String(value)); await input.press('Enter');
    }
  };
  await page.getByRole('button', { name: 'Seleccionar referencia.svg', exact: true }).click();
  await setPosition(-300, -100);
  await page.getByRole('button', { name: 'Seleccionar mover.svg', exact: true }).click();
  await setPosition(120, 160);
  await page.getByRole('button', { name: 'Acercar', exact: true }).click();
  const dragBy = async (dx: number, dy: number) => {
    const box = (await page.getByRole('button', { name: 'Imagen mover.svg', exact: true }).boundingBox())!;
    const x = box.x + box.width / 2; const y = box.y + box.height / 2;
    await page.mouse.move(x, y); await page.mouse.down();
    await page.mouse.move(x + dx * 1.2, y + dy * 1.2, { steps: 6 });
  };
  await dragBy(-117, -107);
  await expect(page.getByRole('img', { name: 'Guías de referencia de posición' })).toBeVisible();
  await expect(page.locator('[data-guide="alignment"][data-axis="x"]')).toHaveCount(1);
  await expect(page.locator('[data-guide="alignment"][data-axis="y"]')).toHaveCount(1);
  await page.screenshot({ path: 'test-results/move-references.png' });
  await page.mouse.up();
  await expect(page.locator('.resize-guides')).toHaveCount(0);
  await expect(page.getByRole('spinbutton', { name: 'X', exact: true })).toHaveValue('0');
  await expect(page.getByRole('spinbutton', { name: 'Y', exact: true })).toHaveValue('50');
  await expect(page.getByRole('spinbutton', { name: 'Ancho', exact: true })).toHaveValue('200');
  await expect(page.getByRole('spinbutton', { name: 'Alto', exact: true })).toHaveValue('100');
  await page.getByRole('button', { name: 'Deshacer (Ctrl + Z)', exact: true }).click();
  await expect(page.getByRole('spinbutton', { name: 'X', exact: true })).toHaveValue('120');
  await expect(page.getByRole('spinbutton', { name: 'Y', exact: true })).toHaveValue('160');

  await page.keyboard.down('Alt');
  await dragBy(-117, -107);
  await expect(page.locator('.resize-guides')).toHaveCount(0);
  await page.mouse.up(); await page.keyboard.up('Alt');
  expect(Number(await page.getByRole('spinbutton', { name: 'X', exact: true }).inputValue())).toBeGreaterThan(1);
  expect(Number(await page.getByRole('spinbutton', { name: 'Y', exact: true }).inputValue())).toBeGreaterThan(51);

  await setPosition(120, 160);
  await dragBy(-367, 50);
  await expect(page.getByRole('img', { name: 'Guías de referencia de posición' })).toBeVisible();
  await page.mouse.up();
  await expect(page.getByRole('spinbutton', { name: 'X', exact: true })).toHaveValue('-250');
  await expect(page.getByRole('spinbutton', { name: 'Y', exact: true })).toHaveValue('210');
  await expect(page.getByRole('status')).toHaveText('Guardado local');
  await page.reload();
  await page.getByRole('button', { name: 'Seleccionar mover.svg', exact: true }).click();
  await expect(page.getByRole('spinbutton', { name: 'X', exact: true })).toHaveValue('-250');
  await expect(page.locator('.resize-guides')).toHaveCount(0);
});
