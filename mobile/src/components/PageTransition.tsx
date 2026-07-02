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
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const translateYAnim = useRef(new Animated.Value(6)).current;

  useFocusEffect(
    useCallback(() => {
      // Reset instantly
      fadeAnim.setValue(0);
      translateYAnim.setValue(6);

      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 180,
          useNativeDriver: true,
          easing: Easing.out(Easing.quad),
        }),
        Animated.timing(translateYAnim, {
          toValue: 0,
          duration: 180,
          useNativeDriver: true,
          easing: Easing.out(Easing.quad),
        }),
      ]).start();
    }, [fadeAnim, translateYAnim]),
  );

  return (
    <View style={styles.container}>
      <Animated.View
        style={[
          styles.content,
          style,
          {
            opacity: fadeAnim,
            transform: [{translateY: translateYAnim}],
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
