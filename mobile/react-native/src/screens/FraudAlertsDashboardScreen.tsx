import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, SafeAreaView, StatusBar, FlatList, ActivityIndicator, RefreshControl, TouchableOpacity, Alert, Modal, TextInput, Button } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { trpc } from '../lib/trpc';

const COLORS = {
  primary: '#6366F1', background: '#0F172A', card: '#1E293B',
  text: '#F1F5F9', muted: '#94A3B8', success: '#10B981',
  error: '#EF4444', warning: '#F59E0B', border: '#334155',
};

interface FraudAlert {
  id: string;
  transactionId: string;
  amount: number;
  currency: 'NGN' | 'USD';
  status: 'pending' | 'approved' | 'rejected';
  alertDate: string;
  reason: string;
}

const FraudAlertsDashboardScreen = () => {
  const navigation = useNavigation();
  const [refreshing, setRefreshing] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [isCreateModalVisible, setCreateModalVisible] = useState(false);
  const [isEditModalVisible, setEditModalVisible] = useState(false);
  const [currentAlert, setCurrentAlert] = useState<FraudAlert | null>(null);
  const [newAlert, setNewAlert] = useState<Omit<FraudAlert, 'id' | 'alertDate'>>({
    transactionId: '',
    amount: 0,
    currency: 'USD',
    status: 'pending',
    reason: '',
  });
  const [editAlertData, setEditAlertData] = useState<FraudAlert | null>(null);

  const { data: fraudAlerts, isLoading, isError, refetch } = trpc.fraudAlerts.list.useQuery();
  const createMutation = trpc.fraudAlerts.create.useMutation();
  const updateMutation = trpc.fraudAlerts.update.useMutation();
  const deleteMutation = trpc.fraudAlerts.delete.useMutation();

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    refetch().finally(() => setRefreshing(false));
  }, [refetch]);

  const filteredData = (fraudAlerts || []).filter(alert =>
    alert.transactionId.toLowerCase().includes(searchText.toLowerCase()) ||
    alert.reason.toLowerCase().includes(searchText.toLowerCase())
  );

  const renderItem = ({ item }: { item: FraudAlert }) => (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Transaction ID: {item.transactionId}</Text>
      <Text style={styles.cardText}>Amount: {item.currency === 'NGN' ? '₦' : '$'}{item.amount.toFixed(2)}</Text>
      <Text style={styles.cardText}>Status: <Text style={{ color: item.status === 'approved' ? COLORS.success : item.status === 'rejected' ? COLORS.error : COLORS.warning }}>{item.status.toUpperCase()}</Text></Text>
      <Text style={styles.cardText}>Date: {new Date(item.alertDate).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}</Text>
      <Text style={styles.cardText}>Reason: {item.reason}</Text>
      <View style={styles.cardActions}>
        <TouchableOpacity style={[styles.button, { backgroundColor: COLORS.primary }]} onPress={() => handleEdit(item)}>
          <Text style={styles.buttonText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.button, { backgroundColor: COLORS.error }]} onPress={() => handleDelete(item.id)}>
          <Text style={styles.buttonText}>Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const handleCreate = () => {
    setNewAlert({
      transactionId: '',
      amount: 0,
      currency: 'USD',
      status: 'pending',
      reason: '',
    });
    setCreateModalVisible(true);
  };

  const submitCreate = async () => {
    try {
      await createMutation.mutateAsync(newAlert);
      setCreateModalVisible(false);
      refetch();
    } catch (err) {
      Alert.alert('Error', 'Failed to create fraud alert.');
      console.error('Create error:', err);
    }
  };

  const handleEdit = (alert: FraudAlert) => {
    setCurrentAlert(alert);
    setEditAlertData({ ...alert }); // Clone for editing
    setEditModalVisible(true);
  };

  const submitEdit = async () => {
    if (!editAlertData) return;
    try {
      await updateMutation.mutateAsync(editAlertData);
      setEditModalVisible(false);
      refetch();
    } catch (err) {
      Alert.alert('Error', 'Failed to update fraud alert.');
      console.error('Update error:', err);
    }
  };

  const handleDelete = (id: string) => {
    Alert.alert(
      'Confirm Deletion',
      'Are you sure you want to delete this fraud alert?',
      [
        { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: async () => {
            try {
              await deleteMutation.mutateAsync({ id });
              refetch();
            } catch (err) {
              Alert.alert('Error', 'Failed to delete fraud alert.');
              console.error('Delete error:', err);
            }
          }},
      ]
    );
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading fraud alerts...</Text>
      </SafeAreaView>
    );
  }

  if (isError) {
    return (
      <SafeAreaView style={styles.errorContainer}>
        <Text style={styles.errorText}>Failed to load fraud alerts.</Text>
        <TouchableOpacity style={styles.retryButton} onPress={refetch}>
          <Text style={styles.buttonText}>Retry</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      <View style={styles.header}>
        <Text style={styles.title}>Fraud Alerts Dashboard</Text>
        <TouchableOpacity style={[styles.button, { backgroundColor: COLORS.success }]} onPress={handleCreate}>
          <Text style={styles.buttonText}>Add Alert</Text>
        </TouchableOpacity>
      </View>
      <TextInput
        style={styles.searchInput}
        placeholder="Search by Transaction ID or Reason"
        placeholderTextColor={COLORS.muted}
        value={searchText}
        onChangeText={setSearchText}
      />
      {filteredData.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No fraud alerts found.</Text>
        </View>
      ) : (
        <FlatList
          data={filteredData}
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
        />
      )}

      {/* Create Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isCreateModalVisible}
        onRequestClose={() => setCreateModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Create New Fraud Alert</Text>
            <TextInput style={styles.modalInput} placeholder="Transaction ID" placeholderTextColor={COLORS.muted} value={newAlert.transactionId} onChangeText={(text) => setNewAlert({ ...newAlert, transactionId: text })} />
            <TextInput style={styles.modalInput} placeholder="Amount" placeholderTextColor={COLORS.muted} keyboardType="numeric" value={newAlert.amount.toString()} onChangeText={(text) => setNewAlert({ ...newAlert, amount: parseFloat(text) || 0 })} />
            <TextInput style={styles.modalInput} placeholder="Currency (NGN/USD)" placeholderTextColor={COLORS.muted} value={newAlert.currency} onChangeText={(text) => setNewAlert({ ...newAlert, currency: text as 'NGN' | 'USD' })} />
            <TextInput style={styles.modalInput} placeholder="Status (pending/approved/rejected)" placeholderTextColor={COLORS.muted} value={newAlert.status} onChangeText={(text) => setNewAlert({ ...newAlert, status: text as 'pending' | 'approved' | 'rejected' })} />
            <TextInput style={styles.modalInput} placeholder="Reason" placeholderTextColor={COLORS.muted} value={newAlert.reason} onChangeText={(text) => setNewAlert({ ...newAlert, reason: text })} />
            <View style={styles.modalActions}>
              <Button title="Cancel" onPress={() => setCreateModalVisible(false)} color={COLORS.error} />
              <Button title="Create" onPress={submitCreate} color={COLORS.success} />
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
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Edit Fraud Alert</Text>
            {editAlertData && (
              <>
                <TextInput style={styles.modalInput} placeholder="Transaction ID" placeholderTextColor={COLORS.muted} value={editAlertData.transactionId} onChangeText={(text) => setEditAlertData({ ...editAlertData, transactionId: text })} />
                <TextInput style={styles.modalInput} placeholder="Amount" placeholderTextColor={COLORS.muted} keyboardType="numeric" value={editAlertData.amount.toString()} onChangeText={(text) => setEditAlertData({ ...editAlertData, amount: parseFloat(text) || 0 })} />
                <TextInput style={styles.modalInput} placeholder="Currency (NGN/USD)" placeholderTextColor={COLORS.muted} value={editAlertData.currency} onChangeText={(text) => setEditAlertData({ ...editAlertData, currency: text as 'NGN' | 'USD' })} />
                <TextInput style={styles.modalInput} placeholder="Status (pending/approved/rejected)" placeholderTextColor={COLORS.muted} value={editAlertData.status} onChangeText={(text) => setEditAlertData({ ...editAlertData, status: text as 'pending' | 'approved' | 'rejected' })} />
                <TextInput style={styles.modalInput} placeholder="Reason" placeholderTextColor={COLORS.muted} value={editAlertData.reason} onChangeText={(text) => setEditAlertData({ ...editAlertData, reason: text })} />
              </>
            )}
            <View style={styles.modalActions}>
              <Button title="Cancel" onPress={() => setEditModalVisible(false)} color={COLORS.error} />
              <Button title="Save" onPress={submitEdit} color={COLORS.primary} />
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
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  searchInput: {
    height: 40,
    backgroundColor: COLORS.card,
    borderRadius: 8,
    paddingHorizontal: 15,
    margin: 15,
    color: COLORS.text,
    fontSize: 16,
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
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 5,
  },
  cardText: {
    fontSize: 15,
    color: COLORS.muted,
    marginBottom: 3,
  },
  cardActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 10,
  },
  button: {
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 5,
    marginLeft: 10,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 14,
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
    fontSize: 18,
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  modalContent: {
    backgroundColor: COLORS.background,
    borderRadius: 10,
    padding: 20,
    width: '90%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 20,
    textAlign: 'center',
  },
  modalInput: {
    height: 45,
    backgroundColor: COLORS.card,
    borderRadius: 8,
    paddingHorizontal: 15,
    marginBottom: 15,
    color: COLORS.text,
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

export default FraudAlertsDashboardScreen;
