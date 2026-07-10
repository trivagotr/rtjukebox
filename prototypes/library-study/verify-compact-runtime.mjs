import {chromium} from 'playwright';

const URL = process.env.LIBRARY_STUDY_URL ?? 'http://127.0.0.1:4177/';
const VIEWPORT = {width: 402, height: 168};

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const rectFor = async (page, selector) => page.evaluate((targetSelector) => {
  const element = document.querySelector(targetSelector);
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  return {left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height};
}, selector);

const overlapArea = (a, b) => {
  const width = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
  const height = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  return width * height;
};

let browser;
try {
  browser = await chromium.launch({headless: true});
  const page = await browser.newPage({viewport: VIEWPORT, deviceScaleFactor: 2});
  await page.goto(URL, {waitUntil: 'networkidle', timeout: 15000});

  const scene = await rectFor(page, '.phone-scene');
  const avatar = await rectFor(page, '.student-avatar');
  const chat = await rectFor(page, '.chat-panel');
  const bottomHud = await rectFor(page, '.bottom-hud');
  assert(scene && avatar && chat && bottomHud, 'compact audit requires scene, avatar, chat, and HUD');

  const art = await page.evaluate(() => {
    const sceneArt = document.querySelector('.scene-art');
    const style = getComputedStyle(sceneArt);
    return {
      backgroundImage: style.backgroundImage,
      backgroundSize: style.backgroundSize,
      backgroundPosition: style.backgroundPosition,
    };
  });
  assert(art.backgroundImage.includes('library-habbo.png'), 'compact viewport must show the Library artwork');
  assert(overlapArea(chat, bottomHud) === 0, 'compact HUD panels must not overlap each other');
  assert(avatar.top >= scene.top + 4 && avatar.bottom <= scene.bottom - 4, `avatar must be visible in compact scene, got ${JSON.stringify(avatar)}`);
  assert(overlapArea(avatar, chat) === 0 && overlapArea(avatar, bottomHud) === 0, 'compact avatar must not sit underneath HUD panels');

  const before = await page.evaluate(() => ({...window.libraryAvatarState}));
  const clickPoint = await page.evaluate(() => {
    const start = window.libraryAvatarState;
    for (let y = 56; y <= 110; y += 10) {
      for (let x = 24; x <= 360; x += 24) {
        const element = document.elementFromPoint(x, y);
        if (!element || element.closest('.hud-layer, .closet-toggle, .zoom-controls')) {
          continue;
        }
        const scene = document.querySelector('.phone-scene').getBoundingClientRect();
        const mapPoint = window.libraryPathing.sceneToMapPoint(
          ((x - scene.left) / scene.width) * 100,
          ((y - scene.top) / scene.height) * 100
        );
        if (Math.hypot(mapPoint.x - start.x, mapPoint.y - start.y) > 8) {
          return {x, y};
        }
      }
    }
    return null;
  });
  assert(clickPoint, 'compact viewport must leave a visible tappable scene area');
  await page.mouse.click(clickPoint.x, clickPoint.y);
  await page.waitForFunction(
    (start) => {
      const state = window.libraryAvatarState;
      return Math.hypot(state.x - start.x, state.y - start.y) > 0.5 || state.mode === 'walking';
    },
    before,
    {timeout: 3000}
  );

  const after = await page.evaluate(() => ({...window.libraryAvatarState}));
  console.log(JSON.stringify({status: 'compact runtime audit passed', art, before: {x: before.x, y: before.y}, after: {x: after.x, y: after.y}}, null, 2));
} finally {
  if (browser) {
    await browser.close();
  }
}
