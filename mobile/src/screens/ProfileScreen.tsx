import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Dimensions,
  Platform,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { COLORS, SPACING } from '../theme/theme';
import { addRssFeed, getStoredRssFeeds, removeRssFeed } from '../utils/storage';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { launchImageLibrary } from 'react-native-image-picker';
import axios from 'axios';

const ProfileScreen = () => {
  const { width } = useWindowDimensions();
  const navigation = useNavigation<any>();
  const { user, logout } = useAuth();
  const [showAdminTab, setShowAdminTab] = useState(false);
  const [rssUrl, setRssUrl] = useState('');
  const [savedFeeds, setSavedFeeds] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [localAvatar, setLocalAvatar] = useState<string | null>(null);

  // Use centralized API address
  const BASE_API = 'http://192.168.0.13:3000/api/v1';
  const STORAGE_API = 'http://192.168.0.13:3000';

  useEffect(() => {
    loadFeeds();
  }, []);

  const loadFeeds = async () => {
    try {
      const feeds = await getStoredRssFeeds();
      setSavedFeeds(feeds);
    } catch (e) {
      console.error(e);
    }
  };

  const handleAddRss = async () => {
    if (!rssUrl.trim()) return;

    if (!rssUrl.startsWith('http')) {
      Alert.alert('Hata', 'Geçerli bir URL giriniz.');
      return;
    }

    const success = await addRssFeed(rssUrl.trim());
    if (success) {
      Alert.alert('Başarılı', 'RSS kaynağı eklendi.');
      setRssUrl('');
      loadFeeds();
    } else {
      Alert.alert('Hata', 'Bu kaynak zaten ekli veya bir hata oluştu.');
    }
  };

  const handleRemoveFeed = async (url: string) => {
    Alert.alert('Sil', 'Bu kaynağı silmek istediğinize emin misiniz?', [
      { text: 'İptal', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: async () => {
          await removeRssFeed(url);
          loadFeeds();
        },
      },
    ]);
  };

  const handleAvatarChange = async () => {
    if (!user || user.is_guest) {
      Alert.alert('Üyelik Gerekli', 'Profil fotoğrafı değiştirmek için giriş yapmalısınız.');
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

        const response = await axios.post(`${BASE_API}/auth/upload-avatar`, formData, {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        });

        if (response.data.data?.avatar_url) {
          Alert.alert('Başarılı', 'Profil fotoğrafın güncellendi.');
          setLocalAvatar(`${STORAGE_API}${response.data.data.avatar_url}`);
        }
      } catch (error) {
        console.error('Upload error:', error);
        Alert.alert('Hata', 'Fotoğraf yüklenirken bir sorun oluştu.');
      } finally {
        setIsUploading(false);
      }
    }
  };

  const currentAvatar = localAvatar || (user?.avatar_url ? `${STORAGE_API}${user.avatar_url}` : 'https://ui-avatars.com/api/?name=User&background=E31E24&color=fff&size=200');

  const isUserAdmin = user?.role === 'admin' || user?.role === 'moderator';

  return (
    <SafeAreaView style={styles.container}>
      {/* Premium Navbar */}
      <View style={styles.navbar}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}>
          <Icon name="chevron-left" size={32} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.navbarTitle}>Profil</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Profile Header Card */}
        <View style={styles.headerCard}>
          <TouchableOpacity
            style={styles.avatarContainer}
            onPress={handleAvatarChange}
            disabled={isUploading}
          >
            <Image
              source={{ uri: currentAvatar }}
              style={styles.avatar}
            />
            {isUploading ? (
              <View style={[styles.badge, { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
                <ActivityIndicator size="small" color="#fff" />
              </View>
            ) : (
              <View style={styles.badge}>
                <Icon name="camera" size={18} color="#fff" />
              </View>
            )}
          </TouchableOpacity>
          <View style={styles.userInfo}>
            <Text style={styles.name}>{user?.display_name || 'Misafir'}</Text>
            <Text style={styles.role}>{user?.role === 'admin' ? 'YÖNETİCİ' : user?.is_guest ? 'MİSAFİR' : 'ÜYE'}</Text>
          </View>
        </View>

        {/* Stats Row */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{user?.total_songs_added || 0}</Text>
            <Text style={styles.statLabel}>Katkı</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{user?.rank_score || 0}</Text>
            <Text style={styles.statLabel}>Puan</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{user?.total_upvotes_received || 0}</Text>
            <Text style={styles.statLabel}>Beğeni</Text>
          </View>
        </View>

        {/* Menu Section */}
        {isUserAdmin && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Yönetim</Text>
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => setShowAdminTab(!showAdminTab)}>
              <View style={[styles.menuIconContainer, { backgroundColor: 'rgba(227, 30, 36, 0.1)' }]}>
                <Icon name="shield-account" size={24} color={COLORS.primary} />
              </View>
              <Text style={styles.menuText}>Admin Paneli</Text>
              <Icon
                name={showAdminTab ? 'chevron-up' : 'chevron-right'}
                size={24}
                color={COLORS.textMuted}
              />
            </TouchableOpacity>

            {showAdminTab && (
              <View style={styles.adminPanel}>
                <Text style={styles.adminTitle}>Podcast RSS Ekle</Text>
                <View style={styles.inputWrapper}>
                  <TextInput
                    style={styles.input}
                    placeholder="https://example.com/feed.xml"
                    placeholderTextColor={COLORS.textMuted}
                    value={rssUrl}
                    onChangeText={setRssUrl}
                    autoCapitalize="none"
                  />
                  <TouchableOpacity style={styles.addBtn} onPress={handleAddRss}>
                    <Icon name="plus" size={24} color="#fff" />
                  </TouchableOpacity>
                </View>

                <Text style={[styles.adminTitle, { marginTop: SPACING.lg }]}>Aktif Kaynaklar</Text>
                {savedFeeds.length === 0 ? (
                  <Text style={styles.emptyText}>Henüz bir RSS kaynağı eklenmemiş.</Text>
                ) : (
                  savedFeeds.map((feed, index) => (
                    <View key={index} style={styles.feedRow}>
                      <Icon name="rss" size={20} color={COLORS.primary} />
                      <Text style={styles.feedText} numberOfLines={1}>{feed}</Text>
                      <TouchableOpacity onPress={() => handleRemoveFeed(feed)}>
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
          <Text style={styles.sectionLabel}>Uygulama</Text>

          {(!user || user.is_guest) ? (
            <TouchableOpacity
              style={[styles.menuItem, { backgroundColor: COLORS.primary }]}
              onPress={() => navigation.navigate('Auth', { screen: 'Login' })}
            >
              <View style={styles.menuIconContainer}>
                <Icon name="login" size={24} color="#fff" />
              </View>
              <Text style={[styles.menuText, { color: '#fff' }]}>Giriş Yap / Kayıt Ol</Text>
              <Icon name="chevron-right" size={24} color="#fff" />
            </TouchableOpacity>
          ) : null}

          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => navigation.navigate('Leaderboard')}
          >
            <View style={[styles.menuIconContainer, { backgroundColor: 'rgba(255, 215, 0, 0.1)' }]}>
              <Icon name="trophy-outline" size={24} color="#FFD700" />
            </View>
            <Text style={styles.menuText}>Sıralama (Leaderboard)</Text>
            <Icon name="chevron-right" size={24} color={COLORS.textMuted} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem}>
            <View style={[styles.menuIconContainer, { backgroundColor: 'rgba(255, 255, 255, 0.05)' }]}>
              <Icon name="cog-outline" size={24} color={COLORS.text} />
            </View>
            <Text style={styles.menuText}>Ayarlar</Text>
            <Icon name="chevron-right" size={24} color={COLORS.textMuted} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.menuItem, { marginTop: SPACING.md }]}
            onPress={logout}
          >
            <View style={[styles.menuIconContainer, { backgroundColor: 'rgba(255, 59, 48, 0.1)' }]}>
              <Icon name="logout-variant" size={24} color={COLORS.error} />
            </View>
            <Text style={[styles.menuText, { color: COLORS.error }]}>Çıkış Yap</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

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
  menuText: {
    flex: 1,
    fontSize: 16,
    color: COLORS.text,
    fontWeight: '500',
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
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  input: {
    flex: 1,
    backgroundColor: COLORS.background,
    height: 48,
    borderRadius: 12,
    paddingHorizontal: SPACING.md,
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  addBtn: {
    backgroundColor: COLORS.primary,
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: SPACING.sm,
  },
  feedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    padding: SPACING.sm,
    borderRadius: 10,
    marginTop: SPACING.xs,
  },
  feedText: {
    flex: 1,
    color: COLORS.textMuted,
    marginHorizontal: SPACING.sm,
    fontSize: 13,
  },
  emptyText: {
    color: COLORS.textMuted,
    fontStyle: 'italic',
    fontSize: 13,
    textAlign: 'center',
    marginTop: SPACING.sm,
  },
});

export default ProfileScreen;
