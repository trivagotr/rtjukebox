import React from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Image,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation } from '@react-navigation/native';
import { COLORS, SPACING } from '../theme/theme';

const GlobalHeader = () => {
  const navigation = useNavigation<any>();

  const handleProfilePress = () => {
    navigation.navigate('Profile');
  };

  return (
    <View style={styles.header}>
      <View style={styles.sideSlot} />
      <Image
        source={require('../assets/images/logo-03byz.png')}
        style={styles.logo}
        resizeMode="contain"
      />
      <TouchableOpacity
        style={styles.profileButton}
        onPress={handleProfilePress}
        hitSlop={{top: 8, right: 8, bottom: 8, left: 8}}
        activeOpacity={0.75}>
        <Icon name="account-circle" size={28} color={COLORS.text} />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    backgroundColor: 'transparent',
    zIndex: 10,
  },
  logo: {
    height: 42,
    width: 156,
  },
  sideSlot: {
    width: 44,
    height: 44,
  },
  profileButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default GlobalHeader;
