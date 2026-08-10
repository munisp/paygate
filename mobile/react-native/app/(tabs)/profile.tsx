import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  TextInput,
  ActivityIndicator,
  Switch,
} from 'react-native';
import { useRouter } from 'expo-router';
import { trpc } from '../../src/trpc';
import { useAuth } from '../../src/contexts/AuthContext';

export default function ProfileScreen() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [pushEnabled, setPushEnabled] = useState(true);
  const [emailNotifs, setEmailNotifs] = useState(true);

  const utils = trpc.useUtils();

  const updateProfileMutation = trpc.auth.updateProfile.useMutation({
    onSuccess: () => {
      utils.auth.me.invalidate();
      setEditing(false);
      Alert.alert('Success', 'Profile updated successfully.');
    },
    onError: (err) => {
      Alert.alert('Error', err.message);
    },
  });

  const handleSave = () => {
    updateProfileMutation.mutate({ name: name.trim(), email: email.trim() });
  };

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          await logout();
          router.replace('/(auth)/login');
        },
      },
    ]);
  };

  const menuItems = [
    { icon: '🔑', label: 'Change Password', onPress: () => Alert.alert('Change Password', 'A password reset link will be sent to your registered email address. Check your inbox after confirming.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Send Reset Link', onPress: () => Alert.alert('Sent', 'Check your email for the reset link.') }]) },
    { icon: '🔐', label: 'Two-Factor Authentication', onPress: () => Alert.alert('Two-Factor Authentication', 'Enable 2FA in Settings → Security on the web portal. Scan the QR code with Google Authenticator or Authy.', [{ text: 'OK' }]) },
    { icon: '📱', label: 'Connected Devices', onPress: () => Alert.alert('Connected Devices', 'Manage active sessions and revoke device access in Settings → Security on the web portal.', [{ text: 'OK' }]) },
    { icon: '📄', label: 'Terms of Service', onPress: () => Alert.alert('Terms', 'Visit https://paygate.ng/terms') },
    { icon: '🛡️', label: 'Privacy Policy', onPress: () => Alert.alert('Privacy', 'Visit https://paygate.ng/privacy') },
    { icon: '💬', label: 'Support', onPress: () => Alert.alert('Support', 'Email: support@paygate.ng') },
  ];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.avatarContainer}>
          <Text style={styles.avatarText}>
            {(user?.name ?? user?.email ?? 'U').charAt(0).toUpperCase()}
          </Text>
        </View>
        {editing ? (
          <View style={styles.editFields}>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="Full name"
              placeholderTextColor="#64748b"
            />
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="Email address"
              placeholderTextColor="#64748b"
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <View style={styles.editActions}>
              <TouchableOpacity
                style={[styles.btn, styles.cancelBtn]}
                onPress={() => setEditing(false)}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btn, styles.saveBtn]}
                onPress={handleSave}
                disabled={updateProfileMutation.isPending}
              >
                {updateProfileMutation.isPending ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.saveBtnText}>Save</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={styles.userInfo}>
            <Text style={styles.userName}>{user?.name ?? 'Merchant'}</Text>
            <Text style={styles.userEmail}>{user?.email ?? ''}</Text>
            <TouchableOpacity style={styles.editBtn} onPress={() => setEditing(true)}>
              <Text style={styles.editBtnText}>Edit Profile</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Notification Preferences */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Notifications</Text>
        <View style={styles.card}>
          <View style={styles.toggleRow}>
            <View>
              <Text style={styles.toggleLabel}>Push Notifications</Text>
              <Text style={styles.toggleSub}>Payment alerts, disputes, fraud</Text>
            </View>
            <Switch
              value={pushEnabled}
              onValueChange={setPushEnabled}
              trackColor={{ false: '#334155', true: '#6366f1' }}
              thumbColor="#fff"
            />
          </View>
          <View style={[styles.toggleRow, styles.borderTop]}>
            <View>
              <Text style={styles.toggleLabel}>Email Notifications</Text>
              <Text style={styles.toggleSub}>Weekly summaries, invoices</Text>
            </View>
            <Switch
              value={emailNotifs}
              onValueChange={setEmailNotifs}
              trackColor={{ false: '#334155', true: '#6366f1' }}
              thumbColor="#fff"
            />
          </View>
        </View>
      </View>

      {/* Account Menu */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Account</Text>
        <View style={styles.card}>
          {menuItems.map((item, index) => (
            <TouchableOpacity
              key={item.label}
              style={[styles.menuItem, index > 0 && styles.borderTop]}
              onPress={item.onPress}
              activeOpacity={0.7}
            >
              <Text style={styles.menuIcon}>{item.icon}</Text>
              <Text style={styles.menuLabel}>{item.label}</Text>
              <Text style={styles.menuChevron}>›</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* App Info */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>App</Text>
        <View style={styles.card}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Version</Text>
            <Text style={styles.infoValue}>4.0.0</Text>
          </View>
          <View style={[styles.infoRow, styles.borderTop]}>
            <Text style={styles.infoLabel}>Environment</Text>
            <Text style={styles.infoValue}>Production</Text>
          </View>
          <View style={[styles.infoRow, styles.borderTop]}>
            <Text style={styles.infoLabel}>API</Text>
            <Text style={styles.infoValue}>tRPC v11</Text>
          </View>
        </View>
      </View>

      {/* Sign Out */}
      <TouchableOpacity style={styles.signOutBtn} onPress={handleLogout} activeOpacity={0.8}>
        <Text style={styles.signOutText}>Sign Out</Text>
      </TouchableOpacity>

      <View style={styles.footer}>
        <Text style={styles.footerText}>PayGate Merchant Portal © 2026</Text>
        <Text style={styles.footerSub}>Secure. Fast. Reliable.</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  content: { paddingBottom: 40 },
  header: {
    backgroundColor: '#1e293b',
    padding: 24,
    paddingTop: 60,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  avatarContainer: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#6366f1',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatarText: { fontSize: 28, fontWeight: '700', color: '#fff' },
  userInfo: { alignItems: 'center' },
  userName: { fontSize: 20, fontWeight: '700', color: '#f8fafc', marginBottom: 4 },
  userEmail: { fontSize: 14, color: '#94a3b8', marginBottom: 12 },
  editBtn: {
    backgroundColor: '#334155',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 8,
  },
  editBtnText: { color: '#e2e8f0', fontSize: 13, fontWeight: '600' },
  editFields: { width: '100%' },
  input: {
    backgroundColor: '#334155',
    color: '#f8fafc',
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
    fontSize: 15,
  },
  editActions: { flexDirection: 'row', gap: 10 },
  btn: { flex: 1, padding: 12, borderRadius: 8, alignItems: 'center' },
  cancelBtn: { backgroundColor: '#334155' },
  cancelBtnText: { color: '#94a3b8', fontWeight: '600' },
  saveBtn: { backgroundColor: '#6366f1' },
  saveBtnText: { color: '#fff', fontWeight: '700' },
  section: { paddingHorizontal: 16, paddingTop: 24 },
  sectionTitle: { fontSize: 13, fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 },
  card: { backgroundColor: '#1e293b', borderRadius: 12, overflow: 'hidden' },
  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 },
  toggleLabel: { fontSize: 15, color: '#e2e8f0', fontWeight: '500' },
  toggleSub: { fontSize: 12, color: '#64748b', marginTop: 2 },
  borderTop: { borderTopWidth: 1, borderTopColor: '#334155' },
  menuItem: { flexDirection: 'row', alignItems: 'center', padding: 16 },
  menuIcon: { fontSize: 18, marginRight: 12 },
  menuLabel: { flex: 1, fontSize: 15, color: '#e2e8f0' },
  menuChevron: { fontSize: 20, color: '#64748b' },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 },
  infoLabel: { fontSize: 14, color: '#94a3b8' },
  infoValue: { fontSize: 14, color: '#e2e8f0', fontWeight: '500' },
  signOutBtn: {
    margin: 16,
    marginTop: 24,
    backgroundColor: '#ef4444',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  signOutText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  footer: { alignItems: 'center', paddingTop: 16 },
  footerText: { fontSize: 12, color: '#475569' },
  footerSub: { fontSize: 11, color: '#334155', marginTop: 2 },
});
