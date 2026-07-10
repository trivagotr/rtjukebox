import './styles.css'

import { createStudyGame } from './game/StudyGame'

const ui = document.querySelector<HTMLElement>('#game-ui')
if (!ui) throw new Error('Study game UI root is missing')

ui.innerHTML = `
  <header class="game-brand" aria-label="RadioTEDU Study">
    <strong>RadioTEDU</strong>
    <span>STUDY</span>
  </header>
  <output id="game-status" class="game-status" data-state="loading" aria-live="polite">LOADING</output>
  <nav class="game-controls" aria-label="Engine proof controls">
    <button id="run-proof" class="icon-button" type="button" aria-label="Run movement proof" title="Run movement proof">▶</button>
    <button id="sit-toggle" class="icon-button" type="button" aria-label="Sit or stand" title="Sit or stand">↕</button>
  </nav>
`

createStudyGame()
