import AsyncStorage from '@react-native-async-storage/async-storage';

const RSS_FEEDS_KEY = '@rss_feeds';

export const getStoredRssFeeds = async (): Promise<string[]> => {
    try {
        const jsonValue = await AsyncStorage.getItem(RSS_FEEDS_KEY);
        return jsonValue != null ? JSON.parse(jsonValue) : [];
    } catch (e) {
        console.error('Failed to load RSS feeds', e);
        return [];
    }
};

export const addRssFeed = async (url: string): Promise<boolean> => {
    try {
        const feeds = await getStoredRssFeeds();
        if (feeds.includes(url)) return false; // Already exists

        const newFeeds = [...feeds, url];
        await AsyncStorage.setItem(RSS_FEEDS_KEY, JSON.stringify(newFeeds));
        return true;
    } catch (e) {
        console.error('Failed to add RSS feed', e);
        return false;
    }
};

export const removeRssFeed = async (url: string): Promise<void> => {
    try {
        const feeds = await getStoredRssFeeds();
        const newFeeds = feeds.filter(feed => feed !== url);
        await AsyncStorage.setItem(RSS_FEEDS_KEY, JSON.stringify(newFeeds));
    } catch (e) {
        console.error('Failed to remove RSS feed', e);
    }
};
