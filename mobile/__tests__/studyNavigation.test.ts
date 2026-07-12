import {describe, expect, it} from '@jest/globals';
import fs from 'fs';
import path from 'path';

const readMobileFile = (relativePath: string) =>
  fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');

const readStudyGameFile = (relativePath: string) =>
  fs.readFileSync(path.join(__dirname, '../../study-game', relativePath), 'utf8');

describe('Study navigation', () => {
  it('opens the packaged Study website directly from the authenticated Study tab', () => {
    const navigatorSource = readMobileFile('src/navigation/RootNavigator.tsx');

    expect(navigatorSource).toContain('import LibraryStudyWebView');
    expect(navigatorSource).toContain('<Tab.Screen name="Study" component={LibraryStudyWebView}');
    expect(navigatorSource).not.toContain('import StudyHomeScreen');
    expect(navigatorSource).not.toContain('import StudyRoomScreen');
    expect(navigatorSource).not.toContain('name="LibraryStudyWeb"');
    expect(navigatorSource).not.toContain('name="StudyRoom"');
    expect(navigatorSource).not.toContain('StudyLogin');
  });

  it('loads only the packaged website and never injects app credentials into JavaScript', () => {
    const webScreenSource = readMobileFile('src/screens/study/LibraryStudyWebView.tsx');

    expect(webScreenSource).toContain('react-native-webview');
    expect(webScreenSource).toContain('STUDY_LIBRARY_ENTRY_URL');
    expect(webScreenSource).toContain('isAllowedStudyNavigation');
    expect(webScreenSource).toContain('allowFileAccess');
    expect(webScreenSource).not.toContain('<View style={styles.header}>');
    expect(webScreenSource).not.toContain('<Text style={styles.title}>Library</Text>');
    expect(webScreenSource).not.toContain('AsyncStorage');
    expect(webScreenSource).not.toContain('accessToken');
    expect(webScreenSource).not.toContain('refreshToken');
  });

  it('builds and packages both Phaser rooms inside the Android app', () => {
    const androidBuildSource = readMobileFile('android/app/build.gradle');

    expect(androidBuildSource).toContain('prepareStudyGameAssets');
    expect(androidBuildSource).toContain('package-study-game.mjs');
    expect(androidBuildSource).toContain('study-game');
    expect(fs.existsSync(path.join(__dirname, '../../study-game/package.json'))).toBe(true);
    expect(fs.existsSync(path.join(__dirname, '../../mobile/scripts/package-study-game.mjs'))).toBe(true);
  });

  it('links Study to the interactive Library and Cim Alan Phaser rooms', () => {
    const mainSource = readStudyGameFile('src/main.ts');
    const navigationSource = readStudyGameFile('src/pathfinding/NavigationGraph.ts');
    const chimRoomSource = readStudyGameFile('src/rooms/chim.room.ts');

    expect(mainSource).toContain('RadioTEDUStudyAccount');
    expect(chimRoomSource).toContain('rtAI - AI Host');
    expect(chimRoomSource).toContain("id: 'spark'");
    expect(chimRoomSource).toContain("id: 'rock'");
    expect(mainSource).toContain("'chim-alan'");
    expect(navigationSource).toContain('findPath');
    expect(chimRoomSource).toContain('elevationLevels: [0, 1, 2, 3]');
  });
});
