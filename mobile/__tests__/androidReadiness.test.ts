import {describe, expect, it} from '@jest/globals';

import {
  buildAndroidReadiness,
  resolveNotificationPermissionState,
} from '../src/services/androidReadinessService';
import {
  buildAdaptiveLayoutReadiness,
  buildAndroid16ReadinessLab,
  buildAndroid16QprReadiness,
  buildAndroid17Readiness,
  buildAudioReadiness,
  buildCarQualityChecklist,
  buildGoogleMapsMediaReadiness,
  buildVoiceActionMap,
  resolveLiveUpdateCapability,
} from '../src/services/androidSystemCapabilities';

describe('androidReadinessService', () => {
  it('requires runtime notification permission on Android 13+', () => {
    expect(resolveNotificationPermissionState('android', 33, 'denied')).toEqual({
      required: true,
      granted: false,
      status: 'permission-required',
    });
  });

  it('treats media notification capability as available on older Android without POST_NOTIFICATIONS', () => {
    expect(resolveNotificationPermissionState('android', 32, 'denied')).toEqual({
      required: false,
      granted: true,
      status: 'available',
    });
  });

  it('builds a production-safe modern Android readiness matrix', () => {
    expect(
      buildAndroidReadiness({
        platform: 'android',
        version: 36,
        notificationPermission: 'granted',
        androidAutoAvailable: true,
        analyticsConfigured: true,
      }),
    ).toEqual({
      notificationVisibility: 'available',
      mediaSession: 'available',
      androidAuto: 'available',
      liveUpdates: 'live-update',
      adaptiveLayout: 'split-ready',
      android16: 'ready',
      android16Qpr: 'ready',
      android17: 'ready',
      xrSafe: 'available',
      audioQuality: 'high-quality',
      googleMapsMediaControls: 'ready',
      analytics: 'available',
      publishMode: 'production',
    });
  });

  it('marks Android 16 QPR beta readiness with OTP protection as not applicable for RadioTEDU', () => {
    expect(
      buildAndroid16QprReadiness({
        developerVerificationDocumented: true,
        smsOtpProtectionApplicable: false,
        customIconShapesTested: true,
        startupAndGcJankAudited: true,
      }),
    ).toEqual({
      status: 'ready',
      passed: 4,
      total: 4,
      notApplicable: ['sms-otp-protection'],
    });
  });

  it('marks Android 17 readiness when large-screen restrictions are safe to ignore', () => {
    expect(
      buildAndroid17Readiness({
        noOrientationLock: true,
        resizeableActivity: true,
        noAspectRatioLock: true,
        tabletFoldableChromeOsSafe: true,
        backgroundAudioHardened: true,
        memoryPressureAudited: true,
      }),
    ).toEqual({status: 'ready', passed: 6, total: 6});
  });

  it('reports adaptive layout readiness across tablet, foldable, ChromeOS and XR-safe 2D panels', () => {
    expect(
      buildAdaptiveLayoutReadiness({
        tablet: true,
        foldable: true,
        chromeOs: true,
        desktopWindowing: true,
        xrSafe2dPanel: true,
        fixedPhoneAssumptionsRemoved: true,
      }),
    ).toEqual({
      status: 'adaptive-ready',
      supported: ['tablet', 'foldable', 'chromeos', 'desktop-windowing', 'xr-safe-2d-panel', 'fixed-phone-assumptions-removed'],
    });
  });

  it('treats Google Maps playback as MediaSession/MediaBrowser readiness instead of a map-specific integration', () => {
    expect(
      buildGoogleMapsMediaReadiness({
        mediaSession: true,
        mediaBrowserService: true,
        notificationControls: true,
        assistantVoiceActions: true,
      }),
    ).toEqual({
      status: 'ready',
      route: 'google-maps-media-controls-via-mediasession',
      requiresGoogleValidation: true,
    });
  });

  it('uses Android 16 Live Updates only for ongoing user-visible audio activities', () => {
    expect(
      resolveLiveUpdateCapability({
        platform: 'android',
        apiLevel: 36,
        activity: 'podcast',
        isOngoing: true,
        userVisible: true,
      }),
    ).toEqual({
      surface: 'live-update',
      fallbackSurface: 'media-notification',
      reason: 'android-16-progress-centric',
    });
  });

  it('falls back to normal media notifications before Android 16', () => {
    expect(
      resolveLiveUpdateCapability({
        platform: 'android',
        apiLevel: 35,
        activity: 'radio',
        isOngoing: true,
        userVisible: true,
      }),
    ).toEqual({
      surface: 'media-notification',
      fallbackSurface: 'media-notification',
      reason: 'requires-android-16',
    });
  });

  it('maps published Android Auto voice actions to safe media actions', () => {
    expect(buildVoiceActionMap()).toEqual(
      expect.objectContaining({
        'Play Radio TEDU': {action: 'play-radio', mediaId: 'radiotedu-main'},
        'Play latest podcast': {action: 'play-latest-podcast', mediaId: 'podcast:latest'},
        'Radio TEDU cal': {action: 'play-radio', mediaId: 'radiotedu-main'},
        'son podcasti cal': {action: 'play-latest-podcast', mediaId: 'podcast:latest'},
        'Spark cal': {action: 'play-radio', mediaId: 'radiotedu-spark'},
        'Rock cal': {action: 'play-radio', mediaId: 'radiotedu-rock'},
        'Open jukebox': {action: 'open-jukebox', mediaId: 'cat_jukebox'},
      }),
    );
  });

  it('builds a Play car-quality checklist output for beta QA', () => {
    expect(
      buildCarQualityChecklist({
        hasMediaBrowserService: true,
        hasVoiceSearch: true,
        hasBrowseTree: true,
        hasDriverSafeJukebox: true,
        hasAutomotiveDescriptor: true,
        excludesStudySurfaces: true,
      }),
    ).toEqual({
      status: 'pass',
      passed: 6,
      total: 6,
      items: expect.arrayContaining([
        expect.objectContaining({id: 'media-browser', status: 'pass'}),
        expect.objectContaining({id: 'voice-actions', status: 'pass'}),
        expect.objectContaining({id: 'study-phone-only', status: 'pass'}),
      ]),
    });
  });

  it('fails Android Auto car-quality checks if Study or Çim alan are exposed to car surfaces', () => {
    expect(
      buildCarQualityChecklist({
        hasMediaBrowserService: true,
        hasVoiceSearch: true,
        hasBrowseTree: true,
        hasDriverSafeJukebox: true,
        hasAutomotiveDescriptor: true,
        excludesStudySurfaces: false,
      }),
    ).toEqual(expect.objectContaining({status: 'fail'}));
  });

  it('reports Android 16 readiness and modern audio capability support', () => {
    expect(
      buildAndroid16ReadinessLab({
        predictiveBack: true,
        edgeToEdge: true,
        supports16KbPages: true,
        startupDiagnostics: true,
        notificationCompatibility: true,
      }),
    ).toEqual({status: 'ready', passed: 5, total: 5});

    expect(
      buildAudioReadiness({
        highQualityStreams: true,
        mediaSession: true,
        bluetoothControls: true,
        spatialAudioSafe: true,
        loudnessMetadata: true,
      }),
    ).toEqual({
      status: 'high-quality',
      supported: ['high-quality-streams', 'media-session', 'bluetooth-controls', 'spatial-audio-safe', 'loudness-metadata'],
    });
  });
});
