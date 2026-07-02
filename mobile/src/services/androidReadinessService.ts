import {
  buildAdaptiveLayoutReadiness,
  buildAndroid16ReadinessLab,
  buildAndroid16QprReadiness,
  buildAndroid17Readiness,
  buildAudioReadiness,
  buildGoogleMapsMediaReadiness,
  resolveLiveUpdateCapability,
} from './androidSystemCapabilities';

export type RuntimePlatform = 'android' | 'ios' | 'web' | string;
export type NotificationPermissionResult = 'granted' | 'denied' | 'never_ask_again' | 'unavailable' | null | undefined;

export type NotificationPermissionState = {
  required: boolean;
  granted: boolean;
  status: 'available' | 'permission-required' | 'unavailable';
};

export type AndroidReadinessInput = {
  platform: RuntimePlatform;
  version: number | string;
  notificationPermission: NotificationPermissionResult;
  androidAutoAvailable: boolean;
  analyticsConfigured: boolean;
};

export type AndroidReadiness = {
  notificationVisibility: 'available' | 'permission-required' | 'unavailable';
  mediaSession: 'available' | 'unavailable';
  androidAuto: 'available' | 'fallback';
  liveUpdates: 'live-update' | 'media-notification' | 'standard-notification' | 'none';
  adaptiveLayout: 'split-ready' | 'phone-only';
  android16: 'ready' | 'needs-work';
  android16Qpr: 'ready' | 'needs-work';
  android17: 'ready' | 'needs-work';
  xrSafe: 'available' | 'fallback';
  audioQuality: 'high-quality' | 'basic' | 'needs-work';
  googleMapsMediaControls: 'ready' | 'needs-work';
  analytics: 'available' | 'disabled';
  publishMode: 'production';
};

function normalizeVersion(version: number | string) {
  if (typeof version === 'number') {
    return version;
  }

  const parsed = Number.parseInt(version, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function resolveNotificationPermissionState(
  platform: RuntimePlatform,
  version: number | string,
  permissionResult: NotificationPermissionResult,
): NotificationPermissionState {
  if (platform !== 'android') {
    return {required: false, granted: false, status: 'unavailable'};
  }

  const apiLevel = normalizeVersion(version);
  if (apiLevel < 33) {
    return {required: false, granted: true, status: 'available'};
  }

  const granted = permissionResult === 'granted';
  return {
    required: true,
    granted,
    status: granted ? 'available' : 'permission-required',
  };
}

export function buildAndroidReadiness(input: AndroidReadinessInput): AndroidReadiness {
  const notificationState = resolveNotificationPermissionState(
    input.platform,
    input.version,
    input.notificationPermission,
  );
  const apiLevel = normalizeVersion(input.version);
  const isAndroid = input.platform === 'android';
  const liveUpdates = resolveLiveUpdateCapability({
    platform: input.platform,
    apiLevel,
    activity: 'radio',
    isOngoing: true,
    userVisible: true,
  });
  const android16 = buildAndroid16ReadinessLab({
    predictiveBack: isAndroid,
    edgeToEdge: isAndroid,
    supports16KbPages: isAndroid,
    startupDiagnostics: isAndroid,
    notificationCompatibility: notificationState.status !== 'unavailable',
  });
  const audio = buildAudioReadiness({
    highQualityStreams: isAndroid,
    mediaSession: isAndroid,
    bluetoothControls: isAndroid,
    spatialAudioSafe: isAndroid,
    loudnessMetadata: isAndroid,
  });
  const android16Qpr = buildAndroid16QprReadiness({
    developerVerificationDocumented: isAndroid,
    smsOtpProtectionApplicable: false,
    customIconShapesTested: isAndroid,
    startupAndGcJankAudited: isAndroid,
  });
  const android17 = buildAndroid17Readiness({
    noOrientationLock: isAndroid,
    resizeableActivity: isAndroid,
    noAspectRatioLock: isAndroid,
    tabletFoldableChromeOsSafe: isAndroid,
    backgroundAudioHardened: isAndroid,
    memoryPressureAudited: isAndroid,
  });
  const adaptiveLayout = buildAdaptiveLayoutReadiness({
    tablet: isAndroid,
    foldable: isAndroid,
    chromeOs: isAndroid,
    desktopWindowing: isAndroid,
    xrSafe2dPanel: isAndroid,
    fixedPhoneAssumptionsRemoved: isAndroid,
  });
  const googleMapsMedia = buildGoogleMapsMediaReadiness({
    mediaSession: isAndroid,
    mediaBrowserService: isAndroid,
    notificationControls: notificationState.status !== 'unavailable',
    assistantVoiceActions: isAndroid,
  });

  return {
    notificationVisibility: notificationState.status,
    mediaSession: isAndroid ? 'available' : 'unavailable',
    androidAuto: isAndroid && input.androidAutoAvailable ? 'available' : 'fallback',
    liveUpdates: liveUpdates.surface,
    adaptiveLayout: adaptiveLayout.status === 'adaptive-ready' ? 'split-ready' : 'phone-only',
    android16: android16.status,
    android16Qpr: android16Qpr.status,
    android17: android17.status,
    xrSafe: isAndroid ? 'available' : 'fallback',
    audioQuality: audio.status,
    googleMapsMediaControls: googleMapsMedia.status,
    analytics: input.analyticsConfigured ? 'available' : 'disabled',
    publishMode: 'production',
  };
}
