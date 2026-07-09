import {describe, expect, it} from '@jest/globals';

import {buildSeatOccupancyEvent} from '../../shared/social/presence';

describe('shared social room presence events', () => {
  it('builds a backend-ready seat occupancy event', () => {
    expect(
      buildSeatOccupancyEvent({
        roomId: 'chim-alan',
        userId: 'u1',
        seatId: 'amphi-step-01',
      }),
    ).toEqual({
      type: 'room:sit',
      roomId: 'chim-alan',
      userId: 'u1',
      seatId: 'amphi-step-01',
    });
  });
});
