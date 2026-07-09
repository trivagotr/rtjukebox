import {describe, expect, it} from '@jest/globals';

import {resolveSeatSlot, seatSlotToAvatarPose, type SeatSlot} from '../../shared/social/seatSlots';

describe('shared social seat slots', () => {
  it('resolves a seat slot into a deterministic sitting pose', () => {
    const slots: SeatSlot[] = [
      {
        id: 'amphi-step-01',
        entryTile: {x: 6, y: 8},
        sitTile: {x: 6, y: 7},
        facing: 'east',
        pose: 'sit-right',
        occlusionLayer: 'front-edge',
      },
    ];

    const slot = resolveSeatSlot(slots, 'amphi-step-01');

    expect(slot).toEqual(slots[0]);
    expect(seatSlotToAvatarPose(slot!)).toEqual({
      posture: 'sitting',
      pose: 'sit-right',
      facing: 'east',
    });
  });
});
