import React, {useCallback, useEffect, useRef, useState} from "react";
import {View, FlatList, useWindowDimensions, StatusBar, TouchableOpacity, Text, StyleSheet, Modal, Pressable, ActivityIndicator, RefreshControl} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useIsFocused } from "@react-navigation/native";
import Post from "../components/Post";
import apiClient from "../api/client";
import {fetchFeed, toPost} from "../api/feed";
import {useAuth} from "../context/AuthContext";

// a video counts as "on screen" (and plays) once most of it is visible
const VIEWABILITY_CONFIG = {itemVisiblePercentThreshold: 80};

const Home = ({navigation}) => {
  const insets = useSafeAreaInsets();
  // live window size: changes when the phone is rotated, and every post is exactly one screen tall
  const {height: screenHeight} = useWindowDimensions();
  const flatListRef = useRef(null);
  const [menuVisible, setMenuVisible] = useState(false);
  const {setAccessToken} = useAuth();
  // pause the feed while another screen (e.g. the Upload modal) is on top
  const isFocused = useIsFocused();

  const [posts, setPosts] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeIndex, setActiveIndex] = useState(0);
  // onEndReached can fire several times in a row — a ref blocks overlapping page loads synchronously
  const loadingRef = useRef(false);

  // Loads one page. With reset, starts over from the newest video (initial load / pull-to-refresh);
  // otherwise appends the page after nextCursor.
  const loadPage = useCallback(async ({reset = false} = {}) => {
    if (loadingRef.current) return;
    if (!reset && !hasMore) return;
    loadingRef.current = true;
    reset ? setRefreshing(true) : setLoadingMore(true);
    try {
      const {videos, nextCursor: cursor} = await fetchFeed(reset ? null : nextCursor);
      const page = videos.map(toPost);
      setPosts(prev => (reset ? page : [...prev, ...page]));
      setNextCursor(cursor);
      setHasMore(cursor !== null);
      setError(null);
      if (reset) setActiveIndex(0);
    } catch (err) {
      console.error('Feed load failed', err);
      setError(err?.message || 'Could not load the feed');
    } finally {
      loadingRef.current = false;
      setRefreshing(false);
      setLoadingMore(false);
      setInitialLoading(false);
    }
  }, [hasMore, nextCursor]);

  useEffect(() => {
    loadPage({reset: true});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Rotating changes every item's offset (index * screenHeight); jump back to the video that
  // was on screen so the list doesn't land between two of them.
  useEffect(() => {
    if (posts.length > 0 && activeIndex < posts.length) {
      flatListRef.current?.scrollToIndex({index: activeIndex, animated: false});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screenHeight]);

  // must be a stable reference — FlatList doesn't allow changing it on the fly
  const onViewableItemsChanged = useRef(({viewableItems}) => {
    if (viewableItems.length > 0 && viewableItems[0].index != null) {
      setActiveIndex(viewableItems[0].index);
    }
  }).current;

  const handleLogout = async () => {
    setMenuVisible(false);
    try {
      await apiClient.post('/logout');
      console.log(`[logged out successfully ${new Date().toLocaleTimeString()}]`);
    } catch (err) {
      console.error(err);
    }
    setAccessToken(null);
    navigation.reset({
      index: 0,
      routes: [{name: 'LoginPage'}],
    });
  };

  const handleUpload = () => {
    setMenuVisible(false);
    navigation.navigate('UploadPage');
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      {initialLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator color="#fff" size="large" />
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={posts}
          keyExtractor={item => item.id}
          renderItem={({item, index}) => (
            <Post post={item} height={screenHeight} isActive={isFocused && index === activeIndex} />
          )}
          getItemLayout={(_, index) => ({length: screenHeight, offset: screenHeight * index, index})}
          snapToInterval={screenHeight}
          snapToAlignment="start"
          decelerationRate="fast"
          showsVerticalScrollIndicator={false}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={VIEWABILITY_CONFIG}
          // fetch the next page while the user is still ~1 video away from the end
          onEndReached={() => loadPage()}
          onEndReachedThreshold={1}
          // keep only a few full-screen videos mounted at a time
          windowSize={3}
          initialNumToRender={2}
          maxToRenderPerBatch={2}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => loadPage({reset: true})} tintColor="#fff" />
          }
          ListFooterComponent={
            loadingMore ? (
              <View style={styles.footer}>
                <ActivityIndicator color="#fff" />
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={[styles.centered, {height: screenHeight}]}>
              <Text style={styles.emptyText}>{error ? 'Could not load the feed' : 'No videos yet'}</Text>
              <TouchableOpacity style={styles.retryButton} onPress={() => loadPage({reset: true})} activeOpacity={0.8}>
                <Text style={styles.retryText}>{error ? 'Retry' : 'Refresh'}</Text>
              </TouchableOpacity>
            </View>
          }
        />
      )}

      <TouchableOpacity
        // in landscape insets.top is 0 and the Dynamic Island/notch moves to a side edge
        style={[styles.menuButton, {top: Math.max(insets.top - 3, 12), right: 16 + insets.right}]}
        onPress={() => setMenuVisible(true)}
        activeOpacity={0.8}>
        <Text style={styles.menuDots}>⋮</Text>
      </TouchableOpacity>

      <Modal
        visible={menuVisible}
        transparent
        animationType="fade"
        // iOS Modals are portrait-only unless told otherwise, which would rotate the app back
        supportedOrientations={['portrait', 'landscape']}
        onRequestClose={() => setMenuVisible(false)}>
        <Pressable style={styles.menuOverlay} onPress={() => setMenuVisible(false)}>
          <View style={[styles.menuDropdown, {top: Math.max(insets.top - 3, 12) + 37, right: 16 + insets.right}]}>
            <TouchableOpacity style={styles.menuItem} onPress={handleUpload} activeOpacity={0.7}>
              <Text style={styles.menuItemText}>Upload</Text>
            </TouchableOpacity>
            <View style={styles.menuDivider} />
            <TouchableOpacity style={styles.menuItem} onPress={handleLogout} activeOpacity={0.7}>
              <Text style={styles.menuItemText}>Log Out</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    paddingVertical: 24,
    alignItems: 'center',
  },
  emptyText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 16,
  },
  retryButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  retryText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  menuButton: {
    position: 'absolute',
    right: 16,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  menuDots: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 20,
  },
  menuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  menuDropdown: {
    position: 'absolute',
    right: 16,
    minWidth: 140,
    borderRadius: 14,
    backgroundColor: 'rgba(30,30,30,0.97)',
    borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.15)',
    overflow: 'hidden',
  },
  menuItem: {
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  menuItemText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  menuDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
});

export default Home;