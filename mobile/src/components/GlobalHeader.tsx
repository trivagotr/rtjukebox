import React from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Image,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation } from '@react-navigation/native';
import { SPACING } from '../theme/theme';
import { useAuth } from '../context/AuthContext';

const GlobalHeader = () => {
  const navigation = useNavigation<any>();
  const { user } = useAuth();

  const handleProfilePress = () => {
    navigation.navigate('Profile');
  };

  return (
    <View style={styles.header}>
      <View style={{ width: 28 }} />
      <Image
        source={require('../assets/images/logo-03byz.png')}
        style={styles.logo}
        resizeMode="contain"
      />
      <TouchableOpacity onPress={handleProfilePress}>
        <Icon name="account-circle" size={28} color="#fff" />
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
    height: 44,
    width: 160,
  },
});

export default GlobalHeader;
