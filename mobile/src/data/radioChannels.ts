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

export const RADIO_CHANNELS = [
  {
    id: 'radiotedu-main',
    name: 'RadioTEDU',
    description: 'Ana Kanal',
    streamUrl: 'https://stream.radiotedu.com/radio',
    streams: {
      low: 'https://stream.radiotedu.com/radio?q=low',
      medium: 'https://stream.radiotedu.com/radio?q=medium',
      high: 'https://stream.radiotedu.com/radio?q=high',
    },
    icon: 'radio-tower',
    color: '#E31E24',
    logo: MAIN_LOGO,
    artwork: MAIN_LOGO,
  },
  {
    id: 'radiotedu-classic',
    name: 'Classic',
    description: 'Klasik Müzik',
    streamUrl: 'https://stream.radiotedu.com/classic',
    streams: {
      low: 'https://stream.radiotedu.com/classic?q=low',
      medium: 'https://stream.radiotedu.com/classic?q=medium',
      high: 'https://stream.radiotedu.com/classic?q=high',
    },
    icon: 'music-clef-treble',
    color: '#E5A000',
    // TODO: no Classic-specific asset provided yet - falls back to main logo.
    logo: MAIN_LOGO,
    artwork: MAIN_LOGO,
  },
  {
    id: 'radiotedu-jazz',
    name: 'Jazz',
    description: 'Caz Müzik',
    streamUrl: 'https://stream.radiotedu.com/cazz',
    streams: {
      low: 'https://stream.radiotedu.com/cazz?q=low',
      medium: 'https://stream.radiotedu.com/cazz?q=medium',
      high: 'https://stream.radiotedu.com/cazz?q=high',
    },
    icon: 'saxophone',
    color: '#9C27B0',
    logo: JAZZ_LOGO,
    artwork: JAZZ_LOGO,
  },
  {
    id: 'radiotedu-lofi',
    name: 'Lo-Fi',
    description: 'Lo-Fi Beats',
    streamUrl: 'https://stream.radiotedu.com/lofi',
    streams: {
      low: 'https://stream.radiotedu.com/lofi?q=low',
      medium: 'https://stream.radiotedu.com/lofi?q=medium',
      high: 'https://stream.radiotedu.com/lofi?q=high',
    },
    icon: 'headphones',
    color: '#00BCD4',
    logo: LOFI_LOGO,
    artwork: LOFI_LOGO,
  },
];

export type RadioChannel = (typeof RADIO_CHANNELS)[0];

export type StreamQuality = 'low' | 'medium' | 'high';
