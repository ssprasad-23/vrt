import React, {useState} from 'react';
import {View, TouchableOpacity, StyleSheet, ActivityIndicator, Alert} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import Post from '../components/Post';
import {deleteVideo} from '../api/videos';
import {mediaUrl} from '../api/feed';
import {getErrorMessage} from '../api/errors';

// Plays one of your own videos full screen, the same way the feed does, with close and delete
// buttons on top. Opened from MyVideosPage with {video} (a GET /videos item that has an h264Key).
// After a delete it goes back; MyVideosPage reloads when it's shown again.
const MyVideoPlayerPage = ({navigation, route}) => {
  const {video} = route.params;
  const insets = useSafeAreaInsets();
  const [deleting, setDeleting] = useState(false);

  // Post's shape (see toPost in src/api/feed.js); the app doesn't know its own user id
  const post = {
    id: video.videoId,
    videoUri: mediaUrl(video.h264Key),
    description: video.description,
    category: video.category,
    user: {username: 'you'},
  };

  const handleDelete = () => {
    Alert.alert('Delete this video?', "It'll be removed from the feed. This can't be undone.", [
      {text: 'Cancel', style: 'cancel'},
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setDeleting(true);
          try {
            await deleteVideo(video.videoId);
            navigation.goBack();
          } catch (err) {
            // 404: already deleted — nothing left to show here
            if (err?.response?.status === 404) {
              navigation.goBack();
            } else {
              setDeleting(false);
              Alert.alert('Could not delete video', getErrorMessage(err));
            }
          }
        },
      },
    ]);
  };

  const top = Math.max(insets.top - 3, 12);

  return (
    <View style={styles.screen}>
      <Post post={post} isActive={!deleting} />

      <TouchableOpacity
        style={[styles.iconButton, {top, left: 16 + insets.left}]}
        onPress={() => navigation.goBack()}
        activeOpacity={0.7}>
        <MaterialCommunityIcons name="close" size={22} color="#fff" />
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.iconButton, {top, right: 16 + insets.right}]}
        onPress={handleDelete}
        disabled={deleting}
        activeOpacity={0.7}>
        {deleting ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <MaterialCommunityIcons name="trash-can-outline" size={22} color="#FF453A" />
        )}
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#000',
  },
  iconButton: {
    position: 'absolute',
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
});

export default MyVideoPlayerPage;
