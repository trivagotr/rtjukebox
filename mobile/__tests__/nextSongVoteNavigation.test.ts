import {describe, expect, it} from '@jest/globals';
import fs from 'fs';
import path from 'path';

describe('next-song vote navigation', () => {
  it('keeps next-song voting separate from Jukebox queue screens and routes', () => {
    const navigatorSource = fs.readFileSync(
      path.join(__dirname, '../src/navigation/RootNavigator.tsx'),
      'utf8',
    );
    const jukeboxSource = fs.readFileSync(
      path.join(__dirname, '../src/screens/jukebox/JukeboxScreen.tsx'),
      'utf8',
    );
    const nextSongVoteSource = fs.readFileSync(
      path.join(
        __dirname,
        '../src/screens/next-song-vote/NextSongVoteScreen.tsx',
      ),
      'utf8',
    );

    expect(navigatorSource).toContain('NextSongVoteScreen');
    expect(navigatorSource).toContain('<Tab.Screen');
    expect(navigatorSource).toContain('name="NextSongVote"');
    expect(jukeboxSource).not.toContain('NextSongVote');
    expect(jukeboxSource).toContain('/jukebox/');
    expect(nextSongVoteSource).toContain('formatNextSongVoteRemainingTime');
    expect(nextSongVoteSource).toContain('stationName');
    expect(nextSongVoteSource).toContain('remainingTime');
  });
});
