import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator, ScrollView, RefreshControl, Alert } from 'react-native';
import { useTrpc } from '../hooks/useTrpc';

const primary = '#6366f1';
const background = '#0f172a';
const card = '#1e293b';
const textWhite = 'white';
const subtext = '#94a3b8';

const AuthScreen: React.FC = () => {
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  const { mutation } = useTrpc();
  const loginMutation = mutation('auth.login');

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please enter both email and password.');
      return;
    }

    try {
      await loginMutation.mutateAsync({ email, password });
      Alert.alert('Success', 'Logged in successfully!');
      // Navigate to dashboard or home screen upon successful login
    } catch (error: any) {
      Alert.alert('Login Failed', error.message || 'An unexpected error occurred.');
    }
  };

  const handleOAuthLogin = () => {
    Alert.alert('OAuth Login', 'Initiating OAuth login...');
    // Implement OAuth login logic here
  };

  const onRefresh = React.useCallback(() => {
    setIsRefreshing(true);
    // In a real scenario, you might re-fetch some initial data if the login screen had any.
    // For a static login form, this primarily serves as a placeholder for the requirement.
    setTimeout(() => {
      setIsRefreshing(false);
    }, 1500);
  }, []);

  const renderContent = () => {
    if (loginMutation.isLoading) {
      return (
        <View style={styles.centeredContainer}>
          <ActivityIndicator size="large" color={primary} />
          <Text style={styles.loadingText}>Logging in...</Text>
        </View>
      );
    }

    if (loginMutation.isError) {
      return (
        <View style={styles.centeredContainer}>
          <Text style={styles.errorText}>Error: {loginMutation.error?.message || 'Failed to log in.'}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => loginMutation.reset()}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      );
    }

    // Empty state: For a login screen, the "empty state" is essentially the form itself,
    // ready for user input. We ensure the form is always visible unless loading or error.
    return (
      <View style={styles.formContainer}>
        <Text style={styles.title}>Welcome Back</Text>
        <Text style={styles.subtitle}>Sign in to continue to your account</Text>

        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor={subtext}
          keyboardType="email-address"
          autoCapitalize="none"
          value={email}
          onChangeText={setEmail}
        />
        <TextInput
          style={styles.input}
          placeholder="Password"
          placeholderTextColor={subtext}
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />

        <TouchableOpacity style={styles.loginButton} onPress={handleLogin}>
          <Text style={styles.loginButtonText}>Login</Text>
        </TouchableOpacity>

        <Text style={styles.orText}>OR</Text>

        <TouchableOpacity style={styles.oauthButton} onPress={handleOAuthLogin}>
          <Text style={styles.oauthButtonText}>Login with Google</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={onRefresh}
          tintColor={primary}
          colors={[primary]}
          progressBackgroundColor={card}
        />
      }
    >
      {renderContent()}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: background,
  },
  contentContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  centeredContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  formContainer: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: card,
    borderRadius: 10,
    padding: 20,
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: textWhite,
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 16,
    color: subtext,
    marginBottom: 30,
    textAlign: 'center',
  },
  input: {
    width: '100%',
    height: 50,
    backgroundColor: background,
    borderRadius: 8,
    paddingHorizontal: 15,
    color: textWhite,
    marginBottom: 15,
    fontSize: 16,
  },
  loginButton: {
    width: '100%',
    height: 50,
    backgroundColor: primary,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  loginButtonText: {
    color: textWhite,
    fontSize: 18,
    fontWeight: 'bold',
  },
  orText: {
    color: subtext,
    marginBottom: 20,
    fontSize: 16,
},
  oauthButton: {
    width: '100%',
    height: 50,
    backgroundColor: background,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: subtext,
  },
  oauthButtonText: {
    color: textWhite,
    fontSize: 18,
    fontWeight: 'bold',
  },
  loadingText: {
    color: textWhite,
    marginTop: 10,
    fontSize: 16,
  },
  errorText: {
    color: '#ef4444', // A red color for errors
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 15,
  },
  retryButton: {
    backgroundColor: primary,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  retryButtonText: {
    color: textWhite,
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default AuthScreen;
