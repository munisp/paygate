import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, SafeAreaView, StatusBar, Alert,
} from 'react-native';
import { trpc } from '../lib/trpc';

const colors = {
  primary: '#6366F1', background: '#0F172A', card: '#1E293B',
  text: '#F1F5F9', muted: '#94A3B8', success: '#10B981',
  error: '#EF4444', border: '#334155', warning: '#F59E0B',
};

const ROLE_COLORS: Record<string, string> = {
  admin: '#6366F1', manager: '#8B5CF6', developer: '#06B6D4',
  viewer: '#94A3B8', owner: '#F59E0B',
};

export default function TeamScreen() {
  const utils = trpc.useUtils();
  const [refreshing, setRefreshing] = useState(false);

  const { data, isLoading, isError, refetch } = trpc.teamMembers.list.useQuery({ page: 1, limit: 50 });

  const removeMutation = trpc.teamMembers.remove.useMutation({
    onSuccess: () => { utils.teamMembers.list.invalidate(); Alert.alert('Success', 'Member removed'); },
    onError: (err: any) => Alert.alert('Error', err.message),
  });

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const members = (data as any)?.members ?? (data as any)?.data ?? [];

  if (isLoading) return (
    <View style={[styles.container, styles.center]}>
      <ActivityIndicator color={colors.primary} size="large" />
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        <Text style={styles.title}>Team Members</Text>
        <Text style={styles.subtitle}>{members.length} member{members.length !== 1 ? 's' : ''}</Text>

        {isError && <Text style={styles.error}>Failed to load team members</Text>}

        {members.map((m: any) => (
          <View key={m.id} style={styles.card}>
            <View style={styles.row}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{(m.name ?? m.email ?? '?')[0].toUpperCase()}</Text>
              </View>
              <View style={styles.info}>
                <Text style={styles.name}>{m.name ?? m.email}</Text>
                <Text style={styles.email}>{m.email}</Text>
              </View>
              <View style={[styles.badge, { backgroundColor: ROLE_COLORS[m.role] ?? colors.muted }]}>
                <Text style={styles.badgeText}>{m.role}</Text>
              </View>
            </View>
            <TouchableOpacity
              style={styles.removeBtn}
              onPress={() => Alert.alert('Remove Member', `Remove ${m.name ?? m.email}?`, [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Remove', style: 'destructive', onPress: () => removeMutation.mutate({ id: m.id }) },
              ])}
            >
              <Text style={styles.removeBtnText}>Remove</Text>
            </TouchableOpacity>
          </View>
        ))}

        {members.length === 0 && !isLoading && (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No team members yet</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { justifyContent: 'center', alignItems: 'center' },
  content: { padding: 20 },
  title: { fontSize: 24, fontWeight: '700', color: colors.text, marginBottom: 4 },
  subtitle: { fontSize: 14, color: colors.muted, marginBottom: 20 },
  error: { color: colors.error, marginBottom: 12 },
  card: { backgroundColor: colors.card, borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: colors.border },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center' },
  avatarText: { color: '#fff', fontWeight: '700', fontSize: 18 },
  info: { flex: 1 },
  name: { fontSize: 15, fontWeight: '600', color: colors.text },
  email: { fontSize: 12, color: colors.muted },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '600' },
  removeBtn: { marginTop: 10, padding: 8, borderRadius: 8, borderWidth: 1, borderColor: colors.error, alignItems: 'center' },
  removeBtnText: { color: colors.error, fontSize: 13, fontWeight: '600' },
  empty: { alignItems: 'center', paddingVertical: 40 },
  emptyText: { color: colors.muted, fontSize: 16 },
});
