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
};
