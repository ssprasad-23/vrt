import React from "react";
import { useEffect, useState } from "react";
import {View, Text, Image, useWindowDimensions} from "react-native";
import Video from "react-native-video";
import styles from "./styles";
import { TouchableWithoutFeedback } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const Post = (props) => {

  const insets = useSafeAreaInsets();
  const screen = useWindowDimensions();
  const post = props.post;
  const [paused, setPaused] = useState(false);
  const [videoSize, setVideoSize] = useState(null);

  const onVideoLoad = ({naturalSize}) => {
    if (naturalSize?.width && naturalSize?.height) setVideoSize(naturalSize);
  };

  // Fill the screen ('cover') when the video and the screen have the same orientation — a
  // portrait video on an upright phone, a landscape one with the phone sideways. Otherwise show
  // it whole with black bars ('contain'): 'cover' would crop ~3/4 of it. 'contain' until the
  // size is known.
  // a quarter turn (rotation 90/270, from the ⋮ menu's Rotate Left/Right) swaps which side is longer
  const rotation = props.rotation ?? 0;
  const quarterTurn = rotation === 90 || rotation === 270;
  const videoIsPortrait = videoSize && (quarterTurn ? videoSize.width > videoSize.height : videoSize.height > videoSize.width);
  const screenIsPortrait = screen.height > screen.width;
  const resizeMode = videoSize && videoIsPortrait === screenIsPortrait ? 'cover' : 'contain';

  // Turned videos get an explicit box. For a quarter turn it's the container with width and height
  // swapped, centred, so once rotated it covers the container exactly.
  const containerWidth = screen.width;
  const containerHeight = props.height ?? screen.height;
  const rotatedStyle = rotation === 0 ? null : quarterTurn ? {
    width: containerHeight,
    height: containerWidth,
    left: (containerWidth - containerHeight) / 2,
    top: (containerHeight - containerWidth) / 2,
    right: undefined,
    bottom: undefined,
    transform: [{rotate: `${rotation}deg`}],
  } : {transform: [{rotate: '180deg'}]};

  // in landscape the Dynamic Island/notch is on a side edge and insets.top is 0
  const sideInsets = {paddingLeft: insets.left, paddingRight: insets.right};
  const avatarTop = Math.max(insets.top - 3, 12);
  // only the on-screen video in the feed plays; `paused` is just the user's tap-to-pause
  const isActive = props.isActive ?? true;

  // scrolling away resets tap-to-pause, so the video plays again when scrolled back to
  useEffect(() => {
    if (!isActive) setPaused(false);
  }, [isActive]);

  const onPlayPausePress = () => {
    setPaused(!paused);
  }

  return (
    <View style = {[styles.container, {height: containerHeight}]}>
      <TouchableWithoutFeedback onPress={onPlayPausePress}>
        <Video
        style = {[styles.video, rotatedStyle]}
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


      <View style = {[styles.uiContainer, sideInsets]}>
        <View style = {styles.bottomContainer}>
          <Text style = {styles.handle}>@{post.user.username}</Text>
          <Text style = {styles.description}>{post.description}</Text>
        </View>
      </View>

      {post.user.imageUri && (
        <Image style = {[styles.profilePic, {top: avatarTop, left: 16 + insets.left}]} source={{uri: post.user.imageUri}}/>
      )}
    </View>
  );
}

export default Post;
