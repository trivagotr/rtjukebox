import React, { useEffect, useRef, useState } from 'react';
import {
    View,
    Image,
    StyleSheet,
    Animated,
    StatusBar,
    Easing,
    useWindowDimensions,
} from 'react-native';
import { COLORS } from '../theme/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface SplashScreenProps {
    onFinish: () => void;
}

const SplashScreen: React.FC<SplashScreenProps> = ({ onFinish }) => {
    const insets = useSafeAreaInsets();
    const { width, height } = useWindowDimensions();
    const [isReady, setIsReady] = useState(false);

    // Animation Values
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const bgFadeAnim = useRef(new Animated.Value(1)).current;

    // Transform values
    const scaleAnim = useRef(new Animated.Value(1)).current;
    const translateYAnim = useRef(new Animated.Value(0)).current;

    const hasStarted = useRef(false);
    const onFinishRef = useRef(onFinish);

    // Keep onFinish ref updated
    useEffect(() => {
        onFinishRef.current = onFinish;
    }, [onFinish]);

    // 1. Wait for insets
    useEffect(() => {
        if (isReady) return;
        if (insets.top > 0 || (StatusBar.currentHeight && StatusBar.currentHeight > 0)) {
            setIsReady(true);
        } else {
            const timer = setTimeout(() => setIsReady(true), 1500);
            return () => clearTimeout(timer);
        }
    }, [insets.top, isReady]);

    // 2. Safety Dismiss (If stuck)
    useEffect(() => {
        const safetyTimer = setTimeout(() => {
            onFinishRef.current();
        }, 12000);
        return () => clearTimeout(safetyTimer);
    }, []);

    // 3. Main Animation
    useEffect(() => {
        if (!isReady || hasStarted.current) return;
        hasStarted.current = true;

        // Logo initial fade in
        Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true,
        }).start();

        // Calculate Target
        // Header Logo: width=150, height=40
        // Splash Logo: width=width*0.6
        const initialSplashWidth = width * 0.6;
        const targetScale = 150 / initialSplashWidth;

        // Target Y:
        // Header Logo center Y = insets.top + paddingVertical (8) + logoHeight / 2 (20) = insets.top + 28
        // Splash Logo center Y (initially) = height / 2
        const topOffset = insets.top > 0 ? insets.top : (StatusBar.currentHeight || 0);
        const headerCenterY = topOffset + 28;
        const splashCenterY = height / 2;
        const targetTranslateY = headerCenterY - splashCenterY;

        const sequence = Animated.sequence([
            Animated.delay(6000),
            Animated.parallel([
                Animated.timing(scaleAnim, {
                    toValue: targetScale,
                    duration: 1500,
                    easing: Easing.bezier(0.33, 1, 0.68, 1),
                    useNativeDriver: true,
                }),
                Animated.timing(translateYAnim, {
                    toValue: targetTranslateY,
                    duration: 1500,
                    easing: Easing.bezier(0.33, 1, 0.68, 1),
                    useNativeDriver: true,
                }),
                Animated.timing(bgFadeAnim, {
                    toValue: 0,
                    duration: 1500,
                    useNativeDriver: true,
                }),
                Animated.sequence([
                    Animated.delay(1200),
                    Animated.timing(fadeAnim, {
                        toValue: 0,
                        duration: 300,
                        useNativeDriver: true,
                    })
                ])
            ])
        ]);

        sequence.start(({ finished }) => {
            if (finished) {
                onFinishRef.current();
            }
        });
    }, [isReady, width, height, insets.top]);

    if (!isReady) {
        return <View style={[styles.container, { backgroundColor: COLORS.background }]} />;
    }

    // Header Logo Aspect Ratio = 150 / 40 = 3.75
    // Initial width is width * 0.6
    const splashLogoWidth = width * 0.6;
    const splashLogoHeight = splashLogoWidth / 3.75;

    return (
        <Animated.View
            style={[
                styles.container,
                { opacity: bgFadeAnim, backgroundColor: COLORS.background }
            ]}
            pointerEvents="none"
        >
            <Animated.View
                style={[
                    styles.logoContainer,
                    {
                        width: splashLogoWidth,
                        height: splashLogoHeight,
                        opacity: fadeAnim,
                        transform: [
                            { translateY: translateYAnim },
                            { scale: scaleAnim }
                        ],
                    },
                ]}>
                <Image
                    source={require('../assets/images/logo-03byz.png')}
                    style={styles.logo}
                    resizeMode="contain"
                />
            </Animated.View>
        </Animated.View>
    );
};

const styles = StyleSheet.create({
    container: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 10000,
    },
    logoContainer: {
        justifyContent: 'center',
        alignItems: 'center',
    },
    logo: {
        width: '100%',
        height: '100%',
    },
});

export default SplashScreen;
