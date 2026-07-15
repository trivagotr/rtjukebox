import {PermissionsAndroid, Platform} from 'react-native';

import api from './api';

export type NotificationPreferences = {
  podcast?: boolean;
  radio?: boolean;
  jukebox?: boolean;
  events?: boolean;
};

export type NotificationRegistrationResult = {
  notifications_ready: boolean;
};

const PREFERENCE_KEYS: Array<keyof NotificationPreferences> = [
  'podcast',
  'radio',
  'jukebox',
  'events',
];

export function buildNotificationPreferencesPayload(preferences: NotificationPreferences) {
  return PREFERENCE_KEYS.reduce<Record<string, boolean>>((payload, key) => {
    if (typeof preferences[key] === 'boolean') {
      payload[key] = preferences[key] as boolean;
    }
    return payload;
  }, {});
}

export async function requestAndroidNotificationPermission(): Promise<'granted' | 'denied' | 'unavailable'> {
  if (Platform.OS !== 'android') {
    return 'unavailable';
  }

  const apiLevel = typeof Platform.Version === 'number'
    ? Platform.Version
    : Number.parseInt(String(Platform.Version), 10);
  if (apiLevel < 33) {
    return 'granted';
  }

  const result = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
  );
  return result === PermissionsAndroid.RESULTS.GRANTED ? 'granted' : 'denied';
}

export async function registerNotificationToken(token: string): Promise<NotificationRegistrationResult> {
  const normalizedToken = token.trim();
  if (!normalizedToken) {
    throw new Error('Notification token required');
  }

  const response = await api.put('/notifications/device-token', {
    fcm_token: normalizedToken,
  });

  return response.data.data;
}

export async function updateNotificationPreferences(preferences: NotificationPreferences) {
  const payload = buildNotificationPreferencesPayload(preferences);
  const response = await api.put('/notifications/preferences', {
    preferences: payload,
  });

  return response.data.data;
}
