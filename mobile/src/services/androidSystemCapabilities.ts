export type AndroidActivityKind = 'radio' | 'podcast' | 'jukebox' | 'event';
export type RuntimePlatform = 'android' | 'ios' | 'web' | string;

export type LiveUpdateInput = {
  platform: RuntimePlatform;
  apiLevel: number;
  activity: AndroidActivityKind;
  isOngoing: boolean;
  userVisible: boolean;
};

export type LiveUpdateCapability = {
  surface: 'live-update' | 'media-notification' | 'standard-notification' | 'none';
  fallbackSurface: 'media-notification' | 'standard-notification';
  reason: 'android-16-progress-centric' | 'requires-android-16' | 'not-user-visible' | 'non-android';
};

export type VoiceAction = {
  action: 'play-radio' | 'play-latest-podcast' | 'open-jukebox';
  mediaId: string;
};

export type CarQualityInput = {
  hasMediaBrowserService: boolean;
  hasVoiceSearch: boolean;
  hasBrowseTree: boolean;
  hasDriverSafeJukebox: boolean;
  hasAutomotiveDescriptor: boolean;
  excludesStudySurfaces?: boolean;
};

export type ChecklistItem = {
  id: string;
  label: string;
  status: 'pass' | 'fail';
};

export type ChecklistResult = {
  status: 'pass' | 'fail';
  passed: number;
  total: number;
  items: ChecklistItem[];
};

export type Android16ReadinessInput = {
  predictiveBack: boolean;
  edgeToEdge: boolean;
  supports16KbPages: boolean;
  startupDiagnostics: boolean;
  notificationCompatibility: boolean;
};

export type Android16ReadinessResult = {
  status: 'ready' | 'needs-work';
  passed: number;
  total: number;
};

export type Android16QprReadinessInput = {
  developerVerificationDocumented: boolean;
  smsOtpProtectionApplicable: boolean;
  customIconShapesTested: boolean;
  startupAndGcJankAudited: boolean;
};

export type Android16QprReadinessResult = {
  status: 'ready' | 'needs-work';
  passed: number;
  total: number;
  notApplicable: string[];
};

export type Android17ReadinessInput = {
  noOrientationLock: boolean;
  resizeableActivity: boolean;
  noAspectRatioLock: boolean;
  tabletFoldableChromeOsSafe: boolean;
  backgroundAudioHardened: boolean;
  memoryPressureAudited: boolean;
};

export type Android17ReadinessResult = {
  status: 'ready' | 'needs-work';
  passed: number;
  total: number;
};

export type AdaptiveLayoutReadinessInput = {
  tablet: boolean;
  foldable: boolean;
  chromeOs: boolean;
  desktopWindowing: boolean;
  xrSafe2dPanel: boolean;
  fixedPhoneAssumptionsRemoved: boolean;
};

export type AdaptiveLayoutReadiness = {
  status: 'adaptive-ready' | 'needs-work';
  supported: string[];
};

export type GoogleMapsMediaReadinessInput = {
  mediaSession: boolean;
  mediaBrowserService: boolean;
  notificationControls: boolean;
  assistantVoiceActions: boolean;
};

export type GoogleMapsMediaReadiness = {
  status: 'ready' | 'needs-work';
  route: 'google-maps-media-controls-via-mediasession';
  requiresGoogleValidation: boolean;
};

export type AudioReadinessInput = {
  highQualityStreams: boolean;
  mediaSession: boolean;
  bluetoothControls: boolean;
  spatialAudioSafe: boolean;
  loudnessMetadata: boolean;
};

export type AudioReadiness = {
  status: 'high-quality' | 'basic' | 'needs-work';
  supported: string[];
};

const AUDIO_ACTIVITY = new Set<AndroidActivityKind>(['radio', 'podcast', 'jukebox']);

export function resolveLiveUpdateCapability(input: LiveUpdateInput): LiveUpdateCapability {
  const fallbackSurface = AUDIO_ACTIVITY.has(input.activity) ? 'media-notification' : 'standard-notification';

  if (input.platform !== 'android') {
    return {surface: 'none', fallbackSurface, reason: 'non-android'};
  }

  if (!input.userVisible || !input.isOngoing) {
    return {surface: fallbackSurface, fallbackSurface, reason: 'not-user-visible'};
  }

  if (input.apiLevel < 36) {
    return {surface: fallbackSurface, fallbackSurface, reason: 'requires-android-16'};
  }

  return {surface: 'live-update', fallbackSurface, reason: 'android-16-progress-centric'};
}

export function buildVoiceActionMap(): Record<string, VoiceAction> {
  return {
    'Play Radio TEDU': {action: 'play-radio', mediaId: 'radiotedu-main'},
    'Radio TEDU cal': {action: 'play-radio', mediaId: 'radiotedu-main'},
    'Hey Gemini, play RadioTEDU': {action: 'play-radio', mediaId: 'radiotedu-main'},
    'Hey Gemini, RadioTEDU cal': {action: 'play-radio', mediaId: 'radiotedu-main'},
    'Hey Gemini, play Spark on RadioTEDU': {action: 'play-radio', mediaId: 'radiotedu-spark'},
    'Hey Gemini, play RadioTEDU Rock': {action: 'play-radio', mediaId: 'radiotedu-rock'},
    'Spark cal': {action: 'play-radio', mediaId: 'radiotedu-spark'},
    'Rock cal': {action: 'play-radio', mediaId: 'radiotedu-rock'},
    'Play latest podcast': {action: 'play-latest-podcast', mediaId: 'podcast:latest'},
    'son podcasti cal': {action: 'play-latest-podcast', mediaId: 'podcast:latest'},
    'Open jukebox': {action: 'open-jukebox', mediaId: 'cat_jukebox'},
  };
}

export function buildCarQualityChecklist(input: CarQualityInput): ChecklistResult {
  const items: ChecklistItem[] = [
    {
      id: 'media-browser',
      label: 'MediaBrowserService exposed for Android Auto and Automotive OS',
      status: input.hasMediaBrowserService ? 'pass' : 'fail',
    },
    {
      id: 'voice-actions',
      label: 'Media session supports voice search and play-from-search',
      status: input.hasVoiceSearch ? 'pass' : 'fail',
    },
    {
      id: 'browse-tree',
      label: 'Browse tree has radio, podcasts, rankings and jukebox destinations',
      status: input.hasBrowseTree ? 'pass' : 'fail',
    },
    {
      id: 'driver-safe-jukebox',
      label: 'Jukebox is listen-only in car surfaces',
      status: input.hasDriverSafeJukebox ? 'pass' : 'fail',
    },
    {
      id: 'automotive-descriptor',
      label: 'Automotive media descriptor is declared',
      status: input.hasAutomotiveDescriptor ? 'pass' : 'fail',
    },
    {
      id: 'study-phone-only',
      label: 'Study, Çim alan and avatar clothes stay out of Android Auto car surfaces',
      status: input.excludesStudySurfaces !== false ? 'pass' : 'fail',
    },
  ];
  const passed = items.filter(item => item.status === 'pass').length;
  return {status: passed === items.length ? 'pass' : 'fail', passed, total: items.length, items};
}

export function buildAndroid16ReadinessLab(input: Android16ReadinessInput): Android16ReadinessResult {
  const checks = [
    input.predictiveBack,
    input.edgeToEdge,
    input.supports16KbPages,
    input.startupDiagnostics,
    input.notificationCompatibility,
  ];
  const passed = checks.filter(Boolean).length;
  return {status: passed === checks.length ? 'ready' : 'needs-work', passed, total: checks.length};
}

export function buildAndroid16QprReadiness(input: Android16QprReadinessInput): Android16QprReadinessResult {
  const checks = [
    input.developerVerificationDocumented,
    !input.smsOtpProtectionApplicable,
    input.customIconShapesTested,
    input.startupAndGcJankAudited,
  ];
  const passed = checks.filter(Boolean).length;
  return {
    status: passed === checks.length ? 'ready' : 'needs-work',
    passed,
    total: checks.length,
    notApplicable: input.smsOtpProtectionApplicable ? [] : ['sms-otp-protection'],
  };
}

export function buildAndroid17Readiness(input: Android17ReadinessInput): Android17ReadinessResult {
  const checks = [
    input.noOrientationLock,
    input.resizeableActivity,
    input.noAspectRatioLock,
    input.tabletFoldableChromeOsSafe,
    input.backgroundAudioHardened,
    input.memoryPressureAudited,
  ];
  const passed = checks.filter(Boolean).length;
  return {status: passed === checks.length ? 'ready' : 'needs-work', passed, total: checks.length};
}

export function buildAdaptiveLayoutReadiness(input: AdaptiveLayoutReadinessInput): AdaptiveLayoutReadiness {
  const supported = [
    input.tablet ? 'tablet' : null,
    input.foldable ? 'foldable' : null,
    input.chromeOs ? 'chromeos' : null,
    input.desktopWindowing ? 'desktop-windowing' : null,
    input.xrSafe2dPanel ? 'xr-safe-2d-panel' : null,
    input.fixedPhoneAssumptionsRemoved ? 'fixed-phone-assumptions-removed' : null,
  ].filter((value): value is string => Boolean(value));

  return {
    status: supported.length === 6 ? 'adaptive-ready' : 'needs-work',
    supported,
  };
}

export function buildGoogleMapsMediaReadiness(input: GoogleMapsMediaReadinessInput): GoogleMapsMediaReadiness {
  const ready = input.mediaSession && input.mediaBrowserService && input.notificationControls && input.assistantVoiceActions;
  return {
    status: ready ? 'ready' : 'needs-work',
    route: 'google-maps-media-controls-via-mediasession',
    requiresGoogleValidation: true,
  };
}

export function buildAudioReadiness(input: AudioReadinessInput): AudioReadiness {
  const supported = [
    input.highQualityStreams ? 'high-quality-streams' : null,
    input.mediaSession ? 'media-session' : null,
    input.bluetoothControls ? 'bluetooth-controls' : null,
    input.spatialAudioSafe ? 'spatial-audio-safe' : null,
    input.loudnessMetadata ? 'loudness-metadata' : null,
  ].filter((value): value is string => Boolean(value));

  if (supported.length >= 5) {
    return {status: 'high-quality', supported};
  }

  if (supported.length >= 3) {
    return {status: 'basic', supported};
  }

  return {status: 'needs-work', supported};
}
