import React, {useState} from 'react';
import {
  SafeAreaView,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import {Picker} from '@react-native-picker/picker';
import {launchImageLibrary} from 'react-native-image-picker';
import Video from 'react-native-video';
import styles from './uploadStyles';
import apiClient from '../api/client';
import {getErrorMessage} from '../api/errors';
import {trackUpload} from '../api/uploadStatus';
import {
  MAX_UPLOAD_BYTES,
  MAX_UPLOAD_MB,
  MAX_VIDEO_DURATION_SECONDS,
} from '../api/uploadLimits';

const categories = ['Videos'];

const UploadPage = ({navigation}) => {
  const [video, setVideo] = useState(null);
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState(categories[0]);
  const [uploading, setUploading] = useState(false);

  const handlePickVideo = async () => {
    const result = await launchImageLibrary({mediaType: 'video'});
    if (result.didCancel || result.errorCode) return;
    const asset = result.assets?.[0];
    if (!asset) return;
    // turn away over-limit videos now, not after a long upload (the server checks again)
    if (asset.duration > MAX_VIDEO_DURATION_SECONDS + 1) {
      Alert.alert(
        'Video too long',
        `Videos can be up to ${MAX_VIDEO_DURATION_SECONDS} seconds. This one is ${Math.round(asset.duration)} seconds.`,
      );
      return;
    }
    if (asset.fileSize > MAX_UPLOAD_BYTES) {
      Alert.alert('Video too large', `Videos can be up to ${MAX_UPLOAD_MB} MB.`);
      return;
    }
    setVideo(asset);
  };

  const handleUpload = async () => {
    if (!video) {
      Alert.alert('Validation', 'Please select a video to upload.');
      return;
    }
    if (!description.trim()) {
      Alert.alert('Validation', 'Please add a description.');
      return;
    }

    setUploading(true);
    try {
      const initRes = await apiClient.post('/videos/upload-init', {
        description,
        category,
        sizeBytes: video.fileSize,
        durationSeconds: video.duration,
      });
      const {videoId, uploadUrl} = initRes.data.data;
      console.log('signed url received from upload-init');

      const fileResponse = await fetch(video.uri);
      const fileBlob = await fileResponse.blob();

      const putRes = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {'Content-Type': 'video/mp4'},
        body: fileBlob,
      });
      if (!putRes.ok) {
        throw new Error(`Upload to storage failed (${putRes.status})`);
      }

      await apiClient.post(`/videos/${videoId}/complete`);

      // Uploaded isn't live yet: it still has to be transcoded, and that can fail (e.g. an
      // unreadable file). trackUpload tells the user which way it went once it's done.
      trackUpload(videoId);
      Alert.alert(
        'Uploaded',
        "We're processing your video. We'll let you know when it's live.",
        [{text: 'OK', onPress: () => navigation.goBack()}],
      );
    } catch (err) {
      Alert.alert('Upload failed', getErrorMessage(err));
    } finally {
      setUploading(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen}>
      <TouchableOpacity
        style={styles.closeButton}
        onPress={() => navigation.navigate('Home')}
        activeOpacity={0.8}>
        <Text style={styles.closeButtonText}>‹</Text>
      </TouchableOpacity>

      <View style={styles.container}>
        <Text style={styles.title}>Upload video</Text>

        <TouchableOpacity
          style={styles.videoPicker}
          activeOpacity={0.8}
          onPress={handlePickVideo}>
          {video ? (
            <>
              <Video
                source={{uri: video.uri}}
                style={styles.videoPreview}
                paused
                resizeMode="cover"
              />
              <View style={styles.changeVideoBadge}>
                <Text style={styles.changeVideoBadgeText}>Change video</Text>
              </View>
            </>
          ) : (
            <>
              <Text style={styles.videoPickerText}>Tap to select a video</Text>
              <Text style={styles.videoPickerSubtext}>
                From your camera roll
              </Text>
            </>
          )}
        </TouchableOpacity>

        <Text style={styles.label}>Description</Text>
        <TextInput
          style={styles.descriptionInput}
          placeholder="Say something about your video..."
          placeholderTextColor="#8E8E93"
          value={description}
          onChangeText={setDescription}
          multiline
          maxLength={100}
          textAlignVertical="top"
        />

        <Text style={styles.label}>Category</Text>
        <View style={styles.pickerWrapper}>
          <Picker
            selectedValue={category}
            onValueChange={setCategory}
            style={styles.picker}
            itemStyle={styles.pickerItem}
            dropdownIconColor="#fff">
            {categories.map(c => (
              <Picker.Item key={c} label={c} value={c} color="#fff" />
            ))}
          </Picker>
        </View>

        <TouchableOpacity
          style={[styles.primaryButton, uploading && styles.buttonDisabled]}
          onPress={handleUpload}
          activeOpacity={0.8}
          disabled={uploading}>
          {uploading ? (
            <ActivityIndicator color="#000" />
          ) : (
            <Text style={styles.primaryButtonText}>Upload</Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

export default UploadPage;
