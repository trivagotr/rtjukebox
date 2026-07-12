import {describe, expect, it} from '@jest/globals';

import {RADIO_CHANNELS} from '../src/data/radioChannels';
import {
  mapNetInfoTypeToConnectionKind,
  shouldShowFlacMobileDataWarning,
} from '../src/services/networkQualityPolicy';

describe('network quality policy', () => {
  it('maps native NetInfo connection types to app-level connection kinds', () => {
    expect(mapNetInfoTypeToConnectionKind('cellular')).toBe('mobile-data');
    expect(mapNetInfoTypeToConnectionKind('wifi')).toBe('wifi');
    expect(mapNetInfoTypeToConnectionKind('ethernet')).toBe('metered-safe');
    expect(mapNetInfoTypeToConnectionKind('unknown')).toBe('unknown');
  });

  it('warns for Spark FLAC only on mobile data', () => {
    const spark = RADIO_CHANNELS.find(channel => channel.id === 'radiotedu-spark')!;

    expect(shouldShowFlacMobileDataWarning(spark, 'flac', 'mobile-data')).toBe(true);
    expect(shouldShowFlacMobileDataWarning(spark, 'flac', 'wifi')).toBe(false);
    expect(shouldShowFlacMobileDataWarning(spark, 'high', 'mobile-data')).toBe(false);
  });
});
