import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, FlatList, RefreshControl, SafeAreaView, StatusBar, Alert, TouchableOpacity, Modal, TextInput, Button } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { trpc } from '../lib/trpc';

const COLORS = {
  primary: '#6366F1', background: '#0F172A', card: '#1E293B',
  text: '#F1F5F9', muted: '#94A3B8', success: '#10B981',
  error: '#EF4444', warning: '#F59E0B', border: '#334155',
};

const TerminalMapScreen = () => {
  const navigation = useNavigation();

  // State for data, loading, error, etc.
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreateModalVisible, setCreateModalVisible] = useState(false);
  const [isEditModalVisible, setEditModalVisible] = useState(false);
  const [currentTerminal, setCurrentTerminal] = useState(null);

  // Placeholder for tRPC data
  const { data, isLoading, isError, error, refetch } = trpc.terminalMap.list.useQuery();
  const createTerminalMutation = trpc.terminalMap.create.useMutation();
  const updateTerminalMutation = trpc.terminalMap.update.useMutation();
  const deleteTerminalMutation = trpc.terminalMap.delete.useMutation();

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, []);

  if (isLoading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading terminals...</Text>
      </SafeAreaView>
    );
  }

  if (isError) {
    return (
      <SafeAreaView style={styles.errorContainer}>
        <Text style={styles.errorText}>Error: {error?.message}</Text>
        <Button title="Retry" onPress={() => refetch()} color={COLORS.primary} />
      </SafeAreaView>
    );
  }

  // Dummy data for demonstration if data is empty or undefined
  const displayData = data && data.length > 0 ? data : [
    { id: '1', name: 'Main Terminal', location: 'Lagos', isActive: true, createdAt: new Date().toISOString() },
    { id: '2', name: 'Branch A', location: 'Abuja', isActive: false, createdAt: new Date().toISOString() },
  ];

  const filteredData = displayData.filter(terminal =>
    terminal.name.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyText}>No terminals found.</Text>
      <Button title="Create New Terminal" onPress={() => setCreateModalVisible(true)} color={COLORS.primary} />
    </View>
  );

  const renderItem = ({ item }) => (
    <View style={styles.itemContainer}>
      <Text style={styles.itemTitle}>{item.name}</Text>
      <Text style={styles.itemText}>Location: {item.location}</Text>
      <Text style={styles.itemText}>Created: {new Date(item.createdAt).toLocaleDateString()}</Text>
      <Text style={styles.itemText}>Status: <Text style={[styles.statusBadge, item.isActive ? styles.statusActive : styles.statusInactive]}>{item.isActive ? 'Active' : 'Inactive'}</Text></Text>
      <View style={styles.itemActions}>
        <TouchableOpacity onPress={() => handleEdit(item)} style={[styles.actionButton, { backgroundColor: COLORS.primary }]}>
          <Text style={styles.actionButtonText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => handleDelete(item.id)} style={[styles.actionButton, { backgroundColor: COLORS.error }]}>
          <Text style={styles.actionButtonText}>Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const [newTerminalName, setNewTerminalName] = useState('');
  const [newTerminalLocation, setNewTerminalLocation] = useState('');

  const handleCreate = async () => {
    try {
      await createTerminalMutation.mutateAsync({ name: newTerminalName, location: newTerminalLocation });
      setCreateModalVisible(false);
      setNewTerminalName('');
      setNewTerminalLocation('');
      refetch();
    } catch (err) {
      Alert.alert('Error', 'Failed to create terminal.');
    }
  };

  const handleEdit = (terminal) => {
    setCurrentTerminal(terminal);
    setEditModalVisible(true);
  };

  const [editTerminalName, setEditTerminalName] = useState('');
  const [editTerminalLocation, setEditTerminalLocation] = useState('');

  useEffect(() => {
    if (currentTerminal) {
      setEditTerminalName(currentTerminal.name);
      setEditTerminalLocation(currentTerminal.location);
    }
  }, [currentTerminal]);

  const handleUpdate = async () => {
    if (!currentTerminal) return;
    try {
      await updateTerminalMutation.mutateAsync({ id: currentTerminal.id, name: editTerminalName, location: editTerminalLocation });
      setEditModalVisible(false);
      setCurrentTerminal(null);
      refetch();
    } catch (err) {
      Alert.alert('Error', 'Failed to update terminal.');
    }
  };

  const handleDelete = (id) => {
    Alert.alert(
      "Delete Terminal",
      "Are you sure you want to delete this terminal?",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", onPress: async () => {
            try {
              await deleteTerminalMutation.mutateAsync({ id });
              refetch();
            } catch (err) {
              Alert.alert('Error', 'Failed to delete terminal.');
            }
          }, style: "destructive" },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Terminal Map</Text>
        <TouchableOpacity onPress={() => setCreateModalVisible(true)} style={styles.createButton}>
          <Text style={styles.createButtonText}>+</Text>
        </TouchableOpacity>
      </View>

      <TextInput
        style={styles.searchInput}
        placeholder="Search terminals..."
        placeholderTextColor={COLORS.muted}
        value={searchQuery}
        onChangeText={setSearchQuery}
      />

      <FlatList
        data={filteredData}
        keyExtractor={(item) => item.id.toString()}
        renderItem={renderItem}
        ListEmptyComponent={renderEmptyState}
        contentContainerStyle={filteredData.length === 0 && styles.flatListEmpty}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.primary}
          />
        }
      />

      {/* Create Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isCreateModalVisible}
        onRequestClose={() => setCreateModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <Text style={styles.modalTitle}>Create New Terminal</Text>
            {/* Add form fields for new terminal */}
            <TextInput style={styles.input} placeholder="Terminal Name" placeholderTextColor={COLORS.muted} value={newTerminalName} onChangeText={setNewTerminalName} />
            <TextInput style={styles.input} placeholder="Location" placeholderTextColor={COLORS.muted} value={newTerminalLocation} onChangeText={setNewTerminalLocation} />
            <View style={styles.modalActions}>
              <Button title="Cancel" onPress={() => setCreateModalVisible(false)} color={COLORS.muted} />
              <Button title="Create" onPress={handleCreate} color={COLORS.primary} />
            </View>
          </View>
        </View>
      </Modal>

      {/* Edit Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isEditModalVisible}
        onRequestClose={() => setEditModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <Text style={styles.modalTitle}>Edit Terminal</Text>
            {/* Add form fields for editing terminal */}
            <TextInput style={styles.input} placeholder="Terminal Name" placeholderTextColor={COLORS.muted} value={editTerminalName} onChangeText={setEditTerminalName} />
            <TextInput style={styles.input} placeholder="Location" placeholderTextColor={COLORS.muted} value={editTerminalLocation} onChangeText={setEditTerminalLocation} />
            <View style={styles.modalActions}>
              <Button title="Cancel" onPress={() => setEditModalVisible(false)} color={COLORS.muted} />
              <Button title="Update" onPress={handleUpdate} color={COLORS.primary} />
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  loadingText: {
    color: COLORS.text,
    marginTop: 10,
    fontSize: 16,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    padding: 20,
  },
  errorText: {
    color: COLORS.error,
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 20,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  emptyText: {
    color: COLORS.muted,
    fontSize: 18,
    marginBottom: 20,
    textAlign: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 15,
    backgroundColor: COLORS.card,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerTitle: {
    color: COLORS.text,
    fontSize: 20,
    fontWeight: 'bold',
  },
  createButton: {
    backgroundColor: COLORS.primary,
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
  },
  createButtonText: {
    color: COLORS.text,
    fontSize: 20,
    fontWeight: 'bold',
  },
  searchInput: {
    height: 40,
    backgroundColor: COLORS.card,
    margin: 10,
    borderRadius: 8,
    paddingHorizontal: 15,
    color: COLORS.text,
  },
  itemContainer: {
    backgroundColor: COLORS.card,
    padding: 15,
    marginHorizontal: 10,
    marginVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  itemTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  itemText: {
    color: COLORS.muted,
    fontSize: 14,
    marginBottom: 3,
  },
  itemActions: {
    flexDirection: 'row',
    marginTop: 10,
    justifyContent: 'flex-end',
  },
  actionButton: {
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 5,
    marginLeft: 10,
  },
  actionButtonText: {
    color: COLORS.text,
    fontWeight: 'bold',
  },
  statusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    fontWeight: 'bold',
    fontSize: 12,
  },
  statusActive: {
    backgroundColor: COLORS.success,
    color: COLORS.background,
  },
  statusInactive: {
    backgroundColor: COLORS.muted,
    color: COLORS.background,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  modalContainer: {
    width: '80%',
    backgroundColor: COLORS.background,
    borderRadius: 10,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalTitle: {
    color: COLORS.text,
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  input: {
    width: '100%',
    height: 45,
    backgroundColor: COLORS.card,
    borderRadius: 8,
    paddingHorizontal: 15,
    color: COLORS.text,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    marginTop: 10,
  },
});

export default TerminalMapScreen;
