import React, { useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, FlatList, TouchableOpacity, Alert, RefreshControl, TextInput, Modal, Button, SafeAreaView, StatusBar } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { trpc } from '../lib/trpc';

// Design system colors
const COLORS = {
  primary: '#6366F1', background: '#0F172A', card: '#1E293B',
  text: '#F1F5F9', muted: '#94A3B8', success: '#10B981',
  error: '#EF4444', warning: '#F59E0B', border: '#334155',
};



interface LoanRepayment {
  id: string;
  loanId: string;
  amount: number;
  currency: 'NGN' | 'USD';
  repaymentDate: string;
  status: 'Paid' | 'Pending' | 'Overdue';
}

const LoanRepaymentsScreen: React.FC = () => {
  const navigation = useNavigation();
  const [searchText, setSearchText] = useState('');
  const [isCreateModalVisible, setCreateModalVisible] = useState(false);
  const [isEditModalVisible, setEditModalVisible] = useState(false);
  const [selectedRepayment, setSelectedRepayment] = useState<LoanRepayment | null>(null);
  const [createFormData, setCreateFormData] = useState<Omit<LoanRepayment, 'id'>>({
    loanId: '', amount: 0, currency: 'USD', repaymentDate: '', status: 'Pending'
  });
  const [editFormData, setEditFormData] = useState<LoanRepayment>({
    id: '', loanId: '', amount: 0, currency: 'USD', repaymentDate: '', status: 'Pending'
  });

  const { data: repayments, isLoading, error, refetch } = trpc.loanRepayments.list.useQuery();
  const { mutate: createRepayment, isLoading: isCreating } = trpc.loanRepayments.create.useMutation({
    onSuccess: () => {
      refetch();
      setCreateModalVisible(false);
    },
    onError: (err) => {
      Alert.alert("Error", "Failed to create repayment: " + err.message);
    },
  });
  const { mutate: updateRepayment, isLoading: isUpdating } = trpc.loanRepayments.update.useMutation({
    onSuccess: () => {
      refetch();
      setEditModalVisible(false);
    },
    onError: (err) => {
      Alert.alert("Error", "Failed to update repayment: " + err.message);
    },
  });
  const { mutate: deleteRepayment, isLoading: isDeleting } = trpc.loanRepayments.delete.useMutation({
    onSuccess: () => {
      refetch();
    },
    onError: (err) => {
      Alert.alert("Error", "Failed to delete repayment: " + err.message);
    },
  });
  
  
  

  const filteredRepayments = repayments?.filter(repayment =>
    repayment.loanId.toLowerCase().includes(searchText.toLowerCase())
  );

  const handleCreate = () => {
    createRepayment({ ...createFormData, id: Math.random().toString() });
  };

  const handleEdit = () => {
    if (selectedRepayment) {
      updateRepayment(editFormData);
    }
  };

  const handleDelete = (id: string) => {
    Alert.alert(
      'Confirm Delete',
      'Are you sure you want to delete this repayment?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deleteRepayment(id) },
      ]
    );
  };

  const renderRepaymentItem = ({ item }: { item: LoanRepayment }) => (
    <View style={styles.card}>
      <View style={styles.row}>
        <Text style={styles.loanId}>Loan ID: {item.loanId}</Text>
        <Text style={[styles.statusBadge, styles[`status${item.status}`]]}>{item.status}</Text>
      </View>
      <Text style={styles.amount}>Amount: {item.currency === 'NGN' ? '₦' : '$'}{item.amount.toFixed(2)}</Text>
      <Text style={styles.date}>Repayment Date: {new Date(item.repaymentDate).toLocaleDateString()}</Text>
      <View style={styles.actions}>
        <TouchableOpacity onPress={() => { setSelectedRepayment(item); setEditFormData(item); setEditModalVisible(true); }} style={[styles.button, styles.editButton]}>
          <Text style={styles.buttonText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => handleDelete(item.id)} style={[styles.button, styles.deleteButton]}>
          <Text style={styles.buttonText}>Delete</Text>
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

  if (error) {
    return (
      <SafeAreaView style={styles.errorContainer}>
        <Text style={styles.errorText}>Error: {error.message}</Text>
        <TouchableOpacity onPress={refetch} style={styles.retryButton}>
          <Text style={styles.buttonText}>Retry</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Loan Repayments</Text>
        <TouchableOpacity onPress={() => setCreateModalVisible(true)} style={styles.createButton}>
          <Text style={styles.buttonText}>Add Repayment</Text>
        </TouchableOpacity>
      </View>

      <TextInput
        style={styles.searchInput}
        placeholder="Search by Loan ID..."
        placeholderTextColor={COLORS.muted}
        value={searchText}
        onChangeText={setSearchText}
      />

      {filteredRepayments?.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No loan repayments found.</Text>
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
              onRefresh={refetch}
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
            <Text style={styles.modalTitle}>Create New Repayment</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Loan ID"
              placeholderTextColor={COLORS.muted}
              onChangeText={(text) => setCreateFormData({ ...createFormData, loanId: text })}
              value={createFormData.loanId}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Amount"
              placeholderTextColor={COLORS.muted}
              keyboardType="numeric"
              onChangeText={(text) => setCreateFormData({ ...createFormData, amount: parseFloat(text) })}
              value={createFormData.amount ? createFormData.amount.toString() : ''}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Currency (NGN or USD)"
              placeholderTextColor={COLORS.muted}
              onChangeText={(text) => setCreateFormData({ ...createFormData, currency: text as 'NGN' | 'USD' })}
              value={createFormData.currency}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Repayment Date (YYYY-MM-DD)"
              placeholderTextColor={COLORS.muted}
              onChangeText={(text) => setCreateFormData({ ...createFormData, repaymentDate: text })}
              value={createFormData.repaymentDate}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Status (Paid, Pending, Overdue)"
              placeholderTextColor={COLORS.muted}
              onChangeText={(text) => setCreateFormData({ ...createFormData, status: text as 'Paid' | 'Pending' | 'Overdue' })}
              value={createFormData.status}
            />
            <TouchableOpacity onPress={handleCreate} style={[styles.button, styles.modalSaveButton]} disabled={isCreating}>
              <Text style={styles.buttonText}>Save</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setCreateModalVisible(false)} style={[styles.button, styles.modalCancelButton]}>
              <Text style={styles.buttonText}>Cancel</Text>
            </TouchableOpacity>
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
            <Text style={styles.modalTitle}>Edit Repayment</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Loan ID"
              placeholderTextColor={COLORS.muted}
              onChangeText={(text) => setEditFormData({ ...editFormData, loanId: text })}
              value={editFormData.loanId}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Amount"
              placeholderTextColor={COLORS.muted}
              keyboardType="numeric"
              onChangeText={(text) => setEditFormData({ ...editFormData, amount: parseFloat(text) })}
              value={editFormData.amount ? editFormData.amount.toString() : ''}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Currency (NGN or USD)"
              placeholderTextColor={COLORS.muted}
              onChangeText={(text) => setEditFormData({ ...editFormData, currency: text as 'NGN' | 'USD' })}
              value={editFormData.currency}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Repayment Date (YYYY-MM-DD)"
              placeholderTextColor={COLORS.muted}
              onChangeText={(text) => setEditFormData({ ...editFormData, repaymentDate: text })}
              value={editFormData.repaymentDate}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Status (Paid, Pending, Overdue)"
              placeholderTextColor={COLORS.muted}
              onChangeText={(text) => setEditFormData({ ...editFormData, status: text as 'Paid' | 'Pending' | 'Overdue' })}
              value={editFormData.status}
            />
            <TouchableOpacity onPress={handleEdit} style={[styles.button, styles.modalSaveButton]} disabled={isUpdating}>
              <Text style={styles.buttonText}>Update</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setEditModalVisible(false)} style={[styles.button, styles.modalCancelButton]}>
              <Text style={styles.buttonText}>Cancel</Text>
            </TouchableOpacity>
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
  },
  errorText: {
    color: COLORS.error,
    fontSize: 16,
    marginBottom: 10,
  },
  retryButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 5,
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
    fontSize: 20,
    fontWeight: 'bold',
  },
  createButton: {
    backgroundColor: COLORS.success,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 5,
  },
  buttonText: {
    color: COLORS.text,
    fontWeight: 'bold',
  },
  searchInput: {
    backgroundColor: COLORS.card,
    color: COLORS.text,
    padding: 10,
    margin: 15,
    borderRadius: 5,
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
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 5,
  },
  loanId: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: 'bold',
  },
  amount: {
    color: COLORS.text,
    fontSize: 14,
    marginBottom: 5,
  },
  date: {
    color: COLORS.muted,
    fontSize: 12,
    marginBottom: 10,
  },
  statusBadge: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 12,
    fontSize: 12,
    fontWeight: 'bold',
    color: COLORS.background,
  },
  statusPaid: {
    backgroundColor: COLORS.success,
  },
  statusPending: {
    backgroundColor: COLORS.warning,
  },
  statusOverdue: {
    backgroundColor: COLORS.error,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 10,
  },
  button: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 5,
    marginLeft: 10,
  },
  editButton: {
    backgroundColor: COLORS.primary,
  },
  deleteButton: {
    backgroundColor: COLORS.error,
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
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
    width: '80%',
  },
  modalTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 15,
  },
  modalInput: {
    width: '100%',
    backgroundColor: COLORS.background,
    color: COLORS.text,
    padding: 10,
    borderRadius: 5,
    marginBottom: 10,
  },
  modalSaveButton: {
    backgroundColor: COLORS.success,
    marginTop: 10,
    width: '100%',
    alignItems: 'center',
  },
  modalCancelButton: {
    backgroundColor: COLORS.error,
    marginTop: 10,
    width: '100%',
    alignItems: 'center',
  },
});

export default LoanRepaymentsScreen;
