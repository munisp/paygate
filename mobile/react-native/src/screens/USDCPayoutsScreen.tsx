import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  TextInput,
  TouchableOpacity,
  Alert,
  Modal,
  RefreshControl,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { trpc } from '../lib/trpc';

// Design system colors
const COLORS = {
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

// Dummy types for tRPC data - replace with actual tRPC types
interface USDCPayout {
  id: string;
  amount: number;
  currency: 'USD' | 'NGN';
  status: 'pending' | 'completed' | 'failed';
  recipient: string;
  createdAt: string;
  updatedAt: string;
}

interface CreateUSDCPayoutInput {
  amount: number;
  currency: 'USD' | 'NGN';
  recipient: string;
}

interface UpdateUSDCPayoutInput {
  id: string;
  amount?: number;
  currency?: 'USD' | 'NGN';
  recipient?: string;
  status?: 'pending' | 'completed' | 'failed';
}

const USDCPayoutsScreen = () => {
  const navigation = useNavigation();
  const [searchText, setSearchText] = useState('');
  const [isCreateModalVisible, setCreateModalVisible] = useState(false);
  const [isEditModalVisible, setEditModalVisible] = useState(false);
  const [editingPayout, setEditingPayout] = useState<USDCPayout | null>(null);

  // tRPC queries and mutations
  const { data, isLoading, isError, error, refetch } = trpc.usdcPayouts.list.useQuery();
  const createMutation = trpc.usdcPayouts.create.useMutation();
  const updateMutation = trpc.usdcPayouts.update.useMutation();
  const deleteMutation = trpc.usdcPayouts.delete.useMutation();

  const onRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  const filteredPayouts = data?.filter(payout =>
    payout.recipient.toLowerCase().includes(searchText.toLowerCase())
  );

  const formatCurrency = (amount: number, currency: 'USD' | 'NGN') => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(new Date(dateString));
  };

  const getStatusStyle = (status: USDCPayout['status']) => {
    switch (status) {
      case 'completed':
        return styles.statusCompleted;
      case 'pending':
        return styles.statusPending;
      case 'failed':
        return styles.statusFailed;
      default:
        return styles.statusPending;
    }
  };

  const handleCreatePayout = async (newPayout: CreateUSDCPayoutInput) => {
    try {
      await createMutation.mutateAsync(newPayout);
      refetch();
      setCreateModalVisible(false);
    } catch (err) {
      Alert.alert('Error', 'Failed to create payout.');
      console.error('Create Payout Error:', err);
    }
  };

  const handleUpdatePayout = async (updatedPayout: UpdateUSDCPayoutInput) => {
    if (!editingPayout) return;
    try {
      await updateMutation.mutateAsync(updatedPayout);
      refetch();
      setEditModalVisible(false);
      setEditingPayout(null);
    } catch (err) {
      Alert.alert('Error', 'Failed to update payout.');
      console.error('Update Payout Error:', err);
    }
  };

  const handleDeletePayout = (id: string) => {
    Alert.alert(
      'Confirm Delete',
      'Are you sure you want to delete this payout?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteMutation.mutateAsync({ id });
              refetch();
            } catch (err) {
              Alert.alert('Error', 'Failed to delete payout.');
              console.error('Delete Payout Error:', err);
            }
          },
        },
      ],
      { cancelable: true }
    );
  };

  const renderPayoutItem = ({ item }: { item: USDCPayout }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>{item.recipient}</Text>
        <Text style={[styles.statusBadge, getStatusStyle(item.status)]}>
          {item.status.toUpperCase()}
        </Text>
      </View>
      <Text style={styles.cardText}>Amount: {formatCurrency(item.amount, item.currency)}</Text>
      <Text style={styles.cardText}>Created: {formatDate(item.createdAt)}</Text>
      <View style={styles.cardActions}>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => {
            setEditingPayout(item);
            setEditModalVisible(true);
          }}
        >
          <Text style={styles.actionButtonText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionButton, styles.deleteButton]}
          onPress={() => handleDeletePayout(item.id)}
        >
          <Text style={styles.actionButtonText}>Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  if (isLoading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading USDCPayouts...</Text>
      </SafeAreaView>
    );
  }

  if (isError) {
    return (
      <SafeAreaView style={styles.errorContainer}>
        <Text style={styles.errorText}>Error: {error?.message || 'Failed to fetch payouts'}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={refetch}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>USDCPayouts</Text>
        <TouchableOpacity
          style={styles.createButton}
          onPress={() => setCreateModalVisible(true)}
        >
          <Text style={styles.createButtonText}>+ New Payout</Text>
        </TouchableOpacity>
      </View>
      <TextInput
        style={styles.searchInput}
        placeholder="Search recipients..."
        placeholderTextColor={COLORS.muted}
        value={searchText}
        onChangeText={setSearchText}
      />
      {filteredPayouts && filteredPayouts.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No USDCPayouts found.</Text>
          <TouchableOpacity
            style={styles.createButton}
            onPress={() => setCreateModalVisible(true)}
          >
            <Text style={styles.createButtonText}>Create First Payout</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={filteredPayouts}
          keyExtractor={(item) => item.id}
          renderItem={renderPayoutItem}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={isLoading}
              onRefresh={onRefresh}
              tintColor={COLORS.primary}
            />
          }
        />
      )}

      {/* Create Payout Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isCreateModalVisible}
        onRequestClose={() => setCreateModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Create New Payout</Text>
            {/* Form fields for new payout */}
            <TextInput style={styles.modalInput} placeholderTextColor={COLORS.muted} placeholder="Amount" keyboardType="numeric" />
            <TextInput style={styles.modalInput} placeholderTextColor={COLORS.muted} placeholder="Currency (USD/NGN)" />
            <TextInput style={styles.modalInput} placeholderTextColor={COLORS.muted} placeholder="Recipient" />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalButton} onPress={() => setCreateModalVisible(false)}>
                <Text style={styles.modalButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalPrimaryButton]}
                onPress={() => handleCreatePayout({ amount: 100, currency: 'USD', recipient: 'New User' })} // Dummy data
              >
                <Text style={styles.modalButtonText}>Create</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Edit Payout Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isEditModalVisible}
        onRequestClose={() => setEditModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Edit Payout</Text>
            {editingPayout && (
              <>
                <TextInput style={styles.modalInput} placeholderTextColor={COLORS.muted} placeholder="Amount" keyboardType="numeric" defaultValue={String(editingPayout.amount)} />
                <TextInput style={styles.modalInput} placeholderTextColor={COLORS.muted} placeholder="Currency (USD/NGN)" defaultValue={editingPayout.currency} />
                <TextInput style={styles.modalInput} placeholderTextColor={COLORS.muted} placeholder="Recipient" defaultValue={editingPayout.recipient} />
                <TextInput style={styles.modalInput} placeholderTextColor={COLORS.muted} placeholder="Status" defaultValue={editingPayout.status} />
              </>
            )}
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalButton} onPress={() => setEditModalVisible(false)}>
                <Text style={styles.modalButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalPrimaryButton]}
                onPress={() => handleUpdatePayout({ id: editingPayout?.id || '', amount: 150, currency: 'NGN', recipient: 'Updated User', status: 'completed' })} // Dummy data
              >
                <Text style={styles.modalButtonText}>Save</Text>
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  loadingText: {
    marginTop: 10,
    color: COLORS.text,
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
    marginBottom: 10,
  },
  retryButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 5,
  },
  retryButtonText: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: 'bold',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  emptyText: {
    color: COLORS.muted,
    fontSize: 16,
    marginBottom: 20,
    textAlign: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerTitle: {
    color: COLORS.text,
    fontSize: 24,
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
    fontSize: 16,
    fontWeight: 'bold',
  },
  searchInput: {
    height: 40,
    backgroundColor: COLORS.card,
    margin: 15,
    borderRadius: 8,
    paddingHorizontal: 15,
    color: COLORS.text,
    fontSize: 16,
  },
  listContent: {
    paddingHorizontal: 15,
    paddingBottom: 20,
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 10,
    padding: 15,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  cardTitle: {
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
    borderRadius: 5,
    fontWeight: 'bold',
    fontSize: 12,
  },
  statusCompleted: {
    backgroundColor: COLORS.success,
    color: COLORS.background,
  },
  statusPending: {
    backgroundColor: COLORS.warning,
    color: COLORS.background,
  },
  statusFailed: {
    backgroundColor: COLORS.error,
    color: COLORS.text,
  },
  cardActions: {
    flexDirection: 'row',
    marginTop: 10,
    justifyContent: 'flex-end',
  },
  actionButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 5,
    marginLeft: 10,
  },
  deleteButton: {
    backgroundColor: COLORS.error,
  },
  actionButtonText: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: 'bold',
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
    color: COLORS.text,
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  modalInput: {
    backgroundColor: COLORS.background,
    color: COLORS.text,
    borderRadius: 8,
    paddingHorizontal: 15,
    height: 45,
    marginBottom: 15,
    fontSize: 16,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 20,
  },
  modalButton: {
    backgroundColor: COLORS.muted,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    minWidth: 100,
    alignItems: 'center',
  },
  modalPrimaryButton: {
    backgroundColor: COLORS.primary,
  },
  modalButtonText: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default USDCPayoutsScreen;
