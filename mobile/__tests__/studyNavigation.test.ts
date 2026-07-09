import {describe, expect, it, jest} from '@jest/globals';
import fs from 'fs';
import path from 'path';

jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: 'SafeAreaView',
}));
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({navigate: jest.fn()}),
}));

import {STUDY_LOCATION_CARDS} from '../src/screens/study/StudyHomeScreen';

describe('Study navigation', () => {
  it('defines Library and Çim alan as app Study menu locations', () => {
    expect(STUDY_LOCATION_CARDS).toEqual(
      expect.arrayContaining([
        expect.objectContaining({id: 'library', title: 'Library'}),
        expect.objectContaining({id: 'chim-alan', title: 'Çim alan'}),
      ]),
    );
  });

  it('registers Study inside the authenticated app navigator without adding a second login route', () => {
    const navigatorSource = fs.readFileSync(path.join(__dirname, '../src/navigation/RootNavigator.tsx'), 'utf8');

    expect(navigatorSource).toContain('StudyHomeScreen');
    expect(navigatorSource).toContain('LibraryStudyWebView');
    expect(navigatorSource).toContain('name="LibraryStudyWeb"');
    expect(navigatorSource).toContain('StudyRoomScreen');
    expect(navigatorSource).toContain('<Tab.Screen name="Study"');
    expect(navigatorSource).not.toContain('StudyLogin');
  });

  it('opens the preserved Library web room from the Study menu', () => {
    const homeSource = fs.readFileSync(path.join(__dirname, '../src/screens/study/StudyHomeScreen.tsx'), 'utf8');
    const webScreenSource = fs.readFileSync(path.join(__dirname, '../src/screens/study/LibraryStudyWebView.tsx'), 'utf8');

    expect(homeSource).toContain("location.id === 'library'");
    expect(homeSource).toContain("navigation.navigate('LibraryStudyWeb')");
    expect(webScreenSource).toContain('react-native-webview');
    expect(webScreenSource).toContain('RadioTEDUAppAuth');
    expect(webScreenSource).toContain('radiotedu_access_token');
  });

  it('mounts the native Çim alan amphitheatre map preview in the Study room', () => {
    const roomSource = fs.readFileSync(path.join(__dirname, '../src/screens/study/StudyRoomScreen.tsx'), 'utf8');

    expect(roomSource).toContain('CHIM_ALAN_STUDY_MAP');
    expect(roomSource).toContain('StudyMapPreview');
    expect(roomSource).toContain('Start session');
    expect(roomSource).toContain('Spark');
    expect(roomSource).toContain('Rock');
    expect(roomSource).toContain('SparkAiLogo');
    expect(roomSource).toContain('map.blockTiles');
    expect(roomSource).toContain('amphiBlock');
    expect(roomSource).toContain('stairBlock');
  });

  it('preserves the generated Habbo-style Library room artwork in the native Study room', () => {
    const roomSource = fs.readFileSync(path.join(__dirname, '../src/screens/study/StudyRoomScreen.tsx'), 'utf8');
    const libraryArtwork = path.join(__dirname, '../src/assets/study/library-habbo.png');

    expect(fs.existsSync(libraryArtwork)).toBe(true);
    expect(roomSource).toContain('ImageBackground');
    expect(roomSource).toContain('libraryHabboImage');
    expect(roomSource).toContain('library-habbo.png');
    expect(roomSource).toContain('libraryLocalMarker');
    expect(roomSource).toContain('localUserInitial');
    expect(roomSource).toContain('localUserLabel');
  });

  it('walks the Library marker across the preserved bitmap with A* instead of swapping seated sprites', () => {
    const roomSource = fs.readFileSync(path.join(__dirname, '../src/screens/study/StudyRoomScreen.tsx'), 'utf8');

    expect(roomSource).toContain('LIBRARY_STUDY_MAP');
    expect(roomSource).toContain('handleLibraryPress');
    expect(roomSource).toContain('libraryWalkingPath');
    expect(roomSource).toContain('findStudyPath(LIBRARY_STUDY_MAP');
    expect(roomSource).not.toContain('librarySeatedSprite');
  });

  it('makes the Çim alan map interactive with A* click-to-walk avatar state', () => {
    const roomSource = fs.readFileSync(path.join(__dirname, '../src/screens/study/StudyRoomScreen.tsx'), 'utf8');

    expect(roomSource).toContain('findStudyPath');
    expect(roomSource).toContain('walkingPath');
    expect(roomSource).toContain('handleMapPress');
    expect(roomSource).toContain('walkingAvatar');
    expect(roomSource).toContain('interaction: currentInteraction');
  });

  it('lets Çim alan seats resolve to seat slots and switch the avatar into a seated pose', () => {
    const roomSource = fs.readFileSync(path.join(__dirname, '../src/screens/study/StudyRoomScreen.tsx'), 'utf8');

    expect(roomSource).toContain('resolveStudySeatSlot');
    expect(roomSource).toContain('handleSeatPress');
    expect(roomSource).toContain('seatedAvatar');
    expect(roomSource).toContain('seatedAvatarLeft');
    expect(roomSource).toContain('seatedAvatarRight');
    expect(roomSource).toContain('front-edge');
    expect(roomSource).toContain("onInteractionChange('seated')");
  });

  it('wires Study room sessions to the backend nonce lifecycle', () => {
    const roomSource = fs.readFileSync(path.join(__dirname, '../src/screens/study/StudyRoomScreen.tsx'), 'utf8');

    expect(roomSource).toContain('startStudySession');
    expect(roomSource).toContain('finishStudySession');
    expect(roomSource).toContain('activeSession');
    expect(roomSource).toContain('sessionNonce');
    expect(roomSource).toContain('clientSessionId');
    expect(roomSource).toContain('Finish session');
  });

  it('lets users start Study or Pomodoro sessions with 25, 50, or custom minutes', () => {
    const roomSource = fs.readFileSync(path.join(__dirname, '../src/screens/study/StudyRoomScreen.tsx'), 'utf8');

    expect(roomSource).toContain('sessionMode');
    expect(roomSource).toContain('pomodoroTargetMinutes');
    expect(roomSource).toContain('customPomodoroMinutes');
    expect(roomSource).toContain("sessionType: 'pomodoro'");
    expect(roomSource).toContain('Pomodoro');
    expect(roomSource).toContain('25 min');
    expect(roomSource).toContain('50 min');
    expect(roomSource).toContain('Custom');
    expect(roomSource).toContain('TextInput');
  });

  it('lets unregistered users run Pomodoro locally without leaderboard credit', () => {
    const roomSource = fs.readFileSync(path.join(__dirname, '../src/screens/study/StudyRoomScreen.tsx'), 'utf8');

    expect(roomSource).toContain('useAuth');
    expect(roomSource).toContain('const isRegisteredUser = Boolean(user && !user.is_guest)');
    expect(roomSource).toContain('const isGuestPomodoroMode = sessionMode === \'pomodoro\' && !isRegisteredUser');
    expect(roomSource).toContain('local-pomodoro');
    expect(roomSource).toContain('isLocalPomodoroSession');
    expect(roomSource).toContain('setSessionNonce(null)');
    expect(roomSource).toContain('will not appear on the leaderboard');
  });

  it('sends Study heartbeats and stores the rotated server nonce', () => {
    const roomSource = fs.readFileSync(path.join(__dirname, '../src/screens/study/StudyRoomScreen.tsx'), 'utf8');

    expect(roomSource).toContain('sendStudyHeartbeat');
    expect(roomSource).toContain('heartbeatTimer');
    expect(roomSource).toContain('setSessionNonce(response.nonce');
    expect(roomSource).toContain('interaction: currentInteraction');
  });

  it('renders backend study-room participants as seat occupancy markers', () => {
    const roomSource = fs.readFileSync(path.join(__dirname, '../src/screens/study/StudyRoomScreen.tsx'), 'utf8');

    expect(roomSource).toContain('fetchStudyRoomState');
    expect(roomSource).toContain('roomParticipants');
    expect(roomSource).toContain('buildOccupiedStudySeatMarkers');
    expect(roomSource).toContain('occupiedSeatMarkers');
    expect(roomSource).toContain('occupiedSeatMarker');
  });

  it('publishes Çim alan room presence to the shared occupancy backend', () => {
    const roomSource = fs.readFileSync(path.join(__dirname, '../src/screens/study/StudyRoomScreen.tsx'), 'utf8');

    expect(roomSource).toContain('sendStudyRoomPresenceHeartbeat');
    expect(roomSource).toContain('publishStudyRoomPresence');
    expect(roomSource).toContain('studiedSecondsDelta: 0');
    expect(roomSource).toContain('seatId: currentSeatId');
  });

  it('clears local seat state when the backend rejects an occupied seat', () => {
    const roomSource = fs.readFileSync(path.join(__dirname, '../src/screens/study/StudyRoomScreen.tsx'), 'utf8');

    expect(roomSource).toContain('isStudyRoomSeatConflictError');
    expect(roomSource).toContain('seatConflictId');
    expect(roomSource).toContain('rejectedSeatId');
    expect(roomSource).toContain('Seat unavailable');
    expect(roomSource).toContain('setCurrentSeatId(null)');
  });
});
