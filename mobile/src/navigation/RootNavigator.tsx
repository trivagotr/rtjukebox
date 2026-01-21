import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import HomeScreen from '../screens/HomeScreen';
import RadioScreen from '../screens/RadioScreen';
import PodcastScreen from '../screens/PodcastScreen';
import JukeboxNavigator from './JukeboxNavigator';
import ProfileScreen from '../screens/ProfileScreen';

// Types
export type RootStackParamList = {
    Main: undefined;
    Auth: undefined;
    Player: undefined;
};

export type TabParamList = {
    Home: undefined;
    Radio: undefined;
    Podcasts: undefined;
    Jukebox: undefined;
    Profile: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

function MainTabNavigator() {
    return (
        <Tab.Navigator
            screenOptions={{
                headerShown: false,
                tabBarStyle: { backgroundColor: '#1a1a1a', borderTopColor: '#333' },
                tabBarActiveTintColor: '#e91e63',
                tabBarInactiveTintColor: '#888',
            }}
        >
            <Tab.Screen name="Home" component={HomeScreen} />
            <Tab.Screen name="Radio" component={RadioScreen} />
            <Tab.Screen name="Podcasts" component={PodcastScreen} />
            <Tab.Screen name="Jukebox" component={JukeboxNavigator} />
            <Tab.Screen name="Profile" component={ProfileScreen} />
        </Tab.Navigator>
    );
}

export const RootNavigator = () => {
    // In a real app, check auth state here
    const isAuthenticated = false;

    return (
        <Stack.Navigator screenOptions={{ headerShown: false }}>
            {isAuthenticated ? (
                <Stack.Screen name="Main" component={MainTabNavigator} />
            ) : (
                <Stack.Screen name="Main" component={MainTabNavigator} />
                /* For MVP demo, going straight to Main. Normally would be Auth stack if !isAuthenticated */
            )}
        </Stack.Navigator>
    );
};
