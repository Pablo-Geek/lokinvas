import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

async function prepare(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Agregar mis primeras imágenes' })).toBeEnabled();
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="80"><rect width="100" height="80" fill="#687451"/></svg>');
  await page.getByLabel('Subir imágenes').setInputFiles(['a.svg', 'b.svg', 'c.svg'].map(name => ({ name, mimeType: 'image/svg+xml', buffer: svg })));
  for (const [name, x, y] of [['a.svg', -300, -100], ['b.svg', -140, 40], ['c.svg', 140, -220]] as const) {
    await page.getByRole('button', { name: `Seleccionar ${name}`, exact: true }).click();
    for (const [label, value] of [['X', x], ['Y', y]] as const) {
      const input = page.getByRole('spinbutton', { name: label, exact: true });
      await input.fill(String(value)); await input.press('Enter');
    }
  }
}

test('Shift-select multiple images, move together with zoom and guides, undo once and persist', async ({ page }) => {
  await prepare(page);
  await page.getByRole('button', { name: 'Seleccionar a.svg', exact: true }).click();
  await page.getByRole('button', { name: 'Seleccionar b.svg', exact: true }).click({ modifiers: ['Shift'] });
  await expect(page.getByRole('heading', { name: '2 elementos seleccionados', exact: true })).toBeVisible();
  await expect(page.locator('.canvas-image.is-selected')).toHaveCount(2);
  await expect(page.locator('.canvas-image .resize-handle')).toHaveCount(0);
  await expect(page.locator('.group-resize-handle')).toHaveCount(4);
  await page.getByRole('button', { name: 'Acercar', exact: true }).click();
  const a = page.getByRole('button', { name: 'Imagen a.svg', exact: true });
  const b = page.getByRole('button', { name: 'Imagen b.svg', exact: true });
  const c = page.getByRole('button', { name: 'Imagen c.svg', exact: true });
  const beforeA = (await a.boundingBox())!; const beforeB = (await b.boundingBox())!; const beforeC = (await c.boundingBox())!;
  const x = beforeA.x + beforeA.width / 2; const y = beforeA.y + beforeA.height / 2;
  await page.mouse.move(x, y); await page.mouse.down();
  await page.mouse.move(x + 177 * 1.2, y + 117 * 1.2, { steps: 8 });
  await expect(page.getByRole('img', { name: 'Guías de referencia de posición' })).toBeVisible();
  await page.screenshot({ path: 'test-results/multiple-selection.png' });
  await page.mouse.up();
  const afterA = (await a.boundingBox())!; const afterB = (await b.boundingBox())!;
  expect(afterA.x - beforeA.x).toBeCloseTo(180 * 1.2);
  expect(afterB.x - beforeB.x).toBeCloseTo(afterA.x - beforeA.x);
  expect(afterB.y - beforeB.y).toBeCloseTo(afterA.y - beforeA.y);
  expect((await c.boundingBox())!.x).toBeCloseTo(beforeC.x);
  await expect(page.locator('.resize-guides')).toHaveCount(0);
  await expect(page.getByRole('spinbutton', { name: 'X del conjunto', exact: true })).toHaveValue('-120');
  await page.getByRole('button', { name: 'Deshacer (Ctrl + Z)', exact: true }).click();
  await expect(page.getByRole('spinbutton', { name: 'X del conjunto', exact: true })).toHaveValue('-300');
  expect((await b.boundingBox())!.x).toBeCloseTo(beforeB.x);
  await page.getByRole('button', { name: 'Rehacer (Ctrl + Shift + Z)', exact: true }).click();
  await expect(page.getByRole('spinbutton', { name: 'X del conjunto', exact: true })).toHaveValue('-120');
  await expect(page.getByRole('status')).toHaveText('Guardado local');
  await page.reload();
  await page.getByRole('button', { name: 'Seleccionar a.svg', exact: true }).click();
  await expect(page.getByRole('spinbutton', { name: 'X', exact: true })).toHaveValue('-120');
  await page.getByRole('button', { name: 'Seleccionar b.svg', exact: true }).click();
  await expect(page.getByRole('spinbutton', { name: 'X', exact: true })).toHaveValue('40');
});

test('marquee selection in reverse direction, Shift toggle, arrow keys and locked layers', async ({ page }) => {
  await prepare(page);
  await page.getByRole('button', { name: 'Bloquear c.svg', exact: true }).click();
  const canvas = (await page.getByRole('main').boundingBox())!;
  // At 100% the world origin is the center of this empty initial viewport.
  const centerX = canvas.x + canvas.width / 2; const centerY = canvas.y + canvas.height / 2;
  await page.mouse.move(centerX + 280, centerY + 170); await page.mouse.down();
  await page.mouse.move(centerX - 340, centerY - 260, { steps: 8 });
  await expect(page.getByLabel('Área de selección', { exact: true })).toBeVisible();
  await page.mouse.up();
  await expect(page.locator('.canvas-image.is-selected')).toHaveCount(2);
  await expect(page.getByLabel('Área de selección', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Imagen c.svg', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('button', { name: 'Imagen b.svg', exact: true }).click({ modifiers: ['Shift'] });
  await expect(page.locator('.canvas-image.is-selected')).toHaveCount(1);
  await page.getByRole('button', { name: 'Imagen b.svg', exact: true }).click({ modifiers: ['Shift'] });
  await expect(page.locator('.canvas-image.is-selected')).toHaveCount(2);
  await page.keyboard.press('Shift+ArrowRight');
  await expect(page.getByRole('spinbutton', { name: 'X del conjunto', exact: true })).toHaveValue('-290');
  await page.keyboard.press('Escape');
  await expect(page.locator('.canvas-image.is-selected')).toHaveCount(0);
  await page.keyboard.press('Control+a');
  await expect(page.locator('.canvas-image.is-selected')).toHaveCount(2);
  await page.getByRole('button', { name: 'Seleccionar c.svg', exact: true }).click({ modifiers: ['Shift'] });
  await expect(page.getByText('Las capas bloqueadas u ocultas permanecen en su lugar.')).toBeVisible();
  await page.keyboard.press('ArrowDown');
  await page.getByRole('button', { name: 'Seleccionar c.svg', exact: true }).click();
  await expect(page.getByRole('spinbutton', { name: 'Y', exact: true })).toHaveValue('-220');
});

test('Alt bypass and Escape cancellation preserve the original group positions', async ({ page }) => {
  await prepare(page);
  await page.getByRole('button', { name: 'Seleccionar a.svg', exact: true }).click();
  await page.getByRole('button', { name: 'Seleccionar b.svg', exact: true }).click({ modifiers: ['Shift'] });
  const box = (await page.getByRole('button', { name: 'Imagen a.svg', exact: true }).boundingBox())!;
  const x = box.x + box.width / 2; const y = box.y + box.height / 2;
  await page.keyboard.down('Alt');
  await page.mouse.move(x, y); await page.mouse.down();
  await page.mouse.move(x + 177, y + 117, { steps: 5 });
  await expect(page.locator('.resize-guides')).toHaveCount(0);
  await expect(page.getByRole('spinbutton', { name: 'X del conjunto', exact: true })).toHaveValue('-123');
  await page.keyboard.press('Escape');
  await page.mouse.up(); await page.keyboard.up('Alt');
  await expect(page.locator('.canvas-image.is-selected')).toHaveCount(0);
  await page.getByRole('button', { name: 'Seleccionar a.svg', exact: true }).click();
  await expect(page.getByRole('spinbutton', { name: 'X', exact: true })).toHaveValue('-300');
  await page.getByRole('button', { name: 'Seleccionar b.svg', exact: true }).click();
  await expect(page.getByRole('spinbutton', { name: 'X', exact: true })).toHaveValue('-140');
});
