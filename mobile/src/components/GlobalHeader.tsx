import React from 'react';
import { View, StyleSheet, TouchableOpacity, Dimensions, Image } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation } from '@react-navigation/native';
import { SPACING } from '../theme/theme';

const { width } = Dimensions.get('window');

const GlobalHeader = () => {
    const navigation = useNavigation<any>();

    return (
        <View style={styles.header}>
            <View style={{ width: 28 }} />
            <Image
                source={require('../../logos/logo-03byz.png')}
                style={styles.logo}
                resizeMode="contain"
            />
            <TouchableOpacity onPress={() => navigation.navigate('Profile')}>
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
        width: width,
        backgroundColor: 'transparent',
        zIndex: 10,
    },
    logo: {
        height: 40,
        width: 150, // Adjust width as needed to maintain aspect ratio
    },
});

export default GlobalHeader;
