import React, { useState } from "react";
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  Switch, Alert, ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { trpc } from "../../src/lib/trpc";
import { useAuth } from "../../src/contexts/AuthContext";

function SettingRow({ icon, label, value, onPress, isSwitch, switchValue, onSwitchChange, color, danger }: any) {
  return (
    <TouchableOpacity style={styles.settingRow} onPress={onPress} disabled={isSwitch}>
      <View style={[styles.settingIcon, { backgroundColor: (color ?? "#3b82f6") + "20" }]}>
        <Ionicons name={icon} size={18} color={danger ? "#ef4444" : (color ?? "#3b82f6")} />
      </View>
      <Text style={[styles.settingLabel, danger && styles.settingLabelDanger]}>{label}</Text>
      {isSwitch ? (
        <Switch value={switchValue} onValueChange={onSwitchChange} trackColor={{ true: "#3b82f6" }} />
      ) : value ? (
        <Text style={styles.settingValue}>{value}</Text>
      ) : (
        <Ionicons name="chevron-forward" size={16} color="#475569" />
      )}
    </TouchableOpacity>
  );
}

export default function SettingsScreen() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const [pushEnabled, setPushEnabled] = useState(true);
  const [biometricEnabled, setBiometricEnabled] = useState(true);

  const { data: profile, isLoading } = trpc.settings.getProfile.useQuery(undefined, { staleTime: 300_000 });

  const updateProfile = trpc.settings.updateProfile.useMutation({
    onSuccess: () => Alert.alert("Success", "Profile updated"),
    onError: (e) => Alert.alert("Error", e.message),
  });

  async function handleLogout() {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: async () => {
          await logout();
        },
      },
    ]);
  }

  return (
    <ScrollView style={styles.container}>
      {/* Profile Card */}
      <View style={styles.profileCard}>
        <View style={styles.profileAvatar}>
          <Text style={styles.profileAvatarText}>
            {(user?.name ?? "M").charAt(0).toUpperCase()}
          </Text>
        </View>
        <View style={styles.profileInfo}>
          <Text style={styles.profileName}>{user?.name ?? "Merchant"}</Text>
          <Text style={styles.profileEmail}>{user?.email ?? ""}</Text>
          <View style={styles.roleBadge}>
            <Text style={styles.roleText}>{user?.role ?? "user"}</Text>
          </View>
        </View>
        <TouchableOpacity onPress={() => router.push("/profile-edit")}>
          <Ionicons name="create-outline" size={20} color="#3b82f6" />
        </TouchableOpacity>
      </View>

      {/* Business */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Business</Text>
        <View style={styles.card}>
          <SettingRow icon="business" label="Business Profile" onPress={() => router.push("/business-profile")} color="#3b82f6" />
          <SettingRow icon="card" label="Bank Accounts" onPress={() => router.push("/bank-accounts")} color="#22c55e" />
          <SettingRow icon="document-text" label="KYC & Compliance" onPress={() => router.push("/kyc")} color="#f59e0b" />
          <SettingRow icon="pricetag" label="Pricing & Fees" onPress={() => router.push("/pricing")} color="#8b5cf6" />
        </View>
      </View>

      {/* Security */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Security</Text>
        <View style={styles.card}>
          <SettingRow icon="lock-closed" label="Change Password" onPress={() => router.push("/change-password")} color="#ef4444" />
          <SettingRow icon="finger-print" label="Biometric Login" isSwitch switchValue={biometricEnabled} onSwitchChange={setBiometricEnabled} color="#3b82f6" />
          <SettingRow icon="shield-checkmark" label="Two-Factor Auth" onPress={() => router.push("/2fa")} color="#22c55e" />
          <SettingRow icon="key" label="API Keys" onPress={() => router.push("/api-keys")} color="#f59e0b" />
        </View>
      </View>

      {/* Notifications */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Notifications</Text>
        <View style={styles.card}>
          <SettingRow icon="notifications" label="Push Notifications" isSwitch switchValue={pushEnabled} onSwitchChange={setPushEnabled} color="#3b82f6" />
          <SettingRow icon="mail" label="Email Alerts" onPress={() => router.push("/email-alerts")} color="#8b5cf6" />
          <SettingRow icon="chatbubble" label="SMS Alerts" onPress={() => router.push("/sms-alerts")} color="#06b6d4" />
        </View>
      </View>

      {/* Integrations */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Integrations</Text>
        <View style={styles.card}>
          <SettingRow icon="code-slash" label="Webhooks" onPress={() => router.push("/webhooks")} color="#f59e0b" />
          <SettingRow icon="globe" label="Payment Links" onPress={() => router.push("/payment-links")} color="#22c55e" />
          <SettingRow icon="storefront" label="Checkout Config" onPress={() => router.push("/checkout")} color="#3b82f6" />
        </View>
      </View>

      {/* Support */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Support</Text>
        <View style={styles.card}>
          <SettingRow icon="help-circle" label="Help Center" onPress={() => router.push("/help")} color="#64748b" />
          <SettingRow icon="chatbox" label="Live Chat" onPress={() => router.push("/chat")} color="#3b82f6" />
          <SettingRow icon="information-circle" label="App Version" value="1.0.0" color="#64748b" />
        </View>
      </View>

      {/* Logout */}
      <View style={styles.section}>
        <View style={styles.card}>
          <SettingRow icon="log-out" label="Sign Out" onPress={handleLogout} danger />
        </View>
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f172a" },
  profileCard: {
    flexDirection: "row", alignItems: "center", margin: 16,
    backgroundColor: "#1e293b", borderRadius: 20, padding: 16,
    borderWidth: 1, borderColor: "#334155",
  },
  profileAvatar: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: "#3b82f6",
    alignItems: "center", justifyContent: "center", marginRight: 12,
  },
  profileAvatarText: { color: "#fff", fontSize: 22, fontWeight: "700" },
  profileInfo: { flex: 1 },
  profileName: { color: "#f1f5f9", fontSize: 17, fontWeight: "700" },
  profileEmail: { color: "#64748b", fontSize: 13, marginTop: 2 },
  roleBadge: { backgroundColor: "#3b82f620", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2, alignSelf: "flex-start", marginTop: 4 },
  roleText: { color: "#3b82f6", fontSize: 11, fontWeight: "700", textTransform: "uppercase" },
  section: { paddingHorizontal: 16, marginBottom: 8 },
  sectionTitle: { color: "#64748b", fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8, marginLeft: 4 },
  card: { backgroundColor: "#1e293b", borderRadius: 16, borderWidth: 1, borderColor: "#334155", overflow: "hidden" },
  settingRow: {
    flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: "#0f172a",
  },
  settingIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center", marginRight: 12 },
  settingLabel: { flex: 1, color: "#f1f5f9", fontSize: 15 },
  settingLabelDanger: { color: "#ef4444" },
  settingValue: { color: "#64748b", fontSize: 13 },
});
