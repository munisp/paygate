/**
 * BiometricAuthScreen — React Native
 *
 * Production biometric authentication wired to Keycloak token exchange.
 *
 * Flow:
 *  1. On mount, check if a refresh_token is stored in the device secure enclave.
 *  2. If present, prompt FaceID / TouchID / fingerprint.
 *  3. On success, call POST /v1/auth/biometric-token to exchange the refresh_token
 *     for a fresh access_token.
 *  4. Store the new tokens and navigate to Dashboard.
 *  5. If no stored token, fall back to standard OAuth login.
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  SafeAreaView,
  StatusBar,
  Alert,
  Platform,
} from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';

const BRIDGE_URL = process.env.EXPO_PUBLIC_BRIDGE_URL ?? 'https://api.paygate.ng';
const STORAGE_KEY_REFRESH = 'paygate_refresh_token';
const STORAGE_KEY_ACCESS  = 'paygate_access_token';
const STORAGE_KEY_DEVICE  = 'paygate_device_id';

const C = {
  primary:    '#6366F1',
  bg:         '#0F172A',
  card:       '#1E293B',
  text:       '#F1F5F9',
  muted:      '#94A3B8',
  success:    '#10B981',
  error:      '#EF4444',
  border:     '#334155',
};

type BiometricState =
  | 'checking'
  | 'unavailable'
  | 'no_stored_token'
  | 'ready'
  | 'authenticating'
  | 'exchanging'
  | 'success'
  | 'error';

export default function BiometricAuthScreen() {
  const navigation = useNavigation<any>();
  const [state, setState] = useState<BiometricState>('checking');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [biometricType, setBiometricType] = useState<string>('Biometrics');

  // ─── Initialise ──────────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const hasHardware = await LocalAuthentication.hasHardwareAsync();
        const isEnrolled  = await LocalAuthentication.isEnrolledAsync();
        const types       = await LocalAuthentication.supportedAuthenticationTypesAsync();

        if (!hasHardware || !isEnrolled) {
          setState('unavailable');
          return;
        }

        // Determine friendly label
        if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
          setBiometricType('Face ID');
        } else if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
          setBiometricType('Fingerprint');
        }

        const storedToken = await AsyncStorage.getItem(STORAGE_KEY_REFRESH);
        setState(storedToken ? 'ready' : 'no_stored_token');
      } catch (e) {
        setState('unavailable');
      }
    })();
  }, []);

  // ─── Biometric → Keycloak token exchange ─────────────────────────────────────
  const handleBiometricLogin = useCallback(async () => {
    setErrorMsg(null);
    setState('authenticating');

    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: `Use ${biometricType} to access PayGate`,
        cancelLabel: 'Use Password',
        disableDeviceFallback: false,
        fallbackLabel: 'Use Passcode',
      });

      if (!result.success) {
        setState('ready');
        if (result.error !== 'user_cancel' && result.error !== 'system_cancel') {
          setErrorMsg('Biometric authentication failed. Please try again.');
        }
        return;
      }

      // Biometric passed — exchange the stored refresh_token
      setState('exchanging');
      const refreshToken = await AsyncStorage.getItem(STORAGE_KEY_REFRESH);
      if (!refreshToken) {
        setState('no_stored_token');
        return;
      }

      let deviceId = await AsyncStorage.getItem(STORAGE_KEY_DEVICE);
      if (!deviceId) {
        deviceId = `rn-${Platform.OS}-${Date.now()}`;
        await AsyncStorage.setItem(STORAGE_KEY_DEVICE, deviceId);
      }

      const response = await fetch(`${BRIDGE_URL}/v1/auth/biometric-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken, device_id: deviceId }),
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Token exchange failed (${response.status}): ${body}`);
      }

      const tokens = await response.json();

      // Persist new tokens
      await AsyncStorage.multiSet([
        [STORAGE_KEY_ACCESS,  tokens.access_token],
        [STORAGE_KEY_REFRESH, tokens.refresh_token ?? refreshToken],
      ]);

      setState('success');
      navigation.replace('Dashboard');
    } catch (e: any) {
      setState('error');
      setErrorMsg(e?.message ?? 'Authentication failed. Please try again.');
    }
  }, [biometricType, navigation]);

  // ─── Fallback to password login ───────────────────────────────────────────────
  const handleFallback = useCallback(() => {
    navigation.navigate('AuthScreen');
  }, [navigation]);

  // ─── Render ───────────────────────────────────────────────────────────────────
  const isLoading = state === 'authenticating' || state === 'exchanging' || state === 'checking';

  return (
    <SafeAreaView style={s.container}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />
      <View style={s.content}>
        {/* Logo */}
        <Text style={s.logo}>PayGate</Text>
        <Text style={s.subtitle}>Merchant Portal</Text>

        {/* Status card */}
        <View style={s.card}>
          {isLoading ? (
            <>
              <ActivityIndicator size="large" color={C.primary} style={{ marginBottom: 16 }} />
              <Text style={s.statusText}>
                {state === 'checking'      ? 'Checking biometric availability…' :
                 state === 'authenticating' ? `Waiting for ${biometricType}…` :
                                             'Exchanging credentials…'}
              </Text>
            </>
          ) : state === 'unavailable' ? (
            <>
              <Text style={s.icon}>🔒</Text>
              <Text style={s.statusText}>Biometric authentication is not available on this device.</Text>
            </>
          ) : state === 'no_stored_token' ? (
            <>
              <Text style={s.icon}>👤</Text>
              <Text style={s.statusText}>No saved session found. Please sign in with your credentials first.</Text>
            </>
          ) : state === 'error' ? (
            <>
              <Text style={s.icon}>⚠️</Text>
              <Text style={[s.statusText, { color: C.error }]}>{errorMsg}</Text>
            </>
          ) : (
            <>
              <Text style={s.icon}>
                {biometricType === 'Face ID' ? '🪪' : '👆'}
              </Text>
              <Text style={s.statusText}>
                Use {biometricType} to sign in securely
              </Text>
            </>
          )}
        </View>

        {/* Primary action */}
        {(state === 'ready' || state === 'error') && (
          <TouchableOpacity style={s.btn} onPress={handleBiometricLogin}>
            <Text style={s.btnText}>
              {state === 'error' ? 'Try Again' : `Sign in with ${biometricType}`}
            </Text>
          </TouchableOpacity>
        )}

        {/* Fallback */}
        {state !== 'checking' && state !== 'success' && (
          <TouchableOpacity style={s.fallbackBtn} onPress={handleFallback}>
            <Text style={s.fallbackText}>Sign in with password</Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container:    { flex: 1, backgroundColor: C.bg },
  content:      { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  logo:         { fontSize: 40, fontWeight: '800', color: C.primary, marginBottom: 4 },
  subtitle:     { fontSize: 15, color: C.muted, marginBottom: 40 },
  card:         { backgroundColor: C.card, borderRadius: 20, padding: 32, width: '100%',
                  borderWidth: 1, borderColor: C.border, alignItems: 'center', marginBottom: 24 },
  icon:         { fontSize: 48, marginBottom: 16 },
  statusText:   { fontSize: 15, color: C.text, textAlign: 'center', lineHeight: 22 },
  btn:          { backgroundColor: C.primary, borderRadius: 14, paddingVertical: 16,
                  paddingHorizontal: 32, width: '100%', alignItems: 'center', marginBottom: 12 },
  btnText:      { color: '#fff', fontWeight: '700', fontSize: 16 },
  fallbackBtn:  { paddingVertical: 12 },
  fallbackText: { color: C.muted, fontSize: 14 },
});
