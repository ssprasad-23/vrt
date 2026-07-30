
import React from 'react';
import LoginPage from './src/screens/loginPage';
import SignupPage from './src/screens/signupPage';
import Home from './src/screens/home';
import UploadPage from './src/screens/uploadPage';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './src/context/AuthContext';
import './global.css'; // Import global CSS for NativeWind

const Stack = createNativeStackNavigator();

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <NavigationContainer>
          <Stack.Navigator
            screenOptions={{ headerShown: false }}>
            <Stack.Screen name="LoginPage" component={LoginPage}/>
            <Stack.Screen name="SignupPage" component={SignupPage} />
            <Stack.Screen name="Home" component={Home} />
            <Stack.Screen name="UploadPage" component={UploadPage} presentation="modal" />
          </Stack.Navigator>
        </NavigationContainer>
      </AuthProvider>
    </SafeAreaProvider>
  );
}