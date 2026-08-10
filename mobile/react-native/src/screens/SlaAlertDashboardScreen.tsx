import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, FlatList, RefreshControl, SafeAreaView, StatusBar, Alert, TextInput, TouchableOpacity, Modal } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { trpc } from '../lib/trpc';

const COLORS = {
  primary: '#6366F1', background: '#0F172A', card: '#1E293B',
  text: '#F1F5F9', muted: '#94A3B8', success: '#10B981',
  error: '#EF4444', warning: '#F59E0B', border: '#334155',
};

interface SlaAlert {
  id: string;
  merchantId: string;
  alertType: string;
  threshold: number;
  currentValue: number;
  status: 'active' | 'resolved' | 'snoozed';
  createdAt: string;
  updatedAt: string;
}

const SlaAlertDashboardScreen = () => {
  const navigation = useNavigation();

  const { data: alerts, isLoading, isError, error, refetch } = trpc.slaAlerts.list.useQuery();
  const createAlertMutation = trpc.slaAlerts.create.useMutation();
  const updateAlertMutation = trpc.slaAlerts.update.useMutation();
  const deleteAlertMutation = trpc.slaAlerts.delete.useMutation();

  const [refreshing, setRefreshing] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [currentAlert, setCurrentAlert] = useState<SlaAlert | null>(null);
  const [alertType, setAlertType] = useState('');
  const [threshold, setThreshold] = useState('');
  const [currentValue, setCurrentValue] = useState('');
  const [status, setStatus] = useState<'active' | 'resolved' | 'snoozed'>('active');

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, []);

  const formatCurrency = (amount: number, currency: 'NGN' | 'USD' = 'USD') => {
    if (currency === 'NGN') {
      return `₦${amount.toFixed(2)}`;
    } else {
      return `$${amount.toFixed(2)}`;
    }
  };

  const formatDate = (dateString: string) => {
    const options: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short', day: 'numeric' };
    return new Date(dateString).toLocaleDateString(undefined, options);
  };

  const getStatusStyle = (status: SlaAlert['status']) => {
    switch (status) {
      case 'active':
        return { backgroundColor: COLORS.error, color: COLORS.text };
      case 'resolved':
        return { backgroundColor: COLORS.success, color: COLORS.text };
      case 'snoozed':
        return { backgroundColor: COLORS.warning, color: COLORS.text };
      default:
        return { backgroundColor: COLORS.muted, color: COLORS.text };
    }
  };

  const filteredAlerts = alerts?.filter(alert =>
    alert.alertType.toLowerCase().includes(searchText.toLowerCase()) ||
    alert.status.toLowerCase().includes(searchText.toLowerCase())
  );

  const openCreateModal = () => {
    setCurrentAlert(null);
    setAlertType('');
    setThreshold('');
    setCurrentValue('');
    setStatus('active');
    setIsModalVisible(true);
  };

  const openEditModal = (alert: SlaAlert) => {
    setCurrentAlert(alert);
    setAlertType(alert.alertType);
    setThreshold(alert.threshold.toString());
    setCurrentValue(alert.currentValue.toString());
    setStatus(alert.status);
    setIsModalVisible(true);
  };

  const handleSaveAlert = async () => {
    try {
      const payload = {
        alertType,
        threshold: parseFloat(threshold),
        currentValue: parseFloat(currentValue),
        status,
      };

      if (currentAlert) {
        await updateAlertMutation.mutateAsync({ id: currentAlert.id, ...payload });
      } else {
        await createAlertMutation.mutateAsync(payload);
      }
      setIsModalVisible(false);
      refetch();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to save alert.');
    }
  };

  const handleDeleteAlert = (id: string) => {
    Alert.alert(
      'Delete Alert',
      'Are you sure you want to delete this alert?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteAlertMutation.mutateAsync({ id });
              refetch();
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to delete alert.');
            }
          },
        },
      ]
    );
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Loading SLA Alerts...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (isError) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Error: {error.message}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={refetch}>
            <Text style={styles.retryButtonText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>SLA Alert Dashboard</Text>
        <TouchableOpacity style={styles.createButton} onPress={openCreateModal}>
          <Text style={styles.createButtonText}>Create New Alert</Text>
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
          <Text style={styles.emptyText}>No matching SLA alerts found.</Text>
        </View>
      ) : (
        <FlatList
          data={filteredAlerts}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => {
            const statusStyle = getStatusStyle(item.status);
            return (
              <View style={styles.alertItem}>
                <View style={styles.alertHeader}>
                  <Text style={styles.alertType}>{item.alertType}</Text>
                  <View style={[styles.statusBadge, { backgroundColor: statusStyle.backgroundColor }]}>
                    <Text style={[styles.statusBadgeText, { color: statusStyle.color }]}>{item.status.toUpperCase()}</Text>
                  </View>
                </View>
                <Text style={styles.alertDetail}>Threshold: {formatCurrency(item.threshold)}</Text>
                <Text style={styles.alertDetail}>Current Value: {formatCurrency(item.currentValue)}</Text>
                <Text style={styles.alertDetail}>Created: {formatDate(item.createdAt)}</Text>
                <Text style={styles.alertDetail}>Updated: {formatDate(item.updatedAt)}</Text>
                <View style={styles.alertActions}>
                  <TouchableOpacity style={[styles.actionButton, styles.editButton]} onPress={() => openEditModal(item)}>
                    <Text style={styles.actionButtonText}>Edit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.actionButton, styles.deleteButton]} onPress={() => handleDeleteAlert(item.id)}>
                    <Text style={styles.actionButtonText}>Delete</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          }}
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

      <Modal
        animationType="slide"
        transparent={true}
        visible={isModalVisible}
        onRequestClose={() => setIsModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{currentAlert ? 'Edit SLA Alert' : 'Create New SLA Alert'}</Text>
            <TextInput
              style={styles.input}
              placeholder="Alert Type"
              placeholderTextColor={COLORS.muted}
              value={alertType}
              onChangeText={setAlertType}
            />
            <TextInput
              style={styles.input}
              placeholder="Threshold"
              placeholderTextColor={COLORS.muted}
              keyboardType="numeric"
              value={threshold}
              onChangeText={setThreshold}
            />
            <TextInput
              style={styles.input}
              placeholder="Current Value"
              placeholderTextColor={COLORS.muted}
              keyboardType="numeric"
              value={currentValue}
              onChangeText={setCurrentValue}
            />
            <View style={styles.statusPicker}>
              <Text style={styles.statusPickerLabel}>Status:</Text>
              <TouchableOpacity
                style={[styles.statusOption, status === 'active' && styles.statusOptionSelected]}
                onPress={() => setStatus('active')}
              >
                <Text style={[styles.statusOptionText, status === 'active' && styles.statusOptionTextSelected]}>Active</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.statusOption, status === 'resolved' && styles.statusOptionSelected]}
                onPress={() => setStatus('resolved')}
              >
                <Text style={[styles.statusOptionText, status === 'resolved' && styles.statusOptionTextSelected]}>Resolved</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.statusOption, status === 'snoozed' && styles.statusOptionSelected]}
                onPress={() => setStatus('snoozed')}
              >
                <Text style={[styles.statusOptionText, status === 'snoozed' && styles.statusOptionTextSelected]}>Snoozed</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.modalButton, styles.cancelButton]} onPress={() => setIsModalVisible(false)}>
                <Text style={styles.modalButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalButton, styles.saveButton]} onPress={handleSaveAlert}>
                <Text style={styles.modalButtonText}>Save</Text>
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: COLORS.card,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  loadingText: {
    color: COLORS.muted,
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
  retryButtonText: {
    color: COLORS.text,
    fontSize: 16,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    color: COLORS.muted,
    fontSize: 16,
    marginBottom: 10,
  },
  createButton: {
    backgroundColor: COLORS.success,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 5,
  },
  createButtonText: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: 'bold',
  },
  searchInput: {
    height: 40,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 16,
    margin: 16,
    color: COLORS.text,
    backgroundColor: COLORS.card,
  },
  alertItem: {
    backgroundColor: COLORS.card,
    padding: 16,
    marginHorizontal: 16,
    marginVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  alertHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  alertType: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: 'bold',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 5,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  alertDetail: {
    color: COLORS.muted,
    fontSize: 14,
    marginBottom: 4,
  },
  alertActions: {
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
  editButton: {
    backgroundColor: COLORS.primary,
  },
  deleteButton: {
    backgroundColor: COLORS.error,
  },
  actionButtonText: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: 'bold',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalContent: {
    backgroundColor: COLORS.card,
    padding: 20,
    borderRadius: 10,
    width: '80%',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 20,
  },
  input: {
    width: '100%',
    height: 40,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    color: COLORS.text,
    backgroundColor: COLORS.background,
    marginBottom: 15,
  },
  statusPicker: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    marginBottom: 20,
    alignItems: 'center',
  },
  statusPickerLabel: {
    color: COLORS.text,
    fontSize: 16,
    marginRight: 10,
  },
  statusOption: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  statusOptionSelected: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  statusOptionText: {
    color: COLORS.muted,
    fontSize: 14,
  },
  statusOptionTextSelected: {
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
    minWidth: 100,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: COLORS.muted,
  },
  saveButton: {
    backgroundColor: COLORS.success,
  },
  modalButtonText: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default SlaAlertDashboardScreen;