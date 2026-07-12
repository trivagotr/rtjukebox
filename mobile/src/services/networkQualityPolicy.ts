import {
  RadioChannel,
  shouldWarnForMobileDataStream,
  StreamQuality,
} from '../data/radioChannels';

export type ConnectionKind =
  | 'mobile-data'
  | 'wifi'
  | 'metered-safe'
  | 'none'
  | 'unknown';

export function mapNetInfoTypeToConnectionKind(type: unknown): ConnectionKind {
  if (type === 'cellular') {
    return 'mobile-data';
  }
  if (type === 'wifi') {
    return 'wifi';
  }
  if (type === 'none') {
    return 'none';
  }
  if (type === 'ethernet' || type === 'bluetooth' || type === 'vpn' || type === 'wimax') {
    return 'metered-safe';
  }
  return 'unknown';
}

export function shouldShowFlacMobileDataWarning(
  channel: RadioChannel,
  quality: StreamQuality,
  connectionKind: ConnectionKind,
): boolean {
  return shouldWarnForMobileDataStream(
    channel,
    quality,
    connectionKind === 'mobile-data',
  );
}
