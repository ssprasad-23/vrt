import React from "react";
import { useEffect, useState } from "react";
import {View, Text, Image, TouchableOpacity} from "react-native";
import Video from "react-native-video";
import styles from "./styles";
import { TouchableWithoutFeedback } from "react-native";
import Entypo from "react-native-vector-icons/Entypo";
import MaterialCommunityIcons from "react-native-vector-icons/MaterialCommunityIcons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const Post = (props) => {

  const insets = useSafeAreaInsets();
  const [post, setPost] = useState(props.post);
  const [isLiked, setIsLiked] = useState(false);
  const [isDisliked, setIsDisliked] = useState(false);
  const [paused, setPaused] = useState(false);
  // portrait videos fill the screen ('cover'); landscape ones are shown whole with black bars
  // ('contain') instead of having ~3/4 of their width cropped. 'contain' until the size is known.
  const [resizeMode, setResizeMode] = useState('contain');

  const onVideoLoad = ({naturalSize}) => {
    if (naturalSize?.width && naturalSize?.height) {
      setResizeMode(naturalSize.height > naturalSize.width ? 'cover' : 'contain');
    }
  };
  // only the on-screen video in the feed plays; `paused` is just the user's tap-to-pause
  const isActive = props.isActive ?? true;

  // scrolling away resets tap-to-pause, so the video plays again when scrolled back to
  useEffect(() => {
    if (!isActive) setPaused(false);
  }, [isActive]);

  const onPlayPausePress = () => {
    setPaused(!paused);
  }

  const onLikePress = () => {
    setPost({
      ...post,
      likes: post.likes + (isLiked ? -1 : 1),
      dislikes: isDisliked ? post.dislikes - 1 : post.dislikes,
    });
    setIsLiked(!isLiked);
    setIsDisliked(false);
  }

  const onDislikePress = () => {
    setPost({
      ...post,
      dislikes: post.dislikes + (isDisliked ? -1 : 1),
      likes: isLiked ? post.likes - 1 : post.likes,
    });
    setIsDisliked(!isDisliked);
    setIsLiked(false);
  }

  return (
    <View style = {styles.container}>
      <TouchableWithoutFeedback onPress={onPlayPausePress}>
        <Video
        style = {styles.video}
          source = {{ uri: post.videoUri }}
          // source = {{ uri: 'https://assets.mixkit.co/videos/1259/1259-720.mp4' }}
          // source = {{ uri: 'https://www.learningcontainer.com/wp-content/uploads/2020/05/sample-mp4-file.mp4' }}
          onError={(e) => console.log(e)}
          onLoad = {onVideoLoad}
          resizeMode = {resizeMode}
          repeat = {true}
          paused = {paused || !isActive}
          // play sound even when the phone's silent switch is on (iOS mutes it by default)
          ignoreSilentSwitch = 'ignore'
          // must be explicit: when unset, react-native-video's iOS code selects NO audio track
          // (type "" → select(nil)), so the video plays silent. 'system' picks the file's audio track.
          selectedAudioTrack = {{type: 'system'}}
        />
      </TouchableWithoutFeedback>


      <View style = {styles.uiContainer}>
        <View style = {styles.rightContainer}>
          <TouchableOpacity style={styles.actionButton} onPress={onLikePress}>
            <Entypo style = {styles.heart} name='heart' size={30} color={isLiked ? '#FF3B30' : 'white'}/>
            <Text style={styles.actionLabel}>{post.likes}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButton} onPress={onDislikePress}>
            <MaterialCommunityIcons style = {styles.heart} name='heart-broken' size={30} color={isDisliked ? '#000000' : 'white'}/>
            <Text style={styles.actionLabel}>{post.dislikes}</Text>
          </TouchableOpacity>
        </View>

        <View style = {styles.bottomContainer}>
          <Text style = {styles.handle}>@{post.user.username}</Text>
          <Text style = {styles.description}>{post.description}</Text>
        </View>
      </View>

      {post.user.imageUri ? (
        <Image style = {[styles.profilePic, {top: insets.top - 3}]} source={{uri: post.user.imageUri}}/>
      ) : (
        <View style = {[styles.profilePic, styles.profilePlaceholder, {top: insets.top - 3}]}>
          <Text style = {styles.profileInitial}>{post.user.username?.[0]?.toUpperCase()}</Text>
        </View>
      )}
    </View>
  );
}

export default Post;
