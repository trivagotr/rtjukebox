import { describe, expect, it } from 'vitest';
import {
  buildAlbumArtExtractionArgs,
  buildFfprobeMetadataArgs,
  buildPlaybackArgs,
  parseFfprobeMetadata,
} from './ffmpeg';

describe('ffmpeg helpers', () => {
  it('builds ffprobe metadata arguments', () => {
    expect(buildFfprobeMetadataArgs('C:/Music/song.mp3')).toEqual([
      '-v',
      'quiet',
      '-print_format',
      'json',
      '-show_format',
      'C:/Music/song.mp3',
    ]);
  });

  it('parses ffprobe metadata into stable agent fields', () => {
    const metadata = parseFfprobeMetadata(
      JSON.stringify({
        format: {
          duration: '123.45',
          tags: {
            title: 'Track',
            artist: 'Artist',
          },
        },
      }),
    );

    expect(metadata).toEqual({ title: 'Track', artist: 'Artist', durationSeconds: 123 });
  });

  it('returns empty metadata for invalid ffprobe output', () => {
    expect(parseFfprobeMetadata('not-json')).toEqual({});
  });

  it('builds album art extraction arguments', () => {
    expect(buildAlbumArtExtractionArgs('C:/Music/song.mp3', 'var/album-art/song.jpg')).toEqual([
      '-y',
      '-hide_banner',
      '-loglevel',
      'error',
      '-i',
      'C:/Music/song.mp3',
      '-an',
      '-vcodec',
      'copy',
      'var/album-art/song.jpg',
    ]);
  });

  it('builds dry-run playback arguments', () => {
    expect(buildPlaybackArgs('C:/Music/song.mp3')).toEqual([
      '-hide_banner',
      '-nostdin',
      '-re',
      '-i',
      'C:/Music/song.mp3',
      '-f',
      'null',
      '-',
    ]);
  });
});
