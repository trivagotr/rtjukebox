import {describe, expect, it, jest} from '@jest/globals';
import fs from 'fs';
import path from 'path';

jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: 'SafeAreaView',
}));
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({goBack: jest.fn()}),
}));

import {AVATAR_CLOSET_SLOTS} from '../src/screens/study/AvatarClosetScreen';

describe('Avatar closet Study menu', () => {
  it('defines the server-owned clothing slots expected by the Study backend contract', () => {
    expect(AVATAR_CLOSET_SLOTS.map(slot => slot.id)).toEqual(['hair', 'top', 'bottom', 'shoes', 'accessory']);
  });

  it('registers the closet as an app-only Study route instead of a standalone login flow', () => {
    const navigatorSource = fs.readFileSync(path.join(__dirname, '../src/navigation/RootNavigator.tsx'), 'utf8');

    expect(navigatorSource).toContain('AvatarClosetScreen');
    expect(navigatorSource).toContain('<Stack.Screen name="AvatarCloset"');
    expect(navigatorSource).not.toContain('AvatarClosetLogin');
  });

  it('shows global point balance and refreshes it after buying clothes', () => {
    const closetSource = fs.readFileSync(path.join(__dirname, '../src/screens/study/AvatarClosetScreen.tsx'), 'utf8');

    expect(closetSource).toContain('walletPoints');
    expect(closetSource).toContain('spendable_points');
    expect(closetSource).toContain('Global points');
    expect(closetSource).toContain('setWalletPoints(purchase.points');
  });
});
