import React, {useCallback, useMemo, useRef, useState} from 'react';
import {StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useNavigation} from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {WebView as NativeWebView, WebViewMessageEvent} from 'react-native-webview';

import {useAuth} from '../../context/AuthContext';
import {
  STUDY_LIBRARY_ENTRY_URL,
  buildStudyWebBootstrap,
  createStudyWebViewBridge,
  isAllowedStudyNavigation,
  parseStudyWebMessage,
} from '../../services/studyWebViewService';
import {COLORS, SPACING} from '../../theme/theme';

const WebView = NativeWebView as any;

const LibraryStudyWebView = () => {
  const navigation = useNavigation<any>();
  const webViewRef = useRef<any>(null);
  const {user} = useAuth();
  const [hasLoadError, setHasLoadError] = useState(false);

  const isLocked = !user || user.is_guest;
  const accountBootstrap = useMemo(
    () => (user ? buildStudyWebBootstrap(user) : null),
    [user],
  );
  const injectedAccountBridge = useMemo(
    () => (accountBootstrap ? createStudyWebViewBridge(accountBootstrap) : 'true;'),
    [accountBootstrap],
  );

  const injectAccount = useCallback(() => {
    webViewRef.current?.injectJavaScript(injectedAccountBridge);
  }, [injectedAccountBridge]);

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      const message = parseStudyWebMessage(event.nativeEvent.data);
      if (message?.type === 'radiotedu:library-ready' || message?.type === 'radiotedu:request-account') {
        injectAccount();
      }
    },
    [injectAccount],
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
      <View style={styles.webContainer}>
        {!hasLoadError ? (
          <WebView
            ref={webViewRef}
            source={{uri: STUDY_LIBRARY_ENTRY_URL}}
            style={styles.webView}
            originWhitelist={['file://*', 'about:blank']}
            javaScriptEnabled
            domStorageEnabled
            allowFileAccess
            allowFileAccessFromFileURLs
            allowUniversalAccessFromFileURLs={false}
            mixedContentMode="never"
            sharedCookiesEnabled={false}
            thirdPartyCookiesEnabled={false}
            setSupportMultipleWindows={false}
            injectedJavaScriptBeforeContentLoaded={injectedAccountBridge}
            injectedJavaScript={injectedAccountBridge}
            onLoadEnd={injectAccount}
            onMessage={handleMessage}
            onShouldStartLoadWithRequest={(request: {url: string}) =>
              isAllowedStudyNavigation(request.url)
            }
            onError={() => setHasLoadError(true)}
          />
        ) : null}

        {hasLoadError ? (
          <View style={styles.errorPanel}>
            <Icon name="wifi-alert" size={30} color={COLORS.primary} />
            <Text style={styles.errorTitle}>Library could not load</Text>
            <Text style={styles.errorText}>The packaged Library could not be opened.</Text>
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => {
                setHasLoadError(false);
                webViewRef.current?.reload();
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
