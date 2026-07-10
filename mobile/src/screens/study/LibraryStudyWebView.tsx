import React, {useMemo, useRef, useState} from 'react';
import {ActivityIndicator, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {useNavigation, useRoute} from '@react-navigation/native';
import {SafeAreaView} from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {WebView as NativeWebView} from 'react-native-webview';

import {useAuth} from '../../context/AuthContext';
import {COLORS, SPACING} from '../../theme/theme';

const WebView = NativeWebView as any;
const STUDY_ROOT = 'file:///android_asset/study-game/';

function asInjectedJson(value: unknown) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

const LibraryStudyWebView = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const webViewRef = useRef<any>(null);
  const {user} = useAuth();
  const [hasLoadError, setHasLoadError] = useState(false);
  const roomId = route.params?.locationId === 'chim-alan' ? 'chim-alan' : 'library';
  const gameUrl = `${STUDY_ROOT}index.html?embedded=mobile&room=${roomId}`;
  const isLocked = !user || user.is_guest;

  const publicAccountBridge = useMemo(() => {
    const account = user
      ? {
          id: user.id,
          displayName: user.display_name,
          globalPoints: Number(user.rank_score ?? 0),
          authenticated: !user.is_guest,
        }
      : null;
    return `
      (function () {
        window.RadioTEDUStudyAccount = ${asInjectedJson(account)};
        window.dispatchEvent(new CustomEvent('radiotedu:study-account', {detail: window.RadioTEDUStudyAccount}));
        true;
      })();
    `;
  }, [user]);

  const allowPackagedStudyNavigation = (request: {url?: string}) => {
    const url = request.url ?? '';
    return url === 'about:blank' || url.startsWith(STUDY_ROOT);
  };

  if (isLocked) {
    return (
      <SafeAreaView style={styles.lockedContainer}>
        <Icon name="lock-outline" size={34} color={COLORS.primary} />
        <Text style={styles.lockedTitle}>Login required</Text>
        <TouchableOpacity style={styles.primaryButton} onPress={() => navigation.navigate('Auth', {screen: 'Login'})}>
          <Text style={styles.primaryButtonText}>Login</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      {hasLoadError ? (
        <View style={styles.errorPanel}>
          <Icon name="alert-circle-outline" size={32} color={COLORS.primary} />
          <Text style={styles.errorTitle}>Study could not open</Text>
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
      <WebView
        ref={webViewRef}
        source={{uri: gameUrl}}
        style={styles.webView}
        originWhitelist={['file://*']}
        javaScriptEnabled
        domStorageEnabled
        sharedCookiesEnabled={false}
        thirdPartyCookiesEnabled={false}
        mixedContentMode="never"
        setSupportMultipleWindows={false}
        allowFileAccess
        allowFileAccessFromFileURLs={false}
        allowUniversalAccessFromFileURLs={false}
        injectedJavaScriptBeforeContentLoaded={publicAccountBridge}
        onShouldStartLoadWithRequest={allowPackagedStudyNavigation}
        onError={() => setHasLoadError(true)}
        renderLoading={() => (
          <View style={styles.loading}>
            <ActivityIndicator color={COLORS.primary} />
          </View>
        )}
        startInLoadingState
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#0b1013'},
  webView: {flex: 1, backgroundColor: '#0b1013'},
  loading: {...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0b1013'},
  lockedContainer: {flex: 1, alignItems: 'center', justifyContent: 'center', gap: SPACING.md, backgroundColor: COLORS.background},
  lockedTitle: {color: COLORS.text, fontSize: 18, fontWeight: '700'},
  errorPanel: {...StyleSheet.absoluteFillObject, zIndex: 2, alignItems: 'center', justifyContent: 'center', gap: SPACING.md, backgroundColor: '#0b1013'},
  errorTitle: {color: COLORS.text, fontSize: 18, fontWeight: '700'},
  primaryButton: {minWidth: 120, alignItems: 'center', paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm, borderRadius: 6, backgroundColor: COLORS.primary},
  primaryButtonText: {color: '#07100d', fontWeight: '700'},
});

export default LibraryStudyWebView;
