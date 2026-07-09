import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useNavigation} from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {WebView as NativeWebView, WebViewMessageEvent} from 'react-native-webview';

import {useAuth} from '../../context/AuthContext';
import {BASE_API, FOCUS_WEB_URL} from '../../services/config';
import {COLORS, SPACING} from '../../theme/theme';

const WebView = NativeWebView as any;

function appendQueryParam(url: string, key: string, value: string) {
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
}

function asInjectedJson(value: unknown) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

const LibraryStudyWebView = () => {
  const navigation = useNavigation<any>();
  const webViewRef = useRef<any>(null);
  const {user, logout} = useAuth();
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isTokenLoading, setIsTokenLoading] = useState(true);
  const [hasLoadError, setHasLoadError] = useState(false);

  const webUrl = useMemo(() => appendQueryParam(FOCUS_WEB_URL, 'embedded', 'mobile'), []);
  const isLocked = !user || user.is_guest;

  useEffect(() => {
    let isMounted = true;

    async function loadToken() {
      try {
        const token = await AsyncStorage.getItem('access_token');
        if (isMounted) {
          setAccessToken(token);
        }
      } finally {
        if (isMounted) {
          setIsTokenLoading(false);
        }
      }
    }

    void loadToken();

    return () => {
      isMounted = false;
    };
  }, []);

  const injectedAuthBridge = useMemo(() => {
    const payload = {
      type: 'radiotedu-auth',
      source: 'radiotedu-mobile',
      embedded: true,
      apiBase: BASE_API,
      accessToken,
      user,
    };

    return `
      (function () {
        var payload = ${asInjectedJson(payload)};
        window.RadioTEDUAppAuth = payload;
        try {
          if (payload.accessToken) {
            window.localStorage.setItem('radiotedu_access_token', payload.accessToken);
            window.localStorage.setItem('access_token', payload.accessToken);
          }
          window.localStorage.setItem('radiotedu_api_base', payload.apiBase || '');
          window.localStorage.setItem('radiotedu_embedded_user', JSON.stringify(payload.user || null));
        } catch (error) {}
        try {
          window.dispatchEvent(new CustomEvent('radiotedu:auth', { detail: payload }));
          document.dispatchEvent(new CustomEvent('radiotedu:auth', { detail: payload }));
        } catch (error) {}
        true;
      })();
    `;
  }, [accessToken, user]);

  const injectAuth = useCallback(() => {
    webViewRef.current?.injectJavaScript(injectedAuthBridge);
  }, [injectedAuthBridge]);

  const handleMessage = useCallback(
    async (event: WebViewMessageEvent) => {
      let payload: Record<string, unknown> | null = null;
      try {
        payload = JSON.parse(event.nativeEvent.data);
      } catch {
        return;
      }

      if (payload?.type === 'auth-expired' || payload?.type === 'open-auth') {
        await logout();
        Alert.alert('Login required', 'Please log in again to continue Study.', [
          {text: 'OK', onPress: () => navigation.navigate('Auth', {screen: 'Login'})},
        ]);
      }
    },
    [logout, navigation],
  );

  if (isLocked) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.lockedPanel}>
          <Icon name="lock-outline" size={34} color={COLORS.primary} />
          <Text style={styles.lockedTitle}>Login required</Text>
          <Text style={styles.lockedText}>Library Study uses your RadioTEDU account.</Text>
          <TouchableOpacity style={styles.primaryButton} onPress={() => navigation.navigate('Auth', {screen: 'Login'})}>
            <Text style={styles.primaryButtonText}>Login</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconButton} onPress={() => navigation.goBack()} accessibilityLabel="Back">
          <Icon name="chevron-left" size={28} color={COLORS.text} />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={styles.kicker}>Study</Text>
          <Text style={styles.title}>Library</Text>
        </View>
        <TouchableOpacity style={styles.iconButton} onPress={injectAuth} accessibilityLabel="Refresh session">
          <Icon name="refresh" size={22} color={COLORS.text} />
        </TouchableOpacity>
      </View>

      <View style={styles.webContainer}>
        {!isTokenLoading && !hasLoadError ? (
          <WebView
            ref={webViewRef}
            source={{uri: webUrl}}
            style={styles.webView}
            originWhitelist={['http://*', 'https://*']}
            javaScriptEnabled
            domStorageEnabled
            sharedCookiesEnabled={false}
            thirdPartyCookiesEnabled={false}
            injectedJavaScriptBeforeContentLoaded={injectedAuthBridge}
            injectedJavaScript={injectedAuthBridge}
            onLoadEnd={injectAuth}
            onMessage={handleMessage}
            onError={() => setHasLoadError(true)}
            onHttpError={(event: {nativeEvent: {statusCode: number}}) => {
              if (event.nativeEvent.statusCode >= 400) {
                setHasLoadError(true);
              }
            }}
          />
        ) : null}

        {isTokenLoading ? (
          <View style={styles.overlay}>
            <ActivityIndicator size="large" color={COLORS.primary} />
          </View>
        ) : null}

        {hasLoadError ? (
          <View style={styles.errorPanel}>
            <Icon name="wifi-alert" size={30} color={COLORS.primary} />
            <Text style={styles.errorTitle}>Library could not load</Text>
            <Text style={styles.errorText}>Check the Focus web server and try again.</Text>
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => {
                setHasLoadError(false);
                injectAuth();
              }}>
              <Text style={styles.primaryButtonText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: COLORS.background},
  header: {
    minHeight: 62,
    paddingHorizontal: SPACING.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.background,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  headerText: {flex: 1},
  kicker: {color: COLORS.primary, fontSize: 11, fontWeight: '900', textTransform: 'uppercase'},
  title: {color: COLORS.text, fontSize: 18, fontWeight: '900'},
  webContainer: {flex: 1, backgroundColor: '#000'},
  webView: {flex: 1, backgroundColor: '#000'},
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.background,
  },
  lockedPanel: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.xl,
    gap: SPACING.md,
  },
  lockedTitle: {color: COLORS.text, fontSize: 22, fontWeight: '900'},
  lockedText: {color: COLORS.textMuted, fontSize: 14, textAlign: 'center'},
  errorPanel: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.xl,
    gap: SPACING.md,
    backgroundColor: COLORS.background,
  },
  errorTitle: {color: COLORS.text, fontSize: 20, fontWeight: '900'},
  errorText: {color: COLORS.textMuted, fontSize: 13, textAlign: 'center'},
  primaryButton: {
    minWidth: 110,
    minHeight: 42,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
  },
  primaryButtonText: {color: '#fff', fontSize: 14, fontWeight: '900'},
});

export default LibraryStudyWebView;
