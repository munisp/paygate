import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, ScrollView, RefreshControl, Alert, TextInput, TouchableOpacity, Modal, Button, SafeAreaView, StatusBar } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { trpc } from '../lib/trpc';

const COLORS = {
  primary: '#6366F1', background: '#0F172A', card: '#1E293B',
  text: '#F1F5F9', muted: '#94A3B8', success: '#10B981',
  error: '#EF4444', warning: '#F59E0B', border: '#334155',
};

type ChecklistItem = {
  id: string;
  name: string;
  status: 'pending' | 'completed' | 'failed';
  dueDate: string;
  notes?: string;
};

const GoLiveChecklistScreen = () => {
  const navigation = useNavigation();
  const [searchText, setSearchText] = useState('');
  const [isCreateModalVisible, setCreateModalVisible] = useState(false);
  const [isEditModalVisible, setEditModalVisible] = useState(false);
  const [currentItem, setCurrentItem] = useState<ChecklistItem | null>(null);
  const [newItemName, setNewItemName] = useState('');
  const [newItemDueDate, setNewItemDueDate] = useState('');
  const [newItemNotes, setNewItemNotes] = useState('');

  // tRPC integration
  const { data, isLoading, isError, error, refetch } = trpc.goLiveChecklist.list.useQuery();
  const createMutation = trpc.goLiveChecklist.create.useMutation();
  const updateMutation = trpc.goLiveChecklist.update.useMutation();
  const deleteMutation = trpc.goLiveChecklist.delete.useMutation();

  const onRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  const filteredData = data?.filter(item =>
    item.name.toLowerCase().includes(searchText.toLowerCase())
  );

  const handleCreate = async () => {
    if (!newItemName || !newItemDueDate) {
      Alert.alert('Error', 'Name and Due Date are required.');
      return;
    }
    try {
      await createMutation.mutateAsync({
        name: newItemName,
        dueDate: newItemDueDate,
        notes: newItemNotes,
      });
      setCreateModalVisible(false);
      setNewItemName('');
      setNewItemDueDate('');
      setNewItemNotes('');
      refetch();
    } catch (err: any) {
      Alert.alert('Error creating item', err.message);
    }
  };

  const handleEdit = async () => {
    if (!currentItem || !currentItem.name || !currentItem.dueDate) {
      Alert.alert('Error', 'Name and Due Date are required.');
      return;
    }
    try {
      await updateMutation.mutateAsync({
        id: currentItem.id,
        name: currentItem.name,
        dueDate: currentItem.dueDate,
        notes: currentItem.notes,
        status: currentItem.status, // Assuming status can also be updated
      });
      setEditModalVisible(false);
      setCurrentItem(null);
      refetch();
    } catch (err: any) {
      Alert.alert('Error updating item', err.message);
    }
  };

  const handleDelete = (id: string) => {
    Alert.alert(
      'Delete Item',
      'Are you sure you want to delete this item?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteMutation.mutateAsync({ id });
              refetch();
            } catch (err: any) {
              Alert.alert('Error deleting item', err.message);
            }
          },
        },
      ]
    );
  };

  const renderItem = ({ item }: { item: ChecklistItem }) => (
    <View style={styles.card}>
      <View style={styles.itemHeader}>
        <Text style={styles.itemName}>{item.name}</Text>
        <View style={[styles.statusBadge, styles[`status${item.status.charAt(0).toUpperCase() + item.status.slice(1)}`]]}>
          <Text style={styles.statusText}>{item.status.toUpperCase()}</Text>
        </View>
      </View>
      <Text style={styles.itemDetail}>Due: {new Date(item.dueDate).toLocaleDateString()}</Text>
      {item.notes && <Text style={styles.itemDetail}>Notes: {item.notes}</Text>}
      <View style={styles.actions}>
        <TouchableOpacity onPress={() => { setCurrentItem(item); setEditModalVisible(true); }} style={[styles.actionButton, { backgroundColor: COLORS.primary }]}>
          <Text style={styles.actionButtonText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => handleDelete(item.id)} style={[styles.actionButton, { backgroundColor: COLORS.error }]}>
          <Text style={styles.actionButtonText}>Delete</Text>
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
          <Text style={styles.loadingText}>Loading checklist...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (isError) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
        <View style={styles.centered}>
          <Text style={styles.errorText}>Error: {error?.message}</Text>
          <TouchableOpacity onPress={() => refetch()} style={styles.retryButton}>
            <Text style={styles.retryButtonText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      <View style={styles.header}>
        <Text style={styles.title}>Go-Live Checklist</Text>
        <TouchableOpacity onPress={() => setCreateModalVisible(true)} style={styles.createButton}>
          <Text style={styles.createButtonText}>Add Item</Text>
        </TouchableOpacity>
      </View>

      <TextInput
        style={styles.searchInput}
        placeholder="Search checklist items..."
        placeholderTextColor={COLORS.muted}
        value={searchText}
        onChangeText={setSearchText}
      />

      {filteredData && filteredData.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyText}>No checklist items found.</Text>
          <TouchableOpacity onPress={() => setCreateModalVisible(true)} style={styles.createButton}>
            <Text style={styles.createButtonText}>Add New Item</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollViewContent}
          refreshControl={
            <RefreshControl
              refreshing={isLoading}
              onRefresh={onRefresh}
              tintColor={COLORS.primary}
            />
          }
        >
          {filteredData?.map(item => renderItem({ item }))}
        </ScrollView>
      )}

      {/* Create Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isCreateModalVisible}
        onRequestClose={() => setCreateModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Create New Checklist Item</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Item Name"
              placeholderTextColor={COLORS.muted}
              value={newItemName}
              onChangeText={setNewItemName}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Due Date (YYYY-MM-DD)"
              placeholderTextColor={COLORS.muted}
              value={newItemDueDate}
              onChangeText={setNewItemDueDate}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Notes (Optional)"
              placeholderTextColor={COLORS.muted}
              value={newItemNotes}
              onChangeText={setNewItemNotes}
              multiline
            />
            <View style={styles.modalActions}>
              <Button title="Cancel" onPress={() => setCreateModalVisible(false)} color={COLORS.error} />
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
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Edit Checklist Item</Text>
            {currentItem && (
              <>
                <TextInput
                  style={styles.modalInput}
                  placeholder="Item Name"
                  placeholderTextColor={COLORS.muted}
                  value={currentItem.name}
                  onChangeText={(text) => setCurrentItem({ ...currentItem, name: text })}
                />
                <TextInput
                  style={styles.modalInput}
                  placeholder="Due Date (YYYY-MM-DD)"
                  placeholderTextColor={COLORS.muted}
                  value={currentItem.dueDate}
                  onChangeText={(text) => setCurrentItem({ ...currentItem, dueDate: text })}
                />
                <TextInput
                  style={styles.modalInput}
                  placeholder="Notes (Optional)"
                  placeholderTextColor={COLORS.muted}
                  value={currentItem.notes}
                  onChangeText={(text) => setCurrentItem({ ...currentItem, notes: text })}
                  multiline
                />
                {/* Assuming status can be edited via a picker or similar, for now, just showing */}
                <Text style={styles.modalLabel}>Status:</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="Status (pending, completed, failed)"
                  placeholderTextColor={COLORS.muted}
                  value={currentItem.status}
                  onChangeText={(text: 'pending' | 'completed' | 'failed') => setCurrentItem({ ...currentItem, status: text })}
                />
              </>
            )}
            <View style={styles.modalActions}>
              <Button title="Cancel" onPress={() => setEditModalVisible(false)} color={COLORS.error} />
              <Button title="Save" onPress={handleEdit} color={COLORS.primary} />
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
  createButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 5,
  },
  createButtonText: {
    color: COLORS.text,
    fontWeight: 'bold',
  },
  searchInput: {
    backgroundColor: COLORS.card,
    color: COLORS.text,
    padding: 12,
    margin: 16,
    borderRadius: 8,
  },
  scrollView: {
    flex: 1,
  },
  scrollViewContent: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  itemName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
    flexShrink: 1,
    marginRight: 10,
  },
  itemDetail: {
    fontSize: 14,
    color: COLORS.muted,
    marginBottom: 4,
  },
  statusBadge: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 15,
  },
  statusText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: COLORS.background,
  },
  statusPending: {
    backgroundColor: COLORS.warning,
  },
  statusCompleted: {
    backgroundColor: COLORS.success,
  },
  statusFailed: {
    backgroundColor: COLORS.error,
  },
  actions: {
    flexDirection: 'row',
    marginTop: 10,
    justifyContent: 'flex-end',
  },
  actionButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 5,
    marginLeft: 10,
  },
  actionButtonText: {
    color: COLORS.text,
    fontWeight: 'bold',
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
  retryButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 5,
    marginTop: 15,
  },
  retryButtonText: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: 'bold',
  },
  emptyText: {
    color: COLORS.muted,
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 20,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  modalContent: {
    backgroundColor: COLORS.card,
    borderRadius: 10,
    padding: 20,
    width: '80%',
    maxHeight: '70%',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 15,
  },
  modalInput: {
    backgroundColor: COLORS.background,
    color: COLORS.text,
    padding: 10,
    borderRadius: 5,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalLabel: {
    color: COLORS.muted,
    marginBottom: 5,
    marginTop: 10,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 20,
  },
});

export default GoLiveChecklistScreen;