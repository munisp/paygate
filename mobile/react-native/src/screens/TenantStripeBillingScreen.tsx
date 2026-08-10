import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, FlatList, RefreshControl, SafeAreaView, StatusBar, TouchableOpacity, Alert, Modal, TextInput, Button } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { trpc } from '../lib/trpc';

const COLORS = {
  primary: '#6366F1', background: '#0F172A', card: '#1E293B',
  text: '#F1F5F9', muted: '#94A3B8', success: '#10B981',
  error: '#EF4444', warning: '#F59E0B', border: '#334155',
};

interface BillingRecord {
  id: string;
  amount: number;
  currency: 'USD' | 'NGN';
  status: 'paid' | 'pending' | 'failed';
  date: string;
  description: string;
}

const TenantStripeBillingScreen = () => {
  const navigation = useNavigation();
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [currentRecord, setCurrentRecord] = useState<BillingRecord | null>(null);
  const [formState, setFormState] = useState({
    amount: '',
    currency: 'USD',
    description: '',
  });

  // Placeholder for tRPC queries and mutations
  const { data, isLoading, error, refetch } = trpc.tenantStripeBilling.list.useQuery();
  const createMutation = trpc.tenantStripeBilling.create.useMutation();
  const updateMutation = trpc.tenantStripeBilling.update.useMutation();
  const deleteMutation = trpc.tenantStripeBilling.delete.useMutation();

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, []);

  const handleCreate = async () => {
    try {
      await createMutation.mutateAsync({
        amount: parseFloat(formState.amount),
        currency: formState.currency as 'USD' | 'NGN',
        description: formState.description,
      });
      setModalVisible(false);
      setFormState({ amount: '', currency: 'USD', description: '' });
      refetch();
    } catch (err) {
      Alert.alert('Error', 'Failed to create record.');
    }
  };

  const handleEdit = (record: BillingRecord) => {
    setCurrentRecord(record);
    setFormState({
      amount: record.amount.toString(),
      currency: record.currency,
      description: record.description,
    });
    setModalVisible(true);
  };

  const handleUpdate = async () => {
    if (!currentRecord) return;
    try {
      await updateMutation.mutateAsync({
        id: currentRecord.id,
        amount: parseFloat(formState.amount),
        currency: formState.currency as 'USD' | 'NGN',
        description: formState.description,
      });
      setModalVisible(false);
      setCurrentRecord(null);
      setFormState({ amount: '', currency: 'USD', description: '' });
      refetch();
    } catch (err) {
      Alert.alert('Error', 'Failed to update record.');
    }
  };

  const handleDelete = (id: string) => {
    Alert.alert(
      'Delete Record',
      'Are you sure you want to delete this record?',
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
              Alert.alert('Error', 'Failed to delete record.');
            }
          },
        },
      ]
    );
  };

  const formatAmount = (amount: number, currency: 'USD' | 'NGN') => {
    const formatter = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
    });
    return formatter.format(amount);
  };

  const formatDate = (dateString: string) => {
    const options: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short', day: 'numeric' };
    return new Date(dateString).toLocaleDateString(undefined, options);
  };

    const getStatusStyle = (status: BillingRecord["status"]) => {
    switch (status) {
      case 'paid':
        return styles.statusPaid;
      case 'pending':
        return styles.statusPending;
      case 'failed':
        return styles.statusFailed;
      default:
        return {};
    }
  };

  const renderItem = ({ item }: { item: BillingRecord }) => (
    <View style={styles.itemContainer}>
      <View>
        <Text style={styles.itemDescription}>{item.description}</Text>
        <Text style={styles.itemAmount}>{formatAmount(item.amount, item.currency)}</Text>
        <Text style={styles.itemDate}>{formatDate(item.date)}</Text>
        <View style={[styles.statusBadge, getStatusStyle(item.status)]}>
          <Text style={styles.statusText}>{item.status.toUpperCase()}</Text>
        </View>
      </View>
      <View style={styles.itemActions}>
        <TouchableOpacity onPress={() => handleEdit(item)} style={styles.editButton}>
          <Text style={styles.buttonText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => handleDelete(item.id)} style={styles.deleteButton}>
          <Text style={styles.buttonText}>Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  if (isLoading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading billing records...</Text>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.errorContainer}>
        <Text style={styles.errorText}>Failed to load billing records.</Text>
        <Button title="Retry" onPress={() => refetch()} color={COLORS.primary} />
      </SafeAreaView>
    );
  }

  if (!data || data.length === 0) {
    return (
      <SafeAreaView style={styles.emptyContainer}>
        <Text style={styles.emptyText}>No billing records found.</Text>
        <Button title="Create New Record" onPress={() => setModalVisible(true)} color={COLORS.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Tenant Stripe Billing</Text>
        <TouchableOpacity onPress={() => {
          setCurrentRecord(null);
          setFormState({ amount: '', currency: 'USD', description: '' });
          setModalVisible(true);
        }} style={styles.createButton}>
          <Text style={styles.buttonText}>Create</Text>
        </TouchableOpacity>
      </View>
      <FlatList
        data={data}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.primary}
          />
        }
      />

      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.centeredView}>
          <View style={styles.modalView}>
            <Text style={styles.modalTitle}>{currentRecord ? 'Edit Record' : 'Create New Record'}</Text>
            <TextInput
              style={styles.input}
              placeholder="Amount"
              placeholderTextColor={COLORS.muted}
              keyboardType="numeric"
              value={formState.amount}
              onChangeText={(text) => setFormState({ ...formState, amount: text })}
            />
            <TextInput
              style={styles.input}
              placeholder="Currency (USD or NGN)"
              placeholderTextColor={COLORS.muted}
              value={formState.currency}
              onChangeText={(text) => setFormState({ ...formState, currency: text })}
            />
            <TextInput
              style={styles.input}
              placeholder="Description"
              placeholderTextColor={COLORS.muted}
              value={formState.description}
              onChangeText={(text) => setFormState({ ...formState, description: text })}
            />
            <View style={styles.modalActions}>
              <Button title="Cancel" onPress={() => setModalVisible(false)} color={COLORS.error} />
              <Button
                title={currentRecord ? 'Update' : 'Create'}
                onPress={currentRecord ? handleUpdate : handleCreate}
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
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  errorText: {
    color: COLORS.error,
    marginBottom: 10,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  emptyText: {
    color: COLORS.muted,
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
    color: COLORS.text,
    fontSize: 20,
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
  listContent: {
    paddingHorizontal: 15,
    paddingBottom: 15,
  },
  itemContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    padding: 15,
    borderRadius: 8,
    marginTop: 10,
  },
  itemDescription: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: 'bold',
  },
  itemAmount: {
    color: COLORS.success,
    fontSize: 14,
    marginTop: 5,
  },
  itemDate: {
    color: COLORS.muted,
    fontSize: 12,
    marginTop: 5,
  },
  itemActions: {
    flexDirection: 'row',
  },
  editButton: {
    backgroundColor: COLORS.warning,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 5,
    marginRight: 10,
  },
  deleteButton: {
    backgroundColor: COLORS.error,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 5,
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
    marginBottom: 15,
    textAlign: 'center',
    fontSize: 18,
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
    backgroundColor: COLORS.card,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginTop: 5,
    alignSelf: 'flex-start',
  },
  statusText: {
    color: COLORS.background,
    fontSize: 10,
    fontWeight: 'bold',
  },
  statusPaid: {
    backgroundColor: COLORS.success,
  },
  statusPending: {
    backgroundColor: COLORS.warning,
  },
  statusFailed: {
    backgroundColor: COLORS.error,
  },
});

export default TenantStripeBillingScreen;