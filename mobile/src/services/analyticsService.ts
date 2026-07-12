/**
 * Anonymized analytics via Google Analytics 4 Measurement Protocol.
 *
 * Privacy rules enforced here:
 *  - Sends NOTHING unless the user consented (`setAnalyticsConsent(true)`).
 *  - Sends NOTHING unless GA4 credentials are configured (`config.ts`).
 *  - Identifier is the pseudonymous, rotatable install id — never the account,
 *    name, email, or location.
 *  - Demographics (age range / gender) are attached only with separate consent.
 *  - Never throws — analytics must never crash the app or block playback.
 *
 * Only RadioTEDU managers granted access to the GA4 property can view the data.
 */
import axios from 'axios';
import {
  GA4_API_SECRET,
  GA4_ENDPOINT,
  GA4_MEASUREMENT_ID,
  isAnalyticsConfigured,
} from './config';
import {getInstallId} from '../privacy/installId';

let analyticsAllowed = false;
let demographics: {ageRange?: string | null; gender?: string | null} = {};

export type AnalyticsSignalName =
  | 'notification_open'
  | 'podcast_listen'
  | 'car_playback'
  | 'qr_claim'
  | 'jukebox_queue'
  | 'game_session'
  | 'retention';

type AnalyticsSignalInput = {
  category?: string;
  deepLink?: string;
  contentId?: string;
  seconds?: number;
  source?: string;
  mediaId?: string;
  deviceCode?: string;
  queuePosition?: number;
  game?: string;
  outcome?: string;
  daysSinceInstall?: number;
};

export type AnalyticsSignal = {
  name: AnalyticsSignalName;
  params: Record<string, string | number>;
};

/** Called by the consent layer whenever consent changes. */
export function setAnalyticsConsent(
  allowed: boolean,
  demo?: {ageRange?: string | null; gender?: string | null},
): void {
  analyticsAllowed = allowed;
  demographics = demo ?? {};
}

async function send(
  name: string,
  params: Record<string, string | number> = {},
): Promise<void> {
  if (!analyticsAllowed || !isAnalyticsConfigured()) {
    return;
  }
  try {
    const clientId = await getInstallId();
    const userProps: Record<string, {value: string}> = {};
    if (demographics.ageRange) {
      userProps.age_range = {value: demographics.ageRange};
    }
    if (demographics.gender) {
      userProps.gender = {value: demographics.gender};
    }
    await axios.post(
      `${GA4_ENDPOINT}?measurement_id=${GA4_MEASUREMENT_ID}&api_secret=${GA4_API_SECRET}`,
      {
        client_id: clientId,
        non_personalized_ads: true,
        ...(Object.keys(userProps).length ? {user_properties: userProps} : {}),
        events: [{name, params: {engagement_time_msec: 1, ...params}}],
      },
      {timeout: 8000},
    );
  } catch {
    // swallow — analytics is best-effort and must never affect the user
  }
}

export function buildAnalyticsSignal(name: AnalyticsSignalName, input: AnalyticsSignalInput): AnalyticsSignal {
  switch (name) {
    case 'notification_open':
      return {
        name,
        params: {
          ...(input.category ? {category: input.category} : {}),
          ...(input.deepLink ? {deep_link: input.deepLink} : {}),
        },
      };
    case 'podcast_listen':
      return {
        name,
        params: {
          content_id: input.contentId ?? 'unknown',
          seconds: input.seconds ?? 0,
          minutes: Math.round((input.seconds ?? 0) / 60),
        },
      };
    case 'car_playback':
      return {
        name,
        params: {
          source: input.source ?? 'android-auto',
          media_id: input.mediaId ?? 'unknown',
        },
      };
    case 'qr_claim':
      return {
        name,
        params: {
          device_code: input.deviceCode ?? 'unknown',
        },
      };
    case 'jukebox_queue':
      return {
        name,
        params: {
          device_code: input.deviceCode ?? 'unknown',
          queue_position: input.queuePosition ?? 0,
        },
      };
    case 'game_session':
      return {
        name,
        params: {
          game: input.game ?? 'unknown',
          outcome: input.outcome ?? 'unknown',
        },
      };
    case 'retention':
      return {
        name,
        params: {
          days_since_install: input.daysSinceInstall ?? 0,
        },
      };
  }
}

function sendSignal(name: AnalyticsSignalName, input: AnalyticsSignalInput): Promise<void> {
  const signal = buildAnalyticsSignal(name, input);
  return send(signal.name, signal.params);
}

export const Analytics = {
  appOpen: () => send('app_open'),
  sessionStart: () => send('session_start'),
  /** Listening duration for a channel/podcast (minutes is the key audience KPI). */
  listen: (contentId: string, seconds: number) =>
    send('listen', {
      content_id: contentId,
      minutes: Math.round(seconds / 60),
      seconds,
    }),
  screenView: (screen: string) => send('screen_view', {screen_name: screen}),
  notificationOpen: (category: string, deepLink?: string) =>
    sendSignal('notification_open', {category, deepLink}),
  podcastListen: (contentId: string, seconds: number) =>
    sendSignal('podcast_listen', {contentId, seconds}),
  carPlayback: (source: string, mediaId: string) =>
    sendSignal('car_playback', {source, mediaId}),
  qrClaim: (deviceCode: string) => sendSignal('qr_claim', {deviceCode}),
  jukeboxQueue: (deviceCode: string, queuePosition: number) =>
    sendSignal('jukebox_queue', {deviceCode, queuePosition}),
  gameSession: (game: string, outcome: string) =>
    sendSignal('game_session', {game, outcome}),
  retention: (daysSinceInstall: number) => sendSignal('retention', {daysSinceInstall}),
};
