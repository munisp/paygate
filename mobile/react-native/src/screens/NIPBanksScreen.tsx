import React, { useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, FlatList, SafeAreaView, StatusBar, RefreshControl, TouchableOpacity, Alert, Modal, TextInput, Button } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { trpc } from '../lib/trpc'; // Assuming trpc client is available here

const COLORS = {
  primary: '#6366F1', background: '#0F172A', card: '#1E293B',
  text: '#F1F5F9', muted: '#94A3B8', success: '#10B981',
  error: '#EF4444', warning: '#F59E0B', border: '#334155',
};

interface NIPBank {
  id: string;
  name: string;
  code: string;
  status: 'active' | 'inactive';
  createdAt: string;
  updatedAt: string;
}

const NIPBanksScreen = () => {
  const navigation = useNavigation();
  const [isModalVisible, setModalVisible] = useState(false);
  const [editingBank, setEditingBank] = useState<NIPBank | null>(null);
  const [bankName, setBankName] = useState('');
  const [bankCode, setBankCode] = useState('');

  const { data: nipBanks, isLoading, isError, refetch, isRefetching } = trpc.nipBanks.list.useQuery();
  const createMutation = trpc.nipBanks.create.useMutation();
  const updateMutation = trpc.nipBanks.update.useMutation();
  const deleteMutation = trpc.nipBanks.delete.useMutation();

  const handleCreateBank = async () => {
    if (!bankName || !bankCode) {
      Alert.alert('Error', 'Bank name and code are required.');
      return;
    }
    try {
      await createMutation.mutateAsync({ name: bankName, code: bankCode });
      setModalVisible(false);
      setBankName('');
      setBankCode('');
      refetch();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to create bank.');
    }
  };

  const handleUpdateBank = async () => {
    if (!editingBank || !bankName || !bankCode) {
      Alert.alert('Error', 'Bank details are incomplete.');
      return;
    }
    try {
      await updateMutation.mutateAsync({ id: editingBank.id, name: bankName, code: bankCode });
      setModalVisible(false);
      setEditingBank(null);
      setBankName('');
      setBankCode('');
      refetch();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to update bank.');
    }
  };

  const handleDeleteBank = (id: string) => {
    Alert.alert(
      'Confirm Delete',
      'Are you sure you want to delete this bank?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteMutation.mutateAsync({ id });
              refetch();
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to delete bank.');
            }
          },
        },
      ]
    );
  };

  const openCreateModal = () => {
    setEditingBank(null);
    setBankName('');
    setBankCode('');
    setModalVisible(true);
  };

  const openEditModal = (bank: NIPBank) => {
    setEditingBank(bank);
    setBankName(bank.name);
    setBankCode(bank.code);
    setModalVisible(true);
  };

  const renderItem = ({ item }: { item: NIPBank }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.bankName}>{item.name}</Text>
        <View style={[styles.statusBadge, item.status === 'active' ? styles.activeBadge : styles.inactiveBadge]}>
          <Text style={styles.statusText}>{item.status.toUpperCase()}</Text>
        </View>
      </View>
      <Text style={styles.cardText}>Code: {item.code}</Text>
      <Text style={styles.cardText}>Created: {new Date(item.createdAt).toLocaleDateString()}</Text>
      <Text style={styles.cardText}>Updated: {new Date(item.updatedAt).toLocaleDateString()}</Text>
      <View style={styles.actions}>
        <TouchableOpacity onPress={() => openEditModal(item)} style={[styles.actionButton, styles.editButton]}>
          <Text style={styles.actionButtonText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => handleDeleteBank(item.id)} style={[styles.actionButton, styles.deleteButton]}>
          <Text style={styles.actionButtonText}>Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  if (isLoading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading NIP Banks...</Text>
      </SafeAreaView>
    );
  }

  if (isError) {
    return (
      <SafeAreaView style={styles.errorContainer}>
        <Text style={styles.errorText}>Failed to load NIP Banks.</Text>
        <Button title="Retry" onPress={() => refetch()} color={COLORS.primary} />
      </SafeAreaView>
    );
  }

  if (!nipBanks || nipBanks.length === 0) {
    return (
      <SafeAreaView style={styles.emptyContainer}>
        <Text style={styles.emptyText}>No NIP Banks found.</Text>
        <Button title="Create New Bank" onPress={openCreateModal} color={COLORS.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>NIP Banks</Text>
        <TouchableOpacity onPress={openCreateModal} style={styles.createButton}>
          <Text style={styles.createButtonText}>+ Add Bank</Text>
        </TouchableOpacity>
      </View>
      <FlatList
        data={nipBanks}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor={COLORS.primary}
            colors={[COLORS.primary]}
            progressBackgroundColor={COLORS.card}
          />
        }
      />

      <Modal
        animationType="slide"
        transparent={true}
        visible={isModalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{editingBank ? 'Edit Bank' : 'Create New Bank'}</Text>
            <TextInput
              style={styles.input}
              placeholder="Bank Name"
              placeholderTextColor={COLORS.muted}
              value={bankName}
              onChangeText={setBankName}
            />
            <TextInput
              style={styles.input}
              placeholder="Bank Code"
              placeholderTextColor={COLORS.muted}
              value={bankCode}
              onChangeText={setBankCode}
              keyboardType="numeric"
            />
            <View style={styles.modalActions}>
              <Button title="Cancel" onPress={() => setModalVisible(false)} color={COLORS.muted} />
              <Button
                title={editingBank ? 'Update' : 'Create'}
                onPress={editingBank ? handleUpdateBank : handleCreateBank}
                color={COLORS.primary}
              />
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
    fontSize: 18,
    textAlign: 'center',
    marginBottom: 20,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    padding: 20,
  },
  emptyText: {
    color: COLORS.muted,
    fontSize: 18,
    textAlign: 'center',
    marginBottom: 20,
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
    fontSize: 22,
    fontWeight: 'bold',
  },
  createButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 5,
  },
  createButtonText: {
    color: COLORS.text,
    fontWeight: 'bold',
  },
  listContent: {
    padding: 10,
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 8,
    padding: 15,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  bankName: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: 'bold',
  },
  cardText: {
    color: COLORS.muted,
    fontSize: 14,
    marginBottom: 5,
  },
  statusBadge: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 15,
  },
  activeBadge: {
    backgroundColor: COLORS.success,
  },
  inactiveBadge: {
    backgroundColor: COLORS.error,
  },
  statusText: {
    color: COLORS.background,
    fontSize: 12,
    fontWeight: 'bold',
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
  editButton: {
    backgroundColor: COLORS.primary,
  },
  deleteButton: {
    backgroundColor: COLORS.error,
  },
  actionButtonText: {
    color: COLORS.text,
    fontWeight: 'bold',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  modalContent: {
    backgroundColor: COLORS.card,
    borderRadius: 10,
    padding: 20,
    width: '80%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  modalTitle: {
    color: COLORS.text,
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  input: {
    backgroundColor: COLORS.background,
    color: COLORS.text,
    borderRadius: 5,
    padding: 10,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 10,
  },
});

export default NIPBanksScreen;