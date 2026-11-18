import React, {useCallback, useEffect, useRef, useState} from "react";
import {View, FlatList, useWindowDimensions, StatusBar, TouchableOpacity, Text, StyleSheet, Modal, Pressable, ActivityIndicator, RefreshControl, Alert} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useIsFocused } from "@react-navigation/native";
import Post from "../components/Post";
import apiClient from "../api/client";
import {fetchFeed, toPost} from "../api/feed";
import {blockUser, takeFeedStale} from "../api/blocks";
import {reportVideo} from "../api/videos";
import {getErrorMessage} from "../api/errors";
import {useAuth} from "../context/AuthContext";
import {stopTrackingUploads} from "../api/uploadStatus";

// a video counts as "on screen" (and plays) once most of it is visible
const VIEWABILITY_CONFIG = {itemVisiblePercentThreshold: 80};

// choices in the Report Video panel; values match the upload service's video_reports.reason
const REPORT_REASONS = [
  {value: 'sexual', label: 'Sexual content'},
  {value: 'child_safety', label: 'Child safety'},
  {value: 'hate_harassment_violence', label: 'Hate, harassment, or violence'},
];

const Home = ({navigation}) => {
  const insets = useSafeAreaInsets();
  // live window size: changes when the phone is rotated, and every post is exactly one screen tall
  const {height: screenHeight} = useWindowDimensions();
  const flatListRef = useRef(null);
  const [menuVisible, setMenuVisible] = useState(false);
  // videoId -> 0/90/180/270 from the menu's Rotate Left/Right. Only on this screen, for this
  // session: not saved anywhere. Kept apart from `posts` so a refresh doesn't undo it.
  const [rotations, setRotations] = useState({});
  // the video the Report panel is open for (null = closed). Captured when it opens, so the feed
  // moving behind the panel can't change which video gets reported.
  const [reportVideoId, setReportVideoId] = useState(null);
  const [reportReason, setReportReason] = useState(null);
  const [reportSending, setReportSending] = useState(false);
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

  // Back from the Blocked List screen after unblocking someone: start the feed over so their
  // videos come back.
  useEffect(() => {
    if (isFocused && takeFeedStale()) loadPage({reset: true});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFocused]);

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
      await apiClient.post('/auth/logout');
      console.log(`[logged out successfully ${new Date().toLocaleTimeString()}]`);
    } catch (err) {
      console.error(err);
    }
    setAccessToken(null);
    stopTrackingUploads();
    navigation.reset({
      index: 0,
      routes: [{name: 'LoginPage'}],
    });
  };

  const handleUpload = () => {
    setMenuVisible(false);
    navigation.navigate('UploadPage');
  };

  const handleMyVideos = () => {
    setMenuVisible(false);
    navigation.navigate('MyVideosPage');
  };

  const handleBlockedList = () => {
    setMenuVisible(false);
    navigation.navigate('BlockedListPage');
  };

  // shown in the ⋮ menu for the video currently on screen; undefined while the feed is empty
  const activeVideoId = posts[activeIndex]?.id;
  const activeUser = posts[activeIndex]?.user;

  // Turns the video on screen by 90° (delta -90 = left, 90 = right). Leaves the menu open so you
  // can turn it again, or back, while watching it behind the overlay.
  const handleRotate = delta => {
    if (!activeVideoId) return;
    setRotations(prev => ({...prev, [activeVideoId]: ((prev[activeVideoId] ?? 0) + delta + 360) % 360}));
  };

  // Blocks the owner of the video on screen, then drops all their videos from the loaded feed
  // (the server already filters them out of later pages). The next video slides into the
  // blocked one's place.
  const handleBlock = () => {
    setMenuVisible(false);
    if (!activeUser) return;
    Alert.alert(
      `Block @${activeUser.username}?`,
      "You won't see their videos anymore. They won't be notified.",
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Block',
          style: 'destructive',
          onPress: async () => {
            try {
              await blockUser(activeUser.id);
              const remaining = posts.filter(post => post.user.id !== activeUser.id);
              // land on the video that came after the blocked one: its new index is how many
              // kept videos were above it (their earlier videos are removed too)
              const kept = posts.slice(0, activeIndex).filter(post => post.user.id !== activeUser.id).length;
              const nextIndex = Math.min(kept, Math.max(remaining.length - 1, 0));
              setPosts(remaining);
              setActiveIndex(nextIndex);
              if (remaining.length > 0) {
                // wait for the shorter list to render before scrolling into it
                requestAnimationFrame(() => flatListRef.current?.scrollToIndex({index: nextIndex, animated: false}));
              } else if (hasMore) {
                // they filled the whole loaded feed — fetch more instead of showing it empty
                loadPage();
              }
            } catch (err) {
              Alert.alert('Could not block user', getErrorMessage(err));
            }
          },
        },
      ],
    );
  };

  const handleReport = () => {
    setMenuVisible(false);
    if (!activeVideoId) return;
    setReportReason(null);
    setReportVideoId(activeVideoId);
  };

  const closeReport = () => {
    if (!reportSending) setReportVideoId(null);
  };

  // Only records the report; the video stays in the feed, since the viewer has already seen it.
  const handleSendReport = async () => {
    if (!reportReason || reportSending) return;
    setReportSending(true);
    try {
      await reportVideo(reportVideoId, reportReason);
      setReportVideoId(null);
      Alert.alert('Thanks for reporting', "We'll review this video.");
    } catch (err) {
      Alert.alert('Could not report video', getErrorMessage(err));
    } finally {
      setReportSending(false);
    }
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
            <Post
              post={item}
              height={screenHeight}
              rotation={rotations[item.id] ?? 0}
              isActive={isFocused && index === activeIndex}
            />
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
            {activeVideoId && (
              <>
                <View style={styles.menuItem}>
                  {/* selectable: long-press to copy, without a clipboard library */}
                  <Text style={styles.menuIdText} selectable>ID: {activeVideoId}</Text>
                </View>
                <View style={styles.menuDivider} />
              </>
            )}
            <TouchableOpacity style={styles.menuItem} onPress={handleUpload} activeOpacity={0.7}>
              <Text style={styles.menuItemText}>Upload</Text>
            </TouchableOpacity>
            <View style={styles.menuDivider} />
            <TouchableOpacity style={styles.menuItem} onPress={handleMyVideos} activeOpacity={0.7}>
              <Text style={styles.menuItemText}>My Videos</Text>
            </TouchableOpacity>
            <View style={styles.menuDivider} />
            {activeVideoId && (
              <>
                <View style={[styles.menuItem, styles.menuRow]}>
                  <Text style={styles.menuItemText}>Rotate</Text>
                  <View style={styles.rotateButtons}>
                    <TouchableOpacity
                      style={styles.rotateButton}
                      onPress={() => handleRotate(-90)}
                      hitSlop={{top: 8, bottom: 8, left: 6, right: 6}}
                      accessibilityLabel="Rotate left"
                      activeOpacity={0.6}>
                      <Text style={styles.rotateGlyph}>↺</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.rotateButton}
                      onPress={() => handleRotate(90)}
                      hitSlop={{top: 8, bottom: 8, left: 6, right: 6}}
                      accessibilityLabel="Rotate right"
                      activeOpacity={0.6}>
                      <Text style={styles.rotateGlyph}>↻</Text>
                    </TouchableOpacity>
                  </View>
                </View>
                <View style={styles.menuDivider} />
              </>
            )}
            <TouchableOpacity style={styles.menuItem} onPress={handleBlockedList} activeOpacity={0.7}>
              <Text style={styles.menuItemText}>My Blocked List</Text>
            </TouchableOpacity>
            <View style={styles.menuDivider} />
            {activeUser && (
              <>
                <TouchableOpacity style={styles.menuItem} onPress={handleBlock} activeOpacity={0.7}>
                  <Text style={styles.menuItemText}>Block This User</Text>
                </TouchableOpacity>
                <View style={styles.menuDivider} />
              </>
            )}
            {activeVideoId && (
              <>
                <TouchableOpacity style={styles.menuItem} onPress={handleReport} activeOpacity={0.7}>
                  <Text style={styles.menuItemText}>Report Video</Text>
                </TouchableOpacity>
                <View style={styles.menuDivider} />
              </>
            )}
            <TouchableOpacity style={styles.menuItem} onPress={handleLogout} activeOpacity={0.7}>
              <Text style={styles.menuItemText}>Log Out</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      <Modal
        visible={reportVideoId !== null}
        transparent
        animationType="fade"
        supportedOrientations={['portrait', 'landscape']}
        onRequestClose={closeReport}>
        <Pressable style={[styles.menuOverlay, styles.reportOverlay]} onPress={closeReport}>
          {/* claims touches so taps inside the panel don't reach the overlay and close it */}
          <View style={styles.reportPanel} onStartShouldSetResponder={() => true}>
            <Text style={styles.reportTitle}>Report video</Text>
            {REPORT_REASONS.map(({value, label}) => {
              const selected = reportReason === value;
              return (
                <TouchableOpacity
                  key={value}
                  style={styles.reportOption}
                  onPress={() => setReportReason(value)}
                  disabled={reportSending}
                  accessibilityRole="radio"
                  accessibilityState={{selected}}
                  activeOpacity={0.7}>
                  <View style={[styles.radio, selected && styles.radioSelected]}>
                    {selected && <View style={styles.radioDot} />}
                  </View>
                  <Text style={styles.menuItemText}>{label}</Text>
                </TouchableOpacity>
              );
            })}
            <View style={styles.reportButtons}>
              <TouchableOpacity
                style={styles.reportButton}
                onPress={closeReport}
                disabled={reportSending}
                activeOpacity={0.7}>
                <Text style={styles.menuItemText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.reportButton, styles.reportSendButton, !reportReason && styles.reportSendDisabled]}
                onPress={handleSendReport}
                disabled={!reportReason || reportSending}
                activeOpacity={0.7}>
                {reportSending ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.menuItemText}>Send</Text>
                )}
              </TouchableOpacity>
            </View>
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
    backgroundColor: 'rgba(0,0,0,0.8)',
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
  // "Rotate" on the left, the ↺ ↻ buttons on the right; paddingVertical trimmed so the 28px
  // buttons keep the row the same height as the others
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    paddingVertical: 10,
  },
  rotateButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  rotateButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  rotateGlyph: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 20,
  },
  menuIdText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
  },
  menuDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  // Report Video panel: centred, same dark card look as the ⋮ menu
  reportOverlay: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  reportPanel: {
    width: '100%',
    maxWidth: 340,
    paddingVertical: 8,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.8)',
    borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  reportTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 6,
  },
  reportOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: {
    borderColor: '#FF3B30',
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#FF3B30',
  },
  reportButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 10,
  },
  reportButton: {
    minWidth: 80,
    height: 36,
    paddingHorizontal: 16,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  reportSendButton: {
    backgroundColor: '#FF3B30',
  },
  reportSendDisabled: {
    opacity: 0.4,
  },
});

export default Home;