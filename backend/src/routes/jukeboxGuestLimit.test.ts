import { describe, expect, it, vi } from 'vitest';
import { applyQueueAddStats, enforceGuestDailySongLimit } from './jukebox';

describe('jukebox guest daily limit helpers', () => {
    it('allows the first guest add of an Istanbul day', async () => {
        const query = vi.fn().mockResolvedValue({ rows: [] });

        await expect(
            enforceGuestDailySongLimit({
                dbClient: { query },
                isGuest: true,
                guestFingerprint: 'guest-device-1',
                now: new Date('2026-04-03T21:30:00.000Z'),
            })
        ).resolves.toBeUndefined();

        expect(query).toHaveBeenCalledWith(
            expect.stringContaining('FROM guest_daily_song_limits'),
            ['guest-device-1', '2026-04-04']
        );
    });

    it('blocks a second same-day guest add for the same fingerprint across kiosks', async () => {
        const query = vi.fn().mockResolvedValue({ rows: [{ songs_added: 1 }] });

        await expect(
            enforceGuestDailySongLimit({
                dbClient: { query },
                isGuest: true,
                guestFingerprint: 'shared-device-fingerprint',
                now: new Date('2026-04-04T10:00:00.000Z'),
            })
        ).rejects.toThrow('Guest daily song limit reached');
    });

    it('does not apply the guest limit to logged-in users', async () => {
        const query = vi.fn();

        await expect(
            enforceGuestDailySongLimit({
                dbClient: { query },
                isGuest: false,
                guestFingerprint: null,
            })
        ).resolves.toBeUndefined();

        expect(query).not.toHaveBeenCalled();
    });

    it('records +2 total rank and +2 monthly rank when a member adds a song', async () => {
        const query = vi.fn().mockResolvedValue({ rows: [] });

        await applyQueueAddStats({
            dbClient: { query },
            userId: 'user-1',
            isGuest: false,
            now: new Date('2026-04-03T21:30:00.000Z'),
        });

        expect(query).toHaveBeenNthCalledWith(
            1,
            'UPDATE users SET total_songs_added = total_songs_added + 1 WHERE id = $1',
            ['user-1']
        );
        expect(query).toHaveBeenNthCalledWith(
            2,
            'UPDATE users SET rank_score = rank_score + 2 WHERE id = $1',
            ['user-1']
        );
        expect(query).toHaveBeenNthCalledWith(
            3,
            expect.stringContaining('INSERT INTO user_monthly_rank_scores'),
            ['user-1', '2026-04']
        );
    });

    it('records guest daily usage without granting leaderboard rank', async () => {
        const query = vi.fn().mockResolvedValue({ rows: [] });

        await applyQueueAddStats({
            dbClient: { query },
            userId: 'guest-1',
            isGuest: true,
            guestFingerprint: 'guest-device-2',
            now: new Date('2026-04-04T09:00:00.000Z'),
        });

        expect(query).toHaveBeenCalledTimes(2);
        expect(query).toHaveBeenNthCalledWith(
            1,
            'UPDATE users SET total_songs_added = total_songs_added + 1 WHERE id = $1',
            ['guest-1']
        );
        expect(query).toHaveBeenNthCalledWith(
            2,
            expect.stringContaining('INSERT INTO guest_daily_song_limits'),
            ['guest-device-2', '2026-04-04']
        );
    });
});
