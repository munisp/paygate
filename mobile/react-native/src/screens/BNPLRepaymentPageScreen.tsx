import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, FlatList, RefreshControl, SafeAreaView, StatusBar, TouchableOpacity, Alert, Modal, TextInput, Button } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { trpc } from '../lib/trpc';

// Design system colors
const COLORS = {
  primary: '#6366F1', background: '#0F172A', card: '#1E293B',
  text: '#F1F5F9', muted: '#94A3B8', success: '#10B981',
  error: '#EF4444', warning: '#F59E0B', border: '#334155',
};

// Helper for currency formatting
const formatCurrency = (amount: number, currency: 'NGN' | 'USD' = 'NGN') => {
  if (currency === 'NGN') {
    return `₦${amount.toFixed(2)}`;
  } else {
    return `$${amount.toFixed(2)}`;
  }
};

// Helper for date formatting
const formatDate = (dateString: string) => {
  const options: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short', day: 'numeric' };
  return new Date(dateString).toLocaleDateString(undefined, options);
};

interface BNPLRepayment {
  id: string;
  loanId: string;
  amount: number;
  currency: 'NGN' | 'USD';
  repaymentDate: string;
  status: 'Pending' | 'Completed' | 'Overdue';
  merchantId: string;
}

const BNPLRepaymentPageScreen = () => {
  const navigation = useNavigation();
  const [searchText, setSearchText] = useState('');
  const [isCreateModalVisible, setCreateModalVisible] = useState(false);
  const [isEditModalVisible, setEditModalVisible] = useState(false);
  const [currentRepayment, setCurrentRepayment] = useState<BNPLRepayment | null>(null);

  // tRPC queries and mutations
  const { data: repayments, isLoading, isError, error, refetch } = trpc.bnplRepayments.list.useQuery();
  const createRepaymentMutation = trpc.bnplRepayments.create.useMutation();
  const updateRepaymentMutation = trpc.bnplRepayments.update.useMutation();
  const deleteRepaymentMutation = trpc.bnplRepayments.delete.useMutation();

  const onRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  const filteredRepayments = repayments?.filter(repayment =>
    repayment.loanId.toLowerCase().includes(searchText.toLowerCase()) ||
    repayment.status.toLowerCase().includes(searchText.toLowerCase())
  );

  const handleCreateRepayment = async (newRepaymentData: Omit<BNPLRepayment, 'id' | 'merchantId'>) => {
    try {
      await createRepaymentMutation.mutateAsync(newRepaymentData);
      refetch();
      setCreateModalVisible(false);
    } catch (err) {
      Alert.alert('Error', 'Failed to create repayment.');
      console.error(err);
    }
  };

  const handleUpdateRepayment = async (updatedRepaymentData: Partial<BNPLRepayment>) => {
    if (!currentRepayment) return;
    try {
      await updateRepaymentMutation.mutateAsync({ id: currentRepayment.id, ...updatedRepaymentData });
      refetch();
      setEditModalVisible(false);
      setCurrentRepayment(null);
    } catch (err) {
      Alert.alert('Error', 'Failed to update repayment.');
      console.error(err);
    }
  };

  const handleDeleteRepayment = (id: string) => {
    Alert.alert(
      'Confirm Delete',
      'Are you sure you want to delete this repayment?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteRepaymentMutation.mutateAsync({ id });
              refetch();
            } catch (err) {
              Alert.alert('Error', 'Failed to delete repayment.');
              console.error(err);
            }
          },
        },
      ]
    );
  };

  const renderRepaymentItem = ({ item }: { item: BNPLRepayment }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.loanIdText}>Loan ID: {item.loanId}</Text>
        <View style={[styles.statusBadge, {
          backgroundColor: item.status === 'Completed' ? COLORS.success :
            item.status === 'Overdue' ? COLORS.error : COLORS.warning
        }]}>
          <Text style={styles.statusText}>{item.status}</Text>
        </View>
      </View>
      <Text style={styles.cardText}>Amount: {formatCurrency(item.amount, item.currency)}</Text>
      <Text style={styles.cardText}>Repayment Date: {formatDate(item.repaymentDate)}</Text>
      <View style={styles.cardActions}>
        <TouchableOpacity style={[styles.actionButton, { backgroundColor: COLORS.primary }]} onPress={() => {
          setCurrentRepayment(item);
          setEditModalVisible(true);
        }}>
          <Text style={styles.actionButtonText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionButton, { backgroundColor: COLORS.error }]} onPress={() => handleDeleteRepayment(item.id)}>
          <Text style={styles.actionButtonText}>Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  if (isLoading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading repayments...</Text>
      </SafeAreaView>
    );
  }

  if (isError) {
    return (
      <SafeAreaView style={styles.errorContainer}>
        <Text style={styles.errorText}>Error: {error?.message || 'Failed to fetch repayments'}</Text>
        <Button title="Retry" onPress={() => refetch()} color={COLORS.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      <View style={styles.header}>
        <Text style={styles.title}>BNPL Repayments</Text>
        <TouchableOpacity style={styles.createButton} onPress={() => setCreateModalVisible(true)}>
          <Text style={styles.createButtonText}>+ Add Repayment</Text>
        </TouchableOpacity>
      </View>

      <TextInput
        style={styles.searchInput}
        placeholder="Search by Loan ID or Status"
        placeholderTextColor={COLORS.muted}
        value={searchText}
        onChangeText={setSearchText}
      />

      {filteredRepayments && filteredRepayments.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No repayments found.</Text>
          <Button title="Refresh" onPress={() => refetch()} color={COLORS.primary} />
        </View>
      ) : (
        <FlatList
          data={filteredRepayments}
          keyExtractor={(item) => item.id}
          renderItem={renderRepaymentItem}
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

      {/* Create Repayment Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isCreateModalVisible}
        onRequestClose={() => setCreateModalVisible(false)}
      >
        <View style={styles.centeredView}>
          <View style={styles.modalView}>
            <Text style={styles.modalTitle}>Add New Repayment</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Loan ID"
              placeholderTextColor={COLORS.muted}
              onChangeText={(text) => setCurrentRepayment(prev => ({ ...prev!, loanId: text }))}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Amount"
              placeholderTextColor={COLORS.muted}
              keyboardType="numeric"
              onChangeText={(text) => setCurrentRepayment(prev => ({ ...prev!, amount: parseFloat(text) }))}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Currency (NGN or USD)"
              placeholderTextColor={COLORS.muted}
              onChangeText={(text) => setCurrentRepayment(prev => ({ ...prev!, currency: text as 'NGN' | 'USD' }))}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Repayment Date (YYYY-MM-DD)"
              placeholderTextColor={COLORS.muted}
              onChangeText={(text) => setCurrentRepayment(prev => ({ ...prev!, repaymentDate: text }))}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Status (Pending, Completed, Overdue)"
              placeholderTextColor={COLORS.muted}
              onChangeText={(text) => setCurrentRepayment(prev => ({ ...prev!, status: text as 'Pending' | 'Completed' | 'Overdue' }))}
            />
            <View style={styles.modalActions}>
              <Button title="Cancel" onPress={() => setCreateModalVisible(false)} color={COLORS.error} />
              <Button title="Create" onPress={() => {
                if (currentRepayment) {
                  handleCreateRepayment(currentRepayment);
                }
              }} color={COLORS.primary} />
            </View>
          </View>
        </View>
      </Modal>

      {/* Edit Repayment Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isEditModalVisible}
        onRequestClose={() => setEditModalVisible(false)}
      >
        <View style={styles.centeredView}>
          <View style={styles.modalView}>
            <Text style={styles.modalTitle}>Edit Repayment</Text>
            {currentRepayment && (
              <>
                <TextInput
                  style={styles.modalInput}
                  placeholder="Loan ID"
                  placeholderTextColor={COLORS.muted}
                  value={currentRepayment.loanId}
                  onChangeText={(text) => setCurrentRepayment(prev => ({ ...prev!, loanId: text }))}
                />
                <TextInput
                  style={styles.modalInput}
                  placeholder="Amount"
                  placeholderTextColor={COLORS.muted}
                  keyboardType="numeric"
                  value={currentRepayment.amount.toString()}
                  onChangeText={(text) => setCurrentRepayment(prev => ({ ...prev!, amount: parseFloat(text) }))}
                />
                <TextInput
                  style={styles.modalInput}
                  placeholder="Currency (NGN or USD)"
                  placeholderTextColor={COLORS.muted}
                  value={currentRepayment.currency}
                  onChangeText={(text) => setCurrentRepayment(prev => ({ ...prev!, currency: text as 'NGN' | 'USD' }))}
                />
                <TextInput
                  style={styles.modalInput}
                  placeholder="Repayment Date (YYYY-MM-DD)"
                  placeholderTextColor={COLORS.muted}
                  value={currentRepayment.repaymentDate}
                  onChangeText={(text) => setCurrentRepayment(prev => ({ ...prev!, repaymentDate: text }))}
                />
                <TextInput
                  style={styles.modalInput}
                  placeholder="Status (Pending, Completed, Overdue)"
                  placeholderTextColor={COLORS.muted}
                  value={currentRepayment.status}
                  onChangeText={(text) => setCurrentRepayment(prev => ({ ...prev!, status: text as 'Pending' | 'Completed' | 'Overdue' }))}
                />
              </>
            )}
            <View style={styles.modalActions}>
              <Button title="Cancel" onPress={() => setEditModalVisible(false)} color={COLORS.error} />
              <Button title="Save" onPress={() => {
                if (currentRepayment) {
                  handleUpdateRepayment(currentRepayment);
                }
              }} color={COLORS.primary} />
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
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 20,
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
    height: 40,
    backgroundColor: COLORS.card,
    borderRadius: 8,
    paddingHorizontal: 15,
    margin: 16,
    color: COLORS.text,
    fontSize: 16,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 10,
    padding: 15,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 5,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  loanIdText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  statusBadge: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 15,
  },
  statusText: {
    color: COLORS.background,
    fontWeight: 'bold',
    fontSize: 12,
  },
  cardText: {
    color: COLORS.muted,
    fontSize: 14,
    marginBottom: 5,
  },
  cardActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 10,
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
  centeredView: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalView: {
    margin: 20,
    backgroundColor: COLORS.background,
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
    paddingHorizontal: 15,
    marginBottom: 15,
    color: COLORS.text,
    fontSize: 16,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    marginTop: 20,
  },
});

export default BNPLRepaymentPageScreen;
