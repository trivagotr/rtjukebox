const scene = document.querySelector('.phone-scene');
const avatar = document.querySelector('.student-avatar');
let seats = [];
const seatStateLayer = document.querySelector('#seatStateLayer');
const seatOccluder = document.querySelector('#seatOccluder');
const mapDebugLayer = document.querySelector('#mapDebugLayer');
const clothingButtons = [...document.querySelectorAll('[data-clothing]')];
const cosmeticButtons = [...document.querySelectorAll('[data-cosmetic]')];
const avatarTypeButtons = [...document.querySelectorAll('[data-avatar-type]')];
const goldBalance = document.querySelector('#goldBalance');
const closetToggle = document.querySelector('#closetToggle');
const closetDrawer = document.querySelector('#closetDrawer');
const stepMarker = document.querySelector('#stepMarker');
const sceneTitle = document.querySelector('#sceneTitle');
const sceneCaption = document.querySelector('#sceneCaption');
const studyTimer = document.querySelector('#studyTimer');
const todayScore = document.querySelector('#todayScore');
const currentStreak = document.querySelector('#currentStreak');
const playerCount = document.querySelector('#playerCount');
const floatingCounts = document.querySelector('#floatingCounts');
const studyFill = document.querySelector('#studyFill');
const leaderboardToggle = document.querySelector('#leaderboardToggle');
const leaderboardPanel = document.querySelector('#leaderboardPanel');
const leaderboardList = document.querySelector('#leaderboardList');
const breakButton = document.querySelector('#breakButton');
const breakScene = document.querySelector('#breakScene');
const returnButton = document.querySelector('#returnButton');
const topHud = document.querySelector('.top-hud');
const chatPanel = document.querySelector('.chat-panel');
const chatLog = document.querySelector('#chatLog');
const chatForm = document.querySelector('#chatForm');
const chatInput = document.querySelector('#chatInput');
const bottomHud = document.querySelector('.bottom-hud');
const zoomInButton = document.querySelector('#zoomInButton');
const zoomOutButton = document.querySelector('#zoomOutButton');
const mapDebugEnabled = new URLSearchParams(window.location.search).has('debugMap');
const MOBILE_STUDY_SPACES_SOURCE = './data/mobile-study-spaces.json';

const embeddedAuthState = {
  accessToken: '',
  apiBase: '',
  user: null,
  embedded: new URLSearchParams(window.location.search).get('embedded') === 'mobile',
};

function applyEmbeddedAuth(payload = {}) {
  if (!payload || typeof payload !== 'object') {
    return embeddedAuthState;
  }

  embeddedAuthState.accessToken = payload.accessToken || embeddedAuthState.accessToken || '';
  embeddedAuthState.apiBase = payload.apiBase || embeddedAuthState.apiBase || '';
  embeddedAuthState.user = payload.user || embeddedAuthState.user || null;
  embeddedAuthState.embedded = Boolean(payload.embedded || embeddedAuthState.embedded);

  try {
    if (embeddedAuthState.accessToken) {
      localStorage.setItem('radiotedu_access_token', embeddedAuthState.accessToken);
      localStorage.setItem('access_token', embeddedAuthState.accessToken);
    }
    if (embeddedAuthState.apiBase) {
      localStorage.setItem('radiotedu_api_base', embeddedAuthState.apiBase);
    }
    if (embeddedAuthState.user) {
      localStorage.setItem('radiotedu_embedded_user', JSON.stringify(embeddedAuthState.user));
    }
  } catch (error) {
    // Embedded WebView auth still works through memory if storage is blocked.
  }

  return embeddedAuthState;
}

function readEmbeddedAuthFromStorage() {
  let user = null;
  try {
    user = JSON.parse(localStorage.getItem('radiotedu_embedded_user') || 'null');
  } catch (error) {
    user = null;
  }

  return {
    accessToken: readLocalStorageValue('radiotedu_access_token') || readLocalStorageValue('access_token') || '',
    apiBase: readLocalStorageValue('radiotedu_api_base') || '',
    user,
    embedded: embeddedAuthState.embedded,
  };
}

function readLocalStorageValue(key) {
  try {
    return localStorage.getItem(key) || '';
  } catch (error) {
    return '';
  }
}

window.libraryEmbeddedAuth = {
  apply: applyEmbeddedAuth,
  getState: () => ({...embeddedAuthState}),
};

window.addEventListener('radiotedu:auth', (event) => applyEmbeddedAuth(event.detail));
document.addEventListener('radiotedu:auth', (event) => applyEmbeddedAuth(event.detail));
window.addEventListener('message', (event) => {
  if (event.data?.type === 'radiotedu-auth') {
    applyEmbeddedAuth(event.data);
  }
});
applyEmbeddedAuth(window.RadioTEDUAppAuth || readEmbeddedAuthFromStorage());

window.mobileStudySpacesSource = MOBILE_STUDY_SPACES_SOURCE;

const WALKABLE_TILES = {
  entrance: {x: 45, y: 92, neighbors: ['stair-bottom', 'right-spine-lower']},
  'stair-bottom': {x: 42, y: 84, neighbors: ['entrance', 'stair-top', 'bottom-left-aisle']},
  'stair-top': {x: 39, y: 77, neighbors: ['stair-bottom', 'bottom-left-aisle', 'bottom-center-aisle']},
  'bottom-left-aisle': {x: 28, y: 78, neighbors: ['stair-top', 'bottom-center-aisle', 'left-lower-turn', 'seat-lower-left-stand']},
  'bottom-center-aisle': {x: 46, y: 75, neighbors: ['stair-top', 'bottom-left-aisle', 'bottom-right-aisle', 'lower-center-aisle', 'seat-lower-row-stand']},
  'bottom-right-aisle': {x: 66, y: 77, neighbors: ['bottom-center-aisle', 'lower-right-aisle', 'seat-lower-right-stand']},
  'left-lower-turn': {x: 12, y: 72, neighbors: ['bottom-left-aisle', 'lower-left-aisle']},
  'lower-left-aisle': {x: 23, y: 65, neighbors: ['left-lower-turn', 'lower-center-aisle', 'middle-left-aisle']},
  'lower-center-aisle': {x: 47, y: 73, neighbors: ['lower-left-aisle', 'bottom-center-aisle', 'seat-middle-left-stand', 'seat-middle-row-stand']},
  'lower-right-aisle': {x: 74, y: 74, neighbors: ['bottom-right-aisle', 'seat-middle-right-stand']},
  'middle-left-aisle': {x: 21, y: 56, neighbors: ['middle-open-aisle', 'seat-lamp-left-stand']},
  'middle-open-aisle': {x: 18, y: 57, neighbors: ['middle-left-aisle', 'lower-left-aisle', 'left-lower-turn']},
  'middle-center-aisle': {x: 49, y: 44, neighbors: ['middle-right-aisle']},
  'middle-right-aisle': {x: 66, y: 54, neighbors: ['middle-center-aisle', 'right-lounge', 'upper-right-aisle', 'seat-lamp-right-stand']},
  'upper-left-aisle': {x: 31, y: 39, neighbors: ['upper-center-aisle', 'seat-front-left-stand', 'seat-lamp-desk-stand']},
  'upper-center-aisle': {x: 54, y: 43, neighbors: ['upper-left-aisle', 'upper-right-aisle', 'seat-front-desk-stand', 'seat-lamp-desk-stand']},
  'upper-right-aisle': {x: 76, y: 40, neighbors: ['upper-center-aisle', 'middle-right-aisle', 'lounge', 'seat-front-right-stand']},
  lounge: {x: 81, y: 34, neighbors: ['upper-right-aisle', 'right-lounge']},
  'right-lounge': {x: 82, y: 45, neighbors: ['lounge', 'middle-right-aisle', 'right-lower-lounge']},
  'right-lower-lounge': {x: 82, y: 57, neighbors: ['right-lounge']},
  'right-spine-lower': {x: 89, y: 73, neighbors: ['entrance', 'right-spine-mid']},
  'right-spine-mid': {x: 95.5, y: 63.25, neighbors: ['right-spine-lower', 'right-spine-upper', 'right-upper-link', 'right-lounge-link']},
  'right-spine-upper': {x: 89, y: 56.75, neighbors: ['right-spine-mid', 'upper-center-aisle', 'right-lower-lounge', 'right-mid-link-a']},
  'right-upper-link': {x: 79.25, y: 50.25, neighbors: ['right-spine-mid', 'upper-right-aisle']},
  'right-lounge-link': {x: 82.5, y: 53.5, neighbors: ['right-spine-mid', 'right-lounge']},
  'right-mid-link-a': {x: 69.5, y: 50.25, neighbors: ['right-spine-upper', 'right-mid-link-b']},
  'right-mid-link-b': {x: 66.25, y: 50.25, neighbors: ['right-mid-link-a', 'right-mid-link-c']},
  'right-mid-link-c': {x: 63, y: 53.5, neighbors: ['right-mid-link-b', 'middle-right-aisle']},
  'seat-front-left-stand': {x: 42, y: 37.4, neighbors: ['upper-left-aisle', 'upper-center-aisle']},
  'seat-front-desk-stand': {x: 55, y: 45.2, neighbors: ['upper-center-aisle']},
  'seat-front-right-stand': {x: 67, y: 45.7, neighbors: ['upper-right-aisle', 'upper-center-aisle']},
  'seat-lamp-left-stand': {x: 26, y: 53.2, neighbors: ['middle-left-aisle']},
  'seat-lamp-desk-stand': {x: 31, y: 44.4, neighbors: ['upper-left-aisle', 'upper-center-aisle']},
  'seat-lamp-right-stand': {x: 45, y: 56.8, neighbors: ['middle-right-aisle']},
  'seat-middle-left-stand': {x: 52, y: 70.4, neighbors: ['lower-center-aisle']},
  'seat-middle-row-stand': {x: 60, y: 74.2, neighbors: ['lower-center-aisle']},
  'seat-middle-right-stand': {x: 69, y: 74.6, neighbors: ['lower-right-aisle']},
  'seat-lower-left-stand': {x: 33, y: 75, neighbors: ['bottom-left-aisle', 'bottom-center-aisle']},
  'seat-lower-row-stand': {x: 43, y: 78.2, neighbors: ['bottom-center-aisle']},
  'seat-lower-right-stand': {x: 55, y: 80.4, neighbors: ['bottom-center-aisle', 'bottom-right-aisle']},
};
const FLOOR_TAP_TARGET_TILE_IDS = new Set([
  'entrance',
  'stair-bottom',
  'stair-top',
  'bottom-left-aisle',
  'bottom-center-aisle',
  'bottom-right-aisle',
  'left-lower-turn',
  'lower-left-aisle',
  'lower-center-aisle',
  'lower-right-aisle',
  'middle-left-aisle',
  'middle-open-aisle',
  'middle-center-aisle',
  'middle-right-aisle',
  'upper-center-aisle',
  'upper-right-aisle',
  'lounge',
  'right-lounge',
  'right-lower-lounge',
]);

const BLOCKED_DESK_ZONES = [
  {id: 'upper-study-table', points: [{x: 39, y: 29}, {x: 73, y: 34}, {x: 70, y: 36}, {x: 38, y: 31}]},
  {id: 'middle-study-table', points: [{x: 16, y: 43}, {x: 53, y: 50}, {x: 51, y: 51}, {x: 14, y: 44}]},
  {id: 'lower-study-table', points: [{x: 52, y: 57}, {x: 88, y: 64}, {x: 86, y: 65}, {x: 50, y: 60}]},
  {id: 'bottom-study-table', points: [{x: 30, y: 56}, {x: 65, y: 63}, {x: 68, y: 68}, {x: 38, y: 62}]},
  {id: 'left-study-table', points: [{x: -8, y: 43}, {x: 8, y: 48}, {x: 7, y: 57}, {x: -10, y: 51}]},
  {id: 'lounge-furniture', points: [{x: 86, y: 29}, {x: 102, y: 35}, {x: 100, y: 52}, {x: 88, y: 47}]},
  {id: 'bookcase-edge', points: [{x: -6, y: 29}, {x: 10, y: 34}, {x: 8, y: 48}, {x: -8, y: 45}]},
];

const FLOOR_WALK_ZONES = [
  {
    id: 'main-library-floor',
    points: [{x: -8, y: 24}, {x: 98, y: 24}, {x: 103, y: 72}, {x: 45, y: 96}, {x: -10, y: 72}],
  },
  {
    id: 'entry-steps',
    points: [{x: 35, y: 75}, {x: 51, y: 77}, {x: 48, y: 96}, {x: 35, y: 93}],
  },
];
const HABBO_WALK_STEP = 3.25;
const FLOOR_TARGET_CLEARANCE = 5;
const AVATAR_VISUAL_HEADROOM = 8;
const AVATAR_VISUAL_HALF_WIDTH = 2.2;
const AVATAR_VISUAL_FURNITURE_CLEARANCE = 1.15;
const CHAIR_BLOCK_RADIUS = {x: 1.8, y: 2.2};
const MAP_IMAGE_SIZE = {width: 941, height: 1672};
const LIBRARY_HABBO_MAP_MASK = loadLibraryHabboMapMask();
const IMAGE_PIXEL_GRID_SIZE = Number.isFinite(LIBRARY_HABBO_MAP_MASK.gridSizePx)
  ? LIBRARY_HABBO_MAP_MASK.gridSizePx
  : 28;
const mapCamera = {
  zoom: 1.16,
  minZoom: 1.16,
  maxZoom: 2.25,
  step: 0.25,
  centerX: 45,
  centerY: 75,
};
const CAMERA_SAFE_FRAME = {
  top: 96,
  bottomPadding: 64,
  minHeight: 220,
};
const CAMERA_FOLLOW = {
  enabled: true,
  lerp: 0.24,
  epsilon: 0.04,
};
let isApplyingMapCamera = false;
let walkGraphCache = null;
let imagePixelWalkGraphCache = null;

const scriptedStudents = [];

const leaderboardEntries = [];

const seatCopy = {
  'front-left': 'Upper desk',
  'front-desk': 'Front desk',
  'front-right': 'Upper desk',
  'lamp-left': 'Middle desk',
  'lamp-desk': 'Lamp desk',
  'lamp-right': 'Middle desk',
  'middle-left': 'Lower desk',
  'middle-row': 'Middle row',
  'middle-right': 'Lower desk',
  'lower-left': 'Bottom desk',
  'lower-row': 'Lower row',
  'lower-right': 'Bottom desk',
};

const CHAIR_SEAT_TARGETS = [
  {seatId: 'front-left', label: 'Upper desk', emptyVisualRef: 'library-habbo:front-left-chair', sitX: 46.2, sitY: 29.5, standX: 42, standY: 37.4, facing: 'south-east', sitPose: 'front', visualPose: 'hidden', visualWidth: 1, visualHeight: 1, visualHidden: true, occlusion: null, entryTileId: 'upper-left-aisle'},
  {seatId: 'front-desk', label: 'Upper desk', emptyVisualRef: 'library-habbo:front-desk-chair', sitX: 57.3, sitY: 40.0, standX: 55, standY: 45.2, facing: 'north', assetDirection: 'east', bodyDirection: 'east', headDirection: 'east', avatarAction: 'sit', seatZ: 0, spriteOffset: {x: 1.1, y: 0.55}, avatarClip: 'polygon(0 0, 100% 0, 100% 44%, 76% 44%, 76% 40%, 0 40%)', sitPose: 'front', layerBounds: {left: 55.2, top: 28.7, width: 6.2, height: 7.6}, foregroundMask: [{x: 54.4, y: 35.1}, {x: 61.2, y: 35.6}, {x: 61.4, y: 41.3}, {x: 56.2, y: 42.7}, {x: 54.0, y: 37.5}], occlusion: {x1: 55.2, y1: 35.7, x2: 60.4, y2: 41.2}, entryTileId: 'upper-center-aisle'},
  {seatId: 'front-right', label: 'Upper desk', emptyVisualRef: 'library-habbo:front-right-chair', sitX: 65.0, sitY: 36.8, standX: 67, standY: 45.7, facing: 'north', sitPose: 'front', layerBounds: {left: 61.1, top: 25.8, width: 6.2, height: 7.6}, occlusion: {x1: 63.0, y1: 32.7, x2: 66.5, y2: 36.9}, entryTileId: 'upper-right-aisle'},
  {seatId: 'lamp-left', label: 'Middle desk', emptyVisualRef: 'library-habbo:lamp-left-chair', sitX: 26.7, sitY: 44.6, standX: 26, standY: 53.2, facing: 'south', sitPose: 'front', layerBounds: {left: 23.0, top: 36.7, width: 7.2, height: 8.7}, occlusion: {x1: 25.3, y1: 42.0, x2: 28.1, y2: 44.8}, entryTileId: 'middle-left-aisle'},
  {seatId: 'lamp-desk', label: 'Middle desk', emptyVisualRef: 'library-habbo:lamp-desk-chair', sitX: 33.5, sitY: 40.3, standX: 31, standY: 44.4, facing: 'north', assetDirection: 'east', sitPose: 'front', layerBounds: {left: 29.8, top: 32.4, width: 7.2, height: 8.7}, occlusion: {x1: 31.4, y1: 37.7, x2: 35.6, y2: 40.5}, entryTileId: 'upper-center-aisle'},
  {seatId: 'lamp-right', label: 'Middle desk', emptyVisualRef: 'library-habbo:lamp-right-chair', sitX: 44.5, sitY: 58.7, standX: 45, standY: 56.8, facing: 'north', assetDirection: 'east', sitPose: 'front', layerBounds: {left: 40.8, top: 50.8, width: 7.2, height: 8.7}, occlusion: {x1: 43.1, y1: 55.8, x2: 46.0, y2: 58.9}, entryTileId: 'middle-center-aisle'},
  {seatId: 'middle-left', label: 'Lower desk', emptyVisualRef: 'library-habbo:middle-left-chair', sitX: 42.2, sitY: 65.1, standX: 52, standY: 70.4, facing: 'south', sitPose: 'front', layerBounds: {left: 38.5, top: 57.2, width: 7.2, height: 8.7}, occlusion: {x1: 40.1, y1: 62.4, x2: 44.3, y2: 65.3}, entryTileId: 'lower-center-aisle'},
  {seatId: 'middle-row', label: 'Lower desk', emptyVisualRef: 'library-habbo:middle-row-chair', sitX: 48.7, sitY: 67.2, standX: 60, standY: 74.2, facing: 'north', assetDirection: 'east', sitPose: 'front', layerBounds: {left: 45.0, top: 59.3, width: 7.2, height: 8.7}, occlusion: {x1: 46.7, y1: 64.6, x2: 50.9, y2: 67.4}, entryTileId: 'lower-center-aisle'},
  {seatId: 'middle-right', label: 'Lower desk', emptyVisualRef: 'library-habbo:middle-right-chair', sitX: 69.2, sitY: 67.3, standX: 69, standY: 74.6, facing: 'north', assetDirection: 'east', sitPose: 'front', layerBounds: {left: 65.5, top: 59.4, width: 7.2, height: 8.7}, occlusion: {x1: 67.0, y1: 64.6, x2: 71.4, y2: 67.5}, entryTileId: 'lower-right-aisle'},
  {seatId: 'lower-left', label: 'Bottom desk', emptyVisualRef: 'library-habbo:lower-left-chair', sitX: 35.6, sitY: 62.8, standX: 33, standY: 75, facing: 'south', sitPose: 'front', layerBounds: {left: 31.9, top: 54.9, width: 7.2, height: 8.7}, occlusion: {x1: 33.8, y1: 60.3, x2: 37.5, y2: 62.9}, entryTileId: 'bottom-left-aisle'},
  {seatId: 'lower-row', label: 'Bottom desk', emptyVisualRef: 'library-habbo:lower-row-chair', sitX: 55.4, sitY: 69.5, standX: 43, standY: 78.2, facing: 'north', assetDirection: 'east', sitPose: 'front', layerBounds: {left: 51.7, top: 61.6, width: 7.2, height: 8.7}, occlusion: {x1: 53.2, y1: 66.8, x2: 57.5, y2: 69.7}, entryTileId: 'bottom-left-aisle'},
  {seatId: 'lower-right', label: 'Bottom desk', emptyVisualRef: 'library-habbo:lower-right-chair', sitX: 62.0, sitY: 71.7, standX: 55, standY: 80.4, facing: 'north', assetDirection: 'east', sitPose: 'front', layerBounds: {left: 58.3, top: 63.8, width: 7.2, height: 8.7}, occlusion: {x1: 60.0, y1: 69.0, x2: 64.2, y2: 71.9}, entryTileId: 'bottom-right-aisle'},
  {seatId: 'upper-back-left', label: 'Upper desk', emptyVisualRef: 'library-habbo:upper-back-left-chair', sitX: 47.8, sitY: 25.7, standX: 54, standY: 39, facing: 'south', sitPose: 'front', entryTileId: 'upper-center-aisle'},
  {seatId: 'upper-back-mid', label: 'Upper desk', emptyVisualRef: 'library-habbo:upper-back-mid-chair', sitX: 54.3, sitY: 27.5, standX: 54, standY: 39, facing: 'south', sitPose: 'front', entryTileId: 'upper-center-aisle'},
  {seatId: 'upper-back-right', label: 'Upper desk', emptyVisualRef: 'library-habbo:upper-back-right-chair', sitX: 61.2, sitY: 30.9, standX: 67, standY: 45.7, facing: 'south', sitPose: 'front', entryTileId: 'upper-right-aisle'},
  {seatId: 'upper-near-left', label: 'Upper desk', emptyVisualRef: 'library-habbo:upper-near-left-chair', sitX: 41.3, sitY: 33.1, standX: 42, standY: 37.4, facing: 'north', sitPose: 'front', entryTileId: 'upper-left-aisle'},
  {seatId: 'upper-near-mid', label: 'Upper desk', emptyVisualRef: 'library-habbo:upper-near-mid-chair', sitX: 50.7, sitY: 36.1, standX: 55, standY: 45.2, facing: 'north', sitPose: 'front', entryTileId: 'upper-center-aisle'},
  {seatId: 'upper-near-right', label: 'Upper desk', emptyVisualRef: 'library-habbo:upper-near-right-chair', sitX: 72.5, sitY: 41.0, standX: 67, standY: 45.7, facing: 'north', sitPose: 'front', entryTileId: 'upper-right-aisle'},
  {seatId: 'middle-back-left', label: 'Middle desk', emptyVisualRef: 'library-habbo:middle-back-left-chair', sitX: 29.4, sitY: 34.1, standX: 31, standY: 44.4, facing: 'south', sitPose: 'front', entryTileId: 'upper-left-aisle'},
  {seatId: 'middle-back-mid-left', label: 'Middle desk', emptyVisualRef: 'library-habbo:middle-back-mid-left-chair', sitX: 36.3, sitY: 39.3, standX: 31, standY: 44.4, facing: 'south', sitPose: 'front', entryTileId: 'upper-left-aisle'},
  {seatId: 'middle-back-mid-right', label: 'Middle desk', emptyVisualRef: 'library-habbo:middle-back-mid-right-chair', sitX: 43.8, sitY: 43.4, standX: 45, standY: 53, facing: 'south', sitPose: 'front', entryTileId: 'middle-center-aisle'},
  {seatId: 'middle-back-right', label: 'Middle desk', emptyVisualRef: 'library-habbo:middle-back-right-chair', sitX: 51.9, sitY: 47.5, standX: 45, standY: 53, facing: 'south', sitPose: 'front', entryTileId: 'middle-center-aisle'},
  {seatId: 'middle-front-left-edge', label: 'Middle desk', emptyVisualRef: 'library-habbo:middle-front-left-edge-chair', sitX: 18.6, sitY: 41.1, standX: 22, standY: 51, facing: 'north', sitPose: 'front', entryTileId: 'middle-left-aisle'},
  {seatId: 'middle-front-left', label: 'Middle desk', emptyVisualRef: 'library-habbo:middle-front-left-chair', sitX: 24.5, sitY: 47.8, standX: 26, standY: 53.2, facing: 'north', sitPose: 'front', entryTileId: 'middle-left-aisle'},
  {seatId: 'middle-front-mid', label: 'Middle desk', emptyVisualRef: 'library-habbo:middle-front-mid-chair', sitX: 31.2, sitY: 52.0, standX: 26, standY: 53.2, facing: 'north', sitPose: 'front', entryTileId: 'middle-left-aisle'},
  {seatId: 'middle-front-right', label: 'Middle desk', emptyVisualRef: 'library-habbo:middle-front-right-chair', sitX: 38.2, sitY: 56.3, standX: 45, standY: 56.8, facing: 'north', sitPose: 'front', entryTileId: 'middle-center-aisle'},
  {seatId: 'middle-front-far-right', label: 'Middle desk', emptyVisualRef: 'library-habbo:middle-front-far-right-chair', sitX: 47.5, sitY: 60.2, standX: 45, standY: 56.8, facing: 'north', sitPose: 'front', entryTileId: 'middle-center-aisle'},
  {seatId: 'left-lower-back-left', label: 'Left desk', emptyVisualRef: 'library-habbo:left-lower-back-left-chair', sitX: 6.1, sitY: 42.7, standX: 22, standY: 51, facing: 'south', sitPose: 'front', entryTileId: 'middle-left-aisle'},
  {seatId: 'left-lower-back-mid', label: 'Left desk', emptyVisualRef: 'library-habbo:left-lower-back-mid-chair', sitX: 13.9, sitY: 49.0, standX: 22, standY: 51, facing: 'south', sitPose: 'front', entryTileId: 'middle-left-aisle'},
  {seatId: 'left-lower-back-right', label: 'Left desk', emptyVisualRef: 'library-habbo:left-lower-back-right-chair', sitX: 21.2, sitY: 53.7, standX: 23, standY: 65, facing: 'south', sitPose: 'front', entryTileId: 'lower-left-aisle'},
  {seatId: 'left-lower-front-left', label: 'Left desk', emptyVisualRef: 'library-habbo:left-lower-front-left-chair', sitX: 6.9, sitY: 55.8, standX: 12, standY: 72, facing: 'north', sitPose: 'front', entryTileId: 'left-lower-turn'},
  {seatId: 'left-lower-front-mid', label: 'Left desk', emptyVisualRef: 'library-habbo:left-lower-front-mid-chair', sitX: 15.7, sitY: 61.1, standX: 23, standY: 65, facing: 'north', sitPose: 'front', entryTileId: 'lower-left-aisle'},
  {seatId: 'left-lower-front-right', label: 'Left desk', emptyVisualRef: 'library-habbo:left-lower-front-right-chair', sitX: 24.8, sitY: 66.6, standX: 28, standY: 78, facing: 'north', sitPose: 'front', entryTileId: 'bottom-left-aisle'},
  {seatId: 'left-edge-back', label: 'Left desk', emptyVisualRef: 'library-habbo:left-edge-back-chair', sitX: 0.9, sitY: 39.8, standX: 12, standY: 72, facing: 'south', sitPose: 'front', entryTileId: 'left-lower-turn'},
  {seatId: 'left-edge-front', label: 'Left desk', emptyVisualRef: 'library-habbo:left-edge-front-chair', sitX: 1.1, sitY: 62.2, standX: 12, standY: 72, facing: 'north', sitPose: 'front', entryTileId: 'left-lower-turn'},
  {seatId: 'right-mid-back-left', label: 'Right desk', emptyVisualRef: 'library-habbo:right-mid-back-left-chair', sitX: 62.2, sitY: 49.8, standX: 71, standY: 66, facing: 'south', sitPose: 'front', entryTileId: 'lower-right-aisle'},
  {seatId: 'right-mid-back-mid', label: 'Right desk', emptyVisualRef: 'library-habbo:right-mid-back-mid-chair', sitX: 67.8, sitY: 52.7, standX: 71, standY: 66, facing: 'south', sitPose: 'front', entryTileId: 'lower-right-aisle'},
  {seatId: 'right-mid-back-right', label: 'Right desk', emptyVisualRef: 'library-habbo:right-mid-back-right-chair', sitX: 77.4, sitY: 55.8, standX: 82, standY: 58, facing: 'south', sitPose: 'front', entryTileId: 'right-lower-lounge'},
  {seatId: 'right-mid-front-left', label: 'Right desk', emptyVisualRef: 'library-habbo:right-mid-front-left-chair', sitX: 56.9, sitY: 61.8, standX: 66, standY: 72, facing: 'north', sitPose: 'front', entryTileId: 'bottom-right-aisle'},
  {seatId: 'right-mid-front-mid', label: 'Right desk', emptyVisualRef: 'library-habbo:right-mid-front-mid-chair', sitX: 65.8, sitY: 66.5, standX: 66, standY: 72, facing: 'north', sitPose: 'front', entryTileId: 'bottom-right-aisle'},
  {seatId: 'right-mid-front-right', label: 'Right desk', emptyVisualRef: 'library-habbo:right-mid-front-right-chair', sitX: 73.8, sitY: 70.2, standX: 66, standY: 72, facing: 'north', sitPose: 'front', entryTileId: 'bottom-right-aisle'},
  {seatId: 'bottom-back-left', label: 'Bottom desk', emptyVisualRef: 'library-habbo:bottom-back-left-chair', sitX: 39.0, sitY: 59.7, standX: 43, standY: 78.2, facing: 'south', sitPose: 'front', entryTileId: 'bottom-center-aisle'},
  {seatId: 'bottom-back-mid-left', label: 'Bottom desk', emptyVisualRef: 'library-habbo:bottom-back-mid-left-chair', sitX: 49.9, sitY: 65.9, standX: 43, standY: 78.2, facing: 'south', sitPose: 'front', entryTileId: 'bottom-center-aisle'},
  {seatId: 'bottom-back-mid-right', label: 'Bottom desk', emptyVisualRef: 'library-habbo:bottom-back-mid-right-chair', sitX: 58.5, sitY: 70.5, standX: 55, standY: 80.4, facing: 'south', sitPose: 'front', entryTileId: 'bottom-right-aisle'},
  {seatId: 'bottom-back-right', label: 'Bottom desk', emptyVisualRef: 'library-habbo:bottom-back-right-chair', sitX: 67.4, sitY: 74.8, standX: 66, standY: 72, facing: 'south', sitPose: 'front', entryTileId: 'bottom-right-aisle'},
  {seatId: 'bottom-front-left', label: 'Bottom desk', emptyVisualRef: 'library-habbo:bottom-front-left-chair', sitX: 35.2, sitY: 68.8, standX: 43, standY: 78.2, facing: 'north', sitPose: 'front', entryTileId: 'bottom-center-aisle'},
  {seatId: 'bottom-front-mid-left', label: 'Bottom desk', emptyVisualRef: 'library-habbo:bottom-front-mid-left-chair', sitX: 44.3, sitY: 76.0, standX: 43, standY: 78.2, facing: 'north', sitPose: 'front', entryTileId: 'bottom-left-aisle'},
  {seatId: 'bottom-front-mid-right', label: 'Bottom desk', emptyVisualRef: 'library-habbo:bottom-front-mid-right-chair', sitX: 55.1, sitY: 82.2, standX: 55, standY: 80.4, facing: 'north', sitPose: 'front', entryTileId: 'bottom-right-aisle'},
  {seatId: 'bottom-front-right', label: 'Bottom desk', emptyVisualRef: 'library-habbo:bottom-front-right-chair', sitX: 63.9, sitY: 86.9, standX: 55, standY: 80.4, facing: 'north', sitPose: 'front', entryTileId: 'bottom-right-aisle'},
  {seatId: 'far-left-partial-back', label: 'Left desk', emptyVisualRef: 'library-habbo:far-left-partial-back-chair', sitX: 0.8, sitY: 54.2, standX: 12, standY: 72, facing: 'south', sitPose: 'front', entryTileId: 'left-lower-turn'},
  {seatId: 'far-left-partial-front', label: 'Left desk', emptyVisualRef: 'library-habbo:far-left-partial-front-chair', sitX: 6.4, sitY: 70.2, standX: 12, standY: 72, facing: 'north', sitPose: 'front', entryTileId: 'left-lower-turn'},
];

const ROOM_ARTWORK_SOURCE = './assets/library-habbo.png';
const SEMANTIC_ROOM_MAP = {
  mapId: 'radiotedu-library-study',
  source: ROOM_ARTWORK_SOURCE,
  model: 'workadventure-style-semantic-bitmap',
  areas: [
    ...FLOOR_WALK_ZONES.map((zone) => ({
      areaId: zone.id,
      type: 'walkable',
      points: zone.points,
    })),
    ...BLOCKED_DESK_ZONES.map((zone) => ({
      areaId: zone.id,
      type: 'blocked',
      collision: true,
      points: zone.points,
    })),
  ],
  entities: CHAIR_SEAT_TARGETS.map((seat) => ({
    entityId: seat.seatId,
    type: 'seat',
    emptyVisualRef: seat.emptyVisualRef,
    label: seat.label,
    position: {x: seat.sitX, y: seat.sitY},
    standPosition: {x: seat.standX, y: seat.standY},
    entryAreaId: seat.entryTileId,
    facing: seat.facing,
    action: {
      type: 'occupy-seat',
      prompt: `Sit at ${seat.label}`,
      occupiedPrompt: `${seat.label} is occupied`,
    },
    visual: {
      type: 'occupied-indicator',
      anchor: 'seat-center',
    },
  })),
};

function renderSeatHotspotsFromTargets() {
  scene.querySelectorAll('.seat-hotspot').forEach((node) => node.remove());
  const anchor = avatar;
  CHAIR_SEAT_TARGETS.forEach((target) => {
    const hotspot = document.createElement('button');
    hotspot.className = 'seat-hotspot';
    hotspot.type = 'button';
    hotspot.dataset.seat = target.seatId;
    hotspot.dataset.sitX = String(target.sitX);
    hotspot.dataset.sitY = String(target.sitY);
    hotspot.dataset.sitPose = target.sitPose ?? 'front';
    hotspot.dataset.entryTile = target.entryTileId;
    hotspot.style.setProperty('--x', `${target.sitX}%`);
    hotspot.style.setProperty('--y', `${target.sitY}%`);
    hotspot.setAttribute('aria-label', `Study at ${target.label || 'library chair'}`);
    scene.insertBefore(hotspot, anchor);
  });
  seats = [...document.querySelectorAll('[data-seat]')];
}

const SCENE_LAYER_REGISTRY = [
  {
    layerId: 'base-room',
    type: 'base-artwork',
    source: ROOM_ARTWORK_SOURCE,
    zBase: 0,
    role: 'preserved-generated-room',
  },
  ...FLOOR_WALK_ZONES.map((zone) => ({
    layerId: `walk-zone-${zone.id}`,
    type: 'floor',
    source: ROOM_ARTWORK_SOURCE,
    zBase: 100,
    points: zone.points,
  })),
  ...BLOCKED_DESK_ZONES.map((zone, index) => ({
    layerId: `furniture-${zone.id}`,
    type: 'furniture-occluder',
    source: ROOM_ARTWORK_SOURCE,
    zBase: 500 + index,
    points: zone.points,
  })),
  ...CHAIR_SEAT_TARGETS.map((seat) => ({
    layerId: `seat-${seat.seatId}-foreground`,
    type: 'seat-foreground',
    source: ROOM_ARTWORK_SOURCE,
    seatId: seat.seatId,
    emptyVisualRef: seat.emptyVisualRef,
    points: seat.foregroundMask || (seat.occlusion ? [
      {x: seat.occlusion.x1, y: seat.occlusion.y1},
      {x: seat.occlusion.x2, y: seat.occlusion.y1},
      {x: seat.occlusion.x2, y: seat.occlusion.y2},
      {x: seat.occlusion.x1, y: seat.occlusion.y2},
    ] : []),
  })),
];

const CHAIR_TAP_RADIUS = 3.2;
const chatMessages = [];
const POSTURE_CODES = {
  STAND: 'std',
  WALK: 'mv',
  SIT: 'sit',
};
const SEATED_POSE_IMAGES = {
  front: './assets/seated/avatar-front-sit-compact.png',
  forward: './assets/seated/avatar-north-sit.png',
};
const CHAIR_OCCUPIED_ASSETS = {};
const STANDING_AVATAR_IMAGES = {
  masc: {
    classic: './assets/avatar-standing/avatar-masc-classic.png',
    radio: './assets/avatar-standing/avatar-masc-radio.png',
    night: './assets/avatar-standing/avatar-masc-night.png',
    break: './assets/avatar-standing/avatar-masc-break.png',
  },
  fem: {
    classic: './assets/avatar-standing/avatar-fem-classic.png',
    radio: './assets/avatar-standing/avatar-fem-radio.png',
    night: './assets/avatar-standing/avatar-fem-night.png',
    break: './assets/avatar-standing/avatar-fem-break.png',
  },
};

const LOCAL_OCCUPANT_ID = 'local-student';
const COSMETIC_CATALOG = [
  {id: 'classic-shirt', slot: 'top', label: 'Classic shirt', priceGold: 0, className: 'outfit-classic'},
  {id: 'radio-hoodie', slot: 'top', label: 'RadioTEDU hoodie', priceGold: 120, className: 'outfit-radio'},
  {id: 'night-hoodie', slot: 'top', label: 'Night hoodie', priceGold: 160, className: 'outfit-night'},
  {id: 'break-shirt', slot: 'top', label: 'Break shirt', priceGold: 90, className: 'outfit-break'},
  {id: 'tedu-cap', slot: 'hat', label: 'TEDU cap', priceGold: 80, className: 'hat-tedu-cap'},
];
const AVATAR_LAYER_ORDER = ['body', 'skin', 'hair', 'clothing', 'hat', 'accessory'];
const LPC_SEATED_LAYER_FILES = {
  body: 'body.png',
  skin: 'skin.png',
  hair: 'hair.png',
  clothing: {
    'classic-shirt': 'clothing-classic-shirt.png',
    'radio-hoodie': 'clothing-radio-hoodie.png',
    'night-hoodie': 'clothing-night-hoodie.png',
    'break-shirt': 'clothing-classic-shirt.png',
  },
  hat: {
    'tedu-cap': 'hat.png',
  },
};
const RADIOTEDU_SEATED_LAYER_FILES = {
  body: 'body.png',
  skin: 'skin.png',
  hair: 'hair.png',
  clothing: {
    'classic-shirt': 'clothing-classic-shirt.png',
    'radio-hoodie': 'clothing-radio-hoodie.png',
    'night-hoodie': 'clothing-night-hoodie.png',
    'break-shirt': 'clothing-break-shirt.png',
  },
  hat: {
    'tedu-cap': 'hat.png',
  },
};
const DEFAULT_SEATED_OUTFIT = {
  body: 'seated-front',
  skin: 'warm',
  hair: 'brown',
  clothing: 'classic-shirt',
  hat: 'none',
  accessory: 'none',
};
const SEAT_OCCUPANCY_STATE = new Map();
const START_TILE_ID = 'bottom-center-aisle';
const START_PIXEL_POINT = findNearestImageWalkablePoint(mapPercentToImagePixel(WALKABLE_TILES[START_TILE_ID]));
const START_MAP_POINT = imagePixelToMapPercent(START_PIXEL_POINT);

const avatarState = {
  x: START_MAP_POINT.x,
  y: START_MAP_POINT.y,
  tileId: makeImageRouteTileId(START_PIXEL_POINT),
  bodyType: 'masc',
  outfit: 'classic',
  mode: 'idle',
  posture: POSTURE_CODES.STAND,
  walkStepIndex: 0,
  moveFrame: 0,
  stepTimer: 0,
  routeToken: 0,
  activeSeatId: '',
  activeChairTarget: null,
  isSeated: false,
  gold: 240,
  ownedCosmetics: ['classic-shirt'],
  equippedCosmetics: {
    top: 'classic-shirt',
    hat: 'none',
    accessory: 'none',
  },
  studyStartedAtMs: 0,
  studiedBeforeMs: 0,
  totalStudiedMs: 0,
};
window.libraryAvatarState = avatarState;

function setText(element, value) {
  if (element) {
    element.textContent = value;
  }
}

function wait(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function readEmbeddedStudyAuth() {
  if (window.RadioTEDUStudyAuth) {
    return window.RadioTEDUStudyAuth;
  }

  try {
    return JSON.parse(window.localStorage.getItem('radiotedu.study.auth') || 'null');
  } catch (error) {
    return null;
  }
}

let embeddedStudyAuth = readEmbeddedStudyAuth();

function getCurrentStudentName() {
  return embeddedStudyAuth?.user?.display_name || embeddedStudyAuth?.user?.email || 'You';
}

window.addEventListener('radiotedu-study-auth', (event) => {
  embeddedStudyAuth = event.detail;
  updateLeaderboard();
});

function formatTime(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function formatShortMinutes(ms) {
  return String(Math.max(0, Math.floor(ms / 60000)));
}

function loadLibraryHabboMapMask() {
  try {
    const request = new XMLHttpRequest();
    request.open('GET', './data/library-habbo-map-mask.json', false);
    request.send(null);
    if (request.status >= 200 && request.status < 300) {
      return JSON.parse(request.responseText);
    }
  } catch (error) {
    console.warn('Library pixel mask could not be loaded.', error);
  }

  return {
    imageWidth: MAP_IMAGE_SIZE.width,
    imageHeight: MAP_IMAGE_SIZE.height,
    gridSizePx: 28,
    floorPolygons: [],
    blockedPolygons: [],
    seatHotspots: [],
  };
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function mapPercentToImagePixel(point) {
  return {
    x: (point.x / 100) * MAP_IMAGE_SIZE.width,
    y: (point.y / 100) * MAP_IMAGE_SIZE.height,
  };
}

function imagePixelToMapPercent(point) {
  return {
    x: (point.x / MAP_IMAGE_SIZE.width) * 100,
    y: (point.y / MAP_IMAGE_SIZE.height) * 100,
    tileId: point.tileId,
  };
}

function getBaseCoverMetrics() {
  const rect = scene.getBoundingClientRect();
  const width = Math.max(1, rect.width);
  const height = Math.max(1, rect.height);
  const sceneAspect = width / height;
  const imageAspect = MAP_IMAGE_SIZE.width / MAP_IMAGE_SIZE.height;
  let renderedWidth = width;
  let renderedHeight = height;

  if (sceneAspect > imageAspect) {
    renderedHeight = width / imageAspect;
  } else {
    renderedWidth = height * imageAspect;
  }

  return {width, height, renderedWidth, renderedHeight};
}

function getCameraFocusPixel(base) {
  const sceneRect = scene.getBoundingClientRect();
  const blockingRects = [topHud, chatPanel, bottomHud]
    .map((element) => element?.getBoundingClientRect())
    .filter((rect) => rect && rect.width > 0 && rect.height > 0 && rect.bottom > sceneRect.top && rect.top < sceneRect.bottom)
    .map((rect) => ({
      top: Math.max(0, rect.top - sceneRect.top),
      bottom: Math.min(base.height, rect.bottom - sceneRect.top),
    }))
    .sort((left, right) => left.top - right.top);
  const gaps = [];
  let cursor = 0;

  for (const rect of blockingRects) {
    if (rect.top > cursor) {
      gaps.push({top: cursor, bottom: rect.top});
    }
    cursor = Math.max(cursor, rect.bottom);
  }
  if (cursor < base.height) {
    gaps.push({top: cursor, bottom: base.height});
  }

  const bestGap = gaps
    .map((gap) => ({...gap, height: gap.bottom - gap.top}))
    .sort((left, right) => right.height - left.height)[0] ?? {top: 0, bottom: base.height, height: base.height};
  const minPadding = Math.min(32, Math.max(8, base.height * 0.08));
  const safeTop = Math.max(minPadding, bestGap.top + Math.min(18, bestGap.height * 0.18));
  const safeBottom = Math.min(base.height - minPadding, bestGap.bottom - Math.min(18, bestGap.height * 0.18));
  const y = safeBottom > safeTop ? safeTop + ((safeBottom - safeTop) * 0.86) : base.height / 2;

  return {
    x: base.width / 2,
    y,
  };
}

function clampCameraCenter(base, renderedWidth, renderedHeight, focusPixel) {
  if (renderedWidth <= base.width) {
    mapCamera.centerX = 50;
  } else {
    const minCenterX = (focusPixel.x / renderedWidth) * 100;
    const maxCenterX = 100 - (((base.width - focusPixel.x) / renderedWidth) * 100);
    mapCamera.centerX = Math.max(minCenterX, Math.min(maxCenterX, mapCamera.centerX));
  }

  if (renderedHeight <= base.height) {
    mapCamera.centerY = 50;
  } else {
    const minCenterY = (focusPixel.y / renderedHeight) * 100;
    const maxCenterY = 100 - (((base.height - focusPixel.y) / renderedHeight) * 100);
    mapCamera.centerY = Math.max(minCenterY, Math.min(maxCenterY, mapCamera.centerY));
  }
}

function getSceneCoverMetrics() {
  const base = getBaseCoverMetrics();
  const renderedWidth = base.renderedWidth * mapCamera.zoom;
  const renderedHeight = base.renderedHeight * mapCamera.zoom;
  const focusPixel = getCameraFocusPixel(base);
  clampCameraCenter(base, renderedWidth, renderedHeight, focusPixel);

  return {
    ...base,
    renderedWidth,
    renderedHeight,
    offsetX: focusPixel.x - ((mapCamera.centerX / 100) * renderedWidth),
    offsetY: focusPixel.y - ((mapCamera.centerY / 100) * renderedHeight),
  };
}

function clampPercent(value) {
  return Math.max(0, Math.min(100, value));
}

function mapToScenePoint(point) {
  const metrics = getSceneCoverMetrics();
  return {
    x: ((metrics.offsetX + (point.x / 100) * metrics.renderedWidth) / metrics.width) * 100,
    y: ((metrics.offsetY + (point.y / 100) * metrics.renderedHeight) / metrics.height) * 100,
  };
}

function sceneToMapPoint(x, y) {
  const metrics = getSceneCoverMetrics();
  return {
    x: clampPercent((((x / 100) * metrics.width - metrics.offsetX) / metrics.renderedWidth) * 100),
    y: clampPercent((((y / 100) * metrics.height - metrics.offsetY) / metrics.renderedHeight) * 100),
  };
}

function sceneToMapPixel(x, y) {
  return mapPercentToImagePixel(sceneToMapPoint(x, y));
}

function updateZoomButtonState() {
  if (zoomInButton) {
    zoomInButton.disabled = mapCamera.zoom >= mapCamera.maxZoom - 0.01;
  }
  if (zoomOutButton) {
    zoomOutButton.disabled = mapCamera.zoom <= mapCamera.minZoom + 0.01;
  }
}

function applyMapCamera() {
  isApplyingMapCamera = true;
  const metrics = getSceneCoverMetrics();
  scene.style.setProperty('--map-bg-size', `${metrics.renderedWidth}px ${metrics.renderedHeight}px`);
  scene.style.setProperty('--map-bg-position', `${metrics.offsetX}px ${metrics.offsetY}px`);
  scene.dataset.zoom = mapCamera.zoom.toFixed(2);
  updateZoomButtonState();
  positionSeatHotspots();
  renderSeatStateOverlay(avatarState.activeChairTarget);
  renderMapDebugOverlay();
  setAvatarPosition(avatarState.x, avatarState.y);
  renderSeatOccluder(avatarState.activeChairTarget);
  setStepMarker(avatarState, stepMarker.classList.contains('active'));
  renderFloatingCounts();
  isApplyingMapCamera = false;
}

function focusMapCamera(point) {
  mapCamera.centerX = clampPercent(point.x);
  mapCamera.centerY = clampPercent(point.y);
  applyMapCamera();
}

function followAvatarCamera(point, options = {}) {
  if (!CAMERA_FOLLOW.enabled || isApplyingMapCamera || !point) {
    return;
  }

  const nextCenter = options.immediate
    ? {x: point.x, y: point.y}
    : {
      x: mapCamera.centerX + (point.x - mapCamera.centerX) * CAMERA_FOLLOW.lerp,
      y: mapCamera.centerY + (point.y - mapCamera.centerY) * CAMERA_FOLLOW.lerp,
    };

  const nextX = clampPercent(nextCenter.x);
  const nextY = clampPercent(nextCenter.y);
  if (Math.abs(nextX - mapCamera.centerX) < CAMERA_FOLLOW.epsilon && Math.abs(nextY - mapCamera.centerY) < CAMERA_FOLLOW.epsilon) {
    return;
  }

  mapCamera.centerX = nextX;
  mapCamera.centerY = nextY;
  applyMapCamera();
}

function setMapZoom(nextZoom, focusPoint = avatarState) {
  mapCamera.zoom = Math.max(mapCamera.minZoom, Math.min(mapCamera.maxZoom, nextZoom));
  mapCamera.centerX = clampPercent(focusPoint.x);
  mapCamera.centerY = clampPercent(focusPoint.y);
  applyMapCamera();
}

function tilePoint(tileId) {
  const seatId = getSeatIdFromStandTile(tileId);
  if (seatId) {
    const maskSeat = getMaskSeatHotspot(seatId);
    if (maskSeat?.walkTargetPx) {
      return {...imagePixelToMapPercent(findNearestImageStandingPoint(maskSeat.walkTargetPx)), tileId};
    }
  }
  if (typeof tileId === 'string' && tileId.startsWith('pixel-')) {
    const [, x, y] = tileId.match(/^pixel-(-?\d+)-(-?\d+)$/) ?? [];
    if (x && y) {
      return {...imagePixelToMapPercent({x: Number(x), y: Number(y)}), tileId};
    }
  }
  const graph = getWalkGraph();
  const point = graph.tiles[tileId] ?? WALKABLE_TILES[tileId] ?? WALKABLE_TILES.entrance;
  return {x: point.x, y: point.y, tileId};
}

function pointInPolygon(point, polygon) {
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
}

function pointToSegmentDistance(point, segmentStart, segmentEnd) {
  const dx = segmentEnd.x - segmentStart.x;
  const dy = segmentEnd.y - segmentStart.y;
  const lengthSquared = dx * dx + dy * dy || 1;
  const progress = Math.max(0, Math.min(1, (
    ((point.x - segmentStart.x) * dx) + ((point.y - segmentStart.y) * dy)
  ) / lengthSquared));
  return distance(point, {
    x: segmentStart.x + dx * progress,
    y: segmentStart.y + dy * progress,
  });
}

function pixelDistance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function makeImageRouteTileId(point) {
  return `pixel-${Math.round(point.x)}-${Math.round(point.y)}`;
}

function getMaskSeatHotspot(seatId) {
  return LIBRARY_HABBO_MAP_MASK.seatHotspots.find((seat) => seat.seatId === seatId) ?? null;
}

function getSeatIdFromStandTile(tileId) {
  return typeof tileId === 'string' && tileId.startsWith('seat-') && tileId.endsWith('-stand')
    ? tileId.slice(5, -6)
    : '';
}

function isInsideImagePixelFloor(point) {
  return LIBRARY_HABBO_MAP_MASK.floorPolygons.some((zone) => pointInPolygon(point, zone.points));
}

function isInsideImagePixelWalkableGrid(point) {
  const grid = LIBRARY_HABBO_MAP_MASK.walkableGrid;
  if (!grid?.rows?.length || !Number.isFinite(grid.resolutionPx) || grid.resolutionPx <= 0) {
    return true;
  }
  const column = Math.floor((point.x / grid.resolutionPx) + 0.5 + 1e-7);
  const row = Math.floor((point.y / grid.resolutionPx) + 0.5 + 1e-7);
  return grid.rows[row]?.[column] === '1';
}

function hasImagePixelWalkableGrid() {
  const grid = LIBRARY_HABBO_MAP_MASK.walkableGrid;
  return Boolean(grid?.rows?.length && Number.isFinite(grid.resolutionPx) && grid.resolutionPx > 0);
}

function isInsideImagePixelChair(point) {
  return LIBRARY_HABBO_MAP_MASK.blockedPolygons.some((zone) => zone.type === 'chair' && pointInPolygon(point, zone.points));
}

function isInsideImagePixelBlocked(point, options = {}) {
  return LIBRARY_HABBO_MAP_MASK.blockedPolygons.some((zone) => {
    if (options.includeChairs === false && zone.type === 'chair') {
      return false;
    }
    return pointInPolygon(point, zone.points);
  });
}

function getImagePixelBlockedClearance(point, options = {}) {
  return LIBRARY_HABBO_MAP_MASK.blockedPolygons.reduce((best, zone) => {
    if (options.includeChairs === false && zone.type === 'chair') {
      return best;
    }
    if (pointInPolygon(point, zone.points)) {
      return 0;
    }
    const zoneClearance = zone.points.reduce((nearest, zonePoint, index) => {
      const nextPoint = zone.points[(index + 1) % zone.points.length];
      return Math.min(nearest, pointToSegmentDistance(point, zonePoint, nextPoint));
    }, Number.POSITIVE_INFINITY);
    return Math.min(best, zoneClearance);
  }, Number.POSITIVE_INFINITY);
}

function isImagePixelWalkable(point, options = {}) {
  return point.x >= 0
    && point.x <= MAP_IMAGE_SIZE.width
    && point.y >= 0
    && point.y <= MAP_IMAGE_SIZE.height
    && isInsideImagePixelFloor(point)
    && isInsideImagePixelWalkableGrid(point)
    && (hasImagePixelWalkableGrid() || !isInsideImagePixelBlocked(point, options));
}

function imagePixelSegmentTouchesBlocked(from, to, options = {}) {
  const steps = Math.max(8, Math.ceil(pixelDistance(from, to) / 7));
  for (let index = 0; index <= steps; index += 1) {
    const progress = index / steps;
    const point = {
      x: from.x + (to.x - from.x) * progress,
      y: from.y + (to.y - from.y) * progress,
    };
    if (!isImagePixelWalkable(point, options)) {
      return true;
    }
  }
  return false;
}

function findNearestImageWalkablePoint(point, options = {}) {
  const rounded = {x: Math.round(point.x), y: Math.round(point.y)};
  if (isImagePixelWalkable(rounded, options)) {
    return rounded;
  }

  let best = null;
  for (let radius = IMAGE_PIXEL_GRID_SIZE / 2; radius <= IMAGE_PIXEL_GRID_SIZE * 16; radius += IMAGE_PIXEL_GRID_SIZE / 2) {
    for (let y = -radius; y <= radius; y += IMAGE_PIXEL_GRID_SIZE / 2) {
      for (let x = -radius; x <= radius; x += IMAGE_PIXEL_GRID_SIZE / 2) {
        if (Math.max(Math.abs(x), Math.abs(y)) !== radius) {
          continue;
        }
        const candidate = {
          x: Math.round(rounded.x + x),
          y: Math.round(rounded.y + y),
        };
        if (!isImagePixelWalkable(candidate, options)) {
          continue;
        }
        if (!best || pixelDistance(rounded, candidate) < pixelDistance(rounded, best)) {
          best = candidate;
        }
      }
    }
    if (best) {
      return best;
    }
  }

  return rounded;
}

function isImagePixelStandingSafe(point, options = {}) {
  if (!isImagePixelWalkable(point, options)) {
    return false;
  }
  if (!hasImagePixelWalkableGrid()) {
    return true;
  }

  const bodySamples = [
    {x: 0, y: 0},
    {x: -8, y: -6},
    {x: 8, y: -6},
    {x: 0, y: -14},
    {x: 0, y: -26},
    {x: 0, y: -38},
    {x: 0, y: -50},
  ];
  return bodySamples.every((sample) => isInsideImagePixelWalkableGrid({
    x: point.x + sample.x,
    y: point.y + sample.y,
  }));
}

function findNearestImageStandingPoint(point, options = {}) {
  const walkable = findNearestImageWalkablePoint(point, options);
  if (isImagePixelStandingSafe(walkable, options)) {
    return walkable;
  }

  const rounded = {x: Math.round(point.x), y: Math.round(point.y)};
  let best = null;
  const step = IMAGE_PIXEL_GRID_SIZE / 2;
  for (let radius = step; radius <= IMAGE_PIXEL_GRID_SIZE * 20; radius += step) {
    for (let y = -radius; y <= radius; y += step) {
      for (let x = -radius; x <= radius; x += step) {
        if (Math.max(Math.abs(x), Math.abs(y)) !== radius) {
          continue;
        }
        const candidate = {
          x: Math.round(rounded.x + x),
          y: Math.round(rounded.y + y),
        };
        if (!isImagePixelStandingSafe(candidate, options)) {
          continue;
        }
        if (!best || pixelDistance(rounded, candidate) < pixelDistance(rounded, best)) {
          best = candidate;
        }
      }
    }
    if (best) {
      return best;
    }
  }

  return walkable;
}

function getBlockedZoneClearance(point) {
  const pixelClearance = getImagePixelBlockedClearance(mapPercentToImagePixel(point), {includeChairs: false});
  return pixelClearance / (MAP_IMAGE_SIZE.width / 100);
}

function isInsideChairBlockedZone(point) {
  return isInsideImagePixelChair(mapPercentToImagePixel(point));
}

function isInsideDeskBlockedZone(point) {
  const imagePoint = mapPercentToImagePixel(point);
  if (hasImagePixelWalkableGrid() && isInsideImagePixelWalkableGrid(imagePoint)) {
    return false;
  }
  return isInsideImagePixelBlocked(imagePoint, {includeChairs: false});
}

function isInsideBlockedZone(point) {
  return isInsideChairBlockedZone(point) || isInsideDeskBlockedZone(point);
}

function isInsideFloorZone(point) {
  return isInsideImagePixelFloor(mapPercentToImagePixel(point));
}

function isWalkablePoint(point) {
  return isImagePixelWalkable(mapPercentToImagePixel(point));
}

function avatarVisualClearsFurniture(point) {
  const samples = [];
  for (let offset = 2; offset <= AVATAR_VISUAL_HEADROOM; offset += 2) {
    samples.push({x: point.x, y: point.y - offset});
  }
  samples.push(
    {x: point.x - AVATAR_VISUAL_HALF_WIDTH, y: point.y - AVATAR_VISUAL_HEADROOM * 0.62},
    {x: point.x + AVATAR_VISUAL_HALF_WIDTH, y: point.y - AVATAR_VISUAL_HEADROOM * 0.62}
  );

  return samples.every((sample) => (
    !isInsideDeskBlockedZone(sample)
    && getBlockedZoneClearance(sample) >= AVATAR_VISUAL_FURNITURE_CLEARANCE
  ));
}

function isStandingRoutePoint(point) {
  return isWalkablePoint(point)
    && getBlockedZoneClearance(point) >= FLOOR_TARGET_CLEARANCE
    && avatarVisualClearsFurniture(point);
}

function segmentTouchesFurniture(from, to) {
  const steps = Math.max(8, Math.ceil(distance(from, to) * 2));
  for (let index = 0; index <= steps; index += 1) {
    const progress = index / steps;
    const point = {
      x: from.x + (to.x - from.x) * progress,
      y: from.y + (to.y - from.y) * progress,
    };
    if (isInsideBlockedZone(point)) {
      return true;
    }
  }
  return false;
}

function segmentTouchesDeskFurniture(from, to) {
  const steps = Math.max(8, Math.ceil(distance(from, to) * 2));
  for (let index = 0; index <= steps; index += 1) {
    const progress = index / steps;
    const point = {
      x: from.x + (to.x - from.x) * progress,
      y: from.y + (to.y - from.y) * progress,
    };

    if (isInsideDeskBlockedZone(point)) {
      return true;
    }
  }
  return false;
}

function segmentStaysOnWalkableFloor(from, to) {
  const steps = Math.max(8, Math.ceil(distance(from, to) * 2));
  for (let index = 1; index < steps; index += 1) {
    const progress = index / steps;
    const point = {
      x: from.x + (to.x - from.x) * progress,
      y: from.y + (to.y - from.y) * progress,
    };

    if (!isWalkablePoint(point)) {
      return false;
    }
  }

  return true;
}

function canUseStraightWalkSegment(from, to) {
  return !segmentTouchesFurniture(from, to) && segmentStaysOnWalkableFloor(from, to);
}

function segmentKeepsAvatarClear(from, to) {
  const steps = Math.max(8, Math.ceil(distance(from, to) * 2));
  for (let index = 0; index <= steps; index += 1) {
    const progress = index / steps;
    const point = {
      x: from.x + (to.x - from.x) * progress,
      y: from.y + (to.y - from.y) * progress,
    };

    if (!isStandingRoutePoint(point)) {
      return false;
    }
  }
  return true;
}

function canUseStandingWalkSegment(from, to) {
  return canUseStraightWalkSegment(from, to) && segmentKeepsAvatarClear(from, to);
}

function assertRouteAvoidsFurniture(route, options = {}) {
  for (let index = 0; index < route.length; index += 1) {
    if (hasImagePixelWalkableGrid()) {
      if (!(options.allowFirstPoint && index === 0) && !isWalkablePoint(route[index])) {
        throw new Error(`Walk route uses a non-floor pixel-mask point at ${route[index].x},${route[index].y}`);
      }
      if (index > 0 && !segmentStaysOnWalkableFloor(route[index - 1], route[index])) {
        throw new Error(`Walk route leaves the pixel-mask floor between ${route[index - 1].tileId ?? 'sit'} and ${route[index].tileId ?? 'sit'}`);
      }
      continue;
    }

    const isChairStandPoint = options.allowChairStandPoints && route[index].tileId?.startsWith('seat-');
    const isBlocked = isInsideDeskBlockedZone(route[index])
      || (!isChairStandPoint && isInsideChairBlockedZone(route[index]));
    if (isBlocked) {
      throw new Error(`Walk route enters furniture at ${route[index].x},${route[index].y}`);
    }
    if (options.requireStandingClearance && !(options.allowFirstPoint && index === 0) && !isWalkablePoint(route[index])) {
      throw new Error(`Walk route uses a non-floor standing point at ${route[index].x},${route[index].y}`);
    }
    if (index > 0) {
      const touchesBlockedFurniture = options.allowChairStandPoints
        ? segmentTouchesDeskFurniture(route[index - 1], route[index])
        : segmentTouchesFurniture(route[index - 1], route[index]);
      if (touchesBlockedFurniture) {
        throw new Error(`Walk route crosses furniture between ${route[index - 1].tileId ?? 'sit'} and ${route[index].tileId ?? 'sit'}`);
      }
      if (options.requireStandingClearance && !segmentStaysOnWalkableFloor(route[index - 1], route[index])) {
        throw new Error(`Walk route clips furniture between ${route[index - 1].tileId ?? 'sit'} and ${route[index].tileId ?? 'sit'}`);
      }
    }
  }
  return route;
}

function makeGridTileId(x, y) {
  return `grid-${x.toFixed(2)}-${y.toFixed(2)}`;
}

function getImagePixelWalkGraph() {
  if (imagePixelWalkGraphCache) {
    return imagePixelWalkGraphCache;
  }

  const nodes = new Map();
  const neighbors = new Map();
  const addNode = (point, id = makeImageRouteTileId(point)) => {
    const snapped = {x: Math.round(point.x), y: Math.round(point.y), tileId: id};
    if (!isImagePixelWalkable(snapped)) {
      return null;
    }
    nodes.set(id, snapped);
    if (!neighbors.has(id)) {
      neighbors.set(id, []);
    }
    return snapped;
  };

  for (let y = 0; y <= MAP_IMAGE_SIZE.height; y += IMAGE_PIXEL_GRID_SIZE) {
    for (let x = 0; x <= MAP_IMAGE_SIZE.width; x += IMAGE_PIXEL_GRID_SIZE) {
      addNode({x, y});
    }
  }

  Object.entries(WALKABLE_TILES).forEach(([tileId, point]) => {
    addNode(findNearestImageWalkablePoint(mapPercentToImagePixel(point)), tileId);
  });

  LIBRARY_HABBO_MAP_MASK.seatHotspots.forEach((seat) => {
    addNode(findNearestImageStandingPoint(seat.walkTargetPx), getStandTileId({seatId: seat.seatId}));
  });

  const nodeList = [...nodes.values()];
  const buckets = new Map();
  const bucketKey = (point) => `${Math.round(point.x / IMAGE_PIXEL_GRID_SIZE)}:${Math.round(point.y / IMAGE_PIXEL_GRID_SIZE)}`;
  nodeList.forEach((node) => {
    const key = bucketKey(node);
    if (!buckets.has(key)) {
      buckets.set(key, []);
    }
    buckets.get(key).push(node);
  });

  for (const node of nodeList) {
    const bucketX = Math.round(node.x / IMAGE_PIXEL_GRID_SIZE);
    const bucketY = Math.round(node.y / IMAGE_PIXEL_GRID_SIZE);
    for (let yOffset = -2; yOffset <= 2; yOffset += 1) {
      for (let xOffset = -2; xOffset <= 2; xOffset += 1) {
        const nearby = buckets.get(`${bucketX + xOffset}:${bucketY + yOffset}`) ?? [];
        for (const nextNode of nearby) {
          if (node.tileId >= nextNode.tileId) {
            continue;
          }
      const stepDistance = pixelDistance(node, nextNode);
      if (stepDistance > IMAGE_PIXEL_GRID_SIZE * 1.55) {
        continue;
      }
      if (imagePixelSegmentTouchesBlocked(node, nextNode)) {
        continue;
      }
      neighbors.get(node.tileId).push(nextNode.tileId);
      neighbors.get(nextNode.tileId).push(node.tileId);
        }
      }
    }
  }

  imagePixelWalkGraphCache = {nodes, neighbors};
  return imagePixelWalkGraphCache;
}

function connectDynamicPixelNode(graph, nodes, neighbors, point, tileId) {
  nodes.set(tileId, {...point, tileId});
  neighbors.set(tileId, []);
  const candidates = [...graph.nodes.values()]
    .map((node) => ({node, distance: pixelDistance(point, node)}))
    .sort((left, right) => left.distance - right.distance)
    .slice(0, 80);

  const linked = [];
  for (const {node} of candidates) {
    if (linked.length >= 10) {
      break;
    }
    if (pixelDistance(point, node) > IMAGE_PIXEL_GRID_SIZE * 3.1) {
      continue;
    }
    if (imagePixelSegmentTouchesBlocked(point, node)) {
      continue;
    }
    neighbors.get(tileId).push(node.tileId);
    neighbors.get(node.tileId).push(tileId);
    linked.push(node.tileId);
  }

  return linked.length > 0;
}

function findImagePixelRoute(fromPixel, toPixel, options = {}) {
  const start = findNearestImageWalkablePoint(fromPixel, options);
  const end = findNearestImageWalkablePoint(toPixel, options);
  if (pixelDistance(start, end) <= IMAGE_PIXEL_GRID_SIZE * 1.6 && !imagePixelSegmentTouchesBlocked(start, end, options)) {
    return [start, end];
  }

  const graph = getImagePixelWalkGraph();
  const nodes = new Map(graph.nodes);
  const neighbors = new Map([...graph.neighbors.entries()].map(([id, ids]) => [id, [...ids]]));
  const startId = 'dynamic-start';
  const endId = 'dynamic-end';
  const startLinked = connectDynamicPixelNode(graph, nodes, neighbors, start, startId);
  const endLinked = connectDynamicPixelNode(graph, nodes, neighbors, end, endId);
  if (!startLinked || !endLinked) {
    return [start];
  }

  const openSet = [{tileId: startId, priority: 0}];
  const previous = new Map();
  const cost = new Map([[startId, 0]]);

  while (openSet.length) {
    openSet.sort((left, right) => left.priority - right.priority);
    const current = openSet.shift().tileId;
    if (current === endId) {
      const route = [current];
      let cursor = current;
      while (previous.has(cursor)) {
        cursor = previous.get(cursor);
        route.unshift(cursor);
      }
      return route.map((tileId) => nodes.get(tileId));
    }

    const currentPoint = nodes.get(current);
    for (const neighbor of neighbors.get(current) ?? []) {
      const neighborPoint = nodes.get(neighbor);
      const nextCost = (cost.get(current) ?? 0) + pixelDistance(currentPoint, neighborPoint);
      if (cost.has(neighbor) && nextCost >= cost.get(neighbor)) {
        continue;
      }
      previous.set(neighbor, current);
      cost.set(neighbor, nextCost);
      openSet.push({
        tileId: neighbor,
        priority: nextCost + pixelDistance(neighborPoint, end),
      });
    }
  }

  return [start];
}

function getWalkGraph() {
  if (walkGraphCache) {
    return walkGraphCache;
  }

  const tiles = {};
  Object.entries(WALKABLE_TILES).forEach(([tileId, point]) => {
    tiles[tileId] = {...point, tileId};
  });

  for (let y = 34; y <= 96; y += HABBO_WALK_STEP) {
    for (let x = -2; x <= 100; x += HABBO_WALK_STEP) {
      const point = {
        x: Number(x.toFixed(2)),
        y: Number(y.toFixed(2)),
      };

      if (!isStandingRoutePoint(point)) {
        continue;
      }

      const tileId = makeGridTileId(point.x, point.y);
      tiles[tileId] = {...point, tileId};
    }
  }

  const tileList = Object.values(tiles);
  const neighbors = {};
  tileList.forEach((tile) => {
    neighbors[tile.tileId] = [];
  });

  Object.entries(WALKABLE_TILES).forEach(([tileId, point]) => {
    point.neighbors.forEach((neighbor) => {
      if (!tiles[neighbor]) {
        return;
      }
      const connectsSeatStand = tileId.startsWith('seat-') || neighbor.startsWith('seat-');
      const canUseSegment = connectsSeatStand
        ? !segmentTouchesFurniture(tiles[tileId], tiles[neighbor])
        : canUseStandingWalkSegment(tiles[tileId], tiles[neighbor]);
      if (!canUseSegment) {
        return;
      }
      if (!neighbors[tileId].includes(neighbor)) {
        neighbors[tileId].push(neighbor);
      }
      if (!neighbors[neighbor].includes(tileId)) {
        neighbors[neighbor].push(tileId);
      }
    });
  });

  for (let index = 0; index < tileList.length; index += 1) {
    const tile = tileList[index];
    for (let nextIndex = index + 1; nextIndex < tileList.length; nextIndex += 1) {
      const nextTile = tileList[nextIndex];
      const stepDistance = distance(tile, nextTile);
      if (stepDistance > HABBO_WALK_STEP * 1.55) {
        continue;
      }
      if (!canUseStandingWalkSegment(tile, nextTile)) {
        continue;
      }

      neighbors[tile.tileId].push(nextTile.tileId);
      neighbors[nextTile.tileId].push(tile.tileId);
    }
  }

  walkGraphCache = {tiles, neighbors};
  return walkGraphCache;
}

function canUseTileAsFloorTarget(tileId, point) {
  return FLOOR_TAP_TARGET_TILE_IDS.has(tileId)
    && !tileId.startsWith('grid-')
    && !tileId.startsWith('seat-')
    && isStandingRoutePoint(point);
}

function findNearestTileId(point, options = {}) {
  const graph = getWalkGraph();
  const tileIds = Object.keys(graph.tiles).filter((tileId) => (
    options.floorTargetOnly ? canUseTileAsFloorTarget(tileId, graph.tiles[tileId]) : true
  ));
  const candidates = tileIds.length ? tileIds : Object.keys(graph.tiles);
  return candidates.reduce((bestId, tileId) => (
    distance(point, graph.tiles[tileId]) < distance(point, graph.tiles[bestId]) ? tileId : bestId
  ), candidates.includes('entrance') ? 'entrance' : candidates[0]);
}

function findNearestWalkablePoint(x, y) {
  const walkablePixel = findNearestImageWalkablePoint(mapPercentToImagePixel({x, y}));
  return {
    ...imagePixelToMapPercent(walkablePixel),
    tileId: makeImageRouteTileId(walkablePixel),
  };
}

function canVisitRouteTile(tileId, endTileId, options = {}) {
  if (tileId === endTileId) {
    return true;
  }
  if (options.avoidSeatStandTiles && tileId.startsWith('seat-')) {
    return false;
  }
  return true;
}

function findRouteTiles(startTileId, endTileId, options = {}) {
  if (startTileId === endTileId) {
    return [startTileId];
  }

  const graph = getWalkGraph();
  const openSet = [{tileId: startTileId, priority: 0}];
  const previous = new Map();
  const cost = new Map([[startTileId, 0]]);
  const visited = new Set([startTileId]);

  while (openSet.length) {
    openSet.sort((a, b) => a.priority - b.priority);
    const current = openSet.shift().tileId;

    if (current === endTileId) {
      const route = [current];
      let cursor = current;
      while (previous.has(cursor)) {
        cursor = previous.get(cursor);
        route.unshift(cursor);
      }
      return route;
    }

    const currentPoint = graph.tiles[current];
    for (const neighbor of graph.neighbors[current] ?? []) {
      if (!canVisitRouteTile(neighbor, endTileId, options)) {
        continue;
      }
      const neighborPoint = graph.tiles[neighbor];
      const nextCost = (cost.get(current) ?? 0) + distance(currentPoint, neighborPoint);
      if (cost.has(neighbor) && nextCost >= cost.get(neighbor)) {
        continue;
      }
      visited.add(neighbor);
      previous.set(neighbor, current);
      cost.set(neighbor, nextCost);
      openSet.push({
        tileId: neighbor,
        priority: nextCost + distance(neighborPoint, graph.tiles[endTileId]),
      });
    }
  }

  return [startTileId];
}

function smoothWalkRoute(route) {
  if (route.length <= 2) {
    return route;
  }

  const smoothedRoute = [route[0]];
  let anchorIndex = 0;

  while (anchorIndex < route.length - 1) {
    let nextIndex = route.length - 1;
    while (
      nextIndex > anchorIndex + 1
      && !canUseStraightWalkSegment(route[anchorIndex], route[nextIndex])
    ) {
      nextIndex -= 1;
    }

    smoothedRoute.push(route[nextIndex]);
    anchorIndex = nextIndex;
  }

  return smoothedRoute;
}

function setAvatarPosition(x, y, options = {}) {
  const scenePoint = mapToScenePoint({x, y});
  avatarState.x = x;
  avatarState.y = y;
  avatar.style.left = `${scenePoint.x}%`;
  avatar.style.top = `${scenePoint.y}%`;
  setAvatarDepth({x, y});
  if (options.followCamera) {
    followAvatarCamera({x, y}, options.camera);
  }
}

function setAvatarDepth(point) {
  const depth = Math.round((point.y * 10) + (point.x / 10));
  avatar.style.zIndex = String(1200 + depth);
  stepMarker.style.zIndex = String(900 + depth);
  if (seatOccluder && !seatOccluder.hidden) {
    seatOccluder.style.zIndex = String(1201 + depth);
  }
}

function getWalkDirection(from, to) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;

  if (Math.abs(dx) > Math.abs(dy) * 1.35) {
    return dx >= 0 ? 'east' : 'west';
  }
  if (Math.abs(dy) > Math.abs(dx) * 1.35) {
    return dy >= 0 ? 'south' : 'north';
  }
  if (dx >= 0 && dy >= 0) {
    return 'south-east';
  }
  if (dx < 0 && dy >= 0) {
    return 'south-west';
  }
  if (dx >= 0 && dy < 0) {
    return 'north-east';
  }
  return 'north-west';
}

function setAvatarFacingDirection(direction) {
  avatar.classList.remove(
    'facing-north',
    'facing-north-east',
    'facing-east',
    'facing-south-east',
    'facing-south',
    'facing-south-west',
    'facing-west',
    'facing-north-west'
  );
  avatar.classList.add(`facing-${direction}`);
}

function setAvatarFacing(from, to) {
  setAvatarFacingDirection(getWalkDirection(from, to));
}

function getRouteDistance(route) {
  let total = 0;
  for (let index = 1; index < route.length; index += 1) {
    total += distance(route[index - 1], route[index]);
  }
  return total;
}

function getRouteFrame(route, progress) {
  const routeLength = Math.max(0.001, getRouteDistance(route));
  let remaining = routeLength * Math.max(0, Math.min(1, progress));

  for (let index = 1; index < route.length; index += 1) {
    const from = route[index - 1];
    const to = route[index];
    const segmentLength = Math.max(0.001, distance(from, to));

    if (remaining <= segmentLength || index === route.length - 1) {
      const segmentProgress = remaining / segmentLength;
      return {
        from,
        to,
        point: {
          x: from.x + (to.x - from.x) * segmentProgress,
          y: from.y + (to.y - from.y) * segmentProgress,
          tileId: to.tileId,
        },
      };
    }

    remaining -= segmentLength;
  }

  const last = route[route.length - 1];
  return {
    from: route[Math.max(0, route.length - 2)],
    to: last,
    point: last,
  };
}

function setStepMarker(point, isActive) {
  const scenePoint = mapToScenePoint(point);
  stepMarker.style.left = `${scenePoint.x}%`;
  stepMarker.style.top = `${scenePoint.y}%`;
  stepMarker.classList.toggle('active', isActive);
}

function positionSeatHotspots() {
  seats.forEach((seat) => {
    const scenePoint = mapToScenePoint({
      x: Number.parseFloat(seat.dataset.sitX),
      y: Number.parseFloat(seat.dataset.sitY),
    });
    seat.style.setProperty('--x', `${scenePoint.x}%`);
    seat.style.setProperty('--y', `${scenePoint.y}%`);
  });
}

function occlusionBoxToPolygon(box) {
  const frontY = box.y1 + ((box.y2 - box.y1) * 0.72);
  return [
    {x: box.x1, y: frontY},
    {x: box.x2, y: frontY},
    {x: box.x2, y: box.y2},
    {x: box.x1, y: box.y2},
  ];
}

function hideSeatOccluder() {
  if (seatOccluder) {
    seatOccluder.hidden = true;
  }
}

function hideSeatStateOverlay() {
  if (seatStateLayer) {
    seatStateLayer.hidden = true;
    seatStateLayer.replaceChildren();
  }
}

function normalizeSeatOccupant(occupant = {}) {
  return {
    userId: occupant.userId || LOCAL_OCCUPANT_ID,
    displayName: occupant.displayName || 'Student',
    outfit: {...DEFAULT_SEATED_OUTFIT, ...(occupant.outfit || {})},
  };
}

function cloneSeatOccupant(occupant) {
  const normalized = normalizeSeatOccupant(occupant);
  return {
    ...normalized,
    outfit: {...normalized.outfit},
  };
}

function cloneSeatTarget(target) {
  return {
    ...target,
    layerBounds: target.layerBounds ? {...target.layerBounds} : undefined,
    spriteOffset: target.spriteOffset ? {...target.spriteOffset} : undefined,
    avatarClip: target.avatarClip,
    hitArea: target.hitArea ? {...target.hitArea} : undefined,
    zLayer: target.zLayer ? {...target.zLayer} : undefined,
    occupiedAsset: target.occupiedAsset ? {...target.occupiedAsset} : undefined,
    foregroundMask: Array.isArray(target.foregroundMask) ? target.foregroundMask.map((point) => ({...point})) : undefined,
    occlusion: target.occlusion ? {...target.occlusion} : null,
  };
}

function cloneSceneLayer(layer) {
  return {
    ...layer,
    points: Array.isArray(layer.points) ? layer.points.map((point) => ({...point})) : undefined,
  };
}

function cloneSemanticRoomMap() {
  return {
    ...SEMANTIC_ROOM_MAP,
    areas: SEMANTIC_ROOM_MAP.areas.map((area) => ({
      ...area,
      points: Array.isArray(area.points) ? area.points.map((point) => ({...point})) : undefined,
    })),
    entities: SEMANTIC_ROOM_MAP.entities.map((entity) => ({
      ...entity,
      position: {...entity.position},
      standPosition: {...entity.standPosition},
      action: {...entity.action},
      visual: {...entity.visual},
    })),
  };
}

function getSeatStateSnapshot() {
  return Object.fromEntries(CHAIR_SEAT_TARGETS.map((seatTarget) => {
    const seat = cloneSeatTarget(buildSeatTarget(seatTarget));
    const occupant = SEAT_OCCUPANCY_STATE.get(seat.seatId);
    return [seat.seatId, {
      seat,
      occupied: Boolean(occupant),
      occupant: occupant ? cloneSeatOccupant(occupant) : null,
      state: occupant ? 'occupied' : 'empty',
    }];
  }));
}

function createLocalSeatOccupant() {
  const clothingByOutfit = {
    classic: 'classic-shirt',
    radio: 'radio-hoodie',
    night: 'night-hoodie',
    break: 'break-shirt',
  };
  return normalizeSeatOccupant({
    userId: LOCAL_OCCUPANT_ID,
    displayName: getCurrentStudentName(),
    outfit: {
      ...DEFAULT_SEATED_OUTFIT,
      clothing: clothingByOutfit[avatarState.outfit] ?? DEFAULT_SEATED_OUTFIT.clothing,
      hat: avatarState.equippedCosmetics.hat,
    },
  });
}

function getSeatDefinition(seatId) {
  const target = CHAIR_SEAT_TARGETS.find((seatTarget) => seatTarget.seatId === seatId);
  return target ? buildSeatTarget(target) : null;
}

function clearLocalSeatOccupant() {
  if (!avatarState.activeSeatId) {
    return;
  }
  const occupant = SEAT_OCCUPANCY_STATE.get(avatarState.activeSeatId);
  if (occupant?.userId === LOCAL_OCCUPANT_ID) {
    SEAT_OCCUPANCY_STATE.delete(avatarState.activeSeatId);
  }
}

function setSeatOccupant(seatId, occupant) {
  const target = getSeatDefinition(seatId);
  if (!target) {
    return false;
  }
  const normalizedOccupant = normalizeSeatOccupant(occupant);
  if (normalizedOccupant.userId) {
    SEAT_OCCUPANCY_STATE.forEach((existingOccupant, existingSeatId) => {
      if (existingSeatId !== seatId && existingOccupant.userId === normalizedOccupant.userId) {
        SEAT_OCCUPANCY_STATE.delete(existingSeatId);
      }
    });
  }
  SEAT_OCCUPANCY_STATE.set(seatId, normalizedOccupant);
  renderSeatStateLayers();
  return true;
}

function clearSeatOccupant(seatId) {
  SEAT_OCCUPANCY_STATE.delete(seatId);
  renderSeatStateLayers();
}

function clearAllSeatOccupants() {
  SEAT_OCCUPANCY_STATE.clear();
  renderSeatStateLayers();
}

function positionSeatStateSlot(slot, bounds) {
  if (!slot || !bounds) {
    return;
  }

  const topLeft = mapToScenePoint({x: bounds.left, y: bounds.top});
  const bottomRight = mapToScenePoint({x: bounds.left + bounds.width, y: bounds.top + bounds.height});
  slot.style.left = `${topLeft.x}%`;
  slot.style.top = `${topLeft.y}%`;
  slot.style.width = `${bottomRight.x - topLeft.x}%`;
  slot.style.height = `${bottomRight.y - topLeft.y}%`;
}

function getLayeredSeatBounds(target) {
  if (target.layerBounds) {
    const offset = target.spriteOffset || {x: 0, y: 0};
    return {
      ...target.layerBounds,
      left: target.layerBounds.left + (offset.x || 0),
      top: target.layerBounds.top + (offset.y || 0),
    };
  }
  const offset = target.spriteOffset || {x: 0, y: 0};
  return {
    left: target.sitX - 2.8 + (offset.x || 0),
    top: target.sitY - 6.6 + (offset.y || 0),
    width: 5.6,
    height: 6.8,
  };
}

function getSemanticSeatBounds(target) {
  if (target.indicatorBounds) {
    return {...target.indicatorBounds};
  }
  return {
    left: target.sitX - 2.45,
    top: target.sitY - 4.85,
    width: 4.9,
    height: 4.9,
  };
}

function getOccupantInitials(occupant) {
  const normalized = normalizeSeatOccupant(occupant);
  return normalized.displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('') || 'RT';
}

function buildSeatLayerModel(seatTarget, occupant) {
  const target = typeof seatTarget === 'string' ? getSeatDefinition(seatTarget) : seatTarget;
  if (!target || !occupant) {
    return null;
  }
  const normalized = normalizeSeatOccupant(occupant);
  return {
    seatId: target.seatId,
    type: 'semantic-occupied-seat',
    bounds: getSemanticSeatBounds(target),
    facing: target.facing,
    entityId: target.seatId,
    action: 'occupy-seat',
    state: 'occupied',
    prompt: `${normalized.displayName} is studying here`,
    occupant: normalized,
    indicator: {
      initials: getOccupantInitials(normalized),
      clothing: normalized.outfit.clothing,
      hat: normalized.outfit.hat,
      skin: normalized.outfit.skin,
      hair: normalized.outfit.hair,
    },
  };
}

function renderFlatSeatSlot(slot, model) {
  const image = document.createElement('img');
  image.className = 'seat-state-crop';
  image.alt = '';
  image.draggable = false;
  image.setAttribute('src', model.asset.src);
  slot.append(image);
}

function renderLayeredSeatSlot(slot, model) {
  const avatarNode = document.createElement('div');
  avatarNode.className = 'seated-layered-avatar';
  avatarNode.dataset.facing = model.facing;
  avatarNode.dataset.action = model.avatarAction || 'sit';
  avatarNode.dataset.bodyDirection = model.bodyDirection || model.assetDirection;
  avatarNode.dataset.headDirection = model.headDirection || model.assetDirection;
  if (model.avatarClip) {
    avatarNode.style.setProperty('--seat-avatar-clip', model.avatarClip);
  }
  model.layers.forEach((layer) => {
    const layerNode = document.createElement('span');
    layerNode.className = `seated-avatar-layer seated-avatar-layer-${layer.name}`;
    layerNode.dataset.layer = layer.name;
    layerNode.dataset.value = layer.value;
    if (layer.src) {
      layerNode.style.backgroundImage = `url("${layer.src}")`;
    }
    avatarNode.append(layerNode);
  });
  slot.append(avatarNode);
}

function renderSemanticSeatSlot(slot, model) {
  const marker = document.createElement('div');
  marker.className = 'seat-occupancy-marker';
  marker.dataset.entityId = model.entityId;
  marker.dataset.action = model.action;
  marker.dataset.state = model.state;
  marker.dataset.clothing = model.indicator.clothing;

  const portrait = document.createElement('div');
  portrait.className = 'seat-occupancy-portrait';
  portrait.textContent = model.indicator.initials;
  portrait.dataset.hat = model.indicator.hat;

  const label = document.createElement('div');
  label.className = 'seat-occupancy-label';
  label.textContent = model.occupant.displayName;

  marker.append(portrait, label);
  slot.append(marker);
}

function getSeatForegroundMaskPoints(target) {
  if (Array.isArray(target?.foregroundMask) && target.foregroundMask.length >= 3) {
    return target.foregroundMask;
  }
  return target?.occlusion ? occlusionBoxToPolygon(target.occlusion) : null;
}

function renderSeatForegroundMask(target, depth) {
  const maskPoints = getSeatForegroundMaskPoints(target);
  if (!seatStateLayer || !maskPoints) {
    return;
  }
  const foreground = document.createElement('div');
  foreground.className = 'seat-state-foreground';
  foreground.setAttribute('data-seat-id', target.seatId);
  foreground.dataset.seatId = target.seatId;
  foreground.style.zIndex = String(depth + (target.zLayer?.foregroundOffset ?? 1));
  foreground.style.clipPath = `polygon(${maskPoints
    .map((point) => mapToScenePoint(point))
    .map((point) => `${point.x}% ${point.y}%`)
    .join(', ')})`;
  seatStateLayer.append(foreground);
}

function renderSeatStateLayers() {
  if (!seatStateLayer) {
    return;
  }
  seatStateLayer.replaceChildren();
  SEAT_OCCUPANCY_STATE.forEach((occupant, seatId) => {
    const target = getSeatDefinition(seatId);
    const model = buildSeatLayerModel(target, occupant);
    if (!model) {
      return;
    }
    const slot = document.createElement('div');
    slot.className = `seat-state-slot seat-state-slot-${model.type}`;
    slot.setAttribute('data-seat-id', model.seatId);
    slot.dataset.seatId = model.seatId;
    slot.dataset.renderMode = model.type;
    const depth = target.zLayer?.occupiedBase ?? 1000 + Math.round(target.sitY * 10);
    slot.style.zIndex = String(depth);
    positionSeatStateSlot(slot, model.bounds);
    if (model.type === 'semantic-occupied-seat') {
      renderSemanticSeatSlot(slot, model);
    } else if (model.type === 'flat-accepted-asset') {
      renderFlatSeatSlot(slot, model);
    } else {
      renderLayeredSeatSlot(slot, model);
    }
    seatStateLayer.append(slot);
  });
  seatStateLayer.hidden = SEAT_OCCUPANCY_STATE.size === 0;
}

function renderSeatStateOverlay() {
  renderSeatStateLayers();
}

function renderSeatOccluder(target) {
  if (target?.seatId || target?.occupiedAsset) {
    hideSeatOccluder();
    return;
  }

  const maskPoints = Array.isArray(target?.foregroundMask) && target.foregroundMask.length >= 3
    ? target.foregroundMask
    : target?.occlusion
      ? occlusionBoxToPolygon(target.occlusion)
      : null;
  if (!seatOccluder || !maskPoints || avatarState.posture !== POSTURE_CODES.SIT) {
    hideSeatOccluder();
    return;
  }

  const points = maskPoints
    .map((point) => mapToScenePoint(point))
    .map((point) => `${point.x}% ${point.y}%`)
    .join(', ');
  seatOccluder.style.clipPath = `polygon(${points})`;
  seatOccluder.hidden = false;
  const avatarDepth = Number.parseInt(avatar.style.zIndex, 10);
  if (Number.isFinite(avatarDepth)) {
    seatOccluder.style.zIndex = String(avatarDepth + 1);
  }
}

function createDebugSvgElement(tagName, attributes = {}) {
  const element = document.createElementNS('http://www.w3.org/2000/svg', tagName);
  Object.entries(attributes).forEach(([name, value]) => {
    element.setAttribute(name, String(value));
  });
  return element;
}

function renderMapDebugOverlay() {
  if (!mapDebugLayer) {
    return;
  }

  mapDebugLayer.hidden = !mapDebugEnabled;
  mapDebugLayer.replaceChildren();
  if (!mapDebugEnabled) {
    return;
  }

  mapDebugLayer.setAttribute('viewBox', '0 0 100 100');
  const pixelPolygonToScenePoints = (points) => points
    .map((point) => mapToScenePoint(imagePixelToMapPercent(point)))
    .map((point) => `${point.x},${point.y}`)
    .join(' ');

  LIBRARY_HABBO_MAP_MASK.floorPolygons.forEach((zone) => {
    mapDebugLayer.append(createDebugSvgElement('polygon', {
      class: 'debug-floor',
      points: pixelPolygonToScenePoints(zone.points),
      'data-zone': zone.id,
    }));
  });

  [...getImagePixelWalkGraph().nodes.values()].forEach((node, index) => {
    if (index % 4 !== 0) {
      return;
    }
    const scenePoint = mapToScenePoint(imagePixelToMapPercent(node));
    mapDebugLayer.append(createDebugSvgElement('circle', {
      class: 'debug-road',
      cx: scenePoint.x,
      cy: scenePoint.y,
      r: 0.18,
    }));
  });

  LIBRARY_HABBO_MAP_MASK.blockedPolygons.forEach((zone) => {
    mapDebugLayer.append(createDebugSvgElement('polygon', {
      class: zone.type === 'chair' ? 'debug-chair-block' : 'debug-desk',
      points: pixelPolygonToScenePoints(zone.points),
      'data-zone': zone.id,
    }));
  });

  LIBRARY_HABBO_MAP_MASK.seatHotspots.forEach((seat) => {
    mapDebugLayer.append(createDebugSvgElement('polygon', {
      class: 'debug-chair',
      points: pixelPolygonToScenePoints(seat.polygon),
      'data-seat': seat.seatId,
    }));
    const walkPoint = mapToScenePoint(imagePixelToMapPercent(seat.walkTargetPx));
    mapDebugLayer.append(createDebugSvgElement('circle', {
      class: 'debug-stand',
      cx: walkPoint.x,
      cy: walkPoint.y,
      r: 0.55,
      'data-seat': seat.seatId,
    }));
  });

  BLOCKED_DESK_ZONES.forEach((zone) => {
    const points = zone.points
      .map((point) => {
        const scenePoint = mapToScenePoint(point);
        return `${scenePoint.x},${scenePoint.y}`;
      })
      .join(' ');
    mapDebugLayer.append(createDebugSvgElement('polygon', {
      class: 'debug-desk',
      points,
      'data-zone': zone.id,
    }));
  });
}

function setAvatarStep(index) {
  avatar.classList.remove('step-0', 'step-1', 'step-2', 'step-3');
  avatar.classList.add(`step-${index % 4}`);
}

function stopStepCycle() {
  window.clearInterval(avatarState.stepTimer);
  avatarState.stepTimer = 0;
  avatar.classList.remove('step-0', 'step-1', 'step-2', 'step-3');
}

function startStepCycle() {
  stopStepCycle();
  avatarState.walkStepIndex = 0;
  setAvatarStep(avatarState.walkStepIndex);
  avatarState.stepTimer = window.setInterval(() => {
    avatarState.walkStepIndex = (avatarState.walkStepIndex + 1) % 4;
    setAvatarStep(avatarState.walkStepIndex);
  }, 140);
}

function setAvatarPosture(posture) {
  avatarState.posture = posture;
  avatar.dataset.posture = posture;
  updateSeatedAvatarModel();
  if (posture !== POSTURE_CODES.SIT) {
    avatar.dataset.seatFacing = '';
    avatar.dataset.sitPose = '';
    avatar.dataset.visualPose = '';
    avatar.dataset.visualHidden = 'false';
  }
}

function getSeatedAvatarModel(pose = avatar.dataset.sitPose || 'front') {
  const target = avatarState.activeChairTarget;
  const visualPose = target?.visualPose ?? pose;
  const hidden = target?.visualHidden === true
    || Boolean(target?.occupiedAsset)
    || Boolean(target?.seatId && SEAT_OCCUPANCY_STATE.has(target.seatId) && target.seatId !== avatarState.activeSeatId);
  return {
    hidden,
    src: hidden ? 'none' : SEATED_POSE_IMAGES[visualPose] ?? SEATED_POSE_IMAGES[pose] ?? SEATED_POSE_IMAGES.front,
    width: hidden ? 1 : Number.isFinite(target?.visualWidth) ? target.visualWidth : 32,
    height: hidden ? 1 : Number.isFinite(target?.visualHeight) ? target.visualHeight : 34,
  };
}

function updateSeatedAvatarModel() {
  const model = getSeatedAvatarModel();
  avatar.style.setProperty('--seated-avatar-image', model.hidden ? 'none' : `url("${model.src}")`);
  avatar.style.setProperty('--seated-avatar-width', `${model.width}px`);
  avatar.style.setProperty('--seated-avatar-height', `${model.height}px`);
  avatar.dataset.visualHidden = model.hidden ? 'true' : 'false';
  avatar.dataset.outfit = avatarState.outfit;
}

function setAvatarSitPose(pose) {
  const nextPose = pose === 'forward' ? 'forward' : 'front';
  const visualPose = avatarState.activeChairTarget?.visualPose ?? nextPose;
  avatar.dataset.sitPose = nextPose;
  avatar.dataset.visualPose = visualPose;
  avatar.dataset.visualHidden = (avatarState.activeChairTarget?.visualHidden === true || Boolean(avatarState.activeChairTarget?.occupiedAsset)) ? 'true' : 'false';
  avatar.dataset.seatFacing = visualPose;
  updateSeatedAvatarModel();
}

function setAvatarMode(mode) {
  avatarState.mode = mode;
  avatar.classList.remove('idle', 'walking', 'studying');
  avatar.classList.add(mode);
  if (mode === 'walking') {
    clearLocalSeatOccupant();
    hideSeatOccluder();
    renderSeatStateLayers();
    setAvatarPosture(POSTURE_CODES.WALK);
    startStepCycle();
    return;
  }
  if (mode === 'studying') {
    setAvatarPosture(POSTURE_CODES.SIT);
  } else {
    setAvatarPosture(POSTURE_CODES.STAND);
    clearLocalSeatOccupant();
    hideSeatOccluder();
    renderSeatStateLayers();
  }
  stopStepCycle();
}

function updateLeaderboard() {
  const activeMs = avatarState.studyStartedAtMs ? Date.now() - avatarState.studyStartedAtMs : 0;
  const mySeconds = Math.floor((avatarState.totalStudiedMs + avatarState.studiedBeforeMs + activeMs) / 1000);
  const rows = [
    ...leaderboardEntries,
    {name: getCurrentStudentName(), seconds: mySeconds, isMe: true},
  ].sort((a, b) => b.seconds - a.seconds).slice(0, 4);

  setText(playerCount, String(scriptedStudents.length + 1));
  if (studyFill) {
    studyFill.style.width = `${Math.min(100, Math.max(4, (avatarState.studiedBeforeMs + activeMs) / 9000))}%`;
  }
  renderFloatingCounts();
  leaderboardList.innerHTML = rows.map((row, index) => (
    `<li class="${row.isMe ? 'is-me' : ''}"><span>#${index + 1}</span><span>${row.name}</span><strong>${formatTime(row.seconds * 1000)}</strong></li>`
  )).join('');
}

function renderFloatingCounts() {
  floatingCounts.innerHTML = leaderboardEntries.map((row, index) => (
    `<span class="student-count count-${index + 1}" style="--x: ${mapToScenePoint(row).x}%; --y: ${mapToScenePoint(row).y}%"><em>${row.name}</em><strong>${formatTime(row.seconds * 1000)}</strong></span>`
  )).join('');
}

function renderChatMessages() {
  chatLog.replaceChildren();
  chatMessages.slice(-4).forEach((message) => {
    const item = document.createElement('p');
    if (message.isMe) {
      item.classList.add('is-me');
    }

    const name = document.createElement('strong');
    name.textContent = message.name;
    const text = document.createElement('span');
    text.textContent = message.text;
    item.append(name, text);
    chatLog.append(item);
  });
  chatLog.scrollTop = chatLog.scrollHeight;
}

function sendChatMessage(text) {
  const message = text.trim();
  if (!message) {
    return;
  }

  chatMessages.push({name: getCurrentStudentName(), text: message, isMe: true});
  while (chatMessages.length > 8) {
    chatMessages.shift();
  }
  renderChatMessages();
  setText(sceneCaption, 'Message sent to the study room.');
}

function updateStudyTimer() {
  const activeMs = avatarState.studyStartedAtMs ? Date.now() - avatarState.studyStartedAtMs : 0;
  const currentMs = avatarState.studiedBeforeMs + activeMs;
  setText(studyTimer, formatTime(currentMs));
  setText(todayScore, formatTime(avatarState.totalStudiedMs + currentMs));
  setText(currentStreak, formatShortMinutes(currentMs));
  updateLeaderboard();
}

function stopStudyTimer() {
  if (avatarState.studyStartedAtMs) {
    avatarState.studiedBeforeMs += Date.now() - avatarState.studyStartedAtMs;
  }
  avatarState.studyStartedAtMs = 0;
  window.clearInterval(avatarState.timerId);
  avatarState.timerId = 0;
  updateStudyTimer();
}

function resetStudyTimer() {
  avatarState.totalStudiedMs += avatarState.studiedBeforeMs;
  avatarState.studiedBeforeMs = 0;
  avatarState.studyStartedAtMs = 0;
  window.clearInterval(avatarState.timerId);
  avatarState.timerId = 0;
  updateStudyTimer();
}

function beginStudyTimer() {
  resetStudyTimer();
  avatarState.studyStartedAtMs = Date.now();
  updateStudyTimer();
  avatarState.timerId = window.setInterval(updateStudyTimer, 500);
}

function clearSelectedSeats() {
  seats.forEach((seat) => seat.classList.remove('selected'));
}

function buildSeatTarget(seatTarget) {
  const entry = tilePoint(seatTarget.entryTileId);
  const standX = Number.isFinite(seatTarget.standX) ? seatTarget.standX : entry.x;
  const standY = Number.isFinite(seatTarget.standY) ? seatTarget.standY : entry.y;
  const sitPose = seatTarget.sitPose === 'forward' ? 'forward' : 'front';
  const occupiedAsset = CHAIR_OCCUPIED_ASSETS[seatTarget.seatId];
  const usesOccupiedAsset = Boolean(occupiedAsset);
  const occupiedBase = 1000 + Math.round(seatTarget.sitY * 10);
  return {
    x: standX,
    y: standY,
    entryTileId: seatTarget.entryTileId,
    sitX: seatTarget.sitX,
    sitY: seatTarget.sitY,
    standX,
    standY,
    emptyVisualRef: seatTarget.emptyVisualRef,
    assetDirection: seatTarget.assetDirection ?? seatTarget.facing ?? 'south-east',
    avatarAction: seatTarget.avatarAction ?? 'sit',
    bodyDirection: seatTarget.bodyDirection ?? seatTarget.assetDirection ?? seatTarget.facing ?? 'south-east',
    headDirection: seatTarget.headDirection ?? seatTarget.assetDirection ?? seatTarget.facing ?? 'south-east',
    seatZ: Number.isFinite(seatTarget.seatZ) ? seatTarget.seatZ : 0,
    spriteOffset: seatTarget.spriteOffset ? {...seatTarget.spriteOffset} : {x: 0, y: 0},
    avatarClip: seatTarget.avatarClip ?? 'inset(0 0 43% 0)',
    hitArea: {
      type: 'circle',
      radius: Number.isFinite(seatTarget.tapRadius) ? seatTarget.tapRadius : CHAIR_TAP_RADIUS,
    },
    zLayer: {
      occupiedBase,
      foregroundOffset: 1,
    },
    facing: seatTarget.facing ?? 'south-east',
    sitPose,
    visualPose: usesOccupiedAsset ? 'hidden' : seatTarget.visualPose ?? sitPose,
    visualWidth: usesOccupiedAsset ? 1 : Number.isFinite(seatTarget.visualWidth) ? seatTarget.visualWidth : undefined,
    visualHeight: usesOccupiedAsset ? 1 : Number.isFinite(seatTarget.visualHeight) ? seatTarget.visualHeight : undefined,
    visualHidden: usesOccupiedAsset || seatTarget.visualHidden === true,
    layerBounds: seatTarget.layerBounds,
    occupiedAsset,
    foregroundMask: Array.isArray(seatTarget.foregroundMask) ? seatTarget.foregroundMask : undefined,
    occlusion: seatTarget.occlusion,
    seatId: seatTarget.seatId,
    label: seatTarget.label,
  };
}

function getSeatTarget(seat) {
  const seatId = seat.dataset.seat;
  const matchingTarget = CHAIR_SEAT_TARGETS.find((target) => target.seatId === seatId);
  if (matchingTarget) {
    return buildSeatTarget(matchingTarget);
  }

  return buildSeatTarget({
    seatId,
    label: seatCopy[seatId] ?? 'Library seat',
    sitX: Number.parseFloat(seat.dataset.sitX),
    sitY: Number.parseFloat(seat.dataset.sitY),
    facing: 'south-east',
    sitPose: seat.dataset.sitPose === 'forward' ? 'forward' : 'front',
    occlusion: null,
    entryTileId: seat.dataset.entryTile,
  });
}

function findNearestChairTarget(x, y) {
  const nearest = CHAIR_SEAT_TARGETS.reduce((best, target) => {
    const targetDistance = distance({x, y}, {x: target.sitX, y: target.sitY});
    return targetDistance < best.distance ? {target, distance: targetDistance} : best;
  }, {target: null, distance: Number.POSITIVE_INFINITY});

  return nearest.distance <= CHAIR_TAP_RADIUS ? buildSeatTarget(nearest.target) : null;
}

function getStandTileId(target) {
  return `seat-${target.seatId}-stand`;
}

function getTargetRouteTileId(target) {
  if (Number.isFinite(target.standX) && Number.isFinite(target.standY)) {
    return getStandTileId(target);
  }

  return target.entryTileId ?? target.tileId ?? findNearestTileId(target);
}

function getTargetWalkPixel(target) {
  if (target.seatId) {
    const maskSeat = getMaskSeatHotspot(target.seatId);
    if (maskSeat?.walkTargetPx) {
      return findNearestImageStandingPoint(maskSeat.walkTargetPx);
    }
  }
  if (Number.isFinite(target.standX) && Number.isFinite(target.standY)) {
    return mapPercentToImagePixel({x: target.standX, y: target.standY});
  }
  if (Number.isFinite(target.x) && Number.isFinite(target.y)) {
    return mapPercentToImagePixel(target);
  }
  return mapPercentToImagePixel(tilePoint(target.tileId ?? 'entrance'));
}

function buildRoute(target) {
  const endTileId = getTargetRouteTileId(target);
  const wantsSeat = Number.isFinite(target.sitX) && Number.isFinite(target.sitY);
  const startPixel = mapPercentToImagePixel({x: avatarState.x, y: avatarState.y});
  const pixelRoute = findImagePixelRoute(startPixel, getTargetWalkPixel(target), {
    includeChairs: true,
  });
  const route = pixelRoute.slice(1).map((point, index, routePoints) => ({
    ...imagePixelToMapPercent(point),
    tileId: index === routePoints.length - 1 ? endTileId : makeImageRouteTileId(point),
  }));
  assertRouteAvoidsFurniture([
    {x: avatarState.x, y: avatarState.y, tileId: avatarState.tileId},
    ...route,
  ], {
    requireStandingClearance: !wantsSeat,
    allowFirstPoint: true,
    allowChairStandPoints: wantsSeat,
  });
  return route;
}

function animateAvatarToPoint(target, duration = 420) {
  window.cancelAnimationFrame(avatarState.moveFrame);
  const origin = {x: avatarState.x, y: avatarState.y};
  const startedAt = performance.now();

  return new Promise((resolve) => {
    function step(now) {
      const progress = Math.min(1, (now - startedAt) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setAvatarPosition(
        origin.x + (target.x - origin.x) * eased,
        origin.y + (target.y - origin.y) * eased,
        {followCamera: true}
      );

      if (progress < 1) {
        avatarState.moveFrame = window.requestAnimationFrame(step);
        return;
      }

      avatarState.moveFrame = 0;
      setAvatarPosition(target.x, target.y, {followCamera: true});
      resolve();
    }

    avatarState.moveFrame = window.requestAnimationFrame(step);
  });
}

async function sitAtChair(target, routeToken) {
  setText(sceneTitle, 'Sitting');
  setText(sceneCaption, 'Taking the selected chair.');
  setAvatarMode('idle');
  setStepMarker(target, false);
  setAvatarFacingDirection(target.facing);
  avatarState.activeSeatId = target.seatId;
  avatarState.activeChairTarget = target;
  SEAT_OCCUPANCY_STATE.forEach((occupant, seatId) => {
    if (occupant.userId === LOCAL_OCCUPANT_ID && seatId !== target.seatId) {
      SEAT_OCCUPANCY_STATE.delete(seatId);
    }
  });
  SEAT_OCCUPANCY_STATE.set(target.seatId, createLocalSeatOccupant());
  setAvatarSitPose(target.sitPose);

  setAvatarPosition(target.sitX, target.sitY, {followCamera: true});
  avatarState.tileId = getStandTileId(target);
  setAvatarMode('studying');
  renderSeatStateOverlay(target);
  renderSeatOccluder(target);
  if (avatarState.routeToken !== routeToken) {
    return false;
  }

  avatarState.isSeated = true;
  return true;
}

async function pullChairAndSit(target, routeToken) {
  return sitAtChair(target, routeToken);
}

function moveAvatarTo(target, options = {}) {
  window.cancelAnimationFrame(avatarState.moveFrame);
  const origin = {x: avatarState.x, y: avatarState.y};
  const startedAt = performance.now();
  const duration = Math.min(780, Math.max(260, distance(origin, target) * 28));

  setAvatarMode('walking');
  setStepMarker(target, true);

  return new Promise((resolve) => {
    function step(now) {
      const progress = Math.min(1, (now - startedAt) / duration);
      const eased = progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;
      setAvatarPosition(
        origin.x + (target.x - origin.x) * eased,
        origin.y + (target.y - origin.y) * eased,
        {followCamera: true}
      );

      if (progress < 1) {
        avatarState.moveFrame = window.requestAnimationFrame(step);
        return;
      }

      avatarState.moveFrame = 0;
      setAvatarPosition(target.x, target.y, {followCamera: true});
      if (target.tileId) {
        avatarState.tileId = target.tileId;
      }
      resolve();
    }

    avatarState.moveFrame = window.requestAnimationFrame(step);
  }).then(() => {
    if (typeof options.onArrive === 'function') {
      options.onArrive();
    }
  });
}

function moveAvatarAlongRoute(route, options = {}) {
  window.cancelAnimationFrame(avatarState.moveFrame);

  const path = assertRouteAvoidsFurniture([
    {x: avatarState.x, y: avatarState.y, tileId: avatarState.tileId},
    ...route,
  ], {
    allowFirstPoint: true,
    allowChairStandPoints: options.allowChairStandPoints === true,
  });
  const startedAt = performance.now();
  const routeLength = getRouteDistance(path);
  const duration = Math.min(1400, Math.max(280, routeLength * 16));

  setAvatarMode('walking');
  setStepMarker(path[path.length - 1], true);

  return new Promise((resolve) => {
    function step(now) {
      const progress = Math.min(1, (now - startedAt) / duration);
      const eased = progress < 0.08
        ? progress * (1 + progress)
        : progress > 0.92
          ? 1 - Math.pow(1 - progress, 1.35)
          : progress;
      const frame = getRouteFrame(path, eased);

      setAvatarFacing(frame.from, frame.to);
      setAvatarPosition(frame.point.x, frame.point.y, {followCamera: true});

      if (progress < 1) {
        avatarState.moveFrame = window.requestAnimationFrame(step);
        return;
      }

      const destination = path[path.length - 1];
      avatarState.moveFrame = 0;
      avatarState.tileId = destination.tileId ?? avatarState.tileId;
      setAvatarPosition(destination.x, destination.y, {followCamera: true});
      setAvatarFacing(path[Math.max(0, path.length - 2)], destination);
      resolve();
    }

    avatarState.moveFrame = window.requestAnimationFrame(step);
  });
}

async function standUpFromSeat(routeToken) {
  if (!avatarState.isSeated) {
    return true;
  }

  const target = avatarState.activeChairTarget;
  stopStudyTimer();
  setText(sceneTitle, 'Standing up');
  setText(sceneCaption, 'Leaving the chair before walking.');
  setStepMarker(target, false);
  const standPoint = target
    ? tilePoint(getStandTileId(target))
    : tilePoint(avatarState.tileId);
  setAvatarMode('idle');
  hideSeatOccluder();
  setAvatarPosition(standPoint.x, standPoint.y, {followCamera: true});
  if (avatarState.routeToken !== routeToken) {
    return false;
  }

  avatarState.tileId = standPoint.tileId ?? findNearestTileId(standPoint);
  avatarState.activeSeatId = '';
  avatarState.activeChairTarget = null;
  avatarState.isSeated = false;
  return true;
}

async function walkToTarget(target, routeToken, options = {}) {
  setText(sceneTitle, options.title ?? 'Walking');
  setText(sceneCaption, options.caption ?? 'Walking along the aisle.');
  const wantsSeat = Number.isFinite(target.sitX) && Number.isFinite(target.sitY);
  const route = buildRoute(target);
  await moveAvatarAlongRoute(route, {allowChairStandPoints: wantsSeat});

  if (avatarState.routeToken !== routeToken) {
    return false;
  }

  setStepMarker(target, false);
  return true;
}

async function runAvatarActionSequence(target, options = {}) {
  const routeToken = avatarState.routeToken + 1;
  avatarState.routeToken = routeToken;
  window.cancelAnimationFrame(avatarState.moveFrame);

  const wantsSeat = Number.isFinite(target.sitX) && Number.isFinite(target.sitY);
  const stoodUp = await standUpFromSeat(routeToken);
  if (!stoodUp || avatarState.routeToken !== routeToken) {
    return;
  }

  if (!wantsSeat) {
    stopStudyTimer();
  }

  const didWalk = await walkToTarget(target, routeToken, options);
  if (!didWalk || avatarState.routeToken !== routeToken) {
    return;
  }

  if (wantsSeat) {
    const didSit = await pullChairAndSit(target, routeToken);
    if (didSit && avatarState.routeToken === routeToken) {
      startStudyAtSeat(target);
    }
    return;
  }

  setAvatarMode('idle');
  avatarState.activeSeatId = '';
  avatarState.activeChairTarget = null;
  avatarState.isSeated = false;
  breakButton.disabled = false;
  setText(sceneTitle, 'Choose a chair');
  setText(sceneCaption, 'Floor taps stay on the aisles. Chair taps start a study run.');
}

async function routeAvatarViaPath(target, options = {}) {
  return runAvatarActionSequence(target, options);
}

function startStudyAtSeat(target) {
  const seatId = typeof target === 'string' ? target : target.seatId;
  const label = typeof target === 'string' ? seatCopy[seatId] ?? 'Library seat' : target.label ?? seatCopy[seatId] ?? 'Library seat';
  avatarState.activeSeatId = seatId;
  if (typeof target !== 'string') {
    avatarState.activeChairTarget = target;
    avatarState.isSeated = true;
  }
  beginStudyTimer();
  setAvatarMode('studying');
  renderSeatStateOverlay(typeof target === 'string' ? null : target);
  setText(sceneTitle, label);
  setText(sceneCaption, 'Counting started.');
  breakButton.disabled = false;
}

function enterBreakAtChimAmfi() {
  avatarState.routeToken += 1;
  stopStudyTimer();
  clearSelectedSeats();
  avatarState.activeSeatId = '';
  avatarState.activeChairTarget = null;
  avatarState.isSeated = false;
  setAvatarMode('idle');
  setText(sceneTitle, 'Break at Çim Amfi');
  setText(sceneCaption, 'Fresh air break. Your study score is saved.');
  breakButton.disabled = true;
  breakScene.classList.add('active');
  breakScene.setAttribute('aria-hidden', 'false');
}

function returnToLibrary() {
  breakScene.classList.remove('active');
  breakScene.setAttribute('aria-hidden', 'true');
  setText(sceneTitle, 'Back in Library');
  setText(sceneCaption, 'Tap a chair to sit and start a new counted run.');
  clearSelectedSeats();
  setAvatarMode('idle');
  breakButton.disabled = false;
}

function getCosmeticById(id) {
  return COSMETIC_CATALOG.find((item) => item.id === id) ?? null;
}

function getOutfitForCosmetic(cosmeticId) {
  const outfitByCosmetic = {
    'classic-shirt': 'classic',
    'radio-hoodie': 'radio',
    'night-hoodie': 'night',
    'break-shirt': 'break',
  };
  return outfitByCosmetic[cosmeticId] ?? null;
}

function updateAvatarSprite() {
  const spriteSet = STANDING_AVATAR_IMAGES[avatarState.bodyType] ?? STANDING_AVATAR_IMAGES.masc;
  avatar.style.setProperty('--avatar-sprite-image', `url("${spriteSet[avatarState.outfit] ?? spriteSet.classic}")`);
  avatar.dataset.avatarType = avatarState.bodyType;
  avatar.dataset.outfit = avatarState.outfit;
  avatar.dataset.hat = avatarState.equippedCosmetics.hat;
}

function renderCosmeticShop() {
  setText(goldBalance, String(avatarState.gold));
  cosmeticButtons.forEach((button) => {
    const cosmetic = getCosmeticById(button.dataset.cosmetic);
    if (!cosmetic) {
      return;
    }

    const owned = avatarState.ownedCosmetics.includes(cosmetic.id);
    const equipped = avatarState.equippedCosmetics[cosmetic.slot] === cosmetic.id;
    button.classList.toggle('is-owned', owned);
    button.classList.toggle('is-selected', equipped);
    button.disabled = !owned && avatarState.gold < cosmetic.priceGold;
    const price = button.querySelector('small');
    if (price) {
      price.textContent = owned ? (equipped ? 'On' : 'Wear') : `${cosmetic.priceGold}g`;
    }
  });
}

function setAvatarType(nextType) {
  if (!STANDING_AVATAR_IMAGES[nextType]) {
    return false;
  }

  avatarState.bodyType = nextType;
  avatarTypeButtons.forEach((button) => {
    button.classList.toggle('is-selected', button.dataset.avatarType === nextType);
  });
  updateAvatarSprite();
  return true;
}

function buyCosmetic(cosmeticId) {
  const boughtOrEquipped = equipCosmetic(cosmeticId);
  if (!boughtOrEquipped) {
    renderCosmeticShop();
    return false;
  }

  const nextOutfit = getOutfitForCosmetic(cosmeticId);
  if (nextOutfit) {
    avatar.classList.remove('outfit-classic', 'outfit-radio', 'outfit-night', 'outfit-break');
    avatar.classList.add(`outfit-${nextOutfit}`);
    avatarState.outfit = nextOutfit;
    clothingButtons.forEach((button) => {
      button.classList.toggle('is-selected', button.dataset.clothing === nextOutfit);
    });
  }

  updateSeatedAvatarModel();
  updateAvatarSprite();
  renderCosmeticShop();
  return true;
}

function equipCosmetic(cosmeticId) {
  const cosmetic = getCosmeticById(cosmeticId);
  if (!cosmetic) {
    return false;
  }
  if (!avatarState.ownedCosmetics.includes(cosmetic.id)) {
    if (avatarState.gold < cosmetic.priceGold) {
      setText(sceneCaption, `${cosmetic.label} costs ${cosmetic.priceGold} gold.`);
      return false;
    }
    avatarState.gold -= cosmetic.priceGold;
    avatarState.ownedCosmetics.push(cosmetic.id);
  }
  avatarState.equippedCosmetics[cosmetic.slot] = cosmetic.id;
  updateAvatarSprite();
  renderCosmeticShop();
  return true;
}

function applyClothing(nextOutfit) {
  const clothingByButton = {
    classic: 'classic-shirt',
    radio: 'radio-hoodie',
    night: 'night-hoodie',
    break: 'break-shirt',
  };
  const cosmeticId = clothingByButton[nextOutfit] ?? nextOutfit;
  if (!equipCosmetic(cosmeticId)) {
    return;
  }
  avatar.classList.remove('outfit-classic', 'outfit-radio', 'outfit-night', 'outfit-break');
  avatar.classList.add(`outfit-${nextOutfit}`);
  avatarState.outfit = nextOutfit;
  updateSeatedAvatarModel();
  updateAvatarSprite();
  renderCosmeticShop();
  clothingButtons.forEach((button) => {
    button.classList.toggle('is-selected', button.dataset.clothing === nextOutfit);
  });
}

renderSeatHotspotsFromTargets();

seats.forEach((seat) => {
  seat.addEventListener('click', (event) => {
    event.stopPropagation();
    clearSelectedSeats();
    seat.classList.add('selected');
    const target = getSeatTarget(seat);
    routeAvatarViaPath(target, {
      title: 'Walking to chair',
      caption: 'Following the aisle to the chair side.',
    });
  });
});

scene.addEventListener('click', (event) => {
  if (event.target.closest('.hud-action, .leaderboard-popover, .chat-panel, .closet-drawer, .closet-toggle, .zoom-controls, .break-copy, .seat-hotspot')) {
    return;
  }

  if (breakScene.classList.contains('active')) {
    return;
  }

  const rect = scene.getBoundingClientRect();
  const sceneX = ((event.clientX - rect.left) / rect.width) * 100;
  const sceneY = ((event.clientY - rect.top) / rect.height) * 100;
  const mapPixel = sceneToMapPixel(sceneX, sceneY);
  const walkablePixel = findNearestImageStandingPoint(mapPixel);
  const walkableTarget = {
    ...imagePixelToMapPercent(walkablePixel),
    tileId: makeImageRouteTileId(walkablePixel),
  };
  clearSelectedSeats();
  breakButton.disabled = false;
  routeAvatarViaPath(walkableTarget);
});

closetToggle.addEventListener('click', (event) => {
  event.stopPropagation();
  const willOpen = closetDrawer.hidden;
  closetDrawer.hidden = !willOpen;
  closetToggle.setAttribute('aria-expanded', String(willOpen));
});

clothingButtons.forEach((button) => {
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    buyCosmetic(button.dataset.cosmetic ?? button.dataset.clothing);
  });
});

cosmeticButtons.forEach((button) => {
  if (button.dataset.clothing) {
    return;
  }

  button.addEventListener('click', (event) => {
    event.stopPropagation();
    buyCosmetic(button.dataset.cosmetic);
  });
});

avatarTypeButtons.forEach((button) => {
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    setAvatarType(button.dataset.avatarType);
  });
});

zoomInButton?.addEventListener('click', (event) => {
  event.stopPropagation();
  setMapZoom(mapCamera.zoom + mapCamera.step);
});

zoomOutButton?.addEventListener('click', (event) => {
  event.stopPropagation();
  setMapZoom(mapCamera.zoom - mapCamera.step);
});

breakButton.addEventListener('click', (event) => {
  event.stopPropagation();
  const query = new URLSearchParams(window.location.search);
  query.delete('debugMap');
  const suffix = query.toString() ? `?${query.toString()}` : '';
  window.location.href = `./chim.html${suffix}`;
});

leaderboardToggle.addEventListener('click', (event) => {
  event.stopPropagation();
  const willOpen = leaderboardPanel.hidden;
  leaderboardPanel.hidden = !willOpen;
  leaderboardToggle.setAttribute('aria-expanded', String(willOpen));
});

chatForm.addEventListener('submit', (event) => {
  event.preventDefault();
  event.stopPropagation();
  sendChatMessage(chatInput.value);
  chatInput.value = '';
});

returnButton.addEventListener('click', (event) => {
  event.stopPropagation();
  returnToLibrary();
});

applyMapCamera();
setAvatarPosture(avatarState.posture);
setAvatarMode('idle');
applyClothing(avatarState.outfit);
setAvatarType(avatarState.bodyType);
updateAvatarSprite();
renderCosmeticShop();
updateStudyTimer();
renderChatMessages();
window.scriptedStudents = scriptedStudents;
window.leaderboardEntries = leaderboardEntries;
window.libraryPathing = {
  WALKABLE_TILES,
  BLOCKED_DESK_ZONES,
  MAP_IMAGE_SIZE,
  LIBRARY_HABBO_MAP_MASK,
  mapCamera,
  mapPercentToImagePixel,
  imagePixelToMapPercent,
  mapToScenePoint,
  sceneToMapPoint,
  sceneToMapPixel,
  applyMapCamera,
  focusMapCamera,
  followAvatarCamera,
  setMapZoom,
  renderMapDebugOverlay,
  tilePoint,
  getStandTileId,
  findImagePixelRoute,
  findNearestImageWalkablePoint,
  findNearestImageStandingPoint,
  isInsideImagePixelFloor,
  isInsideImagePixelWalkableGrid,
  isInsideImagePixelBlocked,
  isImagePixelWalkable,
  isImagePixelStandingSafe,
  findRouteTiles,
  findNearestWalkablePoint,
  assertRouteAvoidsFurniture,
  getBlockedZoneClearance,
  isInsideDeskBlockedZone,
  isInsideBlockedZone,
  isInsideChairBlockedZone,
  avatarVisualClearsFurniture,
  isStandingRoutePoint,
  segmentKeepsAvatarClear,
  pointInPolygon,
  segmentTouchesFurniture,
  segmentTouchesDeskFurniture,
};

window.libraryShop = {
  getGold: () => avatarState.gold,
  getOwnedCosmetics: () => [...avatarState.ownedCosmetics],
  getEquippedCosmetics: () => ({...avatarState.equippedCosmetics}),
  getAvatarType: () => avatarState.bodyType,
  setAvatarType,
  buyCosmetic,
  equipCosmetic,
};

window.librarySeating = {
  setSeatOccupant,
  clearSeatOccupant,
  clearAllSeatOccupants,
  getSeatOccupants: () => Object.fromEntries([...SEAT_OCCUPANCY_STATE.entries()].map(([seatId, occupant]) => [seatId, cloneSeatOccupant(occupant)])),
  getSeatTargets: () => CHAIR_SEAT_TARGETS.map((target) => cloneSeatTarget(buildSeatTarget(target))),
  getSeatStateSnapshot,
  buildSeatLayerModel: (seatId, occupant) => buildSeatLayerModel(getSeatDefinition(seatId), normalizeSeatOccupant(occupant)),
};

window.librarySceneLayers = {
  getLayers: () => SCENE_LAYER_REGISTRY.map(cloneSceneLayer),
  source: ROOM_ARTWORK_SOURCE,
};

window.libraryRoom = {
  getSemanticMap: cloneSemanticRoomMap,
  getEntities: () => cloneSemanticRoomMap().entities,
  getAreas: () => cloneSemanticRoomMap().areas,
  getOccupancyState: getSeatStateSnapshot,
};

window.addEventListener('resize', () => {
  applyMapCamera();
});
