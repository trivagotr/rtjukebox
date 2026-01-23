import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import RadioScreen from '../screens/RadioScreen';
import PodcastScreen from '../screens/PodcastScreen';
import JukeboxScreen from '../screens/jukebox/JukeboxScreen';
import { COLORS } from '../theme/theme';

import ProfileScreen from '../screens/ProfileScreen';
import LeaderboardScreen from '../screens/LeaderboardScreen';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function MainTabs() {
    return (
        <Tab.Navigator
            screenOptions={({ route }) => ({
                tabBarIcon: ({ focused, color, size }) => {
                    let iconName: string = 'help-circle';
                    if (route.name === 'Radio') {
                        iconName = focused ? 'radio-tower' : 'radio-tower';
                    } else if (route.name === 'Podcasts') {
                        iconName = focused ? 'microphone' : 'microphone';
                    } else if (route.name === 'Jukebox') {
                        iconName = focused ? 'music-box-multiple' : 'music-box-multiple';
                    } else if (route.name === 'Leaderboard') {
                        iconName = focused ? 'trophy' : 'trophy-outline';
                    }
                    return <Icon name={iconName} size={size} color={color} />;
                },
                tabBarActiveTintColor: COLORS.primary,
                tabBarInactiveTintColor: 'gray',
                tabBarStyle: {
                    backgroundColor: COLORS.background,
                    borderTopColor: COLORS.border,
                    height: 60,
                    paddingBottom: 10,
                },
                headerStyle: {
                    backgroundColor: COLORS.background,
                    elevation: 0,
                    shadowOpacity: 0,
                },
                headerTitleStyle: {
                    color: COLORS.text,
                    fontWeight: 'bold',
                },
            })}
        >
            <Tab.Screen name="Radio" component={RadioScreen} options={{ title: 'RadioTEDU', headerShown: false }} />
            <Tab.Screen name="Podcasts" component={PodcastScreen} options={{ headerShown: false }} />
            <Tab.Screen name="Jukebox" component={JukeboxScreen} options={{ headerShown: false }} />
            <Tab.Screen name="Leaderboard" component={LeaderboardScreen} options={{ title: 'Sıralama', headerShown: false }} />
        </Tab.Navigator>
    );
}

export function RootNavigator() {
    return (
        <Stack.Navigator screenOptions={{ headerShown: false }}>
            <Stack.Screen name="Main" component={MainTabs} />
            <Stack.Screen name="Profile" component={ProfileScreen} />
        </Stack.Navigator>
    );
}
