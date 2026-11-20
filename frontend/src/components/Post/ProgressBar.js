import React from "react";
import { useRef, useState } from "react";
import { View, Text, PanResponder } from "react-native";
import styles from "./styles";

const clamp = (n) => Math.min(Math.max(n, 0), 1);

// 75 → "1:15", 3725 → "1:02:05"
const formatTime = (seconds) => {
  const s = Math.floor(seconds);
  const pad = (n) => String(n).padStart(2, "0");
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
};

// Thin bar across a feed video. Tap or drag it to seek; it thickens while dragging.
// `progress` (played) and `buffered` (loaded, drawn lighter underneath) are 0–1; the callbacks get
// the touched position as a 0–1 fraction. Above the bar: current time on the left, total on the right.
const ProgressBar = ({ progress, buffered = 0, duration = 0, onSeekStart, onSeek, onSeekEnd }) => {
  const [dragging, setDragging] = useState(false);
  const width = useRef(0);
  const startX = useRef(0);
  const fraction = useRef(0);
  // the PanResponder is created once, so it reads the latest callbacks through a ref
  const callbacks = useRef({});
  callbacks.current = { onSeekStart, onSeek, onSeekEnd };

  const finish = () => {
    setDragging(false);
    callbacks.current.onSeekEnd?.(fraction.current);
  };

  const panResponder = useRef(PanResponder.create({
    // claim the touch right away so the video's tap-to-pause doesn't fire
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    // keep the touch mid-scrub instead of handing it to the feed's vertical scroll
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: (e) => {
      startX.current = e.nativeEvent.locationX;
      fraction.current = width.current ? clamp(startX.current / width.current) : 0;
      setDragging(true);
      callbacks.current.onSeekStart?.();
      callbacks.current.onSeek?.(fraction.current);
    },
    onPanResponderMove: (e, gesture) => {
      if (!width.current) return;
      fraction.current = clamp((startX.current + gesture.dx) / width.current);
      callbacks.current.onSeek?.(fraction.current);
    },
    onPanResponderRelease: finish,
    onPanResponderTerminate: finish,
  })).current;

  const percent = `${clamp(progress) * 100}%`;

  return (
    <View>
      {/* outside the touch area, so they don't take touches meant for the bar */}
      <View style = {styles.progressTimes} pointerEvents = "none">
        <Text style = {styles.progressTime}>{formatTime(clamp(progress) * duration)}</Text>
        <Text style = {styles.progressTime}>{formatTime(duration)}</Text>
      </View>
      <View
        style = {styles.progressTouchArea}
        onLayout = {(e) => { width.current = e.nativeEvent.layout.width; }}
        {...panResponder.panHandlers}
      >
        <View style = {[styles.progressTrack, dragging && styles.progressTrackActive]}>
          <View style = {[styles.progressBuffered, {width: `${clamp(buffered) * 100}%`}]} />
          <View style = {[styles.progressFill, {width: percent}]} />
        </View>
        {dragging && <View style = {[styles.progressThumb, {left: percent}]} />}
      </View>
    </View>
  );
};

export default ProgressBar;
