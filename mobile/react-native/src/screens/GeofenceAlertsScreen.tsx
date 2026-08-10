import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  SafeAreaView,
  StatusBar,
  RefreshControl,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { trpc } from '../lib/trpc';

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

interface GeofenceAlert {
  id: string;
  name: string;
  radius: number;
  triggerEvent: 'ENTER' | 'EXIT' | 'ANY';
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: string;
}

export default function GeofenceAlertsScreen() {
  const navigation = useNavigation();
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingAlert, setEditingAlert] = useState<GeofenceAlert | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    radius: '100',
    triggerEvent: 'ANY' as 'ENTER' | 'EXIT' | 'ANY',
    status: 'ACTIVE' as 'ACTIVE' | 'INACTIVE',
  });

  const { data: alerts, isLoading, isError, refetch, isRefetching } = trpc.geofenceAlerts.list.useQuery();
  const utils = trpc.useContext();

  const createMutation = trpc.geofenceAlerts.create.useMutation({
    onSuccess: () => {
      utils.geofenceAlerts.list.invalidate();
      closeModal();
      Alert.alert('Success', 'Geofence alert created successfully');
    },
    onError: (error) => {
      Alert.alert('Error', error.message || 'Failed to create geofence alert');
    },
  });

  const updateMutation = trpc.geofenceAlerts.update.useMutation({
    onSuccess: () => {
      utils.geofenceAlerts.list.invalidate();
      closeModal();
      Alert.alert('Success', 'Geofence alert updated successfully');
    },
    onError: (error) => {
      Alert.alert('Error', error.message || 'Failed to update geofence alert');
    },
  });

  const deleteMutation = trpc.geofenceAlerts.delete.useMutation({
    onSuccess: () => {
      utils.geofenceAlerts.list.invalidate();
      Alert.alert('Success', 'Geofence alert deleted successfully');
    },
    onError: (error) => {
      Alert.alert('Error', error.message || 'Failed to delete geofence alert');
    },
  });

  const filteredAlerts = useMemo(() => {
    if (!alerts) return [];
    return alerts.filter((alert: GeofenceAlert) =>
      alert.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [alerts, searchQuery]);

  const openModal = (alert?: GeofenceAlert) => {
    if (alert) {
      setEditingAlert(alert);
      setFormData({
        name: alert.name,
        radius: alert.radius.toString(),
        triggerEvent: alert.triggerEvent,
        status: alert.status,
      });
    } else {
      setEditingAlert(null);
      setFormData({
        name: '',
        radius: '100',
        triggerEvent: 'ANY',
        status: 'ACTIVE',
      });
    }
    setIsModalVisible(true);
  };

  const closeModal = () => {
    setIsModalVisible(false);
    setEditingAlert(null);
  };

  const handleSave = () => {
    if (!formData.name.trim()) {
      Alert.alert('Validation Error', 'Name is required');
      return;
    }
    
    const radiusNum = parseInt(formData.radius, 10);
    if (isNaN(radiusNum) || radiusNum <= 0) {
      Alert.alert('Validation Error', 'Radius must be a positive number');
      return;
    }

    if (editingAlert) {
      updateMutation.mutate({
        id: editingAlert.id,
        name: formData.name,
        radius: radiusNum,
        triggerEvent: formData.triggerEvent,
        status: formData.status,
      });
    } else {
      createMutation.mutate({
        name: formData.name,
        radius: radiusNum,
        triggerEvent: formData.triggerEvent,
        status: formData.status,
      });
    }
  };

  const handleDelete = (id: string) => {
    Alert.alert(
      'Delete Alert',
      'Are you sure you want to delete this geofence alert?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Delete', 
          style: 'destructive',
          onPress: () => deleteMutation.mutate({ id })
        },
      ]
    );
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const renderAlertItem = ({ item }: { item: GeofenceAlert }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>{item.name}</Text>
        <View style={[
          styles.statusBadge, 
          { backgroundColor: item.status === 'ACTIVE' ? COLORS.success + '20' : COLORS.muted + '20' }
        ]}>
          <Text style={[
            styles.statusText,
            { color: item.status === 'ACTIVE' ? COLORS.success : COLORS.muted }
          ]}>
            {item.status}
          </Text>
        </View>
      </View>
      
      <View style={styles.cardBody}>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Radius:</Text>
          <Text style={styles.infoValue}>{item.radius}m</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Trigger:</Text>
          <Text style={styles.infoValue}>{item.triggerEvent}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Created:</Text>
          <Text style={styles.infoValue}>{formatDate(item.createdAt)}</Text>
        </View>
      </View>

      <View style={styles.cardActions}>
        <TouchableOpacity 
          style={[styles.actionButton, styles.editButton]} 
          onPress={() => openModal(item)}
        >
          <Text style={styles.actionButtonText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.actionButton, styles.deleteButton]} 
          onPress={() => handleDelete(item.id)}
        >
          <Text style={styles.actionButtonText}>Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Geofence Alerts</Text>
        <TouchableOpacity style={styles.addButton} onPress={() => openModal()}>
          <Text style={styles.addButtonText}>+ New Alert</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search alerts..."
          placeholderTextColor={COLORS.muted}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      {isLoading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : isError ? (
        <View style={styles.centerContainer}>
          <Text style={styles.errorText}>Failed to load geofence alerts.</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => refetch()}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={filteredAlerts}
          keyExtractor={(item) => item.id}
          renderItem={renderAlertItem}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor={COLORS.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>
                {searchQuery ? 'No alerts match your search.' : 'No geofence alerts found.'}
              </Text>
            </View>
          }
        />
      )}

      <Modal
        visible={isModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={closeModal}
      >
        <KeyboardAvoidingView 
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingAlert ? 'Edit Alert' : 'New Alert'}
              </Text>
              <TouchableOpacity onPress={closeModal}>
                <Text style={styles.closeButton}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalForm}>
              <Text style={styles.inputLabel}>Name</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., Downtown Branch"
                placeholderTextColor={COLORS.muted}
                value={formData.name}
                onChangeText={(text) => setFormData({ ...formData, name: text })}
              />

              <Text style={styles.inputLabel}>Radius (meters)</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., 100"
                placeholderTextColor={COLORS.muted}
                keyboardType="numeric"
                value={formData.radius}
                onChangeText={(text) => setFormData({ ...formData, radius: text })}
              />

              <Text style={styles.inputLabel}>Trigger Event</Text>
              <View style={styles.segmentedControl}>
                {['ENTER', 'EXIT', 'ANY'].map((type) => (
                  <TouchableOpacity
                    key={type}
                    style={[
                      styles.segmentButton,
                      formData.triggerEvent === type && styles.segmentButtonActive
                    ]}
                    onPress={() => setFormData({ ...formData, triggerEvent: type as any })}
                  >
                    <Text style={[
                      styles.segmentText,
                      formData.triggerEvent === type && styles.segmentTextActive
                    ]}>
                      {type}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.inputLabel}>Status</Text>
              <View style={styles.segmentedControl}>
                {['ACTIVE', 'INACTIVE'].map((status) => (
                  <TouchableOpacity
                    key={status}
                    style={[
                      styles.segmentButton,
                      formData.status === status && styles.segmentButtonActive
                    ]}
                    onPress={() => setFormData({ ...formData, status: status as any })}
                  >
                    <Text style={[
                      styles.segmentText,
                      formData.status === status && styles.segmentTextActive
                    ]}>
                      {status}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity 
                style={styles.cancelButton} 
                onPress={closeModal}
                disabled={createMutation.isLoading || updateMutation.isLoading}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.saveButton} 
                onPress={handleSave}
                disabled={createMutation.isLoading || updateMutation.isLoading}
              >
                {createMutation.isLoading || updateMutation.isLoading ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <Text style={styles.saveButtonText}>Save</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

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
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  addButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
  },
  addButtonText: {
    color: '#FFF',
    fontWeight: '600',
    fontSize: 14,
  },
  searchContainer: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  searchInput: {
    backgroundColor: COLORS.card,
    color: COLORS.text,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    color: COLORS.error,
    fontSize: 16,
    marginBottom: 12,
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: COLORS.card,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  retryButtonText: {
    color: COLORS.text,
    fontWeight: '500',
  },
  listContent: {
    padding: 16,
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    color: COLORS.muted,
    fontSize: 16,
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.text,
    flex: 1,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    marginLeft: 8,
  },
  statusText: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  cardBody: {
    marginBottom: 16,
  },
  infoRow: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  infoLabel: {
    color: COLORS.muted,
    width: 80,
    fontSize: 14,
  },
  infoValue: {
    color: COLORS.text,
    fontSize: 14,
    flex: 1,
  },
  cardActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: 12,
  },
  actionButton: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 6,
    marginLeft: 8,
  },
  editButton: {
    backgroundColor: COLORS.primary + '20',
  },
  deleteButton: {
    backgroundColor: COLORS.error + '20',
  },
  actionButtonText: {
    fontWeight: '500',
    color: COLORS.text,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: COLORS.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  closeButton: {
    fontSize: 20,
    color: COLORS.muted,
    padding: 4,
  },
  modalForm: {
    padding: 20,
  },
  inputLabel: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 8,
    marginTop: 16,
  },
  input: {
    backgroundColor: COLORS.card,
    color: COLORS.text,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  segmentedControl: {
    flexDirection: 'row',
    backgroundColor: COLORS.card,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },
  segmentButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
  },
  segmentButtonActive: {
    backgroundColor: COLORS.primary,
  },
  segmentText: {
    color: COLORS.muted,
    fontWeight: '500',
  },
  segmentTextActive: {
    color: '#FFF',
  },
  modalFooter: {
    flexDirection: 'row',
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    marginRight: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cancelButtonText: {
    color: COLORS.text,
    fontWeight: '600',
  },
  saveButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    marginLeft: 8,
    borderRadius: 8,
    backgroundColor: COLORS.primary,
  },
  saveButtonText: {
    color: '#FFF',
    fontWeight: '600',
  },
});
