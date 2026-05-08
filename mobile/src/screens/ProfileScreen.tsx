import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { COLORS, SPACING } from '../theme/theme';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { launchImageLibrary } from 'react-native-image-picker';
import axios from 'axios';
import { BASE_API, STORAGE_API } from '../services/config';
import {
  createPodcastFeed,
  deletePodcastFeed,
  hasDuplicatePodcastFeedUrl,
  hasDuplicatePodcastFeedUrlOnServer,
  listPodcastFeeds,
  syncPodcastFeeds,
  type PodcastFeedRow,
} from '../services/podcastFeedsAdmin';
import {
  fetchProfileCustomization,
  updateProfileFavorites,
  type ProfileCustomization,
  type UserBadge,
} from '../services/profileService';

const ProfileScreen = () => {
  const navigation = useNavigation<any>();
  const { user, logout } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [showAdminTab, setShowAdminTab] = useState(false);
  const [feedTitle, setFeedTitle] = useState('');
  const [feedUrl, setFeedUrl] = useState('');
  const [savedFeeds, setSavedFeeds] = useState<PodcastFeedRow[]>([]);
  const [isLoadingFeeds, setIsLoadingFeeds] = useState(false);
  const [isSavingFeed, setIsSavingFeed] = useState(false);
  const [isSyncingFeeds, setIsSyncingFeeds] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [localAvatar, setLocalAvatar] = useState<string | null>(null);
  const [profileCustomization, setProfileCustomization] = useState<ProfileCustomization>({});
  const [badges, setBadges] = useState<UserBadge[]>([]);
  const [favoritesForm, setFavoritesForm] = useState<ProfileCustomization>({});
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  const BASE_API_LOCAL = BASE_API;
  const STORAGE_API_LOCAL = STORAGE_API;

  const loadFeeds = useCallback(async () => {
    if (!isAdmin) {
      setSavedFeeds([]);
      return;
    }

    setIsLoadingFeeds(true);
    try {
      const feeds = await listPodcastFeeds();
      setSavedFeeds(feeds);
    } catch (error) {
      console.error('Failed to load podcast feeds:', error);
      Alert.alert('Error', 'Podcast feeds could not be loaded.');
    } finally {
      setIsLoadingFeeds(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    if (isAdmin && showAdminTab) {
      loadFeeds();
    }
  }, [isAdmin, showAdminTab, loadFeeds]);

  const loadProfileCustomization = useCallback(async () => {
    if (!user || user.is_guest) {
      setProfileCustomization({});
      setFavoritesForm({});
      setBadges([]);
      return;
    }

    try {
      const result = await fetchProfileCustomization();
      setProfileCustomization(result.profile || {});
      setFavoritesForm(result.profile || {});
      setBadges(result.badges || []);
    } catch (error) {
      console.error('Failed to load profile customization:', error);
    }
  }, [user]);

  useEffect(() => {
    loadProfileCustomization();
  }, [loadProfileCustomization]);

  const updateFavoriteField = (key: keyof ProfileCustomization, value: string) => {
    setFavoritesForm((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const handleSaveFavorites = async () => {
    if (!user || user.is_guest) {
      Alert.alert('Membership required', 'Sign in to customize your profile.');
      return;
    }

    setIsSavingProfile(true);
    try {
      const result: any = await updateProfileFavorites(favoritesForm);
      const nextProfile = result?.profile || favoritesForm;
      setProfileCustomization(nextProfile);
      setFavoritesForm(nextProfile);
      Alert.alert('Saved', 'Your profile favorites have been updated.');
    } catch (error) {
      console.error('Failed to update profile favorites:', error);
      Alert.alert('Error', 'Profile favorites could not be saved.');
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleAddFeed = async () => {
    const title = feedTitle.trim();
    const url = feedUrl.trim();

    if (!title || !url) {
      Alert.alert('Error', 'Enter both a title and a feed URL.');
      return;
    }

    if (!/^https?:\/\//i.test(url)) {
      Alert.alert('Error', 'Enter a valid feed URL.');
      return;
    }

    if (isLoadingFeeds) {
      Alert.alert('Error', 'Wait for the podcast feed list to finish loading.');
      return;
    }

    if (hasDuplicatePodcastFeedUrl(savedFeeds, url)) {
      Alert.alert('Error', 'This feed URL is already in the list.');
      return;
    }

    setIsSavingFeed(true);
    try {
      if (await hasDuplicatePodcastFeedUrlOnServer(url)) {
        Alert.alert('Error', 'This feed URL is already in the list.');
        await loadFeeds();
        return;
      }

      const created = await createPodcastFeed({
        title,
        feedUrl: url,
      });
      setFeedTitle('');
      setFeedUrl('');
      await loadFeeds();
      if (created.sync && 'status' in created.sync && created.sync.status === 'failed') {
        Alert.alert('Success', 'Feed created, but the initial sync failed.');
      } else if (created.sync && 'upserted' in created.sync) {
        Alert.alert('Success', `Feed created and synced (${created.sync.upserted} items updated).`);
      } else {
        Alert.alert('Success', 'Feed created.');
      }
    } catch (error) {
      console.error('Failed to create podcast feed:', error);
      Alert.alert('Error', 'Podcast feed could not be created.');
    } finally {
      setIsSavingFeed(false);
    }
  };

  const handleDeleteFeed = async (feed: PodcastFeedRow) => {
    Alert.alert('Delete feed', `Delete "${feed.title}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deletePodcastFeed(feed.id);
            await loadFeeds();
          } catch (error) {
            console.error('Failed to delete podcast feed:', error);
            Alert.alert('Error', 'Podcast feed could not be deleted.');
          }
        },
      },
    ]);
  };

  const handleSyncFeeds = async () => {
    setIsSyncingFeeds(true);
    try {
      const results = await syncPodcastFeeds();
      await loadFeeds();
      Alert.alert('Success', `Synced ${results.length} feed(s).`);
    } catch (error) {
      console.error('Failed to sync podcast feeds:', error);
      Alert.alert('Error', 'Podcast feeds could not be synced.');
    } finally {
      setIsSyncingFeeds(false);
    }
  };

  const handleAvatarChange = async () => {
    if (!user || user.is_guest) {
      Alert.alert('Membership required', 'Sign in to change your profile photo.');
      return;
    }

    const result = await launchImageLibrary({
      mediaType: 'photo',
      quality: 0.8,
    });

    if (result.assets && result.assets[0]) {
      const asset = result.assets[0];

      setIsUploading(true);
      try {
        const formData = new FormData();
        formData.append('avatar', {
          uri: Platform.OS === 'android' ? asset.uri : asset.uri?.replace('file://', ''),
          type: asset.type,
          name: asset.fileName || 'avatar.jpg',
        } as any);

        const response = await axios.post(`${BASE_API_LOCAL}/auth/upload-avatar`, formData, {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        });

        if (response.data.data?.avatar_url) {
          Alert.alert('Success', 'Your profile photo has been updated.');
          setLocalAvatar(`${STORAGE_API_LOCAL}${response.data.data.avatar_url}`);
        }
      } catch (error) {
        console.error('Upload error:', error);
        Alert.alert('Error', 'There was a problem while uploading the photo.');
      } finally {
        setIsUploading(false);
      }
    }
  };

  const currentAvatar =
    localAvatar ||
    (user?.avatar_url
      ? `${STORAGE_API_LOCAL}${user.avatar_url}`
      : 'https://ui-avatars.com/api/?name=User&background=E31E24&color=fff&size=200');

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.navbar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Icon name="chevron-left" size={32} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.navbarTitle}>Profile</Text>
        <View style={styles.navbarSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.headerCard}>
          <TouchableOpacity
            style={styles.avatarContainer}
            onPress={handleAvatarChange}
            disabled={isUploading}
          >
            <Image source={{ uri: currentAvatar }} style={styles.avatar} />
            {isUploading ? (
              <View style={[styles.badge, styles.badgeLoading]}>
                <ActivityIndicator size="small" color="#fff" />
              </View>
            ) : (
              <View style={styles.badge}>
                <Icon name="camera" size={18} color="#fff" />
              </View>
            )}
          </TouchableOpacity>
          <View style={styles.userInfo}>
            <Text style={styles.name}>{user?.display_name || 'Guest'}</Text>
            <Text style={styles.role}>
              {user?.role === 'admin' ? 'ADMIN' : user?.is_guest ? 'GUEST' : 'MEMBER'}
            </Text>
          </View>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{user?.total_songs_added || 0}</Text>
            <Text style={styles.statLabel}>Contributions</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{user?.rank_score || 0}</Text>
            <Text style={styles.statLabel}>Score</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{user?.total_upvotes_received || 0}</Text>
            <Text style={styles.statLabel}>Likes</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Profile Showcase</Text>
          <View style={styles.showcaseCard}>
            <Text style={styles.showcaseTitle}>
              {profileCustomization.profile_headline || 'Add a headline for your RadioTEDU profile.'}
            </Text>
            <View style={styles.favoriteGrid}>
              <FavoriteDisplay
                icon="music-note"
                label="Favorite song"
                value={[
                  profileCustomization.favorite_song_title,
                  profileCustomization.favorite_song_artist,
                ].filter(Boolean).join(' · ') || 'Not selected'}
              />
              <FavoriteDisplay
                icon="account-music"
                label="Favorite artist"
                value={profileCustomization.favorite_artist_name || 'Not selected'}
              />
              <FavoriteDisplay
                icon="podcast"
                label="Favorite podcast"
                value={profileCustomization.favorite_podcast_title || 'Not selected'}
              />
            </View>

            <Text style={styles.badgesTitle}>Badges</Text>
            {badges.length === 0 ? (
              <Text style={styles.emptyText}>No badges yet.</Text>
            ) : (
              <View style={styles.badgeWrap}>
                {badges.slice(0, 8).map((item) => (
                  <View key={item.id} style={styles.profileBadge}>
                    <Icon name={item.icon || 'shield-star-outline'} size={16} color={COLORS.primary} />
                    <Text style={styles.profileBadgeText} numberOfLines={1}>{item.title}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>

          <View style={styles.editCard}>
            <Text style={styles.adminTitle}>Customize favorites</Text>
            <TextInput
              style={styles.input}
              placeholder="Profile headline"
              placeholderTextColor={COLORS.textMuted}
              value={favoritesForm.profile_headline || ''}
              onChangeText={(value) => updateFavoriteField('profile_headline', value)}
            />
            <TextInput
              style={[styles.input, styles.inputSpacing]}
              placeholder="Favorite song"
              placeholderTextColor={COLORS.textMuted}
              value={favoritesForm.favorite_song_title || ''}
              onChangeText={(value) => updateFavoriteField('favorite_song_title', value)}
            />
            <TextInput
              style={[styles.input, styles.inputSpacing]}
              placeholder="Favorite song artist"
              placeholderTextColor={COLORS.textMuted}
              value={favoritesForm.favorite_song_artist || ''}
              onChangeText={(value) => updateFavoriteField('favorite_song_artist', value)}
            />
            <TextInput
              style={[styles.input, styles.inputSpacing]}
              placeholder="Favorite artist"
              placeholderTextColor={COLORS.textMuted}
              value={favoritesForm.favorite_artist_name || ''}
              onChangeText={(value) => updateFavoriteField('favorite_artist_name', value)}
            />
            <TextInput
              style={[styles.input, styles.inputSpacing]}
              placeholder="Favorite podcast"
              placeholderTextColor={COLORS.textMuted}
              value={favoritesForm.favorite_podcast_title || ''}
              onChangeText={(value) => updateFavoriteField('favorite_podcast_title', value)}
            />
            <TouchableOpacity
              style={[styles.saveProfileButton, isSavingProfile && styles.actionBtnDisabled]}
              onPress={handleSaveFavorites}
              disabled={isSavingProfile}
            >
              <Text style={styles.saveProfileButtonText}>
                {isSavingProfile ? 'Saving...' : 'Save profile'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {isAdmin && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Admin</Text>
            <TouchableOpacity style={styles.menuItem} onPress={() => setShowAdminTab(!showAdminTab)}>
              <View style={[styles.menuIconContainer, styles.adminMenuIconContainer]}>
                <Icon name="shield-account" size={24} color={COLORS.primary} />
              </View>
              <Text style={styles.menuText}>Admin Panel</Text>
              <Icon
                name={showAdminTab ? 'chevron-up' : 'chevron-right'}
                size={24}
                color={COLORS.textMuted}
              />
            </TouchableOpacity>

            {showAdminTab && (
              <View style={styles.adminPanel}>
                <Text style={styles.adminTitle}>Podcast Feeds</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Feed title"
                  placeholderTextColor={COLORS.textMuted}
                  value={feedTitle}
                  onChangeText={setFeedTitle}
                />
                <TextInput
                  style={[styles.input, styles.inputSpacing]}
                  placeholder="https://example.com/feed.xml"
                  placeholderTextColor={COLORS.textMuted}
                  value={feedUrl}
                  onChangeText={setFeedUrl}
                  autoCapitalize="none"
                />
                <View style={styles.inputActions}>
                  <TouchableOpacity
                    style={[styles.addBtn, (isSavingFeed || isLoadingFeeds) && styles.actionBtnDisabled]}
                    onPress={handleAddFeed}
                    disabled={isSavingFeed || isLoadingFeeds}
                  >
                    <Icon name="plus" size={24} color="#fff" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.syncBtn, isSyncingFeeds && styles.actionBtnDisabled]}
                    onPress={handleSyncFeeds}
                    disabled={isSyncingFeeds}
                  >
                    <Icon name="sync" size={18} color="#fff" />
                    <Text style={styles.syncBtnText}>{isSyncingFeeds ? 'Syncing...' : 'Sync All'}</Text>
                  </TouchableOpacity>
                </View>

                <Text style={[styles.adminTitle, { marginTop: SPACING.lg }]}>Active Feeds</Text>
                {isLoadingFeeds ? (
                  <View style={styles.loadingRow}>
                    <ActivityIndicator size="small" color={COLORS.primary} />
                  </View>
                ) : savedFeeds.length === 0 ? (
                  <Text style={styles.emptyText}>No podcast feeds yet.</Text>
                ) : (
                  savedFeeds.map((feed) => (
                    <View key={feed.id} style={styles.feedRow}>
                      <Icon name="rss" size={20} color={COLORS.primary} />
                      <View style={styles.feedBody}>
                        <Text style={styles.feedTitle} numberOfLines={1}>
                          {feed.title}
                        </Text>
                        <Text style={styles.feedText} numberOfLines={1}>
                          {feed.feedUrl}
                        </Text>
                        {feed.lastSyncedAt ? (
                          <Text style={styles.feedMeta} numberOfLines={1}>
                            Last synced: {formatFeedTimestamp(feed.lastSyncedAt)}
                          </Text>
                        ) : null}
                        {feed.lastSyncError ? (
                          <Text style={styles.feedError} numberOfLines={2}>
                            Last sync error: {feed.lastSyncError}
                          </Text>
                        ) : null}
                      </View>
                      <TouchableOpacity onPress={() => handleDeleteFeed(feed)}>
                        <Icon name="trash-can-outline" size={20} color={COLORS.error} />
                      </TouchableOpacity>
                    </View>
                  ))
                )}
              </View>
            )}
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>App</Text>

          {!user || user.is_guest ? (
            <TouchableOpacity
              style={[styles.menuItem, { backgroundColor: COLORS.primary }]}
              onPress={() => navigation.navigate('Auth', { screen: 'Login' })}
            >
              <View style={styles.menuIconContainer}>
                <Icon name="login" size={24} color="#fff" />
              </View>
              <Text style={[styles.menuText, styles.menuTextLight]}>Sign in / Sign up</Text>
              <Icon name="chevron-right" size={24} color="#fff" />
            </TouchableOpacity>
          ) : null}

          <TouchableOpacity style={styles.menuItem} onPress={() => navigation.navigate('Leaderboard')}>
            <View style={[styles.menuIconContainer, styles.trophyIconContainer]}>
              <Icon name="trophy-outline" size={24} color="#FFD700" />
            </View>
            <Text style={styles.menuText}>Leaderboard</Text>
            <Icon name="chevron-right" size={24} color={COLORS.textMuted} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem}>
            <View style={[styles.menuIconContainer, styles.settingsIconContainer]}>
              <Icon name="cog-outline" size={24} color={COLORS.text} />
            </View>
            <Text style={styles.menuText}>Settings</Text>
            <Icon name="chevron-right" size={24} color={COLORS.textMuted} />
          </TouchableOpacity>

          <TouchableOpacity style={[styles.menuItem, { marginTop: SPACING.md }]} onPress={logout}>
            <View style={[styles.menuIconContainer, styles.logoutIconContainer]}>
              <Icon name="logout-variant" size={24} color={COLORS.error} />
            </View>
            <Text style={[styles.menuText, { color: COLORS.error }]}>Log out</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

function FavoriteDisplay({icon, label, value}: {icon: string; label: string; value: string}) {
  return (
    <View style={styles.favoriteTile}>
      <Icon name={icon} size={20} color={COLORS.primary} />
      <Text style={styles.favoriteLabel}>{label}</Text>
      <Text style={styles.favoriteValue} numberOfLines={2}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  navbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  navbarTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
    letterSpacing: 0.5,
  },
  navbarSpacer: {
    width: 44,
  },
  scrollContent: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.xl,
  },
  headerCard: {
    alignItems: 'center',
    paddingVertical: SPACING.xl,
    backgroundColor: COLORS.surface,
    borderRadius: 24,
    marginTop: SPACING.md,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.3,
        shadowRadius: 20,
      },
      android: {
        elevation: 10,
      },
    }),
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: SPACING.md,
  },
  avatar: {
    width: 110,
    height: 110,
    borderRadius: 55,
    borderWidth: 3,
    borderColor: COLORS.primary,
  },
  badge: {
    position: 'absolute',
    bottom: 5,
    right: 5,
    backgroundColor: COLORS.primary,
    borderRadius: 15,
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: COLORS.surface,
  },
  badgeLoading: {
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  userInfo: {
    alignItems: 'center',
  },
  name: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 4,
  },
  role: {
    fontSize: 15,
    color: COLORS.primary,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: SPACING.lg,
  },
  statCard: {
    backgroundColor: COLORS.card,
    flex: 1,
    marginHorizontal: SPACING.xs,
    paddingVertical: SPACING.md,
    borderRadius: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  statNumber: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  statLabel: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 4,
  },
  section: {
    marginTop: SPACING.xl,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: 'bold',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginBottom: SPACING.md,
    marginLeft: SPACING.xs,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md,
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    marginBottom: SPACING.sm,
  },
  menuIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.md,
  },
  adminMenuIconContainer: {
    backgroundColor: 'rgba(227, 30, 36, 0.1)',
  },
  trophyIconContainer: {
    backgroundColor: 'rgba(255, 215, 0, 0.1)',
  },
  settingsIconContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  logoutIconContainer: {
    backgroundColor: 'rgba(255, 59, 48, 0.1)',
  },
  menuText: {
    flex: 1,
    fontSize: 16,
    color: COLORS.text,
    fontWeight: '500',
  },
  menuTextLight: {
    color: '#fff',
  },
  adminPanel: {
    backgroundColor: 'rgba(227, 30, 36, 0.05)',
    padding: SPACING.md,
    borderRadius: 16,
    marginTop: SPACING.xs,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: 'rgba(227, 30, 36, 0.2)',
  },
  adminTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: SPACING.sm,
  },
  input: {
    backgroundColor: COLORS.background,
    height: 48,
    borderRadius: 12,
    paddingHorizontal: SPACING.md,
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  inputSpacing: {
    marginTop: SPACING.sm,
  },
  inputActions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SPACING.md,
  },
  addBtn: {
    backgroundColor: COLORS.primary,
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.sm,
  },
  syncBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
    height: 48,
    borderRadius: 12,
  },
  syncBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 8,
  },
  actionBtnDisabled: {
    opacity: 0.6,
  },
  loadingRow: {
    paddingVertical: SPACING.md,
    alignItems: 'center',
  },
  feedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    padding: SPACING.sm,
    borderRadius: 10,
    marginTop: SPACING.xs,
  },
  feedBody: {
    flex: 1,
    marginHorizontal: SPACING.sm,
  },
  feedTitle: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: '600',
  },
  feedText: {
    color: COLORS.textMuted,
    fontSize: 13,
  },
  feedMeta: {
    color: COLORS.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  feedError: {
    color: COLORS.error,
    fontSize: 12,
    marginTop: 2,
  },
  emptyText: {
    color: COLORS.textMuted,
    fontStyle: 'italic',
    fontSize: 13,
    textAlign: 'center',
    marginTop: SPACING.sm,
  },
  showcaseCard: {
    padding: SPACING.md,
    borderRadius: 20,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  showcaseTitle: {
    color: COLORS.text,
    fontSize: 17,
    fontWeight: '800',
    lineHeight: 24,
  },
  favoriteGrid: {
    gap: SPACING.sm,
    marginTop: SPACING.md,
  },
  favoriteTile: {
    padding: SPACING.md,
    borderRadius: 16,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  favoriteLabel: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: SPACING.sm,
  },
  favoriteValue: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '700',
    marginTop: 3,
  },
  badgesTitle: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '800',
    marginTop: SPACING.md,
    marginBottom: SPACING.sm,
  },
  badgeWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  profileBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: '48%',
    paddingHorizontal: SPACING.sm,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(227, 30, 36, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(227, 30, 36, 0.25)',
  },
  profileBadgeText: {
    flex: 1,
    color: COLORS.text,
    fontSize: 12,
    fontWeight: '700',
  },
  editCard: {
    marginTop: SPACING.md,
    padding: SPACING.md,
    borderRadius: 20,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  saveProfileButton: {
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
    marginTop: SPACING.md,
  },
  saveProfileButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
  },
});

function formatFeedTimestamp(value: string): string {
  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) {
    return value;
  }

  return parsedDate.toLocaleString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default ProfileScreen;
