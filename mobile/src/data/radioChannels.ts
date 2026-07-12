// Each channel exposes two images:
//   logo    - wide banner used inside the app UI
//   artwork - image used for lock screen, notification and Android Auto /
//             CarPlay. Car systems center-CROP this to a square, so a true
//             square export (>=512x512) looks best. The URLs below are the real
//             RadioTEDU brand images (landscape ~2560x1551) and will be
//             center-cropped in the car until square versions are provided.
const MAIN_LOGO =
  'https://radiotedu.com/wp-content/uploads/2025/07/logo-02-scaled.png';
const JAZZ_LOGO =
  'https://radiotedu.com/wp-content/uploads/2025/07/tedu_jazz-scaled.png';
const LOFI_LOGO =
  'https://radiotedu.com/wp-content/uploads/2025/07/tedu_lofi-scaled.png';

export type StreamQuality = 'low' | 'medium' | 'high' | 'flac';

export type RadioChannelAvailability = 'live' | 'coming-soon';

export interface RadioChannel {
  id: string;
  name: string;
  description: string;
  streamUrl: string;
  mountPath: string;
  streams: Partial<Record<StreamQuality, string>>;
  codecLabels?: Partial<Record<StreamQuality, string>>;
  icon: string;
  color: string;
  logo: string;
  artwork: string;
  role?: 'main' | 'music' | 'ai-host';
  availability?: RadioChannelAvailability;
  mobileDataWarning?: string;
}

export interface RadioChannelCheck {
  channel: RadioChannel;
  isAvailable: boolean;
}

export const HIGH_QUALITY_MOBILE_DATA_WARNING =
  'This radio stream is high quality. Make sure your data plan is enough.';

export const RADIO_CHANNELS: RadioChannel[] = [
  {
    id: 'radiotedu-main',
    name: 'RadioTEDU',
    description: 'Ana Kanal',
    streamUrl: 'https://stream.radiotedu.com/radio',
    mountPath: '/radio',
    streams: {
      low: 'https://stream.radiotedu.com/radio?q=low',
      medium: 'https://stream.radiotedu.com/radio?q=medium',
      high: 'https://stream.radiotedu.com/radio?q=high',
    },
    codecLabels: {
      low: 'AAC',
      medium: 'AAC',
      high: 'AAC',
    },
    icon: 'radio-tower',
    color: '#E31E24',
    logo: MAIN_LOGO,
    artwork: MAIN_LOGO,
    role: 'main',
    availability: 'live',
  },
  {
    id: 'radiotedu-classic',
    name: 'Classic',
    description: 'Klasik Muzik',
    streamUrl: 'https://stream.radiotedu.com/classic',
    mountPath: '/classic',
    streams: {
      low: 'https://stream.radiotedu.com/classic?q=low',
      medium: 'https://stream.radiotedu.com/classic?q=medium',
      high: 'https://stream.radiotedu.com/classic?q=high',
    },
    codecLabels: {
      low: 'AAC',
      medium: 'AAC',
      high: 'AAC',
    },
    icon: 'music-clef-treble',
    color: '#E5A000',
    // TODO: no Classic-specific asset provided yet - falls back to main logo.
    logo: MAIN_LOGO,
    artwork: MAIN_LOGO,
    role: 'music',
    availability: 'live',
  },
  {
    id: 'radiotedu-jazz',
    name: 'Jazz',
    description: 'Caz Muzik',
    streamUrl: 'https://stream.radiotedu.com/cazz',
    mountPath: '/cazz',
    streams: {
      low: 'https://stream.radiotedu.com/cazz?q=low',
      medium: 'https://stream.radiotedu.com/cazz?q=medium',
      high: 'https://stream.radiotedu.com/cazz?q=high',
    },
    codecLabels: {
      low: 'AAC',
      medium: 'AAC',
      high: 'AAC',
    },
    icon: 'saxophone',
    color: '#9C27B0',
    logo: JAZZ_LOGO,
    artwork: JAZZ_LOGO,
    role: 'music',
    availability: 'live',
  },
  {
    id: 'radiotedu-lofi',
    name: 'Lo-Fi',
    description: 'Lo-Fi Beats',
    streamUrl: 'https://stream.radiotedu.com/lofi',
    mountPath: '/lofi',
    streams: {
      low: 'https://stream.radiotedu.com/lofi?q=low',
      medium: 'https://stream.radiotedu.com/lofi?q=medium',
      high: 'https://stream.radiotedu.com/lofi?q=high',
    },
    codecLabels: {
      low: 'AAC',
      medium: 'AAC',
      high: 'AAC',
    },
    icon: 'headphones',
    color: '#00BCD4',
    logo: LOFI_LOGO,
    artwork: LOFI_LOGO,
    role: 'music',
    availability: 'live',
  },
  {
    id: 'radiotedu-spark',
    name: 'Spark',
    description: 'rtAI - Radio AI Host',
    streamUrl: 'https://stream.radiotedu.com/spark',
    mountPath: '/spark',
    streams: {
      low: 'https://stream.radiotedu.com/spark?q=low',
      medium: 'https://stream.radiotedu.com/spark?q=medium',
      high: 'https://stream.radiotedu.com/spark?q=high',
      flac: 'https://stream.radiotedu.com/spark.flac',
    },
    codecLabels: {
      low: 'AAC',
      medium: 'AAC',
      high: 'AAC',
      flac: 'FLAC',
    },
    icon: 'creation',
    color: '#20D6C7',
    logo: MAIN_LOGO,
    artwork: MAIN_LOGO,
    role: 'ai-host',
    availability: 'live',
    mobileDataWarning: HIGH_QUALITY_MOBILE_DATA_WARNING,
  },
  {
    id: 'radiotedu-rock',
    name: 'Rock',
    description: 'Rock',
    streamUrl: 'https://stream.radiotedu.com/rock',
    mountPath: '/rock',
    streams: {
      low: 'https://stream.radiotedu.com/rock?q=low',
      medium: 'https://stream.radiotedu.com/rock?q=medium',
      high: 'https://stream.radiotedu.com/rock?q=high',
      flac: 'https://stream.radiotedu.com/rock.flac',
    },
    codecLabels: {
      low: 'AAC',
      medium: 'AAC',
      high: 'AAC',
      flac: 'FLAC',
    },
    icon: 'guitar-electric',
    color: '#FF6B2C',
    logo: MAIN_LOGO,
    artwork: MAIN_LOGO,
    role: 'music',
    availability: 'live',
    mobileDataWarning: HIGH_QUALITY_MOBILE_DATA_WARNING,
  },
];

export function getAvailableStreamQualities(
  channel: RadioChannel,
): StreamQuality[] {
  return (['high', 'flac', 'medium', 'low'] as StreamQuality[]).filter(
    quality => Boolean(channel.streams[quality]),
  );
}

export function resolveStreamQuality(
  channel: RadioChannel,
  preferred: StreamQuality,
): StreamQuality {
  if (channel.streams[preferred]) {
    return preferred;
  }
  return getAvailableStreamQualities(channel)[0] ?? 'high';
}

export function shouldWarnForMobileDataStream(
  channel: RadioChannel,
  quality: StreamQuality,
  isMobileData: boolean,
): boolean {
  return Boolean(isMobileData && quality === 'flac' && channel.mobileDataWarning);
}

export function isChannelPlayable(channel: RadioChannel): boolean {
  return channel.availability !== 'coming-soon';
}

const RETAIN_WHEN_STREAM_UNAVAILABLE = new Set(['radiotedu-spark', 'radiotedu-rock']);

export function buildVisibleChannels(
  checks: RadioChannelCheck[],
): RadioChannel[] {
  return checks
    .filter(({channel, isAvailable}) =>
      isAvailable || !isChannelPlayable(channel) || RETAIN_WHEN_STREAM_UNAVAILABLE.has(channel.id),
    )
    .map(({channel}) => channel);
}
