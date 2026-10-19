
import React, {useEffect, useState} from 'react';
import {View, ActivityIndicator} from 'react-native';
import LoginPage from './src/screens/loginPage';
import SignupPage from './src/screens/signupPage';
import Home from './src/screens/home';
import UploadPage from './src/screens/uploadPage';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './src/context/AuthContext';
import { refreshAccessToken, setSessionExpiredHandler } from './src/api/client';
import './global.css'; // Import global CSS for NativeWind

const Stack = createNativeStackNavigator();
const navigationRef = createNavigationContainerRef();

// When a refresh token is rejected mid-session (expired, revoked, reused), send the user back
// to LoginPage — same reset as logging out, so there's no back-path into the feed.
setSessionExpiredHandler(() => {
  if (navigationRef.isReady()) {
    navigationRef.reset({index: 0, routes: [{name: 'LoginPage'}]});
  }
});

export default function App() {
  // null while checking for a saved session on launch, then the first screen to show
  const [initialRoute, setInitialRoute] = useState(null);

  // Auto-login: the refresh cookie survives app restarts (OS cookie store), so try a silent
  // refresh first. Any failure — no cookie, rejected, or offline — just shows LoginPage.
  useEffect(() => {
    refreshAccessToken()
      .then(() => setInitialRoute('Home'))
      .catch(() => setInitialRoute('LoginPage'));
  }, []);

  return (
    <SafeAreaProvider>
      <AuthProvider>
        {initialRoute === null ? (
          <View style={{flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center'}}>
            <ActivityIndicator color="#fff" size="large" />
          </View>
        ) : (
          <NavigationContainer ref={navigationRef}>
            <Stack.Navigator
              initialRouteName={initialRoute}
              screenOptions={{ headerShown: false }}>
              <Stack.Screen name="LoginPage" component={LoginPage}/>
              <Stack.Screen name="SignupPage" component={SignupPage} />
              <Stack.Screen name="Home" component={Home} />
              <Stack.Screen name="UploadPage" component={UploadPage} presentation="modal" />
            </Stack.Navigator>
          </NavigationContainer>
        )}
      </AuthProvider>
    </SafeAreaProvider>
  );
}
