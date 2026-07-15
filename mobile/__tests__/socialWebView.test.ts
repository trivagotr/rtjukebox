import {describe, expect, it} from '@jest/globals';
import fs from 'fs';
import path from 'path';

describe('Social WebView surface', () => {
  it('registers Social as an in-app stack screen and Home quick action without touching Focus routing', () => {
    const navigatorSource = fs.readFileSync(path.join(__dirname, '../src/navigation/RootNavigator.tsx'), 'utf8');
    const homeSource = fs.readFileSync(path.join(__dirname, '../src/screens/HomeScreen.tsx'), 'utf8');
    const configSource = fs.readFileSync(path.join(__dirname, '../src/services/config.ts'), 'utf8');

    expect(navigatorSource).toContain('SocialWebViewScreen');
    expect(navigatorSource).toContain('<Stack.Screen name="Social"');
    expect(homeSource).toContain("navigation.navigate('Social')");
    expect(configSource).toContain("SOCIAL_WEB_URL = `https://${SERVER_DOMAIN}/social/`");
    expect(configSource).toContain("PROD_FOCUS_WEB_URL = `https://${SERVER_DOMAIN}/focus/`");
  });

  it('injects only a public account bootstrap and keeps credentials native', () => {
    const screenSource = fs.readFileSync(path.join(__dirname, '../src/screens/social/SocialWebViewScreen.tsx'), 'utf8');

    expect(screenSource).toContain('injectedJavaScriptBeforeContentLoaded');
    expect(screenSource).toContain('RadioTEDUAccount');
    expect(screenSource).toContain('buildSocialBootstrap');
    expect(screenSource).toContain('refreshSession');
    expect(screenSource).toContain('onShouldStartLoadWithRequest');
    expect(screenSource).toContain('isAllowedSocialNavigation');
    expect(screenSource).toContain('parseSocialMessage');
    expect(screenSource).not.toContain('AsyncStorage');
    expect(screenSource).not.toContain('accessToken');
    expect(screenSource).not.toContain('refresh_token');
    expect(screenSource).not.toContain('localStorage.setItem');
    expect(screenSource).not.toContain('accessToken=');
    expect(screenSource).not.toContain('online at radiotedu.com/social');
    expect(screenSource).not.toContain('console.log');
  });

  it('blocks anonymous and guest users from opening Social', () => {
    const screenSource = fs.readFileSync(path.join(__dirname, '../src/screens/social/SocialWebViewScreen.tsx'), 'utf8');

    expect(screenSource).toContain('AuthGuard');
    expect(screenSource).toContain('const isRegisteredUser = Boolean(user && !user.is_guest)');
    expect(screenSource).toContain('if (!isRegisteredUser)');
    expect(screenSource).toContain('Now register');
    expect(screenSource).toContain('Social is only available for registered RadioTEDU accounts.');
  });

  it('refreshes the shared account after profile avatar changes', () => {
    const authSource = fs.readFileSync(path.join(__dirname, '../src/context/AuthContext.tsx'), 'utf8');
    const profileSource = fs.readFileSync(path.join(__dirname, '../src/screens/ProfileScreen.tsx'), 'utf8');

    expect(authSource).toContain('refreshSession: () => Promise<User | null>');
    expect(authSource).toContain('const clearSessionState = useCallback');
    expect(authSource).toContain("await AsyncStorage.multiRemove(['access_token', 'refresh_token']);");
    expect(authSource).toContain('value={{ user, isLoading, login, register, guestLogin, logout, deleteAccount, refreshSession }}');
    expect(profileSource).toContain('const { user, logout, deleteAccount, refreshSession } = useAuth();');
    expect(profileSource).toContain('await refreshSession();');
  });
});
