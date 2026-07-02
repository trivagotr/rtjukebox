import React, {useRef, useCallback} from 'react';
import {Animated, StyleSheet, ViewProps, Easing, View} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import {COLORS} from '../theme/theme';

interface PageTransitionProps extends ViewProps {
  children: React.ReactNode;
}

const PageTransition: React.FC<PageTransitionProps> = ({
  children,
  style,
  ...props
}) => {
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;

  useFocusEffect(
    useCallback(() => {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 200, // Faster, snappier
          useNativeDriver: true,
          easing: Easing.out(Easing.quad),
        }),
        Animated.timing(scaleAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
          easing: Easing.out(Easing.quad),
        }),
      ]).start();
    }, [fadeAnim, scaleAnim]),
  );

  return (
    <View style={styles.container}>
      <Animated.View
        style={[
          styles.content,
          style,
          {
            opacity: fadeAnim,
            transform: [{scale: scaleAnim}],
          },
        ]}
        {...props}>
        {children}
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background, // Ensures background is always dark
  },
  content: {
    flex: 1,
  },
});

export default PageTransition;
