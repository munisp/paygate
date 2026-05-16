import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, FlatList, TouchableOpacity, Alert, TextInput, Modal, Button, RefreshControl, SafeAreaView, StatusBar } from 'react-native';
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

interface Refund {
  id: string;
  amount: number;
  currency: 'NGN' | 'USD';
  status: 'pending' | 'approved' | 'rejected';
  reason: string;
  createdAt: string;
}

const RefundWorkflowScreen: React.FC = () => {
  const navigation = useNavigation();

  const { data: refunds, isLoading, isError, error, refetch } = trpc.refunds.list.useQuery();
  const createRefundMutation = trpc.refunds.create.useMutation();
  const updateRefundMutation = trpc.refunds.update.useMutation();
  const deleteRefundMutation = trpc.refunds.delete.useMutation();

  const [refreshing, setRefreshing] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [isCreateModalVisible, setCreateModalVisible] = useState(false);
  const [isEditModalVisible, setEditModalVisible] = useState(false);
  const [currentRefund, setCurrentRefund] = useState<Refund | null>(null);

  const [newRefundAmount, setNewRefundAmount] = useState('');
  const [newRefundCurrency, setNewRefundCurrency] = useState<'NGN' | 'USD'>('NGN');
  const [newRefundReason, setNewRefundReason] = useState('');

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const filteredRefunds = refunds?.filter(refund =>
    refund.reason.toLowerCase().includes(searchText.toLowerCase()) ||
    refund.id.toLowerCase().includes(searchText.toLowerCase())
  );

  const formatAmount = (amount: number, currency: 'NGN' | 'USD') => {
    const symbol = currency === 'NGN' ? '₦' : '$';
    return `${symbol}${amount.toFixed(2)}`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  const getStatusBadgeStyle = (status: Refund['status']) => {
    switch (status) {
      case 'approved':
        return styles.statusApproved;
      case 'pending':
        return styles.statusPending;
      case 'rejected':
        return styles.statusRejected;
      default:
        return styles.statusPending;
    }
  };

  const handleCreateRefund = async () => {
    if (!newRefundAmount || !newRefundReason) {
      Alert.alert('Error', 'Please fill all fields.');
      return;
    }
    try {
      await createRefundMutation.mutateAsync({
        amount: parseFloat(newRefundAmount),
        currency: newRefundCurrency,
        reason: newRefundReason,
      });
      Alert.alert('Success', 'Refund created successfully.');
      setCreateModalVisible(false);
      setNewRefundAmount('');
      setNewRefundReason('');
      refetch();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to create refund.');
    }
  };

  const handleEditRefund = async () => {
    if (!currentRefund || !newRefundAmount || !newRefundReason) {
      Alert.alert('Error', 'Please fill all fields.');
      return;
    }
    try {
      await updateRefundMutation.mutateAsync({
        id: currentRefund.id,
        amount: parseFloat(newRefundAmount),
        currency: newRefundCurrency,
        reason: newRefundReason,
      });
      Alert.alert('Success', 'Refund updated successfully.');
      setEditModalVisible(false);
      setCurrentRefund(null);
      setNewRefundAmount('');
      setNewRefundReason('');
      refetch();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to update refund.');
    }
  };

  const handleDeleteRefund = (id: string) => {
    Alert.alert(
      'Confirm Delete',
      'Are you sure you want to delete this refund?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteRefundMutation.mutateAsync({ id });
              Alert.alert('Success', 'Refund deleted successfully.');
              refetch();
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to delete refund.');
            }
          },
        },
      ]
    );
  };

  const openEditModal = (refund: Refund) => {
    setCurrentRefund(refund);
    setNewRefundAmount(refund.amount.toString());
    setNewRefundCurrency(refund.currency);
    setNewRefundReason(refund.reason);
    setEditModalVisible(true);
  };

  const renderRefundItem = ({ item }: { item: Refund }) => (
    <View style={styles.refundItem}>
      <View>
        <Text style={styles.refundId}>ID: {item.id}</Text>
        <Text style={styles.refundAmount}>Amount: {formatAmount(item.amount, item.currency)}</Text>
        <View style={[styles.statusBadge, getStatusBadgeStyle(item.status)]}>
          <Text style={styles.statusBadgeText}>{item.status.toUpperCase()}</Text>
        </View>
        <Text style={styles.refundReason}>Reason: {item.reason}</Text>
        <Text style={styles.refundDate}>Created: {formatDate(item.createdAt)}</Text>
      </View>
      <View style={styles.actionButtons}>
        <TouchableOpacity onPress={() => openEditModal(item)} style={[styles.actionButton, { backgroundColor: COLORS.primary }]}>
          <Text style={styles.actionButtonText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => handleDeleteRefund(item.id)} style={[styles.actionButton, { backgroundColor: COLORS.error }]}>
          <Text style={styles.actionButtonText}>Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Refund Workflow</Text>
        <TouchableOpacity onPress={() => setCreateModalVisible(true)} style={styles.headerButton}>
          <Text style={styles.headerButtonText}>+ Add Refund</Text>
        </TouchableOpacity>
      </View>

      <TextInput
        style={styles.searchInput}
        placeholder="Search refunds..."
        placeholderTextColor={COLORS.muted}
        value={searchText}
        onChangeText={setSearchText}
      />

      <View style={styles.content}>
        {isLoading && (
          <View style={styles.centeredView}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles.loadingText}>Loading Refunds...</Text>
          </View>
        )}

        {isError && (
          <View style={styles.centeredView}>
            <Text style={styles.errorText}>Error: {error?.message}</Text>
            <TouchableOpacity onPress={() => refetch()} style={styles.retryButton}>
              <Text style={styles.retryButtonText}>Try Again</Text>
            </TouchableOpacity>
          </View>
        )}

        {!isLoading && !isError && (!filteredRefunds || filteredRefunds.length === 0) && (
          <View style={styles.centeredView}>
            <Text style={styles.emptyText}>No refunds found.</Text>
            <TouchableOpacity onPress={() => setCreateModalVisible(true)} style={styles.createButton}>
              <Text style={styles.createButtonText}>Create New Refund</Text>
            </TouchableOpacity>
          </View>
        )}

        {!isLoading && !isError && filteredRefunds && filteredRefunds.length > 0 && (
          <FlatList
            data={filteredRefunds}
            keyExtractor={(item) => item.id}
            renderItem={renderRefundItem}
            contentContainerStyle={styles.flatListContent}
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
      </View>

      {/* Create Refund Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isCreateModalVisible}
        onRequestClose={() => setCreateModalVisible(false)}
      >
        <View style={styles.modalBackground}>
          <View style={styles.modalContainer}>
            <Text style={styles.modalTitle}>Create New Refund</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Amount"
              placeholderTextColor={COLORS.muted}
              keyboardType="numeric"
              value={newRefundAmount}
              onChangeText={setNewRefundAmount}
            />
            <View style={styles.currencySelector}>
              <TouchableOpacity
                style={[styles.currencyButton, newRefundCurrency === 'NGN' && styles.currencyButtonActive]}
                onPress={() => setNewRefundCurrency('NGN')}
              >
                <Text style={styles.currencyButtonText}>NGN</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.currencyButton, newRefundCurrency === 'USD' && styles.currencyButtonActive]}
                onPress={() => setNewRefundCurrency('USD')}
              >
                <Text style={styles.currencyButtonText}>USD</Text>
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.modalInput}
              placeholder="Reason"
              placeholderTextColor={COLORS.muted}
              value={newRefundReason}
              onChangeText={setNewRefundReason}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity onPress={handleCreateRefund} style={[styles.modalButton, { backgroundColor: COLORS.success }]}>
                <Text style={styles.modalButtonText}>Create</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setCreateModalVisible(false)} style={[styles.modalButton, { backgroundColor: COLORS.muted }]}>
                <Text style={styles.modalButtonText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Edit Refund Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isEditModalVisible}
        onRequestClose={() => setEditModalVisible(false)}
      >
        <View style={styles.modalBackground}>
          <View style={styles.modalContainer}>
            <Text style={styles.modalTitle}>Edit Refund</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Amount"
              placeholderTextColor={COLORS.muted}
              keyboardType="numeric"
              value={newRefundAmount}
              onChangeText={setNewRefundAmount}
            />
            <View style={styles.currencySelector}>
              <TouchableOpacity
                style={[styles.currencyButton, newRefundCurrency === 'NGN' && styles.currencyButtonActive]}
                onPress={() => setNewRefundCurrency('NGN')}
              >
                <Text style={styles.currencyButtonText}>NGN</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.currencyButton, newRefundCurrency === 'USD' && styles.currencyButtonActive]}
                onPress={() => setNewRefundCurrency('USD')}
              >
                <Text style={styles.currencyButtonText}>USD</Text>
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.modalInput}
              placeholder="Reason"
              placeholderTextColor={COLORS.muted}
              value={newRefundReason}
              onChangeText={setNewRefundReason}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity onPress={handleEditRefund} style={[styles.modalButton, { backgroundColor: COLORS.primary }]}>
                <Text style={styles.modalButtonText}>Save Changes</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setEditModalVisible(false)} style={[styles.modalButton, { backgroundColor: COLORS.muted }]}>
                <Text style={styles.modalButtonText}>Cancel</Text>
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
    padding: 16,
    backgroundColor: COLORS.card,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  headerButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 5,
  },
  headerButtonText: {
    color: COLORS.text,
    fontWeight: 'bold',
  },
  searchInput: {
    backgroundColor: COLORS.card,
    color: COLORS.text,
    padding: 12,
    margin: 16,
    borderRadius: 8,
    borderColor: COLORS.border,
    borderWidth: 1,
  },
  content: {
    flex: 1,
  },
  centeredView: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: COLORS.muted,
    marginTop: 10,
  },
  errorText: {
    color: COLORS.error,
    textAlign: 'center',
    marginBottom: 10,
  },
  emptyText: {
    color: COLORS.muted,
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
    fontWeight: 'bold',
  },
  createButton: {
    backgroundColor: COLORS.success,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 5,
  },
  createButtonText: {
    color: COLORS.background,
    fontWeight: 'bold',
  },
  flatListContent: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  refundItem: {
    backgroundColor: COLORS.card,
    padding: 16,
    borderRadius: 8,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  refundId: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: 'bold',
  },
  refundAmount: {
    color: COLORS.text,
    fontSize: 14,
    marginTop: 5,
  },
  refundStatus: {
    color: COLORS.muted,
    fontSize: 14,
  },
  refundReason: {
    color: COLORS.muted,
    fontSize: 14,
  },
  refundDate: {
    color: COLORS.muted,
    fontSize: 12,
    marginTop: 5,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  actionButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 5,
  },
  actionButtonText: {
    color: COLORS.text,
    fontWeight: 'bold',
  },
  modalBackground: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  modalContainer: {
    width: '80%',
    backgroundColor: COLORS.background,
    borderRadius: 10,
    padding: 20,
    alignItems: 'center',
    borderColor: COLORS.border,
    borderWidth: 1,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 20,
  },
  modalInput: {
    width: '100%',
    backgroundColor: COLORS.card,
    color: COLORS.text,
    padding: 12,
    borderRadius: 8,
    marginBottom: 15,
    borderColor: COLORS.border,
    borderWidth: 1,
  },
  currencySelector: {
    flexDirection: 'row',
    marginBottom: 15,
    width: '100%',
    justifyContent: 'space-around',
  },
  currencyButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 5,
    backgroundColor: COLORS.muted,
  },
  currencyButtonActive: {
    backgroundColor: COLORS.primary,
  },
  currencyButtonText: {
    color: COLORS.text,
    fontWeight: 'bold',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
  },
  modalButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 5,
  },
  modalButtonText: {
    color: COLORS.text,
    fontWeight: 'bold',
  },
  statusBadge: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 5,
    alignSelf: 'flex-start',
    marginTop: 5,
    marginBottom: 5,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: COLORS.background,
  },
  statusApproved: {
    backgroundColor: COLORS.success,
  },
  statusPending: {
    backgroundColor: COLORS.warning,
  },
  statusRejected: {
    backgroundColor: COLORS.error,
  },
});

export default RefundWorkflowScreen;
