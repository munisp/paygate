import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { Link, useRouter } from 'expo-router';
import { trpc } from '@/lib/trpc';

type LoginInput = {
  email: string;
  password_hash: string; // Assuming password will be hashed before sending
};

export default function AuthLoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const loginMutation = trpc.auth.login.useMutation({
    onSuccess: () => {
      Alert.alert('Success', 'Login successful!');
      router.replace('/dashboard'); // Redirect to dashboard on successful login
    },
    onError: (error) => {
      Alert.alert('Login Failed', error.message || 'An unexpected error occurred. Please try again.');
    },
  });

  const handleLogin = () => {
    if (!email || !password) {
      Alert.alert('Input Error', 'Please enter both email and password.');
      return;
    }
    // In a real application, you would hash the password before sending it.
    // For this example, we'll send it as is, assuming the backend handles hashing or it's a placeholder.
    loginMutation.mutate({ email, password_hash: password });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.logo}>PayGate</Text>
      <Text style={styles.title}>Merchant Portal</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Login to your account</Text>

        <TextInput
          style={styles.input}
          placeholder="Email address"
          placeholderTextColor="#94a3b8"
          keyboardType="email-address"
          autoCapitalize="none"
          value={email}
          onChangeText={setEmail}
        />
        <TextInput
          style={styles.input}
          placeholder="Password"
          placeholderTextColor="#94a3b8"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />

        <TouchableOpacity
          style={styles.button}
          onPress={handleLogin}
          disabled={loginMutation.isLoading}
        >
          {loginMutation.isLoading ? (
            <ActivityIndicator color="#f8fafc" />
          ) : (
            <Text style={styles.buttonText}>Login</Text>
          )}
        </TouchableOpacity>

        <Link href="/forgot-password" asChild>
          <TouchableOpacity>
            <Text style={styles.forgotPasswordText}>Forgot Password?</Text>
          </TouchableOpacity>
        </Link>
      </View>

      {loginMutation.isError && (
        <Text style={styles.errorText}>Failed to log in. Please check your credentials and network connection.</Text>
      )}

      {/* Empty state message - not directly applicable for a login screen, but included for completeness based on prompt */}
      {!loginMutation.isLoading && !loginMutation.isError && !loginMutation.isSuccess && (
        <Text style={styles.emptyStateText}>
          New to PayGate? Your journey to seamless transactions and financial growth starts here. Join thousands of Nigerian businesses thriving with us!
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  logo: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#6366f1',
    marginBottom: 10,
  },
  title: {
    fontSize: 24,
    color: '#f8fafc',
    marginBottom: 40,
  },
  card: {
    backgroundColor: '#1e293b',
    borderRadius: 10,
    padding: 20,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  cardTitle: {
    fontSize: 22,
    color: '#f8fafc',
    marginBottom: 20,
    fontWeight: '600',
  },
  input: {
    width: '100%',
    height: 50,
    backgroundColor: '#0f172a',
    borderRadius: 8,
    paddingHorizontal: 15,
    color: '#f8fafc',
    marginBottom: 15,
    fontSize: 16,
  },
  button: {
    width: '100%',
    height: 50,
    backgroundColor: '#6366f1',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 15,
  },
  buttonText: {
    color: '#f8fafc',
    fontSize: 18,
    fontWeight: 'bold',
  },
  forgotPasswordText: {
    color: '#6366f1',
    fontSize: 14,
    marginTop: 5,
  },
  errorText: {
    color: 'red',
    marginTop: 20,
    textAlign: 'center',
    fontSize: 14,
  },
  emptyStateText: {
    color: '#94a3b8',
    marginTop: 30,
    textAlign: 'center',
    fontSize: 14,
    lineHeight: 20,
    paddingHorizontal: 20,
  },
});
