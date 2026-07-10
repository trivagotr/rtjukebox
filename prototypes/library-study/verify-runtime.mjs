import fs from 'node:fs';
import {chromium} from 'playwright';

const URL = process.env.LIBRARY_STUDY_URL ?? 'http://127.0.0.1:4179/';
const VIEWPORT = {width: 390, height: 844};
const DESKTOP_VIEWPORT = {width: 1280, height: 900};
const AUDIT_OUT = 'C:/Users/akgul/AppData/Local/Temp/library-study-runtime-audit.json';
const SCREENSHOT_OUT = 'C:/Users/akgul/Downloads/rtjukebox/prototypes/library-study/screenshots';

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const clickScenePercent = async (page, x, y) => {
  const target = await page.evaluate((point) => {
    const scene = document.querySelector('.phone-scene').getBoundingClientRect();
    const scenePoint = window.libraryPathing?.mapToScenePoint
      ? window.libraryPathing.mapToScenePoint(point)
      : point;
    return {
      x: scene.left + (scene.width * scenePoint.x) / 100,
      y: scene.top + (scene.height * scenePoint.y) / 100,
    };
  }, {x, y});
  await page.mouse.click(target.x, target.y);
};

const clickImagePixel = async (page, x, y) => {
  const target = await page.evaluate((point) => {
    const scene = document.querySelector('.phone-scene').getBoundingClientRect();
    const mapPoint = window.libraryPathing.imagePixelToMapPercent(point);
    const scenePoint = window.libraryPathing.mapToScenePoint(mapPoint);
    return {
      x: scene.left + (scene.width * scenePoint.x) / 100,
      y: scene.top + (scene.height * scenePoint.y) / 100,
    };
  }, {x, y});
  await page.mouse.click(target.x, target.y);
};

const clickSeatHotspot = async (page, seatId) => {
  await page.evaluate((targetSeatId) => {
    const hotspot = document.querySelector(`.seat-hotspot[data-seat="${targetSeatId}"]`);
    if (!hotspot) {
      throw new Error(`missing seat hotspot ${targetSeatId}`);
    }
    hotspot.dispatchEvent(new MouseEvent('click', {bubbles: true, cancelable: true}));
  }, seatId);
};

const avatarState = async (page) => page.evaluate(() => {
  const avatar = document.querySelector('.student-avatar');
  const style = getComputedStyle(avatar);
  return {
    className: avatar.className,
    posture: avatar.dataset.posture,
    seatFacing: avatar.dataset.seatFacing || '',
    sitPose: avatar.dataset.sitPose || '',
    visualPose: avatar.dataset.visualPose || '',
    visualHidden: avatar.dataset.visualHidden || '',
    left: window.libraryAvatarState?.x ?? Number.parseFloat(avatar.style.left || 'NaN'),
    top: window.libraryAvatarState?.y ?? Number.parseFloat(avatar.style.top || 'NaN'),
    sceneLeft: Number.parseFloat(avatar.style.left || 'NaN'),
    sceneTop: Number.parseFloat(avatar.style.top || 'NaN'),
    cssWidth: Number.parseFloat(style.width || 'NaN'),
    cssHeight: Number.parseFloat(style.height || 'NaN'),
    backgroundImage: style.backgroundImage,
    duplicateChairElements: document.querySelectorAll('.chair-prop').length,
    chairPullObject: Boolean(document.querySelector('#chairPullObject')),
    seatStateVisible: !document.querySelector('#seatStateLayer')?.hidden,
    seatStateImage: document.querySelector('#seatStateLayer .seat-state-crop')?.getAttribute('src') || '',
    seatStateMarker: document.querySelector('#seatStateLayer .seat-occupancy-marker')?.dataset.state || '',
    seatStateMarkerAction: document.querySelector('#seatStateLayer .seat-occupancy-marker')?.dataset.action || '',
    seatStatePortrait: document.querySelector('#seatStateLayer .seat-occupancy-portrait')?.textContent || '',
    occluderVisible: !document.querySelector('#seatOccluder')?.hidden,
    occluderZ: Number(getComputedStyle(document.querySelector('#seatOccluder')).zIndex),
    avatarZ: Number(style.zIndex),
  };
});

const waitForSeatedAt = async (page, x, y) => {
  await page.waitForFunction(
    ([expectedX, expectedY]) => {
      const avatar = document.querySelector('.student-avatar');
      return avatar?.classList.contains('studying')
        && avatar?.dataset.posture === 'sit'
        && Math.hypot(
          (window.libraryAvatarState?.x ?? Number.parseFloat(avatar.style.left || 'NaN')) - expectedX,
          (window.libraryAvatarState?.y ?? Number.parseFloat(avatar.style.top || 'NaN')) - expectedY
        ) < 0.45;
    },
    [x, y],
    {timeout: 12000}
  );
};

const setupRecorder = async (page, eventStoreName) => {
  await page.evaluate((storeName) => {
    const avatar = document.querySelector('.student-avatar');
    window[storeName] = [];
    const record = (label) => {
      const style = getComputedStyle(avatar);
      window[storeName].push({
        label,
        t: Math.round(performance.now()),
        className: avatar.className,
        posture: avatar.dataset.posture,
        seatFacing: avatar.dataset.seatFacing || '',
        sitPose: avatar.dataset.sitPose || '',
        visualPose: avatar.dataset.visualPose || '',
        visualHidden: avatar.dataset.visualHidden || '',
        left: window.libraryAvatarState?.x ?? Number.parseFloat(avatar.style.left || 'NaN'),
        top: window.libraryAvatarState?.y ?? Number.parseFloat(avatar.style.top || 'NaN'),
        sceneLeft: Number.parseFloat(avatar.style.left || 'NaN'),
        sceneTop: Number.parseFloat(avatar.style.top || 'NaN'),
        backgroundImage: style.backgroundImage,
      });
    };
    record('initial');
    new MutationObserver(() => record('mutation')).observe(
      avatar,
      {attributes: true, attributeFilter: ['class', 'style', 'data-posture', 'data-seat-facing', 'data-sit-pose', 'data-visual-pose', 'data-visual-hidden']}
    );
  }, eventStoreName);
};

const readEvents = async (page, eventStoreName) => page.evaluate((storeName) => window[storeName] ?? [], eventStoreName);

const auditRouteShape = async (page) => {
  const routeAudit = await page.evaluate(() => {
    const results = [];
    for (const source of CHAIR_SEAT_TARGETS) {
      for (const destination of CHAIR_SEAT_TARGETS) {
        if (source.seatId === destination.seatId) continue;
        const sourceTarget = buildSeatTarget(source);
        const destinationTarget = buildSeatTarget(destination);
        const sourceStandTileId = getTargetRouteTileId(sourceTarget);
        const destinationStandTileId = getTargetRouteTileId(destinationTarget);
        const sourceStand = tilePoint(sourceStandTileId);
        avatarState.x = sourceStand.x;
        avatarState.y = sourceStand.y;
        avatarState.tileId = sourceStandTileId;
        const route = buildRoute(destinationTarget);
        const path = [sourceStand, ...route];
        const final = route.at(-1);
        const length = getRouteDistance(path);
        const straight = distance(path[0], path[path.length - 1]);
        results.push({
          source: source.seatId,
          destination: destination.seatId,
          sourceTileId: sourceStandTileId,
          points: route.length,
          endpointTileId: final?.tileId || '',
          expectedTileId: destinationStandTileId,
          detourRatio: Number((length / Math.max(1, straight)).toFixed(2)),
          maxStep: Number(Math.max(...path.slice(1).map((point, index) => distance(path[index], point))).toFixed(2)),
          touchesSitPoint: route.some((point) => distance(point, {x: destinationTarget.sitX, y: destinationTarget.sitY}) < 0.6),
          touchesBlockedZone: route.some((point) => !window.libraryPathing.isImagePixelWalkable(window.libraryPathing.mapPercentToImagePixel(point))),
          leavesPixelMask: path.slice(1).some((point, index) => !segmentStaysOnWalkableFloor(path[index], point)),
        });
      }
    }
    return results;
  });

  const failures = routeAudit.filter((route) => (
    !(
      route.endpointTileId === route.expectedTileId
      || (route.points === 0 && route.sourceTileId === route.expectedTileId)
    )
    || route.touchesBlockedZone
    || route.leavesPixelMask
    || route.maxStep > 30
  ));
  assert(failures.length === 0, `chair-to-chair route audit failed: ${failures.map((route) => `${route.source}->${route.destination}`).join(', ')}`);
  return {
    pairs: routeAudit.length,
    worstDetour: [...routeAudit].sort((a, b) => b.detourRatio - a.detourRatio)[0],
    worstStep: [...routeAudit].sort((a, b) => b.maxStep - a.maxStep)[0],
  };
};

const auditChairFinalStates = async (browser, viewportName = 'mobile', viewport = VIEWPORT) => {
  fs.mkdirSync(SCREENSHOT_OUT, {recursive: true});
  const registryPage = await browser.newPage({viewport, deviceScaleFactor: 2});
  await registryPage.goto(URL, {waitUntil: 'domcontentloaded', timeout: 15000});
  const targets = await registryPage.evaluate(() => window.librarySeating.getSeatTargets().map((target) => ({
    label: target.seatId,
    x: target.sitX,
    y: target.sitY,
    pose: target.sitPose,
    visualPose: target.visualPose,
    image: null,
    width: 1,
    height: 1,
    visualHidden: 'true',
    seatStateImage: '',
    seatStateVisible: true,
    seatStateMarker: 'occupied',
    seatStateMarkerAction: 'occupy-seat',
    occluderVisible: false,
  })));
  await registryPage.close();
  const results = [];
  for (const target of targets) {
    const page = await browser.newPage({viewport, deviceScaleFactor: 2});
    await page.goto(URL, {waitUntil: 'domcontentloaded', timeout: 15000});
    await page.evaluate((seatId) => {
      const hotspot = document.querySelector(`.seat-hotspot[data-seat="${seatId}"]`);
      if (!hotspot) {
        throw new Error(`missing seat hotspot ${seatId}`);
      }
      hotspot.dispatchEvent(new MouseEvent('click', {bubbles: true, cancelable: true}));
    }, target.label);
    try {
      await waitForSeatedAt(page, target.x, target.y);
    } catch (error) {
      throw new Error(`timed out waiting for ${viewportName} seat ${target.label} at ${target.x},${target.y}: ${error.message}`);
    }
    const state = await avatarState(page);
    const slot = await page.$(`#seatStateLayer .seat-state-slot[data-seat-id="${target.label}"]`);
    assert(Boolean(slot), `seat state slot must render for ${target.label}`);
    const slotBox = await slot.boundingBox();
    assert(Boolean(slotBox), `seat state slot bounds must be available for ${target.label}`);
    const clip = {
      x: Math.max(0, slotBox.x - 10),
      y: Math.max(0, slotBox.y - 10),
      width: slotBox.width + 20,
      height: slotBox.height + 20,
    };
    await page.screenshot({
      path: `${SCREENSHOT_OUT}/seat-final-state-${viewportName}-${target.label}.png`,
      clip,
    });
    if (viewportName === 'mobile') {
      await page.screenshot({
        path: `${SCREENSHOT_OUT}/seat-final-state-${target.label}.png`,
        clip,
      });
    }
    results.push({
      target: target.label,
      viewport: viewportName,
      expectedPose: target.pose,
      expectedVisualPose: target.visualPose,
      expectedImage: target.image,
      expectedWidth: target.width,
      expectedHeight: target.height,
      expectedVisualHidden: target.visualHidden,
      expectedSeatStateImage: target.seatStateImage ?? '',
      expectedSeatStateVisible: target.seatStateVisible ?? false,
      expectedSeatStateMarker: target.seatStateMarker,
      expectedSeatStateMarkerAction: target.seatStateMarkerAction,
      expectedOccluderVisible: target.occluderVisible,
      ...state,
    });
    await page.close();
  }

  const failures = results.filter((state) => (
    state.posture !== 'sit'
    || !state.className.includes('studying')
    || state.sitPose !== state.expectedPose
    || state.visualPose !== state.expectedVisualPose
    || state.visualHidden !== state.expectedVisualHidden
    || (state.expectedImage ? !state.backgroundImage.includes(state.expectedImage) : state.backgroundImage !== 'none')
    || state.seatStateVisible !== state.expectedSeatStateVisible
    || (state.expectedSeatStateImage ? !state.seatStateImage.includes(state.expectedSeatStateImage) : state.seatStateImage !== '')
    || state.seatStateMarker !== state.expectedSeatStateMarker
    || state.seatStateMarkerAction !== state.expectedSeatStateMarkerAction
    || state.seatStatePortrait.length === 0
    || Math.abs(state.cssWidth - state.expectedWidth) > 0.2
    || Math.abs(state.cssHeight - state.expectedHeight) > 0.2
    || state.occluderVisible !== state.expectedOccluderVisible
    || (state.expectedOccluderVisible && state.occluderZ <= state.avatarZ)
    || state.duplicateChairElements !== 0
    || state.chairPullObject
  ));
  assert(failures.length === 0, `chair final-state audit failed: ${failures.map((state) => state.target).join(', ')}`);
  return results.map((state) => ({
    target: state.target,
    viewport: state.viewport,
    posture: state.posture,
    sitPose: state.sitPose,
    visualPose: state.visualPose,
    visualHidden: state.visualHidden,
    seatStateImage: state.seatStateImage,
    seatStateMarker: state.seatStateMarker,
    seatStatePortrait: state.seatStatePortrait,
    image: state.expectedImage,
  }));
};

const auditNoScriptedClassmates = async (page) => {
  await page.goto(URL, {waitUntil: 'domcontentloaded', timeout: 15000});
  const results = await page.evaluate(() => {
    const pageText = document.body.textContent;
    return {
      scriptedStudents: window.scriptedStudents?.length ?? 0,
      classmateElements: document.querySelectorAll('.scripted-student').length,
      floatingLabels: [...document.querySelectorAll('.student-count')].map((element) => element.textContent),
      seededNamesPresent: /Selin|Mert|Ayca/.test(pageText),
      playerCount: document.querySelector('#playerCount')?.textContent ?? '',
    };
  });

  assert(results.scriptedStudents === 0, 'scripted classmate data must be empty');
  assert(results.classmateElements === 0, 'scripted classmate DOM must be removed');
  assert(results.floatingLabels.length === 0, 'fake classmate floating labels must be removed');
  assert(!results.seededNamesPresent, 'fake classmate names must not render in room UI');
  assert(results.playerCount === '1', `online count must only include the current user, got ${results.playerCount}`);
  return results;
};

const auditSeatHotspots = async (page) => {
  await page.goto(URL, {waitUntil: 'domcontentloaded', timeout: 15000});
  const hotspotTargets = await page.evaluate(() => [...document.querySelectorAll('.seat-hotspot')].map((button) => {
    const rect = button.getBoundingClientRect();
    return {
      seatId: button.dataset.seat,
      sitX: Number(button.dataset.sitX),
      sitY: Number(button.dataset.sitY),
      clickX: rect.left + rect.width / 2,
      clickY: rect.top + rect.height / 2,
    };
  }));

  const results = [];
  for (const target of hotspotTargets) {
    await page.goto(URL, {waitUntil: 'domcontentloaded', timeout: 15000});
    await page.evaluate((seatId) => {
      const hotspot = document.querySelector(`.seat-hotspot[data-seat="${seatId}"]`);
      if (!hotspot) {
        throw new Error(`missing seat hotspot ${seatId}`);
      }
      hotspot.dispatchEvent(new MouseEvent('click', {bubbles: true, cancelable: true}));
    }, target.seatId);
    try {
      await waitForSeatedAt(page, target.sitX, target.sitY);
    } catch (error) {
      throw new Error(`seat hotspot audit timed out for ${target.seatId}: ${error.message}`);
    }
    results.push({target, state: await avatarState(page)});
  }

  const failures = results.filter(({target, state}) => (
    state.posture !== 'sit'
    || Math.hypot(state.left - target.sitX, state.top - target.sitY) > 0.45
    || state.duplicateChairElements !== 0
    || state.chairPullObject
  ));
  assert(failures.length === 0, `seat hotspot audit failed: ${failures.map(({target}) => target.seatId).join(', ')}`);
  return results.map(({target, state}) => ({
    seatId: target.seatId,
    posture: state.posture,
    sitPose: state.sitPose,
  }));
};

const auditStaticSitAndFloorWalk = async (page) => {
  await page.goto(URL, {waitUntil: 'domcontentloaded', timeout: 15000});
  await setupRecorder(page, '__sitFloorEvents');
  await clickSeatHotspot(page, 'front-left');
  await waitForSeatedAt(page, 46.2, 29.5);
  await clickScenePercent(page, 45, 39);
  await page.waitForFunction(() => {
    const avatar = document.querySelector('.student-avatar');
    const state = window.libraryAvatarState;
    return avatar?.classList.contains('idle')
      && avatar?.dataset.posture === 'std'
      && !state?.isSeated
      && state?.activeSeatId === ''
      && !state?.tileId?.startsWith('seat-')
      && window.libraryPathing.isImagePixelWalkable(window.libraryPathing.mapPercentToImagePixel({x: state.x, y: state.y}))
      && window.libraryPathing.isImagePixelStandingSafe(window.libraryPathing.mapPercentToImagePixel({x: state.x, y: state.y}));
  }, null, {timeout: 12000});

  const events = await readEvents(page, '__sitFloorEvents');
  const checks = {
    usedWalkPosture: events.some((event) => event.className.includes('walking') && event.posture === 'mv'),
    neverUsedSitDownClass: events.every((event) => !event.className.includes('sitting-down')),
    neverUsedStandUpClass: events.every((event) => !event.className.includes('standing-up')),
    seatedUsedStaticSprite: events.some((event) => event.posture === 'sit' && event.visualPose === 'hidden' && event.backgroundImage === 'none'),
  };
  const failures = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
  assert(failures.length === 0, `static sit/floor walk audit failed: ${failures.join(', ')}`);
  return checks;
};

const auditSeatChangeAction = async (page) => {
  await page.goto(URL, {waitUntil: 'domcontentloaded', timeout: 15000});
  await setupRecorder(page, '__seatChangeEvents');
  await clickSeatHotspot(page, 'front-desk');
  await waitForSeatedAt(page, 57.3, 40);
  await clickSeatHotspot(page, 'lamp-desk');
  await waitForSeatedAt(page, 33.5, 40.3);

  const events = await readEvents(page, '__seatChangeEvents');
  const final = await avatarState(page);
  const checks = {
    firstSeatStudied: events.some((event) => event.className.includes('studying') && Math.abs(event.left - 57.3) < 0.45 && Math.abs(event.top - 40) < 0.45),
    walkUsesMovePosture: events.some((event) => event.className.includes('walking') && event.posture === 'mv'),
    noSitDownClass: events.every((event) => !event.className.includes('sitting-down')),
    noStandUpClass: events.every((event) => !event.className.includes('standing-up')),
    finalLampDeskSit: final.posture === 'sit' && Math.hypot(final.left - 33.5, final.top - 40.3) < 0.45,
    finalUsesSeatLayer: final.visualHidden === 'true' && final.backgroundImage === 'none' && final.seatStateVisible,
    noDuplicateChair: final.duplicateChairElements === 0 && !final.chairPullObject,
  };
  const failures = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
  assert(failures.length === 0, `seat-change action audit failed: ${failures.join(', ')}`);
  return checks;
};

const auditDeskClickDoesNotSit = async (page) => {
  await page.goto(URL, {waitUntil: 'domcontentloaded', timeout: 15000});
  const floorPoint = {x: 73, y: 48};
  await clickScenePercent(page, floorPoint.x, floorPoint.y);
  await page.waitForFunction(() => {
    const state = window.libraryAvatarState;
    const avatar = document.querySelector('.student-avatar');
    return state?.mode === 'idle'
      && avatar?.dataset.posture === 'std'
      && !state.activeSeatId
      && !state.isSeated
      && !state.tileId?.startsWith('seat-')
      && !window.libraryPathing.isInsideBlockedZone({x: state.x, y: state.y})
      && window.libraryPathing.isImagePixelWalkable(window.libraryPathing.mapPercentToImagePixel({x: state.x, y: state.y}));
  }, null, {timeout: 12000});
  const state = await avatarState(page);
  assert(state.posture === 'std' && !state.className.includes('studying'), 'desk/table tap must remain a floor walk, not a sit action');
  return {
    posture: state.posture,
    activeSeatId: await page.evaluate(() => window.libraryAvatarState.activeSeatId),
    x: state.left,
    y: state.top,
  };
};

const auditTableTapAvoidsFurniture = async (page) => {
  await page.goto(URL, {waitUntil: 'domcontentloaded', timeout: 15000});
  const snapCheck = await page.evaluate(() => {
    const tablePixels = [
      {label: 'middle table wood', x: 392, y: 658},
      {label: 'middle table center', x: 300, y: 760},
      {label: 'lower table wood', x: 588, y: 896},
    ];
    return tablePixels.map((point) => {
      const standingTarget = window.libraryPathing.findNearestImageStandingPoint(point);
      return {
        ...point,
        clickedWalkable: window.libraryPathing.isImagePixelWalkable(point),
        standingTarget,
        standingSafe: window.libraryPathing.isImagePixelStandingSafe(standingTarget),
      };
    });
  });
  const unsafeSnap = snapCheck.filter((point) => point.clickedWalkable || !point.standingSafe);
  assert(
    unsafeSnap.length === 0,
    `table pixels must snap to standing-safe floor targets: ${unsafeSnap.map((point) => point.label).join(', ')}`
  );

  await clickImagePixel(page, 392, 658);
  await page.waitForFunction(() => {
    const state = window.libraryAvatarState;
    return state?.mode === 'idle'
      && state.activeSeatId === ''
      && !window.libraryPathing.isInsideBlockedZone({x: state.x, y: state.y})
      && window.libraryPathing.isImagePixelWalkable(window.libraryPathing.mapPercentToImagePixel({x: state.x, y: state.y}))
      && window.libraryPathing.isImagePixelStandingSafe(window.libraryPathing.mapPercentToImagePixel({x: state.x, y: state.y}));
  }, null, {timeout: 12000});
  const state = await page.evaluate(() => ({
    x: window.libraryAvatarState.x,
    y: window.libraryAvatarState.y,
    tileId: window.libraryAvatarState.tileId,
    activeSeatId: window.libraryAvatarState.activeSeatId,
    isBlocked: window.libraryPathing.isInsideBlockedZone({
      x: window.libraryAvatarState.x,
      y: window.libraryAvatarState.y,
    }),
    clearance: window.libraryPathing.getBlockedZoneClearance({
      x: window.libraryAvatarState.x,
      y: window.libraryAvatarState.y,
    }),
    pixelWalkable: window.libraryPathing.isImagePixelWalkable(window.libraryPathing.mapPercentToImagePixel({
      x: window.libraryAvatarState.x,
      y: window.libraryAvatarState.y,
    })),
    standingSafe: window.libraryPathing.isImagePixelStandingSafe(window.libraryPathing.mapPercentToImagePixel({
      x: window.libraryAvatarState.x,
      y: window.libraryAvatarState.y,
    })),
    visualClear: window.libraryPathing.avatarVisualClearsFurniture({
      x: window.libraryAvatarState.x,
      y: window.libraryAvatarState.y,
    }),
  }));
  assert(state.activeSeatId === '', 'table tap must not select a nearby chair seat');
  assert(!state.tileId.startsWith('seat-'), `table tap must not snap to a chair stand tile (${state.tileId})`);
  assert(state.pixelWalkable && state.standingSafe && !state.isBlocked, `table tap must resolve to a standing-safe source-image floor pixel, got ${state.tileId}`);
  return state;
};

const auditZoomedChairTap = async (page) => {
  await page.goto(URL, {waitUntil: 'domcontentloaded', timeout: 15000});
  await page.click('#zoomInButton');
  await page.click('#zoomInButton');
  const zoomState = await page.evaluate(() => ({
    zoom: window.libraryPathing.mapCamera.zoom,
    centerX: window.libraryPathing.mapCamera.centerX,
    centerY: window.libraryPathing.mapCamera.centerY,
  }));
  assert(zoomState.zoom > 1, 'zoom-in control must increase map zoom');

  await page.evaluate(() => {
    const hotspot = document.querySelector('.seat-hotspot[data-seat="lower-row"]');
    if (!hotspot) {
      throw new Error('missing lower-row hotspot');
    }
    hotspot.dispatchEvent(new MouseEvent('click', {bubbles: true, cancelable: true}));
  });
  await waitForSeatedAt(page, 55.4, 69.5);
  const seated = await avatarState(page);
  assert(seated.posture === 'sit' && seated.sitPose === 'front', 'zoomed chair tap must sit on the intended chair with the front-facing pose');
  const hudSafety = await page.evaluate(() => {
    const avatar = document.querySelector('.student-avatar');
    const hud = document.querySelector('.hud-layer');
    const chat = document.querySelector('.chat-panel');
    const bottomHud = document.querySelector('.bottom-hud');
    const avatarRect = avatar.getBoundingClientRect();
    const intersectArea = (rect) => {
      const x = Math.max(0, Math.min(avatarRect.right, rect.right) - Math.max(avatarRect.left, rect.left));
      const y = Math.max(0, Math.min(avatarRect.bottom, rect.bottom) - Math.max(avatarRect.top, rect.top));
      return x * y;
    };
    return {
      avatarZ: Number(getComputedStyle(avatar).zIndex),
      hudZ: Number(getComputedStyle(hud).zIndex),
      chatOverlap: intersectArea(chat.getBoundingClientRect()),
      bottomHudOverlap: intersectArea(bottomHud.getBoundingClientRect()),
    };
  });
  assert(hudSafety.hudZ > hudSafety.avatarZ, `HUD must render above avatar depth layer (${hudSafety.hudZ} <= ${hudSafety.avatarZ})`);
  assert(hudSafety.chatOverlap === 0 && hudSafety.bottomHudOverlap === 0, 'zoomed seated avatar must not overlap chat or bottom HUD');

  await clickScenePercent(page, 50, 58);
  await page.waitForFunction(() => {
    const state = window.libraryAvatarState;
    const avatar = document.querySelector('.student-avatar');
    return state?.mode === 'idle'
      && avatar?.dataset.posture === 'std'
      && !state.activeSeatId
      && !state.isSeated;
  }, null, {timeout: 12000});
  const floor = await avatarState(page);
  assert(floor.posture === 'std' && !floor.className.includes('studying'), 'zoomed desk tap must remain a floor walk, not a sit action');
  return {
    zoom: zoomState.zoom,
    seated: {x: seated.left, y: seated.top, posture: seated.posture},
    hudSafety,
    floor: {x: floor.left, y: floor.top, posture: floor.posture},
  };
};

const auditSeatedOutfitModel = async (page) => {
  await page.goto(URL, {waitUntil: 'domcontentloaded', timeout: 15000});
  await page.click('#closetToggle');
  await page.click('[data-clothing="radio"]');
  await clickSeatHotspot(page, 'lamp-desk');
  await waitForSeatedAt(page, 33.5, 40.3);
  const result = await page.evaluate(() => {
    const avatar = document.querySelector('.student-avatar');
    const rect = avatar.getBoundingClientRect();
    const style = getComputedStyle(avatar);
    const seatSlot = document.querySelector('#seatStateLayer .seat-state-slot[data-seat-id="lamp-desk"]');
    return {
      posture: avatar.dataset.posture,
      outfit: avatar.dataset.outfit,
      seatFacing: avatar.dataset.seatFacing,
      sitPose: avatar.dataset.sitPose,
      visualPose: avatar.dataset.visualPose,
      visualHidden: avatar.dataset.visualHidden,
      backgroundImage: style.backgroundImage,
      width: rect.width,
      height: rect.height,
      seatLayerVisible: !document.querySelector('#seatStateLayer')?.hidden,
      renderMode: seatSlot?.dataset.renderMode ?? '',
      markerAction: seatSlot?.querySelector('.seat-occupancy-marker')?.dataset.action ?? '',
      markerState: seatSlot?.querySelector('.seat-occupancy-marker')?.dataset.state ?? '',
      markerClothing: seatSlot?.querySelector('.seat-occupancy-marker')?.dataset.clothing ?? '',
      markerLabel: seatSlot?.querySelector('.seat-occupancy-label')?.textContent ?? '',
      visiblePixelParts: [...avatar.querySelectorAll('.pixel, .avatar-shadow')].filter((node) => getComputedStyle(node).display !== 'none').length,
    };
  });
  assert(result.posture === 'sit', 'seated outfit audit must end in sit posture');
  assert(result.sitPose === 'front', 'seated avatar must use the front-facing static pose at the lamp desk');
  assert(result.visualPose === 'front', 'lamp-desk must use the compact front sitting visual pose');
  assert(result.visualHidden === 'true' && result.backgroundImage === 'none', 'seated avatar must be represented by the seat layer instead of the walking sprite');
  assert(result.seatLayerVisible && result.renderMode === 'semantic-occupied-seat', 'lamp-desk must render through the semantic occupied seat slot');
  assert(result.markerAction === 'occupy-seat' && result.markerState === 'occupied', 'lamp-desk marker must expose semantic occupancy state');
  assert(result.markerClothing === 'radio-hoodie', 'selected RadioTEDU clothing must carry into the occupied marker state');
  assert(result.markerLabel.length > 0, 'occupied marker must render a compact label');
  assert(result.width <= 4 && result.height <= 4, 'hidden walking avatar must collapse while the seat layer owns seated rendering');
  assert(result.visiblePixelParts === 0, 'seated avatar must not render standing/walking pixel parts');
  return result;
};

const auditBreakAction = async (page) => {
  await page.goto(URL, {waitUntil: 'domcontentloaded', timeout: 15000});
  const initial = await page.evaluate(() => ({
    disabled: document.querySelector('#breakButton')?.disabled,
    active: document.querySelector('#breakScene')?.classList.contains('active'),
  }));
  assert(initial.disabled === false, 'break action must be available before a study seat is selected');
  assert(initial.active === false, 'break scene must start hidden');

  await page.click('#breakButton');
  await page.waitForFunction(() => document.querySelector('#breakScene')?.classList.contains('active'), null, {timeout: 3000});
  const active = await page.evaluate(() => ({
    title: document.querySelector('#sceneTitle')?.textContent ?? '',
    caption: document.querySelector('#sceneCaption')?.textContent ?? '',
    ariaHidden: document.querySelector('#breakScene')?.getAttribute('aria-hidden'),
    isSeated: window.libraryAvatarState?.isSeated,
    activeSeatId: window.libraryAvatarState?.activeSeatId,
  }));
  assert(active.title.includes('Çim') || active.title.includes('Cim'), 'break action must show the Cim Amfi title');
  assert(active.caption.includes('score is saved'), 'break action must keep the study-score save copy');
  assert(active.ariaHidden === 'false', 'break scene must be exposed while active');
  assert(active.isSeated === false && active.activeSeatId === '', 'break action must leave any seat before opening Cim Amfi');

  await page.click('#returnButton');
  await page.waitForFunction(() => !document.querySelector('#breakScene')?.classList.contains('active'), null, {timeout: 3000});
  const returned = await page.evaluate(() => ({
    disabled: document.querySelector('#breakButton')?.disabled,
    title: document.querySelector('#sceneTitle')?.textContent ?? '',
    ariaHidden: document.querySelector('#breakScene')?.getAttribute('aria-hidden'),
  }));
  assert(returned.disabled === false, 'break action must be available again after returning to the library');
  assert(returned.ariaHidden === 'true', 'break scene must be hidden after return');
  return {initial, active, returned};
};

const auditChat = async (page) => {
  await page.goto(URL, {waitUntil: 'domcontentloaded', timeout: 15000});
  await page.fill('#chatInput', 'A* route looks clean');
  await page.click('.chat-send');
  const result = await page.evaluate(() => ({
    inputValue: document.querySelector('#chatInput').value,
    text: document.querySelector('#chatLog').textContent,
    messageCount: document.querySelectorAll('#chatLog p').length,
  }));
  assert(result.inputValue === '', 'chat input must clear after send');
  assert(result.text.includes('A* route looks clean'), 'chat log must render the sent message');
  assert(result.messageCount === 1, 'chat log must only include the sent local message');
  assert(!/Selin|Mert|Ayca/.test(result.text), 'chat log must not include fake classmate messages');
  return result;
};

const auditAdjacentLayeredSeatOccupants = async (page) => {
  await page.goto(URL, {waitUntil: 'domcontentloaded', timeout: 15000});
  const result = await page.evaluate(() => {
    window.librarySeating.clearAllSeatOccupants();
    window.librarySeating.setSeatOccupant('front-desk', {
      userId: 'peer-1',
      displayName: 'Peer 1',
      outfit: {
        body: 'seated-front',
        skin: 'warm',
        hair: 'brown',
        clothing: 'radio-hoodie',
        hat: 'tedu-cap',
        accessory: 'none',
      },
    });
    window.librarySeating.setSeatOccupant('front-right', {
      userId: 'peer-2',
      displayName: 'Peer 2',
      outfit: {
        body: 'seated-front',
        skin: 'warm',
        hair: 'dark',
        clothing: 'classic-shirt',
        hat: 'none',
        accessory: 'book',
      },
    });
    const slots = [...document.querySelectorAll('.seat-state-slot')].map((slot) => ({
      seatId: slot.dataset.seatId,
      renderMode: slot.dataset.renderMode,
      markerAction: slot.querySelector('.seat-occupancy-marker')?.dataset.action || null,
      markerState: slot.querySelector('.seat-occupancy-marker')?.dataset.state || null,
      markerEntityId: slot.querySelector('.seat-occupancy-marker')?.dataset.entityId || null,
      portraitText: slot.querySelector('.seat-occupancy-portrait')?.textContent || '',
      labelText: slot.querySelector('.seat-occupancy-label')?.textContent || '',
    }));
    const foregroundSeatIds = [...document.querySelectorAll('.seat-state-foreground')].map((foreground) => foreground.dataset.seatId).sort();
    const occupantSnapshot = window.librarySeating.getSeatOccupants();
    occupantSnapshot['front-desk'].outfit.clothing = 'mutated-outside-state';
    const occupantAfterSnapshotMutation = window.librarySeating.getSeatOccupants()['front-desk'].outfit.clothing;
    const targetSnapshot = window.librarySeating.getSeatTargets();
    targetSnapshot[0].emptyVisualRef = 'mutated-outside-registry';
    const targetAfterSnapshotMutation = window.librarySeating.getSeatTargets()[0].emptyVisualRef;
    const backendStateSnapshot = window.librarySeating.getSeatStateSnapshot();
    backendStateSnapshot['front-desk'].occupant.outfit.clothing = 'mutated-backend-state';
    const backendStateAfterMutation = window.librarySeating.getSeatStateSnapshot()['front-desk'];
    const frontDeskTarget = window.librarySeating.getSeatTargets().find((target) => target.seatId === 'front-desk');
    const frontDeskLayerModel = window.librarySeating.buildSeatLayerModel('front-desk', {
      userId: 'direction-audit',
      outfit: {
        body: 'seated-front',
        skin: 'warm',
        hair: 'brown',
        clothing: 'radio-hoodie',
        hat: 'none',
        accessory: 'none',
      },
    });
    window.librarySeating.setSeatOccupant('lamp-desk', {
      userId: 'peer-1',
      displayName: 'Peer 1 moved',
      outfit: {
        body: 'seated-front',
        skin: 'warm',
        hair: 'brown',
        clothing: 'radio-hoodie',
        hat: 'tedu-cap',
        accessory: 'none',
      },
    });
    const afterSameUserMove = [...document.querySelectorAll('.seat-state-slot')].map((slot) => slot.dataset.seatId).sort();
    const foregroundAfterSameUserMove = [...document.querySelectorAll('.seat-state-foreground')].map((foreground) => foreground.dataset.seatId).sort();
    window.librarySeating.clearSeatOccupant('front-desk');
    const afterClear = [...document.querySelectorAll('.seat-state-slot')].map((slot) => slot.dataset.seatId);
    const foregroundAfterClear = [...document.querySelectorAll('.seat-state-foreground')].map((foreground) => foreground.dataset.seatId);
    window.librarySeating.clearAllSeatOccupants();
    return {
      slots,
      foregroundSeatIds,
      occupantAfterSnapshotMutation,
      targetAfterSnapshotMutation,
      backendStateAfterMutation,
      frontDeskTarget,
      frontDeskLayerModel,
      afterSameUserMove,
      foregroundAfterSameUserMove,
      afterClear,
      foregroundAfterClear,
    };
  });

  const seatIds = result.slots.map((slot) => slot.seatId).sort();
  assert(JSON.stringify(seatIds) === JSON.stringify(['front-desk', 'front-right']), 'two adjacent occupied seats must render as independent slots');
  assert(result.slots.every((slot) => slot.renderMode === 'semantic-occupied-seat'), 'occupied seats must render as semantic state indicators');
  assert(result.slots.every((slot) => slot.markerAction === 'occupy-seat' && slot.markerState === 'occupied'), 'each occupied seat marker must expose action and state metadata');
  assert(result.slots.every((slot) => slot.markerEntityId === slot.seatId), 'each occupied marker must be bound to its semantic seat entity');
  assert(result.slots.every((slot) => slot.portraitText.length > 0 && slot.labelText.length > 0), 'each occupied marker must render a compact portrait and name label');
  assert(JSON.stringify(result.foregroundSeatIds) === JSON.stringify([]), 'semantic occupied indicators must not rely on chair foreground sprite masking');
  assert(result.occupantAfterSnapshotMutation === 'radio-hoodie', 'seat occupant API must return snapshots that cannot mutate live seat state');
  assert(result.targetAfterSnapshotMutation.startsWith('library-habbo:'), 'seat target API must return snapshots that cannot mutate the registry');
  assert(result.backendStateAfterMutation.occupied === true, 'backend seat state snapshot must expose occupied seats');
  assert(result.backendStateAfterMutation.occupant.outfit.clothing === 'radio-hoodie', 'backend seat state snapshot must not mutate live occupant state');
  assert(result.backendStateAfterMutation.seat.facing === 'north', 'backend seat state snapshot must include seat direction metadata');
  assert(result.backendStateAfterMutation.seat.avatarAction === 'sit', 'backend seat state snapshot must expose seated avatar action metadata');
  assert(result.backendStateAfterMutation.seat.bodyDirection === 'east', 'front-desk seat must explicitly choose the right-facing body direction');
  assert(result.backendStateAfterMutation.seat.headDirection === 'east', 'front-desk seat must explicitly choose the right-facing head direction');
  assert(Number.isFinite(result.backendStateAfterMutation.seat.seatZ), 'backend seat state snapshot must expose seatZ metadata');
  assert(Number.isFinite(result.backendStateAfterMutation.seat.spriteOffset?.x) && Number.isFinite(result.backendStateAfterMutation.seat.spriteOffset?.y), 'backend seat state snapshot must expose seated sprite offset metadata');
  assert(result.backendStateAfterMutation.state === 'occupied', 'backend seat state snapshot must expose a stable state value');
  assert(result.frontDeskTarget.hitArea?.type === 'circle' && result.frontDeskTarget.hitArea.radius > 0, 'seat targets must expose a bounded click/tap hit area');
  assert(Number.isFinite(result.frontDeskTarget.zLayer?.occupiedBase) && result.frontDeskTarget.zLayer.foregroundOffset === 1, 'seat targets must expose deterministic z-layer rules for occupants and foreground masks');
  assert(result.frontDeskLayerModel.type === 'semantic-occupied-seat', 'front-desk renderer must use the semantic occupied-seat model');
  assert(result.frontDeskLayerModel.action === 'occupy-seat', 'front-desk renderer must expose the seat action contract');
  assert(result.slots.find((slot) => slot.seatId === 'front-desk')?.markerAction === 'occupy-seat', 'front-desk DOM must render the semantic occupied-seat action');
  assert(JSON.stringify(result.afterSameUserMove) === JSON.stringify(['front-right', 'lamp-desk']), 'moving one user to a new seat must clear only that user from the previous seat');
  assert(JSON.stringify(result.foregroundAfterSameUserMove) === JSON.stringify([]), 'moving one user must not create fragile foreground masks in semantic mode');
  assert(JSON.stringify(result.afterClear) === JSON.stringify(['front-right', 'lamp-desk']), 'clearing an already-empty old seat must leave occupied seats intact');
  assert(JSON.stringify(result.foregroundAfterClear) === JSON.stringify([]), 'semantic occupied seats must not depend on active foreground masks');
  return result;
};

const auditSceneLayerRegistry = async (page) => {
  await page.goto(URL, {waitUntil: 'domcontentloaded', timeout: 15000});
  const result = await page.evaluate(() => {
    const layers = window.librarySceneLayers.getLayers();
    const seatTargets = window.librarySeating.getSeatTargets();
    const snapshot = window.librarySceneLayers.getLayers();
    snapshot[0].source = 'mutated-room-art.png';
    return {
      source: window.librarySceneLayers.source,
      baseLayers: layers.filter((layer) => layer.type === 'base-artwork').length,
      furnitureLayers: layers.filter((layer) => layer.type === 'furniture-occluder').length,
      floorLayers: layers.filter((layer) => layer.type === 'floor').length,
      seatForegroundLayers: layers.filter((layer) => layer.type === 'seat-foreground').length,
      seatTargetCount: seatTargets.length,
      firstSourceAfterMutation: window.librarySceneLayers.getLayers()[0].source,
    };
  });

  assert(result.source.includes('library-habbo.png'), 'scene layer registry must preserve the generated library room artwork as source');
  assert(result.baseLayers === 1, 'scene layer registry must expose one preserved base artwork layer');
  assert(result.furnitureLayers > 0 && result.floorLayers > 0, 'scene layer registry must expose furniture and floor layers');
  assert(result.seatForegroundLayers === result.seatTargetCount, 'scene layer registry must expose one seat foreground layer per registered seat');
  assert(result.firstSourceAfterMutation.includes('library-habbo.png'), 'scene layer registry API must return snapshots that cannot mutate live layer metadata');
  return result;
};

const auditNavigationNodesStayOnOpenFloor = async (page) => {
  await page.goto(URL, {waitUntil: 'domcontentloaded', timeout: 15000});
  const unsafeNodes = await page.evaluate(() => window.libraryPathing.LIBRARY_HABBO_MAP_MASK.seatHotspots
    .map((seat) => ({
      tileId: `seat-${seat.seatId}-stand`,
      x: seat.walkTargetPx.x,
      y: seat.walkTargetPx.y,
      walkable: window.libraryPathing.isImagePixelWalkable(seat.walkTargetPx),
      blocked: window.libraryPathing.isInsideImagePixelBlocked(seat.walkTargetPx),
    }))
    .filter((node) => !node.walkable || node.blocked));

  assert(
    unsafeNodes.length === 0,
    `source-image seat walk targets must stay on open floor, unsafe: ${unsafeNodes
      .map((node) => `${node.tileId}@${node.x},${node.y}`)
      .join(', ')}`
  );
  return {checked: true};
};

const auditFloorRoutesReachRequestedAisles = async (page) => {
  await page.goto(URL, {waitUntil: 'domcontentloaded', timeout: 15000});
  const checks = [
    {label: 'right lounge aisle', x: 82, y: 45},
    {label: 'right lower lounge', x: 82, y: 57},
    {label: 'bottom right aisle', x: 70, y: 79},
    {label: 'entrance', x: 45, y: 92},
  ];
  const failures = await page.evaluate((routeChecks) => routeChecks.flatMap((check) => {
    const startPixel = window.libraryPathing.mapPercentToImagePixel({
      x: window.libraryAvatarState.x,
      y: window.libraryAvatarState.y,
    });
    const endPixel = window.libraryPathing.findNearestImageWalkablePoint(
      window.libraryPathing.mapPercentToImagePixel(check)
    );
    const points = window.libraryPathing.findImagePixelRoute(startPixel, endPixel);
    const routeFailures = [];
    points.forEach((point) => {
      if (!window.libraryPathing.isImagePixelWalkable(point)) {
        routeFailures.push(`${check.label}: unsafe pixel ${point.x},${point.y}`);
      }
    });
    for (let index = 1; index < points.length; index += 1) {
      const midpoint = {
        x: (points[index - 1].x + points[index].x) / 2,
        y: (points[index - 1].y + points[index].y) / 2,
      };
      if (!window.libraryPathing.isImagePixelWalkable(midpoint)) {
        routeFailures.push(`${check.label}: segment midpoint hits furniture ${points[index - 1].x},${points[index - 1].y}->${points[index].x},${points[index].y}`);
      }
    }
    return routeFailures;
  }), checks);

  assert(failures.length === 0, `floor routes must reach requested open aisles: ${failures.join('; ')}`);
  return {checked: checks.length};
};

let browser;
try {
  browser = await chromium.launch({headless: true});
  const page = await browser.newPage({viewport: VIEWPORT, deviceScaleFactor: 2});
  await page.goto(URL, {waitUntil: 'domcontentloaded', timeout: 15000});
  const runAudit = async (name, action) => {
    console.log(`audit ${name} started`);
    const result = await action();
    console.log(`audit ${name} passed`);
    return result;
  };

  const report = {
    url: URL,
    routeShape: await runAudit('routeShape', () => auditRouteShape(page)),
    chairFinalStates: {
      mobile: await runAudit('chairFinalStates-mobile', () => auditChairFinalStates(browser, 'mobile', VIEWPORT)),
      desktop: await runAudit('chairFinalStates-desktop', () => auditChairFinalStates(browser, 'desktop', DESKTOP_VIEWPORT)),
    },
    noScriptedClassmates: await runAudit('noScriptedClassmates', () => auditNoScriptedClassmates(page)),
    seatHotspots: await runAudit('seatHotspots', () => auditSeatHotspots(page)),
    staticSitAndFloorWalk: await runAudit('staticSitAndFloorWalk', () => auditStaticSitAndFloorWalk(page)),
    seatChangeAction: await runAudit('seatChangeAction', () => auditSeatChangeAction(page)),
    deskClickDoesNotSit: await runAudit('deskClickDoesNotSit', () => auditDeskClickDoesNotSit(page)),
    tableTapAvoidsFurniture: await runAudit('tableTapAvoidsFurniture', () => auditTableTapAvoidsFurniture(page)),
    zoomedChairTap: await runAudit('zoomedChairTap', () => auditZoomedChairTap(page)),
    seatedOutfitModel: await runAudit('seatedOutfitModel', () => auditSeatedOutfitModel(page)),
    adjacentLayeredSeatOccupants: await runAudit('adjacentLayeredSeatOccupants', () => auditAdjacentLayeredSeatOccupants(page)),
    navigationNodesStayOnOpenFloor: await runAudit('navigationNodesStayOnOpenFloor', () => auditNavigationNodesStayOnOpenFloor(page)),
    floorRoutesReachRequestedAisles: await runAudit('floorRoutesReachRequestedAisles', () => auditFloorRoutesReachRequestedAisles(page)),
    sceneLayerRegistry: await runAudit('sceneLayerRegistry', () => auditSceneLayerRegistry(page)),
    breakAction: await runAudit('breakAction', () => auditBreakAction(page)),
    chat: await runAudit('chat', () => auditChat(page)),
  };
  fs.writeFileSync(AUDIT_OUT, JSON.stringify(report, null, 2));
  console.log(`library-study runtime audit passed (${AUDIT_OUT})`);
} finally {
  if (browser) {
    await browser.close();
  }
}
