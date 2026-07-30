import React, {useState} from 'react';
import {
  SafeAreaView,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
} from 'react-native';
import apiClient from '../api/client';
import {useAuth} from '../context/AuthContext';

const LoginPage = ({navigation}) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const {setAccessToken} = useAuth();

  const handleSignIn = async () => {
    if (!username.trim() || !password) {
      Alert.alert('Validation', 'Please enter your username and password.');
      return;
    }

    setLoading(true);
    try {
      const res = await apiClient.post('/userLogin', {
        username: username.trim(),
        password,
      });

      if (res.data?.errors) {
        throw new Error(res.data.errors.map(e => e.message).join('; '));
      }

      console.log(
        `[${new Date().toLocaleTimeString()}] access token received from login:`,
        res.data.data.accessToken,
      );
      setAccessToken(res.data.data.accessToken);

      navigation.reset({
        index: 0,
        routes: [{name: 'Home'}],
      });
    } catch (err) {
      console.error(err);
      Alert.alert('Login failed', err?.message || 'Network error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-black">
      <View className="flex-1 justify-center px-6">
        <Text className="text-3xl font-semibold text-white text-center mb-1">
          Welcome Back
        </Text>
        <Text className="text-base text-gray-400 text-center mb-10">
          Sign in to continue
        </Text>

        <View className="w-full bg-[#1c1c1e] rounded-2xl px-6 py-8 border border-white/10">
          <TextInput
            className="w-full h-12 rounded-xl px-4 bg-[#2c2c2e] mb-3 text-white"
            placeholder="Username"
            placeholderTextColor="#8E8E93"
            autoCapitalize="none"
            value={username}
            onChangeText={setUsername}
          />

          <TextInput
            className="w-full h-12 rounded-xl px-4 bg-[#2c2c2e] mb-6 text-white"
            placeholder="Password"
            placeholderTextColor="#8E8E93"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />

          <TouchableOpacity
            className="w-full h-12 bg-white rounded-xl justify-center items-center"
            onPress={handleSignIn}
            activeOpacity={0.85}
            disabled={loading}>
            <Text className="text-black text-base font-semibold">
              {loading ? 'Signing in...' : 'Sign In'}
            </Text>
          </TouchableOpacity>

          <View className="flex-row justify-center mt-6">
            <Text className="text-gray-400">Don't have an account?</Text>
            <TouchableOpacity onPress={() => navigation.navigate('SignupPage')}>
              <Text className="text-white font-semibold"> Sign Up</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
};

export default LoginPage;