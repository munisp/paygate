import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, TextInput, SafeAreaView, StatusBar, Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { trpc } from '../lib/trpc';

const colors = {
  primary: '#6366F1', background: '#0F172A', card: '#1E293B',
  text: '#F1F5F9', muted: '#94A3B8', success: '#10B981',
  error: '#EF4444', border: '#334155',
};

export default function ProfileScreen() {
  const navigation = useNavigation();
  const utils = trpc.useUtils();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');

  const { data: profile, isLoading } = trpc.auth.me.useQuery(undefined, {
    onSuccess: (data: any) => {
      setName(data?.name ?? '');
      setEmail(data?.email ?? '');
    },
  });

  const updateMutation = trpc.settings.updateProfile.useMutation({
    onSuccess: () => {
      utils.auth.me.invalidate();
      setEditing(false);
      Alert.alert('Success', 'Profile updated successfully');
    },
    onError: (err: any) => Alert.alert('Error', err.message),
  });

  const handleSave = () => {
    updateMutation.mutate({ name, email });
  };

  if (isLoading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Profile</Text>

        <View style={styles.card}>
          <Text style={styles.label}>Name</Text>
          {editing ? (
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholderTextColor={colors.muted}
            />
          ) : (
            <Text style={styles.value}>{profile?.name ?? '—'}</Text>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Email</Text>
          {editing ? (
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              placeholderTextColor={colors.muted}
            />
          ) : (
            <Text style={styles.value}>{profile?.email ?? '—'}</Text>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Role</Text>
          <Text style={styles.value}>{profile?.role ?? 'user'}</Text>
        </View>

        {editing ? (
          <View style={styles.row}>
            <TouchableOpacity
              style={[styles.btn, styles.btnPrimary]}
              onPress={handleSave}
              disabled={updateMutation.isLoading}
            >
              {updateMutation.isLoading
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={styles.btnText}>Save Changes</Text>}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, styles.btnSecondary]}
              onPress={() => setEditing(false)}
            >
              <Text style={[styles.btnText, { color: colors.muted }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={[styles.btn, styles.btnPrimary]}
            onPress={() => setEditing(true)}
          >
            <Text style={styles.btnText}>Edit Profile</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { justifyContent: 'center', alignItems: 'center' },
  content: { padding: 20 },
  title: { fontSize: 24, fontWeight: '700', color: colors.text, marginBottom: 20 },
  card: {
    backgroundColor: colors.card, borderRadius: 12, padding: 16,
    marginBottom: 12, borderWidth: 1, borderColor: colors.border,
  },
  label: { fontSize: 12, color: colors.muted, marginBottom: 4 },
  value: { fontSize: 16, color: colors.text },
  input: {
    fontSize: 16, color: colors.text, borderBottomWidth: 1,
    borderBottomColor: colors.primary, paddingVertical: 4,
  },
  row: { flexDirection: 'row', gap: 12 },
  btn: {
    flex: 1, padding: 14, borderRadius: 10,
    alignItems: 'center', marginTop: 8,
  },
  btnPrimary: { backgroundColor: colors.primary },
  btnSecondary: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  btnText: { color: '#fff', fontWeight: '600', fontSize: 15 },
});
