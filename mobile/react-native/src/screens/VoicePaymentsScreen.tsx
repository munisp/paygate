import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  RefreshControl,
  TouchableOpacity,
  Alert,
  TextInput,
  Modal,
  Button,
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

// Helper for currency formatting
const formatCurrency = (amount: number, currency: 'NGN' | 'USD') => {
  if (currency === 'NGN') {
    return `₦${amount.toFixed(2)}`;
  } else if (currency === 'USD') {
    return `$${amount.toFixed(2)}`;
  }
  return amount.toFixed(2);
};

// Helper for date formatting
const formatDate = (dateString: string) => {
  const options: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short', day: 'numeric' };
  return new Date(dateString).toLocaleDateString(undefined, options);
};

interface VoicePayment {
  id: string;
  customerName: string;
  amount: number;
  currency: 'NGN' | 'USD';
  status: 'pending' | 'completed' | 'failed';
  createdAt: string;
  description?: string;
}

const VoicePaymentsScreen = () => {
  const navigation = useNavigation();
  const [searchText, setSearchText] = useState('');
  const [isModalVisible, setModalVisible] = useState(false);
  const [editingPayment, setEditingPayment] = useState<VoicePayment | null>(null);
  const [newPaymentData, setNewPaymentData] = useState({
    customerName: '',
    amount: '',
    currency: 'NGN' as 'NGN' | 'USD',
    description: '',
  });

  const { data, isLoading, isError, refetch } = trpc.voicePayments.list.useQuery();
  const createMutation = trpc.voicePayments.create.useMutation();
  const updateMutation = trpc.voicePayments.update.useMutation();
  const deleteMutation = trpc.voicePayments.delete.useMutation();

  const onRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  const filteredPayments = data?.filter(payment =>
    payment.customerName.toLowerCase().includes(searchText.toLowerCase())
  );

  const handleCreateOrUpdate = async () => {
    if (!newPaymentData.customerName || !newPaymentData.amount) {
      Alert.alert('Error', 'Customer Name and Amount are required.');
      return;
    }
    const amount = parseFloat(newPaymentData.amount);
    if (isNaN(amount) || amount <= 0) {
      Alert.alert('Error', 'Please enter a valid amount.');
      return;
    }

    try {
      if (editingPayment) {
        await updateMutation.mutateAsync({
          id: editingPayment.id,
          customerName: newPaymentData.customerName,
          amount,
          currency: newPaymentData.currency,
          description: newPaymentData.description,
        });
        Alert.alert('Success', 'Payment updated successfully.');
      } else {
        await createMutation.mutateAsync({
          customerName: newPaymentData.customerName,
          amount,
          currency: newPaymentData.currency,
          description: newPaymentData.description,
        });
        Alert.alert('Success', 'Payment created successfully.');
      }
      setModalVisible(false);
      setEditingPayment(null);
      setNewPaymentData({ customerName: '', amount: '', currency: 'NGN', description: '' });
      refetch();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to save payment.');
    }
  };

  const handleDelete = (id: string) => {
    Alert.alert(
      'Confirm Delete',
      'Are you sure you want to delete this payment?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteMutation.mutateAsync({ id });
              Alert.alert('Success', 'Payment deleted successfully.');
              refetch();
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to delete payment.');
            }
          },
        },
      ],
      { cancelable: true }
    );
  };

  const openCreateModal = () => {
    setEditingPayment(null);
    setNewPaymentData({ customerName: '', amount: '', currency: 'NGN', description: '' });
    setModalVisible(true);
  };

  const openEditModal = (payment: VoicePayment) => {
    setEditingPayment(payment);
    setNewPaymentData({
      customerName: payment.customerName,
      amount: payment.amount.toString(),
      currency: payment.currency,
      description: payment.description || '',
    });
    setModalVisible(true);
  };

  const renderItem = ({ item }: { item: VoicePayment }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>{item.customerName}</Text>
        <View style={[styles.statusBadge, item.status === 'completed' ? styles.statusCompleted : item.status === 'pending' ? styles.statusPending : styles.statusFailed]}>
          <Text style={styles.statusText}>{item.status.toUpperCase()}</Text>
        </View>
      </View>
      <Text style={styles.cardText}>Amount: {formatCurrency(item.amount, item.currency)}</Text>
      <Text style={styles.cardText}>Date: {formatDate(item.createdAt)}</Text>
      {item.description && <Text style={styles.cardText}>Description: {item.description}</Text>}
      <View style={styles.cardActions}>
        <TouchableOpacity onPress={() => openEditModal(item)} style={[styles.actionButton, { backgroundColor: COLORS.primary }]}>
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
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading voice payments...</Text>
      </SafeAreaView>
    );
  }

  if (isError) {
    return (
      <SafeAreaView style={styles.errorContainer}>
        <Text style={styles.errorText}>Failed to load voice payments.</Text>
        <Button title="Retry" onPress={() => refetch()} color={COLORS.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Voice Payments</Text>
        <TouchableOpacity onPress={openCreateModal} style={styles.createButton}>
          <Text style={styles.createButtonText}>+ Add Payment</Text>
        </TouchableOpacity>
      </View>

      <TextInput
        style={styles.searchInput}
        placeholder="Search by customer name..."
        placeholderTextColor={COLORS.muted}
        value={searchText}
        onChangeText={setSearchText}
      />

      {filteredPayments && filteredPayments.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No voice payments found.</Text>
          <Button title="Add New Payment" onPress={openCreateModal} color={COLORS.primary} />
        </View>
      ) : (
        <FlatList
          data={filteredPayments}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
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

      <Modal
        animationType="slide"
        transparent={true}
        visible={isModalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{editingPayment ? 'Edit Payment' : 'Add New Payment'}</Text>
            <TextInput
              style={styles.input}
              placeholder="Customer Name"
              placeholderTextColor={COLORS.muted}
              value={newPaymentData.customerName}
              onChangeText={(text) => setNewPaymentData({ ...newPaymentData, customerName: text })}
            />
            <TextInput
              style={styles.input}
              placeholder="Amount"
              placeholderTextColor={COLORS.muted}
              keyboardType="numeric"
              value={newPaymentData.amount}
              onChangeText={(text) => setNewPaymentData({ ...newPaymentData, amount: text })}
            />
            <View style={styles.currencyToggle}>
              <TouchableOpacity
                style={[styles.currencyButton, newPaymentData.currency === 'NGN' && styles.currencyButtonActive]}
                onPress={() => setNewPaymentData({ ...newPaymentData, currency: 'NGN' })}
              >
                <Text style={styles.currencyButtonText}>NGN</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.currencyButton, newPaymentData.currency === 'USD' && styles.currencyButtonActive]}
                onPress={() => setNewPaymentData({ ...newPaymentData, currency: 'USD' })}
              >
                <Text style={styles.currencyButtonText}>USD</Text>
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.input}
              placeholder="Description (Optional)"
              placeholderTextColor={COLORS.muted}
              value={newPaymentData.description}
              onChangeText={(text) => setNewPaymentData({ ...newPaymentData, description: text })}
            />
            <View style={styles.modalActions}>
              <Button title="Cancel" onPress={() => setModalVisible(false)} color={COLORS.muted} />
              <Button
                title={editingPayment ? 'Update Payment' : 'Create Payment'}
                onPress={handleCreateOrUpdate}
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
    backgroundColor: COLORS.card,
    color: COLORS.text,
    padding: 12,
    margin: 15,
    borderRadius: 8,
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
  },
  statusCompleted: {
    backgroundColor: COLORS.success,
  },
  statusPending: {
    backgroundColor: COLORS.warning,
  },
  statusFailed: {
    backgroundColor: COLORS.error,
  },
  statusText: {
    color: COLORS.background,
    fontSize: 12,
    fontWeight: 'bold',
  },
  cardActions: {
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
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  modalContent: {
    backgroundColor: COLORS.background,
    borderRadius: 10,
    padding: 20,
    width: '90%',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalTitle: {
    color: COLORS.text,
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  input: {
    backgroundColor: COLORS.card,
    color: COLORS.text,
    padding: 12,
    borderRadius: 8,
    marginBottom: 15,
    fontSize: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  currencyToggle: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 15,
  },
  currencyButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 5,
    marginHorizontal: 5,
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
    marginTop: 20,
  },
});

export default VoicePaymentsScreen;
