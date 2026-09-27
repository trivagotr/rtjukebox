import { describe, expect, it, vi } from 'vitest';
import type { AudioProbe } from './ports/audio-probe.port.js';
import type { CatalogAssetsRepository } from './ports/catalog-assets.repository.js';
import type { StorageService } from '../../core/ports/storage.port.js';
import type { SpotifyCatalogProvider } from '../integrations/spotify/ports/spotify-catalog.port.js';
import { CatalogAssetsService } from './catalog-assets.service.js';
import { cryptoIdGenerator } from '../../core/infra/crypto-id-generator.js';

vi.mock('file-type', () => ({ fileTypeFromBuffer: vi.fn().mockResolvedValue({ ext: 'mp3', mime: 'audio/mpeg' }) }));
vi.mock('music-metadata', () => ({ parseBuffer: vi.fn().mockResolvedValue({ common: {}, format: { duration: 60 } }) }));

function createService(probe: AudioProbe) {
  const repository = { findSongAsset: vi.fn().mockResolvedValue({ id: 'song-1', file_url: '/uploads/songs/test.mp3', title: 'Song', artist: 'Artist', album: null }), findUploadedByHash: vi.fn().mockResolvedValue(null), updateSongMetadata: vi.fn() } as unknown as CatalogAssetsRepository;
  const storage = { get: vi.fn().mockResolvedValue(Buffer.from('audio')), put: vi.fn() } as unknown as StorageService;
  const spotify = {} as SpotifyCatalogProvider;
  return { service: new CatalogAssetsService(repository, storage, spotify, probe, cryptoIdGenerator), repository, storage };
}

describe('CatalogAssetsService audio inspection', () => {
  it('rejects files longer than four hours before saving metadata', async () => {
    const { service, repository } = createService({ inspect: vi.fn().mockResolvedValue({ durationSeconds: 14_401, hasAudioStream: true }) });
    await expect(service.processSong('song-1')).rejects.toMatchObject({ statusCode: 400 });
    expect(repository.updateSongMetadata).not.toHaveBeenCalled();
  });

  it('rejects files without an audio stream', async () => {
    const { service } = createService({ inspect: vi.fn().mockResolvedValue({ durationSeconds: 60, hasAudioStream: false }) });
    await expect(service.processSong('song-1')).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejects media when ffprobe cannot inspect the input', async () => {
    const { service } = createService({ inspect: vi.fn().mockRejectedValue(new Error('ffprobe unavailable')) });
    await expect(service.processSong('song-1')).rejects.toMatchObject({ message: 'Audio file is invalid, could not be inspected, or exceeds 4 hours' });
  });

  it('rejects invalid media before storing an uploaded file', async () => {
    const { service, storage } = createService({ inspect: vi.fn().mockRejectedValue(new Error('invalid media')) });
    await expect(service.uploadSong('fake.mp3', Buffer.from('fake audio'))).rejects.toMatchObject({ statusCode: 400 });
    expect(storage.put).not.toHaveBeenCalled();
  });
});
