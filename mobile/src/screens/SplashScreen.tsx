import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  Animated,
  Image,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

export const SPLASH_MIN_VISIBLE_MS = 1500;
export const SPLASH_SAFETY_TIMEOUT_MS = 5000;

interface SplashScreenProps {
  ready: boolean;
  onFinish: () => void;
}

const SplashScreen: React.FC<SplashScreenProps> = ({ready, onFinish}) => {
  const insets = useSafeAreaInsets();
  const {width, height} = useWindowDimensions();
  const [layoutReady, setLayoutReady] = useState(false);
  const [minimumElapsed, setMinimumElapsed] = useState(false);

  const stackOpacity = useRef(new Animated.Value(0)).current;
  const stackScale = useRef(new Animated.Value(0.96)).current;
  const overlayOpacity = useRef(new Animated.Value(1)).current;
  const exitStartedRef = useRef(false);
  const finishedRef = useRef(false);
  const onFinishRef = useRef(onFinish);

  useEffect(() => {
    onFinishRef.current = onFinish;
  }, [onFinish]);

  const finishOnce = useCallback(() => {
    if (finishedRef.current) {
      return;
    }

    finishedRef.current = true;
    onFinishRef.current();
  }, []);

  useEffect(() => {
    const minimumTimer = setTimeout(
      () => setMinimumElapsed(true),
      SPLASH_MIN_VISIBLE_MS,
    );
    const safetyTimer = setTimeout(finishOnce, SPLASH_SAFETY_TIMEOUT_MS);

    return () => {
      clearTimeout(minimumTimer);
      clearTimeout(safetyTimer);
    };
  }, [finishOnce]);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(stackOpacity, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }),
      Animated.spring(stackScale, {
        toValue: 1,
        damping: 16,
        stiffness: 120,
        mass: 0.8,
        useNativeDriver: true,
      }),
    ]).start();
  }, [stackOpacity, stackScale]);

  useEffect(() => {
    if (!layoutReady || !minimumElapsed || !ready || exitStartedRef.current) {
      return;
    }

    exitStartedRef.current = true;
    Animated.parallel([
      Animated.timing(stackOpacity, {
        toValue: 0,
        duration: 320,
        useNativeDriver: true,
      }),
      Animated.timing(stackScale, {
        toValue: 0.97,
        duration: 320,
        useNativeDriver: true,
      }),
      Animated.timing(overlayOpacity, {
        toValue: 0,
        duration: 360,
        useNativeDriver: true,
      }),
    ]).start(({finished}) => {
      if (finished) {
        finishOnce();
      }
    });
  }, [
    finishOnce,
    layoutReady,
    minimumElapsed,
    overlayOpacity,
    ready,
    stackOpacity,
    stackScale,
  ]);

  const brandStackWidth = Math.min(width * 0.78, 520);
  const compactHeight = height < 640;

  return (
    <Animated.View
      onLayout={() => setLayoutReady(true)}
      style={[
        styles.container,
        {
          opacity: overlayOpacity,
          paddingTop: insets.top,
          paddingBottom: insets.bottom,
        },
      ]}>
      <Animated.View
        style={[
          styles.brandStack,
          compactHeight && styles.brandStackCompact,
          {
            opacity: stackOpacity,
            transform: [{scale: stackScale}],
            width: brandStackWidth,
          },
        ]}>
        <Image
          source={require('../assets/images/logo-radiotedu-splash.png')}
          style={styles.radioTeduLogo}
          resizeMode="contain"
          accessibilityRole="image"
          accessibilityLabel="RadioTEDU"
        />
        <View
          style={[
            styles.rtaiCard,
            compactHeight && styles.rtaiCardCompact,
          ]}>
          <Image
            source={require('../assets/images/logo-rtai-splash.png')}
            style={styles.rtaiLogo}
            resizeMode="contain"
            accessibilityRole="image"
            accessibilityLabel="RTAI"
          />
        </View>
      </Animated.View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    backgroundColor: '#070707',
    justifyContent: 'center',
    zIndex: 10000,
  },
  brandStack: {
    alignItems: 'center',
    gap: 28,
    justifyContent: 'center',
  },
  brandStackCompact: {
    gap: 16,
  },
  radioTeduLogo: {
    aspectRatio: 2560 / 463,
    width: '100%',
  },
  rtaiCard: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: '#F7F3EA',
    borderColor: 'rgba(255, 255, 255, 0.28)',
    borderRadius: 18,
    borderWidth: 1,
    elevation: 8,
    paddingHorizontal: 24,
    paddingVertical: 18,
    shadowColor: '#FFFFFF',
    shadowOffset: {width: 0, height: 8},
    shadowOpacity: 0.12,
    shadowRadius: 20,
    width: '68%',
  },
  rtaiCardCompact: {
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  rtaiLogo: {
    aspectRatio: 858 / 291,
    width: '100%',
  },
});

export default SplashScreen;
