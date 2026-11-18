import React, {useCallback, useRef, useState} from 'react';
import {
  View,
  FlatList,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useFocusEffect} from '@react-navigation/native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import {fetchMyVideos, deleteVideo} from '../api/videos';
import {mediaUrl} from '../api/feed';
import {getErrorMessage} from '../api/errors';

const isProcessing = status => status === 'pending' || status === 'uploaded';

const THUMB_WIDTH = 120;

const STATUS_COLORS = {live: '#30D158', processing: '#FFD60A', failed: '#FF453A'};

// "just now", "5m ago", "3h ago", "2d ago", then a short date once it's over a week old
const timeAgo = iso => {
  const date = new Date(iso);
  const seconds = Math.max(0, (Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 7 * 86400) return `${Math.floor(seconds / 86400)}d ago`;
  return date.toLocaleDateString(undefined, {day: 'numeric', month: 'short', year: 'numeric'});
};

// Your own uploads as a list, newest first: a 16:9 thumbnail, description, age and status, with a delete
// button on each row. Opened from Home's ⋮ menu. Tap a live video to watch it (MyVideoPlayerPage).
// Reloads whenever it's shown again, so deletes from the player and finished processing show up.
const MyVideosPage = ({navigation}) => {
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  // video ids with a delete request in flight, so a row can't be deleted twice
  const [deleting, setDeleting] = useState([]);
  // thumbnails that failed to load (e.g. videos from before frames were saved)
  const [brokenThumbs, setBrokenThumbs] = useState([]);
  const loadedOnce = useRef(false);

  // The full-screen spinner only shows on the first load; later reloads keep the list up.
  const load = useCallback(async () => {
    if (!loadedOnce.current) setLoading(true);
    try {
      setVideos(await fetchMyVideos());
      setError(null);
      loadedOnce.current = true;
    } catch (err) {
      if (!loadedOnce.current) setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const removeVideo = videoId => setVideos(prev => prev.filter(video => video.videoId !== videoId));

  const handleDelete = videoId => {
    Alert.alert('Delete this video?',"This video will be permanently deleted.", [
      {text: 'Cancel', style: 'cancel'},
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setDeleting(prev => [...prev, videoId]);
          try {
            await deleteVideo(videoId);
            removeVideo(videoId);
          } catch (err) {
            // 404: already deleted (e.g. from another device) — drop it from the list anyway
            if (err?.response?.status === 404) {
              removeVideo(videoId);
            } else {
              Alert.alert('Could not delete video', getErrorMessage(err));
            }
          } finally {
            setDeleting(prev => prev.filter(id => id !== videoId));
          }
        },
      },
    ]);
  };

  const handlePress = video => {
    if (video.status === 'failed') {
      Alert.alert("This video couldn't be posted", video.failureReason || 'Video could not be processed', [
        {text: 'OK', style: 'cancel'},
        {text: 'Delete', style: 'destructive', onPress: () => handleDelete(video.videoId)},
      ]);
    } else if (isProcessing(video.status)) {
      Alert.alert('Still processing', "It'll show up here and in the feed once it's ready.");
    } else {
      navigation.navigate('MyVideoPlayerPage', {video});
    }
  };

  const renderRow = ({item}) => {
    const processing = isProcessing(item.status);
    const failed = item.status === 'failed';
    const isDeleting = deleting.includes(item.videoId);
    const showThumb = item.thumbnailKey && !brokenThumbs.includes(item.videoId);
    const statusColor = STATUS_COLORS[failed ? 'failed' : processing ? 'processing' : 'live'];
    const statusText = failed
      ? `Failed${item.failureReason ? `: ${item.failureReason}` : ''}`
      : processing
        ? 'Processing'
        : 'Live';

    return (
      <TouchableOpacity
        style={[styles.row, isDeleting && styles.rowBusy]}
        onPress={() => handlePress(item)}
        disabled={isDeleting}
        activeOpacity={0.7}>
        <View style={styles.thumb}>
          {showThumb ? (
            // 'contain' so nothing is cropped: landscape clips fill the 16:9 frame, portrait ones
            // sit in it with black bars on the sides, like a cinema screen
            <Image
              style={StyleSheet.absoluteFill}
              resizeMode="contain"
              source={{uri: mediaUrl(item.thumbnailKey)}}
              onError={() => setBrokenThumbs(prev => [...prev, item.videoId])}
            />
          ) : processing ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : failed ? (
            <MaterialCommunityIcons name="alert-circle-outline" size={22} color={STATUS_COLORS.failed} />
          ) : (
            <MaterialCommunityIcons name="play" size={24} color="rgba(255,255,255,0.6)" />
          )}
        </View>

        <View style={styles.details}>
          <Text style={[styles.description, !item.description && styles.placeholder]} numberOfLines={2}>
            {item.description || 'No description'}
          </Text>
          <Text style={styles.meta}>{timeAgo(item.createdAt)}</Text>
          <View style={styles.statusLine}>
            <View style={[styles.statusDot, {backgroundColor: statusColor}]} />
            <Text style={[styles.statusText, {color: statusColor}]} numberOfLines={1}>
              {statusText}
            </Text>
          </View>
        </View>

        {/* still processing: the server answers 409, so the button is dimmed and disabled */}
        <TouchableOpacity
          style={[styles.deleteButton, processing && styles.deleteDisabled]}
          onPress={() => handleDelete(item.videoId)}
          disabled={processing || isDeleting}
          hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}
          activeOpacity={0.6}>
          {isDeleting ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <MaterialCommunityIcons name="trash-can-outline" size={22} color={STATUS_COLORS.failed} />
          )}
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <View style={styles.titleBlock}>
          <Text style={styles.title}>My Videos</Text>
          {!loading && !error && videos.length > 0 && (
            <Text style={styles.count}>
              {videos.length} {videos.length === 1 ? 'video' : 'videos'}
            </Text>
          )}
        </View>
        <TouchableOpacity onPress={() => navigation.goBack()} activeOpacity={0.7} style={styles.doneButton}>
          <Text style={styles.doneText}>Done</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color="#fff" size="large" />
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Text style={styles.emptyText}>{error}</Text>
          <TouchableOpacity style={styles.pillButton} onPress={load} activeOpacity={0.8}>
            <Text style={styles.pillText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={videos}
          keyExtractor={item => item.videoId}
          renderItem={renderRow}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          contentContainerStyle={videos.length === 0 && styles.centered}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" />}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>You haven't posted any clips yet</Text>
              <TouchableOpacity
                style={styles.pillButton}
                onPress={() => navigation.navigate('UploadPage')}
                activeOpacity={0.8}>
                <Text style={styles.pillText}>Upload</Text>
              </TouchableOpacity>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.15)',
  },
  titleBlock: {
    alignItems: 'center',
  },
  title: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
  count: {
    color: '#8E8E93',
    fontSize: 12,
    marginTop: 2,
  },
  doneButton: {
    position: 'absolute',
    right: 16,
  },
  doneText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  centered: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  rowBusy: {
    opacity: 0.5,
  },
  thumb: {
    width: THUMB_WIDTH,
    aspectRatio: 16 / 9,
    borderRadius: 6,
    backgroundColor: '#000',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.2)',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  details: {
    flex: 1,
    marginLeft: 14,
    marginRight: 8,
  },
  description: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  placeholder: {
    color: '#8E8E93',
    fontWeight: '400',
  },
  meta: {
    color: '#8E8E93',
    fontSize: 13,
    marginTop: 4,
  },
  statusLine: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    marginRight: 6,
  },
  statusText: {
    flexShrink: 1,
    fontSize: 13,
    fontWeight: '600',
  },
  deleteButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,69,58,0.12)',
  },
  deleteDisabled: {
    opacity: 0.3,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 16 + THUMB_WIDTH + 14,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  emptyState: {
    alignItems: 'center',
  },
  emptyText: {
    color: '#8E8E93',
    fontSize: 15,
    marginBottom: 16,
    textAlign: 'center',
  },
  pillButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  pillText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
});

export default MyVideosPage;
