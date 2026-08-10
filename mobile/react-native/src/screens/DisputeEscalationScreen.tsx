import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  TouchableOpacity,
  Alert,
  TextInput,
  Modal,
  Button,
  RefreshControl,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { trpc } from '../lib/trpc'; // Assuming this path is correct

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

// Type definitions for dispute escalation data
interface DisputeEscalation {
  id: string;
  caseId: string;
  merchantId: string;
  amount: number;
  currency: 'NGN' | 'USD';
  status: 'PENDING' | 'RESOLVED' | 'REJECTED' | 'ESCALATED';
  reason: string;
  createdAt: string;
  updatedAt: string;
}

const DisputeEscalationScreen = () => {
  const navigation = useNavigation();
  const [searchText, setSearchText] = useState('');
  const [isCreateModalVisible, setCreateModalVisible] = useState(false);
  const [isEditModalVisible, setEditModalVisible] = useState(false);
  const [selectedDispute, setSelectedDispute] = useState<DisputeEscalation | null>(null);

  // tRPC queries and mutations
  const { data, isLoading, isError, error, refetch, isRefetching } = trpc.disputeEscalation.list.useQuery(
    { search: searchText },
    { staleTime: 5 * 60 * 1000 } // Cache data for 5 minutes
  );
  const createMutation = trpc.disputeEscalation.create.useMutation();
  const updateMutation = trpc.disputeEscalation.update.useMutation();
  const deleteMutation = trpc.disputeEscalation.delete.useMutation();

  const handleRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  // --- Helper Functions ---
  const formatAmount = (amount: number, currency: 'NGN' | 'USD') => {
    const formatter = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency === 'NGN' ? 'NGN' : 'USD',
      minimumFractionDigits: 2,
    });
    return formatter.format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const getStatusBadgeStyle = (status: DisputeEscalation['status']) => {
    switch (status) {
      case 'PENDING':
        return { backgroundColor: COLORS.warning };
      case 'RESOLVED':
        return { backgroundColor: COLORS.success };
      case 'REJECTED':
        return { backgroundColor: COLORS.error };
      case 'ESCALATED':
        return { backgroundColor: COLORS.primary };
      default:
        return { backgroundColor: COLORS.muted };
    }
  };

  // --- CRUD Operations ---
  const handleCreateDispute = async (newDisputeData: Omit<DisputeEscalation, 'id' | 'createdAt' | 'updatedAt'>) => {
    try {
      await createMutation.mutateAsync(newDisputeData);
      setCreateModalVisible(false);
      refetch();
    } catch (err) {
      Alert.alert('Error', 'Failed to create dispute: ' + (err as Error).message);
    }
  };

  const handleUpdateDispute = async (updatedDisputeData: DisputeEscalation) => {
    try {
      await updateMutation.mutateAsync(updatedDisputeData);
      setEditModalVisible(false);
      setSelectedDispute(null);
      refetch();
    } catch (err) {
      Alert.alert('Error', 'Failed to update dispute: ' + (err as Error).message);
    }
  };

  const handleDeleteDispute = (id: string) => {
    Alert.alert(
      'Confirm Delete',
      'Are you sure you want to delete this dispute escalation?',
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
              Alert.alert('Error', 'Failed to delete dispute: ' + (err as Error).message);
            }
          },
        },
      ],
      { cancelable: true }
    );
  };

  const renderItem = ({ item }: { item: DisputeEscalation }) => (
    <TouchableOpacity
      style={styles.card}
      onPress={() => {
        setSelectedDispute(item);
        setEditModalVisible(true);
      }}
    >
      <View style={styles.cardHeader}>
        <Text style={styles.caseIdText}>Case ID: {item.caseId}</Text>
        <View style={[styles.statusBadge, getStatusBadgeStyle(item.status)]}>
          <Text style={styles.statusBadgeText}>{item.status}</Text>
        </View>
      </View>
      <Text style={styles.cardText}>Merchant ID: {item.merchantId}</Text>
      <Text style={styles.cardText}>Amount: {formatAmount(item.amount, item.currency)}</Text>
      <Text style={styles.cardText}>Reason: {item.reason}</Text>
      <Text style={styles.cardText}>Created: {formatDate(item.createdAt)}</Text>
      <View style={styles.cardActions}>
        <TouchableOpacity style={styles.actionButton} onPress={() => {
          // Example: Navigate to a detail screen or perform another action
          Alert.alert('Action', `View details for ${item.caseId}`);
        }}>
          <Text style={styles.actionButtonText}>View Details</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionButton, { backgroundColor: COLORS.error }]} onPress={() => handleDeleteDispute(item.id)}>
          <Text style={styles.actionButtonText}>Delete</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );

  if (isLoading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading dispute escalations...</Text>
      </SafeAreaView>
    );
  }

  if (isError) {
    return (
      <SafeAreaView style={styles.errorContainer}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
        <Text style={styles.errorText}>Error: {error?.message || 'Failed to fetch disputes'}</Text>
        <Button title="Retry" onPress={() => refetch()} color={COLORS.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      <View style={styles.header}>
        <Text style={styles.title}>Dispute Escalations</Text>
        <TouchableOpacity style={styles.createButton} onPress={() => setCreateModalVisible(true)}>
          <Text style={styles.createButtonText}>+ Create New</Text>
        </TouchableOpacity>
      </View>

      <TextInput
        style={styles.searchInput}
        placeholder="Search by Case ID or Merchant ID..."
        placeholderTextColor={COLORS.muted}
        value={searchText}
        onChangeText={setSearchText}
      />

      {data?.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No dispute escalations found.</Text>
          <Button title="Refresh" onPress={() => refetch()} color={COLORS.primary} />
        </View>
      ) : (
        <FlatList
          data={data}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={handleRefresh}
              tintColor={COLORS.primary}
              colors={[COLORS.primary]}
              progressBackgroundColor={COLORS.card}
            />
          }
        />
      )}

      {/* Create Dispute Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isCreateModalVisible}
        onRequestClose={() => setCreateModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Create New Dispute</Text>
            {/* Form fields for new dispute */}
            <TextInput style={styles.input} placeholder="Case ID" placeholderTextColor={COLORS.muted} />
            <TextInput style={styles.input} placeholder="Merchant ID" placeholderTextColor={COLORS.muted} />
            <TextInput style={styles.input} placeholder="Amount" keyboardType="numeric" placeholderTextColor={COLORS.muted} />
            <TextInput style={styles.input} placeholder="Currency (NGN/USD)" placeholderTextColor={COLORS.muted} />
            <TextInput style={styles.input} placeholder="Reason" placeholderTextColor={COLORS.muted} />
            <View style={styles.modalActions}>
              <Button title="Cancel" onPress={() => setCreateModalVisible(false)} color={COLORS.muted} />
              <Button title="Create" onPress={() => handleCreateDispute({
                caseId: 'NEW_CASE_123',
                merchantId: 'NEW_MERCHANT_456',
                amount: 1000,
                currency: 'NGN',
                status: 'PENDING',
                reason: 'New dispute reason',
              })} color={COLORS.primary} />
            </View>
          </View>
        </View>
      </Modal>

      {/* Edit Dispute Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isEditModalVisible}
        onRequestClose={() => setEditModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Edit Dispute: {selectedDispute?.caseId}</Text>
            {/* Form fields for editing dispute */}
            <TextInput style={styles.input} value={selectedDispute?.caseId} placeholderTextColor={COLORS.muted} />
            <TextInput style={styles.input} value={selectedDispute?.merchantId} placeholderTextColor={COLORS.muted} />
            <TextInput style={styles.input} value={String(selectedDispute?.amount)} keyboardType="numeric" placeholderTextColor={COLORS.muted} />
            <TextInput style={styles.input} value={selectedDispute?.currency} placeholderTextColor={COLORS.muted} />
            <TextInput style={styles.input} value={selectedDispute?.reason} placeholderTextColor={COLORS.muted} />
            <View style={styles.modalActions}>
              <Button title="Cancel" onPress={() => setEditModalVisible(false)} color={COLORS.muted} />
              <Button title="Save" onPress={() => selectedDispute && handleUpdateDispute(selectedDispute)} color={COLORS.primary} />
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
    fontSize: 16,
    marginBottom: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 15,
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
    paddingHorizontal: 15,
    borderRadius: 5,
  },
  createButtonText: {
    color: COLORS.text,
    fontWeight: 'bold',
  },
  searchInput: {
    backgroundColor: COLORS.card,
    color: COLORS.text,
    padding: 10,
    margin: 15,
    borderRadius: 5,
    fontSize: 16,
  },
  listContent: {
    paddingHorizontal: 15,
    paddingBottom: 15,
  },
  card: {
    backgroundColor: COLORS.card,
    padding: 15,
    borderRadius: 8,
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
  caseIdText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  statusBadge: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 15,
  },
  statusBadgeText: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: 'bold',
  },
  cardText: {
    color: COLORS.muted,
    marginBottom: 5,
    fontSize: 14,
  },
  cardActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 10,
  },
  actionButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 5,
    marginLeft: 10,
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
    backgroundColor: COLORS.background,
    padding: 20,
    borderRadius: 10,
    width: '90%',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 20,
    textAlign: 'center',
  },
  input: {
    backgroundColor: COLORS.card,
    color: COLORS.text,
    padding: 12,
    borderRadius: 5,
    marginBottom: 15,
    fontSize: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 20,
  },
});

export default DisputeEscalationScreen;
