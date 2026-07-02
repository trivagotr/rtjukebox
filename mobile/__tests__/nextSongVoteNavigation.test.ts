import {describe, expect, it} from '@jest/globals';
import fs from 'fs';
import path from 'path';

describe('next-song vote navigation', () => {
  it('keeps the bottom navigation focused on five primary mobile tabs', () => {
    const navigatorSource = fs.readFileSync(path.join(__dirname, '../src/navigation/RootNavigator.tsx'), 'utf8');
    const jukeboxSource = fs.readFileSync(path.join(__dirname, '../src/screens/jukebox/JukeboxScreen.tsx'), 'utf8');

    expect(navigatorSource).toContain('NextSongVoteScreen');
    expect(navigatorSource).not.toContain('<Tab.Screen name="NextSongVote"');
    expect(navigatorSource).not.toContain('<Tab.Screen name="Social"');
    expect(navigatorSource).not.toContain('<Tab.Screen name="Leaderboard"');
    expect(navigatorSource).toContain('<Stack.Screen name="NextSongVote"');
    expect(navigatorSource).toContain('<Stack.Screen name="Social"');
    expect(navigatorSource).toContain('<Stack.Screen name="Leaderboard"');
    expect(jukeboxSource).not.toContain('NextSongVotePanel');
  });

  it('surfaces secondary community destinations from Home instead of the tab bar', () => {
    const homeSource = fs.readFileSync(path.join(__dirname, '../src/screens/HomeScreen.tsx'), 'utf8');

    expect(homeSource).toContain("navigation.navigate('NextSongVote')");
    expect(homeSource).toContain("navigation.navigate('Social')");
    expect(homeSource).toContain("navigation.navigate('Leaderboard')");
  });

  it('blocks anonymous and guest users from next-song voting', () => {
    const screenSource = fs.readFileSync(path.join(__dirname, '../src/screens/next-song-vote/NextSongVoteScreen.tsx'), 'utf8');

    expect(screenSource).toContain('AuthGuard');
    expect(screenSource).toContain('const isRegisteredUser = Boolean(user && !user.is_guest)');
    expect(screenSource).toContain('if (!isRegisteredUser)');
    expect(screenSource).toContain('Now register');
    expect(screenSource).toContain('Next Song voting is only available for registered RadioTEDU accounts.');
  });
});
