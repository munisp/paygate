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
  Button,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { trpc } from '../lib/trpc';

// Design system colors
const COLORS = {
  primary: '#6366F1', background: '#0F172A', card: '#1E293B',
  text: '#F1F5F9', muted: '#94A3B8', success: '#10B981',
  error: '#EF4444', warning: '#F59E0B', border: '#334155',
};

// Dummy data for demonstration
interface FloorPlan {
  id: string;
  name: string;
  status: 'Active' | 'Inactive' | 'Draft';
  tables: number;
  lastUpdated: string;
}

const dummyFloorPlans: FloorPlan[] = [
  { id: '1', name: 'Main Dining Area', status: 'Active', tables: 20, lastUpdated: '2026-05-10T10:00:00Z' },
  { id: '2', name: 'Outdoor Patio', status: 'Inactive', tables: 10, lastUpdated: '2026-05-08T14:30:00Z' },
  { id: '3', name: 'Private Room 1', status: 'Draft', tables: 5, lastUpdated: '2026-05-15T09:15:00Z' },
  { id: '4', name: 'Bar Area', status: 'Active', tables: 8, lastUpdated: '2026-05-12T11:00:00Z' },
];

const RestaurantFloorPlanScreen = () => {
  const navigation = useNavigation();
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreateModalVisible, setCreateModalVisible] = useState(false);
  const [isEditModalVisible, setEditModalVisible] = useState(false);
  const [currentFloorPlan, setCurrentFloorPlan] = useState<FloorPlan | null>(null);
  const [newFloorPlanName, setNewFloorPlanName] = useState('');
  const [newFloorPlanTables, setNewFloorPlanTables] = useState('');

  // Simulate tRPC queries and mutations
  const { data, isLoading, isError, refetch } = trpc.restaurantFloorPlan.list.useQuery();
  const createMutation = trpc.restaurantFloorPlan.create.useMutation();
  const updateMutation = trpc.restaurantFloorPlan.update.useMutation();
  const deleteMutation = trpc.restaurantFloorPlan.delete.useMutation();

  // For demonstration, we'll use local state and simulate network delays
  const [floorPlans, setFloorPlans] = useState<FloorPlan[]>(dummyFloorPlans);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1000));
    refetch(); // In a real app, this would refetch data from the backend
    setIsRefreshing(false);
  }, [refetch]);

  const filteredFloorPlans = floorPlans.filter(plan =>
    plan.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleCreateFloorPlan = async () => {
    if (!newFloorPlanName || !newFloorPlanTables) return;
    const newPlan: FloorPlan = {
      id: String(floorPlans.length + 1),
      name: newFloorPlanName,
      status: 'Draft',
      tables: parseInt(newFloorPlanTables, 10) || 0,
      lastUpdated: new Date().toISOString(),
    };
    // Simulate tRPC mutation
    await createMutation.mutateAsync(newPlan);
    setFloorPlans(prev => [...prev, newPlan]);
    setNewFloorPlanName('');
    setNewFloorPlanTables('');
    setCreateModalVisible(false);
  };

  const handleEditFloorPlan = async () => {
    if (!currentFloorPlan || !newFloorPlanName || !newFloorPlanTables) return;
    const updatedPlan = {
      ...currentFloorPlan,
      name: newFloorPlanName,
      tables: parseInt(newFloorPlanTables, 10) || 0,
      lastUpdated: new Date().toISOString(),
    };
    // Simulate tRPC mutation
    await updateMutation.mutateAsync(updatedPlan);
    setFloorPlans(prev =>
      prev.map(plan => (plan.id === updatedPlan.id ? updatedPlan : plan))
    );
    setNewFloorPlanName('');
    setNewFloorPlanTables('');
    setCurrentFloorPlan(null);
    setEditModalVisible(false);
  };

  const handleDeleteFloorPlan = (id: string) => {
    Alert.alert(
      'Delete Floor Plan',
      'Are you sure you want to delete this floor plan?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            // Simulate tRPC mutation
            await deleteMutation.mutateAsync({ id });
            setFloorPlans(prev => prev.filter(plan => plan.id !== id));
          },
        },
      ],
      { cancelable: true }
    );
  };

  const openEditModal = (plan: FloorPlan) => {
    setCurrentFloorPlan(plan);
    setNewFloorPlanName(plan.name);
    setNewFloorPlanTables(String(plan.tables));
    setEditModalVisible(true);
  };

  const renderFloorPlanItem = ({ item }: { item: FloorPlan }) => (
    <View style={styles.itemContainer}>
      <View>
        <Text style={styles.itemName}>{item.name}</Text>
        <Text style={styles.itemDetails}>Tables: {item.tables}</Text>
        <Text style={styles.itemDetails}>Last Updated: {new Date(item.lastUpdated).toLocaleDateString()}</Text>
      </View>
      <View style={styles.itemActions}>
        <View style={[styles.badge, item.status === 'Active' ? styles.badgeActive : item.status === 'Inactive' ? styles.badgeInactive : styles.badgeDraft]}>
          <Text style={styles.badgeText}>{item.status}</Text>
        </View>
        <TouchableOpacity onPress={() => openEditModal(item)} style={styles.actionButton}>
          <Text style={styles.actionButtonText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => handleDeleteFloorPlan(item.id)} style={[styles.actionButton, { backgroundColor: COLORS.error }]}>
          <Text style={styles.actionButtonText}>Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  if (isLoading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading Floor Plans...</Text>
      </SafeAreaView>
    );
  }

  if (isError) {
    return (
      <SafeAreaView style={styles.errorContainer}>
        <Text style={styles.errorText}>Failed to load floor plans.</Text>
        <Button title="Retry" onPress={refetch} color={COLORS.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Restaurant Floor Plans</Text>
        <TouchableOpacity onPress={() => setCreateModalVisible(true)} style={styles.addButton}>
          <Text style={styles.addButtonText}>+ Add Floor Plan</Text>
        </TouchableOpacity>
      </View>

      <TextInput
        style={styles.searchInput}
        placeholder="Search floor plans..."
        placeholderTextColor={COLORS.muted}
        value={searchQuery}
        onChangeText={setSearchQuery}
      />

      {filteredFloorPlans.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No floor plans found.</Text>
          <Button title="Create New Floor Plan" onPress={() => setCreateModalVisible(true)} color={COLORS.primary} />
        </View>
      ) : (
        <FlatList
          data={filteredFloorPlans}
          keyExtractor={(item) => item.id}
          renderItem={renderFloorPlanItem}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={onRefresh}
              tintColor={COLORS.primary}
              colors={[COLORS.primary]}
              progressBackgroundColor={COLORS.card}
            />
          }
        />
      )}

      {/* Create Floor Plan Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isCreateModalVisible}
        onRequestClose={() => setCreateModalVisible(false)}
      >
        <View style={styles.centeredView}>
          <View style={styles.modalView}>
            <Text style={styles.modalTitle}>Create New Floor Plan</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Floor Plan Name"
              placeholderTextColor={COLORS.muted}
              value={newFloorPlanName}
              onChangeText={setNewFloorPlanName}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Number of Tables"
              placeholderTextColor={COLORS.muted}
              keyboardType="numeric"
              value={newFloorPlanTables}
              onChangeText={setNewFloorPlanTables}
            />
            <View style={styles.modalButtonContainer}>
              <Button title="Cancel" onPress={() => setCreateModalVisible(false)} color={COLORS.muted} />
              <Button title="Create" onPress={handleCreateFloorPlan} color={COLORS.primary} />
            </View>
          </View>
        </View>
      </Modal>

      {/* Edit Floor Plan Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isEditModalVisible}
        onRequestClose={() => setEditModalVisible(false)}
      >
        <View style={styles.centeredView}>
          <View style={styles.modalView}>
            <Text style={styles.modalTitle}>Edit Floor Plan</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Floor Plan Name"
              placeholderTextColor={COLORS.muted}
              value={newFloorPlanName}
              onChangeText={setNewFloorPlanName}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Number of Tables"
              placeholderTextColor={COLORS.muted}
              keyboardType="numeric"
              value={newFloorPlanTables}
              onChangeText={setNewFloorPlanTables}
            />
            <View style={styles.modalButtonContainer}>
              <Button title="Cancel" onPress={() => setEditModalVisible(false)} color={COLORS.muted} />
              <Button title="Save Changes" onPress={handleEditFloorPlan} color={COLORS.primary} />
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
  addButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 5,
  },
  addButtonText: {
    color: COLORS.text,
    fontWeight: 'bold',
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
  itemContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    padding: 15,
    borderRadius: 8,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  itemName: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: 'bold',
  },
  itemDetails: {
    color: COLORS.muted,
    fontSize: 14,
    marginTop: 5,
  },
  itemActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  badge: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 15,
  },
  badgeActive: {
    backgroundColor: COLORS.success,
  },
  badgeInactive: {
    backgroundColor: COLORS.error,
  },
  badgeDraft: {
    backgroundColor: COLORS.warning,
  },
  badgeText: {
    color: COLORS.background,
    fontSize: 12,
    fontWeight: 'bold',
  },
  actionButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 5,
  },
  actionButtonText: {
    color: COLORS.text,
    fontSize: 14,
  },
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
    width: '80%',
  },
  modalTitle: {
    marginBottom: 15,
    textAlign: 'center',
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  modalInput: {
    height: 40,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 8,
    marginBottom: 15,
    paddingHorizontal: 10,
    color: COLORS.text,
    width: '100%',
    backgroundColor: COLORS.card,
  },
  modalButtonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    marginTop: 10,
  },
});

export default RestaurantFloorPlanScreen;
