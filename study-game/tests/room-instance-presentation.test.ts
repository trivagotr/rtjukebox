import { describe, expect, it } from 'vitest'

import { formatRoomInstanceLabel } from '../src/ui/RoomInstancePresentation'

describe('formatRoomInstanceLabel', () => {
  it('shows the logical room number and live occupancy in the mobile HUD', () => {
    expect(formatRoomInstanceLabel({
      id: 'library-2', roomId: 'library', number: 2,
      occupancy: 17, capacity: 51, preferredInstanceFull: true,
    })).toBe('Room 2 · 17/51')
  })

  it('shows allocation progress before the server assignment arrives', () => {
    expect(formatRoomInstanceLabel(null)).toBe('Finding room…')
  })
})
