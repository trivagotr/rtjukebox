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
    logo: 'https://radiotedu.com/logos/main-banner.png',
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
    logo: 'https://radiotedu.com/logos/classic-banner.png',
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
    logo: 'https://radiotedu.com/logos/jazz-banner.png',
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
    logo: 'https://radiotedu.com/logos/lofi-banner.png',
  },
];

export type RadioChannel = (typeof RADIO_CHANNELS)[0];
