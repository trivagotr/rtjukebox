import { describe, expect, it } from 'vitest';
import { __nextSongVotingTest } from '../src/routes/nextSongVoting';

const validCandidate = {
    externalId: 'local-library-song-id',
    title: 'Song Title',
    artist: 'Artist',
    artworkUrl: null
};

describe('next song voting backend contract', () => {
    it('accepts 2-5 candidates and rejects larger start payloads', () => {
        const twoCandidates = __nextSongVotingTest.agentRoundSchema.safeParse({
            action: 'start',
            candidates: [validCandidate, { ...validCandidate, externalId: 'local-library-song-id-2' }]
        });
        const fiveCandidates = __nextSongVotingTest.agentRoundSchema.safeParse({
            action: 'start',
            candidates: Array.from({ length: 5 }, (_, index) => ({
                ...validCandidate,
                externalId: `local-library-song-id-${index + 1}`
            }))
        });
        const sixCandidates = __nextSongVotingTest.agentRoundSchema.safeParse({
            action: 'start',
            candidates: Array.from({ length: 6 }, (_, index) => ({
                ...validCandidate,
                externalId: `local-library-song-id-${index + 1}`
            }))
        });

        expect(twoCandidates.success).toBe(true);
        expect(fiveCandidates.success).toBe(true);
        expect(sixCandidates.success).toBe(false);
    });

    it('normalizes only externalId/title/artist/artworkUrl for storage', () => {
        const candidate = __nextSongVotingTest.normalizeCandidate(validCandidate, 1);

        expect(candidate).toEqual({
            externalId: 'local-library-song-id',
            title: 'Song Title',
            artist: 'Artist',
            artworkUrl: null,
            position: 1
        });
    });

    it('rejects local filesystem paths and playback fields in candidates', () => {
        expect(() => __nextSongVotingTest.normalizeCandidate({
            ...validCandidate,
            externalId: 'C:\\music\\song.mp3'
        }, 1)).toThrow(/LOCAL_PATH_NOT_ALLOWED/);

        expect(() => __nextSongVotingTest.normalizeCandidate({
            ...validCandidate,
            streamUrl: 'https://example.com/stream'
        } as any, 1)).toThrow(/PLAYBACK_FIELD_NOT_ALLOWED/);

        expect(() => __nextSongVotingTest.normalizeCandidate({
            ...validCandidate,
            filePath: '/Users/radio/music/song.mp3'
        } as any, 1)).toThrow(/PLAYBACK_FIELD_NOT_ALLOWED/);
    });

    it('rejects local playback fields anywhere in the agent payload', () => {
        expect(() => __nextSongVotingTest.assertNoLocalPlaybackPayload({
            action: 'start',
            metadata: {
                path: 'D:\\radio\\local-song.mp3'
            },
            candidates: [validCandidate, { ...validCandidate, externalId: 'local-library-song-id-2' }]
        })).toThrow(/PLAYBACK_FIELD_NOT_ALLOWED/);

        expect(() => __nextSongVotingTest.assertNoLocalPlaybackPayload({
            action: 'start',
            candidates: [
                validCandidate,
                {
                    ...validCandidate,
                    externalId: 'local-library-song-id-2',
                    artworkUrl: '/var/music/artwork.jpg'
                }
            ]
        })).toThrow(/LOCAL_PATH_NOT_ALLOWED/);
    });

    it('keeps externalId in response candidates without exposing playback fields', () => {
        const payload = __nextSongVotingTest.serializeCandidate({
            id: 'candidate-1',
            external_id: 'local-library-song-id',
            song_id: 'internal-song-id',
            title: 'Song Title',
            artist: 'Artist',
            album: 'Album',
            duration_seconds: 180,
            artwork_url: null,
            preview_url: 'file:///bad-preview',
            stream_url: 'file:///bad-stream',
            vote_score: 4,
            vote_count: 2,
            position: 1,
            metadata: { localPath: 'C:\\music\\song.mp3' }
        });

        expect(payload).toEqual({
            id: 'candidate-1',
            externalId: 'local-library-song-id',
            title: 'Song Title',
            artist: 'Artist',
            artworkUrl: null,
            voteScore: 4,
            voteCount: 2,
            position: 1
        });
        expect(payload).not.toHaveProperty('streamUrl');
        expect(payload).not.toHaveProperty('previewUrl');
        expect(payload).not.toHaveProperty('songId');
        expect(payload).not.toHaveProperty('metadata');
    });
});
