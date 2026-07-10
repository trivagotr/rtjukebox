import './styles.css'

import { LocalStudyAdapter } from './adapters/LocalStudyAdapter'
import { createStudyGame } from './game/StudyGame'
import type { ImageRoomId } from './rooms/ImageRoomDefinition'

const ui = document.querySelector<HTMLElement>('#game-ui')
if (!ui) throw new Error('Study game UI root is missing')

const mode = new URLSearchParams(window.location.search).get('scene') === 'engine-proof' ? 'engine-proof' : 'study'
const requestedRoom = new URLSearchParams(window.location.search).get('room')
const initialRoom: ImageRoomId = requestedRoom === 'chim-alan' ? 'chim-alan' : 'library'
const embeddedAccount = window.RadioTEDUStudyAccount
const adapter = new LocalStudyAdapter(embeddedAccount && typeof embeddedAccount.id === 'string' && typeof embeddedAccount.displayName === 'string'
  ? {
      account: { id: embeddedAccount.id, displayName: embeddedAccount.displayName.slice(0, 80), authenticated: embeddedAccount.authenticated === true },
      globalPoints: Number.isFinite(embeddedAccount.globalPoints) ? embeddedAccount.globalPoints : 0,
    }
  : {})
const session = adapter.session()

if (mode === 'engine-proof') {
  ui.innerHTML = `
    <header class="game-brand" aria-label="RadioTEDU Study"><strong>RadioTEDU</strong><span>STUDY</span></header>
    <output id="game-status" class="game-status" data-state="loading" aria-live="polite">LOADING</output>
    <nav class="game-controls" aria-label="Engine proof controls">
      <button id="run-proof" class="icon-button" type="button" aria-label="Run movement proof" title="Run movement proof">▶</button>
      <button id="sit-toggle" class="icon-button" type="button" aria-label="Sit or stand" title="Sit or stand">↕</button>
    </nav>
  `
} else {
  ui.innerHTML = `
    <header class="study-bar">
      <div class="study-brand" aria-label="RadioTEDU Study"><strong>RadioTEDU</strong><span>STUDY</span></div>
      <nav class="room-tabs" role="tablist" aria-label="Study rooms">
        <button type="button" role="tab" data-room-id="library" aria-selected="true">Library</button>
        <button type="button" role="tab" data-room-id="chim-alan" aria-label="Cim Alan" aria-selected="false">Çim Alan</button>
      </nav>
      <strong id="room-title" class="room-title">Library</strong>
      <output id="game-status" class="game-status" data-state="loading" aria-live="polite">LOADING</output>
      <div class="account-chip" aria-label="Signed-in account"><span class="presence-dot"></span><strong>${session.account.displayName}</strong></div>
      <div class="point-balance" aria-label="Global points"><span>PTS</span><strong>${session.points.global}</strong></div>
      <button id="wardrobe-toggle" data-testid="wardrobe-toggle" class="command-button" type="button" aria-expanded="false" aria-controls="wardrobe-panel">Wardrobe</button>
    </header>
    <aside id="wardrobe-panel" class="wardrobe-panel" aria-label="Wardrobe" hidden>
      <header><strong>Wardrobe</strong><button id="wardrobe-close" class="close-button" type="button" aria-label="Close wardrobe">×</button></header>
      <section><h2>Top</h2><div class="wearable-grid">
        <button data-testid="wearable-radio-hoodie" data-slot="top" data-wearable-id="radio-hoodie" type="button"><i class="swatch swatch-teal"></i><span>Radio Hoodie</span></button>
        <button data-testid="wearable-varsity-jacket" data-slot="top" data-wearable-id="varsity-jacket" type="button"><i class="swatch swatch-red"></i><span>Varsity</span></button>
      </div></section>
      <section><h2>Bottom</h2><div class="wearable-grid">
        <button data-testid="wearable-jeans" data-slot="bottom" data-wearable-id="jeans" type="button"><i class="swatch swatch-blue"></i><span>Jeans</span></button>
        <button data-testid="wearable-black-cargos" data-slot="bottom" data-wearable-id="black-cargos" type="button"><i class="swatch swatch-black"></i><span>Black Cargos</span></button>
      </div></section>
      <section><h2>Shoes</h2><div class="wearable-grid">
        <button data-testid="wearable-sneakers" data-slot="shoes" data-wearable-id="sneakers" type="button"><i class="swatch swatch-ivory"></i><span>Sneakers</span></button>
        <button data-testid="wearable-boots" data-slot="shoes" data-wearable-id="boots" type="button"><i class="swatch swatch-black"></i><span>Boots</span></button>
      </div></section>
      <section><h2>Hat</h2><div class="wearable-grid">
        <button data-testid="wearable-bucket-hat" data-slot="hat" data-wearable-id="bucket-hat" type="button"><i class="swatch swatch-gold"></i><span>Bucket Hat</span></button>
        <button data-testid="wearable-beanie" data-slot="hat" data-wearable-id="beanie" type="button"><i class="swatch swatch-plum"></i><span>Beanie</span></button>
      </div></section>
    </aside>
    <footer class="chat-dock">
      <div id="chat-log" class="chat-log" aria-live="polite"><span><strong>RadioTEDU</strong> Welcome to Study.</span></div>
      <form id="chat-form"><input id="chat-input" maxlength="180" autocomplete="off" placeholder="Say something..." aria-label="Chat message" /><button type="submit">Send</button></form>
    </footer>
  `

  const wardrobe = document.querySelector<HTMLElement>('#wardrobe-panel')!
  const toggle = document.querySelector<HTMLButtonElement>('#wardrobe-toggle')!
  const setWardrobeOpen = (open: boolean) => {
    wardrobe.hidden = !open
    toggle.setAttribute('aria-expanded', String(open))
  }
  toggle.addEventListener('click', () => setWardrobeOpen(wardrobe.hasAttribute('hidden')))
  document.querySelector('#wardrobe-close')?.addEventListener('click', () => setWardrobeOpen(false))
  document.querySelector<HTMLFormElement>('#chat-form')?.addEventListener('submit', (event) => {
    event.preventDefault()
    const input = document.querySelector<HTMLInputElement>('#chat-input')!
    let message
    try {
      message = adapter.sendChat(input.value)
    } catch (error) {
      const status = document.querySelector<HTMLOutputElement>('#game-status')
      if (status) status.textContent = error instanceof Error && error.message.includes('RATE_LIMITED') ? 'SLOW DOWN' : 'MESSAGE BLOCKED'
      return
    }
    const line = document.createElement('span')
    const name = document.createElement('strong')
    name.textContent = message.displayName
    line.append(name, document.createTextNode(` ${message.text}`))
    document.querySelector('#chat-log')?.append(line)
    input.value = ''
  })
}

createStudyGame('game-canvas', mode, adapter, initialRoom)

declare global {
  interface Window {
    RadioTEDUStudyAccount?: {
      id: string
      displayName: string
      globalPoints: number
      authenticated: boolean
    } | null
  }
}
