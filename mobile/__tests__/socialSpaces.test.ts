import {describe, expect, it} from '@jest/globals';

import {SOCIAL_ROOMS, getSocialRoom} from '../../shared/social/socialSpaces';

describe('shared RadioTEDU social spaces', () => {
  it('defines only approved TEDU social rooms with multi-angle references', () => {
    expect(SOCIAL_ROOMS.map(room => room.id)).toEqual([
      'welcome',
      'chim-alan',
      'grass-amphitheatre',
      'library',
    ]);
    expect(JSON.stringify(SOCIAL_ROOMS).toLowerCase()).not.toContain('chillin');
    for (const room of SOCIAL_ROOMS) {
      expect(room.references).toHaveLength(4);
      expect(room.seatStrategy).toMatch(/seat-slots|standing-first/);
    }
    expect(getSocialRoom('chim-alan').seatStrategy).toBe('seat-slots');
  });

});
