import {describe, expect, it, jest} from '@jest/globals';
import fs from 'fs';
import path from 'path';

jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-safe-area-context', () => ({SafeAreaView: 'SafeAreaView'}));
jest.mock('@react-navigation/native', () => ({useNavigation: () => ({navigate: jest.fn()})}));

import {STUDY_LOCATION_CARDS} from '../src/screens/study/StudyHomeScreen';

const read = (relative: string) => fs.readFileSync(path.join(__dirname, '..', relative), 'utf8');

describe('Study navigation', () => {
  it('defines Library and Chim Alan as the only app Study room entries', () => {
    expect(STUDY_LOCATION_CARDS.map(card => card.id)).toEqual(['library', 'chim-alan']);
  });

  it('routes both room entries to the same packaged game client', () => {
    const navigatorSource = read('src/navigation/RootNavigator.tsx');
    const homeSource = read('src/screens/study/StudyHomeScreen.tsx');
    expect(navigatorSource).toContain('component={LibraryStudyWebView}');
    expect(navigatorSource).not.toContain('StudyRoomScreen');
    expect(homeSource).toContain("navigation.navigate('StudyRoom', {locationId: location.id})");
    expect(homeSource).not.toContain("location.id === 'library'");
  });

  it('loads the separate app-only Study website with a packaged fallback', () => {
    const source = read('src/screens/study/LibraryStudyWebView.tsx');
    expect(source).toContain('buildStudyEntryUrl');
    expect(source).toContain('STUDY_PACKAGED_ROOT');
    expect(source).toContain("originWhitelist={['https://radiotedu.com', 'file://*']}");
    expect(source).toContain('isAllowedStudyNavigation');
    expect(source).toContain('allowFileAccessFromFileURLs={false}');
    expect(source).toContain('allowUniversalAccessFromFileURLs={false}');
    expect(source).toContain('mixedContentMode="never"');
    expect(source).toContain('thirdPartyCookiesEnabled={false}');
    expect(source).toContain("AsyncStorage.getItem('access_token')");
    expect(source).not.toContain('refresh_token');
    expect(source).not.toContain('FOCUS_WEB_URL');
  });

  it('injects the approved authenticated bridge and preserves the guest lock', () => {
    const source = read('src/screens/study/LibraryStudyWebView.tsx');
    expect(source).toContain('createStudyWebViewBridge');
    expect(source).toContain('apiBase: BASE_API');
    expect(source).toContain('accessToken');
    expect(source).toContain('const isLocked = !user || user.is_guest');
    expect(source).toContain("navigation.navigate('Auth', {screen: 'Login'})");
  });

  it('packages the complete website and removes the rejected native room implementation', () => {
    const packageJson = JSON.parse(read('package.json')) as {scripts: Record<string, string>};
    const packageScript = read('scripts/package-study-game.mjs');
    const packagedRoot = path.join(__dirname, '../android/app/src/main/assets/study-game');
    expect(packageJson.scripts['package:study']).toContain('package-study-game.mjs');
    expect(packageScript).toContain("path.join(repositoryRoot, 'study-game', 'dist')");
    expect(fs.existsSync(path.join(packagedRoot, 'index.html'))).toBe(true);
    expect(fs.existsSync(path.join(packagedRoot, 'assets/rooms/library.png'))).toBe(true);
    expect(fs.existsSync(path.join(packagedRoot, 'assets/rooms/chim-alan.png'))).toBe(true);
    expect(fs.existsSync(path.join(__dirname, '../src/screens/study/StudyRoomScreen.tsx'))).toBe(false);
    expect(fs.existsSync(path.join(__dirname, '../src/screens/study/studyMap.ts'))).toBe(false);
    expect(fs.existsSync(path.join(__dirname, '../src/assets/study/library-habbo.png'))).toBe(false);
  });
});
