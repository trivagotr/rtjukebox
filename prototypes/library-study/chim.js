const scene = document.querySelector('#chimScene');
const avatar = document.querySelector('#chimAvatar');
const pathMarker = document.querySelector('#pathMarker');
const sceneTitle = document.querySelector('#chimSceneTitle');
const sceneCaption = document.querySelector('#chimSceneCaption');
const studyTimer = document.querySelector('#chimStudyTimer');
const studyFill = document.querySelector('#chimStudyFill');
const pointBalance = document.querySelector('#chimPointBalance');
const chatLog = document.querySelector('#chimChatLog');
const chatForm = document.querySelector('#chimChatForm');
const chatInput = document.querySelector('#chimChatInput');
const closetToggle = document.querySelector('#chimClosetToggle');
const closet = document.querySelector('#chimCloset');
const accountName = document.querySelector('#chimAccountName');
const libraryButton = document.querySelector('#libraryButton');
const sparkHost = document.querySelector('#sparkHost');
const rockMarker = document.querySelector('#rockMarker');
const seatButtons = [...document.querySelectorAll('[data-seat-id]')];
const outfitButtons = [...document.querySelectorAll('[data-outfit]')];

const WALK_NODES = {
  entrance: {x: 50, y: 95},
  'lower-path': {x: 50, y: 85},
  'middle-path': {x: 50, y: 71},
  rock: {x: 30, y: 67},
  'upper-path': {x: 50, y: 58},
  'stair-0': {x: 35, y: 54},
  'stair-1': {x: 35, y: 48},
  'stair-2': {x: 35, y: 41},
  'stair-3': {x: 35, y: 34},
  'stair-4': {x: 35, y: 27},
  courtyard: {x: 47, y: 23},
  spark: {x: 57, y: 20},
  'row-1-left': {x: 48, y: 48},
  'row-1-mid': {x: 63, y: 47},
  'row-1-right': {x: 77, y: 46},
  'row-2-left': {x: 48, y: 41},
  'row-2-mid': {x: 63, y: 40},
  'row-2-right': {x: 77, y: 39},
  'row-3-left': {x: 49, y: 34},
  'row-3-mid': {x: 64, y: 33},
  'row-3-right': {x: 78, y: 32},
};

const WALK_EDGES = [
  ['entrance', 'lower-path'],
  ['lower-path', 'middle-path'],
  ['middle-path', 'upper-path'],
  ['middle-path', 'rock'],
  ['upper-path', 'stair-0'],
  ['stair-0', 'stair-1'],
  ['stair-1', 'stair-2'],
  ['stair-2', 'stair-3'],
  ['stair-3', 'stair-4'],
  ['stair-4', 'courtyard'],
  ['courtyard', 'spark'],
  ['stair-1', 'row-1-left'],
  ['row-1-left', 'row-1-mid'],
  ['row-1-mid', 'row-1-right'],
  ['stair-2', 'row-2-left'],
  ['row-2-left', 'row-2-mid'],
  ['row-2-mid', 'row-2-right'],
  ['stair-3', 'row-3-left'],
  ['row-3-left', 'row-3-mid'],
  ['row-3-mid', 'row-3-right'],
];

const WALK_GRAPH = Object.fromEntries(Object.keys(WALK_NODES).map((id) => [id, []]));
WALK_EDGES.forEach(([from, to]) => {
  WALK_GRAPH[from].push(to);
  WALK_GRAPH[to].push(from);
});

const avatarState = {
  currentNode: 'entrance',
  posture: 'standing',
  activeSeatId: '',
  outfit: readStoredOutfit(),
  routeToken: 0,
  studiedSeconds: 0,
  timerId: 0,
};

function readStoredOutfit() {
  try {
    const value = window.localStorage.getItem('radiotedu_study_outfit');
    return ['classic', 'radio', 'night', 'break'].includes(value) ? value : 'classic';
  } catch {
    return 'classic';
  }
}

function saveOutfit(outfit) {
  try {
    window.localStorage.setItem('radiotedu_study_outfit', outfit);
  } catch {
    // The room still works when WebView storage is unavailable.
  }
}

function distance(left, right) {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

function findAStarPath(startId, targetId) {
  if (!WALK_NODES[startId] || !WALK_NODES[targetId]) {
    return [];
  }

  const open = new Set([startId]);
  const cameFrom = new Map();
  const cost = new Map([[startId, 0]]);
  const estimate = new Map([[startId, distance(WALK_NODES[startId], WALK_NODES[targetId])]]);

  while (open.size > 0) {
    const current = [...open].sort((left, right) => (estimate.get(left) ?? Infinity) - (estimate.get(right) ?? Infinity))[0];
    if (current === targetId) {
      const path = [current];
      while (cameFrom.has(path[0])) {
        path.unshift(cameFrom.get(path[0]));
      }
      return path;
    }

    open.delete(current);
    WALK_GRAPH[current].forEach((neighbor) => {
      const nextCost = (cost.get(current) ?? Infinity) + distance(WALK_NODES[current], WALK_NODES[neighbor]);
      if (nextCost >= (cost.get(neighbor) ?? Infinity)) {
        return;
      }

      cameFrom.set(neighbor, current);
      cost.set(neighbor, nextCost);
      estimate.set(neighbor, nextCost + distance(WALK_NODES[neighbor], WALK_NODES[targetId]));
      open.add(neighbor);
    });
  }

  return [];
}

function delay(milliseconds) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function setAvatarPosition(node, duration = 0) {
  avatar.style.transitionDuration = `${duration}ms`;
  avatar.style.left = `${node.x}%`;
  avatar.style.top = `${node.y}%`;
  avatar.style.zIndex = String(10 + Math.round(node.y / 8));
}

function standUp() {
  if (avatarState.activeSeatId) {
    document.querySelector(`[data-seat-id="${avatarState.activeSeatId}"]`)?.classList.remove('is-active');
  }
  avatarState.posture = 'standing';
  avatarState.activeSeatId = '';
  avatar.dataset.posture = 'standing';
  stopStudyTimer();
}

async function walkPath(path, routeToken) {
  if (path.length < 2) {
    return routeToken === avatarState.routeToken;
  }

  avatar.classList.add('is-moving');
  for (const nodeId of path.slice(1)) {
    if (routeToken !== avatarState.routeToken) {
      avatar.classList.remove('is-moving');
      return false;
    }

    const from = WALK_NODES[avatarState.currentNode];
    const to = WALK_NODES[nodeId];
    const duration = Math.max(180, Math.min(520, Math.round(distance(from, to) * 28)));
    setAvatarPosition(to, duration);
    await delay(duration + 18);
    avatarState.currentNode = nodeId;
  }

  avatar.classList.remove('is-moving');
  return routeToken === avatarState.routeToken;
}

async function walkToNode(targetId) {
  const target = WALK_NODES[targetId];
  if (!target) {
    return false;
  }

  standUp();
  const routeToken = avatarState.routeToken + 1;
  avatarState.routeToken = routeToken;
  pathMarker.style.left = `${target.x}%`;
  pathMarker.style.top = `${target.y}%`;
  pathMarker.classList.add('is-visible');
  const path = findAStarPath(avatarState.currentNode, targetId);
  const completed = await walkPath(path, routeToken);
  if (completed) {
    window.setTimeout(() => pathMarker.classList.remove('is-visible'), 220);
  }
  return completed;
}

async function sitAtSeat(seatButton) {
  const nodeId = seatButton.dataset.nodeId;
  const reached = await walkToNode(nodeId);
  if (!reached) {
    return;
  }

  Object.assign(avatarState, {posture: 'sitting', activeSeatId: seatButton.dataset.seatId});
  avatar.dataset.posture = 'sitting';
  seatButton.classList.add('is-active');
  setStatus('Studying outside', `Seat ${seatButton.dataset.seatId.toUpperCase()}`);
  startStudyTimer();
}

function nearestNode(point) {
  return Object.entries(WALK_NODES)
    .sort(([, left], [, right]) => distance(point, left) - distance(point, right))[0][0];
}

function setStatus(title, caption) {
  sceneTitle.textContent = title;
  sceneCaption.textContent = caption;
}

function formatDuration(seconds) {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, '0');
  const remainder = (seconds % 60).toString().padStart(2, '0');
  return `${minutes}:${remainder}`;
}

function updateStudyTimer() {
  studyTimer.textContent = formatDuration(avatarState.studiedSeconds);
  studyFill.style.width = `${Math.min(100, (avatarState.studiedSeconds / 1500) * 100)}%`;
}

function startStudyTimer() {
  stopStudyTimer();
  avatarState.timerId = window.setInterval(() => {
    avatarState.studiedSeconds += 1;
    updateStudyTimer();
  }, 1000);
}

function stopStudyTimer() {
  if (avatarState.timerId) {
    window.clearInterval(avatarState.timerId);
    avatarState.timerId = 0;
  }
}

function appendChat(author, message) {
  const line = document.createElement('div');
  line.className = 'chat-line';
  const name = document.createElement('strong');
  name.textContent = author;
  line.append(name, document.createTextNode(message));
  chatLog.append(line);
  while (chatLog.children.length > 3) {
    chatLog.firstElementChild?.remove();
  }
}

function readEmbeddedAccount() {
  const account = window.RadioTEDUStudyAuth?.user
    ?? window.RadioTEDUAppAuth?.user
    ?? window.RadioTEDUAppAccount;
  if (!account || typeof account !== 'object') {
    return;
  }

  const name = account.display_name || account.displayName || account.username || account.name;
  if (typeof name === 'string' && name.trim()) {
    accountName.textContent = name.trim();
  }
  const points = Number(account.globalPoints ?? account.points);
  if (Number.isFinite(points)) {
    pointBalance.textContent = `${Math.max(0, Math.floor(points))} pts`;
  }
}

function applyOutfit(outfit) {
  avatarState.outfit = outfit;
  avatar.dataset.outfit = outfit;
  outfitButtons.forEach((button) => button.classList.toggle('is-selected', button.dataset.outfit === outfit));
  saveOutfit(outfit);
}

function openLibrary() {
  const query = new URLSearchParams(window.location.search);
  const suffix = query.toString() ? `?${query.toString()}` : '';
  window.location.href = `./index.html${suffix}`;
}

scene.addEventListener('click', (event) => {
  if (event.target.closest('button, input, .closet-menu, .chim-chat')) {
    return;
  }

  const rect = scene.getBoundingClientRect();
  const point = {
    x: ((event.clientX - rect.left) / rect.width) * 100,
    y: ((event.clientY - rect.top) / rect.height) * 100,
  };
  const targetId = nearestNode(point);
  setStatus('Walking', 'Chim Alan');
  walkToNode(targetId).then((reached) => {
    if (reached) {
      setStatus('Chim Alan', 'Open-air study');
    }
  });
});

seatButtons.forEach((seatButton) => {
  seatButton.addEventListener('click', (event) => {
    event.stopPropagation();
    sitAtSeat(seatButton);
  });
});

outfitButtons.forEach((button) => {
  button.addEventListener('click', () => applyOutfit(button.dataset.outfit));
});

closetToggle.addEventListener('click', (event) => {
  event.stopPropagation();
  const willOpen = closet.hidden;
  closet.hidden = !willOpen;
  closetToggle.setAttribute('aria-expanded', String(willOpen));
});

sparkHost.addEventListener('click', async (event) => {
  event.stopPropagation();
  if (await walkToNode('spark')) {
    setStatus('Spark', 'rtAI - AI Host');
    appendChat('Spark', 'Good to see you outside.');
  }
});

rockMarker.addEventListener('click', async (event) => {
  event.stopPropagation();
  if (await walkToNode('rock')) {
    setStatus('Rock', 'Quiet company');
  }
});

chatForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const message = chatInput.value.trim();
  if (!message) {
    return;
  }
  appendChat(accountName.textContent || 'You', message);
  chatInput.value = '';
});

libraryButton.addEventListener('click', openLibrary);
window.addEventListener('radiotedu:account-ready', readEmbeddedAccount);
window.addEventListener('radiotedu-study-auth', readEmbeddedAccount);

setAvatarPosition(WALK_NODES[avatarState.currentNode]);
applyOutfit(avatarState.outfit);
updateStudyTimer();
readEmbeddedAccount();
window.setTimeout(readEmbeddedAccount, 250);
appendChat('Spark', 'Chim Alan is open.');

window.__chimStudyDebug = {
  avatarState,
  findAStarPath,
  walkPath,
  walkToNode,
  sitAtSeat: (seatId) => {
    const seatButton = document.querySelector(`[data-seat-id="${seatId}"]`);
    return seatButton ? sitAtSeat(seatButton) : Promise.resolve();
  },
  nodes: WALK_NODES,
};
