import React, { useState, useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, TouchableOpacity, TextInput, Modal, Alert } from 'react-native';
import { Stack } from 'expo-router';
import { trpc } from '@/lib/trpc';

interface Loan {
  id: string;
  customerName: string;
  amount: number;
  status: 'pending' | 'approved' | 'rejected' | 'completed';
  dueDate: string;
  createdAt: string;
}

export default function BnplScreen() {
  const [showCreateLoanModal, setShowCreateLoanModal] = useState(false);
  const [newLoanCustomerName, setNewLoanCustomerName] = useState('');
  const [newLoanAmount, setNewLoanAmount] = useState('');
  const [newLoanDueDate, setNewLoanDueDate] = useState(''); // YYYY-MM-DD
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | Loan['status']>('all');

  const loansQuery = trpc.bnpl.listLoans.useQuery();
  const { data: loans, isLoading, isError, error } = loansQuery;

  const createLoanMutation = trpc.bnpl.createLoan.useMutation({
    onSuccess: () => {
      Alert.alert("Success", "Loan created successfully!");
      setShowCreateLoanModal(false);
      setNewLoanCustomerName("");
      setNewLoanAmount("");
      setNewLoanDueDate("");
      loansQuery.refetch(); // Refetch loans after creation
    },
    onError: (err) => {
      Alert.alert("Error", `Failed to create loan: ${err.message}`);
    },
  });

  const approveLoanMutation = trpc.bnpl.approveLoan.useMutation({
    onSuccess: () => {
      Alert.alert("Success", "Loan approved successfully!");
      loansQuery.refetch();
    },
    onError: (err) => {
      Alert.alert("Error", `Failed to approve loan: ${err.message}`);
    },
  });

  const rejectLoanMutation = trpc.bnpl.rejectLoan.useMutation({
    onSuccess: () => {
      Alert.alert("Success", "Loan rejected successfully!");
      loansQuery.refetch();
    },
    onError: (err) => {
      Alert.alert("Error", `Failed to reject loan: ${err.message}`);
    },
  });

  const handleApproveLoan = (loanId: string) => {
    approveLoanMutation.mutate({ loanId });
  };

  const handleRejectLoan = (loanId: string) => {
    rejectLoanMutation.mutate({ loanId });
  };

  const handleCreateLoan = () => {
    if (!newLoanCustomerName || !newLoanAmount || !newLoanDueDate) {
      Alert.alert("Validation Error", "All fields are required.");
      return;
    }
    const amount = parseFloat(newLoanAmount);
    if (isNaN(amount) || amount <= 0) {
      Alert.alert("Validation Error", "Amount must be a positive number.");
      return;
    }
    // Basic date validation (YYYY-MM-DD)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(newLoanDueDate)) {
      Alert.alert("Validation Error", "Due Date must be in YYYY-MM-DD format.");
      return;
    }

    createLoanMutation.mutate({
      customerName: newLoanCustomerName,
      amount: amount,
      dueDate: newLoanDueDate,
    });
  };

  const filteredLoans = useMemo(() => {
    if (!loans) return [];
    let filtered = loans;

    if (filterStatus !== 'all') {
      filtered = filtered.filter(loan => loan.status === filterStatus);
    }

    if (searchQuery) {
      filtered = filtered.filter(loan =>
        loan.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        loan.id.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    return filtered;
  }, [loans, searchQuery, filterStatus]);

  if (isLoading) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ title: 'BNPL Loans' }} />
        <ActivityIndicator size="large" color="#6366f1" />
        <Text style={styles.loadingText}>Fetching BNPL loans from the digital ether...</Text>
      </View>
    );
  }

  if (isError) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ title: 'BNPL Loans' }} />
        <Text style={styles.errorText}>Oops! Failed to load BNPL loans. Our servers in Lagos are trying their best!</Text>
        <Text style={styles.errorText}>Error: {error.message}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'BNPL Loans' }} />
      <Text style={styles.header}>BNPL Loan List</Text>

      <TouchableOpacity style={styles.createButton} onPress={() => setShowCreateLoanModal(true)}>
        <Text style={styles.createButtonText}>+ Create New Loan</Text>
      </TouchableOpacity>

      <TextInput
        style={styles.searchInput}
        placeholder="Search by customer or loan ID..."
        placeholderTextColor="#94a3b8"
        value={searchQuery}
        onChangeText={setSearchQuery}
      />

      <View style={styles.filterContainer}>
        <TouchableOpacity
          style={[styles.filterButton, filterStatus === 'all' && styles.filterButtonActive]}
          onPress={() => setFilterStatus('all')}
        >
          <Text style={styles.filterButtonText}>All</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterButton, filterStatus === 'pending' && styles.filterButtonActive]}
          onPress={() => setFilterStatus('pending')}
        >
          <Text style={styles.filterButtonText}>Pending</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterButton, filterStatus === 'approved' && styles.filterButtonActive]}
          onPress={() => setFilterStatus('approved')}
        >
          <Text style={styles.filterButtonText}>Approved</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterButton, filterStatus === 'rejected' && styles.filterButtonActive]}
          onPress={() => setFilterStatus('rejected')}
        >
          <Text style={styles.filterButtonText}>Rejected</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterButton, filterStatus === 'completed' && styles.filterButtonActive]}
          onPress={() => setFilterStatus('completed')}
        >
          <Text style={styles.filterButtonText}>Completed</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollViewContent}>
        {filteredLoans.length > 0 ? (
          filteredLoans.map((loan) => (
            <View key={loan.id} style={styles.card}>
              <Text style={styles.cardTitle}>Loan ID: {loan.id}</Text>
              <Text style={styles.cardText}>Customer: {loan.customerName}</Text>
              <Text style={styles.cardText}>Amount: ₦{loan.amount.toLocaleString()}</Text>
              <Text style={styles.cardText}>Status: <Text style={getStatusStyle(loan.status)}>{loan.status.toUpperCase()}</Text></Text>
              <Text style={styles.cardText}>Due Date: {new Date(loan.dueDate).toLocaleDateString()}</Text>
              <Text style={styles.cardText}>Created: {new Date(loan.createdAt).toLocaleDateString()}</Text>
              {loan.status === 'pending' && (
                <View style={styles.actionButtonsContainer}>
                  <TouchableOpacity
                    style={[styles.actionButton, styles.approveButton]}
                    onPress={() => handleApproveLoan(loan.id)}
                    disabled={approveLoanMutation.isLoading || rejectLoanMutation.isLoading}
                  >
                    {approveLoanMutation.isLoading ? (
                      <ActivityIndicator color="#f8fafc" />
                    ) : (
                      <Text style={styles.actionButtonText}>Approve</Text>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.actionButton, styles.rejectButton]}
                    onPress={() => handleRejectLoan(loan.id)}
                    disabled={approveLoanMutation.isLoading || rejectLoanMutation.isLoading}
                  >
                    {rejectLoanMutation.isLoading ? (
                      <ActivityIndicator color="#f8fafc" />
                    ) : (
                      <Text style={styles.actionButtonText}>Reject</Text>
                    )}
                  </TouchableOpacity>
                </View>
              )}
            </View>
          ))
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>No BNPL loans found. Time to empower more Nigerian businesses!</Text>
            <Text style={styles.emptyStateText}>Start by creating a new loan request.</Text>
          </View>
        )}
      </ScrollView>

      <Modal
        animationType="slide"
        transparent={true}
        visible={showCreateLoanModal}
        onRequestClose={() => setShowCreateLoanModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <Text style={styles.modalTitle}>Create New BNPL Loan</Text>

            <TextInput
              style={styles.modalInput}
              placeholder="Customer Name (e.g., Adaobi Okoro)"
              placeholderTextColor="#94a3b8"
              value={newLoanCustomerName}
              onChangeText={setNewLoanCustomerName}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Amount (e.g., 50000)"
              placeholderTextColor="#94a3b8"
              keyboardType="numeric"
              value={newLoanAmount}
              onChangeText={setNewLoanAmount}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Due Date (YYYY-MM-DD)"
              placeholderTextColor="#94a3b8"
              value={newLoanDueDate}
              onChangeText={setNewLoanDueDate}
            />

            <TouchableOpacity
              style={[styles.modalButton, styles.modalCreateButton]}
              onPress={handleCreateLoan}
              disabled={createLoanMutation.isLoading}
            >
              {createLoanMutation.isLoading ? (
                <ActivityIndicator color="#f8fafc" />
              ) : (
                <Text style={styles.modalButtonText}>Create Loan</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modalButton, styles.modalCancelButton]}
              onPress={() => setShowCreateLoanModal(false)}
              disabled={createLoanMutation.isLoading}
            >
              <Text style={styles.modalButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const getStatusStyle = (status: Loan['status']) => {
  switch (status) {
    case 'approved':
      return styles.statusApproved;
    case 'pending':
      return styles.statusPending;
    case 'rejected':
      return styles.statusRejected;
    case 'completed':
      return styles.statusCompleted;
    default:
      return styles.cardText;
  }
};

const styles = StyleSheet.create({
  searchInput: {
    height: 40,
    borderColor: '#1e293b',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    color: '#f8fafc',
    marginBottom: 15,
    backgroundColor: '#1e293b',
  },
  filterContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 15,
  },
  filterButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#6366f1',
  },
  filterButtonActive: {
    backgroundColor: '#6366f1',
  },
  filterButtonText: {
    color: '#f8fafc',
    fontWeight: 'bold',
  },
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
    padding: 16,
  },
  header: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#f8fafc',
    marginBottom: 20,
    textAlign: 'center',
  },
  scrollViewContent: {
    paddingBottom: 20,
  },
  card: {
    backgroundColor: '#1e293b',
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#f8fafc',
    marginBottom: 8,
  },
  cardText: {
    fontSize: 14,
    color: '#94a3b8',
    marginBottom: 4,
  },
  loadingText: {
    color: '#94a3b8',
    marginTop: 10,
    textAlign: 'center',
  },
  errorText: {
    color: 'red',
    marginTop: 10,
    textAlign: 'center',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  emptyStateText: {
    color: '#94a3b8',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 10,
  },
  statusApproved: {
    color: '#22c55e',
    fontWeight: 'bold',
  },
  statusPending: {
    color: '#eab308',
    fontWeight: 'bold',
  },
  statusRejected: {
    color: '#ef4444',
    fontWeight: 'bold',
  },
  statusCompleted: {
    color: '#3b82f6',
    fontWeight: 'bold',
  },
  createButton: {
    backgroundColor: '#6366f1',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignSelf: 'center',
    marginBottom: 20,
  },
  createButtonText: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: 'bold',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  modalContainer: {
    width: '85%',
    backgroundColor: '#1e293b',
    borderRadius: 10,
    padding: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#f8fafc',
    marginBottom: 20,
  },
  modalInput: {
    width: '100%',
    height: 45,
    backgroundColor: '#0f172a',
    color: '#f8fafc',
    borderRadius: 8,
    paddingHorizontal: 15,
    marginBottom: 15,
    borderColor: '#6366f1',
    borderWidth: 1,
  },
  modalButton: {
    width: '100%',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 10,
  },
  modalCreateButton: {
    backgroundColor: '#6366f1',
  },
  modalCancelButton: {
    backgroundColor: '#ef4444',
  },
  modalButtonText: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: 'bold',
  },
  actionButtonsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 10,
  },
  actionButton: {
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 5,
    minWidth: 100,
    alignItems: 'center',
  },
  approveButton: {
    backgroundColor: '#22c55e',
  },
  rejectButton: {
    backgroundColor: '#ef4444',
  },
  actionButtonText: {
    color: '#f8fafc',
    fontWeight: 'bold',
  },
});
