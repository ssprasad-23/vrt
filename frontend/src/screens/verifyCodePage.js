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

// Step 2 of password reset: enter the emailed code. A correct code gets a one-time reset
// token from the server, which the next screen needs to set the new password.
const VerifyCodePage = ({navigation, route}) => {
  const {email} = route.params;
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);

  const handleVerify = async () => {
    if (!/^\d{6}$/.test(code)) {
      Alert.alert('Validation', 'Please enter the 6-digit code from your email.');
      return;
    }

    setLoading(true);
    try {
      const res = await apiClient.post('/auth/verifyResetCode', {email, code});
      // replace, so going back from the new password screen doesn't return to a spent code
      navigation.replace('NewPasswordPage', {resetToken: res.data.data.resetToken});
    } catch (err) {
      setCode('');
      Alert.alert('Verification failed', getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setResending(true);
    try {
      await apiClient.post('/auth/forgotPassword', {email});
      setCode('');
      Alert.alert('Code sent', 'If that email is registered, a new code is on its way. Any earlier code no longer works.');
    } catch (err) {
      Alert.alert('Could not resend code', getErrorMessage(err));
    } finally {
      setResending(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-black">
      <View className="flex-1 justify-center px-6">
        <Text className="text-3xl font-semibold text-white text-center mb-1">
          Enter Code
        </Text>
        <Text className="text-base text-gray-400 text-center mb-10">
          We sent a 6-digit code to {email}. It expires in 10 minutes.
        </Text>

        <View className="w-full bg-[#1c1c1e] rounded-2xl px-6 py-8 border border-white/10">
          <TextInput
            className="w-full h-14 rounded-xl px-4 bg-[#2c2c2e] mb-6 text-white text-2xl text-center tracking-[8px]"
            placeholder="000000"
            placeholderTextColor="#8E8E93"
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChangeText={text => setCode(text.replace(/\D/g, ''))}
          />

          <TouchableOpacity
            className="w-full h-12 bg-white rounded-xl justify-center items-center"
            onPress={handleVerify}
            activeOpacity={0.85}
            disabled={loading}>
            <Text className="text-black text-base font-semibold">
              {loading ? 'Verifying...' : 'Verify Code'}
            </Text>
          </TouchableOpacity>

          <View className="flex-row justify-center mt-6">
            <Text className="text-gray-400">Didn't get it?</Text>
            <TouchableOpacity onPress={handleResend} disabled={resending}>
              <Text className="text-white font-semibold">
                {resending ? ' Sending...' : ' Resend code'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
};

export default VerifyCodePage;
