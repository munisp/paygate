import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  FlatList,
  RefreshControl,
  SafeAreaView,
  StatusBar,
  TextInput,
  TouchableOpacity,
  Alert,
  Modal,
  Button,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { trpc } from '../lib/trpc'; // Assuming this path

// Design system colors
const COLORS = {
  primary: '#6366F1', background: '#0F172A', card: '#1E293B',
  text: '#F1F5F9', muted: '#94A3B8', success: '#10B981',
  error: '#EF4444', warning: '#F59E0B', border: '#334155',
};

// Helper for amount formatting
const formatAmount = (amount: number, currency: 'NGN' | 'USD' = 'NGN') => {
  const symbol = currency === 'NGN' ? '₦' : '$';
  return `${symbol} ${amount.toFixed(2)}`;
};

// Helper for date formatting
const formatDate = (dateString: string) => {
  const options: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short', day: 'numeric' };
  return new Date(dateString).toLocaleDateString(undefined, options);
};

interface Transaction {
  id: string;
  amount: number;
  currency: 'NGN' | 'USD';
  status: 'COMPLETED' | 'PENDING' | 'FAILED';
  date: string;
  description: string;
}

const MojaloopDashboardScreen = () => {
  const navigation = useNavigation();
  const [searchText, setSearchText] = useState('');
  const [isCreateModalVisible, setCreateModalVisible] = useState(false);
  const [isEditModalVisible, setEditModalVisible] = useState(false);
  const [currentTransaction, setCurrentTransaction] = useState<Transaction | null>(null);

  // tRPC query for fetching dashboard data (e.g., transactions)
  const { data, isLoading, isError, refetch } = trpc.mojaloop.getDashboardData.useQuery();

  // tRPC mutations for CRUD operations
  const createMutation = trpc.mojaloop.createTransaction.useMutation({
    onSuccess: () => {
      refetch();
      setCreateModalVisible(false);
    },
  });
  const updateMutation = trpc.mojaloop.updateTransaction.useMutation({
    onSuccess: () => {
      refetch();
      setEditModalVisible(false);
      setCurrentTransaction(null);
    },
  });
  const deleteMutation = trpc.mojaloop.deleteTransaction.useMutation({
    onSuccess: () => {
      refetch();
    },
  });

  const onRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  const filteredData = data?.filter(item =>
    item.description.toLowerCase().includes(searchText.toLowerCase())
  ) || [];

  const handleCreate = (newTransaction: Omit<Transaction, 'id'>) => {
    createMutation.mutate(newTransaction);
  };

  const handleEdit = (updatedTransaction: Transaction) => {
    updateMutation.mutate(updatedTransaction);
  };

  const handleDelete = (id: string) => {
    Alert.alert(
      'Confirm Delete',
      'Are you sure you want to delete this transaction?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deleteMutation.mutate({ id }) },
      ]
    );
  };

  const renderItem = ({ item }: { item: Transaction }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>{item.description}</Text>
        <Text style={[styles.statusBadge, styles[`status${item.status}`]]}>
          {item.status}
        </Text>
      </View>
      <Text style={styles.cardText}>Amount: {formatAmount(item.amount, item.currency)}</Text>
      <Text style={styles.cardText}>Date: {formatDate(item.date)}</Text>
      <View style={styles.cardActions}>
        <TouchableOpacity
          style={[styles.actionButton, { backgroundColor: COLORS.primary }]} // Primary for Edit
          onPress={() => {
            setCurrentTransaction(item);
            setEditModalVisible(true);
          }}
        >
          <Text style={styles.actionButtonText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionButton, { backgroundColor: COLORS.error }]} // Error for Delete
          onPress={() => handleDelete(item.id)}
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
        <Text style={styles.loadingText}>Loading Mojaloop Dashboard...</Text>
      </SafeAreaView>
    );
  }

  if (isError) {
    return (
      <SafeAreaView style={styles.errorContainer}>
        <Text style={styles.errorText}>Failed to load dashboard data.</Text>
        <Button title="Retry" onPress={() => refetch()} color={COLORS.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Mojaloop Dashboard</Text>
        <TouchableOpacity
          style={styles.createButton}
          onPress={() => setCreateModalVisible(true)}
        >
          <Text style={styles.createButtonText}>+ Add Transaction</Text>
        </TouchableOpacity>
      </View>

      <TextInput
        style={styles.searchInput}
        placeholder="Search transactions..."
        placeholderTextColor={COLORS.muted}
        value={searchText}
        onChangeText={setSearchText}
      />

      {filteredData.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No transactions found.</Text>
          <Button title="Refresh" onPress={() => refetch()} color={COLORS.primary} />
        </View>
      ) : (
        <FlatList
          data={filteredData}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={isLoading} // Use isLoading to show refresh indicator
              onRefresh={onRefresh}
              tintColor={COLORS.primary}
            />
          }
        />
      )}

      {/* Create Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isCreateModalVisible}
        onRequestClose={() => setCreateModalVisible(false)}
      >
        <View style={styles.centeredView}>
          <View style={styles.modalView}>
            <Text style={styles.modalTitle}>Create New Transaction</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Description"
              placeholderTextColor={COLORS.muted}
              onChangeText={(text) => setCurrentTransaction(prev => ({ ...prev!, description: text }))}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Amount"
              placeholderTextColor={COLORS.muted}
              keyboardType="numeric"
              onChangeText={(text) => setCurrentTransaction(prev => ({ ...prev!, amount: parseFloat(text) }))}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Currency (NGN or USD)"
              placeholderTextColor={COLORS.muted}
              onChangeText={(text) => setCurrentTransaction(prev => ({ ...prev!, currency: text as 'NGN' | 'USD' }))}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Status (COMPLETED, PENDING, FAILED)"
              placeholderTextColor={COLORS.muted}
              onChangeText={(text) => setCurrentTransaction(prev => ({ ...prev!, status: text as 'COMPLETED' | 'PENDING' | 'FAILED' }))}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Date (YYYY-MM-DD)"
              placeholderTextColor={COLORS.muted}
              onChangeText={(text) => setCurrentTransaction(prev => ({ ...prev!, date: text }))}
            />
            <View style={styles.modalActions}>
              <Button title="Cancel" onPress={() => setCreateModalVisible(false)} color={COLORS.muted} />
              <Button
                title="Create"
                onPress={() => {
                  if (currentTransaction) {
                    handleCreate(currentTransaction);
                  }
                }}
                color={COLORS.primary}
              />
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
        <View style={styles.centeredView}>
          <View style={styles.modalView}>
            <Text style={styles.modalTitle}>Edit Transaction</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Description"
              placeholderTextColor={COLORS.muted}
              value={currentTransaction?.description || ''}
              onChangeText={(text) => setCurrentTransaction(prev => ({ ...prev!, description: text }))}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Amount"
              placeholderTextColor={COLORS.muted}
              keyboardType="numeric"
              value={currentTransaction?.amount.toString() || ''}
              onChangeText={(text) => setCurrentTransaction(prev => ({ ...prev!, amount: parseFloat(text) }))}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Currency (NGN or USD)"
              placeholderTextColor={COLORS.muted}
              value={currentTransaction?.currency || ''}
              onChangeText={(text) => setCurrentTransaction(prev => ({ ...prev!, currency: text as 'NGN' | 'USD' }))}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Status (COMPLETED, PENDING, FAILED)"
              placeholderTextColor={COLORS.muted}
              value={currentTransaction?.status || ''}
              onChangeText={(text) => setCurrentTransaction(prev => ({ ...prev!, status: text as 'COMPLETED' | 'PENDING' | 'FAILED' }))}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Date (YYYY-MM-DD)"
              placeholderTextColor={COLORS.muted}
              value={currentTransaction?.date || ''}
              onChangeText={(text) => setCurrentTransaction(prev => ({ ...prev!, date: text }))}
            />
            <View style={styles.modalActions}>
              <Button title="Cancel" onPress={() => setEditModalVisible(false)} color={COLORS.muted} />
              <Button
                title="Save Changes"
                onPress={() => {
                  if (currentTransaction) {
                    handleEdit(currentTransaction);
                  }
                }}
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
    fontSize: 22,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  createButton: {
    backgroundColor: COLORS.success,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 5,
  },
  createButtonText: {
    color: COLORS.text,
    fontWeight: 'bold',
  },
  searchInput: {
    height: 40,
    backgroundColor: COLORS.card,
    borderRadius: 8,
    margin: 15,
    paddingHorizontal: 15,
    color: COLORS.text,
    borderColor: COLORS.border,
    borderWidth: 1,
  },
  listContent: {
    paddingHorizontal: 15,
    paddingBottom: 15,
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
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
    flexShrink: 1,
    marginRight: 10,
  },
  cardText: {
    fontSize: 14,
    color: COLORS.muted,
    marginBottom: 5,
  },
  statusBadge: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 5,
    fontWeight: 'bold',
    fontSize: 12,
    color: COLORS.background, // Text color for badges
  },
  statusCOMPLETED: {
    backgroundColor: COLORS.success,
  },
  statusPENDING: {
    backgroundColor: COLORS.warning,
  },
  statusFAILED: {
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
  actionButtonText: {
    color: COLORS.text,
    fontWeight: 'bold',
  },
  centeredView: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  modalView: {
    margin: 20,
    backgroundColor: COLORS.background,
    borderRadius: 20,
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
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 15,
  },
  modalInput: {
    width: '100%',
    height: 40,
    backgroundColor: COLORS.card,
    borderRadius: 8,
    paddingHorizontal: 10,
    color: COLORS.text,
    marginBottom: 15,
    borderColor: COLORS.border,
    borderWidth: 1,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    marginTop: 10,
  },
});

export default MojaloopDashboardScreen;
