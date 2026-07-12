import {describe, expect, it, jest} from '@jest/globals';

jest.mock('react-native-track-player', () => ({
  __esModule: true,
  default: {
    getQueue: jest.fn(async () => []),
    reset: jest.fn(async () => undefined),
    add: jest.fn(async () => undefined),
    skip: jest.fn(async () => undefined),
    play: jest.fn(async () => undefined),
    remove: jest.fn(async () => undefined),
  },
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
}));

import {
  buildVisibleChannels,
  getAvailableStreamQualities,
  HIGH_QUALITY_MOBILE_DATA_WARNING,
  isChannelPlayable,
  RADIO_CHANNELS,
  resolveStreamQuality,
  shouldWarnForMobileDataStream,
} from '../src/data/radioChannels';
import {
  buildRadioQueue,
  buildChannelTrack,
  findChannelByQuery,
} from '../src/services/playbackQueue';
import {buildVoiceActionMap} from '../src/services/androidSystemCapabilities';

describe('radio channel catalog', () => {
  it('adds Spark as rtAI with /spark and FLAC metadata', () => {
    const spark = RADIO_CHANNELS.find(channel => channel.id === 'radiotedu-spark');

    expect(spark).toEqual(
      expect.objectContaining({
        name: 'Spark',
        description: 'rtAI - Radio AI Host',
        mountPath: '/spark',
        role: 'ai-host',
        availability: 'live',
        mobileDataWarning: HIGH_QUALITY_MOBILE_DATA_WARNING,
      }),
    );
    expect(spark?.streams.flac).toBe('https://stream.radiotedu.com/spark.flac');
    expect(spark?.codecLabels?.flac).toBe('FLAC');
    expect(getAvailableStreamQualities(spark!)).toContain('flac');
  });

  it('adds Rock with /rock and FLAC metadata', () => {
    const rock = RADIO_CHANNELS.find(channel => channel.id === 'radiotedu-rock');

    expect(rock).toEqual(
      expect.objectContaining({
        name: 'Rock',
        mountPath: '/rock',
        availability: 'live',
        mobileDataWarning: HIGH_QUALITY_MOBILE_DATA_WARNING,
      }),
    );
    expect(rock?.streams.flac).toBe('https://stream.radiotedu.com/rock.flac');
    expect(rock?.codecLabels?.flac).toBe('FLAC');
  });

  it('falls back to the best available quality when a channel has no FLAC stream', () => {
    const main = RADIO_CHANNELS.find(channel => channel.id === 'radiotedu-main')!;

    expect(resolveStreamQuality(main, 'flac')).toBe('high');
    expect(buildChannelTrack(main, 'flac')).toEqual(
      expect.objectContaining({
        id: 'radiotedu-main',
        url: 'https://stream.radiotedu.com/radio?q=high',
      }),
    );
  });

  it('warns only for FLAC over mobile data', () => {
    const spark = RADIO_CHANNELS.find(channel => channel.id === 'radiotedu-spark')!;

    expect(shouldWarnForMobileDataStream(spark, 'flac', true)).toBe(true);
    expect(shouldWarnForMobileDataStream(spark, 'flac', false)).toBe(false);
    expect(shouldWarnForMobileDataStream(spark, 'high', true)).toBe(false);
  });

  it('matches Gemini and assistant-style voice queries to Spark and Rock', () => {
    expect(findChannelByQuery('Hey Gemini, play Spark on RadioTEDU').id).toBe('radiotedu-spark');
    expect(findChannelByQuery('Hey Gemini, play RadioTEDU Rock').id).toBe('radiotedu-rock');
    expect(findChannelByQuery('Hey Gemini, Radio TEDU cal').id).toBe('radiotedu-main');
  });

  it('documents voice action media ids for Android readiness', () => {
    expect(buildVoiceActionMap()).toEqual(
      expect.objectContaining({
        'Hey Gemini, play Spark on RadioTEDU': {
          action: 'play-radio',
          mediaId: 'radiotedu-spark',
        },
        'Hey Gemini, play RadioTEDU Rock': {
          action: 'play-radio',
          mediaId: 'radiotedu-rock',
        },
      }),
    );
  });

  it('keeps live Spark and Rock visible even when stream checks fail', () => {
    const main = RADIO_CHANNELS.find(channel => channel.id === 'radiotedu-main')!;
    const spark = RADIO_CHANNELS.find(channel => channel.id === 'radiotedu-spark')!;
    const rock = RADIO_CHANNELS.find(channel => channel.id === 'radiotedu-rock')!;

    expect(isChannelPlayable(spark)).toBe(true);
    expect(isChannelPlayable(rock)).toBe(true);

    expect(
      buildVisibleChannels([
        {channel: main, isAvailable: true},
        {channel: spark, isAvailable: false},
        {channel: rock, isAvailable: false},
      ]).map(channel => channel.id),
    ).toEqual(['radiotedu-main', 'radiotedu-spark', 'radiotedu-rock']);
  });

  it('includes Spark and Rock in the playable TrackPlayer queue', () => {
    const queue = buildRadioQueue('high');

    expect(queue.map(track => track.id)).toContain('radiotedu-main');
    expect(queue.map(track => track.id)).toContain('radiotedu-spark');
    expect(queue.map(track => track.id)).toContain('radiotedu-rock');
  });
});
