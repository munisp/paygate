import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  SafeAreaView,
  StatusBar,
  Modal,
  TextInput,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { trpc } from '../lib/trpc';

const colors = {
  primary: '#6366F1',
  background: '#0F172A',
  card: '#1E293B',
  text: '#F1F5F9',
  muted: '#94A3B8',
  success: '#10B981',
  error: '#EF4444',
  warning: '#F59E0B',
  border: '#334155',
};

const ROLE_COLORS: Record<string, string> = {
  admin: '#8B5CF6',
  developer: '#3B82F6',
  viewer: '#64748B',
};

const STATUS_COLORS: Record<string, string> = {
  active: colors.success,
  invited: colors.warning,
  inactive: colors.muted,
  suspended: colors.error,
};

const TeamRolesScreen = () => {
  const navigation = useNavigation<any>();
  const [inviteModalVisible, setInviteModalVisible] = useState(false);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<'admin' | 'developer' | 'viewer'>('viewer');

  const { data: members, isLoading, error, refetch, isRefetching } = trpc.team.list.useQuery();

  const inviteMutation = trpc.team.invite.useMutation({
    onSuccess: () => {
      refetch();
      setInviteModalVisible(false);
      setEmail('');
      setName('');
      setRole('viewer');
      Alert.alert('Success', 'Invitation sent successfully');
    },
    onError: (e) => Alert.alert('Error', e.message),
  });

  const removeMutation = trpc.team.remove.useMutation({
    onSuccess: () => {
      refetch();
      Alert.alert('Success', 'Member removed');
    },
    onError: (e) => Alert.alert('Error', e.message),
  });

  const renderMember = ({ item }: { item: any }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{(item.name ?? item.email ?? '?').charAt(0).toUpperCase()}</Text>
        </View>
        <View style={styles.memberInfo}>
          <Text style={styles.memberName}>{item.name ?? 'Unnamed'}</Text>
          <Text style={styles.memberEmail}>{item.email}</Text>
        </View>
        <View style={styles.badges}>
          <View style={[styles.badge, { backgroundColor: ROLE_COLORS[item.role] + '20' }]}>
            <Text style={[styles.badgeText, { color: ROLE_COLORS[item.role] }]}>
              {(item.role ?? 'viewer').toUpperCase()}
            </Text>
          </View>
          <View style={[styles.badge, { backgroundColor: STATUS_COLORS[item.status] + '20', marginTop: 4 }]}>
            <Text style={[styles.badgeText, { color: STATUS_COLORS[item.status] }]}>
              {(item.status ?? 'active').toUpperCase()}
            </Text>
          </View>
        </View>
      </View>
      <View style={styles.cardFooter}>
        <Text style={styles.joinDate}>
          Joined {item.createdAt ? new Date(item.createdAt).toLocaleDateString() : '—'}
        </Text>
        <TouchableOpacity
          onPress={() => {
            Alert.alert('Remove Member', `Remove ${item.name ?? item.email}?`, [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Remove', style: 'destructive', onPress: () => removeMutation.mutate({ id: item.id }) },
            ]);
          }}
        >
          <Text style={styles.removeText}>Remove</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.muted, { marginTop: 12 }]}>Loading team members...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>Failed to load team data</Text>
        <TouchableOpacity style={styles.retryButton} onPress={() => refetch()}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backButton}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Team & Roles</Text>
        <TouchableOpacity style={styles.inviteButton} onPress={() => setInviteModalVisible(true)}>
          <Text style={styles.inviteButtonText}>+ Invite</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.statsBar}>
        <Text style={styles.statsText}>
          {members?.length ?? 0} member{(members?.length ?? 0) !== 1 ? 's' : ''}
        </Text>
      </View>

      <FlatList
        data={members ?? []}
        keyExtractor={(item) => item.id}
        renderItem={renderMember}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No team members yet</Text>
            <TouchableOpacity style={styles.emptyActionButton} onPress={() => setInviteModalVisible(true)}>
              <Text style={styles.emptyActionButtonText}>Invite First Member</Text>
            </TouchableOpacity>
          </View>
        }
      />

      {/* Invite Modal */}
      <Modal visible={inviteModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Invite Team Member</Text>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Email *</Text>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder="colleague@company.com"
                placeholderTextColor={colors.muted}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Name (optional)</Text>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="John Doe"
                placeholderTextColor={colors.muted}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Role</Text>
              <View style={styles.roleGroup}>
                {(['admin', 'developer', 'viewer'] as const).map(r => (
                  <TouchableOpacity
                    key={r}
                    style={[styles.roleButton, role === r && styles.roleButtonActive]}
                    onPress={() => setRole(r)}
                  >
                    <Text style={[styles.roleText, role === r && styles.roleTextActive]}>
                      {r.charAt(0).toUpperCase() + r.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.button, styles.buttonSecondary]}
                onPress={() => setInviteModalVisible(false)}
              >
                <Text style={styles.buttonTextSecondary}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.button, styles.buttonPrimary]}
                disabled={!email || inviteMutation.isLoading}
                onPress={() => inviteMutation.mutate({ email, name: name || undefined, role })}
              >
                <Text style={styles.buttonTextPrimary}>
                  {inviteMutation.isLoading ? 'Sending...' : 'Send Invite'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16 },
  backButton: { color: colors.primary, fontSize: 16 },
  title: { fontSize: 20, fontWeight: 'bold', color: colors.text },
  inviteButton: { backgroundColor: colors.primary, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  inviteButtonText: { color: '#FFF', fontWeight: '600', fontSize: 13 },
  statsBar: { paddingHorizontal: 20, paddingBottom: 12 },
  statsText: { color: colors.muted, fontSize: 14 },
  listContent: { paddingHorizontal: 20, paddingBottom: 20 },
  card: { backgroundColor: colors.card, borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: colors.border },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary + '30', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  avatarText: { color: colors.primary, fontSize: 18, fontWeight: 'bold' },
  memberInfo: { flex: 1 },
  memberName: { fontSize: 15, fontWeight: '600', color: colors.text },
  memberEmail: { fontSize: 12, color: colors.muted, marginTop: 2 },
  badges: { alignItems: 'flex-end' },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  badgeText: { fontSize: 10, fontWeight: 'bold' },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  joinDate: { fontSize: 12, color: colors.muted },
  removeText: { color: colors.error, fontSize: 13, fontWeight: '500' },
  muted: { color: colors.muted },
  errorText: { color: colors.error, fontSize: 16, marginBottom: 16 },
  retryButton: { paddingHorizontal: 20, paddingVertical: 10, backgroundColor: colors.primary, borderRadius: 8 },
  retryButtonText: { color: '#FFF', fontWeight: '600' },
  emptyContainer: { marginTop: 60, alignItems: 'center' },
  emptyText: { color: colors.muted, fontSize: 16, marginBottom: 16 },
  emptyActionButton: { paddingVertical: 10, paddingHorizontal: 20, borderWidth: 1, borderColor: colors.primary, borderRadius: 8 },
  emptyActionButtonText: { color: colors.primary, fontWeight: '600' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: colors.card, borderRadius: 16, padding: 24, borderWidth: 1, borderColor: colors.border },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: colors.text, marginBottom: 24 },
  inputGroup: { marginBottom: 20 },
  label: { color: colors.muted, fontSize: 14, marginBottom: 8 },
  input: { backgroundColor: colors.background, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, color: colors.text, borderWidth: 1, borderColor: colors.border },
  roleGroup: { flexDirection: 'row', gap: 8 },
  roleButton: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background },
  roleButtonActive: { borderColor: colors.primary, backgroundColor: colors.primary + '15' },
  roleText: { color: colors.muted, fontWeight: '500', fontSize: 13 },
  roleTextActive: { color: colors.primary },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 8 },
  button: { paddingHorizontal: 20, paddingVertical: 12, borderRadius: 8, minWidth: 100, alignItems: 'center' },
  buttonPrimary: { backgroundColor: colors.primary },
  buttonSecondary: { backgroundColor: 'transparent' },
  buttonTextPrimary: { color: '#FFF', fontWeight: '600' },
  buttonTextSecondary: { color: colors.muted, fontWeight: '600' },
});

export default TeamRolesScreen;
