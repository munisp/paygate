import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  RefreshControl,
  TextInput,
  TouchableOpacity,
  Alert,
  Modal,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { trpc } from '../lib/trpc';

// Design system colors
const COLORS = {
  primary: '#6366F1', background: '#0F172A', card: '#1E293B',
  text: '#F1F5F9', muted: '#94A3B8', success: '#10B981',
  error: '#EF4444', warning: '#F59E0B', border: '#334155',
};

// Placeholder for tRPC types - in a real app, these would be generated
interface KeycloakRole {
  id: string;
  name: string;
  description: string;
  status: 'active' | 'inactive' | 'pending';
  createdAt: string;
  updatedAt: string;
}

const KeycloakRoleSyncScreen = () => {
  const navigation = useNavigation();

  // tRPC queries and mutations
  const { data: roles, isLoading, isError, refetch } = trpc.keycloakRoleSync.list.useQuery();
  const createRoleMutation = trpc.keycloakRoleSync.create.useMutation();
  const updateRoleMutation = trpc.keycloakRoleSync.update.useMutation();
  const deleteRoleMutation = trpc.keycloakRoleSync.delete.useMutation();

  // State for UI
  const [searchText, setSearchText] = useState('');
  const [filteredRoles, setFilteredRoles] = useState<KeycloakRole[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [isCreateModalVisible, setIsCreateModalVisible] = useState(false);
  const [isEditModalVisible, setIsEditModalVisible] = useState(false);
  const [editingRole, setEditingRole] = useState<KeycloakRole | null>(null);

  // Form states for create/edit
  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleDescription, setNewRoleDescription] = useState('');

  useEffect(() => {
    if (roles) {
      setFilteredRoles(
        roles.filter(
          (role) =>
            role.name.toLowerCase().includes(searchText.toLowerCase()) ||
            role.description.toLowerCase().includes(searchText.toLowerCase())
        )
      );
    }
  }, [roles, searchText]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const handleCreateRole = async () => {
    if (!newRoleName || !newRoleDescription) {
      Alert.alert('Error', 'Name and description cannot be empty.');
      return;
    }
    try {
      await createRoleMutation.mutateAsync({ name: newRoleName, description: newRoleDescription });
      Alert.alert('Success', 'Role created successfully.');
      setIsCreateModalVisible(false);
      setNewRoleName('');
      setNewRoleDescription('');
      refetch();
    } catch (error: any) {
      Alert.alert('Error', `Failed to create role: ${error.message}`);
    }
  };

  const handleUpdateRole = async () => {
    if (!editingRole || !newRoleName || !newRoleDescription) {
      Alert.alert('Error', 'Role data is incomplete.');
      return;
    }
    try {
      await updateRoleMutation.mutateAsync({ id: editingRole.id, name: newRoleName, description: newRoleDescription });
      Alert.alert('Success', 'Role updated successfully.');
      setIsEditModalVisible(false);
      setEditingRole(null);
      setNewRoleName('');
      setNewRoleDescription('');
      refetch();
    } catch (error: any) {
      Alert.alert('Error', `Failed to update role: ${error.message}`);
    }
  };

  const handleDeleteRole = (roleId: string) => {
    Alert.alert(
      'Confirm Delete',
      'Are you sure you want to delete this role?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteRoleMutation.mutateAsync({ id: roleId });
              Alert.alert('Success', 'Role deleted successfully.');
              refetch();
            } catch (error: any) {
              Alert.alert('Error', `Failed to delete role: ${error.message}`);
            }
          },
        },
      ]
    );
  };

  // Helper functions for formatting (placeholders)
  const formatAmount = (amount: number, currency: 'NGN' | 'USD') => {
    const formatter = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency === 'NGN' ? 'NGN' : 'USD',
      minimumFractionDigits: 2,
    });
    return formatter.format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  const renderRoleItem = ({ item }: { item: KeycloakRole }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.roleName}>{item.name}</Text>
        <View style={[styles.statusBadge, item.status === 'active' ? styles.statusActive : item.status === 'inactive' ? styles.statusInactive : styles.statusPending]}>
          <Text style={styles.statusText}>{item.status.toUpperCase()}</Text>
        </View>
      </View>
      <Text style={styles.roleDescription}>{item.description}</Text>
      <Text style={styles.mutedText}>Created: {formatDate(item.createdAt)}</Text>
      <Text style={styles.mutedText}>Updated: {formatDate(item.updatedAt)}</Text>
      {/* Example of amount formatting - assuming a role might have an associated value */}
      {/* <Text style={styles.mutedText}>Value: {formatAmount(12345.67, 'NGN')}</Text> */}
      <View style={styles.actionButtons}>
        <TouchableOpacity
          style={[styles.button, styles.editButton]}
          onPress={() => {
            setEditingRole(item);
            setNewRoleName(item.name);
            setNewRoleDescription(item.description);
            setIsEditModalVisible(true);
          }}
        >
          <Text style={styles.buttonText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.button, styles.deleteButton]}
          onPress={() => handleDeleteRole(item.id)}
        >
          <Text style={styles.buttonText}>Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Loading roles...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (isError) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
        <View style={styles.centered}>
          <Text style={styles.errorText}>Failed to load roles. Please try again.</Text>
          <TouchableOpacity style={styles.button} onPress={() => refetch()}>
            <Text style={styles.buttonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      <View style={styles.header}>
        <Text style={styles.title}>Keycloak Role Sync</Text>
        <TouchableOpacity style={styles.button} onPress={() => setIsCreateModalVisible(true)}>
          <Text style={styles.buttonText}>Add Role</Text>
        </TouchableOpacity>
      </View>
      <TextInput
        style={styles.searchInput}
        placeholder="Search roles..."
        placeholderTextColor={COLORS.muted}
        value={searchText}
        onChangeText={setSearchText}
      />
      {filteredRoles.length === 0 && !isLoading && !isError ? (
        <View style={styles.centered}>
          <Text style={styles.emptyText}>No roles found.</Text>
        </View>
      ) : (
        <FlatList
          data={filteredRoles}
          keyExtractor={(item) => item.id}
          renderItem={renderRoleItem}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={COLORS.primary}
              colors={[COLORS.primary]}
              progressBackgroundColor={COLORS.card}
            />
          }
        />
      )}

      {/* Create Role Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isCreateModalVisible}
        onRequestClose={() => setIsCreateModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Create New Role</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Role Name"
              placeholderTextColor={COLORS.muted}
              value={newRoleName}
              onChangeText={setNewRoleName}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Role Description"
              placeholderTextColor={COLORS.muted}
              value={newRoleDescription}
              onChangeText={setNewRoleDescription}
              multiline
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity style={[styles.button, styles.cancelButton]} onPress={() => setIsCreateModalVisible(false)}>
                <Text style={styles.buttonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.button} onPress={handleCreateRole}>
                <Text style={styles.buttonText}>Create</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Edit Role Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isEditModalVisible}
        onRequestClose={() => setIsEditModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Edit Role</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Role Name"
              placeholderTextColor={COLORS.muted}
              value={newRoleName}
              onChangeText={setNewRoleName}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Role Description"
              placeholderTextColor={COLORS.muted}
              value={newRoleDescription}
              onChangeText={setNewRoleDescription}
              multiline
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity style={[styles.button, styles.cancelButton]} onPress={() => setIsEditModalVisible(false)}>
                <Text style={styles.buttonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.button} onPress={handleUpdateRole}>
                <Text style={styles.buttonText}>Save Changes</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  searchInput: {
    height: 40,
    backgroundColor: COLORS.card,
    borderRadius: 8,
    paddingHorizontal: 16,
    margin: 16,
    color: COLORS.text,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  roleName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  roleDescription: {
    fontSize: 14,
    color: COLORS.muted,
    marginBottom: 8,
  },
  mutedText: {
    fontSize: 12,
    color: COLORS.muted,
  },
  statusBadge: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 10,
  },
  statusActive: {
    backgroundColor: COLORS.success,
  },
  statusInactive: {
    backgroundColor: COLORS.error,
  },
  statusPending: {
    backgroundColor: COLORS.warning,
  },
  statusText: {
    color: COLORS.background,
    fontSize: 10,
    fontWeight: 'bold',
  },
  actionButtons: {
    flexDirection: 'row',
    marginTop: 12,
    justifyContent: 'flex-end',
  },
  button: {
    backgroundColor: COLORS.primary,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginLeft: 8,
  },
  buttonText: {
    color: COLORS.text,
    fontWeight: 'bold',
    fontSize: 14,
  },
  editButton: {
    backgroundColor: COLORS.warning,
  },
  deleteButton: {
    backgroundColor: COLORS.error,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: COLORS.muted,
    marginTop: 10,
    fontSize: 16,
  },
  errorText: {
    color: COLORS.error,
    marginTop: 10,
    fontSize: 16,
    textAlign: 'center',
  },
  emptyText: {
    color: COLORS.muted,
    marginTop: 10,
    fontSize: 16,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  modalContent: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: 20,
    width: '90%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 15,
    textAlign: 'center',
  },
  modalInput: {
    backgroundColor: COLORS.background,
    borderRadius: 8,
    padding: 12,
    marginBottom: 15,
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 10,
  },
  cancelButton: {
    backgroundColor: COLORS.muted,
  },
});

export default KeycloakRoleSyncScreen;