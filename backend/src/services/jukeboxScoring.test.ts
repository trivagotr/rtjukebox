import { describe, expect, it } from 'vitest';
import {
    getInitialSongScore,
    getIstanbulDayKey,
    getIstanbulYearMonth,
    getRequesterRankDelta,
    getSongScoreDelta,
    normalizeVoteKind,
} from './jukeboxScoring';

describe('jukebox scoring helpers', () => {
    it('starts queue items at zero song score', () => {
        expect(getInitialSongScore()).toBe(0);
    });

    it('normalizes supported vote states', () => {
        expect(normalizeVoteKind(undefined)).toBe('none');
        expect(normalizeVoteKind(null)).toBe('none');
        expect(normalizeVoteKind(0)).toBe('none');
        expect(normalizeVoteKind(1)).toBe('upvote');
        expect(normalizeVoteKind(-1)).toBe('downvote');
        expect(normalizeVoteKind(4)).toBe('supervote');
        expect(normalizeVoteKind('supervote')).toBe('supervote');
    });

    it('calculates song deltas for base vote states', () => {
        expect(getSongScoreDelta('none', 'upvote')).toBe(1);
        expect(getSongScoreDelta('none', 'downvote')).toBe(-1);
        expect(getSongScoreDelta('none', 'supervote')).toBe(3);
    });

    it('calculates requester rank deltas for base vote states', () => {
        expect(getRequesterRankDelta('none', 'upvote')).toBe(1);
        expect(getRequesterRankDelta('none', 'downvote')).toBe(-1);
        expect(getRequesterRankDelta('none', 'supervote')).toBe(2);
    });

    it('calculates vote transition deltas', () => {
        expect(getSongScoreDelta('upvote', 'downvote')).toBe(-2);
        expect(getRequesterRankDelta('upvote', 'downvote')).toBe(-2);

        expect(getSongScoreDelta('downvote', 'supervote')).toBe(4);
        expect(getRequesterRankDelta('downvote', 'supervote')).toBe(3);

        expect(getSongScoreDelta('supervote', 'none')).toBe(-3);
        expect(getRequesterRankDelta('supervote', 'none')).toBe(-2);
    });

    it('derives Istanbul day and month keys from UTC timestamps', () => {
        const utcLateNight = new Date('2026-04-03T21:30:00.000Z');

        expect(getIstanbulDayKey(utcLateNight)).toBe('2026-04-04');
        expect(getIstanbulYearMonth(utcLateNight)).toBe('2026-04');
    });
});
