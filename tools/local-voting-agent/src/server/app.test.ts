import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from './app';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CatalogSong, JingleTrack } from '../agent/types';

const songs: CatalogSong[] = [
  { id: 'song-1', title: 'One', artist: 'Artist', filePath: 'C:/Music/one.mp3' },
  { id: 'song-2', title: 'Two', artist: 'Artist', filePath: 'C:/Music/two.mp3' },
  { id: 'song-3', title: 'Three', artist: 'Artist', filePath: 'C:/Music/three.mp3' },
];

const jingles: JingleTrack[] = [
  { id: 'jingle-1', title: 'Station ID', filePath: 'C:/Jingles/station-id.wav', enabled: true },
];

describe('local voting API', () => {
  it('returns idle state before any round starts', async () => {
    const app = createApp({ songs, rng: () => 0 });

    const response = await request(app).get('/api/state');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      candidateCount: 3,
      round: null,
      attribution: null,
      playbackCommandPreview: null,
    });
  });

  it('starts a voting round with requested candidate count', async () => {
    const app = createApp({ songs, rng: () => 0 });

    const response = await request(app).post('/api/rounds/start').send({ candidateCount: 2 });

    expect(response.status).toBe(201);
    expect(response.body.round.candidates).toHaveLength(2);
    expect(response.body.round.candidates.map((candidate: { songId: string }) => candidate.songId)).toEqual([
      'song-1',
      'song-2',
    ]);
  });

  it('accepts votes and returns the idempotent voting reward key', async () => {
    const app = createApp({ songs, rng: () => 0 });
    const roundResponse = await request(app).post('/api/rounds/start').send({ candidateCount: 2 });
    const roundId = roundResponse.body.round.id;
    const candidateId = roundResponse.body.round.candidates[0].id;

    const vote = await request(app).post(`/api/rounds/${roundId}/votes`).send({ userId: 'user-1', candidateId });

    expect(vote.status).toBe(200);
    expect(vote.body.rewardKey).toBe(`${roundId}:user-1:voting_reward`);
    expect(vote.body.round.candidates[0].votes).toBe(1);
  });

  it('resolves no-vote fallback without user-facing random attribution', async () => {
    const app = createApp({ songs, rng: () => 0 });
    const roundResponse = await request(app).post('/api/rounds/start').send({ candidateCount: 2 });
    const roundId = roundResponse.body.round.id;

    const resolved = await request(app).post(`/api/rounds/${roundId}/resolve`).send();

    expect(resolved.status).toBe(200);
    expect(resolved.body.round.resolutionMode).toBe('no-vote-fallback');
    expect(resolved.body.attribution).toBeNull();
    expect(JSON.stringify(resolved.body)).not.toMatch(/randomly selected|rastgele seçildi/i);
  });

  it('serves album art by song id without exposing local image paths in the URL', async () => {
    const root = mkdtempSync(join(tmpdir(), 'radiotedu-art-route-'));
    const artPath = join(root, 'cover.jpg');
    writeFileSync(artPath, 'fake jpg');
    const app = createApp({
      songs: [{ id: 'song-art', title: 'Art', artist: 'Artist', filePath: join(root, 'art.mp3'), albumArtPath: artPath }],
      rng: () => 0,
    });

    const response = await request(app).get('/album-art/song-art');

    expect(response.status).toBe(200);
    expect(response.body.toString()).toBe('fake jpg');
  });

  it('returns a jingle and winner playback plan after resolving a round', async () => {
    const app = createApp({ songs, jingles, jingleBeforeWinner: true, rng: () => 0 });
    const roundResponse = await request(app).post('/api/rounds/start').send({ candidateCount: 2 });
    const roundId = roundResponse.body.round.id;

    const resolved = await request(app).post(`/api/rounds/${roundId}/resolve`).send();

    expect(resolved.status).toBe(200);
    expect(resolved.body.playbackPlanPreview.entries.map((entry: { kind: string }) => entry.kind)).toEqual([
      'jingle',
      'winner',
    ]);
    expect(resolved.body.playbackCommandPreview).toEqual([
      '-hide_banner',
      '-nostdin',
      '-re',
      '-i',
      'C:/Music/one.mp3',
      '-f',
      'null',
      '-',
    ]);
  });
});
