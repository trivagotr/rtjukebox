import './styles.css'

import { createIcons, Hand, MessageCircle, Send, Shirt, UsersRound, X } from 'lucide'
import { LocalStudyAdapter } from './adapters/LocalStudyAdapter'
import { RadioTEDUStudyAdapter } from './adapters/RadioTEDUStudyAdapter'
import type { StudyAccount, StudyAdapter, StudyChatMessage, StudyPresence, StudyRoomId, StudySession, StudyTimeSummary } from './adapters/StudyAdapter'
import { createStudyGame } from './game/StudyGame'
import type { ImageRoomId } from './rooms/ImageRoomDefinition'
import { StudySessionTracker, type StudySessionSnapshot, type StudySessionTransport } from './session/StudySessionTracker'
import { applyStudyRoomResponse } from './chat/StudyChatCoordinator'
import { HudPanelState, type HudPanelName } from './ui/HudPanelState'

const ui = document.querySelector<HTMLElement>('#game-ui')
if (!ui) throw new Error('Study game UI root is missing')

const parameters = new URLSearchParams(window.location.search)
const mode = parameters.get('scene') === 'engine-proof' ? 'engine-proof' : 'study'
const requestedRoom = parameters.get('room')
const initialRoom: ImageRoomId = requestedRoom === 'chim-alan' ? 'chim-alan' : 'library'
const secureBridge = readSecureBridge()
const isHostedProduction = import.meta.env.PROD && window.location.protocol !== 'file:'

if (isHostedProduction && !secureBridge) {
  renderLockedStudy()
} else if (mode === 'engine-proof') {
  renderEngineProof()
  createStudyGame('game-canvas', mode, new LocalStudyAdapter(), initialRoom)
} else {
  void bootStudy(secureBridge)
}

async function bootStudy(secureBridge: ReturnType<typeof readSecureBridge>) {
  const adapter: StudyAdapter = secureBridge
    ? new RadioTEDUStudyAdapter(secureBridge)
    : createLocalAdapter()

  try {
    await adapter.initialize?.()
  } catch {
    renderUnavailableStudy()
    return
  }

  const session = adapter.session()
  renderStudyShell(session)

  const tracker = createSessionTracker(adapter)
  const panels = bindPanels()
  bindChat(adapter)
  bindPresence(adapter, panels)
  bindAttention(tracker)
  bindStudyClock(tracker, adapter)

  createStudyGame('game-canvas', mode, adapter, initialRoom, tracker)
}

function renderEngineProof() {
  ui!.innerHTML = `
    <header class="game-brand" aria-label="RadioTEDU Study"><strong>RadioTEDU</strong><span>STUDY</span></header>
    <output id="game-status" class="game-status" data-state="loading" aria-live="polite">LOADING</output>
    <nav class="game-controls" aria-label="Engine proof controls">
      <button id="run-proof" class="icon-button" type="button" aria-label="Run movement proof" title="Run movement proof">▶</button>
      <button id="sit-toggle" class="icon-button" type="button" aria-label="Sit or stand" title="Sit or stand">↕</button>
    </nav>
  `
}

function renderStudyShell(session: StudySession) {
  ui!.innerHTML = `
    <header class="study-bar" data-study-ui>
      <div class="study-brand" aria-label="RadioTEDU Study"><strong>RadioTEDU</strong><span>STUDY</span></div>
      <nav class="room-tabs" role="tablist" aria-label="Study rooms">
        <button type="button" role="tab" data-room-id="library" aria-selected="true">Library</button>
        <button type="button" role="tab" data-room-id="chim-alan" aria-label="Cim Alan" aria-selected="false">Çim Alan</button>
      </nav>
      <strong id="room-title" class="room-title">Library</strong>
      <output id="game-status" class="game-status" data-state="loading" aria-live="polite">LOADING</output>
      <section class="study-clock" data-testid="study-summary" aria-label="Study time">
        <strong id="study-timer" data-testid="study-timer" data-running="false">00:00:00</strong>
        <span><b id="study-today">0m</b> Today</span>
        <span><b id="study-month">0m</b> Month</span>
      </section>
      <div class="account-chip" aria-label="Signed-in account"><span class="presence-dot"></span><strong id="account-name"></strong></div>
      <div class="point-balance" aria-label="Gold balance"><span>Gold</span><strong id="point-balance"></strong></div>
       <button id="chat-toggle" data-hud-toggle="chat" class="command-button" type="button" aria-label="Chat" title="Chat" aria-expanded="false" aria-controls="chat-panel"><i data-lucide="message-circle" aria-hidden="true"></i><span class="button-label">Chat</span></button>
       <button id="people-toggle" data-hud-toggle="people" data-testid="people-toggle" class="command-button" type="button" aria-label="People" title="People" aria-expanded="false" aria-controls="presence-panel"><i data-lucide="users-round" aria-hidden="true"></i><span class="button-label">People</span><strong id="people-count">0</strong></button>
       <button id="wardrobe-toggle" data-hud-toggle="wardrobe" data-testid="wardrobe-toggle" class="command-button" type="button" aria-label="Wardrobe" title="Wardrobe" aria-expanded="false" aria-controls="wardrobe-panel"><i data-lucide="shirt" aria-hidden="true"></i><span class="button-label">Wardrobe</span></button>
    </header>
    <aside id="presence-panel" class="hud-sheet presence-panel" data-hud-panel="people" data-study-ui aria-label="People in this room" hidden>
      <header><strong>People</strong><button id="presence-close" data-hud-close class="close-button" type="button" aria-label="Close people panel"><i data-lucide="x" aria-hidden="true"></i></button></header>
      <div id="player-list" class="player-list"></div>
    </aside>
    <aside id="wardrobe-panel" class="hud-sheet wardrobe-panel" data-hud-panel="wardrobe" data-study-ui aria-label="Wardrobe" hidden>
      <header><strong>Wardrobe</strong><button id="wardrobe-close" data-hud-close class="close-button" type="button" aria-label="Close wardrobe"><i data-lucide="x" aria-hidden="true"></i></button></header>
      <section><h2>Top</h2><div class="wearable-grid">
        <button data-testid="wearable-radio-hoodie" data-slot="top" data-wearable-id="radio-hoodie" type="button"><i class="swatch swatch-teal"></i><span>Radio Hoodie<small>Included</small></span></button>
        <button data-testid="wearable-varsity-jacket" data-slot="top" data-wearable-id="varsity-jacket" type="button"><i class="swatch swatch-red"></i><span>Varsity<small>80 Gold</small></span></button>
      </div></section>
      <section><h2>Bottom</h2><div class="wearable-grid">
        <button data-testid="wearable-jeans" data-slot="bottom" data-wearable-id="jeans" type="button"><i class="swatch swatch-blue"></i><span>Jeans<small>Included</small></span></button>
        <button data-testid="wearable-black-cargos" data-slot="bottom" data-wearable-id="black-cargos" type="button"><i class="swatch swatch-black"></i><span>Black Cargos<small>60 Gold</small></span></button>
      </div></section>
      <section><h2>Shoes</h2><div class="wearable-grid">
        <button data-testid="wearable-sneakers" data-slot="shoes" data-wearable-id="sneakers" type="button"><i class="swatch swatch-ivory"></i><span>Sneakers<small>Included</small></span></button>
        <button data-testid="wearable-boots" data-slot="shoes" data-wearable-id="boots" type="button"><i class="swatch swatch-black"></i><span>Boots<small>50 Gold</small></span></button>
      </div></section>
      <section><h2>Hat</h2><div class="wearable-grid">
        <button data-testid="wearable-bucket-hat" data-slot="hat" data-wearable-id="bucket-hat" type="button"><i class="swatch swatch-gold"></i><span>Bucket Hat<small>Included</small></span></button>
        <button data-testid="wearable-beanie" data-slot="hat" data-wearable-id="beanie" type="button"><i class="swatch swatch-plum"></i><span>Beanie<small>35 Gold</small></span></button>
      </div></section>
    </aside>
    <aside id="player-card" class="hud-sheet player-card" data-hud-panel="profile" data-study-ui data-testid="player-card" aria-label="Player" hidden>
      <button id="player-card-close" data-hud-close class="close-button" type="button" aria-label="Close player"><i data-lucide="x" aria-hidden="true"></i></button>
      <span class="player-card-avatar" aria-hidden="true"></span>
      <strong id="player-card-name"></strong>
      <small id="player-card-status">Studying</small>
      <button id="player-wave" data-testid="player-wave" class="command-button" type="button"><i data-lucide="hand" aria-hidden="true"></i><span>Wave</span></button>
    </aside>
    <aside id="chat-panel" class="hud-sheet chat-dock" data-hud-panel="chat" data-study-ui aria-label="Chat" hidden>
      <header><strong>Chat</strong><button id="chat-close" data-hud-close class="close-button" type="button" aria-label="Close chat"><i data-lucide="x" aria-hidden="true"></i></button></header>
      <div id="chat-log" data-testid="chat-log" class="chat-log" aria-live="polite"><span><strong>RadioTEDU</strong> Welcome to Study.</span></div>
      <form id="chat-form"><input id="chat-input" maxlength="180" autocomplete="off" placeholder="Say something..." aria-label="Chat message" /><button type="submit" aria-label="Send" title="Send"><i data-lucide="send" aria-hidden="true"></i><span class="button-label">Send</span></button></form>
    </aside>
  `
  createIcons({ icons: { Hand, MessageCircle, Send, Shirt, UsersRound, X } })
  document.querySelector('#account-name')!.textContent = session.account.displayName
  document.querySelector('#point-balance')!.textContent = String(session.points.global)
}

function renderLockedStudy() {
  ui!.innerHTML = `
    <section class="study-gate" role="alert">
      <strong>RadioTEDU Study</strong>
      <span>Open Study from the signed-in RadioTEDU app.</span>
    </section>
  `
  document.documentElement.dataset.studyReady = 'locked'
}

function renderUnavailableStudy() {
  ui!.innerHTML = `
    <section class="study-gate" role="alert">
      <strong>Study is unavailable</strong>
      <span>Your session could not be verified.</span>
    </section>
  `
  document.documentElement.dataset.studyReady = 'error'
}

function createLocalAdapter() {
  const embeddedAccount = window.RadioTEDUStudyAccount
  return new LocalStudyAdapter(embeddedAccount && typeof embeddedAccount.id === 'string' && typeof embeddedAccount.displayName === 'string'
    ? {
        account: {
          id: embeddedAccount.id,
          displayName: embeddedAccount.displayName.slice(0, 80),
          authenticated: embeddedAccount.authenticated === true,
        },
        globalPoints: Number.isFinite(embeddedAccount.globalPoints) ? embeddedAccount.globalPoints : 0,
      }
    : {})
}

function readSecureBridge() {
  const bridge = window.RadioTEDUStudyBridge
  if (!bridge || typeof bridge.apiBase !== 'string' || typeof bridge.accessToken !== 'string') return null
  if (!bridge.account || typeof bridge.account.id !== 'string' || typeof bridge.account.displayName !== 'string' || bridge.account.authenticated !== true) return null
  const base = bridge.apiBase.replace(/\/+$/, '')
  return {
    apiBase: base.endsWith('/study') ? base : `${base}/study`,
    accessToken: bridge.accessToken,
    account: {
      id: bridge.account.id,
      displayName: bridge.account.displayName.slice(0, 80),
      authenticated: true,
    } satisfies StudyAccount,
    globalPoints: bridge.globalPoints,
  }
}

function createSessionTracker(adapter: StudyAdapter) {
  if (!isSessionTransport(adapter)) return undefined
  return new StudySessionTracker(adapter)
}

function isSessionTransport(adapter: StudyAdapter): adapter is StudyAdapter & StudySessionTransport {
  return typeof adapter.startStudySession === 'function'
    && typeof adapter.heartbeatStudySession === 'function'
    && typeof adapter.finishStudySession === 'function'
}

type BoundHudPanels = Readonly<{
  open(panel: HudPanelName): void
  close(): void
}>

function bindPanels(): BoundHudPanels {
  const state = new HudPanelState()
  const render = () => {
    const current = state.snapshot().current
    document.documentElement.dataset.hudPanel = current
    document.querySelectorAll<HTMLElement>('[data-hud-panel]').forEach((panel) => {
      panel.hidden = panel.dataset.hudPanel !== current
    })
    document.querySelectorAll<HTMLButtonElement>('[data-hud-toggle]').forEach((toggle) => {
      toggle.setAttribute('aria-expanded', state.expanded(toggle.dataset.hudToggle as HudPanelName))
    })
  }
  document.querySelectorAll<HTMLButtonElement>('[data-hud-toggle]').forEach((toggle) => {
    toggle.addEventListener('click', () => {
      state.toggle(toggle.dataset.hudToggle as HudPanelName)
      render()
    })
  })
  document.querySelectorAll<HTMLButtonElement>('[data-hud-close]').forEach((close) => {
    close.addEventListener('click', () => {
      state.close()
      render()
    })
  })
  render()
  return {
    open: (panel) => { state.open(panel); render() },
    close: () => { state.close(); render() },
  }
}

function bindChat(adapter: StudyAdapter) {
  document.querySelector<HTMLFormElement>('#chat-form')?.addEventListener('submit', (event) => {
    event.preventDefault()
    const input = document.querySelector<HTMLInputElement>('#chat-input')!
    const roomId = currentRoomId()
    const messageText = input.value
    input.value = ''
    void Promise.resolve(adapter.sendChat(messageText, roomId)).then((message) => {
      applyStudyRoomResponse(roomId, currentRoomId, message, appendChatMessage)
    }).catch(() => {
      if (roomId === currentRoomId()) setHudMessage('MESSAGE BLOCKED')
    })
  })

  if (adapter.refreshChat) {
    const refresh = () => {
      const roomId = currentRoomId()
      void adapter.refreshChat!(roomId).then((messages) => {
        applyStudyRoomResponse(roomId, currentRoomId, messages, renderChatMessages)
      }).catch(() => undefined)
    }
    window.addEventListener('radiotedu:study-room-changed', refresh)
    globalThis.setInterval(refresh, 10_000)
    refresh()
  }
}

function renderChatMessages(messages: readonly StudyChatMessage[]) {
  const log = document.querySelector<HTMLElement>('#chat-log')
  if (!log) return
  log.replaceChildren()
  for (const message of messages.slice(-4)) appendChatMessage(message)
  if (!messages.length) {
    const line = document.createElement('span')
    const name = document.createElement('strong')
    name.textContent = 'RadioTEDU'
    line.append(name, document.createTextNode(' Welcome to Study.'))
    log.append(line)
  }
}

function appendChatMessage(message: StudyChatMessage) {
  const line = document.createElement('span')
  const name = document.createElement('strong')
  name.textContent = message.displayName
  line.append(name, document.createTextNode(` ${message.text}`))
  const log = document.querySelector('#chat-log')
  log?.append(line)
  while (log && log.childElementCount > 4) log.firstElementChild?.remove()
}

function bindPresence(adapter: StudyAdapter, panels: BoundHudPanels) {
  let selected: StudyPresence | null = null
  const select = (presence: StudyPresence) => {
    selected = presence
    document.querySelector('#player-card-name')!.textContent = presence.displayName
    document.querySelector('#player-card-status')!.textContent = presence.seatId ? 'Studying at a seat' : 'In this room'
    panels.open('profile')
  }
  const render = (presence: readonly StudyPresence[]) => {
    const list = document.querySelector<HTMLElement>('#player-list')!
    list.replaceChildren()
    for (const player of presence) {
      const button = document.createElement('button')
      button.type = 'button'
      button.dataset.testid = `presence-${player.userId}`
      button.dataset.userId = player.userId
      const dot = document.createElement('i')
      dot.style.backgroundColor = `#${player.color.toString(16).padStart(6, '0')}`
      const copy = document.createElement('span')
      const name = document.createElement('strong')
      const state = document.createElement('small')
      name.textContent = player.displayName
      state.textContent = player.seatId ? 'Studying' : 'Online'
      copy.append(name, state)
      button.append(dot, copy)
      button.addEventListener('click', () => select(player))
      list.append(button)
    }
    document.querySelector('#people-count')!.textContent = String(presence.length)
  }

  render(adapter.presence(initialRoom))
  window.addEventListener('radiotedu:study-presence-updated', (event) => {
    const detail = (event as CustomEvent<{ roomId: StudyRoomId; presence: readonly StudyPresence[] }>).detail
    if (detail?.roomId === currentRoomId()) render(detail.presence)
  })
  window.addEventListener('radiotedu:study-room-changed', () => {
    selected = null
    panels.close()
    render(adapter.presence(currentRoomId()))
  })
  window.addEventListener('radiotedu:study-player-selected', (event) => {
    const detail = (event as CustomEvent<{ presence: StudyPresence }>).detail
    if (detail?.presence) select(detail.presence)
  })
  document.querySelector('#player-wave')?.addEventListener('click', () => {
    if (!selected) return
    void Promise.resolve(adapter.sendChat(`* waves to ${selected.displayName} *`, currentRoomId()))
      .then(appendChatMessage)
      .catch(() => setHudMessage('WAVE BLOCKED'))
  })
}

function bindAttention(tracker?: StudySessionTracker) {
  if (!tracker) return
  const sync = () => tracker.setAttention(document.hasFocus(), document.visibilityState === 'visible')
  document.addEventListener('visibilitychange', sync)
  window.addEventListener('focus', sync)
  window.addEventListener('blur', sync)
  window.addEventListener('pagehide', () => { void tracker.dispose().catch(() => undefined) })
  sync()
}

function bindStudyClock(tracker: StudySessionTracker | undefined, adapter: StudyAdapter) {
  const render = (snapshot: StudySessionSnapshot) => {
    const timer = document.querySelector<HTMLElement>('#study-timer')
    if (!timer) return
    timer.textContent = formatDuration(snapshot.activeSeconds)
    timer.dataset.running = String(snapshot.running)
    document.querySelector('#study-today')!.textContent = formatCompactDuration(snapshot.summary.todaySeconds)
    document.querySelector('#study-month')!.textContent = formatCompactDuration(snapshot.summary.monthSeconds)
  }
  const empty: StudySessionSnapshot = {
    running: false,
    activeSeconds: 0,
    roomId: null,
    seatId: null,
    focused: true,
    foreground: true,
    summary: { todaySeconds: 0, monthSeconds: 0, totalSeconds: 0 },
  }
  render(tracker?.snapshot() ?? empty)
  if (tracker) globalThis.setInterval(() => render(tracker.snapshot()), 250)
  if (tracker && adapter.fetchSummary) {
    void adapter.fetchSummary().then((summary: StudyTimeSummary) => tracker.setSummary(summary)).catch(() => undefined)
  }
}

function currentRoomId(): StudyRoomId {
  return document.documentElement.dataset.roomId === 'chim-alan' ? 'chim-alan' : 'library'
}

function formatDuration(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds))
  const hours = Math.floor(safe / 3_600)
  const minutes = Math.floor((safe % 3_600) / 60)
  const remainingSeconds = safe % 60
  return [hours, minutes, remainingSeconds].map((value) => String(value).padStart(2, '0')).join(':')
}

function formatCompactDuration(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds))
  if (safe < 60) return `${safe}s`
  const minutes = Math.floor(safe / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`
}

function setHudMessage(message: string) {
  const status = document.querySelector<HTMLOutputElement>('#game-status')
  if (!status) return
  status.value = message
  status.textContent = message
}

declare global {
  interface Window {
    RadioTEDUStudyAccount?: {
      id: string
      displayName: string
      globalPoints: number
      authenticated: boolean
    } | null
    RadioTEDUStudyBridge?: {
      apiBase: string
      accessToken: string
      account: StudyAccount
      globalPoints?: number
    } | null
  }
}
