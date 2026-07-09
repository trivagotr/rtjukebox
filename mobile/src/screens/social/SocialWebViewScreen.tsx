import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {ActivityIndicator, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {WebView as NativeWebView, WebViewMessageEvent} from 'react-native-webview';

import AuthGuard from '../../components/AuthGuard';
import {useAuth} from '../../context/AuthContext';
import {RESOLVED_SOCIAL_WEB_URL} from '../../services/config';
import {
  buildSocialBootstrap,
  isAllowedSocialNavigation,
  parseSocialMessage,
} from '../../services/socialSessionService';
import {COLORS, SPACING} from '../../theme/theme';

const WebView = NativeWebView as any;

function asInjectedJson(value: unknown) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

const SocialWebViewScreen = () => {
  const webViewRef = useRef<any>(null);
  const {user, refreshSession} = useAuth();
  const isRegisteredUser = Boolean(user && !user.is_guest);
  const [isPreparingSession, setIsPreparingSession] = useState(true);
  const [webViewNonce, setWebViewNonce] = useState(0);
  const [hasLoadError, setHasLoadError] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function prepareSession() {
      try {
        await refreshSession();
      } catch {
        // AuthGuard handles a session that becomes invalid after refresh.
      } finally {
        if (isMounted) {
          setIsPreparingSession(false);
          setWebViewNonce((value) => value + 1);
        }
      }
    }

    void prepareSession();

    return () => {
      isMounted = false;
    };
  }, [refreshSession, user?.id]);

  const accountBootstrap = useMemo(
    () => (isRegisteredUser && user ? buildSocialBootstrap(user) : null),
    [isRegisteredUser, user],
  );

  const injectedAccountBridge = useMemo(() => {
    return `
      (function () {
        window.RadioTEDUAccount = ${asInjectedJson(accountBootstrap)};
        try {
          window.dispatchEvent(new CustomEvent('radiotedu:account', { detail: window.RadioTEDUAccount }));
          document.dispatchEvent(new CustomEvent('radiotedu:account', { detail: window.RadioTEDUAccount }));
        } catch (error) {}
        true;
      })();
    `;
  }, [accountBootstrap]);

  const injectAccount = useCallback(() => {
    webViewRef.current?.injectJavaScript(injectedAccountBridge);
  }, [injectedAccountBridge]);

  const handleSocialMessage = useCallback(
    (event: WebViewMessageEvent) => {
      const message = parseSocialMessage(event.nativeEvent.data);
      if (message) {
        injectAccount();
      }
    },
    [injectAccount],
  );

  const allowSocialNavigation = useCallback(
    (request: {url: string}) =>
      isAllowedSocialNavigation(request.url, [RESOLVED_SOCIAL_WEB_URL]),
    [],
  );

  if (!isRegisteredUser) {
    return (
      <AuthGuard
        title="Now register!"
        message="Social is only available for registered RadioTEDU accounts."
        icon="account-group-outline"
      />
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerIcon}>
          <Icon name="account-group" size={22} color={COLORS.primary} />
        </View>
        <View style={styles.headerCopy}>
          <Text style={styles.kicker}>RadioTEDU</Text>
          <Text style={styles.title}>Social</Text>
        </View>
        <TouchableOpacity
          style={styles.refreshButton}
          onPress={() => {
            setHasLoadError(false);
            setWebViewNonce((value) => value + 1);
          }}
          accessibilityLabel="Reload Social">
          <Icon name="refresh" size={20} color={COLORS.text} />
        </TouchableOpacity>
      </View>

      <View style={styles.webContainer}>
        {!isPreparingSession && !hasLoadError ? (
          <WebView
            key={`${user?.id || 'anonymous'}-account-${webViewNonce}`}
            ref={webViewRef}
            source={{uri: RESOLVED_SOCIAL_WEB_URL}}
            style={styles.webView}
            originWhitelist={['https://radiotedu.com/*', 'http://127.0.0.1:*']}
            javaScriptEnabled
            domStorageEnabled
            sharedCookiesEnabled={false}
            thirdPartyCookiesEnabled={false}
            injectedJavaScriptBeforeContentLoaded={injectedAccountBridge}
            injectedJavaScript={injectedAccountBridge}
            onLoadEnd={injectAccount}
            onMessage={handleSocialMessage}
            onShouldStartLoadWithRequest={allowSocialNavigation}
            onError={() => setHasLoadError(true)}
            onHttpError={(event: {nativeEvent: {statusCode: number}}) => {
              if (event.nativeEvent.statusCode >= 400) {
                setHasLoadError(true);
              }
            }}
          />
        ) : null}

        {isPreparingSession ? (
          <View style={styles.overlay}>
            <ActivityIndicator size="large" color={COLORS.primary} />
          </View>
        ) : null}

        {hasLoadError ? (
          <View style={styles.errorPanel}>
            <Icon name="wifi-alert" size={30} color={COLORS.primary} />
            <Text style={styles.errorTitle}>Social could not load</Text>
            <Text style={styles.errorText}>The Social connection is not available yet. Your app account remains signed in.</Text>
            <TouchableOpacity
              style={styles.retryButton}
              onPress={() => {
                setHasLoadError(false);
                setWebViewNonce((value) => value + 1);
              }}>
              <Text style={styles.retryButtonText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: COLORS.background},
  header: {
    minHeight: 58,
    paddingHorizontal: SPACING.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.background,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerIcon: {
    width: 38,
    height: 38,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(227,30,36,0.12)',
  },
  headerCopy: {flex: 1},
  kicker: {color: COLORS.primary, fontSize: 10, fontWeight: '900', textTransform: 'uppercase'},
  title: {color: COLORS.text, fontSize: 17, fontWeight: '900'},
  refreshButton: {
    width: 38,
    height: 38,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  webContainer: {flex: 1, backgroundColor: '#000'},
  webView: {flex: 1, backgroundColor: '#000'},
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.background,
  },
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
  retryButton: {
    minWidth: 110,
    minHeight: 42,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
  },
  retryButtonText: {color: '#fff', fontSize: 14, fontWeight: '900'},
});

export default SocialWebViewScreen;
