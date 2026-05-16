import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, RefreshControl, TouchableOpacity, Alert, TextInput, Modal, Button, SafeAreaView, StatusBar } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { trpc } from '../lib/trpc';

const COLORS = {
  primary: '#6366F1', background: '#0F172A', card: '#1E293B',
  text: '#F1F5F9', muted: '#94A3B8', success: '#10B981',
  error: '#EF4444', warning: '#F59E0B', border: '#334155',
};

interface SplitPayment {
  id: string;
  merchantId: string;
  customerId: string;
  amount: number;
  currency: 'NGN' | 'USD';
  status: 'pending' | 'completed' | 'failed';
  createdAt: string;
  updatedAt: string;
}

const SplitPaymentsScreen: React.FC = () => {
  const navigation = useNavigation();
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingPayment, setEditingPayment] = useState<SplitPayment | null>(null);

  const createPayment = trpc.splitPayments.create.useMutation({
    onSuccess: () => {
      refetch();
    },
  });
  const updatePayment = trpc.splitPayments.update.useMutation({
    onSuccess: () => {
      refetch();
    },
  });
  const deletePayment = trpc.splitPayments.delete.useMutation({
    onSuccess: () => {
      refetch();
    },
  });

  // Placeholder for tRPC data fetching
  const { data, isLoading, isError, error, refetch } = trpc.splitPayments.list.useQuery();

  const [payments, setPayments] = useState<SplitPayment[]>([]);

  useEffect(() => {
    if (data) {
      setPayments(data);
    }
  }, [data]);

  const filteredPayments = payments.filter(payment =>
    payment.customerId.toLowerCase().includes(searchQuery.toLowerCase()) ||
    payment.merchantId.toLowerCase().includes(searchQuery.toLowerCase()) ||
    payment.status.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    refetch();
    setRefreshing(false);
  }, []);

  const formatAmount = (amount: number, currency: 'NGN' | 'USD') => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency === 'NGN' ? 'NGN' : 'USD',
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const getStatusBadgeStyle = (status: SplitPayment['status']) => {
    switch (status) {
      case 'completed': return styles.statusCompleted;
      case 'pending': return styles.statusPending;
      case 'failed': return styles.statusFailed;
      default: return styles.statusPending;
    }
  };

  const handleEdit = (payment: SplitPayment) => {
    setEditingPayment(payment);
    setModalVisible(true);
  };

  const handleDelete = (id: string) => {
    Alert.alert(
      'Delete Split Payment',
      'Are you sure you want to delete this split payment?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => {
          deletePayment.mutate({ id });
        }},
      ]
    );
  };

  const handleSave = (payment: SplitPayment) => {
    if (editingPayment) {
      updatePayment.mutate(payment);
    } else {
      createPayment.mutate(payment);
    }
    setModalVisible(false);
    setEditingPayment(null);
  };

  const renderItem = ({ item }: { item: SplitPayment }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>Payment ID: {item.id}</Text>
        <View style={[styles.statusBadge, getStatusBadgeStyle(item.status)]}>
          <Text style={styles.statusText}>{item.status.toUpperCase()}</Text>
        </View>
      </View>
      <Text style={styles.cardText}>Merchant: {item.merchantId}</Text>
      <Text style={styles.cardText}>Customer: {item.customerId}</Text>
      <Text style={styles.cardText}>Amount: {formatAmount(item.amount, item.currency)}</Text>
      <Text style={styles.cardText}>Created: {formatDate(item.createdAt)}</Text>
      <View style={styles.cardActions}>
        <TouchableOpacity onPress={() => handleEdit(item)} style={[styles.actionButton, styles.editButton]}>
          <Text style={styles.buttonText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => handleDelete(item.id)} style={[styles.actionButton, styles.deleteButton]}>
          <Text style={styles.buttonText}>Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  if (isLoading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading split payments...</Text>
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

  if (!data || data.length === 0) {
    return (
      <SafeAreaView style={styles.emptyContainer}>
        <Text style={styles.emptyText}>No split payments found.</Text>
        <Button title="Create New Payment" onPress={() => setModalVisible(true)} color={COLORS.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Split Payments</Text>
        <TouchableOpacity onPress={() => setModalVisible(true)} style={styles.createButton}>
          <Text style={styles.buttonText}>Create New</Text>
        </TouchableOpacity>
      </View>
      <TextInput
        style={styles.searchInput}
        placeholder="Search by Customer ID, Merchant ID, or Status"
        placeholderTextColor={COLORS.muted}
        value={searchQuery}
        onChangeText={setSearchQuery}
      />
      <FlatList
        data={filteredPayments}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
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
        ListEmptyComponent={(
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No matching split payments found.</Text>
          </View>
        )}
      />

      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => {
          setModalVisible(!modalVisible);
          setEditingPayment(null);
        }}
      >
        <View style={styles.centeredView}>
          <View style={styles.modalView}>
            <Text style={styles.modalTitle}>{editingPayment ? 'Edit Split Payment' : 'Create Split Payment'}</Text>
            <TextInput
              style={styles.input}
              placeholder="Merchant ID"
              placeholderTextColor={COLORS.muted}
              value={editingPayment?.merchantId || ''}
              onChangeText={(text) => setEditingPayment(prev => prev ? { ...prev, merchantId: text } : { id: '', merchantId: text, customerId: '', amount: 0, currency: 'NGN', status: 'pending', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() })}
            />
            <TextInput
              style={styles.input}
              placeholder="Customer ID"
              placeholderTextColor={COLORS.muted}
              value={editingPayment?.customerId || ''}
              onChangeText={(text) => setEditingPayment(prev => prev ? { ...prev, customerId: text } : { id: '', merchantId: '', customerId: text, amount: 0, currency: 'NGN', status: 'pending', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() })}
            />
            <TextInput
              style={styles.input}
              placeholder="Amount"
              placeholderTextColor={COLORS.muted}
              keyboardType="numeric"
              value={String(editingPayment?.amount || '')}
              onChangeText={(text) => setEditingPayment(prev => prev ? { ...prev, amount: parseFloat(text) || 0 } : { id: '', merchantId: '', customerId: '', amount: parseFloat(text) || 0, currency: 'NGN', status: 'pending', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() })}
            />
            {/* Currency and Status selection can be implemented with Pickers */}
            <View style={styles.modalActions}>
              <Button title="Cancel" onPress={() => { setModalVisible(false); setEditingPayment(null); }} color={COLORS.error} />
              <Button title="Save" onPress={() => editingPayment && handleSave(editingPayment)} color={COLORS.primary} />
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
    fontSize: 22,
    fontWeight: 'bold',
  },
  createButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 5,
  },
  buttonText: {
    color: COLORS.text,
    fontWeight: 'bold',
  },
  searchInput: {
    height: 40,
    backgroundColor: COLORS.card,
    borderRadius: 5,
    margin: 15,
    paddingHorizontal: 10,
    color: COLORS.text,
  },
  listContent: {
    paddingHorizontal: 15,
    paddingBottom: 15,
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 8,
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
    marginBottom: 5,
  },
  statusBadge: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 5,
  },
  statusText: {
    color: COLORS.background,
    fontWeight: 'bold',
    fontSize: 12,
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
  editButton: {
    backgroundColor: COLORS.primary,
  },
  deleteButton: {
    backgroundColor: COLORS.error,
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
    borderRadius: 10,
    padding: 35,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
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
    marginBottom: 15,
    paddingHorizontal: 10,
    color: COLORS.text,
    width: '100%',
    backgroundColor: COLORS.background,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    marginTop: 15,
  },
});

export default SplitPaymentsScreen;