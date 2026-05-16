import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, SafeAreaView, StatusBar, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { trpc } from '../lib/trpc';
const C = { primary: '#6366F1', bg: '#0F172A', card: '#1E293B', text: '#F1F5F9', muted: '#94A3B8', error: '#EF4444', border: '#334155' };
export default function AuthScreen({ navigation }: any) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isRegister, setIsRegister] = useState(false);
  const utils = trpc.useUtils();
  const loginMutation = trpc.auth.login.useMutation({
    onSuccess: async (data: any) => {
      if (data?.token) await AsyncStorage.setItem('session_token', data.token);
      utils.auth.me.invalidate();
      navigation?.navigate?.('Dashboard');
    },
    onError: (err: any) => Alert.alert('Login Failed', err.message),
  });
  const registerMutation = trpc.auth.register?.useMutation?.({
    onSuccess: () => { Alert.alert('Success', 'Account created. Please log in.'); setIsRegister(false); },
    onError: (err: any) => Alert.alert('Registration Failed', err.message),
  });
  const handleSubmit = () => {
    if (!email || !password) { Alert.alert('Error', 'Please fill in all fields'); return; }
    if (isRegister) { registerMutation?.mutate?.({ email, password, name: email.split('@')[0] }); }
    else { loginMutation.mutate({ email, password }); }
  };
  const isLoading = loginMutation.isLoading || (registerMutation?.isLoading ?? false);
  return (
    <SafeAreaView style={s.container}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.kav}>
        <View style={s.content}>
          <Text style={s.logo}>PayGate</Text>
          <Text style={s.subtitle}>{isRegister ? 'Create your account' : 'Sign in to your account'}</Text>
          <View style={s.card}>
            <Text style={s.label}>Email</Text>
            <TextInput style={s.input} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" placeholderTextColor={C.muted} placeholder="merchant@example.com" />
            <Text style={[s.label, { marginTop: 16 }]}>Password</Text>
            <TextInput style={s.input} value={password} onChangeText={setPassword} secureTextEntry placeholderTextColor={C.muted} placeholder="••••••••" />
            <TouchableOpacity style={s.btn} onPress={handleSubmit} disabled={isLoading}>
              {isLoading ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>{isRegister ? 'Create Account' : 'Sign In'}</Text>}
            </TouchableOpacity>
          </View>
          <TouchableOpacity onPress={() => setIsRegister(!isRegister)}>
            <Text style={s.toggle}>{isRegister ? 'Already have an account? Sign in' : "Don't have an account? Register"}</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg }, kav: { flex: 1 },
  content: { flex: 1, justifyContent: 'center', padding: 24 },
  logo: { fontSize: 36, fontWeight: '800', color: C.primary, textAlign: 'center', marginBottom: 8 },
  subtitle: { fontSize: 16, color: C.muted, textAlign: 'center', marginBottom: 32 },
  card: { backgroundColor: C.card, borderRadius: 16, padding: 24, borderWidth: 1, borderColor: C.border },
  label: { fontSize: 13, color: C.muted, marginBottom: 6 },
  input: { backgroundColor: C.bg, borderRadius: 10, padding: 14, color: C.text, fontSize: 15, borderWidth: 1, borderColor: C.border, marginBottom: 4 },
  btn: { backgroundColor: C.primary, borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 20 },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  toggle: { color: C.primary, textAlign: 'center', marginTop: 20, fontSize: 14 },
});
