const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function matchNumber(content, pattern, label) {
  const match = content.match(pattern);
  if (!match) {
    throw new Error(`Missing ${label}`);
  }
  return Number(match[1]);
}

function check(condition, label, details) {
  return {
    label,
    status: condition ? 'pass' : 'fail',
    details,
  };
}

function main() {
  const buildGradle = read('android/build.gradle');
  const appGradle = read('android/app/build.gradle');
  const manifest = read('android/app/src/main/AndroidManifest.xml');
  const automotiveManifest = read('android/app/src/automotive/AndroidManifest.xml');
  const autoDesc = read('android/app/src/main/res/xml/automotive_app_desc.xml');
  const proguard = read('android/app/proguard-rules.pro');
  const releaseChecklist = read('docs/RELEASE_CHECKLIST.md');
  const modernReadiness = read('docs/ANDROID_MODERN_PUBLISH_READINESS.md');
  const androidReadinessTest = read('__tests__/androidReadiness.test.ts');
  const backendConnectivityTests = [
    exists('__tests__/nextSongVote.test.ts'),
    exists('__tests__/notificationService.test.ts'),
    exists('__tests__/studyService.test.ts'),
    exists('__tests__/carBridgeSource.test.ts'),
  ].every(Boolean);

  const compileSdk = matchNumber(buildGradle, /compileSdkVersion\s*=\s*(\d+)/, 'compileSdkVersion');
  const targetSdk = matchNumber(buildGradle, /targetSdkVersion\s*=\s*(\d+)/, 'targetSdkVersion');
  const launcherDensities = ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi'];
  const hasLightLauncherIcons = launcherDensities.every((density) =>
    exists(`android/app/src/main/res/mipmap-${density}/ic_launcher.png`) &&
    exists(`android/app/src/main/res/mipmap-${density}/ic_launcher_round.png`)
  );
  const hasDarkLauncherIcons = launcherDensities.every((density) =>
    exists(`android/app/src/main/res/mipmap-night-${density}/ic_launcher.png`) &&
    exists(`android/app/src/main/res/mipmap-night-${density}/ic_launcher_round.png`)
  );

  const checks = [
    check(compileSdk >= 35, 'Compile SDK is Play-current', `compileSdkVersion=${compileSdk}`),
    check(targetSdk >= 35, 'Target SDK is Play-current for phone publishing', `targetSdkVersion=${targetSdk}`),
    check(/applicationId\s+"com\.radiotedumobile"/.test(appGradle), 'Application id is stable', 'com.radiotedumobile'),
    check(/versionCode\s+\d+/.test(appGradle) && /versionName\s+"[^"]+"/.test(appGradle), 'Version code/name are declared', 'Gradle defaultConfig'),
    check(/POST_NOTIFICATIONS/.test(manifest), 'Android 13+ notification permission declared', 'POST_NOTIFICATIONS'),
    check(hasLightLauncherIcons, 'Literal RadioTEDU signal launcher icons exist', 'mipmap-* ic_launcher + ic_launcher_round'),
    check(hasDarkLauncherIcons, 'Dark system launcher icons exist', 'mipmap-night-* ic_launcher + ic_launcher_round'),
    check(/FOREGROUND_SERVICE_MEDIA_PLAYBACK/.test(manifest), 'Media playback foreground service declared', 'FOREGROUND_SERVICE_MEDIA_PLAYBACK'),
    check(/android\.media\.browse\.MediaBrowserService/.test(manifest), 'Android Auto media browser service declared', 'RadioTeduCarService'),
    check(/MEDIA_PLAY_FROM_SEARCH/.test(manifest), 'Android Auto voice search action declared', 'MEDIA_PLAY_FROM_SEARCH'),
    check(/<uses\s+name="media"\s*\/>/.test(autoDesc), 'Automotive app descriptor opts into media', 'automotive_app_desc.xml'),
    check(
      /android:name="android\.hardware\.type\.automotive"[\s\S]*android:required="true"/.test(automotiveManifest),
      'Automotive flavor requires automotive hardware',
      'automotive source set',
    ),
    check(!/screenOrientation=/.test(manifest), 'Adaptive layouts are not orientation-locked', 'no android:screenOrientation on MainActivity'),
    check(/resizeableActivity="true"/.test(manifest), 'Large screen and foldable resize support is explicit', 'resizeableActivity=true'),
    check(/MediaBrowserServiceCompat|MediaSessionCompat/.test(proguard), 'Release keep rules cover car media services', 'proguard-rules.pro'),
    check(/Privacy Policy URL/.test(releaseChecklist), 'Release checklist covers Play privacy URL', 'docs/RELEASE_CHECKLIST.md'),
    check(/Live Updates/.test(modernReadiness) && /media notification fallback/i.test(modernReadiness), 'Android 16 Live Updates fallback is documented', 'docs/ANDROID_MODERN_PUBLISH_READINESS.md'),
    check(/16 KB page/i.test(modernReadiness) && /predictive back/i.test(modernReadiness), 'Android 16 readiness checks are documented', 'docs/ANDROID_MODERN_PUBLISH_READINESS.md'),
    check(/Android 16 QPR beta/i.test(modernReadiness) && /SMS OTP protection: not applicable/i.test(modernReadiness), 'Android 16 QPR readiness is documented', 'docs/ANDROID_MODERN_PUBLISH_READINESS.md'),
    check(/Android 17 beta/i.test(modernReadiness) && /orientation, resizability and aspect ratio/i.test(modernReadiness), 'Android 17 large-screen readiness is documented', 'docs/ANDROID_MODERN_PUBLISH_READINESS.md'),
    check(/Google Maps media controls/i.test(modernReadiness) && /MediaSession/i.test(modernReadiness), 'Google Maps media controls readiness is documented', 'docs/ANDROID_MODERN_PUBLISH_READINESS.md'),
    check(backendConnectivityTests, 'Backend connectivity contract tests are present', 'next-song, notifications, study, car bridge'),
    check(/buildAndroid16QprReadiness/.test(androidReadinessTest) && /buildAndroid17Readiness/.test(androidReadinessTest), 'Android beta readiness unit tests are present', '__tests__/androidReadiness.test.ts'),
    check(/Bluetooth/i.test(modernReadiness) && /Dolby/i.test(modernReadiness), 'Modern audio route practices are documented', 'docs/ANDROID_MODERN_PUBLISH_READINESS.md'),
    check(/Google Maps media controls/.test(releaseChecklist) && /Android 17 beta/.test(releaseChecklist), 'Release checklist covers preview media and large-screen validation', 'docs/RELEASE_CHECKLIST.md'),
  ];

  for (const result of checks) {
    console.log(`${result.status.toUpperCase()} | ${result.label} | ${result.details}`);
  }

  const failures = checks.filter((result) => result.status === 'fail');
  console.log(`SUMMARY ${checks.length - failures.length}/${checks.length} passed`);
  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

main();
