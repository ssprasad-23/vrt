import React, {useState} from "react";
import {View, FlatList, Dimensions, StatusBar, TouchableOpacity, Text, StyleSheet, Modal, Pressable} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Post from "../components/Post";
import posts from "../data/sampledata";
import apiClient from "../api/client";
import {useAuth} from "../context/AuthContext";

const Home = ({navigation}) => {
  const insets = useSafeAreaInsets();
  const [menuVisible, setMenuVisible] = useState(false);
  const {setAccessToken} = useAuth();

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
      <FlatList
        data={posts}
        keyExtractor={item => item.id}
        renderItem={({item}) => <Post post={item} />}
        snapToInterval={Dimensions.get('window').height}
        snapToAlignment="start"
        decelerationRate="fast"
        showsVerticalScrollIndicator={false}
      />

      <TouchableOpacity
        style={[styles.menuButton, {top: insets.top - 3}]}
        onPress={() => setMenuVisible(true)}
        activeOpacity={0.8}>
        <Text style={styles.menuDots}>⋮</Text>
      </TouchableOpacity>

      <Modal
        visible={menuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuVisible(false)}>
        <Pressable style={styles.menuOverlay} onPress={() => setMenuVisible(false)}>
          <View style={[styles.menuDropdown, {top: insets.top + 34}]}>
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