import React from "react";
import { useState } from "react";
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
          resizeMode = 'cover'
          repeat = {true}
          paused = {paused}
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

      <Image style = {[styles.profilePic, {top: insets.top - 3}]} source={{uri: post.user.imageUri}}/>
    </View>
  );
}

export default Post;
