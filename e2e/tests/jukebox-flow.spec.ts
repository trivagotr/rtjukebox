import { expect, test } from '@playwright/test';

const backendUrl = process.env.E2E_BACKEND_URL || 'http://127.0.0.1:3000';

test('kiosk QR joins a guest, enforces the guest queue limit, and lets a member reorder the queue', async ({ browser }) => {
  const kioskContext = await browser.newContext();
  const kioskPage = await kioskContext.newPage();
  await kioskPage.route('https://sdk.scdn.co/**', (route) => route.abort());

  await kioskPage.goto(`${backendUrl}/kiosk/?code=E2E-ROOM&pwd=e2e-room-password`);
  const qrLink = kioskPage.locator('.qr-hint a');
  await expect(qrLink).toHaveAttribute('href', /code=E2E-ROOM/);

  const controllerUrl = await qrLink.getAttribute('href');
  expect(controllerUrl).toBeTruthy();

  const controllerContext = await browser.newContext();
  const controllerPage = await controllerContext.newPage();
  await controllerPage.goto(controllerUrl!);

  await controllerPage.locator('.login-card input').fill('E2E Guest');
  await controllerPage.locator('.login-card button').click();
  await expect(controllerPage.locator('.device-card')).toContainText('E2E-ROOM');

  const searchInput = controllerPage.locator('.search-panel input');
  await searchInput.fill('E2E Song Alpha');
  await searchInput.press('Enter');
  await controllerPage.locator('.search-result').filter({ hasText: 'E2E Song Alpha' }).click();
  await expect(controllerPage.locator('.queue-item').filter({ hasText: 'E2E Song Alpha' })).toBeVisible();

  await searchInput.fill('E2E Song Beta');
  await searchInput.press('Enter');
  await controllerPage.locator('.search-result').filter({ hasText: 'E2E Song Beta' }).click();
  await expect(controllerPage.locator('.modal-screen')).toBeVisible();

  await controllerPage.locator('.modal-card input').nth(0).fill('e2e-member@radiotedu.com');
  await controllerPage.locator('.modal-card input[type="password"]').fill('e2e-member-password');
  await controllerPage.locator('.modal-card button[type="submit"]').click();
  await expect(controllerPage.locator('.device-card')).toContainText('E2E-ROOM');

  await searchInput.fill('E2E Song Beta');
  await searchInput.press('Enter');
  await controllerPage.locator('.search-result').filter({ hasText: 'E2E Song Beta' }).click();
  await expect(controllerPage.locator('.queue-item').filter({ hasText: 'E2E Song Beta' })).toBeVisible();

  await controllerPage.locator('.queue-item').filter({ hasText: 'E2E Song Beta' }).locator('button[title="Upvote"]').click();
  await controllerPage.locator('.sync-button').click();
  await expect(controllerPage.locator('.queue-item').first()).toContainText('E2E Song Beta');

  await expect(kioskPage.getByText('E2E Song Beta')).toBeVisible({ timeout: 10_000 });

  await controllerContext.close();
  await kioskContext.close();
});
