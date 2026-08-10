
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
  TextInput,
  TouchableOpacity,
  Alert,
  Modal,
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

// Interface for Kiosk Health Record
interface KioskHealthRecord {
  id: string;
  name: string;
  status: 'healthy' | 'warning' | 'critical';
  lastCheck: string; // ISO date string
  uptimePercentage: number;
  location: string;
  // Add other relevant fields for a kiosk health record
}

const KioskHealthScreen = () => {
  const navigation = useNavigation();
  const [searchText, setSearchText] = useState('');
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingRecord, setEditingRecord] = useState<KioskHealthRecord | null>(null);
  const [newRecordName, setNewRecordName] = useState('');
  const [newRecordLocation, setNewRecordLocation] = useState('');

  // tRPC queries and mutations
  const { data, isLoading, isError, refetch } = trpc.kiosk.listHealth.useQuery();
  const createMutation = trpc.kiosk.createHealth.useMutation();
  const updateMutation = trpc.kiosk.updateHealth.useMutation();
  const deleteMutation = trpc.kiosk.deleteHealth.useMutation();

  const onRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  const filteredData = data?.filter(record =>
    record.name.toLowerCase().includes(searchText.toLowerCase()) ||
    record.location.toLowerCase().includes(searchText.toLowerCase())
  );

  const handleCreateOrUpdate = async () => {
    try {
      if (editingRecord) {
        await updateMutation.mutateAsync({
          id: editingRecord.id,
          name: newRecordName,
          location: newRecordLocation,
          // Assuming status and uptimePercentage are managed server-side or derived
        });
      } else {
        await createMutation.mutateAsync({
          name: newRecordName,
          location: newRecordLocation,
          // Default status and uptime for new records
          status: 'healthy',
          uptimePercentage: 100,
          lastCheck: new Date().toISOString(),
        });
      }
      refetch();
      setIsModalVisible(false);
      setEditingRecord(null);
      setNewRecordName('');
      setNewRecordLocation('');
    } catch (error) {
      Alert.alert('Error', 'Failed to save kiosk health record.');
      console.error(error);
    }
  };

  const handleDelete = (id: string) => {
    Alert.alert(
      'Confirm Delete',
      'Are you sure you want to delete this kiosk health record?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteMutation.mutateAsync({ id });
              refetch();
            } catch (error) {
              Alert.alert('Error', 'Failed to delete kiosk health record.');
              console.error(error);
            }
          },
        },
      ]
    );
  };

  const openCreateModal = () => {
    setEditingRecord(null);
    setNewRecordName('');
    setNewRecordLocation('');
    setIsModalVisible(true);
  };

  const openEditModal = (record: KioskHealthRecord) => {
    setEditingRecord(record);
    setNewRecordName(record.name);
    setNewRecordLocation(record.location);
    setIsModalVisible(true);
  };

  const renderStatusBadge = (status: KioskHealthRecord['status']) => {
    let color;
    switch (status) {
      case 'healthy':
        color = COLORS.success;
        break;
      case 'warning':
        color = COLORS.warning;
        break;
      case 'critical':
        color = COLORS.error;
        break;
      default:
        color = COLORS.muted;
    }
    return (
      <View style={[styles.statusBadge, { backgroundColor: color }]}>
        <Text style={styles.statusBadgeText}>{status.toUpperCase()}</Text>
      </View>
    );
  };

  const formatCurrency = (amount: number, currency: 'NGN' | 'USD' = 'NGN') => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 2,
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(dateString));
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading Kiosk Health...</Text>
      </SafeAreaView>
    );
  }

  if (isError) {
    return (
      <SafeAreaView style={styles.errorContainer}>
        <Text style={styles.errorText}>Failed to load kiosk health data.</Text>
        <TouchableOpacity onPress={refetch} style={styles.retryButton}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  if (!filteredData || filteredData.length === 0) {
    return (
      <SafeAreaView style={styles.emptyContainer}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
        <Text style={styles.emptyText}>No kiosk health records found.</Text>
        <TouchableOpacity onPress={openCreateModal} style={styles.createButton}>
          <Text style={styles.createButtonText}>Add New Kiosk</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Kiosk Health</Text>
        <TouchableOpacity onPress={openCreateModal} style={styles.addButton}>
          <Text style={styles.addButtonText}>+</Text>
        </TouchableOpacity>
      </View>
      <TextInput
        style={styles.searchInput}
        placeholder="Search kiosks..."
        placeholderTextColor={COLORS.muted}
        value={searchText}
        onChangeText={setSearchText}
      />
      <FlatList
        data={filteredData}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>{item.name}</Text>
              {renderStatusBadge(item.status)}
            </View>
            <Text style={styles.cardText}>Location: {item.location}</Text>
            <Text style={styles.cardText}>Uptime: {item.uptimePercentage}%</Text>
            <Text style={styles.cardText}>Last Check: {formatDate(item.lastCheck)}</Text>
            {/* Example of amount formatting, assuming a 'value' field exists */}
            {/* <Text style={styles.cardText}>Revenue: {formatCurrency(123456.78)}</Text> */}
            <View style={styles.actions}>
              <TouchableOpacity onPress={() => openEditModal(item)} style={[styles.actionButton, styles.editButton]}>
                <Text style={styles.actionButtonText}>Edit</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => handleDelete(item.id)} style={[styles.actionButton, styles.deleteButton]}>
                <Text style={styles.actionButtonText}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={onRefresh}
            tintColor={COLORS.primary}
          />
        }
      />

      <Modal
        animationType="slide"
        transparent={true}
        visible={isModalVisible}
        onRequestClose={() => setIsModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {editingRecord ? 'Edit Kiosk Health' : 'Add New Kiosk Health'}
            </Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Kiosk Name"
              placeholderTextColor={COLORS.muted}
              value={newRecordName}
              onChangeText={setNewRecordName}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Location"
              placeholderTextColor={COLORS.muted}
              value={newRecordLocation}
              onChangeText={setNewRecordLocation}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                onPress={() => setIsModalVisible(false)}
                style={[styles.modalButton, styles.modalCancelButton]}
              >
                <Text style={styles.modalButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleCreateOrUpdate}
                style={[styles.modalButton, styles.modalSaveButton]}
              >
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
  },
  errorText: {
    color: COLORS.error,
    fontSize: 18,
    marginBottom: 20,
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
    backgroundColor: COLORS.background,
  },
  emptyText: {
    color: COLORS.muted,
    fontSize: 18,
    marginBottom: 20,
  },
  createButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 12,
    paddingHorizontal: 25,
    borderRadius: 8,
  },
  createButtonText: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: 'bold',
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
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  addButton: {
    backgroundColor: COLORS.primary,
    width: 35,
    height: 35,
    borderRadius: 17.5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addButtonText: {
    color: COLORS.text,
    fontSize: 24,
    lineHeight: 28,
  },
  searchInput: {
    height: 45,
    backgroundColor: COLORS.card,
    margin: 10,
    borderRadius: 8,
    paddingHorizontal: 15,
    color: COLORS.text,
    fontSize: 16,
  },
  card: {
    backgroundColor: COLORS.card,
    marginHorizontal: 10,
    marginVertical: 6,
    padding: 15,
    borderRadius: 10,
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
  },
  cardText: {
    fontSize: 14,
    color: COLORS.muted,
    marginBottom: 5,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 5,
  },
  statusBadgeText: {
    color: COLORS.background,
    fontSize: 12,
    fontWeight: 'bold',
  },
  actions: {
    flexDirection: 'row',
    marginTop: 10,
    justifyContent: 'flex-end',
  },
  actionButton: {
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 5,
    marginLeft: 10,
  },
  actionButtonText: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: 'bold',
  },
  editButton: {
    backgroundColor: COLORS.primary,
  },
  deleteButton: {
    backgroundColor: COLORS.error,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  modalContent: {
    backgroundColor: COLORS.card,
    padding: 20,
    borderRadius: 10,
    width: '80%',
    borderWidth: 1,
    borderColor: COLORS.border,
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
    backgroundColor: COLORS.background,
    borderRadius: 8,
    paddingHorizontal: 15,
    color: COLORS.text,
    fontSize: 16,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 20,
  },
  modalButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    minWidth: 100,
    alignItems: 'center',
  },
  modalButtonText: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: 'bold',
  },
  modalCancelButton: {
    backgroundColor: COLORS.muted,
  },
  modalSaveButton: {
    backgroundColor: COLORS.primary,
  },
});

export default KioskHealthScreen;
