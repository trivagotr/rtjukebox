import { describe, expect, it } from 'vitest';
import { createSocialRoomPresenceStore } from './socialRooms';

describe('social room presence store', () => {
    it('shares seated room state across participants in the same room', () => {
        const store = createSocialRoomPresenceStore();

        store.join('chim-alan', 'socket-a', 'user-a');
        store.join('chim-alan', 'socket-b', 'user-b');
        store.sit('chim-alan', 'user-a', 'amphi-step-01');

        expect(store.getState('chim-alan')).toEqual({
            roomId: 'chim-alan',
            participants: [
                { userId: 'user-a', socketId: 'socket-a', seatId: 'amphi-step-01' },
                { userId: 'user-b', socketId: 'socket-b', seatId: null },
            ],
        });
    });
});
