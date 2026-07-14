import React, {useMemo, useState} from 'react';
import {ActivityIndicator, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {useRoute} from '@react-navigation/native';
import {SafeAreaView} from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {WebView as NativeWebView} from 'react-native-webview';

import {
  buildJukeLocalControllerUrl,
  isAllowedJukeLocalNavigation,
} from '../../services/jukeLocalWebViewService';
import {COLORS, SPACING} from '../../theme/theme';

const WebView = NativeWebView as any;

const JukeLocalWebViewScreen = () => {
  const route = useRoute<any>();
  const [hasLoadError, setHasLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const controllerUrl = useMemo(
    () =>
      buildJukeLocalControllerUrl(
        route.params?.deviceCode ?? route.params?.code,
      ),
    [route.params?.code, route.params?.deviceCode],
  );

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      {!hasLoadError ? (
        <WebView
          key={`${controllerUrl}:${reloadKey}`}
          source={{uri: controllerUrl}}
          style={styles.webView}
          originWhitelist={['https://radiotedu.com']}
          javaScriptEnabled
          domStorageEnabled
          sharedCookiesEnabled={false}
          thirdPartyCookiesEnabled={false}
          mixedContentMode="never"
          setSupportMultipleWindows={false}
          startInLoadingState
          renderLoading={() => (
            <View style={styles.loadingPanel}>
              <ActivityIndicator color={COLORS.primary} size="large" />
              <Text style={styles.loadingText}>Jukebox is loading…</Text>
            </View>
          )}
          onShouldStartLoadWithRequest={(request: {url: string}) =>
            isAllowedJukeLocalNavigation(request.url)
          }
          onError={() => setHasLoadError(true)}
          onHttpError={(event: {nativeEvent: {statusCode?: number}}) => {
            if ((event.nativeEvent.statusCode ?? 0) >= 500) {
              setHasLoadError(true);
            }
          }}
        />
      ) : (
        <View style={styles.errorPanel}>
          <Icon name="server-network-off" size={36} color={COLORS.primary} />
          <Text style={styles.errorTitle}>Jukebox could not load</Text>
          <Text style={styles.errorText}>
            The juke-local controller is currently unavailable.
          </Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => {
              setHasLoadError(false);
              setReloadKey(value => value + 1);
            }}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#07080B'},
  webView: {flex: 1, backgroundColor: '#07080B'},
  loadingPanel: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.md,
    backgroundColor: '#07080B',
  },
  loadingText: {color: COLORS.textMuted, fontWeight: '700'},
  errorPanel: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.xl,
    gap: SPACING.md,
  },
  errorTitle: {color: COLORS.text, fontSize: 22, fontWeight: '900'},
  errorText: {color: COLORS.textMuted, textAlign: 'center', lineHeight: 20},
  retryButton: {
    minWidth: 120,
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: COLORS.primary,
  },
  retryText: {color: '#fff', fontWeight: '900'},
});

export default JukeLocalWebViewScreen;
