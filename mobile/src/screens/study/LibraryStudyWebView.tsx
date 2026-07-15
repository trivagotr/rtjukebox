import React, {useEffect, useMemo, useRef, useState} from 'react';
import {ActivityIndicator, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {useNavigation, useRoute} from '@react-navigation/native';
import {SafeAreaView} from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {WebView as NativeWebView} from 'react-native-webview';

import {useAuth} from '../../context/AuthContext';
import {BASE_API} from '../../services/config';
import {
  STUDY_PACKAGED_ROOT,
  buildStudyEntryUrl,
  createStudyPublicAccountBridge,
  createStudyWebViewBridge,
  isAllowedStudyNavigation,
  shouldUsePackagedStudyFallback,
} from '../../services/studyWebViewService';
import {COLORS, SPACING} from '../../theme/theme';

const WebView = NativeWebView as any;

const LibraryStudyWebView = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const webViewRef = useRef<any>(null);
  const {user} = useAuth();
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [credentialsReady, setCredentialsReady] = useState(false);
  const [usePackagedFallback, setUsePackagedFallback] = useState(false);
  const [hasLoadError, setHasLoadError] = useState(false);
  const roomId = route.params?.locationId === 'chim-alan' ? 'chim-alan' : 'library';
  const isLocked = !user || user.is_guest;

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem('access_token')
      .then(token => {
        if (active) {
          setAccessToken(token);
          setCredentialsReady(true);
        }
      })
      .catch(() => {
        if (active) {
          setAccessToken(null);
          setCredentialsReady(true);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  const account = useMemo(
    () =>
      user
        ? {
            id: user.id,
            displayName: user.display_name,
            authenticated: !user.is_guest,
          }
        : null,
    [user],
  );

  const bridgeScript = useMemo(() => {
    if (!account) {
      return 'true;';
    }
    const publicInput = {
      account,
      globalPoints: Number(user?.rank_score ?? 0),
    };
    if (usePackagedFallback || !accessToken) {
      return createStudyPublicAccountBridge(publicInput);
    }
    return createStudyWebViewBridge({
      ...publicInput,
      apiBase: BASE_API,
      accessToken,
    });
  }, [accessToken, account, usePackagedFallback, user?.rank_score]);

  const gameUrl = buildStudyEntryUrl(roomId, usePackagedFallback);
  const isPackagedGame = gameUrl.startsWith(STUDY_PACKAGED_ROOT);
  const handleStudyNavigationRequest = ({url}: {url: string}) => {
    const allowed = isAllowedStudyNavigation(url);
    if (shouldUsePackagedStudyFallback(url, isPackagedGame)) {
      setUsePackagedFallback(true);
    }
    return allowed;
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

  if (!credentialsReady) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loading}>
          <ActivityIndicator color={COLORS.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!accessToken) {
    return (
      <SafeAreaView style={styles.lockedContainer}>
        <Icon name="account-lock-outline" size={34} color={COLORS.primary} />
        <Text style={styles.lockedTitle}>Your session expired</Text>
        <TouchableOpacity style={styles.primaryButton} onPress={() => navigation.navigate('Auth', {screen: 'Login'})}>
          <Text style={styles.primaryButtonText}>Login again</Text>
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
              setUsePackagedFallback(false);
            }}>
            <Text style={styles.primaryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      <WebView
        key={isPackagedGame ? 'packaged-study' : 'remote-study'}
        ref={webViewRef}
        source={{uri: gameUrl}}
        style={styles.webView}
        originWhitelist={['https://radiotedu.com', 'file://*']}
        javaScriptEnabled
        domStorageEnabled={false}
        sharedCookiesEnabled={false}
        thirdPartyCookiesEnabled={false}
        mixedContentMode="never"
        setSupportMultipleWindows={false}
        allowFileAccess={isPackagedGame}
        allowFileAccessFromFileURLs={false}
        allowUniversalAccessFromFileURLs={false}
        injectedJavaScriptBeforeContentLoaded={bridgeScript}
        injectedJavaScript={bridgeScript}
        onLoadEnd={() => webViewRef.current?.injectJavaScript(bridgeScript)}
        onShouldStartLoadWithRequest={handleStudyNavigationRequest}
        onHttpError={({nativeEvent}: {nativeEvent: {statusCode: number}}) => {
          if (nativeEvent.statusCode < 400) {
            return;
          }
          if (!usePackagedFallback) {
            setUsePackagedFallback(true);
            return;
          }
          setHasLoadError(true);
        }}
        onError={() => {
          if (!usePackagedFallback) {
            setUsePackagedFallback(true);
            return;
          }
          setHasLoadError(true);
        }}
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
