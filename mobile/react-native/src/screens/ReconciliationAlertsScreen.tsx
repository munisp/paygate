import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, Alert, TextInput, TouchableOpacity, Modal, SafeAreaView, StatusBar, RefreshControl } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { trpc } from '../lib/trpc';

const COLORS = {
  primary: '#6366F1', background: '#0F172A', card: '#1E293B',
  text: '#F1F5F9', muted: '#94A3B8', success: '#10B981',
  error: '#EF4444', warning: '#F59E0B', border: '#334155',
};

type ReconciliationAlert = {
  id: string;
  title: string;
  description: string;
  amount: number;
  currency: 'NGN' | 'USD';
  status: 'pending' | 'resolved' | 'dismissed';
  createdAt: string;
};

const ReconciliationAlertsScreen = () => {
  const navigation = useNavigation();
  const [searchText, setSearchText] = useState('');
  const [isCreateModalVisible, setCreateModalVisible] = useState(false);
  const [isEditModalVisible, setEditModalVisible] = useState(false);
  const [currentAlert, setCurrentAlert] = useState<ReconciliationAlert | null>(null);

  const { data: alerts, isLoading, isError, error, refetch } = trpc.reconciliation.alerts.list.useQuery();
  const createMutation = trpc.reconciliation.alerts.create.useMutation();
  const updateMutation = trpc.reconciliation.alerts.update.useMutation();
  const deleteMutation = trpc.reconciliation.alerts.delete.useMutation();

  const onRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  const filteredAlerts = alerts?.filter(alert =>
    alert.title.toLowerCase().includes(searchText.toLowerCase()) ||
    alert.description.toLowerCase().includes(searchText.toLowerCase())
  );

  const handleCreateAlert = (newAlert: Omit<ReconciliationAlert, 'id' | 'createdAt'>) => {
    createMutation.mutate(newAlert, {
      onSuccess: () => {
        refetch();
        setCreateModalVisible(false);
      },
      onError: (err) => {
        Alert.alert('Error', err.message);
      }
    });
  };

  const handleUpdateAlert = (updatedAlert: ReconciliationAlert) => {
    updateMutation.mutate(updatedAlert, {
      onSuccess: () => {
        refetch();
        setEditModalVisible(false);
        setCurrentAlert(null);
      },
      onError: (err) => {
        Alert.alert('Error', err.message);
      }
    });
  };

  const handleDeleteAlert = (id: string) => {
    Alert.alert(
      'Confirm Delete',
      'Are you sure you want to delete this alert?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            deleteMutation.mutate({ id }, {
              onSuccess: () => {
                refetch();
              },
              onError: (err) => {
                Alert.alert('Error', err.message);
              }
            });
          },
        },
      ]
    );
  };

  const renderAlertItem = ({ item }: { item: ReconciliationAlert }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>{item.title}</Text>
        <Text style={[styles.statusBadge, item.status === 'resolved' ? styles.statusResolved : item.status === 'dismissed' ? styles.statusDismissed : styles.statusPending]}>
          {item.status.toUpperCase()}
        </Text>
      </View>
      <Text style={styles.cardDescription}>{item.description}</Text>
      <Text style={styles.cardAmount}>{item.currency === 'NGN' ? '₦' : '$'}{item.amount.toFixed(2)}</Text>
      <Text style={styles.cardDate}>Created: {new Date(item.createdAt).toLocaleDateString()}</Text>
      <View style={styles.cardActions}>
        <TouchableOpacity style={styles.editButton} onPress={() => { setCurrentAlert(item); setEditModalVisible(true); }}>
          <Text style={styles.buttonText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.deleteButton} onPress={() => handleDeleteAlert(item.id)}>
          <Text style={styles.buttonText}>Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  if (isLoading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading alerts...</Text>
      </SafeAreaView>
    );
  }

  if (isError) {
    return (
      <SafeAreaView style={styles.errorContainer}>
        <Text style={styles.errorText}>Failed to load alerts: {error?.message}</Text>
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
        <Text style={styles.headerTitle}>Reconciliation Alerts</Text>
        <TouchableOpacity style={styles.createButton} onPress={() => setCreateModalVisible(true)}>
          <Text style={styles.buttonText}>Create Alert</Text>
        </TouchableOpacity>
      </View>

      <TextInput
        style={styles.searchInput}
        placeholder="Search alerts..."
        placeholderTextColor={COLORS.muted}
        value={searchText}
        onChangeText={setSearchText}
      />

      {filteredAlerts && filteredAlerts.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No reconciliation alerts found.</Text>
        </View>
      ) : (
        <FlatList
          data={filteredAlerts}
          keyExtractor={(item) => item.id}
          renderItem={renderAlertItem}
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

      {/* Create Alert Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isCreateModalVisible}
        onRequestClose={() => setCreateModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Create New Alert</Text>
            {/* Form fields for new alert */}
            <TextInput style={styles.input} placeholder="Title" placeholderTextColor={COLORS.muted} />
            <TextInput style={styles.input} placeholder="Description" placeholderTextColor={COLORS.muted} multiline />
            <TextInput style={styles.input} placeholder="Amount" placeholderTextColor={COLORS.muted} keyboardType="numeric" />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelButton} onPress={() => setCreateModalVisible(false)}>
                <Text style={styles.buttonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveButton} onPress={() => handleCreateAlert({ title: 'New Alert', description: 'Description', amount: 100, currency: 'NGN', status: 'pending' })}> {/* Placeholder data */}
                <Text style={styles.buttonText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Edit Alert Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isEditModalVisible}
        onRequestClose={() => setEditModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Edit Alert</Text>
            {/* Form fields for editing alert */}
            <TextInput style={styles.input} placeholder="Title" placeholderTextColor={COLORS.muted} value={currentAlert?.title} />
            <TextInput style={styles.input} placeholder="Description" placeholderTextColor={COLORS.muted} multiline value={currentAlert?.description} />
            <TextInput style={styles.input} placeholder="Amount" placeholderTextColor={COLORS.muted} keyboardType="numeric" value={currentAlert?.amount.toString()} />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelButton} onPress={() => { setEditModalVisible(false); setCurrentAlert(null); }}>
                <Text style={styles.buttonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveButton} onPress={() => currentAlert && handleUpdateAlert(currentAlert)}> {/* Placeholder data */}
                <Text style={styles.buttonText}>Save</Text>
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
  retryButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 5,
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
  searchInput: {
    backgroundColor: COLORS.card,
    color: COLORS.text,
    padding: 10,
    margin: 10,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  listContent: {
    paddingHorizontal: 10,
    paddingBottom: 20,
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
    flexShrink: 1,
    marginRight: 10,
  },
  cardDescription: {
    color: COLORS.muted,
    fontSize: 14,
    marginBottom: 5,
  },
  cardAmount: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  cardDate: {
    color: COLORS.muted,
    fontSize: 12,
    marginBottom: 10,
  },
  statusBadge: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
    fontSize: 10,
    fontWeight: 'bold',
  },
  statusPending: {
    backgroundColor: COLORS.warning,
    color: COLORS.background,
  },
  statusResolved: {
    backgroundColor: COLORS.success,
    color: COLORS.background,
  },
  statusDismissed: {
    backgroundColor: COLORS.muted,
    color: COLORS.background,
  },
  cardActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 10,
  },
  editButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 5,
    marginLeft: 10,
  },
  deleteButton: {
    backgroundColor: COLORS.error,
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 5,
    marginLeft: 10,
  },
  buttonText: {
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
    backgroundColor: COLORS.card,
    borderRadius: 10,
    padding: 20,
    width: '90%',
    maxHeight: '80%',
  },
  modalTitle: {
    color: COLORS.text,
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  input: {
    backgroundColor: COLORS.background,
    color: COLORS.text,
    padding: 10,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 15,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 20,
  },
  cancelButton: {
    backgroundColor: COLORS.muted,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 5,
    marginRight: 10,
  },
  saveButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 5,
  },
});

export default ReconciliationAlertsScreen;