import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import JukeboxHomeScreen from '../screens/jukebox/JukeboxHomeScreen';
import QueueScreen from '../screens/jukebox/QueueScreen';
import QRScannerScreen from '../screens/jukebox/QRScannerScreen';
import SongSearchScreen from '../screens/jukebox/SongSearchScreen';

const Stack = createNativeStackNavigator();

export default function JukeboxNavigator() {
    return (
        <Stack.Navigator screenOptions={{ headerShown: false }}>
            <Stack.Screen name="JukeboxHome" component={JukeboxHomeScreen} />
            <Stack.Screen name="QRScanner" component={QRScannerScreen} />
            <Stack.Screen name="Queue" component={QueueScreen} />
            <Stack.Screen name="SongSearch" component={SongSearchScreen} />
        </Stack.Navigator>
    );
}
