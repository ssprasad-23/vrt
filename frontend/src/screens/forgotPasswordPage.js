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

// Step 1 of password reset: ask for the email, have a 6-digit code sent to it.
const ForgotPasswordPage = ({navigation}) => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSendCode = async () => {
    const trimmed = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      Alert.alert('Validation', 'Please enter a valid email address.');
      return;
    }

    setLoading(true);
    try {
      // The server answers the same whether or not the email has an account
      await apiClient.post('/auth/forgotPassword', {email: trimmed});
      navigation.navigate('VerifyCodePage', {email: trimmed});
    } catch (err) {
      Alert.alert('Could not send code', getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-black">
      <View className="flex-1 justify-center px-6">
        <Text className="text-3xl font-semibold text-white text-center mb-1">
          Forgot Password
        </Text>
        <Text className="text-base text-gray-400 text-center mb-10">
          Enter your email and we'll send you a 6-digit code
        </Text>

        <View className="w-full bg-[#1c1c1e] rounded-2xl px-6 py-8 border border-white/10">
          <TextInput
            className="w-full h-12 rounded-xl px-4 bg-[#2c2c2e] mb-6 text-white"
            placeholder="Email"
            placeholderTextColor="#8E8E93"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="emailAddress"
            value={email}
            onChangeText={setEmail}
          />

          <TouchableOpacity
            className="w-full h-12 bg-white rounded-xl justify-center items-center"
            onPress={handleSendCode}
            activeOpacity={0.85}
            disabled={loading}>
            <Text className="text-black text-base font-semibold">
              {loading ? 'Sending...' : 'Send Code'}
            </Text>
          </TouchableOpacity>

          <View className="flex-row justify-center mt-6">
            <TouchableOpacity onPress={() => navigation.goBack()}>
              <Text className="text-white font-semibold">Back to Sign In</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
};

export default ForgotPasswordPage;
