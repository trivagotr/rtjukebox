import React from 'react';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {ActivityIndicator, Text, View} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import AuthGuard from '../components/AuthGuard';
import {useAuth} from '../context/AuthContext';
import HomeScreen from '../screens/HomeScreen';
import RadioScreen from '../screens/RadioScreen';
import PodcastScreen from '../screens/PodcastScreen';
import JukeboxScreen from '../screens/jukebox/JukeboxScreen';
import ProfileScreen from '../screens/ProfileScreen';
import LeaderboardScreen from '../screens/LeaderboardScreen';
import EventsScreen from '../screens/EventsScreen';
import GamesScreen from '../screens/GamesScreen';
import MarketScreen from '../screens/MarketScreen';
import SnakeScreen from '../screens/games/SnakeScreen';
import MemoryGameScreen from '../screens/games/MemoryGameScreen';
import TetrisScreen from '../screens/games/TetrisScreen';
import RhythmTapScreen from '../screens/games/RhythmTapScreen';
import WordGuessScreen from '../screens/games/WordGuessScreen';
import LoginScreen from '../screens/auth/LoginScreen';
import RegisterScreen from '../screens/auth/RegisterScreen';
import {COLORS} from '../theme/theme';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function AuthStack() {
  return (
    <Stack.Navigator screenOptions={{headerShown: false, animation: 'slide_from_right'}}>
      <Stack.Screen name="Prompt" component={AuthGuard} />
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Register" component={RegisterScreen} />
    </Stack.Navigator>
  );
}

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({route}) => ({
        tabBarIcon: ({focused, color, size}) => {
          let iconName = 'help-circle';
          if (route.name === 'Home') {
            iconName = focused ? 'home-variant' : 'home-variant-outline';
          } else if (route.name === 'Radio') {
            iconName = 'radio-tower';
          } else if (route.name === 'Podcasts') {
            iconName = 'microphone';
          } else if (route.name === 'Jukebox') {
            iconName = 'music-box-multiple';
          } else if (route.name === 'Leaderboard') {
            iconName = focused ? 'trophy' : 'trophy-outline';
          }

          return <Icon name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: 'gray',
        tabBarLabelStyle: {
          fontSize: 10,
        },
        tabBarLabel: ({focused, color}) => (
          <Text
            style={{
              color,
              fontSize: 10,
              textAlign: 'center',
              fontWeight: focused ? 'bold' : 'normal',
            }}
            maxFontSizeMultiplier={1.1}
            numberOfLines={1}>
            {getTabLabel(route.name)}
          </Text>
        ),
        tabBarStyle: {
          backgroundColor: COLORS.background,
          borderTopColor: COLORS.border,
          height: 70,
          paddingBottom: 12,
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
      })}>
      <Tab.Screen name="Home" component={HomeScreen} options={{title: 'Ana Sayfa', headerShown: false}} />
      <Tab.Screen name="Radio" component={RadioScreen} options={{title: 'Yayın', headerShown: false}} />
      <Tab.Screen name="Podcasts" component={PodcastScreen} options={{title: 'Podcastler', headerShown: false}} />
      <Tab.Screen name="Jukebox" component={JukeboxScreen} options={{title: 'Jukebox', headerShown: false}} />
      <Tab.Screen name="Leaderboard" component={LeaderboardScreen} options={{title: 'Sıralama', headerShown: false}} />
    </Tab.Navigator>
  );
}

function getTabLabel(routeName: string) {
  if (routeName === 'Home') {
    return 'Ana Sayfa';
  }
  if (routeName === 'Radio') {
    return 'Yayın';
  }
  if (routeName === 'Podcasts') {
    return 'Podcastler';
  }
  if (routeName === 'Jukebox') {
    return 'Jukebox';
  }
  return 'Sıralama';
}

export function RootNavigator() {
  const {user, isLoading} = useAuth();

  if (isLoading) {
    return (
      <View style={{flex: 1, backgroundColor: COLORS.background, justifyContent: 'center', alignItems: 'center'}}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <Stack.Navigator screenOptions={{headerShown: false}}>
      <Stack.Screen name="MainTabs" component={MainTabs} />
      <Stack.Screen name="Profile" component={ProfileScreen} />
      <Stack.Screen name="Events" component={EventsScreen} />
      <Stack.Screen name="Games" component={GamesScreen} />
      <Stack.Screen name="Market" component={MarketScreen} />
      <Stack.Screen name="SnakeGame" component={SnakeScreen} />
      <Stack.Screen name="MemoryGame" component={MemoryGameScreen} />
      <Stack.Screen name="TetrisGame" component={TetrisScreen} />
      <Stack.Screen name="RhythmTapGame" component={RhythmTapScreen} />
      <Stack.Screen name="WordGuessGame" component={WordGuessScreen} />
      {(!user || user.is_guest) && <Stack.Screen name="Auth" component={AuthStack} />}
    </Stack.Navigator>
  );
}
