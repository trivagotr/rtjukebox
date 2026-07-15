import {describe, expect, it} from '@jest/globals';
import fs from 'fs';
import path from 'path';

function readScreen(name: string) {
  return fs.readFileSync(path.join(__dirname, '..', 'src', 'screens', name), 'utf8');
}

describe('mobile Account and Gold product contract', () => {
  const profileSource = readScreen('ProfileScreen.tsx');
  const homeSource = readScreen('HomeScreen.tsx');
  const marketSource = readScreen('MarketScreen.tsx');
  const eventsSource = readScreen('EventsScreen.tsx');
  const gamesSource = readScreen('GamesScreen.tsx');
  const leaderboardSource = readScreen('LeaderboardScreen.tsx');

  it('labels spendable and earned currency as Gold without renaming API fields', () => {
    expect(marketSource).toContain('Gold balance');
    expect(marketSource).toContain('{item.cost_points} Gold');
    expect(marketSource).not.toContain('Harcanabilir XP');
    expect(eventsSource).toContain('Gold earned');
    expect(gamesSource).toContain('Gold');
    expect(homeSource).toContain('Gold balance');
    expect(leaderboardSource).toContain('Lifetime Gold');
    expect(marketSource).toContain('spendable_points');
    expect(homeSource).toContain('lifetime_points');
  });

  it('provides a separate destructive server-backed account deletion flow', () => {
    expect(profileSource).toContain('deleteAccount');
    expect(profileSource).toContain("confirmation: 'DELETE'");
    expect(profileSource).toContain('secureTextEntry');
    expect(profileSource).toContain("style: 'destructive'");
    expect(profileSource).toContain('Account-owned Gold');
    expect(profileSource).toContain('Study inventory');

    const deletionHandler = profileSource.match(
      /const handleDeleteAccount[\s\S]*?(?=\n\s*const handle|\n\s*return \()/,
    )?.[0] ?? '';
    expect(deletionHandler).toContain('deleteAccount(');
    expect(deletionHandler).not.toContain('logout(');
  });
});
