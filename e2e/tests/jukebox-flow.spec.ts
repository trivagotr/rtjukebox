import { expect, test } from '@playwright/test';

const backendUrl = process.env.E2E_BACKEND_URL || 'http://127.0.0.1:3000';

async function searchForSong(page: import('@playwright/test').Page, title: string) {
  const searchResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname.endsWith('/api/v1/jukebox/songs')
      && response.request().method() === 'GET'
      && url.searchParams.get('search') === title;
  });
  const searchInput = page.locator('.search-panel input');
  await searchInput.fill(title);
  await searchInput.press('Enter');

  const response = await searchResponse;
  expect(response.ok()).toBeTruthy();
  const payload = await response.json();
  const song = payload.data.items.find((item: { title: string; source_type: string }) => (
    item.title === title && item.source_type === 'local'
  ));
  expect(song, `Expected a local catalog result for ${title}`).toBeTruthy();
  return song;
}

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

  const alpha = await searchForSong(controllerPage, 'E2E Song Alpha');
  const alphaQueueResponse = controllerPage.waitForResponse(
    (response) => response.url().endsWith('/api/v1/jukebox/queue') && response.request().method() === 'POST',
  );
  await controllerPage.locator('.search-result').filter({ hasText: 'E2E Song Alpha' }).click();
  const alphaResult = await alphaQueueResponse;
  expect(alphaResult.ok()).toBeTruthy();
  expect(alphaResult.request().postDataJSON()).toMatchObject({ song_id: alpha.id });
  await expect(controllerPage.locator('.queue-item').filter({ hasText: 'E2E Song Alpha' })).toBeVisible();

  const beta = await searchForSong(controllerPage, 'E2E Song Beta');
  expect(beta.id).not.toBe(alpha.id);
  const guestQueueResponse = controllerPage.waitForResponse(
    (response) => response.url().endsWith('/api/v1/jukebox/queue') && response.request().method() === 'POST',
  );
  await controllerPage.locator('.search-result').filter({ hasText: 'E2E Song Beta' }).click();
  const guestQueueResult = await guestQueueResponse;
  const guestQueueBody = await guestQueueResult.json();
  expect(guestQueueResult.request().postDataJSON()).toMatchObject({ song_id: beta.id });
  expect(guestQueueBody).toMatchObject({ code: 'GUEST_LIMIT_REACHED' });
  expect(guestQueueResult.status()).toBe(403);
  await expect(controllerPage.locator('.modal-screen')).toBeVisible();

  await controllerPage.locator('.modal-card input').nth(0).fill('e2e-member@radiotedu.com');
  await controllerPage.locator('.modal-card input[type="password"]').fill('e2e-member-password');
  await controllerPage.locator('.modal-card button[type="submit"]').click();
  await expect(controllerPage.locator('.device-card')).toContainText('E2E-ROOM');

  await searchForSong(controllerPage, 'E2E Song Beta');
  await controllerPage.locator('.search-result').filter({ hasText: 'E2E Song Beta' }).click();
  await expect(controllerPage.locator('.queue-item').filter({ hasText: 'E2E Song Beta' })).toBeVisible();

  await controllerPage.locator('.queue-item').filter({ hasText: 'E2E Song Beta' }).locator('button[title="Upvote"]').click();
  await controllerPage.locator('.sync-button').click();
  await expect(controllerPage.locator('.queue-item').first()).toContainText('E2E Song Beta');

  await expect(kioskPage.getByText('E2E Song Beta')).toBeVisible({ timeout: 10_000 });

  await controllerContext.close();
  await kioskContext.close();
});
