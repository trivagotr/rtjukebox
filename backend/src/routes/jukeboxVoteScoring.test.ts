import fs from 'fs';
import path from 'path';
import { describe, expect, it, vi } from 'vitest';
import {
    applyRequesterVoteRankDelta,
    buildQueueVoteScoreUpdate,
    canUseDailySupervote,
    getStoredVoteValue,
    resolveFinalQueueVoteKind,
} from './jukebox';
import { normalizeVoteKind } from '../services/jukeboxScoring';

describe('jukebox vote scoring contract', () => {
    it('treats stored value 3 as a supervote', () => {
        expect(normalizeVoteKind(3)).toBe('supervote');
        expect(getStoredVoteValue('supervote')).toBe(3);
        expect(buildQueueVoteScoreUpdate({ previousVote: 3, nextVote: 'none' })).toMatchObject({
            previousVoteKind: 'supervote',
            nextVoteKind: 'none',
            songDelta: -3,
            requesterRankDelta: -2,
        });
    });

    it('resolves queue vote transitions with the new scoring model', () => {
        expect(resolveFinalQueueVoteKind({ previousVote: 0, requestedVote: 1 })).toBe('upvote');
        expect(buildQueueVoteScoreUpdate({ previousVote: 0, nextVote: 'upvote' })).toMatchObject({
            storedVoteValue: 1,
            songDelta: 1,
            requesterRankDelta: 1,
        });

        expect(resolveFinalQueueVoteKind({ previousVote: 1, requestedVote: -1 })).toBe('downvote');
        expect(buildQueueVoteScoreUpdate({ previousVote: 1, nextVote: 'downvote' })).toMatchObject({
            storedVoteValue: -1,
            songDelta: -2,
            requesterRankDelta: -2,
        });

        expect(resolveFinalQueueVoteKind({ previousVote: -1, isSuper: true })).toBe('supervote');
        expect(buildQueueVoteScoreUpdate({ previousVote: -1, nextVote: 'supervote' })).toMatchObject({
            storedVoteValue: 3,
            songDelta: 4,
            requesterRankDelta: 3,
        });

        expect(resolveFinalQueueVoteKind({ previousVote: 3, requestedVote: 'supervote' })).toBe('none');
    });

    it('allows one member supervote per Istanbul day and blocks guests', () => {
        expect(canUseDailySupervote({ isGuest: true })).toEqual({
            allowed: false,
            reason: 'guest',
        });

        expect(
            canUseDailySupervote({
                isGuest: false,
                lastSuperVoteAt: '2026-04-03T21:30:00.000Z',
                now: new Date('2026-04-04T10:00:00.000Z'),
            })
        ).toEqual({
            allowed: false,
            reason: 'cooldown',
        });

        expect(
            canUseDailySupervote({
                isGuest: false,
                lastSuperVoteAt: '2026-04-03T20:30:00.000Z',
                now: new Date('2026-04-04T10:00:00.000Z'),
            })
        ).toEqual({
            allowed: true,
        });
    });

    it('updates only the requester rank totals and monthly scores', async () => {
        const query = vi
            .fn()
            .mockResolvedValueOnce({ rows: [{ is_guest: false }] })
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [] });

        await applyRequesterVoteRankDelta({
            dbClient: { query },
            requesterId: 'user-1',
            requesterRankDelta: 2,
            now: new Date('2026-04-03T21:30:00.000Z'),
        });

        expect(query).toHaveBeenNthCalledWith(
            2,
            'UPDATE users SET rank_score = rank_score + $1 WHERE id = $2',
            [2, 'user-1']
        );
        expect(query).toHaveBeenNthCalledWith(
            3,
            expect.stringContaining('INSERT INTO user_monthly_rank_scores'),
            ['user-1', '2026-04', 2]
        );
    });

    it('does not keep legacy hidden score mutations in the jukebox vote flow', () => {
        const routeSource = fs.readFileSync(path.resolve(__dirname, './jukebox.ts'), 'utf8');
        const schemaSource = fs.readFileSync(path.resolve(__dirname, '../db/schema.sql'), 'utf8');

        expect(routeSource).not.toContain('rank_score = rank_score + 10');
        expect(routeSource).not.toContain('rank_score = rank_score - 10');
        expect(routeSource).not.toContain('calculatePriorityScore');
        expect(schemaSource).toContain('vote_type SMALLINT NOT NULL, -- 1 = upvote, -1 = downvote, 3 = supervote');
    });
});
