import React, { useState, useEffect, useCallback } from 'react';
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
  Button,
  Platform,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
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

// Helper for date formatting
const formatDate = (dateString: string) => {
  const options: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short', day: 'numeric' };
  return new Date(dateString).toLocaleDateString(undefined, options);
};

// Helper for currency formatting (assuming Naira as default, can be extended)
const formatCurrency = (amount: number, currency: 'NGN' | 'USD' = 'NGN') => {
  if (currency === 'NGN') {
    return `₦${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  } else if (currency === 'USD') {
    return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return amount.toString();
};

type RailMonitorItem = {
  id: string;
  railId: string;
  originCountry: string;
  destinationCountry: string;
  status: 'Active' | 'Inactive' | 'Maintenance' | 'Delayed';
  lastUpdated: string;
  capacity: number;
  currentLoad: number;
  costPerUnit: number;
};

const CrossBorderRailMonitorScreen = () => {
  const navigation = useNavigation();
  const route = useRoute();

  const [searchQuery, setSearchQuery] = useState('');
  const [isCreateModalVisible, setCreateModalVisible] = useState(false);
  const [isEditModalVisible, setEditModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState<RailMonitorItem | null>(null);

  // tRPC queries and mutations
  const { data, isLoading, isError, error, refetch } = trpc.crossBorderRail.list.useQuery();
  const createMutation = trpc.crossBorderRail.create.useMutation();
  const updateMutation = trpc.crossBorderRail.update.useMutation();
  const deleteMutation = trpc.crossBorderRail.delete.useMutation();

  const onRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  useEffect(() => {
    if (createMutation.isSuccess || updateMutation.isSuccess || deleteMutation.isSuccess) {
      refetch();
      setCreateModalVisible(false);
      setEditModalVisible(false);
    }
    if (createMutation.isError) Alert.alert('Error', createMutation.error?.message || 'Failed to create item.');
    if (updateMutation.isError) Alert.alert('Error', updateMutation.error?.message || 'Failed to update item.');
    if (deleteMutation.isError) Alert.alert('Error', deleteMutation.error?.message || 'Failed to delete item.');
  }, [createMutation.isSuccess, createMutation.isError, createMutation.error, updateMutation.isSuccess, updateMutation.isError, updateMutation.error, deleteMutation.isSuccess, deleteMutation.isError, deleteMutation.error, refetch]);

  const filteredData = data?.filter(item =>
    item.railId.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.originCountry.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.destinationCountry.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.status.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleDelete = (id: string) => {
    Alert.alert(
      'Confirm Delete',
      'Are you sure you want to delete this rail monitor entry?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deleteMutation.mutate({ id }) },
      ],
      { cancelable: true }
    );
  };

  const handleCreateSubmit = (newItem: Omit<RailMonitorItem, 'id'>) => {
    createMutation.mutate(newItem);
  };

  const handleEditSubmit = (updatedItem: RailMonitorItem) => {
    updateMutation.mutate(updatedItem);
  };

  const renderItem = ({ item }: { item: RailMonitorItem }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>Rail ID: {item.railId}</Text>
        <View style={[styles.statusBadge, {
          backgroundColor: item.status === 'Active' ? COLORS.success :
            item.status === 'Delayed' ? COLORS.warning :
              item.status === 'Maintenance' ? COLORS.muted :
                COLORS.error
        }]}>
          <Text style={styles.statusText}>{item.status}</Text>
        </View>
      </View>
      <Text style={styles.cardText}>Origin: {item.originCountry}</Text>
      <Text style={styles.cardText}>Destination: {item.destinationCountry}</Text>
      <Text style={styles.cardText}>Capacity: {item.currentLoad}/{item.capacity}</Text>
      <Text style={styles.cardText}>Cost per Unit: {formatCurrency(item.costPerUnit, 'USD')}</Text>
      <Text style={styles.cardText}>Last Updated: {formatDate(item.lastUpdated)}</Text>
      <View style={styles.cardActions}>
        <TouchableOpacity
          style={[styles.actionButton, { backgroundColor: COLORS.primary }]} 
          onPress={() => {
            setEditingItem(item);
            setEditModalVisible(true);
          }}
        >
          <Text style={styles.actionButtonText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionButton, { backgroundColor: COLORS.error, marginLeft: 10 }]} 
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
        <Text style={styles.loadingText}>Loading rail monitor data...</Text>
      </SafeAreaView>
    );
  }

  if (isError) {
    return (
      <SafeAreaView style={styles.errorContainer}>
        <Text style={styles.errorText}>Error: {error?.message || 'Failed to fetch data'}</Text>
        <Button title="Retry" onPress={() => refetch()} color={COLORS.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Cross-Border Rail Monitor</Text>
        <TouchableOpacity style={styles.createButton} onPress={() => setCreateModalVisible(true)}>
          <Text style={styles.createButtonText}>+ Add Rail</Text>
        </TouchableOpacity>
      </View>
      <TextInput
        style={styles.searchInput}
        placeholder="Search by Rail ID, Country, Status..."
        placeholderTextColor={COLORS.muted}
        value={searchQuery}
        onChangeText={setSearchQuery}
      />
      {filteredData && filteredData.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No rail monitor data found.</Text>
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
              refreshing={isLoading}
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
        <CreateEditRailModal
          onClose={() => setCreateModalVisible(false)}
          onSubmit={handleCreateSubmit}
          isSubmitting={createMutation.isLoading}
          title="Add New Rail Entry"
        />
      </Modal>

      {/* Edit Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isEditModalVisible}
        onRequestClose={() => setEditModalVisible(false)}
      >
        <CreateEditRailModal
          onClose={() => setEditModalVisible(false)}
          onSubmit={handleEditSubmit}
          initialData={editingItem}
          isSubmitting={updateMutation.isLoading}
          title="Edit Rail Entry"
        />
      </Modal>
    </SafeAreaView>
  );
};

// Reusable Modal for Create and Edit
type CreateEditRailModalProps = {
  onClose: () => void;
  onSubmit: (item: any) => void;
  initialData?: RailMonitorItem | null;
  isSubmitting: boolean;
  title: string;
};

const CreateEditRailModal = ({ onClose, onSubmit, initialData, isSubmitting, title }: CreateEditRailModalProps) => {
  const [railId, setRailId] = useState(initialData?.railId || '');
  const [originCountry, setOriginCountry] = useState(initialData?.originCountry || '');
  const [destinationCountry, setDestinationCountry] = useState(initialData?.destinationCountry || '');
  const [status, setStatus] = useState<'Active' | 'Inactive' | 'Maintenance' | 'Delayed'>(initialData?.status || 'Active');
  const [capacity, setCapacity] = useState(initialData?.capacity?.toString() || '');
  const [currentLoad, setCurrentLoad] = useState(initialData?.currentLoad?.toString() || '');
  const [costPerUnit, setCostPerUnit] = useState(initialData?.costPerUnit?.toString() || '');

  const handleSubmit = () => {
    if (!railId || !originCountry || !destinationCountry || !capacity || !currentLoad || !costPerUnit) {
      Alert.alert('Validation Error', 'All fields are required.');
      return;
    }
    const itemToSubmit = {
      id: initialData?.id || '', // Only include ID if it's an update
      railId,
      originCountry,
      destinationCountry,
      status,
      lastUpdated: new Date().toISOString(), // Auto-update lastUpdated
      capacity: parseInt(capacity, 10),
      currentLoad: parseInt(currentLoad, 10),
      costPerUnit: parseFloat(costPerUnit),
    };
    onSubmit(itemToSubmit);
  };

  return (
    <View style={modalStyles.centeredView}>
      <View style={modalStyles.modalView}>
        <Text style={modalStyles.modalTitle}>{title}</Text>
        <TextInput
          style={modalStyles.input}
          placeholder="Rail ID" 
          placeholderTextColor={COLORS.muted}
          value={railId}
          onChangeText={setRailId}
        />
        <TextInput
          style={modalStyles.input}
placeholder="Origin Country" 
          placeholderTextColor={COLORS.muted}
          value={originCountry}
          onChangeText={setOriginCountry}
        />
        <TextInput
          style={modalStyles.input}
          placeholder="Destination Country" 
          placeholderTextColor={COLORS.muted}
          value={destinationCountry}
          onChangeText={setDestinationCountry}
        />
        {/* Simple status picker, could be improved with a custom component */}
        <View style={modalStyles.pickerContainer}>
          <Text style={modalStyles.pickerLabel}>Status:</Text>
          <Picker
            selectedValue={status}
            onValueChange={(itemValue) => setStatus(itemValue)}
            style={modalStyles.picker}
            itemStyle={modalStyles.pickerItem}
          >
            <Picker.Item label="Active" value="Active" />
            <Picker.Item label="Inactive" value="Inactive" />
            <Picker.Item label="Maintenance" value="Maintenance" />
            <Picker.Item label="Delayed" value="Delayed" />
          </Picker>
        </View>
        <TextInput
          style={modalStyles.input}
          placeholder="Capacity" 
          placeholderTextColor={COLORS.muted}
          value={capacity}
          onChangeText={setCapacity}
          keyboardType="numeric"
        />
        <TextInput
          style={modalStyles.input}
          placeholder="Current Load" 
          placeholderTextColor={COLORS.muted}
          value={currentLoad}
          onChangeText={setCurrentLoad}
          keyboardType="numeric"
        />
        <TextInput
          style={modalStyles.input}
          placeholder="Cost Per Unit (USD)" 
          placeholderTextColor={COLORS.muted}
          value={costPerUnit}
          onChangeText={setCostPerUnit}
          keyboardType="numeric"
        />
        <View style={modalStyles.buttonContainer}>
          <Button title="Cancel" onPress={onClose} color={COLORS.muted} />
          <Button title={isSubmitting ? 'Saving...' : 'Save'} onPress={handleSubmit} color={COLORS.primary} disabled={isSubmitting} />
        </View>
      </View>
    </View>
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
    paddingBottom: 20,
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
    color: COLORS.text,
    fontSize: 18,
    fontWeight: 'bold',
  },
  statusBadge: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 15,
  },
  statusText: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: 'bold',
  },
  cardText: {
    color: COLORS.muted,
    fontSize: 14,
    marginBottom: 5,
  },
  cardActions: {
    flexDirection: 'row',
    marginTop: 10,
    justifyContent: 'flex-end',
  },
  actionButton: {
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 5,
  },
  actionButtonText: {
    color: COLORS.text,
    fontWeight: 'bold',
  },
});

const modalStyles = StyleSheet.create({
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
    marginBottom: 15,
    textAlign: 'center',
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  input: {
    height: 40,
    width: '100%',
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 8,
    marginBottom: 15,
    paddingHorizontal: 10,
    color: COLORS.text,
    backgroundColor: COLORS.card,
  },
  pickerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    marginBottom: 15,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 8,
    backgroundColor: COLORS.card,
    overflow: 'hidden', // Ensures picker doesn't overflow rounded corners
  },
  pickerLabel: {
    color: COLORS.muted,
    paddingLeft: 10,
  },
  picker: {
    flex: 1,
    height: 40,
    color: COLORS.text,
  },
  pickerItem: {
    color: COLORS.text, // This might not work on all platforms directly
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    marginTop: 20,
  },
});

// Conditional import for Picker to avoid errors on web/other platforms if not needed
let Picker: any;
if (Platform.OS === 'ios' || Platform.OS === 'android') {
  try {
    Picker = require('@react-native-picker/picker').Picker;
  } catch (e) {
    console.warn('[@react-native-picker/picker] not found. Please install it for native platforms.');
    Picker = ({ children }: { children: React.ReactNode }) => <View>{children}</View>; // Fallback
  }
} else {
  Picker = ({ children }: { children: React.ReactNode }) => <View>{children}</View>; // Fallback for non-native
}

export default CrossBorderRailMonitorScreen;
