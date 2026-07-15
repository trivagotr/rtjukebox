import { describe, expect, it } from 'vitest'

import { HudPanelState } from '../src/ui/HudPanelState'

describe('HudPanelState', () => {
  it('starts closed and exposes one immutable panel snapshot', () => {
    const panels = new HudPanelState()

    expect(panels.snapshot()).toEqual({ current: 'closed' })
    expect(Object.isFrozen(panels.snapshot())).toBe(true)
  })

  it('keeps only one bottom sheet open at a time', () => {
    const panels = new HudPanelState()

    panels.open('people')
    expect(panels.isOpen('people')).toBe(true)

    panels.open('wardrobe')
    expect(panels.isOpen('people')).toBe(false)
    expect(panels.isOpen('wardrobe')).toBe(true)
  })

  it('toggles the active sheet closed without requiring a keyboard action', () => {
    const panels = new HudPanelState()

    panels.toggle('chat')
    expect(panels.snapshot().current).toBe('chat')
    panels.toggle('chat')
    expect(panels.snapshot().current).toBe('closed')
  })

  it('opens a player profile from any existing sheet and closes it explicitly', () => {
    const panels = new HudPanelState()
    panels.open('people')

    panels.open('profile')
    expect(panels.snapshot().current).toBe('profile')

    panels.close()
    expect(panels.snapshot().current).toBe('closed')
  })

  it('reports aria-expanded independently for every toggle', () => {
    const panels = new HudPanelState()
    panels.open('wardrobe')

    expect(panels.expanded('people')).toBe('false')
    expect(panels.expanded('wardrobe')).toBe('true')
    expect(panels.expanded('chat')).toBe('false')
  })
})
