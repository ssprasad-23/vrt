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
import {getErrorMessage} from '../api/errors';

// Step 3 of password reset: set the new password using the reset token from VerifyCodePage.
const NewPasswordPage = ({navigation, route}) => {
  const {resetToken} = route.params;
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const backToLogin = () => navigation.reset({index: 0, routes: [{name: 'LoginPage'}]});

  const handleSave = async () => {
    if (!password || !confirmPassword) {
      Alert.alert('Validation', 'Please fill in both fields.');
      return;
    }
    if (password.length < 8) {
      Alert.alert('Validation', 'Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert('Validation', 'Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const res = await apiClient.post('/auth/resetPassword', {resetToken, newPassword: password});
      Alert.alert('Password updated', res.data.message, [{text: 'OK', onPress: backToLogin}]);
    } catch (err) {
      Alert.alert('Could not update password', getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-black">
      <View className="flex-1 justify-center px-6">
        <Text className="text-3xl font-semibold text-white text-center mb-1">
          New Password
        </Text>
        <Text className="text-base text-gray-400 text-center mb-10">
          Choose a new password for your account
        </Text>

        <View className="w-full bg-[#1c1c1e] rounded-2xl px-6 py-8 border border-white/10">
          <TextInput
            className="w-full h-12 rounded-xl px-4 bg-[#2c2c2e] mb-3 text-white"
            placeholder="New password"
            placeholderTextColor="#8E8E93"
            secureTextEntry
            textContentType="newPassword"
            value={password}
            onChangeText={setPassword}
          />

          <TextInput
            className="w-full h-12 rounded-xl px-4 bg-[#2c2c2e] mb-6 text-white"
            placeholder="Confirm new password"
            placeholderTextColor="#8E8E93"
            secureTextEntry
            textContentType="newPassword"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
          />

          <TouchableOpacity
            className="w-full h-12 bg-white rounded-xl justify-center items-center"
            onPress={handleSave}
            activeOpacity={0.85}
            disabled={loading}>
            <Text className="text-black text-base font-semibold">
              {loading ? 'Saving...' : 'Set New Password'}
            </Text>
          </TouchableOpacity>

          <View className="flex-row justify-center mt-6">
            <TouchableOpacity onPress={backToLogin}>
              <Text className="text-white font-semibold">Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
};

export default NewPasswordPage;
