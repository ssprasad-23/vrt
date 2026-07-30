import React, { useState, useMemo } from 'react';
import styles from './signupStyles';
import {
  SafeAreaView,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  ScrollView,
  ActivityIndicator,
  Alert,
  TouchableWithoutFeedback,
} from 'react-native';
import apiClient from '../api/client';
import { customArray } from 'country-codes-list';

const countryCodes = customArray(
  {
    iso: '{countryCode}',
    code: '+{countryCallingCode}',
    name: '{countryNameEn}',
    label: '{countryNameEn} (+{countryCallingCode})',
  },
  { filter: c => !!c.countryCallingCode, sortDataBy: 'countryNameEn' },
).filter((c, index, arr) => arr.findIndex(other => other.iso === c.iso) === index);

const defaultCountry = countryCodes.find(c => c.iso === 'US') || countryCodes[0];

const months = [
  { label: 'Jan', value: 1 },
  { label: 'Feb', value: 2 },
  { label: 'Mar', value: 3 },
  { label: 'Apr', value: 4 },
  { label: 'May', value: 5 },
  { label: 'Jun', value: 6 },
  { label: 'Jul', value: 7 },
  { label: 'Aug', value: 8 },
  { label: 'Sep', value: 9 },
  { label: 'Oct', value: 10 },
  { label: 'Nov', value: 11 },
  { label: 'Dec', value: 12 },
];

const getDaysInMonth = (month, year) => {
  if (!month || !year) return 31;
  return new Date(year, month, 0).getDate();
};

const generateYears = (count = 100) => {
  const current = new Date().getFullYear();
  return Array.from({ length: count }, (_, i) => current - i);
};

const DOBModal = ({ visible, onClose, month, day, year, setMonth, setDay, setYear }) => {
  const years = useMemo(() => generateYears(100), []);
  const days = useMemo(() => getDaysInMonth(month, year), [month, year]);

  return (
    <Modal visible={visible} animationType="fade" transparent>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.modalBackdrop}>
          <TouchableWithoutFeedback>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Select date of birth</Text>
              <View style={styles.pickersRow}>
                <ScrollView style={styles.pickerCol}>
                  {months.map(m => (
                    <TouchableOpacity
                      key={m.value}
                      style={[styles.pickerItem, month === m.value && styles.pickerItemActive]}
                      onPress={() => {
                        setMonth(m.value);
                        // adjust day if out-of-range
                        if (day > getDaysInMonth(m.value, year)) setDay(getDaysInMonth(m.value, year));
                      }}>
                      <Text style={styles.pickerText}>{m.label}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                <ScrollView style={styles.pickerCol}>
                  {Array.from({ length: days }, (_, i) => i + 1).map(d => (
                    <TouchableOpacity
                      key={d}
                      style={[styles.pickerItem, day === d && styles.pickerItemActive]}
                      onPress={() => setDay(d)}>
                      <Text style={styles.pickerText}>{d}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                <ScrollView style={styles.pickerCol}>
                  {years.map(y => (
                    <TouchableOpacity
                      key={y}
                      style={[styles.pickerItem, year === y && styles.pickerItemActive]}
                      onPress={() => {
                        setYear(y);
                        if (day > getDaysInMonth(month, y)) setDay(getDaysInMonth(month, y));
                      }}>
                      <Text style={styles.pickerText}>{y}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.btnGhost} onPress={onClose}>
                  <Text style={styles.btnGhostText}>Close</Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

const CountryCodeModal = ({ visible, onClose, selectedIso, onSelect }) => {
  return (
    <Modal visible={visible} animationType="fade" transparent>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.modalBackdrop}>
          <TouchableWithoutFeedback>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Select area code</Text>
              <ScrollView style={styles.codeList}>
                {countryCodes.map(c => (
                  <TouchableOpacity
                    key={c.iso}
                    style={[styles.pickerItem, selectedIso === c.iso && styles.pickerItemActive]}
                    onPress={() => {
                      onSelect(c);
                      onClose();
                    }}>
                    <Text style={styles.pickerText}>{c.label}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.btnGhost} onPress={onClose}>
                  <Text style={styles.btnGhostText}>Close</Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

const SignupPage = ({ navigation }) => {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [selectedCountry, setSelectedCountry] = useState(defaultCountry);
  const [phone, setPhone] = useState('');
  const [codeModalVisible, setCodeModalVisible] = useState(false);
  const [month, setMonth] = useState(null);
  const [day, setDay] = useState(null);
  const [year, setYear] = useState(null);
  const [dobModalVisible, setDobModalVisible] = useState(false);
  const [loading, setLoading] = useState(false);

  const formattedDob = useMemo(() => {
    if (!year || !month || !day) return '';
    const mm = String(month).padStart(2, '0');
    const dd = String(day).padStart(2, '0');
    return `${year}-${mm}-${dd}`;
  }, [year, month, day]);

  const validate = () => {
    if (!username.trim() || !email.trim() || !password || !confirmPassword || !phone.trim() || !month || !day || !year) {
      Alert.alert('Validation', 'Please fill all fields.');
      return false;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      Alert.alert('Validation', 'Invalid email address.');
      return false;
    }
    const phoneRegex = /^\d{6,14}$/;
    if (!phoneRegex.test(phone.trim())) {
      Alert.alert('Validation', 'Enter a valid phone number (digits only).');
      return false;
    }
    if (password.length < 8) {
      Alert.alert('Validation', 'Password must be at least 8 characters.');
      return false;
    }
    if (password !== confirmPassword) {
      Alert.alert('Validation', 'Passwords do not match.');
      return false;
    }
    return true;
  };

  const handleSignUp = async () => {
    if (!validate()) return;
    setLoading(true);

    try {
      const payload = {
        username: username.trim(),
        email: email.trim(),
        password,
        dob: formattedDob,
        phone_number: `${selectedCountry.code}${phone.trim()}`,
        country: selectedCountry.name,
      }

      const res = await apiClient.post('/userSignUp', payload);

      if (res.data?.errors) {
        throw new Error(res.data.errors.map(e => e.message).join('; '));
      }
      Alert.alert('Success', 'Account created. Please log in.', [{ text: 'OK', onPress: () => navigation.navigate('LoginPage') }]);
    } catch (err) {
      console.error(err);
      Alert.alert('Signup failed', err?.message || 'Network error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.container}>
        <Text style={styles.title}>Create account</Text>

        <TextInput
          style={styles.input}
          placeholder="Username"
          placeholderTextColor="#8E8E93"
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
        />

        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor="#8E8E93"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
        />

        <TextInput
          style={styles.input}
          placeholder="Password"
          placeholderTextColor="#8E8E93"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />

        <TextInput
          style={styles.input}
          placeholder="Confirm password"
          placeholderTextColor="#8E8E93"
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          secureTextEntry
        />

        <TouchableOpacity style={styles.input} activeOpacity={0.8} onPress={() => setDobModalVisible(true)}>
          <Text style={[styles.inputText, !(day && month && year) && { color: '#999' }]}>
            {day && month && year ? `${String(day).padStart(2, '0')}-${months.find(m => m.value === month)?.label}-${year}` : 'Date of birth'}
          </Text>
        </TouchableOpacity>

        <View style={styles.phoneRow}>
          <TouchableOpacity style={styles.phoneCode} activeOpacity={0.8} onPress={() => setCodeModalVisible(true)}>
            <Text style={styles.inputText}>{selectedCountry.code}</Text>
          </TouchableOpacity>

          <TextInput
            style={styles.phoneInput}
            placeholder="Phone number"
            placeholderTextColor="#8E8E93"
            value={phone}
            onChangeText={text => setPhone(text.replace(/[^0-9]/g, ''))}
            keyboardType="phone-pad"
          />
        </View>

        <TouchableOpacity
          style={[styles.primaryButton, loading && styles.buttonDisabled]}
          onPress={handleSignUp}
          activeOpacity={0.8}
          disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Sign up</Text>}
        </TouchableOpacity>

        <View style={styles.row}>
          <Text style={styles.muted}>Already have an account?</Text>
          <TouchableOpacity onPress={() => navigation.navigate('LoginPage')}>
            <Text style={styles.link}> Log in</Text>
          </TouchableOpacity>
        </View>
      </View>

      <DOBModal
        visible={dobModalVisible}
        onClose={() => setDobModalVisible(false)}
        month={month}
        day={day}
        year={year}
        setMonth={setMonth}
        setDay={setDay}
        setYear={setYear}
      />

      <CountryCodeModal
        visible={codeModalVisible}
        onClose={() => setCodeModalVisible(false)}
        selectedIso={selectedCountry.iso}
        onSelect={setSelectedCountry}
      />
    </SafeAreaView>
  );
};

export default SignupPage;