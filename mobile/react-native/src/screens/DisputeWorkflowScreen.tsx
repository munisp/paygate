import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, FlatList, RefreshControl, SafeAreaView, StatusBar, TouchableOpacity, Alert, Modal, TextInput, Button } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { trpc } from '../lib/trpc'; // Assuming trpc client is available at this path

// Design system colors
const COLORS = {
  primary: '#6366F1', background: '#0F172A', card: '#1E293B',
  text: '#F1F5F9', muted: '#94A3B8', success: '#10B981',
  error: '#EF4444', warning: '#F59E0B', border: '#334155',
};

// Type definitions for Dispute (example, adjust based on actual tRPC output)
interface Dispute {
  id: string;
  amount: number;
  currency: 'NGN' | 'USD';
  status: 'PENDING' | 'RESOLVED' | 'REJECTED';
  createdAt: string;
  reason: string;
}

const DisputeWorkflowScreen = () => {
  const navigation = useNavigation();

  // tRPC queries and mutations
  const { data: disputes, isLoading, isError, error, refetch } = trpc.disputeWorkflow.list.useQuery();
  const createMutation = trpc.disputeWorkflow.create.useMutation();
  const updateMutation = trpc.disputeWorkflow.update.useMutation();
  const deleteMutation = trpc.disputeWorkflow.delete.useMutation();

  const [refreshing, setRefreshing] = useState(false);
  const [isCreateModalVisible, setCreateModalVisible] = useState(false);
  const [isEditModalVisible, setEditModalVisible] = useState(false);
  const [currentDispute, setCurrentDispute] = useState<Dispute | null>(null);
  const [newDisputeReason, setNewDisputeReason] = useState('');
  const [newDisputeAmount, setNewDisputeAmount] = useState('');
  const [newDisputeCurrency, setNewDisputeCurrency] = useState<'NGN' | 'USD'>('NGN');

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, []);

  const formatAmount = (amount: number, currency: 'NGN' | 'USD') => {
    if (currency === 'NGN') {
      return `₦${amount.toFixed(2)}`;
    } else if (currency === 'USD') {
      return `$${amount.toFixed(2)}`;
    }
    return amount.toFixed(2);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  const getStatusBadgeColor = (status: Dispute['status']) => {
    switch (status) {
      case 'PENDING': return COLORS.warning;
      case 'RESOLVED': return COLORS.success;
      case 'REJECTED': return COLORS.error;
      default: return COLORS.muted;
    }
  };

  const handleCreateDispute = async () => {
    if (!newDisputeReason || !newDisputeAmount) {
      Alert.alert('Error', 'Reason and Amount are required.');
      return;
    }
    try {
      await createMutation.mutateAsync({
        reason: newDisputeReason,
        amount: parseFloat(newDisputeAmount),
        currency: newDisputeCurrency,
      });
      setCreateModalVisible(false);
      setNewDisputeReason('');
      setNewDisputeAmount('');
      refetch();
    } catch (err: any) {
      Alert.alert('Error creating dispute', err.message || 'An unknown error occurred');
    }
  };

  const handleEditDispute = async () => {
    if (!currentDispute || !newDisputeReason || !newDisputeAmount) {
      Alert.alert('Error', 'All fields are required.');
      return;
    }
    try {
      await updateMutation.mutateAsync({
        id: currentDispute.id,
        reason: newDisputeReason,
        amount: parseFloat(newDisputeAmount),
        currency: newDisputeCurrency,
      });
      setEditModalVisible(false);
      setCurrentDispute(null);
      setNewDisputeReason('');
      setNewDisputeAmount('');
      refetch();
    } catch (err: any) {
      Alert.alert('Error updating dispute', err.message || 'An unknown error occurred');
    }
  };

  const handleDeleteDispute = (id: string) => {
    Alert.alert(
      'Delete Dispute',
      'Are you sure you want to delete this dispute?',
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
              Alert.alert('Error deleting dispute', err.message || 'An unknown error occurred');
            }
          },
        },
      ],
      { cancelable: true }
    );
  };

  const renderDisputeItem = ({ item }: { item: Dispute }) => (
    <View style={styles.disputeCard}>
      <View style={styles.cardHeader}>
        <Text style={styles.disputeId}>ID: {item.id}</Text>
        <View style={[styles.statusBadge, { backgroundColor: getStatusBadgeColor(item.status) }]}>
          <Text style={styles.statusText}>{item.status}</Text>
        </View>
      </View>
      <Text style={styles.disputeReason}>{item.reason}</Text>
      <Text style={styles.disputeAmount}>{formatAmount(item.amount, item.currency)}</Text>
      <Text style={styles.disputeDate}>Created: {formatDate(item.createdAt)}</Text>
      <View style={styles.cardActions}>
        <TouchableOpacity
          style={[styles.actionButton, { backgroundColor: COLORS.primary }]} 
          onPress={() => {
            setCurrentDispute(item);
            setNewDisputeReason(item.reason);
            setNewDisputeAmount(item.amount.toString());
            setNewDisputeCurrency(item.currency);
            setEditModalVisible(true);
          }}
        >
          <Text style={styles.actionButtonText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionButton, { backgroundColor: COLORS.error }]} 
          onPress={() => handleDeleteDispute(item.id)}
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
        <Text style={styles.loadingText}>Loading disputes...</Text>
      </SafeAreaView>
    );
  }

  if (isError) {
    return (
      <SafeAreaView style={styles.errorContainer}>
        <Text style={styles.errorText}>Error: {error?.message || 'Failed to fetch disputes'}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={() => refetch()}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Dispute Workflow</Text>
        <TouchableOpacity style={styles.createButton} onPress={() => setCreateModalVisible(true)}>
          <Text style={styles.createButtonText}>+ Create Dispute</Text>
        </TouchableOpacity>
      </View>

      {disputes && disputes.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No disputes found.</Text>
          <TouchableOpacity style={styles.createButton} onPress={() => setCreateModalVisible(true)}>
            <Text style={styles.createButtonText}>Create New Dispute</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={disputes}
          keyExtractor={(item) => item.id}
          renderItem={renderDisputeItem}
          contentContainerStyle={styles.listContentContainer}
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

      {/* Create Dispute Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isCreateModalVisible}
        onRequestClose={() => setCreateModalVisible(false)}
      >
        <View style={styles.centeredView}>
          <View style={styles.modalView}>
            <Text style={styles.modalTitle}>Create New Dispute</Text>
            <TextInput
              style={styles.input}
              placeholder="Reason for dispute"
              placeholderTextColor={COLORS.muted}
              value={newDisputeReason}
              onChangeText={setNewDisputeReason}
            />
            <TextInput
              style={styles.input}
              placeholder="Amount"
              placeholderTextColor={COLORS.muted}
              keyboardType="numeric"
              value={newDisputeAmount}
              onChangeText={setNewDisputeAmount}
            />
            <View style={styles.currencyToggle}>
              <TouchableOpacity
                style={[styles.currencyButton, newDisputeCurrency === 'NGN' && styles.currencyButtonActive]}
                onPress={() => setNewDisputeCurrency('NGN')}
              >
                <Text style={[styles.currencyButtonText, newDisputeCurrency === 'NGN' && styles.currencyButtonTextActive]}>₦ NGN</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.currencyButton, newDisputeCurrency === 'USD' && styles.currencyButtonActive]}
                onPress={() => setNewDisputeCurrency('USD')}
              >
                <Text style={[styles.currencyButtonText, newDisputeCurrency === 'USD' && styles.currencyButtonTextActive]}>$ USD</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.modalActions}>
              <Button title="Cancel" onPress={() => setCreateModalVisible(false)} color={COLORS.muted} />
              <Button title="Create" onPress={handleCreateDispute} color={COLORS.primary} />
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
        <View style={styles.centeredView}>
          <View style={styles.modalView}>
            <Text style={styles.modalTitle}>Edit Dispute</Text>
            <TextInput
              style={styles.input}
              placeholder="Reason for dispute"
              placeholderTextColor={COLORS.muted}
              value={newDisputeReason}
              onChangeText={setNewDisputeReason}
            />
            <TextInput
              style={styles.input}
              placeholder="Amount"
              placeholderTextColor={COLORS.muted}
              keyboardType="numeric"
              value={newDisputeAmount}
              onChangeText={setNewDisputeAmount}
            />
            <View style={styles.currencyToggle}>
              <TouchableOpacity
                style={[styles.currencyButton, newDisputeCurrency === 'NGN' && styles.currencyButtonActive]}
                onPress={() => setNewDisputeCurrency('NGN')}
              >
                <Text style={[styles.currencyButtonText, newDisputeCurrency === 'NGN' && styles.currencyButtonTextActive]}>₦ NGN</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.currencyButton, newDisputeCurrency === 'USD' && styles.currencyButtonActive]}
                onPress={() => setNewDisputeCurrency('USD')}
              >
                <Text style={[styles.currencyButtonText, newDisputeCurrency === 'USD' && styles.currencyButtonTextActive]}>$ USD</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.modalActions}>
              <Button title="Cancel" onPress={() => setEditModalVisible(false)} color={COLORS.muted} />
              <Button title="Save Changes" onPress={handleEditDispute} color={COLORS.primary} />
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
    backgroundColor: COLORS.card,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerTitle: {
    fontSize: 22,
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  loadingText: {
    marginTop: 10,
    color: COLORS.muted,
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
    marginBottom: 15,
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
    backgroundColor: COLORS.background,
    padding: 20,
  },
  emptyText: {
    color: COLORS.muted,
    fontSize: 18,
    textAlign: 'center',
    marginBottom: 20,
  },
  listContentContainer: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  disputeCard: {
    backgroundColor: COLORS.card,
    borderRadius: 8,
    padding: 15,
    marginVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  disputeId: {
    color: COLORS.muted,
    fontSize: 12,
  },
  statusBadge: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 15,
  },
  statusText: {
    color: COLORS.text,
    fontWeight: 'bold',
    fontSize: 12,
  },
  disputeReason: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  disputeAmount: {
    color: COLORS.primary,
    fontSize: 15,
    marginBottom: 5,
  },
  disputeDate: {
    color: COLORS.muted,
    fontSize: 13,
    marginBottom: 10,
  },
  cardActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 10,
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
  centeredView: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalView: {
    margin: 20,
    backgroundColor: COLORS.card,
    borderRadius: 20,
    padding: 35,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
    width: '90%',
  },
  modalTitle: {
    marginBottom: 15,
    textAlign: 'center',
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  input: {
    height: 40,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 5,
    width: '100%',
    marginBottom: 15,
    paddingHorizontal: 10,
    color: COLORS.text,
    backgroundColor: COLORS.background,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    marginTop: 20,
  },
  currencyToggle: {
    flexDirection: 'row',
    marginBottom: 15,
    borderRadius: 5,
    overflow: 'hidden',
    borderColor: COLORS.border,
    borderWidth: 1,
  },
  currencyButton: {
    paddingVertical: 10,
    paddingHorizontal: 15,
    backgroundColor: COLORS.background,
  },
  currencyButtonActive: {
    backgroundColor: COLORS.primary,
  },
  currencyButtonText: {
    color: COLORS.muted,
    fontWeight: 'bold',
  },
  currencyButtonTextActive: {
    color: COLORS.text,
  },
});

export default DisputeWorkflowScreen;
