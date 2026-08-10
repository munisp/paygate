import React, { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, Alert,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { useAuth } from "../../src/contexts/AuthContext";
import { API_BASE_URL } from "../../src/lib/trpc";

export default function LoginScreen() {
  const { login, biometricLogin, hasBiometrics } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function handleLogin() {
    if (!email || !password) {
      Alert.alert("Error", "Please enter your email and password");
      return;
    }
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/trpc/auth.login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ json: { email, password } }),
      });
      const data = await res.json();
      if (data.result?.data?.json) {
        const { token, user } = data.result.data.json;
        await login(token, user);
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        throw new Error(data.error?.message ?? "Login failed");
      }
    } catch (err: any) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Login Failed", err.message ?? "Invalid credentials");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleBiometric() {
    const success = await biometricLogin();
    if (success) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      // Biometric success — user already has stored token
    }
  }

  return (
    <LinearGradient colors={["#0f172a", "#1e293b", "#0f172a"]} style={styles.gradient}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.container}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {/* Logo */}
          <View style={styles.logoContainer}>
            <View style={styles.logoBox}>
              <Text style={styles.logoText}>PG</Text>
            </View>
            <Text style={styles.appName}>PayGate</Text>
            <Text style={styles.tagline}>Merchant Portal</Text>
          </View>

          {/* Form */}
          <View style={styles.form}>
            <Text style={styles.formTitle}>Sign In</Text>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Email</Text>
              <TextInput
                style={styles.input}
                placeholder="merchant@example.com"
                placeholderTextColor="#64748b"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Password</Text>
              <TextInput
                style={styles.input}
                placeholder="••••••••"
                placeholderTextColor="#64748b"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
              />
            </View>

            <TouchableOpacity
              style={[styles.loginButton, isLoading && styles.loginButtonDisabled]}
              onPress={handleLogin}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.loginButtonText}>Sign In</Text>
              )}
            </TouchableOpacity>

            {hasBiometrics && (
              <TouchableOpacity style={styles.biometricButton} onPress={handleBiometric}>
                <Text style={styles.biometricText}>🔐 Use Biometrics</Text>
              </TouchableOpacity>
            )}
          </View>

          <Text style={styles.footer}>
            PayGate Merchant Portal v1.0{"\n"}
            Secure · Reliable · Fast
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: { flex: 1 },
  container: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: "center", padding: 24 },
  logoContainer: { alignItems: "center", marginBottom: 40 },
  logoBox: {
    width: 72, height: 72, borderRadius: 20,
    backgroundColor: "#3b82f6", alignItems: "center", justifyContent: "center",
    marginBottom: 12, shadowColor: "#3b82f6", shadowOpacity: 0.5,
    shadowRadius: 20, shadowOffset: { width: 0, height: 8 },
  },
  logoText: { color: "#fff", fontSize: 28, fontWeight: "800" },
  appName: { color: "#f1f5f9", fontSize: 28, fontWeight: "700" },
  tagline: { color: "#64748b", fontSize: 14, marginTop: 4 },
  form: {
    backgroundColor: "#1e293b", borderRadius: 24, padding: 24,
    borderWidth: 1, borderColor: "#334155",
  },
  formTitle: { color: "#f1f5f9", fontSize: 20, fontWeight: "700", marginBottom: 20 },
  inputGroup: { marginBottom: 16 },
  label: { color: "#94a3b8", fontSize: 13, fontWeight: "600", marginBottom: 6 },
  input: {
    backgroundColor: "#0f172a", borderRadius: 12, padding: 14,
    color: "#f1f5f9", fontSize: 15, borderWidth: 1, borderColor: "#334155",
  },
  loginButton: {
    backgroundColor: "#3b82f6", borderRadius: 12, padding: 16,
    alignItems: "center", marginTop: 8,
  },
  loginButtonDisabled: { opacity: 0.6 },
  loginButtonText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  biometricButton: {
    marginTop: 12, padding: 14, borderRadius: 12,
    borderWidth: 1, borderColor: "#334155", alignItems: "center",
  },
  biometricText: { color: "#94a3b8", fontSize: 14 },
  footer: { textAlign: "center", color: "#475569", fontSize: 12, marginTop: 32, lineHeight: 20 },
});
