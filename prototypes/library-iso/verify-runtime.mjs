import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { chromium } from 'playwright';

const PORT = 5175;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const SCREENSHOTS = [
  'screenshots/m5-initial.png',
  'screenshots/m5-walking-to-seat.png',
  'screenshots/m5-seated.png',
];

const viteBin = join(process.cwd(), 'node_modules', 'vite', 'bin', 'vite.js');
const server = spawn(process.execPath, [viteBin, '--host', '127.0.0.1', '--port', String(PORT)], {
  stdio: 'ignore',
  windowsHide: true,
});

try {
  await waitForServer(BASE_URL);

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__libraryIsoDebug?.sceneReady === true, null, { timeout: 10000 });
  await page.screenshot({ path: SCREENSHOTS[0], fullPage: true });

  const desk = await page.evaluate(() => window.__libraryIsoDebug.tileToScreen({ x: 5, y: 6 }));
  await page.mouse.click(desk.x, desk.y);
  await page.waitForTimeout(300);
  const blockerProof = await page.evaluate(() => ({
    rexDeskBlocker: window.__libraryIsoDebug.rexBlockers.find((tile) => tile.x === 5 && tile.y === 6),
    targetBlocked: window.__libraryIsoDebug.lastPathTargetBlocked,
    crossedBlocker: window.__libraryIsoDebug.lastPathCrossedBlocker,
    pathEndpoint: window.__libraryIsoDebug.lastPath?.at(-1) ?? null,
  }));
  assert(blockerProof.rexDeskBlocker?.hasBlocker === true, 'Rex Board does not report the desk tile as a blocker');
  assert(blockerProof.targetBlocked === true, 'Desk tile target was not rejected');
  assert(blockerProof.crossedBlocker === false, 'Path crossed a blocker tile');

  const chair = await page.evaluate(() => window.__libraryIsoDebug.tileToScreen({ x: 5, y: 5 }));
  await page.mouse.click(chair.x, chair.y);
  await page.waitForTimeout(700);
  await page.screenshot({ path: SCREENSHOTS[1], fullPage: true });
  await page.waitForFunction(() => {
    const debug = window.__libraryIsoDebug;
    return debug?.avatar?.pose === 'sit' && debug.avatar.seatId === 'front-left' && debug.isSeated === true;
  }, null, { timeout: 12000 });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: SCREENSHOTS[2], fullPage: true });

  const seated = await page.evaluate(() => ({
    avatar: window.__libraryIsoDebug.avatar,
    isSeated: window.__libraryIsoDebug.isSeated,
    studySeconds: window.__libraryIsoDebug.studySeconds,
  }));
  assert(seated.avatar.tile.x === 5 && seated.avatar.tile.y === 5, 'Avatar did not occupy the seat tile');
  assert(seated.avatar.pose === 'sit' && seated.avatar.seatId === 'front-left', 'Avatar did not enter seated pose');
  assert(seated.studySeconds >= 1, 'Study timer did not start after sitting');

  const floor = await page.evaluate(() => window.__libraryIsoDebug.tileToScreen({ x: 3, y: 5 }));
  await page.mouse.click(floor.x, floor.y);
  await page.waitForFunction(() => {
    const debug = window.__libraryIsoDebug;
    return debug?.avatar?.pose !== 'sit' && debug.avatar?.seatId === null;
  }, null, { timeout: 8000 });
  const stood = await page.evaluate(() => ({
    avatar: window.__libraryIsoDebug.avatar,
    isSeated: window.__libraryIsoDebug.isSeated,
    path: window.__libraryIsoDebug.lastPath,
  }));
  assert(stood.isSeated === false && stood.avatar.seatId === null, 'Floor tap did not stand up from seat');

  await browser.close();
  if (errors.length > 0) {
    throw new Error(`Browser page errors: ${errors.join('; ')}`);
  }

  console.log('runtime verification passed');
  console.log(`blocker proof: ${JSON.stringify(blockerProof)}`);
  console.log(`seated proof: ${JSON.stringify(seated)}`);
  console.log(`stand proof: ${JSON.stringify(stood)}`);
  console.log(`screenshots: ${SCREENSHOTS.join(', ')}`);
} finally {
  server.kill();
}

async function waitForServer(url) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}
