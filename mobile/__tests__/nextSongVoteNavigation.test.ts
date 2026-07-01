import {describe, expect, it} from '@jest/globals';
import fs from 'fs';
import path from 'path';

describe('next-song vote navigation', () => {
  it('registers next-song voting as a separate mobile tab instead of embedding it in Jukebox', () => {
    const navigatorSource = fs.readFileSync(path.join(__dirname, '../src/navigation/RootNavigator.tsx'), 'utf8');
    const jukeboxSource = fs.readFileSync(path.join(__dirname, '../src/screens/jukebox/JukeboxScreen.tsx'), 'utf8');

    expect(navigatorSource).toContain('NextSongVoteScreen');
    expect(navigatorSource).toContain('<Tab.Screen name="NextSongVote"');
    expect(jukeboxSource).not.toContain('NextSongVotePanel');
  });
});
