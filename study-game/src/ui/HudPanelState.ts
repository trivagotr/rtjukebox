export type HudPanelName = 'people' | 'wardrobe' | 'chat' | 'profile'

export type HudPanelSnapshot = Readonly<{
  current: HudPanelName | 'closed'
}>

export class HudPanelState {
  #current: HudPanelName | 'closed' = 'closed'

  open(panel: HudPanelName): void {
    this.#current = panel
  }

  close(): void {
    this.#current = 'closed'
  }

  toggle(panel: HudPanelName): void {
    this.#current = this.#current === panel ? 'closed' : panel
  }

  isOpen(panel: HudPanelName): boolean {
    return this.#current === panel
  }

  expanded(panel: HudPanelName): 'true' | 'false' {
    return this.isOpen(panel) ? 'true' : 'false'
  }

  snapshot(): HudPanelSnapshot {
    return Object.freeze({ current: this.#current })
  }
}
