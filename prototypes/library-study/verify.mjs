import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const file = (name) => path.join(root, name);
const read = (name) => fs.readFileSync(file(name), 'utf8');
const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

for (const name of ['index.html', 'styles.css', 'app.js', 'verify-runtime.mjs']) {
  assert(fs.existsSync(file(name)), `${name} is missing`);
}

assert(fs.existsSync(file('data/mobile-study-spaces.json')), 'web prototype must include the exported mobile Study spaces contract');
assert(fs.existsSync(file('data/library-habbo-map-mask.json')), 'library pathing must use an original-image pixel mask JSON');

assert(fs.existsSync(file('assets/library-habbo.png')), 'generated Habbo-style Library image is missing');
assert(fs.existsSync(file('assets/chim-amfi-habbo.png')), 'generated Habbo-style Cim Amfi image is missing');
assert(fs.existsSync(file('assets/avatar-lpc/README.md')), 'LPC avatar spike must include local source/license notes');
assert(fs.existsSync(file('assets/avatar-radiotedu/README.md')), 'RadioTEDU seated avatar layers must include local source notes');
for (const avatarType of ['masc', 'fem']) {
  for (const outfit of ['classic', 'radio', 'night', 'break']) {
    assert(fs.existsSync(file(`assets/avatar-standing/avatar-${avatarType}-${outfit}.png`)), `standing avatar ${avatarType} ${outfit} sprite is missing`);
  }
}
for (const direction of ['north', 'south']) {
  for (const layer of ['body', 'skin', 'clothing', 'hair', 'hat']) {
    assert(fs.existsSync(file(`assets/avatar-lpc/seated/${direction}/${layer}.png`)), `LPC seated ${direction} ${layer} layer is missing`);
  }
  for (const clothing of ['classic-shirt', 'radio-hoodie', 'night-hoodie']) {
    assert(fs.existsSync(file(`assets/avatar-lpc/seated/${direction}/clothing-${clothing}.png`)), `LPC seated ${direction} ${clothing} clothing variant is missing`);
  }
}
for (const direction of ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west']) {
  for (const layer of ['body', 'skin', 'hair', 'hat']) {
    assert(fs.existsSync(file(`assets/avatar-radiotedu/seated/${direction}/${layer}.png`)), `RadioTEDU seated ${direction} ${layer} layer is missing`);
  }
  for (const clothing of ['classic-shirt', 'radio-hoodie', 'night-hoodie', 'break-shirt']) {
    assert(fs.existsSync(file(`assets/avatar-radiotedu/seated/${direction}/clothing-${clothing}.png`)), `RadioTEDU seated ${direction} ${clothing} clothing variant is missing`);
  }
}

const html = read('index.html');
const css = read('styles.css');
const js = read('app.js');
const runtimeVerifier = read('verify-runtime.mjs');
const mobileStudySpaces = JSON.parse(read('data/mobile-study-spaces.json'));
const libraryHabboMapMask = JSON.parse(read('data/library-habbo-map-mask.json'));
const combined = `${html}\n${css}\n${js}`;
const maskGridWalkable = (point) => {
  const grid = libraryHabboMapMask.walkableGrid;
  assert(grid && grid.resolutionPx > 0, 'library pathing must include a sampled walkable grid from the original room pixels');
  const column = Math.floor((point.x / grid.resolutionPx) + 0.5 + 1e-7);
  const row = Math.floor((point.y / grid.resolutionPx) + 0.5 + 1e-7);
  return grid.rows?.[row]?.[column] === '1';
};
const maskGridStandingSafe = (point) => [
  {x: 0, y: 0},
  {x: -8, y: -6},
  {x: 8, y: -6},
  {x: 0, y: -14},
  {x: 0, y: -26},
  {x: 0, y: -38},
  {x: 0, y: -50},
].every((offset) => maskGridWalkable({x: point.x + offset.x, y: point.y + offset.y}));

const extractAssigned = (source, name) => {
  const start = source.indexOf(`const ${name} = `);
  assert(start >= 0, `${name} assignment is missing`);
  const assignmentStart = source.indexOf('=', start) + 1;
  let cursor = assignmentStart;
  while (/\s/.test(source[cursor])) {
    cursor += 1;
  }

  const open = source[cursor];
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  let stringQuote = '';
  let escaped = false;

  for (; cursor < source.length; cursor += 1) {
    const character = source[cursor];
    if (stringQuote) {
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === stringQuote) {
        stringQuote = '';
      }
      continue;
    }

    if (character === '"' || character === "'" || character === '`') {
      stringQuote = character;
      continue;
    }

    if (character === open) {
      depth += 1;
    } else if (character === close) {
      depth -= 1;
      if (depth === 0) {
        return source.slice(assignmentStart, cursor + 1);
      }
    }
  }

  throw new Error(`${name} assignment is unterminated`);
};

const walkableTiles = Function(`return (${extractAssigned(js, 'WALKABLE_TILES')});`)();
const blockedDeskZones = Function(`return (${extractAssigned(js, 'BLOCKED_DESK_ZONES')});`)();
const chairSeatTargets = Function(`return (${extractAssigned(js, 'CHAIR_SEAT_TARGETS')});`)();
const seatedPoseImages = Function(`return (${extractAssigned(js, 'SEATED_POSE_IMAGES')});`)();
const blockedZoneById = new Map(blockedDeskZones.map((zone) => [zone.id, zone]));
const routeDistance = (from, to) => Math.hypot(from.x - to.x, from.y - to.y);
const pointInPolygon = (point, polygon) => {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const currentPoint = polygon[index];
    const previousPoint = polygon[previous];
    const intersects = (
      currentPoint.y > point.y
    ) !== (
      previousPoint.y > point.y
    ) && point.x < (
      (previousPoint.x - currentPoint.x) * (point.y - currentPoint.y)
    ) / (
      previousPoint.y - currentPoint.y
    ) + currentPoint.x;
    if (intersects) {
      inside = !inside;
    }
  }
  return inside;
};
const blockedZoneAt = (point) => blockedDeskZones.find((zone) => (
  Array.isArray(zone.points)
    ? pointInPolygon(point, zone.points)
    : point.x >= zone.x1 && point.x <= zone.x2 && point.y >= zone.y1 && point.y <= zone.y2
));
const segmentBlockedZone = (from, to) => {
  const steps = Math.max(8, Math.ceil(routeDistance(from, to) * 2));
  for (let index = 0; index <= steps; index += 1) {
    const progress = index / steps;
    const hit = blockedZoneAt({
      x: from.x + (to.x - from.x) * progress,
      y: from.y + (to.y - from.y) * progress,
    });
    if (hit) {
      return hit;
    }
  }
  return null;
};
const findRouteTiles = (startTileId, endTileId) => {
  const queue = [[startTileId]];
  const visited = new Set([startTileId]);
  while (queue.length) {
    const path = queue.shift();
    const last = path.at(-1);
    if (last === endTileId) {
      return path;
    }
    for (const neighbor of walkableTiles[last].neighbors) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push([...path, neighbor]);
      }
    }
  }
  return [];
};

assert(/viewport/.test(html), 'prototype must declare a mobile viewport');
assert(/class="phone-scene"/.test(html), 'prototype must render a phone-first scene shell');
assert(/dataset\.seat/.test(js), 'prototype must expose scene-native seat hotspots');
assert(/dataset\.sitX/.test(js), 'seat hotspots must expose chair-specific sit x positions');
assert(/dataset\.sitY/.test(js), 'seat hotspots must expose chair-specific sit y positions');
assert(/dataset\.sitPose/.test(js), 'seat hotspots must expose the front/forward seated pose');
assert(/class="student-avatar"/.test(html), 'prototype must include the controllable avatar');
assert(/class="avatar-sprite"/.test(html), 'walking avatar must use the preserved imagegen-style sprite layer');
assert(/id="seatStateLayer"/.test(html), 'prototype must include a seat state overlay layer for occupied chair crops');
assert(/id="seatOccluder"/.test(html), 'prototype must include an active chair foreground occlusion layer');
assert(/SCENE_LAYER_REGISTRY/.test(js), 'library room must define a scene layer registry for Habbo-like depth rendering');
assert(/librarySceneLayers/.test(js), 'runtime must expose scene layer metadata for room/seat render verification');
assert(/SEMANTIC_ROOM_MAP/.test(js), 'library room must define a WorkAdventure-style semantic room map');
assert(/libraryRoom/.test(js), 'runtime must expose semantic room metadata for room/entity verification');
assert(/MOBILE_STUDY_SPACES_SOURCE/.test(js), 'web prototype must declare the mobile Study spaces source file');
assert(/mobile-study-spaces\.json/.test(js), 'web prototype must wire to the exported mobile Study spaces contract');
assert(mobileStudySpaces.source === 'shared/social/socialSpaces.ts', 'mobile Study spaces export must name the shared social-space source of truth');
assert(mobileStudySpaces.generatedFrom === 'TEDU 360 rotated refs', 'mobile Study spaces export must document the TEDU 360 reference basis');
assert(!JSON.stringify(mobileStudySpaces).toLowerCase().includes('chillin'), 'mobile Study spaces export must not include Chillin references');
for (const id of ['chim-alan', 'grass-amphitheatre', 'library']) {
  assert(mobileStudySpaces.spaces.some((space) => space.id === id), `mobile Study spaces export must include ${id}`);
}
const chimAlanSpace = mobileStudySpaces.spaces.find((space) => space.id === 'chim-alan');
assert(chimAlanSpace.seatStrategy === 'seat-slots', 'Çim alan must use the shared seat-slot strategy');
assert(chimAlanSpace.references.length >= 4, 'Çim alan must carry multi-angle TEDU 360 references');
assert(/workadventure-style-semantic-bitmap/.test(js), 'room model must explicitly use the WorkAdventure-inspired semantic bitmap approach');
assert(/library-habbo\.png/.test(js), 'scene layer registry must preserve the generated library room artwork as its source image');
assert(chairSeatTargets.length >= 46, 'prototype must expose every real chair in the full library-habbo room, not only the cropped viewport chairs');
assert(chairSeatTargets.every((target) => typeof target.emptyVisualRef === 'string' && target.emptyVisualRef.startsWith('library-habbo:')), 'each chair target must declare the empty chair visual reference in the preserved room artwork');
const visibleSeatHotspots = [...html.matchAll(/class="seat-hotspot"[\s\S]*?data-seat="([^"]+)"/g)].map((match) => match[1]);
assert(/renderSeatHotspotsFromTargets/.test(js), 'seat hotspots must be generated from the complete chair target registry');
assert(/querySelectorAll\('\.seat-hotspot'\)\.forEach/.test(js), 'generated seat hotspot sync must remove stale hand-authored hotspots');
assert(/seats = \[\.\.\.document\.querySelectorAll\('\[data-seat\]'\)\]/.test(js), 'runtime seat list must be rebuilt after generated hotspots are inserted');
assert(visibleSeatHotspots.length === 0 || visibleSeatHotspots.length === chairSeatTargets.length, `hand-authored chair hotspots must either be absent or complete (${visibleSeatHotspots.length}/${chairSeatTargets.length})`);
assert(/data-layer="base"/.test(html), 'avatar must expose a base layer slot');
assert(/data-layer="hair"/.test(html), 'avatar must expose a hair layer slot');
assert(/data-layer="top"/.test(html), 'avatar must expose a shirt/hoodie layer slot');
assert(/data-layer="hat"/.test(html), 'avatar must expose a hat layer slot for gold cosmetics');
assert(/COSMETIC_CATALOG/.test(js), 'prototype must define a local gold cosmetic catalog');
assert(/avatarState[\s\S]*gold/.test(js), 'avatar state must track local gold for merch purchases');
assert(/equipCosmetic/.test(js), 'prototype must support equipping cosmetic layers');
assert(/id="goldBalance"/.test(html), 'closet drawer must show the local gold balance');
assert(/data-avatar-type="fem"/.test(html), 'avatar shop must include a female avatar type option');
assert(/data-avatar-type="masc"/.test(html), 'avatar shop must include a male avatar type option');
assert(/data-cosmetic="tedu-cap"/.test(html), 'shop must include a buyable TEDU cap cosmetic');
assert(/function buyCosmetic/.test(js), 'prototype must support gold purchases through a shop action');
assert(/function setAvatarType/.test(js), 'prototype must support switching avatar body type without changing the room');
assert(/window\.libraryShop/.test(js), 'runtime must expose a small merch shop API for backend integration');
assert(/STANDING_AVATAR_IMAGES/.test(js), 'walking avatar must use transparent avatar sprites, not the CSS stick figure');
assert(/avatar-standing\/avatar-masc-classic\.png/.test(js), 'walking avatar must use the standing sprite family instead of the rejected seated sprite');
assert(/avatar-standing\/avatar-fem-classic\.png/.test(js), 'walking avatar must include female standing sprites');
assert(!/STANDING_AVATAR_IMAGES[\s\S]*seated-models/.test(js), 'walking avatar must not use seated imagegen sprites as the standing character');
assert(/hitArea/.test(js), 'seat registry output must expose click/tap hit area metadata');
assert(/zLayer/.test(js), 'seat registry output must expose occupied-seat z-layer metadata');
assert(/findNearestChairTarget/.test(js), 'chair target registry must still support bounded chair lookup for diagnostics');
assert(/const SEAT_OCCUPANCY_STATE = new Map\(\)/.test(js), 'seat occupancy must be stored in a seatId-keyed Map');
assert(/target\.seatId !== avatarState\.activeSeatId/.test(js), 'the local seated avatar must not be hidden by its own occupancy record');
assert(/function buildSeatLayerModel\(seatTarget, occupant/.test(js), 'seat renderer must build a per-seat layer model');
assert(/function renderSeatStateLayers\(/.test(js), 'seat renderer must render all occupied seats, not one active crop');
assert(/window\.librarySeating =/.test(js), 'runtime tests need a small seating API for multi-user seat state');
assert(/getSeatTargets:/.test(js), 'runtime tests must be able to read every registered seat target');
assert(/getSeatStateSnapshot/.test(js), 'seating API must expose backend-ready seatId state snapshots');
assert(/data-seat-id/.test(js), 'rendered occupied seat slots must expose data-seat-id for verification');
assert(/semantic-occupied-seat/.test(js), 'occupied seats must render as semantic seat states, not fragile seated body sprites');
assert(/renderSemanticSeatSlot/.test(js), 'seat renderer must render WorkAdventure-style occupied seat indicators');
assert(/seat-occupancy-marker/.test(js), 'rendered occupied seats must expose a semantic occupancy marker');
assert(/seat-occupancy-portrait/.test(css), 'CSS must include a compact avatar portrait marker for occupied seats');
assert(/occupied-indicator/.test(js), 'semantic seat entities must declare occupied-indicator visual rules');
assert(/seat-final-state-\$\{viewportName\}-\$\{target\.label\}\.png/.test(runtimeVerifier), 'runtime verification must write viewport-specific crop screenshots for each audited seat final state');
assert(/window\.librarySeating\.getSeatTargets\(\)/.test(runtimeVerifier), 'runtime final-state audit must load all registered seat targets dynamically');
assert(/CHAIR_TAP_RADIUS/.test(js), 'chair target selection must use a bounded tap radius');
assert(!/chairPullObject/.test(html), 'prototype must not render chair-pull animation DOM');
assert(!/chair-pull-object/.test(html), 'prototype must not render a temporary duplicate chair object');
assert(!/data-chair-[xy]=/.test(html), 'seat hotspots must not define duplicate chair prop coordinates');
assert(!/class="chair-prop"/.test(html), 'prototype must not render duplicate chairs over the room art');
assert(/class="closet-drawer"/.test(html), 'prototype must include a hidden scene-native closet drawer');
assert(/data-clothing=/.test(html), 'prototype must expose clothing changes as scene-native items');
assert(/id="studyTimer"/.test(html), 'prototype must show a study timer');
assert(/id="breakButton"/.test(html), 'prototype must expose a break action');
assert(/class="hud-layer"/.test(html), 'prototype must use a non-blocking HUD overlay layer');
assert(/class="top-hud"/.test(html), 'prototype must use compact top HUD chips');
assert(/class="bottom-hud"/.test(html), 'prototype must use compact bottom HUD controls');
assert(/id="floatingCounts"/.test(html), 'HUD must show other people counts near the scene');
assert(/id="playerCount"/.test(html), 'game HUD must show other people counts');
assert(/id="leaderboardToggle"/.test(html), 'leaderboard must be opened from a small HUD button');
assert(/id="leaderboardPanel" hidden/.test(html), 'leaderboard must be collapsed by default so it does not block the game');
assert(/id="leaderboardList"/.test(html), 'game HUD must include a leaderboard list');
assert(/id="currentStreak"/.test(html), 'game HUD must show a counting streak');
assert(/id="chatLog"/.test(html), 'prototype must include a compact room chat log');
assert(/id="chatForm"/.test(html), 'prototype must include a room chat form');
assert(/id="chatInput"/.test(html), 'prototype must include a room chat input');
assert(/id="zoomInButton"/.test(html), 'prototype must include a map zoom-in control');
assert(/id="zoomOutButton"/.test(html), 'prototype must include a map zoom-out control');
assert(/id="mapDebugLayer"/.test(html), 'prototype must include a hidden room-model debug layer');
assert(/debugMap/.test(js), 'room model debug layer must be enabled with a debugMap query flag');
assert(/renderMapDebugOverlay/.test(js), 'prototype must render explicit chair, desk, and road debug geometry');
assert(/renderSeatStateOverlay/.test(js), 'sit state must render occupied furniture state overlays');
assert(/renderSemanticSeatSlot/.test(js), 'sit state must render semantic occupied indicators');
assert(!/class="game-hud"/.test(html), 'prototype must not use a large game-hud panel');
assert(!/class="score-grid"/.test(html), 'prototype must not use a panel-like score grid');
assert(/Break at C/.test(html) || /Break at Çim Amfi/.test(html), 'prototype must include the Cim Amfi break label');
assert(/requestAnimationFrame/.test(js), 'avatar movement must use requestAnimationFrame');
assert(/moveAvatarTo/.test(js), 'prototype must support avatar movement to scene targets');
assert(/POSTURE_CODES/.test(js), 'prototype must model Habbo-style avatar posture codes');
assert(/POSTURE_SIT|sit/.test(js), 'prototype must include a sit posture code');
assert(/setAvatarPosture/.test(js), 'avatar mode changes must update posture separately from CSS animation state');
assert(/semantic-occupied-seat/.test(js), 'seated state must use semantic occupied markers instead of full-body sprite fitting');
assert(/visual:\s*\{[\s\S]*type:\s*'occupied-indicator'/.test(js), 'semantic seat entities must use occupied-indicator visuals');
assert(/getSemanticSeatBounds/.test(js), 'occupied indicators must be positioned from semantic seat anchors');
assert(!/SEATED_AVATAR_MODELS/.test(js), 'sitting must not use the old multi-direction animation/model system');
const duplicateSitTargets = chairSeatTargets
  .map((target) => `${target.sitX.toFixed(1)}:${target.sitY.toFixed(1)}`)
  .filter((key, index, keys) => keys.indexOf(key) !== index);
assert(duplicateSitTargets.length === 0, `chair sit targets must be unique; duplicates: ${duplicateSitTargets.join(', ')}`);
const visibleSeatPoses = chairSeatTargets.map((target) => ({seatId: target.seatId, sitPose: target.sitPose}));
assert(visibleSeatPoses.length >= 46, 'visible seat hotspots must declare seated facing');
for (const seat of visibleSeatPoses) {
  assert(seat.sitPose === 'front', `${seat.seatId} must use the front-facing seated sprite, not a side/away pose`);
}
assert(/data-posture/.test(html) || /dataset\.posture/.test(js), 'avatar must expose its current posture for rendering and tests');
assert(/dataset\.sitPose/.test(js), 'sit posture must expose the two-state seated pose');
const frontLeftTarget = chairSeatTargets.find((target) => target.seatId === 'front-left');
assert(frontLeftTarget, 'front-left chair target must exist');
assert(
  routeDistance({x: frontLeftTarget.sitX, y: frontLeftTarget.sitY}, {x: 46.2, y: 29.5}) < 0.2,
  'front-left seated sprite must use the layered chair registration point, not the desk-end aisle'
);
assert(
  frontLeftTarget.sitY < frontLeftTarget.standY - 5,
  'front-left seated sprite must be visually above its stand point before the route settles'
);
assert(frontLeftTarget.visualPose === 'hidden', 'front-left must hide the failed seated sprite instead of showing a misleading pasted avatar');
assert(frontLeftTarget.visualWidth === 1 && frontLeftTarget.visualHeight === 1, 'front-left hidden visual must collapse to a non-visible footprint');
assert(frontLeftTarget.visualHidden === true, 'front-left must hide the separate seated avatar because the occupied chair crop owns the visible sitting state');
assert(!/front-left-full\.png/.test(js), 'front-left must not depend on the rejected full-scene occupied chair crop');
const frontDeskTarget = chairSeatTargets.find((target) => target.seatId === 'front-desk');
assert(frontDeskTarget, 'front-desk chair target must exist');
assert(/WALKABLE_TILES/.test(js), 'prototype must constrain avatar movement to named walkable tiles');
assert(/BLOCKED_DESK_ZONES/.test(js), 'prototype must define blocked desk/furniture zones');
assert(/isInsideBlockedZone/.test(js), 'prototype must detect blocked desk/furniture zones');
assert(/findRouteTiles/.test(js), 'prototype must route through tile neighbors like Habbo');
assert(/assertRouteAvoidsFurniture/.test(js), 'prototype must validate routes avoid furniture zones');
assert(!/const WALKABLE_PATH = \[/.test(js), 'prototype must not use a single diagonal walk path');
assert(!/const chairTarget = findNearestChairTarget\(mapPoint\.x, mapPoint\.y\)/.test(js), 'ordinary scene taps must not guess a nearby chair; only explicit seat hotspots may start studying');
assert(/findNearestWalkablePoint/.test(js), 'floor taps must snap to walkable points instead of desks');
assert(/FLOOR_TARGET_CLEARANCE/.test(js), 'floor taps must require clearance from desk/furniture polygons');
assert(/canUseTileAsFloorTarget/.test(js), 'floor taps must filter out chair stand tiles and unsafe furniture-adjacent nodes');
assert(/sceneToMapPixel/.test(js), 'floor taps must convert rendered clicks into original image pixels before pathing');
assert(/findNearestImageWalkablePoint/.test(js), 'floor taps must snap through the source-image pixel walkability mask');
assert(/isImagePixelWalkable/.test(js), 'floor routes must avoid pixel-masked furniture instead of guessed chair stand nodes');
assert(/function isImagePixelStandingSafe/.test(js), 'floor taps must validate that the standing avatar body stays on walkable source-image floor pixels');
assert(/function findNearestImageStandingPoint/.test(js), 'floor taps on tables must snap to a standing-safe aisle point, not only the nearest foot pixel');
assert(/findNearestImageStandingPoint\(mapPixel/.test(js), 'scene floor clicks must resolve through the standing-safe image-pixel target helper');
assert(/routeAvatarViaPath/.test(js), 'avatar must walk path segments instead of teleport/ease to arbitrary points');
assert(/moveAvatarAlongRoute/.test(js), 'avatar must walk the whole route continuously instead of pausing at every waypoint');
assert(/MAP_IMAGE_SIZE/.test(js), 'pathing must be modeled in source image coordinates, not cropped viewport coordinates');
assert(libraryHabboMapMask.imageWidth === 941 && libraryHabboMapMask.imageHeight === 1672, 'library pathing mask must use the original 941x1672 library-habbo image space');
assert(Array.isArray(libraryHabboMapMask.floorPolygons) && libraryHabboMapMask.floorPolygons.length >= 1, 'library pathing mask must define source-image floor polygons');
assert(Array.isArray(libraryHabboMapMask.blockedPolygons) && libraryHabboMapMask.blockedPolygons.length >= 20, 'library pathing mask must define source-image blocked polygons for desks, chairs, sofas, shelves, and boundaries');
assert(Array.isArray(libraryHabboMapMask.seatHotspots), 'library pathing mask must define source-image seat hotspots');
assert(libraryHabboMapMask.seatHotspots.length === chairSeatTargets.length, `library pathing mask must cover every registered chair (${libraryHabboMapMask.seatHotspots.length}/${chairSeatTargets.length})`);
assert(libraryHabboMapMask.walkableGrid?.source === 'library-habbo-floor-color-sample', 'library pathing must derive walkable cells from the original room artwork pixels');
assert(libraryHabboMapMask.walkableGrid?.imageWidth === 941 && libraryHabboMapMask.walkableGrid?.imageHeight === 1672, 'library pathing walkable grid must stay in original library-habbo pixel space');
assert(libraryHabboMapMask.walkableGrid?.resolutionPx <= 7, 'library pathing walkable grid must be precise enough to reject table-top taps');
assert(maskGridWalkable({x: 572, y: 430}), 'known open blue-carpet pixel must remain walkable');
assert(maskGridWalkable({x: 628, y: 458}), 'known open aisle pixel must remain walkable');
assert(!maskGridWalkable({x: 392, y: 658}), 'middle table wood pixel must not be walkable');
assert(!maskGridWalkable({x: 300, y: 760}), 'middle table center pixel must not be walkable');
assert(!maskGridWalkable({x: 588, y: 896}), 'lower table wood pixel must not be walkable');
const maskSeatIds = new Set(libraryHabboMapMask.seatHotspots.map((seat) => seat.seatId));
const maskBlockedAt = (point) => libraryHabboMapMask.blockedPolygons.some((zone) => pointInPolygon(point, zone.points));
const maskFloorAt = (point) => libraryHabboMapMask.floorPolygons.some((zone) => pointInPolygon(point, zone.points));
for (const target of chairSeatTargets) {
  assert(maskSeatIds.has(target.seatId), `${target.seatId} is missing from the source-image seat hotspot mask`);
}
for (const seat of libraryHabboMapMask.seatHotspots) {
  assert(Array.isArray(seat.polygon) && seat.polygon.length >= 4, `${seat.seatId} must define a pixel-space click polygon`);
  assert(Number.isFinite(seat.walkTargetPx?.x) && Number.isFinite(seat.walkTargetPx?.y), `${seat.seatId} must define a pixel-space walk target`);
  assert(maskFloorAt(seat.walkTargetPx), `${seat.seatId} walk target must be on the original library floor mask`);
  assert(!maskBlockedAt(seat.walkTargetPx), `${seat.seatId} walk target must not be inside a pixel blocked polygon`);
  assert(maskGridWalkable(seat.walkTargetPx), `${seat.seatId} walk target must be on a source-image sampled floor pixel`);
  assert(maskGridStandingSafe(seat.walkTargetPx), `${seat.seatId} walk target must leave standing avatar body on source-image sampled floor pixels`);
}
assert(/LIBRARY_HABBO_MAP_MASK/.test(js), 'runtime pathing must load the original-image map mask contract');
assert(/mapPercentToImagePixel/.test(js), 'runtime pathing must convert legacy percent anchors into original image pixels');
assert(/imagePixelToMapPercent/.test(js), 'runtime pathing must convert pixel A* route points back to rendered scene percent anchors');
assert(/findImagePixelRoute/.test(js), 'runtime pathing must route with A* over the source-image pixel mask');
assert(/sceneToMapPixel/.test(js), 'tap handling must convert rendered scene taps into original image pixels before collision checks');
assert(/mapCamera/.test(js), 'zoom must use a map camera model, not ad-hoc CSS scaling');
assert(/function applyMapCamera/.test(js), 'zoom changes must reproject room entities through the map camera');
assert(/function setMapZoom/.test(js), 'zoom buttons must change the map camera zoom');
assert(/function followAvatarCamera/.test(js), 'map camera must follow the avatar while walking instead of jumping to the clicked target');
assert(/setAvatarPosition\(frame\.point\.x, frame\.point\.y, \{followCamera: true\}\)/.test(js), 'route movement must update the camera from avatar movement frames');
assert(!/focusMapCamera\(target\);\s*routeAvatarViaPath/.test(js), 'chair taps must not instantly recenter the camera before the avatar walks');
assert(!/focusMapCamera\(walkableTarget\);\s*routeAvatarViaPath/.test(js), 'floor taps must not instantly recenter the camera before the avatar walks');
assert(/function mapToScenePoint/.test(js), 'rendering must convert image-space map coordinates to cropped scene coordinates');
assert(/function sceneToMapPoint/.test(js), 'tap handling must convert cropped scene coordinates back to image-space map coordinates');
assert(/function positionSeatHotspots/.test(js), 'seat hotspots must be positioned from image-space chair coordinates');
assert(/function setAvatarPosition[\s\S]*mapToScenePoint/.test(js), 'avatar CSS position must be derived through mapToScenePoint');
const routeMovementBody = js.match(/function moveAvatarAlongRoute\(route\) \{[\s\S]*?\n\}/)?.[0] ?? '';
assert(!/smoothWalkRoute/.test(routeMovementBody), 'continuous movement must follow Habbo-style tile steps instead of over-smoothed shortcut zig-zags');
assert(/setAvatarFacing\(from, to\)/.test(js), 'avatar must update facing direction while walking');
assert(/setAvatarDepth\(point\)/.test(js), 'avatar must update depth while walking behind/around furniture');
assert(!/for \(const point of route\)\s*{[\s\S]*await moveAvatarTo\(point\)/.test(js), 'route movement still waits at each waypoint');
assert(/getSeatTarget/.test(js), 'chair taps must use sit targets separate from hotspot centers');
assert(/pullChairAndSit/.test(js), 'chair taps must settle the avatar into the existing room chair before studying starts');
assert(/await pullChairAndSit/.test(js), 'study timer must wait for the sit state to be applied');
assert(!/setChairPullObject/.test(js), 'sit action must not animate a separate chair object');
assert(!/resetChairPullObject/.test(js), 'prototype must not retain chair-pull cleanup logic');
assert(/setAvatarMode\('studying'\)/.test(js), 'chair taps must switch directly to the static seated studying sprite');
assert(/standUpFromSeat/.test(js), 'seated floor taps must run a standing-up transition before walking');
assert(/runAvatarActionSequence/.test(js), 'avatar interactions must use a Habbo-style action sequence');
assert(/walkToTarget/.test(js), 'action sequence must separate walking from sitting');
assert(/sitAtChair/.test(js), 'action sequence must separate sitting from walking');
assert(!/setAvatarMode\('standing-up'\)/.test(js), 'leaving a chair must not play a stand-up animation in the simplified model');
assert(/getTargetRouteTileId/.test(js), 'chair routes must resolve a walk target separate from seat metadata');
assert(/getStandTileId/.test(js), 'chair routes must have dedicated stand tiles in the A* graph');
assert(/getTargetRouteTileId[\s\S]*getStandTileId\(target\)/.test(js), 'chair routes must path to the chair stand tile, not a broad row entry');
assert(!/chairProp/.test(js), 'sitting must not create or move a duplicate chair prop');
assert(!/route\.push\(\{x:\s*target\.x,\s*y:\s*target\.y/.test(js), 'seat routes must not append the sit coordinate as a walk hop');
assert(!/route\.push\(standPoint\)/.test(js), 'seat routes must not append a final stand-point hop outside A*');
assert(/walkStepIndex/.test(js), 'walking animation must advance visible footstep frames');
assert(!/moveAvatarTo\(\{x, y\}\)/.test(js), 'scene click must not move directly to arbitrary raw coordinates');
assert(Object.keys(walkableTiles).length >= 24, 'generated library walking needs a dense A* graph');
assert(blockedZoneById.get('upper-study-table'), 'generated map must block the upper study table');
assert(blockedZoneById.get('middle-study-table'), 'generated map must block the middle study table');
assert(blockedZoneById.get('lower-study-table'), 'generated map must block the lower study table');
for (const [tileId, point] of Object.entries(walkableTiles)) {
  assert(!blockedZoneAt(point), `${tileId} walk tile is inside a blocked desk zone`);
  for (const neighbor of point.neighbors) {
    assert(walkableTiles[neighbor], `${tileId} references missing neighbor ${neighbor}`);
    const blockedZone = segmentBlockedZone(point, walkableTiles[neighbor]);
    assert(!blockedZone, `${tileId} to ${neighbor} crosses blocked desk zone ${blockedZone?.id}`);
  }
}
const seatEntryTiles = chairSeatTargets.map((target) => target.entryTileId);
assert(seatEntryTiles.length >= 46, 'chair hotspots must have entry tiles before sitting');
for (const entryTileId of seatEntryTiles) {
  assert(walkableTiles[entryTileId], `${entryTileId} seat entry tile is missing from the walk graph`);
  assert(findRouteTiles('entrance', entryTileId).length > 1, `entrance cannot route to ${entryTileId}`);
}
for (const target of chairSeatTargets) {
  const {seatId, entryTileId} = target;
  const sitTarget = {x: target.sitX, y: target.sitY};
  assert(routeDistance(walkableTiles[entryTileId], sitTarget) >= 1.8, `${seatId} entry tile must be visibly separate from the sit target`);
}
for (const target of chairSeatTargets) {
  assert(target.seatId && target.label, 'chair target must include a seat id and label');
  assert(/^(front|forward)$/.test(target.sitPose), `${target.seatId} chair target must choose front or forward seated pose`);
  assert(Number.isFinite(target.standX) && Number.isFinite(target.standY), `${target.seatId} chair target must define a stand-up point`);
  assert(/^(north|south|east|west|north-east|north-west|south-east|south-west)$/.test(target.facing), `${target.seatId} chair target must define seated facing`);
  assert(walkableTiles[target.entryTileId], `${target.seatId} entry tile is missing from the walk graph`);
  assert(findRouteTiles('entrance', target.entryTileId).length > 1, `entrance cannot route to clicked chair ${target.seatId}`);
  const standTile = walkableTiles[`seat-${target.seatId}-stand`];
  if (standTile) {
    assert(routeDistance(standTile, {x: target.standX, y: target.standY}) < 0.01, `${target.seatId} graph stand tile must match chair stand anchor`);
    assert(findRouteTiles('entrance', `seat-${target.seatId}-stand`).length > 1, `entrance cannot route to chair stand tile ${target.seatId}`);
  }
  assert(!blockedZoneAt({x: target.standX, y: target.standY}), `${target.seatId} stand-up point is on a blocked desk zone`);
  assert(routeDistance(walkableTiles[target.entryTileId], {x: target.sitX, y: target.sitY}) >= 1.8, `${target.seatId} chair target must be separated from its walk entry`);
  assert(routeDistance({x: target.standX, y: target.standY}, {x: target.sitX, y: target.sitY}) >= 1.2, `${target.seatId} stand-up point must be distinct from the seated pose`);
}
assert(!/class="scripted-student/.test(html), 'prototype must not render fake scripted classmates');
assert(!/\.student-one/.test(css) && !/\.student-two/.test(css) && !/\.student-three/.test(css), 'prototype must not keep positioned fake classmate sprites');
assert(!/Selin|Mert|Ayca/.test(js), 'prototype must not seed fake classmate names');
assert(/auditSeatHotspots/.test(runtimeVerifier), 'runtime verifier must cover visible seat hotspot click targets');
assert(/auditNoScriptedClassmates/.test(runtimeVerifier), 'runtime verifier must reject scripted classmate UI');
assert(/auditSeatChangeAction/.test(runtimeVerifier), 'runtime verifier must cover seated-to-seated Habbo action sequencing');
assert(/auditDeskClickDoesNotSit/.test(runtimeVerifier), 'runtime verifier must prove desk/table taps do not auto-sit the avatar');
assert(/auditZoomedChairTap/.test(runtimeVerifier), 'runtime verifier must prove chair targeting still works while zoomed');
assert(/auditRouteShape/.test(runtimeVerifier), 'runtime verifier must cover chair-to-chair tile route shape');
assert(/renderFloatingCounts/.test(js), 'prototype must render other people counts as floating scene tags');
assert(/leaderboardToggle\.addEventListener/.test(js), 'leaderboard toggle must be interactive');
assert(/startStudyAtSeat/.test(js), 'sitting at a chair must start the study timer');
assert(/enterBreakAtChimAmfi/.test(js), 'break mode must send the user to Cim Amfi');
assert(/applyClothing/.test(js), 'prototype must support dynamic clothing changes');
assert(/chatMessages/.test(js), 'prototype must keep lightweight room chat messages');
assert(/renderChatMessages/.test(js), 'prototype must render room chat bubbles/messages');
assert(/sendChatMessage/.test(js), 'prototype must send local room chat messages');
assert(/chatForm\.addEventListener/.test(js), 'chat form must be interactive');
assert(/avatarState/.test(js), 'prototype must track avatar state for movement and wardrobe changes');
assert(/scene.addEventListener\('click'/.test(js), 'prototype must allow Habbo-like tap-to-walk on the room');
assert(/library-habbo\.png/.test(css), 'scene must use the generated isometric Library image as the base image');
assert(/chim-amfi-habbo\.png/.test(css), 'break view must use the generated Habbo-style Cim Amfi image');
assert(!/pixel-sesli-kutuphane-room\.png/.test(css), 'prototype must not use the square top-down Library image as the room base');
assert(!/assets\/library-room\.png/.test(css), 'prototype must not use the discarded generated Library image');
assert(/\.scene-hotspot/.test(css), 'scene-native hotspots must be styled');
assert(/@keyframes avatarWalk/.test(css), 'avatar walking animation must be styled');
assert(/@keyframes avatarIdle/.test(css), 'avatar idle animation must be styled');
assert(/@keyframes avatarStudy/.test(css), 'avatar study animation must be styled');
assert(/seat-occupancy-marker/.test(css), 'static seated state must use semantic occupied markers');
assert(!/\.chair-pull-object/.test(css), 'CSS must not style a chair-pull animation object');
assert(!/@keyframes chairPullOut/.test(css), 'CSS must not animate chair pulling out');
assert(!/@keyframes chairPushIn/.test(css), 'CSS must not animate chair pushing in');
assert(/@keyframes stepMarker/.test(css), 'walk target/step feedback must be styled');
assert(/\.student-avatar\.studying/.test(css), 'avatar must have a studying animation state');
assert(!/\.student-avatar\.sitting-down/.test(css), 'avatar must not keep a sit-down animation state');
assert(!/\.student-avatar\.standing-up/.test(css), 'avatar must not keep a stand-up animation state');
assert(/\.student-avatar\[data-posture="sit"\]/.test(css), 'sit posture must have a static seated sprite rule');
assert(/\.seat-occupancy-portrait/.test(css), 'sit posture must render a compact occupied-seat portrait marker');
assert(/\.student-avatar\[data-posture="sit"\][\s\S]*\.pixel/.test(css), 'sit posture must hide standing CSS body parts');
assert(/display:\s*none;/.test(css), 'sit posture must hide standing body pieces instead of animating them');
assert(/\.seat-state-layer/.test(css), 'CSS must position occupied chair crop overlays in scene space');
assert(!/\.chair-prop/.test(css), 'CSS must not define a duplicate chair prop');
assert(/\.student-avatar\.outfit-/.test(css), 'avatar clothing variants must be styled');
assert(/\.avatar-sprite/.test(css), 'walking avatar image sprite must be styled');
assert(/\.avatar-hat/.test(css), 'walking avatar must have an independent hat layer');
assert(/\.shop-balance/.test(css), 'gold shop balance must be styled');
assert(/\.shop-item/.test(css), 'gold shop items must be styled');
assert(/\.avatar-type-tabs/.test(css), 'avatar type switcher must be styled');
assert(/\.student-avatar\.step-/.test(css), 'avatar walking must show frame-based step states');
assert(/\.hud-layer/.test(css), 'HUD layer must be styled');
assert(/\.hud-layer\s*\{[^}]*pointer-events:\s*none/s.test(css), 'HUD layer must not intercept room taps by default');
assert(/\.hud-action/.test(css), 'HUD buttons must opt back into pointer events');
assert(/\.top-hud/.test(css), 'top HUD chips must be styled');
assert(/\.bottom-hud/.test(css), 'bottom HUD controls must be styled');
assert(/\.chat-panel/.test(css), 'chat panel must be styled');
assert(/\.seat-occupancy-label/.test(css), 'occupied seat marker must include a compact name/status label');
assert(/\.chat-form/.test(css), 'chat input row must be styled');
assert(/\.zoom-controls/.test(css), 'zoom controls must be styled');
assert(/\.floating-counts/.test(css), 'floating count tags must be styled');
assert(/\.leaderboard-list/.test(css), 'leaderboard must be styled');
assert(!/\.game-hud/.test(css), 'CSS must not keep the old large game HUD panel');
assert(!/\.score-grid/.test(css), 'CSS must not keep the old panel score grid');
assert(!/\b(card|wardrobe-card|menu-card|red-box)\b/i.test(combined), 'prototype should not use visible card/menu/red-box UI language');
assert(!/#fff(?:fff)?\b/i.test(css), 'prototype should avoid white card styling');
assert(!/background(?:-color)?\s*:\s*(?:white|#fff|#ffffff)/i.test(css), 'prototype should not use white panel backgrounds');
assert(!/background(?:-color)?\s*:\s*(?:red|#f00|#ff0000)/i.test(css), 'prototype should not use red selection boxes');

console.log('library-study prototype contract passed');
